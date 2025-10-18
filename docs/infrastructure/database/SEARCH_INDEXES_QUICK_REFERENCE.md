# Search Infrastructure - Quick Reference Guide

## Overview

Quick reference for using the search infrastructure indexes in queries and understanding their performance characteristics.

## Common Query Patterns

### Full-Text Search (IP Assets)

```typescript
// Natural language search with relevance ranking
const results = await prisma.$queryRaw`
  SELECT 
    id, title, description,
    ts_rank(
      setweight(to_tsvector('english', title), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B'),
      plainto_tsquery('english', ${searchTerm})
    ) AS rank
  FROM ip_assets
  WHERE (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B')
  ) @@ plainto_tsquery('english', ${searchTerm})
  AND deleted_at IS NULL
  ORDER BY rank DESC
  LIMIT 20
`;
```

**Uses Index:** `idx_ip_assets_combined_search`

### Fuzzy Search (Handles Typos)

```typescript
// Similarity-based search (typo-tolerant)
const results = await prisma.$queryRaw`
  SELECT id, title, similarity(title, ${searchTerm}) AS sim
  FROM ip_assets
  WHERE title % ${searchTerm}
  AND deleted_at IS NULL
  ORDER BY sim DESC
  LIMIT 20
`;
```

**Uses Index:** `idx_ip_assets_title_trgm`

### JSONB Specialty Search

```typescript
// Find creators with specific specialties
const creators = await prisma.creator.findMany({
  where: {
    specialties: {
      path: [],
      array_contains: ['photography', 'videography'],
    },
    verificationStatus: 'approved',
    deletedAt: null,
  },
});

// Or using raw SQL
const creators = await prisma.$queryRaw`
  SELECT * FROM creators
  WHERE specialties @> '["photography", "videography"]'::jsonb
  AND verification_status = 'approved'
  AND deleted_at IS NULL
`;
```

**Uses Index:** `idx_creators_specialties_gin`

### Filtered List with Sort

```typescript
// Status + Type + Date filter (common pattern)
const assets = await prisma.ipAsset.findMany({
  where: {
    type: 'IMAGE',
    status: 'PUBLISHED',
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

**Uses Index:** `idx_ip_assets_type_status_created`

### Case-Insensitive Search

```typescript
// Search ignoring case
const assets = await prisma.$queryRaw`
  SELECT * FROM ip_assets
  WHERE LOWER(title) LIKE ${`%${searchTerm.toLowerCase()}%`}
  AND deleted_at IS NULL
`;
```

**Uses Index:** `idx_ip_assets_title_lower`

### Creator Discovery (Public)

```typescript
// Approved creators only
const creators = await prisma.creator.findMany({
  where: {
    verificationStatus: 'approved',
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

**Uses Index:** `idx_creators_approved_created`

### Project Assets

```typescript
// Assets in a specific project
const assets = await prisma.ipAsset.findMany({
  where: {
    projectId: projectId,
    status: 'PUBLISHED',
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
});
```

**Uses Index:** `idx_ip_assets_project_status_created`

### Creator's Own Assets

```typescript
// Creator viewing their own assets
const assets = await prisma.ipAsset.findMany({
  where: {
    createdBy: userId,
    status: 'DRAFT',
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
});
```

**Uses Index:** `idx_ip_assets_creator_status_created`

## Index Selection Guide

| Query Type | Best Index | Performance Gain |
|------------|------------|------------------|
| Natural language search | Full-text (GIN) | 50-100x |
| Typo-tolerant search | Trigram (GIN) | 100-500x |
| JSON field queries | JSONB (GIN) | 20-50x |
| Multi-field filter+sort | Composite | 10-30x |
| Specific subset queries | Partial | 5-15x |
| Frequently accessed columns | Covering | 2-5x |

## Tuning Parameters

### Similarity Threshold

```sql
-- View current threshold
SHOW pg_trgm.similarity_threshold;

-- Stricter matching (0.5 = more relevant, fewer results)
SET pg_trgm.similarity_threshold = 0.5;

-- Looser matching (0.2 = more results, less relevant)
SET pg_trgm.similarity_threshold = 0.2;

-- Recommended default
SET pg_trgm.similarity_threshold = 0.3;
```

### Full-Text Search Language

```sql
-- English (default, includes stemming: "running" matches "run")
to_tsvector('english', text)

-- Simple (no stemming, exact words only)
to_tsvector('simple', text)
```

## Performance Tips

### Do's

✅ Use composite indexes for common filter combinations  
✅ Add `deleted_at IS NULL` to WHERE clauses (enables partial indexes)  
✅ Combine full-text and trigram search for best results  
✅ Use covering indexes to avoid table lookups  
✅ Update statistics regularly with `ANALYZE`

### Don'ts

❌ Don't use `LIKE '%term%'` for text search (use full-text instead)  
❌ Don't query JSONB without GIN indexes  
❌ Don't create indexes on columns that change frequently  
❌ Don't forget to filter soft-deleted records  
❌ Don't use OR conditions excessively (AND is more index-friendly)

## Monitoring Queries

### Check Index Usage

```sql
SELECT 
  indexname,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE tablename = 'ip_assets'
ORDER BY idx_scan DESC;
```

### Find Slow Queries

```sql
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%ip_assets%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Unused Indexes

```sql
SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname LIKE 'idx_%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Common Mistakes

### Mistake 1: Not Using Partial Indexes

```typescript
// ❌ Bad: Scans all records
const assets = await prisma.ipAsset.findMany({
  where: { status: 'PUBLISHED' },
  orderBy: { createdAt: 'desc' },
});

// ✅ Good: Uses partial index
const assets = await prisma.ipAsset.findMany({
  where: { 
    status: 'PUBLISHED',
    deletedAt: null,  // Enables idx_ip_assets_published_created
  },
  orderBy: { createdAt: 'desc' },
});
```

### Mistake 2: Wrong Order in Composite Index

```typescript
// ❌ Bad: Sorts first, then filters (can't use composite index)
const assets = await prisma.$queryRaw`
  SELECT * FROM ip_assets
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC, status
`;

// ✅ Good: Filters match composite index order
const assets = await prisma.$queryRaw`
  SELECT * FROM ip_assets
  WHERE status = 'PUBLISHED'
  AND deleted_at IS NULL
  ORDER BY created_at DESC
`;
```

### Mistake 3: Using LIKE Instead of Full-Text

```typescript
// ❌ Bad: Slow, no index usage
const assets = await prisma.$queryRaw`
  SELECT * FROM ip_assets
  WHERE title LIKE '%search%'
  OR description LIKE '%search%'
`;

// ✅ Good: Uses full-text index
const assets = await prisma.$queryRaw`
  SELECT * FROM ip_assets
  WHERE (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B')
  ) @@ plainto_tsquery('english', ${search})
`;
```

## Integration Examples

### Search Service Implementation

```typescript
// src/modules/search/search.service.ts
export class SearchService {
  async searchAssets(query: string, filters: AssetFilters) {
    // Use full-text search for query
    const textMatches = await this.fullTextSearch(query);
    
    // Use trigram search for fuzzy matching
    const fuzzyMatches = await this.fuzzySearch(query);
    
    // Combine and deduplicate results
    const combined = this.mergeResults(textMatches, fuzzyMatches);
    
    // Apply additional filters using composite indexes
    return this.applyFilters(combined, filters);
  }
  
  private async fullTextSearch(query: string) {
    return prisma.$queryRaw`
      SELECT id, title, 
        ts_rank(
          setweight(to_tsvector('english', title), 'A') ||
          setweight(to_tsvector('english', COALESCE(description, '')), 'B'),
          plainto_tsquery('english', ${query})
        ) AS rank
      FROM ip_assets
      WHERE (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B')
      ) @@ plainto_tsquery('english', ${query})
      AND deleted_at IS NULL
      ORDER BY rank DESC
      LIMIT 50
    `;
  }
  
  private async fuzzySearch(query: string) {
    return prisma.$queryRaw`
      SELECT id, title, similarity(title, ${query}) AS sim
      FROM ip_assets
      WHERE title % ${query}
      AND deleted_at IS NULL
      ORDER BY sim DESC
      LIMIT 20
    `;
  }
}
```

### Creator Search with Specialties

```typescript
// src/modules/creators/services/creator.service.ts
async searchCreators(input: SearchCreatorsInput) {
  const { query, specialties, verificationStatus } = input;
  
  let where: any = { deletedAt: null };
  
  // Use composite index: verification + created
  if (verificationStatus) {
    where.verificationStatus = verificationStatus;
  }
  
  // Use GIN index for specialties
  if (specialties?.length > 0) {
    where.specialties = {
      path: [],
      array_contains: specialties,
    };
  }
  
  // Text search on stage_name (uses trigram index)
  if (query) {
    return prisma.$queryRaw`
      SELECT c.*, similarity(c.stage_name, ${query}) AS sim
      FROM creators c
      WHERE c.stage_name % ${query}
      ${verificationStatus ? Prisma.sql`AND c.verification_status = ${verificationStatus}` : Prisma.empty}
      AND c.deleted_at IS NULL
      ORDER BY sim DESC
      LIMIT 20
    `;
  }
  
  return prisma.creator.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}
```

## Maintenance Commands

```bash
# Update statistics
psql $DATABASE_URL -c "ANALYZE ip_assets; ANALYZE creators;"

# Reindex to prevent bloat
psql $DATABASE_URL -c "REINDEX TABLE CONCURRENTLY ip_assets;"
psql $DATABASE_URL -c "REINDEX TABLE CONCURRENTLY creators;"

# Check index sizes
psql $DATABASE_URL -c "
  SELECT 
    tablename, 
    indexname, 
    pg_size_pretty(pg_relation_size(indexrelid)) 
  FROM pg_stat_user_indexes 
  WHERE schemaname = 'public' 
  ORDER BY pg_relation_size(indexrelid) DESC;
"
```

## Quick Decision Tree

```
Need to search text?
├─ Exact match → Use WHERE LOWER(field) = LOWER(value)
├─ Substring → Use WHERE LOWER(field) LIKE '%value%'
├─ Natural language → Use Full-Text Search (GIN)
└─ Typo-tolerant → Use Trigram Search (GIN)

Need to filter JSONB?
├─ Contains value → Use @> operator (GIN index)
├─ Has key → Use ? operator (GIN index)
└─ Path query → Use jsonb_path_ops (GIN index)

Need to sort results?
├─ Single field → Use B-tree index
├─ Multiple fields → Use Composite index
└─ Complex → Consider Covering index

Need high performance?
├─ Common query → Use Partial index
├─ Avoid table lookup → Use Covering index
└─ Frequently accessed → Check index usage stats
```

## Related Resources

- [Full Implementation Guide](./SEARCH_INFRASTRUCTURE_INDEXES_IMPLEMENTATION.md)
- [Database Functions Documentation](./functions-and-search.md)
- [Query Filtering System](../../../src/lib/query-filters/README.md)

## Support

For issues or questions:
1. Check index usage with monitoring queries
2. Review query plans with `EXPLAIN ANALYZE`
3. Consult the full implementation documentation
4. Update statistics if indexes aren't being used
