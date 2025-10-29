/**
 * POST /api/auth/login/2fa/sms
 * Alias route for SMS verification during multi-step login
 * Delegates to the main verify-sms endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request validation schema
const verifySchema = z.object({
  temporaryToken: z.string().min(1, 'Temporary token is required'),
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
      hasToken: !!body.temporaryToken, 
      tokenValue: body.temporaryToken?.substring(0, 10) + '...', 
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

    const { temporaryToken, code } = validation.data;
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
    const result = await challengeService.verifySmsOtp(temporaryToken, code, context);

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

    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'Two-factor authentication successful',
        },
      },
      { status: 200 }
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
