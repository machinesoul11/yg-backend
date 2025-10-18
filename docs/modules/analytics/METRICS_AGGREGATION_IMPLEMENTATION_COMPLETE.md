# Metrics Aggregation System - Implementation Complete

## Overview

The metrics aggregation system provides a comprehensive, multi-tiered approach to collecting, aggregating, and analyzing metrics across the platform. The system includes daily, weekly, and monthly aggregations, real-time metrics tracking, custom metric definitions, and a sophisticated caching layer.

## Architecture

### 1. Daily Metrics Aggregation

**Purpose**: Aggregate raw event data into daily summaries for efficient querying.

**Schedule**: Runs nightly at 2 AM UTC (via `analytics-jobs.ts`)

**Process**:
- Queries raw events from the `events` table for the previous day
- Groups by dimensions (projectId, ipAssetId, licenseId)
- Calculates aggregated metrics (views, clicks, conversions, revenue, etc.)
- Stores results in the `daily_metrics` table

**Implementation**: `MetricsAggregationService` in `src/modules/analytics/services/metrics-aggregation.service.ts`

### 2. Weekly Metrics Rollup

**Purpose**: Aggregate daily metrics into weekly summaries with week-over-week growth calculations.

**Schedule**: Runs every Monday at 4 AM UTC

**Process**:
- Retrieves all daily metrics for the completed week (Monday-Sunday)
- Groups by dimensions
- Calculates weekly totals and averages
- Computes week-over-week growth metrics
- Stores results in the `weekly_metrics` table

**Implementation**: `WeeklyMetricsRollupService` in `src/modules/analytics/services/weekly-metrics-rollup.service.ts`

**Features**:
- Week-over-week growth percentage
- Average daily metrics per week
- Supports backfilling for historical periods

### 3. Monthly Metrics Rollup

**Purpose**: Aggregate daily and weekly metrics into monthly summaries with month-over-month trends.

**Schedule**: Runs on the 2nd of each month at 5 AM UTC

**Process**:
- Retrieves all daily metrics for the completed month
- Groups by dimensions
- Calculates monthly totals and averages
- Includes weekly breakdown data
- Computes month-over-month growth metrics
- Stores results in the `monthly_metrics` table

**Implementation**: `MonthlyMetricsRollupService` in `src/modules/analytics/services/monthly-metrics-rollup.service.ts`

**Features**:
- Month-over-month growth percentage
- Weekly breakdown within each month
- Year-over-year comparison support
- Average daily metrics per month

### 4. Real-Time Metrics

**Purpose**: Provide immediate metric updates as events occur, without waiting for batch aggregations.

**Implementation**: `RealtimeMetricsService` in `src/modules/analytics/services/realtime-metrics.service.ts`

**Metric Types**:
- **Counter**: Incrementing values (e.g., total page views, API calls)
- **Gauge**: Absolute values (e.g., active users, concurrent sessions)
- **Histogram**: Distribution of values (e.g., response times, file sizes)
- **Rate**: Events per time period (e.g., requests per second)

**Storage**:
- **Fast Layer**: Redis for sub-second access
- **Persistent Layer**: `realtime_metrics_cache` table for durability

**Features**:
- Automatic reconciliation to correct drift
- Sliding window support for rate calculations
- TTL-based expiration
- Bulk metric retrieval

**Usage Example**:
```typescript
import { RealtimeMetricsService } from '@/modules/analytics';
import { redis } from '@/lib/db/redis';
import { prisma } from '@/lib/db';

const realtimeService = new RealtimeMetricsService(prisma, redis);

// Increment a counter
await realtimeService.incrementCounter('api:requests', 1, { endpoint: '/api/assets' });

// Set a gauge
await realtimeService.setGauge('users:active', 1250, {}, 'count');

// Record histogram value
await realtimeService.recordHistogram('response:time', 145, { endpoint: '/api/search' });

// Record rate
await realtimeService.recordRate('events:per:minute', 60);

// Get current value
const activeUsers = await realtimeService.getMetricValue('users:active');
```

