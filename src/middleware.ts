/**
 * Next.js Middleware
 * Handles authentication and authorization for protected routes
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Check email verification for protected routes (except admin)
    // Admin users may need access even without verified email
    const requiresVerification = path.startsWith('/creator') || path.startsWith('/brand');
    
    if (requiresVerification && token && !token.emailVerified) {
      // Redirect to verification pending page
      return NextResponse.redirect(new URL('/auth/verification-required', req.url));
    }

    // Admin routes - require ADMIN role
    if (path.startsWith('/admin')) {
      if (token?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    // Creator routes - require CREATOR role
    if (path.startsWith('/creator')) {
      if (token?.role !== 'CREATOR') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    // Brand routes - require BRAND role
    if (path.startsWith('/brand')) {
      if (token?.role !== 'BRAND') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true to allow access to route
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
  }
);

// Specify which routes require authentication
export const config = {
  matcher: [
    // Admin routes
    '/admin/:path*',
    
    // Creator routes
    '/creator/:path*',
    
    // Brand routes
    '/brand/:path*',
    
    // API routes (exclude auth routes)
    '/api/trpc/:path*',
  ],
};
