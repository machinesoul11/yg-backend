/**
 * POST /api/auth/2fa/remove-method
 * Allows users to remove one of their 2FA methods (SMS or AUTHENTICATOR) while keeping the other active
 * Requires verification code from the method that will remain active
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
const removeMethodSchema = z.object({
  methodToRemove: z.enum(['SMS', 'AUTHENTICATOR']),
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
            message: 'You must be logged in to remove a 2FA method',
          },
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const parsed = removeMethodSchema.safeParse(body);

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

    const { methodToRemove, verificationCode } = parsed.data;

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
            code: 'SINGLE_METHOD_ACTIVE',
            message: 'You cannot remove your only active 2FA method. To disable 2FA completely, use the disable endpoint.',
          },
        },
        { status: 400 }
      );
    }

    // Determine which method will remain active after removal
    const methodToKeep = methodToRemove === 'SMS' ? 'AUTHENTICATOR' : 'SMS';

    // Verify the code from the method that will remain active
    let isValidCode = false;

    if (methodToKeep === 'AUTHENTICATOR') {
      // Verify TOTP code
      isValidCode = TotpService.validateCode(user.two_factor_secret!, verificationCode);
    } else if (methodToKeep === 'SMS') {
      // Verify SMS code - first we need to send one
      const verification = await twilioSmsService.verifyCode(
        user.id,
        verificationCode
      );
      isValidCode = verification.success;
    }

    if (!isValidCode) {
      await auditService.log({
        action: '2FA_METHOD_REMOVAL_FAILED' as any,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        after: {
          reason: 'INVALID_VERIFICATION_CODE',
          attemptedRemoval: methodToRemove,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CODE',
            message: `Invalid verification code from your ${methodToKeep === 'SMS' ? 'SMS' : 'authenticator app'}. Please try again.`,
          },
        },
        { status: 400 }
      );
    }

    // Remove the method
    if (methodToRemove === 'SMS') {
      // Remove SMS method
      await prisma.user.update({
        where: { id: user.id },
        data: {
          phone_number: null,
          phone_verified: false,
          preferred_2fa_method: 'AUTHENTICATOR', // Auto-set to remaining method
        },
      });

      // Delete any pending SMS verification codes
      await prisma.smsVerificationCode.deleteMany({
        where: { userId: user.id },
      });
    } else {
      // Remove AUTHENTICATOR method
      await prisma.user.update({
        where: { id: user.id },
        data: {
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_verified_at: null,
          preferred_2fa_method: 'SMS', // Auto-set to remaining method
        },
      });

      // Delete backup codes since TOTP is being removed
      await prisma.twoFactorBackupCode.deleteMany({
        where: { userId: user.id },
      });
    }

    await auditService.log({
      action: '2FA_METHOD_REMOVED' as any,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent,
      after: {
        removedMethod: methodToRemove,
        remainingMethod: methodToKeep,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          removedMethod: methodToRemove,
          remainingMethod: methodToKeep,
          message: `${methodToRemove === 'SMS' ? 'SMS' : 'Authenticator App'} 2FA has been removed. Your ${methodToKeep === 'SMS' ? 'SMS' : 'authenticator app'} remains active.`,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Remove 2FA Method] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove 2FA method. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
