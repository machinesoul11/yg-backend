# 🔒 Frontend Integration Guide: 2FA Setup & Management

> **Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
> **Module:** Two-Factor Authentication Setup & Management  
> **Backend API:** ops.yesgoddess.agency  
> **Last Updated:** October 19, 2025

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authentication & Authorization](#authentication--authorization)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)

---

## Overview

This module provides REST API endpoints for users to set up and manage Two-Factor Authentication (2FA) on their accounts. It supports two methods:

- **TOTP (Authenticator Apps):** Google Authenticator, Authy, Microsoft Authenticator, etc.
- **SMS:** Verification codes sent via Twilio

### Key Features

- ✅ Unified status endpoint for all 2FA methods
- ✅ Separate setup flows for TOTP and SMS
- ✅ Auto-detection of setup method during verification
- ✅ Backup codes generation (10 codes per user)
- ✅ Password verification for sensitive operations
- ✅ Rate limiting and progressive backoff
- ✅ Security notifications via email

### User Flow

```
┌─────────────────┐
│ Check Status    │ GET /api/auth/2fa/status
└────────┬────────┘
         │
    ┌────▼────┐
    │ Enable? │
    └────┬────┘
         │
    ┌────▼────────────────────────────┐
    │ Choose Method:                  │
    │ • TOTP (Authenticator)          │
    │ • SMS (Phone Number)            │
    └────┬────────────────────────────┘
         │
    ┌────▼────────────────────────────┐
    │ Setup:                          │
    │ POST /api/auth/2fa/setup-totp   │
    │ POST /api/auth/2fa/setup-sms    │
    └────┬────────────────────────────┘
         │
    ┌────▼────────────────────────────┐
    │ Verify Setup:                   │
    │ POST /api/auth/2fa/verify-setup │
    │ (Returns backup codes)          │
    └────┬────────────────────────────┘
         │
    ┌────▼────────────────────────────┐
    │ Management:                     │
    │ • View backup codes             │
    │ • Regenerate backup codes       │
    │ • Disable 2FA                   │
    └─────────────────────────────────┘
```

---

## API Endpoints

### Base URL

```
Production: https://ops.yesgoddess.agency
Development: http://localhost:3000
```

### Authentication

All endpoints require an authenticated session. Include credentials in requests:

```typescript
fetch('/api/auth/2fa/status', {
  method: 'GET',
  credentials: 'include', // Important: Include session cookie
  headers: {
    'Content-Type': 'application/json',
  },
});
```

---

### 1. Check 2FA Status

**Endpoint:** `GET /api/auth/2fa/status`  
**Authentication:** Required  
**Rate Limit:** None (read-only)

#### Description

Retrieves comprehensive 2FA status for the authenticated user, including:
- Which methods are enabled
- Backup codes count
- Recommendations for security improvements
- Method configuration details

#### Request

```bash
curl -X GET https://ops.yesgoddess.agency/api/auth/2fa/status \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "bothMethodsEnabled": true,
    "verifiedAt": "2025-10-19T12:00:00Z",
    "preferredMethod": "AUTHENTICATOR",
    "availableMethods": {
      "totp": {
        "enabled": true,
        "configured": true,
        "description": "Authenticator app (Google Authenticator, Authy, etc.)"
      },
      "sms": {
        "enabled": true,
        "configured": true,
        "maskedPhone": "***8901",
        "description": "SMS verification code sent to your phone"
      }
    },
    "backupCodes": {
      "available": true,
      "remaining": 8
    },
    "capabilities": {
      "canSetPreference": true,
      "canRemoveMethod": true,
      "canSwitchDuringLogin": true
    },
    "recommendations": {
      "enableTotp": null,
      "enableSms": null,
      "regenerateBackupCodes": "You have less than 3 backup codes remaining. Consider regenerating them.",
      "setPreference": null,
      "enableAny": null
    }
  }
}
```

#### Response (401 Unauthorized)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to check two-factor authentication status"
  }
}
```

---

### 2. Setup TOTP (Authenticator App)

**Endpoint:** `POST /api/auth/2fa/setup-totp`  
**Authentication:** Required  
**Rate Limit:** None

#### Description

Initiates TOTP setup by generating a QR code and manual entry key. User scans the QR code with their authenticator app.

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/setup-totp \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"
```

