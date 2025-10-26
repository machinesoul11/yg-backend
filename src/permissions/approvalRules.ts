/**
 * Approval Requirements Configuration
 * 
 * Defines critical actions requiring senior approval and implements
 * approval logic for high-risk administrative operations.
 * 
 * This system serves as a security and operational safeguard layer,
 * ensuring that high-risk operations receive appropriate senior oversight
 * before execution.
 * 
 * @module permissions/approvalRules
 * 
 * @example
 * ```typescript
 * import { requiresApproval, canApprove } from '@/permissions/approvalRules';
 * 
 * // Check if action requires approval
 * const needsApproval = requiresApproval('users:delete', { userId: '123' }, user);
 * 
 * // Check if user can approve a request
 * const canApproveRequest = await canApprove(user, approvalRequest);
 * ```
 */

import { Department, Seniority, ApprovalStatus } from '@prisma/client';
import { PERMISSIONS, type Permission } from '@/lib/constants/permissions';
import { LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS } from '@/modules/finance/config/payout.config';
import { prisma } from '@/lib/db/index';

/**
 * Payout approval threshold in cents
 * Payouts at or above $10,000 require senior approval
 * References existing finance configuration for consistency
 */
export const PAYOUT_APPROVAL_THRESHOLD = LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS;

/**
 * Royalty retroactive change threshold in days
 * Changes to royalty runs older than this require approval
 */
export const ROYALTY_RETROACTIVE_THRESHOLD_DAYS = 30;

/**
 * Approval requirement configuration
 * Defines which actions require senior approval and under what conditions
 */
export interface ApprovalRequirement {
  /** Human-readable description of why approval is needed */
  reason: string;
  
  /** Senior roles authorized to approve this action type */
  requiresSeniorRole: Department[];
  
  /** Whether this action is seniority-restricted (requires SENIOR level) */
  requiresSeniorLevel: boolean;
  
  /** Department scope for approval (must match requester's department if specified) */
  departmentScope?: Department;
  
  /** Optional threshold configuration for quantitative triggers */
  threshold?: {
    field: string;
    value: number;
    comparison: 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
  };
  
  /** Optional condition function for complex approval logic */
  condition?: (data: any, user: any) => boolean | Promise<boolean>;
}

/**
 * Critical actions requiring senior approval
 * Maps action identifiers to their approval requirements
 */
export const REQUIRES_SENIOR_APPROVAL: Record<string, ApprovalRequirement> = {
  /**
   * User account permanent deletion
   * Requires senior approval to prevent accidental or malicious deletions
   */
  [PERMISSIONS.USERS_DELETE_USER]: {
    reason: 'Permanent user account deletion is irreversible and requires senior oversight',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.OPERATIONS],
    requiresSeniorLevel: true,
    departmentScope: undefined, // Any senior from listed departments can approve
  },

  /**
   * Large payout processing
   * Payouts over $10,000 require senior finance approval
   */
  [PERMISSIONS.FINANCE_INITIATE_PAYOUTS]: {
    reason: 'Large payouts require senior finance approval to prevent fraud and ensure dual authorization',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.FINANCE_LICENSING],
    requiresSeniorLevel: true,
    departmentScope: Department.FINANCE_LICENSING,
    threshold: {
      field: 'amountCents',
      value: PAYOUT_APPROVAL_THRESHOLD,
      comparison: 'gte',
    },
  },

  /**
   * IP ownership split modifications
   * Changes to ownership percentages require senior licensing approval
   */
  [PERMISSIONS.LICENSING_MODIFY_OWNERSHIP]: {
    reason: 'IP ownership modifications have legal and financial implications requiring senior approval',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.FINANCE_LICENSING],
    requiresSeniorLevel: true,
    departmentScope: Department.FINANCE_LICENSING,
  },

  /**
   * Account suspension for verified creators
   * Suspending verified creators requires senior operations approval
   */
  'users:suspend_verified_creator': {
    reason: 'Suspending verified creators impacts platform relationships and requires senior review',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.OPERATIONS],
    requiresSeniorLevel: true,
    condition: async (data: any) => {
      // Check if target user is a verified creator
      if (!data.userId) return false;
      
      const creator = await prisma.creator.findUnique({
        where: { userId: data.userId },
        select: { verificationStatus: true },
      });
      
      return creator?.verificationStatus === 'VERIFIED';
    },
  },

  /**
   * Account suspension/ban for verified brands
   * Suspending verified brands requires senior operations approval
   */
  'users:suspend_verified_brand': {
    reason: 'Suspending verified brands impacts business partnerships and requires senior review',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.OPERATIONS],
    requiresSeniorLevel: true,
    condition: async (data: any) => {
      // Check if target user is a verified brand
      if (!data.userId) return false;
      
      const brand = await prisma.brand.findUnique({
        where: { userId: data.userId },
        select: { verificationStatus: true },
      });
      
      return brand?.verificationStatus === 'VERIFIED';
    },
  },

  /**
   * Retroactive royalty run modifications
   * Changes to completed royalty runs older than 30 days require approval
   */
  'royalties:modify_completed_run': {
    reason: 'Retroactive changes to finalized royalty runs require senior approval for audit compliance',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.FINANCE_LICENSING],
    requiresSeniorLevel: true,
    departmentScope: Department.FINANCE_LICENSING,
    condition: async (data: any) => {
      if (!data.royaltyRunId) return false;
      
      const run = await prisma.royaltyRun.findUnique({
        where: { id: data.royaltyRunId },
        select: { 
          status: true,
          lockedAt: true,
        },
      });
      
      if (!run || run.status !== 'LOCKED') return false;
      
      // Check if run was locked more than threshold days ago
      const daysSinceLocked = run.lockedAt 
        ? (Date.now() - run.lockedAt.getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      
      return daysSinceLocked > ROYALTY_RETROACTIVE_THRESHOLD_DAYS;
    },
  },

  /**
   * Admin role grants or modifications
   * Granting or modifying admin roles requires Super Admin approval
   */
  [PERMISSIONS.ADMIN_ROLES]: {
    reason: 'Admin role changes affect platform security and require highest-level approval',
    requiresSeniorRole: [Department.SUPER_ADMIN],
    requiresSeniorLevel: false, // Super Admin doesn't use seniority levels
  },

  /**
   * License termination
   * Terminating active licenses requires senior approval
   */
  [PERMISSIONS.LICENSING_TERMINATE]: {
    reason: 'License termination has legal and financial implications requiring senior approval',
    requiresSeniorRole: [Department.SUPER_ADMIN, Department.FINANCE_LICENSING],
    requiresSeniorLevel: true,
    departmentScope: Department.FINANCE_LICENSING,
    condition: async (data: any) => {
      if (!data.licenseId) return false;
      
      const license = await prisma.license.findUnique({
        where: { id: data.licenseId },
        select: { status: true },
      });
      
      // Only require approval for active licenses
      return license?.status === 'ACTIVE';
    },
  },
};

