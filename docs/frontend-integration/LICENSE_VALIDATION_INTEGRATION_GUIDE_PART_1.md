# License Validation - Frontend Integration Guide (Part 1: API & Types)

**Classification:** ⚡ HYBRID  
*License validation happens on both website (brand ↔ creator) and admin backend. Core logic is shared, admin has additional management tools.*

---

## Table of Contents

**Part 1 (This Document):** API Endpoints & TypeScript Types  
**Part 2:** Business Logic, Validation Rules & Error Handling  
**Part 3:** Implementation Examples & Checklist

---

## Overview

The License Validation module provides comprehensive validation for license creation and updates across **six critical checks**:

1. **Date Overlap Validation** - Prevents conflicting license periods
2. **Exclusivity Checking** - Enforces exclusive license rules
3. **Scope Conflict Detection** - Ensures compatible usage scopes
4. **Budget Availability** - Validates brand budget limits
5. **Ownership Verification** - Confirms valid IP ownership structure
6. **Approval Requirements** - Determines required approvals

**All validation happens server-side** before any license is created or modified. The frontend should call validation endpoints before showing license forms and display comprehensive error/warning feedback.

---

## Authentication Requirements

All license validation endpoints require authentication:

```typescript
Authorization: Bearer <JWT_TOKEN>
```

**Role-Based Access:**
- **Brands** can validate licenses for their own brand
- **Creators** can validate licenses for their IP assets
- **Admins** can validate any license

---

## API Endpoints

### Base URL
```
https://ops.yesgoddess.agency/api/trpc
```

All endpoints use tRPC protocol. For REST-style calls, append `.query` or `.mutation` to the procedure name.

---

### 1. Check License Conflicts (Pre-Validation)

**Endpoint:** `licenses.checkConflicts`  
**Method:** Query (GET)  
**Purpose:** Check for conflicts before creating a license (lightweight check)

**Request:**
```typescript
{
  ipAssetId: string;        // CUID of IP asset
  startDate: string;        // ISO 8601 datetime
  endDate: string;          // ISO 8601 datetime
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  scope: LicenseScope;      // See type definition below
  excludeLicenseId?: string; // Optional: exclude license from conflict check (for updates)
}
```

**Response:**
```typescript
{
  data: {
    hasConflicts: boolean;
    conflicts: Conflict[];
  }
}

interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: {
    id: string;
    brandId: string;
    startDate: Date;
    endDate: Date;
    licenseType: string;
  };
}
```

**Example cURL:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.checkConflicts?input=%7B%22ipAssetId%22%3A%22c123xyz%22%2C%22startDate%22%3A%222025-06-01T00%3A00%3A00Z%22%2C%22endDate%22%3A%222025-12-31T23%3A59%3A59Z%22%2C%22licenseType%22%3A%22EXCLUSIVE%22%2C%22scope%22%3A%7B%22media%22%3A%7B%22digital%22%3Atrue%2C%22print%22%3Afalse%2C%22broadcast%22%3Afalse%2C%22ooh%22%3Afalse%7D%2C%22placement%22%3A%7B%22social%22%3Atrue%2C%22website%22%3Atrue%2C%22email%22%3Afalse%2C%22paid_ads%22%3Atrue%2C%22packaging%22%3Afalse%7D%7D%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

**When to Use:**
- Before showing license creation form (to pre-validate dates)
- On date range change in form (real-time conflict detection)
- When user selects exclusivity type

---

### 2. Create License (Full Validation)

**Endpoint:** `licenses.create`  
**Method:** Mutation (POST)  
**Purpose:** Create a new license with full validation

**Request:**
```typescript
{
  ipAssetId: string;
  brandId: string;
  projectId?: string;
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  startDate: string;        // ISO 8601 datetime
  endDate: string;          // ISO 8601 datetime
  feeCents: number;         // Integer, in cents (e.g., 10000 = $100.00)
  revShareBps: number;      // Basis points (0-10000, e.g., 500 = 5%)
  paymentTerms?: string;
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}
```

**Response (Success):**
```typescript
{
  data: LicenseResponse;  // See type definition below
}
```

**Response (Validation Error):**
```typescript
{
  error: {
    code: 'BAD_REQUEST' | 'CONFLICT',
    message: string;
    data?: {
      validationErrors: string[];
      warnings: string[];
      conflicts: Conflict[];
    }
  }
}
```

**Example cURL:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/licenses.create' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "ipAssetId": "c123xyz",
    "brandId": "cbrand123",
    "licenseType": "NON_EXCLUSIVE",
    "startDate": "2025-06-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "feeCents": 500000,
    "revShareBps": 0,
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
      }
    }
  }'
```

**When to Use:**
- Final license creation after user completes form
- After showing user all validation warnings/errors
- After user confirms they want to proceed despite warnings

---

## TypeScript Type Definitions

Export these interfaces to your frontend codebase:

```typescript
// ===========================
// License Scope
// ===========================

/**
 * Defines what a license allows in terms of media, placement, geography, etc.
 */
export interface LicenseScope {
  media: {
    digital: boolean;     // Social media, websites, apps
    print: boolean;       // Magazines, newspapers, brochures
    broadcast: boolean;   // TV, radio
    ooh: boolean;         // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;      // Instagram, TikTok, Facebook, etc.
    website: boolean;     // Brand website, landing pages
    email: boolean;       // Email marketing campaigns
    paid_ads: boolean;    // Google Ads, Meta Ads, etc.
    packaging: boolean;   // Product packaging, labels
  };
  geographic?: {
    territories: string[]; // ISO 3166-1 alpha-2 country codes or "GLOBAL"
    // Examples: ["US", "CA", "MX"] or ["GLOBAL"]
  };
  exclusivity?: {
    category?: string;     // e.g., "Fashion", "Beauty", "Automotive"
    competitors?: string[]; // Brand IDs that are blocked as competitors
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number;  // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string;       // e.g., "Photo by @creator"
  };
}

