# Search Infrastructure - Frontend Integration API Reference

🌐 **SHARED** - Search functionality used by both public website and admin interface

**Module Status:** ✅ Complete  
**Backend Version:** 1.0.0  
**Last Updated:** October 17, 2025

---

## Overview

The Search Infrastructure provides a unified, intelligent search system across multiple entity types (IP Assets, Creators, Projects, and Licenses) with advanced relevance scoring, filtering, and analytics. This document covers the core API endpoints and data structures needed for frontend integration.

### Key Features
- **Multi-Entity Search**: Search across assets, creators, projects, and licenses in a single query
- **Advanced Relevance Scoring**: Multi-factor algorithm considering textual relevance, recency, popularity, and quality
- **Permission-Aware**: Automatic filtering based on user role (Creator, Brand, Admin)
- **Real-Time Analytics**: Track searches, clicks, and user behavior
- **Autocomplete & Suggestions**: Fast typeahead support with permission filtering
- **Faceted Search**: Dynamic filter options with result counts
- **Saved Searches**: Persistent query storage per user

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Request/Response Examples](#request-response-examples)
4. [Query Parameters & Filters](#query-parameters--filters)
5. [Pagination](#pagination)
6. [Authentication Requirements](#authentication-requirements)

---

## API Endpoints

All endpoints use tRPC and are accessible via the `search` namespace.

### Core Search Endpoints

#### 1. Unified Search
**Classification:** 🌐 SHARED  
**Endpoint:** `search.search`  
**Type:** Query  
**Auth:** Required (all authenticated users)

Search across multiple entity types with a single query.

**Input Schema:**
```typescript
{
  query: string;                      // 2-200 characters, trimmed
  entities?: SearchableEntity[];      // ['assets', 'creators', 'projects', 'licenses']
  filters?: SearchFilters;            // See filters section below
  page?: number;                      // Default: 1, Min: 1
  limit?: number;                     // Default: 20, Min: 1, Max: 100
  sortBy?: SearchSortBy;              // Default: 'relevance'
  sortOrder?: 'asc' | 'desc';         // Default: 'desc'
}
```

**Response Schema:**
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
    facets: SearchFacets;
    query: string;                    // Original query string
    executionTimeMs: number;          // Performance metric
  };
}
```

---

#### 2. Entity-Specific Search Endpoints

##### Search Assets
**Classification:** 🌐 SHARED  
**Endpoint:** `search.searchAssets`  
**Type:** Query  
**Auth:** Required

Search only IP Assets with asset-specific filters.

**Input Schema:**
```typescript
{
  query: string;                      // 2-200 characters
  filters?: {
    assetType?: string[];             // ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']
    assetStatus?: string[];           // ['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED']
    projectId?: string;               // CUID
    creatorId?: string;               // CUID (via ownership)
    dateFrom?: string;                // ISO 8601 datetime
    dateTo?: string;                  // ISO 8601 datetime
    tags?: string[];                  // Tags from metadata JSONB
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}
```

---

##### Search Creators
**Classification:** 🌐 SHARED  
**Endpoint:** `search.searchCreators`  
**Type:** Query  
**Auth:** Required

Search only Creators with creator-specific filters.

**Input Schema:**
```typescript
{
  query: string;
  filters?: {
    verificationStatus?: string[];    // ['pending', 'approved', 'rejected']
    specialties?: string[];           // ['photography', 'videography', etc.]
    industry?: string[];              // Industry categories
    category?: string[];              // Specialty categories
    country?: string;                 // ISO country code
    region?: string;                  // Region/state
    city?: string;                    // City name
    availabilityStatus?: 'available' | 'limited' | 'unavailable';
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'name' | 'verified_at' | 'total_collaborations' | 'average_rating';
  sortOrder?: 'asc' | 'desc';
}
```

---

##### Search Projects
**Classification:** 🔒 ADMIN ONLY  
**Endpoint:** `search.searchProjects`  
**Type:** Query  
**Auth:** Required

Search only Projects with project-specific filters.

**Input Schema:**
```typescript
{
  query: string;
  filters?: {
    projectType?: string[];           // Project type codes
    projectStatus?: string[];         // ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']
    brandId?: string;                 // CUID
    dateFrom?: string;                // ISO 8601 datetime
    dateTo?: string;                  // ISO 8601 datetime
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}
```

---

#### 3. Autocomplete & Suggestions

##### Get Unified Suggestions
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getSuggestions`  
**Type:** Query  
**Auth:** Required

Get autocomplete suggestions across all or specific entity types.

**Input Schema:**
```typescript
{
  query: string;                      // 2-100 characters
  entities?: SearchableEntity[];      // Limit to specific entities
  limit?: number;                     // Default: 10, Min: 1, Max: 20
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    entityType: SearchableEntity;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    metadata: EntityMetadata;         // Entity-specific data
  }>;
}
```

---

##### Get Asset Suggestions
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getAssetSuggestions`  
**Type:** Query  
**Auth:** Required

Fast typeahead for asset titles only.

**Input Schema:**
```typescript
{
  query: string;                      // 2-100 characters
  limit?: number;                     // Default: 10, Max: 20
}
```

---

#### 4. Faceted Search

##### Get Asset Facets
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getAssetFacets`  
**Type:** Query  
**Auth:** Required

Get available filter options with result counts for assets.

**Input Schema:**
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

**Response Schema:**
```typescript
{
  success: true;
  data: {
    assetTypes: Record<string, number>;      // { 'IMAGE': 45, 'VIDEO': 23 }
    statuses: Record<string, number>;        // { 'PUBLISHED': 100, 'DRAFT': 20 }
    projects: Array<{                        // Top 20 projects
      id: string;
      name: string;
      count: number;
    }>;
    creators: Array<{                        // Top 20 creators
      id: string;
      name: string;
      count: number;
    }>;
    tags: Array<{                            // Popular tags
      value: string;
      count: number;
    }>;
  };
}
```

---

##### Get Enhanced Facets
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getEnhancedFacets`  
**Type:** Query  
**Auth:** Required

Get structured facet groups for building filter UIs.

**Input Schema:**
```typescript
{
  query?: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: {
    groups: Array<{
      field: string;                  // Filter field name
      label: string;                  // Display label
      type: 'checkbox' | 'radio' | 'range' | 'date';
      options: Array<{
        value: string;
        label: string;
        count: number;
        isSelected?: boolean;
      }>;
      min?: number;                   // For range types
      max?: number;                   // For range types
    }>;
    appliedFilters: Record<string, string[]>;
    totalResults: number;
    filteredResults: number;
  };
}
```

---

#### 5. Search History & Saved Searches

##### Get Recent Searches
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getRecentSearches`  
**Type:** Query  
**Auth:** Required

Get user's recent unique search queries.

**Input Schema:**
```typescript
{
  limit?: number;                     // Default: 10, Max: 50
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: Array<{
    query: string;
    timestamp: string;                // ISO 8601
    entitiesSearched: SearchableEntity[];
    resultsCount: number;
  }>;
}
```

---

##### Save Search
**Classification:** 🌐 SHARED  
**Endpoint:** `search.saveSearch`  
**Type:** Mutation  
**Auth:** Required

Save a search query for later reuse.

**Input Schema:**
```typescript
{
  name: string;                       // 1-100 characters
  query: string;                      // 1-200 characters
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

**Response Schema:**
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
    createdAt: string;
    updatedAt: string;
  };
}
```

---

##### Get Saved Searches
**Classification:** 🌐 SHARED  
**Endpoint:** `search.getSavedSearches`  
**Type:** Query  
**Auth:** Required

Get all saved searches for current user.

**Response Schema:**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    name: string;
    searchQuery: string;
    entities: SearchableEntity[];
    filters: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

---

##### Update Saved Search
**Classification:** 🌐 SHARED  
**Endpoint:** `search.updateSavedSearch`  
**Type:** Mutation  
**Auth:** Required

Update an existing saved search.

**Input Schema:**
```typescript
{
  id: string;                         // CUID
  name?: string;                      // 1-100 characters
  query?: string;                     // 1-200 characters
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}
```

---

##### Delete Saved Search
**Classification:** 🌐 SHARED  
**Endpoint:** `search.deleteSavedSearch`  
**Type:** Mutation  
**Auth:** Required

Delete a saved search (must be owner).

**Input Schema:**
```typescript
{
  id: string;                         // CUID
}
```

---

##### Execute Saved Search
**Classification:** 🌐 SHARED  
**Endpoint:** `search.executeSavedSearch`  
**Type:** Query  
**Auth:** Required

Run a saved search with current pagination.

**Input Schema:**
```typescript
{
  id: string;                         // CUID
  page?: number;
  limit?: number;
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: {
    search: SearchResponse;           // Same as unified search response
    savedSearchName: string;
  };
}
```

---

#### 6. Analytics & Tracking

##### Track Search Result Click
**Classification:** 🌐 SHARED  
**Endpoint:** `search.trackClick`  
**Type:** Mutation  
**Auth:** Required

Track when a user clicks a search result (for analytics).

**Input Schema:**
```typescript
{
  eventId: string;                    // CUID from search response
  resultId: string;                   // CUID of clicked entity
  resultPosition: number;             // 0-based index in results
  resultEntityType: SearchableEntity; // 'assets' | 'creators' | 'projects' | 'licenses'
}
```

**Response Schema:**
```typescript
{
  success: true;
}
```

> **Note:** This endpoint fires asynchronously and should not block user interactions.

---

##### Get Search Analytics (Admin Only)
**Classification:** 🔒 ADMIN ONLY  
**Endpoint:** `search.getAnalytics`  
**Type:** Query  
**Auth:** Admin only

Get comprehensive search analytics for a date range.

**Input Schema:**
```typescript
{
  startDate: string;                  // ISO 8601 datetime
  endDate: string;                    // ISO 8601 datetime
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: {
    totalSearches: number;
    averageExecutionTimeMs: number;
    averageResultsCount: number;
    zeroResultsRate: number;          // 0-1 (percentage)
    clickThroughRate: number;         // 0-1 (percentage)
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

##### Get Zero-Result Queries (Admin Only)
**Classification:** 🔒 ADMIN ONLY  
**Endpoint:** `search.getZeroResultQueries`  
**Type:** Query  
**Auth:** Admin only

Get queries that returned no results (for improving search).

**Input Schema:**
```typescript
{
  startDate: string;
  endDate: string;
  limit?: number;                     // Default: 20, Max: 100
}
```

---

##### Get Performance Metrics (Admin Only)
**Classification:** 🔒 ADMIN ONLY  
**Endpoint:** `search.getPerformanceMetrics`  
**Type:** Query  
**Auth:** Admin only

Get search performance metrics.

**Input Schema:**
```typescript
{
  startDate: string;
  endDate: string;
}
```

**Response Schema:**
```typescript
{
  success: true;
  data: {
    averageExecutionTimeMs: number;
    p50ExecutionTimeMs: number;       // Median
    p95ExecutionTimeMs: number;       // 95th percentile
    p99ExecutionTimeMs: number;       // 99th percentile
    slowestQueries: Array<{
      query: string;
      executionTimeMs: number;
      timestamp: string;
    }>;
  };
}
```

---

##### Get Trending Searches (Admin Only)
**Classification:** 🔒 ADMIN ONLY  
**Endpoint:** `search.getTrendingSearches`  
**Type:** Query  
**Auth:** Admin only

Get trending search queries in recent time window.

**Input Schema:**
```typescript
{
  hours?: number;                     // Default: 24, Min: 1, Max: 168
  limit?: number;                     // Default: 10, Max: 50
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Searchable entity types
 */
export type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';

/**
 * Sort options
 */
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

/**
 * Main search query interface
 */
export interface SearchQuery {
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
  pagination?: SearchPagination;
  sortBy?: SearchSortBy;
  sortOrder?: SearchSortOrder;
}

/**
 * All available search filters
 */
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

/**
 * Pagination parameters
 */
export interface SearchPagination {
  page: number;
  limit: number;
}
```

---

### Response Types

```typescript
/**
 * Complete search response
 */
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

/**
 * Individual search result
 */
export interface SearchResult {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  relevanceScore: number;              // 0-1, higher is better
  scoreBreakdown: ScoreBreakdown;
  highlights: SearchHighlights;
  metadata: EntityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Breakdown of relevance score components
 */
export interface ScoreBreakdown {
  textualRelevance: number;            // 0-1
  recencyScore: number;                // 0-1
  popularityScore: number;             // 0-1
  qualityScore: number;                // 0-1
  finalScore: number;                  // Weighted sum
}

/**
 * Search term highlights in result
 */
export interface SearchHighlights {
  title?: string;                      // HTML with <mark> tags
  description?: string;                // HTML with <mark> tags
  content?: string;                    // HTML with <mark> tags
  tags?: string[];                     // Matching tags
}
```

---

### Entity-Specific Metadata

```typescript
/**
 * Union type for entity metadata
 */
export type EntityMetadata = 
  | AssetMetadata 
  | CreatorMetadata 
  | ProjectMetadata 
  | LicenseMetadata;

/**
 * IP Asset metadata
 */
export interface AssetMetadata {
  type: 'asset';
  assetType: string;                   // 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'
  status: string;                      // 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED'
  fileSize: bigint;
  mimeType: string;
  thumbnailUrl?: string | null;
  createdBy: string;
  tags?: string[];
}

/**
 * Creator metadata
 */
export interface CreatorMetadata {
  type: 'creator';
  stageName: string;
  verificationStatus: string;          // 'pending' | 'approved' | 'rejected'
  specialties: string[];
  avatar?: string | null;
  portfolioUrl?: string | null;
  availability?: {
    status: 'available' | 'limited' | 'unavailable';
    nextAvailable?: string;
  } | null;
  performanceMetrics?: {
    totalCollaborations?: number;
    totalRevenue?: number;             // In cents
    averageRating?: number;            // 0-5
    recentActivityScore?: number;
  } | null;
}

/**
 * Project metadata
 */
export interface ProjectMetadata {
  type: 'project';
  projectType: string;
  status: string;
  brandName: string;
  budgetCents: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * License metadata
 */
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

---

### Facets

```typescript
/**
 * Search facets for filtering
 */
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

## Request/Response Examples

### Example 1: Basic Search

**Request:**
```typescript
const response = await trpc.search.search.query({
  query: "logo design",
  page: 1,
  limit: 20
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "clx1234567890abcdef",
        "entityType": "assets",
        "title": "YesGoddess Logo Design - Vector",
        "description": "High-resolution vector logo design for YesGoddess brand",
        "relevanceScore": 0.95,
        "scoreBreakdown": {
          "textualRelevance": 0.9,
          "recencyScore": 0.8,
          "popularityScore": 0.7,
          "qualityScore": 1.0,
          "finalScore": 0.95
        },
        "highlights": {
          "title": "YesGoddess <mark>Logo Design</mark> - Vector",
          "description": "High-resolution vector <mark>logo design</mark> for YesGoddess brand"
        },
        "metadata": {
          "type": "asset",
          "assetType": "IMAGE",
          "status": "PUBLISHED",
          "fileSize": 2048576,
          "mimeType": "image/svg+xml",
          "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/...",
          "createdBy": "user_123",
          "tags": ["logo", "brand", "vector", "design"]
        },
        "createdAt": "2025-09-15T10:30:00.000Z",
        "updatedAt": "2025-10-01T14:20:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "facets": {
      "entityCounts": {
        "assets": 30,
        "creators": 10,
        "projects": 3,
        "licenses": 2
      },
      "assetTypes": {
        "IMAGE": 20,
        "VIDEO": 8,
        "DOCUMENT": 2
      }
    },
    "query": "logo design",
    "executionTimeMs": 42
  }
}
```

---

### Example 2: Filtered Search

**Request:**
```typescript
const response = await trpc.search.searchAssets.query({
  query: "portrait",
  filters: {
    assetType: ["IMAGE"],
    assetStatus: ["PUBLISHED"],
    tags: ["photography"]
  },
  sortBy: "created_at",
  sortOrder: "desc",
  page: 1,
  limit: 10
});
```

---

### Example 3: Creator Search with Availability

**Request:**
```typescript
const response = await trpc.search.searchCreators.query({
  query: "photographer",
  filters: {
    specialties: ["photography", "videography"],
    verificationStatus: ["approved"],
    availabilityStatus: "available"
  },
  sortBy: "average_rating",
  sortOrder: "desc",
  limit: 20
});
```

---

### Example 4: Autocomplete

**Request:**
```typescript
const suggestions = await trpc.search.getSuggestions.query({
  query: "log",
  entities: ["assets"],
  limit: 5
});
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "asset_1",
      "entityType": "assets",
      "title": "Logo Design - Primary",
      "thumbnailUrl": "https://...",
      "metadata": {
        "type": "asset",
        "assetType": "IMAGE",
        "status": "PUBLISHED"
      }
    },
    {
      "id": "asset_2",
      "entityType": "assets",
      "title": "Logo Variations Pack",
      "thumbnailUrl": "https://...",
      "metadata": {
        "type": "asset",
        "assetType": "DOCUMENT"
      }
    }
  ]
}
```

---

## Query Parameters & Filters

### Search Query String

**Constraints:**
- Minimum length: 2 characters
- Maximum length: 200 characters
- Automatically trimmed
- Special characters sanitized to prevent SQL injection

**Behavior:**
- Case-insensitive matching
- Partial word matching supported
- Searches across entity-specific text fields:
  - **Assets**: `title`, `description`
  - **Creators**: `stageName`, `bio`
  - **Projects**: `name`, `description`
  - **Licenses**: Asset title, brand name

---

### Entity Selection

**Parameter:** `entities?: SearchableEntity[]`

**Values:**
- `'assets'` - IP Assets (images, videos, documents, etc.)
- `'creators'` - Content creators and collaborators
- `'projects'` - Brand projects
- `'licenses'` - License agreements

**Default:** All entity types if omitted

**Example:**
```typescript
// Search only assets and creators
entities: ['assets', 'creators']
```

---

### Common Filters

#### Date Range

```typescript
filters: {
  dateFrom: "2025-01-01T00:00:00.000Z",  // ISO 8601
  dateTo: "2025-12-31T23:59:59.999Z"     // ISO 8601
}
```

Filters entities by `createdAt` field.

---

#### Tags

```typescript
filters: {
  tags: ["logo", "brand", "vector"]
}
```

Searches in JSONB `metadata.tags` field. Supports array contains matching.

---

#### Created By

```typescript
filters: {
  createdBy: "user_clx123..."  // User CUID
}
```

Filters by the user who created/uploaded the entity.

---

### Asset-Specific Filters

#### Asset Type

```typescript
filters: {
  assetType: ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"]
}
```

**Available Types:**
- `IMAGE` - Photos, illustrations, graphics
- `VIDEO` - Video files
- `AUDIO` - Music, sound effects
- `DOCUMENT` - PDFs, presentations, etc.
- `THREE_D_MODEL` - 3D assets
- `CODE` - Code snippets, templates

---

#### Asset Status

```typescript
filters: {
  assetStatus: ["PUBLISHED", "APPROVED"]
}
```

**Available Statuses:**
- `DRAFT` - Work in progress
- `APPROVED` - Approved for use
- `PUBLISHED` - Publicly available
- `ARCHIVED` - No longer active

---

#### Project & Creator

```typescript
filters: {
  projectId: "project_clx123...",    // Filter assets in specific project
  creatorId: "creator_clx123..."     // Filter by asset owner (via ownerships)
}
```

---

### Creator-Specific Filters

#### Verification Status

```typescript
filters: {
  verificationStatus: ["approved", "pending"]
}
```

**Available Statuses:**
- `pending` - Verification pending
- `approved` - Verified creator
- `rejected` - Verification rejected

> **Note:** Non-admin users automatically see only `approved` creators.

---

#### Specialties

```typescript
filters: {
  specialties: ["photography", "videography", "graphic-design"]
}
```

**Common Specialties:**
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

---

#### Availability

```typescript
filters: {
  availabilityStatus: "available"
}
```

**Values:**
- `available` - Currently available
- `limited` - Limited availability
- `unavailable` - Not available

---

#### Location

```typescript
filters: {
  country: "US",
  region: "California",
  city: "Los Angeles"
}
```

---

### Project-Specific Filters

#### Project Type & Status

```typescript
filters: {
  projectType: ["campaign", "evergreen"],
  projectStatus: ["ACTIVE", "COMPLETED"],
  brandId: "brand_clx123..."
}
```

---

### Sort Options

**Parameter:** `sortBy?: SearchSortBy`

**Common Values:**
- `relevance` (default) - Best match based on scoring algorithm
- `created_at` - Creation date
- `updated_at` - Last modified date
- `title` / `name` - Alphabetical by title/name

**Creator-Specific:**
- `verified_at` - Verification date
- `total_collaborations` - Number of projects
- `average_rating` - Quality rating (0-5)
- `total_revenue` - Lifetime earnings

**Sort Order:**
- `asc` - Ascending
- `desc` - Descending (default)

---

## Pagination

### Standard Cursor-Based Pagination

**Parameters:**
```typescript
{
  page: number;      // Page number (1-based)
  limit: number;     // Results per page
}
```

**Constraints:**
- `page`: Min 1
- `limit`: Min 1, Max 100, Default 20

**Response:**
```typescript
{
  pagination: {
    page: 1,
    limit: 20,
    total: 150,              // Total matching results
    totalPages: 8,           // Ceiling(total / limit)
    hasNextPage: true,       // page < totalPages
    hasPreviousPage: false   // page > 1
  }
}
```

### Implementation Example

```typescript
// React Query with pagination
const [page, setPage] = useState(1);

const { data, isLoading } = trpc.search.search.useQuery({
  query: searchTerm,
  page,
  limit: 20
});

// Next page
if (data?.data.pagination.hasNextPage) {
  setPage(prev => prev + 1);
}

// Previous page
if (data?.data.pagination.hasPreviousPage) {
  setPage(prev => prev - 1);
}
```

---

## Authentication Requirements

### Authentication Method

**All search endpoints require JWT authentication** via the `Authorization` header:

```typescript
Authorization: Bearer <jwt_token>
```

The backend automatically:
1. Validates the JWT token
2. Extracts user ID and role
3. Applies permission-based filtering
4. Tracks analytics with user context

---

### Role-Based Access

| Role | Asset Access | Creator Access | Project Access | License Access |
|------|-------------|----------------|----------------|----------------|
| **CREATOR** | Own assets only (via ownerships) | All approved creators | Projects they're in | Own licenses |
| **BRAND** | Licensed assets + project assets | All approved creators | Own projects | Own licenses |
| **ADMIN** | All assets | All creators (any status) | All projects | All licenses |
| **VIEWER** | All assets | All approved creators | All projects | All licenses |

### Permission Filtering Examples

#### Creator Role
```typescript
// Automatically filtered to:
WHERE assets.ownerships.some({
  creatorId: user.creator.id,
  endDate: null  // Active ownership
})
```

#### Brand Role
```typescript
// Automatically filtered to:
WHERE (
  // Assets in brand's projects
  assets.project.brandId = user.brand.id
  OR
  // Assets with active licenses
  assets.licenses.some({
    brandId: user.brand.id,
    status: 'ACTIVE',
    endDate >= now()
  })
)
```

#### Admin/Viewer Role
```typescript
// No filtering applied - full access
```

---

### Unauthenticated Access

**Search endpoints do NOT support unauthenticated access.** All requests must include valid authentication.

If your frontend needs public search (e.g., marketing site), consider:
1. Creating a dedicated public search endpoint with limited scope
2. Using a service account token for public searches
3. Implementing a separate search API for public content

---

## Next Steps

Continue to the next documents:
- **[Search Infrastructure - Implementation Guide](./SEARCH_INFRASTRUCTURE_IMPLEMENTATION.md)** - Business logic, validation, error handling
- **[Search Infrastructure - Advanced Features](./SEARCH_INFRASTRUCTURE_ADVANCED.md)** - Analytics, recommendations, spell correction

---

## Support

For questions or issues:
- Backend Team: [contact info]
- Documentation: `/docs/SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md`
- API Playground: `https://ops.yesgoddess.agency/api/playground`
