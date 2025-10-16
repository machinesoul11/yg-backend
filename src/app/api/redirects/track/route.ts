/**
 * API endpoint for tracking redirect hits
 * Called by Edge middleware to track redirect usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { BlogRedirectService } from '@/modules/seo/services/blog-redirect.service';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { redirectId } = await req.json();

    if (!redirectId) {
      return NextResponse.json({ error: 'Redirect ID required' }, { status: 400 });
    }

    const redirectService = new BlogRedirectService(prisma);
    await redirectService.trackRedirectHit(redirectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Redirect tracking error:', error);
    return NextResponse.json({ 
      error: 'Failed to track redirect' 
    }, { status: 500 });
  }
}
