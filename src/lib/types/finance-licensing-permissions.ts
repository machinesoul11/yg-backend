/**
 * Finance and Licensing Permission Types
 * Type definitions for granular finance and licensing permissions
 */

import type { Permission } from '@/lib/constants/permissions';

/**
 * Finance Permission Categories
 */
export type FinancePermission = 
  | 'finance:view_all'
  | 'finance:view_own'
  | 'finance:view_reports'
  | 'finance:view_payouts'
  | 'finance:view_analytics'
  | 'finance:generate_reports'
  | 'finance:export_data'
  | 'finance:manage_transactions'
  | 'finance:process_payouts'
  | 'finance:process_royalties'
  | 'finance:initiate_payouts'
  | 'finance:approve_transactions'
  | 'finance:approve_large_payouts'
  | 'finance:configure_settings';

/**
 * Licensing Permission Categories
 */
export type LicensingPermission =
  | 'licensing:view_all'
  | 'licensing:view_own'
  | 'licensing:view'
  | 'licensing:view_financial_terms'
  | 'licensing:create_proposals'
  | 'licensing:create'
  | 'licensing:review_proposals'
  | 'licensing:edit'
  | 'licensing:approve_agreements'
  | 'licensing:approve'
  | 'licensing:manage_terms'
  | 'licensing:modify_ownership'
  | 'licensing:terminate_agreements'
  | 'licensing:terminate'
  | 'licensing:renew';

/**
 * Payout approval status
 */
export enum PayoutApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Payout approval context
 */
export interface PayoutApprovalContext {
  payoutId: string;
  amountCents: number;
  creatorId: string;
  initiatedBy: string;
  initiatedAt: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Payout approval decision
 */
export interface PayoutApprovalDecision {
  approvalId: string;
  status: PayoutApprovalStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  comments?: string;
}

/**
 * Royalty processing context
 */
export interface RoyaltyProcessingContext {
  runId: string;
  periodStart: Date;
  periodEnd: Date;
  processedBy: string;
  licenseCount: number;
  totalRoyaltiesCents: number;
  processingMetadata?: Record<string, any>;
}

/**
 * Financial data export context
 */
export interface FinancialExportContext {
  exportId: string;
  exportType: 'csv' | 'excel' | 'pdf';
  dataType: 'payouts' | 'royalties' | 'transactions' | 'reports';
  dateRange: {
    start: Date;
    end: Date;
  };
  exportedBy: string;
  exportedAt: Date;
  recordCount: number;
  watermark?: string;
}

/**
 * Ownership modification context
 */
export interface OwnershipModificationContext {
  licenseId: string;
  ipAssetId: string;
  previousOwnership: OwnershipSplit[];
  newOwnership: OwnershipSplit[];
  modifiedBy: string;
  modifiedAt: Date;
  justification: string;
  affectedCreators: string[];
  requiresMultiPartyApproval: boolean;
  approvals?: OwnershipApproval[];
}

/**
 * Ownership split
 */
export interface OwnershipSplit {
  creatorId: string;
  shareBps: number; // Basis points (100 bps = 1%)
  sharePercentage: number;
}

/**
 * Ownership modification approval
 */
export interface OwnershipApproval {
  creatorId: string;
  approved: boolean;
  approvedAt?: Date;
  comments?: string;
}

/**
 * License renewal context
 */
export interface LicenseRenewalContext {
  originalLicenseId: string;
  renewedLicenseId: string;
  renewedBy: string;
  renewedAt: Date;
  termExtensionMonths: number;
  updatedTerms?: Partial<LicenseTerms>;
  earlyRenewal: boolean;
  daysBeforeExpiration?: number;
}

/**
 * License terms (partial definition)
 */
export interface LicenseTerms {
  feeCents: number;
  revShareBps: number;
  startDate: Date;
  endDate: Date;
  scope: Record<string, any>;
  exclusivity?: boolean;
  autoRenew?: boolean;
}

/**
 * License termination context
 */
export interface LicenseTerminationContext {
  licenseId: string;
  terminatedBy: string;
  terminatedAt: Date;
  terminationType: 'natural_expiration' | 'mutual_termination' | 'creator_termination' | 'brand_breach' | 'force_majeure';
  reason: string;
  gracePeriodDays: number;
  reconciliationRequired: boolean;
  outstandingRoyaltiesCents?: number;
  finalStatementGenerated: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  permission: Permission;
  reason?: string;
  requiredPermissions?: Permission[];
  missingPermissions?: Permission[];
}

/**
 * Financial operation audit entry
 */
export interface FinancialAuditEntry {
  operation: 'view_reports' | 'view_payouts' | 'process_royalties' | 'initiate_payout' | 'approve_payout' | 'export_data' | 'view_analytics';
  userId: string;
  userRole: string;
  permission: FinancePermission;
  timestamp: Date;
  resourceId?: string;
  resourceType?: 'payout' | 'royalty_run' | 'report' | 'export';
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Licensing operation audit entry
 */
export interface LicensingAuditEntry {
  operation: 'view' | 'create' | 'edit' | 'approve' | 'modify_ownership' | 'terminate' | 'renew';
  userId: string;
  userRole: string;
  permission: LicensingPermission;
  timestamp: Date;
  licenseId?: string;
  ipAssetId?: string;
  brandId?: string;
  creatorIds?: string[];
  outcome: 'success' | 'failure' | 'denied';
  changesSummary?: Record<string, any>;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Payout velocity check result
 */
export interface PayoutVelocityCheckResult {
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  payoutCount: number;
  totalAmountCents: number;
  exceedsLimit: boolean;
  limitPerWindow: number;
  anomalyDetected: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Export rate limit check result
 */
export interface ExportRateLimitResult {
  userId: string;
  period: 'hour' | 'day';
  exportCount: number;
  limit: number;
  exceedsLimit: boolean;
  resetAt: Date;
}

/**
 * Resource-level authorization context
 */
export interface ResourceAuthContext {
  userId: string;
  userRole: string;
  resourceId: string;
  resourceType: 'license' | 'payout' | 'royalty' | 'report';
  ownerId?: string;
  brandId?: string;
  creatorIds?: string[];
  organizationalScope?: string[];
}

/**
 * Permission validation result with context
 */
export interface PermissionValidationResult {
  hasPermission: boolean;
  hasResourceAccess: boolean;
  permission: Permission;
  resource: ResourceAuthContext;
  denialReason?: string;
  requiredOrganizationalScope?: string[];
  actualOrganizationalScope?: string[];
}
