# ⚡ Stripe Webhooks Module - Frontend Integration Guide

**Classification**: ⚡ HYBRID - Core functionality used by both admin and public website, with different access levels

---

## 📋 Module Overview

The Stripe Webhooks module handles real-time processing of Stripe events to keep payout statuses, account information, and payment data synchronized. **This is a backend-only module** - there are no direct frontend endpoints, but the frontend should understand the real-time updates it enables.

### Key Capabilities
- **Payout Status Updates** - Real-time payout status changes from Stripe transfers
- **Account Synchronization** - Stripe Connect account status updates 
- **Payment Processing** - Payment intent status changes
- **Signature Verification** - Secure webhook validation with replay attack prevention
- **Idempotency Handling** - Duplicate event prevention

---

## 🚀 1. API Endpoints

### 1.1 POST `/api/webhooks/stripe` (Backend Only)
**External webhook receiver for Stripe events**

- **Authentication**: Stripe signature verification only (not user authentication)
- **Purpose**: Receives and processes Stripe webhook events
- **Access**: External - called by Stripe, not frontend

**Request Headers Required**:
```typescript
{
  'stripe-signature': string; // Required for verification
  'content-type': 'application/json';
}
```

**Response Formats**:
```typescript
// Success
{
  received: boolean;
  eventId: string;
}

// Duplicate event (still success)
{
  received: boolean;
  duplicate: boolean;
}

// Error responses
{
  error: string;
}
```

**HTTP Status Codes**:
- `200` - Event processed successfully
- `400` - Bad request / Replay attack 
- `401` - Invalid signature
- `500` - Processing error (triggers Stripe retry)

---

## 🔧 2. TypeScript Type Definitions

### 2.1 Webhook Event Types

```typescript
// Stripe webhook events handled by the backend
export enum StripeWebhookEventType {
  TRANSFER_CREATED = 'transfer.created',
  TRANSFER_UPDATED = 'transfer.updated', 
  TRANSFER_PAID = 'transfer.paid',
  TRANSFER_FAILED = 'transfer.failed',
  TRANSFER_REVERSED = 'transfer.reversed',
  PAYOUT_PAID = 'payout.paid',
  ACCOUNT_UPDATED = 'account.updated',
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED = 'payment_intent.payment_failed'
}

// Payout status changes triggered by webhooks
export enum PayoutStatus {
  PENDING = 'PENDING',        // Initial status
  PROCESSING = 'PROCESSING',  // transfer.created received
  COMPLETED = 'COMPLETED',    // transfer.paid received  
  FAILED = 'FAILED'          // transfer.failed/reversed received
}

// Webhook processing result
interface WebhookProcessingResult {
  received: boolean;
  eventId: string;
  duplicate?: boolean;
  error?: string;
}
```

### 2.2 Payout Status Updates

```typescript
// Real-time payout status transitions
interface PayoutStatusUpdate {
  payoutId: string;
  status: PayoutStatus;
  stripeTransferId?: string;
  processedAt?: Date;
  failedReason?: string;
  metadata: {
    amount: number;
    currency: string;
    arrivalDate?: number; // Unix timestamp
    eventType: StripeWebhookEventType;
  };
}

// Account status update from webhooks
interface AccountStatusUpdate {
  creatorId: string;
  stripeAccountId: string;
  onboardingStatus: 'pending' | 'completed' | 'restricted';
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requirementsCount: number;
  updatedAt: Date;
}
```

---

## 📊 3. Business Logic & Validation Rules

### 3.1 Webhook Event Processing Rules

**Event Processing Order**:
1. **Signature Verification** - Validates request authenticity
2. **Replay Attack Prevention** - Checks timestamp (5-minute window)
3. **Idempotency Check** - Prevents duplicate processing
4. **Database Updates** - Updates payout/account status
5. **Notifications** - Triggers user notifications

**Payout Status Transitions**:
```typescript
// Valid status transitions via webhooks
const VALID_TRANSITIONS = {
  PENDING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'], 
  COMPLETED: ['FAILED'], // Only via reversal
  FAILED: [] // Terminal state
} as const;
```

### 3.2 Data Consistency Rules

- **Amount Validation**: Webhook amounts must match database payout amounts
- **Orphaned Events**: Events for non-existent payouts are logged but not processed
- **Status Conflicts**: Invalid status transitions are logged as audit events
- **Retry Logic**: Failed webhook processing triggers Stripe retry (via 500 status)

---

## ⚠️ 4. Error Handling

### 4.1 Webhook-Specific Error Codes

