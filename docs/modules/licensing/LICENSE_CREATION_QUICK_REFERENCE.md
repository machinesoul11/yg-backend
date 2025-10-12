# License Creation Module - Quick Reference

## Import Statements

```typescript
import {
  // Services
  licenseService,
  licenseGenerationService,
  feeCalculationService,
  licenseTermsGenerationService,
  licenseApprovalWorkflowService,
  licenseSigningService,
  
  // Validators
  scopeValidator,
  revenueShareValidator,
  
  // Types
  type LicenseGenerationResult,
  type FeeCalculationBreakdown,
  type GeneratedLicenseTerms,
  type ApprovalResult,
  type SigningResult,
  type ScopeValidationResult,
  type RevenueShareValidationResult,
} from '@/modules/licenses';
```

## Quick Start

### 1. Create License with Enhanced Validation

```typescript
const result = await licenseService.createLicenseEnhanced(
  {
    ipAssetId: string,
    brandId: string,
    licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    feeCents: 0, // Auto-calculated if 0
    revShareBps: 2000, // 20% = 2000 basis points
    scope: {
      media: { digital: true, print: true, broadcast: false, ooh: false },
      placement: { social: true, website: true, email: true, paid_ads: false, packaging: false },
      geographic: { territories: ['US', 'CA'] }, // or ['GLOBAL']
      exclusivity: { category: 'Fashion', competitors: ['brand_id'] },
      cutdowns: { allowEdits: true, maxDuration: 60, aspectRatios: ['16:9', '1:1'] },
      attribution: { required: true, format: 'Photo by @creator' },
    },
    autoRenew: false,
    billingFrequency: 'MONTHLY',
  },
  userId,
  { ipAddress, userAgent, requestId }
);

// Returns: { license, referenceNumber, validationWarnings, feeBreakdown }
```

### 2. Calculate Fees

```typescript
const breakdown = await licenseService.calculateFee({
  ipAssetId: 'asset_123',
  licenseType: 'EXCLUSIVE',
  scope: { /* ... */ },
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  brandId: 'brand_456', // Optional: for brand discounts
});

// Returns: FeeCalculationBreakdown with detailed breakdown
```

### 3. Validate Scope

```typescript
const validation = await scopeValidator.validateScope(
  scope,
  licenseType,
  ipAssetId,
  startDate,
  endDate,
  excludeLicenseId // Optional: when updating
);

// Returns: { valid: boolean, errors: string[], warnings: string[] }
```

### 4. Validate Revenue Share

```typescript
const validation = await revenueShareValidator.validateRevenueShare(
  revShareBps,
  feeCents,
  ipAssetId,
  billingFrequency
);

// Returns: { valid: boolean, errors: string[], warnings: string[] }
```

### 5. Generate License Terms

```typescript
const terms = await licenseService.generateLicenseTerms(licenseId);

// Returns: { fullText, sections: [...], referenceNumber, version }
```

### 6. Approve/Reject License

```typescript
const result = await licenseService.processLicenseApproval(licenseId, {
  userId: 'user_123',
  userRole: 'creator', // or 'brand' or 'admin'
  action: 'approve', // or 'reject' or 'request_changes'
  comments: 'Looks good!',
  requestedChanges: ['Lower the fee', 'Extend duration'],
  ipAddress: '1.2.3.4',
  userAgent: 'Mozilla/5.0...',
});

// Returns: { license, newStatus, nextApprover, message, requiresAdminReview }
```

### 7. Sign License

```typescript
const result = await licenseService.signLicense(
  licenseId,
  userId,
  'creator', // or 'brand'
  { ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0...' }
);

// Returns: { license, signatureProof, allPartiesSigned, executedAt, message }
```

### 8. Verify Signature

```typescript
const verification = await licenseService.verifyLicenseSignature(licenseId);

// Returns: { valid, signedBy: [...], licenseId, status, termsHash }
```

### 9. Get Pending Approvals

```typescript
const pending = await licenseService.getPendingApprovalsForUser(
  userId,
  'creator' // or 'brand' or 'admin'
);

// Returns: License[]
```

### 10. Generate Certificate

```typescript
const certificate = await licenseService.generateLicenseCertificate(licenseId);

// Returns: { certificateId, licenseId, issuedAt, signatureProof, certificateUrl }
```

## Common Patterns

### Pattern: Create → Approve → Sign → Activate

```typescript
// Step 1: Brand creates license
const { license, referenceNumber } = await licenseService.createLicenseEnhanced(
  licenseInput,
  brandUserId,
  context
);

// Step 2: Creator approves
const { newStatus } = await licenseService.processLicenseApproval(license.id, {
  userId: creatorUserId,
  userRole: 'creator',
  action: 'approve',
});

// Step 3: Creator signs
await licenseService.signLicense(license.id, creatorUserId, 'creator', context);

// Step 4: Brand signs (activates if all signed)
const { allPartiesSigned, executedAt } = await licenseService.signLicense(
  license.id,
  brandUserId,
  'brand',
  context
);

if (allPartiesSigned) {
  console.log(`License fully executed at ${executedAt}`);
}
```

### Pattern: Fee Calculation Before Creation

```typescript
// Calculate fee first
const { totalFeeCents, breakdown } = await licenseService.calculateFee(params);

// Show to user for approval
console.log(`Estimated fee: $${totalFeeCents / 100}`);
console.log('Breakdown:', breakdown);

// Create with calculated fee
const license = await licenseService.createLicenseEnhanced(
  { ...params, feeCents: totalFeeCents },
  userId,
  context
);
```

### Pattern: Handle Validation Errors

