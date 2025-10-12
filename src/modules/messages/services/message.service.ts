/**
 * Message Service
 * 
 * Manages individual messages within threads
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ContentModerationService } from './content-moderation.service';
import {
  MessageNotFoundError,
  MessageAccessDeniedError,
  CannotMessageUserError,
  RateLimitExceededError,
} from '../errors';
import type {
  SendMessageInput,
  SendMessageResult,
  ListMessagesInput,
  ListMessagesResult,
  MarkMessagesReadInput,
  SearchMessagesInput,
  CanMessageUserInput,
  CanMessageUserResult,
  RateLimitCheckResult,
} from '../types';

const RATE_LIMIT_MAX_MESSAGES = 50;
const RATE_LIMIT_WINDOW_HOURS = 1;

export class MessageService {
  private contentModerationService: ContentModerationService;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {
    this.contentModerationService = new ContentModerationService(prisma);
  }

  /**
   * Send a new message in a thread
   */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { threadId, senderId, recipientId, body } = input;

    // Check rate limit
    const rateLimitCheck = await this.checkRateLimit(senderId);
    if (!rateLimitCheck.allowed) {
      throw new RateLimitExceededError(rateLimitCheck.resetAt);
    }

    // Verify thread exists and user is participant
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new MessageNotFoundError(threadId);
    }

    const participants = thread.participantsJson as string[];
    if (!participants.includes(senderId)) {
      throw new MessageAccessDeniedError(threadId);
    }

    // Verify recipient is also a participant
    if (!participants.includes(recipientId)) {
      throw new CannotMessageUserError('Recipient is not a participant in this thread');
    }

    // Check if users can message each other
    const canMessage = await this.canMessageUser({ senderId, recipientId });
    if (!canMessage.allowed) {
      throw new CannotMessageUserError(canMessage.reason || 'Cannot send message to this user');
    }

    // Content moderation check
    const moderationResult = await this.contentModerationService.validateMessage({
      content: body,
      senderId,
      recipientId,
      threadId,
    });

    if (!moderationResult.approved) {
      throw new Error(`Message validation failed: ${moderationResult.errors.join(', ')}`);
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        threadId,
        senderId,
        recipientId,
        body,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
        attachments: true,
      },
    });

    // Log moderation if there were warnings or flags
    if (moderationResult.warnings.length > 0 || moderationResult.flags.length > 0) {
      await this.contentModerationService.logModerationEvent({
        messageId: message.id,
        result: moderationResult,
        senderId,
      });
    }

    // Update thread's last_message_at
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    // Increment rate limit counter
    await this.incrementRateLimit(senderId);

    return {
      message: {
        id: message.id,
        threadId: message.threadId,
        senderId: message.senderId,
        senderName: message.sender.name || 'Unknown',
        senderAvatar: message.sender.avatar,
        recipientId: message.recipientId,
        body: message.body,
        readAt: message.readAt,
        attachments: message.attachments.map((att) => ({
          id: att.id,
          messageId: att.messageId,
          storageKey: att.storageKey,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          createdAt: att.createdAt,
        })),
        createdAt: message.createdAt,
        isOwnMessage: true,
      },
      threadUpdated: true,
    };
  }

  /**
   * List messages in a thread
   */
  async listMessages(input: ListMessagesInput, currentUserId: string): Promise<ListMessagesResult> {
    const { threadId, userId, limit = 50, offset = 0 } = input;

    // Verify user is participant
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new MessageNotFoundError(threadId);
    }

    const participants = thread.participantsJson as string[];
    if (!participants.includes(userId)) {
      throw new MessageAccessDeniedError(threadId);
    }

    // Get messages
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          threadId,
          deletedAt: null,
        },
        include: {
          sender: {
            select: { id: true, name: true, avatar: true },
          },
          attachments: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.message.count({
        where: {
          threadId,
          deletedAt: null,
        },
      }),
    ]);

    const messageList = messages.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      senderId: msg.senderId,
      senderName: msg.sender.name || 'Unknown',
      senderAvatar: msg.sender.avatar,
      recipientId: msg.recipientId,
      body: msg.body,
      readAt: msg.readAt,
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        messageId: att.messageId,
        storageKey: att.storageKey,
        fileName: att.fileName,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        createdAt: att.createdAt,
      })),
      createdAt: msg.createdAt,
      isOwnMessage: msg.senderId === currentUserId,
    }));

    return {
      messages: messageList,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(input: MarkMessagesReadInput): Promise<number> {
    const { messageIds, userId } = input;

    // Update only messages where user is recipient
    const result = await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        recipientId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Mark all messages in a thread as read
   */
  async markThreadAsRead(userId: string, threadId: string): Promise<number> {
    const result = await this.prisma.message.updateMany({
      where: {
        threadId,
        recipientId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Search messages for a user
   */
  async searchMessages(input: SearchMessagesInput, userId: string): Promise<ListMessagesResult> {
    const { query, threadId, dateFrom, dateTo, limit = 20, offset = 0 } = input;

    // Build where clause
    const where: any = {
      deletedAt: null,
      OR: [
        { senderId: userId },
        { recipientId: userId },
      ],
      body: {
        contains: query,
        mode: 'insensitive',
      },
    };

    if (threadId) {
      where.threadId = threadId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          sender: {
            select: { id: true, name: true, avatar: true },
          },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.message.count({ where }),
    ]);

    const messageList = messages.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      senderId: msg.senderId,
      senderName: msg.sender.name || 'Unknown',
      senderAvatar: msg.sender.avatar,
      recipientId: msg.recipientId,
      body: msg.body,
      readAt: msg.readAt,
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        messageId: att.messageId,
        storageKey: att.storageKey,
        fileName: att.fileName,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        createdAt: att.createdAt,
      })),
      createdAt: msg.createdAt,
      isOwnMessage: msg.senderId === userId,
    }));

    return {
      messages: messageList,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new MessageNotFoundError(messageId);
    }

    // Only sender or recipient can delete
    if (message.senderId !== userId && message.recipientId !== userId) {
      throw new MessageAccessDeniedError(messageId);
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Check if a user can message another user
   */
  async canMessageUser(input: CanMessageUserInput): Promise<CanMessageUserResult> {
    const { senderId, recipientId } = input;

    // Don't allow messaging yourself
    if (senderId === recipientId) {
      return {
        allowed: false,
        reason: 'Cannot send messages to yourself',
      };
    }

    // Check if both users exist and are active
    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { deleted_at: true, isActive: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: recipientId },
        select: { deleted_at: true, isActive: true, role: true },
      }),
    ]);

    if (!sender || sender.deleted_at) {
      return {
        allowed: false,
        reason: 'Sender account not found or deleted',
      };
    }

    if (!sender.isActive) {
      return {
        allowed: false,
        reason: 'Sender account is not active',
      };
    }

    if (!recipient || recipient.deleted_at) {
      return {
        allowed: false,
        reason: 'Recipient not found or deleted',
      };
    }

    if (!recipient.isActive) {
      return {
        allowed: false,
        reason: 'Recipient account is not active',
      };
    }

    // Check if users have a business relationship (same project, license, etc.)
    // For now, allow messaging between creators and brands, or users with shared projects
    const hasRelationship = await this.checkUserRelationship(senderId, recipientId);

    if (!hasRelationship) {
      return {
        allowed: false,
        reason: 'No business relationship found',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if users have a business relationship
   */
  private async checkUserRelationship(userId1: string, userId2: string): Promise<boolean> {
    // Check if users are both participants in any project
    const sharedProjects = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM projects p1
      WHERE p1.brand_id IN (
        SELECT id FROM brands WHERE user_id = ${userId1}
        UNION
        SELECT id FROM brands WHERE user_id = ${userId2}
      )
      AND p1.deleted_at IS NULL
    `;

    if (sharedProjects[0]?.count > 0) {
      return true;
    }

    // Check if users have licenses together
    const sharedLicenses = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM licenses l
      JOIN ip_assets ia ON l.ip_asset_id = ia.id
      WHERE (ia.creator_id IN (
        SELECT id FROM creators WHERE user_id = ${userId1}
        UNION
        SELECT id FROM creators WHERE user_id = ${userId2}
      )
      OR l.brand_id IN (
        SELECT id FROM brands WHERE user_id = ${userId1}
        UNION
        SELECT id FROM brands WHERE user_id = ${userId2}
      ))
      AND l.deleted_at IS NULL
    `;

    if (sharedLicenses[0]?.count > 0) {
      return true;
    }

    // Admin users can message anyone
    const users = await this.prisma.user.findMany({
      where: { id: { in: [userId1, userId2] } },
      select: { role: true },
    });

    if (users.some((u) => u.role === 'ADMIN')) {
      return true;
    }

    return false;
  }

  /**
   * Check rate limit for user
   */
  private async checkRateLimit(userId: string): Promise<RateLimitCheckResult> {
    const key = `rate_limit:messages:${userId}`;
    const count = await this.redis.get(key);

    if (!count) {
      return {
        allowed: true,
        remainingMessages: RATE_LIMIT_MAX_MESSAGES,
        resetAt: new Date(Date.now() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000),
      };
    }

    const currentCount = parseInt(count, 10);
    if (currentCount >= RATE_LIMIT_MAX_MESSAGES) {
      const ttl = await this.redis.ttl(key);
      return {
        allowed: false,
        remainingMessages: 0,
        resetAt: new Date(Date.now() + ttl * 1000),
      };
    }

    return {
      allowed: true,
      remainingMessages: RATE_LIMIT_MAX_MESSAGES - currentCount,
      resetAt: new Date(Date.now() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000),
    };
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimit(userId: string): Promise<void> {
    const key = `rate_limit:messages:${userId}`;
    const count = await this.redis.get(key);

    if (!count) {
      await this.redis.setex(
        key,
        RATE_LIMIT_WINDOW_HOURS * 60 * 60,
        '1'
      );
    } else {
      await this.redis.incr(key);
    }
  }
}
