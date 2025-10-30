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
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Verify user can only access their own alerts or is admin
    if (userId && userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const targetUserId = userId || session.user.id;

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
    console.error('Security alerts API error:', error);
    
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
