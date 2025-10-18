# Platform Analytics (Admin) - Frontend Integration Guide

🔒 **ADMIN ONLY** - Internal operations and admin interface only

**Last Updated:** October 17, 2025  
**Backend Module:** Platform Analytics Service  
**API Base Path:** `/trpc/platformAnalytics.*`

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [Caching Strategy](#caching-strategy)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Example Implementations](#example-implementations)

---

## Overview

The Platform Analytics module provides **admin-only** access to platform-wide metrics including:

- **User Analytics**: Acquisition, retention, and churn metrics with timeline data
- **Engagement Analytics**: Daily/Monthly Active Users (DAU/MAU), session metrics, and user stickiness
- **Cohort Analysis**: Weekly/monthly cohort retention, revenue, and engagement tracking

### Architecture

- **Protocol**: tRPC (TypeScript RPC)
- **Authentication**: JWT via NextAuth session
- **Authorization**: Admin role required for all endpoints
- **Caching**: Redis-backed with automatic TTL management
- **Data Source**: PostgreSQL with complex SQL aggregations

### Key Features

✅ Multi-granularity time series (daily, weekly, monthly)  
✅ Period-over-period comparison  
✅ Cohort analysis with multiple metrics  
✅ Comprehensive session tracking  
✅ Automatic cache invalidation  

---

## API Endpoints

### Base Configuration

```typescript
// tRPC Client Setup (React Query)
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@backend/lib/api/root';

export const trpc = createTRPCReact<AppRouter>();

// Provider setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers: () => ({
        authorization: `Bearer ${getAuthToken()}`,
      }),
    }),
  ],
});
```

---

### 1. Get User Analytics

**Endpoint:** `platformAnalytics.getUsers`  
**Method:** `query`  
**Access:** 🔒 Admin Only

Retrieves user acquisition, retention, and churn metrics with configurable time periods and granularity.

#### Request Schema

```typescript
interface GetUsersInput {
  period: '7d' | '30d' | '90d' | '1y' | 'all';
  granularity: 'daily' | 'weekly' | 'monthly';
}
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | `enum` | No | `'30d'` | Time period for analysis |
| `granularity` | `enum` | No | `'daily'` | Data aggregation level |

**Period Options:**
- `'7d'` - Last 7 days
- `'30d'` - Last 30 days (default)
- `'90d'` - Last 90 days
- `'1y'` - Last year
- `'all'` - All time (since 2020-01-01)

**Granularity Options:**
- `'daily'` - Day-by-day breakdown
- `'weekly'` - Week-by-week aggregation
- `'monthly'` - Month-by-month aggregation

#### Response Schema

```typescript
interface UserAnalytics {
  period: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  dateRange: {
    start: string; // ISO 8601 datetime
    end: string;   // ISO 8601 datetime
  };
  acquisition: {
    newUsers: number;           // Total new users in period
    newUsersGrowth: number;     // % growth vs previous period
    timeline: Array<{
      date: string;             // YYYY-MM-DD format
      count: number;            // New users on this date
      cumulative: number;       // Running total
    }>;
  };
  retention: {
    overall: number;            // Overall retention rate (%)
    cohorts: Array<{
      cohortPeriod: string;     // YYYY-MM-DD of cohort start
      cohortSize: number;       // Users in this cohort
      retentionRates: Array<{
        period: number;         // Period number (0, 1, 2, etc.)
        rate: number;           // Retention rate (%)
        retained: number;       // Number of retained users
      }>;
    }>;
  };
  churn: {
    churnedUsers: number;       // Total churned users
    churnRate: number;          // Churn rate (%)
    timeline: Array<{
      date: string;
      churned: number;
      rate: number;             // Churn rate (%)
    }>;
  };
}
```

#### Example Request

```typescript
// Using React Query hook
const { data, isLoading, error } = trpc.platformAnalytics.getUsers.useQuery({
  period: '90d',
  granularity: 'weekly',
});
```

#### Example Response

```json
{
  "period": "90d",
  "granularity": "weekly",
  "dateRange": {
    "start": "2025-07-18T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "acquisition": {
    "newUsers": 1543,
    "newUsersGrowth": 23.5,
    "timeline": [
      {
        "date": "2025-07-18",
        "count": 87,
        "cumulative": 87
      },
      {
        "date": "2025-07-25",
        "count": 94,
        "cumulative": 181
      }
    ]
  },
  "retention": {
    "overall": 68.3,
    "cohorts": [
      {
        "cohortPeriod": "2025-07-18",
        "cohortSize": 87,
        "retentionRates": [
          { "period": 0, "rate": 100, "retained": 87 },
          { "period": 1, "rate": 71.3, "retained": 62 },
          { "period": 2, "rate": 65.5, "retained": 57 }
        ]
      }
    ]
  },
  "churn": {
    "churnedUsers": 234,
    "churnRate": 15.2,
    "timeline": [
      {
        "date": "2025-07-18",
        "churned": 12,
        "rate": 13.8
      }
    ]
  }
}
```

#### Cache TTL
- **Duration**: 1 hour (3600 seconds)
- **Key Pattern**: `analytics:platform:users:{period}:{granularity}`

---

### 2. Get Engagement Analytics

**Endpoint:** `platformAnalytics.getEngagement`  
**Method:** `query`  
**Access:** 🔒 Admin Only

Retrieves Daily Active Users (DAU), Monthly Active Users (MAU), session metrics, and engagement ratios.

#### Request Schema

```typescript
interface GetEngagementInput {
  period: '7d' | '30d' | '90d' | '1y';
}
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | `enum` | No | `'30d'` | Time period for analysis |

**Period Options:**
- `'7d'` - Last 7 days
- `'30d'` - Last 30 days (default)
- `'90d'` - Last 90 days
- `'1y'` - Last year

> ⚠️ **Note**: The `'all'` period option is **not** available for engagement analytics to ensure reasonable query performance.

#### Response Schema

```typescript
interface EngagementAnalytics {
  period: string;
  dateRange: {
    start: string; // ISO 8601 datetime
    end: string;   // ISO 8601 datetime
  };
  dailyActiveUsers: {
    average: number;            // Average DAU in period
    peak: number;               // Highest DAU
    timeline: Array<{
      date: string;             // YYYY-MM-DD format
      count: number;            // DAU for this date
    }>;
  };
  monthlyActiveUsers: {
    current: number;            // Current MAU (last 30 days)
    previous: number;           // Previous MAU (prior 30 days)
    growth: number;             // % growth
  };
  sessionMetrics: {
    totalSessions: number;
    averageDuration: number;    // Seconds
    medianDuration: number;     // Seconds
    sessionsPerUser: number;    // Avg sessions per user
    timeline: Array<{
      date: string;
      sessions: number;
      avgDuration: number;      // Seconds
    }>;
  };
  engagement: {
    dauToMauRatio: number;      // DAU/MAU ratio (%)
    userStickiness: number;     // Same as dauToMauRatio (%)
    avgEventsPerUser: number;   // Avg events per active user
  };
}
```

#### Example Request

```typescript
const { data, isLoading, error } = trpc.platformAnalytics.getEngagement.useQuery({
  period: '30d',
});
```

#### Example Response

```json
{
  "period": "30d",
  "dateRange": {
    "start": "2025-09-17T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "dailyActiveUsers": {
    "average": 847,
    "peak": 1203,
    "timeline": [
      { "date": "2025-09-17", "count": 823 },
      { "date": "2025-09-18", "count": 891 }
    ]
  },
  "monthlyActiveUsers": {
    "current": 3421,
    "previous": 2987,
    "growth": 14.5
  },
  "sessionMetrics": {
    "totalSessions": 18459,
    "averageDuration": 342,
    "medianDuration": 267,
    "sessionsPerUser": 5.4,
    "timeline": [
      {
        "date": "2025-09-17",
        "sessions": 612,
        "avgDuration": 328
      }
    ]
  },
  "engagement": {
    "dauToMauRatio": 24.8,
    "userStickiness": 24.8,
    "avgEventsPerUser": 37.6
  }
}
```

#### Cache TTL
- **Duration**: 30 minutes (1800 seconds)
- **Key Pattern**: `analytics:platform:engagement:{period}`

---

### 3. Get Cohort Analysis

**Endpoint:** `platformAnalytics.getCohorts`  
**Method:** `query`  
**Access:** 🔒 Admin Only

Analyzes user cohorts based on signup date with tracking for retention, revenue, or engagement metrics over time.

#### Request Schema

```typescript
interface GetCohortsInput {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  period: '30d' | '90d' | '180d' | '1y';
}
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cohortType` | `enum` | No | `'monthly'` | Cohort grouping interval |
| `metric` | `enum` | No | `'retention'` | Metric to track |
| `period` | `enum` | No | `'90d'` | Time period for cohort analysis |

**Cohort Type Options:**
- `'weekly'` - Group users by signup week
- `'monthly'` - Group users by signup month (default)

**Metric Options:**
- `'retention'` - Track user retention over time
- `'revenue'` - Track revenue generation per cohort
- `'engagement'` - Track average events per user

**Period Options:**
- `'30d'` - Last 30 days
- `'90d'` - Last 90 days (default)
- `'180d'` - Last 180 days
- `'1y'` - Last year

#### Response Schema

```typescript
interface CohortAnalysis {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  dateRange: {
    start: string; // ISO 8601 datetime
    end: string;   // ISO 8601 datetime
  };
  cohorts: Array<{
    cohortPeriod: string;       // YYYY-MM-DD of cohort start
    cohortSize: number;         // Number of users in cohort
    periods: Array<{
      period: number;           // Period offset (0, 1, 2, etc.)
      value: number;            // Metric value (varies by metric type)
      percentage: number;       // Percentage (for retention/engagement)
    }>;
  }>;
}
```

**Value Field Interpretation:**

| Metric | `value` Meaning | `percentage` Meaning |
|--------|-----------------|----------------------|
| `retention` | Number of retained users | Retention rate % |
| `revenue` | Total revenue in cents | Revenue per user % |
| `engagement` | Average events per user | Engagement rate % |

#### Example Request

```typescript
const { data, isLoading, error } = trpc.platformAnalytics.getCohorts.useQuery({
  cohortType: 'monthly',
  metric: 'retention',
  period: '180d',
});
```

#### Example Response (Retention)

```json
{
  "cohortType": "monthly",
  "metric": "retention",
  "dateRange": {
    "start": "2025-04-19T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "cohorts": [
    {
      "cohortPeriod": "2025-10-01",
      "cohortSize": 245,
      "periods": [
        { "period": 0, "value": 245, "percentage": 100.0 },
        { "period": 1, "value": 167, "percentage": 68.16 }
      ]
    },
    {
      "cohortPeriod": "2025-09-01",
      "cohortSize": 298,
      "periods": [
        { "period": 0, "value": 298, "percentage": 100.0 },
        { "period": 1, "value": 203, "percentage": 68.12 },
        { "period": 2, "value": 189, "percentage": 63.42 }
      ]
    }
  ]
}
```

#### Example Response (Revenue)

```json
{
  "cohortType": "monthly",
  "metric": "revenue",
  "dateRange": {
    "start": "2025-04-19T00:00:00.000Z",
    "end": "2025-10-17T23:59:59.999Z"
  },
  "cohorts": [
    {
      "cohortPeriod": "2025-09-01",
      "cohortSize": 298,
      "periods": [
        { "period": 0, "value": 452300, "percentage": 151.78 },
        { "period": 1, "value": 389700, "percentage": 130.77 }
      ]
    }
  ]
}
```

> 💡 **Note**: For revenue cohorts, `value` is in **cents** (USD). For revenue percentage, it represents revenue per user as a percentage of some baseline.

#### Cache TTL
- **Duration**: 2 hours (7200 seconds)
- **Key Pattern**: `analytics:platform:cohorts:{cohortType}:{metric}:{period}`

---

### 4. Invalidate Cache

**Endpoint:** `platformAnalytics.invalidateCache`  
**Method:** `mutation`  
**Access:** 🔒 Admin Only

Manually invalidates cached analytics data. Useful after bulk data imports, corrections, or to force fresh calculations.

#### Request Schema

```typescript
interface InvalidateCacheInput {
  scope: 'users' | 'engagement' | 'cohorts' | 'all';
}
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `scope` | `enum` | No | `'all'` | Cache scope to invalidate |

**Scope Options:**
- `'users'` - Clear user analytics cache only
- `'engagement'` - Clear engagement analytics cache only
- `'cohorts'` - Clear cohort analysis cache only
- `'all'` - Clear all platform analytics cache (default)

#### Response Schema

```typescript
interface InvalidateCacheResponse {
  success: boolean;
  message: string;
}
```

#### Example Request

```typescript
const invalidateCacheMutation = trpc.platformAnalytics.invalidateCache.useMutation();

// Invalidate all cache
await invalidateCacheMutation.mutateAsync({ scope: 'all' });

// Invalidate specific scope
await invalidateCacheMutation.mutateAsync({ scope: 'users' });
```

#### Example Response

```json
{
  "success": true,
  "message": "Cache invalidated for scope: all"
}
```

---

## TypeScript Type Definitions

### Complete Type Definitions for Frontend

```typescript
// ============================================
// REQUEST TYPES
// ============================================

/**
 * User Analytics Request
 */
export interface GetUsersInput {
  period: '7d' | '30d' | '90d' | '1y' | 'all';
  granularity: 'daily' | 'weekly' | 'monthly';
}

/**
 * Engagement Analytics Request
 */
export interface GetEngagementInput {
  period: '7d' | '30d' | '90d' | '1y';
}

/**
 * Cohort Analysis Request
 */
export interface GetCohortsInput {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  period: '30d' | '90d' | '180d' | '1y';
}

/**
 * Cache Invalidation Request
 */
export interface InvalidateCacheInput {
  scope: 'users' | 'engagement' | 'cohorts' | 'all';
}

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Date Range
 */
export interface DateRange {
  start: string; // ISO 8601 datetime
  end: string;   // ISO 8601 datetime
}

/**
 * User Analytics Response
 */
export interface UserAnalytics {
  period: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  dateRange: DateRange;
  acquisition: AcquisitionMetrics;
  retention: RetentionMetrics;
  churn: ChurnMetrics;
}

export interface AcquisitionMetrics {
  newUsers: number;
  newUsersGrowth: number;
  timeline: AcquisitionTimelinePoint[];
}

export interface AcquisitionTimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
  cumulative: number;
}

