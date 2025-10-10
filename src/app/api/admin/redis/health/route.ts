import { NextResponse } from 'next/server';
import { redisMonitor } from '@/lib/redis';

/**
 * GET /api/admin/redis/health
 * Check Redis health status
 */
export async function GET() {
  try {
    const health = await redisMonitor.getHealthStatus();

    return NextResponse.json(health, {
      status: health.status === 'healthy' ? 200 : health.status === 'degraded' ? 207 : 503,
    });
  } catch (error) {
    console.error('[Redis Health] Error checking health:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
