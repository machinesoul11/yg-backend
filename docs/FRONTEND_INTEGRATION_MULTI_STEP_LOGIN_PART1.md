# 🔐 Frontend Integration Guide: Multi-Step Login with 2FA (Part 1)

**Classification:** ⚡ HYBRID - Core authentication used by both public website and admin backend

**Last Updated:** October 19, 2025  
**Backend Version:** 2.0  
**Frontend Target:** yesgoddess-web (Next.js 15 + App Router)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication Flow](#authentication-flow)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request & Response Schemas](#request--response-schemas)

---

## Overview

### What This Module Does

The Multi-Step Login system provides secure authentication with optional two-factor authentication (2FA). When 2FA is enabled for a user, the login process becomes a two-step flow:

1. **Step 1:** Username/password validation → Returns temporary token if 2FA is enabled
2. **Step 2:** 2FA verification (TOTP or SMS) → Completes authentication and establishes session

### Key Features

- ✅ Multi-step authentication with 5-minute temporary tokens
- ✅ Support for TOTP (authenticator apps) and SMS 2FA methods
- ✅ Backup codes as fallback authentication method
- ✅ "Trust this device" functionality (30-day exemption from 2FA)
- ✅ Progressive delay and CAPTCHA for security
- ✅ Account lockout after multiple failed attempts
- ✅ Rate limiting per IP and per user

### Prerequisites

Before implementing this module, ensure:
- User authentication state management is set up (React Context, Zustand, or similar)
- HTTP client is configured with error handling (axios, fetch wrapper, or React Query)
- You have access to the backend API at `ops.yesgoddess.agency` or your staging environment
- CAPTCHA library is integrated (e.g., Google reCAPTCHA v3 or Cloudflare Turnstile)

---

## Authentication Flow

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOGIN FLOW                               │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ User enters  │
│ credentials  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ POST /api/auth/login                 │
│ { email, password, rememberMe,       │
│   captchaToken?, deviceFingerprint?} │
└──────┬───────────────────────────────┘
       │
       ├─────────► No 2FA Enabled
       │           └─► Returns: { success: true, data: { user } }
       │           └─► Create session, redirect to dashboard
       │
       └─────────► 2FA Enabled
                   └─► Returns: {
                         success: true,
                         requiresTwoFactor: true,
                         data: {
                           temporaryToken: "...",
                           challengeType: "TOTP" | "SMS",
                           expiresAt: "2025-10-19T12:35:00Z"
                         }
                       }
                   └─► Show 2FA verification screen
                   
┌──────────────────────────────────────┐
│      2FA VERIFICATION STEP           │
└──────────────────────────────────────┘

User has temporary token (valid 5 minutes)

┌──────────────┐
│ User enters  │
│ 6-digit code │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ POST /api/auth/2fa/verify-totp       │
│ { challengeToken, code }             │
│ (OR verify-sms endpoint)             │
└──────┬───────────────────────────────┘
       │
       ├─────────► Success
       │           └─► Session established
       │           └─► Optionally create trusted device
       │           └─► Redirect to dashboard
       │
       └─────────► Failure
                   └─► Show error with attempts remaining
                   └─► If locked: show lockout message

┌──────────────────────────────────────┐
│    ALTERNATIVE: BACKUP CODE          │
└──────────────────────────────────────┘

If user can't access authenticator:

┌──────────────┐
│ Click "Use   │
│ backup code" │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ POST /api/auth/2fa/verify-backup     │
│ { challengeToken, code }             │
└──────┬───────────────────────────────┘
       │
       └─────────► Success with warning
                   └─► "This code has been used"
                   └─► Show remaining codes count
```

### State Machine

```typescript
// Login UI State Machine
type LoginState = 
  | { step: 'credentials'; loading: boolean; error?: string }
  | { step: 'captcha-required'; email: string; password: string }
  | { step: '2fa-challenge'; 
      temporaryToken: string; 
      challengeType: 'TOTP' | 'SMS'; 
      expiresAt: Date;
      attemptsRemaining?: number;
    }
  | { step: 'backup-code'; 
      temporaryToken: string;
      attemptsRemaining?: number;
    }
  | { step: 'account-locked'; lockedUntil?: Date }
  | { step: 'success'; user: User };
```

---

## API Endpoints Reference

### Base URL
```
Production: https://ops.yesgoddess.agency
Staging: https://staging-ops.yesgoddess.agency
Local: http://localhost:3000
```

### Endpoints Overview

| Endpoint | Method | Auth | Purpose | Classification |
|----------|--------|------|---------|----------------|
| `/api/auth/login` | POST | ❌ None | Step 1: Validate credentials | 🌐 SHARED |
| `/api/auth/2fa/verify-totp` | POST | ⚠️ Temp Token | Step 2: Verify TOTP code | 🌐 SHARED |
| `/api/auth/2fa/verify-backup` | POST | ⚠️ Temp Token | Step 2: Verify backup code | 🌐 SHARED |
| `/api/auth/2fa/resend-sms` | POST | ⚠️ Temp Token | Resend SMS code | 🌐 SHARED |

> **⚠️ Temp Token:** Uses temporary authentication token from Step 1 (not a full session token)

---

## TypeScript Type Definitions

### Copy these into your frontend project

```typescript
// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

export enum TwoFactorMethod {
  SMS = 'SMS',
  AUTHENTICATOR = 'AUTHENTICATOR',
}

export enum ChallengeType {
  TOTP = 'TOTP',
  SMS = 'SMS',
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
  // Additional fields returned after full authentication
  avatar?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
}

// ============================================================================
// LOGIN REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Step 1: Initial login request
 */
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  captchaToken?: string;
  deviceFingerprint?: string;
  trustedDeviceToken?: string; // If user has trusted device
}

