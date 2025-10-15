/**
 * GET /api/royalties/statements/:id
 * Get detailed information about a specific royalty statement
 * 
 * Access:
 * - Creators: Can view their own statements only
 * - Admins: Can view all statements
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';

/**
 * GET /api/royalties/statements/:id
 * Retrieve detailed statement information
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const { user } = await requireAuth(req);

    const statementId = params.id;

    // Fetch statement with all related data
    const statement = await prisma.royaltyStatement.findUnique({
      where: { id: statementId },
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
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        lines: {
          include: {
            ipAsset: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
            license: {
              select: {
                id: true,
                licenseType: true,
                brandId: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!statement) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not found',
          message: `Royalty statement with ID ${statementId} not found`,
        },
        { status: 404 }
      );
    }

    // Authorization check: Non-admin users can only view their own statements
    if (user.role !== 'ADMIN') {
      if (statement.creator.userId !== user.id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden',
            message: 'You do not have permission to view this statement',
          },
          { status: 403 }
        );
      }
    }

    // Calculate line item summaries
    const lineItemsByAsset = statement.lines.reduce((acc: any, line) => {
      const assetId = line.ipAssetId;
      if (!acc[assetId]) {
        acc[assetId] = {
          ipAsset: {
            id: line.ipAsset.id,
            title: line.ipAsset.title,
            type: line.ipAsset.type,
          },
          totalRevenueCents: 0,
          totalRoyaltyCents: 0,
          lineCount: 0,
        };
      }
      acc[assetId].totalRevenueCents += line.revenueCents;
      acc[assetId].totalRoyaltyCents += line.calculatedRoyaltyCents;
      acc[assetId].lineCount += 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        id: statement.id,
        royaltyRun: {
          id: statement.royaltyRun.id,
          periodStart: statement.royaltyRun.periodStart.toISOString(),
          periodEnd: statement.royaltyRun.periodEnd.toISOString(),
          status: statement.royaltyRun.status,
          lockedAt: statement.royaltyRun.lockedAt?.toISOString() || null,
          createdBy: {
            id: statement.royaltyRun.creator.id,
            name: statement.royaltyRun.creator.name,
            email: statement.royaltyRun.creator.email,
          },
        },
        creator: {
          id: statement.creator.id,
          userId: statement.creator.userId,
          name: statement.creator.user.name,
          email: statement.creator.user.email,
          stageName: statement.creator.stageName,
        },
        totalEarningsCents: statement.totalEarningsCents,
        platformFeeCents: (statement as any).platformFeeCents || 0,
        netPayableCents: (statement as any).netPayableCents || 0,
        status: statement.status,
        reviewedAt: statement.reviewedAt?.toISOString() || null,
        disputedAt: statement.disputedAt?.toISOString() || null,
        disputeReason: statement.disputeReason,
        paidAt: statement.paidAt?.toISOString() || null,
        paymentReference: statement.paymentReference,
        pdfStorageKey: (statement as any).pdfStorageKey,
        pdfGeneratedAt: (statement as any).pdfGeneratedAt?.toISOString() || null,
        metadata: (statement as any).metadata,
        createdAt: statement.createdAt.toISOString(),
        updatedAt: statement.updatedAt.toISOString(),
        summary: {
          totalLineItems: statement.lines.length,
          totalRevenueCents: statement.lines.reduce(
            (sum, line) => sum + line.revenueCents,
            0
          ),
          lineItemsByAsset: Object.values(lineItemsByAsset),
        },
      },
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error fetching statement details:', error);

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
