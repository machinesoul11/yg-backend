/**
 * Notifications API - Mark All as Read Endpoint
 * 
 * REST endpoint for marking all notifications as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';

const notificationService = new NotificationService(prisma, redis);

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for authenticated user
 */
export async function PATCH(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Mark all as read
    const count = await notificationService.markAllAsRead(session.user.id);

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
