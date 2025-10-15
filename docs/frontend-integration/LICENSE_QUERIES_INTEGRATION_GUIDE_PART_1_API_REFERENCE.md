# License Queries API - Frontend Integration Guide (Part 1: API Reference)

**Classification:** ⚡ HYBRID  
*License queries are used by both public-facing website (brand ↔ creator) and admin backend (operations management)*

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Request/Response Examples](#requestresponse-examples)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Authentication & Authorization](#authentication--authorization)

---

## 1. API Endpoints

All endpoints are accessed via tRPC at `https://ops.yesgoddess.agency/api/trpc/licenses.*`

### 1.1 GET /licenses (List with Filters)

**Endpoint:** `licenses.list`  
**Method:** Query  
**Auth:** Required (JWT)  
**Purpose:** Retrieve paginated list of licenses with advanced filtering

**Request Schema:**
```typescript
{
  // Filters (all optional)
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED';
  ipAssetId?: string;           // Filter by specific IP asset (CUID)
  brandId?: string;             // Filter by brand (CUID)
  projectId?: string;           // Filter by project (CUID)
  licenseType?: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  expiringBefore?: string;      // ISO 8601 datetime (e.g., "2025-12-31T23:59:59Z")
  creatorId?: string;           // Filter by creator (CUID)
  
  // Pagination
  page?: number;                // Default: 1, Min: 1
  pageSize?: number;            // Default: 20, Min: 1, Max: 100
}
```

**Response Schema:**
```typescript
{
  data: License[];              // Array of license objects (see Type Definitions)
  meta: {
    pagination: {
      page: number;             // Current page
      pageSize: number;         // Items per page
      total: number;            // Total matching records
      totalPages: number;       // Total pages available
    };
  };
}
```

**Notes:**
- **Auto-filters by role:** Brands see only their licenses, creators see licenses for their assets, admins see all
- **expiringBefore:** Automatically filters to ACTIVE status only
- **Multiple filters:** Can be combined (e.g., `ipAssetId` + `status` + `expiringBefore`)

---

### 1.2 GET /licenses/:id (Get License Details)

**Endpoint:** `licenses.getById`  
**Method:** Query  
**Auth:** Required (JWT)  
**Purpose:** Retrieve detailed information for a single license

**Request Schema:**
```typescript
{
  id: string;                   // License CUID
}
```

**Response Schema:**
```typescript
{
  data: License;                // Full license object with relations (see Type Definitions)
}
```

**Includes:**
- IP Asset details
- Brand information
- Project (if associated)
- Parent license (if renewal)
- Child renewals
- Creator ownership details

---

### 1.3 GET /licenses/conflicts (Conflict Detection)

**Endpoint:** `licenses.checkConflicts`  
**Method:** Query  
**Auth:** Required (JWT)  
**Purpose:** Check for licensing conflicts before creating/updating a license

**Request Schema:**
```typescript
{
  ipAssetId: string;            // IP Asset CUID
  startDate: string;            // ISO 8601 datetime
  endDate: string;              // ISO 8601 datetime
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  scope: LicenseScope;          // See Type Definitions
  excludeLicenseId?: string;    // Optional: Exclude this license ID (for updates)
}
```

**Response Schema:**
```typescript
{
  data: {
    hasConflicts: boolean;
    conflicts: Array<{
      licenseId: string;
      reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
      details: string;          // Human-readable description
      conflictingLicense?: {    // Partial license data
        id: string;
        brandId: string;
        startDate: string;
        endDate: string;
        licenseType: string;
      };
    }>;
  };
}
```

**Conflict Types:**
- **EXCLUSIVE_OVERLAP:** Exclusive license exists for same time period
- **TERRITORY_OVERLAP:** Geographic territory conflicts
- **COMPETITOR_BLOCKED:** Brand is blocked competitor
- **DATE_OVERLAP:** Non-exclusive licenses with scope conflicts

---

### 1.4 GET /licenses/:id/revenue (Revenue Tracking)

**Endpoint:** `licenses.getRevenue`  
**Method:** Query  
**Auth:** Required (JWT)  
**Purpose:** Retrieve comprehensive revenue data for a license

**Request Schema:**
```typescript
{
  id: string;                   // License CUID
}
```

**Response Schema:**
```typescript
{
  data: {
    licenseId: string;
    initialFeeCents: number;
    totalRevenueShareCents: number;
    totalRevenueCents: number;
    projectedRevenueCents: number;  // Based on current trends
    
    revenueByPeriod: Array<{
      period: string;           // Format: "YYYY-MM"
      startDate: string;        // ISO 8601
      endDate: string;          // ISO 8601
      revenueCents: number;
    }>;
    
    revenueByCreator: Array<{
      creatorId: string;
      creatorName: string;
      shareBps: number;         // Ownership share (0-10000)
      totalRevenueCents: number;
      paidCents: number;
      pendingCents: number;
    }>;
    
    usageMetrics?: {            // Optional: If tracking data exists
      totalImpressions: number;
      totalClicks: number;
      averageCostPerImpression: number;
    };
    
    paymentStatus: {
      totalPaid: number;
      totalPending: number;
      nextPaymentDate: string | null;  // ISO 8601 or null
    };
  };
}
```

**Notes:**
- Revenue is calculated from royalty statements and initial license fee
- Projected revenue uses linear extrapolation based on current rate
- Payment dates calculated based on `billingFrequency`

---

### 1.5 GET /licenses/stats (License Statistics)

**Endpoint:** `licenses.stats`  
**Method:** Query  
**Auth:** Required (JWT)  
**Purpose:** Get aggregate license statistics for dashboards

**Request Schema:**
```typescript
{
  brandId?: string;             // Optional: Filter to specific brand (auto-set for BRAND users)
}
```

**Response Schema:**
```typescript
{
  data: {
    totalActive: number;
    totalRevenueCents: number;
    expiringIn30Days: number;
    expiringIn60Days: number;
    expiringIn90Days: number;
    averageLicenseDurationDays: number;
    exclusiveLicenses: number;
    nonExclusiveLicenses: number;
    renewalRate: number;        // Percentage (0-100)
  };
}
```

---

## 2. Request/Response Examples

### 2.1 List Licenses by IP Asset

**Request (cURL):**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.list' \
  -H 'Authorization: Bearer <your_jwt_token>' \
  -H 'Content-Type: application/json' \
  --data-urlencode 'input={"json":{"ipAssetId":"clx1234567890abcd","page":1,"pageSize":20}}'
```

**Request (TypeScript with tRPC client):**
```typescript
const result = await trpc.licenses.list.query({
  ipAssetId: 'clx1234567890abcd',
  page: 1,
  pageSize: 20,
});
```

**Response (Success):**
```json
{
  "result": {
    "data": {
      "data": [
        {
          "id": "clx9876543210zyxw",
          "ipAssetId": "clx1234567890abcd",
          "brandId": "clxbrand123456789",
          "projectId": null,
          "licenseType": "EXCLUSIVE",
          "status": "ACTIVE",
          "startDate": "2025-01-01T00:00:00.000Z",
          "endDate": "2026-01-01T00:00:00.000Z",
          "signedAt": "2024-12-15T10:30:00.000Z",
          "feeCents": 50000,
          "feeDollars": 500,
          "revShareBps": 1000,
          "revSharePercent": 10,
          "paymentTerms": "Net 30",
          "billingFrequency": "MONTHLY",
          "scope": {
            "media": {
              "digital": true,
              "print": false,
              "broadcast": false,
              "ooh": false
            },
            "placement": {
              "social": true,
              "website": true,
              "email": false,
              "paid_ads": true,
              "packaging": false
            },
            "geographic": {
              "territories": ["US", "CA"]
            }
          },
          "autoRenew": false,
          "renewalNotifiedAt": null,
          "parentLicenseId": null,
          "signatureProof": "sha256:abc123...",
          "metadata": {},
          "createdAt": "2024-12-01T00:00:00.000Z",
          "updatedAt": "2024-12-15T10:30:00.000Z"
        }
      ],
      "meta": {
        "pagination": {
          "page": 1,
          "pageSize": 20,
          "total": 3,
          "totalPages": 1
        }
      }
    }
  }
}
```

---

### 2.2 List Expiring Licenses

**Request:**
```typescript
const expiringLicenses = await trpc.licenses.list.query({
  status: 'ACTIVE',  // Auto-applied when using expiringBefore
  expiringBefore: '2025-03-31T23:59:59Z',  // Next 90 days
  page: 1,
  pageSize: 50,
});
```

**Response:**
```json
{
  "result": {
    "data": {
      "data": [
        {
          "id": "clxexpiring123456",
          "endDate": "2025-02-15T00:00:00.000Z",
          "status": "ACTIVE",
          "...": "..."
        }
      ],
      "meta": {
        "pagination": {
          "page": 1,
          "pageSize": 50,
          "total": 12,
          "totalPages": 1
        }
      }
    }
  }
}
```

---

### 2.3 Check for Conflicts

**Request:**
```typescript
const conflictCheck = await trpc.licenses.checkConflicts.query({
  ipAssetId: 'clxasset123456789',
  startDate: '2025-06-01T00:00:00Z',
  endDate: '2025-12-31T23:59:59Z',
  licenseType: 'EXCLUSIVE',
  scope: {
    media: {
      digital: true,
      print: false,
      broadcast: false,
      ooh: false,
    },
    placement: {
      social: true,
      website: true,
      email: false,
      paid_ads: true,
      packaging: false,
    },
    geographic: {
      territories: ['US'],
    },
  },
});
```

**Response (No Conflicts):**
```json
{
  "result": {
    "data": {
      "data": {
        "hasConflicts": false,
        "conflicts": []
      }
    }
  }
}
```

**Response (With Conflicts):**
```json
{
  "result": {
    "data": {
      "data": {
        "hasConflicts": true,
        "conflicts": [
          {
            "licenseId": "clxconflict123456",
            "reason": "EXCLUSIVE_OVERLAP",
            "details": "Exclusive license already exists for this period (Acme Corp)",
            "conflictingLicense": {
              "id": "clxconflict123456",
              "brandId": "clxacmecorp78901",
              "startDate": "2025-05-01T00:00:00.000Z",
              "endDate": "2025-11-30T23:59:59.000Z",
              "licenseType": "EXCLUSIVE"
            }
          }
        ]
      }
    }
  }
}
```

---

### 2.4 Get License Revenue

**Request:**
```typescript
const revenue = await trpc.licenses.getRevenue.query({
  id: 'clxlicense1234567',
});
```

**Response:**
```json
{
  "result": {
    "data": {
      "data": {
        "licenseId": "clxlicense1234567",
        "initialFeeCents": 100000,
        "totalRevenueShareCents": 45000,
        "totalRevenueCents": 145000,
        "projectedRevenueCents": 180000,
        "revenueByPeriod": [
          {
            "period": "2025-01",
            "startDate": "2025-01-01T00:00:00.000Z",
            "endDate": "2025-01-31T23:59:59.000Z",
            "revenueCents": 15000
          },
          {
            "period": "2025-02",
            "startDate": "2025-02-01T00:00:00.000Z",
            "endDate": "2025-02-28T23:59:59.000Z",
            "revenueCents": 18000
          }
        ],
        "revenueByCreator": [
          {
            "creatorId": "clxcreator123456",
            "creatorName": "Jane Doe",
            "shareBps": 7000,
            "totalRevenueCents": 101500,
            "paidCents": 85000,
            "pendingCents": 16500
          },
          {
            "creatorId": "clxcreator789012",
            "creatorName": "John Smith",
            "shareBps": 3000,
            "totalRevenueCents": 43500,
            "paidCents": 35000,
            "pendingCents": 8500
          }
        ],
        "usageMetrics": {
          "totalImpressions": 1250000,
          "totalClicks": 32500,
          "averageCostPerImpression": 0.116
        },
        "paymentStatus": {
          "totalPaid": 120000,
          "totalPending": 25000,
          "nextPaymentDate": "2025-03-15T00:00:00.000Z"
        }
      }
    }
  }
}
```

---

### 2.5 Get Brand Statistics

**Request (Brand User):**
```typescript
// Brand users automatically get filtered to their own brandId
const stats = await trpc.licenses.stats.query({});
```

**Request (Admin User):**
```typescript
// Admins can specify any brandId or omit for platform-wide stats
const stats = await trpc.licenses.stats.query({
  brandId: 'clxbrand123456789',
});
```

**Response:**
```json
{
  "result": {
    "data": {
      "data": {
        "totalActive": 24,
        "totalRevenueCents": 2450000,
        "expiringIn30Days": 3,
        "expiringIn60Days": 7,
        "expiringIn90Days": 12,
        "averageLicenseDurationDays": 365,
        "exclusiveLicenses": 8,
        "nonExclusiveLicenses": 16,
        "renewalRate": 68.5
      }
    }
  }
}
```

---

## 3. TypeScript Type Definitions

### 3.1 Core License Interface

```typescript
/**
 * Complete license object returned by API
 */
export interface License {
  // Identifiers
  id: string;                               // CUID
  ipAssetId: string;                        // CUID
  brandId: string;                          // CUID
  projectId: string | null;                 // CUID or null
  
  // License Terms
  licenseType: LicenseType;
  status: LicenseStatus;
  startDate: string;                        // ISO 8601
  endDate: string;                          // ISO 8601
  signedAt: string | null;                  // ISO 8601 or null
  
  // Financial Terms
  feeCents: number;                         // Integer (cents)
  feeDollars: number;                       // Computed: feeCents / 100
  revShareBps: number;                      // Integer (0-10000)
  revSharePercent: number;                  // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  
  // Scope & Rules
  scope: LicenseScope;
  autoRenew: boolean;
  
  // Metadata
  renewalNotifiedAt: string | null;         // ISO 8601 or null
  parentLicenseId: string | null;           // CUID or null (for renewals)
  signatureProof: string | null;            // Cryptographic hash
  metadata: Record<string, any> | null;
  
  // Timestamps
  createdAt: string;                        // ISO 8601
  updatedAt: string;                        // ISO 8601
  
  // Optional Relations (when expanded)
  ipAsset?: IpAsset;
  brand?: Brand;
  project?: Project | null;
  parentLicense?: License;
  renewals?: License[];
}
```

---

### 3.2 Enums

```typescript
/**
 * License type enumeration
 */
export enum LicenseType {
  EXCLUSIVE = 'EXCLUSIVE',                  // Full exclusivity
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',         // Shared rights
  EXCLUSIVE_TERRITORY = 'EXCLUSIVE_TERRITORY' // Territory-specific exclusivity
}

/**
 * License status enumeration
 */
export enum LicenseStatus {
  DRAFT = 'DRAFT',                         // Being created
  PENDING_APPROVAL = 'PENDING_APPROVAL',   // Awaiting creator approval
  ACTIVE = 'ACTIVE',                       // Fully executed
  EXPIRED = 'EXPIRED',                     // Past end date
  TERMINATED = 'TERMINATED',               // Early termination
  SUSPENDED = 'SUSPENDED'                  // Temporarily suspended
}

/**
 * Billing frequency enumeration
 */
export enum BillingFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY'
}
```

---

### 3.3 License Scope

```typescript
/**
 * License scope defines permitted usage
 */
