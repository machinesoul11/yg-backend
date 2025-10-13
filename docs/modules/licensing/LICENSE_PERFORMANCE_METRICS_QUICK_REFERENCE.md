# License Performance Metrics - Quick Reference

## API Endpoints

### Get License Performance Metrics
```typescript
// Get complete performance metrics for a single license
const metrics = await trpc.licenses.getPerformanceMetrics.query({
  licenseId: 'clx123',
});

// Returns:
{
  data: {
    roi: {
      licenseId: string
      totalRevenueCents: number
      totalCostCents: number
      roiPercentage: number
      breakEvenDate: Date | null
      daysToBreakEven: number | null
      projectedAnnualROI: number
      revenueGrowthRate: number
    },
    utilization: {
      licenseId: string
      utilizationPercentage: number
      actualUsageCount: number
      scopeLimitCount: number | null
      remainingCapacity: number | null
      utilizationTrend: 'increasing' | 'decreasing' | 'stable'
      isOverUtilized: boolean
      isUnderUtilized: boolean
      usageByType: Record<string, number>
    },
    approval: {
      licenseId: string
      createdAt: Date
      signedAt: Date | null
      approvalDurationHours: number | null
      approvalDurationDays: number | null
      status: string
      approvalStage: 'created' | 'pending_approval' | 'approved' | 'expired'
      bottlenecks: string[]
    }
  }
}
```

### Get Performance Dashboard (Admin)
```typescript
// Get comprehensive performance dashboard
const dashboard = await trpc.licenses.getPerformanceDashboard.query({
  period: '30d', // '7d', '30d', '90d', '1y'
});

// Returns summary with:
// - Revenue metrics (total, average, growth)
// - ROI distribution (average, median, top/underperforming)
// - Utilization statistics
// - Conflict analysis
// - Approval efficiency
// - Renewal performance
```

### Get Aggregated Performance Metrics (Admin)
```typescript
// Get aggregated metrics for a period
const metrics = await trpc.licenses.getAggregatedPerformanceMetrics.query({
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-01-31T23:59:59Z',
  granularity: 'monthly', // 'daily', 'weekly', 'monthly'
});
```

### Get Conflict Rate Metrics (Admin)
```typescript
// Get detailed conflict analysis
const conflicts = await trpc.licenses.getConflictRateMetrics.query({
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-01-31T23:59:59Z',
});

// Returns:
{
  data: {
    period: { start: Date, end: Date }
    totalLicensesCreated: number
    totalConflictsDetected: number
    conflictRate: number
    conflictsByType: Record<string, number>
    conflictsBySeverity: { critical, warning, info }
    topConflictingAssets: Array<{ ipAssetId, ipAssetTitle, conflictCount }>
    resolutionTimeAvg: number
  }
}
```

### Get Historical Performance Metrics (Admin)
```typescript
// Get historical performance snapshots
const history = await trpc.licenses.getHistoricalPerformanceMetrics.query({
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2025-01-31T23:59:59Z',
  granularity: 'monthly',
});

// Returns array of AggregatedPerformanceMetrics
```

## Direct Service Usage

### Calculate Individual License Metrics
```typescript
import { licensePerformanceMetricsService } from '@/modules/licenses';

// Calculate ROI
const roi = await licensePerformanceMetricsService.calculateLicenseROI('clx123');

// Calculate Utilization
const utilization = await licensePerformanceMetricsService.calculateLicenseUtilization('clx123');

// Calculate Approval Time
const approval = await licensePerformanceMetricsService.calculateApprovalTimeMetrics('clx123');

// Calculate Conflict Rates
const conflicts = await licensePerformanceMetricsService.calculateConflictRateMetrics(
  new Date('2025-01-01'),
  new Date('2025-01-31')
);

// Calculate Aggregated Metrics
const aggregated = await licensePerformanceMetricsService.calculateAggregatedMetrics(
  new Date('2025-01-01'),
  new Date('2025-01-31'),
  'monthly'
);
```

## Background Job

### Manual Job Trigger
```typescript
import { licensePerformanceMetricsQueue } from '@/jobs/license-performance-metrics.job';

// Trigger job for specific date
await licensePerformanceMetricsQueue.add('calculate-metrics', {
  date: '2025-01-15T00:00:00Z',
});

// Trigger job with historical recalculation
await licensePerformanceMetricsQueue.add('recalculate-historical', {
  date: '2025-01-15T00:00:00Z',
  recalculateHistorical: true,
});
```

### Job Schedule
- **Frequency**: Daily at 2 AM UTC
- **Queue**: `license-performance-metrics`
- **Concurrency**: 1 (to prevent conflicts)
- **Retries**: 3 attempts with exponential backoff

## Key Metrics

### ROI (Return on Investment)
```
ROI% = ((Total Revenue - Total Cost) / Total Cost) × 100

Break-Even Point = Date when cumulative revenue >= total costs
Projected Annual ROI = (Daily Average Revenue × 365 - Total Cost) / Total Cost × 100
Revenue Growth Rate = ((Recent 30d Revenue - Previous 30d Revenue) / Previous 30d) × 100
```

**Thresholds**:
- Excellent: > 100%
- Good: 50-100%
- Moderate: 0-50%
- Poor: < 0%

