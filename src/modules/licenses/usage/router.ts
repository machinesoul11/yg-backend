/**
 * License Usage Tracking tRPC Router
 * API endpoints for usage tracking, analytics, thresholds, and forecasting
 */

import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { z } from 'zod';
import {
  trackUsageEventSchema,
  batchTrackUsageSchema,
  getUsageAnalyticsSchema,
  comparePeriodsSchema,
  createThresholdSchema,
  updateThresholdSchema,
  getThresholdStatusSchema,
  approveOverageSchema,
  getOveragesSchema,
  generateForecastSchema,
  getForecastsSchema,
} from './schemas';
import {
  usageTrackingService,
  usageAnalyticsService,
  usageThresholdService,
  usageForecastingService,
} from './index';

export const usageRouter = createTRPCRouter({
  // ========================================================================
  // Usage Event Tracking
  // ========================================================================

  trackEvent: protectedProcedure
    .input(trackUsageEventSchema)
    .mutation(async ({ input }) => {
      return usageTrackingService.trackUsageEvent(input);
    }),

  trackBatch: protectedProcedure
    .input(batchTrackUsageSchema)
    .mutation(async ({ input }) => {
      return usageTrackingService.trackBatchUsageEvents(input);
    }),

  getCurrentUsage: protectedProcedure
    .input(
      z.object({
        licenseId: z.string().cuid(),
        usageType: z.string().optional(),
        periodType: z.enum(['daily', 'weekly', 'monthly', 'total']).default('total'),
      })
    )
    .query(async ({ input }) => {
      return usageTrackingService.getCurrentUsage(
        input.licenseId,
        input.usageType,
        input.periodType
      );
    }),

  getUsageBreakdown: protectedProcedure
    .input(
      z.object({
        licenseId: z.string().cuid(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      return usageTrackingService.getUsageBreakdown(
        input.licenseId,
        input.startDate,
        input.endDate
      );
    }),

  // ========================================================================
  // Analytics & Reporting
  // ========================================================================

  getAnalytics: protectedProcedure
    .input(getUsageAnalyticsSchema)
    .query(async ({ input }) => {
      return usageAnalyticsService.getUsageAnalytics(input);
    }),

  comparePeriods: protectedProcedure
    .input(comparePeriodsSchema)
    .query(async ({ input }) => {
      return usageAnalyticsService.comparePeriods(input);
    }),

  // ========================================================================
  // Thresholds & Overages
  // ========================================================================

  createThreshold: protectedProcedure
    .input(createThresholdSchema)
    .mutation(async ({ input }) => {
      return usageThresholdService.createThreshold(input);
    }),

  updateThreshold: protectedProcedure
    .input(updateThresholdSchema)
    .mutation(async ({ input }) => {
      return usageThresholdService.updateThreshold(input);
    }),

  getThresholdStatus: protectedProcedure
    .input(getThresholdStatusSchema)
    .query(async ({ input }) => {
      return usageThresholdService.getThresholdStatus(
        input.licenseId,
        input.usageType
      );
    }),

  checkThresholds: adminProcedure
    .input(z.object({ licenseId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      await usageThresholdService.checkThresholds(input.licenseId);
      return { success: true };
    }),

  getOverages: protectedProcedure
    .input(getOveragesSchema)
    .query(async ({ input }) => {
      return usageThresholdService.getOverages(
        input.licenseId,
        input.brandId,
        input.status,
        input.startDate,
        input.endDate
      );
    }),

  approveOverage: adminProcedure
    .input(approveOverageSchema)
    .mutation(async ({ input, ctx }) => {
      return usageThresholdService.approveOverage({
        ...input,
        approvedBy: ctx.session.user.id,
      });
    }),

  // ========================================================================
  // Forecasting
  // ========================================================================

  generateForecast: protectedProcedure
    .input(generateForecastSchema)
    .mutation(async ({ input }) => {
      return usageForecastingService.generateForecast(input);
    }),

  getForecasts: protectedProcedure
    .input(getForecastsSchema)
    .query(async ({ input, ctx }) => {
      const { licenseId, usageType, limit } = input;
      
      return ctx.db.licenseUsageForecast.findMany({
        where: {
          licenseId,
          ...(usageType && { usageType }),
        },
        orderBy: {
          forecastDate: 'desc',
        },
        take: limit,
      });
    }),

  // ========================================================================
  // Admin Functions
  // ========================================================================

  recalculateAggregates: adminProcedure
    .input(
      z.object({
        licenseId: z.string().cuid(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { usageAggregationService } = await import('./index');
      await usageAggregationService.recalculateAggregates(
        input.licenseId,
        input.startDate,
        input.endDate
      );
      return { success: true };
    }),

  getAggregationStatus: adminProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ input }) => {
      const { usageAggregationService } = await import('./index');
      return usageAggregationService.getAggregationStatus(input.date);
    }),
});

export type UsageRouter = typeof usageRouter;
