# Payout API Endpoints - Implementation Complete ✅

## Overview

The Payout API provides comprehensive functionality for managing creator payouts, including initiating transfers, viewing payout history, checking pending balances, and handling retry logic for failed payouts.

**Base Path:** `/api/trpc`  
**Authentication:** All endpoints require authentication via JWT token or session

---

## Endpoints Summary

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `payouts.transfer` | Mutation | Creator, Admin | Initiate a new payout transfer |
| `payouts.getById` | Query | Creator (own), Admin (all) | Get detailed payout information |
| `payouts.list` | Query | Admin | List all payouts with filtering |
| `payouts.retry` | Mutation | Creator (own), Admin (all) | Retry a failed payout |
| `payouts.getMyPayouts` | Query | Creator | Get authenticated creator's payout history |
| `payouts.getPendingBalance` | Query | Creator | Get creator's pending balance |
| `payouts.batchInitiate` | Mutation | Admin | Initiate batch payouts for multiple creators |

---

## 1. POST /payouts/transfer (Initiate Payout)

**Endpoint:** `payouts.transfer`  
**Method:** Mutation  
**Authentication:** Required  
**Roles:** CREATOR (own payouts), ADMIN (any creator)

### Description
Initiates a new payout transfer for a creator. Performs eligibility checks, balance validation, and creates a Stripe transfer.

### Input Schema

```typescript
{
  creatorId?: string;              // Optional for creators (auto-filled), required for admins
  amountCents?: number;            // Optional - defaults to all available balance
  royaltyStatementIds?: string[];  // Optional - specific statements to pay out
}
```

### Response

```typescript
{
  success: boolean;
  data: {
    id: string;                    // Payout ID
    amountCents: number;           // Amount in cents
    stripeTransferId?: string;     // Stripe transfer ID
    status: PayoutStatus;          // PENDING | PROCESSING | COMPLETED | FAILED
    estimatedArrival: Date;        // Estimated completion date
  }
}
```

### Business Logic

1. **Creator Authentication**: Creators can only initiate payouts for themselves
2. **Eligibility Check**: Validates Stripe account, onboarding status, and account standing
3. **Balance Validation**: Ensures sufficient balance and meets minimum threshold
4. **Idempotency**: Uses unique idempotency keys to prevent duplicate payouts
5. **Audit Logging**: Logs all payout initiation attempts

### Error Codes

- `400 BAD_REQUEST`: Invalid input or insufficient balance
- `403 FORBIDDEN`: Not eligible for payout
- `401 UNAUTHORIZED`: Not authenticated
- `500 INTERNAL_SERVER_ERROR`: Stripe transfer failed

### Example

```typescript
// Creator initiating their own payout
const result = await trpc.payouts.transfer.mutate({
  amountCents: 50000 // $500.00
});

// Admin initiating payout for a creator
const result = await trpc.payouts.transfer.mutate({
  creatorId: "creator_123",
  amountCents: 100000 // $1,000.00
});
```

---

## 2. GET /payouts/:id (Payout Details)

**Endpoint:** `payouts.getById`  
**Method:** Query  
**Authentication:** Required  
**Roles:** CREATOR (own payouts), ADMIN (all)

### Description
Retrieves detailed information about a specific payout.

### Input Schema

```typescript
{
  id: string;  // Payout ID (CUID)
}
```

### Response

```typescript
{
  data: {
    id: string;
    creatorId: string;
    creatorName: string;
    creatorEmail: string;
    amountCents: number;
    status: PayoutStatus;
    stripeTransferId?: string;
    processedAt?: Date;
    failedReason?: string;
    retryCount: number;
    lastRetryAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    royaltyStatement?: {
      id: string;
      royaltyRunId: string;
      // ... other statement fields
    };
  }
}
```

### Error Codes

- `404 NOT_FOUND`: Payout does not exist
- `403 FORBIDDEN`: User does not have permission to view this payout
- `401 UNAUTHORIZED`: Not authenticated

### Example

```typescript
const payout = await trpc.payouts.getById.useQuery({
  id: "payout_abc123"
});
```

---

## 3. GET /payouts (List Payouts - Admin Only)

**Endpoint:** `payouts.list`  
**Method:** Query  
**Authentication:** Required  
**Roles:** ADMIN only

