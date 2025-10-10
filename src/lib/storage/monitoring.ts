/**
 * Storage Monitoring Service
 * 
 * Tracks storage metrics and provides monitoring capabilities
 */

import { prisma } from '@/lib/db'

export interface StorageMetrics {
  date: Date
  operation: 'upload' | 'download' | 'delete'
  fileCount: number
  totalSize: bigint
  errorCount: number
  avgLatency: number
}

export class StorageMonitoringService {
  /**
   * Log storage operation for metrics
   */
  async logOperation(params: {
    operation: 'upload' | 'download' | 'delete'
    success: boolean
    fileSize: number
    latency: number
    error?: string
  }): Promise<void> {
    const date = new Date()
    date.setHours(0, 0, 0, 0) // Normalize to day

    try {
      // Update or create daily metrics
      await prisma.$executeRaw`
        INSERT INTO storage_metrics (date, operation, file_count, total_size, error_count, avg_latency, created_at)
        VALUES (
          ${date},
          ${params.operation},
          1,
          ${BigInt(params.fileSize)},
          ${params.success ? 0 : 1},
          ${params.latency},
          NOW()
        )
        ON CONFLICT (date, operation)
        DO UPDATE SET
          file_count = storage_metrics.file_count + 1,
          total_size = storage_metrics.total_size + ${BigInt(params.fileSize)},
          error_count = storage_metrics.error_count + ${params.success ? 0 : 1},
          avg_latency = (storage_metrics.avg_latency * storage_metrics.file_count + ${params.latency}) / (storage_metrics.file_count + 1)
      `
    } catch (error) {
      console.error('Failed to log storage metrics:', error)
      // Don't throw - metrics logging should not break operations
    }
  }

  /**
   * Get storage metrics for date range
   */
  async getMetrics(params: {
    startDate: Date
    endDate: Date
    operation?: 'upload' | 'download' | 'delete'
  }): Promise<StorageMetrics[]> {
    const whereClause = params.operation
      ? { date: { gte: params.startDate, lte: params.endDate }, operation: params.operation }
      : { date: { gte: params.startDate, lte: params.endDate } }

    const metrics = await prisma.$queryRaw<StorageMetrics[]>`
      SELECT 
        date,
        operation,
        file_count as "fileCount",
        total_size as "totalSize",
        error_count as "errorCount",
        avg_latency as "avgLatency"
      FROM storage_metrics
      WHERE date >= ${params.startDate}
        AND date <= ${params.endDate}
        ${params.operation ? `AND operation = ${params.operation}` : ''}
      ORDER BY date DESC, operation
    `

    return metrics
  }

  /**
   * Get total storage usage
   * 
   * NOTE: Requires IPAsset model in Prisma schema
   */
  async getTotalStorageUsage(): Promise<{
    totalFiles: number
    totalSize: bigint
    byAssetType: Record<string, { count: number; size: bigint }>
  }> {
    // @ts-ignore - IPAsset model will be added in database schema phase
    const stats = await prisma.iPAsset.groupBy({
      by: ['type'],
      _count: { id: true },
      _sum: { file_size: true },
      where: {
        deleted_at: null,
      },
    })

    let totalFiles = 0
    let totalSize = BigInt(0)
    const byAssetType: Record<string, { count: number; size: bigint }> = {}

    for (const stat of stats) {
      const count = stat._count.id
      const size = BigInt(stat._sum.file_size || 0)

      totalFiles += count
      totalSize += size

      byAssetType[stat.type] = {
        count,
        size,
      }
    }

    return {
      totalFiles,
      totalSize,
      byAssetType,
    }
  }

  /**
   * Get storage health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical'
    issues: string[]
    metrics: {
      errorRate: number
      avgUploadTime: number
      totalStorage: string
    }
  }> {
    const issues: string[] = []
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    // Get recent metrics
    const recentMetrics = await this.getMetrics({
      startDate: yesterday,
      endDate: new Date(),
    })

    // Calculate error rate
    const totalOps = recentMetrics.reduce(
      (sum, m) => sum + m.fileCount,
      0
    )
    const totalErrors = recentMetrics.reduce(
      (sum, m) => sum + m.errorCount,
      0
    )
    const errorRate = totalOps > 0 ? (totalErrors / totalOps) * 100 : 0

    // Calculate average upload time
    const uploadMetrics = recentMetrics.filter((m) => m.operation === 'upload')
    const avgUploadTime =
      uploadMetrics.length > 0
        ? uploadMetrics.reduce((sum, m) => sum + m.avgLatency, 0) /
          uploadMetrics.length
        : 0

    // Get total storage
    const storageUsage = await this.getTotalStorageUsage()
    const totalStorageGB = Number(storageUsage.totalSize) / (1024 * 1024 * 1024)

    // Check for issues
    if (errorRate > 5) {
      issues.push(`High error rate: ${errorRate.toFixed(2)}%`)
    }

    if (avgUploadTime > 10000) {
      issues.push(
        `Slow upload times: ${(avgUploadTime / 1000).toFixed(2)}s average`
      )
    }

    if (totalStorageGB > 800) {
      // 80% of 1TB
      issues.push(
        `Storage capacity warning: ${totalStorageGB.toFixed(2)}GB used`
      )
    }

    const status =
      issues.length === 0 ? 'healthy' : issues.length > 2 ? 'critical' : 'warning'

    return {
      status,
      issues,
      metrics: {
        errorRate,
        avgUploadTime,
        totalStorage: `${totalStorageGB.toFixed(2)}GB`,
      },
    }
  }

  /**
   * Clean up old temporary files
   * 
   * NOTE: Requires IPAsset model in Prisma schema
   */
  async cleanupTempFiles(): Promise<{
    deleted: number
    failed: number
  }> {
    // Find assets in temp folder older than 24 hours
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    // @ts-ignore - IPAsset model will be added in database schema phase
    const tempAssets = await prisma.iPAsset.findMany({
      where: {
        storage_key: {
          startsWith: 'temp/',
        },
        created_at: {
          lt: oneDayAgo,
        },
        deleted_at: null,
      },
      select: {
        id: true,
        storage_key: true,
      },
    })

    if (tempAssets.length === 0) {
      return { deleted: 0, failed: 0 }
    }

    const { storageProvider } = await import('./index')
    const keys = tempAssets.map((a: any) => a.storage_key)

    // Delete from storage
    const { deleted: deletedKeys, failed: failedKeys } =
      await storageProvider.deleteBatch(keys)

    // Soft delete from database
    // @ts-ignore - IPAsset model will be added in database schema phase
    await prisma.iPAsset.updateMany({
      where: {
        id: {
          in: tempAssets
            .filter((a: any) => deletedKeys.includes(a.storage_key))
            .map((a: any) => a.id),
        },
      },
      data: {
        deleted_at: new Date(),
      },
    })

    return {
      deleted: deletedKeys.length,
      failed: failedKeys.length,
    }
  }
}

export const storageMonitoring = new StorageMonitoringService()
