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

  // Content Management (Blog & Assets)
  CONTENT_READ: 'content:read',
  CONTENT_CREATE: 'content:create',
  CONTENT_EDIT: 'content:edit',
  CONTENT_APPROVE: 'content:approve',
  CONTENT_DELETE: 'content:delete',
  CONTENT_MODERATE: 'content:moderate',

  // Finance
  FINANCE_VIEW_ALL: 'finance:view_all',
  FINANCE_VIEW_OWN: 'finance:view_own',
  FINANCE_MANAGE_TRANSACTIONS: 'finance:manage_transactions',
  FINANCE_PROCESS_PAYOUTS: 'finance:process_payouts',
  FINANCE_VIEW_REPORTS: 'finance:view_reports',
  FINANCE_GENERATE_REPORTS: 'finance:generate_reports',
  FINANCE_APPROVE_TRANSACTIONS: 'finance:approve_transactions',
  FINANCE_CONFIGURE_SETTINGS: 'finance:configure_settings',
  // Granular Finance Permissions
  FINANCE_VIEW_PAYOUTS: 'finance:view_payouts',
  FINANCE_PROCESS_ROYALTIES: 'finance:process_royalties',
  FINANCE_INITIATE_PAYOUTS: 'finance:initiate_payouts',
  FINANCE_APPROVE_LARGE_PAYOUTS: 'finance:approve_large_payouts',
  FINANCE_EXPORT_DATA: 'finance:export_data',
  FINANCE_VIEW_ANALYTICS: 'finance:view_analytics',

  // Licensing
  LICENSING_VIEW_ALL: 'licensing:view_all',
  LICENSING_VIEW_OWN: 'licensing:view_own',
  LICENSING_CREATE_PROPOSALS: 'licensing:create_proposals',
  LICENSING_REVIEW_PROPOSALS: 'licensing:review_proposals',
  LICENSING_APPROVE_AGREEMENTS: 'licensing:approve_agreements',
  LICENSING_MANAGE_TERMS: 'licensing:manage_terms',
  LICENSING_TERMINATE_AGREEMENTS: 'licensing:terminate_agreements',
  LICENSING_VIEW_FINANCIAL_TERMS: 'licensing:view_financial_terms',
  // Granular Licensing Permissions
  LICENSING_VIEW: 'licensing:view',
  LICENSING_CREATE: 'licensing:create',
  LICENSING_EDIT: 'licensing:edit',
  LICENSING_APPROVE: 'licensing:approve',
  LICENSING_MODIFY_OWNERSHIP: 'licensing:modify_ownership',
  LICENSING_TERMINATE: 'licensing:terminate',
  LICENSING_RENEW: 'licensing:renew',

  // Applications (Creator & Brand)
  APPLICATIONS_VIEW_ALL: 'applications:view_all',
  APPLICATIONS_REVIEW: 'applications:review',
  APPLICATIONS_APPROVE: 'applications:approve',
  APPLICATIONS_REJECT: 'applications:reject',
  APPLICATIONS_REQUEST_INFO: 'applications:request_info',
  APPLICATIONS_MANAGE_WORKFLOW: 'applications:manage_workflow',
  APPLICATIONS_VIEW_SENSITIVE: 'applications:view_sensitive',

  // Creator Application Permissions
  CREATOR_APPLICATION_REVIEW: 'creator:review',
  CREATOR_APPLICATION_APPROVE: 'creator:approve',
  CREATOR_APPLICATION_REJECT: 'creator:reject',
  CREATOR_APPLICATION_VERIFY: 'creator:verify',
  CREATOR_APPLICATION_REQUEST_INFO: 'creator:request_info',

  // Brand Application Permissions
  BRAND_APPLICATION_REVIEW: 'brand:review',
  BRAND_APPLICATION_APPROVE: 'brand:approve',
  BRAND_APPLICATION_REJECT: 'brand:reject',
  BRAND_APPLICATION_VERIFY: 'brand:verify',
  BRAND_APPLICATION_REQUEST_INFO: 'brand:request_info',

  // Users (Admin Management)
  USERS_MANAGE_ROLES: 'users:manage_roles',
  USERS_SUSPEND: 'users:suspend',
  USERS_ACTIVATE: 'users:activate',
  USERS_VIEW_ACTIVITY: 'users:view_activity',
  USERS_MANAGE_2FA: 'users:manage_2fa',

  // User Management Permissions (Granular Admin Controls)
  USERS_VIEW: 'users:view',
  USERS_EDIT_USER: 'users:edit',
  USERS_DELETE_USER: 'users:delete',
  USERS_VIEW_SENSITIVE_DATA: 'users:view_sensitive',
  USERS_IMPERSONATE: 'users:impersonate', // Super Admin only

  // System Permissions
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_FEATURE_FLAGS: 'system.feature_flags',
  SYSTEM_MAINTENANCE: 'system.maintenance',
  SYSTEM_VIEW_LOGS: 'system:view_logs',
  SYSTEM_MANAGE_CACHE: 'system:manage_cache',
  SYSTEM_CONFIGURE_INTEGRATIONS: 'system:configure_integrations',
  SYSTEM_MANAGE_BACKUPS: 'system:manage_backups',
  
  // System Management Permissions (Granular System Controls)
  SYSTEM_SETTINGS_MANAGE: 'system:settings',
  SYSTEM_DEPLOY: 'system:deploy',
  SYSTEM_LOGS: 'system:logs',
  SYSTEM_MONITOR: 'system:monitor',
  SYSTEM_BACKUP: 'system:backup',
  
  // Admin Role Management
  ADMIN_ROLES: 'admin:roles', // Super Admin only
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

  // Content permissions hierarchy
  [PERMISSIONS.CONTENT_DELETE]: [PERMISSIONS.CONTENT_EDIT, PERMISSIONS.CONTENT_READ],
  [PERMISSIONS.CONTENT_EDIT]: [PERMISSIONS.CONTENT_READ],
  [PERMISSIONS.CONTENT_APPROVE]: [PERMISSIONS.CONTENT_READ],
  [PERMISSIONS.CONTENT_MODERATE]: [PERMISSIONS.CONTENT_READ],

  // Finance permissions hierarchy
  [PERMISSIONS.FINANCE_APPROVE_TRANSACTIONS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_PROCESS_PAYOUTS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_GENERATE_REPORTS]: [PERMISSIONS.FINANCE_VIEW_REPORTS],
  [PERMISSIONS.FINANCE_VIEW_REPORTS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_CONFIGURE_SETTINGS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_VIEW_PAYOUTS]: [PERMISSIONS.FINANCE_VIEW_ALL],
  [PERMISSIONS.FINANCE_PROCESS_ROYALTIES]: [PERMISSIONS.FINANCE_VIEW_ALL, PERMISSIONS.FINANCE_VIEW_REPORTS],
  [PERMISSIONS.FINANCE_INITIATE_PAYOUTS]: [PERMISSIONS.FINANCE_VIEW_PAYOUTS, PERMISSIONS.FINANCE_PROCESS_ROYALTIES],
  [PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS]: [PERMISSIONS.FINANCE_VIEW_PAYOUTS, PERMISSIONS.FINANCE_VIEW_REPORTS],
  [PERMISSIONS.FINANCE_EXPORT_DATA]: [PERMISSIONS.FINANCE_VIEW_REPORTS],
  [PERMISSIONS.FINANCE_VIEW_ANALYTICS]: [PERMISSIONS.FINANCE_VIEW_REPORTS],

  // Licensing permissions hierarchy
  [PERMISSIONS.LICENSING_APPROVE_AGREEMENTS]: [PERMISSIONS.LICENSING_VIEW_ALL, PERMISSIONS.LICENSING_REVIEW_PROPOSALS],
  [PERMISSIONS.LICENSING_REVIEW_PROPOSALS]: [PERMISSIONS.LICENSING_VIEW_ALL],
  [PERMISSIONS.LICENSING_TERMINATE_AGREEMENTS]: [PERMISSIONS.LICENSING_VIEW_ALL],
  [PERMISSIONS.LICENSING_MANAGE_TERMS]: [PERMISSIONS.LICENSING_VIEW_ALL],
  [PERMISSIONS.LICENSING_VIEW_FINANCIAL_TERMS]: [PERMISSIONS.LICENSING_VIEW_ALL],
  [PERMISSIONS.LICENSING_CREATE_PROPOSALS]: [PERMISSIONS.LICENSING_VIEW_OWN],
  [PERMISSIONS.LICENSING_VIEW]: [PERMISSIONS.LICENSING_VIEW_ALL],
  [PERMISSIONS.LICENSING_CREATE]: [PERMISSIONS.LICENSING_VIEW],
  [PERMISSIONS.LICENSING_EDIT]: [PERMISSIONS.LICENSING_VIEW],
  [PERMISSIONS.LICENSING_APPROVE]: [PERMISSIONS.LICENSING_VIEW, PERMISSIONS.LICENSING_REVIEW_PROPOSALS],
  [PERMISSIONS.LICENSING_MODIFY_OWNERSHIP]: [PERMISSIONS.LICENSING_VIEW, PERMISSIONS.LICENSING_EDIT],
  [PERMISSIONS.LICENSING_TERMINATE]: [PERMISSIONS.LICENSING_VIEW],
  [PERMISSIONS.LICENSING_RENEW]: [PERMISSIONS.LICENSING_VIEW, PERMISSIONS.LICENSING_EDIT],

  // Applications permissions hierarchy
  [PERMISSIONS.APPLICATIONS_APPROVE]: [PERMISSIONS.APPLICATIONS_REVIEW, PERMISSIONS.APPLICATIONS_VIEW_ALL],
  [PERMISSIONS.APPLICATIONS_REJECT]: [PERMISSIONS.APPLICATIONS_REVIEW, PERMISSIONS.APPLICATIONS_VIEW_ALL],
  [PERMISSIONS.APPLICATIONS_REVIEW]: [PERMISSIONS.APPLICATIONS_VIEW_ALL],
  [PERMISSIONS.APPLICATIONS_REQUEST_INFO]: [PERMISSIONS.APPLICATIONS_REVIEW, PERMISSIONS.APPLICATIONS_VIEW_ALL],
  [PERMISSIONS.APPLICATIONS_MANAGE_WORKFLOW]: [PERMISSIONS.APPLICATIONS_VIEW_ALL],
  [PERMISSIONS.APPLICATIONS_VIEW_SENSITIVE]: [PERMISSIONS.APPLICATIONS_VIEW_ALL],

  // Creator Application permissions hierarchy
  [PERMISSIONS.CREATOR_APPLICATION_APPROVE]: [PERMISSIONS.CREATOR_APPLICATION_REVIEW],
  [PERMISSIONS.CREATOR_APPLICATION_REJECT]: [PERMISSIONS.CREATOR_APPLICATION_REVIEW],
  [PERMISSIONS.CREATOR_APPLICATION_VERIFY]: [PERMISSIONS.CREATOR_APPLICATION_REVIEW],
  [PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO]: [PERMISSIONS.CREATOR_APPLICATION_REVIEW],

  // Brand Application permissions hierarchy
  [PERMISSIONS.BRAND_APPLICATION_APPROVE]: [PERMISSIONS.BRAND_APPLICATION_REVIEW],
  [PERMISSIONS.BRAND_APPLICATION_REJECT]: [PERMISSIONS.BRAND_APPLICATION_REVIEW],
  [PERMISSIONS.BRAND_APPLICATION_VERIFY]: [PERMISSIONS.BRAND_APPLICATION_REVIEW],
  [PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO]: [PERMISSIONS.BRAND_APPLICATION_REVIEW],

  // User management permissions hierarchy
  [PERMISSIONS.USERS_MANAGE_ROLES]: [PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_SUSPEND]: [PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_ACTIVATE]: [PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_VIEW_ACTIVITY]: [PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_MANAGE_2FA]: [PERMISSIONS.USERS_VIEW_ALL],
  
  // Granular user management permissions hierarchy
  [PERMISSIONS.USERS_VIEW]: [PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_EDIT_USER]: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_DELETE_USER]: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_EDIT_USER, PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_VIEW_SENSITIVE_DATA]: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_VIEW_ALL],
  [PERMISSIONS.USERS_IMPERSONATE]: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_VIEW_ALL], // Super Admin only

  // System permissions hierarchy
  [PERMISSIONS.SYSTEM_CONFIGURE_INTEGRATIONS]: [PERMISSIONS.SYSTEM_SETTINGS],
  [PERMISSIONS.SYSTEM_MANAGE_BACKUPS]: [PERMISSIONS.SYSTEM_SETTINGS],
  [PERMISSIONS.SYSTEM_MANAGE_CACHE]: [PERMISSIONS.SYSTEM_VIEW_LOGS],
  
  // Granular system permissions hierarchy
  [PERMISSIONS.SYSTEM_SETTINGS_MANAGE]: [PERMISSIONS.SYSTEM_SETTINGS],
  [PERMISSIONS.SYSTEM_DEPLOY]: [PERMISSIONS.SYSTEM_SETTINGS_MANAGE],
  [PERMISSIONS.SYSTEM_LOGS]: [PERMISSIONS.SYSTEM_VIEW_LOGS],
  [PERMISSIONS.SYSTEM_MONITOR]: [PERMISSIONS.SYSTEM_LOGS, PERMISSIONS.SYSTEM_VIEW_LOGS],
  [PERMISSIONS.SYSTEM_BACKUP]: [PERMISSIONS.SYSTEM_MANAGE_BACKUPS],
  
  // Admin role management hierarchy
  [PERMISSIONS.ADMIN_ROLES]: [PERMISSIONS.USERS_MANAGE_ROLES, PERMISSIONS.USERS_VIEW_ALL], // Super Admin only
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
 * Department-to-Permission Mapping for Admin Roles
 * Maps admin departments to their baseline permissions
 * Individual admin roles can have additional custom permissions via AdminRole.permissions
 */
