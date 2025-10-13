/**
 * Notification Email Service
 * 
 * Handles email delivery for notifications
 * Integrates with existing email service and React Email templates
 */

import { PrismaClient, Notification, NotificationType, NotificationPriority } from '@prisma/client';
import { EmailService } from '@/lib/services/email/email.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { redis } from '@/lib/redis';

export interface NotificationEmailData {
  notification: Notification;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export class NotificationEmailService {
  private emailService: EmailService;
  private preferencesService: NotificationPreferencesService;

  constructor(
    private prisma: PrismaClient
  ) {
    this.emailService = new EmailService();
    this.preferencesService = new NotificationPreferencesService(prisma, redis);
  }

  /**
   * Send immediate notification email
   */
  async sendImmediateEmail(notificationId: string): Promise<boolean> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!notification) {
      console.error(`[NotificationEmail] Notification ${notificationId} not found`);
      return false;
    }

    // Check if user wants email for this notification type
    const shouldSend = await this.preferencesService.shouldSendNotification(
      notification.userId,
      notification.type,
      'email'
    );

    if (!shouldSend) {
      console.log(`[NotificationEmail] User ${notification.userId} has disabled email for ${notification.type}`);
      return false;
    }

    // Check priority-based email rules
    const preferences = await this.preferencesService.getPreferences(notification.userId);
    if (preferences.digestFrequency !== 'IMMEDIATE') {
      // User wants digest, not immediate emails
      // Only send immediate for URGENT/HIGH priority
      if (!['URGENT', 'HIGH'].includes(notification.priority)) {
        console.log(`[NotificationEmail] Notification ${notificationId} will be included in digest`);
        return false;
      }
    }

