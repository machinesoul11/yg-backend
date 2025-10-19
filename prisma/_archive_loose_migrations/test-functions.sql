-- ============================================================================
-- Database Functions Test Suite
-- ============================================================================
-- Run these tests after applying migrations 007 and 008
-- to verify all functions and triggers are working correctly
-- ============================================================================

-- ============================================================================
-- 1. TEST ENGAGEMENT SCORE CALCULATION
-- ============================================================================

\echo '================================================'
\echo 'Testing Engagement Score Calculation'
\echo '================================================'

-- Create test daily metrics data
INSERT INTO daily_metrics (
  date, 
  ip_asset_id, 
  views, 
  clicks, 
  conversions, 
  engagement_time, 
  unique_visitors
) VALUES 
  (CURRENT_DATE, 'test_asset_001', 100, 10, 2, 500, 80),
  (CURRENT_DATE - 1, 'test_asset_001', 150, 15, 3, 600, 120),
  (CURRENT_DATE - 2, 'test_asset_001', 200, 20, 5, 800, 150)
ON CONFLICT DO NOTHING;

-- Test the function
\echo 'Running engagement score calculation...'
SELECT * FROM calculate_engagement_score('test_asset_001');

-- Expected: engagement_score > 0, aggregated metrics

-- ============================================================================
-- 2. TEST ROYALTY CALCULATION
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Testing Royalty Calculation'
\echo '================================================'

-- Test calculation with known values
-- Expected: $1000 revenue, 50% rev share, 60% ownership = $300 royalty
\echo 'Testing royalty calculation with known values...'
\echo 'Revenue: $1000 (100000 cents)'
\echo 'License Rev Share: 50% (5000 bps)'
\echo 'Ownership Share: 60% (6000 bps)'
\echo 'Expected Royalty: $300 (30000 cents)'

-- Note: This will fail if test data doesn't exist, which is expected
-- Replace IDs with real ones from your database
SELECT 
  total_revenue_cents,
  license_rev_share_bps,
  creator_share_cents,
  ownership_share_bps,
  final_royalty_cents,
  calculation_breakdown->>'final_royalty_cents' as breakdown_royalty
FROM calculate_royalty(
  (SELECT id FROM licenses WHERE deleted_at IS NULL LIMIT 1),
  100000,
  (SELECT id FROM ip_assets WHERE deleted_at IS NULL LIMIT 1),
  (SELECT id FROM creators WHERE deleted_at IS NULL LIMIT 1)
) LIMIT 1;

-- ============================================================================
-- 3. TEST AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Testing Automatic Timestamp Updates'
\echo '================================================'

-- Create a test user
INSERT INTO users (id, email, role)
VALUES ('test_timestamp_user', 'test_timestamp@example.com', 'VIEWER')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Get initial timestamp
\echo 'Initial timestamp:'
SELECT id, email, updated_at FROM users WHERE id = 'test_timestamp_user';

-- Wait a moment
SELECT pg_sleep(1);

-- Update the user
UPDATE users SET name = 'Test User' WHERE id = 'test_timestamp_user';

-- Check if timestamp was updated
\echo 'After update timestamp (should be different):'
SELECT id, email, name, updated_at FROM users WHERE id = 'test_timestamp_user';

-- Cleanup
DELETE FROM users WHERE id = 'test_timestamp_user';

-- ============================================================================
-- 4. TEST SOFT DELETE SYSTEM
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Testing Soft Delete System'
\echo '================================================'

-- Create test user for soft delete
INSERT INTO users (id, email, role)
VALUES ('test_soft_delete', 'test_softdelete@example.com', 'VIEWER')
ON CONFLICT (id) DO UPDATE SET deleted_at = NULL;

\echo 'User before delete:'
SELECT id, email, deleted_at FROM users WHERE id = 'test_soft_delete';

-- Attempt to delete (should soft delete)
DELETE FROM users WHERE id = 'test_soft_delete';

\echo 'User after delete (deleted_at should be set):'
SELECT id, email, deleted_at FROM users WHERE id = 'test_soft_delete';

-- Restore the user
UPDATE users SET deleted_at = NULL WHERE id = 'test_soft_delete';

