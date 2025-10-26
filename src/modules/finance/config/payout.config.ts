/**
 * Finance & Payout Configuration
 * Centralized configuration for financial operations and payout processing
 */

/**
 * Large payout approval threshold in cents
 * Payouts at or above this amount require additional approval via FINANCE_APPROVE_LARGE_PAYOUTS permission
 * This implements dual-authorization controls for high-value financial transactions
 */
export const LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS = parseInt(
  process.env.LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS || '1000000' // Default: $10,000.00
);

/**
 * Payout initiation rate limit per user per hour
 * Maximum number of payout initiations allowed per user within a one-hour window
 * Prevents accidental or malicious mass payout initiation
 */
export const PAYOUT_INITIATION_RATE_LIMIT_PER_HOUR = parseInt(
  process.env.PAYOUT_INITIATION_RATE_LIMIT_PER_HOUR || '50' // Default: 50 payouts/hour
);

/**
 * Enable mandatory approval workflow for large payouts
 * When true, large payouts must go through approval before processing
 */
export const ENABLE_LARGE_PAYOUT_APPROVAL_WORKFLOW = 
  process.env.ENABLE_LARGE_PAYOUT_APPROVAL_WORKFLOW !== 'false'; // Default: true

/**
 * Payout approval timeout in hours
 * Time window for approving pending payouts before they expire
 */
export const PAYOUT_APPROVAL_TIMEOUT_HOURS = parseInt(
  process.env.PAYOUT_APPROVAL_TIMEOUT_HOURS || '72' // Default: 72 hours (3 days)
);

/**
 * Enable payout data export watermarking
 * When true, exported financial data includes user identification and timestamp
 */
export const ENABLE_EXPORT_WATERMARKING = 
  process.env.ENABLE_EXPORT_WATERMARKING !== 'false'; // Default: true

/**
 * Maximum date range for financial data exports in days
 * Limits the time span that can be exported in a single operation
 */
export const MAX_EXPORT_DATE_RANGE_DAYS = parseInt(
  process.env.MAX_EXPORT_DATE_RANGE_DAYS || '365' // Default: 1 year
);

/**
 * Financial data export rate limit per user per day
 * Maximum number of export operations allowed per user within 24 hours
 */
export const EXPORT_RATE_LIMIT_PER_DAY = parseInt(
  process.env.EXPORT_RATE_LIMIT_PER_DAY || '10' // Default: 10 exports/day
);

/**
 * Enable comprehensive audit logging for all financial operations
 * When true, all financial permission usage is logged with full context
 */
export const ENABLE_FINANCIAL_AUDIT_LOGGING = 
  process.env.ENABLE_FINANCIAL_AUDIT_LOGGING !== 'false'; // Default: true

/**
 * Royalty processing batch size
 * Number of licenses to process in a single batch during royalty calculation
 */
export const ROYALTY_PROCESSING_BATCH_SIZE = parseInt(
  process.env.ROYALTY_PROCESSING_BATCH_SIZE || '100'
);

/**
 * Enable royalty calculation review workflow
 * When true, processed royalties require review before payout initiation
 */
export const ENABLE_ROYALTY_REVIEW_WORKFLOW = 
  process.env.ENABLE_ROYALTY_REVIEW_WORKFLOW === 'true'; // Default: false

/**
 * Payout velocity check window in hours
 * Time window for detecting unusual payout activity patterns
 */
export const PAYOUT_VELOCITY_CHECK_WINDOW_HOURS = parseInt(
  process.env.PAYOUT_VELOCITY_CHECK_WINDOW_HOURS || '24' // Default: 24 hours
);

/**
 * Maximum payout count per velocity check window
 * Alert threshold for number of payouts initiated within velocity window
 */
export const MAX_PAYOUTS_PER_VELOCITY_WINDOW = parseInt(
  process.env.MAX_PAYOUTS_PER_VELOCITY_WINDOW || '100' // Default: 100 payouts
);

/**
 * Check if a payout amount requires approval
 * @param amountCents - Payout amount in cents
 * @returns true if approval is required
 */
export function payoutRequiresApproval(amountCents: number): boolean {
  if (!ENABLE_LARGE_PAYOUT_APPROVAL_WORKFLOW) {
    return false;
  }
  return amountCents >= LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS;
}

/**
 * Get the large payout approval threshold for display
 * @returns Threshold amount in dollars
 */
export function getLargePayoutThresholdDisplay(): string {
  return `$${(LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Configuration object for export to other modules
 */
export const FINANCE_CONFIG = {
  largePayoutThresholdCents: LARGE_PAYOUT_APPROVAL_THRESHOLD_CENTS,
  payoutInitiationRateLimitPerHour: PAYOUT_INITIATION_RATE_LIMIT_PER_HOUR,
  enableLargePayoutApprovalWorkflow: ENABLE_LARGE_PAYOUT_APPROVAL_WORKFLOW,
  payoutApprovalTimeoutHours: PAYOUT_APPROVAL_TIMEOUT_HOURS,
  enableExportWatermarking: ENABLE_EXPORT_WATERMARKING,
  maxExportDateRangeDays: MAX_EXPORT_DATE_RANGE_DAYS,
  exportRateLimitPerDay: EXPORT_RATE_LIMIT_PER_DAY,
  enableFinancialAuditLogging: ENABLE_FINANCIAL_AUDIT_LOGGING,
  royaltyProcessingBatchSize: ROYALTY_PROCESSING_BATCH_SIZE,
  enableRoyaltyReviewWorkflow: ENABLE_ROYALTY_REVIEW_WORKFLOW,
  payoutVelocityCheckWindowHours: PAYOUT_VELOCITY_CHECK_WINDOW_HOURS,
  maxPayoutsPerVelocityWindow: MAX_PAYOUTS_PER_VELOCITY_WINDOW,
} as const;
