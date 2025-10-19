# Authenticator 2FA REST API Implementation

## Overview

Complete REST API implementation for TOTP (Time-based One-Time Password) authenticator-based two-factor authentication. All endpoints follow REST conventions and are implemented as Next.js App Router route handlers.

**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete  
**API Version:** 1.0

---

## Endpoints Implemented

### 1. Enable TOTP Setup
**Endpoint:** `POST /api/auth/2fa/totp/enable`  
**Authentication:** Required (authenticated user session)  
**Description:** Initiates the TOTP setup process by generating a secret and QR code

#### Request
```bash
POST /api/auth/2fa/totp/enable
Authorization: Bearer <session-token>
Content-Type: application/json
```

No request body required.

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KG...",
    "manualEntryKey": "JBSW Y3DP EHPK 3PXP",
    "issuer": "YesGoddess",
    "accountName": "user@example.com",
    "message": "Scan the QR code with your authenticator app or enter the key manually",
    "nextStep": "Verify the setup by providing a code from your authenticator app",
    "authenticatorApps": [
      {
        "name": "Google Authenticator",
        "ios": "https://apps.apple.com/app/google-authenticator/id388497605",
        "android": "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
        "description": "Simple and reliable, works offline"
      },
      {
        "name": "Microsoft Authenticator",
        "ios": "https://apps.apple.com/app/microsoft-authenticator/id983156458",
        "android": "https://play.google.com/store/apps/details?id=com.azure.authenticator",
        "description": "Cloud backup and multi-device sync available"
      },
      {
        "name": "Authy",
        "ios": "https://apps.apple.com/app/authy/id494168017",
        "android": "https://play.google.com/store/apps/details?id=com.authy.authy",
        "description": "Cloud backup, multi-device sync, and encrypted backups"
      },
      {
        "name": "FreeOTP",
        "ios": "https://apps.apple.com/app/freeotp-authenticator/id872559395",
        "android": "https://play.google.com/store/apps/details?id=org.fedorahosted.freeotp",
        "description": "Open-source and privacy-focused"
      }
    ]
  }
}
```

#### Error Responses

**401 Unauthorized** - User not authenticated
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to enable two-factor authentication"
  }
}
```

**400 Bad Request** - TOTP already enabled
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

---

### 2. Verify TOTP Setup
**Endpoint:** `POST /api/auth/2fa/totp/verify`  
**Authentication:** Required (authenticated user session)  
**Description:** Verifies the initial TOTP code and completes setup, enabling 2FA and generating backup codes

#### Request
```bash
POST /api/auth/2fa/totp/verify
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "code": "123456"
}
```

#### Request Body Schema
```typescript
{
  code: string; // 6-digit TOTP code from authenticator app
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "backupCodes": [
      "ABCD-EFGH",
      "IJKL-MNOP",
      "QRST-UVWX",
      "YZAB-CDEF",
      "GHIJ-KLMN",
      "OPQR-STUV",
      "WXYZ-ABCD",
      "EFGH-IJKL",
      "MNOP-QRST",
      "UVWX-YZAB"
    ],
    "message": "Two-factor authentication has been successfully enabled for your account",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "backupCodesInfo": {
      "count": 10,
      "oneTimeUse": true,
      "format": "Each code can only be used once",
      "usage": "Use these codes if you lose access to your authenticator app"
    }
  }
}
```

#### Error Responses

**401 Unauthorized** - Invalid TOTP code
```json
{
  "success": false,
  "error": {
    "code": "TOTP_INVALID",
    "message": "The code you entered is invalid or has expired",
    "statusCode": 401
  }
}
```

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "code": "too_small",
        "minimum": 6,
        "type": "string",
        "message": "TOTP code must be 6 digits",
        "path": ["code"]
      }
    ]
  }
}
```

---

### 3. Disable TOTP
**Endpoint:** `POST /api/auth/2fa/totp/disable`  
**Authentication:** Required (authenticated user session)  
**Description:** Disables TOTP 2FA for the user, requires password and optionally TOTP code verification

#### Request
```bash
POST /api/auth/2fa/totp/disable
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "password": "userPassword123!",
  "code": "123456"  // Optional but recommended
}
```

#### Request Body Schema
```typescript
{
  password: string;    // Required: Current password for verification
  code?: string;       // Optional: TOTP code for additional security
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "enabled": false,
    "message": "Two-factor authentication has been disabled for your account",
    "warning": "Your account is now less secure. We recommend re-enabling two-factor authentication.",
    "securityNote": "A security alert has been sent to your email address."
  }
}
```

#### Error Responses

**401 Unauthorized** - Invalid password
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "The password you entered is incorrect",
    "statusCode": 401
  }
}
```

**400 Bad Request** - TOTP not enabled
```json
{
  "success": false,
  "error": {
    "code": "TOTP_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled for this account",
    "statusCode": 400
  }
}
```

---

### 4. Get TOTP Status
**Endpoint:** `GET /api/auth/2fa/totp/status`  
**Authentication:** Required (authenticated user session)  
**Description:** Retrieves the current TOTP status and backup codes information

