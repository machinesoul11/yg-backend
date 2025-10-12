/**
 * Messaging Module - tRPC Router
 * 
 * API endpoints for messaging system
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { ThreadService } from './services/thread.service';
import { MessageService } from './services/message.service';
import { AttachmentService } from './services/attachment.service';
import { MessageNotificationService } from './services/notification.service';
import { DataPrivacyService } from './services/data-privacy.service';
import {
  MessageError,
  ThreadNotFoundError,
  ThreadAccessDeniedError,
  MessageNotFoundError,
  MessageAccessDeniedError,
  CannotMessageUserError,
  RateLimitExceededError,
  AttachmentNotFoundError,
} from './errors';
import {
  CreateThreadSchema,
  GetThreadSchema,
  ListThreadsSchema,
  ArchiveThreadSchema,
  SendMessageSchema,
  ListMessagesSchema,
  MarkMessagesReadSchema,
  MarkMessageReadSchema,
  MarkThreadReadSchema,
  SearchMessagesSchema,
  UploadAttachmentSchema,
  GetAttachmentSchema,
  DeleteAttachmentSchema,
} from './validation';

// Initialize services
const threadService = new ThreadService(prisma, redis);
const messageService = new MessageService(prisma, redis);
const attachmentService = new AttachmentService(prisma);
const notificationService = new MessageNotificationService(prisma, redis);
const dataPrivacyService = new DataPrivacyService(prisma);

// ===========================
// Helper Functions
// ===========================

function handleMessageError(error: unknown): never {
  if (error instanceof ThreadNotFoundError || error instanceof MessageNotFoundError || error instanceof AttachmentNotFoundError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  
  if (error instanceof ThreadAccessDeniedError || error instanceof MessageAccessDeniedError || error instanceof CannotMessageUserError) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }
  
  if (error instanceof RateLimitExceededError) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: error.message,
    });
  }
  
  if (error instanceof MessageError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  
  console.error('Unexpected messaging error:', error);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

// ===========================
// Router Definition
// ===========================

export const messagesRouter = createTRPCRouter({
  // Thread Management
  createThread: protectedProcedure
    .input(CreateThreadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await threadService.createThread(ctx.session.user.id, input);
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  listThreads: protectedProcedure
    .input(ListThreadsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const result = await threadService.listThreads({
          ...input,
          userId: ctx.session.user.id,
        });
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  getThread: protectedProcedure
    .input(GetThreadSchema)
    .query(async ({ ctx, input }) => {
      try {
        const thread = await threadService.getThread(ctx.session.user.id, input.threadId);
        return thread;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  archiveThread: protectedProcedure
    .input(ArchiveThreadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await threadService.archiveThread(ctx.session.user.id, input.threadId);
        return { success: true };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const result = await threadService.getUnreadCount(ctx.session.user.id);
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  // Message Operations
  sendMessage: protectedProcedure
    .input(SendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await messageService.sendMessage({
          ...input,
          senderId: ctx.session.user.id,
        });
        
        // Trigger notification to recipient
        await notificationService.notifyNewMessage({
          messageId: result.message.id,
          threadId: input.threadId,
          senderId: ctx.session.user.id,
          recipientId: input.recipientId,
          messageBody: input.body,
        });
        
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  listMessages: protectedProcedure
    .input(ListMessagesSchema)
    .query(async ({ ctx, input }) => {
      try {
        const result = await messageService.listMessages(
          { ...input, userId: ctx.session.user.id },
          ctx.session.user.id
        );
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  markMessagesRead: protectedProcedure
    .input(MarkMessagesReadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const count = await messageService.markMessagesAsRead({
          ...input,
          userId: ctx.session.user.id,
        });
        return { count };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  markMessageRead: protectedProcedure
    .input(MarkMessageReadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const count = await messageService.markMessagesAsRead({
          messageIds: [input.messageId],
          userId: ctx.session.user.id,
        });
        return { success: count > 0 };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  markThreadRead: protectedProcedure
    .input(MarkThreadReadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const count = await messageService.markThreadAsRead(
          ctx.session.user.id,
          input.threadId
        );
        return { count };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  searchMessages: protectedProcedure
    .input(SearchMessagesSchema)
    .query(async ({ ctx, input }) => {
      try {
        const searchInput = {
          userId: ctx.session.user.id,
          query: input.query,
          threadId: input.threadId,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          limit: input.limit,
          offset: input.offset,
        };
        const result = await messageService.searchMessages(searchInput, ctx.session.user.id);
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  // Attachment Operations
  generateUploadUrl: protectedProcedure
    .input(z.object({
      messageId: z.string().cuid(),
      fileName: z.string().min(1).max(255),
      contentType: z.string(),
      fileSize: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB max
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await attachmentService.generateUploadUrl(
          ctx.session.user.id,
          input.messageId,
          input.fileName,
          input.contentType,
          input.fileSize
        );
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  createAttachment: protectedProcedure
    .input(z.object({
      messageId: z.string().cuid(),
      storageKey: z.string().min(1),
      fileName: z.string().min(1).max(255),
      fileSize: z.number().int().min(1).max(10 * 1024 * 1024),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const attachment = await attachmentService.createAttachment(
          ctx.session.user.id,
          input
        );
        return attachment;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  getAttachment: protectedProcedure
    .input(GetAttachmentSchema)
    .query(async ({ ctx, input }) => {
      try {
        const attachment = await attachmentService.getAttachment(
          ctx.session.user.id,
          input.attachmentId
        );
        return attachment;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  getMessageAttachments: protectedProcedure
    .input(z.object({ messageId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const attachments = await attachmentService.getMessageAttachments(
          ctx.session.user.id,
          input.messageId
        );
        return attachments;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  deleteAttachment: protectedProcedure
    .input(DeleteAttachmentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await attachmentService.deleteAttachment(
          ctx.session.user.id,
          input.attachmentId
        );
        return { success: true };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  // Notification Preferences
  muteThread: protectedProcedure
    .input(z.object({ threadId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await notificationService.muteThread(ctx.session.user.id, input.threadId);
        return { success: true };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  unmuteThread: protectedProcedure
    .input(z.object({ threadId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await notificationService.unmuteThread(ctx.session.user.id, input.threadId);
        return { success: true };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  updateNotificationPreferences: protectedProcedure
    .input(
      z.object({
        emailNotifications: z.enum(['immediate', 'digest', 'off']).optional(),
        inAppNotifications: z.boolean().optional(),
        digestFrequency: z.enum(['daily', 'weekly']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await notificationService.updateNotificationPreferences(ctx.session.user.id, input);
        return { success: true };
      } catch (error) {
        handleMessageError(error);
      }
    }),

  // GDPR & Data Privacy
  exportMyMessageData: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const result = await dataPrivacyService.exportUserMessageData(ctx.session.user.id);
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  deleteMyMessageData: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const result = await dataPrivacyService.deleteUserMessageData(ctx.session.user.id);
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),

  // Admin: Message retention cleanup
  cleanupOldMessages: adminProcedure
    .mutation(async () => {
      try {
        const result = await dataPrivacyService.cleanupOldDeletedMessages();
        return result;
      } catch (error) {
        handleMessageError(error);
      }
    }),
});
