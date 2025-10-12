# License Validation Implementation

## Overview

This document describes the comprehensive license validation system implemented for the YES GODDESS backend. The validation service ensures that all licenses meet business requirements and prevent conflicts before creation or modification.

## Architecture

### Main Service
**File**: `src/modules/licenses/services/licenseValidationService.ts`

The `LicenseValidationService` provides six core validation checks that run before any license is created or updated:

1. **Date Overlap Validation**
2. **Exclusivity Checking**
3. **Scope Conflict Detection**
4. **Budget Availability Check**
5. **Ownership Verification**
6. **Approval Requirement Checks**

## Validation Checks

### 1. Date Overlap Validation

**Purpose**: Ensures proposed license dates don't conflict with existing licenses.

**What it checks**:
- End date must be after start date
- Warns if start date is in the past
- Detects overlapping date ranges with existing licenses
- Allows non-exclusive licenses to coexist (with warnings)
- Blocks exclusive/non-exclusive overlaps

**Business Rules**:
- Non-exclusive + Non-exclusive = Allowed with warning
- Exclusive + Any = Blocked
- Any + Exclusive = Blocked

**Example Error**:
```
Date overlap conflict: exclusive license exists for Acme Corp from 2025-06-01 to 2025-12-31
```

### 2. Exclusivity Checking

**Purpose**: Validates that exclusivity rules are not violated.

**What it checks**:
- Exclusive licenses cannot overlap with any other license
- Territory-exclusive licenses check for geographic overlap
- Category exclusivity (fashion, beauty, etc.)
- Competitor blocking clauses

**Exclusivity Types**:
- **EXCLUSIVE**: Full exclusive rights (no other licenses allowed)
- **EXCLUSIVE_TERRITORY**: Geographic exclusivity (checks territory overlap)
- **NON_EXCLUSIVE**: Can coexist with other non-exclusive licenses

**Example Error**:
```
Exclusive license conflict: Acme Corp holds exclusive rights during this period
```

### 3. Scope Conflict Detection

**Purpose**: Ensures scope compatibility between licenses.

**What it checks**:
- At least one media type is selected (digital, print, broadcast, ooh)
- At least one placement is selected (social, website, email, paid_ads, packaging)
- Media/placement overlaps with existing licenses
- Complete scope duplication (identical usage rights)
- Attribution requirement conflicts
- Cutdown permissions (aspect ratios, duration limits)

**Example Warning**:
```
Media overlap with Acme Corp: digital, print
```

**Example Error**:
```
Complete scope conflict: Identical usage scope already licensed to Acme Corp
```

### 4. Budget Availability Check

**Purpose**: Ensures brands have sufficient budget for license fees.

**What it checks**:
- Skips validation for zero-fee licenses
- Calculates total committed budget from active/pending licenses
- Enforces limits for unverified brands ($10,000 total limit)
- Warns for high-value licenses from verified brands ($100,000+)

**Budget Limits**:
- **Unverified Brands**: $10,000 total license fees (hard limit)
- **Verified Brands**: No hard limit, warnings at $100,000+

**Example Error**:
```
Budget limit exceeded: Unverified brands are limited to $10,000 in total license fees. 
Current committed: $8,000, Requested: $5,000
```

### 5. Ownership Verification

**Purpose**: Validates IP asset has complete and valid ownership structure.

**What it checks**:
- IP asset exists and is not deleted
- Asset status is PUBLISHED or APPROVED
- At least one ownership record exists
- Total ownership shares equal exactly 100%
- At least one primary owner exists
- All creators have active accounts
- No disputed ownership records
- Documentation exists for high-value licenses ($5,000+)
- Handles derivative works appropriately

**Example Error**:
```
Invalid ownership structure: Total shares must equal 100% (current: 75%)
```

```
Ownership is disputed - cannot license until disputes are resolved (1 disputed ownership record(s))
```

### 6. Approval Requirement Checks

**Purpose**: Determines if additional approvals are required based on business rules.

