# Database Check Constraints - Quick Reference

**Last Updated**: October 10, 2025  
**Status**: ✅ Implemented

---

## 🚀 Quick Start

### Validate Data Before Migration
```bash
npx tsx scripts/validate-constraint-data.ts
```

### Apply Constraints
```bash
# Staging
psql $STAGING_DATABASE_URL -f prisma/migrations/006_add_check_constraints.sql

# Production
psql $DATABASE_URL_DIRECT -f prisma/migrations/006_add_check_constraints.sql
```

### Test Constraints
```bash
npx tsx scripts/test-check-constraints.ts
```

### Rollback (if needed)
```bash
psql $DATABASE_URL_DIRECT -f prisma/migrations/rollbacks/006_rollback_check_constraints.sql
```

---

## 📋 Constraint Reference

### Financial Constraints (Non-Negative)

| Table | Field | Constraint | Rule |
|-------|-------|-----------|------|
| `licenses` | `fee_cents` | `fee_cents_non_negative` | `>= 0` |
| `payouts` | `amount_cents` | `payout_amount_non_negative` | `>= 0` |
| `royalty_runs` | `total_revenue_cents` | `total_revenue_cents_non_negative` | `>= 0` |
| `royalty_runs` | `total_royalties_cents` | `total_royalties_cents_non_negative` | `>= 0` |
| `royalty_statements` | `total_earnings_cents` | `total_earnings_cents_non_negative` | `>= 0` |
| `royalty_lines` | `revenue_cents` | `revenue_cents_non_negative` | `>= 0` |
| `royalty_lines` | `calculated_royalty_cents` | `calculated_royalty_cents_non_negative` | `>= 0` |
| `daily_metrics` | `revenueCents` | `revenue_cents_non_negative` | `>= 0` |
| `projects` | `budgetCents` | `budget_cents_non_negative` | `>= 0` |

### Percentage Constraints (0-100%)

| Table | Field | Constraint | Rule |
|-------|-------|-----------|------|
| `licenses` | `rev_share_bps` | `rev_share_bps_valid_range` | `0-10000` |
| `ip_ownerships` | `share_bps` | `share_bps_valid_range` | `0-10000` |
| `royalty_lines` | `share_bps` | `share_bps_valid_range` | `0-10000` |
| `feature_flags` | `rollout_percentage` | `rollout_percentage_valid_range` | `0-100` |

### Date Range Constraints

| Table | Fields | Constraint | Rule |
|-------|--------|-----------|------|
| `licenses` | `start_date`, `end_date` | `license_end_after_start` | `end > start` |
| `ip_ownerships` | `start_date`, `end_date` | `ownership_end_after_start` | `end > start OR end IS NULL` |
| `royalty_runs` | `period_start`, `period_end` | `royalty_period_valid_range` | `end > start` |
| `royalty_lines` | `period_start`, `period_end` | `royalty_line_period_valid` | `end > start` |
| `projects` | `startDate`, `endDate` | `project_end_after_start` | `end > start OR NULL` |

### Status Constraints

| Table | Field | Constraint | Valid Values |
|-------|-------|-----------|--------------|
| `creators` | `onboardingStatus` | `onboarding_status_valid` | `pending`, `in_progress`, `completed`, `rejected` |
| `creators` | `verificationStatus` | `verification_status_valid` | `pending`, `verified`, `rejected` |
| `brands` | `verificationStatus` | `brand_verification_status_valid` | `pending`, `verified`, `rejected` |

### Other Business Rules

| Table | Field | Constraint | Rule |
|-------|-------|-----------|------|
| `daily_metrics` | `views` | `views_non_negative` | `>= 0` |
| `daily_metrics` | `clicks` | `clicks_non_negative` | `>= 0` |
| `daily_metrics` | `conversions` | `conversions_non_negative` | `>= 0` |
| `daily_metrics` | `uniqueVisitors` | `unique_visitors_non_negative` | `>= 0` |
| `daily_metrics` | `engagementTime` | `engagement_time_non_negative` | `>= 0` |
| `payouts` | `retry_count` | `retry_count_non_negative` | `>= 0` |
| `ip_assets` | `file_size` | `file_size_positive` | `> 0` |
| `ip_assets` | `version` | `version_positive` | `> 0` |

---

## 🔍 Verification Queries

### List All Check Constraints
```sql
SELECT 
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c'
  AND connamespace = 'public'::regnamespace
ORDER BY table_name, constraint_name;
```

### Check Specific Table
```sql
-- Example: licenses table
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'licenses'::regclass
  AND contype = 'c';
```

### Verify Constraint Works
```sql
-- Should fail
INSERT INTO licenses (id, fee_cents, ...) VALUES ('test', -100, ...);
-- Error: violates check constraint "fee_cents_non_negative"
```

---

## 💡 Usage Examples

### Valid Operations (Will Succeed)

```typescript
// ✅ Valid license
await prisma.license.create({
  data: {
    feeCents: 50000,        // Positive fee
    revShareBps: 2500,      // 25% (valid range)
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Future date
    // ...
  }
});

// ✅ Valid ownership
await prisma.ipOwnership.create({
  data: {
    shareBps: 5000,         // 50% (valid range)
    startDate: new Date(),
    endDate: null,          // Ongoing ownership
    // ...
  }
});

// ✅ Valid payout
await prisma.payout.create({
  data: {
    amountCents: 10000,     // $100.00
    status: 'PENDING',
    retryCount: 0,
    // ...
  }
});
```

### Invalid Operations (Will Be Rejected)

