-- ============================================================================
-- Rollback Migration: Remove Database Check Constraints
-- Created: 2025-10-10
-- Purpose: Rollback script for 006_add_check_constraints.sql
-- ============================================================================
-- 
-- This script removes all check constraints added by the forward migration.
-- Use this if issues are discovered after applying the constraints.
-- ============================================================================

-- ============================================================================
-- 1. Remove Fee and Monetary Amount Constraints
-- ============================================================================

ALTER TABLE licenses
DROP CONSTRAINT IF EXISTS fee_cents_non_negative;

ALTER TABLE payouts
DROP CONSTRAINT IF EXISTS payout_amount_non_negative;

ALTER TABLE royalty_runs
DROP CONSTRAINT IF EXISTS total_revenue_cents_non_negative;

ALTER TABLE royalty_runs
DROP CONSTRAINT IF EXISTS total_royalties_cents_non_negative;

ALTER TABLE royalty_statements
DROP CONSTRAINT IF EXISTS total_earnings_cents_non_negative;

ALTER TABLE royalty_lines
DROP CONSTRAINT IF EXISTS revenue_cents_non_negative;

ALTER TABLE royalty_lines
DROP CONSTRAINT IF EXISTS calculated_royalty_cents_non_negative;

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS revenue_cents_non_negative;

ALTER TABLE projects
DROP CONSTRAINT IF EXISTS budget_cents_non_negative;

-- ============================================================================
-- 2. Remove Basis Points (BPS) Range Constraints
-- ============================================================================

ALTER TABLE licenses
DROP CONSTRAINT IF EXISTS rev_share_bps_valid_range;

ALTER TABLE ip_ownerships
DROP CONSTRAINT IF EXISTS share_bps_valid_range;

ALTER TABLE royalty_lines
DROP CONSTRAINT IF EXISTS share_bps_valid_range;

ALTER TABLE feature_flags
DROP CONSTRAINT IF EXISTS rollout_percentage_valid_range;

-- ============================================================================
-- 3. Remove Date Range Validation Constraints
-- ============================================================================

ALTER TABLE licenses
DROP CONSTRAINT IF EXISTS license_end_after_start;

ALTER TABLE ip_ownerships
DROP CONSTRAINT IF EXISTS ownership_end_after_start;

ALTER TABLE royalty_runs
DROP CONSTRAINT IF EXISTS royalty_period_valid_range;

ALTER TABLE royalty_lines
DROP CONSTRAINT IF EXISTS royalty_line_period_valid;

ALTER TABLE projects
DROP CONSTRAINT IF EXISTS project_end_after_start;

-- ============================================================================
-- 4. Remove Status Enum Constraints
-- ============================================================================

ALTER TABLE creators
DROP CONSTRAINT IF EXISTS onboarding_status_valid;

ALTER TABLE creators
DROP CONSTRAINT IF EXISTS verification_status_valid;

ALTER TABLE brands
DROP CONSTRAINT IF EXISTS brand_verification_status_valid;

-- ============================================================================
-- 5. Remove Additional Business Logic Constraints
-- ============================================================================

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS views_non_negative;

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS clicks_non_negative;

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS conversions_non_negative;

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS unique_visitors_non_negative;

ALTER TABLE daily_metrics
DROP CONSTRAINT IF EXISTS engagement_time_non_negative;

ALTER TABLE payouts
DROP CONSTRAINT IF EXISTS retry_count_non_negative;

ALTER TABLE ip_assets
DROP CONSTRAINT IF EXISTS file_size_positive;

ALTER TABLE ip_assets
DROP CONSTRAINT IF EXISTS version_positive;

-- ============================================================================
-- Rollback complete
-- ============================================================================

-- Remove comments
COMMENT ON TABLE licenses IS NULL;
COMMENT ON TABLE payouts IS NULL;
COMMENT ON TABLE royalty_runs IS NULL;
COMMENT ON TABLE ip_ownerships IS NULL;

-- Note: Indexes created in the forward migration are left in place as they
-- improve query performance and don't cause harm even without constraints.
-- If you need to remove them:
-- DROP INDEX IF EXISTS idx_licenses_dates;
-- DROP INDEX IF EXISTS idx_royalty_runs_period;
-- DROP INDEX IF EXISTS idx_ip_ownerships_dates;
