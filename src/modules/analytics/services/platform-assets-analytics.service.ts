/**
 * Platform Assets Analytics Service
 * Provides asset upload trends and popular asset type analytics for admin users
 */

import { PrismaClient, AssetType, AssetStatus } from '@prisma/client';
import type { Redis } from 'ioredis';

/**
 * Date Range Interface
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Granularity Type
 */
export type Granularity = 'daily' | 'weekly' | 'monthly';

/**
 * Upload Trend Data Point
 */
interface UploadTrendPoint {
  date: string;
  count: number;
  byType: Record<string, number>;
}

/**
 * Popular Asset Type
 */
interface PopularAssetType {
  type: AssetType;
  count: number;
  percentage: number;
  averageFileSizeBytes: number;
  totalStorageBytes: number;
  topMimeTypes: Array<{
    mimeType: string;
    count: number;
  }>;
}

/**
 * Asset Analytics Response
 */
export interface AssetAnalytics {
  dateRange: {
    start: string;
    end: string;
  };
  granularity: Granularity;
  uploadTrends: UploadTrendPoint[];
  popularTypes: PopularAssetType[];
  summary: {
    totalUploads: number;
    growthRate: number;
    totalStorageBytes: number;
    averageFileSizeBytes: number;
    uploadsByStatus: Record<string, number>;
  };
  metadata: {
    cached: boolean;
    cacheTimestamp?: string;
    queryExecutionTimeMs?: number;
  };
}

/**
 * Filter Options
 */
export interface AssetAnalyticsFilters {
  assetType?: AssetType;
  projectId?: string;
  status?: AssetStatus;
}

export class PlatformAssetsAnalyticsService {
  private readonly CACHE_PREFIX = 'analytics:platform:assets';
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get comprehensive asset analytics
   */
  async getAssetAnalytics(
    dateRange: DateRange,
    granularity: Granularity = 'daily',
    filters: AssetAnalyticsFilters = {}
  ): Promise<AssetAnalytics> {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(dateRange, granularity, filters);
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return {
        ...data,
        metadata: {
          ...data.metadata,
          cached: true,
          cacheTimestamp: new Date().toISOString(),
        },
      };
    }

    // Calculate previous period for growth comparison
    const previousRange = this.getPreviousPeriod(dateRange);

    // Execute queries in parallel
    const [
      uploadTrends,
      popularTypes,
      currentPeriodStats,
      previousPeriodStats,
    ] = await Promise.all([
      this.getUploadTrends(dateRange, granularity, filters),
      this.getPopularAssetTypes(dateRange, filters),
      this.getPeriodStatistics(dateRange, filters),
      this.getPeriodStatistics(previousRange, filters),
    ]);

    // Calculate growth rate
    const growthRate = previousPeriodStats.totalUploads > 0
      ? ((currentPeriodStats.totalUploads - previousPeriodStats.totalUploads) / previousPeriodStats.totalUploads) * 100
      : 0;

