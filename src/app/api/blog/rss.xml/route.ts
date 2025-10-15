/**
 * Blog RSS Feed API
 * 
 * GET /api/blog/rss.xml - Generate RSS 2.0 feed for published blog posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Get the base URL from environment or request headers
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

    // Get recent published posts for RSS feed (limit to 50 most recent)
    const posts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { lte: new Date() },
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 50, // Limit to 50 most recent posts
    });

    // Generate RSS XML
    const rssXml = generateRssFeed(baseUrl, posts);

    // Return XML response with appropriate headers
    return new NextResponse(rssXml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=7200, stale-while-revalidate=14400', // Cache for 2 hours
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Error generating RSS feed:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate RSS feed' 
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/blog/rss.xml
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
 * Generate RSS 2.0 feed XML content
 */
function generateRssFeed(
  baseUrl: string,
  posts: Array<{
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
    tags: any;
    author: { name: string | null; email: string } | null;
    category: { name: string; slug: string } | null;
  }>
): string {
  // Blog metadata
  const blogTitle = "YES GODDESS Blog";
  const blogDescription = "Latest insights, updates, and stories from YES GODDESS - empowering creators and brands in the digital space.";
  const blogLanguage = "en-us";
  const managingEditor = "hello@yesgoddess.agency (YES GODDESS Team)";
  const webMaster = "tech@yesgoddess.agency (YES GODDESS Tech Team)";
  
  // Get latest post date for channel pubDate and lastBuildDate
  const latestPostDate = posts[0]?.publishedAt || new Date();
  const pubDate = formatRssDate(latestPostDate);
  const lastBuildDate = formatRssDate(new Date());

  // Generate RSS items
  const rssItems = posts.map(post => {
    const postUrl = `${baseUrl}/blog/${post.slug}`;
    const postPubDate = formatRssDate(post.publishedAt || post.updatedAt);
    
    // Escape HTML content for XML
    const title = escapeXml(post.title);
    const description = escapeXml(post.excerpt || extractExcerpt(post.content));
    const content = escapeXml(post.content);
    
    // Author information
    const authorEmail = post.author?.email || managingEditor;
    const authorName = post.author?.name || "YES GODDESS Team";
    
    // Categories and tags
    const categories = [];
    if (post.category) {
      categories.push(`<category>${escapeXml(post.category.name)}</category>`);
    }
    
    // Add tags as categories
    const tags = Array.isArray(post.tags) ? post.tags : [];
    tags.forEach((tag: string) => {
      categories.push(`<category>${escapeXml(tag)}</category>`);
    });

    return `
    <item>
      <title>${title}</title>
      <link>${postUrl}</link>
      <description>${description}</description>
      <content:encoded><![CDATA[${post.content}]]></content:encoded>
      <author>${authorEmail} (${escapeXml(authorName)})</author>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${postPubDate}</pubDate>
      ${categories.join('\n      ')}
    </item>`;
  });

  // Construct the complete RSS XML
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${blogTitle}</title>
    <link>${baseUrl}/blog</link>
    <description>${blogDescription}</description>
    <language>${blogLanguage}</language>
    <copyright>© ${new Date().getFullYear()} YES GODDESS. All rights reserved.</copyright>
    <managingEditor>${managingEditor}</managingEditor>
    <webMaster>${webMaster}</webMaster>
    <pubDate>${pubDate}</pubDate>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>YES GODDESS Blog System</generator>
    <ttl>120</ttl>
    <image>
      <url>${baseUrl}/logo/yg-logo.png</url>
      <title>${blogTitle}</title>
      <link>${baseUrl}/blog</link>
      <width>144</width>
      <height>144</height>
    </image>
${rssItems.join('')}
  </channel>
</rss>`;
}

/**
 * Format date for RSS (RFC 822 format)
 */
function formatRssDate(date: Date): string {
  return date.toUTCString();
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract excerpt from content if not provided
 */
function extractExcerpt(content: string, maxLength: number = 300): string {
  // Strip HTML tags and get plain text
  const plainText = content.replace(/<[^>]*>/g, '').trim();
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  // Truncate at word boundary
  const truncated = plainText.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}