export interface RetentionMetrics {
  overall: number; // Overall retention rate (%)
  cohorts: RetentionCohort[];
}

export interface RetentionCohort {
  cohortPeriod: string; // YYYY-MM-DD
  cohortSize: number;
  retentionRates: RetentionRate[];
}

export interface RetentionRate {
  period: number;   // Period offset (0, 1, 2, etc.)
  rate: number;     // Retention rate (%)
  retained: number; // Number of retained users
}

export interface ChurnMetrics {
  churnedUsers: number;
  churnRate: number;
  timeline: ChurnTimelinePoint[];
}

export interface ChurnTimelinePoint {
  date: string; // YYYY-MM-DD
  churned: number;
  rate: number; // Churn rate (%)
}

/**
 * Engagement Analytics Response
 */
export interface EngagementAnalytics {
  period: string;
  dateRange: DateRange;
  dailyActiveUsers: DailyActiveUsersMetrics;
  monthlyActiveUsers: MonthlyActiveUsersMetrics;
  sessionMetrics: SessionMetrics;
  engagement: EngagementRatios;
}

export interface DailyActiveUsersMetrics {
  average: number;
  peak: number;
  timeline: DailyActiveUsersPoint[];
}

export interface DailyActiveUsersPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface MonthlyActiveUsersMetrics {
  current: number;
  previous: number;
  growth: number; // Percentage
}

