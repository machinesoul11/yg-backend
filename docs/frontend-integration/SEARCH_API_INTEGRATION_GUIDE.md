# Search API - Frontend Integration Guide

**Module:** Search Service  
**Classification:** 🌐 SHARED - Used by both public website and admin backend  
**Last Updated:** October 17, 2025  
**API Version:** 1.0  
**Protocol:** tRPC over HTTP

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Authentication & Authorization](#authentication--authorization)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Pagination & Filtering](#pagination--filtering)
8. [Rate Limiting](#rate-limiting)

---

## Overview

The Search API provides unified, intelligent search across multiple entity types with advanced relevance scoring, analytics tracking, and comprehensive filtering capabilities.

### Entity Types Supported

- **IP Assets** - Digital content (images, videos, audio, documents)
- **Creators** - Content creators and IP holders
- **Projects** - Brand campaigns and collaborations
- **Licenses** - License agreements and terms

### Key Features

✅ Multi-entity unified search  
✅ Advanced relevance scoring with configurable weights  
✅ Real-time autocomplete suggestions  
✅ Faceted filtering with dynamic counts  
✅ Search analytics and click tracking  
✅ Saved searches functionality  
✅ Spell correction suggestions  
✅ Related content recommendations  
✅ Row-level security (users only see what they have access to)

### Base URL

```
Production: https://ops.yesgoddess.agency/api/trpc
Development: http://localhost:3000/api/trpc
```

---

## API Endpoints

### 1. Unified Search

**🌐 SHARED** - Used by all user types

**Endpoint:** `search.search`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (JWT Bearer Token)

Search across multiple entity types with intelligent relevance ranking.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query (2-200 chars) |
| `entities` | string[] | ❌ | all | Entity types to search: `['assets', 'creators', 'projects', 'licenses']` |
| `filters` | object | ❌ | {} | Advanced filters (see Filters section) |
| `page` | number | ❌ | 1 | Page number (1-based) |
| `limit` | number | ❌ | 20 | Results per page (1-100) |
| `sortBy` | string | ❌ | 'relevance' | Sort field: `relevance`, `created_at`, `updated_at`, `title`, `name` |
| `sortOrder` | string | ❌ | 'desc' | Sort direction: `asc`, `desc` |

**Response Structure:**

```typescript
{
  success: boolean;
  data: {
    results: SearchResult[];        // Array of search results
    pagination: {
      page: number;
      limit: number;
      total: number;                // Total matching results
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    facets: {
      entityCounts: {               // Result counts per entity
        assets: number;
        creators: number;
        projects: number;
        licenses: number;
      };
      assetTypes?: Record<string, number>;
      projectTypes?: Record<string, number>;
      licenseTypes?: Record<string, number>;
      verificationStatus?: Record<string, number>;
      specialties?: Array<{ value: string; count: number }>;
      brands?: Array<{ id: string; name: string; count: number }>;
      dateRanges?: {
        last7Days: number;
        last30Days: number;
        last90Days: number;
        older: number;
      };
    };
    query: string;                  // Echo of search query
    executionTimeMs: number;        // Backend execution time
  };
}
```

---

### 2. Asset-Specific Search

**🌐 SHARED** - Focused asset search

**Endpoint:** `search.searchAssets`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Search exclusively within IP assets.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query (2-200 chars) |
| `filters.assetType` | string[] | ❌ | - | Filter by type: `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT` |
| `filters.assetStatus` | string[] | ❌ | - | Filter by status: `DRAFT`, `ACTIVE`, `ARCHIVED` |
| `filters.projectId` | string | ❌ | - | Filter by project (CUID) |
| `filters.creatorId` | string | ❌ | - | Filter by creator (CUID) |
| `filters.dateFrom` | string/Date | ❌ | - | Start date filter (ISO 8601) |
| `filters.dateTo` | string/Date | ❌ | - | End date filter (ISO 8601) |
| `filters.tags` | string[] | ❌ | - | Filter by tags |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Results per page (1-100) |
| `sortBy` | string | ❌ | 'relevance' | Sort: `relevance`, `created_at`, `updated_at`, `title` |
| `sortOrder` | string | ❌ | 'desc' | Order: `asc`, `desc` |

**Response:** Same structure as unified search, but `results` only contain assets.

---

### 3. Creator-Specific Search

**🌐 SHARED** - Find creators

**Endpoint:** `search.searchCreators`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Search for content creators with specialty and location filtering.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query (2-200 chars) |
| `filters.verificationStatus` | string[] | ❌ | - | `PENDING`, `VERIFIED`, `REJECTED` |
| `filters.specialties` | string[] | ❌ | - | Creator specialties |
| `filters.industry` | string[] | ❌ | - | Industry categories |
| `filters.category` | string[] | ❌ | - | Content categories |
| `filters.country` | string | ❌ | - | Country code (ISO 3166-1) |
| `filters.region` | string | ❌ | - | State/province |
| `filters.city` | string | ❌ | - | City name |
| `filters.availabilityStatus` | string | ❌ | - | `available`, `limited`, `unavailable` |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Results per page (1-100) |
| `sortBy` | string | ❌ | 'relevance' | Sort: `relevance`, `created_at`, `name`, `verified_at`, `total_collaborations`, `average_rating` |
| `sortOrder` | string | ❌ | 'desc' | Order: `asc`, `desc` |

**Response:** Same structure as unified search, but `results` only contain creators.

---

### 4. Project-Specific Search

**🔒 ADMIN ONLY** - Brand project search

**Endpoint:** `search.searchProjects`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (Admin/Brand users)

Search brand projects and campaigns.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query (2-200 chars) |
| `filters.projectType` | string[] | ❌ | - | `CAMPAIGN`, `CONTENT`, `EVENT`, etc. |
| `filters.projectStatus` | string[] | ❌ | - | `PLANNING`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `filters.brandId` | string | ❌ | - | Filter by brand (CUID) |
| `filters.dateFrom` | string/Date | ❌ | - | Start date filter |
| `filters.dateTo` | string/Date | ❌ | - | End date filter |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Results per page (1-100) |
| `sortBy` | string | ❌ | 'relevance' | Sort: `relevance`, `created_at`, `updated_at`, `name` |
| `sortOrder` | string | ❌ | 'desc' | Order: `asc`, `desc` |

---

### 5. Get Autocomplete Suggestions

**🌐 SHARED** - Real-time search suggestions

**Endpoint:** `search.getSuggestions`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get autocomplete suggestions as user types.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Partial search query (2-100 chars) |
| `entities` | string[] | ❌ | all | Limit suggestions to specific entities |
| `limit` | number | ❌ | 10 | Max suggestions (1-20) |

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    text: string;           // Suggestion text
    entityType: string;     // Where suggestion came from
    count: number;          // How many results it would return
    highlight: string;      // HTML with <mark> tags for matched text
  }>;
}
```

---

### 6. Get Asset-Specific Suggestions

**🌐 SHARED** - Asset autocomplete

**Endpoint:** `search.getAssetSuggestions`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get autocomplete suggestions specifically for assets.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Partial search query (2-100 chars) |
| `limit` | number | ❌ | 10 | Max suggestions (1-20) |

**Response:** Same structure as `getSuggestions`.

---

### 7. Get Asset Facets

**🌐 SHARED** - Dynamic filter options

**Endpoint:** `search.getAssetFacets`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get available filter options with counts for asset search.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ❌ | '' | Current search query |
| `filters.projectId` | string | ❌ | - | Filter context |
| `filters.creatorId` | string | ❌ | - | Filter context |
| `filters.tags` | string[] | ❌ | - | Filter context |

**Response:**

```typescript
{
  success: boolean;
  data: {
    assetTypes: Record<string, number>;      // e.g., { "IMAGE": 45, "VIDEO": 12 }
    statuses: Record<string, number>;        // e.g., { "ACTIVE": 50, "DRAFT": 7 }
    tags: Array<{ value: string; count: number }>;
    creators: Array<{ id: string; name: string; count: number }>;
    projects: Array<{ id: string; name: string; count: number }>;
  };
}
```

---

### 8. Track Result Click

**🌐 SHARED** - Analytics tracking

**Endpoint:** `search.trackClick`  
**Method:** Mutation (POST)  
**Auth Required:** ✅ Yes

Track when user clicks a search result for analytics.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventId` | string | ✅ | Search event ID (returned in search response) |
| `resultId` | string | ✅ | ID of clicked result (CUID) |
| `resultPosition` | number | ✅ | Zero-indexed position in results |
| `resultEntityType` | string | ✅ | Entity type: `assets`, `creators`, `projects`, `licenses` |

