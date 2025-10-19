/**
 * Admin API - Acknowledge/Resolve 2FA Security Alert
 * PATCH /api/admin/2fa/security/alerts/[alertId]
 * 
 * Acknowledge or resolve a security alert
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';

const alertsService = new TwoFactorSecurityAlertsService(prisma);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertId } = params;
    const body = await req.json();
    const { action, resolution } = body;

    if (!action || !['acknowledge', 'resolve', 'false_positive'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: acknowledge, resolve, or false_positive' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'acknowledge':
        await alertsService.acknowledgeAlert(alertId, session.user.id);
        break;
      case 'resolve':
        if (!resolution) {
          return NextResponse.json(
            { error: 'Resolution message required' },
            { status: 400 }
          );
        }
        await alertsService.resolveAlert(alertId, session.user.id, resolution);
        break;
      case 'false_positive':
        await alertsService.markAsFalsePositive(alertId, session.user.id);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin 2FA Alert Action API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
