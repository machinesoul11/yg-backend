/**
 * License Usage Tracking Types
 * Type definitions for the usage tracking system
 */

import type { 
  LicenseUsageEvent, 
  LicenseUsageDailyAggregate,
  LicenseUsageThreshold,
  LicenseUsageOverage,
  LicenseUsageForecast 
} from '@prisma/client';

// ============================================================================
// Usage Event Types
// ============================================================================

export type UsageType = 
  | 'view' 
  | 'download' 
  | 'impression' 
  | 'click' 
  | 'play' 
  | 'stream'
  | 'custom';

export type Platform = 'web' | 'mobile' | 'tv' | 'print' | 'social' | 'other';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv' | 'other';

export interface TrackUsageEventInput {
  licenseId: string;
  usageType: UsageType;
  quantity?: number;
  geographicLocation?: string;
  platform?: Platform;
  deviceType?: DeviceType;
  referrer?: string;
  revenueCents?: number;
  metadata?: Record<string, any>;
  sessionId?: string;
  idempotencyKey?: string;
}

export interface BatchTrackUsageInput {
  events: TrackUsageEventInput[];
  batchId?: string;
}

export interface UsageEventResult {
  eventId: string | null;
  tracked: boolean;
  error?: string;
}

// ============================================================================
// Usage Analytics Types
// ============================================================================

export interface UsageMetrics {
  totalViews: number;
  totalDownloads: number;
  totalImpressions: number;
  totalClicks: number;
  totalPlays: number;
  totalStreams: number;
  totalQuantity: number;
  totalRevenueCents: number;
  uniqueSessions: number;
}

export interface UsageTrend {
  date: Date;
  metrics: UsageMetrics;
}

export interface UsageAnalytics {
  licenseId: string;
  periodStart: Date;
  periodEnd: Date;
  currentPeriod: UsageMetrics;
  previousPeriod?: UsageMetrics;
  percentageChange?: Partial<Record<keyof UsageMetrics, number>>;
  trends: UsageTrend[];
  topSources?: UsageSource[];
  topPlatforms?: PlatformUsage[];
  geographicDistribution?: GeographicUsage[];
}

export interface UsageSource {
  referrer: string;
  count: number;
  percentage: number;
}

export interface PlatformUsage {
  platform: Platform;
  count: number;
  percentage: number;
}

export interface GeographicUsage {
  location: string;
  count: number;
  percentage: number;
}

export interface GetUsageAnalyticsInput {
  licenseId: string;
  startDate: Date;
  endDate: Date;
  usageType?: UsageType;
  granularity?: 'daily' | 'weekly' | 'monthly';
  compareWithPreviousPeriod?: boolean;
}

export interface ComparePeriods {
  licenseId: string;
  period1Start: Date;
  period1End: Date;
  period2Start: Date;
  period2End: Date;
  usageType?: UsageType;
}

export interface PeriodComparison {
  period1: UsageMetrics;
  period2: UsageMetrics;
  absoluteChange: Partial<UsageMetrics>;
  percentageChange: Partial<Record<keyof UsageMetrics, number>>;
}

// ============================================================================
// Threshold & Overage Types
// ============================================================================

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'total';

export type OverageStatus = 
  | 'DETECTED' 
  | 'PENDING_APPROVAL' 
  | 'APPROVED' 
  | 'BILLED' 
  | 'DISPUTED';

export interface CreateThresholdInput {
  licenseId: string;
  usageType: UsageType;
  limitQuantity: number;
  periodType: PeriodType;
  gracePercentage?: number;
  warningAt50?: boolean;
  warningAt75?: boolean;
  warningAt90?: boolean;
  warningAt100?: boolean;
  allowOverage?: boolean;
  overageRateCents?: number;
}

export interface UpdateThresholdInput {
  thresholdId: string;
  limitQuantity?: number;
  gracePercentage?: number;
  warningAt50?: boolean;
  warningAt75?: boolean;
  warningAt90?: boolean;
  warningAt100?: boolean;
  allowOverage?: boolean;
  overageRateCents?: number;
  isActive?: boolean;
}

export interface ThresholdStatus {
  threshold: LicenseUsageThreshold;
  currentUsage: number;
  limit: number;
  limitWithGrace: number;
  percentageUsed: number;
  remaining: number;
  isWarningLevel: boolean;
  isOverLimit: boolean;
  projectedExceededDate?: Date;
}

export interface OverageDetectionResult {
  licenseId: string;
  hasOverages: boolean;
  overages: LicenseUsageOverage[];
  totalOverageQuantity: number;
  totalOverageFeeCents: number;
}