**Response:**

```typescript
{
  success: boolean;
}
```

**Usage Note:** Call this endpoint when user clicks a search result. This helps improve search relevance and provides analytics.

---

### 9. Get Recent Searches

**🌐 SHARED** - User search history

**Endpoint:** `search.getRecentSearches`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get user's recent search queries.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | ❌ | 10 | Max searches to return (1-50) |

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    query: string;
    timestamp: string;      // ISO 8601 date
    resultCount: number;
    entities: string[];
  }>;
}
```

---

### 10. Save Search

**🌐 SHARED** - Save frequently used searches

**Endpoint:** `search.saveSearch`  
**Method:** Mutation (POST)  
**Auth Required:** ✅ Yes

Save a search query for quick access later.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ | Display name for saved search (1-100 chars) |
| `query` | string | ✅ | Search query (1-200 chars) |
| `entities` | string[] | ❌ | Entity types to search |
| `filters` | object | ❌ | Filter configuration |

**Response:**

```typescript
{
  success: boolean;
  data: {
    id: string;             // CUID
    name: string;
    searchQuery: string;
    entities: string[];
    filters: object;
    createdAt: string;      // ISO 8601
  };
}
```

---

### 11. Get Saved Searches

**🌐 SHARED** - List user's saved searches

**Endpoint:** `search.getSavedSearches`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get all saved searches for current user.

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    name: string;
    searchQuery: string;
    entities: string[];
    filters: object;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

---

### 12. Execute Saved Search

**🌐 SHARED** - Run a saved search

**Endpoint:** `search.executeSavedSearch`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Execute a previously saved search.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | ✅ | - | Saved search ID (CUID) |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Results per page (1-100) |

**Response:**

```typescript
{
  success: boolean;
  data: {
    search: SearchResponse;      // Same as unified search response
    savedSearchName: string;
  };
}
```

---

### 13. Update Saved Search

**🌐 SHARED** - Modify saved search

**Endpoint:** `search.updateSavedSearch`  
**Method:** Mutation (POST)  
**Auth Required:** ✅ Yes

Update an existing saved search.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Saved search ID (CUID) |
| `name` | string | ❌ | New display name (1-100 chars) |
| `query` | string | ❌ | New search query (1-200 chars) |
| `entities` | string[] | ❌ | New entity types |
| `filters` | object | ❌ | New filter configuration |

**Response:** Same as Save Search.

---

### 14. Delete Saved Search

**🌐 SHARED** - Remove saved search

**Endpoint:** `search.deleteSavedSearch`  
**Method:** Mutation (POST)  
**Auth Required:** ✅ Yes

Delete a saved search.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Saved search ID (CUID) |

**Response:**

```typescript
{
  success: boolean;
}
```

---

### 15. Get Enhanced Facets

**🌐 SHARED** - Rich filter options with counts

**Endpoint:** `search.getEnhancedFacets`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get comprehensive facet information for building advanced filter UIs.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ❌ | '' | Current search query |
| `entities` | string[] | ❌ | all | Entity types to get facets for |
| `filters` | object | ❌ | {} | Current filter state |

**Response:**

```typescript
{
  success: boolean;
  data: {
    groups: Array<{
      field: string;              // Filter field name
      label: string;              // Display label
      type: 'checkbox' | 'radio' | 'range' | 'date';
      options: Array<{
        value: string;
        label: string;
        count: number;            // Results with this filter
        isSelected: boolean;
      }>;
      min?: number;               // For range filters
      max?: number;               // For range filters
    }>;
    appliedFilters: Record<string, string[]>;
    totalResults: number;
    filteredResults: number;
  };
}
```

---

### 16. Get Spelling Suggestion

**🌐 SHARED** - "Did you mean?" functionality

**Endpoint:** `search.getSpellingSuggestion`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get spell correction suggestions for queries with few/no results.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Original search query (2-200 chars) |
| `currentResultCount` | number | ✅ | Number of results for current query |

**Response:**

```typescript
{
  success: boolean;
  data: {
    hasAlternative: boolean;
    suggestion?: {
      originalQuery: string;
      suggestedQuery: string;
      confidence: number;           // 0-1, suggestion confidence
      expectedResultCount: number;  // Results the suggestion would return
      distance: number;             // Edit distance from original
    };
    alternatives?: Array<{          // Multiple suggestions if available
      originalQuery: string;
      suggestedQuery: string;
      confidence: number;
      expectedResultCount: number;
      distance: number;
    }>;
  };
}
```

---

### 17. Get Related Content

**🌐 SHARED** - Content recommendations

**Endpoint:** `search.getRelatedContent`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes

Get content related to a specific entity (e.g., "Similar assets", "More from this creator").

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityType` | string | ✅ | - | `assets`, `creators`, `projects`, `licenses` |
| `entityId` | string | ✅ | - | Entity ID (CUID) |
| `limit` | number | ❌ | 10 | Max results (1-50) |
| `includeTypes` | string[] | ❌ | all | Relationship types to include |
| `excludeIds` | string[] | ❌ | [] | IDs to exclude from results |
| `minRelevanceScore` | number | ❌ | 0.3 | Min relevance (0-1) |

