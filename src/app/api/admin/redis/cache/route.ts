import { NextResponse } from 'next/server';
import { cacheService } from '@/lib/redis';

/**
 * GET /api/admin/redis/cache/stats
 * Get cache statistics
 */
export async function GET() {
  try {
    const stats = await cacheService.getStats();

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Redis Cache Stats] Error getting stats:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/redis/cache/invalidate
 * Invalidate cache by pattern
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get('pattern');

    if (!pattern) {
      return NextResponse.json(
        { error: 'Pattern parameter is required' },
        { status: 400 }
      );
    }

    const deleted = await cacheService.deletePattern(pattern);

    return NextResponse.json({
      success: true,
      deleted,
      pattern,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Redis Cache Invalidate] Error invalidating cache:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
