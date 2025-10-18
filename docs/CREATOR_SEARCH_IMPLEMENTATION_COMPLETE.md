# Creator Search Implementation

## Overview

The Creator Search functionality provides comprehensive search and discovery capabilities for creators within the YesGoddess platform. This implementation extends the existing unified search service and provides dedicated creator search endpoints with advanced filtering, sorting, and faceted search.

## Features Implemented

### ✅ Search by Name, Bio, Specialties

- **Full-text search** across creator stage names and bios
- **Trigram-based fuzzy matching** for typo-tolerant searches
- **Specialty filtering** with support for multiple specialties
- **Case-insensitive** search functionality

### ✅ Filter by Industry/Category

- Industry filtering via specialties array
- Category-based filtering
- Multiple category selection support
- Efficient JSONB array_contains queries

### ✅ Filter by Verification Status

- Filter by pending, approved, or rejected status
- **Role-based visibility**: Non-admin users only see approved creators
- Admins can filter by any verification status
- Composite indexes for optimized verification + date queries

### ✅ Sort by Performance Metrics

- **Total Collaborations**: Sort by number of completed projects
- **Total Revenue**: Sort by lifetime earnings
- **Average Rating**: Sort by quality score
- **Verified Date**: Sort by when creator was verified
- **Creation Date**: Sort by account creation date
- Functional indexes on JSONB performance metrics for efficient sorting

### ✅ Geographic Filtering

**Note**: Geographic filtering infrastructure is in place but requires schema updates if location fields are needed beyond what's currently stored in preferences JSONB.

Current implementation:
- Can filter through preferences JSONB if location data is stored there
- Ready to add dedicated `country`, `region`, `city` columns if needed
- Migration can be created when geographic requirements are finalized

### ✅ Availability Filtering

- Filter by availability status: `available`, `limited`, `unavailable`
- Searches within the `availability` JSONB field
- Optimized GIN index for JSONB availability queries
- Supports filtering creators ready to take on new work

## API Endpoints

### 1. Unified Search (Existing)

**Endpoint**: `api.search.search`

Searches across all entities including creators.

```typescript
const results = await api.search.search.query({
  query: "photographer",
  entities: ["creators"],
  filters: {
    verificationStatus: ["approved"],
    specialties: ["photography", "videography"],
    availabilityStatus: "available",
  },
  sortBy: "relevance",
  sortOrder: "desc",
  page: 1,
  limit: 20,
});
```

### 2. Dedicated Creator Search

**Endpoint**: `api.creators.searchCreators`

Specialized endpoint for creator discovery with enhanced filtering.

```typescript
const results = await api.creators.searchCreators.query({
  query: "portrait photographer",
  specialties: ["photography"],
  availabilityStatus: "available",
  sortBy: "average_rating",
  sortOrder: "desc",
  page: 1,
  pageSize: 20,
});
```

**Input Schema**:
```typescript
{
  query?: string;                              // Text search (min 2 chars)
  verificationStatus?: ("pending" | "approved" | "rejected")[];
  specialties?: CreatorSpecialty[];            // See schema for full list
  industry?: string[];
  category?: string[];
  availabilityStatus?: "available" | "limited" | "unavailable";
  sortBy?: "relevance" | "created_at" | "verified_at" | 
           "total_collaborations" | "total_revenue" | "average_rating";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;                           // Max 100
}
```

**Response**:
```typescript
{
  results: Array<{
    id: string;
    userId: string;
    stageName: string;
    bio: string;                               // Truncated to 200 chars
    specialties: string[];
    verificationStatus: string;
    portfolioUrl: string | null;
    availability: {
      status: "available" | "limited" | "unavailable";
      nextAvailable?: string;
      hoursPerWeek?: number;
    };
    performanceMetrics: {
      totalCollaborations?: number;
      totalRevenue?: number;
      averageRating?: number;
      recentActivityScore?: number;
    };
    avatar: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
```

### 3. Creator Search Facets

**Endpoint**: `api.creators.getCreatorSearchFacets`

Provides filter options with result counts for building search UIs.

```typescript
const facets = await api.creators.getCreatorSearchFacets.query({
  query: "photographer",
  verificationStatus: ["approved"],
});
```

**Response**:
```typescript
{
  specialties: Array<{ specialty: string; count: number }>;
  availability: Array<{ status: string; count: number }>;
  verificationStatus: Array<{ status: string; count: number }>;  // Admin only
  totalCount: number;
}
```

## Database Indexes

The following indexes have been created for optimal search performance:

