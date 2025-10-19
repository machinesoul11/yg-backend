/**
 * Admin 2FA Management - Get User 2FA Details
 * GET /api/admin/users/2fa/[userId]
 * 
 * Retrieves detailed 2FA information for a specific user
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Admin2FAManagementService } from '@/lib/services/admin-2fa-management.service';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';

const auditService = new AuditService(prisma);
const admin2FAService = new Admin2FAManagementService(prisma, auditService);

export async function GET(
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

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const userDetails = await admin2FAService.getUser2FADetails(userId);

    return NextResponse.json(userDetails, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('[Admin 2FA API] Error fetching user details:', error);

    if (error.message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
