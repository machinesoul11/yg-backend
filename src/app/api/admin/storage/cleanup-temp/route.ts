/**
 * Storage Cleanup API
 * 
 * Admin endpoint to cleanup temporary files
 */

import { NextResponse } from 'next/server'
import { storageMonitoring } from '@/lib/storage/monitoring'

/**
 * POST /api/admin/storage/cleanup-temp
 * 
 * Clean up old temporary files (>24 hours)
 */
export async function POST() {
  try {
    const result = await storageMonitoring.cleanupTempFiles()

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.deleted,
        failed: result.failed,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to cleanup temp files:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup temp files' },
      { status: 500 }
    )
  }
}
