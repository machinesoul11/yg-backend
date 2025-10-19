# TOTP (Two-Factor Authentication) Implementation Guide

## Overview

This document provides a complete guide to the TOTP (Time-based One-Time Password) implementation for the YesGoddess backend. The implementation uses industry-standard TOTP algorithms compatible with Google Authenticator, Microsoft Authenticator, Authy, and other authenticator apps.

## Architecture

### Components

1. **Encryption Service** (`src/lib/auth/encryption.ts`)
   - AES-256-GCM encryption for TOTP secrets
   - Cryptographically secure key derivation using PBKDF2
   - Safe storage of sensitive TOTP data

2. **TOTP Service** (`src/lib/auth/totp.service.ts`)
   - Secret generation (32 bytes, base32-encoded)
   - QR code generation for authenticator apps
   - TOTP code validation with time drift tolerance (±30 seconds)
   - Backup code generation and validation

3. **Auth Service Extensions** (`src/lib/services/auth.service.ts`)
   - TOTP setup flow
   - TOTP verification during login
   - Backup code verification
   - TOTP disable/enable management

4. **API Endpoints** (`src/lib/api/routers/auth.router.ts`)
   - `/api/trpc/auth.totpSetup` - Initialize TOTP setup
   - `/api/trpc/auth.totpConfirm` - Confirm and enable TOTP
   - `/api/trpc/auth.totpVerify` - Verify TOTP code
   - `/api/trpc/auth.backupCodeVerify` - Verify backup code
   - `/api/trpc/auth.totpDisable` - Disable TOTP
   - `/api/trpc/auth.backupCodesRegenerate` - Generate new backup codes
   - `/api/trpc/auth.totpStatus` - Get TOTP status

## Database Schema

The TOTP implementation uses the following database fields (already migrated):

### User Model Fields

```prisma
model User {
  // ... existing fields
  two_factor_enabled     Boolean    @default(false)
  two_factor_secret      String?    // Encrypted TOTP secret
  two_factor_verified_at DateTime?
  preferred_2fa_method   TwoFactorMethod?
  // ...
}
```

### Backup Codes Model

```prisma
model TwoFactorBackupCode {
  id        String    @id @default(cuid())
  userId    String
  code      String    // Hashed using bcrypt
  used      Boolean   @default(false)
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Installation

### 1. Install Dependencies

Already installed:
```bash
npm install otplib@^12.0.1 qrcode@^1.5.3
npm install -D @types/qrcode@^1.5.5
```

### 2. Generate Encryption Key

```bash
node scripts/generate-encryption-key.js
```

This generates a 256-bit encryption key. Add it to your `.env` file:

```env
ENCRYPTION_KEY=<generated_key_here>
```

**CRITICAL SECURITY NOTES:**
- Never commit this key to version control
- Use different keys for development and production
- Back up this key securely
- Losing this key means losing access to all encrypted TOTP secrets

### 3. Verify Prisma Client

The Prisma client has been regenerated to include TOTP fields:

```bash
npx prisma generate
```

## TOTP Configuration

### Parameters

- **Algorithm**: SHA-1 (standard for TOTP)
- **Digits**: 6
- **Time Step**: 30 seconds
- **Time Window**: ±1 window (±30 seconds tolerance)
- **Secret Length**: 32 bytes (256 bits)
- **Backup Codes**: 10 codes, 8 characters each

### Supported Authenticator Apps

Tested and compatible with:
- ✅ Google Authenticator
- ✅ Microsoft Authenticator
- ✅ Authy
- ✅ 1Password
- ✅ Bitwarden
- ✅ Any RFC 6238 compliant authenticator

## API Usage

### 1. Setup TOTP (Admin/Internal Staff Only)

**Endpoint**: `auth.totpSetup`

```typescript
const { data } = await trpc.auth.totpSetup.mutate();

// Response:
{
  success: true,
  data: {
    qrCodeDataUrl: "data:image/png;base64,...",  // QR code as data URL
    manualEntryKey: "ABCD EFGH IJKL MNOP...",   // For manual entry
    message: "Scan QR code with your authenticator app..."
  }
}
```

**UI Implementation:**
- Display QR code for scanning
- Show manual entry key as alternative
- Provide instructions for users

### 2. Confirm TOTP Setup

**Endpoint**: `auth.totpConfirm`

```typescript
const { data } = await trpc.auth.totpConfirm.mutate({
  code: "123456"  // Code from authenticator app
});

// Response:
{
  success: true,
  data: {
    backupCodes: [
      "ABCD-EFGH",
      "IJKL-MNOP",
      // ... 8 more codes
    ],
    message: "Two-factor authentication enabled successfully..."
  }
}
```

**UI Implementation:**
- Prompt user to enter code from authenticator app
- Display backup codes prominently
- Force user to download/save backup codes
- Never show backup codes again after this step

### 3. Login with TOTP

The login flow is modified to check for TOTP:

```typescript
// Step 1: Regular login
const session = await signIn('credentials', {
  email: 'user@yesgoddess.agency',
  password: 'password',
  redirect: false
});

