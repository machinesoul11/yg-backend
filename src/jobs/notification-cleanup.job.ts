/**
 * Notification Cleanup Job
 * 
 * Cleans up old read notifications (older than 90 days)
 * Run: Daily at 3 AM
 */

import { Queue, Worker } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';;
import { prisma } from '@/lib/db';

const QUEUE_NAME = 'notification-cleanup';

// Create queue
export const notificationCleanupQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

// Job handler
async function cleanupOldNotifications() {
  const threshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days

  const result = await prisma.notification.deleteMany({
    where: {
      read: true,
      readAt: { lt: threshold },
    },
  });

  console.log(`[Notification Cleanup] Deleted ${result.count} old notifications`);

  return { deleted: result.count };
}

// Create worker
export const notificationCleanupWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[Notification Cleanup] Starting job ${job.id}`);
    const result = await cleanupOldNotifications();
    console.log(`[Notification Cleanup] Job ${job.id} completed:`, result);
    return result;
  },
  {
    connection: redisConnection,
  }
);

// Add recurring job (daily at 3 AM)
export async function scheduleNotificationCleanup() {
  await notificationCleanupQueue.add(
    'cleanup-old',
    {},
    {
      repeat: {
        pattern: '0 3 * * *', // Daily at 3 AM
      },
    }
  );
  console.log('[Notification Cleanup] Scheduled recurring job');
}

// Error handling
notificationCleanupWorker.on('failed', (job, error) => {
  console.error(`[Notification Cleanup] Job ${job?.id} failed:`, error);
});

notificationCleanupWorker.on('error', (error) => {
  console.error('[Notification Cleanup] Worker error:', error);
});
