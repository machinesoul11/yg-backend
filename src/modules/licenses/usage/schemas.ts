/**
 * License Usage Tracking Schemas
 * Zod validation schemas for usage tracking inputs
 */

import { z } from 'zod';

// ============================================================================
// Usage Event Schemas
// ============================================================================

export const usageTypeSchema = z.enum([
  'view',
  'download',
  'impression',
  'click',
  'play',
  'stream',
  'custom',
]);

export const platformSchema = z.enum([
  'web',
  'mobile',
  'tv',
  'print',
  'social',
  'other',
]);

export const deviceTypeSchema = z.enum([
  'desktop',
  'mobile',
  'tablet',
  'tv',
  'other',
]);

export const trackUsageEventSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema,
  quantity: z.number().int().positive().default(1),
  geographicLocation: z.string().max(100).optional(),
  platform: platformSchema.optional(),
  deviceType: deviceTypeSchema.optional(),
  referrer: z.string().url().optional().or(z.literal('')),
  revenueCents: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.any()).optional(),
  sessionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const batchTrackUsageSchema = z.object({
  events: z.array(trackUsageEventSchema).min(1).max(1000),
  batchId: z.string().optional(),
});

// ============================================================================
// Analytics Schemas
// ============================================================================

export const granularitySchema = z.enum(['daily', 'weekly', 'monthly']);

export const getUsageAnalyticsSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  usageType: usageTypeSchema.optional(),
  granularity: granularitySchema.default('daily'),
  compareWithPreviousPeriod: z.boolean().default(false),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

export const comparePeriodsSchema = z.object({
  licenseId: z.string().cuid(),
  period1Start: z.coerce.date(),
  period1End: z.coerce.date(),
  period2Start: z.coerce.date(),
  period2End: z.coerce.date(),
  usageType: usageTypeSchema.optional(),
}).refine(
  (data) => 
    data.period1End >= data.period1Start && 
    data.period2End >= data.period2Start,
  { message: 'Period end dates must be after or equal to start dates' }
);

export const getUsageTrendsSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  usageType: usageTypeSchema.optional(),
  granularity: granularitySchema.default('daily'),
});

export const getTopSourcesSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  limit: z.number().int().positive().max(100).default(10),
});

// ============================================================================
// Threshold Schemas
// ============================================================================

export const periodTypeSchema = z.enum(['daily', 'weekly', 'monthly', 'total']);

export const createThresholdSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema,
  limitQuantity: z.number().int().positive(),
  periodType: periodTypeSchema,
  gracePercentage: z.number().int().min(0).max(100).default(0),
  warningAt50: z.boolean().default(true),
  warningAt75: z.boolean().default(true),
  warningAt90: z.boolean().default(true),
  warningAt100: z.boolean().default(true),
  allowOverage: z.boolean().default(false),
  overageRateCents: z.number().int().nonnegative().optional(),
});

export const updateThresholdSchema = z.object({
  thresholdId: z.string().cuid(),
  limitQuantity: z.number().int().positive().optional(),
  gracePercentage: z.number().int().min(0).max(100).optional(),
  warningAt50: z.boolean().optional(),
  warningAt75: z.boolean().optional(),
  warningAt90: z.boolean().optional(),
  warningAt100: z.boolean().optional(),
  allowOverage: z.boolean().optional(),
  overageRateCents: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const getThresholdStatusSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema.optional(),
});

export const checkThresholdsSchema = z.object({
  licenseId: z.string().cuid(),
  date: z.coerce.date().optional(),
});

// ============================================================================
// Overage Schemas
// ============================================================================

export const overageStatusSchema = z.enum([
  'DETECTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'BILLED',
  'DISPUTED',
]);