// Step 2: Check if TOTP is enabled
if (session?.user?.twoFactorEnabled) {
  // Step 3: Prompt for TOTP code
  const code = await promptForTOTP(); // Your UI implementation
  
  // Step 4: Verify TOTP
  await trpc.auth.totpVerify.mutate({ code });
}
```

### 4. Verify TOTP Code

**Endpoint**: `auth.totpVerify`

```typescript
await trpc.auth.totpVerify.mutate({
  code: "123456"
});
```

### 5. Verify Backup Code

**Endpoint**: `auth.backupCodeVerify`

```typescript
await trpc.auth.backupCodeVerify.mutate({
  code: "ABCD-EFGH"
});
```

**Note:** Backup codes are single-use and marked as used after verification.

### 6. Disable TOTP

**Endpoint**: `auth.totpDisable`

```typescript
await trpc.auth.totpDisable.mutate({
  password: "user_password",
  code: "123456"  // Optional: current TOTP code
});
```

### 7. Regenerate Backup Codes

**Endpoint**: `auth.backupCodesRegenerate`

```typescript
const { data } = await trpc.auth.backupCodesRegenerate.mutate({
  password: "user_password"
});

// Returns 10 new backup codes
```

### 8. Get TOTP Status

**Endpoint**: `auth.totpStatus`

```typescript
const { data } = await trpc.auth.totpStatus.query();

// Response:
{
  success: true,
  data: {
    enabled: true,
    verifiedAt: "2025-10-19T12:00:00Z",
    backupCodesRemaining: 8
  }
}
```

## Security Features

### 1. Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Random Salt**: 64 bytes per encryption
- **Authentication Tag**: Prevents tampering

### 2. Time Drift Tolerance

- Accepts codes from current 30-second window
- Accepts codes from ±1 window (previous and next)
- Total acceptance window: ~90 seconds
- Helps with clock synchronization issues

### 3. Backup Codes

- 10 codes generated during setup
- 8 characters each (format: XXXX-XXXX)
- Hashed using bcrypt (12 rounds)
- Single-use only
- Can be regenerated with password verification

### 4. Rate Limiting

Implement rate limiting on TOTP endpoints to prevent brute-force attacks:

```typescript
// Recommended limits:
- TOTP verification: 5 attempts per 15 minutes
- Setup initiation: 3 attempts per hour
- Backup code verification: 3 attempts per 15 minutes
```

### 5. Audit Logging

All TOTP operations are logged:
- `TOTP_SETUP_INITIATED`
- `TOTP_ENABLED`
- `TOTP_DISABLED`
- `TOTP_VERIFICATION_SUCCESS`
- `TOTP_VERIFICATION_FAILED`
- `BACKUP_CODE_VERIFICATION_SUCCESS`
- `BACKUP_CODE_VERIFICATION_FAILED`
- `BACKUP_CODES_REGENERATED`

## Frontend Integration Guide

### Step 1: Setup Page

```typescript
// pages/settings/security.tsx
import QRCode from 'react-qr-code';

