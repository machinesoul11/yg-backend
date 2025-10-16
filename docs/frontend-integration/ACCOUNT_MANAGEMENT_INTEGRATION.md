# Account Management Module - Frontend Integration Guide

## Overview

The Account Management module handles Stripe Connect account creation, onboarding, verification, and status tracking for creators. This guide provides comprehensive integration documentation for the frontend to implement the UI without guesswork.

**Classification:** ⚡ HYBRID - Core functionality used by both public website (creators) and admin backend (monitoring)

**Module Components:**
- ✅ Stripe Connect account creation
- ✅ Onboarding link generation  
- ✅ Onboarding status tracking
- ✅ Account verification handling
- ✅ Account update synchronization
- ✅ Account capability checking
- ✅ Account requirement handling

---

## 1. API Endpoints

### Authentication Requirements
All endpoints require **Creator authentication** via JWT. Include the authorization header:
```typescript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Core Endpoints

#### 1.1 Start Onboarding Process
```typescript
POST /api/payouts/stripe-connect/onboard
```

**Purpose:** Initiates Stripe Connect onboarding for a creator
- Creates new Stripe Express account if none exists
- Generates onboarding link for existing accounts
- Stores session tracking data

**Request Body (Optional):**
```typescript
interface OnboardRequest {
  returnUrl?: string;  // Default: ${FRONTEND_URL}/dashboard/settings/payouts/return
  refreshUrl?: string; // Default: ${FRONTEND_URL}/dashboard/settings/payouts/refresh
}
```

**Success Response (201 for new, 200 for existing):**
```typescript
interface OnboardResponse {
  success: true;
  data: {
    url: string;           // Stripe onboarding URL
    expiresAt: number;     // Unix timestamp
    accountId: string;     // Stripe account ID
    isNewAccount: boolean; // True if account was just created
  };
}
```

**Error Responses:**
- `401 Unauthorized` - User not logged in or invalid token
- `404 Not Found` - Creator profile not found
- `500 Internal Server Error` - Stripe API failure

---

#### 1.2 Check Account Status
```typescript
GET /api/payouts/stripe-connect/status
```

**Purpose:** Retrieves real-time account and onboarding status
- Syncs status with Stripe
- Returns comprehensive status information

**Success Response:**
```typescript
interface StatusResponse {
  success: true;
  data: {
    hasAccount: boolean;
    accountId: string | null;
    onboardingStatus: OnboardingStatus;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requiresAction: boolean;
    requirements: {
      currentlyDue: string[];
      errors: string[];
    };
    isFullyOnboarded: boolean;
  };
}

type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
```

**Status Explanations:**
- `pending` - Account created but onboarding not started
- `in_progress` - User has started onboarding form
- `completed` - Onboarding complete and verified
- `failed` - Account verification failed

---

#### 1.3 Refresh Expired Link
```typescript
POST /api/payouts/stripe-connect/refresh
```

**Purpose:** Generates new onboarding link when previous expired
- Validates Stripe account exists
- Checks if onboarding already complete
- Creates fresh time-limited link

**Request Body (Optional):** Same as onboard endpoint

**Success Response:**
```typescript
interface RefreshResponse {
  success: true;
  data: {
    url: string;       // New Stripe onboarding URL
    expiresAt: number; // Unix timestamp
    accountId: string; // Stripe account ID
  };
}
```

**Special Response (Already Complete):**
```typescript
interface AlreadyCompleteResponse {
  success: true;
  message: "Onboarding is already complete";
  data: {
    onboardingComplete: true;
    accountId: string;
    payoutsEnabled: boolean;
  };
}
```

**Error Responses:**
- `400 Bad Request` - No Stripe account (call `/onboard` first)
  ```typescript
  {
    error: "Bad Request";
    message: "No Stripe account found. Please start onboarding first.";
    action: "start_onboarding"; // UI hint
  }
  ```

---

#### 1.4 Get Account Details
```typescript
GET /api/payouts/stripe-connect/account
```

**Purpose:** Retrieves comprehensive account information from Stripe
- Includes business profile, capabilities, external accounts
- Shows verification requirements
- Masks sensitive data appropriately

**Success Response:**
```typescript
interface AccountDetailsResponse {
  success: true;
  data: StripeAccountDetails;
}

