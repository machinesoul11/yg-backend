/**
 * Roles tRPC Router
 * Admin-only endpoints for role management
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { RoleAssignmentService } from '@/lib/services/role-assignment.service';
import {
  assignRoleSchema,
  bulkAssignRoleSchema,
  listUsersSchema,
  getRoleHistorySchema,
  getUserRoleSchema,
} from '@/lib/schemas/role.schema';
import { getRoleDisplayName } from '@/lib/constants/roles';

// Initialize services
const auditService = new AuditService(prisma);
const roleAssignmentService = new RoleAssignmentService(prisma, auditService);

export const rolesRouter = createTRPCRouter({
  /**
   * List users with their roles
   * Supports pagination, filtering, and search
   */
  listUsers: adminProcedure
    .input(listUsersSchema)
    .query(async ({ input }) => {
      const { page, limit, roleFilter, searchQuery, sortBy, sortOrder } = input;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        deleted_at: null,
      };

      if (roleFilter) {
        where.role = roleFilter;
      }

      if (searchQuery) {
        where.OR = [
          { email: { contains: searchQuery, mode: 'insensitive' } },
          { name: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      // Fetch users
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            email_verified: true,
            createdAt: true,
            lastLoginAt: true,
            isActive: true,
          },
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        data: users.map((user) => ({
          ...user,
          roleDisplayName: getRoleDisplayName(user.role),
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  /**
   * Get detailed role information for a user
   */
  getUserRole: adminProcedure
    .input(getUserRoleSchema)
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
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
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return {
        ...user,
        roleDisplayName: getRoleDisplayName(user.role),
      };
    }),

  /**
   * Assign role to a user
   */
  assignRole: adminProcedure
    .input(assignRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session.user.id;

      const result = await roleAssignmentService.assignRole(
        input.userId,
        input.role,
        adminUserId,
        input.reason
      );

      return {
        success: result.success,
        message: `Role changed from ${getRoleDisplayName(result.previousRole)} to ${getRoleDisplayName(result.newRole)}`,
        data: result,
      };
    }),

  /**
   * Get role change history for a user
   */
  getRoleHistory: adminProcedure
    .input(getRoleHistorySchema)
    .query(async ({ input }) => {
      const history = await roleAssignmentService.getRoleHistory(input.userId, input.limit);

      return {
        data: history,
        total: history.length,
      };
    }),

  /**
   * Bulk assign role to multiple users
   */
  bulkAssignRole: adminProcedure
    .input(bulkAssignRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session.user.id;

      const result = await roleAssignmentService.bulkAssignRole(
        input.userIds,
        input.role,
        adminUserId,
        input.reason
      );

      return {
        success: result.successful.length > 0,
        message: `Successfully assigned ${getRoleDisplayName(input.role)} role to ${result.successful.length} user(s)`,
        data: result,
      };
    }),

  /**
   * Get role statistics
   * Returns count of users by role
   */
  getRoleStatistics: adminProcedure
    .query(async () => {
      const stats = await prisma.user.groupBy({
        by: ['role'],
        where: {
          deleted_at: null,
        },
        _count: {
          role: true,
        },
      });

      const formattedStats = stats.map((stat) => ({
        role: stat.role,
        roleDisplayName: getRoleDisplayName(stat.role),
        count: stat._count.role,
      }));

      const total = formattedStats.reduce((sum, stat) => sum + stat.count, 0);

      return {
        byRole: formattedStats,
        total,
      };
    }),
});
