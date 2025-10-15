-- Add is_featured field to posts table for content discovery
-- Migration created: October 15, 2025
-- Purpose: Support featured posts for content discovery functionality

-- Add the is_featured column to posts table
ALTER TABLE posts 
ADD COLUMN is_featured BOOLEAN DEFAULT false NOT NULL;

-- Create index for efficient featured posts queries
CREATE INDEX idx_posts_featured_status_published 
ON posts(is_featured, status, published_at DESC) 
WHERE is_featured = true AND status = 'PUBLISHED';

-- Add comment for documentation
COMMENT ON COLUMN posts.is_featured IS 'Indicates if this post should be featured in content discovery endpoints';
