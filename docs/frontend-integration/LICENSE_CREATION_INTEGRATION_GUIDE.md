# License Creation Module - Frontend Integration Guide

**Classification:** ⚡ HYBRID  
**Module:** License Creation & Management  
**Last Updated:** October 14, 2025  
**Version:** 1.0.0

> **Note:** License negotiation happens on the public website (brand ↔ creator). Admins manage renewals, expirations, and conflicts through the admin backend. Core logic is shared with role-based access control.

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)

---

## Overview

The License Creation module enables brands to propose licenses for creator IP assets, creators to approve/sign them, and admins to oversee the process. It includes sophisticated fee calculation, conflict detection, multi-party approval workflows, and digital signing.

### Key Features
- ✅ Enhanced license creation with auto-fee calculation
- ✅ Comprehensive validation (dates, scope, conflicts, revenue share)
- ✅ Multi-party approval workflow (creator → admin if needed → execution)
- ✅ Digital signature capture with cryptographic verification
- ✅ Conflict detection (exclusive overlaps, territory conflicts)
- ✅ License terms document generation
- ✅ Revenue tracking and reporting

### Base URL
- **Production:** `https://ops.yesgoddess.agency/api/trpc`
- **Development:** `http://localhost:3000/api/trpc`

All endpoints use tRPC conventions. Authentication is required for all endpoints.

---

## API Endpoints

### 1. Create License

**Endpoint:** `licenses.create`  
**Method:** Mutation  
**Authentication:** Required (Brand or Admin)  
**Description:** Brand proposes a new license for an IP asset

**Request Schema:**
```typescript
{
  ipAssetId: string;        // cuid
  brandId: string;          // cuid
  projectId?: string;       // cuid (optional)
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  startDate: string;        // ISO 8601 datetime
  endDate: string;          // ISO 8601 datetime
  feeCents: number;         // Integer, min 0 (auto-calculated if 0)
  revShareBps: number;      // Integer, 0-10000 (basis points)
  paymentTerms?: string;    // Optional payment terms description
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope: LicenseScope;      // See schema below
  autoRenew?: boolean;      // Default: false
  metadata?: Record<string, any>;
}
```

**Response:**
```typescript
{
  data: LicenseResponse;  // See type definitions
}
```

**Validation:**
- User must be brand owner or admin
- End date must be after start date
- Revenue share must be 0-10000 basis points
- Scope must include at least one media type
- Checks for license conflicts

---

### 2. List Licenses

**Endpoint:** `licenses.list`  
**Method:** Query  
**Authentication:** Required  
**Description:** Get paginated list of licenses (filtered by user role)

**Request Schema:**
```typescript
{
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED';
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  expiringBefore?: string;  // ISO 8601 datetime
  creatorId?: string;
  page?: number;            // Default: 1
  pageSize?: number;        // Default: 20, max: 100
}
```

**Response:**
```typescript
{
  data: LicenseResponse[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}
```

**Role-based Filtering:**
- **Brands:** See only their own licenses
- **Creators:** See licenses for their IP assets
- **Admins:** See all licenses

---

### 3. Get License by ID

**Endpoint:** `licenses.getById`  
**Method:** Query  
**Authentication:** Required  
**Description:** Fetch single license with full details

**Request Schema:**
```typescript
{
  id: string;  // cuid
}
```

**Response:**
```typescript
{
  data: LicenseResponse;
}
```

---

### 4. Update License

**Endpoint:** `licenses.update`  
**Method:** Mutation  
**Authentication:** Required (Brand owner or Admin)  
**Description:** Update license details (limited fields, see business rules)

**Request Schema:**
```typescript
{
  id: string;
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED';
  endDate?: string;
  feeCents?: number;
  revShareBps?: number;
  paymentTerms?: string;
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope?: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}
```

**Business Rules:**
- Only DRAFT or PENDING_APPROVAL licenses can be updated
- Fee changes >20% on ACTIVE licenses require amendment workflow
- Scope changes on ACTIVE licenses require amendment workflow

---

### 5. Approve License (Creator)

**Endpoint:** `licenses.approve`  
**Method:** Mutation  
**Authentication:** Required (Creator only)  
**Description:** Creator approves a pending license

**Request Schema:**
```typescript
{
  id: string;  // License ID
}
```

**Response:**
```typescript
{
  data: LicenseResponse;
}
```

**Requirements:**
- User must own the IP asset
- License must be in PENDING_APPROVAL status
- Updates status to ACTIVE and sets signedAt timestamp

---

### 6. Sign License

