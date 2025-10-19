# Frontend Integration Guide: Caching Strategy (Part 1)
## Overview & Core Concepts

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

**Module:** Caching Strategy & Performance Optimization  
**Last Updated:** October 19, 2025  
**Backend Version:** v1.0  
**Status:** ✅ Complete & Production-Ready

---

## Table of Contents (Part 1)

1. [Architecture Overview](#architecture-overview)
2. [Cache Types & Strategy](#cache-types--strategy)
3. [HTTP Cache Headers](#http-cache-headers)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Frontend Implementation Patterns](#frontend-implementation-patterns)

---

## Architecture Overview

### System Architecture

The YesGoddess backend implements a multi-layered caching strategy:

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend Application                   │
│              (Next.js 15 + App Router)                  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTP Requests with Cache Headers
                  ▼
┌─────────────────────────────────────────────────────────┐
│                    CDN Layer (Cloudflare)               │
│             Cache-Control, ETag, Vary Headers           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ Cache Miss / Revalidation
                  ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend API (ops.yesgoddess.agency)    │
│              Next.js API Routes + Middleware            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ Cache Lookup
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Redis Cache (Upstash Serverless)           │
│         Entity Cache, API Cache, Performance Metrics     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ Cache Miss
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Database (PostgreSQL - Neon)               │
└─────────────────────────────────────────────────────────┘
```

### Cache Layers

1. **Browser Cache** (Frontend)
   - Controlled by HTTP headers from backend
   - Automatic through browser
   - No frontend code required

2. **CDN Cache** (Cloudflare)
   - Caches public assets and responses
   - Controlled by `Cache-Control` headers
   - Automatic purging via backend

3. **Redis Cache** (Backend)
   - Entity-level caching (users, creators, brands, projects)
   - API response caching
   - Session data and rate limiting

4. **Database** (PostgreSQL)
   - Source of truth
   - Only hit on cache miss

---

## Cache Types & Strategy

### 1. Entity Caching

**What:** Individual database entities (users, creators, brands, projects, assets, licenses)

**TTL Strategy:**
| Entity Type | TTL | Reasoning |
|-------------|-----|-----------|
| User Profile | 1 hour (3600s) | Frequently accessed, rarely updated |
| Creator Profile | 1 hour (3600s) | High access rate, profile changes infrequent |
| Brand Profile | 1 hour (3600s) | High access rate, profile changes infrequent |
| Project | 30 minutes (1800s) | Moderate access, occasional updates |
| Asset | 30 minutes (1800s) | Moderate access, status changes possible |
| License | 15 minutes (900s) | May change due to status updates |
| Analytics | 5 minutes (300s) | Frequently changing, time-sensitive |
| Session Data | 24 hours (86400s) | Expires with user session |

**Frontend Impact:**
- Data fetched from these endpoints will be cached automatically
- No frontend code changes required
- Cache headers will indicate age and freshness

### 2. API Response Caching

**What:** Complete API responses for GET endpoints

**How It Works:**
1. Backend generates cache key from URL + query params + user ID (if applicable)
2. Returns cached response if available
3. Includes cache headers: `X-Cache: HIT` or `X-Cache: MISS`
4. Supports ETags for conditional requests (304 Not Modified)

**Cache Presets:**

| Preset | TTL | Use Case | Public? | Varies by User? |
|--------|-----|----------|---------|-----------------|
| `SHORT` | 5 min | Frequently changing data | No | Yes |
| `MEDIUM` | 15 min | Moderately stable data | No | Yes |
| `LONG` | 1 hour | Stable data | No | Yes |
| `PUBLIC` | 10 min | Anonymous/public data | Yes | No |
| `ANALYTICS` | 5 min + 1hr SWR | Analytics dashboards | No | Yes |
| `STATIC` | 24 hours | Reference data, config | Yes | No |

**SWR = Stale-While-Revalidate:** Browser can use stale cache while fetching fresh data in background

### 3. CDN Caching

**What:** Static assets and public API responses cached at CDN edge

**Cached Asset Types:**
- Images: 1 year immutable
- Fonts: 1 year immutable
- JS/CSS bundles: 1 year immutable (content-hashed filenames)
- Asset thumbnails: 30 days
- HTML pages: 1 hour with revalidation

**Cache Status Header:**
```
cf-cache-status: HIT | MISS | EXPIRED | STALE | BYPASS | REVALIDATED
```

---

## HTTP Cache Headers

### Headers You'll Receive

#### 1. `Cache-Control`

Controls browser and CDN caching behavior.

**Common Values:**

```http
# Private, user-specific data (5 minutes)
Cache-Control: private, max-age=300

# Public data, CDN cacheable (10 minutes)
Cache-Control: public, max-age=600

# Stale-while-revalidate (5 min cache, 1 hour grace)
Cache-Control: private, max-age=300, stale-while-revalidate=3600

# Never cache
Cache-Control: no-store, no-cache, must-revalidate
```

**Directives Explained:**
- `public`: Response can be cached by CDN and shared caches
- `private`: Response only cached by browser, not shared caches
- `max-age=N`: Cache valid for N seconds
- `stale-while-revalidate=N`: Serve stale cache for N seconds while revalidating
- `must-revalidate`: Must check with server after expiry
- `immutable`: Never changes (static assets with content hashing)

#### 2. `ETag`

Entity tag for conditional requests.

```http
ETag: "abc123def456..."
```

**Usage Pattern:**
1. First request: Server returns `ETag: "abc123"`
2. Subsequent request: Browser sends `If-None-Match: "abc123"`
3. If content unchanged: Server returns `304 Not Modified` (empty body)
4. If content changed: Server returns `200 OK` with new data and ETag

**Benefits:**
- Reduces bandwidth for unchanged resources
- Faster response times (no body transfer)
- Automatic browser handling

#### 3. `X-Cache`

Custom header indicating cache hit/miss (backend Redis cache).

```http
X-Cache: HIT    # Served from Redis cache
X-Cache: MISS   # Fetched fresh from database
```

#### 4. `X-Cache-Time`

Timestamp when response was cached.

```http
X-Cache-Time: 2025-10-19T14:30:00.000Z
```

#### 5. `Vary`

Indicates which request headers affect the cached response.

```http
Vary: Authorization, Accept-Encoding

# Common patterns:
Vary: Authorization              # Different cache per user
Vary: Accept-Encoding            # Different cache per compression
Vary: Authorization, Cookie      # User-specific with session
```

---

## TypeScript Type Definitions

### Cache Response Headers

```typescript
/**
 * Cache-related HTTP headers received from backend
 */
export interface CacheHeaders {
  /** Cache-Control directive */
  'cache-control'?: string;
  
  /** Entity tag for conditional requests */
  etag?: string;
  
  /** Custom cache status (HIT/MISS) */
  'x-cache'?: 'HIT' | 'MISS';
  
  /** When response was cached */
  'x-cache-time'?: string;
  
  /** Cloudflare cache status */
  'cf-cache-status'?: 'HIT' | 'MISS' | 'EXPIRED' | 'STALE' | 'BYPASS' | 'REVALIDATED';
  
  /** Which headers affect cached response */
  vary?: string;
  
  /** Cache expiry date */
  expires?: string;
  
  /** Age of cached response in seconds */
  age?: string;
}

/**
 * Parsed Cache-Control header
 */
export interface ParsedCacheControl {
  public: boolean;
  private: boolean;
  maxAge: number | null;
  staleWhileRevalidate: number | null;
  mustRevalidate: boolean;
  noStore: boolean;
  noCache: boolean;
  immutable: boolean;
}

/**
 * Cache metadata for API responses
 */
export interface CacheMetadata {
  cached: boolean;
  cacheHit: boolean;
  cacheAge?: number; // seconds
  cachedAt?: Date;
  expiresAt?: Date;
  etag?: string;
  cdnCached: boolean;
  cdnStatus?: string;
}
```

### Cache Configuration Types

```typescript
/**
 * Cache configuration for API client
 */
export interface CacheConfig {
  /** Enable caching for this request */
  enabled: boolean;
  
  /** Time-to-live in seconds (client-side) */
  ttl?: number;
  
  /** Respect backend cache headers */
  useBackendHeaders?: boolean;
  
  /** Enable ETag conditional requests */
  useEtags?: boolean;
  
  /** Cache key override */
  cacheKey?: string;
  
  /** Cache invalidation tags */
  tags?: string[];
}

/**
 * Cache preset configurations
 */
export enum CachePreset {
  /** No caching */
  NONE = 'none',
  
  /** Short-lived cache (5 minutes) */
  SHORT = 'short',
  
  /** Medium cache (15 minutes) */
  MEDIUM = 'medium',
  
  /** Long cache (1 hour) */
  LONG = 'long',
  
  /** Static/reference data (24 hours) */
  STATIC = 'static',
  
  /** Use backend headers only */
  AUTO = 'auto',
}
```

### Cache Stats Types

```typescript
/**
 * Cache performance metrics
 */
export interface CachePerformanceMetrics {
  timestamp: string;
  hitRate: number; // 0-100
  missRate: number; // 0-100
  totalRequests: number;
  hits: number;
  misses: number;
  averageLatency: number; // milliseconds
  memoryUsage: {
    used: string; // "10.5 MB"
    percentage?: number; // 0-100
  };
  keyCount: number;
  evictionCount: number;
}

/**
 * Cache health status
 */
export interface CacheHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number; // milliseconds
  memoryUsagePercent?: number;
  hitRate?: number;
  details: {
    memory: string;
    connections: number;
    keyspace: number;
  };
  issues: string[];
}
```

---

## Frontend Implementation Patterns

### 1. React Query Integration

**Recommended:** Use React Query to handle caching at the application level, while respecting backend cache headers.

```typescript
// lib/api-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Respect backend cache headers
      staleTime: 5 * 60 * 1000, // 5 minutes default
      
      // Enable refetch on window focus for fresh data
      refetchOnWindowFocus: true,
      
      // Retry failed requests
      retry: 2,
      
      // Use ETags for conditional requests
      refetchOnMount: 'always',
    },
  },
});

