# Royalty Calculation Service

## Overview

The Royalty Calculation Service is a comprehensive engine that handles all aspects of creator royalty calculations for the YES GODDESS platform. It implements precise financial tracking, ownership splits, period management, and threshold-based payouts with complete audit trails.

## Core Features

### 1. **Royalty Period Management**
- **Period Validation**: Ensures periods don't overlap and dates are valid
- **Period Generation**: Auto-generate monthly, quarterly, or fiscal year periods
- **Period Types**: Support for monthly, quarterly, and custom date ranges
- **Overlap Detection**: Prevents double-counting revenue across periods

**Location**: `src/modules/royalties/utils/period.utils.ts`

```typescript
// Generate monthly periods for 2025
const periods = generateMonthlyPeriods(2025);

// Check for overlapping runs
await checkForOverlappingRuns(prisma, periodStart, periodEnd);
```

### 2. **Revenue Aggregation**
- **License Revenue Collection**: Aggregates all revenue from active licenses
- **Pro-rating Logic**: Adjusts revenue for licenses active only part of the period
- **Flat Fee Calculation**: Handles one-time licensing fees
- **Usage-Based Revenue**: Integrates with usage tracking for rev-share models
- **Scope Validation**: Ensures reported usage matches license scope

**Features**:
- Automatic pro-rating for partial-period licenses
- Support for multiple compensation models (flat fee, rev share, hybrid)
- Currency handling with conversion to base currency (USD)
- Revenue validation and reconciliation

### 3. **Ownership Split Calculation**
- **Basis Point Precision**: All splits calculated in basis points (1/100th of a percent)
- **Validation**: Ensures ownership always sums to exactly 10,000 bps (100%)
- **Accurate Distribution**: Uses largest remainder method to guarantee splits sum to original amount
- **Multi-Owner Support**: Handles assets with multiple creators
- **Derivative Works**: Optional support for original creator royalties on derivatives

**Location**: `src/modules/royalties/utils/financial.utils.ts`

```typescript
// Split $100.00 between three creators (50%, 30%, 20%)
const splits = splitAmountAccurately(10000, [
  { id: 'creator1', basisPoints: 5000 },
  { id: 'creator2', basisPoints: 3000 },
  { id: 'creator3', basisPoints: 2000 },
]);
// Result: [5000, 3000, 2000] - guaranteed to sum to 10000
```

### 4. **License Scope Consideration**
- **Scope Parsing**: Extracts media types, geographies, and restrictions from license JSON
- **Usage Validation**: Verifies reported usage against permitted scope
- **Violation Detection**: Flags unauthorized usage for review
- **Multi-Scope Support**: Handles licenses with complex permission structures

**Methods**:
- `validateLicenseScope()`: Check if usage is within permitted scope
- Automatic flagging of scope violations
- Revenue exclusion for out-of-scope usage

### 5. **Adjustment Handling**
- **Adjustment Types**: Credits, debits, bonuses, corrections, refunds
- **Audit Trail**: Every adjustment tracked with reason and approver
- **Reversibility**: Adjustments can be reversed with new entries
- **Validation**: Configurable approval thresholds for large adjustments
- **Statement Impact**: Adjustments update both statement and run totals

**Location**: `src/modules/royalties/services/royalty-calculation.service.ts`

```typescript
await calculationService.applyAdjustment(
  statementId,
  500, // $5.00 credit
  'Compensation for delayed payment processing',
  'CREDIT',
  userId
);
```

**Adjustment Types**:
- `CREDIT`: Add money to creator balance
- `DEBIT`: Reduce creator balance (refunds, corrections)
- `BONUS`: Performance or milestone bonuses
- `CORRECTION`: Fix calculation errors
- `REFUND`: Handle license cancellations

### 6. **Rounding and Precision**
- **Banker's Rounding**: Round-half-to-even reduces systematic bias
- **Integer Storage**: All amounts stored as cents (integers) to avoid floating-point errors
- **Rounding Reconciliation**: Tracks cumulative rounding differences
- **Tolerance Checking**: Validates total rounding impact is within acceptable limits
- **Precision Utilities**: Consistent rounding across all calculations

