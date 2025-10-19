/**
 * API Response Caching Middleware
 * 
 * Implements intelligent caching for GET endpoints with:
 * - Cache-Control headers
 * - ETag support
 * - User-scoped caching
 * - Conditional requests (304 Not Modified)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cacheService } from '@/lib/redis/cache.service';
import { createHash } from 'crypto';

export interface CacheConfig {
  /**
   * Time-to-live in seconds
   */
  ttl: number;

  /**
   * Whether this endpoint's response varies by user
   */
  variesByUser?: boolean;

  /**
   * Whether this is publicly cacheable (allows CDN caching)
   */
  public?: boolean;

  /**
   * Custom cache key generator
   */
  keyGenerator?: (req: NextRequest, userId?: string) => string;

  /**
   * Whether to enable stale-while-revalidate
   */
  staleWhileRevalidate?: number;

  /**
   * Skip caching based on custom logic
   */
  shouldSkipCache?: (req: NextRequest) => boolean;
}

/**
 * Generate cache key from request
 */
function generateCacheKey(
  req: NextRequest,
  userId?: string,
  customGenerator?: (req: NextRequest, userId?: string) => string
): string {
  if (customGenerator) {
    return customGenerator(req, userId);
  }

  const url = new URL(req.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // Sort search params for consistent cache keys
  const sortedParams = Array.from(searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const baseKey = `api:response:${pathname}${sortedParams ? `?${sortedParams}` : ''}`;
  
  // Include user ID in cache key if request varies by user
  return userId ? `${baseKey}:user:${userId}` : baseKey;
}

/**
 * Generate ETag from content
 */
function generateETag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Check if request includes conditional headers
 */
function checkConditionalRequest(
  req: NextRequest,
  etag: string
): boolean {
  const ifNoneMatch = req.headers.get('if-none-match');
  return ifNoneMatch === etag;
}

/**
 * Build Cache-Control header value
 */
function buildCacheControlHeader(config: CacheConfig): string {
  const directives: string[] = [];

  // Public vs Private
  directives.push(config.public ? 'public' : 'private');

  // Max-Age
  directives.push(`max-age=${config.ttl}`);

  // Stale-While-Revalidate
  if (config.staleWhileRevalidate) {
    directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }

  return directives.join(', ');
}

/**
 * Cache middleware factory
 * 
 * Usage:
 * ```ts
 * export const GET = withCache(
 *   async (req: NextRequest) => {
 *     // Your handler
 *   },
 *   { ttl: 300, public: false, variesByUser: true }
 * );
 * ```
 */
export function withCache(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  config: CacheConfig
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return handler(req, context);
    }

    // Check if caching should be skipped
    if (config.shouldSkipCache?.(req)) {
      return handler(req, context);
    }

    try {
      // Get user session if response varies by user
      let userId: string | undefined;
      if (config.variesByUser) {
        const session = await getServerSession();
        userId = session?.user?.id;
      }

      // Generate cache key
      const cacheKey = generateCacheKey(req, userId, config.keyGenerator);

      // Try to get from cache
      const cached = await cacheService.get<{
        body: any;
        headers: Record<string, string>;
        etag: string;
        timestamp: number;
      }>(cacheKey);

      if (cached) {
        // Check conditional request
        if (checkConditionalRequest(req, cached.etag)) {
          return new NextResponse(null, {
            status: 304,
            headers: {
              'Cache-Control': buildCacheControlHeader(config),
              'ETag': cached.etag,
              'X-Cache': 'HIT',
              'X-Cache-Time': new Date(cached.timestamp).toISOString(),
            },
          });
        }

        // Return cached response
        return NextResponse.json(cached.body, {
          status: 200,
          headers: {
            ...cached.headers,
            'Cache-Control': buildCacheControlHeader(config),
            'ETag': cached.etag,
            'X-Cache': 'HIT',
            'X-Cache-Time': new Date(cached.timestamp).toISOString(),
          },
        });
      }

      // Cache miss - execute handler
      const response = await handler(req, context);

      // Only cache successful responses
      if (response.status === 200) {
        const body = await response.clone().json();
        const bodyString = JSON.stringify(body);
        const etag = generateETag(bodyString);

        // Store in cache
        const cacheData = {
          body,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
          },
          etag,
          timestamp: Date.now(),
        };

        await cacheService.set(cacheKey, cacheData, config.ttl);

        // Add cache headers to response
        return NextResponse.json(body, {
          status: 200,
          headers: {
            'Cache-Control': buildCacheControlHeader(config),
            'ETag': etag,
            'X-Cache': 'MISS',
          },
        });
      }

      return response;
    } catch (error) {
      console.error('[API Cache Middleware] Error:', error);
      // On error, fall back to executing handler without caching
      return handler(req, context);
    }
  };
}

/**
 * Cache invalidation helper for API routes
 */
export async function invalidateApiCache(
  pattern: string
): Promise<number> {
  try {
    const fullPattern = `api:response:${pattern}`;
    return await cacheService.deletePattern(fullPattern);
  } catch (error) {
    console.error('[API Cache] Error invalidating cache:', error);
    return 0;
  }
}

/**
 * Predefined cache configurations for common use cases
 */
export const CachePresets = {
  /**
   * Short-lived cache for frequently changing data (5 minutes)
   */
  SHORT: {
    ttl: 300,
    public: false,
    variesByUser: true,
  } as CacheConfig,

  /**
   * Medium cache for moderately stable data (15 minutes)
   */
  MEDIUM: {
    ttl: 900,
    public: false,
    variesByUser: true,
  } as CacheConfig,

  /**
   * Long cache for stable data (1 hour)
   */
  LONG: {
    ttl: 3600,
    public: false,
    variesByUser: true,
  } as CacheConfig,

  /**
   * Public cache for anonymous data that can be CDN cached (10 minutes)
   */
  PUBLIC: {
    ttl: 600,
    public: true,
    variesByUser: false,
  } as CacheConfig,

  /**
   * Analytics cache with stale-while-revalidate (5 minutes, revalidate for 1 hour)
   */
  ANALYTICS: {
    ttl: 300,
    public: false,
    variesByUser: true,
    staleWhileRevalidate: 3600,
  } as CacheConfig,

  /**
   * Static reference data cache (24 hours)
   */
  STATIC: {
    ttl: 86400,
    public: true,
    variesByUser: false,
  } as CacheConfig,
};
