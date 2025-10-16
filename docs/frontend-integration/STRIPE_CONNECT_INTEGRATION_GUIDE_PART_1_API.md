# 🌐 Stripe Connect Payouts - Frontend Integration Guide (Part 1: API Reference)

> **Classification**: ⚡ HYBRID - Core functionality used by both public website (creators) and admin backend (monitoring)

## Overview

This document provides comprehensive API reference for the Stripe Connect payout module. The backend provides REST API endpoints for creators to manage their Stripe Connect accounts and receive payouts.

**Frontend Repository**: yesgoddess-web (Next.js 15 + App Router + TypeScript)  
**Backend API Base**: `https://ops.yesgoddess.agency/api`  
**Module Path**: `/payouts/stripe-connect/`

---

## 1. API Endpoints

### 1.1 POST `/api/payouts/stripe-connect/onboard`
**Start Stripe Connect onboarding process**

#### Authentication
- ✅ **Required**: NextAuth JWT session
- 🔒 **Role**: Creator with active profile

#### Purpose
Initiates Stripe Connect onboarding for creators to receive payouts.

#### Request
```typescript
interface OnboardRequest {
  returnUrl?: string;  // Optional: Where Stripe redirects after success
  refreshUrl?: string; // Optional: Where Stripe redirects if link expires
}
```

**Example Request**:
```typescript
const response = await fetch('/api/payouts/stripe-connect/onboard', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.accessToken}`,
  },
  body: JSON.stringify({
    returnUrl: `${window.location.origin}/dashboard/payouts/complete`,
    refreshUrl: `${window.location.origin}/dashboard/payouts/refresh`,
  }),
});
```

#### Response
```typescript
interface OnboardResponse {
  success: true;
  data: {
    url: string;           // Stripe onboarding URL to redirect user to
    expiresAt: number;     // Unix timestamp when link expires (~1 hour)
    accountId: string;     // Stripe account ID (acct_...)
    isNewAccount: boolean; // true if new account created, false if existing
  };
}
```

**Success Response** (201 for new account, 200 for existing):
```json
{
  "success": true,
  "data": {
    "url": "https://connect.stripe.com/setup/e/acct_...",
    "expiresAt": 1729876543,
    "accountId": "acct_1ABC234DEF567890",
    "isNewAccount": true
  }
}
```

#### Error Responses
| Status | Error Type | Cause | Action Required |
|--------|------------|-------|-----------------|
| `401` | `Unauthorized` | No valid session | Redirect to login |
| `404` | `Not Found` | Creator profile missing | Complete profile setup |
| `500` | `Internal Server Error` | Stripe API failure | Show error, retry button |

---

### 1.2 GET `/api/payouts/stripe-connect/status`
**Check Stripe Connect account status**

#### Authentication
- ✅ **Required**: NextAuth JWT session
- 🔒 **Role**: Creator with active profile

#### Purpose
Retrieves real-time account status and onboarding progress from Stripe.

#### Request
```typescript
const response = await fetch('/api/payouts/stripe-connect/status', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${session.accessToken}`,
  },
});
```

#### Response
```typescript
interface StatusResponse {
  success: true;
  data: {
    hasAccount: boolean;        // Whether Stripe account exists
    accountId: string | null;   // Stripe account ID if exists
    onboardingStatus: OnboardingStatus;
    chargesEnabled: boolean;    // Can accept payments
    payoutsEnabled: boolean;    // Can receive payouts
    requiresAction: boolean;    // Needs user attention
    requirements: {
      currentlyDue: string[];   // Fields needed now
      errors: string[];         // Verification errors
    };
    isFullyOnboarded: boolean; // Ready for payouts
  };
}

type OnboardingStatus = 
  | 'pending'              // Account created but onboarding not started
  | 'in_progress'          // Onboarding form started
  | 'pending_verification' // Waiting for Stripe verification
  | 'completed'            // Onboarding complete and verified
  | 'failed';              // Verification failed
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "hasAccount": true,
    "accountId": "acct_1ABC234DEF567890",
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

#### Error Responses
| Status | Error Type | Cause | Action Required |
|--------|------------|-------|-----------------|
| `401` | `Unauthorized` | No valid session | Redirect to login |
| `404` | `Not Found` | Creator profile missing | Complete profile setup |
| `500` | `Internal Server Error` | Stripe API failure | Show error, retry button |

---

### 1.3 POST `/api/payouts/stripe-connect/refresh`
**Refresh expired onboarding link**

#### Authentication
- ✅ **Required**: NextAuth JWT session
- 🔒 **Role**: Creator with existing Stripe account

#### Purpose
Generates a new onboarding link when the previous one expired.

#### Request
```typescript
interface RefreshRequest {
  returnUrl?: string;  // Optional: Override return URL
  refreshUrl?: string; // Optional: Override refresh URL
}
```

#### Response
```typescript
interface RefreshResponse {
  success: true;
  data: {
    url: string;       // New Stripe onboarding URL
    expiresAt: number; // Unix timestamp when link expires
    accountId: string; // Stripe account ID
  };
}

// OR if onboarding already complete:
interface RefreshCompleteResponse {
  success: true;
  message: "Onboarding is already complete";
  data: {
    onboardingComplete: true;
    accountId: string;
    payoutsEnabled: boolean;
  };
}
```

#### Error Responses
| Status | Error Type | Cause | Action Required |
|--------|------------|-------|-----------------|
| `400` | `Bad Request` | No Stripe account exists | Call `/onboard` first |
| `401` | `Unauthorized` | No valid session | Redirect to login |
| `404` | `Not Found` | Creator profile missing | Complete profile setup |
| `500` | `Internal Server Error` | Stripe API failure | Show error, retry button |

---

### 1.4 GET `/api/payouts/stripe-connect/account`
**Get detailed account information**

#### Authentication
- ✅ **Required**: NextAuth JWT session
- 🔒 **Role**: Creator with Stripe account

#### Purpose
Retrieves comprehensive account details, business profile, and bank account info.

#### Response
```typescript
interface AccountResponse {
  success: true;
  data: StripeAccountDetails | NoAccountResponse;
}

interface StripeAccountDetails {
  id: string;
  type: 'express';
  country: string;
  email: string;
  businessProfile: {
    name: string;
    url?: string;
    supportEmail?: string;
    supportPhone?: string;
    supportUrl?: string;
    productDescription?: string;
    mcc?: string; // Merchant Category Code
  } | null;
  capabilities: Array<{
    name: string;  // 'transfers', 'card_payments', etc.
    status: string; // 'active', 'pending', 'inactive'
  }>;
  externalAccounts: Array<{
    id: string;
    object: 'bank_account';
    bankName: string;
    last4: string;           // Only last 4 digits shown
    currency: string;
    country: string;
    routingNumber: string;   // Masked: "***1234"
    default: boolean;
  }>;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: StripeRequirement[];
    eventuallyDue: StripeRequirement[];
    pastDue: StripeRequirement[];
    pendingVerification: StripeRequirement[];
  };
  created: number; // Unix timestamp
  metadata: Record<string, string>;
}

