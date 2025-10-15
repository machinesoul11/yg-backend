/**
 * GET /api/royalties/:id/lines
 * Get line items for a specific royalty statement
 * 
 * Access:
 * - Creators: Can view line items for their own statements
 * - Admins: Can view all line items
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Query parameters schema
const querySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50'),
  sortBy: z.enum(['createdAt', 'calculatedRoyaltyCents', 'revenueCents']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * GET /api/royalties/statements/:id/lines
 * List line items for a statement with pagination
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const { user } = await requireAuth(req);

    const statementId = params.id;

    // Verify statement exists and check authorization
    const statement = await prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        creator: {
          select: {
            userId: true,
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
            message: 'You do not have permission to view these line items',
          },
          { status: 403 }
        );
      }
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const params_query = {
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'asc',
    };

    const validatedParams = querySchema.parse(params_query);

    const page = parseInt(validatedParams.page);
    const limit = Math.min(parseInt(validatedParams.limit), 500); // Max 500 per page
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await prisma.royaltyLine.count({
      where: { royaltyStatementId: statementId },
    });

    // Fetch line items with pagination
    const lines = await prisma.royaltyLine.findMany({
      where: { royaltyStatementId: statementId },
      skip,
      take: limit,
      orderBy: {
        [validatedParams.sortBy]: validatedParams.sortOrder,
      },
      include: {
        ipAsset: {
          select: {
            id: true,
            title: true,
            type: true,
            description: true,
          },
        },
        license: {
          select: {
            id: true,
            licenseType: true,
            status: true,
            brandId: true,
            brand: {
              select: {
                id: true,
                companyName: true,
              },
            },
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
      data: lines.map((line) => ({
        id: line.id,
        ipAsset: {
          id: line.ipAsset.id,
          title: line.ipAsset.title,
          type: line.ipAsset.type,
          description: line.ipAsset.description,
        },
        license: line.licenseId === 'MANUAL_ADJUSTMENT' || 
                 line.licenseId === 'CARRYOVER' || 
                 line.licenseId === 'THRESHOLD_NOTE' ||
                 line.licenseId === 'CORRECTION'
          ? {
              id: line.licenseId,
              type: line.licenseId,
              brand: null,
            }
          : {
              id: line.license.id,
              licenseType: line.license.licenseType,
              status: line.license.status,
              brand: {
                id: line.license.brand.id,
                companyName: line.license.brand.companyName,
              },
            },
        revenueCents: line.revenueCents,
        shareBps: line.shareBps,
        calculatedRoyaltyCents: line.calculatedRoyaltyCents,
        periodStart: line.periodStart.toISOString(),
        periodEnd: line.periodEnd.toISOString(),
        metadata: line.metadata,
        createdAt: line.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      summary: {
        totalRevenueCents: lines.reduce((sum, line) => sum + line.revenueCents, 0),
        totalRoyaltyCents: lines.reduce((sum, line) => sum + line.calculatedRoyaltyCents, 0),
      },
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error fetching line items:', error);

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