**Relationship Types:**
- `similar_content` - Similar based on attributes
- `same_category` - Same category/type
- `same_creator` - From same creator
- `same_project` - Part of same project
- `collaborative_filtering` - Users who viewed this also viewed
- `frequently_viewed_together` - Often viewed together

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    entityType: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    relevanceScore: number;
    relationshipType: string;
    relationshipReason: string;     // Human-readable explanation
    metadata: EntityMetadata;       // Entity-specific data
  }>;
}
```

---

### Admin-Only Analytics Endpoints

The following endpoints are restricted to admin users for monitoring and optimization.

### 18. Get Search Analytics

**🔒 ADMIN ONLY**

**Endpoint:** `search.getAnalytics`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (Admin role)

Get comprehensive search analytics for a date range.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string/Date | ✅ | Start date (ISO 8601) |
| `endDate` | string/Date | ✅ | End date (ISO 8601) |

**Response:**

```typescript
{
  success: boolean;
  data: {
    totalSearches: number;
    averageExecutionTimeMs: number;
    averageResultsCount: number;
    zeroResultsRate: number;        // Percentage as decimal (0.15 = 15%)
    clickThroughRate: number;       // Percentage as decimal
    topQueries: Array<{
      query: string;
      count: number;
      averageResultsCount: number;
    }>;
    topEntities: Array<{
      entity: string;
      searchCount: number;
    }>;
    zeroResultQueries: Array<{
      query: string;
      count: number;
    }>;
  };
}
```

---

### 19. Get Zero-Result Queries

**🔒 ADMIN ONLY**

**Endpoint:** `search.getZeroResultQueries`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (Admin role)

Get queries that returned no results (for content gap analysis).

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startDate` | string/Date | ✅ | - | Start date (ISO 8601) |
| `endDate` | string/Date | ✅ | - | End date (ISO 8601) |
| `limit` | number | ❌ | 20 | Max queries (1-100) |

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    query: string;
    count: number;              // How many times searched
    lastSearched: string;       // ISO 8601 date
  }>;
}
```

---

### 20. Get Performance Metrics

**🔒 ADMIN ONLY**

**Endpoint:** `search.getPerformanceMetrics`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (Admin role)

Get search performance metrics for optimization.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string/Date | ✅ | Start date (ISO 8601) |
| `endDate` | string/Date | ✅ | End date (ISO 8601) |

**Response:**

```typescript
{
  success: boolean;
  data: {
    averageExecutionTimeMs: number;
    p50LatencyMs: number;       // Median latency
    p95LatencyMs: number;       // 95th percentile
    p99LatencyMs: number;       // 99th percentile
    slowestQueries: Array<{
      query: string;
      executionTimeMs: number;
      timestamp: string;
    }>;
    fastestQueries: Array<{
      query: string;
      executionTimeMs: number;
      timestamp: string;
    }>;
  };
}
```

---

### 21. Get Trending Searches

**🔒 ADMIN ONLY**

**Endpoint:** `search.getTrendingSearches`  
**Method:** Query (GET)  
**Auth Required:** ✅ Yes (Admin role)

Get currently trending search queries.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hours` | number | ❌ | 24 | Time window in hours (1-168) |
| `limit` | number | ❌ | 10 | Max queries (1-50) |

