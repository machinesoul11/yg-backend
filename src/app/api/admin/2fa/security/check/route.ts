/**
 * Admin API - Trigger Security Checks
 * POST /api/admin/2fa/security/check
 * 
 * Manually trigger all security checks
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';

const alertsService = new TwoFactorSecurityAlertsService(prisma);

export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Admin] Security checks triggered by ${session.user.email}`);

    // Run all security checks
    await alertsService.runAllChecks();

    return NextResponse.json({
      success: true,
      message: 'Security checks completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin 2FA Security Check API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
