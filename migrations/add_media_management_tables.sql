-- Add Media Management Tables
-- Internal staff media library for reusable assets

-- Media Items table (main media library)
CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('BRAND_ASSETS', 'MARKETING', 'TEMPLATES', 'STOCK', 'UI_ELEMENTS', 'OTHER')),
  tags JSONB DEFAULT '[]'::jsonb,
  storage_key TEXT UNIQUE NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  dimensions JSONB,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  usage_type TEXT NOT NULL DEFAULT 'INTERNAL' CHECK (usage_type IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')),
  download_count INTEGER DEFAULT 0,
  thumbnails JSONB DEFAULT '{}'::jsonb,
  cdn_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_media_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_media_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Media Collections table (organized groups of media)
CREATE TABLE media_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_collection_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Media Collection Items (many-to-many relationship)
CREATE TABLE media_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by TEXT NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_collection_item_collection FOREIGN KEY (collection_id) REFERENCES media_collections(id) ON DELETE CASCADE,
  CONSTRAINT fk_collection_item_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_collection_item_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Unique constraint to prevent duplicates
  UNIQUE(collection_id, media_id)
);

-- Media Usage Tracking (track where media is used)
CREATE TABLE media_usage_tracking (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  used_in_type TEXT NOT NULL, -- 'email_campaign', 'blog_post', 'landing_page', etc.
  used_in_id TEXT NOT NULL,
  used_by TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_usage_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_used_by FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX idx_media_items_category ON media_items(category);
CREATE INDEX idx_media_items_status ON media_items(status);
CREATE INDEX idx_media_items_usage_type ON media_items(usage_type);
CREATE INDEX idx_media_items_created_by ON media_items(created_by);
CREATE INDEX idx_media_items_created_at ON media_items(created_at);
CREATE INDEX idx_media_items_updated_at ON media_items(updated_at);
CREATE INDEX idx_media_items_download_count ON media_items(download_count);
CREATE INDEX idx_media_items_storage_key ON media_items(storage_key);

-- GIN index for tags search
CREATE INDEX idx_media_items_tags ON media_items USING GIN (tags);

-- Full-text search index for title and description
CREATE INDEX idx_media_items_search ON media_items USING GIN (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- Collection indexes
CREATE INDEX idx_media_collections_created_by ON media_collections(created_by);
CREATE INDEX idx_media_collections_created_at ON media_collections(created_at);

-- Collection items indexes
CREATE INDEX idx_collection_items_collection_id ON media_collection_items(collection_id);
CREATE INDEX idx_collection_items_media_id ON media_collection_items(media_id);
CREATE INDEX idx_collection_items_sort_order ON media_collection_items(collection_id, sort_order);

-- Usage tracking indexes
CREATE INDEX idx_usage_tracking_media_id ON media_usage_tracking(media_id);
CREATE INDEX idx_usage_tracking_used_in ON media_usage_tracking(used_in_type, used_in_id);
CREATE INDEX idx_usage_tracking_used_by ON media_usage_tracking(used_by);
CREATE INDEX idx_usage_tracking_used_at ON media_usage_tracking(used_at);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_media_items_updated_at 
  BEFORE UPDATE ON media_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_collections_updated_at 
  BEFORE UPDATE ON media_collections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
