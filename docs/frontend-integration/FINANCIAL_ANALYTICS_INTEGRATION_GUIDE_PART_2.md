# 🌐 Financial Analytics - Frontend Integration Guide (Part 2 of 2)

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

> **Module:** Analytics Data Collection - Financial Analytics API  
> **Last Updated:** October 17, 2025  
> **Backend Version:** v1.0  
> **Deployment:** ops.yesgoddess.agency

---

## 📋 Table of Contents

- [Business Logic & Validation Rules](#business-logic--validation-rules)
- [Error Handling](#error-handling)
- [Rate Limiting & Quotas](#rate-limiting--quotas)
- [Caching Strategy](#caching-strategy)
- [Frontend Implementation Guide](#frontend-implementation-guide)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Business Logic & Validation Rules

### Date Range Handling

#### Default Behavior

```typescript
// When no dates provided, defaults are applied
const DEFAULT_LOOKBACK_DAYS = {
  spendAnalysis: 365,        // Last 12 months
  budgetUtilization: 365,    // Last 12 months
  costPerMetric: 365         // Last 12 months
};
```

#### Date Parsing Logic

```typescript
function parseDateRange(
  startDate?: string,
  endDate?: string,
  defaultDays: number = 90
): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate 
    ? new Date(startDate) 
    : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
  
  return { start, end };
}
```

#### Validation Rules

```typescript
// Frontend validation before API call
function validateDateRange(startDate: string, endDate: string): string[] {
  const errors: string[] = [];
  
  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Check valid dates
  if (isNaN(start.getTime())) {
    errors.push('Invalid start date format. Use ISO 8601 (e.g., 2025-01-01T00:00:00Z)');
  }
  
  if (isNaN(end.getTime())) {
    errors.push('Invalid end date format. Use ISO 8601 (e.g., 2025-12-31T23:59:59Z)');
  }
  
  // Check logical order
  if (start >= end) {
    errors.push('Start date must be before end date');
  }
  
  // Check max range (optional business rule)
  const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 730) { // 2 years max
    errors.push('Date range cannot exceed 2 years');
  }
  
  return errors;
}
```

### Monetary Value Calculations

All monetary values in the API are in **cents** (smallest currency unit) to avoid floating-point precision issues.

#### Conversion Functions

```typescript
/**
 * Convert cents to dollars for display
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as currency string
 */
export function formatCurrency(
  cents: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(dollars);
}

/**
 * Format large numbers with abbreviations
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// Example usage
const totalSpendCents = 125000000; // $1,250,000.00
formatCurrency(totalSpendCents); // "$1,250,000.00"
formatLargeNumber(totalSpendCents / 100); // "1.3M"
```

### Budget Status Logic

#### Status Determination

```typescript
type BudgetStatus = 'under_budget' | 'on_budget' | 'over_budget' | 'at_risk' | 'no_budget';

function determineBudgetStatus(
  budgetCents: number,
  spentCents: number,
  alertThreshold: number = 90
): BudgetStatus {
  // No budget set
  if (budgetCents === 0) {
    return 'no_budget';
  }
  
  // Calculate utilization percentage
  const utilization = (spentCents / budgetCents) * 100;
  
  // Determine status
  if (utilization > 100) {
    return 'over_budget';
  } else if (utilization >= alertThreshold) {
    return 'at_risk';
  } else if (utilization >= 90 && utilization < 100) {
    return 'on_budget';
  } else {
    return 'under_budget';
  }
}

// UI color mapping
const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  'under_budget': '#10b981',  // green
  'on_budget': '#3b82f6',     // blue
  'at_risk': '#f59e0b',       // amber/warning
  'over_budget': '#ef4444',   // red
  'no_budget': '#6b7280',     // gray
};

// UI icon mapping
const BUDGET_STATUS_ICONS: Record<BudgetStatus, string> = {
  'under_budget': 'check-circle',
  'on_budget': 'info-circle',
  'at_risk': 'exclamation-triangle',
  'over_budget': 'x-circle',
  'no_budget': 'question-circle',
};
```

### Cost Per Metric Calculations

#### Null Handling for Statistical Significance

Cost-per-metric values return `null` when the event count is below the `minThreshold` to ensure statistical significance.

```typescript
/**
 * Calculate cost per metric with threshold check
 */
function calculateCostPerMetric(
  costCents: number,
  eventCount: number,
  minThreshold: number = 100
): number | null {
  // Return null if insufficient data
  if (eventCount < minThreshold) {
    return null;
  }
  
  // Avoid division by zero
  if (eventCount === 0) {
    return null;
  }
  
  // Return cost in cents per event
  return costCents / eventCount;
}

// Display logic
function displayCostPerMetric(costPerMetric: number | null): string {
  if (costPerMetric === null) {
    return 'Insufficient data';
  }
  
  // Display in cents with 2 decimal places
  return `${(costPerMetric * 100).toFixed(2)}¢`;
}
```

#### Efficiency Score Calculation

```typescript
/**
 * Calculate efficiency score (0-100 scale)
 * Lower cost per view = higher efficiency
 */
function calculateEfficiencyScore(
  costPerView: number | null,
  views: number,
  minThreshold: number = 100
): number {
  // No score if insufficient data
  if (costPerView === null || views < minThreshold) {
    return 0;
  }
  
  // Inverse relationship: lower cost = higher score
  // Assumes base cost is 10 cents per view
  const baselineCost = 0.10;
  const score = Math.max(0, 100 - (costPerView / baselineCost) * 100);
  
  return Math.round(score);
}

// Visual representation
function getEfficiencyGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
```

### Period-Over-Period Comparison

#### Trend Calculation

```typescript
/**
 * Calculate period-over-period change
 */
interface PeriodComparison {
  change: number;           // Absolute change
  changePercentage: number; // Percentage change
  trend: 'up' | 'down' | 'flat';
}

function calculatePeriodChange(
  currentValue: number,
  previousValue: number
): PeriodComparison {
  const change = currentValue - previousValue;
  const changePercentage = previousValue > 0 
    ? (change / previousValue) * 100 
    : 0;
  
  let trend: 'up' | 'down' | 'flat';
  if (Math.abs(changePercentage) < 1) {
    trend = 'flat';
  } else if (changePercentage > 0) {
    trend = 'up';
  } else {
    trend = 'down';
  }
  
  return { change, changePercentage, trend };
}

// Display component
function TrendIndicator({ comparison }: { comparison: PeriodComparison }) {
  const { changePercentage, trend } = comparison;
  
  const icon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const color = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600';
  
  return (
    <span className={color}>
      {icon} {Math.abs(changePercentage).toFixed(1)}%
    </span>
  );
}
```

### Data Completeness

The `metadata.dataCompleteness` field indicates the quality of the dataset.

```typescript
/**
 * Interpret data completeness score
 */
function getDataCompletenessStatus(completeness: number): {
  status: 'excellent' | 'good' | 'fair' | 'poor';
  message: string;
  color: string;
} {
  if (completeness >= 95) {
    return {
      status: 'excellent',
      message: 'Complete dataset available',
      color: 'green'
    };
  } else if (completeness >= 80) {
    return {
      status: 'good',
      message: 'Most data available',
      color: 'blue'
    };
  } else if (completeness >= 60) {
    return {
      status: 'fair',
      message: 'Some data missing',
      color: 'yellow'
    };
  } else {
    return {
      status: 'poor',
      message: 'Limited data available',
      color: 'red'
    };
  }
}
```

---

## Error Handling

### Error Response Format

All errors follow the tRPC error format:

```typescript
interface TRPCError {
  code: string;           // Error code
  message: string;        // Human-readable message
  data?: {
    code: string;         // Application-specific code
    httpStatus: number;   // HTTP status code
    path?: string;        // API path
    stack?: string;       // Stack trace (dev only)
  };
}
```

### HTTP Status Codes

| Status | Code | Meaning | Action |
|--------|------|---------|--------|
| 400 | `BAD_REQUEST` | Invalid input parameters | Show validation errors to user |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication | Redirect to login |
| 403 | `FORBIDDEN` | Insufficient permissions | Show permission denied message |
| 404 | `NOT_FOUND` | Brand not found | Show "brand not found" message |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded | Show rate limit message with retry time |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | Show generic error, log to monitoring |
| 503 | `SERVICE_UNAVAILABLE` | Temporary service issue | Show retry message |

### Error Scenarios by Endpoint

#### Spend Analysis Errors

| Scenario | Code | Message | Frontend Action |
|----------|------|---------|-----------------|
| Invalid brand ID | `BAD_REQUEST` | "Invalid brand ID format" | Validate ID format before calling |
| Brand not found | `NOT_FOUND` | "Brand not found" | Show "Brand doesn't exist" |
| No permission | `FORBIDDEN` | "You do not have permission to view analytics for this brand" | Show permission denied |
| Invalid date range | `BAD_REQUEST` | "Start date must be before end date" | Validate dates before calling |
| Empty date range | `BAD_REQUEST` | "Date range cannot be empty" | Ensure dates are provided |

#### Budget Utilization Errors

| Scenario | Code | Message | Frontend Action |
|----------|------|---------|-----------------|
| Invalid threshold | `BAD_REQUEST` | "Alert threshold must be between 0 and 100" | Validate threshold (0-100) |
| Invalid project status | `BAD_REQUEST` | "Invalid project status" | Use enum values only |

#### Cost Per Metric Errors

| Scenario | Code | Message | Frontend Action |
|----------|------|---------|-----------------|
| Invalid metric type | `BAD_REQUEST` | "Invalid metric type" | Use enum values only |
| Invalid groupBy | `BAD_REQUEST` | "Invalid groupBy dimension" | Use enum values only |
| Negative threshold | `BAD_REQUEST` | "minThreshold must be >= 0" | Validate threshold is positive |
| No tracking data | `200` (Success with warning) | Returns empty arrays with dataQuality info | Show "No tracking data available" message |

### Error Handling Implementation

```typescript
/**
 * Custom error handler for financial analytics
 */
async function handleFinancialAnalyticsError(error: unknown): Promise<void> {
  // Type guard for tRPC errors
  if (error && typeof error === 'object' && 'code' in error) {
    const trpcError = error as TRPCError;
    
    switch (trpcError.code) {
      case 'UNAUTHORIZED':
        // Redirect to login
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
        break;
        
      case 'FORBIDDEN':
        // Show permission error
        toast.error('You do not have permission to view this analytics data');
        break;
        
      case 'NOT_FOUND':
        // Show not found error
        toast.error('Brand not found');
        break;
        
      case 'BAD_REQUEST':
        // Show validation error
        toast.error(trpcError.message || 'Invalid request parameters');
        break;
        
      case 'TOO_MANY_REQUESTS':
        // Show rate limit error with retry info
        const retryAfter = trpcError.data?.retryAfter || 60;
        toast.error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
        break;
        
      case 'INTERNAL_SERVER_ERROR':
        // Log to monitoring and show generic error
        console.error('Financial Analytics API Error:', trpcError);
        // logToSentry(trpcError);
        toast.error('An unexpected error occurred. Please try again later.');
        break;
        
      default:
        // Unknown error
        console.error('Unknown error:', trpcError);
        toast.error('An error occurred. Please try again.');
    }
  } else {
    // Non-tRPC error (network, etc.)
    console.error('Network or unknown error:', error);
    toast.error('Unable to connect to the server. Please check your internet connection.');
  }
}

// Usage with React Query
const { data, error, isLoading } = useQuery({
  queryKey: ['spendAnalysis', brandId, dateRange],
  queryFn: () => trpc.brandAnalytics.getSpendAnalysis.query({
    id: brandId,
    startDate: dateRange.start,
    endDate: dateRange.end,
  }),
  onError: handleFinancialAnalyticsError,
  retry: (failureCount, error) => {
    // Don't retry on client errors
    const trpcError = error as TRPCError;
    if (['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(trpcError.code)) {
      return false;
    }
    // Retry up to 3 times for server errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

### User-Friendly Error Messages

Map technical errors to user-friendly messages:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication
  'UNAUTHORIZED': 'Please log in to view analytics.',
  'FORBIDDEN': 'You don\'t have permission to view this brand\'s analytics. Contact your brand administrator.',
  
  // Not Found
  'NOT_FOUND': 'This brand could not be found. It may have been deleted.',
  
  // Validation
  'INVALID_BRAND_ID': 'Invalid brand identifier provided.',
  'INVALID_DATE_RANGE': 'Please select a valid date range.',
  'INVALID_PROJECT_STATUS': 'Invalid project status selected.',
  
  // Rate Limiting
  'TOO_MANY_REQUESTS': 'You\'ve made too many requests. Please wait a moment and try again.',
  
  // Server Errors
  'INTERNAL_SERVER_ERROR': 'Something went wrong on our end. Our team has been notified.',
  'SERVICE_UNAVAILABLE': 'Analytics service is temporarily unavailable. Please try again in a few minutes.',
  
  // Data Issues
  'NO_DATA': 'No analytics data available for the selected period.',
  'INSUFFICIENT_DATA': 'Not enough data to generate insights. Try selecting a longer date range.',
};
```

---

## Rate Limiting & Quotas

### Rate Limit Configuration

Each endpoint has specific rate limits to prevent abuse and ensure fair usage:

| Endpoint | Limit | Window | Per |
|----------|-------|--------|-----|
| `getSpendAnalysis` | 100 requests | 1 hour | Brand ID |
| `getBudgetUtilization` | 150 requests | 1 hour | Brand ID |
| `getCostPerMetric` | 100 requests | 1 hour | Brand ID |

### Rate Limit Headers

The API returns rate limit information in response headers (when available):

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697539200
```

### Checking Rate Limits

```typescript
/**
 * Parse rate limit headers from response
 */
interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  resetInSeconds: number;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  
  if (!limit || !remaining || !reset) {
    return null;
  }
  
  const resetTimestamp = parseInt(reset, 10);
  const resetAt = new Date(resetTimestamp * 1000);
  const resetInSeconds = Math.max(0, Math.floor((resetAt.getTime() - Date.now()) / 1000));
  
  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt,
    resetInSeconds,
  };
}

// Display component
function RateLimitWarning({ rateLimitInfo }: { rateLimitInfo: RateLimitInfo }) {
  const percentUsed = ((rateLimitInfo.limit - rateLimitInfo.remaining) / rateLimitInfo.limit) * 100;
  
  // Show warning when 80% of quota used
  if (percentUsed < 80) {
    return null;
  }
  
  return (
    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
      <p className="text-sm text-yellow-800">
        ⚠️ Rate limit warning: {rateLimitInfo.remaining} of {rateLimitInfo.limit} requests remaining.
        Resets in {Math.ceil(rateLimitInfo.resetInSeconds / 60)} minutes.
      </p>
    </div>
  );
}
```

### Handling Rate Limit Errors

```typescript
/**
 * Handle rate limit exceeded error
 */
function handleRateLimitExceeded(error: TRPCError): void {
  const resetAt = error.data?.resetAt;
  
  if (resetAt) {
    const resetDate = new Date(resetAt);
    const secondsUntilReset = Math.max(0, Math.floor((resetDate.getTime() - Date.now()) / 1000));
    const minutesUntilReset = Math.ceil(secondsUntilReset / 60);
    
    toast.error(
      `Rate limit exceeded. Please try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}.`,
      {
        duration: 10000, // Show for 10 seconds
      }
    );
  } else {
    toast.error('Rate limit exceeded. Please try again in a few minutes.');
  }
}
```

### Rate Limit Best Practices

1. **Cache Aggressively**: Use the cached responses (TTL 30-60 minutes) to avoid redundant requests
2. **Implement Request Deduplication**: Prevent multiple simultaneous requests for the same data
3. **Use Loading States**: Show loading indicators to prevent users from clicking multiple times
4. **Implement Exponential Backoff**: When rate limited, wait before retrying
5. **Monitor Usage**: Display rate limit status to users when approaching limits

```typescript
// Request deduplication with React Query
const { data } = useQuery({
  queryKey: ['spendAnalysis', brandId, dateRange],
  queryFn: () => fetchSpendAnalysis(brandId, dateRange),
  staleTime: 30 * 60 * 1000, // Consider data fresh for 30 minutes
  cacheTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  // Prevents duplicate requests
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
```

---

## Caching Strategy

### Cache TTL by Endpoint

| Endpoint | Backend Cache TTL | Recommended Frontend Cache |
|----------|-------------------|---------------------------|
| `getSpendAnalysis` | 1 hour | 30 minutes |
| `getBudgetUtilization` | 30 minutes | 15 minutes |
| `getCostPerMetric` | 30 minutes | 15 minutes |

### Cache Keys

The backend generates cache keys based on all query parameters:

```typescript
// Backend cache key format
const cacheKey = `brand:${brandId}:${endpoint}:${startDate}:${endDate}:${...otherParams}`;

// Examples:
// "brand:clx123:spend-analysis:2025-01-01T00:00:00Z:2025-10-01T00:00:00Z:month:project,creator"
// "brand:clx123:budget-utilization:2025-01-01T00:00:00Z:2025-10-01T00:00:00Z:ACTIVE:90"
// "brand:clx123:cost-per-metric:2025-01-01T00:00:00Z:2025-10-01T00:00:00Z:view,click:asset:100"
```

### Cache Invalidation

Caches should be invalidated when:

1. **New license created**: Invalidate spend and cost metrics
2. **Project budget updated**: Invalidate budget utilization
3. **License deleted**: Invalidate all analytics
4. **User requests fresh data**: Use cache busting parameter

```typescript
// Manual cache invalidation with React Query
const queryClient = useQueryClient();

function invalidateAnalyticsCache(brandId: string) {
  // Invalidate all analytics queries for this brand
  queryClient.invalidateQueries(['spendAnalysis', brandId]);
  queryClient.invalidateQueries(['budgetUtilization', brandId]);
  queryClient.invalidateQueries(['costPerMetric', brandId]);
}

// Trigger after license creation
async function createLicense(data: LicenseInput) {
  const result = await trpc.licenses.create.mutate(data);
  invalidateAnalyticsCache(data.brandId);
  return result;
}
```

### Frontend Caching with React Query

```typescript
// Recommended React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Financial analytics queries
      staleTime: 15 * 60 * 1000,      // 15 minutes
      cacheTime: 30 * 60 * 1000,      // 30 minutes
      refetchOnWindowFocus: false,    // Don't refetch on window focus
      refetchOnReconnect: true,       // Refetch on reconnect
      retry: 2,                       // Retry failed requests twice
    },
  },
});

// Specific query configuration
const { data } = useQuery({
  queryKey: ['spendAnalysis', brandId, dateRange],
  queryFn: () => fetchSpendAnalysis(brandId, dateRange),
  staleTime: 30 * 60 * 1000,  // Override: 30 minutes for spend analysis
  cacheTime: 60 * 60 * 1000,  // Override: 1 hour in cache
});
```

---

## Frontend Implementation Guide

### Step-by-Step Integration

#### 1. Setup tRPC Client

```typescript
// src/lib/trpc.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app'; // Import from backend

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/trpc',
      headers() {
        const token = localStorage.getItem('auth_token');
        return {
          authorization: token ? `Bearer ${token}` : '',
        };
      },
    }),
  ],
});

