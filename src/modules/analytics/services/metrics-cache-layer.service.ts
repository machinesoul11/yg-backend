/**
 * Metrics Cache Service
 * Multi-tiered caching strategy for metrics queries
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

export interface CachedMetric {
  key: string;
  value: any;
  ttl?: number;
  tags?: string[];
}

export class MetricsCacheService {
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly SHORT_TTL = 300; // 5 minutes
  private readonly LONG_TTL = 86400; // 24 hours

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get cached metric or compute and cache it
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    options?: {
      ttl?: number;
      tags?: string[];
    }
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await computeFn();

    // Cache it
    await this.set(key, value, options?.ttl, options?.tags);

    return value;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(`metrics:${key}`);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[MetricsCache] Error getting ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string,
    value: any,
    ttl: number = this.DEFAULT_TTL,
    tags?: string[]
  ): Promise<void> {
    try {
      const cacheKey = `metrics:${key}`;
      
      await this.redis.setex(cacheKey, ttl, JSON.stringify(value));

      // Store tags for invalidation
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await this.redis.sadd(`metrics:tag:${tag}`, cacheKey);
          await this.redis.expire(`metrics:tag:${tag}`, ttl + 3600);
        }
      }
    } catch (error) {
      console.error(`[MetricsCache] Error setting ${key}:`, error);
    }
  }

  /**
   * Invalidate specific cache key
   */
  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(`metrics:${key}`);
    } catch (error) {
      console.error(`[MetricsCache] Error invalidating ${key}:`, error);
    }
  }

  /**
   * Invalidate all cache keys with a specific tag
   */
  async invalidateByTag(tag: string): Promise<void> {
    try {
      const tagKey = `metrics:tag:${tag}`;
      const keys = await this.redis.smembers(tagKey);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[MetricsCache] Invalidated ${keys.length} keys for tag: ${tag}`);
      }

      await this.redis.del(tagKey);
    } catch (error) {
      console.error(`[MetricsCache] Error invalidating tag ${tag}:`, error);
    }
  }

  /**
   * Invalidate multiple tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidateByTag(tag);
    }
  }

  /**
   * Warm cache with commonly accessed metrics
   */
  async warmCache(metricsConfig: Array<{
    key: string;
    computeFn: () => Promise<any>;
    ttl?: number;
    tags?: string[];
  }>): Promise<void> {
    console.log(`[MetricsCache] Warming cache with ${metricsConfig.length} metrics`);

    const promises = metricsConfig.map(async (config) => {
      try {
        const value = await config.computeFn();
        await this.set(config.key, value, config.ttl, config.tags);
      } catch (error) {
        console.error(`[MetricsCache] Error warming ${config.key}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log('[MetricsCache] Cache warming complete');
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
      const keys = await this.redis.keys('metrics:*');
      const info = await this.redis.info('memory');
      
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        totalKeys: keys.length,
        memoryUsed,
      };
    } catch (error) {
      console.error('[MetricsCache] Error getting stats:', error);
      return {
        totalKeys: 0,
        memoryUsed: 'unknown',
      };
    }
  }

  /**
   * Clear all metrics cache
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.redis.keys('metrics:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[MetricsCache] Cleared ${keys.length} cache keys`);
      }
    } catch (error) {
      console.error('[MetricsCache] Error clearing cache:', error);
    }
  }

  /**
   * Generate cache key for daily metrics
   */
  generateDailyKey(params: {
    type: 'project' | 'asset' | 'license';
    id: string;
    date: string;
  }): string {
    return `daily:${params.type}:${params.id}:${params.date}`;
  }

  /**
   * Generate cache key for weekly metrics
   */
  generateWeeklyKey(params: {
    type: 'project' | 'asset' | 'license';
    id: string;
    weekStart: string;
  }): string {
    return `weekly:${params.type}:${params.id}:${params.weekStart}`;
  }

  /**
   * Generate cache key for monthly metrics
   */
  generateMonthlyKey(params: {
    type: 'project' | 'asset' | 'license';
    id: string;
    year: number;
    month: number;
  }): string {
    return `monthly:${params.type}:${params.id}:${params.year}-${params.month}`;
  }

  /**
   * Generate cache key for custom metrics
   */
  generateCustomMetricKey(params: {
    definitionId: string;
    periodStart: string;
    periodEnd: string;
    dimensions?: Record<string, any>;
  }): string {
    const dimKey = params.dimensions
      ? `:${JSON.stringify(params.dimensions)}`
      : '';
    return `custom:${params.definitionId}:${params.periodStart}:${params.periodEnd}${dimKey}`;
  }

  /**
   * Generate cache key for dashboard bundles
   */
  generateDashboardKey(params: {
    userId: string;
    dashboardType: string;
    dateRange: string;
  }): string {
    return `dashboard:${params.userId}:${params.dashboardType}:${params.dateRange}`;
  }

  /**
   * Invalidate caches after daily aggregation
   */
  async invalidateAfterDailyAggregation(date: string): Promise<void> {
    const tags = [
      `daily:${date}`,
      'weekly:current',
      'monthly:current',
      'dashboard:all',
    ];

    await this.invalidateByTags(tags);
    console.log(`[MetricsCache] Invalidated caches for date: ${date}`);
  }

  /**
   * Invalidate caches after weekly aggregation
   */
  async invalidateAfterWeeklyAggregation(weekStart: string): Promise<void> {
    const tags = [`weekly:${weekStart}`, 'monthly:current', 'dashboard:all'];

    await this.invalidateByTags(tags);
    console.log(`[MetricsCache] Invalidated caches for week: ${weekStart}`);
  }

  /**
   * Invalidate caches after monthly aggregation
   */
  async invalidateAfterMonthlyAggregation(year: number, month: number): Promise<void> {
    const tags = [`monthly:${year}-${month}`, 'dashboard:all'];

    await this.invalidateByTags(tags);
    console.log(`[MetricsCache] Invalidated caches for month: ${year}-${month}`);
  }
}
