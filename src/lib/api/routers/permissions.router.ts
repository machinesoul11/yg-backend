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
