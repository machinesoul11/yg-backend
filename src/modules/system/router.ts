/**
 * System Module - tRPC Router
 * 
 * API endpoints for system infrastructure
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { NotificationType } from '@prisma/client';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { requirePermission } from '@/lib/middleware/permissions';
import { requireSenior } from '@/lib/middleware/approval.middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';
import { IdempotencyService } from './services/idempotency.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { NotificationService } from './services/notification.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
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
const notificationPreferencesService = new NotificationPreferencesService(prisma, redis);

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

    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      try {
        const userId = ctx.session.user.id;
        const preferences = await notificationPreferencesService.getPreferences(userId);
        return { data: preferences };
      } catch (error) {
        handleNotificationError(error);
      }
    }),

    updatePreferences: protectedProcedure
      .input(z.object({
        enabledTypes: z.array(z.nativeEnum(NotificationType)).optional(),
        digestFrequency: z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER']).optional(),
        emailEnabled: z.boolean().optional(),
        inAppEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;

          // Validate email enabled only if user has verified email
          if (input.emailEnabled === true) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { email_verified: true },
            });

            if (!user?.email_verified) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cannot enable email notifications without verified email address',
              });
            }
          }

          const preferences = await notificationPreferencesService.updatePreferences(userId, input);
          return { data: preferences };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          handleNotificationError(error);
        }
      }),

    poll: protectedProcedure
      .input(z.object({
        lastSeen: z.string().datetime().optional(),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const userId = ctx.session.user.id;

          // Determine query timestamp
          let queryAfter: Date;

          if (input.lastSeen) {
            queryAfter = new Date(input.lastSeen);

            // Validate timestamp is not in future
            const now = new Date();
            if (queryAfter > now) {
              queryAfter = now;
            }

            // Limit how far back we query (24 hours max)
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            if (queryAfter < oneDayAgo) {
              queryAfter = oneDayAgo;
            }
          } else {
            // No timestamp provided - return recent notifications (last hour)
            queryAfter = new Date(Date.now() - 60 * 60 * 1000);
          }

          // Check cache for "no new notifications"
          const cacheKey = `notifications:poll:empty:${userId}`;
          if (input.lastSeen) {
            const cached = await redis.get(cacheKey);
            if (cached === 'true') {
              const unreadCount = await notificationService.getUnreadCount(userId);
              return {
                data: {
                  notifications: [],
                  newCount: 0,
                  unreadCount,
                  lastSeen: new Date().toISOString(),
                  suggestedPollInterval: 10,
                },
              };
            }
          }

          // Query for new notifications
          const notifications = await prisma.notification.findMany({
            where: {
              userId,
              createdAt: { gt: queryAfter },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });

          // Get unread count
          const unreadCount = await notificationService.getUnreadCount(userId);

          // If no new notifications, cache this result
          if (notifications.length === 0 && input.lastSeen) {
            await redis.set(cacheKey, 'true', 'EX', 5);
          }

          return {
            data: {
              notifications: notifications.map((n) => ({
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
              newCount: notifications.length,
              unreadCount,
              lastSeen: new Date().toISOString(),
              suggestedPollInterval: 10, // seconds
            },
          };
        } catch (error) {
          handleNotificationError(error);
        }
      }),
  }),

  // ===========================
  // System Administration
  // ===========================

  /**
   * Get system configuration
   * Requires system:settings permission
   * Super Admin or Operations role required
   */
  getSystemConfig: adminProcedure
    .use(requirePermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE))
    .query(async () => {
      try {
        // Return system configuration
        // This could be extended to read from a config table or environment
        return {
          data: {
            appVersion: process.env.APP_VERSION || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            maintenance: {
              enabled: false,
              message: null,
            },
            features: {
              registrationOpen: true,
              creatorApplicationsOpen: true,
              brandApplicationsOpen: true,
            },
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch system configuration',
        });
      }
    }),

  /**
   * Update system configuration
   * Requires system:settings permission and senior-level access
   * Super Admin or Operations role required
   */
  updateSystemConfig: adminProcedure
    .use(requirePermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE))
    .use(requireSenior('System configuration changes require senior-level authorization'))
    .input(z.object({
      maintenance: z.object({
        enabled: z.boolean(),
        message: z.string().optional(),
      }).optional(),
      features: z.object({
        registrationOpen: z.boolean().optional(),
        creatorApplicationsOpen: z.boolean().optional(),
        brandApplicationsOpen: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Store configuration in Redis or database
        // For now, we'll use Redis
        if (input.maintenance) {
          await redis.set(
            'system:config:maintenance',
            JSON.stringify(input.maintenance),
            'EX',
            60 * 60 * 24 * 365 // 1 year
          );
        }

        if (input.features) {
          await redis.set(
            'system:config:features',
            JSON.stringify(input.features),
            'EX',
            60 * 60 * 24 * 365 // 1 year
          );
        }

        return {
          success: true,
          message: 'System configuration updated successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update system configuration',
        });
      }
    }),

  /**
   * Trigger deployment (placeholder)
   * Requires system:deploy permission and senior-level access
   * Super Admin or Operations role required
   */
  triggerDeployment: adminProcedure
    .use(requirePermission(PERMISSIONS.SYSTEM_DEPLOY))
    .use(requireSenior('Deployment actions require senior-level authorization'))
    .input(z.object({
      environment: z.enum(['staging', 'production']),
      version: z.string().optional(),
      rollback: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      try {
        // This is a placeholder for deployment triggering
        // In a real implementation, this would:
        // 1. Trigger a CI/CD pipeline
        // 2. Create a deployment record
        // 3. Send notifications to team
        
        return {
          success: true,
          message: `Deployment to ${input.environment} ${input.rollback ? 'rollback' : 'initiated'}`,
          data: {
            environment: input.environment,
            version: input.version || 'latest',
            rollback: input.rollback,
            triggeredAt: new Date(),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to trigger deployment',
        });
      }
    }),

  /**
   * Clear system cache
   * Requires system:settings permission
   * Super Admin or Operations role required
   */
  clearCache: adminProcedure
    .use(requirePermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE))
    .input(z.object({
      pattern: z.string().optional(), // Redis key pattern, e.g., "user:*"
      full: z.boolean().default(false), // Clear entire Redis cache
    }))
    .mutation(async ({ input }) => {
      try {
        if (input.full) {
          await redis.flushdb();
          return {
            success: true,
            message: 'Full cache cleared successfully',
            keysCleared: 'all',
          };
        }

        if (input.pattern) {
          const keys = await redis.keys(input.pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
          }
          return {
            success: true,
            message: `Cache cleared for pattern: ${input.pattern}`,
            keysCleared: keys.length,
          };
        }

        return {
          success: false,
          message: 'No pattern specified',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to clear cache',
        });
      }
    }),
});
