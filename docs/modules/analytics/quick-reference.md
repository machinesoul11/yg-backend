# Analytics & Events Module - Quick Reference

## Event Tracking

### Track an Event
```typescript
import { EventService } from '@/modules/analytics/services/event.service';
import { EVENT_TYPES } from '@/lib/constants/event-types';

const eventService = new EventService(prisma, redis, jobQueue);

await eventService.trackEvent(
  {
    eventType: EVENT_TYPES.ASSET_VIEWED,
    source: 'web',
    entityId: assetId,
    entityType: 'asset',
    sessionId: req.sessionId,
    props: {
      assetTitle: 'My Asset',
      userAgent: req.headers['user-agent'],
    },
    attribution: {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring_2025',
      referrer: req.headers.referer,
    },
  },
  {
    session: { userId: req.userId, role: req.userRole },
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'macOS',
  }
);
```

### Event Types
```typescript
EVENT_TYPES.ASSET_VIEWED        // User views an asset
EVENT_TYPES.ASSET_DOWNLOADED    // User downloads an asset
EVENT_TYPES.LICENSE_CREATED     // New license created
EVENT_TYPES.LICENSE_SIGNED      // License signed by parties
EVENT_TYPES.PROJECT_CREATED     // Brand creates project
EVENT_TYPES.PAYOUT_COMPLETED    // Creator receives payout
// See event-types.ts for full list
```

---

## Metrics Queries

### Get Asset Metrics
```typescript
const metrics = await eventService.getAssetMetrics(
  assetId,
  {
    start: new Date('2025-01-01'),
    end: new Date('2025-01-31'),
  }
);

console.log(metrics.metrics.totalViews);        // Total views in period
console.log(metrics.metrics.totalConversions);  // Licenses created
console.log(metrics.metrics.topReferrers);      // Traffic sources
console.log(metrics.metrics.dailyBreakdown);    // Day-by-day stats
```

### Get Creator Dashboard
```typescript
import { AnalyticsDashboardService } from '@/modules/analytics/services/analytics-dashboard.service';

const dashboardService = new AnalyticsDashboardService(prisma, redis);

const dashboard = await dashboardService.getCreatorDashboard(creatorId, '30d');

console.log(dashboard.summary.totalRevenueCents);  // Revenue in period
console.log(dashboard.topAssets);                  // Best performing assets
console.log(dashboard.revenueTimeline);            // Daily revenue
console.log(dashboard.trafficSources);             // Where visitors came from
```

### Get Platform Metrics (Admin)
```typescript
const platformMetrics = await dashboardService.getPlatformMetrics('30d');

console.log(platformMetrics.users.total);              // Total users
console.log(platformMetrics.creators.avgRevenuePerCreator);
console.log(platformMetrics.revenue.growth);           // % growth vs previous period
console.log(platformMetrics.licenses.renewalRate);     // License renewal %
```

---

## Background Jobs

### Trigger Manual Aggregation
```typescript
import { aggregateDailyMetricsQueue } from '@/jobs/analytics-jobs';

// Aggregate yesterday's metrics
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

await aggregateDailyMetricsQueue.add('aggregate-daily-metrics', {
  date: yesterday.toISOString().split('T')[0],
});
```

### Backfill Historical Metrics
```typescript
import { MetricsAggregationService } from '@/modules/analytics/services/metrics-aggregation.service';

const aggregationService = new MetricsAggregationService(prisma);

await aggregationService.backfillMetrics(
  new Date('2025-01-01'),
  new Date('2025-01-31')
);
```

---

## Cache Management

### Invalidate Asset Metrics Cache
```typescript
await eventService.invalidateMetricsCache(assetId);
```

### Invalidate Creator Dashboard Cache
```typescript
await dashboardService.invalidateDashboardCache('creator', creatorId);
```

### Invalidate Platform Metrics Cache
```typescript
await dashboardService.invalidateDashboardCache('platform');
```

---

## Database Queries

### Query Raw Events
```typescript
const events = await eventService.getEntityEvents(
  assetId,
  'asset',
  100  // limit
);

events.forEach(event => {
  console.log(event.eventType, event.occurredAt, event.propsJson);
});
```

### Query Daily Metrics Directly
```typescript
const metrics = await prisma.dailyMetric.findMany({
  where: {
    ipAssetId: assetId,
    date: {
      gte: new Date('2025-01-01'),
      lte: new Date('2025-01-31'),
    },
  },
  orderBy: { date: 'asc' },
});
```

---

## Common Patterns

### Track Page View
```typescript
await eventService.trackEvent({
  eventType: EVENT_TYPES.PAGE_VIEWED,
  source: 'web',
  props: {
    path: req.path,
    title: 'Asset Gallery',
  },
}, context);
```