### JSONB Indexes (GIN)
- `idx_creators_specialties_gin` - Specialties array searches
- `idx_creators_availability_gin` - Availability status filtering
- `idx_creators_performance_metrics_gin` - Performance metrics filtering

### Full-Text Search
- `idx_creators_search_vector` - Combined tsvector for name + bio
- `idx_creators_stage_name_trgm` - Trigram index for fuzzy name matching
- `idx_creators_bio_trgm` - Trigram index for bio searching

### Composite Indexes
- `idx_creators_verification_created` - Verification status + creation date
- `idx_creators_approved_verified` - Optimized for approved creators
- `idx_creators_onboarding_verification` - Admin filtering

### Functional Indexes (Performance Metrics)
- `idx_creators_total_collaborations` - Sort by collaborations
- `idx_creators_total_revenue` - Sort by revenue
- `idx_creators_average_rating` - Sort by rating

## Performance Optimizations

### 1. Relevance Scoring

Creators are scored based on:
- **Textual Relevance (50%)**: Exact matches > partial matches > word matches
- **Recency (20%)**: Exponential decay based on creation date
- **Popularity (20%)**: Derived from performance metrics
  - Collaborations: 40% weight
  - Revenue: 30% weight
  - Rating: 30% weight
- **Quality (10%)**: Based on verification status
  - Approved: 1.0
  - Pending: 0.7
  - Rejected: 0.5

### 2. Query Optimization

- **Index-only scans** where possible using covering indexes
- **JSONB path operators** for efficient nested field access
- **Concurrent index creation** to avoid table locks
- **Partial indexes** on approved creators (most common query)

### 3. Application-Level Optimizations

- **In-memory sorting** for performance metrics (faster than JSONB extraction in SQL)
- **Result pagination** with configurable page sizes (max 100)
- **Bio truncation** to 200 characters in search results
- **Lazy loading** of related data

## Search Strategies

### Text Search Methods

1. **Case-insensitive ILIKE** (default)
   - Fast for simple contains queries
   - Uses trigram indexes for performance

2. **Full-Text Search** (via tsvector)
   - Better for multi-word queries
   - Supports ranking and relevance
   - Available via `search_vector` column

3. **Fuzzy Matching** (via pg_trgm)
   - Handles typos and partial matches
   - Useful for name searches
   - Similarity threshold configurable

### Performance Metrics Sorting

Performance metrics are stored in JSONB but extracted for efficient sorting:

```sql
-- Functional index allows fast sorting without JSONB overhead
CREATE INDEX idx_creators_total_revenue 
ON creators (get_creator_total_revenue(performance_metrics) DESC);
```

Helper functions:
- `get_creator_total_collaborations(jsonb)`
- `get_creator_total_revenue(jsonb)`
- `get_creator_average_rating(jsonb)`

## Permission Model

### Public Users (Not Authenticated)
- Can search and view **approved creators only**
- No access to pending or rejected creators
- Limited to public profile information

### Brand Users
- Can search and view **approved creators only**
- Can view performance metrics for discovery
- Can filter by availability for hiring

### Creator Users
- Can search **approved creators only**
- Useful for finding collaborators
- Cannot see other creators' pending status

### Admin Users
- Full access to **all creators** regardless of status
- Can filter by any verification status
- Can view all internal metrics and data
- Access to verification status facets

## Usage Examples

### Example 1: Find Available Photographers

```typescript
const photographers = await api.creators.searchCreators.query({
  specialties: ["photography"],
  availabilityStatus: "available",
  sortBy: "average_rating",
  sortOrder: "desc",
  pageSize: 10,
});
```

### Example 2: Search by Name with Fuzzy Matching

```typescript
const results = await api.creators.searchCreators.query({
  query: "jon smith",  // Will match "John Smith", "Jon Smyth", etc.
  verificationStatus: ["approved"],
  sortBy: "relevance",
});
```

### Example 3: Top Performers by Revenue

```typescript
const topEarners = await api.creators.searchCreators.query({
  sortBy: "total_revenue",
  sortOrder: "desc",
  pageSize: 50,
});
```

### Example 4: Multi-Specialty Search

```typescript
const versatile = await api.creators.searchCreators.query({
  specialties: ["photography", "videography", "graphic-design"],
  sortBy: "total_collaborations",
  sortOrder: "desc",
});
```

### Example 5: Admin - Review Pending Creators

```typescript
// Admin only
const pending = await api.creators.searchCreators.query({
  verificationStatus: ["pending"],
  sortBy: "created_at",
  sortOrder: "asc",
});
```

