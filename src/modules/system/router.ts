/**
 * System Module - tRPC Router
 * 
 * API endpoints for system infrastructure
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { IdempotencyService } from './services/idempotency.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { NotificationService } from './services/notification.service';
import {
  IdempotencyError,
  FeatureFlagError,
  NotificationError,
} from './errors';
import {
  CheckIdempotencyKeySchema,
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  DeleteFeatureFlagSchema,
  ListNotificationsSchema,
  CreateNotificationSchema,
  MarkAsReadSchema,
  DeleteNotificationSchema,
} from './validation';

// Initialize services
const idempotencyService = new IdempotencyService(prisma);
const featureFlagService = new FeatureFlagService(prisma, redis);
const notificationService = new NotificationService(prisma, redis);

// ===========================
// Helper Functions
// ===========================

function handleIdempotencyError(error: unknown): never {
  if (error instanceof IdempotencyError) {
    if (error.code === 'PROCESSING') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: error.message,
      });
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

function handleFeatureFlagError(error: unknown): never {
  if (error instanceof FeatureFlagError) {
    if (error.code === 'DUPLICATE') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: error.message,
      });
    }
    if (error.code === 'NOT_FOUND') {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
      });
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

function handleNotificationError(error: unknown): never {
  if (error instanceof NotificationError) {
    if (error.code === 'NOT_FOUND') {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
      });
    }
    if (error.code === 'UNAUTHORIZED') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
      });
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

// ===========================
// Router Definition
// ===========================

export const systemRouter = createTRPCRouter({
  // ==================
  // Idempotency Keys
  // ==================

  idempotency: createTRPCRouter({
    check: protectedProcedure
      .input(CheckIdempotencyKeySchema)
      .query(async ({ input }) => {
        try {
          const result = await idempotencyService.check(input.key);
          return { data: result };
        } catch (error) {
          handleIdempotencyError(error);
        }
      }),
  }),

  // ==================
  // Feature Flags
  // ==================

  featureFlags: createTRPCRouter({
    isEnabled: protectedProcedure
      .input(z.object({ flagName: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;
          const userRole = ctx.session.user.role as 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';

          const enabled = await featureFlagService.isEnabled(input.flagName, {
            userId,
            userRole,
          });

          return { data: { enabled } };
        } catch (error) {
          handleFeatureFlagError(error);
        }
      }),

    list: adminProcedure.query(async () => {
      try {
        const flags = await featureFlagService.listFlags();
        return {
          data: flags.map((flag) => ({
            id: flag.id,
            name: flag.name,
            enabled: flag.enabled,
            description: flag.description,
            rolloutPercentage: flag.rolloutPercentage,
            conditions: flag.conditions,
            createdBy: flag.createdBy,
            updatedBy: flag.updatedBy,
            createdAt: flag.createdAt.toISOString(),
            updatedAt: flag.updatedAt.toISOString(),
          })),
        };
      } catch (error) {
        handleFeatureFlagError(error);
      }
    }),

    create: adminProcedure
      .input(CreateFeatureFlagSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const createdBy = ctx.session.user.id;
          const flag = await featureFlagService.createFlag(input, createdBy);

          return {
            data: {
              id: flag.id,
              name: flag.name,
              enabled: flag.enabled,
              description: flag.description,
              rolloutPercentage: flag.rolloutPercentage,
              conditions: flag.conditions,
              createdBy: flag.createdBy,
              updatedBy: flag.updatedBy,
              createdAt: flag.createdAt.toISOString(),
              updatedAt: flag.updatedAt.toISOString(),
            },
          };
        } catch (error) {
          handleFeatureFlagError(error);
        }
      }),

    update: adminProcedure
      .input(UpdateFeatureFlagSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const updatedBy = ctx.session.user.id;
          const { id, ...data } = input;
          const flag = await featureFlagService.updateFlag(id, data, updatedBy);

          return {
            data: {
              id: flag.id,
              name: flag.name,
              enabled: flag.enabled,
              description: flag.description,
              rolloutPercentage: flag.rolloutPercentage,
              conditions: flag.conditions,
              createdBy: flag.createdBy,
              updatedBy: flag.updatedBy,
              createdAt: flag.createdAt.toISOString(),
              updatedAt: flag.updatedAt.toISOString(),
            },
          };
        } catch (error) {
          handleFeatureFlagError(error);
        }
      }),

    delete: adminProcedure
      .input(DeleteFeatureFlagSchema)
      .mutation(async ({ input }) => {
        try {
          await featureFlagService.deleteFlag(input.id);
          return { data: { success: true } };
        } catch (error) {
          handleFeatureFlagError(error);
        }
      }),
  }),

  // ==================
  // Notifications
  // ==================

  notifications: createTRPCRouter({
    list: protectedProcedure
      .input(ListNotificationsSchema)
      .query(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;
          const { notifications, total } = await notificationService.listForUser({
            ...input,
            userId,
          });

          const pageSize = input.pageSize ?? 20;
          const page = input.page ?? 1;

          return {
            data: notifications.map((n) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              message: n.message,
              actionUrl: n.actionUrl,
              priority: n.priority,
              read: n.read,
              readAt: n.readAt?.toISOString() || null,
              metadata: n.metadata,
              createdAt: n.createdAt.toISOString(),
            })),
            meta: {
              pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
              },
            },
          };
        } catch (error) {
          handleNotificationError(error);
        }
      }),

    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
      try {
        const userId = ctx.session.user.id;
        const count = await notificationService.getUnreadCount(userId);
        return { data: { count } };
      } catch (error) {
        handleNotificationError(error);
      }
    }),

    markAsRead: protectedProcedure
      .input(MarkAsReadSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;
          const notification = await notificationService.markAsRead(
            input.notificationId,
            userId
          );

          return {
            data: {
              id: notification.id,
              read: notification.read,
              readAt: notification.readAt?.toISOString() || null,
            },
          };
        } catch (error) {
          handleNotificationError(error);
        }
      }),

    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const userId = ctx.session.user.id;
        const count = await notificationService.markAllAsRead(userId);
        return { data: { count } };
      } catch (error) {
        handleNotificationError(error);
      }
    }),

    delete: protectedProcedure
      .input(DeleteNotificationSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;
          await notificationService.delete(input.notificationId, userId);
          return { data: { success: true } };
        } catch (error) {
          handleNotificationError(error);
        }
      }),

    create: adminProcedure
      .input(CreateNotificationSchema)
      .mutation(async ({ input }) => {
        try {
          const result = await notificationService.create(input);
          return { data: result };
        } catch (error) {
          handleNotificationError(error);
        }
      }),
  }),
});
