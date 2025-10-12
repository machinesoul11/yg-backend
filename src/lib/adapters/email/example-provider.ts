/**
 * Example Email Provider Implementation
 * 
 * This file demonstrates how to create a new email provider by extending
 * the EmailProvider base class. Use this as a template when implementing
 * support for new email service providers.
 * 
 * @example
 * ```typescript
 * import { ExampleEmailProvider } from './example-provider';
 * import { redis } from '@/lib/redis';
 * 
 * const provider = new ExampleEmailProvider({
 *   providerName: 'example',
 *   providerConfig: {
 *     apiKey: process.env.EXAMPLE_API_KEY!,
 *     apiEndpoint: 'https://api.example.com',
 *     senderEmail: 'noreply@yesgoddess.com',
 *   },
 *   rateLimit: {
 *     maxEmailsPerWindow: 100,
 *     windowSeconds: 3600,
 *   },
 * }, redis);
 * 
 * const result = await provider.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<p>Welcome to YES GODDESS</p>',
 * });
 * ```
 */

import crypto from 'crypto';
import { EmailProvider, EmailProviderConfig, ErrorRetryability } from './base-provider';
import type {
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  SendTemplateParams,
  DeliveryStatus,
  WebhookEvent,
  DeliveryState,
} from './types';
import { EmailProviderError, EmailTemplateError } from '@/lib/services/email/errors';

/**
 * Provider-specific configuration interface
 */
export interface ExampleEmailConfig {
  /** API key for authentication */
  apiKey: string;
  
  /** API endpoint URL */
  apiEndpoint: string;
  
  /** Default sender email address */
  senderEmail: string;
  
  /** Default sender name */
  senderName?: string;
  
  /** Webhook signing secret */
  webhookSecret?: string;
  
  /** Enable sandbox mode (for testing) */
  sandboxMode?: boolean;
}

/**
 * Example Email Provider
 * 
 * This is a reference implementation showing how to extend the EmailProvider
 * base class to create a new email provider adapter.
 */
export class ExampleEmailProvider extends EmailProvider<ExampleEmailConfig> {
  /**
   * Initialize the provider with configuration
   */
  constructor(
    config: EmailProviderConfig<ExampleEmailConfig>,
    redis?: any,
    queue?: any
  ) {
    super(config, redis, queue);
    
    // Validate provider-specific configuration
    if (!config.providerConfig.apiKey) {
      throw new Error('API key is required for Example Email Provider');
    }
    
    if (!config.providerConfig.apiEndpoint) {
      throw new Error('API endpoint is required for Example Email Provider');
    }
    
    this.log('info', 'Example Email Provider initialized', {
      endpoint: config.providerConfig.apiEndpoint,
      sandboxMode: config.providerConfig.sandboxMode || false,
    });
  }
  
  // ============================================================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================
  
  /**
   * Send a single email via the provider API
   * 
   * Note: Validation, rate limiting, and retry logic are handled by the base class.
   * This method should only contain provider-specific API integration logic.
   */
  protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
    const startTime = Date.now();
    
