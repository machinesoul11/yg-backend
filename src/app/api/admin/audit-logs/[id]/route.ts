/**
 * Admin Audit Logs API - Get Specific Log Details
 * GET /api/admin/audit-logs/[id]
 * 
 * Retrieve complete details for a specific audit log entry
 * Includes related logs and integrity verification
 * Requires system:logs permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { AdminRoleService } from '@/lib/services/admin-role.service';
import { generateDiff } from '@/lib/utils/audit-diff';
import {
  canAccessLog,
  getPrimaryDepartment,
} from '@/lib/utils/audit-department-filter';
import { generateEntryHash } from '@/lib/services/audit-integrity.service';

const auditService = new AuditService(prisma);
const adminRoleService = new AdminRoleService(prisma, auditService);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET - Get specific audit log entry by ID
 * 
 * Returns:
 * - Complete log entry with formatted diff
 * - Related logs (same resource or action chain)
 * - Integrity verification status
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
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
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: system:logs' },
        { status: 403 }
      );
    }

    // Get log ID from params
    const params = await context.params;
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid log ID' },
        { status: 400 }
      );
    }

    // Fetch the audit log
    const log = await prisma.auditEvent.findUnique({
      where: { id },
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
    });

    if (!log) {
      return NextResponse.json(
        { error: 'Audit log not found' },
        { status: 404 }
      );
    }

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

    // Get primary department for access control
    const primaryDepartment = getPrimaryDepartment(adminRoles);

    if (!primaryDepartment) {
      return NextResponse.json(
        { error: 'No active admin role found' },
        { status: 403 }
      );
    }

    // Check if user has access to this specific log based on department
    const hasAccess = canAccessLog(primaryDepartment, {
      resourceType: log.resourceType,
      action: log.action,
      entityType: log.entityType,
    });

    if (!hasAccess) {
      // Log unauthorized access attempt
      await auditService.log({
        action: 'AUDIT_LOG_ACCESS_DENIED',
        entityType: 'audit_log',
        entityId: id,
        userId: session.user.id,
        email: session.user.email || undefined,
        metadata: {
          reason: 'Department access restriction',
          department: primaryDepartment,
          logResourceType: log.resourceType,
          logAction: log.action,
        },
      });

      return NextResponse.json(
        { error: 'Access denied: Log outside your department scope' },
        { status: 403 }
      );
    }

    // Generate diff if both states exist
    let diff = null;
    if (log.beforeState && log.afterState) {
      diff = generateDiff(log.beforeState, log.afterState);
    }

    // Verify log integrity
    let integrityStatus: {
      verified: boolean;
      storedHash: string | null;
      computedHash: string | null;
      match: boolean;
    } = {
      verified: false,
      storedHash: log.entryHash,
      computedHash: null,
      match: false,
    };

    if (log.entryHash) {
      try {
        // Recompute the hash
        const computedHash = generateEntryHash(
          {
            id: log.id,
            timestamp: log.timestamp,
            userId: log.userId,
            action: log.action,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
            entityType: log.entityType,
            entityId: log.entityId,
            ipAddress: log.ipAddress,
            metadata: log.metadata,
          },
          log.previousLogHash
        );

        integrityStatus.computedHash = computedHash;
        integrityStatus.match = computedHash === log.entryHash;
        integrityStatus.verified = integrityStatus.match;
      } catch (error) {
        console.error('[Audit Log API] Error verifying integrity:', error);
      }
    }

    // Find related logs
    const relatedLogsQuery: any[] = [];

    // Logs for the same resource
    if (log.resourceType && log.resourceId) {
      relatedLogsQuery.push({
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        id: { not: log.id }, // Exclude current log
      });
    }

    // Logs from the same session (within 5 minutes)
    if (log.sessionId) {
      const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
      const startTime = new Date(log.timestamp.getTime() - timeWindow);
      const endTime = new Date(log.timestamp.getTime() + timeWindow);

      relatedLogsQuery.push({
        sessionId: log.sessionId,
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
        id: { not: log.id },
      });
    }

    // Logs from the same request
    if (log.requestId) {
      relatedLogsQuery.push({
        requestId: log.requestId,
        id: { not: log.id },
      });
    }

    let relatedLogs: any[] = [];

    if (relatedLogsQuery.length > 0) {
      relatedLogs = await prisma.auditEvent.findMany({
        where: {
          OR: relatedLogsQuery,
          archived: false,
        },
        orderBy: { timestamp: 'desc' },
        take: 20, // Limit to 20 related logs
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Filter related logs by department access
      relatedLogs = relatedLogs.filter(relatedLog =>
        canAccessLog(primaryDepartment, {
          resourceType: relatedLog.resourceType,
          action: relatedLog.action,
          entityType: relatedLog.entityType,
        })
      );
    }

    // Format related logs (without full diff to reduce response size)
    const formattedRelatedLogs = relatedLogs.map(relatedLog => ({
      id: relatedLog.id,
      timestamp: relatedLog.timestamp,
      action: relatedLog.action,
      resourceType: relatedLog.resourceType,
      resourceId: relatedLog.resourceId,
      userId: relatedLog.userId,
      email: relatedLog.email,
      user: relatedLog.user,
      hasChanges: !!(relatedLog.beforeState && relatedLog.afterState),
    }));

    // Log the access
    await auditService.log({
      action: 'AUDIT_LOG_VIEWED',
      entityType: 'audit_log',
      entityId: id,
      userId: session.user.id,
      email: session.user.email || undefined,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      metadata: {
        logAction: log.action,
        logResourceType: log.resourceType,
        logTimestamp: log.timestamp,
        department: primaryDepartment,
      },
    });

    return NextResponse.json(
      {
        log: {
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
          previousLogHash: log.previousLogHash,
          entryHash: log.entryHash,
          archived: log.archived,
          archivedAt: log.archivedAt,
        },
        integrity: integrityStatus,
        relatedLogs: formattedRelatedLogs,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[Audit Log API] Error fetching log:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
