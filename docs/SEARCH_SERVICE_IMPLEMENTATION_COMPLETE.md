# Search Service Implementation - Complete

## Overview

The Search Service provides a unified, intelligent search system across multiple entity types (IP Assets, Creators, Projects, and Licenses) with advanced relevance scoring, ranking algorithms, and comprehensive analytics tracking.

## Architecture

### Core Components

1. **SearchService** - Main service handling multi-entity search with relevance scoring
2. **SearchAnalyticsService** - Tracks and analyzes search behavior
3. **Search Router** - tRPC API endpoints for search operations
4. **Type System** - Comprehensive TypeScript types for type safety

### Features Implemented

✅ **Unified Search Service**
- Multi-entity search (assets, creators, projects, licenses)
- Parallel query execution across entity types
- Configurable entity selection

✅ **Multi-Entity Search**
- IP Assets: Search by title, description, type, status
- Creators: Search by stage name, bio, specialties, verification status
- Projects: Search by name, description, type, status, brand
- Licenses: Search by asset title, brand name, license type, status

✅ **Relevance Scoring Algorithm**
- **Textual Relevance** (50% weight by default)
  - Exact title matches: 1.0 score
  - Title contains query: 0.7 score
  - Partial word matches: proportional score
  - Description matches: 0.3 bonus
  
- **Recency Score** (20% weight by default)
  - Exponential decay based on age
  - Configurable half-life (default: 90 days)
  - Maximum age consideration (default: 2 years)
  
- **Popularity Score** (20% weight by default)
  - View count weighting
  - Usage count weighting
  - Favorite count weighting
  
- **Quality Score** (10% weight by default)
  - Verification status
  - Active/approved status
  - Content quality metrics

✅ **Search Result Ranking**
- Composite score calculation
- Weighted sum of all score components
- Configurable weights per component
- Score breakdown tracking for transparency

✅ **Query Parsing & Processing**
- Query sanitization and validation
- Length constraints (2-200 characters)
- Special character filtering
- Stop word support (configurable)
- Query length validation

✅ **Search Analytics & Tracking**
- Every search logged with metadata
- Execution time tracking
- Result count tracking
- Click-through tracking
- User/session association
- Zero-result query tracking
- Performance metrics collection

## Database Schema

### SearchAnalyticsEvent Table

