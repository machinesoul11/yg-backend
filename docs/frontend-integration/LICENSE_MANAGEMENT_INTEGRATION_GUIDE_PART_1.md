# License Management - Frontend Integration Guide (Part 1 of 3)
**Classification: ⚡ HYBRID**  
*License negotiation happens on website (brand ↔ creator). Admins manage renewals, expirations, and conflicts. Core logic is shared, admin has additional management tools.*

---

## Table of Contents - Part 1
1. [Overview & Architecture](#overview--architecture)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)

---

## Overview & Architecture

### Module Purpose
The License Management system handles the complete lifecycle of IP licensing agreements between brands and creators:
- **Create & Negotiate** licenses for IP assets
- **Update & Amend** active licenses with multi-party approval
- **Extend & Renew** licenses with automated eligibility checks
- **Terminate** licenses with audit trails
- **Conflict Detection** to prevent overlapping exclusive licenses
- **Status Transitions** with automated workflows

### Key Workflows
1. **Brand creates license** → Creator approves → License becomes ACTIVE
2. **Active license amendments** → Multi-party approval required → Applied to license
3. **License extensions** → Brand requests → Creator approves → End date extended
4. **License renewals** → Eligibility check → Offer generation → Acceptance → New license created
5. **Automated transitions** → Background jobs move licenses through status lifecycle

---

## API Endpoints

> **Note**: This backend uses **tRPC** for API communication. All endpoints are accessible via the tRPC client at `/api/trpc`.

### Core License Operations

#### 1. Create License
**Endpoint**: `licenses.create`  
**Method**: Mutation  
**Auth**: Required (Brand or Admin)  
**Purpose**: Create a new license for an IP asset

**Request Schema**:
```typescript
{
  ipAssetId: string;        // ID of the IP asset being licensed
  brandId: string;          // ID of the brand licensing the asset
  projectId?: string;       // Optional project association
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  startDate: string;        // ISO 8601 date
  endDate: string;          // ISO 8601 date
  feeCents: number;         // License fee in cents (e.g., 500000 = $5,000)
  revShareBps: number;      // Revenue share in basis points (100 bps = 1%)
  paymentTerms?: string;    // e.g., "Net 30", "50% upfront, 50% on delivery"
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  scope: LicenseScope;      // See LicenseScope interface below
  autoRenew?: boolean;      // Default: false
  metadata?: object;        // Custom metadata
}
```

**Response Schema**:
```typescript
{
  id: string;
  status: 'DRAFT' | 'PENDING_APPROVAL';
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: string;
  startDate: string;
  endDate: string;
  feeCents: number;
  revShareBps: number;
  scope: LicenseScope;
  createdAt: string;
  // ... expanded relations if requested
}
```

---

#### 2. Approve License
**Endpoint**: `licenses.approve`  
**Method**: Mutation  
**Auth**: Required (Creator who owns the asset)  
**Purpose**: Creator approves a pending license

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**: Same as create response with `status: 'ACTIVE'`

---

#### 3. Update License
**Endpoint**: `licenses.update`  
**Method**: Mutation  
**Auth**: Required (Brand/Creator/Admin based on status)  
**Purpose**: Update license fields (restrictions apply based on status)

**Request Schema**:
```typescript
{
  licenseId: string;
  status?: LicenseStatus;
  endDate?: string;
  feeCents?: number;
  revShareBps?: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope?: LicenseScope;
  autoRenew?: boolean;
  metadata?: object;
}
```

**Response Schema**: Updated license object

**⚠️ Business Rules**:
- `DRAFT` licenses: Only brand can update all fields
- `PENDING_APPROVAL`: Limited updates (metadata, autoRenew only)
- `ACTIVE`: Cannot directly update critical fields (must use amendments)
- Fee changes >20% require amendment workflow
- Scope changes on active licenses require amendments
- `TERMINATED`/`EXPIRED` licenses: No updates allowed

---

#### 4. Get License by ID
**Endpoint**: `licenses.getById`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Fetch single license with optional relations

**Request Schema**:
```typescript
{
  licenseId: string;
  includeRelations?: boolean; // Default: true
}
```

**Response Schema**:
```typescript
{
  id: string;
  status: LicenseStatus;
  licenseType: LicenseType;
  startDate: string;
  endDate: string;
  feeCents: number;
  feeDollars: number;        // Computed: feeCents / 100
  revShareBps: number;
  revSharePercent: number;   // Computed: revShareBps / 100
  scope: LicenseScope;
  autoRenew: boolean;
  amendmentCount: number;
  extensionCount: number;
  // Expanded relations (if includeRelations: true)
  ipAsset?: {
    id: string;
    title: string;
    type: AssetType;
    thumbnailUrl: string;
    ownerships: Array<{
      creator: {
        id: string;
        stageName: string;
        user: { name: string; email: string; }
      }
    }>
  };
  brand?: {
    id: string;
    companyName: string;
    logo: string;
    user: { name: string; email: string; }
  };
  project?: {
    id: string;
    name: string;
    status: ProjectStatus;
  };
  parentLicense?: LicenseResponse;  // For renewals
  renewals?: LicenseResponse[];
  amendments?: Array<AmendmentResponse>;
  extensions?: Array<ExtensionResponse>;
  statusHistory?: Array<StatusHistoryEntry>;
}
```

---

#### 5. List Licenses
**Endpoint**: `licenses.list`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Fetch paginated list of licenses with filters

**Request Schema**:
```typescript
{
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;   // ISO date - find licenses expiring before this date
  creatorId?: string;        // Filter by creator ownership
  page?: number;             // Default: 1
  pageSize?: number;         // Default: 20, Max: 100
}
```

**Response Schema**:
```typescript
{
  data: LicenseResponse[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }
  }
}
```

---

#### 6. Terminate License
**Endpoint**: `licenses.terminate`  
**Method**: Mutation  
**Auth**: Required (Brand/Creator/Admin)  
**Purpose**: Early termination of an active license

**Request Schema**:
```typescript
{
  licenseId: string;
  reason: string;            // Min 10 characters
  effectiveDate?: string;    // ISO date, defaults to now
}
```

**Response Schema**: Updated license with `status: 'TERMINATED'`

---

#### 7. Check Conflicts
**Endpoint**: `licenses.checkConflicts`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Detect licensing conflicts before creating/updating

**Request Schema**:
```typescript
{
  ipAssetId: string;
  startDate: string;
  endDate: string;
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string; // When updating, exclude self
}
```

**Response Schema**:
```typescript
{
  hasConflicts: boolean;
  conflicts: Array<{
    licenseId: string;
    reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
    details: string;
    conflictingLicense?: {
      id: string;
      status: LicenseStatus;
      licenseType: LicenseType;
      startDate: string;
      endDate: string;
      brand: { companyName: string }
    }
  }>
}
```

---

### Amendment Operations

#### 8. Propose Amendment
**Endpoint**: `licenses.proposeAmendment`  
**Method**: Mutation  
**Auth**: Required (Brand/Creator)  
**Purpose**: Propose changes to an active license

**Request Schema**:
```typescript
{
  licenseId: string;
  amendmentType: 'FINANCIAL' | 'SCOPE' | 'DATES' | 'OTHER';
  justification: string;     // Min 10 characters
  changes: Array<{
    field: string;           // e.g., "feeCents", "endDate", "scope.media.digital"
    currentValue: any;
    proposedValue: any;
  }>;
  approvalDeadlineDays?: number; // Default: 14 days
}
```

**Response Schema**:
```typescript
{
  id: string;                // Amendment ID
  amendmentNumber: number;   // Sequential per license
  licenseId: string;
  status: 'PROPOSED';
  amendmentType: string;
  justification: string;
  fieldsChanged: string[];
  beforeValues: object;
  afterValues: object;
  approvalDeadline: string;
  proposedAt: string;
  proposedBy: string;
  proposedByRole: 'brand' | 'creator' | 'admin';
  approvals: Array<{
    approverId: string;
    approverRole: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
  }>;
}
```

---

#### 9. Process Amendment Approval
**Endpoint**: `licenses.processAmendmentApproval`  
**Method**: Mutation  
**Auth**: Required (Affected parties)  
**Purpose**: Approve or reject a proposed amendment

**Request Schema**:
```typescript
{
  amendmentId: string;
  action: 'approve' | 'reject';
  comments?: string;
}
```

**Response Schema**:
```typescript
{
  status: 'APPROVED' | 'REJECTED';
  amendment: AmendmentResponse;
  appliedToLicense?: boolean; // True if all parties approved and changes applied
}
```

---

#### 10. Get Amendments
**Endpoint**: `licenses.getAmendments`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Get all amendments for a license

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**: `Array<AmendmentResponse>`

---

#### 11. Get Pending Amendments
**Endpoint**: `licenses.getPendingAmendments`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Get amendments awaiting user's approval

**Request Schema**:
```typescript
{
  userRole: 'brand' | 'creator' | 'admin';
}
```

**Response Schema**: `Array<AmendmentResponse>`

---

### Extension Operations

#### 12. Request Extension
**Endpoint**: `licenses.requestExtension`  
**Method**: Mutation  
**Auth**: Required (Brand)  
**Purpose**: Request to extend license end date

**Request Schema**:
```typescript
{
  licenseId: string;
  extensionDays: number;     // Max: 365 days
  justification: string;     // Min 10 characters
}
```

**Response Schema**:
```typescript
{
  success: boolean;
  extensionId: string;
  approvalRequired: boolean;  // False if auto-approved (<30 days)
  additionalFeeCents: number; // Pro-rated fee for extension
  newEndDate: string;
}
```

**💡 Business Logic**:
- Extensions <30 days: Auto-approved
- Extensions ≥30 days: Require creator approval
- Additional fee = (original daily rate × extension days)
- Conflict checking performed before approval

---

#### 13. Process Extension Approval
**Endpoint**: `licenses.processExtensionApproval`  
**Method**: Mutation  
**Auth**: Required (Creator)  
**Purpose**: Approve or reject an extension request

**Request Schema**:
```typescript
{
  extensionId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;  // Required if rejecting
}
```

**Response Schema**:
```typescript
{
  status: 'APPROVED' | 'REJECTED';
  extension: ExtensionResponse;
}
```

---

#### 14. Get Extensions
**Endpoint**: `licenses.getExtensions`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Get all extension requests for a license

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**:
```typescript
Array<{
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  originalEndDate: string;
  newEndDate: string;
  extensionDays: number;
  additionalFeeCents: number;
  justification: string;
  requestedAt: string;
  requestedBy: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}>
```

---

### Renewal Operations

#### 15. Check Renewal Eligibility
**Endpoint**: `licenses.checkRenewalEligibility`  
**Method**: Query  
**Auth**: Required  
**Purpose**: Check if license can be renewed and get suggested terms

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**:
```typescript
{
  eligible: boolean;
  reasons: string[];         // Reasons why eligible/ineligible
  suggestedTerms?: {
    durationDays: number;
    feeCents: number;
    revShareBps: number;
    startDate: string;
    endDate: string;
    adjustments: {
      feeAdjustmentPercent: number;      // e.g., 5 = 5% increase
      revShareAdjustmentBps: number;     // e.g., 50 = 0.5% increase
      loyaltyDiscount?: number;          // e.g., -2.5 = 2.5% discount
      performanceBonus?: number;         // Based on usage metrics
    }
  }
}
```

**Eligibility Rules**:
- License must be `ACTIVE` or `EXPIRED`
- Must be within 90 days of expiration
- Cannot have already been renewed (no `parentLicenseId` on another license)
- No unresolved conflicts for renewal period

---

#### 16. Generate Renewal Offer
**Endpoint**: `licenses.generateRenewalOffer`  
**Method**: Mutation  
**Auth**: Required (Brand/Admin)  
**Purpose**: Create a formal renewal offer

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**:
```typescript
{
  offerId: string;           // Unique offer ID
  expiresAt: string;         // 30 days from generation
  terms: RenewalTerms;       // From eligibility check
}
```

**💡 Notes**:
- Offer stored in license metadata
- 30-day acceptance window
- Sends notification emails to brand and creators

---

#### 17. Accept Renewal Offer
**Endpoint**: `licenses.acceptRenewalOffer`  
**Method**: Mutation  
**Auth**: Required (Brand)  
**Purpose**: Accept renewal offer and create new license

**Request Schema**:
```typescript
{
  licenseId: string;
  offerId: string;
}
```

**Response Schema**:
```typescript
{
  renewalLicense: LicenseResponse; // New license with PENDING_APPROVAL status
  parentLicenseId: string;          // Original license ID
}
```

---

### Status Transition Operations

#### 18. Transition Status
**Endpoint**: `licenses.transitionStatus`  
**Method**: Mutation  
**Auth**: Required (Admin only for manual transitions)  
**Purpose**: Manually transition license status

**Request Schema**:
```typescript
{
  licenseId: string;
  toStatus: LicenseStatus;
  reason?: string;
}
```

**Response Schema**: Updated license object

**⚠️ Validation**:
- Only certain transitions are allowed (see state machine in Part 2)
- Some transitions are automated and cannot be manually triggered

---

#### 19. Get Status History
**Endpoint**: `licenses.getStatusHistory`  
**Method**: Query  
**Auth**: Required  
**Purpose**: View complete status transition timeline

**Request Schema**:
```typescript
{
  licenseId: string;
}
```

**Response Schema**:
```typescript
Array<{
  id: string;
  fromStatus: string;
  toStatus: string;
  transitionedAt: string;
  transitionedBy?: string;  // User ID or null for automated
  reason?: string;
  metadata?: object;
}>
```

---

### Analytics & Reporting

#### 20. Get License Stats
**Endpoint**: `licenses.getStats`  
**Method**: Query  
**Auth**: Required (Admin/Brand)  
**Purpose**: Aggregate license statistics

**Request Schema**:
```typescript
{
  brandId?: string;          // Filter by brand
  creatorId?: string;        // Filter by creator
}
```

**Response Schema**:
```typescript
{
  totalActive: number;
  totalRevenueCents: number;
  expiringIn30Days: number;
  expiringIn60Days: number;
  expiringIn90Days: number;
  averageLicenseDurationDays: number;
  exclusiveLicenses: number;
  nonExclusiveLicenses: number;
  renewalRate: number;        // Percentage (0-100)
}
```

---

#### 21. Get Extension Analytics
**Endpoint**: `licenses.getExtensionAnalytics`  
**Method**: Query  
**Auth**: Required (Admin/Brand)  
**Purpose**: Extension request metrics

**Request Schema**:
```typescript
{
  brandId?: string;
}
```

**Response Schema**:
```typescript
{
  total_extensions: number;
  approved: number;
  rejected: number;
  pending: number;
  avg_extension_days: number;
  total_additional_revenue_cents: number;
}
```

---

## Request/Response Examples

### Example 1: Create Exclusive License

**Request**:
```bash
# Using tRPC client
const newLicense = await trpc.licenses.create.mutate({
  ipAssetId: "asset_abc123",
  brandId: "brand_xyz789",
  projectId: "proj_campaign_2024",
  licenseType: "EXCLUSIVE",
  startDate: "2024-11-01T00:00:00Z",
  endDate: "2025-11-01T00:00:00Z",
  feeCents: 500000,  // $5,000
  revShareBps: 500,   // 5%
  paymentTerms: "Net 30",
  billingFrequency: "ONE_TIME",
  scope: {
    media: {
      digital: true,
      print: true,
      broadcast: false,
      ooh: false
    },
    placement: {
      social: true,
      website: true,
      email: true,
      paid_ads: true,
      packaging: false
    },
    geographic: {
      territories: ["US", "CA", "GB"]
    },
    exclusivity: {
      category: "Fashion",
      competitors: ["brand_competitor1"]
    },
    cutdowns: {
      allowEdits: true,
      maxDuration: 60,
      aspectRatios: ["16:9", "1:1", "9:16"]
    },
    attribution: {
      required: true,
      format: "Photo by @{creatorHandle}"
    }
  },
  autoRenew: false
});
```

**Response**:
```json
{
  "id": "lic_def456",
  "status": "PENDING_APPROVAL",
  "ipAssetId": "asset_abc123",
  "brandId": "brand_xyz789",
  "projectId": "proj_campaign_2024",
  "licenseType": "EXCLUSIVE",
  "startDate": "2024-11-01T00:00:00.000Z",
  "endDate": "2025-11-01T00:00:00.000Z",
  "feeCents": 500000,
  "feeDollars": 5000,
  "revShareBps": 500,
  "revSharePercent": 5,
  "paymentTerms": "Net 30",
  "billingFrequency": "ONE_TIME",
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
      "territories": ["US", "CA", "GB"]
    },
    "exclusivity": {
      "category": "Fashion",
      "competitors": ["brand_competitor1"]
    },
    "cutdowns": {
      "allowEdits": true,
      "maxDuration": 60,
      "aspectRatios": ["16:9", "1:1", "9:16"]
    },
    "attribution": {
      "required": true,
      "format": "Photo by @{creatorHandle}"
    }
  },
  "autoRenew": false,
  "amendmentCount": 0,
  "extensionCount": 0,
  "createdAt": "2024-10-14T10:30:00.000Z",
  "updatedAt": "2024-10-14T10:30:00.000Z",
  "ipAsset": {
    "id": "asset_abc123",
    "title": "Fashion Editorial #42",
    "type": "IMAGE",
    "thumbnailUrl": "https://storage.example.com/thumb.jpg"
  },
  "brand": {
    "id": "brand_xyz789",
    "companyName": "Acme Fashion Co.",
    "logo": "https://storage.example.com/logo.png"
  }
}
```

---

### Example 2: Conflict Detection

**Request**:
```typescript
const conflictCheck = await trpc.licenses.checkConflicts.query({
  ipAssetId: "asset_abc123",
  startDate: "2024-12-01T00:00:00Z",
  endDate: "2025-12-01T00:00:00Z",
  licenseType: "EXCLUSIVE",
  scope: {
    media: { digital: true, print: true, broadcast: false, ooh: false },
    placement: { social: true, website: true, email: true, paid_ads: true, packaging: false }
  }
});
```

**Response (Conflict Found)**:
```json
{
  "hasConflicts": true,
  "conflicts": [
    {
      "licenseId": "lic_existing123",
      "reason": "EXCLUSIVE_OVERLAP",
      "details": "Existing exclusive license overlaps with requested period (2024-11-01 to 2025-11-01)",
      "conflictingLicense": {
        "id": "lic_existing123",
        "status": "ACTIVE",
        "licenseType": "EXCLUSIVE",
        "startDate": "2024-11-01T00:00:00.000Z",
        "endDate": "2025-11-01T00:00:00.000Z",
        "brand": {
          "companyName": "Another Brand Inc."
        }
      }
    }
  ]
}
```

**Response (No Conflicts)**:
```json
{
  "hasConflicts": false,
  "conflicts": []
}
```

---

### Example 3: Propose Amendment

**Request**:
```typescript
const amendment = await trpc.licenses.proposeAmendment.mutate({
  licenseId: "lic_def456",
  amendmentType: "FINANCIAL",
  justification: "Increased campaign scope requires additional budget",
  changes: [
    {
      field: "feeCents",
      currentValue: 500000,
      proposedValue: 750000
    },
    {
      field: "revShareBps",
      currentValue: 500,
      proposedValue: 650
    }
  ],
  approvalDeadlineDays: 14
});
```

**Response**:
```json
{
  "id": "amend_ghi789",
  "amendmentNumber": 1,
  "licenseId": "lic_def456",
  "status": "PROPOSED",
  "amendmentType": "FINANCIAL",
  "justification": "Increased campaign scope requires additional budget",
  "fieldsChanged": ["feeCents", "revShareBps"],
  "beforeValues": {
    "feeCents": 500000,
    "revShareBps": 500
  },
  "afterValues": {
    "feeCents": 750000,
    "revShareBps": 650
  },
  "approvalDeadline": "2024-10-28T10:30:00.000Z",
  "proposedAt": "2024-10-14T10:30:00.000Z",
  "proposedBy": "user_brand123",
  "proposedByRole": "brand",
  "approvals": [
    {
      "approverId": "user_creator456",
      "approverRole": "creator",
      "status": "PENDING"
    }
  ]
}
```

---

### Example 4: Request Extension (Auto-Approved)

**Request**:
```typescript
const extension = await trpc.licenses.requestExtension.mutate({
  licenseId: "lic_def456",
  extensionDays: 15,
  justification: "Campaign performing well, need extra time"
});
```

**Response**:
```json
{
  "success": true,
  "extensionId": "ext_jkl012",
  "approvalRequired": false,
  "additionalFeeCents": 20548,
  "newEndDate": "2025-11-16T00:00:00.000Z"
}
```

---

### Example 5: Check Renewal Eligibility

**Request**:
```typescript
const eligibility = await trpc.licenses.checkRenewalEligibility.query({
  licenseId: "lic_def456"
});
```

**Response (Eligible)**:
```json
{
  "eligible": true,
  "reasons": [
    "License is active and within renewal window (90 days before expiry)",
    "No existing renewal found",
    "No conflicts detected for renewal period"
  ],
  "suggestedTerms": {
    "durationDays": 365,
    "feeCents": 525000,
    "revShareBps": 500,
    "startDate": "2025-11-02T00:00:00.000Z",
    "endDate": "2026-11-02T00:00:00.000Z",
    "adjustments": {
      "feeAdjustmentPercent": 5,
      "revShareAdjustmentBps": 0,
      "loyaltyDiscount": -2.5,
      "performanceBonus": 0
    }
  }
}
```

**Response (Ineligible)**:
```json
{
  "eligible": false,
  "reasons": [
    "License has already been renewed",
    "License is not within renewal window (must be within 90 days of expiry)"
  ]
}
```

---

## TypeScript Type Definitions

Copy these into your frontend project:

```typescript
// ============================================
// ENUMS
// ============================================

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

export enum LicenseType {
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  EXCLUSIVE_TERRITORY = 'EXCLUSIVE_TERRITORY'
}

export enum BillingFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY'
}

export enum LicenseAmendmentStatus {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum LicenseAmendmentType {
  FINANCIAL = 'FINANCIAL',
  SCOPE = 'SCOPE',
  DATES = 'DATES',
  OTHER = 'OTHER'
}

export enum ExtensionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

// ============================================
// CORE TYPES
// ============================================

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
    territories: string[]; // ISO country codes or ["GLOBAL"]
  };
  exclusivity?: {
    category?: string;     // e.g., "Fashion", "Beauty"
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number;  // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string;       // e.g., "Photo by @{creatorHandle}"
  };
}

export interface CreateLicenseInput {
  ipAssetId: string;
  brandId: string;
  projectId?: string;
  licenseType: LicenseType;
  startDate: string;
  endDate: string;
  feeCents: number;
  revShareBps: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateLicenseInput {
  status?: LicenseStatus;
  endDate?: string;
  feeCents?: number;
  revShareBps?: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope?: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

export interface LicenseFilters {
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;
  creatorId?: string;
  page?: number;
  pageSize?: number;
}

export interface License {
  id: string;
  status: LicenseStatus;
  licenseType: LicenseType;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  startDate: string;
  endDate: string;
  signedAt: string | null;
  feeCents: number;
  feeDollars: number;
  revShareBps: number;
  revSharePercent: number;
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  scope: LicenseScope;
  autoRenew: boolean;
  amendmentCount: number;
  extensionCount: number;
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  // Optional expanded relations
  ipAsset?: IpAssetSummary;
  brand?: BrandSummary;
  project?: ProjectSummary;
  parentLicense?: License;
  renewals?: License[];
  amendments?: Amendment[];
  extensions?: Extension[];
  statusHistory?: StatusHistoryEntry[];
}

export interface PaginatedLicenseResponse {
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

// ============================================
// AMENDMENT TYPES
// ============================================

export interface ProposeAmendmentInput {
  licenseId: string;
  amendmentType: LicenseAmendmentType;
  justification: string;
  changes: Array<{
    field: string;
    currentValue: any;
    proposedValue: any;
  }>;
  approvalDeadlineDays?: number;
}

export interface AmendmentApprovalInput {
  amendmentId: string;
  action: 'approve' | 'reject';
  comments?: string;
}

export interface Amendment {
  id: string;
  amendmentNumber: number;
  licenseId: string;
  status: LicenseAmendmentStatus;
  amendmentType: LicenseAmendmentType;
  justification: string;
  fieldsChanged: string[];
  beforeValues: Record<string, any>;
  afterValues: Record<string, any>;
  approvalDeadline: string | null;
  rejectionReason: string | null;
  proposedAt: string;
  proposedBy: string;
  proposedByRole: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvals: Array<{
    approverId: string;
    approverRole: string;
    status: ApprovalStatus;
    approvedAt: string | null;
    rejectedAt: string | null;
    comments: string | null;
  }>;
}

// ============================================
// EXTENSION TYPES
// ============================================

export interface ExtensionRequestInput {
  licenseId: string;
  extensionDays: number;
  justification: string;
}

export interface ExtensionApprovalInput {
  extensionId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
}

export interface Extension {
  id: string;
  licenseId: string;
  status: ExtensionStatus;
  originalEndDate: string;
  newEndDate: string;
  extensionDays: number;
  additionalFeeCents: number;
  justification: string;
  approvalRequired: boolean;
  requestedAt: string;
  requestedBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

// ============================================
// RENEWAL TYPES
// ============================================

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

export interface AcceptRenewalOfferInput {
  licenseId: string;
  offerId: string;
}

// ============================================
// CONFLICT TYPES
// ============================================

export interface ConflictCheckInput {
  ipAssetId: string;
  startDate: string;
  endDate: string;
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string;
}

export interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: Partial<License>;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

// ============================================
// OTHER TYPES
// ============================================

export interface TerminateLicenseInput {
  licenseId: string;
  reason: string;
  effectiveDate?: string;
}

export interface StatusTransitionInput {
  licenseId: string;
  toStatus: LicenseStatus;
  reason?: string;
}

export interface StatusHistoryEntry {
  id: string;
  fromStatus: string;
  toStatus: string;
  transitionedAt: string;
  transitionedBy: string | null;
  reason: string | null;
  metadata: Record<string, any> | null;
}

export interface LicenseStats {
  totalActive: number;
  totalRevenueCents: number;
  expiringIn30Days: number;
  expiringIn60Days: number;
  expiringIn90Days: number;
  averageLicenseDurationDays: number;
  exclusiveLicenses: number;
  nonExclusiveLicenses: number;
  renewalRate: number;
}

// ============================================
// HELPER TYPES
// ============================================

interface IpAssetSummary {
  id: string;
  title: string;
  type: string;
  thumbnailUrl: string | null;
  ownerships?: Array<{
    creator: {
      id: string;
      stageName: string;
      user: { name: string; email: string; }
    }
  }>;
}

interface BrandSummary {
  id: string;
  companyName: string;
  logo: string | null;
  user: { name: string; email: string; }
}

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
}
```

---

**Continue to Part 2** for Business Logic, Validation Rules, Error Handling, and Authorization details.
