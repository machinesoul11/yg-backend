# Brand Analytics API - Quick Reference

## Overview
Four comprehensive analytics endpoints for brand performance tracking, campaign analysis, creator evaluation, and asset usage insights.

---

## Endpoints

### 1. Campaign Analytics
```typescript
trpc.brandAnalytics.getCampaignAnalytics.useQuery({
  id: string;                    // Brand CUID (required)
  startDate?: string;            // ISO 8601 datetime (default: 90 days ago)
  endDate?: string;              // ISO 8601 datetime (default: now)
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  sortBy?: 'roi' | 'conversions' | 'spent' | 'startDate' | 'name';
  sortOrder?: 'asc' | 'desc';    // Default: 'desc'
  limit?: number;                // 1-100, default: 20
  offset?: number;               // Default: 0
})
```

**Returns:** Campaign performance metrics, ROI, engagement rates, summary statistics

**Cache TTL:** 15 minutes

---

### 2. ROI Analysis
```typescript
trpc.brandAnalytics.getROIAnalysis.useQuery({
  id: string;                    // Brand CUID (required)
  startDate?: string;            // ISO 8601 datetime (default: 365 days ago)
  endDate?: string;              // ISO 8601 datetime (default: now)
  granularity?: 'day' | 'week' | 'month' | 'quarter'; // Default: 'month'
  includeCampaignBreakdown?: boolean;  // Default: true
  compareWithIndustry?: boolean;       // Default: false
})
```

**Returns:** Investment breakdown, returns analysis, net profit, ROI metrics, timeline, campaign comparison

**Cache TTL:** 30 minutes

---

### 3. Creator Performance
```typescript
trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: string;                    // Brand CUID (required)
  startDate?: string;            // ISO 8601 datetime (default: 180 days ago)
  endDate?: string;              // ISO 8601 datetime (default: now)
  sortBy?: 'engagementRate' | 'conversions' | 'costPerEngagement' | 
           'totalSpent' | 'collaborations' | 'name';
  sortOrder?: 'asc' | 'desc';    // Default: 'desc'
  minCollaborations?: number;    // Minimum campaign count filter
  category?: string;             // Creator category filter
  limit?: number;                // 1-100, default: 20
  offset?: number;               // Default: 0
})
```

**Returns:** Creator collaboration stats, performance metrics, financial analysis, quality scores, top performers

**Cache TTL:** 20 minutes

---

### 4. Asset Usage
```typescript
trpc.brandAnalytics.getAssetUsage.useQuery({
  id: string;                    // Brand CUID (required)
  startDate?: string;            // ISO 8601 datetime (default: 365 days ago)
  endDate?: string;              // ISO 8601 datetime (default: now)
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
  usageStatus?: 'all' | 'used' | 'unused'; // Default: 'all'
  sortBy?: 'performanceScore' | 'usageCount' | 'engagementRate' | 
           'uploadedAt' | 'title';
  sortOrder?: 'asc' | 'desc';    // Default: 'desc'
  minUsageCount?: number;        // Minimum usage threshold
  limit?: number;                // 1-100, default: 20
  offset?: number;               // Default: 0
})
```

**Returns:** Asset usage stats, performance metrics, effectiveness scores, recommendations, type breakdown

**Cache TTL:** 30 minutes

---

## Authorization

All endpoints support three access levels:

1. **Brand Owners:** Full access to their own brand's analytics
2. **Team Members:** Access if they have `view_analytics` or `admin` permission
3. **Platform Admins:** Access to all brand analytics via admin endpoints

### Admin Endpoints
```typescript
trpc.brandAnalytics.adminGetCampaignAnalytics.useQuery({ /* same params */ })
trpc.brandAnalytics.adminGetROIAnalysis.useQuery({ /* same params */ })
trpc.brandAnalytics.adminGetCreatorPerformance.useQuery({ /* same params */ })
trpc.brandAnalytics.adminGetAssetUsage.useQuery({ /* same params */ })
```

---

## Response Structure Examples

### Campaign Analytics Response
```typescript
{
  brandId: "clxxx...",
  dateRange: { start: "2024-01-01T00:00:00Z", end: "2024-12-31T23:59:59Z" },
  summary: {
    totalCampaigns: 45,
    activeCampaigns: 12,
    completedCampaigns: 30,
    totalBudgetCents: 500000000,  // $5,000,000.00
    totalSpentCents: 425000000,   // $4,250,000.00
    avgCampaignBudgetCents: 11111111,
    totalImpressions: 15000000,
    totalConversions: 25000,
    overallROI: 45.5
  },
  campaigns: [ /* CampaignPerformanceMetrics[] */ ],
  topPerformingCampaigns: [ /* Top 5 by ROI */ ]
}
```

### ROI Analysis Response
```typescript
{
  brandId: "clxxx...",
  dateRange: { start: "2024-01-01T00:00:00Z", end: "2024-12-31T23:59:59Z" },
  totalInvestment: {
    totalCents: 425000000,
    breakdown: [
      { category: "License Fees", amountCents: 400000000, percentage: 94.1 },
      { category: "Platform Fees", amountCents: 25000000, percentage: 5.9 }
    ]
  },
  totalReturns: {
    totalCents: 650000000,
    breakdown: [
      { category: "Direct Revenue", amountCents: 400000000, percentage: 61.5 },
      { category: "Conversion Value", amountCents: 250000000, percentage: 38.5 }
    ]
  },
  netProfit: { amountCents: 225000000, margin: 34.6 },
  roi: { percentage: 52.9, multiplier: 1.529 },
  metrics: {
    customerAcquisitionCostCents: 17000,
    averageOrderValueCents: 26000,
    returnOnAdSpendCents: 153
  },
  timeline: [ /* Time-series data */ ],
  campaignComparison: [ /* Campaign ROI breakdown */ ]
}
```

