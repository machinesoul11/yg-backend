/**
 * License Usage Tracking Service
 * Core service for logging and tracking license usage events
 */

import { PrismaClient, type License } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import {
  type TrackUsageEventInput,
  type BatchTrackUsageInput,
  type UsageEventResult,
  UsageTrackingError,
} from '../types';

export class LicenseUsageTrackingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly jobQueue: Queue
  ) {}

  /**
   * Track a single usage event
   * Non-blocking, batches writes for performance
   */
  async trackUsageEvent(
    input: TrackUsageEventInput
  ): Promise<UsageEventResult> {
    try {
      // Validate license exists and is active
      const license = await this.getLicense(input.licenseId);
      
      if (!license.usageTrackingEnabled) {
        return {
          eventId: null,
          tracked: false,
          error: 'Usage tracking not enabled for this license',
        };
      }

      // Check for duplicate via idempotency key
      if (input.idempotencyKey) {
        const duplicate = await this.checkIdempotency(input.idempotencyKey);
        if (duplicate) {
          return {
            eventId: duplicate.id,
            tracked: true,
          };
        }
      }

      // Validate usage is within license period
      const now = new Date();
      if (now < license.startDate || now > license.endDate) {
        return {
          eventId: null,
          tracked: false,
          error: 'Usage outside of license period',
        };
      }

      // Create usage event
      const event = await this.prisma.licenseUsageEvent.create({
        data: {
          licenseId: input.licenseId,
          occurredAt: new Date(),
          usageType: input.usageType,
          quantity: input.quantity ?? 1,
          geographicLocation: input.geographicLocation,
          platform: input.platform,
          deviceType: input.deviceType,
          referrer: input.referrer,
          revenueCents: input.revenueCents ?? 0,
          metadata: input.metadata ?? {},
          sessionId: input.sessionId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      // Cache idempotency key if provided
      if (input.idempotencyKey) {
        await this.cacheIdempotency(input.idempotencyKey, event.id);
      }

      // Queue aggregation job (async, non-blocking)
      await this.queueAggregationJob(event.licenseId, event.occurredAt);

      // Queue threshold check (async, non-blocking)
      await this.queueThresholdCheck(event.licenseId);

      return {
        eventId: event.id,
        tracked: true,
      };
    } catch (error) {
      console.error('[UsageTracking] Failed to track event:', error);
      
      // Return error but don't throw - tracking failures shouldn't break user actions
      return {
        eventId: null,
        tracked: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Track multiple usage events in a batch
   * More efficient for high-volume tracking
   */
  async trackBatchUsageEvents(
    input: BatchTrackUsageInput
  ): Promise<UsageEventResult[]> {
    const results: UsageEventResult[] = [];

    // Process in chunks to avoid memory issues
    const chunkSize = 100;
    for (let i = 0; i < input.events.length; i += chunkSize) {
      const chunk = input.events.slice(i, i + chunkSize);
      
      // Track each event in the chunk
      const chunkResults = await Promise.all(
        chunk.map(event => this.trackUsageEvent(event))
      );
      
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Get current usage for a license
   * Used for real-time threshold checking
   */
  async getCurrentUsage(
    licenseId: string,
    usageType?: string,
    periodType: 'daily' | 'weekly' | 'monthly' | 'total' = 'total'
  ): Promise<number> {
    const cacheKey = `usage:current:${licenseId}:${usageType || 'all'}:${periodType}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseInt(cached, 10);
    }

    // Calculate period bounds
    const { startDate, endDate } = this.getPeriodBounds(periodType);

    // Query aggregated data for performance
    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Sum up usage based on type
    let totalUsage = 0;
    
    if (!usageType || usageType === 'all') {
      totalUsage = aggregates.reduce((sum, agg) => sum + agg.totalQuantity, 0);
    } else {
      // Sum specific usage type
      const fieldMap: Record<string, keyof typeof aggregates[0]> = {
        view: 'totalViews',
        download: 'totalDownloads',
        impression: 'totalImpressions',
        click: 'totalClicks',
        play: 'totalPlays',
        stream: 'totalStreams',
      };
      
      const field = fieldMap[usageType];
      if (field) {
        totalUsage = aggregates.reduce((sum, agg) => sum + (agg[field] as number), 0);
      }
    }

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, totalUsage.toString());

    return totalUsage;
  }

  /**
   * Get usage breakdown by type
   */
  async getUsageBreakdown(
    licenseId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return {
      views: aggregates.reduce((sum, agg) => sum + agg.totalViews, 0),
      downloads: aggregates.reduce((sum, agg) => sum + agg.totalDownloads, 0),
      impressions: aggregates.reduce((sum, agg) => sum + agg.totalImpressions, 0),
      clicks: aggregates.reduce((sum, agg) => sum + agg.totalClicks, 0),
      plays: aggregates.reduce((sum, agg) => sum + agg.totalPlays, 0),
      streams: aggregates.reduce((sum, agg) => sum + agg.totalStreams, 0),
      total: aggregates.reduce((sum, agg) => sum + agg.totalQuantity, 0),
      revenue: aggregates.reduce((sum, agg) => sum + agg.totalRevenueCents, 0),
    };
  }

  /**
   * Get usage events for audit/debugging
   * Use sparingly - queries raw events table
   */
  async getUsageEvents(
    licenseId: string,
    startDate: Date,
    endDate: Date,
    usageType?: string,
    limit: number = 100,
    offset: number = 0
  ) {
    return this.prisma.licenseUsageEvent.findMany({
      where: {
        licenseId,
        occurredAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(usageType && { usageType }),
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Private helper methods
   */

  private async getLicense(licenseId: string): Promise<License> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new UsageTrackingError(`License not found: ${licenseId}`);
    }

    if (license.deletedAt) {
      throw new UsageTrackingError(`License has been deleted: ${licenseId}`);
    }

    return license;
  }

  private async checkIdempotency(key: string) {
    return this.prisma.licenseUsageEvent.findUnique({
      where: { idempotencyKey: key },
    });
  }

  private async cacheIdempotency(key: string, eventId: string) {
    // Cache for 24 hours
    await this.redis.setex(
      `usage:idempotency:${key}`,
      86400,
      eventId
    );
  }

  private getPeriodBounds(periodType: 'daily' | 'weekly' | 'monthly' | 'total') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (periodType) {
      case 'daily':
        return {
          startDate: today,
          endDate: now,
        };
      
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return {
          startDate: weekStart,
          endDate: now,
        };
      
      case 'monthly':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          startDate: monthStart,
          endDate: now,
        };
      
      case 'total':
      default:
        // Return a very old date for total
        return {
          startDate: new Date('2020-01-01'),
          endDate: now,
        };
    }
  }

  private async queueAggregationJob(licenseId: string, date: Date) {
    try {
      await this.jobQueue.add(
        'aggregateUsage',
        { licenseId, date },
        {
          delay: 60000, // Delay 1 minute to batch multiple events
          jobId: `aggregate:${licenseId}:${date.toISOString().split('T')[0]}`,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    } catch (error) {
      // Log but don't throw - aggregation can be retried
      console.error('[UsageTracking] Failed to queue aggregation:', error);
    }
  }

  private async queueThresholdCheck(licenseId: string) {
    try {
      await this.jobQueue.add(
        'checkUsageThresholds',
        { licenseId },
        {
          delay: 5000, // Delay 5 seconds
          jobId: `threshold:${licenseId}`,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    } catch (error) {
      // Log but don't throw
      console.error('[UsageTracking] Failed to queue threshold check:', error);
    }
  }
}