export interface SessionMetrics {
  totalSessions: number;
  averageDuration: number;   // Seconds
  medianDuration: number;    // Seconds
  sessionsPerUser: number;
  timeline: SessionTimelinePoint[];
}

export interface SessionTimelinePoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  avgDuration: number; // Seconds
}

export interface EngagementRatios {
  dauToMauRatio: number;    // Percentage
  userStickiness: number;   // Percentage (same as dauToMauRatio)
  avgEventsPerUser: number;
}

/**
 * Cohort Analysis Response
 */
export interface CohortAnalysis {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  dateRange: DateRange;
  cohorts: Cohort[];
}

export interface Cohort {
  cohortPeriod: string; // YYYY-MM-DD
  cohortSize: number;
  periods: CohortPeriod[];
}

export interface CohortPeriod {
  period: number;       // Period offset (0, 1, 2, etc.)
  value: number;        // Varies by metric type
  percentage: number;   // Percentage value
}

/**
 * Cache Invalidation Response
 */
export interface InvalidateCacheResponse {
  success: boolean;
  message: string;
}

// ============================================
// UTILITY TYPES
// ============================================

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export type UserAnalyticsPeriod = '7d' | '30d' | '90d' | '1y' | 'all';

export type EngagementPeriod = '7d' | '30d' | '90d' | '1y';

