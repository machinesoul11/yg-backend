-- ============================================================================
-- Rollback Script for Search Indexes Migration (008)
-- Created: 2025-10-10
-- Purpose: Safely remove search indexes and functions added in migration 008
-- ============================================================================

-- ============================================================================
-- 1. DROP SEARCH FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS fuzzy_search_ip_assets(TEXT, REAL, INTEGER);
DROP FUNCTION IF EXISTS fuzzy_search_creators(TEXT, REAL, INTEGER);
DROP FUNCTION IF EXISTS fuzzy_search_brands(TEXT, REAL, INTEGER);

-- ============================================================================
-- 2. DROP FULL-TEXT SEARCH INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_fulltext;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_title_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_fulltext;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_stagename_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_fulltext;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_companyname_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_fulltext;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email_trgm;

-- ============================================================================
-- 3. DROP JSONB INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_metadata;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_objectives;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_requirements;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_metadata;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_specialties;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_social_links;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_preferences;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_props_json;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_lines_metadata;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_scope_json;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_metadata;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_metadata;

-- ============================================================================
-- 4. DROP COMPOSITE INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_status_type_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_project_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_creator_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_brand_status_dates;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_asset_status_dates;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_asset_type_occurred;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_project_type_occurred;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_license_type_occurred;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_project_date_range;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_asset_date_range;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_license_date_range;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_statements_creator_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_lines_statement_license;
DROP INDEX CONCURRENTLY IF EXISTS idx_payouts_creator_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_ownerships_asset_dates;

-- ============================================================================
-- 5. DROP PARTIAL INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_users_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_verified;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_verified;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_published;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_payouts_pending;
DROP INDEX CONCURRENTLY IF EXISTS idx_payouts_failed;
DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_unread;

-- ============================================================================
-- 6. DROP FOREIGN KEY INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_events_actor_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_attribution_event_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_email_events_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_events_user_id;

-- ============================================================================
-- 7. DROP TIME-SERIES INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_events_type_occurred_brin;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_date_revenue;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_runs_period;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_lines_period;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_events_timestamp_action;
DROP INDEX CONCURRENTLY IF EXISTS idx_email_events_sent_at;

-- ============================================================================
-- 8. DROP EXPRESSION INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_storage_bucket;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_stagename_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_companyname_lower;

-- ============================================================================
-- 9. DROP COVERING INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_cover_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_cover_profile;
DROP INDEX CONCURRENTLY IF EXISTS idx_brands_cover_profile;

-- ============================================================================
-- 10. DROP ANALYTICS INDEXES
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_revenue_analytics;
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_metrics_engagement_analytics;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_analytics;
DROP INDEX CONCURRENTLY IF EXISTS idx_licenses_revenue_tracking;
DROP INDEX CONCURRENTLY IF EXISTS idx_royalty_lines_performance;

-- ============================================================================
-- 11. DROP EXTENSIONS (OPTIONAL - Only if not used elsewhere)
-- ============================================================================

-- Note: Only drop these if they are not used by other parts of the application
-- DROP EXTENSION IF EXISTS pg_trgm;
-- DROP EXTENSION IF EXISTS unaccent;

-- ============================================================================
-- Rollback Complete
-- ============================================================================
