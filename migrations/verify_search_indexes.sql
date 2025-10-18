-- ============================================================================
-- Search Infrastructure - Index Verification Script
-- ============================================================================
-- Description: Verifies that all search infrastructure indexes were created
-- Usage: psql $DATABASE_URL -f migrations/verify_search_indexes.sql
-- ============================================================================

\echo '============================================================================'
\echo 'Search Infrastructure - Index Verification'
\echo '============================================================================'
\echo ''

-- Check if required extensions are enabled
\echo 'Checking PostgreSQL Extensions...'
SELECT 
  extname as "Extension",
  extversion as "Version",
  CASE WHEN extname IN ('pg_trgm', 'unaccent') 
    THEN '✓ Installed' 
    ELSE '✗ Missing' 
  END as "Status"
FROM pg_extension 
WHERE extname IN ('pg_trgm', 'unaccent')
ORDER BY extname;

\echo ''
\echo '============================================================================'

-- Count total indexes created
\echo 'Index Count Summary...'
SELECT 
  'IP Assets' as "Table",
  COUNT(*) as "Index Count"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND indexname LIKE 'idx_%'
UNION ALL
SELECT 
  'Creators' as "Table",
  COUNT(*) as "Index Count"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'creators'
  AND indexname LIKE 'idx_%';

\echo ''
\echo '============================================================================'

-- Verify IP Assets indexes
\echo 'IP Assets - Full-Text Search Indexes (Expected: 3)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND indexname LIKE '%_fts'
ORDER BY indexname;

\echo ''
\echo 'IP Assets - JSONB Indexes (Expected: 1)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND indexname LIKE '%_gin'
ORDER BY indexname;

\echo ''
\echo 'IP Assets - Composite Indexes (Expected: 6)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND (
    indexname LIKE '%_status_%'
    OR indexname LIKE '%_type_%'
    OR indexname LIKE '%_project_%'
    OR indexname LIKE '%_creator_%'
    OR indexname LIKE '%_published_%'
  )
ORDER BY indexname;

\echo ''
\echo 'IP Assets - Trigram Indexes (Expected: 2)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND indexname LIKE '%_trgm'
ORDER BY indexname;

\echo ''
\echo 'IP Assets - Expression & Covering Indexes (Expected: 2)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'ip_assets'
  AND (indexname LIKE '%_lower' OR indexname LIKE '%_covering')
ORDER BY indexname;

\echo ''
\echo '============================================================================'

-- Verify Creators indexes
\echo 'Creators - JSONB Indexes (Expected: 5)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'creators'
  AND indexname LIKE '%_gin'
ORDER BY indexname;

\echo ''
\echo 'Creators - Composite Indexes (Expected: 5)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'creators'
  AND (
    indexname LIKE '%_verification_%'
    OR indexname LIKE '%_approved_%'
    OR indexname LIKE '%_pending_%'
  )
ORDER BY indexname;

\echo ''
\echo 'Creators - Trigram Indexes (Expected: 2)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'creators'
  AND indexname LIKE '%_trgm'
ORDER BY indexname;

\echo ''
\echo 'Creators - Expression & Covering Indexes (Expected: 2)...'
SELECT 
  indexname as "Index Name",
  pg_size_pretty(pg_relation_size(indexname::regclass)) as "Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'creators'
  AND (indexname LIKE '%_lower' OR indexname LIKE '%_covering')
ORDER BY indexname;

\echo ''
\echo '============================================================================'

-- Total storage used by all search indexes
\echo 'Storage Summary...'
SELECT 
  'Total Search Indexes' as "Category",
  pg_size_pretty(SUM(pg_relation_size(indexname::regclass))) as "Total Size"
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (tablename = 'ip_assets' OR tablename = 'creators')
  AND (
    indexname LIKE '%_fts' 
    OR indexname LIKE '%_gin' 
    OR indexname LIKE '%_trgm'
    OR indexname LIKE '%_lower'
    OR indexname LIKE '%_covering'
    OR indexname LIKE '%_status_%'
    OR indexname LIKE '%_type_%'
    OR indexname LIKE '%_project_%'
    OR indexname LIKE '%_creator_%'
    OR indexname LIKE '%_verification_%'
    OR indexname LIKE '%_approved_%'
    OR indexname LIKE '%_pending_%'
    OR indexname LIKE '%_published_%'
  );

\echo ''
\echo '============================================================================'

-- Check index usage (only if pg_stat_statements is enabled)
\echo 'Index Usage Statistics (Top 10 by scans)...'
SELECT 
  schemaname || '.' || tablename as "Table",
  indexname as "Index Name",
  idx_scan as "Scans",
  idx_tup_read as "Tuples Read",
  idx_tup_fetch as "Tuples Fetched",
  pg_size_pretty(pg_relation_size(indexrelid)) as "Size"
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename = 'ip_assets' OR tablename = 'creators')
  AND indexname LIKE 'idx_%'
ORDER BY idx_scan DESC
LIMIT 10;

\echo ''
\echo '============================================================================'

-- Verification summary
\echo 'Verification Summary...'
WITH index_counts AS (
  SELECT 
    COUNT(*) FILTER (WHERE tablename = 'ip_assets') as ip_assets_count,
    COUNT(*) FILTER (WHERE tablename = 'creators') as creators_count
  FROM pg_indexes 
  WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
    AND (
      indexname LIKE '%_fts' 
      OR indexname LIKE '%_gin' 
      OR indexname LIKE '%_trgm'
      OR indexname LIKE '%_lower'
      OR indexname LIKE '%_covering'
      OR indexname LIKE '%_status_%'
      OR indexname LIKE '%_type_%'
      OR indexname LIKE '%_project_%'
      OR indexname LIKE '%_creator_%'
      OR indexname LIKE '%_verification_%'
      OR indexname LIKE '%_approved_%'
      OR indexname LIKE '%_pending_%'
      OR indexname LIKE '%_published_%'
    )
)
SELECT 
  'IP Assets Indexes' as "Item",
  ip_assets_count::text || ' / 14' as "Count",
  CASE 
    WHEN ip_assets_count >= 14 THEN '✓ Complete'
    ELSE '✗ Incomplete'
  END as "Status"
FROM index_counts
UNION ALL
SELECT 
  'Creators Indexes' as "Item",
  creators_count::text || ' / 14' as "Count",
  CASE 
    WHEN creators_count >= 14 THEN '✓ Complete'
    ELSE '✗ Incomplete'
  END as "Status"
FROM index_counts
UNION ALL
SELECT 
  'Total Indexes' as "Item",
  (ip_assets_count + creators_count)::text || ' / 28' as "Count",
  CASE 
    WHEN (ip_assets_count + creators_count) >= 28 THEN '✓ Complete'
    ELSE '✗ Incomplete'
  END as "Status"
FROM index_counts;

\echo ''
\echo '============================================================================'
\echo 'Verification Complete!'
\echo ''
\echo 'Expected: 28 total indexes (14 for ip_assets, 14 for creators)'
\echo 'Documentation: docs/infrastructure/database/SEARCH_INFRASTRUCTURE_INDEXES_IMPLEMENTATION.md'
\echo '============================================================================'