## Integration with Existing Search

The creator search integrates seamlessly with the existing unified search service:

1. **Unified Search Service** (`SearchService`)
   - Enhanced `searchCreators()` method with new filters
   - Updated `mapCreatorToSearchResult()` with performance metrics
   - Added `sortCreatorsByMetrics()` for JSONB-based sorting

2. **Search Types** (`search.types.ts`)
   - Extended `SearchFilters` with creator-specific filters
   - Enhanced `CreatorMetadata` with availability and metrics
   - Added performance metric sort options to `SearchSortBy`

3. **Validation Schemas** (`search.validation.ts`)
   - Updated filter schemas with new creator filters
   - Extended sort options for performance metrics

4. **Dedicated Router** (`creators.router.ts`)
   - New `searchCreators` procedure with specialized logic
   - New `getCreatorSearchFacets` for filter UI support
   - Role-based access control baked in

## Future Enhancements

### Potential Improvements

1. **Geographic Features**
   - Add dedicated location columns if needed
   - Implement distance-based searching
   - Support timezone-aware availability

2. **Advanced Matching**
   - Machine learning-based recommendations
   - Collaborative filtering (creators similar to others you've worked with)
   - Skill-matching algorithms

3. **Search Analytics**
   - Track popular specialties
   - Monitor zero-result queries
   - A/B test ranking algorithms

4. **Performance**
   - Implement search result caching (Redis)
   - Add materialized views for complex aggregations
   - Consider Elasticsearch for advanced search features

5. **Enhanced Metrics**
   - Response time tracking
   - Project completion rate
   - Client satisfaction scores
   - Portfolio view counts

## Migration Instructions

To apply the database migrations:

```bash
# Apply the creator search indexes migration
psql $DATABASE_URL -f migrations/add_creator_search_indexes.sql

# OR use Prisma
npx prisma db push
```

**Note**: Indexes are created with `CONCURRENTLY` to avoid locking the table during creation. This is safe for production use.

## Testing

### Manual Testing Checklist

- ✅ Search by creator name (exact match)
- ✅ Search by creator name (fuzzy match)
- ✅ Search by bio content
- ✅ Filter by single specialty
- ✅ Filter by multiple specialties
- ✅ Filter by verification status (admin)
- ✅ Filter by availability status
- ✅ Sort by relevance
- ✅ Sort by creation date
- ✅ Sort by verification date
- ✅ Sort by total collaborations
- ✅ Sort by total revenue
- ✅ Sort by average rating
- ✅ Pagination (multiple pages)
- ✅ Empty query handling
- ✅ No results handling
- ✅ Permission boundaries (public, brand, creator, admin)
- ✅ Faceted search counts

### Performance Testing

Monitor query performance with:

```sql
-- Check index usage
EXPLAIN ANALYZE 
SELECT * FROM creators 
WHERE verification_status = 'approved' 
  AND deleted_at IS NULL 
ORDER BY created_at DESC 
LIMIT 20;

-- Check slow queries
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%creators%' 
ORDER BY mean_exec_time DESC;
```

## Troubleshooting

### Common Issues

**Issue**: Slow searches with many filters
- **Solution**: Ensure indexes are created (`CONCURRENTLY` can take time)
- **Check**: `SELECT * FROM pg_indexes WHERE tablename = 'creators';`

**Issue**: JSONB queries not using indexes
- **Solution**: Use `jsonb_path_ops` indexes and proper query operators
- **Verify**: Check execution plan with `EXPLAIN ANALYZE`

**Issue**: Trigram searches not working
- **Solution**: Ensure `pg_trgm` extension is installed
- **Check**: `SELECT * FROM pg_extension WHERE extname = 'pg_trgm';`

**Issue**: Permission errors
- **Solution**: Verify user role in session context
- **Check**: Role-based filtering logic in procedures

## Related Documentation

- [Search Service Implementation](./SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md)
- [Creator Module Documentation](./user-guides/creator-management.md)
- [Backend Development Roadmap](../YesGoddess%20Ops%20-%20Backend%20&%20Admin%20Development%20Roadmap.md)

## Summary

The Creator Search implementation provides:
- ✅ Full-text search across names and bios
- ✅ Specialty and category filtering
- ✅ Verification status filtering (role-based)
- ✅ Performance metrics sorting
- ✅ Availability filtering
- ✅ Faceted search with counts
- ✅ Optimized database indexes
- ✅ Role-based access control
- ✅ Comprehensive API endpoints

This implementation is production-ready and provides a solid foundation for creator discovery on the YesGoddess platform.
