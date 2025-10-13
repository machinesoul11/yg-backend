/**
 * Notifications API - Polling Endpoint
 * 
 * Efficient polling endpoint for real-time notification updates
 * Implements incremental updates and rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { z } from 'zod';

// Query params schema
const pollQuerySchema = z.object({
  lastSeen: z.string().datetime().optional(),
});

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 10; // seconds
const RATE_LIMIT_MAX_REQUESTS = 1; // 1 request per 10 seconds
const POLL_RESULT_LIMIT = 50; // Max notifications to return per poll

/**
 * Check rate limit for user
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const rateLimitKey = `notifications:poll:ratelimit:${userId}`;
  
  try {
    const current = await redis.get(rateLimitKey);
    const now = Date.now();
    
    if (current) {
      const data = JSON.parse(current);
      const timeSinceLastRequest = (now - data.timestamp) / 1000; // in seconds
      
      if (timeSinceLastRequest < RATE_LIMIT_WINDOW) {
        const retryAfter = Math.ceil(RATE_LIMIT_WINDOW - timeSinceLastRequest);
        return { allowed: false, retryAfter };
      }
    }
    
    // Update rate limit
    await redis.set(
      rateLimitKey,
      JSON.stringify({ timestamp: now }),
      'EX',
      RATE_LIMIT_WINDOW + 5 // Add buffer to TTL
    );
    
    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if Redis is down
    return { allowed: true };
  }
}

/**
 * Get cached "no new notifications" result
 */
async function getCachedNoNewNotifications(userId: string): Promise<boolean> {
  const cacheKey = `notifications:poll:empty:${userId}`;
  const cached = await redis.get(cacheKey);
  return cached === 'true';
}

/**
 * Set cached "no new notifications" result
 */
async function setCachedNoNewNotifications(userId: string): Promise<void> {
  const cacheKey = `notifications:poll:empty:${userId}`;
  await redis.set(cacheKey, 'true', 'EX', 5); // 5 second TTL
}

/**
 * Clear cached "no new notifications" result
 * This should be called when new notifications are created
 */
export async function clearNoNewNotificationsCache(userId: string): Promise<void> {
  const cacheKey = `notifications:poll:empty:${userId}`;
  await redis.del(cacheKey);
}

/**
 * GET /api/notifications/poll
 * Poll for new notifications since last-seen timestamp
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

    // Check rate limit
    const rateLimitResult = await checkRateLimit(session.user.id);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfter?.toString() || '10',
          },
        }
      );
    }

    // Parse and validate query parameters
    const searchParams = req.nextUrl.searchParams;
    const queryParams = {
      lastSeen: searchParams.get('lastSeen') || undefined,
    };

    const validated = pollQuerySchema.parse(queryParams);

    // Determine query timestamp
    let queryAfter: Date;
    
    if (validated.lastSeen) {
      queryAfter = new Date(validated.lastSeen);
      
      // Validate timestamp is not in future
      const now = new Date();
      if (queryAfter > now) {
        // Clock skew - use current time
        queryAfter = now;
      }
      
      // Limit how far back we query (24 hours max)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (queryAfter < oneDayAgo) {
        // Too old - return recent notifications instead
        queryAfter = oneDayAgo;
      }
    } else {
      // No timestamp provided - return recent notifications (last hour)
      queryAfter = new Date(Date.now() - 60 * 60 * 1000);
    }

    // Check cache for "no new notifications"
    if (validated.lastSeen) {
      const hasCache = await getCachedNoNewNotifications(session.user.id);
      if (hasCache) {
        // Quick response - no new notifications
        const unreadCount = await prisma.notification.count({
          where: { userId: session.user.id, read: false },
        });
        
        return NextResponse.json({
          success: true,
          data: {
            notifications: [],
            newCount: 0,
            unreadCount,
            lastSeen: new Date().toISOString(),
          },
        });
      }
    }

    // Query for new notifications
    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gt: queryAfter },
      },
      orderBy: { createdAt: 'desc' },
      take: POLL_RESULT_LIMIT,
    });

    // Get unread count
    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, read: false },
    });

    // If no new notifications, cache this result
    if (notifications.length === 0 && validated.lastSeen) {
      await setCachedNoNewNotifications(session.user.id);
    }

    // Format response
    const now = new Date();
    
    return NextResponse.json({
      success: true,
      data: {
        notifications: notifications.map(n => ({
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
        newCount: notifications.length,
        unreadCount,
        lastSeen: now.toISOString(),
        suggestedPollInterval: 10, // seconds
      },
    });
  } catch (error) {
    console.error('Error polling notifications:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
