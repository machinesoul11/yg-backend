# Multi-Step Login Flow with 2FA Implementation

## Overview

Complete implementation of multi-step login flow with Two-Factor Authentication (2FA), temporary authentication tokens, and trusted device management for the YesGoddess backend.

**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete

---

## Features Implemented

### 1. Multi-Step Login Flow

- **Step 1: Username/Password Validation**
  - Validates user credentials
  - Checks account status (active, not locked, not deleted)
  - Determines if 2FA is required
  - Returns appropriate response based on 2FA status

- **Step 2: 2FA Challenge**
  - Creates temporary authentication token (5-minute validity)
  - Supports TOTP (Time-based One-Time Password)
  - Supports SMS verification codes (structure in place)
  - Token is single-use and non-reusable

### 2. Trusted Device Management

- **"Trust This Device" Option**
  - 30-day exemption from 2FA requirements
  - Device fingerprinting for enhanced security
  - Automatic expiration after 30 days
  - Secure token-based device identification

- **Device Management Interface**
  - View all trusted devices
  - Revoke individual devices
  - Revoke all devices simultaneously
  - Track device metadata (IP, user agent, last used)

### 3. Security Features

- Cryptographically secure token generation
- Token hashing in database (SHA-256)
- Automatic cleanup of expired tokens
- Device fingerprinting to prevent token theft
- Comprehensive audit logging
- Rate limiting integration
- Account lockout protection

---

## Database Schema

### New Tables

#### `temporary_auth_tokens`
Stores temporary tokens created after password validation, before 2FA completion.

```prisma
model TemporaryAuthToken {
  id            String    @id @default(cuid())
  userId        String
  tokenHash     String    @unique
  challengeType String    // 'TOTP' or 'SMS'
  used          Boolean   @default(false)
  usedAt        DateTime?
  expiresAt     DateTime  // 5 minutes from creation
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime  @default(now())
  user          User      @relation(...)
}
```

#### `trusted_devices`
Stores devices trusted by users to skip 2FA for 30 days.

```prisma
model TrustedDevice {
  id                String    @id @default(cuid())
  userId            String
  tokenHash         String    @unique
  deviceName        String?   // e.g., "iPhone", "Mac", "Windows PC"
  deviceFingerprint String?   // Hash of device characteristics
  ipAddress         String?
  userAgent         String?
  lastUsedAt        DateTime?
  expiresAt         DateTime  // 30 days from creation
  createdAt         DateTime  @default(now())
  user              User      @relation(...)
}
```

---

## API Endpoints

### tRPC Endpoints

#### 1. Login (Step 1) - `auth.login`

**Input:**
```typescript
{
  email: string;
  password: string;
  trustedDeviceToken?: string; // Optional, for bypassing 2FA
  rememberMe?: boolean;
}
```

**Output (No 2FA):**
```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      emailVerified: boolean;
    };
  };
}
```

**Output (2FA Required):**
```typescript
{
  success: true;
  data: {
    requiresTwoFactor: true;
    temporaryToken: string;
    challengeType: 'TOTP' | 'SMS';
    expiresAt: Date;
    userId: string;
  };
}
```

#### 2. Verify 2FA (Step 2) - `auth.verify2FALogin`

**Input:**
```typescript
{
  temporaryToken: string;
  code: string; // 6-digit TOTP code
  trustDevice?: boolean; // Optional, default false
}
```

**Output:**
```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      emailVerified: boolean;
    };
    trustedDeviceToken?: string; // Only if trustDevice = true
  };
}
```

#### 3. Verify Backup Code (Step 2 Alternative) - `auth.verifyBackupCodeLogin`

**Input:**
```typescript
{
  temporaryToken: string;
  code: string; // Backup code (e.g., "ABCD-EFGH")
  trustDevice?: boolean;
}
```

**Output:** Same as `verify2FALogin`

#### 4. Get Trusted Devices - `auth.getTrustedDevices`

**Protected Endpoint** (requires authentication)

**Output:**
```typescript
{
  success: true;
  data: [
    {
      id: string;
      deviceName: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      lastUsedAt: Date | null;
      createdAt: Date;
      expiresAt: Date;
    }
  ];
}
```

