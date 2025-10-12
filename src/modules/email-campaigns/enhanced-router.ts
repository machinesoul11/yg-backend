/**
 * Enhanced Email Campaigns Router
 * Adds segmentation, advanced analytics, and GDPR compliance endpoints
 */
import { z } from 'zod';
import { createTRPCRouter, adminProcedure, protectedProcedure } from '@/lib/trpc';
import { segmentationService } from '@/lib/services/email/segmentation.service';
import { campaignAnalyticsService } from '@/lib/services/email/campaign-analytics.service';
import { gdprComplianceService } from '@/lib/services/email/gdpr-compliance.service';

// Segment criteria schema
const segmentCriteriaSchema = z.object({
  role: z.array(z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER'])).optional(),
  verificationStatus: z.array(z.string()).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  lastLoginAfter: z.date().optional(),
  lastLoginBefore: z.date().optional(),
  hasEmailPreference: z.record(z.string(), z.boolean()).optional(),
  creatorSpecialties: z.array(z.string()).optional(),
  brandIndustries: z.array(z.string()).optional(),
  engagementLevel: z.array(z.enum(['very_high', 'high', 'medium', 'low', 'inactive'])).optional(),
  excludeRecentlySent: z.object({
    days: z.number(),
    campaignIds: z.array(z.string()).optional(),
  }).optional(),
});

export const emailCampaignsEnhancedRouter = createTRPCRouter({
  // ========== SEGMENTATION ========== //
  
  /**
   * Preview segment size and breakdown before creating campaign
   */
  previewSegment: adminProcedure
    .input(segmentCriteriaSchema)
    .query(async ({ input }) => {
      return segmentationService.previewSegment(input);
    }),

  /**
   * Create saved segment for reuse
   */
  createSavedSegment: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      criteria: segmentCriteriaSchema,
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return segmentationService.createSavedSegment(ctx.session.user.id, input);
    }),

  /**
   * Update saved segment
   */
  updateSavedSegment: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      criteria: segmentCriteriaSchema.optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      return segmentationService.updateSavedSegment(id, ctx.session.user.id, updates);
    }),

  /**
   * Delete saved segment
   */
  deleteSavedSegment: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return segmentationService.deleteSavedSegment(input.id, ctx.session.user.id);
    }),

  /**
   * List saved segments
   */
  listSavedSegments: adminProcedure
    .input(z.object({
      includePublic: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return segmentationService.getSavedSegments(
        ctx.session.user.id,
        input.includePublic ?? true
      );
    }),

  /**
   * Analyze audience overlap with recent campaigns
   */
  analyzeAudienceOverlap: adminProcedure
    .input(z.object({
      criteria: segmentCriteriaSchema,
      daysSinceLastSent: z.number().min(1).max(365).default(7),
    }))
    .query(async ({ input }) => {
      return segmentationService.analyzeAudienceOverlap(
        input.criteria,
        input.daysSinceLastSent
      );
    }),

  // ========== ADVANCED ANALYTICS ========== //

  /**
   * Get comprehensive campaign performance metrics
   */
  getCampaignPerformance: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.getCampaignPerformance(input.id);
    }),

  /**
   * Get link click performance
   */
  getLinkPerformance: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.getLinkPerformance(input.id);
    }),

  /**
   * Get device breakdown (desktop, mobile, tablet)
   */
  getDeviceBreakdown: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.getDeviceBreakdown(input.id);
    }),

  /**
   * Get hourly send/open/click patterns
   */
  getHourlyBreakdown: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.getHourlyBreakdown(input.id);
    }),

  /**
   * Compare multiple campaigns side-by-side
   */
  compareCampaigns: adminProcedure
    .input(z.object({
      campaignIds: z.array(z.string()).min(2).max(10),
    }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.compareCampaigns(input.campaignIds);
    }),

  /**
   * Get campaign trends over time
   */
  getCampaignTrends: adminProcedure
    .input(z.object({
      days: z.number().min(7).max(365).default(30),
    }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.getCampaignTrends(input.days);
    }),

  /**
   * Generate comprehensive campaign report
   */
  generateCampaignReport: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignAnalyticsService.generateCampaignReport(input.id);
    }),

  // ========== GDPR COMPLIANCE ========== //

  /**
   * Capture user consent with audit trail
   */
  captureConsent: protectedProcedure
    .input(z.object({
      categories: z.array(z.string()),
      metadata: z.object({
        ipAddress: z.string(),
        userAgent: z.string(),
        source: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await gdprComplianceService.captureConsent(
        ctx.session.user.id,
        input.categories,
        input.metadata
      );
      return { success: true };
    }),

  /**
   * Check if user has current consent version
   */
  hasCurrentConsent: protectedProcedure
    .query(async ({ ctx }) => {
      return gdprComplianceService.hasCurrentConsent(ctx.session.user.id);
    }),

  /**
   * Export user's email data (GDPR Right to Access)
   */
  exportMyEmailData: protectedProcedure
    .query(async ({ ctx }) => {
      return gdprComplianceService.exportUserData(ctx.session.user.id);
    }),

  /**
   * Delete user's email data (GDPR Right to Erasure)
   */
  deleteMyEmailData: protectedProcedure
    .mutation(async ({ ctx }) => {
      await gdprComplianceService.deleteUserEmailData(ctx.session.user.id);
      return { success: true };
    }),

  /**
   * Generate data portability export file
   */
  generateDataPortabilityExport: protectedProcedure
    .mutation(async ({ ctx }) => {
      const buffer = await gdprComplianceService.generateDataPortabilityExport(
        ctx.session.user.id
      );
      
      // Convert buffer to base64 for transmission
      return {
        data: buffer.toString('base64'),
        filename: `email-data-${ctx.session.user.id}-${Date.now()}.json`,
        mimeType: 'application/json',
      };
    }),

  /**
   * Validate GDPR compliance for user
   */
  validateGDPRCompliance: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return gdprComplianceService.validateGDPRCompliance(input.userId);
    }),

  /**
   * Request consent renewal (admin only, for policy changes)
   */
  requestConsentRenewal: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      await gdprComplianceService.requestConsentRenewal(input.userId);
      return { success: true };
    }),

  /**
   * Get consent history for user
   */
  getConsentHistory: protectedProcedure
    .query(async ({ ctx }) => {
      return gdprComplianceService.getConsentHistory(ctx.session.user.id);
    }),
});
