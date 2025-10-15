/**
 * GET /api/me/royalties/earnings
 * Get authenticated creator's earnings summary with analytics
 * 
 * Access: Creator only (authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Query parameters schema
const querySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  groupBy: z.enum(['day', 'week', 'month', 'year']).optional().default('month'),
});

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const { user } = await requireAuth(req);

    // Find creator profile for this user
    const creator = await prisma.creator.findUnique({
      where: { userId: user.id },
    });

    if (!creator) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not found',
          message: 'Creator profile not found. This endpoint is only accessible to creators.',
        },
        { status: 404 }
      );
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const params = {
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      groupBy: searchParams.get('group_by') || 'month',
    };

    const validatedParams = querySchema.parse(params);

    // Default date range: last 12 months
    const defaultDateTo = new Date();
    const defaultDateFrom = new Date();
    defaultDateFrom.setMonth(defaultDateFrom.getMonth() - 12);

    const dateFrom = validatedParams.dateFrom ? new Date(validatedParams.dateFrom) : defaultDateFrom;
    const dateTo = validatedParams.dateTo ? new Date(validatedParams.dateTo) : defaultDateTo;

    // Get statements in the date range
    const statements = await prisma.royaltyStatement.findMany({
      where: {
        creatorId: creator.id,
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      select: {
        id: true,
        totalEarningsCents: true,
        status: true,
        createdAt: true,
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
        lines: {
          select: {
            calculatedRoyaltyCents: true,
            ipAssetId: true,
            ipAsset: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate overall summary
    const totalEarnings = statements.reduce((sum, stmt) => sum + stmt.totalEarningsCents, 0);
    const totalPaid = statements
      .filter(stmt => stmt.status === 'PAID')
      .reduce((sum, stmt) => sum + stmt.totalEarningsCents, 0);
    const totalPending = statements
      .filter(stmt => ['PENDING', 'REVIEWED'].includes(stmt.status))
      .reduce((sum, stmt) => sum + stmt.totalEarningsCents, 0);

    // Calculate earnings by time period
    const earningsByPeriod = groupEarningsByPeriod(statements, validatedParams.groupBy);

    // Calculate growth metrics
    const growthMetrics = calculateGrowthMetrics(earningsByPeriod);

    // Calculate top earning assets
    const assetEarnings = new Map<string, { 
      id: string; 
      title: string; 
      type: string; 
      earnings: number;
      count: number;
    }>();

    statements.forEach(stmt => {
      stmt.lines.forEach(line => {
        const existing = assetEarnings.get(line.ipAssetId) || {
          id: line.ipAsset.id,
          title: line.ipAsset.title,
          type: line.ipAsset.type,
          earnings: 0,
          count: 0,
        };
        existing.earnings += line.calculatedRoyaltyCents;
        existing.count += 1;
        assetEarnings.set(line.ipAssetId, existing);
      });
    });

    const topAssets = Array.from(assetEarnings.values())
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);

    // Calculate average earnings per period
    const avgEarningsPerPeriod = earningsByPeriod.length > 0
      ? totalEarnings / earningsByPeriod.length
      : 0;

    // Find highest earning period
    const highestEarningPeriod = earningsByPeriod.length > 0
      ? earningsByPeriod.reduce((max, curr) => curr.earnings > max.earnings ? curr : max)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalEarningsCents: totalEarnings,
          totalPaidCents: totalPaid,
          totalPendingCents: totalPending,
          avgEarningsPerPeriodCents: Math.round(avgEarningsPerPeriod),
          highestEarningPeriod: highestEarningPeriod ? {
            period: highestEarningPeriod.period,
            earningsCents: highestEarningPeriod.earnings,
          } : null,
          statementCount: statements.length,
        },
        breakdown: earningsByPeriod,
        topAssets: topAssets.map(asset => ({
          id: asset.id,
          title: asset.title,
          type: asset.type,
          totalEarningsCents: asset.earnings,
          licenseCount: asset.count,
        })),
        growth: growthMetrics,
        period: {
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
          groupBy: validatedParams.groupBy,
        },
      },
    });
  } catch (error) {
    console.error('[CreatorRoyaltyAPI] Error fetching earnings:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    // Handle authorization errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Group earnings by time period
 */
function groupEarningsByPeriod(
  statements: any[],
  groupBy: 'day' | 'week' | 'month' | 'year'
): Array<{ period: string; earnings: number; paid: number; pending: number }> {
  const groups = new Map<string, { earnings: number; paid: number; pending: number }>();

  statements.forEach(stmt => {
    const date = new Date(stmt.royaltyRun.periodEnd);
    let periodKey: string;

    switch (groupBy) {
      case 'day':
        periodKey = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'year':
        periodKey = String(date.getFullYear());
        break;
    }

    const existing = groups.get(periodKey) || { earnings: 0, paid: 0, pending: 0 };
    existing.earnings += stmt.totalEarningsCents;
    
    if (stmt.status === 'PAID') {
      existing.paid += stmt.netPayableCents;
    } else if (['PENDING', 'REVIEWED'].includes(stmt.status)) {
      existing.pending += stmt.netPayableCents;
    }

    groups.set(periodKey, existing);
  });

  return Array.from(groups.entries())
    .map(([period, data]) => ({ period, ...data }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Calculate growth metrics
 */
function calculateGrowthMetrics(
  periods: Array<{ period: string; earnings: number }>
): {
  currentPeriodCents: number;
  previousPeriodCents: number;
  growthRate: number;
  trend: 'up' | 'down' | 'stable';
} {
  if (periods.length < 2) {
    return {
      currentPeriodCents: periods[0]?.earnings || 0,
      previousPeriodCents: 0,
      growthRate: 0,
      trend: 'stable',
    };
  }

  const current = periods[periods.length - 1].earnings;
  const previous = periods[periods.length - 2].earnings;
  const growthRate = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (Math.abs(growthRate) < 5) {
    trend = 'stable';
  } else if (growthRate > 0) {
    trend = 'up';
  } else {
    trend = 'down';
  }

  return {
    currentPeriodCents: current,
    previousPeriodCents: previous,
    growthRate: Math.round(growthRate * 100) / 100,
    trend,
  };
}