```typescript
try {
  const result = await licenseService.createLicenseEnhanced(input, userId, context);
  
  // Check warnings
  if (result.validationWarnings.length > 0) {
    console.warn('Warnings:', result.validationWarnings);
  }
  
  return result.license;
} catch (error) {
  if (error.name === 'LicenseValidationError') {
    // Parse validation errors
    const errors = error.message.split('\n').slice(1);
    return { errors };
  }
  throw error;
}
```

## Fee Calculation Formulas

### Base Rates (by Asset Type)
- `PHOTO`: $500
- `VIDEO`: $1000
- `AUDIO`: $750
- `DESIGN`: $500
- `WRITTEN`: $300
- `THREE_D`: $750

### Multipliers

**Exclusivity**:
- `EXCLUSIVE`: 3.0x
- `EXCLUSIVE_TERRITORY`: 1.8x
- `NON_EXCLUSIVE`: 1.0x

**Territory**:
- Global: 2.0x
- Regional (3+ countries): 1.5x
- Single country: 1.0x

**Duration**:
- 1 month: 1.0x
- 3 months: 1.8x
- 6 months: 2.5x
- 12 months: 4.0x
- 24 months: 7.0x
- 36 months: 9.5x
- 36+ months: 9.5x + 0.5x per additional year

**Volume Discounts** (based on brand total spend):
- $10k+: -10%
- $5k-$10k: -5%
- $2.5k-$5k: -3%

**Platform Fee**: 10% of total

**Minimum**: $100

### Formula

```
total = (
  baseRate
  × scopeMultiplier
  × exclusivityMultiplier
  × durationMultiplier
  × territoryMultiplier
  + marketAdjustment
)

if (total < minimumFee) total = minimumFee

platformFee = total × 0.10
creatorNet = total - platformFee
```

## Revenue Share Guide

### Basis Points
- 100 bps = 1%
- 1000 bps = 10%
- 5000 bps = 50%
- 10000 bps = 100%

### Common Structures

**Fixed Fee Only**:
```typescript
{ feeCents: 100000, revShareBps: 0 } // $1000, no rev share
```

**Revenue Share Only**:
```typescript
{ feeCents: 0, revShareBps: 2000 } // 0 fixed, 20% rev share
```

**Hybrid**:
```typescript
{ feeCents: 50000, revShareBps: 1000 } // $500 + 10% rev share
```

### Multiple Owners

Revenue share is automatically distributed according to ownership percentages:

```typescript
// If asset has 2 owners:
// Owner A: 70% (7000 bps)
// Owner B: 30% (3000 bps)
// License: 20% rev share (2000 bps)

// Distribution:
// Owner A gets: 2000 × 0.70 = 1400 bps (14%)
// Owner B gets: 2000 × 0.30 = 600 bps (6%)
```

## Scope Configuration

### Media Types
```typescript
media: {
  digital: boolean,  // Web, app, social media
  print: boolean,    // Magazine, poster, brochure
  broadcast: boolean,// TV, streaming
  ooh: boolean,      // Out-of-home (billboards, transit)
}
```

### Placements
```typescript
placement: {
  social: boolean,    // Instagram, Facebook, TikTok, etc.
  website: boolean,   // Brand website
  email: boolean,     // Email marketing
  paid_ads: boolean,  // Google Ads, Facebook Ads, etc.
  packaging: boolean, // Product packaging
}
```

### Geographic
```typescript
geographic: {
  territories: string[]  // ['US', 'CA', 'GB'] or ['GLOBAL']
}
```

### Exclusivity
```typescript
exclusivity: {
  category: string,      // 'Fashion', 'Beauty', 'Technology'
  competitors: string[], // Brand IDs to block
}
```

### Cutdowns
```typescript
cutdowns: {
  allowEdits: boolean,
  maxDuration: number,    // Seconds (for video)
  aspectRatios: string[], // ['16:9', '1:1', '9:16']
}
```

### Attribution
```typescript
attribution: {
  required: boolean,
  format: string, // 'Photo by @creator'
}
```

## Status Flow

```
DRAFT
  ↓ (creator approves)
PENDING_APPROVAL
  ↓ (admin approves if needed, all parties sign)
ACTIVE
  ↓ (end date reached)
EXPIRED

Or:
PENDING_APPROVAL
  ↓ (creator rejects or requests changes)
DRAFT
```

## Common Errors

### Validation Errors
- `End date must be after start date`
- `At least one media type must be selected`
- `Revenue share must be between 0 and 10000 basis points`
- `Exclusive license conflict with...`

### Permission Errors
- `You do not have permission to approve this license`
- `Only asset owners can sign`

### State Errors
- `Cannot approve license in TERMINATED status`
- `License must be ACTIVE to generate certificate`

## Best Practices

1. **Always validate before creating**: Use validators to check inputs
2. **Calculate fees transparently**: Show breakdown to users
3. **Log everything**: Audit trails are critical for disputes
4. **Use transactions**: Wrap multi-step operations
5. **Handle warnings**: Don't ignore validation warnings
6. **Verify signatures**: Check signature proof for executed licenses
7. **Send notifications**: Keep all parties informed
8. **Document changes**: Use comments in approval actions
9. **Test edge cases**: Co-ownership, first-time brands, high values
10. **Generate certificates**: Provide proof of executed licenses

## Support

For issues or questions:
- Check implementation docs: `LICENSE_CREATION_COMPLETE.md`
- Review source code: `src/modules/licenses/`
- Check audit logs: `audit_events` table
- View license metadata: `licenses.metadata` field

---

**Last Updated**: October 12, 2025  
**Version**: 1.0.0
