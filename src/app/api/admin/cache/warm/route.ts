/**
 * Cache Warming API
 * POST /api/admin/cache/warm
 * 
 * Admin-only endpoint for triggering cache warming
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { getCacheWarmingService } from '@/lib/redis/cache-warming.service';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession();
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { type = 'critical', userId, batchSize = 50 } = body;

    const warmingService = getCacheWarmingService(prisma);
    let result: any;

    switch (type) {
      case 'critical':
        result = await warmingService.warmCriticalCaches();
        break;

      case 'user':
        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required for user cache warming' },
            { status: 400 }
          );
        }
        await warmingService.warmUserCache(userId);
        result = { success: true, userId };
        break;

      case 'incremental':
        await warmingService.warmCacheIncrementally({ batchSize });
        result = { success: true, batchSize };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid warming type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      type,
      result,
    });
  } catch (error) {
    console.error('[Cache Warming API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