export const detectOveragesSchema = z.object({
  licenseId: z.string().cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const approveOverageSchema = z.object({
  overageId: z.string().cuid(),
  approvedBy: z.string().cuid(),
  billedFeeCents: z.number().int().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

export const disputeOverageSchema = z.object({
  overageId: z.string().cuid(),
  reason: z.string().min(10).max(1000),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const getOveragesSchema = z.object({
  licenseId: z.string().cuid().optional(),
  brandId: z.string().cuid().optional(),
  status: overageStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

// ============================================================================
// Forecast Schemas
// ============================================================================

export const forecastingMethodSchema = z.enum([
  'LINEAR_REGRESSION',
  'MOVING_AVERAGE',
  'EXPONENTIAL_SMOOTHING',
  'SEASONAL_DECOMPOSITION',
]);

export const generateForecastSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  forecastingMethod: forecastingMethodSchema.default('LINEAR_REGRESSION'),
  historicalDays: z.number().int().positive().max(365).default(30),
  confidenceLevel: z.number().min(0.5).max(0.99).default(0.95),
}).refine(
  (data) => data.periodEnd > data.periodStart,
  { message: 'Period end must be after period start' }
);

export const getForecastsSchema = z.object({
  licenseId: z.string().cuid(),
  usageType: usageTypeSchema.optional(),
  limit: z.number().int().positive().max(100).default(10),
});

export const validateForecastSchema = z.object({
  forecastId: z.string().cuid(),
  actualDate: z.coerce.date(),
});

// ============================================================================
// Dashboard Schemas
// ============================================================================

export const getUsageDashboardSchema = z.object({
  licenseId: z.string().cuid(),
  dateRange: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }).optional(),
});

export const getDashboardAlertsSchema = z.object({
  licenseId: z.string().cuid().optional(),
  brandId: z.string().cuid().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  limit: z.number().int().positive().max(100).default(20),
});

// ============================================================================
// Reporting Schemas
// ============================================================================

export const reportFormatSchema = z.enum(['pdf', 'csv', 'json']);

export const usageReportConfigSchema = z.object({
  licenseIds: z.array(z.string().cuid()).optional(),
  brandId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  includeForecasts: z.boolean().default(false),
  includeOverages: z.boolean().default(true),
  includeComparisons: z.boolean().default(false),
  format: reportFormatSchema.default('pdf'),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
).refine(
  (data) => data.licenseIds || data.brandId || data.creatorId,
  { message: 'Must specify at least one of: licenseIds, brandId, or creatorId' }
);

export const generateUsageReportSchema = usageReportConfigSchema;

export const scheduledReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  recipients: z.array(z.string().email()).min(1).max(20),
  reportConfig: usageReportConfigSchema,
  isActive: z.boolean().default(true),
});

export const createScheduledReportSchema = scheduledReportConfigSchema;

export const updateScheduledReportSchema = scheduledReportConfigSchema.partial().extend({
  id: z.string().cuid(),
});

export const getScheduledReportsSchema = z.object({
  isActive: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

// ============================================================================
// Billing Integration Schemas
// ============================================================================

export const createUsageInvoiceSchema = z.object({
  overageId: z.string().cuid(),
  brandId: z.string().cuid(),
  feeCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  dueDate: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const processUsageBillingSchema = z.object({
  overageIds: z.array(z.string().cuid()).min(1).max(100),
  autoApprove: z.boolean().default(false),
  billingDate: z.coerce.date().optional(),
});

// ============================================================================
// Admin Schemas
// ============================================================================

export const bulkDetectOveragesSchema = z.object({
  licenseIds: z.array(z.string().cuid()).optional(),
  brandId: z.string().cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const recalculateAggregatesSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const backfillUsageDataSchema = z.object({
  licenseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  source: z.enum(['events', 'daily_metrics', 'manual']),
});

// ============================================================================
// Type Exports
// ============================================================================

export type TrackUsageEventInput = z.infer<typeof trackUsageEventSchema>;
export type BatchTrackUsageInput = z.infer<typeof batchTrackUsageSchema>;
export type GetUsageAnalyticsInput = z.infer<typeof getUsageAnalyticsSchema>;
export type ComparePeriodsInput = z.infer<typeof comparePeriodsSchema>;
export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type ApproveOverageInput = z.infer<typeof approveOverageSchema>;
export type GenerateForecastInput = z.infer<typeof generateForecastSchema>;
export type UsageReportConfig = z.infer<typeof usageReportConfigSchema>;
export type ScheduledReportConfig = z.infer<typeof scheduledReportConfigSchema>;
export type CreateUsageInvoiceInput = z.infer<typeof createUsageInvoiceSchema>;
