-- Add database indexes for optimized IP asset search
-- Migration: add_asset_search_indexes
-- Date: 2025-01-XX

-- Enable pg_trgm extension for trigram matching (fuzzy search/autocomplete)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for fuzzy matching on title and description
CREATE INDEX IF NOT EXISTS idx_ip_assets_title_trgm 
  ON ip_assets USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ip_assets_description_trgm 
  ON ip_assets USING gin (description gin_trgm_ops);

-- Add GIN index for JSONB metadata field for efficient tag filtering
CREATE INDEX IF NOT EXISTS idx_ip_assets_metadata_tags 
  ON ip_assets USING gin ((metadata -> 'tags'));

-- Add composite indexes for common filter combinations
-- Status + Created Date (for filtering recent assets by status)
CREATE INDEX IF NOT EXISTS idx_ip_assets_status_created 
  ON ip_assets(status, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Type + Status + Created Date (for filtering by asset type and status)
CREATE INDEX IF NOT EXISTS idx_ip_assets_type_status_created 
  ON ip_assets(type, status, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Project + Status (for filtering assets in a project)
CREATE INDEX IF NOT EXISTS idx_ip_assets_project_status 
  ON ip_assets(project_id, status) 
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

-- Updated at index for sorting by last modified
CREATE INDEX IF NOT EXISTS idx_ip_assets_updated_at 
  ON ip_assets(updated_at DESC) 
  WHERE deleted_at IS NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_ip_assets_title_trgm IS 'Trigram index for fuzzy title search and autocomplete';
COMMENT ON INDEX idx_ip_assets_description_trgm IS 'Trigram index for fuzzy description search';
COMMENT ON INDEX idx_ip_assets_metadata_tags IS 'GIN index for efficient tag filtering in metadata JSONB field';
COMMENT ON INDEX idx_ip_assets_status_created IS 'Composite index for filtering by status and sorting by creation date';
COMMENT ON INDEX idx_ip_assets_type_status_created IS 'Composite index for filtering by type, status, and creation date';
COMMENT ON INDEX idx_ip_assets_project_status IS 'Composite index for filtering assets by project and status';
COMMENT ON INDEX idx_ip_assets_updated_at IS 'Index for sorting assets by last updated date';
