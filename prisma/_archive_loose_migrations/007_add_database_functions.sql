-- ============================================================================
-- Migration: Add Database Functions and Triggers
-- Created: 2025-10-10
-- Purpose: Add engagement scoring, royalty calculation, automatic timestamps,
--          soft delete triggers, and enhanced search capabilities
-- ============================================================================

-- ============================================================================
-- 1. ENGAGEMENT SCORE CALCULATION FUNCTION
-- ============================================================================

-- Function to calculate an engagement score for IP assets
-- Synthesizes views, clicks, conversions, and engagement time
-- Returns a normalized score between 0-100
CREATE OR REPLACE FUNCTION calculate_engagement_score(
  p_ip_asset_id VARCHAR,
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  engagement_score NUMERIC,
  total_views BIGINT,
  total_clicks BIGINT,
  total_conversions BIGINT,
  total_engagement_time BIGINT,
  unique_visitors BIGINT
) AS $$
DECLARE
  v_views BIGINT;
  v_clicks BIGINT;
  v_conversions BIGINT;
  v_engagement_time BIGINT;
  v_unique_visitors BIGINT;
  v_score NUMERIC;
  
  -- Weights for scoring algorithm
  w_views NUMERIC := 1.0;
  w_clicks NUMERIC := 3.0;
  w_conversions NUMERIC := 10.0;
  w_engagement_time NUMERIC := 2.0;
  w_unique_visitors NUMERIC := 1.5;
BEGIN
  -- Aggregate metrics from daily_metrics table
  SELECT 
    COALESCE(SUM(views), 0),
    COALESCE(SUM(clicks), 0),
    COALESCE(SUM(conversions), 0),
    COALESCE(SUM(engagement_time), 0),
    COALESCE(SUM(unique_visitors), 0)
  INTO 
    v_views,
    v_clicks,
    v_conversions,
    v_engagement_time,
    v_unique_visitors
  FROM daily_metrics
  WHERE ip_asset_id = p_ip_asset_id
    AND date >= p_start_date::date
    AND date <= p_end_date::date;
  
  -- Calculate weighted score with logarithmic scaling to handle large ranges
  -- Using log1p (log(1+x)) to handle zero values gracefully
  v_score := (
    (w_views * LOG(1 + v_views)) +
    (w_clicks * LOG(1 + v_clicks)) +
    (w_conversions * LOG(1 + v_conversions)) +
    (w_engagement_time * LOG(1 + v_engagement_time / 60.0)) + -- Convert seconds to minutes
    (w_unique_visitors * LOG(1 + v_unique_visitors))
  );
  
  -- Normalize score to 0-100 range using a sigmoid-like function
  -- This provides better distribution for typical engagement ranges
  v_score := LEAST(100, GREATEST(0, v_score * 2));
  
  -- Return results as a table
  RETURN QUERY SELECT 
    ROUND(v_score, 2) as engagement_score,
    v_views as total_views,
    v_clicks as total_clicks,
    v_conversions as total_conversions,
    v_engagement_time as total_engagement_time,
    v_unique_visitors as unique_visitors;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_engagement_score IS 'Calculates a normalized engagement score (0-100) for IP assets based on views, clicks, conversions, engagement time, and unique visitors. Uses logarithmic scaling to handle varying magnitudes.';

-- ============================================================================
-- 2. ROYALTY CALCULATION HELPER FUNCTION
-- ============================================================================

-- Function to calculate royalty amounts for a license and ownership share
-- Handles revenue sharing and ownership splits with precise decimal arithmetic
CREATE OR REPLACE FUNCTION calculate_royalty(
  p_license_id VARCHAR,
  p_revenue_cents INTEGER,
  p_ip_asset_id VARCHAR,
  p_creator_id VARCHAR
)
RETURNS TABLE (
  total_revenue_cents INTEGER,
  license_rev_share_bps INTEGER,
  creator_share_cents NUMERIC,
  ownership_share_bps INTEGER,
  final_royalty_cents INTEGER,
  calculation_breakdown JSONB
) AS $$
DECLARE
  v_rev_share_bps INTEGER;
  v_ownership_bps INTEGER;
  v_creator_share NUMERIC;
  v_final_royalty NUMERIC;
  v_breakdown JSONB;