#### Request
```bash
GET /api/auth/2fa/totp/status
Authorization: Bearer <session-token>
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "verifiedAt": "2025-10-19T10:30:00.000Z",
    "backupCodesRemaining": 7,
    "method": "AUTHENTICATOR",
    "recommendations": {
      "enableTotp": null,
      "regenerateBackupCodes": "You have less than 3 backup codes remaining. Consider regenerating them."
    }
  }
}
```

#### Response When Disabled
```json
{
  "success": true,
  "data": {
    "enabled": false,
    "verifiedAt": null,
    "backupCodesRemaining": 0,
    "method": null,
    "recommendations": {
      "enableTotp": "Two-factor authentication is not enabled. Enable it to secure your account.",
      "regenerateBackupCodes": null
    }
  }
}
```

---

### 5. Regenerate Backup Codes
**Endpoint:** `POST /api/auth/2fa/totp/backup-codes/regenerate`  
**Authentication:** Required (authenticated user session)  
**Description:** Generates new backup codes, invalidating all existing unused codes

#### Request
```bash
POST /api/auth/2fa/totp/backup-codes/regenerate
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "password": "userPassword123!"
}
```

#### Request Body Schema
```typescript
{
  password: string;  // Required: Current password for verification
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "WXYZ-1234",
      "ABCD-5678",
      "EFGH-9012",
      "IJKL-3456",
      "MNOP-7890",
      "QRST-1234",
      "UVWX-5678",
      "YZAB-9012",
      "CDEF-3456",
      "GHIJ-7890"
    ],
    "message": "New backup codes have been generated successfully",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "info": {
      "count": 10,
      "previousCodesInvalidated": true,
      "oneTimeUse": true,
      "format": "Each code can only be used once",
      "usage": "Use these codes if you lose access to your authenticator app"
    }
  }
}
```

#### Error Responses

**401 Unauthorized** - Invalid password
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "The password you entered is incorrect",
    "statusCode": 401
  }
}
```

**400 Bad Request** - TOTP not enabled
```json
{
  "success": false,
  "error": {
    "code": "TOTP_NOT_ENABLED",
    "message": "Two-factor authentication is not enabled. Enable it first.",
    "statusCode": 400
  }
}
```

---

## Security Features

### Encryption
- **TOTP Secret Storage:** All TOTP secrets are encrypted using AES-256-GCM before storage in the database
- **Backup Codes:** Stored as bcrypt hashes (one-way), similar to password storage
- **Key Derivation:** Uses PBKDF2 with 100,000 iterations for encryption key derivation

### Authentication
- **Session-based:** All endpoints require valid user session
- **Password Verification:** Sensitive operations (disable, regenerate) require password re-authentication
- **TOTP Verification:** Optional TOTP code verification for disable operation

### Rate Limiting
- Rate limiting should be implemented at the API gateway or middleware level
- Recommended limits:
  - Enable: 5 requests per hour per user
  - Verify: 10 requests per hour per user
  - Disable: 3 requests per hour per user
  - Status: 60 requests per hour per user
  - Regenerate: 3 requests per hour per user

### Audit Logging
All operations are logged via the AuditService with the following information:
- Action type (TOTP_SETUP_INITIATED, TOTP_ENABLED, TOTP_DISABLED, etc.)
- User ID and email
- IP address
- User agent
- Timestamp
- Context (e.g., login, settings change)

---

## Integration Guide

### Frontend Integration

#### 1. Enable 2FA Flow
```typescript
// Step 1: Initiate setup
const response = await fetch('/api/auth/2fa/totp/enable', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  }
});

const { data } = await response.json();

// Display QR code
<img src={data.qrCodeDataUrl} alt="TOTP QR Code" />

// Or show manual entry key
<code>{data.manualEntryKey}</code>

// Step 2: Verify setup with code from authenticator
const verifyResponse = await fetch('/api/auth/2fa/totp/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  },
  body: JSON.stringify({ code: '123456' })
});

const { data: verifyData } = await verifyResponse.json();

// Display backup codes to user (IMPORTANT!)
verifyData.backupCodes.forEach(code => console.log(code));
```

#### 2. Check Status
```typescript
const response = await fetch('/api/auth/2fa/totp/status', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});

const { data } = await response.json();

if (data.enabled) {
  console.log(`2FA enabled since ${data.verifiedAt}`);
  console.log(`Backup codes remaining: ${data.backupCodesRemaining}`);
}
```

#### 3. Disable 2FA
```typescript
const response = await fetch('/api/auth/2fa/totp/disable', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  },
  body: JSON.stringify({
    password: 'userPassword',
    code: '123456' // Optional but recommended
  })
});
```

#### 4. Regenerate Backup Codes
```typescript
const response = await fetch('/api/auth/2fa/totp/backup-codes/regenerate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  },
  body: JSON.stringify({
    password: 'userPassword'
  })
});

const { data } = await response.json();
// Display new backup codes
```

---

## Testing

### Manual Testing with cURL

#### 1. Enable TOTP
```bash
curl -X POST https://your-domain.com/api/auth/2fa/totp/enable \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

