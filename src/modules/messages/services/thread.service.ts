/**
 * Thread Service
 * 
 * Manages message threads and conversations
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  ThreadNotFoundError,
  ThreadAccessDeniedError,
  InvalidParticipantsError,
} from '../errors';
import type {
  CreateThreadInput,
  CreateThreadResult,
  ListThreadsInput,
  ListThreadsResult,
  ThreadDetails,
  ThreadListItem,
  UnreadCountResult,
} from '../types';

export class ThreadService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Create a new message thread or return existing thread between participants
   */
  async createThread(
    userId: string,
    input: CreateThreadInput
  ): Promise<CreateThreadResult> {
    // Validate that requesting user is in participants
    if (!input.participantIds.includes(userId)) {
      throw new InvalidParticipantsError('You must be a participant in the thread');
    }

    // Remove duplicates and sort for consistent comparison
    const participantIds = [...new Set(input.participantIds)].sort();

    // Validate all participants exist
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: participantIds },
        deleted_at: null,
      },
      select: { id: true, name: true, avatar: true },
    });

    if (users.length !== participantIds.length) {
      throw new InvalidParticipantsError('One or more participants not found');
    }

    // Check for existing thread with same participants
    const existingThreads = await this.prisma.messageThread.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        subject: true,
        participantsJson: true,
        lastMessageAt: true,
        createdAt: true,
      },
    });

    const existingThread = existingThreads.find((thread) => {
      const threadParticipants = (thread.participantsJson as string[]).sort();
      return (
        threadParticipants.length === participantIds.length &&
        threadParticipants.every((id, index) => id === participantIds[index])
      );
    });

    if (existingThread) {
      return {
        thread: {
          id: existingThread.id,
          subject: existingThread.subject,
          participantIds,
          participants: users.map((u) => ({
            userId: u.id,
            name: u.name || 'Unknown',
            avatar: u.avatar,
          })),
          lastMessageAt: existingThread.lastMessageAt,
          createdAt: existingThread.createdAt,
        },
        existingThread: true,
      };
    }

    // Create new thread
    const thread = await this.prisma.messageThread.create({
      data: {
        subject: input.subject,
        participantsJson: participantIds,
        lastMessageAt: new Date(),
      },
    });

    return {
      thread: {
        id: thread.id,
        subject: thread.subject,
        participantIds,
        participants: users.map((u) => ({
          userId: u.id,
          name: u.name || 'Unknown',
          avatar: u.avatar,
        })),
        lastMessageAt: thread.lastMessageAt,
        createdAt: thread.createdAt,
      },
      existingThread: false,
    };
  }

  /**
   * List threads for a user with pagination
   */
  async listThreads(input: ListThreadsInput): Promise<ListThreadsResult> {
    const { userId, limit = 20, offset = 0, includeArchived = false } = input;

    // Find threads where user is a participant
    const where = {
      deletedAt: includeArchived ? undefined : null,
    };

    // Get all threads and filter by participant in application layer
    // (JSONB queries with Prisma can be tricky)
    const allThreads = await this.prisma.messageThread.findMany({
      where,
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Filter threads where user is participant
    const userThreads = allThreads.filter((thread) => {
      const participants = thread.participantsJson as string[];
      return participants.includes(userId);
    });

    // Paginate
    const total = userThreads.length;
    const paginatedThreads = userThreads.slice(offset, offset + limit);

    // Get participant details and unread counts
    const threadsWithDetails: ThreadListItem[] = await Promise.all(
      paginatedThreads.map(async (thread) => {
        const participantIds = thread.participantsJson as string[];
        const participants = await this.prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, name: true, avatar: true },
        });

        const unreadCount = await this.prisma.message.count({
          where: {
            threadId: thread.id,
            recipientId: userId,
            readAt: null,
            deletedAt: null,
          },
        });

        const lastMessage = thread.messages[0]
          ? {
              body: thread.messages[0].body,
              senderId: thread.messages[0].senderId,
              senderName: thread.messages[0].sender.name || 'Unknown',
              createdAt: thread.messages[0].createdAt,
            }
          : null;

        return {
          id: thread.id,
          subject: thread.subject,
          participants: participants.map((p) => ({
            userId: p.id,
            name: p.name || 'Unknown',
            avatar: p.avatar,
          })),
          lastMessageAt: thread.lastMessageAt,
          unreadCount,
          lastMessage,
          createdAt: thread.createdAt,
        };
      })
    );

    return {
      threads: threadsWithDetails,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get thread details with messages
   */
  async getThread(userId: string, threadId: string): Promise<ThreadDetails> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          where: { deletedAt: null },
          include: {
            sender: {
              select: { id: true, name: true, avatar: true },
            },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 50, // Limit initial message load
        },
      },
    });

    if (!thread) {
      throw new ThreadNotFoundError(threadId);
    }

    // Check if user is participant
    const participants = thread.participantsJson as string[];
    if (!participants.includes(userId)) {
      throw new ThreadAccessDeniedError(threadId);
    }

    // Get participant details
    const participantUsers = await this.prisma.user.findMany({
      where: { id: { in: participants } },
      select: { id: true, name: true, avatar: true },
    });

    const unreadCount = await this.prisma.message.count({
      where: {
        threadId: thread.id,
        recipientId: userId,
        readAt: null,
        deletedAt: null,
      },
    });

    const messages = thread.messages.map((msg) => ({
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
      id: thread.id,
      subject: thread.subject,
      participants: participantUsers.map((p) => ({
        userId: p.id,
        name: p.name || 'Unknown',
        avatar: p.avatar,
      })),
      lastMessageAt: thread.lastMessageAt,
      unreadCount,
      messages,
      totalMessages: thread.messages.length,
      createdAt: thread.createdAt,
      lastMessage: messages.length > 0 ? {
        body: messages[messages.length - 1].body,
        senderId: messages[messages.length - 1].senderId,
        senderName: messages[messages.length - 1].senderName,
        createdAt: messages[messages.length - 1].createdAt,
      } : null,
    };
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: string): Promise<UnreadCountResult> {
    const unreadMessages = await this.prisma.message.findMany({
      where: {
        recipientId: userId,
        readAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        threadId: true,
      },
    });

    const byThread: Record<string, number> = {};
    unreadMessages.forEach((msg) => {
      byThread[msg.threadId] = (byThread[msg.threadId] || 0) + 1;
    });

    return {
      total: unreadMessages.length,
      byThread,
    };
  }

  /**
   * Archive (soft delete) a thread for a user
   */
  async archiveThread(userId: string, threadId: string): Promise<void> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new ThreadNotFoundError(threadId);
    }

    // Check if user is participant
    const participants = thread.participantsJson as string[];
    if (!participants.includes(userId)) {
      throw new ThreadAccessDeniedError(threadId);
    }

    // For now, just soft delete the thread
    // In a more advanced implementation, you might track per-user archival
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Check if user is participant in thread
   */
  async isThreadParticipant(userId: string, threadId: string): Promise<boolean> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      select: { participantsJson: true, deletedAt: true },
    });

    if (!thread || thread.deletedAt) {
      return false;
    }

    const participants = thread.participantsJson as string[];
    return participants.includes(userId);
  }
}
