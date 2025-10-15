# Royalty Run Service - Quick Reference for New Features

## New Methods Added

### 1. Rollback Run
```typescript
await royaltyCalculationService.rollbackRun(
  runId: string,
  reason: string,
  userId: string,
  archiveData?: boolean
);
```

**Purpose**: Rollback a locked royalty run to DRAFT status for recalculation

**Requirements**:
- User must have ADMIN role
- Run status must be LOCKED or CALCULATED
- No payments can be processed
- Reason must be 20-1000 characters

**Example**:
```typescript
await service.rollbackRun(
  'cln123abc',
  'Incorrect ownership data discovered for Asset XYZ. Correcting ownership splits and recalculating.',
  adminUserId,
  true // Archive original data
);
```

---

### 2. Get Run Validation Report
```typescript
const report = await royaltyCalculationService.getRunValidationReport(
  runId: string
);
```

**Purpose**: Generate comprehensive validation report for administrator review

**Returns**: `RoyaltyRunValidationReport` with:
- Overall validity status
- List of errors (blocking issues)
- List of warnings (review items)
- Summary statistics
- Revenue/earnings breakdown
- Outlier detection
- Individual validation checks

**Example**:
```typescript
const report = await service.getRunValidationReport('cln123abc');

if (!report.isValid) {
  console.error('Validation failed:', report.errors);
}

report.validationChecks.forEach(check => {
  console.log(`${check.passed ? '✅' : '❌'} ${check.check}`);
});
```

---

### 3. Review Run
```typescript
await royaltyCalculationService.reviewRun(
  runId: string,
  approve: boolean,
  reviewNotes: string | undefined,
  userId: string
);
```

**Purpose**: Administrator review and approval workflow

**Behavior**:
- If `approve: true` → Automatically locks the run
- If `approve: false` → Adds notes but keeps status CALCULATED

**Example**:
```typescript
// Approve and lock
await service.reviewRun(
  'cln123abc',
  true,
  'All validation checks passed. Revenue totals verified against license data.',
  adminUserId
);

// Reject for correction
await service.reviewRun(
  'cln123abc',
  false,
  'High earnings outlier detected for Creator XYZ. Verify ownership data before locking.',
  adminUserId
);
```

---

## New Validation Schemas

### Rollback Run Schema
```typescript
import { rollbackRunSchema, type RollbackRunInput } from './schemas/royalty.schema';

const input: RollbackRunInput = {
  runId: 'cln123abc',
  reason: 'Detailed explanation of why rollback is needed (min 20 chars)',
  archiveData: true, // Optional, defaults to true
};
```

### Review Run Schema
```typescript
import { reviewRunSchema, type ReviewRunInput } from './schemas/royalty.schema';

const input: ReviewRunInput = {
  runId: 'cln123abc',
  approve: true,
  reviewNotes: 'Optional notes about the review decision',
};
```

### Validation Report Schema
```typescript
import { 
  getRunValidationReportSchema, 
  type GetRunValidationReportInput 
} from './schemas/royalty.schema';

const input: GetRunValidationReportInput = {
  runId: 'cln123abc',
};
```

---

## New Error Classes

### RoyaltyRunAlreadyPaidError
```typescript
throw new RoyaltyRunAlreadyPaidError(runId);
// Message: "Cannot rollback run {runId} because payments have already been processed."
// Code: 412 (PRECONDITION_FAILED)
```

### RoyaltyRunRollbackError
```typescript
throw new RoyaltyRunRollbackError(message, details);
// Message: "Rollback failed: {message}"
// Code: 500 (INTERNAL_SERVER_ERROR)
```

### InsufficientRollbackPermissionsError
```typescript
throw new InsufficientRollbackPermissionsError(userId);
// Message: "User {userId} does not have permission to rollback royalty runs."
// Code: 403 (FORBIDDEN)
```

---

## New TypeScript Types

### RoyaltyRunValidationReport
```typescript
interface RoyaltyRunValidationReport {
  runId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  isValid: boolean;
  warnings: string[];
  errors: string[];
  summary: {
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    statementCount: number;
    licenseCount: number;
    creatorCount: number;
    disputedStatements: number;
  };
  breakdown: {
    revenueByAsset: Array<{
      assetId: string;
      assetTitle: string;
      revenueCents: number;
    }>;
    earningsByCreator: Array<{
      creatorId: string;
      creatorName: string;
      earningsCents: number;
      status: string;
    }>;
    outliers: Array<{
      type: string;
      message: string;
      details: any;
    }>;
  };
  validationChecks: Array<{
    check: string;
    passed: boolean;
    message?: string;
  }>;
}
```

