/**
 * Search Router
 * tRPC router for unified search functionality
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { SearchService } from './services/search.service';
import { SearchAnalyticsService } from './services/search-analytics.service';
import {
  searchQuerySchema,
  searchAnalyticsQuerySchema,
  zeroResultQueriesSchema,
  performanceMetricsSchema,
  trendingSearchesSchema,
  trackClickSchema,
  searchFiltersSchema,
  enhancedFacetsSchema,
  spellCorrectionSchema,
  relatedContentSchema,
  updateSavedSearchSchema,
} from './validation/search.validation';

// Initialize services
const searchService = new SearchService(prisma);
const analyticsService = new SearchAnalyticsService(prisma);

export const searchRouter = createTRPCRouter({
  /**
   * Unified search across multiple entities
   */
  search: protectedProcedure
    .input(searchQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        const { page, limit, sortBy, sortOrder, ...searchParams } = input;
        
        // Convert date strings to Date objects if present
        const filters = input.filters ? {
          ...input.filters,
          dateFrom: input.filters.dateFrom ? new Date(input.filters.dateFrom) : undefined,
          dateTo: input.filters.dateTo ? new Date(input.filters.dateTo) : undefined,
        } : undefined;

        const result = await searchService.search(
          {
            query: searchParams.query,
            entities: searchParams.entities,
            filters,
            pagination: { page, limit },
            sortBy,
            sortOrder,
          },
          ctx.session.user.id
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('Search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to execute search',
          cause: error,
        });
      }
    }),

  /**
   * Get search analytics (admin only)
   */
  getAnalytics: adminProcedure
    .input(searchAnalyticsQuerySchema)
    .query(async ({ input }) => {
      try {
        const startDate = typeof input.startDate === 'string' 
          ? new Date(input.startDate) 
          : input.startDate;
        const endDate = typeof input.endDate === 'string' 
          ? new Date(input.endDate) 
          : input.endDate;

        const analytics = await analyticsService.getSearchAnalytics(startDate, endDate);

        return {
          success: true,
          data: analytics,
        };
      } catch (error) {
        console.error('Analytics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve search analytics',
          cause: error,
        });
      }
    }),

  /**
   * Get zero-result queries (admin only)
   */
  getZeroResultQueries: adminProcedure
    .input(zeroResultQueriesSchema)
    .query(async ({ input }) => {
      try {
        const startDate = typeof input.startDate === 'string' 
          ? new Date(input.startDate) 
          : input.startDate;
        const endDate = typeof input.endDate === 'string' 
          ? new Date(input.endDate) 
          : input.endDate;

        const queries = await analyticsService.getZeroResultQueries(
          startDate,
          endDate,
          input.limit
        );

        return {
          success: true,
          data: queries,
        };
      } catch (error) {
        console.error('Zero result queries error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve zero-result queries',
          cause: error,
        });
      }
    }),

  /**
   * Get performance metrics (admin only)
   */
  getPerformanceMetrics: adminProcedure
    .input(performanceMetricsSchema)
    .query(async ({ input }) => {
      try {
        const startDate = typeof input.startDate === 'string' 
          ? new Date(input.startDate) 
          : input.startDate;
        const endDate = typeof input.endDate === 'string' 
          ? new Date(input.endDate) 
          : input.endDate;

        const metrics = await analyticsService.getPerformanceMetrics(startDate, endDate);

        return {
          success: true,
          data: metrics,
        };
      } catch (error) {
        console.error('Performance metrics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve performance metrics',
          cause: error,
        });
      }
    }),

  /**
   * Get trending searches (admin only)
   */
  getTrendingSearches: adminProcedure
    .input(trendingSearchesSchema)
    .query(async ({ input }) => {
      try {
        const trending = await analyticsService.getTrendingSearches(
          input.hours,
          input.limit
        );

        return {
          success: true,
          data: trending,
        };
      } catch (error) {
        console.error('Trending searches error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve trending searches',
          cause: error,
        });
      }
    }),

  /**
   * Track search result click
   */
  trackClick: protectedProcedure
    .input(trackClickSchema)
    .mutation(async ({ input }) => {
      try {
        await analyticsService.trackResultClick(
          input.eventId,
          input.resultId,
          input.resultPosition,
          input.resultEntityType
        );

        return {
          success: true,
        };
      } catch (error) {
        console.error('Track click error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to track search result click',
          cause: error,
        });
      }
    }),

  /**
   * Asset-specific search endpoint
   */
  searchAssets: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(200).trim(),
        filters: z.object({
          assetType: z.array(z.string()).optional(),
          assetStatus: z.array(z.string()).optional(),
          projectId: z.string().cuid().optional(),
          creatorId: z.string().cuid().optional(),
          dateFrom: z.string().datetime().optional().or(z.date().optional()),
          dateTo: z.string().datetime().optional().or(z.date().optional()),
          tags: z.array(z.string()).optional(),
        }).optional(),
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(20),
        sortBy: z.enum(['relevance', 'created_at', 'updated_at', 'title']).optional().default('relevance'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const filters = input.filters ? {
          ...input.filters,
          dateFrom: input.filters.dateFrom ? new Date(input.filters.dateFrom) : undefined,
          dateTo: input.filters.dateTo ? new Date(input.filters.dateTo) : undefined,
        } : undefined;

        const result = await searchService.search(
          {
            query: input.query,
            entities: ['assets'],
            filters,
            pagination: { page: input.page, limit: input.limit },
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
          },
          ctx.session.user.id
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('Asset search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search assets',
          cause: error,
        });
      }
    }),

  /**
   * Creator-specific search endpoint
   */
  searchCreators: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(200).trim(),
        filters: z.object({
          verificationStatus: z.array(z.string()).optional(),
          specialties: z.array(z.string()).optional(),
          industry: z.array(z.string()).optional(),
          category: z.array(z.string()).optional(),
          country: z.string().optional(),
          region: z.string().optional(),
          city: z.string().optional(),
          availabilityStatus: z.enum(['available', 'limited', 'unavailable']).optional(),
        }).optional(),
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(20),
        sortBy: z.enum(['relevance', 'created_at', 'name', 'verified_at', 'total_collaborations', 'average_rating']).optional().default('relevance'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const result = await searchService.search(
          {
            query: input.query,
            entities: ['creators'],
            filters: input.filters,
            pagination: { page: input.page, limit: input.limit },
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
          },
          ctx.session.user.id
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('Creator search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search creators',
          cause: error,
        });
      }
    }),

  /**
   * Project-specific search endpoint
   */
  searchProjects: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(200).trim(),
        filters: z.object({
          projectType: z.array(z.string()).optional(),
          projectStatus: z.array(z.string()).optional(),
          brandId: z.string().cuid().optional(),
          dateFrom: z.string().datetime().optional().or(z.date().optional()),
          dateTo: z.string().datetime().optional().or(z.date().optional()),
        }).optional(),
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(20),
        sortBy: z.enum(['relevance', 'created_at', 'updated_at', 'name']).optional().default('relevance'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const filters = input.filters ? {
          ...input.filters,
          dateFrom: input.filters.dateFrom ? new Date(input.filters.dateFrom) : undefined,
          dateTo: input.filters.dateTo ? new Date(input.filters.dateTo) : undefined,
        } : undefined;

        const result = await searchService.search(
          {
            query: input.query,
            entities: ['projects'],
            filters,
            pagination: { page: input.page, limit: input.limit },
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
          },
          ctx.session.user.id
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('Project search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search projects',
          cause: error,
        });
      }
    }),

  /**
   * Get unified autocomplete suggestions across all entities
   */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
        entities: z.array(z.enum(['assets', 'creators', 'projects', 'licenses'])).optional(),
        limit: z.number().int().min(1).max(20).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const suggestions = await searchService.getSuggestions(
          input.query,
          ctx.session.user.id,
          input.entities,
          input.limit
        );

        return {
          success: true,
          data: suggestions,
        };
      } catch (error) {
        console.error('Suggestions error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get suggestions',
          cause: error,
        });
      }
    }),

  /**
   * Get asset autocomplete suggestions
   */
  getAssetSuggestions: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
        limit: z.number().int().min(1).max(20).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const suggestions = await searchService.getAssetSuggestions(
          input.query,
          ctx.session.user.id,
          input.limit
        );

        return {
          success: true,
          data: suggestions,
        };
      } catch (error) {
        console.error('Asset suggestions error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get asset suggestions',
          cause: error,
        });
      }
    }),

  /**
   * Get faceted search results for assets
   */
  getAssetFacets: protectedProcedure
    .input(
      z.object({
        query: z.string().optional().default(''),
        filters: z.object({
          projectId: z.string().cuid().optional(),
          creatorId: z.string().cuid().optional(),
          tags: z.array(z.string()).optional(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const facets = await searchService.getAssetFacets(
          input.query,
          ctx.session.user.id,
          input.filters
        );

        return {
          success: true,
          data: facets,
        };
      } catch (error) {
        console.error('Asset facets error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get asset facets',
          cause: error,
        });
      }
    }),

  /**
   * Get user's recent searches
   */
  getRecentSearches: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const recentSearches = await searchService.getRecentSearches(
          ctx.session.user.id,
          input.limit
        );

        return {
          success: true,
          data: recentSearches,
        };
      } catch (error) {
        console.error('Recent searches error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get recent searches',
          cause: error,
        });
      }
    }),

  /**
   * Save a search query for later use
   */
  saveSearch: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        query: z.string().min(1).max(200),
        entities: z.array(z.enum(['assets', 'creators', 'projects', 'licenses'])).optional(),
        filters: searchFiltersSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const savedSearch = await prisma.savedSearch.create({
          data: {
            userId: ctx.session.user.id,
            name: input.name,
            searchQuery: input.query,
            entities: input.entities || [],
            filters: input.filters || {},
          },
        });

        return {
          success: true,
          data: savedSearch,
        };
      } catch (error) {
        console.error('Save search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save search',
          cause: error,
        });
      }
    }),

  /**
   * Get user's saved searches
   */
  getSavedSearches: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const savedSearches = await prisma.savedSearch.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
        });

        return {
          success: true,
          data: savedSearches,
        };
      } catch (error) {
        console.error('Get saved searches error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get saved searches',
          cause: error,
        });
      }
    }),

  /**
   * Delete a saved search
   */
  deleteSavedSearch: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify ownership
        const savedSearch = await prisma.savedSearch.findUnique({
          where: { id: input.id },
        });

        if (!savedSearch || savedSearch.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          });
        }

        await prisma.savedSearch.delete({
          where: { id: input.id },
        });

        return {
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Delete saved search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete saved search',
          cause: error,
        });
      }
    }),

  /**
   * Update a saved search
   */
  updateSavedSearch: protectedProcedure
    .input(updateSavedSearchSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...updateData } = input;

        // Verify ownership
        const savedSearch = await prisma.savedSearch.findUnique({
          where: { id },
        });

        if (!savedSearch || savedSearch.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          });
        }

        const updated = await prisma.savedSearch.update({
          where: { id },
          data: {
            ...(updateData.name && { name: updateData.name }),
            ...(updateData.query && { searchQuery: updateData.query }),
            ...(updateData.entities && { entities: updateData.entities }),
            ...(updateData.filters && { filters: updateData.filters }),
          },
        });

        return {
          success: true,
          data: updated,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Update saved search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update saved search',
          cause: error,
        });
      }
    }),

  /**
   * Execute a saved search
   */
  executeSavedSearch: protectedProcedure
    .input(z.object({
      id: z.string().cuid(),
      page: z.number().int().min(1).optional().default(1),
      limit: z.number().int().min(1).max(100).optional().default(20),
    }))
    .query(async ({ ctx, input }) => {
      try {
        // Get saved search
        const savedSearch = await prisma.savedSearch.findUnique({
          where: { id: input.id },
        });

        if (!savedSearch || savedSearch.userId !== ctx.session.user.id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          });
        }

        // Execute search with saved parameters
        const result = await searchService.search(
          {
            query: savedSearch.searchQuery,
            entities: savedSearch.entities as any[],
            filters: savedSearch.filters as any,
            pagination: { page: input.page, limit: input.limit },
          },
          ctx.session.user.id
        );

        return {
          success: true,
          data: {
            search: result,
            savedSearchName: savedSearch.name,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Execute saved search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to execute saved search',
          cause: error,
        });
      }
    }),

  /**
   * Get enhanced faceted search with counts
   */
  getEnhancedFacets: protectedProcedure
    .input(enhancedFacetsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const entities = input.entities || ['assets', 'creators', 'projects', 'licenses'];
        
        // Convert date strings to Date objects if present
        const filters = input.filters ? {
          ...input.filters,
          dateFrom: input.filters.dateFrom ? new Date(input.filters.dateFrom) : undefined,
          dateTo: input.filters.dateTo ? new Date(input.filters.dateTo) : undefined,
        } : {};
        
        const facets = await searchService.getEnhancedFacets(
          input.query,
          entities,
          filters,
          ctx.session.user.id
        );

        return {
          success: true,
          data: facets,
        };
      } catch (error) {
        console.error('Enhanced facets error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get enhanced facets',
          cause: error,
        });
      }
    }),

  /**
   * Get spell correction suggestion ("did you mean")
   */
  getSpellingSuggestion: protectedProcedure
    .input(spellCorrectionSchema)
    .query(async ({ ctx, input }) => {
      try {
        const suggestion = await searchService.getSpellingSuggestion(
          input.query,
          input.currentResultCount
        );

        return {
          success: true,
          data: suggestion,
        };
      } catch (error) {
        console.error('Spelling suggestion error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get spelling suggestion',
          cause: error,
        });
      }
    }),

  /**
   * Get related content recommendations
   */
  getRelatedContent: protectedProcedure
    .input(relatedContentSchema)
    .query(async ({ ctx, input }) => {
      try {
        const recommendations = await searchService.getRelatedContent(
          input.entityType,
          input.entityId,
          ctx.session.user.id,
          {
            limit: input.limit,
            includeTypes: input.includeTypes,
            excludeIds: input.excludeIds,
            minRelevanceScore: input.minRelevanceScore,
          }
        );

        return {
          success: true,
          data: recommendations,
        };
      } catch (error) {
        console.error('Related content error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get related content',
          cause: error,
        });
      }
    }),
});