### 5. Metrics Cache Layer

**Purpose**: Multi-tiered caching to dramatically reduce database load and improve query performance.

**Implementation**: `MetricsCacheService` in `src/modules/analytics/services/metrics-cache.service.ts`

**Cache Strategies**:
- **Current Metrics**: 1-minute TTL (frequent updates)
- **Recent Metrics**: 5-minute TTL (default)
- **Historical Metrics**: 1-hour TTL (immutable data)

**Features**:
- Automatic cache warming on miss
- Pattern-based invalidation
- Cache statistics and hit rate tracking
- Specialized methods for daily/weekly/monthly metrics

**Usage Example**:
```typescript
import { MetricsCacheService } from '@/modules/analytics';
import { redis } from '@/lib/db/redis';
import { prisma } from '@/lib/db';

const cacheService = new MetricsCacheService(redis, prisma);

// Get with automatic caching
const metrics = await cacheService.get(
  'daily:2025-10-15',
  async () => {
    return await prisma.dailyMetric.findMany({
      where: { date: new Date('2025-10-15') }
    });
  },
  { ttl: 3600 } // 1 hour
);

// Invalidate cache after aggregation
await cacheService.invalidateDailyMetrics('2025-10-15');

// Get cache statistics
const stats = await cacheService.getCacheStats();
console.log(`Cache hit rate: ${stats.hitRate}`);
```

### 6. Custom Metric Definitions

**Purpose**: Allow users to define custom metrics without code changes, enabling flexible analysis.

**Implementation**: `CustomMetricsService` in `src/modules/analytics/services/custom-metrics.service.ts`

**Features**:
- **Flexible Definitions**: Define metrics using JSON-based formulas
- **Multiple Data Sources**: Events, daily_metrics, licenses, projects, etc.
- **Aggregation Methods**: Sum, average, max, min, count, distinct count
- **Dimensions**: Group by multiple dimensions
- **Filters**: Apply custom filters to data
- **Versioning**: Maintain version history of metric definitions
- **Access Control**: Private, team, organization, or public visibility
- **Validation**: Syntax checking and cost estimation
- **Backfilling**: Recalculate historical values

**Metric Types**:
- `COUNT`: Count of records
- `SUM`: Sum of values
- `AVERAGE`: Average of values
- `DISTINCT_COUNT`: Count of unique values
- `PERCENTILE`: Percentile calculations (p50, p95, p99)
- `RATIO`: Ratio between two metrics
- `MAX`: Maximum value
- `MIN`: Minimum value

**Usage Example**:
```typescript
import { CustomMetricsService } from '@/modules/analytics';
import { prisma } from '@/lib/db';

const customMetricsService = new CustomMetricsService(prisma);

// Create a custom metric
const metricDef = await customMetricsService.createMetricDefinition(userId, {
  name: 'High-Value Conversions',
  description: 'Count of conversions with revenue > $100',
  metricType: 'COUNT',
  dataSource: 'events',
  calculationFormula: 'WHERE event_type = "license_created" AND (props_json->>"revenueCents")::int > 10000',
  dimensions: ['projectId', 'ipAssetId'],
  filters: {},
  aggregationMethod: 'count',
  visibility: 'TEAM',
  allowedRoles: ['ADMIN', 'ANALYST'],
});

// Calculate the metric for a period
const result = await customMetricsService.calculateMetric(metricDef.id, {
  periodType: 'DAILY',
  periodStartDate: new Date('2025-10-15'),
  periodEndDate: new Date('2025-10-15'),
});

// Get historical values
const values = await customMetricsService.getMetricValues(
  metricDef.id,
  new Date('2025-10-01'),
  new Date('2025-10-31')
);

// Backfill historical data
await customMetricsService.backfillMetric(
  metricDef.id,
  new Date('2025-01-01'),
  new Date('2025-10-31'),
  'DAILY'
);
```

## Database Schema

### Tables

#### `daily_metrics` (Existing)
- Stores daily aggregated metrics
- Dimensions: projectId, ipAssetId, licenseId
- Metrics: views, clicks, conversions, revenueCents, uniqueVisitors, engagementTime

