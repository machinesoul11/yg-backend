/**
 * Redis Health Check API Endpoint
 * GET /api/health/redis
 */

import { NextResponse } from 'next/server';
import { redisMonitor } from '@/lib/redis';

export async function GET() {
  try {
    const health = await redisMonitor.getHealthStatus();

    if (!health.healthy) {
      return NextResponse.json(
        {
          success: false,
          status: 'unhealthy',
          ...health,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'healthy',
      ...health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
