# Payouts Module - Implementation Complete

## Database Schema

### Payouts Table ✅

The `payouts` table has been successfully created with the following structure:

```prisma
model Payout {
  id                   String        @id @default(cuid())
  creatorId            String        @map("creator_id")
  royaltyStatementId   String?       @map("royalty_statement_id")
  amountCents          Int           @map("amount_cents")
  stripeTransferId     String?       @unique @map("stripe_transfer_id")
  status               PayoutStatus  @default(PENDING)
  processedAt          DateTime?     @map("processed_at")
  failedReason         String?       @map("failed_reason")
  retryCount           Int           @default(0) @map("retry_count")
  lastRetryAt          DateTime?     @map("last_retry_at")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")
  creator              Creator       @relation(fields: [creatorId], references: [id])
  royaltyStatement     RoyaltyStatement? @relation(fields: [royaltyStatementId], references: [id])

  @@index([creatorId, status])
  @@index([status, createdAt])
  @@index([stripeTransferId])
  @@map("payouts")
}
```

### PayoutStatus Enum ✅

```prisma
enum PayoutStatus {
  PENDING      // Payout created, awaiting processing
  PROCESSING   // Stripe transfer initiated
  COMPLETED    // Transfer successful, creator paid
  FAILED       // Transfer failed, requires attention
}
```

## Fields Description

### Core Fields

- **id** - Unique identifier (CUID)
- **creator_id** - Reference to the creator receiving payment (NOT NULL)
- **royalty_statement_id** - Optional reference to the royalty statement (allows manual payouts)
- **amount_cents** - Payout amount in cents (Integer for precision)

### Stripe Integration

- **stripe_transfer_id** - Unique Stripe transfer ID (unique constraint to prevent duplicates)

### Status & Processing

- **status** - Current state of payout (enum: PENDING, PROCESSING, COMPLETED, FAILED)
- **processed_at** - Timestamp when payout was successfully processed
- **failed_reason** - Error message if payout failed

### Retry Logic

- **retry_count** - Number of retry attempts (default: 0)
- **last_retry_at** - Timestamp of last retry attempt

### Timestamps

- **created_at** - Record creation timestamp
- **updated_at** - Last modification timestamp (auto-updated)

## Relationships

1. **Creator** (Many-to-One)
   - Each payout belongs to one creator
   - A creator can have many payouts
   - Relation field added to `Creator` model: `payouts Payout[]`

2. **RoyaltyStatement** (Many-to-One, Optional)
   - Each payout can reference one royalty statement
   - A royalty statement can have multiple payouts (initial + retries)
   - Nullable to allow manual adjustment payouts
   - Relation field added to `RoyaltyStatement` model: `payouts Payout[]`

## Database Indexes

### Performance Optimization

1. **[creatorId, status]** - Query payouts by creator and filter by status
2. **[status, createdAt]** - Query pending/failed payouts ordered by date
3. **[stripeTransferId]** - Fast lookup by Stripe transfer ID for webhook processing

### Unique Constraints

- **stripe_transfer_id** - Ensures no duplicate Stripe transfers

## Migration File

Created: `prisma/migrations/005_add_payouts_table.sql`

This migration:
- Creates the `PayoutStatus` enum
- Creates the `payouts` table with all fields
- Adds all indexes for query optimization
- Creates foreign key relationships to `creators` and `royalty_statements`
- Handles idempotency (IF NOT EXISTS checks)

## Implementation Checklist ✅

- [x] Create payouts table (id, creator_id, royalty_statement_id)
- [x] Add amount_cents, stripe_transfer_id
- [x] Create status (pending, processing, completed, failed)
- [x] Add processed_at, failed_reason
- [x] Create retry_count and last_retry_at
- [x] Add created_at, updated_at
- [x] Add foreign key relationships
- [x] Add database indexes
- [x] Create PayoutStatus enum
- [x] Create migration file

## Next Steps

### Service Layer Implementation

1. **PayoutService**
   ```typescript
   // src/server/services/payout.service.ts
   - createPayout()
   - processStripeTransfer()
   - retryPayout()
   - handleTransferError()
   - updatePayoutStatus()
   ```

2. **Stripe Integration**
   - Configure Stripe Connect
   - Implement transfer creation
   - Set up webhook handlers for transfer events
   - Handle idempotency with Stripe

3. **Background Jobs**
   - `process-stripe-transfer` - Async payout processing
   - `retry-failed-payouts` - Scheduled retry job
   - `reconcile-payouts` - Daily reconciliation

### API Endpoints (tRPC)

1. **Admin Procedures**
   - `createPayout` - Initiate new payout
   - `listPayouts` - View all payouts with filters
   - `retryPayout` - Manually retry failed payout
   - `getPayoutDetails` - View single payout

2. **Creator Procedures**
   - `listMyPayouts` - View own payout history
   - `getPayoutDetails` - View single payout (owned)

### Webhook Handlers

1. **Stripe Webhooks** (`/api/webhooks/stripe`)
   - `transfer.created` - Update status to PROCESSING
   - `transfer.paid` - Update status to COMPLETED
   - `transfer.failed` - Update status to FAILED, log reason
   - `transfer.reversed` - Handle reversals

### Email Notifications

1. **Creator Notifications**
   - Payout initiated
   - Payout completed (with arrival date)
   - Payout failed (with reason and next steps)

2. **Admin Alerts**
   - Failed payouts requiring attention
   - Unusual retry patterns
   - Reconciliation mismatches

## Database Constraints & Validation

### Application-Level Validations

1. **Amount Validation**
   - Must be positive integer
   - Minimum amount (e.g., 100 cents = $1.00)
   - Maximum amount per transaction

