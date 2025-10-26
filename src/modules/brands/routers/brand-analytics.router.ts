/**
 * Brand Analytics Router
 * tRPC routes for brand performance analytics and reporting
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { requirePermission } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/lib/constants/permissions';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { BrandAnalyticsService } from '../services/brand-analytics.service';
import {
  getCampaignAnalyticsSchema,
  getROIAnalysisSchema,
  getCreatorPerformanceSchema,
  getAssetUsageSchema,
  getSpendAnalysisSchema,
  getBudgetUtilizationSchema,
  getCostPerMetricSchema,
} from '../schemas/brand-analytics.schema';

// Initialize service
const brandAnalyticsService = new BrandAnalyticsService(prisma, redisConnection);

export const brandAnalyticsRouter = createTRPCRouter({
  /**
   * GET /analytics/brands/:id/campaigns
   * Get campaign performance analytics for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   * Requires finance:view_reports permission for financial metrics
   */
  getCampaignAnalytics: protectedProcedure
    .input(getCampaignAnalyticsSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getCampaignAnalytics(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/roi
   * Get ROI analysis for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   * Requires finance:view_reports permission
   */
  getROIAnalysis: protectedProcedure
    .input(getROIAnalysisSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getROIAnalysis(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/creator-performance
   * Get creator performance analytics for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   */
  getCreatorPerformance: protectedProcedure
    .input(getCreatorPerformanceSchema)
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getCreatorPerformance(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/asset-usage
   * Get asset usage analytics for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   */
  getAssetUsage: protectedProcedure
    .input(getAssetUsageSchema)
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getAssetUsage(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/spend-analysis
   * Get comprehensive spend analysis for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   * Requires finance:view_reports permission
   */
  getSpendAnalysis: protectedProcedure
    .input(getSpendAnalysisSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getSpendAnalysis(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/budget-utilization
   * Get budget utilization analysis for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   * Requires finance:view_reports permission
   */
  getBudgetUtilization: protectedProcedure
    .input(getBudgetUtilizationSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getBudgetUtilization(input);
      return { data };
    }),

  /**
   * GET /analytics/brands/:id/cost-per-metric
   * Get cost-per-metric efficiency analysis for a brand
   * 
   * Access: Brand owners, team members with analytics permission, and admins
   * Requires finance:view_reports permission
   */
  getCostPerMetric: protectedProcedure
    .input(getCostPerMetricSchema)
    .use(requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this brand's analytics
      await verifyBrandAccess(ctx.session.user.id, ctx.session.user.role, input.id);

      const data = await brandAnalyticsService.getCostPerMetric(input);
      return { data };
    }),

  /**
   * Admin-only: Get analytics for any brand
   */
  adminGetCampaignAnalytics: adminProcedure
    .input(getCampaignAnalyticsSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getCampaignAnalytics(input);
      return { data };
    }),

  adminGetROIAnalysis: adminProcedure
    .input(getROIAnalysisSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getROIAnalysis(input);
      return { data };
    }),

  adminGetCreatorPerformance: adminProcedure
    .input(getCreatorPerformanceSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getCreatorPerformance(input);
      return { data };
    }),

  adminGetAssetUsage: adminProcedure
    .input(getAssetUsageSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getAssetUsage(input);
      return { data };
    }),

  adminGetSpendAnalysis: adminProcedure
    .input(getSpendAnalysisSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getSpendAnalysis(input);
      return { data };
    }),

  adminGetBudgetUtilization: adminProcedure
    .input(getBudgetUtilizationSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getBudgetUtilization(input);
      return { data };
    }),

  adminGetCostPerMetric: adminProcedure
    .input(getCostPerMetricSchema)
    .query(async ({ input }) => {
      const data = await brandAnalyticsService.getCostPerMetric(input);
      return { data };
    }),
});

/**
 * Helper: Verify user has access to brand analytics
 */
async function verifyBrandAccess(
  userId: string,
  userRole: string,
  brandId: string
): Promise<void> {
  // Admins have access to all analytics
  if (userRole === 'ADMIN') {
    return;
  }

  // Get brand and verify ownership or team membership
  const brand = await prisma.brand.findUnique({
    where: { id: brandId, deletedAt: null },
  });

  if (!brand) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brand not found',
    });
  }

  // Check if user is the brand owner
  if (brand.userId === userId) {
    return;
  }

  // Check if user is a team member with analytics permission
  const teamMembers = (brand.teamMembers as any) || [];
  const userTeamMember = teamMembers.find((tm: any) => tm.userId === userId);

  if (userTeamMember) {
    const permissions = userTeamMember.permissions || [];
    if (permissions.includes('view_analytics') || permissions.includes('admin')) {
      return;
    }
  }

  // User does not have access
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'You do not have permission to view analytics for this brand',
  });
}