#### `weekly_metrics` (New)
- Stores weekly rollups
- Includes week-over-week growth percentages
- Tracks average daily metrics per week

#### `monthly_metrics` (New)
- Stores monthly rollups
- Includes month-over-month growth percentages
- Contains weekly breakdown data
- Tracks average daily metrics per month

#### `custom_metric_definitions` (New)
- User-defined metric configurations
- Supports versioning and access control
- Includes validation status and cost estimates

#### `custom_metric_values` (New)
- Calculated values for custom metrics
- Stores results by period and dimensions
- Tracks calculation performance

#### `realtime_metrics_cache` (New)
- Real-time metric values
- Supports counters, gauges, histograms, and rates
- Includes TTL and refresh intervals

#### `metrics_aggregation_jobs_log` (New)
- Audit log for aggregation job executions
- Tracks performance, errors, and status
- Useful for monitoring and debugging

### Indexes

All tables include optimized indexes for:
- Date range queries
- Dimension filtering (projectId, ipAssetId, licenseId)
- Time-series access patterns
- Growth trend calculations

## Background Jobs

### Job Schedule

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Metrics Aggregation | 2 AM UTC daily | Aggregate events into daily_metrics |
| Post Daily Metrics | 3 AM UTC daily | Aggregate post-specific metrics |
| Weekly Metrics Rollup | 4 AM UTC Monday | Roll up daily metrics into weekly summaries |
| Monthly Metrics Rollup | 5 AM UTC 2nd of month | Roll up daily metrics into monthly summaries |

### Job Configuration

**Retry Strategy**:
- Daily: 3 attempts, exponential backoff (1 minute)
- Weekly: 3 attempts, exponential backoff (2 minutes)
- Monthly: 3 attempts, exponential backoff (3 minutes)

**Error Handling**:
- All jobs log to `metrics_aggregation_jobs_log`
- Failed jobs trigger alerts after final retry
- Partial failures are tracked separately

### Monitoring

Check job health:
```typescript
import { getMetricsAggregationHealth } from '@/jobs/analytics-jobs';

const health = await getMetricsAggregationHealth();
console.log('Metrics aggregation health:', health);
```

## Performance Considerations

### Optimization Strategies

1. **Hierarchical Aggregation**
   - Daily → Weekly → Monthly reduces recomputation
   - Query higher-level aggregations for longer time ranges

2. **Indexed Queries**
   - All dimension columns are indexed
   - Date range queries use covering indexes
   - Composite indexes for common filter combinations

3. **Caching**
   - Historical metrics cached with 1-hour TTL
   - Current day metrics cached with 1-minute TTL
   - Cache warming for predictable queries

4. **Real-Time Metrics**
   - Redis for sub-millisecond access
   - Batch updates to reduce database writes
   - Periodic reconciliation to ensure accuracy

5. **Custom Metrics**
   - Query cost estimation before execution
   - Timeout protection (30-second default)
   - Materialized results cached

### Scalability

The system is designed to handle:
- Millions of daily events
- Thousands of metrics dimensions
- Hundreds of custom metric definitions
- High-frequency real-time updates

## Migration

Run the migration:
```bash
psql -U your_user -d your_database -f migrations/add_metrics_aggregation_system.sql
```

Generate Prisma client:
```bash
npm run db:generate
```

## Integration

### Initialize Workers

The workers are automatically initialized when the application starts. Ensure `initializeAllWorkers()` is called in your application entry point.

### Manual Job Triggering

Trigger jobs manually for backfilling or testing:

```typescript
import { 
  weeklyMetricsRollupQueue, 
  monthlyMetricsRollupQueue 
} from '@/jobs/metrics-aggregation.job';

// Trigger weekly rollup for specific week
await weeklyMetricsRollupQueue.add('weekly-metrics-rollup', {
  date: '2025-10-07', // Monday of the week
  jobType: 'weekly',
});

// Trigger monthly rollup for specific month
await monthlyMetricsRollupQueue.add('monthly-metrics-rollup', {
  date: '2025-10-01', // First of the month
  jobType: 'monthly',
});
```

