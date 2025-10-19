/**
 * POST /api/auth/2fa/challenge
 * Initiates a 2FA challenge after successful password authentication
 * 
 * This endpoint should be called after the user has successfully authenticated
 * with their username/password but before issuing a full session token.
 * 
 * Returns a challenge token that must be used for verification.
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
const challengeSchema = z.object({
  userId: z.string(),
  temporaryToken: z.string().optional(), // Optional temporary auth token from login
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
    const validation = challengeSchema.safeParse(body);

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

    const { userId } = validation.data;
    const context = getRequestContext(req);

    // Initiate challenge
    const challenge = await challengeService.initiateChallenge(userId, context);

    return NextResponse.json(
      {
        success: true,
        data: {
          challengeToken: challenge.token,
          expiresAt: challenge.expiresAt.toISOString(),
          method: challenge.method,
          maskedPhone: challenge.maskedPhone,
          message: challenge.method === 'SMS'
            ? `A verification code has been sent to ${challenge.maskedPhone}`
            : 'Enter the verification code from your authenticator app',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[2FA Challenge] Error initiating challenge:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Handle specific error cases
    if (errorMessage.includes('not enabled')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: '2FA_NOT_ENABLED',
            message: errorMessage,
          },
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes('locked')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: errorMessage,
          },
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('Too many')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: errorMessage,
          },
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to initiate 2FA challenge',
        },
      },
      { status: 500 }
    );
  }
}
