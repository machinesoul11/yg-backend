/**
 * POST /api/auth/login/2fa/backup-code
 * Verify backup code during multi-step login
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Request validation schema
const verifySchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
  code: z.string().min(1, 'Backup code is required'),
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
    console.log('[2FA Login Backup Code] Route handler started');
    
    const body = await req.json();
    console.log('[2FA Login Backup Code] Request body:', { hasToken: !!body.challengeToken, hasCode: !!body.code });
    
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

    console.log('[2FA Login Backup Code] Services imported, initializing...');
    
    const smsService = new TwilioSmsService();
    const emailService = new EmailService();
    const lockoutService = new AccountLockoutService(prisma, emailService);
    const challengeService = new TwoFactorChallengeService(
      prisma,
      smsService,
      emailService,
      lockoutService
    );

    console.log('[2FA Login Backup Code] Verifying backup code...');
    
    // Verify backup code using the challenge service
    const result = await challengeService.verifyBackupCode(challengeToken, code, context);

    if (!result.success) {
      let statusCode = 401;
      if (result.error?.includes('expired')) statusCode = 410;
      if (result.error?.includes('Maximum')) statusCode = 403;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error,
            attemptsRemaining: result.attemptsRemaining,
          },
        },
        { status: statusCode }
      );
    }

    console.log('[2FA Login Backup Code] ✅ Verification successful, session token:', result.sessionToken?.substring(0, 10) + '...');

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

      console.log('[2FA Login Backup Code] Session cookie set:', {
        name: 'session_token',
        value: result.sessionToken.substring(0, 10) + '...',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
      });
    }

    console.log('[2FA Login Backup Code] Response created with cookie, sending to client');

    return NextResponse.json(
      {
        success: true,
        // ✅ ADD sessionToken at root level (frontend expects this)
        sessionToken: result.sessionToken,
        // ✅ KEEP session object for future compatibility
        session: {
          token: result.sessionToken,
          expiresAt: result.sessionExpiresAt
        },
        user: {
          id: result.user?.id,
          email: result.user?.email,
          name: result.user?.name
        },
        remainingBackupCodes: result.remainingCodes
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
    console.error('[2FA Login Backup Code] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify backup code',
        },
      },
      { status: 500 }
    );
  }
}
