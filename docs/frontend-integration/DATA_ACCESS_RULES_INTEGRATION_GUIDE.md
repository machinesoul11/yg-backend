# Data Access Rules (Row-Level Security) - Frontend Integration Guide

## 🌐 Classification: SHARED
**Used by both public-facing website and admin backend**

---

## Overview

The Data Access Rules system (Row-Level Security) provides automatic data isolation and access control across the YesGoddess platform. This ensures that creators only see their own assets and royalties, brands only see their own projects and licenses, and admins have full visibility.

**Backend Repo:** `yg-backend` (deployed at `ops.yesgoddess.agency`)  
**Authentication:** JWT with session-based cookies (Auth.js)  
**Architecture:** Automatic query filtering at database level via Prisma

---

## Table of Contents

1. [API Endpoints](#1-api-endpoints)
2. [Request/Response Examples](#2-requestresponse-examples)
3. [TypeScript Type Definitions](#3-typescript-type-definitions)
4. [Business Logic & Validation Rules](#4-business-logic--validation-rules)
5. [Error Handling](#5-error-handling)
6. [Authorization & Permissions](#6-authorization--permissions)
7. [Rate Limiting & Quotas](#7-rate-limiting--quotas)
8. [Real-time Updates](#8-real-time-updates)
9. [Pagination & Filtering](#9-pagination--filtering)
10. [Frontend Implementation Checklist](#10-frontend-implementation-checklist)
11. [Testing Scenarios](#11-testing-scenarios)

---

## 1. API Endpoints

### 1.1 Context Endpoint

The RLS system operates transparently - there are no specific "RLS endpoints". All data endpoints automatically apply security filters based on the authenticated user's role and profile.

**Key Concept:** RLS is a **middleware layer** that filters data queries automatically. You don't call RLS endpoints directly; instead, all existing endpoints respect RLS rules.

### 1.2 Affected Endpoints

All endpoints that query data are automatically filtered by RLS:

| Endpoint | Method | Auto-Filtered By | Description |
|----------|--------|------------------|-------------|
| `/api/trpc/ipAssets.list` | GET | RLS | Lists IP assets user can access |
| `/api/trpc/ipAssets.getById` | GET | RLS | Get asset by ID (403 if no access) |
| `/api/trpc/projects.list` | GET | RLS | Lists projects user can access |
| `/api/trpc/projects.getById` | GET | RLS | Get project by ID (403 if no access) |
| `/api/trpc/licenses.list` | GET | RLS | Lists licenses user can access |
| `/api/trpc/licenses.getById` | GET | RLS | Get license by ID (403 if no access) |
| `/api/trpc/royalties.listStatements` | GET | RLS | Lists royalty statements (creator only) |
| `/api/trpc/royalties.getStatement` | GET | RLS | Get statement by ID (403 if no access) |
| `/api/trpc/payouts.list` | GET | RLS | Lists payouts (creator only) |
| `/api/trpc/payouts.getById` | GET | RLS | Get payout by ID (403 if no access) |
| `/api/trpc/brands.list` | GET | RLS | Lists brands user can access |
| `/api/trpc/brands.getById` | GET | RLS | Get brand by ID (403 if no access) |
| `/api/trpc/creators.list` | GET | RLS | Lists creators user can access |
| `/api/trpc/creators.getById` | GET | RLS | Get creator by ID (403 if no access) |

**Authentication:** All endpoints require valid session or Bearer token  
**Base URL:** `https://ops.yesgoddess.agency`

---

## 2. Request/Response Examples

### 2.1 Creator Viewing Their IP Assets

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/ipAssets.list' \
  -H 'Cookie: next-auth.session-token=abc123...' \
  -H 'Content-Type: application/json'
```

**Response (Creator):**
```json
{
  "result": {
    "data": {
      "items": [
        {
          "id": "asset_creator1_001",
          "title": "My Artwork",
          "type": "IMAGE",
          "status": "PUBLISHED",
          "createdBy": "user_creator1",
          "ownerships": [
            {
              "id": "own_001",
              "creatorId": "creator_001",
              "shareBps": 10000,
              "ownershipType": "PRIMARY"
            }
          ]
        }
      ],
      "total": 1,
      "page": 1
    }
  }
}
```

**Note:** Automatically filtered to only show assets created by or owned by this creator.

---

### 2.2 Brand Viewing Their Projects

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/projects.list' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json'
```

**Response (Brand):**
```json
{
  "result": {
    "data": {
      "items": [
        {
          "id": "proj_brand1_001",
          "name": "Summer Campaign 2025",
          "status": "ACTIVE",
          "brandId": "brand_001",
          "startDate": "2025-06-01T00:00:00Z",
          "endDate": "2025-08-31T00:00:00Z"
        }
      ],
      "total": 1,
      "page": 1
    }
  }
}
```

**Note:** Automatically filtered to only show projects owned by this brand.

---

### 2.3 Admin Viewing All Data

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/ipAssets.list' \
  -H 'Cookie: next-auth.session-token=admin_token...' \
  -H 'Content-Type: application/json'
```

**Response (Admin):**
```json
{
  "result": {
    "data": {
      "items": [
        {
          "id": "asset_creator1_001",
          "title": "Creator 1 Artwork",
          "createdBy": "user_creator1"
        },
        {
          "id": "asset_creator2_001",
          "title": "Creator 2 Artwork",
          "createdBy": "user_creator2"
        },
        {
          "id": "asset_creator3_001",
          "title": "Creator 3 Artwork",
          "createdBy": "user_creator3"
        }
      ],
      "total": 250,
      "page": 1
    }
  }
}
```

**Note:** No filtering applied - admins see all assets from all creators.

---

### 2.4 Attempting Unauthorized Access

**Request (Creator trying to access another creator's royalty statement):**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/royalties.getStatement?id=statement_creator2_001' \
  -H 'Cookie: next-auth.session-token=creator1_token...' \
  -H 'Content-Type: application/json'
```

**Response (403 Forbidden):**
```json
{
  "error": {
    "message": "FORBIDDEN",
    "code": -32003,
    "data": {
      "code": "FORBIDDEN",
      "httpStatus": 403,
      "path": "royalties.getStatement"
    }
  }
}
```

---

### 2.5 Brand Viewing Licensed Assets

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/ipAssets.list' \
  -H 'Authorization: Bearer brand_token...' \
  -H 'Content-Type: application/json'
```

**Response (Brand with Active Licenses):**
```json
{
  "result": {
    "data": {
      "items": [
        {
          "id": "asset_001",
          "title": "Licensed Artwork",
          "type": "IMAGE",
          "status": "PUBLISHED",
          "createdBy": "user_creator5",
          "licenses": [
            {
              "id": "license_001",
              "brandId": "brand_001",
              "status": "ACTIVE",
              "startDate": "2025-01-01T00:00:00Z"
            }
          ]
        }
      ],
      "total": 3,
      "page": 1
    }
  }
}
```

**Note:** Brand can see assets they've licensed, even though they didn't create them.

---

### 2.6 Creator Viewing Projects with Their Assets

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/projects.list' \
  -H 'Cookie: next-auth.session-token=creator_token...' \
  -H 'Content-Type: application/json'
```

**Response:**
```json
{
  "result": {
    "data": {
      "items": [
        {
          "id": "proj_brand2_003",
          "name": "Holiday Campaign",
          "status": "ACTIVE",
          "brandId": "brand_002",
          "licenses": [
            {
              "id": "license_045",
              "ipAssetId": "asset_creator1_012",
              "status": "ACTIVE"
            }
          ]
        }
      ],
      "total": 2,
      "page": 1
    }
  }
}
```

**Note:** Creator can see projects that licensed their assets.

---

## 3. TypeScript Type Definitions

### 3.1 Security Context

```typescript
/**
 * Security context for authenticated user
 * Automatically populated by middleware
 */
export interface SecurityContext {
  /** User ID from Auth.js session */
  userId: string;
  
  /** User role (ADMIN, CREATOR, BRAND, VIEWER) */
  role: UserRole;
  
  /** Creator profile ID (if user is a creator) */
  creatorId?: string;
  
  /** Brand profile ID (if user is a brand) */
  brandId?: string;
}
```

### 3.2 User Roles

```typescript
/**
 * User roles in the system
 */
export enum UserRole {
  /** Platform administrator with full access */
  ADMIN = 'ADMIN',
  
  /** Content creator who owns IP assets */
  CREATOR = 'CREATOR',
  
  /** Brand/company that licenses IP assets */
  BRAND = 'BRAND',
  
  /** Basic user with read-only public access */
  VIEWER = 'VIEWER',
}
```

### 3.3 Access Control Matrix Type

```typescript
/**
 * Access control rules for different resource types
 */
export interface AccessControlRules {
  ipAssets: {
    admin: 'all';
    creator: 'own_and_co_owned';
    brand: 'licensed_and_project_assets';
    viewer: 'none';
  };
  projects: {
    admin: 'all';
    creator: 'projects_with_owned_assets';
    brand: 'own_projects';
    viewer: 'none';
  };
  licenses: {
    admin: 'all';
    creator: 'licenses_for_owned_assets';
    brand: 'own_licenses';
    viewer: 'none';
  };
  royaltyStatements: {
    admin: 'all';
    creator: 'own_statements';
    brand: 'none';
    viewer: 'none';
  };
  payouts: {
    admin: 'all';
    creator: 'own_payouts';
    brand: 'none';
    viewer: 'none';
  };
}
```

### 3.4 IP Asset with Ownership

```typescript
/**
 * IP Asset entity
 */
export interface IpAsset {
  id: string;
  title: string;
  description?: string | null;
  type: AssetType;
  status: AssetStatus;
  storageKey: string;
  fileSize: bigint;
  mimeType: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  projectId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  
  /** Ownership records (may be filtered based on user role) */
  ownerships?: IpOwnership[];
  
  /** Licenses (may be filtered based on user role) */
  licenses?: License[];
  
  /** Project association (may be null if user doesn't have access) */
  project?: Project | null;
}

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  MODEL_3D = 'MODEL_3D',
  OTHER = 'OTHER',
}

export enum AssetStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
}
```

### 3.5 IP Ownership

```typescript
/**
 * IP Ownership record
 */
export interface IpOwnership {
  id: string;
  ipAssetId: string;
  creatorId: string;
  
  /** Ownership percentage in basis points (10000 = 100%) */
  shareBps: number;
  
  ownershipType: OwnershipType;
  startDate: string;
  endDate?: string | null;
  
  /** Contract reference for legal documentation */
  contractReference?: string | null;
  legalDocUrl?: string | null;
  
  /** Dispute tracking */
  disputed: boolean;
  disputedAt?: string | null;
  disputeReason?: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export enum OwnershipType {
  PRIMARY = 'PRIMARY',
  DERIVATIVE = 'DERIVATIVE',
  COLLABORATIVE = 'COLLABORATIVE',
  LICENSED = 'LICENSED',
}
```

### 3.6 Project

```typescript
/**
 * Project entity
 */
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  brandId: string;
  status: ProjectStatus;
  budgetCents: number;
  startDate: string;
  endDate?: string | null;
  objectives?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  
  /** Brand profile (may be filtered) */
  brand?: Brand;
  
  /** Associated IP assets (filtered by RLS) */
  ipAssets?: IpAsset[];
  
  /** Licenses in this project (filtered by RLS) */
  licenses?: License[];
}

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}
```

### 3.7 License

```typescript
/**
 * License entity
 */
export interface License {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId?: string | null;
  status: LicenseStatus;
  
  /** License terms */
  startDate: string;
  endDate?: string | null;
  exclusivityType: ExclusivityType;
  territory: string[];
  usageRights: string[];
  
  /** Financial terms (in cents) */
  licenseFeesCents: number;
  royaltyPercentageBps: number;
  
  /** Signatures */
  creatorSignedAt?: string | null;
  brandSignedAt?: string | null;
  
  createdAt: string;
  updatedAt: string;
  
  /** Related entities (filtered by RLS) */
  ipAsset?: IpAsset;
  brand?: Brand;
  project?: Project | null;
}

export enum LicenseStatus {
  DRAFT = 'DRAFT',
  PENDING_CREATOR = 'PENDING_CREATOR',
  PENDING_BRAND = 'PENDING_BRAND',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  REJECTED = 'REJECTED',
}

export enum ExclusivityType {
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  LIMITED_EXCLUSIVE = 'LIMITED_EXCLUSIVE',
}
```

### 3.8 Royalty Statement

```typescript
/**
 * Royalty Statement entity (Creator-only)
 */
export interface RoyaltyStatement {
  id: string;
  royaltyRunId: string;
  creatorId: string;
  
  /** Total earnings in cents */
  totalEarningsCents: number;
  
  status: RoyaltyStatementStatus;
  reviewedAt?: string | null;
  disputedAt?: string | null;
  disputeReason?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  
  createdAt: string;
  updatedAt: string;
  
  /** Royalty run period */
  royaltyRun?: RoyaltyRun;
  
  /** Line items detailing earnings per asset/license */
  lines?: RoyaltyLine[];
}

export enum RoyaltyStatementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DISPUTED = 'DISPUTED',
  PAID = 'PAID',
}

export interface RoyaltyLine {
  id: string;
  royaltyStatementId: string;
  licenseId: string;
  ipAssetId: string;
  
  /** Revenue generated in cents */
  revenueCents: number;
  
  /** Creator's ownership share in basis points */
  shareBps: number;
  
  /** Calculated royalty in cents */
  calculatedRoyaltyCents: number;
  
  periodStart: string;
  periodEnd: string;
  metadata?: Record<string, any>;
  
  /** Related entities */
  license?: License;
  ipAsset?: IpAsset;
}
```

### 3.9 Payout

```typescript
/**
 * Payout entity (Creator-only)
 */
export interface Payout {
  id: string;
  creatorId: string;
  royaltyStatementId?: string | null;
  
  /** Payout amount in cents */
  amountCents: number;
  
  /** Stripe transfer ID */
  stripeTransferId?: string | null;
  
  status: PayoutStatus;
  processedAt?: string | null;
  failedReason?: string | null;
  
  /** Retry tracking */
  retryCount: number;
  lastRetryAt?: string | null;
  
  createdAt: string;
  updatedAt: string;
  
  /** Associated statement */
  royaltyStatement?: RoyaltyStatement | null;
}

export enum PayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
```

### 3.10 Brand & Creator Profiles

```typescript
/**
 * Brand profile
 */
export interface Brand {
  id: string;
  userId: string;
  companyName: string;
  industry?: string | null;
  website?: string | null;
  description?: string | null;
  verificationStatus: VerificationStatus;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creator profile
 */
export interface Creator {
  id: string;
  userId: string;
  stageName: string;
  bio?: string | null;
  portfolioUrl?: string | null;
  verificationStatus: VerificationStatus;
  
  /** Financial data (only visible to creator and admin) */
  stripeAccountId?: string | null;
  totalEarnings?: number;
  
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export enum VerificationStatus {
  pending = 'pending',
  approved = 'approved',
  verified = 'verified',
  rejected = 'rejected',
}
```

---

## 4. Business Logic & Validation Rules

### 4.1 Access Control Rules

#### Creators Can:
- ✅ View IP assets they created (`createdBy` = their userId)
- ✅ View IP assets they own (via `IpOwnership.creatorId`)
- ✅ View IP assets they co-own (partial ownership via `IpOwnership`)
- ✅ View projects that license their assets
- ✅ View licenses for their assets
- ✅ View their own royalty statements
- ✅ View their own payouts
- ✅ View approved/verified brands (for discovery)
- ✅ View approved creators (public profiles)

#### Creators Cannot:
- ❌ View other creators' assets
- ❌ View other creators' royalty statements
- ❌ View other creators' payout information
- ❌ View brands' internal projects (unless their asset is licensed)
- ❌ View financial data of other creators

#### Brands Can:
- ✅ View their own projects
- ✅ View their own licenses
- ✅ View IP assets in their projects
- ✅ View IP assets they have licensed
- ✅ View approved/verified creators (for discovery)
- ✅ View public creator profiles

#### Brands Cannot:
- ❌ View other brands' projects
- ❌ View other brands' licenses
- ❌ View royalty statements (creator-only)
- ❌ View payout information (creator-only)
- ❌ View IP assets they haven't licensed or included in projects

#### Admins Can:
- ✅ View ALL data across all users
- ✅ View all IP assets from all creators
- ✅ View all projects from all brands
- ✅ View all licenses
- ✅ View all royalty statements
- ✅ View all payouts
- ✅ View all brands and creators regardless of verification status
- ✅ Access sensitive financial data

---

### 4.2 Ownership Share Validation

**Rule:** Total ownership shares for an IP asset must equal 10,000 basis points (100%)

```typescript
// Calculate total ownership
const totalOwnership = ownerships.reduce(
  (sum, ownership) => sum + ownership.shareBps,
  0
);

if (totalOwnership !== 10000) {
  throw new Error('Total ownership must equal 100% (10,000 basis points)');
}
```

**Frontend Implementation:**
```typescript
// When adding co-owners, show remaining percentage
const remainingBps = 10000 - currentTotalBps;
const remainingPercent = (remainingBps / 100).toFixed(2);

// Display: "Remaining ownership: 35.50%"
```

---

### 4.3 Active Ownership Filter

**Rule:** Only current ownerships are considered (where `endDate` is null or future)

```typescript
const activeOwnerships = ownerships.filter(
  (own) => !own.endDate || new Date(own.endDate) >= new Date()
);
```

**Frontend Display:**
```typescript
// Show active ownership indicator
if (ownership.endDate && new Date(ownership.endDate) < new Date()) {
  return <Badge variant="secondary">Historical</Badge>;
} else {
  return <Badge variant="success">Active</Badge>;
}
```

---

### 4.4 License-Based Asset Access

**Rule:** Brands can access assets they've licensed, even if not created by them

```typescript
// Brand can see asset if they have an active license
const hasActiveLicense = asset.licenses?.some(
  (license) =>
    license.brandId === currentBrandId &&
    license.status === 'ACTIVE' &&
    new Date(license.startDate) <= new Date() &&
    (!license.endDate || new Date(license.endDate) >= new Date())
);
```

---

### 4.5 Disputed Ownership Handling

**Rule:** Disputed ownerships should be flagged in the UI

```typescript
// Check for disputes
if (ownership.disputed) {
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Ownership Disputed</AlertTitle>
      <AlertDescription>
        {ownership.disputeReason || 'This ownership is under dispute'}
        {ownership.disputedAt && (
          <span className="text-xs">
            Disputed on {new Date(ownership.disputedAt).toLocaleDateString()}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
```

---

### 4.6 Shared Resource Visibility

**Rule:** When multiple users have access to the same resource (e.g., a project with licensed assets), all authorized parties can view it

**Example Scenario:**
- Creator A owns Asset 1
- Brand B licenses Asset 1 for Project X
- Both Creator A and Brand B can view:
  - Asset 1 (creator owns it, brand licensed it)
  - Project X (brand owns it, creator's asset is in it)
  - The license between them

---

## 5. Error Handling

### 5.1 Error Codes

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | No valid session or token | Redirect to login |
| `FORBIDDEN` | 403 | User doesn't have access to resource | Show "Access Denied" message |
| `NOT_FOUND` | 404 | Resource doesn't exist OR user doesn't have access | Show "Not Found" (don't reveal if resource exists) |
| `BAD_REQUEST` | 400 | Invalid request data | Show validation errors |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Show generic error, report to support |

---

### 5.2 Error Response Format

```typescript
interface TRPCError {
  error: {
    message: string;
    code: number;
    data: {
      code: string;
      httpStatus: number;
      path: string;
      zodError?: {
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}
```

**Example Error Response:**
```json
{
  "error": {
    "message": "FORBIDDEN",
    "code": -32003,
    "data": {
      "code": "FORBIDDEN",
      "httpStatus": 403,
      "path": "ipAssets.getById"
    }
  }
}
```

---

### 5.3 Error Handling Examples

#### 5.3.1 Unauthorized Access (401)

```typescript
try {
  const assets = await trpc.ipAssets.list.query();
} catch (error) {
  if (error.data?.code === 'UNAUTHORIZED') {
    // Redirect to login
    router.push('/auth/signin');
  }
}
```

#### 5.3.2 Forbidden Access (403)

```typescript
try {
  const statement = await trpc.royalties.getStatement.query({ 
    id: statementId 
  });
} catch (error) {
  if (error.data?.httpStatus === 403) {
    toast.error('You do not have permission to view this royalty statement');
    router.push('/dashboard');
  }
}
```

#### 5.3.3 Resource Not Found vs Access Denied

**Important:** For security reasons, the API returns `404 NOT_FOUND` for resources that:
1. Don't exist, OR
2. Exist but user doesn't have access

This prevents attackers from enumerating resources.

```typescript
try {
  const asset = await trpc.ipAssets.getById.query({ id: assetId });
} catch (error) {
  if (error.data?.httpStatus === 404) {
    // Could be not found OR access denied
    toast.error('Asset not found or you do not have access');
    router.push('/assets');
  }
}
```

---

### 5.4 Frontend Error Display

```typescript
// Generic error handler for RLS violations
function handleRLSError(error: TRPCClientError<any>) {
  const { code, httpStatus } = error.data || {};

  switch (httpStatus) {
    case 401:
      return {
        title: 'Authentication Required',
        message: 'Please sign in to continue',
        action: 'signin',
      };
      
    case 403:
      return {
        title: 'Access Denied',
        message: 'You do not have permission to access this resource',
        action: 'redirect',
      };
      
    case 404:
      return {
        title: 'Not Found',
        message: 'The requested resource was not found',
        action: 'back',
      };
      
    default:
      return {
        title: 'Error',
        message: 'An unexpected error occurred',
        action: 'retry',
      };
  }
}

// Usage in component
const { title, message, action } = handleRLSError(error);

return (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>{message}</AlertDescription>
    {action === 'signin' && (
      <Button onClick={() => router.push('/auth/signin')}>
        Sign In
      </Button>
    )}
  </Alert>
);
```

---

## 6. Authorization & Permissions

### 6.1 Role-Based Access Control Matrix

| Resource Type | VIEWER | CREATOR | BRAND | ADMIN |
|--------------|--------|---------|-------|-------|
| **IP Assets** | ❌ None | ✅ Own + Co-owned | ✅ Licensed + Project | ✅ All |
| **Projects** | ❌ None | ✅ With owned assets | ✅ Own | ✅ All |
| **Licenses** | ❌ None | ✅ For owned assets | ✅ Own | ✅ All |
| **Royalty Statements** | ❌ None | ✅ Own only | ❌ None | ✅ All |
| **Payouts** | ❌ None | ✅ Own only | ❌ None | ✅ All |
| **Brands** | ✅ Verified | ✅ Verified | ✅ Own | ✅ All |
| **Creators** | ✅ Approved | ✅ Own + Approved | ✅ Approved | ✅ All |

---

### 6.2 Checking User Role in Frontend

```typescript
import { useSession } from 'next-auth/react';

function useUserRole() {
  const { data: session } = useSession();
  
  const isAdmin = session?.user?.role === 'ADMIN';
  const isCreator = session?.user?.role === 'CREATOR';
  const isBrand = session?.user?.role === 'BRAND';
  const isViewer = session?.user?.role === 'VIEWER';
  
  return {
    role: session?.user?.role,
    isAdmin,
    isCreator,
    isBrand,
    isViewer,
    canViewAllData: isAdmin,
    canViewRoyalties: isAdmin || isCreator,
    canViewPayouts: isAdmin || isCreator,
    canCreateProjects: isAdmin || isBrand,
    canCreateAssets: isAdmin || isCreator,
  };
}

// Usage in component
function DashboardPage() {
  const { isCreator, isBrand, isAdmin } = useUserRole();
  
  return (
    <div>
      {isCreator && <CreatorDashboard />}
      {isBrand && <BrandDashboard />}
      {isAdmin && <AdminDashboard />}
    </div>
  );
}
```

---

### 6.3 Conditional UI Rendering

```typescript
// Show different navigation based on role
function Navigation() {
  const { role } = useUserRole();
  
  return (
    <nav>
      <NavItem href="/dashboard">Dashboard</NavItem>
      
      {role === 'CREATOR' && (
        <>
          <NavItem href="/assets">My Assets</NavItem>
          <NavItem href="/royalties">Royalties</NavItem>
          <NavItem href="/payouts">Payouts</NavItem>
        </>
      )}
      
      {role === 'BRAND' && (
        <>
          <NavItem href="/projects">My Projects</NavItem>
          <NavItem href="/licenses">Licenses</NavItem>
          <NavItem href="/discover">Discover Creators</NavItem>
        </>
      )}
      
      {role === 'ADMIN' && (
        <>
          <NavItem href="/admin/users">All Users</NavItem>
          <NavItem href="/admin/assets">All Assets</NavItem>
          <NavItem href="/admin/analytics">Analytics</NavItem>
        </>
      )}
    </nav>
  );
}
```

---

### 6.4 Field-Level Permissions

Some fields are only visible to certain roles:

```typescript
// Creator profile - sensitive fields
interface CreatorWithSensitiveData {
  // Public fields
  id: string;
  stageName: string;
  bio: string;
  
  // Sensitive (creator + admin only)
  stripeAccountId?: string;
  totalEarnings?: number;
  bankAccountDetails?: BankDetails;
}

// Frontend handling
function CreatorProfile({ creator }: { creator: Creator }) {
  const { isAdmin } = useUserRole();
  const isOwnProfile = session?.user?.creatorId === creator.id;
  
  const canViewSensitive = isAdmin || isOwnProfile;
  
  return (
    <div>
      <h1>{creator.stageName}</h1>
      <p>{creator.bio}</p>
      
      {canViewSensitive && creator.totalEarnings && (
        <div>
          <h3>Total Earnings</h3>
          <p>${(creator.totalEarnings / 100).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
```

---

## 7. Rate Limiting & Quotas

### 7.1 Rate Limits

RLS queries are subject to standard API rate limits:

| User Role | Requests per Minute | Burst Limit |
|-----------|---------------------|-------------|
| VIEWER | 20 | 30 |
| CREATOR | 60 | 100 |
| BRAND | 60 | 100 |
| ADMIN | 120 | 200 |

### 7.2 Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1699999999
```

### 7.3 Handling Rate Limits

```typescript
// Check rate limit headers
const response = await fetch('/api/trpc/ipAssets.list', {
  credentials: 'include',
});

const remaining = response.headers.get('X-RateLimit-Remaining');
const resetTime = response.headers.get('X-RateLimit-Reset');

if (remaining && parseInt(remaining) < 10) {
  console.warn(`Only ${remaining} requests remaining`);
}

if (response.status === 429) {
  const resetDate = new Date(parseInt(resetTime!) * 1000);
  toast.error(`Rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
}
```

---

## 8. Real-time Updates

### 8.1 Webhook Events

RLS-related events that trigger webhooks:

| Event | Triggers When | Affected Users |
|-------|---------------|----------------|
| `asset.ownership.changed` | Ownership is transferred or updated | Previous & new owners |
| `license.created` | New license is created | Asset owner, brand |
| `license.signed` | License is fully signed | Asset owner, brand |
| `royalty.statement.generated` | New statement is created | Creator |
| `payout.completed` | Payout is processed | Creator |

### 8.2 Polling Recommendations

For resources that change frequently, poll at these intervals:

| Resource | Recommended Poll Interval |
|----------|--------------------------|
| IP Assets List | 30 seconds |
| Projects List | 30 seconds |
| Licenses List | 15 seconds (pending actions) |
| Royalty Statements | 5 minutes |
| Payouts | 5 minutes |

**Example Polling Implementation:**
```typescript
import { useQuery } from '@tanstack/react-query';

function useMyAssets() {
  return useQuery({
    queryKey: ['assets', 'mine'],
    queryFn: () => trpc.ipAssets.list.query(),
    refetchInterval: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
```

---

## 9. Pagination & Filtering

### 9.1 Pagination Format

RLS-filtered queries use cursor-based pagination:

```typescript
interface PaginationInput {
  /** Number of items per page (max 100) */
  limit?: number;
  
  /** Cursor from previous response */
  cursor?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}
```

### 9.2 Pagination Example

```typescript
// First page
const firstPage = await trpc.ipAssets.list.query({
  limit: 20,
});

// Next page
const secondPage = await trpc.ipAssets.list.query({
  limit: 20,
  cursor: firstPage.nextCursor,
});

// React Query implementation
function useInfiniteAssets() {
  return useInfiniteQuery({
    queryKey: ['assets', 'infinite'],
    queryFn: ({ pageParam }) =>
      trpc.ipAssets.list.query({
        limit: 20,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

### 9.3 Filtering Options

Available filters (automatically scoped by RLS):

```typescript
interface AssetFilters {
  /** Filter by asset type */
  type?: AssetType[];
  
  /** Filter by status */
  status?: AssetStatus[];
  
  /** Search by title/description */
  search?: string;
  
  /** Filter by date range */
  createdAfter?: string;
  createdBefore?: string;
  
  /** Filter by project (if user has access) */
  projectId?: string;
}

// Usage
const assets = await trpc.ipAssets.list.query({
  limit: 20,
  filters: {
    type: ['IMAGE', 'VIDEO'],
    status: ['PUBLISHED'],
    search: 'summer campaign',
  },
});
```

### 9.4 Sorting Options

```typescript
interface SortOptions {
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// Usage
const assets = await trpc.ipAssets.list.query({
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});
```

---

## 10. Frontend Implementation Checklist

### 10.1 Initial Setup

- [ ] **Install dependencies**
  ```bash
  npm install @tanstack/react-query @trpc/client @trpc/react-query
  npm install next-auth
  ```

- [ ] **Configure tRPC client**
  ```typescript
  // src/lib/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '@/server/routers/_app';
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **Set up Auth.js session provider**
  ```typescript
  // app/providers.tsx
  import { SessionProvider } from 'next-auth/react';
  
  export function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SessionProvider>
        {children}
      </SessionProvider>
    );
  }
  ```

---

### 10.2 Authentication

- [ ] **Check authentication status**
  ```typescript
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <LoadingSpinner />;
  if (status === 'unauthenticated') return <SignInPrompt />;
  ```

- [ ] **Get current user role**
  ```typescript
  const userRole = session?.user?.role;
  const isCreator = userRole === 'CREATOR';
  const isBrand = userRole === 'BRAND';
  const isAdmin = userRole === 'ADMIN';
  ```

- [ ] **Handle session expiration**
  ```typescript
  // Redirect to login if session expires
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status]);
  ```

---

### 10.3 Data Fetching

- [ ] **Fetch user-specific data**
  ```typescript
  // Automatically filtered by RLS
  const { data: assets } = trpc.ipAssets.list.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: licenses } = trpc.licenses.list.useQuery();
  ```

- [ ] **Handle loading states**
  ```typescript
  const { data, isLoading, error } = trpc.ipAssets.list.useQuery();
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return <EmptyState />;
  ```

- [ ] **Implement error handling**
  ```typescript
  const { data, error } = trpc.ipAssets.getById.useQuery(
    { id: assetId },
    {
      onError: (err) => {
        if (err.data?.httpStatus === 403) {
          toast.error('Access denied');
          router.push('/assets');
        }
      },
    }
  );
  ```

---

### 10.4 UI Components

- [ ] **Role-based navigation**
  ```typescript
  function Navigation() {
    const { role } = useUserRole();
    
    return (
      <nav>
        {role === 'CREATOR' && <CreatorNav />}
        {role === 'BRAND' && <BrandNav />}
        {role === 'ADMIN' && <AdminNav />}
      </nav>
    );
  }
  ```

- [ ] **Conditional rendering based on permissions**
  ```typescript
  {isCreator && (
    <Button onClick={handleCreateAsset}>
      Create New Asset
    </Button>
  )}
  
  {isBrand && (
    <Button onClick={handleCreateProject}>
      Create New Project
    </Button>
  )}
  ```

- [ ] **Display ownership information**
  ```typescript
  function AssetOwnership({ asset }: { asset: IpAsset }) {
    const activeOwners = asset.ownerships?.filter(
      (o) => !o.endDate || new Date(o.endDate) > new Date()
    );
    
    return (
      <div>
        {activeOwners?.map((ownership) => (
          <OwnershipBadge key={ownership.id} ownership={ownership} />
        ))}
      </div>
    );
  }
  ```

- [ ] **Show access indicators**
  ```typescript
  // Show why user can see this asset
  function AccessIndicator({ asset }: { asset: IpAsset }) {
    const { session } = useSession();
    
    const isOwner = asset.createdBy === session?.user?.id;
    const isCoOwner = asset.ownerships?.some(
      (o) => o.creatorId === session?.user?.creatorId
    );
    const isLicensed = asset.licenses?.some(
      (l) => l.brandId === session?.user?.brandId
    );
    
    return (
      <div>
        {isOwner && <Badge>Owner</Badge>}
        {isCoOwner && <Badge>Co-owner</Badge>}
        {isLicensed && <Badge>Licensed</Badge>}
      </div>
    );
  }
  ```

---

### 10.5 Error Handling

- [ ] **Global error boundary**
  ```typescript
  class ErrorBoundary extends React.Component {
    componentDidCatch(error: Error) {
      if (error.message.includes('FORBIDDEN')) {
        router.push('/access-denied');
      }
    }
  }
  ```

- [ ] **Toast notifications for errors**
  ```typescript
  const { mutate } = trpc.ipAssets.create.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });
  ```

- [ ] **Retry logic for failed requests**
  ```typescript
  const { data } = trpc.ipAssets.list.useQuery(undefined, {
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  ```

---

### 10.6 Performance Optimization

- [ ] **Implement pagination**
  ```typescript
  const [page, setPage] = useState(1);
  const { data } = trpc.ipAssets.list.useQuery({
    limit: 20,
    page,
  });
  ```

- [ ] **Cache frequently accessed data**
  ```typescript
  const queryClient = useQueryClient();
  
  // Prefetch next page
  queryClient.prefetchQuery({
    queryKey: ['assets', { page: page + 1 }],
    queryFn: () => trpc.ipAssets.list.query({ page: page + 1 }),
  });
  ```

- [ ] **Debounce search inputs**
  ```typescript
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const { data } = trpc.ipAssets.list.useQuery({
    filters: { search: debouncedSearch },
  });
  ```

---

### 10.7 Security Best Practices

- [ ] **Never assume data access** - Always handle 403 errors gracefully
- [ ] **Don't reveal resource existence** - Treat 404 same as 403
- [ ] **Validate on both sides** - Frontend validation is UX, backend is security
- [ ] **Use TypeScript strictly** - Enable strict mode for type safety
- [ ] **Sanitize user inputs** - Never trust user input
- [ ] **Log security events** - Track access attempts for audit

---

## 11. Testing Scenarios

### 11.1 Unit Tests

#### Test: Creator Can Only See Own Assets

```typescript
import { render, screen } from '@testing-library/react';
import { mockSession } from '@/test/mocks';

describe('AssetsList', () => {
  it('shows only creator own assets', async () => {
    mockSession({
      user: {
        id: 'user_creator1',
        role: 'CREATOR',
        creatorId: 'creator_001',
      },
    });
    
    render(<AssetsList />);
    
    // Should see own assets
    expect(screen.getByText('My Artwork 1')).toBeInTheDocument();
    expect(screen.getByText('My Artwork 2')).toBeInTheDocument();
    
    // Should NOT see other creators' assets
    expect(screen.queryByText('Other Creator Artwork')).not.toBeInTheDocument();
  });
});
```

---

#### Test: Brand Can See Licensed Assets

```typescript
it('brand can see licensed assets', async () => {
  mockSession({
    user: {
      id: 'user_brand1',
      role: 'BRAND',
      brandId: 'brand_001',
    },
  });
  
  render(<AssetsList />);
  
  // Should see licensed assets
  expect(screen.getByText('Licensed Artwork')).toBeInTheDocument();
  
  // Should NOT see unlicensed assets
  expect(screen.queryByText('Unlicensed Asset')).not.toBeInTheDocument();
});
```

---

#### Test: 403 Error Handling

```typescript
it('handles forbidden access gracefully', async () => {
  const { mutate } = trpc.royalties.getStatement.useMutation();
  
  await expect(
    mutate({ id: 'statement_other_creator' })
  ).rejects.toThrow('FORBIDDEN');
  
  // Should show error toast
  expect(screen.getByText('Access denied')).toBeInTheDocument();
});
```

---

### 11.2 Integration Tests

#### Test: Cross-Tenant Isolation

```typescript
describe('Cross-tenant isolation', () => {
  it('prevents creator from seeing another creator royalties', async () => {
    // Login as Creator 1
    await signIn('creator1@example.com', 'password');
    
    // Try to access Creator 2's royalty statement
    const response = await fetch('/api/trpc/royalties.getStatement?id=stmt_creator2_001', {
      credentials: 'include',
    });
    
    expect(response.status).toBe(403);
  });
  
  it('prevents brand from seeing another brand projects', async () => {
    // Login as Brand 1
    await signIn('brand1@example.com', 'password');
    
    // Try to access Brand 2's project
    const response = await fetch('/api/trpc/projects.getById?id=proj_brand2_001', {
      credentials: 'include',
    });
    
    expect(response.status).toBe(404); // Could be 404 or 403
  });
});
```

---

#### Test: Shared Resource Access

```typescript
it('allows brand to see licensed asset', async () => {
  // Create license: Brand 1 licenses Asset from Creator 1
  await createLicense({
    brandId: 'brand_001',
    ipAssetId: 'asset_creator1_001',
    status: 'ACTIVE',
  });
  
  // Login as Brand 1
  await signIn('brand1@example.com', 'password');
  
  // Should be able to see the licensed asset
  const response = await fetch('/api/trpc/ipAssets.getById?id=asset_creator1_001', {
    credentials: 'include',
  });
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.result.data.id).toBe('asset_creator1_001');
});
```

---

### 11.3 End-to-End Tests (Playwright/Cypress)

```typescript
describe('Creator Dashboard E2E', () => {
  it('creator sees only their own data', () => {
    // Login as creator
    cy.login('creator1@example.com', 'password');
    
    // Navigate to assets page
    cy.visit('/assets');
    
    // Should see own assets
    cy.contains('My Artwork 1').should('be.visible');
    cy.contains('My Artwork 2').should('be.visible');
    
    // Navigate to royalties
    cy.visit('/royalties');
    
    // Should see own royalty statements
    cy.contains('Q1 2025 Statement').should('be.visible');
    
    // Try to manually navigate to another creator's statement
    cy.visit('/royalties/statement_other_creator');
    
    // Should see access denied message
    cy.contains('Access denied').should('be.visible');
  });
});

describe('Brand Dashboard E2E', () => {
  it('brand sees only their projects and licenses', () => {
    // Login as brand
    cy.login('brand1@example.com', 'password');
    
    // Navigate to projects
    cy.visit('/projects');
    
    // Should see own projects
    cy.contains('Summer Campaign').should('be.visible');
    
    // Navigate to licenses
    cy.visit('/licenses');
    
    // Should see own licenses
    cy.contains('License #001').should('be.visible');
    
    // Try to access another brand's project
    cy.request({
      url: '/api/trpc/projects.getById?id=proj_brand2_001',
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.be.oneOf([403, 404]);
    });
  });
});
```

---

### 11.4 Manual Testing Checklist

#### Creator Role Testing
- [ ] Create new IP asset - should appear in "My Assets"
- [ ] View asset details - should show full ownership info
- [ ] Try to view another creator's asset - should get 403/404
- [ ] View royalty statements - should only see own statements
- [ ] Try to view another creator's statement - should get 403
- [ ] View payouts - should only see own payouts
- [ ] Browse brands - should only see verified brands
- [ ] View project with licensed asset - should see project details

#### Brand Role Testing
- [ ] Create new project - should appear in "My Projects"
- [ ] Create license for an asset - should see licensed asset
- [ ] View licensed asset details - should have access
- [ ] Try to view unlicensed asset - should get 403/404
- [ ] Try to view another brand's project - should get 403/404
- [ ] Try to view royalty statements - should get 403
- [ ] Browse creators - should only see approved creators

#### Admin Role Testing
- [ ] View all assets - should see assets from all creators
- [ ] View all projects - should see projects from all brands
- [ ] View all licenses - should see all license agreements
- [ ] View all royalty statements - should see statements for all creators
- [ ] View all payouts - should see all payout records
- [ ] View all brands - should see brands regardless of verification status
- [ ] View all creators - should see creators regardless of approval status

#### Cross-Tenant Isolation Testing
- [ ] Login as Creator 1, verify can't see Creator 2's data
- [ ] Login as Brand 1, verify can't see Brand 2's data
- [ ] Create license between Creator 1 and Brand 1
- [ ] Verify both can see the licensed asset
- [ ] Verify Creator 1 can see Brand 1's project (with their asset)
- [ ] Logout and verify no data is visible

---

## 12. Common Pitfalls & Solutions

### 12.1 Pitfall: Assuming Empty Results Mean Error

**Problem:**
```typescript
const { data } = trpc.ipAssets.list.useQuery();

if (!data || data.items.length === 0) {
  return <ErrorMessage>Failed to load assets</ErrorMessage>;
}
```

**Solution:**
```typescript
const { data, isLoading, error } = trpc.ipAssets.list.useQuery();

if (error) {
  return <ErrorMessage>Failed to load assets</ErrorMessage>;
}

if (isLoading) {
  return <LoadingSpinner />;
}

if (!data || data.items.length === 0) {
  return <EmptyState>No assets found</EmptyState>;
}
```

---

### 12.2 Pitfall: Not Handling 403 vs 404

**Problem:**
```typescript
// Treating all errors the same
if (error) {
  return <div>Asset not found</div>;
}
```

**Solution:**
```typescript
if (error) {
  if (error.data?.httpStatus === 403) {
    return <div>You don't have permission to view this asset</div>;
  }
  if (error.data?.httpStatus === 404) {
    return <div>Asset not found or you don't have access</div>;
  }
  return <div>An error occurred</div>;
}
```

---

### 12.3 Pitfall: Client-Side Authorization Checks Only

**Problem:**
```typescript
// Only checking on frontend
if (userRole !== 'ADMIN') {
  return <div>Access denied</div>;
}

// Making request anyway
const data = await fetch('/api/admin/users');
```

**Solution:**
```typescript
// Let the backend handle authorization
// Just handle the error gracefully
try {
  const data = await trpc.admin.users.query();
} catch (error) {
  if (error.data?.code === 'FORBIDDEN') {
    toast.error('Admin access required');
  }
}
```

---

### 12.4 Pitfall: Not Refetching After Permission Changes

**Problem:**
```typescript
// User's creator profile gets approved
// But old data is still cached
```

**Solution:**
```typescript
// Invalidate queries after permission changes
const queryClient = useQueryClient();

function handleVerificationApproval() {
  // After approval
  queryClient.invalidateQueries(['creators']);
  queryClient.invalidateQueries(['assets']);
}
```

---

## 13. Quick Reference

### Key Concepts
- ✅ RLS is **automatic** - no special endpoints needed
- ✅ All queries are **filtered by user role** at database level
- ✅ Admins have **full access** to all data
- ✅ Creators see **own assets + co-owned + royalties**
- ✅ Brands see **own projects + licenses + licensed assets**
- ✅ Shared resources are **accessible to all authorized parties**

### Access Control Summary
```
ADMIN:    Everything
CREATOR:  Own assets, royalties, payouts, projects with owned assets
BRAND:    Own projects, licenses, licensed assets
VIEWER:   Public profiles only
```

### Error Codes
```
401: Unauthorized      → Redirect to login
403: Forbidden         → Show access denied
404: Not Found         → Resource doesn't exist OR no access
500: Internal Error    → Show error, contact support
```

### Best Practices
1. Always use TypeScript strict mode
2. Handle 403/404 errors gracefully
3. Never trust client-side checks alone
4. Invalidate queries after permission changes
5. Use React Query for caching and refetching
6. Implement proper loading and error states
7. Test cross-tenant isolation thoroughly

---

## Additional Resources

- **Authentication Guide:** `/docs/AUTH_IMPLEMENTATION.md`
- **Permission System:** `/docs/frontend-integration/PERMISSION_SYSTEM_INTEGRATION_GUIDE.md`
- **Role System:** `/docs/frontend-integration/ROLE_SYSTEM_INTEGRATION_GUIDE.md`
- **Backend RLS Docs:** `/docs/middleware/ROW_LEVEL_SECURITY.md`
- **tRPC Setup:** `https://trpc.io/docs/client/react`
- **React Query:** `https://tanstack.com/query/latest`

---

**Document Version:** 1.0  
**Last Updated:** October 12, 2025  
**Status:** ✅ Production Ready  
**Classification:** 🌐 SHARED (Both Admin Backend & Public Website)
