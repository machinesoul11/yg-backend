/**
 * Role Templates System
 * 
 * Provides pre-configured permission templates for different admin departments and seniority levels.
 * These templates serve as baseline permission sets that can be applied when creating admin roles,
 * ensuring consistent permission assignments across the platform.
 * 
 * @module permissions/roleTemplates
 * 
 * @example
 * ```typescript
 * import { ROLE_TEMPLATES, getRoleTemplate, applyRoleTemplate } from '@/permissions/roleTemplates';
 * 
 * // Get a specific template
 * const template = getRoleTemplate('CONTENT_MANAGER', 'JUNIOR');
 * 
 * // Apply template permissions to a user
 * const permissions = applyRoleTemplate('FINANCE_LICENSING', 'SENIOR');
 * ```
 */

import { Department, Seniority } from '@prisma/client';
import { PERMISSIONS, type Permission } from '@/lib/constants/permissions';

/**
 * Role Template Structure
 * Defines the shape of a role template with metadata
 */
export interface RoleTemplate {
  /** Human-readable name for the template */
  name: string;
  
  /** Description of what this role can do */
  description: string;
  
  /** Department this template applies to */
  department: Department;
  
  /** Seniority level (if applicable) */
  seniority?: Seniority;
  
  /** Array of permissions included in this template */
  permissions: Permission[];
  
  /** Permissions explicitly restricted from this role (require Super Admin approval) */
  restrictedPermissions?: Array<{
    permission: Permission;
    reason: string;
  }>;
  
  /** Whether this role requires approval workflows for certain actions */
  requiresApproval: boolean;
  
  /** Additional metadata or notes about the role */
  metadata?: {
    approvalThreshold?: string;
    specialConditions?: string[];
    recommendedFor?: string;
  };
}

/**
 * Super Admin Template
 * Full unrestricted access to all platform features and permissions
 * 
 * This role has complete control over:
 * - All user management and impersonation
 * - All content operations
 * - All financial operations and approvals
 * - All licensing operations including ownership modifications
 * - System configuration and deployment
 * - Admin role management
 */
