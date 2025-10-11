/**
 * Authorization Middleware
 * Role-based and permission-based access control layer
 * 
 * Builds upon authentication middleware to enforce authorization policies
 */

import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { PermissionService } from '@/lib/services/permission.service';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import type { Permission } from '@/lib/constants/permissions';
import type { AuthUser } from './auth.middleware';

const permissionService = new PermissionService(prisma, new AuditService(prisma));

/**
 * Authorization result
 */
export interface AuthorizationResult {
  authorized: boolean;
  error?: string;
  errorCode?: 'FORBIDDEN' | 'INSUFFICIENT_PERMISSIONS' | 'ROLE_REQUIRED';
}

/**
 * Authorization options for role-based access control
 */
export interface RoleAuthOptions {
  allowedRoles: UserRole[];
  requireAll?: boolean; // If true, user must have all roles (default: any role)
}

/**
 * Authorization options for permission-based access control
 */
export interface PermissionAuthOptions {
  requiredPermissions: Permission[];
  requireAll?: boolean; // If true, user must have all permissions (default: any)
}

/**
 * Check if user has required role(s)
 * 
 * @param user - Authenticated user
 * @param options - Role authorization options
 * @returns Authorization result
 */
export function checkRole(user: AuthUser, options: RoleAuthOptions): AuthorizationResult {
  const { allowedRoles, requireAll = false } = options;

  if (requireAll) {
    // User must have all specified roles (uncommon use case)
    const hasAllRoles = allowedRoles.includes(user.role);
    if (!hasAllRoles) {
      return {
        authorized: false,
        error: `Required roles: ${allowedRoles.join(', ')}`,
        errorCode: 'ROLE_REQUIRED',
      };
    }
  } else {
    // User must have at least one of the specified roles
    const hasAnyRole = allowedRoles.includes(user.role);
    if (!hasAnyRole) {
      return {
        authorized: false,
        error: `Required role: ${allowedRoles.join(' or ')}`,
        errorCode: 'ROLE_REQUIRED',
      };
    }
  }

  return { authorized: true };
}

/**
 * Check if user has required permission(s)
 * 
 * @param user - Authenticated user
 * @param options - Permission authorization options
 * @returns Promise<AuthorizationResult>
 */
export async function checkPermission(
  user: AuthUser,
  options: PermissionAuthOptions
): Promise<AuthorizationResult> {
  const { requiredPermissions, requireAll = false } = options;

  try {
    if (requireAll) {
      // User must have all specified permissions
      const hasAllPermissions = await permissionService.hasAllPermissions(
        user.id,
        requiredPermissions
      );
      
      if (!hasAllPermissions) {
        return {
          authorized: false,
          error: 'Insufficient permissions',
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        };
      }
    } else {
      // User must have at least one of the specified permissions
      const hasAnyPermission = await permissionService.hasAnyPermission(
        user.id,
        requiredPermissions
      );
      
      if (!hasAnyPermission) {
        return {
          authorized: false,
          error: 'Insufficient permissions',
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        };
      }
    }

    return { authorized: true };
  } catch (error) {
    console.error('[AuthorizationMiddleware] Permission check failed:', error);
    return {
      authorized: false,
      error: 'Authorization check failed',
      errorCode: 'FORBIDDEN',
    };
  }
}

/**
 * Middleware wrapper that requires specific role(s)
 * 
 * @param user - Authenticated user
 * @param allowedRoles - Array of allowed roles
 * @throws Error if user doesn't have required role
 * 
 * @example
 * ```typescript
 * const auth = await requireAuth(req);
 * await requireRole(auth.user, ['ADMIN', 'CREATOR']);
 * ```
 */
export function requireRole(user: AuthUser, allowedRoles: UserRole[]): void {
  const result = checkRole(user, { allowedRoles });
  
  if (!result.authorized) {
    const error = new Error(result.error || 'Forbidden');
    (error as any).code = result.errorCode;
    throw error;
  }
}

/**
 * Middleware wrapper that requires specific permission(s)
 * 
 * @param user - Authenticated user
 * @param requiredPermissions - Array of required permissions
 * @param requireAll - If true, user must have all permissions
 * @throws Error if user doesn't have required permission(s)
 * 
 * @example
 * ```typescript
 * const auth = await requireAuth(req);
 * await requirePermission(auth.user, [PERMISSIONS.PROJECTS_VIEW_ALL]);
 * ```
 */
export async function requirePermission(
  user: AuthUser,
  requiredPermissions: Permission[],
  requireAll: boolean = false
): Promise<void> {
  const result = await checkPermission(user, { requiredPermissions, requireAll });
  
  if (!result.authorized) {
    const error = new Error(result.error || 'Forbidden');
    (error as any).code = result.errorCode;
    throw error;
  }
}

/**
 * Combined middleware: Require authentication + specific role(s)
 * 
 * @example
 * ```typescript
 * import { withRole } from '@/lib/middleware/authorization.middleware';
 * 
 * export async function GET(req: NextRequest) {
 *   const { user } = await withRole(req, ['ADMIN']);
 *   // user is authenticated and has ADMIN role
 * }
 * ```
 */
export async function withRole(
  req: NextRequest,
  allowedRoles: UserRole[],
  authOptions?: Parameters<typeof import('./auth.middleware').authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  const { requireAuth } = await import('./auth.middleware');
  const { user } = await requireAuth(req, authOptions);
  
  requireRole(user, allowedRoles);
  
  return { user };
}

/**
 * Combined middleware: Require authentication + specific permission(s)
 * 
 * @example
 * ```typescript
 * import { withPermission } from '@/lib/middleware/authorization.middleware';
 * import { PERMISSIONS } from '@/lib/constants/permissions';
 * 
 * export async function GET(req: NextRequest) {
 *   const { user } = await withPermission(req, [PERMISSIONS.PROJECTS_VIEW_ALL]);
 *   // user is authenticated and has required permission
 * }
 * ```
 */
export async function withPermission(
  req: NextRequest,
  requiredPermissions: Permission[],
  requireAll: boolean = false,
  authOptions?: Parameters<typeof import('./auth.middleware').authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  const { requireAuth } = await import('./auth.middleware');
  const { user } = await requireAuth(req, authOptions);
  
  await requirePermission(user, requiredPermissions, requireAll);
  
  return { user };
}

/**
 * Helper to create authorization error response
 */
export function createAuthorizationError(result: AuthorizationResult): NextResponse {
  return NextResponse.json(
    {
      error: result.error || 'Forbidden',
      code: result.errorCode || 'FORBIDDEN',
    },
    { status: 403 }
  );
}

/**
 * Admin-only middleware helper
 */
export async function requireAdmin(
  req: NextRequest,
  authOptions?: Parameters<typeof import('./auth.middleware').authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  return withRole(req, ['ADMIN'], authOptions);
}

/**
 * Creator-only middleware helper
 */
export async function requireCreator(
  req: NextRequest,
  authOptions?: Parameters<typeof import('./auth.middleware').authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  return withRole(req, ['CREATOR'], authOptions);
}

/**
 * Brand-only middleware helper
 */
export async function requireBrand(
  req: NextRequest,
  authOptions?: Parameters<typeof import('./auth.middleware').authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  return withRole(req, ['BRAND'], authOptions);
}