**Endpoint:** `licenses.sign`  
**Method:** Mutation  
**Authentication:** Required (Creator or Brand)  
**Description:** Digitally sign the license

**Request Schema:**
```typescript
{
  id: string;  // License ID
}
```

**Response:**
```typescript
{
  data: LicenseResponse;
  meta: {
    signatureProof: string;
    allPartiesSigned: boolean;
    executedAt?: string;
    message: string;
  };
}
```

**Workflow:**
- License must be in DRAFT or PENDING_APPROVAL status
- Captures IP address and user agent
- Generates cryptographic hash of terms
- Transitions to ACTIVE when all parties sign

---

### 7. Check Conflicts

**Endpoint:** `licenses.checkConflicts`  
**Method:** Query  
**Authentication:** Required  
**Description:** Check for license conflicts before creating/updating

**Request Schema:**
```typescript
{
  ipAssetId: string;
  startDate: string;
  endDate: string;
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  scope: LicenseScope;
  excludeLicenseId?: string;  // When updating
}
```

**Response:**
```typescript
{
  data: {
    hasConflicts: boolean;
    conflicts: Array<{
      licenseId: string;
      reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
      details: string;
      conflictingLicense?: Partial<License>;
    }>;
  };
}
```

---

### 8. Terminate License

**Endpoint:** `licenses.terminate`  
**Method:** Mutation  
**Authentication:** Required (Brand owner or Admin)  
**Description:** Early termination of active license

**Request Schema:**
```typescript
{
  id: string;
  reason: string;           // Min 10, max 500 characters
  effectiveDate?: string;   // ISO 8601 datetime (defaults to now)
}
```

**Response:**
```typescript
{
  data: LicenseResponse;
}
```

---

### 9. Generate Renewal

**Endpoint:** `licenses.generateRenewal`  
**Method:** Mutation  
**Authentication:** Required (Brand owner or Admin)  
**Description:** Create renewal license for expiring agreement

**Request Schema:**
```typescript
{
  licenseId: string;
  durationDays?: number;            // Override duration
  feeAdjustmentPercent?: number;    // e.g., 10 for 10% increase
  revShareAdjustmentBps?: number;   // Absolute adjustment
}
```

**Response:**
```typescript
{
  data: LicenseResponse;  // New license with parentLicenseId set
}
```

---

### 10. Get License Statistics

**Endpoint:** `licenses.stats`  
**Method:** Query  
**Authentication:** Required  
**Description:** Get license statistics for brand or platform-wide (admin)

**Request Schema:**
```typescript
{
  brandId?: string;  // Optional, forced to user's brand for non-admins
}
```

**Response:**
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
    renewalRate: number;  // Percentage
  };
}
```

---

### 11. Get License Revenue

**Endpoint:** `licenses.getRevenue`  
**Method:** Query  
**Authentication:** Required  
**Description:** Get comprehensive revenue tracking for a license

**Request Schema:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  data: {
    licenseId: string;
    initialFeeCents: number;
    totalRevenueShareCents: number;
    totalRevenueCents: number;
    projectedRevenueCents: number;
    revenueByPeriod: Array<{
      period: string;
      startDate: string;
      endDate: string;
      revenueCents: number;
    }>;
    revenueByCreator: Array<{
      creatorId: string;
      creatorName: string;
      shareBps: number;
      totalRevenueCents: number;
      paidCents: number;
      pendingCents: number;
    }>;
    usageMetrics?: {
      totalImpressions: number;
      totalClicks: number;
      averageCostPerImpression: number;
    };
    paymentStatus: {
      totalPaid: number;
      totalPending: number;
      nextPaymentDate: string | null;
    };
  };
}
```

---

### 12. Check Renewal Eligibility

**Endpoint:** `licenses.checkRenewalEligibility`  
**Method:** Query  
**Authentication:** Required  
**Description:** Check if license is eligible for renewal

**Request Schema:**
```typescript
{
  licenseId: string;
}
```

**Response:**
```typescript
{
  data: {
    eligible: boolean;
    reasons: string[];
    suggestedTerms?: {
      durationDays: number;
      feeCents: number;
      revShareBps: number;
      startDate: string;
      endDate: string;
      adjustments: {
        feeAdjustmentPercent: number;
        revShareAdjustmentBps: number;
        loyaltyDiscount?: number;
        performanceBonus?: number;
      };
    };
  };
}
```

---

### 13. Delete License (Admin Only)

**Endpoint:** `licenses.delete`  
**Method:** Mutation  
**Authentication:** Required (Admin only)  
**Description:** Soft delete a license

