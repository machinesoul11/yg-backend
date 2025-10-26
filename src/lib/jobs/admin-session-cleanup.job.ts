/**
 * Admin Session Cleanup Job
 * Periodically cleans up expired admin sessions
 * 
 * Run every 5 minutes to ensure admin sessions are properly expired
 */

import { Queue, Worker } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { AdminSessionSecurityService } from '@/lib/services/admin-session-security.service';
import { prisma } from '@/lib/db';

const QUEUE_NAME = 'admin-session-cleanup';

// Initialize service
const adminSessionService = new AdminSessionSecurityService(prisma);

/**
 * Create the admin session cleanup queue
 */
export const adminSessionCleanupQueue = new Queue(QUEUE_NAME, {
  connection: getBullMQRedisClient(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

/**
 * Admin session cleanup worker
 */
export const adminSessionCleanupWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log('[AdminSessionCleanup] Starting cleanup job...');

    try {
      // Cleanup expired admin sessions
      const cleanedCount = await adminSessionService.cleanupExpiredAdminSessions();

      console.log(`[AdminSessionCleanup] Cleaned up ${cleanedCount} expired admin sessions`);

      return {
        success: true,
        cleanedCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[AdminSessionCleanup] Error during cleanup:', error);
      throw error;
    }
  },
  {
    connection: getBullMQRedisClient(),
    concurrency: 1, // Run one at a time
  }
);

/**
 * Schedule recurring admin session cleanup
 * Runs every 5 minutes
 */
export async function scheduleAdminSessionCleanup() {
  // Remove existing repeatable jobs with same pattern
  const repeatableJobs = await adminSessionCleanupQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'cleanup-expired-sessions') {
      await adminSessionCleanupQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new repeatable job
  await adminSessionCleanupQueue.add(
    'cleanup-expired-sessions',
    {},
    {
      repeat: {
        pattern: '*/5 * * * *', // Every 5 minutes
      },
    }
  );

  console.log('[AdminSessionCleanup] Scheduled recurring cleanup job (every 5 minutes)');
}

/**
 * Manually trigger admin session cleanup
 */
export async function triggerAdminSessionCleanup() {
  const job = await adminSessionCleanupQueue.add('manual-cleanup', {});
  console.log('[AdminSessionCleanup] Manual cleanup job queued:', job.id);
  return job;
}

// Worker event handlers
adminSessionCleanupWorker.on('completed', (job) => {
  console.log(`[AdminSessionCleanup] Job ${job.id} completed successfully`);
});

adminSessionCleanupWorker.on('failed', (job, error) => {
  console.error(`[AdminSessionCleanup] Job ${job?.id} failed:`, error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[AdminSessionCleanup] Shutting down worker...');
  await adminSessionCleanupWorker.close();
  await adminSessionCleanupQueue.close();
});

export default {
  queue: adminSessionCleanupQueue,
  worker: adminSessionCleanupWorker,
  scheduleCleanup: scheduleAdminSessionCleanup,
  triggerCleanup: triggerAdminSessionCleanup,
};
