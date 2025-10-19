/**
 * Admin API - Get/Download Specific 2FA Report
 * GET /api/admin/2fa/reports/[reportId]
 * 
 * Retrieve a specific report and its data
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwoFactorReportingService } from '@/lib/services/2fa-reporting.service';

const reportingService = new TwoFactorReportingService(prisma);

export async function GET(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';

    const report = await reportingService.getReport(reportId);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Track download
    await reportingService.trackDownload(reportId);

    // Return in requested format
    if (format === 'csv') {
      const csvData = await reportingService.exportReportToCSV(reportId);

      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="2fa-report-${reportId}.csv"`,
        },
      });
    }

    // Return JSON by default
    return NextResponse.json({ report });
  } catch (error) {
    console.error('[Admin 2FA Report Details API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
