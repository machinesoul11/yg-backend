/**
 * Redis Module - Central export point
 * 
 * This module provides:
 * - Redis client with connection pooling
 * - Cache service for data caching
 * - Rate limiting functionality
 * - Distributed locking for critical operations
 * - Monitoring and health checks
 * - Key naming conventions and TTL strategies
 */

export { getRedisClient, closeRedisClient, checkRedisHealth } from './client';
export { RedisKeys, RedisTTL, buildKeyPattern } from './keys';
export { CacheService, cacheService } from './cache.service';
export { RateLimiter, rateLimiter } from './rate-limiter';
export type { RateLimitAction, RateLimitResult, RateLimitConfig } from './rate-limiter';
export { DistributedLock, distributedLock } from './distributed-lock';
export type { LockOptions, LockResult } from './distributed-lock';
export { RedisMonitor, redisMonitor } from './monitoring';
export type { RedisMetrics, RedisHealthStatus } from './monitoring';

// Re-import for default export
import { getRedisClient } from './client';

// Export lazy-loaded redis client for convenience (don't connect until used)
// This prevents connection errors during module import in serverless environments
let _redisClient: ReturnType<typeof getRedisClient> | null = null;
export const redis = new Proxy({} as ReturnType<typeof getRedisClient>, {
  get(target, prop) {
    if (!_redisClient) {
      _redisClient = getRedisClient();
    }
    return (_redisClient as any)[prop];
  }
});
