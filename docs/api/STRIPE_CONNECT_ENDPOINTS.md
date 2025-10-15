# Stripe Connect API Endpoints - Implementation Complete

## Overview

The Stripe Connect API endpoints have been successfully implemented to enable creators to onboard with Stripe and receive payouts. These endpoints provide a complete REST API interface for managing Stripe Connect Express accounts.

## Endpoints Implemented

### 1. POST `/api/payouts/stripe-connect/onboard`
**Start Stripe Connect onboarding process**

- **Authentication**: Required (Creator)
- **Purpose**: Initiates or generates a new Stripe Connect onboarding link for a creator
- **Behavior**:
  - Creates a new Stripe Express account if one doesn't exist
  - Generates onboarding link for existing accounts
  - Stores onboarding session in database for tracking

**Request Body** (Optional):
```json
{
  "returnUrl": "https://yesgoddess.com/dashboard/settings/payouts/return",
  "refreshUrl": "https://yesgoddess.com/dashboard/settings/payouts/refresh"
}
```

**Response** (201 Created for new account, 200 OK for existing):
```json
{
  "success": true,
  "data": {
    "url": "https://connect.stripe.com/setup/...",
    "expiresAt": 1729876543,
    "accountId": "acct_...",
    "isNewAccount": true
  }
}
```

**Error Responses**:
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

---

### 2. GET `/api/payouts/stripe-connect/status`
**Check Stripe Connect account onboarding status**

- **Authentication**: Required (Creator)
- **Purpose**: Retrieves current onboarding and account status from Stripe
- **Behavior**:
  - Fetches real-time account status from Stripe
  - Syncs onboarding status with database
  - Returns comprehensive status information

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "hasAccount": true,
    "accountId": "acct_...",
    "onboardingStatus": "completed",
    "chargesEnabled": false,
    "payoutsEnabled": true,
    "requiresAction": false,
    "requirements": {
      "currentlyDue": [],
      "errors": []
    },
    "isFullyOnboarded": true
  }
}
```

**Status Values**:
- `pending` - Account created but not started onboarding
- `in_progress` - Onboarding form started
- `completed` - Onboarding complete and verified
- `failed` - Account verification failed

**Error Responses**:
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

---

### 3. POST `/api/payouts/stripe-connect/refresh`
**Refresh expired Stripe Connect onboarding link**

- **Authentication**: Required (Creator)
- **Purpose**: Generates a new onboarding link when previous one expired
- **Behavior**:
  - Validates that Stripe account exists
  - Checks if onboarding is already complete
  - Generates fresh onboarding link

**Request Body** (Optional):
```json
{
  "returnUrl": "https://yesgoddess.com/dashboard/settings/payouts/return",
  "refreshUrl": "https://yesgoddess.com/dashboard/settings/payouts/refresh"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "url": "https://connect.stripe.com/setup/...",
    "expiresAt": 1729876543,
    "accountId": "acct_..."
  }
}
```

**Special Response** (onboarding complete):
```json
{
  "success": true,
  "message": "Onboarding is already complete",
  "data": {
    "onboardingComplete": true,
    "accountId": "acct_...",
    "payoutsEnabled": true
  }
}
```

**Error Responses**:
- `400 Bad Request` - No Stripe account exists (must call `/onboard` first)
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

---

### 4. GET `/api/payouts/stripe-connect/account`
**Get detailed Stripe Connect account information**

- **Authentication**: Required (Creator)
- **Purpose**: Retrieves comprehensive account details from Stripe
- **Behavior**:
  - Fetches account with expanded capabilities and external accounts
  - Retrieves current verification requirements
  - Masks sensitive data (bank account numbers, etc.)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "acct_...",
    "type": "express",
    "country": "US",
    "email": "creator@example.com",
    "businessProfile": {
      "name": "Stage Name LLC",
      "url": "https://example.com",
      "supportEmail": "support@example.com",
      "supportPhone": "+1234567890",
      "supportUrl": "https://example.com/support",
      "productDescription": "Music and performance art",
      "mcc": "7929"
    },
    "capabilities": [
      {
        "name": "transfers",
        "status": "active"
      }
    ],
    "externalAccounts": [
      {
        "id": "ba_...",
        "object": "bank_account",
        "bankName": "Chase Bank",
        "last4": "6789",
        "currency": "usd",
        "country": "US",
        "routingNumber": "***1234",
        "default": true
      }
    ],
    "chargesEnabled": false,
    "payoutsEnabled": true,
    "detailsSubmitted": true,
    "requirements": {
      "currentlyDue": [],
      "eventuallyDue": [],
      "pastDue": [],
      "pendingVerification": []
    },
    "created": 1729876543,
    "metadata": {}
  }
}
```

**Special Response** (no account):
```json
{
  "success": true,
  "data": {
    "hasAccount": false,
    "message": "No Stripe account found. Please start onboarding first."
  }
}
```

**Error Responses**:
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

