-- Create file_relationships table for tracking asset relationships
-- Migration: add_file_relationships_table

CREATE TABLE IF NOT EXISTS "file_relationships" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "source_asset_id" TEXT NOT NULL,
  "target_asset_id" TEXT NOT NULL,
  "relationship_type" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at" TIMESTAMPTZ,
  
  CONSTRAINT "file_relationships_source_asset_fkey" 
    FOREIGN KEY ("source_asset_id") 
    REFERENCES "ip_assets"("id") 
    ON DELETE CASCADE,
    
  CONSTRAINT "file_relationships_target_asset_fkey" 
    FOREIGN KEY ("target_asset_id") 
    REFERENCES "ip_assets"("id") 
    ON DELETE CASCADE,
    
  CONSTRAINT "file_relationships_no_self_reference"
    CHECK ("source_asset_id" != "target_asset_id")
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "file_relationships_source_asset_id_idx" 
  ON "file_relationships"("source_asset_id");

CREATE INDEX IF NOT EXISTS "file_relationships_target_asset_id_idx" 
  ON "file_relationships"("target_asset_id");

CREATE INDEX IF NOT EXISTS "file_relationships_type_idx" 
  ON "file_relationships"("relationship_type");

CREATE INDEX IF NOT EXISTS "file_relationships_created_at_idx" 
  ON "file_relationships"("created_at");

CREATE INDEX IF NOT EXISTS "file_relationships_deleted_at_idx" 
  ON "file_relationships"("deleted_at") 
  WHERE "deleted_at" IS NOT NULL;

-- Composite index for finding specific relationships
CREATE UNIQUE INDEX IF NOT EXISTS "file_relationships_unique_active_idx"
  ON "file_relationships"("source_asset_id", "target_asset_id", "relationship_type")
  WHERE "deleted_at" IS NULL;

-- Add comment for documentation
COMMENT ON TABLE "file_relationships" IS 'Tracks relationships and dependencies between file assets';
COMMENT ON COLUMN "file_relationships"."relationship_type" IS 'Type of relationship: derived_from, cutdown_of, replacement_for, variation_of, component_of, references, transcoded_from, preview_of';
