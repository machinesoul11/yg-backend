/**
 * POST /api/royalties/run
 * Initiate a new royalty calculation run
 * 
 * Admin-only endpoint for creating and executing royalty calculations
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { RoyaltyCalculationService } from '@/modules/royalties/services/royalty-calculation.service';
import { z } from 'zod';

const auditService = new AuditService(prisma);
const calculationService = new RoyaltyCalculationService(prisma, redis, auditService);

// Request schema
const createRunSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  notes: z.string().optional(),
  autoCalculate: z.boolean().default(true),
});

/**
 * POST /api/royalties/run
 * Create and optionally calculate a new royalty run
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate and authorize (Admin only)
    const { user } = await requireAdmin(req);

    // Parse and validate request body
    const body = await req.json();
    const validatedData = createRunSchema.parse(body);

    const periodStart = new Date(validatedData.periodStart);
    const periodEnd = new Date(validatedData.periodEnd);

    // Validate date range
    if (periodStart >= periodEnd) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date range',
          message: 'Period start must be before period end',
        },
        { status: 400 }
      );
    }

    // Check for future dates
    const now = new Date();
    if (periodEnd > now) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date range',
          message: 'Period end date cannot be in the future',
        },
        { status: 400 }
      );
    }

    // Create the royalty run
    const run = await prisma.royaltyRun.create({
      data: {
        periodStart,
        periodEnd,
        status: 'DRAFT',
        createdBy: user.id,
        notes: validatedData.notes,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // If autoCalculate is true, trigger calculation immediately
    if (validatedData.autoCalculate) {
      // Execute calculation asynchronously (don't await)
      calculationService.calculateRun(run.id, user.id).catch((error) => {
        console.error('[RoyaltyAPI] Background calculation failed:', error);
      });

      return NextResponse.json({
        success: true,
        data: {
          id: run.id,
          periodStart: run.periodStart.toISOString(),
          periodEnd: run.periodEnd.toISOString(),
          status: 'PROCESSING',
          notes: run.notes,
          createdBy: {
            id: run.creator.id,
            name: run.creator.name,
            email: run.creator.email,
          },
          createdAt: run.createdAt.toISOString(),
        },
        message: 'Royalty run created and calculation initiated',
      });
    }

    // Return created run without calculation
    return NextResponse.json({
      success: true,
      data: {
        id: run.id,
        periodStart: run.periodStart.toISOString(),
        periodEnd: run.periodEnd.toISOString(),
        status: run.status,
        notes: run.notes,
        createdBy: {
          id: run.creator.id,
          name: run.creator.name,
          email: run.creator.email,
        },
        createdAt: run.createdAt.toISOString(),
      },
      message: 'Royalty run created successfully',
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error creating run:', error);

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
