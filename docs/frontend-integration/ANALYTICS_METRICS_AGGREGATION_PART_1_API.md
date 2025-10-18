# Analytics & Metrics Aggregation - Frontend Integration Guide (Part 1: API Reference)

## Classification: 🔒 ADMIN ONLY / ⚡ HYBRID

**Last Updated:** October 17, 2025  
**API Version:** 1.0  
**Module:** Analytics Data Collection & Metrics Aggregation

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [API Endpoints](#api-endpoints)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)

---

## Overview

The Analytics & Metrics Aggregation system provides comprehensive event tracking, metrics calculation, and dashboard data for YesGoddess platform. The system consists of:

- **Real-time Event Tracking** - Track user interactions and platform events
- **Daily Metrics Aggregation** - Aggregated metrics by day
- **Weekly/Monthly Rollups** - Time-based metric summaries
- **Custom Metrics** - User-defined metric calculations
- **Real-time Metrics** - Live counters, gauges, and rates
- **Dashboard Services** - Pre-computed dashboard data for creators, brands, and admins

### Architecture

```
Frontend → tRPC API → Event Ingestion → Queue → Enrichment → Database
                    ↓
         Analytics Services → Metrics Aggregation → Cache → Dashboard
```

### Base URLs

- **Production:** `https://ops.yesgoddess.agency/api/trpc`
- **Development:** `http://localhost:3000/api/trpc`

---

## Authentication & Authorization

### Authentication Method

All endpoints use **JWT-based authentication** via `next-auth` session cookies.

### User Roles

| Role | Access Level |
|------|-------------|
| `ADMIN` | Full access to all analytics endpoints and platform-wide metrics |
| `CREATOR` | Access to own asset metrics and creator dashboard |
| `BRAND` | Access to own campaign metrics and licensed asset analytics |
| `VIEWER` | Read-only access to public metrics (limited) |

### Authorization Rules

#### Event Tracking
- **Public Endpoints:** `track`, `trackBatch` - No authentication required (for anonymous tracking)
- **Protected Endpoints:** All other endpoints require authentication

#### Dashboard Access
- **Creator Dashboard:** Creators can only view their own metrics
- **Brand Dashboard:** Brands can only view their own campaign metrics  
- **Platform Metrics:** ADMIN role only

#### Security Headers

```typescript
headers: {
  'Content-Type': 'application/json',
  'Cookie': 'next-auth.session-token=<token>' // Handled automatically by browser
}
```

---

## API Endpoints

### Event Ingestion Endpoints

All event ingestion endpoints are under the `analytics.eventIngestion` namespace.

#### 1. Track Single Event

**Classification:** 🌐 SHARED (Public endpoint for anonymous tracking)

Track a single analytics event.

**Endpoint:** `analytics.eventIngestion.track`  
**Method:** `mutation`  
**Auth Required:** No (optional)

**Request Schema:**

```typescript
{
  eventType: string;                     // Event type identifier (max 100 chars)
  source: 'web' | 'api' | 'mobile' | 'system' | 'webhook'; // Event source
  entityId?: string;                     // CUID of related entity
  entityType?: 'PROJECT' | 'ASSET' | 'LICENSE' | 'CREATOR' | 'BRAND' | 'USER' | 'ROYALTY' | 'PAYOUT' | 'POST' | 'CATEGORY';
  sessionId?: string;                    // UUID for session tracking
  props?: Record<string, any>;           // Additional event properties
  attribution?: {                        // Marketing attribution data
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    referrer?: string;
    landingPage?: string;
  };
  idempotencyKey?: string;               // UUID for deduplication
}
```

**Response Schema:**

```typescript
{
  eventId: string | null;  // Event ID if tracked, null if deduplicated
  tracked: boolean;         // Whether event was successfully tracked
}
```

**Validation Rules:**
- `eventType` is required, max 100 characters
- If `entityId` is provided, `entityType` must also be provided
- `sessionId` must be a valid UUID
- `idempotencyKey` must be a valid UUID if provided

---

#### 2. Track Batch Events

**Classification:** 🌐 SHARED (Public endpoint)

Track multiple events in a single request.

**Endpoint:** `analytics.eventIngestion.trackBatch`  
**Method:** `mutation`  
**Auth Required:** No (optional)

**Request Schema:**

```typescript
{
  events: Array<TrackEventInput>; // 1-50 events per batch
}
```

**Response Schema:**

```typescript
{
  total: number;           // Total events in batch
  successful: number;      // Number of successfully tracked events
  failed: number;          // Number of failed events
  results: Array<{
    index: number;         // Event index in batch
    status: 'fulfilled' | 'rejected';
    data: {
      eventId: string | null;
      tracked: boolean;
    } | null;
    error: string | null;  // Error message if failed
  }>;
}
```

**Constraints:**
- Minimum 1 event, maximum 50 events per batch
- Each event follows the same validation rules as single event tracking

---

#### 3. Get Ingestion Stats (Admin Only)

**Classification:** 🔒 ADMIN ONLY

Get statistics about the event ingestion buffer.

**Endpoint:** `analytics.eventIngestion.getStats`  
**Method:** `query`  
**Auth Required:** Yes (ADMIN only)

**Request Schema:**

```typescript
{} // Empty object (optional)
```

**Response Schema:**

```typescript
{
  bufferSize: number;       // Current number of events in buffer
  isProcessing: boolean;    // Whether batch is currently processing
  config: {
    batchSize: number;
    batchTimeoutMs: number;
    enableDeduplication: boolean;
    enableEnrichment: boolean;
    deduplicationTtlSeconds: number;
  } | null;
}
```

---

#### 4. Force Flush Buffer (Admin Only)

**Classification:** 🔒 ADMIN ONLY

Force immediate flush of the event buffer (useful for testing).

**Endpoint:** `analytics.eventIngestion.forceFlush`  
**Method:** `mutation`  
**Auth Required:** Yes (ADMIN only)

**Request Schema:**

```typescript
{} // Empty object (optional)
```

**Response Schema:**

```typescript
{
  flushed: boolean;
  message: string;
}
```

---

### Dashboard Analytics Endpoints

These endpoints would typically be implemented in a separate router (implementation pending). Based on the services, here's the expected API structure:

#### 5. Get Creator Dashboard

**Classification:** ⚡ HYBRID (Creators see own data, Admins see all)

Get dashboard metrics for a creator.

**Endpoint:** `analytics.dashboard.getCreatorDashboard`  
**Method:** `query`  
**Auth Required:** Yes

**Request Schema:**

```typescript
{
  creatorId: string;       // CUID of creator
  period: '7d' | '30d' | '90d' | '1y' | 'all'; // Time period (default: '30d')
}
```

**Response Schema:**

```typescript
{
  summary: {
    totalViews: number;
    totalLicenses: number;
    totalRevenueCents: number;
    avgConversionRate: number;
  };
  topAssets: Array<{
    assetId: string;
    assetTitle: string;
    views: number;
    licenses: number;
    revenueCents: number;
  }>;
  revenueTimeline: Array<{
    date: string;          // ISO date string
    revenueCents: number;
  }>;
  trafficSources: Array<{
    source: string;
    visits: number;
    conversions: number;
  }>;
}
```

**Authorization:**
- Creators can only access their own dashboard (`creatorId` must match authenticated user's creator ID)
- Admins can access any creator's dashboard

**Cache:** Results cached for 10 minutes

---

#### 6. Get Brand Campaign Metrics

**Classification:** ⚡ HYBRID (Brands see own data, Admins see all)

Get campaign performance metrics for a brand.

**Endpoint:** `analytics.dashboard.getBrandCampaignMetrics`  
**Method:** `query`  
**Auth Required:** Yes

**Request Schema:**

```typescript
{
  brandId: string;         // CUID of brand
  campaignId?: string;     // Optional: specific campaign ID
  dateRange: {
    start: string;         // ISO datetime string
    end: string;           // ISO datetime string
  };
}
```

**Response Schema:**

```typescript
{
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    totalSpendCents: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    roi: number;           // Return on investment percentage
    assetPerformance: Array<{
      assetId: string;
      assetTitle: string;
      views: number;
      clicks: number;
      ctr: number;         // Click-through rate percentage
    }>;
  }>;
}
```

**Authorization:**
- Brands can only access their own campaign metrics
- Admins can access any brand's metrics

---

#### 7. Get Platform Metrics (Admin Only)

**Classification:** 🔒 ADMIN ONLY

Get platform-wide metrics summary.

**Endpoint:** `analytics.dashboard.getPlatformMetrics`  
**Method:** `query`  
**Auth Required:** Yes (ADMIN only)

**Request Schema:**

```typescript
{
  period: 'today' | '7d' | '30d' | '90d'; // Time period (default: '30d')
}
```

**Response Schema:**

```typescript
{
  users: {
    total: number;
    new: number;
    active: number;
  };
  creators: {
    total: number;
    active: number;
    avgRevenuePerCreator: number;
  };
  brands: {
    total: number;
    active: number;
    avgSpendPerBrand: number;
  };
  assets: {
    total: number;
    uploaded: number;
    avgViewsPerAsset: number;
  };
  licenses: {
    total: number;
    created: number;
    renewalRate: number;  // Percentage
  };
  revenue: {
    totalCents: number;
    growth: number;       // Percentage growth vs previous period
    timeline: Array<{
      date: string;       // ISO date string
      revenueCents: number;
    }>;
  };
}
```

**Cache:** Results cached for 1 hour

---

#### 8. Get Asset Metrics

**Classification:** ⚡ HYBRID (Owner-restricted)

Get detailed metrics for a specific asset.

**Endpoint:** `analytics.dashboard.getAssetMetrics`  
**Method:** `query`  
**Auth Required:** Yes

**Request Schema:**

```typescript
{
  assetId: string;         // CUID of asset
  dateRange?: {
    start: string;         // ISO datetime string
    end: string;           // ISO datetime string
  };
}
```

**Response Schema:**

```typescript
{
  assetId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenueCents: number;
    uniqueVisitors: number;
    avgEngagementTime: number;
    topReferrers: Array<{
      referrer: string;
      count: number;
    }>;
    dailyBreakdown: Array<{
      date: string;
      views: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
    }>;
  };
}
```

**Authorization:**
- Asset owner (creator) can access their own asset metrics
- Brands with active licenses can access licensed asset metrics
- Admins can access all asset metrics

---

## TypeScript Type Definitions

### Core Event Types

```typescript
// Event Sources
export const EVENT_SOURCES = {
  WEB: 'web',
  API: 'api',
  MOBILE: 'mobile',
  SYSTEM: 'system',
  WEBHOOK: 'webhook',
} as const;

export type EventSource = typeof EVENT_SOURCES[keyof typeof EVENT_SOURCES];

// Entity Types
export const ENTITY_TYPES = {
  PROJECT: 'PROJECT',
  ASSET: 'ASSET',
  LICENSE: 'LICENSE',
  CREATOR: 'CREATOR',
  BRAND: 'BRAND',
  USER: 'USER',
  ROYALTY: 'ROYALTY',
  PAYOUT: 'PAYOUT',
  POST: 'POST',
  CATEGORY: 'CATEGORY',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

// Attribution Data
export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
}

// Track Event Input
export interface TrackEventInput {
  eventType: string;
  source?: EventSource;
  entityId?: string;
  entityType?: EntityType;
  sessionId?: string;
  props?: Record<string, any>;
  attribution?: Attribution;
  idempotencyKey?: string;
}

// Event Created Response
export interface EventCreated {
  eventId: string | null;
  tracked: boolean;
}
```

### Dashboard Types

```typescript
// Date Range
export interface DateRange {
  start: string;  // ISO datetime string
  end: string;    // ISO datetime string
}

// Period Type
export type Period = '7d' | '30d' | '90d' | '1y' | 'all';
export type PlatformPeriod = 'today' | '7d' | '30d' | '90d';

// Top Asset
export interface TopAsset {
  assetId: string;
  assetTitle: string;
  views: number;
  licenses: number;
  revenueCents: number;
}

// Traffic Source
export interface TrafficSource {
  source: string;
  visits: number;
  conversions: number;
}

// Creator Dashboard
export interface CreatorDashboard {
  summary: {
    totalViews: number;
    totalLicenses: number;
    totalRevenueCents: number;
    avgConversionRate: number;
  };
  topAssets: TopAsset[];
  revenueTimeline: Array<{
    date: string;
    revenueCents: number;
  }>;
  trafficSources: TrafficSource[];
}

// Asset Performance (for brands)
export interface AssetPerformance {
  assetId: string;
  assetTitle: string;
  views: number;
  clicks: number;
  ctr: number;  // Percentage
}

// Campaign Metrics
export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  totalSpendCents: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  roi: number;  // Percentage
  assetPerformance: AssetPerformance[];
}

// Brand Campaign Metrics
export interface BrandCampaignMetrics {
  campaigns: CampaignMetrics[];
}

// Platform Metrics
export interface PlatformMetrics {
  users: {
    total: number;
    new: number;
    active: number;
  };
  creators: {
    total: number;
    active: number;
    avgRevenuePerCreator: number;
  };
  brands: {
    total: number;
    active: number;
    avgSpendPerBrand: number;
  };
  assets: {
    total: number;
    uploaded: number;
    avgViewsPerAsset: number;
  };
  licenses: {
    total: number;
    created: number;
    renewalRate: number;
  };
  revenue: {
    totalCents: number;
    growth: number;
    timeline: Array<{
      date: string;
      revenueCents: number;
    }>;
  };
}

// Asset Metrics
export interface AssetMetrics {
  assetId: string;
  dateRange: DateRange;
  metrics: {
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenueCents: number;
    uniqueVisitors: number;
    avgEngagementTime: number;
    topReferrers: Array<{
      referrer: string;
      count: number;
    }>;
    dailyBreakdown: Array<{
      date: string;
      views: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
    }>;
  };
}
```

### Metrics Aggregation Types

```typescript
// Daily Metric Data
export interface DailyMetricData {
  date: Date;
  ipAssetId: string | null;
  projectId: string | null;
  licenseId: string | null;
  views: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  uniqueVisitors: number;
  engagementTime: number;
}

// Weekly Metrics Summary
export interface WeeklyMetricsSummary {
  totalWeeks: number;
  totalViews: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  weeklyBreakdown: Array<{
    weekStart: Date;
    weekEnd: Date;
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    viewsGrowth?: number | null;  // Percentage
  }>;
}

// Monthly Metrics Summary
export interface MonthlyMetricsSummary {
  year: number;
  totalMonths: number;
  totalViews: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  monthlyBreakdown: Array<{
    month: number;
    monthName: string;
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    viewsGrowth?: number | null;  // Percentage
    weeksInMonth?: number | null;
  }>;
}
```

---

## Request/Response Examples

### Example 1: Track Page View Event

**Request:**

```typescript
import { trpc } from '@/lib/trpc';

const result = await trpc.analytics.eventIngestion.track.mutate({
  eventType: 'asset_viewed',
  source: 'web',
  entityId: 'clx123abc456',
  entityType: 'ASSET',
  sessionId: crypto.randomUUID(),
  props: {
    viewDuration: 30,
    scrollDepth: 75,
  },
  attribution: {
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'summer_2025',
    referrer: 'https://google.com',
  },
});
```

**Response:**

```json
{
  "eventId": "clx789def012",
  "tracked": true
}
```

---

### Example 2: Track Multiple Events in Batch

**Request:**

```typescript
const result = await trpc.analytics.eventIngestion.trackBatch.mutate({
  events: [
    {
      eventType: 'asset_viewed',
      source: 'web',
      entityId: 'clx123abc456',
      entityType: 'ASSET',
      sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    },
    {
      eventType: 'license_clicked',
      source: 'web',
      entityId: 'clx123abc456',
      entityType: 'ASSET',
      sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      props: {
        buttonLocation: 'hero',
      },
    },
  ],
});
```

**Response:**

```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "status": "fulfilled",
      "data": {
        "eventId": "clx789def012",
        "tracked": true
      },
      "error": null
    },
    {
      "index": 1,
      "status": "fulfilled",
      "data": {
        "eventId": "clx789def013",
        "tracked": true
      },
      "error": null
    }
  ]
}
```

---

### Example 3: Get Creator Dashboard

**Request:**

```typescript
const dashboard = await trpc.analytics.dashboard.getCreatorDashboard.query({
  creatorId: 'clx456creator789',
  period: '30d',
});
```

**Response:**

```json
{
  "summary": {
    "totalViews": 15230,
    "totalLicenses": 47,
    "totalRevenueCents": 1250000,
    "avgConversionRate": 0.31
  },
  "topAssets": [
    {
      "assetId": "clx123asset001",
      "assetTitle": "Summer Collection 2025",
      "views": 5420,
      "licenses": 18,
      "revenueCents": 450000
    },
    {
      "assetId": "clx123asset002",
      "assetTitle": "Urban Street Style",
      "views": 3890,
      "licenses": 12,
      "revenueCents": 300000
    }
  ],
  "revenueTimeline": [
    {
      "date": "2025-09-17",
      "revenueCents": 45000
    },
    {
      "date": "2025-09-18",
      "revenueCents": 52000
    }
  ],
  "trafficSources": [
    {
      "source": "google",
      "visits": 2340,
      "conversions": 15
    },
    {
      "source": "instagram",
      "visits": 1890,
      "conversions": 12
    }
  ]
}
```

---

### Example 4: Get Platform Metrics (Admin)

**Request:**

```typescript
const metrics = await trpc.analytics.dashboard.getPlatformMetrics.query({
  period: '30d',
});
```

**Response:**

```json
{
  "users": {
    "total": 5420,
    "new": 342,
    "active": 2156
  },
  "creators": {
    "total": 1234,
    "active": 567,
    "avgRevenuePerCreator": 125000
  },
  "brands": {
    "total": 456,
    "active": 234,
    "avgSpendPerBrand": 450000
  },
  "assets": {
    "total": 8900,
    "uploaded": 234,
    "avgViewsPerAsset": 342
  },
  "licenses": {
    "total": 3456,
    "created": 156,
    "renewalRate": 67.5
  },
  "revenue": {
    "totalCents": 5420000,
    "growth": 12.5,
    "timeline": [
      {
        "date": "2025-09-17",
        "revenueCents": 180000
      },
      {
        "date": "2025-09-18",
        "revenueCents": 195000
      }
    ]
  }
}
```

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Validation](./ANALYTICS_METRICS_AGGREGATION_PART_2_LOGIC.md)** - Validation rules, calculations, and business logic
- **[Part 3: Implementation Guide](./ANALYTICS_METRICS_AGGREGATION_PART_3_IMPLEMENTATION.md)** - Error handling, caching, and frontend implementation

---

## Support

For questions or issues:
- **Backend Team:** Check `docs/METRICS_AGGREGATION_SYSTEM_COMPLETE.md`
- **API Issues:** Create a ticket with the backend team
- **Type Definitions:** Located in `src/modules/analytics/types/index.ts`
