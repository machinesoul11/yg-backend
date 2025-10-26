/**
 * Permission Cache Service
 * Manages caching and invalidation of user permissions
 * 
 * Cache Strategy:
 * - 15-minute TTL for permission sets
 * - Cache key format: permissions:${userId}
 * - Automatic invalidation on role changes
 * - Cache warming for frequently accessed users
 * - Metrics tracking for cache performance
 */

import { getRedisClient } from '@/lib/redis/client';
import { RedisKeys, RedisTTL } from '@/lib/redis/keys';
import { Permission } from '@/lib/constants/permissions';
import { PermissionCacheError, PermissionErrors } from '@/lib/errors/permission.errors';

/**
 * Permission cache entry structure
 */
export interface PermissionCacheEntry {
  userId: string;
  permissions: Permission[];
  cachedAt: number;
  expiresAt: number;
}

/**
 * Cache metrics for monitoring
 */
export interface PermissionCacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  avgLoadTime: number;
  errors: number;
}

export class PermissionCacheService {
  private redis = getRedisClient();
  private readonly CACHE_TTL = RedisTTL.PERMISSIONS; // 15 minutes
  private readonly METRICS_KEY = 'metrics:permission-cache';
  private readonly WARMING_SET_KEY = 'cache-warming:permissions';

  /**
   * Get cached permissions for a user
   * @param userId - User ID
   * @returns Cached permissions or null if not found/expired
   */
  async get(userId: string): Promise<Permission[] | null> {
    try {
      const cacheKey = RedisKeys.cache.permissions(userId);
      const cached = await this.redis.get(cacheKey);

      if (!cached) {
        await this.incrementMetric('misses');
        return null;
      }

      const entry: PermissionCacheEntry = JSON.parse(cached);
      
      // Verify entry hasn't expired (defense in depth)
      if (entry.expiresAt < Date.now()) {
        await this.delete(userId);
        await this.incrementMetric('misses');
        return null;
      }

      await this.incrementMetric('hits');
      return entry.permissions;
    } catch (error) {
      await this.incrementMetric('errors');
      console.error('[PermissionCache] Error retrieving cached permissions:', error);
      // Don't throw - treat cache errors as cache miss
      return null;
    }
  }

