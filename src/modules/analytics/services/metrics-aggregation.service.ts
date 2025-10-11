/**
 * Metrics Aggregation Service
 * Handles daily aggregation of event data into metrics tables
 */

import { PrismaClient } from '@prisma/client';
import type { DailyMetricData } from '../types';

export class MetricsAggregationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Aggregate events into daily_metrics table (run nightly)
   */
  async aggregateDailyMetrics(date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    console.log(
      `[MetricsAggregation] Aggregating metrics for ${startOfDay.toISOString().split('T')[0]}`
    );

    // Aggregate by asset
    const assetMetrics = await this.aggregateAssetMetrics(startOfDay, endOfDay);

    console.log(
      `[MetricsAggregation] Found ${assetMetrics.length} asset metrics to aggregate`
    );

    // Upsert into daily_metrics table
    for (const metric of assetMetrics) {
      await this.prisma.dailyMetric.upsert({
        where: {
          date_projectId_ipAssetId_licenseId: {
            date: startOfDay,
            projectId: metric.projectId,
            ipAssetId: metric.ipAssetId,
            licenseId: metric.licenseId,
          },
        },
        update: {
          views: metric.views,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenueCents: metric.revenueCents,
          uniqueVisitors: metric.uniqueVisitors,
          engagementTime: metric.engagementTime,
        },
        create: {
          date: startOfDay,
          projectId: metric.projectId,
          ipAssetId: metric.ipAssetId,
          licenseId: metric.licenseId,
          views: metric.views,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenueCents: metric.revenueCents,
          uniqueVisitors: metric.uniqueVisitors,
          engagementTime: metric.engagementTime,
        },
      });
    }

    console.log(
      `[MetricsAggregation] Successfully aggregated ${assetMetrics.length} metrics`
    );
  }

  /**
   * Aggregate asset metrics from raw events
   */
  private async aggregateAssetMetrics(
    start: Date,
    end: Date
  ): Promise<DailyMetricData[]> {
    // Use raw SQL for performance
    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        ip_asset_id,
        project_id,
        license_id,
        COUNT(CASE WHEN event_type = 'asset_viewed' THEN 1 END) as views,
        COUNT(CASE WHEN event_type IN ('asset_downloaded', 'license_clicked') THEN 1 END) as clicks,
        COUNT(CASE WHEN event_type = 'license_created' THEN 1 END) as conversions,
        COALESCE(SUM((props_json->>'revenueCents')::int), 0) as revenue_cents,
        COUNT(DISTINCT actor_id) as unique_visitors,
        COALESCE(SUM((props_json->>'engagementTime')::int), 0) as engagement_time
      FROM events
      WHERE occurred_at >= ${start} AND occurred_at < ${end}
        AND ip_asset_id IS NOT NULL
      GROUP BY ip_asset_id, project_id, license_id
    `;

    return results.map((r) => ({
      ipAssetId: r.ip_asset_id,
      projectId: r.project_id,
      licenseId: r.license_id,
      views: parseInt(r.views as string),
      clicks: parseInt(r.clicks as string),
      conversions: parseInt(r.conversions as string),
      revenueCents: parseInt(r.revenue_cents as string),
      uniqueVisitors: parseInt(r.unique_visitors as string),
      engagementTime: parseInt(r.engagement_time as string),
    }));
  }

  /**
   * Backfill historical metrics for a date range
   */
  async backfillMetrics(startDate: Date, endDate: Date): Promise<void> {
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      await this.aggregateDailyMetrics(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  /**
   * Get platform-wide metrics summary
   */
  async getPlatformMetricsSummary(start: Date, end: Date) {
    const metrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: { gte: start, lte: end },
      },
    });

    return {
      totalViews: metrics.reduce((sum: number, m: any) => sum + m.views, 0),
      totalClicks: metrics.reduce((sum: number, m: any) => sum + m.clicks, 0),
      totalConversions: metrics.reduce(
        (sum: number, m: any) => sum + m.conversions,
        0
      ),
      totalRevenueCents: metrics.reduce(
        (sum: number, m: any) => sum + m.revenueCents,
        0
      ),
      totalUniqueVisitors: metrics.reduce(
        (sum: number, m: any) => sum + m.uniqueVisitors,
        0
      ),
    };
  }
}
