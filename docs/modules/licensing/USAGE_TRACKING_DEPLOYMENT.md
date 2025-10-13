# License Usage Tracking - Deployment Guide

## Pre-Deployment Checklist

- [ ] Review all database migrations
- [ ] Verify Redis connection configuration
- [ ] Configure Stripe integration for billing
- [ ] Set up notification service integration
- [ ] Test job queue configuration

## Step 1: Database Migration

```bash
# Review the migration
cat prisma/migrations/20241012000001_add_license_usage_tracking/migration.sql

# Apply migration to development
npx prisma migrate dev --name add_license_usage_tracking

# Generate Prisma client
npx prisma generate

# Verify migration
npx prisma migrate status
```

## Step 2: Configure Environment Variables

Add or verify in `.env`:

```bash
# Existing required variables
DATABASE_URL="postgresql://..."
DATABASE_URL_POOLED="postgresql://..."
REDIS_URL="redis://..."

# Stripe for billing (should already exist)
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Optional: Usage tracking configuration
USAGE_TRACKING_BATCH_SIZE=100
USAGE_EVENT_RETENTION_DAYS=90
USAGE_CACHE_TTL_SECONDS=300
```

## Step 3: Enable Usage Tracking on Existing Licenses

```sql
-- Enable usage tracking on all active licenses
UPDATE licenses
SET usage_tracking_enabled = TRUE
WHERE status = 'ACTIVE'
  AND deleted_at IS NULL;

-- Verify
SELECT 
  COUNT(*) as total_licenses,
  SUM(CASE WHEN usage_tracking_enabled THEN 1 ELSE 0 END) as tracking_enabled
FROM licenses
WHERE deleted_at IS NULL;
```

## Step 4: Backfill Historical Data (Optional)

If you have existing usage data in the `events` or `daily_metrics` tables:

```typescript
import { usageAggregationService } from '@/modules/licenses/usage';

// Backfill for specific license
await usageAggregationService.backfillAggregates(
  'license_id',
  new Date('2024-01-01'),
  new Date('2024-10-12')
);
```

Or use the admin API:

```bash
curl -X POST https://your-api.com/api/trpc/usage.recalculateAggregates \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "licenseId": "lic_123",
    "startDate": "2024-01-01",
    "endDate": "2024-10-12"
  }'
```

## Step 5: Configure Job Scheduler

Update your job scheduler configuration (e.g., in `src/jobs/scheduler.ts`):

```typescript
import {
  aggregateUsageMetricsJob,
  checkUsageThresholdsJob,
  generateUsageForecastsJob,
  cleanupOldUsageEventsJob,
  sendForecastBreachAlertsJob,
} from './license-usage-tracking.job';

// Hourly jobs
scheduler.schedule('0 * * * *', aggregateUsageMetricsJob);
scheduler.schedule('30 * * * *', checkUsageThresholdsJob);

// Daily jobs
scheduler.schedule('0 2 * * *', aggregateUsageMetricsJob); // 02:00 UTC
scheduler.schedule('0 3 * * *', generateUsageForecastsJob); // 03:00 UTC
scheduler.schedule('0 9 * * *', sendForecastBreachAlertsJob); // 09:00 UTC

// Weekly jobs
scheduler.schedule('0 4 * * 0', cleanupOldUsageEventsJob); // Sunday 04:00 UTC
```

## Step 6: Register Usage Router

In your main tRPC router (e.g., `src/lib/trpc/routers/_app.ts`):

```typescript
import { usageRouter } from '@/modules/licenses/usage/router';

export const appRouter = createTRPCRouter({
  // ...existing routers
  licenses: licenseRouter,
  usage: usageRouter, // <-- Add this
  royalties: royaltyRouter,
  // ...
});
```

## Step 7: Test Usage Tracking

### Test Event Ingestion

```typescript
import { usageTrackingService } from '@/modules/licenses/usage';

const result = await usageTrackingService.trackUsageEvent({
  licenseId: 'test_license_id',
  usageType: 'view',
  quantity: 1,
  platform: 'web',
  deviceType: 'desktop',
  idempotencyKey: 'test_event_1',
});

console.log('Event tracked:', result);
```

### Test Threshold Monitoring

