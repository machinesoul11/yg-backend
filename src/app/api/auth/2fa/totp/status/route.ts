/**
 * GET /api/auth/2fa/totp/status
 * Retrieves the current TOTP status for the authenticated user
 * Returns whether TOTP is enabled, verification timestamp, and backup codes remaining
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { isAuthError } from '@/lib/errors/auth.errors';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to check two-factor authentication status',
          },
        },
        { status: 401 }
      );
    }

    // Get TOTP status
    const status = await authService.getTotpStatus(session.user.id);

    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: status.enabled,
          verifiedAt: status.verifiedAt,
          backupCodesRemaining: status.backupCodesRemaining,
          method: status.enabled ? 'AUTHENTICATOR' : null,
          recommendations: {
            enableTotp: !status.enabled 
              ? 'Two-factor authentication is not enabled. Enable it to secure your account.' 
              : null,
            regenerateBackupCodes: status.enabled && status.backupCodesRemaining < 3
              ? 'You have less than 3 backup codes remaining. Consider regenerating them.'
              : null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('TOTP status error:', error);

    if (isAuthError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
          },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve two-factor authentication status',
        },
      },
      { status: 500 }
    );
  }
}