interface StripeAccountDetails {
  id: string;
  type: "express";
  country: string;
  email: string;
  
  businessProfile: {
    name: string | null;
    url: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    supportUrl: string | null;
    productDescription: string | null;
    mcc: string | null; // Merchant Category Code
  } | null;
  
  capabilities: Array<{
    name: string;
    status: "active" | "inactive" | "pending" | "restricted";
  }>;
  
  externalAccounts: Array<{
    id: string;
    object: "bank_account";
    bankName: string;
    last4: string;
    currency: string;
    country: string;
    routingNumber: string; // Masked with ***
    default: boolean;
  }>;
  
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  
  requirements: {
    currentlyDue: StripeAccountRequirement[];
    eventuallyDue: StripeAccountRequirement[];
    pastDue: StripeAccountRequirement[];
    pendingVerification: StripeAccountRequirement[];
  };
  
  created: number; // Unix timestamp
  metadata: Record<string, string>;
}
```

**No Account Response:**
```typescript
{
  success: true;
  data: {
    hasAccount: false;
    message: "No Stripe account found. Please start onboarding first.";
  };
}
```

---

#### 1.5 Update Account Information
```typescript
PATCH /api/payouts/stripe-connect/account
```

**Purpose:** Updates modifiable account fields
- Only specific fields can be updated post-verification
- Triggers re-sync with database
- Some updates may require re-verification

**Request Body (All Optional):**
```typescript
interface AccountUpdateRequest {
  businessProfile?: {
    name?: string;
    url?: string;
    supportEmail?: string;
    supportPhone?: string;
    supportUrl?: string;
    productDescription?: string;
  };
  settings?: {
    payouts?: {
      schedule?: {
        interval: "daily" | "weekly" | "monthly";
      };
    };
  };
  metadata?: Record<string, string>;
}
```

**Success Response:**
```typescript
interface UpdateAccountResponse {
  success: true;
  message: "Account updated successfully";
  data: Partial<StripeAccountDetails>;
}
```

**Error Responses:**
- `400 Bad Request` - Invalid data or field cannot be updated
- `400 Bad Request` - No Stripe account exists

---

## 2. TypeScript Type Definitions

### Core Types

```typescript
// Onboarding Status
type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Account Requirement
interface StripeAccountRequirement {
  fieldName: string;
  requirementType: 'currently_due' | 'eventually_due' | 'past_due' | 'pending_verification';
  deadline: string | null; // ISO date string
  errorCode: string | null;
  errorReason: string | null;
  description: string; // Human-readable description
}

// Categorized Requirements
interface CategorizedRequirements {
  hasRequirements: boolean;
  requirements: StripeAccountRequirement[];
  categorized: {
    currentlyDue: StripeAccountRequirement[];
    eventuallyDue: StripeAccountRequirement[];
    pastDue: StripeAccountRequirement[];
    pendingVerification: StripeAccountRequirement[];
  };
}

// Capability Status
interface StripeCapability {
  name: string;
  status: 'active' | 'inactive' | 'pending' | 'restricted';
}

// External Account (Bank Account)
interface ExternalAccount {
  id: string;
  object: 'bank_account';
  bankName: string;
  last4: string;
  currency: string;
  country: string;
  routingNumber: string; // Masked
  default: boolean;
}

// Business Profile
interface BusinessProfile {
  name: string | null;
  url: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  supportUrl: string | null;
  productDescription: string | null;
  mcc: string | null;
}

// Complete Account Details
interface StripeAccountDetails {
  id: string;
  type: 'express';
  country: string;
  email: string;
  businessProfile: BusinessProfile | null;
  capabilities: StripeCapability[];
  externalAccounts: ExternalAccount[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: StripeAccountRequirement[];
    eventuallyDue: StripeAccountRequirement[];
    pastDue: StripeAccountRequirement[];
    pendingVerification: StripeAccountRequirement[];
  };
  created: number;
  metadata: Record<string, string>;
}