#### 2. Verify TOTP
```bash
curl -X POST https://your-domain.com/api/auth/2fa/totp/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"code":"123456"}'
```

#### 3. Check Status
```bash
curl -X GET https://your-domain.com/api/auth/2fa/totp/status \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

#### 4. Disable TOTP
```bash
curl -X POST https://your-domain.com/api/auth/2fa/totp/disable \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"password":"yourPassword","code":"123456"}'
```

#### 5. Regenerate Backup Codes
```bash
curl -X POST https://your-domain.com/api/auth/2fa/totp/backup-codes/regenerate \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"password":"yourPassword"}'
```

---

## Error Handling

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | User not authenticated or session expired |
| `TOTP_ALREADY_ENABLED` | 400 | Attempting to enable when already enabled |
| `TOTP_NOT_ENABLED` | 400 | Attempting operation when TOTP not enabled |
| `TOTP_SETUP_REQUIRED` | 400 | TOTP secret not initialized |
| `TOTP_INVALID` | 401 | Invalid TOTP code provided |
| `INVALID_CURRENT_PASSWORD` | 401 | Incorrect password provided |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### Error Response Format
All errors follow a consistent format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": [] // Optional, for validation errors
  }
}
```

---

## Dependencies Used

### Core Services
- **TotpService** (`src/lib/auth/totp.service.ts`) - TOTP generation and validation
- **AuthService** (`src/lib/services/auth.service.ts`) - Business logic
- **AuditService** (`src/lib/services/audit.service.ts`) - Audit logging
- **EmailService** (`src/lib/services/email/email.service.ts`) - Email notifications

### Libraries
- **otplib** - TOTP code generation and validation (RFC 6238)
- **qrcode** - QR code generation
- **bcryptjs** - Backup code hashing
- **crypto** (Node.js built-in) - Cryptographic operations
- **zod** - Request validation
- **next-auth** - Session management

---

## File Structure

```
src/app/api/auth/2fa/totp/
├── enable/
│   └── route.ts              # POST /api/auth/2fa/totp/enable
├── verify/
│   └── route.ts              # POST /api/auth/2fa/totp/verify
├── disable/
│   └── route.ts              # POST /api/auth/2fa/totp/disable
├── status/
│   └── route.ts              # GET /api/auth/2fa/totp/status
└── backup-codes/
    └── regenerate/
        └── route.ts          # POST /api/auth/2fa/totp/backup-codes/regenerate
```

---

## Database Schema

### Users Table Fields
```sql
two_factor_enabled        BOOLEAN      DEFAULT false
two_factor_secret         TEXT         NULL (encrypted)
two_factor_verified_at    TIMESTAMP    NULL
preferred_2fa_method      TwoFactorMethod  NULL
```

### TwoFactorBackupCode Table
```sql
id          TEXT         PRIMARY KEY
userId      TEXT         FOREIGN KEY (users.id)
code        TEXT         (hashed with bcrypt)
used        BOOLEAN      DEFAULT false
usedAt      TIMESTAMP    NULL
createdAt   TIMESTAMP    DEFAULT now()
```

---

## Best Practices

### For Developers

1. **Never Log Secrets:** Never log TOTP secrets, QR codes, or backup codes
2. **Use Transactions:** All database operations use transactions for consistency
3. **Validate Input:** All inputs are validated using Zod schemas
4. **Error Handling:** Consistent error format across all endpoints
5. **Audit Everything:** All security-sensitive operations are logged

### For Users

1. **Save Backup Codes:** Store backup codes in a secure password manager
2. **Use Strong Passwords:** Enable 2FA doesn't replace strong passwords
3. **Multiple Devices:** Consider using authenticator apps with cloud backup
4. **Regular Checks:** Periodically verify 2FA status and backup codes remaining

---

## Next Steps / Enhancements

### Potential Improvements

1. **Email Notifications**
   - Create dedicated email templates for 2FA events
   - Send alerts when 2FA is enabled/disabled
   - Notify when backup codes are regenerated or running low

2. **Rate Limiting Middleware**
   - Implement API-level rate limiting
   - Add IP-based rate limiting for verification attempts
   - Implement exponential backoff for failed verifications

3. **Admin Tools**
   - Admin endpoint to view 2FA status for all users
   - Ability to disable 2FA for locked-out users
   - 2FA adoption metrics and reporting

4. **Enhanced Security**
   - Device fingerprinting
   - Trusted device management
   - Remember this device for 30 days option

5. **User Experience**
   - SMS backup option
   - Hardware key (WebAuthn) support
   - Recovery email as fallback

---

## Changelog

### v1.0 - October 19, 2025
- Initial implementation of all 5 TOTP endpoints
- Complete integration with existing auth infrastructure
- Comprehensive error handling and validation
- Audit logging for all operations
- Support for 4 popular authenticator apps
- Backup codes with bcrypt hashing
- QR code and manual entry support

---

## Support

For issues or questions:
- Check the error code reference above
- Review audit logs in the database
- Check server logs for detailed error messages
- Verify environment variables are correctly set (ENCRYPTION_KEY)

## License

Internal use only - YesGoddess Ops Platform
