/**
 * POST /api/royalties/statements/:id/dispute
 * Create a dispute for a royalty statement
 * 
 * Access: Creator only (authenticated, must own the statement)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/db';
import { RoyaltyStatementService } from '@/modules/royalties/services/royalty-statement.service';
import { redis } from '@/lib/redis';
import { z } from 'zod';

// Request body schema
const disputeSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(2000, 'Reason must not exceed 2000 characters'),
  description: z.string().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const statementId = params.id;

    // Verify statement exists and belongs to this creator
    const statement = await prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
      },
    });

    if (!statement) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not found',
          message: 'Statement not found',
        },
        { status: 404 }
      );
    }

    if (statement.creatorId !== creator.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to dispute this statement',
        },
        { status: 403 }
      );
    }

    // Validate statement is disputable
    if (statement.status === 'DISPUTED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Conflict',
          message: 'This statement is already disputed',
        },
        { status: 409 }
      );
    }

    if (statement.status === 'PAID') {
      // Check if dispute window has passed (e.g., 90 days after payment)
      const disputeDeadline = new Date(statement.paidAt!);
      disputeDeadline.setDate(disputeDeadline.getDate() + 90);

      if (new Date() > disputeDeadline) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden',
            message: 'Dispute window has closed. Disputes must be filed within 90 days of payment.',
          },
          { status: 403 }
        );
      }
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = disputeSchema.parse(body);

    // Build dispute reason with optional description and evidence
    let fullReason = validatedData.reason;
    if (validatedData.description) {
      fullReason += `\n\nAdditional Details:\n${validatedData.description}`;
    }
    if (validatedData.evidenceUrls && validatedData.evidenceUrls.length > 0) {
      fullReason += `\n\nSupporting Evidence:\n${validatedData.evidenceUrls.join('\n')}`;
    }

    // Use the existing service to handle dispute logic
    const royaltyStatementService = new RoyaltyStatementService(prisma, redis);
    await royaltyStatementService.disputeStatement(statementId, fullReason, creator.id);

    // Get updated statement
    const updatedStatement = await prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedStatement!.id,
        status: updatedStatement!.status,
        disputedAt: updatedStatement!.disputedAt?.toISOString(),
        disputeReason: validatedData.reason, // Return just the main reason, not the full formatted version
        message: 'Dispute submitted successfully',
      },
      meta: {
        nextSteps: [
          'Your dispute has been received and will be reviewed by our finance team',
          'You will receive an email confirmation shortly',
          'Expected review time: 5-7 business days',
          'You can check the status of your dispute in your earnings dashboard',
        ],
        supportContact: process.env.SUPPORT_EMAIL || 'support@yesgoddess.com',
      },
    }, { status: 201 });

  } catch (error) {
    console.error('[CreatorRoyaltyAPI] Error creating dispute:', error);

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

    // Handle TRPCError from service
    if (error && typeof error === 'object' && 'code' in error) {
      const trpcError = error as any;
      const statusMap: Record<string, number> = {
        'NOT_FOUND': 404,
        'FORBIDDEN': 403,
        'BAD_REQUEST': 400,
      };

      return NextResponse.json(
        {
          success: false,
          error: trpcError.code,
          message: trpcError.message || 'An error occurred',
        },
        { status: statusMap[trpcError.code] || 500 }
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