**Request Body:** None required

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "method": "TOTP",
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhE...",
    "manualEntryKey": "JBSWY3DPEHPK3PXP",
    "issuer": "YesGoddess",
    "accountName": "user@example.com",
    "message": "Scan the QR code with your authenticator app or enter the key manually",
    "nextStep": "Use the verify-setup endpoint with a code from your authenticator app to complete setup",
    "instructions": [
      "Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)",
      "Tap the + button to add a new account",
      "Scan the QR code or manually enter the provided key",
      "Enter the 6-digit code from your app to complete setup"
    ],
    "authenticatorApps": [
      {
        "name": "Google Authenticator",
        "ios": "https://apps.apple.com/app/google-authenticator/id388497605",
        "android": "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
      },
      {
        "name": "Microsoft Authenticator",
        "ios": "https://apps.apple.com/app/microsoft-authenticator/id983156458",
        "android": "https://play.google.com/store/apps/details?id=com.azure.authenticator"
      },
      {
        "name": "Authy",
        "ios": "https://apps.apple.com/app/authy/id494168017",
        "android": "https://play.google.com/store/apps/details?id=com.authy.authy"
      }
    ]
  }
}
```

#### Error Responses

```json
// 401 - Not authenticated
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to enable two-factor authentication"
  }
}

// 400 - Already enabled
{
  "success": false,
  "error": {
    "code": "TOTP_ALREADY_ENABLED",
    "message": "Two-factor authentication is already enabled"
  }
}
```

---

### 3. Setup SMS

**Endpoint:** `POST /api/auth/2fa/setup-sms`  
**Authentication:** Required  
**Rate Limit:** 3 SMS per 15 minutes per user

#### Description

Initiates SMS-based 2FA setup by sending a 6-digit verification code to the provided phone number.

#### Request Body Schema

```json
{
  "phoneNumber": "+12345678901"
}
```

**Validation Rules:**
- Phone number must be in E.164 format
- Format: `+[country code][number]`
- Example: `+12025551234` (US), `+442071234567` (UK)
- Phone number cannot be already in use by another account

#### Request Example

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/setup-sms \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+12345678901"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "method": "SMS",
    "maskedPhoneNumber": "***8901",
    "message": "A verification code has been sent to your phone number",
    "nextStep": "Use the verify-setup endpoint with the 6-digit code to complete setup",
    "codeExpiry": "5 minutes",
    "maxAttempts": 3,
    "canResend": true
  }
}
```

#### Error Responses

```json
// 400 - Invalid phone format
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "path": ["phoneNumber"],
        "message": "Phone number must be in E.164 format (e.g., +12345678901)"
      }
    ]
  }
}

// 409 - Phone already in use
{
  "success": false,
  "error": {
    "code": "PHONE_IN_USE",
    "message": "This phone number is already associated with another account"
  }
}

// 429 - Rate limit exceeded
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "SMS rate limit exceeded. Maximum 3 SMS per 15 minutes.",
    "rateLimitResetAt": "2025-10-19T12:15:00Z"
  }
}

// 500 - SMS send failed
{
  "success": false,
  "error": {
    "code": "SMS_SEND_FAILED",
    "message": "Failed to send SMS verification code"
  }
}
```

---

### 4. Verify Setup (Complete 2FA Setup)

**Endpoint:** `POST /api/auth/2fa/verify-setup`  
**Authentication:** Required  
**Rate Limit:** 3 attempts per code

#### Description

Verifies the code from either TOTP or SMS setup and completes the 2FA enablement. Auto-detects which method is being verified based on user's pending setup state.

**Important:** For TOTP, this endpoint returns backup codes that MUST be saved by the user. They cannot be retrieved later.

#### Request Body Schema

