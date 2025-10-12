/**
 * Email Retry Service
 * 
 * Manages retry queue for failed email sends with intelligent retry logic:
 * - Exponential backoff for transient failures
 * - Permanent failure detection and handling
 * - Rate limiting and circuit breaker integration
 * - Retry statistics and monitoring
 * - Dead letter queue for permanently failed emails
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { Queue, Worker, type Job } from 'bullmq';
import { emailService } from './email.service';
import type { TemplateKey } from './templates';

export interface RetryableEmail {
  id: string;
  recipientEmail: string;
  recipientUserId?: string;
  subject: string;
  template: TemplateKey;
  variables?: Record<string, any>;
  tags?: Record<string, string>;
  attemptCount: number;
  lastError?: string;
  nextRetryAt: Date;
  originalSendTime: Date;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 60000, // 1 minute
  maxDelayMs: 3600000, // 1 hour
  backoffMultiplier: 2,
};

/**
 * BullMQ queue for email retries
 */
export const emailRetryQueue = new Queue('email-retry', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1, // We handle retries manually for better control
    removeOnComplete: 1000,
    removeOnFail: 2000,
  },
});

export class EmailRetryService {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Add failed email to retry queue
   */
  async addToRetryQueue(params: {
    recipientEmail: string;
    recipientUserId?: string;
    subject: string;
    template: TemplateKey;
    variables?: Record<string, any>;
    tags?: Record<string, string>;
    error: Error;
    attemptCount?: number;
  }): Promise<string | null> {
    const currentAttempt = params.attemptCount || 1;

    // Check if we've exceeded max attempts
    if (currentAttempt >= this.config.maxAttempts) {
      console.warn(
        `[EmailRetry] Max retry attempts (${this.config.maxAttempts}) reached for ${params.recipientEmail}`
      );
      await this.moveToDeadLetterQueue(params);
      return null;
    }

    // Determine if error is retryable
    if (!this.isRetryableError(params.error)) {
      console.warn(
        `[EmailRetry] Non-retryable error for ${params.recipientEmail}: ${params.error.message}`
      );
      await this.moveToDeadLetterQueue(params);
      return null;
    }

    // Calculate next retry delay with exponential backoff
    const delay = this.calculateRetryDelay(currentAttempt);
    const nextRetryAt = new Date(Date.now() + delay);

    // Store retry attempt in database for tracking
    const retryRecord = await prisma.$executeRaw`
      INSERT INTO email_retry_queue (
        recipient_email,
        recipient_user_id,
        subject,
        template_name,
        template_variables,
        tags,
        attempt_count,
        last_error,
        next_retry_at,
        original_send_time,
        created_at,
        updated_at
      ) VALUES (
        ${params.recipientEmail},
        ${params.recipientUserId},
        ${params.subject},
        ${params.template},
        ${JSON.stringify(params.variables || {})},
        ${JSON.stringify(params.tags || {})},
        ${currentAttempt},
        ${params.error.message},
        ${nextRetryAt},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (recipient_email, template_name) 
      DO UPDATE SET
        attempt_count = ${currentAttempt},
        last_error = ${params.error.message},
        next_retry_at = ${nextRetryAt},
        updated_at = NOW()
      RETURNING id
    `;

    // Queue for retry
    const job = await emailRetryQueue.add(
      'retry-email',
      {
        recipientEmail: params.recipientEmail,
        recipientUserId: params.recipientUserId,
        subject: params.subject,
        template: params.template,
        variables: params.variables,
        tags: params.tags,
        attemptCount: currentAttempt,
      },
      {
        delay,
        jobId: `retry-${params.recipientEmail}-${params.template}-${currentAttempt}`,
      }
    );

    console.log(
      `[EmailRetry] Queued retry ${currentAttempt}/${this.config.maxAttempts} for ${params.recipientEmail} (delay: ${delay}ms)`
    );

    return job.id || null;
  }

