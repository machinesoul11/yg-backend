/**
 * Notification Digest Job
 * 
 * Sends digest emails to users who prefer batched notifications
 * Runs on schedule: Daily at 9 AM and Weekly on Monday at 9 AM
 */

import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';
import { NotificationEmailService } from '@/modules/system/services/notification-email.service';
import { NotificationPreferencesService } from '@/modules/system/services/notification-preferences.service';

interface NotificationDigestJobData {
  frequency: 'DAILY' | 'WEEKLY';
}

const QUEUE_NAME = 'notification-digest';

// Create queue
export const notificationDigestQueue = new Queue<NotificationDigestJobData>(
  QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 60000, // 1 minute
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  }
);

// Job handler
async function sendDigests(job: Job<NotificationDigestJobData>) {
  const { frequency } = job.data;

  job.log(`[NotificationDigest] Starting ${frequency} digest job`);

  const startTime = Date.now();

  // Calculate time window for notifications
  const since = new Date();
  if (frequency === 'DAILY') {
    since.setDate(since.getDate() - 1); // Last 24 hours
  } else {
    since.setDate(since.getDate() - 7); // Last 7 days
  }

  // Get users who want this digest frequency
  const preferencesService = new NotificationPreferencesService(prisma, redis);
  const userIds = await preferencesService.getUsersForDigest(frequency);

  job.log(`[NotificationDigest] Found ${userIds.length} users for ${frequency} digest`);

  if (userIds.length === 0) {
    return { frequency, userIds: 0, emailsSent: 0 };
  }

  // Get notification service
  const notificationService = new NotificationService(prisma, redis);
  const emailService = new NotificationEmailService(prisma);

  let emailsSent = 0;
  let errors = 0;

  // Process users in batches to avoid overwhelming the email service
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (userId) => {
        try {
          // Get unread notifications for this user since last digest
          const notifications = await notificationService.getDigestNotifications(userId, since);

          if (notifications.length === 0) {
            job.log(`[NotificationDigest] No notifications for user ${userId}`);
            return;
          }

          // Send digest email
          const sent = await emailService.sendDigestEmail(userId, notifications);

          if (sent) {
            emailsSent++;
            job.log(`[NotificationDigest] Sent ${frequency} digest to user ${userId} with ${notifications.length} notifications`);
            
            // Update last digest sent timestamp
            await preferencesService.updateLastDigestSent(userId);
          } else {
            errors++;
          }
        } catch (error) {
          errors++;
          job.log(`[NotificationDigest] Failed to send digest to user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      })
    );

    // Update progress
    const progress = Math.round(((i + batch.length) / userIds.length) * 100);
    await job.updateProgress(progress);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const duration = Date.now() - startTime;
  job.log(`[NotificationDigest] ${frequency} digest completed in ${duration}ms: ${emailsSent} sent, ${errors} errors`);

  return {
    frequency,
    userIds: userIds.length,
    emailsSent,
    errors,
    duration,
  };
}

// Create worker
export const notificationDigestWorker = new Worker<NotificationDigestJobData>(
  QUEUE_NAME,
  sendDigests,
  {
    connection: redisConnection,
    concurrency: 1, // Sequential processing
  }
);

// Event listeners
notificationDigestWorker.on('completed', (job, result) => {
  console.log(`[NotificationDigest] Job ${job.id} completed:`, result);
});

notificationDigestWorker.on('failed', (job, error) => {
  console.error(`[NotificationDigest] Job ${job?.id} failed:`, error.message);
});

notificationDigestWorker.on('error', (error) => {
  console.error('[NotificationDigest] Worker error:', error);
});

/**
 * Schedule digest jobs
 */
export async function scheduleNotificationDigests() {
  // Daily digest at 9 AM
  await notificationDigestQueue.add(
    'daily-digest',
    { frequency: 'DAILY' },
    {
      repeat: {
        pattern: '0 9 * * *', // Every day at 9 AM
      },
      jobId: 'notification-digest-daily',
    }
  );

  // Weekly digest at 9 AM on Mondays
  await notificationDigestQueue.add(
    'weekly-digest',
    { frequency: 'WEEKLY' },
    {
      repeat: {
        pattern: '0 9 * * 1', // Every Monday at 9 AM
      },
      jobId: 'notification-digest-weekly',
    }
  );

  console.log('[NotificationDigest] Scheduled recurring digest jobs');
}

/**
 * Manually trigger a digest (for testing)
 */
export async function triggerDigestManually(frequency: 'DAILY' | 'WEEKLY') {
  await notificationDigestQueue.add(
    'manual-digest',
    { frequency },
    {
      jobId: `notification-digest-manual-${frequency.toLowerCase()}-${Date.now()}`,
    }
  );
}
