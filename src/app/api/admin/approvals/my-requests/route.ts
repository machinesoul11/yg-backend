/**
 * Admin API - My Approval Requests
 * GET /api/admin/approvals/my-requests
 * 
 * Returns approval requests submitted by the authenticated admin
 * Shows submission status, reviewer info, and allows viewing request details
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ApprovalStatus } from '@prisma/client';

/**
 * GET - List current admin's submitted approval requests
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: ApprovalStatus (optional filter: PENDING, APPROVED, REJECTED)
 * - sortBy: string (default: createdAt)
 * - sortOrder: 'asc' | 'desc' (default: desc)
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get authenticated user's ID - this is the only user whose requests we'll show
    const userId = session.user.id;

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const statusFilter = searchParams.get('status') as ApprovalStatus | null;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Validate sortBy against allowlist to prevent injection
    const allowedSortFields = ['createdAt', 'actionType', 'department', 'status', 'reviewedAt'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    // Build where clause - always filter to current user's requests
    const whereClause: any = {
      requestedBy: userId,
    };

    // Apply status filter if provided
    if (statusFilter) {
      // Validate status is a valid enum value
      if (Object.values(ApprovalStatus).includes(statusFilter)) {
        whereClause.status = statusFilter;
      } else {
        return NextResponse.json(
          { error: 'Invalid status filter. Must be PENDING, APPROVED, or REJECTED' },
          { status: 400 }
        );
      }
    }

    // Calculate pagination
    const skip = (page - 1) * pageSize;

    // Fetch approval requests and total count in parallel
    const [approvalRequests, totalCount] = await Promise.all([
      prisma.approvalRequest.findMany({
        where: whereClause,
        orderBy: {
          [validSortBy]: sortOrder,
        },
        skip,
        take: pageSize,
        select: {
          id: true,
          actionType: true,
          department: true,
          status: true,
          dataPayload: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: true,
          reviewComments: true,
          metadata: true,
        },
      }),
      prisma.approvalRequest.count({
        where: whereClause,
      }),
    ]);

    // Get reviewer information for reviewed requests
    const reviewerIds = approvalRequests
      .filter(r => r.reviewedBy)
      .map(r => r.reviewedBy!)
      .filter((id, index, self) => self.indexOf(id) === index); // unique IDs

    const reviewers = reviewerIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: reviewerIds,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [];

    // Get admin roles for reviewers
    const reviewerRoles = reviewerIds.length > 0
      ? await prisma.adminRole.findMany({
          where: {
            userId: {
              in: reviewerIds,
            },
            isActive: true,
          },
          select: {
            userId: true,
            department: true,
            seniority: true,
          },
        })
      : [];

    // Map roles to reviewers
    const reviewerRolesMap = new Map<string, any[]>();
    reviewerRoles.forEach(role => {
      const roles = reviewerRolesMap.get(role.userId) || [];
      roles.push(role);
      reviewerRolesMap.set(role.userId, roles);
    });

    const reviewerMap = new Map(reviewers.map((r: any) => {
      const roles = reviewerRolesMap.get(r.id) || [];
      return [r.id, { ...r, adminRoles: roles }];
    }));

    // Format response data with enhanced information
    const data = approvalRequests.map(request => {
      const reviewer: any = request.reviewedBy ? reviewerMap.get(request.reviewedBy) : null;
      const metadata = request.metadata as any;

      // Format the request with all relevant information
      return {
        id: request.id,
        actionType: request.actionType,
        actionTypeFormatted: formatActionType(request.actionType),
        department: request.department,
        status: request.status,
        
        // Submission information
        submittedAt: request.createdAt,
        
        // Review information (if reviewed)
        reviewedAt: request.reviewedAt,
        reviewedBy: reviewer ? {
          id: reviewer.id,
          name: reviewer.name,
          email: reviewer.email,
          departments: reviewer.adminRoles?.map((r: any) => r.department) || [],
          seniority: reviewer.adminRoles?.[0]?.seniority || null,
        } : null,
        reviewComments: request.reviewComments,
        
        // Additional context from metadata
        reason: metadata?.reason || null,
        requiresSeniorRole: metadata?.requiresSeniorRole || [],
        
        // Request summary for display
        summary: generateRequestSummary(request),
        
        // Status indicators
        isPending: request.status === ApprovalStatus.PENDING,
        isApproved: request.status === ApprovalStatus.APPROVED,
        isRejected: request.status === ApprovalStatus.REJECTED,
        canCancel: request.status === ApprovalStatus.PENDING, // Only pending requests can be cancelled
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);

    // Calculate status counts for UI
    const statusCounts = await prisma.approvalRequest.groupBy({
      by: ['status'],
      where: {
        requestedBy: userId,
      },
      _count: {
        status: true,
      },
    });

    const statusSummary = {
      pending: statusCounts.find(s => s.status === ApprovalStatus.PENDING)?._count.status || 0,
      approved: statusCounts.find(s => s.status === ApprovalStatus.APPROVED)?._count.status || 0,
      rejected: statusCounts.find(s => s.status === ApprovalStatus.REJECTED)?._count.status || 0,
      total: totalCount,
    };

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        status: statusFilter,
      },
      statusSummary,
    });
  } catch (error) {
    console.error('[Admin My Requests] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while fetching your requests',
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

/**
 * Generate human-readable summary for request
 */
function generateRequestSummary(request: any): string {
  const metadata = request.metadata as any;
  const actionTypeFormatted = formatActionType(request.actionType);
  
  // Try to extract meaningful information from dataPayload
  const payload = request.dataPayload as any;
  
  if (payload) {
    // Try to find identifiable information
    const targetId = payload.userId || payload.id || payload.targetId;
    const targetName = payload.name || payload.userName || payload.targetName;
    const amount = payload.amount || payload.amountCents;
    
    if (targetName) {
      return `${actionTypeFormatted} - ${targetName}`;
    } else if (targetId) {
      return `${actionTypeFormatted} - ID: ${targetId}`;
    } else if (amount) {
      const formattedAmount = typeof amount === 'number' 
        ? `$${(amount / 100).toFixed(2)}` 
        : amount;
      return `${actionTypeFormatted} - Amount: ${formattedAmount}`;
    }
  }
  
  // Fallback to reason from metadata or just the action type
  return metadata?.reason || actionTypeFormatted;
}
