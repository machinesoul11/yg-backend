# License Validation - Quick Reference

## Import

```typescript
import { licenseValidationService } from '@/modules/licenses';
```

## Basic Usage

```typescript
const result = await licenseValidationService.validateLicense({
  ipAssetId: 'asset-id',
  brandId: 'brand-id',
  licenseType: 'NON_EXCLUSIVE',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  scope: { /* LicenseScope */ },
  feeCents: 100000,
  revShareBps: 500,
});

if (!result.valid) {
  console.error(result.allErrors);
}
```

## Six Validation Checks

| Check | What It Does | Failure Impact |
|-------|--------------|----------------|
| **Date Overlap** | Checks for overlapping license periods | Blocks creation |
| **Exclusivity** | Validates exclusivity rules aren't violated | Blocks creation |
| **Scope Conflict** | Ensures scope compatibility | Blocks creation |
| **Budget Availability** | Verifies brand has sufficient budget | Blocks creation |
| **Ownership Verification** | Validates complete IP ownership | Blocks creation |
| **Approval Requirements** | Determines what approvals needed | Informational only |

## Common Validation Scenarios

### ✅ Valid Non-Exclusive License
```typescript
{
  licenseType: 'NON_EXCLUSIVE',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  scope: {
    media: { digital: true, print: false, broadcast: false, ooh: false },
    placement: { social: true, website: false, email: false, paid_ads: false, packaging: false },
  },
  feeCents: 100000, // $1,000
}
// ✅ Will pass if no conflicts exist
```

### ❌ Invalid: Exclusive During Active Period
```typescript
{
  licenseType: 'EXCLUSIVE',
  startDate: new Date('2025-06-01'),
  endDate: new Date('2025-12-31'),
  // ...
}
// ❌ Fails if ANY other license exists during this period
```

### ❌ Invalid: Missing Scope
```typescript
{
  scope: {
    media: { digital: false, print: false, broadcast: false, ooh: false },
    placement: { social: false, website: false, email: false, paid_ads: false, packaging: false },
  },
  // ...
}
// ❌ Fails: Must select at least one media type and placement
```

### ⚠️ Warning: Budget Limit Approaching
```typescript
{
  brandId: 'unverified-brand',
  feeCents: 900000, // $9,000
  // ...
}
// ⚠️ Passes but warns if brand has $8,000 already committed (approaching $10k limit)
```

## Response Structure

```typescript
interface LicenseValidationResult {
  valid: boolean;                    // Overall pass/fail
  allErrors: string[];              // All error messages
  allWarnings: string[];            // All warning messages
  conflicts: Conflict[];            // Detailed conflict info
  checks: {
    dateOverlap: ValidationCheck;
    exclusivity: ValidationCheck;
    scopeConflict: ValidationCheck;
    budgetAvailability: ValidationCheck;
    ownershipVerification: ValidationCheck;
    approvalRequirements: ValidationCheck;
  };
}
```

## Quick Checks

### Check Single Aspect

```typescript
// Just date overlap
const dateCheck = await licenseValidationService.validateDateOverlap(input);

// Just ownership
const ownershipCheck = await licenseValidationService.validateOwnership(input);

// Just budget
const budgetCheck = await licenseValidationService.validateBudgetAvailability(input);
```

## Business Rules Cheat Sheet

### Date Overlap
- ✅ Non-Exclusive + Non-Exclusive = OK (with warning)
- ❌ Exclusive + Any = BLOCKED
- ❌ Any + Exclusive = BLOCKED

### Budget Limits
- Unverified brands: **$10,000 total limit** (hard)
- Verified brands: **No limit** (warn at $100k+)

### Ownership Requirements
- Total shares = **exactly 100%** (10000 basis points)
- At least **1 primary owner** required
- **No disputed ownership** allowed
- Creator accounts must be **active**

### Approval Triggers
- Fee ≥ **$10,000** → Admin approval
- License type = **EXCLUSIVE** → Creator + Admin
- Brand **unverified** → Admin approval
- **All licenses** → Creator approval

## Error Messages

