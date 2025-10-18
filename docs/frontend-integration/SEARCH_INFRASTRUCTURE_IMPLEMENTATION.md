# Search Infrastructure - Implementation Guide

🌐 **SHARED** - Implementation guidance for both public website and admin interface

**Module Status:** ✅ Complete  
**Backend Version:** 1.0.0  
**Last Updated:** October 17, 2025

---

## Overview

This guide covers the business logic, validation rules, error handling, and implementation best practices for integrating the Search Infrastructure into your frontend application.

---

## Table of Contents

1. [Business Logic & Rules](#business-logic--rules)
2. [Validation Requirements](#validation-requirements)
3. [Error Handling](#error-handling)
4. [Authorization & Permissions](#authorization--permissions)
5. [Rate Limiting](#rate-limiting)
6. [Relevance Scoring Algorithm](#relevance-scoring-algorithm)
7. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Business Logic & Rules

### Search Query Processing

#### Query Sanitization

The backend automatically:
1. **Trims whitespace** from beginning and end
2. **Removes special characters** that could cause SQL injection: `< > & ' " \`
3. **Enforces length constraints** (2-200 characters)
4. **Validates encoding** (UTF-8 only)

**Frontend Responsibilities:**
- Show real-time character count when approaching limit
- Disable search button if query < 2 characters
- Debounce input for autocomplete (recommended: 300ms)

---

#### Stop Words

The backend uses configurable stop words (currently disabled by default):
```typescript
const DEFAULT_STOP_WORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
];
```

**Behavior:**
- Stop words are NOT removed from queries by default
- Can be enabled via search configuration if needed

**Frontend Considerations:**
- Don't strip stop words client-side
- Allow users to search for "the brand" or "a design"

---

### Entity Selection Logic

#### Default Behavior

If `entities` array is **not provided** or **empty**:
```typescript
// Backend defaults to ALL entities
entities: ['assets', 'creators', 'projects', 'licenses']
```

#### Explicit Selection

```typescript
// Search only specific entities
{
  entities: ['assets', 'creators']  // Only searches assets and creators
}
```

**UI Recommendations:**
- Provide entity filter chips/toggles
- Show entity counts in facets
- Allow "All" option (omit entities parameter)
- Persist entity selection in URL query params

---

### Filtering Logic

#### Filter Combination

**Multiple filters are combined with AND logic:**
```typescript
{
  filters: {
    assetType: ["IMAGE", "VIDEO"],     // AND
    assetStatus: ["PUBLISHED"],        // AND
    tags: ["logo", "brand"]            // AND (all tags must exist)
  }
}
```

**Array filters use OR within, AND between:**
```typescript
// Matches: (type = IMAGE OR type = VIDEO) AND status = PUBLISHED
assetType: ["IMAGE", "VIDEO"]
assetStatus: ["PUBLISHED"]
```

---

#### Empty Filters

**Omitted filter = No constraint:**
```typescript
{
  filters: {
    assetType: ["IMAGE"]
    // assetStatus omitted = all statuses included
  }
}
```

**Empty array = No results:**
```typescript
{
  filters: {
    assetType: []  // ⚠️ No results! No types match
  }
}
```

**Frontend Rule:** Don't send empty arrays; omit the filter instead.

---

#### Date Range Filtering

**Inclusive filtering on `createdAt` field:**
```typescript
{
  filters: {
    dateFrom: "2025-01-01T00:00:00.000Z",  // >= this date
    dateTo: "2025-12-31T23:59:59.999Z"     // <= this date
  }
}
```

**Edge Cases:**
- Only `dateFrom`: Returns all entities created after date
- Only `dateTo`: Returns all entities created before date
- Both: Returns entities within range (inclusive)

**Frontend Date Picker Recommendations:**
```typescript
// Convert to ISO 8601 with time
const dateFrom = startOfDay(selectedDate).toISOString();
const dateTo = endOfDay(selectedDate).toISOString();
```

---

### Sorting Behavior

#### Sort Priority

1. **Explicit Sort:** Uses `sortBy` and `sortOrder` parameters
2. **Default Sort:** Uses `relevance` in `desc` order

**Relevance Sort:**
```typescript
{
  sortBy: 'relevance',  // Default
  sortOrder: 'desc'     // Highest relevance first
}
```

Best match scores appear first (0.9, 0.85, 0.7, ...)

---

#### Multiple Sort Fields

**Backend does NOT support multiple sort fields.** For advanced sorting:

```typescript
// ❌ Not supported
sortBy: ['relevance', 'created_at']

// ✅ Frontend can implement secondary sorting
results.sort((a, b) => {
  // Primary: relevance (from backend)
  if (a.relevanceScore !== b.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  // Secondary: date (client-side)
  return new Date(b.createdAt) - new Date(a.createdAt);
});
```

---

### Pagination Rules

#### Page Boundaries

**Backend enforces:**
- Page must be ≥ 1
- Limit must be 1-100
- Out-of-range pages return empty results (not an error)

**Example:**
```typescript
// 150 total results, limit 20
{
  page: 8,      // Valid, but page 8 only has 10 results
  limit: 20,
  total: 150,
  totalPages: 8
}

// Page 9 returns empty array
{
  page: 9,
  limit: 20,
  total: 150,
  results: []   // No error, just empty
}
```

**Frontend Pagination UI:**
```typescript
// Disable "Next" button when no next page
disabled={!data.pagination.hasNextPage}

// Disable "Previous" button when on first page
disabled={!data.pagination.hasPreviousPage}

// Page number input validation
max={data.pagination.totalPages}
```

---

#### Limit Recommendations

| Use Case | Recommended Limit | Rationale |
|----------|------------------|-----------|
| Grid view | 20-30 | Fits standard grid layouts |
| List view | 20-50 | Balances load time and scrolling |
| Autocomplete | 5-10 | Quick results, minimal UI |
| Infinite scroll | 20 | Smooth loading, not too heavy |
| Mobile | 10-15 | Smaller screens, slower connections |

---

### Permission-Based Results

#### Automatic Filtering

**Results are automatically filtered based on user role:**

**CREATOR Role:**
- **Assets:** Only assets they own (via `ip_ownerships` where `endDate IS NULL`)
- **Creators:** All approved creators (can discover collaborators)
- **Projects:** Projects they're assigned to
- **Licenses:** Their own license agreements

**BRAND Role:**
- **Assets:** Assets in their projects + assets they have active licenses for
- **Creators:** All approved creators (can discover talent)
- **Projects:** Their own projects
- **Licenses:** Their own license agreements

**ADMIN/VIEWER Role:**
- **All entities:** No filtering applied
- **Creators:** Can see creators with any verification status

---

#### Frontend Considerations

**Don't re-filter results client-side** - the backend has already applied permissions.

**Handle Empty Results:**
```typescript
if (data.results.length === 0 && data.pagination.total === 0) {
  // Show "No results found" message
  // For Creators: Explain they only see their own assets
  // For Brands: Explain they only see licensed/project assets
}
```

**Role-Specific Messaging:**
```typescript
const getEmptyStateMessage = (role: UserRole) => {
  switch (role) {
    case 'CREATOR':
      return "No assets found. You can only search assets you own.";
    case 'BRAND':
      return "No assets found. You can only search assets in your projects or with active licenses.";
    case 'ADMIN':
      return "No assets found. Try adjusting your search filters.";
  }
};
```

---

## Validation Requirements

### Client-Side Validation

**Search Query:**
```typescript
const searchQuerySchema = z.object({
  query: z.string()
    .min(2, "Search query must be at least 2 characters")
    .max(200, "Search query must be at most 200 characters")
    .trim(),
});

// Usage
const validateQuery = (input: string) => {
  try {
    searchQuerySchema.parse({ query: input });
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error.issues[0].message 
    };
  }
};
```

**Show Validation Errors:**
```typescript
const [queryError, setQueryError] = useState<string | null>(null);

const handleSearchInput = (value: string) => {
  const result = validateQuery(value);
  if (!result.valid) {
    setQueryError(result.error);
  } else {
    setQueryError(null);
  }
};
```

---

### Saved Search Validation

**Name Validation:**
```typescript
const savedSearchNameSchema = z.object({
  name: z.string()
    .min(1, "Search name is required")
    .max(100, "Search name must be at most 100 characters")
    .trim(),
});
```

**Query Validation:**
```typescript
const savedSearchQuerySchema = z.object({
  query: z.string()
    .min(1, "Search query is required")
    .max(200, "Search query must be at most 200 characters")
    .trim(),
});
```

**Frontend Form Example:**
```typescript
const SaveSearchForm = ({ query, filters }: Props) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const saveSearch = trpc.search.saveSearch.useMutation({
    onSuccess: () => {
      toast.success("Search saved successfully");
    },
    onError: (error) => {
      setError(error.message);
    }
  });
  
  const handleSubmit = () => {
    const result = savedSearchNameSchema.safeParse({ name });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    
    saveSearch.mutate({ name, query, filters });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        value={name} 
        onChange={(e) => setName(e.target.value)}
        placeholder="Name your search..."
        maxLength={100}
      />
      {error && <span className="error">{error}</span>}
      <button type="submit">Save Search</button>
    </form>
  );
};
```

---

### Date Validation

**ISO 8601 Format Required:**
```typescript
const dateFilterSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// Valid formats
"2025-01-01T00:00:00.000Z"  // ✅
"2025-01-01T00:00:00Z"      // ✅
"2025-01-01"                // ❌ Missing time

// Convert Date to ISO 8601
const dateToISO = (date: Date) => date.toISOString();
```

**Date Range Logic:**
```typescript
const validateDateRange = (from?: Date, to?: Date) => {
  if (from && to && from > to) {
    return {
      valid: false,
      error: "Start date must be before end date"
    };
  }
  return { valid: true };
};
```

---

### Filter Array Validation

**Prevent Empty Arrays:**
```typescript
const buildFilters = (formData: FormData): SearchFilters => {
  const filters: SearchFilters = {};
  
  // Only add arrays if they have values
  if (formData.assetTypes.length > 0) {
    filters.assetType = formData.assetTypes;
  }
  
  if (formData.statuses.length > 0) {
    filters.assetStatus = formData.statuses;
  }
  
  // Don't send empty arrays
  return filters;
};
```

---

## Error Handling

### Error Response Format

All errors follow tRPC error format:
```typescript
{
  error: {
    code: string;          // tRPC error code
    message: string;       // User-friendly message
    data: {
      code: string;        // Same as above
      httpStatus: number;  // HTTP status code
      path: string;        // API path
      stack?: string;      // Stack trace (dev only)
    }
  }
}
```

---

### Error Codes

#### Common Search Errors

| HTTP Status | tRPC Code | Scenario | User Message |
|------------|-----------|----------|--------------|
| 400 | `BAD_REQUEST` | Invalid query length | "Search query must be 2-200 characters" |
| 400 | `BAD_REQUEST` | Invalid pagination | "Page must be at least 1" |
| 400 | `BAD_REQUEST` | Invalid limit | "Limit must be between 1 and 100" |
| 401 | `UNAUTHORIZED` | Missing/invalid JWT | "You must be logged in to search" |
| 403 | `FORBIDDEN` | Admin-only endpoint | "You don't have permission to access this" |
| 500 | `INTERNAL_SERVER_ERROR` | Database error | "Search failed. Please try again." |
| 500 | `INTERNAL_SERVER_ERROR` | Unknown error | "An unexpected error occurred" |

---

#### Saved Search Errors

| HTTP Status | tRPC Code | Scenario | User Message |
|------------|-----------|----------|--------------|
| 404 | `NOT_FOUND` | Search ID not found | "Saved search not found" |
| 403 | `FORBIDDEN` | Not search owner | "You can only modify your own saved searches" |
| 400 | `BAD_REQUEST` | Name too long | "Search name must be at most 100 characters" |
| 409 | `CONFLICT` | Duplicate name | "You already have a saved search with this name" |

---

### Error Handling Patterns

#### Basic Error Handling

```typescript
const SearchComponent = () => {
  const { data, error, isLoading } = trpc.search.search.useQuery({
    query: searchTerm,
    page: 1
  });
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    // Log for debugging
    console.error('Search error:', error);
    
    // Show user-friendly message
    return (
      <ErrorMessage>
        {error.message || "Search failed. Please try again."}
      </ErrorMessage>
    );
  }
  
  return <SearchResults results={data.data.results} />;
};
```

---

#### Granular Error Handling

```typescript
const handleSearchError = (error: TRPCError) => {
  switch (error.data?.code) {
    case 'UNAUTHORIZED':
      // Redirect to login
      router.push('/login');
      break;
      
    case 'BAD_REQUEST':
      // Show validation error
      toast.error(error.message);
      break;
      
    case 'FORBIDDEN':
      // Show permission error
      toast.error("You don't have permission to perform this search");
      break;
      
    case 'INTERNAL_SERVER_ERROR':
      // Log to error tracking (e.g., Sentry)
      logError(error);
      toast.error("Search failed. Our team has been notified.");
      break;
      
    default:
      toast.error("An unexpected error occurred");
  }
};

// Usage
const search = trpc.search.search.useQuery(params, {
  onError: handleSearchError
});
```

---

#### Network Error Handling

```typescript
const search = trpc.search.search.useQuery(params, {
  retry: 3,                  // Retry failed requests 3 times
  retryDelay: 1000,          // Wait 1s between retries
  onError: (error) => {
    if (error.message.includes('fetch')) {
      // Network error
      toast.error("Network error. Please check your connection.");
    } else {
      // Server error
      toast.error(error.message);
    }
  }
});
```

---

#### Zero Results Handling

**Zero results is NOT an error:**
```typescript
const SearchResults = ({ data }: Props) => {
  // Success response with no results
  if (data.results.length === 0) {
    return (
      <EmptyState>
        <h3>No results found for "{data.query}"</h3>
        <p>Try adjusting your search terms or filters</p>
        <SuggestedSearches />
      </EmptyState>
    );
  }
  
  return <ResultsList results={data.results} />;
};
```

---

### User-Friendly Error Messages

**Map technical errors to user-friendly messages:**

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  // Validation errors
  'QUERY_TOO_SHORT': 'Please enter at least 2 characters',
  'QUERY_TOO_LONG': 'Search query is too long (max 200 characters)',
  'INVALID_PAGE': 'Invalid page number',
  'INVALID_LIMIT': 'Invalid number of results per page',
  
  // Auth errors
  'UNAUTHORIZED': 'Please log in to search',
  'FORBIDDEN': "You don't have permission to access this",
  'TOKEN_EXPIRED': 'Your session has expired. Please log in again.',
  
  // Server errors
  'DATABASE_ERROR': 'Search service is temporarily unavailable',
  'INTERNAL_SERVER_ERROR': 'Something went wrong. Please try again.',
  'TIMEOUT': 'Search took too long. Please try a more specific query.',
};

const getUserMessage = (error: TRPCError): string => {
  return ERROR_MESSAGES[error.code] || error.message || 'An unexpected error occurred';
};
```

---

## Authorization & Permissions

### Endpoint Access Control

#### Public Endpoints

**None.** All search endpoints require authentication.

---

#### Protected Endpoints (All Authenticated Users)

✅ Available to: CREATOR, BRAND, ADMIN, VIEWER

- `search.search` - Unified search
- `search.searchAssets` - Asset search
- `search.searchCreators` - Creator search
- `search.searchProjects` - Project search
- `search.getSuggestions` - Autocomplete
- `search.getAssetSuggestions` - Asset autocomplete
- `search.getAssetFacets` - Asset facets
- `search.getEnhancedFacets` - Enhanced facets
- `search.getRecentSearches` - Recent searches
- `search.saveSearch` - Save search
- `search.getSavedSearches` - Get saved searches
- `search.updateSavedSearch` - Update saved search
- `search.deleteSavedSearch` - Delete saved search
- `search.executeSavedSearch` - Execute saved search
- `search.trackClick` - Track result click
- `search.getSpellingSuggestion` - Spell correction
- `search.getRelatedContent` - Related content

---

#### Admin-Only Endpoints

🔒 Available to: ADMIN only

- `search.getAnalytics` - Search analytics
- `search.getZeroResultQueries` - Zero-result queries
- `search.getPerformanceMetrics` - Performance metrics
- `search.getTrendingSearches` - Trending searches

**Frontend Check:**
```typescript
const isAdmin = user?.role === 'ADMIN';

{isAdmin && (
  <Link to="/admin/search-analytics">
    View Search Analytics
  </Link>
)}
```

---

### Resource Ownership Rules

#### Saved Searches

**Users can only modify/delete their own saved searches:**

```typescript
// Backend automatically checks ownership
const savedSearch = await prisma.savedSearch.findUnique({
  where: { id: input.id }
});

if (savedSearch.userId !== ctx.session.user.id) {
  throw new TRPCError({ code: 'FORBIDDEN' });
}
```

**Frontend: Hide edit/delete for other users' searches:**
```typescript
const SavedSearchItem = ({ search, currentUserId }: Props) => {
  const canModify = search.userId === currentUserId;
  
  return (
    <div>
      <h4>{search.name}</h4>
      {canModify && (
        <div>
          <button onClick={handleEdit}>Edit</button>
          <button onClick={handleDelete}>Delete</button>
        </div>
      )}
    </div>
  );
};
```

---

### Field-Level Permissions

**No field-level permissions** in search results. If a user can see an entity, they see all returned fields.

**However, entities are pre-filtered by role:**

```typescript
// CREATOR sees limited assets
// Response will only include assets they own
{
  results: [/* only creator's assets */]
}

// BRAND sees limited assets
// Response includes licensed + project assets
{
  results: [/* brand's accessible assets */]
}

// ADMIN sees all
{
  results: [/* all assets in database */]
}
```

---

## Rate Limiting

### Current Implementation

**Rate limiting is NOT currently implemented** at the search endpoint level.

Standard application rate limiting applies:
- Handled by API gateway/middleware
- Typically 1000 requests per hour per user
- Varies by deployment environment

---

### Frontend Best Practices

Even without backend rate limiting, implement these:

#### Debounced Search

```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300); // 300ms delay
  
  const { data } = trpc.search.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  
  return (
    <input 
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
};
```

---

#### Request Cancellation

```typescript
const SearchWithCancellation = () => {
  const [query, setQuery] = useState('');
  const abortControllerRef = useRef<AbortController>();
  
  const search = async (searchQuery: string) => {
    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    try {
      const result = await trpc.search.search.query(
        { query: searchQuery },
        { signal: abortControllerRef.current.signal }
      );
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      throw error;
    }
  };
  
  useEffect(() => {
    if (query.length >= 2) {
      search(query);
    }
  }, [query]);
};
```

---

#### Caching

```typescript
// React Query automatically caches results
const { data } = trpc.search.search.useQuery(
  { query: searchTerm },
  {
    staleTime: 5 * 60 * 1000,  // Cache for 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  }
);
```

---

### Future Rate Limiting

When backend rate limiting is implemented, expect:

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

**HTTP 429 Response:**
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "data": {
      "retryAfter": 60
    }
  }
}
```

**Frontend Handling:**
```typescript
const handleRateLimit = (error: TRPCError) => {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    const retryAfter = error.data.retryAfter || 60;
    toast.error(`Too many searches. Please wait ${retryAfter} seconds.`);
    
    // Disable search input temporarily
    setSearchDisabled(true);
    setTimeout(() => setSearchDisabled(false), retryAfter * 1000);
  }
};
```

---

## Relevance Scoring Algorithm

### Score Components

Every search result has a `relevanceScore` (0-1) calculated from four components:

```typescript
interface ScoreBreakdown {
  textualRelevance: number;   // 0-1, default weight: 50%
  recencyScore: number;       // 0-1, default weight: 20%
  popularityScore: number;    // 0-1, default weight: 20%
  qualityScore: number;       // 0-1, default weight: 10%
  finalScore: number;         // Weighted sum
}
```

---

### 1. Textual Relevance (50%)

**How it's calculated:**

```typescript
// Exact title match
if (title.toLowerCase() === query.toLowerCase()) {
  return 1.0;
}

