/**
 * Permission Helper Utilities
 * 
 * Provides utility functions for conditional and combined permission checking.
 * These helpers simplify complex permission logic throughout the application.
 * 
 * @module utils/permission-helpers
 * 
 * @example
 * ```typescript
 * import { permitIf, permitAny, permitAll } from '@/lib/utils/permission-helpers';
 * import { PERMISSIONS } from '@/lib/constants/permissions';
 * 
 * // Check permission only if condition is met
 * const canEdit = await permitIf(
 *   isOwner,
 *   PERMISSIONS.CONTENT_EDIT_OWN,
 *   userId
 * );
 * 
 * // Check if user has any of several permissions
 * const canView = await permitAny(
 *   [PERMISSIONS.CONTENT_VIEW_OWN, PERMISSIONS.CONTENT_VIEW_ALL],
 *   userId
 * );
 * 
 * // Check if user has all required permissions
 * const canPublish = await permitAll(
 *   [PERMISSIONS.CONTENT_EDIT, PERMISSIONS.CONTENT_PUBLISH],
 *   userId
 * );
 * ```
 */

import { Permission } from '@/lib/constants/permissions';
import { PermissionService } from '@/lib/services/permission.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';

// Initialize services
const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * Condition function type
 * Can be a boolean value or a function that returns boolean or Promise<boolean>
 */
type Condition = boolean | (() => boolean | Promise<boolean>);

/**
 * User identifier type
 * Can be a user ID string or a user object with an id property
 */
type UserIdentifier = string | { id: string; [key: string]: any };

/**
 * Extract user ID from various input formats
 */
function extractUserId(user: UserIdentifier): string {
  return typeof user === 'string' ? user : user.id;
}

/**
 * Evaluate a condition (boolean or function)
 */
async function evaluateCondition(condition: Condition): Promise<boolean> {
  if (typeof condition === 'boolean') {
    return condition;
  }
  
  if (typeof condition === 'function') {
    return await Promise.resolve(condition());
  }
  
  return false;
}

/**
 * Permit If - Conditional Permission Check
 * 
 * Checks a permission only if a condition is met.
 * If the condition is false, returns false immediately without checking the permission.
 * If the condition is true, checks if the user has the specified permission.
 * 
 * This is useful for scenarios where permissions should only be checked under certain conditions,
 * such as checking edit permissions only if the user owns the resource.
 * 
 * @param condition - Boolean value or function that evaluates to boolean
 * @param permission - Permission to check if condition is true
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if condition is true AND user has permission
 * 
 * @example
 * ```typescript
 * // Only check edit permission if user owns the resource
 * const isOwner = resource.ownerId === userId;
 * const canEdit = await permitIf(
 *   isOwner,
 *   PERMISSIONS.CONTENT_EDIT_OWN,
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Use async condition function
 * const canDelete = await permitIf(
 *   async () => await isResourceOwner(resourceId, userId),
 *   PERMISSIONS.CONTENT_DELETE_OWN,
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Check admin permission only during business hours
 * const canApprove = await permitIf(
 *   () => isBusinessHours(),
 *   PERMISSIONS.CONTENT_APPROVE,
 *   userId
 * );
 * ```
 */
export async function permitIf(
  condition: Condition,
  permission: Permission,
  user: UserIdentifier
): Promise<boolean> {
  try {
    // Step 1: Evaluate the condition
    const conditionMet = await evaluateCondition(condition);
    
    // Step 2: If condition is false, short-circuit and return false
    if (!conditionMet) {
      return false;
    }
    
    // Step 3: Condition is true, check the permission
    const userId = extractUserId(user);
    return await permissionService.hasPermission(userId, permission);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitIf:', error);
    // Fail closed - return false on errors
    return false;
  }
}

