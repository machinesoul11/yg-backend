# License Management - Frontend Integration Guide (Part 2: Advanced Features & Types)

**Classification:** ⚡ HYBRID

---

## Table of Contents

1. [Advanced Endpoints](#advanced-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Request/Response Examples](#requestresponse-examples)
4. [Error Handling](#error-handling)

---

## Advanced Endpoints

### 13. Check Renewal Eligibility (`licenses.checkRenewalEligibility`)

**Type:** Query  
**Auth:** Required (BRAND, CREATOR, ADMIN)  
**Rate Limit:** None

**Purpose:** Determine if a license is eligible for renewal and get suggested terms.

**Input Schema:**
```typescript
{
  licenseId: string;
}
```

**Response Schema:**
```typescript
{
  data: {
    eligible: boolean;
    reasons: string[];  // Blocking issues or eligibility factors
    suggestedTerms?: {
      durationDays: number;
      feeCents: number;
      revShareBps: number;
      startDate: string;  // ISO 8601
      endDate: string;    // ISO 8601
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

**Eligibility Criteria:**
- License must be `ACTIVE` or recently `EXPIRED` (within grace period)
- No active disputes or conflicts
- Payment history in good standing
- Not previously terminated

**Suggested Terms Calculation:**
- **Loyalty Discount:** -5% for each previous renewal
- **Performance Bonus:** +10% for high-performing licenses
- **Market Rate:** Adjusted based on similar active licenses
- **Usage-Based:** Adjusted if usage metrics available

**Example Blocking Reasons:**
```typescript
[
  "License is not in renewable status (TERMINATED)",
  "Outstanding payment dispute",
  "License terminated by brand"
]
```

---

### 14. Generate Renewal Offer (`licenses.generateRenewalOffer`)

**Type:** Mutation  
**Auth:** Required (BRAND, ADMIN)  
**Rate Limit:** None

**Purpose:** Create a formal renewal offer with pricing strategy.

**Input Schema:**
```typescript
{
  licenseId: string;
  pricingStrategy?: 'FLAT_RENEWAL' | 'USAGE_BASED' | 'MARKET_RATE' | 'PERFORMANCE_BASED' | 'NEGOTIATED' | 'AUTOMATIC';
  customAdjustmentPercent?: number;  // Manual adjustment
}
```

**Response Schema:**
```typescript
{
  data: {
    offerId: string;  // Unique offer ID for acceptance
    pricing: {
      originalFeeCents: number;
      newFeeCents: number;
      adjustmentPercent: number;
      originalRevShareBps: number;
      newRevShareBps: number;
      revShareAdjustmentBps: number;
      strategy: string;
      expiresAt: string;  // Offer expiration (7 days)
    };
  };
}
```

**Pricing Strategies:**

| Strategy | Description | Adjustment Logic |
|----------|-------------|------------------|
| `FLAT_RENEWAL` | No changes | 0% adjustment |
| `USAGE_BASED` | Based on actual usage | -20% to +50% |
| `MARKET_RATE` | Comparable licenses | Industry standard |
| `PERFORMANCE_BASED` | ROI-driven | -10% to +30% |
| `NEGOTIATED` | Custom terms | Uses `customAdjustmentPercent` |
| `AUTOMATIC` | AI-recommended | Combines multiple factors |

**Business Rules:**
- Offer expires in 7 days
- Only one active offer per license
- Brand can only create offers for their own licenses
- Offer ID required for acceptance

---

### 15. Accept Renewal Offer (`licenses.acceptRenewalOffer`)

**Type:** Mutation  
**Auth:** Required (BRAND owner only)  
**Rate Limit:** None

**Purpose:** Brand accepts a renewal offer and creates new license.

**Input Schema:**
```typescript
{
  licenseId: string;
  offerId: string;  // From generateRenewalOffer
}
```

**Response Schema:**
```typescript
{
  data: LicenseResponse;  // New renewal license
}
```

**Business Logic:**
- Validates offer hasn't expired
- Validates offer ID matches license
- Creates new license with `parentLicenseId` linking
- Sets status to `PENDING_APPROVAL` (creator must approve)
- Sends renewal notification to creator
- Marks offer as accepted

**Errors:**
| Code | HTTP Status | Cause |
|------|-------------|-------|
| `BAD_REQUEST` | 400 | Offer expired or invalid |
| `FORBIDDEN` | 403 | Not the license brand owner |
| `NOT_FOUND` | 404 | License or offer not found |

---

### 16. Get Renewal Analytics (`licenses.getRenewalAnalytics`)

**Type:** Query  
**Auth:** Required (ADMIN only)  
**Rate Limit:** None

**Purpose:** Comprehensive renewal performance metrics for admins.

**Input Schema:**
```typescript
{
  startDate?: string;  // ISO 8601, defaults to 90 days ago
  endDate?: string;    // ISO 8601, defaults to now
}
```

**Response Schema:**
```typescript
{
  data: {
    timeRange: {
      startDate: string;
      endDate: string;
      durationDays: number;
    };
    renewalMetrics: {
      totalRenewalsCreated: number;
      totalRenewalsAccepted: number;
      totalRenewalsRejected: number;
      renewalRate: number;           // Percentage
      averageRenewalTimeDays: number;
      totalRenewalRevenueCents: number;
    };
    pricingAnalysis: {
      averageAdjustmentPercent: number;
      medianAdjustmentPercent: number;
      pricingStrategyDistribution: {
        FLAT_RENEWAL: number;
        USAGE_BASED: number;
        MARKET_RATE: number;
        PERFORMANCE_BASED: number;
        NEGOTIATED: number;
        AUTOMATIC: number;
      };
    };
    conversionFunnel: {
      totalEligible: number;
      offersGenerated: number;
      offersAccepted: number;
      offersRejected: number;
      offersExpired: number;
      conversionRate: number;  // offersAccepted / offersGenerated
    };
  };
}
```

**Use Cases:**
- Admin dashboard KPIs
- Pricing strategy optimization
- Revenue forecasting

---

### 17. Get Renewal Pipeline (`licenses.getRenewalPipeline`)

**Type:** Query  
**Auth:** Required (ADMIN only)  
**Rate Limit:** None

**Purpose:** Current snapshot of renewal pipeline for proactive management.

**Input:** None

**Response Schema:**
```typescript
{
  data: {
    expiring30Days: Array<{
      licenseId: string;
      brandId: string;
      brandName: string;
      ipAssetId: string;
      assetTitle: string;
      expirationDate: string;
      feeCents: number;
      hasRenewalOffer: boolean;
      renewalEligible: boolean;
    }>;
    expiring60Days: Array<...>;  // Same structure
    expiring90Days: Array<...>;  // Same structure
    activeOffers: Array<{
      offerId: string;
      licenseId: string;
      brandName: string;
      assetTitle: string;
      createdAt: string;
      expiresAt: string;
      pricing: {...};
    }>;
    recentRenewals: Array<{
      licenseId: string;
      renewedAt: string;
      feeCents: number;
      adjustmentPercent: number;
    }>;
  };
}
```

**Use Cases:**
- Admin renewal management
- Proactive outreach to brands
- Revenue pipeline forecasting

---

### 18. Get Brand Renewal Performance (`licenses.getBrandRenewalPerformance`)

**Type:** Query  
**Auth:** Required (BRAND owner, ADMIN)  
**Rate Limit:** None

**Purpose:** Analyze renewal performance for a specific brand.

**Input Schema:**
```typescript
{
  brandId: string;
}
```

**Response Schema:**
```typescript
{
  data: {
    brandId: string;
    totalLicenses: number;
    activeLicenses: number;
    renewedLicenses: number;
    renewalRate: number;  // Percentage
    averageRenewalDays: number;
    renewalHistory: Array<{
      year: number;
      renewals: number;
      totalRevenueCents: number;
    }>;
    upcomingRenewals: Array<{
      licenseId: string;
      assetTitle: string;
      expirationDate: string;
      feeCents: number;
    }>;
  };
}
```

**Access Control:**
- Brands can only view their own performance
- Admins can view any brand

---

### 19. Get License Performance Metrics (`licenses.getPerformanceMetrics`)

**Type:** Query  
**Auth:** Required  
**Rate Limit:** None

**Purpose:** Track ROI, utilization, and performance of a license.

**Input Schema:**
```typescript
{
  licenseId: string;
}
```

**Response Schema:**
```typescript
{
  data: {
    licenseId: string;
    financialMetrics: {
      totalCostCents: number;        // Fee + royalties
      totalRevenueCents: number;     // Brand's revenue from license
      roi: number;                   // Return on investment percentage
      costPerDay: number;
    };
    utilizationMetrics: {
      daysActive: number;
      daysRemaining: number;
      utilizationPercent: number;    // daysActive / totalDays
      lastUsedAt: string | null;
    };
    performanceMetrics: {
      approvalTimeDays: number;      // Time from creation to approval
      signatureTimeDays: number;     // Time to full execution
      totalUsageEvents: number;
    };
  };
}
```

**Access Control:**
- Brand owners and creators of the asset can view
- Admins can view all

---

### 20. Admin List All Licenses (`licenses.adminList`)

**Type:** Query  
**Auth:** Required (ADMIN only)  
**Rate Limit:** None

**Purpose:** Admin-only endpoint to view all licenses with full details.

**Input Schema:**
```typescript
// Same as licenses.list but without row-level filtering
{
  status?: string;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: string;
  expiringBefore?: string;
  creatorId?: string;
  page?: number;
  pageSize?: number;
}
```

**Response Schema:**
```typescript
// Same as licenses.list
{
  data: LicenseResponse[];
  meta: {
    pagination: {...};
  };
}
```

**Key Difference:**
- No automatic row-level filtering
- Can filter by any `creatorId` or `brandId`
- Returns all licenses in system

---

## TypeScript Type Definitions

### Core Types

Copy these type definitions to your frontend codebase:

```typescript
/**
 * License Type Enum
 */
export type LicenseType = 
  | 'EXCLUSIVE'           // Only this brand can use the asset
  | 'NON_EXCLUSIVE'       // Multiple brands can license
  | 'EXCLUSIVE_TERRITORY'; // Exclusive within geographic territories

/**
 * License Status Enum
 */
export type LicenseStatus = 
  | 'DRAFT'              // Being created, not submitted
  | 'PENDING_APPROVAL'   // Awaiting creator approval
  | 'ACTIVE'             // Approved and executable
  | 'EXPIRED'            // End date passed
  | 'TERMINATED'         // Ended early
  | 'SUSPENDED';         // Temporarily paused

/**
 * Billing Frequency Enum
 */
export type BillingFrequency = 
  | 'ONE_TIME'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

/**
 * License Scope Structure
 * Defines what the license allows
 */
export interface LicenseScope {
  media: {
    digital: boolean;    // Digital channels
    print: boolean;      // Print media
    broadcast: boolean;  // TV/Radio
    ooh: boolean;        // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;     // Social media posts
    website: boolean;    // Website usage
    email: boolean;      // Email campaigns
    paid_ads: boolean;   // Paid advertising
    packaging: boolean;  // Product packaging
  };
  geographic?: {
    territories: string[];  // ISO country codes or "GLOBAL"
  };
  exclusivity?: {
    category?: string;      // e.g., "Fashion", "Beauty"
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number;   // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string;        // e.g., "Photo by @creator"
  };
}

/**
 * License Response
 * What the API returns
 */
export interface LicenseResponse {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: LicenseType;
  status: LicenseStatus;
  startDate: string;       // ISO 8601
  endDate: string;         // ISO 8601
  signedAt: string | null; // ISO 8601
  feeCents: number;
  feeDollars: number;      // Computed: feeCents / 100
  revShareBps: number;     // 0-10000 (basis points)
  revSharePercent: number; // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  scope: LicenseScope;
  autoRenew: boolean;
  renewalNotifiedAt: string | null;
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  // Optional expanded relations
  ipAsset?: IpAssetSummary;
  brand?: BrandSummary;
  project?: ProjectSummary;
  parentLicense?: LicenseResponse;
  renewals?: LicenseResponse[];
}

/**
 * Create License Input
 */
export interface CreateLicenseInput {
  ipAssetId: string;
  brandId: string;
  projectId?: string;
  licenseType: LicenseType;
  startDate: string;  // ISO 8601
  endDate: string;    // ISO 8601
  feeCents: number;
  revShareBps: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Update License Input
 */
export interface UpdateLicenseInput {
  id: string;
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

/**
 * License Filters for Queries
 */
export interface LicenseFilters {
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;  // ISO 8601
  creatorId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Conflict Check Input
 */
export interface ConflictCheckInput {
  ipAssetId: string;
  startDate: string;
  endDate: string;
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string;
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
  renewalRate: number;  // Percentage
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

/**
 * Paginated Response
 */
export interface PaginatedLicenseResponse {
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

### Zod Schemas for Validation

If your frontend uses Zod for validation:

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

## Request/Response Examples

### Example 1: Create Exclusive License

**cURL:**
```bash
# Note: tRPC uses POST to /api/trpc/licenses.create
# This is a conceptual example - use tRPC client in practice

curl -X POST https://ops.yesgoddess.agency/api/trpc/licenses.create \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "ipAssetId": "clq1a2b3c4d5e6f7g8h9i",
    "brandId": "clq9h8g7f6e5d4c3b2a1",
    "licenseType": "EXCLUSIVE",
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "feeCents": 500000,
    "revShareBps": 1000,
    "billingFrequency": "ONE_TIME",
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
        "email": true,
        "paid_ads": true,
        "packaging": false
      },
      "geographic": {
        "territories": ["US", "CA", "GB"]
      },
      "attribution": {
        "required": true,
        "format": "Photo by @creatorhandle"
      }
    },
    "autoRenew": false
  }'
```

**Response (Success):**
```json
{
  "data": {
    "id": "clqabcdefghijklmnopqr",
    "ipAssetId": "clq1a2b3c4d5e6f7g8h9i",
    "brandId": "clq9h8g7f6e5d4c3b2a1",
    "projectId": null,
    "licenseType": "EXCLUSIVE",
    "status": "PENDING_APPROVAL",
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.000Z",
    "signedAt": null,
    "feeCents": 500000,
    "feeDollars": 5000,
    "revShareBps": 1000,
    "revSharePercent": 10,
    "paymentTerms": null,
    "billingFrequency": "ONE_TIME",
    "scope": {
      "media": { "digital": true, "print": false, "broadcast": false, "ooh": false },
      "placement": { "social": true, "website": true, "email": true, "paid_ads": true, "packaging": false },
      "geographic": { "territories": ["US", "CA", "GB"] },
      "attribution": { "required": true, "format": "Photo by @creatorhandle" }
    },
    "autoRenew": false,
    "renewalNotifiedAt": null,
    "parentLicenseId": null,
    "signatureProof": null,
    "metadata": null,
    "createdAt": "2025-10-14T12:00:00.000Z",
    "updatedAt": "2025-10-14T12:00:00.000Z"
  }
}
```

**Response (Conflict Error):**
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "License conflicts with existing agreements",
    "cause": {
      "hasConflicts": true,
      "conflicts": [
        {
          "licenseId": "clqexistinglicense123",
          "reason": "EXCLUSIVE_OVERLAP",
          "details": "An exclusive license already exists for this asset from 2025-01-01 to 2025-12-31",
          "conflictingLicense": {
            "id": "clqexistinglicense123",
            "brandId": "clqanotherbrand456",
            "status": "ACTIVE",
            "startDate": "2025-01-01T00:00:00.000Z",
            "endDate": "2025-12-31T23:59:59.000Z",
            "licenseType": "EXCLUSIVE"
          }
        }
      ]
    }
  }
}
```

---

### Example 2: List Active Licenses

**React Query with tRPC:**
```typescript
import { trpc } from '@/lib/trpc';

function BrandLicenses() {
  const { data, isLoading, error } = trpc.licenses.list.useQuery({
    status: 'ACTIVE',
    page: 1,
    pageSize: 20,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <h2>Active Licenses ({data.meta.pagination.total})</h2>
      {data.data.map((license) => (
        <LicenseCard key={license.id} license={license} />
      ))}
      <Pagination {...data.meta.pagination} />
    </div>
  );
}
```

**Response:**
```json
{
  "data": [
    {
      "id": "clqlicense1",
      "ipAssetId": "clqasset1",
      "brandId": "clqbrand1",
      "status": "ACTIVE",
      "licenseType": "EXCLUSIVE",
      "startDate": "2025-01-01T00:00:00.000Z",
      "endDate": "2025-12-31T23:59:59.000Z",
      "feeCents": 500000,
      "feeDollars": 5000,
      "revShareBps": 1000,
      "revSharePercent": 10,
      "scope": {...},
      "createdAt": "2024-12-01T00:00:00.000Z",
      "updatedAt": "2024-12-15T00:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

### Example 3: Sign License

**React Query Mutation:**
```typescript
function SignLicenseButton({ licenseId }: { licenseId: string }) {
  const utils = trpc.useContext();
  
  const signMutation = trpc.licenses.sign.useMutation({
    onSuccess: (result) => {
      toast.success(result.meta.message);
      utils.licenses.getById.invalidate({ id: licenseId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Button 
      onClick={() => signMutation.mutate({ id: licenseId })}
      disabled={signMutation.isLoading}
    >
      {signMutation.isLoading ? 'Signing...' : 'Sign License'}
    </Button>
  );
}
```

**Response (First Signature):**
```json
{
  "data": {
    "id": "clqlicense1",
    "status": "PENDING_APPROVAL",
    "signedAt": null,
    "signatureProof": "sha256:abc123...",
    ...
  },
  "meta": {
    "signatureProof": "sha256:abc123...",
    "allPartiesSigned": false,
    "executedAt": null,
    "message": "License signed by brand. Awaiting creator signature."
  }
}
```

**Response (Both Signed):**
```json
{
  "data": {
    "id": "clqlicense1",
    "status": "ACTIVE",
    "signedAt": "2025-10-14T14:30:00.000Z",
    "signatureProof": "sha256:def456...",
    ...
  },
  "meta": {
    "signatureProof": "sha256:def456...",
    "allPartiesSigned": true,
    "executedAt": "2025-10-14T14:30:00.000Z",
    "message": "License fully executed. All parties have signed."
  }
}
```

---

### Example 4: Check Conflicts Before Creating

**Frontend Implementation:**
```typescript
function CreateLicenseForm() {
  const [formData, setFormData] = useState<CreateLicenseInput>({...});
  
  // Real-time conflict checking
  const { data: conflicts } = trpc.licenses.checkConflicts.useQuery(
    {
      ipAssetId: formData.ipAssetId,
      startDate: formData.startDate,
      endDate: formData.endDate,
      licenseType: formData.licenseType,
      scope: formData.scope,
    },
    {
      enabled: Boolean(formData.ipAssetId && formData.startDate && formData.endDate),
    }
  );

  return (
    <form>
      {/* Form fields */}
      
      {conflicts?.hasConflicts && (
        <Alert variant="warning">
          <AlertTitle>Conflicts Detected</AlertTitle>
          {conflicts.conflicts.map((conflict, i) => (
            <div key={i}>
              <strong>{conflict.reason}:</strong> {conflict.details}
            </div>
          ))}
        </Alert>
      )}
      
      <Button 
        type="submit" 
        disabled={conflicts?.hasConflicts}
      >
        Create License
      </Button>
    </form>
  );
}
```

---

## Error Handling

### Error Code Reference

| Code | HTTP Status | Description | When to Show | User-Friendly Message |
|------|-------------|-------------|--------------|----------------------|
| `UNAUTHORIZED` | 401 | No valid session | Always | "Please sign in to continue" |
| `FORBIDDEN` | 403 | Permission denied | Always | "You don't have permission to perform this action" |
| `NOT_FOUND` | 404 | Resource doesn't exist | Always | "License not found" |
| `BAD_REQUEST` | 400 | Invalid input | Always | Display specific validation error |
| `CONFLICT` | 409 | License conflicts | Always | "This license conflicts with existing agreements. Please adjust dates or scope." |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Log, show generic | "Something went wrong. Please try again." |

### Field-Level Validation Errors

```typescript
// Example validation error response
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": {
      "fieldErrors": {
        "endDate": ["End date must be after start date"],
        "feeCents": ["Fee must be a positive number"],
        "revShareBps": ["Revenue share must be between 0 and 10000"]
      }
    }
  }
}
```

### Error Handling Best Practices

```typescript
// Centralized error handler
function handleLicenseError(error: TRPCClientError) {
  switch (error.data?.code) {
    case 'CONFLICT':
      return {
        title: 'License Conflict',
        message: 'This license conflicts with existing agreements.',
        action: 'View Conflicts',
        severity: 'warning',
      };
    
    case 'FORBIDDEN':
      return {
        title: 'Permission Denied',
        message: error.message,
        action: null,
        severity: 'error',
      };
    
    case 'BAD_REQUEST':
      return {
        title: 'Invalid Input',
        message: error.message,
        action: 'Fix Errors',
        severity: 'warning',
      };
    
    case 'INTERNAL_SERVER_ERROR':
      // Log to error tracking service
      logError(error);
      return {
        title: 'Server Error',
        message: 'Something went wrong. Our team has been notified.',
        action: 'Try Again',
        severity: 'error',
      };
    
    default:
      return {
        title: 'Error',
        message: error.message || 'An unexpected error occurred',
        action: null,
        severity: 'error',
      };
  }
}
```

---

**Part 2 Complete!**

Continue to **Part 3** for:
- Business logic and validation rules
- Frontend implementation patterns
- React Query integration examples
- Real-time updates and polling
- UX considerations and best practices
- Complete frontend implementation checklist
