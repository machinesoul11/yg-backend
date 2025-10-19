/**
 * POST /api/auth/2fa/regenerate-backup
 * Alternative unified endpoint for regenerating backup codes
 * Requires password verification
 * Invalidates all existing unused backup codes and generates new ones
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { isAuthError } from '@/lib/errors/auth.errors';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

// Validation schema
const regenerateBackupCodesSchema = z.object({
  password: z.string().min(1, 'Password is required for security confirmation'),
});

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
            message: 'You must be logged in to regenerate backup codes',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = regenerateBackupCodesSchema.safeParse(body);

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

    // Regenerate backup codes using the existing service method
    const result = await authService.regenerateBackupCodes(
      session.user.id,
      validation.data.password,
      context
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          backupCodes: result.backupCodes,
          message: 'New backup codes have been generated successfully',
          warning: 'IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.',
          info: {
            count: result.backupCodes.length,
            previousCodesInvalidated: true,
            oneTimeUse: true,
            format: 'Each code can only be used once',
            usage: 'Use these codes if you lose access to your authenticator app or phone',
            storage: 'Store these codes in a secure password manager or write them down and keep them safe',
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Backup codes regeneration error:', error);

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
          message: 'Failed to regenerate backup codes',
        },
      },
      { status: 500 }
    );
  }
}
