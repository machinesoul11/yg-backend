# Search Service - Frontend Integration Guide (Part 1: API Reference)

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Last Updated:** October 17, 2025  
**Backend Deployment:** `ops.yesgoddess.agency`  
**Architecture:** tRPC API with JWT authentication

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request & Response Schemas](#request--response-schemas)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Pagination & Filtering](#pagination--filtering)

---

## Overview

The Search Service provides unified, intelligent search across multiple entity types with advanced relevance scoring, analytics tracking, and comprehensive filtering capabilities.

### Features

- **Multi-entity search**: Assets, Creators, Projects, Licenses
- **Advanced relevance scoring**: Textual relevance (50%), Recency (20%), Popularity (20%), Quality (10%)
- **Real-time analytics**: Search tracking, click-through rates, zero-result monitoring
- **Smart filtering**: Entity-specific filters with faceted search
- **Autocomplete & suggestions**: Type-ahead search suggestions
- **Saved searches**: Users can save and re-execute searches
- **Search highlights**: Matched terms highlighted in results

### Architecture

```
Frontend (Next.js 15) → tRPC Client → Backend API (ops.yesgoddess.agency)
                                      ↓
                                   Search Service
                                      ↓
                      ┌───────────────┼───────────────┐
                   Assets        Creators        Projects        Licenses
```

---

## API Endpoints

All endpoints use tRPC and require authentication unless noted otherwise.

### 1. Unified Search

**Endpoint:** `trpc.search.search.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required (any authenticated user)  
**Method:** Query

Performs a unified search across multiple entity types with intelligent ranking.

**Request:**
```typescript
{
  query: string;                      // 2-200 characters, required
  entities?: SearchableEntity[];      // ['assets', 'creators', 'projects', 'licenses']
  filters?: SearchFilters;            // See filter schema below
  page?: number;                      // Default: 1, min: 1
  limit?: number;                     // Default: 20, min: 1, max: 100
  sortBy?: SearchSortBy;             // Default: 'relevance'
  sortOrder?: 'asc' | 'desc';        // Default: 'desc'
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
    };
    query: string;
    executionTimeMs: number;
  };
}
```

**Example:**
```typescript
const { data } = await trpc.search.search.query({
  query: 'logo design',
  entities: ['assets', 'creators'],
  filters: {
    assetType: ['IMAGE', 'VECTOR'],
    verificationStatus: ['VERIFIED']
  },
  page: 1,
  limit: 20,
  sortBy: 'relevance'
});
```

---

### 2. Asset-Specific Search

**Endpoint:** `trpc.search.searchAssets.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Specialized search for IP assets only.

**Request:**
```typescript
{
  query: string;                      // 2-200 characters
  filters?: {
    assetType?: string[];             // e.g., ['IMAGE', 'VIDEO', 'AUDIO']
    assetStatus?: string[];           // e.g., ['ACTIVE', 'APPROVED']
    projectId?: string;               // Filter by project
    creatorId?: string;               // Filter by creator
    dateFrom?: string | Date;         // ISO 8601 date
    dateTo?: string | Date;
    tags?: string[];
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:** Same structure as unified search, but only asset results

---

### 3. Creator-Specific Search

**Endpoint:** `trpc.search.searchCreators.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Specialized search for creators with performance metrics.