| Error Code | HTTP Status | Description | Frontend Action |
|------------|-------------|-------------|-----------------|
| `INVALID_SIGNATURE` | 401 | Stripe signature verification failed | No action - backend only |
| `MISSING_SIGNATURE` | 401 | No stripe-signature header | No action - backend only |
| `DUPLICATE_EVENT` | 200 | Event already processed | No action - success response |
| `REPLAY_ATTACK` | 400 | Event timestamp too old | No action - backend only |
| `PROCESSING_ERROR` | 500 | Database/notification error | Monitor for payout delays |

### 4.2 Frontend Error Monitoring

**What Frontend Should Monitor**:
```typescript
// Monitor these patterns in payout data
interface PayoutStatusMonitoring {
  // Payouts stuck in PROCESSING for >24 hours
  staleProcessingPayouts: Payout[];
  
  // Failed payouts that may need user action
  failedPayouts: {
    payout: Payout;
    retryable: boolean;
    userActionRequired: boolean;
  }[];
  
  // Account issues affecting payouts
  accountIssues: {
    creatorId: string;
    payoutsDisabled: boolean;
    requirementsCount: number;
  }[];
}
```

---

## 🔐 5. Authorization & Permissions

### 5.1 Webhook Security

**Webhook Endpoint Security**:
- No user authentication required
- Stripe signature verification mandatory
- IP allowlisting not implemented (relies on signature)
- Rate limiting handled by Stripe

### 5.2 Frontend Permission Requirements

**For Viewing Webhook Effects**:
```typescript
// Frontend permissions needed to see webhook results
interface WebhookDataPermissions {
  // View payout status updates (webhook effects)
  viewPayouts: 'own' | 'all'; // Creators: own, Admins: all
  
  // View account status updates  
  viewAccountStatus: 'own' | 'all'; // Creators: own, Admins: all
  
  // View audit logs of webhook processing
  viewWebhookLogs: boolean; // Admin only
}
```

---

## ⏱️ 6. Rate Limiting & Quotas

### 6.1 Stripe Webhook Rate Limits

**Stripe-Imposed Limits**:
- **Retry Policy**: Stripe retries failed webhooks with exponential backoff
- **Max Retries**: Up to 3 days of retries for 4xx/5xx responses  
- **Timeout**: 30-second webhook timeout
- **Concurrent**: Up to 10 concurrent webhook requests per endpoint

**Backend Processing Limits**:
- **Signature Verification**: 5-minute timestamp tolerance
- **Idempotency Window**: 24-hour duplicate detection
- **Database Timeouts**: 10-second transaction timeout

### 6.2 Frontend Rate Limiting

**No Direct Rate Limits** - Webhooks don't affect frontend API limits, but:
- Webhook-triggered notifications count toward notification rate limits
- Rapid payout status changes may cause UI update throttling

---

## 🔄 7. Real-time Updates

### 7.1 Webhook-Triggered Events

**Events Frontend Should Listen For**:
```typescript
// WebSocket/Server-Sent Events from webhook processing
interface WebhookTriggeredEvents {
  // Payout status changes
  'payout:status_updated': {
    payoutId: string;
    oldStatus: PayoutStatus;
    newStatus: PayoutStatus;
    timestamp: Date;
  };
  
  // Account capability changes
  'account:status_updated': {
    creatorId: string;
    payoutsEnabled: boolean;
    requirementsCount: number;
    timestamp: Date;
  };
  
  // Critical events (reversals, failures)
  'payout:critical_update': {
    payoutId: string;
    eventType: 'reversal' | 'failure';
    message: string;
    actionRequired: boolean;
  };
}
```

### 7.2 Polling Recommendations

**When Real-time Isn't Available**:
```typescript
// Polling intervals for webhook-affected data
const POLLING_INTERVALS = {
  payoutStatus: 30000,      // 30s for active payouts
  accountStatus: 300000,    // 5min for account changes
  auditLogs: 600000        // 10min for webhook logs (admin)
} as const;

// Only poll during active states
const shouldPoll = (status: PayoutStatus) => 
  ['PENDING', 'PROCESSING'].includes(status);
```

---

## 📄 8. Pagination & Filtering

### 8.1 Webhook Audit Logs (Admin Only)

**Endpoint**: `GET /api/admin/webhooks/logs`

```typescript
interface WebhookLogFilters {
  eventType?: StripeWebhookEventType;
  status?: 'success' | 'failed' | 'duplicate';
  startDate?: Date;
  endDate?: Date;
  entityId?: string; // Payout ID, account ID, etc.
}

interface WebhookLogResponse {
  logs: WebhookLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
  filters: WebhookLogFilters;
}
```

---

## ✅ 9. Frontend Implementation Checklist

### 9.1 Real-time Status Updates
- [ ] **Implement WebSocket/SSE listeners** for payout status changes
- [ ] **Handle status transitions** gracefully in UI (loading states)
- [ ] **Show processing indicators** for PROCESSING status payouts
- [ ] **Display failure reasons** for FAILED status payouts

