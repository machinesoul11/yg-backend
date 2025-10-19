-- =====================================================
-- Database Performance Indexes
-- =====================================================
-- These indexes improve query performance for common operations
-- Run after initial migration or when performance degrades

-- =====================================================
-- User & Authentication Indexes
-- =====================================================

-- User lookups by email (login, password reset)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email 
ON users(email);

-- User lookups by role (admin queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role 
ON users(role) WHERE is_active = true;

-- Session lookups by token (authentication)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_token 
ON sessions(session_token);

-- Session cleanup by expiry
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires 
ON sessions(expires);

-- =====================================================
-- Talent (Creator) Indexes
-- =====================================================

-- Talent lookups by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_user_id 
ON talents(user_id);

-- Talent search by verification status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_verified 
ON talents(is_verified);

-- Talent performance ranking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_rating 
ON talents(rating DESC) WHERE is_verified = true;

-- Talent earnings tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_earnings 
ON talents(total_earnings DESC);

-- =====================================================
-- Brand (Client) Indexes
-- =====================================================

-- Brand lookups by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_user_id 
ON brands(user_id);

-- Brand verification status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_verified 
ON brands(is_verified);

-- Brand spending tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_spent 
ON brands(total_spent DESC);

-- =====================================================
-- Intellectual Property Indexes
-- =====================================================

-- IP lookups by talent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_talent_id 
ON intellectual_properties(talent_id) WHERE is_active = true;

-- IP search by type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_type 
ON intellectual_properties(type);

-- IP search by category
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_category 
ON intellectual_properties(category);

-- IP full-text search (PostgreSQL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_search 
ON intellectual_properties 
USING GIN (to_tsvector('english', name || ' ' || description));

-- IP files lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_files_ip_id 
ON ip_files(ip_id);

-- =====================================================
-- License Indexes
-- =====================================================

-- License lookups by talent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_talent_id 
ON licenses(talent_id);

-- License lookups by brand
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_brand_id 
ON licenses(brand_id);

-- License lookups by IP asset
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_ip_id 
ON licenses(ip_id);

-- License status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_status 
ON licenses(status);

-- Active licenses (date range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_dates 
ON licenses(start_date, end_date) WHERE status = 'ACTIVE';

-- License expiry tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_end_date 
ON licenses(end_date) WHERE status IN ('ACTIVE', 'PENDING');

-- License value tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_value 
ON licenses(total_value DESC);

-- =====================================================
-- Royalty Indexes
-- =====================================================

-- Royalty lookups by license
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_license_id 
ON royalties(license_id);

-- Royalty lookups by talent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_talent_id 
ON royalties(talent_id);

-- Royalty period queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_period 
ON royalties(period_start, period_end);

-- Pending royalties
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_status 
ON royalties(status) WHERE status = 'PENDING';

-- Royalty payment date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_paid_at 
ON royalties(paid_at) WHERE paid_at IS NOT NULL;

-- =====================================================
-- Payment Indexes
-- =====================================================

-- Payment lookups by brand
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_brand_id 
ON payments(brand_id);

-- Payment lookups by license
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_license_id 
ON payments(license_id) WHERE license_id IS NOT NULL;

-- Payment status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status 
ON payments(status);

-- Stripe payment tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_stripe_id 
ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Payment date queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_paid_at 
ON payments(paid_at) WHERE paid_at IS NOT NULL;

-- Failed payments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_failed 
ON payments(created_at DESC) WHERE status = 'FAILED';

-- =====================================================
-- Analytics Indexes
-- =====================================================

-- Analytics events by type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_type 
ON analytics_events(type);

-- Analytics events by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_user_id 
ON analytics_events(user_id) WHERE user_id IS NOT NULL;

-- Analytics events by timestamp (time-series queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_timestamp 
ON analytics_events(timestamp DESC);

-- Analytics events partitioning helper
-- (For future partitioning by date)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_timestamp_date 
ON analytics_events(DATE(timestamp));

-- =====================================================
-- Composite Indexes for Common Query Patterns
-- =====================================================

-- Talent licenses with status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_talent_status 
ON licenses(talent_id, status);

-- Brand licenses with status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licenses_brand_status 
ON licenses(brand_id, status);

-- Active royalties for talent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_royalties_talent_status 
ON royalties(talent_id, status);

-- Talent IP assets (active only)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ip_talent_active 
ON intellectual_properties(talent_id, is_active) WHERE is_active = true;

-- =====================================================
-- Maintenance & Monitoring
-- =====================================================

-- Check index usage
-- Run this query periodically to identify unused indexes:
-- SELECT 
--   schemaname || '.' || tablename as table,
--   indexname as index,
--   idx_scan as scans,
--   idx_tup_read as tuples
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan ASC;

-- Check index size
-- SELECT 
--   schemaname || '.' || tablename as table,
--   indexname as index,
--   pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================
-- Notes
-- =====================================================

-- 1. CONCURRENTLY: Allows index creation without locking the table
--    (May take longer, but doesn't block production queries)

-- 2. Partial Indexes: WHERE clauses reduce index size for filtered queries
--    (e.g., only index active licenses)

-- 3. GIN Indexes: Used for full-text search and array operations
--    (Slower to update, faster to query)

-- 4. Composite Indexes: Multiple columns for specific query patterns
--    (Order matters: most selective column first)

-- 5. Monitor regularly: Drop unused indexes to improve write performance
--    (Use pg_stat_user_indexes to track usage)
