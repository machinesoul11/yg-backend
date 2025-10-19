/**
 * Cache Performance Metrics Service
 * 
 * Tracks and analyzes cache performance metrics including:
 * - Hit/miss rates
 * - Response time improvements
 * - Memory usage
 * - Cache efficiency
 */

import { getRedisClient } from './client';
import { redisMonitor, RedisHealthStatus } from './monitoring';

export interface CachePerformanceMetrics {
  timestamp: string;
  hitRate: number;
  missRate: number;
  totalRequests: number;
  hits: number;
  misses: number;
  averageLatency: number;
  memoryUsage: {
    used: string;
    percentage?: number;
  };
  keyCount: number;
  evictionCount: number;
  topKeys: Array<{
    key: string;
    accessCount: number;
    lastAccess: string;
  }>;
}

export interface CacheEfficiencyReport {
  period: {
    start: string;
    end: string;
  };
  overall: {
    hitRate: number;
    totalRequests: number;
    averageLatency: number;
    memorySaved: string;
  };
  byNamespace: Record<string, {
    hitRate: number;
    requests: number;
    avgLatency: number;
  }>;
  recommendations: string[];
  healthStatus: RedisHealthStatus;
}

export class CachePerformanceService {
  private redis = getRedisClient();
  private readonly METRICS_KEY = 'cache:performance:metrics';
  private readonly METRICS_HISTORY_KEY = 'cache:performance:history';
  private readonly METRICS_TTL = 86400; // 24 hours

  /**
   * Get current performance metrics
   */
  async getCurrentMetrics(): Promise<CachePerformanceMetrics> {
    try {
      const healthStatus = await redisMonitor.getHealthStatus();
      const keyDistribution = await redisMonitor.getKeyDistribution();

      const totalKeys = Object.values(keyDistribution).reduce((sum, count) => sum + count, 0);

      // Get info from Redis
      const info = await this.redis.info('stats');
      const statsMatch = this.parseRedisInfo(info);

      const hits = parseInt(statsMatch.keyspace_hits || '0');
      const misses = parseInt(statsMatch.keyspace_misses || '0');
      const totalRequests = hits + misses;
      const hitRate = totalRequests > 0 ? (hits / totalRequests) * 100 : 0;
      const missRate = 100 - hitRate;

      const evictedKeys = parseInt(statsMatch.evicted_keys || '0');

      return {
        timestamp: new Date().toISOString(),
        hitRate: Math.round(hitRate * 100) / 100,
        missRate: Math.round(missRate * 100) / 100,
        totalRequests,
        hits,
        misses,
        averageLatency: healthStatus.latency,
        memoryUsage: {
          used: healthStatus.details.memory,
          percentage: healthStatus.memoryUsagePercent,
        },
        keyCount: totalKeys,
        evictionCount: evictedKeys,
        topKeys: [], // Would need additional tracking to implement
      };
    } catch (error) {
      console.error('[Cache Performance] Error getting metrics:', error);
      throw error;
    }
  }

  /**
   * Record metrics snapshot for historical analysis
   */
  async recordMetricsSnapshot(): Promise<void> {
    try {
      const metrics = await this.getCurrentMetrics();

      // Store current snapshot
      await this.redis.setex(
        this.METRICS_KEY,
        this.METRICS_TTL,
        JSON.stringify(metrics)
      );

      // Add to history (keep last 24 hours of hourly snapshots)
      const historyKey = `${this.METRICS_HISTORY_KEY}:${new Date().toISOString().split('T')[0]}`;
      await this.redis.zadd(
        historyKey,
        Date.now(),
        JSON.stringify(metrics)
      );

      // Set expiry on history key
      await this.redis.expire(historyKey, this.METRICS_TTL);

      // Trim history to last 24 entries
      await this.redis.zremrangebyrank(historyKey, 0, -25);
    } catch (error) {
      console.error('[Cache Performance] Error recording snapshot:', error);
      throw error;
    }
  }

