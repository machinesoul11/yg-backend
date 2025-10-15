/**
 * Payout Processing Job
 * Handles background processing and retry logic for payouts
 */

import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redis, redisConnection } from '@/lib/db/redis';
import { PayoutProcessingService } from '@/modules/payouts/services/payout-processing.service';
import { PayoutRetryService } from '@/modules/payouts/services/payout-retry.service';
import { PayoutNotificationService } from '@/modules/payouts/services/payout-notification.service';
import { PayoutReceiptService } from '@/modules/payouts/services/payout-receipt.service';
import { PayoutStatus } from '@prisma/client';

interface PayoutJobData {
  payoutId?: string;
  creatorId?: string;
  royaltyStatementIds?: string[];
  amountCents?: number;
  isRetry?: boolean;
}

export const payoutProcessingQueue = new Queue<PayoutJobData>(
  'payout-processing',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1, // Retries handled by PayoutRetryService
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

export const payoutProcessingWorker = new Worker<PayoutJobData>(
  'payout-processing',
  async (job: Job<PayoutJobData>) => {
    const { payoutId, creatorId, royaltyStatementIds, amountCents, isRetry } = job.data;

    console.log(`[PayoutJob] Processing payout job ${job.id}`);

    const processingService = new PayoutProcessingService(prisma, redis);
    const notificationService = new PayoutNotificationService(prisma, redis);
    const receiptService = new PayoutReceiptService(prisma);

    try {
      let result;

      if (isRetry && payoutId) {
        // Retry existing payout
        console.log(`[PayoutJob] Retrying payout ${payoutId}`);
        const retryService = new PayoutRetryService(prisma, redis);
        const retryResult = await retryService.retryPayout(payoutId);

        if (!retryResult.success && retryResult.shouldRetry) {
          // Schedule next retry
          console.log(`[PayoutJob] Scheduling next retry for ${payoutId}`);
          return { success: false, scheduled: true };
        }

        result = { success: retryResult.success, payoutId };
      } else if (creatorId) {
        // Create new payout
        console.log(`[PayoutJob] Creating payout for creator ${creatorId}`);
        result = await processingService.processPayout({
          creatorId,
          royaltyStatementIds,
          amountCents,
        });
      } else {
        throw new Error('Invalid job data: missing payoutId or creatorId');
      }

      if (result.success && result.payoutId) {
        // Update payout to COMPLETED
        await prisma.payout.update({
          where: { id: result.payoutId },
          data: {
            status: PayoutStatus.COMPLETED,
            processedAt: new Date(),
          },
        });

        // Send confirmation notification
        await notificationService.sendPayoutConfirmation(result.payoutId);

        // Generate receipt
        try {
          await receiptService.generateReceipt(result.payoutId);
        } catch (error) {
          console.error(`[PayoutJob] Error generating receipt:`, error);
          // Don't fail the job if receipt generation fails
        }

        console.log(`[PayoutJob] Payout ${result.payoutId} completed successfully`);
        return { success: true, payoutId: result.payoutId };
      } else {
        console.error(`[PayoutJob] Payout failed:`, result.error);

        if (result.payoutId) {
          // Send failure notification
          try {
            await notificationService.sendPayoutFailureNotification(result.payoutId);
          } catch (error) {
            console.error(`[PayoutJob] Error sending failure notification:`, error);
          }
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`[PayoutJob] Job error:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // Process 2 payouts concurrently
  }
);

// Event listeners
payoutProcessingWorker.on('completed', (job) => {
  console.log(`[PayoutJob] Job ${job.id} completed successfully`);
});

payoutProcessingWorker.on('failed', (job, err) => {
  console.error(`[PayoutJob] Job ${job?.id} failed:`, err);
});

payoutProcessingWorker.on('error', (err) => {
  console.error('[PayoutJob] Worker error:', err);
});

/**
 * Queue a payout for processing
 */
export async function queuePayoutProcessing(data: PayoutJobData): Promise<void> {
  await payoutProcessingQueue.add('process-payout', data, {
    removeOnComplete: true,
    removeOnFail: false,
  });
}

/**
 * Queue payout retry
 */
export async function queuePayoutRetry(payoutId: string, delayMs: number = 0): Promise<void> {
  await payoutProcessingQueue.add(
    'retry-payout',
    { payoutId, isRetry: true },
    {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Process stuck payouts (scheduled job)
 */
export async function processStuckPayouts(): Promise<void> {
  console.log('[PayoutJob] Processing stuck payouts...');
  
  const retryService = new PayoutRetryService(prisma, redis);
  await retryService.processStuckPayouts();
  
  console.log('[PayoutJob] Stuck payouts processed');
}