const SUPER_ADMIN_TEMPLATE: RoleTemplate = {
  name: 'Super Administrator',
  description: 'Full unrestricted access to all platform features, settings, and administrative functions. Can manage admin roles and permissions.',
  department: 'SUPER_ADMIN' as Department,
  seniority: undefined,
  requiresApproval: false,
  permissions: [
    // User Management - All permissions
    PERMISSIONS.USERS_VIEW_ALL,
    PERMISSIONS.USERS_VIEW_OWN,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_EDIT_OWN,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_CHANGE_ROLE,
    PERMISSIONS.USERS_VIEW_SENSITIVE,
    PERMISSIONS.USERS_MANAGE_PERMISSIONS,
    PERMISSIONS.USERS_MANAGE_ROLES,
    PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.USERS_ACTIVATE,
    PERMISSIONS.USERS_VIEW_ACTIVITY,
    PERMISSIONS.USERS_MANAGE_2FA,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_EDIT_USER,
    PERMISSIONS.USERS_DELETE_USER,
    PERMISSIONS.USERS_VIEW_SENSITIVE_DATA,
    PERMISSIONS.USERS_IMPERSONATE,

    // Creator Management - All permissions
    PERMISSIONS.CREATORS_VIEW_ALL,
    PERMISSIONS.CREATORS_VIEW_OWN,
    PERMISSIONS.CREATORS_VIEW_PUBLIC,
    PERMISSIONS.CREATORS_APPROVE,
    PERMISSIONS.CREATORS_REJECT,
    PERMISSIONS.CREATORS_VIEW_SENSITIVE,
    PERMISSIONS.CREATORS_EDIT_OWN,
    PERMISSIONS.CREATORS_EDIT_ALL,
    PERMISSIONS.CREATORS_VIEW_FINANCIAL,

    // Brand Management - All permissions
    PERMISSIONS.BRANDS_VIEW_ALL,
    PERMISSIONS.BRANDS_VIEW_OWN,
    PERMISSIONS.BRANDS_VIEW_PUBLIC,
    PERMISSIONS.BRANDS_VERIFY,
    PERMISSIONS.BRANDS_REJECT,
    PERMISSIONS.BRANDS_VIEW_SENSITIVE,
    PERMISSIONS.BRANDS_EDIT_OWN,
    PERMISSIONS.BRANDS_EDIT_ALL,
    PERMISSIONS.BRANDS_VIEW_FINANCIAL,

    // IP Assets - All permissions
    PERMISSIONS.IP_ASSETS_VIEW_ALL,
    PERMISSIONS.IP_ASSETS_VIEW_OWN,
    PERMISSIONS.IP_ASSETS_VIEW_PUBLIC,
    PERMISSIONS.IP_ASSETS_CREATE,
    PERMISSIONS.IP_ASSETS_EDIT_OWN,
    PERMISSIONS.IP_ASSETS_EDIT_ALL,
    PERMISSIONS.IP_ASSETS_DELETE_OWN,
    PERMISSIONS.IP_ASSETS_DELETE_ALL,
    PERMISSIONS.IP_ASSETS_TRANSFER_OWNERSHIP,
    PERMISSIONS.IP_ASSETS_APPROVE,
    PERMISSIONS.IP_ASSETS_PUBLISH,
    PERMISSIONS.IP_ASSETS_VIEW_METADATA,

    // Licenses - All permissions
    PERMISSIONS.LICENSES_VIEW_ALL,
    PERMISSIONS.LICENSES_VIEW_OWN,
    PERMISSIONS.LICENSES_CREATE,
    PERMISSIONS.LICENSES_EDIT_OWN,
    PERMISSIONS.LICENSES_EDIT_ALL,
    PERMISSIONS.LICENSES_APPROVE,
    PERMISSIONS.LICENSES_TERMINATE_OWN,
    PERMISSIONS.LICENSES_TERMINATE_ALL,
    PERMISSIONS.LICENSES_VIEW_TERMS,
    PERMISSIONS.LICENSES_VIEW_FINANCIAL,

    // Royalties - All permissions
    PERMISSIONS.ROYALTIES_VIEW_ALL,
    PERMISSIONS.ROYALTIES_VIEW_OWN,
    PERMISSIONS.ROYALTIES_RUN,
    PERMISSIONS.ROYALTIES_EDIT,
    PERMISSIONS.ROYALTIES_VIEW_STATEMENTS,
    PERMISSIONS.ROYALTIES_DISPUTE,
    PERMISSIONS.ROYALTIES_APPROVE_DISPUTE,

    // Payouts - All permissions
    PERMISSIONS.PAYOUTS_VIEW_ALL,
    PERMISSIONS.PAYOUTS_VIEW_OWN,
    PERMISSIONS.PAYOUTS_PROCESS,
    PERMISSIONS.PAYOUTS_APPROVE,
    PERMISSIONS.PAYOUTS_RETRY,

    // Projects - All permissions
    PERMISSIONS.PROJECTS_VIEW_ALL,
    PERMISSIONS.PROJECTS_VIEW_OWN,
    PERMISSIONS.PROJECTS_VIEW_PUBLIC,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_EDIT_OWN,
    PERMISSIONS.PROJECTS_EDIT_ALL,
    PERMISSIONS.PROJECTS_DELETE_OWN,
    PERMISSIONS.PROJECTS_DELETE_ALL,
    PERMISSIONS.PROJECTS_ARCHIVE,

    // Analytics - All permissions
    PERMISSIONS.ANALYTICS_VIEW_PLATFORM,
    PERMISSIONS.ANALYTICS_VIEW_OWN,
    PERMISSIONS.ANALYTICS_VIEW_FINANCIAL,
    PERMISSIONS.ANALYTICS_EXPORT,

    // Audit - All permissions
    PERMISSIONS.AUDIT_VIEW_ALL,
    PERMISSIONS.AUDIT_VIEW_OWN,
    PERMISSIONS.AUDIT_EXPORT,

    // Content Management - All permissions
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_EDIT,
    PERMISSIONS.CONTENT_APPROVE,
    PERMISSIONS.CONTENT_DELETE,
    PERMISSIONS.CONTENT_MODERATE,

    // Finance - All permissions
    PERMISSIONS.FINANCE_VIEW_ALL,
    PERMISSIONS.FINANCE_VIEW_OWN,
    PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS,
    PERMISSIONS.FINANCE_PROCESS_PAYOUTS,
    PERMISSIONS.FINANCE_VIEW_REPORTS,
    PERMISSIONS.FINANCE_GENERATE_REPORTS,
    PERMISSIONS.FINANCE_APPROVE_TRANSACTIONS,
    PERMISSIONS.FINANCE_CONFIGURE_SETTINGS,
    PERMISSIONS.FINANCE_VIEW_PAYOUTS,
    PERMISSIONS.FINANCE_PROCESS_ROYALTIES,
    PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
    PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS,
    PERMISSIONS.FINANCE_EXPORT_DATA,
    PERMISSIONS.FINANCE_VIEW_ANALYTICS,

    // Licensing - All permissions
    PERMISSIONS.LICENSING_VIEW_ALL,
    PERMISSIONS.LICENSING_VIEW_OWN,
    PERMISSIONS.LICENSING_CREATE_PROPOSALS,
    PERMISSIONS.LICENSING_REVIEW_PROPOSALS,
    PERMISSIONS.LICENSING_APPROVE_AGREEMENTS,
    PERMISSIONS.LICENSING_MANAGE_TERMS,
    PERMISSIONS.LICENSING_TERMINATE_AGREEMENTS,
    PERMISSIONS.LICENSING_VIEW_FINANCIAL_TERMS,
    PERMISSIONS.LICENSING_VIEW,
    PERMISSIONS.LICENSING_CREATE,
    PERMISSIONS.LICENSING_EDIT,
    PERMISSIONS.LICENSING_APPROVE,
    PERMISSIONS.LICENSING_MODIFY_OWNERSHIP,
    PERMISSIONS.LICENSING_TERMINATE,
    PERMISSIONS.LICENSING_RENEW,

    // Applications - All permissions
    PERMISSIONS.APPLICATIONS_VIEW_ALL,
    PERMISSIONS.APPLICATIONS_REVIEW,
    PERMISSIONS.APPLICATIONS_APPROVE,
    PERMISSIONS.APPLICATIONS_REJECT,
    PERMISSIONS.APPLICATIONS_REQUEST_INFO,
    PERMISSIONS.APPLICATIONS_MANAGE_WORKFLOW,
    PERMISSIONS.APPLICATIONS_VIEW_SENSITIVE,

    // Creator Applications - All permissions
    PERMISSIONS.CREATOR_APPLICATION_REVIEW,
    PERMISSIONS.CREATOR_APPLICATION_APPROVE,
    PERMISSIONS.CREATOR_APPLICATION_REJECT,
    PERMISSIONS.CREATOR_APPLICATION_VERIFY,
    PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO,

    // Brand Applications - All permissions
    PERMISSIONS.BRAND_APPLICATION_REVIEW,
    PERMISSIONS.BRAND_APPLICATION_APPROVE,
    PERMISSIONS.BRAND_APPLICATION_REJECT,
    PERMISSIONS.BRAND_APPLICATION_VERIFY,
    PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO,

    // System - All permissions
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.SYSTEM_FEATURE_FLAGS,
    PERMISSIONS.SYSTEM_MAINTENANCE,
    PERMISSIONS.SYSTEM_VIEW_LOGS,
    PERMISSIONS.SYSTEM_MANAGE_CACHE,
    PERMISSIONS.SYSTEM_CONFIGURE_INTEGRATIONS,
    PERMISSIONS.SYSTEM_MANAGE_BACKUPS,
    PERMISSIONS.SYSTEM_SETTINGS_MANAGE,
    PERMISSIONS.SYSTEM_DEPLOY,
    PERMISSIONS.SYSTEM_LOGS,
    PERMISSIONS.SYSTEM_MONITOR,
    PERMISSIONS.SYSTEM_BACKUP,

    // Admin Role Management - Super Admin only
    PERMISSIONS.ADMIN_ROLES,
  ],
  restrictedPermissions: [],
  metadata: {
    specialConditions: [
      'Can assign and revoke admin roles',
      'Can impersonate any user for troubleshooting',
      'Full access to all financial operations without approval',
      'Can modify system-critical settings',
    ],
    recommendedFor: 'Platform owners, CTOs, and senior technical leadership only',
  },
};

