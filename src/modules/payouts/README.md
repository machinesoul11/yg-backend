# Payout Processing Module

## Overview

The Payout Processing Module handles automated creator payouts through Stripe Connect. It provides comprehensive eligibility checking, balance validation, Stripe transfer creation, retry logic with exponential backoff, failure handling, email notifications, and PDF receipt generation.

## Features

### ✅ Payout Eligibility Checker
- Validates Stripe account connection and onboarding completion  
- Checks transfer capabilities are enabled
- Verifies account is in good standing (not locked/suspended)
- Ensures no active royalty disputes exist
- Confirms creator verification status
- Returns detailed eligibility report with specific reasons for ineligibility

### ✅ Minimum Balance Validation
- Calculates total, available, pending, and reserved balances
- Enforces configurable minimum payout threshold (default: $50)
- Prevents double-processing with pending payout detection
- Supports configurable reserve percentages for high-risk accounts
- Provides itemized balance breakdowns

### ✅ Stripe Transfer Creation
- Creates Stripe transfers to creator Express accounts
- Implements idempotency keys to prevent duplicate transfers
- Includes comprehensive metadata for tracking and reconciliation
- Wraps transfers in database transactions for atomicity
- Links payouts to royalty statements
- Creates detailed audit logs

### ✅ Payout Retry Logic
- Intelligent retry with exponential backoff
- Configurable max retries and delay parameters
- Distinguishes retryable vs. permanent errors
- Reconciles Stripe transfer status before retrying
- Scheduled retry system via Redis
- Automatic detection and recovery of stuck payouts

### ✅ Payout Failure Handling
- Categorizes failures by type (account, platform, technical)
- Automatically restores funds to creator balance on failure
- Sends user-friendly error notifications
- Provides actionable resolution steps
- Admin dashboard for failed payout review
- Comprehensive failure logging

### ✅ Payout Confirmation Emails
- Professional, branded HTML emails
- Includes amount, transfer ID, estimated arrival
- Links to payout history dashboard
- Responsive design for mobile/desktop
- Follows existing email template standards

### ✅ Payout Receipt Generation
- PDF receipts with YES GODDESS branding
- Includes all transaction details and creator information
- Itemized breakdown from royalty statements
- Stored securely in cloud storage
- Downloadable from creator dashboard
- Email attachment option

## Services

### PayoutEligibilityService
**Location:** `src/modules/payouts/services/payout-eligibility.service.ts`

Validates creator eligibility for payouts.

```typescript
const eligibilityService = new PayoutEligibilityService(prisma);
const result = await eligibilityService.checkEligibility(creatorId);

if (!result.eligible) {
  console.log('Ineligible:', result.reasons);
}
```

### PayoutBalanceService
**Location:** `src/modules/payouts/services/payout-balance.service.ts`

Calculates balances and validates minimum payout thresholds.

```typescript
const balanceService = new PayoutBalanceService(prisma);
const balance = await balanceService.calculateBalance(creatorId);
```

### PayoutProcessingService
**Location:** `src/modules/payouts/services/payout-processing.service.ts`

Core payout processing and Stripe transfer creation.

```typescript
const processingService = new PayoutProcessingService(prisma, redis);
const result = await processingService.processPayout({
  creatorId,
  amountCents: 10000, // $100.00
});
```

### PayoutRetryService
**Location:** `src/modules/payouts/services/payout-retry.service.ts`

Handles retry logic with exponential backoff.

```typescript
const retryService = new PayoutRetryService(prisma, redis);
await retryService.retryPayout(payoutId);
await retryService.processStuckPayouts(); // Scheduled job
```

### PayoutNotificationService
**Location:** `src/modules/payouts/services/payout-notification.service.ts`

Sends email and in-app notifications.

```typescript
const notificationService = new PayoutNotificationService(prisma, redis);
await notificationService.sendPayoutConfirmation(payoutId);
await notificationService.sendPayoutFailureNotification(payoutId);
```

### PayoutReceiptService
**Location:** `src/modules/payouts/services/payout-receipt.service.tsx`

Generates PDF receipts.

```typescript
const receiptService = new PayoutReceiptService(prisma);
const storageKey = await receiptService.generateReceipt(payoutId);
```

## Background Jobs

### Payout Processing Worker
**Location:** `src/jobs/payout-processing.job.ts`

BullMQ worker that processes payouts asynchronously.

```typescript
import { queuePayoutProcessing } from '@/jobs/payout-processing.job';

await queuePayoutProcessing({
  creatorId,
  amountCents: 10000,
});
```

## Environment Variables

```env
# Minimum payout amount in cents (default: $50)
MINIMUM_PAYOUT_CENTS=5000

# Reserve percentage for high-risk accounts (default: 0%)
PAYOUT_RESERVE_PERCENTAGE=0

# Retry configuration
PAYOUT_MAX_RETRIES=3
PAYOUT_RETRY_BASE_DELAY_MS=60000  # 1 minute
PAYOUT_RETRY_MAX_DELAY_MS=3600000  # 1 hour
PAYOUT_RETRY_BACKOFF_MULTIPLIER=2

# Stripe
STRIPE_SECRET_KEY=sk_test_...
```

## Database Schema

The module uses the existing `Payout` model:

```prisma
model Payout {
  id                 String            @id @default(cuid())
  creatorId          String
  royaltyStatementId String?
  amountCents        Int
  stripeTransferId   String?           @unique
  status             PayoutStatus      @default(PENDING)
  processedAt        DateTime?
  failedReason       String?
  retryCount         Int               @default(0)
  lastRetryAt        DateTime?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  
  creator            Creator           @relation(...)
  royaltyStatement   RoyaltyStatement? @relation(...)
}

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

## Error Handling

### Retryable Errors
- Network timeouts
- Stripe API rate limits
- Temporary Stripe service issues
- Connection errors

### Non-Retryable Errors
- Invalid Stripe account ID
- Insufficient platform funds
- Account closed or restricted
- Invalid currency
- Permission errors

## Security Considerations

- Stripe API keys stored as environment variables
- Idempotency keys prevent duplicate transfers
- Database transactions ensure consistency
- Comprehensive audit logging
- No sensitive data in error messages
- Fraud detection via balance checks

## Monitoring

Monitor these metrics:
- Payout success rate
- Average processing time
- Retry counts
- Failure reasons (categorized)
- Stuck payout count
- Total payout volume

## Testing

```typescript
// Test eligibility
const result = await eligibilityService.checkEligibility(creatorId);
expect(result.eligible).toBe(true);

// Test balance validation
const balance = await balanceService.calculateBalance(creatorId);
expect(balance.meetsMinimum).toBe(true);
```

## Future Enhancements

- Multi-currency support
- Scheduled/recurring payouts
- Batch payout processing
- Real-time balance webhooks
- Advanced fraud detection
- Payout holds/disputes
- Tax withholding support

## Support

For issues or questions:
- Check logs in payout processing worker
- Review failed payouts in database
- Verify Stripe Connect setup
- Contact: tech@yesgoddess.agency