export interface LicenseScope {
  /** Media types permitted */
  media: {
    digital: boolean;                       // Online/digital content
    print: boolean;                         // Print materials
    broadcast: boolean;                     // TV/radio
    ooh: boolean;                          // Out-of-home (billboards, transit)
  };
  
  /** Placement channels permitted */
  placement: {
    social: boolean;                        // Social media
    website: boolean;                       // Brand website
    email: boolean;                         // Email marketing
    paid_ads: boolean;                      // Paid advertising
    packaging: boolean;                     // Product packaging
  };
  
  /** Geographic restrictions */
  geographic?: {
    territories: string[];                  // ISO country codes or ["GLOBAL"]
  };
  
  /** Exclusivity rules */
  exclusivity?: {
    category?: string;                      // Industry category (e.g., "Fashion")
    competitors?: string[];                 // Blocked competitor brand IDs
  };
  
  /** Content modification rules */
  cutdowns?: {
    allowEdits: boolean;                    // Can content be edited?
    maxDuration?: number;                   // Max duration in seconds (video)
    aspectRatios?: string[];               // Allowed aspect ratios ["16:9", "1:1"]
  };
  
  /** Attribution requirements */
  attribution?: {
    required: boolean;                      // Must creator be credited?
    format?: string;                        // Format string (e.g., "Photo by @creator")
  };
}
```

---

### 3.4 Filter Inputs

```typescript
/**
 * License list filter parameters
 */
