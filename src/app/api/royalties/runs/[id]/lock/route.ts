/**
 * POST /api/royalties/runs/:id/lock
 * Finalize and lock a royalty run to prevent further modifications
 * 
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { RoyaltyCalculationService } from '@/modules/royalties/services/royalty-calculation.service';

const auditService = new AuditService(prisma);
const calculationService = new RoyaltyCalculationService(prisma, redis, auditService);

/**
 * POST /api/royalties/runs/:id/lock
 * Lock a royalty run after validation
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate and authorize (Admin only)
    const { user } = await requireAdmin(req);

    const runId = params.id;

    // Validate that the run exists
    const run = await prisma.royaltyRun.findUnique({
      where: { id: runId },
      include: {
        statements: {
          select: {
            status: true,
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

    // Validate run status
    if (run.status === 'LOCKED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid state',
          message: 'Run is already locked',
        },
        { status: 400 }
      );
    }

    if (run.status !== 'CALCULATED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid state',
          message: `Run must be in CALCULATED status to lock. Current status: ${run.status}`,
        },
        { status: 400 }
      );
    }

    // Check for disputed statements
    const disputedStatements = run.statements.filter(
      (stmt) => stmt.status === 'DISPUTED'
    );

    if (disputedStatements.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot lock run',
          message: `Run has ${disputedStatements.length} disputed statement(s). All disputes must be resolved before locking.`,
        },
        { status: 400 }
      );
    }

    // Perform validation (uses service layer)
    try {
      await calculationService.validateLockRun(runId);
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          message: validationError instanceof Error ? validationError.message : 'Validation failed',
        },
        { status: 400 }
      );
    }

    // Lock the run
    const lockedRun = await prisma.royaltyRun.update({
      where: { id: runId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
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

    // Log the lock action
    await auditService.log({
      userId: user.id,
      action: 'ROYALTY_RUN_LOCKED',
      entityType: 'royalty_run',
      entityId: runId,
      after: {
        status: 'LOCKED',
        lockedAt: lockedRun.lockedAt,
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: lockedRun.id,
        periodStart: lockedRun.periodStart.toISOString(),
        periodEnd: lockedRun.periodEnd.toISOString(),
        status: lockedRun.status,
        totalRevenueCents: lockedRun.totalRevenueCents,
        totalRoyaltiesCents: lockedRun.totalRoyaltiesCents,
        statementCount: lockedRun._count.statements,
        processedAt: lockedRun.processedAt?.toISOString() || null,
        lockedAt: lockedRun.lockedAt?.toISOString() || null,
        lockedBy: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        createdAt: lockedRun.createdAt.toISOString(),
        updatedAt: lockedRun.updatedAt.toISOString(),
      },
      message: 'Royalty run locked successfully',
    });
  } catch (error) {
    console.error('[RoyaltyAPI] Error locking run:', error);

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