**Location**: `src/modules/royalties/utils/financial.utils.ts`

**Rules**:
- All monetary amounts in cents (integer)
- Banker's rounding for .5 values (round to even)
- Maximum tolerance: 1 cent per 100 calculations
- Pre/post rounding reconciliation for audit

```typescript
// Example: Banker's rounding
bankersRound(2.5); // 2 (rounds to even)
bankersRound(3.5); // 4 (rounds to even)
bankersRound(4.6); // 5 (standard rounding)
```

### 7. **Minimum Payout Thresholds**
- **Threshold Enforcement**: Creators must reach minimum before payout
- **Rollover Accumulation**: Unpaid amounts carry forward to next period
- **Per-Creator Thresholds**: Support for custom thresholds (VIP creators)
- **Threshold Bypass**: Grace period or account closure bypasses
- **Transparency**: Creators always see accumulated balance

**Configuration**: `src/modules/royalties/config/calculation.config.ts`

**Default Settings**:
- Minimum threshold: $20.00 (configurable)
- VIP threshold: $0.00 (no minimum for high-value creators)
- Grace period: 12 months (bypass threshold after prolonged unpaid balance)
- Configurable via environment variables

**Carryover Logic**:
1. Calculate current period earnings
2. Add to any unpaid balance from previous periods
3. Check if total >= minimum threshold
4. If yes: Mark for payout; If no: Carry forward to next period
5. Create audit trail with threshold information

## Configuration

All calculation parameters are configurable via environment variables:

```bash
# Minimum payout threshold (in cents)
MINIMUM_PAYOUT_THRESHOLD_CENTS=2000  # $20.00

# VIP creator threshold (in cents)
VIP_MINIMUM_PAYOUT_THRESHOLD_CENTS=0  # No minimum

# Maximum rounding tolerance (in cents)
MAX_ROUNDING_TOLERANCE_CENTS=10  # $0.10

# Rounding method (BANKERS or STANDARD)
ROUNDING_METHOD=BANKERS

# Enable/disable license pro-rating
ENABLE_LICENSE_PRORATION=true

# Grace period for threshold bypass (months)
THRESHOLD_BYPASS_GRACE_PERIOD_MONTHS=12

# Calculation timeout (ms)
CALCULATION_TIMEOUT_MS=300000  # 5 minutes

# Batch size for processing
LICENSE_BATCH_SIZE=100

# Enable usage-based revenue
ENABLE_USAGE_REVENUE=true

# Max adjustment without approval (cents)
MAX_ADJUSTMENT_WITHOUT_APPROVAL_CENTS=10000  # $100.00
```

## Calculation Workflow

### 1. Create Royalty Run
```typescript
const runId = await calculationService.createRun(
  new Date('2025-01-01'),
  new Date('2025-01-31'),
  'January 2025 royalties',
  userId
);
```

### 2. Execute Calculation
```typescript
await calculationService.calculateRun(runId, userId);
```

**Process**:
1. Validate run is in DRAFT status
2. Fetch all active licenses for the period
3. For each license:
   - Calculate total revenue (flat fee + usage)
   - Apply pro-rating if necessary
   - Validate ownership splits
   - Distribute to creators using accurate split algorithm
   - Track pre/post rounding values
4. Perform rounding reconciliation
5. Apply minimum threshold logic
6. Create carryover lines for unpaid balances
7. Update run totals and status to CALCULATED
8. Log audit event

### 3. Review and Lock
```typescript
// Review statements, handle disputes
await statementService.reviewStatement(statementId, creatorId);

// Lock run when ready
await calculationService.lockRun(runId, userId);
```

### 4. Process Payouts
```typescript
// Initiate payouts for creators above threshold
await payoutService.initiatePayouts(runId);
```

## Database Schema