```json
{
  "code": "123456",
  "method": "TOTP" // Optional: "TOTP" or "SMS", auto-detected if omitted
}
```

#### Request Example

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/verify-setup \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

#### Response for TOTP (200 OK)

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "method": "TOTP",
    "backupCodes": [
      "ABCD-EFGH-IJKL",
      "MNOP-QRST-UVWX",
      "YZAB-CDEF-GHIJ",
      "KLMN-OPQR-STUV",
      "WXYZ-ABCD-EFGH",
      "IJKL-MNOP-QRST",
      "UVWX-YZAB-CDEF",
      "GHIJ-KLMN-OPQR",
      "STUV-WXYZ-ABCD",
      "EFGH-IJKL-MNOP"
    ],
    "message": "Authenticator two-factor authentication has been successfully enabled",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "backupCodesInfo": {
      "count": 10,
      "oneTimeUse": true,
      "usage": "Use these codes if you lose access to your authenticator app"
    }
  }
}
```

#### Response for SMS (200 OK)

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "method": "SMS",
    "phoneNumber": "***8901",
    "message": "SMS two-factor authentication has been successfully enabled",
    "note": "You will receive a verification code via SMS when logging in"
  }
}
```

#### Error Responses

```json
// 400 - Invalid code
{
  "success": false,
  "error": {
    "code": "TOTP_INVALID",
    "message": "Invalid two-factor authentication code"
  }
}

// 400 - No pending setup
{
  "success": false,
  "error": {
    "code": "NO_PENDING_SETUP",
    "message": "No pending 2FA setup found. Please initiate setup first."
  }
}

// 400 - Max attempts exceeded (SMS)
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Maximum verification attempts exceeded. Please request a new code.",
    "attemptsRemaining": 0
  }
}
```

---

### 5. Disable 2FA

**Endpoint:** `POST /api/auth/2fa/disable`  
**Authentication:** Required  
**Requires:** Password verification

#### Description

Disables all 2FA methods (TOTP and SMS) and removes all backup codes. Sends security alert email to user.

#### Request Body Schema

```json
{
  "password": "userPassword123!",
  "code": "123456" // Optional: Current TOTP code for additional security
}
```

#### Request Example

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/disable \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "password": "userPassword123!"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "enabled": false,
    "message": "Two-factor authentication has been disabled for your account",
    "warning": "Your account is now less secure. We strongly recommend re-enabling two-factor authentication.",
    "securityNote": "A security alert has been sent to your email address.",
    "details": {
      "totpDisabled": true,
      "smsDisabled": true,
      "backupCodesRemoved": true
    }
  }
}
```

#### Error Responses

```json
// 401 - Invalid password
{
  "success": false,
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "Current password is incorrect"
  }
}

