/**
 * Brand Analytics Schemas
 * Zod validation schemas for brand analytics endpoints
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
 * GET /analytics/brands/:id/campaigns
 * Query parameters for campaign performance analytics
 */
export const getCampaignAnalyticsSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  sortBy: z.enum(['roi', 'conversions', 'spent', 'startDate', 'name']).optional().default('startDate'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * GET /analytics/brands/:id/roi
 * Query parameters for ROI analysis
 */
export const getROIAnalysisSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  granularity: z.enum(['day', 'week', 'month', 'quarter']).optional().default('month'),
  includeCampaignBreakdown: z.boolean().optional().default(true),
  compareWithIndustry: z.boolean().optional().default(false),
});

/**
 * GET /analytics/brands/:id/creator-performance
 * Query parameters for creator performance analytics
 */
export const getCreatorPerformanceSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  sortBy: z.enum([
    'engagementRate',
    'conversions',
    'costPerEngagement',
    'totalSpent',
    'collaborations',
    'name'
  ]).optional().default('engagementRate'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  minCollaborations: z.number().int().min(1).optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * GET /analytics/brands/:id/asset-usage
 * Query parameters for asset usage analytics
 */
export const getAssetUsageSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  assetType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'THREE_D', 'OTHER']).optional(),
  usageStatus: z.enum(['all', 'used', 'unused']).optional().default('all'),
  sortBy: z.enum([
    'performanceScore',
    'usageCount',
    'engagementRate',
    'uploadedAt',
    'title'
  ]).optional().default('performanceScore'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  minUsageCount: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * GET /analytics/brands/:id/spend-analysis
 * Query parameters for spend analysis
 */
export const getSpendAnalysisSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  granularity: z.enum(['day', 'week', 'month']).optional().default('month'),
  groupBy: z.array(z.enum(['project', 'licenseType', 'creator'])).optional().default(['project', 'licenseType', 'creator']),
});

/**
 * GET /analytics/brands/:id/budget-utilization
 * Query parameters for budget utilization analysis
 */
export const getBudgetUtilizationSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  projectStatus: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  alertThreshold: z.number().min(0).max(100).optional().default(90), // Alert when utilization reaches this percentage
  includeProjections: z.boolean().optional().default(true),
});

/**
 * GET /analytics/brands/:id/cost-per-metric
 * Query parameters for cost-per-metric analysis
 */
export const getCostPerMetricSchema = z.object({
  id: z.string().cuid('Invalid brand ID format'),
  ...dateRangeSchema.shape,
  metrics: z.array(z.enum(['view', 'click', 'conversion', 'engagement'])).optional().default(['view', 'click', 'conversion']),
  groupBy: z.enum(['asset', 'project', 'creator', 'all']).optional().default('all'),
  minThreshold: z.number().int().min(0).optional().default(100), // Minimum events required to calculate cost-per-metric
  includeBenchmarks: z.boolean().optional().default(false),
});

// Type exports for use in services and routers
export type GetCampaignAnalyticsInput = z.infer<typeof getCampaignAnalyticsSchema>;
export type GetROIAnalysisInput = z.infer<typeof getROIAnalysisSchema>;
export type GetCreatorPerformanceInput = z.infer<typeof getCreatorPerformanceSchema>;
export type GetAssetUsageInput = z.infer<typeof getAssetUsageSchema>;
export type GetSpendAnalysisInput = z.infer<typeof getSpendAnalysisSchema>;
export type GetBudgetUtilizationInput = z.infer<typeof getBudgetUtilizationSchema>;
export type GetCostPerMetricInput = z.infer<typeof getCostPerMetricSchema>;