### Royalty Runs
```sql
CREATE TABLE royalty_runs (
  id TEXT PRIMARY KEY,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  status TEXT NOT NULL,  -- DRAFT, CALCULATED, LOCKED, etc.
  total_revenue_cents INTEGER DEFAULT 0,
  total_royalties_cents INTEGER DEFAULT 0,
  processed_at TIMESTAMP,
  locked_at TIMESTAMP,
  created_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Royalty Statements
```sql
CREATE TABLE royalty_statements (
  id TEXT PRIMARY KEY,
  royalty_run_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  total_earnings_cents INTEGER DEFAULT 0,
  status TEXT NOT NULL,  -- PENDING, REVIEWED, DISPUTED, etc.
  reviewed_at TIMESTAMP,
  disputed_at TIMESTAMP,
  dispute_reason TEXT,
  paid_at TIMESTAMP,
  payment_reference TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Royalty Lines
```sql
CREATE TABLE royalty_lines (
  id TEXT PRIMARY KEY,
  royalty_statement_id TEXT NOT NULL,
  license_id TEXT NOT NULL,
  ip_asset_id TEXT NOT NULL,
  revenue_cents INTEGER NOT NULL,
  share_bps INTEGER NOT NULL,
  calculated_royalty_cents INTEGER NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Error Handling

The calculation service implements comprehensive error handling:

- **RoyaltyRunNotFoundError**: Run ID doesn't exist
- **RoyaltyRunInvalidStateError**: Operation not allowed in current state
- **RoyaltyRunOverlappingError**: Period overlaps with existing run
- **RoyaltyCalculationError**: General calculation failure
- **UnresolvedDisputesError**: Cannot lock run with pending disputes

All errors include detailed messages and are logged for troubleshooting.

## Audit Trail

Every calculation action is audited:

```typescript
{
  action: 'royalty.run.calculated',
  entityType: 'royalty_run',
  entityId: runId,
  userId: userId,
  timestamp: '2025-01-15T10:30:00Z',
  before: { status: 'DRAFT' },
  after: { 
    status: 'CALCULATED',
    totalRevenueCents: 500000,
    totalRoyaltiesCents: 450000
  }
}
```

Audit events tracked:
- `royalty.run.created` - New run created
- `royalty.run.calculated` - Calculation completed
- `royalty.run.locked` - Run locked for payout
- `royalty.statement.adjusted` - Manual adjustment applied
- `royalty.statement.disputed` - Creator disputed statement
- `royalty.statement.dispute_resolved` - Dispute resolved

## Performance Considerations

- **Batch Processing**: Licenses processed in configurable batches
- **Transaction Isolation**: Each run in atomic transaction
- **Timeout Protection**: Configurable timeout prevents hung calculations
- **Caching**: Redis caching for frequently accessed data
- **Indexing**: Database indexes on period dates and status fields

## Testing

Comprehensive test coverage includes:

- **Unit Tests**: Individual calculation functions
- **Integration Tests**: Full calculation workflow
- **Edge Cases**: Rounding boundaries, threshold scenarios
- **Performance Tests**: Large-scale calculations
- **Reconciliation Tests**: Verify splits sum correctly

## YES GODDESS Principles

This implementation embodies the platform's core values:

- **Precision**: Banker's rounding and reconciliation ensure accuracy to the cent
- **Sovereignty**: Complete transparency with detailed line items and audit trails
- **Immutability**: Locked runs prevent retroactive changes
- **Fairness**: Accurate split algorithm ensures equitable distribution
- **Discipline**: Monastic attention to detail in every calculation

## Future Enhancements

Potential improvements:

1. **Multi-currency Support**: Handle international transactions
2. **Tax Withholding**: Automatic tax calculation and reporting
3. **Derivative Royalty Chains**: Complex attribution for remix culture
4. **Predictive Analytics**: Forecast future earnings
5. **Bulk Adjustments**: Apply adjustments across multiple statements
6. **Custom Threshold Rules**: More flexible threshold configurations

## Support

For issues or questions:
- Review audit logs for detailed calculation history
- Check configuration settings in `.env`
- Examine royalty line metadata for debugging
- Contact platform support with run ID for investigation
