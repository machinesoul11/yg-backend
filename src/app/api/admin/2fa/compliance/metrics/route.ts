/**
 * Admin API - 2FA Compliance Metrics
 * GET /api/admin/2fa/compliance/metrics
 * 
 * Returns current and historical 2FA compliance metrics
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorComplianceService } from '@/lib/services/2fa-compliance.service';

const complianceService = new TwoFactorComplianceService(prisma);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');

    // Get current adoption metrics
    const currentAdoption = await complianceService.getCurrentAdoptionMetrics();

    // Get trend data
    const adoptionTrend = await complianceService.getAdoptionTrend(days);
    const failureTrend = await complianceService.getFailedAttemptsTrend(days);

    return NextResponse.json({
      current: currentAdoption,
      trends: {
        adoption: adoptionTrend,
        failures: failureTrend,
      },
    });
  } catch (error) {
    console.error('[Admin 2FA Compliance API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
