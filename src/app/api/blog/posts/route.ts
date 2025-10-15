/**
 * Public Blog Posts API
 * 
 * GET /api/blog/posts - Public listing of published blog posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BlogService } from '@/modules/blog/services/blog.service';
import { prisma } from '@/lib/db';

const blogService = new BlogService(prisma);

// Query parameter validation schema
const querySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => {
    const parsed = val ? parseInt(val, 10) : 10;
    return Math.min(parsed, 50); // Maximum 50 posts per page
  }),
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'popular', 'featured']).optional().default('newest'),
});

export async function GET(req: NextRequest) {
  try {
    // Parse and validate query parameters
    const { searchParams } = req.nextUrl;
    const rawParams = Object.fromEntries(searchParams.entries());
    
    const params = querySchema.parse(rawParams);

    // Build filters for published posts only
    const filters: any = {
      status: 'PUBLISHED',
      published: true,
    };

    // Add category filter if provided
    if (params.category) {
      // First get the category by slug
      const category = await prisma.category.findUnique({
        where: { slug: params.category, isActive: true },
        select: { id: true },
      });
      
      if (category) {
        filters.categoryId = category.id;
      } else {
        // Return empty results if category doesn't exist
        return NextResponse.json({
          data: [],
          pagination: {
            current_page: params.page,
            total_pages: 0,
            total_posts: 0,
            page_size: params.limit,
            has_next_page: false,
            has_previous_page: false,
          },
          filters: {
            category: params.category,
            tag: params.tag,
            search: params.search,
            sort: params.sort,
          },
        });
      }
    }

    // Add tag filter if provided
    if (params.tag) {
      filters.tags = [params.tag];
    }

    // Add search filter if provided
    if (params.search) {
      filters.search = params.search;
    }

    // Add date filter to only show posts with publishedAt in the past
    filters.dateRange = {
      end: new Date().toISOString(),
    };

    // Determine sort order
    let sortBy: 'publishedAt' | 'viewCount' | 'title' | 'createdAt' | 'updatedAt' = 'publishedAt';
    let sortOrder: 'asc' | 'desc' = 'desc';

    switch (params.sort) {
      case 'oldest':
        sortBy = 'publishedAt';
        sortOrder = 'asc';
        break;
      case 'popular':
        sortBy = 'viewCount';
        sortOrder = 'desc';
        break;
      case 'featured':
        // For featured, we'll handle this separately
        break;
      case 'newest':
      default:
        sortBy = 'publishedAt';
        sortOrder = 'desc';
        break;
    }

    // Get posts using the blog service
    const result = await blogService.getPosts({
      filters,
      sortBy,
      sortOrder,
      page: params.page,
      limit: params.limit,
      includeRevisions: false,
    });

    // Transform posts for public API response
    const publicPosts = result.posts.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      featured_image_url: post.featuredImageUrl,
      published_at: post.publishedAt?.toISOString(),
      read_time_minutes: post.readTimeMinutes,
      view_count: post.viewCount,
      is_featured: post.isFeatured,
      tags: post.tags,
      author: post.author ? {
        name: post.author.name,
        avatar: post.author.avatar,
      } : null,
      category: post.category ? {
        name: post.category.name,
        slug: post.category.slug,
      } : null,
    }));

    // If sorting by featured, prioritize featured posts
    const sortedPosts = params.sort === 'featured' 
      ? [...publicPosts.filter(p => p.is_featured), ...publicPosts.filter(p => !p.is_featured)]
      : publicPosts;

    // Build response
    const response = {
      data: sortedPosts,
      pagination: {
        current_page: result.page,
        total_pages: result.totalPages,
        total_posts: result.total,
        page_size: result.limit,
        has_next_page: result.page < result.totalPages,
        has_previous_page: result.page > 1,
      },
      filters: {
        category: params.category,
        tag: params.tag,
        search: params.search,
        sort: params.sort,
      },
    };

    // Set caching headers - cache for 5 minutes
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Error fetching blog posts:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters', 
          details: error.issues 
        },
        { status: 400 }
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
 * OPTIONS /api/blog/posts
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
