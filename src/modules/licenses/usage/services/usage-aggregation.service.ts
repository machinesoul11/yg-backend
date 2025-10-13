/**
 * License Usage Aggregation Service
 * Aggregates raw usage events into daily metrics for dashboard performance
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { startOfDay, endOfDay } from 'date-fns';

export class LicenseUsageAggregationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Aggregate usage events for a specific license and date
   * Called by background job after events are logged
   */
  async aggregateDailyUsage(licenseId: string, date: Date): Promise<void> {
    const startDate = startOfDay(date);
    const endDate = endOfDay(date);

    console.log(
      `[UsageAggregation] Aggregating usage for license ${licenseId} on ${startDate.toISOString().split('T')[0]}`
    );

    try {
      // Query raw events for this license/date using raw SQL for performance
      const results: any[] = await this.prisma.$queryRaw`
        SELECT 
          usage_type,
          SUM(quantity) as total_quantity,
          SUM(revenue_cents) as total_revenue,
          COUNT(DISTINCT session_id) as unique_sessions
        FROM license_usage_events
        WHERE license_id = ${licenseId}
          AND occurred_at >= ${startDate}
          AND occurred_at < ${endDate}
        GROUP BY usage_type
      `;

      // Initialize metrics
      const metrics = {
        totalViews: 0,
        totalDownloads: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalPlays: 0,
        totalStreams: 0,
        totalQuantity: 0,
        totalRevenueCents: 0,
        uniqueSessions: 0,
      };

      // Aggregate by usage type
      const sessionIds = new Set<string>();
      
      for (const row of results) {
        const quantity = parseInt(row.total_quantity as string) || 0;
        const revenue = parseInt(row.total_revenue as string) || 0;
        
        metrics.totalQuantity += quantity;
        metrics.totalRevenueCents += revenue;

        // Map usage types to specific metrics
        switch (row.usage_type) {
          case 'view':
            metrics.totalViews += quantity;
            break;
          case 'download':
            metrics.totalDownloads += quantity;
            break;
          case 'impression':
            metrics.totalImpressions += quantity;
            break;
          case 'click':
            metrics.totalClicks += quantity;
            break;
          case 'play':
            metrics.totalPlays += quantity;
            break;
          case 'stream':
            metrics.totalStreams += quantity;
            break;
        }
      }

      // Get unique sessions count across all usage types
      const sessionResult: any = await this.prisma.$queryRaw`
        SELECT COUNT(DISTINCT session_id) as unique_sessions
        FROM license_usage_events
        WHERE license_id = ${licenseId}
          AND occurred_at >= ${startDate}
          AND occurred_at < ${endDate}
          AND session_id IS NOT NULL
      `;

      metrics.uniqueSessions = parseInt(sessionResult[0]?.unique_sessions as string) || 0;

      // Upsert into aggregates table
      await this.prisma.$executeRaw`
        INSERT INTO license_usage_daily_aggregates (
          id,
          license_id,
          date,
          total_views,
          total_downloads,
          total_impressions,
          total_clicks,
          total_plays,
          total_streams,
          total_quantity,
          total_revenue_cents,
          unique_sessions,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid(),
          ${licenseId},
          ${startDate}::date,
          ${metrics.totalViews},
          ${metrics.totalDownloads},
          ${metrics.totalImpressions},
          ${metrics.totalClicks},
          ${metrics.totalPlays},
          ${metrics.totalStreams},
          ${metrics.totalQuantity},
          ${metrics.totalRevenueCents},
          ${metrics.uniqueSessions},
          NOW(),
          NOW()
        )
        ON CONFLICT (license_id, date) 
        DO UPDATE SET
          total_views = ${metrics.totalViews},
          total_downloads = ${metrics.totalDownloads},
          total_impressions = ${metrics.totalImpressions},
          total_clicks = ${metrics.totalClicks},
          total_plays = ${metrics.totalPlays},
          total_streams = ${metrics.totalStreams},
          total_quantity = ${metrics.totalQuantity},
          total_revenue_cents = ${metrics.totalRevenueCents},
          unique_sessions = ${metrics.uniqueSessions},
          updated_at = NOW()
      `;

      console.log(
        `[UsageAggregation] Successfully aggregated ${metrics.totalQuantity} events for license ${licenseId}`
      );

      // Invalidate relevant caches
      await this.invalidateCaches(licenseId);
    } catch (error) {
      console.error('[UsageAggregation] Aggregation failed:', error);
      throw error;
    }
  }

  /**
   * Aggregate usage for all licenses for a specific date
   * Run nightly for previous day
   */
  async aggregateAllLicenses(date: Date): Promise<void> {
    const startDate = startOfDay(date);
    const endDate = endOfDay(date);

    console.log(
      `[UsageAggregation] Aggregating usage for all licenses on ${startDate.toISOString().split('T')[0]}`
    );

    // Get all licenses that had usage on this date
    const licensesWithUsage: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT license_id
      FROM license_usage_events
      WHERE occurred_at >= ${startDate}
        AND occurred_at < ${endDate}
    `;

    console.log(
      `[UsageAggregation] Found ${licensesWithUsage.length} licenses with usage`
    );

    // Aggregate each license
    for (const row of licensesWithUsage) {
      try {
        await this.aggregateDailyUsage(row.license_id, date);
      } catch (error) {
        console.error(
          `[UsageAggregation] Failed to aggregate license ${row.license_id}:`,
          error
        );
        // Continue with other licenses
      }
    }

    console.log('[UsageAggregation] Completed aggregation for all licenses');
  }

  /**
   * Backfill aggregates for a date range
   * Used for historical data migration or fixing gaps
   */
  async backfillAggregates(
    licenseId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      await this.aggregateDailyUsage(licenseId, currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  /**
   * Recalculate aggregates (for fixing data issues)
   */
  async recalculateAggregates(
    licenseId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    console.log(
      `[UsageAggregation] Recalculating aggregates for license ${licenseId} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Delete existing aggregates in range
    await this.prisma.$executeRaw`
      DELETE FROM license_usage_daily_aggregates
      WHERE license_id = ${licenseId}
        AND date >= ${startDate}::date
        AND date <= ${endDate}::date
    `;

    // Backfill
    await this.backfillAggregates(licenseId, startDate, endDate);

    console.log('[UsageAggregation] Recalculation complete');
  }

  /**
   * Get aggregation status for monitoring
   */
  async getAggregationStatus(date: Date) {
    const startDate = startOfDay(date);

    // Count events that day
    const eventCount: any = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM license_usage_events
      WHERE occurred_at >= ${startDate}
        AND occurred_at < ${startDate}::date + interval '1 day'
    `;

    // Count aggregated licenses
    const aggregateCount: any = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM license_usage_daily_aggregates
      WHERE date = ${startDate}::date
    `;

    // Count unique licenses with events
    const uniqueLicenses: any = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT license_id) as count
      FROM license_usage_events
      WHERE occurred_at >= ${startDate}
        AND occurred_at < ${startDate}::date + interval '1 day'
    `;

    return {
      date: startDate,
      totalEvents: parseInt(eventCount[0]?.count as string) || 0,
      licensesWithEvents: parseInt(uniqueLicenses[0]?.count as string) || 0,
      licensesAggregated: parseInt(aggregateCount[0]?.count as string) || 0,
      isComplete:
        parseInt(uniqueLicenses[0]?.count as string) ===
        parseInt(aggregateCount[0]?.count as string),
    };
  }

  /**
   * Private helper methods
   */

  private async invalidateCaches(licenseId: string) {
    const patterns = [
      `usage:current:${licenseId}:*`,
      `usage:analytics:${licenseId}:*`,
      `usage:dashboard:${licenseId}`,
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
