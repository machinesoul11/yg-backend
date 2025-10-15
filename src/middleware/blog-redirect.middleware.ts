/**
 * Blog Redirect Middleware
 * Handles 301 redirects for blog post slug changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { BlogRedirectService } from '@/modules/seo/services/blog-redirect.service';
import { prisma } from '@/lib/db';

/**
 * Check and handle blog redirects
 * This function should be called from the main middleware
 */
export async function handleBlogRedirects(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  // Only handle blog-related paths
  if (!pathname.startsWith('/blog/')) {
    return null;
  }

  try {
    const redirectService = new BlogRedirectService(prisma);
    const redirectResult = await redirectService.lookupRedirect(pathname);

    if (redirectResult.found && redirectResult.destinationPath) {
      // Track the redirect hit asynchronously
      if (redirectResult.shouldTrackHit && redirectResult.redirectId) {
        // Fire and forget - don't await
        redirectService.trackRedirectHit(redirectResult.redirectId).catch(error => {
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

/**
 * Create redirect for slug change (to be called when updating post slugs)
 */
export async function createSlugRedirect(
  oldSlug: string,
  newSlug: string,
  userId: string
): Promise<void> {
  try {
    const redirectService = new BlogRedirectService(prisma);
    await redirectService.createSlugChangeRedirect(oldSlug, newSlug, userId);
  } catch (error) {
    console.error('Failed to create slug redirect:', error);
    // Don't throw as this shouldn't block the post update
  }
}
