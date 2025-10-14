/**
 * Login API Route
 * REST API endpoint for frontend authentication
 * 
 * This is separate from the NextAuth credentials provider which is used
 * for backend admin authentication at ops.yesgoddess.agency
 * 
 * This endpoint is called by the frontend (yesgoddess.agency) to authenticate
 * creators and brands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth.service';
import { emailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';
import { AuthErrors } from '@/lib/errors/auth.errors';
import { z } from 'zod';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5; // 5 requests per 15 minutes per IP

/**
 * Check rate limit for IP address
 */
function checkRateLimit(ipAddress: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ipAddress);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ipAddress, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

// Timeout helper to prevent hanging requests in serverless
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * POST /api/auth/login
 * Authenticate user and return user data
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[Login] Request received');
  
  try {
    // Get client IP for rate limiting and audit
    const ipAddress = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Check rate limit
    if (!checkRateLimit(ipAddress)) {
      console.log('[Login] Rate limit exceeded for IP:', ipAddress);
      return NextResponse.json(
        { 
          success: false, 
          message: 'Too many login attempts. Please try again in 15 minutes.' 
        },
        { status: 429 }
      );
    }

    // Parse and validate request body
    console.log('[Login] Parsing request body');
    const body = await req.json();
    const validatedData = loginSchema.parse(body);
    console.log('[Login] Validated data for email:', validatedData.email);

    // Attempt login with 15 second timeout (serverless functions have limited execution time)
    console.log('[Login] Calling authService.loginUser');
    const result = await withTimeout(
      authService.loginUser(
        {
          email: validatedData.email,
          password: validatedData.password,
          rememberMe: validatedData.rememberMe,
        },
        {
          ipAddress,
          userAgent,
        }
      ),
      15000,
      'Login request timed out after 15 seconds'
    );

    const duration = Date.now() - startTime;
    console.log(`[Login] Success for ${validatedData.email} in ${duration}ms`);

    // Return success response with CORS headers
    return NextResponse.json(
      {
        success: true,
        data: {
          user: result.user,
        },
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
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Validation error',
          errors: error.issues,
        },
        { status: 400 }
      );
    }

    // Handle authentication errors
    if (error === AuthErrors.INVALID_CREDENTIALS) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
        { status: 401 }
      );
    }

    if (error === AuthErrors.ACCOUNT_LOCKED) {
      return NextResponse.json(
        {
          success: false,
          message: 'Account is locked due to too many failed login attempts. Please try again later or reset your password.',
          code: 'ACCOUNT_LOCKED',
        },
        { status: 423 }
      );
    }

    if (error === AuthErrors.ACCOUNT_DELETED) {
      return NextResponse.json(
        {
          success: false,
          message: 'This account has been deleted',
          code: 'ACCOUNT_DELETED',
        },
        { status: 403 }
      );
    }

    // Log unexpected errors
    const duration = Date.now() - startTime;
    console.error(`[Login] Error after ${duration}ms:`, error);

    return NextResponse.json(
      {
        success: false,
        message: 'Login failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/login
 * Handle CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://www.yesgoddess.agency',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    }
  );
}
