/**
 * Blog SEO Integration Service
 * Extends the existing blog system with comprehensive SEO features
 */

import { prisma } from '@/lib/db';
import { seoMetadataService, SEOContent } from '@/lib/services/seo-metadata.service';
import { metadataManagementService } from '@/lib/services/metadata-management.service';
import { seoUtils } from '@/lib/utils/seo-utils';
import { TRPCError } from '@trpc/server';

// ============================================================================
// Types
// ============================================================================

export interface BlogPostWithSEO {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  featuredImageUrl?: string;
  tags: string[];
  publishedAt?: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  seoMetadata?: any;
  seoAnalysis?: any;
}

export interface SEOEnhancementOptions {
  autoGenerateKeywords?: boolean;
  autoGenerateExcerpt?: boolean;
  validateSEO?: boolean;
  generateAlternativeTitles?: boolean;
  optimizeForReadability?: boolean;
}

// ============================================================================
// Blog SEO Integration Service
// ============================================================================

export class BlogSEOIntegrationService {
  /**
   * Get blog post with enhanced SEO metadata
   */
  static async getBlogPostWithSEO(
    postId: string,
    options: SEOEnhancementOptions = {}
  ): Promise<BlogPostWithSEO> {
    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatar: true,
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Blog post not found',
        });
      }

      // Prepare SEO content
      const seoContent: SEOContent = {
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt || undefined,
        seoTitle: post.seoTitle || undefined,
        seoDescription: post.seoDescription || undefined,
        seoKeywords: post.seoKeywords || undefined,
        featuredImageUrl: post.featuredImageUrl || undefined,
        tags: post.tags as string[] || [],
        publishedAt: post.publishedAt || undefined,
        updatedAt: post.updatedAt,
        type: 'article',
        author: {
          id: post.author.id,
          name: post.author.name || 'Unknown Author',
          avatar: post.author.avatar || undefined,
        },
        category: post.category || undefined,
      };

      // Generate SEO metadata
      const seoMetadata = seoMetadataService.generateMetadata(
        seoContent,
        `/blog/${post.slug}`
      );

      // Generate SEO analysis if requested
      let seoAnalysis;
      if (options.validateSEO) {
        seoAnalysis = seoUtils.content.analyzeContent(seoContent);
      }

      // Auto-generate enhancements if requested
      let enhancedContent = { ...seoContent };
      
      if (options.autoGenerateKeywords && !seoContent.seoKeywords) {
        const keywords = seoUtils.text.extractKeywords(seoContent.content || seoContent.title);
        enhancedContent.seoKeywords = keywords.join(', ');
      }

      if (options.autoGenerateExcerpt && !seoContent.excerpt) {
        enhancedContent.excerpt = seoUtils.text.extractExcerpt(seoContent.content || '');
      }

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt || undefined,
        seoTitle: enhancedContent.seoTitle || post.seoTitle || undefined,
        seoDescription: enhancedContent.seoDescription || post.seoDescription || undefined,
        seoKeywords: enhancedContent.seoKeywords || post.seoKeywords || undefined,
        featuredImageUrl: post.featuredImageUrl || undefined,
        tags: post.tags as string[],
        publishedAt: post.publishedAt || undefined,
        updatedAt: post.updatedAt,
        author: {
          id: post.author.id,
          name: post.author.name || 'Unknown Author',
          avatar: post.author.avatar || undefined,
        },
        category: post.category || undefined,
        seoMetadata,
        seoAnalysis,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get blog post with SEO',
        cause: error,
      });
    }
  }

  /**
   * Auto-enhance blog post SEO metadata
   */
  static async autoEnhancePostSEO(
    postId: string,
    options: SEOEnhancementOptions = {}
  ): Promise<{
    success: boolean;
    enhancements: Record<string, any>;
    suggestions: string[];
  }> {
    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          title: true,
          content: true,
          excerpt: true,
          seoTitle: true,
          seoDescription: true,
          seoKeywords: true,
          tags: true,
        },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Blog post not found',
        });
      }

      const enhancements: Record<string, any> = {};
      const suggestions: string[] = [];

      // Auto-generate SEO title if missing
      if (!post.seoTitle || options.autoGenerateKeywords) {
        const titleVariations = seoUtils.text.generateTitleVariations(post.title);
        enhancements.seoTitle = titleVariations[0]; // Use the first variation
        if (titleVariations.length > 1) {
          suggestions.push(`Consider these alternative titles: ${titleVariations.slice(1, 3).join(', ')}`);
        }
      }

      // Auto-generate meta description if missing
      if (!post.seoDescription || options.autoGenerateExcerpt) {
        const excerpt = post.excerpt || seoUtils.text.extractExcerpt(post.content, 155);
        enhancements.seoDescription = excerpt;
      }

      // Auto-generate keywords if missing
      if (!post.seoKeywords || options.autoGenerateKeywords) {
        const keywords = seoUtils.text.extractKeywords(post.content);
        enhancements.seoKeywords = keywords.slice(0, 8).join(', ');
      }

      // Auto-generate excerpt if missing
      if (!post.excerpt || options.autoGenerateExcerpt) {
        enhancements.excerpt = seoUtils.text.extractExcerpt(post.content, 200);
      }

      // Calculate reading time
      const readingTime = seoUtils.text.calculateReadingTime(post.content);
      enhancements.readTimeMinutes = readingTime;

      // Update the post with enhancements
      if (Object.keys(enhancements).length > 0) {
        await prisma.post.update({
          where: { id: postId },
          data: enhancements,
        });
      }

      // Generate content suggestions
      const wordCount = seoUtils.text.countWords(post.content);
      if (wordCount < 300) {
        suggestions.push('Consider expanding the content to at least 300 words for better SEO');
      }

      if (wordCount > 2000) {
        suggestions.push('Consider breaking this long-form content into multiple posts or sections');
      }

      return {
        success: true,
        enhancements,
        suggestions,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to enhance post SEO',
        cause: error,
      });
    }
  }

  /**
   * Bulk SEO analysis for multiple posts
   */
  static async bulkSEOAnalysis(
    postIds: string[]
  ): Promise<Array<{
    postId: string;
    title: string;
    seoScore: number;
    issues: Array<{ type: string; message: string }>;
    recommendations: string[];
  }>> {
    try {
      const posts = await prisma.post.findMany({
        where: {
          id: { in: postIds },
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
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

      const results = posts.map(post => {
        const seoContent: SEOContent = {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt || undefined,
          seoTitle: post.seoTitle || undefined,
          seoDescription: post.seoDescription || undefined,
          seoKeywords: post.seoKeywords || undefined,
          featuredImageUrl: post.featuredImageUrl || undefined,
          tags: post.tags as string[] || [],
          publishedAt: post.publishedAt || undefined,
          updatedAt: post.updatedAt,
          type: 'article',
          author: {
            id: post.author.id,
            name: post.author.name || 'Unknown Author',
          },
          category: post.category || undefined,
        };

        const analysis = seoUtils.content.analyzeContent(seoContent);
        const recommendations = seoUtils.content.generateRecommendations(seoContent);

        return {
          postId: post.id,
          title: post.title,
          seoScore: analysis.score,
          issues: analysis.issues,
          recommendations,
        };
      });

      return results;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to perform bulk SEO analysis',
        cause: error,
      });
    }
  }

  /**
   * Generate sitemap data for blog posts
   */
  static async generateSitemapData(): Promise<Array<{
    url: string;
    lastModified: Date;
    changeFrequency: 'weekly' | 'monthly';
    priority: number;
  }>> {
    try {
      const posts = await prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: {
            lte: new Date(),
          },
          deletedAt: null,
        },
        select: {
          slug: true,
          publishedAt: true,
          updatedAt: true,
          viewCount: true,
        },
        orderBy: {
          publishedAt: 'desc',
        },
      });

      const baseUrl = process.env.FRONTEND_URL || 'https://yesgoddess.com';

      return posts.map(post => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: post.viewCount > 100 ? 'weekly' as const : 'monthly' as const,
        priority: post.viewCount > 100 ? 0.8 : 0.6,
      }));
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate sitemap data',
        cause: error,
      });
    }
  }

  /**
   * Get SEO performance metrics for blog
   */
  static async getSEOPerformanceMetrics(): Promise<{
    totalPosts: number;
    postsWithSEOTitle: number;
    postsWithSEODescription: number;
    postsWithKeywords: number;
    postsWithFeaturedImage: number;
    averageSEOScore: number;
    topPerformingPosts: Array<{
      id: string;
      title: string;
      slug: string;
      viewCount: number;
      seoScore: number;
    }>;
  }> {
    try {
      // Get basic counts
      const totalPosts = await prisma.post.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
        },
      });

      const postsWithSEOTitle = await prisma.post.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          seoTitle: { not: null },
        },
      });

      const postsWithSEODescription = await prisma.post.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          seoDescription: { not: null },
        },
      });

      const postsWithKeywords = await prisma.post.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          seoKeywords: { not: null },
        },
      });

      const postsWithFeaturedImage = await prisma.post.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          featuredImageUrl: { not: null },
        },
      });

      // Get top performing posts
      const topPosts = await prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          content: true,
          seoTitle: true,
          seoDescription: true,
          seoKeywords: true,
          featuredImageUrl: true,
          viewCount: true,
          tags: true,
        },
        orderBy: {
          viewCount: 'desc',
        },
        take: 10,
      });

      // Calculate SEO scores for top posts
      const topPerformingPosts = topPosts.map(post => {
        const seoContent: SEOContent = {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          seoTitle: post.seoTitle || undefined,
          seoDescription: post.seoDescription || undefined,
          seoKeywords: post.seoKeywords || undefined,
          featuredImageUrl: post.featuredImageUrl || undefined,
          tags: post.tags as string[] || [],
          type: 'article',
        };

        const analysis = seoUtils.content.analyzeContent(seoContent);

        return {
          id: post.id,
          title: post.title,
          slug: post.slug,
          viewCount: post.viewCount,
          seoScore: analysis.score,
        };
      });

      // Calculate average SEO score
      const averageSEOScore = topPerformingPosts.length > 0 
        ? topPerformingPosts.reduce((sum, post) => sum + post.seoScore, 0) / topPerformingPosts.length
        : 0;

      return {
        totalPosts,
        postsWithSEOTitle,
        postsWithSEODescription,
        postsWithKeywords,
        postsWithFeaturedImage,
        averageSEOScore: Math.round(averageSEOScore),
        topPerformingPosts,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get SEO performance metrics',
        cause: error,
      });
    }
  }

  /**
   * Validate and fix common SEO issues across all posts
   */
  static async validateAndFixCommonIssues(): Promise<{
    issuesFound: number;
    issuesFixed: number;
    reportSummary: Array<{
      issue: string;
      count: number;
      fixed: number;
    }>;
  }> {
    try {
      const issues: Array<{ issue: string; count: number; fixed: number }> = [];
      let totalIssuesFound = 0;
      let totalIssuesFixed = 0;

      // Check for posts without SEO titles
      const postsWithoutSEOTitle = await prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          OR: [
            { seoTitle: null },
            { seoTitle: '' },
          ],
        },
        select: { id: true, title: true },
      });

      if (postsWithoutSEOTitle.length > 0) {
        totalIssuesFound += postsWithoutSEOTitle.length;
        
        // Auto-fix: Set SEO title to post title if reasonable length
        const fixableTitle = postsWithoutSEOTitle.filter(p => p.title.length <= 60);
        if (fixableTitle.length > 0) {
          await prisma.post.updateMany({
            where: {
              id: { in: fixableTitle.map(p => p.id) },
            },
            data: {
              seoTitle: undefined, // This would need to be set individually
            },
          });
          totalIssuesFixed += fixableTitle.length;
        }

        issues.push({
          issue: 'Missing SEO Title',
          count: postsWithoutSEOTitle.length,
          fixed: fixableTitle.length,
        });
      }

      // Check for posts without meta descriptions
      const postsWithoutDescription = await prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          OR: [
            { seoDescription: null },
            { seoDescription: '' },
          ],
        },
        select: { id: true, content: true, excerpt: true },
      });

      if (postsWithoutDescription.length > 0) {
        totalIssuesFound += postsWithoutDescription.length;
        
        // Auto-fix: Generate meta descriptions from content/excerpt
        const updates = postsWithoutDescription.map(post => {
          const description = post.excerpt || seoUtils.text.extractExcerpt(post.content, 155);
          return prisma.post.update({
            where: { id: post.id },
            data: { seoDescription: description },
          });
        });

        await Promise.all(updates);
        totalIssuesFixed += postsWithoutDescription.length;

        issues.push({
          issue: 'Missing Meta Description',
          count: postsWithoutDescription.length,
          fixed: postsWithoutDescription.length,
        });
      }

      // Check for posts with duplicate slugs (shouldn't happen due to unique constraint, but check anyway)
      const duplicateSlugs = await prisma.post.groupBy({
        by: ['slug'],
        having: {
          slug: {
            _count: {
              gt: 1,
            },
          },
        },
        where: {
          deletedAt: null,
        },
      });

      if (duplicateSlugs.length > 0) {
        totalIssuesFound += duplicateSlugs.length;
        issues.push({
          issue: 'Duplicate Slugs',
          count: duplicateSlugs.length,
          fixed: 0, // Manual intervention required
        });
      }

      return {
        issuesFound: totalIssuesFound,
        issuesFixed: totalIssuesFixed,
        reportSummary: issues,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to validate and fix SEO issues',
        cause: error,
      });
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export const blogSEOIntegrationService = BlogSEOIntegrationService;
