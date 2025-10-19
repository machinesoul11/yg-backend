# Migration Notes: Two-Factor Authentication Schema

## Migration Information

**Migration Name:** `20251019000000_add_two_factor_authentication`  
**Date Created:** October 19, 2025  
**Status:** ✅ Ready to Apply  
**Type:** Schema Extension (Backward Compatible)

## What This Migration Does

This migration adds database support for Two-Factor Authentication (2FA) by:

1. Creating a new `TwoFactorMethod` enum with values: SMS, AUTHENTICATOR, BOTH
2. Adding 6 new fields to the `users` table for 2FA configuration
3. Creating a new `two_factor_backup_codes` table for recovery codes
4. Adding appropriate indexes for query optimization
5. Establishing foreign key relationships with cascade deletion

## Backward Compatibility

✅ **This migration is FULLY BACKWARD COMPATIBLE**

- All new fields are nullable or have default values
- Existing users will continue to function normally without any changes
- No data transformation or backfilling is required
- Existing authentication flows remain unaffected
- No breaking changes to existing API endpoints

## Pre-Deployment Checklist

Before applying this migration to production:

- [x] Schema validated (`npx prisma validate`) ✅
- [x] Prisma client generated (`npx prisma generate`) ✅
- [x] Migration SQL files created ✅
- [x] Rollback SQL file created ✅
- [x] Documentation created ✅
- [ ] Migration tested on development database
- [ ] Migration tested on staging database
- [ ] Performance impact assessed
- [ ] Backup created before deployment

## Applying the Migration

### Development Environment

```bash
# Apply the migration
npx prisma migrate dev

# Or manually with psql
psql $DATABASE_URL_DEVELOPMENT < prisma/migrations/20251019000000_add_two_factor_authentication/migration.sql
```

### Staging Environment

```bash
# Apply the migration
npx prisma migrate deploy

# Or manually with psql
psql $DATABASE_URL_STAGING < prisma/migrations/20251019000000_add_two_factor_authentication/migration.sql
```

### Production Environment

```bash
# 1. Create a backup
pg_dump $DATABASE_URL_PRODUCTION > backup_before_2fa_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply the migration
npx prisma migrate deploy

# Or manually with psql
psql $DATABASE_URL_PRODUCTION < prisma/migrations/20251019000000_add_two_factor_authentication/migration.sql

# 3. Verify the migration
psql $DATABASE_URL_PRODUCTION -c "\d users"
psql $DATABASE_URL_PRODUCTION -c "\d two_factor_backup_codes"
psql $DATABASE_URL_PRODUCTION -c "\dT TwoFactorMethod"
```

## Rollback Instructions

If you need to rollback this migration:

```bash
# Using the rollback SQL file
psql $DATABASE_URL < prisma/migrations/rollbacks/20251019000000_rollback_two_factor_authentication.sql

# Then update Prisma migration history
npx prisma migrate resolve --rolled-back 20251019000000_add_two_factor_authentication
```

⚠️ **Warning:** Rolling back will:
- Delete the `two_factor_backup_codes` table and all its data
- Remove the `TwoFactorMethod` enum
- Remove all 2FA-related fields from the `users` table
- **Permanently delete any 2FA configurations users have set up**

Only rollback if no users have enabled 2FA yet.

## Verification After Migration

Run these queries to verify the migration was successful:

```sql
-- Check that new columns exist in users table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN (
    'two_factor_enabled',
    'two_factor_secret',
    'two_factor_verified_at',
    'preferred_2fa_method',
    'phone_number',
    'phone_verified'
  );

-- Check that two_factor_backup_codes table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'two_factor_backup_codes';

-- Check that TwoFactorMethod enum exists
SELECT enumlabel 
FROM pg_enum 
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
WHERE pg_type.typname = 'TwoFactorMethod';

-- Check that indexes were created
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('users', 'two_factor_backup_codes')
  AND indexname LIKE '%two_factor%';

-- Count existing users (should be unchanged)
SELECT COUNT(*) as total_users FROM users;
```

## Performance Impact

**Expected Impact:** Minimal

- **Table Size Increase:** ~48 bytes per user record (6 new columns)
- **Index Overhead:** 3 new indexes (~small overhead on INSERT/UPDATE operations)
- **Query Performance:** Improved for 2FA-related queries due to new indexes

**Estimated Downtime:** None (for PostgreSQL ALTER TABLE ADD COLUMN with nullable/default)

## Database Statistics After Migration

Run these to gather statistics:

```sql
-- Analyze the users table
ANALYZE users;

-- Analyze the new table
ANALYZE two_factor_backup_codes;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('users', 'two_factor_backup_codes')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Known Issues

None at this time.

## Dependencies

- **Prisma Version:** 6.17.1 or higher
- **PostgreSQL Version:** 12 or higher (for ENUM support)
- **Node.js Version:** 18 or higher

## Next Steps After Migration

This migration only creates the database schema. To implement 2FA functionality:

1. **Encryption Service**: Create utilities for encrypting `two_factor_secret` and `phone_number`
2. **TOTP Service**: Implement TOTP generation/verification (use `otplib` or `speakeasy`)
3. **SMS Service**: Set up SMS provider for sending verification codes (Twilio, AWS SNS, etc.)
4. **Backup Code Service**: Implement backup code generation and verification
5. **API Endpoints**: Create tRPC/REST endpoints for:
   - Enable/disable 2FA
   - Generate QR code for authenticator apps
   - Verify 2FA setup
   - Verify 2FA codes during login
   - Generate/view backup codes
   - Verify phone number
6. **Authentication Middleware**: Update login flow to check for and verify 2FA
7. **UI Components**: Create admin/user interfaces for 2FA management

## Support

For questions or issues:
- See full documentation: `docs/TWO_FACTOR_AUTHENTICATION_SCHEMA.md`
- See quick reference: `docs/TWO_FACTOR_AUTHENTICATION_QUICK_REFERENCE.md`
- Check validation script: `src/scripts/validate-2fa-schema.ts`

---

**Migration Status:** ✅ Ready for deployment  
**Risk Level:** 🟢 Low (backward compatible, additive changes only)  
**Required Testing:** Standard QA testing of existing authentication flows