**Request:**
```typescript
{
  query: string;
  filters?: {
    verificationStatus?: string[];    // e.g., ['VERIFIED', 'PENDING']
    specialties?: string[];           // e.g., ['3D_MODELING', 'PHOTOGRAPHY']
    industry?: string[];              // e.g., ['FASHION', 'TECH']
    category?: string[];
    country?: string;                 // ISO country code
    region?: string;
    city?: string;
    availabilityStatus?: 'available' | 'limited' | 'unavailable';
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'name' | 'verified_at' | 'total_collaborations' | 'average_rating';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:** Same structure as unified search, but only creator results with performance metrics

---

### 4. Project-Specific Search

**Endpoint:** `trpc.search.searchProjects.query()`  
**Classification:** ⚡ HYBRID  
**Authentication:** Required  
**Method:** Query

Search for projects (admin and brand users see different results based on permissions).

**Request:**
```typescript
{
  query: string;
  filters?: {
    projectType?: string[];           // e.g., ['CAMPAIGN', 'CONTENT', 'BRAND_DEAL']
    projectStatus?: string[];         // e.g., ['ACTIVE', 'PLANNING', 'COMPLETED']
    brandId?: string;                 // Filter by brand
    dateFrom?: string | Date;
    dateTo?: string | Date;
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}
```

---

### 5. Get Suggestions (Autocomplete)

**Endpoint:** `trpc.search.getSuggestions.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get autocomplete suggestions as user types.

**Request:**
```typescript
{
  query: string;                      // 2-100 characters
  entities?: SearchableEntity[];      // Limit suggestions to specific entities
  limit?: number;                     // Default: 10, max: 20
}
```

**Response:**
```typescript
{
  success: true;
  data: Array<{
    text: string;                     // Suggestion text
    entityType: SearchableEntity;     // Where this suggestion comes from
    count: number;                    // How many results this would return
  }>;
}
```

**Example:**
```typescript
// User types "log..."
const { data } = await trpc.search.getSuggestions.query({
  query: 'log',
  entities: ['assets'],
  limit: 5
});
// Returns: ['logo', 'logo design', 'logos and branding', ...]
```

---

### 6. Get Asset Suggestions

**Endpoint:** `trpc.search.getAssetSuggestions.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Specialized autocomplete for assets only.

**Request:**
```typescript
{
  query: string;                      // 2-100 characters
  limit?: number;                     // Default: 10, max: 20
}
```

---

### 7. Get Asset Facets

**Endpoint:** `trpc.search.getAssetFacets.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get facet counts for asset filtering UI (useful for building filter panels).

**Request:**
```typescript
{
  query?: string;                     // Optional search query
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
  success: true;
  data: {
    assetTypes: Record<string, number>;     // { "IMAGE": 42, "VIDEO": 18 }
    statuses: Record<string, number>;       // { "ACTIVE": 38, "PENDING": 12 }
    tags: Array<{ value: string; count: number }>;
  };
}
```

---

### 8. Track Search Result Click

**Endpoint:** `trpc.search.trackClick.mutate()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Mutation

Track when a user clicks on a search result (for analytics and improving relevance).

**Request:**
```typescript
{
  eventId: string;                    // From search response (analytics event ID)
  resultId: string;                   // ID of clicked entity
  resultPosition: number;             // 0-based position in results
  resultEntityType: SearchableEntity; // Type of entity clicked
}
```

**Response:**
```typescript
{
  success: true;
}
```

**When to call:** Call this immediately when user clicks a search result, but don't block navigation.

**Example:**
```typescript
// User clicks on a search result
const handleResultClick = async (result: SearchResult, position: number) => {
  // Track click asynchronously (don't await)
  trpc.search.trackClick.mutate({
    eventId: searchEventId,        // Stored from search response
    resultId: result.id,
    resultPosition: position,
    resultEntityType: result.entityType
  }).catch(console.error);           // Log errors but don't block UX
  
  // Navigate to result
  router.push(`/${result.entityType}/${result.id}`);
};
```

---

### 9. Get Recent Searches

**Endpoint:** `trpc.search.getRecentSearches.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get user's recent search queries (for showing search history).

**Request:**
```typescript
{
  limit?: number;                     // Default: 10, max: 50
}
```

**Response:**
```typescript
{
  success: true;
  data: Array<{
    query: string;
    timestamp: Date;
    resultsCount: number;
  }>;
}
```

---

### 10. Save Search

**Endpoint:** `trpc.search.saveSearch.mutate()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Mutation

Save a search for later re-execution.

**Request:**
```typescript
{
  name: string;                       // 1-100 characters
  query: string;                      // 1-200 characters
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    id: string;
    userId: string;
    name: string;
    searchQuery: string;
    entities: SearchableEntity[];
    filters: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
  };
}
```

---

### 11. Get Saved Searches

**Endpoint:** `trpc.search.getSavedSearches.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get all of user's saved searches.

**Response:**
```typescript
{
  success: true;
  data: Array<SavedSearch>;          // Same structure as saveSearch response
}
```

---

### 12. Execute Saved Search

**Endpoint:** `trpc.search.executeSavedSearch.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Execute a previously saved search.

**Request:**
```typescript
{
  id: string;                         // Saved search ID
  page?: number;
  limit?: number;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    search: SearchResponse;           // Full search results
    savedSearchName: string;          // Name of the saved search
  };
}
```

---

### 13. Update Saved Search

**Endpoint:** `trpc.search.updateSavedSearch.mutate()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Mutation

Update a saved search.