### Track Button Click
```typescript
await eventService.trackEvent({
  eventType: EVENT_TYPES.CTA_CLICKED,
  source: 'web',
  props: {
    buttonId: 'download-asset',
    buttonText: 'Download Now',
  },
}, context);
```

### Track License Creation
```typescript
await eventService.trackEvent({
  eventType: EVENT_TYPES.LICENSE_CREATED,
  source: 'api',
  entityId: licenseId,
  entityType: 'license',
  props: {
    licenseType: 'EXCLUSIVE',
    feeCents: 500000,
    revenueCents: 500000,
  },
}, context);
```

### Track Search
```typescript
await eventService.trackEvent({
  eventType: EVENT_TYPES.SEARCH_PERFORMED,
  source: 'web',
  props: {
    query: req.query.q,
    resultsCount: results.length,
  },
}, context);
```

---

## Schema Validation

### Validate Track Event Input
```typescript
import { trackEventSchema } from '@/lib/schemas/analytics.schema';

const input = trackEventSchema.parse({
  eventType: 'asset_viewed',
  source: 'web',
  entityId: assetId,
  entityType: 'asset',
  sessionId: sessionId,
  props: { assetTitle: 'Test' },
  attribution: {
    utmSource: 'google',
    utmMedium: 'cpc',
  },
});
```

### Validate Date Range
```typescript
import { dateRangeSchema } from '@/lib/schemas/analytics.schema';

const dateRange = dateRangeSchema.parse({
  start: '2025-01-01T00:00:00Z',
  end: '2025-01-31T23:59:59Z',
});
// Throws if start >= end
```

---

## Error Handling

### Event Tracking Never Fails
```typescript
// Event tracking errors are logged but don't throw
const result = await eventService.trackEvent(input, context);

if (!result.tracked) {
  console.warn('Event tracking failed, but user action succeeded');
}
```

### Metrics Queries Throw TRPCError
```typescript
try {
  const metrics = await eventService.getAssetMetrics(assetId);
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    // Asset doesn't exist
  } else if (error.code === 'INTERNAL_SERVER_ERROR') {
    // Database error
  }
}
```

---

## Performance Tips

1. **Use Daily Metrics for Dashboards**: Query `daily_metrics` table, not raw `events`
2. **Set Appropriate Cache TTLs**: Asset metrics (5 min), Creator dashboard (10 min), Platform (1 hour)
3. **Batch Event Tracking**: Collect events client-side, send in batches
4. **Use Idempotency Keys**: Prevent duplicate events on retries
5. **Index Coverage**: Ensure queries use existing indexes on `occurred_at`, `event_type`, `ip_asset_id`

---

## Debugging

### Check Event Creation
```sql
SELECT * FROM events 
WHERE event_type = 'asset_viewed' 
  AND ip_asset_id = 'cuid'
ORDER BY occurred_at DESC 
LIMIT 10;
```

### Check Attribution Data
```sql
SELECT e.event_type, a.utm_source, a.utm_campaign, a.device_type
FROM events e
JOIN attribution a ON a.event_id = e.id
WHERE e.ip_asset_id = 'cuid'
ORDER BY e.occurred_at DESC
LIMIT 10;
```

### Check Daily Metrics
```sql
SELECT date, views, clicks, conversions, revenue_cents
FROM daily_metrics
WHERE ip_asset_id = 'cuid'
ORDER BY date DESC
LIMIT 30;
```

### Check Redis Cache
```bash
redis-cli
> KEYS analytics:*
> GET analytics:asset:cuid123:*
```

### Monitor Background Jobs
```bash
# In BullMQ Board UI or Redis CLI
redis-cli
> KEYS bull:aggregate-daily-metrics:*
> HGETALL bull:aggregate-daily-metrics:job:123
```

---

## Security Checklist

- [ ] Validate all user inputs with Zod schemas
- [ ] Check user authorization before returning metrics
- [ ] Redact PII from event exports
- [ ] Rate limit event tracking endpoints (100/min per user)
- [ ] Use parameterized queries (Prisma/prepared statements)
- [ ] Honor "Do Not Track" browser headers
- [ ] Implement data retention policy (delete old events)
- [ ] Encrypt sensitive props in `props_json` if needed

---

## Related Documentation

- [Analytics & Events Module - Complete](./ANALYTICS_EVENTS_MODULE_COMPLETE.md)
- [Event Types Registry](../src/lib/constants/event-types.ts)
- [Analytics Schemas](../src/lib/schemas/analytics.schema.ts)
- [Background Jobs](../src/jobs/analytics-jobs.ts)

---

**Last Updated**: October 10, 2025
