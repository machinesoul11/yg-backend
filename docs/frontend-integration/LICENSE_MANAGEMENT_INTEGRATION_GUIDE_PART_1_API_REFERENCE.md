# License Management - Frontend Integration Guide (Part 1: API Reference)

**Classification:** ⚡ HYBRID  
*License negotiation happens on website (brand ↔ creator), admins manage renewals, expirations, and conflicts. Core logic is shared, admin has additional management tools.*

**Last Updated:** October 14, 2025  
**Backend Repo:** yg-backend  
**Frontend Repo:** yesgoddess-web  
**Architecture:** tRPC API with JWT authentication

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [API Endpoints](#api-endpoints)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)

---

## Overview

The License Management module handles the complete lifecycle of IP licensing agreements between creators and brands. This includes license creation, approval workflows, digital signing, renewals, termination, and conflict detection.

### Key Capabilities

- **License Creation & Negotiation** - Brands propose licenses; creators approve
- **Digital Signing** - Multi-party cryptographic signature capture
- **Conflict Detection** - Prevents overlapping exclusive agreements
- **Automated Renewals** - Smart renewal offers based on performance
- **Revenue Tracking** - Monitor license fees and revenue share
- **Analytics & Reporting** - Performance metrics, renewal analytics

### Technology Stack

- **Backend:** Next.js 15 + tRPC + Prisma
- **Authentication:** JWT (NextAuth.js)
- **Database:** PostgreSQL with row-level security
- **Real-time:** Polling recommended (no WebSockets currently)

---

## Authentication & Authorization

### Authentication Method

All endpoints require JWT authentication via NextAuth.js session.

```typescript
// Client-side authentication check
import { useSession } from 'next-auth/react';

function LicenseManagement() {
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <LoadingSpinner />;
  if (status === 'unauthenticated') return <SignInPrompt />;
  
  return <LicenseInterface session={session} />;
}
```

### Authorization Headers

tRPC automatically handles authentication. No manual headers required when using the tRPC client.

```typescript
// Authentication is automatic with tRPC
const { data } = trpc.licenses.list.useQuery({ status: 'ACTIVE' });
```

---

## Authorization & Permissions

### Role-Based Access Control

| Role | Create | View Own | View All | Update | Approve | Sign | Terminate | Delete |
|------|--------|----------|----------|--------|---------|------|-----------|--------|
| **BRAND** | ✅ (own brand) | ✅ | ❌ | ✅ (own) | ❌ | ✅ (own) | ✅ (own) | ❌ |
| **CREATOR** | ❌ | ✅ (own assets) | ❌ | ❌ | ✅ (own assets) | ✅ (own assets) | ❌ | ❌ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **VIEWER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Resource-Level Permissions

**View License:**
- Admins: All licenses
- Brands: Only licenses they own (`brandId` matches)
- Creators: Only licenses for their IP assets

**Update License:**
- Admins: All licenses
- Brands: Only licenses they own
- Creators: Cannot update (only approve)

**Sign License:**
- Brands: Only licenses they own
- Creators: Only licenses for assets they own
- Both parties must sign before license becomes active

**Terminate License:**
- Admins: All licenses
- Brands: Only licenses they own
- Creators: Cannot terminate

---

## API Endpoints

All endpoints are exposed via tRPC router at `trpc.licenses.*`

### Core License Endpoints

#### 1. Create License (`licenses.create`)

**Type:** Mutation  
**Auth:** Required (BRAND, ADMIN)  
**Rate Limit:** None (database-level constraints apply)

**Purpose:** Brand proposes a license to use a creator's IP asset.

**Input Schema:**
```typescript
{
  ipAssetId: string;              // CUID of the IP asset
  brandId: string;                // CUID of the brand (auto-validated)
  projectId?: string;             // Optional project association
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  startDate: string;              // ISO 8601 datetime
  endDate: string;                // ISO 8601 datetime
  feeCents: number;               // Upfront fee in cents (min: 0)
  revShareBps: number;            // Revenue share in basis points (0-10000)
  paymentTerms?: string;          // Free-text payment terms
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope: LicenseScope;            // Detailed license scope (see TypeScript types)
  autoRenew?: boolean;            // Default: false
  metadata?: Record<string, any>; // Custom metadata
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // Full license object (see TypeScript types)
}
```

**Business Rules:**
- `endDate` must be after `startDate`
- `feeCents` must be non-negative
- `revShareBps` must be 0-10000 (0% to 100%)
- Brands can only create licenses for their own `brandId`
- IP asset must exist and not be deleted
- Creates license in `PENDING_APPROVAL` status
- Sends email notification to creator(s) for approval

**Errors:**
| Code | HTTP Status | Cause | User-Friendly Message |
|------|-------------|-------|----------------------|
| `FORBIDDEN` | 403 | User tries to create license for another brand | "You can only create licenses for your own brand" |
| `CONFLICT` | 409 | License conflicts with existing exclusive agreement | "This license conflicts with an existing agreement. Please adjust dates or scope." |
| `BAD_REQUEST` | 400 | Invalid date range or financial terms | "License end date must be after start date" |
| `NOT_FOUND` | 404 | IP asset doesn't exist | "IP asset not found" |
| `INTERNAL_SERVER_ERROR` | 500 | Database or service error | "Failed to create license. Please try again." |

---

#### 2. List Licenses (`licenses.list`)

**Type:** Query  
**Auth:** Required (all roles)  
**Rate Limit:** None

**Purpose:** Retrieve paginated list of licenses with filters.

**Input Schema:**
```typescript
{
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED';
  ipAssetId?: string;        // Filter by IP asset
  brandId?: string;          // Filter by brand
  projectId?: string;        // Filter by project
  licenseType?: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  expiringBefore?: string;   // ISO 8601 datetime - find expiring licenses
  creatorId?: string;        // Filter by creator (admin only)
  page?: number;             // Default: 1
  pageSize?: number;         // Default: 20, max: 100
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse[];  // Array of licenses
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

**Row-Level Security:**
- **BRAND users:** Automatically filtered to `brandId` matching their brand
- **CREATOR users:** Automatically filtered to licenses for their IP assets
- **ADMIN users:** See all licenses
- **VIEWER users:** No access (returns empty array)

**Sorting:**
- Results sorted by `createdAt` descending (newest first)

**Use Cases:**
- Brand dashboard: `{ brandId: 'myBrandId', status: 'ACTIVE' }`
- Creator portfolio: `{ ipAssetId: 'myAssetId' }`
- Expiring soon: `{ status: 'ACTIVE', expiringBefore: '2025-12-31T23:59:59Z', pageSize: 50 }`

---

#### 3. Get License Details (`licenses.getById`)

**Type:** Query  
**Auth:** Required  
**Rate Limit:** None

**Purpose:** Retrieve full details of a single license with all related data.

**Input Schema:**
```typescript
{
  id: string;  // License CUID
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse & {
    ipAsset?: {
      id: string;
      title: string;
      type: string;
      // ... full asset details
    };
    brand?: {
      id: string;
      name: string;
      // ... full brand details
    };
    project?: {
      id: string;
      name: string;
      // ... full project details
    };
    parentLicense?: LicenseResponse;  // If this is a renewal
    renewals?: LicenseResponse[];     // Child renewal licenses
  };
}
```

**Includes:**
- Full license details
- IP asset information
- Brand information
- Project information (if associated)
- Parent license (if renewal)
- Renewal licenses (if parent)

**Access Control:**
- Returns `403 FORBIDDEN` if user doesn't have permission to view
- Returns `404 NOT_FOUND` for non-existent licenses

---

#### 4. Update License (`licenses.update`)

**Type:** Mutation  
**Auth:** Required (BRAND owner, ADMIN)  
**Rate Limit:** None

**Purpose:** Update license details. Limited fields can be modified after creation.

**Input Schema:**
```typescript
{
  id: string;  // License CUID
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED';
  endDate?: string;              // ISO 8601 datetime
  feeCents?: number;             // Must be >= 0
  revShareBps?: number;          // 0-10000
  paymentTerms?: string;
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope?: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;
}
```

**Validation:**
- `endDate` must be after `startDate` (if updated)
- `feeCents` must be >= 0
- `revShareBps` must be 0-10000
- Cannot modify `ipAssetId`, `brandId`, `startDate` after creation

**Audit Trail:**
- All updates logged with `updatedBy` userId
- Timestamp tracked in `updatedAt`

**Errors:**
| Code | HTTP Status | Cause |
|------|-------------|-------|
| `FORBIDDEN` | 403 | User doesn't own license |
| `NOT_FOUND` | 404 | License doesn't exist |
| `BAD_REQUEST` | 400 | Invalid update (e.g., end date before start date) |

---

#### 5. Approve License (`licenses.approve`)

**Type:** Mutation  
**Auth:** Required (CREATOR only)  
**Rate Limit:** None

**Purpose:** Creator approves a pending license for their IP asset.

**Input Schema:**
```typescript
{
  id: string;  // License CUID
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // Updated license with status changed
}
```

**Business Logic:**
- Only creators who own the IP asset can approve
- License must be in `PENDING_APPROVAL` status
- Updates status to `ACTIVE`
- Sets `signedAt` timestamp
- Sends email notification to brand
- Logs audit event

**Errors:**
| Code | HTTP Status | Cause | Message |
|------|-------------|-------|---------|
| `FORBIDDEN` | 403 | User doesn't own IP asset | "You don't have permission to approve this license" |
| `BAD_REQUEST` | 400 | License not in pending status | "License is not pending approval" |
| `NOT_FOUND` | 404 | License doesn't exist | "License not found" |

---

#### 6. Sign License (`licenses.sign`)

**Type:** Mutation  
**Auth:** Required (BRAND owner, CREATOR owner, ADMIN)  
**Rate Limit:** None

**Purpose:** Digital signature capture for multi-party license execution.

**Input Schema:**
```typescript
{
  id: string;  // License CUID
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;
  meta: {
    signatureProof: string;      // Cryptographic proof hash
    allPartiesSigned: boolean;   // True if both brand & creator signed
    executedAt?: string;         // ISO 8601 - when fully executed
    message: string;             // User-friendly status message
  };
}
```

**Signature Capture Details:**
- IP address captured from request headers
- User agent captured from request headers
- Timestamp recorded
- Digital signature hash generated
- License transitions to `ACTIVE` when all parties sign

**Business Logic:**
- Brands can only sign licenses they own
- Creators can only sign licenses for assets they own
- License must be in `DRAFT` or `PENDING_APPROVAL` status
- Both parties must sign before license executes
- Signatures cannot be withdrawn after both parties sign

**Metadata Stored:**
```typescript
{
  signatures: [
    {
      role: 'brand' | 'creator';
      userId: string;
      timestamp: string;  // ISO 8601
      ipAddress: string;
      userAgent: string;
      hash: string;       // SHA-256 signature
    }
  ];
  termsVersion: string;
  termsHash: string;
}
```

**Response Messages:**
- If brand signs first: `"License signed by brand. Awaiting creator signature."`
- If creator signs first: `"License signed by creator. Awaiting brand signature."`
- If both signed: `"License fully executed. All parties have signed."`

---

#### 7. Terminate License (`licenses.terminate`)

**Type:** Mutation  
**Auth:** Required (BRAND owner, ADMIN)  
**Rate Limit:** None

**Purpose:** Early termination of active license with reason logging.

**Input Schema:**
```typescript
{
  id: string;
  reason: string;           // 10-500 characters required
  effectiveDate?: string;   // ISO 8601, defaults to now
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // Updated license with TERMINATED status
}
```

**Business Logic:**
- Only active licenses can be terminated
- Updates status to `TERMINATED`
- Sets `deletedAt` to effective date
- Sends termination notifications to:
  - Brand user
  - All creators (IP asset owners)
- Logs detailed audit event with reason
- Cannot be undone (permanent action)

**Validation:**
- `reason` must be 10-500 characters
- `effectiveDate` cannot be in the past (if provided)
- License must be in `ACTIVE` status

**Email Notifications:**
- **To Brand:** "License Terminated: [Asset Title]"
- **To Creator(s):** "Brand Terminated License: [Asset Title]"

---

#### 8. Check Conflicts (`licenses.checkConflicts`)

**Type:** Query  
**Auth:** Required  
**Rate Limit:** None

**Purpose:** Proactively detect conflicts before creating/updating a license.

**Input Schema:**
```typescript
{
  ipAssetId: string;
  startDate: string;   // ISO 8601
  endDate: string;     // ISO 8601
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  scope: LicenseScope;
  excludeLicenseId?: string;  // When updating, exclude self from check
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
      details: string;
      conflictingLicense?: {
        id: string;
        brandId: string;
        status: string;
        startDate: string;
        endDate: string;
        licenseType: string;
        scope: LicenseScope;
      };
    }>;
  };
}
```

**Conflict Detection Rules:**

1. **EXCLUSIVE_OVERLAP:** Another exclusive license exists for same asset during date range
2. **TERRITORY_OVERLAP:** Exclusive territory license conflicts with requested territories
3. **COMPETITOR_BLOCKED:** Brand is blocked by exclusivity clause in existing license
4. **DATE_OVERLAP:** Non-exclusive licenses with overlapping scope and dates

**Use Cases:**
- Call before creating license (preview validation)
- Call during license editing (update validation)
- Display conflict warnings to users
- Suggest alternative date ranges

**Frontend Implementation:**
```typescript
// Check conflicts before submitting license form
const { data: conflicts } = trpc.licenses.checkConflicts.useQuery({
  ipAssetId,
  startDate,
  endDate,
  licenseType,
  scope,
});

