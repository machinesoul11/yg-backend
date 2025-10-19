# Frontend Integration Guide: Caching Strategy (Part 2)
## API Endpoints & Integration

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

**Module:** Caching Strategy & Performance Optimization  
**Last Updated:** October 19, 2025  
**Backend Version:** v1.0  
**Status:** ✅ Complete & Production-Ready

---

## Table of Contents (Part 2)

1. [Cache Management API Endpoints](#cache-management-api-endpoints)
2. [Cache Invalidation Patterns](#cache-invalidation-patterns)
3. [React Query Integration Examples](#react-query-integration-examples)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)

---

## Cache Management API Endpoints

### Admin Only - Cache Statistics

#### **GET** `/api/admin/redis/cache/stats`

Get current cache statistics and health metrics.

**Authentication:** Required (Admin only)

**Request:**
```typescript
// No parameters required
const response = await fetch('/api/admin/redis/cache/stats', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**
```typescript
interface CacheStatsResponse {
  stats: {
    totalKeys: number;
    memoryUsed: string; // "10.5 MB"
    hitRate?: number; // 0-100, undefined if no data
  };
  timestamp: string; // ISO 8601
}
```

**Success Response (200):**
```json
{
  "stats": {
    "totalKeys": 15432,
    "memoryUsed": "12.3 MB",
    "hitRate": 87.5
  },
  "timestamp": "2025-10-19T14:30:00.000Z"
}
```

**Error Response (500):**
```json
{
  "error": "Redis connection failed"
}
```

**Frontend Usage:**
```typescript
import { useQuery } from '@tanstack/react-query';

export function useCacheStats() {
  return useQuery({
    queryKey: ['admin', 'cache', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<CacheStatsResponse>(
        '/api/admin/redis/cache/stats'
      );
      return response.data;
    },
    // Refetch every 30 seconds
    refetchInterval: 30000,
    // Only for admin users
    enabled: user?.role === 'ADMIN',
  });
}

// Component
function CacheStatsWidget() {
  const { data, isLoading, error } = useCacheStats();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert message="Failed to load cache stats" />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>Cache Performance</CardHeader>
      <CardContent>
        <StatItem label="Total Keys" value={data.stats.totalKeys.toLocaleString()} />
        <StatItem label="Memory Used" value={data.stats.memoryUsed} />
        <StatItem 
          label="Hit Rate" 
          value={data.stats.hitRate ? `${data.stats.hitRate.toFixed(1)}%` : 'N/A'} 
          status={data.stats.hitRate && data.stats.hitRate > 70 ? 'good' : 'warning'}
        />
        <Text variant="caption">Last updated: {formatTime(data.timestamp)}</Text>
      </CardContent>
    </Card>
  );
}
```

---

### Admin Only - Cache Invalidation

#### **DELETE** `/api/admin/redis/cache/invalidate?pattern={pattern}`

Invalidate cache entries matching a pattern.

**Authentication:** Required (Admin only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Redis key pattern to delete (e.g., `cache:user:*`) |

**Request:**
```typescript
const response = await fetch(
  '/api/admin/redis/cache/invalidate?pattern=cache:user:*',
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);
```

**Response Schema:**
```typescript
interface CacheInvalidateResponse {
  success: boolean;
  deleted: number;
  pattern: string;
  timestamp: string;
}
```

**Success Response (200):**
```json
{
  "success": true,
  "deleted": 42,
  "pattern": "cache:user:*",
  "timestamp": "2025-10-19T14:30:00.000Z"
}
```

**Error Response (400):**
```json
{
  "error": "Pattern parameter is required"
}
```

**Error Response (500):**
```json
{
  "error": "Failed to invalidate cache"
}
```

**Common Patterns:**

| Pattern | Description | Use Case |
|---------|-------------|----------|
| `cache:user:*` | All user caches | After bulk user update |
| `cache:creator:*` | All creator caches | Creator data structure change |
| `cache:brand:*` | All brand caches | Brand data structure change |
| `cache:analytics:*` | All analytics | Analytics recalculation |
| `cache:project:${projectId}:*` | Specific project | Project updated |
| `api:response:/api/creators*` | Creator API responses | Creator search index rebuilt |

**Frontend Usage:**
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface InvalidateCacheParams {
  pattern: string;
}

export function useInvalidateCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pattern }: InvalidateCacheParams) => {
      const response = await fetch(
        `/api/admin/redis/cache/invalidate?pattern=${encodeURIComponent(pattern)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to invalidate cache');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate related React Query caches
      if (variables.pattern.includes('user')) {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else if (variables.pattern.includes('creator')) {
        queryClient.invalidateQueries({ queryKey: ['creators'] });
      } else if (variables.pattern.includes('brand')) {
        queryClient.invalidateQueries({ queryKey: ['brands'] });
      }

      // Show success toast
      toast.success(`Invalidated ${data.deleted} cache entries`);
    },
    onError: (error) => {
      toast.error(`Failed to invalidate cache: ${error.message}`);
    },
  });
}

