/**
 * Blog Analytics API Routes
 * GET /api/blog/analytics/performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions (admin or content manager)
    if (!['ADMIN', 'CONTENT_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'views';
    const order = searchParams.get('order') || 'desc';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const dateRange = searchParams.get('dateRange');
    const categoryId = searchParams.get('categoryId');
    const authorId = searchParams.get('authorId');

    // Build where clause
    const where: any = {
      status: 'PUBLISHED',
      deletedAt: null,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (authorId) {
      where.authorId = authorId;
    }

    if (dateRange) {
      const [start, end] = dateRange.split(',');
      if (start && end) {
        where.publishedAt = {
          gte: new Date(start),
          lte: new Date(end),
        };
      }
    }

    // Build order by clause
    const orderBy: any = {};
    switch (sortBy) {
      case 'views':
        orderBy.viewCount = order;
        break;
      case 'readTime':
        orderBy.readTimeMinutes = order;
        break;
      case 'publishedAt':
        orderBy.publishedAt = order;
        break;
      default:
        orderBy.viewCount = 'desc';
    }

    // Get posts with basic metrics
    const posts = await prisma.post.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        viewCount: true,
        readTimeMinutes: true,
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

    // Get total count for pagination
    const totalCount = await prisma.post.count({ where });

    // For each post, calculate additional metrics from events
    const performanceData = posts.map((post) => {
      return {
        postId: post.id,
        title: post.title,
        slug: post.slug,
        publishedAt: post.publishedAt,
        author: post.author,
        category: post.category,
        metrics: {
          totalViews: post.viewCount,
          uniqueVisitors: 0, // Will be calculated in background job
          avgReadTimeSeconds: post.readTimeMinutes * 60, // Convert to seconds
          estimatedReadTimeMinutes: post.readTimeMinutes,
          socialSharesCount: 0, // Will be tracked via events
          emailCaptureCount: 0, // Will be tracked via events
          emailCaptureRate: 0, // Will be calculated
          bounceRate: 0, // Will be calculated in background job
        },
      };
    });

    return NextResponse.json({
      posts: performanceData,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching blog performance data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
