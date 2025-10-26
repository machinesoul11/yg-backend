/**
 * Permission Cache Monitoring API
 * Admin-only endpoint for monitoring permission cache performance
 * 
 * GET /api/admin/permissions/cache/metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/authorization.middleware';
import { permissionCacheService } from '@/lib/services/permission-cache.service';
import { PermissionService } from '@/lib/services/permission.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';

const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * GET - Get permission cache metrics
 */
export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    const { user } = await requireAdmin(req);

    // Get cache metrics
    const metrics = await permissionCacheService.getMetrics();

    // Get permission service metrics (if available)
    const permissionMetrics = await permissionService.getPermissionCacheMetrics();

    // Get frequently cached users
    const frequentUsers = await permissionCacheService.getFrequentUsers(10);

    return NextResponse.json({
      success: true,
      data: {
        cache: metrics,
        permissions: permissionMetrics,
        frequentUsers: {
          count: frequentUsers.length,
          users: frequentUsers,
        },
        recommendations: generateRecommendations(metrics),
      },
    });
  } catch (error) {
    console.error('[PermissionCacheMetrics] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cache metrics',
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Warm permission cache or clear cache
 */
export async function POST(req: NextRequest) {
  try {
    // Require admin authentication
    const { user } = await requireAdmin(req);

    const body = await req.json();
    const { action, userIds } = body;

    switch (action) {
      case 'warm':
        // Warm cache for specific users or frequent users
        const warmedCount = await permissionService.warmPermissionCache(userIds);
        
        return NextResponse.json({
          success: true,
          message: `Successfully warmed cache for ${warmedCount} users`,
          data: { warmedCount },
        });

      case 'clear':
        // Clear all permission caches
        const clearedCount = await permissionCacheService.clearAll();
        
        return NextResponse.json({
          success: true,
          message: `Successfully cleared ${clearedCount} cache entries`,
          data: { clearedCount },
        });

      case 'invalidate':
        // Invalidate specific users
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'userIds array is required for invalidate action',
            },
            { status: 400 }
          );
        }

        await permissionCacheService.invalidateMany(userIds);
        
        return NextResponse.json({
          success: true,
          message: `Successfully invalidated cache for ${userIds.length} users`,
          data: { invalidatedCount: userIds.length },
        });

      case 'reset-metrics':
        // Reset cache metrics
        await permissionCacheService.resetMetrics();
        
        return NextResponse.json({
          success: true,
          message: 'Successfully reset cache metrics',
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action. Supported actions: warm, clear, invalidate, reset-metrics',
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[PermissionCacheMetrics] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Operation failed',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate recommendations based on cache metrics
 */
function generateRecommendations(metrics: {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  errors: number;
}): string[] {
  const recommendations: string[] = [];

  // Hit rate recommendations
  if (metrics.hitRate < 70) {
    recommendations.push(
      `Low hit rate (${metrics.hitRate.toFixed(1)}%). Consider increasing cache TTL or implementing cache warming.`
    );
  } else if (metrics.hitRate >= 90) {
    recommendations.push(
      `Excellent hit rate (${metrics.hitRate.toFixed(1)}%). Cache is performing optimally.`
    );
  }

  // Error rate recommendations
  const totalRequests = metrics.hits + metrics.misses;
  const errorRate = totalRequests > 0 ? (metrics.errors / totalRequests) * 100 : 0;
  
  if (metrics.errors > 0) {
    recommendations.push(
      `${metrics.errors} cache errors detected (${errorRate.toFixed(2)}% error rate). Review Redis connection and logs.`
    );
  }

  // Cache size recommendations
  if (metrics.totalKeys > 10000) {
    recommendations.push(
      `Large cache size (${metrics.totalKeys} keys). Consider implementing cache eviction policies or reducing TTL.`
    );
  } else if (metrics.totalKeys < 100 && totalRequests > 1000) {
    recommendations.push(
      `Low cache utilization (${metrics.totalKeys} keys for ${totalRequests} requests). Consider implementing cache warming.`
    );
  }

  // Warm cache recommendation
  if (metrics.misses > metrics.hits && metrics.misses > 100) {
    recommendations.push(
      `High miss rate. Consider warming cache for frequently accessed users.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Cache is performing well. No immediate action required.');
  }

  return recommendations;
}
