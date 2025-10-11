/**
 * Event Service
 * Handles event tracking, creation, and enrichment for analytics
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { TRPCError } from '@trpc/server';
import type {
  RequestContext,
  EventCreated,
  AssetMetrics,
  DateRange,
  DailyMetricData,
} from '../types';
import type { TrackEventInput } from '@/lib/schemas/analytics.schema';
import { ENTITY_TYPES } from '@/lib/constants/event-types';

export class EventService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private jobQueue: Queue
  ) {}

  /**
   * Create a new event and optionally enqueue enrichment job
   */
  async trackEvent(
    input: TrackEventInput,
    context: RequestContext
  ): Promise<EventCreated> {
    const {
      eventType,
      source,
      entityId,
      entityType,
      sessionId,
      props,
      attribution,
      idempotencyKey,
    } = input;

    try {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.redis.get(
          `event:idempotency:${idempotencyKey}`
        );
        if (existingEvent) {
          return JSON.parse(existingEvent);
        }
      }

      // Extract actor from context (authenticated user)
      const actorId = context.session?.userId;
      const actorType = context.session?.role;

      // Map entityType to foreign key fields
      const entityRefs = this.mapEntityToRefs(entityId, entityType);

      // Create event record
      const event = await this.prisma.event.create({
        data: {
          occurredAt: new Date(),
          eventType,
          source,
          actorType,
          actorId,
          ...entityRefs,
          sessionId,
          propsJson: props || {},
        },
      });

      // Create attribution record if provided
      if (attribution) {
        await this.prisma.attribution.create({
          data: {
            eventId: event.id,
            ...attribution,
            deviceType: context.deviceType,
            browser: context.browser,
            os: context.os,
          },
        });
      }

      // Cache idempotency result
      if (idempotencyKey) {
        const result = { eventId: event.id, tracked: true };
        await this.redis.setex(
          `event:idempotency:${idempotencyKey}`,
          3600, // 1 hour TTL
          JSON.stringify(result)
        );
      }

      // Enqueue enrichment job (async, non-blocking)
      await this.jobQueue.add('enrichEvent', { eventId: event.id });

      return { eventId: event.id, tracked: true };
    } catch (error) {
      // Log error but don't throw - analytics failures shouldn't break user actions
      console.error('[EventService] Failed to track event:', error);
      return { eventId: null, tracked: false };
    }
  }

  /**
   * Get aggregated metrics for an asset
   */
  async getAssetMetrics(
    assetId: string,
    dateRange?: DateRange
  ): Promise<AssetMetrics> {
    try {
      const { start, end } = dateRange || this.getDefaultDateRange('30d');

      // Check cache first
      const cacheKey = `analytics:asset:${assetId}:${start.toISOString()}:${end.toISOString()}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Query daily_metrics table
      const dailyMetrics = await this.prisma.dailyMetric.findMany({
        where: {
          ipAssetId: assetId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
      });

      // Compute totals
      const totalViews = dailyMetrics.reduce((sum, m) => sum + m.views, 0);
      const totalClicks = dailyMetrics.reduce((sum, m) => sum + m.clicks, 0);
      const totalConversions = dailyMetrics.reduce(
        (sum, m) => sum + m.conversions,
        0
      );
      const totalRevenueCents = dailyMetrics.reduce(
        (sum, m) => sum + m.revenueCents,
        0
      );

      // Query top referrers from attribution table
      const topReferrers = await this.getTopReferrers(assetId, start, end);

      const result: AssetMetrics = {
        assetId,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        metrics: {
          totalViews,
          totalClicks,
          totalConversions,
          totalRevenueCents,
          uniqueVisitors: dailyMetrics.reduce(
            (sum, m) => sum + m.uniqueVisitors,
            0
          ),
          avgEngagementTime: this.calculateAvgEngagementTime(dailyMetrics),
          topReferrers,
          dailyBreakdown: dailyMetrics.map((m) => ({
            date: m.date.toISOString().split('T')[0],
            views: m.views,
            clicks: m.clicks,
            conversions: m.conversions,
            revenueCents: m.revenueCents,
          })),
        },
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('[EventService] Failed to get asset metrics:', error);
      
      if ((error as any).code === 'P2025') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Asset with ID ${assetId} not found`,
        });
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve analytics data',
      });
    }
  }

  /**
   * Get events for a specific entity
   */
  async getEntityEvents(
    entityId: string,
    entityType: string,
    limit: number = 50
  ) {
    const whereClause: any = {};

    switch (entityType) {
      case ENTITY_TYPES.PROJECT:
        whereClause.projectId = entityId;
        break;
      case ENTITY_TYPES.ASSET:
        whereClause.ipAssetId = entityId;
        break;
      case ENTITY_TYPES.LICENSE:
        whereClause.licenseId = entityId;
        break;
      default:
        whereClause.actorId = entityId;
    }

    return this.prisma.event.findMany({
      where: whereClause,
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: {
        attribution: true,
      },
    });
  }

  /**
   * Helper: Map entityType to Prisma foreign key fields
   */
  private mapEntityToRefs(entityId?: string, entityType?: string) {
    if (!entityId || !entityType) return {};

    const mapping: Record<string, any> = {
      [ENTITY_TYPES.PROJECT]: { projectId: entityId },
      [ENTITY_TYPES.ASSET]: { ipAssetId: entityId },
      [ENTITY_TYPES.LICENSE]: { licenseId: entityId },
    };

    return mapping[entityType] || {};
  }

  /**
   * Helper: Get default date range
   */
  private getDefaultDateRange(period: string): DateRange {
    const end = new Date();
    const start = new Date();

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365,
    };
    const days = daysMap[period] || 30;

    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  /**
   * Helper: Query top referrers for an asset
   */
  private async getTopReferrers(
    assetId: string,
    start: Date,
    end: Date
  ): Promise<Array<{ referrer: string; count: number }>> {
    const result: any[] = await this.prisma.$queryRaw`
      SELECT a.referrer, COUNT(*) as count
      FROM attribution a
      JOIN events e ON e.id = a.event_id
      WHERE e.ip_asset_id = ${assetId}
        AND e.occurred_at >= ${start}
        AND e.occurred_at <= ${end}
        AND a.referrer IS NOT NULL
        AND a.referrer != ''
      GROUP BY a.referrer
      ORDER BY count DESC
      LIMIT 10
    `;

    return result.map((r) => ({
      referrer: r.referrer,
      count: parseInt(r.count as string),
    }));
  }

  /**
   * Helper: Calculate average engagement time
   */
  private calculateAvgEngagementTime(metrics: any[]): number {
    const totalTime = metrics.reduce((sum, m) => sum + m.engagementTime, 0);
    const totalVisitors = metrics.reduce((sum, m) => sum + m.uniqueVisitors, 0);
    return totalVisitors > 0 ? Math.round(totalTime / totalVisitors) : 0;
  }

  /**
   * Invalidate cached metrics
   */
  async invalidateMetricsCache(assetId: string): Promise<void> {
    const pattern = `analytics:asset:${assetId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
