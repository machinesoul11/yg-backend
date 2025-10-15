# Royalty Run Service - Complete Implementation

## Overview

The Royalty Run Service is a comprehensive system for calculating and distributing creator royalties from license revenue. This implementation includes all seven required tasks:

1. ✅ **Royalty Run Initialization**
2. ✅ **Revenue Data Collection**
3. ✅ **Calculation Execution**
4. ✅ **Statement Generation**
5. ✅ **Validation and Review Process** (NEW)
6. ✅ **Locking Mechanism**
7. ✅ **Run Rollback Capability** (NEW)

---

## Architecture

### Service Layer

**File**: `src/modules/royalties/services/royalty-calculation.service.ts`

The service implements the following core methods:

#### Initialization & Calculation
- `createRun(periodStart, periodEnd, notes, userId)` - Initialize new royalty run
- `calculateRun(runId, userId)` - Execute complete calculation engine
- `fetchActiveLicenses(tx, periodStart, periodEnd)` - Collect revenue data
- `calculateLicenseRevenue(license, periodStart, periodEnd)` - Pro-rate revenue

#### Validation & Review (NEW)
- `getRunValidationReport(runId)` - Generate comprehensive validation report
- `reviewRun(runId, approve, reviewNotes, userId)` - Admin review workflow
- `validateLockRun(runId)` - Pre-lock validation

#### Locking & Finalization
- `lockRun(runId, userId)` - Lock run to prevent modifications

#### Rollback & Recovery (NEW)
- `rollbackRun(runId, reason, userId, archiveData)` - Rollback locked runs
- `validateRollbackRun(run, userId)` - Validate rollback eligibility
- `archiveRollbackData(tx, runId, originalState, reason)` - Archive original data

---

## Task 1: Royalty Run Initialization ✅

### Implementation

The `createRun()` method creates a new royalty run with comprehensive validation:

```typescript
async createRun(
  periodStart: Date,
  periodEnd: Date,
  notes: string | undefined,
  userId: string
): Promise<string>
```

### Features

- **Period Validation**: Ensures end date > start date
- **Overlap Detection**: Prevents duplicate runs for same period
- **Audit Logging**: Complete trail of run creation
- **Initial State**: Creates run in DRAFT status with zero totals

### Database Record Created

```typescript
{
  periodStart: Date,
  periodEnd: Date,
  status: 'DRAFT',
  totalRevenueCents: 0,
  totalRoyaltiesCents: 0,
  notes: string?,
  createdBy: userId,
  createdAt: now(),
  updatedAt: now()
}
```

---

## Task 2: Revenue Data Collection ✅

### Implementation

The `fetchActiveLicenses()` and `calculateLicenseRevenue()` methods handle revenue aggregation:

### Revenue Sources

1. **Flat-Fee Licenses**: 
   - Revenue from `feeCents` field
   - Pro-rated based on days active in period
   - Calculated: `(feeCents / licenseDays) * overlappingDays`

2. **Revenue-Share Licenses**:
   - Based on `revShareBps` percentage
   - Aggregated from usage events/daily metrics
   - Future implementation: Real-time usage tracking

### Pro-Rating Logic

```typescript
// Calculate overlap between license period and royalty period
const overlapDays = calculateOverlapDays(
  license.startDate,
  license.endDate,
  periodStart,
  periodEnd
);

// Pro-rate revenue
const proratedRevenue = prorateRevenue(
  license.feeCents,
  licenseTotalDays,
  overlapDays
);
```

### Data Aggregation

- Revenue tracked by license
- Grouped by IP asset
- Associated with ownership splits
- Metadata stored for audit trail

---

## Task 3: Calculation Execution ✅

### Core Calculation Engine

The `calculateRun()` method implements:

1. **Revenue Distribution**
   - Fetches all active licenses in period
   - Calculates total revenue per license
   - Validates ownership splits (must sum to 10000 bps)

2. **Ownership Split Calculation**
   - Uses banker's rounding for precision
   - Largest remainder method for accurate distribution
   - Tracks pre/post rounding values for reconciliation