**Request Schema:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  data: LicenseResponse;
}
```

---

## Request/Response Examples

### Example 1: Create a License

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/licenses.create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ipAssetId": "clx1a2b3c4d5e6f7g8h9i0j1",
    "brandId": "clx9z8y7x6w5v4u3t2s1r0q9",
    "licenseType": "EXCLUSIVE",
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "feeCents": 0,
    "revShareBps": 2000,
    "scope": {
      "media": {
        "digital": true,
        "print": true,
        "broadcast": false,
        "ooh": false
      },
      "placement": {
        "social": true,
        "website": true,
        "email": true,
        "paid_ads": true,
        "packaging": false
      },
      "geographic": {
        "territories": ["US", "CA"]
      },
      "exclusivity": {
        "category": "Fashion"
      }
    },
    "autoRenew": false
  }'
```

**Response (Success):**
```json
{
  "data": {
    "id": "clx2b3c4d5e6f7g8h9i0j1k2l3",
    "ipAssetId": "clx1a2b3c4d5e6f7g8h9i0j1",
    "brandId": "clx9z8y7x6w5v4u3t2s1r0q9",
    "projectId": null,
    "licenseType": "EXCLUSIVE",
    "status": "DRAFT",
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.000Z",
    "signedAt": null,
    "feeCents": 210000,
    "feeDollars": 2100,
    "revShareBps": 2000,
    "revSharePercent": 20,
    "paymentTerms": null,
    "billingFrequency": null,
    "scope": {
      "media": { "digital": true, "print": true, "broadcast": false, "ooh": false },
      "placement": { "social": true, "website": true, "email": true, "paid_ads": true, "packaging": false },
      "geographic": { "territories": ["US", "CA"] },
      "exclusivity": { "category": "Fashion" }
    },
    "autoRenew": false,
    "renewalNotifiedAt": null,
    "parentLicenseId": null,
    "signatureProof": null,
    "metadata": {
      "referenceNumber": "LIC-2025-A3B5C7D9",
      "feeBreakdown": {
        "baseFeeCents": 50000,
        "scopeMultiplier": 1.2,
        "exclusivityPremiumCents": 100000,
        "totalFeeCents": 210000,
        "creatorNetCents": 189000
      },
      "validationWarnings": []
    },
    "createdAt": "2025-10-14T10:30:00.000Z",
    "updatedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

---

### Example 2: Check Conflicts (No Conflicts)

**cURL:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/trpc/licenses.checkConflicts?input=%7B%22ipAssetId%22%3A%22clx1a2b3c4d5e6f7g8h9i0j1%22%2C%22startDate%22%3A%222025-06-01T00%3A00%3A00Z%22%2C%22endDate%22%3A%222025-12-31T23%3A59%3A59Z%22%2C%22licenseType%22%3A%22NON_EXCLUSIVE%22%2C%22scope%22%3A%7B%22media%22%3A%7B%22digital%22%3Atrue%7D%2C%22placement%22%3A%7B%22social%22%3Atrue%7D%7D%7D" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "data": {
    "hasConflicts": false,
    "conflicts": []
  }
}
```

---

### Example 3: Check Conflicts (With Conflicts)

**Response:**
```json
{
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "licenseId": "clx3c4d5e6f7g8h9i0j1k2l3m4",
        "reason": "EXCLUSIVE_OVERLAP",
        "details": "Exclusive license already exists for this asset during the requested period",
        "conflictingLicense": {
          "id": "clx3c4d5e6f7g8h9i0j1k2l3m4",
          "licenseType": "EXCLUSIVE",
          "startDate": "2025-01-01T00:00:00.000Z",
          "endDate": "2025-12-31T23:59:59.000Z",
          "brandId": "clx8y7x6w5v4u3t2s1r0q9p8o7"
        }
      }
    ]
  }
}
```

---

### Example 4: Sign License

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/licenses.sign \
  -H "Authorization: Bearer CREATOR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "id": "clx2b3c4d5e6f7g8h9i0j1k2l3" }'
```

**Response:**
```json
{
  "data": {
    "id": "clx2b3c4d5e6f7g8h9i0j1k2l3",
    "status": "PENDING_APPROVAL",
    "signedAt": "2025-10-14T11:00:00.000Z",
    "signatureProof": "sha256:a1b2c3d4e5f6...",
    ...
  },
  "meta": {
    "signatureProof": "sha256:a1b2c3d4e5f6...",
    "allPartiesSigned": false,
    "message": "License signed successfully. Waiting for brand signature."
  }
}
```

---

### Example 5: Error - Conflict Detected

**Request:** Create license with existing exclusive overlap

**Response (409 CONFLICT):**
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "License conflicts with existing agreements",
    "data": {
      "conflicts": [
        {
          "licenseId": "clx3c4d5e6f7g8h9i0j1k2l3m4",
          "reason": "EXCLUSIVE_OVERLAP",
          "details": "Exclusive license already exists for this asset during the requested period"
        }
      ]
    }
  }
}
```