### Backfilling Historical Data

Backfill weekly metrics:
```typescript
import { WeeklyMetricsRollupService } from '@/modules/analytics';
import { prisma } from '@/lib/db';

const service = new WeeklyMetricsRollupService(prisma);
await service.backfillWeeklyMetrics(
  new Date('2025-01-01'),
  new Date('2025-10-31')
);
```

Backfill monthly metrics:
```typescript
import { MonthlyMetricsRollupService } from '@/modules/analytics';
import { prisma } from '@/lib/db';

const service = new MonthlyMetricsRollupService(prisma);
await service.backfillMonthlyMetrics(
  new Date('2025-01-01'),
  new Date('2025-10-31')
);
```

## Monitoring & Observability

### Job Logs

Query job execution history:
```sql
SELECT 
  job_type,
  period_start_date,
  status,
  duration_seconds,
  records_processed,
  error_message
FROM metrics_aggregation_jobs_log
WHERE started_at >= NOW() - INTERVAL '7 days'
ORDER BY started_at DESC;
```

### Cache Statistics

```typescript
import { MetricsCacheService } from '@/modules/analytics';
import { redis } from '@/lib/db/redis';
import { prisma } from '@/lib/db';

const cacheService = new MetricsCacheService(redis, prisma);
const stats = await cacheService.getCacheStats();
console.log('Cache statistics:', stats);
```

### Real-Time Metrics Reconciliation

Schedule periodic reconciliation:
```typescript
import { RealtimeMetricsService } from '@/modules/analytics';
import { redis } from '@/lib/db/redis';
import { prisma } from '@/lib/db';

const realtimeService = new RealtimeMetricsService(prisma, redis);

// Run reconciliation for all metrics
await realtimeService.reconcileMetrics('*');

// Clear expired metrics
await realtimeService.clearExpiredMetrics();
```

## Best Practices

1. **Query Optimization**
   - Always use the highest-level aggregation available
   - Use weekly/monthly metrics for long time ranges
   - Cache expensive queries

2. **Custom Metrics**
   - Validate formulas before production use
   - Test with small date ranges first
   - Monitor query costs
   - Use dimensions wisely

3. **Real-Time Metrics**
   - Use for current/recent data only
   - Reconcile periodically
   - Set appropriate TTLs

4. **Cache Management**
   - Warm cache for predictable queries
   - Invalidate after aggregations
   - Monitor hit rates

5. **Job Monitoring**
   - Check job logs regularly
   - Set up alerts for failures
   - Monitor execution times

## Troubleshooting

### Jobs Not Running

Check BullMQ workers are initialized:
```typescript
import { weeklyMetricsRollupWorker } from '@/jobs/metrics-aggregation.job';
console.log('Worker active:', weeklyMetricsRollupWorker.isRunning());
```

### Slow Queries

Check indexes:
```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('daily_metrics', 'weekly_metrics', 'monthly_metrics')
ORDER BY tablename, indexname;
```

### Cache Issues

Clear and rebuild cache:
```typescript
const cacheService = new MetricsCacheService(redis, prisma);
await cacheService.clearAll();
// Cache will be automatically rebuilt on next query
```

### Data Inconsistencies

Reconcile real-time metrics:
```typescript
const realtimeService = new RealtimeMetricsService(prisma, redis);
await realtimeService.reconcileMetrics('your:metric:key');
```

## Future Enhancements

Potential additions to the system:
- Machine learning-based anomaly detection
- Automatic metric recommendations
- Data retention policies
- Metric templates library
- Advanced visualization integrations
- Multi-tenancy support
- Data export to data warehouses
- Streaming aggregations

## Support

For issues or questions:
1. Check job logs in `metrics_aggregation_jobs_log`
2. Review cache statistics
3. Verify BullMQ workers are running
4. Check Redis connection
5. Consult the documentation above

---

**Implementation Status**: ✅ Complete

All components of the metrics aggregation system have been implemented and are ready for use.
