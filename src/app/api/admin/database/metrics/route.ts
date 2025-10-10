/**
 * Database Metrics API Route
 * 
 * Provides detailed database metrics for admin dashboard.
 * GET /api/admin/database/metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { DatabaseMonitor } from '@/lib/db/monitoring';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // TODO: Add authentication check here
    // Verify user is admin before returning sensitive metrics
    
    const monitor = new DatabaseMonitor(prisma);
    
    const [metrics, size, slowQueries, indexUsage] = await Promise.all([
      monitor.getMetrics(),
      monitor.getDatabaseSize(),
      monitor.getSlowQueries(10),
      monitor.getIndexUsage(),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      metrics,
      size,
      slowQueries,
      indexUsage,
    });
  } catch (error) {
    console.error('Failed to fetch database metrics:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to fetch database metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Disable caching for real-time metrics
export const dynamic = 'force-dynamic';
export const revalidate = 0;
