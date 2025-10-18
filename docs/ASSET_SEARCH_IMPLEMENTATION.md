# Asset Search Features - Implementation Documentation

## Overview

This document describes the comprehensive asset search functionality implemented for the YesGoddess Ops backend platform. The search system provides powerful full-text search, filtering, and discovery capabilities for IP assets with role-based permissions.

## Features Implemented

### 1. Full-Text Search
- **Title and Description Search**: Case-insensitive search across asset titles and descriptions
- **Fuzzy Matching**: Trigram-based fuzzy search for typo tolerance and autocomplete
- **Relevance Scoring**: Multi-factor scoring algorithm considering:
  - Textual relevance (exact matches, partial matches)
  - Recency (newer assets ranked higher)
  - Popularity (view counts, usage frequency)
  - Quality scores

### 2. Advanced Filtering

#### Asset-Specific Filters
- **Asset Type**: Filter by IMAGE, VIDEO, AUDIO, DOCUMENT, etc.
- **Status**: Filter by DRAFT, APPROVED, PUBLISHED, ARCHIVED
- **Project**: Filter assets belonging to specific projects
- **Creator**: Filter by asset creator/owner via ownership records
- **Date Range**: Filter by creation date range (from/to)
- **Tags**: Filter by tags stored in asset metadata JSONB field

#### Common Filters
- **Created By**: Filter by the user who uploaded the asset
- **Multiple Filter Combination**: All filters can be combined for precise searches

### 3. Permission-Based Access Control

The search system respects role-based permissions:

#### Creator Role
- Creators can only search and view assets they own
- Ownership determined via `ip_ownerships` table with active (endDate = null) records
- Ensures IP rights protection and privacy

#### Brand Role
- Brands can search assets in two categories:
  1. Assets in projects they own
  2. Assets they have active licenses for (status = ACTIVE, not expired)
- Protects asset visibility based on business relationships

#### Admin Role
- Full search access to all assets in the system
- No permission filtering applied
- Used for platform administration and support

#### Viewer Role
- Standard access (can be customized based on requirements)
- Currently has same access as admin but can be restricted

### 4. Autocomplete/Suggestions
- **Fast Typeahead**: Returns top 10 matching asset titles as user types
- **Minimum Query Length**: Requires at least 2 characters
- **Permission-Aware**: Suggestions respect the same permission rules
- **Includes Context**: Returns asset type, status, and thumbnail for UI display

### 5. Faceted Search
- **Dynamic Filter Options**: Returns available filter values with counts
- **Asset Type Facets**: Count of assets per type (IMAGE: 45, VIDEO: 23, etc.)
- **Status Facets**: Count of assets per status
- **Project Facets**: Top 20 projects with asset counts
- **Creator Facets**: Top 20 creators with asset counts
- **Permission-Filtered**: Facets only show options user has access to

### 6. Recent Searches
- **Search History**: Tracks user's recent search queries
- **De-duplicated**: Shows unique queries only
- **Configurable Limit**: Default 10 recent searches
- **Quick Access**: Enables users to re-run previous searches quickly

### 7. Saved Searches
- **Persistent Queries**: Users can save frequently-used search queries
- **Named Searches**: Each saved search has a descriptive name
- **Filter Preservation**: Saves complete search criteria including filters
- **CRUD Operations**: Full create, read, update, delete support
- **User-Specific**: Each user manages their own saved searches

## Database Implementation

### New Tables

#### saved_searches
```sql
CREATE TABLE saved_searches (
  id VARCHAR(30) PRIMARY KEY,
  user_id VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  search_query VARCHAR(200) NOT NULL,
  entities JSONB DEFAULT '[]'::jsonb NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

### Performance Indexes

#### Trigram Indexes (for fuzzy search)
- `idx_ip_assets_title_trgm`: GIN trigram index on title
- `idx_ip_assets_description_trgm`: GIN trigram index on description

#### JSONB Indexes (for metadata filtering)
- `idx_ip_assets_metadata_tags`: GIN index on metadata->tags path

#### Composite Indexes (for common query patterns)
- `idx_ip_assets_status_created`: (status, created_at DESC)
- `idx_ip_assets_type_status_created`: (type, status, created_at DESC)
- `idx_ip_assets_project_status`: (project_id, status)
- `idx_ip_assets_updated_at`: (updated_at DESC)

## API Endpoints

### Search Endpoints

#### Unified Search
```typescript
search: protectedProcedure
  .input(searchQuerySchema)
  .query()
