-- =====================================================
-- ROLLBACK: Users & Authentication
-- =====================================================
-- Original Migration: 001_users_authentication.sql
-- Created: 2025-10-10
-- Author: Database Team
--
-- PURPOSE:
--   Removes authentication-related tables and fields
--
-- DATA LOSS WARNING:
--   This rollback will PERMANENTLY DELETE:
--   - [x] verification_tokens table and ALL data
--   - [x] password_reset_tokens table and ALL data
--   - [x] audit_events table and ALL data
--   - [x] password_hash column from users table
--   - [x] email_verified column from users table
--   - [x] deleted_at column from users table
--
-- PREREQUISITES:
--   - [ ] Database backup created
--   - [ ] Authentication system disabled
--   - [ ] Team notified
--
-- ESTIMATED DURATION: 1-2 minutes
-- =====================================================

BEGIN;

-- Drop tables first (in reverse order of foreign key dependencies)
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS verification_tokens CASCADE;

-- Drop indexes on users table
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_deleted_at;

-- Remove columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;

COMMIT;

-- =====================================================
-- Verification Queries
-- =====================================================
-- Verify tables were dropped:
-- SELECT tablename FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('verification_tokens', 'password_reset_tokens', 'audit_events');
-- Expected: 0 rows

-- Verify columns were removed from users:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'users' 
-- AND column_name IN ('password_hash', 'email_verified', 'deleted_at');
-- Expected: 0 rows

-- Verify users table still exists:
-- SELECT COUNT(*) FROM users;
-- Expected: Original user count