// ===========================
// License Types
// ===========================

export type LicenseType = 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';

export type LicenseStatus =
  | 'DRAFT'              // Initial creation, not yet submitted
  | 'PENDING_APPROVAL'   // Awaiting creator/admin approval
  | 'ACTIVE'             // Fully executed and in effect
  | 'EXPIRED'            // End date has passed
  | 'TERMINATED'         // Manually ended before expiration
  | 'SUSPENDED';         // Temporarily paused

export type BillingFrequency =
  | 'ONE_TIME'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

// ===========================
// Conflict Detection
// ===========================

export interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: {
    id: string;
    brandId: string;
    startDate: Date | string;
    endDate: Date | string;
    licenseType: LicenseType;
  };
}

export interface ConflictCheckInput {
  ipAssetId: string;
  startDate: Date | string;
  endDate: Date | string;
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

// ===========================
// License Creation
// ===========================

export interface CreateLicenseInput {
  ipAssetId: string;
  brandId: string;
  projectId?: string;
  licenseType: LicenseType;
  startDate: Date | string;
  endDate: Date | string;
  feeCents: number;
  revShareBps: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

// ===========================
// License Response
// ===========================

export interface LicenseResponse {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: LicenseType;
  status: LicenseStatus;
  startDate: string;         // ISO 8601
  endDate: string;           // ISO 8601
  signedAt: string | null;   // ISO 8601
  feeCents: number;
  feeDollars: number;        // Computed: feeCents / 100
  revShareBps: number;
  revSharePercent: number;   // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  scope: LicenseScope;
  autoRenew: boolean;
  renewalNotifiedAt: string | null;
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
  // Optional expanded relations
  ipAsset?: any;
  brand?: any;
  project?: any;
  parentLicense?: LicenseResponse;
  renewals?: LicenseResponse[];
}

// ===========================
// Validation Results
// ===========================

export interface ValidationCheck {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: any;
}

export interface LicenseValidationResult {
  valid: boolean;
  checks: {
    dateOverlap: ValidationCheck;
    exclusivity: ValidationCheck;
    scopeConflict: ValidationCheck;
    budgetAvailability: ValidationCheck;
    ownershipVerification: ValidationCheck;
    approvalRequirements: ValidationCheck;
  };
  allErrors: string[];
  allWarnings: string[];
  conflicts: Conflict[];
}

// ===========================
// Approval Requirements
// ===========================

export interface ApprovalRequirement {
  required: boolean;
  reasons: string[];
  approvers: Array<{
    type: 'creator' | 'brand' | 'admin';
    userId?: string;
    name?: string;
  }>;
}
```

---

## Query Parameters & Filtering

The `licenses.checkConflicts` endpoint supports all fields in `ConflictCheckInput`.

**Date Format:**  
All dates must be in ISO 8601 format: `YYYY-MM-DDTHH:mm:ssZ`

**Examples:**
- `2025-06-01T00:00:00Z` (start of day UTC)
- `2025-12-31T23:59:59Z` (end of day UTC)

**Territory Codes:**  
Use ISO 3166-1 alpha-2 country codes or `"GLOBAL"`:
- `["US", "CA", "MX"]` - North America
- `["GB", "FR", "DE"]` - Select EU countries
- `["GLOBAL"]` - Worldwide

---

## Response Format Examples

### Success Response (No Conflicts)
```json
{
  "data": {
    "hasConflicts": false,
    "conflicts": []
  }
}
```

### Conflict Response
```json
{
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "licenseId": "clic123xyz",
        "reason": "EXCLUSIVE_OVERLAP",
        "details": "Exclusive license conflict: Acme Corp holds exclusive rights during this period",
        "conflictingLicense": {
          "id": "clic123xyz",
          "brandId": "cbrand456",
          "startDate": "2025-06-01T00:00:00Z",
          "endDate": "2025-12-31T23:59:59Z",
          "licenseType": "EXCLUSIVE"
        }
      }
    ]
  }
}
```

### Validation Error Response (License Creation)
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "License validation failed",
    "data": {
      "validationErrors": [
        "End date must be after start date",
        "At least one media type must be selected"
      ],
      "warnings": [
        "License start date is in the past"
      ],
      "conflicts": []
    }
  }
}
```

---

## Pagination & Filtering

License validation endpoints do not support pagination (single-purpose validation).

For listing licenses with filters, use the `licenses.list` endpoint:

```typescript
{
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;  // ISO 8601 datetime
  creatorId?: string;
  page?: number;            // Default: 1
  pageSize?: number;        // Default: 20, Max: 100
}
```

---

## Rate Limiting

**Current Implementation:** No explicit rate limits on validation endpoints.

**Best Practices:**
- Debounce real-time conflict checks (wait 500ms after user stops typing)
- Cache conflict check results for same input parameters
- Avoid running full validation on every keystroke

**Recommended Client-Side Throttling:**
```typescript
import { debounce } from 'lodash';

const checkConflicts = debounce(async (input: ConflictCheckInput) => {
  const result = await trpc.licenses.checkConflicts.query(input);
  return result;
}, 500);
```

---

## Next Steps

Continue to **Part 2** for:
- Detailed business logic and validation rules
- Complete error code reference
- Field-level validation requirements
- Authorization matrix

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-14  
**Classification:** ⚡ HYBRID
