# Email Verification Module - Frontend Integration Guide

> **Last Updated:** October 12, 2025  
> **Module Status:** ✅ Production Ready  
> **Backend Deployment:** ops.yesgoddess.agency  
> **Architecture:** REST API + tRPC, JWT Authentication

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Email Templates](#email-templates)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)
11. [Testing Scenarios](#testing-scenarios)
12. [UX Guidelines](#ux-guidelines)

---

## Overview

The Email Verification module ensures that users verify their email addresses before accessing protected features of the YES GODDESS platform. This is a critical security and compliance feature.

### Key Features

- **Secure Token Generation**: 64-character cryptographically secure hex tokens
- **24-Hour Expiration**: Tokens automatically expire after 24 hours
- **Rate-Limited Resend**: Maximum 3 verification emails per 10 minutes
- **Email Enumeration Protection**: Silent failures prevent user discovery
- **Audit Logging**: All verification events tracked for security
- **Beautiful Templates**: YES GODDESS branded email designs

### User Flow

```
Registration → Email Sent → User Clicks Link → Email Verified → Access Granted
     ↓                                               ↑
     └──────────────────> Resend Email ──────────────┘
                         (if needed)
```

---

## API Endpoints

### Base URL
```
https://ops.yesgoddess.agency
```

### Endpoint Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/verify-email` | POST | ❌ No | Verify email with token |
| `/api/auth/resend-verification` | POST | ❌ No | Request new verification email |
| `/api/trpc/auth.verifyEmail` | POST | ❌ No | tRPC: Verify email |
| `/api/trpc/auth.resendVerification` | POST | ❌ No | tRPC: Resend verification |

---

### 1. Verify Email (REST)

**Endpoint:** `POST /api/auth/verify-email`

**Purpose:** Validates verification token and marks email as verified

**Authentication:** None required (uses token from email)

**Request Body:**
```typescript
{
  token: string; // 64-character hex token from email
}
```

**Success Response (200):**
```typescript
{
  success: true,
  message: "Email verified successfully"
}
```

**Error Responses:**

| Status | Error | Message |
|--------|-------|---------|
| 400 | `TOKEN_INVALID` | "Invalid verification token" |
| 400 | `TOKEN_EXPIRED` | "Verification token has expired" |
| 400 | `ALREADY_VERIFIED` | "Email is already verified" |
| 400 | Missing token | "Verification token is required" |
| 500 | Server error | "Verification failed" |

**Side Effects:**
- User's `email_verified` field set to current timestamp
- Verification token deleted from database
- Welcome email sent to user
- Audit event logged: `EMAIL_VERIFIED`

---

### 2. Resend Verification Email (REST)

**Endpoint:** `POST /api/auth/resend-verification`

**Purpose:** Sends new verification email with fresh token

**Authentication:** None required

**Request Body:**
```typescript
{
  email: string; // User's email address
}
```

**Success Response (200):**
```typescript
{
  success: true,
  message: "If an account exists with that email, a verification link has been sent."
}
```

> **🔒 Security Note:** Always returns success even if user doesn't exist to prevent email enumeration attacks.

**Error Responses:**

| Status | Error | Message |
|--------|-------|---------|
| 400 | Missing email | "Email address is required" |
| 400 | Already verified | "Email is already verified" |
| 429 | Rate limited | "Too many requests. Please try again in X minutes." |
| 500 | Server error | Generic error message |

**Rate Limiting:**
- **Window:** 10 minutes
- **Max Requests:** 3 per IP/email combination
- **429 Response:** Includes `remainingTime` in minutes

**Side Effects:**
- Old verification tokens invalidated
- New token created (24-hour expiry)
- Verification email sent
- Audit event logged: `EMAIL_VERIFICATION_SENT`

---

### 3. Verify Email (tRPC)

**Endpoint:** `POST /api/trpc/auth.verifyEmail`

**Purpose:** Same as REST endpoint, but via tRPC

**Input:**
```typescript
{
  token: string;
}
```

**Output:**
```typescript
{
  success: true,
  data: {
    message: "Email verified successfully"
  }
}
```

**Error Response:**
```typescript
{
  error: {
    code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR",
    message: string,
    cause: {
      code: string, // e.g., "TOKEN_EXPIRED"
      statusCode: number
    }
  }
}
```

---

### 4. Resend Verification (tRPC)

**Endpoint:** `POST /api/trpc/auth.resendVerification`

**Input:**
```typescript
{
  email: string;
}
```

**Output:**
```typescript
{
  success: true,
  data: {
    message: "Verification email sent"
  }
}
```

---

## Request/Response Examples

### Example 1: Verify Email (Success)

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

### Example 2: Verify Email (Expired Token)

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "expired_token_here_abc123..."
  }'
```

**Response (400):**
```json
{
  "success": false,
  "message": "Verification token has expired"
}
```

---

### Example 3: Verify Email (Already Verified)

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "already_used_token_abc123..."
  }'
```

**Response (400):**
```json
{
  "success": false,
  "message": "Email is already verified"
}
```

---

### Example 4: Resend Verification (Success)

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with that email, a verification link has been sent."
}
```

---

### Example 5: Resend Verification (Rate Limited)

**cURL:**
```bash
# After 3 requests within 10 minutes
curl -X POST https://ops.yesgoddess.agency/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com"
  }'
