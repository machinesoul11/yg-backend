/**
 * SEO Redirect Cleanup API
 * Admin endpoint for cleaning up old redirects
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SEOIntegrationService } from '@/modules/seo/services/seo-integration.service';

/**
 * POST /api/admin/seo/cleanup-redirects - Clean up old redirects
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { 
      olderThanDays = 365, 
      maxHitCount = 0, 
      dryRun = false 
    } = body;

    const seoService = new SEOIntegrationService(prisma);
    
    // Clean up old redirects
    await seoService.cleanupOldRedirects({
      olderThanDays,
      maxHitCount,
      dryRun,
    });
    
    return NextResponse.json({
      success: true,
      message: dryRun 
        ? 'Redirect cleanup preview completed'
        : 'Old redirects cleaned up successfully',
      parameters: {
        olderThanDays,
        maxHitCount,
        dryRun,
      },
    });

  } catch (error) {
    console.error('Redirect cleanup error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to cleanup redirects'
      },
      { status: 500 }
    );
  }
}
