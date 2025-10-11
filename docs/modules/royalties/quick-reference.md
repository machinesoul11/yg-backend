# Royalties Module Quick Reference

## 🎯 Purpose
Calculate and distribute creator earnings from license revenue based on IP ownership splits.

---

## 📊 Key Concepts

### Royalty Run
- **Period-based**: Monthly, quarterly, or custom date ranges
- **Lifecycle**: DRAFT → CALCULATED → LOCKED → PROCESSING → COMPLETED
- **One-time calculation**: Cannot recalculate once LOCKED

### Royalty Statement
- **Per-creator**: One statement per creator per run
- **Line items**: Detailed breakdown by license and IP asset
- **Statuses**: PENDING → REVIEWED/DISPUTED → RESOLVED → PAID

### Financial Precision
- **All amounts in cents**: Avoids floating-point errors
- **Basis points for splits**: 10000 = 100%, 6000 = 60%, 250 = 2.5%
- **Rounding**: Always floors (benefits platform, transparent to creators)

---

## 🔑 Core Tables

```sql
-- Royalty Run (calculation cycle)
royalty_runs {
  id, period_start, period_end, status,
  total_revenue_cents, total_royalties_cents,
  processed_at, locked_at, created_by, notes
}

-- Statement (per-creator summary)
royalty_statements {
  id, royalty_run_id, creator_id, total_earnings_cents,
  status, reviewed_at, disputed_at, dispute_reason,
  paid_at, payment_reference
}

-- Line Item (asset-level detail)
royalty_lines {
  id, royalty_statement_id, license_id, ip_asset_id,
  revenue_cents, share_bps, calculated_royalty_cents,
  period_start, period_end, metadata
}
```

---

## 🚀 Quick Start

### 1. Create a Royalty Run (Admin)
```typescript
import { RoyaltyCalculationService } from '@/modules/royalties/services';

// Create run
const run = await prisma.royaltyRun.create({
  data: {
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    status: 'DRAFT',
    createdBy: adminUserId,
  },
});

// Trigger calculation
const calculationService = new RoyaltyCalculationService(prisma, redis, auditService);
await calculationService.calculateRun(run.id, adminUserId);
```

### 2. Review Statement (Creator)
```typescript
import { RoyaltyStatementService } from '@/modules/royalties/services';

const statementService = new RoyaltyStatementService(prisma, redis, emailService, auditService);

// Mark reviewed
await statementService.reviewStatement(statementId, creatorId);
```

### 3. Dispute Statement (Creator)
```typescript
await statementService.disputeStatement(
  statementId,
  'Expected higher revenue from License XYZ',
  creatorId
);
```

### 4. Resolve Dispute (Admin)
```typescript
await statementService.resolveDispute(
  statementId,
  'Verified calculation. Added $50 goodwill adjustment.',
  5000, // 50.00 in cents
  adminUserId
);
```

---

## 📋 Common Queries

### Get Creator Earnings
```typescript
const earnings = await prisma.royaltyStatement.aggregate({
  where: { creatorId: 'cxxx', status: 'PAID' },
  _sum: { totalEarningsCents: true },
});
const totalEarnings = earnings._sum.totalEarningsCents || 0;
```

### List Active Runs
```typescript
const runs = await prisma.royaltyRun.findMany({
  where: { status: { in: ['CALCULATED', 'LOCKED'] } },
  orderBy: { periodStart: 'desc' },
  include: { _count: { select: { statements: true } } },
});
```

### Get Statement with Lines
```typescript
const statement = await prisma.royaltyStatement.findUnique({
  where: { id: statementId },
  include: {
    royaltyRun: true,
    lines: {
      include: {
        license: { include: { brand: true } },
        ipAsset: true,
      },
    },
  },
});
```

---

## ⚠️ Important Rules

### Calculation Rules
1. **Flat-fee licenses**: Prorated if started/ended mid-period
   ```
   days_active / total_days_in_period * fee_cents
   ```

2. **Ownership splits**: Distributed using basis points
   ```
   royalty = revenue_cents * (share_bps / 10000)
   ```