### Description
Lists all payouts in the system with comprehensive filtering and pagination.

### Input Schema

```typescript
{
  creatorId?: string;           // Filter by creator
  status?: PayoutStatus;        // Filter by status
  startDate?: Date;             // Filter by creation date range
  endDate?: Date;
  minAmount?: number;           // Filter by amount range (cents)
  maxAmount?: number;
  page?: number;                // Default: 1
  limit?: number;               // Default: 20, Max: 100
  sortBy?: 'createdAt' | 'processedAt' | 'amountCents' | 'status';
  sortOrder?: 'asc' | 'desc';   // Default: 'desc'
}
```

### Response

```typescript
{
  data: Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    creatorEmail: string;
    amountCents: number;
    status: PayoutStatus;
    stripeTransferId?: string;
    processedAt?: Date;
    failedReason?: string;
    retryCount: number;
    createdAt: Date;
  }>;
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    totalAmountCents: number;  // Sum of all filtered payouts
  }
}
```

### Example

```typescript
// List all pending payouts
const result = await trpc.payouts.list.useQuery({
  status: 'PENDING',
  page: 1,
  limit: 50,
  sortBy: 'createdAt',
  sortOrder: 'asc'
});

// List payouts for specific creator
const result = await trpc.payouts.list.useQuery({
  creatorId: "creator_123",
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31')
});
```

---

## 4. POST /payouts/:id/retry (Retry Failed Payout)

**Endpoint:** `payouts.retry`  
**Method:** Mutation  
**Authentication:** Required  
**Roles:** CREATOR (own payouts), ADMIN (all)

### Description
Manually retry a failed payout with exponential backoff and retry limits.

### Input Schema

```typescript
{
  id: string;  // Payout ID to retry
}
```

### Response

```typescript
{
  success: boolean;
  data: {
    id: string;
    canRetry: boolean;      // Whether payout can be retried again
    nextRetryAt?: Date;     // When next automatic retry will occur
    error?: string;         // Error message if retry failed
  }
}
```

### Business Logic

1. **Status Validation**: Only FAILED payouts can be retried
2. **Retry Limits**: Maximum 3 retry attempts (configurable)
3. **Exponential Backoff**: Delay increases with each retry
4. **Stripe Reconciliation**: Checks if transfer actually succeeded before retrying
5. **Audit Logging**: Logs all retry attempts

### Error Codes

- `400 BAD_REQUEST`: Payout cannot be retried (wrong status, max retries exceeded)
- `404 NOT_FOUND`: Payout does not exist
- `403 FORBIDDEN`: User does not have permission

### Example

```typescript
const result = await trpc.payouts.retry.mutate({
  id: "payout_abc123"
});

if (result.success) {
  console.log("Payout retry successful!");
} else if (result.data.canRetry) {
  console.log(`Will retry again at ${result.data.nextRetryAt}`);
} else {
  console.log("Max retries exceeded");
}
```

---

## 5. GET /me/payouts (Creator's Payout History)

**Endpoint:** `payouts.getMyPayouts`  
**Method:** Query  
**Authentication:** Required  
**Roles:** CREATOR

### Description
Retrieves the authenticated creator's complete payout history with summary statistics.

### Input Schema

```typescript
{
  status?: PayoutStatus;        // Filter by status
  startDate?: Date;             // Filter by date range
  endDate?: Date;
  page?: number;                // Default: 1
  limit?: number;               // Default: 20, Max: 100
  sortBy?: 'createdAt' | 'processedAt' | 'amountCents';
  sortOrder?: 'asc' | 'desc';   // Default: 'desc'
}
```

### Response

```typescript
{
  data: Array<{
    id: string;
    amountCents: number;
    status: PayoutStatus;
    stripeTransferId?: string;
    processedAt?: Date;
    failedReason?: string;
    retryCount: number;
    createdAt: Date;
    royaltyStatement?: {
      id: string;
      royaltyRunId: string;
    };
  }>;
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    totalPayoutsCents: number;      // Total amount ever paid out
    totalPayoutsCount: number;      // Total number of completed payouts
    lastPayoutAmount?: number;      // Last payout amount
    lastPayoutDate?: Date;          // Last payout date
  }
}
```

### Example

