# Creator Royalty Access Module - Frontend Integration Guide

**Classification:** ⚡ HYBRID - Core functionality used by both public website (creators) and admin backend (different access levels)

## Overview

This module provides authenticated creators access to their royalty statements, earnings analytics, forecasts, historical data, and dispute functionality. All endpoints are creator-only and require authentication.

**Base URLs:**
- Creator endpoints: `/api/me/royalties/*`
- Statement actions: `/api/royalties/statements/*`

---

## 1. API Endpoints

### 1.1 Creator Statements - `GET /api/me/royalties/statements`

**Purpose:** Retrieve paginated royalty statements for authenticated creator

#### Request Schema
```typescript
interface CreatorStatementsQuery {
  page?: string;           // Default: '1'
  limit?: string;          // Default: '20', max 100  
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
  date_from?: string;      // ISO date string (YYYY-MM-DD)
  date_to?: string;        // ISO date string (YYYY-MM-DD)
}
```

#### Response Schema
```typescript
interface CreatorStatementsResponse {
  success: true;
  data: CreatorStatementSummary[];
  summary: {
    totalEarnings: number;     // cents, lifetime total
    totalPaid: number;         // cents, total paid out
    totalPending: number;      // cents, pending payment
    statementCount: number;    // total statements
  };
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface CreatorStatementSummary {
  id: string;
  period: {
    start: string;           // ISO datetime
    end: string;             // ISO datetime
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  lineItemCount: number;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfAvailable: boolean;     // True if PDF exists
  createdAt: string;
  updatedAt: string;
}
```

#### Example Request
```bash
curl -H "Authorization: Bearer <token>" \
  "https://ops.yesgoddess.agency/api/me/royalties/statements?page=1&limit=20&status=PENDING&sortBy=createdAt&sortOrder=desc"
```

---

### 1.2 Earnings Summary - `GET /api/me/royalties/earnings`

**Purpose:** Get comprehensive earnings analytics with breakdowns and growth metrics

#### Request Schema
```typescript
interface GetEarningsRequest {
  date_from?: string; // ISO date, default: 12 months ago
  date_to?: string;   // ISO date, default: now
  group_by?: 'day' | 'week' | 'month' | 'year'; // default: 'month'
}
```

#### Response Schema
```typescript
interface GetEarningsResponse {
  success: true;
  data: {
    summary: {
      totalEarningsCents: number;
      totalPaidCents: number;
      totalPendingCents: number;
      avgEarningsPerPeriodCents: number;
      highestEarningPeriod: {
        period: string;
        earningsCents: number;
      } | null;
      statementCount: number;
    };
    breakdown: Array<{
      period: string;
      earnings: number;
      paid: number;
      pending: number;
    }>;
    topAssets: Array<{
      id: string;
      title: string;
      type: string;
      totalEarningsCents: number;
      licenseCount: number;
    }>;
    growth: {
      currentPeriodCents: number;
      previousPeriodCents: number;
      growthRate: number;    // percentage
      trend: 'up' | 'down' | 'stable';
    };
    period: {
      from: string;          // ISO datetime
      to: string;            // ISO datetime
      groupBy: string;
    };
  };
}
```

#### Example Request
```bash
curl -H "Authorization: Bearer <token>" \
  "https://ops.yesgoddess.agency/api/me/royalties/earnings?date_from=2024-01-01&group_by=month"
```

---

### 1.3 Earnings Forecast - `GET /api/me/royalties/forecast`

**Purpose:** Get projected future earnings based on historical data

#### Request Schema
```typescript
interface GetForecastRequest {
  days?: string;              // Default: '30'
  confidence_level?: 'conservative' | 'moderate' | 'optimistic'; // Default: 'moderate'
}
```

#### Response Schema
```typescript
interface GetForecastResponse {
  success: true;
  data: {
    available: boolean;
    forecast?: {
      periodDays: number;
      projectedEarningsCents: number;
      confidenceLevel: string;
      range: {
        lowCents: number;
        highCents: number;
      };
    };
    methodology?: {
      approach: string;
      historicalPeriodMonths: number;
      dataPointsUsed: number;
      confidenceNote: string;
    };
    comparison?: {
      recentAvgMonthlyEarningsCents: number;
      projectedVsRecentDiff: number;
      projectedVsRecentPct: number;
    };
    insights?: string[];
    // If insufficient data:
    message?: string;
    requirement?: {
      minimumStatements: number;
      currentStatements: number;
    };
  };
}
```