```

**Response (429):**
```json
{
  "success": false,
  "message": "Too many requests. Please try again in 8 minutes."
}
```

---

### Example 6: Resend Verification (Already Verified)

**cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "verified@example.com"
  }'
```

**Response (400):**
```json
{
  "success": false,
  "message": "Email is already verified"
}
```

---

### Example 7: tRPC Verify Email

**TypeScript (React Query):**
```typescript
import { trpc } from '@/lib/trpc';

function VerifyEmailPage() {
  const verifyMutation = trpc.auth.verifyEmail.useMutation();

  const handleVerify = async (token: string) => {
    try {
      const result = await verifyMutation.mutateAsync({ token });
      console.log(result.data.message); // "Email verified successfully"
    } catch (error) {
      console.error(error.message); // "Invalid verification token"
    }
  };
}
```

---

### Example 8: tRPC Resend Verification

**TypeScript (React Query):**
```typescript
import { trpc } from '@/lib/trpc';

function ResendButton({ email }: { email: string }) {
  const resendMutation = trpc.auth.resendVerification.useMutation();

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync({ email });
      toast.success('Verification email sent!');
    } catch (error) {
      if (error.message.includes('too many requests')) {
        toast.error('Please wait before requesting another email');
      }
    }
  };
}
```

---

## TypeScript Type Definitions

### Request/Response Types

```typescript
/**
 * Email Verification Request
 */
export interface VerifyEmailRequest {
  token: string; // 64-character hex string
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
}

/**
 * Resend Verification Request
 */
export interface ResendVerificationRequest {
  email: string; // Valid email format
}

export interface ResendVerificationResponse {
  success: boolean;
  message: string;
}

/**
 * Error Response
 */
export interface EmailVerificationError {
  success: false;
  message: string;
  code?: string; // Error code (e.g., "TOKEN_EXPIRED")
}
```

---

### User Types

```typescript
/**
 * User object from session/auth
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'TALENT' | 'VIEWER';
  emailVerified: boolean; // TRUE if verified, FALSE if not
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session object
 */
export interface Session {
  user: User;
  expires: string;
}
```

---

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

/**
 * Email verification token schema
 */
export const verifyEmailSchema = z.object({
  token: z
    .string()
    .length(64, 'Invalid token format')
    .regex(/^[a-f0-9]{64}$/, 'Token must be hexadecimal'),
});

/**
 * Resend verification email schema
 */
export const resendVerificationSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
});
```

---

### Constants

```typescript
/**
 * Email Verification Constants
 */
export const EMAIL_VERIFICATION = {
  // Token settings
  TOKEN_LENGTH: 64,
  TOKEN_EXPIRY_HOURS: 24,
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  MAX_RESEND_REQUESTS: 3,
  
  // Email settings
  FROM_EMAIL: 'noreply@updates.yesgoddess.agency',
  FROM_NAME: 'YES GODDESS',
  
  // Routes
  VERIFY_URL: '/auth/verify-email',
  VERIFICATION_REQUIRED_URL: '/auth/verification-required',
} as const;
```

---

### Enums

```typescript
/**
 * Verification Status
 */
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  VERIFIED = 'verified',
  EXPIRED = 'expired',
}

/**
 * Verification Error Codes
 */
