# Frontend Integration Guide: Twilio SMS 2FA - Part 1
## API Endpoints, Types, and Core Flows

🔒 **Classification: HYBRID** - Used by both public-facing website (user authentication) and admin backend (monitoring/management)

---

## Table of Contents
- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Authentication Requirements](#authentication-requirements)

---

## Overview

The Twilio SMS 2FA module provides secure two-factor authentication via SMS verification codes. Users can enable SMS as their 2FA method, receive 6-digit codes via text message, and verify their identity during login or sensitive operations.

**Key Features:**
- SMS verification code generation and delivery via Twilio
- Rate limiting (max 3 SMS per 15 minutes per user)
- Progressive backoff between resend attempts
- Cost tracking and monitoring
- Delivery status tracking via webhooks
- Support for multiple 2FA methods (SMS, TOTP, or both)

---

## API Endpoints

### 1. Setup SMS 2FA

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/setup-sms
```

Initiates SMS 2FA setup by sending a verification code to the provided phone number.

**Headers:**
```typescript
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  phoneNumber: string; // E.164 format (e.g., "+12345678901")
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    method: "SMS";
    maskedPhoneNumber: string; // e.g., "***8901"
    message: string;
    nextStep: string;
    codeExpiry: string; // "5 minutes"
    maxAttempts: number; // 3
    canResend: boolean; // true
  };
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request data | Phone number format invalid (must be E.164) |
| 401 | `UNAUTHORIZED` | You must be logged in | Missing or invalid JWT token |
| 404 | `USER_NOT_FOUND` | User not found | Authenticated user doesn't exist |
| 409 | `PHONE_IN_USE` | This phone number is already associated with another account | Duplicate phone number |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | Max 3 SMS per 15 minutes reached |
| 500 | `SMS_SEND_FAILED` | Failed to send SMS verification code | Twilio API error |

**Example cURL:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/setup-sms \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+12345678901"}'
```

---

### 2. Verify SMS Code (Setup Completion)

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/verify-setup
```

> **Note:** This endpoint is part of the unified 2FA setup flow and handles both SMS and TOTP verification. See `UNIFIED_2FA_API_IMPLEMENTATION.md` for complete details.

Verifies the SMS code received and completes 2FA setup.

**Headers:**
```typescript
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  method: "SMS";
  code: string; // 6-digit code
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    method: "SMS";
    enabled: true;
    backupCodes?: string[]; // Optional: backup codes for account recovery
    message: string;
  };
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid code format | Code must be 6 digits |
| 401 | `VERIFICATION_FAILED` | Invalid verification code | Code doesn't match |
| 404 | `CODE_NOT_FOUND` | No valid verification code found | Code expired or doesn't exist |
| 429 | `MAX_ATTEMPTS_EXCEEDED` | Maximum verification attempts exceeded | Used all 3 attempts |

---

### 3. Verify SMS During Login (2FA Challenge)

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/verify-sms
```

Verifies SMS OTP code during the login flow after primary credentials.

**Headers:**
```typescript
{
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  challengeToken: string; // Token from initial login response
  code: string; // 6-digit SMS code
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    message: "Two-factor authentication successful";
    // Session token generation happens in the auth flow
  };
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Code must be 6 digits | Invalid format |
| 401 | `VERIFICATION_FAILED` | Invalid verification code | Wrong code entered |
| 403 | `ACCOUNT_LOCKED` | Account locked due to failed attempts | Too many failed verifications |
| 410 | `CODE_EXPIRED` | Verification code has expired | Code older than 5 minutes |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many verification attempts | Exceeded rate limit |

**Additional Response Fields on Error:**
```typescript
{
  success: false;
  error: {
    code: string;
    message: string;
    attemptsRemaining?: number; // e.g., 2
    lockedUntil?: string; // ISO timestamp if account locked
  };
}
```

---

### 4. Resend SMS Code

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/resend-sms
```

Resends the SMS verification code. Implements progressive backoff (30s, 60s, 120s).

**Headers:**
```typescript
{
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  challengeToken: string; // Token from initial login/setup
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    message: "Verification code has been resent";
    remainingAttempts?: number;
  };
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `RESEND_FAILED` | Invalid challenge token | Token not found/expired |
| 410 | `CHALLENGE_EXPIRED` | Challenge has expired | Need to start login again |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many SMS requests | Hit 3 SMS/15min limit or backoff period |

**Backoff Response (429):**
```typescript
{
  success: false;
  error: {
    code: "RATE_LIMIT_EXCEEDED";
    message: "Please wait 30 seconds before requesting another code";
    resetAt: string; // ISO timestamp when can retry
    remainingAttempts: number;
  };
}
```

---

### 5. Disable SMS 2FA

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/disable-sms
```

> **Note:** This is a tRPC endpoint. Use the tRPC client for frontend integration.

