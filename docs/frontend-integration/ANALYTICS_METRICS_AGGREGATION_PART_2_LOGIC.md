# Analytics & Metrics Aggregation - Frontend Integration Guide (Part 2: Business Logic & Validation)

## Classification: 🔒 ADMIN ONLY / ⚡ HYBRID

**Last Updated:** October 17, 2025  
**API Version:** 1.0  
**Module:** Analytics Data Collection & Metrics Aggregation

---

## Table of Contents

1. [Validation Rules](#validation-rules)
2. [Business Logic & Calculations](#business-logic--calculations)
3. [Data Aggregation Rules](#data-aggregation-rules)
4. [Caching Strategy](#caching-strategy)
5. [Real-time Metrics](#real-time-metrics)
6. [Custom Metrics](#custom-metrics)

---

## Validation Rules

### Event Tracking Validation

#### Field-Level Validation

```typescript
// Event Type
eventType: {
  required: true,
  maxLength: 100,
  pattern: /^[a-z_]+$/, // Lowercase with underscores only
  examples: ['asset_viewed', 'license_created', 'page_view']
}

// Entity ID
entityId: {
  required: false,
  format: 'cuid',
  pattern: /^c[a-z0-9]{24}$/,
  notes: 'Must be valid CUID from database'
}

// Entity Type
entityType: {
  required: 'if entityId is provided',
  enum: ['PROJECT', 'ASSET', 'LICENSE', 'CREATOR', 'BRAND', 'USER', 'ROYALTY', 'PAYOUT', 'POST', 'CATEGORY'],
  notes: 'Cannot be null if entityId is set'
}

// Session ID
sessionId: {
  required: false,
  format: 'uuid',
  pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  notes: 'Use crypto.randomUUID() to generate'
}

// Source
source: {
  required: false,
  default: 'web',
  enum: ['web', 'api', 'mobile', 'system', 'webhook']
}

// Props
props: {
  required: false,
  type: 'object',
  maxSize: '10KB',
  notes: 'Will be stored as JSON, avoid nested objects > 3 levels deep'
}

// Attribution
attribution: {
  required: false,
  fields: {
    utmSource: { maxLength: 255 },
    utmMedium: { maxLength: 255 },
    utmCampaign: { maxLength: 255 },
    utmTerm: { maxLength: 255 },
    utmContent: { maxLength: 255 },
    referrer: { format: 'url or empty string' },
    landingPage: { format: 'url or empty string' }
  }
}

// Idempotency Key
idempotencyKey: {
  required: false,
  format: 'uuid',
  notes: 'Prevents duplicate events within 60 seconds'
}
```

#### Cross-Field Validation

**Rule 1: Entity Relationship**
```typescript
// If entityId is provided, entityType MUST be provided
if (input.entityId && !input.entityType) {
  throw new ValidationError('entityType is required when entityId is provided');
}
```

**Rule 2: Date Range Validation**
```typescript
// For date range queries
if (dateRange) {
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  
  if (start >= end) {
    throw new ValidationError('Start date must be before end date');
  }
  
  // Maximum 1 year range
  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
  if (end.getTime() - start.getTime() > maxRange) {
    throw new ValidationError('Date range cannot exceed 1 year');
  }
}
```

**Rule 3: Batch Size Limits**
```typescript
// Batch event tracking
if (events.length < 1 || events.length > 50) {
  throw new ValidationError('Batch must contain between 1 and 50 events');
}
```

---

### Dashboard Query Validation

#### Creator Dashboard

```typescript
// Creator ID validation
creatorId: {
  required: true,
  format: 'cuid',
  authorization: 'Must be current user\'s creator ID or user must be ADMIN'
}

// Period validation
period: {
  required: false,
  default: '30d',
  enum: ['7d', '30d', '90d', '1y', 'all']
}
```

**Authorization Logic:**
```typescript
// Frontend should enforce this before calling API
const canAccessCreatorDashboard = (
  requestedCreatorId: string,
  currentUser: User
): boolean => {
  if (currentUser.role === 'ADMIN') return true;
  if (currentUser.creator?.id === requestedCreatorId) return true;
  return false;
};
```

#### Brand Campaign Metrics

```typescript
// Brand ID validation
brandId: {
  required: true,
  format: 'cuid',
  authorization: 'Must be current user\'s brand ID or user must be ADMIN'
}

// Campaign ID validation
campaignId: {
  required: false,
  format: 'cuid',
  notes: 'If provided, filters to specific campaign'
}

// Date Range validation
dateRange: {
  required: true,
  start: { format: 'ISO datetime' },
  end: { format: 'ISO datetime' },
  maxRange: '1 year'
}
```

#### Platform Metrics (Admin Only)

```typescript
// Period validation
period: {
  required: false,
  default: '30d',
  enum: ['today', '7d', '30d', '90d']
}

// Authorization
role: {
  required: 'ADMIN',
  message: 'Only administrators can access platform-wide metrics'
}
```

---

## Business Logic & Calculations

### Metric Calculations

#### Conversion Rate

```typescript
/**
 * Calculate conversion rate percentage
 * Conversion rate = (conversions / views) * 100
 */
const calculateConversionRate = (
  conversions: number,
  views: number
): number => {
  if (views === 0) return 0;
  return (conversions / views) * 100;
};

// Example usage
const conversionRate = calculateConversionRate(47, 15230); // 0.31%
```

#### Click-Through Rate (CTR)

```typescript
/**
 * Calculate click-through rate percentage
 * CTR = (clicks / views) * 100
 */
const calculateCTR = (
  clicks: number,
  views: number
): number => {
  if (views === 0) return 0;
  return (clicks / views) * 100;
};

// Example usage
const ctr = calculateCTR(523, 5420); // 9.65%
```

#### Return on Investment (ROI)

```typescript
/**
 * Calculate ROI percentage
 * ROI = ((revenue - spend) / spend) * 100
 */
const calculateROI = (
  revenueCents: number,
  spendCents: number
): number => {
  if (spendCents === 0) return 0;
  return ((revenueCents - spendCents) / spendCents) * 100;
};

// Example usage
const roi = calculateROI(450000, 300000); // 50% ROI
```

#### Growth Percentage

```typescript
/**
 * Calculate percentage growth between two periods
 * Growth = ((current - previous) / previous) * 100
 */
const calculateGrowth = (
  current: number,
  previous: number
): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

// Example usage
const growth = calculateGrowth(1250000, 1000000); // 25% growth
```

#### Average Engagement Time

```typescript
/**
 * Calculate average engagement time in seconds
 * Avg = totalEngagementTime / uniqueVisitors
 */
const calculateAvgEngagementTime = (
  totalEngagementSeconds: number,
  uniqueVisitors: number
): number => {
  if (uniqueVisitors === 0) return 0;
  return totalEngagementSeconds / uniqueVisitors;
};

// Example usage
const avgTime = calculateAvgEngagementTime(45600, 2156); // 21.15 seconds
```

---

### Revenue Calculations

#### Currency Formatting

```typescript
/**
 * Format cents to currency display
 * 
 * @param cents - Amount in cents (integer)
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string
 */
const formatCurrency = (
  cents: number,
  currency: string = 'USD'
): string => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(dollars);
};

// Example usage
formatCurrency(1250000); // "$12,500.00"
formatCurrency(450000);  // "$4,500.00"
```

#### Revenue Per Unit

```typescript
/**
 * Calculate average revenue per item
 */
const calculateAvgRevenuePerItem = (
  totalRevenueCents: number,
  itemCount: number
): number => {
  if (itemCount === 0) return 0;
  return totalRevenueCents / itemCount;
};

// Example: Average revenue per creator
const avgRevenuePerCreator = calculateAvgRevenuePerItem(5420000, 567);
// Result: 9558.73 cents = $95.59 per creator
```

---

### Period Date Range Helpers

```typescript
/**
 * Get date range for a period string
 */
const getPeriodDateRange = (
  period: Period
): { start: Date; end: Date } => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2020, 0, 1); // Platform inception
      break;
  }
  
  return { start, end };
};

// Example usage
const { start, end } = getPeriodDateRange('30d');
```

---

## Data Aggregation Rules

### Daily Metrics Aggregation

Daily metrics are aggregated from raw events every night at 2:00 AM UTC. The aggregation process:

1. **Groups events by:**
   - Date (day boundary at midnight UTC)
   - IP Asset ID
   - Project ID
   - License ID

2. **Calculates:**
   - `views` - Count of `asset_viewed` events
   - `clicks` - Count of `asset_downloaded` or `license_clicked` events
   - `conversions` - Count of `license_created` events
   - `revenueCents` - Sum of revenue from event props
   - `uniqueVisitors` - Distinct count of actor IDs
   - `engagementTime` - Sum of engagement time from event props

3. **Idempotency:**
   - Uses `UPSERT` operation on unique constraint: `(date, projectId, ipAssetId, licenseId)`
   - Re-running aggregation for the same day updates existing records

### Weekly Metrics Rollup

Weekly metrics aggregate daily metrics into weekly summaries:

1. **Week Definition:**
   - Weeks start on Monday (ISO 8601)
   - Week end is Sunday 23:59:59

2. **Aggregation:**
   - Sums all daily metrics for the week
   - Calculates week-over-week growth percentage
   - Computes daily averages within the week

3. **Schedule:**
   - Runs every Monday at 4:00 AM UTC
   - Processes previous complete week

### Monthly Metrics Rollup

Monthly metrics aggregate daily metrics into monthly summaries:

1. **Month Definition:**
   - Calendar month boundaries
   - Includes partial months for current month

2. **Aggregation:**
   - Sums all daily metrics for the month
   - Includes weekly breakdown within the month
   - Calculates month-over-month growth
   - Computes daily averages

3. **Schedule:**
   - Runs on 2nd of each month at 5:00 AM UTC
   - Processes previous complete month

---

## Caching Strategy

### Cache Keys

The analytics system uses Redis for caching with the following key patterns:

```typescript
// Daily metrics
`metrics:daily:{type}:{id}:{date}`

// Weekly metrics
`metrics:weekly:{type}:{id}:{weekStart}`

// Monthly metrics
`metrics:monthly:{type}:{id}:{year}-{month}`

// Dashboard data
`analytics:creator:{creatorId}:{period}`
`analytics:platform:{period}`

// Custom metrics
`metrics:custom:{definitionId}:{periodStart}:{periodEnd}`
```

### TTL (Time-To-Live) Strategy

```typescript
// Cache TTLs
const CACHE_TTL = {
  // Short TTL for frequently changing data
  SHORT: 300,        // 5 minutes
  
  // Default TTL for most metrics
  DEFAULT: 3600,     // 1 hour
  
  // Long TTL for historical data
  LONG: 86400,       // 24 hours
  
  // Dashboard specific
  CREATOR_DASHBOARD: 600,   // 10 minutes
  PLATFORM_METRICS: 3600,   // 1 hour
};
```

### Cache Invalidation Rules

#### Automatic Invalidation

Cache is automatically invalidated when:

1. **Daily aggregation completes** → Invalidate daily metrics cache
2. **Weekly rollup completes** → Invalidate weekly metrics cache
3. **Monthly rollup completes** → Invalidate monthly metrics cache
4. **Custom metric calculated** → Invalidate custom metric cache

#### Manual Invalidation

```typescript
/**
 * Invalidate dashboard cache for a specific scope
 */
const invalidateCache = async (
  scope: 'creator' | 'brand' | 'platform',
  id?: string
): Promise<void> => {
  let pattern: string;
  
  if (scope === 'creator' && id) {
    pattern = `analytics:creator:${id}:*`;
  } else if (scope === 'platform') {
    pattern = `analytics:platform:*`;
  }
  
  // Delete matching keys
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
};
```

### Frontend Cache Strategy

#### React Query Configuration

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dashboard metrics - cache for 10 minutes
      staleTime: 10 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      
      // Refetch on window focus for real-time updates
      refetchOnWindowFocus: true,
      
      // Retry failed requests
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Specific query configurations
const dashboardQueryOptions = {
  staleTime: 10 * 60 * 1000,  // 10 minutes
  cacheTime: 30 * 60 * 1000,  // 30 minutes
};

const platformMetricsOptions = {
  staleTime: 60 * 60 * 1000,  // 1 hour
  cacheTime: 2 * 60 * 60 * 1000,  // 2 hours
};
```

---

## Real-time Metrics

Real-time metrics are stored in Redis for fast access and updated incrementally as events occur.

### Metric Types

#### 1. Counters

Incremental counters for tracking cumulative events.

```typescript
/**
 * Track counter metric
 * Example: Page views, button clicks
 */
const trackCounter = async (
  metricKey: string,
  value: number = 1,
  dimensions?: Record<string, string>
) => {
  await trpc.analytics.realtime.incrementCounter.mutate({
    metricKey,
    value,
    dimensions,
  });
};

// Usage example
await trackCounter('events:page_view', 1, {
  page: '/dashboard',
  userId: 'clx123user',
});
```

#### 2. Gauges

Current value metrics (last value wins).

```typescript
/**
 * Set gauge metric
 * Example: Active users, system load
 */
const setGauge = async (
  metricKey: string,
  value: number,
  dimensions?: Record<string, string>,
  unit?: string
) => {
  await trpc.analytics.realtime.setGauge.mutate({
    metricKey,
    value,
    dimensions,
    unit,
  });
};

// Usage example
await setGauge('active_users', 1523, undefined, 'count');
```

#### 3. Histograms

Distribution metrics for calculating percentiles.

```typescript
/**
 * Record histogram value
 * Example: API response times, page load times
 */
const recordHistogram = async (
  metricKey: string,
  value: number,
  dimensions?: Record<string, string>
) => {
  await trpc.analytics.realtime.recordHistogram.mutate({
    metricKey,
    value,
    dimensions,
  });
};

// Usage example
await recordHistogram('api:response_time', 145, {
  endpoint: '/api/assets',
});
```

#### 4. Rates

Events per time period.

```typescript
/**
 * Track rate metric
 * Example: Requests per second, events per minute
 */
const trackRate = async (
  metricKey: string,
  windowSeconds: number = 60,
  dimensions?: Record<string, string>
) => {
  await trpc.analytics.realtime.trackRate.mutate({
    metricKey,
    windowSeconds,
    dimensions,
  });
};

// Usage example
await trackRate('api:requests', 60); // Track requests per minute
```

### Real-time Metric Best Practices

**DO:**
- Use counters for cumulative metrics
- Use gauges for current state
- Use histograms for performance metrics
- Keep dimension cardinality low (< 10 unique values per dimension)

**DON'T:**
- Don't use real-time metrics for historical analysis (use daily metrics instead)
- Don't create unbounded dimensions (e.g., user IDs as dimensions)
- Don't track sensitive data in metric dimensions

---

## Custom Metrics

Custom metrics allow users (typically admins) to define their own metric calculations.

### Metric Types

```typescript
type CustomMetricType = 
  | 'COUNT'           // Count of records
  | 'SUM'             // Sum of values
  | 'AVERAGE'         // Average of values
  | 'DISTINCT_COUNT'  // Count of unique values
  | 'PERCENTILE'      // Percentile calculation (p50, p95, p99)
  | 'RATIO'           // Ratio between two values
  | 'MAX'             // Maximum value
  | 'MIN';            // Minimum value
```

### Data Sources

```typescript
type DataSource = 
  | 'events'          // Raw event data
  | 'daily_metrics'   // Aggregated daily metrics
  | 'licenses'        // License records
  | 'assets'          // Asset records
  | 'users'           // User records
  | 'projects';       // Project records
```

### Calculation Formula

Custom metrics use a simplified DSL (Domain Specific Language) for calculations:

```typescript
// Example formulas
const formulas = {
  // Count active users in last 30 days
  activeUsers: `
    SELECT COUNT(DISTINCT actor_id)
    FROM events
    WHERE occurred_at >= NOW() - INTERVAL '30 days'
  `,
  
  // Average revenue per customer
  avgRevenuePerCustomer: `
    SELECT AVG(revenue_cents) / 100
    FROM daily_metrics
    WHERE date >= :start_date AND date <= :end_date
  `,
  
  // License renewal rate
  renewalRate: `
    SELECT 
      (COUNT(*) FILTER (WHERE parent_license_id IS NOT NULL)::float / 
       COUNT(*)::float) * 100
    FROM licenses
    WHERE created_at >= :start_date
  `,
};
```

### Security & Validation

**Query Validation Rules:**
- Only SELECT statements allowed
- No subqueries allowed
- Maximum query timeout: 30 seconds
- Dangerous operations blocked (DROP, DELETE, UPDATE, INSERT)
- Query cost estimation performed before execution

**Cost Estimation:**
```typescript
type QueryCost = 'LOW' | 'MEDIUM' | 'HIGH';

// LOW: Simple aggregations on indexed columns
// MEDIUM: Joins or aggregations on non-indexed columns
// HIGH: Complex calculations or full table scans
```

---

## State Machine & Workflows

### Event Processing Pipeline

```
1. Event Received
   ↓
2. Validation
   ↓
3. Deduplication Check (if idempotencyKey provided)
   ↓
4. Buffer in Memory
   ↓
5. Batch Write to Database (every 10s or 100 events)
   ↓
6. Enqueue for Enrichment
   ↓
7. Enrichment Processing (user agent parsing, geolocation)
   ↓
8. Event Complete
```

### Metrics Aggregation Schedule

```
Daily:
- 02:00 UTC → Event deduplication job
- 02:00 UTC → Daily metrics aggregation
- 03:00 UTC → Post-aggregation cache warming
- Hourly    → Real-time metrics reconciliation

Weekly:
- Monday 04:00 UTC → Weekly metrics rollup

Monthly:
- 2nd of month 05:00 UTC → Monthly metrics rollup
```

---

## Edge Cases & Special Handling

### Zero Division Protection

Always check for zero denominators in calculations:

```typescript
// BAD - Will crash on zero views
const ctr = (clicks / views) * 100;

// GOOD - Protected
const ctr = views > 0 ? (clicks / views) * 100 : 0;
```

### Missing Data Handling

```typescript
// Handle missing or null values
const metricValue = dailyMetric?.views ?? 0;
const growth = previousValue ? calculateGrowth(current, previousValue) : null;
```

### Timezone Handling

All dates are stored in UTC. Convert to user's timezone on frontend:

```typescript
import { format, utcToZonedTime } from 'date-fns-tz';

const displayDate = (isoDate: string, timezone: string = 'America/New_York') => {
  const date = new Date(isoDate);
  const zonedDate = utcToZonedTime(date, timezone);
  return format(zonedDate, 'MMM dd, yyyy HH:mm zzz', { timeZone: timezone });
};
```

### Large Number Formatting

```typescript
/**
 * Format large numbers with abbreviations
 */
const formatNumber = (num: number): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
};

// Examples:
formatNumber(1523);      // "1.5K"
formatNumber(1523000);   // "1.5M"
formatNumber(342);       // "342"
```

---

## Next Steps

Continue to:
- **[Part 1: API Reference](./ANALYTICS_METRICS_AGGREGATION_PART_1_API.md)** - API endpoints and type definitions
- **[Part 3: Implementation Guide](./ANALYTICS_METRICS_AGGREGATION_PART_3_IMPLEMENTATION.md)** - Error handling, implementation examples, and frontend checklist

---

## Support

For questions or issues:
- **Calculation Questions:** Check calculation helper functions in code examples above
- **Validation Errors:** Refer to validation rules section
- **Business Logic:** Contact backend team for clarification