export enum VerificationErrorCode {
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  ALREADY_VERIFIED = 'ALREADY_VERIFIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  EMAIL_NOT_FOUND = 'EMAIL_NOT_FOUND', // Never exposed to frontend
}
```

---

## Business Logic & Validation Rules

### Token Generation

- **Length:** Exactly 64 characters
- **Format:** Hexadecimal (a-f, 0-9)
- **Generation:** `crypto.randomBytes(32).toString('hex')`
- **Collision Resistance:** Virtually impossible (2^256 possibilities)
- **Database:** Unique constraint on `token` column

---

### Token Expiration

- **Duration:** 24 hours from creation
- **Calculation:** `createdAt + 24 hours`
- **Grace Period:** None - hard cutoff at 24 hours
- **Cleanup:** Background job deletes expired tokens hourly

---

### Email Validation

Frontend must validate:
- Email format (RFC 5322)
- Maximum length: 254 characters
- Lowercase conversion: Backend normalizes to lowercase
- Trimming: Backend trims whitespace

```typescript
// Frontend validation function
function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim().toLowerCase();
  
  if (!trimmed) {
    return { valid: false, error: 'Email is required' };
  }
  
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
}
```

---

### Rate Limiting Logic

```typescript
/**
 * Rate limit tracking (conceptual - handled by backend)
 */
interface RateLimitState {
  clientId: string; // IP address or email
  count: number; // Number of requests
  resetAt: number; // Timestamp when window resets
}

/**
 * Check if user is rate limited
 */
function calculateRemainingTime(resetAt: number): number {
  const now = Date.now();
  if (now >= resetAt) return 0;
  return Math.ceil((resetAt - now) / 1000 / 60); // Minutes
}
```

---

### Email Enumeration Protection

**Backend Behavior:**
- Always returns success for non-existent users
- Same response time regardless of user existence
- No hints about whether email exists

**Frontend Should:**
- Display generic success message
- Don't differentiate between "sent" and "user not found"
- Suggest checking spam folder
- Provide link to support if issues persist

---

### Verification Status Checks

```typescript
/**
 * Check if user needs verification
 */
function requiresVerification(user: User): boolean {
  return !user.emailVerified;
}

/**
 * Check if feature is locked due to verification
 */
function isFeatureLocked(user: User, feature: string): boolean {
  const protectedFeatures = [
    'create-project',
    'license-ip',
    'payout-setup',
    'team-management',
  ];
  
  return protectedFeatures.includes(feature) && !user.emailVerified;
}
```

---

## Error Handling

### Error Response Structure

All errors follow this format:

```typescript
interface ErrorResponse {
  success: false;
  message: string; // User-friendly message
  code?: string; // Machine-readable error code
}
```

---

### Error Codes Reference

| Code | HTTP Status | Meaning | User Action |
|------|-------------|---------|-------------|
| `TOKEN_INVALID` | 400 | Token not found in database | Show "Invalid Link" page, offer resend |
| `TOKEN_EXPIRED` | 400 | Token older than 24 hours | Show "Link Expired" page, offer resend |
| `ALREADY_VERIFIED` | 400 | Email already verified | Redirect to dashboard |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many resend requests | Show countdown timer, disable button |
| `VALIDATION_ERROR` | 400 | Invalid request format | Show field-specific errors |
| `SERVER_ERROR` | 500 | Unexpected backend error | Show generic error, suggest retry |

---

### Error Handling Best Practices

#### 1. Token Invalid

```typescript
function handleTokenInvalid() {
  return (
    <div className="error-page">
      <h1>Invalid Verification Link</h1>
      <p>This link is invalid or has already been used.</p>
      <Button onClick={requestNewLink}>
        Send New Verification Email
      </Button>
      <Link href="/support">Contact Support</Link>
    </div>
  );
}
```

---

#### 2. Token Expired

```typescript
function handleTokenExpired() {
  return (
    <div className="error-page">
      <h1>Verification Link Expired</h1>
      <p>This link expired 24 hours after it was sent.</p>
      <Button onClick={requestNewLink}>
        Get a New Verification Link
      </Button>
    </div>
  );
}
```

---

#### 3. Already Verified

```typescript
function handleAlreadyVerified() {
  // Auto-redirect after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="success-page">
      <h1>Already Verified!</h1>
      <p>Your email is already verified.</p>
      <p>Redirecting to dashboard...</p>
    </div>
  );
}
```

---

#### 4. Rate Limited

```typescript
function handleRateLimited(remainingMinutes: number) {
  const [countdown, setCountdown] = useState(remainingMinutes);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rate-limit-notice">
      <p>Too many requests. Please wait {countdown} minutes before trying again.</p>
      <Button disabled={countdown > 0}>
        {countdown > 0 ? `Wait ${countdown}m` : 'Resend Email'}
      </Button>
    </div>
  );
}
```

---

### Error Messaging Guide

| Error | User-Friendly Message | Technical Details |
|-------|----------------------|-------------------|
| Invalid Token | "This verification link is invalid. Please request a new one." | Token not in database |
| Expired Token | "This link has expired. Verification links are valid for 24 hours." | Created > 24h ago |
| Already Verified | "Good news! Your email is already verified." | `email_verified` is not null |
| Rate Limited | "You've requested too many emails. Please wait X minutes." | 3 requests in 10 min |
| Network Error | "Connection issue. Please check your internet and try again." | Fetch failed |
| Server Error | "Something went wrong. Please try again or contact support." | 500 error |

---

### Retry Strategy

```typescript
/**
 * Exponential backoff for failed requests
 */
