/**
 * Brand tRPC Router
 * API endpoints for brand management operations
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { storageProvider } from '@/lib/storage';
import { requirePermission } from '@/lib/middleware/permissions';
import { requireSenior } from '@/lib/middleware/approval.middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';
import { BrandService } from '../services/brand.service';
import {
  createBrandSchema,
  updateBrandSchema,
  getBrandByIdSchema,
  listBrandsSchema,
  searchBrandsSchema,
  addTeamMemberSchema,
  removeTeamMemberSchema,
  updateGuidelinesSchema,
  verifyBrandSchema,
  rejectBrandSchema,
  requestBrandInfoSchema,
  deleteBrandSchema,
} from '../schemas/brand.schema';

// Initialize services
const emailService = new EmailService();
const auditService = new AuditService(prisma);
const brandService = new BrandService(
  prisma,
  emailService,
  auditService,
  storageProvider
);

export const brandsRouter = createTRPCRouter({
  /**
   * CREATE - Create new brand profile
   */
  create: protectedProcedure
    .input(createBrandSchema)
    .mutation(async ({ ctx, input }) => {
      const brand = await brandService.createBrand(ctx.user.id, input);
      return { data: brand };
    }),

  /**
   * READ - Get brand by ID
   */
  getById: protectedProcedure
    .input(getBrandByIdSchema)
    .query(async ({ ctx, input }) => {
      const brand = await brandService.getBrandById(
        input.id,
        ctx.user.id,
        ctx.user.role
      );
      
      if (!brand) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Brand not found',
        });
      }

      return { data: brand };
    }),

  /**
   * READ - Get current user's brand
   */
  getMyBrand: protectedProcedure
    .query(async ({ ctx }) => {
      const brand = await brandService.getMyBrand(ctx.user.id);
      return { data: brand };
    }),

  /**
   * READ - List brands with filtering
   */
  list: protectedProcedure
    .input(listBrandsSchema)
    .query(async ({ ctx, input }) => {
      const result = await brandService.listBrands(
        input.page,
        input.limit,
        input.filters,
        input.sortBy,
        input.sortOrder,
        ctx.user.id,
        ctx.user.role
      );
      
      return { data: result };
    }),

  /**
   * READ - Search brands
   */
  search: protectedProcedure
    .input(searchBrandsSchema)
    .query(async ({ ctx, input }) => {
      const result = await brandService.searchBrands(
        input.query,
        input.filters,
        ctx.user.id,
        ctx.user.role,
        input.page,
        input.limit
      );
      
      return { data: result };
    }),

  /**
   * UPDATE - Update brand profile
   */
  update: protectedProcedure
    .input(z.object({ id: z.string().cuid(), data: updateBrandSchema }))
    .mutation(async ({ ctx, input }) => {
      const brand = await brandService.updateBrand(
        input.id,
        input.data,
        ctx.user.id,
        ctx.user.role
      );
      
      return { data: brand };
    }),

  /**
   * UPDATE - Update brand guidelines
   */
  updateGuidelines: protectedProcedure
    .input(updateGuidelinesSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await brandService.updateBrandGuidelines(
        input.id,
        input.fileKey,
        ctx.user.id,
        ctx.user.role
      );
      
      return { data: result };
    }),

  /**
   * TEAM - Add team member
   */
  addTeamMember: protectedProcedure
    .input(addTeamMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const member = await brandService.addTeamMember(input, ctx.user.id);
      return { data: member };
    }),

  /**
   * TEAM - Remove team member
   */
  removeTeamMember: protectedProcedure
    .input(removeTeamMemberSchema)
    .mutation(async ({ ctx, input }) => {
      await brandService.removeTeamMember(
        input.brandId,
        input.userId,
        ctx.user.id
      );
      
      return { data: { success: true } };
    }),

  /**
   * ADMIN - Verify brand
   * Requires brand:verify permission and senior-level access
   */
  verify: adminProcedure
    .use(requirePermission(PERMISSIONS.BRAND_APPLICATION_VERIFY))
    .use(requireSenior('Brand verification requires senior-level authorization'))
    .input(verifyBrandSchema)
    .mutation(async ({ ctx, input }) => {
      const brand = await brandService.verifyBrand(
        input.id,
        ctx.user.id,
        input.notes
      );
      
      return { data: brand };
    }),

  /**
   * ADMIN - Reject brand
   */
  reject: adminProcedure
    .use(requirePermission(PERMISSIONS.BRAND_APPLICATION_REJECT))
    .input(rejectBrandSchema)
    .mutation(async ({ ctx, input }) => {
      const brand = await brandService.rejectBrand(
        input.id,
        ctx.user.id,
        input.reason,
        input.notes
      );
      
      return { data: brand };
    }),

  /**
   * ADMIN - Request additional information from brand
   */
  requestInfo: adminProcedure
    .use(requirePermission(PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO))
    .input(requestBrandInfoSchema)
    .mutation(async ({ ctx, input }) => {
      await brandService.requestBrandInfo(
        input.id,
        input.requestedInfo,
        input.message,
        ctx.user.id,
        input.deadline
      );
      
      return { data: { success: true } };
    }),

  /**
   * DELETE - Soft delete brand
   */
  delete: protectedProcedure
    .input(deleteBrandSchema)
    .mutation(async ({ ctx, input }) => {
      await brandService.deleteBrand(
        input.id,
        ctx.user.id,
        ctx.user.role,
        input.reason
      );
      
      
      return { data: { success: true, deletedAt: new Date().toISOString() } };
    }),

  /**
   * ADMIN - List all brands for review
   */
  listForReview: adminProcedure
    .use(requirePermission(PERMISSIONS.BRAND_APPLICATION_REVIEW))
    .input(listBrandsSchema)
    .query(async ({ ctx, input }) => {
      const result = await brandService.listBrands(
        input.page,
        input.limit,
        input.filters,
        input.sortBy,
        input.sortOrder,
        ctx.user.id,
        'ADMIN' // Force admin role for full access
      );
      
      return { data: result };
    }),

  /**
   * ADMIN - Get brand statistics
   */
  getStatistics: adminProcedure
    .query(async () => {
      const stats = await brandService.getBrandStatistics();
      return { data: stats };
    }),
});

