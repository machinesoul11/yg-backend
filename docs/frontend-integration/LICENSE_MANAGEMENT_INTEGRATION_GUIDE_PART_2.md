# License Management - Frontend Integration Guide (Part 2 of 3)
**Classification: ⚡ HYBRID**

---

## Table of Contents - Part 2
1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Error Handling](#error-handling)
3. [Authorization & Permissions](#authorization--permissions)
4. [Status Machine & Transitions](#status-machine--transitions)

---

## Business Logic & Validation Rules

### Field Validation Requirements

#### License Creation
| Field | Validation | Notes |
|-------|-----------|-------|
| `ipAssetId` | Must exist and be owned by creator | Foreign key validation |
| `brandId` | Must exist and match authenticated user's brand | Authorization check |
| `startDate` | Cannot be in the past | Date validation |
| `endDate` | Must be after `startDate` | Date validation |
| `feeCents` | Must be ≥ 0 | Financial validation |
| `revShareBps` | Must be 0-10000 (0-100%) | Basis points: 100 bps = 1% |
| `licenseType` | Must be valid enum value | EXCLUSIVE, NON_EXCLUSIVE, EXCLUSIVE_TERRITORY |
| `scope.media` | At least one media type must be true | Business rule |
| `scope.placement` | At least one placement must be true | Business rule |
| `scope.geographic.territories` | Valid ISO country codes or "GLOBAL" | Country validation |

#### License Updates
| Status | Allowed Updates | Restrictions |
|--------|----------------|--------------|
| `DRAFT` | All fields | Only brand can update |
| `PENDING_APPROVAL` | `metadata`, `autoRenew` only | Limited changes |
| `ACTIVE` | Must use amendments | No direct updates to critical fields |
| `EXPIRED` | None | Read-only |
| `TERMINATED` | None | Read-only |

**Critical fields requiring amendments on ACTIVE licenses:**
- `feeCents` (if change > 20%)
- `revShareBps` (if change > 20%)
- `scope` (any changes)
- `endDate` (use extensions instead)

#### Amendment Validation
- **Justification**: Minimum 10 characters
- **Changes array**: Cannot be empty
- **Approval deadline**: 1-90 days (default: 14)
- **Amendment type**: Must match field changes
  - `FINANCIAL`: feeCents, revShareBps, paymentTerms, billingFrequency
  - `SCOPE`: scope object changes
  - `DATES`: startDate, endDate
  - `OTHER`: metadata, custom fields

**Multi-party approval required for:**
- All amendments on `ACTIVE` licenses
- All affected parties must approve (brand + all creators with ownership)
- Approval deadline enforced (auto-reject after deadline)

#### Extension Validation
- **Extension days**: 1-365 days
- **Justification**: Minimum 10 characters
- **License status**: Must be `ACTIVE` or `EXPIRING_SOON`
- **Max extensions**: No hard limit, but use renewals for >365 days
- **Auto-approval threshold**: <30 days
- **Additional fee calculation**: `(originalFeeCents / originalDurationDays) × extensionDays`

**Conflict checking before approval:**
- Checks if new end date conflicts with other licenses
- Validates exclusive license rules
- Verifies territory restrictions

#### Renewal Validation
- **Eligibility window**: 90 days before expiration
- **License status**: `ACTIVE` or `EXPIRED` only
- **Already renewed**: Cannot renew if another license has `parentLicenseId` pointing to this license
- **Conflict detection**: New renewal period checked for conflicts
- **Offer expiration**: 30 days from generation
- **Auto-renewal trigger**: 60 days before expiration (if `autoRenew: true`)

**Renewal pricing adjustments:**
```typescript
// Base adjustment (default: 5% increase)
const baseAdjustment = 5;

// Loyalty discount (if license >1 year old)
const loyaltyDiscount = licenseAgeYears > 1 ? -2.5 : 0;

// Early renewal bonus (if renewed >45 days before expiry)
const earlyRenewalBonus = daysBeforeExpiry > 45 ? -1.0 : 0;

// Performance bonus (based on usage metrics - future feature)
const performanceBonus = 0; // TBD based on analytics

const totalAdjustment = baseAdjustment + loyaltyDiscount + earlyRenewalBonus + performanceBonus;
const newFeeCents = Math.round(originalFeeCents * (1 + totalAdjustment / 100));
```

### Conflict Detection Rules

#### 1. Exclusive License Overlap
```typescript
// Two EXCLUSIVE licenses cannot overlap for the same IP asset
if (existingLicense.licenseType === 'EXCLUSIVE' && 
    newLicense.licenseType === 'EXCLUSIVE' &&
    dateRangesOverlap(existing, new)) {
  return conflict('EXCLUSIVE_OVERLAP');
}
```

#### 2. Territory Overlap
```typescript
// EXCLUSIVE_TERRITORY licenses cannot overlap in same territories
if (existingLicense.licenseType === 'EXCLUSIVE_TERRITORY' &&
    newLicense.licenseType === 'EXCLUSIVE_TERRITORY' &&
    dateRangesOverlap(existing, new) &&
    territoriesOverlap(existing.scope.geographic, new.scope.geographic)) {
  return conflict('TERRITORY_OVERLAP');
}
```

#### 3. Competitor Blocked
```typescript
// Cannot license to blocked competitors
if (existingLicense.scope.exclusivity?.competitors?.includes(newBrandId)) {
  return conflict('COMPETITOR_BLOCKED');
}
```

#### 4. Date Overlap Check
```typescript
function dateRangesOverlap(range1: DateRange, range2: DateRange): boolean {
  return range1.startDate <= range2.endDate && range2.startDate <= range1.endDate;
}
```

### Calculated/Derived Values

The backend automatically computes these values:

```typescript
interface ComputedFields {
  feeDollars: number;         // feeCents / 100
  revSharePercent: number;    // revShareBps / 100
  amendmentCount: number;     // Count of amendments
  extensionCount: number;     // Count of approved extensions
}

// Days until expiration (computed on read)
const daysUntilExpiry = Math.floor(
  (new Date(license.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);

// Status automatically set to EXPIRING_SOON if daysUntilExpiry <= 30
```

### Form Validation Examples

**React Hook Form + Zod Schema**:
```typescript
import { z } from 'zod';

const licenseFormSchema = z.object({
  ipAssetId: z.string().cuid(),
  brandId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']),
  startDate: z.string().datetime().refine(
    (date) => new Date(date) >= new Date(),
    { message: 'Start date cannot be in the past' }
  ),
  endDate: z.string().datetime(),
  feeCents: z.number().int().min(0, 'Fee cannot be negative'),
  revShareBps: z.number().int().min(0).max(10000, 'Revenue share must be between 0-100%'),
  paymentTerms: z.string().optional(),
  billingFrequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  scope: z.object({
    media: z.object({
      digital: z.boolean(),
      print: z.boolean(),
      broadcast: z.boolean(),
      ooh: z.boolean()
    }).refine(
      (media) => Object.values(media).some(v => v === true),
      { message: 'At least one media type must be selected' }
    ),
    placement: z.object({
      social: z.boolean(),
      website: z.boolean(),
      email: z.boolean(),
      paid_ads: z.boolean(),
      packaging: z.boolean()
    }).refine(
      (placement) => Object.values(placement).some(v => v === true),
      { message: 'At least one placement must be selected' }
    ),
    geographic: z.object({
      territories: z.array(z.string()).min(1, 'At least one territory required')
    }).optional(),
    exclusivity: z.object({
      category: z.string().optional(),
      competitors: z.array(z.string()).optional()
    }).optional(),
    cutdowns: z.object({
      allowEdits: z.boolean(),
      maxDuration: z.number().int().positive().optional(),
      aspectRatios: z.array(z.string()).optional()
    }).optional(),
    attribution: z.object({
      required: z.boolean(),
      format: z.string().optional()
    }).optional()
  }),
  autoRenew: z.boolean().optional()
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'End date must be after start date',
    path: ['endDate']
  }
);

type LicenseFormData = z.infer<typeof licenseFormSchema>;
```

**Amendment validation**:
```typescript
const amendmentSchema = z.object({
  licenseId: z.string().cuid(),
  amendmentType: z.enum(['FINANCIAL', 'SCOPE', 'DATES', 'OTHER']),
  justification: z.string().min(10, 'Justification must be at least 10 characters'),
  changes: z.array(
    z.object({
      field: z.string(),
      currentValue: z.any(),
      proposedValue: z.any()
    })
  ).min(1, 'At least one change required'),
  approvalDeadlineDays: z.number().int().min(1).max(90).optional()
});
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Usage | When to Show |
|-------------|-------|--------------|
| `200` | Success | Always display success message |
| `400` | Bad Request | Show specific field errors |
| `401` | Unauthorized | Redirect to login |
| `403` | Forbidden | Show permission error |
| `404` | Not Found | Show "resource not found" message |
| `409` | Conflict | Show conflict details (e.g., license conflicts) |
| `422` | Validation Error | Show field-level validation errors |
| `429` | Rate Limited | Show "too many requests" with retry info |
| `500` | Server Error | Show generic error, log to monitoring |

### Error Response Format

All errors follow this structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable error message
    details?: any;          // Additional error context
    field?: string;         // Specific field that caused error (validation)
    statusCode: number;     // HTTP status code
  }
}
```

### Error Codes Reference

#### License Operations
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `LICENSE_NOT_FOUND` | 404 | License not found | Verify license ID, refresh data |
| `LICENSE_CONFLICT` | 409 | License conflict detected | View conflict details, adjust dates/scope |
| `LICENSE_ALREADY_APPROVED` | 400 | License already approved | Refresh license data |
| `LICENSE_NOT_PENDING` | 400 | License must be pending to approve | Check license status |
| `LICENSE_OWNERSHIP_REQUIRED` | 403 | Only asset owners can approve | Contact asset owner |
| `LICENSE_UPDATE_RESTRICTED` | 403 | Active licenses require amendments | Use amendment workflow |
| `LICENSE_TERMINATED` | 400 | Cannot modify terminated licenses | View license history only |
| `LICENSE_EXPIRED` | 400 | License has expired | Consider renewal |

#### Amendment Errors
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `AMENDMENT_NOT_FOUND` | 404 | Amendment not found | Verify amendment ID |
| `AMENDMENT_ALREADY_PROCESSED` | 400 | Amendment already approved/rejected | Refresh amendment data |
| `AMENDMENT_DEADLINE_PASSED` | 400 | Approval deadline has passed | Amendment auto-rejected |
| `AMENDMENT_INVALID_CHANGE` | 422 | Invalid field change | Review proposed changes |
| `AMENDMENT_REQUIRES_JUSTIFICATION` | 422 | Justification too short | Provide detailed justification (min 10 chars) |

#### Extension Errors
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `EXTENSION_NOT_FOUND` | 404 | Extension request not found | Verify extension ID |
| `EXTENSION_EXCEEDS_LIMIT` | 422 | Extension exceeds 365 days | Use renewal workflow instead |
| `EXTENSION_CONFLICT` | 409 | Extension would conflict with other licenses | Adjust extension period |
| `EXTENSION_LICENSE_TERMINATED` | 400 | Cannot extend terminated license | Create new license |
| `EXTENSION_ALREADY_PROCESSED` | 400 | Extension already approved/rejected | Refresh extension data |

#### Renewal Errors
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `RENEWAL_NOT_ELIGIBLE` | 400 | License not eligible for renewal | Check eligibility reasons |
| `RENEWAL_ALREADY_EXISTS` | 409 | License already renewed | View existing renewal |
| `RENEWAL_OFFER_EXPIRED` | 400 | Renewal offer has expired | Generate new offer |
| `RENEWAL_OFFER_NOT_FOUND` | 404 | Renewal offer not found | Generate renewal offer first |
| `RENEWAL_WINDOW_CLOSED` | 400 | Not within renewal window | Wait until 90 days before expiry |

#### Validation Errors
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `VALIDATION_ERROR` | 422 | Validation failed | Check field-level errors in `details` |
| `INVALID_DATE_RANGE` | 422 | End date must be after start date | Adjust dates |
| `INVALID_FEE` | 422 | Fee cannot be negative | Enter valid fee amount |
| `INVALID_REV_SHARE` | 422 | Revenue share must be 0-100% | Enter valid percentage (0-10000 bps) |
| `INVALID_SCOPE` | 422 | At least one media/placement required | Select at least one option |
| `INVALID_TERRITORY` | 422 | Invalid country code | Use valid ISO codes |

#### Permission Errors
| Code | HTTP Status | Message | User Action |
|------|-------------|---------|-------------|
| `PERMISSION_DENIED` | 403 | Insufficient permissions | Contact administrator |
| `BRAND_ONLY_ACTION` | 403 | Only brands can perform this action | Switch to brand account |
| `CREATOR_ONLY_ACTION` | 403 | Only creators can perform this action | Switch to creator account |
| `ADMIN_ONLY_ACTION` | 403 | Admin privileges required | Contact administrator |

### Error Handling Examples

**React Query Error Handling**:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

function useCreateLicense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateLicenseInput) => 
      trpc.licenses.create.mutate(data),
    
    onSuccess: (license) => {
      toast.success('License created successfully', {
        description: `License #${license.id} is now pending creator approval`
      });
      queryClient.invalidateQueries(['licenses']);
    },
    
    onError: (error: any) => {
      const errorCode = error.data?.code || error.code;
      
      switch (errorCode) {
        case 'LICENSE_CONFLICT':
          toast.error('License Conflict', {
            description: error.message,
            action: {
              label: 'View Conflicts',
              onClick: () => {/* Navigate to conflicts view */}
            }
          });
          break;
          
        case 'VALIDATION_ERROR':
          // Handle field-level validation errors
          const fieldErrors = error.data?.details?.fieldErrors || {};
          Object.entries(fieldErrors).forEach(([field, message]) => {
            toast.error(`${field}: ${message}`);
          });
          break;
          
        case 'PERMISSION_DENIED':
          toast.error('Permission Denied', {
            description: 'You do not have permission to create licenses for this brand'
          });
          break;
          
        default:
          toast.error('Failed to create license', {
            description: error.message || 'An unexpected error occurred'
          });
      }
    }
  });
}
```

**Displaying Conflict Details**:
```typescript
function ConflictAlert({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>License Conflicts Detected</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-2">
          {conflicts.map((conflict, idx) => (
            <li key={idx} className="text-sm">
              <strong>{conflict.reason.replace(/_/g, ' ')}</strong>
              <p className="text-muted-foreground">{conflict.details}</p>
              {conflict.conflictingLicense && (
                <Link 
                  href={`/licenses/${conflict.conflictingLicense.id}`}
                  className="text-blue-500 hover:underline"
                >
                  View conflicting license →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
```

### User-Friendly Error Messages

Map technical errors to user-friendly messages:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  LICENSE_NOT_FOUND: 'This license could not be found. It may have been deleted.',
  LICENSE_CONFLICT: 'This license conflicts with an existing agreement. Please review the dates and scope.',
  LICENSE_OWNERSHIP_REQUIRED: 'Only the IP asset owner can approve this license.',
  LICENSE_UPDATE_RESTRICTED: 'Active licenses cannot be directly modified. Please use the amendment process.',
  AMENDMENT_DEADLINE_PASSED: 'The approval deadline for this amendment has passed.',
  EXTENSION_EXCEEDS_LIMIT: 'Extensions longer than 1 year require a renewal instead.',
  RENEWAL_NOT_ELIGIBLE: 'This license is not eligible for renewal at this time.',
  VALIDATION_ERROR: 'Please correct the errors in the form and try again.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
};

function getErrorMessage(code: string, fallback: string): string {
  return ERROR_MESSAGES[code] || fallback;
}
```

---

## Authorization & Permissions

### Role-Based Access Control

#### User Roles
- **BRAND**: Can create licenses, request extensions, propose amendments
- **CREATOR**: Can approve licenses, approve amendments/extensions
- **ADMIN**: Full access to all operations
- **VIEWER**: Read-only access

### Permission Matrix

#### License Operations
| Operation | Brand | Creator | Admin | Notes |
|-----------|-------|---------|-------|-------|
| Create License | ✅ (own brand) | ❌ | ✅ | Brand must own the brandId |
| View License | ✅ (own) | ✅ (own assets) | ✅ | Role-based filtering |
| Update DRAFT | ✅ (own) | ❌ | ✅ | Brand who created only |
| Update ACTIVE | ❌ | ❌ | ✅ | Must use amendments |
| Approve License | ❌ | ✅ (owns asset) | ✅ | Creator ownership required |
| Terminate License | ✅ (own) | ✅ (owns asset) | ✅ | Both parties can terminate |
| Delete License | ✅ (DRAFT only) | ❌ | ✅ | Soft delete |

#### Amendment Operations
| Operation | Brand | Creator | Admin | Notes |
|-----------|-------|---------|-------|-------|
| Propose Amendment | ✅ (own) | ✅ (owns asset) | ✅ | Either party can propose |
| Approve Amendment | ✅ (if proposed by creator) | ✅ (if proposed by brand) | ✅ | Opposite party approves |
| View Amendments | ✅ (own) | ✅ (own assets) | ✅ | Related to their licenses |

#### Extension Operations
| Operation | Brand | Creator | Admin | Notes |
|-----------|-------|---------|-------|-------|
| Request Extension | ✅ (own) | ❌ | ✅ | Brand initiates |
| Approve Extension | ❌ | ✅ (owns asset) | ✅ | Creator approves |
| View Extensions | ✅ (own) | ✅ (own assets) | ✅ | Related to their licenses |

#### Renewal Operations
| Operation | Brand | Creator | Admin | Notes |
|-----------|-------|---------|-------|-------|
| Check Eligibility | ✅ (own) | ✅ (own assets) | ✅ | Public read |
| Generate Offer | ✅ (own) | ❌ | ✅ | Brand initiates |
| Accept Offer | ✅ (own) | ❌ | ✅ | Brand accepts |
| View Renewals | ✅ (own) | ✅ (own assets) | ✅ | Related to their licenses |

### Resource Ownership Rules

**License Ownership**:
- A license "belongs to" a brand if `license.brandId === brand.id`
- A license is "accessible" to a creator if they own the IP asset (`ipAsset.ownerships.creatorId`)
- Admins can access all licenses

**Frontend Filtering**:
```typescript
// Example: Filter licenses based on user role
async function fetchUserLicenses(userId: string, role: UserRole) {
  const filters: LicenseFilters = {};
  
  if (role === 'BRAND') {
    const brand = await getBrandByUserId(userId);
    filters.brandId = brand.id;
  } else if (role === 'CREATOR') {
    const creator = await getCreatorByUserId(userId);
    filters.creatorId = creator.id;
  }
  // ADMIN: no filters, see all
  
  return trpc.licenses.list.query(filters);
}
```

### Field-Level Permissions

Some fields are restricted based on role:

| Field | Brand (Owner) | Creator | Admin | Notes |
|-------|---------------|---------|-------|-------|
| `status` | ❌ | ❌ | ✅ | Only admin can manually set |
| `feeCents` | ✅ (DRAFT) | ❌ | ✅ | Requires amendment on ACTIVE |
| `revShareBps` | ✅ (DRAFT) | ❌ | ✅ | Requires amendment on ACTIVE |
| `scope` | ✅ (DRAFT) | ❌ | ✅ | Requires amendment on ACTIVE |
| `autoRenew` | ✅ | ❌ | ✅ | Brand preference |
| `metadata` | ✅ | ❌ | ✅ | Custom data |

### Permission Check Examples

**Check if user can approve license**:
```typescript
function canApproveLicense(license: License, user: User): boolean {
  // Must be creator role
  if (user.role !== 'CREATOR' && user.role !== 'ADMIN') return false;
  
  // License must be PENDING_APPROVAL
  if (license.status !== 'PENDING_APPROVAL') return false;
  
  // User must own the IP asset
  const userCreatorId = user.creator?.id;
  const ownsAsset = license.ipAsset?.ownerships?.some(
    (ownership) => ownership.creatorId === userCreatorId
  );
  
  return ownsAsset || user.role === 'ADMIN';
}
```

**Check if user can propose amendment**:
```typescript
function canProposeAmendment(license: License, user: User): boolean {
  if (user.role === 'ADMIN') return true;
  
  // License must be ACTIVE or PENDING_APPROVAL
  if (!['ACTIVE', 'PENDING_APPROVAL'].includes(license.status)) return false;
  
  // User must be brand owner OR asset creator
  const isBrandOwner = user.brand?.id === license.brandId;
  const isAssetCreator = license.ipAsset?.ownerships?.some(
    (ownership) => ownership.creator.userId === user.id
  );
  
  return isBrandOwner || isAssetCreator;
}
```

---

## Status Machine & Transitions

### Status Flow Diagram

```
DRAFT
  ↓ (brand submits)
PENDING_APPROVAL
  ↓ (creator approves)
ACTIVE
  ↓ (30 days before expiry - automated)
EXPIRING_SOON
  ↓ (end date passes - automated)
EXPIRED
  ↓ (if renewed)
RENEWED

Alternative paths:
DRAFT → CANCELED (brand cancels)
PENDING_APPROVAL → CANCELED (brand withdraws)
ACTIVE → TERMINATED (early termination)
ACTIVE → DISPUTED (dispute raised)
ACTIVE → SUSPENDED (admin action)
```

### Status Definitions

| Status | Description | Next States | Trigger |
|--------|-------------|-------------|---------|
| `DRAFT` | License created but not submitted | PENDING_APPROVAL, CANCELED | Brand action |
| `PENDING_APPROVAL` | Awaiting creator approval | ACTIVE, CANCELED | Creator action |
| `ACTIVE` | License in effect | EXPIRING_SOON, TERMINATED, DISPUTED, SUSPENDED | Time or action |
| `EXPIRING_SOON` | Within 30 days of expiration | EXPIRED, RENEWED, TERMINATED | Time or renewal |
| `EXPIRED` | End date passed | RENEWED | Renewal |
| `RENEWED` | Replaced by renewal license | Terminal | Renewal accepted |
| `TERMINATED` | Early termination | Terminal | Brand/Creator action |
| `DISPUTED` | Under dispute resolution | ACTIVE, TERMINATED | Dispute action |
| `SUSPENDED` | Admin suspension | ACTIVE, TERMINATED | Admin action |
| `CANCELED` | Canceled before activation | Terminal | Brand action |

### Allowed Transitions

```typescript
const ALLOWED_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELED'],
  PENDING_APPROVAL: ['ACTIVE', 'CANCELED'],
  ACTIVE: ['EXPIRING_SOON', 'TERMINATED', 'DISPUTED', 'SUSPENDED'],
  EXPIRING_SOON: ['EXPIRED', 'RENEWED', 'TERMINATED'],
  EXPIRED: ['RENEWED'],
  RENEWED: [],
  TERMINATED: [],
  DISPUTED: ['ACTIVE', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  CANCELED: []
};

function canTransition(from: LicenseStatus, to: LicenseStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) || false;
}
```

### Automated Transitions

Background jobs run daily to process status transitions:

**1. ACTIVE → EXPIRING_SOON** (Daily at 2:00 AM UTC)
```typescript
// Triggered 30 days before expiration
if (daysUntilExpiry === 30 && status === 'ACTIVE') {
  updateStatus('EXPIRING_SOON');
  sendExpiryNotification('30_DAY');
}
```

**2. EXPIRING_SOON → EXPIRED** (Daily at 2:00 AM UTC)
```typescript
// Triggered when end date passes
if (new Date() > endDate && status === 'EXPIRING_SOON') {
  updateStatus('EXPIRED');
  sendExpiryNotification('EXPIRED');
}
```

**3. Auto-Renewal Processing** (Daily at 9:00 AM UTC)
```typescript
// Triggered 60 days before expiry if autoRenew enabled
if (autoRenew && daysUntilExpiry === 60) {
  const offer = await generateRenewalOffer(licenseId);
  await acceptRenewalOffer(licenseId, offer.id);
  updateStatus('RENEWED');
}
```

### Frontend Status Display

**Status badges**:
```typescript
const STATUS_CONFIG: Record<LicenseStatus, { 
  label: string; 
  color: string; 
  icon: React.FC 
}> = {
  DRAFT: { 
    label: 'Draft', 
    color: 'gray', 
    icon: FileText 
  },
  PENDING_APPROVAL: { 
    label: 'Pending Approval', 
    color: 'yellow', 
    icon: Clock 
  },
  ACTIVE: { 
    label: 'Active', 
    color: 'green', 
    icon: CheckCircle 
  },
  EXPIRING_SOON: { 
    label: 'Expiring Soon', 
    color: 'orange', 
    icon: AlertTriangle 
  },
  EXPIRED: { 
    label: 'Expired', 
    color: 'red', 
    icon: XCircle 
  },
  RENEWED: { 
    label: 'Renewed', 
    color: 'blue', 
    icon: RefreshCw 
  },
  TERMINATED: { 
    label: 'Terminated', 
    color: 'red', 
    icon: Ban 
  },
  DISPUTED: { 
    label: 'Disputed', 
    color: 'purple', 
    icon: AlertOctagon 
  },
  SUSPENDED: { 
    label: 'Suspended', 
    color: 'red', 
    icon: PauseCircle 
  },
  CANCELED: { 
    label: 'Canceled', 
    color: 'gray', 
    icon: XCircle 
  }
};

function LicenseStatusBadge({ status }: { status: LicenseStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  
  return (
    <Badge variant={config.color}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}
```

**Timeline visualization**:
```typescript
function LicenseTimeline({ license }: { license: License }) {
  const timeline = [
    { date: license.createdAt, label: 'Created', status: 'DRAFT' },
    { date: license.signedAt, label: 'Approved', status: 'ACTIVE' },
    { 
      date: subDays(new Date(license.endDate), 30), 
      label: 'Expiry Warning', 
      status: 'EXPIRING_SOON' 
    },
    { date: license.endDate, label: 'Expires', status: 'EXPIRED' }
  ];
  
  return (
    <div className="space-y-2">
      {timeline.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="w-24 text-sm text-muted-foreground">
            {format(new Date(item.date), 'MMM dd, yyyy')}
          </div>
          <LicenseStatusBadge status={item.status as LicenseStatus} />
          <span className="text-sm">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
```

---

**Continue to Part 3** for Rate Limiting, Real-time Updates, Frontend Implementation Checklist, and Testing Scenarios.
