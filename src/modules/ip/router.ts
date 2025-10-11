// Placeholder for IP module router
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { IpAssetService } from './service';
import { AssetErrors, mapAssetErrorToTRPCCode } from './errors';
import { IpAssetError } from './types';
import {
  fileUploadSchema,
  confirmUploadSchema,
  updateAssetSchema,
  updateStatusSchema,
  bulkUpdateStatusSchema,
  listAssetsSchema,
  getAssetByIdSchema,
  deleteAssetSchema,
  getDerivativesSchema,
} from './validation';

/**
 * IP Assets tRPC Router
 * 
 * API endpoints for asset lifecycle management
 */

// Initialize service
const ipAssetService = new IpAssetService(prisma, storageProvider);

// Helper to handle asset errors
function handleAssetError(error: unknown): never {
  if (error instanceof IpAssetError) {
    throw new TRPCError({
      code: mapAssetErrorToTRPCCode(error) as any,
      message: error.message,
      cause: { code: error.code, details: error.details },
    });
  }
  
  console.error('Unexpected error in IP Assets:', error);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

export const ipAssetsRouter = createTRPCRouter({
  /**
   * Initiate upload (get signed URL)
   */
  initiateUpload: protectedProcedure
    .input(fileUploadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // TODO: Get user from context once auth is implemented
        const userId = 'temp-user-id'; // ctx.session.user.id
        const userRole = 'CREATOR'; // ctx.session.user.role

        return await ipAssetService.initiateUpload(
          { userId, userRole },
          input
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Confirm upload (after frontend uploads to storage)
   */
  confirmUpload: protectedProcedure
    .input(confirmUploadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.confirmUpload(
          { userId, userRole },
          input
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * List assets (paginated, filtered)
   */
  list: protectedProcedure
    .input(listAssetsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.listAssets(
          { userId, userRole },
          input
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Get single asset details
   */
  getById: protectedProcedure
    .input(getAssetByIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.getAssetById(
          { userId, userRole },
          input.id
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Update asset metadata
   */
  update: protectedProcedure
    .input(updateAssetSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.updateAsset(
          { userId, userRole },
          input
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Change asset status
   */
  updateStatus: protectedProcedure
    .input(updateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.updateStatus(
          { userId, userRole },
          input
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Delete asset (soft delete)
   */
  delete: protectedProcedure
    .input(deleteAssetSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.deleteAsset(
          { userId, userRole },
          input.id
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Get download URL (signed, 15min expiry)
   */
  getDownloadUrl: protectedProcedure
    .input(getAssetByIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.getDownloadUrl(
          { userId, userRole },
          input.id
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * List derivatives of an asset
   */
  getDerivatives: protectedProcedure
    .input(getDerivativesSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'CREATOR';

        return await ipAssetService.getDerivatives(
          { userId, userRole },
          input.parentAssetId
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),

  /**
   * Admin: Bulk status update
   */
  bulkUpdateStatus: protectedProcedure // TODO: Change to adminProcedure when implemented
    .input(bulkUpdateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = 'temp-user-id';
        const userRole = 'ADMIN'; // TODO: Get from ctx.session.user.role

        return await ipAssetService.bulkUpdateStatus(
          { userId, userRole },
          input.assetIds,
          input.status
        );
      } catch (error) {
        handleAssetError(error);
      }
    }),
});

