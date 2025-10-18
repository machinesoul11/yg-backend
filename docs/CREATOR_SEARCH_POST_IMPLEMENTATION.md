# Creator Search - Post-Implementation Steps

## Prisma Client Regeneration Required

After adding the new indexes to the Prisma schema, you need to regenerate the Prisma client:

```bash
# Regenerate Prisma client
npx prisma generate

# Push schema changes to database
npx prisma db push

# Or create and run migration
npx prisma migrate dev --name add_creator_search_indexes
```

## Database Migration

Apply the search indexes migration:

```bash
# Direct SQL execution (recommended for production)
psql $DATABASE_URL -f migrations/add_creator_search_indexes.sql

# Or via migration system
npx prisma migrate deploy
```

## Verification Steps

1. **Check Prisma Client Generation**
```bash
npx prisma generate
# Should complete without errors
```

2. **Verify Indexes Created**
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'creators' 
  AND indexname LIKE 'idx_creators_%';
```

3. **Test Creator Search Endpoint**
```typescript
// Test basic search
const results = await api.creators.searchCreators.query({
  query: "photographer",
  pageSize: 10,
});

// Test with filters
const filtered = await api.creators.searchCreators.query({
  specialties: ["photography"],
  availabilityStatus: "available",
  sortBy: "average_rating",
});

// Test facets
const facets = await api.creators.getCreatorSearchFacets.query({
  query: "designer",
});
```

4. **Verify Search Analytics**
```sql
SELECT COUNT(*) FROM search_analytics_events 
WHERE entities::jsonb @> '["creators"]'::jsonb;
```

## Known Issues

### TypeScript/Prisma Client Errors

If you see errors like:
```
Property 'searchAnalyticsEvent' does not exist on type 'PrismaClient'
```

**Solution**: 
```bash
# Clean Prisma client cache
rm -rf node_modules/.prisma
npx prisma generate
```

### Index Creation Timeout

If index creation takes too long:
- Indexes are created with `CONCURRENTLY` to avoid table locks
- Large tables may take several minutes per index
- Monitor progress: `SELECT * FROM pg_stat_progress_create_index;`

### JSONB Query Performance

If JSONB queries are slow:
- Ensure GIN indexes are created
- Use `jsonb_path_ops` operator class (already configured)
- Check execution plans: `EXPLAIN ANALYZE <query>`

## Testing Checklist

After deployment, verify:

- [ ] Prisma client regenerated
- [ ] Database indexes created
- [ ] Creator search works (text query)
- [ ] Specialty filtering works
- [ ] Verification status filtering works (role-based)
- [ ] Availability filtering works
- [ ] Performance metrics sorting works
- [ ] Faceted search returns correct counts
- [ ] Pagination works correctly
- [ ] Permission boundaries enforced
- [ ] Search analytics tracking works

## Performance Monitoring

Monitor search performance:

```sql
-- Check slow creator searches
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%creators%'
  AND query LIKE '%WHERE%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'creators'
ORDER BY idx_scan DESC;
```

## Rollback Plan

If issues arise:

1. **Remove indexes** (won't break functionality, just slower):
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_specialties_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_creators_availability_gin;
-- ... etc
```

2. **Revert Prisma schema changes**:
```bash
git checkout HEAD -- prisma/schema.prisma
npx prisma generate
```

3. **Disable search endpoints** temporarily:
```typescript
// In creators.router.ts, comment out:
// searchCreators: publicProcedure...
// getCreatorSearchFacets: publicProcedure...
```

## Support

For issues or questions:
- Review documentation: `docs/CREATOR_SEARCH_IMPLEMENTATION_COMPLETE.md`
- Check existing search implementation: `src/modules/search/`
- Review creator service: `src/modules/creators/`

## Next Steps

Once verified working:
1. Monitor search query performance
2. Collect user feedback on search results
3. Consider implementing caching for popular queries
4. Plan geographic search enhancement if needed
5. Implement search result analytics dashboard