async function verifyEmailWithRetry(
  token: string,
  maxRetries = 3
): Promise<VerifyEmailResponse> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await verifyEmail(token);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors (400-499)
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

---

## Authorization & Permissions

### Authentication Requirements

| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `/api/auth/verify-email` | ❌ No | Token in request body serves as auth |
| `/api/auth/resend-verification` | ❌ No | Public endpoint (rate limited) |
| Protected routes (dashboard, etc.) | ✅ Yes | Requires valid JWT token |

---

### Role-Based Access

Email verification applies to **all roles**:
- ✅ ADMIN
- ✅ CREATOR
- ✅ BRAND
- ✅ TALENT
- ✅ VIEWER

**Exception:** Admins can access admin routes even without verification.

---

### Feature Access Matrix

| Feature | Unverified | Verified |
|---------|-----------|----------|
| Sign In | ✅ Allowed | ✅ Allowed |
| View Public Content | ✅ Allowed | ✅ Allowed |
| Create Project | ❌ Blocked | ✅ Allowed |
| License IP | ❌ Blocked | ✅ Allowed |
| Setup Payouts | ❌ Blocked | ✅ Allowed |
| Team Management | ❌ Blocked | ✅ Allowed |
| Brand Verification | ❌ Blocked | ✅ Allowed |
| Admin Panel | ✅ Allowed* | ✅ Allowed |

*Admin role only

---

### Middleware Protection

**Backend middleware checks:**
```typescript
// Pseudo-code for backend middleware
if (route.requiresVerification && !user.emailVerified) {
  return redirect('/auth/verification-required');
}
```

**Frontend should mirror this:**
```typescript
// Frontend route guard
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  
  useEffect(() => {
    if (session?.user && !session.user.emailVerified) {
      router.push('/auth/verification-required');
    }
  }, [session, router]);
  
  if (!session?.user.emailVerified) {
    return <VerificationRequiredPage />;
  }
  
  return <>{children}</>;
}
```

---

### Session Management

**Email verification status in JWT:**
```typescript
// JWT token payload
{
  userId: "cm12abc...",
  email: "user@example.com",
  role: "CREATOR",
  emailVerified: true, // ← This field
  iat: 1697097600,
  exp: 1697184000
}
```

**Checking verification in frontend:**
```typescript
import { useSession } from 'next-auth/react';

function MyComponent() {
  const { data: session } = useSession();
  
  if (!session) {
    return <SignInPrompt />;
  }
  
  if (!session.user.emailVerified) {
    return <VerificationPrompt />;
  }
  
  return <ProtectedContent />;
}
```

---

## Rate Limiting & Quotas

### Resend Verification Limits

- **Window:** 10 minutes (600,000 milliseconds)
- **Max Requests:** 3 per IP/email combination
- **Tracking:** By IP address or email (whichever is more restrictive)
- **Reset:** Automatic after window expires
- **Storage:** In-memory (production should use Redis)

---

### Rate Limit Response

**429 Too Many Requests:**
```json
{
  "success": false,
  "message": "Too many requests. Please try again in 7 minutes."
}
```

---

### Frontend Rate Limit Handling

