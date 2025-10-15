# License Usage Tracking - Frontend Integration Guide (Part 1: API Endpoints)

**Classification:** ⚡ HYBRID  
- License usage tracking happens on both public website (brand/creator monitoring) and admin backend  
- Brands monitor their license usage in real-time  
- Creators view usage analytics for their assets  
- Admins manage thresholds, overages, and billing  

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [Authentication & Authorization](#authentication--authorization)

---

## Overview

The Usage Tracking module provides comprehensive license usage monitoring with:
- Real-time event tracking (views, downloads, impressions, etc.)
- Analytics dashboards with trends and comparisons
- Threshold monitoring with multi-level warnings
- Overage detection and billing
- Forecasting and predictive analytics
- Usage-based reporting

**Base API:** tRPC router at `usage.*`  
**Backend Service:** `/src/modules/licenses/usage/`

---

## API Endpoints

All endpoints are accessed via tRPC. Import the tRPC client in your frontend:

```typescript
import { trpc } from '@/lib/trpc';
```

### 1. Usage Event Tracking

#### `usage.trackEvent` (Mutation)
Track a single usage event for a license.

**Access:** Protected (Brand owner, Creator, Admin)  
**HTTP Method:** POST (via tRPC mutation)

**Input Schema:**
```typescript
{
  licenseId: string;           // CUID of the license
  usageType: 'view' | 'download' | 'impression' | 'click' | 'play' | 'stream' | 'custom';
  quantity?: number;           // Default: 1
  geographicLocation?: string; // Max 100 chars (e.g., 'US-CA', 'UK-LDN')
  platform?: 'web' | 'mobile' | 'tv' | 'print' | 'social' | 'other';
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'other';
  referrer?: string;           // URL or empty string
  revenueCents?: number;       // Revenue associated with this usage (default: 0)
  metadata?: Record<string, any>; // Additional custom data
  sessionId?: string;          // Track unique sessions
  idempotencyKey?: string;     // Prevent duplicate events
}
```

**Response:**
```typescript
{
  eventId: string | null;      // CUID of created event (null if failed)
  tracked: boolean;            // Whether event was successfully tracked
  error?: string;              // Error message if tracking failed
}
```

---

#### `usage.trackBatch` (Mutation)
Track multiple usage events in a single request (more efficient for high-volume tracking).

**Access:** Protected  
**Max Events:** 1000 per batch

**Input Schema:**
```typescript
{
  events: TrackUsageEventInput[]; // Array of events (1-1000)
  batchId?: string;                // Optional batch identifier
}
```

**Response:**
```typescript
UsageEventResult[] // Array of results for each event
```

---

#### `usage.getCurrentUsage` (Query)
Get current usage count for a license (real-time with 5-min cache).

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  usageType?: string;          // Specific type or undefined for all
  periodType?: 'daily' | 'weekly' | 'monthly' | 'total'; // Default: 'total'
}
```

**Response:**
```typescript
number // Total usage count
```

---

#### `usage.getUsageBreakdown` (Query)
Get usage broken down by type for a date range.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  startDate: Date;
  endDate: Date;
}
```

**Response:**
```typescript
{
  views: number;
  downloads: number;
  impressions: number;
  clicks: number;
  plays: number;
  streams: number;
  total: number;
  revenue: number; // In cents
}
```

---

### 2. Analytics & Reporting

#### `usage.getAnalytics` (Query)
Get comprehensive usage analytics with trends, comparisons, and geographic distribution.

**Access:** Protected  
**Cache:** 5 minutes

**Input Schema:**
```typescript
{
  licenseId: string;
  startDate: Date;
  endDate: Date;
  usageType?: 'view' | 'download' | 'impression' | 'click' | 'play' | 'stream' | 'custom';
  granularity?: 'daily' | 'weekly' | 'monthly'; // Default: 'daily'
  compareWithPreviousPeriod?: boolean;          // Default: false
}
```

**Response:**
```typescript
{
  licenseId: string;
  periodStart: Date;
  periodEnd: Date;
  currentPeriod: {
    totalViews: number;
    totalDownloads: number;
    totalImpressions: number;
    totalClicks: number;
    totalPlays: number;
    totalStreams: number;
    totalQuantity: number;
    totalRevenueCents: number;
    uniqueSessions: number;
  };
  previousPeriod?: UsageMetrics; // If compareWithPreviousPeriod = true
  percentageChange?: {
    totalViews?: number;         // Percentage change (e.g., 25.5 for 25.5%)
    totalDownloads?: number;
    // ... etc for all metrics
  };
  trends: Array<{
    date: Date;
    metrics: UsageMetrics;
  }>;
  topSources?: Array<{
    referrer: string;
    count: number;
    percentage: number;
  }>;
  topPlatforms?: Array<{
    platform: 'web' | 'mobile' | 'tv' | 'print' | 'social' | 'other';
    count: number;
    percentage: number;
  }>;
  geographicDistribution?: Array<{
    location: string;            // Geographic code (e.g., 'US-CA')
    count: number;
    percentage: number;
  }>;
}
```

