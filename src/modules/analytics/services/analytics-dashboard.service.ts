/**
 * Analytics Dashboard Service
 * Handles dashboard metrics for creators, brands, and platform admins
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';
import type {
  CreatorDashboard,
  BrandCampaignMetrics,
  PlatformMetrics,
  DateRange,
} from '../types';
import { EVENT_TYPES } from '@/lib/constants/event-types';

export class AnalyticsDashboardService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get Creator Dashboard Metrics
   */
  async getCreatorDashboard(
    creatorId: string,
    period: string
  ): Promise<CreatorDashboard> {
    const cacheKey = `analytics:creator:${creatorId}:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateRange = this.getPeriodDateRange(period);

    // Get all assets owned by creator
    const creatorAssets = await this.prisma.ipAsset.findMany({
      where: {
        ownerships: {
          some: { creatorId },
        },
        deletedAt: null,
      },
      select: { id: true, title: true },
    });

    const assetIds = creatorAssets.map((a) => a.id);

    // Get aggregated metrics for creator's assets
    const metrics = await (this.prisma as any).dailyMetric.findMany({
      where: {
        ipAssetId: { in: assetIds },
        date: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    // Calculate summary
    const totalViews = metrics.reduce((sum: number, m: any) => sum + m.views, 0);
    const totalLicenses = await this.prisma.license.count({
      where: {
        ipAssetId: { in: assetIds },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
    const totalRevenueCents = metrics.reduce(
      (sum: number, m: any) => sum + m.revenueCents,
      0
    );
    const avgConversionRate =
      totalViews > 0 ? (totalLicenses / totalViews) * 100 : 0;

    // Top assets
    const assetMetrics = new Map<string, { views: number; licenses: number; revenue: number }>();
    
    metrics.forEach((m: any) => {
      if (!m.ipAssetId) return;
      const existing = assetMetrics.get(m.ipAssetId) || {
        views: 0,
        licenses: 0,
        revenue: 0,
      };
      existing.views += m.views;
      existing.licenses += m.conversions;
      existing.revenue += m.revenueCents;
      assetMetrics.set(m.ipAssetId, existing);
    });

    const topAssets = Array.from(assetMetrics.entries())
      .map(([assetId, stats]) => {
        const asset = creatorAssets.find((a) => a.id === assetId);
        return {
          assetId,
          assetTitle: asset?.title || 'Unknown',
          views: stats.views,
          licenses: stats.licenses,
          revenueCents: stats.revenue,
        };
      })
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);

    // Revenue timeline
    const revenueByDate = new Map<string, number>();
    metrics.forEach((m: any) => {
      const dateKey = m.date.toISOString().split('T')[0];
      revenueByDate.set(
        dateKey,
        (revenueByDate.get(dateKey) || 0) + m.revenueCents
      );
    });

    const revenueTimeline = Array.from(revenueByDate.entries())
      .map(([date, revenueCents]) => ({ date, revenueCents }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Traffic sources
    const trafficSources = await this.getTrafficSources(assetIds, dateRange);

    const result: CreatorDashboard = {
      summary: {
        totalViews,
        totalLicenses,
        totalRevenueCents,
        avgConversionRate,
      },
      topAssets,
      revenueTimeline,
      trafficSources,
    };

    // Cache for 10 minutes
    await this.redis.setex(cacheKey, 600, JSON.stringify(result));

    return result;
  }

  /**
   * Get Brand Campaign Metrics
   */
  async getBrandCampaignMetrics(
    brandId: string,
    campaignId: string | undefined,
    dateRange: DateRange
  ): Promise<BrandCampaignMetrics> {
    // Get brand's projects (campaigns)
    const projectsWhere: any = {
      brandId,
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    };

    if (campaignId) {
      projectsWhere.id = campaignId;
    }

    const projects = await this.prisma.project.findMany({
      where: projectsWhere,
      include: {
        licenses: {
          include: {
            ipAsset: true,
          },
        },
      },
    });

    const campaigns = await Promise.all(
      projects.map(async (project) => {
        // Calculate spend (sum of license fees)
        const totalSpendCents = project.licenses.reduce(
          (sum, license) => sum + (license.feeCents || 0),
          0
        );

        // Get metrics for licensed assets
        const assetIds = project.licenses.map((l) => l.ipAssetId);
        const metrics = await (this.prisma as any).dailyMetric.findMany({
          where: {
            ipAssetId: { in: assetIds },
            date: { gte: dateRange.start, lte: dateRange.end },
          },
        });

        const totalImpressions = metrics.reduce(
          (sum: number, m: any) => sum + m.views,
          0
        );
        const totalClicks = metrics.reduce(
          (sum: number, m: any) => sum + m.clicks,
          0
        );
        const totalConversions = metrics.reduce(
          (sum: number, m: any) => sum + m.conversions,
          0
        );
        const totalRevenue = metrics.reduce(
          (sum: number, m: any) => sum + m.revenueCents,
          0
        );

        const roi =
          totalSpendCents > 0
            ? ((totalRevenue - totalSpendCents) / totalSpendCents) * 100
            : 0;

        // Asset performance
        const assetPerformance = project.licenses.map((license) => {
          const assetMetrics = metrics.filter(
            (m: any) => m.ipAssetId === license.ipAssetId
          );
          const views = assetMetrics.reduce((sum: number, m: any) => sum + m.views, 0);
          const clicks = assetMetrics.reduce(
            (sum: number, m: any) => sum + m.clicks,
            0
          );
          const ctr = views > 0 ? (clicks / views) * 100 : 0;

          return {
            assetId: license.ipAssetId,
            assetTitle: license.ipAsset?.title || 'Unknown',
            views,
            clicks,
            ctr,
          };
        });

        return {
          campaignId: project.id,
          campaignName: project.name,
          totalSpendCents,
          totalImpressions,
          totalClicks,
          totalConversions,
          roi,
          assetPerformance,
        };
      })
    );

    return { campaigns };
  }

  /**
   * Get Platform-Wide Metrics (Admin Only)
   */
  async getPlatformMetrics(period: string): Promise<PlatformMetrics> {
    const cacheKey = `analytics:platform:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateRange = this.getPeriodDateRange(period);
    const previousRange = this.getPreviousPeriodDateRange(period);

    // User metrics
    const totalUsers = await this.prisma.user.count({
      where: { deleted_at: null },
    });
    const newUsers = await this.prisma.user.count({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        deleted_at: null,
      },
    });
    const activeUsers = await this.prisma.event.findMany({
      where: {
        occurredAt: { gte: dateRange.start, lte: dateRange.end },
        actorId: { not: null },
      },
      distinct: ['actorId'],
    });

    // Creator metrics
    const totalCreators = await this.prisma.creator.count({
      where: { deletedAt: null },
    });
    const activeCreators = await this.prisma.ipAsset.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        deletedAt: null,
      },
      distinct: ['createdBy'],
    });
    
    const creatorRevenue = await (this.prisma as any).dailyMetric.aggregate({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: { revenueCents: true },
    });
    const avgRevenuePerCreator =
      activeCreators.length > 0
        ? (creatorRevenue._sum.revenueCents || 0) / activeCreators.length
        : 0;

    // Brand metrics
    const totalBrands = await this.prisma.brand.count({
      where: { deletedAt: null },
    });
    const activeBrands = await this.prisma.license.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      distinct: ['brandId'],
    });
    
    const brandSpend = await this.prisma.license.aggregate({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: { feeCents: true },
    });
    const avgSpendPerBrand =
      activeBrands.length > 0
        ? (brandSpend._sum.feeCents || 0) / activeBrands.length
        : 0;

    // Asset metrics
    const totalAssets = await this.prisma.ipAsset.count({
      where: { deletedAt: null },
    });
    const uploadedAssets = await this.prisma.ipAsset.count({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        deletedAt: null,
      },
    });
    
    const assetViews = await (this.prisma as any).dailyMetric.aggregate({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: { views: true },
      _count: { ipAssetId: true },
    });
    const avgViewsPerAsset =
      assetViews._count.ipAssetId > 0
        ? (assetViews._sum.views || 0) / assetViews._count.ipAssetId
        : 0;

    // License metrics
    const totalLicenses = await this.prisma.license.count();
    const createdLicenses = await this.prisma.license.count({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
    const renewedLicenses = await this.prisma.license.count({
      where: {
        parentLicenseId: { not: null },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
    const renewalRate =
      createdLicenses > 0 ? (renewedLicenses / createdLicenses) * 100 : 0;

    // Revenue metrics
    const currentRevenue = await (this.prisma as any).dailyMetric.aggregate({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: { revenueCents: true },
    });
    
    const previousRevenue = await (this.prisma as any).dailyMetric.aggregate({
      where: {
        date: { gte: previousRange.start, lte: previousRange.end },
      },
      _sum: { revenueCents: true },
    });

    const totalCents = currentRevenue._sum.revenueCents || 0;
    const previousCents = previousRevenue._sum.revenueCents || 0;
    const growth =
      previousCents > 0 ? ((totalCents - previousCents) / previousCents) * 100 : 0;

    // Revenue timeline
    const revenueMetrics = await (this.prisma as any).dailyMetric.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      orderBy: { date: 'asc' },
    });

    const revenueByDate = new Map<string, number>();
    revenueMetrics.forEach((m: any) => {
      const dateKey = m.date.toISOString().split('T')[0];
      revenueByDate.set(
        dateKey,
        (revenueByDate.get(dateKey) || 0) + m.revenueCents
      );
    });

    const timeline = Array.from(revenueByDate.entries())
      .map(([date, revenueCents]) => ({ date, revenueCents }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result: PlatformMetrics = {
      users: {
        total: totalUsers,
        new: newUsers,
        active: activeUsers.length,
      },
      creators: {
        total: totalCreators,
        active: activeCreators.length,
        avgRevenuePerCreator,
      },
      brands: {
        total: totalBrands,
        active: activeBrands.length,
        avgSpendPerBrand,
      },
      assets: {
        total: totalAssets,
        uploaded: uploadedAssets,
        avgViewsPerAsset,
      },
      licenses: {
        total: totalLicenses,
        created: createdLicenses,
        renewalRate,
      },
      revenue: {
        totalCents,
        growth,
        timeline,
      },
    };

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  }

  /**
   * Helper: Get traffic sources for assets
   */
  private async getTrafficSources(
    assetIds: string[],
    dateRange: DateRange
  ) {
    const result: any[] = await this.prisma.$queryRaw`
      SELECT 
        COALESCE(a.utm_source, 'direct') as source,
        COUNT(DISTINCT e.session_id) as visits,
        COUNT(CASE WHEN e.event_type = 'license_created' THEN 1 END) as conversions
      FROM events e
      LEFT JOIN attribution a ON a.event_id = e.id
      WHERE e.ip_asset_id = ANY(${assetIds})
        AND e.occurred_at >= ${dateRange.start}
        AND e.occurred_at <= ${dateRange.end}
      GROUP BY source
      ORDER BY visits DESC
      LIMIT 10
    `;

    return result.map((r) => ({
      source: r.source,
      visits: parseInt(r.visits as string),
      conversions: parseInt(r.conversions as string),
    }));
  }

  /**
   * Helper: Get date range for period
   */
  private getPeriodDateRange(period: string): DateRange {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        // Already set
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case '1y':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'all':
        start.setFullYear(2020, 0, 1); // Platform inception
        break;
      default:
        start.setDate(start.getDate() - 30);
    }

    return { start, end };
  }

  /**
   * Helper: Get previous period date range for comparison
   */
  private getPreviousPeriodDateRange(period: string): DateRange {
    const current = this.getPeriodDateRange(period);
    const duration = current.end.getTime() - current.start.getTime();

    const end = new Date(current.start);
    end.setMilliseconds(end.getMilliseconds() - 1);

    const start = new Date(end);
    start.setMilliseconds(start.getMilliseconds() - duration);

    return { start, end };
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateDashboardCache(
    scope: 'creator' | 'brand' | 'platform',
    id?: string
  ): Promise<void> {
    let pattern: string;
    
    if (scope === 'creator' && id) {
      pattern = `analytics:creator:${id}:*`;
    } else if (scope === 'platform') {
      pattern = `analytics:platform:*`;
    } else {
      return;
    }

    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
