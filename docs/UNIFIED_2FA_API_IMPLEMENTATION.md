# Unified 2FA API Endpoints - Implementation Summary

## Overview

This document provides a quick reference for the newly implemented unified Two-Factor Authentication (2FA) API endpoints. These endpoints provide a consolidated interface for managing both TOTP (authenticator app) and SMS-based 2FA methods.

**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete  

---

## Implemented Endpoints

### 1. GET /api/auth/2fa/status
**Purpose:** Check unified 2FA status for all methods  
**Authentication:** Required (authenticated user session)  
**Description:** Returns comprehensive status for TOTP, SMS, and backup codes

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "verifiedAt": "2025-10-19T12:00:00Z",
    "activeMethod": "AUTHENTICATOR",
    "availableMethods": {
      "totp": {
        "available": true,
        "configured": true,
        "description": "Authenticator app (Google Authenticator, Authy, etc.)"
      },
      "sms": {
        "available": true,
        "configured": true,
        "maskedPhone": "***8901",
        "description": "SMS verification code sent to your phone"
      }
    },
    "backupCodes": {
      "available": true,
      "remaining": 8
    },
    "recommendations": {
      "enableTotp": null,
      "enableSms": null,
      "regenerateBackupCodes": null,
      "enableAny": null
    }
  }
}
```

---

### 2. POST /api/auth/2fa/setup-totp
**Purpose:** Initiate TOTP (authenticator app) setup  
**Authentication:** Required  
**Description:** Generates QR code and manual entry key for authenticator apps

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "method": "TOTP",
    "qrCodeDataUrl": "data:image/png;base64,...",
    "manualEntryKey": "JBSW Y3DP EHPK 3PXP",
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
    "authenticatorApps": [...]
  }
}
```

---

### 3. POST /api/auth/2fa/setup-sms
**Purpose:** Initiate SMS-based 2FA setup  
**Authentication:** Required  
**Description:** Sends verification code to provided phone number

#### Request Body
```json
{
  "phoneNumber": "+12345678901"
}
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

---

### 4. POST /api/auth/2fa/verify-setup
**Purpose:** Verify and complete 2FA setup (TOTP or SMS)  
**Authentication:** Required  
**Description:** Completes setup by verifying the code, auto-detects method

#### Request Body
```json
{
  "code": "123456",
  "method": "TOTP"  // Optional: "TOTP" or "SMS", auto-detected if omitted
}
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
      ...
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

---

### 5. POST /api/auth/2fa/disable
**Purpose:** Disable all 2FA methods  
**Authentication:** Required  
**Description:** Disables TOTP, SMS, and removes all backup codes

#### Request Body
```json
{
  "password": "user-password",
  "code": "123456"  // Optional: Current 2FA code for additional security
}
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

---

### 6. GET /api/auth/2fa/backup-codes
**Purpose:** View remaining backup codes  
**Authentication:** Required  
**Description:** Returns metadata about backup codes (codes are hashed and cannot be displayed)

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "total": 8,
    "codes": [
      {
        "id": "clxxxxx1",
        "label": "Backup Code 1",
        "maskedCode": "****-****-****",
        "created": "2025-10-19T12:00:00Z",
        "status": "unused"
      },
      ...
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

---

### 7. POST /api/auth/2fa/regenerate-backup
**Purpose:** Regenerate backup codes  
**Authentication:** Required  
**Description:** Invalidates all existing backup codes and generates new ones

#### Request Body
```json
{
  "password": "user-password"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "ABCD-EFGH-IJKL",
      "MNOP-QRST-UVWX",
      ...
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

---

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to access this endpoint"
  }
}
```

### 400 Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [...]
  }
}
```

### 400 TOTP Already Enabled
```json
{
  "success": false,
  "error": {
    "code": "TOTP_ALREADY_ENABLED",
    "message": "Two-factor authentication is already enabled for this account",
    "statusCode": 400
  }
}
```

### 409 Phone In Use
```json
{
  "success": false,
  "error": {
    "code": "PHONE_IN_USE",
    "message": "This phone number is already associated with another account"
  }
}
```

---

## Integration with Existing Endpoints

These unified endpoints complement the existing TOTP-specific endpoints:
- `/api/auth/2fa/totp/enable` - Still available for TOTP-only workflows
- `/api/auth/2fa/totp/verify` - Still available for TOTP-only workflows
- `/api/auth/2fa/totp/disable` - Still available for TOTP-only workflows
- `/api/auth/2fa/totp/status` - Still available for TOTP-only status
- `/api/auth/2fa/totp/backup-codes/regenerate` - Still available

