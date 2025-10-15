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
import {
  createCreatorSchema,
  updateCreatorSchema,
  listCreatorsSchema,
  getCreatorByIdSchema,
  approveCreatorSchema,
  rejectCreatorSchema,
  confirmProfileImageUploadSchema,
  updatePerformanceMetricsSchema,
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
      // Only show approved creators to public
      return await creatorService.listCreators({
        ...input,
        verificationStatus: 'approved',
      });
    }),

  // ==================== Admin Endpoints ====================

  /**
   * List all creators (admin only)
   */
  listCreators: adminProcedure
    .input(listCreatorsSchema)
    .query(async ({ input }) => {
      return await creatorService.listCreators(input);
    }),

  /**
   * Get creator by ID (admin - full details)
   */
  getCreatorByIdAdmin: adminProcedure
    .input(getCreatorByIdSchema)
    .query(async ({ input }) => {
      const creator = await creatorService.getProfileById(input.id);
      // Admin gets full access - convert to admin profile
      // TODO: Add method to get admin profile directly
      return creator;
    }),

  /**
   * Approve creator verification
   */
  approveCreator: adminProcedure
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