**Response:**

```typescript
{
  success: boolean;
  data: Array<{
    query: string;
    count: number;              // Searches in time window
    trend: 'rising' | 'stable' | 'falling';
    changePercent: number;      // Percentage change from previous period
  }>;
}
```

---

## TypeScript Type Definitions

Copy these types to your frontend codebase:

```typescript
// ============================================================================
// ENUMS & BASIC TYPES
// ============================================================================

export type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';

export type SearchSortBy = 
  | 'relevance' 
  | 'created_at' 
  | 'updated_at' 
  | 'title' 
  | 'name'
  | 'verified_at'
  | 'total_collaborations'
  | 'total_revenue'
  | 'average_rating';

export type SearchSortOrder = 'asc' | 'desc';

export type RelationshipType = 
  | 'similar_content' 
  | 'same_category' 
  | 'same_creator' 
  | 'same_project'
  | 'collaborative_filtering'
  | 'frequently_viewed_together';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface SearchQuery {
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
  page?: number;
  limit?: number;
  sortBy?: SearchSortBy;
  sortOrder?: SearchSortOrder;
}

export interface SearchFilters {
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
  createdBy?: string;
  tags?: string[];
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface SearchResponse {
  results: SearchResult[];
  pagination: PaginationInfo;
  facets: SearchFacets;
  query: string;
  executionTimeMs: number;
}

export interface SearchResult {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  relevanceScore: number;
  scoreBreakdown: ScoreBreakdown;
  highlights: SearchHighlights;
  metadata: EntityMetadata;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ScoreBreakdown {
  textualRelevance: number;
  recencyScore: number;
  popularityScore: number;
  qualityScore: number;
  finalScore: number;
}

export interface SearchHighlights {
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
}

export interface SearchFacets {
  entityCounts: Record<SearchableEntity, number>;
  assetTypes?: Record<string, number>;
  projectTypes?: Record<string, number>;
  licenseTypes?: Record<string, number>;
  statuses?: Record<string, number>;
  verificationStatus?: Record<string, number>;
  specialties?: Array<{ value: string; count: number }>;
  brands?: Array<{ id: string; name: string; count: number }>;
  dateRanges?: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
    older: number;
  };
}

// ============================================================================
// ENTITY METADATA
// ============================================================================

export type EntityMetadata = 
  | AssetMetadata 
  | CreatorMetadata 
  | ProjectMetadata 
  | LicenseMetadata;

export interface AssetMetadata {
  type: 'asset';
  assetType: string;
  status: string;
  fileSize: bigint | number;
  mimeType: string;
  thumbnailUrl?: string | null;
  createdBy: string;
  tags?: string[];
}

export interface CreatorMetadata {
  type: 'creator';
  stageName: string;
  verificationStatus: string;
  specialties: string[];
  avatar?: string | null;
  portfolioUrl?: string | null;
  availability?: {
    status: 'available' | 'limited' | 'unavailable';
    nextAvailable?: string;
  } | null;
  performanceMetrics?: {
    totalCollaborations?: number;
    totalRevenue?: number;
    averageRating?: number;
    recentActivityScore?: number;
  } | null;
}

export interface ProjectMetadata {
  type: 'project';
  projectType: string;
  status: string;
  brandName: string;
  budgetCents: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface LicenseMetadata {
  type: 'license';
  licenseType: string;
  status: string;
  feeCents: number;
  startDate: Date | string;
  endDate: Date | string;
  assetTitle: string;
  brandName: string;
}

// ============================================================================
// SUGGESTIONS & AUTOCOMPLETE
// ============================================================================

export interface Suggestion {
  text: string;
  entityType: SearchableEntity;
  count: number;
  highlight: string;
}

// ============================================================================
// SPELL CORRECTION
// ============================================================================

export interface SpellingSuggestion {
  originalQuery: string;
  suggestedQuery: string;
  confidence: number;
  expectedResultCount: number;
  distance: number;
}

export interface DidYouMeanResponse {
  hasAlternative: boolean;
  suggestion?: SpellingSuggestion;
  alternatives?: SpellingSuggestion[];
}

// ============================================================================
// RELATED CONTENT
// ============================================================================

export interface RelatedContent {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  relevanceScore: number;
  relationshipType: RelationshipType;
  relationshipReason: string;
  metadata: EntityMetadata;
}

export interface RelatedContentOptions {
  limit?: number;
  includeTypes?: RelationshipType[];
  excludeIds?: string[];
  minRelevanceScore?: number;
}

// ============================================================================
// ENHANCED FACETS
// ============================================================================

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  isSelected?: boolean;
}

export interface FacetGroup {
  field: string;
  label: string;
  type: 'checkbox' | 'radio' | 'range' | 'date';
  options: FacetOption[];
  min?: number;
  max?: number;
}

export interface EnhancedSearchFacets {
  groups: FacetGroup[];
  appliedFilters: Record<string, string[]>;
  totalResults: number;
  filteredResults: number;
}

// ============================================================================
// SAVED SEARCHES
// ============================================================================

export interface SavedSearch {
  id: string;
  name: string;
  searchQuery: string;
  entities: SearchableEntity[];
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// RECENT SEARCHES
// ============================================================================

export interface RecentSearch {
  query: string;
  timestamp: string;
  resultCount: number;
  entities: SearchableEntity[];
}

// ============================================================================
// ANALYTICS (Admin Only)
// ============================================================================

export interface SearchAnalytics {
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
}

export interface PerformanceMetrics {
  averageExecutionTimeMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  slowestQueries: Array<{
    query: string;
    executionTimeMs: number;
    timestamp: string;
  }>;
  fastestQueries: Array<{
    query: string;
    executionTimeMs: number;
    timestamp: string;
  }>;
}

export interface TrendingSearch {
  query: string;
  count: number;
  trend: 'rising' | 'stable' | 'falling';
  changePercent: number;
}
```

