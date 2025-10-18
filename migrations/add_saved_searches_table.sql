-- Add SavedSearch table for storing user's saved search queries
-- Migration: add_saved_searches_table
-- Date: 2025-01-XX

-- Create saved_searches table
CREATE TABLE IF NOT EXISTS saved_searches (
  id VARCHAR(30) PRIMARY KEY,
  user_id VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  search_query VARCHAR(200) NOT NULL,
  entities JSONB DEFAULT '[]'::jsonb NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Foreign key constraint
  CONSTRAINT fk_saved_searches_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at);

-- Add comment for documentation
COMMENT ON TABLE saved_searches IS 'Stores user saved search queries for quick access';
COMMENT ON COLUMN saved_searches.entities IS 'JSON array of entity types to search (assets, creators, projects, licenses)';
COMMENT ON COLUMN saved_searches.filters IS 'JSON object containing search filter parameters';
