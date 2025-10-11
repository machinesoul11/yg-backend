/**
 * IP Ownership Router (tRPC)
 * 
 * API endpoints for ownership management - the cornerstone of royalty calculations
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { IpOwnershipService } from '../services/ip-ownership.service';
import {
  ownershipSplitArraySchema,
  setAssetOwnershipSchema,
  transferOwnershipSchema,
} from '../schemas/ownership.schema';
import {
  OwnershipValidationError,
  InsufficientOwnershipError,
  UnauthorizedOwnershipError,
} from '../errors/ownership.errors';
import { OwnershipType } from '@prisma/client';

// Initialize service
const ipOwnershipService = new IpOwnershipService(prisma);

// Helper to handle ownership errors
function handleOwnershipError(error: unknown): never {
  if (error instanceof OwnershipValidationError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
      cause: error.details,
    });
  }
  
  if (error instanceof InsufficientOwnershipError) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
      cause: error.details,
    });
  }
  
  if (error instanceof UnauthorizedOwnershipError) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }
  
  console.error('Unexpected error in IP Ownership:', error);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

export const ipOwnershipRouter = createTRPCRouter({
  /**
   * Set complete ownership split for an asset (atomic operation)
   */
  setOwnership: protectedProcedure
    .input(setAssetOwnershipSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        const result = await ipOwnershipService.setAssetOwnership(
          input.ipAssetId,
          input.ownerships,
          userId,
          input.effectiveDate
        );

        // Log audit event
        await prisma.auditEvent.create({
          data: {
            action: 'IP_OWNERSHIP_SET',
            userId,
            afterJson: { ipAssetId: input.ipAssetId, ownerships: result } as any,
          },
        });

        return {
          success: true,
          data: result,
          meta: {
            totalBps: result.reduce((sum, o) => sum + o.shareBps, 0),
            ownerCount: result.length,
          },
        };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Get current owners of an asset
   */
  getOwners: protectedProcedure
    .input(
      z.object({
        ipAssetId: z.string().cuid(),
        atDate: z.date().optional(),
        includeCreatorDetails: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const owners = await ipOwnershipService.getAssetOwners({
          ipAssetId: input.ipAssetId,
          atDate: input.atDate,
          includeCreatorDetails: input.includeCreatorDetails,
        });

        return {
          data: owners,
          meta: {
            totalBps: owners.reduce((sum, o) => sum + o.shareBps, 0),
            ownerCount: owners.length,
            queryDate: input.atDate?.toISOString() || new Date().toISOString(),
          },
        };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Get ownership summary for an asset
   */
  getSummary: protectedProcedure
    .input(z.object({ ipAssetId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const summary = await ipOwnershipService.getAssetOwnershipSummary(input.ipAssetId);
        return { data: summary };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Get ownership history for an asset
   */
  getHistory: protectedProcedure
    .input(z.object({ ipAssetId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        // Permission check
        if (userRole !== 'ADMIN') {
          const hasOwnership = await ipOwnershipService.hasOwnership(userId, input.ipAssetId);
          if (!hasOwnership) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have ownership of this asset',
            });
          }
        }

        const history = await ipOwnershipService.getOwnershipHistory(input.ipAssetId);
        return { data: history };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Transfer ownership between creators
   */
  transferOwnership: protectedProcedure
    .input(transferOwnershipSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        // Get user's creator profile (already available in ctx.securityContext)
        if (!ctx.securityContext?.creatorId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator profile not found',
          });
        }

        // Verify requester owns the shares they're transferring
        const currentOwnerships = await ipOwnershipService.getAssetOwners({
          ipAssetId: input.ipAssetId,
        });
        const userOwnership = currentOwnerships.find(
          (o) => o.creatorId === ctx.securityContext!.creatorId
        );

        if (!userOwnership || userOwnership.shareBps < input.shareBps) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not own enough shares to complete this transfer',
            cause: {
              required: input.shareBps,
              available: userOwnership?.shareBps || 0,
            },
          });
        }

        // Perform transfer
        const result = await ipOwnershipService.transferOwnership(
          ctx.securityContext!.creatorId,
          input.toCreatorId,
          input.ipAssetId,
          input.shareBps,
          userId,
          {
            contractReference: input.contractReference,
            legalDocUrl: input.legalDocUrl,
            notes: input.notes,
          }
        );

        // Log audit event
        await prisma.auditEvent.create({
          data: {
            action: 'IP_OWNERSHIP_TRANSFERRED',
            userId,
            afterJson: result as any,
          },
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Validate ownership split without saving
   */
  validateSplit: protectedProcedure
    .input(z.object({ ownerships: ownershipSplitArraySchema }))
    .query(async ({ ctx, input }) => {
      try {
        const validation = ipOwnershipService.validateOwnershipSplit(input.ownerships);
        return { data: validation };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * End an ownership record
   */
  endOwnership: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        // Get ownership record
        const ownership = await prisma.ipOwnership.findUnique({
          where: { id: input.id },
          include: { creator: true },
        });

        if (!ownership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ownership record not found',
          });
        }

        await ipOwnershipService.deleteOwnership(input.id, userId);

        // Log audit event
        await prisma.auditEvent.create({
          data: {
            action: 'IP_OWNERSHIP_ENDED',
            userId,
            beforeJson: ownership as any,
          },
        });

        return { success: true };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),

  /**
   * Get assets owned by a creator
   */
  getCreatorAssets: protectedProcedure
    .input(
      z.object({
        creatorId: z.string().cuid(),
        includeExpired: z.boolean().default(false),
        ownershipType: z.nativeEnum(OwnershipType).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const assets = await ipOwnershipService.getCreatorAssets({
          creatorId: input.creatorId,
          includeExpired: input.includeExpired,
          ownershipType: input.ownershipType,
        });

        return { data: assets };
      } catch (error) {
        handleOwnershipError(error);
      }
    }),
});