```typescript
// ❌ Negative fee
await prisma.license.create({
  data: {
    feeCents: -100,         // Violates fee_cents_non_negative
    // ...
  }
});
// Error: violates check constraint "fee_cents_non_negative"

// ❌ Invalid percentage
await prisma.license.create({
  data: {
    revShareBps: 15000,     // 150% - Violates rev_share_bps_valid_range
    // ...
  }
});
// Error: violates check constraint "rev_share_bps_valid_range"

// ❌ Invalid date range
await prisma.license.create({
  data: {
    startDate: new Date('2025-12-31'),
    endDate: new Date('2025-01-01'),  // Before start - Violates license_end_after_start
    // ...
  }
});
// Error: violates check constraint "license_end_after_start"
```

---

## 🛡️ Error Handling

### Catching Constraint Violations

```typescript
try {
  await prisma.license.create({ data: { ... } });
} catch (error) {
  if (error.message.includes('violates check constraint')) {
    const constraintName = error.message.match(/constraint "([^"]+)"/)?.[1];
    
    const errorMessages = {
      'fee_cents_non_negative': 'License fee cannot be negative',
      'rev_share_bps_valid_range': 'Revenue share must be between 0% and 100%',
      'license_end_after_start': 'End date must be after start date',
      // ... etc
    };
    
    throw new Error(errorMessages[constraintName] || 'Invalid data');
  }
  throw error;
}
```

### User-Friendly Error Mapping

```typescript
const CONSTRAINT_ERROR_MESSAGES = {
  // Financial
  'fee_cents_non_negative': 'License fee must be zero or positive',
  'payout_amount_non_negative': 'Payout amount must be positive',
  'total_revenue_cents_non_negative': 'Revenue total cannot be negative',
  
  // Percentages
  'rev_share_bps_valid_range': 'Revenue share must be between 0% and 100%',
  'share_bps_valid_range': 'Ownership share must be between 0% and 100%',
  
  // Dates
  'license_end_after_start': 'License must end after it starts',
  'royalty_period_valid_range': 'Royalty period end date must be after start date',
  
  // Other
  'file_size_positive': 'File must have a valid size',
  'version_positive': 'Version number must be positive',
};
```

---

## 🚨 Troubleshooting

### Constraint Violation on Valid Data

**Symptom**: Getting constraint errors for seemingly valid data

**Possible Causes**:
1. Date comparison issues (timezone, milliseconds)
2. Floating point to integer conversion errors
3. Null handling in date ranges

**Solution**:
```typescript
// Ensure proper date handling
const startDate = new Date(input.startDate);
const endDate = new Date(input.endDate);
startDate.setHours(0, 0, 0, 0);
endDate.setHours(23, 59, 59, 999);

// Ensure proper BPS conversion
const revShareBps = Math.floor(percentage * 100); // 25.5% -> 2550 bps

// Ensure proper cents conversion
const feeCents = Math.round(dollars * 100); // $50.00 -> 5000 cents
```

### Need to Temporarily Disable Constraint

**For Emergency Maintenance**:
```sql
-- Disable specific constraint
ALTER TABLE licenses DISABLE TRIGGER USER;
-- Do emergency work
ALTER TABLE licenses ENABLE TRIGGER USER;
```

⚠️ **WARNING**: Only use in emergencies. Prefer fixing the data or logic instead.

### Bulk Operations Failing

**Issue**: Bulk insert/update hitting constraints

**Solution**: Validate data before bulk operations
```typescript
// Validate before bulk insert
const validRecords = records.filter(r => 
  r.feeCents >= 0 && 
  r.revShareBps >= 0 && r.revShareBps <= 10000 &&
  r.endDate > r.startDate
);

await prisma.license.createMany({
  data: validRecords,
  skipDuplicates: true,
});
```

---

## 📚 Related Documentation

- [Database Check Constraints Complete](./DATABASE_CHECK_CONSTRAINTS_COMPLETE.md) - Full implementation details
- [Database Quick Reference](./DATABASE_QUICK_REFERENCE.md) - General database usage
- [Licensing Quick Reference](./LICENSING_QUICK_REFERENCE.md) - License module docs
- [Royalties Quick Reference](./ROYALTIES_QUICK_REFERENCE.md) - Royalty module docs
- [IP Assets Quick Reference](./IP_ASSETS_QUICK_REFERENCE.md) - IP asset docs

---

## 🔧 Maintenance Commands

### Add New Constraint
```sql
-- Template
ALTER TABLE table_name
ADD CONSTRAINT constraint_name 
CHECK (condition);

-- Example
ALTER TABLE my_table
ADD CONSTRAINT my_field_positive 
CHECK (my_field > 0);
```

### Remove Constraint
```sql
ALTER TABLE table_name
DROP CONSTRAINT IF EXISTS constraint_name;
```

### Modify Constraint
```sql
-- Drop old
ALTER TABLE table_name DROP CONSTRAINT old_constraint_name;

-- Add new
ALTER TABLE table_name ADD CONSTRAINT new_constraint_name CHECK (new_condition);
```

---

## ✅ Pre-Deployment Checklist

- [ ] Run `validate-constraint-data.ts` - no violations
- [ ] Review migration SQL file
- [ ] Test rollback script on staging
- [ ] Apply to staging environment
- [ ] Run `test-check-constraints.ts` on staging
- [ ] Monitor staging for 24-48 hours
- [ ] Schedule production maintenance window
- [ ] Apply to production
- [ ] Verify with constraint listing query
- [ ] Monitor production logs for violations
- [ ] Update documentation if needed

---

**Quick Links**:
- [Migration File](../prisma/migrations/006_add_check_constraints.sql)
- [Rollback File](../prisma/migrations/rollbacks/006_rollback_check_constraints.sql)
- [Validation Script](../scripts/validate-constraint-data.ts)
- [Test Script](../scripts/test-check-constraints.ts)
