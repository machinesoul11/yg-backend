import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import type { IEmailProvider } from '@/lib/adapters/email/types';
import { ResendAdapter } from '@/lib/adapters/email/resend-adapter';
import {
  EmailSuppressionError,
  EmailPreferenceError,
  EmailProviderError,
} from './errors';
import {
  renderTemplate,
  getCategoryFromTemplate,
  type TemplateKey,
  type TemplateVariables,
} from './templates';

export interface SendTransactionalParams {
  userId?: string;
  email: string;
  subject: string;
  template: TemplateKey;
  variables?: TemplateVariables;
  tags?: Record<string, string>;
}

export interface SendCampaignParams {
  recipients: Array<{
    userId: string;
    email: string;
    variables?: TemplateVariables;
  }>;
  subject: string;
  template: TemplateKey;
  tags?: Record<string, string>;
}

export interface SendDigestParams {
  userId: string;
  email: string;
  frequency: 'DAILY' | 'WEEKLY';
}

export class EmailService {
  private provider: IEmailProvider;

  constructor() {
    this.provider = new ResendAdapter({
      apiKey: process.env.RESEND_API_KEY!,
      fromAddress: process.env.RESEND_SENDER_EMAIL!,
      fromName: process.env.EMAIL_FROM_NAME || 'YES GODDESS',
    });
  }