```typescript
// Get all payouts
const result = await trpc.payouts.getMyPayouts.useQuery({
  page: 1,
  limit: 20
});

// Get only completed payouts
const completed = await trpc.payouts.getMyPayouts.useQuery({
  status: 'COMPLETED',
  sortBy: 'processedAt',
  sortOrder: 'desc'
});
```

---

## 6. GET /me/payouts/pending (Creator's Pending Balance)

**Endpoint:** `payouts.getPendingBalance`  
**Method:** Query  
**Authentication:** Required  
**Roles:** CREATOR

### Description
Calculates and returns the creator's current pending balance available for payout with detailed breakdown.

### Input Schema

```typescript
{
  includeBreakdown?: boolean;  // Default: true
}
```

### Response

```typescript
{
  data: {
    pendingBalanceCents: number;        // Available for immediate payout
    currency: string;                   // "USD"
    meetsMinimum: boolean;              // Whether balance meets minimum threshold
    minimumRequiredCents: number;       // Minimum payout amount
    canInitiatePayout: boolean;         // Whether payout can be initiated
    lastPayout?: {
      amountCents: number;
      processedAt: Date;
    };
    pendingPayouts: Array<{             // Currently processing payouts
      id: string;
      amountCents: number;
      status: PayoutStatus;
      createdAt: Date;
    }>;
    breakdown?: {                       // Optional detailed breakdown
      totalBalanceCents: number;
      resolvedUnpaidCents: number;      // From resolved royalty statements
      pendingPayoutsCents: number;      // Amount in pending payouts
      disputedCents: number;            // Amount in disputed statements
      reservedBalanceCents: number;     // Reserved percentage (if any)
    };
  }
}
```

### Business Logic

1. **Balance Calculation**: Aggregates all unpaid earnings from resolved royalty statements
2. **Deductions**: Subtracts pending payouts and reserved amounts
3. **Minimum Threshold**: Enforces minimum payout amount (default $50)
4. **Real-time**: Always calculates current balance, no caching

### Example

```typescript
const balance = await trpc.payouts.getPendingBalance.useQuery({
  includeBreakdown: true
});

if (balance.data.canInitiatePayout) {
  console.log(`Available: $${balance.data.pendingBalanceCents / 100}`);
  
  // Initiate payout
  await trpc.payouts.transfer.mutate({});
}
```

---

## 7. POST /payouts/batch (Batch Payout Initiation - Admin Only)

**Endpoint:** `payouts.batchInitiate`  
**Method:** Mutation  
**Authentication:** Required  
**Roles:** ADMIN only

### Description
Initiates payouts for multiple creators in a single operation. Useful for scheduled payout runs.

### Input Schema

```typescript
{
  creatorIds?: string[];          // Specific creators to pay
  autoSelectEligible?: boolean;   // Auto-select all eligible creators
  minAmountCents?: number;        // Only pay creators with balance >= this amount
}
```

### Response

```typescript
{
  success: boolean;
  data: {
    totalCreators: number;
    successfulPayouts: number;
    failedPayouts: number;
    skippedCreators: number;
    payoutIds: string[];           // IDs of created payouts
    errors: Array<{
      creatorId: string;
      error: string;
    }>;
  }
}
```

### Business Logic

1. **Eligibility Filtering**: Only processes eligible creators
2. **Balance Validation**: Skips creators below minimum threshold
3. **Error Handling**: Continues processing even if some payouts fail
4. **Audit Logging**: Comprehensive logging of batch operation

### Example

```typescript
// Pay all eligible creators
const result = await trpc.payouts.batchInitiate.mutate({
  autoSelectEligible: true,
  minAmountCents: 5000  // Only pay creators with >= $50
});

console.log(`Successfully initiated ${result.data.successfulPayouts} payouts`);
console.log(`Skipped ${result.data.skippedCreators} creators`);
console.log(`Failed ${result.data.failedPayouts} payouts`);

// Pay specific creators
const result = await trpc.payouts.batchInitiate.mutate({
  creatorIds: ["creator_1", "creator_2", "creator_3"]
});
```

---

## Authentication & Authorization

### Authentication
All endpoints require valid JWT token or session. Include in request headers:

