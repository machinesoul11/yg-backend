/**
 * Database Health API Route
 * 
 * Provides database health check endpoint for monitoring systems.
 * GET /api/health/database
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db';
import { DatabaseMonitor } from '@/lib/db/monitoring';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Check authentication (optional - configure based on your needs)
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.HEALTH_CHECK_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Perform health checks
    const [health, monitor] = await Promise.all([
      checkDatabaseHealth(),
      new DatabaseMonitor(prisma).getMetrics(),
    ]);

    const status = health.primary && health.replica ? 'healthy' : 'degraded';

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      database: {
        primary: {
          connected: health.primary,
          latency: health.latency.primary,
        },
        replica: {
          connected: health.replica,
          latency: health.latency.replica,
        },
      },
      metrics: {
        queries: monitor.queries,
        connections: monitor.connections,
        performance: monitor.performance,
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

// Disable caching for health checks
export const dynamic = 'force-dynamic';
export const revalidate = 0;
