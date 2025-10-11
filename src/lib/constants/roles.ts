/**
 * Role Constants and Utilities
 * Centralizes role definitions and provides type-safe role checking utilities
 */

import { UserRole } from '@prisma/client';

/**
 * Role Constants Object
 * Maps to Prisma UserRole enum for type safety
 */
export const ROLES = {
  ADMIN: 'ADMIN' as UserRole,
  CREATOR: 'CREATOR' as UserRole,
  BRAND: 'BRAND' as UserRole,
  VIEWER: 'VIEWER' as UserRole,
} as const;

/**
 * Default role for new user registrations
 */
export const DEFAULT_ROLE: UserRole = ROLES.VIEWER;

/**
 * Role Descriptions
 * Human-readable descriptions for each role
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: 'Platform administrator with full access to all features and data',
  CREATOR: 'Content creator who owns IP assets and earns royalties from licensing',
  BRAND: 'Brand/company that licenses IP assets for campaigns and projects',
  VIEWER: 'Basic user with limited read-only access to public content',
};

/**
 * Role Hierarchy Levels
 * Lower numbers = higher privilege
 * Used for role comparison operations
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 0,
  CREATOR: 1,
  BRAND: 1,
  VIEWER: 2,
};

/**
 * Role Display Names
 * User-friendly names for display purposes
 */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  CREATOR: 'Creator',
  BRAND: 'Brand',
  VIEWER: 'Viewer',
};

/**
 * Valid Role Transitions
 * Maps current role to allowed next roles
 */
export const VALID_ROLE_TRANSITIONS: Record<UserRole, UserRole[]> = {
  VIEWER: [ROLES.CREATOR, ROLES.BRAND, ROLES.ADMIN],
  CREATOR: [ROLES.VIEWER, ROLES.ADMIN],
  BRAND: [ROLES.VIEWER, ROLES.ADMIN],
  ADMIN: [], // Admin role cannot be changed (only manually by another admin)
};

/**
 * Type Guards and Helper Functions
 */

/**
 * Check if a value is a valid UserRole
 */
export function isValidRole(role: string): role is UserRole {
  return Object.values(ROLES).includes(role as UserRole);
}

/**
 * Check if user has ADMIN role
 */
export function isAdmin(role: UserRole): boolean {
  return role === ROLES.ADMIN;
}

/**
 * Check if user has CREATOR role
 */
export function isCreator(role: UserRole): boolean {
  return role === ROLES.CREATOR;
}

/**
 * Check if user has BRAND role
 */
export function isBrand(role: UserRole): boolean {
  return role === ROLES.BRAND;
}

/**
 * Check if user has VIEWER role
 */
export function isViewer(role: UserRole): boolean {
  return role === ROLES.VIEWER;
}

/**
 * Check if a role has minimum privilege level
 * Returns true if userRole has equal or higher privilege than minimumRole
 */
export function hasMinimumRoleLevel(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[minimumRole];
}

/**
 * Check if a role transition is valid
 */
export function isValidRoleTransition(currentRole: UserRole, newRole: UserRole): boolean {
  if (currentRole === newRole) {
    return false; // Cannot transition to same role
  }
  return VALID_ROLE_TRANSITIONS[currentRole].includes(newRole);
}

/**
 * Get all roles as an array
 */
export function getAllRoles(): UserRole[] {
  return Object.values(ROLES);
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  return ROLE_DESCRIPTIONS[role];
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  return ROLE_DISPLAY_NAMES[role];
}

/**
 * Get available transitions for a role
 */
export function getAvailableTransitions(role: UserRole): UserRole[] {
  return VALID_ROLE_TRANSITIONS[role];
}
