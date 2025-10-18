# Advanced Search Features - Frontend Integration Guide

> **Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
> **Module:** Advanced Search Features  
> **Last Updated:** October 17, 2025  
> **Backend Version:** 1.0.0

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [Pagination & Filtering](#pagination--filtering)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Advanced Search Features module provides intelligent search enhancements including:

- **Enhanced Faceted Search**: Real-time filter options with result counts
- **Spell Correction**: "Did you mean" suggestions for better search results
- **Related Content Recommendations**: Context-aware content discovery
- **Saved Searches**: Store and execute frequently used search queries

### Architecture

- **Protocol**: tRPC (RPC-style API with full TypeScript type safety)
- **Authentication**: JWT-based session authentication
- **Base URL**: `https://ops.yesgoddess.agency/api/trpc`
- **Transport**: HTTP POST with JSON payloads

### Key Features

✅ Dynamic facet counts based on current filters  
✅ Automatic spell correction with confidence scoring  
✅ Content-based recommendations  
✅ Multi-entity search support  
✅ Real-time analytics tracking  

---

## API Endpoints

All endpoints are tRPC procedures accessed via the `search` router.

### 1. Enhanced Faceted Search

Get filter options with result counts for refining searches.

**Endpoint:** `search.getEnhancedFacets`  
**Method:** Query  
**Auth Required:** Yes (Protected Procedure)

#### Request

```typescript
const facets = await trpc.search.getEnhancedFacets.query({
  query: string;           // Search query (optional, default: '')
  entities?: string[];     // ['assets', 'creators', 'projects', 'licenses']
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
    dateFrom?: string;      // ISO 8601 datetime
    dateTo?: string;        // ISO 8601 datetime
    createdBy?: string;
    tags?: string[];
  };
});
```

#### Response

```typescript
{
  success: boolean;
  data: {
    groups: Array<{
      field: string;              // 'assetType', 'verificationStatus', etc.
      label: string;              // Human-readable label
      type: 'checkbox' | 'radio' | 'range' | 'date';
      options: Array<{
        value: string;            // Filter value
        label: string;            // Display label
        count: number;            // Number of results
        isSelected?: boolean;     // Whether currently selected
      }>;
      min?: number;              // For range type
      max?: number;              // For range type
    }>;
    appliedFilters: Record<string, string[]>;
    totalResults: number;        // Total without filters
    filteredResults: number;     // Total with current filters
  };
}
```

#### Example

```typescript
const facets = await trpc.search.getEnhancedFacets.query({
  query: 'logo design',
  entities: ['assets'],
  filters: {
    assetType: ['IMAGE'],
  },
});

// Response:
{
  success: true,
  data: {
    groups: [
      {
        field: 'assetType',
        label: 'Asset Type',
        type: 'checkbox',
        options: [
          { value: 'IMAGE', label: 'IMAGE', count: 42, isSelected: true },
          { value: 'VIDEO', label: 'VIDEO', count: 15, isSelected: false },
          { value: 'AUDIO', label: 'AUDIO', count: 3, isSelected: false },
        ]
      },
      {
        field: 'assetStatus',
        label: 'Status',
        type: 'checkbox',
        options: [
          { value: 'ACTIVE', label: 'ACTIVE', count: 38, isSelected: false },
          { value: 'DRAFT', label: 'DRAFT', count: 4, isSelected: false },
        ]
      }
    ],
    appliedFilters: {
      assetType: ['IMAGE']
    },
    totalResults: 200,
    filteredResults: 42
  }
}
```

---

### 2. Spell Correction ("Did You Mean")

Get spelling suggestions when search results are poor.

**Endpoint:** `search.getSpellingSuggestion`  
**Method:** Query  
**Auth Required:** Yes (Protected Procedure)

#### Request

```typescript
const suggestion = await trpc.search.getSpellingSuggestion.query({
  query: string;              // Query to check
  currentResultCount: number; // Current number of results
});
```

#### Response

```typescript
{
  success: boolean;
  data: {
    hasAlternative: boolean;
    suggestion?: {
      originalQuery: string;
      suggestedQuery: string;
      confidence: number;           // 0-1, how confident we are
      expectedResultCount: number;  // Estimated results for suggestion
      distance: number;             // Levenshtein distance
    };
    alternatives?: Array<{
      originalQuery: string;
      suggestedQuery: string;
      confidence: number;
      expectedResultCount: number;
      distance: number;
    }>;
  };
}
```

#### Example

```typescript
const suggestion = await trpc.search.getSpellingSuggestion.query({
  query: 'loge desing',
  currentResultCount: 0,
});

// Response:
{
  success: true,
  data: {
    hasAlternative: true,
    suggestion: {
      originalQuery: 'loge desing',
      suggestedQuery: 'logo design',
      confidence: 0.85,
      expectedResultCount: 42,
      distance: 2
    },
    alternatives: [
      {
        originalQuery: 'loge desing',
        suggestedQuery: 'logo designer',
        confidence: 0.75,
        expectedResultCount: 28,
        distance: 3
      }
    ]
  }
}
```

#### Business Rules

- Only suggests when `currentResultCount < 5`
- Only suggests if `expectedResultCount > currentResultCount * 2`
- Minimum similarity threshold: 0.7
- Maximum suggestions returned: 3 (1 primary + 2 alternatives)
- Corpus updates hourly automatically

---

### 3. Related Content Recommendations

Get related content suggestions based on an entity.

**Endpoint:** `search.getRelatedContent`  
**Method:** Query  
**Auth Required:** Yes (Protected Procedure)

#### Request

```typescript
const related = await trpc.search.getRelatedContent.query({
  entityType: 'assets' | 'creators' | 'projects' | 'licenses';
  entityId: string;               // CUID of the entity
  limit?: number;                 // Default: 10, Max: 50
  includeTypes?: Array<
    | 'similar_content'
    | 'same_category'
    | 'same_creator'
    | 'same_project'
    | 'collaborative_filtering'
    | 'frequently_viewed_together'
  >;
  excludeIds?: string[];          // CUIDs to exclude from results
  minRelevanceScore?: number;     // 0-1, Default: 0.3
});
```

#### Response

```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    entityType: 'assets' | 'creators' | 'projects' | 'licenses';
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    relevanceScore: number;       // 0-1
    relationshipType: 'similar_content' | 'same_category' | 'same_creator' | 'same_project' | ...;
    relationshipReason: string;   // Human-readable explanation
    metadata: EntityMetadata;     // Type-specific metadata
  }>;
}
```

#### Example

```typescript
const related = await trpc.search.getRelatedContent.query({
  entityType: 'assets',
  entityId: 'clxyz123abc',
  limit: 10,
  includeTypes: ['similar_content', 'same_creator'],
  minRelevanceScore: 0.5,
});

// Response:
{
  success: true,
  data: [
    {
      id: 'clxyz789def',
      entityType: 'assets',
      title: 'Similar Logo Design',
      description: 'Modern minimalist logo',
      thumbnailUrl: 'https://...',
      relevanceScore: 0.85,
      relationshipType: 'similar_content',
      relationshipReason: 'Similar asset type: IMAGE',
      metadata: {
        type: 'asset',
        assetType: 'IMAGE',
        status: 'ACTIVE',
        fileSize: 2048576,
        mimeType: 'image/png',
        thumbnailUrl: 'https://...',
        createdBy: 'cluser123',
        tags: ['logo', 'branding']
      }
    }
  ]
}
```

#### Relevance Scoring

| Relationship Type | Base Score | Description |
|------------------|------------|-------------|
| `same_project` | 0.9 | From the same project |
| `similar_content` | 0.8 | Similar type/category |
| `same_creator` | 0.75 | By the same creator |
| `same_category` | 0.6-0.85 | Similar classification |

---

### 4. Saved Searches

#### 4.1 Save Search

**Endpoint:** `search.saveSearch`  
**Method:** Mutation  
**Auth Required:** Yes (Protected Procedure)

##### Request

```typescript
const saved = await trpc.search.saveSearch.mutate({
  name: string;               // 1-100 characters
  query: string;              // 1-200 characters
  entities?: string[];        // ['assets', 'creators', 'projects', 'licenses']
  filters?: SearchFilters;    // Same as faceted search filters
});
```

##### Response

```typescript
{
  success: boolean;
  data: {
    id: string;               // CUID
    userId: string;
    name: string;
    searchQuery: string;
    entities: string[];
    filters: Record<string, any>;
    createdAt: string;        // ISO 8601
    updatedAt: string;        // ISO 8601
  };
}
```

---

#### 4.2 Get Saved Searches

**Endpoint:** `search.getSavedSearches`  
**Method:** Query  
**Auth Required:** Yes (Protected Procedure)

##### Request

```typescript
const saved = await trpc.search.getSavedSearches.query();
```

##### Response

```typescript
{
  success: boolean;
  data: Array<{
    id: string;
    userId: string;
    name: string;
    searchQuery: string;
    entities: string[];
    filters: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

---

#### 4.3 Update Saved Search

**Endpoint:** `search.updateSavedSearch`  
**Method:** Mutation  
**Auth Required:** Yes (Protected Procedure)

##### Request

```typescript
const updated = await trpc.search.updateSavedSearch.mutate({
  id: string;                 // CUID (required)
  name?: string;              // 1-100 characters (optional)
  query?: string;             // 1-200 characters (optional)
  entities?: string[];        // (optional)
  filters?: SearchFilters;    // (optional)
});
```

##### Response

```typescript
{
  success: boolean;
  data: {
    id: string;
    userId: string;
    name: string;
    searchQuery: string;
    entities: string[];
    filters: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  };
}
```

---

#### 4.4 Execute Saved Search

**Endpoint:** `search.executeSavedSearch`  
**Method:** Query  
**Auth Required:** Yes (Protected Procedure)

##### Request

```typescript
const results = await trpc.search.executeSavedSearch.query({
  id: string;                 // CUID
  page?: number;              // Default: 1
  limit?: number;             // Default: 20, Max: 100
});
```

##### Response

```typescript
{
  success: boolean;
  data: {
    search: SearchResponse;   // Full search results (see unified search docs)
    savedSearchName: string;
  };
}
```

---

#### 4.5 Delete Saved Search

**Endpoint:** `search.deleteSavedSearch`  
**Method:** Mutation  
**Auth Required:** Yes (Protected Procedure)

##### Request

```typescript
await trpc.search.deleteSavedSearch.mutate({
  id: string;                 // CUID
});
```

##### Response

```typescript
{
  success: boolean;
}
```

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase:

```typescript
// ============================================================================
// ENUMS & TYPES
// ============================================================================

export type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';

export type RelationshipType = 
  | 'similar_content' 
  | 'same_category' 
  | 'same_creator' 
  | 'same_project'
  | 'collaborative_filtering'
  | 'frequently_viewed_together';

export type FacetType = 'checkbox' | 'radio' | 'range' | 'date';

// ============================================================================
// SEARCH FILTERS
// ============================================================================

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
  dateFrom?: string;        // ISO 8601 datetime
  dateTo?: string;          // ISO 8601 datetime
  createdBy?: string;
  tags?: string[];
}

