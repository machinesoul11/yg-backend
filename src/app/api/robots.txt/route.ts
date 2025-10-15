/**
 * Robots.txt Dynamic Generation API
 * 
 * GET /api/robots.txt - Generate robots.txt content based on database configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Get the base URL from environment or request headers
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

    // Get all active robots configuration rules ordered by priority
    const robotsRules = await prisma.robotsConfig.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { priority: 'asc' },
        { userAgent: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Generate robots.txt content
    const robotsContent = generateRobotsContent(robotsRules, baseUrl);

    // Return text response with appropriate headers
    return new NextResponse(robotsContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Error generating robots.txt:', error);
    
    // Return a basic fallback robots.txt in case of error
    const fallbackContent = generateFallbackRobots();
    
    return new NextResponse(fallbackContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes on error
      },
    });
  }
}

/**
 * OPTIONS /api/robots.txt
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
 * Generate robots.txt content from database configuration
 */
function generateRobotsContent(
  rules: Array<{
    userAgent: string;
    directiveType: string;
    path: string | null;
    value: string | null;
  }>,
  baseUrl: string
): string {
  const lines: string[] = [];
  let currentUserAgent = '';

  // Group rules by user agent and process them
  for (const rule of rules) {
    // Add User-agent line when it changes
    if (rule.userAgent !== currentUserAgent) {
      if (currentUserAgent !== '') {
        lines.push(''); // Add blank line between user agent blocks
      }
      lines.push(`User-agent: ${rule.userAgent}`);
      currentUserAgent = rule.userAgent;
    }

    // Add the appropriate directive
    switch (rule.directiveType) {
      case 'allow':
        if (rule.path) {
          lines.push(`Allow: ${rule.path}`);
        }
        break;
      
      case 'disallow':
        if (rule.path) {
          lines.push(`Disallow: ${rule.path}`);
        }
        break;
      
      case 'crawl-delay':
        if (rule.value) {
          lines.push(`Crawl-delay: ${rule.value}`);
        }
        break;
      
      case 'sitemap':
        if (rule.value) {
          // Handle both relative and absolute sitemap URLs
          const sitemapUrl = rule.value.startsWith('http') 
            ? rule.value 
            : `${baseUrl}${rule.value.startsWith('/') ? '' : '/'}${rule.value}`;
          lines.push(`Sitemap: ${sitemapUrl}`);
        }
        break;
      
      case 'host':
        if (rule.value) {
          lines.push(`Host: ${rule.value}`);
        }
        break;
    }
  }

  // Add a final blank line
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate fallback robots.txt content when database is unavailable
 */
function generateFallbackRobots(): string {
  return `User-agent: *
Disallow: /admin/
Disallow: /portal/
Disallow: /api/

Sitemap: ${process.env.FRONTEND_URL || 'https://yesgoddess.agency'}/api/blog/sitemap.xml
`;
}
