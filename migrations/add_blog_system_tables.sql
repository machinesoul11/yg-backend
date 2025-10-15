-- Blog System Database Schema Migration
-- Created: October 15, 2025
-- Purpose: Add blog content management system with hierarchical categories, 
--          revision tracking, full-text search, and SEO optimization

-- Create blog categories table first (no dependencies)
CREATE TABLE categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  parent_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create posts table
CREATE TABLE posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(600) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  excerpt VARCHAR(1000),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  featured_image_url TEXT,
  status VARCHAR(20) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED')),
  published_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  read_time_minutes INTEGER DEFAULT 0 NOT NULL CHECK (read_time_minutes >= 0),
  view_count INTEGER DEFAULT 0 NOT NULL CHECK (view_count >= 0),
  tags JSONB DEFAULT '[]' NOT NULL,
  seo_title VARCHAR(70),
  seo_description VARCHAR(160),
  seo_keywords TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create post revisions table for version history
CREATE TABLE post_revisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revision_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create indexes for performance optimization

-- Categories indexes
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_category_id);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_display_order ON categories(display_order);

-- Posts indexes for common query patterns
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_published_at ON posts(published_at DESC);
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_scheduled_for ON posts(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for efficient filtering
CREATE INDEX idx_posts_status_published_at ON posts(status, published_at DESC);
CREATE INDEX idx_posts_author_status ON posts(author_id, status);
CREATE INDEX idx_posts_category_status ON posts(category_id, status);

-- Full-text search indexes using PostgreSQL's built-in capabilities
CREATE INDEX idx_posts_content_search ON posts USING gin(to_tsvector('english', title || ' ' || content || ' ' || COALESCE(excerpt, '')));

-- JSONB index for tags
CREATE INDEX idx_posts_tags ON posts USING gin(tags);

-- Post revisions indexes
CREATE INDEX idx_post_revisions_post_id ON post_revisions(post_id);
CREATE INDEX idx_post_revisions_created_at ON post_revisions(created_at DESC);
CREATE INDEX idx_post_revisions_author_id ON post_revisions(author_id);

-- Create updated_at trigger function for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

-- Apply triggers to automatically update updated_at timestamps
CREATE TRIGGER trigger_categories_updated_at 
  BEFORE UPDATE ON categories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_posts_updated_at 
  BEFORE UPDATE ON posts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for blog tables to match project security patterns
-- Enable row level security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_revisions ENABLE ROW LEVEL SECURITY;

-- Categories policies - readable by all authenticated users, editable by admins only
CREATE POLICY "Categories are readable by authenticated users" 
  ON categories FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Categories are manageable by admins" 
  ON categories FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Posts policies - readable by all for published posts, full access for authors and admins
CREATE POLICY "Published posts are readable by all" 
  ON posts FOR SELECT 
  TO authenticated 
  USING (
    status = 'PUBLISHED' 
    AND published_at IS NOT NULL 
    AND deleted_at IS NULL
  );

CREATE POLICY "Authors can manage their own posts" 
  ON posts FOR ALL 
  TO authenticated 
  USING (author_id = auth.uid());

CREATE POLICY "Admins can manage all posts" 
  ON posts FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Post revisions policies - accessible to post authors and admins
CREATE POLICY "Post revisions readable by post authors and admins" 
  ON post_revisions FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_revisions.post_id 
      AND (posts.author_id = auth.uid() OR EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'ADMIN'
      ))
    )
  );

CREATE POLICY "Post revisions insertable by post authors and admins" 
  ON post_revisions FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_revisions.post_id 
      AND (posts.author_id = auth.uid() OR EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'ADMIN'
      ))
    )
  );

-- Add helpful comments for documentation
COMMENT ON TABLE categories IS 'Hierarchical blog categories with support for parent-child relationships';
COMMENT ON TABLE posts IS 'Blog posts with full content management, SEO optimization, and revision tracking';
COMMENT ON TABLE post_revisions IS 'Complete revision history for blog posts with author tracking';

COMMENT ON COLUMN posts.slug IS 'URL-friendly identifier, must be unique across all posts';
COMMENT ON COLUMN posts.tags IS 'JSONB array of tag strings for flexible categorization';
COMMENT ON COLUMN posts.read_time_minutes IS 'Estimated reading time calculated from word count';
COMMENT ON COLUMN posts.seo_title IS 'Custom SEO title, falls back to title if not provided';
COMMENT ON COLUMN categories.parent_category_id IS 'Self-referencing foreign key for hierarchical categories';
COMMENT ON COLUMN categories.display_order IS 'Manual sorting order for category display';
