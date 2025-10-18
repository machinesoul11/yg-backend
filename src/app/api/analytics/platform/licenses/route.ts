/**
 * Platform Licenses Analytics API Route
 * 
 * GET /api/analytics/platform/licenses
 * 
 * Provides active license counts and renewal rates for platform administrators.
 * ADMIN ONLY endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { requireAuth } from '@/lib/middleware/auth.middleware';
import { PlatformLicensesAnalyticsService } from '@/modules/analytics/services/platform-licenses-analytics.service';
import { LicenseType } from '@prisma/client';

/**
 * Query parameters validation schema
 */
const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional().default('daily'),
  licenseType: z.nativeEnum(LicenseType).optional(),
  brandId: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * GET handler - Fetch platform license analytics
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication and authorization check
    const { user } = await requireAuth(request);

    // Verify admin role
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'This endpoint requires administrator privileges',
        },
        { status: 403 }
      );
    }

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      granularity: searchParams.get('granularity') || 'daily',
      licenseType: searchParams.get('licenseType'),
      brandId: searchParams.get('brandId'),
      projectId: searchParams.get('projectId'),
    };

    const validationResult = querySchema.safeParse(queryParams);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { startDate, endDate, granularity, licenseType, brandId, projectId } = validationResult.data;

    // Parse dates
    const dateRange = {
      start: new Date(startDate),
      end: new Date(endDate),
    };

    // Validate date range
    if (dateRange.start > dateRange.end) {
      return NextResponse.json(
        {
          error: 'Invalid Date Range',
          message: 'Start date must be before or equal to end date',
        },
        { status: 400 }
      );
    }

    // Check date range is not in the future
    const now = new Date();
    if (dateRange.end > now) {
      return NextResponse.json(
        {
          error: 'Invalid Date Range',
          message: 'End date cannot be in the future',
        },
        { status: 400 }
      );
    }

    // Limit date range to prevent performance issues (max 2 years)
    const maxRangeDays = 730;
    const rangeDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    if (rangeDays > maxRangeDays) {
      return NextResponse.json(
        {
          error: 'Invalid Date Range',
          message: `Date range cannot exceed ${maxRangeDays} days`,
        },
        { status: 400 }
      );
    }

    // Build filters
    const filters: any = {};
    if (licenseType) filters.licenseType = licenseType;
    if (brandId) filters.brandId = brandId;
    if (projectId) filters.projectId = projectId;

    // Initialize service
    const analyticsService = new PlatformLicensesAnalyticsService(prisma, redis);

    // Fetch analytics
    const analytics = await analyticsService.getLicenseAnalytics(
      dateRange,
      granularity,
      filters
    );

    return NextResponse.json(analytics, { status: 200 });
  } catch (error) {
    console.error('[Platform Licenses Analytics] Error:', error);

    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// Disable caching for dynamic analytics
export const dynamic = 'force-dynamic';
export const revalidate = 0;
