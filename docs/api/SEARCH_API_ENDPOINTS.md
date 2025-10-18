# Search API Endpoints - Complete Reference

## Overview

All search endpoints are accessible via tRPC at `/api/trpc/search.*`. These endpoints provide comprehensive search functionality across assets, creators, projects, and licenses with advanced filtering, sorting, and autocomplete capabilities.

## Authentication

All endpoints require authentication via `protectedProcedure` unless otherwise specified. Admin-only endpoints use `adminProcedure`.

## Core Search Endpoints

### 1. Unified Search

**Endpoint:** `search.search`

**Method:** Query

**Description:** Search across multiple entity types (assets, creators, projects, licenses) with unified relevance scoring.

**Input:**
```typescript
{
  query: string;              // 2-200 characters
  entities?: ('assets' | 'creators' | 'projects' | 'licenses')[];
  filters?: {
    // Asset filters
    assetType?: string[];
    assetStatus?: string[];
    projectId?: string;
    creatorId?: string;
    
    // Creator filters
    verificationStatus?: string[];
    specialties?: string[];
    industry?: string[];
    category?: string[];
    country?: string;
    region?: string;
    city?: string;
    availabilityStatus?: 'available' | 'limited' | 'unavailable';
    
    // Project filters
    projectType?: string[];
    projectStatus?: string[];
    brandId?: string;
    
    // License filters
    licenseType?: string[];
    licenseStatus?: string[];
    
    // Common filters
    dateFrom?: string | Date;
    dateTo?: string | Date;
    tags?: string[];
  };
  page?: number;              // Default: 1
  limit?: number;             // Default: 20, Max: 100
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title' | 'name';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
}
```

**Response:**
```typescript
{
  success: boolean;
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
    facets: SearchFacets;
    query: string;
    executionTimeMs: number;
  };
}
```

---

### 2. Asset-Specific Search

**Endpoint:** `search.searchAssets`

**Method:** Query

**Description:** Search specifically for IP assets with asset-specific filters and sorting.

**Input:**
```typescript
{
  query: string;              // 2-200 characters
  filters?: {
    assetType?: string[];
    assetStatus?: string[];
    projectId?: string;
    creatorId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    tags?: string[];
  };
  page?: number;              // Default: 1
  limit?: number;             // Default: 20, Max: 100
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  success: boolean;
  data: SearchResponse; // Same as unified search
}
```

**Example Usage:**
```typescript
const result = await trpc.search.searchAssets.query({
  query: "product photography",
  filters: {
    assetType: ["IMAGE"],
    assetStatus: ["APPROVED", "PUBLISHED"]
  },
  sortBy: "created_at",
  limit: 20
});
```

---

### 3. Creator-Specific Search

**Endpoint:** `search.searchCreators`

**Method:** Query

**Description:** Search for creators with creator-specific filters and sorting.

**Input:**
```typescript
{
  query: string;              // 2-200 characters
  filters?: {
    verificationStatus?: string[];
    specialties?: string[];
    industry?: string[];
    category?: string[];
    country?: string;
    region?: string;
    city?: string;
    availabilityStatus?: 'available' | 'limited' | 'unavailable';
  };
  page?: number;              // Default: 1
  limit?: number;             // Default: 20, Max: 100
  sortBy?: 'relevance' | 'created_at' | 'name' | 'verified_at' | 'total_collaborations' | 'average_rating';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  success: boolean;
  data: SearchResponse;
}
```

**Example Usage:**
```typescript
const result = await trpc.search.searchCreators.query({
  query: "fashion photographer",
  filters: {
    verificationStatus: ["verified"],
    specialties: ["photography", "fashion"],
    availabilityStatus: "available"
  },
  sortBy: "total_collaborations",
  limit: 10
});
```

---

### 4. Project-Specific Search

**Endpoint:** `search.searchProjects`

**Method:** Query

**Description:** Search for projects with project-specific filters and sorting.

**Input:**
```typescript
{
  query: string;              // 2-200 characters
  filters?: {
    projectType?: string[];
    projectStatus?: string[];
    brandId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
  };
  page?: number;              // Default: 1
  limit?: number;             // Default: 20, Max: 100
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  success: boolean;
  data: SearchResponse;
}
```

