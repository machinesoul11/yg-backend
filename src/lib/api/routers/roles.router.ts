/**
 * Roles tRPC Router
 * Admin-only endpoints for role management
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, adminProcedure, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { RoleAssignmentService } from '@/lib/services/role-assignment.service';
import { AdminRoleService } from '@/lib/services/admin-role.service';
import { requirePermission } from '@/lib/middleware/permissions';
import { requireSenior, requireApprovalOrExecute } from '@/lib/middleware/approval.middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';
import {
  assignRoleSchema,
  bulkAssignRoleSchema,
  listUsersSchema,
  getRoleHistorySchema,
  getUserRoleSchema,
} from '@/lib/schemas/role.schema';
import {
  createAdminRoleSchema,
  listAdminRolesSchema,
  getUserAdminRolesSchema,
  updateAdminRoleSchema,
  revokeAdminRoleSchema,
  createContractorRoleSchema,
} from '@/lib/schemas/admin-role.schema';
import { getRoleDisplayName } from '@/lib/constants/roles';

// Initialize services
const auditService = new AuditService(prisma);
const roleAssignmentService = new RoleAssignmentService(prisma, auditService);
const adminRoleService = new AdminRoleService(prisma, auditService);

export const rolesRouter = createTRPCRouter({
  /**
   * List users with their roles
   * Supports pagination, filtering, and search
   * Requires users:view permission
   */
  listUsers: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_VIEW))
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
   * Requires users:view permission
   */
  getUserRole: adminProcedure
    .use(requirePermission(PERMISSIONS.USERS_VIEW))
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

  // ===================================
  // Admin Role Management Endpoints
  // ===================================

  /**
   * Create/Assign a new admin role
   * Requires admin:roles permission (Super Admin only)
   */
  createAdminRole: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(createAdminRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const createdBy = ctx.session.user.id;

      // Validate user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Create the admin role using the service
      const adminRole = await adminRoleService.createAdminRole(input, createdBy);

      return {
        success: true,
        message: `Admin role assigned successfully to ${targetUser.email}`,
        data: adminRole,
      };
    }),

  /**
   * List all admin roles
   * Requires admin:roles permission
   * Supports pagination and filtering
   */
  listAdminRoles: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(listAdminRolesSchema)
    .query(async ({ input }) => {
      return await adminRoleService.listAdminRoles(input);
    }),

  /**
   * Get admin roles for a specific user
   * Requires admin:roles permission
   */
  getUserAdminRoles: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(getUserAdminRolesSchema)
    .query(async ({ input }) => {
      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const roles = await adminRoleService.getUserAdminRoles(input);

      return {
        userId: input.userId,
        roles,
        totalRoles: roles.length,
      };
    }),

  /**
   * Update admin role permissions
   * Requires admin:roles permission
   */
  updateAdminRole: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(updateAdminRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const updatedBy = ctx.session.user.id;

      // Prevent admins from modifying their own permissions (security measure)
      const existingRole = await prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { userId: true },
      });

      if (existingRole && existingRole.userId === updatedBy) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot modify your own admin role permissions',
        });
      }

      const updatedRole = await adminRoleService.updateAdminRole(input, updatedBy);

      return {
        success: true,
        message: 'Admin role updated successfully',
        data: updatedRole,
      };
    }),

  /**
   * Revoke/Delete an admin role
   * Requires admin:roles permission
   */
  revokeAdminRole: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(revokeAdminRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const revokedBy = ctx.session.user.id;

      // Get the role to check who it belongs to
      const role = await prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { 
          userId: true, 
          department: true,
        },
      });

      if (!role) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Admin role not found',
        });
      }

      // Prevent admins from revoking their own role
      if (role.userId === revokedBy) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot revoke your own admin role',
        });
      }

      // Prevent revoking the last Super Admin
      if (role.department === 'SUPER_ADMIN') {
        const superAdminCount = await prisma.adminRole.count({
          where: {
            department: 'SUPER_ADMIN',
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        });

        if (superAdminCount <= 1) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot revoke the last Super Admin role. At least one Super Admin must remain.',
          });
        }
      }

      // Get user info for response message
      const user = await prisma.user.findUnique({
        where: { id: role.userId },
        select: { email: true, name: true },
      });

      await adminRoleService.revokeAdminRole(input, revokedBy);

      return {
        success: true,
        message: `Admin role revoked successfully${user ? ` for ${user.email || user.name}` : ''}`,
      };
    }),

  // ===================================
  // Contractor Role Management
  // ===================================

  /**
   * Create a time-limited contractor role
   * Requires admin:roles permission (Super Admin only)
   * Enforces minimal permissions and expiration requirements
   */
  createContractorRole: protectedProcedure
    .use(requirePermission(PERMISSIONS.ADMIN_ROLES))
    .input(createContractorRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const createdBy = ctx.session.user.id;

      // Validate user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Create the contractor role
      const contractorRole = await adminRoleService.createContractorRole(input, createdBy);

      return {
        success: true,
        message: `Contractor role created successfully for ${targetUser.email}. Access expires ${input.expiresAt.toLocaleDateString()}.`,
        data: contractorRole,
      };
    }),
});
