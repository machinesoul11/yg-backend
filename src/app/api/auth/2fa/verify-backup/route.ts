/**
 * POST /api/auth/2fa/verify-backup
 * Verifies a backup code during login when user cannot access authenticator app
 * Marks the code as used and prevents reuse
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { verifyBackupCodeSchema } from '@/lib/validators/auth.validators';
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
            message: 'You must be logged in to verify a backup code',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = verifyBackupCodeSchema.safeParse(body);

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

    // Verify backup code
    await authService.verifyBackupCodeForLogin(
      session.user.id,
      validation.data,
      context
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          verified: true,
          message: 'Backup code verified successfully',
          warning: 'This backup code has been used and cannot be used again. Generate new codes if running low.',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Backup code verification error:', error);

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
          message: 'An unexpected error occurred during backup code verification',
        },
      },
      { status: 500 }
    );
  }
}
