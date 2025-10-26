/**
 * Admin API - Approval Requests List
 * GET /api/admin/approvals
 * 
 * Returns paginated list of approval requests with filtering and sorting
 * Admin-only endpoint with department-based auto-filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ApprovalStatus, Department, Seniority } from '@prisma/client';
import { canApprove } from '@/permissions/approvalRules';

/**
 * GET - List pending approval requests
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - department: Department (optional filter)
 * - status: ApprovalStatus (default: PENDING)
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

    // Get user's admin roles to determine department filtering
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
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

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const departmentFilter = searchParams.get('department') as Department | null;
    const statusFilter = (searchParams.get('status') as ApprovalStatus) || ApprovalStatus.PENDING;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Validate sortBy against allowlist to prevent injection
    const allowedSortFields = ['createdAt', 'actionType', 'department', 'status'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    // Determine department scope for filtering
    // Super admins can see all departments, others only their own
    const isSuperAdmin = user.adminRoles.some(
      (role: any) => role.department === Department.SUPER_ADMIN
    );

    const userDepartments = user.adminRoles.map((role: any) => role.department);

    // Build where clause
    const whereClause: any = {
      status: statusFilter,
      // Exclude self-requested approvals
      requestedBy: {
        not: user.id,
      },
    };

    // Apply department filtering
    if (departmentFilter) {
      // If specific department requested, verify user has access to it
      if (!isSuperAdmin && !userDepartments.includes(departmentFilter)) {
        return NextResponse.json(
          { error: 'Not authorized to view approvals for this department' },
          { status: 403 }
        );
      }
      whereClause.department = departmentFilter;
    } else if (!isSuperAdmin) {
      // Non-super admins: filter to only their departments
      whereClause.department = {
        in: userDepartments,
      };
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
          requestedBy: true,
          department: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: true,
          metadata: true,
        },
      }),
      prisma.approvalRequest.count({
        where: whereClause,
      }),
    ]);

    // Enrich with requester information
    const requesterIds = [...new Set(approvalRequests.map(r => r.requestedBy))];
    const requesters = await prisma.user.findMany({
      where: {
        id: {
          in: requesterIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        adminRoles: {
          where: { isActive: true, deletedAt: null },
          select: {
            department: true,
          },
        },
      },
    }) as any;

    const requesterMap = new Map(requesters.map((r: any) => [r.id, r]));

    // Format response data with requester context
    const data = approvalRequests.map(request => {
      const requester: any = requesterMap.get(request.requestedBy);
      const metadata = request.metadata as any;

      return {
        id: request.id,
        actionType: request.actionType,
        department: request.department,
        status: request.status,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt,
        reviewedBy: request.reviewedBy,
        requester: requester
          ? {
              id: requester.id,
              name: requester.name,
              email: requester.email,
              departments: requester.adminRoles.map((r: any) => r.department),
            }
          : null,
        summary: metadata?.reason || 'Approval request',
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);

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
        department: departmentFilter,
        status: statusFilter,
      },
    });
  } catch (error) {
    console.error('[Admin Approvals API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