#### 5. Revoke Trusted Device - `auth.revokeTrustedDevice`

**Protected Endpoint**

**Input:**
```typescript
{
  deviceId: string; // CUID of device to revoke
}
```

#### 6. Revoke All Trusted Devices - `auth.revokeAllTrustedDevices`

**Protected Endpoint**

**Output:**
```typescript
{
  success: true;
  data: {
    message: string;
    devicesRevoked: number;
  };
}
```

---

## Frontend Integration Guide

### Step 1: Initial Login

```typescript
const result = await trpc.auth.login.mutate({
  email: 'user@example.com',
  password: 'password123',
  trustedDeviceToken: localStorage.getItem('trustedDevice'), // If exists
});

if (result.data.requiresTwoFactor) {
  // Store temporary token
  sessionStorage.setItem('tempToken', result.data.temporaryToken);
  
  // Show 2FA input screen
  showTwoFactorScreen(result.data.challengeType);
} else {
  // Login successful
  handleSuccessfulLogin(result.data.user);
}
```

### Step 2: 2FA Verification

```typescript
const tempToken = sessionStorage.getItem('tempToken');
const trustDevice = document.getElementById('trust-device-checkbox').checked;

const result = await trpc.auth.verify2FALogin.mutate({
  temporaryToken: tempToken,
  code: userEnteredCode,
  trustDevice,
});

// Clear temporary token
sessionStorage.removeItem('tempToken');

// Store trusted device token if provided
if (result.data.trustedDeviceToken) {
  localStorage.setItem('trustedDevice', result.data.trustedDeviceToken);
}

// Complete login
handleSuccessfulLogin(result.data.user);
```

### Managing Trusted Devices

```typescript
// View devices
const devices = await trpc.auth.getTrustedDevices.query();

// Revoke specific device
await trpc.auth.revokeTrustedDevice.mutate({
  deviceId: deviceToRevoke.id,
});

// Revoke all devices
await trpc.auth.revokeAllTrustedDevices.mutate();

// Clear local storage
localStorage.removeItem('trustedDevice');
```

---

## Security Considerations

### Token Security

1. **Temporary Tokens**
   - 5-minute expiration (300 seconds)
   - Single-use only
   - Hashed in database (SHA-256)
   - Automatically cleaned up hourly

2. **Trusted Device Tokens**
   - 30-day expiration
   - Hashed in database
   - Device fingerprinting
   - Can be revoked anytime

### Best Practices

1. **Client-Side Storage**
   - Store temporary tokens in `sessionStorage` (auto-cleared on tab close)
   - Store trusted device tokens in `localStorage` (persistent)
   - Never expose tokens in URLs or logs

2. **Error Handling**
   - Generic error messages for invalid credentials (prevent user enumeration)
   - Specific errors for expired/invalid tokens
   - Rate limiting on all authentication endpoints

3. **Audit Logging**
   - All login attempts logged
   - Trusted device creation/revocation logged
   - Failed 2FA attempts logged

---

## Maintenance & Monitoring

### Automatic Cleanup

A cron job runs hourly to clean up expired tokens:

```typescript
// Runs at minute 0 of every hour
cron.schedule('0 * * * *', cleanupExpiredTokens);
```

**What Gets Cleaned:**
- Temporary auth tokens expired > 1 hour ago
- Trusted devices past expiration date

### Manual Cleanup

You can manually trigger cleanup via:

```typescript
import { runMultiStepAuthCleanup } from '@/lib/jobs/multi-step-auth-cleanup.job';

const result = await runMultiStepAuthCleanup();
// Returns: { tempTokensDeleted: number, devicesDeleted: number }
```

### Monitoring Queries

```sql
-- Count active temporary tokens
SELECT COUNT(*) FROM temporary_auth_tokens 
WHERE expires_at > NOW() AND used = false;

-- Count active trusted devices per user
SELECT user_id, COUNT(*) as device_count 
FROM trusted_devices 
WHERE expires_at > NOW() 
GROUP BY user_id 
ORDER BY device_count DESC;

-- Failed 2FA attempts in last hour
SELECT COUNT(*) FROM audit_events 
WHERE action = 'TOTP_VERIFICATION_FAILED' 
AND timestamp > NOW() - INTERVAL '1 hour';
```

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `TEMP_TOKEN_INVALID` | Invalid temporary authentication token | 401 |
| `TEMP_TOKEN_EXPIRED` | Temporary token has expired (>5 minutes) | 401 |
| `TEMP_TOKEN_ALREADY_USED` | Token has already been used | 401 |
| `DEVICE_NOT_FOUND` | Trusted device not found | 404 |
| `TOTP_INVALID` | Invalid TOTP code | 401 |
| `BACKUP_CODE_INVALID` | Invalid backup code | 401 |
| `UNAUTHORIZED` | User not authenticated | 401 |

