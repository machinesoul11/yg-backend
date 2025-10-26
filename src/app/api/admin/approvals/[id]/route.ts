/**
 * Admin API - Approval Request Details
 * GET /api/admin/approvals/[id]
 * 
 * Returns detailed information about a specific approval request
 * Includes action details, requester info, and approval history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Department, ApprovalStatus, NotificationType, NotificationPriority } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { redis } from '@/lib/redis';

const auditService = new AuditService(prisma);
const notificationService = new NotificationService(prisma, redis);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET - Get specific approval request details
 */
export async function GET(
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

    // Get user's admin roles for authorization
    const user: any = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        // @ts-ignore - adminRoles relation exists in schema
        adminRoles: true,
      },
    });

    // Filter to active roles
    user.adminRoles = user?.adminRoles?.filter((r: any) => r.isActive) || [];

    if (!user || !user.adminRoles || user.adminRoles.length === 0) {
      return NextResponse.json(
        { error: 'User does not have active admin roles' },
        { status: 403 }
      );
    }

    // Fetch the approval request
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        id: true,
        actionType: true,
        requestedBy: true,
        department: true,
        dataPayload: true,
        status: true,
        reviewedBy: true,
        reviewedAt: true,
        reviewComments: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      );
    }

    // Check authorization - verify user can access this department's approvals
    const isSuperAdmin = user.adminRoles.some(
      (role: any) => role.department === Department.SUPER_ADMIN
    );
    const userDepartments = user.adminRoles.map((role: any) => role.department);

    if (!isSuperAdmin && !userDepartments.includes(approvalRequest.department)) {
      return NextResponse.json(
        { error: 'Not authorized to view this approval request' },
        { status: 403 }
      );
    }

    // Fetch requester information
    const requester: any = await prisma.user.findUnique({
      where: { id: approvalRequest.requestedBy },
      include: {
        // @ts-ignore - adminRoles relation exists in schema
        adminRoles: true,
      },
    });
    
    if (requester) {
      requester.adminRoles = requester.adminRoles?.filter((r: any) => r.isActive) || [];
    }

    // Fetch reviewer information if reviewed
    let reviewer: any = null;
    if (approvalRequest.reviewedBy) {
      reviewer = await prisma.user.findUnique({
        where: { id: approvalRequest.reviewedBy },
        include: {
          // @ts-ignore - adminRoles relation exists in schema
          adminRoles: true,
        },
      });
      
      if (reviewer) {
        reviewer.adminRoles = reviewer.adminRoles?.filter((r: any) => r.isActive) || [];
      }
    }

    // Extract metadata
    const metadata = approvalRequest.metadata as any;
    const dataPayload = approvalRequest.dataPayload as any;

    // Generate before/after preview based on action type
    const preview = await generatePreview(
      approvalRequest.actionType,
      dataPayload
    );

    // Build approval history
    const approvalHistory = [];
    if (approvalRequest.status !== ApprovalStatus.PENDING) {
      approvalHistory.push({
        action: approvalRequest.status === ApprovalStatus.APPROVED ? 'approved' : 'rejected',
        performedBy: reviewer
          ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email,
            }
          : null,
        performedAt: approvalRequest.reviewedAt,
        comments: approvalRequest.reviewComments,
      });
    }

    // Format response
    const response = {
      success: true,
      data: {
        id: approvalRequest.id,
        actionType: approvalRequest.actionType,
        department: approvalRequest.department,
        status: approvalRequest.status,
        createdAt: approvalRequest.createdAt,
        
        requester: requester
          ? {
              id: requester.id,
              name: requester.name,
              email: requester.email,
              role: requester.role,
              departments: requester.adminRoles.map((r: any) => r.department),
            }
          : null,

        dataPayload,
        
        preview,

        reason: metadata?.reason || 'Approval required for this action',

        approvalHistory,

        reviewedBy: reviewer
          ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email,
              departments: reviewer.adminRoles.map((r: any) => r.department),
            }
          : null,
        reviewedAt: approvalRequest.reviewedAt,
        reviewComments: approvalRequest.reviewComments,

        requestContext: metadata?.requestContext || null,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Admin Approval Details API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate before/after preview for approval request
 * Shows current state vs proposed state
 */
async function generatePreview(
  actionType: string,
  dataPayload: any
): Promise<{ before: any; after: any } | null> {
  try {
    switch (actionType) {
      case 'users:delete':
      case 'users:delete_user':
        if (dataPayload.userId) {
          const user = await prisma.user.findUnique({
            where: { id: dataPayload.userId },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              deleted_at: true,
            },
          });

          if (user) {
            return {
              before: {
                status: user.deleted_at ? 'Deleted' : 'Active',
                user: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: user.role,
                },
              },
              after: {
                status: 'Deleted',
                user: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: user.role,
                },
              },
            };
          }
        }
        break;

      case 'finance:initiate_payouts':
        return {
          before: {
            payoutStatus: 'Pending Approval',
            amount: dataPayload.amountCents
              ? `$${(dataPayload.amountCents / 100).toFixed(2)}`
              : 'Unknown',
          },
          after: {
            payoutStatus: 'Approved - Ready for Processing',
            amount: dataPayload.amountCents
              ? `$${(dataPayload.amountCents / 100).toFixed(2)}`
              : 'Unknown',
          },
        };

      case 'licensing:terminate':
        if (dataPayload.licenseId) {
          const license = await prisma.license.findUnique({
            where: { id: dataPayload.licenseId },
            select: {
              id: true,
              status: true,
              licenseType: true,
            },
          });

          if (license) {
            return {
              before: {
                licenseStatus: license.status,
                licenseType: license.licenseType,
              },
              after: {
                licenseStatus: 'TERMINATED',
                licenseType: license.licenseType,
              },
            };
          }
        }
        break;

      default:
        // For unknown action types, return generic preview
        return {
          before: { status: 'Current State' },
          after: { status: 'After Approval', changes: dataPayload },
        };
    }

    return null;
  } catch (error) {
    console.error('[Preview Generation] Error:', error);
    return null;
  }
}

