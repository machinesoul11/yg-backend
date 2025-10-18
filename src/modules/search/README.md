# Search Service Module

A comprehensive, intelligent search system for the YesGoddess platform providing unified search across IP Assets, Creators, Projects, and Licenses with advanced relevance scoring, analytics tracking, and performance optimization.

## Features

### Core Search Capabilities
- ✅ **Multi-Entity Search** - Search across assets, creators, projects, and licenses simultaneously
- ✅ **Advanced Relevance Scoring** - Composite scoring algorithm combining textual, recency, popularity, and quality signals
- ✅ **Intelligent Ranking** - Results ranked by relevance with transparent score breakdowns
- ✅ **Flexible Filtering** - Entity-specific filters for precise results
- ✅ **Query Parsing** - Sanitization, validation, and optimization of search queries
- ✅ **Search Highlights** - Matching text highlighted in results
- ✅ **Pagination** - Efficient result pagination with configurable page sizes

### Analytics & Insights
- ✅ **Search Tracking** - Every search logged with execution time and result count
- ✅ **Click-Through Tracking** - Track which results users click
- ✅ **Zero-Result Monitoring** - Identify queries that return no results
- ✅ **Performance Metrics** - P50, P95, P99 latency tracking
- ✅ **Trending Searches** - Identify popular and growing search terms
- ✅ **User Behavior Analysis** - Understand how users search and interact with results

## Installation

### 1. Database Migration

Run the migration to create the search analytics table:

```bash
psql -d your_database -f migrations/add_search_analytics_table.sql
```

### 2. Generate Prisma Client

After adding the SearchAnalyticsEvent model to your Prisma schema:

```bash
npm run db:generate
```

### 3. Integration

The search router is automatically integrated into the main tRPC router. No additional configuration needed.

## Usage

### Basic Search

```typescript
import { trpc } from '@/lib/trpc/client';

const result = await trpc.search.search.query({
  query: 'logo design',
  page: 1,
  limit: 20,
});
```

### Multi-Entity Search with Filters

```typescript
const result = await trpc.search.search.query({
  query: 'marketing',
  entities: ['projects', 'assets'],
  filters: {
    projectType: ['CAMPAIGN'],
    projectStatus: ['ACTIVE'],
    dateFrom: new Date('2025-01-01'),
  },
  sortBy: 'relevance',
});
```

### Admin Analytics

```typescript
// Get search analytics (admin only)
const analytics = await trpc.search.getAnalytics.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
});

// Get trending searches
const trending = await trpc.search.getTrendingSearches.query({
  hours: 24,
  limit: 10,
});

// Get zero-result queries
const zeroResults = await trpc.search.getZeroResultQueries.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  limit: 20,
});
```

## Architecture

### Services

**SearchService** (`services/search.service.ts`)
- Main search orchestration
- Multi-entity query execution
- Relevance scoring and ranking
- Result aggregation and pagination

**SearchAnalyticsService** (`services/search-analytics.service.ts`)
- Analytics event tracking
- Performance monitoring
- Behavioral analysis
- Trend detection

### Scoring Algorithm

The relevance score is a weighted combination of four components:

```typescript
finalScore = 
  (textualRelevance × 0.5) +
  (recencyScore × 0.2) +
  (popularityScore × 0.2) +
  (qualityScore × 0.1)
```

**Textual Relevance (50%)**
- Exact title match: 1.0
- Title contains query: 0.7
- Partial word matches: proportional
- Description matches: +0.3 bonus

**Recency Score (20%)**
- Exponential decay: `e^(-λ × age)`
- Half-life: 90 days (configurable)
- Max age: 730 days (2 years)

**Popularity Score (20%)**
- View counts
- Usage metrics
- Engagement signals

**Quality Score (10%)**
- Verification/approval status
- Content quality indicators
- User ratings

### Configuration

Customize search behavior:

```typescript
const searchService = new SearchService(prisma, {
  weights: {
    textualRelevance: 0.6,  // Emphasize text matching
    recency: 0.15,
    popularity: 0.15,
    quality: 0.1,
  },
  recency: {
    halfLifeDays: 60,  // Faster decay
    maxAgeDays: 365,   // Only consider last year
  },
  limits: {
    maxResultsPerEntity: 50,
    defaultPageSize: 30,
    maxPageSize: 100,
  },
});
```

## API Reference

### Endpoints

#### `search.search`
**Type:** Query  
**Auth:** Protected  
**Purpose:** Execute unified search

**Input:**
```typescript
{
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}
```

#### `search.getAnalytics`
**Type:** Query  
**Auth:** Admin  
**Purpose:** Get search analytics

#### `search.getPerformanceMetrics`
**Type:** Query  
**Auth:** Admin  
**Purpose:** Get performance metrics

#### `search.getTrendingSearches`
**Type:** Query  
**Auth:** Admin  
**Purpose:** Get trending search terms

#### `search.trackClick`
**Type:** Mutation  
**Auth:** Protected  
**Purpose:** Track result click for analytics

## Performance

### Optimization Strategies

1. **Parallel Execution** - Entity searches run in parallel
2. **Result Limiting** - Maximum results per entity (default: 100)
3. **Efficient Indexing** - Database indexes on searchable fields
4. **Query Caching** - Consider implementing Redis cache for common queries
5. **Async Analytics** - Analytics tracking doesn't block search

### Monitoring

Track these metrics:
- Average execution time
- P95/P99 latency percentiles
- Zero-result query rate
- Click-through rate
- Entity-specific search volume

## Security

- Authentication required for all search endpoints
- Row-level security automatically applied
- Users can only search entities they have permission to view
- Admin-only analytics endpoints
- Query sanitization prevents SQL injection
- Rate limiting recommended for production

## Testing

Run tests:

```bash
npm test -- search
```

Key test areas:
- Scoring algorithm accuracy
- Query parsing edge cases
- Multi-entity search coordination
- Analytics tracking
- Performance benchmarks

## Troubleshooting

### Slow Queries
1. Check database indexes
2. Review EXPLAIN ANALYZE output
3. Reduce maxResultsPerEntity
4. Implement query result caching

### Zero Results
1. Review query parsing logic
2. Check filter constraints
3. Verify user permissions
4. Monitor zero-result analytics

### Relevance Issues
1. Adjust scoring weights
2. Review textual matching algorithm
3. Collect user feedback
4. A/B test configurations

## Future Enhancements

### Planned Features
- PostgreSQL full-text search integration
- Elasticsearch option for large datasets
- Autocomplete/suggestions
- Synonym support
- Typo correction
- Machine learning-based ranking
- Personalized results
- Voice search support

## Documentation

- [Complete Implementation Guide](../SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md)
- [Frontend Integration Guide](../../docs/frontend-integration/SEARCH_SERVICE_INTEGRATION_GUIDE.md)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review zero-result queries for patterns
3. Consult analytics for insights
4. Contact the backend team

## License

Internal use only - YesGoddess Platform