// Title contains full query
if (title.toLowerCase().includes(query.toLowerCase())) {
  return 0.7;
}

// Partial word matches in title
const titleWords = title.toLowerCase().split(/\s+/);
const queryWords = query.toLowerCase().split(/\s+/);
const matchCount = queryWords.filter(qw => 
  titleWords.some(tw => tw.includes(qw))
).length;
const score = matchCount / queryWords.length;  // 0-1

// Bonus for description match
if (description?.toLowerCase().includes(query.toLowerCase())) {
  score += 0.3;
}

return Math.min(score, 1.0);
```

**Frontend Implications:**
- Exact matches appear first
- Substring matches rank high
- Description matches add to relevance
- Case-insensitive

---

### 2. Recency Score (20%)

**How it's calculated:**

```typescript
// Exponential decay based on age
const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);
const halfLifeDays = 90;  // Configurable

// Half-life decay formula
const score = Math.exp(-Math.log(2) * ageInDays / halfLifeDays);

// Cap at max age (2 years default)
if (ageInDays > 730) {
  return 0;
}

return score;  // 0-1
```

**Frontend Implications:**
- Newer content ranks higher
- 90-day half-life: content loses 50% score every 3 months
- Content older than 2 years has 0 recency score
- Sort by `created_at` to override recency weighting

---

### 3. Popularity Score (20%)

**How it's calculated:**

```typescript
// Normalize view/usage/favorite counts
const viewScore = Math.min(viewCount / 1000, 1.0) * 0.5;
const usageScore = Math.min(usageCount / 100, 1.0) * 0.3;
const favoriteScore = Math.min(favoriteCount / 50, 1.0) * 0.2;

