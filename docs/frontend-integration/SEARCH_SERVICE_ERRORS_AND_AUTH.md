# Search Service - Frontend Integration Guide (Part 2: Error Handling & Authorization)

**Classification:** 🌐 SHARED + 🔒 ADMIN  
**Last Updated:** October 17, 2025  
**Backend Deployment:** `ops.yesgoddess.agency`

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Authorization & Permissions](#authorization--permissions)
3. [Rate Limiting & Quotas](#rate-limiting--quotas)
4. [Security Considerations](#security-considerations)

---

## Error Handling

### HTTP Status Codes

All tRPC endpoints return errors in a consistent format:

| Status Code | Meaning | When It Occurs |
|------------|---------|----------------|
| 200 | Success | Request succeeded |
| 400 | Bad Request | Invalid input (validation failed) |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but lacks permissions |
| 404 | Not Found | Resource doesn't exist or user lacks access |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

### tRPC Error Codes

tRPC uses specific error codes that map to HTTP status codes:

```typescript
type TRPCErrorCode =
  | 'BAD_REQUEST'           // 400: Validation failed
  | 'UNAUTHORIZED'          // 401: Not logged in
  | 'FORBIDDEN'             // 403: No permission
  | 'NOT_FOUND'             // 404: Resource not found
  | 'TIMEOUT'               // 408: Request timeout
  | 'CONFLICT'              // 409: Resource conflict
  | 'PRECONDITION_FAILED'   // 412: Precondition not met
  | 'PAYLOAD_TOO_LARGE'     // 413: Request too large
  | 'TOO_MANY_REQUESTS'     // 429: Rate limited
  | 'INTERNAL_SERVER_ERROR' // 500: Server error
```

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    code: TRPCErrorCode;
    message: string;              // Human-readable message
    data?: {
      code: string;               // Specific error code
      httpStatus: number;
      path: string;               // tRPC path
      zodError?: ZodError;        // Validation details (if applicable)
    };
  }
}
```

---

## Search-Specific Error Codes

### SRH-001: Invalid Query Length

**When:** Query is less than 2 or more than 200 characters  
**HTTP Status:** 400 (Bad Request)  
**User Message:** "Search query must be between 2 and 200 characters"

```typescript
// Validation error
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Validation error',
    data: {
      zodError: {
        fieldErrors: {
          query: ['Search query must be at least 2 characters']
        }
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
try {
  const result = await trpc.search.search.query({ query: 'a' });
} catch (error) {
  if (error.data?.zodError?.fieldErrors?.query) {
    toast.error('Search query is too short');
  }
}
```

---

### SRH-002: Invalid Entity Type

**When:** Specified entity type is not valid  
**HTTP Status:** 400 (Bad Request)  
**User Message:** "Invalid entity type. Must be: assets, creators, projects, or licenses"

```typescript
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Invalid entity type',
    data: {
      zodError: {
        fieldErrors: {
          entities: ['Invalid enum value. Expected "assets" | "creators" | "projects" | "licenses"']
        }
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
// Use type-safe entity array
const validEntities: SearchableEntity[] = ['assets', 'creators'];
```

---

### SRH-003: Invalid Pagination

**When:** Page or limit parameters are invalid  
**HTTP Status:** 400 (Bad Request)  
**User Message:** "Page must be at least 1" or "Limit must be between 1 and 100"

```typescript
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Validation error',
    data: {
      zodError: {
        fieldErrors: {
          page: ['Number must be greater than or equal to 1'],
          limit: ['Number must be less than or equal to 100']
        }
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
const page = Math.max(1, requestedPage);
const limit = Math.min(100, Math.max(1, requestedLimit));
```

---

### SRH-004: Invalid Date Format

**When:** Date filters are not in ISO 8601 format  
**HTTP Status:** 400 (Bad Request)  
**User Message:** "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)"

```typescript
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Invalid date format',
    data: {
      zodError: {
        fieldErrors: {
          'filters.dateFrom': ['Invalid datetime']
        }
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
// Always use Date objects or ISO strings
const dateFrom = new Date('2024-01-01');
// or
const dateFrom = '2024-01-01T00:00:00.000Z';
```

---

### SRH-005: Search Execution Failed

**When:** Internal error during search execution  
**HTTP Status:** 500 (Internal Server Error)  
**User Message:** "Search failed. Please try again."

```typescript
{
  error: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to execute search'
  }
}
```

**Frontend Handling:**
```typescript
try {
  const result = await trpc.search.search.query(params);
} catch (error) {
  if (error.code === 'INTERNAL_SERVER_ERROR') {
    // Show generic error
    toast.error('Search failed. Please try again.');
    // Log to error tracking
    logger.error('Search failed', { params, error });
  }
}
```

---

### SRH-006: Click Tracking Failed

**When:** Failed to track search result click  
**HTTP Status:** 500 (Internal Server Error)  
**User Message:** None (silent failure - don't block UX)

**Frontend Handling:**
```typescript
// Never block on click tracking
trpc.search.trackClick.mutate(clickData)
  .catch(error => {
    // Log silently, don't show to user
    console.error('Click tracking failed:', error);
  });
```

---

### SRH-007: Saved Search Not Found

**When:** Trying to access/update/delete a saved search that doesn't exist or user doesn't own  
**HTTP Status:** 404 (Not Found)  
**User Message:** "Saved search not found"

```typescript
{
  error: {
    code: 'NOT_FOUND',
    message: 'Saved search not found'
  }
}
```

**Frontend Handling:**
```typescript
try {
  await trpc.search.deleteSavedSearch.mutate({ id: savedSearchId });
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    toast.error('This saved search no longer exists');
    // Refresh saved searches list
    refetch();
  }
}
```

---

### SRH-008: Analytics Access Denied

**When:** Non-admin user tries to access analytics endpoints  
**HTTP Status:** 403 (Forbidden)  
**User Message:** "You don't have permission to view analytics"

```typescript
{
  error: {
    code: 'FORBIDDEN',
    message: 'Admin access required'
  }
}
```

**Frontend Handling:**
```typescript
// Only render analytics UI for admin users
{user.role === 'ADMIN' && (
  <AnalyticsPanel />
)}
```

---

## Authorization & Permissions

### Authentication Requirements

| Endpoint | Auth Required | Public Access |
|----------|---------------|---------------|
| All search endpoints | ✅ Yes | ❌ No |
| Get suggestions | ✅ Yes | ❌ No |
| Track clicks | ✅ Yes | ❌ No |
| Saved searches | ✅ Yes | ❌ No |
| Analytics (all) | ✅ Yes (Admin) | ❌ No |

> ⚠️ **Important:** All search endpoints require authentication. There is no public/anonymous search.

### User Roles

```typescript
type UserRole = 'CREATOR' | 'BRAND' | 'ADMIN';
```

| Role | Can Access | Cannot Access |
|------|-----------|---------------|
| CREATOR | Search all entities, View own assets/projects, Save searches | Admin analytics, Other users' private data |
| BRAND | Search all entities, View licensed content, Save searches | Admin analytics, Creator private data |
| ADMIN | Everything | - |

### Row-Level Security (RLS)

Search results are automatically filtered based on user permissions:

#### Assets
- **Creators**: See own assets + public assets
- **Brands**: See licensed assets + public assets
- **Admins**: See all assets

#### Projects
- **Creators**: See projects they're involved in
- **Brands**: See their own projects
- **Admins**: See all projects

#### Creators
- **All Users**: See verified creators' public profiles
- **Brands**: See creator performance metrics for licensing decisions
- **Admins**: See all creator data

#### Licenses
- **Creators**: See licenses for their assets
- **Brands**: See their own licenses
- **Admins**: See all licenses

### Permission Checking Pattern

The backend automatically applies row-level security. Frontend doesn't need to filter:

```typescript
// ✅ Correct: Trust backend filtering
const { data } = await trpc.search.search.query({
  query: 'logo',
  entities: ['assets']
});
// Results are already filtered based on user permissions

// ❌ Wrong: Don't try to filter on frontend
const filteredResults = data.results.filter(r => r.createdBy === userId);
```

### Entity-Specific Permissions

#### Viewing Search Results

```typescript
// No explicit permission check needed
// Backend handles it automatically
const results = await trpc.search.search.query({ query: 'test' });
```

#### Saving Searches

```typescript
// Only authenticated users can save searches
// Backend validates automatically
try {
  await trpc.search.saveSearch.mutate({
    name: 'My Search',
    query: 'logo designs',
    entities: ['assets']
  });
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    router.push('/login');
  }
}
```

#### Accessing Analytics

```typescript
// Only admins can access
// Check role before rendering UI
import { useSession } from 'next-auth/react';

const { data: session } = useSession();
const isAdmin = session?.user?.role === 'ADMIN';

// Conditionally render
{isAdmin && <AnalyticsButton />}

// Backend will also enforce this
try {
  const analytics = await trpc.search.getAnalytics.query({
    startDate: new Date('2024-01-01'),
    endDate: new Date()
  });
} catch (error) {
  if (error.code === 'FORBIDDEN') {
    toast.error('Admin access required');
  }
}
```

### Resource Ownership Rules

#### Saved Searches
Users can only:
- ✅ View their own saved searches
- ✅ Update their own saved searches
- ✅ Delete their own saved searches
- ❌ Access other users' saved searches

```typescript
// Backend automatically checks ownership
await trpc.search.updateSavedSearch.mutate({
  id: savedSearchId,
  name: 'Updated Name'
});
// If user doesn't own this search → 404 error
```

#### Search History
Users can only see their own recent searches:

```typescript
const recentSearches = await trpc.search.getRecentSearches.query({
  limit: 10
});
// Automatically filtered to current user
```

---

## Rate Limiting & Quotas

### Rate Limits

| Endpoint | Rate Limit | Window | Burst Allowed |
|----------|-----------|---------|---------------|
| Search | 60 requests | 1 minute | Yes (10) |
| Suggestions | 120 requests | 1 minute | Yes (20) |
| Track Click | 300 requests | 1 minute | Yes (50) |
| Save Search | 10 requests | 1 minute | No |
| Analytics | 20 requests | 1 minute | No |

### Rate Limit Headers

Response includes these headers:

```typescript
X-RateLimit-Limit: 60          // Max requests in window
X-RateLimit-Remaining: 45      // Requests remaining
X-RateLimit-Reset: 1634567890  // Unix timestamp when limit resets
```

### Handling Rate Limits

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const result = await trpc.search.search.query(params);
} catch (error) {
  if (error instanceof TRPCClientError) {
    if (error.data?.httpStatus === 429) {
      // Extract rate limit info
      const resetTime = error.data?.headers?.['x-ratelimit-reset'];
      const resetDate = new Date(resetTime * 1000);
      
      toast.error(
        `Too many searches. Try again in ${Math.ceil((resetDate - new Date()) / 1000)} seconds`
      );
    }
  }
}
```

### Rate Limit Best Practices

1. **Debounce Search Input**
```typescript
import { useDebouncedValue } from '@mantine/hooks';

const [query, setQuery] = useState('');
const [debouncedQuery] = useDebouncedValue(query, 300);

useEffect(() => {
  if (debouncedQuery.length >= 2) {
    performSearch(debouncedQuery);
  }
}, [debouncedQuery]);
```

2. **Throttle Suggestions**
```typescript
import { useThrottle } from 'react-use';

const throttledQuery = useThrottle(query, 200);

const { data: suggestions } = useQuery({
  queryKey: ['suggestions', throttledQuery],
  queryFn: () => trpc.search.getSuggestions.query({ query: throttledQuery }),
  enabled: throttledQuery.length >= 2
});
```

3. **Cache Aggressively**
```typescript
const { data } = useQuery({
  queryKey: ['search', query, filters],
  queryFn: () => trpc.search.search.query({ query, filters }),
  staleTime: 5 * 60 * 1000,  // 5 minutes
  cacheTime: 10 * 60 * 1000  // 10 minutes
});
```

4. **Batch Click Tracking**
```typescript
const clickQueue = useRef<ClickEvent[]>([]);

const trackClick = (event: ClickEvent) => {
  clickQueue.current.push(event);
  
  // Batch send every 2 seconds
  if (clickQueue.current.length === 1) {
    setTimeout(() => {
      const events = [...clickQueue.current];
      clickQueue.current = [];
      
      // Send all at once
      events.forEach(e => {
        trpc.search.trackClick.mutate(e).catch(console.error);
      });
    }, 2000);
  }
};
```

### Quota Limits

| Resource | Limit per User | Limit per Account |
|----------|---------------|-------------------|
| Saved Searches | 50 | - |
| Search History | 1000 entries | - |
| Analytics Queries (Admin) | - | 1000/day |

### Handling Quota Exceeded

```typescript
try {
  await trpc.search.saveSearch.mutate(searchData);
} catch (error) {
  if (error.code === 'PRECONDITION_FAILED' && 
      error.message.includes('quota exceeded')) {
    toast.error('You have reached the maximum number of saved searches (50)');
    // Prompt to delete old ones
    router.push('/saved-searches');
  }
}
```

---

## Security Considerations

### Input Sanitization

The backend automatically sanitizes queries, but follow these frontend practices:

1. **Never send raw HTML**
```typescript
// ✅ Good: Plain text only
const query = userInput.trim();

// ❌ Bad: Don't send HTML
const query = `<script>${userInput}</script>`;
```

2. **Escape special characters in UI**
```typescript
// When displaying highlights with <mark> tags
import DOMPurify from 'dompurify';

const sanitizedHighlight = DOMPurify.sanitize(result.highlights.title, {
  ALLOWED_TAGS: ['mark']
});
```

### XSS Prevention

Search highlights may contain `<mark>` tags. Always sanitize before rendering:

```typescript
import { sanitizeHtml } from '@/lib/sanitize';

// In component
<div 
  dangerouslySetInnerHTML={{ 
    __html: sanitizeHtml(result.highlights.title) 
  }} 
/>
```

### CSRF Protection

tRPC automatically includes CSRF tokens. No additional action needed.

### Authentication Tokens

```typescript
// Tokens are automatically included via tRPC client
// Don't manually add Authorization headers
```

### Sensitive Data Handling

1. **Don't log search queries with PII**
```typescript
// ❌ Bad
console.log('User searched:', query);

// ✅ Good
logger.info('Search performed', { 
  queryLength: query.length,
  entityTypes: entities,
  timestamp: new Date()
});
```

2. **Don't cache sensitive searches**
```typescript
const { data } = useQuery({
  queryKey: ['search', query],
  queryFn: () => trpc.search.search.query({ query }),
  // Disable cache for sensitive searches
  cacheTime: isSensitiveSearch ? 0 : 10 * 60 * 1000
});
```

3. **Clear search history on logout**
```typescript
const { signOut } = useSession();

const handleLogout = async () => {
  // Clear React Query cache
  queryClient.clear();
  
  // Clear local storage
  localStorage.removeItem('recent-searches');
  
  await signOut();
};
```

### Content Security Policy

Ensure your CSP allows search functionality:

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      connect-src 'self' https://ops.yesgoddess.agency;
      img-src 'self' https://r2.yesgoddess.agency data:;
    `.replace(/\s{2,}/g, ' ').trim()
  }
];
```

### Error Message Security

Never expose sensitive information in error messages:

```typescript
// ✅ Good: Generic message
catch (error) {
  toast.error('Search failed. Please try again.');
  // Log full error server-side only
}

// ❌ Bad: Exposing internals
catch (error) {
  toast.error(`Database error: ${error.message}`);
}
```

---

## Common Error Scenarios & Resolutions

### Scenario 1: Unauthenticated User

**Symptoms:** 401 Unauthorized errors  
**Resolution:**
```typescript
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const SearchComponent = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  if (status === 'loading') return <Spinner />;
  if (!session) {
    router.push('/login?callbackUrl=/search');
    return null;
  }
  
  return <SearchInterface />;
};
```

### Scenario 2: Zero Results

**Symptoms:** Empty results array  
**Resolution:**
```typescript
const { data } = await trpc.search.search.query({ query });

if (data.results.length === 0) {
  // Get spelling suggestion
  const suggestion = await trpc.search.getSpellingSuggestion.query({
    query,
    currentResultCount: 0
  });
  
  if (suggestion.hasAlternative) {
    // Show "Did you mean..." prompt
    setDidYouMean(suggestion.suggestedQuery);
  } else {
    // Show true zero-state
    setShowZeroState(true);
  }
}
```

### Scenario 3: Slow Search

**Symptoms:** Search takes > 2 seconds  
**Resolution:**
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['search', query],
  queryFn: () => trpc.search.search.query({ query }),
  // Show stale data while revalidating
  keepPreviousData: true,
  // Timeout after 10 seconds
  timeout: 10000
});

// Show loading indicator
{isLoading && <SearchLoadingState />}
```

### Scenario 4: Invalid Filter Combination

**Symptoms:** 400 Bad Request with zodError  
**Resolution:**
```typescript
try {
  await trpc.search.search.query({ query, filters });
} catch (error) {
  if (error.data?.zodError) {
    const fieldErrors = error.data.zodError.fieldErrors;
    
    // Show specific field errors
    Object.entries(fieldErrors).forEach(([field, errors]) => {
      toast.error(`${field}: ${errors[0]}`);
    });
  }
}
```

---

## Error Recovery Strategies

### Automatic Retry

```typescript
import { useQuery } from '@tanstack/react-query';

const { data } = useQuery({
  queryKey: ['search', query],
  queryFn: () => trpc.search.search.query({ query }),
  retry: (failureCount, error) => {
    // Don't retry on client errors (4xx)
    if (error.data?.httpStatus && error.data.httpStatus < 500) {
      return false;
    }
    // Retry up to 3 times on server errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
});
```

### Fallback UI

```typescript
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallback={<SearchErrorState />}
  onReset={() => queryClient.invalidateQueries(['search'])}
>
  <SearchInterface />
</ErrorBoundary>
```

### Optimistic Updates

```typescript
const utils = trpc.useContext();

const saveSearch = trpc.search.saveSearch.useMutation({
  onMutate: async (newSearch) => {
    // Cancel outgoing queries
    await utils.search.getSavedSearches.cancel();
    
    // Snapshot current value
    const previousSearches = utils.search.getSavedSearches.getData();
    
    // Optimistically update
    utils.search.getSavedSearches.setData(undefined, (old) => 
      [...(old || []), { ...newSearch, id: 'temp-id' }]
    );
    
    return { previousSearches };
  },
  onError: (err, newSearch, context) => {
    // Rollback on error
    utils.search.getSavedSearches.setData(
      undefined, 
      context?.previousSearches
    );
    toast.error('Failed to save search');
  },
  onSettled: () => {
    // Refresh data
    utils.search.getSavedSearches.invalidate();
  }
});
```

---

## Next Steps

Continue to:
- **Part 1**: [API Reference Guide](./SEARCH_SERVICE_API_REFERENCE.md)
- **Part 3**: [Frontend Implementation Guide](./SEARCH_SERVICE_IMPLEMENTATION_GUIDE.md)