### Utilization
```
Utilization% = (Actual Usage Count / Scope Limit) × 100

Trend = Compare last 30 days vs previous 30 days
  - Increasing: Recent > Previous × 1.1
  - Decreasing: Recent < Previous × 0.9
  - Stable: Otherwise
```

**Thresholds**:
- Over-utilized: > 100%
- Well-utilized: 50-100%
- Moderate: 20-50%
- Under-utilized: < 20%

### Conflict Rate
```
Conflict Rate% = (Total Conflicts / Total Licenses Created) × 100
```

**Thresholds**:
- Healthy: < 5%
- Monitor: 5-15%
- Action Needed: > 15%

### Approval Time
```
Approval Duration = Signed At - Created At (in hours/days)

Bottleneck Detection:
  - > 72 hours in PENDING_APPROVAL
  - > 48 hours in PENDING_SIGNATURE
  - > 168 hours (7 days) total pending time
```

**Benchmarks**:
- Fast: < 24 hours
- Normal: 24-72 hours
- Slow: 72-168 hours
- Very Slow: > 168 hours

## Data Storage

### License Metadata
Performance metrics stored in `licenses.metadata`:
```json
{
  "performanceMetrics": {
    "lastCalculated": "2025-01-12T02:00:00Z",
    "roi": {
      "percentage": 150.5,
      "totalRevenue": 500000,
      "projectedAnnualROI": 180.2,
      "revenueGrowthRate": 15.3
    },
    "utilization": {
      "percentage": 85.5,
      "actualUsage": 855,
      "trend": "increasing",
      "isOverUtilized": false,
      "isUnderUtilized": false
    },
    "approval": {
      "durationHours": 36,
      "stage": "approved",
      "bottlenecks": []
    }
  }
}
```

### Daily Metrics Table
Historical aggregated metrics stored in `daily_metrics`:
```sql
SELECT * FROM daily_metrics
WHERE project_id IS NULL
  AND ip_asset_id IS NULL
  AND license_id IS NULL
  AND metadata->>'metricsType' = 'license_performance'
ORDER BY date DESC;
```

## Common Use Cases

### Dashboard: Show Top Performing Licenses
```typescript
const metrics = await trpc.licenses.getAggregatedPerformanceMetrics.query({
  startDate: thirtyDaysAgo,
  endDate: now,
  granularity: 'monthly',
});

const topPerformers = metrics.data.roi.topPerformingLicenses;
```

### Alert: Identify Under-Utilized Licenses
```typescript
const metrics = await trpc.licenses.getPerformanceMetrics.query({ licenseId });

if (metrics.data.utilization.isUnderUtilized) {
  // Send alert to brand
  await notifyBrand({
    message: `License ${licenseId} is under-utilized at ${metrics.data.utilization.utilizationPercentage}%`,
  });
}
```

### Report: Monthly Conflict Analysis
```typescript
const conflicts = await trpc.licenses.getConflictRateMetrics.query({
  startDate: startOfMonth,
  endDate: endOfMonth,
});

// Generate report
console.log(`Conflict Rate: ${conflicts.data.conflictRate}%`);
console.log('Top Issues:', conflicts.data.conflictsByType);
console.log('Critical Conflicts:', conflicts.data.conflictsBySeverity.critical);
```

### Analysis: Approval Bottlenecks
```typescript
const dashboard = await trpc.licenses.getPerformanceDashboard.query({
  period: '90d',
});

console.log('Average Approval Time:', dashboard.data.approvals.averageApprovalTime);
console.log('Bottlenecks:', dashboard.data.approvals.bottlenecks);
console.log('Stages:', dashboard.data.approvals.approvalsByStage);
```

## Performance Optimization

### Caching
- **Redis**: 1-hour cache for aggregated metrics
- **Cache Key Pattern**: `license:metrics:aggregated:{startDate}:{endDate}:{granularity}`
- **Invalidation**: Automatic after 1 hour

### Query Optimization
- Indexes on `licenses` table: `[status, endDate]`, `[createdAt]`, `[feeCents]`
- Indexes on `daily_metrics`: `[date, projectId, ipAssetId, licenseId]`
- Use of `include` for related data fetching
- Batch processing for individual license metrics

### Job Optimization
- Processes top 100 high-value licenses only
- Concurrent metric calculations where possible
- Error handling prevents single failure from stopping entire job
- Progress tracking for monitoring

## Troubleshooting

### Metrics Not Updating
1. Check if background job is running: `SELECT * FROM bullmq_jobs WHERE name = 'license-performance-metrics'`
2. Verify Redis connection: `redis-cli PING`
3. Check job logs for errors
4. Manually trigger job: `licensePerformanceMetricsQueue.add('test', {})`

### Incorrect ROI Calculations
1. Verify royalty_lines data is present
2. Check daily_metrics for revenue data
3. Ensure feeCents is set correctly on license
4. Review calculation logic in service

### Missing Utilization Data
1. Verify usage_events are being tracked
2. Check events table for relevant event types
3. Ensure scope limits are defined in license metadata
4. Review utilization calculation logic

### Slow Performance
1. Check Redis cache hit rate
2. Verify database indexes exist
3. Review query execution plans
4. Consider reducing date range for aggregations

---

**Last Updated**: 2025-01-12
**Service**: `LicensePerformanceMetricsService`
**Job**: `license-performance-metrics.job.ts`
**Documentation**: `LICENSE_PERFORMANCE_METRICS_IMPLEMENTATION.md`