// 400 - 2FA not enabled
{
  "success": false,
  "error": {
    "code": "TOTP_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled"
  }
}
```

---

### 6. View Backup Codes

**Endpoint:** `GET /api/auth/2fa/backup-codes`  
**Authentication:** Required  
**Rate Limit:** None

#### Description

Returns metadata about backup codes. **Important:** Backup codes are stored as bcrypt hashes and cannot be displayed after initial generation. This endpoint only shows that codes exist, not the actual codes.

#### Request Example

```bash
curl -X GET https://ops.yesgoddess.agency/api/auth/2fa/backup-codes \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "total": 8,
    "codes": [
      {
        "id": "cm1abc123",
        "label": "Backup Code 1",
        "maskedCode": "****-****-****",
        "created": "2025-10-19T12:00:00Z",
        "status": "unused"
      },
      {
        "id": "cm1abc124",
        "label": "Backup Code 2",
        "maskedCode": "****-****-****",
        "created": "2025-10-19T12:00:00Z",
        "status": "unused"
      }
      // ... 6 more codes
    ],
    "message": "Backup codes are securely stored and cannot be displayed after initial generation",
    "note": "If you have lost your backup codes, you can regenerate them (this will invalidate all existing codes)",
    "recommendations": {
      "regenerate": null,
      "lowCodes": "Warning: Only 2 backup code(s) remaining"
    }
  }
}
```

#### Error Responses

```json
// 400 - 2FA not enabled
{
  "success": false,
  "error": {
    "code": "TWO_FACTOR_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled for this account"
  }
}
```

---

### 7. Regenerate Backup Codes

**Endpoint:** `POST /api/auth/2fa/regenerate-backup`  
**Authentication:** Required  
**Requires:** Password verification

#### Description

Generates new backup codes and invalidates all existing unused codes. Returns the new codes that MUST be saved by the user.

#### Request Body Schema

```json
{
  "password": "userPassword123!"
}
```

#### Request Example

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/2fa/regenerate-backup \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "password": "userPassword123!"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "ABCD-EFGH-IJKL",
      "MNOP-QRST-UVWX",
      "YZAB-CDEF-GHIJ",
      "KLMN-OPQR-STUV",
      "WXYZ-ABCD-EFGH",
      "IJKL-MNOP-QRST",
      "UVWX-YZAB-CDEF",
      "GHIJ-KLMN-OPQR",
      "STUV-WXYZ-ABCD",
      "EFGH-IJKL-MNOP"
    ],
    "message": "New backup codes have been generated successfully",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "info": {
      "count": 10,
      "previousCodesInvalidated": true,
      "oneTimeUse": true,
      "format": "Each code can only be used once",
      "usage": "Use these codes if you lose access to your authenticator app or phone",
      "storage": "Store these codes in a secure password manager or write them down and keep them safe"
    }
  }
}
```

#### Error Responses

```json
// 401 - Invalid password
{
  "success": false,
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "Current password is incorrect"
  }
}

// 400 - 2FA not enabled
{
  "success": false,
  "error": {
    "code": "TOTP_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled"
  }
}
```

---

## TypeScript Type Definitions

### Request Types

```typescript
// Setup SMS Request
export interface SetupSmsRequest {
  phoneNumber: string; // E.164 format: +[country][number]
}

// Verify Setup Request
export interface VerifySetupRequest {
  code: string; // 6-digit code
  method?: 'TOTP' | 'SMS'; // Optional, auto-detected
}

// Disable 2FA Request
export interface Disable2FARequest {
  password: string;
  code?: string; // Optional TOTP code for additional security
}

// Regenerate Backup Codes Request
export interface RegenerateBackupCodesRequest {
  password: string;
}
```

### Response Types

