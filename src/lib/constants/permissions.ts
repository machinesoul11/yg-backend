/**
 * Permission System Constants
 * Defines all platform permissions and role-to-permission mappings
 * 
 * Permission Naming Convention: RESOURCE_ACTION_SCOPE
 * - RESOURCE: The entity being acted upon (USERS, PROJECTS, etc.)
 * - ACTION: The operation (VIEW, CREATE, EDIT, DELETE, etc.)
 * - SCOPE: ALL (any resource), OWN (user's resources), or specific scope
 */

import { UserRole } from '@prisma/client';

/**
 * Permission Categories
 * Organized by functional area with hierarchical structure
 */
export const PERMISSIONS = {
  // User Management
  USERS_VIEW_ALL: 'users.view_all',
  USERS_VIEW_OWN: 'users.view_own',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_EDIT_OWN: 'users.edit_own',
  USERS_DELETE: 'users.delete',
  USERS_CHANGE_ROLE: 'users.change_role',
  USERS_VIEW_SENSITIVE: 'users.view_sensitive',
  USERS_MANAGE_PERMISSIONS: 'users.manage_permissions',

  // Creator Management
  CREATORS_VIEW_ALL: 'creators.view_all',
  CREATORS_VIEW_OWN: 'creators.view_own',
  CREATORS_VIEW_PUBLIC: 'creators.view_public',
  CREATORS_APPROVE: 'creators.approve',
  CREATORS_REJECT: 'creators.reject',
  CREATORS_VIEW_SENSITIVE: 'creators.view_sensitive',
  CREATORS_EDIT_OWN: 'creators.edit_own',
  CREATORS_EDIT_ALL: 'creators.edit_all',
  CREATORS_VIEW_FINANCIAL: 'creators.view_financial',

  // Brand Management
  BRANDS_VIEW_ALL: 'brands.view_all',
  BRANDS_VIEW_OWN: 'brands.view_own',
  BRANDS_VIEW_PUBLIC: 'brands.view_public',
  BRANDS_VERIFY: 'brands.verify',
  BRANDS_REJECT: 'brands.reject',
  BRANDS_VIEW_SENSITIVE: 'brands.view_sensitive',
  BRANDS_EDIT_OWN: 'brands.edit_own',
  BRANDS_EDIT_ALL: 'brands.edit_all',
  BRANDS_VIEW_FINANCIAL: 'brands.view_financial',

  // IP Assets
  IP_ASSETS_VIEW_ALL: 'ip_assets.view_all',
  IP_ASSETS_VIEW_OWN: 'ip_assets.view_own',
  IP_ASSETS_VIEW_PUBLIC: 'ip_assets.view_public',
  IP_ASSETS_CREATE: 'ip_assets.create',
  IP_ASSETS_EDIT_OWN: 'ip_assets.edit_own',
  IP_ASSETS_EDIT_ALL: 'ip_assets.edit_all',
  IP_ASSETS_DELETE_OWN: 'ip_assets.delete_own',
  IP_ASSETS_DELETE_ALL: 'ip_assets.delete_all',
  IP_ASSETS_TRANSFER_OWNERSHIP: 'ip_assets.transfer_ownership',
  IP_ASSETS_APPROVE: 'ip_assets.approve',
  IP_ASSETS_PUBLISH: 'ip_assets.publish',
  IP_ASSETS_VIEW_METADATA: 'ip_assets.view_metadata',

  // Licenses
  LICENSES_VIEW_ALL: 'licenses.view_all',
  LICENSES_VIEW_OWN: 'licenses.view_own',
  LICENSES_CREATE: 'licenses.create',
  LICENSES_EDIT_OWN: 'licenses.edit_own',
  LICENSES_EDIT_ALL: 'licenses.edit_all',
  LICENSES_APPROVE: 'licenses.approve',
  LICENSES_TERMINATE_OWN: 'licenses.terminate_own',
  LICENSES_TERMINATE_ALL: 'licenses.terminate_all',
  LICENSES_VIEW_TERMS: 'licenses.view_terms',
  LICENSES_VIEW_FINANCIAL: 'licenses.view_financial',

  // Royalties
  ROYALTIES_VIEW_ALL: 'royalties.view_all',
  ROYALTIES_VIEW_OWN: 'royalties.view_own',
  ROYALTIES_RUN: 'royalties.run',
  ROYALTIES_EDIT: 'royalties.edit',
  ROYALTIES_VIEW_STATEMENTS: 'royalties.view_statements',
  ROYALTIES_DISPUTE: 'royalties.dispute',
  ROYALTIES_APPROVE_DISPUTE: 'royalties.approve_dispute',

  // Payouts
  PAYOUTS_VIEW_ALL: 'payouts.view_all',
  PAYOUTS_VIEW_OWN: 'payouts.view_own',
  PAYOUTS_PROCESS: 'payouts.process',
  PAYOUTS_APPROVE: 'payouts.approve',
  PAYOUTS_RETRY: 'payouts.retry',

  // Projects
  PROJECTS_VIEW_ALL: 'projects.view_all',
  PROJECTS_VIEW_OWN: 'projects.view_own',
  PROJECTS_VIEW_PUBLIC: 'projects.view_public',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_EDIT_OWN: 'projects.edit_own',
  PROJECTS_EDIT_ALL: 'projects.edit_all',
  PROJECTS_DELETE_OWN: 'projects.delete_own',
  PROJECTS_DELETE_ALL: 'projects.delete_all',
  PROJECTS_ARCHIVE: 'projects.archive',

  // Analytics
  ANALYTICS_VIEW_PLATFORM: 'analytics.view_platform',
  ANALYTICS_VIEW_OWN: 'analytics.view_own',
  ANALYTICS_VIEW_FINANCIAL: 'analytics.view_financial',
  ANALYTICS_EXPORT: 'analytics.export',

  // Audit Logs
  AUDIT_VIEW_ALL: 'audit.view_all',
  AUDIT_VIEW_OWN: 'audit.view_own',
  AUDIT_EXPORT: 'audit.export',

  // System
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_FEATURE_FLAGS: 'system.feature_flags',
  SYSTEM_MAINTENANCE: 'system.maintenance',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Permission Hierarchy - Higher-level permissions imply lower-level ones
 * Used for permission inheritance logic
 */
export const PERMISSION_HIERARCHY: Record<string, Permission[]> = {
  // User permissions hierarchy
  [PERMISSIONS.USERS_EDIT]: [PERMISSIONS.USERS_VIEW_ALL, PERMISSIONS.USERS_VIEW_OWN],
  [PERMISSIONS.USERS_EDIT_OWN]: [PERMISSIONS.USERS_VIEW_OWN],
  [PERMISSIONS.USERS_DELETE]: [PERMISSIONS.USERS_VIEW_ALL, PERMISSIONS.USERS_EDIT],
  
  // Creator permissions hierarchy
  [PERMISSIONS.CREATORS_EDIT_ALL]: [PERMISSIONS.CREATORS_VIEW_ALL, PERMISSIONS.CREATORS_VIEW_OWN],
  [PERMISSIONS.CREATORS_EDIT_OWN]: [PERMISSIONS.CREATORS_VIEW_OWN],
  [PERMISSIONS.CREATORS_VIEW_SENSITIVE]: [PERMISSIONS.CREATORS_VIEW_OWN],
  
  // Brand permissions hierarchy
  [PERMISSIONS.BRANDS_EDIT_ALL]: [PERMISSIONS.BRANDS_VIEW_ALL, PERMISSIONS.BRANDS_VIEW_OWN],
  [PERMISSIONS.BRANDS_EDIT_OWN]: [PERMISSIONS.BRANDS_VIEW_OWN],
  [PERMISSIONS.BRANDS_VIEW_SENSITIVE]: [PERMISSIONS.BRANDS_VIEW_OWN],
  
  // IP Asset permissions hierarchy
  [PERMISSIONS.IP_ASSETS_EDIT_ALL]: [PERMISSIONS.IP_ASSETS_VIEW_ALL],
  [PERMISSIONS.IP_ASSETS_EDIT_OWN]: [PERMISSIONS.IP_ASSETS_VIEW_OWN],
  [PERMISSIONS.IP_ASSETS_DELETE_ALL]: [PERMISSIONS.IP_ASSETS_VIEW_ALL, PERMISSIONS.IP_ASSETS_EDIT_ALL],
  [PERMISSIONS.IP_ASSETS_DELETE_OWN]: [PERMISSIONS.IP_ASSETS_VIEW_OWN, PERMISSIONS.IP_ASSETS_EDIT_OWN],
  
  // License permissions hierarchy
  [PERMISSIONS.LICENSES_EDIT_ALL]: [PERMISSIONS.LICENSES_VIEW_ALL],
  [PERMISSIONS.LICENSES_EDIT_OWN]: [PERMISSIONS.LICENSES_VIEW_OWN],
  [PERMISSIONS.LICENSES_TERMINATE_ALL]: [PERMISSIONS.LICENSES_VIEW_ALL],
  [PERMISSIONS.LICENSES_TERMINATE_OWN]: [PERMISSIONS.LICENSES_VIEW_OWN],
  
  // Project permissions hierarchy
  [PERMISSIONS.PROJECTS_EDIT_ALL]: [PERMISSIONS.PROJECTS_VIEW_ALL],
  [PERMISSIONS.PROJECTS_EDIT_OWN]: [PERMISSIONS.PROJECTS_VIEW_OWN],
  [PERMISSIONS.PROJECTS_DELETE_ALL]: [PERMISSIONS.PROJECTS_VIEW_ALL, PERMISSIONS.PROJECTS_EDIT_ALL],
  [PERMISSIONS.PROJECTS_DELETE_OWN]: [PERMISSIONS.PROJECTS_VIEW_OWN, PERMISSIONS.PROJECTS_EDIT_OWN],
  
  // Royalty permissions hierarchy
  [PERMISSIONS.ROYALTIES_EDIT]: [PERMISSIONS.ROYALTIES_VIEW_ALL],
  [PERMISSIONS.ROYALTIES_RUN]: [PERMISSIONS.ROYALTIES_VIEW_ALL],
};

/**
 * Role-to-Permission Mapping
 * Defines which permissions each role has
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  /**
   * ADMIN - Full access to all permissions
   */
  ADMIN: Object.values(PERMISSIONS),

  /**
   * CREATOR - Content creator permissions
   * Can manage own assets, view royalties, approve licenses
   */
  CREATOR: [
    // Creator profile
    PERMISSIONS.CREATORS_VIEW_OWN,
    PERMISSIONS.CREATORS_VIEW_PUBLIC,
    PERMISSIONS.CREATORS_EDIT_OWN,

    // IP Assets (own)
    PERMISSIONS.IP_ASSETS_VIEW_OWN,
    PERMISSIONS.IP_ASSETS_VIEW_PUBLIC,
    PERMISSIONS.IP_ASSETS_CREATE,
    PERMISSIONS.IP_ASSETS_EDIT_OWN,
    PERMISSIONS.IP_ASSETS_DELETE_OWN,
    PERMISSIONS.IP_ASSETS_TRANSFER_OWNERSHIP,

    // Licenses (for own assets)
    PERMISSIONS.LICENSES_VIEW_OWN,
    PERMISSIONS.LICENSES_APPROVE,
    PERMISSIONS.LICENSES_VIEW_TERMS,
    PERMISSIONS.LICENSES_VIEW_FINANCIAL,

    // Royalties (own)
    PERMISSIONS.ROYALTIES_VIEW_OWN,
    PERMISSIONS.ROYALTIES_VIEW_STATEMENTS,
    PERMISSIONS.ROYALTIES_DISPUTE,

    // Payouts (own)
    PERMISSIONS.PAYOUTS_VIEW_OWN,

    // Analytics (own)
    PERMISSIONS.ANALYTICS_VIEW_OWN,

    // Audit (own)
    PERMISSIONS.AUDIT_VIEW_OWN,

    // Public viewing
    PERMISSIONS.BRANDS_VIEW_OWN,
    PERMISSIONS.BRANDS_VIEW_PUBLIC,
    PERMISSIONS.PROJECTS_VIEW_PUBLIC,

    // Users (own)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,
  ],

  /**
   * BRAND - Brand/company permissions
   * Can create projects, propose licenses, manage team
   */
  BRAND: [
    // Brand profile
    PERMISSIONS.BRANDS_VIEW_OWN,
    PERMISSIONS.BRANDS_VIEW_PUBLIC,
    PERMISSIONS.BRANDS_EDIT_OWN,

    // Projects (own)
    PERMISSIONS.PROJECTS_VIEW_OWN,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_EDIT_OWN,
    PERMISSIONS.PROJECTS_DELETE_OWN,

    // Licenses (own brand)
    PERMISSIONS.LICENSES_VIEW_OWN,
    PERMISSIONS.LICENSES_CREATE,
    PERMISSIONS.LICENSES_EDIT_OWN,
    PERMISSIONS.LICENSES_TERMINATE_OWN,
    PERMISSIONS.LICENSES_VIEW_TERMS,

    // Analytics (own)
    PERMISSIONS.ANALYTICS_VIEW_OWN,

    // Audit (own)
    PERMISSIONS.AUDIT_VIEW_OWN,

    // Public viewing
    PERMISSIONS.IP_ASSETS_VIEW_PUBLIC,
    PERMISSIONS.CREATORS_VIEW_OWN,
    PERMISSIONS.CREATORS_VIEW_PUBLIC,
    PERMISSIONS.PROJECTS_VIEW_PUBLIC,

    // Users (own)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,
  ],

  /**
   * VIEWER - Basic read-only permissions
   * Can only view public content
   */
  VIEWER: [
    PERMISSIONS.IP_ASSETS_VIEW_PUBLIC,
    PERMISSIONS.PROJECTS_VIEW_PUBLIC,
    PERMISSIONS.CREATORS_VIEW_OWN,
    PERMISSIONS.CREATORS_VIEW_PUBLIC,
    PERMISSIONS.BRANDS_VIEW_OWN,
    PERMISSIONS.BRANDS_VIEW_PUBLIC,
    PERMISSIONS.USERS_VIEW_OWN,
  ],
};

