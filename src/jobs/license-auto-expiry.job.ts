/**
 * License Auto-Expiry Processor Job
 * Runs hourly to automatically expire licenses past their end date or grace period
 * Schedule: Every hour
 * 
 * This job handles final license expiry after grace periods have ended.
 * Initial expiry detection and grace period application is handled by the
 * license-expiry-monitor job which runs daily.
 */

import { prisma } from '@/lib/db';
import { licenseExpiryMonitorService } from '@/modules/licenses/services/license-expiry-monitor.service';

export async function licenseAutoExpiryJob() {
  try {
    console.log('[Job] Running license auto-expiry processor');

    const now = new Date();
    let expiredCount = 0;
    let gracePeriodCount = 0;
    const errors: string[] = [];

    // Find licenses where grace period has ended
    const gracePeriodExpiredLicenses = await licenseExpiryMonitorService.findLicensesWithExpiredGracePeriod();
    
    if (gracePeriodExpiredLicenses.length > 0) {
      console.log(`[Job] Found ${gracePeriodExpiredLicenses.length} licenses with expired grace periods`);

      for (const license of gracePeriodExpiredLicenses) {
        try {
          await licenseExpiryMonitorService.expireLicense(license);
          expiredCount++;
          console.log(
            `[Job] Expired license ${license.id} for brand ${license.brand.companyName} (grace period ended)`
          );
        } catch (error: any) {
          console.error(`[Job] Failed to expire license ${license.id}:`, error);
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }
    }

    // Find licenses that have reached end date and need expiry processing
    // (this handles licenses without grace periods or where grace period should be applied)
    const expiredLicenses = await licenseExpiryMonitorService.findLicensesNeedingExpiry();
    
    if (expiredLicenses.length > 0) {
      console.log(`[Job] Found ${expiredLicenses.length} licenses needing expiry processing`);

      for (const license of expiredLicenses) {
        try {
          // This will apply grace period if configured, or expire immediately if not
          await licenseExpiryMonitorService.processExpiredLicense(license);
          
          if (license.gracePeriodDays > 0) {
            gracePeriodCount++;
            console.log(
              `[Job] Applied ${license.gracePeriodDays}-day grace period to license ${license.id}`
            );
          } else {
            expiredCount++;
            console.log(
              `[Job] Expired license ${license.id} for brand ${license.brand.companyName}`
            );
          }
        } catch (error: any) {
          console.error(`[Job] Failed to process license ${license.id}:`, error);
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }
    }

    if (expiredCount === 0 && gracePeriodCount === 0) {
      console.log('[Job] No licenses requiring expiry processing');
    }

    // Log job completion
    await prisma.event.create({
      data: {
        source: 'system',
        eventType: 'license.auto_expiry_completed',
        actorType: 'system',
        propsJson: {
          expiredCount,
          gracePeriodCount,
          errorCount: errors.length,
          timestamp: now.toISOString(),
        },
      },
    });

    console.log(
      `[Job] License auto-expiry completed - Expired: ${expiredCount}, ` +
        `Grace periods applied: ${gracePeriodCount}, Errors: ${errors.length}`
    );

    if (errors.length > 0) {
      console.error('[Job] Errors encountered:', errors);
    }

    return {
      success: errors.length === 0,
      expired: expiredCount,
      gracePeriodApplied: gracePeriodCount,
      errors,
    };
  } catch (error) {
    console.error('[Job] License auto-expiry job failed:', error);
    throw error;
  }
}
