/**
 * Lightweight Blog Redirect Middleware for Edge Runtime
 * Uses fetch to external API instead of Prisma to stay under 1MB limit
 */

import { NextRequest, NextResponse } from 'next/server';

interface RedirectResponse {
  found: boolean;
  destinationPath?: string;
  redirectType?: number;
  redirectId?: string;
}

/**
 * Check and handle blog redirects using API endpoint
 * This is a lightweight version for Edge Functions
 */
export async function handleBlogRedirects(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  // Only handle blog-related paths
  if (!pathname.startsWith('/blog/')) {
    return null;
  }

  try {
    // Call internal API endpoint to check for redirects
    const apiUrl = new URL('/api/redirects/lookup', req.url);
    apiUrl.searchParams.set('path', pathname);

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Pass along some headers but keep it minimal
        'User-Agent': req.headers.get('User-Agent') || 'Edge-Middleware',
      },
    });

    if (!response.ok) {
      console.error('Redirect lookup API error:', response.status);
      return null;
    }

    const redirectResult: RedirectResponse = await response.json();

    if (redirectResult.found && redirectResult.destinationPath) {
      // Track the redirect hit asynchronously via API
      if (redirectResult.redirectId) {
        // Fire and forget - don't await
        fetch(new URL('/api/redirects/track', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectId: redirectResult.redirectId }),
        }).catch(error => {
          console.error('Failed to track redirect hit:', error);
        });
      }

      // Create the redirect response
      const redirectType = redirectResult.redirectType || 301;
      const destination = new URL(redirectResult.destinationPath, req.url);
      
      // Preserve query parameters
      destination.search = req.nextUrl.search;

      console.log(`Redirecting ${pathname} → ${redirectResult.destinationPath} (${redirectType})`);

      return NextResponse.redirect(destination, { status: redirectType });
    }

    return null; // No redirect found
  } catch (error) {
    console.error('Error in blog redirect middleware:', error);
    return null; // Continue to next middleware on error
  }
}
