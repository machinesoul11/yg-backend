/**
 * Email Verification API Route
 * Handles email verification via REST API
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { emailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';
import { AuthErrors } from '@/lib/errors/auth.errors';

// Initialize auth service
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Verification token is required' },
        { status: 400 }
      );
    }

    // Get request context for audit logging
    const context = {
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    };

    // Verify the email
    await authService.verifyEmail(token, context);

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error: any) {
    // Handle known auth errors
    if (error === AuthErrors.TOKEN_INVALID) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification token' },
        { status: 400 }
      );
    }

    if (error === AuthErrors.TOKEN_EXPIRED) {
      return NextResponse.json(
        { success: false, message: 'Verification token has expired' },
        { status: 400 }
      );
    }

    if (error === AuthErrors.ALREADY_VERIFIED) {
      return NextResponse.json(
        { success: false, message: 'Email is already verified' },
        { status: 400 }
      );
    }

    // Log unexpected errors
    console.error('Email verification error:', error);

    return NextResponse.json(
      { success: false, message: 'Verification failed' },
      { status: 500 }
    );
  }
}
