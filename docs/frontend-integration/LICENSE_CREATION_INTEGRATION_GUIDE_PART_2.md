# License Creation Module - Frontend Integration Guide (Part 2)

**Classification:** ⚡ HYBRID  
**Module:** License Creation & Management  
**Last Updated:** October 14, 2025  
**Version:** 1.0.0

---

## Business Logic & Validation Rules

### Field Validation Requirements

#### 1. Date Validation
```typescript
// End date must be after start date
if (new Date(endDate) <= new Date(startDate)) {
  throw new Error('End date must be after start date');
}

// Cannot back-date licenses (start date in the past)
if (new Date(startDate) < new Date()) {
  // Warning only, not blocking
  warnings.push('License starts in the past');
}

// Maximum license duration: 5 years (configurable)
const durationDays = differenceInDays(endDate, startDate);
if (durationDays > 1825) {
  warnings.push('License duration exceeds 5 years');
}
```

#### 2. Revenue Share Validation
```typescript
// Basis points range: 0-10000 (0% to 100%)
if (revShareBps < 0 || revShareBps > 10000) {
  throw new Error('Revenue share must be between 0 and 10000 basis points');
}

// Common mistake detection: user enters percentage instead of basis points
if (revShareBps > 100 && revShareBps <= 10000) {
  warnings.push('Did you mean ' + (revShareBps / 100) + '%? Remember: 1% = 100 basis points');
}

// Hybrid model warning
if (feeCents > 0 && revShareBps > 0) {
  warnings.push('License uses hybrid pricing (fixed fee + revenue share)');
}

// No compensation warning
if (feeCents === 0 && revShareBps === 0) {
  throw new Error('License must have either a fixed fee or revenue share');
}
```

#### 3. Scope Validation
```typescript
// At least one media type must be selected
const hasMedia = Object.values(scope.media).some(v => v === true);
if (!hasMedia) {
  throw new Error('At least one media type must be selected');
}

// At least one placement must be selected
const hasPlacement = Object.values(scope.placement).some(v => v === true);
if (!hasPlacement) {
  throw new Error('At least one placement type must be selected');
}

// Exclusivity validation
if (licenseType === 'EXCLUSIVE' || licenseType === 'EXCLUSIVE_TERRITORY') {
  if (!scope.exclusivity?.category) {
    warnings.push('Exclusive licenses typically specify a category');
  }
}

// Territory validation
if (licenseType === 'EXCLUSIVE_TERRITORY') {
  if (!scope.geographic?.territories || scope.geographic.territories.length === 0) {
    throw new Error('Territory-exclusive licenses must specify territories');
  }
}

// Global territory warning
if (scope.geographic?.territories?.includes('GLOBAL')) {
  warnings.push('Global territory selected - ensure this is intentional');
}
```

#### 4. Fee Calculation Logic

The backend auto-calculates fees when `feeCents` is set to `0`. The calculation uses:

```typescript
/**
 * Fee Calculation Formula
 * 
 * baseFeeCents = BASE_RATE[assetType]
 * scopeMultiplier = Σ(mediaMultipliers) + Σ(placementMultipliers)
 * exclusivityPremium = baseFeeCents * EXCLUSIVITY_MULTIPLIER[licenseType]
 * durationMultiplier = 1.0 + (durationYears - 1) * 0.15  // 15% per additional year
 * territoryMultiplier = TERRITORY_MULTIPLIER[territoryScope]
 * 
 * subtotal = baseFeeCents * scopeMultiplier * durationMultiplier * territoryMultiplier
 * totalFeeCents = subtotal + exclusivityPremium
 * platformFeeCents = totalFeeCents * 0.10  // 10% platform fee
 * creatorNetCents = totalFeeCents - platformFeeCents
 */

// Base rates (in cents)
const BASE_RATES = {
  PHOTO: 50000,    // $500
  VIDEO: 100000,   // $1,000
  AUDIO: 75000,    // $750
  DESIGN: 50000,   // $500
  WRITTEN: 30000,  // $300
  THREE_D: 75000,  // $750
  OTHER: 50000     // $500
};

// Media multipliers (additive)
const MEDIA_MULTIPLIERS = {
  digital: 1.0,
  print: 1.2,
  broadcast: 2.0,
  ooh: 1.8
};

// Placement multipliers (additive)
const PLACEMENT_MULTIPLIERS = {
  social: 1.0,
  website: 1.1,
  email: 0.9,
  paid_ads: 1.5,
  packaging: 1.4
};

// Exclusivity premiums (multiplier)
const EXCLUSIVITY_PREMIUMS = {
  EXCLUSIVE: 3.0,           // 3x base fee
  EXCLUSIVE_TERRITORY: 1.8, // 1.8x base fee
  NON_EXCLUSIVE: 1.0        // No premium
};

// Territory multipliers
const TERRITORY_MULTIPLIERS = {
  global: 3.0,
  regional: 1.5,  // 2-5 countries
  singleCountry: 1.0
};

// Minimum fee enforcement
const MINIMUM_FEE_CENTS = 10000; // $100
```

