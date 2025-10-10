import { Resend } from 'resend';
import { render } from '@react-email/render';
import type React from 'react';
import type {
  IEmailProvider,
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  DeliveryStatus,
} from './types';

export class ResendAdapter implements IEmailProvider {
  private client: Resend;
  private fromAddress: string;
  private fromName: string;

  constructor(config: {
    apiKey: string;
    fromAddress: string;
    fromName: string;
  }) {
    this.client = new Resend(config.apiKey);
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName;
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      // Render React component to HTML if provided
      let htmlContent = params.html;
      if (params.react) {
        htmlContent = await render(params.react);
      }

      const emailPayload: any = {
        from: params.from || `${this.fromName} <${this.fromAddress}>`,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
      };

      if (params.replyTo) {
        emailPayload.replyTo = params.replyTo;
      }

      if (htmlContent) {
        emailPayload.html = htmlContent;
      }

      if (params.text) {
        emailPayload.text = params.text;
      }

      if (params.tags) {
        emailPayload.tags = Object.entries(params.tags).map(
          ([name, value]) => ({
            name,
            value,
          })
        );
      }

      if (params.scheduledAt) {
        emailPayload.scheduledAt = params.scheduledAt.toISOString();
      }

      const { data, error } = await this.client.emails.send(emailPayload);

      if (error) {
        return {
          messageId: '',
          status: 'failed',
          error: error.message,
        };
      }

      return {
        messageId: data!.id,
        status: 'sent',
      };
    } catch (error) {
      return {
        messageId: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult> {
    const results: SendEmailResult[] = [];

    // Batch requests in groups of 100 (Resend limit)
    const batchSize = 100;
    for (let i = 0; i < params.recipients.length; i += batchSize) {
      const batch = params.recipients.slice(i, i + batchSize);

      const batchPromises = batch.map((recipient) =>
        this.sendEmail({
          to: recipient.email,
          from: params.from,
          subject: params.subject,
          html: this.renderTemplateToHtml(params.template, recipient.variables),
          tags: params.tags,
          metadata: { batch: Math.floor(i / batchSize) },
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(
        ...batchResults.map((r) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                messageId: '',
                status: 'failed' as const,
                error: 'Promise rejected',
              }
        )
      );
    }

    return {
      total: params.recipients.length,
      queued:
        results.filter((r) => r.status === 'sent' || r.status === 'queued')
          .length,
      failed: results.filter((r) => r.status === 'failed').length,
      messageIds: results.filter((r) => r.messageId).map((r) => r.messageId),
      errors: results
        .filter((r) => r.error)
        .map((r, i) => ({
          email: params.recipients[i]?.email || 'unknown',
          error: r.error!,
        })),
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    // Resend doesn't have a direct status endpoint - status comes via webhooks
    // This would query the database for stored webhook events
    throw new Error(
      'Implement via database query of EmailEvent table. Use EmailService.getDeliveryStatus instead.'
    );
  }

  private renderTemplateToHtml(
    templateName: string,
    variables?: Record<string, any>
  ): string {
    // Placeholder - will be implemented with actual template loading
    // For now, return a simple HTML string
    return `<html><body><p>Template: ${templateName}</p><pre>${JSON.stringify(variables, null, 2)}</pre></body></html>`;
  }
}
