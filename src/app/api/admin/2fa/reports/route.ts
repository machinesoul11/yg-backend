/**
 * Admin API - 2FA Compliance Reports
 * GET /api/admin/2fa/reports
 * POST /api/admin/2fa/reports
 * 
 * List and generate 2FA compliance reports
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorReportingService } from '@/lib/services/2fa-reporting.service';

const reportingService = new TwoFactorReportingService(prisma);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const reportType = searchParams.get('reportType') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    const reports = await reportingService.listReports({
      reportType,
      limit,
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[Admin 2FA Reports API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { reportType, year, month, schedule } = body;

    if (reportType === 'monthly_security') {
      if (!year || !month) {
        return NextResponse.json(
          { error: 'Year and month required for monthly report' },
          { status: 400 }
        );
      }

      const reportId = await reportingService.generateMonthlySecurityReport(
        year,
        month,
        session.user.id
      );

      return NextResponse.json({
        success: true,
        reportId,
      });
    }

    if (schedule) {
      // Schedule recurring report
      const { frequency, emailTo } = schedule;

      if (!frequency || !['monthly', 'weekly', 'quarterly'].includes(frequency)) {
        return NextResponse.json(
          { error: 'Invalid frequency. Must be: monthly, weekly, or quarterly' },
          { status: 400 }
        );
      }

      const reportId = await reportingService.scheduleRecurringReport({
        reportType: reportType || 'monthly_security',
        frequency,
        emailTo: emailTo || [session.user.email],
        generatedBy: session.user.id,
      });

      return NextResponse.json({
        success: true,
        reportId,
        message: 'Report scheduled successfully',
      });
    }

    return NextResponse.json(
      { error: 'Invalid request. Provide reportType or schedule parameters' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Admin 2FA Reports API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
