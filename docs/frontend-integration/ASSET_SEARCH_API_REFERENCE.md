# Asset Search API Reference

**🌐 SHARED** - Used by both public-facing website and admin backend

> **Last Updated:** January 2025  
> **Backend Deployment:** ops.yesgoddess.agency  
> **Frontend Repo:** yesgoddess-web (Next.js 15 + App Router + TypeScript)

---

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Base Configuration](#base-configuration)
4. [API Endpoints](#api-endpoints)
5. [Request & Response Schemas](#request--response-schemas)
6. [Pagination](#pagination)
7. [Filtering & Sorting](#filtering--sorting)
8. [Authorization & Permissions](#authorization--permissions)
9. [Error Handling](#error-handling)

---

## Overview

The Asset Search API provides comprehensive search functionality for IP assets (images, videos, audio, documents, etc.) with role-based access control, advanced filtering, autocomplete, saved searches, and analytics.

### Key Features
- **Full-text search** on asset titles and descriptions
- **Advanced filtering** by type, status, project, creator, tags, and date ranges
- **Role-based permissions** (Creator, Brand, Admin access levels)
- **Autocomplete suggestions** for fast typeahead
- **Faceted search** with dynamic filter counts
- **Saved searches** for frequently-used queries
- **Recent search history** tracking

### Technology Stack
- **Protocol:** tRPC (type-safe RPC over HTTP)
- **Authentication:** JWT via NextAuth.js
- **Validation:** Zod schemas
- **Transport:** JSON with SuperJSON for Date/BigInt serialization

---

## Authentication

### Requirements
All asset search endpoints require authentication via NextAuth.js session.

### HTTP Headers
```http
Cookie: next-auth.session-token=<JWT_TOKEN>
```

### Session Structure
```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  };
  expires: string;
}
```

### Unauthenticated Requests
**HTTP Status:** `401 UNAUTHORIZED`
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to access this resource"
  }
}
```

---

## Base Configuration

### API Base URL
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';
```

### tRPC Client Setup
```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root';

export const trpc = createTRPCReact<AppRouter>();

// Provider setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
```

---

## API Endpoints

### 1. Unified Search
**Endpoint:** `search.search`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

Performs unified search across assets with permission filtering and advanced options.

#### Request
```typescript
{
  query: string;                    // Min 2, max 200 chars
  entities?: string[];              // Default: ['assets']
  filters?: {
    assetType?: string[];           // e.g., ['IMAGE', 'VIDEO']
    assetStatus?: string[];         // e.g., ['APPROVED', 'PUBLISHED']
    projectId?: string;             // CUID format
    creatorId?: string;             // CUID format
    dateFrom?: string | Date;       // ISO 8601 datetime
    dateTo?: string | Date;         // ISO 8601 datetime
    tags?: string[];                // Asset metadata tags
    createdBy?: string;             // User ID who uploaded
  };
  page?: number;                    // Default: 1, min: 1
  limit?: number;                   // Default: 20, min: 1, max: 100
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';  // Default: 'relevance'
  sortOrder?: 'asc' | 'desc';       // Default: 'desc'
}
```

#### Response
```typescript
{
  success: true;
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
      entityCounts: {
        assets: number;
      };
      assetTypes?: Record<string, number>;     // e.g., { "IMAGE": 45, "VIDEO": 23 }
      statuses?: Record<string, number>;       // e.g., { "APPROVED": 30, "PUBLISHED": 15 }
      dateRanges?: {
        last7Days: number;
        last30Days: number;
        last90Days: number;
        older: number;
      };
    };
    query: string;                  // Original search query
    executionTimeMs: number;        // Query execution time
  };
}
```

#### SearchResult Structure
```typescript
interface SearchResult {
  id: string;
  entityType: 'assets';
  title: string;
  description: string | null;
  relevanceScore: number;           // 0-1 score
  scoreBreakdown: {
    textualRelevance: number;
    recencyScore: number;
    popularityScore: number;
    qualityScore: number;
    finalScore: number;
  };
  highlights: {
    title?: string;                 // Highlighted match
    description?: string;           // Highlighted match
    tags?: string[];
  };
  metadata: {
    type: 'asset';
    assetType: string;              // IMAGE, VIDEO, AUDIO, DOCUMENT, THREE_D, OTHER
    status: string;                 // DRAFT, PROCESSING, REVIEW, APPROVED, PUBLISHED, REJECTED, ARCHIVED
    fileSize: bigint;
    mimeType: string;
    thumbnailUrl: string | null;
    createdBy: string;
    tags?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### Usage Example
```typescript
const { data, isLoading, error } = trpc.search.search.useQuery({
  query: 'brand logo',
  filters: {
    assetType: ['IMAGE'],
    assetStatus: ['APPROVED', 'PUBLISHED'],
    tags: ['marketing']
  },
  page: 1,
  limit: 20,
  sortBy: 'relevance'
});
```

---

### 2. Asset-Specific Search
**Endpoint:** `search.searchAssets`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

Specialized endpoint for asset-only search with same filtering capabilities.

#### Request
```typescript
{
  query: string;                    // Min 2, max 200 chars
  filters?: {
    assetType?: string[];
    assetStatus?: string[];
    projectId?: string;
    creatorId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    tags?: string[];
  };
  page?: number;                    // Default: 1
  limit?: number;                   // Default: 20, max: 100
  sortBy?: 'relevance' | 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}
```

#### Response
Same structure as unified search, but only returns assets.

---

### 3. Autocomplete Suggestions
**Endpoint:** `search.getAssetSuggestions`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

Fast typeahead suggestions for asset titles.

#### Request
```typescript
{
  query: string;                    // Min 2, max 100 chars
  limit?: number;                   // Default: 10, min: 1, max: 20
}
```

#### Response
```typescript
{
  success: true;
  data: Array<{
    id: string;
    title: string;
    type: string;                   // Asset type
    status: string;
    thumbnailUrl: string | null;
  }>;
}
```

#### Usage Example
```typescript
const { data } = trpc.search.getAssetSuggestions.useQuery(
  { query: searchInput, limit: 10 },
  { enabled: searchInput.length >= 2 }  // Only fetch when 2+ chars
);
```

---

### 4. Faceted Search
**Endpoint:** `search.getAssetFacets`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

Get available filter options with counts for building dynamic filter UI.

#### Request
```typescript
{
  query?: string;                   // Optional search query
  filters?: {
    projectId?: string;
    creatorId?: string;
    tags?: string[];
  };
}
```

#### Response
```typescript
{
  success: true;
  data: {
    assetTypes: Record<string, number>;     // { "IMAGE": 100, "VIDEO": 45 }
    statuses: Record<string, number>;       // { "APPROVED": 80, "PUBLISHED": 20 }
    projects: Array<{                       // Top 20 projects
      id: string;
      name: string;
      count: number;
    }>;
    creators: Array<{                       // Top 20 creators
      id: string;
      name: string;
      count: number;
    }>;
    tags: Array<{                           // All tags
      value: string;
      count: number;
    }>;
    totalCount: number;
  };
}
```

---

### 5. Recent Searches
**Endpoint:** `search.getRecentSearches`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

Retrieve user's recent search queries.

#### Request
```typescript
{
  limit?: number;                   // Default: 10, min: 1, max: 50
}
```

#### Response
```typescript
{
  success: true;
  data: Array<{
    query: string;
    timestamp: Date;
    resultCount: number;
  }>;
}
```

---

### 6. Saved Searches

#### 6.1 Get Saved Searches
**Endpoint:** `search.getSavedSearches`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

#### Response
```typescript
{
  success: true;
  data: Array<{
    id: string;
    userId: string;
    name: string;
    searchQuery: string;
    entities: string[];
    filters: object;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
```

#### 6.2 Save Search
**Endpoint:** `search.saveSearch`  
**Method:** `mutation`  
**Access:** 🔒 Protected (All authenticated users)

#### Request
```typescript
{
  name: string;                     // Min 1, max 100 chars
  query: string;                    // Min 1, max 200 chars
  entities?: string[];              // Default: ['assets']
  filters?: {
    assetType?: string[];
    assetStatus?: string[];
    projectId?: string;
    creatorId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    tags?: string[];
    createdBy?: string;
  };
}
```

#### Response
```typescript
{
  success: true;
  data: {
    id: string;
    name: string;
    // ... saved search details
  };
}
```

#### 6.3 Update Saved Search
**Endpoint:** `search.updateSavedSearch`  
**Method:** `mutation`  
**Access:** 🔒 Protected (All authenticated users)

#### Request
```typescript
{
  id: string;                       // CUID of saved search
  name?: string;                    // Optional update
  query?: string;                   // Optional update
  entities?: string[];              // Optional update
  filters?: object;                 // Optional update
}
```

#### 6.4 Delete Saved Search
**Endpoint:** `search.deleteSavedSearch`  
**Method:** `mutation`  
**Access:** 🔒 Protected (All authenticated users)

#### Request
```typescript
{
  id: string;                       // CUID of saved search
}
```

#### 6.5 Execute Saved Search
**Endpoint:** `search.executeSavedSearch`  
**Method:** `query`  
**Access:** 🔒 Protected (All authenticated users)

#### Request
```typescript
{
  id: string;                       // CUID of saved search
  page?: number;                    // Default: 1
  limit?: number;                   // Default: 20, max: 100
}
```

#### Response
```typescript
{
  success: true;
  data: {
    search: {
      results: SearchResult[];
      pagination: { /* ... */ };
      facets: { /* ... */ };
      // ... search response structure
    };
    savedSearchName: string;
  };
}
```

---

## Request & Response Schemas

### Asset Types (Enum)
```typescript
type AssetType = 
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'THREE_D'
  | 'OTHER';
```

### Asset Status (Enum)
```typescript
type AssetStatus = 
  | 'DRAFT'       // Initial upload state
  | 'PROCESSING'  // Being processed/scanned
  | 'REVIEW'      // Pending review
  | 'APPROVED'    // Approved for use
  | 'PUBLISHED'   // Publicly available
  | 'REJECTED'    // Not approved
  | 'ARCHIVED';   // Archived/inactive
```

### Sort Options
```typescript
type SearchSortBy = 
  | 'relevance'       // Default: Best match based on scoring
  | 'created_at'      // Creation date
  | 'updated_at'      // Last modified date
  | 'title';          // Alphabetical

type SearchSortOrder = 'asc' | 'desc';
```

---

## Pagination

### Format
Page-based pagination with comprehensive metadata.

```typescript
interface PaginationParams {
  page: number;        // 1-indexed page number
  limit: number;       // Results per page (1-100)
}

interface PaginationResponse {
  page: number;
  limit: number;
  total: number;              // Total matching results
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Implementation Example
```typescript
const [page, setPage] = useState(1);
const { data } = trpc.search.search.useQuery({
  query: 'logo',
  page,
  limit: 20
});

// Pagination controls
<button 
  disabled={!data?.data.pagination.hasPreviousPage}
  onClick={() => setPage(p => p - 1)}
>
  Previous
</button>

<span>Page {data?.data.pagination.page} of {data?.data.pagination.totalPages}</span>

<button 
  disabled={!data?.data.pagination.hasNextPage}
  onClick={() => setPage(p => p + 1)}
>
  Next
</button>
```

---

## Filtering & Sorting

### Available Filters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `assetType` | `string[]` | Filter by asset type | `['IMAGE', 'VIDEO']` |
| `assetStatus` | `string[]` | Filter by status | `['APPROVED', 'PUBLISHED']` |
| `projectId` | `string` | Assets in specific project | `'clxxx1234567890'` |
| `creatorId` | `string` | Assets owned by creator | `'clxxx1234567890'` |
| `dateFrom` | `Date \| string` | Start of date range | `'2024-01-01T00:00:00Z'` |
| `dateTo` | `Date \| string` | End of date range | `'2024-12-31T23:59:59Z'` |
| `tags` | `string[]` | Filter by metadata tags | `['marketing', 'social']` |
| `createdBy` | `string` | Filter by uploader | `'clxxx1234567890'` |

### Multi-Filter Combination
All filters can be combined using AND logic:

```typescript
{
  query: 'brand assets',
  filters: {
    assetType: ['IMAGE'],
    assetStatus: ['APPROVED', 'PUBLISHED'],  // OR within same filter
    tags: ['marketing', 'q4'],
    dateFrom: new Date('2024-10-01')
  }
}
```

### Dynamic Filter UI Example
```typescript
const { data: facets } = trpc.search.getAssetFacets.useQuery({
  query: searchQuery,
  filters: currentFilters
});

// Render checkboxes for asset types
{Object.entries(facets?.data.assetTypes || {}).map(([type, count]) => (
  <label key={type}>
    <input 
      type="checkbox"
      checked={filters.assetType?.includes(type)}
      onChange={(e) => handleFilterChange('assetType', type, e.target.checked)}
    />
    {type} ({count})
  </label>
))}
```

---

## Authorization & Permissions

### Role-Based Access Control

The Asset Search API enforces strict role-based permissions:

#### 🔑 CREATOR Role
- **Can search:** Only assets they own (via `ip_ownerships` table)
- **Ownership criteria:** Active ownership record (endDate = null)
- **Use case:** Creators managing their own IP portfolio

#### 🔑 BRAND Role
- **Can search:** 
  1. Assets in projects they own
  2. Assets they have active licenses for (status = ACTIVE, not expired)
- **Use case:** Brands accessing licensed content

#### 🔑 ADMIN Role
- **Can search:** All assets in the system (no filtering)
- **Use case:** Platform administration and support

#### 🔑 VIEWER Role
- **Can search:** Same as ADMIN (configurable)
- **Use case:** Read-only administrative access

### Permission Enforcement

Permissions are enforced **server-side** in the search service layer. The frontend should:

1. **Never rely on client-side filtering** for security
2. **Display appropriate UI** based on user role
3. **Handle gracefully** when searches return no results due to permissions
4. **Show contextual messages** like "You don't have access to assets in this project"

### Example: Role-Based UI
```typescript
const { user } = useSession();

// Show different search hints based on role
{user.role === 'CREATOR' && (
  <p className="text-sm text-gray-500">
    Searching your owned assets only
  </p>
)}

{user.role === 'BRAND' && (
  <p className="text-sm text-gray-500">
    Searching assets in your projects and licenses
  </p>
)}
```

---

## Error Handling

### HTTP Status Codes

| Status | Code | Description |
|--------|------|-------------|
| 200 | - | Success |
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found (saved search) |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |

### Error Response Structure
```typescript
{
  error: {
    code: string;                      // tRPC error code
    message: string;                   // Human-readable message
    data?: {
      zodError?: {                     // Validation errors
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}
```

### Common Errors

#### 1. Validation Errors
**Code:** `BAD_REQUEST`

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "data": {
      "zodError": {
        "fieldErrors": {
          "query": ["Search query must be at least 2 characters"]
        }
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
if (error?.data?.zodError) {
  const fieldErrors = error.data.zodError.fieldErrors;
  // Display field-specific validation errors
}
```

#### 2. Authentication Error
**Code:** `UNAUTHORIZED`

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be logged in to access this resource"
  }
}
```

**Frontend Handling:**
```typescript
if (error?.code === 'UNAUTHORIZED') {
  // Redirect to login
  router.push('/login');
}
```

#### 3. Not Found Error
**Code:** `NOT_FOUND`

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Saved search not found"
  }
}
```

**Frontend Handling:**
```typescript
if (error?.code === 'NOT_FOUND') {
  toast.error('The saved search you requested does not exist');
  router.push('/search');
}
```

#### 4. Server Error
**Code:** `INTERNAL_SERVER_ERROR`

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Failed to execute search"
  }
}
```

**Frontend Handling:**
```typescript
if (error?.code === 'INTERNAL_SERVER_ERROR') {
  toast.error('Something went wrong. Please try again.');
  // Optionally retry or show error state
}
```

### Error Handling Best Practices

```typescript
const { data, error, isLoading } = trpc.search.search.useQuery(params);

useEffect(() => {
  if (error) {
    // Log to error tracking service
    console.error('Search error:', error);
    
    // Show user-friendly message
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        toast.error('Please log in to search assets');
        router.push('/login');
        break;
      case 'BAD_REQUEST':
        toast.error('Invalid search parameters');
        break;
      default:
        toast.error('Search failed. Please try again.');
    }
  }
}, [error]);
```

### Retry Strategy
```typescript
const { data } = trpc.search.search.useQuery(params, {
  retry: (failureCount, error) => {
    // Don't retry on auth errors
    if (error.data?.code === 'UNAUTHORIZED') return false;
    // Retry up to 3 times for server errors
    if (error.data?.code === 'INTERNAL_SERVER_ERROR') return failureCount < 3;
    return false;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

---

## Rate Limiting

### Current Implementation
**Status:** Not currently enforced at the API level, but recommended for production.

### Recommended Client-Side Rate Limiting

#### Search Debouncing
```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const [searchInput, setSearchInput] = useState('');
const debouncedQuery = useDebouncedValue(searchInput, 300); // 300ms delay

const { data } = trpc.search.search.useQuery(
  { query: debouncedQuery, /* ... */ },
  { enabled: debouncedQuery.length >= 2 }
);
```

#### Autocomplete Throttling
```typescript
import { useThrottle } from '@/hooks/useThrottle';

const handleAutocomplete = useThrottle((query: string) => {
  // Fetch suggestions
}, 200); // Max 5 requests/second
```

### Future Server-Side Rate Limiting
If implemented, expect these headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640000000
```

**Error Response:**
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  }
}
```

---

## Performance Considerations

### Query Performance Targets
- **Standard search:** < 200ms
- **Autocomplete:** < 100ms
- **Facet calculation:** < 300ms

### Optimization Tips

1. **Use Pagination:** Don't fetch all results at once
2. **Debounce Search Input:** Prevent excessive API calls
3. **Cache Results:** Use React Query's caching
4. **Prefetch Common Searches:** Preload likely next page
5. **Limit Facet Requests:** Only fetch when filter panel is open

```typescript
// Prefetch next page
const utils = trpc.useContext();
const prefetchNextPage = () => {
  if (data?.data.pagination.hasNextPage) {
    utils.search.search.prefetch({
      ...currentParams,
      page: currentParams.page + 1
    });
  }
};
```

---

## Support

For questions or issues with the Asset Search API:
- **Backend Team:** Review this documentation
- **API Issues:** Check error responses and logs
- **Feature Requests:** Submit via standard process

---

**Document Version:** 1.0.0  
**Last Updated:** January 2025
