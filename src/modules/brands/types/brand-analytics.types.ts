/**
 * Brand Analytics Types
 * TypeScript type definitions for brand analytics functionality
 */

/**
 * Date Range
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Campaign Performance Metrics
 */
export interface CampaignPerformanceMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  budgetCents: number;
  spentCents: number;
  impressions: number;
  reach: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    total: number;
    rate: number;
  };
  clicks: number;
  conversions: number;
  clickThroughRate: number;
  conversionRate: number;
  costPerClick: number;
  costPerConversion: number;
  roi: number;
  activeLicenses: number;
  uniqueAssets: number;
}

/**
 * Campaign Analytics Response
 */
export interface CampaignAnalyticsResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalBudgetCents: number;
    totalSpentCents: number;
    avgCampaignBudgetCents: number;
    totalImpressions: number;
    totalConversions: number;
    overallROI: number;
  };
  campaigns: CampaignPerformanceMetrics[];
  topPerformingCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    roi: number;
    conversionRate: number;
  }>;
}

/**
 * ROI Breakdown
 */
export interface ROIBreakdown {
  category: string;
  amountCents: number;
  percentage: number;
}

/**
 * ROI Analysis Response
 */
export interface ROIAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  totalInvestment: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  totalReturns: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  netProfit: {
    amountCents: number;
    margin: number;
  };
  roi: {
    percentage: number;
    multiplier: number;
  };
  metrics: {
    customerAcquisitionCostCents: number;
    averageOrderValueCents: number;
    returnOnAdSpendCents: number;
  };
  timeline: Array<{
    period: string;
    investmentCents: number;
    returnsCents: number;
    roiPercentage: number;
  }>;
  campaignComparison: Array<{
    campaignId: string;
    campaignName: string;
    investmentCents: number;
    returnsCents: number;
    roiPercentage: number;
  }>;
}

/**
 * Creator Performance Metrics
 */
export interface CreatorPerformanceMetrics {
  creatorId: string;
  creatorName: string;
  stageName: string;
  collaborations: {
    totalCampaigns: number;
    totalContent: number;
    activeLicenses: number;
  };
  performance: {
    totalReach: number;
    totalImpressions: number;
    totalEngagement: number;
    avgEngagementRate: number;
    totalConversions: number;
    conversionRate: number;
  };
  financial: {
    totalPaidCents: number;
    avgCostPerContentCents: number;
    costPerEngagement: number;
    costPerConversion: number;
  };
  quality: {
    contentQualityScore: number;
    audienceAlignmentScore: number;
    brandSafetyScore: number;
    deliveryConsistencyScore: number;
  };
  lastCollaboration: string | null;
}

/**
 * Creator Performance Response
 */
export interface CreatorPerformanceResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalCreators: number;
    activeCreators: number;
    totalCollaborations: number;
    totalSpentCents: number;
    avgSpentPerCreatorCents: number;
    avgEngagementRate: number;
  };
  creators: CreatorPerformanceMetrics[];
  topPerformers: Array<{
    creatorId: string;
    creatorName: string;
    performanceScore: number;
    engagementRate: number;
    costEfficiency: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    creatorCount: number;
    avgEngagementRate: number;
  }>;
}

/**
 * Asset Usage Metrics
 */
export interface AssetUsageMetrics {
  assetId: string;
  assetTitle: string;
  assetType: string;
  uploadedAt: string;
  usage: {
    totalCampaigns: number;
    totalCreators: number;
    totalLicenses: number;
    firstUsed: string | null;
    lastUsed: string | null;
  };
  performance: {
    totalImpressions: number;
    totalEngagement: number;
    avgEngagementRate: number;
    totalConversions: number;
    conversionRate: number;
  };
  distribution: {
    geographicReach: Array<{
      region: string;
      impressions: number;
    }>;
    demographicReach: Array<{
      segment: string;
      percentage: number;
    }>;
  };
  effectiveness: {
    performanceScore: number;
    comparisonToAverage: number;
    topPerformingContext: string | null;
  };
}

/**
 * Asset Usage Response
 */