#### Insufficient Data Response
When creator has < 3 statements, returns:
```typescript
{
  success: true,
  data: {
    available: false,
    message: "Insufficient historical data to generate forecast...",
    requirement: {
      minimumStatements: 3,
      currentStatements: 1
    }
  }
}
```

---

### 1.4 Historical Data - `GET /api/me/royalties/history`

**Purpose:** Get time-series historical earnings with analytics

#### Request Schema
```typescript
interface GetHistoryRequest {
  from_date?: string;   // ISO date, default: 24 months ago
  to_date?: string;     // ISO date, default: now
  granularity?: 'daily' | 'weekly' | 'monthly' | 'yearly'; // Default: 'monthly'
  metrics?: string;     // comma-separated metrics (future use)
}
```

#### Response Schema
```typescript
interface GetHistoryResponse {
  success: true;
  data: {
    timeSeries: Array<{
      period: string;
      earningsCents: number;
      transactionCount: number;
      paidCount: number;
      movingAvg3Cents: number | null;
      movingAvg6Cents: number | null;
      cumulativeEarningsCents: number;
    }>;
    summary: {
      totalEarningsCents: number;
      avgEarningsPerPeriodCents: number;
      periodCount: number;
      highestEarningPeriod: {
        period: string;
        earningsCents: number;
      };
      lowestEarningPeriod: {
        period: string;
        earningsCents: number;
      };
      overallGrowthRatePct: number;
      volatility: {
        stdDevCents: number;
        coefficientOfVariationPct: number;
        interpretation: string;
      };
    };
    period: {
      from: string;
      to: string;
      granularity: string;
      daysSpan: number;
    };
  };
}
```

#### Date Range Limits
- **Daily:** Maximum 365 days
- **Weekly:** Maximum 730 days (2 years)
- **Monthly/Yearly:** Maximum 3650 days (10 years)

---

### 1.5 Submit Dispute - `POST /api/royalties/statements/:id/dispute`

**Purpose:** File a dispute for a specific royalty statement

#### Request Schema
```typescript
interface DisputeStatementRequest {
  reason: string;                    // 10-2000 chars, main dispute reason
  description?: string;              // Optional detailed explanation
  evidenceUrls?: string[];           // URLs to supporting documents
}
```

#### Response Schema
```typescript
interface DisputeStatementResponse {
  success: true;
  data: {
    id: string;
    status: 'DISPUTED';
    disputedAt: string;              // ISO datetime
    disputeReason: string;
    message: 'Dispute submitted successfully';
  };
  meta: {
    nextSteps: string[];             // What happens next
    supportContact: string;          // Email for support
  };
}
```

#### Dispute Business Rules
1. **Already Disputed:** Cannot dispute a statement that is already in `DISPUTED` status
2. **Paid Statements:** Can dispute paid statements within 90 days of payment date  
3. **Ownership:** Can only dispute statements that belong to the authenticated creator
4. **Status Restrictions:** Cannot dispute statements in certain statuses

---

## 2. TypeScript Type Definitions

```typescript
// Enums
export type RoyaltyStatementStatus = 
  | 'PENDING' 
  | 'REVIEWED' 
  | 'DISPUTED' 
  | 'RESOLVED' 
  | 'PAID';

export type GranularityType = 
  | 'daily' 
  | 'weekly' 
  | 'monthly' 
  | 'yearly';

export type ConfidenceLevel = 
  | 'conservative' 
  | 'moderate' 
  | 'optimistic';

export type TrendDirection = 
  | 'up' 
  | 'down' 
  | 'stable';

// Core Interfaces
export interface RoyaltyStatementSummary {
  id: string;
  period: {
    start: string;
    end: string;
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  lineItemCount: number;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfAvailable: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface EarningsBreakdown {
  period: string;
  earnings: number;
  paid: number;
  pending: number;
}

export interface TopEarningAsset {
  id: string;
  title: string;
  type: string;
  totalEarningsCents: number;
  licenseCount: number;
}

export interface GrowthMetrics {
  currentPeriodCents: number;
  previousPeriodCents: number;
  growthRate: number;
  trend: TrendDirection;
}

export interface EarningsForecast {
  periodDays: number;
  projectedEarningsCents: number;
  confidenceLevel: ConfidenceLevel;
  range: {
    lowCents: number;
    highCents: number;
  };
}

export interface HistoricalEarnings {
  period: string;
  earningsCents: number;
  transactionCount: number;
  paidCount: number;
  movingAvg3Cents: number | null;
  movingAvg6Cents: number | null;
  cumulativeEarningsCents: number;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// API Response Wrappers
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}
```

