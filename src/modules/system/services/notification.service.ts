/**
 * Notification Service
 * 
 * Manages in-app notifications for users with support for:
 * - Bulk notification creation
 * - Priority handling
 * - Notification categorization
 * - Bundling/grouping logic
 * - Expiry and cleanup
 */

import { PrismaClient, Notification, NotificationType, NotificationPriority } from '@prisma/client';
import { Redis } from 'ioredis';
import { NotificationError } from '../errors';
import type {
  CreateNotificationInput,
  ListNotificationsInput,
  CreateNotificationResult,
} from '../types';

export class NotificationService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Create notification for user(s)
   */
  async create(params: CreateNotificationInput): Promise<CreateNotificationResult> {
    let targetUserIds: string[] = [];

    if (params.userId) {
      targetUserIds = [params.userId];
    } else if (params.userIds) {
      targetUserIds = params.userIds;
    } else if (params.userRole) {
      // Fetch all users with role
      const users = await this.prisma.user.findMany({
        where: { role: params.userRole, deleted_at: null },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    if (targetUserIds.length === 0) {
      throw new NotificationError('INVALID_TARGET', 'No target users found');
    }

    // Batch create notifications
    const notifications = await this.prisma.$transaction(
      targetUserIds.map((userId) =>
        this.prisma.notification.create({
          data: {
            userId,
            type: params.type,
            title: params.title,
            message: params.message,
            priority: params.priority ?? 'MEDIUM',
            actionUrl: params.actionUrl,
            metadata: params.metadata as any,
          },
        })
      )
    );

    // Invalidate unread count cache and poll cache for all users
    await Promise.all(
      targetUserIds.map((userId) => 
        Promise.all([
          this.redis.del(`notifications:unread:${userId}`),
          this.redis.del(`notifications:poll:empty:${userId}`),
        ])
      )
    );

    return {
      created: notifications.length,
      notificationIds: notifications.map((n) => n.id),
    };
  }

  /**
   * List user notifications (paginated)
   */
  async listForUser(
    params: ListNotificationsInput & { userId: string }
  ): Promise<{
    notifications: Notification[];
    total: number;
  }> {
    const where: any = {
      userId: params.userId,
    };

    if (params.read !== undefined) {
      where.read = params.read;
    }
    if (params.type) {
      where.type = params.type;
    }
    if (params.priority) {
      where.priority = params.priority;
    }

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Get unread count (cached)
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notifications:unread:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached);
    }

    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    await this.redis.set(cacheKey, count.toString(), 'EX', 60); // 1min TTL

    return count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotificationError('NOT_FOUND', 'Notification not found');
    }

    if (notification.read) {
      return notification; // Already read
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);

    return updated;
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);

    return result.count;
  }

  /**
   * Delete notification
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotificationError('NOT_FOUND', 'Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);
  }

  /**
   * Create notification with bundling support
   * Prevents notification spam by bundling similar notifications
   */
  async createWithBundling(params: CreateNotificationInput & {
    bundleKey?: string;
    bundleWindow?: number; // in minutes, default 5
  }): Promise<CreateNotificationResult> {
    const bundleWindow = params.bundleWindow ?? 5;
    const shouldBundle = params.bundleKey && !['URGENT', 'HIGH'].includes(params.priority ?? 'MEDIUM');

    if (!shouldBundle) {
      return this.create(params);
    }

    // Check for existing notification within bundle window
    const windowStart = new Date(Date.now() - bundleWindow * 60 * 1000);
    
    let targetUserIds: string[] = [];
    if (params.userId) {
      targetUserIds = [params.userId];
    } else if (params.userIds) {
      targetUserIds = params.userIds;
    } else if (params.userRole) {
      const users = await this.prisma.user.findMany({
        where: { role: params.userRole, deleted_at: null },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    const results: string[] = [];
    
    for (const userId of targetUserIds) {
      // Look for existing notification with same bundle key
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: params.type,
          read: false,
          createdAt: { gte: windowStart },
          metadata: {
            path: ['bundleKey'],
            equals: params.bundleKey,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        // Update existing notification
        const currentMetadata = (existing.metadata as any) || {};
        const bundleCount = (currentMetadata.bundleCount || 1) + 1;
        
        const updated = await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            message: params.message.replace(/\d+/, bundleCount.toString()),
            title: params.title,
            metadata: {
              ...currentMetadata,
              bundleCount,
              bundleKey: params.bundleKey,
              lastBundledAt: new Date().toISOString(),
            },
          },
        });
        results.push(updated.id);
      } else {
        // Create new notification
        const notification = await this.prisma.notification.create({
          data: {
            userId,
            type: params.type,
            title: params.title,
            message: params.message,
            priority: params.priority ?? 'MEDIUM',
            actionUrl: params.actionUrl,
            metadata: {
              ...(params.metadata || {}),
              bundleKey: params.bundleKey,
              bundleCount: 1,
            } as any,
          },
        });
        results.push(notification.id);
      }
      
      // Invalidate cache
      await Promise.all([
        this.redis.del(`notifications:unread:${userId}`),
        this.redis.del(`notifications:poll:empty:${userId}`),
      ]);
    }

    return {
      created: results.length,
      notificationIds: results,
    };
  }

  /**
   * Get notifications by type (categorization)
   */
  async getByType(
    userId: string,
    types: NotificationType[],
    options?: { read?: boolean; limit?: number }
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        type: { in: types },
        ...(options?.read !== undefined && { read: options.read }),
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      take: options?.limit,
    });
  }

  /**
   * Get notification counts by category
   */
  async getCountsByCategory(userId: string): Promise<Record<NotificationType, number>> {
    const counts = await this.prisma.notification.groupBy({
      by: ['type'],
      where: {
        userId,
        read: false,
      },
      _count: true,
    });

    const result: any = {
      LICENSE: 0,
      PAYOUT: 0,
      ROYALTY: 0,
      PROJECT: 0,
      SYSTEM: 0,
      MESSAGE: 0,
    };

    counts.forEach((item) => {
      result[item.type] = item._count;
    });

    return result;
  }

  /**
   * Check if notification requires immediate email delivery based on priority
   */
  shouldSendImmediateEmail(priority: NotificationPriority): boolean {
    return ['HIGH', 'URGENT'].includes(priority);
  }

  /**
   * Get notifications eligible for digest email
   */
  async getDigestNotifications(
    userId: string,
    since: Date
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        read: false,
        priority: { in: ['LOW', 'MEDIUM'] },
        createdAt: { gte: since },
      },
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Cleanup old notifications based on expiry rules
   * - Read notifications older than 30 days
   * - Unread LOW/MEDIUM notifications older than 90 days
   * - Read SYSTEM notifications older than 7 days
   */
  async cleanupExpired(): Promise<{ deleted: number; archived?: number }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Delete read notifications older than 30 days
    const readDeleted = await this.prisma.notification.deleteMany({
      where: {
        read: true,
        readAt: { lt: thirtyDaysAgo },
        type: { not: 'SYSTEM' },
      },
    });

    // Delete old system notifications (7 days if read)
    const systemDeleted = await this.prisma.notification.deleteMany({
      where: {
        type: 'SYSTEM',
        read: true,
        readAt: { lt: sevenDaysAgo },
      },
    });

    // Delete very old unread non-urgent notifications
    const unreadDeleted = await this.prisma.notification.deleteMany({
      where: {
        read: false,
        priority: { in: ['LOW', 'MEDIUM'] },
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    const totalDeleted = readDeleted.count + systemDeleted.count + unreadDeleted.count;

    return { deleted: totalDeleted };
  }

  /**
   * Bulk create notifications efficiently
   * Uses createMany for better performance with large user lists
   */
  async bulkCreate(
    userIds: string[],
    notification: {
      type: NotificationType;
      title: string;
      message: string;
      priority?: NotificationPriority;
      actionUrl?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<CreateNotificationResult> {
    if (userIds.length === 0) {
      throw new NotificationError('INVALID_TARGET', 'No target users provided');
    }

    // For very large batches (>200), use createMany for efficiency
    if (userIds.length > 200) {
      const result = await this.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority ?? 'MEDIUM',
          actionUrl: notification.actionUrl,
          metadata: notification.metadata as any,
        })),
        skipDuplicates: true,
      });

      // Invalidate cache for all users
      await Promise.all(
        userIds.map((userId) => 
          Promise.all([
            this.redis.del(`notifications:unread:${userId}`),
            this.redis.del(`notifications:poll:empty:${userId}`),
          ])
        )
      );

      return {
        created: result.count,
        notificationIds: [], // createMany doesn't return IDs
      };
    }

    // For smaller batches, use transaction to get IDs
    return this.create({ userIds, ...notification });
  }

  /**
   * Delete all notifications for a user (GDPR compliance)
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    await this.redis.del(`notifications:unread:${userId}`);

    return result.count;
  }
}
