/**
 * Creators Router (tRPC)
 * API endpoints for creator profile management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { CreatorService } from '../services/creator.service';
import { StripeConnectService } from '../services/stripe-connect.service';
import { CreatorAssetsService } from '../services/creator-assets.service';
import { CreatorNotificationsService } from '../services/creator-notifications.service';
import { AuditService } from '@/lib/services/audit.service';
import { requirePermission } from '@/lib/middleware/permissions';
import { requireSenior } from '@/lib/middleware/approval.middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';
import {
  createCreatorSchema,
  updateCreatorSchema,
  listCreatorsSchema,
  getCreatorByIdSchema,
  approveCreatorSchema,
  rejectCreatorSchema,
  verifyCreatorSchema,
  requestCreatorInfoSchema,
  confirmProfileImageUploadSchema,
  updatePerformanceMetricsSchema,
  CreatorSpecialtyEnum,
} from '../schemas/creator.schema';

// Initialize services
const auditService = new AuditService(prisma);
const creatorService = new CreatorService(prisma, auditService);
const stripeConnectService = new StripeConnectService(prisma);
// Note: Storage service initialization will be added when available
// const storageService = new StorageService();
// const creatorAssetsService = new CreatorAssetsService(prisma, storageService);
const creatorNotificationsService = new CreatorNotificationsService(prisma);

/**
 * Helper to extract request context
 */
function getRequestContext(ctx: any) {
  return {
    ipAddress: ctx.req?.ip || ctx.req?.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: ctx.req?.headers?.['user-agent'] || 'unknown',
  };
}

/**
 * Generate mock/sample creators for public discovery when database is empty
 * Only used for public-facing pages, never for admin/portal
 */
