/**
 * Metrics Cache Service
 * Multi-tiered caching strategy for metrics data
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

interface CacheOptions {
  ttl?: number; // TTL in seconds
  refreshInterval?: number; // Auto-refresh interval in seconds
  warmCache?: boolean; // Whether to warm cache on miss
}

interface MetricsCacheEntry {
  value: any;
  cachedAt: number;
  expiresAt: number;
}

export class MetricsCacheService {
  private readonly CACHE_PREFIX = 'metrics:cache:';
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly SHORT_TTL = 60; // 1 minute for current metrics
  private readonly LONG_TTL = 3600; // 1 hour for historical metrics

  constructor(
    private redis: Redis,
    private prisma: PrismaClient
  ) {}

  /**
   * Get cached metric with automatic cache warming
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = this.DEFAULT_TTL, warmCache = true } = options;
    const fullKey = this.buildCacheKey(key);

    try {
      // Try to get from Redis
      const cached = await this.redis.get(fullKey);

      if (cached) {
        const entry: MetricsCacheEntry = JSON.parse(cached);

        // Check if still valid
        if (Date.now() < entry.expiresAt) {
          return entry.value as T;
        }
      }

      // Cache miss or expired - fetch fresh data
      const value = await fetchFn();

      // Store in cache
      if (warmCache) {
        await this.set(key, value, { ttl });
      }

      return value;
    } catch (error) {
      console.error(`[MetricsCache] Error getting cache key ${key}:`, error);
      
      // On error, try to fetch fresh data directly
      return await fetchFn();
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const { ttl = this.DEFAULT_TTL } = options;
    const fullKey = this.buildCacheKey(key);

    try {
      const entry: MetricsCacheEntry = {
        value,
        cachedAt: Date.now(),
        expiresAt: Date.now() + ttl * 1000,
      };

      await this.redis.setex(fullKey, ttl, JSON.stringify(entry));
    } catch (error) {
      console.error(`[MetricsCache] Error setting cache key ${key}:`, error);
    }
  }

  /**
   * Invalidate cache by key pattern
   */
  async invalidate(keyPattern: string): Promise<number> {
    try {
      const fullPattern = this.buildCacheKey(keyPattern);
      const keys = await this.redis.keys(fullPattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      console.log(`[MetricsCache] Invalidated ${deleted} cache keys matching ${keyPattern}`);
      
      return deleted;
    } catch (error) {
      console.error(`[MetricsCache] Error invalidating ${keyPattern}:`, error);
      return 0;
    }
  }

  /**
   * Warm cache for common queries
   */
  async warmCache(cacheWarmers: Array<{ key: string; fetchFn: () => Promise<any>; ttl?: number }>): Promise<void> {
    console.log(`[MetricsCache] Warming cache with ${cacheWarmers.length} entries`);

    const promises = cacheWarmers.map(async ({ key, fetchFn, ttl }) => {
      try {
        const value = await fetchFn();
        await this.set(key, value, { ttl });
      } catch (error) {
        console.error(`[MetricsCache] Error warming cache for ${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log('[MetricsCache] Cache warming completed');
  }

  /**
   * Get cache for daily metrics
   */
  async getDailyMetricsCache(
    date: string,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ) {
    const cacheKey = this.buildDailyMetricsCacheKey(date, projectId, ipAssetId, licenseId);

    return await this.get(
      cacheKey,
      async () => {
        return await this.prisma.dailyMetric.findMany({
          where: {
            date: new Date(date),
            ...(projectId && { projectId }),
            ...(ipAssetId && { ipAssetId }),
            ...(licenseId && { licenseId }),
          },
        });
      },
      { ttl: this.LONG_TTL } // Historical data - cache for 1 hour
    );
  }

  /**
   * Get cache for weekly metrics
   */
  async getWeeklyMetricsCache(
    weekStart: string,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ) {
    const cacheKey = this.buildWeeklyMetricsCacheKey(weekStart, projectId, ipAssetId, licenseId);

    return await this.get(
      cacheKey,
      async () => {
        return await this.prisma.weeklyMetric.findMany({
          where: {
            weekStartDate: new Date(weekStart),
            ...(projectId && { projectId }),
            ...(ipAssetId && { ipAssetId }),
            ...(licenseId && { licenseId }),
          },
        });
      },
      { ttl: this.LONG_TTL }
    );
  }

  /**
   * Get cache for monthly metrics
   */
  async getMonthlyMetricsCache(
    year: number,
    month: number,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ) {
    const cacheKey = this.buildMonthlyMetricsCacheKey(year, month, projectId, ipAssetId, licenseId);

    return await this.get(
      cacheKey,
      async () => {
        return await this.prisma.monthlyMetric.findMany({
          where: {
            year,
            month,
            ...(projectId && { projectId }),
            ...(ipAssetId && { ipAssetId }),
            ...(licenseId && { licenseId }),
          },
        });
      },
      { ttl: this.LONG_TTL }
    );
  }

  /**
   * Invalidate daily metrics cache
   */
  async invalidateDailyMetrics(date: string): Promise<void> {
    const pattern = this.buildDailyMetricsCacheKey(date, '*', '*', '*');
    await this.invalidate(pattern);
  }

  /**
   * Invalidate weekly metrics cache
   */
  async invalidateWeeklyMetrics(weekStart: string): Promise<void> {
    const pattern = this.buildWeeklyMetricsCacheKey(weekStart, '*', '*', '*');
    await this.invalidate(pattern);
  }

  /**
   * Invalidate monthly metrics cache
   */
  async invalidateMonthlyMetrics(year: number, month: number): Promise<void> {
    const pattern = this.buildMonthlyMetricsCacheKey(year, month, '*', '*', '*');
    await this.invalidate(pattern);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const info = await this.redis.info('stats');
      const keyspace = await this.redis.info('keyspace');

      // Parse Redis INFO output
      const parseInfo = (infoStr: string) => {
        const stats: Record<string, string> = {};
        infoStr.split('\r\n').forEach((line) => {
          if (line && !line.startsWith('#')) {
            const [key, value] = line.split(':');
            if (key && value) {
              stats[key] = value;
            }
          }
        });
        return stats;
      };

      const stats = parseInfo(info);
      const keyspaceStats = parseInfo(keyspace);

      // Count metrics cache keys
      const metricsKeys = await this.redis.keys(`${this.CACHE_PREFIX}*`);

      return {
        totalKeys: metricsKeys.length,
        memoryUsed: stats.used_memory_human,
        hits: parseInt(stats.keyspace_hits || '0'),
        misses: parseInt(stats.keyspace_misses || '0'),
        hitRate: stats.keyspace_hits && stats.keyspace_misses
          ? (parseInt(stats.keyspace_hits) / 
             (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%'
          : 'N/A',
        evictedKeys: parseInt(stats.evicted_keys || '0'),
      };
    } catch (error) {
      console.error('[MetricsCache] Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Clear all metrics cache
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[MetricsCache] Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      console.error('[MetricsCache] Error clearing cache:', error);
    }
  }

  /**
   * Private helper: Build cache key
   */
  private buildCacheKey(key: string): string {
    return `${this.CACHE_PREFIX}${key}`;
  }

  /**
   * Private helper: Build daily metrics cache key
   */
  private buildDailyMetricsCacheKey(
    date: string,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ): string {
    const parts = ['daily', date];
    if (projectId) parts.push(`project:${projectId}`);
    if (ipAssetId) parts.push(`asset:${ipAssetId}`);
    if (licenseId) parts.push(`license:${licenseId}`);
    return parts.join(':');
  }

  /**
   * Private helper: Build weekly metrics cache key
   */
  private buildWeeklyMetricsCacheKey(
    weekStart: string,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ): string {
    const parts = ['weekly', weekStart];
    if (projectId) parts.push(`project:${projectId}`);
    if (ipAssetId) parts.push(`asset:${ipAssetId}`);
    if (licenseId) parts.push(`license:${licenseId}`);
    return parts.join(':');
  }

  /**
   * Private helper: Build monthly metrics cache key
   */
  private buildMonthlyMetricsCacheKey(
    year: number,
    month: number,
    projectId?: string,
    ipAssetId?: string,
    licenseId?: string
  ): string {
    const parts = ['monthly', year.toString(), month.toString().padStart(2, '0')];
    if (projectId) parts.push(`project:${projectId}`);
    if (ipAssetId) parts.push(`asset:${ipAssetId}`);
    if (licenseId) parts.push(`license:${licenseId}`);
    return parts.join(':');
  }
}