/**
 * User context for approval checks
 */
interface UserContext {
  id: string;
  role?: string;
  adminRoles?: Array<{
    department: Department;
    seniority: Seniority;
    isActive: boolean;
  }>;
}

/**
 * Check if an action requires senior approval
 * 
 * @param action - The action permission being attempted
 * @param data - The data context for the action (e.g., payout amount, user ID)
 * @param user - The user attempting the action
 * @returns true if the action requires senior approval before execution
 * 
 * @example
 * ```typescript
 * const needsApproval = await requiresApproval(
 *   'finance:initiate_payouts',
 *   { amountCents: 1500000 },
 *   currentUser
 * );
 * ```
 */
export async function requiresApproval(
  action: string,
  data: Record<string, any>,
  user: UserContext
): Promise<boolean> {
  // Check if action is configured for approval
  const requirement = REQUIRES_SENIOR_APPROVAL[action];
  
  if (!requirement) {
    // Action not configured - no approval required
    return false;
  }

  // Check threshold-based conditions
  if (requirement.threshold) {
    const { field, value, comparison } = requirement.threshold;
    const dataValue = data[field];

    if (dataValue === undefined || dataValue === null) {
      // Missing required data for threshold check - require approval as safety measure
      console.warn(`[ApprovalRules] Missing threshold field '${field}' for action '${action}'. Defaulting to requiring approval.`);
      return true;
    }

    // Evaluate threshold comparison
    let thresholdMet = false;
    switch (comparison) {
      case 'gte':
        thresholdMet = dataValue >= value;
        break;
      case 'gt':
        thresholdMet = dataValue > value;
        break;
      case 'lte':
        thresholdMet = dataValue <= value;
        break;
      case 'lt':
        thresholdMet = dataValue < value;
        break;
      case 'eq':
        thresholdMet = dataValue === value;
        break;
    }

    // If threshold not met, no approval needed
    if (!thresholdMet) {
      return false;
    }
  }

  // Check custom condition if defined
  if (requirement.condition) {
    try {
      const conditionMet = await requirement.condition(data, user);
      if (!conditionMet) {
        return false;
      }
    } catch (error) {
      // Condition check failed - require approval as safety measure
      console.error(`[ApprovalRules] Condition check failed for action '${action}':`, error);
      return true;
    }
  }

  // Check if user already has appropriate senior role
  // This allows fast-tracking for users with correct authority
  if (user.adminRoles && user.adminRoles.length > 0) {
    const hasAppropriateSeniorRole = user.adminRoles.some(adminRole => {
      if (!adminRole.isActive) return false;
      
      // Check department match
      const isDepartmentMatch = requirement.requiresSeniorRole.includes(adminRole.department);
      if (!isDepartmentMatch) return false;

      // Check seniority requirement
      if (requirement.requiresSeniorLevel) {
        // For departments other than SUPER_ADMIN, require SENIOR seniority
        if (adminRole.department === Department.SUPER_ADMIN) {
          return true; // Super admins bypass seniority requirements
        }
        return adminRole.seniority === Seniority.SENIOR;
      }

      return true;
    });

    // User has appropriate senior role - may not need approval
    // However, some organizations require dual authorization even for senior personnel
    // For now, we still require approval for critical actions
    // This can be adjusted based on business requirements
  }

  // All checks passed - approval required
  return true;
}

