/**
 * GET /api/royalties/runs
 * List all royalty calculation runs
 * 
 * Admin-only endpoint with pagination and filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: z.enum(['DRAFT', 'PROCESSING', 'CALCULATED', 'LOCKED', 'FAILED']).optional(),
  sortBy: z.enum(['periodStart', 'periodEnd', 'createdAt', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * GET /api/royalties/runs
 * List royalty runs with pagination and filtering
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate and authorize (Admin only)
    await requireAdmin(req);

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const params = {
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      status: searchParams.get('status') || undefined,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    };

    const validatedParams = querySchema.parse(params);

    const page = parseInt(validatedParams.page);
    const limit = Math.min(parseInt(validatedParams.limit), 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where: any = {};
    if (validatedParams.status) {
      where.status = validatedParams.status;
    }

    // Get total count
    const totalCount = await prisma.royaltyRun.count({ where });

    // Fetch runs with pagination
    const runs = await prisma.royaltyRun.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [validatedParams.sortBy]: validatedParams.sortOrder,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            statements: true,
          },
        },
      },
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return NextResponse.json({
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        periodStart: run.periodStart.toISOString(),
        periodEnd: run.periodEnd.toISOString(),
        status: run.status,
        totalRevenueCents: run.totalRevenueCents,
        totalRoyaltiesCents: run.totalRoyaltiesCents,
        statementCount: run._count.statements,
        processedAt: run.processedAt?.toISOString() || null,
        lockedAt: run.lockedAt?.toISOString() || null,
        notes: run.notes,
        createdBy: {
          id: run.creator.id,
          name: run.creator.name,
          email: run.creator.email,
        },
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error listing runs:', error);

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
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden',
          message: 'Admin access required',
        },
        { status: 403 }
      );
    }

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
