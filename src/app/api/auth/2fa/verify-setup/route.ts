/**
 * POST /api/auth/2fa/verify-setup
 * Unified endpoint for verifying and completing 2FA setup (TOTP or SMS)
 * Determines method based on user's pending setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { isAuthError } from '@/lib/errors/auth.errors';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);
const smsService = new TwilioSmsService();

// Validation schema
const verifySetupSchema = z.object({
  code: z.string().min(6, 'Verification code must be at least 6 digits').max(6, 'Verification code must be 6 digits'),
  method: z.enum(['TOTP', 'SMS']).optional(),
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
            message: 'You must be logged in to verify two-factor authentication setup',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = verifySetupSchema.safeParse(body);

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

    const { code, method } = validation.data;
    const context = getRequestContext(req);

    // Get user to determine setup method
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        two_factor_enabled: true,
        two_factor_secret: true,
        phone_number: true,
        phone_verified: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        },
        { status: 404 }
      );
    }

    // Determine which method to verify based on pending setup
    let verificationMethod = method;
    
    if (!verificationMethod) {
      // Auto-detect based on user state
      if (user.two_factor_secret && !user.two_factor_enabled) {
        verificationMethod = 'TOTP';
      } else if (user.phone_number && !user.phone_verified) {
        verificationMethod = 'SMS';
      } else {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NO_PENDING_SETUP',
              message: 'No pending 2FA setup found. Please initiate setup first.',
            },
          },
          { status: 400 }
        );
      }
    }

    // Verify based on method
    if (verificationMethod === 'TOTP') {
      // Verify TOTP code and complete setup
      const result = await authService.confirmTotpSetup(
        session.user.id,
        { code },
        context
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            enabled: true,
            method: 'TOTP',
            backupCodes: result.backupCodes,
            message: 'Authenticator two-factor authentication has been successfully enabled',
            warning: 'IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.',
            backupCodesInfo: {
              count: result.backupCodes.length,
              oneTimeUse: true,
              usage: 'Use these codes if you lose access to your authenticator app',
            },
          },
        },
        { status: 200 }
      );
    } else {
      // Verify SMS code
      const result = await smsService.verifyCode(session.user.id, code);

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VERIFICATION_FAILED',
              message: result.error || 'Failed to verify SMS code',
              attemptsRemaining: result.attemptsRemaining,
            },
          },
          { status: 400 }
        );
      }

      // Update user to mark phone as verified and enable SMS 2FA
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          phone_verified: true,
          two_factor_enabled: true,
          preferred_2fa_method: 'SMS',
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            enabled: true,
            method: 'SMS',
            phoneNumber: user.phone_number ? `***${user.phone_number.slice(-4)}` : null,
            message: 'SMS two-factor authentication has been successfully enabled',
            note: 'You will receive a verification code via SMS when logging in',
          },
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('2FA verification setup error:', error);

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
          message: 'Failed to verify two-factor authentication setup',
        },
      },
      { status: 500 }
    );
  }
}