### 9.2 Error State Management
- [ ] **Monitor stale payouts** (PROCESSING >24 hours)
- [ ] **Alert on critical events** (reversals require immediate attention) 
- [ ] **Graceful degradation** when real-time updates fail
- [ ] **Retry mechanisms** for failed status fetches

### 9.3 User Experience
- [ ] **Visual status indicators** for payout progression
- [ ] **Estimated arrival times** from webhook data
- [ ] **Actionable error messages** for account issues
- [ ] **Loading states** during status transitions

### 9.4 Admin Dashboard (Admin Only)
- [ ] **Webhook processing metrics** and success rates
- [ ] **Failed webhook investigation** tools
- [ ] **Manual webhook replay** capability
- [ ] **Account synchronization** status monitoring

---

## 🎯 10. Edge Cases to Handle

### 10.1 Webhook Processing Failures

**When Webhooks Fail**:
```typescript
// Frontend fallback strategies
interface WebhookFailureFallbacks {
  // Manual status sync via API
  manualSync: () => Promise<PayoutStatus>;
  
  // Polling until status resolves
  pollUntilResolved: (payoutId: string) => Promise<void>;
  
  // User notification of delays
  notifyDelay: (estimatedDelay: number) => void;
}
```

### 10.2 Data Inconsistencies

**Handling Mismatched Data**:
- **Amount Mismatches**: Show warning, prefer Stripe data
- **Orphaned Events**: Log for investigation, don't show user
- **Status Conflicts**: Show last known good status with refresh option

### 10.3 Network Issues

**Connection Problems**:
- **Webhook Retries**: Stripe handles automatic retries
- **Frontend Updates**: Implement exponential backoff polling
- **Offline Mode**: Cache last known statuses, sync when online

---

## 🔍 11. UX Considerations

### 11.1 Status Communication

**User-Friendly Status Messages**:
```typescript
const STATUS_MESSAGES = {
  PENDING: 'Payout initiated - processing will begin shortly',
  PROCESSING: 'Payout in progress - funds will arrive in 1-2 business days', 
  COMPLETED: 'Payout completed - funds have been transferred',
  FAILED: 'Payout failed - please check your account settings'
} as const;
```

### 11.2 Critical Events

**High-Priority Notifications**:
- **Reversals**: Immediate notification with support contact
- **Account Restrictions**: Actionable steps to resolve
- **Processing Delays**: Proactive status updates

### 11.3 Progressive Enhancement

**Graceful Degradation**:
- Work without real-time updates (polling fallback)
- Show cached status with refresh timestamps  
- Maintain functionality during webhook outages

---

## 📚 12. Testing Considerations

### 12.1 Webhook Testing

**Frontend Testing Scenarios**:
```typescript
// Mock webhook event scenarios for testing
interface WebhookTestScenarios {
  successful_payout: PayoutStatusUpdate;
  failed_payout: PayoutStatusUpdate;
  reversed_payout: PayoutStatusUpdate;
  account_restricted: AccountStatusUpdate;
  processing_delay: PayoutStatusUpdate;
}
```

### 12.2 Error Simulation

**Test Error Conditions**:
- Webhook processing delays (show loading states)
- Status transition failures (show error states)
- Real-time connection loss (fallback to polling)

---

## 🔗 13. Integration Points

### 13.1 Related Modules

**Dependencies**:
- **Payout Processing** - Status updates flow into payout views
- **Stripe Connect** - Account status changes affect payout eligibility  
- **Notifications** - Webhook events trigger user notifications
- **Audit Logging** - All webhook events are audited

### 13.2 Data Flow

```typescript
// How webhook data flows to frontend
Stripe → Webhook → Database → Real-time Event → Frontend Update
                            ↘ Notification → User Alert
```

---

## ⚡ 14. Performance Considerations

### 14.1 Real-time Updates

**Optimization Strategies**:
- **Selective Subscriptions**: Only listen for relevant user's events
- **Update Batching**: Group rapid status changes
- **UI Debouncing**: Prevent excessive re-renders

### 14.2 Polling Efficiency

**When Real-time Fails**:
```typescript
// Efficient polling strategy
const optimizedPolling = {
  activePayouts: 30000,    // Frequent for in-progress
  completedPayouts: 0,     // No polling needed
  failedPayouts: 300000,   // Occasional retry checks
} as const;
```

---

## 📋 Summary

The Stripe Webhooks module is **backend-only** but critical for real-time user experience. Frontend developers should:

1. **Implement real-time listeners** for payout and account status changes
2. **Handle all status transitions** gracefully with appropriate UI states  
3. **Provide fallback polling** when real-time updates fail
4. **Monitor for critical events** that require immediate user attention
5. **Test webhook scenarios** thoroughly with mocked events

The webhooks ensure users see payout progress immediately rather than waiting for manual status checks or batch updates.
