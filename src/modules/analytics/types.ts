/**
 * Analytics Module Type Definitions
 * Comprehensive types for analytics services and responses
 */

/**
 * Request Context for Event Tracking
 */
export interface RequestContext {
  session?: {
    userId: string;
    role: string;
    email?: string;
  };
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Event Creation Response
 */
export interface EventCreated {
  eventId: string | null;
  tracked: boolean;
}

/**
 * Common Types
 */
export interface DateRange {
  start: Date | string;
  end: Date | string;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Revenue Analytics Types
 */
export interface RevenueMetrics {
  period: {
    start: string;
    end: string;
  };
  mrr: {
    current: number;
    previous: number;
    growth: number;
    growthAbsolute: number;
  };
  arr: {
    current: number;
    previous: number;
    growth: number;
    growthAbsolute: number;
  };
  breakdown: {
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnedMrr: number;
  };
  historicalData: Array<{
    date: string;
    mrr: number;
    arr: number;
    newCustomers: number;
    churnedCustomers: number;
  }>;
}

export interface TransactionAnalytics {
  period: {
    start: string;
    end: string;
  };
  volume: {
    total: number;
    successful: number;
    failed: number;
    refunded: number;
    pending: number;
    successRate: number;
    failureRate: number;
    refundRate: number;
  };
  value: {
    totalCents: number;
    averageCents: number;
    medianCents: number;
    successfulCents: number;
    refundedCents: number;
    currency: string;
  };
  byPaymentMethod: Array<{
    method: string;
    count: number;
    totalCents: number;
    averageCents: number;
    successRate: number;
  }>;
  timeline: Array<{
    date: string;
    count: number;
    totalCents: number;
    averageCents: number;
    successfulCount: number;
    failedCount: number;
  }>;
}

export interface LTVAnalytics {
  period: {
    start: string;
    end: string;
  };
  overall: {
    averageLTVCents: number;
    medianLTVCents: number;
    totalCustomers: number;
    totalRevenueCents: number;
  };
  byCohort: Array<{
    cohortPeriod: string;
    cohortSize: number;
    averageLTVCents: number;
    medianLTVCents: number;
    totalRevenueCents: number;
    averageLifespanDays: number;
  }>;
  distribution: {
    percentile25: number;
    percentile50: number;
    percentile75: number;
    percentile90: number;
    percentile95: number;
  };
  bySegment: Array<{
    segment: string;
    averageLTVCents: number;
    customerCount: number;
    totalRevenueCents: number;
  }>;
}

/**
 * Platform Analytics Types (existing)
 */
export interface UserAnalytics {
  period: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  dateRange: {
    start: string;
    end: string;
  };
  acquisition: {
    newUsers: number;
    newUsersGrowth: number;
    timeline: Array<{
      date: string;
      count: number;
      cumulative: number;
    }>;
  };
  retention: {
    overall: number;
    cohorts: Array<{
      cohortPeriod: string;
      cohortSize: number;
      retentionRates: Array<{
        period: number;
        rate: number;
        retained: number;
      }>;
    }>;
  };
  churn: {
    churnedUsers: number;
    churnRate: number;
    timeline: Array<{
      date: string;
      churned: number;
      rate: number;
    }>;
  };
}

export interface EngagementAnalytics {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  dailyActiveUsers: {
    average: number;
    peak: number;
    timeline: Array<{
      date: string;
      count: number;
    }>;
  };
  monthlyActiveUsers: {
    current: number;
    previous: number;
    growth: number;
  };
  sessionMetrics: {
    totalSessions: number;
    averageDuration: number;
    medianDuration: number;
    sessionsPerUser: number;
    timeline: Array<{
      date: string;
      sessions: number;
      avgDuration: number;
    }>;
  };
  engagement: {
    dauToMauRatio: number;
    userStickiness: number;
    avgEventsPerUser: number;
  };
}

export interface CohortAnalysis {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  dateRange: {
    start: string;
    end: string;
  };
  cohorts: Array<{
    cohortPeriod: string;
    cohortSize: number;
    periods: Array<{
      period: number;
      value: number;
      percentage: number;
    }>;
  }>;
}

/**
 * Event Tracking Types
 */
export interface EventTrackingData {
  eventType: string;
  source: string;
  entityId?: string;
  entityType?: string;
  sessionId?: string;
  props?: Record<string, any>;
  attribution?: AttributionData;
  idempotencyKey?: string;
}

export interface AttributionData {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
}

/**
 * Post Analytics Types
 */
export interface PostAnalytics {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  overview: {
    views: number;
    uniqueVisitors: number;
    avgEngagementTime: number;
    avgScrollDepth: number;
    bounceRate: number;
    conversionRate: number;
  };
  timeline: Array<{
    date: string;
    views: number;
    uniqueVisitors: number;
    engagementTime: number;
    scrollDepth: number;
  }>;
  referrers: Array<{
    source: string;
    visits: number;
    percentage: number;
  }>;
  cta: {
    totalClicks: number;
    byType: Array<{
      type: string;
      clicks: number;
      conversionRate: number;
    }>;
  };
}

/**
 * Experiment Types
 */
export interface ExperimentResult {
  experimentId: string;
  name: string;
  status: string;
  variants: Array<{
    variantId: string;
    name: string;
    visitors: number;
    conversions: number;
    conversionRate: number;
    avgEngagementTime: number;
  }>;
  statistics?: {
    winner?: string;
    confidence: number;
    pValue: number;
  };
}

/**
 * Metrics Aggregation Types
 */
export interface MetricsSummary {
  date: Date;
  projectId?: string;
  ipAssetId?: string;
  licenseId?: string;
  metrics: {
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    uniqueVisitors: number;
    engagementTime: number;
  };
}

/**
 * Cache Types
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export interface CacheInvalidationOptions {
  scope: 'users' | 'engagement' | 'cohorts' | 'revenue' | 'transactions' | 'ltv' | 'all';
}
