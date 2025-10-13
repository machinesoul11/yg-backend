# License Usage Tracking Implementation

## Overview

Comprehensive license usage tracking system with real-time analytics, threshold monitoring, overage detection, usage forecasting, and usage-based billing integration.

## Architecture

### Database Layer
- **`license_usage_events`** - Immutable event log for all usage tracking
- **`license_usage_daily_aggregates`** - Aggregated daily metrics for performance
- **`license_usage_thresholds`** - Configured limits and warning levels
- **`license_usage_overages`** - Detected overage events
- **`license_usage_forecasts`** - Predictive analytics

### Services

#### 1. Usage Tracking Service (`usage-tracking.service.ts`)
- **Track individual/batch usage events** (non-blocking, batched writes)
- **Real-time usage queries** with Redis caching
- **Idempotency support** to prevent duplicate events
- **Automatic license validation** (period, tracking enabled)

#### 2. Usage Aggregation Service (`usage-aggregation.service.ts`)
- **Daily aggregation** of raw events into metrics tables
- **Runs nightly** for previous day + hourly for current day
- **Backfill support** for historical data
- **Performance optimized** with raw SQL queries

#### 3. Threshold Monitoring Service (`usage-threshold.service.ts`)
- **Configure thresholds** per license/usage type
- **Multi-level warnings** (50%, 75%, 90%, 100%)
- **Grace periods** for soft limits
- **Automatic notifications** via notification service
- **Overage detection** and recording

#### 4. Analytics Dashboard Service (`usage-analytics.service.ts`)
- **Comprehensive analytics** with caching
- **Period comparisons** with percentage changes
- **Usage trends** (daily/weekly/monthly)
- **Top sources, platforms, geographic distribution**
- **Real-time dashboard data**

#### 5. Forecasting Service (`usage-forecasting.service.ts`)
- **Linear regression** based forecasting
- **Threshold breach prediction** with confidence intervals
- **Historical data analysis** (configurable lookback period)
- **Proactive alerts** for predicted breaches

#### 6. Billing Integration Service (`usage-billing.service.ts`)
- **Process overage billing** with Stripe integration
- **Usage-based royalty distribution** to creators
- **Automatic/manual approval workflows**
- **Revenue-share calculation** from usage fees

### Background Jobs (`license-usage-tracking.job.ts`)

1. **Aggregate Usage Metrics** - Hourly + nightly at 02:00 UTC
2. **Check Usage Thresholds** - Hourly
3. **Generate Forecasts** - Daily at 03:00 UTC
4. **Cleanup Old Events** - Weekly (90-day retention)
5. **Send Forecast Breach Alerts** - Daily at 09:00 UTC

### API (tRPC Router)

```typescript
// Track usage
trackEvent({ licenseId, usageType, quantity, ... })
trackBatch({ events: [...] })

// Analytics
getAnalytics({ licenseId, startDate, endDate, granularity })
comparePeriods({ licenseId, period1Start, period1End, period2Start, period2End })

// Thresholds
createThreshold({ licenseId, usageType, limitQuantity, periodType })
getThresholdStatus({ licenseId })
getOverages({ licenseId, status })
approveOverage({ overageId, billedFeeCents })

// Forecasting
generateForecast({ licenseId, usageType, periodStart, periodEnd })
getForecasts({ licenseId })

// Admin
recalculateAggregates({ licenseId, startDate, endDate })
```

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
npx prisma migrate dev --name add_license_usage_tracking

# Generate Prisma client
npx prisma generate
```

### 2. Configure Environment Variables

Ensure these are set in your `.env`:
- `DATABASE_URL` - Postgres connection
- `REDIS_URL` - Redis for caching and job queues
- `STRIPE_SECRET_KEY` - For billing integration

### 3. Schedule Background Jobs

Add to your job scheduler configuration:

```typescript
// Hourly jobs
schedule.every('1 hour').job(aggregateUsageMetricsJob);
schedule.every('1 hour').job(checkUsageThresholdsJob);