const popularityScore = viewScore + usageScore + favoriteScore;
return Math.min(popularityScore, 1.0);
```

**Frontend Implications:**
- Popular content ranks higher
- View counts contribute most (50%)
- Usage in projects adds to score (30%)
- Favorites/bookmarks add to score (20%)
- Caps prevent viral content from dominating

---

### 4. Quality Score (10%)

**How it's calculated:**

```typescript
let score = 0.5;  // Base score

// Verification/approval status
if (status === 'PUBLISHED' || status === 'APPROVED') {
  score += 0.3;
}

// For creators: verification adds quality
if (entityType === 'creator' && verificationStatus === 'approved') {
  score += 0.2;
}

// For assets: complete metadata adds quality
if (hasDescription && hasTags && hasThumbnail) {
  score += 0.2;
}

return Math.min(score, 1.0);
```

**Frontend Implications:**
- Published/approved content ranks higher
- Verified creators rank higher
- Complete metadata improves ranking

---

### Final Score Calculation

```typescript
const finalScore = 
  (textualRelevance * 0.5) +
  (recencyScore * 0.2) +
  (popularityScore * 0.2) +
  (qualityScore * 0.1);
```

**Frontend Display:**

```typescript
const RelevanceIndicator = ({ score }: { score: number }) => {
  const getLabel = (score: number) => {
    if (score >= 0.8) return { label: 'Excellent match', color: 'green' };
    if (score >= 0.6) return { label: 'Good match', color: 'blue' };
    if (score >= 0.4) return { label: 'Fair match', color: 'yellow' };
    return { label: 'Low relevance', color: 'gray' };
  };
  
  const { label, color } = getLabel(score);
  
  return (
    <Badge color={color}>
      {label} ({(score * 100).toFixed(0)}%)
    </Badge>
  );
};
```

---

### Score Breakdown Display (Advanced)

```typescript
const ScoreBreakdown = ({ breakdown }: { breakdown: ScoreBreakdown }) => {
  return (
    <Tooltip>
      <TooltipTrigger>
        Relevance: {(breakdown.finalScore * 100).toFixed(0)}%
      </TooltipTrigger>
      <TooltipContent>
        <div>
          <div>Text Match: {(breakdown.textualRelevance * 100).toFixed(0)}%</div>
          <div>Recency: {(breakdown.recencyScore * 100).toFixed(0)}%</div>
          <div>Popularity: {(breakdown.popularityScore * 100).toFixed(0)}%</div>
          <div>Quality: {(breakdown.qualityScore * 100).toFixed(0)}%</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Search UI

- [ ] Create search input component
  - [ ] Implement 300ms debouncing
  - [ ] Add character count (2-200)
  - [ ] Show validation errors inline
  - [ ] Clear button functionality
  
- [ ] Build results list component
  - [ ] Grid/list view toggle
  - [ ] Result cards with metadata
  - [ ] Entity type badges
  - [ ] Relevance score display
  
- [ ] Implement pagination
  - [ ] Page number controls
  - [ ] Next/previous buttons
  - [ ] Results per page selector
  - [ ] Total count display
  
- [ ] Add loading states
  - [ ] Skeleton loaders
  - [ ] Spinner for initial load
  - [ ] Inline loaders for pagination

---

### Phase 2: Filtering & Sorting

- [ ] Entity filter chips
  - [ ] Toggle assets/creators/projects/licenses
  - [ ] Show entity counts from facets
  - [ ] Persist selection in URL
  
- [ ] Filter sidebar/drawer
  - [ ] Dynamic facets from API
  - [ ] Checkbox groups for arrays
  - [ ] Date range picker
  - [ ] Clear all filters button
  
- [ ] Sort dropdown
  - [ ] Relevance (default)
  - [ ] Date (newest/oldest)
  - [ ] Name (A-Z/Z-A)
  - [ ] Entity-specific sorts
  
- [ ] Applied filters display
  - [ ] Show active filters as chips
  - [ ] Remove individual filters
  - [ ] Clear all shortcut

---

### Phase 3: Autocomplete & Suggestions

- [ ] Autocomplete dropdown
  - [ ] Trigger after 2 characters
  - [ ] Debounce 300ms
  - [ ] Show top 5-10 results
  - [ ] Keyboard navigation (↑↓ Enter)
  - [ ] Click to select
  
- [ ] Recent searches
  - [ ] Show below search input
  - [ ] Click to re-search
  - [ ] Clear history option
  
- [ ] Suggested searches
  - [ ] Show on focus (before typing)
  - [ ] Trending/popular queries
  - [ ] Category-based suggestions

---

### Phase 4: Saved Searches

- [ ] Save search dialog
  - [ ] Input for search name
  - [ ] Preview of query and filters
  - [ ] Save button
  
- [ ] Saved searches list
  - [ ] Show in sidebar or dropdown
  - [ ] Execute on click
  - [ ] Edit/delete actions
  - [ ] Last used timestamp
  
- [ ] Manage saved searches
  - [ ] Rename functionality
  - [ ] Update filters
  - [ ] Delete with confirmation
  - [ ] Share (future feature)

---

### Phase 5: Analytics & Tracking

- [ ] Click tracking
  - [ ] Track result clicks automatically
  - [ ] Send to `search.trackClick`
  - [ ] Don't block user interaction
  
- [ ] Performance monitoring
  - [ ] Log slow searches (>500ms)
  - [ ] Track client-side render time
  - [ ] Send to analytics service
  
- [ ] User behavior
  - [ ] Track search abandonment
  - [ ] Track filter usage
  - [ ] Track pagination depth

---

### Phase 6: Error Handling & Edge Cases

- [ ] Error states
  - [ ] Network error UI
  - [ ] Server error UI
  - [ ] Unauthorized/forbidden states
  
- [ ] Empty states
  - [ ] No results found
  - [ ] Zero matches with filters
  - [ ] Suggestions for no results
  
- [ ] Permission-based messaging
  - [ ] Creator: "You only see your assets"
  - [ ] Brand: "Licensed and project assets only"
  
- [ ] Retry mechanisms
  - [ ] Automatic retry on network failure
  - [ ] Manual retry button
  - [ ] Exponential backoff

---

### Phase 7: Advanced Features

- [ ] Spell correction (if implemented)
  - [ ] "Did you mean X?" banner
  - [ ] Auto-correct option
  
- [ ] Related content (if implemented)
  - [ ] "Similar results" section
  - [ ] "Users also viewed"
  
- [ ] Search history
  - [ ] View all past searches
  - [ ] Filter history
  - [ ] Export history (admin)
  
- [ ] Keyboard shortcuts
  - [ ] `/` to focus search
  - [ ] `Esc` to clear
  - [ ] `Ctrl+K` for command palette

---

### Testing Checklist

- [ ] Unit tests
  - [ ] Validation functions
  - [ ] Filter building logic
  - [ ] Date formatting utilities
  
- [ ] Integration tests
  - [ ] Search query execution
  - [ ] Pagination navigation
  - [ ] Filter application
  - [ ] Saved search CRUD
  
- [ ] E2E tests
  - [ ] Complete search flow
  - [ ] Filter + sort + paginate
  - [ ] Save and execute search
  - [ ] Error state handling
  
- [ ] Accessibility tests
  - [ ] Keyboard navigation
  - [ ] Screen reader compatibility
  - [ ] Focus management
  - [ ] ARIA labels

---

## Next Steps

- **Review:** [Search Infrastructure - API Reference](./SEARCH_INFRASTRUCTURE_API.md)
- **Advanced Features:** [Search Infrastructure - Advanced Features](./SEARCH_INFRASTRUCTURE_ADVANCED.md)
- **Backend Docs:** `/docs/SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md`

---

## Support

For questions or issues:
- Backend Team: [contact info]
- Documentation: `/docs/` directory
- API Playground: `https://ops.yesgoddess.agency/api/playground`