/**
 * Extract cache metadata from response headers
 */
export function extractCacheMetadata(headers: Headers): CacheMetadata {
  const cacheControl = headers.get('cache-control');
  const xCache = headers.get('x-cache');
  const xCacheTime = headers.get('x-cache-time');
  const cfCacheStatus = headers.get('cf-cache-status');
  const etag = headers.get('etag');
  const age = headers.get('age');

  return {
    cached: xCache === 'HIT',
    cacheHit: xCache === 'HIT',
    cacheAge: age ? parseInt(age, 10) : undefined,
    cachedAt: xCacheTime ? new Date(xCacheTime) : undefined,
    expiresAt: calculateExpiry(cacheControl, xCacheTime),
    etag: etag || undefined,
    cdnCached: cfCacheStatus === 'HIT',
    cdnStatus: cfCacheStatus || undefined,
  };
}

/**
 * Calculate cache expiry from headers
 */
function calculateExpiry(
  cacheControl: string | null,
  cachedTime: string | null
): Date | undefined {
  if (!cacheControl || !cachedTime) return undefined;

  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  if (!maxAgeMatch) return undefined;

  const maxAge = parseInt(maxAgeMatch[1], 10);
  const cached = new Date(cachedTime);
  
  return new Date(cached.getTime() + maxAge * 1000);
}