---

### 5. PATCH `/api/payouts/stripe-connect/account`
**Update Stripe Connect account information**

- **Authentication**: Required (Creator)
- **Purpose**: Updates modifiable account information
- **Behavior**:
  - Validates update data
  - Updates account via Stripe API
  - Syncs changes with database
  - Returns updated account data

**Request Body**:
```json
{
  "businessProfile": {
    "name": "Updated Stage Name LLC",
    "url": "https://newwebsite.com",
    "supportEmail": "newsupport@example.com",
    "supportPhone": "+1987654321",
    "productDescription": "Music, performance art, and digital content"
  },
  "settings": {
    "payouts": {
      "schedule": {
        "interval": "weekly"
      }
    }
  },
  "metadata": {
    "customField": "value"
  }
}
```

**All fields are optional**

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Account updated successfully",
  "data": {
    "id": "acct_...",
    "businessProfile": {
      "name": "Updated Stage Name LLC",
      "url": "https://newwebsite.com",
      "supportEmail": "newsupport@example.com",
      "supportPhone": "+1987654321",
      "productDescription": "Music, performance art, and digital content"
    },
    "metadata": {
      "customField": "value"
    }
  }
}
```

**Error Responses**:
- `400 Bad Request` - Invalid data or field cannot be updated
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

**Important Notes**:
- Many fields are restricted by Stripe after verification
- Updating verified information may require re-verification
- Some fields can only be updated through Stripe's hosted pages

---

## Integration with Existing Services

### StripeConnectService
All endpoints utilize the existing `StripeConnectService` from `/src/modules/creators/services/stripe-connect.service.ts`:

- `createAccount()` - Creates new Stripe Connect account
- `getOnboardingLink()` - Generates onboarding links
- `refreshOnboardingLink()` - Refreshes expired links
- `getAccountStatus()` - Retrieves and syncs status
- `getAccountRequirements()` - Fetches verification requirements
- `updateAccountInfo()` - Updates account data

### Audit Logging
All operations are logged via `AuditService`:

- `STRIPE_ACCOUNT_CREATED` - New account creation
- `STRIPE_ONBOARDING_LINK_GENERATED` - Link generation for existing account
- `STRIPE_ONBOARDING_LINK_REFRESHED` - Link refresh
- `STRIPE_ACCOUNT_UPDATED` - Account information update

### Database Models
Utilizes existing Prisma models:

- `Creator` - Main creator profile with `stripeAccountId`
- `StripeOnboardingSession` - Tracks onboarding sessions
- `StripeAccountCapability` - Tracks account capabilities
- `StripeAccountRequirement` - Tracks verification requirements

### Webhook Integration
The existing webhook handler at `/api/webhooks/stripe/route.ts` processes:

- `account.updated` - Syncs account status changes
- `transfer.created` - Payout initiation
- `transfer.paid` - Successful payout
- `transfer.failed` - Failed payout

---

## Security Features

### Authentication
- All endpoints require NextAuth session authentication
- User must have an active creator profile
- Session validated via `getServerSession(authOptions)`

### Authorization
- Creators can only access their own account data
- Account ID lookup via authenticated user's creator profile
- No admin privileges required (creator self-service)

### Data Security
- Sensitive data masked (routing numbers show last 4 digits)
- Bank account numbers never exposed
- Full Stripe account details restricted to account owner

### Audit Trail
- All operations logged with:
  - User ID and creator ID
  - IP address and user agent
  - Action type and timestamp
  - Before/after states

### Rate Limiting
- Inherits Next.js API route rate limiting
- Stripe API has built-in rate limits
- Consider implementing Redis-based rate limiting for production

---

## Error Handling

### Consistent Error Format
```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": {} // Optional additional context
}
```

### HTTP Status Codes
- `200 OK` - Successful request
- `201 Created` - New resource created
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server/Stripe error

### Stripe-Specific Errors
- `StripeInvalidRequestError` - Invalid parameters (400)
- `StripeAuthenticationError` - API key issues (500)
- `StripeAPIError` - Stripe service error (500)
- `StripeConnectionError` - Network issues (500)

---

## Environment Variables Required

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...

# Application URLs
NEXT_PUBLIC_APP_URL=https://yesgoddess.com

# NextAuth Configuration
NEXTAUTH_SECRET=...
NEXTAUTH_URL=...

# Database
DATABASE_URL=...
```

---

## Testing Recommendations

### Unit Tests
- Test authentication validation
- Test input validation
- Test error handling
- Mock Stripe API calls

### Integration Tests
- Test full onboarding flow
- Test account status sync
- Test link refresh scenarios
- Test account updates

### End-to-End Tests
1. **New Creator Onboarding**
   - Call `/onboard` (creates account)
   - Verify account link generated
   - Check `/status` shows pending
   - Complete onboarding in Stripe
   - Verify `/status` shows completed