3. **Creator Earnings Aggregation**
   ```typescript
   creatorEarnings = Map<creatorId, {
     totalCents: number,
     unpaidBalanceCents: number,
     lines: RoyaltyLine[]
   }>
   ```

4. **Minimum Threshold Application**
   - Checks creator-specific minimum payout threshold
   - Accumulates balance below threshold
   - Carries forward to next period

### Precision Guarantees

- **Integer Arithmetic**: All calculations in cents
- **Banker's Rounding**: Consistent rounding strategy
- **Reconciliation**: Validates total rounding error within tolerance
- **Accurate Splits**: Uses largest remainder method to ensure exact distribution

### Transaction Safety

```typescript
await this.prisma.$transaction(async (tx) => {
  // All calculation steps
  // All statement creation
  // All line item creation
  // Run status update
}, {
  timeout: CALCULATION_ENGINE_CONFIG.calculationTimeoutMs
});
```

---

## Task 4: Statement Generation ✅

### Implementation

Statements are created within the calculation transaction:

```typescript
const statement = await tx.royaltyStatement.create({
  data: {
    royaltyRunId: runId,
    creatorId: creatorId,
    totalEarningsCents: accumulated.totalAccumulatedCents,
    status: accumulated.shouldPayout ? 'PENDING' : 'REVIEWED',
  },
});
```

### Line Items

Each statement includes detailed line items:

```typescript
await tx.royaltyLine.createMany({
  data: earnings.lines.map((line) => ({
    royaltyStatementId: statement.id,
    licenseId: line.licenseId,
    ipAssetId: line.ipAssetId,
    revenueCents: line.revenueCents,
    shareBps: line.shareBps,
    calculatedRoyaltyCents: line.calculatedRoyaltyCents,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    metadata: line.metadata,
  })),
});
```

### Special Line Types

1. **Carryover Lines**: Unpaid balance from previous periods
2. **Threshold Notes**: Explains why payment is deferred

### Statement Status Logic

- `PENDING`: Earnings meet threshold, ready for payout
- `REVIEWED`: Below threshold, balance carried forward

---

## Task 5: Validation and Review Process ✅ NEW

### Validation Report

The `getRunValidationReport()` method generates comprehensive validation:

```typescript
const report = await service.getRunValidationReport(runId);
```

#### Automated Validation Checks

1. **Mathematical Consistency**
   - Verifies total royalties = sum of all statements
   - Detects calculation discrepancies

2. **Ownership Integrity**
   - Validates all IP assets have complete ownership (10000 bps)
   - Identifies incomplete or overlapping ownership

3. **Period Boundary Validation**
   - Ensures all line items within run period
   - Flags anomalous date ranges

4. **Dispute Resolution**
   - Blocks locking if disputed statements exist
   - Lists all unresolved disputes

5. **Non-Negative Amounts**
   - Validates no negative earnings
   - Identifies potential calculation errors

#### Report Structure

```typescript
{
  runId: string,
  status: string,
  periodStart: Date,
  periodEnd: Date,
  isValid: boolean,
  warnings: string[],
  errors: string[],
  summary: {
    totalRevenueCents: number,
    totalRoyaltiesCents: number,
    statementCount: number,
    licenseCount: number,
    creatorCount: number,
    disputedStatements: number
  },
  breakdown: {
    revenueByAsset: [...],
    earningsByCreator: [...],
    outliers: [...]
  },
  validationChecks: [
    { check: string, passed: boolean, message?: string }
  ]
}
```

#### Outlier Detection

- **High Earners**: Creators earning >3x median
- **Zero Revenue**: Statements with no earnings
- **Statistical Analysis**: Median calculations for anomaly detection

### Admin Review Workflow

The `reviewRun()` method enables administrator approval:

```typescript
await service.reviewRun(
  runId,
  approve: boolean,
  reviewNotes: string | undefined,
  userId: string
);
```

#### Review Actions