  /**
   * Process retry attempt
   */
  async processRetry(job: Job): Promise<void> {
    const {
      recipientEmail,
      recipientUserId,
      subject,
      template,
      variables,
      tags,
      attemptCount,
    } = job.data;

    console.log(
      `[EmailRetry] Attempting retry ${attemptCount} for ${recipientEmail}`
    );

    try {
      // Attempt to send email
      const result = await emailService.sendTransactional({
        userId: recipientUserId,
        email: recipientEmail,
        subject,
        template,
        variables,
        tags: {
          ...tags,
          retry_attempt: attemptCount.toString(),
        },
      });

      if (result.success) {
        // Success! Remove from retry queue
        await this.removeFromRetryQueue(recipientEmail, template);

        console.log(
          `[EmailRetry] Successfully sent email to ${recipientEmail} on attempt ${attemptCount}`
        );

        // Track retry success metric
        await this.trackRetryMetric('success', attemptCount);
      } else {
        // Failed again, requeue if possible
        throw new Error(result.error || 'Email send failed');
      }
    } catch (error) {
      console.error(
        `[EmailRetry] Retry attempt ${attemptCount} failed for ${recipientEmail}:`,
        error
      );

      // Track retry failure metric
      await this.trackRetryMetric('failed', attemptCount);

      // Add back to retry queue with incremented attempt count
      await this.addToRetryQueue({
        recipientEmail,
        recipientUserId,
        subject,
        template,
        variables,
        tags,
        error: error as Error,
        attemptCount: attemptCount + 1,
      });
    }
  }