    try {
      // 1. Prepare the API request payload
      const payload = this.buildEmailPayload(params);
      
      // 2. Make the API call
      const response = await this.callProviderAPI('POST', '/emails/send', payload);
      
      // 3. Extract the message ID from the response
      const messageId = response.data.id || response.data.messageId;
      
      // 4. Log success
      const duration = Date.now() - startTime;
      this.log('debug', 'Email sent successfully', {
        messageId,
        to: this.sanitizeEmail(params.to),
        duration,
      });
      
      // 5. Return standardized result
      return {
        messageId,
        status: 'sent',
        timestamp: new Date(),
        providerMetadata: {
          providerId: response.data.id,
          queueId: response.data.queueId,
          duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log the error
      this.log('error', 'Failed to send email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });
      
      // Wrap provider errors
      if (error instanceof Error) {
        throw new EmailProviderError(
          this.config.providerName,
          error.message,
          (error as any).code,
          this.classifyError(error) === ErrorRetryability.RETRYABLE
        );
      }
      
      throw error;
    }
  }
  
  /**
   * Send bulk emails
   * 
   * The base class handles batching and progress tracking.
   * This implementation sends emails individually with batching.
   */
  protected async sendBulkInternal(params: SendBulkEmailParams): Promise<SendBulkResult> {
    const startTime = Date.now();
    const messageIds: string[] = [];
    const errors: Array<{
      email: string;
      error: string;
      errorCode?: string;
      retryable: boolean;
    }> = [];
    
    // Send emails in parallel (with concurrency limit)
    const BATCH_SIZE = params.batchSize || 10;
    
    for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
      const batch = params.recipients.slice(i, i + BATCH_SIZE);
      
      // Send batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          try {
            // Build email params for this recipient
            const emailParams: SendEmailParams = {
              to: recipient.email,
              subject: this.interpolateVariables(params.subject, {
                ...params.defaultVariables,
                ...recipient.variables,
              }),
              html: this.renderTemplate(params.template, {
                ...params.defaultVariables,
                ...recipient.variables,
              }),
              tags: params.tags,
              metadata: recipient.metadata,
            };
            
            // Send email
            const result = await this.sendEmailInternal(emailParams);
            return { success: true, messageId: result.messageId, email: recipient.email };
          } catch (error) {
            return {
              success: false,
              email: recipient.email,
              error: error instanceof Error ? error.message : 'Unknown error',
              errorCode: (error as any).code,
              retryable: this.classifyError(error) === ErrorRetryability.RETRYABLE,
            };
          }
        })
      );
      
      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          if (result.value.messageId) {
            messageIds.push(result.value.messageId);
          }
        } else if (result.status === 'fulfilled' && !result.value.success) {
          errors.push({
            email: result.value.email || 'unknown',
            error: result.value.error || 'Unknown error',
            errorCode: result.value.errorCode,
            retryable: result.value.retryable || false,
          });
        } else if (result.status === 'rejected') {
          errors.push({
            email: 'unknown',
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            retryable: false,
          });
        }
      }
      
      // Report progress
      if (params.onProgress) {
        params.onProgress({
          total: params.recipients.length,
          sent: messageIds.length,
          failed: errors.length,
          percentComplete: Math.round(((i + batch.length) / params.recipients.length) * 100),
        });
      }
      
      // Add delay between batches if specified
      if (params.batchDelay && i + BATCH_SIZE < params.recipients.length) {
        await this.sleep(params.batchDelay);
      }
    }
    
    return {
      total: params.recipients.length,
      queued: messageIds.length,
      failed: errors.length,
      durationMs: Date.now() - startTime,
      messageIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
  
  /**
   * Send template-based email
   */
  protected async sendTemplateInternal(params: SendTemplateParams): Promise<SendEmailResult> {
    try {
      // Render template with variables
      const html = this.renderTemplate(
        typeof params.template === 'string' ? params.template : params.template.name,
        params.variables
      );
      
      // Preview mode - return without sending
      if (params.previewOnly) {
        return {
          messageId: `preview-${Date.now()}`,
          status: 'queued',
          timestamp: new Date(),
          providerMetadata: {
            preview: true,
            html,
          },
        };
      }
      
      // Send email with rendered template
      return await this.sendEmailInternal({
        to: params.to,
        subject: params.subject,
        html,
        from: params.from,
        replyTo: params.replyTo,
        tags: {
          ...params.tags,
          template: typeof params.template === 'string' ? params.template : params.template.name,
          ...(params.templateVersion && { templateVersion: params.templateVersion }),
        },
        metadata: params.metadata,
      });
    } catch (error) {
      throw new EmailTemplateError(
        typeof params.template === 'string' ? params.template : params.template.name,
        error instanceof Error ? error.message : 'Template rendering failed'
      );
    }
  }
  
  /**
   * Get delivery status for a sent email
   * 
   * Note: This queries the provider's API. For webhook-based status updates,
   * consider querying the database instead.
   */
  protected async getDeliveryStatusInternal(messageId: string): Promise<DeliveryStatus | null> {
    try {
      const response = await this.callProviderAPI('GET', `/emails/${messageId}/status`);
      
      if (!response.data) {
        return null;
      }
      
      // Convert provider format to standard format
      return {
        messageId,
        status: this.normalizeDeliveryState(response.data.status),
        email: response.data.recipient,
        subject: response.data.subject,
        events: response.data.events.map((e: any) => ({
          type: this.normalizeDeliveryState(e.type),
          timestamp: new Date(e.timestamp),
          details: e.details,
        })),
        engagement: {
          opened: response.data.opened || false,
          openCount: response.data.openCount || 0,
          clicked: response.data.clicked || false,
          clickCount: response.data.clickCount || 0,
          clickedUrls: response.data.clickedUrls || [],
        },
      };
    } catch (error) {
      this.log('warn', 'Failed to get delivery status', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Verify webhook signature
   * 
   * Implements HMAC-SHA256 signature verification.
   * Adjust this based on your provider's webhook signature scheme.
   */
  protected async verifyWebhookSignatureInternal(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    try {
      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      // Compare signatures (timing-safe)
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.log('error', 'Webhook signature verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
  
  /**
   * Parse webhook event from provider format
   */
  protected parseWebhookEventInternal(rawPayload: any): WebhookEvent {
    // Extract standard fields
    const eventType = this.normalizeWebhookEventType(rawPayload.type || rawPayload.event);
    
    return {
      id: rawPayload.id || rawPayload.eventId,
      type: eventType,
      timestamp: new Date(rawPayload.timestamp || rawPayload.createdAt),
      messageId: rawPayload.messageId || rawPayload.email?.id,
      email: rawPayload.recipient || rawPayload.email?.to,
      subject: rawPayload.subject,
      data: rawPayload.data || rawPayload.payload,
      provider: this.config.providerName,
      rawPayload,
    };
  }
  
  /**
   * Classify errors for retry logic
   */
  protected classifyError(error: any): ErrorRetryability {
    // Provider-specific error codes
    const code = error.code || error.statusCode;
    
    // Rate limiting errors
    if (code === 429 || code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS') {
      return ErrorRetryability.RATE_LIMITED;
    }
    
    // Validation errors (don't retry)
    if (
      code === 400 ||
      code === 'INVALID_REQUEST' ||
      code === 'INVALID_EMAIL' ||
      code === 'INVALID_RECIPIENT'
    ) {
      return ErrorRetryability.NON_RETRYABLE;
    }
    
    // Server errors (retry)
    if (
      code >= 500 ||
      code === 'SERVICE_UNAVAILABLE' ||
      code === 'INTERNAL_ERROR'
    ) {
      return ErrorRetryability.RETRYABLE;
    }
    
    // Network errors (retry)
    if (
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND'
    ) {
      return ErrorRetryability.RETRYABLE;
    }
    
    // Default to base class classification
    return super.classifyError(error);
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Build email payload in provider-specific format
   */
  private buildEmailPayload(params: SendEmailParams): any {
    const payload: any = {
      from: params.from || `${this.config.providerConfig.senderName || 'YES GODDESS'} <${this.config.providerConfig.senderEmail}>`,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
    };
    
    // Add optional fields
    if (params.cc) {
      payload.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
    }
    
    if (params.bcc) {
      payload.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
    }
    
    if (params.replyTo) {
      payload.replyTo = Array.isArray(params.replyTo) ? params.replyTo : [params.replyTo];
    }
    
    if (params.html) {
      payload.html = params.html;
    }
    
    if (params.text) {
      payload.text = params.text;
    }
    
    if (params.attachments && params.attachments.length > 0) {
      payload.attachments = params.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        cid: att.cid,
      }));
    }
    
    if (params.tags) {
      payload.tags = params.tags;
    }
    
    if (params.metadata) {
      payload.metadata = params.metadata;
    }
    
    if (params.scheduledAt) {
      payload.sendAt = params.scheduledAt.toISOString();
    }
    
    // Add sandbox flag if enabled
    if (this.config.providerConfig.sandboxMode) {
      payload.sandbox = true;
    }
    
    return payload;
  }
  
  /**
   * Make API call to provider
   */
  private async callProviderAPI(
    method: string,
    path: string,
    data?: any
  ): Promise<any> {
    const url = `${this.config.providerConfig.apiEndpoint}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.providerConfig.apiKey}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: Record<string, any>): string {
    // Simple template rendering - replace with actual template engine
    let html = `<template>${template}</template>`;
    
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    
    return html;
  }
  
  /**
   * Interpolate variables in string
   */
  private interpolateVariables(str: string, variables: Record<string, any>): string {
    let result = str;
    
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    
    return result;
  }
  
  /**
   * Normalize provider delivery state to standard format
   */
  private normalizeDeliveryState(state: string): DeliveryState {
    const stateMap: Record<string, DeliveryState> = {
      'pending': 'pending',
      'queued': 'queued',
      'sent': 'sent',
      'delivered': 'delivered',
      'deferred': 'deferred',
      'bounced': 'bounced',
      'failed': 'failed',
      'complained': 'complained',
      'opened': 'opened',
      'clicked': 'clicked',
    };
    
    return stateMap[state.toLowerCase()] || 'pending';
  }
  
  /**
   * Normalize webhook event type
   */
  private normalizeWebhookEventType(type: string): WebhookEvent['type'] {
    const typeMap: Record<string, WebhookEvent['type']> = {
      'sent': 'email.sent',
      'delivered': 'email.delivered',
      'deferred': 'email.deferred',
      'bounced': 'email.bounced',
      'complained': 'email.complained',
      'opened': 'email.opened',
      'clicked': 'email.clicked',
      'unsubscribed': 'email.unsubscribed',
      'failed': 'email.failed',
    };
    
    return typeMap[type.toLowerCase()] || 'email.sent';
  }
}
