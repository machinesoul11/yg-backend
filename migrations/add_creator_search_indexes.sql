-- Migration: Add Creator Search Indexes
-- Description: Optimized indexes for creator search functionality including full-text search,
--              composite indexes for filtered searches, and performance metrics sorting
-- Created: 2025-10-17

-- Add GIN index for JSONB specialties array search (already exists based on schema)
-- This supports efficient array_contains queries on specialties
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_specialties_gin 
ON creators USING GIN (specialties jsonb_path_ops);

-- Add GIN index for JSONB availability search
-- Supports filtering by availability.status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_availability_gin 
ON creators USING GIN (availability jsonb_path_ops);

-- Add GIN index for JSONB performanceMetrics
-- Supports sorting and filtering by performance metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_performance_metrics_gin 
ON creators USING GIN ("performanceMetrics" jsonb_path_ops);

-- Add composite index for common filter combinations
-- Supports filtering by verification status with date sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_verification_created 
ON creators ("verificationStatus", "createdAt" DESC) 
WHERE "deletedAt" IS NULL;

-- Add composite index for verified creators sorted by verification date
-- Optimizes searches for approved creators
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_approved_verified 
ON creators ("verifiedAt" DESC) 
WHERE "verificationStatus" = 'approved' AND "deletedAt" IS NULL;

-- Add full-text search index for stageName and bio
-- Note: PostgreSQL full-text search using tsvector
-- First, add a generated tsvector column
ALTER TABLE creators 
ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE("stageName", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(bio, '')), 'B')
) STORED;

-- Add GIN index on the tsvector column for fast full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_search_vector 
ON creators USING GIN (search_vector);

-- Add trigram indexes for fuzzy name matching (requires pg_trgm extension)
-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram index for stageName
-- Supports LIKE, ILIKE, and similarity queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stage_name_trgm 
ON creators USING GIN ("stageName" gin_trgm_ops);

-- Add GIN trigram index for bio
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_bio_trgm 
ON creators USING GIN (bio gin_trgm_ops);

-- Add composite index for onboarding status and verification status
-- Useful for admin filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_onboarding_verification 
ON creators ("onboardingStatus", "verificationStatus") 
WHERE "deletedAt" IS NULL;

-- Add index for Stripe account ID lookups
-- Already exists in schema but ensuring it's there
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_stripe_account 
ON creators ("stripeAccountId") 
WHERE "stripeAccountId" IS NOT NULL;

-- Add function to extract numeric performance metrics for efficient sorting
-- This allows us to create functional indexes on JSONB fields
CREATE OR REPLACE FUNCTION get_creator_total_collaborations(performance_metrics jsonb)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE((performance_metrics->>'totalCollaborations')::INTEGER, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_creator_total_revenue(performance_metrics jsonb)
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE((performance_metrics->>'totalRevenue')::NUMERIC, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_creator_average_rating(performance_metrics jsonb)
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE((performance_metrics->>'averageRating')::NUMERIC, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add functional indexes for performance metrics sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_total_collaborations 
ON creators (get_creator_total_collaborations("performanceMetrics") DESC) 
WHERE "deletedAt" IS NULL AND "verificationStatus" = 'approved';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_total_revenue 
ON creators (get_creator_total_revenue("performanceMetrics") DESC) 
WHERE "deletedAt" IS NULL AND "verificationStatus" = 'approved';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_average_rating 
ON creators (get_creator_average_rating("performanceMetrics") DESC) 
WHERE "deletedAt" IS NULL AND "verificationStatus" = 'approved';

-- Add comment for documentation
COMMENT ON INDEX idx_creators_specialties_gin IS 'GIN index for efficient JSONB array searches on creator specialties';
COMMENT ON INDEX idx_creators_availability_gin IS 'GIN index for filtering creators by availability status';
COMMENT ON INDEX idx_creators_performance_metrics_gin IS 'GIN index for performance metrics filtering and sorting';
COMMENT ON INDEX idx_creators_verification_created IS 'Composite index for verification status with creation date sorting';
COMMENT ON INDEX idx_creators_approved_verified IS 'Optimized index for approved creators sorted by verification date';
COMMENT ON INDEX idx_creators_search_vector IS 'Full-text search index for creator name and bio';
COMMENT ON INDEX idx_creators_stage_name_trgm IS 'Trigram index for fuzzy matching on creator stage names';
COMMENT ON INDEX idx_creators_bio_trgm IS 'Trigram index for fuzzy matching on creator bios';
COMMENT ON INDEX idx_creators_total_collaborations IS 'Functional index for sorting by total collaborations metric';
COMMENT ON INDEX idx_creators_total_revenue IS 'Functional index for sorting by total revenue metric';
COMMENT ON INDEX idx_creators_average_rating IS 'Functional index for sorting by average rating metric';

COMMENT ON FUNCTION get_creator_total_collaborations IS 'Extract totalCollaborations from performance_metrics JSONB for indexing';
COMMENT ON FUNCTION get_creator_total_revenue IS 'Extract totalRevenue from performance_metrics JSONB for indexing';
COMMENT ON FUNCTION get_creator_average_rating IS 'Extract averageRating from performance_metrics JSONB for indexing';

-- Analyze the table to update statistics
ANALYZE creators;
