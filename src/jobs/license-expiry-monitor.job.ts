/**
 * License Expiry Monitor Job
 * Runs daily to check for expiring licenses and send multi-stage notifications
 * Schedule: Daily at 09:00 UTC
 * 
 * This job orchestrates the comprehensive expiry management system including:
 * - 90-day advance notices
 * - 60-day reminder emails
 * - 30-day final notices with in-app notifications
 * - Grace period monitoring
 * - Final expiry processing
 */

import { prisma } from '@/lib/db';
import { licenseExpiryMonitorService } from '@/modules/licenses/services/license-expiry-monitor.service';

export async function licenseExpiryMonitorJob() {
  try {
    console.log('[Job] Running comprehensive license expiry monitor');

    const startTime = Date.now();
    let totalNotificationsSent = 0;
    let totalExpiriesProcessed = 0;
    const errors: string[] = [];

    // Stage 1: 90-Day Notices
    console.log('[Job] Stage 1: Processing 90-day expiry notices');
    try {
      const ninetyDayLicenses = await licenseExpiryMonitorService.findLicensesNeedingNinetyDayNotice();
      console.log(`[Job] Found ${ninetyDayLicenses.length} licenses needing 90-day notice`);

      for (const license of ninetyDayLicenses) {
        try {
          await licenseExpiryMonitorService.sendNinetyDayNotice(license);
          totalNotificationsSent++;
          console.log(`[Job] Sent 90-day notice for license ${license.id}`);
        } catch (error: any) {
          console.error(`[Job] Failed to send 90-day notice for license ${license.id}:`, error);
          errors.push(`90-day notice failed for ${license.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Job] 90-day notice stage failed:', error);
      errors.push(`90-day stage error: ${error.message}`);
    }

    // Stage 2: 60-Day Notices
    console.log('[Job] Stage 2: Processing 60-day expiry notices');
    try {
      const sixtyDayLicenses = await licenseExpiryMonitorService.findLicensesNeedingSixtyDayNotice();
      console.log(`[Job] Found ${sixtyDayLicenses.length} licenses needing 60-day notice`);

      for (const license of sixtyDayLicenses) {
        try {
          await licenseExpiryMonitorService.sendSixtyDayNotice(license);
          totalNotificationsSent++;
          console.log(`[Job] Sent 60-day notice for license ${license.id}`);
        } catch (error: any) {
          console.error(`[Job] Failed to send 60-day notice for license ${license.id}:`, error);
          errors.push(`60-day notice failed for ${license.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Job] 60-day notice stage failed:', error);
      errors.push(`60-day stage error: ${error.message}`);
    }

    // Stage 3: 30-Day Notices (includes in-app notifications)
    console.log('[Job] Stage 3: Processing 30-day expiry notices');
    try {
      const thirtyDayLicenses = await licenseExpiryMonitorService.findLicensesNeedingThirtyDayNotice();
      console.log(`[Job] Found ${thirtyDayLicenses.length} licenses needing 30-day notice`);

      for (const license of thirtyDayLicenses) {
        try {
          await licenseExpiryMonitorService.sendThirtyDayNotice(license);
          totalNotificationsSent++;
          console.log(`[Job] Sent 30-day notice for license ${license.id}`);
        } catch (error: any) {
          console.error(`[Job] Failed to send 30-day notice for license ${license.id}:`, error);
          errors.push(`30-day notice failed for ${license.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Job] 30-day notice stage failed:', error);
      errors.push(`30-day stage error: ${error.message}`);
    }

    // Stage 4: Process Expired Licenses (with grace period handling)
    console.log('[Job] Stage 4: Processing expired licenses');
    try {
      const expiredLicenses = await licenseExpiryMonitorService.findLicensesNeedingExpiry();
      console.log(`[Job] Found ${expiredLicenses.length} licenses needing expiry processing`);

      for (const license of expiredLicenses) {
        try {
          await licenseExpiryMonitorService.processExpiredLicense(license);
          totalExpiriesProcessed++;
          console.log(`[Job] Processed expiry for license ${license.id}`);
        } catch (error: any) {
          console.error(`[Job] Failed to process expiry for license ${license.id}:`, error);
          errors.push(`Expiry processing failed for ${license.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Job] Expiry processing stage failed:', error);
      errors.push(`Expiry processing error: ${error.message}`);
    }

    // Stage 5: Process Expired Grace Periods
    console.log('[Job] Stage 5: Processing expired grace periods');
    try {
      const gracePeriodLicenses = await licenseExpiryMonitorService.findLicensesWithExpiredGracePeriod();
      console.log(`[Job] Found ${gracePeriodLicenses.length} licenses with expired grace periods`);

      for (const license of gracePeriodLicenses) {
        try {
          await licenseExpiryMonitorService.expireLicense(license);
          totalExpiriesProcessed++;
          console.log(`[Job] Finalized expiry for license ${license.id} (grace period ended)`);
        } catch (error: any) {
          console.error(`[Job] Failed to finalize expiry for license ${license.id}:`, error);
          errors.push(`Grace period finalization failed for ${license.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Job] Grace period processing stage failed:', error);
      errors.push(`Grace period processing error: ${error.message}`);
    }

    const duration = Date.now() - startTime;

    // Log job completion summary
    await prisma.event.create({
      data: {
        source: 'system',
        eventType: 'license.expiry_monitor_completed',
        actorType: 'system',
        propsJson: {
          duration,
          notificationsSent: totalNotificationsSent,
          expiriesProcessed: totalExpiriesProcessed,
          errorCount: errors.length,
          timestamp: new Date().toISOString(),
        },
      },
    });

    console.log(
      `[Job] License expiry monitor completed in ${duration}ms - ` +
        `Notifications: ${totalNotificationsSent}, ` +
        `Expiries: ${totalExpiriesProcessed}, ` +
        `Errors: ${errors.length}`
    );

    if (errors.length > 0) {
      console.error('[Job] Errors encountered:', errors);
    }

    return {
      success: errors.length === 0 || errors.length < 10, // Allow some errors
      notificationsSent: totalNotificationsSent,
      expiriesProcessed: totalExpiriesProcessed,
      duration,
      errors,
    };
  } catch (error) {
    console.error('[Job] License expiry monitor failed catastrophically:', error);
    throw error;
  }
}