// Daily jobs
schedule.daily('02:00').job(aggregateUsageMetricsJob); // Final aggregation
schedule.daily('03:00').job(generateUsageForecastsJob);
schedule.daily('09:00').job(sendForecastBreachAlertsJob);

// Weekly jobs
schedule.weekly('sunday', '04:00').job(cleanupOldUsageEventsJob);
```

### 4. Integrate with Royalty System

In `royalty-calculation.service.ts`, update revenue calculation:

```typescript
private async calculateLicenseRevenue(
  license: License,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  // Existing flat-fee calculation...
  
  // Add usage-based revenue
  if (license.revShareBps > 0) {
    const { usageBillingService } = await import('@/modules/licenses/usage');
    const usageRoyalties = await usageBillingService.calculateUsageBasedRoyalties(
      license.id,
      periodStart,
      periodEnd
    );
    
    const usageRevenue = usageRoyalties.reduce(
      (sum, r) => sum + r.usageRevenueCents,
      0
    );
    
    return flatFeeRevenue + usageRevenue;
  }
  
  return flatFeeRevenue;
}
```

## Usage Examples

### Track Usage Event

```typescript
import { usageTrackingService } from '@/modules/licenses/usage';

// Track a video view
await usageTrackingService.trackUsageEvent({
  licenseId: 'lic_123',
  usageType: 'view',
  quantity: 1,
  platform: 'web',
  deviceType: 'desktop',
  geographicLocation: 'US-CA',
  sessionId: 'session_xyz',
});
```

### Configure Threshold

```typescript
import { usageThresholdService } from '@/modules/licenses/usage';

// Set 100,000 impression limit per month with warnings
await usageThresholdService.createThreshold({
  licenseId: 'lic_123',
  usageType: 'impression',
  limitQuantity: 100000,
  periodType: 'monthly',
  gracePercentage: 10, // 10% grace
  warningAt50: true,
  warningAt75: true,
  warningAt90: true,
  warningAt100: true,
  allowOverage: true,
  overageRateCents: 10, // $0.10 per additional 1000 impressions
});
```

### Get Analytics Dashboard Data

```typescript
import { usageAnalyticsService } from '@/modules/licenses/usage';

const analytics = await usageAnalyticsService.getUsageAnalytics({
  licenseId: 'lic_123',
  startDate: new Date('2024-10-01'),
  endDate: new Date('2024-10-31'),
  granularity: 'daily',
  compareWithPreviousPeriod: true,
});

console.log('Total usage:', analytics.currentPeriod.totalQuantity);
console.log('% change:', analytics.percentageChange?.totalQuantity);
```

### Generate Forecast

```typescript
import { usageForecastingService } from '@/modules/licenses/usage';

const result = await usageForecastingService.generateForecast({
  licenseId: 'lic_123',
  usageType: 'impression',
  periodStart: new Date(),
  periodEnd: addDays(new Date(), 30),
  historicalDays: 30,
  forecastingMethod: 'LINEAR_REGRESSION',
});

if (result.thresholdBreach) {
  console.log('Predicted breach:', result.thresholdBreach.predictedBreachDate);
  console.log('Days until breach:', result.thresholdBreach.daysUntilBreach);
}
```

## Performance Considerations

1. **Event Ingestion** - Non-blocking, queued aggregation
2. **Query Performance** - Uses aggregated tables, not raw events
3. **Caching** - Redis caching for analytics (5-min TTL)
4. **Indexes** - Optimized for common query patterns
5. **Data Retention** - Raw events purged after 90 days

## Monitoring

Key metrics to track:
- Event ingestion rate
- Aggregation job completion time
- Threshold check latency
- Cache hit rates
- Overage detection accuracy

## Security

- **Authorization**: Only brand owners and admins can view usage
- **Creators**: Can see aggregated usage for their assets
- **Row-level security**: Enforced at API layer
- **Audit logging**: All overage approvals logged

## Future Enhancements

- Machine learning forecasting models
- Anomaly detection for unusual usage patterns
- Real-time streaming analytics
- Custom usage types per license
- Multi-dimensional analytics (cohort analysis)
- Automated pricing optimization