```sql
CREATE TABLE "search_analytics_events" (
  "id" TEXT PRIMARY KEY,
  "query" TEXT NOT NULL,
  "entities" JSONB DEFAULT '[]',
  "filters" JSONB,
  "results_count" INTEGER DEFAULT 0,
  "execution_time_ms" INTEGER NOT NULL,
  "user_id" TEXT,
  "session_id" TEXT,
  "clicked_result_id" TEXT,
  "clicked_result_position" INTEGER,
  "clicked_result_entity_type" TEXT,
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes
- query (for query analysis)
- user_id (for user behavior tracking)
- created_at (for time-based queries)
- results_count (for zero-result analysis)
- clicked_result_id (for click-through analysis)

## API Endpoints

### 1. Unified Search

**Endpoint:** `search.search`  
**Type:** Query  
**Authentication:** Protected (authenticated users only)

**Input:**
```typescript
{
  query: string;                    // 2-200 chars
  entities?: SearchableEntity[];    // ['assets', 'creators', 'projects', 'licenses']
  filters?: {
    assetType?: string[];
    assetStatus?: string[];
    verificationStatus?: string[];
    specialties?: string[];
    projectType?: string[];
    projectStatus?: string[];
    brandId?: string;
    licenseType?: string[];
    licenseStatus?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    createdBy?: string;
    tags?: string[];
  };
  page?: number;                    // Default: 1
  limit?: number;                   // 1-100, Default: 20
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title' | 'name';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    results: SearchResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    facets: {
      entityCounts: Record<SearchableEntity, number>;
    };
    query: string;
    executionTimeMs: number;
  };
}
```

### 2. Get Search Analytics (Admin Only)

**Endpoint:** `search.getAnalytics`  
**Type:** Query  
**Authentication:** Admin

**Input:**
```typescript
{
  startDate: Date;
  endDate: Date;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    totalSearches: number;
    averageExecutionTimeMs: number;
    averageResultsCount: number;
    zeroResultsRate: number;
    clickThroughRate: number;
    topQueries: Array<{
      query: string;
      count: number;
      averageResultsCount: number;
    }>;
    topEntities: Array<{
      entity: SearchableEntity;
      searchCount: number;
    }>;
    zeroResultQueries: Array<{
      query: string;
      count: number;
    }>;
  };
}
```

### 3. Get Zero-Result Queries (Admin Only)

**Endpoint:** `search.getZeroResultQueries`  
**Type:** Query  
**Authentication:** Admin

**Input:**
```typescript
{
  startDate: Date;
  endDate: Date;
  limit?: number; // 1-100, Default: 20
}
```

### 4. Get Performance Metrics (Admin Only)

**Endpoint:** `search.getPerformanceMetrics`  
**Type:** Query  
**Authentication:** Admin

**Response includes:**
- Average execution time
- P50, P95, P99 latency percentiles
- Slowest queries

### 5. Get Trending Searches (Admin Only)

**Endpoint:** `search.getTrendingSearches`  
**Type:** Query  
**Authentication:** Admin

**Input:**
```typescript
{
  hours?: number;  // 1-168, Default: 24
  limit?: number;  // 1-50, Default: 10
}
```

### 6. Track Result Click

**Endpoint:** `search.trackClick`  
**Type:** Mutation  
**Authentication:** Protected

**Input:**
```typescript
{
  eventId: string;
  resultId: string;
  resultPosition: number;
  resultEntityType: SearchableEntity;
}
```

## Configuration

### Default Search Configuration

```typescript
{
  weights: {
    textualRelevance: 0.5,  // 50%
    recency: 0.2,           // 20%
    popularity: 0.2,        // 20%
    quality: 0.1,           // 10%
  },
  recency: {
    halfLifeDays: 90,       // Score halves every 90 days
    maxAgeDays: 730,        // Only consider items from last 2 years
  },
  popularity: {
    viewCountWeight: 0.5,
    usageCountWeight: 0.3,
    favoriteCountWeight: 0.2,
  },
  parsing: {
    minQueryLength: 2,
    maxQueryLength: 200,
    stopWords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
    enableStemming: false,
    enableSynonyms: false,
  },
  limits: {
    maxResultsPerEntity: 100,
    defaultPageSize: 20,
    maxPageSize: 100,
  },
}
```

Configuration can be customized when initializing SearchService:

```typescript
const searchService = new SearchService(prisma, {
  weights: {
    textualRelevance: 0.6,
    recency: 0.15,
    popularity: 0.15,
    quality: 0.1,
  },
});
```

## Usage Examples

### Basic Search

```typescript
const result = await trpc.search.search.query({
  query: 'logo design',
  entities: ['assets', 'creators'],
  page: 1,
  limit: 20,
});
```

### Advanced Filtering

```typescript
const result = await trpc.search.search.query({
  query: 'marketing campaign',
  entities: ['projects', 'licenses'],
  filters: {
    projectType: ['CAMPAIGN', 'CONTENT'],
    projectStatus: ['ACTIVE', 'PLANNING'],
    brandId: 'brand_xyz',
    dateFrom: new Date('2024-01-01'),
  },
  sortBy: 'relevance',
  sortOrder: 'desc',
});
```

### Track Click

```typescript
await trpc.search.trackClick.mutate({
  eventId: 'search_event_id',
  resultId: 'asset_id',
  resultPosition: 0,
  resultEntityType: 'assets',
});
```

### Get Analytics (Admin)

```typescript
const analytics = await trpc.search.getAnalytics.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
});

