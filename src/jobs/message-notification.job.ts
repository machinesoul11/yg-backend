/**
 * Message Notification Worker
 * 
 * Processes message notification queue to send email notifications
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';;
import { emailService } from '@/lib/services/email/email.service';
import { messageNotificationQueue } from '../modules/messages/services/notification.service';

interface MessageNotificationJobData {
  recipientId: string;
  recipientEmail: string;
  recipientName: string | null;
  senderId: string;
  senderName: string | null;
  threadId: string;
  threadSubject: string | null;
  messagePreview: string;
  messageId: string;
}

/**
 * Worker for processing message notification emails
 */
export const messageNotificationWorker = new Worker(
  'message-notifications',
  async (job: Job<MessageNotificationJobData>) => {
    const { data } = job;

    try {
      job.log(`Sending message notification email to ${data.recipientEmail}`);

      // Send email using email service
      await emailService.sendTransactional({
        userId: data.recipientId,
        email: data.recipientEmail,
        subject: data.threadSubject
          ? `New message in "${data.threadSubject}"`
          : `New message from ${data.senderName}`,
        template: 'new-message',
        variables: {
          recipientName: data.recipientName || 'there',
          senderName: data.senderName || 'Someone',
          threadSubject: data.threadSubject || undefined,
          messagePreview: data.messagePreview,
          threadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/messages/${data.threadId}`,
        },
        tags: {
          type: 'message_notification',
          threadId: data.threadId,
          messageId: data.messageId,
        },
      });

      job.log(`Successfully sent message notification to ${data.recipientEmail}`);

      return { success: true };
    } catch (error) {
      job.log(
        `Failed to send message notification to ${data.recipientEmail}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw error; // Let BullMQ handle retries
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 100, // Max 100 emails per interval
      duration: 60000, // 1 minute
    },
  }
);

// Worker event handlers
messageNotificationWorker.on('completed', (job) => {
  console.log(`[MessageNotificationWorker] Job ${job.id} completed`);
});

messageNotificationWorker.on('failed', (job, err) => {
  console.error(
    `[MessageNotificationWorker] Job ${job?.id} failed:`,
    err.message
  );
});

messageNotificationWorker.on('error', (err) => {
  console.error('[MessageNotificationWorker] Worker error:', err);
});

console.log('[MessageNotificationWorker] Started message notification worker');
