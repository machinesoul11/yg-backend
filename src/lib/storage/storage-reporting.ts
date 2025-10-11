/**
 * Storage Usage Reporting Service
 * 
 * Provides detailed insights into storage consumption across the platform,
 * enabling capacity planning, cost optimization, and user accountability.
 */

import { PrismaClient, AssetType } from '@prisma/client';

export interface StorageSnapshot {
  date: Date;
  entityType: 'user' | 'project' | 'brand' | 'platform';
  entityId: string | null;
  totalBytes: bigint;
  fileCount: number;
  averageFileSize: bigint;
  largestFileSize: bigint;
  largestFileId: string | null;
  breakdownByType: Record<string, { bytes: bigint; count: number }>;
}

export interface StorageTrend {
  current: bigint;
  previous: bigint;
  growthRate: number; // percentage
  growthBytes: bigint;
}

export interface StorageQuota {
  entityType: 'user' | 'project' | 'brand';
  entityId: string;
  quotaBytes: bigint;
  usedBytes: bigint;
  remainingBytes: bigint;
  percentUsed: number;
  isExceeded: boolean;
}

export interface StorageReport {
  summary: {
    totalBytes: bigint;
    totalFiles: number;
    averageFileSize: bigint;
    largestFile: { id: string; size: bigint; title: string } | null;
  };
  breakdown: {
    byType: Record<string, { bytes: bigint; count: number; percentage: number }>;
    byUser: Array<{ id: string; name: string; bytes: bigint }>;
    byProject: Array<{ id: string; name: string; bytes: bigint }>;
  };
  trends: {
    daily: StorageTrend;
    weekly: StorageTrend;
    monthly: StorageTrend;
  };
  topConsumers: {
    users: Array<{ id: string; name: string; bytes: bigint }>;
    projects: Array<{ id: string; name: string; bytes: bigint }>;
  };
}

/**
 * Storage Usage Reporting Service
 */
