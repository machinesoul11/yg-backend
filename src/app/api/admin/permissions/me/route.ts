/**
 * Get Current User's Permissions
 * GET /api/admin/permissions/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { PermissionService } from '@/lib/services/permission.service';

const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get user's permissions
    const permissions = await permissionService.getUserPermissions(userId);

    // Get user's role
    const role = await permissionService.getUserRole(userId);

    // Get admin roles if applicable
    const adminRoles = role === 'ADMIN' 
      ? await prisma.adminRole.findMany({
          where: {
            userId,
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
          select: {
            id: true,
            department: true,
            seniority: true,
            createdAt: true,
            expiresAt: true,
          },
        })
      : [];

    return NextResponse.json({
      success: true,
      data: {
        userId,
        role,
        permissions,
        adminRoles,
      },
    });
  } catch (error) {
    console.error('[Admin Permissions ME] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