/**
 * Approval request data structure
 */
export interface ApprovalRequest {
  id: string;
  actionType: string;
  requestedBy: string;
  department: Department;
  dataPayload: any;
  status: ApprovalStatus;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewComments?: string | null;
  createdAt: Date;
  metadata?: any;
}

/**
 * Check if a user can approve a specific approval request
 * 
 * @param user - The potential approver
 * @param approvalRequest - The approval request to check
 * @returns true if the user has authority to approve this request
 * 
 * @example
 * ```typescript
 * const canApproveRequest = await canApprove(currentUser, approvalRequest);
 * ```
 */
export async function canApprove(
  user: UserContext,
  approvalRequest: ApprovalRequest
): Promise<boolean> {
  // Get approval requirement for this action type
  const requirement = REQUIRES_SENIOR_APPROVAL[approvalRequest.actionType];
  
  if (!requirement) {
    // Action not configured - cannot approve unknown action types
    console.error(`[ApprovalRules] Unknown action type for approval: ${approvalRequest.actionType}`);
    return false;
  }

  // Prevent self-approval
  if (user.id === approvalRequest.requestedBy) {
    return false;
  }

  // Check if approval request is still pending
  if (approvalRequest.status !== ApprovalStatus.PENDING) {
    // Already approved or rejected
    return false;
  }

  // Fetch user's admin roles if not provided
  let userAdminRoles = user.adminRoles;
  if (!userAdminRoles) {
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        adminRoles: {
          where: { isActive: true },
          select: {
            department: true,
            seniority: true,
            isActive: true,
          },
        },
      },
    });
    
    userAdminRoles = userWithRoles?.adminRoles || [];
  }

  // Check if user has appropriate role and authority
  const hasAuthorizedRole = userAdminRoles.some(adminRole => {
    if (!adminRole.isActive) return false;

    // Check if user's department is authorized to approve this action type
    const isDepartmentAuthorized = requirement.requiresSeniorRole.includes(adminRole.department);
    if (!isDepartmentAuthorized) return false;

    // Check department scope restriction
    if (requirement.departmentScope) {
      // If action has department scope, approver must be from that department
      if (adminRole.department !== requirement.departmentScope && 
          adminRole.department !== Department.SUPER_ADMIN) {
        return false;
      }
    }

    // Check seniority requirement
    if (requirement.requiresSeniorLevel) {
      if (adminRole.department === Department.SUPER_ADMIN) {
        return true; // Super admins bypass seniority requirements
      }
      return adminRole.seniority === Seniority.SENIOR;
    }

    return true;
  });

  return hasAuthorizedRole;
}

/**
 * Create an approval request for a critical action
 * 
 * @param actionType - The action permission requiring approval
 * @param requestedBy - User ID of the person requesting the action
 * @param department - Department of the requesting user
 * @param dataPayload - The action data (e.g., user ID, amount, license ID)
 * @param metadata - Optional additional context
 * @returns The created approval request
 * 
 * @example
 * ```typescript
 * const request = await createApprovalRequest(
 *   'finance:initiate_payouts',
 *   userId,
 *   Department.FINANCE_LICENSING,
 *   { amountCents: 1500000, payoutId: 'payout_123' }
 * );
 * ```
 */
export async function createApprovalRequest(
  actionType: string,
  requestedBy: string,
  department: Department,
  dataPayload: Record<string, any>,
  metadata?: Record<string, any>
): Promise<ApprovalRequest> {
  const requirement = REQUIRES_SENIOR_APPROVAL[actionType];
  
  if (!requirement) {
    throw new Error(`Cannot create approval request for unconfigured action: ${actionType}`);
  }

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      actionType,
      requestedBy,
      department,
      dataPayload,
      status: ApprovalStatus.PENDING,
      metadata: {
        ...metadata,
        reason: requirement.reason,
        requiresSeniorRole: requirement.requiresSeniorRole,
        createdTimestamp: new Date().toISOString(),
      },
    },
  });

  return approvalRequest;
}