if (conflicts?.hasConflicts) {
  // Show warning to user
  showConflictWarning(conflicts.conflicts);
}
```

---

#### 9. Generate Renewal (`licenses.generateRenewal`)

**Type:** Mutation  
**Auth:** Required (BRAND owner, ADMIN)  
**Rate Limit:** None

**Purpose:** Create renewal license based on existing expired/expiring license.

**Input Schema:**
```typescript
{
  licenseId: string;             // Original license CUID
  durationDays?: number;         // Override duration (defaults to same as original)
  feeAdjustmentPercent?: number; // e.g., 10 = 10% increase, -5 = 5% decrease
  revShareAdjustmentBps?: number; // Absolute adjustment in basis points
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // New renewal license
}
```

**Business Logic:**
- Creates new license with `parentLicenseId` linking to original
- Copies all terms from original license
- Applies fee/revshare adjustments if specified
- Sets `startDate` to day after original `endDate`
- Calculates `endDate` based on duration
- Status set to `PENDING_APPROVAL`
- Sends renewal notification email to creator(s)

**Default Behavior:**
- If no adjustments specified, keeps same terms
- Duration defaults to same as original license
- Start date is seamless (no gap)

**Use Cases:**
- Auto-renewal offers 90 days before expiration
- Manual renewal by brand
- Renewal with adjusted terms

---

#### 10. Get License Statistics (`licenses.stats`)

**Type:** Query  
**Auth:** Required  
**Rate Limit:** None

**Purpose:** Retrieve aggregate license statistics for dashboards.

**Input Schema:**
```typescript
{
  brandId?: string;  // Optional filter (brands auto-filtered to own)
}
```

**Response Schema:**
```typescript
{
  data: {
    totalActive: number;
    totalRevenueCents: number;          // Sum of all active license fees
    expiringIn30Days: number;
    expiringIn60Days: number;
    expiringIn90Days: number;
    averageLicenseDurationDays: number;
    exclusiveLicenses: number;
    nonExclusiveLicenses: number;
    renewalRate: number;                // Percentage (0-100)
  };
}
```

**Calculations:**
- `renewalRate`: (Renewed licenses / Expired licenses) * 100
- `totalRevenueCents`: Sum of `feeCents` for all active licenses
- Expiration windows: Count licenses expiring within X days from today

**Access Control:**
- Brands automatically filtered to their own `brandId`
- Admins can filter by specific `brandId` or view global stats

---

#### 11. Get License Revenue (`licenses.getRevenue`)

**Type:** Query  
**Auth:** Required  
**Rate Limit:** None

**Purpose:** Track revenue and royalty payments for a specific license.

**Input Schema:**
```typescript
{
  id: string;  // License CUID
}
```

**Response Schema:**
```typescript
{
  data: {
    licenseId: string;
    feeCents: number;
    revShareBps: number;
    totalRoyaltiesCents: number;     // Sum of all royalty payments
    lastRoyaltyPayment: {
      amount: number;
      paidAt: string;  // ISO 8601
    } | null;
    royaltyHistory: Array<{
      id: string;
      amountCents: number;
      paidAt: string;
      periodStart: string;
      periodEnd: string;
    }>;
  };
}
```

**Use Cases:**
- Creator dashboard - track earnings per license
- Brand reporting - monitor licensing costs
- Financial reconciliation

---

#### 12. Delete License (`licenses.delete`)

**Type:** Mutation  
**Auth:** Required (ADMIN only)  
**Rate Limit:** None

**Purpose:** Soft delete a license (admin only).

**Input Schema:**
```typescript
{
  id: string;  // License CUID
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // License with deletedAt timestamp
}
```

**Business Logic:**
- Soft delete (sets `deletedAt` timestamp)
- License still exists in database but excluded from queries
- Cannot be undone via API (requires database access)
- Only accessible to ADMIN role

---

## Summary

**Part 1** covered:
- ✅ Overview and authentication
- ✅ Authorization and permissions
- ✅ Core license endpoints (1-12)

**Continue to Part 2** for:
- Advanced endpoints (renewals, analytics, signing)
- TypeScript type definitions
- Request/Response examples with cURL
- Detailed error handling

**Continue to Part 3** for:
- Business logic and validation rules
- Frontend implementation patterns
- React Query integration examples
- Real-time updates and polling
- UX considerations and best practices