/**
 * Get all permissions for a role, including inherited permissions
 * @param role - User role
 * @returns Array of permissions with inherited permissions included
 */
export function getRolePermissions(role: UserRole): Permission[] {
  const basePermissions = ROLE_PERMISSIONS[role] || [];
  const allPermissions = new Set<Permission>(basePermissions);
  
  // Add inherited permissions based on hierarchy
  basePermissions.forEach(permission => {
    const inherited = PERMISSION_HIERARCHY[permission];
    if (inherited) {
      inherited.forEach(p => allPermissions.add(p));
    }
  });
  
  return Array.from(allPermissions);
}

/**
 * Check if a role has a specific permission (with hierarchy support)
 * @param role - User role
 * @param permission - Permission to check
 * @returns true if role has the permission
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns true if role has at least one permission
 */
export function roleHasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.some(p => rolePermissions.includes(p));
}

/**
 * Check if a role has all of the specified permissions
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns true if role has all permissions
 */
export function roleHasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.every(p => rolePermissions.includes(p));
}

/**
 * Get permissions by category
 * @param category - Permission category (e.g., 'users', 'creators')
 * @returns Array of permissions in that category
 */
export function getPermissionsByCategory(category: string): Permission[] {
  const prefix = `${category}.`;
  return Object.values(PERMISSIONS).filter(p => p.startsWith(prefix));
}

