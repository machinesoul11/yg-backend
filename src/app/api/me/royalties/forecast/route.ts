/**
 * GET /api/me/royalties/forecast
 * Get authenticated creator's projected future earnings
 * 
 * Access: Creator only (authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  days: z.string().optional().default('30'),
  confidenceLevel: z.enum(['conservative', 'moderate', 'optimistic']).optional().default('moderate'),
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
      days: searchParams.get('days') || '30',
      confidenceLevel: searchParams.get('confidence_level') || 'moderate',
    };

    const validatedParams = querySchema.parse(params);
    const forecastDays = parseInt(validatedParams.days);

    // Get historical data for the last 12 months
    const historicalStartDate = new Date();
    historicalStartDate.setMonth(historicalStartDate.getMonth() - 12);

    const historicalStatements = await prisma.royaltyStatement.findMany({
      where: {
        creatorId: creator.id,
        createdAt: {
          gte: historicalStartDate,
        },
      },
      select: {
        totalEarningsCents: true,
        createdAt: true,
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Check if we have enough historical data
    if (historicalStatements.length < 3) {
      return NextResponse.json({
        success: true,
        data: {
          available: false,
          message: 'Insufficient historical data to generate forecast. At least 3 months of earnings history is required.',
          requirement: {
            minimumStatements: 3,
            currentStatements: historicalStatements.length,
          },
        },
      });
    }

    // Calculate forecast using simple moving average with trend
    const forecast = calculateForecast(
      historicalStatements,
      forecastDays,
      validatedParams.confidenceLevel
    );

    // Calculate recent performance for comparison
    const recentStatements = historicalStatements.slice(-3);
    const recentAvg = recentStatements.reduce((sum, stmt) => sum + stmt.totalEarningsCents, 0) / recentStatements.length;

    return NextResponse.json({
      success: true,
      data: {
        available: true,
        forecast: {
          periodDays: forecastDays,
          projectedEarningsCents: forecast.projected,
          confidenceLevel: validatedParams.confidenceLevel,
          range: {
            lowCents: forecast.low,
            highCents: forecast.high,
          },
        },
        methodology: {
          approach: 'Moving Average with Linear Trend',
          historicalPeriodMonths: 12,
          dataPointsUsed: historicalStatements.length,
          confidenceNote: getConfidenceNote(validatedParams.confidenceLevel),
        },
        comparison: {
          recentAvgMonthlyEarningsCents: Math.round(recentAvg),
          projectedVsRecentDiff: Math.round(forecast.projected - recentAvg),
          projectedVsRecentPct: recentAvg > 0 ? Math.round(((forecast.projected - recentAvg) / recentAvg) * 100) : 0,
        },
        insights: generateInsights(historicalStatements, forecast, recentAvg),
      },
    });
  } catch (error) {
    console.error('[CreatorRoyaltyAPI] Error generating forecast:', error);

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
 * Calculate forecast using moving average with linear trend
 */
function calculateForecast(
  statements: any[],
  forecastDays: number,
  confidenceLevel: 'conservative' | 'moderate' | 'optimistic'
): { projected: number; low: number; high: number } {
  if (statements.length === 0) {
    return { projected: 0, low: 0, high: 0 };
  }

  // Calculate average earnings per month
  const monthlyEarnings = statements.map(stmt => stmt.totalEarningsCents);
  const avgMonthlyEarnings = monthlyEarnings.reduce((sum, val) => sum + val, 0) / monthlyEarnings.length;

  // Calculate trend (linear regression slope)
  const trend = calculateTrend(monthlyEarnings);

  // Calculate standard deviation for confidence intervals
  const stdDev = calculateStdDev(monthlyEarnings, avgMonthlyEarnings);

  // Project forward based on forecast days (convert to months)
  const forecastMonths = forecastDays / 30;
  const projectedBase = avgMonthlyEarnings + (trend * forecastMonths);

  // Apply confidence level adjustments
  let projected: number;
  let multiplier: number;

  switch (confidenceLevel) {
    case 'conservative':
      multiplier = 1.5;
      projected = Math.max(0, projectedBase - (stdDev * 0.5));
      break;
    case 'optimistic':
      multiplier = 1.5;
      projected = projectedBase + (stdDev * 0.5);
      break;
    case 'moderate':
    default:
      multiplier = 1.0;
      projected = projectedBase;
      break;
  }

  // Calculate range
  const low = Math.max(0, projected - (stdDev * multiplier));
  const high = projected + (stdDev * multiplier);

  return {
    projected: Math.round(projected),
    low: Math.round(low),
    high: Math.round(high),
  };
}

/**
 * Calculate linear trend (slope)
 */
function calculateTrend(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const indices = Array.from({ length: n }, (_, i) => i);
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return isFinite(slope) ? slope : 0;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;

  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Get confidence level explanation
 */
function getConfidenceNote(level: string): string {
  switch (level) {
    case 'conservative':
      return 'Conservative forecast using lower bound of historical variance. Suitable for budgeting and planning.';
    case 'optimistic':
      return 'Optimistic forecast using upper bound of historical variance. Represents potential upside scenario.';
    case 'moderate':
    default:
      return 'Moderate forecast based on historical average with linear trend adjustment. Most likely scenario.';
  }
}

/**
 * Generate insights based on forecast
 */
function generateInsights(
  historical: any[],
  forecast: { projected: number; low: number; high: number },
  recentAvg: number
): string[] {
  const insights: string[] = [];

  // Trend insight
  const trend = calculateTrend(historical.map(s => s.totalEarningsCents));
  if (trend > 0) {
    insights.push('Your earnings show positive growth trend. Continue your current strategy.');
  } else if (trend < 0) {
    insights.push('Your earnings show declining trend. Consider diversifying your content or revenue streams.');
  } else {
    insights.push('Your earnings are stable. Look for opportunities to increase engagement.');
  }

  // Variability insight
  const stdDev = calculateStdDev(
    historical.map(s => s.totalEarningsCents),
    historical.reduce((sum, s) => sum + s.totalEarningsCents, 0) / historical.length
  );
  const coefficientOfVariation = (stdDev / recentAvg) * 100;

  if (coefficientOfVariation > 50) {
    insights.push('Your earnings have high variability. Focus on building consistent revenue streams.');
  } else if (coefficientOfVariation < 20) {
    insights.push('Your earnings are very consistent. This provides good financial predictability.');
  }

  // Forecast confidence
  const rangePercent = recentAvg > 0 ? ((forecast.high - forecast.low) / recentAvg) * 100 : 0;
  if (rangePercent > 100) {
    insights.push('Wide forecast range suggests uncertainty. More historical data will improve accuracy.');
  }

  return insights;
}
