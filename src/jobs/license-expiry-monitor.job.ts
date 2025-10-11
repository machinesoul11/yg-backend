/**
 * License Expiry Monitor Job
 * Runs daily to check for expiring licenses and send notifications
 * Schedule: Daily at 09:00 UTC
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { licenseService } from '@/modules/licenses';
import { addDays, startOfDay, endOfDay } from 'date-fns';

const emailService = new EmailService();

export async function licenseExpiryMonitorJob() {
  try {
    console.log('[Job] Running license expiry monitor');

    const now = new Date();
    const thresholds = [90, 60, 30]; // Days before expiry to send notifications

    let totalNotificationsSent = 0;
    let totalRenewalsGenerated = 0;

    for (const days of thresholds) {
      const targetDate = addDays(now, days);

      // Find licenses expiring at this threshold
      const expiringLicenses = await prisma.license.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: startOfDay(targetDate),
            lte: endOfDay(targetDate),
          },
          renewalNotifiedAt: null, // Haven't sent notification for this expiry yet
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
          project: true,
        },
      });

      console.log(
        `[Job] Found ${expiringLicenses.length} licenses expiring in ${days} days`
      );

      for (const license of expiringLicenses) {
        try {
          // Send notification to brand
          if (license.brand.user?.email) {
            await emailService.sendTransactional({
              email: license.brand.user.email,
              subject: `License Expiring in ${days} Days`,
              template: 'welcome', // TODO: Create license-expiring template
              variables: {
                brandName: license.brand.companyName,
                assetTitle: license.ipAsset.title,
                daysUntilExpiry: days.toString(),
                endDate: license.endDate.toLocaleDateString(),
                licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`,
                renewUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}/renew`,
              },
            });

            totalNotificationsSent++;
          }

          // Send notification to creators
          for (const ownership of license.ipAsset.ownerships) {
            if (ownership.creator.user?.email) {
              try {
                await emailService.sendTransactional({
                  email: ownership.creator.user.email,
                  subject: `License Expiring in ${days} Days`,
                  template: 'welcome', // TODO: Create license-expiring template
                  variables: {
                    creatorName:
                      ownership.creator.displayName ||
                      ownership.creator.user.name ||
                      'Creator',
                    assetTitle: license.ipAsset.title,
                    brandName: license.brand.companyName,
                    daysUntilExpiry: days.toString(),
                    endDate: license.endDate.toLocaleDateString(),
                    licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`,
                  },
                });

                totalNotificationsSent++;
              } catch (error) {
                console.error(
                  `[Job] Failed to notify creator ${ownership.creator.id}:`,
                  error
                );
              }
            }
          }

          // Mark as notified
          await prisma.license.update({
            where: { id: license.id },
            data: { renewalNotifiedAt: now },
          });

          // If autoRenew is enabled, generate renewal
          if (license.autoRenew && days <= 60) {
            // Only auto-renew at 60 day threshold
            try {
              await licenseService.generateRenewal(
                {
                  licenseId: license.id,
                },
                'system'
              );

              totalRenewalsGenerated++;

              console.log(
                `[Job] Auto-generated renewal for license ${license.id}`
              );
            } catch (error) {
              console.error(
                `[Job] Failed to generate renewal for license ${license.id}:`,
                error
              );
            }
          }

          // Log event
          await prisma.event.create({
            data: {
              eventType: 'license.expiry_notification_sent',
              actorType: 'system',
              propsJson: {
                licenseId: license.id,
                brandId: license.brandId,
                daysUntilExpiry: days,
                autoRenewEnabled: license.autoRenew,
              },
            },
          });
        } catch (error) {
          console.error(
            `[Job] Failed to process expiring license ${license.id}:`,
            error
          );
          // Continue with other licenses
        }
      }
    }

    console.log(
      `[Job] License expiry monitor completed - Notifications sent: ${totalNotificationsSent}, Renewals generated: ${totalRenewalsGenerated}`
    );

    return {
      success: true,
      notificationsSent: totalNotificationsSent,
      renewalsGenerated: totalRenewalsGenerated,
    };
  } catch (error) {
    console.error('[Job] License expiry monitor failed:', error);
    throw error;
  }
}