/**
 * Get pending approval requests for a specific user
 * Returns requests the user has authority to approve
 * 
 * @param userId - The user ID to check for pending approvals
 * @returns Array of pending approval requests the user can approve
 */
export async function getPendingApprovalsForUser(
  userId: string
): Promise<ApprovalRequest[]> {
  // Get user's admin roles
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      adminRoles: {
        where: { isActive: true },
        select: {
          department: true,
          seniority: true,
          isActive: true,
        },
      },
    },
  });

  if (!user || !user.adminRoles || user.adminRoles.length === 0) {
    return [];
  }

  // Get all pending approval requests
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: {
      status: ApprovalStatus.PENDING,
      requestedBy: {
        not: userId, // Exclude self-requested approvals
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Filter to only requests the user can approve
  const approvableRequests: ApprovalRequest[] = [];
  
  for (const request of pendingRequests) {
    const canApproveRequest = await canApprove(
      { id: userId, adminRoles: user.adminRoles },
      request
    );
    
    if (canApproveRequest) {
      approvableRequests.push(request);
    }
  }

  return approvableRequests;
}

/**
 * Approve an approval request and execute the approved action
 * 
 * @param approvalRequestId - The approval request ID
 * @param approverId - User ID of the approver
 * @param comments - Optional approval comments
 * @returns The updated approval request
 */
export async function approveRequest(
  approvalRequestId: string,
  approverId: string,
  comments?: string
): Promise<ApprovalRequest> {
  const approvalRequest = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
  });

  if (!approvalRequest) {
    throw new Error('Approval request not found');
  }

  // Verify approver has authority
  const user = await prisma.user.findUnique({
    where: { id: approverId },
    select: {
      id: true,
      adminRoles: {
        where: { isActive: true },
        select: {
          department: true,
          seniority: true,
          isActive: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Approver not found');
  }

  const hasAuthority = await canApprove(
    { id: user.id, adminRoles: user.adminRoles },
    approvalRequest
  );

  if (!hasAuthority) {
    throw new Error('User does not have authority to approve this request');
  }

  // Update approval request
  const updatedRequest = await prisma.approvalRequest.update({
    where: { id: approvalRequestId },
    data: {
      status: ApprovalStatus.APPROVED,
      reviewedBy: approverId,
      reviewedAt: new Date(),
      reviewComments: comments,
    },
  });

  return updatedRequest;
}

/**
 * Reject an approval request
 * 
 * @param approvalRequestId - The approval request ID
 * @param approverId - User ID of the approver
 * @param comments - Required rejection reason
 * @returns The updated approval request
 */
export async function rejectRequest(
  approvalRequestId: string,
  approverId: string,
  comments: string
): Promise<ApprovalRequest> {
  const approvalRequest = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
  });

  if (!approvalRequest) {
    throw new Error('Approval request not found');
  }

  // Verify approver has authority
  const user = await prisma.user.findUnique({
    where: { id: approverId },
    select: {
      id: true,
      adminRoles: {
        where: { isActive: true },
        select: {
          department: true,
          seniority: true,
          isActive: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Approver not found');
  }

  const hasAuthority = await canApprove(
    { id: user.id, adminRoles: user.adminRoles },
    approvalRequest
  );

  if (!hasAuthority) {
    throw new Error('User does not have authority to reject this request');
  }

  // Update approval request
  const updatedRequest = await prisma.approvalRequest.update({
    where: { id: approvalRequestId },
    data: {
      status: ApprovalStatus.REJECTED,
      reviewedBy: approverId,
      reviewedAt: new Date(),
      reviewComments: comments,
    },
  });

  return updatedRequest;
}

/**
 * Get approval request by ID
 * 
 * @param approvalRequestId - The approval request ID
 * @returns The approval request or null if not found
 */
export async function getApprovalRequest(
  approvalRequestId: string
): Promise<ApprovalRequest | null> {
  return await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
  });
}

/**
 * Get approval request statistics for a department
 * 
 * @param department - The department to get statistics for
 * @returns Statistics about approval requests
 */
export async function getApprovalStatistics(
  department?: Department
): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}> {
  const where = department ? { department } : {};

  const [pending, approved, rejected, total] = await Promise.all([
    prisma.approvalRequest.count({
      where: { ...where, status: ApprovalStatus.PENDING },
    }),
    prisma.approvalRequest.count({
      where: { ...where, status: ApprovalStatus.APPROVED },
    }),
    prisma.approvalRequest.count({
      where: { ...where, status: ApprovalStatus.REJECTED },
    }),
    prisma.approvalRequest.count({ where }),
  ]);

  return {
    pending,
    approved,
    rejected,
    total,
  };
}
