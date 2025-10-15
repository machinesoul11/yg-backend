# Royalty Management API Endpoints

## Overview

This document provides a reference for the royalty management REST API endpoints. These endpoints allow administrators to manage royalty calculation runs and allow both administrators and creators to view royalty statements.

**Base URL:** `/api/royalties`

---

## Authentication

All endpoints require authentication via:
- Session cookies (recommended for web applications)
- Bearer tokens
- API keys

### Authorization Matrix

| Endpoint | Admin | Creator | Notes |
|----------|-------|---------|-------|
| `POST /royalties/run` | ✅ | ❌ | Admin only |
| `GET /royalties/runs` | ✅ | ❌ | Admin only |
| `GET /royalties/runs/:id` | ✅ | ❌ | Admin only |
| `POST /royalties/runs/:id/lock` | ✅ | ❌ | Admin only |
| `GET /royalties/statements` | ✅ | ✅ | Creators see own statements |
| `GET /royalties/statements/:id` | ✅ | ✅ | Creators see own statements |
| `GET /royalties/statements/:id/lines` | ✅ | ✅ | Creators see own line items |

---

## Endpoints

### 1. Create Royalty Run

**Endpoint:** `POST /api/royalties/run`  
**Authorization:** Admin only  
**Description:** Create a new royalty calculation run and optionally start calculation immediately.

#### Request Body

```json
{
  "periodStart": "2025-01-01T00:00:00.000Z",
  "periodEnd": "2025-01-31T23:59:59.999Z",
  "notes": "January 2025 royalties",
  "autoCalculate": true
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `periodStart` | string (ISO 8601) | Yes | Start date of royalty period |
| `periodEnd` | string (ISO 8601) | Yes | End date of royalty period |
| `notes` | string | No | Optional notes about this run |
| `autoCalculate` | boolean | No | Auto-start calculation (default: true) |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "clx123abc...",
    "periodStart": "2025-01-01T00:00:00.000Z",
    "periodEnd": "2025-01-31T23:59:59.999Z",
    "status": "PROCESSING",
    "notes": "January 2025 royalties",
    "createdBy": {
      "id": "user123",
      "name": "Admin User",
      "email": "admin@yesgoddess.agency"
    },
    "createdAt": "2025-01-15T10:30:00.000Z"
  },
  "message": "Royalty run created and calculation initiated"
}
```

#### Error Responses

- `400 Bad Request` - Invalid date range or validation error
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not an admin user
- `500 Internal Server Error` - Server error

---

### 2. List Royalty Runs

**Endpoint:** `GET /api/royalties/runs`  
**Authorization:** Admin only  
**Description:** List all royalty runs with pagination and filtering.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 20 | Items per page (max 100) |
| `status` | string | No | - | Filter by status |
| `sortBy` | string | No | createdAt | Sort field |
| `sortOrder` | string | No | desc | Sort order (asc/desc) |

**Valid Status Values:** `DRAFT`, `PROCESSING`, `CALCULATED`, `LOCKED`, `FAILED`  
**Valid Sort By:** `periodStart`, `periodEnd`, `createdAt`, `status`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "clx123abc...",
      "periodStart": "2025-01-01T00:00:00.000Z",
      "periodEnd": "2025-01-31T23:59:59.999Z",
      "status": "CALCULATED",
      "totalRevenueCents": 50000000,
      "totalRoyaltiesCents": 35000000,
      "statementCount": 25,
      "processedAt": "2025-01-15T10:45:00.000Z",
      "lockedAt": null,
      "notes": "January 2025 royalties",
      "createdBy": {
        "id": "user123",
        "name": "Admin User",
        "email": "admin@yesgoddess.agency"
      },
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 50,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

### 3. Get Royalty Run Details