**What it checks**:
- Always informational (doesn't fail validation)
- Returns approval requirements and reasons

**Approval Triggers**:
1. **High-value licenses**: Fees ≥ $10,000 require admin approval
2. **Exclusive licenses**: Always require creator + admin approval
3. **Unverified brands**: All licenses require admin approval
4. **Creator approval**: Required for all licenses by default
5. **Global territory**: Flagged for additional scrutiny
6. **Long duration**: Licenses > 1 year flagged for review
7. **Hybrid pricing**: Fixed fee + revenue share flagged for review

**Example Result**:
```json
{
  "approvalRequired": true,
  "reasons": [
    "High-value license ($15,000) requires admin approval",
    "Creator approval required for all licenses"
  ],
  "approvers": [
    { "type": "creator", "userId": "user-123", "name": "Jane Creator" },
    { "type": "admin" }
  ]
}
```

## API Usage

### Comprehensive Validation

Validates all six checks and returns complete results:

```typescript
import { licenseValidationService } from '@/modules/licenses';

const result = await licenseValidationService.validateLicense(
  {
    ipAssetId: 'asset-123',
    brandId: 'brand-456',
    licenseType: 'NON_EXCLUSIVE',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    scope: {
      media: { digital: true, print: false, broadcast: false, ooh: false },
      placement: { social: true, website: true, email: false, paid_ads: false, packaging: false },
      geographic: { territories: ['US', 'CA'] }
    },
    feeCents: 100000, // $1,000
    revShareBps: 500, // 5%
  },
  { validateAll: true } // Continue validating even if checks fail
);

if (!result.valid) {
  console.error('Validation errors:', result.allErrors);
  console.warn('Validation warnings:', result.allWarnings);
  return;
}

console.log('Approval required?', result.checks.approvalRequirements.details?.approvalRequired);
```

### Individual Validation Checks

You can also run individual validation checks:

```typescript
// Date overlap only
const dateCheck = await licenseValidationService.validateDateOverlap(input);

// Exclusivity only
const exclusivityCheck = await licenseValidationService.validateExclusivity(input);

// Ownership only
const ownershipCheck = await licenseValidationService.validateOwnership(input);
```

### Integration with License Service

The validation service is integrated into the main `LicenseService`:

```typescript
import { LicenseService } from '@/modules/licenses';

const licenseService = new LicenseService();

// Comprehensive validation before creation
const validation = await licenseService.validateLicenseComprehensive(licenseInput);

if (!validation.valid) {
  throw new Error(`License validation failed: ${validation.errors.join(', ')}`);
}

// If valid, proceed with creation
const license = await licenseService.createLicense(licenseInput, userId);
```

## Response Structure

### ValidationCheck (Individual Check)
```typescript
interface ValidationCheck {
  passed: boolean;          // Whether the check passed
  errors: string[];         // Array of error messages
  warnings: string[];       // Array of warning messages
  details?: any;           // Additional check-specific details
}
```

### LicenseValidationResult (Complete)
```typescript
interface LicenseValidationResult {
  valid: boolean;                              // Overall validation result
  checks: {
    dateOverlap: ValidationCheck;
    exclusivity: ValidationCheck;
    scopeConflict: ValidationCheck;
    budgetAvailability: ValidationCheck;
    ownershipVerification: ValidationCheck;
    approvalRequirements: ValidationCheck;
  };
  allErrors: string[];                        // All errors from all checks
  allWarnings: string[];                      // All warnings from all checks
  conflicts: Conflict[];                      // Detailed conflict information
}
```

## Error Handling

The validation service handles errors gracefully:

1. **Database errors**: Caught and returned as validation errors
2. **Missing data**: Returns specific error messages
3. **Type casting**: Uses safe type conversions with `unknown`
4. **Null handling**: All nullable fields checked before use

## Performance Considerations

### Query Optimization
- Date range queries use indexed fields (`startDate`, `endDate`, `status`)
- Single queries fetch all needed data with includes
- Reuses query results across multiple checks

### Short-circuiting
- By default, stops at first failed check (fast fail)
- `validateAll: true` option runs all checks for complete feedback
- Recommended: Use fast fail in production, validateAll in UX/debugging

### Caching Opportunities
Future optimization: Cache validation results for identical inputs within same request lifecycle.

## Testing

Comprehensive test suite: `src/__tests__/modules/licenses/license-validation.test.ts`

**Test Coverage**:
- ✅ Date overlap validation (5 tests)
- ✅ Exclusivity checking (4 tests)
- ✅ Scope conflict detection (4 tests)
- ✅ Budget availability (4 tests)
- ✅ Ownership verification (7 tests)
- ✅ Approval requirements (5 tests)
- ✅ Comprehensive validation (3 tests)

**Run tests**:
```bash
npm test -- license-validation.test.ts
```

## Integration Points

### Called By
- `LicenseService.createLicense()` - Before creating new licenses
- `LicenseService.validateLicenseComprehensive()` - Explicit validation endpoint
- `licenseGenerationService` - Enhanced creation workflow
- tRPC endpoints - License creation/update procedures

### Dependencies
- **Prisma**: Database queries for licenses, brands, assets, ownerships
- **LicenseScope type**: From `types.ts`
- **Conflict types**: From `types.ts`

## Future Enhancements

### Planned Improvements
1. **Configurable Rules**: Make approval thresholds configurable per environment
2. **Rule Engine**: Extract validation rules to configuration for easier modification
3. **Validation Caching**: Cache validation results for performance
4. **Async Validation**: Support async validation for external API checks
5. **Custom Validators**: Allow projects to register custom validation rules
6. **Validation History**: Track validation attempts for analytics

### Extensibility
To add a new validation check:

1. Add method to `LicenseValidationService`:
```typescript
async validateNewCheck(input: LicenseValidationInput): Promise<ValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Your validation logic here
  
  return { passed: errors.length === 0, errors, warnings };
}
```

2. Add to `validateLicense()` method
3. Update `LicenseValidationResult` type
4. Add tests

## Best Practices

### For API Consumers
1. **Always validate before creation**: Never skip validation
2. **Handle all errors**: Display all errors to users, not just the first
3. **Show warnings**: Inform users of potential issues even if validation passes
4. **Display approval requirements**: Make it clear what approvals are needed

### For Developers
1. **Provide detailed errors**: Include relevant IDs, dates, and amounts in error messages
2. **Return structured data**: Include `details` object for programmatic access
3. **Test edge cases**: Boundary conditions, null values, missing data
4. **Document business rules**: Comment why rules exist, not just what they do

## Troubleshooting

### Common Issues

**Issue**: "Total shares must equal 100%"
- **Cause**: IP ownership records don't sum to 10000 basis points
- **Fix**: Verify all ownership records, ensure no missing/extra shares

**Issue**: "Budget limit exceeded"
- **Cause**: Unverified brand requesting license that exceeds $10,000 total
- **Fix**: Complete brand verification or reduce license fees

**Issue**: "Ownership is disputed"
- **Cause**: One or more ownership records marked as disputed
- **Fix**: Resolve disputes in ownership management before licensing

**Issue**: "Exclusive license conflict"
- **Cause**: Attempting to create license during exclusive period
- **Fix**: Wait until exclusive license expires or negotiate with existing licensee

## Monitoring

### Key Metrics to Track
- Validation failure rate by check type
- Most common validation errors
- Average validation execution time
- Licenses requiring approval vs. auto-approved

### Logging
Validation results are automatically logged. Monitor for:
- High validation failure rates (may indicate UX issues)
- Specific error patterns (may indicate data quality issues)
- Performance degradation (may indicate need for optimization)

## Support

For questions or issues with license validation:
1. Check this documentation
2. Review test cases for examples
3. Examine validation service source code
4. Contact backend team for business rule clarifications