  /**
   * Calculate retry delay using exponential backoff
   */
  private calculateRetryDelay(attemptCount: number): number {
    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attemptCount - 1),
      this.config.maxDelayMs
    );

    // Add jitter (±10%) to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /rate.*limit/i,
      /timeout/i,
      /network/i,
      /connection/i,
      /unavailable/i,
      /temporary/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
    ];

    const nonRetryablePatterns = [
      /invalid.*email/i,
      /suppressed/i,
      /unsubscribed/i,
      /bounced/i,
      /invalid.*api.*key/i,
      /authentication/i,
      /permission/i,
    ];

    const errorMessage = error.message || error.toString();

    // Check for non-retryable errors first
    if (nonRetryablePatterns.some(pattern => pattern.test(errorMessage))) {
      return false;
    }

    // Check for retryable errors
    if (retryablePatterns.some(pattern => pattern.test(errorMessage))) {
      return true;
    }

    // Check error name/code
    const errorName = (error as any).name || '';
    const errorCode = (error as any).code || '';

    const retryableNames = ['NetworkError', 'TimeoutError', 'ConnectionError'];
    if (retryableNames.includes(errorName)) {
      return true;
    }

    // HTTP status codes (if available)
    const statusCode = (error as any).statusCode || (error as any).status;
    if (statusCode) {
      // 5xx errors are generally retryable
      if (statusCode >= 500 && statusCode < 600) {
        return true;
      }
      // 429 (Too Many Requests) is retryable
      if (statusCode === 429) {
        return true;
      }
      // 4xx errors are generally not retryable (except 429)
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
    }

    // Default: retry for unknown errors (conservative approach)
    return true;
  }

  /**
   * Move permanently failed email to dead letter queue
   */
  private async moveToDeadLetterQueue(params: {
    recipientEmail: string;
    subject: string;
    template: TemplateKey;
    variables?: Record<string, any>;
    error: Error;
  }): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO email_dead_letter_queue (
          recipient_email,
          subject,
          template_name,
          template_variables,
          final_error,
          failed_at,
          created_at
        ) VALUES (
          ${params.recipientEmail},
          ${params.subject},
          ${params.template},
          ${JSON.stringify(params.variables || {})},
          ${params.error.message},
          NOW(),
          NOW()
        )
      `;

      console.warn(
        `[EmailRetry] Moved to dead letter queue: ${params.recipientEmail} (${params.template})`
      );

      // Send alert for dead letter queue item
      await this.alertDeadLetterQueue(params);
    } catch (error) {
      console.error('[EmailRetry] Error moving to dead letter queue:', error);
    }
  }

  /**
   * Remove successfully sent email from retry queue
   */
  private async removeFromRetryQueue(email: string, template: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        DELETE FROM email_retry_queue
        WHERE recipient_email = ${email}
        AND template_name = ${template}
      `;
    } catch (error) {
      console.error('[EmailRetry] Error removing from retry queue:', error);
    }
  }

  /**
   * Get retry queue statistics
   */
  async getRetryStats(): Promise<{
    totalInQueue: number;
    byAttemptCount: Record<number, number>;
    oldestRetry: Date | null;
    retryRate: number;
  }> {
    try {
      const stats = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total,
          MIN(next_retry_at) as oldest_retry
        FROM email_retry_queue
      `;

      const attemptCounts = await prisma.$queryRaw<any[]>`
        SELECT 
          attempt_count,
          COUNT(*) as count
        FROM email_retry_queue
        GROUP BY attempt_count
        ORDER BY attempt_count
      `;

      const byAttemptCount = attemptCounts.reduce((acc, row) => {
        acc[row.attempt_count] = parseInt(row.count);
        return acc;
      }, {} as Record<number, number>);

      // Calculate retry rate (successful retries / total retry attempts in last 24h)
      const retryRate = await this.calculateRetrySuccessRate();

      return {
        totalInQueue: parseInt(stats[0]?.total || '0'),
        byAttemptCount,
        oldestRetry: stats[0]?.oldest_retry || null,
        retryRate,
      };
    } catch (error) {
      console.error('[EmailRetry] Error getting retry stats:', error);
      return {
        totalInQueue: 0,
        byAttemptCount: {},
        oldestRetry: null,
        retryRate: 0,
      };
    }
  }

  /**
   * Calculate retry success rate
   */
  private async calculateRetrySuccessRate(): Promise<number> {
    const cacheKey = 'email:retry:success-rate';
    const cached = await redis.get(cacheKey);
    if (cached) return parseFloat(cached);

    try {
      const metrics = await prisma.$queryRaw<any[]>`
        SELECT 
          SUM(CASE WHEN metric_type = 'success' THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN metric_type = 'failed' THEN 1 ELSE 0 END) as failures
        FROM email_retry_metrics
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `;

      const successes = parseInt(metrics[0]?.successes || '0');
      const failures = parseInt(metrics[0]?.failures || '0');
      const total = successes + failures;

      const rate = total > 0 ? (successes / total) * 100 : 0;

      // Cache for 5 minutes
      await redis.set(cacheKey, rate.toString(), 'EX', 300);

      return rate;
    } catch (error) {
      console.error('[EmailRetry] Error calculating retry success rate:', error);
      return 0;
    }
  }

  /**
   * Track retry metric
   */
  private async trackRetryMetric(
    metricType: 'success' | 'failed',
    attemptCount: number
  ): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO email_retry_metrics (
          metric_type,
          attempt_count,
          created_at
        ) VALUES (
          ${metricType},
          ${attemptCount},
          NOW()
        )
      `;
    } catch (error) {
      // Don't fail the retry process if metric tracking fails
      console.error('[EmailRetry] Error tracking retry metric:', error);
    }
  }

  /**
   * Alert about dead letter queue item
   */
  private async alertDeadLetterQueue(params: {
    recipientEmail: string;
    template: string;
    error: Error;
  }): Promise<void> {
    // In production, send alert to monitoring system or admin email
    console.error('[EmailRetry] ALERT: Email moved to dead letter queue', {
      email: params.recipientEmail,
      template: params.template,
      error: params.error.message,
    });

    // Track in Redis for monitoring dashboard
    await redis.incr('email:dlq:count');
    await redis.expire('email:dlq:count', 86400); // Reset daily
  }

  /**
   * Get dead letter queue items
   */
  async getDeadLetterQueue(limit: number = 100): Promise<any[]> {
    try {
      return await prisma.$queryRaw`
        SELECT *
        FROM email_dead_letter_queue
        ORDER BY failed_at DESC
        LIMIT ${limit}
      `;
    } catch (error) {
      console.error('[EmailRetry] Error getting dead letter queue:', error);
      return [];
    }
  }

  /**
   * Retry all emails in dead letter queue (manual intervention)
   */
  async retryDeadLetterQueue(emailIds: string[]): Promise<void> {
    for (const id of emailIds) {
      try {
        const record = await prisma.$queryRaw<any[]>`
          SELECT * FROM email_dead_letter_queue WHERE id = ${id}
        `;

        if (record.length === 0) continue;

        const item = record[0];

        // Re-add to retry queue with reset attempt count
        await this.addToRetryQueue({
          recipientEmail: item.recipient_email,
          subject: item.subject,
          template: item.template_name,
          variables: item.template_variables,
          tags: {},
          error: new Error('Manual retry from DLQ'),
          attemptCount: 0,
        });

        // Remove from DLQ
        await prisma.$executeRaw`
          DELETE FROM email_dead_letter_queue WHERE id = ${id}
        `;

        console.log(`[EmailRetry] Re-queued DLQ item ${id}`);
      } catch (error) {
        console.error(`[EmailRetry] Error retrying DLQ item ${id}:`, error);
      }
    }
  }
}

/**
 * BullMQ worker for processing email retries
 */
export const emailRetryWorker = new Worker(
  'email-retry',
  async (job: Job) => {
    const retryService = new EmailRetryService();
    await retryService.processRetry(job);
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 retries concurrently
  }
);

// Handle worker events
emailRetryWorker.on('completed', (job) => {
  console.log(`[EmailRetryWorker] Job ${job.id} completed`);
});

emailRetryWorker.on('failed', (job, err) => {
  console.error(`[EmailRetryWorker] Job ${job?.id} failed:`, err.message);
});

// Export singleton instance
export const emailRetryService = new EmailRetryService();
