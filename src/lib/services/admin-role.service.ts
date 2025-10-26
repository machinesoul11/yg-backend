/**
 * Admin Role Service
 * Handles admin role assignment, management, and permission aggregation
 * Integrates with existing PermissionService for comprehensive access control
 */

import { PrismaClient, Department, Seniority } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { redis } from '@/lib/redis';
import { AuditService } from './audit.service';
import { Permission } from '@/lib/constants/permissions';
import type {
  CreateAdminRoleInput,
  UpdateAdminRoleInput,
  RevokeAdminRoleInput,
  GetAdminRoleInput,
  ListAdminRolesInput,
  GetUserAdminRolesInput,
  ExtendContractorRoleInput,
  ConvertContractorToPermanentInput,
  BulkUpdateAdminRolesInput,
  GetExpiringRolesInput,
  GetAdminRoleStatsInput,
  CheckUserPermissionInput,
  GetPermissionUsageInput,
} from '@/lib/schemas/admin-role.schema';

/**
 * Admin Role with user information
 */
export interface AdminRoleWithUser {
  id: string;
  userId: string;
  department: Department;
  seniority: Seniority;
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  expiresAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  creator: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * Admin Role Statistics
 */
export interface AdminRoleStats {
  totalRoles: number;
  activeRoles: number;
  inactiveRoles: number;
  byDepartment: Record<Department, number>;
  bySeniority: Record<Seniority, number>;
  expiringIn30Days: number;
  expiringIn7Days: number;
  contractorRoles: number;
}

export class AdminRoleService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'admin_roles:user:';
  private readonly PERMISSIONS_CACHE_PREFIX = 'admin_roles:permissions:';

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Create a new admin role
   * @param input - Admin role creation data
   * @param createdBy - ID of the user creating the role
   * @returns Created admin role
   */
  async createAdminRole(
    input: CreateAdminRoleInput,
    createdBy: string
  ): Promise<AdminRoleWithUser> {
    try {
      // Check if user already has this department role
      const existingRole = await this.prisma.adminRole.findUnique({
        where: {
          userId_department: {
            userId: input.userId,
            department: input.department,
          },
        },
      });

      if (existingRole) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `User already has a role in the ${input.department} department`,
        });
      }

      // Create the admin role
      const adminRole = await this.prisma.adminRole.create({
        data: {
          userId: input.userId,
          department: input.department,
          seniority: input.seniority,
          permissions: input.permissions,
          isActive: input.isActive,
          expiresAt: input.expiresAt,
          createdBy,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(input.userId);

      // Log the action
      await this.auditService.log({
        action: 'ADMIN_ROLE_CREATED',
        entityType: 'admin_role',
        entityId: adminRole.id,
        userId: createdBy,
        after: {
          userId: input.userId,
          department: input.department,
          seniority: input.seniority,
          permissions: input.permissions,
          expiresAt: input.expiresAt,
        },
      });

      return this.formatAdminRole(adminRole);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('Error creating admin role:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create admin role',
      });
    }
  }

  /**
   * Update an existing admin role
   * ENHANCED: Implements comprehensive validation against role templates,
   * prevents critical permission removal, and prevents last Super Admin modification
   * @param input - Admin role update data
   * @param updatedBy - ID of the user updating the role
   * @returns Updated admin role
   */
  async updateAdminRole(
    input: UpdateAdminRoleInput,
    updatedBy: string
  ): Promise<AdminRoleWithUser> {
    try {
      // Get existing role
      const existingRole = await this.prisma.adminRole.findUnique({
        where: { id: input.roleId },
      });

      if (!existingRole) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Admin role not found',
        });
      }

      // PROTECTION: Prevent modifying last Super Admin
      if (existingRole.department === 'SUPER_ADMIN') {
        await this.validateNotLastSuperAdmin(existingRole.id, 'modify');
      }

      // VALIDATION: If permissions are being updated, validate against role template
      if (input.permissions) {
        await this.validatePermissionsAgainstTemplate(
          existingRole.department,
          existingRole.seniority,
          input.permissions
        );

        // VALIDATION: Prevent removal of critical permissions
        const currentPermissions = existingRole.permissions as string[];
        await this.validateCriticalPermissions(
          existingRole.department,
          currentPermissions,
          input.permissions
        );
      }

      // Update the role
      const updatedRole = await this.prisma.adminRole.update({
        where: { id: input.roleId },
        data: {
          seniority: input.seniority,
          permissions: input.permissions,
          isActive: input.isActive,
          expiresAt: input.expiresAt,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // CACHE INVALIDATION: Invalidate all permission caches
      await this.invalidateUserCache(updatedRole.userId);

      // AUDIT LOG: Create comprehensive audit trail
      await this.createUpdateAuditLog(
        input.roleId,
        updatedBy,
        existingRole,
        updatedRole
      );

      return this.formatAdminRole(updatedRole);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('Error updating admin role:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update admin role',
      });
    }
  }

  /**
   * Revoke (soft-delete) an admin role
   * ENHANCED: Implements soft-delete pattern, prevents last Super Admin revocation,
   * invalidates all user permission caches, and optionally terminates active sessions
   * @param input - Role revocation data
   * @param revokedBy - ID of the user revoking the role
   * @param options - Optional configuration for revocation behavior
   */
  async revokeAdminRole(
    input: RevokeAdminRoleInput,
    revokedBy: string,
    options?: { terminateSessions?: boolean }
  ): Promise<void> {
    try {
      const role = await this.prisma.adminRole.findUnique({
        where: { id: input.roleId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!role) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Admin role not found',
        });
      }

      // Check if already deleted (using raw query until Prisma regenerates)
      const checkDeleted = await this.prisma.$queryRaw<Array<{ deleted_at: Date | null }>>`
        SELECT deleted_at FROM admin_roles WHERE id = ${input.roleId}
      `;
      
      if (checkDeleted[0]?.deleted_at) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Admin role has already been revoked',
        });
      }

      // PROTECTION: Prevent revoking last Super Admin
      if (role.department === 'SUPER_ADMIN') {
        await this.validateNotLastSuperAdmin(input.roleId, 'revoke');
      }

      // SOFT DELETE: Archive role data instead of hard delete (using raw query until Prisma regenerates)
      await this.prisma.$executeRaw`
        UPDATE admin_roles 
        SET 
          deleted_at = NOW(),
          deleted_by = ${revokedBy},
          deletion_reason = ${input.reason || null},
          is_active = false
        WHERE id = ${input.roleId}
      `;

      // CACHE INVALIDATION: Invalidate all user's permission caches
      await this.invalidateAllUserPermissionCaches(role.userId);

      // OPTIONAL: Terminate active sessions
      if (options?.terminateSessions) {
        await this.terminateUserSessions(role.userId, role.id, revokedBy);
      }

      // AUDIT LOG: Create comprehensive audit trail
      await this.createRevocationAuditLog(
        input.roleId,
        revokedBy,
        role,
        input.reason,
        options?.terminateSessions || false
      );
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('Error revoking admin role:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke admin role',
      });
    }
  }

  /**
   * Get a specific admin role by ID
   * @param input - Role ID
   * @returns Admin role
   */
  async getAdminRole(input: GetAdminRoleInput): Promise<AdminRoleWithUser> {
    const role = await this.prisma.adminRole.findUnique({
      where: { id: input.roleId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!role) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin role not found',
      });
    }

    return this.formatAdminRole(role);
  }

  /**
   * List admin roles with pagination and filtering
   * @param input - List parameters
   * @returns Paginated admin roles
   */
  async listAdminRoles(input: ListAdminRolesInput) {
    const { page, limit, userId, department, seniority, isActive, includeExpired, sortBy, sortOrder } =
      input;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      deletedAt: null, // Exclude soft-deleted roles by default
    };
    if (userId) where.userId = userId;
    if (department) where.department = department;
    if (seniority) where.seniority = seniority;
    if (isActive !== undefined) where.isActive = isActive;
    if (!includeExpired) {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

    // Execute query
    const [roles, total] = await Promise.all([
      this.prisma.adminRole.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.adminRole.count({ where }),
    ]);

    return {
      roles: roles.map((role) => this.formatAdminRole(role)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all admin roles for a specific user
   * @param input - User ID and filters
   * @returns User's admin roles
   */
  async getUserAdminRoles(input: GetUserAdminRolesInput): Promise<AdminRoleWithUser[]> {
    const { userId, includeInactive, includeExpired } = input;

    const where: any = { 
      userId,
      deletedAt: null, // Exclude soft-deleted roles
    };

    if (!includeInactive) {
      where.isActive = true;
    }

    if (!includeExpired) {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

    const roles = await this.prisma.adminRole.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return roles.map((role) => this.formatAdminRole(role));
  }

  /**
   * Get aggregated permissions for a user across all their active admin roles
   * @param userId - User ID
   * @returns Array of unique permissions
   */
  async getUserAggregatedPermissions(userId: string): Promise<string[]> {
    try {
      // Check cache first
      const cached = await this.getCachedPermissions(userId);
      if (cached) return cached;

      // Get all active, non-expired, non-deleted roles
      const roles = await this.prisma.adminRole.findMany({
        where: {
          userId,
          isActive: true,
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          permissions: true,
          department: true,
        },
      });

      // Aggregate permissions
      const permissionSet = new Set<string>();
      for (const role of roles) {
        const permissions = role.permissions as string[];
        
        // Super admins implicitly have all permissions
        if (role.department === 'SUPER_ADMIN') {
          return ['*:*']; // Wildcard permission
        }

        permissions.forEach((perm) => permissionSet.add(perm));
      }

      const aggregatedPermissions = Array.from(permissionSet);

      // Cache the result
      await this.cachePermissions(userId, aggregatedPermissions);

      return aggregatedPermissions;
    } catch (error) {
      console.error('Error getting aggregated permissions:', error);
      return [];
    }
  }

  /**
   * Check if a user has a specific permission through their admin roles
   * @param userId - User ID
   * @param permission - Permission to check
   * @returns True if user has the permission
   */
  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserAggregatedPermissions(userId);
    
    // Check for wildcard (super admin)
    if (permissions.includes('*:*')) return true;

    // Check for exact match
    if (permissions.includes(permission)) return true;

    // Check for namespace wildcard (e.g., "users:*")
    const [namespace] = permission.split(':');
    if (permissions.includes(`${namespace}:*`)) return true;

    return false;
  }

  /**
   * Create a time-limited contractor role with validation
   * CONTRACTOR MANAGEMENT: Enforces minimal permissions and requires expiration
   * @param input - Contractor role creation data
   * @param createdBy - ID of the user creating the role
   * @returns Created contractor admin role
   */
  async createContractorRole(
    input: any, // Will be CreateContractorRoleInput
    createdBy: string
  ): Promise<AdminRoleWithUser> {
    try {
      // Check if user already has a contractor role
      const existingRole = await this.prisma.adminRole.findUnique({
        where: {
          userId_department: {
            userId: input.userId,
            department: 'CONTRACTOR',
          },
        },
      });

      if (existingRole) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already has a contractor role. Please revoke the existing role before creating a new one.',
        });
      }

      // VALIDATION: Ensure contractor has minimal permissions only
      await this.validateContractorPermissions(input.permissions);

      // Create the contractor role
      const contractorRole = await this.prisma.adminRole.create({
        data: {
          userId: input.userId,
          department: 'CONTRACTOR',
          seniority: input.seniority || 'JUNIOR',
          permissions: input.permissions,
          isActive: true,
          expiresAt: input.expiresAt,
          createdBy,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(input.userId);

      // Schedule expiration warning job
      await this.scheduleContractorExpirationWarnings(
        contractorRole.id,
        input.userId,
        input.expiresAt
      );

      // Log the action
      await this.auditService.log({
        action: 'CONTRACTOR_ROLE_CREATED',
        entityType: 'admin_role',
        entityId: contractorRole.id,
        userId: createdBy,
        after: {
          userId: input.userId,
          department: 'CONTRACTOR',
          seniority: input.seniority,
          permissions: input.permissions,
          expiresAt: input.expiresAt,
          reason: input.reason,
          projectDescription: input.projectDescription,
          sponsoringEmployee: input.sponsoringEmployee,
        },
      });

      return this.formatAdminRole(contractorRole);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('Error creating contractor role:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create contractor role',
      });
    }
  }

  /**
   * Extend the expiration date of a contractor role
   * @param input - Extension data
   * @param extendedBy - ID of the user extending the role
   * @returns Updated role
   */
  async extendContractorRole(
    input: ExtendContractorRoleInput,
    extendedBy: string
  ): Promise<AdminRoleWithUser> {
    const role = await this.prisma.adminRole.findUnique({
      where: { id: input.roleId },
    });

    if (!role) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin role not found',
      });
    }

    if (role.department !== 'CONTRACTOR') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only contractor roles can be extended',
      });
    }

    const updatedRole = await this.prisma.adminRole.update({
      where: { id: input.roleId },
      data: {
        expiresAt: input.newExpirationDate,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateUserCache(role.userId);

    // Log the action
    await this.auditService.log({
      action: 'CONTRACTOR_ROLE_EXTENDED',
      entityType: 'admin_role',
      entityId: input.roleId,
      userId: extendedBy,
      before: { expiresAt: role.expiresAt },
      after: { expiresAt: input.newExpirationDate, reason: input.reason },
    });

    return this.formatAdminRole(updatedRole);
  }

  /**
   * Convert a contractor role to a permanent role
   * @param input - Conversion data
   * @param convertedBy - ID of the user performing the conversion
   * @returns Updated role
   */
  async convertContractorToPermanent(
    input: ConvertContractorToPermanentInput,
    convertedBy: string
  ): Promise<AdminRoleWithUser> {
    const role = await this.prisma.adminRole.findUnique({
      where: { id: input.roleId },
    });

    if (!role) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin role not found',
      });
    }

    if (role.department !== 'CONTRACTOR') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only contractor roles can be converted',
      });
    }

    // Check if user already has the new department role
    const existingRole = await this.prisma.adminRole.findUnique({
      where: {
        userId_department: {
          userId: role.userId,
          department: input.newDepartment,
        },
      },
    });

    if (existingRole) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `User already has a role in the ${input.newDepartment} department`,
      });
    }

    const updatedRole = await this.prisma.adminRole.update({
      where: { id: input.roleId },
      data: {
        department: input.newDepartment,
        expiresAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateUserCache(role.userId);

    // Log the action
    await this.auditService.log({
      action: 'CONTRACTOR_CONVERTED_TO_PERMANENT',
      entityType: 'admin_role',
      entityId: input.roleId,
      userId: convertedBy,
      before: { department: role.department, expiresAt: role.expiresAt },
      after: { department: input.newDepartment, reason: input.reason },
    });

    return this.formatAdminRole(updatedRole);
  }

  /**
   * Get roles expiring within a specified number of days
   * @param input - Expiring roles query
   * @returns Roles expiring soon
   */
  async getExpiringRoles(input: GetExpiringRolesInput): Promise<AdminRoleWithUser[]> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + input.daysUntilExpiration);

    const roles = await this.prisma.adminRole.findMany({
      where: {
        expiresAt: {
          lte: expirationDate,
          gte: new Date(),
        },
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { expiresAt: 'asc' },
    });

    return roles.map((role) => this.formatAdminRole(role));
  }

  /**
   * Get statistics about admin roles
   * @param input - Statistics query parameters
   * @returns Admin role statistics
   */
  async getAdminRoleStats(input: GetAdminRoleStatsInput): Promise<AdminRoleStats> {
    const where: any = {};
    if (input.department) where.department = input.department;
    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) where.createdAt.gte = input.startDate;
      if (input.endDate) where.createdAt.lte = input.endDate;
    }

    const [total, active, inactive, byDepartment, bySeniority, expiring30, expiring7, contractors] =
      await Promise.all([
        this.prisma.adminRole.count({ where }),
        this.prisma.adminRole.count({ where: { ...where, isActive: true } }),
        this.prisma.adminRole.count({ where: { ...where, isActive: false } }),
        this.prisma.adminRole.groupBy({
          by: ['department'],
          where,
          _count: true,
        }),
        this.prisma.adminRole.groupBy({
          by: ['seniority'],
          where,
          _count: true,
        }),
        this.prisma.adminRole.count({
          where: {
            ...where,
            expiresAt: {
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              gte: new Date(),
            },
            isActive: true,
          },
        }),
        this.prisma.adminRole.count({
          where: {
            ...where,
            expiresAt: {
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              gte: new Date(),
            },
            isActive: true,
          },
        }),
        this.prisma.adminRole.count({ where: { ...where, department: 'CONTRACTOR' } }),
      ]);

    const departmentCounts = byDepartment.reduce(
      (acc, item) => {
        acc[item.department] = item._count;
        return acc;
      },
      {} as Record<Department, number>
    );

    const seniorityCounts = bySeniority.reduce(
      (acc, item) => {
        acc[item.seniority] = item._count;
        return acc;
      },
      {} as Record<Seniority, number>
    );

    return {
      totalRoles: total,
      activeRoles: active,
      inactiveRoles: inactive,
      byDepartment: departmentCounts,
      bySeniority: seniorityCounts,
      expiringIn30Days: expiring30,
      expiringIn7Days: expiring7,
      contractorRoles: contractors,
    };
  }

  /**
   * Bulk update admin roles
   * @param input - Bulk update data
   * @param updatedBy - ID of the user performing the update
   */
  async bulkUpdateAdminRoles(
    input: BulkUpdateAdminRolesInput,
    updatedBy: string
  ): Promise<number> {
    try {
      const result = await this.prisma.adminRole.updateMany({
        where: {
          id: { in: input.roleIds },
        },
        data: {
          ...input.updates,
        },
      });

      // Invalidate cache for all affected users
      const roles = await this.prisma.adminRole.findMany({
        where: { id: { in: input.roleIds } },
        select: { userId: true },
      });

      await Promise.all(roles.map((role) => this.invalidateUserCache(role.userId)));

      // Log the action
      await this.auditService.log({
        action: 'ADMIN_ROLES_BULK_UPDATED',
        entityType: 'admin_role',
        entityId: 'bulk',
        userId: updatedBy,
        after: {
          roleIds: input.roleIds,
          updates: input.updates,
          reason: input.reason,
          count: result.count,
        },
      });

      return result.count;
    } catch (error) {
      console.error('Error bulk updating admin roles:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to bulk update admin roles',
      });
    }
  }

  /**
   * Get usage of a specific permission across all admin roles
   * @param input - Permission usage query
   * @returns Roles that have the permission
   */
  async getPermissionUsage(input: GetPermissionUsageInput): Promise<AdminRoleWithUser[]> {
    const where: any = {
      permissions: {
        array_contains: [input.permission],
      },
    };

    if (!input.includeInactive) {
      where.isActive = true;
    }

    const roles = await this.prisma.adminRole.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return roles.map((role) => this.formatAdminRole(role));
  }

  /**
   * Format admin role for response
   * @private
   */
  private formatAdminRole(role: any): AdminRoleWithUser {
    return {
      ...role,
      permissions: role.permissions as string[],
    };
  }

  /**
   * VALIDATION: Ensure we're not modifying the last Super Admin
   * @private
   */
  private async validateNotLastSuperAdmin(
    currentRoleId: string,
    action: 'modify' | 'revoke'
  ): Promise<void> {
    const superAdminCount = await this.prisma.adminRole.count({
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
        message: `Cannot ${action} the last Super Admin role. At least one Super Admin must remain active in the system for security and operational continuity.`,
      });
    }
  }

  /**
   * VALIDATION: Validate permissions against role template
   * @private
   */
  private async validatePermissionsAgainstTemplate(
    department: Department,
    seniority: Seniority,
    newPermissions: string[]
  ): Promise<void> {
    const { getRoleTemplate, isPermissionAllowed } = await import('@/permissions/roleTemplates');
    
    const template = getRoleTemplate(department, seniority);
    if (!template) {
      // If no template exists, allow any permissions (backward compatibility)
      return;
    }

    const invalidPermissions: string[] = [];
    for (const permission of newPermissions) {
      if (!isPermissionAllowed(department, seniority, permission)) {
        invalidPermissions.push(permission);
      }
    }

    if (invalidPermissions.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The following permissions are not allowed for ${seniority} ${department} role: ${invalidPermissions.join(', ')}. Please refer to the role template for allowed permissions.`,
      });
    }
  }

  /**
   * VALIDATION: Prevent removal of critical permissions
   * @private
   */
  private async validateCriticalPermissions(
    department: Department,
    currentPermissions: string[],
    newPermissions: string[]
  ): Promise<void> {
    // Define critical permissions by department
    const criticalPermissionsByDepartment: Record<string, string[]> = {
      SUPER_ADMIN: [
        'users:manage_roles',
        'admin_roles:*',
        'system:settings',
      ],
      CONTENT_MANAGER: [
        'content:read',
        'content:edit',
      ],
      FINANCE_LICENSING: [
        'finance:view_all',
        'licensing:view_all',
      ],
      CREATOR_APPLICATIONS: [
        'applications:view_all',
        'creator:review',
      ],
      BRAND_APPLICATIONS: [
        'applications:view_all',
        'brand:review',
      ],
    };

    const criticalPermissions = criticalPermissionsByDepartment[department] || [];
    const removedPermissions = currentPermissions.filter(p => !newPermissions.includes(p));
    const removedCriticalPermissions = removedPermissions.filter(p => 
      criticalPermissions.some(cp => p === cp || p.startsWith(cp.replace('*', '')))
    );

    if (removedCriticalPermissions.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot remove critical permissions for ${department} role: ${removedCriticalPermissions.join(', ')}. These permissions are essential for the role's intended function.`,
      });
    }
  }

  /**
   * Create comprehensive audit log for role update
   * @private
   */
  private async createUpdateAuditLog(
    roleId: string,
    updatedBy: string,
    before: any,
    after: any
  ): Promise<void> {
    // Calculate permission diff
    const beforePermissions = (before.permissions as string[]) || [];
    const afterPermissions = (after.permissions as string[]) || [];
    
    const addedPermissions = afterPermissions.filter(p => !beforePermissions.includes(p));
    const removedPermissions = beforePermissions.filter(p => !afterPermissions.includes(p));

    await this.auditService.log({
      action: 'ADMIN_ROLE_UPDATED',
      entityType: 'admin_role',
      entityId: roleId,
      userId: updatedBy,
      before: {
        seniority: before.seniority,
        permissions: beforePermissions,
        isActive: before.isActive,
        expiresAt: before.expiresAt,
      },
      after: {
        seniority: after.seniority,
        permissions: afterPermissions,
        isActive: after.isActive,
        expiresAt: after.expiresAt,
      },
      metadata: {
        permissionChanges: {
          added: addedPermissions,
          removed: removedPermissions,
        },
        affectedUserId: after.userId,
        department: after.department,
      },
    });
  }

  /**
   * Invalidate all permission caches for affected users
   * @private
   */
  private async invalidateAllUserPermissionCaches(userId: string): Promise<void> {
    try {
      // Invalidate user's own caches
      await this.invalidateUserCache(userId);

      // Find all users with this role (in case of shared roles or group assignments)
      // For now, we're just invalidating the specific user
      // Future enhancement: could invalidate caches for users in same permission group
      
      console.log(`[AdminRoleService] Invalidated permission caches for user ${userId}`);
    } catch (error) {
      console.error('Error invalidating permission caches:', error);
      // Don't throw - cache invalidation failure shouldn't block the operation
    }
  }

  /**
   * Terminate active sessions for a user
   * @private
   */
  private async terminateUserSessions(
    userId: string,
    roleId: string,
    terminatedBy: string
  ): Promise<number> {
    try {
      const { SessionManagementService } = await import('@/lib/services/session-management.service');
      const sessionService = new SessionManagementService(this.prisma);

      const terminatedCount = await sessionService.revokeAllUserSessions(
        userId,
        `Admin role ${roleId} revoked by administrator`
      );

      console.log(`[AdminRoleService] Terminated ${terminatedCount} sessions for user ${userId}`);
      
      // Log session termination
      await this.auditService.log({
        action: 'USER_SESSIONS_TERMINATED',
        entityType: 'session',
        entityId: userId,
        userId: terminatedBy,
        metadata: {
          reason: 'admin_role_revocation',
          roleId,
          sessionCount: terminatedCount,
        },
      });

      return terminatedCount;
    } catch (error) {
      console.error('Error terminating user sessions:', error);
      // Don't throw - session termination failure shouldn't block the revocation
      return 0;
    }
  }

  /**
   * Create comprehensive audit log for role revocation
   * @private
   */
  private async createRevocationAuditLog(
    roleId: string,
    revokedBy: string,
    role: any,
    reason: string | undefined,
    sessionsTerminated: boolean
  ): Promise<void> {
    await this.auditService.log({
      action: 'ADMIN_ROLE_REVOKED',
      entityType: 'admin_role',
      entityId: roleId,
      userId: revokedBy,
      before: {
        userId: role.userId,
        userEmail: role.user?.email,
        department: role.department,
        seniority: role.seniority,
        permissions: role.permissions as string[],
        isActive: role.isActive,
        expiresAt: role.expiresAt,
      },
      after: {
        deletedAt: new Date(),
        deletedBy: revokedBy,
        reason: reason || 'No reason provided',
        sessionsTerminated,
      },
      metadata: {
        revocationMethod: 'soft_delete',
        affectedUser: {
          id: role.userId,
          email: role.user?.email,
          name: role.user?.name,
        },
        permissionCount: (role.permissions as string[]).length,
      },
    });
  }

  /**
   * CONTRACTOR VALIDATION: Validate contractor permissions against whitelist
   * @private
   */
  private async validateContractorPermissions(permissions: string[]): Promise<void> {
    // Define allowed contractor permissions (minimal access)
    const allowedContractorPermissions = [
      // Content - Read only
      'content:read',
      'content:create', // Can create but not approve
      
      // Projects - Limited
      'projects:view_own',
      'projects:create',
      'projects:edit_own',
      
      // Analytics - Own only
      'analytics:view_own',
      
      // Basic viewing
      'creators:view_public',
      'brands:view_public',
      'ip_assets:view_public',
    ];

    // Explicitly prohibited permissions for contractors
    const prohibitedPermissions = [
      'users:manage_roles',
      'users:delete',
      'users:impersonate',
      'admin_roles:*',
      'system:*',
      'finance:*',
      'payouts:*',
      'royalties:*',
      'licenses:approve',
      'licenses:terminate_all',
      'content:approve',
      'content:delete',
      'creators:approve',
      'brands:verify',
      'applications:approve',
    ];

    // Check for prohibited permissions
    const foundProhibited = permissions.filter(p => 
      prohibitedPermissions.some(prohibited => 
        p === prohibited || p.startsWith(prohibited.replace('*', ''))
      )
    );

    if (foundProhibited.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Contractor roles cannot have the following permissions: ${foundProhibited.join(', ')}. Contractors are prohibited from administrative, financial, and approval-related operations.`,
      });
    }

    // Check that all permissions are in the allowed list
    const invalidPermissions = permissions.filter(
      p => !allowedContractorPermissions.includes(p)
    );

    if (invalidPermissions.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The following permissions are not allowed for contractor roles: ${invalidPermissions.join(', ')}. Please use only minimal, read-focused permissions.`,
      });
    }
  }

  /**
   * Schedule expiration warning jobs for contractor role
   * @private
   */
  private async scheduleContractorExpirationWarnings(
    roleId: string,
    userId: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const { queueContractorExpirationWarning } = await import('@/jobs/contractor-role-expiration.job');
      
      // Calculate warning dates
      const expirationTime = expiresAt.getTime();
      const sevenDaysBefore = new Date(expirationTime - 7 * 24 * 60 * 60 * 1000);
      const oneDayBefore = new Date(expirationTime - 24 * 60 * 60 * 1000);

      // Only schedule warnings if they're in the future
      if (sevenDaysBefore > new Date()) {
        await queueContractorExpirationWarning({
          roleId,
          userId,
          expiresAt,
          warningType: '7_days',
        });
      }

      if (oneDayBefore > new Date()) {
        await queueContractorExpirationWarning({
          roleId,
          userId,
          expiresAt,
          warningType: '1_day',
        });
      }

      console.log(`[AdminRoleService] Scheduled expiration warnings for contractor role ${roleId}`);
    } catch (error) {
      console.error('Error scheduling contractor expiration warnings:', error);
      // Don't throw - warning scheduling failure shouldn't block role creation
    }
  }

  /**
   * Get cached permissions for a user
   * @private
   */
  private async getCachedPermissions(userId: string): Promise<string[] | null> {
    try {
      const cached = await redis.get(`${this.PERMISSIONS_CACHE_PREFIX}${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      console.error('Redis cache error:', error);
      return null;
    }
  }

  /**
   * Cache permissions for a user
   * @private
   */
  private async cachePermissions(userId: string, permissions: string[]): Promise<void> {
    try {
      await redis.setex(
        `${this.PERMISSIONS_CACHE_PREFIX}${userId}`,
        this.CACHE_TTL,
        JSON.stringify(permissions)
      );
    } catch (error) {
      console.error('Redis cache error:', error);
    }
  }

  /**
   * Invalidate user's cached permissions
   * @private
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    try {
      await Promise.all([
        redis.del(`${this.CACHE_PREFIX}${userId}`),
        redis.del(`${this.PERMISSIONS_CACHE_PREFIX}${userId}`),
      ]);
    } catch (error) {
      console.error('Redis cache invalidation error:', error);
    }
  }
}
