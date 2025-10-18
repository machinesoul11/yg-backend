-- Add search analytics tracking table
CREATE TABLE IF NOT EXISTS "search_analytics_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "query" TEXT NOT NULL,
  "entities" JSONB NOT NULL DEFAULT '[]',
  "filters" JSONB,
  "results_count" INTEGER NOT NULL DEFAULT 0,
  "execution_time_ms" INTEGER NOT NULL,
  "user_id" TEXT,
  "session_id" TEXT,
  "clicked_result_id" TEXT,
  "clicked_result_position" INTEGER,
  "clicked_result_entity_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "search_analytics_events_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS "search_analytics_events_query_idx" ON "search_analytics_events"("query");
CREATE INDEX IF NOT EXISTS "search_analytics_events_user_id_idx" ON "search_analytics_events"("user_id");
CREATE INDEX IF NOT EXISTS "search_analytics_events_created_at_idx" ON "search_analytics_events"("created_at");
CREATE INDEX IF NOT EXISTS "search_analytics_events_results_count_idx" ON "search_analytics_events"("results_count");
CREATE INDEX IF NOT EXISTS "search_analytics_events_clicked_result_idx" ON "search_analytics_events"("clicked_result_id");

-- Add comment
COMMENT ON TABLE "search_analytics_events" IS 'Tracks search queries for analytics and optimization';