export class StorageReportingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate and store current storage metrics
   */
  async captureStorageSnapshot(): Promise<void> {
    const now = new Date();

    // Platform-wide metrics
    await this.captureSnapshot('platform', null, now);

    // Per-user metrics
    const users = await this.prisma.user.findMany({
      where: { deleted_at: null },
      select: { id: true },
    });

    for (const user of users) {
      await this.captureSnapshot('user', user.id, now);
    }

    // Per-project metrics
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const project of projects) {
      await this.captureSnapshot('project', project.id, now);
    }

    // Per-brand metrics
    const brands = await this.prisma.brand.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const brand of brands) {
      await this.captureSnapshot('brand', brand.id, now);
    }
  }

  /**
   * Capture snapshot for a specific entity
   */
  private async captureSnapshot(
    entityType: 'user' | 'project' | 'brand' | 'platform',
    entityId: string | null,
    snapshotDate: Date
  ): Promise<void> {
    const where: any = { deletedAt: null };

    if (entityType === 'user' && entityId) {
      where.createdBy = entityId;
    } else if (entityType === 'project' && entityId) {
      where.projectId = entityId;
    } else if (entityType === 'brand' && entityId) {
      where.project = { brandId: entityId };
    }

    // Get aggregate stats
    const stats = await this.prisma.ipAsset.aggregate({
      where,
      _sum: { fileSize: true },
      _count: { id: true },
      _avg: { fileSize: true },
      _max: { fileSize: true },
    });

    // Get breakdown by type
    const byType = await this.prisma.ipAsset.groupBy({
      by: ['type'],
      where,
      _sum: { fileSize: true },
      _count: { id: true },
    });

    const breakdownByType: Record<string, { bytes: string; count: number }> = {};
    for (const item of byType) {
      breakdownByType[item.type] = {
        bytes: (item._sum.fileSize || BigInt(0)).toString(),
        count: item._count.id,
      };
    }

    // Get largest file
    const largestFile = await this.prisma.ipAsset.findFirst({
      where: { ...where, fileSize: stats._max.fileSize || BigInt(0) },
      select: { id: true },
    });

    // Calculate trend (compare with previous snapshot)
    const previousSnapshot = await this.prisma.storageMetrics.findFirst({
      where: {
        entityType,
        entityId,
        snapshotDate: { lt: snapshotDate },
      },
      orderBy: { snapshotDate: 'desc' },
    });

    let storageTrendBps = 0; // basis points
    if (previousSnapshot && previousSnapshot.totalBytes > BigInt(0)) {
      const current = stats._sum.fileSize || BigInt(0);
      const previous = previousSnapshot.totalBytes;
      const growth = Number(current - previous);
      const prevNum = Number(previous);
      storageTrendBps = prevNum > 0 ? Math.round((growth / prevNum) * 10000) : 0;
    }

    // Store or update metrics
    await this.prisma.storageMetrics.upsert({
      where: {
        snapshotDate_entityType_entityId: {
          snapshotDate,
          entityType,
          entityId: entityId || '',
        },
      },
      create: {
        snapshotDate,
        entityType,
        entityId,
        totalBytes: stats._sum.fileSize || BigInt(0),
        fileCount: stats._count.id || 0,
        averageFileSize: BigInt(Math.floor(Number(stats._avg.fileSize || 0))),
        largestFileSize: stats._max.fileSize || BigInt(0),
        largestFileId: largestFile?.id,
        storageTrendBps,
        breakdownByType,
      },
      update: {
        totalBytes: stats._sum.fileSize || BigInt(0),
        fileCount: stats._count.id || 0,
        averageFileSize: BigInt(Math.floor(Number(stats._avg.fileSize || 0))),
        largestFileSize: stats._max.fileSize || BigInt(0),
        largestFileId: largestFile?.id,
        storageTrendBps,
        breakdownByType,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get current storage usage for an entity
   */
  async getCurrentUsage(
    entityType: 'user' | 'project' | 'brand' | 'platform',
    entityId?: string
  ): Promise<StorageSnapshot | null> {
    const metrics = await this.prisma.storageMetrics.findFirst({
      where: {
        entityType,
        entityId: entityId || null,
      },
      orderBy: { snapshotDate: 'desc' },
    });

    if (!metrics) {
      return null;
    }

    return {
      date: metrics.snapshotDate,
      entityType: entityType as any,
      entityId: metrics.entityId,
      totalBytes: metrics.totalBytes,
      fileCount: metrics.fileCount,
      averageFileSize: metrics.averageFileSize,
      largestFileSize: metrics.largestFileSize,
      largestFileId: metrics.largestFileId,
      breakdownByType: metrics.breakdownByType as any,
    };
  }

  /**
   * Get storage trends over time
   */
  async getStorageTrends(
    entityType: 'user' | 'project' | 'brand' | 'platform',
    entityId?: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<StorageTrend | null> {
    const now = new Date();
    const compareDate = new Date(now);

    switch (period) {
      case 'day':
        compareDate.setDate(compareDate.getDate() - 1);
        break;
      case 'week':
        compareDate.setDate(compareDate.getDate() - 7);
        break;
      case 'month':
        compareDate.setMonth(compareDate.getMonth() - 1);
        break;
    }

    const [current, previous] = await Promise.all([
      this.prisma.storageMetrics.findFirst({
        where: { entityType, entityId: entityId || null },
        orderBy: { snapshotDate: 'desc' },
      }),
      this.prisma.storageMetrics.findFirst({
        where: {
          entityType,
          entityId: entityId || null,
          snapshotDate: { lte: compareDate },
        },
        orderBy: { snapshotDate: 'desc' },
      }),
    ]);

    if (!current) {
      return null;
    }

    const currentBytes = current.totalBytes;
    const previousBytes = previous?.totalBytes || BigInt(0);
    const growthBytes = currentBytes - previousBytes;
    const growthRate =
      previousBytes > BigInt(0)
        ? (Number(growthBytes) / Number(previousBytes)) * 100
        : 0;

    return {
      current: currentBytes,
      previous: previousBytes,
      growthRate,
      growthBytes: BigInt(growthBytes.toString()),
    };
  }

  /**
   * Get comprehensive storage report
   */
  async generateStorageReport(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<StorageReport> {
    const endDate = options?.endDate || new Date();
    const startDate = options?.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get platform-wide stats
    const platformStats = await this.prisma.ipAsset.aggregate({
      where: { deletedAt: null },
      _sum: { fileSize: true },
      _count: { id: true },
      _avg: { fileSize: true },
    });

    // Get largest file
    const largestFile = await this.prisma.ipAsset.findFirst({
      where: { deletedAt: null },
      orderBy: { fileSize: 'desc' },
      select: { id: true, fileSize: true, title: true },
    });

    // Breakdown by type
    const byType = await this.prisma.ipAsset.groupBy({
      by: ['type'],
      where: { deletedAt: null },
      _sum: { fileSize: true },
      _count: { id: true },
    });

    const totalBytes = platformStats._sum.fileSize || BigInt(0);
    const breakdownByType: Record<string, any> = {};
    for (const item of byType) {
      const bytes = item._sum.fileSize || BigInt(0);
      breakdownByType[item.type] = {
        bytes,
        count: item._count.id,
        percentage: totalBytes > BigInt(0) 
          ? (Number(bytes) / Number(totalBytes)) * 100 
          : 0,
      };
    }

    // Top users
    const topUsers = await this.prisma.ipAsset.groupBy({
      by: ['createdBy'],
      where: { deletedAt: null },
      _sum: { fileSize: true },
      orderBy: { _sum: { fileSize: 'desc' } },
      take: 10,
    });

    const topUsersWithDetails = await Promise.all(
      topUsers.map(async (u) => {
        const user = await this.prisma.user.findUnique({
          where: { id: u.createdBy },
          select: { id: true, name: true },
        });
        return {
          id: u.createdBy,
          name: user?.name || 'Unknown',
          bytes: u._sum.fileSize || BigInt(0),
        };
      })
    );

    // Top projects
    const topProjects = await this.prisma.ipAsset.groupBy({
      by: ['projectId'],
      where: { deletedAt: null, projectId: { not: null } },
      _sum: { fileSize: true },
      orderBy: { _sum: { fileSize: 'desc' } },
      take: 10,
    });

    const topProjectsWithDetails = await Promise.all(
      topProjects.map(async (p) => {
        const project = await this.prisma.project.findUnique({
          where: { id: p.projectId! },
          select: { id: true, name: true },
        });
        return {
          id: p.projectId!,
          name: project?.name || 'Unknown',
          bytes: p._sum.fileSize || BigInt(0),
        };
      })
    );

    // Get trends
    const [daily, weekly, monthly] = await Promise.all([
      this.getStorageTrends('platform', undefined, 'day'),
      this.getStorageTrends('platform', undefined, 'week'),
      this.getStorageTrends('platform', undefined, 'month'),
    ]);

    return {
      summary: {
        totalBytes: totalBytes,
        totalFiles: platformStats._count.id || 0,
        averageFileSize: BigInt(Math.floor(Number(platformStats._avg.fileSize || 0))),
        largestFile: largestFile
          ? {
              id: largestFile.id,
              size: largestFile.fileSize,
              title: largestFile.title,
            }
          : null,
      },
      breakdown: {
        byType: breakdownByType,
        byUser: topUsersWithDetails,
        byProject: topProjectsWithDetails,
      },
      trends: {
        daily: daily || { current: BigInt(0), previous: BigInt(0), growthRate: 0, growthBytes: BigInt(0) },
        weekly: weekly || { current: BigInt(0), previous: BigInt(0), growthRate: 0, growthBytes: BigInt(0) },
        monthly: monthly || { current: BigInt(0), previous: BigInt(0), growthRate: 0, growthBytes: BigInt(0) },
      },
      topConsumers: {
        users: topUsersWithDetails,
        projects: topProjectsWithDetails,
      },
    };
  }

  /**
   * Check storage quota for an entity
   */
  async checkQuota(
    entityType: 'user' | 'project' | 'brand',
    entityId: string,
    quotaBytes: bigint
  ): Promise<StorageQuota> {
    const usage = await this.getCurrentUsage(entityType, entityId);
    const usedBytes = usage?.totalBytes || BigInt(0);
    const remainingBytes = quotaBytes - usedBytes;
    const percentUsed = Number(usedBytes) / Number(quotaBytes) * 100;

    return {
      entityType,
      entityId,
      quotaBytes,
      usedBytes,
      remainingBytes,
      percentUsed,
      isExceeded: usedBytes > quotaBytes,
    };
  }

  /**
   * Get storage analytics for optimization
   */
  async getStorageAnalytics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find dormant files (not accessed in 30 days)
    const dormantFiles = await this.prisma.ipAsset.findMany({
      where: {
        deletedAt: null,
        updatedAt: { lt: thirtyDaysAgo },
      },
      select: {
        id: true,
        title: true,
        fileSize: true,
        updatedAt: true,
      },
      orderBy: { fileSize: 'desc' },
      take: 100,
    });

    // Find duplicate file sizes (potential duplicates)
    const sizeCounts = await this.prisma.$queryRaw<Array<{ fileSize: bigint; count: number }>>`
      SELECT file_size as "fileSize", COUNT(*) as count
      FROM ip_assets
      WHERE deleted_at IS NULL
      GROUP BY file_size
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `;

    return {
      dormantFiles,
      potentialDuplicates: sizeCounts,
      optimizationOpportunities: {
        dormantStorageBytes: dormantFiles.reduce(
          (sum, f) => sum + f.fileSize,
          BigInt(0)
        ),
        duplicateGroups: sizeCounts.length,
      },
    };
  }

  /**
   * Format bytes for human-readable display
   */
  formatBytes(bytes: bigint): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = Number(bytes);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