**Example Calculation:**
```typescript
// Inputs:
// - Asset Type: PHOTO
// - Media: digital + print
// - Placement: social + website + paid_ads
// - License Type: EXCLUSIVE
// - Duration: 1 year
// - Territory: US only

baseFeeCents = 50000  // PHOTO base rate
scopeMultiplier = (1.0 + 1.2) + (1.0 + 1.1 + 1.5) = 5.8
exclusivityPremium = 50000 * 3.0 = 150000
durationMultiplier = 1.0  // 1 year
territoryMultiplier = 1.0  // Single country

subtotal = 50000 * 5.8 * 1.0 * 1.0 = 290000
totalFeeCents = 290000 + 150000 = 440000  // $4,400
platformFeeCents = 440000 * 0.10 = 44000   // $440
creatorNetCents = 440000 - 44000 = 396000  // $3,960
```

### Business Rules

#### License Status State Machine

```typescript
/**
 * Valid status transitions:
 * 
 * DRAFT → PENDING_APPROVAL (when brand submits)
 * PENDING_APPROVAL → ACTIVE (when creator approves)
 * PENDING_APPROVAL → DRAFT (when creator rejects/requests changes)
 * ACTIVE → EXPIRING_SOON (30 days before end date - automatic)
 * ACTIVE → TERMINATED (early termination by brand/admin)
 * ACTIVE → SUSPENDED (admin action for disputes)
 * EXPIRING_SOON → EXPIRED (end date reached - automatic)
 * EXPIRING_SOON → RENEWED (renewal accepted)
 * EXPIRED → (terminal state)
 * TERMINATED → (terminal state)
 */

// Cannot edit licenses in certain statuses
const NON_EDITABLE_STATUSES = ['ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED'];

// Cannot sign licenses in certain statuses
const NON_SIGNABLE_STATUSES = ['ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED', 'SUSPENDED'];

// Cannot delete licenses in certain statuses (admin only)
const NON_DELETABLE_STATUSES = ['ACTIVE', 'TERMINATED'];
```

#### Conflict Detection Rules

```typescript
/**
 * Conflict Types:
 * 
 * 1. EXCLUSIVE_OVERLAP
 *    - An exclusive license already exists for this asset during the date range
 *    - Blocks: Any new license (exclusive or non-exclusive)
 * 
 * 2. TERRITORY_OVERLAP
 *    - Territory-exclusive license exists for overlapping territories
 *    - Blocks: New licenses with same territories
 * 
 * 3. COMPETITOR_BLOCKED
 *    - Existing license blocks competitor brands
 *    - Blocks: Licenses from brands in the competitor list
 * 
 * 4. DATE_OVERLAP
 *    - Multiple non-exclusive licenses for same scope and dates
 *    - Warning only, doesn't block
 */

// Check conflicts before creating/updating
async function checkConflicts(input: ConflictCheckInput): Promise<ConflictResult> {
  // Call: licenses.checkConflicts
  // Display conflicts to user
  // For blocking conflicts: prevent license creation
  // For warnings: allow user to proceed with confirmation
}
```

#### Approval Workflow Rules

