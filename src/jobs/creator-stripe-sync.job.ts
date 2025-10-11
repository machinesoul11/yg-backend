/**
 * Sync Stripe Account Status Job
 * Syncs Stripe Connect account status for creators with pending/in_progress onboarding
 * Runs daily at 2 AM
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { StripeConnectService } from '@/modules/creators/services/stripe-connect.service';

export async function processSyncStripeStatus(job: Job) {
  const stripeConnectService = new StripeConnectService(prisma);

  job.log('Starting Stripe account status sync');

  try {
    // Get all creators with pending or in_progress onboarding
    const creators = await prisma.creator.findMany({
      where: {
        onboardingStatus: { in: ['pending', 'in_progress'] },
        stripeAccountId: { not: null },
        deletedAt: null,
      },
    });

    job.log(`Found ${creators.length} creators to sync`);

    let syncedCount = 0;
    let errorCount = 0;

    for (const creator of creators) {
      if (!creator.stripeAccountId) continue;

      try {
        await stripeConnectService.syncAccountStatus(creator.stripeAccountId);
        syncedCount++;
      } catch (error) {
        errorCount++;
        job.log(`Failed to sync creator ${creator.id}: ${error}`);
      }
    }

    job.log(`Stripe sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return {
      success: true,
      synced: syncedCount,
      errors: errorCount,
    };
  } catch (error) {
    job.log(`Stripe sync job failed: ${error}`);
    throw error;
  }
}
