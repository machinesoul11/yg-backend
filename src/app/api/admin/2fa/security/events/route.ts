/**
 * Admin API - 2FA Security Events
 * GET /api/admin/2fa/security/events
 * 
 * Query security events with filtering
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorSecurityEventsService } from '@/lib/services/2fa-security-events.service';

const eventsService = new TwoFactorSecurityEventsService(prisma);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || undefined;
    const eventType = searchParams.get('eventType') || undefined;
    const eventCategory = searchParams.get('eventCategory') || undefined;
    const anomalousOnly = searchParams.get('anomalousOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100');

    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    let events;

    if (anomalousOnly) {
      events = await eventsService.getAnomalousEvents({
        limit,
        startDate,
        endDate,
      });
    } else if (userId) {
      events = await eventsService.getUserEvents(userId, {
        limit,
        eventType,
        eventCategory,
        startDate,
        endDate,
      });
    } else {
      // Get failed attempts summary
      if (eventType === 'failed_attempt' && startDate && endDate) {
        const summary = await eventsService.getFailedAttemptsSummary(startDate, endDate);
        return NextResponse.json({ summary });
      }

      // For general queries, return recent anomalous events by default
      events = await eventsService.getAnomalousEvents({ limit: 50 });
    }

    return NextResponse.json({ events });
  } catch (error) {
    console.error('[Admin 2FA Events API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
