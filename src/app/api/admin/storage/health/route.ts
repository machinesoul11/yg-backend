/**
 * Storage Health Check API
 * 
 * Returns storage system health status and diagnostics
 */

import { NextResponse } from 'next/server'
import { storageMonitoring } from '@/lib/storage/monitoring'
import { storageProvider } from '@/lib/storage'

/**
 * GET /api/admin/storage/health
 * 
 * Check storage system health
 */
export async function GET() {
  try {
    // Get health status
    const health = await storageMonitoring.getHealthStatus()

    // Get storage usage
    const usage = await storageMonitoring.getTotalStorageUsage()

    // Test storage connectivity
    let storageConnected = false
    try {
      await storageProvider.list({ maxResults: 1 })
      storageConnected = true
    } catch (error) {
      console.error('Storage connectivity test failed:', error)
    }

    return NextResponse.json({
      success: true,
      data: {
        status: health.status,
        connected: storageConnected,
        issues: health.issues,
        metrics: health.metrics,
        usage: {
          totalFiles: usage.totalFiles,
          totalSize: usage.totalSize.toString(),
          byAssetType: Object.entries(usage.byAssetType).reduce(
            (acc, [type, stats]) => {
              acc[type] = {
                count: stats.count,
                size: stats.size.toString(),
              }
              return acc
            },
            {} as Record<string, { count: number; size: string }>
          ),
        },
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to check storage health:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check storage health',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
