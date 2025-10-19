-- =====================================================
-- ROLLBACK: IP Ownership Constraint
-- =====================================================
-- Original Migration: add_ownership_constraint.sql
-- Created: 2025-10-10
-- Author: Database Team
--
-- PURPOSE:
--   Removes the constraint that ownership shares must sum to 10000 basis points
--
-- DATA LOSS WARNING:
--   This rollback will:
--   - [x] Remove ownership share sum constraint
--   - [ ] NO DATA LOSS - only removes validation
--
-- NOTE:
--   After rollback, invalid ownership distributions will be possible.
--   Application code should validate ownership shares.
--
-- PREREQUISITES:
--   - [ ] Database backup created
--   - [ ] Application validation in place
--   - [ ] Team notified
--
-- ESTIMATED DURATION: < 30 seconds
-- =====================================================

BEGIN;

-- Drop the ownership constraint
-- Note: Constraint name may vary, check actual constraint name first
ALTER TABLE ip_ownerships 
  DROP CONSTRAINT IF EXISTS check_ownership_shares_sum;

-- Drop any related triggers
DROP TRIGGER IF EXISTS validate_ownership_shares ON ip_ownerships;

-- Drop related functions
DROP FUNCTION IF EXISTS check_ownership_shares_sum();

COMMIT;

-- =====================================================
-- Verification Queries
-- =====================================================
-- Verify constraint was removed:
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'ip_ownerships' 
-- AND constraint_name LIKE '%ownership%';
-- Expected: Should not include check_ownership_shares_sum

-- Verify table still exists:
-- SELECT COUNT(*) FROM ip_ownerships;
-- Expected: Original row count
