# License Validation - Frontend Integration Guide (Part 2: Business Logic & Validation Rules)

**Classification:** ⚡ HYBRID  
*License validation happens on both website (brand ↔ creator) and admin backend. Core logic is shared, admin has additional management tools.*

---

## Table of Contents

**Part 1:** API Endpoints & TypeScript Types  
**Part 2 (This Document):** Business Logic, Validation Rules & Error Handling  
**Part 3:** Implementation Examples & Checklist

---

## The Six Validation Checks

All licenses undergo six comprehensive validation checks. Each check can independently pass or fail, producing errors (blockers) or warnings (informational).

| Check | Purpose | Failure Impact |
|-------|---------|----------------|
| **1. Date Overlap** | Prevents conflicting license periods | ❌ Blocks creation |
| **2. Exclusivity** | Enforces exclusive license rules | ❌ Blocks creation |
| **3. Scope Conflict** | Ensures compatible usage scopes | ❌ Blocks creation |
| **4. Budget Availability** | Verifies brand budget limits | ❌ Blocks creation |
| **5. Ownership Verification** | Confirms valid IP ownership | ❌ Blocks creation |
| **6. Approval Requirements** | Determines required approvals | ℹ️ Informational only |

---

## 1. Date Overlap Validation

### Purpose
Ensures proposed license dates don't conflict with existing licenses for the same IP asset.

### Business Rules

