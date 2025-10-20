# Frontend Integration Guide: Login Security Module

## 🌐 Classification: SHARED
This module is used by both public-facing website and admin backend.

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [CAPTCHA Integration](#captcha-integration)
7. [Device Fingerprinting](#device-fingerprinting)
8. [Real-time Feedback & Progressive Delays](#real-time-feedback--progressive-delays)

---

## Overview

The Login Security Module implements comprehensive protection against brute force attacks and unauthorized access attempts. It provides:

- ✅ **Progressive Delays**: Exponential backoff (1s → 2s → 4s → 8s → 16s)
- ✅ **Account Lockout**: 30-minute lockout after 10 failed attempts
- ✅ **Email Notifications**: Automatic alerts on account lockout and suspicious activity
- ✅ **CAPTCHA Protection**: Required after 3 failed login attempts
- ✅ **Comprehensive Logging**: Every login attempt tracked with IP, location, device
- ✅ **Anomaly Detection**: Detects new locations, devices, and suspicious patterns
- ✅ **Device Fingerprinting**: Tracks known devices for trusted device workflows

**Backend Architecture**: REST API via tRPC, JWT authentication, PostgreSQL database

---

## API Endpoints

### 1. Login (POST)

**Endpoint**: `/api/trpc/auth.login`

**Method**: `POST` (tRPC mutation)

**Authentication**: Public (no token required)

**Request Schema**:

```typescript
{
  email: string;              // Required, valid email format
  password: string;           // Required, min 1 character
  rememberMe?: boolean;       // Optional, default: false
  captchaToken?: string;      // Required after 3 failed attempts
  deviceFingerprint?: string; // Optional, used for anomaly detection
}
```

**Response (Success - No 2FA)**:

```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: "ADMIN" | "CREATOR" | "BRAND" | "VIEWER";
      emailVerified: boolean;
      avatar: string | null;
    };
  };
}
```

**Response (Success - 2FA Required)**:

```typescript
{
  success: true;
  requiresTwoFactor: true;
  data: {
    temporaryToken: string;  // Use for 2FA verification
    challengeType: "TOTP" | "SMS" | "EMAIL";
    expiresAt: string;       // ISO 8601 datetime
  };
}
```

**Response (CAPTCHA Required - 429)**:

```typescript
{
  success: false;
  message: "CAPTCHA verification is required after multiple failed login attempts.";
  code: "CAPTCHA_REQUIRED";
  requiresCaptcha: true;
}
```

**Response (Account Locked - 423)**:

```typescript
{
  success: false;
  message: "Account is locked due to too many failed login attempts. Please try again later or reset your password.";
  code: "ACCOUNT_LOCKED";
}
```

**Response (Invalid Credentials - 401)**:

```typescript
{
  success: false;
  message: "Invalid email or password";
  code: "INVALID_CREDENTIALS";
}
```

**Response (CAPTCHA Failed - 400)**:

```typescript
{
  success: false;
  message: "CAPTCHA verification failed. Please try again.";
  code: "CAPTCHA_FAILED";
}
```

---

### 2. Get Login Attempt History (Protected)

**Endpoint**: `/api/trpc/auth.getLoginHistory`

**Method**: `GET` (tRPC query)

**Authentication**: Required (JWT Bearer token)

**Request Parameters**:

```typescript
{
  limit?: number;              // Optional, default: 50, max: 100
  includeSuccessful?: boolean; // Optional, default: true
  includeAnomalous?: boolean;  // Optional, default: false
}
```

**Response**:

```typescript
{
  success: true;
  data: {
    attempts: Array<{
      id: string;
      timestamp: string;          // ISO 8601 datetime
      success: boolean;
      ipAddress: string | null;
      userAgent: string | null;
      deviceFingerprint: string | null;
      locationCountry: string | null;
      locationRegion: string | null;
      locationCity: string | null;
      isAnomalous: boolean;
      anomalyReasons: string[];   // e.g., ["NEW_COUNTRY", "NEW_DEVICE"]
      failureReason: string | null; // e.g., "INVALID_PASSWORD", "CAPTCHA_REQUIRED"
    }>;
  };
}
```

---

### 3. Get User Devices (Protected)

**Endpoint**: `/api/trpc/auth.getUserDevices`

**Method**: `GET` (tRPC query)

**Authentication**: Required (JWT Bearer token)

**Response**:

```typescript
{
  success: true;
  data: {
    devices: Array<{
      fingerprint: string;
      lastUsed: string;        // ISO 8601 datetime
      userAgent: string | null;
      location: string;        // e.g., "United States, California, San Francisco"
    }>;
  };
}
```

---

### 4. Admin: Unlock Account (Admin Only)

**Endpoint**: `/api/trpc/admin.unlockAccount`

**Method**: `POST` (tRPC mutation)

**Authentication**: Required (Admin role)

**Request Schema**:

```typescript
{
  userId: string; // Required, CUID of user to unlock
}
```

**Response**:

```typescript
{
  success: true;
  data: {
    message: "Account unlocked successfully";
  };
}
```

---

### 5. Admin: Get Security Stats (Admin Only)

**Endpoint**: `/api/trpc/security.getSecurityStats`

**Method**: `GET` (tRPC query)

**Authentication**: Required (Admin role)

**Response**:

```typescript
{
  success: true;
  data: {
    overview: {
      totalUsers: number;
      usersWith2FA: number;
      adoptionRate: string;     // e.g., "45.67%"
    };
    methodBreakdown: {
      totp: number;
      sms: number;
      email: number;
    };
    recentActivity: {
      verifications24h: number;
      successRate24h: string;   // e.g., "98.50%"
      backupCodesUsed24h: number;
      securityAlerts24h: number;
    };
    trends: {
      verifications7d: number;
      verifications30d: number;
      successRate7d: string;
      successRate30d: string;
    };
  };
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Login input schema
 */
export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  captchaToken?: string;
  deviceFingerprint?: string;
}

/**
 * Login output (no 2FA)
 */
export interface LoginOutput {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    emailVerified: boolean;
    avatar: string | null;
  };
}

/**
 * Multi-step login output (2FA required)
 */
export interface MultiStepLoginOutput {
  requiresTwoFactor: true;
  temporaryToken: string;
  challengeType: "TOTP" | "SMS" | "EMAIL";
  expiresAt: string;
}

/**
 * User role enum
 */
export type UserRole = "ADMIN" | "CREATOR" | "BRAND" | "VIEWER";

/**
 * Login attempt record
 */
export interface LoginAttempt {
  id: string;
  userId: string | null;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  success: boolean;
  failureReason: string | null;
  requiresCaptcha: boolean;
  captchaVerified: boolean | null;
  locationCountry: string | null;
  locationRegion: string | null;
  locationCity: string | null;
  isAnomalous: boolean;
  anomalyReasons: string[];
  timestamp: Date;
  createdAt: Date;
}

/**
 * Device information
 */
export interface UserDevice {
  fingerprint: string;
  lastUsed: Date;
  userAgent: string | null;
  location: string;
}

/**
 * Login security check result (internal)
 */
export interface LoginSecurityCheck {
  isAllowed: boolean;
  requiresCaptcha: boolean;
  requiredDelay: number;      // milliseconds
  isLocked: boolean;
  lockedUntil?: Date;
  failedAttempts: number;
  reason?: string;
}

/**
 * Anomaly detection reasons
 */
export type AnomalyReason = 
  | "NEW_COUNTRY"           // Login from never-seen country
  | "NEW_LOCATION"          // Login from new city/region
  | "NEW_DEVICE"            // Login from unknown device
  | "IMPOSSIBLE_TRAVEL"     // Geographic impossibility (e.g., US to China in 1 hour)
  | "SUSPICIOUS_USER_AGENT" // Bot-like pattern detected
  ;

/**
 * Failure reasons
 */
export type FailureReason =
  | "USER_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DELETED"
  | "ACCOUNT_INACTIVE"
  | "OAUTH_ONLY_ACCOUNT"
  | "CAPTCHA_REQUIRED"
  | "CAPTCHA_FAILED"
  ;
```

### Zod Schemas (for validation)

```typescript
import { z } from 'zod';

/**
 * Email schema with normalization
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

/**
 * Login schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
  captchaToken: z.string().optional(),
  deviceFingerprint: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Login history query schema
 */
export const loginHistorySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  includeSuccessful: z.boolean().optional().default(true),
  includeAnomalous: z.boolean().optional().default(false),
});
```

---

## Business Logic & Validation Rules

### Progressive Delay Algorithm

**Formula**: `delay = min(1000ms * 2^(attempts - 1), 16000ms)`

**Delay Progression**:
- 1st failed attempt: 1 second
- 2nd failed attempt: 2 seconds
- 3rd failed attempt: 4 seconds
- 4th failed attempt: 8 seconds
- 5th+ failed attempt: 16 seconds (capped)

**Reset Window**: 15 minutes of inactivity

**Frontend Implementation**:
```typescript
// Backend applies delay before responding
// Frontend should show loading spinner during this time
// DO NOT implement client-side delays - this is server-side only
```

### CAPTCHA Requirement

**Trigger**: After **3 failed login attempts** within the 15-minute window

**Reset**: When user successfully logs in or after 15 minutes of inactivity

**Providers Supported**:
- Google reCAPTCHA v2
- Google reCAPTCHA v3
- hCaptcha
- Cloudflare Turnstile

**Frontend Behavior**:
1. On first 3 login attempts: No CAPTCHA needed
2. After 3rd failure: Server returns `CAPTCHA_REQUIRED` (429)
3. Frontend displays CAPTCHA widget
4. User completes CAPTCHA
5. Frontend includes `captchaToken` in next login request

### Account Lockout

**Trigger**: After **10 failed login attempts** within 15-minute window

**Duration**: **30 minutes** from the lockout time

**Automatic Unlock**: Yes (after 30 minutes)

**Manual Unlock**: Admins can unlock via `/api/trpc/admin.unlockAccount`

**Email Notification**: Sent automatically to user's email address

**Frontend Behavior**:
- Display user-friendly message: "Your account has been locked for 30 minutes due to multiple failed login attempts. Please try again later or reset your password."
- Show countdown timer if you have the `lockedUntil` timestamp (not returned to prevent timing attacks)
- Provide "Forgot Password" link prominently

### Anomaly Detection

**Triggers** (with confidence scores):
- **NEW_COUNTRY**: Login from never-seen country (+0.4 confidence)
- **NEW_LOCATION**: Login from new city/region (+0.2 confidence)
- **NEW_DEVICE**: Login from unknown device fingerprint (+0.3 confidence)
- **IMPOSSIBLE_TRAVEL**: Different countries within 2 hours (+0.5 confidence)
- **SUSPICIOUS_USER_AGENT**: Bot patterns detected (+0.3 confidence)

**Threshold**: Confidence ≥ 0.3 flags as anomalous

**Action**: Login succeeds, but:
- Anomaly is logged in database
- Email alert sent to user
- Location/device added to known list
- User sees security notification on next login

**Frontend Behavior**:
- Anomaly detection is transparent to the user during login
- After successful login, check for security alerts endpoint (if implemented)
- Display notification: "We detected a login from a new location/device. Was this you?"

### Failed Attempt Window

**Duration**: **15 minutes**

**Behavior**: 
- Failed attempts outside this window don't count toward lockout
- Counter resets after 15 minutes of inactivity
- Successful login resets counter immediately

---

## Error Handling

### Error Codes Reference

| HTTP Status | Error Code | Message | User Action |
|------------|------------|---------|-------------|
| **401** | `INVALID_CREDENTIALS` | "Invalid email or password" | Generic error - don't reveal if email exists |
| **423** | `ACCOUNT_LOCKED` | "Account is locked due to too many failed login attempts. Please try again later or reset your password." | Show lockout message with password reset link |
| **429** | `CAPTCHA_REQUIRED` | "CAPTCHA verification is required after multiple failed login attempts." | Display CAPTCHA widget |
| **400** | `CAPTCHA_FAILED` | "CAPTCHA verification failed. Please try again." | Reset CAPTCHA widget, allow retry |
| **410** | `ACCOUNT_DELETED` | "This account has been deleted" | Offer account recovery contact |
| **403** | `EMAIL_NOT_VERIFIED` | "Email verification required" | Resend verification email button |

### Error Response Structure

All errors follow this structure:

```typescript
{
  success: false;
  message: string;           // User-friendly message
  code: string;              // Machine-readable error code
  requiresCaptcha?: boolean; // If true, show CAPTCHA
}
```

### Frontend Error Handling Pattern

```typescript
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '@/server/api/root';

async function handleLogin(data: LoginInput) {
  try {
    const result = await trpc.auth.login.mutate(data);
    
    if ('requiresTwoFactor' in result.data) {
      // Multi-step login - redirect to 2FA page
      router.push('/auth/verify-2fa', {
        temporaryToken: result.data.temporaryToken,
        challengeType: result.data.challengeType,
      });
    } else {
      // Success - redirect to dashboard
      router.push('/dashboard');
    }
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const errorCode = error.data?.code;
      const statusCode = error.data?.statusCode;
      
      switch (errorCode) {
        case 'CAPTCHA_REQUIRED':
          // Show CAPTCHA widget
          setShowCaptcha(true);
          setErrorMessage('Please complete the CAPTCHA verification');
          break;
          
        case 'ACCOUNT_LOCKED':
          // Show lockout message with password reset
          setErrorMessage(error.message);
          setShowPasswordResetLink(true);
          break;
          
        case 'INVALID_CREDENTIALS':
          // Generic error - don't reveal details
          setErrorMessage('Invalid email or password');
          setAttemptCount(prev => prev + 1);
          break;
          
        case 'CAPTCHA_FAILED':
          // Reset CAPTCHA and allow retry
          resetCaptcha();
          setErrorMessage('CAPTCHA verification failed. Please try again.');
          break;
          
        default:
          // Generic error
          setErrorMessage('Login failed. Please try again.');
      }
    } else {
      // Network or unknown error
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  }
}
```

### User-Friendly Error Messages

**DO**:
- ✅ Use generic messages for authentication failures ("Invalid email or password")
- ✅ Be specific for actionable errors (CAPTCHA, lockout)
- ✅ Provide recovery options (password reset, contact support)
- ✅ Show progressive hints (e.g., after 2 failures: "Remember, passwords are case-sensitive")

**DON'T**:
- ❌ Reveal if email exists in system ("Email not found" vs "Invalid email or password")
- ❌ Show exact number of remaining attempts
- ❌ Display technical error details to users
- ❌ Show different delays for different error types (timing attack vector)

---

## CAPTCHA Integration

### Environment Configuration

**Backend** (already configured):
```bash
CAPTCHA_PROVIDER=recaptcha  # or hcaptcha, turnstile, none
CAPTCHA_SECRET_KEY=your_backend_secret_key
```

**Frontend** (you need to configure):
```bash
NEXT_PUBLIC_CAPTCHA_PROVIDER=recaptcha
NEXT_PUBLIC_CAPTCHA_SITE_KEY=your_frontend_site_key
```

### CAPTCHA Provider URLs

| Provider | Frontend Library | Backend Verification URL |
|----------|------------------|--------------------------|
| reCAPTCHA v2 | `https://www.google.com/recaptcha/api.js` | `https://www.google.com/recaptcha/api/siteverify` |
| reCAPTCHA v3 | `https://www.google.com/recaptcha/api.js?render=SITE_KEY` | `https://www.google.com/recaptcha/api/siteverify` |
| hCaptcha | `https://js.hcaptcha.com/1/api.js` | `https://hcaptcha.com/siteverify` |
| Cloudflare Turnstile | `https://challenges.cloudflare.com/turnstile/v0/api.js` | `https://challenges.cloudflare.com/turnstile/v0/siteverify` |

### Frontend Implementation Example (React + reCAPTCHA v2)

```tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import Script from 'next/script';
import { trpc } from '@/lib/trpc';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<any>(null);
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if ('requiresTwoFactor' in data.data) {
        // Redirect to 2FA page
        router.push('/auth/verify-2fa');
      } else {
        // Redirect to dashboard
        router.push('/dashboard');
      }
    },
    onError: (error) => {
      if (error.data?.code === 'CAPTCHA_REQUIRED') {
        setShowCaptcha(true);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await loginMutation.mutateAsync({
      email,
      password,
      captchaToken: captchaToken || undefined,
    });
  };

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken(null);
  };

  // Initialize reCAPTCHA widget
  useEffect(() => {
    if (showCaptcha && window.grecaptcha) {
      if (captchaRef.current && !captchaRef.current.hasChildNodes()) {
        window.grecaptcha.render(captchaRef.current, {
          sitekey: process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY!,
          callback: handleCaptchaVerify,
          'expired-callback': handleCaptchaExpire,
        });
      }
    }
  }, [showCaptcha]);

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js"
        strategy="lazyOnload"
      />
      
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        
        {showCaptcha && (
          <div ref={captchaRef} className="g-recaptcha" />
        )}
        
        <button
          type="submit"
          disabled={showCaptcha && !captchaToken}
        >
          {loginMutation.isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </>
  );
}
```

### CAPTCHA Widget Display Rules

**When to Show**:
- After receiving `CAPTCHA_REQUIRED` error (429 status)
- Keep visible for subsequent attempts until successful login
- Hide after successful login or 15 minutes of inactivity

**When to Reset**:
- After each login attempt (successful or failed)
- After CAPTCHA token expires (typically 2 minutes)
- When user navigates away from page

**Accessibility**:
- Include `aria-label` for CAPTCHA widget
- Provide text alternative: "Complete CAPTCHA verification to continue"
- Ensure keyboard navigation works

---

## Device Fingerprinting

### What is Device Fingerprinting?

Device fingerprinting creates a unique identifier for a user's browser/device based on:
- Browser version and plugins
- Screen resolution and color depth
- Timezone and language
- Canvas/WebGL rendering
- Audio context
- Hardware concurrency
- Platform details

### Recommended Library

**FingerprintJS** (Open Source)
- GitHub: https://github.com/fingerprintjs/fingerprintjs
- CDN: https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js
- NPM: `npm install @fingerprintjs/fingerprintjs`

### Frontend Implementation

```typescript
import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Initialize once on app load
let fpPromise: Promise<any> | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  
  const fp = await fpPromise;
  const result = await fp.get();
  
  return result.visitorId; // Unique device fingerprint
}

// Usage in login form
async function handleLogin() {
  const deviceFingerprint = await getDeviceFingerprint();
  
  await trpc.auth.login.mutate({
    email,
    password,
    deviceFingerprint, // Include in request
  });
}
```

### Privacy Considerations

**⚠️ GDPR/CCPA Compliance**:
- Device fingerprinting is considered "personal data" under GDPR
- Include in Privacy Policy: "We collect device fingerprints for security purposes"
- Provide opt-out mechanism (though this weakens security)
- Don't use fingerprints for tracking/advertising (security only)

**Best Practices**:
- Only collect when user attempts to login (not on page load)
- Don't store fingerprints in localStorage (use session storage or memory only)
- Clear fingerprints after logout
- Make it clear fingerprints are for security, not tracking

---

## Real-time Feedback & Progressive Delays

### Progressive Delay Behavior

**Backend Implementation**: Delays are applied server-side before password verification

**Frontend Experience**:
```typescript
// User clicks "Sign In"
setIsLoading(true);

// Request sent to backend
// Backend applies progressive delay (1s, 2s, 4s, 8s, 16s)
// Frontend shows loading spinner during this time

await trpc.auth.login.mutate({ email, password });

// Response received after delay
setIsLoading(false);
```

**UX Considerations**:
- Show spinner/loading indicator during delay
- **DON'T** show "Slow down" or "Waiting X seconds" messages (reveals failure count)
- **DO** keep UI responsive - allow user to cancel/go back
- **DON'T** implement client-side delays (defeats purpose of server-side delays)

### Loading States

```tsx
<button
  type="submit"
  disabled={isLoading}
  aria-busy={isLoading}
>
  {isLoading ? (
    <>
      <Spinner /> Signing in...
    </>
  ) : (
    'Sign In'
  )}
</button>
```

### Failed Attempt Counter (Client-Side)

**Purpose**: Show progressive hints to user without revealing exact count

```typescript
const [attemptCount, setAttemptCount] = useState(0);

// After each failed attempt
setAttemptCount(prev => prev + 1);

// Show hints based on attempt count
{attemptCount >= 2 && (
  <p className="text-sm text-yellow-600">
    💡 Tip: Passwords are case-sensitive
  </p>
)}

{attemptCount >= 4 && (
  <p className="text-sm text-orange-600">
    🔒 Having trouble? Try <Link href="/reset-password">resetting your password</Link>
  </p>
)}
```

**DON'T**:
- ❌ Show exact number of failed attempts
- ❌ Show "X attempts remaining before lockout"
- ❌ Display different UI for different failure reasons

**DO**:
- ✅ Show progressive hints after 2-3 failures
- ✅ Offer password reset after 4+ failures
- ✅ Keep UI consistent regardless of failure reason

---

**Continue to Part 2** for Authorization & Permissions, Rate Limiting, Admin Features, Implementation Checklist, and Testing Guide.
