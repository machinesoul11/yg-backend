/**
 * Analytics & Events Module Schemas
 * Zod validation schemas for event tracking and analytics
 */

import { z } from 'zod';
import { EVENT_TYPE_ARRAY, EVENT_SOURCES, ACTOR_TYPES, ENTITY_TYPES } from '@/lib/constants/event-types';

/**
 * Shared Validation Utilities
 */
export const eventTypeEnum = z.enum(EVENT_TYPE_ARRAY as [string, ...string[]]);

export const sourceEnum = z.enum([
  EVENT_SOURCES.WEB,
  EVENT_SOURCES.API,
  EVENT_SOURCES.MOBILE,
  EVENT_SOURCES.SYSTEM,
  EVENT_SOURCES.WEBHOOK,
]);

export const actorTypeEnum = z.enum([
  ACTOR_TYPES.USER,
  ACTOR_TYPES.CREATOR,
  ACTOR_TYPES.BRAND,
  ACTOR_TYPES.SYSTEM,
  ACTOR_TYPES.ADMIN,
]);

export const entityTypeEnum = z.enum([
  ENTITY_TYPES.PROJECT,
  ENTITY_TYPES.ASSET,
  ENTITY_TYPES.LICENSE,
  ENTITY_TYPES.CREATOR,
  ENTITY_TYPES.BRAND,
  ENTITY_TYPES.USER,
  ENTITY_TYPES.ROYALTY,
  ENTITY_TYPES.PAYOUT,
  ENTITY_TYPES.POST,
  ENTITY_TYPES.CATEGORY,
]);

/**
 * Date Range Schema
 */
export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).refine(
  (data) => new Date(data.start) < new Date(data.end),
  { message: "Start date must be before end date" }
);

/**
 * Attribution Schema
 */
export const attributionSchema = z.object({
  utmSource: z.string().max(255).optional(),
  utmMedium: z.string().max(255).optional(),
  utmCampaign: z.string().max(255).optional(),
  utmTerm: z.string().max(255).optional(),
  utmContent: z.string().max(255).optional(),
  referrer: z.string().url().optional().or(z.literal('')),
  landingPage: z.string().url().optional().or(z.literal('')),
});

/**
 * Track Event Schema
 */
export const trackEventSchema = z.object({
  eventType: z.string().max(100),
  source: sourceEnum.default(EVENT_SOURCES.WEB),
  entityId: z.string().cuid().optional(),
  entityType: entityTypeEnum.optional(),
  sessionId: z.string().uuid().optional(),
  props: z.record(z.string(), z.any()).optional(),
  attribution: attributionSchema.optional(),
  idempotencyKey: z.string().uuid().optional(),
}).refine(
  (data) => {
    // If entityId is provided, entityType must also be provided
    if (data.entityId && !data.entityType) return false;
    return true;
  },
  { message: "entityType is required when entityId is provided" }
);

export type TrackEventInput = z.infer<typeof trackEventSchema>;

/**
 * Get Asset Metrics Schema
 */
export const getAssetMetricsSchema = z.object({
  assetId: z.string().cuid(),
  dateRange: dateRangeSchema.optional(),
});

export type GetAssetMetricsInput = z.infer<typeof getAssetMetricsSchema>;

/**
 * Get Creator Dashboard Schema
 */
export const getCreatorDashboardSchema = z.object({
  creatorId: z.string().cuid(),
  period: z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d'),
});

export type GetCreatorDashboardInput = z.infer<typeof getCreatorDashboardSchema>;

/**
 * Get Brand Campaign Metrics Schema
 */
export const getBrandCampaignMetricsSchema = z.object({
  brandId: z.string().cuid(),
  campaignId: z.string().cuid().optional(),
  dateRange: dateRangeSchema,
});

export type GetBrandCampaignMetricsInput = z.infer<typeof getBrandCampaignMetricsSchema>;

/**
 * Export Events Schema
 */
export const exportEventsSchema = z.object({
  filters: z.object({
    eventTypes: z.array(z.string()).optional(),
    dateRange: dateRangeSchema,
    actorId: z.string().cuid().optional(),
    projectId: z.string().cuid().optional(),
  }),
  format: z.enum(['csv', 'json']).default('csv'),
});

export type ExportEventsInput = z.infer<typeof exportEventsSchema>;

/**
 * Get Platform Metrics Schema
 */
export const getPlatformMetricsSchema = z.object({
  period: z.enum(['today', '7d', '30d', '90d']).default('30d'),
});

export type GetPlatformMetricsInput = z.infer<typeof getPlatformMetricsSchema>;

/**
 * Period Enum for convenience
 */
export const ANALYTICS_PERIODS = {
  TODAY: 'today',
  SEVEN_DAYS: '7d',
  THIRTY_DAYS: '30d',
  NINETY_DAYS: '90d',
  ONE_YEAR: '1y',
  ALL_TIME: 'all',
} as const;

