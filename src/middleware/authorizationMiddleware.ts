/**
 * Authorization Middleware
 * Express-compatible middleware for permission-based and seniority-based access control
 * 
 * This middleware provides reusable authorization functions that work with Express-style
 * request/response/next patterns. It integrates with the permission service to enforce
 * access control policies based on user permissions and seniority levels.
 * 
 * @module middleware/authorizationMiddleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { PermissionService } from '@/lib/services/permission.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';
import type { Permission } from '@/lib/constants/permissions';

// Initialize services
const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * Next function type for Express-style middleware
 */
type NextFunction = () => void | Promise<void>;

/**
 * Response interface compatible with Express-style responses
 */
interface ExpressResponse {
  status: (code: number) => ExpressResponse;
  json: (body: any) => void;
  statusCode?: number;
}

/**
 * Extended Request interface with authenticated user
 */
export interface AuthenticatedRequest {
  url?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined> | Headers;
  ip?: string;
  user?: {
    id: string;
    email: string;
    role: string;
    [key: string]: any;
  };
  userPermissions?: Permission[];
  [key: string]: any;
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code: number;
  timestamp: string;
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  code: number,
  error: string,
  message: string
): ErrorResponse {
  return {
    success: false,
    error,
    message,
    code,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a standardized error response
 */
function sendErrorResponse(
  res: ExpressResponse,
  code: number,
  error: string,
  message: string
): void {
  const response = createErrorResponse(code, error, message);
  
  // Set status code and send JSON response
  res.status(code).json(response);
}

/**
 * Log permission check for audit purposes
 */
async function logPermissionCheck(
  userId: string,
  permissions: Permission | Permission[],
  granted: boolean,
  req: AuthenticatedRequest
): Promise<void> {
  try {
    const permissionArray = Array.isArray(permissions) ? permissions : [permissions];
    const route = (req as any).url || (req as any).path || 'unknown';
    const method = (req as any).method || 'unknown';
    
    // Structured logging for security auditing
    console.log({
      timestamp: new Date().toISOString(),
      level: granted ? 'info' : 'warn',
      event: 'PERMISSION_CHECK',
      userId,
      permissions: permissionArray,
      result: granted ? 'GRANTED' : 'DENIED',
      route,
      method,
      ip: (req as any).ip || (req as any).headers?.['x-forwarded-for'] || 'unknown',
    });

    // Log to audit service for denied permissions
    if (!granted) {
      await auditService.log({
        action: 'PERMISSION_DENIED',
        entityType: 'user',
        entityId: userId,
        userId,
        after: {
          permissions: permissionArray,
          route,
          method,
        },
      });
    }
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('[AuthorizationMiddleware] Failed to log permission check:', error);
  }
}

/**
 * Verify user authentication
 * Returns the authenticated user or null if not authenticated
 */
function getAuthenticatedUser(req: AuthenticatedRequest): AuthenticatedRequest['user'] | null {
  // Check for user object attached by authentication middleware
  if (req.user && req.user.id) {
    return req.user;
  }
  
  return null;
}

/**
 * Middleware factory: Require specific permission(s)
 * 
 * Creates Express middleware that checks if the authenticated user has the required permission(s).
 * Supports both single permission and array of permissions (OR logic - user needs at least one).
 * 
 * @param permissions - Single permission or array of permissions (OR logic)
 * @returns Express middleware function
 * 
 * @example
 * // Single permission
 * router.get('/users', requirePermission(PERMISSIONS.USERS_VIEW_ALL), handler);
 * 
 * @example
 * // Multiple permissions (user needs at least one)
 * router.post('/content', requirePermission([
 *   PERMISSIONS.CONTENT_CREATE,
 *   PERMISSIONS.CONTENT_ADMIN
 * ]), handler);
 * 
 * @example
 * // Chain with requireSenior
 * router.delete('/users/:id',
 *   requireSenior(),
 *   requirePermission(PERMISSIONS.USERS_DELETE),
 *   handler
 * );
 */
export function requirePermission(
  permissions: Permission | Permission[]
): (req: AuthenticatedRequest, res: ExpressResponse, next: NextFunction) => Promise<void> {
  return async (req: AuthenticatedRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      // Step 1: Verify user is authenticated
      const user = getAuthenticatedUser(req);
      
      if (!user) {
        sendErrorResponse(
          res,
          401,
          'UNAUTHORIZED',
          'Authentication required'
        );
        return;
      }

      // Step 2: Normalize permissions to array for consistent handling
      const permissionArray = Array.isArray(permissions) ? permissions : [permissions];
      
      if (permissionArray.length === 0) {
        // If no permissions specified, just verify authentication
        await logPermissionCheck(user.id, permissionArray, true, req);
        next();
        return;
      }

      // Step 3: Check if user has any of the required permissions
      let hasPermission = false;
      
      try {
        // Use hasAnyPermission for arrays, hasPermission for single
        if (permissionArray.length === 1) {
          hasPermission = await permissionService.hasPermission(user.id, permissionArray[0]);
        } else {
          hasPermission = await permissionService.hasAnyPermission(user.id, permissionArray);
        }
      } catch (error) {
        console.error('[AuthorizationMiddleware] Permission check failed:', error);
        
        // Log the error
        await logPermissionCheck(user.id, permissionArray, false, req);
        
        // Return 500 for internal errors during permission checking
        sendErrorResponse(
          res,
          500,
          'INTERNAL_ERROR',
          'An internal error occurred while checking permissions'
        );
        return;
      }

      // Step 4: Log the permission check
      await logPermissionCheck(user.id, permissionArray, hasPermission, req);

      // Step 5: Enforce authorization
      if (!hasPermission) {
        const permissionNames = permissionArray.join(', ');
        sendErrorResponse(
          res,
          403,
          'FORBIDDEN',
          `Insufficient permissions: requires ${permissionNames}`
        );
        return;
      }

      // Step 6: Attach user permissions to request for downstream use
      try {
        // Get all user permissions and attach to request
        const allPermissions = await permissionService.getUserPermissions(user.id);
        req.userPermissions = allPermissions;
      } catch (error) {
        // Log but don't fail the request if we can't fetch all permissions
        console.error('[AuthorizationMiddleware] Failed to fetch user permissions:', error);
      }

      // Permission check passed, continue to next middleware/handler
      next();
    } catch (error) {
      console.error('[AuthorizationMiddleware] Unexpected error in requirePermission:', error);
      
      sendErrorResponse(
        res,
        500,
        'INTERNAL_ERROR',
        'An unexpected error occurred during authorization'
      );
    }
  };
}

/**
 * Middleware: Require senior-level access
 * 
 * Creates Express middleware that checks if the authenticated user has senior seniority.
 * This verifies the user has an active AdminRole with SENIOR seniority level.
 * Can be chained with requirePermission for additional permission checks.
 * 
 * @returns Express middleware function
 * 
 * @example
 * // Require senior access
 * router.post('/admin/approve', requireSenior(), handler);
 * 
 * @example
 * // Chain with permission check
 * router.post('/admin/override',
 *   requireSenior(),
 *   requirePermission(PERMISSIONS.ADMIN_OVERRIDE),
 *   handler
 * );
 * 
 * @example
 * // Senior required for sensitive operations
 * router.delete('/critical-data',
 *   requireSenior(),
 *   requirePermission(PERMISSIONS.DATA_DELETE_CRITICAL),
 *   handler
 * );
 */
export function requireSenior(): (
  req: AuthenticatedRequest,
  res: ExpressResponse,
  next: NextFunction
) => Promise<void> {
  return async (req: AuthenticatedRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      // Step 1: Verify user is authenticated
      const user = getAuthenticatedUser(req);
      
      if (!user) {
        sendErrorResponse(
          res,
          401,
          'UNAUTHORIZED',
          'Authentication required'
        );
        return;
      }

      // Step 2: Check if user has senior seniority
      let isSenior = false;
      
      try {
        isSenior = await permissionService.isSenior(user.id);
      } catch (error) {
        console.error('[AuthorizationMiddleware] Senior check failed:', error);
        
        // Log the failed check
        await logSeniorCheck(user.id, false, req);
        
        // Return 500 for internal errors during seniority checking
        sendErrorResponse(
          res,
          500,
          'INTERNAL_ERROR',
          'An internal error occurred while checking seniority level'
        );
        return;
      }

      // Step 3: Log the seniority check
      await logSeniorCheck(user.id, isSenior, req);

      // Step 4: Enforce authorization
      if (!isSenior) {
        sendErrorResponse(
          res,
          403,
          'FORBIDDEN',
          'This action requires senior-level access'
        );
        return;
      }

      // Seniority check passed, continue to next middleware/handler
      next();
    } catch (error) {
      console.error('[AuthorizationMiddleware] Unexpected error in requireSenior:', error);
      
      sendErrorResponse(
        res,
        500,
        'INTERNAL_ERROR',
        'An unexpected error occurred during authorization'
      );
    }
  };
}

/**
 * Log senior-level access check for audit purposes
 */
async function logSeniorCheck(
  userId: string,
  granted: boolean,
  req: AuthenticatedRequest
): Promise<void> {
  try {
    const route = (req as any).url || (req as any).path || 'unknown';
    const method = (req as any).method || 'unknown';
    
    // Structured logging for security auditing
    // Senior checks are always logged due to elevated privilege level
    console.log({
      timestamp: new Date().toISOString(),
      level: granted ? 'info' : 'warn',
      event: 'SENIOR_ACCESS_CHECK',
      userId,
      result: granted ? 'GRANTED' : 'DENIED',
      route,
      method,
      ip: (req as any).ip || (req as any).headers?.['x-forwarded-for'] || 'unknown',
    });

    // Log to audit service for denied access
    if (!granted) {
      await auditService.log({
        action: 'SENIOR_ACCESS_DENIED',
        entityType: 'user',
        entityId: userId,
        userId,
        after: {
          route,
          method,
        },
      });
    }
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('[AuthorizationMiddleware] Failed to log senior check:', error);
  }
}

/**
 * Export permission service for direct use if needed
 */
export { permissionService };
