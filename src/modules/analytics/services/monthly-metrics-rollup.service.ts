/**
 * Monthly Metrics Rollup Service
 * Aggregates daily and weekly metrics into monthly rollups
 */

import { PrismaClient } from '@prisma/client';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  eachMonthOfInterval,
  format,
  eachWeekOfInterval,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

export class MonthlyMetricsRollupService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Aggregate daily metrics into monthly rollups
   * @param monthDate - Any date within the month to aggregate
   */
  async aggregateMonthlyMetrics(monthDate: Date): Promise<void> {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth() + 1;

    console.log(
      `[MonthlyRollup] Aggregating month ${format(monthStart, 'yyyy-MM')}`
    );

    // Get all daily metrics for the month
    const dailyMetrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    if (dailyMetrics.length === 0) {
      console.log('[MonthlyRollup] No daily metrics found for this month');
      return;
    }

    // Group by projectId, ipAssetId, licenseId
    const grouped = this.groupMetricsByDimensions(dailyMetrics);

    // Get weekly breakdown for the month
    const weeklyBreakdowns = await this.getWeeklyBreakdowns(
      monthStart,
      monthEnd
    );

    // Calculate previous month metrics for growth comparison
    const previousMonthStart = subMonths(monthStart, 1);
    const previousMonthMetrics = await this.getPreviousMonthMetrics(
      previousMonthStart
    );

    // Process each group
    for (const [key, metrics] of grouped.entries()) {
      const [projectId, ipAssetId, licenseId] = key.split('|');

      const monthlyData = this.calculateMonthlyMetrics(metrics);
      const previousMonthData = previousMonthMetrics.get(key);
      const growthMetrics = this.calculateGrowthMetrics(
        monthlyData,
        previousMonthData
      );
      const weeklyBreakdown = weeklyBreakdowns.get(key) || [];

      // Upsert monthly metric
      await this.prisma.monthlyMetric.upsert({
        where: {
          unique_monthly_metric: {
            year,
            month,
            projectId: projectId === 'null' ? null : projectId,
            ipAssetId: ipAssetId === 'null' ? null : ipAssetId,
            licenseId: licenseId === 'null' ? null : licenseId,
          },
        },
        update: {
          monthStartDate: monthStart,
          monthEndDate: monthEnd,
          totalViews: monthlyData.totalViews,
          totalClicks: monthlyData.totalClicks,
          totalConversions: monthlyData.totalConversions,
          totalRevenueCents: monthlyData.totalRevenueCents,
          uniqueVisitors: monthlyData.uniqueVisitors,
          totalEngagementTime: monthlyData.totalEngagementTime,
          viewsGrowthPercent: growthMetrics.viewsGrowthPercent,
          clicksGrowthPercent: growthMetrics.clicksGrowthPercent,
          conversionsGrowthPercent: growthMetrics.conversionsGrowthPercent,
          revenueGrowthPercent: growthMetrics.revenueGrowthPercent,
          avgDailyViews: monthlyData.avgDailyViews,
          avgDailyClicks: monthlyData.avgDailyClicks,
          avgDailyConversions: monthlyData.avgDailyConversions,
          avgDailyRevenueCents: monthlyData.avgDailyRevenueCents,
          weeksInMonth: weeklyBreakdown.length,
          weeklyBreakdown,
          daysInPeriod: metrics.length,
          updatedAt: new Date(),
        },
        create: {
          monthStartDate: monthStart,
          monthEndDate: monthEnd,
          year,
          month,
          projectId: projectId === 'null' ? null : projectId,
          ipAssetId: ipAssetId === 'null' ? null : ipAssetId,
          licenseId: licenseId === 'null' ? null : licenseId,
          totalViews: monthlyData.totalViews,
          totalClicks: monthlyData.totalClicks,
          totalConversions: monthlyData.totalConversions,
          totalRevenueCents: monthlyData.totalRevenueCents,
          uniqueVisitors: monthlyData.uniqueVisitors,
          totalEngagementTime: monthlyData.totalEngagementTime,
          viewsGrowthPercent: growthMetrics.viewsGrowthPercent,
          clicksGrowthPercent: growthMetrics.clicksGrowthPercent,
          conversionsGrowthPercent: growthMetrics.conversionsGrowthPercent,
          revenueGrowthPercent: growthMetrics.revenueGrowthPercent,
          avgDailyViews: monthlyData.avgDailyViews,
          avgDailyClicks: monthlyData.avgDailyClicks,
          avgDailyConversions: monthlyData.avgDailyConversions,
          avgDailyRevenueCents: monthlyData.avgDailyRevenueCents,
          weeksInMonth: weeklyBreakdown.length,
          weeklyBreakdown,
          daysInPeriod: metrics.length,
        },
      });
    }

    console.log(
      `[MonthlyRollup] Successfully aggregated ${grouped.size} monthly metrics`
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
   * Calculate aggregated metrics for the month
   */
  private calculateMonthlyMetrics(metrics: any[]) {
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
   * Get weekly breakdowns for the month
   */
  private async getWeeklyBreakdowns(
    monthStart: Date,
    monthEnd: Date
  ): Promise<Map<string, any[]>> {
    const weeks = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1 }
    );

    const weeklyMetrics = await this.prisma.weeklyMetric.findMany({
      where: {
        weekStartDate: {
          gte: startOfWeek(monthStart, { weekStartsOn: 1 }),
          lte: endOfWeek(monthEnd, { weekStartsOn: 1 }),
        },
      },
    });

    const breakdownsMap = new Map<string, any[]>();

    for (const metric of weeklyMetrics) {
      const key = `${metric.projectId}|${metric.ipAssetId}|${metric.licenseId}`;
      if (!breakdownsMap.has(key)) {
        breakdownsMap.set(key, []);
      }
      breakdownsMap.get(key)!.push({
        weekStart: metric.weekStartDate,
        weekEnd: metric.weekEndDate,
        views: metric.totalViews,
        clicks: metric.totalClicks,
        conversions: metric.totalConversions,
        revenueCents: metric.totalRevenueCents,
        viewsGrowth: metric.viewsGrowthPercent,
      });
    }

    return breakdownsMap;
  }

  /**
   * Get previous month metrics for comparison
   */
  private async getPreviousMonthMetrics(
    previousMonthStart: Date
  ): Promise<Map<string, any>> {
    const year = previousMonthStart.getFullYear();
    const month = previousMonthStart.getMonth() + 1;

    const previousMonthlyMetrics = await this.prisma.monthlyMetric.findMany({
      where: {
        year,
        month,
      },
    });

    const metricsMap = new Map<string, any>();
    for (const metric of previousMonthlyMetrics) {
      const key = `${metric.projectId}|${metric.ipAssetId}|${metric.licenseId}`;
      metricsMap.set(key, metric);
    }

    return metricsMap;
  }

  /**
   * Calculate month-over-month growth metrics
   */
  private calculateGrowthMetrics(
    currentMonth: any,
    previousMonth: any | undefined
  ) {
    if (!previousMonth) {
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
        currentMonth.totalViews,
        previousMonth.totalViews
      ),
      clicksGrowthPercent: calculateGrowth(
        currentMonth.totalClicks,
        previousMonth.totalClicks
      ),
      conversionsGrowthPercent: calculateGrowth(
        currentMonth.totalConversions,
        previousMonth.totalConversions
      ),
      revenueGrowthPercent: calculateGrowth(
        currentMonth.totalRevenueCents,
        previousMonth.totalRevenueCents
      ),
    };
  }

  /**
   * Backfill monthly metrics for a date range
   */
  async backfillMonthlyMetrics(startDate: Date, endDate: Date): Promise<void> {
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    console.log(`[MonthlyRollup] Backfilling ${months.length} months`);

    for (const monthStart of months) {
      try {
        await this.aggregateMonthlyMetrics(monthStart);
      } catch (error) {
        console.error(
          `[MonthlyRollup] Error aggregating month ${format(monthStart, 'yyyy-MM')}:`,
          error
        );
      }
    }

    console.log('[MonthlyRollup] Backfill completed');
  }

  /**
   * Get monthly metrics summary for a year
   */
  async getMonthlyMetricsSummary(year: number) {
    const monthlyMetrics = await this.prisma.monthlyMetric.findMany({
      where: { year },
      orderBy: {
        month: 'asc',
      },
    });

    return {
      year,
      totalMonths: monthlyMetrics.length,
      totalViews: monthlyMetrics.reduce((sum, m) => sum + m.totalViews, 0),
      totalClicks: monthlyMetrics.reduce((sum, m) => sum + m.totalClicks, 0),
      totalConversions: monthlyMetrics.reduce(
        (sum, m) => sum + m.totalConversions,
        0
      ),
      totalRevenueCents: monthlyMetrics.reduce(
        (sum, m) => sum + m.totalRevenueCents,
        0
      ),
      monthlyBreakdown: monthlyMetrics.map((m) => ({
        month: m.month,
        monthName: format(m.monthStartDate, 'MMMM'),
        views: m.totalViews,
        clicks: m.totalClicks,
        conversions: m.totalConversions,
        revenueCents: m.totalRevenueCents,
        viewsGrowth: m.viewsGrowthPercent,
        weeksInMonth: m.weeksInMonth,
      })),
    };
  }

  /**
   * Get year-over-year comparison
   */
  async getYearOverYearComparison(currentYear: number, previousYear: number) {
    const [currentYearMetrics, previousYearMetrics] = await Promise.all([
      this.getMonthlyMetricsSummary(currentYear),
      this.getMonthlyMetricsSummary(previousYear),
    ]);

    const calculateYoYGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      currentYear: currentYearMetrics,
      previousYear: previousYearMetrics,
      yoyGrowth: {
        views: calculateYoYGrowth(
          currentYearMetrics.totalViews,
          previousYearMetrics.totalViews
        ),
        clicks: calculateYoYGrowth(
          currentYearMetrics.totalClicks,
          previousYearMetrics.totalClicks
        ),
        conversions: calculateYoYGrowth(
          currentYearMetrics.totalConversions,
          previousYearMetrics.totalConversions
        ),
        revenue: calculateYoYGrowth(
          currentYearMetrics.totalRevenueCents,
          previousYearMetrics.totalRevenueCents
        ),
      },
    };
  }
}
