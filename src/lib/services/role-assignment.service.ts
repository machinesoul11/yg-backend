/**
 * Role Assignment Service
 * Handles all role assignment and role change operations with comprehensive auditing
 */

import { PrismaClient, UserRole } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { EmailService } from './email/email.service';
import { permissionCacheService } from './permission-cache.service';
import {
  ROLES,
  isValidRole,
  isValidRoleTransition,
  isAdmin,
  getRoleDisplayName,
} from '@/lib/constants/roles';

export class RoleAssignmentService {
  private emailService: EmailService;

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {
    this.emailService = new EmailService();
  }

  /**
   * Assign a role to a user
   * @param userId - ID of user receiving role
   * @param newRole - Role to assign
   * @param assignedBy - ID of user making the assignment
   * @param reason - Optional reason for role change
   * @param context - Request context (IP, user agent, etc.)
   */
  async assignRole(
    userId: string,
    newRole: UserRole,
    assignedBy: string,
    reason?: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    }
  ): Promise<{ success: boolean; previousRole: UserRole; newRole: UserRole }> {
    // Validate role value
    if (!isValidRole(newRole)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid role: ${newRole}`,
      });
    }

    // Fetch target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        deleted_at: true,
      },
    });

    if (!targetUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `User with ID ${userId} not found`,
      });
    }

    if (targetUser.deleted_at) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot assign role to deleted user',
      });
    }

    // Check if same role (no-op)
    if (targetUser.role === newRole) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `User already has ${getRoleDisplayName(newRole)} role`,
      });
    }

    // Fetch assigner user
    const assignerUser = await this.prisma.user.findUnique({
      where: { id: assignedBy },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!assignerUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assigner user not found',
      });
    }

    // Check if assigner can assign this role
    const canAssign = this.canAssignRole(assignerUser.role, newRole);
    if (!canAssign) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${getRoleDisplayName(assignerUser.role)} users cannot assign ${getRoleDisplayName(newRole)} role`,
      });
    }

    // Validate role transition
    const isValidTransition = isValidRoleTransition(targetUser.role, newRole);
    if (!isValidTransition) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid role transition from ${getRoleDisplayName(targetUser.role)} to ${getRoleDisplayName(newRole)}`,
      });
    }

    const previousRole = targetUser.role;

    // Perform role update in transaction
    try {
      await this.prisma.$transaction(async (tx) => {
        // Update user role
        await tx.user.update({
          where: { id: userId },
          data: { role: newRole },
        });

        // Log to audit trail
        await this.auditService.log({
          action: AUDIT_ACTIONS.ROLE_CHANGED,
          entityType: 'user',
          entityId: userId,
          userId: assignedBy,
          email: targetUser.email,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
          before: {
            role: previousRole,
            roleName: getRoleDisplayName(previousRole),
          },
          after: {
            role: newRole,
            roleName: getRoleDisplayName(newRole),
            reason: reason || 'No reason provided',
            assignedBy: {
              id: assignerUser.id,
              email: assignerUser.email,
              name: assignerUser.name,
            },
          },
        });
      });

      // Invalidate permission cache for the user
      try {
        await permissionCacheService.invalidate(userId);
        console.log(`[RoleAssignment] Invalidated permission cache for user ${userId}`);
      } catch (cacheError) {
        // Log but don't fail the operation
        console.error('[RoleAssignment] Failed to invalidate permission cache:', cacheError);
      }

      // Send email notification to user
      await this.sendRoleChangeNotification(
        targetUser,
        previousRole,
        newRole,
        assignerUser,
        reason
      ).catch((error) => {
        // Log email failure but don't fail the role assignment
        console.error('Failed to send role change email:', error);
      });

      return {
        success: true,
        previousRole,
        newRole,
      };
    } catch (error) {
      console.error('Role assignment failed:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to assign role. Please try again.',
      });
    }
  }

  /**
   * Send role change notification email
   * @private
   */
  private async sendRoleChangeNotification(
    user: { id: string; email: string; name: string | null },
    oldRole: UserRole,
    newRole: UserRole,
    changedBy: { id: string; email: string; name: string | null },
    reason?: string
  ): Promise<void> {
    await this.emailService.sendTransactional({
      userId: user.id,
      email: user.email,
      subject: `Your YES GODDESS Role Has Been Updated`,
      template: 'role-changed',
      variables: {
        userName: user.name || 'User',
        userEmail: user.email,
        oldRole: getRoleDisplayName(oldRole),
        newRole: getRoleDisplayName(newRole),
        changedBy: changedBy.name || 'Administrator',
        changedByEmail: changedBy.email,
        reason: reason || undefined,
        timestamp: new Date().toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
        }),
        supportEmail: process.env.SUPPORT_EMAIL || 'support@yesgoddess.agency',
      },
    });
  }

  /**
   * Check if a user with assignerRole can assign targetRole
   * Only ADMIN users can assign roles
   */
  canAssignRole(assignerRole: UserRole, targetRole: UserRole): boolean {
    // Only admins can assign any role
    return isAdmin(assignerRole);
  }

  /**
   * Validate if a role transition is allowed
   */
  validateRoleTransition(currentRole: UserRole, newRole: UserRole): boolean {
    return isValidRoleTransition(currentRole, newRole);
  }

  /**
   * Get role change history for a user
   */
  async getRoleHistory(userId: string, limit: number = 50) {
    try {
      const history = await this.auditService.searchEvents({
        entityType: 'user',
        entityId: userId,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        limit,
      });

      return history.map((event) => {
        const beforeData = event.beforeJson as any;
        const afterData = event.afterJson as any;
        
        return {
          id: event.id,
          timestamp: event.timestamp,
          previousRole: beforeData?.role || null,
          newRole: afterData?.role || null,
          assignedBy: afterData?.assignedBy || null,
          reason: afterData?.reason || null,
          ipAddress: event.ipAddress,
        };
      });
    } catch (error) {
      console.error('Failed to fetch role history:', error);
      return [];
    }
  }

  /**
   * Automatically assign CREATOR role when creator profile is verified
   * Called by CreatorService.approveCreator()
   */
  async assignCreatorRoleOnVerification(
    userId: string,
    creatorId: string,
    adminId: string
  ): Promise<void> {
    try {
      await this.assignRole(
        userId,
        ROLES.CREATOR,
        adminId,
        `Automatically assigned upon creator profile verification (Creator ID: ${creatorId})`
      );
    } catch (error) {
      // If role assignment fails, log but don't break verification flow
      console.error('Failed to auto-assign CREATOR role:', error);
      await this.auditService.log({
        action: 'ROLE_ASSIGNMENT_FAILED',
        entityType: 'user',
        entityId: userId,
        userId: adminId,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedRole: 'CREATOR',
          creatorId,
        },
      });
    }
  }

  /**
   * Automatically assign BRAND role when brand profile is verified
   * Called by BrandService.verifyBrand()
   */
  async assignBrandRoleOnVerification(
    userId: string,
    brandId: string,
    adminId: string
  ): Promise<void> {
    try {
      await this.assignRole(
        userId,
        ROLES.BRAND,
        adminId,
        `Automatically assigned upon brand profile verification (Brand ID: ${brandId})`
      );
    } catch (error) {
      // If role assignment fails, log but don't break verification flow
      console.error('Failed to auto-assign BRAND role:', error);
      await this.auditService.log({
        action: 'ROLE_ASSIGNMENT_FAILED',
        entityType: 'user',
        entityId: userId,
        userId: adminId,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedRole: 'BRAND',
          brandId,
        },
      });
    }
  }

  /**
   * Bulk assign role to multiple users (admin operation)
   */
  async bulkAssignRole(
    userIds: string[],
    newRole: UserRole,
    assignedBy: string,
    reason?: string
  ): Promise<{
    successful: string[];
    failed: Array<{ userId: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];

    for (const userId of userIds) {
      try {
        await this.assignRole(userId, newRole, assignedBy, reason);
        successful.push(userId);
      } catch (error) {
        failed.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Invalidate permission cache for all successful assignments
    if (successful.length > 0) {
      try {
        await permissionCacheService.invalidateMany(successful);
        console.log(`[RoleAssignment] Bulk invalidated permission cache for ${successful.length} users`);
      } catch (cacheError) {
        console.error('[RoleAssignment] Failed to bulk invalidate permission cache:', cacheError);
      }
    }

    return { successful, failed };
  }
}
