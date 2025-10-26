/**
 * Admin API - Reject Approval Request
 * POST /api/admin/approvals/[id]/reject
 * 
 * Reject a pending approval request with mandatory rejection comment
 * Requires senior status in relevant department
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { ApprovalStatus, Department, NotificationType, NotificationPriority } from '@prisma/client';
import { canApprove, REQUIRES_SENIOR_APPROVAL } from '@/permissions/approvalRules';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { emailService } from '@/lib/services/email';

const auditService = new AuditService(prisma);
const notificationService = new NotificationService(prisma, redis);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST - Reject an approval request
 * 
 * Request body:
 * - comment: string (required) - Rejection reason/comment (minimum 10 chars)
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

    // Validate rejection comment (REQUIRED)
    if (!comment || typeof comment !== 'string') {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: {
            comment: 'Rejection comment is required'
          }
        },
        { status: 422 }
      );
    }

    const rejectionComment = comment.trim();

    // Enforce minimum comment length (must be substantive)
    if (rejectionComment.length < 10) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: {
            comment: 'Rejection comment must be at least 10 characters'
          }
        },
        { status: 422 }
      );
    }

    // Enforce maximum comment length
    if (rejectionComment.length > 1000) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: {
            comment: 'Rejection comment must not exceed 1000 characters'
          }
        },
        { status: 422 }
      );
    }

    // Get user's admin roles for authorization
    const user: any = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // Get admin roles separately
    const adminRoles: any = await prisma.adminRole.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      select: {
        department: true,
        seniority: true,
        isActive: true,
      },
    });

    user.adminRoles = adminRoles;

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

    // Get requester information
    const requester = await prisma.user.findUnique({
      where: { id: approvalRequest.requestedBy },
      select: {
        id: true,
        email: true,
        name: true,
      }
    });

    // Check if already reviewed
    if (approvalRequest.status !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        { 
          error: `Approval request has already been ${approvalRequest.status.toLowerCase()}`,
          currentStatus: approvalRequest.status,
        },
        { status: 409 }
      );
    }

    // Prevent self-rejection (admins cannot reject their own requests)
    if (approvalRequest.requestedBy === user.id) {
      return NextResponse.json(
        { error: 'Cannot reject your own request' },
        { status: 403 }
      );
    }

    // Check if user has authority to reject this request
    // Senior status required
    const hasAuthority = await canApprove(
      { id: user.id, adminRoles: user.adminRoles },
      approvalRequest
    );

    if (!hasAuthority) {
      const requirement = REQUIRES_SENIOR_APPROVAL[approvalRequest.actionType];
      return NextResponse.json(
        {
          error: 'Insufficient authority to reject this request',
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

    // Execute rejection in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update approval request status
      const updatedRequest = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.REJECTED,
          reviewedBy: user.id,
          reviewedAt: new Date(),
          reviewComments: rejectionComment,
        },
      });

      // Create audit log for rejection decision
      await auditService.log({
        action: 'APPROVAL_REQUEST_REJECTED',
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
          status: ApprovalStatus.REJECTED,
          reviewedBy: user.id,
          reviewedAt: updatedRequest.reviewedAt,
          reviewComments: rejectionComment,
        },
        metadata: {
          actionType: updatedRequest.actionType,
          department: updatedRequest.department,
          requestedBy: updatedRequest.requestedBy,
          rejectionReason: rejectionComment,
        },
      });

      return updatedRequest;
    });

    // Send notification to requester (non-blocking)
    try {
      await notificationService.create({
        userId: result.requestedBy,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.HIGH,
        title: 'Approval Request Rejected',
        message: `Your request for ${formatActionType(result.actionType)} has been rejected. Reason: ${rejectionComment}`,
        actionUrl: `/admin/approvals/${result.id}`,
        metadata: {
          approvalRequestId: result.id,
          actionType: result.actionType,
          reviewedBy: user.id,
          reviewerName: user.name || user.email,
          rejectionReason: rejectionComment,
        },
      });
    } catch (notificationError) {
      console.error('[Admin Approvals Reject] Failed to send notification:', notificationError);
      // Continue - notification failure shouldn't block rejection
    }

    // Send email notification (non-blocking)
    try {
      if (requester?.email) {
        const reviewerName = user.name || user.email;
        const actionTypeFormatted = formatActionType(result.actionType);
        
        // TODO: Implement with email service
        console.log(`[Admin Approvals Reject] Would send email to ${requester.email} about rejection`);
      }
    } catch (emailError) {
      console.error('[Admin Approvals Reject] Failed to send email:', emailError);
      // Continue - email failure shouldn't block rejection
    }

    // Format response
    const response = {
      success: true,
      message: 'Approval request rejected successfully',
      data: {
        id: result.id,
        status: result.status,
        actionType: result.actionType,
        department: result.department,
        requestedBy: result.requestedBy,
        reviewedBy: result.reviewedBy,
        reviewedAt: result.reviewedAt,
        reviewComments: result.reviewComments,
        requester: requester ? {
          id: requester.id,
          name: requester.name,
          email: requester.email,
        } : null,
        reviewer: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[Admin Approvals Reject] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while rejecting the approval request',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Format action type for display
 */
function formatActionType(actionType: string): string {
  // Convert permission string to readable format
  // e.g., "users:delete_user" -> "User Deletion"
  return actionType
    .replace(/^.*:/, '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