/**
 * Content Manager - Junior Template
 * Entry-level content management with basic operational permissions
 * 
 * Can:
 * - Read all content
 * - Create new content
 * - Edit content (requires senior approval for publication)
 * 
 * Cannot:
 * - Approve content for publication
 * - Delete content
 * - Moderate user submissions
 */
const CONTENT_MANAGER_JUNIOR_TEMPLATE: RoleTemplate = {
  name: 'Junior Content Manager',
  description: 'Entry-level content management role. Can create and edit content but requires senior approval for publication and cannot delete content.',
  department: 'CONTENT_MANAGER' as Department,
  seniority: 'JUNIOR' as Seniority,
  requiresApproval: true,
  permissions: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_EDIT,
  ],
  restrictedPermissions: [
    {
      permission: PERMISSIONS.CONTENT_APPROVE,
      reason: 'Requires Senior Content Manager approval',
    },
    {
      permission: PERMISSIONS.CONTENT_DELETE,
      reason: 'Requires Senior Content Manager approval',
    },
    {
      permission: PERMISSIONS.CONTENT_MODERATE,
      reason: 'Requires Senior Content Manager approval',
    },
  ],
  metadata: {
    specialConditions: [
      'Must submit content for senior review before publication',
      'Cannot delete any content, even own drafts',
      'Cannot moderate user-generated content',
    ],
    recommendedFor: 'New content team members, content assistants, junior writers',
  },
};