// Onboarding Session
interface OnboardingSession {
  url: string;
  expiresAt: number; // Unix timestamp
  accountId: string;
  isNewAccount?: boolean;
}

// Account Status Summary
interface AccountStatus {
  hasAccount: boolean;
  accountId: string | null;
  onboardingStatus: OnboardingStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requiresAction: boolean;
  requirements: {
    currentlyDue: string[];
    errors: string[];
  };
  isFullyOnboarded: boolean;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

// Onboard Request Schema
export const OnboardRequestSchema = z.object({
  returnUrl: z.string().url().optional(),
  refreshUrl: z.string().url().optional(),
});

// Account Update Schema
export const AccountUpdateSchema = z.object({
  businessProfile: z.object({
    name: z.string().min(1).max(100).optional(),
    url: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().min(10).max(20).optional(),
    supportUrl: z.string().url().optional(),
    productDescription: z.string().max(500).optional(),
  }).optional(),
  settings: z.object({
    payouts: z.object({
      schedule: z.object({
        interval: z.enum(['daily', 'weekly', 'monthly']),
      }).optional(),
    }).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

// Status Check Response Schema
export const StatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    hasAccount: z.boolean(),
    accountId: z.string().nullable(),
    onboardingStatus: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    chargesEnabled: z.boolean(),
    payoutsEnabled: z.boolean(),
    requiresAction: z.boolean(),
    requirements: z.object({
      currentlyDue: z.array(z.string()),
      errors: z.array(z.string()),
    }),
    isFullyOnboarded: z.boolean(),
  }),
});
```

---

## 3. Business Logic & Validation Rules

### Account Creation Rules
- ✅ **Automatic Creation**: Stripe Express accounts created automatically on first onboard call
- ✅ **Business Type**: Always set to 'individual' for creators
- ✅ **Country**: Currently hardcoded to 'US' (configurable in future)
- ✅ **Email Pre-population**: Uses verified email from user account
- ✅ **Capabilities**: Only 'transfers' capability requested (no card payments)

### Onboarding Link Rules
- ✅ **Expiration**: Links expire after 5 minutes for security
- ✅ **Session Tracking**: Each link generation creates database record
- ✅ **Return URLs**: Must be HTTPS in production
- ✅ **Refresh Flow**: Expired links can be refreshed without losing progress

### Status Synchronization Rules
- ✅ **Real-time Sync**: Status endpoint always fetches from Stripe
- ✅ **Webhook Updates**: Real-time updates via Stripe webhooks
- ✅ **Background Sync**: Daily job syncs all pending accounts
- ✅ **Status Transitions**: Database updated when Stripe status changes

### Verification Requirements
- ✅ **Requirement Types**: 
  - `currently_due` - Must be completed now
  - `eventually_due` - Must be completed by deadline
  - `past_due` - Overdue, urgent action required
  - `pending_verification` - Under Stripe review
- ✅ **Auto-resolution**: Requirements automatically removed when satisfied
- ✅ **Error Tracking**: Detailed error reasons for failed verifications

### Capability Management
- ✅ **Transfer Capability**: Required for receiving payouts
- ✅ **Status Monitoring**: Capability status tracked in database
- ✅ **Eligibility Checks**: Payout eligibility validated before transfers

### Field Update Restrictions
- ✅ **Pre-verification**: Most fields can be updated before verification
- ✅ **Post-verification**: Limited fields can be updated after verification
- ✅ **Protected Fields**: Email, country, business_type cannot be changed
- ✅ **Re-verification**: Some updates may trigger additional verification

---

## 4. Error Handling

### HTTP Status Codes

| Status | Meaning | When It Occurs |
|--------|---------|----------------|
| 200 | OK | Successful request |
| 201 | Created | New Stripe account created |
| 400 | Bad Request | Invalid request data, missing account |
| 401 | Unauthorized | Not logged in, invalid token |
| 404 | Not Found | Creator profile not found |
| 500 | Internal Server Error | Stripe API failure, database error |

### Error Response Format

```typescript
interface ApiError {
  error: string;           // Error category
  message: string;         // User-friendly message
  action?: string;         // UI action hint (optional)
  details?: unknown;       // Additional error details (optional)
}
```

### Common Error Scenarios

#### 4.1 Authentication Errors
```typescript
// 401 Unauthorized
{
  error: "Unauthorized",
  message: "You must be logged in"
}
```

#### 4.2 Creator Profile Errors
```typescript
// 404 Not Found
{
  error: "Not Found",
  message: "Creator profile not found"
}
```

#### 4.3 Account State Errors
```typescript
// 400 Bad Request - No account for refresh
{
  error: "Bad Request",
  message: "No Stripe account found. Please start onboarding first.",
  action: "start_onboarding"
}
```

#### 4.4 Stripe API Errors
```typescript
// 500 Internal Server Error
{
  error: "Stripe Error",
  message: "Account temporarily restricted"
}

// 500 Internal Server Error - Generic
{
  error: "Internal Server Error", 
  message: "Failed to create Stripe account"
}
```

### Error Handling Strategy

```typescript
// Example error handling in React Query
const { data, error, isError } = useQuery({
  queryKey: ['stripe-status'],
  queryFn: () => apiClient.get('/api/payouts/stripe-connect/status'),
});

if (isError) {
  const apiError = error as ApiError;
  
  switch (apiError.error) {
    case 'Unauthorized':
      // Redirect to login
      router.push('/login');
      break;
      
    case 'Not Found':
      // Show create profile flow
      showCreateProfileModal();
      break;
      
    case 'Bad Request':
      if (apiError.action === 'start_onboarding') {
        // Show onboarding start button
        setShowOnboardingButton(true);
      }
      break;
      
    default:
      // Show generic error message
      toast.error(apiError.message);
  }
}
```

### User-Friendly Error Messages

```typescript
const ERROR_MESSAGES = {
  'UNAUTHORIZED': 'Please log in to access your account settings.',
  'NOT_FOUND': 'Please create your creator profile first.',
  'NO_ACCOUNT': 'Set up your payout account to receive payments.',
  'LINK_EXPIRED': 'Your onboarding link has expired. Click to get a new one.',
  'STRIPE_ERROR': 'There was a problem with Stripe. Please try again.',
  'NETWORK_ERROR': 'Check your internet connection and try again.',
  'ACCOUNT_RESTRICTED': 'Your account needs additional verification. Please complete the requirements.',
} as const;
```

---

## 5. Authorization & Permissions

### User Role Requirements

| Endpoint | Required Role | Additional Checks |
|----------|---------------|-------------------|
| `POST /onboard` | Creator | Must have creator profile |
| `GET /status` | Creator | Must have creator profile |
| `POST /refresh` | Creator | Must have creator profile |
| `GET /account` | Creator | Must have creator profile |
| `PATCH /account` | Creator | Must have creator profile + Stripe account |

### Resource Ownership Rules
- ✅ **Creator-Scoped**: All endpoints operate on the authenticated creator's account only
- ✅ **Profile Required**: Must have verified creator profile to access endpoints
- ✅ **Account Binding**: Stripe accounts permanently linked to creator profile
- ✅ **No Cross-Access**: Creators cannot access other creators' Stripe accounts

### Permission Validation Flow

```typescript
// Backend validation (automatic in all endpoints)
async function validateCreatorAccess(userId: string): Promise<Creator> {
  // 1. Verify user is authenticated
  if (!userId) {
    throw new UnauthorizedError();
  }
  
  // 2. Find creator profile
  const creator = await prisma.creator.findUnique({
    where: { userId, deletedAt: null }
  });
  
  if (!creator) {
    throw new CreatorNotFoundError();
  }
  
  // 3. Check verification status (optional, depends on endpoint)
  if (creator.verificationStatus !== 'approved') {
    throw new CreatorNotVerifiedError();
  }
  
  return creator;
}
```

### Frontend Permission Checks

```typescript
// Check if user can access Stripe features
function useStripeAccess() {
  const { data: session } = useSession();
  const { data: creator } = useQuery({
    queryKey: ['creator-profile'],
    queryFn: () => api.creators.getMyProfile(),
    enabled: !!session?.user?.id,
  });
  
  return {
    canAccessStripe: !!creator && creator.verificationStatus === 'approved',
    needsVerification: !!creator && creator.verificationStatus === 'pending',
    needsProfile: !creator,
  };
}

// Usage in components
function PayoutSettings() {
  const { canAccessStripe, needsVerification, needsProfile } = useStripeAccess();
  
  if (needsProfile) {
    return <CreateProfilePrompt />;
  }
  
  if (needsVerification) {
    return <VerificationPendingMessage />;
  }
  
  if (!canAccessStripe) {
    return <AccessDeniedMessage />;
  }
  
  return <StripeOnboardingFlow />;
}
```

---

## 6. Rate Limiting & Quotas

### Rate Limit Configuration

| Endpoint | Rate Limit | Window | Scope |
|----------|------------|---------|--------|
| `POST /onboard` | 10 requests | 1 hour | Per user |
| `GET /status` | 30 requests | 5 minutes | Per user |
| `POST /refresh` | 5 requests | 10 minutes | Per user |
| `GET /account` | 20 requests | 5 minutes | Per user |
| `PATCH /account` | 5 requests | 15 minutes | Per user |

### Rate Limit Headers

All responses include rate limiting headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Max requests per window
  'X-RateLimit-Remaining': string;  // Remaining requests
  'X-RateLimit-Reset': string;      // Reset time (Unix timestamp)
  'X-RateLimit-Window': string;     // Window size in seconds
}
```

### Rate Limit Exceeded Response

```typescript
// 429 Too Many Requests
{
  error: "Rate Limit Exceeded",
  message: "Too many requests. Please try again later.",
  resetAt: 1729876543, // Unix timestamp
  retryAfter: 300       // Seconds until reset
}
```

### Frontend Rate Limit Handling

```typescript
// React Query with rate limit handling
const mutation = useMutation({
  mutationFn: (data) => api.stripeConnect.onboard(data),
  onError: (error) => {
    if (error.status === 429) {
      const resetTime = new Date(error.resetAt * 1000);
      toast.error(`Rate limit exceeded. Try again at ${resetTime.toLocaleTimeString()}`);
      
      // Optional: Set timer to re-enable button
      setTimeout(() => {
        // Re-enable action
      }, error.retryAfter * 1000);
    }
  },
});

// Check rate limit headers before making requests
function useRateLimit(endpoint: string) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [resetAt, setResetAt] = useState<number | null>(null);
  
  const updateRateLimit = (headers: Headers) => {
    const remainingHeader = headers.get('X-RateLimit-Remaining');
    const resetHeader = headers.get('X-RateLimit-Reset');
    
    if (remainingHeader) setRemaining(parseInt(remainingHeader));
    if (resetHeader) setResetAt(parseInt(resetHeader));
  };
  
  return {
    remaining,
    resetAt,
    canMakeRequest: remaining === null || remaining > 0,
    updateRateLimit,
  };
}
```

### Best Practices
- ✅ **Debounce Status Checks**: Avoid rapid polling of status endpoint
- ✅ **Cache Responses**: Cache account details and status when possible  
- ✅ **Progressive Backoff**: Increase delays after rate limit hits
- ✅ **User Feedback**: Show remaining requests and reset times
- ✅ **Batch Operations**: Combine multiple updates into single requests

---

This concludes Part 1 of the Account Management Integration Guide. Continue to [Part 2: File Uploads & Real-time Updates](./ACCOUNT_MANAGEMENT_INTEGRATION_PART2.md) for the remaining sections.
