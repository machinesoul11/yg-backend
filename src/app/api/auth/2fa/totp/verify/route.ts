/**
 * POST /api/auth/2fa/totp/verify
 * Verifies the initial TOTP code and completes authenticator setup
 * Enables TOTP for the user and generates backup codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { confirmTotpSetupSchema } from '@/lib/validators/auth.validators';
import { isAuthError } from '@/lib/errors/auth.errors';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

/**
 * Helper to extract request context
 */
function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to verify two-factor authentication',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = confirmTotpSetupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const context = getRequestContext(req);

    // Confirm TOTP setup
    const result = await authService.confirmTotpSetup(
      session.user.id,
      validation.data,
      context
    );

    // Note: Email notification for 2FA enabled can be implemented when
    // appropriate email template is added to the template registry

    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: true,
          backupCodes: result.backupCodes,
          message: 'Two-factor authentication has been successfully enabled for your account',
          warning: 'IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.',
          backupCodesInfo: {
            count: result.backupCodes.length,
            oneTimeUse: true,
            format: 'Each code can only be used once',
            usage: 'Use these codes if you lose access to your authenticator app',
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('TOTP verification error:', error);

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
          message: 'Failed to verify two-factor authentication code',
        },
      },
      { status: 500 }
    );
  }
}