```typescript
/**
 * Approval Requirements:
 * 
 * 1. High-value licenses (≥$10,000): Require admin approval
 * 2. Exclusive licenses: Always require creator + admin approval
 * 3. First-time brand licenses: Require admin approval
 * 4. Global territory licenses: Flagged for admin review
 * 5. Licenses >1 year: Flagged for admin review
 * 6. Hybrid pricing (fee + rev share): Flagged for admin review
 */

// Determine required approvers
function getRequiredApprovers(license: License): string[] {
  const approvers = ['creator']; // Always required
  
  if (license.feeCents >= 1000000) {  // $10,000
    approvers.push('admin');
  }
  
  if (license.licenseType === 'EXCLUSIVE') {
    approvers.push('admin');
  }
  
  // Check if first license for brand
  if (isFirstTimeBrand(license.brandId)) {
    approvers.push('admin');
  }
  
  return approvers;
}
```

#### Revenue Share Distribution

```typescript
/**
 * For co-owned IP assets, revenue share is distributed among creators
 * based on their ownership percentages.
 * 
 * Example:
 * - IP Asset owned by 2 creators: Creator A (60%), Creator B (40%)
 * - License revenue share: 20% (2000 bps)
 * - Brand generates $10,000 in revenue
 * 
 * Calculation:
 * - Total rev share: $10,000 * 20% = $2,000
 * - Platform fee (10%): $2,000 * 10% = $200
 * - Net to creators: $2,000 - $200 = $1,800
 * - Creator A: $1,800 * 60% = $1,080
 * - Creator B: $1,800 * 40% = $720
 */

// Frontend should display this breakdown when showing license details
```

### Derived Values & Calculations

```typescript
// Convert cents to dollars for display
const feeDollars = feeCents / 100;

// Convert basis points to percentage
const revSharePercent = revShareBps / 100;

// Calculate license duration
const durationDays = differenceInDays(new Date(endDate), new Date(startDate));
const durationYears = durationDays / 365;

// Calculate days until expiration
const daysUntilExpiration = differenceInDays(new Date(endDate), new Date());

// Calculate renewal eligibility (within 90 days of expiration)
const isRenewalEligible = daysUntilExpiration > 0 && daysUntilExpiration <= 90;

// Format reference number for display
const formattedRefNumber = license.metadata?.referenceNumber || 'Pending';
// Example: LIC-2025-A3B5C7D9
```

---

## Error Handling

### Error Codes & Status Codes

| HTTP Status | tRPC Code | When It Occurs | User-Friendly Message |
|-------------|-----------|----------------|----------------------|
| 401 | UNAUTHORIZED | Missing/invalid JWT token | "Please log in to continue" |
| 403 | FORBIDDEN | User lacks permission | "You don't have permission to perform this action" |
| 404 | NOT_FOUND | License/asset not found | "License not found" |
| 409 | CONFLICT | License conflicts detected | "This license conflicts with existing agreements" |
| 400 | BAD_REQUEST | Invalid input data | "Please check your input and try again" |
| 500 | INTERNAL_SERVER_ERROR | Server/validation error | "An error occurred. Please try again" |

### Common Error Scenarios

#### 1. License Conflict Errors

```typescript
// Error structure
{
  code: 'CONFLICT',
  message: 'License conflicts with existing agreements',
  data: {
    conflicts: [
      {
        licenseId: 'clx...',
        reason: 'EXCLUSIVE_OVERLAP',
        details: 'Exclusive license already exists for this asset during the requested period',
        conflictingLicense: { /* partial license data */ }
      }
    ]
  }
}

// Frontend handling
if (error.code === 'CONFLICT') {
  // Display specific conflict details
  error.data.conflicts.forEach(conflict => {
    switch (conflict.reason) {
      case 'EXCLUSIVE_OVERLAP':
        showError(`An exclusive license already exists from ${formatDate(conflict.conflictingLicense.startDate)} to ${formatDate(conflict.conflictingLicense.endDate)}`);
        break;
      case 'TERRITORY_OVERLAP':
        showError(`Territory conflict: ${conflict.details}`);
        break;
      case 'COMPETITOR_BLOCKED':
        showError('This brand is blocked by an existing exclusivity agreement');
        break;
    }
  });
}
```