2. **Status Transitions**
   - PENDING → PROCESSING → COMPLETED ✅
   - PENDING → PROCESSING → FAILED ✅
   - FAILED → PENDING (retry) ✅
   - COMPLETED → (terminal state) ❌

3. **Retry Logic**
   - Maximum retry attempts (e.g., 5)
   - Exponential backoff between retries
   - Permanent failure after max retries

### Data Integrity

1. **Foreign Key Constraints**
   - Creator must exist (RESTRICT on delete)
   - RoyaltyStatement optional (SET NULL on delete)

2. **Idempotency**
   - Unique stripe_transfer_id prevents duplicates
   - Check for existing pending payout before creating

## Security Considerations

1. **Access Control**
   - Only admins can create/retry payouts
   - Creators can only view their own payouts
   - Stripe webhook endpoint validates signatures

2. **Audit Trail**
   - All status changes logged to audit_events
   - Include user_id for manual actions
   - Log Stripe webhook events

3. **Sensitive Data**
   - Never expose full Stripe account details
   - Redact bank account info in logs
   - Encrypt failed_reason if contains PII

## Monitoring & Alerting

### Key Metrics

1. **Payout Volume**
   - Total amount paid per day/week/month
   - Number of successful payouts
   - Average payout amount

2. **Failure Rate**
   - Percentage of failed payouts
   - Common failure reasons
   - Time to resolution

3. **Processing Time**
   - Time from creation to completion
   - Average retry count
   - Webhook latency

### Alerts

1. **Critical**
   - Payout failure rate > 5%
   - Any payout stuck in PROCESSING > 1 hour
   - Reconciliation mismatch with Stripe

2. **Warning**
   - Retry count > 3 for any payout
   - Failed payout older than 24 hours
   - Unusual payout amount spike

## Testing Strategy

### Unit Tests

1. **PayoutService**
   - Test payout creation logic
   - Test status transitions
   - Test retry logic with exponential backoff
   - Test error handling

### Integration Tests

1. **Database Operations**
   - Test foreign key constraints
   - Test unique constraints on stripe_transfer_id
   - Test index performance

2. **Stripe Integration**
   - Mock Stripe API calls
   - Test webhook signature validation
   - Test idempotency key generation

### End-to-End Tests

1. **Full Payout Cycle**
   - Create payout → Process transfer → Webhook → Complete
   - Create payout → Transfer fails → Retry → Success
   - Create payout → Max retries → Permanent failure

## Example Queries

### Get Pending Payouts for Processing

```sql
SELECT * FROM payouts
WHERE status = 'PENDING'
ORDER BY created_at ASC
LIMIT 100;
```

### Get Failed Payouts Needing Retry

```sql
SELECT * FROM payouts
WHERE status = 'FAILED'
  AND retry_count < 5
  AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '1 hour')
ORDER BY created_at ASC;
```

### Get Creator Payout History

```sql
SELECT 
  p.id,
  p.amount_cents,
  p.status,
  p.created_at,
  p.processed_at,
  rs.id as statement_id
FROM payouts p
LEFT JOIN royalty_statements rs ON p.royalty_statement_id = rs.id
WHERE p.creator_id = 'creator_123'
ORDER BY p.created_at DESC;
```

### Daily Payout Summary

```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_payouts,
  SUM(CASE WHEN status = 'COMPLETED' THEN amount_cents ELSE 0 END) as total_paid_cents,
  COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count
FROM payouts
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Financial Reconciliation

### Daily Reconciliation Process

1. **Query Completed Payouts**
   ```sql
   SELECT SUM(amount_cents) as total_cents
   FROM payouts
   WHERE status = 'COMPLETED'
     AND DATE(processed_at) = CURRENT_DATE;
   ```

2. **Query Stripe Transfers**
   ```typescript
   const transfers = await stripe.transfers.list({
     created: {
       gte: startOfDay,
       lt: endOfDay
     }
   });
   const stripeTotal = transfers.data.reduce((sum, t) => sum + t.amount, 0);
   ```

3. **Compare & Alert**
   - If totals match → All good ✅
   - If mismatch → Alert finance team 🚨

### Monthly Reconciliation Report

- Total payouts by status
- Total amount paid to creators
- Failed payouts analysis
- Retry statistics
- Average processing time

## Status Workflow Diagram

```
┌─────────┐
│ PENDING │ ← Initial state
└────┬────┘
     │
     │ Job picks up payout
     ▼
┌────────────┐
│ PROCESSING │ ← Stripe transfer initiated
└─────┬──────┘
      │
      ├──────────┐
      │          │
      ▼          ▼
┌───────────┐  ┌────────┐
│ COMPLETED │  │ FAILED │
└───────────┘  └───┬────┘
   (Terminal)      │
                   │ Retry (if attempts < 5)
                   ▼
              ┌─────────┐
              │ PENDING │
              └─────────┘
```

## Integration with Royalty Statements

### Payout Creation Trigger

When a `RoyaltyStatement` is approved:
1. Admin locks `RoyaltyRun`
2. System creates `Payout` for each approved statement
3. Background job processes Stripe transfers
4. Webhook updates payout status
5. Statement marked as `PAID` when payout completes

### Handling Statement Disputes

If statement is disputed after payout created:
1. Mark payout as FAILED (if not yet processed)
2. Create adjustment payout after resolution
3. Link both to the same statement for audit trail

---

## Summary

The Payouts module is now fully integrated into the database schema and ready for service layer implementation. All required fields, relationships, indexes, and constraints are in place to support:

- Secure and auditable payment processing
- Robust retry logic for failed transfers
- Idempotent Stripe integration
- Comprehensive creator payout tracking
- Financial reconciliation capabilities

**The work is sacred. The creator is compensated. The system never fails.**
