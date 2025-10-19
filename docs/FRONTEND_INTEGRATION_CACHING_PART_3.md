# Frontend Integration Guide: Caching Strategy (Part 3)
## Advanced Topics & Implementation Guide

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

**Module:** Caching Strategy & Performance Optimization  
**Last Updated:** October 19, 2025  
**Backend Version:** v1.0  
**Status:** ✅ Complete & Production-Ready

---

## Table of Contents (Part 3)

1. [CDN Integration](#cdn-integration)
2. [Cache Warming Strategy](#cache-warming-strategy)
3. [Performance Monitoring](#performance-monitoring)
4. [Debugging & Development Tools](#debugging--development-tools)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## CDN Integration

### Static Asset Caching

The backend serves static assets through Cloudflare CDN with optimal cache headers.

**Cached Asset Types:**

| Asset Type | Cache Duration | Header Value |
|------------|----------------|--------------|
| Images (`.jpg`, `.png`, `.svg`) | 1 year | `public, max-age=31536000, immutable` |
| Fonts (`.woff`, `.woff2`, `.ttf`) | 1 year | `public, max-age=31536000, immutable` |
| JavaScript bundles | 1 year | `public, max-age=31536000, immutable` |
| CSS files | 1 year | `public, max-age=31536000, immutable` |
| Thumbnails | 30 days | `public, max-age=2592000, immutable` |
| HTML pages | 1 hour | `public, max-age=3600, must-revalidate` |

### Asset URLs

**Always use versioned or content-hashed URLs for immutable assets:**

```typescript
// ✅ GOOD: Content-hashed filename (immutable)
<img src="/assets/logo-abc123.png" />

// ✅ GOOD: Versioned URL (immutable)
<img src="/assets/logo.png?v=1.2.3" />

// ❌ BAD: No version/hash (may serve stale content)
<img src="/assets/logo.png" />
```

### CDN Cache Status

Check CDN cache status via response headers:

```typescript
function checkCDNCache(url: string): Promise<CacheStatus> {
  return fetch(url, { method: 'HEAD' }).then(response => {
    const cfStatus = response.headers.get('cf-cache-status');
    const age = response.headers.get('age');

    return {
      cached: cfStatus === 'HIT',
      status: cfStatus,
      age: age ? parseInt(age, 10) : 0,
      expires: new Date(Date.now() + 
        (response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 0) * 1000
      ),
    };
  });
}

// Usage
const logoCache = await checkCDNCache('https://ops.yesgoddess.agency/logo.png');
console.log('Logo cached:', logoCache.cached); // true = served from CDN
```

### Image Optimization

Use Next.js Image component for automatic optimization:

```typescript
import Image from 'next/image';

function CreatorAvatar({ creator }: { creator: Creator }) {
  return (
    <Image
      src={creator.avatar}
      alt={creator.name}
      width={200}
      height={200}
      // Next.js automatically:
      // 1. Converts to WebP/AVIF
      // 2. Generates multiple sizes
      // 3. Lazy loads
      // 4. Adds proper cache headers
      priority={false} // true for above-the-fold images
    />
  );
}
```

### Prefetching Assets

Prefetch critical assets for faster page loads:

```typescript
// In your layout or page component
export function AssetPrefetcher({ assets }: { assets: string[] }) {
  useEffect(() => {
    assets.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    });
  }, [assets]);

  return null;
}

// Usage in page
function CreatorProfilePage({ creator }: { creator: Creator }) {
  return (
    <>
      <AssetPrefetcher assets={[
        creator.avatar,
        creator.coverImage,
        ...creator.portfolioImages.slice(0, 3), // First 3 images
      ]} />
      
      <CreatorProfile creator={creator} />
    </>
  );
}
```

---

## Cache Warming Strategy

### What is Cache Warming?

Cache warming is the process of proactively populating the cache with frequently accessed data to prevent cache misses.

**Backend automatically warms cache for:**
- Top 100 active users (last 7 days)
- Top 50 verified creators
- Top 50 verified brands
- Active projects (ACTIVE, IN_PROGRESS status)
- Platform-wide analytics
- Popular assets

### Frontend Cache Warming

**Warm cache for predicted user navigation:**

```typescript
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function useNavigationPrefetch() {
  const queryClient = useQueryClient();

  const prefetchCreatorProfile = useCallback((creatorId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['creator', creatorId],
      queryFn: () => apiClient.get(`/api/creators/${creatorId}`),
      // Keep prefetched data for 5 minutes
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  const prefetchBrandProjects = useCallback((brandId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['brand', brandId, 'projects'],
      queryFn: () => apiClient.get(`/api/brands/${brandId}/projects`),
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  return {
    prefetchCreatorProfile,
    prefetchBrandProjects,
  };
}

// Usage
function CreatorCard({ creator }: { creator: Creator }) {
  const router = useRouter();
  const { prefetchCreatorProfile } = useNavigationPrefetch();

  return (
    <Card
      // Prefetch on hover
      onMouseEnter={() => prefetchCreatorProfile(creator.id)}
      onClick={() => router.push(`/creators/${creator.id}`)}
    >
      <CardContent>
        <h3>{creator.name}</h3>
        <p>{creator.bio}</p>
      </CardContent>
    </Card>
  );
}
```

### Prefetch on Route Change

```typescript
// In your app layout
export function NavigationPrefetcher() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch common data when landing on specific routes
    if (pathname.startsWith('/dashboard')) {
      // Prefetch dashboard data
      queryClient.prefetchQuery({
        queryKey: ['analytics', 'dashboard'],
        queryFn: () => apiClient.get('/api/analytics/dashboard'),
      });
    } else if (pathname.startsWith('/creators')) {
      // Prefetch creator list
      queryClient.prefetchQuery({
        queryKey: ['creators', 'featured'],
        queryFn: () => apiClient.get('/api/creators/featured'),
      });
    }
  }, [pathname, queryClient]);

  return null;
}
```

### Background Cache Refresh

Keep cache fresh in background:

```typescript
export function useBackgroundRefresh<T>(
  queryKey: string[],
  fetcher: () => Promise<T>,
  interval: number = 60000 // 1 minute
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => {
      // Refetch in background without showing loading state
      queryClient.invalidateQueries({ 
        queryKey, 
        refetchType: 'none' // Don't refetch immediately
      });
      
      // Then refetch silently
      queryClient.prefetchQuery({ queryKey, queryFn: fetcher });
    }, interval);

    return () => clearInterval(timer);
  }, [queryKey, fetcher, interval, queryClient]);
}

// Usage
function AnalyticsDashboard() {
  const { data: analytics } = useAnalyticsDashboard();
  
  // Refresh analytics every 5 minutes in background
  useBackgroundRefresh(
    ['analytics', 'dashboard'],
    () => apiClient.get('/api/analytics/dashboard'),
    5 * 60 * 1000
  );

  return <Dashboard data={analytics} />;
}
```

---

## Performance Monitoring

### Cache Performance Metrics

Track cache performance on the frontend:

```typescript
interface CachePerformanceLog {
  url: string;
  method: string;
  cached: boolean;
  cacheHit: boolean;
  responseTime: number;
  timestamp: Date;
}

export class CachePerformanceMonitor {
  private logs: CachePerformanceLog[] = [];

  log(data: Omit<CachePerformanceLog, 'timestamp'>): void {
    this.logs.push({
      ...data,
      timestamp: new Date(),
    });

    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

  getMetrics(): {
    hitRate: number;
    averageResponseTime: number;
    totalRequests: number;
  } {
    const total = this.logs.length;
    const hits = this.logs.filter(log => log.cacheHit).length;
    const avgTime = this.logs.reduce((sum, log) => sum + log.responseTime, 0) / total;

    return {
      hitRate: (hits / total) * 100,
      averageResponseTime: avgTime,
      totalRequests: total,
    };
  }

  clear(): void {
    this.logs = [];
  }
}

export const cacheMonitor = new CachePerformanceMonitor();
```

### Instrumented Fetch

Wrap fetch to track cache performance:

```typescript
export async function fetchWithMonitoring<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T; cache: CacheMetadata }> {
  const startTime = performance.now();

  const response = await fetch(url, options);
  const cache = extractCacheMetadata(response.headers);
  const data = await response.json();

  const endTime = performance.now();
  const responseTime = endTime - startTime;

  // Log performance
  cacheMonitor.log({
    url,
    method: options?.method || 'GET',
    cached: cache.cached,
    cacheHit: cache.cacheHit,
    responseTime,
  });

  // Send to analytics (optional)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'api_request', {
      url,
      cached: cache.cacheHit,
      response_time: responseTime,
    });
  }

  return { data, cache };
}
```

### Performance Dashboard

Display cache metrics to admins:

```typescript
function CachePerformanceDashboard() {
  const [metrics, setMetrics] = useState(cacheMonitor.getMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(cacheMonitor.getMetrics());
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>Frontend Cache Performance</CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Hit Rate"
            value={`${metrics.hitRate.toFixed(1)}%`}
            status={metrics.hitRate > 70 ? 'success' : 'warning'}
          />
          <MetricCard
            label="Avg Response Time"
            value={`${metrics.averageResponseTime.toFixed(0)}ms`}
            status={metrics.averageResponseTime < 200 ? 'success' : 'warning'}
          />
          <MetricCard
            label="Total Requests"
            value={metrics.totalRequests}
          />
        </div>
        <Button onClick={() => cacheMonitor.clear()}>
          Clear Logs
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## Debugging & Development Tools

### Cache Debug Panel

Development tool to inspect cache behavior:

```typescript
'use client';

import { useEffect, useState } from 'react';

export function CacheDebugPanel() {
  const [logs, setLogs] = useState<CachePerformanceLog[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only in development
    if (process.env.NODE_ENV !== 'development') return;

    const interval = setInterval(() => {
      setLogs([...cacheMonitor['logs']]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-blue-500 text-white p-2 rounded"
      >
        Cache Debug
      </button>

      {isOpen && (
        <div className="fixed bottom-16 right-4 bg-white shadow-lg rounded p-4 max-h-96 overflow-auto">
          <h3 className="font-bold mb-2">Cache Debug Panel</h3>
          <table className="text-xs">
            <thead>
              <tr>
                <th>URL</th>
                <th>Cached</th>
                <th>Time (ms)</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(-20).reverse().map((log, i) => (
                <tr key={i} className={log.cacheHit ? 'bg-green-50' : 'bg-red-50'}>
                  <td>{log.url}</td>
                  <td>{log.cacheHit ? '✓' : '✗'}</td>
                  <td>{log.responseTime.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

### Cache Inspection Hook

```typescript
export function useCacheInspector() {
  const queryClient = useQueryClient();

  const inspectCache = useCallback((queryKey: string[]) => {
    const state = queryClient.getQueryState(queryKey);
    const data = queryClient.getQueryData(queryKey);

    return {
      exists: !!state,
      stale: state?.isInvalidated || false,
      fetching: state?.isFetching || false,
      dataUpdatedAt: state?.dataUpdatedAt,
      data,
    };
  }, [queryClient]);

  const getAllQueries = useCallback(() => {
    return queryClient.getQueryCache().getAll();
  }, [queryClient]);

  return {
    inspectCache,
    getAllQueries,
  };
}

// Component
function CacheInspector() {
  const { getAllQueries, inspectCache } = useCacheInspector();
  const [queries, setQueries] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setQueries(getAllQueries());
    }, 1000);

    return () => clearInterval(interval);
  }, [getAllQueries]);

  return (
    <div>
      <h3>React Query Cache ({queries.length} queries)</h3>
      <ul>
        {queries.map((query, i) => (
          <li key={i}>
            <strong>{JSON.stringify(query.queryKey)}</strong>
            <span> - {query.state.status}</span>
            {query.state.dataUpdatedAt && (
              <span> (updated {formatDistanceToNow(query.state.dataUpdatedAt)} ago)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Browser DevTools Integration

Log cache activity to browser console:

```typescript
export function enableCacheDebugging(): void {
  if (process.env.NODE_ENV !== 'development') return;

  // Log all fetch requests with cache status
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [url, options] = args;
    const method = options?.method || 'GET';
    
    console.groupCollapsed(`[Fetch] ${method} ${url}`);
    console.log('Options:', options);

    const startTime = performance.now();
    const response = await originalFetch(...args);
    const endTime = performance.now();

    const cache = extractCacheMetadata(response.headers);
    
    console.log('Cache:', cache);
    console.log('Time:', `${(endTime - startTime).toFixed(0)}ms`);
    console.groupEnd();

    return response;
  };
}

// Enable in development
if (typeof window !== 'undefined') {
  enableCacheDebugging();
}
```

---

## Business Logic & Validation Rules

### Cache Invalidation Rules

**When to invalidate cache:**

| Action | Invalidate |
|--------|-----------|
| User updates profile | `['user', userId]` |
| Creator updates profile | `['creator', creatorId]`, `['creators']` |
| Brand updates profile | `['brand', brandId]`, `['brands']` |
| Project created/updated | `['project', projectId]`, `['brand', brandId, 'projects']` |
| Asset uploaded | `['asset', assetId]`, `['project', projectId, 'assets']` |
| License created | `['licenses']`, `['brand', brandId, 'licenses']`, `['analytics']` |
| Payment processed | `['payouts']`, `['creator', creatorId, 'earnings']`, `['analytics']` |

### Stale Data Tolerance

Different data types have different freshness requirements:

| Data Type | Tolerance | Strategy |
|-----------|-----------|----------|
| User profile | Low (5-15 min stale OK) | Medium cache (15 min) |
| Financial data | Very low (must be fresh) | Short cache (5 min) + frequent revalidation |
| Analytics | Medium (5-30 min stale OK) | Medium cache + SWR |
| Static content | High (hours/days stale OK) | Long cache (24 hours) |
| Search results | Low (5 min stale OK) | Short cache (5 min) |

### Cache Key Generation

**Consistent cache key rules:**

```typescript
// ✅ GOOD: Consistent key generation
const getCacheKey = (type: string, id: string, ...params: string[]) => {
  return [type, id, ...params.filter(Boolean).sort()];
};

// Example keys:
getCacheKey('creator', 'abc123'); // ['creator', 'abc123']
getCacheKey('creator', 'abc123', 'projects'); // ['creator', 'abc123', 'projects']

// ❌ BAD: Inconsistent ordering
['creator', id, 'projects'];
['creator', 'projects', id]; // Different key for same data!
```

---

## Frontend Implementation Checklist

### Phase 1: Setup (1-2 days)

- [ ] **Install dependencies**
  ```bash
  npm install @tanstack/react-query
  ```

- [ ] **Create API client with cache support**
  - [ ] Implement `fetchWithETag` function
  - [ ] Add `extractCacheMetadata` helper
  - [ ] Create `CachedApiClient` class

- [ ] **Setup React Query**
  - [ ] Configure `QueryClient` with default options
  - [ ] Add `QueryClientProvider` to app root
  - [ ] Set appropriate `staleTime` and `gcTime`

- [ ] **Create TypeScript types**
  - [ ] Copy type definitions from Part 1
  - [ ] Add to `types/cache.ts`

### Phase 2: Core Integration (2-3 days)

- [ ] **Implement cache-aware hooks**
  - [ ] `useUserProfile` with 1-hour cache
  - [ ] `useCreatorProfile` with 1-hour cache
  - [ ] `useBrandProfile` with 1-hour cache
  - [ ] `useAnalytics` with 5-minute cache + SWR

- [ ] **Add cache invalidation**
  - [ ] Invalidate on mutations (POST/PUT/DELETE)
  - [ ] Implement optimistic updates
  - [ ] Add error rollback

- [ ] **Handle cache headers**
  - [ ] Parse `Cache-Control` header
  - [ ] Support `ETag` conditional requests
  - [ ] Display cache status (dev mode)

### Phase 3: Optimization (2-3 days)

- [ ] **Add prefetching**
  - [ ] Prefetch on hover (navigation predictions)
  - [ ] Prefetch on route change
  - [ ] Background cache refresh

- [ ] **Implement monitoring**
  - [ ] Add `CachePerformanceMonitor`
  - [ ] Track hit rate and response times
  - [ ] Create admin dashboard (optional)

- [ ] **CDN optimization**
  - [ ] Use Next.js Image component
  - [ ] Add asset prefetching
  - [ ] Implement versioned URLs

### Phase 4: Testing & Polish (1-2 days)

- [ ] **Test cache behavior**
  - [ ] Verify cache hits/misses
  - [ ] Test invalidation on mutations
  - [ ] Verify ETag support
  - [ ] Test stale-while-revalidate

- [ ] **Add debugging tools** (dev only)
  - [ ] Cache debug panel
  - [ ] Console logging
  - [ ] DevTools integration

- [ ] **Performance testing**
  - [ ] Measure response times
  - [ ] Calculate hit rate
  - [ ] Compare with/without cache

- [ ] **Error handling**
  - [ ] Handle cache failures gracefully
  - [ ] Show fallback UI
  - [ ] Log errors appropriately

### Phase 5: Production Rollout (1 day)

- [ ] **Production checklist**
  - [ ] Remove/disable debug tools
  - [ ] Verify cache headers in production
  - [ ] Monitor error rates
  - [ ] Set up alerting

- [ ] **Documentation**
  - [ ] Document cache key patterns
  - [ ] Add troubleshooting guide
  - [ ] Update API documentation

---

## Edge Cases to Handle

### 1. Stale Data During Updates

**Problem:** User updates their profile, but sees old data because cache hasn't invalidated.

**Solution:** Optimistic updates + immediate invalidation

```typescript
const updateProfile = useMutation({
  mutationFn: updateProfileApi,
  onMutate: async (newData) => {
    // Optimistically update cache
    queryClient.setQueryData(['user', userId], newData);
  },
  onSuccess: () => {
    // Invalidate to refetch fresh data
    queryClient.invalidateQueries(['user', userId]);
  },
});
```

### 2. Concurrent Updates

**Problem:** Two users update the same resource simultaneously.

**Solution:** Use ETags for conflict detection

```typescript
const response = await fetch(url, {
  method: 'PUT',
  headers: {
    'If-Match': etag, // Backend will return 412 if outdated
  },
  body: JSON.stringify(data),
});

if (response.status === 412) {
  // Resource was modified, refetch and retry
  const fresh = await refetch();
  // Show conflict resolution UI
}
```

### 3. Cache Stampede

**Problem:** Cache expires, 100 users hit endpoint simultaneously.

**Solution:** React Query handles this automatically with request deduplication

```typescript
// Multiple components requesting same data = single network request
const { data: creator1 } = useCreatorProfile('abc123');
const { data: creator2 } = useCreatorProfile('abc123'); // Uses same request
```

### 4. Memory Leaks

**Problem:** Cached data accumulates and consumes memory.

**Solution:** Configure garbage collection

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000, // Remove from cache after 5 minutes of inactivity
    },
  },
});
```

---

## UX Considerations

### Loading States

Show appropriate loading states based on cache:

```typescript
function CreatorProfile({ creatorId }: { creatorId: string }) {
  const { data, isLoading, isFetching, dataUpdatedAt } = useCreatorProfile(creatorId);

  return (
    <div>
      {/* Show skeleton only on initial load */}
      {isLoading && <Skeleton />}

      {/* Show data with refresh indicator if refetching */}
      {data && (
        <>
          <CreatorCard creator={data} />
          {isFetching && <RefreshingBadge />}
          <Text variant="caption">
            Updated {formatDistanceToNow(dataUpdatedAt)} ago
          </Text>
        </>
      )}
    </div>
  );
}
```

### Stale Data Indicators

Inform users when data might be stale:

```typescript
function DataFreshnessIndicator({ updatedAt }: { updatedAt: Date }) {
  const ageMinutes = (Date.now() - updatedAt.getTime()) / 1000 / 60;

  if (ageMinutes < 5) {
    return <Badge variant="success">Live</Badge>;
  } else if (ageMinutes < 30) {
    return <Badge variant="default">Fresh</Badge>;
  } else {
    return <Badge variant="warning">May be outdated</Badge>;
  }
}
```

### Refresh Actions

Allow users to manually refresh:

```typescript
function RefreshButton({ queryKey }: { queryKey: string[] }) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <Button onClick={handleRefresh} disabled={isRefreshing}>
      {isRefreshing ? <Spinner /> : <RefreshIcon />}
      Refresh
    </Button>
  );
}
```

---

## Support & Resources

### Backend Team Contact

For questions about cache behavior or issues:
- **Backend Developer:** [Your Contact Info]
- **API Documentation:** `https://ops.yesgoddess.agency/api-docs`
- **Slack Channel:** `#backend-support`

### Useful Resources

- [React Query Documentation](https://tanstack.com/query/latest)
- [HTTP Caching (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Cloudflare Cache Documentation](https://developers.cloudflare.com/cache/)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Cache not updating after mutation | Check invalidation logic, ensure correct query keys |
| High cache miss rate | Review cache keys for consistency, check TTL values |
| Stale data displayed | Reduce `staleTime` or add background refetch |
| Memory usage increasing | Configure `gcTime` to remove unused cache entries |
| 304 responses not working | Ensure `If-None-Match` header is sent with requests |

---

## Summary

You now have everything needed to integrate with the YesGoddess caching strategy:

✅ **Part 1:** Architecture, cache types, HTTP headers, TypeScript types  
✅ **Part 2:** API endpoints, invalidation patterns, React Query examples  
✅ **Part 3:** CDN integration, monitoring, debugging, implementation checklist

**Next Steps:**
1. Follow the implementation checklist (Phase 1-5)
2. Test with development backend
3. Monitor cache performance
4. Optimize based on metrics
5. Deploy to production

**Questions?** Refer to backend team or review the comprehensive docs in this 3-part guide.

---

**End of Frontend Integration Guide**
