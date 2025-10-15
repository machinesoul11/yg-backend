/**
 * GET /api/royalties/statements
 * List royalty statements with filtering and pagination
 * 
 * Access:
 * - Creators: Can view their own statements only
 * - Admins: Can view all statements
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  creatorId: z.string().optional(),
  runId: z.string().optional(),
  status: z.enum(['PENDING', 'REVIEWED', 'DISPUTED', 'RESOLVED', 'PAID']).optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * GET /api/royalties/statements
 * List statements with filters
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user (creators and admins)
    const { user } = await requireAuth(req);

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const params = {
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      creatorId: searchParams.get('creatorId') || undefined,
      runId: searchParams.get('runId') || undefined,
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

    // Non-admin users can only see their own statements
    if (user.role !== 'ADMIN') {
      // Find creator profile for this user
      const creator = await prisma.creator.findUnique({
        where: { userId: user.id },
      });

      if (!creator) {
        return NextResponse.json(
          {
            success: false,
            error: 'Not found',
            message: 'Creator profile not found for this user',
          },
          { status: 404 }
        );
      }

      where.creatorId = creator.id;
    } else {
      // Admin can filter by specific creator if provided
      if (validatedParams.creatorId) {
        where.creatorId = validatedParams.creatorId;
      }
    }

    // Apply other filters
    if (validatedParams.runId) {
      where.royaltyRunId = validatedParams.runId;
    }

    if (validatedParams.status) {
      where.status = validatedParams.status;
    }

    // Get total count
    const totalCount = await prisma.royaltyStatement.count({ where });

    // Fetch statements with pagination
    const statements = await prisma.royaltyStatement.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [validatedParams.sortBy]: validatedParams.sortOrder,
      },
      include: {
        creator: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        royaltyRun: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
        _count: {
          select: {
            lines: true,
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
      data: statements.map((stmt) => ({
        id: stmt.id,
        royaltyRun: {
          id: stmt.royaltyRun.id,
          periodStart: stmt.royaltyRun.periodStart.toISOString(),
          periodEnd: stmt.royaltyRun.periodEnd.toISOString(),
          status: stmt.royaltyRun.status,
        },
        creator: {
          id: stmt.creator.id,
          userId: stmt.creator.userId,
          name: stmt.creator.user.name,
          email: stmt.creator.user.email,
          stageName: stmt.creator.stageName,
        },
        totalEarningsCents: stmt.totalEarningsCents,
        platformFeeCents: (stmt as any).platformFeeCents || 0,
        netPayableCents: (stmt as any).netPayableCents || 0,
        status: stmt.status,
        lineItemCount: stmt._count.lines,
        reviewedAt: stmt.reviewedAt?.toISOString() || null,
        disputedAt: stmt.disputedAt?.toISOString() || null,
        disputeReason: stmt.disputeReason,
        paidAt: stmt.paidAt?.toISOString() || null,
        paymentReference: stmt.paymentReference,
        pdfAvailable: !!(stmt as any).pdfStorageKey,
        createdAt: stmt.createdAt.toISOString(),
        updatedAt: stmt.updatedAt.toISOString(),
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
    console.error('[RoyaltyAPI] Error listing statements:', error);

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
