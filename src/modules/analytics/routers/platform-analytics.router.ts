/**
 * Platform Analytics Router
 * Admin-only tRPC routes for platform-wide analytics
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, adminProcedure } from '@/lib/trpc';
import { requirePermission } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/lib/constants/permissions';
import { PlatformAnalyticsService } from '@/modules/analytics/services/platform-analytics.service';
import { RevenueAnalyticsService } from '@/modules/analytics/services/revenue-analytics.service';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import {
  getPlatformUserAnalyticsSchema,
  getPlatformEngagementAnalyticsSchema,
  getPlatformCohortAnalysisSchema,
  getPlatformRevenueAnalyticsSchema,
  getPlatformTransactionAnalyticsSchema,
  getPlatformLTVAnalyticsSchema,
} from '@/lib/schemas/analytics.schema';

// Initialize services
const platformAnalyticsService = new PlatformAnalyticsService(
  prisma,
  redisConnection
);

const revenueAnalyticsService = new RevenueAnalyticsService(
  prisma,
  redisConnection
);

export const platformAnalyticsRouter = createTRPCRouter({
  /**
   * GET /analytics/platform/users
   * Get user acquisition, retention, and churn metrics
   * Admin only
   */
  getUsers: adminProcedure
    .input(getPlatformUserAnalyticsSchema)
    .query(async ({ input }) => {
      return platformAnalyticsService.getUserAnalytics(
        input.period,
        input.granularity
      );
    }),

  /**
   * GET /analytics/platform/engagement
   * Get DAU, MAU, and session metrics
   * Admin only
   */
  getEngagement: adminProcedure
    .input(getPlatformEngagementAnalyticsSchema)
    .query(async ({ input }) => {
      return platformAnalyticsService.getEngagementAnalytics(input.period);
    }),

  /**
   * GET /analytics/platform/cohorts
   * Get cohort analysis with retention, revenue, or engagement metrics
   * Admin only
   */
  getCohorts: adminProcedure
    .input(getPlatformCohortAnalysisSchema)
    .query(async ({ input }) => {
      return platformAnalyticsService.getCohortAnalysis(
        input.cohortType,
        input.metric,
        input.period
      );
    }),

  /**
   * GET /analytics/platform/revenue
   * Get MRR, ARR, and revenue growth metrics
   * Admin only - Requires finance:view_reports permission
   */
  getRevenue: adminProcedure
    .input(getPlatformRevenueAnalyticsSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : undefined;
      const endDate = input.endDate ? new Date(input.endDate) : undefined;
      
      return revenueAnalyticsService.getRevenueMetrics(
        startDate,
        endDate,
        input.groupBy
      );
    }),

  /**
   * GET /analytics/platform/transactions
   * Get transaction volume and value analytics
   * Admin only - Requires finance:view_reports permission
   */
  getTransactions: adminProcedure
    .input(getPlatformTransactionAnalyticsSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : undefined;
      const endDate = input.endDate ? new Date(input.endDate) : undefined;
      
      return revenueAnalyticsService.getTransactionAnalytics(
        startDate,
        endDate,
        input.status,
        input.groupBy
      );
    }),

  /**
   * GET /analytics/platform/ltv
   * Get customer lifetime value analytics
   * Admin only - Requires finance:view_reports permission
   */
  getLTV: adminProcedure
    .input(getPlatformLTVAnalyticsSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : undefined;
      const endDate = input.endDate ? new Date(input.endDate) : undefined;
      
      return revenueAnalyticsService.getLTVAnalytics(
        startDate,
        endDate,
        input.segmentBy
      );
    }),

  /**
   * POST /analytics/platform/invalidate-cache
   * Invalidate platform analytics cache
   * Admin only
   */
  invalidateCache: adminProcedure
    .input(
      z.object({
        scope: z.enum(['users', 'engagement', 'cohorts', 'revenue', 'transactions', 'ltv', 'all']).default('all'),
      })
    )
    .mutation(async ({ input }) => {
      // Invalidate user/engagement/cohorts cache
      if (['users', 'engagement', 'cohorts', 'all'].includes(input.scope)) {
        await platformAnalyticsService.invalidateCache(
          input.scope as 'users' | 'engagement' | 'cohorts' | 'all'
        );
      }
      
      // Invalidate revenue analytics cache
      if (['revenue', 'transactions', 'ltv', 'all'].includes(input.scope)) {
        await revenueAnalyticsService.invalidateCache(
          input.scope as 'revenue' | 'transactions' | 'ltv' | 'all'
        );
      }
      
      return {
        success: true,
        message: `Cache invalidated for scope: ${input.scope}`,
      };
    }),
});
