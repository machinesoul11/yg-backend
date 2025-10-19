/**
 * Admin 2FA Management - Non-Compliant Users
 * GET /api/admin/users/2fa/non-compliant
 * 
 * Retrieves users who haven't enabled 2FA but are required to
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

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') as UserRole | null;

    const nonCompliantUsers = await admin2FAService.getNonCompliantUsers(
      role || undefined
    );

    return NextResponse.json({
      success: true,
      data: nonCompliantUsers,
      total: nonCompliantUsers.length,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Admin 2FA API] Error fetching non-compliant users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
