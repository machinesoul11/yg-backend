/**
 * Email Retry Worker
 * 
 * Processes failed emails from the retry queue with intelligent retry logic:
 * - Exponential backoff for transient failures
 * - Permanent failure detection and handling
 * - Rate limiting awareness
 * - Dead letter queue for permanently failed emails
 */

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { emailRetryService } from '@/lib/services/email/retry.service';

interface EmailRetryJobData {
  recipientEmail: string;
  recipientUserId?: string;
  subject: string;
  template: string;
  variables?: Record<string, any>;
  tags?: Record<string, string>;
  attemptCount: number;
}

export const emailRetryWorker = new Worker<EmailRetryJobData>(
  'email-retry',
  async (job: Job<EmailRetryJobData>) => {
    const { recipientEmail, attemptCount } = job.data;

    try {
      job.log(`Retry attempt ${attemptCount} for ${recipientEmail}`);

      // The retry service handles the actual retry logic
      await emailRetryService.processRetry(job);

      job.log(`Successfully processed retry for ${recipientEmail}`);
    } catch (error) {
      const err = error as Error;
      job.log(`Retry failed for ${recipientEmail}: ${err.message}`);
      
      // The retry service will determine if another retry should be scheduled
      // Don't rethrow - we handle retries manually in the service
      console.error(`[EmailRetryWorker] Retry error for ${recipientEmail}:`, err);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process retries slower to avoid overwhelming the provider
    limiter: {
      max: 50, // Max 50 retry attempts
      duration: 60000, // per minute
    },
  }
);

// Handle worker events
emailRetryWorker.on('completed', (job) => {
  console.log(`[EmailRetryWorker] Retry job ${job.id} completed`);
});

emailRetryWorker.on('failed', (job, err) => {
  console.error(`[EmailRetryWorker] Retry job ${job?.id} failed:`, err.message);
});

emailRetryWorker.on('error', (err) => {
  console.error('[EmailRetryWorker] Worker error:', err);
});

console.log('[EmailRetryWorker] Worker started and listening for email retries');
