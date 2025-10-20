# Frontend Integration Guide: 2FA Challenge Endpoints

🌐 **Classification:** SHARED - Used by both public-facing website and admin backend

**Module:** Two-Factor Authentication Challenge & Verification Flow  
**Backend Status:** ✅ Complete  
**Last Updated:** October 19, 2025

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Security](#rate-limiting--security)
8. [Implementation Flow](#implementation-flow)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Testing Recommendations](#testing-recommendations)

---

## Overview

### Purpose
The 2FA Challenge Endpoints module manages the verification step after successful password authentication. This is a critical security layer that ensures users complete two-factor authentication before gaining access to their account.

### Key Features
- ✅ Initiate 2FA challenges (SMS or Authenticator)
- ✅ Verify SMS OTP codes (6-digit)
- ✅ Verify TOTP codes from authenticator apps
- ✅ Resend SMS codes with rate limiting
- ✅ Switch between 2FA methods during login
- ✅ Automatic account lockout after 10 failed attempts
- ✅ Suspicious activity detection and email alerts
- ✅ Rate limiting: 5 attempts per 15 minutes
- ✅ Challenge expiration: 10 minutes
- ✅ TOTP replay attack prevention

### Authentication Flow
```
1. User logs in with username/password
2. Backend initiates 2FA challenge → Returns challengeToken
3. Frontend displays verification screen
4. User enters verification code
5. Frontend verifies code → Backend validates
6. Success → User gains full access
```

---

## API Endpoints

### 1. Initiate 2FA Challenge

**Endpoint:** `POST /api/auth/2fa/challenge`  
**Authentication:** Requires successful password authentication (pre-authentication step)  
**Purpose:** Start a 2FA verification challenge for a user

#### Request

```typescript
POST /api/auth/2fa/challenge
Content-Type: application/json

{
  "userId": "clxxxxxxxxxxxxxx",
  "temporaryToken": "optional_temp_token_from_password_auth" // Optional
}
```

#### Response (Success - 200)

```typescript
{
  "success": true,
  "data": {
    "challengeToken": "base64url_encoded_token_32_bytes",
    "expiresAt": "2025-10-19T14:30:00.000Z", // 10 minutes from now
    "method": "SMS" | "AUTHENTICATOR",
    "maskedPhone": "****1234", // Only present if method is SMS
    "message": "A verification code has been sent to ****1234" // User-friendly message
  }
}
```

#### Response (Error)

```typescript
// 2FA Not Enabled (400)
{
  "success": false,
  "error": {
    "code": "2FA_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled for this account"
  }
}

// Account Locked (403)
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is locked until 2025-10-19T15:00:00.000Z"
  }
}

// Rate Limit Exceeded (429)
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many challenge requests. Please try again later."
  }
}
```

---

### 2. Verify SMS OTP

**Endpoint:** `POST /api/auth/2fa/verify-sms`  
**Authentication:** Requires valid challengeToken from initiate endpoint  
**Purpose:** Verify the SMS one-time password and complete authentication

#### Request

```typescript
POST /api/auth/2fa/verify-sms
Content-Type: application/json

{
  "challengeToken": "base64url_encoded_token_from_challenge",
  "code": "123456" // 6-digit numeric code
}
```

#### Response (Success - 200)

```typescript
{
  "success": true,
  "data": {
    "message": "Two-factor authentication successful"
    // Note: Session token generation is handled by the auth system
    // Your login flow should proceed to create the user session
  }
}
```

#### Response (Error - Invalid Code)

```typescript
// Invalid Code (401)
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Invalid verification code",
    "attemptsRemaining": 4 // Decrements with each failed attempt
  }
}

// Challenge Expired (410)
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Challenge has expired. Please request a new code.",
    "attemptsRemaining": 0
  }
}

// Account Locked (403)
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Maximum verification attempts exceeded",
    "attemptsRemaining": 0,
    "lockedUntil": "2025-10-19T16:00:00.000Z"
  }
}

// Rate Limit (429)
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Too many verification attempts. Please try again in 12 minutes.",
    "attemptsRemaining": 0
  }
}
```

---

### 3. Verify TOTP (Authenticator)

**Endpoint:** `POST /api/auth/2fa/verify-totp`  
**Authentication:** Requires valid challengeToken from initiate endpoint  
**Purpose:** Verify the TOTP code from authenticator app and complete authentication

#### Request

```typescript
POST /api/auth/2fa/verify-totp
Content-Type: application/json

{
  "challengeToken": "base64url_encoded_token_from_challenge",
  "code": "123456" // 6-digit TOTP code from authenticator app
}
```

#### Response

Same response structure as **Verify SMS OTP** above. All status codes and error handling are identical.

**Additional TOTP-specific error:**

```typescript
// Code Already Used (401) - Replay attack prevention
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "This code has already been used",
    "attemptsRemaining": 4
  }
}
```

---

### 4. Resend SMS Code

**Endpoint:** `POST /api/auth/2fa/resend-sms`  
**Authentication:** Requires valid challengeToken  
**Purpose:** Request a new SMS verification code

#### Request

```typescript
POST /api/auth/2fa/resend-sms
Content-Type: application/json

{
  "challengeToken": "base64url_encoded_token_from_challenge"
}
```

#### Response (Success - 200)

```typescript
{
  "success": true,
  "data": {
    "message": "Verification code has been resent",
    "remainingAttempts": 2 // 3 resends allowed per 15-minute window
  }
}
```

#### Response (Error)

```typescript
// Rate Limit Exceeded (429)
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many resend requests. Please try again later.",
    "resetAt": "2025-10-19T14:45:00.000Z",
    "remainingAttempts": 0
  }
}

// Challenge Expired (410)
{
  "success": false,
  "error": {
    "code": "RESEND_FAILED",
    "message": "Challenge has expired. Please initiate a new login."
  }
}

// Wrong Method (400)
{
  "success": false,
  "error": {
    "code": "RESEND_FAILED",
    "message": "This challenge does not use SMS verification"
  }
}
```

---

### 5. Switch 2FA Method

**Endpoint:** `POST /api/auth/2fa/switch-method`  
**Authentication:** Requires valid challengeToken  
**Purpose:** Switch between SMS and Authenticator during active challenge (requires both methods enabled)

#### Request

```typescript
POST /api/auth/2fa/switch-method
Content-Type: application/json

{
  "challengeToken": "base64url_encoded_token_from_challenge",
  "newMethod": "SMS" | "AUTHENTICATOR"
}
```

#### Response (Success - 200)

```typescript
{
  "success": true,
  "data": {
    "challengeToken": "new_base64url_encoded_token", // ⚠️ New token issued
    "expiresAt": "2025-10-19T14:30:00.000Z", // Same expiry as original
    "method": "SMS",
    "maskedPhone": "****1234", // If SMS selected
    "message": "A verification code has been sent to ****1234"
  }
}
```

#### Response (Error)

```typescript
// Challenge Expired (400)
{
  "success": false,
  "error": {
    "code": "CHALLENGE_EXPIRED",
    "message": "Challenge has expired. Please restart the login process."
  }
}

// Too Many Switches (429)
{
  "success": false,
  "error": {
    "code": "TOO_MANY_SWITCHES",
    "message": "Maximum method switches exceeded. Please restart the login process."
  }
}

// Both Methods Required (400)
{
  "success": false,
  "error": {
    "code": "BOTH_METHODS_REQUIRED",
    "message": "Both SMS and authenticator methods must be enabled to switch between them"
  }
}

// Same Method (400)
{
  "success": false,
  "error": {
    "code": "SAME_METHOD",
    "message": "Already using this verification method"
  }
}
```

---

## TypeScript Type Definitions

### Request Types

```typescript
/**
 * Initiate 2FA Challenge Request
 */
export interface Initiate2FARequest {
  userId: string;
  temporaryToken?: string; // Optional: token from password authentication
}

/**
 * Verify SMS OTP Request
 */
export interface VerifySmsRequest {
  challengeToken: string;
  code: string; // 6-digit numeric string
}

/**
 * Verify TOTP Request
 */
export interface VerifyTotpRequest {
  challengeToken: string;
  code: string; // 6-digit numeric string
}

/**
 * Resend SMS Code Request
 */
export interface ResendSmsRequest {
  challengeToken: string;
}

/**
 * Switch 2FA Method Request
 */
export interface Switch2FAMethodRequest {
  challengeToken: string;
  newMethod: TwoFactorMethod;
}

/**
 * 2FA Method Enum
 */
export type TwoFactorMethod = 'SMS' | 'AUTHENTICATOR';
```

### Response Types

```typescript
/**
 * Challenge Initiated Response
 */
export interface Challenge2FAResponse {
  success: true;
  data: {
    challengeToken: string;
    expiresAt: string; // ISO 8601 datetime
    method: TwoFactorMethod;
    maskedPhone?: string; // Only present for SMS method
    message: string; // User-friendly message to display
  };
}

/**
 * Verification Success Response
 */
export interface Verification2FASuccessResponse {
  success: true;
  data: {
    message: string;
  };
}

/**
 * Verification Failed Response
 */
export interface Verification2FAFailedResponse {
  success: false;
  error: {
    code: 'VERIFICATION_FAILED';
    message: string;
    attemptsRemaining?: number;
    lockedUntil?: string; // ISO 8601 datetime
  };
}

/**
 * Resend SMS Success Response
 */
export interface ResendSmsSuccessResponse {
  success: true;
  data: {
    message: string;
    remainingAttempts: number; // Number of resends remaining
  };
}

/**
 * Resend SMS Failed Response
 */
export interface ResendSmsFailedResponse {
  success: false;
  error: {
    code: 'RATE_LIMIT_EXCEEDED' | 'RESEND_FAILED';
    message: string;
    resetAt?: string; // ISO 8601 datetime - when rate limit resets
    remainingAttempts?: number;
  };
}

/**
 * Generic Error Response
 */
export interface TwoFactor2FAErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      path: string[];
      message: string;
    }>;
  };
}
```

### Union Types for API Responses

```typescript
/**
 * All possible responses from Initiate Challenge endpoint
 */
export type Initiate2FAResult = 
  | Challenge2FAResponse
  | TwoFactor2FAErrorResponse;

/**
 * All possible responses from Verify endpoints
 */
export type Verify2FAResult = 
  | Verification2FASuccessResponse
  | Verification2FAFailedResponse
  | TwoFactor2FAErrorResponse;

/**
 * All possible responses from Resend SMS endpoint
 */
export type ResendSms2FAResult = 
  | ResendSmsSuccessResponse
  | ResendSmsFailedResponse
  | TwoFactor2FAErrorResponse;

/**
 * All possible responses from Switch Method endpoint
 */
export type Switch2FAMethodResult = 
  | Challenge2FAResponse
  | TwoFactor2FAErrorResponse;
```

---

## Business Logic & Validation Rules

### Challenge Token Lifecycle

| Property | Value |
|----------|-------|
| **Token Length** | 32 bytes (base64url encoded) |
| **Expiration Time** | 10 minutes from creation |
| **Single Use** | Token invalidated after successful verification |
| **Storage** | Redis (in-memory cache) |

### Verification Code Requirements

#### SMS OTP
- **Length:** Exactly 6 digits
- **Format:** Numeric only (`^\d{6}$`)
- **Valid Characters:** 0-9
- **Expiration:** Same as challenge token (10 minutes)
- **Attempts:** Maximum 5 per challenge
- **Regeneration:** New code generated on resend

#### TOTP (Authenticator)
- **Length:** Exactly 6 digits
- **Format:** Numeric only (`^\d{6}$`)
- **Time Window:** ±30 seconds (1 step) from current time
- **Algorithm:** SHA-1 based TOTP
- **Replay Protection:** Code can only be used once within its validity window
- **Clock Skew Tolerance:** ±1 time step (30 seconds before/after)

### Rate Limiting Rules

| Action | Limit | Window | Consequence |
|--------|-------|--------|-------------|
| **Challenge Initiation** | 10 requests | 15 minutes | Error: "Too many challenge requests" |
| **Code Verification** | 5 attempts | 15 minutes | Error: "Too many verification attempts" |
| **SMS Resend** | 3 requests | 15 minutes | Error: "Too many resend requests" |
| **Method Switches** | 3 switches | Per challenge session | Error: "Maximum method switches exceeded" |
| **Failed Verifications** | 10 failures | Global counter | Account locked for 1 hour |

### Account Lockout

| Trigger | Duration | Alert Sent |
|---------|----------|------------|
| **10 failed verification attempts** | 1 hour | ✅ Email: "Account temporarily locked" |
| **5+ failed attempts (not locked)** | N/A | ✅ Email: "Suspicious activity detected" |
| **New device/IP login** | N/A | ✅ Email: "New login to your account" |

### Validation Rules

#### Frontend Validation (Pre-submit)
```typescript
// Code validation
const validateCode = (code: string): boolean => {
  return /^\d{6}$/.test(code);
};

// Challenge token validation
const validateChallengeToken = (token: string): boolean => {
  return token.length >= 32;
};
```

#### Backend Validation (Enforced)
- ✅ Code must be exactly 6 digits
- ✅ Code must contain only numeric characters
- ✅ Challenge token must exist and not be expired
- ✅ Challenge method must match verification endpoint
- ✅ User must not exceed attempt limits
- ✅ TOTP codes must not be reused (replay protection)

### Challenge Expiration Behavior

When a challenge expires:
1. **Verification attempts** → Return `410 Gone` status
2. **Resend requests** → Return `410 Gone` status
3. **Method switch** → Return `400 Bad Request` with `CHALLENGE_EXPIRED`
4. Frontend should redirect user to restart login

### Method Switching Rules

Users can switch between SMS and AUTHENTICATOR **only if**:
- ✅ Both methods are enabled on their account
- ✅ Challenge has not expired
- ✅ Less than 3 switches already made in current session
- ✅ Switching to a different method (not same as current)

---

## Error Handling

### Error Code Reference

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request data invalid | Fix input format |
| `2FA_NOT_ENABLED` | 400 | User doesn't have 2FA | Cannot proceed with 2FA |
| `ACCOUNT_LOCKED` | 403 | Too many failed attempts | Wait until `lockedUntil` time |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry after `resetAt` |
| `VERIFICATION_FAILED` | 401 | Invalid code | Retry with correct code |
| `CHALLENGE_EXPIRED` | 410 | Token expired | Restart login flow |
| `RESEND_FAILED` | 400 | Cannot resend SMS | Check error message details |
| `TOO_MANY_SWITCHES` | 429 | Method switch limit hit | Restart login flow |
| `BOTH_METHODS_REQUIRED` | 400 | User only has one method | Cannot switch |
| `SAME_METHOD` | 400 | Already using requested method | No action needed |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Retry or contact support |

### HTTP Status Code Mapping

```typescript
const getStatusCode = (errorCode: string): number => {
  const statusMap: Record<string, number> = {
    'VALIDATION_ERROR': 400,
    '2FA_NOT_ENABLED': 400,
    'RESEND_FAILED': 400,
    'CHALLENGE_EXPIRED': 400,
    'BOTH_METHODS_REQUIRED': 400,
    'SAME_METHOD': 400,
    'VERIFICATION_FAILED': 401, // May also be 410, 429, 403
    'ACCOUNT_LOCKED': 403,
    'RATE_LIMIT_EXCEEDED': 429,
    'TOO_MANY_SWITCHES': 429,
    'INTERNAL_SERVER_ERROR': 500,
  };
  return statusMap[errorCode] || 500;
};
```

### User-Friendly Error Messages

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Please enter a valid 6-digit code',
  '2FA_NOT_ENABLED': 'Two-factor authentication is not set up for your account',
  ACCOUNT_LOCKED: 'Your account has been temporarily locked due to too many failed attempts. Please try again later.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait a few minutes and try again.',
  VERIFICATION_FAILED: 'Invalid verification code. Please try again.',
  CHALLENGE_EXPIRED: 'Your verification session has expired. Please log in again.',
  RESEND_FAILED: 'Unable to resend code. Please try again.',
  TOO_MANY_SWITCHES: 'Too many method switches. Please restart the login process.',
  BOTH_METHODS_REQUIRED: 'You need both SMS and authenticator enabled to switch methods.',
  SAME_METHOD: 'You are already using this verification method.',
  INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again or contact support.',
};
```

### Error Handling Implementation

```typescript
const handle2FAError = (error: TwoFactor2FAErrorResponse) => {
  const { code, message, details } = error.error;

  // Log for debugging
  console.error('[2FA Error]', { code, message, details });

  // Display user-friendly message
  const userMessage = ERROR_MESSAGES[code] || message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  
  // Show toast/alert
  toast.error(userMessage);

  // Handle specific error codes
  switch (code) {
    case 'ACCOUNT_LOCKED':
      // Show locked screen with countdown
      const lockedUntil = error.error.lockedUntil;
      showAccountLockedScreen(lockedUntil);
      break;
      
    case 'CHALLENGE_EXPIRED':
    case 'TOO_MANY_SWITCHES':
      // Redirect to login
      router.push('/login');
      break;
      
    case 'RATE_LIMIT_EXCEEDED':
      // Disable submit button and show countdown
      const resetAt = error.error.resetAt;
      showRateLimitCountdown(resetAt);
      break;
      
    case 'VERIFICATION_FAILED':
      // Show remaining attempts
      const remaining = error.error.attemptsRemaining;
      if (remaining !== undefined) {
        toast.error(`${userMessage} (${remaining} attempts remaining)`);
      }
      break;
  }
};
```

### Retry Logic

```typescript
/**
 * Retry configuration for transient errors
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000, // 1 second
  retryStatusCodes: [500, 502, 503, 504], // Server errors only
};

/**
 * DO NOT retry on:
 * - 400 (Bad Request) - User input error
 * - 401 (Unauthorized) - Invalid credentials
 * - 403 (Forbidden) - Account locked
 * - 429 (Rate Limited) - Too many requests
 */
```

---

## Authorization & Permissions

### Access Control

| Endpoint | Auth Required | Permission Level | Notes |
|----------|---------------|------------------|-------|
| `POST /api/auth/2fa/challenge` | Pre-auth | Public | Must have valid userId |
| `POST /api/auth/2fa/verify-sms` | Challenge token | Public | Token validates ownership |
| `POST /api/auth/2fa/verify-totp` | Challenge token | Public | Token validates ownership |
| `POST /api/auth/2fa/resend-sms` | Challenge token | Public | Token validates ownership |
| `POST /api/auth/2fa/switch-method` | Challenge token | Public | Token validates ownership |

### Security Model

**Challenge Token = Temporary Authorization**

The `challengeToken` acts as a temporary authorization credential:
- ✅ Proves user passed password authentication
- ✅ Scoped to single 2FA challenge session
- ✅ Short-lived (10 minutes)
- ✅ Single-use (invalidated on success)
- ✅ Cannot be reused across sessions

**No JWT Required**

These endpoints are called **before** the user has a valid session JWT. The challenge token is the authorization mechanism for this intermediate authentication step.

### IP Address & Device Tracking

All endpoints extract and log:
- **IP Address:** From `x-forwarded-for` or `x-real-ip` headers
- **User Agent:** From `user-agent` header

This metadata is used for:
- Suspicious activity detection
- Account lockout decisions
- Security alert emails

### Data Privacy

**What's logged in audit events:**
- ✅ Timestamp of verification attempts
- ✅ IP address and user agent
- ✅ Success/failure status
- ❌ **Never logged:** Actual verification codes

---

## Rate Limiting & Security

### Rate Limit Headers

Currently, rate limit information is **not exposed via response headers**. Limits are enforced server-side and communicated via error responses.

**Future Enhancement:** Consider adding these headers:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1697723400
```

### Rate Limit Strategy

```typescript
/**
 * Rate limiting is enforced using Redis counters with sliding windows
 */
const RATE_LIMITS = {
  challengeInitiation: {
    max: 10,
    window: 15 * 60, // 15 minutes in seconds
    key: (userId: string) => `ratelimit:login:${userId}:challenge`,
  },
  codeVerification: {
    max: 5,
    window: 15 * 60,
    key: (userId: string) => `2fa:verify:${userId}`,
  },
  smsResend: {
    max: 3,
    window: 15 * 60,
    key: (userId: string) => `2fa:resend:${userId}`,
  },
  methodSwitch: {
    max: 3,
    window: 'per challenge', // Resets when challenge expires
    key: (userId: string) => `2fa:challenge:${userId}:switch_count`,
  },
};
```

### Security Features

#### 1. Account Lockout Protection
```typescript
/**
 * Automatic account lockout after 10 failed verification attempts
 * Lockout duration: 1 hour
 */
const LOCKOUT_CONFIG = {
  maxAttempts: 10,
  lockoutDuration: 60 * 60, // 1 hour in seconds
};
```

#### 2. TOTP Replay Attack Prevention
```typescript
/**
 * Each TOTP code can only be used once within its validity window (±30 seconds)
 * Used codes are stored in Redis for 2x the time window
 */
const TOTP_REPLAY_PROTECTION = {
  window: 1, // ±30 seconds
  codeValidityMs: 30 * 1000,
  storageDurationMs: 2 * 30 * 1000,
};
```

#### 3. Email Security Alerts

Alerts are automatically sent for:

| Event | Trigger | Email Subject |
|-------|---------|---------------|
| **Account Locked** | 10 failed attempts | "🔒 Your Account Has Been Temporarily Locked" |
| **Suspicious Activity** | 5+ failed attempts | "⚠️ Suspicious Login Activity Detected" |
| **New Device Login** | Login from new IP | "🔐 New Login to Your Account" |

#### 4. Challenge Token Security
- **Cryptographic randomness:** `crypto.randomBytes(32)`
- **Base64url encoding:** URL-safe, no special characters
- **Single-use:** Invalidated immediately after successful verification
- **Expiration:** 10 minutes maximum lifetime

---

## Implementation Flow

### Complete Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Login Flow                          │
└─────────────────────────────────────────────────────────────┘

Step 1: Password Authentication
┌──────────────────────┐
│  POST /api/auth/login │
│  { email, password }  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│  Password Valid?          │
│  2FA Enabled?            │
└──────────┬───────────────┘
           │ Yes
           ▼
Step 2: Initiate 2FA Challenge
┌──────────────────────────────┐
│ POST /api/auth/2fa/challenge │
│ { userId }                   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Response:                    │
│ - challengeToken             │
│ - method (SMS/AUTHENTICATOR) │
│ - expiresAt                  │
│ - maskedPhone (if SMS)       │
└──────────┬───────────────────┘
           │
           ▼
Step 3: Display Verification Screen
┌──────────────────────────────┐
│ User sees:                   │
│ - 6-digit code input         │
│ - "Resend code" (if SMS)     │
│ - "Use other method" option  │
│ - Countdown timer            │
└──────────┬───────────────────┘
           │
           ├─────────────────┐
           │ User Actions:    │
           ▼                  │
┌──────────────────────┐     │
│ Enter Code           │     │
└──────────┬───────────┘     │
           │                  │
           ▼                  │
Step 4: Verify Code          │
┌──────────────────────┐     │
│ POST verify-sms OR   │     │
│ POST verify-totp     │     │
│ { challengeToken,    │     │
│   code }             │     │
└──────────┬───────────┘     │
           │                  │
           ▼                  │
┌──────────────────────┐     │
│ Code Valid?          │     │
└──────────┬───────────┘     │
           │ Success          │
           ▼                  │
┌──────────────────────┐     │
│ Authentication       │     │
│ Complete             │     │
│ → Create Session     │     │
│ → Redirect to App    │     │
└──────────────────────┘     │
                              │
Optional Actions ─────────────┘
                              
┌──────────────────────────┐
│ Resend SMS Code          │
│ POST /resend-sms         │
│ { challengeToken }       │
└──────────────────────────┘

┌──────────────────────────┐
│ Switch Method            │
│ POST /switch-method      │
│ { challengeToken,        │
│   newMethod }            │
│ → New challengeToken     │
└──────────────────────────┘
```

### State Management

```typescript
/**
 * 2FA Challenge State
 */
interface TwoFactorChallengeState {
  // Challenge data
  challengeToken: string | null;
  method: TwoFactorMethod | null;
  maskedPhone: string | null;
  expiresAt: Date | null;
  
  // UI state
  code: string; // 6-digit input
  isVerifying: boolean;
  isResending: boolean;
  isSwitching: boolean;
  
  // Attempt tracking
  attemptsRemaining: number | null;
  canResend: boolean;
  resendCooldownUntil: Date | null;
  
  // Error state
  error: string | null;
}

/**
 * Actions
 */
type TwoFactorChallengeAction =
  | { type: 'SET_CHALLENGE'; payload: Challenge2FAResponse['data'] }
  | { type: 'UPDATE_CODE'; payload: string }
  | { type: 'VERIFY_START' }
  | { type: 'VERIFY_SUCCESS' }
  | { type: 'VERIFY_FAILURE'; payload: Verification2FAFailedResponse['error'] }
  | { type: 'RESEND_START' }
  | { type: 'RESEND_SUCCESS'; payload: ResendSmsSuccessResponse['data'] }
  | { type: 'RESEND_FAILURE'; payload: ResendSmsFailedResponse['error'] }
  | { type: 'SWITCH_METHOD'; payload: TwoFactorMethod }
  | { type: 'RESET' };
```

### Example React Hook

```typescript
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function use2FAChallenge(initialChallengeToken?: string) {
  const router = useRouter();
  const [state, setState] = useState<TwoFactorChallengeState>({
    challengeToken: initialChallengeToken || null,
    method: null,
    maskedPhone: null,
    expiresAt: null,
    code: '',
    isVerifying: false,
    isResending: false,
    isSwitching: false,
    attemptsRemaining: null,
    canResend: true,
    resendCooldownUntil: null,
    error: null,
  });

  // Auto-format code input to 6 digits
  const updateCode = useCallback((value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 6);
    setState(prev => ({ ...prev, code: sanitized, error: null }));
  }, []);

  // Initiate challenge (called after password auth)
  const initiateChallenge = useCallback(async (userId: string) => {
    try {
      const response = await fetch('/api/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error.message);
      }

      setState(prev => ({
        ...prev,
        challengeToken: result.data.challengeToken,
        method: result.data.method,
        maskedPhone: result.data.maskedPhone,
        expiresAt: new Date(result.data.expiresAt),
        attemptsRemaining: 5,
      }));

      toast.success(result.data.message);
      return result.data;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to initiate 2FA');
      throw error;
    }
  }, []);

  // Verify code
  const verifyCode = useCallback(async () => {
    if (!state.challengeToken) return;
    if (state.code.length !== 6) {
      setState(prev => ({ ...prev, error: 'Please enter a 6-digit code' }));
      return;
    }

    setState(prev => ({ ...prev, isVerifying: true, error: null }));

    try {
      const endpoint = state.method === 'SMS' 
        ? '/api/auth/2fa/verify-sms' 
        : '/api/auth/2fa/verify-totp';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: state.challengeToken,
          code: state.code,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isVerifying: false,
          error: result.error.message,
          attemptsRemaining: result.error.attemptsRemaining ?? prev.attemptsRemaining,
        }));

        // Handle specific errors
        if (result.error.lockedUntil) {
          router.push(`/auth/locked?until=${result.error.lockedUntil}`);
        }
        return;
      }

      // Success! Handle session creation in parent component
      setState(prev => ({ ...prev, isVerifying: false }));
      toast.success('Authentication successful');
      
      // Trigger success callback or navigation
      router.push('/dashboard');
    } catch (error) {
      setState(prev => ({
        ...prev,
        isVerifying: false,
        error: 'Failed to verify code. Please try again.',
      }));
      toast.error('Verification failed');
    }
  }, [state.challengeToken, state.code, state.method, router]);

  // Resend SMS code
  const resendCode = useCallback(async () => {
    if (!state.challengeToken || !state.canResend) return;

    setState(prev => ({ ...prev, isResending: true, error: null }));

    try {
      const response = await fetch('/api/auth/2fa/resend-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: state.challengeToken }),
      });

      const result = await response.json();

      if (!result.success) {
        if (result.error.code === 'RATE_LIMIT_EXCEEDED') {
          setState(prev => ({
            ...prev,
            isResending: false,
            canResend: false,
            resendCooldownUntil: new Date(result.error.resetAt),
          }));
        } else {
          setState(prev => ({
            ...prev,
            isResending: false,
            error: result.error.message,
          }));
        }
        toast.error(result.error.message);
        return;
      }

      setState(prev => ({
        ...prev,
        isResending: false,
        code: '', // Clear previous input
      }));
      toast.success('Verification code sent');
    } catch (error) {
      setState(prev => ({ ...prev, isResending: false }));
      toast.error('Failed to resend code');
    }
  }, [state.challengeToken, state.canResend]);

  // Switch 2FA method
  const switchMethod = useCallback(async (newMethod: TwoFactorMethod) => {
    if (!state.challengeToken) return;

    setState(prev => ({ ...prev, isSwitching: true, error: null }));

    try {
      const response = await fetch('/api/auth/2fa/switch-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: state.challengeToken,
          newMethod,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isSwitching: false,
          error: result.error.message,
        }));
        toast.error(result.error.message);
        return;
      }

      // Update with new challenge data
      setState(prev => ({
        ...prev,
        challengeToken: result.data.challengeToken, // ⚠️ New token
        method: result.data.method,
        maskedPhone: result.data.maskedPhone,
        code: '', // Clear input
        isSwitching: false,
        attemptsRemaining: 5, // Reset attempts
      }));

      toast.success(result.data.message);
    } catch (error) {
      setState(prev => ({ ...prev, isSwitching: false }));
      toast.error('Failed to switch verification method');
    }
  }, [state.challengeToken]);

  // Handle expiration countdown
  useEffect(() => {
    if (!state.expiresAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      if (now >= state.expiresAt) {
        clearInterval(interval);
        setState(prev => ({
          ...prev,
          error: 'Verification session expired',
        }));
        toast.error('Your verification session has expired. Please log in again.');
        router.push('/login');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.expiresAt, router]);

  return {
    state,
    actions: {
      updateCode,
      initiateChallenge,
      verifyCode,
      resendCode,
      switchMethod,
    },
  };
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic 2FA Challenge Flow
- [ ] Create 2FA verification page/component
- [ ] Implement `use2FAChallenge` hook or equivalent state management
- [ ] Add 6-digit code input component (auto-focus, auto-submit)
- [ ] Display verification method (SMS or Authenticator)
- [ ] Show masked phone number for SMS
- [ ] Add countdown timer showing time until expiration
- [ ] Implement code verification on submit
- [ ] Handle verification success → redirect to dashboard
- [ ] Handle verification failure → show error + attempts remaining

### Phase 2: SMS Features
- [ ] Add "Resend Code" button (disabled during cooldown)
- [ ] Implement resend cooldown timer
- [ ] Show remaining resend attempts
- [ ] Handle resend rate limit errors
- [ ] Display SMS delivery status messages

### Phase 3: Method Switching
- [ ] Add "Use Authenticator App" / "Use SMS Instead" toggle
- [ ] Implement method switch API call
- [ ] Update UI when method changes (clear code input)
- [ ] Handle new challengeToken after switch
- [ ] Show appropriate instructions for each method
- [ ] Disable switching after 3 attempts

### Phase 4: Error Handling
- [ ] Create error message component
- [ ] Handle validation errors (invalid code format)
- [ ] Handle account lockout (redirect to locked screen)
- [ ] Handle rate limiting (show countdown)
- [ ] Handle expired challenges (redirect to login)
- [ ] Show user-friendly error messages
- [ ] Log errors for debugging

### Phase 5: Security & UX
- [ ] Clear sensitive data on unmount
- [ ] Prevent code auto-fill by browsers (if needed)
- [ ] Add loading states for all actions
- [ ] Disable submit button during verification
- [ ] Add keyboard shortcuts (Enter to submit)
- [ ] Support paste from clipboard (SMS codes)
- [ ] Add accessibility labels (ARIA)
- [ ] Show visual feedback for remaining attempts

### Phase 6: Mobile Optimization
- [ ] Use numeric keyboard for code input (`inputMode="numeric"`)
- [ ] Optimize button sizes for touch
- [ ] Test on various screen sizes
- [ ] Handle SMS deep links (auto-fill codes on iOS)
- [ ] Test with screen readers

### Phase 7: Testing
- [ ] Unit tests for validation logic
- [ ] Integration tests for API calls
- [ ] E2E tests for complete flow
- [ ] Test error scenarios
- [ ] Test rate limiting behavior
- [ ] Test expiration handling
- [ ] Test method switching

### Phase 8: Analytics & Monitoring
- [ ] Track 2FA challenge initiations
- [ ] Track verification success/failure rates
- [ ] Track method switch usage
- [ ] Monitor average verification time
- [ ] Alert on high failure rates

---

## Testing Recommendations

### Test Cases

#### Happy Path
1. **SMS Verification**
   - Initiate challenge → Receive SMS → Enter code → Success
   
2. **TOTP Verification**
   - Initiate challenge → Open authenticator → Enter code → Success

3. **Method Switching**
   - Start with SMS → Switch to Authenticator → Verify → Success

#### Error Cases
1. **Invalid Code**
   - Enter wrong code → See error + attempts remaining
   
2. **Expired Challenge**
   - Wait 10 minutes → Try to verify → Redirect to login

3. **Rate Limiting**
   - Make 5 verification attempts → Get rate limited
   - Request 3 SMS resends → Get rate limited

4. **Account Lockout**
   - Fail verification 10 times → Account locked

5. **Code Replay (TOTP)**
   - Use same TOTP code twice → Second attempt fails

### Manual Testing Checklist

```
[ ] Can initiate 2FA challenge after password auth
[ ] SMS code arrives within 30 seconds
[ ] Can enter and submit 6-digit code
[ ] Invalid code shows error message
[ ] Attempts remaining counter decrements
[ ] Can resend SMS code
[ ] Resend cooldown works correctly
[ ] Can switch to Authenticator
[ ] Can switch back to SMS
[ ] TOTP codes work with Google Authenticator
[ ] TOTP codes work with Authy
[ ] Challenge expires after 10 minutes
[ ] Account locks after 10 failed attempts
[ ] Rate limiting triggers correctly
[ ] Error messages are user-friendly
[ ] Loading states display properly
[ ] Mobile keyboard is numeric
[ ] Paste works for SMS codes
[ ] Screen reader announces errors
```

### API Testing with cURL

```bash
# 1. Initiate Challenge
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id"
  }'

# Response: Save the challengeToken

# 2. Verify SMS OTP
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/verify-sms \
  -H "Content-Type: application/json" \
  -d '{
    "challengeToken": "TOKEN_FROM_STEP_1",
    "code": "123456"
  }'

# 3. Resend SMS Code
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/resend-sms \
  -H "Content-Type: application/json" \
  -d '{
    "challengeToken": "TOKEN_FROM_STEP_1"
  }'

# 4. Switch Method
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/switch-method \
  -H "Content-Type: application/json" \
  -d '{
    "challengeToken": "TOKEN_FROM_STEP_1",
    "newMethod": "AUTHENTICATOR"
  }'
```

---

## Related Documentation

- [Multi-Step Login Implementation](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART1.md)
- [Authenticator 2FA Setup](./AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md)
- [2FA Management Dashboard](./ADMIN_2FA_MANAGEMENT_IMPLEMENTATION.md)
- [2FA Compliance Reporting](./2FA_COMPLIANCE_REPORTING_IMPLEMENTATION.md)

---

## Support & Questions

**Backend Developer:** Backend team  
**API Base URL:** `https://ops.yesgoddess.agency`  
**Frontend Repo:** `yesgoddess-web`

If you encounter issues or need clarification:
1. Check error response codes and messages
2. Review this documentation
3. Contact backend team with specific error details
4. Include `challengeToken` (first 10 chars only) for debugging

---

**Document Version:** 1.0  
**Last Updated:** October 19, 2025  
**Status:** ✅ Complete & Ready for Frontend Integration
