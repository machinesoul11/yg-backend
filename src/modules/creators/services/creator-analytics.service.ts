/**
 * Creator Analytics Service
 * Business logic for creator performance analytics
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type {
  GetEngagementAnalyticsInput,
  GetPortfolioPerformanceInput,
  GetLicenseMetricsInput,
  GetBenchmarksInput,
} from '../schemas/creator-analytics.schema';
import type {
  EngagementAnalyticsResponse,
  PortfolioPerformanceResponse,
  LicenseMetricsResponse,
  BenchmarkComparisonResponse,
  DateRange,
  MetricsAggregation,
  TimeSeriesPoint,
  AssetPerformance,
  LicenseAggregation,
  BenchmarkCalculation,
} from '../types/creator-analytics.types';
import { CreatorNotFoundError } from '../errors/creator.errors';
import { redis } from '@/lib/redis';
import { sub, startOfDay, endOfDay, startOfHour, endOfHour, startOfWeek, startOfMonth } from 'date-fns';

export class CreatorAnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get engagement analytics (views, clicks, conversions)
   */
  async getEngagementAnalytics(
    input: GetEngagementAnalyticsInput
  ): Promise<EngagementAnalyticsResponse> {
    // Verify creator exists
    await this.verifyCreatorExists(input.id);

    // Parse date range with defaults (last 30 days)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 30);

    // Try to get from cache
    const cacheKey = `creator:${input.id}:engagement:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.granularity}`;
    const cached = await this.getFromCache<EngagementAnalyticsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get creator's assets
    const creatorAssets = await this.getCreatorAssetIds(input.id);

    // Aggregate metrics from events and daily_metrics
    const metrics = await this.aggregateEngagementMetrics(creatorAssets, dateRange);

    // Get time series data
    const timeSeries = await this.getEngagementTimeSeries(
      creatorAssets,
      dateRange,
      input.granularity || 'day'
    );

    // Get top performing assets
    const topAssets = await this.getTopPerformingAssets(creatorAssets, dateRange, 5);

    // Calculate comparison if requested
    let comparison: EngagementAnalyticsResponse['comparison'] | undefined;
    if (input.compareWithPrevious) {
      comparison = await this.getEngagementComparison(creatorAssets, dateRange);
    }

    const response: EngagementAnalyticsResponse = {
      creatorId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      metrics: {
        totalViews: metrics.views,
        totalClicks: metrics.clicks,
        totalConversions: metrics.conversions,
        uniqueVisitors: metrics.uniqueVisitors,
        avgEngagementTime: metrics.engagementTime,
        clickThroughRate: metrics.views > 0 ? (metrics.clicks / metrics.views) * 100 : 0,
        conversionRate: metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0,
      },
      timeSeries: timeSeries.map((point) => ({
        timestamp: point.timestamp.toISOString(),
        views: point.metrics.views,
        clicks: point.metrics.clicks,
        conversions: point.metrics.conversions,
        uniqueVisitors: point.metrics.uniqueVisitors,
      })),
      topAssets: topAssets.map((asset) => ({
        assetId: asset.assetId,
        title: asset.title,
        type: asset.type,
        views: asset.metrics.views,
        conversions: asset.metrics.conversions,
      })),
      comparison,
    };

    // Cache for 15 minutes
    await this.setCache(cacheKey, response, 900);

    return response;
  }

  /**
   * Get portfolio performance
   */
  async getPortfolioPerformance(
    input: GetPortfolioPerformanceInput
  ): Promise<PortfolioPerformanceResponse> {
    // Verify creator exists
    await this.verifyCreatorExists(input.id);

    // Parse date range
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 90);

    // Build filters
    const filters: any = {
      deletedAt: null,
    };
    if (input.assetType) {
      filters.type = input.assetType;
    }
    if (input.status) {
      filters.status = input.status;
    }

    // Get creator's assets with performance data
    const assetsWithMetrics = await this.getPortfolioAssetsWithMetrics(
      input.id,
      dateRange,
      filters,
      input.sortBy || 'views',
      input.sortOrder || 'desc',
      input.limit || 20,
      input.offset || 0
    );

    // Get total count for pagination
    const totalAssets = await this.prisma.ipAsset.count({
      where: {
        ownerships: {
          some: {
            creatorId: input.id,
            startDate: { lte: dateRange.end },
            OR: [{ endDate: null }, { endDate: { gte: dateRange.start } }],
          },
        },
        ...filters,
      },
    });

    // Calculate summary statistics
    const summary = {
      totalAssets,
      publishedAssets: await this.prisma.ipAsset.count({
        where: {
          ownerships: {
            some: { creatorId: input.id },
          },
          status: 'PUBLISHED',
          deletedAt: null,
        },
      }),
      totalViews: assetsWithMetrics.reduce((sum, a) => sum + a.metrics.views, 0),
      totalRevenueCents: assetsWithMetrics.reduce((sum, a) => sum + a.metrics.revenueCents, 0),
      avgViewsPerAsset:
        assetsWithMetrics.length > 0
          ? Math.round(
              assetsWithMetrics.reduce((sum, a) => sum + a.metrics.views, 0) /
                assetsWithMetrics.length
            )
          : 0,
      avgRevenuePerAssetCents:
        assetsWithMetrics.length > 0
          ? Math.round(
              assetsWithMetrics.reduce((sum, a) => sum + a.metrics.revenueCents, 0) /
                assetsWithMetrics.length
            )
          : 0,
    };

    // Calculate performance distribution
    const performanceDistribution = this.calculatePerformanceDistribution(assetsWithMetrics);

    return {
      creatorId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary,
      assets: assetsWithMetrics.map((asset) => ({
        assetId: asset.assetId,
        title: asset.title,
        type: asset.type,
        status: asset.status,
        createdAt: asset.createdAt.toISOString(),
        views: asset.metrics.views,
        clicks: asset.metrics.clicks,
        conversions: asset.metrics.conversions,
        revenueCents: asset.metrics.revenueCents,
        activeLicenses: asset.activeLicenses,
        engagementRate:
          asset.metrics.views > 0
            ? ((asset.metrics.clicks + asset.metrics.conversions) / asset.metrics.views) * 100
            : 0,
        thumbnailUrl: asset.thumbnailUrl,
      })),
      pagination: {
        total: totalAssets,
        limit: input.limit || 20,
        offset: input.offset || 0,
        hasMore: (input.offset || 0) + (input.limit || 20) < totalAssets,
      },
      performanceDistribution,
    };
  }

  /**
   * Get license metrics
   */
  async getLicenseMetrics(input: GetLicenseMetricsInput): Promise<LicenseMetricsResponse> {
    // Verify creator exists
    await this.verifyCreatorExists(input.id);

    // Parse date range
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Get creator's assets
    const creatorAssets = await this.getCreatorAssetIds(input.id);

    // Build license filters
    const licenseFilters: any = {
      ipAssetId: { in: creatorAssets },
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    };

    if (!input.includeExpired) {
      licenseFilters.NOT = {
        status: { in: ['EXPIRED', 'TERMINATED', 'CANCELED'] },
      };
    }

    // Get license aggregations
    const licenses = await this.prisma.license.findMany({
      where: licenseFilters,
      select: {
        id: true,
        status: true,
        licenseType: true,
        feeCents: true,
        revShareBps: true,
        ipAssetId: true,
        startDate: true,
        endDate: true,
        ipAsset: {
          select: {
            title: true,
          },
        },
      },
    });

    // Aggregate by status
    const byStatus = this.aggregateLicensesByField(licenses, 'status').map(item => ({
      status: item.status || 'UNKNOWN',
      count: item.count,
      percentage: item.percentage,
      revenueCents: item.revenueCents,
    }));

    // Aggregate by type
    const byType = this.aggregateLicensesByField(licenses, 'licenseType').map(item => ({
      type: item.type || 'UNKNOWN',
      count: item.count,
      percentage: item.percentage,
      revenueCents: item.revenueCents,
    }));

    // Calculate revenue time series
    const revenueTimeSeries = await this.getLicenseRevenueTimeSeries(creatorAssets, dateRange);

    // Get top licensed assets
    const topLicensedAssets = this.getTopLicensedAssets(licenses, 5);

    // Calculate license velocity metrics
    const licenseVelocity = await this.calculateLicenseVelocity(input.id, creatorAssets);

    // Calculate summary
    const activeLicenses = licenses.filter((l) => l.status === 'ACTIVE').length;
    const expiringLicenses = licenses.filter(
      (l) => l.status === 'EXPIRING_SOON' || l.status === 'ACTIVE'
    ).length;
    const totalRevenueCents = licenses.reduce((sum, l) => sum + l.feeCents, 0);

    return {
      creatorId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary: {
        totalLicenses: licenses.length,
        activeLicenses,
        expiringLicenses,
        totalRevenueCents,
        avgLicenseValueCents: licenses.length > 0 ? Math.round(totalRevenueCents / licenses.length) : 0,
      },
      byStatus,
      byType,
      revenueTimeSeries,
      topLicensedAssets,
      licenseVelocity,
    };
  }

  /**
   * Get benchmark comparison
   */
  async getBenchmarks(input: GetBenchmarksInput): Promise<BenchmarkComparisonResponse> {
    // Verify creator exists
    const creator = await this.prisma.creator.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        specialties: true,
        createdAt: true,
        verifiedAt: true,
      },
    });

    if (!creator) {
      throw new CreatorNotFoundError(input.id);
    }

    // Parse date range
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 90);

    // Determine segment
    const segment = await this.determineCreatorSegment(creator, input.segment || 'all');

    // Get creator's metrics
    const creatorMetrics = await this.getCreatorMetrics(input.id, dateRange);

    // Get benchmark data for segment
    const benchmarkData = await this.getBenchmarkData(segment, dateRange);

    // Calculate benchmark comparisons
    const requestedMetrics = input.metrics || [
      'engagementRate',
      'conversionRate',
      'avgRevenuePerAsset',
      'licenseVelocity',
      'portfolioGrowth',
      'viewsPerAsset',
    ];

    const benchmarks = requestedMetrics.map((metric) => {
      const creatorValue = creatorMetrics[metric] || 0;
      const benchmarkValue = benchmarkData[metric]?.median || 0;
      const percentile = this.calculatePercentile(
        creatorValue,
        benchmarkData[metric]?.distribution || []
      );
      const difference =
        benchmarkValue > 0 ? ((creatorValue - benchmarkValue) / benchmarkValue) * 100 : 0;

      const performance: 'above' | 'at' | 'below' = difference > 5 ? 'above' : difference < -5 ? 'below' : 'at';

      return {
        metric,
        label: this.getMetricLabel(metric),
        yourValue: creatorValue,
        benchmarkValue,
        percentile,
        performance,
        difference,
        unit: this.getMetricUnit(metric),
      };
    });

    // Calculate category breakdowns
    const categoryBreakdown = this.calculateCategoryBreakdown(benchmarks);

    // Generate insights
    const insights = this.generateInsights(benchmarks, categoryBreakdown);

    return {
      creatorId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      segment,
      benchmarks,
      categoryBreakdown,
      insights,
    };
  }

  // ==================== Private Helper Methods ====================

  private async verifyCreatorExists(creatorId: string): Promise<void> {
    const exists = await this.prisma.creator.findUnique({
      where: { id: creatorId },
      select: { id: true },
    });

    if (!exists) {
      throw new CreatorNotFoundError(creatorId);
    }
  }

  private parseDateRange(
    startDate: string | undefined,
    endDate: string | undefined,
    defaultDays: number
  ): DateRange {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : sub(end, { days: defaultDays });

    return {
      start: startOfDay(start),
      end: endOfDay(end),
    };
  }

  private async getCreatorAssetIds(creatorId: string): Promise<string[]> {
    const assets = await this.prisma.ipAsset.findMany({
      where: {
        ownerships: {
          some: {
            creatorId,
          },
        },
        deletedAt: null,
      },
      select: { id: true },
    });

    return assets.map((a) => a.id);
  }

  private async aggregateEngagementMetrics(
    assetIds: string[],
    dateRange: DateRange
  ): Promise<MetricsAggregation> {
    if (assetIds.length === 0) {
      return {
        views: 0,
        clicks: 0,
        conversions: 0,
        uniqueVisitors: 0,
        engagementTime: 0,
        revenueCents: 0,
      };
    }

    const metrics = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: { in: assetIds },
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
        uniqueVisitors: true,
        engagementTime: true,
        revenueCents: true,
      },
    });

    return {
      views: metrics._sum.views || 0,
      clicks: metrics._sum.clicks || 0,
      conversions: metrics._sum.conversions || 0,
      uniqueVisitors: metrics._sum.uniqueVisitors || 0,
      engagementTime: metrics._sum.engagementTime || 0,
      revenueCents: metrics._sum.revenueCents || 0,
    };
  }

  private async getEngagementTimeSeries(
    assetIds: string[],
    dateRange: DateRange,
    granularity: 'hour' | 'day' | 'week' | 'month'
  ): Promise<TimeSeriesPoint[]> {
    if (assetIds.length === 0) return [];

    // Use daily_metrics for day/week/month, would need event aggregation for hour
    const metrics = await this.prisma.dailyMetric.findMany({
      where: {
        ipAssetId: { in: assetIds },
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        date: true,
        views: true,
        clicks: true,
        conversions: true,
        uniqueVisitors: true,
        engagementTime: true,
      },
      orderBy: { date: 'asc' },
    });

    // Group by granularity
    return this.groupMetricsByGranularity(metrics, granularity);
  }

  private groupMetricsByGranularity(
    metrics: any[],
    granularity: 'hour' | 'day' | 'week' | 'month'
  ): TimeSeriesPoint[] {
    const grouped = new Map<string, MetricsAggregation>();

    metrics.forEach((m) => {
      let key: string;
      const date = new Date(m.date);

      switch (granularity) {
        case 'week':
          key = startOfWeek(date).toISOString();
          break;
        case 'month':
          key = startOfMonth(date).toISOString();
          break;
        case 'hour':
        case 'day':
        default:
          key = date.toISOString();
      }

      const existing = grouped.get(key) || {
        views: 0,
        clicks: 0,
        conversions: 0,
        uniqueVisitors: 0,
        engagementTime: 0,
        revenueCents: 0,
      };

      grouped.set(key, {
        views: existing.views + m.views,
        clicks: existing.clicks + m.clicks,
        conversions: existing.conversions + m.conversions,
        uniqueVisitors: Math.max(existing.uniqueVisitors, m.uniqueVisitors),
        engagementTime: existing.engagementTime + m.engagementTime,
        revenueCents: existing.revenueCents,
      });
    });

    return Array.from(grouped.entries()).map(([timestamp, metrics]) => ({
      timestamp: new Date(timestamp),
      metrics,
    }));
  }

  private async getTopPerformingAssets(
    assetIds: string[],
    dateRange: DateRange,
    limit: number
  ): Promise<AssetPerformance[]> {
    if (assetIds.length === 0) return [];

    const assetMetrics = await this.prisma.dailyMetric.groupBy({
      by: ['ipAssetId'],
      where: {
        ipAssetId: { in: assetIds },
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
        uniqueVisitors: true,
        engagementTime: true,
        revenueCents: true,
      },
      orderBy: {
        _sum: {
          views: 'desc',
        },
      },
      take: limit,
    });

    const assetDetails = await this.prisma.ipAsset.findMany({
      where: {
        id: { in: assetMetrics.map((m) => m.ipAssetId!).filter(Boolean) },
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        thumbnailUrl: true,
        licenses: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    return assetMetrics
      .map((m) => {
        const asset = assetDetails.find((a) => a.id === m.ipAssetId);
        if (!asset) return null;

        return {
          assetId: asset.id,
          title: asset.title,
          type: asset.type as string,
          status: asset.status as string,
          createdAt: asset.createdAt,
          metrics: {
            views: m._sum.views || 0,
            clicks: m._sum.clicks || 0,
            conversions: m._sum.conversions || 0,
            uniqueVisitors: m._sum.uniqueVisitors || 0,
            engagementTime: m._sum.engagementTime || 0,
            revenueCents: m._sum.revenueCents || 0,
          },
          activeLicenses: asset.licenses.length,
          thumbnailUrl: asset.thumbnailUrl,
        };
      })
      .filter((a) => a !== null) as AssetPerformance[];
  }

  private async getEngagementComparison(
    assetIds: string[],
    currentPeriod: DateRange
  ): Promise<EngagementAnalyticsResponse['comparison']> {
    const periodLength = currentPeriod.end.getTime() - currentPeriod.start.getTime();
    const previousPeriod: DateRange = {
      start: new Date(currentPeriod.start.getTime() - periodLength),
      end: new Date(currentPeriod.end.getTime() - periodLength),
    };

    const currentMetrics = await this.aggregateEngagementMetrics(assetIds, currentPeriod);
    const previousMetrics = await this.aggregateEngagementMetrics(assetIds, previousPeriod);

    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentCR =
      currentMetrics.clicks > 0 ? (currentMetrics.conversions / currentMetrics.clicks) * 100 : 0;
    const previousCR =
      previousMetrics.clicks > 0
        ? (previousMetrics.conversions / previousMetrics.clicks) * 100
        : 0;

    return {
      periodLabel: 'Previous Period',
      viewsChange: calculateChange(currentMetrics.views, previousMetrics.views),
      clicksChange: calculateChange(currentMetrics.clicks, previousMetrics.clicks),
      conversionsChange: calculateChange(currentMetrics.conversions, previousMetrics.conversions),
      conversionRateChange: calculateChange(currentCR, previousCR),
    };
  }

  private async getPortfolioAssetsWithMetrics(
    creatorId: string,
    dateRange: DateRange,
    filters: any,
    sortBy: string,
    sortOrder: string,
    limit: number,
    offset: number
  ): Promise<AssetPerformance[]> {
    // Get assets with their metrics
    const assets = await this.prisma.ipAsset.findMany({
      where: {
        ownerships: {
          some: {
            creatorId,
            startDate: { lte: dateRange.end },
            OR: [{ endDate: null }, { endDate: { gte: dateRange.start } }],
          },
        },
        ...filters,
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        thumbnailUrl: true,
        dailyMetrics: {
          where: {
            date: { gte: dateRange.start, lte: dateRange.end },
          },
          select: {
            views: true,
            clicks: true,
            conversions: true,
            uniqueVisitors: true,
            engagementTime: true,
            revenueCents: true,
          },
        },
        licenses: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
      take: limit,
      skip: offset,
    });

    return assets.map((asset) => {
      const metrics = asset.dailyMetrics.reduce(
        (sum, m) => ({
          views: sum.views + m.views,
          clicks: sum.clicks + m.clicks,
          conversions: sum.conversions + m.conversions,
          uniqueVisitors: Math.max(sum.uniqueVisitors, m.uniqueVisitors),
          engagementTime: sum.engagementTime + m.engagementTime,
          revenueCents: sum.revenueCents + m.revenueCents,
        }),
        {
          views: 0,
          clicks: 0,
          conversions: 0,
          uniqueVisitors: 0,
          engagementTime: 0,
          revenueCents: 0,
        }
      );

      return {
        assetId: asset.id,
        title: asset.title,
        type: asset.type,
        status: asset.status,
        createdAt: asset.createdAt,
        metrics,
        activeLicenses: asset.licenses.length,
        thumbnailUrl: asset.thumbnailUrl,
      };
    });
  }

  private calculatePerformanceDistribution(assets: AssetPerformance[]) {
    if (assets.length === 0) {
      return { topPerformers: 0, goodPerformers: 0, averagePerformers: 0, underPerformers: 0 };
    }

    const sorted = [...assets].sort((a, b) => b.metrics.views - a.metrics.views);
    const quartile = Math.ceil(sorted.length / 4);

    return {
      topPerformers: Math.min(quartile, sorted.length),
      goodPerformers: Math.min(quartile, Math.max(0, sorted.length - quartile)),
      averagePerformers: Math.min(quartile, Math.max(0, sorted.length - 2 * quartile)),
      underPerformers: Math.max(0, sorted.length - 3 * quartile),
    };
  }

  private aggregateLicensesByField(
    licenses: any[],
    field: 'status' | 'licenseType'
  ): Array<{ status?: string; type?: string; count: number; percentage: number; revenueCents: number }> {
    const aggregation = licenses.reduce((acc, license) => {
      const key = license[field];
      if (!acc[key]) {
        acc[key] = { count: 0, revenueCents: 0 };
      }
      acc[key].count++;
      acc[key].revenueCents += license.feeCents;
      return acc;
    }, {} as Record<string, { count: number; revenueCents: number }>);

    const total = licenses.length;

    return Object.entries(aggregation).map(([key, value]) => {
      const val = value as { count: number; revenueCents: number };
      const baseData = {
        count: val.count,
        percentage: total > 0 ? (val.count / total) * 100 : 0,
        revenueCents: val.revenueCents,
      };
      
      if (field === 'status') {
        return { status: key, ...baseData };
      } else {
        return { type: key, ...baseData };
      }
    });
  }

  private async getLicenseRevenueTimeSeries(assetIds: string[], dateRange: DateRange) {
    // Aggregate by month
    const licenses = await this.prisma.license.findMany({
      where: {
        ipAssetId: { in: assetIds },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        createdAt: true,
        feeCents: true,
        parentLicenseId: true,
      },
    });

    const monthlyData = new Map<
      string,
      { revenueCents: number; newLicenses: number; renewals: number }
    >();

    licenses.forEach((license) => {
      const monthKey = startOfMonth(license.createdAt).toISOString();
      const existing = monthlyData.get(monthKey) || {
        revenueCents: 0,
        newLicenses: 0,
        renewals: 0,
      };

      if (license.parentLicenseId) {
        existing.renewals++;
      } else {
        existing.newLicenses++;
      }
      existing.revenueCents += license.feeCents;

      monthlyData.set(monthKey, existing);
    });

    return Array.from(monthlyData.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getTopLicensedAssets(licenses: any[], limit: number) {
    const assetMap = new Map<string, { title: string; count: number; revenueCents: number }>();

    licenses.forEach((license) => {
      if (!license.ipAssetId) return;

      const existing = assetMap.get(license.ipAssetId) || {
        title: license.ipAsset?.title || 'Unknown',
        count: 0,
        revenueCents: 0,
      };

      existing.count++;
      existing.revenueCents += license.feeCents;

      assetMap.set(license.ipAssetId, existing);
    });

    return Array.from(assetMap.entries())
      .map(([assetId, data]) => ({
        assetId,
        title: data.title,
        licenseCount: data.count,
        revenueCents: data.revenueCents,
      }))
      .sort((a, b) => b.licenseCount - a.licenseCount)
      .slice(0, limit);
  }

  private async calculateLicenseVelocity(creatorId: string, assetIds: string[]) {
    // Calculate average days from asset creation to first license
    const assetsWithFirstLicense = await this.prisma.ipAsset.findMany({
      where: {
        id: { in: assetIds },
        licenses: { some: {} },
      },
      select: {
        createdAt: true,
        licenses: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const daysToFirstLicense = assetsWithFirstLicense
      .filter((a) => a.licenses.length > 0)
      .map((a) => {
        const daysDiff =
          (a.licenses[0].createdAt.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff;
      });

    const avgDaysToFirstLicense =
      daysToFirstLicense.length > 0
        ? daysToFirstLicense.reduce((sum, d) => sum + d, 0) / daysToFirstLicense.length
        : 0;

    // Get monthly license growth rate (last 6 months)
    const sixMonthsAgo = sub(new Date(), { months: 6 });
    const recentLicenses = await this.prisma.license.findMany({
      where: {
        ipAssetId: { in: assetIds },
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    });

    // Calculate growth rate
    const monthlyGrowthRate = this.calculateMonthlyGrowthRate(recentLicenses);

    return {
      averageDaysToFirstLicense: Math.round(avgDaysToFirstLicense),
      averageDaysToConversion: Math.round(avgDaysToFirstLicense * 0.8), // Simplified
      monthlyGrowthRate,
    };
  }

  private calculateMonthlyGrowthRate(licenses: { createdAt: Date }[]): number {
    if (licenses.length < 2) return 0;

    const monthlyCount = new Map<string, number>();
    licenses.forEach((l) => {
      const month = startOfMonth(l.createdAt).toISOString();
      monthlyCount.set(month, (monthlyCount.get(month) || 0) + 1);
    });

    const months = Array.from(monthlyCount.keys()).sort();
    if (months.length < 2) return 0;

    const firstMonthCount = monthlyCount.get(months[0]) || 1;
    const lastMonthCount = monthlyCount.get(months[months.length - 1]) || 1;

    return ((lastMonthCount - firstMonthCount) / firstMonthCount) * 100;
  }

  private async determineCreatorSegment(
    creator: any,
    segmentType: string
  ): Promise<{ type: string; label: string; size: number }> {
    // Simplified segmentation - can be expanded based on business logic
    let label = 'All Creators';
    let size = 1000; // Default benchmark size

    if (segmentType === 'specialty' && creator.specialties) {
      const specialties = Array.isArray(creator.specialties)
        ? creator.specialties
        : [creator.specialties];
      label = `${specialties[0]} Creators`;
      size = 250;
    } else if (segmentType === 'experience') {
      const monthsSinceJoined = Math.floor(
        (Date.now() - creator.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      if (monthsSinceJoined < 6) {
        label = 'New Creators (0-6 months)';
        size = 500;
      } else if (monthsSinceJoined < 24) {
        label = 'Established Creators (6-24 months)';
        size = 750;
      } else {
        label = 'Veteran Creators (24+ months)';
        size = 300;
      }
    }

    return { type: segmentType, label, size };
  }

  private async getCreatorMetrics(creatorId: string, dateRange: DateRange) {
    const assetIds = await this.getCreatorAssetIds(creatorId);
    const metrics = await this.aggregateEngagementMetrics(assetIds, dateRange);

    const assets = await this.prisma.ipAsset.count({
      where: {
        ownerships: { some: { creatorId } },
        deletedAt: null,
      },
    });

    const licenses = await this.prisma.license.count({
      where: {
        ipAssetId: { in: assetIds },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    return {
      engagementRate: metrics.views > 0 ? (metrics.clicks / metrics.views) * 100 : 0,
      conversionRate: metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0,
      avgRevenuePerAsset: assets > 0 ? metrics.revenueCents / assets : 0,
      licenseVelocity: licenses / Math.max(1, assets),
      portfolioGrowth: 0, // Would need historical data
      viewsPerAsset: assets > 0 ? metrics.views / assets : 0,
    };
  }

  private async getBenchmarkData(segment: any, dateRange: DateRange) {
    // Simplified - in production, this would query pre-calculated benchmark data
    // For now, return mock data structure
    return {
      engagementRate: { median: 2.5, distribution: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0] },
      conversionRate: { median: 5.0, distribution: [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0] },
      avgRevenuePerAsset: {
        median: 50000,
        distribution: [10000, 25000, 40000, 50000, 60000, 75000, 100000],
      },
      licenseVelocity: { median: 0.75, distribution: [0.2, 0.4, 0.6, 0.75, 0.9, 1.1, 1.3] },
      portfolioGrowth: { median: 10.0, distribution: [2.0, 5.0, 8.0, 10.0, 12.0, 15.0, 20.0] },
      viewsPerAsset: { median: 500, distribution: [100, 250, 400, 500, 650, 800, 1000] },
    };
  }

  private calculatePercentile(value: number, distribution: number[]): number {
    if (distribution.length === 0) return 50;

    const sorted = [...distribution].sort((a, b) => a - b);
    let count = 0;
    for (const v of sorted) {
      if (v < value) count++;
    }

    return (count / sorted.length) * 100;
  }

  private getMetricLabel(metric: string): string {
    const labels: Record<string, string> = {
      engagementRate: 'Engagement Rate',
      conversionRate: 'Conversion Rate',
      avgRevenuePerAsset: 'Avg Revenue per Asset',
      licenseVelocity: 'License Velocity',
      portfolioGrowth: 'Portfolio Growth',
      viewsPerAsset: 'Views per Asset',
    };
    return labels[metric] || metric;
  }

  private getMetricUnit(metric: string): string {
    const units: Record<string, string> = {
      engagementRate: '%',
      conversionRate: '%',
      avgRevenuePerAsset: 'cents',
      licenseVelocity: 'licenses/asset',
      portfolioGrowth: '%',
      viewsPerAsset: 'count',
    };
    return units[metric] || '';
  }

  private calculateCategoryBreakdown(benchmarks: any[]) {
    const engagement = benchmarks.filter((b) =>
      ['engagementRate', 'viewsPerAsset'].includes(b.metric)
    );
    const monetization = benchmarks.filter((b) =>
      ['conversionRate', 'avgRevenuePerAsset', 'licenseVelocity'].includes(b.metric)
    );
    const growth = benchmarks.filter((b) => ['portfolioGrowth'].includes(b.metric));

    const calculateScore = (metrics: any[]) => {
      if (metrics.length === 0) return 50;
      const avgPercentile =
        metrics.reduce((sum, m) => sum + m.percentile, 0) / metrics.length;
      return avgPercentile;
    };

    return {
      engagement: {
        metrics: engagement.map((m) => m.metric),
        overallScore: Math.round(calculateScore(engagement)),
        percentile: Math.round(calculateScore(engagement)),
      },
      monetization: {
        metrics: monetization.map((m) => m.metric),
        overallScore: Math.round(calculateScore(monetization)),
        percentile: Math.round(calculateScore(monetization)),
      },
      growth: {
        metrics: growth.map((m) => m.metric),
        overallScore: Math.round(calculateScore(growth)),
        percentile: Math.round(calculateScore(growth)),
      },
      quality: {
        metrics: [],
        overallScore: 50,
        percentile: 50,
      },
    };
  }

  private generateInsights(benchmarks: any[], categoryBreakdown: any) {
    const insights: Array<{
      category: string;
      message: string;
      severity: 'positive' | 'neutral' | 'attention';
      recommendation?: string;
    }> = [];

    benchmarks.forEach((b) => {
      if (b.performance === 'above' && b.percentile > 75) {
        insights.push({
          category: b.metric,
          message: `Your ${b.label} is in the top 25% of ${b.unit === '%' ? 'creators' : 'performers'}`,
          severity: 'positive',
        });
      } else if (b.performance === 'below' && b.percentile < 25) {
        insights.push({
          category: b.metric,
          message: `Your ${b.label} is below the segment average`,
          severity: 'attention',
          recommendation: `Consider strategies to improve ${b.label.toLowerCase()}`,
        });
      }
    });

    return insights;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  private async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
}