import type { Department } from '@prisma/client';

export const DEPARTMENT_PERMISSIONS: Record<Department, Permission[]> = {
  /**
   * SUPER_ADMIN - Full system access
   */
  SUPER_ADMIN: Object.values(PERMISSIONS),

  /**
   * CONTENT_MANAGER - Manages blog posts, media assets, and user-generated content
   */
  CONTENT_MANAGER: [
    // Content Management
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_EDIT,
    PERMISSIONS.CONTENT_APPROVE,
    PERMISSIONS.CONTENT_DELETE,
    PERMISSIONS.CONTENT_MODERATE,

    // IP Assets (viewing and management)
    PERMISSIONS.IP_ASSETS_VIEW_ALL,
    PERMISSIONS.IP_ASSETS_APPROVE,
    PERMISSIONS.IP_ASSETS_PUBLISH,

    // Users (limited)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,

    // Audit
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],

  /**
   * FINANCE_LICENSING - Manages financial operations and licensing agreements
   */
  FINANCE_LICENSING: [
    // Finance - All existing permissions
    PERMISSIONS.FINANCE_VIEW_ALL,
    PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS,
    PERMISSIONS.FINANCE_PROCESS_PAYOUTS,
    PERMISSIONS.FINANCE_VIEW_REPORTS,
    PERMISSIONS.FINANCE_GENERATE_REPORTS,
    PERMISSIONS.FINANCE_APPROVE_TRANSACTIONS,
    
    // Finance - New granular permissions
    PERMISSIONS.FINANCE_VIEW_PAYOUTS,
    PERMISSIONS.FINANCE_PROCESS_ROYALTIES,
    PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
    PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS,
    PERMISSIONS.FINANCE_EXPORT_DATA,
    PERMISSIONS.FINANCE_VIEW_ANALYTICS,

    // Licensing - All existing permissions
    PERMISSIONS.LICENSING_VIEW_ALL,
    PERMISSIONS.LICENSING_CREATE_PROPOSALS,
    PERMISSIONS.LICENSING_REVIEW_PROPOSALS,
    PERMISSIONS.LICENSING_APPROVE_AGREEMENTS,
    PERMISSIONS.LICENSING_MANAGE_TERMS,
    PERMISSIONS.LICENSING_TERMINATE_AGREEMENTS,
    PERMISSIONS.LICENSING_VIEW_FINANCIAL_TERMS,
    
    // Licensing - New granular permissions
    PERMISSIONS.LICENSING_VIEW,
    PERMISSIONS.LICENSING_CREATE,
    PERMISSIONS.LICENSING_EDIT,
    PERMISSIONS.LICENSING_APPROVE,
    PERMISSIONS.LICENSING_MODIFY_OWNERSHIP,
    PERMISSIONS.LICENSING_TERMINATE,
    PERMISSIONS.LICENSING_RENEW,

    // Related licenses/royalties
    PERMISSIONS.LICENSES_VIEW_ALL,
    PERMISSIONS.LICENSES_VIEW_FINANCIAL,
    PERMISSIONS.ROYALTIES_VIEW_ALL,
    PERMISSIONS.ROYALTIES_RUN,
    PERMISSIONS.PAYOUTS_VIEW_ALL,
    PERMISSIONS.PAYOUTS_PROCESS,
    PERMISSIONS.PAYOUTS_APPROVE,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW_FINANCIAL,
    PERMISSIONS.ANALYTICS_EXPORT,

    // Users (limited)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,

    // Audit
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],

  /**
   * CREATOR_APPLICATIONS - Reviews and manages creator applications
   */
  CREATOR_APPLICATIONS: [
    // Applications
    PERMISSIONS.APPLICATIONS_VIEW_ALL,
    PERMISSIONS.APPLICATIONS_REVIEW,
    PERMISSIONS.APPLICATIONS_APPROVE,
    PERMISSIONS.APPLICATIONS_REJECT,
    PERMISSIONS.APPLICATIONS_REQUEST_INFO,
    PERMISSIONS.APPLICATIONS_MANAGE_WORKFLOW,
    PERMISSIONS.APPLICATIONS_VIEW_SENSITIVE,

    // Creator-specific Application Permissions
    PERMISSIONS.CREATOR_APPLICATION_REVIEW,
    PERMISSIONS.CREATOR_APPLICATION_APPROVE,
    PERMISSIONS.CREATOR_APPLICATION_REJECT,
    PERMISSIONS.CREATOR_APPLICATION_VERIFY,
    PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO,

    // Creators
    PERMISSIONS.CREATORS_VIEW_ALL,
    PERMISSIONS.CREATORS_APPROVE,
    PERMISSIONS.CREATORS_REJECT,
    PERMISSIONS.CREATORS_VIEW_SENSITIVE,

    // Users (limited)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,

    // Audit
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],

  /**
   * BRAND_APPLICATIONS - Reviews and manages brand applications
   */
  BRAND_APPLICATIONS: [
    // Applications
    PERMISSIONS.APPLICATIONS_VIEW_ALL,
    PERMISSIONS.APPLICATIONS_REVIEW,
    PERMISSIONS.APPLICATIONS_APPROVE,
    PERMISSIONS.APPLICATIONS_REJECT,
    PERMISSIONS.APPLICATIONS_REQUEST_INFO,
    PERMISSIONS.APPLICATIONS_MANAGE_WORKFLOW,
    PERMISSIONS.APPLICATIONS_VIEW_SENSITIVE,

    // Brand-specific Application Permissions
    PERMISSIONS.BRAND_APPLICATION_REVIEW,
    PERMISSIONS.BRAND_APPLICATION_APPROVE,
    PERMISSIONS.BRAND_APPLICATION_REJECT,
    PERMISSIONS.BRAND_APPLICATION_VERIFY,
    PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO,

    // Brands
    PERMISSIONS.BRANDS_VIEW_ALL,
    PERMISSIONS.BRANDS_VERIFY,
    PERMISSIONS.BRANDS_REJECT,
    PERMISSIONS.BRANDS_VIEW_SENSITIVE,

    // Users (limited)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,

    // Audit
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],

  /**
   * CUSTOMER_SERVICE - Assists users and handles support tickets
   */
  CUSTOMER_SERVICE: [
    // Users (view and limited management)
    PERMISSIONS.USERS_VIEW_ALL,
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,
    PERMISSIONS.USERS_VIEW_ACTIVITY,

    // Creators (view)
    PERMISSIONS.CREATORS_VIEW_ALL,
    PERMISSIONS.CREATORS_VIEW_PUBLIC,

    // Brands (view)
    PERMISSIONS.BRANDS_VIEW_ALL,
    PERMISSIONS.BRANDS_VIEW_PUBLIC,

    // Content (read only)
    PERMISSIONS.CONTENT_READ,

    // Audit
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],

  /**
   * OPERATIONS - Manages day-to-day platform operations
   */
  OPERATIONS: [
    // Users
    PERMISSIONS.USERS_VIEW_ALL,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.USERS_ACTIVATE,
    PERMISSIONS.USERS_VIEW_ACTIVITY,
    PERMISSIONS.USERS_EDIT_USER,
    PERMISSIONS.USERS_VIEW_SENSITIVE_DATA,

    // Content
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_MODERATE,

    // System
    PERMISSIONS.SYSTEM_VIEW_LOGS,
    PERMISSIONS.SYSTEM_LOGS,
    PERMISSIONS.SYSTEM_MANAGE_CACHE,
    PERMISSIONS.SYSTEM_MONITOR,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW_PLATFORM,
    PERMISSIONS.ANALYTICS_VIEW_OWN,

    // Audit
    PERMISSIONS.AUDIT_VIEW_ALL,
    PERMISSIONS.AUDIT_EXPORT,

    // Users (own)
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,
  ],

  /**
   * CONTRACTOR - Limited temporary access
   * Specific permissions should be assigned per contract via AdminRole.permissions
   */
  CONTRACTOR: [
    // Basic viewing only - specific permissions granted per contract
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_EDIT_OWN,
    PERMISSIONS.AUDIT_VIEW_OWN,
  ],
};

