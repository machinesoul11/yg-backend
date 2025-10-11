/**
 * Notification Service
 * 
 * Manages in-app notifications for users
 */

import { PrismaClient, Notification } from '@prisma/client';
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

    // Invalidate unread count cache for all users
    await Promise.all(
      targetUserIds.map((userId) => this.redis.del(`notifications:unread:${userId}`))
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
}