export type CohortPeriod = '30d' | '90d' | '180d' | '1y';

export type CohortType = 'weekly' | 'monthly';

export type CohortMetric = 'retention' | 'revenue' | 'engagement';

export type CacheScope = 'users' | 'engagement' | 'cohorts' | 'all';
```

### Zod Schemas (for Frontend Validation)

```typescript
import { z } from 'zod';

/**
 * Request Schemas
 */
export const getUsersInputSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

export const getEngagementInputSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

export const getCohortsInputSchema = z.object({
  cohortType: z.enum(['weekly', 'monthly']).default('monthly'),
  metric: z.enum(['retention', 'revenue', 'engagement']).default('retention'),
  period: z.enum(['30d', '90d', '180d', '1y']).default('90d'),
});

export const invalidateCacheInputSchema = z.object({
  scope: z.enum(['users', 'engagement', 'cohorts', 'all']).default('all'),
});
```

---

## Business Logic & Validation Rules

### Period Selection Rules

1. **User Analytics**
   - Supports all periods including `'all'`
   - Default: `'30d'`
   - `'all'` queries from 2020-01-01 to present

2. **Engagement Analytics**
   - Does **not** support `'all'` period (performance constraint)
   - Limited to `'7d'`, `'30d'`, `'90d'`, `'1y'`
   - Default: `'30d'`

3. **Cohort Analysis**
   - Supports `'30d'`, `'90d'`, `'180d'`, `'1y'`
   - Does **not** support `'7d'` or `'all'`
   - Default: `'90d'`

### Granularity Rules

- **Daily**: Best for short periods (7d-30d)
- **Weekly**: Optimal for 30d-90d periods
- **Monthly**: Recommended for 90d+ periods

> ⚠️ **Frontend Recommendation**: Automatically suggest appropriate granularity based on selected period to improve chart readability.

### Cohort Size Filtering

Backend automatically filters out cohorts with **less than 10 users** to ensure statistical significance. Frontend should:

- Display a message if no cohorts are returned
- Suggest selecting a longer period
- Show minimum cohort size requirement (10 users)

### Revenue Calculations

For revenue cohorts:
- All revenue values are in **cents** (USD)
- Frontend must convert to dollars: `value / 100`
- Format with 2 decimal places: `(value / 100).toFixed(2)`

### Session Duration

- Duration values are in **seconds**
- Zero-duration sessions are excluded from calculations
- Session timeout: 30 minutes of inactivity

### Churn Definition

A user is considered churned if:
- Active in the prior period (threshold varies by granularity)
- **Not** active in the current period
- Threshold periods:
  - Daily: 7 days prior
  - Weekly: 14 days prior
  - Monthly: 30 days prior

### Activity Definition

A user is considered "active" if they:
- Generated at least one event in the period
- Have a non-null `actorId` in events table
- Are not marked as deleted (`deleted_at IS NULL`)

---

## Error Handling

### HTTP Status Codes

| Status Code | TRPC Error Code | Meaning |
|-------------|-----------------|---------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Not an admin user |
| 400 | `BAD_REQUEST` | Invalid input parameters |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |

### Error Response Format

```typescript
interface TRPCError {
  message: string;
  code: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    zodError?: ZodError;
  };
}
```

### Common Error Scenarios

#### 1. Unauthorized (401)

**Cause**: No valid JWT token or expired session

```json
{
  "message": "UNAUTHORIZED",
  "code": "UNAUTHORIZED",
  "data": {
    "code": "UNAUTHORIZED",
    "httpStatus": 401,
    "path": "platformAnalytics.getUsers"
  }
}
```

**Frontend Action**:
- Redirect to login page
- Clear local session storage
- Show "Session expired" message

#### 2. Forbidden (403)

**Cause**: User is authenticated but not an admin

```json
{
  "message": "FORBIDDEN",
  "code": "FORBIDDEN",
  "data": {
    "code": "FORBIDDEN",
    "httpStatus": 403,
    "path": "platformAnalytics.getEngagement"
  }
}
```

**Frontend Action**:
- Redirect to dashboard
- Show "Admin access required" message
- Log unauthorized access attempt

#### 3. Bad Request (400)

**Cause**: Invalid parameters (e.g., unsupported period)

```json
{
  "message": "Invalid input",
  "code": "BAD_REQUEST",
  "data": {
    "code": "BAD_REQUEST",
    "httpStatus": 400,
    "path": "platformAnalytics.getEngagement",
    "zodError": {
      "issues": [
        {
          "code": "invalid_enum_value",
          "options": ["7d", "30d", "90d", "1y"],
          "path": ["period"],
          "message": "Invalid enum value. Expected '7d' | '30d' | '90d' | '1y', received 'all'"
        }
      ]
    }
  }
}
```

**Frontend Action**:
- Show validation error inline
- Highlight invalid field
- Suggest valid options

#### 4. Internal Server Error (500)

**Cause**: Database connection failure, Redis unavailable, etc.

```json
{
  "message": "Internal server error",
  "code": "INTERNAL_SERVER_ERROR",
  "data": {
    "code": "INTERNAL_SERVER_ERROR",
    "httpStatus": 500,
    "path": "platformAnalytics.getCohorts"
  }
}
```

**Frontend Action**:
- Show generic error message: "Unable to load analytics. Please try again."
- Provide retry button
- Log error to monitoring service (e.g., Sentry)

### Error Handling Implementation

```typescript
import { TRPCClientError } from '@trpc/client';

