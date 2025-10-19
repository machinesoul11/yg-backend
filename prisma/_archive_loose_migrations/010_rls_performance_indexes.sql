-- Row-Level Security Performance Indexes
-- Created: 2025
-- Purpose: Optimize RLS filter queries for data access control

-- ============================================================================
-- IP Assets
-- ============================================================================

-- Index for creator-based asset queries (assets created by user)
CREATE INDEX IF NOT EXISTS idx_ip_assets_created_by 
ON ip_assets(created_by) 
WHERE deleted_at IS NULL;

-- Index for creator ownership lookups with date filtering
CREATE INDEX IF NOT EXISTS idx_ip_ownerships_creator_dates 
ON ip_ownerships(creator_id, end_date) 
WHERE end_date IS NULL OR end_date > NOW();

-- Index for asset ownership lookups
CREATE INDEX IF NOT EXISTS idx_ip_ownerships_asset 
ON ip_ownerships(ip_asset_id, creator_id) 
WHERE end_date IS NULL OR end_date > NOW();

-- ============================================================================
-- Projects
-- ============================================================================

-- Index for brand-based project queries
CREATE INDEX IF NOT EXISTS idx_projects_brand_id 
ON projects(brand_id) 
WHERE deleted_at IS NULL;

-- Index for project status filtering
CREATE INDEX IF NOT EXISTS idx_projects_status 
ON projects(status, brand_id) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- Licenses
-- ============================================================================

-- Index for brand license queries
CREATE INDEX IF NOT EXISTS idx_licenses_brand_id 
ON licenses(brand_id) 
WHERE deleted_at IS NULL;

-- Index for asset-based license lookups (creators viewing their asset licenses)
CREATE INDEX IF NOT EXISTS idx_licenses_asset_id 
ON licenses(ip_asset_id, status) 
WHERE deleted_at IS NULL;

-- Index for project licenses
CREATE INDEX IF NOT EXISTS idx_licenses_project_id 
ON licenses(project_id) 
WHERE project_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- Royalty Statements (Creator-Only Access)
-- ============================================================================

-- Index for creator royalty statements
CREATE INDEX IF NOT EXISTS idx_royalty_statements_creator 
ON royalty_statements(creator_id, period_start) 
WHERE deleted_at IS NULL;

-- Index for statement status filtering
CREATE INDEX IF NOT EXISTS idx_royalty_statements_status 
ON royalty_statements(creator_id, status) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- Payouts (Creator-Only Access)
-- ============================================================================

-- Index for creator payouts
CREATE INDEX IF NOT EXISTS idx_payouts_creator 
ON payouts(creator_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for payout status filtering
CREATE INDEX IF NOT EXISTS idx_payouts_status 
ON payouts(creator_id, status) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- Brands
-- ============================================================================

-- Index for brand user lookups
CREATE INDEX IF NOT EXISTS idx_brands_user_id 
ON brands(user_id) 
WHERE deleted_at IS NULL;

-- Index for verified brands (public visibility)
CREATE INDEX IF NOT EXISTS idx_brands_verification_status 
ON brands(verification_status) 
WHERE deleted_at IS NULL AND verification_status = 'verified';

-- ============================================================================
-- Creators
-- ============================================================================

-- Index for creator user lookups
CREATE INDEX IF NOT EXISTS idx_creators_user_id 
ON creators(user_id) 
WHERE deleted_at IS NULL;

-- Index for verified creators (public visibility)
CREATE INDEX IF NOT EXISTS idx_creators_verification_status 
ON creators(verification_status) 
WHERE deleted_at IS NULL AND verification_status = 'approved';

-- ============================================================================
-- Multi-Column Composite Indexes
-- ============================================================================

-- Composite index for asset queries with multiple filters
CREATE INDEX IF NOT EXISTS idx_ip_assets_composite 
ON ip_assets(created_by, status, asset_type, created_at DESC) 
WHERE deleted_at IS NULL;

-- Composite index for project queries with status and dates
CREATE INDEX IF NOT EXISTS idx_projects_composite 
ON projects(brand_id, status, start_date, created_at DESC) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- Statistics and Comments
-- ============================================================================

COMMENT ON INDEX idx_ip_assets_created_by IS 
'Optimizes creator-owned asset queries in RLS filters';

COMMENT ON INDEX idx_ip_ownerships_creator_dates IS 
'Optimizes creator ownership lookups with active ownership date filtering';

COMMENT ON INDEX idx_projects_brand_id IS 
'Optimizes brand project isolation queries';

COMMENT ON INDEX idx_licenses_brand_id IS 
'Optimizes brand license queries';

COMMENT ON INDEX idx_licenses_asset_id IS 
'Optimizes creator license queries for their assets';

COMMENT ON INDEX idx_royalty_statements_creator IS 
'Optimizes creator royalty statement queries';

COMMENT ON INDEX idx_payouts_creator IS 
'Optimizes creator payout queries';

-- ============================================================================
-- Analyze tables to update statistics after index creation
-- ============================================================================

ANALYZE ip_assets;
ANALYZE ip_ownerships;
ANALYZE projects;
ANALYZE licenses;
ANALYZE royalty_statements;
ANALYZE payouts;
ANALYZE brands;
ANALYZE creators;