```typescript
interface RateLimitInfo {
  limited: boolean;
  remainingMinutes: number;
  resetsAt: Date;
}

function useResendRateLimit() {
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({
    limited: false,
    remainingMinutes: 0,
    resetsAt: new Date(),
  });

  const checkRateLimit = (error: any) => {
    if (error.status === 429) {
      const match = error.message.match(/(\d+) minutes?/);
      const minutes = match ? parseInt(match[1]) : 10;
      
      setRateLimit({
        limited: true,
        remainingMinutes: minutes,
        resetsAt: new Date(Date.now() + minutes * 60000),
      });
    }
  };

  return { rateLimit, checkRateLimit };
}
```

---

### Displaying Rate Limit

```tsx
function ResendButton({ email }: { email: string }) {
  const { rateLimit, checkRateLimit } = useResendRateLimit();
  const [isLoading, setIsLoading] = useState(false);

  const handleResend = async () => {
    setIsLoading(true);
    try {
      await resendVerification(email);
      toast.success('Verification email sent!');
    } catch (error) {
      checkRateLimit(error);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Button
        onClick={handleResend}
        disabled={rateLimit.limited || isLoading}
      >
        {rateLimit.limited
          ? `Wait ${rateLimit.remainingMinutes}m`
          : 'Resend Email'}
      </Button>
      
      {rateLimit.limited && (
        <p className="text-sm text-gray-600">
          You can request another email at{' '}
          {rateLimit.resetsAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
```

---

### Rate Limit Headers (Future Enhancement)

Currently not implemented, but recommended for production:

```http
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 1
X-RateLimit-Reset: 1697184000
```

---

## Email Templates

### Verification Email Preview

**Subject:** "Verify your YES GODDESS account"

**From:** YES GODDESS <noreply@updates.yesgoddess.agency>

**Template Variables:**
```typescript
{
  userName: string; // e.g., "Jane Creator"
  verificationUrl: string; // Full URL with token
}
```

**Visual Design:**
- YES GODDESS logo at top
- Large "Verify Your Email" heading
- Personalized greeting
- Clear call-to-action button (ALTAR gold)
- 24-hour expiry notice
- Security message: "If you didn't create an account, ignore this email"

---

### Welcome Email (Post-Verification)

**Subject:** "Welcome to YES GODDESS"

**Sent:** Immediately after email verification

**Content:**
- Welcome message
- Role-specific next steps
- Platform overview
- Support contact information

---

### Email Client Compatibility

Tested and verified on:
- ✅ Gmail (Desktop & Mobile)
- ✅ Apple Mail (macOS, iOS)
- ✅ Outlook (Desktop & Web)
- ✅ Proton Mail
- ✅ Hey

**Known Issues:**
- None reported

---

## Frontend Implementation Checklist

### Phase 1: Core Integration (2-3 hours)

- [ ] **Create Type Definitions**
  - [ ] Copy TypeScript interfaces to your codebase
  - [ ] Create Zod validation schemas
  - [ ] Define constants and enums

- [ ] **Build API Client**
  ```typescript
  // src/lib/api/email-verification.ts
  export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    
    if (!response.ok) {
      throw new EmailVerificationError(await response.json());
    }
    
    return response.json();
  }
  
  export async function resendVerification(email: string): Promise<ResendVerificationResponse> {
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    if (!response.ok) {
      throw new EmailVerificationError(await response.json());
    }
    
    return response.json();
  }
  ```

- [ ] **Create React Query Hooks** (if using React Query)
  ```typescript
  // src/hooks/useEmailVerification.ts
  import { useMutation } from '@tanstack/react-query';
  
  export function useVerifyEmail() {
    return useMutation({
      mutationFn: verifyEmail,
      onSuccess: () => {
        queryClient.invalidateQueries(['session']);
      },
    });
  }
  
  export function useResendVerification() {
    return useMutation({
      mutationFn: resendVerification,
    });
  }
  ```

---

### Phase 2: UI Components (3-4 hours)

- [ ] **Email Verification Page** (`/auth/verify-email`)
  ```tsx
  // src/app/auth/verify-email/page.tsx
  'use client';
  
  export default function VerifyEmailPage() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { mutate, isLoading, error, isSuccess } = useVerifyEmail();
    
    useEffect(() => {
      if (token) {
        mutate(token);
      }
    }, [token, mutate]);
    
    if (!token) return <InvalidLinkPage />;
    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorPage error={error} />;
    if (isSuccess) return <SuccessPage />;
    
    return null;
  }
  ```