/**
 * Expand a permission to include all implied permissions from hierarchy
 * @param permission - Base permission
 * @returns Array including the permission and all implied permissions
 */
export function expandPermission(permission: Permission): Permission[] {
  const expanded = new Set<Permission>([permission]);
  const implied = PERMISSION_HIERARCHY[permission];
  
  if (implied) {
    implied.forEach(p => {
      expanded.add(p);
      // Recursively expand implied permissions
      expandPermission(p).forEach(ep => expanded.add(ep));
    });
  }
  
  return Array.from(expanded);
}

/**
 * Permission descriptions for UI display
 */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  // Users
  [PERMISSIONS.USERS_VIEW_ALL]: 'View all user accounts',
  [PERMISSIONS.USERS_VIEW_OWN]: 'View own user account',
  [PERMISSIONS.USERS_CREATE]: 'Create new user accounts',
  [PERMISSIONS.USERS_EDIT]: 'Edit any user account information',
  [PERMISSIONS.USERS_EDIT_OWN]: 'Edit own user account information',
  [PERMISSIONS.USERS_DELETE]: 'Delete user accounts',
  [PERMISSIONS.USERS_CHANGE_ROLE]: 'Change user roles',
  [PERMISSIONS.USERS_VIEW_SENSITIVE]: 'View sensitive user data (emails, addresses)',
  [PERMISSIONS.USERS_MANAGE_PERMISSIONS]: 'Manage user permissions',

  // Creators
  [PERMISSIONS.CREATORS_VIEW_ALL]: 'View all creator profiles',
  [PERMISSIONS.CREATORS_VIEW_OWN]: 'View own creator profile',
  [PERMISSIONS.CREATORS_VIEW_PUBLIC]: 'View public creator profiles',
  [PERMISSIONS.CREATORS_APPROVE]: 'Approve creator verification requests',
  [PERMISSIONS.CREATORS_REJECT]: 'Reject creator verification requests',
  [PERMISSIONS.CREATORS_VIEW_SENSITIVE]: 'View sensitive creator data (bank info, earnings)',
  [PERMISSIONS.CREATORS_EDIT_OWN]: 'Edit own creator profile',
  [PERMISSIONS.CREATORS_EDIT_ALL]: 'Edit any creator profile',
  [PERMISSIONS.CREATORS_VIEW_FINANCIAL]: 'View creator financial information',

  // Brands
  [PERMISSIONS.BRANDS_VIEW_ALL]: 'View all brand profiles',
  [PERMISSIONS.BRANDS_VIEW_OWN]: 'View own brand profile',
  [PERMISSIONS.BRANDS_VIEW_PUBLIC]: 'View public brand profiles',
  [PERMISSIONS.BRANDS_VERIFY]: 'Verify brand accounts',
  [PERMISSIONS.BRANDS_REJECT]: 'Reject brand verification',
  [PERMISSIONS.BRANDS_VIEW_SENSITIVE]: 'View sensitive brand data (billing info)',
  [PERMISSIONS.BRANDS_EDIT_OWN]: 'Edit own brand profile',
  [PERMISSIONS.BRANDS_EDIT_ALL]: 'Edit any brand profile',
  [PERMISSIONS.BRANDS_VIEW_FINANCIAL]: 'View brand financial information',

  // IP Assets
  [PERMISSIONS.IP_ASSETS_VIEW_ALL]: 'View all IP assets',
  [PERMISSIONS.IP_ASSETS_VIEW_OWN]: 'View own IP assets',
  [PERMISSIONS.IP_ASSETS_VIEW_PUBLIC]: 'View public IP assets',
  [PERMISSIONS.IP_ASSETS_CREATE]: 'Upload new IP assets',
  [PERMISSIONS.IP_ASSETS_EDIT_OWN]: 'Edit own IP assets',
  [PERMISSIONS.IP_ASSETS_EDIT_ALL]: 'Edit any IP asset',
  [PERMISSIONS.IP_ASSETS_DELETE_OWN]: 'Delete own IP assets',
  [PERMISSIONS.IP_ASSETS_DELETE_ALL]: 'Delete any IP asset',
  [PERMISSIONS.IP_ASSETS_TRANSFER_OWNERSHIP]: 'Transfer IP asset ownership',
  [PERMISSIONS.IP_ASSETS_APPROVE]: 'Approve IP assets for publication',
  [PERMISSIONS.IP_ASSETS_PUBLISH]: 'Publish IP assets',
  [PERMISSIONS.IP_ASSETS_VIEW_METADATA]: 'View detailed IP asset metadata',

  // Licenses
  [PERMISSIONS.LICENSES_VIEW_ALL]: 'View all license agreements',
  [PERMISSIONS.LICENSES_VIEW_OWN]: 'View own license agreements',
  [PERMISSIONS.LICENSES_CREATE]: 'Create new license proposals',
  [PERMISSIONS.LICENSES_EDIT_OWN]: 'Edit own license agreements',
  [PERMISSIONS.LICENSES_EDIT_ALL]: 'Edit any license agreement',
  [PERMISSIONS.LICENSES_APPROVE]: 'Approve license agreements',
  [PERMISSIONS.LICENSES_TERMINATE_OWN]: 'Terminate own licenses',
  [PERMISSIONS.LICENSES_TERMINATE_ALL]: 'Terminate any license',
  [PERMISSIONS.LICENSES_VIEW_TERMS]: 'View license terms and conditions',
  [PERMISSIONS.LICENSES_VIEW_FINANCIAL]: 'View license financial terms',

  // Royalties
  [PERMISSIONS.ROYALTIES_VIEW_ALL]: 'View all royalty data',
  [PERMISSIONS.ROYALTIES_VIEW_OWN]: 'View own royalty statements',
  [PERMISSIONS.ROYALTIES_RUN]: 'Execute royalty calculations',
  [PERMISSIONS.ROYALTIES_EDIT]: 'Edit royalty calculations',
  [PERMISSIONS.ROYALTIES_VIEW_STATEMENTS]: 'View royalty statements',
  [PERMISSIONS.ROYALTIES_DISPUTE]: 'Dispute royalty calculations',
  [PERMISSIONS.ROYALTIES_APPROVE_DISPUTE]: 'Approve royalty disputes',

  // Payouts
  [PERMISSIONS.PAYOUTS_VIEW_ALL]: 'View all payout records',
  [PERMISSIONS.PAYOUTS_VIEW_OWN]: 'View own payout records',
  [PERMISSIONS.PAYOUTS_PROCESS]: 'Process payouts',
  [PERMISSIONS.PAYOUTS_APPROVE]: 'Approve payout requests',
  [PERMISSIONS.PAYOUTS_RETRY]: 'Retry failed payouts',

  // Projects
  [PERMISSIONS.PROJECTS_VIEW_ALL]: 'View all projects',
  [PERMISSIONS.PROJECTS_VIEW_OWN]: 'View own projects',
  [PERMISSIONS.PROJECTS_VIEW_PUBLIC]: 'View public projects',
  [PERMISSIONS.PROJECTS_CREATE]: 'Create new projects',
  [PERMISSIONS.PROJECTS_EDIT_OWN]: 'Edit own projects',
  [PERMISSIONS.PROJECTS_EDIT_ALL]: 'Edit any project',
  [PERMISSIONS.PROJECTS_DELETE_OWN]: 'Delete own projects',
  [PERMISSIONS.PROJECTS_DELETE_ALL]: 'Delete any project',
  [PERMISSIONS.PROJECTS_ARCHIVE]: 'Archive projects',

  // Analytics
  [PERMISSIONS.ANALYTICS_VIEW_PLATFORM]: 'View platform-wide analytics',
  [PERMISSIONS.ANALYTICS_VIEW_OWN]: 'View own analytics',
  [PERMISSIONS.ANALYTICS_VIEW_FINANCIAL]: 'View financial analytics',
  [PERMISSIONS.ANALYTICS_EXPORT]: 'Export analytics data',

  // Audit
  [PERMISSIONS.AUDIT_VIEW_ALL]: 'View all audit logs',
  [PERMISSIONS.AUDIT_VIEW_OWN]: 'View own activity logs',
  [PERMISSIONS.AUDIT_EXPORT]: 'Export audit logs',

  // System
  [PERMISSIONS.SYSTEM_SETTINGS]: 'Modify system settings',
  [PERMISSIONS.SYSTEM_FEATURE_FLAGS]: 'Manage feature flags',
  [PERMISSIONS.SYSTEM_MAINTENANCE]: 'Perform maintenance tasks',
};