// React Query error handling
const { data, error, isError } = trpc.platformAnalytics.getUsers.useQuery(
  { period: '30d', granularity: 'daily' },
  {
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        router.push('/login');
      } else if (error.data?.code === 'FORBIDDEN') {
        toast.error('Admin access required');
        router.push('/dashboard');
      } else {
        toast.error('Failed to load analytics data');
      }
    },
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.data?.code === 'UNAUTHORIZED' || error.data?.code === 'FORBIDDEN') {
        return false;
      }
      // Retry up to 3 times for other errors
      return failureCount < 3;
    },
  }
);

// Manual error handling
try {
  const data = await trpcClient.platformAnalytics.getUsers.query({
    period: '30d',
    granularity: 'daily',
  });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        // Handle auth error
        break;
      case 'FORBIDDEN':
        // Handle permission error
        break;
      case 'BAD_REQUEST':
        // Handle validation error
        console.error(error.data?.zodError);
        break;
      default:
        // Handle generic error
        break;
    }
  }
}
```

---

## Authorization & Permissions

### Role Requirements

| Endpoint | Required Role | Field-Level Restrictions |
|----------|---------------|--------------------------|
| `getUsers` | `ADMIN` | None - full access |
| `getEngagement` | `ADMIN` | None - full access |
| `getCohorts` | `ADMIN` | None - full access |
| `invalidateCache` | `ADMIN` | None - full access |

### Authentication Flow

1. **Session Validation**
   ```typescript
   // Backend validates session in tRPC context
   const session = await getServerSession(authOptions);
   if (!session) throw new TRPCError({ code: 'UNAUTHORIZED' });
   ```

2. **Role Check**
   ```typescript
   // adminProcedure middleware enforces role
   if (ctx.session.user.role !== 'ADMIN') {
     throw new TRPCError({ code: 'FORBIDDEN' });
   }
   ```

3. **No Resource-Level Permissions**
   - Platform analytics are global (not user-specific)
   - No additional ownership checks required
   - All admins see identical data

### Frontend Permission Checks

```typescript
// Check user role before rendering admin routes
import { useSession } from 'next-auth/react';

function PlatformAnalyticsPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  if (session?.user?.role !== 'ADMIN') {
    return <AccessDenied />;
  }

  return <PlatformAnalyticsDashboard />;
}
```

### Protecting Routes

```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(req) {
    // Additional checks can go here
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Only allow admins to access /admin routes
        return token?.role === 'ADMIN';
      },
    },
  }
);

export const config = {
  matcher: ['/admin/:path*'],
};
```

---

## Rate Limiting & Quotas

### Rate Limit Configuration

| Endpoint | Limit | Window | Headers |
|----------|-------|--------|---------|
| All platform analytics endpoints | 100 requests | 1 hour | `X-RateLimit-*` |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1697558400
```

### Implementation Details

- **Strategy**: Sliding window with Redis
- **Identifier**: User ID (from JWT)
- **Scope**: Global across all analytics endpoints
- **Fail Behavior**: Fail open (allow if Redis unavailable)

### Rate Limit Response

When rate limit is exceeded:

```json
{
  "message": "Too many requests",
  "code": "TOO_MANY_REQUESTS",
  "data": {
    "code": "TOO_MANY_REQUESTS",
    "httpStatus": 429,
    "resetAt": "2025-10-17T15:30:00.000Z"
  }
}
```

### Frontend Rate Limit Handling

```typescript
const { data, error } = trpc.platformAnalytics.getUsers.useQuery(
  { period: '30d', granularity: 'daily' },
  {
    onError: (error) => {
      if (error.data?.httpStatus === 429) {
        const resetAt = new Date(error.data.resetAt);
        const minutesRemaining = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
        
        toast.error(
          `Rate limit exceeded. Please try again in ${minutesRemaining} minutes.`
        );
      }
    },
    retry: (failureCount, error) => {
      // Don't retry on rate limit
      if (error.data?.httpStatus === 429) return false;
      return failureCount < 3;
    },
  }
);
```

### Best Practices

1. **Cache on Frontend**
   ```typescript
   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 5 * 60 * 1000, // 5 minutes
         cacheTime: 10 * 60 * 1000, // 10 minutes
       },
     },
   });
   ```

