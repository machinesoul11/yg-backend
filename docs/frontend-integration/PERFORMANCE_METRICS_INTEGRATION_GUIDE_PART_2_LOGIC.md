# Performance Metrics Integration Guide - Part 2: Business Logic & Validation

**Classification**: ⚡ HYBRID

---

## Table of Contents
- [Metric Calculations](#metric-calculations)
- [Business Rules & Thresholds](#business-rules--thresholds)
- [Validation Requirements](#validation-requirements)
- [Data Transformations](#data-transformations)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Metric Calculations

### ROI (Return on Investment)

#### Formula
```typescript
ROI% = ((Total Revenue - Total Cost) / Total Cost) × 100
```

#### Components

**Total Revenue** = Sum of:
- Initial license fee (`feeCents`)
- Royalty revenue from royalty lines (`royaltyLines.calculatedRoyaltyCents`)
- Daily metrics revenue (`dailyMetrics.revenueCents`)

**Total Cost** = Sum of:
- License fee paid to platform (`feeCents`)
- Royalty amounts paid to creators (`royaltyLines.calculatedRoyaltyCents`)

#### Break-Even Calculation

The system calculates when cumulative revenue equals or exceeds total costs:

```typescript
// Pseudocode
let cumulativeRevenue = initialLicenseFee;
for (const metric of dailyMetrics.sortedByDate) {
  cumulativeRevenue += metric.revenueCents;
  if (cumulativeRevenue >= totalCosts) {
    breakEvenDate = metric.date;
    daysToBreakEven = differenceInDays(breakEvenDate, licenseStartDate);
    break;
  }
}
```

#### Projected Annual ROI

```typescript
const daysActive = differenceInDays(today, licenseStartDate);
const revenuePerDay = daysActive > 0 ? totalRevenue / daysActive : 0;
const projectedAnnualRevenue = revenuePerDay * 365;
const projectedAnnualROI = totalCost > 0 
  ? ((projectedAnnualRevenue - totalCost) / totalCost) * 100 
  : 0;
```

#### Revenue Growth Rate

Compares last 30 days to previous 30 days:

```typescript
const now = new Date();
const thirtyDaysAgo = subDays(now, 30);
const sixtyDaysAgo = subDays(now, 60);

const recentRevenue = sumRevenueInPeriod(thirtyDaysAgo, now);
const previousRevenue = sumRevenueInPeriod(sixtyDaysAgo, thirtyDaysAgo);

const growthRate = previousRevenue > 0 
  ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 
  : 0;
```

---

### Utilization Metrics

#### Formula
```typescript
Utilization% = (Actual Usage Count / Scope Limit) × 100
```

#### Usage Tracking

**Actual Usage Count** = Number of tracked events:
- `asset_viewed`
- `asset_downloaded`
- `license_clicked`

**Scope Limit** = From license metadata:
```typescript
const scopeLimit = license.metadata?.usageLimits?.maxUsageCount || null;
```

If `scopeLimit` is `null`, the license has unlimited usage.

#### Utilization Trend

Compares last 30 days to previous 30 days:

```typescript
const recentUsage = countEventsInPeriod(thirtyDaysAgo, now);
const previousUsage = countEventsInPeriod(sixtyDaysAgo, thirtyDaysAgo);

let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';

if (recentUsage > previousUsage * 1.1) {
  trend = 'increasing';  // 10% increase
} else if (recentUsage < previousUsage * 0.9) {
  trend = 'decreasing';  // 10% decrease
}
```

#### Over/Under Utilization Flags

```typescript
const isOverUtilized = scopeLimit 
  ? utilizationPercentage > 100 
  : false;

const isUnderUtilized = scopeLimit 
  ? utilizationPercentage < 20 
  : actualUsageCount < 10;
```

#### Remaining Capacity

```typescript
const remainingCapacity = scopeLimit 
  ? Math.max(scopeLimit - actualUsageCount, 0) 
  : null;  // null = unlimited
```

---

### Approval Time Metrics

#### Duration Calculation

```typescript
if (license.signedAt) {
  approvalDurationHours = differenceInHours(signedAt, createdAt);
  approvalDurationDays = differenceInDays(signedAt, createdAt);
} else {
  approvalDurationHours = null;
  approvalDurationDays = null;
}
```

#### Approval Stage Determination

```typescript
let stage: 'created' | 'pending_approval' | 'approved' | 'expired';

if (license.signedAt) {
  stage = 'approved';
} else if (license.status === 'ACTIVE') {
  stage = 'pending_approval';
} else if (license.status === 'EXPIRED') {
  stage = 'expired';
} else {
  stage = 'created';
}
```

#### Bottleneck Detection

```typescript
const bottlenecks: string[] = [];
const hoursSinceCreation = differenceInHours(now, createdAt);

if (!signedAt && hoursSinceCreation > 168) {  // 7 days
  bottlenecks.push(
    `License has been pending for ${Math.round(hoursSinceCreation / 24)} days`
  );
}

if (!signedAt && hoursSinceCreation > 72 && stage === 'pending_approval') {
  bottlenecks.push('Approval taking longer than expected (>72 hours)');
}
```

---

### Conflict Rate Metrics

#### Conflict Rate Formula

```typescript
const conflictRate = totalLicensesCreated > 0 
  ? (totalConflictsDetected / totalLicensesCreated) * 100 
  : 0;
```

#### Conflict Detection

Conflicts are stored in license metadata:

```typescript
const metadata = license.metadata as any;
if (metadata?.conflicts && Array.isArray(metadata.conflicts)) {
  totalConflictsDetected += metadata.conflicts.length;
  
  metadata.conflicts.forEach((conflict: any) => {
    // Count by type
    const type = conflict.reason || 'UNKNOWN';
    conflictsByType[type] = (conflictsByType[type] || 0) + 1;
    
    // Count by severity
    if (conflict.severity === 'critical') {
      conflictsBySeverity.critical++;
    } else if (conflict.severity === 'warning') {
      conflictsBySeverity.warning++;
    } else {
      conflictsBySeverity.info++;
    }
  });
}
```

#### Conflict Types

Common conflict types detected:
- `exclusive_overlap` - Two exclusive licenses for same asset/territory
- `territory_conflict` - Overlapping geographic restrictions
- `competitor_exclusivity` - Brand exclusivity violated
- `usage_limit_conflict` - Scope usage exceeded
- `time_period_overlap` - Date range conflicts

---

## Business Rules & Thresholds

### ROI Performance Levels

| Level | ROI Range | Display | Action |
|-------|-----------|---------|--------|
| Excellent | > 100% | 🟢 Green | Highlight as success story |
| Good | 50% - 100% | 🟡 Yellow-Green | Standard positive indicator |
| Moderate | 0% - 50% | 🟡 Yellow | Monitor for improvement |
| Poor | < 0% | 🔴 Red | Flag for review |

### Utilization Thresholds

| Category | Percentage | Display | Recommendation |
|----------|-----------|---------|----------------|
| Over-utilized | > 100% | 🔴 Red | Upgrade license or enforce limits |
| Well-utilized | 50% - 100% | 🟢 Green | Optimal usage |
| Moderate | 20% - 50% | 🟡 Yellow | Acceptable |
| Under-utilized | < 20% | 🟠 Orange | Consider downgrade or renegotiation |

**Special Case**: If `scopeLimitCount` is `null` (unlimited):
- Can't calculate percentage
- Use absolute usage count
- Consider under-utilized if `actualUsageCount < 10`

### Conflict Rate Health

| Status | Rate | Display | Action Required |
|--------|------|---------|-----------------|
| Healthy | < 5% | 🟢 Green | No action needed |
| Monitor | 5% - 15% | 🟡 Yellow | Review conflict patterns |
| Action Needed | > 15% | 🔴 Red | Immediate process improvement |

### Approval Time Benchmarks

| Speed | Duration | Display | Notes |
|-------|----------|---------|-------|
| Fast | < 24 hours | 🟢 Green | Excellent turnaround |
| Normal | 24 - 72 hours | 🟡 Yellow | Standard processing time |
| Slow | 72 - 168 hours | 🟠 Orange | May have delays |
| Very Slow | > 168 hours (7 days) | 🔴 Red | Bottleneck investigation needed |

---

## Validation Requirements

### Input Validation

#### Date Range Validation

```typescript
// For all endpoints with startDate/endDate
const validateDateRange = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Must be valid dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  // End must be after start
  if (end <= start) {
    throw new Error('endDate must be after startDate');
  }
  
  // Maximum range: 1 year
  const daysDifference = differenceInDays(end, start);
  if (daysDifference > 365) {
    throw new Error('Date range cannot exceed 1 year');
  }
  
  // Cannot query future dates
  if (end > new Date()) {
    throw new Error('endDate cannot be in the future');
  }
  
  return { start, end };
};
```

#### License ID Validation

```typescript
const validateLicenseId = (licenseId: string) => {
  // Must be CUID format (25 characters, starts with 'cl')
  const cuidRegex = /^cl[a-z0-9]{23}$/;
  
  if (!cuidRegex.test(licenseId)) {
    throw new Error('Invalid license ID format');
  }
  
  return licenseId;
};
```

#### Period Validation

```typescript
const validatePeriod = (period: string) => {
  const validPeriods = ['7d', '30d', '90d', '1y'];
  
  if (!validPeriods.includes(period)) {
    throw new Error(`Invalid period. Must be one of: ${validPeriods.join(', ')}`);
  }
  
  return period as '7d' | '30d' | '90d' | '1y';
};
```

---

## Data Transformations

### Currency Display

All monetary values are in **cents** (USD). Convert for display:

```typescript
const formatCurrency = (cents: number): string => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
};

// Example usage
formatCurrency(500000); // "$5,000.00"
```

### Percentage Display

```typescript
const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

// Example usage
formatPercentage(85.567, 1);  // "85.6%"
formatPercentage(85.567, 2);  // "85.57%"
```

### Date Display

```typescript
import { format } from 'date-fns';

// Relative dates
const formatRelativeDate = (date: Date): string => {
  const now = new Date();
  const diffDays = differenceInDays(now, date);
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

// Absolute dates
const formatAbsoluteDate = (date: Date): string => {
  return format(date, 'MMM dd, yyyy');  // "Oct 14, 2025"
};

// Date with time
const formatDateTime = (date: Date): string => {
  return format(date, 'MMM dd, yyyy h:mm a');  // "Oct 14, 2025 2:30 PM"
};
```

### Duration Display

```typescript
const formatDuration = (hours: number): string => {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  } else if (hours < 24) {
    return `${Math.round(hours)} hours`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 
      ? `${days} days, ${remainingHours} hours`
      : `${days} days`;
  }
};

// Example usage
formatDuration(0.5);   // "30 minutes"
formatDuration(5);     // "5 hours"
formatDuration(43.75); // "1 days, 20 hours"
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid input parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User lacks permission for resource |
| 404 | Not Found | License/resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side processing error |

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    code: string;      // Error code (matches HTTP status context)
    message: string;   // Human-readable error message
  }
}
```

### Common Error Scenarios

#### License Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "License not found"
  }
}
```

**Frontend Handling**:
```typescript
if (error.code === 'NOT_FOUND') {
  // Redirect to licenses list or show 404 page
  router.push('/licenses');
  toast.error('License not found');
}
```

#### Permission Denied

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to view this license"
  }
}
```

**Frontend Handling**:
```typescript
if (error.code === 'FORBIDDEN') {
  // Show permission error message
  toast.error('You don\'t have access to this license');
  // Optionally redirect to dashboard
  router.push('/dashboard');
}
```

#### Invalid Date Range

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "endDate must be after startDate"
  }
}
```

**Frontend Handling**:
```typescript
if (error.code === 'BAD_REQUEST') {
  // Show validation error in form
  setFieldError('endDate', error.message);
}
```

#### Authentication Required

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**Frontend Handling**:
```typescript
if (error.code === 'UNAUTHORIZED') {
  // Clear session and redirect to login
  clearSession();
  router.push('/login?redirect=' + currentPath);
}
```

---

## Rate Limiting

### Limits Per Endpoint

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `getPerformanceMetrics` | 100 requests | 1 minute | Per user |
| `getPerformanceDashboard` | 30 requests | 1 minute | Per user |
| `getAggregatedPerformanceMetrics` | 30 requests | 1 minute | Per user |
| `getConflictRateMetrics` | 30 requests | 1 minute | Per user |
| `getHistoricalPerformanceMetrics` | 20 requests | 1 minute | Per user |

### Rate Limit Headers

The API includes rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697299200
```

