import { getRedisClient } from './client';
import { RedisKeys, RedisTTL } from './keys';

export class CacheService {
  private redis = getRedisClient();

  /**
   * Get cached value with type safety
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error(`[Cache] Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set cache value without TTL (use with caution)
   */
  async setPermanent<T>(key: string, value: T): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[Cache] Error setting permanent key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete single key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`[Cache] Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      await this.redis.del(...keys);
    } catch (error) {
      console.error(`[Cache] Error deleting multiple keys:`, error);
      throw error;
    }
  }

  /**
   * Delete all keys matching a pattern
   * WARNING: Use with caution, can be slow with many keys
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;

      await this.redis.del(...keys);
      return keys.length;
    } catch (error) {
      console.error(`[Cache] Error deleting pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[Cache] Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`[Cache] Error getting TTL for key ${key}:`, error);
      return -2; // Key doesn't exist
    }
  }

  /**
   * Increment counter (atomic operation)
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      console.error(`[Cache] Error incrementing key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Decrement counter (atomic operation)
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(key, amount);
    } catch (error) {
      console.error(`[Cache] Error decrementing key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   */
  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    try {
      const values = await this.redis.mget(...keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      console.error(`[Cache] Error getting multiple keys:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async setMany<T>(entries: Array<{ key: string; value: T; ttl: number }>): Promise<void> {
    if (entries.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      for (const { key, value, ttl } of entries) {
        pipeline.setex(key, ttl, JSON.stringify(value));
      }

      await pipeline.exec();
    } catch (error) {
      console.error(`[Cache] Error setting multiple keys:`, error);
      throw error;
    }
  }

  // ============= Entity-Specific Cache Invalidation =============

  /**
   * Invalidate user and all related entities
   */
  async invalidateUser(userId: string): Promise<void> {
    const keys = [
      RedisKeys.cache.user(userId),
      RedisKeys.session.onboarding(userId),
      RedisKeys.session.verification(userId),
    ];

    await this.deleteMany(keys);
    await this.deletePattern(`cache:creator:${userId}*`);
    await this.deletePattern(`cache:brand:${userId}*`);
  }

  /**
   * Invalidate creator profile and related data
   */
  async invalidateCreator(creatorId: string): Promise<void> {
    const keys = [
      RedisKeys.cache.creator(creatorId),
      RedisKeys.cache.creatorAssets(creatorId),
    ];

    await this.deleteMany(keys);
    await this.deletePattern(`cache:asset:creator:${creatorId}*`);
    await this.deletePattern(`cache:license:creator:${creatorId}*`);
  }

  /**
   * Invalidate brand profile and related data
   */
  async invalidateBrand(brandId: string): Promise<void> {
    const keys = [
      RedisKeys.cache.brand(brandId),
      RedisKeys.cache.brandLicenses(brandId),
    ];

    await this.deleteMany(keys);
    await this.deletePattern(`cache:license:brand:${brandId}*`);
  }

  /**
   * Invalidate project and all related assets/licenses
   */
  async invalidateProject(projectId: string): Promise<void> {
    const keys = [
      RedisKeys.cache.project(projectId),
      RedisKeys.cache.projectAssets(projectId),
    ];

    await this.deleteMany(keys);
    await this.deletePattern(`cache:asset:project:${projectId}*`);
    await this.deletePattern(`cache:license:project:${projectId}*`);
  }

  /**
   * Invalidate asset cache
   */
  async invalidateAsset(assetId: string): Promise<void> {
    await this.delete(RedisKeys.cache.asset(assetId));
  }

  /**
   * Invalidate license cache
   */
  async invalidateLicense(licenseId: string): Promise<void> {
    await this.delete(RedisKeys.cache.license(licenseId));
  }

  /**
   * Invalidate analytics cache
   */
  async invalidateAnalytics(key?: string): Promise<void> {
    if (key) {
      await this.delete(RedisKeys.cache.analytics(key));
    } else {
      await this.deletePattern('cache:analytics:*');
    }
  }

  // ============= Cache Warming =============

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached) return cached;

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache (don't await to avoid blocking)
    this.set(key, data, ttl).catch((err) => {
      console.error(`[Cache] Error warming cache for key ${key}:`, err);
    });

    return data;
  }

  // ============= Utility Methods =============

  /**
   * Get all keys matching a pattern (use sparingly)
   */
  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      console.error(`[Cache] Error getting keys by pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsed: string;
    hitRate?: number;
  }> {
    try {
      const info = await this.redis.info('stats');
      const memory = await this.redis.info('memory');
      const dbsize = await this.redis.dbsize();

      // Parse memory info
      const memoryMatch = memory.match(/used_memory_human:(.+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      // Parse hit rate
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);

      let hitRate: number | undefined;
      if (hitsMatch && missesMatch) {
        const hits = parseInt(hitsMatch[1]);
        const misses = parseInt(missesMatch[1]);
        const total = hits + misses;
        hitRate = total > 0 ? (hits / total) * 100 : undefined;
      }

      return {
        totalKeys: dbsize,
        memoryUsed,
        hitRate,
      };
    } catch (error) {
      console.error('[Cache] Error getting stats:', error);
      return {
        totalKeys: 0,
        memoryUsed: 'unknown',
      };
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