console.log(`Total searches: ${analytics.data.totalSearches}`);
console.log(`Zero result rate: ${(analytics.data.zeroResultsRate * 100).toFixed(2)}%`);
console.log(`CTR: ${(analytics.data.clickThroughRate * 100).toFixed(2)}%`);
```

## Performance Considerations

### Optimization Strategies

1. **Index Usage**
   - Ensure all searchable text fields have appropriate indexes
   - Consider PostgreSQL full-text search indexes for better performance
   - Use composite indexes for common filter combinations

2. **Query Optimization**
   - Parallel execution of entity searches
   - Limit results per entity (default: 100)
   - Implement query result caching for common searches

3. **Analytics Performance**
   - Analytics tracking is async and non-blocking
   - Failed analytics tracking doesn't break search
   - Regular cleanup of old analytics data (90-day retention recommended)

### Monitoring

Track these metrics:
- Average query execution time
- P95/P99 latency percentiles
- Zero-result query rate
- Click-through rate
- Most common search terms
- Slow query identification

## Future Enhancements

### Planned Features

1. **Advanced Text Processing**
   - Stemming/lemmatization
   - Synonym expansion
   - Typo correction
   - Phrase detection

2. **Enhanced Relevance**
   - Machine learning-based ranking
   - Personalized results based on user history
   - Collaborative filtering signals
   - A/B testing framework for ranking algorithms

3. **Search Suggestions**
   - Autocomplete
   - "Did you mean..." corrections
   - Related searches
   - Trending suggestions

4. **Performance**
   - PostgreSQL full-text search integration
   - Elasticsearch integration option
   - Advanced caching strategies
   - Result pre-fetching

5. **Analytics**
   - User journey tracking
   - Conversion funnel analysis
   - Search success metrics
   - Content gap identification

## Testing

### Test Coverage

- Unit tests for scoring algorithms
- Integration tests for entity searches
- End-to-end tests for search API
- Performance benchmarks
- Analytics validation tests

### Example Tests

```typescript
// Test textual relevance scoring
test('exact title match scores 1.0', () => {
  const score = searchService.calculateTextRelevance('Logo', 'Logo', null);
  expect(score).toBeCloseTo(1.0);
});

// Test recency scoring
test('recent items score higher', () => {
  const recent = new Date();
  const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recentScore = searchService.calculateRecencyScore(recent);
  const oldScore = searchService.calculateRecencyScore(old);
  expect(recentScore).toBeGreaterThan(oldScore);
});
```

## Troubleshooting

### Common Issues

1. **Slow Queries**
   - Check index usage with EXPLAIN ANALYZE
   - Reduce maxResultsPerEntity
   - Implement query result caching
   - Consider pagination

2. **Zero Results**
   - Review query parsing logic
   - Check for overly restrictive filters
   - Verify entity permissions
   - Monitor zero-result analytics

3. **Relevance Issues**
   - Adjust scoring weights
   - Review textual relevance algorithm
   - Consider user feedback
   - A/B test different configurations

## Maintenance

### Regular Tasks

1. **Analytics Cleanup**
   ```typescript
   // Run monthly
   await analyticsService.cleanupOldEvents(90);
   ```

2. **Performance Monitoring**
   - Review weekly performance metrics
   - Identify slow queries
   - Optimize problematic searches

3. **Zero-Result Analysis**
   - Weekly review of zero-result queries
   - Content gap identification
   - Query parsing improvements

## Security

- All searches require authentication
- Row-level security filters automatically applied
- User can only search entities they have permission to view
- Analytics endpoints restricted to admins
- Query sanitization prevents SQL injection
- Rate limiting recommended for production

## Migration Guide

To enable search in your application:

1. Run the migration:
   ```bash
   psql -d your_database -f migrations/add_search_analytics_table.sql
   ```

2. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

3. Search is now available via tRPC:
   ```typescript
   import { trpc } from '@/lib/trpc/client';
   
   const results = await trpc.search.search.query({ query: 'test' });
   ```

## Support

For issues or questions:
1. Check zero-result queries for common problems
2. Review performance metrics for slow queries
3. Consult analytics for user behavior patterns
4. Contact backend team for advanced troubleshooting
