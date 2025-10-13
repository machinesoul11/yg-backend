/**
 * Notification Delivery Job
 * 
 * Handles immediate delivery of notifications via email and in-app channels
 * Queued when a notification is created with immediate delivery required
 */

import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationEmailService } from '@/modules/system/services/notification-email.service';

interface NotificationDeliveryJobData {
  notificationId: string;
}

const QUEUE_NAME = 'notification-delivery';

// Create queue
export const notificationDeliveryQueue = new Queue<NotificationDeliveryJobData>(
  QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        count: 1000, // Keep last 1000 completed jobs
        age: 24 * 3600, // Remove after 24 hours
      },
      removeOnFail: {
        count: 5000, // Keep last 5000 failed jobs
        age: 7 * 24 * 3600, // Remove after 7 days
      },
    },
  }
);

// Job handler
async function deliverNotification(job: Job<NotificationDeliveryJobData>) {
  const { notificationId } = job.data;

  job.log(`[NotificationDelivery] Processing notification ${notificationId}`);

  // Get notification
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!notification) {
    job.log(`[NotificationDelivery] Notification ${notificationId} not found`);
    return { success: false, reason: 'not_found' };
  }

  // In-app delivery is automatic (notification already exists in DB)
  job.log(`[NotificationDelivery] In-app notification created for user ${notification.userId}`);

  // Email delivery
  const emailService = new NotificationEmailService(prisma);
  
  try {
    const emailSent = await emailService.sendImmediateEmail(notificationId);
    
    if (emailSent) {
      job.log(`[NotificationDelivery] Email sent successfully for notification ${notificationId}`);
    } else {
      job.log(`[NotificationDelivery] Email skipped (user preference or digest mode)`);
    }

    return {
      success: true,
      emailSent,
      inAppDelivered: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`[NotificationDelivery] Email delivery failed: ${errorMessage}`);
    
    // Don't throw - we want to mark the job as complete even if email fails
    // The notification is still visible in-app
    return {
      success: true,
      emailSent: false,
      emailError: errorMessage,
      inAppDelivered: true,
    };
  }
}

// Create worker
export const notificationDeliveryWorker = new Worker<NotificationDeliveryJobData>(
  QUEUE_NAME,
  deliverNotification,
  {
    connection: redisConnection,
    concurrency: 10, // Process 10 notifications concurrently
  }
);

// Event listeners
notificationDeliveryWorker.on('completed', (job, result) => {
  console.log(`[NotificationDelivery] Job ${job.id} completed:`, result);
});

notificationDeliveryWorker.on('failed', (job, error) => {
  console.error(`[NotificationDelivery] Job ${job?.id} failed:`, error.message);
});

notificationDeliveryWorker.on('error', (error) => {
  console.error('[NotificationDelivery] Worker error:', error);
});

/**
 * Queue a notification for immediate delivery
 */
export async function queueNotificationDelivery(notificationId: string): Promise<void> {
  await notificationDeliveryQueue.add(
    'deliver',
    { notificationId },
    {
      jobId: `notif-${notificationId}`, // Prevent duplicate jobs
    }
  );
}
