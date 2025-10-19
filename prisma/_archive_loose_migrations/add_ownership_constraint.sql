-- Migration: Add IP Ownership Share Sum Constraint
-- Created: 2025-10-10
-- Purpose: Ensure ownership shares for each IP asset sum to exactly 10,000 basis points (100%)

-- ============================================================================
-- Database Constraint Function
-- ============================================================================

-- Function to check that active ownership shares sum to exactly 10,000 BPS
CREATE OR REPLACE FUNCTION check_ownership_shares_sum()
RETURNS TRIGGER AS $$
DECLARE
  total_bps INTEGER;
BEGIN
  -- Calculate sum of active ownerships for this asset
  SELECT COALESCE(SUM(share_bps), 0)
  INTO total_bps
  FROM ip_ownerships
  WHERE ip_asset_id = COALESCE(NEW.ip_asset_id, OLD.ip_asset_id)
    AND start_date <= NOW()
    AND (end_date IS NULL OR end_date > NOW());
  
  -- Enforce 10,000 BPS constraint
  IF total_bps != 10000 THEN
    RAISE EXCEPTION 'Ownership shares must sum to exactly 10000 basis points (100%%). Current sum: %', total_bps;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger on INSERT
DROP TRIGGER IF EXISTS ownership_shares_check_insert ON ip_ownerships;
CREATE TRIGGER ownership_shares_check_insert
  AFTER INSERT ON ip_ownerships
  FOR EACH ROW
  EXECUTE FUNCTION check_ownership_shares_sum();

-- Trigger on UPDATE
DROP TRIGGER IF EXISTS ownership_shares_check_update ON ip_ownerships;
CREATE TRIGGER ownership_shares_check_update
  AFTER UPDATE ON ip_ownerships
  FOR EACH ROW
  EXECUTE FUNCTION check_ownership_shares_sum();

-- Trigger on DELETE
DROP TRIGGER IF EXISTS ownership_shares_check_delete ON ip_ownerships;
CREATE TRIGGER ownership_shares_check_delete
  AFTER DELETE ON ip_ownerships
  FOR EACH ROW
  EXECUTE FUNCTION check_ownership_shares_sum();

-- ============================================================================
-- Performance Indexes
-- ============================================================================

-- Composite index for ownership queries (already created by Prisma, but ensuring)
CREATE INDEX IF NOT EXISTS idx_ip_ownership_active_lookup 
ON ip_ownerships (ip_asset_id, start_date, end_date)
WHERE end_date IS NULL OR end_date > NOW();

-- Partial index for active ownerships only
CREATE INDEX IF NOT EXISTS idx_ip_ownership_active_shares
ON ip_ownerships (ip_asset_id, share_bps)
WHERE start_date <= NOW() AND (end_date IS NULL OR end_date > NOW());

-- Index for creator asset lookups
CREATE INDEX IF NOT EXISTS idx_ip_ownership_creator_active
ON ip_ownerships (creator_id, start_date)
WHERE end_date IS NULL OR end_date > NOW();

COMMENT ON FUNCTION check_ownership_shares_sum IS 'Enforces that ownership shares for each IP asset sum to exactly 10,000 basis points (100%)';
COMMENT ON TABLE ip_ownerships IS 'Tracks intellectual property ownership splits - the cornerstone of YES GODDESS royalty calculations';
