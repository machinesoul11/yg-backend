/**
 * POST /api/auth/2fa/resend-sms
 * Resends SMS verification code for 2FA authentication
 * 
 * This endpoint allows users to request a new SMS code if they didn't
 * receive the first one or if it expired. Includes rate limiting to
 * prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TwoFactorChallengeService } from '@/lib/services/auth/2fa-challenge.service';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { EmailService } from '@/lib/services/email/email.service';
import { AccountLockoutService } from '@/lib/auth/account-lockout.service';
import { z } from 'zod';

// Initialize services
const smsService = new TwilioSmsService();
const emailService = new EmailService();
const lockoutService = new AccountLockoutService(prisma, emailService);
const challengeService = new TwoFactorChallengeService(
  prisma,
  smsService,
  emailService,
  lockoutService
);

// Request validation schema
const resendSchema = z.object({
  challengeToken: z.string(),
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
    // Parse and validate request body
    const body = await req.json();
    const validation = resendSchema.safeParse(body);

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

    const { challengeToken } = validation.data;
    const context = getRequestContext(req);

    // Resend SMS code
    const result = await challengeService.resendSmsCode(challengeToken, context);

    if (!result.success) {
      console.error('[2FA Resend SMS] Failed:', {
        error: result.error,
        resetAt: result.resetAt,
        remainingAttempts: result.remainingAttempts,
        challengeToken: challengeToken.substring(0, 10) + '...', // Log partial token
        ipAddress: context.ipAddress,
        userAgent: context.userAgent.substring(0, 50) + '...', // Log partial user agent
      });
      
      // Determine appropriate status code
      let statusCode = 400;
      if (result.error?.includes('Too many')) statusCode = 429;
      if (result.error?.includes('expired')) statusCode = 410;
      if (result.error?.includes('not found')) statusCode = 404;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.error?.includes('Too many') ? 'RATE_LIMIT_EXCEEDED' : 'RESEND_FAILED',
            message: result.error,
            resetAt: result.resetAt?.toISOString(),
            remainingAttempts: result.remainingAttempts,
          },
        },
        { status: statusCode }
      );
    }

    // Success
    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'Verification code has been resent',
          remainingAttempts: result.remainingAttempts,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[2FA Resend SMS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resend verification code',
        },
      },
      { status: 500 }
    );
  }
}
