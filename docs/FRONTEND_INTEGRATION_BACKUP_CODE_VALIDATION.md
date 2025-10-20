# Frontend Integration Guide: Backup Code Validation

> **Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
> **Module:** Two-Factor Authentication - Backup Code Validation  
> **Last Updated:** October 19, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [User Experience Flows](#user-experience-flows)
9. [Security Considerations](#security-considerations)
10. [Email Notifications](#email-notifications)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)
12. [Testing Scenarios](#testing-scenarios)

---

## Overview

### Purpose
The Backup Code Validation module allows users to authenticate using single-use backup codes when they cannot access their authenticator app. This is a critical failsafe mechanism for 2FA-enabled accounts.

### Key Features
- ✅ Verify backup codes during authenticated sessions
- ✅ Verify backup codes during multi-step login flow
- ✅ One-time use enforcement (codes cannot be reused)
- ✅ Automatic low-code alerts when < 3 codes remain
- ✅ Security audit logging for all verification attempts
- ✅ Race condition protection for concurrent requests

### Architecture Context
```
┌─────────────────┐      POST /api/auth/2fa/verify-backup      ┌──────────────┐
│   Frontend UI   │ ──────────────────────────────────────────> │   Backend    │
│  (Next.js 15)   │ <────────────────────────────────────────── │  REST API    │
└─────────────────┘           JSON Response                      └──────────────┘
                                                                        │
                                                                        v
                                                                  ┌──────────┐
                                                                  │ Database │
                                                                  │ + Redis  │
                                                                  └──────────┘
```

---

## API Endpoints

### 1. Verify Backup Code (Authenticated Session)

**Endpoint:** `POST /api/auth/2fa/verify-backup`

**Purpose:** Verifies a backup code for an authenticated user (used when user is already logged in but needs to verify 2FA)

**Authentication Required:** ✅ Yes (JWT session required)

**Request:**

```typescript
// HTTP Headers
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <session-token>" // Automatically handled by NextAuth
}

// Request Body
{
  "code": "ABCD-EFGH-IJKL-MNOP" // 8-20 characters
}
```

**Response (Success - 200 OK):**

```json
{
  "success": true,
  "data": {
    "verified": true,
    "message": "Backup code verified successfully",
    "warning": "This backup code has been used and cannot be used again. Generate new codes if running low."
  }
}
```

**Response (Error - 401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "BACKUP_CODE_INVALID",
    "message": "Invalid backup code",
    "statusCode": 401
  }
}
```

**cURL Example:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/verify-backup \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{
    "code": "ABCD-EFGH-IJKL-MNOP"
  }'
```

---

### 2. Verify Backup Code (Multi-Step Login)

**Endpoint:** `POST /api/auth/login/2fa/backup-code`

**Purpose:** Completes multi-step login using a backup code (Step 2 of login process)

**Authentication Required:** ❌ No (uses temporary token from Step 1)

**Request:**

```typescript
// HTTP Headers
{
  "Content-Type": "application/json"
}

// Request Body
{
  "temporaryToken": "eyJhbGc...", // From Step 1 login response
  "code": "ABCD-EFGH-IJKL-MNOP",
  "trustDevice": false // Optional, default: false
}
```

**Response (Success - 200 OK):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_abc123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "BRAND",
      "emailVerified": true
    },
    "trustedDeviceToken": "trusted_device_xyz789" // Only if trustDevice: true
  }
}
```

**Response (Error - 401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "TEMP_TOKEN_EXPIRED",
    "message": "Temporary authentication token has expired",
    "statusCode": 401
  }
}
```

---

## TypeScript Type Definitions

### Request/Response Types