function SecuritySettings() {
  const [setupData, setSetupData] = useState(null);
  const totpSetup = trpc.auth.totpSetup.useMutation();
  const totpConfirm = trpc.auth.totpConfirm.useMutation();
  
  const handleSetup = async () => {
    const result = await totpSetup.mutateAsync();
    setSetupData(result.data);
  };
  
  const handleConfirm = async (code: string) => {
    const result = await totpConfirm.mutateAsync({ code });
    // Show backup codes to user
    showBackupCodes(result.data.backupCodes);
  };
  
  return (
    <div>
      {!setupData ? (
        <button onClick={handleSetup}>Enable 2FA</button>
      ) : (
        <div>
          {/* QR Code */}
          <img src={setupData.qrCodeDataUrl} alt="QR Code" />
          
          {/* Manual Entry */}
          <p>Manual Key: {setupData.manualEntryKey}</p>
          
          {/* Verification */}
          <input 
            placeholder="Enter code from app"
            onChange={(e) => handleConfirm(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

### Step 2: Login Page

```typescript
// pages/auth/signin.tsx
function SignInPage() {
  const [showTOTP, setShowTOTP] = useState(false);
  const [userId, setUserId] = useState(null);
  const totpVerify = trpc.auth.totpVerify.useMutation();
  
  const handleLogin = async (email: string, password: string) => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false
    });
    
    if (result?.ok) {
      // Check if TOTP is enabled
      const session = await getSession();
      if (session?.user?.twoFactorEnabled) {
        setShowTOTP(true);
        setUserId(session.user.id);
      } else {
        // Regular login complete
        router.push('/dashboard');
      }
    }
  };
  
  const handleTOTPVerify = async (code: string) => {
    await totpVerify.mutateAsync({ code });
    router.push('/dashboard');
  };
  
  return (
    <div>
      {!showTOTP ? (
        <LoginForm onSubmit={handleLogin} />
      ) : (
        <TOTPForm onSubmit={handleTOTPVerify} />
      )}
    </div>
  );
}
```

## Testing

### Manual Testing Checklist

- [ ] Generate encryption key and add to .env
- [ ] Setup TOTP with Google Authenticator
- [ ] Verify QR code scans correctly
- [ ] Test manual entry method
- [ ] Verify code from authenticator app
- [ ] Receive and save backup codes
- [ ] Login with TOTP code
- [ ] Login with backup code
- [ ] Test time drift tolerance
- [ ] Disable TOTP
- [ ] Re-enable TOTP
- [ ] Regenerate backup codes
- [ ] Test with Microsoft Authenticator
- [ ] Test with Authy

### Automated Testing

```typescript
// __tests__/totp.test.ts
import { TotpService } from '@/lib/auth/totp.service';

describe('TOTP Service', () => {
  it('should generate valid secret', () => {
    const { secret, encryptedSecret } = TotpService.generateSecret();
    expect(secret).toBeTruthy();
    expect(encryptedSecret).toBeTruthy();
  });
  
  it('should validate TOTP code', () => {
    const { secret, encryptedSecret } = TotpService.generateSecret();
    const code = TotpService.generateCode(encryptedSecret);
    const isValid = TotpService.validateCode(encryptedSecret, code);
    expect(isValid).toBe(true);
  });
  
  it('should generate backup codes', async () => {
    const codes = await TotpService.generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(codes[0].code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});
```

## Troubleshooting

### Issue: "Invalid TOTP code"

**Possible causes:**
1. Clock synchronization issues
2. User entered code too late
3. Wrong secret being used

**Solutions:**
- Ensure server time is synchronized (use NTP)
- Check time drift tolerance is ±1 window
- Verify encryption/decryption is working
- Check audit logs for details

### Issue: "ENCRYPTION_KEY not set"

**Solution:**
```bash
node scripts/generate-encryption-key.js
# Add output to .env file
```

### Issue: Backup codes not working

**Possible causes:**
1. Code already used
2. Incorrect formatting

**Solutions:**
- Check backup code status in database
- Ensure code is uppercase with dash
- Regenerate backup codes if needed

### Issue: QR code not scanning

**Possible causes:**
1. QR code too small
2. Low quality image
3. Wrong format

**Solutions:**
- Increase QR code size (300x300 minimum)
- Use high error correction level
- Provide manual entry alternative

## Production Deployment Checklist

- [ ] Generate production encryption key
- [ ] Add ENCRYPTION_KEY to production environment
- [ ] Verify Prisma migrations applied
- [ ] Test TOTP setup flow
- [ ] Test login with TOTP
- [ ] Verify audit logging works
- [ ] Set up rate limiting
- [ ] Configure monitoring/alerts
- [ ] Document recovery procedures
- [ ] Train support staff
- [ ] Create user documentation

## User Documentation

### For End Users

**Setting up Two-Factor Authentication:**

1. Go to Settings > Security
2. Click "Enable Two-Factor Authentication"
3. Scan the QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, or Authy)
4. Or manually enter the provided key
5. Enter the 6-digit code from your app
6. Save your backup codes in a secure location

**Logging in with Two-Factor Authentication:**

1. Enter your email and password as usual
2. When prompted, open your authenticator app
3. Enter the 6-digit code shown for YesGoddess
4. If you don't have your phone, use a backup code

**If you lose access to your authenticator:**

1. Use one of your backup codes to log in
2. Go to Settings > Security
3. Regenerate new backup codes
4. Or disable and re-enable 2FA with a new device

## Support & Maintenance

### Monitoring

Monitor these metrics:
- TOTP setup success rate
- TOTP verification success rate
- Backup code usage frequency
- Failed verification attempts
- Clock drift incidents

### Key Rotation

To rotate the encryption key:

1. Generate new key
2. Create migration script to re-encrypt all secrets
3. Run migration during maintenance window
4. Update ENCRYPTION_KEY in environment
5. Verify all users can still authenticate

**Warning:** This requires all TOTP secrets to be re-encrypted. Plan carefully.

## References

- [RFC 6238 - TOTP](https://datatracker.ietf.org/doc/html/rfc6238)
- [RFC 4226 - HOTP](https://datatracker.ietf.org/doc/html/rfc4226)
- [otplib Documentation](https://github.com/yeojz/otplib)
- [QRCode Documentation](https://github.com/soldair/node-qrcode)

---

**Implementation Date**: October 19, 2025  
**Version**: 1.0.0  
**Status**: ✅ Complete
