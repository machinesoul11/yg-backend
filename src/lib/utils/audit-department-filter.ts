/**
 * Audit Log Department Filtering Utilities
 * Handles department-scoped log filtering for non-Super Admin users
 */

import { Department, ResourceType } from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Content-related resource types for Content Managers
 */
const CONTENT_RESOURCE_TYPES: ResourceType[] = [
  'ASSET',
  'IP_ASSET',
  'MEDIA_ITEM',
  'FILE',
  'POST',
  'CAMPAIGN',
  'EMAIL_CAMPAIGN',
];

/**
 * Content-related action patterns for Content Managers
 */
const CONTENT_ACTION_PATTERNS = [
  'ASSET_',
  'IP_ASSET_',
  'CONTENT_',
  'MEDIA_',
  'POST_',
  'BLOG_',
  'CAMPAIGN_',
  'EMAIL_',
  'UPLOAD_',
  'PUBLISH_',
  'APPROVE_CONTENT',
  'REJECT_CONTENT',
];

/**
 * Finance-related resource types for Finance Managers
 */
const FINANCE_RESOURCE_TYPES: ResourceType[] = [
  'LICENSE',
  'LICENSE_AMENDMENT',
  'LICENSE_EXTENSION',
  'LICENSE_REQUEST',
  'ROYALTY',
  'ROYALTY_RUN',
  'ROYALTY_STATEMENT',
  'PAYOUT',
  'PAYMENT',
  'FINANCIAL_REPORT',
  'TAX_DOCUMENT',
  'TAX_WITHHOLDING',
];

/**
 * Finance-related action patterns for Finance Managers
 */
const FINANCE_ACTION_PATTERNS = [
  'LICENSE_',
  'ROYALTY_',
  'PAYOUT_',
  'PAYMENT_',
  'FINANCIAL_',
  'TAX_',
  'INVOICE_',
  'BILLING_',
  'TRANSACTION_',
];

/**
 * Check if an action is content-related
 * @param action - Audit action string
 * @returns True if action is content-related
 */
function isContentAction(action: string): boolean {
  return CONTENT_ACTION_PATTERNS.some(pattern => action.startsWith(pattern));
}

/**
 * Check if an action is finance-related
 * @param action - Audit action string
 * @returns True if action is finance-related
 */
function isFinanceAction(action: string): boolean {
  return FINANCE_ACTION_PATTERNS.some(pattern => action.startsWith(pattern));
}

/**
 * Generate department-scoped where clause for audit logs
 * @param department - User's department
 * @returns Prisma where clause for filtering logs
 */
export function getDepartmentScopedWhere(
  department: Department
): Prisma.AuditEventWhereInput {
  // Super Admins see all logs
  if (department === Department.SUPER_ADMIN) {
    return {};
  }

  // Content Managers see only content-related logs
  if (department === Department.CONTENT_MANAGER) {
    // Build OR conditions for content resource types or action patterns
    const actionConditions = CONTENT_ACTION_PATTERNS.map(pattern => ({
      action: {
        startsWith: pattern.replace('_', ''),
      },
    }));

    return {
      OR: [
        {
          resourceType: {
            in: CONTENT_RESOURCE_TYPES,
          },
        },
        ...actionConditions,
      ],
    };
  }

  // Finance Managers see only finance and licensing logs
  if (department === Department.FINANCE_LICENSING) {
    // Build OR conditions for finance resource types or action patterns
    const actionConditions = FINANCE_ACTION_PATTERNS.map(pattern => ({
      action: {
        startsWith: pattern.replace('_', ''),
      },
    }));

    return {
      OR: [
        {
          resourceType: {
            in: FINANCE_RESOURCE_TYPES,
          },
        },
        ...actionConditions,
      ],
    };
  }

  // Creator Applications staff see creator-related logs
  if (department === Department.CREATOR_APPLICATIONS) {
    return {
      OR: [
        {
          resourceType: 'CREATOR',
        },
        {
          action: {
            startsWith: 'CREATOR_',
          },
        },
        {
          entityType: 'creator',
        },
      ],
    };
  }

  // Brand Applications staff see brand-related logs
  if (department === Department.BRAND_APPLICATIONS) {
    return {
      OR: [
        {
          resourceType: 'BRAND',
        },
        {
          action: {
            startsWith: 'BRAND_',
          },
        },
        {
          entityType: 'brand',
        },
      ],
    };
  }

  // Customer Service sees user and support-related logs
  if (department === Department.CUSTOMER_SERVICE) {
    return {
      OR: [
        {
          resourceType: 'USER',
        },
        {
          resourceType: 'MESSAGE',
        },
        {
          resourceType: 'NOTIFICATION',
        },
        {
          action: {
            startsWith: 'USER_',
          },
        },
        {
          action: {
            startsWith: 'MESSAGE_',
          },
        },
        {
          action: {
            startsWith: 'SUPPORT_',
          },
        },
      ],
    };
  }

  // Operations sees system and operational logs
  if (department === Department.OPERATIONS) {
    return {
      OR: [
        {
          resourceType: 'SYSTEM',
        },
        {
          action: {
            startsWith: 'SYSTEM_',
          },
        },
        {
          action: {
            startsWith: 'CONFIG_',
          },
        },
      ],
    };
  }

  // Contractors have no default access to logs
  if (department === Department.CONTRACTOR) {
    // Return impossible condition to return no logs
    return {
      id: 'CONTRACTOR_NO_ACCESS',
    };
  }

  // Default: no logs accessible
  return {
    id: 'NO_ACCESS',
  };
}

