/**
 * Royalty Calculation Configuration
 * Centralized configuration for all royalty calculation parameters
 */

/**
 * Minimum payout threshold in cents
 * Creators must accumulate at least this amount before payout is processed
 */
export const MINIMUM_PAYOUT_THRESHOLD_CENTS = parseInt(
  process.env.MINIMUM_PAYOUT_THRESHOLD_CENTS || '2000' // Default: $20.00
);

/**
 * Maximum rounding tolerance in cents
 * Total rounding error across all calculations in a run
 */
export const MAX_ROUNDING_TOLERANCE_CENTS = parseInt(
  process.env.MAX_ROUNDING_TOLERANCE_CENTS || '10' // Default: $0.10
);

/**
 * Rounding method
 */
export const ROUNDING_METHOD: 'BANKERS' | 'STANDARD' = 
  (process.env.ROUNDING_METHOD as 'BANKERS' | 'STANDARD') || 'BANKERS';

/**
 * Enable pro-rating for partial period licenses
 */
export const ENABLE_LICENSE_PRORATION = 
  process.env.ENABLE_LICENSE_PRORATION !== 'false'; // Default: true

/**
 * Grace period for minimum payout threshold bypass (in months)
 * If a creator has unpaid balance for this many months, bypass threshold
 */
export const THRESHOLD_BYPASS_GRACE_PERIOD_MONTHS = parseInt(
  process.env.THRESHOLD_BYPASS_GRACE_PERIOD_MONTHS || '12' // Default: 12 months
);

/**
 * VIP creator minimum threshold override (in cents)
 * Special threshold for high-value creators
 */
export const VIP_MINIMUM_PAYOUT_THRESHOLD_CENTS = parseInt(
  process.env.VIP_MINIMUM_PAYOUT_THRESHOLD_CENTS || '0' // Default: $0 (no threshold)
);

/**
 * Calculation timeout in milliseconds
 * Maximum time allowed for a single calculation run
 */
export const CALCULATION_TIMEOUT_MS = parseInt(
  process.env.CALCULATION_TIMEOUT_MS || '300000' // Default: 5 minutes
);

/**
 * Batch size for processing licenses during calculation
 */
export const LICENSE_BATCH_SIZE = parseInt(
  process.env.LICENSE_BATCH_SIZE || '100'
);

/**
 * Enable usage-based revenue calculation
 */
export const ENABLE_USAGE_REVENUE = 
  process.env.ENABLE_USAGE_REVENUE !== 'false'; // Default: true

/**
 * Default currency
 */
export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'USD';

/**
 * Enable automatic statement notifications
 */
export const ENABLE_STATEMENT_NOTIFICATIONS = 
  process.env.ENABLE_STATEMENT_NOTIFICATIONS !== 'false'; // Default: true

/**
 * Adjustment types
 */
export const ADJUSTMENT_TYPES = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  BONUS: 'BONUS',
  CORRECTION: 'CORRECTION',
  REFUND: 'REFUND',
} as const;

export type AdjustmentType = typeof ADJUSTMENT_TYPES[keyof typeof ADJUSTMENT_TYPES];

/**
 * Maximum adjustment amount without additional approval (in cents)
 */
export const MAX_ADJUSTMENT_WITHOUT_APPROVAL_CENTS = parseInt(
  process.env.MAX_ADJUSTMENT_WITHOUT_APPROVAL_CENTS || '10000' // Default: $100.00
);

/**
 * Royalty run statuses that allow locking
 */
export const LOCKABLE_RUN_STATUSES = ['CALCULATED', 'PROCESSING'] as const;

/**
 * Dispute resolution timeout (in days)
 */
export const DISPUTE_RESOLUTION_TIMEOUT_DAYS = parseInt(
  process.env.DISPUTE_RESOLUTION_TIMEOUT_DAYS || '30'
);

/**
 * Enable derivative work royalty splits
 */
export const ENABLE_DERIVATIVE_ROYALTY_SPLITS = 
  process.env.ENABLE_DERIVATIVE_ROYALTY_SPLITS === 'true'; // Default: false

/**
 * Derivative work original creator share (in basis points)
 * Applied before calculating derivative creator shares
 */
export const DERIVATIVE_ORIGINAL_CREATOR_SHARE_BPS = parseInt(
  process.env.DERIVATIVE_ORIGINAL_CREATOR_SHARE_BPS || '1000' // Default: 10%
);

/**
 * Calculation engine configuration
 */
export const CALCULATION_ENGINE_CONFIG = {
  minimumPayoutThresholdCents: MINIMUM_PAYOUT_THRESHOLD_CENTS,
  maxRoundingToleranceCents: MAX_ROUNDING_TOLERANCE_CENTS,
  roundingMethod: ROUNDING_METHOD,
  enableLicenseProration: ENABLE_LICENSE_PRORATION,
  thresholdBypassGracePeriodMonths: THRESHOLD_BYPASS_GRACE_PERIOD_MONTHS,
  vipMinimumPayoutThresholdCents: VIP_MINIMUM_PAYOUT_THRESHOLD_CENTS,
  calculationTimeoutMs: CALCULATION_TIMEOUT_MS,
  licenseBatchSize: LICENSE_BATCH_SIZE,
  enableUsageRevenue: ENABLE_USAGE_REVENUE,
  defaultCurrency: DEFAULT_CURRENCY,
  enableStatementNotifications: ENABLE_STATEMENT_NOTIFICATIONS,
  maxAdjustmentWithoutApprovalCents: MAX_ADJUSTMENT_WITHOUT_APPROVAL_CENTS,
  lockableRunStatuses: LOCKABLE_RUN_STATUSES,
  disputeResolutionTimeoutDays: DISPUTE_RESOLUTION_TIMEOUT_DAYS,
  enableDerivativeRoyaltySplits: ENABLE_DERIVATIVE_ROYALTY_SPLITS,
  derivativeOriginalCreatorShareBps: DERIVATIVE_ORIGINAL_CREATOR_SHARE_BPS,
} as const;

/**
 * Get minimum threshold for a specific creator
 * Allows for per-creator threshold overrides
 */
export async function getCreatorMinimumThreshold(
  creatorId: string,
  prisma: any
): Promise<number> {
  // Check if creator has VIP status or custom threshold
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      performanceMetrics: true,
    },
  });

  // Check for custom threshold in performance metrics
  if (creator?.performanceMetrics) {
    const metrics = creator.performanceMetrics as any;
    if (metrics.customMinimumPayoutCents !== undefined) {
      return metrics.customMinimumPayoutCents;
    }
    if (metrics.vipStatus === true) {
      return VIP_MINIMUM_PAYOUT_THRESHOLD_CENTS;
    }
  }

  return MINIMUM_PAYOUT_THRESHOLD_CENTS;
}

/**
 * Check if adjustment requires additional approval
 */
export function adjustmentRequiresApproval(adjustmentCents: number): boolean {
  const absoluteAmount = Math.abs(adjustmentCents);
  return absoluteAmount > MAX_ADJUSTMENT_WITHOUT_APPROVAL_CENTS;
}