**Basic Date Rules:**
- End date MUST be after start date
- Warns if start date is in the past (but doesn't block)

**Overlap Rules:**
- ✅ **Non-Exclusive + Non-Exclusive** = Allowed (with warning about scope verification)
- ❌ **Exclusive + Any** = BLOCKED
- ❌ **Any + Exclusive** = BLOCKED

### Validation Logic

```typescript
// Pseudocode
if (endDate <= startDate) {
  return error: "End date must be after start date"
}

if (startDate < now) {
  return warning: "License start date is in the past"
}

// Query existing licenses with date overlap
const overlapping = findLicenses({
  ipAssetId: input.ipAssetId,
  status: ['ACTIVE', 'PENDING_APPROVAL'],
  dateRange: overlaps(input.startDate, input.endDate)
})

for (const existing of overlapping) {
  if (input.licenseType === 'EXCLUSIVE' || existing.licenseType === 'EXCLUSIVE') {
    return error: "Date overlap conflict: exclusive license exists"
  }
  
  if (input.licenseType === 'NON_EXCLUSIVE' && existing.licenseType === 'NON_EXCLUSIVE') {
    return warning: "Non-exclusive license overlap detected - verify scope compatibility"
  }
}
```

### Error Messages

```typescript
// Hard Errors (Block Creation)
"End date must be after start date"
"Date overlap conflict: exclusive license exists for [Brand Name] from [start] to [end]"

// Warnings (Informational)
"License start date is in the past"
"Non-exclusive license overlap detected with [Brand Name] ([licenseId]). Verify scope compatibility."
```

### Frontend Behavior

**When to Validate:**
- On date picker change (debounced)
- Before showing "Create License" button
- On form submission

**How to Display:**
```typescript
if (result.checks.dateOverlap.errors.length > 0) {
  // Show red error banner
  // Disable "Create License" button
  // Display: "❌ Cannot create license: [error message]"
}

if (result.checks.dateOverlap.warnings.length > 0) {
  // Show yellow warning banner
  // Allow creation but show confirmation dialog
  // Display: "⚠️ Warning: [warning message]"
}
```

---

## 2. Exclusivity Checking

### Purpose
Validates that proposed license doesn't violate exclusivity rules.

### Exclusivity Types

| Type | Description | Overlap Rules |
|------|-------------|---------------|
| **EXCLUSIVE** | Full exclusive rights | Cannot overlap with ANY other license (same dates) |
| **EXCLUSIVE_TERRITORY** | Geographic exclusivity | Can overlap if territories don't conflict |
| **NON_EXCLUSIVE** | Shared rights | Can overlap with other non-exclusive licenses |

### Business Rules

**Full Exclusivity:**
```typescript
if (newLicense.type === 'EXCLUSIVE') {
  // ANY existing active license = conflict
  if (existingLicenses.length > 0) {
    return error: "Cannot grant exclusive license: [n] active licenses exist"
  }
}

if (existingLicense.type === 'EXCLUSIVE') {
  // Cannot create ANY new license during exclusive period
  return error: "Exclusive license conflict: [Brand] holds exclusive rights"
}
```

**Territory Exclusivity:**
```typescript
if (newLicense.type === 'EXCLUSIVE_TERRITORY' || existingLicense.type === 'EXCLUSIVE_TERRITORY') {
  const overlap = checkTerritoryOverlap(
    newLicense.scope.geographic.territories,
    existingLicense.scope.geographic.territories
  )
  
  if (overlap.length > 0) {
    return error: "Territory exclusivity conflict: [territories]"
  }
}
```

**Category Exclusivity:**
```typescript
// Scope-level exclusivity clause
if (newLicense.scope.exclusivity?.category && existingLicense.scope.exclusivity?.category) {
  if (newLicense.scope.exclusivity.category === existingLicense.scope.exclusivity.category) {
    return error: "Category exclusivity conflict in '[category]' category"
  }
}
```

**Competitor Blocking:**
```typescript
if (existingLicense.scope.exclusivity?.competitors?.includes(newLicense.brandId)) {
  return error: "Brand is blocked as a competitor by existing license"
}
```

### Territory Overlap Detection

```typescript
function checkTerritoryOverlap(territories1: string[], territories2: string[]): string[] {
  // GLOBAL always overlaps with everything
  if (territories1.includes('GLOBAL') || territories2.includes('GLOBAL')) {
    return ['GLOBAL'];
  }
  
  // Find intersection
  return territories1.filter(t => territories2.includes(t));
}
```

### Error Messages

```typescript
// Full Exclusivity Errors
"Exclusive license conflict: [Brand Name] holds exclusive rights during this period"
"Cannot grant exclusive license: [n] non-exclusive licenses already exist for [Brand Name] during this period"

// Territory Exclusivity Errors
"Territory exclusivity conflict: Overlapping territories with [Brand Name] ([territories])"
"Exclusive territory conflict with [Brand Name] in territories: [US, CA, MX]"

// Category Exclusivity Errors
"Category exclusivity conflict in 'Fashion' category with [Brand Name]"

// Competitor Blocking Errors
"Brand is blocked as a competitor by existing license for [Brand Name]"
```

### Frontend Behavior

**Real-Time Validation:**
```typescript
// When user selects license type
if (selectedType === 'EXCLUSIVE') {
  // Immediately check for ANY existing licenses
  const conflicts = await checkConflicts({ ...formData, licenseType: 'EXCLUSIVE' })
  
  if (conflicts.hasConflicts) {
    showWarning("Exclusive license not available for selected dates")
    disableExclusiveOption()
  }
}

// When user selects territories
if (selectedType === 'EXCLUSIVE_TERRITORY') {
  // Check as user adds/removes territories
  const conflicts = await checkConflicts({ ...formData })
  highlightConflictingTerritories(conflicts)
}
```

---

## 3. Scope Conflict Detection

### Purpose
Ensures media types, placements, and usage scopes are compatible with existing licenses.

### Required Scope Fields

**Minimum Requirements:**
```typescript
// At least ONE media type must be selected
if (!scope.media.digital && !scope.media.print && 
    !scope.media.broadcast && !scope.media.ooh) {
  return error: "At least one media type must be selected"
}

// At least ONE placement must be selected
if (!scope.placement.social && !scope.placement.website && 
    !scope.placement.email && !scope.placement.paid_ads && 
    !scope.placement.packaging) {
  return error: "At least one placement must be selected"
}
```

### Scope Overlap Detection

**Media Overlap:**
```typescript
const mediaOverlaps = [];
if (scope1.media.digital && scope2.media.digital) mediaOverlaps.push('digital');
if (scope1.media.print && scope2.media.print) mediaOverlaps.push('print');
if (scope1.media.broadcast && scope2.media.broadcast) mediaOverlaps.push('broadcast');
if (scope1.media.ooh && scope2.media.ooh) mediaOverlaps.push('out-of-home');

if (mediaOverlaps.length > 0) {
  return warning: "Media overlap with [Brand Name]: [digital, print]"
}
```

**Placement Overlap:**
```typescript
const placementOverlaps = [];
if (scope1.placement.social && scope2.placement.social) placementOverlaps.push('social');
if (scope1.placement.website && scope2.placement.website) placementOverlaps.push('website');
// ... etc

if (placementOverlaps.length > 0) {
  return warning: "Placement overlap with [Brand Name]: [social, website]"
}
```

**Complete Scope Duplication:**
```typescript
// If ALL media AND ALL placements match = complete overlap
if (isCompleteScopeOverlap(scope1, scope2)) {
  return error: "Complete scope conflict: Identical usage scope already licensed to [Brand Name]"
}
```

### Attribution Conflicts

```typescript
if (scope1.attribution?.required && scope2.attribution?.required) {
  if (scope1.attribution.format !== scope2.attribution.format) {
    return warning: "Different attribution formats required - may cause compliance issues"
  }
}
```

### Error Messages

```typescript
// Hard Errors
"At least one media type must be selected"
"At least one placement must be selected"
"Complete scope conflict: Identical usage scope already licensed to [Brand Name]"

// Warnings
"Media overlap with [Brand Name]: digital, print"
"Placement overlap with [Brand Name]: social, website, paid_ads"
"Different attribution formats required - may cause compliance issues"
```

### Frontend Behavior

**Interactive Scope Builder:**
```typescript
// As user toggles media/placement options
const onScopeChange = debounce(async (newScope: LicenseScope) => {
  // Validate minimum requirements
  if (!hasAtLeastOneMedia(newScope)) {
    showFieldError('media', 'Select at least one media type')
  }
  
  if (!hasAtLeastOnePlacement(newScope)) {
    showFieldError('placement', 'Select at least one placement')
  }
  
  // Check for scope conflicts
  const conflicts = await checkConflicts({ ...formData, scope: newScope })
  
  if (conflicts.hasConflicts) {
    highlightConflictingFields(conflicts)
  }
}, 500)
```

**Visual Indicators:**
```tsx
{/* Show which media types are already licensed */}
<Checkbox
  label="Digital"
  checked={scope.media.digital}
  onChange={...}
  helperText={
    existingLicenses.some(l => l.scope.media.digital) && 
    "⚠️ Already licensed to Acme Corp (non-exclusive)"
  }
/>
```

---

## 4. Budget Availability Check

### Purpose
Validates that brands have sufficient budget for license fees.

### Budget Limits by Verification Status

| Brand Status | Budget Limit | Enforcement |
|--------------|--------------|-------------|
| **Unverified** | $10,000 total | ❌ Hard limit (blocks creation) |
| **Verified** | No hard limit | ⚠️ Warning at $100,000+ |

### Validation Logic

```typescript
// Skip validation for zero-fee licenses
if (feeCents <= 0) {
  return warning: "License fee is $0 - budget validation skipped"
}

// Calculate committed budget from all active/pending licenses
const committedBudget = sum(existingLicenses.map(l => l.feeCents))

// Check brand verification status
if (!brand.isVerified) {
  const totalWithNew = committedBudget + feeCents
  if (totalWithNew > 1000000) { // $10,000 in cents
    return error: "Budget limit exceeded: Unverified brands limited to $10,000 total"
  }
} else {
  if (feeCents > 10000000) { // $100,000 in cents
    return warning: "High license fee: $[amount] requires additional approval"
  }
}
```

### Error Messages

```typescript
// Unverified Brand Errors
"Budget limit exceeded: Unverified brands are limited to $10,000 in total license fees. Current committed: $8,000, Requested: $5,000"

// Verified Brand Warnings
"High license fee: $150,000 requires additional approval"

// Zero-Fee Warnings
"License fee is $0 - budget validation skipped"
```

### Budget Response Details

```typescript
interface BudgetCheckDetails {
  brandId: string;
  brandName: string;
  isVerified: boolean;
  committedBudgetCents: number;
  committedBudgetDollars: number;
  requestedFeeCents: number;
  requestedFeeDollars: number;
  totalWithNewLicense: number;
  activeLicenseCount: number;
  pendingLicenseCount: number;
}
```

### Frontend Behavior

**Budget Calculator Widget:**
```tsx
<BudgetSummary>
  <BudgetRow>
    <Label>Current Committed:</Label>
    <Value>${committedBudget.toLocaleString()}</Value>
  </BudgetRow>
  <BudgetRow>
    <Label>This License:</Label>
    <Value>${requestedFee.toLocaleString()}</Value>
  </BudgetRow>
  <Divider />
  <BudgetRow total>
    <Label>Total:</Label>
    <Value className={exceedsLimit ? 'text-red-500' : ''}>
      ${totalBudget.toLocaleString()}
    </Value>
  </BudgetRow>
  {!brand.isVerified && (
    <BudgetLimit>
      Unverified brand limit: $10,000
      <Link to="/settings/verification">Get verified</Link> to increase limit
    </BudgetLimit>
  )}
</BudgetSummary>
```

**Real-Time Budget Check:**
```typescript
const onFeeChange = debounce(async (newFeeCents: number) => {
  const validation = await validateBudget({
    brandId,
    feeCents: newFeeCents
  })
  
  if (!validation.passed) {
    showBudgetExceededError(validation.errors[0])
    disableSubmitButton()
  }
}, 500)
```

---

## 5. Ownership Verification

### Purpose
Validates that the IP asset has complete and valid ownership structure.

### Ownership Requirements

**Asset Status:**
```typescript
// Asset must be in licensable status
const licensableStatuses = ['PUBLISHED', 'APPROVED']
if (!licensableStatuses.includes(asset.status)) {
  return error: "IP asset must be in PUBLISHED or APPROVED status (current: [status])"
}

// Asset must not be deleted
if (asset.deletedAt) {
  return error: "Cannot license a deleted IP asset"
}
```

**Ownership Structure:**
```typescript
// Must have at least one ownership record
if (asset.ownerships.length === 0) {
  return error: "IP asset has no ownership records - cannot license"
}

// Total shares must equal exactly 100%
const totalShares = sum(ownerships.map(o => o.shareBps))
if (totalShares !== 10000) { // 10000 basis points = 100%
  return error: "Invalid ownership structure: Total shares must equal 100% (current: [n]%)"
}

// Must have at least one primary owner
const primaryOwners = ownerships.filter(o => o.ownershipType === 'PRIMARY')
if (primaryOwners.length === 0) {
  return error: "IP asset must have at least one primary owner"
}
```

**Creator Account Status:**
```typescript
// All creators must have active accounts
for (const ownership of ownerships) {
  if (ownership.creator.user.deleted_at) {
    return error: "Creator [name] has been deleted - cannot license"
  }
  
  if (!ownership.creator.user.isActive) {
    return warning: "Creator [name] account is inactive"
  }
}
```

**Disputed Ownership:**
```typescript
// No disputed ownership records allowed
const disputed = ownerships.filter(o => o.disputed)
if (disputed.length > 0) {
  return error: "Ownership is disputed - cannot license until disputes are resolved ([n] disputed record(s))"
}
```

**Documentation (High-Value Licenses):**
```typescript
// For licenses >= $5,000, warn about missing docs
if (feeCents >= 500000) {
  const missingDocs = ownerships.filter(o => !o.contractReference && !o.legalDocUrl)
  if (missingDocs.length > 0) {
    return warning: "High-value license: [n] ownership record(s) missing legal documentation"
  }
}
```

### Error Messages

```typescript
// Asset Status Errors
"IP asset must be in PUBLISHED or APPROVED status (current: DRAFT)"
"Cannot license a deleted IP asset"

// Ownership Structure Errors
"IP asset has no ownership records - cannot license"
"Invalid ownership structure: Total shares must equal 100% (current: 75%)"
"IP asset must have at least one primary owner"

// Creator Status Errors
"Creator Jane Doe has been deleted - cannot license"

// Ownership Warnings
"Creator John Smith account is inactive"

// Dispute Errors
"Ownership is disputed - cannot license until disputes are resolved (2 disputed ownership record(s))"

// Documentation Warnings
"High-value license: 1 ownership record(s) missing legal documentation"

// Derivative Work Warnings
"This is a derivative work - ensure parent asset ownership is also valid"
```

### Ownership Response Details

```typescript
interface OwnershipCheckDetails {
  assetId: string;
  assetTitle: string;
  assetStatus: string;
  totalOwners: number;
  primaryOwners: number;
  totalShareBps: number;
  totalSharePercent: number;
  hasDisputes: boolean;
  owners: Array<{
    creatorId: string;
    creatorName: string;
    shareBps: number;
    sharePercent: number;
    ownershipType: 'PRIMARY' | 'SECONDARY';
    isActive: boolean;
    hasDocumentation: boolean;
    disputed: boolean;
  }>;
}
```

### Frontend Behavior

**Ownership Verification Display:**
```tsx
<OwnershipSummary>
  <Header>IP Asset Ownership</Header>
  
  {ownership.details.owners.map(owner => (
    <OwnerRow key={owner.creatorId}>
      <Avatar src={owner.avatar} />
      <Name>{owner.creatorName}</Name>
      <Share>{owner.sharePercent}%</Share>
      <Badges>
        {owner.ownershipType === 'PRIMARY' && <Badge>Primary</Badge>}
        {owner.disputed && <Badge variant="danger">Disputed</Badge>}
        {!owner.isActive && <Badge variant="warning">Inactive</Badge>}
        {!owner.hasDocumentation && feeCents >= 500000 && (
          <Badge variant="warning">Missing Docs</Badge>
        )}
      </Badges>
    </OwnerRow>
  ))}
  
  <TotalRow>
    <Label>Total Ownership:</Label>
    <Value className={ownership.details.totalSharePercent !== 100 ? 'text-red-500' : ''}>
      {ownership.details.totalSharePercent}%
    </Value>
  </TotalRow>
  
  {ownership.errors.length > 0 && (
    <Alert variant="error">
      ❌ Cannot license: {ownership.errors.join(', ')}
    </Alert>
  )}
</OwnershipSummary>
```

---

## 6. Approval Requirement Checks

### Purpose
Determines if additional approvals are required based on business rules. **This check never fails validation** - it's purely informational.

### Approval Triggers

| Trigger | Approvers Required |
|---------|-------------------|
| **All Licenses** | Creator approval (always) |
| **Fee ≥ $10,000** | Admin approval |
| **Exclusive License** | Creator + Admin |
| **Unverified Brand** | Admin approval |
| **Global Territory + Exclusive** | Admin review |
| **Duration > 1 year** | Flagged for review |
| **Hybrid Pricing** (Fee + Rev Share) | Flagged for review |

### Validation Logic

```typescript
const approvalRequirement = {
  required: false,
  reasons: [],
  approvers: []
}

// Rule 1: High-value licenses
if (feeCents >= 1000000) { // $10,000
  approvalRequirement.required = true
  approvalRequirement.reasons.push("High-value license requires admin approval")
  approvalRequirement.approvers.push({ type: 'admin' })
}

// Rule 2: Exclusive licenses
if (licenseType === 'EXCLUSIVE' || licenseType === 'EXCLUSIVE_TERRITORY') {
  approvalRequirement.required = true
  approvalRequirement.reasons.push("Exclusive licenses require creator and admin approval")
  approvalRequirement.approvers.push({ type: 'creator' }, { type: 'admin' })
}

// Rule 3: Unverified brands
if (!brand.isVerified) {
  approvalRequirement.required = true
  approvalRequirement.reasons.push("Unverified brands require admin approval")
  approvalRequirement.approvers.push({ type: 'admin' })
}

// Rule 4: Creator approval (always)
approvalRequirement.required = true
approvalRequirement.reasons.push("Creator approval required for all licenses")
for (const ownership of asset.ownerships) {
  approvalRequirement.approvers.push({
    type: 'creator',
    userId: ownership.creator.userId,
    name: ownership.creator.user.name
  })
}

// Rule 5: Global exclusive
if (scope.geographic?.territories.includes('GLOBAL') && licenseType === 'EXCLUSIVE') {
  approvalRequirement.warnings.push("Global exclusive license requires admin review")
}

// Rule 6: Long duration
const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24)
if (durationDays > 365) {
  approvalRequirement.warnings.push(`Long-duration license (${durationDays} days) may require additional approval`)
}

// Rule 7: Hybrid pricing
if (revShareBps > 0 && feeCents > 0) {
  approvalRequirement.warnings.push("Hybrid pricing model requires careful review")
}
```

### Approval Response Details

```typescript
interface ApprovalRequirementDetails {
  approvalRequired: boolean;
  reasons: string[];
  approvers: Array<{
    type: 'creator' | 'brand' | 'admin';
    userId?: string;
    name?: string;
  }>;
  brandVerified: boolean;
  brandVerificationStatus: string;
  licenseType: string;
  feeCents: number;
  durationDays: number;
}
```

### Frontend Behavior

**Approval Workflow Display:**
```tsx
<ApprovalWorkflow>
  <Header>Required Approvals</Header>
  
  {approvalDetails.approvers.map((approver, idx) => (
    <ApprovalStep key={idx} completed={false}>
      <StepNumber>{idx + 1}</StepNumber>
      <StepContent>
        <ApproverType>{approver.type.toUpperCase()}</ApproverType>
        {approver.name && <ApproverName>{approver.name}</ApproverName>}
      </StepContent>
    </ApprovalStep>
  ))}
  
  <ReasonsList>
    <Header>Why approvals are required:</Header>
    {approvalDetails.reasons.map((reason, idx) => (
      <Reason key={idx}>• {reason}</Reason>
    ))}
  </ReasonsList>
  
  <SubmitButton>
    Submit for Approval
  </SubmitButton>
</ApprovalWorkflow>
```

---

## Next Steps

Continue to **Part 3** for:
- Complete implementation examples with React Query
- Form validation patterns
- Error handling strategies
- Frontend implementation checklist
- Testing recommendations

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-14  
**Classification:** ⚡ HYBRID
