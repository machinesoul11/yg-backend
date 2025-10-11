# Database Functions and Search Capabilities

This document provides comprehensive documentation for all database functions, triggers, and search capabilities implemented in the YesGoddess backend.

## Table of Contents

1. [Overview](#overview)
2. [Engagement Score Calculation](#engagement-score-calculation)
3. [Royalty Calculation](#royalty-calculation)
4. [Automatic Timestamp Updates](#automatic-timestamp-updates)
5. [Soft Delete System](#soft-delete-system)
6. [Data Consistency Checks](#data-consistency-checks)
7. [Full-Text Search](#full-text-search)
8. [Search Indexes](#search-indexes)
9. [Analytics Optimization](#analytics-optimization)
10. [Usage Examples](#usage-examples)

## Overview

The database includes several PostgreSQL functions and triggers that enforce business logic, maintain data integrity, and optimize query performance. These work alongside Prisma ORM to provide a robust data layer.

### Migration Files

- `007_add_database_functions.sql` - Core functions and triggers
- `008_add_search_indexes.sql` - Full-text search and indexing
- `add_ownership_constraint.sql` - Ownership share validation (already existed)
- `006_add_check_constraints.sql` - Check constraints (already existed)

## Engagement Score Calculation

### Function: `calculate_engagement_score`

Calculates a normalized engagement score (0-100) for IP assets based on various metrics.

#### Signature

```sql
calculate_engagement_score(
  p_ip_asset_id VARCHAR,
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP DEFAULT NOW()
)
```

#### Returns

| Column | Type | Description |
|--------|------|-------------|
| engagement_score | NUMERIC | Normalized score 0-100 |
| total_views | BIGINT | Total view count |
| total_clicks | BIGINT | Total click count |
| total_conversions | BIGINT | Total conversions |
| total_engagement_time | BIGINT | Total time in seconds |
| unique_visitors | BIGINT | Unique visitor count |

#### Scoring Algorithm

The function uses weighted logarithmic scoring:

- **Views**: Weight 1.0
- **Clicks**: Weight 3.0
- **Conversions**: Weight 10.0
- **Engagement Time**: Weight 2.0 (minutes)
- **Unique Visitors**: Weight 1.5

Logarithmic scaling (`LOG(1 + x)`) handles varying magnitudes gracefully and prevents outliers from dominating the score.

#### Usage Example

```typescript
// TypeScript/Prisma Raw Query
const result = await prisma.$queryRaw`
  SELECT * FROM calculate_engagement_score(
    ${ipAssetId},
    ${startDate}::timestamp,
    ${endDate}::timestamp
  )
`;

// Returns:
// {
//   engagement_score: 67.45,
//   total_views: 1250,
//   total_clicks: 89,
//   total_conversions: 12,
//   total_engagement_time: 18540,
//   unique_visitors: 856
// }
```

## Royalty Calculation

### Function: `calculate_royalty`

Calculates precise royalty amounts with detailed breakdown for audit trails.

#### Signature

```sql
calculate_royalty(
  p_license_id VARCHAR,
  p_revenue_cents INTEGER,
  p_ip_asset_id VARCHAR,
  p_creator_id VARCHAR
)
```

#### Returns

| Column | Type | Description |
|--------|------|-------------|
| total_revenue_cents | INTEGER | Original revenue amount |
| license_rev_share_bps | INTEGER | License revenue share (0-10000) |
| creator_share_cents | NUMERIC | Creator's share after license split |
| ownership_share_bps | INTEGER | Creator's ownership % (0-10000) |
| final_royalty_cents | INTEGER | Final royalty amount |
| calculation_breakdown | JSONB | Detailed calculation steps |

#### Calculation Steps

1. **License Revenue Share**: `revenue × (rev_share_bps ÷ 10000)`
2. **Ownership Split**: `creator_share × (ownership_bps ÷ 10000)`

Uses `NUMERIC` type for precise decimal arithmetic to avoid floating-point errors.

#### Usage Example

```typescript
const royalty = await prisma.$queryRaw`
  SELECT * FROM calculate_royalty(
    ${licenseId},
    ${revenueCents},
    ${ipAssetId},
    ${creatorId}
  )
`;

// Returns:
// {
//   total_revenue_cents: 100000,
//   license_rev_share_bps: 5000,
//   creator_share_cents: 50000.00,
//   ownership_share_bps: 6000,
//   final_royalty_cents: 30000,
//   calculation_breakdown: {
//     revenue_cents: 100000,
//     license_rev_share_bps: 5000,
//     license_rev_share_percent: 50.00,
//     creator_total_share_cents: 50000.00,
//     ownership_share_bps: 6000,
//     ownership_share_percent: 60.00,
//     final_royalty_cents: 30000,
//     calculation_steps: [...]
//   }
// }
```

## Automatic Timestamp Updates

### Function: `update_updated_at_column`

Automatically updates `updated_at` timestamp when rows are modified.

#### Applied To

- users
- creators
- brands
- projects
- ip_assets
- ip_ownerships
- licenses
- royalty_runs
- royalty_statements
- payouts
- daily_metrics
- email_preferences
- feature_flags

#### Behavior

- Triggers **BEFORE UPDATE**
- Only fires when actual data changes occur (`OLD IS DISTINCT FROM NEW`)
- Complements Prisma's `@updatedAt` directive
- Ensures database-level enforcement for direct SQL operations

#### Notes

- **No action required** - triggers work automatically
- Does not interfere with Prisma's ORM-level timestamp handling
- Prevents unnecessary timestamp updates when no data changes

## Soft Delete System

### Function: `soft_delete_handler`

Converts `DELETE` operations into soft deletes by setting `deleted_at` timestamp.

#### Applied To

- users
- creators
- brands
- projects
- ip_assets
- licenses

#### Behavior

1. Intercepts `DELETE` operations
2. Sets `deleted_at = CURRENT_TIMESTAMP`
3. Returns `NULL` to cancel the actual DELETE
4. Allows re-deletion of already soft-deleted records

#### Usage

```sql
-- This will soft delete (sets deleted_at)
DELETE FROM ip_assets WHERE id = 'asset123';

-- Restore soft-deleted record
UPDATE ip_assets SET deleted_at = NULL WHERE id = 'asset123';
```

### Function: `hard_delete_record` (Admin Only)

Permanently deletes soft-deleted records.

#### Signature

```sql
hard_delete_record(
  p_table_name TEXT,
  p_record_id VARCHAR
)
```

#### Security

- Only works on already soft-deleted records
- Validates table name to prevent SQL injection
- Requires elevated database permissions
- Use for GDPR compliance or data cleanup

#### Usage Example

```typescript
// Only deletes if deleted_at IS NOT NULL
const deleted = await prisma.$queryRaw`
  SELECT hard_delete_record('users', ${userId})
`;
```

## Data Consistency Checks

### Function: `check_orphaned_ownerships`

Identifies IP ownership records with missing or soft-deleted references.

#### Returns

| Column | Type | Description |
|--------|------|-------------|
| ownership_id | VARCHAR | Ownership record ID |
| ip_asset_id | VARCHAR | Referenced asset ID |
| creator_id | VARCHAR | Referenced creator ID |
| issue | TEXT | Description of the issue |

#### Usage

```typescript
const orphans = await prisma.$queryRaw`
  SELECT * FROM check_orphaned_ownerships()
`;
```

### Function: `check_ownership_sum_violations`

Identifies IP assets with invalid ownership allocations (≠ 100%).

#### Returns

| Column | Type | Description |
|--------|------|-------------|
| ip_asset_id | VARCHAR | Asset ID |
| asset_title | VARCHAR | Asset title |
| total_share_bps | INTEGER | Sum of ownership shares |
| active_ownerships | INTEGER | Number of active ownerships |
| issue | TEXT | Type of violation |

#### Usage

```typescript
const violations = await prisma.$queryRaw`
  SELECT * FROM check_ownership_sum_violations()
`;
```

### Function: `check_license_date_conflicts`

Identifies licenses with invalid date ranges or status issues.

#### Returns

| Column | Type | Description |
|--------|------|-------------|
| license_id | VARCHAR | License ID |
| ip_asset_id | VARCHAR | Asset ID |
| brand_id | VARCHAR | Brand ID |
| start_date | TIMESTAMP | License start |
| end_date | TIMESTAMP | License end |
| issue | TEXT | Type of conflict |

#### Usage

```typescript
const conflicts = await prisma.$queryRaw`
  SELECT * FROM check_license_date_conflicts()
`;
```

## Full-Text Search

### Extensions Enabled

- **pg_trgm**: Trigram matching for fuzzy search
- **unaccent**: Accent-insensitive search

### Search Functions

#### `fuzzy_search_ip_assets`

```sql
fuzzy_search_ip_assets(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
```

Returns IP assets ranked by relevance using trigram similarity and full-text search.

#### `fuzzy_search_creators`

```sql
fuzzy_search_creators(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
```

Returns creators ranked by similarity to search term.

#### `fuzzy_search_brands`

```sql
fuzzy_search_brands(
  p_search_term TEXT,
  p_similarity_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
```

Returns brands ranked by similarity to search term.

### Usage Example

```typescript
const searchResults = await prisma.$queryRaw`
  SELECT * FROM fuzzy_search_ip_assets(
    ${'animation character'},
    0.3,
    20
  )
`;

// Returns:
// [
//   {
//     id: 'asset123',
//     title: 'Animated Character Design',
//     description: '...',
//     similarity_score: 0.85,
//     rank: 0.456
//   },
//   ...
// ]
```

## Search Indexes

### Full-Text Search Indexes

- **GIN indexes** on text fields (title, description, name, bio, etc.)
- **Trigram indexes** for fuzzy matching
- Supports natural language queries and typo tolerance

### JSONB Indexes

- Optimized for queries on metadata, preferences, social_links
- Uses `jsonb_path_ops` for efficient containment queries

### Composite Indexes

Optimized for common query patterns:

- IP assets by status + type + created date
- Licenses by brand + status + dates
- Events by entity + type + timestamp
- Daily metrics by entity + date range

### Partial Indexes

Smaller, faster indexes for filtered queries:

- Active users only
- Verified creators/brands only
- Published IP assets only
- Active licenses only
- Pending/failed payouts only

### Expression Indexes

- Case-insensitive lookups (LOWER())
- Storage bucket extraction
- Computed column indexes

## Analytics Optimization

### Time-Series Queries

Optimized indexes for:

- Revenue aggregation by date
- Event analytics by type and period
- Engagement metrics tracking
- Royalty performance analysis

### Covering Indexes

Include frequently accessed columns to avoid table lookups:

- IP asset searches include title, thumbnail
- Creator/brand profiles include name, verification status

### Analytics Functions

All analytics should leverage:

1. **daily_metrics** table for pre-aggregated data
2. Appropriate date range indexes
3. Partial indexes for active records only

## Usage Examples

### Calculate Engagement for Multiple Assets

```typescript
const assetIds = ['asset1', 'asset2', 'asset3'];
const startDate = new Date('2025-01-01');
const endDate = new Date('2025-01-31');

const scores = await Promise.all(
  assetIds.map(assetId =>
    prisma.$queryRaw`
      SELECT * FROM calculate_engagement_score(
        ${assetId},
        ${startDate}::timestamp,
        ${endDate}::timestamp
      )
    `
  )
);
```

### Process Royalties for a Run

```typescript
async function calculateRoyaltiesForRun(
  royaltyRunId: string,
  periodStart: Date,
  periodEnd: Date
) {
  // Get all licenses with revenue in period
  const licenses = await prisma.license.findMany({
    where: {
      status: 'ACTIVE',
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    },
    include: {
      ipAsset: {
        include: {
          ownerships: {
            where: {
              startDate: { lte: periodEnd },
              OR: [
                { endDate: null },
                { endDate: { gte: periodStart } }
              ]
            }
          }
        }
      }
    }
  });

  // Calculate royalties for each creator
  const royaltyLines = [];
  
  for (const license of licenses) {
    // Get revenue from daily_metrics
    const revenue = await prisma.dailyMetric.aggregate({
      where: {
        licenseId: license.id,
        date: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      _sum: { revenueCents: true }
    });

    const revenueCents = revenue._sum.revenueCents || 0;

    // Calculate for each owner
    for (const ownership of license.ipAsset.ownerships) {
      const result = await prisma.$queryRaw`
        SELECT * FROM calculate_royalty(
          ${license.id},
          ${revenueCents},
          ${license.ipAssetId},
          ${ownership.creatorId}
        )
      `;

      royaltyLines.push({
        royaltyRunId,
        licenseId: license.id,
        ipAssetId: license.ipAssetId,
        creatorId: ownership.creatorId,
        revenueCents,
        shareBps: ownership.shareBps,
        calculatedRoyaltyCents: result[0].final_royalty_cents,
        periodStart,
        periodEnd,
        metadata: result[0].calculation_breakdown
      });
    }
  }

  return royaltyLines;
}
```

### Run Data Consistency Checks

```typescript
async function runDataIntegrityChecks() {
  const issues = {
    orphanedOwnerships: await prisma.$queryRaw`
      SELECT * FROM check_orphaned_ownerships()
    `,
    ownershipViolations: await prisma.$queryRaw`
      SELECT * FROM check_ownership_sum_violations()
    `,
    licenseConflicts: await prisma.$queryRaw`
      SELECT * FROM check_license_date_conflicts()
    `
  };

  return issues;
}
```

### Implement Search with Ranking

```typescript
async function searchAssets(searchTerm: string, filters?: {
  type?: AssetType;
  status?: AssetStatus;
  limit?: number;
}) {
  const results = await prisma.$queryRaw`
    SELECT * FROM fuzzy_search_ip_assets(
      ${searchTerm},
      0.3,
      ${filters?.limit || 20}
    )
  `;

  // Apply additional filters if needed
  if (filters?.type || filters?.status) {
    const assetIds = results.map(r => r.id);
    return prisma.ipAsset.findMany({
      where: {
        id: { in: assetIds },
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status })
      },
      orderBy: {
        // Maintain search ranking order
        id: 'asc' // Would need custom ordering logic
      }
    });
  }

  return results;
}
```

## Performance Considerations

### Index Maintenance

Run these commands periodically:

```sql
-- Update table statistics for query planner
ANALYZE;

-- Rebuild indexes to prevent bloat
REINDEX DATABASE CONCURRENTLY yesgoddess;
```

### Monitor Index Usage

```sql
-- Check unused indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Soft Delete Cleanup

Schedule periodic hard deletes of old soft-deleted records:

```typescript
// Delete records soft-deleted > 90 days ago
async function cleanupOldDeletedRecords() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const tables = ['users', 'creators', 'brands', 'projects', 'ip_assets', 'licenses'];
  
  for (const table of tables) {
    const deleted = await prisma.$queryRaw`
      DELETE FROM ${table}
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoffDate}::timestamp
      RETURNING id
    `;
    
    console.log(`Cleaned up ${deleted.length} records from ${table}`);
  }
}
```

## Migration Application

### Apply Migrations

```bash
# Apply database functions
psql $DATABASE_URL -f prisma/migrations/007_add_database_functions.sql

# Apply search indexes
psql $DATABASE_URL -f prisma/migrations/008_add_search_indexes.sql
```

### Rollback Migrations

```bash
# Rollback search indexes
psql $DATABASE_URL -f prisma/migrations/rollbacks/008_rollback_search_indexes.sql

# Rollback database functions
psql $DATABASE_URL -f prisma/migrations/rollbacks/007_rollback_database_functions.sql
```

## Testing

### Test Engagement Score

```sql
-- Create test data
INSERT INTO daily_metrics (date, ip_asset_id, views, clicks, conversions, engagement_time, unique_visitors)
VALUES 
  (CURRENT_DATE, 'test_asset', 100, 10, 2, 500, 80),
  (CURRENT_DATE - 1, 'test_asset', 150, 15, 3, 600, 120);

-- Calculate score
SELECT * FROM calculate_engagement_score('test_asset');
```

### Test Royalty Calculation

```sql
-- Test with known values
SELECT * FROM calculate_royalty(
  'license_id',
  100000,  -- $1000.00 revenue
  'asset_id',
  'creator_id'
);

-- Verify: 50% rev share, 60% ownership = $300.00 royalty
```

### Test Soft Delete

```sql
-- Should set deleted_at
DELETE FROM ip_assets WHERE id = 'test_asset';

-- Verify soft delete
SELECT id, deleted_at FROM ip_assets WHERE id = 'test_asset';

-- Restore
UPDATE ip_assets SET deleted_at = NULL WHERE id = 'test_asset';
```

## Troubleshooting

### Function Not Found

Ensure migrations are applied in order:
1. `006_add_check_constraints.sql` (existing)
2. `add_ownership_constraint.sql` (existing)
3. `007_add_database_functions.sql` (new)
4. `008_add_search_indexes.sql` (new)

### Index Creation Fails

Use `CONCURRENTLY` to avoid locking:
```sql
CREATE INDEX CONCURRENTLY ...
```

If fails, check for existing index:
```sql
DROP INDEX IF EXISTS index_name;
```

### Soft Delete Not Working

Check trigger exists:
```sql
SELECT tgname, tgtype, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%soft_delete%';
```

### Search Not Finding Results

1. Check extension enabled: `\dx pg_trgm`
2. Lower similarity threshold: `0.1` instead of `0.3`
3. Try full-text search directly:
```sql
SELECT * FROM ip_assets 
WHERE to_tsvector('english', title || ' ' || description) 
  @@ plainto_tsquery('english', 'search term');
```

---

## Summary

All database functions are now implemented and documented:

✅ Ownership shares sum check (already existed)  
✅ Engagement score calculation  
✅ Royalty calculation helper  
✅ Automatic timestamp updates  
✅ Soft delete triggers  
✅ Data consistency checks  
✅ Full-text search capabilities  
✅ Comprehensive indexing strategy  
✅ Analytics query optimization  

The system provides a robust foundation for the YesGoddess platform with:
- Database-level data integrity enforcement
- Precise financial calculations with audit trails
- High-performance search and analytics
- Flexible metadata querying
- Soft delete with recovery options