### RollbackAuditEntry
```typescript
interface RollbackAuditEntry {
  timestamp: string;
  reason: string;
  originalState: {
    status: string;
    lockedAt: Date | null;
    processedAt: Date | null;
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    statementCount: number;
    statements: Array<{
      id: string;
      creatorId: string;
      totalEarningsCents: number;
      status: string;
      lineCount: number;
    }>;
  };
  operation: 'rollback';
  performedBy: string;
}
```

---

## Validation Checks Performed

The `getRunValidationReport()` method performs these automated checks:

### 1. Mathematical Consistency ✓
- Verifies total royalties = sum of all statements
- Detects calculation discrepancies

### 2. Ownership Integrity ✓
- Validates all IP assets have complete ownership (10000 bps)
- Identifies incomplete or overlapping ownership splits

### 3. Period Boundary Validation ✓
- Ensures all line items within run period boundaries
- Flags anomalous date ranges

### 4. Dispute Resolution ✓
- Blocks locking if disputed statements exist
- Lists all unresolved disputes

### 5. Non-Negative Amounts ✓
- Validates no negative earnings
- Identifies potential calculation errors

---

## Complete Workflow Example

```typescript
import { RoyaltyCalculationService } from '@/modules/royalties';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/db/redis';
import { AuditService } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);
const royaltyService = new RoyaltyCalculationService(prisma, redis, auditService);

// Step 1: Create Run
const runId = await royaltyService.createRun(
  new Date('2025-01-01'),
  new Date('2025-01-31'),
  'January 2025 Royalties',
  adminUserId
);

// Step 2: Calculate
await royaltyService.calculateRun(runId, adminUserId);

// Step 3: Validate
const report = await royaltyService.getRunValidationReport(runId);

// Step 4: Review Report
if (!report.isValid) {
  console.error('❌ Validation Failed:');
  report.errors.forEach(err => console.error('  -', err));
  
  // Either rollback or fix issues
  await royaltyService.rollbackRun(
    runId,
    'Validation failed due to: ' + report.errors.join('; '),
    adminUserId
  );
  return;
}

if (report.warnings.length > 0) {
  console.warn('⚠️  Warnings to Review:');
  report.warnings.forEach(warn => console.warn('  -', warn));
}

// Step 5: Review Validation Checks
console.log('\n📋 Validation Checks:');
report.validationChecks.forEach(check => {
  const icon = check.passed ? '✅' : '❌';
  console.log(`${icon} ${check.check}: ${check.message || ''}`);
});

// Step 6: Review Breakdown
console.log('\n💰 Revenue by Asset:');
report.breakdown.revenueByAsset.forEach(asset => {
  console.log(`  ${asset.assetTitle}: $${(asset.revenueCents / 100).toFixed(2)}`);
});

console.log('\n👥 Earnings by Creator:');
report.breakdown.earningsByCreator.forEach(creator => {
  console.log(`  ${creator.creatorName}: $${(creator.earningsCents / 100).toFixed(2)} [${creator.status}]`);
});

// Step 7: Check for Outliers
if (report.breakdown.outliers.length > 0) {
  console.log('\n⚠️  Outliers Detected:');
  report.breakdown.outliers.forEach(outlier => {
    console.log(`  ${outlier.type}: ${outlier.message}`);
  });
}

// Step 8: Admin Review & Approve
await royaltyService.reviewRun(
  runId,
  true, // approve
  'All validation checks passed. Revenue verified against source data. Outliers reviewed and confirmed accurate.',
  adminUserId
);
// Run is now LOCKED automatically

// ========================================
// If issues found after locking:
// ========================================

// Step 9: Rollback if needed
const needsCorrection = false; // Example flag
if (needsCorrection) {
  await royaltyService.rollbackRun(
    runId,
    'Discovered incorrect ownership percentage for Asset ABC. Original split was 50/50 but should be 60/40. Rolling back to correct ownership data and recalculate.',
    adminUserId,
    true // Archive the original calculation
  );
  
  // Fix the data issue
  // await fixOwnershipData();
  
  // Recalculate
  await royaltyService.calculateRun(runId, adminUserId);
  
  // Re-validate and review
  // ... repeat validation process
}

// Step 10: Proceed to payout (future implementation)
// await royaltyPayoutService.initiatePayouts(runId, adminUserId);
```

---

## Audit Events

New audit events logged:

### royalty.run.reviewed_and_approved
```typescript
{
  action: 'royalty.run.reviewed_and_approved',
  userId: string,
  entityType: 'royalty_run',
  entityId: runId,
  after: {
    approved: true,
    reviewNotes: string,
    reviewedAt: Date
  }
}
```

