/**
 * Notification Cleanup Job
 * 
 * Cleans up old notifications based on expiry rules:
 * - Read notifications older than 30 days
 * - Unread LOW/MEDIUM notifications older than 90 days
 * - Read SYSTEM notifications older than 7 days
 * 
 * Run: Daily at 3 AM
 */

import { Queue, Worker } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';;
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';

const QUEUE_NAME = 'notification-cleanup';

// Initialize notification service
const notificationService = new NotificationService(prisma, redis);

// Create queue
export const notificationCleanupQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

// Job handler using enhanced cleanup method
async function cleanupOldNotifications() {
  const result = await notificationService.cleanupExpired();
  
  console.log(`[Notification Cleanup] Deleted ${result.deleted} old notifications`);
  
  return result;
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
