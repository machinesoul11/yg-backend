/**
 * Permission System Error Classes
 * Specialized error handling for permission and role operations
 */

/**
 * Base Permission Error
 */
export class PermissionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 403,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PermissionError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Permission Denied Error
 * Thrown when user attempts an action they don't have permission for
 */
export class PermissionDeniedError extends PermissionError {
  constructor(
    userId: string,
    permission: string,
    customMessage?: string
  ) {
    super(
      'PERMISSION_DENIED',
      customMessage || `User ${userId} does not have permission: ${permission}`,
      403,
      { userId, permission }
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Role Not Found Error
 * Thrown when a user's role cannot be determined or doesn't exist
 */
export class RoleNotFoundError extends PermissionError {
  constructor(
    userId: string,
    roleId?: string
  ) {
    super(
      'ROLE_NOT_FOUND',
      roleId 
        ? `Role ${roleId} not found for user ${userId}`
        : `No role found for user ${userId}`,
      404,
      { userId, roleId }
    );
    this.name = 'RoleNotFoundError';
  }
}

/**
 * Invalid Role Assignment Error
 * Thrown when attempting to assign an invalid or unauthorized role
 */
export class InvalidRoleAssignmentError extends PermissionError {
  constructor(
    userId: string,
    attemptedRole: string,
    reason: string
  ) {
    super(
      'INVALID_ROLE_ASSIGNMENT',
      `Cannot assign role ${attemptedRole} to user ${userId}: ${reason}`,
      400,
      { userId, attemptedRole, reason }
    );
    this.name = 'InvalidRoleAssignmentError';
  }
}

/**
 * Cache Error
 * Thrown when Redis cache operations fail
 * This is a recoverable error - operations should fallback to database
 */
export class PermissionCacheError extends PermissionError {
  constructor(
    operation: string,
    originalError: Error
  ) {
    super(
      'PERMISSION_CACHE_ERROR',
      `Permission cache ${operation} failed: ${originalError.message}`,
      500,
      { operation, originalError: originalError.message }
    );
    this.name = 'PermissionCacheError';
  }
}

/**
 * Type guard to check if error is a PermissionError
 */
export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError;
}

/**
 * Predefined Permission Errors for common scenarios
 */
export const PermissionErrors = {
  // Access denied
  ACCESS_DENIED: (userId: string, resource: string) => 
    new PermissionDeniedError(userId, resource, `Access denied to ${resource}`),
  
  // Insufficient permissions
  INSUFFICIENT_PERMISSIONS: (userId: string, requiredPermission: string) =>
    new PermissionDeniedError(
      userId, 
      requiredPermission,
      'You do not have the required permissions to perform this action'
    ),
  
  // Role not found
  USER_ROLE_NOT_FOUND: (userId: string) =>
    new RoleNotFoundError(userId),
  
  // Admin role not found
  ADMIN_ROLE_NOT_FOUND: (userId: string, roleId: string) =>
    new RoleNotFoundError(userId, roleId),
  
  // Invalid assignment
  CANNOT_ASSIGN_ROLE: (userId: string, role: string, reason: string) =>
    new InvalidRoleAssignmentError(userId, role, reason),
  
  // Cache failures (non-critical)
  CACHE_READ_FAILED: (operation: string, error: Error) =>
    new PermissionCacheError(operation, error),
  
  CACHE_WRITE_FAILED: (operation: string, error: Error) =>
    new PermissionCacheError(operation, error),
  
  CACHE_INVALIDATION_FAILED: (operation: string, error: Error) =>
    new PermissionCacheError(operation, error),
};