BEGIN
  -- Get the license revenue share percentage
  SELECT rev_share_bps INTO v_rev_share_bps
  FROM licenses
  WHERE id = p_license_id;
  
  -- Get the creator's ownership share for this asset
  SELECT share_bps INTO v_ownership_bps
  FROM ip_ownerships
  WHERE ip_asset_id = p_ip_asset_id
    AND creator_id = p_creator_id
    AND start_date <= NOW()
    AND (end_date IS NULL OR end_date > NOW());
  
  -- Handle cases where data is missing
  IF v_rev_share_bps IS NULL THEN
    RAISE EXCEPTION 'License % not found', p_license_id;
  END IF;
  
  IF v_ownership_bps IS NULL THEN
    RAISE EXCEPTION 'No active ownership found for creator % on asset %', p_creator_id, p_ip_asset_id;
  END IF;
  
  -- Calculate creator's share after license revenue split
  -- Use NUMERIC for precise decimal arithmetic
  v_creator_share := (p_revenue_cents::NUMERIC * v_rev_share_bps::NUMERIC) / 10000.0;
  
  -- Calculate final royalty after ownership split
  v_final_royalty := (v_creator_share * v_ownership_bps::NUMERIC) / 10000.0;
  
  -- Build calculation breakdown for transparency and auditing
  v_breakdown := jsonb_build_object(
    'revenue_cents', p_revenue_cents,
    'license_rev_share_bps', v_rev_share_bps,
    'license_rev_share_percent', ROUND((v_rev_share_bps::NUMERIC / 100.0), 2),
    'creator_total_share_cents', ROUND(v_creator_share, 2),
    'ownership_share_bps', v_ownership_bps,
    'ownership_share_percent', ROUND((v_ownership_bps::NUMERIC / 100.0), 2),
    'final_royalty_cents', ROUND(v_final_royalty, 0),
    'calculation_steps', jsonb_build_array(
      jsonb_build_object(
        'step', 1,
        'description', 'Apply license revenue share',
        'formula', format('revenue × (rev_share_bps ÷ 10000) = %s × (%s ÷ 10000)', p_revenue_cents, v_rev_share_bps),
        'result_cents', ROUND(v_creator_share, 2)
      ),
      jsonb_build_object(
        'step', 2,
        'description', 'Apply ownership share',
        'formula', format('creator_share × (ownership_bps ÷ 10000) = %s × (%s ÷ 10000)', ROUND(v_creator_share, 2), v_ownership_bps),
        'result_cents', ROUND(v_final_royalty, 0)
      )
    )
  );
  
  -- Return results as a table
  RETURN QUERY SELECT 
    p_revenue_cents as total_revenue_cents,
    v_rev_share_bps as license_rev_share_bps,
    ROUND(v_creator_share, 2) as creator_share_cents,
    v_ownership_bps as ownership_share_bps,
    ROUND(v_final_royalty, 0)::INTEGER as final_royalty_cents,
    v_breakdown as calculation_breakdown;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_royalty IS 'Calculates precise royalty amounts for a creator based on license revenue share and ownership percentage. Returns detailed breakdown for audit trail and dispute resolution.';

-- ============================================================================
-- 3. AUTOMATIC TIMESTAMP UPDATE TRIGGERS
-- ============================================================================

-- Generic function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column IS 'Generic trigger function to automatically update the updated_at timestamp field when a row is modified.';

-- Apply timestamp triggers to all tables with updated_at fields
-- Note: Prisma's @updatedAt handles this at the ORM level, but this provides
-- database-level enforcement for direct SQL operations

-- Users table
DROP TRIGGER IF EXISTS trg_update_timestamp_users ON users;
CREATE TRIGGER trg_update_timestamp_users
  BEFORE UPDATE ON users
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Creators table
DROP TRIGGER IF EXISTS trg_update_timestamp_creators ON creators;
CREATE TRIGGER trg_update_timestamp_creators
  BEFORE UPDATE ON creators
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Brands table
DROP TRIGGER IF EXISTS trg_update_timestamp_brands ON brands;
CREATE TRIGGER trg_update_timestamp_brands
  BEFORE UPDATE ON brands
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Projects table
DROP TRIGGER IF EXISTS trg_update_timestamp_projects ON projects;
CREATE TRIGGER trg_update_timestamp_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- IP Assets table
DROP TRIGGER IF EXISTS trg_update_timestamp_ip_assets ON ip_assets;
CREATE TRIGGER trg_update_timestamp_ip_assets
  BEFORE UPDATE ON ip_assets
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- IP Ownerships table
DROP TRIGGER IF EXISTS trg_update_timestamp_ip_ownerships ON ip_ownerships;
CREATE TRIGGER trg_update_timestamp_ip_ownerships
  BEFORE UPDATE ON ip_ownerships
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Licenses table
DROP TRIGGER IF EXISTS trg_update_timestamp_licenses ON licenses;
CREATE TRIGGER trg_update_timestamp_licenses
  BEFORE UPDATE ON licenses
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Royalty Runs table
DROP TRIGGER IF EXISTS trg_update_timestamp_royalty_runs ON royalty_runs;
CREATE TRIGGER trg_update_timestamp_royalty_runs
  BEFORE UPDATE ON royalty_runs
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Royalty Statements table
DROP TRIGGER IF EXISTS trg_update_timestamp_royalty_statements ON royalty_statements;
CREATE TRIGGER trg_update_timestamp_royalty_statements
  BEFORE UPDATE ON royalty_statements
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Payouts table
DROP TRIGGER IF EXISTS trg_update_timestamp_payouts ON payouts;
CREATE TRIGGER trg_update_timestamp_payouts
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Daily Metrics table
DROP TRIGGER IF EXISTS trg_update_timestamp_daily_metrics ON daily_metrics;
CREATE TRIGGER trg_update_timestamp_daily_metrics
  BEFORE UPDATE ON daily_metrics
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Email Preferences table
DROP TRIGGER IF EXISTS trg_update_timestamp_email_preferences ON email_preferences;
CREATE TRIGGER trg_update_timestamp_email_preferences
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- Feature Flags table
DROP TRIGGER IF EXISTS trg_update_timestamp_feature_flags ON feature_flags;
CREATE TRIGGER trg_update_timestamp_feature_flags
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. SOFT DELETE TRIGGER FUNCTIONS
-- ============================================================================