---

## 3. Validation Schemas (Zod)

```typescript
import { z } from 'zod';

// Query parameter schemas
export const statementsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: z.enum(['PENDING', 'REVIEWED', 'DISPUTED', 'RESOLVED', 'PAID']).optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export const earningsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month', 'year']).optional().default('month'),
});

export const forecastQuerySchema = z.object({
  days: z.string().optional().default('30'),
  confidence_level: z.enum(['conservative', 'moderate', 'optimistic']).optional().default('moderate'),
});

export const historyQuerySchema = z.object({
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().default('monthly'),
  metrics: z.string().optional(),
});

export const disputeRequestSchema = z.object({
  reason: z.string()
    .min(10, 'Reason must be at least 10 characters')
    .max(2000, 'Reason must not exceed 2000 characters'),
  description: z.string().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
});

// Type inference
export type StatementsQuery = z.infer<typeof statementsQuerySchema>;
export type EarningsQuery = z.infer<typeof earningsQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type DisputeRequest = z.infer<typeof disputeRequestSchema>;
```

---

## 4. Business Logic & Validation Rules

### Statement Status Flow
```
PENDING → REVIEWED → PAID
    ↓       ↓
 DISPUTED → RESOLVED → PAID
```

### Validation Rules

#### Date Handling
- All dates must be in ISO 8601 format (`YYYY-MM-DD` or full datetime)
- Historical data requests have limits based on granularity
- Future dates are rejected for historical endpoints

#### Pagination
- Maximum `limit`: 100 items per page
- Default `limit`: 20 items per page
- Page numbers start at 1

#### Earnings Calculations
- All monetary values are in cents (integers)
- Platform fees are deducted from gross earnings to get net payable
- Growth rates are calculated as percentages (can be negative)

#### Forecast Requirements
- Minimum 3 historical statements required for forecast generation
- Uses 12 months of historical data by default
- Confidence levels affect range calculations:
  - **Conservative:** ±15% range
  - **Moderate:** ±25% range  
  - **Optimistic:** ±35% range

#### Dispute Rules
- Must be statement owner (creator) to dispute
- Cannot dispute already disputed statements
- Paid statements have 90-day dispute window
- Reason field is required (10-2000 characters)

### Calculated Fields
- `netPayableCents = totalEarningsCents - platformFeeCents`
- `growthRate = ((current - previous) / previous) * 100`
- Moving averages calculated over 3 and 6 periods
- Cumulative earnings are running totals

---

## 5. Error Handling

### HTTP Status Codes

| Status | Description | When It Occurs |
|--------|-------------|----------------|
| 200 | Success | Normal successful response |
| 201 | Created | Dispute submitted successfully |
| 400 | Bad Request | Invalid query parameters, validation errors |
| 401 | Unauthorized | No authentication token or expired |
| 403 | Forbidden | Not a creator or access denied |
| 404 | Not Found | Creator profile not found, statement not found |
| 409 | Conflict | Statement already disputed |
| 500 | Internal Server Error | Database errors, unexpected server issues |

### Error Response Format
```typescript
interface ErrorResponse {
  success: false;
  error: string;        // Error category
  message: string;      // Human-readable message
  details?: Array<{     // For validation errors
    field: string;
    message: string;
  }>;
}
```

### Common Error Scenarios

#### Authentication Errors
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

#### Creator Not Found
```json
{
  "success": false,
  "error": "Not found",
  "message": "Creator profile not found. This endpoint is only accessible to creators."
}
```

#### Validation Errors
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "field": "reason",
      "message": "Reason must be at least 10 characters"
    }
  ]
}
```

#### Dispute Conflicts
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Statement is already disputed"
}
```

### Frontend Error Handling Strategy
1. **Authentication Errors (401):** Redirect to login page
2. **Creator Profile Missing (404):** Show setup creator profile flow
3. **Validation Errors (400):** Display field-specific error messages
4. **Conflict Errors (409):** Show appropriate status message
5. **Server Errors (500):** Display generic "try again later" message

---

## 6. Authorization & Permissions

### Access Requirements
- **Authentication:** Required for all endpoints
- **Role:** Must have Creator profile linked to authenticated user
- **Ownership:** Can only access own royalty data

### Permission Matrix

