-- Create storage_metrics table for tracking storage usage
-- Migration: add_storage_metrics_table

CREATE TABLE IF NOT EXISTS "storage_metrics" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "snapshot_date" TIMESTAMPTZ NOT NULL,
  "entity_type" TEXT NOT NULL, -- 'user', 'project', 'platform', 'brand'
  "entity_id" TEXT,
  "total_bytes" BIGINT NOT NULL DEFAULT 0,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "average_file_size" BIGINT NOT NULL DEFAULT 0,
  "largest_file_size" BIGINT NOT NULL DEFAULT 0,
  "largest_file_id" TEXT,
  "storage_trend_bps" INTEGER NOT NULL DEFAULT 0, -- basis points for growth rate
  "breakdown_by_type" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "storage_metrics_unique_snapshot" 
    UNIQUE ("snapshot_date", "entity_type", "entity_id")
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "storage_metrics_snapshot_date_idx" 
  ON "storage_metrics"("snapshot_date" DESC);

CREATE INDEX IF NOT EXISTS "storage_metrics_entity_idx" 
  ON "storage_metrics"("entity_type", "entity_id", "snapshot_date" DESC);

CREATE INDEX IF NOT EXISTS "storage_metrics_created_at_idx" 
  ON "storage_metrics"("created_at" DESC);

-- Create index for time-series queries
CREATE INDEX IF NOT EXISTS "storage_metrics_timeseries_idx"
  ON "storage_metrics"("entity_type", "entity_id", "snapshot_date" DESC)
  WHERE "entity_id" IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE "storage_metrics" IS 'Time-series storage usage metrics for capacity planning and reporting';
COMMENT ON COLUMN "storage_metrics"."entity_type" IS 'Type of entity: user, project, platform, brand';
COMMENT ON COLUMN "storage_metrics"."storage_trend_bps" IS 'Storage growth rate in basis points (10000 = 100% growth)';
COMMENT ON COLUMN "storage_metrics"."breakdown_by_type" IS 'Storage breakdown by asset type (IMAGE, VIDEO, etc.)';