  /**
   * Send a transactional email with automatic suppression list checking
   */
  async sendTransactional(
    params: SendTransactionalParams
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // 1. Check suppression list
      const isSuppressed = await this.isEmailSuppressed(params.email);
      if (isSuppressed) {
        throw new EmailSuppressionError(params.email);
      }

      // 2. Check user preferences if userId provided
      if (params.userId) {
        const preferences = await this.getEmailPreferences(params.userId);
        const category = getCategoryFromTemplate(params.template);

        if (!this.shouldSendEmail(preferences, category)) {
          throw new EmailPreferenceError(
            'User opted out of this email category'
          );
        }
      }

      // 3. Render template
      const emailComponent = renderTemplate(params.template, params.variables || {});

      // 4. Send via provider
      const result = await this.provider.sendEmail({
        to: params.email,
        subject: params.subject,
        react: emailComponent,
        tags: {
          ...params.tags,
          category: getCategoryFromTemplate(params.template),
        },
        metadata: { userId: params.userId, template: params.template },
      });

      if (result.status === 'failed') {
        throw new EmailProviderError('Resend', result.error || 'Unknown error');
      }

      // 5. Log event to database
      await prisma.emailEvent.create({
        data: {
          userId: params.userId,
          email: params.email,
          eventType: 'SENT',
          messageId: result.messageId,
          subject: params.subject,
          templateName: params.template,
          metadata: params.variables,
          sentAt: new Date(),
        },
      });

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      if (
        error instanceof EmailSuppressionError ||
        error instanceof EmailPreferenceError
      ) {
        // Expected errors - user opted out or suppressed
        return { success: false, error: error.message };
      }

      // Unexpected errors
      console.error('Email service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Queue a bulk email campaign (for background jobs)
   */
  async sendCampaign(params: SendCampaignParams): Promise<{ jobId: string }> {
    // Filter recipients based on preferences and suppression list
    const filteredRecipients = await this.filterRecipients(
      params.recipients,
      params.template
    );

    // In a real implementation, this would queue a job with BullMQ
    // For now, we'll simulate with a simple ID
    const jobId = `campaign-${Date.now()}`;

    // Store campaign metadata in Redis for tracking
    await redis.set(
      `email-campaign:${jobId}`,
      JSON.stringify({
        recipientCount: filteredRecipients.length,
        template: params.template,
        status: 'queued',
        createdAt: new Date().toISOString(),
      }),
      'EX',
      86400 // 24 hours
    );

    return { jobId };
  }

  /**
   * Send email digest (daily/weekly summary)
   */
  async sendDigest(params: SendDigestParams): Promise<void> {
    // This would be implemented to gather notifications and send a summary
    // Placeholder for now
    console.log(
      `Sending ${params.frequency} digest to ${params.email} for user ${params.userId}`
    );
  }

  /**
   * Handle email event from webhook (delivery, open, click, bounce, complaint)
   */
  async handleEmailEvent(event: {
    type: string;
    messageId: string;
    timestamp: Date;
    email?: string;
    details?: any;
  }): Promise<void> {
    const eventType = this.mapEventType(event.type);

    // Find existing email event by messageId
    const existingEvent = await prisma.emailEvent.findFirst({
      where: { messageId: event.messageId },
    });

    if (!existingEvent) {
      // Create new event if none exists
      await prisma.emailEvent.create({
        data: {
          messageId: event.messageId,
          email: event.email!,
          eventType,
          ...(eventType === 'SENT' && { sentAt: event.timestamp }),
          ...(eventType === 'DELIVERED' && { deliveredAt: event.timestamp }),
          ...(eventType === 'OPENED' && { openedAt: event.timestamp }),
          ...(eventType === 'CLICKED' && { clickedAt: event.timestamp }),
          ...(eventType === 'BOUNCED' && {
            bouncedAt: event.timestamp,
            bounceReason: event.details?.reason,
          }),
          ...(eventType === 'COMPLAINED' && { complainedAt: event.timestamp }),
          metadata: event.details,
        },
      });
    } else {
      // Update existing event
      await prisma.emailEvent.update({
        where: { id: existingEvent.id },
        data: {
          eventType,
          ...(eventType === 'DELIVERED' && { deliveredAt: event.timestamp }),
          ...(eventType === 'OPENED' && { openedAt: event.timestamp }),
          ...(eventType === 'CLICKED' && {
            clickedAt: event.timestamp,
            clickedUrl: event.details?.url,
          }),
          ...(eventType === 'BOUNCED' && {
            bouncedAt: event.timestamp,
            bounceReason: event.details?.reason,
          }),
          ...(eventType === 'COMPLAINED' && { complainedAt: event.timestamp }),
        },
      });
    }

    // Handle bounces and complaints by adding to suppression list
    if (eventType === 'BOUNCED' || eventType === 'COMPLAINED') {
      await this.addToSuppressionList({
        email: event.email!,
        reason: eventType === 'BOUNCED' ? 'BOUNCE' : 'COMPLAINT',
        details: event.details,
      });
    }
  }

  /**
   * Get delivery status for a message
   */
  async getDeliveryStatus(messageId: string) {
    const events = await prisma.emailEvent.findMany({
      where: { messageId },
      orderBy: { createdAt: 'desc' },
    });

    if (events.length === 0) {
      return null;
    }

    const latestEvent = events[0];
    return {
      messageId,
      email: latestEvent.email,
      status: this.determineStatus(latestEvent),
      events: events.map((e: any) => ({
        type: e.eventType,
        timestamp: e.createdAt,
        details: e.metadata,
      })),
    };
  }

  /**
   * Send verification email for new user registration
   */
  async sendVerificationEmail(params: {
    email: string;
    name: string;
    verificationUrl: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    return this.sendTransactional({
      email: params.email,
      subject: 'Verify your YES GODDESS account',
      template: 'email-verification',
      variables: {
        userName: params.name,
        verificationUrl: params.verificationUrl,
      },
      tags: {
        type: 'verification',
        category: 'system',
      },
    });
  }

  /**
   * Send welcome email after email verification
   */
  async sendWelcomeEmail(params: {
    email: string;
    name: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    return this.sendTransactional({
      email: params.email,
      subject: 'Welcome to YES GODDESS',
      template: 'welcome-email',
      variables: {
        userName: params.name,
      },
      tags: {
        type: 'welcome',
        category: 'system',
      },
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(params: {
    email: string;
    name: string;
    resetUrl: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    return this.sendTransactional({
      email: params.email,
      subject: 'Reset your YES GODDESS password',
      template: 'password-reset',
      variables: {
        userName: params.name,
        resetUrl: params.resetUrl,
      },
      tags: {
        type: 'password-reset',
        category: 'system',
      },
    });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(params: {
    email: string;
    name: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    return this.sendTransactional({
      email: params.email,
      subject: 'Your YES GODDESS password was changed',
      template: 'password-changed',
      variables: {
        userName: params.name,
      },
      tags: {
        type: 'password-changed',
        category: 'system',
      },
    });
  }

  // --- Private helper methods ---

  private async isEmailSuppressed(email: string): Promise<boolean> {
    // Check cache first
    const cached = await redis.get(`email-suppressed:${email}`);
    if (cached) return cached === 'true';

    const suppressed = await prisma.emailSuppression.findUnique({
      where: { email },
    });

    const isSuppressed = !!suppressed;

    // Cache result for 24 hours
    await redis.set(
      `email-suppressed:${email}`,
      isSuppressed.toString(),
      'EX',
      86400
    );

    return isSuppressed;
  }

  private async getEmailPreferences(userId: string) {
    // Check cache first
    const cached = await redis.get(`email-prefs:${userId}`);
    if (cached) return JSON.parse(cached);

    let prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    // Create default preferences if none exist
    if (!prefs) {
      prefs = await prisma.emailPreferences.create({
        data: { userId },
      });
    }

    // Cache for 1 hour
    await redis.set(`email-prefs:${userId}`, JSON.stringify(prefs), 'EX', 3600);

    return prefs;
  }

  private shouldSendEmail(preferences: any, category: string): boolean {
    // System emails always send
    if (category === 'system') return true;

    // Check global unsubscribe
    if (preferences.unsubscribedAt) return false;

    // Check category-specific preferences
    const prefKey = category as keyof typeof preferences;
    return prefKey && typeof preferences[prefKey] === 'boolean'
      ? preferences[prefKey]
      : true;
  }

  private async filterRecipients(
    recipients: Array<{ userId: string; email: string }>,
    template: TemplateKey
  ): Promise<typeof recipients> {
    const category = getCategoryFromTemplate(template);
    const filtered = [];

    for (const recipient of recipients) {
      const suppressed = await this.isEmailSuppressed(recipient.email);
      if (suppressed) continue;

      const prefs = await this.getEmailPreferences(recipient.userId);
      if (!this.shouldSendEmail(prefs, category)) continue;

      filtered.push(recipient);
    }

    return filtered;
  }

  private async addToSuppressionList(params: {
    email: string;
    reason: 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE';
    details?: any;
  }): Promise<void> {
    await prisma.emailSuppression.upsert({
      where: { email: params.email },
      update: {
        reason: params.reason,
        bounceType: params.details?.bounceType,
        bounceReason: params.details?.bounceReason,
        suppressedAt: new Date(),
      },
      create: {
        email: params.email,
        reason: params.reason,
        bounceType: params.details?.bounceType,
        bounceReason: params.details?.bounceReason,
      },
    });

    // Invalidate cache
    await redis.del(`email-suppressed:${params.email}`);
  }

  private mapEventType(resendEventType: string): string {
    const mapping: Record<string, string> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.opened': 'OPENED',
      'email.clicked': 'CLICKED',
      'email.bounced': 'BOUNCED',
      'email.complained': 'COMPLAINED',
      'email.delivery_delayed': 'SENT',
    };
    return mapping[resendEventType] || 'SENT';
  }

  private determineStatus(event: any): string {
    if (event.complainedAt) return 'complained';
    if (event.bouncedAt) return 'bounced';
    if (event.clickedAt) return 'clicked';
    if (event.openedAt) return 'opened';
    if (event.deliveredAt) return 'delivered';
    if (event.sentAt) return 'sent';
    return 'pending';
  }
}

// Export singleton instance
export const emailService = new EmailService();