/**
 * Get all permissions for a department, including inherited permissions
 * @param department - Admin department
 * @returns Array of permissions with inherited permissions included
 */
export function getDepartmentPermissions(department: Department): Permission[] {
  const basePermissions = DEPARTMENT_PERMISSIONS[department] || [];
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
 * Check if a department has a specific permission (with hierarchy support)
 * @param department - Admin department
 * @param permission - Permission to check
 * @returns true if department has the permission
 */
export function departmentHasPermission(department: Department, permission: Permission): boolean {
  const permissions = getDepartmentPermissions(department);
  return permissions.includes(permission);
}

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

  // Content Management
  [PERMISSIONS.CONTENT_READ]: 'View blog posts and assets',
  [PERMISSIONS.CONTENT_CREATE]: 'Create new content',
  [PERMISSIONS.CONTENT_EDIT]: 'Edit existing content',
  [PERMISSIONS.CONTENT_APPROVE]: 'Approve content for publication',
  [PERMISSIONS.CONTENT_DELETE]: 'Delete content',
  [PERMISSIONS.CONTENT_MODERATE]: 'Moderate user submissions',

  // Finance
  [PERMISSIONS.FINANCE_VIEW_ALL]: 'View all financial data',
  [PERMISSIONS.FINANCE_VIEW_OWN]: 'View own financial records',
  [PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS]: 'Create and manage financial transactions',
  [PERMISSIONS.FINANCE_PROCESS_PAYOUTS]: 'Process payout requests',
  [PERMISSIONS.FINANCE_VIEW_REPORTS]: 'View financial reports',
  [PERMISSIONS.FINANCE_GENERATE_REPORTS]: 'Generate financial reports',
  [PERMISSIONS.FINANCE_APPROVE_TRANSACTIONS]: 'Approve financial transactions',
  [PERMISSIONS.FINANCE_CONFIGURE_SETTINGS]: 'Configure finance settings',
  [PERMISSIONS.FINANCE_VIEW_PAYOUTS]: 'View payout information and schedules',
  [PERMISSIONS.FINANCE_PROCESS_ROYALTIES]: 'Process royalty calculations',
  [PERMISSIONS.FINANCE_INITIATE_PAYOUTS]: 'Initiate payout transfers',
  [PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS]: 'Approve payouts over threshold amount',
  [PERMISSIONS.FINANCE_EXPORT_DATA]: 'Export financial data to external formats',
  [PERMISSIONS.FINANCE_VIEW_ANALYTICS]: 'View revenue analytics and trends',

  // Licensing
  [PERMISSIONS.LICENSING_VIEW_ALL]: 'View all licensing agreements',
  [PERMISSIONS.LICENSING_VIEW_OWN]: 'View own licensing agreements',
  [PERMISSIONS.LICENSING_CREATE_PROPOSALS]: 'Create licensing proposals',
  [PERMISSIONS.LICENSING_REVIEW_PROPOSALS]: 'Review licensing proposals',
  [PERMISSIONS.LICENSING_APPROVE_AGREEMENTS]: 'Approve licensing agreements',
  [PERMISSIONS.LICENSING_MANAGE_TERMS]: 'Manage licensing terms',
  [PERMISSIONS.LICENSING_TERMINATE_AGREEMENTS]: 'Terminate licensing agreements',
  [PERMISSIONS.LICENSING_VIEW_FINANCIAL_TERMS]: 'View financial terms of licensing agreements',
  [PERMISSIONS.LICENSING_VIEW]: 'View license agreements and terms',
  [PERMISSIONS.LICENSING_CREATE]: 'Create new license agreements',
  [PERMISSIONS.LICENSING_EDIT]: 'Edit license terms and conditions',
  [PERMISSIONS.LICENSING_APPROVE]: 'Approve license agreements for activation',
  [PERMISSIONS.LICENSING_MODIFY_OWNERSHIP]: 'Modify IP ownership splits in licenses',
  [PERMISSIONS.LICENSING_TERMINATE]: 'Terminate active license agreements',
  [PERMISSIONS.LICENSING_RENEW]: 'Renew expiring or expired licenses',

  // Applications
  [PERMISSIONS.APPLICATIONS_VIEW_ALL]: 'View all creator and brand applications',
  [PERMISSIONS.APPLICATIONS_REVIEW]: 'Review applications',
  [PERMISSIONS.APPLICATIONS_APPROVE]: 'Approve applications',
  [PERMISSIONS.APPLICATIONS_REJECT]: 'Reject applications',
  [PERMISSIONS.APPLICATIONS_REQUEST_INFO]: 'Request additional information from applicants',
  [PERMISSIONS.APPLICATIONS_MANAGE_WORKFLOW]: 'Manage application workflow and status',
  [PERMISSIONS.APPLICATIONS_VIEW_SENSITIVE]: 'View sensitive application data',

  // Creator Application Permissions
  [PERMISSIONS.CREATOR_APPLICATION_REVIEW]: 'Review creator applications',
  [PERMISSIONS.CREATOR_APPLICATION_APPROVE]: 'Approve creator applications',
  [PERMISSIONS.CREATOR_APPLICATION_REJECT]: 'Reject creator applications',
  [PERMISSIONS.CREATOR_APPLICATION_VERIFY]: 'Verify creator credentials',
  [PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO]: 'Request additional information from creator applicants',

  // Brand Application Permissions
  [PERMISSIONS.BRAND_APPLICATION_REVIEW]: 'Review brand applications',
  [PERMISSIONS.BRAND_APPLICATION_APPROVE]: 'Approve brand applications',
  [PERMISSIONS.BRAND_APPLICATION_REJECT]: 'Reject brand applications',
  [PERMISSIONS.BRAND_APPLICATION_VERIFY]: 'Verify brand credentials',
  [PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO]: 'Request additional information from brand applicants',

  // Users (Admin Management)
  [PERMISSIONS.USERS_MANAGE_ROLES]: 'Manage user roles and permissions',
  [PERMISSIONS.USERS_SUSPEND]: 'Suspend user accounts',
  [PERMISSIONS.USERS_ACTIVATE]: 'Activate suspended user accounts',
  [PERMISSIONS.USERS_VIEW_ACTIVITY]: 'View user activity logs',
  [PERMISSIONS.USERS_MANAGE_2FA]: 'Manage user two-factor authentication',

  // User Management Permissions (Granular)
  [PERMISSIONS.USERS_VIEW]: 'View user information and profiles',
  [PERMISSIONS.USERS_EDIT_USER]: 'Edit user profiles and account information',
  [PERMISSIONS.USERS_DELETE_USER]: 'Delete user accounts (soft delete)',
  [PERMISSIONS.USERS_VIEW_SENSITIVE_DATA]: 'View sensitive user data (email, IP, PII)',
  [PERMISSIONS.USERS_IMPERSONATE]: 'Impersonate users for troubleshooting (Super Admin only)',

  // System
  [PERMISSIONS.SYSTEM_SETTINGS]: 'Modify system settings',
  [PERMISSIONS.SYSTEM_FEATURE_FLAGS]: 'Manage feature flags',
  [PERMISSIONS.SYSTEM_MAINTENANCE]: 'Perform maintenance tasks',
  [PERMISSIONS.SYSTEM_VIEW_LOGS]: 'View system logs',
  [PERMISSIONS.SYSTEM_MANAGE_CACHE]: 'Manage system cache',
  [PERMISSIONS.SYSTEM_CONFIGURE_INTEGRATIONS]: 'Configure external integrations',
  [PERMISSIONS.SYSTEM_MANAGE_BACKUPS]: 'Manage system backups',
  
  // System Management Permissions (Granular)
  [PERMISSIONS.SYSTEM_SETTINGS_MANAGE]: 'Modify platform-wide system settings and configurations',
  [PERMISSIONS.SYSTEM_DEPLOY]: 'Deploy system changes and manage deployments',
  [PERMISSIONS.SYSTEM_LOGS]: 'Access and view system logs',
  [PERMISSIONS.SYSTEM_MONITOR]: 'Access monitoring tools and dashboards',
  [PERMISSIONS.SYSTEM_BACKUP]: 'Manage backups and restoration',
  
  // Admin Role Management
  [PERMISSIONS.ADMIN_ROLES]: 'Manage admin roles and permissions (Super Admin only)',
};
