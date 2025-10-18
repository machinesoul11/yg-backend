# Creator Analytics API - Frontend Integration Guide

> **Classification:** ⚡ HYBRID - Core functionality used by both public-facing creator portal and admin backend with different access levels

## Overview

The Creator Analytics module provides comprehensive performance metrics, portfolio analytics, license tracking, and industry benchmarking for creators on the YesGoddess platform. This guide provides everything the frontend team needs to integrate these analytics features.

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Authentication & Authorization](#authentication--authorization)
4. [Request/Response Examples](#requestresponse-examples)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Caching Strategy](#caching-strategy)
8. [Business Logic & Validation](#business-logic--validation)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## API Endpoints

### Base URL
- **Production:** `https://ops.yesgoddess.agency/api/trpc`
- **Note:** All endpoints use tRPC, not REST

### Available Endpoints

#### 1. Get Engagement Analytics
```typescript
// tRPC Procedure
creatorAnalytics.getEngagement

// Query Parameters
{
  id: string;                    // Creator CUID (required)
  startDate?: string;            // ISO 8601 datetime (optional, defaults to 30 days ago)
  endDate?: string;              // ISO 8601 datetime (optional, defaults to now)
  granularity?: 'hour' | 'day' | 'week' | 'month';  // Default: 'day'
  compareWithPrevious?: boolean; // Default: false
}
```

**Purpose:** Retrieve views, clicks, conversions, and engagement metrics for a creator's portfolio.

---

#### 2. Get Portfolio Performance
```typescript
// tRPC Procedure
creatorAnalytics.getPortfolioPerformance

// Query Parameters
{
  id: string;                    // Creator CUID (required)
  startDate?: string;            // ISO 8601 datetime (optional, defaults to 90 days ago)
  endDate?: string;              // ISO 8601 datetime (optional, defaults to now)
  sortBy?: 'views' | 'conversions' | 'revenue' | 'engagementRate' | 'title'; // Default: 'views'
  sortOrder?: 'asc' | 'desc';    // Default: 'desc'
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
  status?: 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  limit?: number;                // 1-100, Default: 20
  offset?: number;               // Default: 0
}
```

**Purpose:** Analyze individual asset performance within a creator's portfolio with filtering and sorting.

---

#### 3. Get License Metrics
```typescript
// tRPC Procedure
creatorAnalytics.getLicenseMetrics

// Query Parameters
{
  id: string;                    // Creator CUID (required)
  startDate?: string;            // ISO 8601 datetime (optional, defaults to 365 days ago)
  endDate?: string;              // ISO 8601 datetime (optional, defaults to now)
  groupBy?: 'status' | 'type' | 'month' | 'asset'; // Default: 'status'
  includeExpired?: boolean;      // Default: false
}
```

**Purpose:** Analyze license distribution, revenue, and velocity metrics.

---

#### 4. Get Benchmarks
```typescript
// tRPC Procedure
creatorAnalytics.getBenchmarks

// Query Parameters
{
  id: string;                    // Creator CUID (required)
  startDate?: string;            // ISO 8601 datetime (optional, defaults to 90 days ago)
  endDate?: string;              // ISO 8601 datetime (optional, defaults to now)
  segment?: 'all' | 'specialty' | 'experience' | 'category'; // Default: 'all'
  metrics?: Array<
    'engagementRate' | 
    'conversionRate' | 
    'avgRevenuePerAsset' | 
    'licenseVelocity' | 
    'portfolioGrowth' | 
    'viewsPerAsset'
  >; // Optional, defaults to all metrics
}
```

**Purpose:** Compare creator performance against industry benchmarks and peer groups.

---

#### 5. Get Creator Analytics Summary (Admin Only)
```typescript
// tRPC Procedure
creatorAnalytics.getCreatorAnalyticsSummary

// Query Parameters
{
  creatorId: string;             // Creator CUID (required)
  dateRange?: {
    start: string;               // ISO 8601 datetime
    end: string;                 // ISO 8601 datetime
  };
}
```

**Purpose:** Admin-only endpoint to retrieve all analytics for any creator in a single request.

---

## TypeScript Type Definitions

### Request Input Types

```typescript
/**
 * Engagement Analytics Input
 */
export interface GetEngagementAnalyticsInput {
  id: string;
  startDate?: string;
  endDate?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
  compareWithPrevious?: boolean;
}

/**
 * Portfolio Performance Input
 */
export interface GetPortfolioPerformanceInput {
  id: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'views' | 'conversions' | 'revenue' | 'engagementRate' | 'title';
  sortOrder?: 'asc' | 'desc';
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
  status?: 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  limit?: number;
  offset?: number;
}

/**
 * License Metrics Input
 */
export interface GetLicenseMetricsInput {
  id: string;
  startDate?: string;
  endDate?: string;
  groupBy?: 'status' | 'type' | 'month' | 'asset';
  includeExpired?: boolean;
}

/**
 * Benchmarks Input
 */
export interface GetBenchmarksInput {
  id: string;
  startDate?: string;
  endDate?: string;
  segment?: 'all' | 'specialty' | 'experience' | 'category';
  metrics?: Array<
    'engagementRate' | 
    'conversionRate' | 
    'avgRevenuePerAsset' | 
    'licenseVelocity' | 
    'portfolioGrowth' | 
    'viewsPerAsset'
  >;
}
```

### Response Types

```typescript
/**
 * Engagement Analytics Response
 */
export interface EngagementAnalyticsResponse {
  creatorId: string;
  dateRange: {
    start: string;  // ISO 8601
    end: string;    // ISO 8601
  };
  metrics: {
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    uniqueVisitors: number;
    avgEngagementTime: number;      // in seconds
    clickThroughRate: number;       // percentage (0-100)
    conversionRate: number;         // percentage (0-100)
  };
  timeSeries: Array<{
    timestamp: string;              // ISO 8601
    views: number;
    clicks: number;
    conversions: number;
    uniqueVisitors: number;
  }>;
  topAssets: Array<{
    assetId: string;
    title: string;
    type: string;
    views: number;
    conversions: number;
  }>;
  comparison?: {
    periodLabel: string;            // e.g., "Previous Period"
    viewsChange: number;            // percentage change
    clicksChange: number;           // percentage change
    conversionsChange: number;      // percentage change
    conversionRateChange: number;   // percentage change
  };
}

/**
 * Portfolio Performance Response
 */
export interface PortfolioPerformanceResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalAssets: number;
    publishedAssets: number;
    totalViews: number;
    totalRevenueCents: number;
    avgViewsPerAsset: number;
    avgRevenuePerAssetCents: number;
  };
  assets: Array<{
    assetId: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;              // ISO 8601
    views: number;
    clicks: number;
    conversions: number;
    revenueCents: number;
    activeLicenses: number;
    engagementRate: number;         // percentage (0-100)
    thumbnailUrl: string | null;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  performanceDistribution: {
    topPerformers: number;          // Count of assets in top 25%
    goodPerformers: number;         // Count in 25-50%
    averagePerformers: number;      // Count in 50-75%
    underPerformers: number;        // Count in bottom 25%
  };
}

/**
 * License Metrics Response
 */
export interface LicenseMetricsResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalLicenses: number;
    activeLicenses: number;
    expiringLicenses: number;
    totalRevenueCents: number;
    avgLicenseValueCents: number;
  };
  byStatus: Array<{
    status: string;                 // 'ACTIVE', 'EXPIRED', etc.
    count: number;
    percentage: number;             // 0-100
    revenueCents: number;
  }>;
  byType: Array<{
    type: string;                   // License type
    count: number;
    percentage: number;             // 0-100
    revenueCents: number;
  }>;
  revenueTimeSeries: Array<{
    period: string;                 // ISO 8601 month start
    revenueCents: number;
    newLicenses: number;
    renewals: number;
  }>;
  topLicensedAssets: Array<{
    assetId: string;
    title: string;
    licenseCount: number;
    revenueCents: number;
  }>;
  licenseVelocity: {
    averageDaysToFirstLicense: number;
    averageDaysToConversion: number;
    monthlyGrowthRate: number;      // percentage
  };
}

/**
 * Benchmark Comparison Response
 */
export interface BenchmarkComparisonResponse {
  creatorId: string;
  dateRange: {
    start: string;
    end: string;
  };
  segment: {
    type: string;                   // 'all', 'specialty', etc.
    label: string;                  // Human-readable label
    size: number;                   // Number of creators in segment
  };
  benchmarks: Array<{
    metric: string;
    label: string;
    yourValue: number;
    benchmarkValue: number;
    percentile: number;             // 0-100, where you rank
    performance: 'above' | 'at' | 'below';
    difference: number;             // Percentage difference from benchmark
    unit: string;                   // '%', 'count', 'cents', 'seconds', etc.
  }>;
  categoryBreakdown: {
    engagement: {
      metrics: string[];
      overallScore: number;         // 0-100
      percentile: number;
    };
    monetization: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
    growth: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
    quality: {
      metrics: string[];
      overallScore: number;
      percentile: number;
    };
  };
  insights: Array<{
    category: string;
    message: string;
    severity: 'positive' | 'neutral' | 'attention';
    recommendation?: string;
  }>;
}
```

---

## Authentication & Authorization

### Authentication Requirements

All endpoints require JWT authentication via NextAuth.js session.

**Request Headers:**
```typescript
{
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

### Authorization Rules

| Endpoint | Creator (Own Data) | Creator (Others) | Brand | Admin |
|----------|-------------------|------------------|-------|-------|
| `getEngagement` | ✅ Allow | ❌ Forbidden | ❌ Forbidden | ✅ Allow |
| `getPortfolioPerformance` | ✅ Allow | ❌ Forbidden | ❌ Forbidden | ✅ Allow |
| `getLicenseMetrics` | ✅ Allow | ❌ Forbidden | ❌ Forbidden | ✅ Allow |
| `getBenchmarks` | ✅ Allow | ❌ Forbidden | ❌ Forbidden | ✅ Allow |
| `getCreatorAnalyticsSummary` | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ✅ Allow |

**Key Points:**
- Creators can ONLY access their own analytics
- Admins can access analytics for any creator
- Brands cannot access creator analytics (they get license/project analytics separately)
- Authorization check occurs at the router level before service execution

---

## Request/Response Examples

### Example 1: Get Engagement Analytics

**tRPC Request:**
```typescript
import { trpc } from '@/lib/trpc';

const { data, error, isLoading } = trpc.creatorAnalytics.getEngagement.useQuery({
  id: 'clh5w8x9y0000abc123xyz',
  startDate: '2025-09-17T00:00:00Z',
  endDate: '2025-10-17T23:59:59Z',
  granularity: 'day',
  compareWithPrevious: true
});
```

**Response:**
```json
{
  "creatorId": "clh5w8x9y0000abc123xyz",
  "dateRange": {
    "start": "2025-09-17T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "metrics": {
    "totalViews": 15432,
    "totalClicks": 892,
    "totalConversions": 45,
    "uniqueVisitors": 12450,
    "avgEngagementTime": 145,
    "clickThroughRate": 5.78,
    "conversionRate": 5.04
  },
  "timeSeries": [
    {
      "timestamp": "2025-09-17T00:00:00.000Z",
      "views": 487,
      "clicks": 28,
      "conversions": 2,
      "uniqueVisitors": 412
    },
    {
      "timestamp": "2025-09-18T00:00:00.000Z",
      "views": 523,
      "clicks": 31,
      "conversions": 1,
      "uniqueVisitors": 445
    }
  ],
  "topAssets": [
    {
      "assetId": "clh5abc123",
      "title": "Ethereal Portrait Collection",
      "type": "IMAGE",
      "views": 3245,
      "conversions": 12
    }
  ],
  "comparison": {
    "periodLabel": "Previous Period",
    "viewsChange": 12.5,
    "clicksChange": 8.3,
    "conversionsChange": 15.7,
    "conversionRateChange": 6.8
  }
}
```

---

### Example 2: Get Portfolio Performance (with filters)

**tRPC Request:**
```typescript
const { data } = trpc.creatorAnalytics.getPortfolioPerformance.useQuery({
  id: 'clh5w8x9y0000abc123xyz',
  assetType: 'IMAGE',
  status: 'PUBLISHED',
  sortBy: 'revenue',
  sortOrder: 'desc',
  limit: 10,
  offset: 0
});
```

**Response:**
```json
{
  "creatorId": "clh5w8x9y0000abc123xyz",
  "dateRange": {
    "start": "2025-07-19T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "summary": {
    "totalAssets": 47,
    "publishedAssets": 38,
    "totalViews": 125430,
    "totalRevenueCents": 458900,
    "avgViewsPerAsset": 2668,
    "avgRevenuePerAssetCents": 9763
  },
  "assets": [
    {
      "assetId": "clh5xyz789",
      "title": "Sunset Dreams Collection",
      "type": "IMAGE",
      "status": "PUBLISHED",
      "createdAt": "2025-08-15T10:30:00.000Z",
      "views": 8934,
      "clicks": 456,
      "conversions": 23,
      "revenueCents": 89500,
      "activeLicenses": 5,
      "engagementRate": 5.36,
      "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clh5xyz789.jpg"
    }
  ],
  "pagination": {
    "total": 38,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  },
  "performanceDistribution": {
    "topPerformers": 10,
    "goodPerformers": 9,
    "averagePerformers": 9,
    "underPerformers": 10
  }
}
```

---

### Example 3: Get License Metrics

**tRPC Request:**
```typescript
const { data } = trpc.creatorAnalytics.getLicenseMetrics.useQuery({
  id: 'clh5w8x9y0000abc123xyz',
  groupBy: 'status',
  includeExpired: false
});
```

**Response:**
```json
{
  "creatorId": "clh5w8x9y0000abc123xyz",
  "dateRange": {
    "start": "2024-10-17T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "summary": {
    "totalLicenses": 67,
    "activeLicenses": 52,
    "expiringLicenses": 8,
    "totalRevenueCents": 1245600,
    "avgLicenseValueCents": 18591
  },
  "byStatus": [
    {
      "status": "ACTIVE",
      "count": 52,
      "percentage": 77.61,
      "revenueCents": 1056000
    },
    {
      "status": "PENDING",
      "count": 10,
      "percentage": 14.93,
      "revenueCents": 145600
    },
    {
      "status": "EXPIRING_SOON",
      "count": 5,
      "percentage": 7.46,
      "revenueCents": 44000
    }
  ],
  "byType": [
    {
      "type": "STANDARD",
      "count": 42,
      "percentage": 62.69,
      "revenueCents": 780000
    },
    {
      "type": "EXCLUSIVE",
      "count": 15,
      "percentage": 22.39,
      "revenueCents": 345600
    },
    {
      "type": "COMMERCIAL",
      "count": 10,
      "percentage": 14.93,
      "revenueCents": 120000
    }
  ],
  "revenueTimeSeries": [
    {
      "period": "2025-07-01T00:00:00.000Z",
      "revenueCents": 145000,
      "newLicenses": 8,
      "renewals": 2
    },
    {
      "period": "2025-08-01T00:00:00.000Z",
      "revenueCents": 198500,
      "newLicenses": 11,
      "renewals": 3
    }
  ],
  "topLicensedAssets": [
    {
      "assetId": "clh5abc123",
      "title": "Ethereal Portrait Collection",
      "licenseCount": 12,
      "revenueCents": 234000
    }
  ],
  "licenseVelocity": {
    "averageDaysToFirstLicense": 18,
    "averageDaysToConversion": 14,
    "monthlyGrowthRate": 12.5
  }
}
```

---

### Example 4: Get Benchmarks

**tRPC Request:**
```typescript
const { data } = trpc.creatorAnalytics.getBenchmarks.useQuery({
  id: 'clh5w8x9y0000abc123xyz',
  segment: 'specialty',
  metrics: ['engagementRate', 'conversionRate', 'avgRevenuePerAsset']
});
```

**Response:**
```json
{
  "creatorId": "clh5w8x9y0000abc123xyz",
  "dateRange": {
    "start": "2025-07-19T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "segment": {
    "type": "specialty",
    "label": "Photography Creators",
    "size": 250
  },
  "benchmarks": [
    {
      "metric": "engagementRate",
      "label": "Engagement Rate",
      "yourValue": 5.78,
      "benchmarkValue": 2.5,
      "percentile": 85,
      "performance": "above",
      "difference": 131.2,
      "unit": "%"
    },
    {
      "metric": "conversionRate",
      "label": "Conversion Rate",
      "yourValue": 5.04,
      "benchmarkValue": 5.0,
      "percentile": 52,
      "performance": "at",
      "difference": 0.8,
      "unit": "%"
    },
    {
      "metric": "avgRevenuePerAsset",
      "label": "Avg Revenue per Asset",
      "yourValue": 9763,
      "benchmarkValue": 50000,
      "percentile": 28,
      "performance": "below",
      "difference": -80.47,
      "unit": "cents"
    }
  ],
  "categoryBreakdown": {
    "engagement": {
      "metrics": ["engagementRate", "viewsPerAsset"],
      "overallScore": 82,
      "percentile": 82
    },
    "monetization": {
      "metrics": ["conversionRate", "avgRevenuePerAsset", "licenseVelocity"],
      "overallScore": 45,
      "percentile": 45
    },
    "growth": {
      "metrics": ["portfolioGrowth"],
      "overallScore": 50,
      "percentile": 50
    },
    "quality": {
      "metrics": [],
      "overallScore": 50,
      "percentile": 50
    }
  },
  "insights": [
    {
      "category": "engagementRate",
      "message": "Your Engagement Rate is in the top 25% of creators",
      "severity": "positive"
    },
    {
      "category": "avgRevenuePerAsset",
      "message": "Your Avg Revenue per Asset is below the segment average",
      "severity": "attention",
      "recommendation": "Consider strategies to improve avg revenue per asset"
    }
  ]
}
```

---

## Error Handling

### Error Response Structure

All tRPC errors follow this format:

```typescript
{
  error: {
    message: string;
    code: string;
    data?: {
      zodError?: ZodError;  // If validation failed
      [key: string]: any;
    };
  }
}
```

### Error Codes

| HTTP Status | tRPC Code | Description | User Message |
|-------------|-----------|-------------|--------------|
| 401 | `UNAUTHORIZED` | No valid JWT token | "You must be logged in to view analytics" |
| 403 | `FORBIDDEN` | User doesn't own this creator profile | "You don't have permission to view this creator's analytics" |
| 404 | `NOT_FOUND` | Creator ID doesn't exist | "Creator profile not found" |
| 400 | `BAD_REQUEST` | Invalid input parameters (Zod validation) | "Invalid date range. End date must be after start date" |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded | "Too many requests. Please try again in {resetAt}" |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error | "Something went wrong. Please try again later" |

### Specific Error Cases

#### 1. Creator Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Creator with ID clh5invalid not found"
  }
}
```

**Frontend Handling:**
- Show a 404 page with "Creator not found"
- Provide a link to go back or browse other creators

---

#### 2. Unauthorized Access
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this creator's analytics"
  }
}
```

**Frontend Handling:**
- Redirect to login if not authenticated
- Show "Access Denied" message if trying to view another creator's data
- For admins, verify admin session is valid

---

#### 3. Validation Error (Invalid Date Range)
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation error",
    "data": {
      "zodError": {
        "fieldErrors": {
          "startDate": ["Invalid datetime"]
        }
      }
    }
  }
}
```

**Frontend Handling:**
- Parse `zodError.fieldErrors` to show specific field errors
- Highlight invalid form fields
- Show inline validation messages

---

#### 4. Rate Limit Exceeded
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded"
  }
}
```

**Frontend Handling:**
- Show toast notification: "Too many requests. Please wait before trying again."
- Disable the action button temporarily
- Check rate limit headers to show countdown timer

---

### Error Handling Best Practices

```typescript
import { TRPCClientError } from '@trpc/client';