```typescript
// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

/**
 * Verify backup code during authenticated session
 * Used when user is logged in and needs to verify 2FA
 */
export interface VerifyBackupCodeRequest {
  /** Backup code (8-20 characters, whitespace and case-insensitive) */
  code: string;
}

/**
 * Verify backup code during multi-step login
 * Used during login flow as Step 2
 */
export interface VerifyBackupCodeLoginRequest {
  /** Temporary token from Step 1 of multi-step login */
  temporaryToken: string;
  /** Backup code (8-20 characters) */
  code: string;
  /** Optional: Remember this device for 30 days */
  trustDevice?: boolean;
}

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Success response for authenticated backup code verification
 */
export interface VerifyBackupCodeResponse {
  success: true;
  data: {
    verified: true;
    message: string;
    warning: string; // Reminder that code is now used
  };
}

/**
 * Success response for multi-step login with backup code
 */
export interface VerifyBackupCodeLoginResponse {
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: 'BRAND' | 'CREATOR' | 'ADMIN' | 'SUPER_ADMIN';
      emailVerified: boolean;
    };
    /** Only present if trustDevice: true in request */
    trustedDeviceToken?: string;
  };
}

/**
 * Error response structure
 */
export interface BackupCodeErrorResponse {
  success: false;
  error: {
    code: BackupCodeErrorCode;
    message: string;
    statusCode: number;
    details?: any; // Only for validation errors
  };
}

// ============================================================================
// ERROR CODES
// ============================================================================

export type BackupCodeErrorCode =
  // Authentication Errors
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  
  // Backup Code Specific Errors
  | 'BACKUP_CODE_INVALID'
  | 'BACKUP_CODE_ALREADY_USED'
  | 'NO_BACKUP_CODES_REMAINING'
  | 'TOTP_NOT_ENABLED'
  
  // Temporary Token Errors (multi-step login)
  | 'TEMP_TOKEN_INVALID'
  | 'TEMP_TOKEN_EXPIRED'
  | 'TEMP_TOKEN_ALREADY_USED'
  
  // Validation Errors
  | 'VALIDATION_ERROR'
  
  // System Errors
  | 'INTERNAL_SERVER_ERROR'
  | 'RATE_LIMITED';

// ============================================================================
// ZEST VALIDATION SCHEMAS (for form validation)
// ============================================================================

import { z } from 'zod';

/**
 * Zod schema for backup code validation
 * Use this in your forms with react-hook-form
 */
export const verifyBackupCodeSchema = z.object({
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
});

export const verifyBackupCodeLoginSchema = z.object({
  temporaryToken: z.string().min(32, 'Invalid temporary token'),
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
  trustDevice: z.boolean().optional().default(false),
});

export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>;
export type VerifyBackupCodeLoginInput = z.infer<typeof verifyBackupCodeLoginSchema>;

// ============================================================================
// DATABASE MODEL (for reference only - not directly used by frontend)
// ============================================================================

/**
 * TwoFactorBackupCode model structure
 * This is stored in the backend database
 */
export interface TwoFactorBackupCode {
  id: string;
  userId: string;
  code: string; // Hashed with bcrypt
  used: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

// ============================================================================
// AUDIT LOG ACTIONS (for reference)
// ============================================================================

export enum BackupCodeAuditAction {
  BACKUP_CODE_VERIFICATION_SUCCESS = 'BACKUP_CODE_VERIFICATION_SUCCESS',
  BACKUP_CODE_VERIFICATION_FAILED = 'BACKUP_CODE_VERIFICATION_FAILED',
  BACKUP_CODE_LOW_ALERT_SENT = 'BACKUP_CODE_LOW_ALERT_SENT',
}
```

---

## Business Logic & Validation Rules

### Code Format Rules

| Rule | Requirement | Notes |
|------|-------------|-------|
| **Length** | 8-20 characters | Usually formatted as `XXXX-XXXX-XXXX-XXXX` (16 chars) |
| **Case Sensitivity** | Case-insensitive | Backend converts to uppercase |
| **Whitespace** | Ignored | Backend strips all whitespace |
| **Valid Characters** | Alphanumeric (A-Z, 0-9) | No special characters except hyphens for readability |
| **Formatting** | Optional hyphens | User can enter with or without hyphens |

### Validation Transform Example

```typescript
// User Input Examples (all valid):
"abcd-efgh-ijkl-mnop"  // With hyphens, lowercase
"ABCD EFGH IJKL MNOP"  // With spaces, uppercase
"abcdefghijklmnop"     // No separators, lowercase
"ABCDEFGHIJKLMNOP"     // No separators, uppercase

// Backend Transformation:
// All above inputs become: "ABCDEFGHIJKLMNOP"
```

### Business Rules

