/**
 * Admin Users Management tRPC Router
 * Admin-only endpoints for user administration
 * Implements permission-based access control and approval workflows
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { requirePermission } from '@/lib/middleware/permissions';
import { requireApprovalOrExecute, requireSenior } from '@/lib/middleware/approval.middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';
import { Department } from '@prisma/client';

// Initialize services
const auditService = new AuditService(prisma);

/**
 * Input schemas for admin user management
 */
const getUserSchema = z.object({
  userId: z.string().cuid(),
});

const updateUserProfileSchema = z.object({
  userId: z.string().cuid(),
  data: z.object({
    name: z.string().min(1).max(100).optional(),
    avatar: z.string().url().optional(),
  }),
});

const suspendUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(10).max(500),
  duration: z.number().int().positive().optional(), // Duration in days, undefined = indefinite
});

const activateUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(10).max(500).optional(),
});

const deleteUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(10).max(500),
  immediate: z.boolean().default(false), // If true, immediate deletion (Super Admin only)
});

const getUserFinancialDataSchema = z.object({
  userId: z.string().cuid(),
  includeTransactions: z.boolean().default(false),
  includePayouts: z.boolean().default(false),
  includeRoyalties: z.boolean().default(false),
});

export const adminUsersRouter = createTRPCRouter({
  /**
   * Get user details (admin view)
   * Requires users:view permission
   */
  getUser: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_VIEW))
    .input(getUserSchema)
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          email_verified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          two_factor_enabled: true,
          two_factor_verified_at: true,
          deleted_at: true,
          creator: {
            select: {
              id: true,
              verificationStatus: true,
              verifiedAt: true,
            },
          },
          brand: {
            select: {
              id: true,
              verificationStatus: true,
              verifiedAt: true,
            },
          },
          adminRoles: {
            where: {
              isActive: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
            select: {
              id: true,
              department: true,
              seniority: true,
              permissions: true,
              createdAt: true,
              expiresAt: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return {
        data: user,
      };
    }),

  /**
   * Update user profile (admin action)
   * Requires users:edit permission
   */
  updateUserProfile: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_EDIT_USER))
    .input(updateUserProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          name: true,
          avatar: true,
          email: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: input.userId },
        data: input.data,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          updatedAt: true,
        },
      });

      // Audit log
      await auditService.log({
        action: 'ADMIN_UPDATE_USER_PROFILE',
        entityType: 'user',
        entityId: input.userId,
        userId: ctx.session.user.id,
        before: {
          name: user.name,
          avatar: user.avatar,
        },
        after: input.data,
      });

      return {
        success: true,
        data: updatedUser,
      };
    }),

  /**
   * Suspend user account
   * Requires users:suspend permission and approval workflow
   * Suspensions require senior approval
   */
  suspendUser: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_SUSPEND))
    .input(suspendUserSchema)
    .use(requireApprovalOrExecute({
      actionType: PERMISSIONS.USERS_SUSPEND,
      getDepartment: () => Department.OPERATIONS,
      getDataPayload: (input: z.infer<typeof suspendUserSchema>) => ({
        userId: input.userId,
        reason: input.reason,
        duration: input.duration,
      }),
      approvalRequiredMessage: 'User suspension requires senior-level approval',
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already suspended',
        });
      }

      // Calculate suspension end date if duration provided
      const suspensionEndsAt = input.duration
        ? new Date(Date.now() + input.duration * 24 * 60 * 60 * 1000)
        : null;

      // Suspend user
      await prisma.user.update({
        where: { id: input.userId },
        data: {
          isActive: false,
          // Note: Add suspension end date field to User model if needed
        },
      });

      // Audit log
      await auditService.log({
        action: 'USER_SUSPENDED',
        entityType: 'user',
        entityId: input.userId,
        userId: ctx.session.user.id,
        after: {
          reason: input.reason,
          duration: input.duration,
          suspensionEndsAt,
          suspendedBy: ctx.session.user.email,
        },
      });

      return {
        success: true,
        message: `User ${user.email} has been suspended`,
        data: {
          userId: input.userId,
          suspendedAt: new Date(),
          suspensionEndsAt,
        },
      };
    }),

  /**
   * Activate/unsuspend user account
   * Requires users:activate permission
   */
  activateUser: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_ACTIVATE))
    .input(activateUserSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          isActive: true,
          deleted_at: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.deleted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot activate a deleted user account',
        });
      }

      if (user.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already active',
        });
      }

      // Activate user
      await prisma.user.update({
        where: { id: input.userId },
        data: {
          isActive: true,
        },
      });

      // Audit log
      await auditService.log({
        action: 'USER_ACTIVATED',
        entityType: 'user',
        entityId: input.userId,
        userId: ctx.session.user.id,
        after: {
          reason: input.reason,
          activatedBy: ctx.session.user.email,
        },
      });

      return {
        success: true,
        message: `User ${user.email} has been activated`,
        data: {
          userId: input.userId,
          activatedAt: new Date(),
        },
      };
    }),

  /**
   * Delete user account (admin action)
   * Requires users:delete permission and senior approval workflow
   * Deletions always require senior approval for safety
   */
  deleteUser: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_DELETE_USER))
    .input(deleteUserSchema)
    .use(requireApprovalOrExecute({
      actionType: PERMISSIONS.USERS_DELETE_USER,
      getDepartment: () => Department.OPERATIONS,
      getDataPayload: (input: z.infer<typeof deleteUserSchema>) => ({
        userId: input.userId,
        reason: input.reason,
        immediate: input.immediate,
      }),
      approvalRequiredMessage: 'User deletion requires senior-level approval',
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          deleted_at: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.deleted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already deleted',
        });
      }

      // Soft delete (default) or immediate delete (Super Admin only)
      if (input.immediate) {
        // Verify Super Admin access
        const isSuperAdmin = await prisma.adminRole.findFirst({
          where: {
            userId: ctx.session.user.id,
            department: 'SUPER_ADMIN',
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        });

        if (!isSuperAdmin) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Immediate deletion requires Super Admin role',
          });
        }

        // Immediate hard delete - cascade relationships
        await prisma.user.delete({
          where: { id: input.userId },
        });
      } else {
        // Soft delete with 30-day grace period
        await prisma.user.update({
          where: { id: input.userId },
          data: {
            deleted_at: new Date(),
            isActive: false,
          },
        });
      }

      // Audit log
      await auditService.log({
        action: input.immediate ? 'USER_DELETED_IMMEDIATE' : 'USER_DELETED_SOFT',
        entityType: 'user',
        entityId: input.userId,
        userId: ctx.session.user.id,
        after: {
          reason: input.reason,
          immediate: input.immediate,
          deletedBy: ctx.session.user.email,
        },
      });

      return {
        success: true,
        message: input.immediate
          ? `User ${user.email} has been permanently deleted`
          : `User ${user.email} has been deleted (30-day grace period)`,
        data: {
          userId: input.userId,
          deletedAt: new Date(),
          immediate: input.immediate,
        },
      };
    }),

  /**
   * Get user financial data (admin view)
   * Requires users:view_sensitive permission for accessing financial information
   */
  getUserFinancialData: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_VIEW_SENSITIVE_DATA))
    .input(getUserFinancialDataSchema)
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          creator: {
            select: {
              id: true,
              stripeAccountId: true,
              // Note: Royalty and payout relations may need adjustment based on actual schema
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.creator) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User does not have a creator profile',
        });
      }

      return {
        data: {
          userId: input.userId,
          email: user.email,
          creatorId: user.creator.id,
          stripeAccountId: user.creator.stripeAccountId,
          // Note: Add actual financial data queries here based on your schema
          message: 'Financial data endpoint - implement based on actual schema relationships',
        },
      };
    }),
});