function AnalyticsDashboard() {
  const { data, error, isLoading } = trpc.creatorAnalytics.getEngagement.useQuery({
    id: creatorId
  });

  // Handle loading state
  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  // Handle errors
  if (error) {
    if (error.data?.code === 'UNAUTHORIZED') {
      return <RedirectToLogin />;
    }
    
    if (error.data?.code === 'FORBIDDEN') {
      return (
        <AccessDenied 
          message="You don't have permission to view this creator's analytics" 
        />
      );
    }
    
    if (error.data?.code === 'NOT_FOUND') {
      return <NotFound message="Creator not found" />;
    }
    
    if (error.data?.code === 'TOO_MANY_REQUESTS') {
      return (
        <RateLimitError 
          message="Too many requests. Please try again in a moment."
        />
      );
    }
    
    // Generic error fallback
    return (
      <ErrorDisplay 
        message="Unable to load analytics. Please try again later."
        onRetry={() => refetch()}
      />
    );
  }

  return <AnalyticsView data={data} />;
}
```

---

## Rate Limiting

### Rate Limit Configuration

| Endpoint | Limit | Window | Header |
|----------|-------|--------|--------|
| All Analytics Endpoints | 100 requests | 1 hour | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |

### Rate Limit Headers

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1697558400
```

### Frontend Implementation