- [ ] **Verification Required Page** (`/auth/verification-required`)
  ```tsx
  // Show when unverified users try to access protected routes
  export default function VerificationRequiredPage() {
    const { data: session } = useSession();
    
    return (
      <div className="verification-required">
        <h1>Email Verification Required</h1>
        <p>Please verify {session?.user.email} to continue.</p>
        <ResendVerificationButton email={session?.user.email} />
      </div>
    );
  }
  ```

- [ ] **Resend Verification Button Component**
  ```tsx
  // src/components/ResendVerificationButton.tsx
  export function ResendVerificationButton({ email }: { email: string }) {
    const { mutate, isLoading } = useResendVerification();
    const { rateLimit, checkRateLimit } = useRateLimitHandling();
    
    const handleClick = () => {
      mutate(email, {
        onSuccess: () => toast.success('Email sent!'),
        onError: checkRateLimit,
      });
    };
    
    return (
      <Button
        onClick={handleClick}
        disabled={isLoading || rateLimit.limited}
      >
        {rateLimit.limited
          ? `Wait ${rateLimit.remainingMinutes}m`
          : 'Resend Email'}
      </Button>
    );
  }
  ```

- [ ] **Verified Badge Component** (Optional)
  ```tsx
  // src/components/VerifiedBadge.tsx
  export function VerifiedBadge({ isVerified }: { isVerified: boolean }) {
    if (!isVerified) return null;
    
    return (
      <span className="verified-badge">
        <CheckIcon className="h-4 w-4 text-gold" />
        <span>Verified</span>
      </span>
    );
  }
  ```

---

### Phase 3: Route Protection (2 hours)

- [ ] **Create Route Guard HOC**
  ```typescript
  // src/components/RequireVerification.tsx
  export function RequireVerification({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    
    if (status === 'loading') return <LoadingSpinner />;
    if (!session) return <SignInRedirect />;
    if (!session.user.emailVerified) {
      router.push('/auth/verification-required');
      return null;
    }
    
    return <>{children}</>;
  }
  ```

- [ ] **Wrap Protected Routes**
  ```tsx
  // src/app/dashboard/page.tsx
  export default function DashboardPage() {
    return (
      <RequireVerification>
        <Dashboard />
      </RequireVerification>
    );
  }
  ```

- [ ] **Add Verification Check to Navigation**
  ```tsx
  // Show banner if unverified
  {!session?.user.emailVerified && (
    <VerificationBanner />
  )}
  ```

---

### Phase 4: Error Handling & UX (2 hours)

- [ ] **Create Error Pages**
  - [ ] Invalid Link page
  - [ ] Expired Link page
  - [ ] Already Verified page
  - [ ] Generic Error page

- [ ] **Add Loading States**
  - [ ] Verification in progress spinner
  - [ ] Resend button loading state
  - [ ] Skeleton loaders

- [ ] **Implement Toast Notifications**
  - [ ] Success: "Email verified successfully!"
  - [ ] Error: "Invalid verification link"
  - [ ] Rate Limit: "Too many requests. Please wait."

- [ ] **Add Success Animation**
  - [ ] Checkmark animation on verification
  - [ ] Confetti or celebratory effect
  - [ ] Auto-redirect countdown

---

### Phase 5: Testing & Polish (2-3 hours)

- [ ] **Write Unit Tests**
  - [ ] API client functions
  - [ ] Validation logic
  - [ ] Error handling

- [ ] **Write Integration Tests**
  - [ ] Full verification flow
  - [ ] Resend flow
  - [ ] Rate limiting
  - [ ] Error scenarios

- [ ] **Manual Testing**
  - [ ] Test with real email
  - [ ] Test expired token
  - [ ] Test rate limiting
  - [ ] Test on mobile

- [ ] **Accessibility Audit**
  - [ ] Keyboard navigation
  - [ ] Screen reader support
  - [ ] Color contrast
  - [ ] Focus indicators

---

## Testing Scenarios

### Test Case 1: Happy Path - New User Verification

**Steps:**
1. User registers account
2. Receives verification email within 1 minute
3. Clicks verification link in email
4. Sees success message
5. Redirected to dashboard after 5 seconds
6. Receives welcome email

