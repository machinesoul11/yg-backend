/**
 * Weekly Metrics Rollup Service
 * Aggregates daily metrics into weekly rollups
 */

import { PrismaClient } from '@prisma/client';
import { startOfWeek, endOfWeek, subWeeks, eachWeekOfInterval, format } from 'date-fns';

export class WeeklyMetricsRollupService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Aggregate daily metrics into weekly rollups
   * @param weekStartDate - Start of the week to aggregate
   */
  async aggregateWeeklyMetrics(weekStartDate: Date): Promise<void> {
    const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 1 }); // Sunday

    console.log(
      `[WeeklyRollup] Aggregating week ${format(weekStart, 'yyyy-MM-dd')} to ${format(weekEnd, 'yyyy-MM-dd')}`
    );

    // Get all daily metrics for the week
    const dailyMetrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    if (dailyMetrics.length === 0) {
      console.log('[WeeklyRollup] No daily metrics found for this week');
      return;
    }

    // Group by projectId, ipAssetId, licenseId
    const grouped = this.groupMetricsByDimensions(dailyMetrics);

    // Calculate previous week metrics for growth comparison
    const previousWeekStart = subWeeks(weekStart, 1);
    const previousWeekMetrics = await this.getPreviousWeekMetrics(
      previousWeekStart
    );

    // Process each group
    for (const [key, metrics] of grouped.entries()) {
      const [projectId, ipAssetId, licenseId] = key.split('|');

      const weeklyData = this.calculateWeeklyMetrics(metrics);
      const previousWeekData = previousWeekMetrics.get(key);
      const growthMetrics = this.calculateGrowthMetrics(
        weeklyData,
        previousWeekData
      );

      // Upsert weekly metric
      await this.prisma.weeklyMetric.upsert({
        where: {
          unique_weekly_metric: {
            weekStartDate: weekStart,
            projectId: projectId === 'null' ? null : projectId,
            ipAssetId: ipAssetId === 'null' ? null : ipAssetId,
            licenseId: licenseId === 'null' ? null : licenseId,
          },
        },
        update: {
          weekEndDate: weekEnd,
          totalViews: weeklyData.totalViews,
          totalClicks: weeklyData.totalClicks,
          totalConversions: weeklyData.totalConversions,
          totalRevenueCents: weeklyData.totalRevenueCents,
          uniqueVisitors: weeklyData.uniqueVisitors,
          totalEngagementTime: weeklyData.totalEngagementTime,
          viewsGrowthPercent: growthMetrics.viewsGrowthPercent,
          clicksGrowthPercent: growthMetrics.clicksGrowthPercent,
          conversionsGrowthPercent: growthMetrics.conversionsGrowthPercent,
          revenueGrowthPercent: growthMetrics.revenueGrowthPercent,
          avgDailyViews: weeklyData.avgDailyViews,
          avgDailyClicks: weeklyData.avgDailyClicks,
          avgDailyConversions: weeklyData.avgDailyConversions,
          avgDailyRevenueCents: weeklyData.avgDailyRevenueCents,
          daysInPeriod: metrics.length,
          updatedAt: new Date(),
        },
        create: {
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          projectId: projectId === 'null' ? null : projectId,
          ipAssetId: ipAssetId === 'null' ? null : ipAssetId,
          licenseId: licenseId === 'null' ? null : licenseId,
          totalViews: weeklyData.totalViews,
          totalClicks: weeklyData.totalClicks,
          totalConversions: weeklyData.totalConversions,
          totalRevenueCents: weeklyData.totalRevenueCents,
          uniqueVisitors: weeklyData.uniqueVisitors,
          totalEngagementTime: weeklyData.totalEngagementTime,
          viewsGrowthPercent: growthMetrics.viewsGrowthPercent,
          clicksGrowthPercent: growthMetrics.clicksGrowthPercent,
          conversionsGrowthPercent: growthMetrics.conversionsGrowthPercent,
          revenueGrowthPercent: growthMetrics.revenueGrowthPercent,
          avgDailyViews: weeklyData.avgDailyViews,
          avgDailyClicks: weeklyData.avgDailyClicks,
          avgDailyConversions: weeklyData.avgDailyConversions,
          avgDailyRevenueCents: weeklyData.avgDailyRevenueCents,
          daysInPeriod: metrics.length,
        },
      });
    }

    console.log(
      `[WeeklyRollup] Successfully aggregated ${grouped.size} weekly metrics`
    );
  }

  /**
   * Group daily metrics by dimension keys
   */
  private groupMetricsByDimensions(
    dailyMetrics: any[]
  ): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const metric of dailyMetrics) {
      const key = `${metric.projectId}|${metric.ipAssetId}|${metric.licenseId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }

    return grouped;
  }

  /**
   * Calculate aggregated metrics for the week
   */
  private calculateWeeklyMetrics(metrics: any[]) {
    const totalViews = metrics.reduce((sum, m) => sum + m.views, 0);
    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
    const totalRevenueCents = metrics.reduce(
      (sum, m) => sum + m.revenueCents,
      0
    );
    const uniqueVisitors = metrics.reduce(
      (sum, m) => sum + m.uniqueVisitors,
      0
    );
    const totalEngagementTime = metrics.reduce(
      (sum, m) => sum + m.engagementTime,
      0
    );

    const daysCount = metrics.length;

    return {
      totalViews,
      totalClicks,
      totalConversions,
      totalRevenueCents,
      uniqueVisitors,
      totalEngagementTime,
      avgDailyViews: daysCount > 0 ? totalViews / daysCount : 0,
      avgDailyClicks: daysCount > 0 ? totalClicks / daysCount : 0,
      avgDailyConversions: daysCount > 0 ? totalConversions / daysCount : 0,
      avgDailyRevenueCents:
        daysCount > 0 ? totalRevenueCents / daysCount : 0,
    };
  }

  /**
   * Get previous week metrics for comparison
   */
  private async getPreviousWeekMetrics(
    previousWeekStart: Date
  ): Promise<Map<string, any>> {
    const previousWeekEnd = endOfWeek(previousWeekStart, { weekStartsOn: 1 });

    const previousWeeklyMetrics = await this.prisma.weeklyMetric.findMany({
      where: {
        weekStartDate: previousWeekStart,
        weekEndDate: previousWeekEnd,
      },
    });

    const metricsMap = new Map<string, any>();
    for (const metric of previousWeeklyMetrics) {
      const key = `${metric.projectId}|${metric.ipAssetId}|${metric.licenseId}`;
      metricsMap.set(key, metric);
    }

    return metricsMap;
  }

  /**
   * Calculate week-over-week growth metrics
   */
  private calculateGrowthMetrics(
    currentWeek: any,
    previousWeek: any | undefined
  ) {
    if (!previousWeek) {
      return {
        viewsGrowthPercent: null,
        clicksGrowthPercent: null,
        conversionsGrowthPercent: null,
        revenueGrowthPercent: null,
      };
    }

    const calculateGrowth = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      viewsGrowthPercent: calculateGrowth(
        currentWeek.totalViews,
        previousWeek.totalViews
      ),
      clicksGrowthPercent: calculateGrowth(
        currentWeek.totalClicks,
        previousWeek.totalClicks
      ),
      conversionsGrowthPercent: calculateGrowth(
        currentWeek.totalConversions,
        previousWeek.totalConversions
      ),
      revenueGrowthPercent: calculateGrowth(
        currentWeek.totalRevenueCents,
        previousWeek.totalRevenueCents
      ),
    };
  }

  /**
   * Backfill weekly metrics for a date range
   */
  async backfillWeeklyMetrics(startDate: Date, endDate: Date): Promise<void> {
    const weeks = eachWeekOfInterval(
      { start: startDate, end: endDate },
      { weekStartsOn: 1 }
    );

    console.log(`[WeeklyRollup] Backfilling ${weeks.length} weeks`);

    for (const weekStart of weeks) {
      try {
        await this.aggregateWeeklyMetrics(weekStart);
      } catch (error) {
        console.error(
          `[WeeklyRollup] Error aggregating week ${format(weekStart, 'yyyy-MM-dd')}:`,
          error
        );
      }
    }

    console.log('[WeeklyRollup] Backfill completed');
  }

  /**
   * Get weekly metrics summary for a date range
   */
  async getWeeklyMetricsSummary(startDate: Date, endDate: Date) {
    const weeklyMetrics = await this.prisma.weeklyMetric.findMany({
      where: {
        weekStartDate: { gte: startDate },
        weekEndDate: { lte: endDate },
      },
      orderBy: {
        weekStartDate: 'asc',
      },
    });

    return {
      totalWeeks: weeklyMetrics.length,
      totalViews: weeklyMetrics.reduce((sum, m) => sum + m.totalViews, 0),
      totalClicks: weeklyMetrics.reduce((sum, m) => sum + m.totalClicks, 0),
      totalConversions: weeklyMetrics.reduce(
        (sum, m) => sum + m.totalConversions,
        0
      ),
      totalRevenueCents: weeklyMetrics.reduce(
        (sum, m) => sum + m.totalRevenueCents,
        0
      ),
      weeklyBreakdown: weeklyMetrics.map((m) => ({
        weekStart: m.weekStartDate,
        weekEnd: m.weekEndDate,
        views: m.totalViews,
        clicks: m.totalClicks,
        conversions: m.totalConversions,
        revenueCents: m.totalRevenueCents,
        viewsGrowth: m.viewsGrowthPercent,
      })),
    };
  }
}
