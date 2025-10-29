/**
 * POST /api/auth/login/2fa/totp
 * Alias route for TOTP verification during multi-step login
 * Delegates to the main verify-totp logic
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request validation schema
const verifySchema = z.object({
  temporaryToken: z.string().min(1, 'Temporary token is required'),
  code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d+$/, 'Code must contain only digits'),
  trustDevice: z.boolean().optional(),
});

function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

export async function POST(req: NextRequest) {
  try {
    console.log('[2FA Login TOTP] Route handler started');
    
    const body = await req.json();
    console.log('[2FA Login TOTP] Request body:', { hasToken: !!body.temporaryToken, hasCode: !!body.code });
    
    const validation = verifySchema.safeParse(body);

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

    const { temporaryToken, code } = validation.data;
    const context = getRequestContext(req);

    // Lazy initialize services inside the handler
    const { prisma } = await import('@/lib/db');
    const { TwoFactorChallengeService } = await import('@/lib/services/auth/2fa-challenge.service');
    const { TwilioSmsService } = await import('@/lib/services/sms/twilio.service');
    const { EmailService } = await import('@/lib/services/email/email.service');
    const { AccountLockoutService } = await import('@/lib/auth/account-lockout.service');

    console.log('[2FA Login TOTP] Services imported, initializing...');
    
    const smsService = new TwilioSmsService();
    const emailService = new EmailService();
    const lockoutService = new AccountLockoutService(prisma, emailService);
    const challengeService = new TwoFactorChallengeService(
      prisma,
      smsService,
      emailService,
      lockoutService
    );

    console.log('[2FA Login TOTP] Verifying TOTP...');
    
    // Verify TOTP using the challenge service
    const result = await challengeService.verifyTotp(temporaryToken, code, context);

    if (!result.success) {
      let statusCode = 401;
      if (result.error?.includes('expired')) statusCode = 410;
      if (result.error?.includes('Too many')) statusCode = 429;
      if (result.error?.includes('Maximum')) statusCode = 403;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error,
            attemptsRemaining: result.attemptsRemaining,
            lockedUntil: result.lockedUntil?.toISOString(),
          },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'Two-factor authentication successful',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[2FA Login TOTP] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify TOTP code',
        },
      },
      { status: 500 }
    );
  }
}
