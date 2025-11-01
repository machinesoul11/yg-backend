/**
 * Security Alerts API
 * GET /api/security/alerts?userId={userId}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // IMPORTANT: Await the session
    const session = await getServerSession(authOptions);
    
    console.log('[Security Alerts] Session check:', { 
      hasSession: !!session, 
      userId: session?.user?.id,
      userRole: session?.user?.role 
    });

    if (!session?.user) {
      console.log('[Security Alerts] No session or user - Unauthorized');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized',
          alerts: [],
          hasUrgent: false,
          unacknowledgedCount: 0
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Verify user can only access their own alerts or is admin
    if (userId && userId !== session.user.id && session.user.role !== 'ADMIN') {
      console.log('[Security Alerts] Forbidden - user trying to access other user alerts:', { 
        requestedUserId: userId, 
        sessionUserId: session.user.id,
        userRole: session.user.role 
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'Forbidden',
          alerts: [],
          hasUrgent: false,
          unacknowledgedCount: 0
        },
        { status: 403 }
      );
    }

    const targetUserId = userId || session.user.id;

    console.log('[Security Alerts] Fetching alerts for user:', targetUserId);

    // SecurityAlert model doesn't exist yet in the schema
    // Return empty alerts for now to prevent frontend errors
    // TODO: Add SecurityAlert model to schema when implementing security alerts feature
    const alerts: any[] = [];

    const hasUrgent = false;
    const unacknowledgedCount = 0;

    return NextResponse.json({
      success: true,
      alerts,
      hasUrgent,
      unacknowledgedCount,
    });
  } catch (error) {
    console.error('[Security Alerts] Error:', error);
    
    // Return empty alerts on error to prevent breaking the frontend
    return NextResponse.json(
      {
        success: true,
        alerts: [],
        hasUrgent: false,
        unacknowledgedCount: 0,
      },
      { status: 200 }
    );
  }
}