#### 1. **One-Time Use Enforcement**
- ✅ Each backup code can only be used **once**
- ✅ After successful verification, the code is marked as `used: true`
- ❌ Attempting to reuse a code returns `BACKUP_CODE_ALREADY_USED` error
- 🔒 Race condition protection: concurrent requests are detected and prevented

#### 2. **Low Code Alert Threshold**
- When remaining codes < 3, an email alert is sent automatically
- Alert is rate-limited to once per 24 hours (prevents spam)
- Frontend should display a warning banner when codes are low
- Recommend regenerating codes when 2 or fewer remain

#### 3. **Code Depletion Handling**
- When user has 0 unused codes remaining:
  - Returns `NO_BACKUP_CODES_REMAINING` error
  - User must contact support or use alternative 2FA method
  - Admin can regenerate codes for the user

#### 4. **2FA Requirement**
- User **must** have 2FA enabled (`two_factor_enabled: true`)
- If 2FA is not enabled, returns `TOTP_NOT_ENABLED` error
- Backup codes are generated when user first enables 2FA

#### 5. **Temporary Token Expiration** (Multi-Step Login Only)
- Temporary tokens expire after 5 minutes
- After expiration, user must restart login flow (Step 1)
- Token can only be used once (even if verification fails)

---

## Error Handling

### Complete Error Reference

| Error Code | HTTP Status | User-Friendly Message | When It Occurs | Recommended Action |
|------------|-------------|----------------------|----------------|-------------------|
| `UNAUTHORIZED` | 401 | "Please log in to continue" | No valid session | Redirect to login |
| `BACKUP_CODE_INVALID` | 401 | "Invalid backup code. Please try again." | Code doesn't match any unused codes | Allow retry, show remaining attempts |
| `BACKUP_CODE_ALREADY_USED` | 400 | "This backup code has already been used. Each code can only be used once." | User tried to reuse a code | Show error, prompt for different code |
| `NO_BACKUP_CODES_REMAINING` | 400 | "You have no backup codes remaining. Please contact support or regenerate codes." | User has used all backup codes | Direct to regenerate flow or support |
| `TOTP_NOT_ENABLED` | 400 | "Two-factor authentication is not enabled on your account." | User hasn't enabled 2FA | Direct to 2FA setup flow |
| `TEMP_TOKEN_INVALID` | 401 | "Invalid authentication session. Please try logging in again." | Temporary token is malformed | Restart login flow |
| `TEMP_TOKEN_EXPIRED` | 401 | "Your authentication session has expired. Please try logging in again." | Token expired (>5 min) | Restart login flow |
| `TEMP_TOKEN_ALREADY_USED` | 401 | "This authentication session has already been used." | Token was already consumed | Restart login flow |
| `VALIDATION_ERROR` | 400 | "Please enter a valid backup code." | Code format invalid | Show validation errors inline |
| `RATE_LIMITED` | 429 | "Too many attempts. Please try again in X minutes." | Too many failed verifications | Show countdown timer |
| `INTERNAL_SERVER_ERROR` | 500 | "Something went wrong. Please try again." | Unexpected server error | Show retry button, log error |

### Error Response Handler

```typescript
/**
 * Type-safe error handler for backup code verification
 */
export function handleBackupCodeError(
  error: BackupCodeErrorResponse
): {
  userMessage: string;
  action: 'retry' | 'redirect' | 'support' | 'regenerate';
} {
  const { code, message } = error.error;

  switch (code) {
    case 'BACKUP_CODE_INVALID':
      return {
        userMessage: 'Invalid backup code. Please check and try again.',
        action: 'retry',
      };

    case 'BACKUP_CODE_ALREADY_USED':
      return {
        userMessage: 'This backup code has already been used. Please try a different code.',
        action: 'retry',
      };

    case 'NO_BACKUP_CODES_REMAINING':
      return {
        userMessage: 'You have no backup codes remaining. Generate new codes to continue.',
        action: 'regenerate',
      };

    case 'TOTP_NOT_ENABLED':
      return {
        userMessage: 'Two-factor authentication is not enabled on your account.',
        action: 'redirect', // to 2FA setup
      };

    case 'TEMP_TOKEN_EXPIRED':
    case 'TEMP_TOKEN_INVALID':
    case 'TEMP_TOKEN_ALREADY_USED':
      return {
        userMessage: 'Your login session has expired. Please sign in again.',
        action: 'redirect', // to login page
      };

    case 'RATE_LIMITED':
      return {
        userMessage: 'Too many failed attempts. Please wait before trying again.',
        action: 'retry',
      };

    case 'UNAUTHORIZED':
      return {
        userMessage: 'Please log in to continue.',
        action: 'redirect',
      };

    default:
      return {
        userMessage: 'Something went wrong. Please try again.',
        action: 'retry',
      };
  }
}
```