```typescript
function useAnalyticsWithRateLimit() {
  const [rateLimitInfo, setRateLimitInfo] = useState({
    limit: 100,
    remaining: 100,
    resetAt: null as Date | null
  });

  const { data, error } = trpc.creatorAnalytics.getEngagement.useQuery(
    { id: creatorId },
    {
      onSuccess: (data, response) => {
        // Extract rate limit headers from response
        const headers = response?.headers;
        if (headers) {
          setRateLimitInfo({
            limit: parseInt(headers.get('X-RateLimit-Limit') || '100'),
            remaining: parseInt(headers.get('X-RateLimit-Remaining') || '100'),
            resetAt: new Date(
              parseInt(headers.get('X-RateLimit-Reset') || '0') * 1000
            )
          });
        }
      }
    }
  );

  return { data, error, rateLimitInfo };
}
```

### UI Display

```tsx
function RateLimitIndicator({ remaining, limit, resetAt }: RateLimitInfo) {
  if (remaining < 10) {
    return (
      <Alert severity="warning">
        You have {remaining} of {limit} requests remaining. 
        Resets at {resetAt?.toLocaleTimeString()}
      </Alert>
    );
  }
  return null;
}
```

---

## Caching Strategy

### Server-Side Caching

The backend implements Redis caching with the following TTLs:

| Endpoint | Cache Key Pattern | TTL |
|----------|------------------|-----|
| `getEngagement` | `creator:{id}:engagement:{start}:{end}:{granularity}` | 15 minutes |
| `getPortfolioPerformance` | Dynamic (not cached) | N/A |
| `getLicenseMetrics` | Dynamic (not cached) | N/A |
| `getBenchmarks` | Dynamic (not cached) | N/A |

### Client-Side Caching (React Query via tRPC)

**Recommended Configuration:**

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Engagement analytics (changes frequently)
      staleTime: 5 * 60 * 1000,      // 5 minutes
      cacheTime: 30 * 60 * 1000,     // 30 minutes
      
      // Refetch on window focus for real-time updates
      refetchOnWindowFocus: true,
      
      // Retry failed requests
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
```

**Per-Query Caching:**

```typescript
// Engagement analytics - refetch more frequently
const engagement = trpc.creatorAnalytics.getEngagement.useQuery(
  { id: creatorId },
  {
    staleTime: 5 * 60 * 1000,  // 5 minutes
    refetchInterval: 5 * 60 * 1000,  // Auto-refetch every 5 minutes
  }
);

// Portfolio performance - less frequent updates
const portfolio = trpc.creatorAnalytics.getPortfolioPerformance.useQuery(
  { id: creatorId },
  {
    staleTime: 15 * 60 * 1000,  // 15 minutes
  }
);