**Endpoint:** `GET /api/royalties/runs/:id`  
**Authorization:** Admin only  
**Description:** Get detailed information about a specific royalty run.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Royalty run ID |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "clx123abc...",
    "periodStart": "2025-01-01T00:00:00.000Z",
    "periodEnd": "2025-01-31T23:59:59.999Z",
    "status": "CALCULATED",
    "totalRevenueCents": 50000000,
    "totalRoyaltiesCents": 35000000,
    "processedAt": "2025-01-15T10:45:00.000Z",
    "lockedAt": null,
    "notes": "January 2025 royalties",
    "createdBy": {
      "id": "user123",
      "name": "Admin User",
      "email": "admin@yesgoddess.agency"
    },
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:45:00.000Z",
    "summary": {
      "totalCreators": 25,
      "totalLineItems": 450,
      "statementsByStatus": {
        "PENDING": 20,
        "REVIEWED": 5
      },
      "averageEarningsPerCreator": 1400000
    },
    "statements": [
      {
        "id": "stmt123",
        "creator": {
          "id": "creator123",
          "userId": "user456",
          "name": "Jane Creator",
          "email": "jane@example.com",
          "stageName": "Jane Doe"
        },
        "totalEarningsCents": 1500000,
        "platformFeeCents": 150000,
        "netPayableCents": 1350000,
        "status": "PENDING",
        "lineItemCount": 18,
        "reviewedAt": null,
        "disputedAt": null,
        "paidAt": null,
        "createdAt": "2025-01-15T10:45:00.000Z"
      }
    ]
  }
}
```

#### Error Responses

- `404 Not Found` - Run not found
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not an admin user

---

### 4. Lock Royalty Run

**Endpoint:** `POST /api/royalties/runs/:id/lock`  
**Authorization:** Admin only  
**Description:** Finalize and lock a royalty run to prevent further modifications.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Royalty run ID |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "clx123abc...",
    "periodStart": "2025-01-01T00:00:00.000Z",
    "periodEnd": "2025-01-31T23:59:59.999Z",
    "status": "LOCKED",
    "totalRevenueCents": 50000000,
    "totalRoyaltiesCents": 35000000,
    "statementCount": 25,
    "processedAt": "2025-01-15T10:45:00.000Z",
    "lockedAt": "2025-01-16T09:00:00.000Z",
    "lockedBy": {
      "id": "user123",
      "name": "Admin User",
      "email": "admin@yesgoddess.agency"
    },
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-16T09:00:00.000Z"
  },
  "message": "Royalty run locked successfully"
}
```

#### Error Responses

- `400 Bad Request` - Run not in lockable state or has disputed statements
- `404 Not Found` - Run not found
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not an admin user

---

### 5. List Royalty Statements

**Endpoint:** `GET /api/royalties/statements`  
**Authorization:** Admin or Creator  
**Description:** List royalty statements with filtering. Creators can only see their own statements.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 20 | Items per page (max 100) |
| `creatorId` | string | No | - | Filter by creator (admin only) |
| `runId` | string | No | - | Filter by run ID |
| `status` | string | No | - | Filter by status |
| `sortBy` | string | No | createdAt | Sort field |
| `sortOrder` | string | No | desc | Sort order (asc/desc) |

**Valid Status Values:** `PENDING`, `REVIEWED`, `DISPUTED`, `RESOLVED`, `PAID`  
**Valid Sort By:** `createdAt`, `totalEarningsCents`, `paidAt`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "stmt123",
      "royaltyRun": {
        "id": "run123",
        "periodStart": "2025-01-01T00:00:00.000Z",
        "periodEnd": "2025-01-31T23:59:59.999Z",
        "status": "LOCKED"
      },
      "creator": {
        "id": "creator123",
        "userId": "user456",
        "name": "Jane Creator",
        "email": "jane@example.com",
        "stageName": "Jane Doe"
      },
      "totalEarningsCents": 1500000,
      "platformFeeCents": 150000,
      "netPayableCents": 1350000,
      "status": "PENDING",
      "lineItemCount": 18,
      "reviewedAt": null,
      "disputedAt": null,
      "disputeReason": null,
      "paidAt": null,
      "paymentReference": null,
      "pdfAvailable": true,
      "createdAt": "2025-01-15T10:45:00.000Z",
      "updatedAt": "2025-01-15T10:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 25,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

### 6. Get Statement Details

