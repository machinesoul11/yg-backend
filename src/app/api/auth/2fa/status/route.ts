/**
 * GET /api/auth/2fa/status
 * Retrieves the current 2FA status for the authenticated user
 * Unified endpoint that returns status for all 2FA methods (TOTP and SMS)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { isAuthError } from '@/lib/errors/auth.errors';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to check two-factor authentication status',
          },
        },
        { status: 401 }
      );
    }

    // Get user with 2FA information
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        two_factor_enabled: true,
        two_factor_verified_at: true,
        preferred_2fa_method: true,
        phone_number: true,
        phone_verified: true,
        twoFactorBackupCodes: {
          where: { used: false },
          select: { id: true },
        },
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

    // Determine which methods are available and active
    const hasTotpSecret = user.two_factor_enabled;
    const hasSmsPhone = user.phone_verified && !!user.phone_number;
    const activeMethod = user.preferred_2fa_method;
    const backupCodesCount = user.twoFactorBackupCodes.length;
    
    // Determine if both methods are enabled
    const bothMethodsEnabled = hasTotpSecret && hasSmsPhone;
    const anyMethodEnabled = hasTotpSecret || hasSmsPhone;

    // Build response
    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: anyMethodEnabled,
          bothMethodsEnabled,
          verifiedAt: user.two_factor_verified_at,
          preferredMethod: activeMethod,
          availableMethods: {
            totp: {
              enabled: hasTotpSecret,
              configured: hasTotpSecret,
              description: 'Authenticator app (Google Authenticator, Authy, etc.)',
            },
            sms: {
              enabled: hasSmsPhone,
              configured: hasSmsPhone,
              maskedPhone: user.phone_number 
                ? `***${user.phone_number.slice(-4)}` 
                : null,
              description: 'SMS verification code sent to your phone',
            },
          },
          backupCodes: {
            available: hasTotpSecret && backupCodesCount > 0,
            remaining: backupCodesCount,
          },
          capabilities: {
            canSetPreference: bothMethodsEnabled,
            canRemoveMethod: bothMethodsEnabled,
            canSwitchDuringLogin: bothMethodsEnabled,
          },
          recommendations: {
            enableTotp: !hasTotpSecret 
              ? 'Enable authenticator app for more secure two-factor authentication and as a backup method' 
              : null,
            enableSms: !hasSmsPhone 
              ? 'Add a phone number for SMS-based two-factor authentication as a backup method' 
              : null,
            regenerateBackupCodes: hasTotpSecret && backupCodesCount < 3
              ? `You have less than 3 backup codes remaining. Consider regenerating them.`
              : null,
            setPreference: bothMethodsEnabled && !activeMethod
              ? 'Set your preferred 2FA method to customize your login experience'
              : null,
            enableAny: !anyMethodEnabled
              ? 'Two-factor authentication is not enabled. Enable it to secure your account.'
              : null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('2FA status error:', error);

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
          message: 'Failed to retrieve two-factor authentication status',
        },
      },
      { status: 500 }
    );
  }
}