    const result: AssetAnalytics = {
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      granularity,
      uploadTrends,
      popularTypes,
      summary: {
        totalUploads: currentPeriodStats.totalUploads,
        growthRate: Math.round(growthRate * 100) / 100,
        totalStorageBytes: currentPeriodStats.totalStorageBytes,
        averageFileSizeBytes: currentPeriodStats.averageFileSizeBytes,
        uploadsByStatus: currentPeriodStats.uploadsByStatus,
      },
      metadata: {
        cached: false,
        queryExecutionTimeMs: Date.now() - startTime,
      },
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Get upload trends over time
   */
  private async getUploadTrends(
    dateRange: DateRange,
    granularity: Granularity,
    filters: AssetAnalyticsFilters
  ): Promise<UploadTrendPoint[]> {
    const sqlGranularity = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';

    // Build where conditions
    const whereConditions: any = {
      created_at: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deleted_at: null,
    };

    if (filters.assetType) {
      whereConditions.type = filters.assetType;
    }

    if (filters.projectId) {
      whereConditions.project_id = filters.projectId;
    }

    if (filters.status) {
      whereConditions.status = filters.status;
    }

    // Query using raw SQL for better performance with date truncation
    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${sqlGranularity}, created_at) as date,
        type,
        COUNT(*)::int as count
      FROM ip_assets
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND deleted_at IS NULL
        ${filters.assetType ? this.prisma.$queryRawUnsafe(`AND type = '${filters.assetType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.status ? this.prisma.$queryRawUnsafe(`AND status = '${filters.status}'`) : this.prisma.$queryRawUnsafe('')}
      GROUP BY DATE_TRUNC(${sqlGranularity}, created_at), type
      ORDER BY date ASC
    `;

    // Group by date and aggregate types
    const dateMap = new Map<string, UploadTrendPoint>();

    results.forEach((row) => {
      const dateKey = row.date.toISOString().split('T')[0];
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateKey,
          count: 0,
          byType: {},
        });
      }

      const point = dateMap.get(dateKey)!;
      point.count += row.count;
      point.byType[row.type] = (point.byType[row.type] || 0) + row.count;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get popular asset types with detailed metrics
   */
  private async getPopularAssetTypes(
    dateRange: DateRange,
    filters: AssetAnalyticsFilters
  ): Promise<PopularAssetType[]> {
    // Get asset type counts and storage metrics
    const typeStats: any[] = await this.prisma.$queryRaw`
      SELECT 
        type,
        COUNT(*)::int as count,
        AVG(file_size)::bigint as avg_file_size,
        SUM(file_size)::bigint as total_storage,
        ARRAY_AGG(DISTINCT mime_type) as mime_types
      FROM ip_assets
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND deleted_at IS NULL
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.status ? this.prisma.$queryRawUnsafe(`AND status = '${filters.status}'`) : this.prisma.$queryRawUnsafe('')}
      GROUP BY type
      ORDER BY count DESC
    `;

    const totalAssets = typeStats.reduce((sum, stat) => sum + stat.count, 0);

    // Get top mime types per asset type
    const popularTypes: PopularAssetType[] = [];

    for (const stat of typeStats) {
      // Get top mime types for this asset type
      const topMimeTypes: any[] = await this.prisma.$queryRaw`
        SELECT 
          mime_type,
          COUNT(*)::int as count
        FROM ip_assets
        WHERE created_at >= ${dateRange.start}
          AND created_at <= ${dateRange.end}
          AND deleted_at IS NULL
          AND type = ${stat.type}
          ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
          ${filters.status ? this.prisma.$queryRawUnsafe(`AND status = '${filters.status}'`) : this.prisma.$queryRawUnsafe('')}
        GROUP BY mime_type
        ORDER BY count DESC
        LIMIT 5
      `;

      popularTypes.push({
        type: stat.type,
        count: stat.count,
        percentage: totalAssets > 0 ? (stat.count / totalAssets) * 100 : 0,
        averageFileSizeBytes: Number(stat.avg_file_size || 0),
        totalStorageBytes: Number(stat.total_storage || 0),
        topMimeTypes: topMimeTypes.map(mt => ({
          mimeType: mt.mime_type,
          count: mt.count,
        })),
      });
    }

    return popularTypes;
  }

  /**
   * Get period statistics
   */
  private async getPeriodStatistics(
    dateRange: DateRange,
    filters: AssetAnalyticsFilters
  ): Promise<{
    totalUploads: number;
    totalStorageBytes: number;
    averageFileSizeBytes: number;
    uploadsByStatus: Record<string, number>;
  }> {
    // Build where clause
    const whereConditions: any = {
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deletedAt: null,
    };

    if (filters.assetType) {
      whereConditions.type = filters.assetType;
    }

    if (filters.projectId) {
      whereConditions.projectId = filters.projectId;
    }

    if (filters.status) {
      whereConditions.status = filters.status;
    }

    // Get aggregate stats
    const stats = await this.prisma.ipAsset.aggregate({
      where: whereConditions,
      _count: true,
      _sum: {
        fileSize: true,
      },
      _avg: {
        fileSize: true,
      },
    });

    // Get uploads by status
    const statusCounts = await this.prisma.ipAsset.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
        ...(filters.assetType && { type: filters.assetType }),
        ...(filters.projectId && { projectId: filters.projectId }),
      },
      _count: true,
    });

    const uploadsByStatus: Record<string, number> = {};
    statusCounts.forEach((item) => {
      uploadsByStatus[item.status] = typeof item._count === 'object' && item._count !== null && '_all' in item._count 
        ? (item._count as any)._all 
        : (typeof item._count === 'number' ? item._count : 0);
    });

    return {
      totalUploads: stats._count,
      totalStorageBytes: Number(stats._sum.fileSize || 0),
      averageFileSizeBytes: Number(stats._avg.fileSize || 0),
      uploadsByStatus,
    };
  }

  /**
   * Get previous period for growth comparison
   */
  private getPreviousPeriod(dateRange: DateRange): DateRange {
    const duration = dateRange.end.getTime() - dateRange.start.getTime();
    
    const end = new Date(dateRange.start);
    end.setMilliseconds(-1);
    
    const start = new Date(end);
    start.setMilliseconds(-duration);

    return { start, end };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(
    dateRange: DateRange,
    granularity: Granularity,
    filters: AssetAnalyticsFilters
  ): string {
    const parts = [
      this.CACHE_PREFIX,
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
      granularity,
    ];

    if (filters.assetType) parts.push(`type:${filters.assetType}`);
    if (filters.projectId) parts.push(`project:${filters.projectId}`);
    if (filters.status) parts.push(`status:${filters.status}`);

    return parts.join(':');
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(pattern?: string): Promise<void> {
    const searchPattern = pattern || `${this.CACHE_PREFIX}:*`;
    const keys = await this.redis.keys(searchPattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