### Creator Performance Response
```typescript
{
  brandId: "clxxx...",
  dateRange: { start: "2024-01-01T00:00:00Z", end: "2024-12-31T23:59:59Z" },
  summary: {
    totalCreators: 150,
    activeCreators: 85,
    totalCollaborations: 320,
    totalSpentCents: 400000000,
    avgSpentPerCreatorCents: 2666666,
    avgEngagementRate: 3.2
  },
  creators: [ /* CreatorPerformanceMetrics[] */ ],
  topPerformers: [ /* Top 10 by performance score */ ],
  categoryBreakdown: [ /* Category statistics */ ]
}
```

### Asset Usage Response
```typescript
{
  brandId: "clxxx...",
  dateRange: { start: "2024-01-01T00:00:00Z", end: "2024-12-31T23:59:59Z" },
  summary: {
    totalAssets: 500,
    usedAssets: 350,
    unusedAssets: 150,
    avgUsagePerAsset: 2.3,
    totalImpressions: 25000000,
    avgEngagementRate: 2.8
  },
  assets: [ /* AssetUsageMetrics[] */ ],
  mostEffectiveAssets: [ /* Top 10 by performance */ ],
  leastUsedAssets: [ /* Bottom 10 by usage */ ],
  assetTypeBreakdown: [ /* Type statistics */ ],
  recommendations: [
    { type: "high_performer", assetId: "...", assetTitle: "...", reason: "..." },
    { type: "underutilized", assetId: "...", assetTitle: "...", reason: "..." },
    { type: "retire_candidate", assetId: "...", assetTitle: "...", reason: "..." }
  ]
}
```

---

## Key Metrics Explained

### Campaign Metrics
- **Impressions:** Total views across all campaign assets
- **Reach:** Unique visitors/viewers
- **Engagement Rate:** (Total engagement / Total impressions) × 100
- **CTR (Click-Through Rate):** (Clicks / Impressions) × 100
- **Conversion Rate:** (Conversions / Clicks) × 100
- **Cost Per Click:** Total spent / Total clicks
- **Cost Per Conversion:** Total spent / Total conversions
- **ROI:** ((Returns - Investment) / Investment) × 100

### Creator Metrics
- **Performance Score:** Weighted algorithm based on engagement and quality
- **Engagement Rate:** (Engagement / Impressions) × 100
- **Cost Per Engagement:** Total paid / Total engagement
- **Cost Efficiency:** Performance score relative to cost
- **Quality Scores:** Content quality, audience alignment, brand safety, delivery consistency

### Asset Metrics
- **Performance Score:** 0-100 scale based on engagement and conversion rates
- **Usage Count:** Number of times licensed
- **Effectiveness:** Performance compared to platform average
- **Engagement Rate:** (Engagement / Impressions) × 100

---

## Error Responses

```typescript
// Not Found (404)
{ code: 'NOT_FOUND', message: 'Brand not found' }

// Unauthorized (401)
{ code: 'UNAUTHORIZED', message: 'Authentication required' }

// Forbidden (403)
{ code: 'FORBIDDEN', message: 'You do not have permission to view analytics for this brand' }

// Bad Request (400)
{ code: 'BAD_REQUEST', message: 'Invalid input: [validation details]' }
```

---

## Performance Notes

- All endpoints implement Redis caching
- Database queries use existing indexes for optimal performance
- Pagination is recommended for large datasets
- Cache keys include all query parameters for precision
- Graceful degradation on cache failures

---

## Common Use Cases

### Dashboard Overview
```typescript
// Get recent campaign performance
const campaigns = await trpc.brandAnalytics.getCampaignAnalytics.useQuery({
  id: brandId,
  limit: 5,
  sortBy: 'startDate',
  sortOrder: 'desc'
});

// Get overall ROI
const roi = await trpc.brandAnalytics.getROIAnalysis.useQuery({
  id: brandId,
  granularity: 'month'
});
```

### Creator Evaluation
```typescript
// Find top performing creators
const topCreators = await trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: brandId,
  sortBy: 'engagementRate',
  sortOrder: 'desc',
  minCollaborations: 3,
  limit: 10
});
```

### Asset Optimization
```typescript
// Identify underutilized high-performers
const assets = await trpc.brandAnalytics.getAssetUsage.useQuery({
  id: brandId,
  sortBy: 'performanceScore',
  sortOrder: 'desc',
  usageStatus: 'all'
});

// Check recommendations for asset strategy
const recommendations = assets.data.recommendations;
```

### ROI Reporting
```typescript
// Quarterly ROI analysis
const quarterlyROI = await trpc.brandAnalytics.getROIAnalysis.useQuery({
  id: brandId,
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-03-31T23:59:59Z',
  granularity: 'month',
  includeCampaignBreakdown: true
});
```

---

## Files Reference

- **Service:** `src/modules/brands/services/brand-analytics.service.ts`
- **Router:** `src/modules/brands/routers/brand-analytics.router.ts`
- **Schemas:** `src/modules/brands/schemas/brand-analytics.schema.ts`
- **Types:** `src/modules/brands/types/brand-analytics.types.ts`
- **Module:** `src/modules/brands/index.ts`
- **App Router:** `src/lib/api/root.ts`
- **Documentation:** `docs/BRAND_ANALYTICS_IMPLEMENTATION_COMPLETE.md`

---

**Last Updated:** October 17, 2025