**Example Usage:**
```typescript
const result = await trpc.search.searchProjects.query({
  query: "summer campaign",
  filters: {
    projectStatus: ["ACTIVE", "IN_PROGRESS"],
    brandId: "clx1234567890"
  },
  sortBy: "updated_at",
  limit: 20
});
```

---

## Autocomplete & Suggestions

### 5. Unified Suggestions

**Endpoint:** `search.getSuggestions`

**Method:** Query

**Description:** Get autocomplete suggestions across multiple entity types for typeahead functionality.

**Input:**
```typescript
{
  query: string;              // 2-100 characters
  entities?: ('assets' | 'creators' | 'projects' | 'licenses')[];
  limit?: number;             // Default: 10, Max: 20
}
```

**Response:**
```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    type: 'asset' | 'creator' | 'project' | 'license';
    subtitle?: string;
    thumbnailUrl?: string | null;
  }>;
}
```

**Example Usage:**
```typescript
// Get suggestions for all entity types
const suggestions = await trpc.search.getSuggestions.query({
  query: "fashion",
  limit: 10
});

// Get suggestions for specific entities only
const creatorSuggestions = await trpc.search.getSuggestions.query({
  query: "john",
  entities: ["creators"],
  limit: 5
});
```

---

### 6. Asset Suggestions (Legacy)

**Endpoint:** `search.getAssetSuggestions`

**Method:** Query

**Description:** Get autocomplete suggestions specifically for assets. This is a specialized version optimized for asset searches.

**Input:**
```typescript
{
  query: string;              // 2-100 characters
  limit?: number;             // Default: 10, Max: 20
}
```

**Response:**
```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    thumbnailUrl?: string | null;
  }>;
}
```

---

### 7. Recent Searches

**Endpoint:** `search.getRecentSearches`

**Method:** Query

**Description:** Get the user's recent search queries.

**Input:**
```typescript
{
  limit?: number;             // Default: 10, Max: 50
}
```

**Response:**
```typescript
{
  success: boolean;
  data: Array<{
    query: string;
    entities: string[];
    createdAt: Date;
  }>;
}
```

**Example Usage:**
```typescript
const recentSearches = await trpc.search.getRecentSearches.query({
  limit: 10
});
```

---

## Advanced Features

### 8. Asset Facets

**Endpoint:** `search.getAssetFacets`

**Method:** Query

**Description:** Get faceted search results with counts for filtering options.

**Input:**
```typescript
{
  query?: string;
  filters?: {
    projectId?: string;
    creatorId?: string;
    tags?: string[];
  };
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    types: Record<string, number>;
    statuses: Record<string, number>;
    projects: Array<{ id: string; name: string; count: number }>;
    creators: Array<{ id: string; name: string; count: number }>;
  };
}
```

---

### 9. Saved Searches

#### Save a Search

**Endpoint:** `search.saveSearch`

**Method:** Mutation

**Input:**
```typescript
{
  name: string;               // 1-100 characters
  query: string;              // 1-200 characters
  entities?: ('assets' | 'creators' | 'projects' | 'licenses')[];
  filters?: SearchFilters;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: SavedSearch;
}
```

#### Get Saved Searches

**Endpoint:** `search.getSavedSearches`

**Method:** Query

**Response:**
```typescript
{
  success: boolean;
  data: SavedSearch[];
}
```

#### Delete Saved Search

**Endpoint:** `search.deleteSavedSearch`

**Method:** Mutation

**Input:**
```typescript
{
  id: string;
}
```

---

## Analytics Endpoints (Admin Only)

### 10. Search Analytics

**Endpoint:** `search.getAnalytics`

**Method:** Query (Admin only)

**Input:**
```typescript
{
  startDate: string | Date;
  endDate: string | Date;
}
```

---

### 11. Zero-Result Queries

**Endpoint:** `search.getZeroResultQueries`

**Method:** Query (Admin only)

**Input:**
```typescript
{
  startDate: string | Date;
  endDate: string | Date;
  limit?: number;             // Default: 20, Max: 100
}
```

---

### 12. Performance Metrics

**Endpoint:** `search.getPerformanceMetrics`

**Method:** Query (Admin only)

**Input:**
```typescript
{
  startDate: string | Date;
  endDate: string | Date;
}
```

---

### 13. Trending Searches

**Endpoint:** `search.getTrendingSearches`

**Method:** Query (Admin only)

