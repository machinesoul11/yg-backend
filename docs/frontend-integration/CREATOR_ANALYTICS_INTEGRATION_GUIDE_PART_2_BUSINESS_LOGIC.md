# Creator Analytics & Revenue - Frontend Integration Guide (Part 2: Business Logic)

> **Classification: ⚡ HYBRID** - Core functionality used by both admin backend (view all creators) and public-facing website (creators view their own data)

This document covers business logic, validation rules, error handling, authorization, and rate limiting for the Creator Analytics module.

---

## 📋 Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Error Handling](#error-handling)
3. [Authorization & Permissions](#authorization--permissions)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [Data Calculation Rules](#data-calculation-rules)
6. [Edge Cases & Special Scenarios](#edge-cases--special-scenarios)

---

## 1. Business Logic & Validation Rules

### 1.1 Date Range Validation

#### Valid Date Formats
- **ISO 8601 strings:** `2024-01-01`, `2024-01-01T00:00:00Z`
- **Date objects:** Converted to ISO 8601 before sending to API

#### Date Range Constraints

**By Granularity:**

| Granularity | Maximum Range | Recommended Default |
|-------------|---------------|---------------------|
| `daily` | 365 days | 90 days |
| `weekly` | 730 days (2 years) | 180 days (6 months) |
| `monthly` | 3650 days (10 years) | 365 days (12 months) |
| `yearly` | 3650 days (10 years) | 1825 days (5 years) |

**Frontend Validation Logic:**
```typescript
function validateDateRange(
  from: Date,
  to: Date,
  granularity: TimeGranularity
): { valid: boolean; error?: string } {
  const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  
  const limits = {
    daily: 365,
    weekly: 730,
    monthly: 3650,
    yearly: 3650,
  };
  
  const maxDays = limits[granularity];
  
  if (daysDiff < 0) {
    return { valid: false, error: 'End date must be after start date' };
  }
  
  if (daysDiff > maxDays) {
    return { 
      valid: false, 
      error: `Date range too large for ${granularity} granularity. Maximum ${maxDays} days allowed.`
    };
  }
  
  return { valid: true };
}
```

#### Default Date Ranges

**When no dates are specified:**

| Endpoint | Default From | Default To |
|----------|--------------|------------|
| `/earnings` | 12 months ago | Today |
| `/forecast` | N/A (uses historical data) | N/A |
| `/history` (daily) | 90 days ago | Today |
| `/history` (weekly) | 6 months ago | Today |
| `/history` (monthly) | 24 months ago | Today |
| `/history` (yearly) | 5 years ago | Today |

### 1.2 Pagination Validation

```typescript
interface PaginationRules {
  page: {
    min: 1;
    default: 1;
  };
  limit: {
    min: 1;
    max: 100;
    default: 20;
  };
}

function validatePagination(
  page?: string,
  limit?: string
): { page: number; limit: number; errors: string[] } {
  const errors: string[] = [];
  
  let pageNum = parseInt(page || '1');
  let limitNum = parseInt(limit || '20');
  
  if (isNaN(pageNum) || pageNum < 1) {
    errors.push('Page must be a positive integer');
    pageNum = 1;
  }
  
  if (isNaN(limitNum) || limitNum < 1) {
    errors.push('Limit must be a positive integer');
    limitNum = 20;
  }
  
  if (limitNum > 100) {
    errors.push('Limit cannot exceed 100');
    limitNum = 100;
  }
  
  return { page: pageNum, limit: limitNum, errors };
}
```

### 1.3 Forecast Validation

#### Minimum Data Requirements

**Forecast Generation Requires:**
- Minimum 3 royalty statements (3 months of historical data)
- Statements must span at least 60 days
- At least one statement must have non-zero earnings

**Frontend Check Before Calling:**
```typescript
interface ForecastAvailability {
  canGenerate: boolean;
  reason?: string;
  statementsNeeded?: number;
}

async function checkForecastAvailability(
  currentStatementCount: number
): Promise<ForecastAvailability> {
  if (currentStatementCount < 3) {
    return {
      canGenerate: false,
      reason: `Need ${3 - currentStatementCount} more months of earnings history to generate forecast`,
      statementsNeeded: 3 - currentStatementCount,
    };
  }
  
  return { canGenerate: true };
}
```

#### Confidence Level Rules

| Level | Description | Use Case |
|-------|-------------|----------|
| `conservative` | Lower bound estimate (projected - 0.5 × stdDev) | Budget planning, financial commitments |
| `moderate` | Most likely estimate (historical average + trend) | General planning, expectations setting |
| `optimistic` | Upper bound estimate (projected + 0.5 × stdDev) | Growth scenarios, best-case planning |

**Frontend Display Guidance:**
```typescript
function getForecastDisplayNote(level: ConfidenceLevel): string {
  const notes = {
    conservative: 'Lower estimate suitable for conservative budgeting',
    moderate: 'Most likely outcome based on your historical performance',
    optimistic: 'Upper estimate representing potential upside',
  };
  return notes[level];
}
```

### 1.4 Status-Based Business Rules

#### Royalty Statement Status Lifecycle

```
PENDING → REVIEWED → PAID
   ↓         ↓
DISPUTED → RESOLVED → PAID
```

**Status Meanings:**
- **PENDING:** Statement generated, awaiting review
- **REVIEWED:** Admin has reviewed, awaiting payment processing
- **DISPUTED:** Creator has disputed the statement
- **RESOLVED:** Dispute resolved, awaiting payment
- **PAID:** Payment successfully processed

**Frontend Display Logic:**
```typescript
function getStatementStatusInfo(status: RoyaltyStatementStatus) {
  const statusConfig = {
    PENDING: {
      color: 'yellow',
      icon: 'clock',
      label: 'Pending Review',
      description: 'Statement is awaiting admin review',
      actionable: false,
    },
    REVIEWED: {
      color: 'blue',
      icon: 'check-circle',
      label: 'Reviewed',
      description: 'Statement approved, payment processing soon',
      actionable: false,
    },
    DISPUTED: {
      color: 'red',
      icon: 'alert-circle',
      label: 'Disputed',
      description: 'You have disputed this statement',
      actionable: true,
      action: 'View Dispute',
    },
    RESOLVED: {
      color: 'green',
      icon: 'check',
      label: 'Resolved',
      description: 'Dispute resolved, payment processing soon',
      actionable: false,
    },
    PAID: {
      color: 'green',
      icon: 'dollar-sign',
      label: 'Paid',
      description: 'Payment successfully processed',
      actionable: true,
      action: 'View Receipt',
    },
  };
  
  return statusConfig[status];
}
```

### 1.5 Calculation Rules

#### Earnings Calculations

**Total Earnings:**
```typescript
totalEarnings = SUM(royaltyStatement.totalEarningsCents)
```

**Paid Amount:**
```typescript
totalPaid = SUM(
  royaltyStatement.totalEarningsCents 
  WHERE status = 'PAID'
)
```

**Pending Amount:**
```typescript
totalPending = SUM(
  royaltyStatement.totalEarningsCents 
  WHERE status IN ('PENDING', 'REVIEWED')
)
```

#### Growth Rate Calculation

```typescript
function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

// Trend determination
function determineTrend(growthRate: number): TrendDirection {
  if (Math.abs(growthRate) < 5) return 'stable';
  return growthRate > 0 ? 'up' : 'down';
}
```

#### Moving Average Calculation

**3-Period Moving Average:**
```typescript
// Only calculated when there are at least 3 periods
movingAvg3 = (period[i] + period[i-1] + period[i-2]) / 3
```

**6-Period Moving Average:**
```typescript
// Only calculated when there are at least 6 periods
movingAvg6 = (period[i] + period[i-1] + ... + period[i-5]) / 6
```

---

## 2. Error Handling

### 2.1 HTTP Status Codes

| Status Code | Meaning | User Action Required |
|-------------|---------|---------------------|
| `200` | Success | N/A |
| `400` | Bad Request (validation error) | Fix input and retry |
| `401` | Unauthorized (not authenticated) | Re-authenticate |
| `403` | Forbidden (insufficient permissions) | Contact support |
| `404` | Not Found (creator profile missing) | Create creator profile |
| `429` | Too Many Requests (rate limited) | Wait and retry |
| `500` | Internal Server Error | Retry later or contact support |

### 2.2 Error Response Format

**All errors follow this structure:**
```typescript
interface ApiError {
  success: false;
  error: string;         // Error category
  message: string;       // Human-readable message
  details?: Array<{      // Optional validation details
    field: string;
    message: string;
  }>;
}
```

### 2.3 Common Errors

#### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation error",
  "message": "Invalid query parameters",
  "details": [
    {
      "field": "date_from",
      "message": "Invalid date format. Expected ISO 8601."
    },
    {
      "field": "group_by",
      "message": "Invalid value. Expected: day, week, month, or year."
    }
  ]
}
```

**Frontend Handling:**
```typescript
if (error.error === 'Validation error' && error.details) {
  // Display field-specific errors
  error.details.forEach(detail => {
    showFieldError(detail.field, detail.message);
  });
} else {
  // Show generic error
  showToast('error', error.message);
}
```

#### Authentication Error (401)
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Frontend Handling:**
```typescript
if (response.status === 401) {
  // Clear session and redirect to login
  clearAuthToken();
  router.push('/login?redirect=' + encodeURIComponent(currentPath));
  showToast('info', 'Please log in to continue');
}
```

#### Not Found Error (404)
```json
{
  "success": false,
  "error": "Not found",
  "message": "Creator profile not found. This endpoint is only accessible to creators."
}
```

**Frontend Handling:**
```typescript
if (response.status === 404) {
  // Check if creator profile exists
  const hasCreatorProfile = await checkCreatorProfile();
  
  if (!hasCreatorProfile) {
    showModal({
      title: 'Creator Profile Required',
      message: 'You need to create a creator profile to access analytics.',
      action: 'Create Profile',
      onAction: () => router.push('/onboarding/creator'),
    });
  }
}
```

#### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 60 seconds.",
  "retryAfter": 60
}
```

**Frontend Handling:**
```typescript
if (response.status === 429) {
  const retryAfter = error.retryAfter || 60;
  
  showToast('warning', `Rate limit exceeded. Retry in ${retryAfter}s`);
  
  // Optionally implement automatic retry
  setTimeout(() => {
    retryRequest();
  }, retryAfter * 1000);
}
```

#### Server Error (500)
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again later."
}
```

**Frontend Handling:**
```typescript
if (response.status === 500) {
  showToast('error', 'Something went wrong. Please try again.');
  
  // Log to error tracking service
  logError('API_SERVER_ERROR', {
    endpoint: '/api/me/royalties/earnings',
    timestamp: new Date().toISOString(),
  });
}
```

### 2.4 Error Display Best Practices

**Toast Notifications:**
```typescript
// Success
showToast('success', 'Earnings data loaded successfully');