**Request:**
```typescript
{
  id: string;                         // Required
  name?: string;                      // Optional updates
  query?: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

---

### 14. Delete Saved Search

**Endpoint:** `trpc.search.deleteSavedSearch.mutate()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Mutation

Delete a saved search.

**Request:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  success: true;
}
```

---

### 15. Get Enhanced Facets

**Endpoint:** `trpc.search.getEnhancedFacets.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get comprehensive facet data for building advanced filter UIs.

**Request:**
```typescript
{
  query?: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    groups: Array<{
      field: string;                  // e.g., 'assetType'
      label: string;                  // e.g., 'Asset Type'
      type: 'checkbox' | 'radio' | 'range' | 'date';
      options: Array<{
        value: string;
        label: string;
        count: number;
        isSelected?: boolean;
      }>;
      min?: number;                   // For range types
      max?: number;
    }>;
    appliedFilters: Record<string, string[]>;
    totalResults: number;
    filteredResults: number;
  };
}
```

---

### 16. Get Spelling Suggestion

**Endpoint:** `trpc.search.getSpellingSuggestion.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get "Did you mean..." suggestions for misspelled queries.

**Request:**
```typescript
{
  query: string;                      // The query to check
  currentResultCount: number;         // How many results the query returned
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    hasAlternative: boolean;
    suggestion?: {
      originalQuery: string;
      suggestedQuery: string;
      confidence: number;             // 0-1, confidence in suggestion
      expectedResultCount: number;    // How many results suggestion would return
      distance: number;               // Edit distance from original
    };
    alternatives?: Array<SpellingSuggestion>;
  };
}
```

**When to use:** Call this when search returns 0-3 results to help users find what they're looking for.

---

### 17. Get Related Content

**Endpoint:** `trpc.search.getRelatedContent.query()`  
**Classification:** 🌐 SHARED  
**Authentication:** Required  
**Method:** Query

Get content related to a specific entity (for "You might also like" features).

**Request:**
```typescript
{
  entityType: SearchableEntity;
  entityId: string;
  limit?: number;                     // Default: 10, max: 50
  includeTypes?: RelationshipType[];
  excludeIds?: string[];              // Don't show these IDs
  minRelevanceScore?: number;         // Default: 0.3 (0-1)
}

type RelationshipType = 
  | 'similar_content'
  | 'same_category'
  | 'same_creator'
  | 'same_project'
  | 'collaborative_filtering'
  | 'frequently_viewed_together';
```

**Response:**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    entityType: SearchableEntity;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    relevanceScore: number;
    relationshipType: RelationshipType;
    relationshipReason: string;       // Human-readable explanation
    metadata: EntityMetadata;
  }>;
}
```

---

### 18. Get Search Analytics (Admin Only)

**Endpoint:** `trpc.search.getAnalytics.query()`  
**Classification:** 🔒 ADMIN ONLY  
**Authentication:** Admin role required  
**Method:** Query

Get comprehensive search analytics for a date range.

