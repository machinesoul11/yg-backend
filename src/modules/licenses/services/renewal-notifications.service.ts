/**
 * Renewal Notification Service
 * Orchestrates license renewal notifications at appropriate lifecycle stages
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { differenceInDays, addDays, format } from 'date-fns';

export interface NotificationStage {
  name: string;
  daysBeforeExpiration: number;
  urgencyLevel: 'medium' | 'high' | 'final';
  sent: boolean;
}

export interface RenewalNotificationLog {
  licenseId: string;
  notificationType: string;
  sentAt: Date;
  recipientEmail: string;
  recipientRole: 'brand' | 'creator';
  success: boolean;
  error?: string;
}

export interface NotificationResult {
  licenseId: string;
  notificationsSent: number;
  errors: string[];
  stages: {
    stage: string;
    sent: boolean;
    recipients: string[];
  }[];
}

export class RenewalNotificationService {
  private emailService: EmailService;

  // Notification stages (days before expiration)
  private notificationStages: NotificationStage[] = [
    { name: 'initial_offer', daysBeforeExpiration: 90, urgencyLevel: 'medium', sent: false },
    { name: 'first_reminder', daysBeforeExpiration: 60, urgencyLevel: 'medium', sent: false },
    { name: 'second_reminder', daysBeforeExpiration: 30, urgencyLevel: 'high', sent: false },
    { name: 'final_notice', daysBeforeExpiration: 7, urgencyLevel: 'final', sent: false },
  ];

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Send initial renewal offer to brand
   */
  async sendRenewalOffer(
    licenseId: string,
    renewalData: {
      offerId: string;
      proposedTerms: any;
      pricingBreakdown: any;
    }
  ): Promise<NotificationResult> {
    const license = await this.getLicenseWithDetails(licenseId);
    
    if (!license) {
      throw new Error('License not found');
    }

    const errors: string[] = [];
    let sentCount = 0;
    const recipients: string[] = [];

    // Send to brand primary contact
    try {
      const contactEmail = license.brand.user.email;
      const contactName = license.brand.user.name || license.brand.companyName;

      const daysUntilExpiration = differenceInDays(license.endDate, new Date());
      const feeChangePercent = renewalData.pricingBreakdown.comparison.percentChange;
      const feeChangeString =
        feeChangePercent > 0
          ? `+${feeChangePercent.toFixed(1)}%`
          : feeChangePercent < 0
          ? `${feeChangePercent.toFixed(1)}%`
          : '+0%';

      const adjustmentsSummary = renewalData.pricingBreakdown.adjustments.map(
        (adj: any) =>
          `${adj.label}: ${adj.percentChange > 0 ? '+' : ''}${adj.percentChange.toFixed(1)}%`
      );

      await this.emailService.sendTransactional({
        userId: license.brand.userId,
        email: contactEmail,
        subject: `Renewal Offer Available for ${license.ipAsset.title}`,
        template: 'license-renewal-offer',
        variables: {
          brandName: license.brand.companyName,
          contactName,
          licenseName: `${license.ipAsset.title} - ${license.licenseType}`,
          ipAssetTitle: license.ipAsset.title,
          currentEndDate: format(license.endDate, 'MMM d, yyyy'),
          proposedStartDate: format(renewalData.proposedTerms.startDate, 'MMM d, yyyy'),
          proposedEndDate: format(renewalData.proposedTerms.endDate, 'MMM d, yyyy'),
          originalFeeDollars: `$${(license.feeCents / 100).toLocaleString()}`,
          renewalFeeDollars: `$${(renewalData.proposedTerms.feeCents / 100).toLocaleString()}`,
          feeChange: feeChangeString,
          revSharePercent: `${(renewalData.proposedTerms.revShareBps / 100).toFixed(2)}%`,
          daysUntilExpiration,
          renewalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${licenseId}/renewal/${renewalData.offerId}`,
          adjustmentsSummary,
        },
        tags: {
          licenseId,
          type: 'renewal-offer',
        },
      });

      sentCount++;
      recipients.push(contactEmail);

      // Log notification
      await this.logNotification({
        licenseId,
        notificationType: 'renewal_offer',
        sentAt: new Date(),
        recipientEmail: contactEmail,
        recipientRole: 'brand',
        success: true,
      });

      // Update license metadata with notification timestamp
      await prisma.license.update({
        where: { id: licenseId },
        data: {
          renewalNotifiedAt: new Date(),
          metadata: {
            ...(license.metadata as any),
            renewalNotifications: {
              ...((license.metadata as any)?.renewalNotifications || {}),
              initial_offer: {
                sentAt: new Date().toISOString(),
                offerId: renewalData.offerId,
              },
            },
          },
        },
      });
    } catch (error: any) {
      errors.push(`Failed to send renewal offer: ${error.message}`);
      await this.logNotification({
        licenseId,
        notificationType: 'renewal_offer',
        sentAt: new Date(),
        recipientEmail: license.brand.user.email,
        recipientRole: 'brand',
        success: false,
        error: error.message,
      });
    }

    return {
      licenseId,
      notificationsSent: sentCount,
      errors,
      stages: [
        {
          stage: 'initial_offer',
          sent: sentCount > 0,
          recipients,
        },
      ],
    };
  }

  /**
   * Send renewal reminder based on days until expiration
   */
  async sendRenewalReminder(licenseId: string): Promise<NotificationResult> {
    const license = await this.getLicenseWithDetails(licenseId);
    
    if (!license) {
      throw new Error('License not found');
    }

    const daysUntilExpiration = differenceInDays(license.endDate, new Date());
    
    // Determine which stage this reminder is for
    let stage: NotificationStage | null = null;
    for (const s of this.notificationStages) {
      if (Math.abs(daysUntilExpiration - s.daysBeforeExpiration) <= 1) {
        stage = s;
        break;
      }
    }

    if (!stage) {
      throw new Error(`No reminder stage found for ${daysUntilExpiration} days until expiration`);
    }

    // Check if this stage was already sent
    const notifications = (license.metadata as any)?.renewalNotifications || {};
    if (notifications[stage.name]?.sentAt) {
      // Already sent this stage, skip
      return {
        licenseId,
        notificationsSent: 0,
        errors: ['Notification already sent for this stage'],
        stages: [
          {
            stage: stage.name,
            sent: true,
            recipients: [],
          },
        ],
      };
    }

    const errors: string[] = [];
    let sentCount = 0;
    const recipients: string[] = [];

    // Send to brand
    try {
      const contactEmail = license.brand.user.email;
      const contactName = license.brand.user.name || license.brand.companyName;

      // Get renewal offer from metadata if it exists
      const renewalOffer = (license.metadata as any)?.renewalOffer;
      const renewalFeeDollars = renewalOffer
        ? `$${(renewalOffer.terms.feeCents / 100).toLocaleString()}`
        : `$${(license.feeCents / 100).toLocaleString()}`;

      await this.emailService.sendTransactional({
        userId: license.brand.userId,
        email: contactEmail,
        subject:
          stage.urgencyLevel === 'final'
            ? `FINAL NOTICE: License Expires in ${daysUntilExpiration} Days`
            : `Renewal Reminder: License Expires in ${daysUntilExpiration} Days`,
        template: 'license-renewal-reminder',
        variables: {
          brandName: license.brand.companyName,
          contactName,
          licenseName: `${license.ipAsset.title} - ${license.licenseType}`,
          ipAssetTitle: license.ipAsset.title,
          expirationDate: format(license.endDate, 'MMM d, yyyy'),
          daysRemaining: daysUntilExpiration,
          renewalFeeDollars,
          renewalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${licenseId}/renewal`,
          urgencyLevel: stage.urgencyLevel,
        },
        tags: {
          licenseId,
          type: `renewal-reminder-${stage.name}`,
          urgency: stage.urgencyLevel,
        },
      });

      sentCount++;
      recipients.push(contactEmail);

      await this.logNotification({
        licenseId,
        notificationType: `renewal_reminder_${stage.name}`,
        sentAt: new Date(),
        recipientEmail: contactEmail,
        recipientRole: 'brand',
        success: true,
      });

      // Update metadata
      await prisma.license.update({
        where: { id: licenseId },
        data: {
          metadata: {
            ...(license.metadata as any),
            renewalNotifications: {
              ...notifications,
              [stage.name]: {
                sentAt: new Date().toISOString(),
                daysBeforeExpiration: daysUntilExpiration,
              },
            },
          },
        },
      });
    } catch (error: any) {
      errors.push(`Failed to send renewal reminder: ${error.message}`);
      await this.logNotification({
        licenseId,
        notificationType: `renewal_reminder_${stage.name}`,
        sentAt: new Date(),
        recipientEmail: license.brand.user.email,
        recipientRole: 'brand',
        success: false,
        error: error.message,
      });
    }

    return {
      licenseId,
      notificationsSent: sentCount,
      errors,
      stages: [
        {
          stage: stage.name,
          sent: sentCount > 0,
          recipients,
        },
      ],
    };
  }

  /**
   * Send renewal completion confirmation to brand and creators
   */
  async sendRenewalComplete(
    originalLicenseId: string,
    newLicenseId: string
  ): Promise<NotificationResult> {
    const [originalLicense, newLicense] = await Promise.all([
      this.getLicenseWithDetails(originalLicenseId),
      this.getLicenseWithDetails(newLicenseId),
    ]);

    if (!originalLicense || !newLicense) {
      throw new Error('License not found');
    }

    const errors: string[] = [];
    let sentCount = 0;
    const recipients: string[] = [];

    // Send to brand
    try {
      const contactEmail = newLicense.brand.user.email;
      const contactName = newLicense.brand.user.name || newLicense.brand.companyName;
      
      const creatorNames = newLicense.ipAsset.ownerships.map(
        (o) => o.creator.stageName || o.creator.user.name || 'Creator'
      );

      await this.emailService.sendTransactional({
        userId: newLicense.brand.userId,
        email: contactEmail,
        subject: `License Renewal Confirmed - ${newLicense.ipAsset.title}`,
        template: 'license-renewal-complete',
        variables: {
          recipientName: contactName,
          recipientType: 'brand',
          licenseName: `${newLicense.ipAsset.title} - ${newLicense.licenseType}`,
          ipAssetTitle: newLicense.ipAsset.title,
          newStartDate: format(newLicense.startDate, 'MMM d, yyyy'),
          newEndDate: format(newLicense.endDate, 'MMM d, yyyy'),
          renewalFeeDollars: `$${(newLicense.feeCents / 100).toLocaleString()}`,
          revSharePercent: `${(newLicense.revShareBps / 100).toFixed(2)}%`,
          confirmationNumber: newLicense.id.slice(-12).toUpperCase(),
          licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${newLicense.id}`,
          creatorNames,
        },
        tags: {
          licenseId: newLicense.id,
          originalLicenseId,
          type: 'renewal-complete',
        },
      });

      sentCount++;
      recipients.push(contactEmail);

      await this.logNotification({
        licenseId: newLicenseId,
        notificationType: 'renewal_complete_brand',
        sentAt: new Date(),
        recipientEmail: contactEmail,
        recipientRole: 'brand',
        success: true,
      });
    } catch (error: any) {
      errors.push(`Failed to send brand confirmation: ${error.message}`);
    }

    // Send to creators
    for (const ownership of newLicense.ipAsset.ownerships) {
      try {
        const creatorEmail = ownership.creator.user.email;
        const creatorName = ownership.creator.stageName || ownership.creator.user.name || 'Creator';

        await this.emailService.sendTransactional({
          userId: ownership.creator.userId,
          email: creatorEmail,
          subject: `License Renewed - ${newLicense.ipAsset.title}`,
          template: 'license-renewal-complete',
          variables: {
            recipientName: creatorName,
            recipientType: 'creator',
            licenseName: `${newLicense.ipAsset.title} - ${newLicense.licenseType}`,
            ipAssetTitle: newLicense.ipAsset.title,
            newStartDate: format(newLicense.startDate, 'MMM d, yyyy'),
            newEndDate: format(newLicense.endDate, 'MMM d, yyyy'),
            renewalFeeDollars: `$${(newLicense.feeCents / 100).toLocaleString()}`,
            revSharePercent: `${(newLicense.revShareBps / 100).toFixed(2)}%`,
            confirmationNumber: newLicense.id.slice(-12).toUpperCase(),
            licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${newLicense.id}`,
            brandName: newLicense.brand.companyName,
          },
          tags: {
            licenseId: newLicense.id,
            originalLicenseId,
            type: 'renewal-complete',
          },
        });

        sentCount++;
        recipients.push(creatorEmail);

        await this.logNotification({
          licenseId: newLicenseId,
          notificationType: 'renewal_complete_creator',
          sentAt: new Date(),
          recipientEmail: creatorEmail,
          recipientRole: 'creator',
          success: true,
        });
      } catch (error: any) {
        errors.push(`Failed to send creator confirmation to ${ownership.creator.user.email}: ${error.message}`);
      }
    }

    return {
      licenseId: newLicenseId,
      notificationsSent: sentCount,
      errors,
      stages: [
        {
          stage: 'renewal_complete',
          sent: sentCount > 0,
          recipients,
        },
      ],
    };
  }

  /**
   * Check and send pending notifications for all eligible licenses
   */
  async processPendingNotifications(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    results: NotificationResult[];
  }> {
    const results: NotificationResult[] = [];
    let processed = 0;
    let sent = 0;
    let failed = 0;

    // Find licenses that need notifications
    const eligibleLicenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: new Date(),
          lte: addDays(new Date(), 90), // Within 90 days of expiration
        },
        deletedAt: null,
      },
      include: {
        brand: {
          include: { user: true },
        },
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: { user: true },
                },
              },
            },
          },
        },
      },
    });

    for (const license of eligibleLicenses) {
      try {
        processed++;
        const daysUntilExpiration = differenceInDays(license.endDate, new Date());
        
        // Check which notification stage this license needs
        const notifications = (license.metadata as any)?.renewalNotifications || {};
        
        for (const stage of this.notificationStages) {
          // Check if it's time for this stage and it hasn't been sent
          if (
            Math.abs(daysUntilExpiration - stage.daysBeforeExpiration) <= 1 &&
            !notifications[stage.name]?.sentAt
          ) {
            const result = await this.sendRenewalReminder(license.id);
            results.push(result);
            
            if (result.notificationsSent > 0) {
              sent += result.notificationsSent;
            }
            if (result.errors.length > 0) {
              failed++;
            }
            
            break; // Only send one stage at a time
          }
        }
      } catch (error: any) {
        console.error(`Failed to process notifications for license ${license.id}:`, error);
        failed++;
      }
    }

    return {
      processed,
      sent,
      failed,
      results,
    };
  }

  /**
   * Get license with all necessary details for notifications
   */
  private async getLicenseWithDetails(licenseId: string) {
    return prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: {
          include: {
            user: true,
          },
        },
        ipAsset: {
          include: {
            ownerships: {
              where: {
                OR: [
                  { endDate: null },
                  { endDate: { gt: new Date() } },
                ],
              },
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Log notification to audit trail
   */
  private async logNotification(log: RenewalNotificationLog): Promise<void> {
    try {
      await prisma.event.create({
        data: {
          eventType: `license.${log.notificationType}`,
          source: 'system',
          actorType: 'system',
          actorId: 'renewal-notification-service',
          licenseId: log.licenseId,
          propsJson: {
            recipientEmail: log.recipientEmail,
            recipientRole: log.recipientRole,
            success: log.success,
            error: log.error,
            sentAt: log.sentAt.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Failed to log renewal notification:', error);
    }
  }
}

export const renewalNotificationService = new RenewalNotificationService();