export { trpc };
```

#### 2. Create React Query Hooks

```typescript
// src/hooks/useFinancialAnalytics.ts
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import type {
  GetSpendAnalysisInput,
  SpendAnalysisResponse,
  GetBudgetUtilizationInput,
  BudgetUtilizationResponse,
  GetCostPerMetricInput,
  CostPerMetricResponse,
} from '@/types/api/financial-analytics';

/**
 * Hook: Spend Analysis
 */
export function useSpendAnalysis(
  input: GetSpendAnalysisInput,
  options?: UseQueryOptions<SpendAnalysisResponse>
) {
  return useQuery({
    queryKey: ['spendAnalysis', input],
    queryFn: () => trpc.brandAnalytics.getSpendAnalysis.query(input),
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    enabled: !!input.id, // Only run if brand ID exists
    ...options,
  });
}

/**
 * Hook: Budget Utilization
 */
export function useBudgetUtilization(
  input: GetBudgetUtilizationInput,
  options?: UseQueryOptions<BudgetUtilizationResponse>
) {
  return useQuery({
    queryKey: ['budgetUtilization', input],
    queryFn: () => trpc.brandAnalytics.getBudgetUtilization.query(input),
    staleTime: 15 * 60 * 1000, // 15 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!input.id,
    ...options,
  });
}

