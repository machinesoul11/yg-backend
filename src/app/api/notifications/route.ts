/**
 * Notifications API - List Endpoint
 * 
 * REST endpoint for listing user notifications
 * Provides alternative to tRPC for frontend/mobile clients
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationService } from '@/modules/system/services/notification.service';
import { NotificationType, NotificationPriority } from '@prisma/client';
import { z } from 'zod';

const notificationService = new NotificationService(prisma, redis);

// Query params schema
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  read: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  type: z.nativeEnum(NotificationType).optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
});

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
 * GET /api/notifications
 * List user's notifications with pagination and filtering
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

    // Parse and validate query parameters
    const searchParams = req.nextUrl.searchParams;
    const queryParams = {
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      read: searchParams.get('read'),
      type: searchParams.get('type'),
      priority: searchParams.get('priority'),
    };

    const validated = listQuerySchema.parse(queryParams);

    // Fetch notifications with timeout protection
    const result = await withTimeout(
      notificationService.listForUser({
        userId: session.user.id,
        page: validated.page,
        pageSize: validated.pageSize,
        read: validated.read,
        type: validated.type as NotificationType | undefined,
        priority: validated.priority as NotificationPriority | undefined,
      }),
      QUERY_TIMEOUT,
      { notifications: [], total: 0 } // Fallback to empty list on timeout
    );

    const { notifications, total } = result;

    // Format response
    return NextResponse.json({
      success: true,
      data: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        actionUrl: n.actionUrl,
        priority: n.priority,
        read: n.read,
        readAt: n.readAt?.toISOString() || null,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages: Math.ceil(total / validated.pageSize),
      },
    });
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }

    // Return graceful fallback instead of 500
    return NextResponse.json({
      success: true,  // Don't fail the whole app
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    });
  }
}

/**
 * POST /api/notifications
 * List user's notifications with pagination and filtering (alternative to GET)
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

    // Parse and validate request body
    const body = await req.json();
    const validated = listQuerySchema.parse(body);

    // Fetch notifications with timeout protection
    const result = await withTimeout(
      notificationService.listForUser({
        userId: session.user.id,
        page: validated.page,
        pageSize: validated.pageSize,
        read: validated.read,
        type: validated.type as NotificationType | undefined,
        priority: validated.priority as NotificationPriority | undefined,
      }),
      QUERY_TIMEOUT,
      { notifications: [], total: 0 } // Fallback to empty list on timeout
    );

    const { notifications, total } = result;

    // Format response
    return NextResponse.json({
      success: true,
      data: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        actionUrl: n.actionUrl,
        priority: n.priority,
        read: n.read,
        readAt: n.readAt?.toISOString() || null,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages: Math.ceil(total / validated.pageSize),
      },
    });
  } catch (error) {
    console.error('[Notifications] Error fetching notifications (POST):', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    // Return graceful fallback instead of 500
    return NextResponse.json({
      success: true,  // Don't fail the whole app
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    });
  }
}
