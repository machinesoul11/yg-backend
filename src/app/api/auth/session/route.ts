/**
 * GET /api/auth/session
 * Verify session token and return authenticated user data
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

/**
 * Extract session token from Authorization header or cookie
 */
async function extractSessionToken(req: NextRequest): Promise<string | null> {
  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token');
  if (sessionToken) {
    return sessionToken.value;
  }

  return null;
}

/**
 * GET /api/auth/session
 * Verify the session token and return user data
 */
export async function GET(req: NextRequest) {
  try {
    console.log('[Session GET] Request received');
    
    // Get all cookies for debugging
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    console.log('[Session GET] All cookies:', allCookies.map(c => c.name));
    console.log('[Session GET] Cookie header:', req.headers.get('cookie'));
    console.log('[Session GET] Authorization header:', req.headers.get('authorization'));

    const sessionToken = await extractSessionToken(req);

    if (!sessionToken) {
      console.log('[Session GET] No session token found');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'No session token provided',
            debug: {
              hasCookies: allCookies.length > 0,
              cookieNames: allCookies.map(c => c.name),
              hasCookieHeader: !!req.headers.get('cookie'),
              hasAuthHeader: !!req.headers.get('authorization'),
            },
          },
        },
        { status: 401 }
      );
    }

    console.log('[Session GET] Session token found:', sessionToken.substring(0, 10) + '...');

    // Find session in database
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            email_verified: true,
            phone_verified: true,
            two_factor_enabled: true,
            preferred_2fa_method: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!session) {
      console.log('[Session GET] Session not found in database');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_SESSION',
            message: 'Session not found',
          },
        },
        { status: 401 }
      );
    }

    // Check if session has expired
    if (session.expires < new Date()) {
      console.log('[Session GET] Session has expired');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPIRED_SESSION',
            message: 'Session has expired',
          },
        },
        { status: 401 }
      );
    }

    // Check if session has been revoked
    if (session.revokedAt) {
      console.log('[Session GET] Session has been revoked');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REVOKED_SESSION',
            message: 'Session has been revoked',
          },
        },
        { status: 401 }
      );
    }

    // Update last activity timestamp (non-blocking)
    prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    }).catch((err) => {
      console.error('[Session GET] Failed to update last activity:', err);
    });

    console.log('[Session GET] ✅ Valid session for user:', session.user.email);

    // Return session and user data
    return NextResponse.json(
      {
        success: true,
        data: {
          session: {
            id: session.id,
            sessionToken: session.sessionToken,
            expiresAt: session.expires,
            lastActivityAt: session.lastActivityAt,
            deviceName: session.deviceName,
          },
          user: session.user,
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
    console.error('[Session GET] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify session',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/session
 * Handle CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://www.yesgoddess.agency',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    }
  );
}
