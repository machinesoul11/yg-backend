/**
 * Upload Analytics Service
 * 
 * Tracks and aggregates upload-related metrics:
 * - Upload initiation, confirmation, failures
 * - File sizes, types, processing times
 * - Success/failure rates
 * - Virus scan results
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { redis } from '@/lib/redis';

export interface UploadMetrics {
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  successRate: number;
  averageFileSize: number;
  totalStorageUsed: number;
  byMimeType: Record<string, number>;
  byStatus: Record<string, number>;
  virusScans: {
    total: number;
    clean: number;
    infected: number;
    failed: number;
  };
}

export interface UploadEvent {
  userId: string;
  assetId: string;
  eventType: 'initiated' | 'confirmed' | 'failed' | 'scanned' | 'cleaned';
  fileSize?: number;
  mimeType?: string;
  processingTime?: number;
  errorReason?: string;
  timestamp: Date;
}

export class UploadAnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Track upload event
   */
  async trackEvent(event: UploadEvent): Promise<void> {
    const cacheKey = `upload:event:${event.assetId}:${event.eventType}`;
    
    try {
      // Store event in Redis for real-time metrics (24h TTL)
      await this.redis.setex(
        cacheKey,
        86400,
        JSON.stringify({
          ...event,
          timestamp: event.timestamp.toISOString(),
        })
      );

      // Increment counters for real-time dashboard
      const dateKey = event.timestamp.toISOString().split('T')[0];
      await this.redis.hincrby(`upload:daily:${dateKey}`, event.eventType, 1);
      
      if (event.fileSize) {
        await this.redis.hincrby(`upload:daily:${dateKey}`, 'totalSize', event.fileSize);
      }

      if (event.mimeType) {
        await this.redis.hincrby(`upload:mimeTypes:${dateKey}`, event.mimeType, 1);
      }
    } catch (error) {
      console.error('[UploadAnalytics] Failed to track event:', error);
      // Don't throw - analytics failures shouldn't break uploads
    }
  }

  /**
   * Get real-time upload metrics
   */
  async getRealTimeMetrics(): Promise<UploadMetrics> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `upload:metrics:${today}`;

    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database for today's metrics
      const metrics = await this.calculateMetrics(new Date(), new Date());

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      console.error('[UploadAnalytics] Failed to get real-time metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics for date range
   */
  async getMetrics(startDate: Date, endDate: Date): Promise<UploadMetrics> {
    return await this.calculateMetrics(startDate, endDate);
  }

  /**
   * Calculate upload metrics from database
   */
  private async calculateMetrics(startDate: Date, endDate: Date): Promise<UploadMetrics> {
    // Get all uploads in range
    const uploads = await this.prisma.ipAsset.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        mimeType: true,
        fileSize: true,
        scanStatus: true,
      },
    });

    const totalUploads = uploads.length;
    const successfulUploads = uploads.filter(
      (u) => u.status === 'APPROVED' || u.status === 'PROCESSING'
    ).length;
    const failedUploads = uploads.filter(
      (u) => u.status === 'REJECTED' || u.status === 'DRAFT'
    ).length;

    const totalStorageUsed = uploads.reduce(
      (sum, u) => sum + Number(u.fileSize),
      0
    );
    const averageFileSize = totalUploads > 0 ? totalStorageUsed / totalUploads : 0;

    // Group by mime type
    const byMimeType: Record<string, number> = {};
    uploads.forEach((u) => {
      byMimeType[u.mimeType] = (byMimeType[u.mimeType] || 0) + 1;
    });

    // Group by status
    const byStatus: Record<string, number> = {};
    uploads.forEach((u) => {
      byStatus[u.status] = (byStatus[u.status] || 0) + 1;
    });

    // Virus scan stats
    const virusScans = {
      total: uploads.length,
      clean: uploads.filter((u) => u.scanStatus === 'CLEAN').length,
      infected: uploads.filter((u) => u.scanStatus === 'INFECTED').length,
      failed: uploads.filter((u) => u.scanStatus === 'ERROR').length,
    };

    return {
      totalUploads,
      successfulUploads,
      failedUploads,
      successRate: totalUploads > 0 ? (successfulUploads / totalUploads) * 100 : 0,
      averageFileSize,
      totalStorageUsed,
      byMimeType,
      byStatus,
      virusScans,
    };
  }

  /**
   * Get upload queue depth (current uploads in progress)
   */
  async getQueueDepth(): Promise<{
    pending: number;
    scanning: number;
    processing: number;
  }> {
    const [pending, scanning, processing] = await Promise.all([
      this.prisma.ipAsset.count({
        where: { status: 'DRAFT', deletedAt: null },
      }),
      this.prisma.ipAsset.count({
        where: { scanStatus: 'SCANNING', deletedAt: null },
      }),
      this.prisma.ipAsset.count({
        where: { status: 'PROCESSING', deletedAt: null },
      }),
    ]);

    return { pending, scanning, processing };
  }

  /**
   * Get upload failure breakdown
   */
  async getFailureBreakdown(startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const failures = await this.prisma.ipAsset.findMany({
      where: {
        status: 'REJECTED',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        scanStatus: true,
        scanResult: true,
      },
    });

    const breakdown: Record<string, number> = {
      'Virus scan failed': failures.filter((f) => f.scanStatus === 'ERROR').length,
      'Virus detected': failures.filter((f) => f.scanStatus === 'INFECTED').length,
      'Upload abandoned': failures.filter((f) => f.scanStatus === 'PENDING').length,
      'Other': 0,
    };

    breakdown['Other'] = failures.length - Object.values(breakdown).reduce((a, b) => a + b, 0);

    return breakdown;
  }

  /**
   * Get top uploaders by volume
   */
  async getTopUploaders(limit: number = 10): Promise<Array<{
    userId: string;
    uploadCount: number;
    totalSize: number;
  }>> {
    const result = await this.prisma.ipAsset.groupBy({
      by: ['createdBy'],
      _count: {
        id: true,
      },
      _sum: {
        fileSize: true,
      },
      where: {
        deletedAt: null,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    return result.map((r) => ({
      userId: r.createdBy,
      uploadCount: r._count.id,
      totalSize: Number(r._sum.fileSize || 0),
    }));
  }

  /**
   * Clear cache for date
   */
  async clearCache(date?: Date): Promise<void> {
    const dateKey = (date || new Date()).toISOString().split('T')[0];
    await this.redis.del(`upload:metrics:${dateKey}`);
  }
}

/**
 * Singleton instance
 */
export const uploadAnalyticsService = new UploadAnalyticsService(
  prisma as any,
  redis
);

// Re-import prisma properly in actual usage
import { prisma } from '@/lib/db';