---

### Example 6: Error - Permission Denied

**Request:** Brand tries to approve license (creator-only action)

**Response (403 FORBIDDEN):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to approve this license"
  }
}
```

---

### Example 7: Error - Validation Failed

**Request:** Create license with invalid revenue share

**Response (500 INTERNAL_SERVER_ERROR with validation details):**
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "License validation failed:\n  - Revenue share must be between 0 and 10000 basis points\n  - End date must be after start date"
  }
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * License Scope Structure
 */
export interface LicenseScope {
  media: {
    digital: boolean;
    print: boolean;
    broadcast: boolean;
    ooh: boolean; // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;
    website: boolean;
    email: boolean;
    paid_ads: boolean;
    packaging: boolean;
  };
  geographic?: {
    territories: string[]; // ISO country codes or "GLOBAL"
  };
  exclusivity?: {
    category?: string; // e.g., "Fashion", "Beauty"
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number; // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string; // e.g., "Photo by @creator"
  };
}

/**
 * License Response (API format)
 */
export interface LicenseResponse {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'PENDING_SIGNATURE' | 'ACTIVE' | 
          'EXPIRING_SOON' | 'EXPIRED' | 'RENEWED' | 'TERMINATED' | 
          'DISPUTED' | 'CANCELED' | 'SUSPENDED';
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  signedAt: string | null; // ISO 8601
  feeCents: number;
  feeDollars: number; // Computed: feeCents / 100
  revShareBps: number; // 0-10000
  revSharePercent: number; // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null;
  scope: LicenseScope;
  autoRenew: boolean;
  renewalNotifiedAt: string | null; // ISO 8601
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  
  // Optional expanded relations
  ipAsset?: any;
  brand?: any;
  project?: any;
  parentLicense?: LicenseResponse;
  renewals?: LicenseResponse[];
}

/**
 * License Statistics
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
  renewalRate: number; // Percentage
}

/**
 * Conflict Details
 */
export interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: Partial<LicenseResponse>;
}

/**
 * Conflict Check Result
 */
export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

/**
 * Renewal Eligibility Result
 */
export interface RenewalEligibilityResult {
  eligible: boolean;
  reasons: string[];
  suggestedTerms?: {
    durationDays: number;
    feeCents: number;
    revShareBps: number;
    startDate: string;
    endDate: string;
    adjustments: {
      feeAdjustmentPercent: number;
      revShareAdjustmentBps: number;
      loyaltyDiscount?: number;
      performanceBonus?: number;
    };
  };
}
```

### Enums

```typescript
export enum LicenseType {
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  EXCLUSIVE_TERRITORY = 'EXCLUSIVE_TERRITORY'
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

### Zod Schemas (for validation)

```typescript
import { z } from 'zod';

export const LicenseScopeSchema = z.object({
  media: z.object({
    digital: z.boolean(),
    print: z.boolean(),
    broadcast: z.boolean(),
    ooh: z.boolean(),
  }),
  placement: z.object({
    social: z.boolean(),
    website: z.boolean(),
    email: z.boolean(),
    paid_ads: z.boolean(),
    packaging: z.boolean(),
  }),
  geographic: z.object({
    territories: z.array(z.string()),
  }).optional(),
  exclusivity: z.object({
    category: z.string().optional(),
    competitors: z.array(z.string()).optional(),
  }).optional(),
  cutdowns: z.object({
    allowEdits: z.boolean(),
    maxDuration: z.number().optional(),
    aspectRatios: z.array(z.string()).optional(),
  }).optional(),
  attribution: z.object({
    required: z.boolean(),
    format: z.string().optional(),
  }).optional(),
});

export const CreateLicenseSchema = z.object({
  ipAssetId: z.string().cuid(),
  brandId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  feeCents: z.number().int().min(0),
  revShareBps: z.number().int().min(0).max(10000),
  paymentTerms: z.string().optional(),
  billingFrequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  scope: LicenseScopeSchema,
  autoRenew: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

---

*Continued in [LICENSE_CREATION_INTEGRATION_GUIDE_PART_2.md](./LICENSE_CREATION_INTEGRATION_GUIDE_PART_2.md)*