**Approve**: 
- Automatically locks the run
- Appends approval notes to run
- Logs audit event
- Prevents further modifications

**Reject**:
- Adds rejection notes
- Keeps run in CALCULATED status
- Allows recalculation or rollback

#### Audit Trail

All review actions logged:
```typescript
{
  action: 'royalty.run.reviewed_and_approved' | 'royalty.run.reviewed_and_rejected',
  userId: string,
  entityType: 'royalty_run',
  entityId: runId,
  after: {
    approved: boolean,
    reviewNotes: string,
    reviewedAt: Date
  }
}
```

---

## Task 6: Locking Mechanism ✅

### Implementation

The `lockRun()` method finalizes the royalty run:

```typescript
await service.lockRun(runId, userId);
```

### Pre-Lock Validation

```typescript
async validateLockRun(runId: string): Promise<void> {
  // 1. Verify run exists
  // 2. Verify status is CALCULATED
  // 3. Verify no disputed statements
}
```

### Lock Operation

```typescript
await this.prisma.royaltyRun.update({
  where: { id: runId },
  data: {
    status: 'LOCKED',
    lockedAt: new Date(),
  },
});
```

### Immutability Enforcement

- Database-level: Status check prevents updates
- Application-level: All modification methods check lock status
- Audit-level: Complete logging of lock event

### Post-Lock State

- Status: `LOCKED`
- `lockedAt`: Timestamp of lock
- Statements: All finalized
- Prevents: Any modifications to run or statements
- Allows: Payout initiation, creator notifications

---

## Task 7: Run Rollback Capability ✅ NEW

### Implementation

The `rollbackRun()` method provides controlled rollback:

```typescript
await service.rollbackRun(
  runId: string,
  reason: string,
  userId: string,
  archiveData: boolean = true
);
```

### Rollback Eligibility Validation

```typescript
async validateRollbackRun(run, userId): Promise<void> {
  // 1. Check run status (must be LOCKED or CALCULATED)
  // 2. Verify no payments processed
  // 3. Check no statements are PAID
  // 4. Verify user has ADMIN role
}
```

### Rollback Process

1. **Capture Original State**
   ```typescript
   const originalState = {
     status: run.status,
     lockedAt: run.lockedAt,
     totalRevenueCents: run.totalRevenueCents,
     statementCount: run.statements.length,
     statements: [...statement details...]
   };
   ```

2. **Archive Data** (if requested)
   ```typescript
   await archiveRollbackData(tx, runId, originalState, reason);
   ```
   - Stores complete snapshot in run notes
   - Maintains audit trail
   - Enables forensic analysis

3. **Delete Calculations**
   ```typescript
   // Delete all royalty lines
   await tx.royaltyLine.deleteMany({
     where: { royaltyStatement: { royaltyRunId: runId } }
   });
   
   // Delete all statements
   await tx.royaltyStatement.deleteMany({
     where: { royaltyRunId: runId }
   });
   ```

4. **Reset Run to DRAFT**
   ```typescript
   await tx.royaltyRun.update({
     where: { id: runId },
     data: {
       status: 'DRAFT',
       lockedAt: null,
       processedAt: null,
       totalRevenueCents: 0,
       totalRoyaltiesCents: 0,
       notes: `${existingNotes}\n\n[ROLLBACK] ${timestamp}: ${reason}`
     }
   });
   ```

5. **Log Audit Event**
   ```typescript
   await this.auditService.log({
     userId,
     action: 'royalty.run.rolled_back',
     entityType: 'royalty_run',
     entityId: runId,
     before: originalState,
     after: { status: 'DRAFT', reason, rollbackTimestamp }
   });
   ```

6. **Invalidate Caches**
   ```typescript
   await this.redis.del(`royalty_run:${runId}`);
   // Clear all related statement caches
   ```

### Permission Requirements

- **Role**: ADMIN only
- **Error**: `InsufficientRollbackPermissionsError` if unauthorized

### Safety Guarantees

