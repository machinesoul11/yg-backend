import { NextResponse } from 'next/server';
import { redisMonitor } from '@/lib/redis';

/**
 * GET /api/admin/redis/metrics
 * Get comprehensive Redis metrics
 */
export async function GET() {
  try {
    const [metrics, distribution, connectionPool] = await Promise.all([
      redisMonitor.getMetrics(),
      redisMonitor.getKeyDistribution(),
      redisMonitor.checkConnectionPool(),
    ]);

    return NextResponse.json({
      metrics,
      distribution,
      connectionPool,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Redis Metrics] Error getting metrics:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
