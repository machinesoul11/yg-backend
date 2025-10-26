/**
 * Admin Role Authorization Middleware
 * Extends existing authorization middleware to support AdminRole permissions
 * Integrates seamlessly with current permission checking system
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AuthUser } from './auth.middleware';
import { adminRoleService } from '@/lib/utils/admin-role.utils';
import { TRPCError } from '@trpc/server';

/**
 * Authorization result for admin role checks
 */
export interface AdminRoleAuthResult {
  authorized: boolean;
  error?: string;
  errorCode?: 'FORBIDDEN' | 'INSUFFICIENT_ADMIN_PERMISSIONS' | 'DEPARTMENT_REQUIRED' | 'ROLE_EXPIRED';
}

/**
 * Check if user has a specific admin permission through their AdminRoles
 * This supplements the existing permission system
 * 
 * @param user - Authenticated user
 * @param permission - Permission string to check (format: "namespace:action")
 * @returns Authorization result
 */
export async function checkAdminRolePermission(
  user: AuthUser,
  permission: string
): Promise<AdminRoleAuthResult> {
  try {
    const hasPermission = await adminRoleService.userHasPermission(user.id, permission);

    if (!hasPermission) {
      return {
        authorized: false,
        error: `Admin permission required: ${permission}`,
        errorCode: 'INSUFFICIENT_ADMIN_PERMISSIONS',
      };
    }

    return { authorized: true };
  } catch (error) {
    console.error('Admin role permission check failed:', error);
    return {
      authorized: false,
      error: 'Permission check failed',
      errorCode: 'FORBIDDEN',
    };
  }
}

/**
 * Check if user has any of the specified admin permissions
 * 
 * @param user - Authenticated user
 * @param permissions - Array of permission strings
 * @returns Authorization result
 */
export async function checkAnyAdminRolePermission(
  user: AuthUser,
  permissions: string[]
): Promise<AdminRoleAuthResult> {
  try {
    for (const permission of permissions) {
      const hasPermission = await adminRoleService.userHasPermission(user.id, permission);
      if (hasPermission) {
        return { authorized: true };
      }
    }

    return {
      authorized: false,
      error: `One of these admin permissions required: ${permissions.join(', ')}`,
      errorCode: 'INSUFFICIENT_ADMIN_PERMISSIONS',
    };
  } catch (error) {
    console.error('Admin role permission check failed:', error);
    return {
      authorized: false,
      error: 'Permission check failed',
      errorCode: 'FORBIDDEN',
    };
  }
}

/**
 * Check if user belongs to a specific department
 * 
 * @param user - Authenticated user
 * @param department - Department name
 * @returns Authorization result
 */
export async function checkAdminDepartment(
  user: AuthUser,
  department: string
): Promise<AdminRoleAuthResult> {
  try {
    const { userHasDepartment } = await import('@/lib/utils/admin-role.utils');
    const hasDepartment = await userHasDepartment(user.id, department);

    if (!hasDepartment) {
      return {
        authorized: false,
        error: `${department} department access required`,
        errorCode: 'DEPARTMENT_REQUIRED',
      };
    }

    return { authorized: true };
  } catch (error) {
    console.error('Department check failed:', error);
    return {
      authorized: false,
      error: 'Department check failed',
      errorCode: 'FORBIDDEN',
    };
  }
}

/**
 * Check if user is a Super Admin
 * Super Admins have access to everything
 * 
 * @param user - Authenticated user
 * @returns Authorization result
 */
export async function checkSuperAdmin(user: AuthUser): Promise<AdminRoleAuthResult> {
  try {
    const { userIsSuperAdmin } = await import('@/lib/utils/admin-role.utils');
    const isSuperAdmin = await userIsSuperAdmin(user.id);

    if (!isSuperAdmin) {
      return {
        authorized: false,
        error: 'Super Admin access required',
        errorCode: 'FORBIDDEN',
      };
    }

    return { authorized: true };
  } catch (error) {
    console.error('Super admin check failed:', error);
    return {
      authorized: false,
      error: 'Super admin check failed',
      errorCode: 'FORBIDDEN',
    };
  }
}

/**
 * Middleware wrapper that requires a specific admin permission
 * Throws error if user doesn't have the permission
 * 
 * @param user - Authenticated user
 * @param permission - Required permission
 * @throws Error if permission denied
 */
export async function requireAdminPermission(
  user: AuthUser,
  permission: string
): Promise<void> {
  const result = await checkAdminRolePermission(user, permission);

  if (!result.authorized) {
    const error = new Error(result.error || 'Forbidden');
    (error as any).code = result.errorCode;
    throw error;
  }
}

