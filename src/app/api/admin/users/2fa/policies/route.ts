/**
 * Admin 2FA Management - 2FA Policies
 * GET  /api/admin/users/2fa/policies      - Get all policies
 * POST /api/admin/users/2fa/policies      - Create/update policy
 * 
 * Manages 2FA policies for roles
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Admin2FAManagementService } from '@/lib/services/admin-2fa-management.service';
import { AuditService } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);
const admin2FAService = new Admin2FAManagementService(prisma, auditService);

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const policies = await admin2FAService.getAll2FAPolicies();

    return NextResponse.json({
      success: true,
      data: policies,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Admin 2FA API] Error fetching policies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      role,
      enforcementType,
      gracePeriodDays,
      enforcementStartDate,
      allowedMethods,
    } = body;

    // Validation
    if (!role) {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      );
    }

    if (!enforcementType) {
      return NextResponse.json(
        { error: 'Enforcement type is required' },
        { status: 400 }
      );
    }

    if (gracePeriodDays === undefined || gracePeriodDays < 0) {
      return NextResponse.json(
        { error: 'Grace period days must be a non-negative number' },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    await admin2FAService.set2FAPolicy(
      {
        role,
        enforcementType,
        gracePeriodDays,
        enforcementStartDate: enforcementStartDate ? new Date(enforcementStartDate) : undefined,
        allowedMethods,
      },
      session.user.id,
      {
        ipAddress,
        userAgent,
      }
    );

    return NextResponse.json({
      success: true,
      message: `2FA policy for ${role} role has been updated successfully`,
    });
  } catch (error) {
    console.error('[Admin 2FA API] Error setting policy:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
