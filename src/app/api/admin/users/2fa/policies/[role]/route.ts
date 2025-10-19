/**
 * Admin 2FA Management - Get Policy by Role
 * GET /api/admin/users/2fa/policies/[role]
 * 
 * Retrieves 2FA policy for a specific role
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Admin2FAManagementService } from '@/lib/services/admin-2fa-management.service';
import { AuditService } from '@/lib/services/audit.service';
import { UserRole } from '@prisma/client';

const auditService = new AuditService(prisma);
const admin2FAService = new Admin2FAManagementService(prisma, auditService);

export async function GET(
  req: NextRequest,
  { params }: { params: { role: string } }
) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = params.role as UserRole;

    if (!role) {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      );
    }

    const policy = await admin2FAService.get2FAPolicy(role);

    if (!policy) {
      return NextResponse.json({
        success: true,
        data: null,
        message: `No 2FA policy set for ${role} role`,
      });
    }

    return NextResponse.json({
      success: true,
      data: policy,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Admin 2FA API] Error fetching policy:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
