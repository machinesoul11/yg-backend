/**
 * Storage Monitoring API Routes
 * 
 * Admin endpoints for storage metrics, health checks, and management
 */

import { NextRequest, NextResponse } from 'next/server'
import { storageMonitoring } from '@/lib/storage/monitoring'
import { storageProvider } from '@/lib/storage'

/**
 * GET /api/admin/storage/metrics
 * 
 * Get storage metrics for date range
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const operation = searchParams.get('operation') as
      | 'upload'
      | 'download'
      | 'delete'
      | undefined

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    const metrics = await storageMonitoring.getMetrics({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      operation,
    })

    return NextResponse.json({
      success: true,
      data: metrics.map((m) => ({
        date: m.date.toISOString(),
        operation: m.operation,
        fileCount: m.fileCount,
        totalSize: m.totalSize.toString(),
        errorCount: m.errorCount,
        avgLatency: m.avgLatency,
      })),
    })
  } catch (error) {
    console.error('Failed to get storage metrics:', error)
    return NextResponse.json(
      { error: 'Failed to get storage metrics' },
      { status: 500 }
    )
  }
}
