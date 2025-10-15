/**
 * Blog Analytics Aggregation Job API Route
 * POST /api/blog/analytics/aggregate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { 
  runBlogAnalyticsAggregation, 
  runDailyAggregation 
} from '@/lib/services/blog-analytics-aggregation.service';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions (admin only for manual aggregation)
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'full';
    const date = searchParams.get('date');

    let result;

    switch (type) {
      case 'full':
        console.log('Starting full blog analytics aggregation...');
        await runBlogAnalyticsAggregation(prisma);
        result = { 
          type: 'full', 
          message: 'Full analytics aggregation completed successfully',
          timestamp: new Date().toISOString(),
        };
        break;

      case 'daily':
        const targetDate = date ? new Date(date) : new Date();
        console.log(`Starting daily aggregation for ${targetDate.toISOString().split('T')[0]}...`);
        await runDailyAggregation(prisma, targetDate);
        result = { 
          type: 'daily', 
          date: targetDate.toISOString().split('T')[0],
          message: 'Daily analytics aggregation completed successfully',
          timestamp: new Date().toISOString(),
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid aggregation type. Use "full" or "daily"' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error running analytics aggregation:', error);
    return NextResponse.json(
      { 
        error: 'Aggregation failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check aggregation status and provide documentation
export async function GET() {
  return NextResponse.json({
    description: 'Blog Analytics Aggregation Job API',
    endpoints: {
      'POST /api/blog/analytics/aggregate': 'Run analytics aggregation job',
    },
    parameters: {
      type: {
        description: 'Type of aggregation to run',
        options: ['full', 'daily'],
        default: 'full',
      },
      date: {
        description: 'Date for daily aggregation (YYYY-MM-DD format)',
        required: false,
        example: '2025-10-15',
      },
    },
    usage: {
      fullAggregation: 'POST /api/blog/analytics/aggregate?type=full',
      dailyAggregation: 'POST /api/blog/analytics/aggregate?type=daily&date=2025-10-15',
    },
    permissions: 'Admin only',
  });
}
