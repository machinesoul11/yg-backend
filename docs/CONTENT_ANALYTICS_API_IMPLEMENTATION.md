# Content Analytics API Implementation

## Overview

The Content Analytics API provides platform-wide analytics for administrators to monitor asset uploads, license activity, and project progress. These endpoints are designed for internal admin dashboards and reporting tools.

## Endpoints

### 1. GET /api/analytics/platform/assets

**Purpose**: Provides upload trends and popular asset type analytics.

**Authentication**: Required (ADMIN only)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | Yes | Start date in YYYY-MM-DD format |
| endDate | string | Yes | End date in YYYY-MM-DD format |
| granularity | enum | No | Time bucket: 'daily', 'weekly', 'monthly' (default: 'daily') |
| assetType | enum | No | Filter by asset type: IMAGE, VIDEO, AUDIO, DOCUMENT, THREE_D, OTHER |
| projectId | string | No | Filter by project ID |
| status | enum | No | Filter by status: DRAFT, PROCESSING, REVIEW, APPROVED, PUBLISHED, REJECTED, ARCHIVED |

**Example Request**:
```bash
curl -X GET "https://api.yesgoddess.agency/api/analytics/platform/assets?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response**:
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "weekly",
  "uploadTrends": [
    {
      "date": "2024-10-01",
      "count": 45,
      "byType": {
        "IMAGE": 20,
        "VIDEO": 15,
        "AUDIO": 10
      }
    }
  ],
  "popularTypes": [
    {
      "type": "IMAGE",
      "count": 120,
      "percentage": 45.5,
      "averageFileSizeBytes": 2048576,
      "totalStorageBytes": 245923200,
      "topMimeTypes": [
        {
          "mimeType": "image/jpeg",
          "count": 80
        },
        {
          "mimeType": "image/png",
          "count": 40
        }
      ]
    }
  ],
  "summary": {
    "totalUploads": 264,
    "growthRate": 12.5,
    "totalStorageBytes": 1073741824,
    "averageFileSizeBytes": 4067200,
    "uploadsByStatus": {
      "PUBLISHED": 200,
      "DRAFT": 30,
      "REVIEW": 20,
      "PROCESSING": 14
    }
  },
  "metadata": {
    "cached": false,
    "queryExecutionTimeMs": 145
  }
}
```

**Response Fields**:
- `uploadTrends`: Time-series data showing upload counts by date and type
- `popularTypes`: Ranked list of asset types with detailed metrics
- `summary.totalUploads`: Total assets uploaded in period
- `summary.growthRate`: Percentage change vs previous period
- `summary.totalStorageBytes`: Total storage consumed
- `summary.uploadsByStatus`: Breakdown by asset status

---

### 2. GET /api/analytics/platform/licenses

**Purpose**: Provides active license counts and renewal rate metrics.

**Authentication**: Required (ADMIN only)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | Yes | Start date in YYYY-MM-DD format |
| endDate | string | Yes | End date in YYYY-MM-DD format |
| granularity | enum | No | Time bucket: 'daily', 'weekly', 'monthly' (default: 'daily') |
| licenseType | enum | No | Filter by type: EXCLUSIVE, NON_EXCLUSIVE, EXCLUSIVE_TERRITORY |
| brandId | string | No | Filter by brand ID |
| projectId | string | No | Filter by project ID |

**Example Request**:
```bash
curl -X GET "https://api.yesgoddess.agency/api/analytics/platform/licenses?startDate=2024-10-01&endDate=2024-10-31&granularity=monthly" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response**:
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "monthly",
  "activeCount": 342,
  "statusBreakdown": [
    {
      "status": "ACTIVE",
      "count": 300,
      "percentage": 75.0
    },
    {
      "status": "EXPIRING_SOON",
      "count": 42,
      "percentage": 10.5
    },
    {
      "status": "EXPIRED",
      "count": 58,
      "percentage": 14.5
    }
  ],
  "renewalRates": [
    {
      "date": "2024-10-01",
      "totalExpired": 20,
      "renewed": 16,
      "renewalRate": 80.0,
      "earlyRenewals": 5,
      "lateRenewals": 2
    }
  ],
  "expirationForecast": [
    {
      "period": "30 days",
      "daysFromNow": 30,
      "expiringCount": 28,
      "licenses": [
        {
          "id": "lic_abc123",
          "endDate": "2024-11-15T00:00:00.000Z",
          "type": "EXCLUSIVE",
          "feeCents": 500000,
          "autoRenew": true
        }
      ]
    }
  ],
  "revenueMetrics": {
    "totalRevenueCents": 15000000,
    "averageLicenseValueCents": 50000,
    "medianLicenseValueCents": 35000,
    "revenueByType": {
      "EXCLUSIVE": 8000000,
      "NON_EXCLUSIVE": 7000000
    },
    "projectedAnnualRevenueCents": 180000000
  },
  "summary": {
    "totalLicenses": 400,
    "activePercentage": 85.5,
    "averageRenewalRate": 78.5,
    "averageLicenseDurationDays": 365,
    "autoRenewPercentage": 45.2,
    "comparisonToPreviousPeriod": {
      "activeLicensesChange": 5.2,
      "renewalRateChange": 2.1,
      "revenueChange": 8.3
    }
  },
  "metadata": {
    "cached": true,
    "cacheTimestamp": "2024-10-17T10:30:00.000Z",
    "queryExecutionTimeMs": 89
  }
}
```

