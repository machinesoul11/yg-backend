-- ============================================================================
-- Migration: Enhanced Search Indexes and Full-Text Search
-- Created: 2025-10-10
-- Purpose: Add full-text search capabilities, optimize analytics queries,
--          and create comprehensive indexes for all searchable fields
-- ============================================================================

-- ============================================================================
-- 1. ENABLE REQUIRED POSTGRESQL EXTENSIONS
-- ============================================================================

-- Enable pg_trgm for fuzzy text matching and trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent for accent-insensitive search (optional but recommended)
CREATE EXTENSION IF NOT EXISTS unaccent;

COMMENT ON EXTENSION pg_trgm IS 'Provides trigram matching for fuzzy text search and similarity operations';
COMMENT ON EXTENSION unaccent IS 'Removes accents from text for accent-insensitive search';

-- ============================================================================
-- 2. FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- IP Assets: Full-text search on title and description
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_fulltext 
ON ip_assets 
USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- IP Assets: Trigram index for fuzzy matching on title
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_title_trgm 
ON ip_assets 
USING GIN (title gin_trgm_ops);

-- Creators: Full-text search on stage name and bio
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_fulltext 
ON creators 
USING GIN (to_tsvector('english', COALESCE("stageName", '') || ' ' || COALESCE(bio, '')));

-- Creators: Trigram index for fuzzy matching on stage name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stagename_trgm 
ON creators 
USING GIN ("stageName" gin_trgm_ops);

-- Brands: Full-text search on company name and description
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_fulltext 
ON brands 
USING GIN (to_tsvector('english', COALESCE("companyName", '') || ' ' || COALESCE(description, '')));

-- Brands: Trigram index for fuzzy matching on company name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_companyname_trgm 
ON brands 
USING GIN ("companyName" gin_trgm_ops);