/**
 * Step 1: Success response (no 2FA)
 */
export interface LoginSuccessResponse {
  success: true;
  data: {
    user: User;
  };
}

/**
 * Step 1: Success response (2FA required)
 */
export interface Login2FARequiredResponse {
  success: true;
  requiresTwoFactor: true;
  data: {
    temporaryToken: string;      // Use this for Step 2
    challengeType: ChallengeType; // 'TOTP' or 'SMS'
    expiresAt: string;            // ISO 8601 timestamp
  };
}

/**
 * Step 1: Combined success response type
 */
export type LoginResponse = LoginSuccessResponse | Login2FARequiredResponse;

/**
 * Error response structure
 */
export interface LoginErrorResponse {
  success: false;
  message: string;
  code?: ErrorCode;
  requiresCaptcha?: boolean;
  errors?: Array<{
    path: string[];
    message: string;
  }>;
}

// ============================================================================
// 2FA VERIFICATION TYPES
// ============================================================================

/**
 * Step 2: TOTP verification request
 */
export interface VerifyTotpRequest {
  challengeToken: string;  // temporaryToken from Step 1
  code: string;            // 6-digit code from authenticator
}

/**
 * Step 2: SMS verification request
 */
export interface VerifySmsRequest {
  challengeToken: string;  // temporaryToken from Step 1
  code: string;            // 6-digit code from SMS
}

/**
 * Step 2: Backup code verification request
 */
export interface VerifyBackupCodeRequest {
  challengeToken: string;  // temporaryToken from Step 1
  code: string;            // 8+ character backup code
}

/**
 * Step 2: Success response
 */
export interface Verify2FASuccessResponse {
  success: true;
  data: {
    message: string;
    // Note: Session cookie is set automatically via Set-Cookie header
    // No need to handle session token manually in the frontend
  };
}

/**
 * Step 2: Error response
 */
export interface Verify2FAErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    attemptsRemaining?: number;
    lockedUntil?: string; // ISO 8601 timestamp
  };
}

// ============================================================================
// RESEND SMS TYPES
// ============================================================================

