-- Performance Metrics Migration
-- Add performance tracking fields to posts table and create social shares table

-- Add performance metrics fields to posts table
ALTER TABLE posts 
ADD COLUMN avg_read_time_seconds DECIMAL(10,2) DEFAULT 0 NOT NULL,
ADD COLUMN bounce_rate DECIMAL(5,2) DEFAULT 0 NOT NULL,
ADD COLUMN social_shares_count INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN email_capture_count INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN email_capture_rate DECIMAL(5,2) DEFAULT 0 NOT NULL,
ADD COLUMN unique_visitors INTEGER DEFAULT 0 NOT NULL;

-- Create post social shares tracking table
CREATE TABLE post_social_shares (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  share_count INTEGER DEFAULT 0 NOT NULL,
  last_shared_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  CONSTRAINT unique_post_platform UNIQUE (post_id, platform)
);

-- Add performance metrics fields to daily metrics table
ALTER TABLE post_daily_metrics
ADD COLUMN email_captures INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN email_capture_rate DECIMAL(5,2) DEFAULT 0 NOT NULL,
ADD COLUMN social_share_breakdown JSONB DEFAULT '{}' NOT NULL;

-- Create indexes for performance
CREATE INDEX idx_posts_bounce_rate ON posts(bounce_rate);
CREATE INDEX idx_posts_social_shares_count ON posts(social_shares_count DESC);
CREATE INDEX idx_posts_email_capture_rate ON posts(email_capture_rate DESC);
CREATE INDEX idx_posts_avg_read_time ON posts(avg_read_time_seconds DESC);

CREATE INDEX idx_post_social_shares_post_id ON post_social_shares(post_id);
CREATE INDEX idx_post_social_shares_platform ON post_social_shares(platform);
CREATE INDEX idx_post_social_shares_count ON post_social_shares(share_count DESC);

CREATE INDEX idx_post_daily_metrics_email_captures ON post_daily_metrics(email_captures);
CREATE INDEX idx_post_daily_metrics_email_capture_rate ON post_daily_metrics(email_capture_rate);

-- Update existing posts with default values
UPDATE posts SET 
  avg_read_time_seconds = 0,
  bounce_rate = 0,
  social_shares_count = 0,
  email_capture_count = 0,
  email_capture_rate = 0,
  unique_visitors = view_count
WHERE avg_read_time_seconds IS NULL;
