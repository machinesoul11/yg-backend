/**
 * Real-Time Metrics Service
 * Handles incremental updates to metrics as events occur
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

interface RealtimeMetricUpdate {
  metricKey: string;
  metricType: 'counter' | 'gauge' | 'histogram' | 'rate';
  value: number;
  dimensions?: Record<string, string>;
  unit?: string;
  windowSizeSeconds?: number;
}

export class RealtimeMetricsService {
  private readonly METRIC_PREFIX = 'realtime:metric:';
  private readonly CACHE_TTL = 3600; // 1 hour default

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Increment a counter metric
   */
  async incrementCounter(
    metricKey: string,
    value: number = 1,
    dimensions: Record<string, string> = {}
  ): Promise<void> {
    const fullKey = this.buildMetricKey(metricKey, dimensions);

    try {
      // Update in Redis for fast access
      await this.redis.incrbyfloat(fullKey, value);
      await this.redis.expire(fullKey, this.CACHE_TTL);

      // Update in database for persistence
      await this.upsertRealtimeMetric({
        metricKey: fullKey,
        metricType: 'counter',
        value,
        dimensions,
      });
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error incrementing counter ${metricKey}:`,
        error
      );
    }
  }

  /**
   * Set a gauge metric (absolute value)
   */
  async setGauge(
    metricKey: string,
    value: number,
    dimensions: Record<string, string> = {},
    unit?: string
  ): Promise<void> {
    const fullKey = this.buildMetricKey(metricKey, dimensions);

    try {
      // Set in Redis
      await this.redis.set(fullKey, value.toString());
      await this.redis.expire(fullKey, this.CACHE_TTL);

      // Update in database
      await this.upsertRealtimeMetric({
        metricKey: fullKey,
        metricType: 'gauge',
        value,
        dimensions,
        unit,
      });
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error setting gauge ${metricKey}:`,
        error
      );
    }
  }

  /**
   * Record a histogram value (for distributions)
   */
  async recordHistogram(
    metricKey: string,
    value: number,
    dimensions: Record<string, string> = {}
  ): Promise<void> {
    const fullKey = this.buildMetricKey(metricKey, dimensions);

    try {
      // Store histogram data points in Redis sorted set
      const timestamp = Date.now();
      await this.redis.zadd(fullKey, timestamp, `${timestamp}:${value}`);

      // Keep only last 1000 data points
      await this.redis.zremrangebyrank(fullKey, 0, -1001);
      await this.redis.expire(fullKey, this.CACHE_TTL);

      // Calculate and store histogram statistics
      const stats = await this.calculateHistogramStats(fullKey);
      
      await this.upsertRealtimeMetric({
        metricKey: fullKey,
        metricType: 'histogram',
        value: stats.median,
        dimensions: {
          ...dimensions,
          mean: stats.mean.toString(),
          p50: stats.p50.toString(),
          p95: stats.p95.toString(),
          p99: stats.p99.toString(),
        },
      });
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error recording histogram ${metricKey}:`,
        error
      );
    }
  }

  /**
   * Record a rate metric (events per time period)
   */
  async recordRate(
    metricKey: string,
    windowSizeSeconds: number = 60,
    dimensions: Record<string, string> = {}
  ): Promise<void> {
    const fullKey = this.buildMetricKey(metricKey, dimensions);

    try {
      const now = Date.now();
      const windowStart = now - windowSizeSeconds * 1000;

      // Store timestamp in sorted set
      await this.redis.zadd(fullKey, now, now.toString());

      // Remove old entries outside the window
      await this.redis.zremrangebyscore(fullKey, '-inf', windowStart);
      await this.redis.expire(fullKey, this.CACHE_TTL);

      // Count events in window
      const count = await this.redis.zcount(fullKey, windowStart, '+inf');
      const rate = count / windowSizeSeconds;

      await this.upsertRealtimeMetric({
        metricKey: fullKey,
        metricType: 'rate',
        value: rate,
        dimensions,
        windowSizeSeconds,
      });
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error recording rate ${metricKey}:`,
        error
      );
    }
  }

  /**
   * Get current value of a real-time metric
   */
  async getMetricValue(
    metricKey: string,
    dimensions: Record<string, string> = {}
  ): Promise<number | null> {
    const fullKey = this.buildMetricKey(metricKey, dimensions);

    try {
      // Try Redis first (fast)
      const cached = await this.redis.get(fullKey);
      if (cached) {
        return parseFloat(cached);
      }

      // Fall back to database
      const metric = await this.prisma.realtimeMetricsCache.findUnique({
        where: { metricKey: fullKey },
      });

      return metric ? parseFloat(metric.currentValue.toString()) : null;
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error getting metric ${metricKey}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get multiple metrics at once
   */
  async getBulkMetrics(
    metricKeys: Array<{ key: string; dimensions?: Record<string, string> }>
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    const pipeline = this.redis.pipeline();
    const fullKeys: string[] = [];

    for (const { key, dimensions = {} } of metricKeys) {
      const fullKey = this.buildMetricKey(key, dimensions);
      fullKeys.push(fullKey);
      pipeline.get(fullKey);
    }

    const redisResults = await pipeline.exec();

    if (redisResults) {
      redisResults.forEach((result, index) => {
        const [err, value] = result;
        if (!err && value) {
          results.set(fullKeys[index], parseFloat(value as string));
        }
      });
    }

    return results;
  }

  /**
   * Reconcile real-time metrics with source data
   * Run periodically to correct any drift
   */
  async reconcileMetrics(metricKey: string): Promise<void> {
    console.log(`[RealtimeMetrics] Reconciling metric: ${metricKey}`);

    try {
      // Get all metrics matching the key pattern
      const metrics = await this.prisma.realtimeMetricsCache.findMany({
        where: {
          metricKey: {
            startsWith: metricKey,
          },
        },
      });

      for (const metric of metrics) {
        // Recalculate from source data based on metric type
        const actualValue = await this.calculateActualValue(metric);

        if (actualValue !== null) {
          // Update if there's significant drift (> 5%)
          const currentValue = parseFloat(metric.currentValue.toString());
          const drift = Math.abs(actualValue - currentValue) / currentValue;

          if (drift > 0.05) {
            console.log(
              `[RealtimeMetrics] Correcting drift for ${metric.metricKey}: ${currentValue} -> ${actualValue}`
            );

            await this.prisma.realtimeMetricsCache.update({
              where: { id: metric.id },
              data: {
                previousValue: currentValue,
                currentValue: actualValue,
                lastUpdatedAt: new Date(),
              },
            });

            // Update Redis
            const fullKey = metric.metricKey;
            await this.redis.set(fullKey, actualValue.toString());
            await this.redis.expire(fullKey, this.CACHE_TTL);
          }
        }
      }

      console.log(`[RealtimeMetrics] Reconciliation completed for ${metricKey}`);
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error reconciling metrics:`,
        error
      );
    }
  }

  /**
   * Clear expired metrics from cache
   */
  async clearExpiredMetrics(): Promise<void> {
    try {
      const result = await this.prisma.realtimeMetricsCache.deleteMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
        },
      });

      console.log(
        `[RealtimeMetrics] Cleared ${result.count} expired metrics`
      );
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error clearing expired metrics:`,
        error
      );
    }
  }

  /**
   * Private helper: Build full metric key with dimensions
   */
  private buildMetricKey(
    baseKey: string,
    dimensions: Record<string, string>
  ): string {
    if (Object.keys(dimensions).length === 0) {
      return `${this.METRIC_PREFIX}${baseKey}`;
    }

    const dimensionStr = Object.entries(dimensions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');

    return `${this.METRIC_PREFIX}${baseKey}:${dimensionStr}`;
  }

  /**
   * Private helper: Upsert metric in database
   */
  private async upsertRealtimeMetric(
    update: RealtimeMetricUpdate
  ): Promise<void> {
    try {
      const existing = await this.prisma.realtimeMetricsCache.findUnique({
        where: { metricKey: update.metricKey },
      });

      if (existing) {
        const newValue =
          update.metricType === 'counter'
            ? parseFloat(existing.currentValue.toString()) + update.value
            : update.value;

        await this.prisma.realtimeMetricsCache.update({
          where: { metricKey: update.metricKey },
          data: {
            previousValue: existing.currentValue,
            currentValue: newValue,
            dimensions: update.dimensions || {},
            lastUpdatedAt: new Date(),
            updateCount: { increment: 1 },
            unit: update.unit || existing.unit,
          },
        });
      } else {
        await this.prisma.realtimeMetricsCache.create({
          data: {
            metricKey: update.metricKey,
            metricType: update.metricType,
            currentValue: update.value,
            dimensions: update.dimensions || {},
            unit: update.unit,
            windowSizeSeconds: update.windowSizeSeconds,
            lastUpdatedAt: new Date(),
            expiresAt: new Date(Date.now() + this.CACHE_TTL * 1000),
          },
        });
      }
    } catch (error) {
      console.error(
        `[RealtimeMetrics] Error upserting metric:`,
        error
      );
    }
  }

  /**
   * Private helper: Calculate histogram statistics
   */
  private async calculateHistogramStats(key: string) {
    const values = await this.redis.zrange(key, 0, -1);
    const numbers = values.map((v) => parseFloat(v.split(':')[1])).sort((a, b) => a - b);

    if (numbers.length === 0) {
      return { mean: 0, median: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / numbers.length;

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * numbers.length) - 1;
      return numbers[Math.max(0, index)];
    };

    return {
      mean,
      median: percentile(50),
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
    };
  }

  /**
   * Private helper: Calculate actual value from source data
   */
  private async calculateActualValue(metric: any): Promise<number | null> {
    // This would query the actual source data (events table, etc.)
    // to recalculate the true value
    // Implementation depends on specific metric definition
    return null; // Placeholder
  }
}