### Validation Error Display

```typescript
// Example: Display Zod validation errors
if (error.error.code === 'VALIDATION_ERROR' && error.error.details) {
  // error.error.details is a Zod error array
  error.error.details.forEach((issue: z.ZodIssue) => {
    console.log(`Field: ${issue.path.join('.')}`);
    console.log(`Error: ${issue.message}`);
  });
}
```

---

## Authorization & Permissions

### Endpoint Access Control

| Endpoint | Authentication | User Roles | Additional Requirements |
|----------|---------------|-----------|------------------------|
| `POST /api/auth/2fa/verify-backup` | ✅ Required | All authenticated users | Must have `two_factor_enabled: true` |
| `POST /api/auth/login/2fa/backup-code` | ❌ Not required | Public (login flow) | Valid temporary token required |

### Permission Matrix

| Action | Brand | Creator | Admin | Super Admin | Notes |
|--------|-------|---------|-------|-------------|-------|
| Verify own backup code | ✅ | ✅ | ✅ | ✅ | All users can verify their own codes |
| View backup codes | ❌ | ❌ | ❌ | ❌ | Codes are never displayed after generation |
| Regenerate own codes | ✅ | ✅ | ✅ | ✅ | Requires password confirmation |
| Regenerate user codes (admin) | ❌ | ❌ | ✅ | ✅ | Admin can help users who are locked out |

### Resource Ownership Rules

- Users can **only** verify their own backup codes
- Session-based verification uses `session.user.id` automatically
- Multi-step login verification uses `userId` from temporary token
- No cross-user verification is possible (enforced by backend)

---

## Rate Limiting & Quotas

### Rate Limit Configuration

| Endpoint | Limit | Window | Reset Behavior |
|----------|-------|--------|----------------|
| `POST /api/auth/2fa/verify-backup` | 5 attempts | 15 minutes | Sliding window, resets after 15 min |
| `POST /api/auth/login/2fa/backup-code` | 5 attempts | 15 minutes | Per IP address |

### Rate Limit Headers

```typescript
// Response headers when rate limited
{
  "X-RateLimit-Limit": "5",
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Reset": "1697740800", // Unix timestamp
  "Retry-After": "900" // Seconds until reset
}
```

### Frontend Rate Limit Handling

```typescript
/**
 * Check rate limit status from response headers
 */
export function checkRateLimitStatus(response: Response): {
  isLimited: boolean;
  remaining: number;
  resetAt: Date | null;
} {
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '999');
  const resetTimestamp = parseInt(response.headers.get('X-RateLimit-Reset') || '0');

  return {
    isLimited: response.status === 429,
    remaining,
    resetAt: resetTimestamp ? new Date(resetTimestamp * 1000) : null,
  };
}

// Usage in UI component
const { isLimited, remaining, resetAt } = checkRateLimitStatus(response);

if (isLimited && resetAt) {
  const minutesRemaining = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
  showError(`Too many attempts. Try again in ${minutesRemaining} minutes.`);
}
```

### Low Code Alert Rate Limiting