/**
 * Permit Any - OR Permission Check
 * 
 * Checks if user has at least one of the specified permissions.
 * Returns true as soon as any permission check succeeds (short-circuit evaluation).
 * Returns false if user has none of the permissions.
 * 
 * This implements OR logic for permission checking, useful when multiple
 * permissions could grant access to the same resource or action.
 * 
 * @param permissions - Array of permissions to check (OR logic)
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if user has any of the permissions
 * 
 * @example
 * ```typescript
 * // User can view if they have either own or all permission
 * const canView = await permitAny(
 *   [PERMISSIONS.PROJECTS_VIEW_OWN, PERMISSIONS.PROJECTS_VIEW_ALL],
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Multiple admin permissions that grant access
 * const canManageUsers = await permitAny(
 *   [
 *     PERMISSIONS.USERS_MANAGE,
 *     PERMISSIONS.ADMIN_FULL_ACCESS,
 *     PERMISSIONS.USERS_VIEW_ALL
 *   ],
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Empty array returns false (fail closed)
 * const result = await permitAny([], userId); // false
 * ```
 */
export async function permitAny(
  permissions: Permission[],
  user: UserIdentifier
): Promise<boolean> {
  try {
    // Handle empty permissions array - fail closed
    if (!permissions || permissions.length === 0) {
      return false;
    }
    
    // Use the permission service's built-in hasAnyPermission method
    const userId = extractUserId(user);
    return await permissionService.hasAnyPermission(userId, permissions);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitAny:', error);
    // Fail closed - return false on errors
    return false;
  }
}

/**
 * Permit All - AND Permission Check
 * 
 * Checks if user has all of the specified permissions.
 * Returns false as soon as any permission check fails (short-circuit evaluation).
 * Returns true only if user has every single permission.
 * 
 * This implements AND logic for permission checking, useful when multiple
 * permissions are required to perform a single action.
 * 
 * @param permissions - Array of permissions to check (AND logic)
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if user has all of the permissions
 * 
 * @example
 * ```typescript
 * // User must have both permissions to process payouts
 * const canProcessPayout = await permitAll(
 *   [PERMISSIONS.PAYOUTS_VIEW_ALL, PERMISSIONS.PAYOUTS_PROCESS],
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Complex approval workflow requiring multiple permissions
 * const canApproveAndPublish = await permitAll(
 *   [
 *     PERMISSIONS.CONTENT_APPROVE,
 *     PERMISSIONS.CONTENT_PUBLISH,
 *     PERMISSIONS.CONTENT_EDIT
 *   ],
 *   userId
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Empty array returns true (vacuous truth)
 * const result = await permitAll([], userId); // true
 * ```
 */
export async function permitAll(
  permissions: Permission[],
  user: UserIdentifier
): Promise<boolean> {
  try {
    // Handle empty permissions array
    // Using vacuous truth: if no permissions are required, return true
    // This matches the logical behavior of "all elements of empty set satisfy condition"
    if (!permissions || permissions.length === 0) {
      return true;
    }
    
    // Use the permission service's built-in hasAllPermissions method
    const userId = extractUserId(user);
    return await permissionService.hasAllPermissions(userId, permissions);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitAll:', error);
    // Fail closed - return false on errors
    return false;
  }
}

/**
 * Permit If Any - Conditional OR Permission Check
 * 
 * Combines permitIf and permitAny: checks if condition is met,
 * and if so, checks if user has any of the specified permissions.
 * 
 * @param condition - Boolean value or function that evaluates to boolean
 * @param permissions - Array of permissions to check if condition is true
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if condition is true AND user has any permission
 * 
 * @example
 * ```typescript
 * const canEditOwn = await permitIfAny(
 *   isOwner,
 *   [PERMISSIONS.CONTENT_EDIT_OWN, PERMISSIONS.CONTENT_EDIT_ALL],
 *   userId
 * );
 * ```
 */
export async function permitIfAny(
  condition: Condition,
  permissions: Permission[],
  user: UserIdentifier
): Promise<boolean> {
  try {
    const conditionMet = await evaluateCondition(condition);
    
    if (!conditionMet) {
      return false;
    }
    
    return await permitAny(permissions, user);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitIfAny:', error);
    return false;
  }
}