/**
 * Content Manager - Senior Template
 * Full content lifecycle management with approval authority
 * 
 * Has all Junior permissions plus:
 * - Approve content for publication
 * - Moderate user-generated content
 * - Delete content
 */
const CONTENT_MANAGER_SENIOR_TEMPLATE: RoleTemplate = {
  name: 'Senior Content Manager',
  description: 'Full content management authority. Can approve, moderate, and delete content. Oversees junior content managers.',
  department: 'CONTENT_MANAGER' as Department,
  seniority: 'SENIOR' as Seniority,
  requiresApproval: false,
  permissions: [
    // All Junior permissions
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_EDIT,
    
    // Additional Senior permissions
    PERMISSIONS.CONTENT_APPROVE,
    PERMISSIONS.CONTENT_MODERATE,
    PERMISSIONS.CONTENT_DELETE,
  ],
  restrictedPermissions: [],
  metadata: {
    specialConditions: [
      'Can approve content created by junior staff',
      'Full moderation authority over user submissions',
      'Can delete any content including published materials',
    ],
    recommendedFor: 'Experienced content managers, editorial leads, content directors',
  },
};

/**
 * Finance & Licensing Manager - Junior Template
 * Entry-level financial operations and licensing management
 * 
 * Can:
 * - View financial reports and payout schedules
 * - Process routine royalty calculations
 * - View licensing agreements
 * - Create and edit license proposals
 * 
 * Cannot:
 * - Initiate actual payout transfers (requires senior approval)
 * - Approve large payouts
 * - Modify ownership structures in licenses
 * - Terminate license agreements
 */
