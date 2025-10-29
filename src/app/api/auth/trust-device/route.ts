/**
 * POST /api/auth/trust-device
 * Creates a trusted device record after successful 2FA verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Request validation schema
const trustDeviceSchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
  deviceInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    device: z.string().optional(),
    fingerprint: z.string(),
  }),
  rememberDevice: z.boolean(),
});

// Trust token expires in 30 days
const TRUST_DURATION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

/**
 * Generate a cryptographically secure trust token
 */
function generateTrustToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Get device name from device info
 */
function getDeviceName(deviceInfo: any): string {
  const parts = [];
  if (deviceInfo.browser) parts.push(deviceInfo.browser);
  if (deviceInfo.os) parts.push(deviceInfo.os);
  if (deviceInfo.device) parts.push(deviceInfo.device);
  return parts.join(' - ') || 'Unknown Device';
}

/**
 * Get request context
 */
function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

export async function POST(req: NextRequest) {
  try {
    console.log('[Trust Device] Request started');
    
    const body = await req.json();
    const validation = trustDeviceSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Trust Device] Validation failed:', validation.error.issues);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400 }
      );
    }

    const { challengeToken, deviceInfo, rememberDevice } = validation.data;
    const context = getRequestContext(req);

    console.log('[Trust Device] Request validated:', {
      hasToken: !!challengeToken,
      rememberDevice,
      fingerprint: deviceInfo.fingerprint?.substring(0, 10) + '...',
    });

    // If user chose not to remember device, return success without creating record
    if (!rememberDevice) {
      console.log('[Trust Device] User chose not to remember device');
      return NextResponse.json(
        {
          success: true,
        },
        { status: 200 }
      );
    }

    // Import the challenge service to verify and get user from challenge token
    const { TwoFactorChallengeService } = await import('@/lib/services/auth/2fa-challenge.service');
    const { TwilioSmsService } = await import('@/lib/services/sms/twilio.service');
    const { EmailService } = await import('@/lib/services/email/email.service');
    const { AccountLockoutService } = await import('@/lib/auth/account-lockout.service');
    
    const smsService = new TwilioSmsService();
    const emailService = new EmailService();
    const lockoutService = new AccountLockoutService(prisma, emailService);
    const challengeService = new TwoFactorChallengeService(
      prisma,
      smsService,
      emailService,
      lockoutService
    );

    // Get challenge data to extract user ID
    const challenge = await challengeService.getChallengeFromToken(challengeToken);
    
    if (!challenge) {
      console.error('[Trust Device] Invalid or expired challenge token');
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired challenge token',
        },
        { status: 401 }
      );
    }

    const userId = challenge.userId;
    console.log('[Trust Device] User ID from challenge:', userId);

    // Generate trust token
    const trustToken = generateTrustToken();
    const tokenHash = await bcrypt.hash(trustToken, BCRYPT_ROUNDS);

    // Calculate expiration (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRUST_DURATION_DAYS);

    // Get device name
    const deviceName = getDeviceName(deviceInfo);

    console.log('[Trust Device] Creating trusted device record');

    // Create trusted device record
    const trustedDevice = await prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash,
        deviceName,
        deviceFingerprint: deviceInfo.fingerprint,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    console.log('[Trust Device] Trusted device created:', {
      deviceId: trustedDevice.id,
      expiresAt: trustedDevice.expiresAt,
    });

    return NextResponse.json(
      {
        success: true,
        trustToken,
        expiresAt: trustedDevice.expiresAt,
        deviceId: trustedDevice.id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Trust Device] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trust device',
      },
      { status: 500 }
    );
  }
}
