/**
 * Creator Analytics Schemas
 * Zod validation schemas for creator performance analytics endpoints
 */

import { z } from 'zod';

/**
 * Date range query parameters
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * GET /analytics/creators/:id/engagement
 * Query parameters for engagement analytics
 */
export const getEngagementAnalyticsSchema = z.object({
  id: z.string().cuid(),
  ...dateRangeSchema.shape,
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  compareWithPrevious: z.boolean().optional().default(false),
});

/**
 * GET /analytics/creators/:id/portfolio-performance
 * Query parameters for portfolio performance analytics
 */
export const getPortfolioPerformanceSchema = z.object({
  id: z.string().cuid(),
  ...dateRangeSchema.shape,
  sortBy: z.enum(['views', 'conversions', 'revenue', 'engagementRate', 'title']).optional().default('views'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  assetType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'THREE_D', 'OTHER']).optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * GET /analytics/creators/:id/license-metrics
 * Query parameters for license metrics
 */
export const getLicenseMetricsSchema = z.object({
  id: z.string().cuid(),
  ...dateRangeSchema.shape,
  groupBy: z.enum(['status', 'type', 'month', 'asset']).optional().default('status'),
  includeExpired: z.boolean().optional().default(false),
});

/**
 * GET /analytics/creators/:id/benchmarks
 * Query parameters for benchmark comparison
 */
export const getBenchmarksSchema = z.object({
  id: z.string().cuid(),
  ...dateRangeSchema.shape,
  segment: z.enum(['all', 'specialty', 'experience', 'category']).optional().default('all'),
  metrics: z.array(
    z.enum([
      'engagementRate',
      'conversionRate',
      'avgRevenuePerAsset',
      'licenseVelocity',
      'portfolioGrowth',
      'viewsPerAsset',
    ])
  ).optional(),
});

// Type exports for use in services and routers
export type GetEngagementAnalyticsInput = z.infer<typeof getEngagementAnalyticsSchema>;
export type GetPortfolioPerformanceInput = z.infer<typeof getPortfolioPerformanceSchema>;
export type GetLicenseMetricsInput = z.infer<typeof getLicenseMetricsSchema>;
export type GetBenchmarksInput = z.infer<typeof getBenchmarksSchema>;
