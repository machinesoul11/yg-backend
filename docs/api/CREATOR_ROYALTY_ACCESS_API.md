# Creator Royalty Access API Documentation

## Overview

This document provides a reference for the creator-facing royalty API endpoints. These endpoints allow authenticated creators to access their earnings data, view statements, generate forecasts, analyze historical performance, and file disputes.

**Base URL:** `/api/me/royalties` and `/api/royalties`

---

## Authentication

All endpoints require authentication. Creators can only access their own royalty data.

### Authorization

- **Required Role:** Creator (must have a creator profile)
- **Authentication Methods:** 
  - Session cookies (recommended for web applications)
  - Bearer tokens
  - API keys

---

## Endpoints

### 1. Get Creator's Royalty Statements

**Endpoint:** `GET /api/me/royalties/statements`  
**Authorization:** Creator only  
**Description:** Retrieve all royalty statements for the authenticated creator with pagination and filtering.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 20 | Items per page (max 100) |
| `status` | string | No | - | Filter by status |
| `sortBy` | string | No | createdAt | Sort field |
| `sortOrder` | string | No | desc | Sort order (asc/desc) |
| `date_from` | string (ISO 8601) | No | - | Filter from date |
| `date_to` | string (ISO 8601) | No | - | Filter to date |

**Valid Status Values:** `PENDING`, `REVIEWED`, `DISPUTED`, `RESOLVED`, `PAID`  
**Valid Sort By:** `createdAt`, `totalEarningsCents`, `paidAt`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "clx123abc...",
      "period": {
        "start": "2025-01-01T00:00:00.000Z",
        "end": "2025-01-31T23:59:59.999Z"
      },
      "totalEarningsCents": 125000,
      "platformFeeCents": 12500,
      "netPayableCents": 112500,
      "status": "PAID",
      "lineItemCount": 15,
      "reviewedAt": "2025-02-05T14:30:00.000Z",
      "disputedAt": null,
      "disputeReason": null,
      "paidAt": "2025-02-10T10:00:00.000Z",
      "paymentReference": "po_abc123",
      "pdfAvailable": true,
      "createdAt": "2025-02-01T08:00:00.000Z",
      "updatedAt": "2025-02-10T10:00:00.000Z"
    }
  ],
  "summary": {
    "totalEarnings": 500000,
    "totalPaid": 350000,
    "totalPending": 150000,
    "statementCount": 6
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 6,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

#### Error Responses

- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Server error

---

### 2. Get Earnings Summary

**Endpoint:** `GET /api/me/royalties/earnings`  
**Authorization:** Creator only  
**Description:** Get comprehensive earnings analytics including breakdown by time period, top earning assets, and growth metrics.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date_from` | string (ISO 8601) | No | 12 months ago | Start date |
| `date_to` | string (ISO 8601) | No | Now | End date |
| `group_by` | string | No | month | Grouping period |

**Valid Group By:** `day`, `week`, `month`, `year`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEarningsCents": 500000,
      "totalPaidCents": 350000,
      "totalPendingCents": 150000,
      "avgEarningsPerPeriodCents": 41667,
      "highestEarningPeriod": {
        "period": "2025-01",
        "earningsCents": 75000
      },
      "statementCount": 12
    },
    "breakdown": [
      {
        "period": "2024-02",
        "earnings": 35000,
        "paid": 35000,
        "pending": 0
      },
      {
        "period": "2024-03",
        "earnings": 42000,
        "paid": 42000,
        "pending": 0
      }
    ],
    "topAssets": [
      {
        "id": "asset123",
        "title": "Photography Portfolio",
        "type": "IMAGE",
        "totalEarningsCents": 125000,
        "licenseCount": 8
      }
    ],
    "growth": {
      "currentPeriodCents": 55000,
      "previousPeriodCents": 42000,
      "growthRate": 30.95,
      "trend": "up"
    },
    "period": {
      "from": "2024-02-01T00:00:00.000Z",
      "to": "2025-02-01T00:00:00.000Z",
      "groupBy": "month"
    }
  }
}
```

#### Error Responses

- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Server error

---

### 3. Get Earnings Forecast

**Endpoint:** `GET /api/me/royalties/forecast`  
**Authorization:** Creator only  
**Description:** Get projected future earnings based on historical data and trends.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | No | 30 | Forecast period in days |
| `confidence_level` | string | No | moderate | Confidence level |

**Valid Confidence Levels:** `conservative`, `moderate`, `optimistic`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "available": true,
    "forecast": {
      "periodDays": 30,
      "projectedEarningsCents": 48000,
      "confidenceLevel": "moderate",
      "range": {
        "lowCents": 35000,
        "highCents": 61000
      }
    },
    "methodology": {
      "approach": "Moving Average with Linear Trend",
      "historicalPeriodMonths": 12,
      "dataPointsUsed": 12,
      "confidenceNote": "Moderate forecast based on historical average with linear trend adjustment. Most likely scenario."
    },
    "comparison": {
      "recentAvgMonthlyEarningsCents": 45000,
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

#### Insufficient Data Response (200 OK)

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

#### Error Responses

- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Server error

---

### 4. Get Historical Earnings Data

**Endpoint:** `GET /api/me/royalties/history`  
**Authorization:** Creator only  
**Description:** Get time-series historical earnings data with analytics including moving averages, growth rates, and volatility metrics.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from_date` | string (ISO 8601) | No | 24 months ago | Start date |
| `to_date` | string (ISO 8601) | No | Now | End date |
| `granularity` | string | No | monthly | Time granularity |

**Valid Granularity:** `daily`, `weekly`, `monthly`, `yearly`

**Date Range Limits:**
- Daily: Maximum 365 days
- Weekly: Maximum 730 days (2 years)
- Monthly/Yearly: Maximum 3650 days (10 years)

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "timeSeries": [
      {
        "period": "2024-01",
        "earningsCents": 35000,
        "transactionCount": 12,
        "paidCount": 1,
        "movingAvg3Cents": null,
        "movingAvg6Cents": null,
        "cumulativeEarningsCents": 35000
      },
      {
        "period": "2024-02",
        "earningsCents": 42000,
        "transactionCount": 15,
        "paidCount": 1,
        "movingAvg3Cents": null,
        "movingAvg6Cents": null,
        "cumulativeEarningsCents": 77000
      },
      {
        "period": "2024-03",
        "earningsCents": 38000,
        "transactionCount": 13,
        "paidCount": 1,
        "movingAvg3Cents": 38333,
        "movingAvg6Cents": null,
        "cumulativeEarningsCents": 115000
      }
    ],
    "summary": {
      "totalEarningsCents": 500000,
      "avgEarningsPerPeriodCents": 41667,
      "periodCount": 12,
      "highestEarningPeriod": {
        "period": "2024-08",
        "earningsCents": 55000
      },
      "lowestEarningPeriod": {
        "period": "2024-02",
        "earningsCents": 32000
      },
      "overallGrowthRatePct": 15.5,
      "volatility": {
        "stdDevCents": 7500,
        "coefficientOfVariationPct": 18,
        "interpretation": "Low volatility - Stable earnings"
      }
    },
    "period": {
      "from": "2024-02-01T00:00:00.000Z",
      "to": "2025-02-01T00:00:00.000Z",
      "granularity": "monthly",
      "daysSpan": 365
    }
  }
}
```

#### Error Responses

- `400 Bad Request` - Invalid query parameters or date range too large
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Server error

---

### 5. Create Statement Dispute

**Endpoint:** `POST /api/royalties/statements/:id/dispute`  
**Authorization:** Creator only (must own the statement)  
**Description:** File a dispute for a royalty statement.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Statement ID |

#### Request Body

```json
{
  "reason": "Missing earnings from licensed content",
  "description": "The statement is missing earnings from my photo portfolio licensed to Brand X in December 2024. The license agreement shows usage that should have generated royalties.",
  "evidenceUrls": [
    "https://storage.example.com/evidence/license-agreement.pdf",
    "https://storage.example.com/evidence/usage-report.pdf"
  ]
}
```

#### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Brief reason (10-2000 chars) |
| `description` | string | No | Detailed explanation |
| `evidenceUrls` | array | No | URLs to supporting documents |

#### Success Response (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "stmt123",
    "status": "DISPUTED",
    "disputedAt": "2025-02-15T14:30:00.000Z",
    "disputeReason": "Missing earnings from licensed content",
    "message": "Dispute submitted successfully"
  },
  "meta": {
    "nextSteps": [
      "Your dispute has been received and will be reviewed by our finance team",
      "You will receive an email confirmation shortly",
      "Expected review time: 5-7 business days",
      "You can check the status of your dispute in your earnings dashboard"
    ],
    "supportContact": "support@yesgoddess.com"
  }
}
```

#### Error Responses

- `400 Bad Request` - Invalid request body or validation error
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Statement not owned by creator or dispute window closed
- `404 Not Found` - Statement or creator profile not found
- `409 Conflict` - Statement already disputed
- `500 Internal Server Error` - Server error

#### Dispute Rules

1. **Already Disputed:** Cannot dispute a statement that is already in DISPUTED status
2. **Paid Statements:** Can dispute paid statements within 90 days of payment date
3. **Ownership:** Can only dispute statements that belong to the authenticated creator

---

## Common Error Responses

All endpoints may return the following common error responses:

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

### 404 Creator Not Found

```json
{
  "success": false,
  "error": "Not found",
  "message": "Creator profile not found. This endpoint is only accessible to creators."
}
```

### 400 Validation Error

```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "field": "date_from",
      "message": "Invalid date format"
    }
  ]
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

All creator royalty endpoints are subject to rate limiting:

- **Authenticated Requests:** 100 requests per minute per user
- **Dispute Endpoint:** 10 requests per hour per user

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets (Unix timestamp)

---

## Best Practices

### 1. Pagination

- Always use pagination for list endpoints to avoid performance issues
- Default page size is 20, maximum is 100
- Use `hasNextPage` and `hasPreviousPage` to navigate results

### 2. Date Filtering

- Use ISO 8601 format for all date parameters: `YYYY-MM-DDTHH:mm:ss.sssZ`
- Be mindful of timezone differences
- Validate date ranges before making requests

### 3. Caching

- Earnings summaries for completed periods rarely change
- Consider caching responses client-side with appropriate TTLs
- Use `updatedAt` timestamps to detect changes

### 4. Error Handling

- Always check the `success` field in responses
- Handle all documented error status codes
- Display user-friendly error messages

### 5. Disputes

- Provide detailed reasons and evidence when filing disputes
- Keep evidence URLs accessible for at least 90 days
- Monitor dispute status regularly

---

## Changelog

### Version 1.0 (February 2025)

- Initial release of creator royalty access endpoints
- Added statements, earnings, forecast, and history endpoints
- Added dispute creation functionality
