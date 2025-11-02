/**
 * Next.js Middleware
 * Handles authentication, authorization, CORS, and blog redirects
 * Optimized for Edge Runtime to stay under 1MB limit
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { handleBlogRedirects } from '@/middleware/blog-redirect-edge';

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Handle CORS for API routes
    const response = NextResponse.next();
    
    if (path.startsWith('/api/')) {
      const origin = req.headers.get('origin');
      const allowedOrigins = [
        'https://www.yesgoddess.agency',
        'https://yesgoddess.agency',
        process.env.FRONTEND_URL,
        process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
      ].filter(Boolean) as string[];
      
      if (origin && allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return new NextResponse(null, { 
          status: 200, 
          headers: response.headers 
        });
      }
    }

    // Handle blog redirects first (for public routes)
    try {
      const redirectResponse = await handleBlogRedirects(req);
      if (redirectResponse) {
        return redirectResponse;
      }
    } catch (error) {
      console.error('Blog redirect middleware error:', error);
      // Continue with normal flow on error
    }

    // Check email verification for protected routes (except admin)
    // Admin users may need access even without verified email
    const requiresVerification = path.startsWith('/portal/creator') || path.startsWith('/portal/brand');
    
    if (requiresVerification && token && !token.emailVerified) {
      // Redirect to verification pending page
      return NextResponse.redirect(new URL('/auth/verification-required', req.url));
    }

    // Admin routes - require ADMIN role AND @yesgoddess.agency email domain
    if (path.startsWith('/portal/admin')) {
      if (token?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
      
      // Additional security: Only allow @yesgoddess.agency domain for admin access
      const email = token?.email as string;
      const emailDomain = email?.split('@')[1];
      if (emailDomain !== 'yesgoddess.agency') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    // Creator routes - require CREATOR role
    if (path.startsWith('/portal/creator')) {
      if (token?.role !== 'CREATOR') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    // Brand routes - require BRAND role
    if (path.startsWith('/portal/brand')) {
      if (token?.role !== 'BRAND') {
        return NextResponse.redirect(new URL('/auth/error?error=AccessDenied', req.url));
      }
    }

    return response;
  },
  {
    callbacks: {
      // Return true to allow access to route
      authorized: ({ token, req }) => {
        // Allow public blog routes (they may have redirects)
        if (req.nextUrl.pathname.startsWith('/blog')) {
          return true;
        }
        // Require token for protected routes
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
  }
);

// Specify which routes this middleware should run on
export const config = {
  matcher: [
    // Admin routes
    '/portal/admin/:path*',
    
    // Creator routes
    '/portal/creator/:path*',
    
    // Brand routes
    '/portal/brand/:path*',
    
    // Blog routes (for redirect handling)
    '/blog/:path*',
    
    // Note: tRPC API routes handle their own authentication via context
    // Do not include /api/trpc here as it causes CORS preflight issues
  ],
};
