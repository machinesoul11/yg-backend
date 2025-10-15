-- Add featured posts functionality
-- Created: October 15, 2025
-- Purpose: Add is_featured field to posts table for content discovery

-- Add is_featured column to posts table
ALTER TABLE posts 
ADD COLUMN is_featured BOOLEAN DEFAULT false NOT NULL;

-- Create index for featured posts queries
CREATE INDEX idx_posts_featured_status_published ON posts(is_featured, status, published_at DESC) 
WHERE is_featured = true AND status = 'PUBLISHED' AND deleted_at IS NULL;

-- Update some example posts to be featured (optional - for testing)
-- This can be removed in production
UPDATE posts 
SET is_featured = true 
WHERE status = 'PUBLISHED' 
  AND deleted_at IS NULL 
  AND published_at IS NOT NULL
  AND published_at <= NOW()
  AND id IN (
    SELECT id FROM posts 
    WHERE status = 'PUBLISHED' 
      AND deleted_at IS NULL 
      AND published_at IS NOT NULL
      AND published_at <= NOW()
    ORDER BY published_at DESC 
    LIMIT 3
  );