#### 2. Permission Errors

```typescript
// Error structure
{
  code: 'FORBIDDEN',
  message: 'You do not have permission to approve this license'
}

// Frontend handling
if (error.code === 'FORBIDDEN') {
  if (error.message.includes('approve')) {
    showError('Only asset owners can approve licenses');
  } else if (error.message.includes('another brand')) {
    showError('You can only create licenses for your own brand');
  } else {
    showError('You don\'t have permission to perform this action');
  }
}
```

#### 3. Validation Errors

```typescript
// Error structure
{
  code: 'INTERNAL_SERVER_ERROR',
  message: 'License validation failed:\n  - End date must be after start date\n  - Revenue share must be between 0 and 10000 basis points'
}

// Frontend handling
if (error.message.includes('validation failed')) {
  const errors = error.message.split('\n').slice(1); // Skip "validation failed:" line
  errors.forEach(err => {
    const cleanError = err.trim().replace(/^- /, '');
    // Map to form field errors
    if (cleanError.includes('End date')) {
      setFieldError('endDate', cleanError);
    } else if (cleanError.includes('Revenue share')) {
      setFieldError('revShareBps', cleanError);
    }
  });
}
```

#### 4. Not Found Errors

```typescript
// Error structure
{
  code: 'NOT_FOUND',
  message: 'License not found'
}

// Frontend handling
if (error.code === 'NOT_FOUND') {
  showError('The license you\'re looking for doesn\'t exist or has been deleted');
  navigate('/licenses'); // Redirect to list
}
```

### When to Show Specific vs Generic Errors

