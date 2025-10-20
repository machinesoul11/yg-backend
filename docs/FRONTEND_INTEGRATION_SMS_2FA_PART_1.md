# Frontend Integration Guide: SMS 2FA Flow - Part 1

## 📋 Classification: 🌐 SHARED
**Module:** SMS Two-Factor Authentication  
**Status:** ✅ Complete  
**Last Updated:** October 19, 2025  
**Backend Version:** 1.0.0

---

## 📖 Overview

This guide provides complete integration details for the SMS-based Two-Factor Authentication (2FA) system. The SMS 2FA module allows users to secure their accounts using verification codes sent via SMS to their registered phone numbers.

### Key Features
- ✅ Phone number verification and registration
- ✅ 6-digit numeric OTP codes
- ✅ 5-minute code expiration
- ✅ Rate limiting and progressive backoff
- ✅ Multiple 2FA methods support (SMS + TOTP)
- ✅ Account lockout protection
- ✅ Security audit logging

### User Journey
1. **Setup Flow**: User enables SMS 2FA by adding phone number → receives verification code → confirms code → 2FA enabled
2. **Login Flow**: User enters credentials → receives SMS code → enters code → authenticated
3. **Disable Flow**: User provides password → 2FA disabled (requires confirmation)

---

## 🔐 Authentication Requirements

All endpoints (except verification during login) require:
- **Session-based authentication** via NextAuth
- Valid JWT token in session
- User must be logged in

### How to Send Auth Headers
The backend uses NextAuth session cookies, which are automatically sent by the browser. No manual header manipulation needed for authenticated endpoints.

```typescript
// Example: Making authenticated requests with fetch
const response = await fetch('https://ops.yesgoddess.agency/api/auth/2fa/setup-sms', {
  method: 'POST',
  credentials: 'include', // Important: sends session cookies
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ phoneNumber: '+12345678901' }),
});
```

---

## 📡 API Endpoints

### Base URL
```
Production: https://ops.yesgoddess.agency
Development: http://localhost:3000
```

---

## 1️⃣ Setup SMS 2FA

### `POST /api/auth/2fa/setup-sms`

Initiates SMS 2FA setup by sending a verification code to the provided phone number.

#### Authentication
✅ **Required** - User must be authenticated

#### Request Schema

```typescript
interface SetupSmsRequest {
  phoneNumber: string; // E.164 format (e.g., +12345678901)
}
```

#### Request Example

```typescript
const response = await fetch('/api/auth/2fa/setup-sms', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: '+12345678901',
  }),
});

const data = await response.json();
```

#### Success Response (200 OK)

```typescript
interface SetupSmsResponse {
  success: true;
  data: {
    method: 'SMS';
    maskedPhoneNumber: string; // e.g., "***8901"
    message: string;
    nextStep: string;
    codeExpiry: string; // "5 minutes"
    maxAttempts: number; // 3
    canResend: boolean;
  };
}
```

**Example:**
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

| Status | Error Code | Message | Description |
|--------|-----------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request data | Phone number format invalid |
| 401 | `UNAUTHORIZED` | You must be logged in to setup SMS two-factor authentication | User not authenticated |
| 404 | `USER_NOT_FOUND` | User not found | User doesn't exist in database |
| 409 | `PHONE_IN_USE` | This phone number is already associated with another account | Phone number already registered |
| 500 | `SMS_SEND_FAILED` | Failed to send SMS verification code | Twilio service error |

**Error Response Schema:**
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      message: string;
      path: string[];
    }>;
  };
}
```

#### Validation Rules

**Phone Number:**
- ✅ Must be in E.164 format: `+[country code][number]`
- ✅ Example valid formats:
  - US: `+12025551234`
  - UK: `+442071234567`
  - Australia: `+61212345678`
- ❌ Invalid: `1234567890`, `+1 202 555 1234`, `(202) 555-1234`

**Validation Helper:**
```typescript
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format');