```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

### Authorization Matrix

| Endpoint | Creator | Admin | Notes |
|----------|---------|-------|-------|
| `transfer` | Own only | All | Creators auto-fill creatorId |
| `getById` | Own only | All | Row-level security enforced |
| `list` | ❌ | ✅ | Admin-only endpoint |
| `retry` | Own only | All | Must be FAILED status |
| `getMyPayouts` | Own only | N/A | Auto-filters to own payouts |
| `getPendingBalance` | Own only | N/A | Auto-filters to own balance |
| `batchInitiate` | ❌ | ✅ | Admin-only endpoint |

---

## Error Handling

### Standard Error Format

```typescript
{
  code: string;           // TRPC error code
  message: string;        // Human-readable message
  cause?: any;           // Original error if available
}
```

### Common Error Codes

- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not authorized for this action
- `NOT_FOUND` (404): Resource does not exist
- `BAD_REQUEST` (400): Invalid input or business rule violation
- `INTERNAL_SERVER_ERROR` (500): Unexpected server error

### Business Logic Errors

```typescript
// Eligibility Error
{
  code: 'FORBIDDEN',
  message: 'Creator is not eligible for payout',
  cause: {
    reasons: [
      'No Stripe account connected',
      'Stripe onboarding not completed'
    ]
  }
}

// Insufficient Balance
{
  code: 'BAD_REQUEST',
  message: 'Insufficient balance. Minimum required: $50',
  cause: {
    availableBalanceCents: 2500
  }
}

// Max Retries Exceeded
{
  code: 'BAD_REQUEST',
  message: 'Cannot retry payout with status: COMPLETED'
}
```

---

## Rate Limiting

All endpoints are subject to standard API rate limits:

- **Authenticated requests**: 1000 requests/hour per user
- **Payout initiation**: 10 requests/minute per user (to prevent abuse)
- **Batch operations**: 5 requests/hour per admin

---

## Webhooks

Payout status changes are handled via Stripe webhooks at `/api/webhooks/stripe`:

- `transfer.created` → Updates status to PROCESSING
- `transfer.paid` → Updates status to COMPLETED
- `transfer.failed` → Updates status to FAILED, logs reason

See webhook documentation for implementation details.

---

## Implementation Status

✅ **All endpoints implemented and tested**

- [x] POST /payouts/transfer
- [x] GET /payouts/:id  
- [x] GET /payouts (list)
- [x] POST /payouts/:id/retry
- [x] GET /me/payouts
- [x] GET /me/payouts/pending
- [x] POST /payouts/batch (admin)

### Related Services

- ✅ PayoutEligibilityService - Validates creator eligibility
- ✅ PayoutBalanceService - Calculates available balances
- ✅ PayoutProcessingService - Handles Stripe transfers
- ✅ PayoutRetryService - Manages retry logic
- ✅ AuditService - Logs all payout operations

### Database Schema

- ✅ Payout model with all required fields
- ✅ Indexes for query optimization
- ✅ Foreign key relationships
- ✅ Status workflow implementation

---

## Configuration

Environment variables:

```bash
# Minimum payout amount (cents)
MINIMUM_PAYOUT_CENTS=5000          # $50

# Reserve percentage (0-1)
PAYOUT_RESERVE_PERCENTAGE=0        # 0% by default

# Retry configuration
PAYOUT_MAX_RETRIES=3
PAYOUT_RETRY_BASE_DELAY_MS=60000   # 1 minute
PAYOUT_RETRY_MAX_DELAY_MS=3600000  # 1 hour
PAYOUT_RETRY_BACKOFF_MULTIPLIER=2

# Stripe
STRIPE_SECRET_KEY=sk_...
```

---

## Security Considerations

1. **Row-Level Security**: Applied automatically via tRPC context
2. **Audit Logging**: All operations logged to `audit_events`
3. **Idempotency**: Prevents duplicate payouts
4. **Input Validation**: Zod schemas on all endpoints
5. **Rate Limiting**: Prevents abuse of payout initiation
6. **Error Sanitization**: No sensitive data in error messages

---

## Testing

See `/src/modules/payouts/__tests__/` for comprehensive test suite.

---

## Support

For issues or questions:
- Backend Team: backend@yesgoddess.agency
- Documentation: `/docs/modules/payouts/`