/**
 * Hook: Cost Per Metric
 */
export function useCostPerMetric(
  input: GetCostPerMetricInput,
  options?: UseQueryOptions<CostPerMetricResponse>
) {
  return useQuery({
    queryKey: ['costPerMetric', input],
    queryFn: () => trpc.brandAnalytics.getCostPerMetric.query(input),
    staleTime: 15 * 60 * 1000, // 15 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!input.id,
    ...options,
  });
}
```

#### 3. Create UI Components

```typescript
// src/components/analytics/SpendAnalysisDashboard.tsx
import React, { useState } from 'react';
import { useSpendAnalysis } from '@/hooks/useFinancialAnalytics';
import { formatCurrency, formatLargeNumber } from '@/lib/format';

interface Props {
  brandId: string;
}

export function SpendAnalysisDashboard({ brandId }: Props) {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  });
  
  const { data, isLoading, error } = useSpendAnalysis({
    id: brandId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: 'month',
    groupBy: ['project', 'creator'],
  });
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return <ErrorDisplay error={error} />;
  }
  
  if (!data) {
    return <NoDataMessage />;
  }
  
  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <DateRangeSelector value={dateRange} onChange={setDateRange} />
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Spend"
          value={formatCurrency(data.totalSpendCents)}
          subtitle={`${data.trends.totalTransactions} transactions`}
        />
        <SummaryCard
          title="Average Transaction"
          value={formatCurrency(data.trends.averageTransactionCents)}
          trend={data.trends.periodOverPeriodPercentage}
        />
        <SummaryCard
          title="Peak Spending"
          value={formatCurrency(data.trends.peakSpendingAmount)}
          subtitle={data.trends.peakSpendingDate 
            ? new Date(data.trends.peakSpendingDate).toLocaleDateString()
            : 'N/A'
          }
        />
      </div>
      
      {/* Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProjectSpendChart data={data.breakdown.byProject} />
        <CreatorSpendChart data={data.breakdown.byCreator} />
      </div>
      
      {/* Time Series */}
      <SpendTimeSeriesChart data={data.timeSeries} />
    </div>
  );
}
```

#### 4. Form Validation

```typescript
// src/components/analytics/DateRangeSelector.tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start < end;
}, {
  message: 'Start date must be before end date',
  path: ['startDate'],
});

