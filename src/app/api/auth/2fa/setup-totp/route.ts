/**
 * POST /api/auth/2fa/setup-totp
 * Alternative unified endpoint for initiating TOTP (authenticator) setup
 * Redirects to the existing totp/enable endpoint functionality
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
            message: 'You must be logged in to enable two-factor authentication',
          },
        },
        { status: 401 }
      );
    }

    const context = getRequestContext(req);

    // Initiate TOTP setup
    const setupData = await authService.initiateTotpSetup(
      session.user.id,
      context
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          method: 'TOTP',
          qrCodeDataUrl: setupData.qrCodeDataUrl,
          manualEntryKey: setupData.manualEntryKey,
          issuer: 'YesGoddess',
          accountName: session.user.email,
          message: 'Scan the QR code with your authenticator app or enter the key manually',
          nextStep: 'Use the verify-setup endpoint with a code from your authenticator app to complete setup',
          instructions: [
            'Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)',
            'Tap the + button to add a new account',
            'Scan the QR code or manually enter the provided key',
            'Enter the 6-digit code from your app to complete setup',
          ],
          authenticatorApps: [
            {
              name: 'Google Authenticator',
              ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
              android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
            },
            {
              name: 'Microsoft Authenticator',
              ios: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
              android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
            },
            {
              name: 'Authy',
              ios: 'https://apps.apple.com/app/authy/id494168017',
              android: 'https://play.google.com/store/apps/details?id=com.authy.authy',
            },
          ],
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('TOTP setup error:', error);

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
          message: 'Failed to initiate two-factor authentication setup',
        },
      },
      { status: 500 }
    );
  }
}