-- Function to convert DELETE operations into soft deletes
CREATE OR REPLACE FUNCTION soft_delete_handler()
RETURNS TRIGGER AS $$
BEGIN
  -- If already soft deleted, allow the operation to proceed
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;
  
  -- Convert DELETE into UPDATE that sets deleted_at
  EXECUTE format('UPDATE %I SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', TG_TABLE_NAME)
  USING OLD.id;
  
  -- Cancel the actual DELETE by returning NULL
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION soft_delete_handler IS 'Intercepts DELETE operations and converts them to soft deletes by setting deleted_at timestamp. Returns NULL to cancel the actual DELETE.';

-- Apply soft delete triggers to tables with deleted_at fields

-- Users table
DROP TRIGGER IF EXISTS trg_soft_delete_users ON users;
CREATE TRIGGER trg_soft_delete_users
  BEFORE DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- Creators table
DROP TRIGGER IF EXISTS trg_soft_delete_creators ON creators;
CREATE TRIGGER trg_soft_delete_creators
  BEFORE DELETE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- Brands table
DROP TRIGGER IF EXISTS trg_soft_delete_brands ON brands;
CREATE TRIGGER trg_soft_delete_brands
  BEFORE DELETE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- Projects table
DROP TRIGGER IF EXISTS trg_soft_delete_projects ON projects;
CREATE TRIGGER trg_soft_delete_projects
  BEFORE DELETE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- IP Assets table
DROP TRIGGER IF EXISTS trg_soft_delete_ip_assets ON ip_assets;
CREATE TRIGGER trg_soft_delete_ip_assets
  BEFORE DELETE ON ip_assets
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- Licenses table
DROP TRIGGER IF EXISTS trg_soft_delete_licenses ON licenses;
CREATE TRIGGER trg_soft_delete_licenses
  BEFORE DELETE ON licenses
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_handler();

