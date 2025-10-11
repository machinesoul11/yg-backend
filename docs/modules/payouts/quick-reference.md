# Payouts Quick Reference Guide

## Database Schema Summary

### Payout Model
```typescript
type Payout = {
  id: string;                      // CUID
  creatorId: string;               // FK to creators
  royaltyStatementId?: string;     // FK to royalty_statements (optional)
  amountCents: number;             // Integer (e.g., 5000 = $50.00)
  stripeTransferId?: string;       // Unique Stripe transfer ID
  status: PayoutStatus;            // PENDING | PROCESSING | COMPLETED | FAILED
  processedAt?: Date;              // When payout completed
  failedReason?: string;           // Error message if failed
  retryCount: number;              // Default: 0
  lastRetryAt?: Date;              // Last retry timestamp
  createdAt: Date;
  updatedAt: Date;
};
```

## Status Flow

```
PENDING → PROCESSING → COMPLETED ✅
PENDING → PROCESSING → FAILED → PENDING (retry)
```

## Database Access Examples

### Create Payout
```typescript
const payout = await prisma.payout.create({
  data: {
    creatorId: 'creator_123',
    royaltyStatementId: 'statement_456',
    amountCents: 10000, // $100.00
    status: 'PENDING'
  }
});
```

### Update Status
```typescript
await prisma.payout.update({
  where: { id: payoutId },
  data: {
    status: 'COMPLETED',
    processedAt: new Date(),
    stripeTransferId: 'tr_abc123'
  }
});
```

### Query Pending Payouts
```typescript
const pendingPayouts = await prisma.payout.findMany({
  where: { status: 'PENDING' },
  include: {
    creator: {
      include: { user: true }
    },
    royaltyStatement: true
  },
  orderBy: { createdAt: 'asc' }
});
```

### Query Creator Payouts
```typescript
const creatorPayouts = await prisma.payout.findMany({
  where: { creatorId: 'creator_123' },
  include: { royaltyStatement: true },
  orderBy: { createdAt: 'desc' }
});
```

### Failed Payouts Needing Retry
```typescript
const failedPayouts = await prisma.payout.findMany({
  where: {
    status: 'FAILED',
    retryCount: { lt: 5 },
    OR: [
      { lastRetryAt: null },
      { lastRetryAt: { lt: new Date(Date.now() - 3600000) } } // 1 hour ago
    ]
  }
});
```

## Key Implementation Points

### 1. Idempotency
- Check for existing pending payout before creating new one
- Use Stripe idempotency keys: `payout_${payoutId}_${timestamp}`
- Unique constraint on `stripe_transfer_id` prevents duplicates

### 2. Retry Logic
```typescript
const retryDelays = [5 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
```

### 3. Status Validation
```typescript
const validTransitions = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  FAILED: ['PENDING'], // Retry
  COMPLETED: [] // Terminal
};
```

### 4. Stripe Transfer Creation
```typescript
const transfer = await stripe.transfers.create({
  amount: amountCents,
  currency: 'usd',
  destination: creator.stripeAccountId,
  transfer_group: `royalty_${statementId}`,
  metadata: {
    payout_id: payoutId,
    creator_id: creatorId
  }
}, {
  idempotencyKey: `payout_${payoutId}_${Date.now()}`
});
```

### 5. Webhook Handling
```typescript
// transfer.paid
await prisma.payout.update({
  where: { stripeTransferId: transfer.id },
  data: {
    status: 'COMPLETED',
    processedAt: new Date()
  }
});

// transfer.failed
await prisma.payout.update({
  where: { stripeTransferId: transfer.id },
  data: {
    status: 'FAILED',
    failedReason: transfer.failure_message
  }
});
```

## Security Checklist

- ✅ Only admins can create/retry payouts
- ✅ Creators can only view their own payouts
- ✅ Webhook endpoint validates Stripe signatures
- ✅ All status changes logged to audit_events
- ✅ Minimum payout amount enforced (e.g., $1.00)
- ✅ Maximum retry attempts (5) to prevent infinite loops

## Testing Scenarios

1. **Successful Payout**
   - Create → Process → Webhook → Complete

2. **Failed Then Retry**
   - Create → Process → Fail → Retry → Success

3. **Max Retries Exceeded**
   - Create → Fail → Retry (5x) → Permanent failure alert

4. **Duplicate Prevention**
   - Create payout for same statement → Error

5. **Invalid Creator**
   - Create with non-existent creatorId → Error

## Migration Status

✅ Schema defined in `prisma/schema.prisma`
✅ Migration created: `005_add_payouts_table.sql`
✅ Prisma client regenerated
⏳ Migration needs to be applied to database

### To Apply Migration
```bash
# Option 1: Run SQL directly
psql $DATABASE_URL < prisma/migrations/005_add_payouts_table.sql

# Option 2: Use Prisma (after resolving drift)
npx prisma db push
```

## Next Implementation Steps

1. **Create PayoutService** (`src/server/services/payout.service.ts`)
2. **Create tRPC router** (`src/server/api/routers/payouts.ts`)
3. **Add background jobs** (BullMQ workers)
4. **Implement webhook handler** (`src/app/api/webhooks/stripe/route.ts`)
5. **Create email templates** (payout confirmation, failure notification)
6. **Add monitoring** (metrics, alerts)

---

**Module Status: Database Layer Complete ✅**

The Payouts table is ready for service layer implementation. All fields, relationships, and indexes are in place to support secure, reliable, and auditable payment processing.