### Date Overlap
```
Date overlap conflict: exclusive license exists for Acme Corp from 2025-06-01 to 2025-12-31
```

### Exclusivity
```
Exclusive license conflict: Acme Corp holds exclusive rights during this period
```

### Scope
```
At least one media type must be selected
Complete scope conflict: Identical usage scope already licensed to Acme Corp
```

### Budget
```
Budget limit exceeded: Unverified brands are limited to $10,000 in total license fees
```

### Ownership
```
Invalid ownership structure: Total shares must equal 100% (current: 75%)
Ownership is disputed - cannot license until disputes are resolved
```

## Options

### Validate All (Don't Stop at First Error)
```typescript
const result = await licenseValidationService.validateLicense(
  input,
  { validateAll: true }  // Get ALL errors, not just first
);
```

### Exclude Self (When Updating)
```typescript
const input = {
  // ...
  excludeLicenseId: 'license-123',  // Don't conflict with self
};
```

## Integration Example

```typescript
// In your license creation endpoint
async createLicense(input: CreateLicenseInput) {
  // 1. Validate comprehensively
  const validation = await licenseValidationService.validateLicense({
    ipAssetId: input.ipAssetId,
    brandId: input.brandId,
    licenseType: input.licenseType,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    scope: input.scope,
    feeCents: input.feeCents,
    revShareBps: input.revShareBps,
  }, { validateAll: true });

  // 2. Check if valid
  if (!validation.valid) {
    throw new ValidationError(validation.allErrors);
  }

  // 3. Check if approval required
  const needsApproval = validation.checks.approvalRequirements.details?.approvalRequired;
  const initialStatus = needsApproval ? 'PENDING_APPROVAL' : 'DRAFT';

  // 4. Create license
  const license = await prisma.license.create({
    data: {
      ...input,
      status: initialStatus,
    },
  });

  // 5. Notify approvers if needed
  if (needsApproval) {
    await notifyApprovers(validation.checks.approvalRequirements.details.approvers);
  }

  return license;
}
```

## Performance Tips

1. **Use fast-fail by default**: Don't pass `validateAll: true` unless debugging
2. **Run validation once**: Cache result, don't re-validate
3. **Validate before expensive operations**: Don't create related records before validation

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { licenseValidationService } from '@/modules/licenses';

it('should validate license successfully', async () => {
  const result = await licenseValidationService.validateLicense(validInput);
  expect(result.valid).toBe(true);
});

it('should fail with date overlap', async () => {
  const result = await licenseValidationService.validateLicense(invalidInput);
  expect(result.valid).toBe(false);
  expect(result.allErrors).toContain(expect.stringContaining('Date overlap'));
});
```

## Common Pitfalls

❌ **Don't skip validation**
```typescript
// BAD: Creating without validation
await prisma.license.create({ data: input });
```

✅ **Always validate first**
```typescript
// GOOD: Validate before creating
const validation = await licenseValidationService.validateLicense(input);
if (!validation.valid) throw new Error(validation.allErrors.join(', '));
await prisma.license.create({ data: input });
```

❌ **Don't ignore warnings**
```typescript
// BAD: Only checking errors
if (!result.valid) { /* handle */ }
```

✅ **Show warnings to users**
```typescript
// GOOD: Display both errors and warnings
if (!result.valid) {
  showErrors(result.allErrors);
}
if (result.allWarnings.length > 0) {
  showWarnings(result.allWarnings);
}
```

## Debug Mode

Get detailed information about each check:

```typescript
const result = await licenseValidationService.validateLicense(input, { validateAll: true });

console.log('Date Overlap:', result.checks.dateOverlap);
console.log('Exclusivity:', result.checks.exclusivity);
console.log('Scope:', result.checks.scopeConflict);
console.log('Budget:', result.checks.budgetAvailability);
console.log('Ownership:', result.checks.ownershipVerification);
console.log('Approval:', result.checks.approvalRequirements);
```

## Need More Details?

See full documentation: `docs/modules/licensing/LICENSE_VALIDATION_IMPLEMENTATION.md`