-- Projects: Full-text search on name and description
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_fulltext 
ON projects 
USING GIN (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')));

-- Projects: Trigram index for fuzzy matching on name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_name_trgm 
ON projects 
USING GIN (name gin_trgm_ops);

-- Users: Trigram index for fuzzy matching on name and email
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_trgm 
ON users 
USING GIN (name gin_trgm_ops)
WHERE name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm 
ON users 
USING GIN (email gin_trgm_ops);

-- ============================================================================
-- 3. JSONB FIELD INDEXES (for metadata, preferences, etc.)
-- ============================================================================

-- IP Assets: GIN index on metadata JSONB field
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_metadata 
ON ip_assets 
USING GIN (metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- Projects: GIN index on objectives and requirements
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_objectives 
ON projects 
USING GIN (objectives jsonb_path_ops)
WHERE objectives IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_requirements 
ON projects 
USING GIN (requirements jsonb_path_ops)
WHERE requirements IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_metadata 
ON projects 
USING GIN (metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- Creators: GIN index on specialties and preferences
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_specialties 
ON creators 
USING GIN (specialties jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_social_links 
ON creators 
USING GIN ("socialLinks" jsonb_path_ops)
WHERE "socialLinks" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_preferences 
ON creators 
USING GIN (preferences jsonb_path_ops)
WHERE preferences IS NOT NULL;

-- Events: GIN index on props_json for event property queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_props_json 
ON events 
USING GIN (props_json jsonb_path_ops);

-- Royalty Lines: GIN index on metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_lines_metadata 
ON royalty_lines 
USING GIN (metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- Licenses: GIN index on scope and metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_scope_json 
ON licenses 
USING GIN (scope_json jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_metadata 
ON licenses 
USING GIN (metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- Daily Metrics: GIN index on metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_metadata 
ON daily_metrics 
USING GIN (metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- ============================================================================
-- 4. COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- IP Assets: Composite index for common filtered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_status_type_created 
ON ip_assets (status, type, created_at DESC)
WHERE deleted_at IS NULL;

-- IP Assets: Composite index for project asset queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_project_status 
ON ip_assets (project_id, status, created_at DESC)
WHERE project_id IS NOT NULL AND deleted_at IS NULL;

-- IP Assets: Composite index for creator asset queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_creator_status 
ON ip_assets (created_by, status, created_at DESC)
WHERE deleted_at IS NULL;

-- Licenses: Composite index for active license queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_brand_status_dates 
ON licenses (brand_id, status, start_date, end_date)
WHERE deleted_at IS NULL;

-- Licenses: Composite index for asset license queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_asset_status_dates 
ON licenses (ip_asset_id, status, start_date, end_date)
WHERE deleted_at IS NULL;

-- Events: Composite index for analytics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_asset_type_occurred 
ON events (ip_asset_id, event_type, occurred_at DESC)
WHERE ip_asset_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_project_type_occurred 
ON events (project_id, event_type, occurred_at DESC)
WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_license_type_occurred 
ON events (license_id, event_type, occurred_at DESC)
WHERE license_id IS NOT NULL;

-- Daily Metrics: Composite indexes for aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_project_date_range 
ON daily_metrics (project_id, date DESC)
WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_asset_date_range 
ON daily_metrics (ip_asset_id, date DESC)
WHERE ip_asset_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_license_date_range 
ON daily_metrics (license_id, date DESC)
WHERE license_id IS NOT NULL;

-- Royalty Statements: Composite index for creator statement queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_statements_creator_status 
ON royalty_statements (creator_id, status, created_at DESC);

-- Royalty Lines: Composite index for statement line queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_lines_statement_license 
ON royalty_lines (royalty_statement_id, license_id, period_start);

-- Payouts: Composite index for creator payout history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_creator_status_created 
ON payouts (creator_id, status, created_at DESC);

-- IP Ownerships: Composite index for asset ownership queries (without NOW() predicate)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_ownerships_asset_dates 
ON ip_ownerships (ip_asset_id, start_date, end_date);

-- ============================================================================
-- 5. PARTIAL INDEXES FOR FILTERED QUERIES
-- ============================================================================

-- Active users only (not soft-deleted, active account)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active 
ON users (id, email, role)
WHERE deleted_at IS NULL AND "isActive" = true;

-- Verified creators only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_verified 
ON creators (id, "stageName", "verificationStatus")
WHERE "deletedAt" IS NULL AND "verificationStatus" = 'verified';

-- Verified brands only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_verified 
ON brands (id, "companyName", "verificationStatus")
WHERE "deletedAt" IS NULL AND "verificationStatus" = 'verified';

-- Published IP assets only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_published 
ON ip_assets (id, title, type, created_at DESC)
WHERE deleted_at IS NULL AND status = 'PUBLISHED';

-- Active licenses only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_active 
ON licenses (id, ip_asset_id, brand_id, end_date)
WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Active projects only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_active 
ON projects (id, "brandId", name, "createdAt" DESC)
WHERE "deletedAt" IS NULL AND status IN ('ACTIVE', 'IN_PROGRESS');

-- Pending payouts only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_pending 
ON payouts (id, creator_id, created_at)
WHERE status = 'PENDING';

-- Failed payouts (for retry processing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_failed 
ON payouts (id, creator_id, retry_count, last_retry_at)
WHERE status = 'FAILED';

-- Unread notifications only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread 
ON notifications (user_id, created_at DESC, priority)
WHERE read = false;

-- ============================================================================
-- 6. FOREIGN KEY INDEXES (for JOIN performance)
-- ============================================================================

-- Ensure all foreign key columns have indexes for efficient JOINs
-- Note: Many are already created by Prisma, but we verify critical ones

-- Events foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_actor_id 
ON events (actor_id)
WHERE actor_id IS NOT NULL;

-- Attribution event relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attribution_event_id 
ON attribution (event_id);

-- Notification user relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id 
ON notifications (user_id);

-- Email event user relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_events_user_id 
ON email_events ("userId")
WHERE "userId" IS NOT NULL;

-- Audit event user relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_user_id 
ON audit_events ("userId")
WHERE "userId" IS NOT NULL;

-- ============================================================================
-- 7. INDEXES FOR TIME-SERIES ANALYTICS QUERIES
-- ============================================================================

-- Events: Time-series queries by event type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_type_occurred_brin 
ON events (event_type, occurred_at)
WHERE occurred_at IS NOT NULL;

-- Daily Metrics: Time-series aggregation by date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_date_revenue 
ON daily_metrics (date, revenue_cents)
WHERE revenue_cents > 0;

-- Royalty Runs: Period-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_runs_period 
ON royalty_runs (period_start, period_end, status);

-- Royalty Lines: Period-based revenue queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_lines_period 
ON royalty_lines (period_start, period_end, revenue_cents);

-- Audit Events: Timestamp-based audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_timestamp_action 
ON audit_events (timestamp, action, "entityType");

-- Email Events: Timestamp-based email analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_events_sent_at 
ON email_events ("sentAt", "eventType")
WHERE "sentAt" IS NOT NULL;

-- ============================================================================
-- 8. EXPRESSION INDEXES (computed columns)
-- ============================================================================

-- IP Assets: Storage key domain extraction (for storage bucket queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_storage_bucket 
ON ip_assets (SUBSTRING(storage_key FROM '^[^/]+'))
WHERE storage_key IS NOT NULL;

-- Users: Case-insensitive email lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower 
ON users (LOWER(email));

-- Creators: Case-insensitive stage name lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stagename_lower 
ON creators (LOWER("stageName"));

-- Brands: Case-insensitive company name lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_companyname_lower 
ON brands (LOWER("companyName"));

-- ============================================================================
-- 9. COVERING INDEXES (include frequently accessed columns)
-- ============================================================================

-- IP Assets: Cover common SELECT columns to avoid table lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_assets_cover_search 
ON ip_assets (status, type, created_at DESC) 
INCLUDE (title, thumbnail_url, created_by)
WHERE deleted_at IS NULL;

-- Creators: Cover common profile columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_cover_profile 
ON creators ("verificationStatus") 
INCLUDE ("stageName", "userId")
WHERE "deletedAt" IS NULL;

-- Brands: Cover common profile columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_cover_profile 
ON brands ("verificationStatus") 
INCLUDE ("companyName", "userId", industry)
WHERE "deletedAt" IS NULL;

-- ============================================================================
-- 10. HELPER FUNCTIONS FOR SEARCH
-- ============================================================================

-- Function for fuzzy text search with similarity threshold
CREATE OR REPLACE FUNCTION fuzzy_search_ip_assets(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  description TEXT,
  similarity_score REAL,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ia.id::TEXT,
    ia.title::TEXT,
    ia.description::TEXT,
    GREATEST(
      similarity(ia.title, p_search_term),
      similarity(COALESCE(ia.description, ''), p_search_term)
    ) as similarity_score,
    ts_rank(
      to_tsvector('english', COALESCE(ia.title, '') || ' ' || COALESCE(ia.description, '')),
      plainto_tsquery('english', p_search_term)
    ) as rank
  FROM ip_assets ia
  WHERE ia.deleted_at IS NULL
    AND (
      similarity(ia.title, p_search_term) > p_similarity_threshold
      OR similarity(COALESCE(ia.description, ''), p_search_term) > p_similarity_threshold
      OR to_tsvector('english', COALESCE(ia.title, '') || ' ' || COALESCE(ia.description, '')) @@ plainto_tsquery('english', p_search_term)
    )
  ORDER BY 
    GREATEST(
      similarity(ia.title, p_search_term),
      similarity(COALESCE(ia.description, ''), p_search_term)
    ) DESC,
    rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fuzzy_search_ip_assets IS 'Performs fuzzy full-text search on IP assets using trigram similarity and PostgreSQL text search. Returns results ranked by relevance.';

-- Function for fuzzy creator search
CREATE OR REPLACE FUNCTION fuzzy_search_creators(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT,
  stage_name TEXT,
  bio TEXT,
  verification_status TEXT,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id::TEXT,
    c."stageName"::TEXT,
    c.bio::TEXT,
    c."verificationStatus"::TEXT,
    GREATEST(
      similarity(c."stageName", p_search_term),
      similarity(COALESCE(c.bio, ''), p_search_term)
    ) as similarity_score
  FROM creators c
  WHERE c."deletedAt" IS NULL
    AND (
      similarity(c."stageName", p_search_term) > p_similarity_threshold
      OR similarity(COALESCE(c.bio, ''), p_search_term) > p_similarity_threshold
      OR to_tsvector('english', COALESCE(c."stageName", '') || ' ' || COALESCE(c.bio, '')) @@ plainto_tsquery('english', p_search_term)
    )
  ORDER BY similarity_score DESC, c."stageName"
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fuzzy_search_creators IS 'Performs fuzzy search on creators by stage name and bio. Returns results ranked by similarity score.';

-- Function for fuzzy brand search
CREATE OR REPLACE FUNCTION fuzzy_search_brands(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT,
  company_name TEXT,
  description TEXT,
  industry TEXT,
  verification_status TEXT,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id::TEXT,
    b."companyName"::TEXT,
    b.description::TEXT,
    b.industry::TEXT,
    b."verificationStatus"::TEXT,
    GREATEST(
      similarity(b."companyName", p_search_term),
      similarity(COALESCE(b.description, ''), p_search_term)
    ) as similarity_score
  FROM brands b
  WHERE b."deletedAt" IS NULL
    AND (
      similarity(b."companyName", p_search_term) > p_similarity_threshold
      OR similarity(COALESCE(b.description, ''), p_search_term) > p_similarity_threshold
      OR to_tsvector('english', COALESCE(b."companyName", '') || ' ' || COALESCE(b.description, '')) @@ plainto_tsquery('english', p_search_term)
    )
  ORDER BY similarity_score DESC, b."companyName"
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fuzzy_search_brands IS 'Performs fuzzy search on brands by company name and description. Returns results ranked by similarity score.';

-- ============================================================================
-- 11. ANALYTICS OPTIMIZATION INDEXES
-- ============================================================================

-- Revenue analytics: sum by period
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_revenue_analytics 
ON daily_metrics (date, revenue_cents, project_id, ip_asset_id)
WHERE revenue_cents > 0;

-- Engagement analytics: views and conversions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_metrics_engagement_analytics 
ON daily_metrics (date, views, clicks, conversions, ip_asset_id)
WHERE ip_asset_id IS NOT NULL;

-- Event analytics: event type distribution (without date filter in predicate)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_analytics 
ON events (event_type, occurred_at, ip_asset_id, project_id);

-- License revenue tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_revenue_tracking 
ON licenses (status, start_date, end_date, rev_share_bps)
WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Royalty performance tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalty_lines_performance 
ON royalty_lines (ip_asset_id, period_start, period_end, revenue_cents, calculated_royalty_cents);

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of enhancements:
-- 1. Full-text search indexes with GIN on all searchable text fields
-- 2. Trigram indexes for fuzzy matching and similarity searches
-- 3. JSONB indexes for flexible metadata queries
-- 4. Composite indexes optimized for common query patterns
-- 5. Partial indexes for frequently filtered subsets
-- 6. Foreign key indexes for efficient JOINs
-- 7. Time-series indexes for analytics queries
-- 8. Expression indexes for computed lookups
-- 9. Covering indexes to reduce table lookups
-- 10. Search helper functions with ranking
-- 11. Analytics-optimized indexes for reporting