### Rate Limit Exceeded Response

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Please try again in 30 seconds.",
    "retryAfter": 30
  }
}
```

### Frontend Handling

```typescript
if (error.code === 'TOO_MANY_REQUESTS') {
  const retryAfter = error.retryAfter || 60;
  
  toast.error(
    `Too many requests. Please wait ${retryAfter} seconds.`,
    { duration: retryAfter * 1000 }
  );
  
  // Optional: Implement exponential backoff
  setTimeout(() => {
    refetch();
  }, retryAfter * 1000);
}
```

### Caching Strategy

To avoid hitting rate limits, implement caching:

```typescript
// React Query example
const { data } = useQuery({
  queryKey: ['performance-metrics', licenseId],
  queryFn: () => getPerformanceMetrics(licenseId),
  staleTime: 5 * 60 * 1000,        // Consider fresh for 5 minutes
  cacheTime: 30 * 60 * 1000,       // Keep in cache for 30 minutes
  refetchOnWindowFocus: false,     // Don't refetch on window focus
  refetchOnMount: false,           // Don't refetch on component mount
});
```

---

## Derived Values & Calculations

### Frontend-Side Calculations

Some values should be calculated on the frontend for better UX:

#### Revenue Per Day

```typescript
const calculateRevenuePerDay = (
  totalRevenueCents: number,
  startDate: Date
): number => {
  const daysActive = differenceInDays(new Date(), startDate);
  return daysActive > 0 ? totalRevenueCents / daysActive : 0;
};
```

#### Utilization Color Coding

```typescript
const getUtilizationColor = (percentage: number): string => {
  if (percentage > 100) return 'red';
  if (percentage >= 50) return 'green';
  if (percentage >= 20) return 'yellow';
  return 'orange';
};

const getUtilizationStatus = (percentage: number): string => {
  if (percentage > 100) return 'Over-utilized';
  if (percentage >= 50) return 'Well-utilized';
  if (percentage >= 20) return 'Moderate';
  return 'Under-utilized';
};
```

#### ROI Status

```typescript
const getROIStatus = (roiPercentage: number): {
  level: 'excellent' | 'good' | 'moderate' | 'poor';
  color: string;
  label: string;
} => {
  if (roiPercentage > 100) {
    return { level: 'excellent', color: 'green', label: 'Excellent' };
  } else if (roiPercentage >= 50) {
    return { level: 'good', color: 'yellow-green', label: 'Good' };
  } else if (roiPercentage >= 0) {
    return { level: 'moderate', color: 'yellow', label: 'Moderate' };
  } else {
    return { level: 'poor', color: 'red', label: 'Poor' };
  }
};
```

---

## Next Steps

Continue to:
- **[Part 1: API Endpoints](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_1_API.md)** - Full API reference
- **[Part 3: Implementation Guide](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)** - Frontend implementation, React Query, and UI components

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Backend Module**: License Performance Metrics  
**Status**: ✅ Complete & Production Ready
