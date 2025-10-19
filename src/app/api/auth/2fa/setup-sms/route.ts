/**
 * POST /api/auth/2fa/setup-sms
 * Initiates SMS-based two-factor authentication setup
 * Sends a verification code to the provided phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { isAuthError } from '@/lib/errors/auth.errors';

// Validation schema
const setupSmsSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g., +12345678901)'),
});

// Initialize SMS service
const smsService = new TwilioSmsService();

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
            message: 'You must be logged in to setup SMS two-factor authentication',
          },
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = setupSmsSchema.safeParse(body);

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

    const { phoneNumber } = validation.data;

    // Check if user already has 2FA enabled with a different method
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        two_factor_enabled: true,
        preferred_2fa_method: true,
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

    // Check if phone number is already in use by another user
    const existingPhone = await prisma.user.findFirst({
      where: {
        phone_number: phoneNumber,
        phone_verified: true,
        id: { not: session.user.id },
      },
    });

    if (existingPhone) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PHONE_IN_USE',
            message: 'This phone number is already associated with another account',
          },
        },
        { status: 409 }
      );
    }

    // Send verification code
    const result = await smsService.sendVerificationCode(
      session.user.id,
      phoneNumber,
      'phoneVerification'
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SMS_SEND_FAILED',
            message: result.error || 'Failed to send SMS verification code',
          },
        },
        { status: 500 }
      );
    }

    // Update user with unverified phone number
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        phone_number: phoneNumber,
        phone_verified: false,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          method: 'SMS',
          maskedPhoneNumber: `***${phoneNumber.slice(-4)}`,
          message: 'A verification code has been sent to your phone number',
          nextStep: 'Use the verify-setup endpoint with the 6-digit code to complete setup',
          codeExpiry: '5 minutes',
          maxAttempts: 3,
          canResend: true,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('SMS setup error:', error);

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
          message: 'Failed to setup SMS two-factor authentication',
        },
      },
      { status: 500 }
    );
  }
}