---

## Authentication & Authorization

### Authentication

All search endpoints require JWT authentication except where noted.

**Headers Required:**

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Getting the JWT Token:**

1. User authenticates via NextAuth.js
2. Token is stored in session
3. Frontend automatically includes token in tRPC requests

### Authorization Matrix

| Endpoint | Public | Creator | Brand | Admin |
|----------|--------|---------|-------|-------|
| Unified Search | ❌ | ✅ | ✅ | ✅ |
| Asset Search | ❌ | ✅ | ✅ | ✅ |
| Creator Search | ❌ | ✅ | ✅ | ✅ |
| Project Search | ❌ | ❌ | ✅ | ✅ |
| Suggestions | ❌ | ✅ | ✅ | ✅ |
| Facets | ❌ | ✅ | ✅ | ✅ |
| Track Click | ❌ | ✅ | ✅ | ✅ |
| Recent Searches | ❌ | ✅ | ✅ | ✅ |
| Saved Searches | ❌ | ✅ | ✅ | ✅ |
| Related Content | ❌ | ✅ | ✅ | ✅ |
| Spell Correction | ❌ | ✅ | ✅ | ✅ |
| Analytics | ❌ | ❌ | ❌ | ✅ |
| Performance Metrics | ❌ | ❌ | ❌ | ✅ |
| Trending Searches | ❌ | ❌ | ❌ | ✅ |
| Zero-Result Queries | ❌ | ❌ | ❌ | ✅ |

### Row-Level Security

**Important:** Search results are automatically filtered based on user permissions:

- **Creators** see:
  - Their own assets, projects, licenses
  - Public content from other creators
  - Brands they're collaborating with
  
- **Brands** see:
  - Their own projects and licenses
  - Assets from creators they're working with
  - Public creator profiles
  
- **Admins** see:
  - Everything (no restrictions)

**No special filtering needed in frontend** - the backend automatically applies security rules.

---

Continue to [Part 2: Request/Response Examples, Error Handling, and Implementation Guide →](./SEARCH_API_INTEGRATION_GUIDE_PART2.md)
