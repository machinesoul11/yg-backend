-- ============================================================================
-- Search Infrastructure - Database Indexes Migration
-- ============================================================================
-- Description: Comprehensive indexing strategy for search functionality
-- Created: 2025-10-17
-- Purpose: Enable efficient full-text search, fuzzy matching, and filtered
--          searches on IP assets and creator profiles
-- ============================================================================
-- NOTE: This migration uses CREATE INDEX CONCURRENTLY which cannot run
--       inside a transaction block. Each statement is executed separately.
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable Required PostgreSQL Extensions
-- ============================================================================

-- Enable trigram matching extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent for accent-insensitive searches
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================================================
-- STEP 2: Full-Text Search Indexes for IP Assets
-- ============================================================================

-- Full-text search index on title field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_title_fts
ON ip_assets USING GIN (to_tsvector('english', title));

-- Full-text search index on description field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_description_fts
ON ip_assets USING GIN (to_tsvector('english', description));

-- Combined full-text search index (title + description) with weighted ranking
-- Title has weight 'A' (highest), description has weight 'B'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_combined_search
ON ip_assets USING GIN (
  (setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
   setweight(to_tsvector('english', COALESCE(description, '')), 'B'))
);

-- ============================================================================
-- STEP 3: GIN Indexes for JSONB Fields
-- ============================================================================

-- GIN index on ip_assets metadata JSONB field for efficient containment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_metadata_gin
ON ip_assets USING GIN (metadata jsonb_path_ops);

-- GIN index on creators specialties JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_specialties_gin
ON creators USING GIN (specialties jsonb_path_ops);

-- GIN index on creators socialLinks JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_social_links_gin
ON creators USING GIN ("socialLinks" jsonb_path_ops)
WHERE "socialLinks" IS NOT NULL;

-- GIN index on creators preferences JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_preferences_gin
ON creators USING GIN (preferences jsonb_path_ops)
WHERE preferences IS NOT NULL;

-- GIN index on creators availability JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_availability_gin
ON creators USING GIN (availability jsonb_path_ops)
WHERE availability IS NOT NULL;

-- GIN index on creators performanceMetrics JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_performance_metrics_gin
ON creators USING GIN ("performanceMetrics" jsonb_path_ops)
WHERE "performanceMetrics" IS NOT NULL;

-- ============================================================================
-- STEP 4: Composite Indexes for Filtered Searches
-- ============================================================================

-- IP Assets Composite Indexes

-- Index for filtering by status and sorting by creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_status_created
ON ip_assets (status, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for filtering by type and sorting by creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_type_created
ON ip_assets (type, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for project-based filtering with type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_project_type
ON ip_assets (project_id, type, created_at DESC)
WHERE deleted_at IS NULL AND project_id IS NOT NULL;

-- Index for creator-based filtering with status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_creator_status
ON ip_assets (created_by, status, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for active assets sorted by update time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_active_updated
ON ip_assets (updated_at DESC)
WHERE deleted_at IS NULL;

-- Index for published assets by creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_published
ON ip_assets (created_at DESC)
WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

-- Creator Profile Composite Indexes

-- Index for verified creators sorted by creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_verified_created
ON creators ("verificationStatus", "createdAt" DESC)
WHERE "deletedAt" IS NULL;

-- Index for creators by onboarding status and creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_onboarding_created
ON creators ("onboardingStatus", "createdAt" DESC)
WHERE "deletedAt" IS NULL;

-- Index for recently verified creators
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_verified_at
ON creators ("verifiedAt" DESC)
WHERE "verifiedAt" IS NOT NULL AND "deletedAt" IS NULL;

-- Index for approved verified creators (partial index for common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_approved_created
ON creators ("createdAt" DESC)
WHERE "verificationStatus" = 'approved' AND "deletedAt" IS NULL;

-- Index for pending verification creators
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_pending_created
ON creators ("createdAt" DESC)
WHERE "verificationStatus" = 'pending' AND "deletedAt" IS NULL;

-- ============================================================================
-- STEP 5: Trigram Indexes for Fuzzy Matching
-- ============================================================================

-- Trigram index on ip_assets title for fuzzy search and autocomplete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_title_trgm
ON ip_assets USING GIN (title gin_trgm_ops);

-- Trigram index on ip_assets description for fuzzy search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_description_trgm
ON ip_assets USING GIN (description gin_trgm_ops);

-- Trigram index on creators stageName for fuzzy search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stage_name_trgm
ON creators USING GIN ("stageName" gin_trgm_ops);

-- Trigram index on creators bio for fuzzy search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_bio_trgm
ON creators USING GIN (bio gin_trgm_ops)
WHERE bio IS NOT NULL;

-- ============================================================================
-- STEP 6: Case-Insensitive Search Indexes
-- ============================================================================

-- Case-insensitive index for exact title matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_title_lower
ON ip_assets (LOWER(title));

-- Case-insensitive index for exact stage name matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stage_name_lower
ON creators (LOWER("stageName"));

-- ============================================================================
-- STEP 7: Performance Optimization Indexes
-- ============================================================================

-- Index for counting active assets per creator
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_creator_count
ON ip_assets (created_by)
WHERE deleted_at IS NULL;

-- Index for searching active creators
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_active
ON creators ("createdAt" DESC, "verificationStatus")
WHERE "deletedAt" IS NULL;

-- ============================================================================
-- STEP 8: Analyze Tables
-- ============================================================================

-- Analyze tables to update query planner statistics
ANALYZE ip_assets;
ANALYZE creators;

-- ============================================================================
-- Performance Notes and Usage Examples
-- ============================================================================

-- Full-Text Search Example:
-- SELECT * FROM ip_assets 
-- WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('english', 'search & term');

-- Fuzzy Search Example (using trigram similarity):
-- SELECT * FROM ip_assets 
-- WHERE title % 'searchterm' 
-- ORDER BY similarity(title, 'searchterm') DESC;

-- JSONB Path Query Example:
-- SELECT * FROM ip_assets 
-- WHERE metadata @> '{"key": "value"}';

-- Composite Index Example:
-- SELECT * FROM ip_assets 
-- WHERE status = 'PUBLISHED' AND deleted_at IS NULL 
-- ORDER BY created_at DESC;

-- ============================================================================
-- Index Maintenance Guidelines
-- ============================================================================

-- 1. Monitor index usage:
--    SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
--    FROM pg_stat_user_indexes
--    WHERE tablename IN ('ip_assets', 'creators')
--    ORDER BY idx_scan;

-- 2. Reindex periodically to prevent bloat:
--    REINDEX INDEX CONCURRENTLY idx_name;

-- 3. Update statistics after large data changes:
--    ANALYZE ip_assets;
--    ANALYZE creators;

-- 4. Set trigram similarity threshold as needed:
--    SET pg_trgm.similarity_threshold = 0.3;
