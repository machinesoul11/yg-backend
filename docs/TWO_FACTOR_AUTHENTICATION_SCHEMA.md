# Two-Factor Authentication Database Schema Implementation

## Overview

This document describes the database schema extensions implemented to support Two-Factor Authentication (2FA) in the YesGoddess backend system.

## Implementation Date

**Date:** October 19, 2025  
**Migration:** `20251019000000_add_two_factor_authentication`

## Schema Changes

### 1. User Model Additions

The following fields were added to the `User` model in `prisma/schema.prisma`:

```prisma
model User {
  // ... existing fields ...
  
  // Two-Factor Authentication Fields
  two_factor_enabled        Boolean                    @default(false)
  two_factor_secret         String?
  two_factor_verified_at    DateTime?
  preferred_2fa_method      TwoFactorMethod?
  phone_number              String?
  phone_verified            Boolean                    @default(false)
  
  // ... existing relations ...
  twoFactorBackupCodes      TwoFactorBackupCode[]
  
  // ... existing indexes ...
  @@index([two_factor_enabled])
}
```

#### Field Descriptions

| Field Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `two_factor_enabled` | Boolean | No | `false` | Indicates whether 2FA is enabled for the user. Defaults to false (opt-in). |
| `two_factor_secret` | String | Yes | `null` | Stores the TOTP secret for authenticator apps. **Must be encrypted at application layer before storage.** |
| `two_factor_verified_at` | DateTime | Yes | `null` | Timestamp of when the user successfully completed their first 2FA verification after enabling it. |
| `preferred_2fa_method` | TwoFactorMethod | Yes | `null` | User's preferred 2FA method (SMS, AUTHENTICATOR, or BOTH). |
| `phone_number` | String | Yes | `null` | User's phone number for SMS-based 2FA. **Must be encrypted at application layer before storage.** Should be stored in E.164 international format. |
| `phone_verified` | Boolean | No | `false` | Indicates whether the user has verified ownership of their phone number. |

### 2. TwoFactorBackupCode Model

A new model was created to store backup codes for account recovery:

```prisma
model TwoFactorBackupCode {
  id        String   @id @default(cuid())
  userId    String
  code      String
  used      Boolean  @default(false)
  usedAt    DateTime?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, used])
  @@map("two_factor_backup_codes")
}
```

#### Field Descriptions

| Field Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | String (CUID) | No | auto-generated | Primary key for the backup code record. |
| `userId` | String | No | - | Foreign key reference to the User model. |
| `code` | String | No | - | The backup code string. **Must be hashed before storage, never stored in plain text.** |
| `used` | Boolean | No | `false` | Indicates whether this backup code has been consumed. |
| `usedAt` | DateTime | Yes | `null` | Timestamp of when the backup code was used for authentication. |
| `createdAt` | DateTime | No | `now()` | Timestamp of when the backup code was generated. |

#### Relationships

- **Foreign Key:** `userId` → `users.id` with `ON DELETE CASCADE`
- **Indexes:**
  - Single index on `userId` for efficient lookup of all codes for a user
  - Composite index on `(userId, used)` for efficient queries of unused codes

### 3. TwoFactorMethod Enum

A new enum was created to define the available 2FA methods:

```prisma
enum TwoFactorMethod {
  SMS
  AUTHENTICATOR
  BOTH
}
```

#### Enum Values

| Value | Description |
|-------|-------------|
| `SMS` | User prefers SMS-based one-time codes sent to their verified phone number. |
| `AUTHENTICATOR` | User prefers TOTP codes from an authenticator app (Google Authenticator, Authy, etc.). |
| `BOTH` | User wants to use both SMS and authenticator methods for enhanced security. |

## Database Migration

### Migration Files

- **Up Migration:** `prisma/migrations/20251019000000_add_two_factor_authentication/migration.sql`
- **Rollback Migration:** `prisma/migrations/rollbacks/20251019000000_rollback_two_factor_authentication.sql`

### Migration SQL

The migration performs the following operations:

1. Creates the `TwoFactorMethod` enum type in PostgreSQL
2. Adds 6 new nullable/default fields to the `users` table
3. Creates the `two_factor_backup_codes` table with proper constraints
4. Creates indexes for performance optimization
5. Establishes foreign key relationship with cascade deletion

### Applying the Migration

To apply this migration to your database:

```bash
# Development environment
npx prisma migrate dev

# Production environment (after testing)
npx prisma migrate deploy
```

### Rolling Back the Migration

If you need to rollback this migration:

```bash
# Using the rollback SQL file
psql $DATABASE_URL < prisma/migrations/rollbacks/20251019000000_rollback_two_factor_authentication.sql
```

