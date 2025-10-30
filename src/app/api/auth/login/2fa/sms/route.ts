/**
 * POST /api/auth/login/2fa/sms
 * Alias route for SMS verification during multi-step login
 * Delegates to the main verify-sms endpoint
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
    console.log('[2FA Login SMS] Route handler started');
    
    const body = await req.json();
    console.log('[2FA Login SMS] Request body:', { 
      hasToken: !!body.challengeToken, 
      tokenValue: body.challengeToken?.substring(0, 10) + '...', 
      hasCode: !!body.code,
      codeLength: body.code?.length 
    });
    
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

    console.log('[2FA Login SMS] Starting service initialization...');
    
    // Lazy initialize services inside the handler with error handling
    let prisma, TwoFactorChallengeService, TwilioSmsService, EmailService, AccountLockoutService;
    
    try {
      console.log('[2FA Login SMS] Importing prisma...');
      const dbModule = await import('@/lib/db');
      prisma = dbModule.prisma;
      
      console.log('[2FA Login SMS] Importing TwoFactorChallengeService...');
      const challengeModule = await import('@/lib/services/auth/2fa-challenge.service');
      TwoFactorChallengeService = challengeModule.TwoFactorChallengeService;
      
      console.log('[2FA Login SMS] Importing TwilioSmsService...');
      const smsModule = await import('@/lib/services/sms/twilio.service');
      TwilioSmsService = smsModule.TwilioSmsService;
      
      console.log('[2FA Login SMS] Importing EmailService...');
      const emailModule = await import('@/lib/services/email/email.service');
      EmailService = emailModule.EmailService;
      
      console.log('[2FA Login SMS] Importing AccountLockoutService...');
      const lockoutModule = await import('@/lib/auth/account-lockout.service');
      AccountLockoutService = lockoutModule.AccountLockoutService;
      
      console.log('[2FA Login SMS] All services imported successfully');
    } catch (importError) {
      console.error('[2FA Login SMS] Import error:', importError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Service initialization failed',
            details: importError instanceof Error ? importError.message : 'Unknown import error',
          },
        },
        { status: 500 }
      );
    }

    console.log('[2FA Login SMS] Services imported, initializing...');
    
    const smsService = new TwilioSmsService();
    const emailService = new EmailService();
    const lockoutService = new AccountLockoutService(prisma, emailService);
    const challengeService = new TwoFactorChallengeService(
      prisma,
      smsService,
      emailService,
      lockoutService
    );

    console.log('[2FA Login SMS] Verifying SMS OTP...');
    
    // Verify SMS OTP using the challenge service
    const result = await challengeService.verifySmsOtp(challengeToken, code, context);

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

    console.log('[2FA Login SMS] ✅ Verification successful, session token:', result.sessionToken?.substring(0, 10) + '...');

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

      console.log('[2FA Login SMS] Session cookie set:', {
        name: 'session_token',
        value: result.sessionToken.substring(0, 10) + '...',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
      });
    }

    console.log('[2FA Login SMS] Response created with cookie, sending to client');

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
    console.error('[2FA Login SMS] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify SMS code',
        },
      },
      { status: 500 }
    );
  }
}