  /**
   * Cache permissions for a user
   * @param userId - User ID
   * @param permissions - Permission array to cache
   */
  async set(userId: string, permissions: Permission[]): Promise<void> {
    try {
      const cacheKey = RedisKeys.cache.permissions(userId);
      const now = Date.now();
      
      const entry: PermissionCacheEntry = {
        userId,
        permissions,
        cachedAt: now,
        expiresAt: now + (this.CACHE_TTL * 1000),
      };

      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(entry)
      );

      // Track this user for potential cache warming
      await this.addToWarmingSet(userId);
    } catch (error) {
      await this.incrementMetric('errors');
      console.error('[PermissionCache] Error caching permissions:', error);
      // Don't throw - cache write failures should not break permission loading
      throw PermissionErrors.CACHE_WRITE_FAILED('set permissions', error as Error);
    }
  }

  /**
   * Delete cached permissions for a user
   * Called during cache invalidation
   * @param userId - User ID
   */
  async delete(userId: string): Promise<void> {
    try {
      const cacheKey = RedisKeys.cache.permissions(userId);
      await this.redis.del(cacheKey);
    } catch (error) {
      await this.incrementMetric('errors');
      console.error('[PermissionCache] Error deleting cached permissions:', error);
      throw PermissionErrors.CACHE_INVALIDATION_FAILED('delete permissions', error as Error);
    }
  }

  /**
   * Invalidate permissions cache for a user
   * Use this when user roles or admin roles change
   * @param userId - User ID
   */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.delete(userId);
      
      // Also invalidate admin role cache if exists
      const adminRoleKey = RedisKeys.cache.adminRole(userId);
      await this.redis.del(adminRoleKey);

      console.log(`[PermissionCache] Invalidated cache for user ${userId}`);
    } catch (error) {
      await this.incrementMetric('errors');
      console.error('[PermissionCache] Error invalidating cache:', error);
      // Still throw - invalidation failures are important to track
      throw PermissionErrors.CACHE_INVALIDATION_FAILED('invalidate', error as Error);
    }
  }

  /**
   * Invalidate permissions cache for multiple users
   * @param userIds - Array of user IDs
   */
  async invalidateMany(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    try {
      const permissionKeys = userIds.map(id => RedisKeys.cache.permissions(id));
      const adminRoleKeys = userIds.map(id => RedisKeys.cache.adminRole(id));
      const allKeys = [...permissionKeys, ...adminRoleKeys];

      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
      }

      console.log(`[PermissionCache] Invalidated cache for ${userIds.length} users`);
    } catch (error) {
      await this.incrementMetric('errors');
      console.error('[PermissionCache] Error invalidating multiple caches:', error);
      throw PermissionErrors.CACHE_INVALIDATION_FAILED('invalidate many', error as Error);
    }
  }

  /**
   * Check if permissions are cached for a user
   * @param userId - User ID
   */
  async exists(userId: string): Promise<boolean> {
    try {
      const cacheKey = RedisKeys.cache.permissions(userId);
      const result = await this.redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      console.error('[PermissionCache] Error checking cache existence:', error);
      return false;
    }
  }

  /**
   * Get TTL remaining for cached permissions
   * @param userId - User ID
   * @returns TTL in seconds, -2 if not exists, -1 if no expiry
   */
  async getTTL(userId: string): Promise<number> {
    try {
      const cacheKey = RedisKeys.cache.permissions(userId);
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      console.error('[PermissionCache] Error getting TTL:', error);
      return -2;
    }
  }

  /**
   * Add user to cache warming set
   * Tracks frequently accessed users for proactive cache warming
   * @private
   */
  private async addToWarmingSet(userId: string): Promise<void> {
    try {
      // Use sorted set with score as timestamp
      await this.redis.zadd(
        this.WARMING_SET_KEY,
        Date.now(),
        userId
      );

      // Keep only last 1000 accessed users
      await this.redis.zremrangebyrank(this.WARMING_SET_KEY, 0, -1001);
    } catch (error) {
      // Non-critical, just log
      console.error('[PermissionCache] Error adding to warming set:', error);
    }
  }

  /**
   * Get frequently accessed users for cache warming
   * @param limit - Number of users to return
   */
  async getFrequentUsers(limit: number = 100): Promise<string[]> {
    try {
      // Get most recently accessed users
      return await this.redis.zrevrange(
        this.WARMING_SET_KEY,
        0,
        limit - 1
      );
    } catch (error) {
      console.error('[PermissionCache] Error getting frequent users:', error);
      return [];
    }
  }

  /**
   * Increment a metric counter
   * @private
   */
  private async incrementMetric(metric: 'hits' | 'misses' | 'errors'): Promise<void> {
    try {
      const key = `${this.METRICS_KEY}:${metric}`;
      await this.redis.incr(key);
      // Set TTL for metrics (24 hours)
      await this.redis.expire(key, 86400);
    } catch (error) {
      // Non-critical, just log
      console.error('[PermissionCache] Error incrementing metric:', error);
    }
  }

  /**
   * Get cache performance metrics
   */
  async getMetrics(): Promise<PermissionCacheMetrics> {
    try {
      const [hits, misses, errors] = await Promise.all([
        this.redis.get(`${this.METRICS_KEY}:hits`),
        this.redis.get(`${this.METRICS_KEY}:misses`),
        this.redis.get(`${this.METRICS_KEY}:errors`),
      ]);

      const hitsNum = parseInt(hits || '0');
      const missesNum = parseInt(misses || '0');
      const errorsNum = parseInt(errors || '0');
      const total = hitsNum + missesNum;
      const hitRate = total > 0 ? (hitsNum / total) * 100 : 0;

      // Count total permission cache keys
      const permissionKeys = await this.redis.keys('permissions:*');
      const totalKeys = permissionKeys.length;

      return {
        hits: hitsNum,
        misses: missesNum,
        hitRate: Math.round(hitRate * 100) / 100,
        totalKeys,
        avgLoadTime: 0, // TODO: Track load times
        errors: errorsNum,
      };
    } catch (error) {
      console.error('[PermissionCache] Error getting metrics:', error);
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalKeys: 0,
        avgLoadTime: 0,
        errors: 0,
      };
    }
  }

  /**
   * Reset all metrics
   * Useful for testing or periodic resets
   */
  async resetMetrics(): Promise<void> {
    try {
      await this.redis.del(
        `${this.METRICS_KEY}:hits`,
        `${this.METRICS_KEY}:misses`,
        `${this.METRICS_KEY}:errors`
      );
    } catch (error) {
      console.error('[PermissionCache] Error resetting metrics:', error);
    }
  }

  /**
   * Clear all permission caches
   * WARNING: Use with caution - forces all users to reload permissions
   */
  async clearAll(): Promise<number> {
    try {
      const keys = await this.redis.keys('permissions:*');
      if (keys.length === 0) return 0;

      await this.redis.del(...keys);
      console.log(`[PermissionCache] Cleared ${keys.length} permission caches`);
      return keys.length;
    } catch (error) {
      console.error('[PermissionCache] Error clearing all caches:', error);
      throw PermissionErrors.CACHE_INVALIDATION_FAILED('clear all', error as Error);
    }
  }
}

// Export singleton instance
export const permissionCacheService = new PermissionCacheService();