### royalty.run.reviewed_and_rejected
```typescript
{
  action: 'royalty.run.reviewed_and_rejected',
  userId: string,
  entityType: 'royalty_run',
  entityId: runId,
  after: {
    approved: false,
    reviewNotes: string,
    reviewedAt: Date
  }
}
```

### royalty.run.rolled_back
```typescript
{
  action: 'royalty.run.rolled_back',
  userId: string,
  entityType: 'royalty_run',
  entityId: runId,
  before: {
    status: string,
    lockedAt: Date,
    totalRevenueCents: number,
    totalRoyaltiesCents: number,
    statementCount: number,
    statements: [...]
  },
  after: {
    status: 'DRAFT',
    reason: string,
    rollbackTimestamp: Date
  }
}
```

---

## Permission Requirements

### Rollback Operation
- **Required Role**: `ADMIN`
- **Check Location**: `validateRollbackRun()` method
- **Error**: `InsufficientRollbackPermissionsError`

### Review Operation
- **Required Role**: Any admin user (implementation-dependent)
- **Best Practice**: Should be restricted to `ADMIN` role in router/controller

---

## Cache Management

### Cache Keys Invalidated on Rollback
```typescript
await this.redis.del(`royalty_run:${runId}`);
await this.redis.del(`royalty_statement:${statementId}`); // For each statement
```

### Cache Keys Used
- `royalty_run:${runId}` - Run details
- `royalty_statement:${statementId}` - Statement details

---

## Database Changes

No schema changes required - all functionality uses existing tables:
- `royalty_runs`
- `royalty_statements`
- `royalty_lines`

Archive data stored in `royalty_runs.notes` field as JSON.

---

## Error Handling Best Practices

```typescript
try {
  await royaltyService.rollbackRun(runId, reason, userId);
} catch (error) {
  if (error instanceof RoyaltyRunNotFoundError) {
    // Run doesn't exist
  } else if (error instanceof RoyaltyRunAlreadyPaidError) {
    // Cannot rollback - payments processed
  } else if (error instanceof InsufficientRollbackPermissionsError) {
    // User lacks ADMIN role
  } else if (error instanceof RoyaltyRunRollbackError) {
    // Rollback operation failed
    console.error('Rollback failed:', error.cause);
  } else {
    // Unexpected error
    throw error;
  }
}
```

---

## Testing Checklist

### Unit Tests
- ✓ Rollback validation logic
- ✓ Permission checking
- ✓ Archive data structure
- ✓ Validation report generation
- ✓ Mathematical consistency checks
- ✓ Outlier detection algorithms

### Integration Tests
- ✓ Complete rollback workflow
- ✓ Review and approval flow
- ✓ Rollback then recalculate
- ✓ Archive data retrieval
- ✓ Cache invalidation
- ✓ Audit logging

### Edge Cases
- ✓ Rollback already-paid run (should fail)
- ✓ Rollback without ADMIN role (should fail)
- ✓ Review disputed run (should fail lock)
- ✓ Validation with zero statements
- ✓ Outlier detection with small dataset
- ✓ Concurrent rollback attempts

---

## Migration Notes

### Existing Systems
No migration required - these are new features that extend existing functionality.

### Backward Compatibility
All existing methods remain unchanged. New methods are additive.

---

## Performance Impact

### Validation Report
- Complexity: O(n) where n = number of statements
- Database queries: 1 main query + 1 per unique asset for ownership check
- Memory: Proportional to statement/line count
- Recommended: Cache reports for large runs

### Rollback Operation
- Complexity: O(n) where n = number of statements + lines
- Database operations: Atomic transaction with deletes and update
- Cache operations: O(n) invalidations

---

## Future tRPC Router Integration

When creating tRPC procedures, use these schemas:

```typescript
// In royalties.router.ts

import {
  rollbackRunSchema,
  reviewRunSchema,
  getRunValidationReportSchema,
} from './schemas/royalty.schema';

// Rollback procedure
rollbackRun: adminProcedure
  .input(rollbackRunSchema)
  .mutation(async ({ input, ctx }) => {
    await royaltyService.rollbackRun(
      input.runId,
      input.reason,
      ctx.user.id,
      input.archiveData
    );
    return { success: true };
  }),

// Review procedure
reviewRun: adminProcedure
  .input(reviewRunSchema)
  .mutation(async ({ input, ctx }) => {
    await royaltyService.reviewRun(
      input.runId,
      input.approve,
      input.reviewNotes,
      ctx.user.id
    );
    return { success: true };
  }),

// Validation report procedure
getRunValidationReport: adminProcedure
  .input(getRunValidationReportSchema)
  .query(async ({ input }) => {
    return await royaltyService.getRunValidationReport(input.runId);
  }),
```
