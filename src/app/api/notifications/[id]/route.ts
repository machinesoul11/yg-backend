/**
 * Notifications API - Delete Endpoint
 * 
 * REST endpoint for deleting/dismissing a notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';
import { NotificationError } from '@/modules/system/errors';

const notificationService = new NotificationService(prisma, redis);

/**
 * DELETE /api/notifications/:id
 * Delete/dismiss a notification
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const notificationId = params.id;

    if (!notificationId) {
      return NextResponse.json(
        { success: false, error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    // Delete notification
    await notificationService.delete(notificationId, session.user.id);

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    
    if (error instanceof NotificationError) {
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Notification not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