**Request:**
```typescript
{
  startDate: string | Date;           // ISO 8601
  endDate: string | Date;
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
    zeroResultsRate: number;          // 0-1
    clickThroughRate: number;         // 0-1
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

---

### 19. Get Zero-Result Queries (Admin Only)

**Endpoint:** `trpc.search.getZeroResultQueries.query()`  
**Classification:** 🔒 ADMIN ONLY  
**Authentication:** Admin role required  
**Method:** Query

Get queries that returned zero results (for content gap analysis).

**Request:**
```typescript
{
  startDate: string | Date;
  endDate: string | Date;
  limit?: number;                     // Default: 20, max: 100
}
```

**Response:**
```typescript
{
  success: true;
  data: Array<{
    query: string;
    count: number;                    // How many times this query was searched
    lastSearched: Date;
  }>;
}
```

---

### 20. Get Performance Metrics (Admin Only)

**Endpoint:** `trpc.search.getPerformanceMetrics.query()`  
**Classification:** 🔒 ADMIN ONLY  
**Authentication:** Admin role required  
**Method:** Query

Get performance metrics for search operations.

**Request:**
```typescript
{
  startDate: string | Date;
  endDate: string | Date;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    averageExecutionTimeMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    slowestQueries: Array<{
      query: string;
      executionTimeMs: number;
      timestamp: Date;
    }>;
  };
}
```

---

### 21. Get Trending Searches (Admin Only)

**Endpoint:** `trpc.search.getTrendingSearches.query()`  
**Classification:** 🔒 ADMIN ONLY  
**Authentication:** Admin role required  
**Method:** Query

Get currently trending search queries.

**Request:**
```typescript
{
  hours?: number;                     // Default: 24, max: 168 (1 week)
  limit?: number;                     // Default: 10, max: 50
}
```

**Response:**
```typescript
{
  success: true;
  data: Array<{
    query: string;
    count: number;
    trend: 'rising' | 'stable' | 'falling';
    changePercentage: number;
  }>;
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// Searchable entity types
export type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';

// Sort options
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
```

### Search Query Interface

```typescript
export interface SearchQuery {
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
  pagination?: SearchPagination;
  sortBy?: SearchSortBy;
  sortOrder?: SearchSortOrder;
}
```

### Search Filters

```typescript
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
  dateFrom?: Date;
  dateTo?: Date;
  createdBy?: string;
  tags?: string[];
}
```

### Search Result Interface

```typescript
export interface SearchResult {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  relevanceScore: number;           // 0-1, higher is more relevant
  scoreBreakdown: ScoreBreakdown;
  highlights: SearchHighlights;
  metadata: EntityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoreBreakdown {
  textualRelevance: number;         // 0-1
  recencyScore: number;             // 0-1
  popularityScore: number;          // 0-1
  qualityScore: number;             // 0-1
  finalScore: number;               // Weighted composite
}

export interface SearchHighlights {
  title?: string;                   // HTML with <mark> tags
  description?: string;             // HTML with <mark> tags
  content?: string;
  tags?: string[];
}
```

### Entity Metadata Types

```typescript
export type EntityMetadata = 
  | AssetMetadata 
  | CreatorMetadata 
  | ProjectMetadata 
  | LicenseMetadata;

export interface AssetMetadata {
  type: 'asset';
  assetType: string;
  status: string;
  fileSize: bigint;
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
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface LicenseMetadata {
  type: 'license';
  licenseType: string;
  status: string;
  feeCents: number;
  startDate: Date;
  endDate: Date;
  assetTitle: string;
  brandName: string;
}
```

### Search Response Interface

```typescript
export interface SearchResponse {
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
```

---

## Request & Response Schemas

### Zod Validation Schemas

These schemas are used on the backend. Use them for client-side validation before making requests.

```typescript
import { z } from 'zod';

// Searchable entity schema
export const searchableEntitySchema = z.enum(['assets', 'creators', 'projects', 'licenses']);

// Search filters schema
export const searchFiltersSchema = z.object({
  // Asset filters
  assetType: z.array(z.string()).optional(),
  assetStatus: z.array(z.string()).optional(),
  projectId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  
  // Creator filters
  verificationStatus: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  availabilityStatus: z.enum(['available', 'limited', 'unavailable']).optional(),
  
  // Project filters
  projectType: z.array(z.string()).optional(),
  projectStatus: z.array(z.string()).optional(),
  brandId: z.string().cuid().optional(),
  
  // License filters
  licenseType: z.array(z.string()).optional(),
  licenseStatus: z.array(z.string()).optional(),
  
  // Common filters
  dateFrom: z.string().datetime().or(z.date()).optional(),
  dateTo: z.string().datetime().or(z.date()).optional(),
  createdBy: z.string().cuid().optional(),
  tags: z.array(z.string()).optional(),
}).optional();

// Main search query schema
export const searchQuerySchema = z.object({
  query: z.string()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query must be at most 200 characters')
    .trim(),
  entities: z.array(searchableEntitySchema).optional(),
  filters: searchFiltersSchema,
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum([
    'relevance', 
    'created_at', 
    'updated_at', 
    'title', 
    'name', 
    'verified_at', 
    'total_collaborations', 
    'total_revenue', 
    'average_rating'
  ]).optional().default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Track click schema
export const trackClickSchema = z.object({
  eventId: z.string().cuid(),
  resultId: z.string().cuid(),
  resultPosition: z.number().int().min(0),
  resultEntityType: searchableEntitySchema,
});
```

---

## Business Logic & Validation Rules

### Query Validation

1. **Minimum Length**: 2 characters
2. **Maximum Length**: 200 characters
3. **Sanitization**: Automatically trimmed, special characters allowed
4. **Stop Words**: Common words like "the", "a", "and" are given lower weight but not removed

### Pagination

1. **Default Page Size**: 20 results
2. **Maximum Page Size**: 100 results
3. **Page Numbers**: 1-indexed (first page is 1, not 0)
4. **Empty Results**: Returns empty array, not an error

### Filtering Rules

1. **Array Filters**: Use OR logic within array (e.g., `assetType: ['IMAGE', 'VIDEO']` finds images OR videos)
2. **Cross-Filter**: Use AND logic between different filters
3. **Date Ranges**: Both `dateFrom` and `dateTo` are inclusive
4. **Entity Filtering**: If no entities specified, searches all types

### Relevance Scoring Algorithm

The search uses a weighted composite score:

```
Final Score = (Textual Relevance × 0.5) + 
              (Recency Score × 0.2) + 
              (Popularity Score × 0.2) + 
              (Quality Score × 0.1)
```

#### Textual Relevance (50% weight)
- **Exact title match**: 1.0
- **Title contains full query**: 0.7
- **Partial word matches**: Proportional to match percentage
- **Description match**: +0.3 bonus

#### Recency Score (20% weight)
- Exponential decay based on age
- Half-life: 90 days (score halves every 90 days)
- Max age considered: 2 years

#### Popularity Score (20% weight)
- View count: 50% weight
- Usage count: 30% weight
- Favorite count: 20% weight
- Normalized to 0-1 scale

#### Quality Score (10% weight)
- Verification status
- Active/approved status
- Content completeness

### Derived Values

The following values are calculated by the backend:

1. **Relevance Score**: Automatically calculated for each result
2. **Score Breakdown**: Provided for transparency
3. **Highlights**: Query terms automatically highlighted with `<mark>` tags
4. **Entity Counts**: Facets calculated based on permissions
5. **Execution Time**: Tracked automatically

### State Rules

1. **Search Analytics**: Every search is logged (async, doesn't block results)
2. **Click Tracking**: Optional but recommended for improving relevance
3. **Saved Searches**: Limited to authenticated users
4. **Permissions**: Results automatically filtered by user permissions

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
{
  page: 1,        // Current page (1-indexed)
  limit: 20,      // Results per page
  total: 157,     // Total matching results
  totalPages: 8,  // Total pages available
  hasNextPage: true,
  hasPreviousPage: false
}
```

### Implementing Pagination

```typescript
const [page, setPage] = useState(1);
const limit = 20;

const { data } = useQuery({
  queryKey: ['search', query, page, limit],
  queryFn: () => trpc.search.search.query({ query, page, limit })
});

// Next page
const handleNext = () => {
  if (data?.pagination.hasNextPage) {
    setPage(p => p + 1);
  }
};

// Previous page
const handlePrevious = () => {
  if (data?.pagination.hasPreviousPage) {
    setPage(p => p - 1);
  }
};
```

### Filter Combinations

Filters use AND logic between different filter types:

```typescript
// Find verified creators in fashion industry who are available
{
  filters: {
    verificationStatus: ['VERIFIED'],
    industry: ['FASHION'],
    availabilityStatus: 'available'
  }
}
```

Array filters use OR logic within the array:

```typescript
// Find images OR videos (not audio)
{
  filters: {
    assetType: ['IMAGE', 'VIDEO']  // OR logic
  }
}
```

### Sort Options by Entity

| Entity | Available Sort Fields |
|--------|----------------------|
| Assets | relevance, created_at, updated_at, title |
| Creators | relevance, created_at, name, verified_at, total_collaborations, average_rating |
| Projects | relevance, created_at, updated_at, name |
| Licenses | relevance, created_at, updated_at |

### Faceted Search Pattern

1. Get initial facets for available filters
2. User selects filter values
3. Re-run search with applied filters
4. Update facets to show remaining options

```typescript
// Step 1: Get facets
const facets = await trpc.search.getEnhancedFacets.query({
  query: 'logo'
});

// Step 2: User selects "IMAGE" asset type
const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
setSelectedTypes(['IMAGE']);

// Step 3: Search with filter
const results = await trpc.search.search.query({
  query: 'logo',
  filters: { assetType: selectedTypes }
});

// Step 4: Get updated facets
const updatedFacets = await trpc.search.getEnhancedFacets.query({
  query: 'logo',
  filters: { assetType: selectedTypes }
});
```

---

## Next Steps

Continue to:
- **Part 2**: [Error Handling & Authorization Guide](./SEARCH_SERVICE_ERRORS_AND_AUTH.md)
- **Part 3**: [Frontend Implementation Guide](./SEARCH_SERVICE_IMPLEMENTATION_GUIDE.md)
