/**
 * POST /api/auth/login/2fa/totp
 * Verify TOTP (Time-based One-Time Password) during multi-step login
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Request validation schema
const verifySchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
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
    console.log('[2FA Login TOTP] Request body:', { hasToken: !!body.challengeToken, hasCode: !!body.code });
    
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

    const { challengeToken, code } = validation.data;
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
    const result = await challengeService.verifyTotp(challengeToken, code, context);

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

    console.log('[2FA Login TOTP] ✅ Verification successful, session token:', result.sessionToken?.substring(0, 10) + '...');

    // Set session cookie
    if (result.sessionToken) {
      const cookieStore = await cookies();
      const isProduction = process.env.NODE_ENV === 'production';
      
      cookieStore.set('session_token', result.sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        path: '/',
      });

      console.log('[2FA Login TOTP] Session cookie set:', {
        name: 'session_token',
        value: result.sessionToken.substring(0, 10) + '...',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
      });
    }

    console.log('[2FA Login TOTP] Response created with cookie, sending to client');

    return NextResponse.json(
      {
        success: true,
        session: {
          token: result.sessionToken,
          expiresAt: result.sessionExpiresAt
        },
        user: {
          id: result.user?.id,
          email: result.user?.email,
          name: result.user?.name
        }
      },
      { 
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://www.yesgoddess.agency',
          'Access-Control-Allow-Credentials': 'true',
        },
      }
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