1. **Payment Protection**: Cannot rollback paid runs
2. **Transaction Safety**: Atomic operation - all or nothing
3. **Audit Trail**: Complete before/after state preserved
4. **Data Archive**: Original calculations preserved for analysis

### Use Cases

1. **Data Errors**: Incorrect license data discovered after locking
2. **Calculation Bugs**: Logic errors found post-calculation
3. **Manual Corrections**: Need to apply adjustments before recalculating
4. **Dispute Resolution**: Major disputes requiring recalculation

### Rollback Workflow

```
LOCKED → Rollback Validation → Archive Data → Delete Statements/Lines 
  → Reset to DRAFT → Audit Log → Cache Clear → Ready for Recalculation
```

---

## Error Handling

### New Error Classes

```typescript
// Rollback-specific errors
RoyaltyRunAlreadyPaidError
RoyaltyRunRollbackError
InsufficientRollbackPermissionsError
```

### Error Scenarios

| Scenario | Error | Code | Message |
|----------|-------|------|---------|
| Rollback paid run | `RoyaltyRunAlreadyPaidError` | 412 | Cannot rollback: payments processed |
| Insufficient permissions | `InsufficientRollbackPermissionsError` | 403 | User lacks ADMIN role |
| Rollback operation fails | `RoyaltyRunRollbackError` | 500 | Rollback failed: [details] |

---

## Validation Schemas

### New Zod Schemas

```typescript
// Rollback
export const rollbackRunSchema = z.object({
  runId: z.string().cuid(),
  reason: z.string().min(20).max(1000),
  archiveData: z.boolean().default(true).optional(),
});

// Review
export const reviewRunSchema = z.object({
  runId: z.string().cuid(),
  approve: z.boolean(),
  reviewNotes: z.string().max(1000).optional(),
});

// Validation Report
export const getRunValidationReportSchema = z.object({
  runId: z.string().cuid(),
});
```

---

## Usage Examples

### Complete Workflow

```typescript
// 1. Initialize Run
const runId = await royaltyService.createRun(
  new Date('2025-01-01'),
  new Date('2025-01-31'),
  'January 2025 royalties',
  adminUserId
);

// 2. Execute Calculation
await royaltyService.calculateRun(runId, adminUserId);

// 3. Generate Validation Report
const report = await royaltyService.getRunValidationReport(runId);

if (!report.isValid) {
  console.log('Validation errors:', report.errors);
  // Fix issues and recalculate or rollback
}

if (report.warnings.length > 0) {
  console.log('Review warnings:', report.warnings);
}

// 4. Admin Review
await royaltyService.reviewRun(
  runId,
  true, // approve
  'All calculations verified, no anomalies detected',
  adminUserId
);
// Automatically locks if approved

// 5. If issues found after lock, rollback
if (issuesDiscovered && !paymentProcessed) {
  await royaltyService.rollbackRun(
    runId,
    'Incorrect ownership data discovered for Asset XYZ. Need to correct and recalculate.',
    adminUserId,
    true // archive data
  );
  
  // Fix data issues
  // Recalculate
  await royaltyService.calculateRun(runId, adminUserId);
}
```

### Validation Report Usage

```typescript
const report = await royaltyService.getRunValidationReport(runId);

// Check overall validity
if (report.isValid) {
  console.log('✅ All validation checks passed');
} else {
  console.log('❌ Validation failed:', report.errors);
}

// Review warnings
report.warnings.forEach(warning => {
  console.warn('⚠️', warning);
});

// Examine breakdown
console.log('Revenue by asset:', report.breakdown.revenueByAsset);
console.log('Earnings by creator:', report.breakdown.earningsByCreator);

// Check outliers
report.breakdown.outliers.forEach(outlier => {
  console.log(`Outlier (${outlier.type}):`, outlier.message);
  console.log('Details:', outlier.details);
});

// Review individual checks
report.validationChecks.forEach(check => {
  const status = check.passed ? '✅' : '❌';
  console.log(`${status} ${check.check}: ${check.message}`);
});
```

---

## Database Schema

All schema elements already exist in `prisma/schema.prisma`:

### RoyaltyRun
```prisma
model RoyaltyRun {
  id                  String             @id @default(cuid())
  periodStart         DateTime
  periodEnd           DateTime
  status              RoyaltyRunStatus   @default(DRAFT)
  totalRevenueCents   Int                @default(0)
  totalRoyaltiesCents Int                @default(0)
  processedAt         DateTime?
  lockedAt            DateTime?
  createdBy           String
  notes               String?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  statements          RoyaltyStatement[]
  creator             User               @relation(fields: [createdBy], references: [id])
}

enum RoyaltyRunStatus {
  DRAFT
  CALCULATED
  LOCKED
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## Performance Considerations

### Calculation Optimization

- **Transaction Timeout**: Configurable via `CALCULATION_ENGINE_CONFIG.calculationTimeoutMs`
- **Batch Processing**: Line items created via `createMany()`
- **Efficient Queries**: Single query for active licenses with includes
- **Memory Management**: Streaming for large datasets

### Caching Strategy

- **Run Data**: `royalty_run:${runId}`
- **Statements**: `royalty_statement:${statementId}`
- **Invalidation**: On any modification, lock, or rollback

---

## Audit Trail

### Logged Events

1. `royalty.run.created` - Run initialization
2. `royalty.run.calculated` - Calculation completion
3. `royalty.run.reviewed_and_approved` - Admin approval
4. `royalty.run.reviewed_and_rejected` - Admin rejection
5. `royalty.run.locked` - Run locked
6. `royalty.run.rolled_back` - Run rolled back
7. `royalty.statement.adjusted` - Manual adjustment
8. `royalty.statement.disputed` - Creator dispute
9. `royalty.statement.dispute_resolved` - Dispute resolution

### Audit Entry Structure

```typescript
{
  userId: string,
  action: string,
  entityType: 'royalty_run' | 'royalty_statement',
  entityId: string,
  before?: any,
  after?: any,
  timestamp: Date
}
```

---

## Integration Points

### Existing Services

1. **Audit Service**: Complete logging of all operations
2. **Redis**: Caching and cache invalidation
3. **License Service**: Revenue data source
4. **IP Ownership Service**: Share calculations
5. **Creator Service**: Statement recipients
6. **Notification Service**: Alert creators (future)
7. **Email Service**: Statement delivery (future)
8. **Payout Service**: Payment processing (future)

---

## Testing Recommendations

### Unit Tests

- Period validation logic
- Revenue pro-rating calculations
- Ownership split distribution
- Rounding reconciliation
- Threshold application
- Rollback validation

### Integration Tests

- Complete calculation workflow
- Review and approval flow
- Rollback and recalculation
- Error scenarios
- Permission enforcement

### Edge Cases

- Zero-revenue periods
- Single-creator ownership
- Many-creator splits
- Partial period licenses
- Threshold edge cases
- Concurrent modifications
- Failed rollback recovery

---

## Future Enhancements

### Potential Additions

1. **Scheduled Runs**: Automatic monthly calculation
2. **Preview Mode**: Dry-run calculations
3. **Partial Rollback**: Rollback specific statements
4. **Adjustment History**: Track all manual adjustments
5. **Export Reports**: CSV/PDF validation reports
6. **Email Notifications**: Auto-notify on review/rollback
7. **Webhook Integration**: External system notifications

---

## Summary

The Royalty Run Service is now complete with all seven required tasks:

1. ✅ **Initialization**: Validated period-based run creation
2. ✅ **Revenue Collection**: Pro-rated aggregation from licenses
3. ✅ **Calculation**: Precise ownership split distribution
4. ✅ **Statement Generation**: Detailed creator statements with line items
5. ✅ **Validation & Review**: Comprehensive validation reports and admin approval workflow
6. ✅ **Locking**: Immutable finalization with audit trail
7. ✅ **Rollback**: Controlled rollback with permission checks and data archival

All functionality follows established patterns, maintains data integrity, and provides complete audit trails for compliance and transparency.
