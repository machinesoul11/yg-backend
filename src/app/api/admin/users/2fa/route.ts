/**
 * Admin 2FA Management - Get All Users 2FA Status
 * GET /api/admin/users/2fa
 * 
 * Retrieves 2FA status for all users with filtering and pagination
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

export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const role = searchParams.get('role') || undefined;
    const twoFactorEnabled = searchParams.get('twoFactorEnabled');
    const twoFactorRequired = searchParams.get('twoFactorRequired');
    const search = searchParams.get('search') || undefined;

    // Build filter options
    const options: any = {
      page,
      limit,
      search,
    };

    if (role) {
      options.role = role;
    }

    if (twoFactorEnabled !== null) {
      options.twoFactorEnabled = twoFactorEnabled === 'true';
    }

    if (twoFactorRequired !== null) {
      options.twoFactorRequired = twoFactorRequired === 'true';
    }

    const result = await admin2FAService.getAllUsers2FAStatus(options);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Admin 2FA API] Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
