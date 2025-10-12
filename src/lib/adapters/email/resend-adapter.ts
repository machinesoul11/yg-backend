import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';
import crypto from 'crypto';
import type {
  IEmailProvider,
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  SendTemplateParams,
  DeliveryStatus,
  WebhookEvent,
  WebhookEventType,
  DeliveryState,
  BounceType,
  ComplaintType,
} from './types';
import {
  EmailProviderError,
  EmailWebhookSignatureError,
  EmailWebhookError,
  EmailTemplateError,
  EmailValidationError,
} from '@/lib/services/email/errors';

/**
 * Resend email provider adapter implementation.
 * Implements the IEmailProvider interface using Resend's API.
 * 
 * Features:
 * - React Email component rendering
 * - Automatic batching for bulk sends (100 emails per batch)
 * - Webhook signature verification
 * - Event normalization from Resend format
 * 
 * @class ResendAdapter
 * @implements {IEmailProvider}
 */
export class ResendAdapter implements IEmailProvider {
  private client: Resend;
  private fromAddress: string;
  private fromName: string;

  constructor(config: {
    apiKey: string;
    fromAddress: string;
    fromName: string;
  }) {
    if (!config.apiKey) {
      throw new EmailValidationError('Resend API key is required', 'apiKey');
    }
    if (!config.fromAddress) {
      throw new EmailValidationError('From address is required', 'fromAddress');
    }

    this.client = new Resend(config.apiKey);
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName || 'YES GODDESS';
  }