2. **Existing Creator**
   - Call `/onboard` (returns existing)
   - Verify same account ID
   - Call `/refresh` when link expires
   - Update account via `/account` PATCH

3. **Account Details**
   - Complete onboarding
   - Call `/account` GET
   - Verify all fields present
   - Update business profile
   - Verify changes persisted

### Stripe Test Mode
Use Stripe test accounts for development:
- Test account creation
- Test onboarding completion
- Test verification scenarios
- Test webhook events

---

## Production Deployment Checklist

- [ ] Switch to Stripe live API keys
- [ ] Configure webhook endpoint in Stripe Dashboard
- [ ] Set up production return/refresh URLs
- [ ] Enable rate limiting (Redis-based)
- [ ] Configure monitoring/alerting
- [ ] Test webhook signature verification
- [ ] Verify audit logging working
- [ ] Test all error scenarios
- [ ] Document API for frontend team
- [ ] Create Postman/Thunder collection

---

## Frontend Integration Guide

### Onboarding Flow

```typescript
// 1. Start onboarding
const { data } = await fetch('/api/payouts/stripe-connect/onboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    returnUrl: `${window.location.origin}/dashboard/settings/payouts/return`,
    refreshUrl: `${window.location.origin}/dashboard/settings/payouts/refresh`,
  }),
});

// 2. Redirect user to Stripe
window.location.href = data.url;

// 3. On return page, check status
const status = await fetch('/api/payouts/stripe-connect/status');
if (status.data.isFullyOnboarded) {
  // Show success message
} else {
  // Show requirements or retry
}
```

### Refresh Expired Link

```typescript
const { data } = await fetch('/api/payouts/stripe-connect/refresh', {
  method: 'POST',
});

if (data.onboardingComplete) {
  // Already done!
} else {
  // Redirect to new link
  window.location.href = data.url;
}
```

### Display Account Info

```typescript
const { data } = await fetch('/api/payouts/stripe-connect/account');

// Display business profile
console.log(data.businessProfile.name);
console.log(data.businessProfile.url);

// Show bank account (masked)
console.log(`Bank: ${data.externalAccounts[0].bankName} ****${data.externalAccounts[0].last4}`);

// Check requirements
if (data.requirements.currentlyDue.length > 0) {
  // Show missing requirements
}
```

### Update Account

```typescript
await fetch('/api/payouts/stripe-connect/account', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    businessProfile: {
      url: 'https://newwebsite.com',
      supportEmail: 'support@newdomain.com',
    },
  }),
});
```

---

## Architecture Decisions

### REST API vs tRPC
- Chose REST API for these endpoints to maintain consistency with existing payout endpoints
- REST provides better compatibility with webhooks and external integrations
- tRPC procedures already exist in `creatorsRouter` for internal use

### Session-based Authentication
- Uses NextAuth sessions for authentication
- Follows existing pattern in other API routes
- Provides consistent security model

### Service Layer Pattern
- All Stripe logic encapsulated in `StripeConnectService`
- API routes are thin controllers
- Promotes code reuse (service used by both REST and tRPC)

### Database Sync Strategy
- Account status synced on every status check
- Webhook updates provide real-time sync
- Onboarding sessions tracked for analytics

---

## Related Documentation

- [Stripe Connect Implementation](../../docs/modules/creators/STRIPE_CONNECT_IMPLEMENTATION.md)
- [Payout Tables](../../docs/modules/payouts/tables.md)
- [Payout Overview](../../docs/modules/payouts/overview.md)
- [Creator Module](../../docs/modules/creators/quick-reference.md)
- [Webhook Handler](./webhooks/stripe/route.ts)

---

## Maintenance Notes

### Common Issues

**"No Stripe account found"**
- User needs to call `/onboard` first
- Return proper 400 error with `action: 'start_onboarding'`

**Link Expired**
- Links expire after ~1 hour
- Call `/refresh` to generate new link
- Frontend should handle gracefully

**Update Fails with "Invalid Request"**
- Field may be verified and locked
- Stripe may require re-verification
- Some fields only changeable via Stripe UI

**Status Shows requiresAction but no currentlyDue**
- Check `eventuallyDue` for upcoming requirements
- Check for errors in account requirements
- May need manual review by Stripe

### Monitoring

Track these metrics:
- Onboarding completion rate
- Average time to complete onboarding
- Link expiration/refresh rate
- Account update success rate
- Webhook processing latency

---

## Implementation Complete ✅

All five endpoints have been successfully implemented and are ready for use:

1. ✅ POST `/api/payouts/stripe-connect/onboard` - Start onboarding
2. ✅ GET `/api/payouts/stripe-connect/status` - Check status
3. ✅ POST `/api/payouts/stripe-connect/refresh` - Refresh link
4. ✅ GET `/api/payouts/stripe-connect/account` - Account details
5. ✅ PATCH `/api/payouts/stripe-connect/account` - Update account

**The work is sacred. The creator is sovereign. The payments are seamless.**
