/**
 * Abstract Base Email Provider
 * 
 * This abstract class provides common functionality for all email provider implementations.
 * It handles validation, rate limiting, retry logic, queueing, logging, and test mode.
 * 
 * Concrete providers (ResendAdapter, AzureAdapter) extend this class and implement
 * the abstract methods for provider-specific operations.
 * 
 * @abstract
 * @class EmailProvider
 */

import type Redis from 'ioredis';
import type { Queue } from 'bullmq';
import type {
  IEmailProvider,
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  SendTemplateParams,
  DeliveryStatus,
  WebhookEvent,
} from './types';
import {
  EmailValidationError,
  EmailRateLimitError,
  EmailProviderError,
  EmailConfigurationError,
} from '@/lib/services/email/errors';

/**
 * Configuration for the email provider base class
 */
export interface EmailProviderConfig<TProviderConfig = Record<string, any>> {
  /** Provider-specific configuration (API keys, endpoints, etc.) */
  providerConfig: TProviderConfig;
  
  /** Provider name for logging and error reporting */
  providerName: string;
  
  /** Rate limiting configuration */
  rateLimit?: {
    /** Maximum emails per time window */
    maxEmailsPerWindow: number;
    /** Time window in seconds */
    windowSeconds: number;
    /** Maximum campaigns per day */
    maxCampaignsPerDay?: number;
  };
  
