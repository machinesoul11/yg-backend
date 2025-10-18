# Creator Search - Quick Reference

## API Endpoints

### Search Creators
```typescript
// Basic search
api.creators.searchCreators.query({
  query: "photographer",
  pageSize: 20,
});

// With filters
api.creators.searchCreators.query({
  query: "portrait photographer",
  specialties: ["photography", "videography"],
  verificationStatus: ["approved"],
  availabilityStatus: "available",
  sortBy: "average_rating",
  sortOrder: "desc",
  page: 1,
  pageSize: 20,
});
```

### Get Search Facets
```typescript
api.creators.getCreatorSearchFacets.query({
  query: "designer",
  verificationStatus: ["approved"],
});
```

## Available Filters

| Filter | Type | Description |
|--------|------|-------------|
| `query` | string | Text search across name and bio |
| `specialties` | string[] | Filter by creator specialties |
| `industry` | string[] | Filter by industry categories |
| `category` | string[] | Filter by specialty categories |
| `verificationStatus` | string[] | Filter by verification status (role-based) |
| `availabilityStatus` | enum | Filter by availability: available, limited, unavailable |

## Sort Options

| Sort By | Description |
|---------|-------------|
| `relevance` | Best match (default) |
| `created_at` | Account creation date |
| `verified_at` | Verification date |
| `total_collaborations` | Number of projects |
| `total_revenue` | Lifetime earnings |
| `average_rating` | Quality rating |

## Specialties

Available creator specialties:
- `photography`
- `videography`
- `motion-graphics`
- `illustration`
- `3d-design`
- `graphic-design`
- `copywriting`
- `music-composition`
- `sound-design`
- `brand-strategy`
- `art-direction`
- `animation`

## Permission Levels

| Role | Access |
|------|--------|
| Public (unauthenticated) | Approved creators only |
| Brand | Approved creators only |
| Creator | Approved creators only |
| Admin | All creators (can filter by any status) |

## Performance Metrics

Creators are ranked by performance metrics stored in JSONB:
- `totalCollaborations` - Number of completed projects
- `totalRevenue` - Lifetime earnings in cents
- `averageRating` - Quality score (0-5)
- `recentActivityScore` - Recent engagement metric

## Database Indexes

Optimized indexes for fast searches:
- GIN indexes on JSONB fields (specialties, availability, metrics)
- Full-text search tsvector on name + bio
- Trigram indexes for fuzzy matching
- Composite indexes for common filter combinations
- Functional indexes for performance metrics sorting

## Example Queries

### Find Top-Rated Available Photographers
```typescript
const results = await api.creators.searchCreators.query({
  specialties: ["photography"],
  availabilityStatus: "available",
  sortBy: "average_rating",
  sortOrder: "desc",
  pageSize: 10,
});
```

### Search by Name (Fuzzy)
```typescript
const results = await api.creators.searchCreators.query({
  query: "jon smith",  // Matches "John Smith"
  sortBy: "relevance",
});
```

### Top Earners
```typescript
const results = await api.creators.searchCreators.query({
  sortBy: "total_revenue",
  sortOrder: "desc",
  pageSize: 50,
});
```

### Multi-Specialty Creators
```typescript
const results = await api.creators.searchCreators.query({
  specialties: ["photography", "videography", "graphic-design"],
  sortBy: "total_collaborations",
  sortOrder: "desc",
});
```

## Response Format

```typescript
{
  results: [
    {
      id: "creator_id",
      userId: "user_id",
      stageName: "Creator Name",
      bio: "Short bio...",
      specialties: ["photography", "videography"],
      verificationStatus: "approved",
      portfolioUrl: "https://...",
      availability: {
        status: "available",
        hoursPerWeek: 40
      },
      performanceMetrics: {
        totalCollaborations: 25,
        totalRevenue: 50000,
        averageRating: 4.8
      },
      avatar: "https://...",
      verifiedAt: "2025-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2025-01-15T00:00:00Z"
    }
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 100,
    totalPages: 5,
    hasNextPage: true,
    hasPreviousPage: false
  }
}
```

## Common Issues

### Slow Queries
- Ensure indexes are created: `\di creators`
- Check execution plan: `EXPLAIN ANALYZE <query>`
- Consider reducing page size

### No Results
- Check verification status (non-admins only see approved)
- Verify filters aren't too restrictive
- Check for typos in specialty names

### TypeScript Errors
- Regenerate Prisma client: `npx prisma generate`
- Clear cache: `rm -rf node_modules/.prisma`

## Monitoring

```sql
-- Check search performance
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%creators%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Index usage
SELECT
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'creators'
ORDER BY idx_scan DESC;
```

## Related Files

- Router: `src/modules/creators/routers/creators.router.ts`
- Service: `src/modules/search/services/search.service.ts`
- Types: `src/modules/search/types/search.types.ts`
- Schema: `src/modules/creators/schemas/creator.schema.ts`
- Migration: `migrations/add_creator_search_indexes.sql`
- Docs: `docs/CREATOR_SEARCH_IMPLEMENTATION_COMPLETE.md`