function getMockCreators() {
  return [
    {
      id: 'mock-creator-1',
      userId: 'mock-user-1',
      stageName: 'Sophia Martinez',
      bio: 'Award-winning vocalist and songwriter specializing in R&B, soul, and contemporary pop. Featured on multiple Billboard charts with over 500M streams.',
      specialties: ['Vocalist', 'Songwriter', 'R&B', 'Soul', 'Pop'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/sophia',
      availability: { status: 'available', hoursPerWeek: 20 },
      performanceMetrics: {
        totalCollaborations: 47,
        totalRevenue: 250000,
        averageRating: 4.9,
        responseTimeHours: 2,
      },
      avatar: null,
      verifiedAt: new Date('2024-01-15'),
      createdAt: new Date('2023-11-01'),
      updatedAt: new Date('2024-10-01'),
    },
    {
      id: 'mock-creator-2',
      userId: 'mock-user-2',
      stageName: 'Marcus Chen',
      bio: 'Producer and mixing engineer with 15+ years experience. Specialized in hip-hop, trap, and electronic music production. Credits include major label artists.',
      specialties: ['Producer', 'Audio Engineer', 'Hip-Hop', 'Trap', 'Electronic'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/marcus',
      availability: { status: 'limited', hoursPerWeek: 10 },
      performanceMetrics: {
        totalCollaborations: 89,
        totalRevenue: 480000,
        averageRating: 4.8,
        responseTimeHours: 4,
      },
      avatar: null,
      verifiedAt: new Date('2023-12-10'),
      createdAt: new Date('2023-10-15'),
      updatedAt: new Date('2024-09-28'),
    },
    {
      id: 'mock-creator-3',
      userId: 'mock-user-3',
      stageName: 'Luna Rose',
      bio: 'Multi-instrumentalist and composer creating ethereal soundscapes. Specializing in film scores, ambient music, and experimental compositions.',
      specialties: ['Composer', 'Multi-Instrumentalist', 'Film Score', 'Ambient', 'Experimental'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/luna',
      availability: { status: 'available', hoursPerWeek: 30 },
      performanceMetrics: {
        totalCollaborations: 34,
        totalRevenue: 180000,
        averageRating: 5.0,
        responseTimeHours: 1,
      },
      avatar: null,
      verifiedAt: new Date('2024-02-20'),
      createdAt: new Date('2024-01-05'),
      updatedAt: new Date('2024-10-15'),
    },
    {
      id: 'mock-creator-4',
      userId: 'mock-user-4',
      stageName: 'DJ Apex',
      bio: 'Electronic music producer and DJ known for high-energy festival sets. Expertise in EDM, house, and techno with releases on major electronic labels.',
      specialties: ['DJ', 'Producer', 'EDM', 'House', 'Techno'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/djapex',
      availability: { status: 'limited', hoursPerWeek: 15 },
      performanceMetrics: {
        totalCollaborations: 56,
        totalRevenue: 320000,
        averageRating: 4.7,
        responseTimeHours: 6,
      },
      avatar: null,
      verifiedAt: new Date('2024-03-05'),
      createdAt: new Date('2023-12-20'),
      updatedAt: new Date('2024-10-10'),
    },
    {
      id: 'mock-creator-5',
      userId: 'mock-user-5',
      stageName: 'Amara Johnson',
      bio: 'Session guitarist and music director with expertise in jazz, funk, and fusion. Toured internationally with Grammy-winning artists.',
      specialties: ['Guitarist', 'Music Director', 'Jazz', 'Funk', 'Fusion'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/amara',
      availability: { status: 'available', hoursPerWeek: 25 },
      performanceMetrics: {
        totalCollaborations: 71,
        totalRevenue: 290000,
        averageRating: 4.9,
        responseTimeHours: 3,
      },
      avatar: null,
      verifiedAt: new Date('2023-11-30'),
      createdAt: new Date('2023-09-15'),
      updatedAt: new Date('2024-10-12'),
    },
    {
      id: 'mock-creator-6',
      userId: 'mock-user-6',
      stageName: 'Phoenix Beats',
      bio: 'Beatmaker and sound designer pushing boundaries in lo-fi, boom bap, and experimental hip-hop. Featured in Spotify editorial playlists.',
      specialties: ['Beatmaker', 'Sound Designer', 'Lo-Fi', 'Boom Bap', 'Hip-Hop'],
      verificationStatus: 'approved' as const,
      portfolioUrl: 'https://example.com/phoenix',
      availability: { status: 'available', hoursPerWeek: 35 },
      performanceMetrics: {
        totalCollaborations: 42,
        totalRevenue: 195000,
        averageRating: 4.8,
        responseTimeHours: 2,
      },
      avatar: null,
      verifiedAt: new Date('2024-01-25'),
      createdAt: new Date('2023-11-10'),
      updatedAt: new Date('2024-10-08'),
    },
  ];
}

/**
 * Creators Router
 */
export const creatorsRouter = createTRPCRouter({
  // ==================== Creator Self-Management ====================
  
  /**
   * Get my creator profile
   */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return await creatorService.getProfileByUserId(userId);
  }),

  /**
   * Create creator profile
   */
  createProfile: protectedProcedure
    .input(createCreatorSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      const creator = await creatorService.createProfile(userId, input, context);

      // Send welcome email
      await creatorNotificationsService.sendWelcomeEmail(creator.id);

      return creator;
    }),

  /**
   * Update creator profile
   */
  updateProfile: protectedProcedure
    .input(updateCreatorSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session?.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      return await creatorService.updateProfile(userId, input, context);
    }),

  /**
   * Delete creator profile (soft delete)
   */
  deleteProfile: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const context = getRequestContext(ctx);
    await creatorService.deleteProfile(userId, context);

    return { success: true };
  }),

  /**
   * Get creator statistics
   */
  getMyStatistics: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return await creatorService.getStatistics(userId);
  }),

  // ==================== Stripe Connect ====================

  /**
   * Get Stripe onboarding link
   */
  getStripeOnboardingLink: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const creator = await creatorService.getProfileByUserId(userId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com';
    
    return await stripeConnectService.getOnboardingLink(
      creator.id,
      `${baseUrl}/dashboard/settings/payouts/return`,
      `${baseUrl}/dashboard/settings/payouts/refresh`
    );
  }),

  /**
   * Refresh Stripe onboarding link (if expired)
   */
  refreshStripeOnboardingLink: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const creator = await creatorService.getProfileByUserId(userId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com';
    
    return await stripeConnectService.refreshOnboardingLink(
      creator.id,
      `${baseUrl}/dashboard/settings/payouts/return`,
      `${baseUrl}/dashboard/settings/payouts/refresh`
    );
  }),

  /**
   * Get Stripe account status
   */
  getStripeAccountStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const creator = await creatorService.getProfileByUserId(userId);
    return await stripeConnectService.getAccountStatus(creator.id);
  }),

  /**
   * Check specific Stripe capability
   */
  checkStripeCapability: protectedProcedure
    .input(z.object({ capability: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const creator = await creatorService.getProfileByUserId(userId);
      const enabled = await stripeConnectService.checkCapability(
        creator.id,
        input.capability
      );

      return { capability: input.capability, enabled };
    }),

  /**
   * Get current account requirements
   */
  getStripeAccountRequirements: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const creator = await creatorService.getProfileByUserId(userId);
    const requirements = await stripeConnectService.getAccountRequirements(creator.id);

    return {
      hasRequirements: requirements.length > 0,
      requirements,
      categorized: {
        currentlyDue: requirements.filter(r => r.requirementType === 'currently_due'),
        eventuallyDue: requirements.filter(r => r.requirementType === 'eventually_due'),
        pastDue: requirements.filter(r => r.requirementType === 'past_due'),
        pendingVerification: requirements.filter(r => r.requirementType === 'pending_verification'),
      },
    };
  }),

  /**
   * Update Stripe account information
   */
  updateStripeAccount: protectedProcedure
    .input(z.object({
      updateData: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const creator = await creatorService.getProfileByUserId(userId);
      await stripeConnectService.updateAccountInfo(creator.id, input.updateData);

      return { success: true, message: 'Account information updated successfully' };
    }),

  // ==================== Public Endpoints ====================

  /**
   * Get public creator profile by ID
   */
  getCreatorById: publicProcedure
    .input(getCreatorByIdSchema)
    .query(async ({ input, ctx }) => {
      const requestingUserId = ctx.session?.user?.id;
      return await creatorService.getProfileById(input.id, requestingUserId);
    }),

  /**
   * Search/browse creators (public)
   */
  browseCreators: publicProcedure
    .input(listCreatorsSchema.pick({
      page: true,
      pageSize: true,
      search: true,
      specialties: true,
      sortBy: true,
      sortOrder: true,
    }))
    .query(async ({ input }) => {
      try {
        // Only show approved creators to public
        const result = await creatorService.listCreators({
          ...input,
          verificationStatus: 'approved',
        });
        
        // Ensure result has proper structure
        if (!result || !result.data) {
          return {
            data: [],
            meta: {
              page: input.page || 1,
              pageSize: input.pageSize || 20,
              total: 0,
              totalPages: 0,
            },
          };
        }
        
        return result;
      } catch (error) {
        console.error('[BrowseCreators] Error:', error);
        // Return empty results instead of throwing
        return {
          data: [],
          meta: {
            page: input.page || 1,
            pageSize: input.pageSize || 20,
            total: 0,
            totalPages: 0,
          },
        };
      }
    }),

  /**
   * Search creators (public - for discovery)
   */
  searchCreators: publicProcedure
    .input(z.object({
      query: z.string().max(200).optional(),
      verificationStatus: z.array(z.enum(['pending', 'approved', 'rejected'])).optional(),
      specialties: z.array(CreatorSpecialtyEnum).optional(),
      industry: z.array(z.string()).optional(),
      category: z.array(z.string()).optional(),
      availabilityStatus: z.enum(['available', 'limited', 'unavailable']).optional(),
      sortBy: z.enum(['relevance', 'created_at', 'verified_at', 'total_collaborations', 'total_revenue', 'average_rating']).optional().default('relevance'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      page: z.coerce.number().int().positive().optional().default(1),
      pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
    }).optional())
    .query(async ({ input = {
      sortBy: 'relevance' as const,
      sortOrder: 'desc' as const,
      page: 1,
      pageSize: 20,
    }, ctx }) => {
      // Apply defaults
      const {
        query: searchQuery,
        verificationStatus: verificationStatusFilter,
        specialties: specialtiesFilter,
        industry: industryFilter,
        category: categoryFilter,
        availabilityStatus: availabilityStatusFilter,
        sortBy = 'relevance',
        sortOrder = 'desc',
        page = 1,
        pageSize = 20,
      } = input;

      try {
        const requestingUserId = ctx.session?.user?.id;
        const requestingUserRole = ctx.session?.user?.role;

        // Build where clause
        const where: any = {
          deletedAt: null,
        };

      // Text search across name and bio
      if (searchQuery && searchQuery.trim().length >= 2) {
        where.OR = [
          { stageName: { contains: searchQuery.trim(), mode: 'insensitive' } },
          { bio: { contains: searchQuery.trim(), mode: 'insensitive' } },
        ];
      }

      // Verification status filter
      // Public users and brands should only see approved creators
      // Admins can see all
      if (requestingUserRole === 'ADMIN') {
        if (verificationStatusFilter && verificationStatusFilter.length > 0) {
          where.verificationStatus = { in: verificationStatusFilter };
        }
      } else {
        // Non-admins only see approved creators
        where.verificationStatus = 'approved';
      }

      // Specialties filter (JSONB array contains)
      if (specialtiesFilter && specialtiesFilter.length > 0) {
        where.specialties = {
          path: '$',
          array_contains: specialtiesFilter,
        };
      }

      // Industry/category filter
      if (industryFilter && industryFilter.length > 0) {
        where.specialties = {
          path: '$',
          array_contains: industryFilter,
        };
      }

      if (categoryFilter && categoryFilter.length > 0) {
        where.specialties = {
          path: '$',
          array_contains: categoryFilter,
        };
      }

      // Availability filter (JSONB)
      if (availabilityStatusFilter) {
        where.availability = {
          path: ['status'],
          equals: availabilityStatusFilter,
        };
      }

      // Count total matching creators
      const total = await prisma.creator.count({ where });

      // If no creators found and user is not admin, return mock data for public discovery
      // This allows the public-facing pages to show examples even when database is empty
      // Admins and portal users will always see real data only
      if (total === 0 && requestingUserRole !== 'ADMIN') {
        const mockCreators = getMockCreators();
        
        // Apply basic filtering to mock data
        let filteredMocks = mockCreators;
        
        if (searchQuery) {
          const queryLower = searchQuery.toLowerCase();
          filteredMocks = mockCreators.filter(c => 
            c.stageName.toLowerCase().includes(queryLower) ||
            c.bio.toLowerCase().includes(queryLower) ||
            c.specialties.some(s => s.toLowerCase().includes(queryLower))
          );
        }
        
        if (specialtiesFilter && specialtiesFilter.length > 0) {
          filteredMocks = filteredMocks.filter(c =>
            specialtiesFilter.some(s => c.specialties.includes(s))
          );
        }
        
        if (availabilityStatusFilter) {
          filteredMocks = filteredMocks.filter(c =>
            c.availability.status === availabilityStatusFilter
          );
        }
        
        // Sort mock data
        if (sortBy === 'total_collaborations') {
          filteredMocks.sort((a, b) =>
            sortOrder === 'asc'
              ? a.performanceMetrics.totalCollaborations - b.performanceMetrics.totalCollaborations
              : b.performanceMetrics.totalCollaborations - a.performanceMetrics.totalCollaborations
          );
        } else if (sortBy === 'total_revenue') {
          filteredMocks.sort((a, b) =>
            sortOrder === 'asc'
              ? a.performanceMetrics.totalRevenue - b.performanceMetrics.totalRevenue
              : b.performanceMetrics.totalRevenue - a.performanceMetrics.totalRevenue
          );
        } else if (sortBy === 'average_rating') {
          filteredMocks.sort((a, b) =>
            sortOrder === 'asc'
              ? a.performanceMetrics.averageRating - b.performanceMetrics.averageRating
              : b.performanceMetrics.averageRating - a.performanceMetrics.averageRating
          );
        }
        
        // Apply pagination to mock data
        const skip = (page - 1) * pageSize;
        const paginatedMocks = filteredMocks.slice(skip, skip + pageSize);
        
        return {
          results: paginatedMocks || [],
          pagination: {
            page,
            pageSize,
            total: filteredMocks.length,
            totalPages: Math.ceil(filteredMocks.length / pageSize),
            hasNextPage: page * pageSize < filteredMocks.length,
            hasPreviousPage: page > 1,
          },
          _mockData: true, // Flag to indicate this is sample data
        };
      }

      // Build orderBy based on sortBy
      let orderBy: any = {};
      
      if (sortBy === 'relevance' && searchQuery) {
        // For relevance, we'll sort by created date and filter in application
        orderBy = { createdAt: 'desc' };
      } else if (sortBy === 'verified_at') {
        orderBy = { verifiedAt: sortOrder };
      } else if (sortBy === 'created_at') {
        orderBy = { createdAt: sortOrder };
      } else {
        // Default to created date for metric-based sorts (will be sorted in application)
        orderBy = { createdAt: 'desc' };
      }

      // Fetch creators with pagination
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      let creators = await prisma.creator.findMany({
        where,
        select: {
          id: true,
          userId: true,
          stageName: true,
          bio: true,
          specialties: true,
          verificationStatus: true,
          portfolioUrl: true,
          availability: true,
          performanceMetrics: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              avatar: true,
            },
          },
        },
        orderBy,
        skip,
        take,
      });

      // Sort by performance metrics if needed
      if (['total_collaborations', 'total_revenue', 'average_rating'].includes(sortBy)) {
        creators = creators.sort((a, b) => {
          const aMetrics = (a.performanceMetrics as any) || {};
          const bMetrics = (b.performanceMetrics as any) || {};
          
          let aValue = 0;
          let bValue = 0;

          if (sortBy === 'total_collaborations') {
            aValue = aMetrics.totalCollaborations || 0;
            bValue = bMetrics.totalCollaborations || 0;
          } else if (sortBy === 'total_revenue') {
            aValue = aMetrics.totalRevenue || 0;
            bValue = bMetrics.totalRevenue || 0;
          } else if (sortBy === 'average_rating') {
            aValue = aMetrics.averageRating || 0;
            bValue = bMetrics.averageRating || 0;
          }

          return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        });
      }

      // Format results with null safety
      const results = (creators || []).map(creator => ({
        id: creator.id,
        userId: creator.userId,
        stageName: creator.stageName || '',
        bio: creator.bio ? (creator.bio.length > 200 ? creator.bio.substring(0, 200) + '...' : creator.bio) : null,
        specialties: Array.isArray(creator.specialties) ? creator.specialties : [],
        verificationStatus: creator.verificationStatus,
        portfolioUrl: creator.portfolioUrl || null,
        availability: creator.availability || { status: 'unavailable', hoursPerWeek: 0 },
        performanceMetrics: creator.performanceMetrics || {
          totalCollaborations: 0,
          totalRevenue: 0,
          averageRating: 0,
          responseTimeHours: 0,
        },
        avatar: creator.user?.avatar || null,
        verifiedAt: creator.verifiedAt || null,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
      }));

      return {
        results: results || [],
        pagination: {
          page,
          pageSize,
          total: total || 0,
          totalPages: Math.ceil((total || 0) / pageSize),
          hasNextPage: page * pageSize < (total || 0),
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      // If any error occurs (database, network, etc.) and user is not admin,
      // return mock data instead of failing
      console.error('[CreatorSearch] Error searching creators:', error);
      
      const requestingUserRole = ctx.session?.user?.role;
      
      // Admins should see the real error
      if (requestingUserRole === 'ADMIN') {
        throw error;
      }
      
      // For public users, return mock data as fallback
      const mockCreators = getMockCreators();
      
      // Apply basic filtering to mock data (using destructured variables from above)
      let filteredMocks = mockCreators;
      
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        filteredMocks = mockCreators.filter(c => 
          c.stageName.toLowerCase().includes(queryLower) ||
          c.bio.toLowerCase().includes(queryLower) ||
          c.specialties.some(s => s.toLowerCase().includes(queryLower))
        );
      }
      
      if (specialtiesFilter && specialtiesFilter.length > 0) {
        filteredMocks = filteredMocks.filter(c =>
          specialtiesFilter.some((s: string) => c.specialties.includes(s))
        );
      }
      
      if (availabilityStatusFilter) {
        filteredMocks = filteredMocks.filter(c =>
          c.availability.status === availabilityStatusFilter
        );
      }
      
      // Sort mock data
      if (sortBy === 'total_collaborations') {
        filteredMocks.sort((a, b) =>
          sortOrder === 'asc'
            ? a.performanceMetrics.totalCollaborations - b.performanceMetrics.totalCollaborations
            : b.performanceMetrics.totalCollaborations - a.performanceMetrics.totalCollaborations
        );
      } else if (sortBy === 'total_revenue') {
        filteredMocks.sort((a, b) =>
          sortOrder === 'asc'
            ? a.performanceMetrics.totalRevenue - b.performanceMetrics.totalRevenue
            : b.performanceMetrics.totalRevenue - a.performanceMetrics.totalRevenue
        );
      } else if (sortBy === 'average_rating') {
        filteredMocks.sort((a, b) =>
          sortOrder === 'asc'
            ? a.performanceMetrics.averageRating - b.performanceMetrics.averageRating
            : b.performanceMetrics.averageRating - a.performanceMetrics.averageRating
        );
      }
      
      // Apply pagination to mock data
      const skip = (page - 1) * pageSize;
      const paginatedMocks = filteredMocks.slice(skip, skip + pageSize);
      
      return {
        results: paginatedMocks || [],
        pagination: {
          page,
          pageSize,
          total: filteredMocks.length,
          totalPages: Math.ceil(filteredMocks.length / pageSize),
          hasNextPage: page * pageSize < filteredMocks.length,
          hasPreviousPage: page > 1,
        },
        _mockData: true,
        _errorFallback: true, // Indicates this is fallback data due to an error
      };
    }
    }),

  /**
   * Get creator search facets (for filtering UI)
   */
  getCreatorSearchFacets: publicProcedure
    .input(z.object({
      query: z.string().max(200).optional(),
      verificationStatus: z.array(z.enum(['pending', 'approved', 'rejected'])).optional(),
    }).optional())
    .query(async ({ input = {}, ctx }) => {
      try {
        const requestingUserRole = ctx.session?.user?.role;

      // Build base where clause
      const where: any = {
        deletedAt: null,
      };

      // Text search
      if (input.query && input.query.trim().length >= 2) {
        where.OR = [
          { stageName: { contains: input.query.trim(), mode: 'insensitive' } },
          { bio: { contains: input.query.trim(), mode: 'insensitive' } },
        ];
      }

      // Verification status
      if (requestingUserRole === 'ADMIN') {
        if (input.verificationStatus && input.verificationStatus.length > 0) {
          where.verificationStatus = { in: input.verificationStatus };
        }
      } else {
        where.verificationStatus = 'approved';
      }

      // Fetch all matching creators for facet calculation
      const creators = await prisma.creator.findMany({
        where,
        select: {
          specialties: true,
          availability: true,
          verificationStatus: true,
        },
      });

      // Calculate facets
      const specialtiesMap = new Map<string, number>();
      const availabilityMap = new Map<string, number>();
      const verificationMap = new Map<string, number>();

      creators.forEach(creator => {
        // Count specialties
        const specs = (creator.specialties as any) || [];
        if (Array.isArray(specs)) {
          specs.forEach((spec: string) => {
            specialtiesMap.set(spec, (specialtiesMap.get(spec) || 0) + 1);
          });
        }

        // Count availability
        const avail = creator.availability as any;
        if (avail && avail.status) {
          availabilityMap.set(avail.status, (availabilityMap.get(avail.status) || 0) + 1);
        }

        // Count verification status (for admins)
        if (requestingUserRole === 'ADMIN') {
          verificationMap.set(
            creator.verificationStatus,
            (verificationMap.get(creator.verificationStatus) || 0) + 1
          );
        }
      });

      return {
        specialties: Array.from(specialtiesMap.entries())
          .map(([specialty, count]) => ({ specialty, count }))
          .sort((a, b) => b.count - a.count),
        availability: Array.from(availabilityMap.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
        verificationStatus: requestingUserRole === 'ADMIN'
          ? Array.from(verificationMap.entries())
              .map(([status, count]) => ({ status, count }))
              .sort((a, b) => b.count - a.count)
          : [],
        totalCount: creators.length,
      };
    } catch (error) {
      // If any error occurs and user is not admin, return mock facets
      console.error('[CreatorSearchFacets] Error fetching facets:', error);
      
      const requestingUserRole = ctx.session?.user?.role;
      
      // Admins should see the real error
      if (requestingUserRole === 'ADMIN') {
        throw error;
      }
      
      // For public users, return mock facets based on mock creators
      return {
        specialties: [
          { specialty: 'Vocalist', count: 1 },
          { specialty: 'Producer', count: 2 },
          { specialty: 'Songwriter', count: 1 },
          { specialty: 'Audio Engineer', count: 1 },
          { specialty: 'Composer', count: 1 },
          { specialty: 'Multi-Instrumentalist', count: 1 },
          { specialty: 'DJ', count: 1 },
          { specialty: 'Guitarist', count: 1 },
          { specialty: 'Music Director', count: 1 },
          { specialty: 'Beatmaker', count: 1 },
          { specialty: 'Sound Designer', count: 1 },
          { specialty: 'R&B', count: 1 },
          { specialty: 'Soul', count: 1 },
          { specialty: 'Pop', count: 1 },
          { specialty: 'Hip-Hop', count: 2 },
          { specialty: 'Trap', count: 1 },
          { specialty: 'Electronic', count: 1 },
          { specialty: 'Film Score', count: 1 },
          { specialty: 'Ambient', count: 1 },
          { specialty: 'EDM', count: 1 },
          { specialty: 'House', count: 1 },
          { specialty: 'Techno', count: 1 },
          { specialty: 'Jazz', count: 1 },
          { specialty: 'Funk', count: 1 },
          { specialty: 'Fusion', count: 1 },
          { specialty: 'Lo-Fi', count: 1 },
          { specialty: 'Boom Bap', count: 1 },
          { specialty: 'Experimental', count: 1 },
        ],
        availability: [
          { status: 'available', count: 4 },
          { status: 'limited', count: 2 },
        ],
        verificationStatus: [],
        totalCount: 6,
        _mockData: true,
        _errorFallback: true,
      };
    }
    }),

  // ==================== Admin Endpoints ====================

  /**
   * List all creators (admin only)
   */
  listCreators: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_REVIEW))
    .input(listCreatorsSchema)
    .query(async ({ input }) => {
      return await creatorService.listCreators(input);
    }),

  /**
   * Get creator by ID (admin - full details)
   */
  getCreatorByIdAdmin: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_REVIEW))
    .input(getCreatorByIdSchema)
    .query(async ({ input }) => {
      const creator = await creatorService.getProfileById(input.id);
      // Admin gets full access - convert to admin profile
      // TODO: Add method to get admin profile directly
      return creator;
    }),

  /**
   * Approve creator verification
   * Requires creator:approve permission and senior-level access
   */
  approveCreator: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_APPROVE))
    .use(requireSenior('Creator approval requires senior-level authorization'))
    .input(approveCreatorSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session?.user?.id;
      if (!adminUserId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      await creatorService.approveCreator(input.id, adminUserId, context);

      // Send approval email
      await creatorNotificationsService.sendVerificationApprovedEmail(input.id);

      return { success: true };
    }),

  /**
   * Reject creator verification
   */
  rejectCreator: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_REJECT))
    .input(rejectCreatorSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session?.user?.id;
      if (!adminUserId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      await creatorService.rejectCreator(input.id, input.reason, adminUserId, context);

      // Send rejection email with reason
      await creatorNotificationsService.sendVerificationRejectedEmail(input.id, input.reason);

      return { success: true };
    }),

  /**
   * Verify creator credentials
   */
  verifyCreator: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_VERIFY))
    .input(verifyCreatorSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session?.user?.id;
      if (!adminUserId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      await creatorService.verifyCreator(input.id, adminUserId, input.notes, context);

      return { success: true };
    }),

  /**
   * Request additional information from creator
   */
  requestCreatorInfo: adminProcedure
    .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO))
    .input(requestCreatorInfoSchema)
    .mutation(async ({ input, ctx }) => {
      const adminUserId = ctx.session?.user?.id;
      if (!adminUserId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const context = getRequestContext(ctx);
      await creatorService.requestCreatorInfo(
        input.id,
        input.requestedInfo,
        input.message,
        adminUserId,
        input.deadline,
        context
      );

      return { success: true };
    }),

  /**
   * Update creator performance metrics (admin only)
   */
  updatePerformanceMetrics: adminProcedure
    .input(updatePerformanceMetricsSchema)
    .mutation(async ({ input }) => {
      await creatorService.updatePerformanceMetrics(input.id);
      return { success: true };
    }),
});

export default creatorsRouter;