/**
 * Permit If All - Conditional AND Permission Check
 * 
 * Combines permitIf and permitAll: checks if condition is met,
 * and if so, checks if user has all of the specified permissions.
 * 
 * @param condition - Boolean value or function that evaluates to boolean
 * @param permissions - Array of permissions to check if condition is true
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if condition is true AND user has all permissions
 * 
 * @example
 * ```typescript
 * const canApproveAndPublish = await permitIfAll(
 *   isDuringBusinessHours,
 *   [PERMISSIONS.CONTENT_APPROVE, PERMISSIONS.CONTENT_PUBLISH],
 *   userId
 * );
 * ```
 */
export async function permitIfAll(
  condition: Condition,
  permissions: Permission[],
  user: UserIdentifier
): Promise<boolean> {
  try {
    const conditionMet = await evaluateCondition(condition);
    
    if (!conditionMet) {
      return false;
    }
    
    return await permitAll(permissions, user);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitIfAll:', error);
    return false;
  }
}

/**
 * Permit Senior If - Conditional Senior Check
 * 
 * Checks if user has senior seniority, but only if condition is met.
 * Similar to permitIf but for seniority instead of permissions.
 * 
 * @param condition - Boolean value or function that evaluates to boolean
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if condition is true AND user is senior
 * 
 * @example
 * ```typescript
 * const canApprove = await permitSeniorIf(
 *   isHighValueTransaction,
 *   userId
 * );
 * ```
 */
export async function permitSeniorIf(
  condition: Condition,
  user: UserIdentifier
): Promise<boolean> {
  try {
    const conditionMet = await evaluateCondition(condition);
    
    if (!conditionMet) {
      return false;
    }
    
    const userId = extractUserId(user);
    return await permissionService.isSenior(userId);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitSeniorIf:', error);
    return false;
  }
}

/**
 * Permit Senior Or Permission - Senior OR Permission Check
 * 
 * Checks if user is either senior OR has the specified permission.
 * Useful for actions that can be performed by seniors or users with specific permissions.
 * 
 * @param permission - Permission to check
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if user is senior OR has permission
 * 
 * @example
 * ```typescript
 * // Allow if user is senior or has specific permission
 * const canApprove = await permitSeniorOrPermission(
 *   PERMISSIONS.CONTENT_APPROVE,
 *   userId
 * );
 * ```
 */
export async function permitSeniorOrPermission(
  permission: Permission,
  user: UserIdentifier
): Promise<boolean> {
  try {
    const userId = extractUserId(user);
    
    // Check senior status
    const isSenior = await permissionService.isSenior(userId);
    if (isSenior) {
      return true;
    }
    
    // Check permission
    return await permissionService.hasPermission(userId, permission);
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitSeniorOrPermission:', error);
    return false;
  }
}

/**
 * Permit Senior And Permission - Senior AND Permission Check
 * 
 * Checks if user is both senior AND has the specified permission.
 * Useful for highly restricted actions requiring both senior status and specific permissions.
 * 
 * @param permission - Permission to check
 * @param user - User ID or user object
 * @returns Promise<boolean> - True if user is senior AND has permission
 * 
 * @example
 * ```typescript
 * // Require both senior status and permission
 * const canDeleteAll = await permitSeniorAndPermission(
 *   PERMISSIONS.USERS_DELETE_USER,
 *   userId
 * );
 * ```
 */
export async function permitSeniorAndPermission(
  permission: Permission,
  user: UserIdentifier
): Promise<boolean> {
  try {
    const userId = extractUserId(user);
    
    // Both checks must pass
    const [isSenior, hasPermission] = await Promise.all([
      permissionService.isSenior(userId),
      permissionService.hasPermission(userId, permission),
    ]);
    
    return isSenior && hasPermission;
    
  } catch (error) {
    console.error('[PermissionHelpers] Error in permitSeniorAndPermission:', error);
    return false;
  }
}

/**
 * Export the permission service instance for advanced use cases
 */
export { permissionService };
