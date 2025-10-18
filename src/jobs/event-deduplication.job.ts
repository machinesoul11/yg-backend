/**
 * Event Deduplication Cleanup Job
 * Runs periodic database-level deduplication to catch duplicates that slipped through
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redis, redisConnection } from '@/lib/db/redis';
import { EventDeduplicationService } from '@/modules/analytics/services/event-deduplication.service';

interface DeduplicationJobData {
  lookbackHours: number;
}

/**
 * Job Queue: Event Deduplication Cleanup
 */
export const eventDeduplicationQueue = new Queue<DeduplicationJobData>(
  'event-deduplication',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  }
);

/**
 * Worker: Event Deduplication Cleanup
 */
export const eventDeduplicationWorker = new Worker<DeduplicationJobData>(
  'event-deduplication',
  async (job: Job<DeduplicationJobData>) => {
    const { lookbackHours = 24 } = job.data;

    console.log(`[DeduplicationCleanup] Starting cleanup for last ${lookbackHours} hours`);

    const deduplicationService = new EventDeduplicationService(prisma, redis);

    try {
      const result = await deduplicationService.runDatabaseDeduplication(lookbackHours);

      console.log(
        `[DeduplicationCleanup] Completed: found ${result.duplicatesFound}, marked ${result.duplicatesRemoved} duplicates`
      );

      // Monitor deduplication rates
      const healthCheck = await deduplicationService.monitorDeduplicationRates();
      if (!healthCheck.isHealthy) {
        console.warn('[DeduplicationCleanup] Health check alerts:', healthCheck.alerts);
      }

      return result;
    } catch (error) {
      console.error('[DeduplicationCleanup] Error during cleanup:', error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Only run one cleanup job at a time
  }
);

/**
 * Schedule nightly deduplication cleanup
 */
export async function scheduleNightlyDeduplication(): Promise<void> {
  try {
    // Schedule to run every night at 2 AM
    await eventDeduplicationQueue.add(
      'nightly-deduplication',
      { lookbackHours: 24 },
      {
        repeat: {
          pattern: '0 2 * * *', // 2 AM daily
        },
        jobId: 'nightly-deduplication',
      }
    );

    console.log('[DeduplicationCleanup] Scheduled nightly deduplication job');
  } catch (error) {
    console.error('[DeduplicationCleanup] Error scheduling job:', error);
    throw error;
  }
}

/**
 * Run immediate deduplication cleanup
 */
export async function runImmediateDeduplication(
  lookbackHours: number = 24
): Promise<void> {
  await eventDeduplicationQueue.add('immediate-deduplication', {
    lookbackHours,
  });
}

/**
 * Get deduplication job stats
 */
export async function getDeduplicationStats() {
  const counts = await eventDeduplicationQueue.getJobCounts();
  return {
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
  };
}
