# Payouts Tables - Implementation Checklist

## ✅ COMPLETED ITEMS

### Database Schema

- [x] **Create payouts table** with id and primary key
- [x] **Add creator_id field** (NOT NULL, Foreign Key to creators)
- [x] **Add royalty_statement_id field** (nullable, Foreign Key to royalty_statements)
- [x] **Add amount_cents field** (Integer, NOT NULL)
- [x] **Add stripe_transfer_id field** (Text, nullable, unique constraint)
- [x] **Create status field** with PayoutStatus enum (PENDING, PROCESSING, COMPLETED, FAILED)
- [x] **Add processed_at field** (DateTime, nullable)
- [x] **Add failed_reason field** (Text, nullable)
- [x] **Create retry_count field** (Integer, default 0)
- [x] **Add last_retry_at field** (DateTime, nullable)
- [x] **Add created_at field** (DateTime, default now())
- [x] **Add updated_at field** (DateTime, auto-updated)

### Relationships

- [x] **Creator relation** (Many-to-One)
  - Added `payouts Payout[]` to Creator model
  - Foreign key constraint on creator_id
  
- [x] **RoyaltyStatement relation** (Many-to-One, Optional)
  - Added `payouts Payout[]` to RoyaltyStatement model
  - Foreign key constraint on royalty_statement_id
  - SET NULL on delete (allows orphaned adjustment payouts)

### Indexes & Performance

- [x] **Composite index** on (creator_id, status) - For filtering creator payouts by status
- [x] **Composite index** on (status, created_at) - For processing queues ordered by time
- [x] **Index** on stripe_transfer_id - For webhook lookups
- [x] **Unique constraint** on stripe_transfer_id - Prevent duplicate Stripe transfers

### Enums

- [x] **PayoutStatus enum** created with values:
  - PENDING - Initial state
  - PROCESSING - Stripe transfer initiated
  - COMPLETED - Transfer successful
  - FAILED - Transfer failed, needs attention

### Migration

- [x] **Migration file created**: `prisma/migrations/005_add_payouts_table.sql`
- [x] **Idempotent SQL** (IF NOT EXISTS checks)
- [x] **Enum creation** with error handling
- [x] **Foreign keys** properly defined
- [x] **All indexes** included

### Prisma Client

- [x] **Schema validated** (npx prisma format)
- [x] **Client regenerated** (npx prisma generate)
- [x] **Types available** for TypeScript

### Documentation

- [x] **Complete module documentation** (`PAYOUTS_MODULE_COMPLETE.md`)
- [x] **Quick reference guide** (`PAYOUTS_QUICK_REFERENCE.md`)
- [x] **Implementation checklist** (this file)

## 📊 Schema Summary

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

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

## 🔄 Next Steps (Service Layer)

### 1. PayoutService Implementation
```
Location: src/server/services/payout.service.ts
Methods:
  - createPayout()
  - processStripeTransfer()
  - retryPayout()
  - handleTransferError()
  - updatePayoutStatus()
  - listPayouts()
  - getPayoutById()
```

### 2. tRPC API Router
```
Location: src/server/api/routers/payouts.ts
Procedures:
  Admin:
    - createPayout
    - listAllPayouts
    - retryPayout
    - getPayoutDetails
  
  Creator:
    - listMyPayouts
    - getMyPayoutDetails
```

### 3. Background Jobs
```
Jobs:
  - process-stripe-transfer (async payout processing)
  - retry-failed-payouts (scheduled retry job)
  - reconcile-payouts (daily reconciliation)
  - check-stale-payouts (alert on stuck payouts)
```

### 4. Stripe Integration
```
  - Configure Stripe Connect
  - Implement transfer creation with idempotency
  - Set up webhook endpoint (/api/webhooks/stripe)
  - Handle events:
    * transfer.created
    * transfer.paid
    * transfer.failed
    * transfer.reversed
```

### 5. Email Notifications
```
Templates:
  - PayoutInitiated.tsx
  - PayoutCompleted.tsx
  - PayoutFailed.tsx
  - PayoutRetrying.tsx
```

### 6. Monitoring & Alerts
```
Metrics:
  - Total payouts per day/week/month
  - Success/failure rates
  - Average processing time
  - Retry statistics

Alerts:
  - Failure rate > 5%
  - Payout stuck in PROCESSING > 1 hour
  - Reconciliation mismatch
  - Max retries exceeded
```

## 🧪 Testing Requirements

### Unit Tests
- [ ] Payout creation with valid data
- [ ] Payout creation with invalid creator
- [ ] Status transition validation
- [ ] Retry logic with exponential backoff
- [ ] Idempotency key generation