Disables SMS 2FA for the authenticated user. Requires password confirmation.

**tRPC Call:**
```typescript
const result = await trpc.sms2FA.disable.mutate({
  password: string;
});
```

**Request Schema:**
```typescript
{
  password: string; // Current password for security confirmation
}
```

**Success Response:**
```typescript
{
  success: true;
  message: "SMS 2FA disabled successfully";
  user: {
    id: string;
    email: string;
    twoFactorEnabled: boolean; // false
  };
}
```

**Error Responses:**

| Error Code | Message | Description |
|------------|---------|-------------|
| `NOT_FOUND` | User not found | User doesn't exist |
| `PRECONDITION_FAILED` | Password authentication not available | OAuth-only account |
| `UNAUTHORIZED` | Invalid password | Wrong password provided |

---

### 6. Get SMS 2FA Status

**🌐 SHARED - User-Facing**

```http
GET /api/auth/2fa/status
```

> **Note:** This is a tRPC endpoint. Use the tRPC client.

Retrieves current SMS 2FA configuration and rate limit status.

**tRPC Call:**
```typescript
const status = await trpc.sms2FA.getStatus.query();
```

**Success Response:**
```typescript
{
  enabled: boolean;
  phoneNumber: string | null; // Stored phone number
  phoneVerified: boolean;
  preferredMethod: "SMS" | "AUTHENTICATOR" | "BOTH" | null;
  rateLimit: {
    allowed: boolean; // Can send SMS now?
    remaining: number; // SMS remaining in window (0-3)
    resetAt: Date; // When limit resets
  };
}
```

---

### 7. Update Phone Number

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/update-phone
```

> **Note:** This is a tRPC endpoint.

Updates the user's phone number. Sends verification code to new number.

**tRPC Call:**
```typescript
const result = await trpc.sms2FA.updatePhoneNumber.mutate({
  phoneNumber: "+12345678901";
});
```

**Request Schema:**
```typescript
{
  phoneNumber: string; // E.164 format
}
```

**Success Response:**
```typescript
{
  success: true;
  message: "Verification code sent to new phone number";
  messageId: string; // Twilio message ID
}
```

**Error Responses:**

| Error Code | Message | Description |
|------------|---------|-------------|
| `CONFLICT` | Phone number already in use | Another user has this number |
| `TOO_MANY_REQUESTS` | Rate limit exceeded | Hit SMS rate limit |
| `INTERNAL_SERVER_ERROR` | Failed to send code | Twilio error |

---

### 8. Set Preferred 2FA Method

**🌐 SHARED - User-Facing**

```http
POST /api/auth/2fa/set-preferred-method
```

Sets which 2FA method to use by default when both SMS and TOTP are enabled.

**Headers:**
```typescript
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  method: "SMS" | "AUTHENTICATOR";
  verificationCode: string; // 6-digit code from chosen method
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    message: "Preferred 2FA method updated";
    method: "SMS" | "AUTHENTICATOR";
    user: {
      preferredMethod: "SMS" | "AUTHENTICATOR";
    };
  };
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `INVALID_METHOD` | Invalid 2FA method | Method not SMS/AUTHENTICATOR |
| 401 | `VERIFICATION_FAILED` | Invalid verification code | Code doesn't match |
| 403 | `PRECONDITION_FAILED` | Both methods must be enabled | Need SMS + TOTP enabled first |

---

## TypeScript Type Definitions

### Enums

```typescript
/**
 * Two-Factor Authentication Methods
 */
export enum TwoFactorMethod {
  SMS = "SMS",
  AUTHENTICATOR = "AUTHENTICATOR",
  BOTH = "BOTH",
}

/**
 * User Roles (for permission checking)
 */
export enum UserRole {
  ADMIN = "ADMIN",
  CREATOR = "CREATOR",
  BRAND = "BRAND",
  VIEWER = "VIEWER",
}

/**
 * SMS Delivery Status (from Twilio webhooks)
 */
export type SmsDeliveryStatus = 
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";
```

### Core Interfaces