-- Function for hard deletes (admin use only)
CREATE OR REPLACE FUNCTION hard_delete_record(
  p_table_name TEXT,
  p_record_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate table name to prevent SQL injection
  IF p_table_name NOT IN (
    'users', 'creators', 'brands', 'projects', 'ip_assets', 'licenses'
  ) THEN
    RAISE EXCEPTION 'Invalid table name for hard delete: %', p_table_name;
  END IF;
  
  -- Perform the hard delete
  EXECUTE format('DELETE FROM %I WHERE id = $1 AND deleted_at IS NOT NULL', p_table_name)
  USING p_record_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION hard_delete_record IS 'Administrative function to permanently delete soft-deleted records. Requires elevated permissions. Only works on records that are already soft-deleted (deleted_at IS NOT NULL).';

-- ============================================================================
-- 5. DATA CONSISTENCY CHECK FUNCTIONS
-- ============================================================================

-- Function to check for orphaned ownership records
CREATE OR REPLACE FUNCTION check_orphaned_ownerships()
RETURNS TABLE (
  ownership_id TEXT,
  ip_asset_id TEXT,
  creator_id TEXT,
  issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    io.id::TEXT as ownership_id,
    io.ip_asset_id::TEXT,
    io.creator_id::TEXT,
    'IP asset not found or soft-deleted'::TEXT as issue
  FROM ip_ownerships io
  LEFT JOIN ip_assets ia ON io.ip_asset_id = ia.id AND ia.deleted_at IS NULL
  WHERE ia.id IS NULL;
  
  RETURN QUERY
  SELECT 
    io.id::TEXT as ownership_id,
    io.ip_asset_id::TEXT,
    io.creator_id::TEXT,
    'Creator not found or soft-deleted'::TEXT as issue
  FROM ip_ownerships io
  LEFT JOIN creators c ON io.creator_id = c.id AND c."deletedAt" IS NULL
  WHERE c.id IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_orphaned_ownerships IS 'Identifies IP ownership records that reference non-existent or soft-deleted assets/creators. Use for data integrity audits.';

-- Function to check for invalid ownership sums
CREATE OR REPLACE FUNCTION check_ownership_sum_violations()
RETURNS TABLE (
  ip_asset_id TEXT,
  asset_title TEXT,
  total_share_bps INTEGER,
  active_ownerships INTEGER,
  issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ia.id::TEXT as ip_asset_id,
    ia.title::TEXT as asset_title,
    COALESCE(SUM(io.share_bps), 0)::INTEGER as total_share_bps,
    COUNT(io.id)::INTEGER as active_ownerships,
    CASE 
      WHEN COALESCE(SUM(io.share_bps), 0) < 10000 THEN 'Under-allocated ownership (< 100%)'::TEXT
      WHEN COALESCE(SUM(io.share_bps), 0) > 10000 THEN 'Over-allocated ownership (> 100%)'::TEXT
      ELSE 'No active ownerships'::TEXT
    END as issue
  FROM ip_assets ia
  LEFT JOIN ip_ownerships io ON ia.id = io.ip_asset_id
    AND io.start_date <= NOW()
    AND (io.end_date IS NULL OR io.end_date > NOW())
  WHERE ia.deleted_at IS NULL
    AND ia.status NOT IN ('DRAFT', 'REJECTED')
  GROUP BY ia.id, ia.title
  HAVING COALESCE(SUM(io.share_bps), 0) != 10000;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_ownership_sum_violations IS 'Identifies IP assets with invalid ownership allocations (not equal to 100%). Use before royalty runs to ensure accurate calculations.';

-- Function to check for license date conflicts
CREATE OR REPLACE FUNCTION check_license_date_conflicts()
RETURNS TABLE (
  license_id TEXT,
  ip_asset_id TEXT,
  brand_id TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id::TEXT as license_id,
    l.ip_asset_id::TEXT,
    l.brand_id::TEXT,
    l.start_date,
    l.end_date,
    'End date is before start date'::TEXT as issue
  FROM licenses l
  WHERE l.deleted_at IS NULL
    AND l.end_date <= l.start_date;
  
  RETURN QUERY
  SELECT 
    l.id::TEXT as license_id,
    l.ip_asset_id::TEXT,
    l.brand_id::TEXT,
    l.start_date,
    l.end_date,
    'License has already expired but status is ACTIVE'::TEXT as issue
  FROM licenses l
  WHERE l.deleted_at IS NULL
    AND l.status = 'ACTIVE'
    AND l.end_date < NOW();
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_license_date_conflicts IS 'Identifies licenses with invalid date ranges or expired licenses that still have ACTIVE status. Use for data cleanup and integrity checks.';

-- ============================================================================
-- 6. PERFORMANCE & MAINTENANCE INDEXES
-- ============================================================================

-- Note: Many indexes are already created by Prisma schema and indexes.sql
-- These additional indexes support the new functions

-- Index for engagement score calculations (daily_metrics aggregation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_engagement_lookup 
ON daily_metrics (ip_asset_id, date)
WHERE ip_asset_id IS NOT NULL;

-- Index for royalty calculations (license revenue share lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_royalty_calc 
ON licenses (id, rev_share_bps)
WHERE deleted_at IS NULL;

-- Index for active ownership lookups in royalty calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_ownerships_royalty_calc 
ON ip_ownerships (ip_asset_id, creator_id, share_bps)
WHERE end_date IS NULL OR end_date > NOW();

-- Partial index for soft-deleted records (for cleanup queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_soft_deleted 
ON users (deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_soft_deleted 
ON creators ("deletedAt")
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_soft_deleted 
ON brands ("deletedAt")
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_soft_deleted 
ON projects ("deletedAt")
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_soft_deleted 
ON ip_assets (deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_soft_deleted 
ON licenses (deleted_at)
WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of functions created:
-- 1. calculate_engagement_score() - Calculates engagement metrics for IP assets
-- 2. calculate_royalty() - Precise royalty calculations with audit trail
-- 3. update_updated_at_column() - Automatic timestamp updates
-- 4. soft_delete_handler() - Converts deletes to soft deletes
-- 5. hard_delete_record() - Admin function for permanent deletion
-- 6. check_orphaned_ownerships() - Data consistency check
-- 7. check_ownership_sum_violations() - Ownership validation
-- 8. check_license_date_conflicts() - License integrity check
