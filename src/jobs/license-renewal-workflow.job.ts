/**
 * License Renewal Workflow Job
 * Automated background processing for license renewals
 * Runs daily to check eligibility, send notifications, and process auto-renewals
 */

import { prisma } from '@/lib/db';
import { renewalEligibilityService } from '@/modules/licenses/services/renewal-eligibility.service';
import { renewalPricingService } from '@/modules/licenses/services/renewal-pricing.service';
import { renewalNotificationService } from '@/modules/licenses/services/renewal-notifications.service';
import { renewalAnalyticsService } from '@/modules/licenses/services/renewal-analytics.service';
import { enhancedLicenseRenewalService } from '@/modules/licenses/services/enhancedLicenseRenewalService';
import { differenceInDays, addDays, subDays } from 'date-fns';

interface JobResult {
  success: boolean;
  duration: number;
  stats: {
    eligibilityChecks: number;
    offersGenerated: number;
    notificationsSent: number;
    autoRenewalsProcessed: number;
    errors: number;
  };
  errors: string[];
}

export async function licenseRenewalWorkflowJob(): Promise<JobResult> {
  console.log('[Job] Starting license renewal workflow job');
  const startTime = Date.now();
  
  const stats = {
    eligibilityChecks: 0,
    offersGenerated: 0,
    notificationsSent: 0,
    autoRenewalsProcessed: 0,
    errors: 0,
  };
  
  const errors: string[] = [];

  try {
    // Phase 1: Daily Eligibility Scan
    console.log('[Job] Phase 1: Scanning for renewal-eligible licenses');
    await scanEligibleLicenses(stats, errors);

    // Phase 2: Generate Renewal Offers
    console.log('[Job] Phase 2: Generating renewal offers');
    await generateRenewalOffers(stats, errors);

    // Phase 3: Send Renewal Notifications
    console.log('[Job] Phase 3: Sending renewal notifications');
    await sendScheduledNotifications(stats, errors);

    // Phase 4: Process Auto-Renewals
    console.log('[Job] Phase 4: Processing auto-renewals');
    await processAutoRenewals(stats, errors);

    // Phase 5: Update Analytics
    console.log('[Job] Phase 5: Updating renewal analytics');
    await updateRenewalAnalytics(stats, errors);

    const duration = Date.now() - startTime;
    
    console.log('[Job] License renewal workflow completed', {
      duration: `${duration}ms`,
      stats,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0 || stats.errors < 10, // Allow some errors
      duration,
      stats,
      errors,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Job] License renewal workflow failed:', error);
    
    return {
      success: false,
      duration,
      stats,
      errors: [...errors, `Fatal error: ${error.message}`],
    };
  }
}

/**
 * Phase 1: Scan for licenses eligible for renewal
 */
async function scanEligibleLicenses(
  stats: JobResult['stats'],
  errors: string[]
): Promise<void> {
  try {
    // Find licenses within 90 days of expiration
    const eligibleLicenses = await renewalEligibilityService.findEligibleLicenses(90);
    
    stats.eligibilityChecks = eligibleLicenses.length;
    
    console.log(
      `[Job] Found ${eligibleLicenses.length} licenses eligible for renewal`
    );

    // Mark licenses as EXPIRING_SOON if within 30 days
    const soonExpiringIds = eligibleLicenses
      .filter((l) => l.eligibility.metadata.daysUntilExpiration <= 30)
      .map((l) => l.licenseId);

    if (soonExpiringIds.length > 0) {
      await prisma.license.updateMany({
        where: {
          id: { in: soonExpiringIds },
          status: 'ACTIVE',
        },
        data: {
          status: 'EXPIRING_SOON' as any,
        },
      });
      
      console.log(
        `[Job] Marked ${soonExpiringIds.length} licenses as EXPIRING_SOON`
      );
    }
  } catch (error: any) {
    errors.push(`Eligibility scan failed: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Phase 2: Generate renewal offers for licenses at 90-day mark
 */
async function generateRenewalOffers(
  stats: JobResult['stats'],
  errors: string[]
): Promise<void> {
  try {
    // Find licenses at exactly 90 days (±1 day buffer) that don't have offers yet
    const licensesNeedingOffers = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: addDays(new Date(), 89),
          lte: addDays(new Date(), 91),
        },
        renewalNotifiedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    });

    console.log(
      `[Job] Generating offers for ${licensesNeedingOffers.length} licenses`
    );

    for (const license of licensesNeedingOffers) {
      try {
        // Check eligibility
        const eligibility = await renewalEligibilityService.checkEligibility(
          license.id
        );

        if (!eligibility.eligible) {
          console.log(
            `[Job] Skipping license ${license.id}: ${eligibility.blockingIssues.join(', ')}`
          );
          continue;
        }

        // Calculate pricing
        const pricing = await renewalPricingService.calculateRenewalPricing({
          licenseId: license.id,
          strategy: 'AUTOMATIC',
        });

        // Generate offer through enhanced renewal service
        const offerId = await enhancedLicenseRenewalService.generateRenewalOffer(
          license.id,
          'system'
        );

        // Get the license again to retrieve the renewal offer from metadata
        const licenseWithOffer = await prisma.license.findUnique({
          where: { id: license.id },
          select: { metadata: true },
        });

        const renewalOffer = (licenseWithOffer?.metadata as any)?.renewalOffer;

        if (!renewalOffer) {
          throw new Error('Renewal offer not found in license metadata');
        }

        // Send notification with offer
        await renewalNotificationService.sendRenewalOffer(license.id, {
          offerId,
          proposedTerms: renewalOffer.terms,
          pricingBreakdown: pricing,
        });

        stats.offersGenerated++;
      } catch (error: any) {
        errors.push(
          `Failed to generate offer for license ${license.id}: ${error.message}`
        );
        stats.errors++;
      }
    }
  } catch (error: any) {
    errors.push(`Offer generation phase failed: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Phase 3: Send scheduled renewal reminder notifications
 */
async function sendScheduledNotifications(
  stats: JobResult['stats'],
  errors: string[]
): Promise<void> {
  try {
    const result = await renewalNotificationService.processPendingNotifications();
    
    stats.notificationsSent = result.sent;
    stats.errors += result.failed;
    
    errors.push(...result.results.flatMap((r) => r.errors));
    
    console.log(
      `[Job] Sent ${result.sent} renewal notifications (${result.failed} failed)`
    );
  } catch (error: any) {
    errors.push(`Notification phase failed: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Phase 4: Process automatic renewals for licenses with auto_renew flag
 */
async function processAutoRenewals(
  stats: JobResult['stats'],
  errors: string[]
): Promise<void> {
  try {
    const result = await enhancedLicenseRenewalService.processAutoRenewals();
    
    stats.autoRenewalsProcessed = result.processed;
    stats.errors += result.failed;
    
    console.log(
      `[Job] Processed ${result.processed} auto-renewals (${result.failed} failed)`
    );
  } catch (error: any) {
    errors.push(`Auto-renewal phase failed: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Phase 5: Calculate and store renewal analytics
 */
async function updateRenewalAnalytics(
  stats: JobResult['stats'],
  errors: string[]
): Promise<void> {
  try {
    // Calculate metrics for yesterday
    const yesterday = subDays(new Date(), 1);
    const thirtyDaysAgo = subDays(yesterday, 29);
    
    const metrics = await renewalAnalyticsService.calculateRenewalMetrics(
      thirtyDaysAgo,
      yesterday
    );
    
    await renewalAnalyticsService.storeMetrics(yesterday, metrics);
    
    console.log('[Job] Updated renewal analytics:', {
      renewalRate: `${metrics.renewalRate.toFixed(1)}%`,
      revenueRetentionRate: `${metrics.revenueRetentionRate.toFixed(1)}%`,
      avgTimeToRenewal: `${metrics.averageTimeToRenewal.toFixed(1)} days`,
    });
  } catch (error: any) {
    errors.push(`Analytics update failed: ${error.message}`);
    stats.errors++;
  }
}

// Export for job scheduler
export default licenseRenewalWorkflowJob;
