/**
 * GET /api/me/royalties/history
 * Get authenticated creator's historical earnings data
 * 
 * Access: Creator only (authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().default('monthly'),
  metrics: z.string().optional(), // comma-separated list of metrics
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
      fromDate: searchParams.get('from_date') || undefined,
      toDate: searchParams.get('to_date') || undefined,
      granularity: searchParams.get('granularity') || 'monthly',
      metrics: searchParams.get('metrics') || undefined,
    };

    const validatedParams = querySchema.parse(params);

    // Default date range: last 24 months for monthly, 90 days for daily
    const defaultToDate = new Date();
    const defaultFromDate = new Date();
    
    if (validatedParams.granularity === 'daily') {
      defaultFromDate.setDate(defaultFromDate.getDate() - 90);
    } else if (validatedParams.granularity === 'weekly') {
      defaultFromDate.setMonth(defaultFromDate.getMonth() - 6);
    } else if (validatedParams.granularity === 'yearly') {
      defaultFromDate.setFullYear(defaultFromDate.getFullYear() - 5);
    } else {
      defaultFromDate.setMonth(defaultFromDate.getMonth() - 24);
    }

    const fromDate = validatedParams.fromDate ? new Date(validatedParams.fromDate) : defaultFromDate;
    const toDate = validatedParams.toDate ? new Date(validatedParams.toDate) : defaultToDate;

    // Validate date range
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    const maxDays = validatedParams.granularity === 'daily' ? 365 : 
                    validatedParams.granularity === 'weekly' ? 730 : 
                    3650; // 10 years for monthly/yearly

    if (daysDiff > maxDays) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          message: `Date range too large for ${validatedParams.granularity} granularity. Maximum ${maxDays} days allowed.`,
        },
        { status: 400 }
      );
    }

    // Get all statements in the date range
    const statements = await prisma.royaltyStatement.findMany({
      where: {
        creatorId: creator.id,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        id: true,
        totalEarningsCents: true,
        status: true,
        paidAt: true,
        createdAt: true,
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
        lines: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by granularity
    const timeSeriesData = groupByGranularity(statements, validatedParams.granularity);

    // Calculate aggregate statistics
    const totalEarnings = statements.reduce((sum, stmt) => sum + stmt.totalEarningsCents, 0);
    const avgEarningsPerPeriod = timeSeriesData.length > 0 
      ? totalEarnings / timeSeriesData.length 
      : 0;

    const sortedPeriods = timeSeriesData.sort((a, b) => b.earningsCents - a.earningsCents);
    const highestEarningPeriod = sortedPeriods[0];
    const lowestEarningPeriod = sortedPeriods[sortedPeriods.length - 1];

    // Calculate growth rate (first to last period)
    const firstPeriod = timeSeriesData[0];
    const lastPeriod = timeSeriesData[timeSeriesData.length - 1];
    const overallGrowthRate = firstPeriod && lastPeriod && firstPeriod.earningsCents > 0
      ? ((lastPeriod.earningsCents - firstPeriod.earningsCents) / firstPeriod.earningsCents) * 100
      : 0;

    // Calculate standard deviation for volatility
    const mean = avgEarningsPerPeriod;
    const variance = timeSeriesData.length > 0
      ? timeSeriesData.reduce((sum, period) => sum + Math.pow(period.earningsCents - mean, 2), 0) / timeSeriesData.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

    // Calculate moving averages (3-period and 6-period)
    const dataWithMovingAvg = calculateMovingAverages(timeSeriesData);

    // Calculate cumulative totals
    let cumulative = 0;
    const dataWithCumulative = dataWithMovingAvg.map(period => {
      cumulative += period.earningsCents;
      return {
        ...period,
        cumulativeEarningsCents: cumulative,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        timeSeries: dataWithCumulative,
        summary: {
          totalEarningsCents: Math.round(totalEarnings),
          avgEarningsPerPeriodCents: Math.round(avgEarningsPerPeriod),
          periodCount: timeSeriesData.length,
          highestEarningPeriod: highestEarningPeriod ? {
            period: highestEarningPeriod.period,
            earningsCents: highestEarningPeriod.earningsCents,
          } : null,
          lowestEarningPeriod: lowestEarningPeriod ? {
            period: lowestEarningPeriod.period,
            earningsCents: lowestEarningPeriod.earningsCents,
          } : null,
          overallGrowthRatePct: Math.round(overallGrowthRate * 100) / 100,
          volatility: {
            stdDevCents: Math.round(stdDev),
            coefficientOfVariationPct: Math.round(coefficientOfVariation * 100) / 100,
            interpretation: coefficientOfVariation < 20 ? 'Low volatility - Stable earnings' :
                           coefficientOfVariation < 50 ? 'Moderate volatility - Some variation' :
                           'High volatility - Highly variable earnings',
          },
        },
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          granularity: validatedParams.granularity,
          daysSpan: daysDiff,
        },
      },
    });
  } catch (error) {
    console.error('[CreatorRoyaltyAPI] Error fetching history:', error);

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
 * Group statements by time granularity
 */
function groupByGranularity(
  statements: any[],
  granularity: 'daily' | 'weekly' | 'monthly' | 'yearly'
): Array<{ period: string; earningsCents: number; transactionCount: number; paidCount: number }> {
  const groups = new Map<string, { earnings: number; count: number; paid: number }>();

  statements.forEach(stmt => {
    const date = new Date(stmt.royaltyRun.periodEnd);
    let periodKey: string;

    switch (granularity) {
      case 'daily':
        periodKey = date.toISOString().split('T')[0];
        break;
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      case 'monthly':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'yearly':
        periodKey = String(date.getFullYear());
        break;
    }

    const existing = groups.get(periodKey) || { earnings: 0, count: 0, paid: 0 };
    existing.earnings += stmt.totalEarningsCents;
    existing.count += stmt.lines.length;
    if (stmt.status === 'PAID') {
      existing.paid += 1;
    }

    groups.set(periodKey, existing);
  });

  return Array.from(groups.entries())
    .map(([period, data]) => ({
      period,
      earningsCents: data.earnings,
      transactionCount: data.count,
      paidCount: data.paid,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Calculate moving averages
 */
function calculateMovingAverages(
  data: Array<{ period: string; earningsCents: number; transactionCount: number; paidCount: number }>
): Array<{ 
  period: string; 
  earningsCents: number; 
  transactionCount: number; 
  paidCount: number;
  movingAvg3Cents: number | null;
  movingAvg6Cents: number | null;
}> {
  return data.map((item, index) => {
    // 3-period moving average
    let movingAvg3 = null;
    if (index >= 2) {
      const sum3 = data.slice(index - 2, index + 1).reduce((sum, d) => sum + d.earningsCents, 0);
      movingAvg3 = Math.round(sum3 / 3);
    }

    // 6-period moving average
    let movingAvg6 = null;
    if (index >= 5) {
      const sum6 = data.slice(index - 5, index + 1).reduce((sum, d) => sum + d.earningsCents, 0);
      movingAvg6 = Math.round(sum6 / 6);
    }

    return {
      ...item,
      movingAvg3Cents: movingAvg3,
      movingAvg6Cents: movingAvg6,
    };
  });
}
