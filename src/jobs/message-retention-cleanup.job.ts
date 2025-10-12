/**
 * Message Retention Cleanup Job
 * 
 * Background job to clean up messages older than retention policy (2 years)
 * Should be scheduled to run daily
 */

import { Queue, Worker } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { DataPrivacyService } from '../modules/messages/services/data-privacy.service';

const QUEUE_NAME = 'message-retention-cleanup';

// Create queue
export const messageRetentionCleanupQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

// Create worker
const dataPrivacyService = new DataPrivacyService(prisma);

export const messageRetentionCleanupWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[MessageRetentionCleanup] Starting cleanup job ${job.id}`);

    try {
      const result = await dataPrivacyService.cleanupOldDeletedMessages();

      console.log(
        `[MessageRetentionCleanup] Completed cleanup: ${result.messagesDeleted} messages, ${result.attachmentsDeleted} attachments`
      );

      return result;
    } catch (error) {
      console.error('[MessageRetentionCleanup] Cleanup failed:', error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Only one cleanup job at a time
  }
);

// Handle worker events
messageRetentionCleanupWorker.on('completed', (job) => {
  console.log(`[MessageRetentionCleanup] Job ${job.id} completed successfully`);
});

messageRetentionCleanupWorker.on('failed', (job, error) => {
  console.error(`[MessageRetentionCleanup] Job ${job?.id} failed:`, error);
});

/**
 * Schedule daily cleanup job (runs at 3 AM)
 */
export async function scheduleMessageRetentionCleanup(): Promise<void> {
  // Remove any existing cleanup jobs
  await messageRetentionCleanupQueue.drain();

  // Add repeatable job to run daily at 3 AM
  await messageRetentionCleanupQueue.add(
    'daily-cleanup',
    {},
    {
      repeat: {
        pattern: '0 3 * * *', // Cron: 3 AM every day
      },
      jobId: 'message-retention-daily-cleanup',
    }
  );

  console.log('[MessageRetentionCleanup] Scheduled daily cleanup job at 3 AM');
}