```typescript
// Status Response
export interface TwoFactorStatusResponse {
  success: true;
  data: {
    enabled: boolean;
    bothMethodsEnabled: boolean;
    verifiedAt: string | null; // ISO 8601 date string
    preferredMethod: 'AUTHENTICATOR' | 'SMS' | null;
    availableMethods: {
      totp: {
        enabled: boolean;
        configured: boolean;
        description: string;
      };
      sms: {
        enabled: boolean;
        configured: boolean;
        maskedPhone: string | null;
        description: string;
      };
    };
    backupCodes: {
      available: boolean;
      remaining: number;
    };
    capabilities: {
      canSetPreference: boolean;
      canRemoveMethod: boolean;
      canSwitchDuringLogin: boolean;
    };
    recommendations: {
      enableTotp: string | null;
      enableSms: string | null;
      regenerateBackupCodes: string | null;
      setPreference: string | null;
      enableAny: string | null;
    };
  };
}

// Setup TOTP Response
export interface SetupTotpResponse {
  success: true;
  data: {
    method: 'TOTP';
    qrCodeDataUrl: string; // Data URL for QR code image
    manualEntryKey: string; // Secret key for manual entry
    issuer: string; // "YesGoddess"
    accountName: string; // User's email
    message: string;
    nextStep: string;
    instructions: string[];
    authenticatorApps: Array<{
      name: string;
      ios: string; // App Store URL
      android: string; // Play Store URL
    }>;
  };
}

// Setup SMS Response
export interface SetupSmsResponse {
  success: true;
  data: {
    method: 'SMS';
    maskedPhoneNumber: string; // e.g., "***8901"
    message: string;
    nextStep: string;
    codeExpiry: string; // e.g., "5 minutes"
    maxAttempts: number; // 3
    canResend: boolean;
  };
}

// Verify Setup Response (TOTP)
export interface VerifySetupTotpResponse {
  success: true;
  data: {
    enabled: true;
    method: 'TOTP';
    backupCodes: string[]; // Array of 10 backup codes
    message: string;
    warning: string;
    backupCodesInfo: {
      count: number;
      oneTimeUse: boolean;
      usage: string;
    };
  };
}

// Verify Setup Response (SMS)
export interface VerifySetupSmsResponse {
  success: true;
  data: {
    enabled: true;
    method: 'SMS';
    phoneNumber: string; // Masked
    message: string;
    note: string;
  };
}

// Disable 2FA Response
export interface Disable2FAResponse {
  success: true;
  data: {
    enabled: false;
    message: string;
    warning: string;
    securityNote: string;
    details: {
      totpDisabled: boolean;
      smsDisabled: boolean;
      backupCodesRemoved: boolean;
    };
  };
}

// Backup Codes Response
export interface BackupCodesResponse {
  success: true;
  data: {
    total: number;
    codes: Array<{
      id: string;
      label: string;
      maskedCode: string; // Always "****-****-****"
      created: string; // ISO 8601 date
      status: 'unused';
    }>;
    message: string;
    note: string;
    recommendations: {
      regenerate: string | null;
      lowCodes: string | null;
    };
  };
}

// Regenerate Backup Codes Response
export interface RegenerateBackupCodesResponse {
  success: true;
  data: {
    backupCodes: string[]; // Array of 10 new codes
    message: string;
    warning: string;
    info: {
      count: number;
      previousCodesInvalidated: boolean;
      oneTimeUse: boolean;
      format: string;
      usage: string;
      storage: string;
    };
  };
}
```

### Error Response Types

```typescript
// Standard Error Response
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string; // Error code (see Error Codes section)
    message: string; // User-friendly error message
    statusCode?: number; // HTTP status code
    details?: unknown; // Additional error details (validation errors, etc.)
  };
}

// Validation Error Details
export interface ValidationErrorDetails {
  path: string[];
  message: string;
}

// Rate Limit Error
export interface RateLimitError extends ApiErrorResponse {
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: string;
    rateLimitResetAt?: string; // ISO 8601 date
  };
}

// SMS Verification Error
export interface SmsVerificationError extends ApiErrorResponse {
  error: {
    code: 'VERIFICATION_FAILED';
    message: string;
    attemptsRemaining?: number;
  };
}
```

### Type Guards

```typescript
// Type guard for success responses
export function isSuccessResponse<T>(response: any): response is T {
  return response && response.success === true;
}

// Type guard for error responses
export function isErrorResponse(response: any): response is ApiErrorResponse {
  return response && response.success === false && response.error;
}
```

### Enums

```typescript
// 2FA Methods
export enum TwoFactorMethod {
  TOTP = 'AUTHENTICATOR',
  SMS = 'SMS',
}

// Error Codes
export enum TwoFactorErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOTP_ALREADY_ENABLED = 'TOTP_ALREADY_ENABLED',
  TOTP_NOT_ENABLED = 'TOTP_NOT_ENABLED',
  TOTP_INVALID = 'TOTP_INVALID',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PHONE_IN_USE = 'PHONE_IN_USE',
  SMS_SEND_FAILED = 'SMS_SEND_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  NO_PENDING_SETUP = 'NO_PENDING_SETUP',
  INVALID_CURRENT_PASSWORD = 'INVALID_CURRENT_PASSWORD',
  TWO_FACTOR_NOT_ENABLED = 'TWO_FACTOR_NOT_ENABLED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}
```

---

## Business Logic & Validation Rules

### Phone Number Validation

```typescript
// E.164 Format Regex
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

// Validation function
function validatePhoneNumber(phone: string): boolean {
  return E164_REGEX.test(phone);
}

// Examples
// Valid: +12025551234, +442071234567, +81312345678
// Invalid: 202-555-1234, (202) 555-1234, +1 202 555 1234
```