// ========================================
// POST ANALYTICS SCHEMAS
// ========================================

/**
 * Post View Event Schema
 */
export const trackPostViewSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  experimentId: z.string().cuid().optional(),
  variantId: z.string().cuid().optional(),
  attribution: attributionSchema.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type TrackPostViewInput = z.infer<typeof trackPostViewSchema>;

/**
 * Post Engagement Time Event Schema
 */
export const trackEngagementTimeSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  engagementTimeSeconds: z.number().min(0).max(86400), // Max 24 hours
  cumulativeTime: z.number().min(0),
  isActiveTime: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type TrackEngagementTimeInput = z.infer<typeof trackEngagementTimeSchema>;

/**
 * Post Scroll Depth Event Schema
 */
export const trackScrollDepthSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  scrollDepthPercentage: z.number().min(0).max(100),
  maxScrollDepth: z.number().min(0).max(100),
  milestone: z.enum(['25', '50', '75', '100']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type TrackScrollDepthInput = z.infer<typeof trackScrollDepthSchema>;

/**
 * Post CTA Click Event Schema
 */
export const trackCtaClickSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  ctaId: z.string(),
  ctaType: z.enum(['button', 'link', 'form', 'download', 'subscribe', 'share', 'comment']),
  ctaText: z.string().max(255),
  ctaPosition: z.string().optional(), // e.g., "header", "sidebar", "inline", "footer"
  destinationUrl: z.string().url().optional(),
  conversionValue: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type TrackCtaClickInput = z.infer<typeof trackCtaClickSchema>;

/**
 * Post Analytics Overview Schema
 */
export const getPostAnalyticsSchema = z.object({
  postId: z.string().cuid(),
  dateRange: dateRangeSchema.optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  includeExperiments: z.boolean().default(false),
});

export type GetPostAnalyticsInput = z.infer<typeof getPostAnalyticsSchema>;

/**
 * Post Time Series Metrics Schema
 */
export const getPostTimeSeriesSchema = z.object({
  postId: z.string().cuid(),
  dateRange: dateRangeSchema.optional(),
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  metrics: z.array(z.enum([
    'views', 
    'unique_visitors', 
    'engagement_time', 
    'scroll_depth', 
    'cta_clicks',
    'bounce_rate',
    'conversion_rate'
  ])).default(['views', 'unique_visitors']),
});

export type GetPostTimeSeriesInput = z.infer<typeof getPostTimeSeriesSchema>;

/**
 * Post Referrers Analysis Schema
 */
export const getPostReferrersSchema = z.object({
  postId: z.string().cuid(),
  dateRange: dateRangeSchema.optional(),
  limit: z.number().min(1).max(100).default(20),
  groupBy: z.enum(['domain', 'source', 'campaign', 'medium']).default('domain'),
});

export type GetPostReferrersInput = z.infer<typeof getPostReferrersSchema>;

/**
 * Compare Posts Schema
 */
export const comparePostsSchema = z.object({
  postIds: z.array(z.string().cuid()).min(2).max(10),
  dateRange: dateRangeSchema.optional(),
  metrics: z.array(z.enum([
    'views', 
    'unique_visitors', 
    'avg_engagement_time', 
    'avg_scroll_depth', 
    'cta_clicks',
    'bounce_rate',
    'conversion_rate'
  ])).default(['views', 'unique_visitors', 'avg_engagement_time']),
});

export type ComparePostsInput = z.infer<typeof comparePostsSchema>;

// ========================================
// A/B TESTING SCHEMAS
// ========================================

/**
 * Create Experiment Schema
 */
export const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  postIds: z.array(z.string().cuid()).min(1),
  variants: z.array(z.object({
    id: z.string().cuid(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    trafficAllocation: z.number().min(0).max(100),
    content: z.record(z.string(), z.any()), // headline, image, etc.
  })).min(2).max(5),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  successMetrics: z.array(z.enum([
    'views', 
    'engagement_time', 
    'scroll_depth', 
    'cta_clicks',
    'conversion_rate'
  ])).min(1),
  trafficAllocation: z.number().min(10).max(100).default(50),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
});

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;

/**
 * Update Experiment Schema
 */
export const updateExperimentSchema = createExperimentSchema.partial().extend({
  id: z.string().cuid(),
});

export type UpdateExperimentInput = z.infer<typeof updateExperimentSchema>;

/**
 * Get Experiment Results Schema
 */
export const getExperimentResultsSchema = z.object({
  experimentId: z.string().cuid(),
  includeStatistics: z.boolean().default(true),
  confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
});

export type GetExperimentResultsInput = z.infer<typeof getExperimentResultsSchema>;

/**
 * Experiment Assignment Schema
 */
export const experimentAssignmentSchema = z.object({
  experimentId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  variantId: z.string().cuid(),
  assignedAt: z.string().datetime(),
});

export type ExperimentAssignmentInput = z.infer<typeof experimentAssignmentSchema>;