### Integration Tests
- [ ] Create payout via API (admin)
- [ ] List payouts with filters
- [ ] Creator can only see own payouts
- [ ] Webhook updates payout status
- [ ] Foreign key constraints work

### E2E Tests
- [ ] Full payout cycle (create → process → complete)
- [ ] Failed payout retry flow
- [ ] Max retries reached scenario
- [ ] Duplicate prevention

## 🔒 Security Checklist

- [ ] Only admins can create/retry payouts
- [ ] Creators can only view their own payouts
- [ ] Stripe webhook validates signatures
- [ ] All financial operations logged to audit_events
- [ ] Sensitive data (bank info) never exposed in API
- [ ] Rate limiting on payout endpoints
- [ ] Minimum payout amount enforced ($1.00)
- [ ] Maximum payout amount validated

## 📈 Performance Considerations

- [x] Indexes on commonly queried fields
- [ ] Pagination for large result sets
- [ ] Caching for payout summaries
- [ ] Batch processing for bulk payouts
- [ ] Connection pooling for database

## 🎯 Success Criteria

The Payouts module is considered complete when:

1. ✅ Database schema is in place (DONE)
2. ⏳ Service layer implements all business logic
3. ⏳ API endpoints are secure and type-safe
4. ⏳ Stripe integration is working with test mode
5. ⏳ Background jobs process payouts reliably
6. ⏳ Webhooks update status in real-time
7. ⏳ Email notifications sent for all status changes
8. ⏳ Admin dashboard shows payout analytics
9. ⏳ Creator dashboard shows payout history
10. ⏳ All tests passing (unit, integration, E2E)
11. ⏳ Monitoring and alerts configured
12. ⏳ Documentation complete and up-to-date

## 📁 Files Created/Modified

### Modified
- ✅ `prisma/schema.prisma` - Added Payout model and PayoutStatus enum
- ✅ `prisma/schema.prisma` - Added payouts relation to Creator model
- ✅ `prisma/schema.prisma` - Added payouts relation to RoyaltyStatement model

### Created
- ✅ `prisma/migrations/005_add_payouts_table.sql` - Database migration
- ✅ `docs/PAYOUTS_MODULE_COMPLETE.md` - Comprehensive documentation
- ✅ `docs/PAYOUTS_QUICK_REFERENCE.md` - Quick reference guide
- ✅ `docs/PAYOUTS_IMPLEMENTATION_CHECKLIST.md` - This file

### To Be Created
- ⏳ `src/server/services/payout.service.ts`
- ⏳ `src/server/api/routers/payouts.ts`
- ⏳ `src/server/jobs/payout-jobs.ts`
- ⏳ `src/app/api/webhooks/stripe/route.ts`
- ⏳ `emails/templates/PayoutCompleted.tsx`
- ⏳ `emails/templates/PayoutFailed.tsx`
- ⏳ `src/__tests__/services/payout.service.test.ts`
- ⏳ `src/__tests__/api/payouts.test.ts`

## 🚀 Deployment Notes

### Before Deploying to Production

1. **Run Migration**
   ```bash
   # Development
   npx prisma db push
   
   # Production (after testing)
   psql $DATABASE_URL < prisma/migrations/005_add_payouts_table.sql
   ```

2. **Verify Stripe Configuration**
   - Connect account setup
   - Webhook endpoint registered
   - API keys configured (production)
   - Transfer limits reviewed

3. **Set Minimum Payout Amount**
   - Environment variable: `MIN_PAYOUT_AMOUNT_CENTS=100`
   - Validate in PayoutService

4. **Configure Retry Settings**
   - Max retries: 5
   - Retry delays: [5m, 10m, 30m, 1h, 2h]
   - Exponential backoff

5. **Enable Monitoring**
   - DataDog/NewRelic for metrics
   - Sentry for error tracking
   - CloudWatch logs
   - Alert channels (Slack, PagerDuty)

---

## ✨ Summary

**STATUS: DATABASE LAYER COMPLETE ✅**

All database requirements for the Payouts module have been successfully implemented:
- ✅ Table created with all required fields
- ✅ Relationships established with Creator and RoyaltyStatement
- ✅ Indexes optimized for common queries
- ✅ Enum defined for status management
- ✅ Migration file ready for deployment
- ✅ Prisma client updated with new types
- ✅ Documentation complete

**The foundation is solid. The data model is sound. Ready for service layer implementation.**

**The work is sacred. The creator is compensated. The system never fails.**