interface StripeRequirement {
  fieldName: string;
  requirementType: 'currently_due' | 'eventually_due' | 'past_due' | 'pending_verification';
  deadline: string | null; // ISO date string
  errorCode: string | null;
  errorReason: string | null;
  description: string;
}

interface NoAccountResponse {
  hasAccount: false;
  message: "No Stripe account found. Please start onboarding first.";
}
```

#### Error Responses
| Status | Error Type | Cause | Action Required |
|--------|------------|-------|-----------------|
| `401` | `Unauthorized` | No valid session | Redirect to login |
| `404` | `Not Found` | Creator profile missing | Complete profile setup |
| `500` | `Internal Server Error` | Stripe API failure | Show error, retry button |

---

### 1.5 PATCH `/api/payouts/stripe-connect/account`
**Update account information**

#### Authentication
- ✅ **Required**: NextAuth JWT session
- 🔒 **Role**: Creator with Stripe account

#### Purpose
Updates modifiable account information (business profile, settings, metadata).

#### Request
```typescript
interface UpdateAccountRequest {
  businessProfile?: {
    name?: string;              // Max 255 chars
    url?: string;               // Valid URL
    supportEmail?: string;      // Valid email
    supportPhone?: string;      // Phone number
    productDescription?: string; // Max 500 chars
  };
  settings?: {
    payouts?: {
      schedule?: {
        interval?: 'daily' | 'weekly' | 'monthly' | 'manual';
      };
    };
  };
  metadata?: Record<string, string>; // Custom key-value pairs
}
```

**Example Request**:
```typescript
const response = await fetch('/api/payouts/stripe-connect/account', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.accessToken}`,
  },
  body: JSON.stringify({
    businessProfile: {
      name: "Updated Stage Name LLC",
      url: "https://newwebsite.com",
      supportEmail: "newsupport@example.com",
      productDescription: "Music, performance art, and digital content"
    },
    settings: {
      payouts: {
        schedule: {
          interval: "weekly"
        }
      }
    }
  }),
});
```

#### Response
```typescript
interface UpdateAccountResponse {
  success: true;
  message: "Account updated successfully";
  data: {
    id: string;
    businessProfile: {
      name: string;
      url?: string;
      supportEmail?: string;
      supportPhone?: string;
      productDescription?: string;
    } | null;
    metadata: Record<string, string>;
  };
}
```

#### Error Responses
| Status | Error Type | Details | Cause |
|--------|------------|---------|-------|
| `400` | `Bad Request` | Validation errors | Invalid input data |
| `400` | `Invalid Request` | Field conflicts | Verified field cannot be changed |
| `401` | `Unauthorized` | Authentication failed | No valid session |
| `404` | `Not Found` | Resource missing | Creator profile or Stripe account not found |
| `500` | `Stripe Error` | External service error | Stripe API failure |