/**
 * Check if a user has access to view a specific audit log based on their department
 * @param department - User's department
 * @param log - Audit log to check access for
 * @returns True if user can access the log
 */
export function canAccessLog(
  department: Department,
  log: {
    resourceType: ResourceType | null;
    action: string;
    entityType: string;
  }
): boolean {
  // Super Admins can access all logs
  if (department === Department.SUPER_ADMIN) {
    return true;
  }

  // Content Managers
  if (department === Department.CONTENT_MANAGER) {
    return (
      (log.resourceType && CONTENT_RESOURCE_TYPES.includes(log.resourceType)) ||
      isContentAction(log.action)
    );
  }

  // Finance Managers
  if (department === Department.FINANCE_LICENSING) {
    return (
      (log.resourceType && FINANCE_RESOURCE_TYPES.includes(log.resourceType)) ||
      isFinanceAction(log.action)
    );
  }

  // Creator Applications
  if (department === Department.CREATOR_APPLICATIONS) {
    return (
      log.resourceType === 'CREATOR' ||
      log.action.startsWith('CREATOR_') ||
      log.entityType === 'creator'
    );
  }

  // Brand Applications
  if (department === Department.BRAND_APPLICATIONS) {
    return (
      log.resourceType === 'BRAND' ||
      log.action.startsWith('BRAND_') ||
      log.entityType === 'brand'
    );
  }

  // Customer Service
  if (department === Department.CUSTOMER_SERVICE) {
    return (
      log.resourceType === 'USER' ||
      log.resourceType === 'MESSAGE' ||
      log.resourceType === 'NOTIFICATION' ||
      log.action.startsWith('USER_') ||
      log.action.startsWith('MESSAGE_') ||
      log.action.startsWith('SUPPORT_')
    );
  }

  // Operations
  if (department === Department.OPERATIONS) {
    return (
      log.resourceType === 'SYSTEM' ||
      log.action.startsWith('SYSTEM_') ||
      log.action.startsWith('CONFIG_')
    );
  }

  // Contractors have no access
  if (department === Department.CONTRACTOR) {
    return false;
  }

  // Default: no access
  return false;
}

/**
 * Get user's primary department from admin roles
 * Super Admin takes precedence, otherwise returns first active role's department
 * @param adminRoles - User's admin roles
 * @returns Primary department or null
 */
export function getPrimaryDepartment(
  adminRoles: Array<{ department: Department; isActive: boolean }>
): Department | null {
  if (!adminRoles || adminRoles.length === 0) {
    return null;
  }

  // Check for Super Admin role first
  const superAdminRole = adminRoles.find(
    role => role.department === Department.SUPER_ADMIN && role.isActive
  );

  if (superAdminRole) {
    return Department.SUPER_ADMIN;
  }

  // Return first active role's department
  const activeRole = adminRoles.find(role => role.isActive);
  return activeRole?.department || null;
}
