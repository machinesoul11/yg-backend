/**
 * POST /api/auth/2fa/set-preferred-method
 * Allows users to set their preferred 2FA method when they have both SMS and AUTHENTICATOR enabled
 * Requires verification of current method for security
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TotpService } from '@/lib/auth/totp.service';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { AuditService } from '@/lib/services/audit.service';

// Initialize services
const auditService = new AuditService(prisma);
const twilioSmsService = new TwilioSmsService();

// Request validation schema
const setPreferredMethodSchema = z.object({
  preferredMethod: z.enum(['SMS', 'AUTHENTICATOR']),
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});

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
            message: 'You must be logged in to set preferred 2FA method',
          },
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const parsed = setPreferredMethodSchema.safeParse(body);

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

    const { preferredMethod, verificationCode } = parsed.data;

    // Extract context
    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Get user with 2FA information
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        two_factor_enabled: true,
        two_factor_secret: true,
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

    // Verify both methods are enabled
    const hasTOTP = user.two_factor_enabled && !!user.two_factor_secret;
    const hasSMS = user.phone_verified && !!user.phone_number;

    if (!hasTOTP || !hasSMS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BOTH_METHODS_REQUIRED',
            message: 'Both SMS and authenticator methods must be enabled before setting a preference',
          },
        },
        { status: 400 }
      );
    }

    // Verify the code from current preferred method (or any method if no preference set)
    const currentMethod = user.preferred_2fa_method || 'AUTHENTICATOR';
    let isValidCode = false;

    if (currentMethod === 'AUTHENTICATOR') {
      // Verify TOTP code
      isValidCode = TotpService.validateCode(user.two_factor_secret!, verificationCode);
    } else if (currentMethod === 'SMS') {
      // Verify SMS code
      const verification = await twilioSmsService.verifyCode(
        user.id,
        verificationCode
      );
      isValidCode = verification.success;
    }

    if (!isValidCode) {
      await auditService.log({
        action: 'PREFERRED_2FA_METHOD_CHANGE_FAILED' as any,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        after: {
          reason: 'INVALID_VERIFICATION_CODE',
          attemptedMethod: preferredMethod,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CODE',
            message: 'Invalid verification code. Please try again.',
          },
        },
        { status: 400 }
      );
    }

    // Update preferred method
    await prisma.user.update({
      where: { id: user.id },
      data: {
        preferred_2fa_method: preferredMethod,
      },
    });

    await auditService.log({
      action: 'PREFERRED_2FA_METHOD_CHANGED' as any,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent,
      before: { preferred_2fa_method: currentMethod },
      after: { preferred_2fa_method: preferredMethod },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          preferredMethod,
          message: `Your preferred 2FA method has been changed to ${preferredMethod === 'SMS' ? 'SMS' : 'Authenticator App'}`,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Set Preferred 2FA Method] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to set preferred 2FA method. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