```typescript
/**
 * SMS Setup Request
 */
export interface SetupSmsRequest {
  phoneNumber: string; // Must be E.164 format: /^\+[1-9]\d{1,14}$/
}

/**
 * SMS Setup Response
 */
export interface SetupSmsResponse {
  success: true;
  data: {
    method: "SMS";
    maskedPhoneNumber: string;
    message: string;
    nextStep: string;
    codeExpiry: string;
    maxAttempts: number;
    canResend: boolean;
  };
}

/**
 * Verify Code Request
 */
export interface VerifyCodeRequest {
  code: string; // 6 digits, regex: /^\d{6}$/
  method?: "SMS"; // Optional, defaults to SMS in this context
}

/**
 * SMS Challenge Verification Request
 */
export interface VerifySmsRequest {
  challengeToken: string;
  code: string; // 6 digits
}

/**
 * SMS Challenge Verification Response
 */
export interface VerifySmsResponse {
  success: boolean;
  data?: {
    message: string;
  };
  error?: {
    code: string;
    message: string;
    attemptsRemaining?: number;
    lockedUntil?: string;
  };
}

/**
 * Resend SMS Request
 */
export interface ResendSmsRequest {
  challengeToken: string;
}

/**
 * Resend SMS Response
 */
export interface ResendSmsResponse {
  success: boolean;
  data?: {
    message: string;
    remainingAttempts?: number;
  };
  error?: {
    code: string;
    message: string;
    resetAt?: string; // ISO timestamp
    remainingAttempts?: number;
  };
}

/**
 * Disable SMS 2FA Request
 */
export interface DisableSms2FARequest {
  password: string;
}

/**
 * SMS Status Response
 */
export interface SmsStatusResponse {
  enabled: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  preferredMethod: TwoFactorMethod | null;
  rateLimit: {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  };
}

/**
 * Rate Limit Information
 */
export interface RateLimitInfo {
  allowed: boolean;
  remaining: number; // 0-3 SMS remaining
  resetAt: Date;
  count: number;
}

/**
 * Update Phone Number Request
 */
export interface UpdatePhoneNumberRequest {
  phoneNumber: string; // E.164 format
}

/**
 * Set Preferred Method Request
 */
export interface SetPreferredMethodRequest {
  method: "SMS" | "AUTHENTICATOR";
  verificationCode: string; // 6 digits
}
```

### Error Types

```typescript
/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    statusCode?: number;
  };
}

/**
 * SMS 2FA Error Codes
 */
export type Sms2FAErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "USER_NOT_FOUND"
  | "PHONE_IN_USE"
  | "RATE_LIMIT_EXCEEDED"
  | "SMS_SEND_FAILED"
  | "VERIFICATION_FAILED"
  | "CODE_NOT_FOUND"
  | "CODE_EXPIRED"
  | "MAX_ATTEMPTS_EXCEEDED"
  | "ACCOUNT_LOCKED"
  | "RESEND_FAILED"
  | "CHALLENGE_EXPIRED"
  | "INVALID_METHOD"
  | "PRECONDITION_FAILED"
  | "CONFLICT"
  | "INTERNAL_SERVER_ERROR";

/**
 * Error Code Metadata
 */
export interface ErrorCodeMetadata {
  code: Sms2FAErrorCode;
  statusCode: number;
  userMessage: string; // User-friendly message to display
  actionRequired?: string; // What user should do
}
```

### Database Models

```typescript
/**
 * SMS Verification Code (from Prisma schema)
 */
export interface SmsVerificationCode {
  id: string;
  userId: string;
  codeHash: string; // Never exposed to frontend
  phoneNumber: string;
  attempts: number;
  verified: boolean;
  verifiedAt: Date | null;
  expires: Date;
  twilioMessageId: string | null;
  deliveryStatus: SmsDeliveryStatus | null;
  deliveryError: string | null;
  cost: number | null; // USD cost per SMS
  createdAt: Date;
}

/**
 * User 2FA Fields (partial User model)
 */
export interface User2FAFields {
  id: string;
  email: string;
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  two_factor_verified_at: Date | null;
  preferred_2fa_method: TwoFactorMethod | null;
  phone_number: string | null;
  phone_verified: boolean;
}
```

---

## Authentication Requirements

### JWT Authentication

Most endpoints require a valid JWT token in the `Authorization` header:

```typescript
headers: {
  Authorization: `Bearer ${jwtToken}`,
}
```

**Exception:** 2FA verification during login (`/api/auth/2fa/verify-sms` and `/api/auth/2fa/resend-sms`) uses a temporary `challengeToken` instead of JWT since the user hasn't fully authenticated yet.

### Session Requirements

- User must be authenticated with NextAuth session
- Session must contain valid `user.id` and `user.email`
- Session is validated server-side on each request

### tRPC Authentication

tRPC endpoints use the `protectedProcedure` middleware which automatically checks for valid session:

```typescript
// Backend middleware (reference only)
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

### Admin-Only Endpoints

Cost monitoring and management endpoints require `ADMIN` role:

- `/api/admin/sms-2fa/costs` (tRPC: `sms2FA.getAggregateCosts`)
- `/api/admin/sms-2fa/report` (tRPC: `sms2FA.generateCostReport`)
- `/api/admin/sms-2fa/alerts` (tRPC: `sms2FA.checkCostAlerts`)

**Role Check Logic:**
```typescript
// Verify admin role
if (user.role !== UserRole.ADMIN) {
  throw new Error('Forbidden: Admin access required');
}
```

---

## Next Steps

Continue to [Part 2: Business Logic, Validation, and Error Handling](./FRONTEND_INTEGRATION_TWILIO_SMS_2FA_PART_2.md)
