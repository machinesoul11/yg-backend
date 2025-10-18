/**
 * Creator Analytics Types
 * TypeScript types for creator performance analytics
 */

/**
 * Engagement Analytics Response
 */
export interface EngagementAnalyticsResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    uniqueVisitors: number;
    avgEngagementTime: number;
    clickThroughRate: number;
    conversionRate: number;
  };
  timeSeries: Array<{
    timestamp: string;
    views: number;
    clicks: number;
    conversions: number;
    uniqueVisitors: number;
  }>;
  topAssets: Array<{
    assetId: string;
    title: string;
    type: string;
    views: number;
    conversions: number;
  }>;
  comparison?: {
    periodLabel: string;
    viewsChange: number;
    clicksChange: number;
    conversionsChange: number;
    conversionRateChange: number;
  };
}

/**
 * Portfolio Performance Response
 */
export interface PortfolioPerformanceResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalAssets: number;
    publishedAssets: number;
    totalViews: number;
    totalRevenueCents: number;
    avgViewsPerAsset: number;
    avgRevenuePerAssetCents: number;
  };
  assets: Array<{
    assetId: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    activeLicenses: number;
    engagementRate: number;
    thumbnailUrl: string | null;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  performanceDistribution: {
    topPerformers: number; // Assets in top 25%
    goodPerformers: number; // Assets in 25-50%
    averagePerformers: number; // Assets in 50-75%
    underPerformers: number; // Assets in bottom 25%
  };
}

/**
 * License Metrics Response
 */
export interface LicenseMetricsResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalLicenses: number;
    activeLicenses: number;
    expiringLicenses: number;
    totalRevenueCents: number;
    avgLicenseValueCents: number;
  };
  byStatus: Array<{
    status: string;
    count: number;
    percentage: number;
    revenueCents: number;
  }>;
  byType: Array<{
    type: string;
    count: number;
    percentage: number;
    revenueCents: number;
  }>;
  revenueTimeSeries: Array<{
    period: string;
    revenueCents: number;
    newLicenses: number;
    renewals: number;
  }>;
  topLicensedAssets: Array<{
    assetId: string;
    title: string;
    licenseCount: number;
    revenueCents: number;
  }>;
  licenseVelocity: {
    averageDaysToFirstLicense: number;
    averageDaysToConversion: number;
    monthlyGrowthRate: number;
  };
}

/**
 * Benchmark Comparison Response
 */
export interface BenchmarkComparisonResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  segment: {
    type: string;
    label: string;
    size: number; // Number of creators in this segment
  };
  benchmarks: Array<{
    metric: string;
    label: string;
    yourValue: number;
    benchmarkValue: number;
    percentile: number; // Where you rank (0-100)
    performance: 'above' | 'at' | 'below';
    difference: number; // Percentage difference from benchmark
    unit: string; // '%', 'count', 'cents', 'seconds', etc.
  }>;
  categoryBreakdown: {
    engagement: {
      metrics: string[];
      overallScore: number; // 0-100
      percentile: number;
    };
    monetization: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
    growth: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
    quality: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
  };
  insights: Array<{
    category: string;
    message: string;
    severity: 'positive' | 'neutral' | 'attention';
    recommendation?: string;
  }>;
}

/**
 * Internal types for service layer
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export interface MetricsAggregation {
  views: number;
  clicks: number;
  conversions: number;
  uniqueVisitors: number;
  engagementTime: number;
  revenueCents: number;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  metrics: MetricsAggregation;
}

export interface AssetPerformance {
  assetId: string;
  title: string;
  type: string;
  status: string;
  createdAt: Date;
  metrics: MetricsAggregation;
  activeLicenses: number;
  thumbnailUrl: string | null;
}

export interface LicenseAggregation {
  status: string;
  type: string;
  count: number;
  revenueCents: number;
  assetId: string | null;
  assetTitle: string | null;
}

export interface BenchmarkCalculation {
  metric: string;
  creatorValue: number;
  benchmarkMean: number;
  benchmarkMedian: number;
  benchmarkP25: number;
  benchmarkP75: number;
  sampleSize: number;
}
