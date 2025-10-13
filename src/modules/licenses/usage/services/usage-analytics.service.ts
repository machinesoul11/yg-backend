/**
 * License Usage Analytics Dashboard Service  
 * Provides data for usage analytics dashboards with caching
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  startOfDay,
  endOfDay,
  subDays,
  differenceInDays,
  eachDayOfInterval,
  format,
} from 'date-fns';
import type {
  GetUsageAnalyticsInput,
  UsageAnalytics,
  UsageTrend,
  UsageMetrics,
  PeriodComparison,
  ComparePeriods,
  UsageSource,
  PlatformUsage,
  GeographicUsage,
} from '../types';

export class LicenseUsageAnalyticsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Get comprehensive usage analytics for a license
   */
  async getUsageAnalytics(
    input: GetUsageAnalyticsInput
  ): Promise<UsageAnalytics> {
    const cacheKey = `usage:analytics:${input.licenseId}:${input.startDate.toISOString()}:${input.endDate.toISOString()}:${input.usageType || 'all'}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get current period metrics
    const currentPeriod = await this.getPeriodMetrics(
      input.licenseId,
      input.startDate,
      input.endDate,
      input.usageType
    );

    // Get previous period for comparison if requested
    let previousPeriod: UsageMetrics | undefined;
    let percentageChange: Partial<Record<keyof UsageMetrics, number>> | undefined;

    if (input.compareWithPreviousPeriod) {
      const periodDays = differenceInDays(input.endDate, input.startDate);
      const prevStart = subDays(input.startDate, periodDays + 1);
      const prevEnd = subDays(input.startDate, 1);

      previousPeriod = await this.getPeriodMetrics(
        input.licenseId,
        prevStart,
        prevEnd,
        input.usageType
      );

      percentageChange = this.calculatePercentageChange(
        currentPeriod,
        previousPeriod
      );
    }

    // Get trends
    const trends = await this.getUsageTrends(
      input.licenseId,
      input.startDate,
      input.endDate,
      input.usageType,
      input.granularity
    );

    // Get top sources
    const topSources = await this.getTopSources(
      input.licenseId,
      input.startDate,
      input.endDate
    );

    // Get platform distribution
    const topPlatforms = await this.getTopPlatforms(
      input.licenseId,
      input.startDate,
      input.endDate
    );

    // Get geographic distribution
    const geographicDistribution = await this.getGeographicDistribution(
      input.licenseId,
      input.startDate,
      input.endDate
    );

    const analytics: UsageAnalytics = {
      licenseId: input.licenseId,
      periodStart: input.startDate,
      periodEnd: input.endDate,
      currentPeriod,
      previousPeriod,
      percentageChange,
      trends,
      topSources,
      topPlatforms,
      geographicDistribution,
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(analytics));

    return analytics;
  }

  /**
   * Compare usage between two periods
   */
  async comparePeriods(input: ComparePeriods): Promise<PeriodComparison> {
    const period1 = await this.getPeriodMetrics(
      input.licenseId,
      input.period1Start,
      input.period1End,
      input.usageType
    );

    const period2 = await this.getPeriodMetrics(
      input.licenseId,
      input.period2Start,
      input.period2End,
      input.usageType
    );

    const absoluteChange: Partial<UsageMetrics> = {
      totalViews: period1.totalViews - period2.totalViews,
      totalDownloads: period1.totalDownloads - period2.totalDownloads,
      totalImpressions: period1.totalImpressions - period2.totalImpressions,
      totalClicks: period1.totalClicks - period2.totalClicks,
      totalPlays: period1.totalPlays - period2.totalPlays,
      totalStreams: period1.totalStreams - period2.totalStreams,
      totalQuantity: period1.totalQuantity - period2.totalQuantity,
      totalRevenueCents: period1.totalRevenueCents - period2.totalRevenueCents,
      uniqueSessions: period1.uniqueSessions - period2.uniqueSessions,
    };

    const percentageChange = this.calculatePercentageChange(period1, period2);

    return {
      period1,
      period2,
      absoluteChange,
      percentageChange,
    };
  }

  /**
   * Get usage trends over time with specified granularity
   */
  private async getUsageTrends(
    licenseId: string,
    startDate: Date,
    endDate: Date,
    usageType?: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<UsageTrend[]> {
    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    if (granularity === 'daily') {
      return aggregates.map((agg: any) => ({
        date: agg.date,
        metrics: this.extractMetrics(agg, usageType),
      }));
    }

    // For weekly/monthly, group the daily data
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const grouped = new Map<string, any[]>();

    for (const day of days) {
      const key =
        granularity === 'weekly'
          ? format(day, 'yyyy-ww')
          : format(day, 'yyyy-MM');

      const dayData = aggregates.find(
        (agg: any) =>
          format(new Date(agg.date), 'yyyy-MM-dd') ===
          format(day, 'yyyy-MM-dd')
      );

      if (dayData) {
        const existing = grouped.get(key) || [];
        existing.push(dayData);
        grouped.set(key, existing);
      }
    }

    // Aggregate grouped data
    return Array.from(grouped.entries()).map(([key, group]) => ({
      date: new Date(group[0].date),
      metrics: this.aggregateMetrics(group, usageType),
    }));
  }

  /**
   * Get period metrics aggregated
   */
  private async getPeriodMetrics(
    licenseId: string,
    startDate: Date,
    endDate: Date,
    usageType?: string
  ): Promise<UsageMetrics> {
    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return this.aggregateMetrics(aggregates, usageType);
  }

  /**
   * Get top referrer sources
   */
  private async getTopSources(
    licenseId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<UsageSource[]> {
    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        referrer,
        COUNT(*) as count
      FROM license_usage_events
      WHERE license_id = ${licenseId}
        AND occurred_at >= ${startDate}
        AND occurred_at <= ${endDate}
        AND referrer IS NOT NULL
        AND referrer != ''
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    const total = results.reduce((sum, r) => sum + parseInt(r.count as string), 0);

    return results.map((r) => {
      const count = parseInt(r.count as string);
      return {
        referrer: r.referrer,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /**
   * Get top platforms
   */
  private async getTopPlatforms(
    licenseId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PlatformUsage[]> {
    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        platform,
        COUNT(*) as count
      FROM license_usage_events
      WHERE license_id = ${licenseId}
        AND occurred_at >= ${startDate}
        AND occurred_at <= ${endDate}
        AND platform IS NOT NULL
      GROUP BY platform
      ORDER BY count DESC
    `;

    const total = results.reduce((sum, r) => sum + parseInt(r.count as string), 0);

    return results.map((r) => {
      const count = parseInt(r.count as string);
      return {
        platform: r.platform,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /**
   * Get geographic distribution
   */
  private async getGeographicDistribution(
    licenseId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 20
  ): Promise<GeographicUsage[]> {
    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        geographic_location as location,
        COUNT(*) as count
      FROM license_usage_events
      WHERE license_id = ${licenseId}
        AND occurred_at >= ${startDate}
        AND occurred_at <= ${endDate}
        AND geographic_location IS NOT NULL
      GROUP BY geographic_location
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    const total = results.reduce((sum, r) => sum + parseInt(r.count as string), 0);

    return results.map((r) => {
      const count = parseInt(r.count as string);
      return {
        location: r.location,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /**
   * Helper methods
   */

  private extractMetrics(aggregate: any, usageType?: string): UsageMetrics {
    if (usageType) {
      // Return only specific metric
      const fieldMap: Record<string, keyof any> = {
        view: 'totalViews',
        download: 'totalDownloads',
        impression: 'totalImpressions',
        click: 'totalClicks',
        play: 'totalPlays',
        stream: 'totalStreams',
      };

      const field = fieldMap[usageType];
      const value = field ? aggregate[field] : 0;

      return {
        totalViews: usageType === 'view' ? value : 0,
        totalDownloads: usageType === 'download' ? value : 0,
        totalImpressions: usageType === 'impression' ? value : 0,
        totalClicks: usageType === 'click' ? value : 0,
        totalPlays: usageType === 'play' ? value : 0,
        totalStreams: usageType === 'stream' ? value : 0,
        totalQuantity: value,
        totalRevenueCents: aggregate.totalRevenueCents || 0,
        uniqueSessions: aggregate.uniqueSessions || 0,
      };
    }

    return {
      totalViews: aggregate.totalViews || 0,
      totalDownloads: aggregate.totalDownloads || 0,
      totalImpressions: aggregate.totalImpressions || 0,
      totalClicks: aggregate.totalClicks || 0,
      totalPlays: aggregate.totalPlays || 0,
      totalStreams: aggregate.totalStreams || 0,
      totalQuantity: aggregate.totalQuantity || 0,
      totalRevenueCents: aggregate.totalRevenueCents || 0,
      uniqueSessions: aggregate.uniqueSessions || 0,
    };
  }

  private aggregateMetrics(
    aggregates: any[],
    usageType?: string
  ): UsageMetrics {
    return aggregates.reduce(
      (acc, agg) => {
        const metrics = this.extractMetrics(agg, usageType);
        return {
          totalViews: acc.totalViews + metrics.totalViews,
          totalDownloads: acc.totalDownloads + metrics.totalDownloads,
          totalImpressions: acc.totalImpressions + metrics.totalImpressions,
          totalClicks: acc.totalClicks + metrics.totalClicks,
          totalPlays: acc.totalPlays + metrics.totalPlays,
          totalStreams: acc.totalStreams + metrics.totalStreams,
          totalQuantity: acc.totalQuantity + metrics.totalQuantity,
          totalRevenueCents: acc.totalRevenueCents + metrics.totalRevenueCents,
          uniqueSessions: acc.uniqueSessions + metrics.uniqueSessions,
        };
      },
      {
        totalViews: 0,
        totalDownloads: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalPlays: 0,
        totalStreams: 0,
        totalQuantity: 0,
        totalRevenueCents: 0,
        uniqueSessions: 0,
      } as UsageMetrics
    );
  }

  private calculatePercentageChange(
    current: UsageMetrics,
    previous: UsageMetrics
  ): Partial<Record<keyof UsageMetrics, number>> {
    const calculate = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      totalViews: calculate(current.totalViews, previous.totalViews),
      totalDownloads: calculate(current.totalDownloads, previous.totalDownloads),
      totalImpressions: calculate(current.totalImpressions, previous.totalImpressions),
      totalClicks: calculate(current.totalClicks, previous.totalClicks),
      totalPlays: calculate(current.totalPlays, previous.totalPlays),
      totalStreams: calculate(current.totalStreams, previous.totalStreams),
      totalQuantity: calculate(current.totalQuantity, previous.totalQuantity),
      totalRevenueCents: calculate(
        current.totalRevenueCents,
        previous.totalRevenueCents
      ),
      uniqueSessions: calculate(current.uniqueSessions, previous.uniqueSessions),
    };
  }
}
