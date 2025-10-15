# License Usage Tracking - Frontend Integration Guide (Part 2: TypeScript Types & Business Logic)

**Classification:** ⚡ HYBRID  

---

## Table of Contents

1. [TypeScript Type Definitions](#typescript-type-definitions)
2. [Zod Validation Schemas](#zod-validation-schemas)
3. [Business Logic & Validation Rules](#business-logic--validation-rules)
4. [Error Handling](#error-handling)
5. [Rate Limiting & Performance](#rate-limiting--performance)

---

## TypeScript Type Definitions

Copy these type definitions to your frontend project. You can place them in `@/types/usage-tracking.ts` or similar.

### Enums & Base Types

```typescript
/**
 * Usage event types
 */
export type UsageType = 
  | 'view'        // Asset viewed
  | 'download'    // Asset downloaded
  | 'impression'  // Ad/content impression
  | 'click'       // Click-through
  | 'play'        // Audio/video play started
  | 'stream'      // Streaming session
  | 'custom';     // Custom usage type

/**
 * Platform where usage occurred
 */
export type Platform = 
  | 'web' 
  | 'mobile' 
  | 'tv' 
  | 'print' 
  | 'social' 
  | 'other';

/**
 * Device type
 */
export type DeviceType = 
  | 'desktop' 
  | 'mobile' 
  | 'tablet' 
  | 'tv' 
  | 'other';

/**
 * Threshold period types
 */
export type PeriodType = 
  | 'daily'     // Reset each day
  | 'weekly'    // Reset each week
  | 'monthly'   // Reset each month
  | 'total';    // Lifetime total (no reset)

/**
 * Overage status lifecycle
 */
export type OverageStatus = 
  | 'DETECTED'          // System detected overage
  | 'PENDING_APPROVAL'  // Awaiting admin approval
  | 'APPROVED'          // Approved for billing
  | 'BILLED'            // Invoice sent
  | 'DISPUTED';         // Brand disputes the overage

/**
 * Forecasting methods
 */
export type ForecastingMethod = 
  | 'LINEAR_REGRESSION' 
  | 'MOVING_AVERAGE' 
  | 'EXPONENTIAL_SMOOTHING'
  | 'SEASONAL_DECOMPOSITION';
```

---

### Input Types

```typescript
/**
 * Track a single usage event
 */
export interface TrackUsageEventInput {
  licenseId: string;              // Required
  usageType: UsageType;           // Required
  quantity?: number;              // Default: 1, must be positive
  geographicLocation?: string;    // Max 100 chars (e.g., 'US-CA')
  platform?: Platform;
  deviceType?: DeviceType;
  referrer?: string;              // URL or empty string
  revenueCents?: number;          // Non-negative integer
  metadata?: Record<string, any>; // Custom data
  sessionId?: string;             // For unique session tracking
  idempotencyKey?: string;        // Prevent duplicate events
}

/**
 * Track multiple events in batch
 */
export interface BatchTrackUsageInput {
  events: TrackUsageEventInput[]; // 1-1000 events
  batchId?: string;
}

/**
 * Get usage analytics with comparisons
 */
export interface GetUsageAnalyticsInput {
  licenseId: string;
  startDate: Date;
  endDate: Date;                      // Must be >= startDate
  usageType?: UsageType;
  granularity?: 'daily' | 'weekly' | 'monthly';
  compareWithPreviousPeriod?: boolean;
}

/**
 * Compare two time periods
 */
export interface ComparePeriodsInput {
  licenseId: string;
  period1Start: Date;
  period1End: Date;                   // Must be >= period1Start
  period2Start: Date;
  period2End: Date;                   // Must be >= period2Start
  usageType?: UsageType;
}

/**
 * Create a usage threshold
 */
export interface CreateThresholdInput {
  licenseId: string;
  usageType: UsageType;
  limitQuantity: number;              // Positive integer
  periodType: PeriodType;
  gracePercentage?: number;           // 0-100, default: 0
  warningAt50?: boolean;              // Default: true
  warningAt75?: boolean;              // Default: true
  warningAt90?: boolean;              // Default: true
  warningAt100?: boolean;             // Default: true
  allowOverage?: boolean;             // Default: false
  overageRateCents?: number;          // Fee per unit overage (optional)
}

/**
 * Update an existing threshold
 */
export interface UpdateThresholdInput {
  thresholdId: string;
  limitQuantity?: number;
  gracePercentage?: number;
  warningAt50?: boolean;
  warningAt75?: boolean;
  warningAt90?: boolean;
  warningAt100?: boolean;
  allowOverage?: boolean;
  overageRateCents?: number;
  isActive?: boolean;
}

/**
 * Approve an overage (Admin only)
 */
export interface ApproveOverageInput {
  overageId: string;
  approvedBy: string;                 // Auto-filled from session
  billedFeeCents?: number;            // Override calculated fee
  notes?: string;                     // Max 1000 chars
}

/**
 * Generate usage forecast
 */
export interface GenerateForecastInput {
  licenseId: string;
  usageType: UsageType;
  periodStart: Date;
  periodEnd: Date;                    // Must be > periodStart
  forecastingMethod?: ForecastingMethod;
  historicalDays?: number;            // 1-365, default: 30
  confidenceLevel?: number;           // 0.5-0.99, default: 0.95
}
```

---

### Response Types

```typescript
/**
 * Result of tracking a usage event
 */
export interface UsageEventResult {
  eventId: string | null;    // CUID if successful, null if failed
  tracked: boolean;
  error?: string;            // Error message if tracked = false
}

/**
 * Aggregated usage metrics
 */
export interface UsageMetrics {
  totalViews: number;
  totalDownloads: number;
  totalImpressions: number;
  totalClicks: number;
  totalPlays: number;
  totalStreams: number;
  totalQuantity: number;      // Sum of all types
  totalRevenueCents: number;  // Total revenue tracked
  uniqueSessions: number;     // Unique session IDs
}

/**
 * Usage trend data point
 */
export interface UsageTrend {
  date: Date;
  metrics: UsageMetrics;
}

/**
 * Top referrer source
 */
export interface UsageSource {
  referrer: string;
  count: number;
  percentage: number;
}

/**
 * Platform usage breakdown
 */
export interface PlatformUsage {
  platform: Platform;
  count: number;
  percentage: number;
}

/**
 * Geographic distribution
 */
export interface GeographicUsage {
  location: string;          // Geographic code
  count: number;
  percentage: number;
}

/**
 * Comprehensive usage analytics
 */
export interface UsageAnalytics {
  licenseId: string;
  periodStart: Date;
  periodEnd: Date;
  currentPeriod: UsageMetrics;
  previousPeriod?: UsageMetrics;
  percentageChange?: Partial<Record<keyof UsageMetrics, number>>;
  trends: UsageTrend[];
  topSources?: UsageSource[];
  topPlatforms?: PlatformUsage[];
  geographicDistribution?: GeographicUsage[];
}

/**
 * Period comparison result
 */
export interface PeriodComparison {
  period1: UsageMetrics;
  period2: UsageMetrics;
  absoluteChange: Partial<UsageMetrics>;
  percentageChange: Partial<Record<keyof UsageMetrics, number>>;
}

/**
 * Threshold status
 */
export interface ThresholdStatus {
  threshold: LicenseUsageThreshold;
  currentUsage: number;
  limit: number;
  limitWithGrace: number;         // limit * (1 + gracePercentage/100)
  percentageUsed: number;         // 0-100+
  remaining: number;              // Can be negative
  isWarningLevel: boolean;
  isOverLimit: boolean;
  projectedExceededDate?: Date;   // From forecast
}

/**
 * Forecast result
 */
export interface ForecastResult {
  forecast: LicenseUsageForecast;
  thresholdBreach?: {
    threshold: LicenseUsageThreshold;
    predictedBreachDate: Date;
    daysUntilBreach: number;
    breachProbability: number;     // 0.0-1.0
  };
}

/**
 * Usage dashboard data (aggregated)
 */
export interface UsageDashboardData {
  license: {
    id: string;
    brandName: string;
    assetTitle: string;
    licenseType: string;
    startDate: Date;
    endDate: Date;
  };
  currentPeriodUsage: UsageMetrics;
  thresholds: ThresholdStatus[];
  recentOverages: LicenseUsageOverage[];
  forecasts: ForecastResult[];
  trends: UsageTrend[];
  topSources: UsageSource[];
  alerts: UsageAlert[];
}

/**
 * Usage alert
 */
export interface UsageAlert {
  type: 'warning' | 'overage' | 'forecast';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  actionRequired: boolean;
  actionUrl?: string;
  createdAt: Date;
}
```

---

### Prisma Model Types

These types are generated from your Prisma schema. Import from `@prisma/client`:

```typescript
import type {
  LicenseUsageEvent,
  LicenseUsageDailyAggregate,
  LicenseUsageThreshold,
  LicenseUsageOverage,
  LicenseUsageForecast,
} from '@prisma/client';
```

**LicenseUsageEvent:**
```typescript
{
  id: string;
  licenseId: string;
  occurredAt: Date;
  usageType: string;
  quantity: number;
  geographicLocation?: string;
  platform?: string;
  deviceType?: string;
  referrer?: string;
  revenueCents: number;
  metadata: Record<string, any>;
  sessionId?: string;
  idempotencyKey?: string;
  createdAt: Date;
}
```

**LicenseUsageThreshold:**
```typescript
{
  id: string;
  licenseId: string;
  usageType: string;
  limitQuantity: number;
  periodType: string;
  gracePercentage: number;
  warningAt50: boolean;
  warningAt75: boolean;
  warningAt90: boolean;
  warningAt100: boolean;
  allowOverage: boolean;
  overageRateCents?: number;
  isActive: boolean;
  lastWarningAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**LicenseUsageOverage:**
```typescript
{
  id: string;
  licenseId: string;
  thresholdId: string;
  detectedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  usageType: string;
  limitQuantity: number;
  actualQuantity: number;
  overageQuantity: number;
  calculatedFeeCents: number;
  status: OverageStatus;
  approvedBy?: string;
  approvedAt?: Date;
  billedFeeCents?: number;
  billedAt?: Date;
  notes?: string;
  metadata: Record<string, any>;
}
```

**LicenseUsageForecast:**
```typescript
{
  id: string;
  licenseId: string;
  usageType: string;
  forecastDate: Date;
  periodStart: Date;
  periodEnd: Date;
  predictedQuantity: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
  predictedBreachDate?: Date;
  breachProbability?: number;
  forecastingMethod: string;
  historicalDaysUsed: number;
  accuracy?: number;
  createdAt: Date;
}
```

---

## Zod Validation Schemas

If you need client-side validation before sending requests, use these Zod schemas (already defined on backend, can be shared):

```typescript
import { z } from 'zod';

export const usageTypeSchema = z.enum([
  'view',
  'download',
  'impression',
  'click',
  'play',
  'stream',
  'custom',
]);

export const platformSchema = z.enum([
  'web',
  'mobile',
  'tv',
  'print',
  'social',
  'other',
]);

export const deviceTypeSchema = z.enum([
  'desktop',
  'mobile',
  'tablet',
  'tv',
  'other',
]);

export const trackUsageEventSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema,
  quantity: z.number().int().positive().default(1),
  geographicLocation: z.string().max(100).optional(),
  platform: platformSchema.optional(),
  deviceType: deviceTypeSchema.optional(),
  referrer: z.string().url().optional().or(z.literal('')),
  revenueCents: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.any()).optional(),
  sessionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const getUsageAnalyticsSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  usageType: usageTypeSchema.optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  compareWithPreviousPeriod: z.boolean().default(false),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

export const createThresholdSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema,
  limitQuantity: z.number().int().positive(),
  periodType: z.enum(['daily', 'weekly', 'monthly', 'total']),
  gracePercentage: z.number().int().min(0).max(100).default(0),
  warningAt50: z.boolean().default(true),
  warningAt75: z.boolean().default(true),
  warningAt90: z.boolean().default(true),
  warningAt100: z.boolean().default(true),
  allowOverage: z.boolean().default(false),
  overageRateCents: z.number().int().nonnegative().optional(),
});
```

---

## Business Logic & Validation Rules

### Field Validation Requirements

#### 1. **licenseId**
- **Format:** CUID (Collision-resistant Unique Identifier)
- **Validation:** Must exist in database
- **Example:** `clx123abc456def789`
- **Error if invalid:** "License not found"

#### 2. **usageType**
- **Allowed values:** `view`, `download`, `impression`, `click`, `play`, `stream`, `custom`
- **Case sensitive:** Must be lowercase
- **Required:** Yes (for tracking and thresholds)

#### 3. **quantity**
- **Type:** Positive integer
- **Default:** 1
- **Minimum:** 1
- **Maximum:** No hard limit, but be reasonable (don't track millions in one event)
- **Use case:** Batch impressions (e.g., 100 impressions in one ad placement)

#### 4. **geographicLocation**
- **Format:** ISO country code + region (e.g., `US-CA`, `UK-LDN`, `DE-BE`)
- **Max length:** 100 characters
- **Optional:** Yes
- **Use case:** Track regional usage for compliance

#### 5. **platform**
- **Allowed values:** `web`, `mobile`, `tv`, `print`, `social`, `other`
- **Optional:** Yes
- **Use case:** Multi-platform license tracking

#### 6. **deviceType**
- **Allowed values:** `desktop`, `mobile`, `tablet`, `tv`, `other`
- **Optional:** Yes
- **Use case:** Device-specific analytics

#### 7. **referrer**
- **Format:** Valid URL or empty string
- **Optional:** Yes
- **Max length:** ~2000 characters (URL standard)
- **Use case:** Track traffic sources

#### 8. **revenueCents**
- **Type:** Non-negative integer (cents)
- **Default:** 0
- **Example:** `125000` = $1,250.00
- **Use case:** Usage-based revenue attribution

#### 9. **sessionId**
- **Format:** Any string
- **Optional:** Yes
- **Use case:** Count unique sessions (uniqueSessions metric)
- **Recommendation:** Generate UUID or similar on client

#### 10. **idempotencyKey**
- **Format:** Any unique string
- **Optional:** Yes
- **Use case:** Prevent duplicate event tracking on retry
- **Recommendation:** Use `${licenseId}-${timestamp}-${randomId}`
- **Cache duration:** 24 hours

---

### Business Rules to Enforce in Frontend

#### Usage Tracking Rules

1. **License Must Be Active**
   - Only track usage for licenses with:
     - `status = 'ACTIVE'`
     - `startDate <= now <= endDate`
     - `usageTrackingEnabled = true`
   - Frontend should check license status before tracking
   - If inactive, display: "Usage tracking is not enabled for this license"

2. **Duplicate Prevention**
   - Use `idempotencyKey` for events that might be retried (e.g., on network failure)
   - Generate key format: `${licenseId}-${eventType}-${timestamp}-${uuid}`
   - Backend will cache for 24 hours and return existing eventId if duplicate

3. **Batch Tracking Limits**
   - Maximum 1000 events per batch
   - If you have more, split into multiple batches
   - Each event in batch is validated independently
   - Response array matches input event order

4. **Non-Blocking**
   - Usage tracking is designed to be non-blocking
   - If tracking fails, **do not block the user action** (view, download, etc.)
   - Log the error and continue
   - Consider background retry queue for failed events

---

#### Threshold Configuration Rules

1. **Limit Quantity**
   - Must be a positive integer
   - Should be reasonable for the usage type:
     - Views: 1,000 - 1,000,000
     - Downloads: 10 - 10,000
     - Impressions: 10,000 - 10,000,000

2. **Grace Percentage**
   - 0-100%
   - Typical values: 0%, 5%, 10%
   - Purpose: Soft limit before hard overage
   - Example: 10,000 limit + 10% grace = 11,000 hard limit

3. **Warning Levels**
   - At least one warning level should be enabled
   - Recommended: Enable all (50%, 75%, 90%, 100%)
   - Backend sends notifications when each level is reached
   - Only sends once per period (cached to prevent spam)

4. **Period Types**
   - **daily:** Resets every day at 00:00 UTC
   - **weekly:** Resets every Monday 00:00 UTC
   - **monthly:** Resets on 1st of month 00:00 UTC
   - **total:** Never resets (lifetime total)
   - Frontend should clearly display the period type to users

5. **Overage Settings**
   - If `allowOverage = false`:
     - Usage should be hard-blocked at limitWithGrace
     - Display: "Usage limit reached. Contact support."
   - If `allowOverage = true`:
     - Usage continues beyond limit
     - Overage is detected and billed per `overageRateCents`
     - Display: "Usage limit exceeded. Overage fees apply."

---

#### Overage Workflow

1. **Detection (Automated)**
   - Background job runs hourly
   - Compares current usage to `limitWithGrace`
   - Creates `LicenseUsageOverage` with `status = 'DETECTED'`

2. **Pending Approval**
   - Auto-transitions to `PENDING_APPROVAL`
   - Admin receives notification
   - Brand receives alert

3. **Approval (Admin Action)**
   - Admin reviews overage
   - Can adjust `billedFeeCents` if needed
   - Approves → `status = 'APPROVED'`
   - Creates invoice/charge via billing integration

4. **Billed**
   - After payment processed
   - `status = 'BILLED'`
   - `billedAt` timestamp set

5. **Disputed**
   - Brand can dispute within 30 days
   - `status = 'DISPUTED'`
   - Admin reviews and resolves

**Frontend Considerations:**
- Show overage status badge on license detail page
- Display overage amount in dollars: `billedFeeCents / 100`
- Allow brands to view overage details but not approve (admin only)
- Provide "Dispute Overage" button if status is APPROVED or BILLED

---

#### Forecasting Rules

1. **Historical Data Requirement**
   - Minimum 7 days of historical data recommended
   - More data = better accuracy
   - `historicalDays` parameter (1-365)

2. **Confidence Level**
   - 0.5 - 0.99 (50% - 99%)
   - Higher = wider confidence bounds
   - Recommended: 0.95 (95%)

3. **Forecast Bounds**
   - `lowerBound` = predictedQuantity * 0.8
   - `upperBound` = predictedQuantity * 1.2
   - Display as range: "Expected: 15,000 - 18,000 views"

4. **Threshold Breach Prediction**
   - Only included if forecast > threshold limit
   - `breachProbability` is simplified (0.8 fixed in current implementation)
   - `daysUntilBreach` calculated from trend slope
   - Display: "⚠️ Usage limit expected to be reached on Nov 22 (in 22 days)"

---

### Calculations & Derived Values

#### 1. **Percentage Used**
```typescript
const percentageUsed = (currentUsage / limitQuantity) * 100;
```

#### 2. **Remaining Capacity**
```typescript
const remaining = limitQuantity - currentUsage;
// Can be negative if over limit
```

#### 3. **Limit With Grace**
```typescript
const limitWithGrace = Math.floor(
  limitQuantity * (1 + gracePercentage / 100)
);
```

#### 4. **Is Over Limit**
```typescript
const isOverLimit = currentUsage > limitWithGrace;
```

#### 5. **Overage Quantity**
```typescript
const overageQuantity = Math.max(0, currentUsage - limitWithGrace);
```

#### 6. **Overage Fee**
```typescript
const overageFeeCents = overageQuantity * overageRateCents;
const overageFee = overageFeeCents / 100; // In dollars
```

#### 7. **Percentage Change (Period Comparison)**
```typescript
const percentageChange = (
  ((currentValue - previousValue) / previousValue) * 100
).toFixed(2);
// Example: 25.00 = 25% increase
// Negative values = decrease
```

---

## Error Handling

### Error Codes & Messages

The backend returns structured errors via tRPC. Here are the common error scenarios:

#### 1. **Usage Tracking Errors**

| Error Code | HTTP Status | Message | User-Friendly Message |
|------------|-------------|---------|----------------------|
| `TRACKING_DISABLED` | 400 | "Usage tracking not enabled for this license" | "Usage tracking is not available for this license." |
| `LICENSE_EXPIRED` | 400 | "Usage outside of license period" | "This license has expired. Usage cannot be tracked." |
| `LICENSE_NOT_FOUND` | 404 | "License not found" | "License not found. Please check the license ID." |
| `DUPLICATE_EVENT` | 200 | (Returns existing eventId) | (Silent - event already tracked) |
| `VALIDATION_ERROR` | 400 | Various field validation messages | Display specific field error |

**Example Error Handling:**
```typescript
try {
  const result = await trpc.usage.trackEvent.mutate({ ... });
  if (!result.tracked) {
    // Non-blocking error - log and continue
    console.warn('Usage tracking failed:', result.error);
    // Optionally show toast: "Usage may not have been recorded"
  }
} catch (error) {
  // Critical error - network failure, auth issue, etc.
  console.error('Failed to track usage:', error);
  // Do NOT block user action
}
```

---

#### 2. **Threshold Errors**

| Error Code | HTTP Status | Message | User-Friendly Message |
|------------|-------------|---------|----------------------|
| `UNAUTHORIZED` | 403 | "Not authorized to manage thresholds" | "You don't have permission to modify usage thresholds." |
| `THRESHOLD_EXISTS` | 400 | "Threshold already exists for this usage type" | "A threshold for this usage type already exists. Update it instead." |
| `INVALID_LIMIT` | 400 | "Limit quantity must be positive" | "Usage limit must be greater than 0." |
| `INVALID_GRACE` | 400 | "Grace percentage must be 0-100" | "Grace percentage must be between 0% and 100%." |

---

#### 3. **Overage Errors**

| Error Code | HTTP Status | Message | User-Friendly Message |
|------------|-------------|---------|----------------------|
| `OVERAGE_NOT_FOUND` | 404 | "Overage not found" | "Overage record not found." |
| `ALREADY_APPROVED` | 400 | "Overage already approved" | "This overage has already been approved." |
| `ALREADY_BILLED` | 400 | "Overage already billed" | "This overage has already been billed." |
| `UNAUTHORIZED` | 403 | "Only admins can approve overages" | "Only administrators can approve overages." |

---

#### 4. **Forecast Errors**

| Error Code | HTTP Status | Message | User-Friendly Message |
|------------|-------------|---------|----------------------|
| `INSUFFICIENT_DATA` | 400 | "Not enough historical data for forecast" | "Not enough usage history to generate a forecast. Need at least 7 days of data." |
| `INVALID_PERIOD` | 400 | "Period end must be after period start" | "End date must be after start date." |
| `FORECAST_ERROR` | 500 | "Forecast generation failed" | "Unable to generate forecast. Please try again later." |

---

### Error Display Patterns

#### Pattern 1: Non-Blocking Errors (Usage Tracking)
```typescript
// DO NOT show error modal or block UI
// Log to console and optionally show a subtle toast
toast.info('Usage may not have been recorded', { 
  duration: 3000,
  position: 'bottom-right' 
});
```

#### Pattern 2: Validation Errors (Forms)
```typescript
// Show inline field errors
<input 
  name="limitQuantity"
  aria-invalid={!!errors.limitQuantity}
  aria-describedby="limitQuantity-error"
/>
{errors.limitQuantity && (
  <p id="limitQuantity-error" className="text-red-600 text-sm mt-1">
    {errors.limitQuantity.message}
  </p>
)}
```

#### Pattern 3: Authorization Errors
```typescript
// Show error message and redirect or hide UI
if (error?.code === 'UNAUTHORIZED') {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <p className="text-red-800">
        You don't have permission to access this feature.
      </p>
    </div>
  );
}
```

#### Pattern 4: Network/Server Errors
```typescript
// Show retry option
if (error?.code === 'INTERNAL_SERVER_ERROR') {
  return (
    <div className="p-4 text-center">
      <p className="text-gray-600 mb-2">
        Something went wrong. Please try again.
      </p>
      <button onClick={refetch} className="btn-primary">
        Retry
      </button>
    </div>
  );
}
```

---

## Rate Limiting & Performance

### Rate Limits

Currently, there are **no explicit rate limits** on usage tracking endpoints because:
1. Usage tracking is batched and non-blocking on the backend
2. Write operations are queued via Redis/BullMQ
3. Aggregation happens asynchronously

**However, best practices:**

1. **Track events responsibly**
   - Don't track the same event multiple times
   - Use idempotency keys for retries
   - Batch events when possible (use `trackBatch` for > 10 events)

2. **Analytics queries**
   - Results are cached for 5 minutes
   - Avoid hammering the analytics endpoints with the same query
   - Use React Query's `staleTime` and `cacheTime`:
     ```typescript
     const { data } = trpc.usage.getAnalytics.useQuery(input, {
       staleTime: 5 * 60 * 1000,  // 5 minutes
       cacheTime: 10 * 60 * 1000, // 10 minutes
     });
     ```

3. **Threshold checks**
   - Status is cached for 5 minutes
   - Don't poll more frequently than every minute
   - Use server-sent events or webhooks for real-time updates (future enhancement)

---

### Performance Considerations

#### 1. **Pagination**
For endpoints that return lists (overages, forecasts):
```typescript
const { data } = trpc.usage.getOverages.useQuery({
  licenseId,
  limit: 50,
  offset: 0,
});
```
- Use infinite scroll or traditional pagination
- Don't fetch all records at once

#### 2. **Lazy Loading**
Don't fetch usage analytics on every page load:
```typescript
const { data, refetch } = trpc.usage.getAnalytics.useQuery(input, {
  enabled: false, // Don't auto-fetch
});

// Fetch on user action
<button onClick={() => refetch()}>Load Analytics</button>
```

#### 3. **Background Sync**
For usage tracking on public website, consider background sync:
```typescript
// Use browser's Background Sync API (if available)
if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
  // Register sync event
  navigator.serviceWorker.ready.then(registration => {
    registration.sync.register('sync-usage-events');
  });
}
```

#### 4. **Debouncing**
If tracking user interactions (e.g., video play time), debounce:
```typescript
import { debounce } from 'lodash';

const trackUsage = debounce(async (licenseId, quantity) => {
  await trpc.usage.trackEvent.mutate({
    licenseId,
    usageType: 'play',
    quantity,
  });
}, 5000); // Send every 5 seconds max
```

---

**Continue to [Part 3: Frontend Implementation Guide](./USAGE_TRACKING_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)**