The unified endpoints provide:
1. **Single status endpoint** for all 2FA methods
2. **Method-agnostic verification** with auto-detection
3. **Unified disable** that handles all methods
4. **Simplified integration** for frontend applications

---

## Security Features

### Rate Limiting
- SMS setup: 3 SMS per 15 minutes per user
- Verification attempts: Max 3 attempts per code
- Code expiry: 5 minutes for SMS codes

### Code Security
- TOTP codes: Time-based, 30-second windows
- SMS codes: 6-digit cryptographically secure random codes
- Backup codes: One-time use, bcrypt hashed

### Authentication Requirements
- All endpoints require authenticated session
- Disable and regenerate require password verification
- Optional 2FA code for additional security on disable

### Phone Number Security
- E.164 format validation
- Duplicate phone number prevention
- Verification required before enabling

---

## Usage Examples

### Frontend Flow: Enable TOTP

```typescript
// 1. Check current status
const status = await fetch('/api/auth/2fa/status');

// 2. Initiate TOTP setup
const setup = await fetch('/api/auth/2fa/setup-totp', { method: 'POST' });
// Display QR code to user

// 3. User scans QR code and enters code from authenticator app
const verify = await fetch('/api/auth/2fa/verify-setup', {
  method: 'POST',
  body: JSON.stringify({ code: '123456', method: 'TOTP' })
});
// Display backup codes to user - they will never see these again!
```

### Frontend Flow: Enable SMS

```typescript
// 1. Initiate SMS setup with phone number
const setup = await fetch('/api/auth/2fa/setup-sms', {
  method: 'POST',
  body: JSON.stringify({ phoneNumber: '+12345678901' })
});

// 2. User receives SMS with code and enters it
const verify = await fetch('/api/auth/2fa/verify-setup', {
  method: 'POST',
  body: JSON.stringify({ code: '123456', method: 'SMS' })
});
```

### Frontend Flow: Check Backup Codes

```typescript
// View backup codes status
const codes = await fetch('/api/auth/2fa/backup-codes');
// Shows metadata but not actual codes (they're hashed)

// If user wants to regenerate
const newCodes = await fetch('/api/auth/2fa/regenerate-backup', {
  method: 'POST',
  body: JSON.stringify({ password: 'user-password' })
});
// Display new codes - they will never see these again!
```

---

## File Structure

```
src/app/api/auth/2fa/
├── status/
│   └── route.ts              # GET /api/auth/2fa/status
├── setup-totp/
│   └── route.ts              # POST /api/auth/2fa/setup-totp
├── setup-sms/
│   └── route.ts              # POST /api/auth/2fa/setup-sms
├── verify-setup/
│   └── route.ts              # POST /api/auth/2fa/verify-setup
├── disable/
│   └── route.ts              # POST /api/auth/2fa/disable
├── backup-codes/
│   └── route.ts              # GET /api/auth/2fa/backup-codes
└── regenerate-backup/
    └── route.ts              # POST /api/auth/2fa/regenerate-backup
```

---

## Testing Checklist

- [x] Status endpoint returns correct data for all 2FA states
- [x] TOTP setup generates valid QR codes and secrets
- [x] SMS setup validates phone numbers and sends codes
- [x] Verify-setup auto-detects method correctly
- [x] Verify-setup completes TOTP setup with backup codes
- [x] Verify-setup completes SMS setup and marks phone as verified
- [x] Disable removes all 2FA methods and backup codes
- [x] Backup codes endpoint returns metadata correctly
- [x] Regenerate-backup invalidates old codes and creates new ones
- [x] All endpoints require authentication
- [x] All endpoints have proper error handling
- [x] Rate limiting works for SMS operations
- [x] Password verification works for sensitive operations

---

## Notes

1. **Backup codes cannot be viewed after generation** - They are hashed with bcrypt for security
2. **The `/backup-codes` endpoint** returns metadata only, not actual codes
3. **Auto-detection in verify-setup** checks for pending TOTP secret or unverified phone
4. **SMS requires Twilio configuration** - Set environment variables for SMS to work
5. **Unified disable** handles both TOTP and SMS in a single operation
6. **All operations are audited** - Check audit logs for 2FA-related events