### TOTP Code Validation

- **Format:** 6 digits
- **Type:** Numeric only
- **Time-based:** Valid for 30-second windows
- **Tolerance:** Backend accepts codes from previous/current/next window (90 seconds total)

```typescript
function validateTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
```

### SMS Code Validation

- **Format:** 6 digits
- **Type:** Numeric only
- **Expiry:** 5 minutes from generation
- **Max Attempts:** 3 attempts per code

```typescript
function validateSmsCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
```

### Backup Code Format

- **Format:** `XXXX-XXXX-XXXX` (12 uppercase alphanumeric characters)
- **Quantity:** 10 codes generated per user
- **Usage:** One-time use only
- **Storage:** Bcrypt hashed in database

```typescript
function formatBackupCode(code: string): string {
  // Remove spaces and convert to uppercase
  return code.replace(/\s/g, '').toUpperCase();
}

function validateBackupCode(code: string): boolean {
  // Accept with or without dashes
  const cleaned = code.replace(/-/g, '');
  return /^[A-Z0-9]{12}$/.test(cleaned);
}
```

### Password Requirements

For disable and regenerate operations:

- Must match user's current password
- Verified using bcrypt comparison
- No additional complexity requirements for verification

### Auto-Detection Logic (verify-setup)

The `verify-setup` endpoint automatically determines which method to verify:

```typescript
// Backend logic
if (user.two_factor_secret && !user.two_factor_enabled) {
  // User has pending TOTP setup
  method = 'TOTP';
} else if (user.phone_number && !user.phone_verified) {
  // User has pending SMS setup
  method = 'SMS';
} else {
  // No pending setup found
  return error('NO_PENDING_SETUP');
}
```

### State Transitions

```typescript
// User states
type TwoFactorState = 
  | 'DISABLED'           // No 2FA enabled
  | 'TOTP_PENDING'       // TOTP setup initiated but not verified
  | 'SMS_PENDING'        // SMS setup initiated but not verified
  | 'TOTP_ENABLED'       // Only TOTP enabled
  | 'SMS_ENABLED'        // Only SMS enabled
  | 'BOTH_ENABLED';      // Both methods enabled

// Valid transitions
const validTransitions = {
  DISABLED: ['TOTP_PENDING', 'SMS_PENDING'],
  TOTP_PENDING: ['TOTP_ENABLED', 'DISABLED'],
  SMS_PENDING: ['SMS_ENABLED', 'DISABLED'],
  TOTP_ENABLED: ['DISABLED', 'SMS_PENDING', 'BOTH_ENABLED'],
  SMS_ENABLED: ['DISABLED', 'TOTP_PENDING', 'BOTH_ENABLED'],
  BOTH_ENABLED: ['DISABLED', 'TOTP_ENABLED', 'SMS_ENABLED'],
};
```

### Recommendations Logic

The status endpoint returns personalized recommendations:

```typescript
interface Recommendations {
  enableTotp: string | null;    // Show if TOTP not enabled
  enableSms: string | null;     // Show if SMS not enabled
  regenerateBackupCodes: string | null; // Show if < 3 codes
  setPreference: string | null;  // Show if both enabled but no preference
  enableAny: string | null;      // Show if no 2FA enabled
}

// Example logic
if (!hasTotpSecret) {
  recommendations.enableTotp = 'Enable authenticator app for more secure two-factor authentication';
}
if (backupCodesCount < 3) {
  recommendations.regenerateBackupCodes = `You have less than 3 backup codes remaining. Consider regenerating them.`;
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description | User Action |
|------|-------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | User not authenticated | Redirect to login |
| `USER_NOT_FOUND` | 404 | User account not found | Contact support |
| `VALIDATION_ERROR` | 400 | Invalid request data | Fix validation errors |
| `TOTP_ALREADY_ENABLED` | 400 | 2FA already enabled | Check status first |
| `TOTP_NOT_ENABLED` | 400 | 2FA not enabled | Enable 2FA first |
| `TOTP_INVALID` | 401 | Invalid TOTP code | Try again with new code |
| `PHONE_IN_USE` | 409 | Phone used by another account | Use different phone |
| `SMS_SEND_FAILED` | 500 | Failed to send SMS | Try again later |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `VERIFICATION_FAILED` | 400 | Code verification failed | Check code or request new one |
| `NO_PENDING_SETUP` | 400 | No setup in progress | Initiate setup first |
| `INVALID_CURRENT_PASSWORD` | 401 | Wrong password | Re-enter password |
| `TWO_FACTOR_NOT_ENABLED` | 400 | 2FA not enabled | Enable 2FA first |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Try again or contact support |

### Error Response Format

All errors follow this structure:

```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    statusCode?: number,
    details?: unknown
  }
}
```

### User-Friendly Error Messages

**Do:** Display the `error.message` field directly to users. Messages are pre-written to be user-friendly.

**Don't:** Show technical error codes or stack traces to end users.

```typescript
// Good ✅
if (!response.success) {
  showToast('error', response.error.message);
}

