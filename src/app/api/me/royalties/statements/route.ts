/**
 * GET /api/me/royalties/statements
 * Get authenticated creator's royalty statements
 * 
 * Access: Creator only (authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: z.enum(['PENDING', 'REVIEWED', 'DISPUTED', 'RESOLVED', 'PAID']).optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
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
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      status: searchParams.get('status') || undefined,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
    };

    const validatedParams = querySchema.parse(params);

    const page = parseInt(validatedParams.page);
    const limit = Math.min(parseInt(validatedParams.limit), 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where: any = {
      creatorId: creator.id,
    };

    // Apply status filter
    if (validatedParams.status) {
      where.status = validatedParams.status;
    }

    // Apply date range filter
    if (validatedParams.dateFrom || validatedParams.dateTo) {
      where.createdAt = {};
      if (validatedParams.dateFrom) {
        where.createdAt.gte = new Date(validatedParams.dateFrom);
      }
      if (validatedParams.dateTo) {
        where.createdAt.lte = new Date(validatedParams.dateTo);
      }
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

    // Calculate summary statistics
    const summaryStats = await prisma.royaltyStatement.aggregate({
      where: { creatorId: creator.id },
      _sum: {
        totalEarningsCents: true,
      },
      _count: true,
    });

    const paidStats = await prisma.royaltyStatement.aggregate({
      where: { 
        creatorId: creator.id,
        status: 'PAID',
      },
      _sum: {
        totalEarningsCents: true,
      },
    });

    const pendingStats = await prisma.royaltyStatement.aggregate({
      where: { 
        creatorId: creator.id,
        status: { in: ['PENDING', 'REVIEWED'] },
      },
      _sum: {
        totalEarningsCents: true,
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
        period: {
          start: stmt.royaltyRun.periodStart.toISOString(),
          end: stmt.royaltyRun.periodEnd.toISOString(),
        },
        totalEarningsCents: stmt.totalEarningsCents,
        platformFeeCents: (stmt as any).platformFeeCents || 0,
        netPayableCents: (stmt as any).netPayableCents || stmt.totalEarningsCents,
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
      summary: {
        totalEarnings: summaryStats._sum?.totalEarningsCents || 0,
        totalPaid: paidStats._sum?.totalEarningsCents || 0,
        totalPending: pendingStats._sum?.totalEarningsCents || 0,
        statementCount: summaryStats._count,
      },
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
    console.error('[CreatorRoyaltyAPI] Error listing statements:', error);

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