    // Send email based on notification type
    return this.sendEmailByType({
      notification,
      user: notification.user,
    });
  }

  /**
   * Send digest email with multiple notifications
   */
  async sendDigestEmail(userId: string, notifications: Notification[]): Promise<boolean> {
    if (notifications.length === 0) {
      return false;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      console.error(`[NotificationEmail] User ${userId} not found for digest`);
      return false;
    }

    // Group notifications by type
    const grouped = this.groupNotificationsByType(notifications);

    // Format digest content
    const digestSections = Object.entries(grouped).map(([type, notifs]) => ({
      type,
      count: notifs.length,
      notifications: notifs.map(n => ({
        title: n.title,
        message: n.message,
        actionUrl: n.actionUrl,
        createdAt: n.createdAt,
      })),
    }));

    // Send digest email using existing template or create new one
    try {
      await this.emailService.sendTransactional({
        userId: user.id,
        email: user.email,
        subject: `You have ${notifications.length} notification${notifications.length === 1 ? '' : 's'}`,
        template: 'notification-digest' as any, // Will need to create this template
        variables: {
          userName: user.name || 'there',
          sections: digestSections,
          totalCount: notifications.length,
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/notifications`,
        },
      });

      console.log(`[NotificationEmail] Sent digest to ${user.email} with ${notifications.length} notifications`);
      return true;
    } catch (error) {
      console.error(`[NotificationEmail] Failed to send digest to ${user.email}:`, error);
      return false;
    }
  }

  /**
   * Send email based on notification type
   */
  private async sendEmailByType(data: NotificationEmailData): Promise<boolean> {
    const { notification, user } = data;
    const metadata = notification.metadata as any;

    try {
      switch (notification.type) {
        case 'LICENSE':
          return this.sendLicenseNotificationEmail(data, metadata);
        
        case 'PAYOUT':
          return this.sendPayoutNotificationEmail(data, metadata);
        
        case 'ROYALTY':
          return this.sendRoyaltyNotificationEmail(data, metadata);
        
        case 'PROJECT':
          return this.sendProjectNotificationEmail(data, metadata);
        
        case 'SYSTEM':
          return this.sendSystemNotificationEmail(data);
        
        case 'MESSAGE':
          // Messages handled by MessageNotificationService
          return false;
        
        default:
          console.warn(`[NotificationEmail] Unknown notification type: ${notification.type}`);
          return false;
      }
    } catch (error) {
      console.error(`[NotificationEmail] Failed to send ${notification.type} email:`, error);
      return false;
    }
  }

  private async sendLicenseNotificationEmail(
    data: NotificationEmailData,
    metadata: any
  ): Promise<boolean> {
    const { notification, user } = data;
    
    // Determine which license email template to use based on metadata
    if (metadata?.expiryDays) {
      // License expiry warning
      const days = metadata.expiryDays;
      let template: string;
      
      if (days === 90) template = 'license-expiry-90-day';
      else if (days === 60) template = 'license-expiry-60-day';
      else if (days === 30) template = 'license-expiry-30-day';
      else template = 'license-expiry-notice';

      await this.emailService.sendTransactional({
        userId: user.id,
        email: user.email,
        subject: notification.title,
        template: template as any,
        variables: {
          userName: user.name || 'there',
          assetName: metadata.assetName || 'your asset',
          brandName: metadata.brandName || 'the brand',
          expiryDate: metadata.expiryDate,
          daysUntilExpiry: days,
          licenseUrl: notification.actionUrl || `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${metadata.licenseId}`,
        },
      });
    } else {
      // Generic license notification
      await this.emailService.sendTransactional({
        userId: user.id,
        email: user.email,
        subject: notification.title,
        template: 'transaction-receipt' as any, // Generic template
        variables: {
          recipientName: user.name || 'there',
          transactionId: metadata.licenseId || 'N/A',
          transactionDate: notification.createdAt,
          description: notification.message,
        },
      });
    }

    return true;
  }

  private async sendPayoutNotificationEmail(
    data: NotificationEmailData,
    metadata: any
  ): Promise<boolean> {
    const { notification, user } = data;
    
    const isSuccess = metadata?.status === 'COMPLETED';
    const template = isSuccess ? 'payout-confirmation' : 'transaction-receipt';

    await this.emailService.sendTransactional({
      userId: user.id,
      email: user.email,
      subject: notification.title,
      template: template as any,
      variables: {
        userName: user.name || 'there',
        amount: metadata?.amount || '0.00',
        currency: metadata?.currency || 'USD',
        ...(isSuccess ? {
          payoutMethod: 'Bank Transfer',
          estimatedArrival: metadata?.estimatedArrival || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          transactionId: metadata?.payoutId || 'N/A',
        } : {
          recipientName: user.name || 'there',
          transactionId: metadata?.payoutId || 'N/A',
          transactionDate: notification.createdAt,
          description: notification.message,
        }),
      },
    });

    return true;
  }

  private async sendRoyaltyNotificationEmail(
    data: NotificationEmailData,
    metadata: any
  ): Promise<boolean> {
    const { notification, user } = data;
    
    await this.emailService.sendTransactional({
      userId: user.id,
      email: user.email,
      subject: notification.title,
      template: 'royalty-statement-available' as any,
      variables: {
        creatorName: user.name || 'there',
        period: metadata?.period || 'this period',
        totalEarnings: metadata?.totalEarnings || '0.00',
        statementUrl: notification.actionUrl || `${process.env.NEXT_PUBLIC_APP_URL}/royalties/${metadata?.statementId}`,
      },
    });

    return true;
  }

  private async sendProjectNotificationEmail(
    data: NotificationEmailData,
    metadata: any
  ): Promise<boolean> {
    const { notification, user } = data;
    
    // Check if it's a project invitation or match
    if (metadata?.type === 'invitation') {
      await this.emailService.sendTransactional({
        userId: user.id,
        email: user.email,
        subject: notification.title,
        template: 'project-invitation',
        variables: {
          creatorName: user.name || 'there',
          projectName: metadata.projectName || 'Project',
          brandName: metadata.brandName || 'Brand',
          budgetRange: metadata.budgetRange || 'TBD',
          timeline: metadata.timeline || 'TBD',
          briefExcerpt: notification.message,
          projectUrl: notification.actionUrl || `${process.env.NEXT_PUBLIC_APP_URL}/projects/${metadata.projectId}`,
          responseDeadline: metadata.responseDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    } else {
      // Project match notification
      await this.emailService.sendTransactional({
        userId: user.id,
        email: user.email,
        subject: notification.title,
        template: 'project-match-notification' as any,
        variables: {
          creatorName: user.name || 'there',
          projectName: metadata.projectName || 'Project',
          brandName: metadata.brandName || 'Brand',
          projectDescription: notification.message,
          budgetRange: metadata.budgetRange || 'TBD',
          projectUrl: notification.actionUrl || `${process.env.NEXT_PUBLIC_APP_URL}/projects/${metadata.projectId}`,
        },
      });
    }

    return true;
  }

  private async sendSystemNotificationEmail(
    data: NotificationEmailData
  ): Promise<boolean> {
    const { notification, user } = data;
    
    // System notifications use a generic format
    await this.emailService.sendTransactional({
      userId: user.id,
      email: user.email,
      subject: notification.title,
      template: 'transaction-receipt' as any, // Using generic template
      variables: {
        recipientName: user.name || 'there',
        transactionId: 'SYSTEM',
        transactionDate: notification.createdAt,
        description: notification.message,
      },
    });

    return true;
  }

  private groupNotificationsByType(notifications: Notification[]): Record<string, Notification[]> {
    return notifications.reduce((acc, notif) => {
      if (!acc[notif.type]) {
        acc[notif.type] = [];
      }
      acc[notif.type].push(notif);
      return acc;
    }, {} as Record<string, Notification[]>);
  }
}