**Endpoint:** `GET /api/royalties/statements/:id`  
**Authorization:** Admin or Statement Owner (Creator)  
**Description:** Get detailed information about a specific royalty statement.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Statement ID |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "stmt123",
    "royaltyRun": {
      "id": "run123",
      "periodStart": "2025-01-01T00:00:00.000Z",
      "periodEnd": "2025-01-31T23:59:59.999Z",
      "status": "LOCKED",
      "lockedAt": "2025-01-16T09:00:00.000Z",
      "createdBy": {
        "id": "user123",
        "name": "Admin User",
        "email": "admin@yesgoddess.agency"
      }
    },
    "creator": {
      "id": "creator123",
      "userId": "user456",
      "name": "Jane Creator",
      "email": "jane@example.com",
      "stageName": "Jane Doe"
    },
    "totalEarningsCents": 1500000,
    "platformFeeCents": 150000,
    "netPayableCents": 1350000,
    "status": "PENDING",
    "reviewedAt": null,
    "disputedAt": null,
    "disputeReason": null,
    "paidAt": null,
    "paymentReference": null,
    "pdfStorageKey": "documents/statements/2025/01/stmt123.pdf",
    "pdfGeneratedAt": "2025-01-15T10:46:00.000Z",
    "metadata": {},
    "createdAt": "2025-01-15T10:45:00.000Z",
    "updatedAt": "2025-01-15T10:45:00.000Z",
    "summary": {
      "totalLineItems": 18,
      "totalRevenueCents": 1500000,
      "lineItemsByAsset": [
        {
          "ipAsset": {
            "id": "asset123",
            "title": "Photography Collection",
            "type": "PHOTO"
          },
          "totalRevenueCents": 800000,
          "totalRoyaltyCents": 640000,
          "lineCount": 10
        }
      ]
    }
  }
}
```

#### Error Responses

- `404 Not Found` - Statement not found or creator not found
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not authorized to view this statement

---

### 7. Get Statement Line Items

**Endpoint:** `GET /api/royalties/statements/:id/lines`  
**Authorization:** Admin or Statement Owner (Creator)  
**Description:** Get detailed line items showing how royalties were calculated.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Statement ID |

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 50 | Items per page (max 500) |
| `sortBy` | string | No | createdAt | Sort field |
| `sortOrder` | string | No | asc | Sort order (asc/desc) |

**Valid Sort By:** `createdAt`, `calculatedRoyaltyCents`, `revenueCents`

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "line123",
      "ipAsset": {
        "id": "asset123",
        "title": "Photography Collection",
        "type": "PHOTO",
        "description": "Urban landscape photography"
      },
      "license": {
        "id": "license123",
        "licenseType": "COMMERCIAL",
        "status": "ACTIVE",
        "brand": {
          "id": "brand123",
          "companyName": "Acme Corp"
        }
      },
      "revenueCents": 100000,
      "shareBps": 8000,
      "calculatedRoyaltyCents": 80000,
      "periodStart": "2025-01-01T00:00:00.000Z",
      "periodEnd": "2025-01-31T23:59:59.999Z",
      "metadata": null,
      "createdAt": "2025-01-15T10:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalCount": 18,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "summary": {
    "totalRevenueCents": 1500000,
    "totalRoyaltyCents": 1200000
  }
}
```

**Special License Types:**
- `MANUAL_ADJUSTMENT` - Manual adjustment entry
- `CARRYOVER` - Carried over unpaid balance
- `THRESHOLD_NOTE` - Threshold notification
- `CORRECTION` - Correction entry

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

For validation errors:

```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "field": "periodStart",
      "message": "Invalid datetime format"
    }
  ]
}
```

---

## Rate Limiting

- All endpoints are subject to rate limiting
- Default limit: 100 requests per minute per IP/user
- Rate limit headers are included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

## Examples

### cURL Example: Create a Run

```bash
curl -X POST https://ops.yesgoddess.agency/api/royalties/run \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "periodStart": "2025-01-01T00:00:00.000Z",
    "periodEnd": "2025-01-31T23:59:59.999Z",
    "notes": "January 2025 royalties",
    "autoCalculate": true
  }'
```

### JavaScript Example: List Statements

```javascript
const response = await fetch('/api/royalties/statements?page=1&limit=20&status=PENDING', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
});

const { data, pagination } = await response.json();
console.log(`Found ${pagination.totalCount} statements`);
```

---

## Integration Notes

1. **Calculation Timing:** When `autoCalculate: true`, the calculation runs asynchronously. Poll the run details endpoint to check status.

2. **Locking:** Once a run is locked, statements cannot be modified. Ensure all disputes are resolved before locking.

3. **Creator Access:** Creators automatically see only their own statements. No additional filtering is needed.

4. **Pagination:** Always check `hasNextPage` and `hasPreviousPage` for navigation.

5. **Currency:** All amounts are in cents to avoid floating-point errors (e.g., `1500000` = $15,000.00).

---

## Related Documentation

- [Royalty Calculation Service](/docs/modules/royalties/README.md)
- [Royalty Statement Service](/docs/modules/royalties/services/royalty-statement.service.ts)
- [Authentication Middleware](/docs/middleware/ACCESS_CONTROL.md)
