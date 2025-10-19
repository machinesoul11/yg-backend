/**
 * POST /api/auth/2fa/disable
 * Unified endpoint to disable all two-factor authentication methods
 * Requires password verification for security
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { disableTotpSchema } from '@/lib/validators/auth.validators';
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
            message: 'You must be logged in to disable two-factor authentication',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = disableTotpSchema.safeParse(body);

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

    // Use the existing disableTotp method which handles all 2FA disabling
    await authService.disableTotp(
      session.user.id,
      validation.data,
      context
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: false,
          message: 'Two-factor authentication has been disabled for your account',
          warning: 'Your account is now less secure. We strongly recommend re-enabling two-factor authentication.',
          securityNote: 'A security alert has been sent to your email address.',
          details: {
            totpDisabled: true,
            smsDisabled: true,
            backupCodesRemoved: true,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('2FA disable error:', error);

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
          message: 'Failed to disable two-factor authentication',
        },
      },
      { status: 500 }
    );
  }
}