**Input:**
```typescript
{
  hours?: number;             // Default: 24, Max: 168
  limit?: number;             // Default: 10, Max: 50
}
```

---

### 14. Track Click

**Endpoint:** `search.trackClick`

**Method:** Mutation

**Description:** Track when a user clicks on a search result for analytics.

**Input:**
```typescript
{
  eventId: string;
  resultId: string;
  resultPosition: number;
  resultEntityType: 'assets' | 'creators' | 'projects' | 'licenses';
}
```

---

## Permission Model

### Role-Based Access

- **ADMIN/VIEWER**: Can search and view all content
- **CREATOR**: Can only search and view:
  - Assets they own (active ownership)
  - Their own creator profile
  - All projects and licenses
- **BRAND**: Can only search and view:
  - Assets in their projects
  - Assets they have active licenses for
  - Projects they own
  - Their own licenses
  - All creators

### Security Features

- All queries respect row-level security
- Permission filtering applied at database level
- No unauthorized data leakage in search results
- Analytics tracking for all searches
- Rate limiting on search endpoints (configured separately)

---

## Search Algorithm

### Relevance Scoring

Search results are ranked using a composite score with the following components:

1. **Textual Relevance (50%)**: Based on title and description matches
2. **Recency Score (20%)**: Exponential decay based on age
3. **Popularity Score (20%)**: View count, usage, and favorites
4. **Quality Score (10%)**: Verification status and content quality

### Query Processing

- Minimum query length: 2 characters
- Maximum query length: 200 characters
- Special characters are sanitized
- Case-insensitive matching
- Partial word matching supported

### Performance Optimization

- Database indexes on searchable fields
- GIN indexes for JSONB metadata
- Trigram indexes for fuzzy matching
- Query result caching with Redis
- Parallel entity search execution

---

## Error Handling

All endpoints return consistent error responses:

```typescript
{
  success: false;
  error: {
    code: 'INTERNAL_SERVER_ERROR' | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'NOT_FOUND';
    message: string;
  };
}
```

Common error scenarios:
- Query too short (< 2 characters)
- Query too long (> 200 characters)
- Invalid entity type
- Invalid filter values
- Database connection errors
- Permission denied

---

## Usage Examples

### Basic Search
```typescript
// Simple keyword search across all entities
const results = await trpc.search.search.query({
  query: "fashion photography"
});
```

### Filtered Search
```typescript
// Search with multiple filters
const results = await trpc.search.search.query({
  query: "product photo",
  entities: ["assets"],
  filters: {
    assetType: ["IMAGE"],
    assetStatus: ["APPROVED"],
    dateFrom: "2024-01-01T00:00:00Z",
    tags: ["product", "commercial"]
  },
  sortBy: "relevance",
  page: 1,
  limit: 20
});
```

### Typeahead Search
```typescript
// Get suggestions as user types
const suggestions = await trpc.search.getSuggestions.query({
  query: "fash",
  entities: ["creators", "assets"],
  limit: 5
});
```

### Entity-Specific Search
```typescript
// Search only creators
const creators = await trpc.search.searchCreators.query({
  query: "photographer",
  filters: {
    verificationStatus: ["verified"],
    availabilityStatus: "available"
  },
  sortBy: "total_collaborations",
  limit: 10
});
```

---

## Best Practices

1. **Use entity-specific endpoints** when searching only one type for better performance
2. **Implement debouncing** for autocomplete (300-500ms recommended)
3. **Cache suggestions** on the client for recently typed queries
4. **Track clicks** to improve search analytics
5. **Use filters** to narrow results instead of relying solely on query text
6. **Implement pagination** for large result sets
7. **Show loading states** as search can take 100-500ms
8. **Handle empty results gracefully** with suggestions or filters

---

## Related Documentation

- [Search Service Implementation](../SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md)
- [Asset Search Implementation](../ASSET_SEARCH_IMPLEMENTATION.md)
- [Creator Search Implementation](../CREATOR_SEARCH_IMPLEMENTATION_COMPLETE.md)
- [Project & License Search](../PROJECT_LICENSE_SEARCH_IMPLEMENTATION.md)

---

## Version History

- **v1.0** (2024-01-15): Initial implementation with unified search
- **v1.1** (Current): Added entity-specific endpoints and unified suggestions