/**
 * Parse Cache-Control header
 */
export function parseCacheControl(header: string | null): ParsedCacheControl {
  if (!header) {
    return {
      public: false,
      private: false,
      maxAge: null,
      staleWhileRevalidate: null,
      mustRevalidate: false,
      noStore: false,
      noCache: false,
      immutable: false,
    };
  }

  const directives = header.toLowerCase().split(',').map(d => d.trim());

  const maxAgeMatch = directives.find(d => d.startsWith('max-age='));
  const swrMatch = directives.find(d => d.startsWith('stale-while-revalidate='));

  return {
    public: directives.includes('public'),
    private: directives.includes('private'),
    maxAge: maxAgeMatch ? parseInt(maxAgeMatch.split('=')[1], 10) : null,
    staleWhileRevalidate: swrMatch ? parseInt(swrMatch.split('=')[1], 10) : null,
    mustRevalidate: directives.includes('must-revalidate'),
    noStore: directives.includes('no-store'),
    noCache: directives.includes('no-cache'),
    immutable: directives.includes('immutable'),
  };
}
```

### 2. Fetch with ETag Support

```typescript
// lib/fetch-with-cache.ts

interface CachedResponse<T> {
  data: T;
  etag?: string;
  cachedAt: Date;
}

const etagCache = new Map<string, CachedResponse<any>>();