// ============================================================================
// ENHANCED FACETED SEARCH
// ============================================================================

export interface EnhancedFacetsRequest {
  query?: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  isSelected?: boolean;
}

export interface FacetGroup {
  field: string;
  label: string;
  type: FacetType;
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

export interface EnhancedFacetsResponse {
  success: boolean;
  data: EnhancedSearchFacets;
}

// ============================================================================
// SPELL CORRECTION
// ============================================================================

export interface SpellCorrectionRequest {
  query: string;
  currentResultCount: number;
}

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

export interface SpellCorrectionResponse {
  success: boolean;
  data: DidYouMeanResponse;
}

// ============================================================================
// RELATED CONTENT
// ============================================================================

export interface RelatedContentRequest {
  entityType: SearchableEntity;
  entityId: string;
  limit?: number;
  includeTypes?: RelationshipType[];
  excludeIds?: string[];
  minRelevanceScore?: number;
}

export interface RelatedContent {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
  relationshipType: RelationshipType;
  relationshipReason: string;
  metadata: EntityMetadata;
}

export interface RelatedContentResponse {
  success: boolean;
  data: RelatedContent[];
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
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;
  createdBy: string;
  tags: string[];
}

export interface CreatorMetadata {
  type: 'creator';
  stageName: string;
  verificationStatus: string;
  specialties: string[];
  avatar: string | null;
  portfolioUrl: string | null;
  availability: {
    status: 'available' | 'limited' | 'unavailable';
    nextAvailable?: string;
  } | null;
  performanceMetrics: {
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
  startDate: string | null;
  endDate: string | null;
}

export interface LicenseMetadata {
  type: 'license';
  licenseType: string;
  status: string;
  feeCents: number;
  startDate: string;
  endDate: string;
  assetTitle: string;
  brandName: string;
}

// ============================================================================
// SAVED SEARCHES
// ============================================================================

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  searchQuery: string;
  entities: SearchableEntity[];
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSearchRequest {
  name: string;
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}

export interface UpdateSavedSearchRequest {
  id: string;
  name?: string;
  query?: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
}

export interface ExecuteSavedSearchRequest {
  id: string;
  page?: number;
  limit?: number;
}

export interface DeleteSavedSearchRequest {
  id: string;
}
```

---

## Business Logic & Validation Rules

### Enhanced Faceted Search

#### Validation Rules

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `query` | Optional string | - |
| `entities` | Array of valid entity types | "Invalid entity type" |
| `filters.*` | Type-specific validation | Field-specific messages |

#### Business Rules

1. **Dynamic Count Updates**: Facet counts reflect current filter state
2. **Multi-Select Support**: Checkbox facets support multiple selections
3. **Hierarchical Filtering**: Filters combine with AND logic within groups, OR across values
4. **Empty States**: If no results, all counts show 0
5. **Performance**: Facets calculated in parallel, < 200ms target

---

### Spell Correction

#### Validation Rules

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `query` | 2-200 characters | "Query must be 2-200 characters" |
| `currentResultCount` | Non-negative integer | "Invalid result count" |

#### Business Rules

1. **Trigger Threshold**: Only suggests when `currentResultCount < 5`
2. **Improvement Factor**: Suggestion must have 2x more results
3. **Confidence Threshold**: Minimum 0.7 similarity required
4. **Word Length**: Only corrects words > 2 characters
5. **Corpus Freshness**: Updates hourly from live data
6. **Special Characters**: Ignores non-alphanumeric characters

#### Calculations

**Similarity Score:**
```
similarity = 1 - (levenshteinDistance / maxLength)
```

**Suggestion Score:**
```
score = (confidence * 0.6) + (expectedResults / 100 * 0.4)
```

---

### Related Content

#### Validation Rules

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `entityType` | Valid entity type enum | "Invalid entity type" |
| `entityId` | Valid CUID format | "Invalid entity ID" |
| `limit` | 1-50 | "Limit must be 1-50" |
| `minRelevanceScore` | 0-1 | "Score must be 0-1" |
| `includeTypes` | Valid relationship types | "Invalid relationship type" |
| `excludeIds` | Array of valid CUIDs | "Invalid ID format" |

#### Business Rules

1. **Source Entity**: Must exist and be accessible to user
2. **Self-Exclusion**: Source entity always excluded from results
3. **Permission Filtering**: Only returns accessible content
4. **Score Weighting**: Multiple strategies combine with weighted scores
5. **Deduplication**: Same entity never appears twice
6. **Sorting**: Results sorted by relevance score descending

---

### Saved Searches

#### Validation Rules

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `name` | 1-100 characters | "Name must be 1-100 characters" |
| `query` | 1-200 characters | "Query must be 1-200 characters" |
| `entities` | Valid entity types | "Invalid entity type" |
| `filters` | Valid filter structure | Field-specific messages |
| `id` | Valid CUID, user owns | "Saved search not found" |

#### Business Rules

1. **Ownership**: Users can only access their own saved searches
2. **Uniqueness**: No enforcement (users can have duplicate names)
3. **Cascade Delete**: Deleted with user account
4. **Update Timestamp**: `updatedAt` auto-updated on modifications
5. **Execution**: Uses current permissions (results may vary over time)
6. **No Limits**: No limit on number of saved searches per user

---

## Error Handling

### HTTP Status Codes

| Status Code | tRPC Code | Meaning | User Action |
|------------|-----------|---------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated | Redirect to login |
| 403 | `FORBIDDEN` | Insufficient permissions | Show permission error |
| 404 | `NOT_FOUND` | Resource not found | Show not found message |
| 400 | `BAD_REQUEST` | Invalid input | Show validation errors |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | Show generic error, retry |

### Error Response Format

```typescript
{
  error: {
    message: string;
    code: string;
    data?: {
      code: string;
      httpStatus: number;
      path: string;
      zodError?: {
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}
```

### Specific Errors

#### Enhanced Faceted Search

| Error Code | Message | Cause | User Message |
|-----------|---------|-------|--------------|
| `INTERNAL_SERVER_ERROR` | "Failed to get enhanced facets" | Database error | "Unable to load filters. Please try again." |
| `BAD_REQUEST` | Validation error | Invalid filters | Show field-specific validation error |

#### Spell Correction

| Error Code | Message | Cause | User Message |
|-----------|---------|-------|--------------|
| `INTERNAL_SERVER_ERROR` | "Failed to get spelling suggestion" | Service error | "Spell check unavailable." |
| `BAD_REQUEST` | "Query must be 2-200 characters" | Invalid query length | Show inline validation |

#### Related Content

| Error Code | Message | Cause | User Message |
|-----------|---------|-------|--------------|
| `INTERNAL_SERVER_ERROR` | "Failed to get related content" | Service error | "Unable to load recommendations." |
| `NOT_FOUND` | Entity not found | Invalid `entityId` | "Content not found." |
| `BAD_REQUEST` | "Invalid entity ID" | Malformed CUID | "Invalid content reference." |

#### Saved Searches

| Error Code | Message | Cause | User Message |
|-----------|---------|-------|--------------|
| `UNAUTHORIZED` | No auth | Not logged in | Redirect to login |
| `NOT_FOUND` | "Saved search not found" | Wrong user or deleted | "This saved search no longer exists." |
| `INTERNAL_SERVER_ERROR` | "Failed to save search" | Database error | "Unable to save. Please try again." |
| `INTERNAL_SERVER_ERROR` | "Failed to update saved search" | Database error | "Unable to update. Please try again." |
| `INTERNAL_SERVER_ERROR` | "Failed to delete saved search" | Database error | "Unable to delete. Please try again." |
| `INTERNAL_SERVER_ERROR` | "Failed to execute saved search" | Search service error | "Unable to run search. Please try again." |
| `BAD_REQUEST` | "Name must be 1-100 characters" | Validation error | Show inline validation |

### Error Handling Examples

```typescript
// React Query with error handling
const { data, error, isError } = trpc.search.getEnhancedFacets.useQuery(
  { query: 'logo', entities: ['assets'] },
  {
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') {
        router.push('/login');
      } else if (err.data?.code === 'FORBIDDEN') {
        toast.error('You don\'t have permission to access this.');
      } else {
        toast.error('Unable to load filters. Please try again.');
      }
    },
  }
);

// Try-catch for mutations
try {
  await trpc.search.saveSearch.mutate({
    name: 'My Search',
    query: 'logo',
    entities: ['assets'],
  });
  toast.success('Search saved successfully!');
} catch (err) {
  if (err instanceof TRPCClientError) {
    if (err.data?.zodError) {
      // Show field-specific validation errors
      const fieldErrors = err.data.zodError.fieldErrors;
      Object.entries(fieldErrors).forEach(([field, errors]) => {
        toast.error(`${field}: ${errors.join(', ')}`);
      });
    } else {
      toast.error(err.message || 'Failed to save search.');
    }
  }
}
```

---

## Authorization & Permissions

### User Roles

```typescript
enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}
```

### Endpoint Permissions

| Endpoint | Required Role | Notes |
|----------|--------------|-------|
| `getEnhancedFacets` | Any authenticated | Results filtered by role |
| `getSpellingSuggestion` | Any authenticated | No role-based filtering |
| `getRelatedContent` | Any authenticated | Results filtered by role |
| `saveSearch` | Any authenticated | User-specific |
| `getSavedSearches` | Any authenticated | User-specific |
| `updateSavedSearch` | Any authenticated | Must own search |
| `executeSavedSearch` | Any authenticated | Must own search |
| `deleteSavedSearch` | Any authenticated | Must own search |

### Row-Level Security

Content visibility is automatically filtered based on user role:

#### CREATOR Role
- **Assets**: Only assets they own (via `ownerships` with `endDate: null`)
- **Projects**: Only projects where they have asset ownership
- **Licenses**: Only licenses for their assets
- **Creators**: All creators (for discovery)
- **Facets**: Counts reflect only accessible content

#### BRAND Role
- **Assets**: 
  - Assets in projects they own
  - Assets they have active licenses for
- **Projects**: Only their own projects
- **Licenses**: Only their own licenses
- **Creators**: All creators (for hiring)
- **Facets**: Counts reflect only accessible content

#### ADMIN & VIEWER Roles
- **All Content**: No restrictions
- **Facets**: Counts include all content

### Saved Search Ownership

```typescript
// Backend automatically enforces ownership
const savedSearch = await prisma.savedSearch.findUnique({
  where: { id: input.id },
});

if (!savedSearch || savedSearch.userId !== ctx.session.user.id) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Saved search not found',
  });
}
```

**Frontend Implementation:**
- Never expose other users' saved searches
- Don't show edit/delete buttons for searches user doesn't own
- Handle 404 errors gracefully if ownership check fails

---

## Rate Limiting & Quotas

> ⚠️ **Note**: Rate limiting is not currently implemented but recommended for production.

### Recommended Limits

| Endpoint | Limit | Window | Headers |
|----------|-------|--------|---------|
| `getEnhancedFacets` | 60 req/min | Per user | `X-RateLimit-*` (future) |
| `getSpellingSuggestion` | 30 req/min | Per user | `X-RateLimit-*` (future) |
| `getRelatedContent` | 60 req/min | Per user | `X-RateLimit-*` (future) |
| `saveSearch` | 10 req/min | Per user | `X-RateLimit-*` (future) |
| `updateSavedSearch` | 20 req/min | Per user | `X-RateLimit-*` (future) |
| `deleteSavedSearch` | 20 req/min | Per user | `X-RateLimit-*` (future) |
| `executeSavedSearch` | 60 req/min | Per user | `X-RateLimit-*` (future) |

### Best Practices

1. **Debounce**: Debounce facet and spell check requests (300-500ms)
2. **Cache**: Cache facet results for 30-60 seconds
3. **Batch**: Don't call spell check on every keystroke
4. **Retry**: Use exponential backoff for rate limit errors (future)

```typescript
// Example: Debounced facet search
import { useMemo } from 'react';
import { debounce } from 'lodash';

