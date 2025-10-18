# Asset Search TypeScript Types & Validation

**🌐 SHARED** - Used by both public-facing website and admin backend

> **Last Updated:** January 2025  
> **Purpose:** Complete TypeScript type definitions for Asset Search integration

---

## Table of Contents
1. [Import Instructions](#import-instructions)
2. [Enums](#enums)
3. [Core Types](#core-types)
4. [Request Types](#request-types)
5. [Response Types](#response-types)
6. [Zod Validation Schemas](#zod-validation-schemas)
7. [Helper Types](#helper-types)
8. [Usage Examples](#usage-examples)

---

## Import Instructions

### From tRPC Client
```typescript
// Types are automatically inferred from your tRPC router
import type { RouterOutputs, RouterInputs } from '@/utils/trpc';

// Infer specific endpoint types
type SearchResponse = RouterOutputs['search']['search'];
type SearchInput = RouterInputs['search']['search'];
type SavedSearches = RouterOutputs['search']['getSavedSearches'];
```

### Direct Type Definitions
For standalone usage without tRPC inference:

```typescript
// Copy these types to your frontend codebase
// Location: src/types/search.types.ts
```

---

## Enums

### SearchableEntity
```typescript
/**
 * Entity types that can be searched
 * Currently only 'assets' is used for asset search
 */
type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';
```

### AssetType
```typescript
/**
 * Types of IP assets in the system
 */
enum AssetType {
  IMAGE = 'IMAGE',           // Image files (jpg, png, svg, etc.)
  VIDEO = 'VIDEO',           // Video files (mp4, mov, etc.)
  AUDIO = 'AUDIO',           // Audio files (mp3, wav, etc.)
  DOCUMENT = 'DOCUMENT',     // Documents (pdf, doc, etc.)
  THREE_D = 'THREE_D',       // 3D models and files
  OTHER = 'OTHER'            // Other file types
}

// As union type (preferred for TypeScript)
type AssetType = 
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'THREE_D'
  | 'OTHER';
```

### AssetStatus
```typescript
/**
 * Lifecycle status of an asset
 */
enum AssetStatus {
  DRAFT = 'DRAFT',           // Initial upload, not yet submitted
  PROCESSING = 'PROCESSING', // Being processed/scanned for security
  REVIEW = 'REVIEW',         // Pending admin review
  APPROVED = 'APPROVED',     // Approved for use, not yet published
  PUBLISHED = 'PUBLISHED',   // Live and publicly available
  REJECTED = 'REJECTED',     // Rejected during review
  ARCHIVED = 'ARCHIVED'      // Archived/inactive
}

// As union type
type AssetStatus = 
  | 'DRAFT'
  | 'PROCESSING'
  | 'REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'ARCHIVED';
```

### SearchSortBy
```typescript
/**
 * Available sort fields for search results
 */
type SearchSortBy = 
  | 'relevance'              // Default: AI-powered relevance score
  | 'created_at'             // Asset creation date
  | 'updated_at'             // Last modified date
  | 'title'                  // Alphabetical by title
  | 'name'                   // Alphabetical by name (alias)
  | 'verified_at'            // Verification date (future use)
  | 'total_collaborations'   // Number of collaborations (future use)
  | 'total_revenue'          // Revenue generated (future use)
  | 'average_rating';        // Average rating (future use)
```

### SearchSortOrder
```typescript
/**
 * Sort direction
 */
type SearchSortOrder = 'asc' | 'desc';
```

---

## Core Types

### SearchQuery
```typescript
/**
 * Main search query interface
 */
interface SearchQuery {
  query: string;                      // Search term (2-200 characters)
  entities?: SearchableEntity[];      // Default: ['assets']
  filters?: SearchFilters;            // Optional filters
  pagination?: SearchPagination;      // Pagination params
  sortBy?: SearchSortBy;              // Default: 'relevance'
  sortOrder?: SearchSortOrder;        // Default: 'desc'
}
```

### SearchFilters
```typescript
/**
 * Comprehensive filter options
 */
interface SearchFilters {
  // Asset-specific filters
  assetType?: string[];               // Filter by asset types
  assetStatus?: string[];             // Filter by asset statuses
  projectId?: string;                 // Assets in specific project (CUID)
  creatorId?: string;                 // Assets owned by creator (CUID)
  
  // Date range filters
  dateFrom?: Date | string;           // Start date (ISO 8601)
  dateTo?: Date | string;             // End date (ISO 8601)
  
  // Metadata filters
  tags?: string[];                    // Asset metadata tags
  createdBy?: string;                 // User ID who uploaded (CUID)
  
  // Future: Creator filters (not used for asset search)
  verificationStatus?: string[];
  specialties?: string[];
  industry?: string[];
  category?: string[];
  country?: string;
  region?: string;
  city?: string;
  availabilityStatus?: 'available' | 'limited' | 'unavailable';
  
  // Future: Project filters
  projectType?: string[];
  projectStatus?: string[];
  brandId?: string;
  
  // Future: License filters
  licenseType?: string[];
  licenseStatus?: string[];
}
```

### SearchPagination
```typescript
/**
 * Pagination parameters
 */
interface SearchPagination {
  page: number;                       // 1-indexed page number
  limit: number;                      // Results per page (1-100)
}
```

---

## Request Types

### UnifiedSearchRequest
```typescript
/**
 * Request for unified search endpoint
 */
interface UnifiedSearchRequest {
  query: string;                      // Min 2, max 200 chars
  entities?: SearchableEntity[];      // Optional entity types
  filters?: SearchFilters;
  page?: number;                      // Default: 1
  limit?: number;                     // Default: 20, max: 100
  sortBy?: SearchSortBy;              // Default: 'relevance'
  sortOrder?: SearchSortOrder;        // Default: 'desc'
}
```

### AssetSearchRequest
```typescript
/**
 * Asset-specific search request
 */
interface AssetSearchRequest {
  query: string;
  filters?: {
    assetType?: string[];
    assetStatus?: string[];
    projectId?: string;
    creatorId?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    tags?: string[];
  };
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}
```

### AutocompleteRequest
```typescript
/**
 * Request for autocomplete suggestions
 */
interface AutocompleteRequest {
  query: string;                      // Min 2, max 100 chars
  limit?: number;                     // Default: 10, max: 20
}
```

### FacetRequest
```typescript
/**
 * Request for faceted search
 */
interface FacetRequest {
  query?: string;                     // Optional search context
  filters?: {
    projectId?: string;
    creatorId?: string;
    tags?: string[];
  };
}
```

### SaveSearchRequest
```typescript
/**
 * Request to save a search
 */
interface SaveSearchRequest {
  name: string;                       // Min 1, max 100 chars
  query: string;                      // Min 1, max 200 chars
  entities?: SearchableEntity[];      // Default: ['assets']
  filters?: SearchFilters;
}
```

### UpdateSavedSearchRequest
```typescript
/**
 * Request to update a saved search
 */
interface UpdateSavedSearchRequest {
  id: string;                         // CUID of saved search
  name?: string;                      // Optional: Update name
  query?: string;                     // Optional: Update query
  entities?: SearchableEntity[];      // Optional: Update entities
  filters?: SearchFilters;            // Optional: Update filters
}
```

### ExecuteSavedSearchRequest
```typescript
/**
 * Request to execute a saved search
 */
interface ExecuteSavedSearchRequest {
  id: string;                         // CUID of saved search
  page?: number;                      // Default: 1
  limit?: number;                     // Default: 20, max: 100
}
```

---

## Response Types

### SearchResponse
```typescript
/**
 * Main search response structure
 */
interface SearchResponse {
  results: SearchResult[];
  pagination: PaginationResponse;
  facets: SearchFacets;
  query: string;                      // Original search query
  executionTimeMs: number;            // Query execution time
}
```

### SearchResult
```typescript
/**
 * Individual search result
 */
interface SearchResult {
  id: string;                         // Asset CUID
  entityType: SearchableEntity;       // Always 'assets' for asset search
  title: string;                      // Asset title
  description: string | null;         // Asset description
  relevanceScore: number;             // 0-1 relevance score
  scoreBreakdown: ScoreBreakdown;     // Score components
  highlights: SearchHighlights;       // Highlighted matches
  metadata: AssetMetadata;            // Asset-specific metadata
  createdAt: Date;                    // ISO 8601 datetime
  updatedAt: Date;                    // ISO 8601 datetime
}
```

### ScoreBreakdown
```typescript
/**
 * Breakdown of relevance scoring components
 */
interface ScoreBreakdown {
  textualRelevance: number;           // Text match score (0-1)
  recencyScore: number;               // Recency boost (0-1)
  popularityScore: number;            // Popularity boost (0-1)
  qualityScore: number;               // Quality score (0-1)
  finalScore: number;                 // Weighted final score (0-1)
}
```

### SearchHighlights
```typescript
/**
 * Highlighted text matches
 */
interface SearchHighlights {
  title?: string;                     // Title with <mark> tags
  description?: string;               // Description with <mark> tags
  content?: string;                   // Content with <mark> tags (future)
  tags?: string[];                    // Matching tags
}
```

### AssetMetadata
```typescript
/**
 * Asset-specific metadata in search results
 */
interface AssetMetadata {
  type: 'asset';                      // Discriminator
  assetType: AssetType;               // IMAGE, VIDEO, etc.
  status: AssetStatus;                // DRAFT, APPROVED, etc.
  fileSize: bigint;                   // File size in bytes
  mimeType: string;                   // e.g., 'image/png'
  thumbnailUrl: string | null;        // URL to thumbnail
  createdBy: string;                  // User ID who uploaded
  tags?: string[];                    // Asset tags from metadata
}
```

### PaginationResponse
```typescript
/**
 * Pagination metadata in responses
 */
interface PaginationResponse {
  page: number;                       // Current page (1-indexed)
  limit: number;                      // Results per page
  total: number;                      // Total matching results
  totalPages: number;                 // Total number of pages
  hasNextPage: boolean;               // Has more results
  hasPreviousPage: boolean;           // Has previous results
}
```

### SearchFacets
```typescript
/**
 * Faceted search aggregations
 */
interface SearchFacets {
  entityCounts: Record<SearchableEntity, number>;  // Count per entity type
  assetTypes?: Record<string, number>;             // Count per asset type
  projectTypes?: Record<string, number>;           // Future use
  licenseTypes?: Record<string, number>;           // Future use
  statuses?: Record<string, number>;               // Count per status
  verificationStatus?: Record<string, number>;     // Future use
  specialties?: Array<{                            // Future use
    value: string;
    count: number;
  }>;
  brands?: Array<{                                 // Future use
    id: string;
    name: string;
    count: number;
  }>;
  dateRanges?: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
    older: number;
  };
}
```

### AssetFacetsResponse
```typescript
/**
 * Asset-specific facet response
 */
interface AssetFacetsResponse {
  assetTypes: Record<string, number>;              // { "IMAGE": 100 }
  statuses: Record<string, number>;                // { "APPROVED": 80 }
  projects: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  creators: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  tags: Array<{
    value: string;
    count: number;
  }>;
  totalCount: number;
}
```

### AutocompleteResponse
```typescript
/**
 * Autocomplete suggestion
 */
interface AutocompleteSuggestion {
  id: string;
  title: string;
  type: string;                       // Asset type
  status: string;                     // Asset status
  thumbnailUrl: string | null;
}

type AutocompleteResponse = AutocompleteSuggestion[];
```

### SavedSearch
```typescript
/**
 * Saved search structure
 */
interface SavedSearch {
  id: string;                         // CUID
  userId: string;                     // Owner user ID
  name: string;                       // Display name
  searchQuery: string;                // Original query
  entities: SearchableEntity[];       // Entity types
  filters: Record<string, any>;       // Filter object
  createdAt: Date;
  updatedAt: Date;
}
```

### RecentSearch
```typescript
/**
 * Recent search history item
 */
interface RecentSearch {
  query: string;
  timestamp: Date;
  resultCount: number;
}
```

---

## Zod Validation Schemas

### Installation
```bash
npm install zod
```

### Usage
```typescript
import { z } from 'zod';

// Use these schemas for client-side validation before API calls
```

### searchQuerySchema
```typescript
import { z } from 'zod';

export const searchableEntitySchema = z.enum(['assets', 'creators', 'projects', 'licenses']);

export const searchFiltersSchema = z.object({
  // Asset filters
  assetType: z.array(z.string()).optional(),
  assetStatus: z.array(z.string()).optional(),
  projectId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  
  // Date filters
  dateFrom: z.string().datetime().optional().or(z.date().optional()),
  dateTo: z.string().datetime().optional().or(z.date().optional()),
  
  // Common filters
  createdBy: z.string().cuid().optional(),
  tags: z.array(z.string()).optional(),
  
  // Creator filters (future)
  verificationStatus: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  availabilityStatus: z.enum(['available', 'limited', 'unavailable']).optional(),
  
  // Project filters (future)
  projectType: z.array(z.string()).optional(),
  projectStatus: z.array(z.string()).optional(),
  brandId: z.string().cuid().optional(),
  
  // License filters (future)
  licenseType: z.array(z.string()).optional(),
  licenseStatus: z.array(z.string()).optional(),
}).optional();

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

// Type inference
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SearchFiltersInput = z.infer<typeof searchFiltersSchema>;
```

### Client-Side Validation Example
```typescript
import { searchQuerySchema } from '@/schemas/search';

const validateSearchParams = (params: unknown) => {
  try {
    const validated = searchQuerySchema.parse(params);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        errors: error.flatten().fieldErrors 
      };
    }
    return { success: false, errors: {} };
  }
};

// Usage
const result = validateSearchParams({
  query: 'l',  // Too short!
  page: 1
});

if (!result.success) {
  console.error(result.errors);
  // { query: ['Search query must be at least 2 characters'] }
}
```

---

## Helper Types

### API Response Wrapper
```typescript
/**
 * Standard API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    data?: {
      zodError?: {
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}
```

### Type Guards
```typescript
/**
 * Type guard for asset metadata
 */
function isAssetMetadata(metadata: any): metadata is AssetMetadata {
  return metadata?.type === 'asset';
}

/**
 * Type guard for error response
 */
function isErrorResponse(response: any): response is ApiErrorResponse {
  return 'error' in response && response.error?.code !== undefined;
}

// Usage
if (isAssetMetadata(result.metadata)) {
  console.log(result.metadata.assetType); // TypeScript knows this is AssetMetadata
}
```

### Utility Types
```typescript
/**
 * Make all properties of T optional recursively
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract filter keys for specific use cases
 */
type AssetFilterKeys = Pick<SearchFilters, 
  | 'assetType' 
  | 'assetStatus' 
  | 'projectId' 
  | 'creatorId' 
  | 'dateFrom' 
  | 'dateTo' 
  | 'tags' 
  | 'createdBy'
>;

/**
 * Pagination state for UI
 */
interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

---

## Usage Examples

### Complete Search Component Types
```typescript
import { useState } from 'react';
import { trpc } from '@/utils/trpc';

interface SearchComponentProps {
  initialQuery?: string;
  defaultFilters?: SearchFilters;
}

export function AssetSearchComponent({ 
  initialQuery = '', 
  defaultFilters = {} 
}: SearchComponentProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = trpc.search.search.useQuery({
    query,
    filters,
    page,
    limit: 20,
    sortBy: 'relevance',
    sortOrder: 'desc'
  }, {
    enabled: query.length >= 2
  });

  // Type-safe access to response
  const results: SearchResult[] = data?.data.results || [];
  const pagination: PaginationResponse = data?.data.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false
  };

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

### Filter State Management
```typescript
interface FilterState {
  assetType: string[];
  assetStatus: string[];
  tags: string[];
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
}

const [filterState, setFilterState] = useState<FilterState>({
  assetType: [],
  assetStatus: [],
  tags: [],
  dateRange: { from: null, to: null }
});

// Convert to SearchFilters
const searchFilters: SearchFilters = {
  assetType: filterState.assetType.length > 0 ? filterState.assetType : undefined,
  assetStatus: filterState.assetStatus.length > 0 ? filterState.assetStatus : undefined,
  tags: filterState.tags.length > 0 ? filterState.tags : undefined,
  dateFrom: filterState.dateRange.from || undefined,
  dateTo: filterState.dateRange.to || undefined,
};
```

### Autocomplete with Types
```typescript
function SearchInput() {
  const [input, setInput] = useState('');
  
  const { data: suggestions } = trpc.search.getAssetSuggestions.useQuery(
    { query: input, limit: 10 },
    { enabled: input.length >= 2 }
  );

  const handleSuggestionClick = (suggestion: AutocompleteSuggestion) => {
    setInput(suggestion.title);
    // Navigate to asset detail
    router.push(`/assets/${suggestion.id}`);
  };

  return (
    <div>
      <input 
        value={input} 
        onChange={(e) => setInput(e.target.value)}
      />
      {suggestions?.data.map((suggestion) => (
        <div key={suggestion.id} onClick={() => handleSuggestionClick(suggestion)}>
          <img src={suggestion.thumbnailUrl || '/placeholder.png'} alt="" />
          <span>{suggestion.title}</span>
          <span>{suggestion.type}</span>
        </div>
      ))}
    </div>
  );
}
```

### Saved Search Management
```typescript
function SavedSearches() {
  const { data: savedSearches } = trpc.search.getSavedSearches.useQuery();
  const saveMutation = trpc.search.saveSearch.useMutation();
  const deleteMutation = trpc.search.deleteSavedSearch.useMutation();

  const handleSave = async (params: SaveSearchRequest) => {
    await saveMutation.mutateAsync(params);
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id });
  };

  const searches: SavedSearch[] = savedSearches?.data || [];

  return (
    <div>
      {searches.map((search) => (
        <div key={search.id}>
          <h3>{search.name}</h3>
          <p>{search.searchQuery}</p>
          <button onClick={() => handleDelete(search.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

---

## TypeScript Configuration

### Recommended tsconfig.json Settings
```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "target": "ES2022"
  }
}
```

### BigInt Support
```typescript
// BigInt serialization with SuperJSON
import superjson from 'superjson';

// File sizes are returned as BigInt
const formatFileSize = (size: bigint): string => {
  const bytes = Number(size);
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${value.toFixed(2)} ${units[unitIndex]}`;
};
```

---

## Best Practices

### 1. Use Type Inference
```typescript
// ✅ Good: Let tRPC infer types
const { data } = trpc.search.search.useQuery(params);
// data is automatically typed

// ❌ Bad: Manual typing when unnecessary
const { data }: { data: SearchResponse } = trpc.search.search.useQuery(params);
```

### 2. Narrow Types with Guards
```typescript
if (result.metadata.type === 'asset') {
  // TypeScript narrows to AssetMetadata
  console.log(result.metadata.assetType);
}
```

### 3. Use Discriminated Unions
```typescript
type FilterValue = 
  | { type: 'string'; value: string }
  | { type: 'array'; value: string[] }
  | { type: 'date'; value: Date };

function processFilter(filter: FilterValue) {
  switch (filter.type) {
    case 'string':
      return filter.value.toLowerCase();
    case 'array':
      return filter.value.join(',');
    case 'date':
      return filter.value.toISOString();
  }
}
```

### 4. Optional Chaining for Safety
```typescript
// ✅ Safe access to nested optional properties
const thumbnailUrl = result.metadata?.thumbnailUrl ?? '/placeholder.png';
const tags = result.metadata?.tags ?? [];
```

---

## Support

For TypeScript-related questions:
- Review this type reference
- Check tRPC type inference first
- Use TypeScript playground for testing
- Refer to Zod documentation for validation

---

**Document Version:** 1.0.0  
**Last Updated:** January 2025
