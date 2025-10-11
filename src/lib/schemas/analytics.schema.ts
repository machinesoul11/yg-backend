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