---

## 2. Query Parameters & Filters

### 2.1 None Required
All endpoints use path-based routing and request bodies. No query parameters are needed.

### 2.2 URL Construction
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

const endpoints = {
  onboard: `${API_BASE}/api/payouts/stripe-connect/onboard`,
  status: `${API_BASE}/api/payouts/stripe-connect/status`,
  refresh: `${API_BASE}/api/payouts/stripe-connect/refresh`,
  account: `${API_BASE}/api/payouts/stripe-connect/account`,
} as const;
```

---

## 3. Authentication Requirements

### 3.1 Session Validation
All endpoints require a valid NextAuth session:

```typescript
import { getSession } from 'next-auth/react';

const session = await getSession();
if (!session?.user?.id) {
  // Redirect to login
  router.push('/auth/signin');
  return;
}
```

### 3.2 Creator Profile Requirement
- User must have an active creator profile
- Profile cannot be soft-deleted (`deletedAt: null`)
- Returns `404 Not Found` if creator profile is missing

### 3.3 Request Headers
```typescript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${session.accessToken}`, // If using JWT
  // OR rely on cookies for NextAuth session
};
```

---

## 4. Rate Limiting & Quotas

### 4.1 API Rate Limits
- **Inherits Next.js default rate limiting**
- **Stripe API limits**: Built-in rate limiting on Stripe side
- **Recommended**: Implement client-side debouncing for rapid requests

### 4.2 Response Headers
Monitor these headers for rate limit information:
```typescript
const rateLimitHeaders = {
  'X-RateLimit-Limit': response.headers.get('X-RateLimit-Limit'),
  'X-RateLimit-Remaining': response.headers.get('X-RateLimit-Remaining'),
  'X-RateLimit-Reset': response.headers.get('X-RateLimit-Reset'),
  'Retry-After': response.headers.get('Retry-After'), // If 429 status
};
```

### 4.3 Best Practices
```typescript
// Debounce account updates
import { debounce } from 'lodash';

const debouncedUpdate = debounce(async (updateData) => {
  await fetch('/api/payouts/stripe-connect/account', {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  });
}, 1000);

// Cache status checks
const { data: accountStatus } = useSWR(
  '/api/payouts/stripe-connect/status',
  fetcher,
  { refreshInterval: 30000 } // Refresh every 30 seconds
);
```

---

## 5. Error Response Format

### 5.1 Standard Error Structure
```typescript
interface ApiErrorResponse {
  success?: false; // May be omitted on errors
  error: string;   // Error type/category
  message: string; // Human-readable error message
  details?: any;   // Optional additional context
}
```

### 5.2 Validation Errors
```typescript
interface ValidationErrorResponse {
  error: "Bad Request";
  message: "Invalid request data";
  details: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}
```

### 5.3 Stripe-Specific Errors
```typescript
interface StripeErrorResponse {
  error: "Stripe Error" | "Invalid Request";
  message: string; // Stripe's error message
  details?: string; // Additional context
}
```

---

## 6. Pagination & Filtering

### 6.1 Not Applicable
The Stripe Connect endpoints return single resources (account details, status) rather than lists, so pagination is not needed.

### 6.2 Future Considerations
If you need to list multiple accounts or historical data:
- Consider separate endpoints like `/api/payouts/stripe-connect/history`
- Use standard cursor-based pagination
- Implement date range filtering

---

## 7. Real-time Updates

### 7.1 Webhook Events
The backend processes Stripe webhooks for real-time account updates:

**Webhook Events Handled**:
- `account.updated` - Account verification status changes
- `transfer.created` - Payout initiated
- `transfer.paid` - Payout completed
- `transfer.failed` - Payout failed

### 7.2 Frontend Polling Strategy
```typescript
// Poll status during onboarding
const useOnboardingStatus = () => {
  const [isOnboarding, setIsOnboarding] = useState(false);
  
  const { data: status } = useSWR(
    isOnboarding ? '/api/payouts/stripe-connect/status' : null,
    fetcher,
    {
      refreshInterval: isOnboarding ? 5000 : 0, // Poll every 5s during onboarding
      onSuccess: (data) => {
        if (data.isFullyOnboarded) {
          setIsOnboarding(false);
        }
      }
    }
  );
  
  return { status, startPolling: () => setIsOnboarding(true) };
};
```

### 7.3 WebSocket Integration (Future)
Consider implementing WebSocket connections for real-time status updates:
```typescript
// Future implementation
const socket = io('/stripe-connect-status');
socket.on('account-updated', (accountData) => {
  // Update UI immediately
});
```

---

## Next: Part 2 - TypeScript Definitions & Business Logic

Continue to [Part 2: TypeScript Definitions & Business Logic](./STRIPE_CONNECT_INTEGRATION_GUIDE_PART_2_TYPES.md) for complete type definitions, validation schemas, and business rule implementation.
