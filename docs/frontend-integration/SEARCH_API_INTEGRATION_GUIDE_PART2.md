# Search API - Frontend Integration Guide (Part 2)

**Module:** Search Service  
**Classification:** 🌐 SHARED  
**Continued from:** [Part 1 - API Endpoints & Types](./SEARCH_API_INTEGRATION_GUIDE.md)

---

## Table of Contents

1. [Request/Response Examples](#requestresponse-examples)
2. [Error Handling](#error-handling)
3. [Pagination & Filtering](#pagination--filtering)
4. [Rate Limiting](#rate-limiting)
5. [Business Logic & Validation](#business-logic--validation)
6. [Frontend Implementation Guide](#frontend-implementation-guide)
7. [React Query Examples](#react-query-examples)
8. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)

---

## Request/Response Examples

### Example 1: Basic Unified Search

**Request:**

```typescript
import { trpc } from '@/lib/trpc/client';

const result = await trpc.search.search.query({
  query: 'marketing campaign',
  entities: ['assets', 'projects'],
  page: 1,
  limit: 20,
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "clw123456789",
        "entityType": "assets",
        "title": "Summer Marketing Campaign Logo",
        "description": "Bold, vibrant logo design for summer campaign",
        "relevanceScore": 0.95,
        "scoreBreakdown": {
          "textualRelevance": 0.9,
          "recencyScore": 0.8,
          "popularityScore": 0.7,
          "qualityScore": 1.0,
          "finalScore": 0.95
        },
        "highlights": {
          "title": "Summer <mark>Marketing</mark> <mark>Campaign</mark> Logo",
          "description": "Bold, vibrant logo design for summer <mark>campaign</mark>"
        },
        "metadata": {
          "type": "asset",
          "assetType": "IMAGE",
          "status": "ACTIVE",
          "fileSize": 2048576,
          "mimeType": "image/png",
          "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw123456789.jpg",
          "createdBy": "clw987654321",
          "tags": ["logo", "marketing", "summer", "campaign"]
        },
        "createdAt": "2025-09-15T10:30:00.000Z",
        "updatedAt": "2025-10-01T14:20:00.000Z"
      },
      {
        "id": "clw234567890",
        "entityType": "projects",
        "title": "Q4 Marketing Campaign",
        "description": "Holiday season promotional campaign",
        "relevanceScore": 0.88,
        "scoreBreakdown": {
          "textualRelevance": 0.95,
          "recencyScore": 0.9,
          "popularityScore": 0.6,
          "qualityScore": 0.9,
          "finalScore": 0.88
        },
        "highlights": {
          "title": "Q4 <mark>Marketing</mark> <mark>Campaign</mark>"
        },
        "metadata": {
          "type": "project",
          "projectType": "CAMPAIGN",
          "status": "ACTIVE",
          "brandName": "Acme Corp",
          "budgetCents": 5000000,
          "startDate": "2025-10-01T00:00:00.000Z",
          "endDate": "2025-12-31T23:59:59.000Z"
        },
        "createdAt": "2025-09-01T09:00:00.000Z",
        "updatedAt": "2025-10-15T16:45:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 47,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "facets": {
      "entityCounts": {
        "assets": 32,
        "creators": 0,
        "projects": 15,
        "licenses": 0
      },
      "assetTypes": {
        "IMAGE": 20,
        "VIDEO": 8,
        "DOCUMENT": 4
      },
      "projectTypes": {
        "CAMPAIGN": 10,
        "CONTENT": 5
      },
      "dateRanges": {
        "last7Days": 5,
        "last30Days": 18,
        "last90Days": 35,
        "older": 12
      }
    },
    "query": "marketing campaign",
    "executionTimeMs": 145
  }
}
```

---

### Example 2: Advanced Asset Search with Filters

**Request:**

```typescript
const result = await trpc.search.searchAssets.query({
  query: 'logo',
  filters: {
    assetType: ['IMAGE', 'VECTOR'],
    assetStatus: ['ACTIVE'],
    tags: ['branding', 'professional'],
    dateFrom: '2025-01-01T00:00:00.000Z',
    dateTo: '2025-10-17T23:59:59.000Z',
  },
  page: 1,
  limit: 12,
  sortBy: 'created_at',
  sortOrder: 'desc',
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "clw345678901",
        "entityType": "assets",
        "title": "Corporate Logo Design",
        "description": "Professional corporate branding logo",
        "relevanceScore": 0.92,
        "scoreBreakdown": {
          "textualRelevance": 1.0,
          "recencyScore": 0.95,
          "popularityScore": 0.75,
          "qualityScore": 1.0,
          "finalScore": 0.92
        },
        "highlights": {
          "title": "Corporate <mark>Logo</mark> Design",
          "tags": ["<mark>branding</mark>", "<mark>professional</mark>"]
        },
        "metadata": {
          "type": "asset",
          "assetType": "IMAGE",
          "status": "ACTIVE",
          "fileSize": 1536789,
          "mimeType": "image/svg+xml",
          "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw345678901.jpg",
          "createdBy": "clw876543210",
          "tags": ["logo", "branding", "professional", "corporate"]
        },
        "createdAt": "2025-10-10T11:20:00.000Z",
        "updatedAt": "2025-10-10T11:20:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 8,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    },
    "facets": {
      "entityCounts": {
        "assets": 8,
        "creators": 0,
        "projects": 0,
        "licenses": 0
      },
      "assetTypes": {
        "IMAGE": 6,
        "VECTOR": 2
      }
    },
    "query": "logo",
    "executionTimeMs": 87
  }
}
```

---

### Example 3: Creator Search with Location Filter

**Request:**

```typescript
const result = await trpc.search.searchCreators.query({
  query: 'photographer',
  filters: {
    verificationStatus: ['VERIFIED'],
    specialties: ['Photography', 'Portrait'],
    country: 'US',
    region: 'California',
    availabilityStatus: 'available',
  },
  sortBy: 'average_rating',
  sortOrder: 'desc',
  limit: 10,
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "clw456789012",
        "entityType": "creators",
        "title": "Jane Smith Photography",
        "description": "Award-winning portrait and commercial photographer",
        "relevanceScore": 0.96,
        "scoreBreakdown": {
          "textualRelevance": 0.85,
          "recencyScore": 0.7,
          "popularityScore": 0.9,
          "qualityScore": 1.0,
          "finalScore": 0.96
        },
        "highlights": {
          "title": "Jane Smith <mark>Photography</mark>",
          "description": "Award-winning portrait and commercial <mark>photographer</mark>"
        },
        "metadata": {
          "type": "creator",
          "stageName": "Jane Smith Photography",
          "verificationStatus": "VERIFIED",
          "specialties": ["Photography", "Portrait", "Commercial"],
          "avatar": "https://cdn.yesgoddess.agency/avatars/jane-smith.jpg",
          "portfolioUrl": "https://janesmithphoto.com",
          "availability": {
            "status": "available",
            "nextAvailable": null
          },
          "performanceMetrics": {
            "totalCollaborations": 47,
            "totalRevenue": 125000,
            "averageRating": 4.9,
            "recentActivityScore": 0.95
          }
        },
        "createdAt": "2024-03-15T08:00:00.000Z",
        "updatedAt": "2025-10-12T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 23,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "facets": {
      "entityCounts": {
        "assets": 0,
        "creators": 23,
        "projects": 0,
        "licenses": 0
      },
      "verificationStatus": {
        "VERIFIED": 23
      },
      "specialties": [
        { "value": "Photography", "count": 23 },
        { "value": "Portrait", "count": 15 },
        { "value": "Commercial", "count": 12 },
        { "value": "Event", "count": 8 }
      ]
    },
    "query": "photographer",
    "executionTimeMs": 112
  }
}
```

---

### Example 4: Autocomplete Suggestions

**Request:**

```typescript
const suggestions = await trpc.search.getSuggestions.query({
  query: 'mark',
  entities: ['assets', 'projects'],
  limit: 5,
});
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "text": "marketing campaign",
      "entityType": "projects",
      "count": 15,
      "highlight": "<mark>mark</mark>eting campaign"
    },
    {
      "text": "marketing logo",
      "entityType": "assets",
      "count": 8,
      "highlight": "<mark>mark</mark>eting logo"
    },
    {
      "text": "market research",
      "entityType": "projects",
      "count": 6,
      "highlight": "<mark>mark</mark>et research"
    },
    {
      "text": "trademark design",
      "entityType": "assets",
      "count": 4,
      "highlight": "trade<mark>mark</mark> design"
    },
    {
      "text": "market analysis",
      "entityType": "projects",
      "count": 3,
      "highlight": "<mark>mark</mark>et analysis"
    }
  ]
}
```

---

### Example 5: Spell Correction

**Request:**

```typescript
// User searches for "fotografy" (misspelled)
const spelling = await trpc.search.getSpellingSuggestion.query({
  query: 'fotografy',
  currentResultCount: 0,
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "hasAlternative": true,
    "suggestion": {
      "originalQuery": "fotografy",
      "suggestedQuery": "photography",
      "confidence": 0.92,
      "expectedResultCount": 156,
      "distance": 2
    },
    "alternatives": [
      {
        "originalQuery": "fotografy",
        "suggestedQuery": "photography",
        "confidence": 0.92,
        "expectedResultCount": 156,
        "distance": 2
      },
      {
        "originalQuery": "fotografy",
        "suggestedQuery": "photographer",
        "confidence": 0.75,
        "expectedResultCount": 89,
        "distance": 3
      }
    ]
  }
}
```

**UI Implementation:**

```tsx
{spelling.hasAlternative && (
  <div className="search-suggestion">
    Did you mean{' '}
    <a href="#" onClick={() => search(spelling.suggestion.suggestedQuery)}>
      {spelling.suggestion.suggestedQuery}
    </a>
    ?
  </div>
)}
```

---

### Example 6: Related Content

**Request:**

```typescript
// Get content related to a specific asset
const related = await trpc.search.getRelatedContent.query({
  entityType: 'assets',
  entityId: 'clw123456789',
  limit: 6,
  includeTypes: ['similar_content', 'same_creator', 'same_project'],
  minRelevanceScore: 0.4,
});
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clw234567890",
      "entityType": "assets",
      "title": "Summer Campaign Banner",
      "description": "Matching banner design for campaign",
      "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw234567890.jpg",
      "relevanceScore": 0.89,
      "relationshipType": "same_project",
      "relationshipReason": "Part of the same project: Summer Marketing Campaign",
      "metadata": {
        "type": "asset",
        "assetType": "IMAGE",
        "status": "ACTIVE",
        "fileSize": 3145728,
        "mimeType": "image/jpeg",
        "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw234567890.jpg",
        "createdBy": "clw987654321",
        "tags": ["banner", "marketing", "summer"]
      }
    },
    {
      "id": "clw345678901",
      "entityType": "assets",
      "title": "Autumn Logo Design",
      "description": "Similar style logo for autumn campaign",
      "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw345678901.jpg",
      "relevanceScore": 0.76,
      "relationshipType": "similar_content",
      "relationshipReason": "Similar visual style and attributes",
      "metadata": {
        "type": "asset",
        "assetType": "IMAGE",
        "status": "ACTIVE",
        "fileSize": 2234432,
        "mimeType": "image/png",
        "thumbnailUrl": "https://cdn.yesgoddess.agency/thumbnails/clw345678901.jpg",
        "createdBy": "clw987654321",
        "tags": ["logo", "autumn", "campaign"]
      }
    }
  ]
}
```

---

### Example 7: Track Click

**Request:**

```typescript
// User clicks on a search result
await trpc.search.trackClick.mutate({
  eventId: 'clw_event_123',  // From search response metadata
  resultId: 'clw123456789',
  resultPosition: 0,          // First result (0-indexed)
  resultEntityType: 'assets',
});
```

**Response:**

```json
{
  "success": true
}
```

**When to Call:**
- When user clicks a search result card
- When user opens a search result in a new tab
- When user hovers on result for >2 seconds (optional)

---

### Example 8: Save Search

**Request:**

```typescript
const saved = await trpc.search.saveSearch.mutate({
  name: 'My Marketing Assets',
  query: 'marketing',
  entities: ['assets'],
  filters: {
    assetType: ['IMAGE', 'VIDEO'],
    tags: ['marketing', 'campaign'],
  },
});
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clw567890123",
    "name": "My Marketing Assets",
    "searchQuery": "marketing",
    "entities": ["assets"],
    "filters": {
      "assetType": ["IMAGE", "VIDEO"],
      "tags": ["marketing", "campaign"]
    },
    "createdAt": "2025-10-17T14:30:00.000Z"
  }
}
```

---

## Error Handling

### Error Response Structure

All errors follow this format:

```typescript
{
  success: false;
  error: {
    code: string;        // TRPC error code
    message: string;     // Human-readable error message
    data?: {
      zodError?: any;    // Validation errors (if applicable)
      cause?: any;       // Original error cause
    };
  };
}
```

### Error Codes

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `UNAUTHORIZED` | 401 | User not authenticated | "Please sign in to search" |
| `FORBIDDEN` | 403 | User lacks permissions | "You don't have access to this feature" |
| `BAD_REQUEST` | 400 | Invalid request data | "Invalid search query. Please check your input" |
| `NOT_FOUND` | 404 | Resource not found | "Search not found" |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | "Search failed. Please try again" |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded | "Too many searches. Please wait a moment" |

### Validation Errors

When Zod validation fails, `zodError` contains field-specific errors:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "data": {
      "zodError": {
        "fieldErrors": {
          "query": ["Search query must be at least 2 characters"],
          "limit": ["Limit must be between 1 and 100"]
        }
      }
    }
  }
}
```

### Error Handling Implementation

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const result = await trpc.search.search.query({ query: 'test' });
  // Handle success
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        // Redirect to login
        router.push('/login');
        break;
        
      case 'FORBIDDEN':
        // Show permission error
        toast.error('You do not have access to this feature');
        break;
        
      case 'BAD_REQUEST':
        // Show validation errors
        if (error.data?.zodError?.fieldErrors) {
          const fieldErrors = error.data.zodError.fieldErrors;
          Object.entries(fieldErrors).forEach(([field, errors]) => {
            toast.error(`${field}: ${errors[0]}`);
          });
        } else {
          toast.error(error.message);
        }
        break;
        
      case 'TOO_MANY_REQUESTS':
        // Show rate limit message
        toast.warning('Please slow down. Try again in a moment.');
        break;
        
      case 'INTERNAL_SERVER_ERROR':
      default:
        // Generic error
        toast.error('Search failed. Please try again later.');
        // Log to error tracking service
        console.error('Search error:', error);
        break;
    }
  }
}
```

### Common Error Scenarios

#### 1. Query Too Short

```typescript
// ❌ Invalid
query: 'a'  // Less than 2 characters

// Error response
{
  code: 'BAD_REQUEST',
  message: 'Search query must be at least 2 characters'
}
```

#### 2. Query Too Long

```typescript
// ❌ Invalid
query: 'a'.repeat(201)  // More than 200 characters

// Error response
{
  code: 'BAD_REQUEST',
  message: 'Search query must be at most 200 characters'
}
```

#### 3. Invalid Entity Type

```typescript
// ❌ Invalid
entities: ['invalid_entity']

// Error response
{
  code: 'BAD_REQUEST',
  message: 'Invalid entity type',
  data: {
    zodError: {
      fieldErrors: {
        entities: ['Invalid enum value. Expected assets, creators, projects, or licenses']
      }
    }
  }
}
```

#### 4. Invalid Page/Limit

```typescript
// ❌ Invalid
page: 0        // Must be >= 1
limit: 150     // Must be <= 100

// Error response
{
  code: 'BAD_REQUEST',
  message: 'Validation failed',
  data: {
    zodError: {
      fieldErrors: {
        page: ['Page must be at least 1'],
        limit: ['Limit must be at most 100']
      }
    }
  }
}
```

#### 5. Unauthorized Access

```typescript
// User not logged in
// Error response
{
  code: 'UNAUTHORIZED',
  message: 'Authentication required'
}
```

#### 6. Admin Endpoint Access

```typescript
// Non-admin user tries to access analytics
await trpc.search.getAnalytics.query({ ... });

// Error response
{
  code: 'FORBIDDEN',
  message: 'Admin access required'
}
```

---

## Pagination & Filtering

### Pagination

The API uses **offset-based pagination** with page numbers.

**Parameters:**
- `page`: Page number (1-based, default: 1)
- `limit`: Results per page (1-100, default: 20)

**Response includes:**

```typescript
{
  pagination: {
    page: number;           // Current page
    limit: number;          // Results per page
    total: number;          // Total matching results
    totalPages: number;     // Total pages available
    hasNextPage: boolean;   // Can paginate forward
    hasPreviousPage: boolean; // Can paginate backward
  }
}
```

**Frontend Implementation:**

```tsx
function SearchResults({ query }: { query: string }) {
  const [page, setPage] = useState(1);
  const limit = 20;
  
  const { data, isLoading } = trpc.search.search.useQuery({
    query,
    page,
    limit,
  });
  
  const pagination = data?.data.pagination;
  
  return (
    <div>
      {/* Results */}
      <div className="results-grid">
        {data?.data.results.map(result => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>
      
      {/* Pagination Controls */}
      <div className="pagination">
        <button
          disabled={!pagination?.hasPreviousPage}
          onClick={() => setPage(p => p - 1)}
        >
          Previous
        </button>
        
        <span>
          Page {pagination?.page} of {pagination?.totalPages}
        </span>
        
        <button
          disabled={!pagination?.hasNextPage}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Infinite Scroll Implementation

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';

function InfiniteSearchResults({ query }: { query: string }) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['search', query],
    queryFn: async ({ pageParam = 1 }) => {
      return trpc.search.search.query({
        query,
        page: pageParam,
        limit: 20,
      });
    },
    getNextPageParam: (lastPage) => {
      const { pagination } = lastPage.data;
      return pagination.hasNextPage ? pagination.page + 1 : undefined;
    },
  });
  
  // Flatten all pages
  const allResults = data?.pages.flatMap(page => page.data.results) ?? [];
  
  return (
    <div>
      <div className="results-grid">
        {allResults.map(result => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>
      
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

### Filtering

Filters are applied via the `filters` object parameter.

**Available Filters by Entity:**

#### Asset Filters

```typescript
filters: {
  assetType: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'],
  assetStatus: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
  projectId: 'clw123456789',
  creatorId: 'clw987654321',
  dateFrom: '2025-01-01T00:00:00.000Z',
  dateTo: '2025-12-31T23:59:59.000Z',
  tags: ['logo', 'branding'],
}
```

#### Creator Filters

```typescript
filters: {
  verificationStatus: ['VERIFIED', 'PENDING', 'REJECTED'],
  specialties: ['Photography', 'Design'],
  industry: ['Fashion', 'Technology'],
  category: ['Commercial', 'Editorial'],
  country: 'US',
  region: 'California',
  city: 'Los Angeles',
  availabilityStatus: 'available', // 'available', 'limited', 'unavailable'
}
```

#### Project Filters

```typescript
filters: {
  projectType: ['CAMPAIGN', 'CONTENT', 'EVENT'],
  projectStatus: ['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  brandId: 'clw456789012',
  dateFrom: '2025-01-01T00:00:00.000Z',
  dateTo: '2025-12-31T23:59:59.000Z',
}
```

#### License Filters

```typescript
filters: {
  licenseType: ['COMMERCIAL', 'EDITORIAL', 'EXCLUSIVE'],
  licenseStatus: ['ACTIVE', 'EXPIRED', 'PENDING'],
  dateFrom: '2025-01-01T00:00:00.000Z',
  dateTo: '2025-12-31T23:59:59.000Z',
}
```

### Filter UI Component Example

```tsx
function SearchFilters({ onFilterChange }: {
  onFilterChange: (filters: SearchFilters) => void;
}) {
  const [filters, setFilters] = useState<SearchFilters>({});
  
  const handleAssetTypeChange = (types: string[]) => {
    const newFilters = { ...filters, assetType: types };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };
  
  return (
    <aside className="filters-sidebar">
      <h3>Filter Results</h3>
      
      {/* Asset Type Filter */}
      <div className="filter-group">
        <label>Asset Type</label>
        <CheckboxGroup
          options={[
            { value: 'IMAGE', label: 'Images' },
            { value: 'VIDEO', label: 'Videos' },
            { value: 'AUDIO', label: 'Audio' },
            { value: 'DOCUMENT', label: 'Documents' },
          ]}
          value={filters.assetType ?? []}
          onChange={handleAssetTypeChange}
        />
      </div>
      
      {/* Date Range Filter */}
      <div className="filter-group">
        <label>Date Range</label>
        <DateRangePicker
          startDate={filters.dateFrom}
          endDate={filters.dateTo}
          onChange={(start, end) => {
            const newFilters = {
              ...filters,
              dateFrom: start?.toISOString(),
              dateTo: end?.toISOString(),
            };
            setFilters(newFilters);
            onFilterChange(newFilters);
          }}
        />
      </div>
      
      {/* Clear Filters */}
      <button onClick={() => {
        setFilters({});
        onFilterChange({});
      }}>
        Clear All Filters
      </button>
    </aside>
  );
}
```

---

## Rate Limiting

### Current Rate Limits

**Note:** Rate limiting is currently implemented at the application level but not enforced at the API gateway level. These are **recommended limits** for production deployment.

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| Search endpoints | 60 requests | 1 minute | Per user |
| Autocomplete | 120 requests | 1 minute | Per user (higher for UX) |
| Track click | 100 requests | 1 minute | Per user |
| Analytics (admin) | 30 requests | 1 minute | Per user |

### Rate Limit Headers

When rate limiting is enabled, responses include:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1634567890
```

### Handling Rate Limits

```typescript
try {
  const result = await trpc.search.search.query({ query });
} catch (error) {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    const resetTime = error.data?.resetAt;
    const waitSeconds = Math.ceil((new Date(resetTime) - new Date()) / 1000);
    
    toast.error(`Rate limit exceeded. Try again in ${waitSeconds} seconds.`);
    
    // Optionally: Schedule retry
    setTimeout(() => {
      // Retry the search
    }, waitSeconds * 1000);
  }
}
```

### Client-Side Rate Limiting

Implement debouncing/throttling on the frontend:

```typescript
import { debounce } from 'lodash';

// Debounce autocomplete (wait 300ms after user stops typing)
const debouncedSuggestions = debounce(
  async (query: string) => {
    const suggestions = await trpc.search.getSuggestions.query({ query });
    setSuggestions(suggestions.data);
  },
  300
);

// Usage in input onChange
const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
  const query = e.target.value;
  setQuery(query);
  
  if (query.length >= 2) {
    debouncedSuggestions(query);
  }
};
```

### Throttle Search Button

```typescript
import { throttle } from 'lodash';

// Throttle search button (max once per second)
const throttledSearch = throttle(
  async (query: string) => {
    const results = await trpc.search.search.query({ query });
    setResults(results.data);
  },
  1000,
  { leading: true, trailing: false }
);
```

---

Continue to [Part 3: Business Logic, Implementation Guide & React Examples →](./SEARCH_API_INTEGRATION_GUIDE_PART3.md)