/**
 * Fetch with automatic ETag conditional request support
 */
export async function fetchWithETag<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T; metadata: CacheMetadata }> {
  const cached = etagCache.get(url);
  const headers = new Headers(options.headers);

  // Add If-None-Match header if we have cached ETag
  if (cached?.etag) {
    headers.set('If-None-Match', cached.etag);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const metadata = extractCacheMetadata(response.headers);

  // 304 Not Modified - use cached data
  if (response.status === 304 && cached) {
    return {
      data: cached.data,
      metadata: {
        ...metadata,
        cached: true,
        cacheHit: true,
      },
    };
  }

  // Parse response
  const data = await response.json();

  // Cache with ETag if provided
  const etag = response.headers.get('etag');
  if (etag) {
    etagCache.set(url, {
      data,
      etag,
      cachedAt: new Date(),
    });
  }

  return { data, metadata };
}

/**
 * Clear ETag cache for specific URL or pattern
 */
export function clearETagCache(urlPattern?: string | RegExp): void {
  if (!urlPattern) {
    etagCache.clear();
    return;
  }

  const pattern = typeof urlPattern === 'string' 
    ? new RegExp(urlPattern) 
    : urlPattern;

  for (const [url] of etagCache) {
    if (pattern.test(url)) {
      etagCache.delete(url);
    }
  }
}
```

### 3. Cache-Aware API Client

```typescript
// lib/api-client-with-cache.ts

export interface ApiResponse<T> {
  data: T;
  cache: CacheMetadata;
  headers: Headers;
}

export class CachedApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor(baseUrl: string, defaultHeaders: HeadersInit = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
  }

  /**
   * GET request with automatic cache handling
   */
  async get<T>(
    endpoint: string,
    options: {
      query?: Record<string, any>;
      headers?: HeadersInit;
      cache?: CacheConfig;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options.query);
    const headers = new Headers({
      ...this.defaultHeaders,
      ...options.headers,
    });

    // Get cached ETag if available
    const cached = etagCache.get(url);
    if (cached?.etag && options.cache?.useEtags !== false) {
      headers.set('If-None-Match', cached.etag);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      // Let browser handle cache based on headers
      cache: options.cache?.enabled === false ? 'no-store' : 'default',
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const metadata = extractCacheMetadata(response.headers);

    // Handle 304 Not Modified
    if (response.status === 304 && cached) {
      return {
        data: cached.data,
        cache: {
          ...metadata,
          cached: true,
          cacheHit: true,
        },
        headers: response.headers,
      };
    }

    const data = await response.json();

    // Store ETag
    const etag = response.headers.get('etag');
    if (etag) {
      etagCache.set(url, { data, etag, cachedAt: new Date() });
    }

    return {
      data,
      cache: metadata,
      headers: response.headers,
    };
  }

  /**
   * POST/PUT/DELETE invalidate cache
   */
  async post<T>(
    endpoint: string,
    body?: any,
    options: { headers?: HeadersInit } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    
    // Clear related cache entries
    this.invalidateCache(endpoint);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.defaultHeaders,
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const metadata = extractCacheMetadata(response.headers);

    return { data, cache: metadata, headers: response.headers };
  }

  private buildUrl(endpoint: string, query?: Record<string, any>): string {
    const url = new URL(endpoint, this.baseUrl);
    
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private invalidateCache(endpoint: string): void {
    // Clear ETags for this endpoint and related endpoints
    const pattern = new RegExp(`${endpoint.split('?')[0]}`);
    clearETagCache(pattern);
  }
}

// Export singleton instance
export const apiClient = new CachedApiClient(
  process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency',
  {
    'Content-Type': 'application/json',
  }
);
```

---

**Continue to [Part 2: API Endpoints & Integration](./FRONTEND_INTEGRATION_CACHING_PART_2.md)** for:
- Complete API endpoint documentation
- Request/response examples
- Error handling
- Rate limiting
- Implementation checklist
