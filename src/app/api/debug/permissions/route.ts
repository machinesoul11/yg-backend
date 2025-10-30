/**
 * Debug Permissions Endpoint
 * Returns full permission details for debugging access issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { permissionService } from '@/lib/permissions';
import { userIsSuperAdmin, getUserDepartments } from '@/lib/utils/admin-role.utils';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get all permission-related data
    const [
      userRole,
      userPermissions,
      isSuperAdmin,
      departments,
      adminRoles,
      user
    ] = await Promise.all([
      permissionService.getUserRole(userId),
      permissionService.getUserPermissions(userId),
      userIsSuperAdmin(userId),
      getUserDepartments(userId),
      prisma.adminRole.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
          department: true,
          seniority: true,
          isActive: true,
          expiresAt: true,
          permissions: true,
          createdAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      debug: {
        session: {
          user: session.user,
        },
        user,
        userRole,
        isSuperAdmin,
        departments,
        totalPermissions: userPermissions.length,
        permissions: userPermissions,
        adminRoles: adminRoles.map(role => ({
          ...role,
          isExpired: role.expiresAt ? role.expiresAt < new Date() : false,
          permissionCount: Array.isArray(role.permissions) ? role.permissions.length : 0,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Debug Permissions] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