// Bad ❌
if (!response.success) {
  showToast('error', `Error ${response.error.code}: See console`);
}
```

### Validation Error Handling

Validation errors include a `details` array with field-specific errors:

```typescript
if (response.error.code === 'VALIDATION_ERROR') {
  const errors = response.error.details as ValidationErrorDetails[];
  errors.forEach(err => {
    // Show error next to the field
    setFieldError(err.path.join('.'), err.message);
  });
}
```

### Rate Limit Error Handling

Display time remaining when rate limited:

```typescript
if (response.error.code === 'RATE_LIMIT_EXCEEDED') {
  const resetAt = new Date(response.error.rateLimitResetAt);
  const minutesRemaining = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
  
  showToast('error', `${response.error.message} Try again in ${minutesRemaining} minute(s).`);
}
```

### Retry Logic

```typescript
// Exponential backoff for 500 errors
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 500 && i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

### Global Error Handler

```typescript
async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error codes
      if (data.error?.code === 'UNAUTHORIZED') {
        // Redirect to login
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }

      // Throw error with response data
      throw new ApiError(data.error);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the server. Please check your internet connection.',
    });
  }
}

class ApiError extends Error {
  constructor(public error: { code: string; message: string }) {
    super(error.message);
    this.name = 'ApiError';
  }
}
```

---

## Authentication & Authorization

### Authentication Requirements

**All endpoints require authentication** via NextAuth.js session cookie.

```typescript
// Session cookie is automatically included with credentials: 'include'
fetch('/api/auth/2fa/status', {
  credentials: 'include', // Required!
  // ...
});
```

### Session Validation

- Sessions are validated on every request
- Expired sessions return `401 UNAUTHORIZED`
- Session contains: `user.id`, `user.email`, `user.role`

### Authorization Rules

| Endpoint | Who Can Access | Additional Requirements |
|----------|----------------|------------------------|
| `GET /api/auth/2fa/status` | Authenticated users | None |
| `POST /api/auth/2fa/setup-totp` | Authenticated users | None |
| `POST /api/auth/2fa/setup-sms` | Authenticated users | None |
| `POST /api/auth/2fa/verify-setup` | Authenticated users | Pending setup must exist |
| `POST /api/auth/2fa/disable` | Authenticated users | Password verification |
| `GET /api/auth/2fa/backup-codes` | Authenticated users | 2FA must be enabled |
| `POST /api/auth/2fa/regenerate-backup` | Authenticated users | Password + 2FA enabled |

### Resource Ownership

- Users can only manage their own 2FA settings
- Backend automatically scopes operations to `session.user.id`
- No way to access or modify another user's 2FA settings

### Password Verification

Some operations require password re-verification for security:

```typescript
// Operations requiring password
const REQUIRES_PASSWORD = [
  'POST /api/auth/2fa/disable',
  'POST /api/auth/2fa/regenerate-backup',
];

// Password is verified using bcrypt
// Plain text password sent in request body
// Backend hashes and compares with stored hash
```

