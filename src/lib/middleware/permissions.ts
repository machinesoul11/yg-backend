/**
 * Permission Middleware for tRPC
 * 
 * Provides reusable middleware for permission-based authorization in tRPC procedures
 */

import { TRPCError } from '@trpc/server';
import { Permission } from '@/lib/constants/permissions';
import { PermissionService } from '@/lib/services/permission.service';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';

// Initialize services
const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * Context shape for permission middleware
 */
interface PermissionContext {
  session: {
    user: {
      id: string;
      role: string;
      [key: string]: any;
    };
  };
}

/**
 * Create middleware that requires specific permission
 * 
 * @param permission - Required permission
 * @param customMessage - Optional custom error message
 * @returns Middleware function
 * 
 * @example
 * const viewAllUsersProcedure = protectedProcedure.use(
 *   requirePermission(PERMISSIONS.USERS_VIEW_ALL)
 * );
 */
export function requirePermission(permission: Permission, customMessage?: string) {
  return async ({ ctx, next }: { ctx: PermissionContext; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    await permissionService.checkPermission(
      ctx.session.user.id,
      permission,
      customMessage
    );

    return next({ ctx });
  };
}

/**
 * Create middleware that requires any of the specified permissions
 * 
 * @param permissions - Array of permissions (user needs at least one)
 * @param customMessage - Optional custom error message
 * @returns Middleware function
 * 
 * @example
 * const viewProjectsProcedure = protectedProcedure.use(
 *   requireAnyPermission([
 *     PERMISSIONS.PROJECTS_VIEW_OWN,
 *     PERMISSIONS.PROJECTS_VIEW_ALL
 *   ])
 * );
 */
export function requireAnyPermission(permissions: Permission[], customMessage?: string) {
  return async ({ ctx, next }: { ctx: PermissionContext; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    await permissionService.checkAnyPermission(
      ctx.session.user.id,
      permissions,
      customMessage
    );

    return next({ ctx });
  };
}

/**
 * Create middleware that requires all of the specified permissions
 * 
 * @param permissions - Array of permissions (user needs all)
 * @param customMessage - Optional custom error message
 * @returns Middleware function
 * 
 * @example
 * const processPayoutProcedure = protectedProcedure.use(
 *   requireAllPermissions([
 *     PERMISSIONS.PAYOUTS_VIEW_ALL,
 *     PERMISSIONS.PAYOUTS_PROCESS
 *   ])
 * );
 */
export function requireAllPermissions(permissions: Permission[], customMessage?: string) {
  return async ({ ctx, next }: { ctx: PermissionContext; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    await permissionService.checkAllPermissions(
      ctx.session.user.id,
      permissions,
      customMessage
    );

    return next({ ctx });
  };
}

/**
 * Resource-level permission middleware
 * Checks both permission and resource ownership
 * 
 * @param resourceType - Type of resource
 * @param action - Action to perform
 * @param getResourceId - Function to extract resource ID from input
 * @param customMessage - Optional custom error message
 * @returns Middleware function
 * 
 * @example
 * const updateProjectProcedure = protectedProcedure.use(
 *   requireResourceAccess('project', 'edit', (input) => input.id)
 * );
 */
export function requireResourceAccess<TInput = any>(
  resourceType: string,
  action: 'view' | 'edit' | 'delete' | 'create' | 'approve' | 'publish',
  getResourceId: (input: TInput) => string,
  customMessage?: string
) {
  return async ({ ctx, input, next }: { ctx: PermissionContext; input: TInput; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const resourceId = getResourceId(input);

    await permissionService.checkResourceAccess(
      ctx.session.user.id,
      resourceType,
      resourceId,
      action
    );

    return next({ ctx });
  };
}

/**
 * Middleware to initialize request-level permission cache
 * Should be added to the tRPC context creation
 */
export function initPermissionCache() {
  return async ({ ctx, next }: { ctx: PermissionContext; next: any }) => {
    permissionService.initRequestCache();
    
    try {
      const result = await next({ ctx });
      return result;
    } finally {
      permissionService.clearRequestCache();
    }
  };
}