type DateRangeFormData = z.infer<typeof dateRangeSchema>;

export function DateRangeSelector({ value, onChange }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<DateRangeFormData>({
    resolver: zodResolver(dateRangeSchema),
    defaultValues: value,
  });
  
  const onSubmit = (data: DateRangeFormData) => {
    onChange(data);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">Start Date</label>
        <input
          type="datetime-local"
          {...register('startDate')}
          className="border rounded px-3 py-2"
        />
        {errors.startDate && (
          <p className="text-red-600 text-sm mt-1">{errors.startDate.message}</p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">End Date</label>
        <input
          type="datetime-local"
          {...register('endDate')}
          className="border rounded px-3 py-2"
        />
        {errors.endDate && (
          <p className="text-red-600 text-sm mt-1">{errors.endDate.message}</p>
        )}
      </div>
      
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 self-end"
      >
        Apply
      </button>
    </form>
  );
}
```

---

## Frontend Implementation Checklist

### 🎯 Core Features

- [ ] **Setup**
  - [ ] Install tRPC client (`@trpc/client`)
  - [ ] Install React Query (`@tanstack/react-query`)
  - [ ] Configure tRPC client with backend URL
  - [ ] Setup authentication header injection
  - [ ] Configure React Query client with cache settings

- [ ] **Type Definitions**
  - [ ] Copy all TypeScript types from Part 1
  - [ ] Create `src/types/api/financial-analytics.ts`
  - [ ] Verify all types compile without errors
  - [ ] Export types for use across application

- [ ] **API Client Layer**
  - [ ] Create React Query hooks for all 3 endpoints
  - [ ] Implement error handling for each hook
  - [ ] Configure cache timing per endpoint
  - [ ] Add loading and error states

### 📊 Spend Analysis Feature

- [ ] **UI Components**
  - [ ] Create SpendAnalysisDashboard component
  - [ ] Build date range selector with validation
  - [ ] Implement summary cards (total spend, avg transaction, peak)
  - [ ] Create project spend breakdown chart (pie/bar chart)
  - [ ] Create creator spend breakdown chart
  - [ ] Create license type distribution visualization
  - [ ] Implement time series chart for spend trends

- [ ] **Business Logic**
  - [ ] Format monetary values (cents to dollars)
  - [ ] Calculate and display period-over-period changes
  - [ ] Handle empty/null data gracefully
  - [ ] Implement export functionality (CSV/PDF)

- [ ] **Validation**
  - [ ] Validate date ranges before API call
  - [ ] Ensure brand ID is valid CUID
  - [ ] Validate granularity and groupBy options

### 💰 Budget Utilization Feature

- [ ] **UI Components**
  - [ ] Create BudgetUtilizationDashboard component
  - [ ] Build portfolio overview cards
  - [ ] Create project budget table with status indicators
  - [ ] Implement budget status badges (color-coded)
  - [ ] Create monthly utilization trend chart
  - [ ] Build projected depletion timeline
  - [ ] Create alerts section (warnings/critical)

- [ ] **Business Logic**
  - [ ] Calculate and display utilization percentages
  - [ ] Determine budget status colors/icons
  - [ ] Format remaining budget (handle negative values)
  - [ ] Calculate days until budget depletion
  - [ ] Sort projects by budget status severity

- [ ] **Validation**
  - [ ] Validate alert threshold (0-100)
  - [ ] Validate project status enum values
  - [ ] Handle projects with no budget set

### 📈 Cost Per Metric Feature

- [ ] **UI Components**
  - [ ] Create CostPerMetricDashboard component
  - [ ] Build summary metrics cards (CPV, CPC, CPConv, CPE)
  - [ ] Create asset efficiency table with scores
  - [ ] Create project cost efficiency comparison
  - [ ] Create creator cost analysis view
  - [ ] Implement efficiency trend chart
  - [ ] Build insights/recommendations section
  - [ ] Create data quality indicator

- [ ] **Business Logic**
  - [ ] Handle null values for insufficient data
  - [ ] Display "Insufficient data" message when appropriate
  - [ ] Calculate and display efficiency scores (0-100)
  - [ ] Calculate efficiency grades (A-F)
  - [ ] Format cost per metric values (cents)
  - [ ] Sort by efficiency score (highest to lowest)

- [ ] **Validation**
  - [ ] Validate metrics array values
  - [ ] Validate groupBy dimension
  - [ ] Validate minThreshold is positive
  - [ ] Handle tracking coverage < 50%

### 🚨 Error Handling

- [ ] **Error States**
  - [ ] Create ErrorDisplay component
  - [ ] Map tRPC error codes to user messages
  - [ ] Handle 401 (redirect to login)
  - [ ] Handle 403 (show permission denied)
  - [ ] Handle 404 (show brand not found)
  - [ ] Handle 429 (show rate limit message)
  - [ ] Handle 500 (show generic error + log)

- [ ] **User Feedback**
  - [ ] Implement toast notifications for errors
  - [ ] Show retry button for recoverable errors
  - [ ] Display helpful error messages
  - [ ] Log errors to monitoring service (e.g., Sentry)

### ⚡ Performance & UX

- [ ] **Loading States**
  - [ ] Implement skeleton loaders for all views
  - [ ] Show loading spinners during data fetch
  - [ ] Disable actions during loading
  - [ ] Implement optimistic UI updates where applicable

- [ ] **Caching**
  - [ ] Configure React Query cache times
  - [ ] Implement cache invalidation on relevant mutations
  - [ ] Add manual refresh button
  - [ ] Display last updated timestamp
  - [ ] Show "cached data" indicator

- [ ] **Rate Limiting**
  - [ ] Parse and display rate limit headers
  - [ ] Show rate limit warning at 80% usage
  - [ ] Disable buttons when rate limited
  - [ ] Display countdown until rate limit reset

### 🎨 UI/UX Enhancements

- [ ] **Responsive Design**
  - [ ] Mobile-friendly layouts
  - [ ] Responsive charts and tables
  - [ ] Touch-friendly controls
  - [ ] Optimized for tablets

- [ ] **Accessibility**
  - [ ] Keyboard navigation support
  - [ ] Screen reader labels (ARIA)
  - [ ] Color contrast compliance (WCAG AA)
  - [ ] Focus indicators

- [ ] **Data Visualization**
  - [ ] Choose appropriate chart types
  - [ ] Implement interactive charts (hover tooltips)
  - [ ] Color-code by status/severity
  - [ ] Add chart legends and labels
  - [ ] Implement chart export (PNG/SVG)

### 🧪 Testing

- [ ] **Unit Tests**
  - [ ] Test date range validation
  - [ ] Test monetary formatting functions
  - [ ] Test budget status calculation
  - [ ] Test efficiency score calculation
  - [ ] Test error handling logic

- [ ] **Integration Tests**
  - [ ] Test React Query hooks
  - [ ] Test API error scenarios
  - [ ] Test cache behavior
  - [ ] Test rate limit handling

- [ ] **E2E Tests**
  - [ ] Test complete user flows
  - [ ] Test date range selection
  - [ ] Test chart interactions
  - [ ] Test error recovery

### 📝 Documentation

- [ ] **Code Documentation**
  - [ ] Add JSDoc comments to all functions
  - [ ] Document component props
  - [ ] Document complex business logic
  - [ ] Add inline comments for clarity

- [ ] **User Documentation**
  - [ ] Create user guide for analytics dashboard
  - [ ] Document metric calculations
  - [ ] Explain budget status meanings
  - [ ] Provide troubleshooting tips

### 🚀 Deployment

- [ ] **Environment Configuration**
  - [ ] Configure API URL for staging/production
  - [ ] Setup authentication token management
  - [ ] Configure error logging service
  - [ ] Setup analytics tracking

- [ ] **Monitoring**
  - [ ] Add error tracking (Sentry, etc.)
  - [ ] Monitor API response times
  - [ ] Track user engagement metrics
  - [ ] Setup alerts for critical errors

---

## Edge Cases to Handle

### 1. No Data Available

```typescript
// When brand has no licenses or spending
if (!data || data.timeSeries.length === 0) {
  return (
    <EmptyState
      icon="📊"
      title="No Financial Data Yet"
      description="Once you start licensing content, financial analytics will appear here."
      action={
        <Button onClick={() => navigate('/licenses/create')}>
          Create Your First License
        </Button>
      }
    />
  );
}
```

### 2. Partial Data

```typescript
// When some breakdowns are empty
if (data.breakdown.byCreator.length === 0) {
  return (
    <div className="p-4 bg-gray-50 rounded">
      <p className="text-gray-600">
        No creator data available. Creator breakdown will appear once licenses are associated with creators.
      </p>
    </div>
  );
}
```

### 3. Insufficient Tracking Data

```typescript
// When dataQuality.trackingCoverage < 50%
if (data.dataQuality.trackingCoverage < 50) {
  return (
    <Alert severity="warning">
      <AlertTitle>Limited Tracking Coverage</AlertTitle>
      Only {data.dataQuality.trackingCoverage.toFixed(0)}% of assets have tracking data.
      Cost-per-metric calculations may be inaccurate. Consider implementing tracking for all assets.
    </Alert>
  );
}
```

### 4. Over-Budget Projects

```typescript
// Highlight over-budget projects prominently
const overBudgetProjects = data.projects.filter(p => p.budgetStatus === 'over_budget');

if (overBudgetProjects.length > 0) {
  return (
    <Alert severity="error">
      <AlertTitle>Budget Alerts</AlertTitle>
      {overBudgetProjects.length} project{overBudgetProjects.length > 1 ? 's are' : ' is'} over budget.
      <Button onClick={() => scrollToProject(overBudgetProjects[0].projectId)}>
        View Details
      </Button>
    </Alert>
  );
}
```

### 5. Stale Cached Data

```typescript
// Display last updated time
const minutesSinceUpdate = Math.floor(
  (Date.now() - new Date(data.metadata.calculatedAt).getTime()) / 60000
);

return (
  <div className="flex items-center gap-2 text-sm text-gray-500">
    <ClockIcon className="w-4 h-4" />
    Last updated: {minutesSinceUpdate < 1 ? 'Just now' : `${minutesSinceUpdate} minutes ago`}
    <button
      onClick={() => refetch()}
      className="text-blue-600 hover:underline"
    >
      Refresh
    </button>
  </div>
);
```

---

## Quick Reference

### Common Patterns

```typescript
// Format monetary values
formatCurrency(125000000) // "$1,250,000.00"

// Calculate percentage
(actualSpend / budget) * 100

// Determine budget status
determineBudgetStatus(budgetCents, spentCents, alertThreshold)

// Calculate cost per metric
costCents / eventCount (only if eventCount >= minThreshold)

// Format dates
new Date(isoString).toLocaleDateString()

// Handle null metrics
costPerView ?? 'Insufficient data'
```

### Useful Libraries

- **Charts**: Recharts, Chart.js, or Victory
- **Tables**: TanStack Table (React Table v8)
- **Forms**: React Hook Form + Zod
- **Dates**: date-fns or Day.js
- **Currency**: Intl.NumberFormat API
- **State Management**: React Query (TanStack Query)
- **Notifications**: react-hot-toast or sonner

---

## Support & Resources

### Backend API Documentation
- [Brand Analytics Implementation Docs](../BRAND_ANALYTICS_IMPLEMENTATION_COMPLETE.md)
- [Brand Financial Analytics Implementation](../BRAND_FINANCIAL_ANALYTICS_IMPLEMENTATION.md)

### Questions?
Contact the backend team or file an issue in the backend repository with the label `frontend-integration`.

---

**End of Frontend Integration Guide**

✅ You now have everything needed to implement the Financial Analytics UI without asking clarification questions!