### CORS Configuration

For cross-origin requests (if frontend is separate domain):

```typescript
// Backend CORS config (already configured)
{
  origin: process.env.FRONTEND_URL, // Set in .env
  credentials: true, // Allow cookies
}

// Frontend must use credentials: 'include'
fetch('https://ops.yesgoddess.agency/api/auth/2fa/status', {
  credentials: 'include',
  // ...
});
```

---

## Rate Limiting & Quotas

### SMS Rate Limits

**Per User Limits:**

- **3 SMS per 15 minutes** (rolling window)
- Applies to: `setup-sms` endpoint
- Tracked in: Database (`smsVerificationCode` table)

```typescript
interface SmsRateLimit {
  maxRequests: 3;
  windowMinutes: 15;
  resetType: 'rolling'; // Resets as old requests expire
}
```

**Progressive Backoff:**

After sending SMS, users must wait before requesting another:

| Attempt | Wait Time |
|---------|-----------|
| 1st | 30 seconds |
| 2nd | 60 seconds |
| 3rd+ | 120 seconds |

**Rate Limit Response:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "SMS rate limit exceeded. Maximum 3 SMS per 15 minutes.",
    "rateLimitResetAt": "2025-10-19T12:15:00Z"
  }
}
```

### Verification Attempt Limits

**Per Code Limits:**

- **3 attempts per code** (TOTP or SMS)
- After 3 failed attempts, code is invalidated
- User must request a new code

```typescript
interface CodeAttemptLimit {
  maxAttempts: 3;
  scope: 'per-code'; // Not per user
}
```

**Attempt Tracking:**

```json
// After failed verification
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Invalid verification code. 2 attempts remaining.",
    "attemptsRemaining": 2
  }
}
```

### Code Expiry

**TOTP Codes:**
- No expiry (time-based, continuously rotating)
- Valid for ±30 second windows

**SMS Codes:**
- **5 minutes from generation**
- Expired codes are automatically rejected

```typescript
interface CodeExpiry {
  totp: null; // No expiry
  sms: 5 * 60 * 1000; // 5 minutes in ms
}
```

### Resend Limits

For SMS resend during login (not setup):

- **Maximum 5 resends per 15 minutes**
- Tracked separately from setup SMS
- Progressive backoff applies

### Headers to Check

Backend does NOT return rate limit headers in responses. Rate limiting is enforced and communicated via error responses only.

**Frontend should:**

1. Track local state to prevent unnecessary requests
2. Display countdown timers based on error response
3. Disable UI elements when rate limited

```typescript
// Example: Tracking SMS send cooldown
const [canResend, setCanResend] = useState(true);
const [cooldownSeconds, setCooldownSeconds] = useState(0);

async function sendSms() {
  const response = await fetch('/api/auth/2fa/setup-sms', {...});
  
  if (response.error?.code === 'RATE_LIMIT_EXCEEDED') {
    const resetAt = new Date(response.error.rateLimitResetAt);
    const seconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
    
    setCooldownSeconds(seconds);
    setCanResend(false);
    
    // Countdown timer
    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
}
```

### Cost Monitoring (SMS)

SMS costs are tracked automatically:

- Each SMS costs ~$0.0075 USD (Twilio pricing)
- Costs stored in database per message
- Admin alerts triggered at thresholds:
  - **Daily:** $50 warning, $100 critical
  - **Weekly:** $300 warning, $500 critical
  - **Monthly:** $1000 warning, $2000 critical

**Frontend:** No need to display costs to end users, but admins may want to see usage statistics.

### Quota Display

Show users their rate limit status:

```typescript
// After sending SMS
<Alert type="info">
  Verification code sent! You can request {remainingSms} more code(s) in the next 15 minutes.
  {cooldownSeconds > 0 && (
    <p>Next code can be requested in {cooldownSeconds} seconds.</p>
  )}
</Alert>
```

---

## End of Document

**Next Document:** [FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT_PART2.md](./FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT_PART2.md) - Implementation guide with React Query examples, form validation, UI patterns, and testing.