export interface AssetUsageResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalAssets: number;
    usedAssets: number;
    unusedAssets: number;
    avgUsagePerAsset: number;
    totalImpressions: number;
    avgEngagementRate: number;
  };
  assets: AssetUsageMetrics[];
  mostEffectiveAssets: Array<{
    assetId: string;
    assetTitle: string;
    performanceScore: number;
    usageCount: number;
  }>;
  leastUsedAssets: Array<{
    assetId: string;
    assetTitle: string;
    uploadedAt: string;
    usageCount: number;
  }>;
  assetTypeBreakdown: Array<{
    assetType: string;
    count: number;
    avgEngagementRate: number;
    avgPerformanceScore: number;
  }>;
  recommendations: Array<{
    type: 'high_performer' | 'underutilized' | 'retire_candidate';
    assetId: string;
    assetTitle: string;
    reason: string;
  }>;
}

/**
 * Time Series Data Point
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

/**
 * Metric Aggregation
 */
export interface MetricAggregation {
  views: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  uniqueVisitors: number;
  engagementTime: number;
}

/**
 * Spend Analysis Response
 */
export interface SpendAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  totalSpendCents: number;
  breakdown: {
    byProject: Array<{
      projectId: string;
      projectName: string;
      spentCents: number;
      percentage: number;
    }>;
    byLicenseType: Array<{
      licenseType: string;
      spentCents: number;
      percentage: number;
      count: number;
    }>;
    byCreator: Array<{
      creatorId: string;
      creatorName: string;
      spentCents: number;
      percentage: number;
      licenseCount: number;
    }>;
  };
  timeSeries: Array<{
    date: string;
    spentCents: number;
    licenseCount: number;
  }>;
  trends: {
    averageTransactionCents: number;
    totalTransactions: number;
    periodOverPeriodChange: number;
    periodOverPeriodPercentage: number;
    peakSpendingDate: string | null;
    peakSpendingAmount: number;
  };
  metadata: {
    calculatedAt: string;
    dataCompleteness: number;
  };
}

/**
 * Budget Utilization Response
 */
export interface BudgetUtilizationResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  portfolio: {
    totalAllocatedBudgetCents: number;
    totalActualSpendCents: number;
    overallUtilizationPercentage: number;
    totalRemainingBudgetCents: number;
    projectsUnderBudget: number;
    projectsOnBudget: number;
    projectsOverBudget: number;
    projectsNoBudget: number;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    status: string;
    budgetCents: number;
    actualSpendCents: number;
    remainingBudgetCents: number;
    utilizationPercentage: number;
    budgetStatus: 'under_budget' | 'on_budget' | 'over_budget' | 'at_risk' | 'no_budget';
    licenseCount: number;
    timeline: {
      startDate: string | null;
      endDate: string | null;
      daysRemaining: number | null;
    };
  }>;
  trends: {
    monthlyUtilization: Array<{
      month: string;
      utilizationPercentage: number;
      spentCents: number;
    }>;
    projectedDepletion: Array<{
      projectId: string;
      projectName: string;
      projectedDepletionDate: string | null;
      daysUntilDepletion: number | null;
    }>;
  };
  alerts: Array<{
    severity: 'warning' | 'critical';
    projectId: string;
    projectName: string;
    message: string;
  }>;
}

/**
 * Cost Per Metric Response
 */
export interface CostPerMetricResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalLicensingCostCents: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
    costPerEngagement: number | null;
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalEngagements: number;
  };
  byAsset: Array<{
    assetId: string;
    assetTitle: string;
    assetType: string;
    licensingCostCents: number;
    views: number;
    clicks: number;
    conversions: number;
    engagements: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
    costPerEngagement: number | null;
    efficiencyScore: number;
  }>;
  byProject: Array<{
    projectId: string;
    projectName: string;
    licensingCostCents: number;
    views: number;
    clicks: number;
    conversions: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
    averageEfficiency: number;
  }>;
  byCreator: Array<{
    creatorId: string;
    creatorName: string;
    licensingCostCents: number;
    assetCount: number;
    views: number;
    clicks: number;
    conversions: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
  }>;
  trends: {
    efficiencyOverTime: Array<{
      date: string;
      costPerView: number | null;
      costPerClick: number | null;
      costPerConversion: number | null;
    }>;
    improvementPercentage: number;
  };
  benchmarks: {
    platformAverageCostPerView: number | null;
    platformAverageCostPerClick: number | null;
    platformAverageCostPerConversion: number | null;
    brandPerformancePercentile: number | null;
  };
  insights: Array<{
    type: 'top_performer' | 'underperformer' | 'optimal_price_point' | 'tracking_gap';
    title: string;
    description: string;
    assetId?: string;
    projectId?: string;
  }>;
  dataQuality: {
    assetsWithTracking: number;
    assetsWithoutTracking: number;
    trackingCoverage: number;
  };
}