```bash
# Create a test threshold
curl -X POST https://your-api.com/api/trpc/usage.createThreshold \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "licenseId": "lic_123",
    "usageType": "view",
    "limitQuantity": 1000,
    "periodType": "monthly",
    "gracePercentage": 10,
    "allowOverage": true,
    "overageRateCents": 5
  }'

# Check threshold status
curl https://your-api.com/api/trpc/usage.getThresholdStatus?licenseId=lic_123
```

### Test Analytics

```bash
# Get usage analytics
curl "https://your-api.com/api/trpc/usage.getAnalytics?licenseId=lic_123&startDate=2024-10-01&endDate=2024-10-31&granularity=daily"
```

## Step 8: Configure Monitoring

Set up monitoring for:

### Job Health
- **Aggregation job completion rate** (should be >99%)
- **Aggregation job duration** (alert if >5 minutes)
- **Threshold check job completion** (should run hourly)

### System Performance
- **Event ingestion rate** (events/second)
- **Cache hit rate** for analytics (target >80%)
- **Database query performance** (p95 <100ms for aggregates)

### Business Metrics
- **Active licenses with tracking enabled**
- **Total usage events per day**
- **Overages detected vs. approved**
- **Forecast accuracy** (compare predictions vs. actuals)

Example monitoring query:

```sql
-- Daily usage tracking health check
SELECT 
  current_date as check_date,
  COUNT(DISTINCT license_id) as licenses_tracked,
  SUM(total_quantity) as total_usage_today,
  COUNT(*) as daily_aggregates_created
FROM license_usage_daily_aggregates
WHERE date = current_date;
```

## Step 9: User Communication

Notify users about new features:

1. **For Brands:**
   - Usage tracking now available
   - Real-time analytics dashboard
   - Automatic threshold monitoring
   - Overage alerts and billing

2. **For Creators:**
   - View usage metrics for your assets
   - Understand how your work is being used
   - Usage-based royalties included in statements

## Step 10: Rollback Plan

If issues arise:

```sql
-- 1. Disable usage tracking
UPDATE licenses SET usage_tracking_enabled = FALSE;

-- 2. Stop background jobs (via scheduler)

-- 3. Optionally rollback migration
npx prisma migrate reset --skip-seed

-- Or revert to specific migration
npx prisma migrate resolve --rolled-back 20241012000001_add_license_usage_tracking
```

## Post-Deployment Verification

After 24 hours, verify:

- [ ] Events are being logged
- [ ] Daily aggregation completed successfully
- [ ] Threshold checks running without errors
- [ ] Analytics queries performing well (<200ms)
- [ ] No increase in error rates
- [ ] Cache hit rates are acceptable
- [ ] Job queue not backing up

### Verification Queries

```sql
-- Check event ingestion
SELECT 
  DATE(occurred_at) as date,
  COUNT(*) as events,
  COUNT(DISTINCT license_id) as unique_licenses
FROM license_usage_events
WHERE occurred_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(occurred_at)
ORDER BY date DESC;

-- Check aggregation completeness
SELECT date, COUNT(*) as licenses_aggregated
FROM license_usage_daily_aggregates
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;

-- Check threshold activity
SELECT 
  COUNT(*) as active_thresholds,
  COUNT(CASE WHEN last_warning_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as warnings_sent_24h
FROM license_usage_thresholds
WHERE is_active = TRUE;

-- Check overage detection
SELECT 
  status,
  COUNT(*) as count,
  SUM(calculated_fee_cents) / 100.0 as total_fees
FROM license_usage_overages
GROUP BY status;
```

## Troubleshooting

### Events not being tracked
- Check license has `usage_tracking_enabled = TRUE`
- Verify Redis connection for idempotency cache
- Check job queue is processing

### Aggregation not running
- Verify job scheduler configuration
- Check Redis connection for job queue
- Review job logs for errors

### Analytics queries slow
- Ensure indexes are created (check migration)
- Verify aggregation jobs completing
- Check Redis cache is working

### Overages not detecting
- Verify thresholds are configured and `is_active = TRUE`
- Check threshold monitoring job is running
- Review threshold configuration (limit, period)

## Support

For issues or questions:
- Review logs in CloudWatch/Datadog
- Check Redis for cache/queue issues
- Review Prisma query logs
- Contact platform team
