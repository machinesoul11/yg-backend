-- =====================================================
-- ROLLBACK: Audit Entity Fields Migration
-- =====================================================
-- Original Migration: 20251010000000_add_audit_entity_fields
-- Created: 2025-10-10
-- Author: Database Team
--
-- PURPOSE:
--   Reverts the addition of entity tracking fields to audit_events table
--
-- DATA LOSS WARNING:
--   This rollback will:
--   - [ ] Remove entityType, entityId, and requestId columns from audit_events
--   - [ ] Drop indexes on these columns
--   - [ ] PRESERVE existing audit event data (other columns remain)
--
-- PREREQUISITES:
--   - [ ] Database backup created
--   - [ ] Migration marked as problematic
--   - [ ] Team notified
--
-- ESTIMATED DURATION: < 1 minute
-- =====================================================

BEGIN;

-- Drop indexes first
DROP INDEX IF EXISTS audit_events_entityType_entityId_idx;
DROP INDEX IF EXISTS audit_events_requestId_idx;

-- Remove new columns
ALTER TABLE audit_events DROP COLUMN IF EXISTS "entityType";
ALTER TABLE audit_events DROP COLUMN IF EXISTS "entityId";
ALTER TABLE audit_events DROP COLUMN IF EXISTS "requestId";

-- Note: timestamp column type change rollback (if needed)
-- ALTER TABLE audit_events ALTER COLUMN timestamp TYPE TIMESTAMP;

COMMIT;

-- =====================================================
-- Verification Queries
-- =====================================================
-- Verify columns were removed:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'audit_events' 
-- AND column_name IN ('entityType', 'entityId', 'requestId');
-- Expected: 0 rows

-- Verify indexes were dropped:
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'audit_events' 
-- AND indexname LIKE '%entity%';
-- Expected: 0 rows

-- Verify audit_events table still exists and has data:
-- SELECT COUNT(*) FROM audit_events;
-- Expected: Original row count
