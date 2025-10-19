-- ============================================================================
-- Rollback Script for Database Functions Migration (007)
-- Created: 2025-10-10
-- Purpose: Safely remove functions and triggers added in migration 007
-- ============================================================================

-- ============================================================================
-- 1. DROP TIMESTAMP UPDATE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_update_timestamp_users ON users;
DROP TRIGGER IF EXISTS trg_update_timestamp_creators ON creators;
DROP TRIGGER IF EXISTS trg_update_timestamp_brands ON brands;
DROP TRIGGER IF EXISTS trg_update_timestamp_projects ON projects;
DROP TRIGGER IF EXISTS trg_update_timestamp_ip_assets ON ip_assets;
DROP TRIGGER IF EXISTS trg_update_timestamp_ip_ownerships ON ip_ownerships;
DROP TRIGGER IF EXISTS trg_update_timestamp_licenses ON licenses;
DROP TRIGGER IF EXISTS trg_update_timestamp_royalty_runs ON royalty_runs;
DROP TRIGGER IF EXISTS trg_update_timestamp_royalty_statements ON royalty_statements;
DROP TRIGGER IF EXISTS trg_update_timestamp_payouts ON payouts;
DROP TRIGGER IF EXISTS trg_update_timestamp_daily_metrics ON daily_metrics;
DROP TRIGGER IF EXISTS trg_update_timestamp_email_preferences ON email_preferences;
DROP TRIGGER IF EXISTS trg_update_timestamp_feature_flags ON feature_flags;

-- ============================================================================
-- 2. DROP SOFT DELETE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_soft_delete_users ON users;
DROP TRIGGER IF EXISTS trg_soft_delete_creators ON creators;
DROP TRIGGER IF EXISTS trg_soft_delete_brands ON brands;
DROP TRIGGER IF EXISTS trg_soft_delete_projects ON projects;
DROP TRIGGER IF EXISTS trg_soft_delete_ip_assets ON ip_assets;
DROP TRIGGER IF EXISTS trg_soft_delete_licenses ON licenses;

-- ============================================================================
-- 3. DROP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS calculate_engagement_score(VARCHAR, TIMESTAMP, TIMESTAMP);
DROP FUNCTION IF EXISTS calculate_royalty(VARCHAR, INTEGER, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS soft_delete_handler();
DROP FUNCTION IF EXISTS hard_delete_record(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS check_orphaned_ownerships();
DROP FUNCTION IF EXISTS check_ownership_sum_violations();
DROP FUNCTION IF EXISTS check_license_date_conflicts();

-- ============================================================================
-- 4. DROP INDEXES CREATED IN MIGRATION 007
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_engagement_lookup;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_royalty_calc;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_ownerships_royalty_calc;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_soft_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_soft_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_soft_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_soft_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_soft_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_soft_deleted;

-- ============================================================================
-- Rollback Complete
-- ============================================================================