export interface ApproveOverageInput {
  overageId: string;
  approvedBy: string;
  billedFeeCents?: number;
  notes?: string;
}

// ============================================================================
// Forecasting Types
// ============================================================================

export type ForecastingMethod = 
  | 'LINEAR_REGRESSION' 
  | 'MOVING_AVERAGE' 
  | 'EXPONENTIAL_SMOOTHING'
  | 'SEASONAL_DECOMPOSITION';

export interface GenerateForecastInput {
  licenseId: string;
  usageType: UsageType;
  periodStart: Date;
  periodEnd: Date;
  forecastingMethod?: ForecastingMethod;
  historicalDays?: number;
  confidenceLevel?: number;
}

export interface ForecastResult {
  forecast: LicenseUsageForecast;
  thresholdBreach?: {
    threshold: LicenseUsageThreshold;
    predictedBreachDate: Date;
    daysUntilBreach: number;
    breachProbability: number;
  };
}

export interface ForecastAccuracy {
  forecastId: string;
  predictedQuantity: number;
  actualQuantity: number;
  error: number;
  percentageError: number;
  isWithinBounds: boolean;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface UsageDashboardData {
  license: {
    id: string;
    brandName: string;
    assetTitle: string;
    licenseType: string;
    startDate: Date;
    endDate: Date;
  };
  currentPeriodUsage: UsageMetrics;
  thresholds: ThresholdStatus[];
  recentOverages: LicenseUsageOverage[];
  forecasts: ForecastResult[];
  trends: UsageTrend[];
  topSources: UsageSource[];
  alerts: UsageAlert[];
}

export interface UsageAlert {
  type: 'warning' | 'overage' | 'forecast';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  actionRequired: boolean;
  actionUrl?: string;
  createdAt: Date;
}

// ============================================================================
// Reporting Types
// ============================================================================

export interface UsageReportConfig {
  licenseIds?: string[];
  brandId?: string;
  creatorId?: string;
  startDate: Date;
  endDate: Date;
  includeForecasts?: boolean;
  includeOverages?: boolean;
  includeComparisons?: boolean;
  format?: 'pdf' | 'csv' | 'json';
}

export interface UsageReport {
  reportId: string;
  config: UsageReportConfig;
  generatedAt: Date;
  generatedBy: string;
  summary: {
    totalLicenses: number;
    totalUsageEvents: number;
    totalRevenueCents: number;
    totalOverages: number;
    totalOverageFeeCents: number;
  };
  licenseReports: LicenseUsageReport[];
  downloadUrl?: string;
}

export interface LicenseUsageReport {
  licenseId: string;
  brandName: string;
  assetTitle: string;
  periodUsage: UsageMetrics;
  thresholdBreaches: number;
  overages: LicenseUsageOverage[];
  totalOverageFeeCents: number;
  forecast?: ForecastResult;
}

export interface ScheduledReportConfig {
  id?: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  recipients: string[]; // email addresses
  reportConfig: UsageReportConfig;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

// ============================================================================
// Billing Integration Types
// ============================================================================

export interface UsageBasedBillingTrigger {
  overageId: string;
  licenseId: string;
  brandId: string;
  overageQuantity: number;
  calculatedFeeCents: number;
  billedFeeCents: number;
  description: string;
  metadata: Record<string, any>;
}

export interface CreateUsageInvoiceInput {
  overageId: string;
  brandId: string;
  feeCents: number;
  description: string;
  dueDate?: Date;
  metadata?: Record<string, any>;
}

export interface UsageBasedRoyalty {
  licenseId: string;
  creatorId: string;
  usageRevenueCents: number;
  shareBps: number;
  calculatedRoyaltyCents: number;
  periodStart: Date;
  periodEnd: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class UsageTrackingError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'UsageTrackingError';
  }
}

export class ThresholdExceededError extends UsageTrackingError {
  constructor(
    public licenseId: string,
    public usageType: UsageType,
    public currentUsage: number,
    public limit: number
  ) {
    super(`Usage limit exceeded for ${usageType}: ${currentUsage}/${limit}`);
    this.code = 'THRESHOLD_EXCEEDED';
  }
}

export class ForecastGenerationError extends UsageTrackingError {
  constructor(message: string, public cause?: Error) {
    super(`Forecast generation failed: ${message}`);
    this.code = 'FORECAST_ERROR';
  }
}

// ============================================================================
// Re-export Prisma types
// ============================================================================

export type {
  LicenseUsageEvent,
  LicenseUsageDailyAggregate,
  LicenseUsageThreshold,
  LicenseUsageOverage,
  LicenseUsageForecast,
};
