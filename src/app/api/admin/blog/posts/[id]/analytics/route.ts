/**
 * Individual Post Analytics API Route
 * GET /api/admin/blog/posts/[id]/analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: postId } = params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get post details
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        viewCount: true,
        readTimeMinutes: true,
        status: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Check permissions - can view own posts or if admin/content manager
    if (
      post.author.id !== session.user.id &&
      !['ADMIN', 'CONTENT_MANAGER'].includes(session.user.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get basic analytics with placeholders for now
    const analytics = {
      postId: post.id,
      title: post.title,
      slug: post.slug,
      publishedAt: post.publishedAt,
      author: post.author,
      category: post.category,
      metrics: {
        totalViews: post.viewCount,
        uniqueVisitors: Math.floor(post.viewCount * 0.7), // Estimated
        avgReadTimeSeconds: post.readTimeMinutes * 60 * 0.8, // Estimated
        estimatedReadTimeMinutes: post.readTimeMinutes,
        bounceRate: 45.5, // Average bounce rate placeholder
        socialSharesCount: 0,
        emailCaptureCount: 0,
        emailCaptureRate: 0,
      },
      socialShareBreakdown: [
        { platform: 'twitter', shareCount: 0, lastSharedAt: null },
        { platform: 'facebook', shareCount: 0, lastSharedAt: null },
        { platform: 'linkedin', shareCount: 0, lastSharedAt: null },
      ],
      referrerSources: [
        { source: 'direct', category: 'direct', visitors: Math.floor(post.viewCount * 0.3), percentage: 30 },
        { source: 'google search', category: 'organic', visitors: Math.floor(post.viewCount * 0.4), percentage: 40 },
        { source: 'social media', category: 'social', visitors: Math.floor(post.viewCount * 0.2), percentage: 20 },
        { source: 'referral', category: 'referral', visitors: Math.floor(post.viewCount * 0.1), percentage: 10 },
      ],
      dailyTrend: generateDailyTrend(startDate, endDate, post.viewCount),
    };

    return NextResponse.json(analytics);

  } catch (error) {
    console.error('Error fetching post analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to generate sample daily trend data
function generateDailyTrend(startDate: Date, endDate: Date, totalViews: number) {
  const days = [];
  const currentDate = new Date(startDate);
  const dailyAverage = Math.floor(totalViews / 30); // Distribute views over 30 days
  
  while (currentDate <= endDate) {
    const variation = Math.random() * 0.6 + 0.7; // Random variation 70%-130%
    const dailyViews = Math.floor(dailyAverage * variation);
    
    days.push({
      date: currentDate.toISOString().split('T')[0],
      views: dailyViews,
      uniqueVisitors: Math.floor(dailyViews * 0.8),
      engagementTime: Math.floor(120 + Math.random() * 180), // 2-5 minutes
      bounceRate: Math.floor(40 + Math.random() * 20), // 40-60%
      emailCaptures: Math.floor(dailyViews * 0.02), // 2% conversion rate
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
}
