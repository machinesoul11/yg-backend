/**
 * Message Digest Job
 * 
 * Sends digest emails of unread messages to users who opted for digest notifications
 */

import { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';;
import { emailService } from '@/lib/services/email/email.service';
import { MessageNotificationService } from '@/modules/messages/services/notification.service';

interface MessageDigestJobData {
  frequency: 'daily' | 'weekly';
}

/**
 * Send message digest emails
 */
export async function sendMessageDigests(job: Job<MessageDigestJobData>) {
  const { frequency } = job.data;

  try {
    job.log(`Starting ${frequency} message digest job`);

    // Calculate "since" date based on frequency
    const since = new Date();
    if (frequency === 'daily') {
      since.setDate(since.getDate() - 1); // Last 24 hours
    } else {
      since.setDate(since.getDate() - 7); // Last 7 days
    }

    // Find all users who want digest emails at this frequency
    const users = await prisma.user.findMany({
      where: {
        deleted_at: null,
        isActive: true,
        emailPreferences: {
          messages: true,
          globalUnsubscribe: false,
          unsubscribedAt: null,
        },
      },
      include: {
        emailPreferences: true,
      },
    });

    job.log(`Found ${users.length} users to check for digest emails`);

    const notificationService = new MessageNotificationService(prisma, redis);
    let emailsSent = 0;

    for (const user of users) {
      try {
        // Check user's message notification preferences
        const categoryPrefs = user.emailPreferences?.categoryPreferences as any;
        const messagePrefs = categoryPrefs?.messages;

        // Skip if user doesn't want digest emails or wants immediate
        if (
          messagePrefs?.emailNotifications !== 'digest' ||
          messagePrefs?.digestFrequency !== frequency
        ) {
          continue;
        }

        // Get unread messages for this user
        const threads = await notificationService.getUnreadMessagesForDigest(
          user.id,
          since
        );

        // Skip if no unread messages
        if (threads.length === 0) {
          continue;
        }

        // Calculate total unread count
        const totalUnreadCount = threads.reduce(
          (sum, thread) => sum + thread.messages.length,
          0
        );

        // Transform threads for email template
        const emailThreads = threads.map((thread) => ({
          threadId: thread.threadId,
          threadSubject: thread.threadSubject,
          messageCount: thread.messages.length,
          senders: [
            ...new Set(thread.messages.map((msg) => msg.senderName)),
          ],
          latestMessage: {
            senderName: thread.messages[0].senderName,
            body:
              thread.messages[0].body.length > 200
                ? thread.messages[0].body.substring(0, 200) + '...'
                : thread.messages[0].body,
            createdAt: thread.messages[0].createdAt,
          },
        }));

        // Send digest email
        await emailService.sendTransactional({
          userId: user.id,
          email: user.email,
          subject: `You have ${totalUnreadCount} unread message${
            totalUnreadCount === 1 ? '' : 's'
          }`,
          template: 'message-digest',
          variables: {
            recipientName: user.name || 'there',
            frequency,
            threads: emailThreads,
            totalUnreadCount,
            inboxUrl: `${process.env.NEXT_PUBLIC_APP_URL}/messages`,
          },
          tags: {
            type: 'message_digest',
            frequency,
          },
        });

        emailsSent++;
        job.log(`Sent ${frequency} digest to ${user.email}`);
      } catch (error) {
        job.log(
          `Failed to send digest to ${user.email}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        // Continue with next user
      }
    }

    job.log(`${frequency} digest job completed. Sent ${emailsSent} emails.`);

    return {
      frequency,
      emailsSent,
      usersChecked: users.length,
    };
  } catch (error) {
    job.log(
      `Message digest job failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    throw error;
  }
}

/**
 * Schedule message digests
 * 
 * Daily digest: 9 AM daily
 * Weekly digest: 9 AM on Mondays
 */
export const MESSAGE_DIGEST_SCHEDULE = {
  daily: '0 9 * * *', // Every day at 9 AM
  weekly: '0 9 * * 1', // Every Monday at 9 AM
};
