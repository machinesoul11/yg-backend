/**
 * Admin 2FA Management - Reset User 2FA
 * POST /api/admin/users/2fa/[userId]/reset
 * 
 * Force resets a user's 2FA configuration
 * Requires admin authorization and reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Admin2FAManagementService } from '@/lib/services/admin-2fa-management.service';
import { AuditService } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);
const admin2FAService = new Admin2FAManagementService(prisma, auditService);

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = params.userId;
    const body = await req.json();
    const { reason } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Reason is required for 2FA reset' },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    await admin2FAService.resetUser2FA(userId, session.user.id, reason, {
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'User 2FA has been reset successfully',
    });
  } catch (error: any) {
    console.error('[Admin 2FA API] Error resetting user 2FA:', error);

    if (error.message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (error.message.includes('cannot reset their own')) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