const FINANCE_LICENSING_JUNIOR_TEMPLATE: RoleTemplate = {
  name: 'Junior Finance & Licensing Manager',
  description: 'Entry-level financial and licensing operations. Can view reports, process royalties, and manage license proposals but requires senior approval for high-stakes actions.',
  department: 'FINANCE_LICENSING' as Department,
  seniority: 'JUNIOR' as Seniority,
  requiresApproval: true,
  permissions: [
    // Finance - Read and operational permissions
    PERMISSIONS.FINANCE_VIEW_REPORTS,
    PERMISSIONS.FINANCE_VIEW_PAYOUTS,
    PERMISSIONS.FINANCE_PROCESS_ROYALTIES,
    
    // Licensing - Viewing and basic management
    PERMISSIONS.LICENSING_VIEW,
    PERMISSIONS.LICENSING_CREATE,
    PERMISSIONS.LICENSING_EDIT,
  ],
  restrictedPermissions: [
    {
      permission: PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
      reason: 'Requires Senior Finance Manager or Super Admin approval - high financial risk',
    },
    {
      permission: PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS,
      reason: 'Requires Senior Finance Manager approval - exceeds junior authority threshold',
    },
    {
      permission: PERMISSIONS.FINANCE_EXPORT_DATA,
      reason: 'Requires Senior Finance Manager approval - sensitive data export',
    },
    {
      permission: PERMISSIONS.LICENSING_APPROVE,
      reason: 'Requires Senior Licensing Manager approval - contractual commitment',
    },
    {
      permission: PERMISSIONS.LICENSING_MODIFY_OWNERSHIP,
      reason: 'Requires Super Admin approval - critical IP ownership change',
    },
    {
      permission: PERMISSIONS.LICENSING_TERMINATE,
      reason: 'Requires Super Admin approval - terminates legal agreements',
    },
    {
      permission: PERMISSIONS.LICENSING_RENEW,
      reason: 'Requires Senior Licensing Manager approval - contractual extension',
    },
  ],
  metadata: {
    approvalThreshold: 'Payouts over $10,000 require senior approval',
    specialConditions: [
      'Can process standard royalty calculations',
      'Can create license proposals for review',
      'Cannot approve or terminate agreements',
      'Cannot export financial data',
    ],
    recommendedFor: 'Junior accountants, licensing coordinators, financial analysts',
  },
};

/**
 * Finance & Licensing Manager - Senior Template
 * Advanced financial operations and licensing authority
 * 
 * Has all Junior permissions plus:
 * - Approve large payouts
 * - Export financial data
 * - Approve license agreements
 * - Renew license agreements
 * 
 * Still restricted (require Super Admin):
 * - Initiate payout transfers (financial security)
 * - Modify ownership structures (IP protection)
 * - Terminate agreements (legal implications)
 */
const FINANCE_LICENSING_SENIOR_TEMPLATE: RoleTemplate = {
  name: 'Senior Finance & Licensing Manager',
  description: 'Advanced financial and licensing authority. Can approve large payouts, export data, and approve license agreements. Some high-risk operations still require Super Admin approval.',
  department: 'FINANCE_LICENSING' as Department,
  seniority: 'SENIOR' as Seniority,
  requiresApproval: false,
  permissions: [
    // All Junior permissions
    PERMISSIONS.FINANCE_VIEW_REPORTS,
    PERMISSIONS.FINANCE_VIEW_PAYOUTS,
    PERMISSIONS.FINANCE_PROCESS_ROYALTIES,
    PERMISSIONS.LICENSING_VIEW,
    PERMISSIONS.LICENSING_CREATE,
    PERMISSIONS.LICENSING_EDIT,
    
    // Additional Senior permissions
    PERMISSIONS.FINANCE_APPROVE_LARGE_PAYOUTS,
    PERMISSIONS.FINANCE_EXPORT_DATA,
    PERMISSIONS.LICENSING_APPROVE,
    PERMISSIONS.LICENSING_RENEW,
  ],
  restrictedPermissions: [
    {
      permission: PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
      reason: 'Requires Super Admin approval - final authorization for fund transfers to prevent fraud',
    },
    {
      permission: PERMISSIONS.LICENSING_MODIFY_OWNERSHIP,
      reason: 'Requires Super Admin approval - changes IP ownership splits with legal and financial implications',
    },
    {
      permission: PERMISSIONS.LICENSING_TERMINATE,
      reason: 'Requires Super Admin approval - terminates legal agreements with potential liability',
    },
  ],
  metadata: {
    approvalThreshold: 'Can approve payouts up to $100,000; larger amounts require Super Admin',
    specialConditions: [
      'Can approve license agreements up to standard threshold',
      'Can export financial reports and data for compliance',
      'Can renew existing license agreements',
      'Cannot initiate actual payout transfers (Super Admin only)',
      'Cannot modify IP ownership structures (Super Admin only)',
      'Cannot terminate active agreements (Super Admin only)',
    ],
    recommendedFor: 'Senior accountants, licensing managers, finance directors',
  },
};