/**
 * DELETE - Cancel a pending approval request
 * 
 * Only the requester can cancel their own pending requests
 * Requests that have been approved or rejected cannot be cancelled
 */
export async function DELETE(
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

    const userId = session.user.id;

    // Fetch the approval request
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        id: true,
        actionType: true,
        requestedBy: true,
        department: true,
        status: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      );
    }

    // Verify that the current user is the requester
    if (approvalRequest.requestedBy !== userId) {
      return NextResponse.json(
        { error: 'You can only cancel your own approval requests' },
        { status: 403 }
      );
    }

    // Verify the request is in pending status
    if (approvalRequest.status !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        {
          error: `Cannot cancel ${approvalRequest.status.toLowerCase()} request`,
          message: 'Only pending requests can be cancelled',
          currentStatus: approvalRequest.status,
        },
        { status: 409 }
      );
    }

    // Get request context
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Update the approval request status to CANCELLED
    // Note: We're using REJECTED with special metadata to indicate cancellation
    // If you have a CANCELLED status in your schema, use that instead
    const result = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.REJECTED, // Using REJECTED for cancelled status
          reviewedBy: userId, // Self-reviewed (cancelled)
          reviewedAt: new Date(),
          reviewComments: 'Request cancelled by requester',
          metadata: {
            ...(approvalRequest.metadata as any || {}),
            cancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelledBy: userId,
          },
        },
      });

      // Create audit log for cancellation
      await auditService.log({
        action: 'APPROVAL_REQUEST_CANCELLED',
        entityType: 'approval_request',
        entityId: updatedRequest.id,
        userId,
        resourceType: 'APPROVAL_REQUEST',
        resourceId: updatedRequest.id,
        ipAddress,
        userAgent,
        before: {
          status: ApprovalStatus.PENDING,
        },
        after: {
          status: ApprovalStatus.REJECTED,
          cancelled: true,
        },
        metadata: {
          actionType: updatedRequest.actionType,
          department: updatedRequest.department,
          cancelledBy: userId,
        },
      });

      return updatedRequest;
    });

    // Optionally notify senior admins that the request was cancelled (non-blocking)
    try {
      // Get senior admins who might have been reviewing this
      const seniorAdmins: any = await prisma.user.findMany({
        where: {
          id: {
            not: userId,
          },
          deleted_at: null,
        },
        include: {
          // @ts-ignore - adminRoles relation exists in schema
          adminRoles: true,
        },
      });

      // Filter to users who have SENIOR role in relevant department
      const validSeniorAdmins = seniorAdmins.filter((admin: any) => 
        admin.adminRoles.some((role: any) => 
          role.isActive && 
          role.department === approvalRequest.department && 
          role.seniority === 'SENIOR'
        )
      );

      if (validSeniorAdmins.length > 0) {
        await notificationService.create({
          userIds: validSeniorAdmins.map((admin: any) => admin.id),
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.LOW,
          title: 'Approval Request Cancelled',
          message: `An approval request for ${formatActionType(approvalRequest.actionType)} has been cancelled by the requester`,
          metadata: {
            approvalRequestId: result.id,
            actionType: approvalRequest.actionType,
            cancelledBy: userId,
          },
        });
      }
    } catch (notificationError) {
      console.error('[Admin Approvals Cancel] Failed to send notifications:', notificationError);
      // Continue - notification failure shouldn't block cancellation
    }

    return NextResponse.json({
      success: true,
      message: 'Approval request cancelled successfully',
      data: {
        id: result.id,
        status: 'CANCELLED',
        actionType: result.actionType,
        department: result.department,
      },
    });
  } catch (error) {
    console.error('[Admin Approvals Cancel] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while cancelling the approval request',
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