  /**
   * Send a single email via Resend
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const startTime = Date.now();

    try {
      // Validate parameters
      this.validateSendParams(params);

      // Render React component to HTML if provided
      let htmlContent = params.html;
      if (params.react) {
        try {
          htmlContent = await render(params.react);
        } catch (error) {
          throw new EmailTemplateError(
            'react-component',
            error instanceof Error ? error.message : 'Failed to render React component'
          );
        }
      }

      // Build email payload
      const emailPayload: any = {
        from: params.from || `${this.fromName} <${this.fromAddress}>`,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
      };

      // Add optional fields
      if (params.cc) {
        emailPayload.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
      }

      if (params.bcc) {
        emailPayload.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
      }

      if (params.replyTo) {
        emailPayload.replyTo = Array.isArray(params.replyTo)
          ? params.replyTo
          : [params.replyTo];
      }

      if (htmlContent) {
        emailPayload.html = htmlContent;
      }

      if (params.text) {
        emailPayload.text = params.text;
      }

      if (params.attachments && params.attachments.length > 0) {
        emailPayload.attachments = params.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          ...(att.contentType && { contentType: att.contentType }),
          ...(att.cid && { cid: att.cid }),
        }));
      }

      if (params.headers) {
        emailPayload.headers = params.headers;
      }

      if (params.tags) {
        emailPayload.tags = Object.entries(params.tags).map(
          ([name, value]) => ({ name, value })
        );
      }

      if (params.scheduledAt) {
        emailPayload.scheduledAt = params.scheduledAt.toISOString();
      }

      // Send email
      const { data, error } = await this.client.emails.send(emailPayload);

      if (error) {
        throw new EmailProviderError(
          'Resend',
          error.message || 'Unknown error',
          error.name,
          this.isRetryableError(error)
        );
      }

      return {
        messageId: data!.id,
        status: 'sent',
        timestamp: new Date(),
        providerMetadata: data,
      };
    } catch (error) {
      if (
        error instanceof EmailProviderError ||
        error instanceof EmailTemplateError ||
        error instanceof EmailValidationError
      ) {
        throw error;
      }

      const duration = Date.now() - startTime;
      throw new EmailProviderError(
        'Resend',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        false
      );
    }
  }

  /**
   * Send bulk emails with automatic batching
   * Resend supports up to 100 emails per batch request
   */
  async sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult> {
    const startTime = Date.now();
    const results: SendEmailResult[] = [];
    const batchSize = params.batchSize || 100; // Resend's limit
    const batchDelay = params.batchDelay || 0;

    let totalDelayMs = 0;
    let delaysEncountered = 0;

    // Process in batches
    for (let i = 0; i < params.recipients.length; i += batchSize) {
      const batch = params.recipients.slice(i, i + batchSize);

      // Send batch emails in parallel
      const batchPromises = batch.map((recipient) =>
        this.sendEmail({
          to: recipient.email,
          from: params.from,
          subject: this.interpolateSubject(params.subject, recipient.variables),
          html: this.renderTemplateToHtml(
            params.template,
            { ...params.defaultVariables, ...recipient.variables }
          ),
          tags: params.tags,
          metadata: {
            batch: Math.floor(i / batchSize),
            ...recipient.metadata,
          },
        }).catch(error => ({
          messageId: '',
          status: 'failed' as const,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
          errorCode: error instanceof EmailProviderError ? error.code : undefined,
        }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(
        ...batchResults.map((r) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                messageId: '',
                status: 'failed' as const,
                timestamp: new Date(),
                error: 'Promise rejected',
              }
        )
      );

      // Report progress if callback provided
      if (params.onProgress) {
        const sent = results.filter(r => r.status === 'sent').length;
        const failed = results.filter(r => r.status === 'failed').length;
        params.onProgress({
          total: params.recipients.length,
          sent,
          failed,
          percentComplete: Math.round((results.length / params.recipients.length) * 100),
        });
      }

      // Delay between batches if configured
      if (batchDelay > 0 && i + batchSize < params.recipients.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
        totalDelayMs += batchDelay;
        delaysEncountered++;
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      total: params.recipients.length,
      queued: results.filter((r) => r.status === 'sent' || r.status === 'queued').length,
      failed: results.filter((r) => r.status === 'failed').length,
      durationMs,
      messageIds: results.filter((r) => r.messageId).map((r) => r.messageId),
      errors: results
        .map((r, i) => ({
          result: r,
          index: i,
        }))
        .filter(({ result }) => result.error)
        .map(({ result, index }) => ({
          email: params.recipients[index]?.email || 'unknown',
          error: result.error!,
          errorCode: result.errorCode,
          retryable: this.isRetryableError({ message: result.error }),
        })),
      rateLimitInfo:
        delaysEncountered > 0
          ? {
              delaysEncountered,
              totalDelayMs,
            }
          : undefined,
    };
  }

  /**
   * Send email using a template
   */
  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    try {
      // Validate template variables
      if (!params.variables || typeof params.variables !== 'object') {
        throw new EmailTemplateError(
          String(params.template),
          'Template variables must be an object'
        );
      }

      // Render template
      let htmlContent: string;
      
      if (typeof params.template === 'string') {
        htmlContent = this.renderTemplateToHtml(params.template, params.variables);
      } else {
        // React component template
        const Component = params.template as any;
        const element = React.createElement(Component, params.variables);
        htmlContent = await render(element);
      }

      // Preview mode - don't actually send
      if (params.previewOnly) {
        return {
          messageId: `preview-${Date.now()}`,
          status: 'queued',
          timestamp: new Date(),
          providerMetadata: { preview: true, html: htmlContent },
        };
      }

      // Send the rendered email
      return await this.sendEmail({
        to: params.to,
        from: params.from,
        replyTo: params.replyTo,
        subject: params.subject,
        html: htmlContent,
        tags: {
          ...params.tags,
          template: String(params.template),
          ...(params.templateVersion && { templateVersion: params.templateVersion }),
        },
        metadata: params.metadata,
      });
    } catch (error) {
      if (error instanceof EmailTemplateError) {
        throw error;
      }
      throw new EmailTemplateError(
        String(params.template),
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get delivery status for a message
   * Note: Resend doesn't provide a direct status API, so this queries the database
   */
  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null> {
    // This method should be implemented by EmailService which has database access
    throw new EmailProviderError(
      'Resend',
      'getDeliveryStatus must be called via EmailService, not directly on the adapter',
      'NOT_IMPLEMENTED',
      false
    );
  }

  /**
   * Verify Resend webhook signature
   * Resend uses HMAC-SHA256 for webhook signature verification
   */
  async verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    try {
      if (!signature || !secret) {
        throw new EmailWebhookSignatureError('Resend');
      }

      // Resend uses svix for webhook signatures
      // The signature is in format: v1,timestamp,signature
      const parts = signature.split(',');
      if (parts.length < 2) {
        throw new EmailWebhookSignatureError('Resend');
      }

      // Extract timestamp and signatures
      const timestamp = parts.find(p => !p.includes('='))?.trim();
      const signatures = parts
        .filter(p => p.includes('='))
        .map(p => p.split('=')[1]);

      if (!timestamp || signatures.length === 0) {
        throw new EmailWebhookSignatureError('Resend');
      }

      // Construct signed payload
      const signedPayload = `${timestamp}.${payload}`;
      
      // Compute expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('base64');

      // Compare signatures (constant-time comparison)
      return signatures.some(sig => crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      ));
    } catch (error) {
      if (error instanceof EmailWebhookSignatureError) {
        throw error;
      }
      throw new EmailWebhookError(
        'Signature verification failed',
        'Resend'
      );
    }
  }

  /**
   * Parse Resend webhook event into normalized format
   */
  parseWebhookEvent(rawPayload: any): WebhookEvent {
    try {
      const eventType = this.normalizeEventType(rawPayload.type);
      
      return {
        id: rawPayload.id || crypto.randomUUID(),
        type: eventType,
        timestamp: new Date(rawPayload.created_at || rawPayload.data?.created_at || Date.now()),
        messageId: rawPayload.data?.email_id || rawPayload.data?.message_id || '',
        email: rawPayload.data?.to || rawPayload.data?.email || '',
        subject: rawPayload.data?.subject,
        data: this.parseEventData(eventType, rawPayload.data),
        provider: 'resend',
        rawPayload,
      };
    } catch (error) {
      throw new EmailWebhookError(
        `Failed to parse webhook event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Resend',
        rawPayload.id
      );
    }
  }

  // --- Private Helper Methods ---

  /**
   * Validate send email parameters
   */
  private validateSendParams(params: SendEmailParams): void {
    if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
      throw new EmailValidationError('Recipient email address is required', 'to');
    }

    if (!params.subject || params.subject.trim().length === 0) {
      throw new EmailValidationError('Email subject is required', 'subject');
    }

    if (!params.react && !params.html && !params.text) {
      throw new EmailValidationError(
        'Email must have content (react, html, or text)',
        'content'
      );
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'RATE_LIMIT',
      'TIMEOUT',
      'NETWORK_ERROR',
      'SERVICE_UNAVAILABLE',
    ];
    
    return retryableCodes.some(code => 
      error?.message?.includes(code) || 
      error?.name?.includes(code) ||
      error?.code?.includes(code)
    );
  }

  /**
   * Interpolate variables in subject line
   */
  private interpolateSubject(
    subject: string,
    variables?: Record<string, any>
  ): string {
    if (!variables) return subject;

    return subject.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key]?.toString() || match;
    });
  }

  /**
   * Render template to HTML
   * This is a placeholder - actual implementation would load and render templates
   */
  private renderTemplateToHtml(
    templateName: string,
    variables?: Record<string, any>
  ): string {
    // TODO: Integrate with actual template loading system
    // For now, return a basic HTML structure
    return `
      <html>
        <body>
          <h1>Template: ${templateName}</h1>
          <pre>${JSON.stringify(variables, null, 2)}</pre>
        </body>
      </html>
    `;
  }

  /**
   * Normalize Resend event types to standard WebhookEventType
   */
  private normalizeEventType(resendType: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      'email.sent': 'email.sent',
      'email.delivered': 'email.delivered',
      'email.delivery_delayed': 'email.deferred',
      'email.bounced': 'email.bounced',
      'email.complained': 'email.complained',
      'email.opened': 'email.opened',
      'email.clicked': 'email.clicked',
      'email.unsubscribed': 'email.unsubscribed',
      'email.failed': 'email.failed',
    };

    return mapping[resendType] || 'email.sent';
  }

  /**
   * Parse event-specific data from Resend webhook
   */
  private parseEventData(eventType: WebhookEventType, data: any): any {
    switch (eventType) {
      case 'email.bounced':
        return {
          type: this.normalizeBounceType(data.bounce_type),
          reason: data.bounce_reason || data.reason || 'Unknown',
          diagnosticCode: data.diagnostic_code,
          timestamp: new Date(data.bounced_at || Date.now()),
          suppressionRecommended: data.bounce_type === 'hard',
        };

      case 'email.complained':
        return {
          type: 'abuse' as ComplaintType,
          timestamp: new Date(data.complained_at || Date.now()),
          feedbackType: data.feedback_type,
          userAgent: data.user_agent,
          suppressionRecommended: true,
        };

      case 'email.clicked':
        return {
          url: data.link || data.url,
          userAgent: data.user_agent,
          ipAddress: data.ip_address,
          timestamp: new Date(data.clicked_at || Date.now()),
        };

      case 'email.opened':
        return {
          userAgent: data.user_agent,
          ipAddress: data.ip_address,
          timestamp: new Date(data.opened_at || Date.now()),
        };

      default:
        return data;
    }
  }

  /**
   * Normalize bounce types from Resend to standard BounceType
   */
  private normalizeBounceType(resendBounceType?: string): BounceType {
    if (!resendBounceType) return 'undetermined';

    const type = resendBounceType.toLowerCase();
    if (type.includes('hard') || type.includes('permanent')) return 'hard';
    if (type.includes('soft') || type.includes('temporary')) return 'soft';
    if (type.includes('technical')) return 'technical';
    
    return 'undetermined';
  }
}