/**
 * Role Templates Object
 * Organized by department and seniority level for easy lookup
 */
export const ROLE_TEMPLATES = {
  SUPER_ADMIN: SUPER_ADMIN_TEMPLATE,
  
  CONTENT_MANAGER: {
    JUNIOR: CONTENT_MANAGER_JUNIOR_TEMPLATE,
    SENIOR: CONTENT_MANAGER_SENIOR_TEMPLATE,
  },
  
  FINANCE_LICENSING: {
    JUNIOR: FINANCE_LICENSING_JUNIOR_TEMPLATE,
    SENIOR: FINANCE_LICENSING_SENIOR_TEMPLATE,
  },
} as const;

/**
 * Type Definitions for Role Templates
 */
export type RoleTemplateDepartment = keyof typeof ROLE_TEMPLATES;
export type RoleTemplateSeniority = 'JUNIOR' | 'SENIOR';

/**
 * Get a role template by department and seniority
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional, not applicable for SUPER_ADMIN)
 * @returns The matching role template
 * @throws Error if template not found
 * 
 * @example
 * ```typescript
 * const template = getRoleTemplate('CONTENT_MANAGER', 'JUNIOR');
 * console.log(template.permissions); // Array of permissions
 * ```
 */
export function getRoleTemplate(
  department: Department,
  seniority?: Seniority
): RoleTemplate {
  if (department === 'SUPER_ADMIN') {
    return ROLE_TEMPLATES.SUPER_ADMIN;
  }
  
  if (department === 'CONTENT_MANAGER' || department === 'FINANCE_LICENSING') {
    if (!seniority) {
      throw new Error(`Seniority level is required for ${department} role templates`);
    }
    
    const deptTemplates = ROLE_TEMPLATES[department];
    if (!deptTemplates) {
      throw new Error(`No templates found for department: ${department}`);
    }
    
    const template = deptTemplates[seniority];
    if (!template) {
      throw new Error(`No template found for ${department} - ${seniority}`);
    }
    
    return template;
  }
  
  throw new Error(`No role templates defined for department: ${department}`);
}

/**
 * Apply a role template and return the permission array
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional)
 * @returns Array of permissions from the template
 * 
 * @example
 * ```typescript
 * const permissions = applyRoleTemplate('FINANCE_LICENSING', 'SENIOR');
 * // Use these permissions when creating an admin role
 * ```
 */
export function applyRoleTemplate(
  department: Department,
  seniority?: Seniority
): Permission[] {
  const template = getRoleTemplate(department, seniority);
  return [...template.permissions];
}

/**
 * Get all restricted permissions for a role template
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional)
 * @returns Array of restricted permission objects with reasons
 * 
 * @example
 * ```typescript
 * const restricted = getRestrictedPermissions('FINANCE_LICENSING', 'JUNIOR');
 * restricted.forEach(r => {
 *   console.log(`${r.permission}: ${r.reason}`);
 * });
 * ```
 */
export function getRestrictedPermissions(
  department: Department,
  seniority?: Seniority
): Array<{ permission: Permission; reason: string }> {
  const template = getRoleTemplate(department, seniority);
  return template.restrictedPermissions || [];
}

/**
 * Check if a permission is allowed in a role template
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional)
 * @param permission - The permission to check
 * @returns true if the permission is included in the template
 * 
 * @example
 * ```typescript
 * const canApprove = isPermissionAllowed('CONTENT_MANAGER', 'JUNIOR', PERMISSIONS.CONTENT_APPROVE);
 * // Returns false - juniors cannot approve
 * ```
 */
