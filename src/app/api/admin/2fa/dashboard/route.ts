/**
 * Admin API - 2FA Security Dashboard
 * GET /api/admin/2fa/dashboard
 * 
 * Returns comprehensive dashboard data for 2FA security monitoring
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorComplianceService } from '@/lib/services/2fa-compliance.service';
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';

const complianceService = new TwoFactorComplianceService(prisma);
const alertsService = new TwoFactorSecurityAlertsService(prisma);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current metrics
    const currentAdoption = await complianceService.getCurrentAdoptionMetrics();

    // Get 24-hour trends
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const recentAuth = await complianceService.getAuthenticationMetrics(yesterday, now);
    const recentSecurity = await complianceService.getSecurityMetrics(yesterday, now);

    // Get active alerts
    const activeAlerts = await alertsService.getActiveAlerts({ limit: 10 });
    const criticalAlerts = activeAlerts.filter(
      a => a.severity === 'critical' || a.severity === 'urgent'
    );

    // Get users with low backup codes
    const usersWithBackupCodes = await prisma.user.findMany({
      where: {
        deleted_at: null,
        two_factor_enabled: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        twoFactorBackupCodes: {
          where: { used: false },
          select: { id: true },
        },
      },
    });

    const usersNeedingBackupCodes = usersWithBackupCodes
      .filter(u => u.twoFactorBackupCodes.length < 3)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        remainingCodes: u.twoFactorBackupCodes.length,
      }));

    // Calculate 24h comparison
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const previousAuth = await complianceService.getAuthenticationMetrics(
      twoDaysAgo,
      yesterday
    );

    const failureRateChange =
      previousAuth.failureRate > 0
        ? ((recentAuth.failureRate - previousAuth.failureRate) / previousAuth.failureRate) * 100
        : 0;

    return NextResponse.json({
      adoption: {
        current: currentAdoption.adoptionRate,
        total: currentAdoption.totalUsers,
        enabled: currentAdoption.usersWithTwoFactor,
        byRole: currentAdoption.byRole,
      },
      authentication: {
        last24h: {
          total: recentAuth.totalAttempts,
          successful: recentAuth.successful,
          failed: recentAuth.failed,
          failureRate: recentAuth.failureRate,
          failureRateChange,
        },
        byMethod: recentAuth.byMethod,
      },
      security: {
        last24h: recentSecurity,
        usersNeedingBackupCodes: usersNeedingBackupCodes.length,
      },
      alerts: {
        total: activeAlerts.length,
        critical: criticalAlerts.length,
        recent: activeAlerts.slice(0, 5),
      },
      actionItems: [
        ...(criticalAlerts.length > 0
          ? [
              {
                type: 'critical_alert',
                message: `${criticalAlerts.length} critical security alert(s) require attention`,
                count: criticalAlerts.length,
              },
            ]
          : []),
        ...(usersNeedingBackupCodes.length > 0
          ? [
              {
                type: 'low_backup_codes',
                message: `${usersNeedingBackupCodes.length} user(s) have fewer than 3 backup codes`,
                count: usersNeedingBackupCodes.length,
                users: usersNeedingBackupCodes.slice(0, 5),
              },
            ]
          : []),
        ...(recentAuth.failureRate > 15
          ? [
              {
                type: 'high_failure_rate',
                message: `Failure rate is elevated at ${recentAuth.failureRate.toFixed(1)}%`,
                failureRate: recentAuth.failureRate,
              },
            ]
          : []),
      ],
    });
  } catch (error) {
    console.error('[Admin 2FA Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
