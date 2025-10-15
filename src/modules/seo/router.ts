/**
 * SEO Management tRPC Router
 * API endpoints for SEO metadata generation and management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { seoMetadataService, SEOContent } from '@/lib/services/seo-metadata.service';
import { metadataManagementService } from '@/lib/services/metadata-management.service';
import { seoUtils } from '@/lib/utils/seo-utils';
import { prisma } from '@/lib/db';

// ============================================================================
// Validation Schemas
// ============================================================================

const seoContentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().max(200, 'SEO description too long').optional(),
  seoKeywords: z.string().optional(),
  featuredImageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  type: z.enum(['article', 'website', 'profile', 'product']).optional(),
  author: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().optional(),
    avatar: z.string().url().optional(),
    bio: z.string().optional(),
    socialLinks: z.record(z.string(), z.string()).optional(),
  }).optional(),
  category: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }).optional(),
});

const seoConfigSchema = z.object({
  siteTitle: z.string().optional(),
  siteDomain: z.string().optional(),
  siteUrl: z.string().url().optional(),
  defaultDescription: z.string().optional(),
  defaultImage: z.string().url().optional(),
  twitterHandle: z.string().optional(),
  facebookAppId: z.string().optional(),
  organizationName: z.string().optional(),
  organizationLogo: z.string().url().optional(),
  organizationUrl: z.string().url().optional(),
  locale: z.string().optional(),
  alternateLocales: z.array(z.string()).optional(),
});

const generateMetadataSchema = z.object({
  content: seoContentSchema,
  path: z.string(),
  config: seoConfigSchema.optional(),
});

const analyzeSEOSchema = z.object({
  content: seoContentSchema,
});

const generateBreadcrumbsSchema = z.object({
  path: z.string(),
  baseUrl: z.string().url(),
});

const generateFAQSchema = z.object({
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

const validateUrlSchema = z.object({
  url: z.string().url(),
});

const generateSlugSchema = z.object({
  text: z.string(),
});

const extractKeywordsSchema = z.object({
  text: z.string(),
  maxKeywords: z.number().int().min(1).max(20).optional(),
});

const blogPostMetadataSchema = z.object({
  postId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});

const categoryMetadataSchema = z.object({
  categoryId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});

const authorMetadataSchema = z.object({
  authorId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});

// ============================================================================
// Router Implementation
// ============================================================================

export const seoManagementRouter = createTRPCRouter({
  /**
   * Generate comprehensive SEO metadata for content
   */
  generateMetadata: protectedProcedure
    .input(generateMetadataSchema)
    .query(async ({ input }) => {
      try {
        const { content, path, config } = input;
        
        // Convert string dates to Date objects
        const seoContent: SEOContent = {
          ...content,
          publishedAt: content.publishedAt ? new Date(content.publishedAt) : undefined,
          updatedAt: content.updatedAt ? new Date(content.updatedAt) : undefined,
        };

        const metadata = seoMetadataService.generateMetadata(seoContent, path, config);
        
        return {
          success: true,
          metadata,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate metadata',
          cause: error,
        });
      }
    }),

  /**
   * Generate metadata specifically for blog posts
   */
  generateBlogPostMetadata: protectedProcedure
    .input(blogPostMetadataSchema)
    .query(async ({ input }) => {
      const { postId, config } = input;

      try {
        // Fetch post from database
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

        const metadata = metadataManagementService.generateBlogPostMetadata({
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt || undefined,
          seoTitle: post.seoTitle || undefined,
          seoDescription: post.seoDescription || undefined,
          seoKeywords: post.seoKeywords || undefined,
          featuredImageUrl: post.featuredImageUrl || undefined,
          tags: post.tags as string[] || undefined,
          publishedAt: post.publishedAt || post.createdAt,
          updatedAt: post.updatedAt,
          author: {
            id: post.author.id,
            name: post.author.name || 'Unknown Author',
            avatar: post.author.avatar || undefined,
          },
          category: post.category || undefined,
        }, config);

        return {
          success: true,
          metadata,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate blog post metadata',
          cause: error,
        });
      }
    }),

  /**
   * Generate metadata for category pages
   */
  generateCategoryMetadata: protectedProcedure
    .input(categoryMetadataSchema)
    .query(async ({ input }) => {
      const { categoryId, config } = input;

      try {
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          include: {
            _count: {
              select: { posts: true },
            },
          },
        });

        if (!category) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Category not found',
          });
        }

        const metadata = metadataManagementService.generateCategoryMetadata({
          name: category.name,
          slug: category.slug,
          description: category.description || undefined,
          postCount: category._count.posts,
        }, config);

        return {
          success: true,
          metadata,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate category metadata',
          cause: error,
        });
      }
    }),

  /**
   * Generate metadata for author pages
   */
  generateAuthorMetadata: protectedProcedure
    .input(authorMetadataSchema)
    .query(async ({ input }) => {
      const { authorId, config } = input;

      try {
        const author = await prisma.user.findUnique({
          where: { id: authorId },
          include: {
            _count: {
              select: { postsAuthored: true },
            },
          },
        });

        if (!author) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Author not found',
          });
        }

        const metadata = metadataManagementService.generateAuthorMetadata({
          name: author.name || 'Unknown Author',
          slug: author.name ? author.name.toLowerCase().replace(/\s+/g, '-') : 'unknown-author',
          avatar: author.avatar || undefined,
          postCount: author._count.postsAuthored,
        }, config);

        return {
          success: true,
          metadata,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate author metadata',
          cause: error,
        });
      }
    }),

  /**
   * Analyze content for SEO best practices
   */
  analyzeSEO: protectedProcedure
    .input(analyzeSEOSchema)
    .query(async ({ input }) => {
      try {
        const { content } = input;
        
        // Convert string dates to Date objects
        const seoContent: SEOContent = {
          ...content,
          publishedAt: content.publishedAt ? new Date(content.publishedAt) : undefined,
          updatedAt: content.updatedAt ? new Date(content.updatedAt) : undefined,
        };

        const analysis = seoUtils.content.analyzeContent(seoContent);
        const recommendations = seoUtils.content.generateRecommendations(seoContent);
        const commonIssues = seoUtils.content.checkCommonIssues(seoContent);

        return {
          success: true,
          analysis: {
            ...analysis,
            recommendations,
            commonIssues,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to analyze SEO',
          cause: error,
        });
      }
    }),

  /**
   * Generate breadcrumb structured data
   */
  generateBreadcrumbs: protectedProcedure
    .input(generateBreadcrumbsSchema)
    .query(async ({ input }) => {
      try {
        const { path, baseUrl } = input;
        
        const breadcrumbUrls = seoUtils.url.generateBreadcrumbUrls(path, baseUrl);
        const breadcrumbs = breadcrumbUrls.map((item, index) => ({
          name: item.name,
          url: item.url,
          position: index + 1,
        }));
        
        const structuredData = metadataManagementService.generateBreadcrumbStructuredData(
          breadcrumbs,
          baseUrl
        );

        return {
          success: true,
          breadcrumbs,
          structuredData,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate breadcrumbs',
          cause: error,
        });
      }
    }),

  /**
   * Generate FAQ structured data
   */
  generateFAQStructuredData: protectedProcedure
    .input(generateFAQSchema)
    .query(async ({ input }) => {
      try {
        const { faqs } = input;
        
        const structuredData = metadataManagementService.generateFAQStructuredData(faqs);

        return {
          success: true,
          structuredData,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate FAQ structured data',
          cause: error,
        });
      }
    }),

  /**
   * Validate URL format and SEO best practices
   */
  validateUrl: protectedProcedure
    .input(validateUrlSchema)
    .query(async ({ input }) => {
      try {
        const { url } = input;
        
        const validation = seoUtils.url.validateUrl(url);

        return {
          success: true,
          validation,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate URL',
          cause: error,
        });
      }
    }),

  /**
   * Generate SEO-friendly slug from text
   */
  generateSlug: protectedProcedure
    .input(generateSlugSchema)
    .query(async ({ input }) => {
      try {
        const { text } = input;
        
        const slug = seoUtils.text.generateSlug(text);

        // Check if slug already exists in blog posts
        const existingPost = await prisma.post.findFirst({
          where: { slug },
          select: { id: true },
        });

        let finalSlug = slug;
        let counter = 1;
        
        while (existingPost) {
          finalSlug = `${slug}-${counter}`;
          const exists = await prisma.post.findFirst({
            where: { slug: finalSlug },
            select: { id: true },
          });
          
          if (!exists) break;
          counter++;
        }

        return {
          success: true,
          slug: finalSlug,
          isUnique: finalSlug === slug,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate slug',
          cause: error,
        });
      }
    }),

  /**
   * Extract keywords from text content
   */
  extractKeywords: protectedProcedure
    .input(extractKeywordsSchema)
    .query(async ({ input }) => {
      try {
        const { text, maxKeywords = 10 } = input;
        
        const keywords = seoUtils.text.extractKeywords(text, maxKeywords);

        return {
          success: true,
          keywords,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to extract keywords',
          cause: error,
        });
      }
    }),

  /**
   * Generate title variations for A/B testing
   */
  generateTitleVariations: protectedProcedure
    .input(z.object({ title: z.string() }))
    .query(async ({ input }) => {
      try {
        const { title } = input;
        
        const variations = seoUtils.text.generateTitleVariations(title);

        return {
          success: true,
          variations,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate title variations',
          cause: error,
        });
      }
    }),

  /**
   * Calculate reading time for content
   */
  calculateReadingTime: protectedProcedure
    .input(z.object({ 
      content: z.string(),
      wordsPerMinute: z.number().int().min(100).max(300).optional().default(200),
    }))
    .query(async ({ input }) => {
      try {
        const { content, wordsPerMinute } = input;
        
        const readingTime = seoUtils.text.calculateReadingTime(content, wordsPerMinute);
        const wordCount = seoUtils.text.countWords(content);

        return {
          success: true,
          readingTime,
          wordCount,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to calculate reading time',
          cause: error,
        });
      }
    }),

  /**
   * Admin: Get SEO configuration
   */
  getConfig: adminProcedure
    .query(async () => {
      // In a real implementation, this would fetch from database or config
      // For now, return default configuration
      return {
        success: true,
        config: {
          siteTitle: 'YesGoddess',
          siteDomain: 'yesgoddess.com',
          siteUrl: process.env.FRONTEND_URL || 'https://yesgoddess.com',
          defaultDescription: 'IP Licensing Platform for Creators and Brands',
          defaultImage: `${process.env.FRONTEND_URL || 'https://yesgoddess.com'}/images/og-default.jpg`,
          twitterHandle: '@yesgoddessio',
          organizationName: 'YesGoddess',
          organizationLogo: `${process.env.FRONTEND_URL || 'https://yesgoddess.com'}/images/logo.png`,
          organizationUrl: process.env.FRONTEND_URL || 'https://yesgoddess.com',
          locale: 'en_US',
        },
      };
    }),

  /**
   * Admin: Update SEO configuration
   */
  updateConfig: adminProcedure
    .input(seoConfigSchema)
    .mutation(async ({ input }) => {
      try {
        // In a real implementation, this would save to database
        // For now, just return success
        
        return {
          success: true,
          message: 'SEO configuration updated successfully',
          config: input,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update SEO configuration',
          cause: error,
        });
      }
    }),
});

export type SEOManagementRouter = typeof seoManagementRouter;
