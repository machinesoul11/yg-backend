# Creator Analytics & Revenue - Frontend Integration Guide (Part 1: API Reference)

> **Classification: ⚡ HYBRID** - Core functionality used by both admin backend (view all creators) and public-facing website (creators view their own data)

This document provides comprehensive API reference for the Creator Analytics and Revenue module in the YesGoddess platform. Part 1 covers all API endpoints and TypeScript type definitions.

---

## 🚀 Quick Start Overview

The Creator Analytics module provides revenue analytics and earnings insights for creators:
- **Revenue Analytics** - Revenue trends over time
- **Earnings Breakdown** - Earnings by project and asset
- **Earnings Forecast** - Projected future earnings based on historical data
- **Historical Data** - Detailed earnings history with customizable granularity

All endpoints are creator-specific and require authentication. Creators can only access their own data. Admin users can access any creator's data.

---

## 📋 Table of Contents

1. [Authentication Requirements](#authentication-requirements)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Query Parameters & Filtering](#query-parameters--filtering)
5. [Response Formats](#response-formats)

---

## 1. Authentication Requirements

### Base URL
- **Backend API:** `https://ops.yesgoddess.agency`
- **Endpoints:** `/api/me/royalties/*`

### Authentication Method
All endpoints require JWT authentication via HTTP Bearer token:

```typescript
headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

### User Requirements
- **Creators:** Can access only their own analytics data
- **Admins:** Can access any creator's data (requires different endpoints - not covered in this document)

### Session Management
- Session tokens are issued via Auth.js
- Token expiry: 30 days (configurable)
- Refresh tokens are not currently supported - re-authentication required

---

## 2. API Endpoints

### 2.1 Revenue Trends

#### `GET /api/me/royalties/earnings`

Get the authenticated creator's revenue analytics with earnings trends over time.

**HTTP Method:** `GET`

**URL:** `/api/me/royalties/earnings`

**Authentication:** Required (Creator only)

**Query Parameters:**
```typescript
interface EarningsQueryParams {
  date_from?: string;    // ISO 8601 date string (default: 12 months ago)
  date_to?: string;      // ISO 8601 date string (default: today)
  group_by?: 'day' | 'week' | 'month' | 'year'; // default: 'month'
}
```

**Request Example:**
```typescript
// Fetch with query params
const response = await fetch(
  '/api/me/royalties/earnings?date_from=2024-01-01&date_to=2024-12-31&group_by=month',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);
```

**Response Schema:**
```typescript
interface EarningsResponse {
  success: true;
  data: {
    summary: {
      totalEarningsCents: number;        // Total earnings in cents
      totalPaidCents: number;            // Total paid out in cents
      totalPendingCents: number;         // Total pending payments in cents
      avgEarningsPerPeriodCents: number; // Average per period
      highestEarningPeriod: {
        period: string;                  // ISO date or period string
        earningsCents: number;
      } | null;
      statementCount: number;            // Number of royalty statements
    };
    breakdown: Array<{
      period: string;                    // Period identifier (e.g., "2024-01", "2024-W01")
      earnings: number;                  // Total earnings in cents
      paid: number;                      // Paid amount in cents
      pending: number;                   // Pending amount in cents
    }>;
    topAssets: Array<{
      id: string;                        // Asset ID
      title: string;                     // Asset title
      type: string;                      // Asset type (IMAGE, VIDEO, AUDIO, etc.)
      totalEarningsCents: number;        // Total earnings from this asset
      licenseCount: number;              // Number of licenses
    }>;
    growth: {
      currentPeriodCents: number;        // Current period earnings
      previousPeriodCents: number;       // Previous period earnings
      growthRate: number;                // Growth rate as percentage
      trend: 'up' | 'down' | 'stable';   // Trend direction
    };
    period: {
      from: string;                      // ISO 8601 date
      to: string;                        // ISO 8601 date
      groupBy: 'day' | 'week' | 'month' | 'year';
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEarningsCents": 450000,
      "totalPaidCents": 350000,
      "totalPendingCents": 100000,
      "avgEarningsPerPeriodCents": 37500,
      "highestEarningPeriod": {
        "period": "2024-06",
        "earningsCents": 75000
      },
      "statementCount": 12
    },
    "breakdown": [
      {
        "period": "2024-01",
        "earnings": 35000,
        "paid": 35000,
        "pending": 0
      },
      {
        "period": "2024-02",
        "earnings": 42000,
        "paid": 42000,
        "pending": 0
      }
    ],
    "topAssets": [
      {
        "id": "asset_123",
        "title": "Summer Fashion Collection",
        "type": "IMAGE",
        "totalEarningsCents": 125000,
        "licenseCount": 15
      }
    ],
    "growth": {
      "currentPeriodCents": 42000,
      "previousPeriodCents": 35000,
      "growthRate": 20.0,
      "trend": "up"
    },
    "period": {
      "from": "2024-01-01T00:00:00.000Z",
      "to": "2024-12-31T23:59:59.999Z",
      "groupBy": "month"
    }
  }
}
```

---

### 2.2 Earnings Breakdown by Project/Asset

This endpoint provides detailed earnings breakdown and is covered by the same endpoint as Revenue Trends (section 2.1). The `topAssets` array in the response provides earnings by asset.

For project-level breakdown, you'll need to:
1. Fetch earnings data from `/api/me/royalties/earnings`
2. Use the `topAssets` array which includes asset-level earnings
3. Group assets by project client-side if needed

---

### 2.3 Earnings Forecast

#### `GET /api/me/royalties/forecast`

Get projected future earnings based on historical data using moving average and linear trend analysis.

**HTTP Method:** `GET`

**URL:** `/api/me/royalties/forecast`

**Authentication:** Required (Creator only)

**Query Parameters:**
```typescript
interface ForecastQueryParams {
  days?: string;                    // Number of days to forecast (default: '30')
  confidence_level?: 'conservative' | 'moderate' | 'optimistic'; // default: 'moderate'
}
```

**Request Example:**
```typescript
const response = await fetch(
  '/api/me/royalties/forecast?days=60&confidence_level=moderate',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);
```

**Response Schema:**
```typescript
interface ForecastResponse {
  success: true;
  data: {
    available: boolean;              // True if forecast can be generated
    message?: string;                // Only present if available is false
    requirement?: {                  // Only present if available is false
      minimumStatements: number;     // Minimum data points required
      currentStatements: number;     // Current data points available
    };
    forecast?: {                     // Only present if available is true
      periodDays: number;            // Forecast period in days
      projectedEarningsCents: number; // Projected earnings
      confidenceLevel: 'conservative' | 'moderate' | 'optimistic';
      range: {
        lowCents: number;            // Lower bound (conservative estimate)
        highCents: number;           // Upper bound (optimistic estimate)
      };
    };
    methodology?: {                  // Only present if available is true
      approach: string;              // Description of forecasting method
      historicalPeriodMonths: number; // Months of data analyzed
      dataPointsUsed: number;        // Number of statements analyzed
      confidenceNote: string;        // Explanation of confidence level
    };
    comparison?: {                   // Only present if available is true
      recentAvgMonthlyEarningsCents: number; // Recent 3-month average
      projectedVsRecentDiff: number; // Difference in cents
      projectedVsRecentPct: number;  // Difference as percentage
    };
    insights?: string[];             // Only present if available is true
  };
}
```

**Example Response (Sufficient Data):**
```json
{
  "success": true,
  "data": {
    "available": true,
    "forecast": {
      "periodDays": 30,
      "projectedEarningsCents": 45000,
      "confidenceLevel": "moderate",
      "range": {
        "lowCents": 35000,
        "highCents": 55000
      }
    },
    "methodology": {
      "approach": "Moving Average with Linear Trend",
      "historicalPeriodMonths": 12,
      "dataPointsUsed": 12,
      "confidenceNote": "Moderate forecast based on historical average with linear trend adjustment. Most likely scenario."
    },
    "comparison": {
      "recentAvgMonthlyEarningsCents": 42000,
      "projectedVsRecentDiff": 3000,
      "projectedVsRecentPct": 7
    },
    "insights": [
      "Your earnings show positive growth trend. Continue your current strategy.",
      "Your earnings are very consistent. This provides good financial predictability."
    ]
  }
}
```

**Example Response (Insufficient Data):**
```json
{
  "success": true,
  "data": {
    "available": false,
    "message": "Insufficient historical data to generate forecast. At least 3 months of earnings history is required.",
    "requirement": {
      "minimumStatements": 3,
      "currentStatements": 1
    }
  }
}
```

---

### 2.4 Historical Earnings Data

#### `GET /api/me/royalties/history`

Get detailed historical earnings data with customizable time granularity and metrics.

**HTTP Method:** `GET`

**URL:** `/api/me/royalties/history`

**Authentication:** Required (Creator only)

**Query Parameters:**
```typescript
interface HistoryQueryParams {
  from_date?: string;    // ISO 8601 date string
  to_date?: string;      // ISO 8601 date string
  granularity?: 'daily' | 'weekly' | 'monthly' | 'yearly'; // default: 'monthly'
  metrics?: string;      // Comma-separated list (optional, future feature)
}
```

**Date Range Limits:**
- **Daily:** Maximum 365 days
- **Weekly:** Maximum 730 days (2 years)
- **Monthly/Yearly:** Maximum 3650 days (10 years)

**Request Example:**
```typescript
const response = await fetch(
  '/api/me/royalties/history?from_date=2024-01-01&to_date=2024-12-31&granularity=monthly',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);
```

**Response Schema:**
```typescript
interface HistoryResponse {
  success: true;
  data: {
    summary: {
      totalEarningsCents: number;
      totalPaidCents: number;
      totalPendingCents: number;
      periodCount: number;            // Number of periods in range
    };
    periods: Array<{
      period: string;                 // Period identifier (ISO date or period string)
      earningsCents: number;          // Total earnings for period
      transactionCount: number;       // Number of transactions
      paidCount: number;              // Number of paid statements
      movingAvg3Cents: number | null; // 3-period moving average
      movingAvg6Cents: number | null; // 6-period moving average
    }>;
    period: {
      from: string;                   // ISO 8601 date
      to: string;                     // ISO 8601 date
      granularity: 'daily' | 'weekly' | 'monthly' | 'yearly';
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEarningsCents": 450000,
      "totalPaidCents": 350000,
      "totalPendingCents": 100000,
      "periodCount": 12
    },
    "periods": [
      {
        "period": "2024-01",
        "earningsCents": 35000,
        "transactionCount": 8,
        "paidCount": 1,
        "movingAvg3Cents": null,
        "movingAvg6Cents": null
      },
      {
        "period": "2024-02",
        "earningsCents": 42000,
        "transactionCount": 12,
        "paidCount": 1,
        "movingAvg3Cents": null,
        "movingAvg6Cents": null
      },
      {
        "period": "2024-03",
        "earningsCents": 38000,
        "transactionCount": 10,
        "paidCount": 1,
        "movingAvg3Cents": 38333,
        "movingAvg6Cents": null
      }
    ],
    "period": {
      "from": "2024-01-01T00:00:00.000Z",
      "to": "2024-12-31T23:59:59.999Z",
      "granularity": "monthly"
    }
  }
}
```

---

### 2.5 Comparative Analysis (Period Comparison)

Period comparison functionality is built into the `/api/me/royalties/earnings` endpoint through the `growth` object in the response. This provides:
- Current vs previous period comparison
- Growth rate percentage
- Trend indicator

For more detailed comparisons:
1. Make two separate calls to `/api/me/royalties/earnings` with different date ranges
2. Compare the `summary` and `breakdown` data client-side
3. Calculate custom metrics as needed

**Example: Comparing Q1 2024 vs Q1 2023**
```typescript
// Fetch Q1 2024
const q1_2024 = await fetch(
  '/api/me/royalties/earnings?date_from=2024-01-01&date_to=2024-03-31&group_by=month'
);

// Fetch Q1 2023
const q1_2023 = await fetch(
  '/api/me/royalties/earnings?date_from=2023-01-01&date_to=2023-03-31&group_by=month'
);

// Compare client-side
const comparison = {
  q1_2024_total: q1_2024.data.summary.totalEarningsCents,
  q1_2023_total: q1_2023.data.summary.totalEarningsCents,
  yearOverYearGrowth: ((q1_2024.data.summary.totalEarningsCents - q1_2023.data.summary.totalEarningsCents) / q1_2023.data.summary.totalEarningsCents) * 100
};
```

---

### 2.6 Royalty Statements List

#### `GET /api/me/royalties/statements`

Get paginated list of royalty statements with filtering and sorting.

**HTTP Method:** `GET`

**URL:** `/api/me/royalties/statements`

**Authentication:** Required (Creator only)

**Query Parameters:**
```typescript
interface StatementsQueryParams {
  page?: string;         // Page number (default: '1')
  limit?: string;        // Items per page, max 100 (default: '20')
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt'; // default: 'createdAt'
  sortOrder?: 'asc' | 'desc'; // default: 'desc'
  date_from?: string;    // ISO 8601 date string
  date_to?: string;      // ISO 8601 date string
}
```

**Request Example:**
```typescript
const response = await fetch(
  '/api/me/royalties/statements?page=1&limit=20&status=PAID&sortBy=paidAt&sortOrder=desc',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);
```

**Response Schema:**
```typescript
interface StatementsResponse {
  success: true;
  data: {
    statements: Array<{
      id: string;
      totalEarningsCents: number;
      status: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
      createdAt: string;              // ISO 8601 date
      paidAt: string | null;          // ISO 8601 date or null
      royaltyRun: {
        id: string;
        periodStart: string;          // ISO 8601 date
        periodEnd: string;            // ISO 8601 date
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}
```

---

## 3. TypeScript Type Definitions

Create these interfaces in your frontend codebase (e.g., `types/creator-analytics.ts`):

```typescript
// ============================================================================
// Query Parameter Types
// ============================================================================

export interface EarningsQueryParams {
  date_from?: string;
  date_to?: string;
  group_by?: 'day' | 'week' | 'month' | 'year';
}

export interface ForecastQueryParams {
  days?: string;
  confidence_level?: 'conservative' | 'moderate' | 'optimistic';
}

export interface HistoryQueryParams {
  from_date?: string;
  to_date?: string;
  granularity?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  metrics?: string;
}

export interface StatementsQueryParams {
  page?: string;
  limit?: string;
  status?: RoyaltyStatementStatus;
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
  date_from?: string;
  date_to?: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface EarningsResponse {
  success: true;
  data: {
    summary: EarningsSummary;
    breakdown: EarningsPeriod[];
    topAssets: TopAsset[];
    growth: GrowthMetrics;
    period: PeriodInfo;
  };
}

export interface EarningsSummary {
  totalEarningsCents: number;
  totalPaidCents: number;
  totalPendingCents: number;
  avgEarningsPerPeriodCents: number;
  highestEarningPeriod: {
    period: string;
    earningsCents: number;
  } | null;
  statementCount: number;
}

export interface EarningsPeriod {
  period: string;
  earnings: number;
  paid: number;
  pending: number;
}

export interface TopAsset {
  id: string;
  title: string;
  type: AssetType;
  totalEarningsCents: number;
  licenseCount: number;
}

export interface GrowthMetrics {
  currentPeriodCents: number;
  previousPeriodCents: number;
  growthRate: number;
  trend: 'up' | 'down' | 'stable';
}

export interface PeriodInfo {
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month' | 'year';
}

export interface ForecastResponse {
  success: true;
  data: {
    available: boolean;
    message?: string;
    requirement?: {
      minimumStatements: number;
      currentStatements: number;
    };
    forecast?: ForecastData;
    methodology?: ForecastMethodology;
    comparison?: ForecastComparison;
    insights?: string[];
  };
}

export interface ForecastData {
  periodDays: number;
  projectedEarningsCents: number;
  confidenceLevel: 'conservative' | 'moderate' | 'optimistic';
  range: {
    lowCents: number;
    highCents: number;
  };
}

export interface ForecastMethodology {
  approach: string;
  historicalPeriodMonths: number;
  dataPointsUsed: number;
  confidenceNote: string;
}

export interface ForecastComparison {
  recentAvgMonthlyEarningsCents: number;
  projectedVsRecentDiff: number;
  projectedVsRecentPct: number;
}

export interface HistoryResponse {
  success: true;
  data: {
    summary: HistorySummary;
    periods: HistoryPeriod[];
    period: PeriodInfo;
  };
}

export interface HistorySummary {
  totalEarningsCents: number;
  totalPaidCents: number;
  totalPendingCents: number;
  periodCount: number;
}

export interface HistoryPeriod {
  period: string;
  earningsCents: number;
  transactionCount: number;
  paidCount: number;
  movingAvg3Cents: number | null;
  movingAvg6Cents: number | null;
}

export interface StatementsResponse {
  success: true;
  data: {
    statements: RoyaltyStatement[];
    pagination: PaginationInfo;
  };
}

export interface RoyaltyStatement {
  id: string;
  totalEarningsCents: number;
  status: RoyaltyStatementStatus;
  createdAt: string;
  paidAt: string | null;
  royaltyRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
  };
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================================================
// Enum Types
// ============================================================================

export type RoyaltyStatementStatus = 
  | 'PENDING'
  | 'REVIEWED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'PAID';

export type AssetType = 
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'MODEL_3D'
  | 'OTHER';

export type TimeGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type ConfidenceLevel = 'conservative' | 'moderate' | 'optimistic';

export type TrendDirection = 'up' | 'down' | 'stable';

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  success: false;
  error: string;
  message: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

export interface ValidationError extends ApiError {
  error: 'Validation error';
  details: Array<{
    field: string;
    message: string;
  }>;
}

export interface AuthError extends ApiError {
  error: 'Unauthorized';
}

export interface NotFoundError extends ApiError {
  error: 'Not found';
}

export interface ServerError extends ApiError {
  error: 'Internal server error';
}

// ============================================================================
// Utility Types
// ============================================================================

export type ApiResponse<T> = T | ApiError;

// Type guard to check if response is an error
export function isApiError(response: any): response is ApiError {
  return response.success === false && 'error' in response;
}

// Format cents to dollars
export function formatCentsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Format cents to currency
export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
```

---

## 4. Query Parameters & Filtering

### Date Filtering

All date parameters accept **ISO 8601** format strings:
- ✅ `2024-01-01`
- ✅ `2024-01-01T00:00:00Z`
- ✅ `2024-01-01T00:00:00.000Z`
- ❌ `01/01/2024` (US format - NOT supported)
- ❌ `2024-1-1` (missing zero padding - will work but not recommended)

**Best Practice:**
```typescript
// Use Date.toISOString() for consistency
const dateFrom = new Date('2024-01-01').toISOString();
const dateTo = new Date().toISOString();
```

### Time Granularity

| Granularity | Use Case | Default Range | Max Range |
|-------------|----------|---------------|-----------|
| `daily` | Detailed short-term analysis | 90 days | 365 days |
| `weekly` | Medium-term trends | 6 months | 2 years |
| `monthly` | Long-term analysis (most common) | 12 months | 10 years |
| `yearly` | Historical overview | 5 years | 10 years |

### Pagination

- **Default page size:** 20 items
- **Maximum page size:** 100 items
- **Page numbering:** 1-indexed (first page is 1, not 0)

---

## 5. Response Formats

### Currency Values

**All monetary values are in cents (integer)**

- `totalEarningsCents: 450000` = $4,500.00
- `projectedEarningsCents: 35000` = $350.00

**Why cents?**
- Avoids floating-point precision errors
- Ensures consistency across systems
- Simplifies database storage

**Frontend Display:**
```typescript
function displayCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Example: displayCurrency(450000) => "$4,500.00"
```

### Date Formats

**All dates are returned in ISO 8601 format:**
- `2024-01-15T14:30:00.000Z` (timestamps)
- `2024-01` (monthly periods)
- `2024-W03` (weekly periods)
- `2024-01-15` (daily periods)

**Frontend Display:**
```typescript
// Format for display
const date = new Date('2024-01-15T14:30:00.000Z');
const formatted = date.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
// Output: "January 15, 2024"
```

### Null vs Undefined

- **`null`**: Explicitly empty value (e.g., `paidAt: null` means not yet paid)
- **`undefined`**: Field not present (e.g., optional query parameters)
- **Missing fields**: Indicates optional data not included in response

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Implementation Guide](./CREATOR_ANALYTICS_INTEGRATION_GUIDE_PART_2_BUSINESS_LOGIC.md)** - Validation rules, error handling, authorization
- **[Part 3: Frontend Implementation Examples](./CREATOR_ANALYTICS_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)** - React Query examples, implementation checklist

---

## Support

For questions or issues:
1. Check Part 2 for business logic and validation rules
2. Check Part 3 for implementation examples
3. Review error responses in this document
4. Contact backend team for clarification

**Last Updated:** October 17, 2025
