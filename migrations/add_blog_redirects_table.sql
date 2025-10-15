-- Migration: Add blog redirects table for 301 redirect handling
-- Purpose: Store redirect mappings when blog post slugs are changed

CREATE TABLE IF NOT EXISTS blog_redirects (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_cuid(),
  source_path VARCHAR(600) NOT NULL,
  destination_path VARCHAR(600) NOT NULL,
  redirect_type SMALLINT NOT NULL DEFAULT 301,
  created_by VARCHAR(30) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  
  -- Foreign key to track who created the redirect
  CONSTRAINT fk_blog_redirects_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Unique constraint on source path to prevent duplicates
  CONSTRAINT uk_blog_redirects_source_path UNIQUE (source_path),
  
  -- Check constraint for valid redirect types (301, 302, etc.)
  CONSTRAINT ck_blog_redirects_type CHECK (redirect_type IN (301, 302, 307, 308))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_redirects_source_path ON blog_redirects(source_path);
CREATE INDEX IF NOT EXISTS idx_blog_redirects_active ON blog_redirects(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_blog_redirects_expires ON blog_redirects(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_redirects_created_at ON blog_redirects(created_at);

-- Add comment for documentation
COMMENT ON TABLE blog_redirects IS 'Stores redirect mappings for blog post slug changes and manual redirects';
COMMENT ON COLUMN blog_redirects.source_path IS 'Original URL path that should be redirected';
COMMENT ON COLUMN blog_redirects.destination_path IS 'Target URL path for the redirect';
COMMENT ON COLUMN blog_redirects.redirect_type IS 'HTTP status code for redirect (301=permanent, 302=temporary)';
COMMENT ON COLUMN blog_redirects.hit_count IS 'Number of times this redirect has been accessed';
COMMENT ON COLUMN blog_redirects.expires_at IS 'Optional expiration date for temporary redirects';
