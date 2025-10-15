/**
 * SEO Management API Routes
 * Admin endpoints for managing SEO features
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SEOIntegrationService } from '@/modules/seo/services/seo-integration.service';

/**
 * POST /api/admin/seo/submit-sitemap - Manually submit sitemap to search engines
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

    const seoService = new SEOIntegrationService(prisma);
    
    // Submit sitemap
    await seoService.submitSitemap();
    
    return NextResponse.json({
      success: true,
      message: 'Sitemap submitted successfully to search engines',
      sitemapUrl: seoService.getSitemapUrl(),
    });

  } catch (error) {
    console.error('Sitemap submission error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to submit sitemap'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/seo/stats - Get SEO statistics
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const seoService = new SEOIntegrationService(prisma);
    
    // Get redirect statistics
    const redirectStats = await seoService.getRedirectStats();
    
    // Get robots.txt configuration count
    const robotsCount = await prisma.robotsConfig.count({
      where: { isActive: true }
    });

    // Get published posts count for sitemap
    const publishedPostsCount = await prisma.post.count({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        sitemap: {
          url: seoService.getSitemapUrl(),
          publishedPosts: publishedPostsCount,
        },
        redirects: redirectStats,
        robotsConfig: {
          activeRules: robotsCount,
        },
      },
    });

  } catch (error) {
    console.error('SEO stats error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get SEO stats'
      },
      { status: 500 }
    );
  }
}
