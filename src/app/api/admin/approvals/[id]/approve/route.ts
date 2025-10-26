/**
 * Admin API - Approve Approval Request
 * POST /api/admin/approvals/[id]/approve
 * 
 * Approve a pending approval request and execute the approved action
 * Requires senior status in relevant department
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { ApprovalStatus, Department } from '@prisma/client';
import { canApprove, REQUIRES_SENIOR_APPROVAL } from '@/permissions/approvalRules';
import { AuditService } from '@/lib/services/audit.service';
import { ApprovalRequestService } from '@/lib/services/approval-request.service';
import { NotificationService } from '@/modules/system/services/notification.service';

const auditService = new AuditService(prisma);
const notificationService = new NotificationService(prisma, redis);
const approvalService = new ApprovalRequestService(
  prisma,
  auditService,
  notificationService
);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST - Approve an approval request
 * 
 * Request body:
 * - comment: string (optional) - Approval comment
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params
    const params = await context.params;
    const { id } = params;

    // Validate ID parameter
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid approval request ID' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { comment } = body;

    // Validate comment if provided
    let approvalComment: string | undefined = undefined;
    if (comment) {
      if (typeof comment !== 'string') {
        return NextResponse.json(
          { error: 'Comment must be a string' },
          { status: 400 }
        );
      }
      approvalComment = comment.trim().substring(0, 1000); // Limit to 1000 chars
    }

    // Get user's admin roles for authorization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        adminRoles: {
          where: { 
            isActive: true,
            deletedAt: null,
          },
          select: {
            department: true,
            seniority: true,
            isActive: true,
          },
        },
      },
    }) as any;

    if (!user || !user.adminRoles || user.adminRoles.length === 0) {
      return NextResponse.json(
        { error: 'User does not have active admin roles' },
        { status: 403 }
      );
    }

    // Fetch the approval request
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
    });

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      );
    }

    // Check if already reviewed
    if (approvalRequest.status !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        { 
          error: `Approval request has already been ${approvalRequest.status.toLowerCase()}`,
          currentStatus: approvalRequest.status,
        },
        { status: 400 }
      );
    }

    // Prevent self-approval
    if (approvalRequest.requestedBy === user.id) {
      return NextResponse.json(
        { error: 'Cannot approve your own request' },
        { status: 403 }
      );
    }

    // Check if user has authority to approve this request
    const hasAuthority = await canApprove(
      { id: user.id, adminRoles: user.adminRoles },
      approvalRequest
    );

    if (!hasAuthority) {
      const requirement = REQUIRES_SENIOR_APPROVAL[approvalRequest.actionType];
      return NextResponse.json(
        {
          error: 'Insufficient authority to approve this request',
          reason: requirement
            ? `Requires senior status in: ${requirement.requiresSeniorRole.join(', ')}`
            : 'Unknown action type',
        },
        { status: 403 }
      );
    }

    // Get request context
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Execute approval in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update approval request status
      const updatedRequest = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.APPROVED,
          reviewedBy: user.id,
          reviewedAt: new Date(),
          reviewComments: approvalComment,
        },
      });

      // Create audit log for approval decision
      await auditService.log({
        action: 'APPROVAL_REQUEST_APPROVED',
        entityType: 'approval_request',
        entityId: updatedRequest.id,
        userId: user.id,
        resourceType: 'APPROVAL_REQUEST',
        resourceId: updatedRequest.id,
        ipAddress,
        userAgent,
        before: {
          status: ApprovalStatus.PENDING,
        },
        after: {
          status: ApprovalStatus.APPROVED,
          reviewedBy: user.id,
          reviewedAt: updatedRequest.reviewedAt,
        },
        metadata: {
          actionType: updatedRequest.actionType,
          department: updatedRequest.department,
          requestedBy: updatedRequest.requestedBy,
          comments: approvalComment,
        },
      });

      return updatedRequest;
    });

    // Execute the approved action (outside transaction to avoid long-running tx)
    let executionResult: any = null;
    let executionError: string | undefined = undefined;

    try {
      // Use the approval service to execute the action
      const reviewResult = await approvalService.reviewApprovalRequest({
        approvalRequestId: id,
        reviewerId: user.id,
        decision: 'APPROVED',
        comments: approvalComment,
        context: {
          ipAddress,
          userAgent,
          timestamp: new Date(),
        },
      });

      executionResult = reviewResult.executionResult;
    } catch (error) {
      console.error('[Approval Execution] Error executing approved action:', error);
      executionError = error instanceof Error ? error.message : 'Unknown error';

      // Log execution failure
      await auditService.log({
        action: 'APPROVED_ACTION_EXECUTION_FAILED',
        entityType: 'approval_request',
        entityId: result.id,
        userId: user.id,
        resourceType: 'APPROVAL_REQUEST',
        resourceId: result.id,
        ipAddress,
        userAgent,
        metadata: {
          actionType: result.actionType,
          error: executionError,
          dataPayload: result.dataPayload,
        },
      });
    }

    // Build response
    const response: any = {
      success: true,
      message: 'Approval request approved successfully',
      data: {
        approvalRequest: {
          id: result.id,
          actionType: result.actionType,
          status: result.status,
          reviewedBy: result.reviewedBy,
          reviewedAt: result.reviewedAt,
          reviewComments: result.reviewComments,
        },
        executionStatus: executionError ? 'failed' : 'success',
      },
    };

    if (executionResult) {
      response.data.executionResult = executionResult;
    }

    if (executionError) {
      response.data.executionError = executionError;
      response.message = 'Approval granted but action execution failed';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Admin Approval Approve API] Error:', error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Approval request not found' },
          { status: 404 }
        );
      }
      if (error.message.includes('authority') || error.message.includes('permission')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