export interface LicenseFilters {
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;                  // ISO 8601 datetime
  creatorId?: string;
  page?: number;                            // Default: 1
  pageSize?: number;                        // Default: 20, Max: 100
}

/**
 * Conflict check input
 */
export interface ConflictCheckInput {
  ipAssetId: string;
  startDate: string;                        // ISO 8601
  endDate: string;                          // ISO 8601
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string;                // Exclude this ID (for updates)
}
```

---

### 3.5 Response Types

```typescript
/**
 * Paginated license list response
 */
export interface LicenseListResponse {
  data: License[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Conflict check result
 */
export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

export interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: {
    id: string;
    brandId: string;
    startDate: string;
    endDate: string;
    licenseType: string;
  };
}

/**
 * License revenue data
 */
export interface LicenseRevenueData {
  licenseId: string;
  initialFeeCents: number;
  totalRevenueShareCents: number;
  totalRevenueCents: number;
  projectedRevenueCents: number;
  
  revenueByPeriod: RevenueByPeriod[];
  revenueByCreator: RevenueByCreator[];
  
  usageMetrics?: UsageMetrics;
  paymentStatus: PaymentStatus;
}

export interface RevenueByPeriod {
  period: string;                           // "YYYY-MM"
  startDate: string;                        // ISO 8601
  endDate: string;                          // ISO 8601
  revenueCents: number;
}

export interface RevenueByCreator {
  creatorId: string;
  creatorName: string;
  shareBps: number;
  totalRevenueCents: number;
  paidCents: number;
  pendingCents: number;
}

export interface UsageMetrics {
  totalImpressions: number;
  totalClicks: number;
  averageCostPerImpression: number;
}

export interface PaymentStatus {
  totalPaid: number;
  totalPending: number;
  nextPaymentDate: string | null;           // ISO 8601 or null
}

/**
 * License statistics
 */
export interface LicenseStats {
  totalActive: number;
  totalRevenueCents: number;
  expiringIn30Days: number;
  expiringIn60Days: number;
  expiringIn90Days: number;
  averageLicenseDurationDays: number;
  exclusiveLicenses: number;
  nonExclusiveLicenses: number;
  renewalRate: number;                      // Percentage (0-100)
}
```

---

## 4. Authentication & Authorization

### 4.1 Authentication

**All endpoints require JWT authentication:**

```typescript
// Include JWT token in request headers
headers: {
  'Authorization': 'Bearer <your_jwt_token>'
}
```

**Token must contain:**
- `userId` - User's unique identifier
- `role` - User role (ADMIN, BRAND, CREATOR)
- Valid expiration timestamp

---

### 4.2 Authorization Matrix

| Endpoint | Admin | Brand | Creator | Notes |
|----------|-------|-------|---------|-------|
| `licenses.list` | ✅ All licenses | ✅ Own licenses | ✅ Licenses for owned assets | Auto-filtered by role |
| `licenses.getById` | ✅ Any license | ✅ Own licenses | ✅ Licenses for owned assets | 403 if no access |
| `licenses.checkConflicts` | ✅ | ✅ | ✅ | Open to all authenticated |
| `licenses.getRevenue` | ✅ Any license | ✅ Own licenses | ✅ Licenses for owned assets | Sensitive financial data |
| `licenses.stats` | ✅ Any brand/platform | ✅ Own brand only | ❌ | Admins can specify brandId |

### 4.3 Row-Level Security (RLS)

**Automatic filtering applied:**

- **ADMIN role:** Full access to all licenses
- **BRAND role:** Filtered to `brandId` matching user's brand
- **CREATOR role:** Filtered to licenses where `ipAsset.ownerships` includes user's creator ID

**Example (internal logic):**
```typescript
// Brand user
if (userRole === 'BRAND') {
  where.brandId = userBrandId;  // Auto-injected
}

// Creator user
if (userRole === 'CREATOR') {
  where.ipAsset = {
    ownerships: {
      some: { creatorId: userCreatorId }
    }
  };
}
```

---

### 4.4 Permission Checks

**Before accessing sensitive operations:**

```typescript
function canAccessLicense(user: User, license: License): boolean {
  // Admins can access everything
  if (user.role === 'ADMIN') return true;
  
  // Brands can access their own licenses
  if (user.role === 'BRAND') {
    return license.brandId === user.brandId;
  }
  
  // Creators can access licenses for their assets
  if (user.role === 'CREATOR') {
    return license.ipAsset.ownerships.some(
      o => o.creatorId === user.creatorId
    );
  }
  
  return false;
}
```

---

**Continue to [Part 2: Business Logic & Implementation](./LICENSE_QUERIES_INTEGRATION_GUIDE_PART_2_IMPLEMENTATION.md)**
