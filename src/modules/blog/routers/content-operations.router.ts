/**
 * Content Operations Router
 * API endpoints for content validation, SEO analysis, and link suggestions
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../../lib/trpc';
import { BlogUtilityService } from '../services/blog-utility.service';
import { InternalLinkSuggestionsService } from '../services/internal-link-suggestions.service';
import { RichTextContentValidator } from '../services/rich-text-validator.service';
import { SEOValidationService } from '../services/seo-validation.service';
import { EnhancedExcerptGenerator } from '../services/enhanced-excerpt-generator.service';

// Validation schemas for content operations
const validateContentSchema = z.object({
  content: z.string().min(1),
  config: z.object({
    requireHeadings: z.boolean().optional(),
    validateLinks: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional()
  }).optional()
});

const validateSEOSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.string().optional(),
  featuredImageUrl: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const generateExcerptSchema = z.object({
  content: z.string().min(1),
  options: z.object({
    maxLength: z.number().min(50).max(500).optional(),
    strategy: z.enum(['first-paragraph', 'content-summary', 'keyword-focused', 'auto-best']).optional(),
    targetKeywords: z.array(z.string()).optional(),
    preserveSentences: z.boolean().optional(),
    includeKeywords: z.boolean().optional(),
    minLength: z.number().optional()
  }).optional()
});

const generateLinkSuggestionsSchema = z.object({
  content: z.string().min(1),
  currentPostId: z.string().cuid().optional(),
  options: z.object({
    maxSuggestions: z.number().min(1).max(20).optional(),
    minRelevanceScore: z.number().min(0).max(100).optional(),
    excludeUrls: z.array(z.string()).optional(),
    preferRecent: z.boolean().optional(),
    includeCategories: z.boolean().optional()
  }).optional()
});

const bulkLinkSuggestionsSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(50),
  options: z.object({
    maxSuggestions: z.number().min(1).max(20).optional(),
    minRelevanceScore: z.number().min(0).max(100).optional(),
    excludeUrls: z.array(z.string()).optional(),
    preferRecent: z.boolean().optional(),
    includeCategories: z.boolean().optional()
  }).optional()
});

const generateSlugSchema = z.object({
  title: z.string().min(1),
  excludeId: z.string().cuid().optional(),
  maxLength: z.number().min(10).max(150).optional()
});

export const contentOperationsRouter = createTRPCRouter({
  // Rich Text Content Validation
  validateContent: protectedProcedure
    .input(validateContentSchema)
    .mutation(async ({ input }) => {
      const result = RichTextContentValidator.validateContent(
        input.content,
        input.config
      );
      
      return {
        success: true,
        data: result
      };
    }),

  // SEO Validation and Analysis
  validateSEO: protectedProcedure
    .input(validateSEOSchema)
    .mutation(async ({ input }) => {
      const result = SEOValidationService.validateSEO(input);
      
      return {
        success: true,
        data: result
      };
    }),

  // Enhanced Excerpt Generation
  generateExcerpt: protectedProcedure
    .input(generateExcerptSchema)
    .mutation(async ({ input }) => {
      const result = EnhancedExcerptGenerator.generateExcerpt(
        input.content,
        input.options
      );
      
      return {
        success: true,
        data: result
      };
    }),

  // Generate Multiple Excerpt Options
  generateExcerptOptions: protectedProcedure
    .input(generateExcerptSchema)
    .mutation(async ({ input }) => {
      const results = EnhancedExcerptGenerator.generateExcerptOptions(
        input.content,
        input.options
      );
      
      return {
        success: true,
        data: results
      };
    }),

  // Internal Link Suggestions
  generateLinkSuggestions: protectedProcedure
    .input(generateLinkSuggestionsSchema)
    .mutation(async ({ input, ctx }) => {
      const linkService = new InternalLinkSuggestionsService(ctx.db);
      
      const result = await linkService.generateLinkSuggestions(
        input.content,
        input.currentPostId,
        input.options
      );
      
      return {
        success: true,
        data: result
      };
    }),

  // Bulk Link Suggestions for Multiple Posts
  generateBulkLinkSuggestions: protectedProcedure
    .input(bulkLinkSuggestionsSchema)
    .mutation(async ({ input, ctx }) => {
      const linkService = new InternalLinkSuggestionsService(ctx.db);
      
      const results = await linkService.generateBulkSuggestions(
        input.postIds,
        input.options
      );
      
      return {
        success: true,
        data: results
      };
    }),

  // Enhanced Slug Generation with Conflict Resolution
  generateSlug: protectedProcedure
    .input(generateSlugSchema)
    .query(async ({ input, ctx }) => {
      // Get existing slugs to check for conflicts
      const whereClause: any = {
        deletedAt: null
      };
      
      if (input.excludeId) {
        whereClause.id = { not: input.excludeId };
      }
      
      const existingPosts = await ctx.db.post.findMany({
        where: whereClause,
        select: { slug: true }
      });
      
      const existingSlugs = existingPosts.map(p => p.slug);
      
      const slug = BlogUtilityService.generateSlug(input.title, {
        existingSlugs,
        maxLength: input.maxLength || 150
      });
      
      return {
        success: true,
        data: {
          slug,
          isUnique: !existingSlugs.includes(slug),
          conflictCount: existingSlugs.filter(s => s.startsWith(slug.split('-')[0])).length
        }
      };
    }),

  // Calculate Read Time
  calculateReadTime: protectedProcedure
    .input(z.object({
      content: z.string().min(1),
      wordsPerMinute: z.number().min(50).max(1000).optional()
    }))
    .query(async ({ input }) => {
      const readTime = BlogUtilityService.calculateReadTime(
        input.content,
        { wordsPerMinute: input.wordsPerMinute || 250 }
      );
      
      return {
        success: true,
        data: {
          readTimeMinutes: readTime,
          wordCount: RichTextContentValidator.countWords(input.content),
          characterCount: input.content.length
        }
      };
    }),

  // Comprehensive Content Analysis (combines multiple operations)
  analyzeContent: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      seoKeywords: z.string().optional(),
      featuredImageUrl: z.string().optional(),
      tags: z.array(z.string()).optional(),
      currentPostId: z.string().cuid().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const linkService = new InternalLinkSuggestionsService(ctx.db);
      
      // Run all analyses in parallel for better performance
      const [
        contentValidation,
        seoValidation,
        excerptGeneration,
        linkSuggestions,
        readTimeData
      ] = await Promise.all([
        // Content validation
        Promise.resolve(RichTextContentValidator.validateContent(input.content)),
        
        // SEO validation
        Promise.resolve(SEOValidationService.validateSEO({
          title: input.title,
          slug: input.slug || BlogUtilityService.generateSlug(input.title),
          content: input.content,
          excerpt: input.excerpt,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          seoKeywords: input.seoKeywords,
          featuredImageUrl: input.featuredImageUrl,
          tags: input.tags
        })),
        
        // Excerpt generation
        Promise.resolve(EnhancedExcerptGenerator.generateExcerpt(input.content, {
          strategy: 'auto-best',
          targetKeywords: input.seoKeywords ? input.seoKeywords.split(',').map(k => k.trim()) : undefined
        })),
        
        // Link suggestions
        linkService.generateLinkSuggestions(
          input.content,
          input.currentPostId,
          { maxSuggestions: 5 }
        ),
        
        // Read time calculation
        Promise.resolve({
          readTimeMinutes: BlogUtilityService.calculateReadTime(input.content, { wordsPerMinute: 250 }),
          wordCount: RichTextContentValidator.countWords(input.content),
          characterCount: input.content.length
        })
      ]);
      
      return {
        success: true,
        data: {
          contentValidation,
          seoValidation,
          excerptGeneration,
          linkSuggestions,
          readTimeData,
          overallScore: Math.round((
            (contentValidation.isValid ? 25 : 0) +
            (seoValidation.score * 0.5) +
            (excerptGeneration.confidence * 0.15) +
            (linkSuggestions.suggestions.length > 0 ? 10 : 0)
          )),
          recommendations: [
            ...contentValidation.recommendations,
            ...seoValidation.recommendations,
            ...excerptGeneration.recommendations,
            ...linkSuggestions.recommendations
          ].slice(0, 10) // Limit to top 10 recommendations
        }
      };
    }),

  // Validate Content Before Save (used by post creation/update)
  validateBeforeSave: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      requireValidation: z.boolean().default(true)
    }))
    .mutation(async ({ input }) => {
      if (!input.requireValidation) {
        return { success: true, data: { isValid: true, warnings: [], errors: [] } };
      }

      const contentValidation = await RichTextContentValidator.validateBeforeSave(input.content);
      const seoValidation = SEOValidationService.validateSEO({
        title: input.title,
        slug: input.slug || BlogUtilityService.generateSlug(input.title),
        content: input.content,
        excerpt: input.excerpt,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription
      });

      const isValid = contentValidation.isValid && seoValidation.errors.length === 0;
      
      return {
        success: true,
        data: {
          isValid,
          contentValidation,
          seoValidation,
          warnings: [
            ...contentValidation.warnings,
            ...seoValidation.warnings
          ],
          errors: [
            ...contentValidation.errors,
            ...seoValidation.errors
          ],
          canSave: isValid || seoValidation.errors.length === 0, // Allow save even with SEO warnings
          sanitizedContent: contentValidation.sanitizedContent
        }
      };
    })
});

export type ContentOperationsRouter = typeof contentOperationsRouter;