// Benchmarks - rarely change
const benchmarks = trpc.creatorAnalytics.getBenchmarks.useQuery(
  { id: creatorId },
  {
    staleTime: 60 * 60 * 1000,  // 1 hour
  }
);
```

### Cache Invalidation

```typescript
import { useQueryClient } from '@tanstack/react-query';

function useInvalidateAnalytics(creatorId: string) {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries(['creatorAnalytics']);
  };

  const invalidateEngagement = () => {
    queryClient.invalidateQueries(['creatorAnalytics', 'getEngagement', { id: creatorId }]);
  };

  return { invalidateAll, invalidateEngagement };
}
```

---

## Business Logic & Validation

### Date Range Validation

**Rules:**
1. Dates must be in ISO 8601 format
2. `endDate` must be after `startDate`
3. Maximum date range: 365 days
4. If `startDate` or `endDate` is omitted, defaults are applied:
   - Engagement: Last 30 days
   - Portfolio: Last 90 days
   - Licenses: Last 365 days
   - Benchmarks: Last 90 days

**Frontend Validation:**

```typescript
function validateDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  if (end <= start) {
    return { valid: false, error: 'End date must be after start date' };
  }
  
  const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 365) {
    return { valid: false, error: 'Date range cannot exceed 365 days' };
  }
  
  return { valid: true };
}
```

---

### Pagination Logic

**Rules:**
- `limit`: 1-100 (default: 20)
- `offset`: >= 0 (default: 0)
- `hasMore` is calculated as: `offset + limit < total`

**Frontend Implementation:**

```typescript
function usePortfolioPagination(creatorId: string) {
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data } = trpc.creatorAnalytics.getPortfolioPerformance.useQuery({
    id: creatorId,
    limit,
    offset: page * limit
  });

  const totalPages = data ? Math.ceil(data.pagination.total / limit) : 0;

  return {
    page,
    setPage,
    totalPages,
    hasNextPage: data?.pagination.hasMore ?? false,
    hasPrevPage: page > 0
  };
}
```

---

### Currency Display

**Revenue fields are in cents.**

Convert to dollars for display:

```typescript
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// Example: 458900 cents → "$4,589.00"
```

---

### Percentage Display

**Rates are returned as 0-100.**

```typescript
function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

