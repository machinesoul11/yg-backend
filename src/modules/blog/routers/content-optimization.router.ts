/**
 * Content Optimization Router
 * API endpoints for comprehensive content optimization analysis
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../../lib/trpc';
import { ContentOptimizationService } from '../services/content-optimization.service';
import { prisma } from '../../../lib/db';

// ============================================================================
// Validation Schemas
// ============================================================================

const analyzeContentSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  title: z.string().optional(),
  contentType: z.enum(['tutorial', 'guide', 'news', 'opinion', 'review', 'default']).optional(),
  targetKeywords: z.array(z.string()).optional(),
  excludePostId: z.string().optional()
});

const keywordDensityAnalysisSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  targetKeywords: z.array(z.string()).optional(),
  includeNGrams: z.object({
    twoWord: z.boolean().default(true),
    threeWord: z.boolean().default(true)
  }).optional()
});

const headingStructureValidationSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  config: z.object({
    requireH1: z.boolean().default(true),
    maxSkippedLevels: z.number().min(0).max(2).default(0),
    maxDepth: z.number().min(3).max(6).default(6)
  }).optional()
});

const readabilityAnalysisSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  targetAudience: z.enum(['general', 'technical', 'academic', 'children']).optional(),
  includeAdvancedMetrics: z.boolean().default(false)
});

const imageValidationSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  config: z.object({
    requireAltText: z.boolean().default(true),
    maxAltTextLength: z.number().min(50).max(200).default(125),
    minAltTextLength: z.number().min(5).max(50).default(10),
    allowEmptyAltForDecorative: z.boolean().default(true)
  }).optional()
});

const contentLengthAnalysisSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  contentType: z.enum(['tutorial', 'guide', 'news', 'opinion', 'review', 'default']).optional(),
  customTargets: z.object({
    min: z.number().min(100),
    max: z.number().min(200)
  }).optional()
});

const internalLinkingAnalysisSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  excludePostId: z.string().optional(),
  maxSuggestions: z.number().min(1).max(10).default(5),
  minRelevanceScore: z.number().min(0).max(100).default(30)
});

const bulkOptimizationSchema = z.object({
  postIds: z.array(z.string()).min(1).max(50),
  analysisTypes: z.array(z.enum([
    'keyword-density',
    'heading-structure', 
    'readability',
    'image-validation',
    'content-length',
    'internal-linking'
  ])).min(1),
  includeRecommendations: z.boolean().default(true)
});

// ============================================================================
// Content Optimization Router
// ============================================================================

export const contentOptimizationRouter = createTRPCRouter({
  /**
   * Comprehensive content optimization analysis
   */
  analyzeContent: protectedProcedure
    .input(analyzeContentSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      
      return await service.analyzeContent(input.content, {
        title: input.title,
        contentType: input.contentType,
        targetKeywords: input.targetKeywords,
        excludePostId: input.excludePostId
      });
    }),

  /**
   * Keyword density analysis
   */
  analyzeKeywordDensity: protectedProcedure
    .input(keywordDensityAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content, {
        targetKeywords: input.targetKeywords
      });
      
      return {
        keywordAnalysis: result.keywordAnalysis,
        processingTime: result.processingTime
      };
    }),

  /**
   * Heading structure validation
   */
  validateHeadingStructure: protectedProcedure
    .input(headingStructureValidationSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content);
      
      return {
        headingStructure: result.headingStructure,
        processingTime: result.processingTime
      };
    }),

  /**
   * Readability score calculation
   */
  calculateReadability: protectedProcedure
    .input(readabilityAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content);
      
      return {
        readability: result.readability,
        processingTime: result.processingTime
      };
    }),

  /**
   * Image alt text validation
   */
  validateImageAltText: protectedProcedure
    .input(imageValidationSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content);
      
      return {
        imageValidation: result.imageValidation,
        processingTime: result.processingTime
      };
    }),

  /**
   * Content length analysis and recommendations
   */
  analyzeContentLength: protectedProcedure
    .input(contentLengthAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content, {
        contentType: input.contentType
      });
      
      return {
        contentLength: result.contentLength,
        processingTime: result.processingTime
      };
    }),

  /**
   * Internal linking analysis
   */
  analyzeInternalLinking: protectedProcedure
    .input(internalLinkingAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(input.content, {
        excludePostId: input.excludePostId
      });
      
      return {
        internalLinking: result.internalLinking,
        processingTime: result.processingTime
      };
    }),

  /**
   * Get optimization recommendations for existing post
   */
  getPostOptimization: protectedProcedure
    .input(z.object({
      postId: z.string(),
      analysisTypes: z.array(z.string()).optional()
    }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.db.post.findUnique({
        where: { id: input.postId },
        include: {
          category: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!post) {
        throw new Error('Post not found');
      }

      const service = new ContentOptimizationService(ctx.db);
      const result = await service.analyzeContent(post.content, {
        title: post.title,
        contentType: post.category?.name?.toLowerCase() || 'default',
        excludePostId: post.id
      });

      return {
        ...result,
        postInfo: {
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          publishedAt: post.publishedAt,
          category: post.category?.name,
          author: post.author.name
        }
      };
    }),

  /**
   * Bulk optimization analysis for multiple posts
   */
  bulkOptimizationAnalysis: protectedProcedure
    .input(bulkOptimizationSchema)
    .mutation(async ({ ctx, input }) => {
      const posts = await ctx.db.post.findMany({
        where: {
          id: { in: input.postIds },
          status: 'PUBLISHED'
        },
        include: {
          category: true,
          author: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (posts.length === 0) {
        throw new Error('No valid posts found for analysis');
      }

      const service = new ContentOptimizationService(ctx.db);
      const results = await Promise.all(
        posts.map(async (post) => {
          try {
            const analysis = await service.analyzeContent(post.content, {
              title: post.title,
              contentType: post.category?.name?.toLowerCase() || 'default',
              excludePostId: post.id
            });

            return {
              postId: post.id,
              title: post.title,
              slug: post.slug,
              status: post.status,
              category: post.category?.name,
              author: post.author.name,
              analysis,
              success: true
            };
          } catch (error) {
            return {
              postId: post.id,
              title: post.title,
              error: error instanceof Error ? error.message : 'Analysis failed',
              success: false
            };
          }
        })
      );

      // Generate summary statistics
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      const averageScores = successful.length > 0 ? {
        overall: Math.round(successful.reduce((sum, r) => sum + (r.analysis?.overallScore || 0), 0) / successful.length),
        readability: Math.round(successful.reduce((sum, r) => sum + (r.analysis?.readability.score || 0), 0) / successful.length),
        imageCompliance: Math.round(successful.reduce((sum, r) => sum + (r.analysis?.imageValidation.complianceScore || 0), 0) / successful.length)
      } : null;

      return {
        results,
        summary: {
          totalPosts: posts.length,
          successfulAnalyses: successful.length,
          failedAnalyses: failed.length,
          averageScores
        }
      };
    }),

  /**
   * Generate content optimization report
   */
  generateOptimizationReport: protectedProcedure
    .input(z.object({
      dateRange: z.object({
        from: z.date(),
        to: z.date()
      }).optional(),
      categoryId: z.string().optional(),
      authorId: z.string().optional(),
      includeUnpublished: z.boolean().default(false)
    }))
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null
      };

      if (!input.includeUnpublished) {
        where.status = 'PUBLISHED';
      }

      if (input.dateRange) {
        where.createdAt = {
          gte: input.dateRange.from,
          lte: input.dateRange.to
        };
      }

      if (input.categoryId) {
        where.categoryId = input.categoryId;
      }

      if (input.authorId) {
        where.authorId = input.authorId;
      }

      const posts = await ctx.db.post.findMany({
        where,
        include: {
          category: true,
          author: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 50 // Limit to prevent timeout
      });

      const service = new ContentOptimizationService(ctx.db);
      const analyses = await Promise.allSettled(
        posts.map(post => 
          service.analyzeContent(post.content, {
            title: post.title,
            contentType: post.category?.name?.toLowerCase() || 'default',
            excludePostId: post.id
          })
        )
      );

      const validAnalyses = analyses
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);

      // Generate aggregated insights
      const insights = {
        totalPosts: posts.length,
        averageOverallScore: validAnalyses.length > 0 
          ? Math.round(validAnalyses.reduce((sum, a) => sum + a.overallScore, 0) / validAnalyses.length)
          : 0,
        averageReadabilityScore: validAnalyses.length > 0
          ? Math.round(validAnalyses.reduce((sum, a) => sum + a.readability.score, 0) / validAnalyses.length)
          : 0,
        averageImageCompliance: validAnalyses.length > 0
          ? Math.round(validAnalyses.reduce((sum, a) => sum + a.imageValidation.complianceScore, 0) / validAnalyses.length)
          : 0,
        commonIssues: this.extractCommonIssues(validAnalyses),
        topRecommendations: this.extractTopRecommendations(validAnalyses)
      };

      return {
        insights,
        postCount: posts.length,
        analyzedCount: validAnalyses.length,
        dateRange: input.dateRange,
        filters: {
          categoryId: input.categoryId,
          authorId: input.authorId,
          includeUnpublished: input.includeUnpublished
        }
      };
    }),

  /**
   * Get optimization config and settings
   */
  getOptimizationConfig: protectedProcedure
    .query(async ({ ctx }) => {
      // Return current optimization configuration
      return {
        keywordDensity: {
          optimalMin: 1,
          optimalMax: 3,
          warningThreshold: 5
        },
        headingStructure: {
          requireH1: true,
          maxSkippedLevels: 0,
          maxDepth: 6
        },
        readability: {
          targetGradeLevel: 9,
          preferredReadingEase: { min: 60, max: 70 }
        },
        contentLength: {
          defaultTargets: {
            tutorial: { min: 1500, max: 3000 },
            guide: { min: 2000, max: 4000 },
            news: { min: 300, max: 800 },
            opinion: { min: 600, max: 1200 },
            review: { min: 800, max: 1500 },
            default: { min: 800, max: 2000 }
          }
        },
        imageValidation: {
          maxAltTextLength: 125,
          minAltTextLength: 10,
          requireAltText: true
        }
      };
    }),

  /**
   * Real-time content analysis for editor
   */
  liveContentAnalysis: protectedProcedure
    .input(z.object({
      content: z.string(),
      analysisType: z.enum(['quick', 'comprehensive']).default('quick')
    }))
    .mutation(async ({ ctx, input }) => {
      const service = new ContentOptimizationService(ctx.db);
      
      if (input.analysisType === 'quick') {
        // Quick analysis for real-time feedback
        const result = await service.analyzeContent(input.content);
        
        return {
          wordCount: result.contentLength.currentWordCount,
          readabilityScore: result.readability.score,
          headingStructureValid: result.headingStructure.isValid,
          imageIssues: result.imageValidation.issues.length,
          overallScore: result.overallScore,
          quickRecommendations: result.summary.quick_wins.slice(0, 3)
        };
      } else {
        // Full comprehensive analysis
        return await service.analyzeContent(input.content);
      }
    })

}, {
  /**
   * Helper method to extract common issues across analyses
   */
  extractCommonIssues(analyses: any[]) {
    const issueCount = new Map<string, number>();
    
    analyses.forEach(analysis => {
      analysis.summary.issues.forEach((issue: string) => {
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      });
    });

    return Array.from(issueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => ({ issue, count, percentage: Math.round((count / analyses.length) * 100) }));
  },

  /**
   * Helper method to extract top recommendations
   */
  extractTopRecommendations(analyses: any[]) {
    const recommendationCount = new Map<string, number>();
    
    analyses.forEach(analysis => {
      analysis.summary.priority_fixes.forEach((rec: string) => {
        recommendationCount.set(rec, (recommendationCount.get(rec) || 0) + 1);
      });
      
      analysis.summary.quick_wins.forEach((rec: string) => {
        recommendationCount.set(rec, (recommendationCount.get(rec) || 0) + 1);
      });
    });

    return Array.from(recommendationCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([recommendation, count]) => ({ 
        recommendation, 
        count, 
        percentage: Math.round((count / analyses.length) * 100) 
      }));
  }
});
