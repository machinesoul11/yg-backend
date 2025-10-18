# 🔒 Revenue Analytics API - Frontend Integration Guide

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

> **Last Updated:** October 17, 2025  
> **Backend Deployment:** ops.yesgoddess.agency  
> **Module Status:** ✅ Completed & Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request & Response Schemas](#request--response-schemas)
5. [Authentication & Authorization](#authentication--authorization)
6. [Business Logic & Validation Rules](#business-logic--validation-rules)
7. [Error Handling](#error-handling)
8. [Caching Strategy](#caching-strategy)
9. [Rate Limiting](#rate-limiting)
10. [Frontend Implementation Guide](#frontend-implementation-guide)
11. [React Query Implementation Examples](#react-query-implementation-examples)
12. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)
13. [Testing Checklist](#testing-checklist)

---

## Overview

The Revenue Analytics API provides comprehensive platform-wide financial analytics for admin users. This module enables deep insights into Monthly Recurring Revenue (MRR), Annual Recurring Revenue (ARR), transaction performance, and customer lifetime value (LTV).

### Key Features

- **Revenue Metrics:** Real-time MRR/ARR tracking with growth analysis
- **Transaction Analytics:** Volume and value analysis across payment methods
- **Lifetime Value:** Customer LTV calculations with cohort analysis
- **Historical Data:** Time-series data for charting and trend analysis
- **Breakdown Analysis:** Revenue segmentation by type (new, expansion, contraction, churn)
- **Performance Indicators:** Success rates, refund rates, average transaction values

### Technology Stack

- **Protocol:** tRPC (Type-safe RPC)
- **Transport:** HTTP/HTTPS
- **Data Format:** JSON (with SuperJSON for advanced types)
- **Caching:** Redis-backed with automatic invalidation
- **Authentication:** JWT via NextAuth.js

---

## API Endpoints

All endpoints are **admin-only** and use the tRPC protocol. Base URL: `https://ops.yesgoddess.agency/api/trpc`

### 1. Revenue Metrics Endpoint

**Endpoint:** `analytics.platform.getRevenue`  
**Method:** `query` (GET-like)  
**Purpose:** Calculate MRR, ARR, growth metrics, and revenue breakdown

**tRPC Call Pattern:**
```typescript
const result = await trpc.analytics.platform.getRevenue.query({
  startDate: '2024-01-01T00:00:00.000Z', // Optional
  endDate: '2024-12-31T23:59:59.999Z',   // Optional
  groupBy: 'monthly'                      // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
});
```

**HTTP Equivalent:**
```bash
GET /api/trpc/analytics.platform.getRevenue?input={"json":{"startDate":"2024-01-01T00:00:00.000Z","endDate":"2024-12-31T23:59:59.999Z","groupBy":"monthly"}}
```

---

### 2. Transaction Analytics Endpoint

**Endpoint:** `analytics.platform.getTransactions`  
**Method:** `query` (GET-like)  
**Purpose:** Analyze transaction volume, value, and payment method performance

**tRPC Call Pattern:**
```typescript
const result = await trpc.analytics.platform.getTransactions.query({
  startDate: '2024-10-01T00:00:00.000Z', // Optional
  endDate: '2024-10-31T23:59:59.999Z',   // Optional
  status: 'all',                          // 'all' | 'completed' | 'pending' | 'failed' | 'refunded'
  groupBy: 'daily'                        // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
});
```

**HTTP Equivalent:**
```bash
GET /api/trpc/analytics.platform.getTransactions?input={"json":{"startDate":"2024-10-01T00:00:00.000Z","endDate":"2024-10-31T23:59:59.999Z","status":"all","groupBy":"daily"}}
```

---

### 3. Lifetime Value Analytics Endpoint

**Endpoint:** `analytics.platform.getLTV`  
**Method:** `query` (GET-like)  
**Purpose:** Calculate customer lifetime value with cohort and segment analysis

**tRPC Call Pattern:**
```typescript
const result = await trpc.analytics.platform.getLTV.query({
  startDate: '2024-01-01T00:00:00.000Z', // Optional
  endDate: '2024-12-31T23:59:59.999Z',   // Optional
  segmentBy: 'cohort'                     // 'role' | 'cohort' | undefined
});
```

**HTTP Equivalent:**
```bash
GET /api/trpc/analytics.platform.getLTV?input={"json":{"startDate":"2024-01-01T00:00:00.000Z","endDate":"2024-12-31T23:59:59.999Z","segmentBy":"cohort"}}
```

---

### 4. Cache Invalidation Endpoint

**Endpoint:** `analytics.platform.invalidateCache`  
**Method:** `mutation` (POST-like)  
**Purpose:** Manually invalidate cached analytics data

**tRPC Call Pattern:**
```typescript
await trpc.analytics.platform.invalidateCache.mutate({
  scope: 'all' // 'revenue' | 'transactions' | 'ltv' | 'all'
});
```

---

## TypeScript Type Definitions

Copy these definitions into your frontend codebase (e.g., `@/types/analytics.ts`):

```typescript
/**
 * ============================================
 * REVENUE ANALYTICS TYPE DEFINITIONS
 * ============================================
 */

/**
 * Date Range Interface
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Period Type for Data Grouping
 */
export type GroupByPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Transaction Status Filter Options
 */
export type TransactionStatusFilter = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';

/**
 * ============================================
 * REVENUE METRICS RESPONSE
 * ============================================
 */
export interface RevenueMetrics {
  period: {
    start: string; // ISO 8601 date string
    end: string;   // ISO 8601 date string
  };
  mrr: {
    current: number;          // Monthly Recurring Revenue in cents
    previous: number;         // Previous period MRR in cents
    growth: number;           // Growth percentage (e.g., 15.5 = 15.5%)
    growthAbsolute: number;   // Absolute change in cents
  };
  arr: {
    current: number;          // Annual Recurring Revenue in cents (MRR * 12)
    previous: number;         // Previous period ARR in cents
    growth: number;           // Growth percentage
    growthAbsolute: number;   // Absolute change in cents
  };
  breakdown: {
    newMrr: number;           // MRR from new subscriptions (cents)
    expansionMrr: number;     // MRR from upgrades (cents)
    contractionMrr: number;   // MRR lost from downgrades (cents)
    churnedMrr: number;       // MRR lost from cancellations (cents)
  };
  historicalData: Array<{
    date: string;             // ISO 8601 date string
    mrr: number;              // MRR for this date (cents)
    arr: number;              // ARR for this date (cents)
    newCustomers: number;     // Number of new customers
    churnedCustomers: number; // Number of churned customers
  }>;
}

/**
 * ============================================
 * TRANSACTION ANALYTICS RESPONSE
 * ============================================
 */
export interface TransactionAnalytics {
  period: {
    start: string; // ISO 8601 date string
    end: string;   // ISO 8601 date string
  };
  volume: {
    total: number;        // Total number of transactions
    successful: number;   // Completed transactions
    failed: number;       // Failed transactions
    refunded: number;     // Refunded transactions
    pending: number;      // Pending transactions
    successRate: number;  // Percentage (0-100)
    failureRate: number;  // Percentage (0-100)
    refundRate: number;   // Percentage (0-100)
  };
  value: {
    totalCents: number;      // Total transaction value in cents
    averageCents: number;    // Average transaction value in cents
    medianCents: number;     // Median transaction value in cents
    successfulCents: number; // Total value of successful transactions
    refundedCents: number;   // Total value of refunded transactions
    currency: string;        // Always 'USD'
  };
  byPaymentMethod: Array<{
    method: string;         // Payment method name (e.g., 'card', 'ach')
    count: number;          // Number of transactions
    totalCents: number;     // Total value in cents
    averageCents: number;   // Average transaction value
    successRate: number;    // Success rate percentage (0-100)
  }>;
  timeline: Array<{
    date: string;           // ISO 8601 date string
    count: number;          // Number of transactions
    totalCents: number;     // Total value in cents
    averageCents: number;   // Average transaction value
    successfulCount: number;// Successful transactions
    failedCount: number;    // Failed transactions
  }>;
}

/**
 * ============================================
 * LIFETIME VALUE ANALYTICS RESPONSE
 * ============================================
 */
export interface LTVAnalytics {
  period: {
    start: string; // ISO 8601 date string or 'all'
    end: string;   // ISO 8601 date string
  };
  overall: {
    averageLTVCents: number;  // Average customer LTV in cents
    medianLTVCents: number;   // Median customer LTV in cents
    totalCustomers: number;   // Total number of customers analyzed
    totalRevenueCents: number;// Total revenue from all customers
  };
  byCohort: Array<{
    cohortPeriod: string;     // YYYY-MM format (e.g., '2024-01')
    cohortSize: number;       // Number of customers in cohort
    averageLTVCents: number;  // Average LTV for cohort
    medianLTVCents: number;   // Median LTV for cohort
    totalRevenueCents: number;// Total revenue from cohort
    averageLifespanDays: number; // Average customer lifespan
  }>;
  distribution: {
    percentile25: number;     // 25th percentile LTV (cents)
    percentile50: number;     // 50th percentile LTV (cents)
    percentile75: number;     // 75th percentile LTV (cents)
    percentile90: number;     // 90th percentile LTV (cents)
    percentile95: number;     // 95th percentile LTV (cents)
  };
  bySegment: Array<{
    segment: string;          // Segment name (e.g., 'Premium Brands')
    averageLTVCents: number;  // Average LTV for segment
    customerCount: number;    // Number of customers in segment
    totalRevenueCents: number;// Total revenue from segment
  }>;
}

/**
 * ============================================
 * REQUEST INPUT SCHEMAS
 * ============================================
 */

/**
 * Revenue Metrics Request Input
 */
export interface GetPlatformRevenueAnalyticsInput {
  startDate?: string;     // ISO 8601 datetime string (optional)
  endDate?: string;       // ISO 8601 datetime string (optional)
  groupBy?: GroupByPeriod; // Default: 'monthly'
}

/**
 * Transaction Analytics Request Input
 */
export interface GetPlatformTransactionAnalyticsInput {
  startDate?: string;              // ISO 8601 datetime string (optional)
  endDate?: string;                // ISO 8601 datetime string (optional)
  status?: TransactionStatusFilter; // Default: 'all'
  groupBy?: GroupByPeriod;         // Default: 'daily'
}

/**
 * LTV Analytics Request Input
 */
export interface GetPlatformLTVAnalyticsInput {
  startDate?: string;         // ISO 8601 datetime string (optional)
  endDate?: string;           // ISO 8601 datetime string (optional)
  segmentBy?: 'role' | 'cohort'; // Optional segmentation
}

/**
 * Cache Invalidation Input
 */
export interface InvalidateCacheInput {
  scope?: 'revenue' | 'transactions' | 'ltv' | 'all'; // Default: 'all'
}

/**
 * ============================================
 * PAYMENT & LICENSE ENUMS (from Prisma)
 * ============================================
 */

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

export enum LicenseStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  ACTIVE = 'ACTIVE',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED = 'EXPIRED',
  RENEWED = 'RENEWED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
  CANCELED = 'CANCELED',
  SUSPENDED = 'SUSPENDED'
}

export enum BillingFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY'
}
```

---

## Request & Response Schemas

### Zod Validation Schemas

The backend uses Zod for runtime validation. Here are the schemas for reference:

```typescript
import { z } from 'zod';

/**
 * Revenue Analytics Request Schema
 */
export const getPlatformRevenueAnalyticsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
});

/**
 * Transaction Analytics Request Schema
 */
export const getPlatformTransactionAnalyticsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['all', 'completed', 'pending', 'failed', 'refunded']).default('all'),
  groupBy: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('daily'),
});

/**
 * LTV Analytics Request Schema
 */
export const getPlatformLTVAnalyticsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  segmentBy: z.enum(['role', 'cohort']).optional(),
});
```

### Query Parameter Format

For HTTP calls (not using tRPC client), parameters must be encoded as:

```
?input={"json":{QUERY_PARAMS}}
```

**Example:**
```
?input={"json":{"startDate":"2024-01-01T00:00:00.000Z","groupBy":"monthly"}}
```

---

## Authentication & Authorization

### Required Authentication

All revenue analytics endpoints require:

1. **Valid JWT Token** via NextAuth.js session
2. **Admin Role** - User must have `role: 'ADMIN'`

### Authorization Flow

```typescript
// Backend Authorization Check (for reference)
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
```

### Frontend Session Check

Before calling any revenue analytics endpoint, verify the user has admin access:

```typescript
import { useSession } from 'next-auth/react';

function RevenueAnalyticsDashboard() {
  const { data: session, status } = useSession();
  
  // Check authentication status
  if (status === 'loading') {
    return <LoadingSpinner />;
  }
  
  if (status === 'unauthenticated') {
    redirect('/login');
  }
  
  // Check admin role
  if (session?.user?.role !== 'ADMIN') {
    return <UnauthorizedMessage />;
  }
  
  // User is authenticated and authorized
  return <AnalyticsDashboard />;
}
```

### Error Codes

| HTTP Code | tRPC Code | Description | Action |
|-----------|-----------|-------------|--------|
| 401 | `UNAUTHORIZED` | No valid session | Redirect to login |
| 403 | `FORBIDDEN` | User is not admin | Show access denied message |
| 400 | `BAD_REQUEST` | Invalid input parameters | Show validation error |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | Show error message, retry |

---

## Business Logic & Validation Rules

### Date Range Rules

#### Default Behavior
- **Revenue Metrics:** If no dates provided, defaults to last 1 month
- **Transaction Analytics:** If no dates provided, defaults to last 30 days
- **LTV Analytics:** If no dates provided, calculates for all time

#### Validation Rules
1. **Date Format:** Must be ISO 8601 datetime string (e.g., `2024-01-01T00:00:00.000Z`)
2. **End Date:** Must be >= start date
3. **Max Range:** No explicit maximum, but very large ranges may timeout
4. **Future Dates:** End date can be in the future (returns data up to current date)

#### Date Range Calculations

```typescript
// Example: Last 30 days
const endDate = new Date().toISOString();
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

// Example: Current month
const now = new Date();
const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

// Example: Last quarter
const endDate = new Date().toISOString();
const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
```

### Revenue Calculations

#### MRR (Monthly Recurring Revenue)
- **Formula:** Sum of all active recurring licenses normalized to monthly value
- **Normalization:**
  - `MONTHLY`: Amount × 1
  - `QUARTERLY`: Amount ÷ 3
  - `SEMI_ANNUAL`: Amount ÷ 6
  - `ANNUAL`: Amount ÷ 12
  - `ONE_TIME`: Excluded from MRR
- **Status:** Only `ACTIVE` licenses included
- **Currency:** All amounts in cents (USD)

#### ARR (Annual Recurring Revenue)
- **Formula:** `MRR × 12`
- **Purpose:** Annualized revenue projection

#### Growth Calculation
```typescript
// Percentage growth
const growth = previousValue > 0 
  ? ((currentValue - previousValue) / previousValue) * 100 
  : 0;

// Absolute growth
const growthAbsolute = currentValue - previousValue;
```

#### MRR Breakdown Categories

1. **New MRR**
   - New licenses created in period
   - `parentLicenseId` must be `null` (not a renewal)
   - Status: `ACTIVE`

2. **Expansion MRR**
   - Renewals with higher fees than parent license
   - Calculated as: `currentMRR - parentMRR` (where positive)

3. **Contraction MRR**
   - Renewals with lower fees than parent license
   - Calculated as: `abs(currentMRR - parentMRR)` (where negative)

4. **Churned MRR**
   - Licenses that expired or were cancelled in period
   - Status: `EXPIRED` or `CANCELLED`

### Transaction Calculations

#### Success Rate
```typescript
const successRate = totalCount > 0 
  ? (successfulCount / totalCount) * 100 
  : 0;
```

#### Failure Rate
```typescript
const failureRate = totalCount > 0 
  ? (failedCount / totalCount) * 100 
  : 0;
```

#### Refund Rate
```typescript
const refundRate = totalCount > 0 
  ? (refundedCount / totalCount) * 100 
  : 0;
```

#### Median Calculation
- Sort all transaction amounts
- If even count: average of two middle values
- If odd count: middle value

### LTV Calculations

#### Overall LTV
- **Average LTV:** Total revenue ÷ Number of customers
- **Median LTV:** Middle value of sorted customer revenues
- **Customers:** All brands with at least 1 completed payment

#### Cohort Analysis
- **Cohort Period:** Month customer joined (YYYY-MM format)
- **Lifespan:** Days between first and last payment
- **Cohort Size:** Number of customers who joined in that month

#### Distribution Percentiles
- **25th Percentile:** 25% of customers have LTV below this value
- **50th Percentile (Median):** Half of customers above/below
- **75th Percentile:** Top 25% of customers
- **90th Percentile:** Top 10% of customers
- **95th Percentile:** Top 5% of customers (high-value customers)

### Data Filtering

#### Transaction Status Filter

| Filter Value | Included Statuses |
|--------------|-------------------|
| `all` | All payment statuses |
| `completed` | `COMPLETED` only |
| `pending` | `PENDING` only |
| `failed` | `FAILED` only |
| `refunded` | `REFUNDED` only |

#### Segmentation Options

**LTV Segmentation:**
- `cohort`: Group by month joined
- `role`: Group by user role (placeholder - returns single segment)
- `undefined`: No segmentation

---

## Error Handling

### Error Response Format

All tRPC errors follow this structure:

```typescript
interface TRPCError {
  message: string;
  code: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    zodError?: ZodError; // Only for validation errors
  };
}
```

### Common Error Scenarios

#### 1. Unauthorized Access (401)

**Cause:** No valid session  
**Error Code:** `UNAUTHORIZED`  
**Frontend Action:** Redirect to login

```typescript
try {
  const data = await trpc.analytics.platform.getRevenue.query(input);
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    router.push('/login');
  }
}
```

#### 2. Forbidden Access (403)

**Cause:** User is not admin  
**Error Code:** `FORBIDDEN`  
**User Message:** "Access denied. This feature is only available to administrators."

```typescript
try {
  const data = await trpc.analytics.platform.getRevenue.query(input);
} catch (error) {
  if (error.code === 'FORBIDDEN') {
    toast.error('Access denied. Admin privileges required.');
  }
}
```

#### 3. Validation Error (400)

**Cause:** Invalid input parameters  
**Error Code:** `BAD_REQUEST`  
**User Message:** Display specific field errors

```typescript
try {
  const data = await trpc.analytics.platform.getRevenue.query(input);
} catch (error) {
  if (error.code === 'BAD_REQUEST' && error.data?.zodError) {
    // Show field-specific errors
    const fieldErrors = error.data.zodError.fieldErrors;
    Object.entries(fieldErrors).forEach(([field, errors]) => {
      toast.error(`${field}: ${errors.join(', ')}`);
    });
  }
}
```

**Common Validation Errors:**

| Field | Error | Fix |
|-------|-------|-----|
| `startDate` | Invalid datetime | Use ISO 8601 format |
| `endDate` | Invalid datetime | Use ISO 8601 format |
| `groupBy` | Invalid enum value | Use: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly' |
| `status` | Invalid enum value | Use: 'all', 'completed', 'pending', 'failed', 'refunded' |
| `segmentBy` | Invalid enum value | Use: 'role', 'cohort', or omit |

#### 4. Server Error (500)

**Cause:** Internal server error, database error, Redis error  
**Error Code:** `INTERNAL_SERVER_ERROR`  
**User Message:** "An error occurred. Please try again."

```typescript
try {
  const data = await trpc.analytics.platform.getRevenue.query(input);
} catch (error) {
  if (error.code === 'INTERNAL_SERVER_ERROR') {
    toast.error('Server error. Please try again in a moment.');
    // Log error for debugging
    console.error('Analytics API Error:', error);
  }
}
```

#### 5. Network Timeout

**Cause:** Large date range, slow database query  
**User Message:** "Request timed out. Try a smaller date range."

```typescript
const TIMEOUT_MS = 30000; // 30 seconds

try {
  const data = await Promise.race([
    trpc.analytics.platform.getRevenue.query(input),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    )
  ]);
} catch (error) {
  if (error.message === 'TIMEOUT') {
    toast.error('Request timed out. Try a smaller date range.');
  }
}
```

### Error Recovery Strategies

1. **Retry with Exponential Backoff** (for server errors)
2. **Reduce Date Range** (for timeouts)
3. **Re-authenticate** (for auth errors)
4. **Show Cached Data** (if available)
5. **Graceful Degradation** (show partial data or placeholder)

---

## Caching Strategy

### Backend Caching

All endpoints use **Redis caching** with the following TTLs:

| Endpoint | Cache Duration | Cache Key Pattern |
|----------|---------------|-------------------|
| Revenue Metrics | 1 hour (3600s) | `analytics:revenue:{start}:{end}:{groupBy}` |
| Transaction Analytics | 30 minutes (1800s) | `analytics:transactions:{start}:{end}:{status}:{groupBy}` |
| LTV Analytics | 2 hours (7200s) | `analytics:ltv:{start}:{end}:{segment}` |

### Cache Invalidation

**Automatic Invalidation:** Cache entries expire automatically based on TTL

**Manual Invalidation:** Use the `invalidateCache` mutation:

```typescript
// Invalidate specific scope
await trpc.analytics.platform.invalidateCache.mutate({ scope: 'revenue' });

// Invalidate all analytics cache
await trpc.analytics.platform.invalidateCache.mutate({ scope: 'all' });
```

**When to Invalidate:**
- After bulk license operations
- After payment reconciliation
- After manual data corrections
- When user reports stale data

### Frontend Caching (React Query)

React Query provides automatic caching and refetching:

```typescript
const { data, isLoading, error, refetch } = trpc.analytics.platform.getRevenue.useQuery(
  input,
  {
    staleTime: 5 * 60 * 1000,      // Consider data stale after 5 minutes
    cacheTime: 30 * 60 * 1000,     // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,    // Don't refetch on window focus
    refetchOnMount: false,          // Don't refetch on component mount
    retry: 2,                       // Retry failed requests twice
  }
);
```

---

## Rate Limiting

### Current Status

**No explicit rate limiting** is currently implemented for analytics endpoints.

### Recommended Frontend Throttling

To prevent excessive requests:

```typescript
import { useMemo } from 'react';
import { debounce } from 'lodash';

function AnalyticsDashboard() {
  // Debounce filter changes
  const debouncedFetch = useMemo(
    () => debounce((filters) => {
      refetch(filters);
    }, 500),
    []
  );
  
  const handleFilterChange = (newFilters) => {
    debouncedFetch(newFilters);
  };
}
```

### Best Practices

1. **Debounce User Input:** Wait 500ms after user stops typing
2. **Batch Requests:** Fetch multiple date ranges in parallel if needed
3. **Conditional Fetching:** Only fetch when user explicitly requests
4. **Avoid Polling:** Don't auto-refresh analytics data frequently

---

## Frontend Implementation Guide

### Step 1: Setup tRPC Client

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { type AppRouter } from '@/server/routers/_app'; // Backend type export
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 2,
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: 'https://ops.yesgoddess.agency/api/trpc',
          transformer: superjson,
          headers() {
            return {
              // NextAuth session cookie is automatically included
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Step 2: Create Analytics Hook

```typescript
// hooks/useRevenueAnalytics.ts
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import type { GetPlatformRevenueAnalyticsInput, RevenueMetrics } from '@/types/analytics';

export function useRevenueAnalytics(initialInput?: GetPlatformRevenueAnalyticsInput) {
  const [input, setInput] = useState<GetPlatformRevenueAnalyticsInput>(
    initialInput || {
      groupBy: 'monthly',
    }
  );

  const query = trpc.analytics.platform.getRevenue.useQuery(input, {
    enabled: true, // Only fetch when explicitly enabled
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    setDateRange: (startDate?: string, endDate?: string) => {
      setInput(prev => ({ ...prev, startDate, endDate }));
    },
    setGroupBy: (groupBy: GetPlatformRevenueAnalyticsInput['groupBy']) => {
      setInput(prev => ({ ...prev, groupBy }));
    },
  };
}
```

### Step 3: Create UI Component

```typescript
// components/RevenueAnalyticsDashboard.tsx
'use client';

import { useRevenueAnalytics } from '@/hooks/useRevenueAnalytics';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Card } from '@/components/ui/card';
import { LineChart } from '@/components/charts/LineChart';

export function RevenueAnalyticsDashboard() {
  const { data, isLoading, isError, error, setDateRange, setGroupBy } = useRevenueAnalytics();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState 
        message="Failed to load revenue analytics" 
        error={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!data) {
    return <EmptyState message="No revenue data available" />;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <DateRangePicker 
          onChange={(range) => setDateRange(
            range?.from?.toISOString(),
            range?.to?.toISOString()
          )}
        />
        <GroupBySelector 
          value={data.groupBy} 
          onChange={setGroupBy} 
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Current MRR"
          value={formatCurrency(data.mrr.current / 100)}
          change={data.mrr.growth}
          trend={data.mrr.growth > 0 ? 'up' : 'down'}
        />
        <MetricCard
          title="Current ARR"
          value={formatCurrency(data.arr.current / 100)}
          change={data.arr.growth}
          trend={data.arr.growth > 0 ? 'up' : 'down'}
        />
        <MetricCard
          title="New MRR"
          value={formatCurrency(data.breakdown.newMrr / 100)}
          color="green"
        />
        <MetricCard
          title="Churned MRR"
          value={formatCurrency(data.breakdown.churnedMrr / 100)}
          color="red"
        />
      </div>

      {/* MRR Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>MRR Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <MRRBreakdownChart data={data.breakdown} />
        </CardContent>
      </Card>

      {/* Historical Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={data.historicalData}
            xKey="date"
            yKeys={['mrr', 'arr']}
            formatY={(value) => formatCurrency(value / 100)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 4: Add Error Boundary

```typescript
// components/AnalyticsErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AnalyticsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Analytics Error:', error, errorInfo);
    // Log to error tracking service (e.g., Sentry)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold text-red-600">Something went wrong</h2>
          <p className="mt-2 text-gray-600">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## React Query Implementation Examples

### Example 1: Revenue Dashboard with Filters

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function RevenueDashboard() {
  const [filters, setFilters] = useState({
    startDate: undefined,
    endDate: undefined,
    groupBy: 'monthly' as const,
  });

  const { data, isLoading, error } = trpc.analytics.platform.getRevenue.useQuery(filters);

  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setFilters(prev => ({ ...prev, startDate, endDate }));
  };

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return <EmptyState />;

  return (
    <div>
      <h1>Revenue Analytics</h1>
      <DateRangePicker onChange={handleDateRangeChange} />
      <MRRCard mrr={data.mrr} />
      <ARRCard arr={data.arr} />
      <BreakdownChart breakdown={data.breakdown} />
    </div>
  );
}
```

### Example 2: Transaction Analytics with Status Filter

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function TransactionAnalytics() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');

  const { data, isLoading } = trpc.analytics.platform.getTransactions.useQuery({
    status: statusFilter,
    groupBy: 'daily',
  });

  return (
    <div>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
        <option value="all">All Transactions</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>

      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          <VolumeMetrics volume={data.volume} />
          <ValueMetrics value={data.value} />
          <PaymentMethodChart methods={data.byPaymentMethod} />
          <TimelineChart timeline={data.timeline} />
        </>
      )}
    </div>
  );
}
```

### Example 3: LTV Analytics with Cohort Segmentation

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function LTVAnalytics() {
  const [segmentBy, setSegmentBy] = useState<'cohort' | undefined>('cohort');

  const { data, isLoading } = trpc.analytics.platform.getLTV.useQuery({
    segmentBy,
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Customer Lifetime Value</h1>
      
      <SegmentSelector value={segmentBy} onChange={setSegmentBy} />

      <OverallLTVCard overall={data.overall} />
      
      {segmentBy === 'cohort' && (
        <CohortTable cohorts={data.byCohort} />
      )}

      <LTVDistributionChart distribution={data.distribution} />
    </div>
  );
}
```

### Example 4: Parallel Data Fetching

```typescript
'use client';

import { trpc } from '@/lib/trpc';

export function ComprehensiveAnalyticsDashboard() {
  // Fetch all analytics data in parallel
  const revenueQuery = trpc.analytics.platform.getRevenue.useQuery({
    groupBy: 'monthly',
  });

  const transactionsQuery = trpc.analytics.platform.getTransactions.useQuery({
    status: 'all',
    groupBy: 'daily',
  });

  const ltvQuery = trpc.analytics.platform.getLTV.useQuery({
    segmentBy: 'cohort',
  });

  const isLoading = revenueQuery.isLoading || transactionsQuery.isLoading || ltvQuery.isLoading;
  const hasError = revenueQuery.error || transactionsQuery.error || ltvQuery.error;

  if (isLoading) return <FullPageLoader />;
  if (hasError) return <ErrorState />;

  return (
    <div className="grid gap-6">
      <RevenueSection data={revenueQuery.data} />
      <TransactionSection data={transactionsQuery.data} />
      <LTVSection data={ltvQuery.data} />
    </div>
  );
}
```

### Example 5: Manual Cache Invalidation

```typescript
'use client';

import { trpc } from '@/lib/trpc';

export function AnalyticsActions() {
  const utils = trpc.useUtils();
  
  const invalidateMutation = trpc.analytics.platform.invalidateCache.useMutation({
    onSuccess: () => {
      // Invalidate React Query cache
      utils.analytics.platform.getRevenue.invalidate();
      utils.analytics.platform.getTransactions.invalidate();
      utils.analytics.platform.getLTV.invalidate();
      
      toast.success('Analytics cache refreshed');
    },
    onError: (error) => {
      toast.error(`Failed to refresh: ${error.message}`);
    },
  });

  const handleRefresh = async () => {
    await invalidateMutation.mutateAsync({ scope: 'all' });
  };

  return (
    <button 
      onClick={handleRefresh} 
      disabled={invalidateMutation.isLoading}
    >
      {invalidateMutation.isLoading ? 'Refreshing...' : 'Refresh Analytics'}
    </button>
  );
}
```

---

## Edge Cases & UX Considerations

### Edge Case 1: No Data Available

**Scenario:** New platform with no transactions or licenses

**Backend Behavior:**
- Returns zero values for all metrics
- Empty arrays for historical data and timelines

**Frontend Handling:**
```typescript
function RevenueDisplay({ data }: { data: RevenueMetrics }) {
  const hasData = data.mrr.current > 0 || data.historicalData.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<ChartIcon />}
        title="No revenue data yet"
        description="Revenue analytics will appear once you have active licenses and transactions."
      />
    );
  }

  return <RevenueCharts data={data} />;
}
```

### Edge Case 2: Large Date Ranges

**Scenario:** User selects 5+ years of data

**Issues:**
- Slow query execution
- Large response payload
- Frontend rendering lag

**Mitigation:**
```typescript
function DateRangePicker({ onChange }: Props) {
  const MAX_DAYS = 365;

  const handleRangeChange = (range: DateRange) => {
    const days = differenceInDays(range.end, range.start);
    
    if (days > MAX_DAYS) {
      toast.warning(`Date range limited to ${MAX_DAYS} days. Please select a smaller range.`);
      return;
    }
    
    onChange(range);
  };

  return <DatePicker onChange={handleRangeChange} />;
}
```

### Edge Case 3: Partial Data in Period

**Scenario:** Date range includes incomplete current month

**Backend Behavior:** Includes partial data for current period

**Frontend Handling:**
```typescript
function RevenueCard({ data }: { data: RevenueMetrics }) {
  const isPartialPeriod = new Date(data.period.end) > new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current MRR</CardTitle>
        {isPartialPeriod && (
          <Badge variant="warning">Partial Period</Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">
          {formatCurrency(data.mrr.current / 100)}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Edge Case 4: Negative Growth

**Scenario:** MRR/ARR decreased compared to previous period

**Display Considerations:**
```typescript
function GrowthIndicator({ growth }: { growth: number }) {
  const isNegative = growth < 0;
  const isPositive = growth > 0;
  
  return (
    <div className={cn(
      'flex items-center gap-1',
      isPositive && 'text-green-600',
      isNegative && 'text-red-600',
      growth === 0 && 'text-gray-500'
    )}>
      {isPositive && <TrendingUpIcon />}
      {isNegative && <TrendingDownIcon />}
      {growth === 0 && <MinusIcon />}
      <span>{formatPercentage(Math.abs(growth))}</span>
    </div>
  );
}
```

### Edge Case 5: High Churn Rate

**Scenario:** `churnedMrr` > `newMrr`

**UX Consideration:** Show alert or warning

```typescript
function MRRBreakdown({ breakdown }: { breakdown: RevenueMetrics['breakdown'] }) {
  const netMRRChange = breakdown.newMrr + breakdown.expansionMrr 
    - breakdown.contractionMrr - breakdown.churnedMrr;
  
  const isNetNegative = netMRRChange < 0;

  return (
    <div>
      {isNetNegative && (
        <Alert variant="warning">
          <AlertIcon />
          <AlertTitle>Negative MRR Growth</AlertTitle>
          <AlertDescription>
            Churn and contraction exceeded new and expansion revenue this period.
          </AlertDescription>
        </Alert>
      )}
      
      <BreakdownChart data={breakdown} />
    </div>
  );
}
```

### Edge Case 6: Timezone Handling

**Backend:** All dates stored/returned in UTC

**Frontend:** Convert to user's local timezone for display

```typescript
import { formatInTimeZone } from 'date-fns-tz';

function formatDate(isoString: string, userTimezone: string = 'America/New_York') {
  return formatInTimeZone(
    new Date(isoString),
    userTimezone,
    'MMM dd, yyyy'
  );
}

function PeriodDisplay({ period }: { period: { start: string; end: string } }) {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div>
      {formatDate(period.start, userTimezone)} - {formatDate(period.end, userTimezone)}
    </div>
  );
}
```

### Edge Case 7: Currency Formatting

**Backend:** All amounts in cents (integer)

**Frontend:** Convert to dollars and format

```typescript
function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(dollars);
}

// Examples:
formatCurrency(1234567);        // "$12,345.67"
formatCompactCurrency(1234567); // "$12.3K"
```

### Edge Case 8: Zero Division

**Scenario:** Calculating percentages with zero denominator

**Backend:** Returns `0` for rates when denominator is zero

**Frontend:** Handle display

```typescript
function SuccessRateDisplay({ volume }: { volume: TransactionAnalytics['volume'] }) {
  if (volume.total === 0) {
    return <span className="text-gray-400">N/A</span>;
  }

  return (
    <span className={volume.successRate >= 95 ? 'text-green-600' : 'text-yellow-600'}>
      {volume.successRate.toFixed(1)}%
    </span>
  );
}
```

---

## Testing Checklist

### Unit Tests

- [ ] Test currency formatting (cents to dollars)
- [ ] Test percentage calculations
- [ ] Test date range validation
- [ ] Test growth calculation (positive/negative/zero)
- [ ] Test median calculation
- [ ] Test empty data handling

### Integration Tests

- [ ] Test tRPC client setup
- [ ] Test authentication flow
- [ ] Test authorization (admin-only)
- [ ] Test error handling for each error code
- [ ] Test cache invalidation
- [ ] Test parallel data fetching

### E2E Tests

- [ ] Load revenue dashboard and verify data display
- [ ] Change date range and verify data updates
- [ ] Change groupBy filter and verify chart updates
- [ ] Load transaction analytics with different status filters
- [ ] Load LTV analytics with cohort segmentation
- [ ] Test error state display (401, 403, 500)
- [ ] Test loading state display
- [ ] Test empty state display
- [ ] Test manual cache refresh
- [ ] Test large date range warning

### Visual Regression Tests

- [ ] Revenue dashboard layout
- [ ] Transaction analytics charts
- [ ] LTV distribution visualization
- [ ] Error states
- [ ] Loading states
- [ ] Empty states

### Accessibility Tests

- [ ] Keyboard navigation
- [ ] Screen reader support for data tables
- [ ] Color contrast for charts
- [ ] ARIA labels for interactive elements
- [ ] Focus management for modals/dropdowns

### Performance Tests

- [ ] Initial page load time < 2s
- [ ] Chart rendering time < 500ms
- [ ] Date filter change response < 300ms
- [ ] Large dataset handling (1+ year of data)
- [ ] Concurrent request handling

### Security Tests

- [ ] Verify admin-only access enforcement
- [ ] Test unauthorized access redirects
- [ ] Verify JWT expiration handling
- [ ] Test CORS configuration
- [ ] Verify no sensitive data in client logs

---

## Quick Reference

### Example API Calls

#### Get Revenue Metrics (Last 30 Days)
```typescript
const data = await trpc.analytics.platform.getRevenue.query({
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString(),
  groupBy: 'daily',
});
```

#### Get Transaction Analytics (Completed Only)
```typescript
const data = await trpc.analytics.platform.getTransactions.query({
  status: 'completed',
  groupBy: 'monthly',
});
```

#### Get LTV with Cohort Analysis
```typescript
const data = await trpc.analytics.platform.getLTV.query({
  segmentBy: 'cohort',
});
```

#### Refresh Analytics Cache
```typescript
await trpc.analytics.platform.invalidateCache.mutate({ scope: 'all' });
```

### Utility Functions

```typescript
// Format cents to dollars
export const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Format percentage
export const formatPercent = (value: number) => `${value.toFixed(1)}%`;

// Get last N days date range
export const getLastNDays = (days: number) => ({
  startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString(),
});

// Check if user is admin
export const isAdmin = (session: Session | null) => 
  session?.user?.role === 'ADMIN';
```

---

## Support & Resources

### Documentation
- **Backend Repo:** `yg-backend` (ops.yesgoddess.agency)
- **API Deployment:** https://ops.yesgoddess.agency/api/trpc
- **Schema Reference:** `/prisma/schema.prisma`

### Related Modules
- License Management API
- Payment Processing API
- Royalty Statements API
- Platform Analytics API (User/Engagement metrics)

### Need Help?
Contact the backend team for:
- Clarification on business logic
- Performance optimization
- New analytics requirements
- Bug reports

---

**Document Version:** 1.0  
**Last Updated:** October 17, 2025  
**Maintained By:** Backend Team  
**Status:** ✅ Complete & Production Ready
