/**
 * Public Blog Post by Slug API
 * 
 * GET /api/blog/posts/[slug] - Get a single published blog post by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { BlogService } from '@/modules/blog/services/blog.service';
import { PostNotFoundError } from '@/modules/blog/errors/blog.errors';
import { prisma } from '@/lib/db';

const blogService = new BlogService(prisma);

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Post slug is required' 
        },
        { status: 400 }
      );
    }

    // Get the post by slug
    const post = await blogService.getPostBySlug(slug, {
      includeRevisions: false,
      incrementViews: true, // Increment view count for public access
    });

    // Check if post is published and should be publicly accessible
    if (post.status !== 'PUBLISHED' || !post.publishedAt || post.publishedAt > new Date()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Post not found' 
        },
        { status: 404 }
      );
    }

    // Get related posts (same category or shared tags)
    const relatedPosts = await getRelatedPosts(post.id, post.categoryId, post.tags);

    // Transform post for public API response
    const publicPost = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      featured_image_url: post.featuredImageUrl,
      published_at: post.publishedAt.toISOString(),
      read_time_minutes: post.readTimeMinutes,
      view_count: post.viewCount,
      is_featured: post.isFeatured,
      tags: post.tags,
      author: post.author ? {
        id: post.author.id,
        name: post.author.name,
        avatar: post.author.avatar,
      } : null,
      category: post.category ? {
        id: post.category.id,
        name: post.category.name,
        slug: post.category.slug,
        description: post.category.description,
      } : null,
      seo: {
        title: post.seoTitle || post.title,
        description: post.seoDescription || post.excerpt,
        keywords: post.seoKeywords,
      },
      related_posts: relatedPosts,
    };

    // Set caching headers - cache for 30 minutes
    const response = NextResponse.json({ 
      success: true, 
      data: publicPost 
    }, {
      headers: {
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        'Content-Type': 'application/json',
        'ETag': `"${post.updatedAt.getTime()}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

    return response;

  } catch (error) {
    console.error('Error fetching blog post:', error);

    // Handle post not found error
    if (error instanceof PostNotFoundError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Post not found' 
        },
        { status: 404 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/blog/posts/[slug]
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Get related posts based on category and tags
 */
async function getRelatedPosts(
  currentPostId: string, 
  categoryId: string | null, 
  tags: string[]
): Promise<Array<{
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  published_at: string;
}>> {
  try {
    // Build query to find related posts
    const where: any = {
      id: { not: currentPostId },
      status: 'PUBLISHED',
      publishedAt: { lte: new Date() },
      deletedAt: null,
    };

    // Add filters for category or tags
    const orConditions = [];
    
    if (categoryId) {
      orConditions.push({ categoryId });
    }
    
    if (tags.length > 0) {
      orConditions.push({
        tags: {
          array_contains: tags,
        },
      });
    }

    if (orConditions.length > 0) {
      where.OR = orConditions;
    }

    const relatedPosts = await prisma.post.findMany({
      where,
      orderBy: [
        { publishedAt: 'desc' },
      ],
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        featuredImageUrl: true,
        publishedAt: true,
      },
    });

    return relatedPosts.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      featured_image_url: post.featuredImageUrl,
      published_at: post.publishedAt!.toISOString(),
    }));

  } catch (error) {
    console.error('Error fetching related posts:', error);
    return [];
  }
}
