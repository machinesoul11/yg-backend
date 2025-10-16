/**
 * API endpoint for redirect lookup
 * Called by Edge middleware to check for blog redirects
 */

import { NextRequest, NextResponse } from 'next/server';
import { BlogRedirectService } from '@/modules/seo/services/blog-redirect.service';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'Path parameter required' }, { status: 400 });
    }

    const redirectService = new BlogRedirectService(prisma);
    const redirectResult = await redirectService.lookupRedirect(path);

    return NextResponse.json({
      found: redirectResult.found,
      destinationPath: redirectResult.destinationPath,
      redirectType: redirectResult.redirectType,
      redirectId: redirectResult.redirectId,
    });
  } catch (error) {
    console.error('Redirect lookup error:', error);
    return NextResponse.json({ 
      found: false,
      error: 'Failed to lookup redirect' 
    }, { status: 500 });
  }
}