2. **Batch Requests**
   - Use tRPC's batching to combine multiple queries
   - Automatically enabled with `httpBatchLink`

3. **Debounce User Input**
   ```typescript
   const debouncedFetch = useDebouncedCallback(
     (params) => refetch(params),
     500 // 500ms debounce
   );
   ```

4. **Display Rate Limit Info**
   ```typescript
   function RateLimitIndicator() {
     const headers = useRateLimitHeaders();
     
     return (
       <div>
         {headers.remaining} / {headers.limit} requests remaining
         (Resets in {formatDuration(headers.resetAt)})
       </div>
     );
   }
   ```

---

## Caching Strategy

### Backend Cache (Redis)

| Endpoint | TTL | Key Pattern |
|----------|-----|-------------|
| `getUsers` | 1 hour | `analytics:platform:users:{period}:{granularity}` |
| `getEngagement` | 30 minutes | `analytics:platform:engagement:{period}` |
| `getCohorts` | 2 hours | `analytics:platform:cohorts:{cohortType}:{metric}:{period}` |

### Frontend Cache (React Query)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes - data considered fresh
      cacheTime: 10 * 60 * 1000, // 10 minutes - cache retention
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});
```

### Cache Invalidation

#### Automatic Invalidation

Backend cache is automatically invalidated:
- After TTL expires
- When `invalidateCache` mutation is called

#### Manual Invalidation (Frontend)

```typescript
import { useQueryClient } from '@tanstack/react-query';

function RefreshButton() {
  const queryClient = useQueryClient();
  const invalidateCacheMutation = trpc.platformAnalytics.invalidateCache.useMutation();

  const handleRefresh = async () => {
    // 1. Invalidate backend cache
    await invalidateCacheMutation.mutateAsync({ scope: 'all' });
    
    // 2. Invalidate frontend cache
    await queryClient.invalidateQueries(['platformAnalytics']);
    
    toast.success('Analytics data refreshed');
  };

  return <button onClick={handleRefresh}>Refresh Data</button>;
}
```

#### Selective Invalidation

```typescript
// Invalidate only user analytics
await queryClient.invalidateQueries(['platformAnalytics', 'getUsers']);

// Invalidate specific query
await queryClient.invalidateQueries({
  queryKey: ['platformAnalytics', 'getUsers', { period: '30d', granularity: 'daily' }],
});
```

### Optimistic Cache Updates

Not applicable for analytics (read-only data). Use standard refetch patterns.

---

## Frontend Implementation Checklist

### Phase 1: Setup & Authentication

- [ ] Install tRPC React Query integration
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  ```

- [ ] Configure tRPC client with authentication headers
  ```typescript
  // lib/trpc.ts
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] Create protected admin route wrapper component

- [ ] Implement role-based access control for analytics pages

- [ ] Add middleware to protect `/admin/analytics` routes

### Phase 2: Data Fetching

- [ ] Create custom hooks for each analytics endpoint
  ```typescript
  // hooks/usePlatformAnalytics.ts
  export function useUserAnalytics(params) { ... }
  export function useEngagementAnalytics(params) { ... }
  export function useCohortAnalysis(params) { ... }
  ```

- [ ] Implement error handling for each query

- [ ] Add loading states with skeleton screens

- [ ] Configure React Query cache settings

- [ ] Test rate limiting behavior

### Phase 3: UI Components

#### User Analytics Dashboard

- [ ] Period selector dropdown (`'7d'`, `'30d'`, `'90d'`, `'1y'`, `'all'`)

- [ ] Granularity toggle (`'daily'`, `'weekly'`, `'monthly'`)

- [ ] **Acquisition Section**
  - [ ] New users count card
  - [ ] Growth percentage badge (green/red)
  - [ ] Line chart for timeline (count + cumulative)

- [ ] **Retention Section**
  - [ ] Overall retention rate card
  - [ ] Cohort retention heatmap/table
  - [ ] Period-over-period retention comparison

- [ ] **Churn Section**
  - [ ] Churned users count card
  - [ ] Churn rate percentage
  - [ ] Line chart for churn timeline

#### Engagement Analytics Dashboard

- [ ] Period selector (no `'all'` option)

- [ ] **DAU Section**
  - [ ] Average DAU card
  - [ ] Peak DAU card
  - [ ] Line chart for DAU timeline

- [ ] **MAU Section**
  - [ ] Current MAU card
  - [ ] Previous MAU card
  - [ ] Growth percentage with trend indicator

- [ ] **Session Metrics**
  - [ ] Total sessions card
  - [ ] Average duration card (formatted as MM:SS)
  - [ ] Median duration card
  - [ ] Sessions per user card
  - [ ] Timeline chart

- [ ] **Engagement Ratios**
  - [ ] DAU/MAU ratio gauge/progress bar
  - [ ] User stickiness indicator
  - [ ] Avg events per user card

#### Cohort Analysis Dashboard

- [ ] Cohort type selector (`'weekly'` / `'monthly'`)

- [ ] Metric selector (`'retention'` / `'revenue'` / `'engagement'`)

- [ ] Period selector (`'30d'`, `'90d'`, `'180d'`, `'1y'`)

- [ ] Cohort heatmap visualization
  - [ ] Rows: cohort periods
  - [ ] Columns: period offsets
  - [ ] Color gradient based on percentage
  - [ ] Tooltips with absolute values

- [ ] Cohort table view (alternative to heatmap)

- [ ] Export cohort data to CSV

### Phase 4: Data Visualization

- [ ] Choose charting library (e.g., Recharts, Chart.js, Victory)

- [ ] Create reusable chart components:
  - [ ] `LineChart` - for timelines
  - [ ] `BarChart` - for comparisons
  - [ ] `HeatMap` - for cohort analysis
  - [ ] `Gauge` - for ratios/percentages

- [ ] Implement responsive chart sizing

- [ ] Add chart legends and axis labels

- [ ] Format tooltips with proper units (%, $, time)

### Phase 5: Advanced Features

- [ ] Date range picker (alternative to presets)

- [ ] Export analytics to PDF

- [ ] Export raw data to CSV/JSON

- [ ] Comparison mode (compare two periods side-by-side)

- [ ] Scheduled email reports (admin preferences)

- [ ] Real-time dashboard refresh (WebSocket/polling)

### Phase 6: Edge Cases & Validation

- [ ] Handle empty states (no data)
  - "No users in this period"
  - "No cohorts meet minimum size requirement"

- [ ] Handle partial data
  - Show available data with disclaimer
  - Indicate incomplete cohort periods

- [ ] Validate period + granularity combinations
  - Auto-adjust granularity for optimal display
  - Show warning for suboptimal selections

- [ ] Handle timezone differences
  - Display all dates in admin's local timezone
  - Show timezone indicator

- [ ] Format numbers with locale
  ```typescript
  new Intl.NumberFormat('en-US').format(value);
  ```

- [ ] Format currency properly
  ```typescript
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
  ```

### Phase 7: Performance Optimization

- [ ] Implement virtual scrolling for large cohort tables

- [ ] Lazy load chart components

- [ ] Debounce filter changes

- [ ] Use React Query's `keepPreviousData` option for smooth transitions

- [ ] Implement pagination for cohort lists (if >10 cohorts)

### Phase 8: Testing

- [ ] Unit tests for custom hooks

- [ ] Component tests for each dashboard section

- [ ] Integration tests for data flow

- [ ] E2E tests for admin user journey

- [ ] Test error states (401, 403, 429, 500)

- [ ] Test with mock data (various scenarios)

### Phase 9: Documentation

- [ ] Add JSDoc comments to all hooks

- [ ] Create component storybook

- [ ] Write admin user guide

- [ ] Document troubleshooting steps

---

## Example Implementations

### Complete User Analytics Hook

```typescript
// hooks/usePlatformAnalytics.ts
import { trpc } from '@/lib/trpc';
import type { GetUsersInput, UserAnalytics } from '@/types/analytics';

