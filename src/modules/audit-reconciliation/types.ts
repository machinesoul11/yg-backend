/**
 * Audit & Reconciliation Module Types
 * 
 * Comprehensive type definitions for audit trails, reconciliation reports,
 * discrepancy detection, and financial audit logging
 */

export interface AuditReconciliationModuleTypes {}

/**
 * Base Audit Report Configuration
 */
export interface BaseAuditConfig {
  startDate: Date;
  endDate: Date;
  requestedBy?: string;
  format?: 'pdf' | 'csv' | 'json';
  includeDetails?: boolean;
  filters?: AuditFilters;
}

/**
 * Audit Filters
 */
export interface AuditFilters {
  entityTypes?: string[];
  entityIds?: string[];
  userIds?: string[];
  transactionTypes?: string[];
  statuses?: string[];
  amounts?: {
    min?: number;
    max?: number;
  };
  severityLevels?: DiscrepancySeverity[];
}

/**
 * Transaction Audit Trail Report
 */
export interface TransactionAuditTrailReport {
  id: string;
  type: 'TRANSACTION_AUDIT_TRAIL';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Core audit data
  auditEntries: TransactionAuditEntry[];
  totalEntries: number;
  
  // Summary metrics
  transactionCount: number;
  totalAmountCents: number;
  uniqueUsers: number;
  entitiesModified: number;
  
  // Breakdown by type
  actionBreakdown: Array<{
    action: string;
    count: number;
    percentage: number;
  }>;
  
