-- Rollback migration for two-factor authentication

-- DropForeignKey
ALTER TABLE "two_factor_backup_codes" DROP CONSTRAINT "two_factor_backup_codes_userId_fkey";

-- DropIndex: Remove indexes from two_factor_backup_codes
DROP INDEX IF EXISTS "two_factor_backup_codes_userId_used_idx";
DROP INDEX IF EXISTS "two_factor_backup_codes_userId_idx";

-- DropTable
DROP TABLE IF EXISTS "two_factor_backup_codes";

-- DropIndex: Remove index from users
DROP INDEX IF EXISTS "users_two_factor_enabled_idx";

-- AlterTable: Remove two-factor authentication fields from users table
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_verified";
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number";
ALTER TABLE "users" DROP COLUMN IF EXISTS "preferred_2fa_method";
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_verified_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_secret";
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_enabled";

-- DropEnum
DROP TYPE IF EXISTS "TwoFactorMethod";
