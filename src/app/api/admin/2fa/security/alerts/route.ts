/**
 * Admin API - 2FA Security Alerts
 * GET /api/admin/2fa/security/alerts
 * 
 * Returns active and recent security alerts
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';

const alertsService = new TwoFactorSecurityAlertsService(prisma);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    let alerts;
    if (status === 'active' || !status) {
      alerts = await alertsService.getActiveAlerts({ severity, limit });
    } else {
      const startDate = searchParams.get('startDate')
        ? new Date(searchParams.get('startDate')!)
        : undefined;
      const endDate = searchParams.get('endDate')
        ? new Date(searchParams.get('endDate')!)
        : undefined;

      alerts = await alertsService.getAlertHistory({
        startDate,
        endDate,
        severity,
        status,
        limit,
      });
    }

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('[Admin 2FA Alerts API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
