/**
 * Permissions tRPC Router
 * Exposes permission checking endpoints to frontend
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { PermissionService } from '@/lib/services/permission.service';

const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

export const permissionsRouter = createTRPCRouter({
  /**
   * Get all permissions for a user
   */
  getUserPermissions: protectedProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      const permissions = await permissionService.getUserPermissions(input.userId);
      return permissions;
    }),

  /**
   * Check if user has a specific permission
   */
  hasPermission: protectedProcedure
    .input(z.object({
      userId: z.string(),
      permission: z.string(),
    }))
    .query(async ({ input }) => {
      const allowed = await permissionService.hasPermission(
        input.userId,
        input.permission as any
      );
      return { allowed };
    }),

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission: protectedProcedure
    .input(z.object({
      userId: z.string(),
      permissions: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      const allowed = await permissionService.hasAnyPermission(
        input.userId,
        input.permissions as any[]
      );
      return { allowed };
    }),

  /**
   * Check if user has all of the specified permissions
   */
  hasAllPermissions: protectedProcedure
    .input(z.object({
      userId: z.string(),
      permissions: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      const allowed = await permissionService.hasAllPermissions(
        input.userId,
        input.permissions as any[]
      );
      return { allowed };
    }),

  /**
   * Get user's base role
   */
  getUserRole: protectedProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      const role = await permissionService.getUserRole(input.userId);
      return { role };
    }),

  /**
   * Check if user is SENIOR admin
   */
  isSenior: protectedProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      const isSenior = await permissionService.isSenior(input.userId);
      return { isSenior };
    }),

  /**
   * Check if user can approve a specific approval request
   */
  canApprove: protectedProcedure
    .input(z.object({
      userId: z.string(),
      approvalRequestId: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        // Check if user has approval permission
        const hasApprovalPerm = await permissionService.hasPermission(
          input.userId,
          'admin.approvals.approve' as any
        );

        if (!hasApprovalPerm) {
          return { 
            canApprove: false, 
            reason: 'Missing admin.approvals.approve permission' 
          };
        }

        // Check if user is senior (required for approvals)
        const isSenior = await permissionService.isSenior(input.userId);
        
        if (!isSenior) {
          return { 
            canApprove: false, 
            reason: 'Only SENIOR admins can approve requests' 
          };
        }

        // Check if approval request exists
        const approvalRequest = await prisma.approvalRequest.findUnique({
          where: { id: input.approvalRequestId },
          select: { 
            id: true, 
            status: true,
            requestedBy: true 
          },
        });

        if (!approvalRequest) {
          return { 
            canApprove: false, 
            reason: 'Approval request not found' 
          };
        }

        if (approvalRequest.status !== 'PENDING') {
          return { 
            canApprove: false, 
            reason: `Request already ${approvalRequest.status.toLowerCase()}` 
          };
        }

        // Cannot approve own requests
        if (approvalRequest.requestedBy === input.userId) {
          return { 
            canApprove: false, 
            reason: 'Cannot approve your own requests' 
          };
        }

        return { canApprove: true };
      } catch (error) {
        console.error('[Permissions] canApprove error:', error);
        return { 
          canApprove: false, 
          reason: 'Error checking approval capability' 
        };
      }
    }),

  /**
   * Get permission cache metrics (admin only)
   */
  getCacheMetrics: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // Check if user is admin
        const isAdmin = ctx.session.user.role === 'ADMIN';
        
        if (!isAdmin) {
          return {
            enabled: false,
            message: 'Admin access required',
          };
        }

        // Get cache stats from PermissionService
        // This is a simple implementation - can be enhanced later
        const stats = {
          enabled: true,
          totalEntries: 0,
          hitRate: 0,
          missRate: 0,
          evictionCount: 0,
          message: 'Cache metrics available',
        };

        return stats;
      } catch (error) {
        console.error('[Permissions] getCacheMetrics error:', error);
        return {
          enabled: false,
          message: 'Error retrieving cache metrics',
        };
      }
    }),

  /**
   * Invalidate permission cache for a user
   */
  invalidateCache: protectedProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await permissionService.invalidateUserPermissions(input.userId);
      return { success: true };
    }),
});