  // Entity breakdown
  entityBreakdown: Array<{
    entityType: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Transaction Audit Entry
 */
export interface TransactionAuditEntry {
  id: string;
  timestamp: Date;
  
  // Actor information
  userId?: string;
  userEmail?: string;
  userRole?: string;
  
  // Transaction information
  entityType: string;
  entityId: string;
  action: string;
  
  // Change tracking
  beforeState?: any;
  afterState?: any;
  changes: FieldChange[];
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  
  // Financial impact
  amountImpact?: {
    previousCents: number;
    newCents: number;
    deltaCents: number;
  };
  
  // Risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: string[];
}

/**
 * Field Change
 */
export interface FieldChange {
  field: string;
  previousValue: any;
  newValue: any;
  type: 'CREATED' | 'UPDATED' | 'DELETED';
}

/**
 * Stripe Reconciliation Report
 */
export interface StripeReconciliationReport {
  id: string;
  type: 'STRIPE_RECONCILIATION';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Reconciliation results
  matchedTransactions: ReconciledTransaction[];
  unmatchedInternal: UnmatchedTransaction[];
  unmatchedStripe: UnmatchedTransaction[];
  discrepancies: ReconciliationDiscrepancy[];
  
  // Summary metrics
  totalInternalCents: number;
  totalStripeCents: number;
  discrepancyCents: number;
  reconciliationRate: number; // percentage matched
  
  // Status counts
  matchedCount: number;
  unmatchedInternalCount: number;
  unmatchedStripeCount: number;
  discrepancyCount: number;
}

/**
 * Reconciled Transaction
 */
export interface ReconciledTransaction {
  internalTransactionId: string;
  stripeTransactionId: string;
  matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
  matchConfidence: number; // 0-1
  internalAmount: number;
  stripeAmount: number;
  amountMatch: boolean;
  timestampDiff: number; // milliseconds
  metadata: {
    internalData: any;
    stripeData: any;
  };
}

/**
 * Unmatched Transaction
 */
export interface UnmatchedTransaction {
  id: string;
  source: 'INTERNAL' | 'STRIPE';
  amount: number;
  timestamp: Date;
  description: string;
  metadata: any;
  possibleMatches: Array<{
    id: string;
    confidence: number;
    reasons: string[];
  }>;
}

/**
 * Reconciliation Discrepancy
 */
export interface ReconciliationDiscrepancy {
  id: string;
  type: 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH' | 'TIMING_MISMATCH' | 'METADATA_MISMATCH';
  severity: DiscrepancySeverity;
  internalTransactionId: string;
  stripeTransactionId: string;
  description: string;
  details: {
    internal: any;
    stripe: any;
    differences: any;
  };
  suggestedAction?: string;
  investigationNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * Bank Statement Reconciliation Report
 */
export interface BankReconciliationReport {
  id: string;
  type: 'BANK_RECONCILIATION';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Bank statement info
  bankStatementId: string;
  bankName: string;
  accountNumber: string; // masked
  statementPeriod: {
    start: Date;
    end: Date;
  };
  
  // Reconciliation results
  matchedTransactions: BankReconciledTransaction[];
  unmatchedBank: BankTransaction[];
  unmatchedInternal: BankTransaction[];
  
  // Summary
  bankBalanceCents: number;
  calculatedBalanceCents: number;
  reconciliationDifferenceCents: number;
  reconciled: boolean;
}

/**
 * Bank Reconciled Transaction
 */
export interface BankReconciledTransaction {
  bankTransactionId: string;
  internalTransactionId: string;
  bankAmount: number;
  internalAmount: number;
  bankDate: Date;
  internalDate: Date;
  description: string;
  matchType: 'AUTO' | 'MANUAL' | 'FUZZY';
  confidence: number;
}

/**
 * Bank Transaction
 */
export interface BankTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category?: string;
  reference?: string;
  balance?: number;
  metadata?: any;
}

/**
 * Discrepancy Detection Report
 */
export interface DiscrepancyDetectionReport {
  id: string;
  type: 'DISCREPANCY_DETECTION';
  generatedAt: Date;
  generatedBy: string;
  
  // Detected discrepancies
  discrepancies: DetectedDiscrepancy[];
  
  // Summary by type
  discrepancyBreakdown: Array<{
    type: string;
    count: number;
    severity: DiscrepancySeverity;
    totalImpactCents: number;
  }>;
  
  // Risk assessment
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedActions: string[];
}

/**
 * Detected Discrepancy
 */
export interface DetectedDiscrepancy {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  title: string;
  description: string;
  
  // Affected entities
  entityType: string;
  entityId: string;
  relatedEntities: Array<{
    type: string;
    id: string;
  }>;
  
  // Financial impact
  impactCents?: number;
  potentialLossCents?: number;
  
  // Detection metadata
  detectedAt: Date;
  ruleId?: string;
  confidence: number; // 0-1
  evidence: any[];
  
  // Investigation
  status: 'NEW' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  assignedTo?: string;
  investigationNotes?: string;
  resolvedAt?: Date;
  resolution?: string;
}

/**
 * Discrepancy Types
 */
export type DiscrepancyType = 
  | 'ORPHANED_TRANSACTION'
  | 'IMPOSSIBLE_STATE'
  | 'AMOUNT_MISMATCH'
  | 'DUPLICATE_TRANSACTION'
  | 'TEMPORAL_INCONSISTENCY'
  | 'MISSING_APPROVAL'
  | 'THRESHOLD_VIOLATION'
  | 'FRAUD_INDICATOR'
  | 'DATA_INTEGRITY'
  | 'COMPLIANCE_VIOLATION';

/**
 * Discrepancy Severity
 */
export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Failed Transaction Report
 */
export interface FailedTransactionReport {
  id: string;
  type: 'FAILED_TRANSACTIONS';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Failed transactions
  failedTransactions: FailedTransaction[];
  
  // Analysis
  failureBreakdown: Array<{
    category: string;
    count: number;
    percentage: number;
    totalAmountCents: number;
    avgAmountCents: number;
  }>;
  
  // Trends
  dailyFailureRates: Array<{
    date: Date;
    totalAttempts: number;
    failures: number;
    failureRate: number;
  }>;
  
  // Customer impact
  affectedCustomers: number;
  repeatOffenders: Array<{
    customerId: string;
    failureCount: number;
    totalAmountCents: number;
  }>;
}

/**
 * Failed Transaction
 */
export interface FailedTransaction {
  id: string;
  attemptedAt: Date;
  failedAt: Date;
  
  // Transaction details
  amountCents: number;
  currency: string;
  customerId?: string;
  customerEmail?: string;
  
  // Failure details
  errorCode: string;
  errorMessage: string;
  errorCategory: FailureCategory;
  failureReason: string;
  
  // Context
  paymentMethod: string;
  ipAddress?: string;
  userAgent?: string;
  retryCount: number;
  
  // System context
  systemState: any;
  stackTrace?: string;
  
  // Resolution
  retryable: boolean;
  suggestedAction?: string;
  customerNotified: boolean;
}

/**
 * Failure Categories
 */
export type FailureCategory = 
  | 'PAYMENT_DECLINED'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_CARD'
  | 'PROCESSOR_ERROR'
  | 'NETWORK_ERROR'
  | 'SYSTEM_ERROR'
  | 'FRAUD_DETECTED'
  | 'BUSINESS_RULE'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN';

// Removed duplicate RefundChargebackReport - using enhanced version below

/**
 * Refund Entry
 */
export interface RefundEntry {
  id: string;
  originalTransactionId: string;
  refundedAt: Date;
  amountCents: number;
  reason: string;
  reasonCategory: RefundCategory;
  requestedBy: 'CUSTOMER' | 'MERCHANT' | 'SYSTEM';
  
  // Processing
  processingTimeDays: number;
  processingStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  
  // Cost analysis
  refundFeeCents: number;
  processingFeeCents: number;
  totalCostCents: number;
  
  // Customer info
  customerId?: string;
  customerTier?: string;
  isRepeatCustomer: boolean;
}

/**
 * Chargeback Entry
 */
export interface ChargebackEntry {
  id: string;
  originalTransactionId: string;
  chargebackDate: Date;
  amountCents: number;
  reasonCode: string;
  reasonDescription: string;
  
  // Dispute process
  status: ChargebackStatus;
  disputeDeadline?: Date;
  evidenceSubmitted: boolean;
  evidenceSubmittedAt?: Date;
  resolution?: ChargebackResolution;
  resolvedAt?: Date;
  
  // Financial impact
  chargebackFeeCents: number;
  liabilityShiftCents: number;
  totalCostCents: number;
  
  // Evidence and defense
  evidenceDocuments: string[];
  defenseStrategy?: string;
  winProbability?: number;
}

/**
 * Refund Categories
 */
export type RefundCategory = 
  | 'PRODUCT_ISSUE'
  | 'SERVICE_ISSUE'
  | 'BILLING_ERROR'
  | 'CUSTOMER_REQUEST'
  | 'FRAUD_PREVENTION'
  | 'TECHNICAL_ERROR'
  | 'POLICY_VIOLATION'
  | 'OTHER';

/**
 * Chargeback Status
 */
export type ChargebackStatus = 
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'EVIDENCE_REQUIRED'
  | 'EVIDENCE_SUBMITTED'
  | 'AWAITING_DECISION'
  | 'WON'
  | 'LOST'
  | 'EXPIRED';

/**
 * Chargeback Resolution
 */
export type ChargebackResolution = 
  | 'MERCHANT_WINS'
  | 'CUSTOMER_WINS'
  | 'PARTIAL_REFUND'
  | 'EXPIRED_UNDEFENDED'
  | 'WITHDRAWN';

/**
 * Financial Audit Log Entry
 */
export interface FinancialAuditLogEntry {
  id: string;
  timestamp: Date;
  
  // Actor
  userId?: string;
  userEmail?: string;
  userRole?: string;
  actorType: 'USER' | 'SYSTEM' | 'API' | 'WEBHOOK';
  
  // Action
  action: string;
  category: AuditCategory;
  subcategory?: string;
  
  // Target
  entityType: string;
  entityId: string;
  
  // Financial context
  financialImpact: {
    amountCents: number;
    currency: string;
    direction: 'DEBIT' | 'CREDIT' | 'NEUTRAL';
    affectsBalance: boolean;
  };
  
  // Change details
  changes: FieldChange[];
  beforeState?: any;
  afterState?: any;
  
  // Context
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  sourceSystem: string;
  
  // Risk and compliance
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  complianceFlags: string[];
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  
  // Metadata
  metadata: any;
  tags: string[];
}

/**
 * Audit Categories
 */
export type AuditCategory = 
  | 'TRANSACTION'
  | 'PAYMENT'
  | 'REFUND'
  | 'CHARGEBACK'
  | 'PAYOUT'
  | 'RECONCILIATION'
  | 'ADJUSTMENT'
  | 'CONFIGURATION'
  | 'ACCESS_CONTROL'
  | 'COMPLIANCE'
  | 'SYSTEM';

/**
 * Reconciliation Configuration
 */
export interface ReconciliationConfig {
  // Stripe reconciliation
  stripe: {
    enabled: boolean;
    frequency: 'HOURLY' | 'DAILY' | 'WEEKLY';
    retentionDays: number;
    alertThresholds: {
      discrepancyPercentage: number;
      unmatchedAmount: number;
    };
  };
  
  // Bank reconciliation
  bank: {
    enabled: boolean;
    supportedFormats: string[];
    autoImport: boolean;
    matchingRules: BankMatchingRule[];
  };
  
  // Discrepancy detection
  discrepancyDetection: {
    enabled: boolean;
    rules: DiscrepancyRule[];
    alertChannels: string[];
  };
}

/**
 * Bank Matching Rule
 */
export interface BankMatchingRule {
  id: string;
  name: string;
  priority: number;
  conditions: {
    amountTolerance: number; // percentage
    dateTolerance: number; // days
    descriptionPatterns: string[];
  };
  actions: {
    autoMatch: boolean;
    requireApproval: boolean;
  };
}

/**
 * Discrepancy Rule
 */
export interface DiscrepancyRule {
  id: string;
  name: string;
  category: DiscrepancyType;
  severity: DiscrepancySeverity;
  enabled: boolean;
  conditions: any; // rule-specific conditions
  actions: {
    alert: boolean;
    block: boolean;
    requireInvestigation: boolean;
  };
}

/**
 * Audit Report Generation Request
 */
export interface AuditReportRequest {
  reportType: AuditReportType;
  config: BaseAuditConfig;
  deliveryOptions?: {
    email?: string[];
    webhook?: string;
    storage?: boolean;
  };
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

/**
 * Audit Report Types
 */
export type AuditReportType = 
  | 'TRANSACTION_AUDIT_TRAIL'
  | 'STRIPE_RECONCILIATION'
  | 'BANK_RECONCILIATION'
  | 'DISCREPANCY_DETECTION'
  | 'FAILED_TRANSACTIONS'
  | 'REFUNDS_CHARGEBACKS'
  | 'FINANCIAL_AUDIT_LOG';

/**
 * Audit Report Result
 */
export interface AuditReportResult {
  id: string;
  reportType: AuditReportType;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
  generatedAt?: Date;
  downloadUrl?: string;
  errorMessage?: string;
  metadata: {
    recordCount: number;
    period: {
      startDate: Date;
      endDate: Date;
    };
    generatedBy: string;
  };
}

/**
 * Base Report interface for all report types
 */
export interface BaseReport {
  id: string;
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Refund Transaction for reports
 */
export interface RefundTransaction {
  id: string;
  originalTransactionId: string;
  processedAt: Date;
  
  // Financial details
  refundAmountCents: number;
  originalAmountCents: number;
  currency: string;
  
  // Customer details
  customerId: string;
  customerEmail: string;
  
  // Refund details
  reason: string;
  refundMethod: string;
  status: string;
  
  // Context
  initiatedBy: string;
  customerInitiated: boolean;
  
  // Metadata
  isPartial: boolean;
  feeRefunded: boolean;
  
  // Processing details
  processingTimeHours: number;
  stripeRefundId?: string;
  internalNotes: string;
  
  // Financial impact
  netImpactCents: number;
}

/**
 * Chargeback Transaction for reports
 */
export interface ChargebackTransaction {
  id: string;
  originalTransactionId: string;
  disputeCreatedAt: Date;
  
  // Financial details
  disputeAmountCents: number;
  originalAmountCents: number;
  currency: string;
  
  // Customer details
  customerId: string;
  customerEmail: string;
  
  // Dispute details
  reason: string;
  status: DisputeStatus;
  evidenceDueBy: Date | null;
  
  // Response tracking
  evidenceSubmitted: boolean;
  evidenceSubmittedAt: Date | null;
  
  // Outcome
  isLiable: boolean;
  networkReasonCode: string;
  
  // Financial impact
  chargebackFeeCents: number;
  netImpactCents: number;
  
  // Metadata
  stripeDisputeId: string;
  isInquiry: boolean;
  
  // Resolution
  resolvedAt: Date | null;
  resolutionMethod: string;
}

/**
 * Dispute Status for chargebacks
 */
export enum DisputeStatus {
  PENDING = 'PENDING',
  WARNING = 'WARNING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REFUNDED = 'REFUNDED',
  WON = 'WON',
  LOST = 'LOST'
}

/**
 * Enhanced Refund Chargeback Report
 */
export interface RefundChargebackReport extends BaseReport {
  type: 'REFUNDS_CHARGEBACKS';
  refunds: RefundTransaction[];
  chargebacks: ChargebackTransaction[];
  
  // Summary statistics
  refundSummary: {
    totalRefunds: number;
    totalRefundAmountCents: number;
    partialRefundsCount: number;
    customerInitiatedCount: number;
    avgProcessingHours: number;
    refundRate: number;
    reasonBreakdown: Array<{
      reason: string;
      count: number;
      percentage: number;
    }>;
  };
  
  chargebackSummary: {
    totalChargebacks: number;
    totalDisputeAmountCents: number;
    lostChargebacksCount: number;
    wonChargebacksCount: number;
    winRate: number;
    chargebackRate: number;
    reasonBreakdown: Array<{
      reason: string;
      count: number;
      percentage: number;
    }>;
  };
  
  // Financial impact
  netFinancialImpact: {
    totalRefundImpactCents: number;
    totalChargebackImpactCents: number;
    totalNetImpactCents: number;
    refundsByReason: Array<{
      reason: string;
      count: number;
      impactCents: number;
    }>;
    chargebacksByReason: Array<{
      reason: string;
      count: number;
      impactCents: number;
    }>;
  };
  
  // Trend analysis
  trendAnalysis: Array<{
    date: Date;
    refundCount: number;
    chargebackCount: number;
    netImpactCents: number;
  }>;
  
  // Top reasons analysis
  topReasons: Array<{
    reason: string;
    type: 'refund' | 'chargeback';
    count: number;
    impactCents: number;
  }>;
}

/**
 * Financial Audit Log
 */
export interface FinancialAuditLog {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  entityType: string;
  entityId: string;
  userId?: string;
  userEmail?: string;
  
  // Financial context
  amountCents?: number;
  currency?: string;
  transactionId?: string;
  
  // Audit details
  action: string;
  beforeState?: any;
  afterState?: any;
  
  // Compliance
  complianceLevel: ComplianceLevel;
  regulatoryFlags: string[];
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  systemContext: any;
  
  // Impact assessment
  riskLevel: RiskLevel;
  impactAssessment: string;
}

/**
 * Audit Event Type
 */
export type AuditEventType = 
  | 'PAYMENT_CREATED'
  | 'PAYMENT_UPDATED'
  | 'PAYMENT_FAILED'
  | 'REFUND_ISSUED'
  | 'CHARGEBACK_RECEIVED'
  | 'PAYOUT_CREATED'
  | 'PAYOUT_FAILED'
  | 'USER_ACTION'
  | 'SYSTEM_ACTION'
  | 'API_CALL'
  | 'WEBHOOK_RECEIVED';

/**
 * Compliance Level
 */
export type ComplianceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'REGULATORY';

/**
 * Risk Level
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Financial Audit Logs Report
 */
export interface FinancialAuditLogsReport extends BaseReport {
  type: 'FINANCIAL_AUDIT_LOGS';
  auditLogs: FinancialAuditLog[];
  
  // Summary analytics
  eventBreakdown: Array<{
    eventType: AuditEventType;
    count: number;
    percentage: number;
  }>;
  
  riskBreakdown: Array<{
    riskLevel: RiskLevel;
    count: number;
    percentage: number;
  }>;
  
  complianceBreakdown: Array<{
    level: ComplianceLevel;
    count: number;
    percentage: number;
  }>;
  
  // Compliance metrics
  totalComplianceEvents: number;
  highRiskEvents: number;
  regulatoryFlaggedEvents: number;
  
  // Time-based analysis
  dailyActivity: Array<{
    date: Date;
    eventCount: number;
    highRiskCount: number;
    complianceEvents: number;
  }>;
}
