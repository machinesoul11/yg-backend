export interface RoyaltyModuleTypes {}
export const royaltiesRouter = {};
/**
 * Royalty Module Type Definitions
 */

export interface RoyaltyRunSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  statementsCount: number;
  createdAt: string;
  lockedAt?: string;
  processedAt?: string;
}

export interface RoyaltyRunDetails extends RoyaltyRunSummary {
  notes?: string;
  statements: RoyaltyStatementSummary[];
  createdBy: {
    id: string;
    name: string;
  };
}

export interface RoyaltyStatementSummary {
  id: string;
  creatorId: string;
  creatorName: string;
  totalEarningsCents: number;
  status: string;
  reviewedAt?: string;
  disputedAt?: string;
  paidAt?: string;
}

export interface RoyaltyStatementDetails {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
  };
  totalEarningsCents: number;
  status: string;
  lines: RoyaltyLineDetails[];
  pdfUrl?: string;
  reviewedAt?: string;
  disputedAt?: string;
  disputeReason?: string;
  paidAt?: string;
  paymentReference?: string;
  createdAt: string;
}

export interface RoyaltyLineDetails {
  id: string;
  ipAsset: {
    id: string;
    title: string;
    type: string;
  };
  license: {
    id: string;
    brandName: string;
    licenseType: string;
  };
  revenueCents: number;
  shareBps: number;
  calculatedRoyaltyCents: number;
  periodStart: string;
  periodEnd: string;
  metadata?: any;
}

export interface CreatorEarningsSummary {
  totalEarningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  earningsByMonth: MonthlyEarnings[];
  topAssets: TopEarningAsset[];
}

export interface MonthlyEarnings {
  month: string;
  earningsCents: number;
  paidCents: number;
}

export interface TopEarningAsset {
  ipAssetId: string;
  title: string;
  totalEarningsCents: number;
  licensesCount: number;
}

export interface CreatorEarningsForecast {
  currentMonthProjectedCents: number;
  nextMonthProjectedCents: number;
  activeLicensesCount: number;
  averageMonthlyEarningsCents: number;
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
}

export interface RoyaltyCalculationJobData {
  runId: string;
  userId: string;
}

export interface StatementNotificationJobData {
  runId: string;
}

export interface PayoutInitiationJobData {
  runId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
}

/**
 * Adjustment Types
 */
export type AdjustmentType = 'CREDIT' | 'DEBIT' | 'BONUS' | 'CORRECTION' | 'REFUND';

/**
 * Adjustment Request
 */
export interface AdjustmentRequest {
  statementId: string;
  adjustmentCents: number;
  adjustmentType: AdjustmentType;
  reason: string;
  requiresApproval: boolean;
}

/**
 * Calculation Metadata
 */
export interface CalculationMetadata {
  totalLicenses: number;
  totalCreators: number;
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  roundingDifferenceCents: number;
  calculationDurationMs: number;
  proratedLicenses: number;
  carryoverStatements: number;
}

/**
 * Period Configuration
 */
export interface PeriodConfiguration {
  periodStart: Date;
  periodEnd: Date;
  periodType: 'MONTHLY' | 'QUARTERLY' | 'CUSTOM';
  fiscalYearStart?: number;
}

/**
 * Threshold Configuration
 */
export interface ThresholdConfiguration {
  minimumPayoutCents: number;
  bypassGracePeriodMonths: number;
  vipMinimumCents: number;
}

/**
 * Revenue Breakdown
 */
export interface RevenueBreakdown {
  totalRevenueCents: number;
  flatFeeCents: number;
  usageRevenueCents: number;
  adjustmentsCents: number;
  prorated: boolean;
  daysActive: number;
  totalDays: number;
}

/**
 * Ownership Split Result
 */
export interface OwnershipSplitResult {
  creatorId: string;
  creatorName: string;
  shareBps: number;
  sharePercentage: number;
  calculatedRoyaltyCents: number;
  roundingAdjustmentCents: number;
}
