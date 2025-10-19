/**
 * POST /api/auth/2fa/switch-method
 * Allows users to switch between SMS and AUTHENTICATOR during an active login challenge
 * This endpoint is used during the login flow after password verification but before 2FA completion
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { TwoFactorChallengeService } from '@/lib/services/auth/2fa-challenge.service';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { EmailService } from '@/lib/services/email/email.service';
import { AccountLockoutService } from '@/lib/auth/account-lockout.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';

// Initialize services
const auditService = new AuditService(prisma);
const twilioSmsService = new TwilioSmsService();
const accountLockoutService = new AccountLockoutService(prisma);
const challengeService = new TwoFactorChallengeService(
  prisma,
  twilioSmsService,
  emailService,
  accountLockoutService
);

// Request validation schema
const switchMethodSchema = z.object({
  challengeToken: z.string().min(32, 'Invalid challenge token'),
  newMethod: z.enum(['SMS', 'AUTHENTICATOR']),
});

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const parsed = switchMethodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { challengeToken, newMethod } = parsed.data;

    // Extract context
    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Switch challenge method
    const result = await challengeService.switchChallengeMethod(
      challengeToken,
      newMethod,
      { ipAddress, userAgent }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          challengeToken: result.token,
          expiresAt: result.expiresAt.toISOString(),
          method: result.method,
          maskedPhone: result.maskedPhone,
          message: result.method === 'SMS' 
            ? `A verification code has been sent to ${result.maskedPhone}` 
            : 'Please enter the code from your authenticator app',
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[2FA Switch Method] Error:', error);

    // Handle specific error types
    if (error.message?.includes('expired')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CHALLENGE_EXPIRED',
            message: error.message,
          },
        },
        { status: 400 }
      );
    }

    if (error.message?.includes('Maximum method switches exceeded')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TOO_MANY_SWITCHES',
            message: error.message,
          },
        },
        { status: 429 }
      );
    }

    if (error.message?.includes('Both SMS and authenticator')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BOTH_METHODS_REQUIRED',
            message: error.message,
          },
        },
        { status: 400 }
      );
    }

    if (error.message?.includes('Already using')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_METHOD',
            message: error.message,
          },
        },
        { status: 400 }
      );
    }

    if (error.message?.includes('Invalid or expired')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired challenge token',
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to switch verification method. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
