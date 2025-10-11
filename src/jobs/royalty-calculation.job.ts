/**
 * Royalty Calculation Job
 * Runs background calculations for royalty runs
 * Processes all licenses and generates statements
 */

import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { RoyaltyCalculationService } from '@/modules/royalties/services/royalty-calculation.service';
import type { RoyaltyCalculationJobData } from '@/modules/royalties/types';

const auditService = new AuditService(prisma);

export const royaltyCalculationQueue = new Queue<RoyaltyCalculationJobData>(
  'royalty-calculation',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500,
    },
  }
);

export const royaltyCalculationWorker = new Worker<RoyaltyCalculationJobData>(
  'royalty-calculation',
  async (job: Job<RoyaltyCalculationJobData>) => {
    const { runId, userId } = job.data;

    console.log(`[Job] Starting royalty calculation for run ${runId}`);

    const calculationService = new RoyaltyCalculationService(
      prisma,
      redis,
      auditService
    );

    try {
      // Update job progress
      await job.updateProgress(10);

      await calculationService.calculateRun(runId, userId);

      // Update job progress
      await job.updateProgress(100);

      console.log(`[Job] Royalty calculation completed for run ${runId}`);

      return { success: true, runId };
    } catch (error) {
      console.error(`[Job] Royalty calculation failed for run ${runId}:`, error);

      // Update run status to FAILED
      await prisma.royaltyRun.update({
        where: { id: runId },
        data: { status: 'FAILED' },
      });

      throw error; // Will trigger retry
    }
  },
  {
    connection: redis,
    concurrency: 2, // Only 2 concurrent calculations
  }
);

// Event listeners
royaltyCalculationWorker.on('completed', (job) => {
  console.log(`[Job] Royalty calculation job ${job.id} completed successfully`);
});

royaltyCalculationWorker.on('failed', (job, err) => {
  console.error(`[Job] Royalty calculation job ${job?.id} failed:`, err);
});

royaltyCalculationWorker.on('error', (err) => {
  console.error('[Job] Royalty calculation worker error:', err);
});