// Component
function CacheInvalidationPanel() {
  const [pattern, setPattern] = useState('');
  const invalidate = useInvalidateCache();

  const handleInvalidate = () => {
    if (!pattern) return;
    invalidate.mutate({ pattern });
  };

  return (
    <Card>
      <CardHeader>Cache Invalidation</CardHeader>
      <CardContent>
        <Input
          placeholder="e.g., cache:user:*"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <Button
          onClick={handleInvalidate}
          disabled={!pattern || invalidate.isPending}
          variant="destructive"
        >
          {invalidate.isPending ? 'Invalidating...' : 'Invalidate Cache'}
        </Button>
        
        <Alert variant="warning">
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            This will delete all cache entries matching the pattern.
            Use with caution in production.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
```

---

## Cache Invalidation Patterns

### Automatic Cache Invalidation

The backend automatically invalidates cache when data changes. The frontend should **trust the backend** and refetch when needed.

### Manual Cache Invalidation (Frontend)

When you make mutations (POST, PUT, DELETE), invalidate related React Query caches:

```typescript
// After updating user profile
queryClient.invalidateQueries({ queryKey: ['user', userId] });

// After updating creator
queryClient.invalidateQueries({ queryKey: ['creator', creatorId] });
queryClient.invalidateQueries({ queryKey: ['creators'] }); // List view

// After updating project
queryClient.invalidateQueries({ queryKey: ['project', projectId] });
queryClient.invalidateQueries({ queryKey: ['brand', brandId, 'projects'] });

// After creating license
queryClient.invalidateQueries({ queryKey: ['licenses'] });
queryClient.invalidateQueries({ queryKey: ['brand', brandId, 'licenses'] });
queryClient.invalidateQueries({ queryKey: ['analytics'] });
```

### Granular Invalidation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useUpdateCreatorProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateCreatorInput) => {
      const response = await apiClient.put(`/api/creators/${data.id}`, data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate specific queries
      queryClient.invalidateQueries({ 
        queryKey: ['creator', variables.id] 
      });
      
      // Invalidate list queries that might include this creator
      queryClient.invalidateQueries({ 
        queryKey: ['creators'],
        // Optionally refetch immediately
        refetchType: 'active',
      });
      
      // Update cache directly (optimistic update)
      queryClient.setQueryData(['creator', variables.id], data);
    },
  });
}
```

### Cache Invalidation on Events

```typescript
// Listen to WebSocket/SSE events for cache invalidation
useEffect(() => {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('cache-invalidate', (event) => {
    const { entityType, entityId } = JSON.parse(event.data);

    switch (entityType) {
      case 'user':
        queryClient.invalidateQueries({ queryKey: ['user', entityId] });
        break;
      case 'creator':
        queryClient.invalidateQueries({ queryKey: ['creator', entityId] });
        break;
      case 'brand':
        queryClient.invalidateQueries({ queryKey: ['brand', entityId] });
        break;
      // ... handle other entity types
    }
  });

  return () => eventSource.close();
}, [queryClient]);
```

---

## React Query Integration Examples

### 1. User Profile with Cache

```typescript
// hooks/use-user-profile.ts
import { useQuery } from '@tanstack/react-query';

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const response = await apiClient.get<User>(`/api/users/${userId}`);
      
      // Log cache status for debugging
      console.log('User profile cache:', response.cache);
      
      return response.data;
    },
    // Cache for 1 hour (matches backend TTL)
    staleTime: 60 * 60 * 1000,
    // Keep in cache for 2 hours
    gcTime: 2 * 60 * 60 * 1000,
    // Refetch on window focus to ensure freshness
    refetchOnWindowFocus: true,
    // Retry failed requests
    retry: 2,
  });
}

// Component usage
function UserProfileCard({ userId }: { userId: string }) {
  const { data: user, isLoading, error, dataUpdatedAt } = useUserProfile(userId);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert />;
  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <Avatar src={user.avatar} />
        <div>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
        </div>
      </CardHeader>
      <CardFooter>
        <Text variant="caption">
          Updated {formatDistanceToNow(dataUpdatedAt)} ago
        </Text>
      </CardFooter>
    </Card>
  );
}
```

### 2. Creator Search with Pagination

```typescript
// hooks/use-creator-search.ts
import { useInfiniteQuery } from '@tanstack/react-query';

interface CreatorSearchParams {
  query?: string;
  category?: string;
  verified?: boolean;
  limit?: number;
}

interface CreatorSearchResponse {
  creators: Creator[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export function useCreatorSearch(params: CreatorSearchParams) {
  return useInfiniteQuery({
    queryKey: ['creators', 'search', params],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await apiClient.get<CreatorSearchResponse>(
        '/api/creators/search',
        {
          query: {
            ...params,
            page: pageParam,
            limit: params.limit || 20,
          },
        }
      );
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore 
        ? lastPage.pagination.page + 1 
        : undefined;
    },
    // Cache search results for 5 minutes
    staleTime: 5 * 60 * 1000,
  });
}

// Component usage
function CreatorSearchResults() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ verified: true });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useCreatorSearch({
    query: searchQuery,
    ...filters,
  });

  const creators = data?.pages.flatMap(page => page.creators) || [];

  return (
    <div>
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <FilterPanel filters={filters} onChange={setFilters} />
      
      <div className="grid gap-4">
        {creators.map(creator => (
          <CreatorCard key={creator.id} creator={creator} />
        ))}
      </div>

      {hasNextPage && (
        <Button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </div>
  );
}
```

### 3. Analytics Dashboard with SWR

```typescript
// hooks/use-analytics.ts
import { useQuery } from '@tanstack/react-query';

interface AnalyticsData {
  totalRevenue: number;
  totalLicenses: number;
  activeBrands: number;
  growth: {
    revenue: number;
    licenses: number;
  };
}

export function useAnalyticsDashboard(dateRange: { start: Date; end: Date }) {
  return useQuery({
    queryKey: ['analytics', 'dashboard', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<AnalyticsData>(
        '/api/analytics/dashboard',
        {
          query: {
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
          },
        }
      );
      return response.data;
    },
    // Cache for 5 minutes (backend uses ANALYTICS preset)
    staleTime: 5 * 60 * 1000,
    // Refetch stale data in background
    refetchInterval: 5 * 60 * 1000,
    // Keep showing stale data while refetching
    placeholderData: (previousData) => previousData,
  });
}

// Component usage
function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  });

  const { data: analytics, isLoading, isFetching } = useAnalyticsDashboard(dateRange);

  return (
    <div>
      <DateRangePicker value={dateRange} onChange={setDateRange} />
      
      {isFetching && <RefreshingIndicator />}

      {analytics && (
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(analytics.totalRevenue)}
            trend={analytics.growth.revenue}
          />
          <MetricCard
            title="Active Licenses"
            value={analytics.totalLicenses}
            trend={analytics.growth.licenses}
          />
          <MetricCard
            title="Active Brands"
            value={analytics.activeBrands}
          />
        </div>
      )}
    </div>
  );
}
```

### 4. Optimistic Updates with Cache

```typescript
// hooks/use-update-project.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateProjectInput) => {
      const response = await apiClient.put(`/api/projects/${data.id}`, data);
      return response.data;
    },
    // Optimistic update
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['project', newData.id] });

      // Snapshot previous value
      const previousProject = queryClient.getQueryData(['project', newData.id]);

      // Optimistically update cache
      queryClient.setQueryData(['project', newData.id], (old: any) => ({
        ...old,
        ...newData,
      }));

      // Return context with previous value
      return { previousProject };
    },
    // Rollback on error
    onError: (err, newData, context) => {
      queryClient.setQueryData(
        ['project', newData.id],
        context?.previousProject
      );
      toast.error('Failed to update project');
    },
    // Refetch after success
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated successfully');
    },
  });
}
```

---

## Error Handling

### Cache-Related Errors

```typescript
export interface CacheError {
  code: string;
  message: string;
  details?: any;
}

// Error codes you might encounter
export enum CacheErrorCode {
  CONNECTION_FAILED = 'CACHE_CONNECTION_FAILED',
  TIMEOUT = 'CACHE_TIMEOUT',
  INVALIDATION_FAILED = 'CACHE_INVALIDATION_FAILED',
  SERIALIZATION_ERROR = 'CACHE_SERIALIZATION_ERROR',
}
```

### Handling Cache Errors

```typescript
// Global error handler
export function handleCacheError(error: CacheError): void {
  switch (error.code) {
    case CacheErrorCode.CONNECTION_FAILED:
      // Cache is down, but API should still work (degraded mode)
      console.warn('Cache unavailable, using direct database queries');
      // Optionally show a banner
      showBanner('Some features may be slower due to maintenance', 'warning');
      break;

    case CacheErrorCode.TIMEOUT:
      // Cache took too long, request might have succeeded
      console.warn('Cache operation timed out');
      // Retry the request
      break;

    case CacheErrorCode.INVALIDATION_FAILED:
      // Failed to invalidate cache, data might be stale
      console.error('Cache invalidation failed');
      toast.error('Changes may take a few minutes to appear');
      break;

    default:
      // Generic error
      console.error('Cache error:', error);
  }
}
```

### Graceful Degradation

The backend is designed to fail gracefully if Redis is unavailable:

```typescript
// This pattern ensures your app works even if cache fails
export function useCachedData<T>(
  queryKey: string[],
  fetcher: () => Promise<T>
) {
  return useQuery({
    queryKey,
    queryFn: fetcher,
    // Continue using stale data on error
    throwOnError: false,
    // Retry failed requests
    retry: (failureCount, error) => {
      // Don't retry cache errors, fallback to fresh data
      if (isCacheError(error)) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
```

---

## Rate Limiting

### Rate Limit Headers

The backend may include rate limit information in response headers:

```typescript
export interface RateLimitHeaders {
  'x-ratelimit-limit': string;    // Max requests per window
  'x-ratelimit-remaining': string; // Remaining requests
  'x-ratelimit-reset': string;     // Unix timestamp when limit resets
}
```

### Parsing Rate Limit Headers

```typescript
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');

  if (!limit || !remaining || !reset) {
    return null;
  }

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    reset: new Date(parseInt(reset, 10) * 1000),
    percentage: (parseInt(remaining, 10) / parseInt(limit, 10)) * 100,
  };
}
```

### Rate Limit Monitoring

```typescript
// Context for tracking rate limits
export const RateLimitContext = createContext<RateLimitInfo | null>(null);

export function useRateLimit() {
  return useContext(RateLimitContext);
}

// Provider component
export function RateLimitProvider({ children }: { children: ReactNode }) {
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  // Update rate limit from response headers
  const updateRateLimit = useCallback((headers: Headers) => {
    const info = parseRateLimitHeaders(headers);
    if (info) {
      setRateLimit(info);
    }
  }, []);

  return (
    <RateLimitContext.Provider value={rateLimit}>
      {children}
      {rateLimit && rateLimit.remaining < 10 && (
        <RateLimitWarning rateLimit={rateLimit} />
      )}
    </RateLimitContext.Provider>
  );
}
```

### Rate Limit Warning Component

```typescript
function RateLimitWarning({ rateLimit }: { rateLimit: RateLimitInfo }) {
  const resetIn = formatDistanceToNow(rateLimit.reset, { addSuffix: true });

  if (rateLimit.remaining > 10) return null;

  return (
    <Alert variant="warning" className="fixed bottom-4 right-4">
      <AlertTitle>Rate Limit Warning</AlertTitle>
      <AlertDescription>
        You have {rateLimit.remaining} of {rateLimit.limit} requests remaining.
        Limit resets {resetIn}.
      </AlertDescription>
    </Alert>
  );
}
```

---

**Continue to [Part 3: Advanced Topics & Best Practices](./FRONTEND_INTEGRATION_CACHING_PART_3.md)** for:
- CDN integration
- Cache warming strategies
- Performance monitoring
- Debugging tools
- Frontend implementation checklist
