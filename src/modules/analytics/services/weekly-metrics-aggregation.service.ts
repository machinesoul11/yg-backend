/**
 * Weekly Metrics Aggregation Service
 * Aggregates daily metrics into weekly rollups
 */

import { PrismaClient } from '@prisma/client';

export class WeeklyMetricsAggregationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Aggregate daily metrics into weekly metrics
   * @param weekStartDate - Start of the week (Monday)
   */
  async aggregateWeeklyMetrics(weekStartDate: Date): Promise<void> {
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6); // Sunday

    console.log(
      `[WeeklyAggregation] Aggregating week: ${weekStartDate.toISOString().split('T')[0]} to ${weekEndDate.toISOString().split('T')[0]}`
    );

    // Get all daily metrics for this week
    const dailyMetrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: weekStartDate,
          lte: weekEndDate,
        },
      },
    });

    if (dailyMetrics.length === 0) {
      console.log('[WeeklyAggregation] No daily metrics found for this week');
      return;
    }

    // Group by project, asset, and license
    const groupedMetrics = this.groupDailyMetrics(dailyMetrics);

    // Calculate previous week for growth comparison
    const prevWeekStart = new Date(weekStartDate);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekEndDate);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);

    const prevWeekMetrics = await this.prisma.weeklyMetric.findMany({
      where: {
        weekStartDate: prevWeekStart,
      },
    });

    const prevWeekMap = new Map(
      prevWeekMetrics.map((m) => [this.getMetricKey(m), m])
    );

    // Upsert weekly metrics
    for (const [key, metrics] of Object.entries(groupedMetrics)) {
      const { projectId, ipAssetId, licenseId } = this.parseMetricKey(key);

      const totalViews = metrics.reduce((sum, m) => sum + m.views, 0);
      const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
      const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
      const totalRevenueCents = metrics.reduce((sum, m) => sum + m.revenueCents, 0);
      const uniqueVisitors = Math.max(...metrics.map((m) => m.uniqueVisitors));
      const totalEngagementTime = metrics.reduce((sum, m) => sum + m.engagementTime, 0);

      const daysInPeriod = metrics.length;

      // Calculate growth percentages
      const prevWeek = prevWeekMap.get(key);
      const viewsGrowthPercent = this.calculateGrowth(
        totalViews,
        prevWeek?.totalViews || 0
      );
      const clicksGrowthPercent = this.calculateGrowth(
        totalClicks,
        prevWeek?.totalClicks || 0
      );
      const conversionsGrowthPercent = this.calculateGrowth(
        totalConversions,
        prevWeek?.totalConversions || 0
      );
      const revenueGrowthPercent = this.calculateGrowth(
        totalRevenueCents,
        prevWeek?.totalRevenueCents || 0
      );

      await this.prisma.weeklyMetric.upsert({
        where: {
          unique_weekly_metric: {
            weekStartDate,
            projectId,
            ipAssetId,
            licenseId,
          },
        },
        update: {
          weekEndDate,
          totalViews,
          totalClicks,
          totalConversions,
          totalRevenueCents,
          uniqueVisitors,
          totalEngagementTime,
          viewsGrowthPercent,
          clicksGrowthPercent,
          conversionsGrowthPercent,
          revenueGrowthPercent,
          avgDailyViews: totalViews / daysInPeriod,
          avgDailyClicks: totalClicks / daysInPeriod,
          avgDailyConversions: totalConversions / daysInPeriod,
          avgDailyRevenueCents: totalRevenueCents / daysInPeriod,
          daysInPeriod,
          updatedAt: new Date(),
        },
        create: {
          weekStartDate,
          weekEndDate,
          projectId,
          ipAssetId,
          licenseId,
          totalViews,
          totalClicks,
          totalConversions,
          totalRevenueCents,
          uniqueVisitors,
          totalEngagementTime,
          viewsGrowthPercent,
          clicksGrowthPercent,
          conversionsGrowthPercent,
          revenueGrowthPercent,
          avgDailyViews: totalViews / daysInPeriod,
          avgDailyClicks: totalClicks / daysInPeriod,
          avgDailyConversions: totalConversions / daysInPeriod,
          avgDailyRevenueCents: totalRevenueCents / daysInPeriod,
          daysInPeriod,
        },
      });
    }

    console.log(
      `[WeeklyAggregation] Successfully aggregated ${Object.keys(groupedMetrics).length} weekly metrics`
    );
  }

  /**
   * Backfill weekly metrics for a date range
   */
  async backfillWeeklyMetrics(startDate: Date, endDate: Date): Promise<void> {
    const currentWeek = this.getWeekStart(startDate);
    const lastWeek = this.getWeekStart(endDate);

    while (currentWeek <= lastWeek) {
      await this.aggregateWeeklyMetrics(currentWeek);
      currentWeek.setDate(currentWeek.getDate() + 7);
    }
  }

  /**
   * Get the start of the week (Monday) for a given date
   */
  private getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    weekStart.setDate(weekStart.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  /**
   * Group daily metrics by project, asset, and license
   */
  private groupDailyMetrics(metrics: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const metric of metrics) {
      const key = this.getMetricKey(metric);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(metric);
    }

    return grouped;
  }

  /**
   * Generate a unique key for grouping metrics
   */
  private getMetricKey(metric: any): string {
    return `${metric.projectId || 'null'}_${metric.ipAssetId || 'null'}_${metric.licenseId || 'null'}`;
  }

  /**
   * Parse metric key back to components
   */
  private parseMetricKey(key: string): {
    projectId: string | null;
    ipAssetId: string | null;
    licenseId: string | null;
  } {
    const [projectId, ipAssetId, licenseId] = key.split('_');
    return {
      projectId: projectId === 'null' ? null : projectId,
      ipAssetId: ipAssetId === 'null' ? null : ipAssetId,
      licenseId: licenseId === 'null' ? null : licenseId,
    };
  }

  /**
   * Calculate growth percentage
   */
  private calculateGrowth(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null;
    return ((current - previous) / previous) * 100;
  }
}
