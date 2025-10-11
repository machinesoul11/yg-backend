/**
 * Idempotency Cleanup Job
 * 
 * Cleans up expired idempotency keys
 * Run: Every 6 hours
 */

import { Queue, Worker } from 'bullmq';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { IdempotencyService } from '@/modules/system';

const QUEUE_NAME = 'idempotency-cleanup';

// Create queue
export const idempotencyCleanupQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

// Job handler
async function cleanupExpiredIdempotencyKeys() {
  const service = new IdempotencyService(prisma);

  const deleted = await service.cleanupExpired();

  console.log(`[Idempotency Cleanup] Deleted ${deleted} expired keys`);

  return { deleted };
}

// Create worker
export const idempotencyCleanupWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[Idempotency Cleanup] Starting job ${job.id}`);
    const result = await cleanupExpiredIdempotencyKeys();
    console.log(`[Idempotency Cleanup] Job ${job.id} completed:`, result);
    return result;
  },
  {
    connection: redis,
  }
);

// Add recurring job (every 6 hours)
export async function scheduleIdempotencyCleanup() {
  await idempotencyCleanupQueue.add(
    'cleanup-expired',
    {},
    {
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
    }
  );
  console.log('[Idempotency Cleanup] Scheduled recurring job');
}

// Error handling
idempotencyCleanupWorker.on('failed', (job, error) => {
  console.error(`[Idempotency Cleanup] Job ${job?.id} failed:`, error);
});

idempotencyCleanupWorker.on('error', (error) => {
  console.error('[Idempotency Cleanup] Worker error:', error);
});