// Usage
function validatePhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}
```

#### Business Logic Notes

1. **Phone Number Uniqueness**: The system checks if the phone number is already verified and associated with another user. If so, setup will fail with `PHONE_IN_USE`.

2. **Unverified Phone Update**: If the user has an unverified phone number, the system will overwrite it with the new one.

3. **Multiple 2FA Methods**: Users can have both SMS and TOTP (authenticator app) enabled simultaneously. This endpoint adds SMS as a method.

4. **Automatic SMS Sending**: The verification code is sent immediately upon successful request. No separate "send code" step required.

---

## 2️⃣ Verify Setup Code

### `POST /api/auth/2fa/verify-setup`

Completes SMS 2FA setup by verifying the code sent to the user's phone.

#### Authentication
✅ **Required** - User must be authenticated

#### Request Schema

```typescript
interface VerifySetupRequest {
  code: string;      // 6-digit numeric code
  method?: 'SMS' | 'TOTP'; // Optional: auto-detected if omitted
}
```

#### Request Example

```typescript
const response = await fetch('/api/auth/2fa/verify-setup', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: '123456',
    method: 'SMS', // Optional but recommended for clarity
  }),
});

const data = await response.json();
```

#### Success Response (200 OK)

```typescript
interface VerifySetupSmsResponse {
  success: true;
  data: {
    enabled: true;
    method: 'SMS';
    phoneNumber: string; // Masked e.g., "***8901"
    message: string;
    note: string;
  };
}
```

**Example:**
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

| Status | Error Code | Message | Description |
|--------|-----------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request data | Code format invalid (not 6 digits) |
| 400 | `VERIFICATION_FAILED` | Failed to verify SMS code | Code incorrect or expired |
| 400 | `NO_PENDING_SETUP` | No pending 2FA setup found | User hasn't initiated setup |
| 401 | `UNAUTHORIZED` | You must be logged in | User not authenticated |
| 404 | `USER_NOT_FOUND` | User not found | User doesn't exist |

#### Code Validation Rules

**Verification Code:**
- ✅ Must be exactly 6 digits
- ✅ Numeric only (0-9)
- ✅ No spaces or special characters
- ✅ Must be verified within 5 minutes of receipt

**Frontend Validation:**
```typescript
export const smsCodeSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must contain only numbers');

// React component validation
function validateCode(code: string): string | null {
  if (code.length !== 6) return 'Code must be 6 digits';
  if (!/^\d{6}$/.test(code)) return 'Code must contain only numbers';
  return null; // Valid
}
```

#### Business Logic Notes

1. **Auto-Method Detection**: If `method` is omitted, the backend detects the pending setup type:
   - If `two_factor_secret` exists but not enabled → TOTP
   - If `phone_number` exists but not verified → SMS

2. **State Changes on Success**:
   - `phone_verified` set to `true`
   - `two_factor_enabled` set to `true`
   - `preferred_2fa_method` set to `'SMS'`

3. **No Backup Codes for SMS**: Unlike TOTP setup, SMS 2FA doesn't generate backup codes in the response.

4. **Max Attempts**: Users have 3 attempts to verify the code before needing to request a new one.

---

## 3️⃣ Resend SMS Code (During Setup)

### `POST /api/auth/2fa/resend-sms`

Resends the SMS verification code if the user didn't receive it or it expired.

> ⚠️ **Note**: This endpoint is used during the **login challenge flow**, not during initial setup. For setup, users should call `/api/auth/2fa/setup-sms` again.

#### Authentication
❌ **Not Required** - Used during login (before authentication complete)

#### Request Schema

```typescript
interface ResendSmsRequest {
  challengeToken: string; // Token received from login challenge
}
```

#### Request Example

```typescript
const response = await fetch('/api/auth/2fa/resend-sms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeToken: 'eyJhbGc...', // From login challenge
  }),
});

