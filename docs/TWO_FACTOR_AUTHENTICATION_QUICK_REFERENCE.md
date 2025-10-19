# Two-Factor Authentication Schema - Quick Reference

## New Database Fields

### User Model Fields

```typescript
// All fields are optional (nullable) for existing users
two_factor_enabled: boolean       // Default: false
two_factor_secret: string | null  // MUST BE ENCRYPTED
two_factor_verified_at: Date | null
preferred_2fa_method: 'SMS' | 'AUTHENTICATOR' | 'BOTH' | null
phone_number: string | null       // MUST BE ENCRYPTED (E.164 format)
phone_verified: boolean           // Default: false
```

### New Table: TwoFactorBackupCode

```typescript
{
  id: string              // CUID
  userId: string          // Foreign key to User
  code: string            // MUST BE HASHED
  used: boolean           // Default: false
  usedAt: Date | null
  createdAt: Date
}
```

### New Enum: TwoFactorMethod

```typescript
enum TwoFactorMethod {
  SMS = 'SMS',
  AUTHENTICATOR = 'AUTHENTICATOR',
  BOTH = 'BOTH'
}
```

## Migration Commands

```bash
# Generate Prisma Client (already done)
npx prisma generate

# Apply migration (when ready)
npx prisma migrate deploy

# Rollback migration (if needed)
psql $DATABASE_URL < prisma/migrations/rollbacks/20251019000000_rollback_two_factor_authentication.sql
```

## Security Requirements

| Field | Security Method | Library Example |
|-------|----------------|-----------------|
| `two_factor_secret` | Encryption (reversible) | `crypto.createCipher()` or encryption lib |
| `phone_number` | Encryption (reversible) | `crypto.createCipher()` or encryption lib |
| `backup_code` | Hashing (one-way) | `bcrypt.hash()` (same as passwords) |

## Database Relationships

```
User (1) ──────> (Many) TwoFactorBackupCode
         ON DELETE CASCADE
```

## Indexes Created

- `users.two_factor_enabled` - Single column index
- `two_factor_backup_codes.userId` - Single column index  
- `two_factor_backup_codes(userId, used)` - Composite index

## Validation Rules

### Phone Number
- Format: E.164 international (e.g., `+12345678901`)
- Library: `libphonenumber-js`
- Must verify ownership before `phone_verified = true`

### Two-Factor Secret
- Format: Base32-encoded string
- Library: `otplib`, `speakeasy`, or `@otplib/preset-default`
- Length: Typically 32 characters

### Backup Codes
- Format: 8-10 alphanumeric characters
- Example: `X7K9-M2P4` or `A3B7C9D1E5`
- Count: 8-10 codes per user
- Generation: Crypto-secure random

## TypeScript Usage Examples

### Import Prisma Types

```typescript
import { TwoFactorMethod } from '@prisma/client';
```

### Query User with 2FA

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    twoFactorBackupCodes: {
      where: { used: false },
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

### Create Backup Codes

```typescript
await prisma.twoFactorBackupCode.createMany({
  data: backupCodes.map(code => ({
    userId,
    code: await bcrypt.hash(code, 12), // Hash before storing
  }))
});
```

### Enable 2FA

```typescript
await prisma.user.update({
  where: { id: userId },
  data: {
    two_factor_enabled: true,
    two_factor_secret: encryptedSecret, // Encrypt first!
    two_factor_verified_at: new Date(),
    preferred_2fa_method: TwoFactorMethod.AUTHENTICATOR
  }
});
```

### Verify Backup Code

```typescript
const backupCodes = await prisma.twoFactorBackupCode.findMany({
  where: { 
    userId,
    used: false 
  }
});

for (const storedCode of backupCodes) {
  const isValid = await bcrypt.compare(userInputCode, storedCode.code);
  if (isValid) {
    // Mark as used
    await prisma.twoFactorBackupCode.update({
      where: { id: storedCode.id },
      data: { 
        used: true,
        usedAt: new Date()
      }
    });
    break;
  }
}
```

## Environment Variables

No new environment variables are required for the schema itself. The encryption keys should use existing security infrastructure.

## Files Modified/Created

### Modified
- `prisma/schema.prisma` - Added User fields, TwoFactorBackupCode model, TwoFactorMethod enum

### Created
- `prisma/migrations/20251019000000_add_two_factor_authentication/migration.sql`
- `prisma/migrations/rollbacks/20251019000000_rollback_two_factor_authentication.sql`
- `docs/TWO_FACTOR_AUTHENTICATION_SCHEMA.md`
- `docs/TWO_FACTOR_AUTHENTICATION_QUICK_REFERENCE.md` (this file)

## Next Steps (Not Implemented)

This schema implementation does NOT include:
- Application logic for 2FA setup
- TOTP generation/verification services
- SMS sending functionality
- API endpoints for 2FA management
- UI components for 2FA configuration
- Authentication middleware updates

These will be implemented in subsequent phases.

---

**Schema Version:** 1.0.0  
**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete - Ready for application layer implementation