**Response Fields**:
- `activeCount`: Current number of active licenses
- `statusBreakdown`: Distribution across all statuses
- `renewalRates`: Time-series showing renewal performance
- `expirationForecast`: Upcoming expirations in 30/60/90 day windows
- `revenueMetrics`: Financial metrics including projections
- `summary.averageRenewalRate`: Overall renewal success rate
- `summary.autoRenewPercentage`: Percentage with auto-renew enabled

---

### 3. GET /api/analytics/platform/projects

**Purpose**: Provides project completion rates and timeline metrics.

**Authentication**: Required (ADMIN only)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | Yes | Start date in YYYY-MM-DD format |
| endDate | string | Yes | End date in YYYY-MM-DD format |
| granularity | enum | No | Time bucket: 'daily', 'weekly', 'monthly' (default: 'daily') |
| projectType | enum | No | Filter by type: CAMPAIGN, CONTENT, LICENSING |
| brandId | string | No | Filter by brand ID |
| status | enum | No | Filter by status: DRAFT, ACTIVE, IN_PROGRESS, COMPLETED, CANCELLED, ARCHIVED |

**Example Request**:
```bash
curl -X GET "https://api.yesgoddess.agency/api/analytics/platform/projects?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly&projectType=CAMPAIGN" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response**:
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "weekly",
  "completionRates": {
    "overall": 68.5,
    "onTime": 55.0,
    "late": 30.0,
    "early": 15.0,
    "byType": {
      "CAMPAIGN": 72.0,
      "CONTENT": 65.0,
      "LICENSING": 70.0
    },
    "timeline": [
      {
        "date": "2024-10-01",
        "completed": 12,
        "onTime": 8,
        "late": 4
      }
    ]
  },
  "timelineMetrics": {
    "averageDurationDays": 45,
    "medianDurationDays": 42,
    "onTimePercentage": 55.0,
    "averageDelayDays": 7,
    "averageEarlyCompletionDays": 3,
    "byStatus": [
      {
        "status": "COMPLETED",
        "count": 89,
        "averageDurationDays": 43
      },
      {
        "status": "IN_PROGRESS",
        "count": 34,
        "averageDurationDays": 28
      }
    ]
  },
  "activeProjects": {
    "draft": 15,
    "active": 45,
    "inProgress": 34,
    "completed": 89,
    "cancelled": 8,
    "archived": 12,
    "byType": {
      "CAMPAIGN": 80,
      "CONTENT": 65,
      "LICENSING": 58
    }
  },
  "budgetMetrics": {
    "averageBudgetCents": 10000000,
    "medianBudgetCents": 7500000,
    "totalBudgetCents": 1500000000,
    "utilizationRate": 85.3,
    "overBudgetCount": 12,
    "underBudgetCount": 102,
    "byType": {
      "CAMPAIGN": {
        "averageBudgetCents": 12000000,
        "totalBudgetCents": 960000000
      }
    }
  },
  "trendData": [
    {
      "date": "2024-10-01",
      "created": 18,
      "completed": 12,
      "active": 45,
      "completionRate": 66.7
    }
  ],
  "summary": {
    "totalProjects": 203,
    "completionRate": 68.5,
    "averageAssetsPerProject": 12.5,
    "averageLicensesPerProject": 3.2,
    "averageTeamSize": 2,
    "comparisonToPreviousPeriod": {
      "projectsCreatedChange": 8.5,
      "completionRateChange": 3.2,
      "averageDurationChange": -5.0
    }
  },
  "metadata": {
    "cached": false,
    "queryExecutionTimeMs": 234
  }
}
```

**Response Fields**:
- `completionRates`: Overall and timeline-specific completion metrics
- `timelineMetrics`: Duration and on-time performance analysis
- `activeProjects`: Current state breakdown by status and type
- `budgetMetrics`: Budget allocation and utilization metrics
- `trendData`: Time-series showing project activity
- `summary.averageAssetsPerProject`: Asset utilization per project
- `summary.averageLicensesPerProject`: Licensing activity per project

---

## Common Features

### Authentication

All endpoints require:
- Valid JWT bearer token in Authorization header
- User must have ADMIN role
- Active, non-deleted account

**Error Response (401 Unauthorized)**:
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Error Response (403 Forbidden)**:
```json
{
  "error": "Forbidden",
  "message": "This endpoint requires administrator privileges"
}
```

### Date Range Validation

All endpoints validate:
- Date format must be YYYY-MM-DD
- Start date must be before or equal to end date
- End date cannot be in the future
- Maximum range: 730 days (2 years)

**Error Response (400 Bad Request)**:
```json
{
  "error": "Invalid Date Range",
  "message": "Date range cannot exceed 730 days"
}
```

