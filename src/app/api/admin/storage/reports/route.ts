/**
 * Storage Reports API Route
 * 
 * Admin endpoint for comprehensive storage reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { StorageReportingService } from '@/lib/storage/storage-reporting';
import { UserRole } from '@prisma/client';

const storageReportingService = new StorageReportingService(prisma);

/**
 * GET /api/admin/storage/reports
 * 
 * Get comprehensive storage report
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : undefined;
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : undefined;

    const report = await storageReportingService.generateStorageReport({
      startDate,
      endDate,
    });

    // Serialize BigInt values
    const serializedReport = {
      summary: {
        totalBytes: report.summary.totalBytes.toString(),
        totalFiles: report.summary.totalFiles,
        averageFileSize: report.summary.averageFileSize.toString(),
        largestFile: report.summary.largestFile 
          ? {
              ...report.summary.largestFile,
              size: report.summary.largestFile.size.toString(),
            }
          : null,
      },
      breakdown: {
        byType: Object.entries(report.breakdown.byType).reduce((acc, [key, val]) => {
          acc[key] = {
            bytes: val.bytes.toString(),
            count: val.count,
            percentage: val.percentage,
          };
          return acc;
        }, {} as any),
        byUser: report.breakdown.byUser.map((u) => ({
          ...u,
          bytes: u.bytes.toString(),
        })),
        byProject: report.breakdown.byProject.map((p) => ({
          ...p,
          bytes: p.bytes.toString(),
        })),
      },
      trends: {
        daily: {
          current: report.trends.daily.current.toString(),
          previous: report.trends.daily.previous.toString(),
          growthRate: report.trends.daily.growthRate,
          growthBytes: report.trends.daily.growthBytes.toString(),
        },
        weekly: {
          current: report.trends.weekly.current.toString(),
          previous: report.trends.weekly.previous.toString(),
          growthRate: report.trends.weekly.growthRate,
          growthBytes: report.trends.weekly.growthBytes.toString(),
        },
        monthly: {
          current: report.trends.monthly.current.toString(),
          previous: report.trends.monthly.previous.toString(),
          growthRate: report.trends.monthly.growthRate,
          growthBytes: report.trends.monthly.growthBytes.toString(),
        },
      },
      topConsumers: {
        users: report.topConsumers.users.map((u) => ({
          ...u,
          bytes: u.bytes.toString(),
        })),
        projects: report.topConsumers.projects.map((p) => ({
          ...p,
          bytes: p.bytes.toString(),
        })),
      },
    };

    return NextResponse.json({
      success: true,
      data: serializedReport,
    });
  } catch (error) {
    console.error('Storage report generation failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate storage report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
