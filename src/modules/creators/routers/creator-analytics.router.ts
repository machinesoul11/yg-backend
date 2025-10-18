/**
 * Creator Analytics Router (tRPC)
 * API endpoints for creator performance analytics
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { CreatorAnalyticsService } from '../services/creator-analytics.service';
import {
  getEngagementAnalyticsSchema,
  getPortfolioPerformanceSchema,
  getLicenseMetricsSchema,
  getBenchmarksSchema,
} from '../schemas/creator-analytics.schema';

// Initialize service
const analyticsService = new CreatorAnalyticsService(prisma);

/**
 * Helper to check if user can access creator analytics
 */
async function verifyCreatorAccess(userId: string, creatorId: string, role: string) {
  // Admins can access all analytics
  if (role === 'ADMIN') {
    return true;
  }

  // Creators can only access their own analytics
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { userId: true },
  });

  if (!creator) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Creator not found' });
  }

  if (creator.userId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this creator\'s analytics',
    });
  }

  return true;
}

/**
 * Creator Analytics Router
 */
export const creatorAnalyticsRouter = createTRPCRouter({
  /**
   * GET /analytics/creators/:id/engagement
   * Get engagement analytics (views, clicks, conversions)
   */
  getEngagement: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
        compareWithPrevious: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      const userRole = ctx.session?.user?.role || 'VIEWER';

      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify access
      await verifyCreatorAccess(userId, input.id, userRole);

      // Get analytics
      return await analyticsService.getEngagementAnalytics(input);
    }),

  /**
   * GET /analytics/creators/:id/portfolio-performance
   * Get portfolio performance analytics
   */
  getPortfolioPerformance: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        sortBy: z
          .enum(['views', 'conversions', 'revenue', 'engagementRate', 'title'])
          .optional()
          .default('views'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        assetType: z
          .enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'THREE_D', 'OTHER'])
          .optional(),
        status: z
          .enum(['DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED'])
          .optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      const userRole = ctx.session?.user?.role || 'VIEWER';

      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify access
      await verifyCreatorAccess(userId, input.id, userRole);

      // Get portfolio performance
      return await analyticsService.getPortfolioPerformance(input);
    }),

  /**
   * GET /analytics/creators/:id/license-metrics
   * Get license metrics
   */
  getLicenseMetrics: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        groupBy: z.enum(['status', 'type', 'month', 'asset']).optional().default('status'),
        includeExpired: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      const userRole = ctx.session?.user?.role || 'VIEWER';

      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify access
      await verifyCreatorAccess(userId, input.id, userRole);

      // Get license metrics
      return await analyticsService.getLicenseMetrics(input);
    }),

  /**
   * GET /analytics/creators/:id/benchmarks
   * Get benchmark comparison
   */
  getBenchmarks: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        segment: z.enum(['all', 'specialty', 'experience', 'category']).optional().default('all'),
        metrics: z
          .array(
            z.enum([
              'engagementRate',
              'conversionRate',
              'avgRevenuePerAsset',
              'licenseVelocity',
              'portfolioGrowth',
              'viewsPerAsset',
            ])
          )
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      const userRole = ctx.session?.user?.role || 'VIEWER';

      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify access
      await verifyCreatorAccess(userId, input.id, userRole);

      // Get benchmarks
      return await analyticsService.getBenchmarks(input);
    }),

  /**
   * Admin-only endpoint to get analytics for any creator
   */
  getCreatorAnalyticsSummary: adminProcedure
    .input(
      z.object({
        creatorId: z.string().cuid(),
        dateRange: z
          .object({
            start: z.string().datetime(),
            end: z.string().datetime(),
          })
          .optional(),
      })
    )
    .query(async ({ input }) => {
      const startDate =
        input.dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = input.dateRange?.end || new Date().toISOString();

      // Get all analytics in parallel
      const [engagement, portfolio, licenses, benchmarks] = await Promise.all([
        analyticsService.getEngagementAnalytics({
          id: input.creatorId,
          startDate,
          endDate,
          granularity: 'day',
          compareWithPrevious: false,
        }),
        analyticsService.getPortfolioPerformance({
          id: input.creatorId,
          startDate,
          endDate,
          sortBy: 'views',
          sortOrder: 'desc',
          limit: 10,
          offset: 0,
        }),
        analyticsService.getLicenseMetrics({
          id: input.creatorId,
          startDate,
          endDate,
          groupBy: 'status',
          includeExpired: false,
        }),
        analyticsService.getBenchmarks({
          id: input.creatorId,
          startDate,
          endDate,
          segment: 'all',
        }),
      ]);

      return {
        engagement,
        portfolio,
        licenses,
        benchmarks,
      };
    }),
});