**Show Specific Errors:**
- Validation failures (field-level feedback)
- Permission denials (explain what's required)
- Conflicts (show details with resolution options)
- Business rule violations (explain the rule)

**Show Generic Errors:**
- Unexpected server errors (500)
- Network failures
- Unknown error codes
- Errors containing sensitive data

```typescript
function getDisplayMessage(error: TRPCError): string {
  // Show specific message for known error codes
  if (['FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'BAD_REQUEST'].includes(error.code)) {
    return error.message;
  }
  
  // Generic message for server errors
  if (error.code === 'INTERNAL_SERVER_ERROR') {
    // Check if it's a validation error
    if (error.message.includes('validation failed')) {
      return error.message; // Show validation details
    }
    return 'An unexpected error occurred. Please try again or contact support.';
  }
  
  // Generic message for other errors
  return 'Something went wrong. Please try again.';
}
```

### Error Recovery Actions

```typescript
// Provide actionable recovery for common errors
const errorRecoveryActions = {
  CONFLICT: {
    primary: 'View Conflicting License',
    secondary: 'Adjust Dates',
    action: (conflict) => navigate(`/licenses/${conflict.licenseId}`)
  },
  FORBIDDEN: {
    primary: 'Contact Support',
    secondary: 'Go Back',
    action: () => navigate(-1)
  },
  NOT_FOUND: {
    primary: 'Back to Licenses',
    action: () => navigate('/licenses')
  }
};
```

---

## Authorization & Permissions

### Role-Based Access Control

#### Permission Matrix

| Action | Brand | Creator | Admin | Notes |
|--------|-------|---------|-------|-------|
| Create License | ✅ (own brand only) | ❌ | ✅ (any brand) | Brand proposes licenses |
| View License | ✅ (own only) | ✅ (own assets) | ✅ (all) | Role-filtered |
| Update License | ✅ (DRAFT/PENDING only) | ❌ | ✅ | Limited updates |
| Approve License | ❌ | ✅ (must own asset) | ✅ | Creator approval |
| Sign License | ✅ (own only) | ✅ (own assets) | ✅ | Multi-party signing |
| Terminate License | ✅ (own only) | ❌ | ✅ | Early termination |
| Delete License | ❌ | ❌ | ✅ | Soft delete only |
| Generate Renewal | ✅ (own only) | ❌ | ✅ | Creates new license |
| View Revenue | ✅ (own only) | ✅ (own assets) | ✅ | Financial data |
| View Statistics | ✅ (own brand) | ❌ | ✅ (all brands) | Analytics |

#### Field-Level Permissions

**Read-Only Fields (after creation):**
- `id`, `createdAt`, `updatedAt`
- `ipAssetId`, `brandId`, `projectId`
- `signedAt`, `signatureProof`
- `parentLicenseId`
- `metadata.referenceNumber`
- `metadata.feeBreakdown`

**Admin-Only Fields:**
- `deletedAt`
- `status` (direct manipulation, except through workflows)

**Creator-Only Actions:**
- Approve licenses for their IP assets
- Sign licenses as the asset owner

**Brand-Only Actions:**
- Create licenses for their brand
- Sign licenses as the licensee
- Request renewals

### Resource Ownership Rules

```typescript
/**
 * Ownership Verification Rules:
 * 
 * 1. Brand Ownership
 *    - User's brand.id must match license.brandId
 *    - Checked via: brand.userId === user.id
 * 
 * 2. Creator Ownership
 *    - User must own the IP asset through ipOwnership
 *    - Checked via: ipAsset.ownerships.some(o => o.creator.userId === user.id)
 * 
 * 3. Admin Override
 *    - Admins can access all licenses regardless of ownership
 */

// Frontend: Check if user can edit license
function canEditLicense(user: User, license: License): boolean {
  // Admins can edit anything
  if (user.role === 'ADMIN') return true;
  
  // Can't edit in certain statuses
  if (['ACTIVE', 'EXPIRED', 'TERMINATED'].includes(license.status)) {
    return false;
  }
  
  // Brand can edit their own licenses
  if (user.role === 'BRAND' && user.brandId === license.brandId) {
    return true;
  }
  
  return false;
}

// Frontend: Check if user can approve license
function canApproveLicense(user: User, license: License): boolean {
  if (user.role === 'ADMIN') return true;
  
  if (user.role === 'CREATOR') {
    // Check if user owns the IP asset
    return license.ipAsset?.ownerships?.some(
      o => o.creator.userId === user.id
    ) ?? false;
  }
  
  return false;
}

// Frontend: Check if user can sign license
function canSignLicense(user: User, license: License): boolean {
  // License must be in signable status
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(license.status)) {
    return false;
  }
  
  // Admin can sign
  if (user.role === 'ADMIN') return true;
  
  // Creator can sign if they own the asset
  if (user.role === 'CREATOR') {
    return license.ipAsset?.ownerships?.some(
      o => o.creator.userId === user.id
    ) ?? false;
  }
  
  // Brand can sign if it's their license
  if (user.role === 'BRAND' && user.brandId === license.brandId) {
    return true;
  }
  
  return false;
}
```

### JWT Token Requirements

```typescript
/**
 * All API requests must include a valid JWT token
 * 
 * Header: Authorization: Bearer <token>
 * 
 * Token Payload:
 * {
 *   userId: string;
 *   email: string;
 *   role: 'ADMIN' | 'BRAND' | 'CREATOR' | 'VIEWER';
 *   brandId?: string;  // For brand users
 *   creatorId?: string; // For creator users
 *   iat: number;
 *   exp: number;
 * }
 */

// Frontend: Include token in all requests
const headers = {
  'Authorization': `Bearer ${getAuthToken()}`,
  'Content-Type': 'application/json'
};
```

### Permission Error Handling

```typescript
// Frontend permission check before action
async function createLicense(data: CreateLicenseInput) {
  // Pre-check: User must be brand or admin
  if (!['BRAND', 'ADMIN'].includes(currentUser.role)) {
    showError('Only brands can create licenses');
    return;
  }
  
  // Pre-check: User must own the brand
  if (currentUser.role === 'BRAND' && currentUser.brandId !== data.brandId) {
    showError('You can only create licenses for your own brand');
    return;
  }
  
  try {
    const result = await trpc.licenses.create.mutate(data);
    // Success
  } catch (error) {
    if (error.code === 'FORBIDDEN') {
      showError('You don\'t have permission to create this license');
    } else {
      handleGenericError(error);
    }
  }
}
```

---

*Continued in [LICENSE_CREATION_INTEGRATION_GUIDE_PART_3.md](./LICENSE_CREATION_INTEGRATION_GUIDE_PART_3.md)*