---

## Testing Scenarios

### Happy Path

1. **Login with 2FA**
   ```
   1. POST login → Receives temporary token
   2. POST verify2FALogin → Login success
   ```

2. **Login with Trusted Device**
   ```
   1. POST login (with trustedDeviceToken) → Login success (skips 2FA)
   ```

3. **Trust New Device**
   ```
   1. POST login → Temporary token
   2. POST verify2FALogin (trustDevice=true) → Receives trustedDeviceToken
   3. POST login (with new trustedDeviceToken) → Login success
   ```

### Error Scenarios

1. **Expired Temporary Token**
   - Wait >5 minutes after login
   - Attempt verify2FALogin → `TEMP_TOKEN_EXPIRED`

2. **Reused Token**
   - Complete 2FA verification
   - Try using same temporary token again → `TEMP_TOKEN_ALREADY_USED`

3. **Invalid TOTP Code**
   - Enter wrong 6-digit code → `TOTP_INVALID`

4. **Compromised Device Token**
   - Use device token from different device/browser
   - System detects fingerprint mismatch → Logs warning

---

## Migration Guide

### For Existing Users

1. Existing users without 2FA → No changes, login works as before
2. Existing users with 2FA → Now get temporary token flow
3. All 2FA-enabled users can now use trusted devices

### Database Migration

```bash
# Apply migration
npx prisma migrate deploy

# Or push schema
npx prisma db push
```

### Environment Variables

No new environment variables required. Uses existing:
- `DATABASE_URL` / `DATABASE_URL_POOLED`
- Existing Redis connection (for cleanup job scheduling)

---

## Future Enhancements

### Potential Additions

1. **SMS 2FA Support**
   - Integrate Twilio/AWS SNS
   - Send SMS codes via `SmsVerificationCode` table
   - Add SMS fallback option

2. **WebAuthn/FIDO2**
   - Hardware security key support
   - Biometric authentication
   - Passwordless login

3. **Suspicious Activity Detection**
   - Geographic location tracking
   - Time-based patterns
   - Automatic device revocation

4. **Device Limits**
   - Maximum trusted devices per user
   - Device priority (most recently used)
   - Automatic oldest device removal

5. **Enhanced Fingerprinting**
   - Canvas fingerprinting
   - Browser plugin detection
   - Screen resolution tracking

---

## Files Created/Modified

### New Files

1. `src/lib/services/multi-step-auth.service.ts` - Core service
2. `src/lib/jobs/multi-step-auth-cleanup.job.ts` - Cleanup cron job
3. `prisma/migrations/20251019000001_add_multistep_login/migration.sql` - Database migration

### Modified Files

1. `prisma/schema.prisma` - Added new models
2. `src/lib/services/auth.service.ts` - Added multi-step methods
3. `src/lib/api/routers/auth.router.ts` - Added new endpoints
4. `src/lib/validators/auth.validators.ts` - Added new validators
5. `src/lib/errors/auth.errors.ts` - Added new error types
6. `src/lib/services/audit.service.ts` - Added audit actions

---

## Support & Questions

For issues or questions about this implementation:

1. Check error logs in `audit_events` table
2. Verify Prisma schema is synced: `npx prisma generate`
3. Check cron job logs for cleanup issues
4. Review audit trail for security events

---

**Implementation Complete** ✅

All requirements from the roadmap have been implemented:
- ✅ Step 1: Username/password validation
- ✅ Step 2: 2FA challenge display
- ✅ Temporary auth token (5-minute validity, non-reusable)
- ✅ Session upgrade after 2FA verification
- ✅ "Trust this device" option (30-day exemption)
- ✅ Trusted device management interface
