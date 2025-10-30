import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';

const notificationService = new NotificationService(prisma, redis);

// Query timeout in milliseconds
const QUERY_TIMEOUT = 5000; // 5 seconds

/**
 * Execute query with timeout protection
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      )
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === 'Query timeout') {
      console.error('[Notifications] Query timeout - returning fallback');
      return fallback;
    }
    throw error;
  }
}

/**
 * GET /api/notifications/unread
 * Get count of unread notifications for authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get unread count with timeout protection
    const count = await withTimeout(
      notificationService.getUnreadCount(session.user.id),
      QUERY_TIMEOUT,
      0 // Fallback to 0 on timeout
    );

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('[Notifications] Error fetching unread count:', error);
    
    // Return graceful fallback instead of 500
    return NextResponse.json({
      success: true,  // Don't fail the whole app
      data: { count: 0 },  // Default value
    });
  }
}

/**
 * POST /api/notifications/unread
 * Get count of unread notifications for authenticated user (alternative to GET)
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get unread count with timeout protection
    const count = await withTimeout(
      notificationService.getUnreadCount(session.user.id),
      QUERY_TIMEOUT,
      0 // Fallback to 0 on timeout
    );

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('[Notifications] Error fetching unread count:', error);
    
    // Return graceful fallback instead of 500
    return NextResponse.json({
      success: true,  // Don't fail the whole app
      data: { count: 0 },  // Default value
    });
  }
}