**Expected Results:**
- ✅ Email delivered to inbox
- ✅ Link works on first click
- ✅ Success page shows
- ✅ Dashboard accessible
- ✅ Verified badge appears in UI
- ✅ Welcome email received

**Test Data:**
```typescript
{
  email: "newuser@example.com",
  name: "New User",
  password: "SecureP@ss123",
  role: "CREATOR"
}
```

---

### Test Case 2: Expired Token

**Steps:**
1. Generate verification token
2. Wait 24+ hours (or manipulate token creation date)
3. Click verification link
4. See "Link Expired" message
5. Click "Resend Email" button
6. Receive new verification email
7. Click new link
8. Successfully verify

**Expected Results:**
- ✅ Expired error shown
- ✅ Resend button works
- ✅ New email received
- ✅ New link works

---

### Test Case 3: Invalid Token

**Steps:**
1. Try to verify with non-existent token
2. See "Invalid Link" error
3. Request new verification email
4. Use valid link

**Test URL:**
```
https://yesgoddess-web.vercel.app/auth/verify-email?token=INVALID_TOKEN_123
```

**Expected Results:**
- ✅ 400 error returned
- ✅ "Invalid Link" page shown
- ✅ Resend option available

---

### Test Case 4: Already Verified

**Steps:**
1. User already verified
2. Clicks old verification link again
3. Sees "Already Verified" message
4. Redirected to dashboard

**Expected Results:**
- ✅ No error thrown
- ✅ Friendly message shown
- ✅ Auto-redirect works

---

### Test Case 5: Rate Limiting

**Steps:**
1. Request verification email
2. Immediately request again (repeat 3 times within 10 minutes)
3. See rate limit error on 4th request
4. Wait 10 minutes
5. Successfully request email again

**Expected Results:**
- ✅ First 3 requests succeed
- ✅ 4th request returns 429 error
- ✅ Error message includes wait time
- ✅ After window, requests work again

---

### Test Case 6: Email Enumeration Prevention

**Steps:**
1. Request verification for non-existent email
2. Observe response
3. Request verification for existing email
4. Compare responses

**Expected Results:**
- ✅ Both return same success message
- ✅ No difference in response time
- ✅ No indication whether user exists

---

### Test Case 7: Multiple Tokens (Old Token Invalidation)

**Steps:**
1. Request verification email (Token A)
2. Don't click link
3. Request verification email again (Token B)
4. Try to use Token A
5. Should fail (invalidated)
6. Use Token B
7. Should succeed

**Expected Results:**
- ✅ Only latest token works
- ✅ Old tokens invalidated

---

### Test Case 8: Mobile Email Client

**Steps:**
1. Open verification email on mobile device
2. Tap verification link
3. Opens in mobile browser
4. Verify email successfully

**Test Devices:**
- iOS Safari
- Android Chrome
- Gmail app
- Outlook app

**Expected Results:**
- ✅ Link opens correctly
- ✅ Responsive design works
- ✅ Button is tappable
- ✅ No layout issues

---

### Test Case 9: Concurrent Verification Attempts

**Steps:**
1. Open verification link in multiple tabs
2. Complete verification in Tab 1
3. Try to verify in Tab 2
4. See "Already Verified" message

**Expected Results:**
- ✅ First tab succeeds
- ✅ Second tab shows appropriate message
- ✅ No database errors

---

### Test Case 10: Network Failure During Verification

**Steps:**
1. Click verification link
2. Simulate network failure mid-request
3. See error message
4. Retry verification
5. Successfully verify

**Expected Results:**
- ✅ Error handled gracefully
- ✅ Retry button available
- ✅ Token still valid after network recovery

---

### Edge Cases to Test

| Scenario | Expected Behavior |
|----------|------------------|
| Token in URL malformed (not hex) | Show invalid link error |
| Token too short/long | Show invalid link error |
| Email address changed after registration | Old email token still works |
| User deleted account | Token invalid |
| User registers twice with same email | Latest token works |
| Click link after password reset | Verification still works |
| Browser back button after verification | Show already verified message |
| Refresh page during loading | Re-attempt verification |

---

## UX Guidelines

### Verification Success Page

**Elements to include:**
- ✅ Success icon/animation (checkmark, confetti)
- ✅ Clear heading: "Email Verified!"
- ✅ Confirmation message
- ✅ Auto-redirect countdown (5 seconds)
- ✅ Manual "Continue to Dashboard" button