// Example: 5.78 → "5.78%"
```

---

### Engagement Time Display

**`avgEngagementTime` is in seconds.**

```typescript
function formatEngagementTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Example: 145 → "2m 25s"
```

---

## Frontend Implementation Checklist

### Phase 1: Setup & Basic Integration
- [ ] Install tRPC client and configure with backend URL
- [ ] Create TypeScript interfaces (copy from this document)
- [ ] Set up React Query with recommended cache settings
- [ ] Implement authentication token passing in tRPC client
- [ ] Create error boundary component for analytics pages

### Phase 2: Engagement Analytics UI
- [ ] Create EngagementDashboard component
- [ ] Implement date range picker with validation
- [ ] Add granularity selector (hour/day/week/month)
- [ ] Build time series chart (use Chart.js, Recharts, or similar)
- [ ] Display key metrics cards (views, clicks, conversions, CTR, CR)
- [ ] Show top performing assets list
- [ ] Implement "Compare with Previous" toggle
- [ ] Add loading skeletons
- [ ] Handle all error states

### Phase 3: Portfolio Performance UI
- [ ] Create PortfolioPerformance component
- [ ] Implement asset table with sortable columns
- [ ] Add filter controls (asset type, status)
- [ ] Build pagination controls
- [ ] Display summary statistics
- [ ] Show performance distribution chart (pie or bar chart)
- [ ] Add asset thumbnail display
- [ ] Implement "View Asset Details" navigation
- [ ] Handle empty states (no assets)

### Phase 4: License Metrics UI
- [ ] Create LicenseMetrics component
- [ ] Display license summary cards
- [ ] Build license status distribution chart (donut chart)
- [ ] Build license type distribution chart
- [ ] Implement revenue time series chart
- [ ] Show top licensed assets list
- [ ] Display license velocity metrics
- [ ] Add tooltip explanations for velocity metrics

### Phase 5: Benchmarks UI
- [ ] Create BenchmarksComparison component
- [ ] Display segment information badge
- [ ] Build benchmark comparison cards
- [ ] Show percentile indicators (progress bars or gauges)
- [ ] Display category breakdown with scores
- [ ] Implement insights/recommendations section
- [ ] Add visual indicators (above/at/below benchmark)
- [ ] Create metric detail tooltips

### Phase 6: Admin Features
- [ ] Implement admin-only analytics summary view
- [ ] Add creator selector/search for admins
- [ ] Create aggregated dashboard showing all analytics
- [ ] Implement export functionality (CSV/PDF)

### Phase 7: Polish & Optimization
- [ ] Implement responsive design for mobile
- [ ] Add data export buttons
- [ ] Implement print-friendly views
- [ ] Add keyboard navigation
- [ ] Optimize chart rendering performance
- [ ] Add accessibility labels (ARIA)
- [ ] Implement dark mode support
- [ ] Add analytics tracking (track which metrics users view most)

### Phase 8: Testing
- [ ] Test with various date ranges
- [ ] Test pagination edge cases
- [ ] Test error scenarios (network failure, 404, 403)
- [ ] Test rate limiting behavior
- [ ] Test cache invalidation
- [ ] Cross-browser testing
- [ ] Mobile device testing
- [ ] Performance testing with large datasets

---

## Additional Notes

### Timezone Handling
- All timestamps are in UTC
- Convert to user's local timezone in the frontend
- Use libraries like `date-fns-tz` or `luxon`

```typescript
import { format, utcToZonedTime } from 'date-fns-tz';

function formatToUserTimezone(utcTimestamp: string) {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zonedDate = utcToZonedTime(utcTimestamp, userTimezone);
  return format(zonedDate, 'MMM d, yyyy h:mm a', { timeZone: userTimezone });
}
```

---

### Real-time Updates
- These endpoints do NOT support WebSocket/SSE
- Use polling for near real-time updates (every 5 minutes recommended)
- Consider implementing a "Refresh" button for manual updates

---

### Performance Considerations
- Large portfolios (100+ assets) may take 2-3 seconds to load
- Show loading indicators for better UX
- Consider implementing virtual scrolling for large asset lists
- Lazy load charts (only render when scrolled into view)

---

## Support & Questions

For backend API questions, contact: **Backend Team**
For integration issues, check: `/docs/TROUBLESHOOTING.md`

---

**Document Version:** 1.0  
**Last Updated:** October 17, 2025  
**Maintained By:** Backend Development Team
