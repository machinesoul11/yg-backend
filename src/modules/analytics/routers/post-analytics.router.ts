/**
 * Post Analytics Router
 * tRPC routes for post analytics, A/B testing, and metrics
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '@/lib/trpc';
import { PostAnalyticsService } from '@/modules/analytics/services/post-analytics.service';
import { PostExperimentService } from '@/modules/analytics/services/post-experiment.service';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { enrichEventQueue } from '@/jobs/analytics-jobs';
import {
  trackPostViewSchema,
  trackEngagementTimeSchema,
  trackScrollDepthSchema,
  trackCtaClickSchema,
  getPostAnalyticsSchema,
  getPostTimeSeriesSchema,
  getPostReferrersSchema,
  comparePostsSchema,
  createExperimentSchema,
  updateExperimentSchema,
  getExperimentResultsSchema,
} from '@/lib/schemas/analytics.schema';

// Initialize services
const postAnalyticsService = new PostAnalyticsService(prisma, redisConnection, enrichEventQueue);
const postExperimentService = new PostExperimentService(prisma, redisConnection);

export const postAnalyticsRouter = createTRPCRouter({
  // ========================================
  // EVENT TRACKING ENDPOINTS
  // ========================================

  /**
   * Track post view event
   */
  trackView: publicProcedure
    .input(trackPostViewSchema)
    .mutation(async ({ input, ctx }) => {
      const context = {
        session: ctx.session,
        deviceType: ctx.req?.headers['x-device-type'] as string,
        browser: ctx.req?.headers['x-browser'] as string,
        os: ctx.req?.headers['x-os'] as string,
        ipAddress: ctx.req?.headers['x-forwarded-for'] as string || ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
      };

      return postAnalyticsService.trackPostView(input, context);
    }),

  /**
   * Track engagement time
   */
  trackEngagement: publicProcedure
    .input(trackEngagementTimeSchema)
    .mutation(async ({ input, ctx }) => {
      const context = {
        session: ctx.session,
        deviceType: ctx.req?.headers['x-device-type'] as string,
        browser: ctx.req?.headers['x-browser'] as string,
        os: ctx.req?.headers['x-os'] as string,
        ipAddress: ctx.req?.headers['x-forwarded-for'] as string || ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
      };

      return postAnalyticsService.trackEngagementTime(input, context);
    }),

  /**
   * Track scroll depth milestones
   */
  trackScrollDepth: publicProcedure
    .input(trackScrollDepthSchema)
    .mutation(async ({ input, ctx }) => {
      const context = {
        session: ctx.session,
        deviceType: ctx.req?.headers['x-device-type'] as string,
        browser: ctx.req?.headers['x-browser'] as string,
        os: ctx.req?.headers['x-os'] as string,
        ipAddress: ctx.req?.headers['x-forwarded-for'] as string || ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
      };

      return postAnalyticsService.trackScrollDepth(input, context);
    }),

  /**
   * Track CTA clicks
   */
  trackCtaClick: publicProcedure
    .input(trackCtaClickSchema)
    .mutation(async ({ input, ctx }) => {
      const context = {
        session: ctx.session,
        deviceType: ctx.req?.headers['x-device-type'] as string,
        browser: ctx.req?.headers['x-browser'] as string,
        os: ctx.req?.headers['x-os'] as string,
        ipAddress: ctx.req?.headers['x-forwarded-for'] as string || ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
      };

      return postAnalyticsService.trackCtaClick(input, context);
    }),

  // ========================================
  // ANALYTICS RETRIEVAL ENDPOINTS
  // ========================================

  /**
   * Get comprehensive post analytics overview
   */
  getAnalytics: protectedProcedure
    .input(getPostAnalyticsSchema)
    .query(async ({ input, ctx }) => {
      // Check if user has access to this post's analytics
      const post = await prisma.post.findUnique({
        where: { id: input.postId },
        select: { authorId: true, status: true },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // Only author, admins, or if public post can view analytics
      if (
        post.authorId !== ctx.session.userId &&
        ctx.session.role !== 'ADMIN' &&
        post.status !== 'PUBLISHED'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view analytics for this post',
        });
      }

      return postAnalyticsService.getPostAnalytics(input);
    }),

  /**
   * Get time series data for charts
   */
  getTimeSeries: protectedProcedure
    .input(getPostTimeSeriesSchema)
    .query(async ({ input, ctx }) => {
      // Check permissions (same as above)
      const post = await prisma.post.findUnique({
        where: { id: input.postId },
        select: { authorId: true, status: true },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      if (
        post.authorId !== ctx.session.userId &&
        ctx.session.role !== 'ADMIN'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view analytics for this post',
        });
      }

      return postAnalyticsService.getPostTimeSeries(input);
    }),

  /**
   * Get referrer analysis
   */
  getReferrers: protectedProcedure
    .input(getPostReferrersSchema)
    .query(async ({ input, ctx }) => {
      // Check permissions
      const post = await prisma.post.findUnique({
        where: { id: input.postId },
        select: { authorId: true },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      if (
        post.authorId !== ctx.session.userId &&
        ctx.session.role !== 'ADMIN'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view analytics for this post',
        });
      }

      return postAnalyticsService.getPostReferrers(input);
    }),

  /**
   * Compare multiple posts
   */
  comparePosts: protectedProcedure
    .input(comparePostsSchema)
    .query(async ({ input, ctx }) => {
      // Check permissions for all posts
      const posts = await prisma.post.findMany({
        where: { id: { in: input.postIds } },
        select: { id: true, authorId: true, title: true },
      });

      if (posts.length !== input.postIds.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or more posts not found',
        });
      }

      // Check if user can access all posts
      const unauthorized = posts.some(
        post => post.authorId !== ctx.session.userId && ctx.session.role !== 'ADMIN'
      );

      if (unauthorized) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view analytics for some of these posts',
        });
      }

      // Get analytics for each post and compare
      const comparisons = await Promise.all(
        input.postIds.map(async (postId) => {
          const analytics = await postAnalyticsService.getPostAnalytics({
            postId,
            dateRange: input.dateRange,
          });

          const post = posts.find(p => p.id === postId);
          
          return {
            postId,
            title: post?.title || 'Unknown',
            metrics: {
              views: analytics.metrics.totalViews,
              uniqueVisitors: analytics.metrics.uniqueVisitors,
              avgEngagementTime: analytics.metrics.avgEngagementTimeSeconds,
              avgScrollDepth: analytics.metrics.avgScrollDepthPercentage,
              ctaClicks: analytics.metrics.ctaClicks,
              bounceRate: analytics.metrics.bounceRate,
              conversionRate: analytics.metrics.conversionRate,
            },
          };
        })
      );

      return {
        dateRange: input.dateRange,
        posts: comparisons,
      };
    }),

  // ========================================
  // A/B TESTING ENDPOINTS
  // ========================================

  /**
   * Create new A/B test experiment
   */
  createExperiment: protectedProcedure
    .input(createExperimentSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if user owns all target posts
      const posts = await prisma.post.findMany({
        where: { id: { in: input.postIds } },
        select: { id: true, authorId: true },
      });

      const unauthorized = posts.some(
        post => post.authorId !== ctx.session.userId && ctx.session.role !== 'ADMIN'
      );

      if (unauthorized) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only create experiments for posts you own',
        });
      }

      return postExperimentService.createExperiment(input, ctx.session.userId);
    }),

  /**
   * Update existing experiment
   */
  updateExperiment: protectedProcedure
    .input(updateExperimentSchema)
    .mutation(async ({ input, ctx }) => {
      return postExperimentService.updateExperiment(input, ctx.session.userId);
    }),

  /**
   * Get experiment results
   */
  getExperimentResults: protectedProcedure
    .input(getExperimentResultsSchema)
    .query(async ({ input, ctx }) => {
      // Check permissions - user must own the experiment or be admin
      const experiment = await prisma.postExperiment.findUnique({
        where: { id: input.experimentId },
        select: { createdBy: true },
      });

      if (!experiment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Experiment not found',
        });
      }

      if (
        experiment.createdBy !== ctx.session.userId &&
        ctx.session.role !== 'ADMIN'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only view experiments you created',
        });
      }

      return postExperimentService.getExperimentResults(input);
    }),

  /**
   * Get variant assignment for a post/session
   */
  getVariantAssignment: publicProcedure
    .input(z.object({
      postId: z.string().cuid(),
      sessionId: z.string().uuid(),
      userId: z.string().cuid().optional(),
    }))
    .query(async ({ input }) => {
      return postExperimentService.assignVariant(
        input.postId,
        input.sessionId,
        input.userId
      );
    }),

  /**
   * List experiments for a user
   */
  listExperiments: protectedProcedure
    .input(z.object({
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const experiments = await prisma.postExperiment.findMany({
        where: {
          createdBy: ctx.session.userId,
          ...(input.status && { status: input.status }),
        },
        include: {
          variants: {
            select: {
              id: true,
              name: true,
              isControl: true,
              trafficAllocation: true,
            },
          },
          postTargets: {
            include: {
              post: {
                select: { id: true, title: true },
              },
            },
          },
          _count: {
            select: { assignments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
      });

      return experiments.map(exp => ({
        id: exp.id,
        name: exp.name,
        status: exp.status,
        startDate: exp.startDate.toISOString(),
        endDate: exp.endDate.toISOString(),
        variants: exp.variants,
        posts: exp.postTargets.map(pt => pt.post),
        assignments: exp._count.assignments,
        createdAt: exp.createdAt.toISOString(),
      }));
    }),

  // ========================================
  // DASHBOARD ENDPOINTS
  // ========================================

  /**
   * Get analytics dashboard for user's posts
   */
  getDashboard: protectedProcedure
    .input(z.object({
      dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }).optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const { start, end } = input.dateRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      };

      // Get user's published posts
      const posts = await prisma.post.findMany({
        where: {
          authorId: ctx.session.userId,
          status: 'PUBLISHED',
          publishedAt: { lte: new Date(end) },
        },
        orderBy: { publishedAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          title: true,
          slug: true,
          publishedAt: true,
          viewCount: true,
        },
      });

      // Get aggregated metrics for each post
      const postMetrics = await Promise.all(
        posts.map(async (post) => {
          const dailyMetrics = await prisma.postDailyMetrics.findMany({
            where: {
              postId: post.id,
              date: { gte: new Date(start), lte: new Date(end) },
            },
          });

          const totalViews = dailyMetrics.reduce((sum, m) => sum + m.views, 0);
          const uniqueVisitors = dailyMetrics.reduce((sum, m) => sum + m.uniqueVisitors, 0);
          const avgEngagementTime = dailyMetrics.length > 0
            ? dailyMetrics.reduce((sum, m) => sum + m.avgEngagementTimeSeconds, 0) / dailyMetrics.length
            : 0;
          const ctaClicks = dailyMetrics.reduce((sum, m) => sum + m.ctaClicks, 0);

          return {
            ...post,
            metrics: {
              totalViews,
              uniqueVisitors,
              avgEngagementTime,
              ctaClicks,
            },
            publishedAt: post.publishedAt?.toISOString(),
          };
        })
      );

      return {
        dateRange: { start, end },
        posts: postMetrics,
      };
    }),
});