const debouncedFetchFacets = useMemo(
  () => debounce((query, filters) => {
    trpc.search.getEnhancedFacets.query({ query, filters });
  }, 300),
  []
);
```

---

## Pagination & Filtering

### Pagination Format

**Note**: These endpoints return non-paginated results. For paginated search, use the main `search.search` endpoint.

### Filtering Best Practices

1. **Filter Persistence**: Store active filters in URL params or local state
2. **Clear Filters**: Provide "Clear All" functionality
3. **Filter Indicators**: Show count of active filters
4. **Filter State**: Sync filter state between facets and search results

```typescript
// Example: URL-based filter state
const [searchParams, setSearchParams] = useSearchParams();

const filters = useMemo(() => ({
  assetType: searchParams.getAll('assetType'),
  assetStatus: searchParams.getAll('assetStatus'),
}), [searchParams]);

const updateFilter = (key: string, value: string[]) => {
  const newParams = new URLSearchParams(searchParams);
  newParams.delete(key);
  value.forEach(v => newParams.append(key, v));
  setSearchParams(newParams);
};
```

---

## Frontend Implementation Checklist

### Enhanced Faceted Search

- [ ] **UI Components**
  - [ ] Create `FacetPanel` component for filter sidebar
  - [ ] Create `FacetGroup` component for each filter category
  - [ ] Create `FacetOption` component with checkbox and count
  - [ ] Add "Clear All Filters" button
  - [ ] Show active filter count badge
  - [ ] Mobile-responsive filter drawer/modal

- [ ] **State Management**
  - [ ] Store active filters in URL params or state
  - [ ] Debounce filter changes (300ms)
  - [ ] Update facet counts when filters change
  - [ ] Sync filter state between components

- [ ] **Data Fetching**
  - [ ] Call `getEnhancedFacets` on mount
  - [ ] Refetch on filter changes
  - [ ] Cache results for 30-60 seconds
  - [ ] Handle loading and error states

- [ ] **UX Enhancements**
  - [ ] Show loading skeleton during fetch
  - [ ] Disable filters while loading
  - [ ] Collapse/expand facet groups
  - [ ] Highlight selected filters
  - [ ] Show "No results" message appropriately

### Spell Correction

- [ ] **UI Components**
  - [ ] Create "Did you mean" banner above results
  - [ ] Make suggestion clickable
  - [ ] Show expected result count
  - [ ] Provide option to keep original query
  - [ ] Show alternative suggestions (expandable)

- [ ] **Integration**
  - [ ] Call after main search completes
  - [ ] Only show when `currentResultCount < 5`
  - [ ] Don't show if `hasAlternative === false`
  - [ ] Track when user clicks suggestion (analytics)

- [ ] **Logic**
  - [ ] Pass result count from search response
  - [ ] Handle suggestion click → new search
  - [ ] Remember if user dismissed suggestion
  - [ ] Don't show again for same query in session

### Related Content

- [ ] **UI Components**
  - [ ] Create "Related Content" section/sidebar
  - [ ] Create `RelatedItemCard` component
  - [ ] Show thumbnail, title, and relationship reason
  - [ ] Display relevance score (optional, for debugging)
  - [ ] Add "See More" button if truncated

- [ ] **Data Fetching**
  - [ ] Call on entity detail page load
  - [ ] Fetch 10-20 items initially
  - [ ] Lazy load more if needed
  - [ ] Cache per entity ID

- [ ] **UX Considerations**
  - [ ] Show loading skeleton
  - [ ] Handle empty state gracefully
  - [ ] Make cards clickable → navigate to entity
  - [ ] Track clicks (analytics)
  - [ ] Show different styling based on relationship type

### Saved Searches

- [ ] **UI Components**
  - [ ] Create "Saved Searches" dropdown/modal
  - [ ] Create `SavedSearchItem` with name and summary
  - [ ] Add "Save Search" button to search page
  - [ ] Create "Save Search" dialog with name input
  - [ ] Add edit/delete actions to saved items
  - [ ] Show saved search parameters on hover/click

- [ ] **CRUD Operations**
  - [ ] **Create**: Dialog with name and auto-capture current query/filters
  - [ ] **Read**: Load user's saved searches on mount
  - [ ] **Update**: Edit dialog with pre-filled values
  - [ ] **Delete**: Confirm dialog before deletion
  - [ ] **Execute**: One-click search execution

- [ ] **State Management**
  - [ ] Store list of saved searches
  - [ ] Update list after create/update/delete
  - [ ] Show success/error toasts
  - [ ] Optimistic updates for better UX

- [ ] **Integration**
  - [ ] Detect when current search matches saved search
  - [ ] Offer to update saved search if parameters changed
  - [ ] Show indicator on search page if using saved search

### General

- [ ] **Error Handling**
  - [ ] Wrap all tRPC calls in try-catch
  - [ ] Show user-friendly error messages
  - [ ] Handle `UNAUTHORIZED` → redirect to login
  - [ ] Handle `FORBIDDEN` → show permission error
  - [ ] Log errors to monitoring service

- [ ] **Performance**
  - [ ] Implement request debouncing (300ms)
  - [ ] Cache facet and related content responses
  - [ ] Use React Query for automatic caching
  - [ ] Lazy load components when possible
  - [ ] Monitor API response times

- [ ] **Accessibility**
  - [ ] Keyboard navigation for filters
  - [ ] ARIA labels for checkboxes and buttons
  - [ ] Screen reader announcements for result counts
  - [ ] Focus management for modals/dialogs
  - [ ] High contrast mode support

- [ ] **Testing**
  - [ ] Unit tests for filter state management
  - [ ] Integration tests for API calls
  - [ ] E2E tests for critical user flows
  - [ ] Test error states and edge cases
  - [ ] Test with various user roles

- [ ] **Analytics**
  - [ ] Track facet usage
  - [ ] Track spell correction acceptance rate
  - [ ] Track related content click-through rate
  - [ ] Track saved search usage
  - [ ] Monitor error rates

---

## Edge Cases to Handle

### Enhanced Faceted Search

1. **No Results**: Show all facets with 0 counts
2. **Single Result**: Still show facets for refinement
3. **All Filters Applied**: Show message if no more refinement possible
4. **Conflicting Filters**: Handle impossible filter combinations gracefully
5. **Slow Loading**: Show skeleton, don't block UI

### Spell Correction

1. **No Corpus Data**: Don't show suggestions
2. **Multiple Word Query**: Correct each word independently
3. **Proper Nouns**: Don't suggest corrections for brand names (if identifiable)
4. **User Dismisses**: Don't show again for same query
5. **Alternating Suggestions**: Don't create suggestion loops

### Related Content

1. **No Related Items**: Show "No related content" message
2. **All Items Excluded**: Handle when all potential recommendations are excluded
3. **Deleted Source Entity**: Handle gracefully with 404
4. **Circular References**: Prevent entity from recommending itself

### Saved Searches

1. **Name Collision**: Allow duplicate names (user responsibility)
2. **Deleted Entities**: Saved searches may reference deleted projects/creators
3. **Permission Changes**: Executed searches respect current permissions
4. **Migration**: Handle schema changes in saved filters gracefully

---

## Support & Troubleshooting

### Common Issues

**Issue**: Facets not updating when filters change  
**Solution**: Ensure you're passing all active filters to `getEnhancedFacets`

**Issue**: Spell correction not showing  
**Solution**: Check `currentResultCount < 5` and `hasAlternative === true`

**Issue**: Related content returns empty array  
**Solution**: Verify entity exists and user has permission to view it

**Issue**: Saved search not found after creation  
**Solution**: Check network tab for errors, verify user is authenticated

### Debugging Tips

1. **Network Tab**: Inspect tRPC payloads and responses
2. **Console Logs**: Check for `TRPCError` in console
3. **React DevTools**: Verify state updates correctly
4. **React Query DevTools**: Inspect cache and query states

### Backend Logs

If issues persist, backend logs include:
- Search query parameters
- Permission filtering details
- Error stack traces
- Performance metrics

---

## Related Documentation

- [Unified Search Implementation](./SEARCH_SERVICE_INTEGRATION.md)
- [Search Analytics Integration](./SEARCH_ANALYTICS_INTEGRATION.md)
- [Authentication Guide](../FRONTEND_INTEGRATION_AUTHENTICATION.md)
- [Backend Module Documentation](../ADVANCED_SEARCH_FEATURES.md)

---

**Questions?** Contact the backend team or check the main API documentation.