export interface ResendSmsRequest {
  challengeToken: string;  // temporaryToken from Step 1
}

export interface ResendSmsSuccessResponse {
  success: true;
  remainingAttempts?: number;
}

export interface ResendSmsErrorResponse {
  success: false;
  error: string;
  resetAt?: string; // ISO 8601 timestamp
  remainingAttempts?: number;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export enum ErrorCode {
  // Login errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  CAPTCHA_FAILED = 'CAPTCHA_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // 2FA verification errors
  TEMP_TOKEN_INVALID = 'TEMP_TOKEN_INVALID',
  TEMP_TOKEN_EXPIRED = 'TEMP_TOKEN_EXPIRED',
  TEMP_TOKEN_ALREADY_USED = 'TEMP_TOKEN_ALREADY_USED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  
  // Backup code errors
  BACKUP_CODE_INVALID = 'BACKUP_CODE_INVALID',
  BACKUP_CODE_ALREADY_USED = 'BACKUP_CODE_ALREADY_USED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if login response requires 2FA
 */
export function requires2FA(
  response: LoginResponse
): response is Login2FARequiredResponse {
  return 'requiresTwoFactor' in response && response.requiresTwoFactor === true;
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(
  response: any
): response is LoginErrorResponse | Verify2FAErrorResponse {
  return response.success === false;
}
```

---

## Request & Response Schemas

### 1. POST `/api/auth/login` - Step 1: Validate Credentials

#### Request Headers
```http
Content-Type: application/json
Origin: https://www.yesgoddess.agency
```

#### Request Body
```typescript
{
  email: string;              // Valid email format, lowercase
  password: string;           // Min 1 character
  rememberMe?: boolean;       // Default: false
  captchaToken?: string;      // Required after 3 failed attempts
  deviceFingerprint?: string; // Optional: client-generated device ID
  trustedDeviceToken?: string;// Optional: token from previous "Trust Device"
}
```

#### Request Example
```json
{
  "email": "creator@example.com",
  "password": "MySecurePassword123!",
  "rememberMe": true,
  "captchaToken": "03AGdBq24...",
  "deviceFingerprint": "fp_abc123xyz"
}
```

#### Success Response (No 2FA)
**Status:** `200 OK`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx123abc",
      "email": "creator@example.com",
      "name": "Jane Creator",
      "role": "CREATOR",
      "emailVerified": true
    }
  }
}
```

#### Success Response (2FA Required)
**Status:** `200 OK`
```json
{
  "success": true,
  "requiresTwoFactor": true,
  "data": {
    "temporaryToken": "dGVtcF90b2tlbl9hYmMxMjM...",
    "challengeType": "TOTP",
    "expiresAt": "2025-10-19T12:35:00.000Z"
  }
}
```

#### Error Response Examples

**Invalid Credentials**
**Status:** `401 Unauthorized`
```json
{
  "success": false,
  "message": "Invalid email or password",
  "code": "INVALID_CREDENTIALS"
}
```

**CAPTCHA Required**
**Status:** `429 Too Many Requests`
```json
{
  "success": false,
  "message": "CAPTCHA verification is required after multiple failed login attempts.",
  "code": "CAPTCHA_REQUIRED",
  "requiresCaptcha": true
}
```

**Account Locked**
**Status:** `423 Locked`
```json
{
  "success": false,
  "message": "Account is locked due to too many failed login attempts. Please try again later or reset your password.",
  "code": "ACCOUNT_LOCKED"
}
```

**Rate Limited**
**Status:** `429 Too Many Requests`
```json
{
  "success": false,
  "message": "Too many login attempts. Please try again in 15 minutes."
}
```

**Validation Error**
**Status:** `400 Bad Request`
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "path": ["email"],
      "message": "Invalid email address"
    }
  ]
}
```

---

### 2. POST `/api/auth/2fa/verify-totp` - Step 2: Verify TOTP Code

#### Request Headers
```http
Content-Type: application/json
Origin: https://www.yesgoddess.agency
```

#### Request Body
```typescript
{
  challengeToken: string;  // temporaryToken from login response
  code: string;            // 6-digit TOTP code (digits only)
}
```

#### Request Example
```json
{
  "challengeToken": "dGVtcF90b2tlbl9hYmMxMjM...",
  "code": "123456"
}
```

#### Success Response
**Status:** `200 OK`
```json
{
  "success": true,
  "data": {
    "message": "Two-factor authentication successful"
  }
}
```

> **Important:** After successful verification, the backend sets a session cookie via `Set-Cookie` header. Your HTTP client should be configured to accept and store cookies.

#### Error Response Examples

**Invalid Code**
**Status:** `401 Unauthorized`
```json
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Invalid verification code",
    "attemptsRemaining": 3
  }
}
```

**Expired Token**
**Status:** `410 Gone`
```json
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Challenge has expired. Please try again."
  }
}
```

**Too Many Attempts**
**Status:** `429 Too Many Requests`
```json
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Too many verification attempts. Please try again in 12 minutes.",
    "attemptsRemaining": 0
  }
}
```

**Account Locked**
**Status:** `403 Forbidden`
```json
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Maximum verification attempts exceeded",
    "lockedUntil": "2025-10-19T13:00:00.000Z"
  }
}
```

---

### 3. POST `/api/auth/2fa/verify-backup` - Step 2: Verify Backup Code

> **Note:** This endpoint requires an active user session. It's NOT used during the multi-step login flow directly. The multi-step login flow uses the tRPC endpoint instead (see Part 2 for tRPC integration).

#### Request Headers
```http
Content-Type: application/json
Cookie: session=<session_token>
```

#### Request Body
```typescript
{
  code: string;  // 8-20 character backup code (case-insensitive)
}
```

#### Request Example
```json
{
  "code": "ABCD-1234-EFGH-5678"
}
```

#### Success Response
**Status:** `200 OK`
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

#### Error Responses

**Invalid Code**
**Status:** `401 Unauthorized`
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

**Already Used**
**Status:** `400 Bad Request`
```json
{
  "success": false,
  "error": {
    "code": "BACKUP_CODE_ALREADY_USED",
    "message": "This backup code has already been used",
    "statusCode": 400
  }
}
```

---

### 4. POST `/api/auth/2fa/resend-sms` - Resend SMS Code

> **Note:** This endpoint is part of the 2FA challenge service. Implementation details are in the backend but not exposed as a REST endpoint yet. This is handled internally by the challenge service.

---

## Next Steps

Continue to [Part 2: Business Logic, Validation & Implementation](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART2.md) for:
- Detailed validation rules
- Business logic implementation
- React component examples
- State management patterns
- Error handling strategies

---

## Quick Reference Card

### Login Flow Summary

```typescript
// Step 1: Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password, rememberMe }),
});

if (requires2FA(loginResponse)) {
  // Show 2FA input screen
  // Store temporaryToken, challengeType, expiresAt
} else {
  // Login complete - redirect to dashboard
}

// Step 2: Verify 2FA
const verify2FAResponse = await fetch('/api/auth/2fa/verify-totp', {
  method: 'POST',
  body: JSON.stringify({ 
    challengeToken: temporaryToken, 
    code: userInput 
  }),
});

if (verify2FAResponse.success) {
  // Authentication complete - session established
  // Redirect to dashboard
}
```

### Important Timeouts

| Item | Duration | Action on Expiry |
|------|----------|------------------|
| Temporary Auth Token | 5 minutes | Must restart login from Step 1 |
| 2FA Verification Attempts | 5 attempts | Account temporarily locked |
| Rate Limit Window | 15 minutes | 5 attempts per IP per window |
| Account Lockout | Progressive | Increases with each lockout event |

---

**Document Status:** ✅ Complete - Ready for Frontend Implementation  
**Next Document:** [Part 2: Business Logic & Implementation](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART2.md)