/**
 * Middleware wrapper that requires user to be in a specific department
 * 
 * @param user - Authenticated user
 * @param department - Required department
 * @throws Error if user not in department
 */
export async function requireDepartment(
  user: AuthUser,
  department: string
): Promise<void> {
  const result = await checkAdminDepartment(user, department);

  if (!result.authorized) {
    const error = new Error(result.error || 'Forbidden');
    (error as any).code = result.errorCode;
    throw error;
  }
}

/**
 * Middleware wrapper that requires Super Admin access
 * 
 * @param user - Authenticated user
 * @throws Error if user is not a super admin
 */
export async function requireSuperAdmin(user: AuthUser): Promise<void> {
  const result = await checkSuperAdmin(user);

  if (!result.authorized) {
    const error = new Error(result.error || 'Forbidden');
    (error as any).code = result.errorCode;
    throw error;
  }
}

/**
 * Combined middleware: Require authentication + admin permission
 * 
 * @example
 * ```typescript
 * import { withAdminPermission } from '@/lib/middleware/admin-role.middleware';
 * 
 * export async function GET(req: NextRequest) {
 *   const { user } = await withAdminPermission(req, 'users:manage');
 *   // user is authenticated and has users:manage permission
 * }
 * ```
 */
export async function withAdminPermission(
  req: NextRequest,
  permission: string,
  authOptions?: any
): Promise<{ user: AuthUser }> {
  const { requireAuth } = await import('./auth.middleware');
  const { user } = await requireAuth(req, authOptions);

  await requireAdminPermission(user, permission);

  return { user };
}

/**
 * Combined middleware: Require authentication + department access
 * 
 * @example
 * ```typescript
 * import { withDepartment } from '@/lib/middleware/admin-role.middleware';
 * 
 * export async function GET(req: NextRequest) {
 *   const { user } = await withDepartment(req, 'FINANCE_LICENSING');
 *   // user is authenticated and has FINANCE_LICENSING department role
 * }
 * ```
 */
export async function withDepartment(
  req: NextRequest,
  department: string,
  authOptions?: any
): Promise<{ user: AuthUser }> {
  const { requireAuth } = await import('./auth.middleware');
  const { user } = await requireAuth(req, authOptions);

  await requireDepartment(user, department);

  return { user };
}

/**
 * Combined middleware: Require authentication + super admin
 * 
 * @example
 * ```typescript
 * import { withSuperAdmin } from '@/lib/middleware/admin-role.middleware';
 * 
 * export async function GET(req: NextRequest) {
 *   const { user } = await withSuperAdmin(req);
 *   // user is authenticated and is a super admin
 * }
 * ```
 */
export async function withSuperAdmin(
  req: NextRequest,
  authOptions?: any
): Promise<{ user: AuthUser }> {
  const { requireAuth } = await import('./auth.middleware');
  const { user } = await requireAuth(req, authOptions);

  await requireSuperAdmin(user);

  return { user };
}

/**
 * Helper to create authorization error response
 */
export function createAdminRoleError(result: AdminRoleAuthResult): NextResponse {
  return NextResponse.json(
    {
      error: result.error || 'Forbidden',
      code: result.errorCode || 'FORBIDDEN',
    },
    { status: 403 }
  );
}

/**
 * tRPC middleware for admin role permission checking
 * 
 * @example
 * ```typescript
 * import { requireAdminPermissionTRPC } from '@/lib/middleware/admin-role.middleware';
 * 
 * const adminProcedure = protectedProcedure.use(
 *   requireAdminPermissionTRPC('users:manage')
 * );
 * ```
 */
export function requireAdminPermissionTRPC(permission: string) {
  return async ({ ctx, next }: { ctx: any; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const hasPermission = await adminRoleService.userHasPermission(
      ctx.session.user.id,
      permission
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Admin permission required: ${permission}`,
      });
    }

    return next({ ctx });
  };
}

/**
 * tRPC middleware for department checking
 */
export function requireDepartmentTRPC(department: string) {
  return async ({ ctx, next }: { ctx: any; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const { userHasDepartment } = await import('@/lib/utils/admin-role.utils');
    const hasDepartment = await userHasDepartment(ctx.session.user.id, department);

    if (!hasDepartment) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${department} department access required`,
      });
    }

    return next({ ctx });
  };
}

/**
 * tRPC middleware for super admin checking
 */
export function requireSuperAdminTRPC() {
  return async ({ ctx, next }: { ctx: any; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const { userIsSuperAdmin } = await import('@/lib/utils/admin-role.utils');
    const isSuperAdmin = await userIsSuperAdmin(ctx.session.user.id);

    if (!isSuperAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Super Admin access required',
      });
    }

    return next({ ctx });
  };
}