export function useUserAnalytics(params: GetUsersInput) {
  return trpc.platformAnalytics.getUsers.useQuery(params, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    onError: (error) => {
      console.error('Failed to load user analytics:', error);
    },
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.data?.code === 'UNAUTHORIZED' || error.data?.code === 'FORBIDDEN') {
        return false;
      }
      return failureCount < 3;
    },
  });
}
```

### User Analytics Dashboard Component

```typescript
// components/admin/UserAnalyticsDashboard.tsx
import { useState } from 'react';
import { useUserAnalytics } from '@/hooks/usePlatformAnalytics';
import type { GetUsersInput } from '@/types/analytics';

export function UserAnalyticsDashboard() {
  const [params, setParams] = useState<GetUsersInput>({
    period: '30d',
    granularity: 'daily',
  });

  const { data, isLoading, error } = useUserAnalytics(params);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!data) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">User Analytics</h1>
        
        <div className="flex gap-4">
          <PeriodSelector
            value={params.period}
            onChange={(period) => setParams({ ...params, period })}
          />
          <GranularityToggle
            value={params.granularity}
            onChange={(granularity) => setParams({ ...params, granularity })}
          />
        </div>
      </div>

      {/* Acquisition Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4">User Acquisition</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            title="New Users"
            value={data.acquisition.newUsers.toLocaleString()}
            change={data.acquisition.newUsersGrowth}
          />
          <MetricCard
            title="Period"
            value={params.period}
          />
          <MetricCard
            title="Date Range"
            value={formatDateRange(data.dateRange)}
          />
        </div>
        
        <AcquisitionChart
          data={data.acquisition.timeline}
          granularity={params.granularity}
        />
      </section>

      {/* Retention Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4">User Retention</h2>
        <MetricCard
          title="Overall Retention Rate"
          value={`${data.retention.overall.toFixed(1)}%`}
        />
        
        <RetentionCohortTable cohorts={data.retention.cohorts} />
      </section>

      {/* Churn Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4">User Churn</h2>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            title="Churned Users"
            value={data.churn.churnedUsers.toLocaleString()}
          />
          <MetricCard
            title="Churn Rate"
            value={`${data.churn.churnRate.toFixed(1)}%`}
          />
        </div>
        
        <ChurnChart data={data.churn.timeline} />
      </section>
    </div>
  );
}
```

### Metric Card Component

```typescript
// components/admin/MetricCard.tsx
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number; // Percentage change
  icon?: React.ReactNode;
}

export function MetricCard({ title, value, change, icon }: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      
      {change !== undefined && (
        <div className="mt-4 flex items-center">
          <ChangeIndicator value={change} />
          <span className="text-sm text-gray-600 ml-2">
            vs previous period
          </span>
        </div>
      )}
    </div>
  );
}

function ChangeIndicator({ value }: { value: number }) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  
  return (
    <span
      className={`
        flex items-center text-sm font-medium
        ${isPositive ? 'text-green-600' : ''}
        ${isNegative ? 'text-red-600' : ''}
        ${value === 0 ? 'text-gray-600' : ''}
      `}
    >
      {isPositive && '↑'}
      {isNegative && '↓'}
      {value === 0 && '→'}
      <span className="ml-1">{Math.abs(value).toFixed(1)}%</span>
    </span>
  );
}
```

### Acquisition Timeline Chart

```typescript
// components/admin/AcquisitionChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AcquisitionTimelinePoint } from '@/types/analytics';

interface AcquisitionChartProps {
  data: AcquisitionTimelinePoint[];
  granularity: 'daily' | 'weekly' | 'monthly';
}

export function AcquisitionChart({ data, granularity }: AcquisitionChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mt-4">
      <h3 className="text-lg font-semibold mb-4">New Users Over Time</h3>
      
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => formatDateTick(date, granularity)}
          />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          
          <Tooltip
            labelFormatter={(date) => formatDate(date)}
            formatter={(value: number) => value.toLocaleString()}
          />
          
          <Legend />
          
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="count"
            stroke="#3B82F6"
            name="New Users"
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            stroke="#10B981"
            name="Cumulative"
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatDateTick(date: string, granularity: string): string {
  const d = new Date(date);
  switch (granularity) {
    case 'daily':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'weekly':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'monthly':
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    default:
      return date;
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
```

### Cohort Heatmap Component

```typescript
// components/admin/CohortHeatmap.tsx
import type { Cohort } from '@/types/analytics';

interface CohortHeatmapProps {
  cohorts: Cohort[];
  metric: 'retention' | 'revenue' | 'engagement';
}

export function CohortHeatmap({ cohorts, metric }: CohortHeatmapProps) {
  const maxPeriods = Math.max(...cohorts.map(c => c.periods.length));
  
  return (
    <div className="bg-white rounded-lg shadow p-6 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Cohort Analysis Heatmap</h3>
      
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left">Cohort</th>
            <th className="px-4 py-2 text-left">Size</th>
            {Array.from({ length: maxPeriods }, (_, i) => (
              <th key={i} className="px-4 py-2 text-center">
                Period {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.cohortPeriod}>
              <td className="px-4 py-2 font-medium">
                {formatDate(cohort.cohortPeriod)}
              </td>
              <td className="px-4 py-2">{cohort.cohortSize}</td>
              {cohort.periods.map((period) => (
                <td
                  key={period.period}
                  className="px-4 py-2 text-center"
                  style={{
                    backgroundColor: getHeatmapColor(period.percentage, metric),
                  }}
                >
                  <div className="text-sm font-medium">
                    {formatValue(period.value, metric)}
                  </div>
                  <div className="text-xs text-gray-600">
                    {period.percentage.toFixed(1)}%
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getHeatmapColor(percentage: number, metric: string): string {
  // Green scale for retention/engagement, blue for revenue
  const baseColor = metric === 'revenue' ? 'blue' : 'green';
  const intensity = Math.floor((percentage / 100) * 5);
  
  const colors = {
    green: [
      '#F0FDF4', // 0-20%
      '#DCFCE7', // 20-40%
      '#BBF7D0', // 40-60%
      '#86EFAC', // 60-80%
      '#22C55E', // 80-100%
    ],
    blue: [
      '#EFF6FF',
      '#DBEAFE',
      '#BFDBFE',
      '#93C5FD',
      '#3B82F6',
    ],
  };
  
  return colors[baseColor][Math.min(intensity, 4)];
}

function formatValue(value: number, metric: string): string {
  switch (metric) {
    case 'revenue':
      return `$${(value / 100).toFixed(2)}`;
    case 'engagement':
      return value.toFixed(1);
    case 'retention':
      return value.toString();
    default:
      return value.toString();
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}
```

### Cache Invalidation Button

```typescript
// components/admin/RefreshAnalyticsButton.tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

export function RefreshAnalyticsButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const invalidateCacheMutation = trpc.platformAnalytics.invalidateCache.useMutation();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // 1. Invalidate backend cache
      await invalidateCacheMutation.mutateAsync({ scope: 'all' });
      
      // 2. Invalidate frontend React Query cache
      await queryClient.invalidateQueries(['platformAnalytics']);
      
      toast.success('Analytics data refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh analytics data');
      console.error('Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {isRefreshing ? (
        <>
          <Spinner className="w-4 h-4" />
          Refreshing...
        </>
      ) : (
        <>
          <RefreshIcon className="w-4 h-4" />
          Refresh Data
        </>
      )}
    </button>
  );
}
```

---

## Additional Resources

### Related Documentation

- [Authentication Implementation Guide](./AUTH_IMPLEMENTATION.md)
- [tRPC Setup & Configuration](../infrastructure/trpc-setup.md)
- [React Query Best Practices](../infrastructure/react-query-patterns.md)

### External Resources

- [tRPC Documentation](https://trpc.io/docs)
- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [Recharts Documentation](https://recharts.org/)
- [NextAuth.js Documentation](https://next-auth.js.org/)

### Support

For questions or issues:
1. Check existing documentation
2. Review backend implementation in `src/modules/analytics/`
3. Contact backend team lead
4. File issue in GitHub repository

---

**Document Version:** 1.0  
**Last Reviewed:** October 17, 2025  
**Next Review:** November 17, 2025