### Caching

- Results are cached in Redis for 10 minutes (600 seconds)
- Cache keys include all query parameters for accurate cache hits
- `metadata.cached` indicates if response was served from cache
- `metadata.cacheTimestamp` shows when cache was written

### Performance

- Queries use database indexes on `created_at`, `updated_at`, `deleted_at`
- Complex aggregations use pre-aggregated `daily_metrics` table where available
- Query timeout protection prevents long-running queries
- Parallel query execution for independent metrics

### Rate Limiting

Admin endpoints are not subject to standard rate limits but should still be used responsibly. Avoid polling at intervals shorter than the cache TTL.

---

## Integration Examples

### Dashboard Widget - Asset Upload Trends

```typescript
async function fetchAssetTrends(days: number = 30) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const response = await fetch(
    `/api/analytics/platform/assets?startDate=${startDate}&endDate=${endDate}&granularity=daily`,
    {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch asset trends');
  }

  return await response.json();
}
```

### Report Generation - License Renewals

```typescript
async function generateRenewalReport(month: string) {
  // month format: "2024-10"
  const [year, monthNum] = month.split('-');
  const startDate = `${year}-${monthNum}-01`;
  const endDate = new Date(parseInt(year), parseInt(monthNum), 0)
    .toISOString()
    .split('T')[0];

  const response = await fetch(
    `/api/analytics/platform/licenses?startDate=${startDate}&endDate=${endDate}&granularity=monthly`,
    {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate renewal report');
  }

  const data = await response.json();
  
  return {
    period: month,
    renewalRate: data.summary.averageRenewalRate,
    expiring: data.expirationForecast[0].expiringCount,
    revenue: data.revenueMetrics.totalRevenueCents / 100,
  };
}
```

### Alert System - Project Delays

```typescript
async function checkProjectDelays() {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const response = await fetch(
    `/api/analytics/platform/projects?startDate=${startDate}&endDate=${endDate}&granularity=weekly`,
    {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to check project delays');
  }

  const data = await response.json();

  // Alert if late completion rate exceeds threshold
  if (data.completionRates.late > 40) {
    sendAlert({
      type: 'project_delays',
      message: `${data.completionRates.late}% of projects completed late`,
      averageDelay: data.timelineMetrics.averageDelayDays,
    });
  }
}
```

---

## Architecture Notes

### Service Layer

Each endpoint is backed by a dedicated service class:
- `PlatformAssetsAnalyticsService`
- `PlatformLicensesAnalyticsService`
- `PlatformProjectsAnalyticsService`

Services are located in `src/modules/analytics/services/` and can be imported for use in other contexts (e.g., scheduled reports, webhooks).

### Database Queries

Services primarily use:
- Prisma ORM for type-safe queries
- Raw SQL with `$queryRaw` for complex aggregations
- Existing database indexes for performance
- `daily_metrics` table for pre-aggregated data where appropriate

### Cache Strategy

Cache invalidation can be triggered:
- Automatically after 10 minutes (TTL)
- Manually via service methods: `invalidateCache()`
- On relevant data mutations (e.g., new asset uploads)

---

## Troubleshooting

### Slow Query Performance

**Issue**: Queries taking longer than expected

**Solutions**:
- Reduce date range
- Add filters (assetType, projectType, brandId)
- Check database indexes: `created_at`, `updated_at`, `deleted_at`
- Review query execution plan with EXPLAIN ANALYZE

### Unexpected Cache Misses

**Issue**: Low cache hit rate

**Causes**:
- Query parameters changing (even order matters)
- Cache invalidation too aggressive
- Redis memory limits causing eviction

**Solutions**:
- Standardize query parameter order in client code
- Increase Redis memory allocation
- Monitor cache hit/miss ratio with Redis INFO

### Authorization Errors

**Issue**: 403 Forbidden despite valid token

**Causes**:
- User role is not ADMIN
- Token role claim not set correctly
- User account soft-deleted

**Solutions**:
- Verify token payload includes `role: 'ADMIN'`
- Check user record in database: `deleted_at` should be null
- Regenerate token if role changed

---

## Future Enhancements

Potential additions based on usage patterns:

1. **Export Capabilities**: CSV/PDF export of analytics data
2. **Custom Date Ranges**: Named periods like "Last Quarter", "YTD"
3. **Real-time Updates**: WebSocket support for live dashboards
4. **Comparative Analysis**: Year-over-year, quarter-over-quarter comparisons
5. **Drill-down Details**: Link from aggregates to individual records
6. **Custom Metrics**: User-defined calculations and KPIs
7. **Forecasting**: ML-based predictions for trends
8. **Anomaly Detection**: Automated alerts for unusual patterns

---

## Related Documentation

- [Platform Analytics Service](../modules/PLATFORM_ANALYTICS.md)
- [Analytics Aggregation Jobs](../infrastructure/ANALYTICS_JOBS.md)
- [Authentication Guide](./AUTH_IMPLEMENTATION.md)
- [Admin Dashboard Integration](../frontend-integration/ADMIN_DASHBOARD.md)