```
Main search endpoint supporting all features.

**Input:**
```typescript
{
  query: string;              // Search term (min 2, max 200 chars)
  entities?: string[];        // Entity types to search
  filters?: {
    assetType?: string[];     // Asset type filter
    assetStatus?: string[];   // Status filter
    projectId?: string;       // Project filter
    creatorId?: string;       // Creator filter
    dateFrom?: Date;          // Date range start
    dateTo?: Date;            // Date range end
    tags?: string[];          // Tag filter
    createdBy?: string;       // Creator user ID
  };
  page?: number;              // Page number (default: 1)
  limit?: number;             // Results per page (default: 20, max: 100)
  sortBy?: string;            // Sort field (relevance, created_at, etc.)
  sortOrder?: 'asc' | 'desc'; // Sort direction
}
```

**Output:**
```typescript
{
  results: Array<{
    id: string;
    title: string;
    description?: string;
    type: string;
    status: string;
    relevanceScore: number;
    thumbnailUrl?: string;
    metadata: object;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  facets: {
    entityCounts: object;
  };
  executionTimeMs: number;
}
```

#### Autocomplete Suggestions
```typescript
getAssetSuggestions: protectedProcedure
  .input({ query: string, limit?: number })
  .query()
```
Returns quick suggestions for typeahead.

#### Faceted Search
```typescript
getAssetFacets: protectedProcedure
  .input({ query?: string, filters?: object })
  .query()
```
Returns available filter options with counts.

#### Recent Searches
```typescript
getRecentSearches: protectedProcedure
  .input({ limit?: number })
  .query()
```
Returns user's recent search history.

#### Saved Searches
```typescript
saveSearch: protectedProcedure
  .input({ name: string, query: string, entities?: string[], filters?: object })
  .mutation()

getSavedSearches: protectedProcedure
  .query()

deleteSavedSearch: protectedProcedure
  .input({ id: string })
  .mutation()
```
CRUD operations for saved searches.

## Search Service Architecture

### Core Components

#### SearchService
Main service class coordinating all search operations:
- `search()`: Main search orchestrator
- `searchAssets()`: Asset-specific search with permission filtering
- `getAssetSuggestions()`: Autocomplete functionality
- `getAssetFacets()`: Faceted search calculations
- `getRecentSearches()`: Search history retrieval

#### Permission Filtering
Implemented in each search method:
1. Fetch user and related entities (creator, brand)
2. Build Prisma where clause based on user role
3. Apply role-specific filters before other query filters
4. Execute query with combined filters

#### Relevance Scoring
Multi-factor algorithm:
```typescript
finalScore = 
  textualRelevance × 0.5 +
  recencyScore × 0.2 +
  popularityScore × 0.2 +
  qualityScore × 0.1
```

#### Analytics Tracking
Every search is logged to `search_analytics_events` table for:
- Query analysis
- Performance monitoring
- Zero-result detection
- User behavior insights

## Performance Considerations

### Optimizations Implemented

1. **Database Indexes**: Comprehensive indexing strategy covering all common query patterns
2. **Permission Pre-filtering**: Apply permission filters before expensive text search
3. **Field Selection**: Query only needed fields, not entire asset records
4. **Result Limiting**: Cap results per entity type to prevent excessive data transfer
5. **Caching Ready**: Architecture supports Redis caching layer (can be added)
6. **Async Analytics**: Search analytics tracking is fire-and-forget

### Query Performance Targets

- Standard search: < 200ms
- Autocomplete: < 100ms
- Facet calculation: < 300ms
- With proper indexes on 10,000+ assets

## Usage Examples

### Basic Text Search
```typescript
const result = await trpc.search.search.query({
  query: "logo design",
  page: 1,
  limit: 20
});
```

### Filtered Search
```typescript
const result = await trpc.search.search.query({
  query: "brand assets",
  filters: {
    assetType: ["IMAGE", "VIDEO"],
    assetStatus: ["APPROVED", "PUBLISHED"],
    projectId: "proj_abc123",
    tags: ["marketing", "social-media"]
  }
});
```

### Autocomplete
```typescript
const suggestions = await trpc.search.getAssetSuggestions.query({
  query: "log",
  limit: 10
});
```

### Save Search
```typescript
const saved = await trpc.search.saveSearch.mutate({
  name: "Marketing Assets - Q4",
  query: "marketing",
  filters: {
    assetType: ["IMAGE"],
    tags: ["q4", "campaign"]
  }
});
```

## Future Enhancements

### Potential Additions
1. **Full-Text Search Engine**: Integrate Elasticsearch or Meilisearch for advanced features
2. **Machine Learning**: AI-powered relevance tuning based on click-through data
3. **Semantic Search**: Vector embeddings for concept-based search
4. **Search Suggestions**: "Did you mean" functionality using edit distance
5. **Advanced Analytics**: Search funnel analysis, A/B testing
6. **Cross-Entity Search**: Unified search across assets, projects, creators, licenses
7. **Saved Search Sharing**: Allow users to share searches with team members
8. **Search Alerts**: Notify users when new assets match saved searches

## Security Notes

- All searches are authenticated (protectedProcedure)
- Permission filtering cannot be bypassed
- SQL injection protected via Prisma parameterization
- Rate limiting recommended for production
- Audit logging via search analytics events

## Maintenance

### Monitoring
- Track query execution times via `executionTimeMs`
- Monitor zero-result queries
- Analyze slow queries in database logs
- Review index usage and update as needed

### Regular Tasks
- Analyze search analytics for optimization opportunities
- Update relevance scoring weights based on metrics
- Clean up old search analytics (retention policy)
- Rebuild indexes if database performance degrades

## Testing

### Test Coverage Required
- Unit tests for search service methods
- Integration tests for search API endpoints
- Permission filtering tests for each role
- Performance tests with large datasets
- Edge cases (empty results, special characters, etc.)

## Deployment

### Migration Steps
1. Apply database migrations:
   - `migrations/add_saved_searches_table.sql`
   - `migrations/add_asset_search_indexes.sql`
2. Regenerate Prisma client: `npx prisma generate`
3. Restart application servers
4. Verify search endpoints are accessible
5. Monitor initial query performance

### Rollback Plan
- Migrations include DROP INDEX statements
- Saved searches table can be dropped without data loss
- Search functionality degrades gracefully without indexes

---

**Implementation Date**: January 2025
**Last Updated**: January 2025
**Version**: 1.0.0
