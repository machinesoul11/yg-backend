/**
 * Admin Role Utilities
 * Helper functions for working with admin roles and aggregating permissions
 */

import { prisma } from '@/lib/db';
import { AdminRoleService } from '@/lib/services/admin-role.service';
import { AuditService } from '@/lib/services/audit.service';

// Initialize services
const auditService = new AuditService(prisma);
export const adminRoleService = new AdminRoleService(prisma, auditService);

/**
 * Check if a user has any active admin roles
 * @param userId - User ID to check
 * @returns True if user has at least one active admin role
 */
export async function userHasAdminRoles(userId: string): Promise<boolean> {
  const roles = await prisma.adminRole.findFirst({
    where: {
      userId,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });

  return roles !== null;
}

/**
 * Check if a user is a Super Admin
 * @param userId - User ID to check
 * @returns True if user has an active SUPER_ADMIN role
 */
export async function userIsSuperAdmin(userId: string): Promise<boolean> {
  const role = await prisma.adminRole.findFirst({
    where: {
      userId,
      department: 'SUPER_ADMIN',
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });

  return role !== null;
}

/**
 * Check if a user has a specific admin department role
 * @param userId - User ID to check
 * @param department - Department to check for
 * @returns True if user has the department role
 */
export async function userHasDepartment(
  userId: string,
  department: string
): Promise<boolean> {
  const role = await prisma.adminRole.findFirst({
    where: {
      userId,
      department: department as any,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });

  return role !== null;
}

/**
 * Get all active departments for a user
 * @param userId - User ID
 * @returns Array of department names
 */
export async function getUserDepartments(userId: string): Promise<string[]> {
  const roles = await prisma.adminRole.findMany({
    where: {
      userId,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
    select: {
      department: true,
    },
  });

  return roles.map(r => r.department);
}

/**
 * Check if user's admin role is about to expire
 * @param userId - User ID
 * @param daysThreshold - Number of days before expiration to warn (default: 30)
 * @returns Object with expiring status and days until expiration
 */
export async function checkExpiringRoles(
  userId: string,
  daysThreshold: number = 30
): Promise<{ hasExpiring: boolean; expiringRoles: Array<{ department: string; daysUntilExpiration: number }> }> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  const roles = await prisma.adminRole.findMany({
    where: {
      userId,
      isActive: true,
      expiresAt: {
        lte: thresholdDate,
        gte: new Date(),
      },
    },
    select: {
      department: true,
      expiresAt: true,
    },
  });

  const expiringRoles = roles.map(role => {
    const daysUntilExpiration = Math.ceil(
      (role.expiresAt!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      department: role.department,
      daysUntilExpiration,
    };
  });

  return {
    hasExpiring: expiringRoles.length > 0,
    expiringRoles,
  };
}

/**
 * Deactivate expired admin roles
 * This should be run periodically (e.g., daily cron job)
 * @returns Number of roles deactivated
 */
export async function deactivateExpiredRoles(): Promise<number> {
  const result = await prisma.adminRole.updateMany({
    where: {
      isActive: true,
      expiresAt: {
        lte: new Date(),
      },
    },
    data: {
      isActive: false,
    },
  });

  if (result.count > 0) {
    await auditService.log({
      action: 'EXPIRED_ADMIN_ROLES_DEACTIVATED',
      entityType: 'admin_role',
      entityId: 'system',
      userId: 'system',
      after: { deactivatedCount: result.count },
    });
  }

  return result.count;
}

/**
 * Get a summary of a user's admin access
 * @param userId - User ID
 * @returns Summary object with roles, permissions, and expiration info
 */
export async function getUserAdminSummary(userId: string) {
  const roles = await prisma.adminRole.findMany({
    where: {
      userId,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
    select: {
      id: true,
      department: true,
      seniority: true,
      permissions: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const permissions = await adminRoleService.getUserAggregatedPermissions(userId);
  const expiringCheck = await checkExpiringRoles(userId);

  return {
    totalActiveRoles: roles.length,
    isSuperAdmin: roles.some(r => r.department === 'SUPER_ADMIN'),
    departments: roles.map(r => r.department),
    permissions: permissions,
    totalPermissions: permissions.length,
    expiringRoles: expiringCheck.expiringRoles,
    roles: roles.map(role => ({
      id: role.id,
      department: role.department,
      seniority: role.seniority,
      permissionCount: (role.permissions as string[]).length,
      expiresAt: role.expiresAt,
      assignedAt: role.createdAt,
    })),
  };
}
