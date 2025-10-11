/**
 * Resend Email Verification API Route
 * Allows users to request a new verification email
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

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 3; // 3 requests per 10 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email address is required' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const clientId = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || email;
    const now = Date.now();
    const rateLimit = rateLimitMap.get(clientId);

    if (rateLimit) {
      if (now < rateLimit.resetAt) {
        if (rateLimit.count >= MAX_REQUESTS) {
          const remainingTime = Math.ceil((rateLimit.resetAt - now) / 1000 / 60);
          return NextResponse.json(
            {
              success: false,
              message: `Too many requests. Please try again in ${remainingTime} minutes.`,
            },
            { status: 429 }
          );
        }
        rateLimit.count++;
      } else {
        // Reset window
        rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
      }
    } else {
      rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    }

    // Get request context for audit logging
    const context = {
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    };

    // Resend verification email
    await authService.resendVerificationEmail(email.toLowerCase(), context);

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error: any) {
    // Handle known auth errors
    if (error === AuthErrors.ALREADY_VERIFIED) {
      return NextResponse.json(
        { success: false, message: 'Email is already verified' },
        { status: 400 }
      );
    }

    // Silent fail for non-existent users (security best practice)
    // Return success even if user doesn't exist to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account exists with that email, a verification link has been sent.',
    });
  }
}
