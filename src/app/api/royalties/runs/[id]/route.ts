/**
 * GET /api/royalties/runs/:id
 * Get detailed information about a specific royalty run
 * 
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';
import { prisma } from '@/lib/db';

/**
 * GET /api/royalties/runs/:id
 * Retrieve detailed run information
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate and authorize (Admin only)
    await requireAdmin(req);

    const runId = params.id;

    // Fetch run with all related data
    const run = await prisma.royaltyRun.findUnique({
      where: { id: runId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        statements: {
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
            _count: {
              select: {
                lines: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not found',
          message: `Royalty run with ID ${runId} not found`,
        },
        { status: 404 }
      );
    }

    // Calculate summary statistics
    const statementsByStatus = run.statements.reduce((acc: any, stmt) => {
      acc[stmt.status] = (acc[stmt.status] || 0) + 1;
      return acc;
    }, {});

    const totalCreators = run.statements.length;
    const totalLineItems = run.statements.reduce(
      (sum, stmt) => sum + stmt._count.lines,
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        id: run.id,
        periodStart: run.periodStart.toISOString(),
        periodEnd: run.periodEnd.toISOString(),
        status: run.status,
        totalRevenueCents: run.totalRevenueCents,
        totalRoyaltiesCents: run.totalRoyaltiesCents,
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
        summary: {
          totalCreators,
          totalLineItems,
          statementsByStatus,
          averageEarningsPerCreator:
            totalCreators > 0
              ? Math.round(run.totalRoyaltiesCents / totalCreators)
              : 0,
        },
        statements: run.statements.map((stmt) => ({
          id: stmt.id,
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
          paidAt: stmt.paidAt?.toISOString() || null,
          createdAt: stmt.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error fetching run details:', error);

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
