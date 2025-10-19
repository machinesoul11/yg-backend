/**
 * Cache Performance Monitoring API
 * GET /api/admin/cache/metrics
 * 
 * Admin-only endpoint for viewing cache performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cachePerformanceService } from '@/lib/redis/cache-performance.service';
import { redisMonitor } from '@/lib/redis/monitoring';

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession();
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'current'; // current, historical, report
    const periodDays = parseInt(searchParams.get('periodDays') || '7');

    let data: any = {};

    switch (view) {
      case 'current':
        // Get current metrics and health status
        const [metrics, health, distribution] = await Promise.all([
          cachePerformanceService.getCurrentMetrics(),
          redisMonitor.getHealthStatus(),
          redisMonitor.getKeyDistribution(),
        ]);

        data = {
          metrics,
          health,
          distribution,
        };
        break;

      case 'historical':
        // Get historical metrics
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        const historicalMetrics = await cachePerformanceService.getHistoricalMetrics(
          startDate,
          endDate
        );

        data = {
          period: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          metrics: historicalMetrics,
        };
        break;

      case 'report':
        // Generate efficiency report
        const report = await cachePerformanceService.generateEfficiencyReport(periodDays);
        data = report;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid view parameter' },
          { status: 400 }
        );
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Cache Metrics API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
