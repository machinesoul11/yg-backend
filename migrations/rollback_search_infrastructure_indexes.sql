-- ============================================================================
-- Rollback: Search Infrastructure - Database Indexes Migration
-- ============================================================================
-- Description: Removes all search-related indexes created by 
--              add_search_infrastructure_indexes.sql
-- Created: 2025-10-17
-- ============================================================================

BEGIN;

-- ============================================================================
-- Drop IP Assets Indexes
-- ============================================================================

-- Full-text search indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_title_fts;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_description_fts;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_combined_search;

-- JSONB indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_metadata_gin;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_metadata_gin_ops;

-- Composite indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_status_created_desc;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_type_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_project_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_creator_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_type_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_published_created;

-- Trigram indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_title_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_description_trgm;

-- Expression indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_title_lower;

-- Covering indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_ip_assets_search_covering;

-- ============================================================================
-- Drop Creator Indexes
-- ============================================================================

-- JSONB indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_specialties_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_social_links_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_preferences_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_availability_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_performance_metrics_gin;

-- Composite indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_verification_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_verification_onboarding_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_verification_verified_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_approved_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_pending_verification;

-- Trigram indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_stage_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_bio_trgm;

-- Expression indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_stage_name_lower;

-- Covering indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_search_covering;

-- ============================================================================
-- Note: Extensions are NOT dropped
-- ============================================================================
-- pg_trgm and unaccent extensions are left in place as they may be used
-- by other parts of the application. To drop them manually:
-- DROP EXTENSION IF EXISTS pg_trgm;
-- DROP EXTENSION IF EXISTS unaccent;

COMMIT;

-- Verify all indexes are dropped
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (
    indexname LIKE '%_fts' 
    OR indexname LIKE '%_trgm' 
    OR indexname LIKE '%_gin'
    OR indexname LIKE '%_covering'
  )
ORDER BY tablename, indexname;
