/**
 * License Expiry Monitor Service
 * Central service for monitoring and processing license expiry lifecycle
 * Handles multi-stage notifications, grace periods, and post-expiry actions
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { addDays, differenceInDays, startOfDay, endOfDay, isBefore, isAfter } from 'date-fns';
import type { License, LicenseStatus } from '@prisma/client';

const emailService = new EmailService();
const auditService = new AuditService(prisma);

export interface ExpiryNotificationStage {
  daysBeforeExpiry: number;
  fieldName: 'ninetyDayNoticeSentAt' | 'sixtyDayNoticeSentAt' | 'thirtyDayNoticeSentAt';
  urgencyLevel: 'informational' | 'reminder' | 'urgent';
}

export interface LicenseWithDetails extends License {
  ipAsset: {
    id: string;
    title: string;
    ownerships: Array<{
      creator: {
        id: string;
        displayName: string | null;
        user: {
          id: string;
          email: string;
          name: string | null;
        };
      };
    }>;
  };
  brand: {
    id: string;
    companyName: string;
    userId: string;
    user: {
      id: string;
      email: string;
      name: string | null;
    };
  };
}

export interface ExpiryMonitoringResult {
  stage: string;
  licensesFound: number;
  notificationsSent: number;
  errors: string[];
}

export interface ExpiryProcessingResult {
  processed: number;
  gracePeriodApplied: number;
  fullyExpired: number;
  errors: string[];
}

export class LicenseExpiryMonitorService {
  // Configuration for notification stages
  private readonly notificationStages: ExpiryNotificationStage[] = [
    {
      daysBeforeExpiry: 90,
      fieldName: 'ninetyDayNoticeSentAt',
      urgencyLevel: 'informational',
    },
    {
      daysBeforeExpiry: 60,
      fieldName: 'sixtyDayNoticeSentAt',
      urgencyLevel: 'reminder',
    },
    {
      daysBeforeExpiry: 30,
      fieldName: 'thirtyDayNoticeSentAt',
      urgencyLevel: 'urgent',
    },
  ];

  // Default grace period in days (can be overridden per license)
  private readonly DEFAULT_GRACE_PERIOD_DAYS = 7;

  /**
   * Find licenses needing 90-day expiry notice
   */
  async findLicensesNeedingNinetyDayNotice(): Promise<LicenseWithDetails[]> {
    return this.findLicensesForNotificationStage(90, 'ninetyDayNoticeSentAt');
  }

  /**
   * Find licenses needing 60-day expiry notice
   */
  async findLicensesNeedingSixtyDayNotice(): Promise<LicenseWithDetails[]> {
    return this.findLicensesForNotificationStage(60, 'sixtyDayNoticeSentAt');
  }

  /**
   * Find licenses needing 30-day expiry notice
   */
  async findLicensesNeedingThirtyDayNotice(): Promise<LicenseWithDetails[]> {
    return this.findLicensesForNotificationStage(30, 'thirtyDayNoticeSentAt');
  }

  /**
   * Generic method to find licenses at a specific notification threshold
   */
  private async findLicensesForNotificationStage(
    daysBeforeExpiry: number,
    notificationField: 'ninetyDayNoticeSentAt' | 'sixtyDayNoticeSentAt' | 'thirtyDayNoticeSentAt'
  ): Promise<LicenseWithDetails[]> {
    const now = new Date();
    const targetDate = addDays(now, daysBeforeExpiry);

    // Use a window of ±1 day to account for job scheduling variations
    const windowStart = startOfDay(addDays(now, daysBeforeExpiry - 1));
    const windowEnd = endOfDay(addDays(now, daysBeforeExpiry + 1));

    const licenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON' as any] },
        endDate: {
          gte: windowStart,
          lte: windowEnd,
        },
        [notificationField]: null, // Haven't sent this notification yet
        deletedAt: null,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
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
        brand: {
          include: {
            user: true,
          },
        },
      },
    }) as LicenseWithDetails[];

    return licenses;
  }

  /**
   * Send 90-day expiry notice
   */
  async sendNinetyDayNotice(license: LicenseWithDetails): Promise<void> {
    await this.sendExpiryNotification(license, 90, 'informational');
    
    // Update notification timestamp
    await prisma.license.update({
      where: { id: license.id },
      data: { ninetyDayNoticeSentAt: new Date() } as any,
    });

    // Log event
    await this.logExpiryNotificationEvent(license, 90);
  }

  /**
   * Send 60-day expiry notice
   */
  async sendSixtyDayNotice(license: LicenseWithDetails): Promise<void> {
    await this.sendExpiryNotification(license, 60, 'reminder');
    
    // Update notification timestamp
    await prisma.license.update({
      where: { id: license.id },
      data: { sixtyDayNoticeSentAt: new Date() } as any,
    });

    // Log event
    await this.logExpiryNotificationEvent(license, 60);
  }

  /**
   * Send 30-day expiry notice
   */
  async sendThirtyDayNotice(license: LicenseWithDetails): Promise<void> {
    await this.sendExpiryNotification(license, 30, 'urgent');
    
    // Update notification timestamp
    await prisma.license.update({
      where: { id: license.id },
      data: { thirtyDayNoticeSentAt: new Date() } as any,
    });

    // Log event
    await this.logExpiryNotificationEvent(license, 30);

    // Also create in-app notification for 30-day notice
    await this.createInAppNotification(license, 30);
  }

  /**
   * Core notification sending logic
   */
  private async sendExpiryNotification(
    license: LicenseWithDetails,
    daysUntilExpiry: number,
    urgencyLevel: 'informational' | 'reminder' | 'urgent'
  ): Promise<void> {
    const expiryDate = license.endDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const renewalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}/renew`;
    const licenseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`;

    // Send to brand
    try {
      await emailService.sendTransactional({
        userId: license.brand.userId,
        email: license.brand.user.email,
        subject: this.getEmailSubject(daysUntilExpiry, license.ipAsset.title),
        template: this.getTemplateForStage(daysUntilExpiry),
        variables: {
          userName: license.brand.user.name || license.brand.companyName,
          licenseName: license.ipAsset.title,
          brandName: license.brand.companyName,
          expiryDate,
          daysRemaining: daysUntilExpiry.toString(),
          renewalUrl,
          licenseUrl,
          autoRenewEnabled: license.autoRenew,
        } as any,
      });
    } catch (error: any) {
      console.error(`[ExpiryMonitor] Failed to notify brand ${license.brand.id}:`, error);
      throw new Error(`Failed to notify brand: ${error.message}`);
    }

    // Send to all creators with ownership stakes
    for (const ownership of license.ipAsset.ownerships) {
      try {
        await emailService.sendTransactional({
          userId: ownership.creator.user.id,
          email: ownership.creator.user.email,
          subject: this.getEmailSubject(daysUntilExpiry, license.ipAsset.title),
          template: this.getTemplateForStage(daysUntilExpiry),
          variables: {
            userName: (ownership.creator as any).displayName || ownership.creator.user.name || 'Creator',
            licenseName: license.ipAsset.title,
            brandName: license.brand.companyName,
            expiryDate,
            daysRemaining: daysUntilExpiry.toString(),
            licenseUrl,
            recipientRole: 'creator',
          } as any,
        });
      } catch (error: any) {
        console.error(
          `[ExpiryMonitor] Failed to notify creator ${ownership.creator.id}:`,
          error
        );
        // Don't throw - continue with other creators
      }
    }
  }

  /**
   * Get email subject based on notification stage
   */
  private getEmailSubject(daysUntilExpiry: number, assetTitle: string): string {
    if (daysUntilExpiry === 90) {
      return `License Expiry Notice: ${assetTitle}`;
    } else if (daysUntilExpiry === 60) {
      return `License Expires in 60 Days: ${assetTitle}`;
    } else if (daysUntilExpiry === 30) {
      return `Action Required: License Expires in 30 Days`;
    }
    return `License Expiring Soon: ${assetTitle}`;
  }

  /**
   * Get template key based on notification stage
   */
  private getTemplateForStage(
    daysUntilExpiry: number
  ): 'license-expiry-90-day' | 'license-expiry-60-day' | 'license-expiry-30-day' {
    if (daysUntilExpiry === 90) {
      return 'license-expiry-90-day';
    } else if (daysUntilExpiry === 60) {
      return 'license-expiry-60-day';
    } else {
      return 'license-expiry-30-day';
    }
  }

  /**
   * Create in-app notification for urgent expiry notices
   */
  private async createInAppNotification(
    license: LicenseWithDetails,
    daysUntilExpiry: number
  ): Promise<void> {
    // Notify brand
    await prisma.notification.create({
      data: {
        userId: license.brand.userId,
        type: 'LICENSE',
        priority: daysUntilExpiry <= 30 ? 'HIGH' : 'MEDIUM',
        title: `License Expiring in ${daysUntilExpiry} Days`,
        message: `Your license for "${license.ipAsset.title}" expires on ${license.endDate.toLocaleDateString()}. Review renewal options.`,
        actionUrl: `/licenses/${license.id}`,
        metadata: {
          licenseId: license.id,
          daysUntilExpiry,
          notificationType: 'expiry',
        },
      },
    });

    // Notify all creators
    for (const ownership of license.ipAsset.ownerships) {
      await prisma.notification.create({
        data: {
          userId: ownership.creator.user.id,
          type: 'LICENSE',
          priority: daysUntilExpiry <= 30 ? 'HIGH' : 'MEDIUM',
          title: `License Expiring in ${daysUntilExpiry} Days`,
          message: `The license for "${license.ipAsset.title}" with ${license.brand.companyName} expires on ${license.endDate.toLocaleDateString()}.`,
          actionUrl: `/licenses/${license.id}`,
          metadata: {
            licenseId: license.id,
            daysUntilExpiry,
            notificationType: 'expiry',
          },
        },
      });
    }
  }

  /**
   * Log expiry notification event
   */
  private async logExpiryNotificationEvent(
    license: LicenseWithDetails,
    daysUntilExpiry: number
  ): Promise<void> {
    await prisma.event.create({
      data: {
        source: 'system',
        eventType: 'license.expiry_notification_sent',
        actorType: 'system',
        propsJson: {
          licenseId: license.id,
          brandId: license.brandId,
          ipAssetId: license.ipAssetId,
          daysUntilExpiry,
          expiryDate: license.endDate.toISOString(),
          autoRenewEnabled: license.autoRenew,
        },
      },
    });

    await auditService.log({
      action: 'expiry_notification_sent',
      entityType: 'license',
      entityId: license.id,
      ipAddress: undefined,
      userAgent: 'system',
      before: {},
      after: {
        notificationStage: `${daysUntilExpiry}_day_notice`,
        sentAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Find licenses that have reached their end date and need expiry processing
   */
  async findLicensesNeedingExpiry(): Promise<LicenseWithDetails[]> {
    const now = new Date();

    const licenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
        endDate: { lt: now },
        deletedAt: null,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
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
        brand: {
          include: {
            user: true,
          },
        },
      },
    }) as LicenseWithDetails[];

    return licenses;
  }

  /**
   * Process expired licenses with grace period handling
   */
  async processExpiredLicense(license: LicenseWithDetails): Promise<void> {
    const gracePeriodDays = (license as any).gracePeriodDays || this.DEFAULT_GRACE_PERIOD_DAYS;

    if (gracePeriodDays > 0) {
      // Apply grace period
      const gracePeriodEndDate = addDays(license.endDate, gracePeriodDays);

      await prisma.license.update({
        where: { id: license.id },
        data: {
          status: 'EXPIRING_SOON' as any, // Keep functionally active during grace period
          gracePeriodEndDate,
        } as any,
      });

      // Send grace period notification
      await this.sendGracePeriodNotification(license, gracePeriodEndDate);

    // Log event
    await prisma.event.create({
      data: {
        source: 'system',
        eventType: 'license.grace_period_started',
        actorType: 'system',
        propsJson: {
          licenseId: license.id,
          gracePeriodDays,
          gracePeriodEndDate: gracePeriodEndDate.toISOString(),
        },
      },
    });
    } else {
      // No grace period - expire immediately
      await this.expireLicense(license);
    }
  }

  /**
   * Send grace period notification
   */
  private async sendGracePeriodNotification(
    license: LicenseWithDetails,
    gracePeriodEndDate: Date
  ): Promise<void> {
    const gracePeriodEndFormatted = gracePeriodEndDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const licenseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`;
    const renewalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}/renew`;

    // Send grace period notification
    await emailService.sendTransactional({
      userId: license.brand.userId,
      email: license.brand.user.email,
      subject: `Grace Period Active: ${license.ipAsset.title}`,
      template: 'license-expiry-30-day', // Use urgent template for grace period
      variables: {
        userName: license.brand.user.name || license.brand.companyName,
        licenseName: license.ipAsset.title,
        brandName: license.brand.companyName,
        expiryDate: gracePeriodEndFormatted,
        daysRemaining: ((license as any).gracePeriodDays || this.DEFAULT_GRACE_PERIOD_DAYS).toString(),
        renewalUrl,
        licenseUrl,
        gracePeriodActive: true,
      } as any,
    });
  }

  /**
   * Find licenses where grace period has ended
   */
  async findLicensesWithExpiredGracePeriod(): Promise<LicenseWithDetails[]> {
    const now = new Date();

    const licenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON' as any] },
        gracePeriodEndDate: {
          not: null,
          lt: now,
        } as any,
        deletedAt: null,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
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
        brand: {
          include: {
            user: true,
          },
        },
      },
    }) as LicenseWithDetails[];

    return licenses;
  }

  /**
   * Expire a license (final expiry)
   */
  async expireLicense(license: LicenseWithDetails): Promise<void> {
    const now = new Date();

    // Update license status to EXPIRED
    await prisma.license.update({
      where: { id: license.id },
      data: {
        status: 'EXPIRED',
        expiredAt: now,
      },
    });

    // Send expiry confirmation notifications
    await this.sendExpiryConfirmationNotifications(license);

    // Log event and audit trail
    await prisma.event.create({
      data: {
        source: 'system',
        eventType: 'license.expired',
        actorType: 'system',
        propsJson: {
          licenseId: license.id,
          brandId: license.brandId,
          ipAssetId: license.ipAssetId,
          endDate: license.endDate.toISOString(),
          expiredAt: now.toISOString(),
        },
      },
    });

    await auditService.log({
      action: 'license_expired',
      entityType: 'license',
      entityId: license.id,
      ipAddress: undefined,
      userAgent: 'system',
      before: { status: license.status },
      after: { status: 'EXPIRED', expiredAt: now.toISOString() },
    });

    // Execute post-expiry actions
    await this.executePostExpiryActions(license);
  }

  /**
   * Send expiry confirmation notifications
   */
  private async sendExpiryConfirmationNotifications(
    license: LicenseWithDetails
  ): Promise<void> {
    const licenseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`;

    // Notify brand
    try {
      await emailService.sendTransactional({
        userId: license.brand.userId,
        email: license.brand.user.email,
        subject: `License Expired: ${license.ipAsset.title}`,
        template: 'license-expiry-30-day', // Reuse template with different context
        variables: {
          userName: license.brand.user.name || license.brand.companyName,
          licenseName: license.ipAsset.title,
          brandName: license.brand.companyName,
          expiryDate: license.endDate.toLocaleDateString(),
          daysRemaining: '0',
          licenseUrl,
          expired: true,
        },
      });
    } catch (error: any) {
      console.error(`[ExpiryMonitor] Failed to send expiry confirmation to brand:`, error);
    }

    // Notify creators
    for (const ownership of license.ipAsset.ownerships) {
      try {
        await emailService.sendTransactional({
          userId: ownership.creator.user.id,
          email: ownership.creator.user.email,
          subject: `License Expired: ${license.ipAsset.title}`,
          template: 'license-expiry-30-day',
          variables: {
            userName: ownership.creator.displayName || ownership.creator.user.name || 'Creator',
            licenseName: license.ipAsset.title,
            brandName: license.brand.companyName,
            expiryDate: license.endDate.toLocaleDateString(),
            daysRemaining: '0',
            licenseUrl,
            expired: true,
            recipientRole: 'creator',
          },
        });
      } catch (error: any) {
        console.error(`[ExpiryMonitor] Failed to send expiry confirmation to creator:`, error);
      }
    }

    // Create in-app notifications
    await prisma.notification.create({
      data: {
        userId: license.brand.userId,
        type: 'LICENSE',
        priority: 'HIGH',
        title: 'License Expired',
        message: `Your license for "${license.ipAsset.title}" has expired.`,
        actionUrl: `/licenses/${license.id}`,
        metadata: {
          licenseId: license.id,
          notificationType: 'expired',
        },
      },
    });
  }

  /**
   * Execute post-expiry actions
   */
  private async executePostExpiryActions(license: LicenseWithDetails): Promise<void> {
    // Update related project status if all licenses are expired
    if (license.projectId) {
      const activeLicensesInProject = await prisma.license.count({
        where: {
          projectId: license.projectId,
          status: { in: ['ACTIVE', 'EXPIRING_SOON' as any] },
          deletedAt: null,
        },
      });

      if (activeLicensesInProject === 0) {
        // All licenses expired - archive project
        await prisma.project.update({
          where: { id: license.projectId },
          data: { status: 'COMPLETED' },
        });
      }
    }

    // Schedule re-engagement notification for 30 days post-expiry
    // This would integrate with the scheduled email system
    const reEngagementDate = addDays(new Date(), 30);
    
    await prisma.scheduledEmail.create({
      data: {
        recipientUserId: license.brand.userId,
        recipientEmail: license.brand.user.email,
        emailType: 'license-re-engagement',
        templateId: 'license-renewal-offer',
        subject: `Relicense "${license.ipAsset.title}"?`,
        scheduledSendTime: reEngagementDate,
        personalizationData: {
          brandName: license.brand.companyName,
          assetTitle: license.ipAsset.title,
          licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`,
        },
        status: 'PENDING',
      },
    });
  }
}

// Export singleton instance
export const licenseExpiryMonitorService = new LicenseExpiryMonitorService();