// Info
showToast('info', 'Forecast requires at least 3 months of data');

// Warning
showToast('warning', 'Date range is very large. This may take a moment.');

// Error
showToast('error', 'Failed to load earnings data. Please try again.');
```

**Field Errors:**
```typescript
<Input
  name="date_from"
  error={errors.date_from}
  helperText={errors.date_from ? 'Invalid date format' : ''}
/>
```

**Empty States:**
```typescript
if (data.summary.statementCount === 0) {
  return (
    <EmptyState
      icon="chart-line"
      title="No Earnings Data Yet"
      description="You haven't received any royalty statements yet. Check back after your first earnings period."
      action={{
        label: 'Learn About Earnings',
        href: '/help/earnings',
      }}
    />
  );
}
```

---

## 3. Authorization & Permissions

### 3.1 User Roles

| Role | Can Access Own Data | Can Access Others' Data | Permissions |
|------|-------------------|------------------------|-------------|
| **Creator** | ✅ Yes | ❌ No | `creators.view_own`, `creators.view_financial` |
| **Brand** | ❌ No | ❌ No | N/A (brands don't have earnings) |
| **Admin** | ✅ Yes (if also creator) | ✅ Yes | `creators.view_all`, `creators.view_sensitive`, `creators.view_financial` |
| **Super Admin** | ✅ Yes | ✅ Yes | All permissions |

### 3.2 Endpoint-Level Authorization

**All `/api/me/royalties/*` endpoints:**
- Require authentication (valid JWT token)
- Require active creator profile for the authenticated user
- Return 404 if user is not a creator

**Authorization Flow:**
```typescript
1. Extract JWT from Authorization header
2. Verify JWT signature and expiry
3. Fetch user from database
4. Check if user has associated creator profile
5. If no creator profile → 404 Not Found
6. If creator profile exists → Return data for that creator only
```

### 3.3 Data Scoping

**Automatic Scoping:**
All queries are automatically scoped to the authenticated creator:

```sql
-- Backend automatically adds this WHERE clause
WHERE creator_id = <authenticated_creator_id>
```

**Security Guarantee:**
- Creators can NEVER access another creator's data via these endpoints
- Data leakage is prevented at the database query level
- No frontend validation is required for authorization (backend enforces)

### 3.4 Creator Profile Requirements

**Before accessing analytics endpoints:**

1. User must have `role = 'CREATOR'` in the database
2. User must have a creator profile record linked to their user ID
3. Creator profile must not be soft-deleted

**Frontend Check:**
```typescript
async function canAccessAnalytics(): Promise<boolean> {
  const session = await getSession();
  
  if (!session?.user) return false;
  
  // Check if user has creator role
  if (session.user.role !== 'CREATOR') return false;
  
  // Check if creator profile exists
  const profile = await fetchCreatorProfile();
  return profile !== null;
}
```

### 3.5 Field-Level Permissions

**All financial fields are visible to creators:**
- Total earnings (cents)
- Paid amounts (cents)
- Pending amounts (cents)
- Asset-level earnings
- Forecasts

**No field-level restrictions** exist for creators viewing their own data.

---

## 4. Rate Limiting & Quotas

### 4.1 Rate Limit Configuration

**Global API Limits:**
- **Window:** 60 seconds (sliding window)
- **Requests per window:** 100 requests per user
- **Applies to:** All authenticated `/api/me/*` endpoints

**Analytics-Specific Limits:**
- **Forecast Generation:** 10 requests per hour (more expensive computation)
- **Export/Download:** 5 requests per hour (large data transfers)

### 4.2 Rate Limit Headers

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T14:35:00Z
```

**Frontend Usage:**
```typescript
function checkRateLimit(response: Response) {
  const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0');
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  if (remaining < 10) {
    showToast('warning', `Only ${remaining} requests remaining. Rate limit resets at ${formatTime(reset)}`);
  }
  
  return { limit, remaining, reset };
}
```

### 4.3 Handling Rate Limits

**Exponential Backoff Strategy:**
```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        const delay = Math.min(retryAfter * 1000, 60000); // Max 60s
        
        console.log(`Rate limited. Retrying after ${delay}ms`);
        await sleep(delay);
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}
```

### 4.4 Caching Strategy

**Recommended Cache Duration:**

| Endpoint | Cache Duration | Invalidation Trigger |
|----------|---------------|---------------------|
| `/earnings` | 5 minutes | New statement created |
| `/forecast` | 1 hour | New statement created |
| `/history` | 15 minutes | New statement created |
| `/statements` | 5 minutes | Statement status changes |

**Frontend Caching with React Query:**
```typescript
const { data } = useQuery({
  queryKey: ['earnings', dateFrom, dateTo, groupBy],
  queryFn: () => fetchEarnings({ date_from: dateFrom, date_to: dateTo, group_by: groupBy }),
  staleTime: 5 * 60 * 1000,  // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
});
```

---

## 5. Data Calculation Rules

### 5.1 Currency Precision

**Storage:** All amounts stored in **cents (integers)**

**Display:** Convert to dollars for display

```typescript
// ❌ WRONG - floating point issues
const dollars = cents * 0.01;

// ✅ CORRECT - integer division
const dollars = cents / 100;
const formatted = dollars.toFixed(2);

// ✅ BEST - use currency formatter
const formatted = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(cents / 100);
```

### 5.2 Period Aggregation Rules

**Monthly Periods:**
- Grouped by `YYYY-MM` format
- Includes all statements where `royaltyRun.periodEnd` falls in that month

**Weekly Periods:**
- Grouped by ISO week format `YYYY-Www`
- Week starts on Sunday (US convention)

**Daily Periods:**
- Grouped by `YYYY-MM-DD` format
- Based on `royaltyRun.periodEnd` date

### 5.3 Top Assets Calculation

**Ranking Logic:**
1. Sum all earnings per asset across all statements
2. Sort by total earnings descending
3. Return top 10 assets

**Tie-breaking:**
- If earnings are equal, sort by license count (descending)
- If still equal, sort by asset title (alphabetical)

---

## 6. Edge Cases & Special Scenarios

### 6.1 No Earnings Data

**Scenario:** Creator has never received any royalty statements

**Backend Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEarningsCents": 0,
      "totalPaidCents": 0,
      "totalPendingCents": 0,
      "avgEarningsPerPeriodCents": 0,
      "highestEarningPeriod": null,
      "statementCount": 0
    },
    "breakdown": [],
    "topAssets": [],
    "growth": {
      "currentPeriodCents": 0,
      "previousPeriodCents": 0,
      "growthRate": 0,
      "trend": "stable"
    },
    "period": { /* ... */ }
  }
}
```

**Frontend Display:**
```typescript
if (data.summary.statementCount === 0) {
  return <EmptyState message="No earnings data available yet" />;
}
```

### 6.2 Insufficient Forecast Data

**Scenario:** Creator has fewer than 3 statements

**Backend Response:**
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

**Frontend Display:**
```typescript
if (!data.available) {
  return (
    <InfoCard>
      <p>{data.message}</p>
      <p>You need {data.requirement.minimumStatements - data.requirement.currentStatements} more months of earnings.</p>
    </InfoCard>
  );
}
```

### 6.3 Zero Earnings Periods

**Scenario:** Some periods have no earnings

**Backend Behavior:**
- Zero earnings periods are included in response
- `earningsCents: 0` for those periods
- Still counts toward period totals

**Frontend Display:**
- Display $0.00 for zero periods
- Don't hide zero periods (shows complete timeline)
- Consider visual indicator for zero periods

### 6.4 Very Large Date Ranges

**Scenario:** User requests 10 years of daily data

**Backend Behavior:**
- Returns 400 error if range exceeds maximum for granularity
- Suggests appropriate granularity

**Frontend Prevention:**
```typescript
// Warn before submitting
if (daysDiff > recommendedMax[granularity]) {
  showWarning(
    'Large date range selected. Consider using a coarser granularity (e.g., monthly instead of daily) for better performance.'
  );
}
```

### 6.5 Disputed Statements

**Scenario:** Creator has disputed a statement

**Backend Behavior:**
- Disputed statements are included in totals
- Status is marked as `DISPUTED`
- Amount is NOT included in `totalPaidCents`

**Frontend Display:**
```typescript
if (statement.status === 'DISPUTED') {
  return (
    <StatementCard highlighted>
      <Badge color="red">Disputed</Badge>
      <Link to={`/disputes/${statement.id}`}>View Dispute</Link>
    </StatementCard>
  );
}
```

---

## Next Steps

Continue to:
- **[Part 3: Frontend Implementation Examples](./CREATOR_ANALYTICS_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)** - React Query hooks, component examples, implementation checklist

---

## Quick Reference

### Validation Checklist
- ✅ Dates in ISO 8601 format
- ✅ Date range within limits for granularity
- ✅ Page ≥ 1
- ✅ Limit between 1 and 100
- ✅ Valid status enum values
- ✅ Valid sort fields

### Error Handling Checklist
- ✅ Handle 401 → Redirect to login
- ✅ Handle 404 → Show "Create Profile" prompt
- ✅ Handle 429 → Implement retry with backoff
- ✅ Handle 500 → Show generic error, log to monitoring
- ✅ Display field-specific validation errors

### Performance Checklist
- ✅ Cache API responses (5-60 minutes)
- ✅ Show loading states
- ✅ Implement request debouncing
- ✅ Monitor rate limit headers
- ✅ Use appropriate date ranges

**Last Updated:** October 17, 2025
