-- =====================================================
-- ROLLBACK: System Tables
-- =====================================================
-- Original Migration: create_system_tables.sql
-- Created: 2025-10-10
-- Author: Database Team
--
-- PURPOSE:
--   Removes system tables (idempotency_keys, feature_flags, notifications)
--
-- DATA LOSS WARNING:
--   This rollback will PERMANENTLY DELETE:
--   - [x] idempotency_keys table and ALL data
--   - [x] feature_flags table and ALL data
--   - [x] notifications table and ALL data
--   - [x] NotificationType enum
--   - [x] NotificationPriority enum
--
-- PREREQUISITES:
--   - [ ] Database backup created
--   - [ ] No application code depends on these tables
--   - [ ] Team notified
--
-- ESTIMATED DURATION: < 1 minute
-- =====================================================

BEGIN;

-- Drop tables in reverse order of creation
-- Drop notifications first (has foreign key to users)
DROP TABLE IF EXISTS notifications CASCADE;

-- Drop feature_flags and idempotency_keys
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;

-- Drop enums (only if not used by other tables)
DROP TYPE IF EXISTS "NotificationType";
DROP TYPE IF EXISTS "NotificationPriority";

COMMIT;

-- =====================================================
-- Verification Queries
-- =====================================================
-- Verify tables were dropped:
-- SELECT tablename FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('idempotency_keys', 'feature_flags', 'notifications');
-- Expected: 0 rows

-- Verify enums were dropped:
-- SELECT typname FROM pg_type 
-- WHERE typname IN ('NotificationType', 'NotificationPriority');
-- Expected: 0 rows