---

#### `usage.comparePeriods` (Query)
Compare usage metrics between two time periods.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  period1Start: Date;
  period1End: Date;
  period2Start: Date;
  period2End: Date;
  usageType?: UsageType;
}
```

**Response:**
```typescript
{
  period1: UsageMetrics;
  period2: UsageMetrics;
  absoluteChange: {
    totalViews?: number;         // Absolute difference
    totalDownloads?: number;
    // ... etc
  };
  percentageChange: {
    totalViews?: number;         // Percentage change
    totalDownloads?: number;
    // ... etc
  };
}
```

---

### 3. Thresholds & Overages

#### `usage.createThreshold` (Mutation)
Configure a usage threshold for a license.

**Access:** Protected (Brand owner or Admin)

**Input Schema:**
```typescript
{
  licenseId: string;
  usageType: UsageType;
  limitQuantity: number;       // Positive integer
  periodType: 'daily' | 'weekly' | 'monthly' | 'total';
  gracePercentage?: number;    // 0-100, default: 0
  warningAt50?: boolean;       // Default: true
  warningAt75?: boolean;       // Default: true
  warningAt90?: boolean;       // Default: true
  warningAt100?: boolean;      // Default: true
  allowOverage?: boolean;      // Default: false
  overageRateCents?: number;   // Fee per unit overage (optional)
}
```

**Response:**
```typescript
LicenseUsageThreshold // Full threshold object with id, timestamps, etc.
```

---

#### `usage.updateThreshold` (Mutation)
Update an existing threshold.

**Access:** Protected (Brand owner or Admin)

**Input Schema:**
```typescript
{
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
```

**Response:**
```typescript
LicenseUsageThreshold
```

---

#### `usage.getThresholdStatus` (Query)
Get current threshold status with usage vs. limit.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  usageType?: UsageType; // Optional filter
}
```

**Response:**
```typescript
Array<{
  threshold: LicenseUsageThreshold;
  currentUsage: number;
  limit: number;
  limitWithGrace: number;         // limit * (1 + gracePercentage/100)
  percentageUsed: number;         // 0-100+
  remaining: number;              // Can be negative if over limit
  isWarningLevel: boolean;        // True if at any warning threshold
  isOverLimit: boolean;           // True if over limitWithGrace
  projectedExceededDate?: Date;   // From forecast (if available)
}>
```

---

#### `usage.checkThresholds` (Mutation)
Manually trigger threshold check for a license (Admin only, usually automated).

**Access:** Admin only

**Input Schema:**
```typescript
{
  licenseId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

---

#### `usage.getOverages` (Query)
Get overage events for a license or brand.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId?: string;
  brandId?: string;
  status?: 'DETECTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'BILLED' | 'DISPUTED';
  startDate?: Date;
  endDate?: Date;
  limit?: number;  // Default: 50, max: 100
  offset?: number; // Default: 0
}
```

**Response:**
```typescript
Array<LicenseUsageOverage> // Overage records
```

---

#### `usage.approveOverage` (Mutation)
Approve an overage for billing (Admin only).

**Access:** Admin only

**Input Schema:**
```typescript
{
  overageId: string;
  approvedBy: string;          // Auto-filled from session
  billedFeeCents?: number;     // Override calculated fee
  notes?: string;              // Max 1000 chars
}
```

**Response:**
```typescript
LicenseUsageOverage // Updated overage record
```

---

### 4. Forecasting

#### `usage.generateForecast` (Mutation)
Generate a usage forecast using historical data.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  usageType: UsageType;
  periodStart: Date;
  periodEnd: Date;
  forecastingMethod?: 'LINEAR_REGRESSION' | 'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING' | 'SEASONAL_DECOMPOSITION';
  historicalDays?: number;     // Default: 30, max: 365
  confidenceLevel?: number;    // 0.5-0.99, default: 0.95
}
```

**Response:**
```typescript
{
  forecast: {
    id: string;
    licenseId: string;
    usageType: UsageType;
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
  };
  thresholdBreach?: {
    threshold: LicenseUsageThreshold;
    predictedBreachDate: Date;
    daysUntilBreach: number;
    breachProbability: number;
  };
}
```

---

#### `usage.getForecasts` (Query)
Get recent forecasts for a license.

**Access:** Protected

**Input Schema:**
```typescript
{
  licenseId: string;
  usageType?: UsageType;
  limit?: number; // Default: 10, max: 100
}
```

**Response:**
```typescript
Array<LicenseUsageForecast>
```

---

### 5. Admin Functions

#### `usage.recalculateAggregates` (Mutation)
Manually recalculate aggregated metrics for a date range.

**Access:** Admin only

**Input Schema:**
```typescript
{
  licenseId: string;
  startDate: Date;
  endDate: Date;
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

---

#### `usage.getAggregationStatus` (Query)
Check aggregation status for a specific date.

**Access:** Admin only

**Input Schema:**
```typescript
{
  date: Date;
}
```

**Response:**
```typescript
{
  date: Date;
  licensesProcessed: number;
  eventsAggregated: number;
  lastAggregationAt: Date;
}
```

---

## Request/Response Examples

### Example 1: Track a View Event

**Request:**
```typescript
const result = await trpc.usage.trackEvent.mutate({
  licenseId: 'clx123abc',
  usageType: 'view',
  quantity: 1,
  platform: 'web',
  deviceType: 'desktop',
  geographicLocation: 'US-CA',
  sessionId: 'sess_xyz789',
  referrer: 'https://example.com/product-page',
});
```

**Response (Success):**
```json
{
  "eventId": "clx456def",
  "tracked": true
}
```

**Response (Error - Tracking Disabled):**
```json
{
  "eventId": null,
  "tracked": false,
  "error": "Usage tracking not enabled for this license"
}
```

---

### Example 2: Get Analytics with Period Comparison

**Request:**
```typescript
const analytics = await trpc.usage.getAnalytics.query({
  licenseId: 'clx123abc',
  startDate: new Date('2024-10-01'),
  endDate: new Date('2024-10-31'),
  granularity: 'daily',
  compareWithPreviousPeriod: true,
});
```

**Response:**
```json
{
  "licenseId": "clx123abc",
  "periodStart": "2024-10-01T00:00:00.000Z",
  "periodEnd": "2024-10-31T23:59:59.999Z",
  "currentPeriod": {
    "totalViews": 15000,
    "totalDownloads": 250,
    "totalImpressions": 50000,
    "totalClicks": 1200,
    "totalPlays": 800,
    "totalStreams": 0,
    "totalQuantity": 67250,
    "totalRevenueCents": 125000,
    "uniqueSessions": 12000
  },
  "previousPeriod": {
    "totalViews": 12000,
    "totalDownloads": 200,
    "totalImpressions": 45000,
    "totalClicks": 1000,
    "totalPlays": 600,
    "totalStreams": 0,
    "totalQuantity": 58800,
    "totalRevenueCents": 100000,
    "uniqueSessions": 10000
  },
  "percentageChange": {
    "totalViews": 25.0,
    "totalDownloads": 25.0,
    "totalImpressions": 11.11,
    "totalClicks": 20.0,
    "totalPlays": 33.33,
    "totalQuantity": 14.37,
    "totalRevenueCents": 25.0,
    "uniqueSessions": 20.0
  },
  "trends": [
    {
      "date": "2024-10-01T00:00:00.000Z",
      "metrics": { "totalViews": 500, "totalDownloads": 8, /* ... */ }
    },
    // ... 30 more entries
  ],
  "topSources": [
    { "referrer": "https://google.com", "count": 8000, "percentage": 66.67 },
    { "referrer": "https://instagram.com", "count": 2400, "percentage": 20.0 },
    { "referrer": "direct", "count": 1600, "percentage": 13.33 }
  ],
  "topPlatforms": [
    { "platform": "web", "count": 9000, "percentage": 75.0 },
    { "platform": "mobile", "count": 2400, "percentage": 20.0 },
    { "platform": "social", "count": 600, "percentage": 5.0 }
  ],
  "geographicDistribution": [
    { "location": "US-CA", "count": 5000, "percentage": 41.67 },
    { "location": "US-NY", "count": 3000, "percentage": 25.0 },
    { "location": "UK-LDN", "count": 2000, "percentage": 16.67 }
  ]
}
```

---

### Example 3: Create a Usage Threshold

**Request:**
```typescript
const threshold = await trpc.usage.createThreshold.mutate({
  licenseId: 'clx123abc',
  usageType: 'view',
  limitQuantity: 10000,
  periodType: 'monthly',
  gracePercentage: 10,
  warningAt50: true,
  warningAt75: true,
  warningAt90: true,
  warningAt100: true,
  allowOverage: true,
  overageRateCents: 50, // $0.50 per overage unit
});
```

**Response:**
```json
{
  "id": "clx789ghi",
  "licenseId": "clx123abc",
  "usageType": "view",
  "limitQuantity": 10000,
  "periodType": "monthly",
  "gracePercentage": 10,
  "warningAt50": true,
  "warningAt75": true,
  "warningAt90": true,
  "warningAt100": true,
  "allowOverage": true,
  "overageRateCents": 50,
  "isActive": true,
  "lastWarningAt": null,
  "createdAt": "2024-10-14T12:00:00.000Z",
  "updatedAt": "2024-10-14T12:00:00.000Z"
}
```

---

### Example 4: Get Threshold Status

**Request:**
```typescript
const status = await trpc.usage.getThresholdStatus.query({
  licenseId: 'clx123abc',
  usageType: 'view',
});
```

**Response:**
```json
[
  {
    "threshold": {
      "id": "clx789ghi",
      "licenseId": "clx123abc",
      "usageType": "view",
      "limitQuantity": 10000,
      "gracePercentage": 10,
      "isActive": true
    },
    "currentUsage": 9200,
    "limit": 10000,
    "limitWithGrace": 11000,
    "percentageUsed": 92.0,
    "remaining": 800,
    "isWarningLevel": true,
    "isOverLimit": false,
    "projectedExceededDate": "2024-10-25T00:00:00.000Z"
  }
]
```

---

### Example 5: Generate Forecast

**Request:**
```typescript
const forecast = await trpc.usage.generateForecast.mutate({
  licenseId: 'clx123abc',
  usageType: 'view',
  periodStart: new Date('2024-11-01'),
  periodEnd: new Date('2024-11-30'),
  forecastingMethod: 'LINEAR_REGRESSION',
  historicalDays: 30,
  confidenceLevel: 0.95,
});
```

**Response:**
```json
{
  "forecast": {
    "id": "clx999jkl",
    "licenseId": "clx123abc",
    "usageType": "view",
    "forecastDate": "2024-10-14T12:00:00.000Z",
    "periodStart": "2024-11-01T00:00:00.000Z",
    "periodEnd": "2024-11-30T23:59:59.999Z",
    "predictedQuantity": 16500,
    "lowerBound": 13200,
    "upperBound": 19800,
    "confidenceLevel": 0.95,
    "predictedBreachDate": "2024-11-22T00:00:00.000Z",
    "breachProbability": 0.8,
    "forecastingMethod": "LINEAR_REGRESSION",
    "historicalDaysUsed": 30
  },
  "thresholdBreach": {
    "threshold": { "id": "clx789ghi", "limitQuantity": 10000 },
    "predictedBreachDate": "2024-11-22T00:00:00.000Z",
    "daysUntilBreach": 22,
    "breachProbability": 0.8
  }
}
```

---

## Authentication & Authorization

### Authentication
All endpoints require a valid JWT token in the Authorization header or session cookie.

```typescript
// tRPC client handles this automatically if configured correctly
// Ensure your tRPC client includes credentials
```

### Authorization Matrix

| Endpoint | Admin | Brand Owner | Creator | Viewer |
|----------|-------|-------------|---------|--------|
| `trackEvent` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `trackBatch` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `getCurrentUsage` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `getUsageBreakdown` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `getAnalytics` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `comparePeriods` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `createThreshold` | ✅ | ✅ (own licenses) | ❌ | ❌ |
| `updateThreshold` | ✅ | ✅ (own licenses) | ❌ | ❌ |
| `getThresholdStatus` | ✅ | ✅ (own licenses) | ✅ (view only) | ❌ |
| `checkThresholds` | ✅ | ❌ | ❌ | ❌ |
| `getOverages` | ✅ | ✅ (own licenses) | ✅ (view only) | ❌ |
| `approveOverage` | ✅ | ❌ | ❌ | ❌ |
| `generateForecast` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `getForecasts` | ✅ | ✅ (own licenses) | ✅ (own assets) | ❌ |
| `recalculateAggregates` | ✅ | ❌ | ❌ | ❌ |
| `getAggregationStatus` | ✅ | ❌ | ❌ | ❌ |

**Notes:**
- "Own licenses" = licenses where user's brand is the licensee
- "Own assets" = licenses using assets created by the user's creator profile
- Authorization is enforced at the service layer
- Unauthorized access returns HTTP 403 Forbidden

---

**Continue to [Part 2: TypeScript Types & Business Logic](./USAGE_TRACKING_INTEGRATION_GUIDE_PART_2_TYPES_AND_LOGIC.md)**