  /**
   * Get historical metrics for a date range
   */
  async getHistoricalMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<CachePerformanceMetrics[]> {
    try {
      const metrics: CachePerformanceMetrics[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const historyKey = `${this.METRICS_HISTORY_KEY}:${dateKey}`;

        const dayMetrics = await this.redis.zrange(historyKey, 0, -1);

        for (const metric of dayMetrics) {
          try {
            metrics.push(JSON.parse(metric));
          } catch (e) {
            console.error('[Cache Performance] Error parsing metric:', e);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return metrics.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error('[Cache Performance] Error getting historical metrics:', error);
      return [];
    }
  }

  /**
   * Generate efficiency report with recommendations
   */
  async generateEfficiencyReport(
    periodDays: number = 7
  ): Promise<CacheEfficiencyReport> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const historicalMetrics = await this.getHistoricalMetrics(startDate, endDate);
      const currentMetrics = await this.getCurrentMetrics();
      const healthStatus = await redisMonitor.getHealthStatus();

      // Calculate overall metrics
      const avgHitRate = historicalMetrics.length > 0
        ? historicalMetrics.reduce((sum, m) => sum + m.hitRate, 0) / historicalMetrics.length
        : currentMetrics.hitRate;

      const totalRequests = historicalMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
      const avgLatency = historicalMetrics.length > 0
        ? historicalMetrics.reduce((sum, m) => sum + m.averageLatency, 0) / historicalMetrics.length
        : currentMetrics.averageLatency;

      // Get namespace distribution
      const keyDistribution = await redisMonitor.getKeyDistribution();
      const byNamespace: Record<string, { hitRate: number; requests: number; avgLatency: number }> = {};

      for (const [namespace, keyCount] of Object.entries(keyDistribution)) {
        byNamespace[namespace] = {
          hitRate: avgHitRate, // Would need per-namespace tracking for accurate data
          requests: Math.floor(totalRequests * (keyCount / currentMetrics.keyCount)),
          avgLatency: avgLatency,
        };
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        currentMetrics,
        avgHitRate,
        healthStatus
      );

      return {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        overall: {
          hitRate: Math.round(avgHitRate * 100) / 100,
          totalRequests,
          averageLatency: Math.round(avgLatency * 100) / 100,
          memorySaved: this.calculateMemorySaved(historicalMetrics),
        },
        byNamespace,
        recommendations,
        healthStatus,
      };
    } catch (error) {
      console.error('[Cache Performance] Error generating report:', error);
      throw error;
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    metrics: CachePerformanceMetrics,
    avgHitRate: number,
    health: RedisHealthStatus
  ): string[] {
    const recommendations: string[] = [];

    // Hit rate recommendations
    if (avgHitRate < 50) {
      recommendations.push(
        'Low cache hit rate detected (<50%). Review cache TTLs and consider increasing for stable data.'
      );
    } else if (avgHitRate < 70) {
      recommendations.push(
        'Moderate cache hit rate (50-70%). Identify frequently missed queries and add caching.'
      );
    }

    // Memory recommendations
    if (health.memoryUsagePercent && health.memoryUsagePercent > 85) {
      recommendations.push(
        'High memory usage (>85%). Consider increasing Redis memory or reducing TTLs.'
      );
    }

    // Eviction recommendations
    if (metrics.evictionCount > 1000) {
      recommendations.push(
        `High eviction count (${metrics.evictionCount}). Increase memory allocation or optimize cache keys.`
      );
    }

    // Latency recommendations
    if (metrics.averageLatency > 100) {
      recommendations.push(
        `High cache latency (${metrics.averageLatency}ms). Check network connectivity or Redis server load.`
      );
    }

    // Key count recommendations
    if (metrics.keyCount > 1000000) {
      recommendations.push(
        'Very high key count (>1M). Review cache invalidation strategy to prevent unbounded growth.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Cache performance is optimal. No immediate optimizations needed.');
    }

    return recommendations;
  }

  /**
   * Calculate estimated memory saved by caching
   */
  private calculateMemorySaved(metrics: CachePerformanceMetrics[]): string {
    if (metrics.length === 0) return '0 MB';

    const totalHits = metrics.reduce((sum, m) => sum + m.hits, 0);
    // Assume average cached response is ~10KB
    const avgResponseSize = 10 * 1024; // 10KB in bytes
    const totalBytesSaved = totalHits * avgResponseSize;

    if (totalBytesSaved >= 1024 * 1024 * 1024) {
      return `${(totalBytesSaved / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (totalBytesSaved >= 1024 * 1024) {
      return `${(totalBytesSaved / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(totalBytesSaved / 1024).toFixed(2)} KB`;
    }
  }

  /**
   * Parse Redis INFO output
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};

    info.split('\r\n').forEach((line) => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      }
    });

    return result;
  }

  /**
   * Compare performance before and after a specific change
   */
  async comparePerformance(
    beforeDate: Date,
    afterDate: Date
  ): Promise<{
    improvement: {
      hitRate: number;
      latency: number;
      requests: number;
    };
    summary: string;
  }> {
    try {
      const beforeMetrics = await this.getHistoricalMetrics(
        beforeDate,
        new Date(beforeDate.getTime() + 24 * 60 * 60 * 1000)
      );

      const afterMetrics = await this.getHistoricalMetrics(
        afterDate,
        new Date(afterDate.getTime() + 24 * 60 * 60 * 1000)
      );

      if (beforeMetrics.length === 0 || afterMetrics.length === 0) {
        throw new Error('Insufficient data for comparison');
      }

      const avgBefore = {
        hitRate: beforeMetrics.reduce((s, m) => s + m.hitRate, 0) / beforeMetrics.length,
        latency: beforeMetrics.reduce((s, m) => s + m.averageLatency, 0) / beforeMetrics.length,
        requests: beforeMetrics.reduce((s, m) => s + m.totalRequests, 0) / beforeMetrics.length,
      };

      const avgAfter = {
        hitRate: afterMetrics.reduce((s, m) => s + m.hitRate, 0) / afterMetrics.length,
        latency: afterMetrics.reduce((s, m) => s + m.averageLatency, 0) / afterMetrics.length,
        requests: afterMetrics.reduce((s, m) => s + m.totalRequests, 0) / afterMetrics.length,
      };

      const improvement = {
        hitRate: avgAfter.hitRate - avgBefore.hitRate,
        latency: avgBefore.latency - avgAfter.latency, // Positive means improvement
        requests: avgAfter.requests - avgBefore.requests,
      };

      const summary = `
        Cache Hit Rate: ${improvement.hitRate > 0 ? '+' : ''}${improvement.hitRate.toFixed(2)}%
        Average Latency: ${improvement.latency > 0 ? '-' : '+'}${Math.abs(improvement.latency).toFixed(2)}ms
        Request Volume: ${improvement.requests > 0 ? '+' : ''}${improvement.requests.toFixed(0)} req/period
      `.trim();

      return { improvement, summary };
    } catch (error) {
      console.error('[Cache Performance] Error comparing performance:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const cachePerformanceService = new CachePerformanceService();
