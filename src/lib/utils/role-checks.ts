/**
 * Role Checking Utilities
 * Reusable functions for role-based access control throughout the application
 */

import type { Session } from 'next-auth';
import { UserRole } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { ROLE_HIERARCHY, getRoleDisplayName } from '@/lib/constants/roles';

/**
 * Require user to have one of the specified roles
 * Throws FORBIDDEN error if user doesn't have required role
 * 
 * @param session - Next-auth session object
 * @param allowedRoles - Array of roles that are allowed
 * @throws TRPCError with code 'FORBIDDEN' if role check fails
 */
export function requireRole(session: Session | null, allowedRoles: UserRole[]): void {
  if (!session || !session.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const userRole = session.user.role as UserRole;
  
  if (!allowedRoles.includes(userRole)) {
    const allowedRoleNames = allowedRoles.map(getRoleDisplayName).join(', ');
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `This action requires one of the following roles: ${allowedRoleNames}`,
    });
  }
}

/**
 * Check if user has a specific role
 * Returns boolean instead of throwing error
 * 
 * @param session - Next-auth session object
 * @param role - Role to check for
 * @returns true if user has the role, false otherwise
 */
export function hasRole(session: Session | null, role: UserRole): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  return (session.user.role as UserRole) === role;
}

/**
 * Check if user has any of the specified roles
 * 
 * @param session - Next-auth session object
 * @param roles - Array of roles to check
 * @returns true if user has at least one of the roles
 */
export function hasAnyRole(session: Session | null, roles: UserRole[]): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  const userRole = session.user.role as UserRole;
  return roles.includes(userRole);
}

/**
 * Check if user has minimum required role level
 * Uses role hierarchy (ADMIN > CREATOR/BRAND > VIEWER)
 * 
 * @param session - Next-auth session object
 * @param minimumRole - Minimum role required
 * @returns true if user has equal or higher privilege level
 */
export function hasMinimumRole(session: Session | null, minimumRole: UserRole): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  const userRole = session.user.role as UserRole;
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[minimumRole];
}

/**
 * Require user to own a resource OR be an admin
 * Common pattern for checking if user can access/modify a resource
 * 
 * @param userId - Current user's ID
 * @param resourceOwnerId - ID of the resource owner
 * @param userRole - Current user's role
 * @throws TRPCError with code 'FORBIDDEN' if user doesn't own resource and isn't admin
 */
export function requireOwnership(
  userId: string,
  resourceOwnerId: string,
  userRole: UserRole
): void {
  const isOwner = userId === resourceOwnerId;
  const isAdmin = userRole === 'ADMIN';
  
  if (!isOwner && !isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this resource',
    });
  }
}

/**
 * Check if user owns a resource OR is an admin (returns boolean)
 * 
 * @param userId - Current user's ID
 * @param resourceOwnerId - ID of the resource owner
 * @param userRole - Current user's role
 * @returns true if user owns resource or is admin
 */
export function canAccessResource(
  userId: string,
  resourceOwnerId: string,
  userRole: UserRole
): boolean {
  return userId === resourceOwnerId || userRole === 'ADMIN';
}

/**
 * Require user to be authenticated
 * Simpler version when you only need to check authentication, not role
 * 
 * @param session - Next-auth session object
 * @throws TRPCError with code 'UNAUTHORIZED' if not authenticated
 */
export function requireAuth(session: Session | null): void {
  if (!session || !session.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
}

/**
 * Check if user is authenticated (returns boolean)
 * 
 * @param session - Next-auth session object
 * @returns true if user is authenticated
 */
export function isAuthenticated(session: Session | null): boolean {
  return !!session && !!session.user;
}

/**
 * Check if user is an admin (convenience function)
 * 
 * @param session - Next-auth session object
 * @returns true if user has ADMIN role
 */
export function isAdmin(session: Session | null): boolean {
  return hasRole(session, 'ADMIN');
}

/**
 * Check if user is a creator (convenience function)
 * 
 * @param session - Next-auth session object
 * @returns true if user has CREATOR role
 */
export function isCreator(session: Session | null): boolean {
  return hasRole(session, 'CREATOR');
}

/**
 * Check if user is a brand (convenience function)
 * 
 * @param session - Next-auth session object
 * @returns true if user has BRAND role
 */
export function isBrand(session: Session | null): boolean {
  return hasRole(session, 'BRAND');
}

/**
 * Check if user is a viewer (convenience function)
 * 
 * @param session - Next-auth session object
 * @returns true if user has VIEWER role
 */
export function isViewer(session: Session | null): boolean {
  return hasRole(session, 'VIEWER');
}

/**
 * Get user's role from session (with type safety)
 * 
 * @param session - Next-auth session object
 * @returns UserRole or null if not authenticated
 */
export function getUserRole(session: Session | null): UserRole | null {
  if (!session || !session.user) {
    return null;
  }
  
  return session.user.role as UserRole;
}