  /** Retry configuration */
  retry?: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Initial delay in milliseconds */
    initialDelayMs: number;
    /** Maximum delay in milliseconds */
    maxDelayMs: number;
    /** Backoff multiplier */
    backoffMultiplier: number;
  };
  
  /** Queue configuration */
  queue?: {
    /** Queue name */
    name: string;
    /** Default job options */
    defaultJobOptions?: {
      attempts?: number;
      backoff?: {
        type: 'exponential' | 'fixed';
        delay: number;
      };
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    };
  };
  
  /** Logging configuration */
  logging?: {
    /** Minimum log level */
    level: 'debug' | 'info' | 'warn' | 'error';
    /** Whether to log email content (should be false in production for privacy) */
    logContent?: boolean;
    /** Whether to log metadata */
    logMetadata?: boolean;
  };
  
  /** Test mode configuration */
  testMode?: {
    /** Enable test mode */
    enabled: boolean;
    /** Store sent emails in memory for testing */
    captureEmails?: boolean;
    /** Simulate delivery delays */
    simulateDelayMs?: number;
    /** Simulate failures (0-1 probability) */
    failureRate?: number;
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<EmailProviderConfig> = {
  rateLimit: {
    maxEmailsPerWindow: 50,
    windowSeconds: 3600, // 1 hour
    maxCampaignsPerDay: 10,
  },
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
  logging: {
    level: 'info',
    logContent: false,
    logMetadata: true,
  },
  testMode: {
    enabled: false,
    captureEmails: false,
    simulateDelayMs: 0,
    failureRate: 0,
  },
};

/**
 * Retry error classification
 */
export enum ErrorRetryability {
  RETRYABLE = 'retryable',
  NON_RETRYABLE = 'non_retryable',
  RATE_LIMITED = 'rate_limited',
}

/**
 * Abstract base class for email providers
 */
export abstract class EmailProvider<TProviderConfig = Record<string, any>>
  implements IEmailProvider
{
  protected readonly config: EmailProviderConfig<TProviderConfig>;
  protected readonly redis?: Redis;
  protected readonly queue?: Queue;
  protected readonly testEmails: Map<string, SendEmailResult & { params: SendEmailParams }>;
  
  constructor(
    config: EmailProviderConfig<TProviderConfig>,
    redis?: Redis,
    queue?: Queue
  ) {
    // Merge with defaults
    this.config = {
      ...config,
      rateLimit: { 
        ...(DEFAULT_CONFIG.rateLimit || {}), 
        ...(config.rateLimit || {}) 
      } as EmailProviderConfig<TProviderConfig>['rateLimit'],
      retry: { 
        ...(DEFAULT_CONFIG.retry || {}), 
        ...(config.retry || {}) 
      } as EmailProviderConfig<TProviderConfig>['retry'],
      logging: { 
        ...(DEFAULT_CONFIG.logging || {}), 
        ...(config.logging || {}) 
      } as EmailProviderConfig<TProviderConfig>['logging'],
      testMode: { 
        ...(DEFAULT_CONFIG.testMode || {}), 
        ...(config.testMode || {}) 
      } as EmailProviderConfig<TProviderConfig>['testMode'],
    };
    
    this.redis = redis;
    this.queue = queue;
    this.testEmails = new Map();
    
    // Validate required configuration
    this.validateConfiguration();
  }
  
  /**
   * Validate provider configuration on instantiation
   */
  protected validateConfiguration(): void {
    if (!this.config.providerName) {
      throw new EmailConfigurationError(
        'providerName',
        'Provider name is required'
      );
    }
    
    if (!this.config.providerConfig) {
      throw new EmailConfigurationError(
        'providerConfig',
        'Provider-specific configuration is required'
      );
    }
  }
  
  // ============================================================================
  // PUBLIC API METHODS (implement IEmailProvider interface)
  // ============================================================================
  
  /**
   * Send a single email
   * This method implements the full workflow: validation, rate limiting, queueing, retry
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const startTime = Date.now();
    
    try {
      // 1. Validate email parameters
      this.validateEmailParams(params);
      
      // 2. Check test mode
      if (this.config.testMode?.enabled) {
        return await this.sendTestEmail(params);
      }
      
      // 3. Check rate limits
      await this.checkRateLimit(params);
      
      // 4. Log send attempt
      this.log('info', 'Sending email', {
        to: this.sanitizeEmail(params.to),
        subject: params.subject,
        tags: params.tags,
      });
      
      // 5. Attempt to send with retry logic
      const result = await this.sendWithRetry(params);
      
      // 6. Log metrics
      const duration = Date.now() - startTime;
      this.logMetrics('email.sent', {
        provider: this.config.providerName,
        status: result.status,
        duration,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Email send failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });
      
      this.logMetrics('email.failed', {
        provider: this.config.providerName,
        error: error instanceof Error ? error.constructor.name : 'UnknownError',
        duration,
      });
      
      throw error;
    }
  }
  
  /**
   * Send bulk emails
   */
  async sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult> {
    const startTime = Date.now();
    
    try {
      // 1. Validate bulk parameters
      this.validateBulkParams(params);
      
      // 2. Check campaign rate limits
      if (this.redis) {
        await this.checkCampaignRateLimit();
      }
      
      // 3. Log bulk send attempt
      this.log('info', 'Starting bulk send', {
        recipientCount: params.recipients.length,
        template: params.template,
      });
      
      // 4. Delegate to provider-specific implementation
      const result = await this.sendBulkInternal(params);
      
      // 5. Log metrics
      const duration = Date.now() - startTime;
      this.logMetrics('email.bulk_sent', {
        provider: this.config.providerName,
        total: result.total,
        queued: result.queued,
        failed: result.failed,
        duration,
      });
      
      return result;
    } catch (error) {
      this.log('error', 'Bulk send failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
  
  /**
   * Send template-based email
   */
  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    // Validate template parameters
    this.validateTemplateParams(params);
    
    // Delegate to provider-specific implementation
    return await this.sendTemplateInternal(params);
  }
  
  /**
   * Get delivery status
   */
  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null> {
    if (!messageId) {
      throw new EmailValidationError('Message ID is required', 'messageId');
    }
    
    return await this.getDeliveryStatusInternal(messageId);
  }
  
  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    if (!payload || !signature || !secret) {
      throw new EmailValidationError('Payload, signature, and secret are required');
    }
    
    return await this.verifyWebhookSignatureInternal(payload, signature, secret);
  }
  
  /**
   * Parse webhook event
   */
  parseWebhookEvent(rawPayload: any): WebhookEvent {
    if (!rawPayload) {
      throw new EmailValidationError('Webhook payload is required');
    }
    
    return this.parseWebhookEventInternal(rawPayload);
  }
  
  // ============================================================================
  // ABSTRACT METHODS (must be implemented by concrete providers)
  // ============================================================================
  
  /**
   * Provider-specific email send implementation
   */
  protected abstract sendEmailInternal(
    params: SendEmailParams
  ): Promise<SendEmailResult>;
  
  /**
   * Provider-specific bulk send implementation
   */
  protected abstract sendBulkInternal(
    params: SendBulkEmailParams
  ): Promise<SendBulkResult>;
  
  /**
   * Provider-specific template send implementation
   */
  protected abstract sendTemplateInternal(
    params: SendTemplateParams
  ): Promise<SendEmailResult>;
  
  /**
   * Provider-specific delivery status query
   */
  protected abstract getDeliveryStatusInternal(
    messageId: string
  ): Promise<DeliveryStatus | null>;
  
  /**
   * Provider-specific webhook signature verification
   */
  protected abstract verifyWebhookSignatureInternal(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean>;
  
  /**
   * Provider-specific webhook event parsing
   */
  protected abstract parseWebhookEventInternal(rawPayload: any): WebhookEvent;
  
  /**
   * Classify error for retry logic
   * Override in provider implementation for provider-specific error codes
   */
  protected classifyError(error: any): ErrorRetryability {
    // Default classification - override in concrete providers
    if (error instanceof EmailRateLimitError) {
      return ErrorRetryability.RATE_LIMITED;
    }
    
    if (error instanceof EmailValidationError) {
      return ErrorRetryability.NON_RETRYABLE;
    }
    
    // Network errors, timeouts, etc. are retryable
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND'
    ) {
      return ErrorRetryability.RETRYABLE;
    }
    
    // Default to non-retryable for safety
    return ErrorRetryability.NON_RETRYABLE;
  }
  
  // ============================================================================
  // VALIDATION METHODS
  // ============================================================================
  
  /**
   * Validate email parameters
   */
  protected validateEmailParams(params: SendEmailParams): void {
    // Validate recipients
    if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
      throw new EmailValidationError(
        'At least one recipient is required',
        'to'
      );
    }
    
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    for (const email of recipients) {
      this.validateEmailAddress(email);
    }
    
    // Validate CC if present
    if (params.cc) {
      const ccRecipients = Array.isArray(params.cc) ? params.cc : [params.cc];
      for (const email of ccRecipients) {
        this.validateEmailAddress(email);
      }
    }
    
    // Validate BCC if present
    if (params.bcc) {
      const bccRecipients = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
      for (const email of bccRecipients) {
        this.validateEmailAddress(email);
      }
    }
    
    // Validate subject
    if (!params.subject || params.subject.trim().length === 0) {
      throw new EmailValidationError('Subject is required', 'subject');
    }
    
    if (params.subject.length > 998) {
      throw new EmailValidationError(
        'Subject exceeds maximum length of 998 characters',
        'subject',
        params.subject.length
      );
    }
    
    // Validate content
    if (!params.react && !params.html && !params.text) {
      throw new EmailValidationError(
        'Email must have at least one of: react component, HTML, or plain text content',
        'content'
      );
    }
    
    // Validate attachments if present
    if (params.attachments && params.attachments.length > 0) {
      this.validateAttachments(params.attachments);
    }
  }
  
  /**
   * Validate email address format
   */
  protected validateEmailAddress(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new EmailValidationError('Email address must be a string', 'email');
    }
    
    const trimmedEmail = email.trim();
    
    if (trimmedEmail.length === 0) {
      throw new EmailValidationError('Email address cannot be empty', 'email');
    }
    
    // RFC 5322 compliant email regex (simplified)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new EmailValidationError(
        `Invalid email address format: ${trimmedEmail}`,
        'email',
        trimmedEmail
      );
    }
    
    // Additional checks for common mistakes
    if (trimmedEmail.includes('..')) {
      throw new EmailValidationError(
        'Email address cannot contain consecutive dots',
        'email',
        trimmedEmail
      );
    }
    
    if (trimmedEmail.startsWith('.') || trimmedEmail.endsWith('.')) {
      throw new EmailValidationError(
        'Email address cannot start or end with a dot',
        'email',
        trimmedEmail
      );
    }
  }
  
  /**
   * Validate bulk email parameters
   */
  protected validateBulkParams(params: SendBulkEmailParams): void {
    if (!params.recipients || params.recipients.length === 0) {
      throw new EmailValidationError(
        'At least one recipient is required for bulk send',
        'recipients'
      );
    }
    
    // Validate each recipient
    for (const recipient of params.recipients) {
      this.validateEmailAddress(recipient.email);
    }
    
    if (!params.subject || params.subject.trim().length === 0) {
      throw new EmailValidationError('Subject is required', 'subject');
    }
    
    if (!params.template || params.template.trim().length === 0) {
      throw new EmailValidationError('Template is required', 'template');
    }
  }
  
  /**
   * Validate template parameters
   */
  protected validateTemplateParams(params: SendTemplateParams): void {
    if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
      throw new EmailValidationError('At least one recipient is required', 'to');
    }
    
    if (!params.template) {
      throw new EmailValidationError('Template is required', 'template');
    }
    
    if (!params.subject || params.subject.trim().length === 0) {
      throw new EmailValidationError('Subject is required', 'subject');
    }
    
    if (!params.variables || typeof params.variables !== 'object') {
      throw new EmailValidationError(
        'Template variables must be an object',
        'variables'
      );
    }
  }
  
  /**
   * Validate attachments
   */
  protected validateAttachments(attachments: SendEmailParams['attachments']): void {
    if (!attachments) return;
    
    const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB
    const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
    
    let totalSize = 0;
    
    for (const attachment of attachments) {
      if (!attachment.filename) {
        throw new EmailValidationError(
          'Attachment filename is required',
          'attachment.filename'
        );
      }
      
      if (!attachment.content) {
        throw new EmailValidationError(
          'Attachment content is required',
          'attachment.content'
        );
      }
      
      // Calculate size
      const size = Buffer.isBuffer(attachment.content)
        ? attachment.content.length
        : Buffer.from(attachment.content, 'base64').length;
      
      if (size > MAX_ATTACHMENT_SIZE) {
        throw new EmailValidationError(
          `Attachment ${attachment.filename} exceeds maximum size of 25MB`,
          'attachment.size',
          size
        );
      }
      
      totalSize += size;
    }
    
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new EmailValidationError(
        'Total attachment size exceeds maximum of 50MB',
        'attachments.totalSize',
        totalSize
      );
    }
  }
  
  // ============================================================================
  // RATE LIMITING
  // ============================================================================
  
  /**
   * Check rate limit for email sending
   */
  protected async checkRateLimit(params: SendEmailParams): Promise<void> {
    if (!this.redis || !this.config.rateLimit) {
      return; // Rate limiting disabled
    }
    
    // Extract user ID from metadata or tags
    const userId = params.metadata?.userId || params.tags?.userId || 'anonymous';
    
    const { maxEmailsPerWindow, windowSeconds } = this.config.rateLimit;
    const key = `email:ratelimit:${this.config.providerName}:${userId}`;
    
    try {
      const current = await this.redis.get(key);
      const count = current ? parseInt(current, 10) : 0;
      
      if (count >= maxEmailsPerWindow) {
        const ttl = await this.redis.ttl(key);
        const resetAt = new Date(Date.now() + ttl * 1000);
        
        throw new EmailRateLimitError(userId, resetAt, maxEmailsPerWindow);
      }
      
      // Increment counter
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      await pipeline.exec();
      
      this.log('debug', 'Rate limit check passed', {
        userId,
        count: count + 1,
        limit: maxEmailsPerWindow,
      });
    } catch (error) {
      if (error instanceof EmailRateLimitError) {
        throw error;
      }
      
      // If Redis fails, log but don't block the email
      this.log('warn', 'Rate limit check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Check campaign rate limit
   */
  protected async checkCampaignRateLimit(): Promise<void> {
    if (!this.redis || !this.config.rateLimit?.maxCampaignsPerDay) {
      return;
    }
    
    const { maxCampaignsPerDay } = this.config.rateLimit;
    const key = `email:campaign:ratelimit:${this.config.providerName}`;
    const windowSeconds = 86400; // 24 hours
    
    try {
      const current = await this.redis.get(key);
      const count = current ? parseInt(current, 10) : 0;
      
      if (count >= maxCampaignsPerDay) {
        const ttl = await this.redis.ttl(key);
        const resetAt = new Date(Date.now() + ttl * 1000);
        
        throw new EmailRateLimitError('campaign', resetAt, maxCampaignsPerDay);
      }
      
      // Increment counter
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      await pipeline.exec();
    } catch (error) {
      if (error instanceof EmailRateLimitError) {
        throw error;
      }
      
      this.log('warn', 'Campaign rate limit check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  // ============================================================================
  // RETRY LOGIC
  // ============================================================================
  
  /**
   * Send email with retry logic
   */
  protected async sendWithRetry(params: SendEmailParams): Promise<SendEmailResult> {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } =
      this.config.retry!;
    
    let lastError: Error | undefined;
    let delay = initialDelayMs;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log('debug', `Send attempt ${attempt}/${maxAttempts}`, {
          to: this.sanitizeEmail(params.to),
        });
        
        const result = await this.sendEmailInternal(params);
        
        if (attempt > 1) {
          this.log('info', `Email sent successfully after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const retryability = this.classifyError(error);
        
        // Don't retry non-retryable errors
        if (retryability === ErrorRetryability.NON_RETRYABLE) {
          this.log('error', 'Non-retryable error encountered', {
            error: lastError.message,
            attempt,
          });
          throw error;
        }
        
        // Don't retry if we've exhausted attempts
        if (attempt >= maxAttempts) {
          this.log('error', 'Max retry attempts exhausted', {
            error: lastError.message,
            attempts: maxAttempts,
          });
          break;
        }
        
        // Calculate delay for next attempt
        if (retryability === ErrorRetryability.RATE_LIMITED) {
          // For rate limits, use a longer delay
          delay = Math.min(delay * 2, maxDelayMs);
        } else {
          // For other retryable errors, use exponential backoff
          delay = Math.min(delay * backoffMultiplier, maxDelayMs);
        }
        
        this.log('warn', `Retrying after ${delay}ms`, {
          attempt,
          nextAttempt: attempt + 1,
          error: lastError.message,
          retryability,
        });
        
        // Wait before retrying
        await this.sleep(delay);
      }
    }
    
    // All retries exhausted
    throw new EmailProviderError(
      this.config.providerName,
      `Failed after ${maxAttempts} attempts: ${lastError?.message}`,
      'RETRY_EXHAUSTED',
      false
    );
  }
  
  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  // ============================================================================
  // QUEUEING
  // ============================================================================
  
  /**
   * Queue an email for later sending
   * Requires BullMQ queue to be configured
   */
  protected async queueEmail(
    params: SendEmailParams,
    options?: {
      priority?: number;
      delay?: number;
      jobId?: string;
    }
  ): Promise<string> {
    if (!this.queue) {
      throw new EmailConfigurationError(
        'queue',
        'Email queue not configured'
      );
    }
    
    const job = await this.queue.add(
      'send-email',
      { params },
      {
        priority: options?.priority,
        delay: options?.delay,
        jobId: options?.jobId,
        ...this.config.queue?.defaultJobOptions,
      }
    );
    
    this.log('info', 'Email queued', {
      jobId: job.id,
      to: this.sanitizeEmail(params.to),
    });
    
    return job.id!;
  }
  
  // ============================================================================
  // LOGGING AND METRICS
  // ============================================================================
  
  /**
   * Log a message
   */
  protected log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const configLevel = this.config.logging?.level || 'info';
    const levels = ['debug', 'info', 'warn', 'error'];
    
    if (levels.indexOf(level) < levels.indexOf(configLevel)) {
      return; // Skip if below configured level
    }
    
    const logData: Record<string, any> = {
      provider: this.config.providerName,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    
    if (metadata && this.config.logging?.logMetadata !== false) {
      logData.metadata = metadata;
    }
    
    // Use console for now - in production, integrate with proper logging service
    const logMethod = level === 'error' ? console.error : console.log;
    logMethod(JSON.stringify(logData));
  }
  
  /**
   * Log metrics
   */
  protected logMetrics(
    event: string,
    data: Record<string, any>
  ): void {
    // Store metrics in Redis for aggregation
    if (this.redis) {
      const key = `email:metrics:${this.config.providerName}:${event}`;
      const dateKey = new Date().toISOString().split('T')[0];
      
      this.redis
        .hincrby(`${key}:${dateKey}`, 'count', 1)
        .catch((error) => {
          this.log('warn', 'Failed to log metrics', {
            error: error.message,
          });
        });
    }
    
    this.log('debug', `Metric: ${event}`, data);
  }
  
  /**
   * Sanitize email addresses for logging (privacy)
   */
  protected sanitizeEmail(email: string | string[]): string | string[] {
    if (this.config.logging?.logContent) {
      return email; // Don't sanitize if logging content is enabled
    }
    
    const sanitize = (e: string): string => {
      const [local, domain] = e.split('@');
      if (!domain) return '***';
      return `${local.substring(0, 2)}***@${domain}`;
    };
    
    return Array.isArray(email)
      ? email.map(sanitize)
      : sanitize(email);
  }
  
  // ============================================================================
  // TEST MODE
  // ============================================================================
  
  /**
   * Send email in test mode
   */
  protected async sendTestEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const { simulateDelayMs, failureRate, captureEmails } = this.config.testMode!;
    
    // Simulate delay
    if (simulateDelayMs && simulateDelayMs > 0) {
      await this.sleep(simulateDelayMs);
    }
    
    // Simulate failure
    if (failureRate && Math.random() < failureRate) {
      throw new EmailProviderError(
        this.config.providerName,
        'Simulated failure in test mode',
        'TEST_FAILURE',
        true
      );
    }
    
    const messageId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const result: SendEmailResult = {
      messageId,
      status: 'sent',
      timestamp: new Date(),
      providerMetadata: {
        testMode: true,
      },
    };
    
    // Capture email if configured
    if (captureEmails) {
      this.testEmails.set(messageId, { ...result, params });
    }
    
    this.log('info', 'Email sent in test mode', {
      messageId,
      to: params.to,
      subject: params.subject,
    });
    
    return result;
  }
  
  /**
   * Get captured test emails
   */
  public getTestEmails(): Array<SendEmailResult & { params: SendEmailParams }> {
    return Array.from(this.testEmails.values());
  }
  
  /**
   * Clear captured test emails
   */
  public clearTestEmails(): void {
    this.testEmails.clear();
  }
}