const data = await response.json();
```

#### Success Response (200 OK)

```typescript
interface ResendSmsResponse {
  success: true;
  data: {
    message: string;
    remainingAttempts: number; // Resend attempts remaining
  };
}
```

**Example:**
```json
{
  "success": true,
  "data": {
    "message": "Verification code has been resent",
    "remainingAttempts": 2
  }
}
```

#### Error Responses

| Status | Error Code | Message | Description |
|--------|-----------|---------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request data | Missing or invalid challenge token |
| 400 | `RESEND_FAILED` | Challenge has expired | Challenge token expired |
| 410 | `RESEND_FAILED` | Challenge has expired | Challenge no longer valid |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many verification attempts | User hit resend limit |

**Rate Limit Error Schema:**
```typescript
interface RateLimitErrorResponse {
  success: false;
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: string;
    resetAt: string; // ISO 8601 timestamp
    remainingAttempts: number;
  };
}
```

---

## 4️⃣ Get 2FA Status

### `GET /api/auth/2fa/status`

Retrieves the current 2FA configuration for the authenticated user, including SMS status.

#### Authentication
✅ **Required** - User must be authenticated

#### Request Example

```typescript
const response = await fetch('/api/auth/2fa/status', {
  method: 'GET',
  credentials: 'include',
});

const data = await response.json();
```

#### Success Response (200 OK)

```typescript
interface TwoFactorStatusResponse {
  success: true;
  data: {
    enabled: boolean; // Any 2FA method enabled
    bothMethodsEnabled: boolean; // TOTP and SMS both enabled
    verifiedAt: string | null; // ISO timestamp
    preferredMethod: 'SMS' | 'AUTHENTICATOR' | null;
    availableMethods: {
      totp: {
        enabled: boolean;
        configured: boolean;
        description: string;
      };
      sms: {
        enabled: boolean;
        configured: boolean;
        maskedPhone: string | null; // e.g., "***8901"
        description: string;
      };
    };
    backupCodes: {
      available: boolean;
      remaining: number;
    };
    capabilities: {
      canSetPreference: boolean; // Can choose preferred method
      canRemoveMethod: boolean; // Can remove one method while keeping another
      canSwitchDuringLogin: boolean; // Can switch methods during login
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
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "bothMethodsEnabled": false,
    "verifiedAt": "2025-10-15T10:30:00.000Z",
    "preferredMethod": "SMS",
    "availableMethods": {
      "totp": {
        "enabled": false,
        "configured": false,
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
      "available": false,
      "remaining": 0
    },
    "capabilities": {
      "canSetPreference": false,
      "canRemoveMethod": false,
      "canSwitchDuringLogin": false
    },
    "recommendations": {
      "enableTotp": "Enable authenticator app for more secure two-factor authentication and as a backup method",
      "enableSms": null,
      "regenerateBackupCodes": null,
      "setPreference": null,
      "enableAny": null
    }
  }
}
```

#### Error Responses

| Status | Error Code | Message | Description |
|--------|-----------|---------|-------------|
| 401 | `UNAUTHORIZED` | You must be logged in to check two-factor authentication status | User not authenticated |
| 404 | `USER_NOT_FOUND` | User not found | User doesn't exist |
| 500 | `INTERNAL_SERVER_ERROR` | Failed to retrieve two-factor authentication status | Server error |

#### Business Logic Notes

1. **Dual Method Support**: The response indicates if both SMS and TOTP are enabled. When both are enabled:
   - User can set a preferred method
   - User can choose method during login
   - User can remove one method while keeping the other

2. **Backup Codes**: Backup codes are only available when TOTP is enabled (not for SMS-only setups).

3. **Recommendations**: The backend provides contextual recommendations based on current setup:
   - If no 2FA: Suggest enabling any method
   - If only SMS: Suggest adding TOTP as backup
   - If both enabled but no preference: Suggest setting preference
   - If backup codes low: Suggest regenerating

---

Continue to **[Part 2](./FRONTEND_INTEGRATION_SMS_2FA_PART_2.md)** for:
- Disable SMS 2FA endpoint
- Login challenge flow (verification during login)
- TypeScript type definitions
- Error handling details