3. **Rounding**: Always `Math.floor()` - creators paid full cents only

### State Transitions
- **DRAFT** → **CALCULATED**: Via calculation job
- **CALCULATED** → **LOCKED**: Admin action (blocks all disputes must be resolved)
- **LOCKED** → **PROCESSING**: Admin initiates payouts
- **PROCESSING** → **COMPLETED**: All payouts successful
- **Any** → **FAILED**: Error during calculation

### Dispute Rules
- Can dispute: PENDING or REVIEWED statements only
- Cannot lock run: If any DISPUTED statements exist
- Must resolve: Change status to RESOLVED before locking

---

## 🔒 Security Checklist

- ✅ **Row-level filtering**: Always filter by `creator_id` for creator queries
- ✅ **Immutability**: Locked runs cannot be recalculated
- ✅ **Audit trail**: Log all adjustments with user ID
- ✅ **Authorization**: Admin-only for create, lock, resolve
- ✅ **Validation**: Zod schemas on all inputs

---

## 🐛 Common Issues & Solutions

### Issue: "Run must be in DRAFT status"
**Cause**: Trying to recalculate a completed run
**Solution**: Create a new run for the same period if needed

### Issue: "Cannot lock run with X unresolved disputes"
**Cause**: Statements in DISPUTED status
**Solution**: Resolve all disputes first via `resolveDispute()`

### Issue: "Property 'royaltyRun' does not exist on type 'PrismaClient'"
**Cause**: Prisma client not regenerated after schema changes
**Solution**: Run `npx prisma generate`

### Issue: Calculation taking too long
**Cause**: Large number of licenses (>10k)
**Solution**: Calculation job has 5-minute timeout, consider chunking

---

## 📚 File Locations

```
src/modules/royalties/
├── schemas/
│   └── royalty.schema.ts          # Zod validation
├── services/
│   ├── royalty-calculation.service.ts  # Core calculation logic
│   └── royalty-statement.service.ts    # Statement management
├── errors/
│   └── royalty.errors.ts          # Custom error classes
├── types.ts                       # TypeScript interfaces
├── router.ts                      # tRPC endpoints (pending)
└── index.ts                       # Module exports

src/jobs/
├── royalty-calculation.job.ts     # Background calculation
└── statement-notification.job.ts  # Email notifications

emails/templates/
└── RoyaltyStatementReady.tsx      # Creator notification

prisma/schema.prisma               # Database models
```

---

## 🧪 Testing Commands

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name add_royalty_tables

# Run unit tests (once created)
npm test royalty

# Check types
npx tsc --noEmit
```

---

## 🎓 Learning Resources

### Key Files to Understand:
1. **prisma/schema.prisma** - Data model
2. **royalty-calculation.service.ts** - Core logic
3. **royalty.schema.ts** - Input validation
4. **ROYALTIES_MODULE_COMPLETE.md** - Full documentation

### Calculation Flow:
```
1. Admin creates run (DRAFT)
2. Job fetches licenses in period
3. Calculate revenue per license (prorated)
4. Distribute revenue by ownership splits
5. Group by creator → create statements
6. Create line items for transparency
7. Update run to CALCULATED
8. Admin locks run (after dispute resolution)
9. Job sends notifications to creators
10. Creators review statements
11. Admin initiates payouts
12. Statements marked PAID
```

---

## 💡 Pro Tips

1. **Always use cents**: Never divide, always multiply then floor
2. **Basis points precision**: 10000 = 100% avoids float errors
3. **Transaction everything**: Financial operations are atomic
4. **Audit everything**: Log who did what when
5. **Email preferences**: Respect creator notification settings
6. **Cache strategically**: Redis for earnings summaries, not statements
7. **Background jobs**: Never calculate synchronously

---

## 📞 Support

**Questions?**
- See: `ROYALTIES_MODULE_COMPLETE.md` for full details
- Check: Error classes for specific error messages
- Review: Zod schemas for input requirements

**Module Status**: 🟡 In Progress (70% complete)
**Last Updated**: October 10, 2025
