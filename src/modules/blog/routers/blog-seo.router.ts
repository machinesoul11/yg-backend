/**
 * Blog SEO Router Extension
 * Adds SEO-specific endpoints to the blog module
 */

import { z } from 'zod';
import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from '@/lib/trpc';
import { blogSEOIntegrationService } from '../services/blog-seo-integration.service';
import { TRPCError } from '@trpc/server';

// ============================================================================
// Validation Schemas
// ============================================================================

const seoEnhancementOptionsSchema = z.object({
  autoGenerateKeywords: z.boolean().optional().default(false),
  autoGenerateExcerpt: z.boolean().optional().default(false),
  validateSEO: z.boolean().optional().default(true),
  generateAlternativeTitles: z.boolean().optional().default(false),
  optimizeForReadability: z.boolean().optional().default(false),
});

const getPostWithSEOSchema = z.object({
  postId: z.string().cuid(),
  options: seoEnhancementOptionsSchema.optional(),
});

const autoEnhancePostSEOSchema = z.object({
  postId: z.string().cuid(),
  options: seoEnhancementOptionsSchema.optional(),
});

const bulkSEOAnalysisSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(50),
});

// ============================================================================
// Router Implementation
// ============================================================================

export const blogSEORouter = createTRPCRouter({
  /**
   * Get blog post with enhanced SEO metadata
   */
  getPostWithSEO: protectedProcedure
    .input(getPostWithSEOSchema)
    .query(async ({ input }) => {
      try {
        const { postId, options } = input;
        
        const result = await blogSEOIntegrationService.getBlogPostWithSEO(
          postId,
          options || {}
        );

        return {
          success: true,
          post: result,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get post with SEO data',
          cause: error,
        });
      }
    }),

  /**
   * Auto-enhance blog post SEO metadata
   */
  autoEnhancePostSEO: protectedProcedure
    .input(autoEnhancePostSEOSchema)
    .mutation(async ({ input }) => {
      try {
        const { postId, options } = input;
        
        const result = await blogSEOIntegrationService.autoEnhancePostSEO(
          postId,
          options || {}
        );

        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to auto-enhance post SEO',
          cause: error,
        });
      }
    }),

  /**
   * Bulk SEO analysis for multiple posts
   */
  bulkSEOAnalysis: protectedProcedure
    .input(bulkSEOAnalysisSchema)
    .query(async ({ input }) => {
      try {
        const { postIds } = input;
        
        const results = await blogSEOIntegrationService.bulkSEOAnalysis(postIds);

        return {
          success: true,
          analyses: results,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to perform bulk SEO analysis',
          cause: error,
        });
      }
    }),

  /**
   * Generate sitemap data for blog posts
   */
  generateSitemapData: adminProcedure
    .query(async () => {
      try {
        const sitemapData = await blogSEOIntegrationService.generateSitemapData();

        return {
          success: true,
          sitemapData,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate sitemap data',
          cause: error,
        });
      }
    }),

  /**
   * Get SEO performance metrics for blog
   */
  getSEOPerformanceMetrics: adminProcedure
    .query(async () => {
      try {
        const metrics = await blogSEOIntegrationService.getSEOPerformanceMetrics();

        return {
          success: true,
          metrics,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SEO performance metrics',
          cause: error,
        });
      }
    }),

  /**
   * Validate and fix common SEO issues across all posts
   */
  validateAndFixCommonIssues: adminProcedure
    .mutation(async () => {
      try {
        const result = await blogSEOIntegrationService.validateAndFixCommonIssues();

        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate and fix SEO issues',
          cause: error,
        });
      }
    }),

  /**
   * Get SEO recommendations for a specific post
   */
  getSEORecommendations: protectedProcedure
    .input(z.object({ postId: z.string().cuid() }))
    .query(async ({ input }) => {
      try {
        const { postId } = input;
        
        const postWithSEO = await blogSEOIntegrationService.getBlogPostWithSEO(
          postId,
          { validateSEO: true }
        );

        const recommendations = postWithSEO.seoAnalysis?.suggestions || [];
        const commonIssues = postWithSEO.seoAnalysis?.issues || [];

        return {
          success: true,
          recommendations,
          issues: commonIssues,
          seoScore: postWithSEO.seoAnalysis?.score || 0,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SEO recommendations',
          cause: error,
        });
      }
    }),

  /**
   * Generate robots.txt content for blog section
   */
  generateRobotsTxt: adminProcedure
    .query(async () => {
      try {
        const baseUrl = process.env.FRONTEND_URL || 'https://yesgoddess.com';
        
        // Basic robots.txt for blog section
        const robotsTxt = [
          'User-agent: *',
          'Allow: /blog/',
          'Disallow: /blog/drafts/',
          'Disallow: /blog/preview/',
          '',
          `Sitemap: ${baseUrl}/blog/sitemap.xml`,
          `Sitemap: ${baseUrl}/sitemap.xml`,
        ].join('\n');

        return {
          success: true,
          robotsTxt,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate robots.txt',
          cause: error,
        });
      }
    }),

  /**
   * Get blog SEO health check
   */
  getSEOHealthCheck: adminProcedure
    .query(async () => {
      try {
        const metrics = await blogSEOIntegrationService.getSEOPerformanceMetrics();
        
        // Calculate health score
        const totalPosts = metrics.totalPosts;
        const seoCompleteness = totalPosts > 0 ? {
          seoTitlePercentage: Math.round((metrics.postsWithSEOTitle / totalPosts) * 100),
          seoDescriptionPercentage: Math.round((metrics.postsWithSEODescription / totalPosts) * 100),
          keywordsPercentage: Math.round((metrics.postsWithKeywords / totalPosts) * 100),
          featuredImagePercentage: Math.round((metrics.postsWithFeaturedImage / totalPosts) * 100),
        } : {
          seoTitlePercentage: 0,
          seoDescriptionPercentage: 0,
          keywordsPercentage: 0,
          featuredImagePercentage: 0,
        };

        // Calculate overall health score
        const healthScore = totalPosts > 0 ? Math.round(
          (seoCompleteness.seoTitlePercentage +
           seoCompleteness.seoDescriptionPercentage +
           seoCompleteness.keywordsPercentage +
           seoCompleteness.featuredImagePercentage +
           metrics.averageSEOScore) / 5
        ) : 0;

        // Generate recommendations based on health
        const recommendations: string[] = [];
        
        if (seoCompleteness.seoTitlePercentage < 80) {
          recommendations.push('Improve SEO title coverage - aim for at least 80% of posts to have custom SEO titles');
        }
        
        if (seoCompleteness.seoDescriptionPercentage < 90) {
          recommendations.push('Add meta descriptions to more posts - aim for 90%+ coverage');
        }
        
        if (seoCompleteness.featuredImagePercentage < 70) {
          recommendations.push('Add featured images to more posts for better social sharing');
        }
        
        if (metrics.averageSEOScore < 75) {
          recommendations.push('Focus on improving content quality and SEO optimization');
        }

        return {
          success: true,
          healthCheck: {
            overallScore: healthScore,
            totalPosts: metrics.totalPosts,
            seoCompleteness,
            averageContentScore: metrics.averageSEOScore,
            recommendations,
            status: healthScore >= 80 ? 'excellent' : 
                   healthScore >= 60 ? 'good' : 
                   healthScore >= 40 ? 'needs-improvement' : 'critical',
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SEO health check',
          cause: error,
        });
      }
    }),
});

export type BlogSEORouter = typeof blogSEORouter;
