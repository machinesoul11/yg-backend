/**
 * Session Debug Endpoint
 * Use this to verify session cookies are working correctly
 * 
 * Access: GET /api/debug/session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // Only allow in development or with special header for security
  const isDev = process.env.NODE_ENV === 'development';
  const hasDebugHeader = req.headers.get('x-debug-secret') === process.env.DEBUG_SECRET;
  
  if (!isDev && !hasDebugHeader) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  try {
    const session = await getServerSession(authOptions);
    
    // Get cookies for debugging
    const cookies = req.cookies.getAll();
    const authCookies = cookies.filter(c => c.name.includes('next-auth'));
    
    return NextResponse.json({
      status: 'ok',
      hasSession: !!session,
      session: session ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
        },
        expires: session.expires,
      } : null,
      cookies: authCookies.map(c => ({
        name: c.name,
        hasValue: !!c.value,
        valueLength: c.value.length,
      })),
      env: {
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        NODE_ENV: process.env.NODE_ENV,
        hasSecret: !!process.env.NEXTAUTH_SECRET,
        secretLength: process.env.NEXTAUTH_SECRET?.length,
      },
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Session Debug] Error:', error);
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, {
      status: 500,
    });
  }
}