export function isPermissionAllowed(
  department: Department,
  seniority: Seniority | undefined,
  permission: Permission
): boolean {
  const template = getRoleTemplate(department, seniority);
  return template.permissions.includes(permission);
}

/**
 * Check if a permission is restricted in a role template
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional)
 * @param permission - The permission to check
 * @returns Object with restriction status and reason, or null if not restricted
 * 
 * @example
 * ```typescript
 * const restriction = isPermissionRestricted('FINANCE_LICENSING', 'SENIOR', PERMISSIONS.FINANCE_INITIATE_PAYOUTS);
 * if (restriction) {
 *   console.log(`Restricted: ${restriction.reason}`);
 * }
 * ```
 */
export function isPermissionRestricted(
  department: Department,
  seniority: Seniority | undefined,
  permission: Permission
): { permission: Permission; reason: string } | null {
  const template = getRoleTemplate(department, seniority);
  const restricted = template.restrictedPermissions?.find(r => r.permission === permission);
  return restricted || null;
}

/**
 * Get a user-friendly description of a role template
 * 
 * @param department - The department for the role
 * @param seniority - The seniority level (optional)
 * @returns Human-readable description of the role's capabilities
 * 
 * @example
 * ```typescript
 * const description = getRoleDescription('CONTENT_MANAGER', 'SENIOR');
 * // Returns detailed description for UI display
 * ```
 */
export function getRoleDescription(
  department: Department,
  seniority?: Seniority
): string {
  const template = getRoleTemplate(department, seniority);
  return template.description;
}

/**
 * List all available role templates
 * 
 * @returns Array of all defined role templates
 * 
 * @example
 * ```typescript
 * const allTemplates = listAllRoleTemplates();
 * // Useful for admin UIs that need to display all available roles
 * ```
 */
export function listAllRoleTemplates(): RoleTemplate[] {
  const templates: RoleTemplate[] = [];
  
  // Add Super Admin
  templates.push(ROLE_TEMPLATES.SUPER_ADMIN);
  
  // Add Content Manager templates
  templates.push(ROLE_TEMPLATES.CONTENT_MANAGER.JUNIOR);
  templates.push(ROLE_TEMPLATES.CONTENT_MANAGER.SENIOR);
  
  // Add Finance & Licensing templates
  templates.push(ROLE_TEMPLATES.FINANCE_LICENSING.JUNIOR);
  templates.push(ROLE_TEMPLATES.FINANCE_LICENSING.SENIOR);
  
  return templates;
}

/**
 * Compare two role templates and return the permission differences
 * 
 * @param fromDepartment - Source department
 * @param fromSeniority - Source seniority
 * @param toDepartment - Target department
 * @param toSeniority - Target seniority
 * @returns Object containing added and removed permissions
 * 
 * @example
 * ```typescript
 * const diff = compareRoleTemplates('CONTENT_MANAGER', 'JUNIOR', 'CONTENT_MANAGER', 'SENIOR');
 * console.log('New permissions:', diff.added);
 * console.log('Removed permissions:', diff.removed);
 * ```
 */
export function compareRoleTemplates(
  fromDepartment: Department,
  fromSeniority: Seniority | undefined,
  toDepartment: Department,
  toSeniority: Seniority | undefined
): {
  added: Permission[];
  removed: Permission[];
  unchanged: Permission[];
} {
  const fromTemplate = getRoleTemplate(fromDepartment, fromSeniority);
  const toTemplate = getRoleTemplate(toDepartment, toSeniority);
  
  const fromPermissions = new Set(fromTemplate.permissions);
  const toPermissions = new Set(toTemplate.permissions);
  
  const added = toTemplate.permissions.filter(p => !fromPermissions.has(p));
  const removed = fromTemplate.permissions.filter(p => !toPermissions.has(p));
  const unchanged = fromTemplate.permissions.filter(p => toPermissions.has(p));
  
  return { added, removed, unchanged };
}