## Security Considerations

### Data Encryption Requirements

The following fields contain sensitive data and **MUST** be encrypted at the application layer before storage in the database:

1. **`two_factor_secret`**: Contains TOTP secrets that can be used to generate authentication codes. Should be encrypted using the same mechanism as passwords.

2. **`phone_number`**: Contains personally identifiable information (PII). Should be encrypted to protect user privacy.

3. **`TwoFactorBackupCode.code`**: Backup codes are equivalent to passwords and should be hashed using bcrypt or similar one-way hashing before storage.

### Implementation Notes

- **No Field-Level Encryption in Prisma**: This project does not use Prisma's field-level encryption or database-level encryption decorators. All encryption must be handled at the application service layer.

- **Hashing vs Encryption**:
  - `two_factor_secret`: Use **encryption** (reversible) since the secret needs to be retrieved to generate TOTP codes
  - `phone_number`: Use **encryption** (reversible) for display and SMS sending
  - Backup codes: Use **hashing** (one-way) since they only need to be verified, not retrieved

- **Existing Patterns**: Follow the same security patterns used for `password_hash` in the existing authentication system (see `src/lib/auth/password.ts`).

## Indexes Created

The following indexes were added for query optimization:

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| `users` | `users_two_factor_enabled_idx` | `two_factor_enabled` | Optimize queries filtering users by 2FA status |
| `two_factor_backup_codes` | `two_factor_backup_codes_userId_idx` | `userId` | Optimize lookup of all backup codes for a user |
| `two_factor_backup_codes` | `two_factor_backup_codes_userId_used_idx` | `userId, used` | Optimize queries for unused backup codes |

## Data Constraints

### Nullable Fields

All new User model fields are nullable to allow:
- Existing users to continue functioning without 2FA
- Gradual rollout of 2FA features
- Users to opt-in to 2FA when ready

### Default Values

| Field | Default | Reason |
|-------|---------|--------|
| `two_factor_enabled` | `false` | 2FA is opt-in, not mandatory |
| `phone_verified` | `false` | Phone verification must be explicit |
| `TwoFactorBackupCode.used` | `false` | New codes are unused by definition |

### Foreign Key Relationships

- `TwoFactorBackupCode.userId` → `User.id` with **CASCADE DELETE**
  - When a user is deleted, all their backup codes are automatically deleted
  - Prevents orphaned backup codes in the database

## Validation Requirements

### Application-Layer Validations

The following validations should be implemented at the application layer:

1. **Phone Number Validation**:
   - Must be in E.164 international format (e.g., +1234567890)
   - Validate using a library like `libphonenumber-js`
   - Verify phone number ownership before setting `phone_verified = true`

2. **Two-Factor Secret**:
   - Must be a valid base32-encoded TOTP secret
   - Generate using a library like `otplib` or `speakeasy`
   - Validate format before encryption and storage

3. **Backup Code Generation**:
   - Generate cryptographically secure random codes
   - Typical format: 8-10 alphanumeric characters (e.g., `X7K9-M2P4`)
   - Hash before storage
   - Generate 8-10 codes per user when 2FA is enabled

4. **Preferred 2FA Method**:
   - Cannot be set to `SMS` unless `phone_verified = true`
   - Cannot be set to `BOTH` unless both authenticator is set up AND phone is verified

## Future Enhancements

Potential schema additions for future phases:

- `two_factor_backup_codes_last_generated_at` on User model
- Rate limiting fields for 2FA attempts
- Trusted device tracking table
- 2FA setup completion timestamp
- SMS verification code table (temporary codes)

## Testing Checklist

Before deploying to production, verify:

- [ ] Migration applies cleanly to a development database
- [ ] Migration can be rolled back without data loss
- [ ] Prisma Client generates correctly (`npx prisma generate`)
- [ ] Schema validates without errors (`npx prisma validate`)
- [ ] Indexes are created and improve query performance
- [ ] Foreign key cascades work correctly (test user deletion)
- [ ] All nullable fields accept null values
- [ ] Default values are applied to new records
- [ ] Existing users are not affected by the changes
- [ ] TypeScript types are generated for the new enum

## Related Documentation

- Authentication Implementation: `docs/AUTH_IMPLEMENTATION.md`
- Password Features: `docs/modules/authentication/password-features.md`
- Backend Roadmap: `YesGoddess Ops - Backend & Admin Development Roadmap.md`

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-19 | GitHub Copilot | Initial schema implementation |

---

**Note:** This is a database schema implementation only. No application logic, API endpoints, or authentication flows have been created. Those will be implemented in subsequent phases of the 2FA rollout.
