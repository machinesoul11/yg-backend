/**
 * Message Notification Service
 * 
 * Handles notification and email triggers for messaging events
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { NotificationService } from '@/modules/system/services/notification.service';
import { redis } from '@/lib/redis';

interface MessageNotificationPayload {
  messageId: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  messageBody: string;
}

interface DigestNotificationPayload {
  userId: string;
}

// Initialize BullMQ queue for message notifications
export const messageNotificationQueue = new Queue('message-notifications', {
  connection: redis,
});

export class MessageNotificationService {
  private notificationService: NotificationService;

  constructor(
    private prisma: PrismaClient,
    private redisClient: Redis
  ) {
    this.notificationService = new NotificationService(prisma, redisClient);
  }

  /**
   * Trigger notification when a new message is sent
   */
  async notifyNewMessage(payload: MessageNotificationPayload): Promise<void> {
    const { messageId, threadId, senderId, recipientId, messageBody } = payload;

    // Get sender and recipient details
    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, name: true, avatar: true },
      }),
      this.prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, email: true, name: true },
      }),
    ]);

    if (!sender || !recipient) {
      console.error('Sender or recipient not found for message notification');
      return;
    }

    // Get thread details
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      select: { subject: true },
    });

    // Check notification preferences
    const preferences = await this.getMessageNotificationPreferences(recipientId);

    // Create in-app notification
    await this.createInAppNotification({
      recipientId,
      senderId,
      senderName: sender.name || 'Someone',
      threadId,
      threadSubject: thread?.subject,
      messagePreview: this.truncateMessage(messageBody),
    });

    // Check if we should send email notification
    if (preferences.emailNotifications === 'immediate') {
      // Check if cooldown period has passed
      const canSendEmail = await this.checkEmailCooldown(recipientId, threadId);
      
      if (canSendEmail) {
        // Queue email notification job
        await messageNotificationQueue.add(
          'send-message-notification-email',
          {
            recipientId,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            senderId,
            senderName: sender.name,
            threadId,
            threadSubject: thread?.subject,
            messagePreview: this.truncateMessage(messageBody),
            messageId,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );

        // Set cooldown (5 minutes)
        await this.setEmailCooldown(recipientId, threadId);
      }
    }
  }

  /**
   * Create in-app notification for new message
   */
  private async createInAppNotification(params: {
    recipientId: string;
    senderId: string;
    senderName: string;
    threadId: string;
    threadSubject?: string | null;
    messagePreview: string;
  }): Promise<void> {
    const { recipientId, senderName, threadId, threadSubject, messagePreview } = params;

    // Check if thread is muted
    const isMuted = await this.isThreadMuted(recipientId, threadId);
    if (isMuted) {
      return; // Don't create notification for muted threads
    }

    const title = threadSubject
      ? `New message in "${threadSubject}"`
      : `New message from ${senderName}`;

    await this.notificationService.create({
      userId: recipientId,
      type: 'MESSAGE' as any, // Will be valid after migration
      title,
      message: messagePreview,
      priority: 'MEDIUM',
      actionUrl: `/messages/${threadId}`,
      metadata: {
        threadId,
        messagePreview,
      },
    });
  }

  /**
   * Get user's message notification preferences
   */
  private async getMessageNotificationPreferences(userId: string): Promise<{
    emailNotifications: 'immediate' | 'digest' | 'off';
    inAppNotifications: boolean;
    digestFrequency?: 'daily' | 'weekly';
  }> {
    const prefs = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    // Default preferences if not set
    if (!prefs) {
      return {
        emailNotifications: 'immediate',
        inAppNotifications: true,
      };
    }

    // Check if messages are enabled
    if (!prefs.messages) {
      return {
        emailNotifications: 'off',
        inAppNotifications: false,
      };
    }

    // Check categoryPreferences for message-specific preferences
    const categoryPrefs = prefs.categoryPreferences as any;
    const messagePrefs = categoryPrefs?.messages;

    return {
      emailNotifications: messagePrefs?.emailNotifications || 'immediate',
      inAppNotifications: messagePrefs?.inAppNotifications !== false,
      digestFrequency: messagePrefs?.digestFrequency || 'daily',
    };
  }

  /**
   * Check if email cooldown period has passed
   * Prevents sending too many emails for rapid-fire messages
   */
  private async checkEmailCooldown(userId: string, threadId: string): Promise<boolean> {
    const key = `message:email_cooldown:${userId}:${threadId}`;
    const cooldown = await this.redisClient.get(key);
    return cooldown === null;
  }

  /**
   * Set email cooldown period (5 minutes)
   */
  private async setEmailCooldown(userId: string, threadId: string): Promise<void> {
    const key = `message:email_cooldown:${userId}:${threadId}`;
    await this.redisClient.setex(key, 300, '1'); // 5 minutes
  }

  /**
   * Check if thread is muted for user
   */
  async isThreadMuted(userId: string, threadId: string): Promise<boolean> {
    const prefs = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) return false;

    const categoryPrefs = prefs.categoryPreferences as any;
    const mutedThreads = categoryPrefs?.mutedThreads || [];
    return mutedThreads.includes(threadId);
  }

  /**
   * Mute notifications for a specific thread
   */
  async muteThread(userId: string, threadId: string): Promise<void> {
    const existing = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    const categoryPrefs = (existing?.categoryPreferences as any) || {};
    const mutedThreads = categoryPrefs.mutedThreads || [];

    if (!mutedThreads.includes(threadId)) {
      mutedThreads.push(threadId);
    }

    await this.prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        categoryPreferences: { mutedThreads },
      },
      update: {
        categoryPreferences: { ...categoryPrefs, mutedThreads },
      },
    });
  }

  /**
   * Unmute notifications for a specific thread
   */
  async unmuteThread(userId: string, threadId: string): Promise<void> {
    const prefs = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) return;

    const categoryPrefs = prefs.categoryPreferences as any;
    const mutedThreads = (categoryPrefs?.mutedThreads || []).filter(
      (id: string) => id !== threadId
    );

    await this.prisma.emailPreferences.update({
      where: { userId },
      data: {
        categoryPreferences: { ...categoryPrefs, mutedThreads },
      },
    });
  }

  /**
   * Update message notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: {
      emailNotifications?: 'immediate' | 'digest' | 'off';
      inAppNotifications?: boolean;
      digestFrequency?: 'daily' | 'weekly';
    }
  ): Promise<void> {
    const existing = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    const categoryPrefs = (existing?.categoryPreferences as any) || {};
    const currentMessagePrefs = categoryPrefs.messages || {};

    await this.prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        categoryPreferences: {
          messages: {
            ...currentMessagePrefs,
            ...preferences,
          },
        },
      },
      update: {
        categoryPreferences: {
          ...categoryPrefs,
          messages: {
            ...currentMessagePrefs,
            ...preferences,
          },
        },
      },
    });
  }

  /**
   * Get unread messages for digest
   */
  async getUnreadMessagesForDigest(
    userId: string,
    since: Date
  ): Promise<Array<{
    threadId: string;
    threadSubject: string | null;
    messages: Array<{
      id: string;
      senderName: string;
      body: string;
      createdAt: Date;
    }>;
  }>> {
    // Get all unread messages for user since the given date
    const messages = await this.prisma.message.findMany({
      where: {
        recipientId: userId,
        readAt: null,
        deletedAt: null,
        createdAt: { gte: since },
      },
      include: {
        thread: {
          select: { id: true, subject: true },
        },
        sender: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by thread
    const byThread = messages.reduce((acc, msg) => {
      const threadId = msg.thread.id;
      if (!acc[threadId]) {
        acc[threadId] = {
          threadId,
          threadSubject: msg.thread.subject,
          messages: [],
        };
      }
      acc[threadId].messages.push({
        id: msg.id,
        senderName: msg.sender.name || 'Unknown',
        body: msg.body,
        createdAt: msg.createdAt,
      });
      return acc;
    }, {} as Record<string, any>);

    return Object.values(byThread);
  }

  /**
   * Truncate message for preview
   */
  private truncateMessage(body: string, maxLength: number = 100): string {
    if (body.length <= maxLength) return body;
    return body.substring(0, maxLength).trim() + '...';
  }
}
