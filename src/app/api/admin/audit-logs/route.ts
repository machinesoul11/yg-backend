/**
 * Admin Audit Logs API - Search Audit Logs
 * GET /api/admin/audit-logs
 * 
 * Search and filter audit logs with department-scoped access control
 * Requires system:logs permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { AdminRoleService } from '@/lib/services/admin-role.service';
import { ResourceType } from '@prisma/client';
import { generateDiff } from '@/lib/utils/audit-diff';
import {
  getDepartmentScopedWhere,
  getPrimaryDepartment,
} from '@/lib/utils/audit-department-filter';

const auditService = new AuditService(prisma);
const adminRoleService = new AdminRoleService(prisma, auditService);

/**
 * GET - Search audit logs with filtering and pagination
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 100)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - userId: string
 * - action: string or comma-separated actions
 * - resourceType: ResourceType or comma-separated types
 * - resourceId: string
 * - search: string (searches email and action)
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has system:logs permission
    const hasPermission = await adminRoleService.userHasPermission(
      session.user.id,
      'system:logs'
    );

    if (!hasPermission) {
      // Log unauthorized access attempt
      await auditService.log({
        action: 'AUDIT_LOGS_ACCESS_DENIED',
        entityType: 'audit_log',
        entityId: 'search',
        userId: session.user.id,
        email: session.user.email || undefined,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        metadata: {
          reason: 'Missing system:logs permission',
        },
      });

      return NextResponse.json(
        { error: 'Insufficient permissions. Required: system:logs' },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    
    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    
    // Date range filtering
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : undefined;
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : undefined;
    
    // Validate dates
    if (startDate && isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startDate format' },
        { status: 400 }
      );
    }
    if (endDate && isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid endDate format' },
        { status: 400 }
      );
    }
    
    // User filtering
    const userId = searchParams.get('userId') || undefined;
    
    // Action filtering (support multiple)
    const actionParam = searchParams.get('action');
    const action = actionParam ? actionParam.split(',').map(a => a.trim()) : undefined;
    
    // Resource type filtering (support multiple)
    const resourceTypeParam = searchParams.get('resourceType');
    const resourceType = resourceTypeParam 
      ? resourceTypeParam.split(',').map(rt => rt.trim() as ResourceType)
      : undefined;
    
    // Resource ID filtering
    const resourceId = searchParams.get('resourceId') || undefined;
    
    // Search filtering (email or action)
    const search = searchParams.get('search') || undefined;

    // Get user's admin roles to determine department access
    const adminRoles = await prisma.adminRole.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        deletedAt: null,
      },
      select: {
        department: true,
        isActive: true,
      },
    });

    // Get primary department for filtering
    const primaryDepartment = getPrimaryDepartment(adminRoles);

    // Build where clause with department scoping
    const where: any = {};

    // Apply department-based filtering for non-Super Admins
    if (primaryDepartment) {
      const departmentWhere = getDepartmentScopedWhere(primaryDepartment);
      Object.assign(where, departmentWhere);
    } else {
      // User has no admin roles, deny access
      return NextResponse.json(
        { error: 'No active admin role found' },
        { status: 403 }
      );
    }

    // Apply user filters
    if (userId) {
      where.userId = userId;
    }

    if (action) {
      if (action.length === 1) {
        where.action = action[0];
      } else {
        where.action = { in: action };
      }
    }

    if (resourceType) {
      if (resourceType.length === 1) {
        where.resourceType = resourceType[0];
      } else {
        where.resourceType = { in: resourceType };
      }
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    if (search) {
      where.OR = [
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          action: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Date range filtering
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Exclude archived logs by default
    where.archived = false;

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Execute queries in parallel
    const [logs, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditEvent.count({ where }),
    ]);

    // Format logs with diffs
    const formattedLogs = logs.map(log => {
      // Generate diff if both before and after states exist
      let diff = null;
      if (log.beforeState && log.afterState) {
        diff = generateDiff(log.beforeState, log.afterState);
      }

      return {
        id: log.id,
        timestamp: log.timestamp,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        email: log.email,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        sessionId: log.sessionId,
        requestId: log.requestId,
        permission: log.permission,
        beforeState: log.beforeState,
        afterState: log.afterState,
        diff,
        metadata: log.metadata,
        user: log.user,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);

    // Log the audit log access
    await auditService.log({
      action: 'AUDIT_LOGS_ACCESSED',
      entityType: 'audit_log',
      entityId: 'search',
      userId: session.user.id,
      email: session.user.email || undefined,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      metadata: {
        filters: {
          page,
          limit,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          userId,
          action,
          resourceType,
          resourceId,
          search,
        },
        resultsCount: logs.length,
        department: primaryDepartment,
      },
    });

    return NextResponse.json(
      {
        logs: formattedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[Audit Logs API] Error searching logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
