/**
 * Analytics & Events Module Types
 * TypeScript type definitions for analytics functionality
 */

import type { Event } from '@prisma/client';

// TODO: Fix after Prisma regeneration
export type Attribution = any;
export type DailyMetric = any;

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
 * Asset Metrics Response
 */
export interface AssetMetrics {
  assetId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenueCents: number;
    uniqueVisitors: number;
    avgEngagementTime: number;
    topReferrers: Array<{
      referrer: string;
      count: number;
    }>;
    dailyBreakdown: Array<{
      date: string;
      views: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
    }>;
  };
}

/**
 * Top Asset Performance
 */
export interface TopAsset {
  assetId: string;
  assetTitle: string;
  views: number;
  licenses: number;
  revenueCents: number;
}

/**
 * Traffic Source
 */
export interface TrafficSource {
  source: string;
  visits: number;
  conversions: number;
}

/**
 * Creator Dashboard Response
 */
export interface CreatorDashboard {
  summary: {
    totalViews: number;
    totalLicenses: number;
    totalRevenueCents: number;
    avgConversionRate: number;
  };
  topAssets: TopAsset[];
  revenueTimeline: Array<{
    date: string;
    revenueCents: number;
  }>;
  trafficSources: TrafficSource[];
}

/**
 * Asset Performance (Brand View)
 */
export interface AssetPerformance {
  assetId: string;
  assetTitle: string;
  views: number;
  clicks: number;
  ctr: number;
}

/**
 * Campaign Metrics
 */
export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  totalSpendCents: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  roi: number;
  assetPerformance: AssetPerformance[];
}

/**
 * Brand Campaign Metrics Response
 */
export interface BrandCampaignMetrics {
  campaigns: CampaignMetrics[];
}

/**
 * Platform User Metrics
 */
export interface PlatformUserMetrics {
  total: number;
  new: number;
  active: number;
}

/**
 * Platform Creator Metrics
 */
export interface PlatformCreatorMetrics {
  total: number;
  active: number;
  avgRevenuePerCreator: number;
}

/**
 * Platform Brand Metrics
 */
export interface PlatformBrandMetrics {
  total: number;
  active: number;
  avgSpendPerBrand: number;
}

/**
 * Platform Asset Metrics
 */
export interface PlatformAssetMetrics {
  total: number;
  uploaded: number;
  avgViewsPerAsset: number;
}

/**
 * Platform License Metrics
 */
export interface PlatformLicenseMetrics {
  total: number;
  created: number;
  renewalRate: number;
}

/**
 * Platform Revenue Metrics
 */
export interface PlatformRevenueMetrics {
  totalCents: number;
  growth: number;
  timeline: Array<{
    date: string;
    revenueCents: number;
  }>;
}

/**
 * Platform Metrics Response
 */
export interface PlatformMetrics {
  users: PlatformUserMetrics;
  creators: PlatformCreatorMetrics;
  brands: PlatformBrandMetrics;
  assets: PlatformAssetMetrics;
  licenses: PlatformLicenseMetrics;
  revenue: PlatformRevenueMetrics;
}

/**
 * Event Export Response
 */
export interface EventExport {
  downloadUrl: string;
  expiresAt: string;
}

/**
 * Daily Metric Aggregation Data
 */
export interface DailyMetricData {
  ipAssetId: string | null;
  projectId: string | null;
  licenseId: string | null;
  views: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  uniqueVisitors: number;
  engagementTime: number;
}

/**
 * Event with Attribution
 */
export type EventWithAttribution = Event & {
  attribution?: Attribution | null;
};

/**
 * Date Range
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * User Agent Parsing Result
 */
export interface ParsedUserAgent {
  deviceType: string;
  browser: string;
  os: string;
}

/**
 * Analytics Job Data
 */
export interface EnrichEventJobData {
  eventId: string;
}

export interface AggregateDailyMetricsJobData {
  date: string; // YYYY-MM-DD
}

export interface ExportEventsJobData {
  filters: {
    eventTypes?: string[];
    dateRange: {
      start: string;
      end: string;
    };
    actorId?: string;
    projectId?: string;
  };
  format: 'csv' | 'json';
  requestedBy: string;
}

/**
 * Weekly and Monthly Metrics Types
 */
export interface WeeklyMetricsSummary {
  totalWeeks: number;
  totalViews: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  weeklyBreakdown: Array<{
    weekStart: Date;
    weekEnd: Date;
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    viewsGrowth?: number | null;
  }>;
}

export interface MonthlyMetricsSummary {
  year: number;
  totalMonths: number;
  totalViews: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  monthlyBreakdown: Array<{
    month: number;
    monthName: string;
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    viewsGrowth?: number | null;
    weeksInMonth?: number | null;
  }>;
}

/**
 * Custom Metrics Types
 */
export interface CustomMetricDefinitionData {
  name: string;
  description?: string;
  metricType: 'COUNT' | 'SUM' | 'AVERAGE' | 'DISTINCT_COUNT' | 'PERCENTILE' | 'RATIO' | 'MAX' | 'MIN';
  dataSource: string;
  calculationFormula: string;
  dimensions?: string[];
  filters?: Record<string, any>;
  aggregationMethod: 'sum' | 'avg' | 'max' | 'min' | 'count';
}

/**
 * Real-time Metrics Types
 */
export interface RealtimeMetricValue {
  metricKey: string;
  currentValue: number;
  previousValue?: number;
  lastUpdatedAt: Date;
  unit?: string;
}

/**
 * Platform Analytics Types
 */
export type { 
  UserAnalytics,
  EngagementAnalytics,
  CohortAnalysis,
  PeriodType,
} from '../services/platform-analytics.service';
