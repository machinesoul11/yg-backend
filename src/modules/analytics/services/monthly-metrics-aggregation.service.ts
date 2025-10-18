/**
 * Monthly Metrics Aggregation Service
 * Aggregates daily and weekly metrics into monthly rollups
 */

import { PrismaClient } from '@prisma/client';

export class MonthlyMetricsAggregationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Aggregate daily metrics into monthly metrics
   * @param year - Year
   * @param month - Month (1-12)
   */
  async aggregateMonthlyMetrics(year: number, month: number): Promise<void> {
    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndDate = new Date(year, month, 0); // Last day of month

    console.log(
      `[MonthlyAggregation] Aggregating month: ${year}-${month.toString().padStart(2, '0')}`
    );

    // Get all daily metrics for this month
    const dailyMetrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: monthStartDate,
          lte: monthEndDate,
        },
      },
    });

    if (dailyMetrics.length === 0) {
      console.log('[MonthlyAggregation] No daily metrics found for this month');
      return;
    }

    // Get weekly metrics for this month
    const weeklyMetrics = await this.prisma.weeklyMetric.findMany({
      where: {
        weekStartDate: {
          gte: monthStartDate,
          lte: monthEndDate,
        },
      },
    });

    // Group by project, asset, and license
    const groupedMetrics = this.groupDailyMetrics(dailyMetrics);

    // Calculate previous month for growth comparison
    const prevMonthStartDate = new Date(year, month - 2, 1);
    const prevMonthEndDate = new Date(year, month - 1, 0);

    const prevMonthMetrics = await this.prisma.monthlyMetric.findMany({
      where: {
        year: month === 1 ? year - 1 : year,
        month: month === 1 ? 12 : month - 1,
      },
    });

    const prevMonthMap = new Map(
      prevMonthMetrics.map((m) => [this.getMetricKey(m), m])
    );

    // Upsert monthly metrics
    for (const [key, metrics] of Object.entries(groupedMetrics)) {
      const { projectId, ipAssetId, licenseId } = this.parseMetricKey(key);

      const totalViews = metrics.reduce((sum, m) => sum + m.views, 0);
      const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
      const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
      const totalRevenueCents = metrics.reduce((sum, m) => sum + m.revenueCents, 0);
      const uniqueVisitors = Math.max(...metrics.map((m) => m.uniqueVisitors));
      const totalEngagementTime = metrics.reduce((sum, m) => sum + m.engagementTime, 0);

      const daysInPeriod = metrics.length;

      // Get weekly breakdown for this project/asset/license
      const weeklyBreakdown = this.getWeeklyBreakdown(
        weeklyMetrics,
        projectId,
        ipAssetId,
        licenseId
      );

      // Calculate growth percentages
      const prevMonth = prevMonthMap.get(key);
      const viewsGrowthPercent = this.calculateGrowth(
        totalViews,
        prevMonth?.totalViews || 0
      );
      const clicksGrowthPercent = this.calculateGrowth(
        totalClicks,
        prevMonth?.totalClicks || 0
      );
      const conversionsGrowthPercent = this.calculateGrowth(
        totalConversions,
        prevMonth?.totalConversions || 0
      );
      const revenueGrowthPercent = this.calculateGrowth(
        totalRevenueCents,
        prevMonth?.totalRevenueCents || 0
      );

      await this.prisma.monthlyMetric.upsert({
        where: {
          unique_monthly_metric: {
            year,
            month,
            projectId,
            ipAssetId,
            licenseId,
          },
        },
        update: {
          monthStartDate,
          monthEndDate,
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
          weeksInMonth: weeklyBreakdown.length,
          weeklyBreakdown,
          updatedAt: new Date(),
        },
        create: {
          year,
          month,
          monthStartDate,
          monthEndDate,
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
          weeksInMonth: weeklyBreakdown.length,
          weeklyBreakdown,
        },
      });
    }

    console.log(
      `[MonthlyAggregation] Successfully aggregated ${Object.keys(groupedMetrics).length} monthly metrics`
    );
  }

  /**
   * Backfill monthly metrics for a date range
   */
  async backfillMonthlyMetrics(startYear: number, startMonth: number, endYear: number, endMonth: number): Promise<void> {
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      await this.aggregateMonthlyMetrics(currentYear, currentMonth);
      
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
  }

  /**
   * Get weekly breakdown for a specific metric group
   */
  private getWeeklyBreakdown(
    weeklyMetrics: any[],
    projectId: string | null,
    ipAssetId: string | null,
    licenseId: string | null
  ): any[] {
    return weeklyMetrics
      .filter(
        (m) =>
          m.projectId === projectId &&
          m.ipAssetId === ipAssetId &&
          m.licenseId === licenseId
      )
      .map((m) => ({
        weekStartDate: m.weekStartDate.toISOString().split('T')[0],
        weekEndDate: m.weekEndDate.toISOString().split('T')[0],
        totalViews: m.totalViews,
        totalClicks: m.totalClicks,
        totalConversions: m.totalConversions,
        totalRevenueCents: m.totalRevenueCents,
      }));
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