- Email alert for low backup codes is sent **once per 24 hours**
- Tracked via Redis with key: `backup-codes-alert:{userId}`
- Frontend should show banner immediately when codes < 3 (don't wait for email)

---

## User Experience Flows

### Flow 1: Backup Code Verification During Authenticated Session

```
┌─────────────────────────────────────────────────────────────┐
│ User is logged in and needs to verify 2FA for sensitive    │
│ action (e.g., changing security settings)                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Show backup code input form                        │
│ - Label: "Enter Backup Code"                               │
│ - Placeholder: "XXXX-XXXX-XXXX-XXXX"                      │
│ - Help text: "Enter one of your recovery codes"           │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│ Step 2: User enters code and submits                       │
│ POST /api/auth/2fa/verify-backup                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
                    ┌─────┴─────┐
                    │  Success? │
                    └─────┬─────┘
                          │
        ┌─────────────────┼─────────────────┐
        │ YES                                │ NO
        v                                    v
┌─────────────────────┐         ┌─────────────────────┐
│ Show success toast  │         │ Show error message  │
│ "Code verified!"    │         │ Based on error code │
└─────────────────────┘         └─────────────────────┘
        │                                    │
        v                                    v
┌─────────────────────┐         ┌─────────────────────┐
│ Show warning banner │         │ Allow retry         │
│ if codes < 3        │         │ Show remaining      │
│ "X codes remaining" │         │ attempts            │
└─────────────────────┘         └─────────────────────┘
        │
        v
┌─────────────────────┐
│ Proceed with        │
│ sensitive action    │
└─────────────────────┘
```

### Flow 2: Multi-Step Login with Backup Code

```
┌─────────────────────────────────────────────────────────────┐
│ User completed Step 1 (email + password)                    │
│ Received: { requiresTwoFactor: true, temporaryToken: "..." }│
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│ Step 2A: Show TOTP verification screen                      │
│ - Primary: 6-digit code input                               │
│ - Secondary: "Use backup code instead" link                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          v (user clicks "Use backup code")
┌─────────────────────────────────────────────────────────────┐
│ Step 2B: Show backup code verification screen               │
│ - Input field for backup code                               │
│ - Checkbox: "Trust this device for 30 days"                │
│ - Help: "Enter one of your recovery codes"                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Submit backup code                                  │
│ POST /api/auth/login/2fa/backup-code                        │
│ Body: { temporaryToken, code, trustDevice }                │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
                    ┌─────┴─────┐
                    │  Success? │
                    └─────┬─────┘
                          │
        ┌─────────────────┼─────────────────┐
        │ YES                                │ NO
        v                                    v
┌─────────────────────┐         ┌─────────────────────────────┐
│ Login successful!   │         │ Check error code            │
│ User object received│         │                             │
└─────────────────────┘         └─────────────────────────────┘
        │                                    │
        v                                    v
┌─────────────────────┐         ┌─────────────────────────────┐
│ Store session       │         │ TEMP_TOKEN_EXPIRED?         │
│ Redirect to         │         │ → Restart login (Step 1)    │
│ dashboard           │         │                             │
└─────────────────────┘         │ BACKUP_CODE_INVALID?        │
        │                       │ → Allow retry (max 5)       │
        v                       │                             │
┌─────────────────────┐         │ NO_BACKUP_CODES_REMAINING?  │
│ Show warning if     │         │ → Show regenerate prompt    │
│ codes < 3           │         └─────────────────────────────┘
│ "X codes remaining" │
└─────────────────────┘
```

---

## Security Considerations

### 1. Code Storage Security

> ⚠️ **Important:** Backup codes are **never** stored in plaintext

- Codes are hashed using **bcrypt** before storage
- Frontend never has access to the hash
- Even admins cannot view backup codes after generation
- Users must save codes securely when first generated

### 2. Replay Attack Prevention

```typescript
// Backend logic (for reference)
// Race condition protection using updateMany with WHERE clause
await prisma.twoFactorBackupCode.updateMany({
  where: {
    id: matchedCodeId,
    used: false, // Only update if still unused
  },
  data: {
    used: true,
    usedAt: new Date(),
  },
});

// If updateResult.count === 0, the code was already used
```

**Frontend Implication:** Don't retry on `BACKUP_CODE_ALREADY_USED` error

### 3. Timing Attack Mitigation

- Backend uses constant-time comparison for code verification
- All failed attempts take similar time to process
- Frontend should **not** implement client-side code validation
- Always send to backend for verification

### 4. Rate Limiting Strategy

**Why it matters:**
- Prevents brute-force attacks on backup codes
- 8-character code = ~2.8 trillion combinations (base36)
- With 5 attempts per 15 min = max ~480 attempts/day
- Makes brute-force attacks infeasible

**Frontend implementation:**
```typescript
// Show progressive delay after each failed attempt
const delays = [0, 2000, 5000, 10000, 20000]; // milliseconds
const attemptCount = getFailedAttempts();
const delay = delays[Math.min(attemptCount, delays.length - 1)];

if (delay > 0) {
  showCountdown(delay);
  await sleep(delay);
}
```

### 5. Audit Logging

**Every verification attempt is logged with:**
- User ID and email
- IP address
- User agent (browser/device)
- Success/failure status
- Remaining codes count (on success)
- Failure reason (on failure)

**Frontend consideration:** Don't expose internal audit details to users

---

## Email Notifications

### Low Backup Codes Alert

**Trigger:** Automatically sent when remaining codes < 3 and user verifies a code

**Email Template:** `low-backup-codes-alert`

**Content Includes:**
- User's name
- Number of remaining codes
- Link to regenerate codes: `{FRONTEND_URL}/dashboard/security/2fa`
- Security best practices reminder

**Rate Limiting:** Once per 24 hours per user

**Frontend Action:**
```typescript
// After successful verification, check if user needs to see warning
if (response.data.warning) {
  // Backend includes warning when codes are low
  showWarningBanner({
    message: 'Running low on backup codes',
    action: 'Generate new codes',
    link: '/dashboard/security/2fa',
  });
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Integration

- [ ] **Create API client functions**
  ```typescript
  // lib/api/auth.ts
  export async function verifyBackupCode(code: string): Promise<VerifyBackupCodeResponse>
  export async function verifyBackupCodeLogin(data: VerifyBackupCodeLoginRequest): Promise<VerifyBackupCodeLoginResponse>
  ```

- [ ] **Implement form validation**
  - [ ] Use Zod schema for validation
  - [ ] Strip whitespace and convert to uppercase
  - [ ] Show inline validation errors
  - [ ] Disable submit button during validation

- [ ] **Create backup code input component**
  - [ ] Text input with proper formatting
  - [ ] Auto-format with hyphens (optional UX enhancement)
  - [ ] Clear button to reset input
  - [ ] Loading state during submission

### Phase 2: Error Handling

- [ ] **Implement comprehensive error handling**
  - [ ] Map error codes to user-friendly messages
  - [ ] Handle validation errors separately
  - [ ] Show appropriate actions per error type
  - [ ] Log errors for debugging (without sensitive data)

- [ ] **Handle rate limiting**
  - [ ] Check rate limit headers
  - [ ] Show countdown timer when limited
  - [ ] Disable form during rate limit period
  - [ ] Clear rate limit state on successful verification

- [ ] **Implement retry logic**
  - [ ] Track failed attempts locally
  - [ ] Show remaining attempts (max 5)
  - [ ] Progressive delay between retries
  - [ ] Clear attempts counter on success

### Phase 3: User Experience

- [ ] **Low codes warning system**
  - [ ] Show banner when codes < 3
  - [ ] Persistent banner across app
  - [ ] Link to regenerate codes page
  - [ ] Dismissible (but reappears on next session)

- [ ] **Multi-step login integration**
  - [ ] "Use backup code" toggle on TOTP screen
  - [ ] Smooth transition between TOTP and backup code
  - [ ] Persist temporary token across views
  - [ ] Handle token expiration gracefully

- [ ] **Trust device functionality**
  - [ ] Checkbox to trust device (unchecked by default)
  - [ ] Tooltip explaining 30-day trust period
  - [ ] Show trusted devices list in settings
  - [ ] Allow device revocation

### Phase 4: Security & Polish

- [ ] **Security best practices**
  - [ ] Never log or display backup codes
  - [ ] Clear input field after failed attempts
  - [ ] Use HTTPS for all API calls (enforced by backend)
  - [ ] Implement CSRF protection (handled by NextAuth)

- [ ] **Accessibility**
  - [ ] Proper ARIA labels for input
  - [ ] Screen reader announcements for errors
  - [ ] Keyboard navigation support
  - [ ] Focus management after submission

- [ ] **Analytics & monitoring**
  - [ ] Track verification attempts (success/failure)
  - [ ] Monitor rate limit hits
  - [ ] Track time-to-verify metric
  - [ ] Alert on unusual patterns

### Phase 5: Testing

- [ ] **Unit tests**
  - [ ] Test form validation logic
  - [ ] Test error handler functions
  - [ ] Test rate limit calculator
  - [ ] Test code formatting transforms

- [ ] **Integration tests**
  - [ ] Test successful verification flow
  - [ ] Test error scenarios
  - [ ] Test rate limiting behavior
  - [ ] Test multi-step login flow

- [ ] **E2E tests**
  - [ ] Complete login flow with backup code
  - [ ] Backup code verification in settings
  - [ ] Low codes warning display
  - [ ] Trust device functionality

---

## Testing Scenarios

### Test Case 1: Successful Backup Code Verification

```typescript
// Setup
const user = createTestUser({ twoFactorEnabled: true });
const backupCode = 'ABCD-EFGH-IJKL-MNOP';

// Action
const response = await verifyBackupCode(backupCode);

// Expected
expect(response.success).toBe(true);
expect(response.data.verified).toBe(true);
expect(response.data.warning).toContain('used and cannot be used again');
```

### Test Case 2: Invalid Backup Code

```typescript
// Setup
const user = createTestUser({ twoFactorEnabled: true });
const invalidCode = 'WRONG-CODE-HERE';

// Action
const response = await verifyBackupCode(invalidCode);

// Expected
expect(response.success).toBe(false);
expect(response.error.code).toBe('BACKUP_CODE_INVALID');
expect(response.error.statusCode).toBe(401);
```

### Test Case 3: Reusing a Backup Code

```typescript
// Setup
const user = createTestUser({ twoFactorEnabled: true });
const backupCode = 'ABCD-EFGH-IJKL-MNOP';

// Action 1: Use code successfully
await verifyBackupCode(backupCode);

// Action 2: Try to reuse the same code
const response = await verifyBackupCode(backupCode);

// Expected
expect(response.success).toBe(false);
expect(response.error.code).toBe('BACKUP_CODE_ALREADY_USED');
expect(response.error.statusCode).toBe(400);
```

### Test Case 4: No Backup Codes Remaining

```typescript
// Setup
const user = createTestUser({
  twoFactorEnabled: true,
  backupCodes: [], // All used
});

// Action
const response = await verifyBackupCode('ANY-CODE-HERE');

// Expected
expect(response.success).toBe(false);
expect(response.error.code).toBe('NO_BACKUP_CODES_REMAINING');
expect(response.error.message).toContain('contact support');
```

### Test Case 5: Multi-Step Login with Backup Code

```typescript
// Setup: Complete Step 1 (email + password)
const step1Response = await login({
  email: 'user@example.com',
  password: 'password123',
});
const { temporaryToken } = step1Response.data;

// Action: Complete Step 2 with backup code
const step2Response = await verifyBackupCodeLogin({
  temporaryToken,
  code: 'ABCD-EFGH-IJKL-MNOP',
  trustDevice: true,
});

// Expected
expect(step2Response.success).toBe(true);
expect(step2Response.data.user).toBeDefined();
expect(step2Response.data.trustedDeviceToken).toBeDefined();
```

### Test Case 6: Expired Temporary Token

```typescript
// Setup: Get temporary token from Step 1
const { temporaryToken } = await login({ email, password });

// Action: Wait 6 minutes (token expires after 5 min)
await sleep(6 * 60 * 1000);

// Try to verify backup code
const response = await verifyBackupCodeLogin({
  temporaryToken,
  code: 'ABCD-EFGH-IJKL-MNOP',
});

// Expected
expect(response.success).toBe(false);
expect(response.error.code).toBe('TEMP_TOKEN_EXPIRED');
```

### Test Case 7: Rate Limiting

```typescript
// Setup
const user = createTestUser({ twoFactorEnabled: true });

// Action: Make 5 failed verification attempts
for (let i = 0; i < 5; i++) {
  await verifyBackupCode('INVALID-CODE');
}

// Action: 6th attempt
const response = await verifyBackupCode('ANOTHER-INVALID');

// Expected
expect(response.success).toBe(false);
expect(response.error.code).toBe('RATE_LIMITED');
expect(response.error.statusCode).toBe(429);

// Check headers
const remaining = response.headers.get('X-RateLimit-Remaining');
expect(remaining).toBe('0');
```

### Test Case 8: Code Format Transformation

```typescript
// Test various input formats
const validFormats = [
  'abcd-efgh-ijkl-mnop',  // lowercase with hyphens
  'ABCD-EFGH-IJKL-MNOP',  // uppercase with hyphens
  'abcdefghijklmnop',     // lowercase no hyphens
  'ABCDEFGHIJKLMNOP',     // uppercase no hyphens
  'ABCD EFGH IJKL MNOP',  // spaces instead of hyphens
  ' ABCD-EFGH-IJKL-MNOP ', // with leading/trailing spaces
];

// All should transform to: 'ABCDEFGHIJKLMNOP'
for (const format of validFormats) {
  const result = verifyBackupCodeSchema.parse({ code: format });
  expect(result.code).toBe('ABCDEFGHIJKLMNOP');
}
```

---

## Example: React Component Implementation

```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { verifyBackupCodeSchema, type VerifyBackupCodeInput } from '@/lib/validators/auth';
import { verifyBackupCode } from '@/lib/api/auth';
import { handleBackupCodeError } from '@/lib/errors/auth-errors';

export function BackupCodeVerificationForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingCodes, setRemainingCodes] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<VerifyBackupCodeInput>({
    resolver: zodResolver(verifyBackupCodeSchema),
  });

  const onSubmit = async (data: VerifyBackupCodeInput) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyBackupCode(data.code);

      if (response.success) {
        // Success! Show warning if included
        if (response.data.warning) {
          // User has < 3 codes remaining
          setRemainingCodes(extractRemainingCodes(response.data.warning));
        }

        // Proceed with sensitive action
        onSuccess();
      }
    } catch (err: any) {
      const { userMessage, action } = handleBackupCodeError(err);
      setError(userMessage);

      if (action === 'redirect') {
        // Redirect to login or 2FA setup
        router.push('/login');
      } else if (action === 'regenerate') {
        // Show regenerate codes modal
        openRegenerateModal();
      } else {
        // Allow retry
        reset();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          Backup Code
        </label>
        <input
          id="code"
          type="text"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="mt-1 block w-full rounded-md border p-2"
          {...register('code')}
          disabled={isLoading}
          aria-invalid={errors.code ? 'true' : 'false'}
          aria-describedby={errors.code ? 'code-error' : undefined}
        />
        {errors.code && (
          <p id="code-error" className="mt-1 text-sm text-red-600" role="alert">
            {errors.code.message}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {remainingCodes !== null && remainingCodes < 3 && (
        <div className="rounded-md bg-yellow-50 p-4" role="alert">
          <p className="text-sm text-yellow-800">
            ⚠️ You have {remainingCodes} backup code(s) remaining.{' '}
            <a href="/dashboard/security/2fa" className="underline">
              Generate new codes
            </a>
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Verifying...' : 'Verify Backup Code'}
      </button>

      <p className="text-sm text-gray-600">
        Each backup code can only be used once. Lost your codes?{' '}
        <a href="/support" className="text-blue-600 hover:underline">
          Contact support
        </a>
      </p>
    </form>
  );
}
```

---

## Additional Resources

### Related Documentation
- [Authenticator 2FA REST API Implementation](./AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md)
- [2FA Challenge Endpoints Implementation](./2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md)
- [Backup Code Alert Implementation](./BACKUP_CODE_ALERT_IMPLEMENTATION.md)
- [Admin 2FA Management](./ADMIN_2FA_MANAGEMENT_IMPLEMENTATION.md)

### Backend Code References
- Route Handler: `/src/app/api/auth/2fa/verify-backup/route.ts`
- Service Method: `/src/lib/services/auth.service.ts` → `verifyBackupCodeForLogin()`
- Validators: `/src/lib/validators/auth.validators.ts` → `verifyBackupCodeSchema`
- Error Definitions: `/src/lib/errors/auth.errors.ts`
- Database Model: `/prisma/schema.prisma` → `TwoFactorBackupCode`

### Support Contacts
- **Backend Team:** Backend developers at yg-backend repo
- **Security Questions:** Refer to security audit logs
- **Production Issues:** Check monitoring dashboard for rate limit metrics

---

**Document Version:** 1.0  
**Last Reviewed:** October 19, 2025  
**Next Review:** When backup code regeneration endpoints are added
