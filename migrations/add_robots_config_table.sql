-- Migration: Add robots configuration table for dynamic robots.txt management
-- Purpose: Allow dynamic management of robots.txt content without code deployment

CREATE TABLE IF NOT EXISTS robots_config (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_cuid(),
  user_agent VARCHAR(100) NOT NULL DEFAULT '*',
  directive_type VARCHAR(20) NOT NULL, -- 'allow', 'disallow', 'crawl-delay', 'sitemap'
  path VARCHAR(500),
  value VARCHAR(500),
  priority INTEGER NOT NULL DEFAULT 0, -- Lower number = higher priority for ordering
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(30) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Foreign key to track who created/updated the rule
  CONSTRAINT fk_robots_config_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Check constraint for valid directive types
  CONSTRAINT ck_robots_directive_type CHECK (directive_type IN ('allow', 'disallow', 'crawl-delay', 'sitemap', 'host'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_robots_config_active ON robots_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_robots_config_priority ON robots_config(priority, user_agent);
CREATE INDEX IF NOT EXISTS idx_robots_config_user_agent ON robots_config(user_agent);

-- Insert default robots.txt rules
INSERT INTO robots_config (user_agent, directive_type, path, value, priority, created_by) VALUES
-- Allow all crawlers by default
('*', 'allow', '/', NULL, 100, (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)),
-- Block admin areas
('*', 'disallow', '/admin/', NULL, 200, (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)),
('*', 'disallow', '/portal/', NULL, 201, (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)),
('*', 'disallow', '/api/', NULL, 202, (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)),
-- Add sitemap reference (value will be dynamically generated)
('*', 'sitemap', NULL, '/api/blog/sitemap.xml', 300, (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1))
ON CONFLICT DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE robots_config IS 'Dynamic configuration for robots.txt file generation';
COMMENT ON COLUMN robots_config.directive_type IS 'Type of robots.txt directive (allow, disallow, crawl-delay, sitemap, host)';
COMMENT ON COLUMN robots_config.path IS 'Path for allow/disallow directives';
COMMENT ON COLUMN robots_config.value IS 'Value for directives that need one (crawl-delay, sitemap, host)';
COMMENT ON COLUMN robots_config.priority IS 'Order priority for directive output (lower = higher priority)';
