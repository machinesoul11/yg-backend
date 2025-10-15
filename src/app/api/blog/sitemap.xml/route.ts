/**
 * Blog Sitemap XML API
 * 
 * GET /api/blog/sitemap.xml - Generate XML sitemap for published blog posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Get the base URL from environment or request headers
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

    // Get all published posts
    const posts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { lte: new Date() },
        deletedAt: null,
      },
      select: {
        slug: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    // Get all active categories
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    // Generate XML sitemap
    const sitemap = generateSitemap(baseUrl, posts, categories);

    // Return XML response with appropriate headers
    return new NextResponse(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=172800', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Robots-Tag': 'noindex', // Don't index the sitemap itself
      },
    });

  } catch (error) {
    console.error('Error generating sitemap:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate sitemap' 
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/blog/sitemap.xml
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
 * Generate XML sitemap content
 */
function generateSitemap(
  baseUrl: string,
  posts: Array<{ slug: string; publishedAt: Date | null; updatedAt: Date }>,
  categories: Array<{ slug: string; updatedAt: Date }>
): string {
  const urlEntries: string[] = [];

  // Add blog homepage
  urlEntries.push(`
  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`);

  // Add individual blog posts
  posts.forEach(post => {
    const lastmod = (post.publishedAt || post.updatedAt).toISOString().split('T')[0];
    urlEntries.push(`
  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
  });

  // Add category pages
  categories.forEach(category => {
    const lastmod = category.updatedAt.toISOString().split('T')[0];
    urlEntries.push(`
  <url>
    <loc>${baseUrl}/blog/category/${category.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`);
  });

  // Construct the complete sitemap XML
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('')}
</urlset>`;
}