**Example:**
```tsx
<div className="success-page">
  <CheckCircleIcon className="h-16 w-16 text-green-500" />
  <h1>Email Verified!</h1>
  <p>Your account is now active.</p>
  <p>Redirecting in {countdown} seconds...</p>
  <Button href="/dashboard">Go to Dashboard Now</Button>
</div>
```

---

### Verification Required Banner

Show at top of every page for unverified users:

```tsx
<Banner variant="warning">
  <p>
    <strong>Email Verification Required:</strong> Please verify your email
    address to access all features.
  </p>
  <Button size="sm" onClick={openResendModal}>
    Resend Email
  </Button>
</Banner>
```

---

### Resend Verification UX

**Best Practices:**
- Show email address that verification was sent to
- Provide clear feedback when email is sent
- Disable button during loading
- Show rate limit countdown
- Suggest checking spam folder

**Example:**
```tsx
<Card>
  <h2>Verify Your Email</h2>
  <p>We sent a verification email to:</p>
  <p className="font-bold">{user.email}</p>
  
  <ResendButton email={user.email} />
  
  <details className="mt-4">
    <summary>Didn't receive the email?</summary>
    <ul>
      <li>Check your spam/junk folder</li>
      <li>Make sure {user.email} is correct</li>
      <li>Wait a few minutes for delivery</li>
      <li>Contact support if issues persist</li>
    </ul>
  </details>
</Card>
```

---

### Error Page Design

**Components:**
- Icon representing error type
- Clear heading
- Explanation of what went wrong
- Actionable next steps
- Support link

**Tone:**
- Friendly, not technical
- Avoid jargon
- Offer solutions, not just problems

---

### Loading States

- Use skeleton loaders for content
- Show spinner for button actions
- Provide feedback during async operations
- Don't block UI unnecessarily

---

### Mobile Considerations

- Large tap targets (min 44x44px)
- Readable font sizes (min 16px)
- No horizontal scrolling
- Test on various screen sizes
- Consider email client previews

---

### Accessibility

- **Keyboard Navigation:** All actions accessible via keyboard
- **Screen Readers:** Descriptive labels and ARIA attributes
- **Color Contrast:** WCAG AA minimum (4.5:1)
- **Focus Indicators:** Clear visual focus states
- **Error Messages:** Associated with form fields

---

## FAQ for Frontend Developers

### Q: How do I get the verification token?
**A:** It's in the URL query parameter: `?token=...`. Extract it using `useSearchParams()` or similar.

### Q: Do I need to store the token?
**A:** No, tokens are single-use. Just extract from URL and send to API.

### Q: What if user clicks link twice?
**A:** First click verifies. Second click returns "Already Verified" message.

### Q: Can I customize the verification email?
**A:** No, email templates are managed by backend. You can suggest changes.

### Q: How do I test without real emails?
**A:** Use backend staging environment or ask backend team for test tokens.

### Q: Should I validate email format client-side?
**A:** Yes, for immediate feedback. Backend also validates.

### Q: What if verification fails?
**A:** Show error message and offer to resend. Don't block user permanently.

### Q: Can admin bypass email verification?
**A:** Admins can access admin routes unverified, but other features still require verification.

### Q: How do I check if current user is verified?
**A:** Check `session.user.emailVerified` boolean.

### Q: What's the difference between REST and tRPC endpoints?
**A:** Functionality is identical. Use whichever your project uses.

### Q: Can I change the 24-hour expiration?
**A:** No, it's a backend constant. Contact backend team if needed.

### Q: How do I handle rate limits gracefully?
**A:** Show countdown timer, disable resend button, suggest waiting.

---

## Next Steps

1. **Copy type definitions** to your frontend codebase
2. **Create API client** functions
3. **Build UI components** for verification flow
4. **Add route protection** for verified-only features
5. **Test thoroughly** with all scenarios
6. **Deploy to staging** for QA
7. **Monitor errors** in production

---

## Support & Resources

- **Backend API Docs:** [https://ops.yesgoddess.agency/api-docs](https://ops.yesgoddess.agency/api-docs)
- **Backend Team Contact:** [Slack #backend-support]
- **Issue Tracker:** [GitHub Issues]
- **Design System:** [Figma Link]

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-12 | 1.0.0 | Initial documentation |

---

**Generated by:** Backend Team  
**For:** Frontend Integration  
**Last Verified:** October 12, 2025