| Endpoint | Creator | Admin | Brand | Public |
|----------|---------|-------|-------|--------|
| GET statements | ✅ Own only | ✅ All | ❌ | ❌ |
| GET earnings | ✅ Own only | ✅ All | ❌ | ❌ |
| GET forecast | ✅ Own only | ✅ All | ❌ | ❌ |
| GET history | ✅ Own only | ✅ All | ❌ | ❌ |
| POST dispute | ✅ Own only | ❌ | ❌ | ❌ |

### Authentication Methods
1. **Session Cookies** (recommended for web apps)
2. **Bearer Tokens** (API access)
3. **API Keys** (server-to-server)

### Resource Ownership Validation
```typescript
// Pseudo-code for ownership check
async function validateCreatorOwnership(userId: string, statementId?: string) {
  const creator = await getCreatorByUserId(userId);
  if (!creator) throw new NotFoundError('Creator profile not found');
  
  if (statementId) {
    const statement = await getStatement(statementId);
    if (statement.creatorId !== creator.id) {
      throw new ForbiddenError('Statement not owned by creator');
    }
  }
  
  return creator;
}
```

---

## 7. Rate Limiting & Quotas

### Rate Limits (per authenticated user)

| Endpoint | Limit | Window | Headers |
|----------|-------|---------|---------|
| GET statements | 60 requests | 1 hour | `X-RateLimit-*` |
| GET earnings | 30 requests | 1 hour | `X-RateLimit-*` |
| GET forecast | 20 requests | 1 hour | `X-RateLimit-*` |
| GET history | 20 requests | 1 hour | `X-RateLimit-*` |
| POST dispute | 5 requests | 1 hour | `X-RateLimit-*` |

### Rate Limit Headers
```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Maximum requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining in window
  'X-RateLimit-Reset': string;      // Unix timestamp when window resets
  'X-RateLimit-Window': string;     // Window duration in seconds
}
```

### Rate Limit Error Response (429)
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 1 hour.",
  "retryAfter": 3600
}
```

### Frontend Rate Limit Handling
1. **Monitor Headers:** Check remaining requests in responses
2. **Implement Backoff:** Exponential backoff for 429 errors
3. **Cache Responses:** Cache expensive operations (forecast, history)
4. **User Feedback:** Show rate limit warnings when approaching limits

---

## 8. Pagination & Filtering

### Pagination Format (Offset-based)
```typescript
interface PaginationQuery {
  page?: number;        // 1-based page number (default: 1)
  limit?: number;       // Items per page (default: 20, max: 100)
}

interface PaginationResponse {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Available Filters

#### Statements Endpoint
- **status:** Filter by statement status
- **date_from/date_to:** Date range filter
- **sortBy:** `createdAt`, `totalEarningsCents`, `paidAt`
- **sortOrder:** `asc`, `desc`

#### Earnings/History Endpoints
- **date_from/date_to:** Date range filter
- **group_by/granularity:** Time grouping
- **confidence_level:** Forecast confidence (forecast only)

### Filter Examples
```typescript
// Get pending statements from last 3 months
const query = new URLSearchParams({
  status: 'PENDING',
  date_from: '2024-11-01',
  date_to: '2025-02-01',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

// Get daily earnings for current month
const earningsQuery = new URLSearchParams({
  date_from: '2025-02-01',
  date_to: '2025-02-28',
  group_by: 'day'
});
```

### Frontend Pagination Implementation
```typescript
interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  isLoading: boolean;
}

function usePagination(initialPageSize = 20) {
  const [state, setState] = useState<PaginationState>({
    currentPage: 1,
    pageSize: initialPageSize,
    totalItems: 0,
    isLoading: false
  });

  const goToPage = (page: number) => {
    setState(prev => ({ ...prev, currentPage: page }));
  };

  const changePageSize = (newSize: number) => {
    setState(prev => ({ 
      ...prev, 
      pageSize: newSize, 
      currentPage: 1 // Reset to first page
    }));
  };

  return { state, goToPage, changePageSize };
}
```

---

This concludes Part 1 of the Creator Royalty Access Integration Guide. The guide covers the core API endpoints, data structures, and essential integration patterns.

**Next Document:** [Creator Royalty Access - Implementation Guide (Part 2)](./CREATOR_ROYALTY_ACCESS_IMPLEMENTATION_GUIDE_PART2.md) will cover:
- Real-time updates & webhooks
- File uploads & PDF generation
- Frontend implementation checklist
- React Query integration examples
- UX considerations & edge cases