\echo 'User after restore (deleted_at should be NULL):'
SELECT id, email, deleted_at FROM users WHERE id = 'test_soft_delete';

-- Hard delete (cleanup)
SELECT hard_delete_record('users', 'test_soft_delete');

-- ============================================================================
-- 5. TEST DATA CONSISTENCY CHECKS
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Testing Data Consistency Checks'
\echo '================================================'

\echo 'Checking for orphaned ownerships...'
SELECT COUNT(*) as orphaned_count FROM check_orphaned_ownerships();

\echo 'Checking for ownership sum violations...'
SELECT COUNT(*) as violation_count FROM check_ownership_sum_violations();

\echo 'Checking for license date conflicts...'
SELECT COUNT(*) as conflict_count FROM check_license_date_conflicts();

-- ============================================================================
-- 6. TEST FULL-TEXT SEARCH
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Testing Full-Text Search'
\echo '================================================'

-- Test IP asset fuzzy search
\echo 'Testing fuzzy search on IP assets...'
SELECT COUNT(*) as search_results FROM fuzzy_search_ip_assets('test', 0.1, 10);

-- Test creator fuzzy search
\echo 'Testing fuzzy search on creators...'
SELECT COUNT(*) as search_results FROM fuzzy_search_creators('test', 0.1, 10);

-- Test brand fuzzy search
\echo 'Testing fuzzy search on brands...'
SELECT COUNT(*) as search_results FROM fuzzy_search_brands('test', 0.1, 10);

-- ============================================================================
-- 7. VERIFY INDEXES EXIST
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Verifying Search Indexes'
\echo '================================================'

\echo 'Full-text search indexes:'
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE indexname LIKE '%fulltext%'
ORDER BY tablename, indexname;

\echo ''
\echo 'Trigram indexes:'
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE indexname LIKE '%trgm%'
ORDER BY tablename, indexname;

-- ============================================================================
-- 8. VERIFY FUNCTIONS EXIST
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Verifying Database Functions'
\echo '================================================'

SELECT 
  p.proname as function_name,
  pg_get_function_result(p.oid) as return_type,
  p.pronargs as num_args
FROM pg_proc p
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN (
    'calculate_engagement_score',
    'calculate_royalty',
    'update_updated_at_column',
    'soft_delete_handler',
    'hard_delete_record',
    'check_orphaned_ownerships',
    'check_ownership_sum_violations',
    'check_license_date_conflicts',
    'fuzzy_search_ip_assets',
    'fuzzy_search_creators',
    'fuzzy_search_brands'
  )
ORDER BY p.proname;

-- ============================================================================
-- 9. VERIFY TRIGGERS EXIST
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Verifying Triggers'
\echo '================================================'

SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE 
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    WHEN tgtype & 4 = 4 THEN 'AFTER'
    ELSE 'UNKNOWN'
  END as timing,
  CASE 
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 8 = 8 THEN 'DELETE'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'MULTIPLE'
  END as event
FROM pg_trigger
WHERE tgname LIKE 'trg_%'
ORDER BY table_name, trigger_name;

-- ============================================================================
-- 10. PERFORMANCE CHECKS
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Performance Checks'
\echo '================================================'

\echo 'Database size:'
SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;

\echo ''
\echo 'Largest indexes:'
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;

-- ============================================================================
-- TEST SUMMARY
-- ============================================================================

\echo ''
\echo '================================================'
\echo 'Test Summary'
\echo '================================================'
\echo 'All tests completed!'
\echo ''
\echo 'If you see errors above related to missing test data,'
\echo 'that is expected. The key is that the functions exist'
\echo 'and can be called without syntax errors.'
\echo ''
\echo 'Review the output above to ensure:'
\echo '  ✓ All 11 functions exist'
\echo '  ✓ Triggers are created on appropriate tables'
\echo '  ✓ Full-text search indexes exist'
\echo '  ✓ Trigram indexes exist'
\echo '  ✓ Soft delete works correctly'
\echo '  ✓ Automatic timestamps update'
\echo ''

-- Cleanup test data
DELETE FROM daily_metrics WHERE ip_asset_id = 'test_asset_001';
