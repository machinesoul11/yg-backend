# Search Service - Quick Reference

## Setup Checklist

- [x] Create SearchAnalyticsEvent model in Prisma schema
- [x] Add relation to User model
- [x] Create migration file
- [ ] Run migration: `psql -d db -f migrations/add_search_analytics_table.sql`
- [ ] Generate Prisma client: `npm run db:generate`
- [x] Create SearchService
- [x] Create SearchAnalyticsService
- [x] Create validation schemas
- [x] Create tRPC router
- [x] Integrate into main app router
- [x] Write documentation

## File Structure

```
src/modules/search/
├── services/
│   ├── search.service.ts              # Main search service
│   └── search-analytics.service.ts    # Analytics tracking
├── types/
│   └── search.types.ts                # TypeScript types
├── validation/
│   └── search.validation.ts           # Zod schemas
├── router.ts                          # tRPC endpoints
├── index.ts                           # Module exports
└── README.md                          # Documentation
```

## Quick Start Commands

```bash
# Run migration
psql -d yg_backend -f migrations/add_search_analytics_table.sql

# Generate Prisma client
npm run db:generate

# Test search
npm run dev
```

## API Quick Reference

### Search
```typescript
trpc.search.search.query({
  query: 'logo',
  entities: ['assets', 'creators'],
  page: 1,
  limit: 20,
})
```

### Analytics (Admin)
```typescript
trpc.search.getAnalytics.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
})
```

### Track Click
```typescript
trpc.search.trackClick.mutate({
  eventId: 'event_id',
  resultId: 'result_id',
  resultPosition: 0,
  resultEntityType: 'assets',
})
```

## Key Features Checklist

### Core Functionality
- [x] Multi-entity search (assets, creators, projects, licenses)
- [x] Relevance scoring algorithm
- [x] Query parsing and sanitization
- [x] Result ranking
- [x] Pagination
- [x] Filtering by entity type
- [x] Advanced filters per entity
- [x] Search highlights

### Analytics
- [x] Search event tracking
- [x] Click-through tracking
- [x] Zero-result query tracking
- [x] Performance metrics
- [x] Trending searches
- [x] User behavior analysis

### Scoring Components
- [x] Textual relevance (50%)
- [x] Recency score (20%)
- [x] Popularity score (20%)
- [x] Quality score (10%)
- [x] Configurable weights
- [x] Score breakdown in results

## Configuration Options

```typescript
// Default config
{
  weights: {
    textualRelevance: 0.5,
    recency: 0.2,
    popularity: 0.2,
    quality: 0.1,
  },
  recency: {
    halfLifeDays: 90,
    maxAgeDays: 730,
  },
  parsing: {
    minQueryLength: 2,
    maxQueryLength: 200,
  },
  limits: {
    maxResultsPerEntity: 100,
    defaultPageSize: 20,
    maxPageSize: 100,
  },
}
```

## Entity Search Coverage

| Entity    | Searchable Fields         | Filters Available      |
|-----------|---------------------------|------------------------|
| Assets    | title, description        | type, status, creator  |
| Creators  | stageName, bio            | verification, specialties |
| Projects  | name, description         | type, status, brand    |
| Licenses  | asset title, brand name   | type, status           |

## Performance Metrics

| Metric                 | Target      | Current   |
|------------------------|-------------|-----------|
| Avg Execution Time     | < 100ms     | TBD       |
| P95 Latency            | < 200ms     | TBD       |
| P99 Latency            | < 500ms     | TBD       |
| Zero-Result Rate       | < 20%       | TBD       |
| Click-Through Rate     | > 30%       | TBD       |

## Database Indexes

```sql
-- Required indexes (already in migration)
CREATE INDEX "search_analytics_events_query_idx" ON "search_analytics_events"("query");
CREATE INDEX "search_analytics_events_user_id_idx" ON "search_analytics_events"("user_id");
CREATE INDEX "search_analytics_events_created_at_idx" ON "search_analytics_events"("created_at");
CREATE INDEX "search_analytics_events_results_count_idx" ON "search_analytics_events"("results_count");
CREATE INDEX "search_analytics_events_clicked_result_idx" ON "search_analytics_events"("clicked_result_id");

-- Recommended for entity tables (check if exist)
CREATE INDEX IF NOT EXISTS "ip_assets_title_idx" ON "ip_assets" USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS "creators_stage_name_idx" ON "creators" USING gin(to_tsvector('english', stage_name));
CREATE INDEX IF NOT EXISTS "projects_name_idx" ON "projects" USING gin(to_tsvector('english', name));
```

## Testing Checklist

- [ ] Unit tests for scoring functions
- [ ] Integration tests for entity searches
- [ ] E2E tests for search API
- [ ] Performance benchmarks
- [ ] Analytics tracking validation
- [ ] Error handling tests
- [ ] Permission/security tests

## Deployment Steps

1. Review and test in development
2. Run database migration in staging
3. Generate Prisma client
4. Deploy backend code
5. Monitor initial performance
6. Review zero-result queries
7. Adjust configuration as needed

## Monitoring Setup

Monitor these in production:
- Average query execution time
- Error rates
- Zero-result query rate
- Click-through rate
- Most common searches
- Slow query alerts (> 500ms)

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Slow queries | Add indexes, reduce result limits |
| Zero results | Review filters, check permissions |
| Low CTR | Improve relevance scoring |
| High error rate | Check database connection, review logs |

## Next Steps

After implementation:
1. Monitor performance metrics
2. Collect user feedback
3. Analyze zero-result queries
4. Fine-tune scoring weights
5. Consider PostgreSQL full-text search
6. Plan autocomplete feature
7. Implement personalization

## Resources

- Full Documentation: `docs/SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md`
- Frontend Guide: `docs/frontend-integration/SEARCH_SERVICE_INTEGRATION_GUIDE.md`
- Module README: `src/modules/search/README.md`

## Contact

For support or questions about the search service:
- Backend Team
- Internal documentation wiki
- Development Slack channel
