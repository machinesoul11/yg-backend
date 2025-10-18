/**
 * Search Validation Schemas
 * Zod validation schemas for search operations
 */

import { z } from 'zod';

// Searchable entity types
export const searchableEntitySchema = z.enum(['assets', 'creators', 'projects', 'licenses']);

// Search filters schema
export const searchFiltersSchema = z.object({
  // Asset filters
  assetType: z.array(z.string()).optional(),
  assetStatus: z.array(z.string()).optional(),
  projectId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  
  // Creator filters
  verificationStatus: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  availabilityStatus: z.enum(['available', 'limited', 'unavailable']).optional(),
  
  // Project filters
  projectType: z.array(z.string()).optional(),
  projectStatus: z.array(z.string()).optional(),
  brandId: z.string().cuid().optional(),
  
  // License filters
  licenseType: z.array(z.string()).optional(),
  licenseStatus: z.array(z.string()).optional(),
  
  // Common filters
  dateFrom: z.string().datetime().optional().or(z.date().optional()),
  dateTo: z.string().datetime().optional().or(z.date().optional()),
  createdBy: z.string().cuid().optional(),
  tags: z.array(z.string()).optional(),
}).optional();

// Search query schema
export const searchQuerySchema = z.object({
  query: z.string()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query must be at most 200 characters')
    .trim(),
  entities: z.array(searchableEntitySchema).optional(),
  filters: searchFiltersSchema,
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['relevance', 'created_at', 'updated_at', 'title', 'name', 'verified_at', 'total_collaborations', 'total_revenue', 'average_rating']).optional().default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Analytics query schemas
export const searchAnalyticsQuerySchema = z.object({
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
});

export const zeroResultQueriesSchema = z.object({
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const performanceMetricsSchema = z.object({
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
});

export const trendingSearchesSchema = z.object({
  hours: z.number().int().min(1).max(168).optional().default(24),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const trackClickSchema = z.object({
  eventId: z.string().cuid(),
  resultId: z.string().cuid(),
  resultPosition: z.number().int().min(0),
  resultEntityType: searchableEntitySchema,
});

// Enhanced faceted search schema
export const enhancedFacetsSchema = z.object({
  query: z.string().optional().default(''),
  entities: z.array(searchableEntitySchema).optional(),
  filters: searchFiltersSchema,
});

// Spell correction schema
export const spellCorrectionSchema = z.object({
  query: z.string().min(2).max(200).trim(),
  currentResultCount: z.number().int().min(0),
});

// Related content schema
export const relatedContentSchema = z.object({
  entityType: searchableEntitySchema,
  entityId: z.string().cuid(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  includeTypes: z.array(z.enum([
    'similar_content',
    'same_category',
    'same_creator',
    'same_project',
    'collaborative_filtering',
    'frequently_viewed_together',
  ])).optional(),
  excludeIds: z.array(z.string().cuid()).optional(),
  minRelevanceScore: z.number().min(0).max(1).optional().default(0.3),
});

// Update saved search schema
export const updateSavedSearchSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100).optional(),
  query: z.string().min(1).max(200).optional(),
  entities: z.array(searchableEntitySchema).optional(),
  filters: searchFiltersSchema.optional(),
});

// Type exports
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SearchFiltersInput = z.infer<typeof searchFiltersSchema>;
export type SearchAnalyticsQueryInput = z.infer<typeof searchAnalyticsQuerySchema>;
export type ZeroResultQueriesInput = z.infer<typeof zeroResultQueriesSchema>;
export type PerformanceMetricsInput = z.infer<typeof performanceMetricsSchema>;
export type TrendingSearchesInput = z.infer<typeof trendingSearchesSchema>;
export type TrackClickInput = z.infer<typeof trackClickSchema>;
export type EnhancedFacetsInput = z.infer<typeof enhancedFacetsSchema>;
export type SpellCorrectionInput = z.infer<typeof spellCorrectionSchema>;
export type RelatedContentInput = z.infer<typeof relatedContentSchema>;
export type UpdateSavedSearchInput = z.infer<typeof updateSavedSearchSchema>;
