/**
 * Payouts Router (tRPC)
 * API endpoints for payout operations
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  creatorProcedure,
} from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { PayoutEligibilityService } from '../services/payout-eligibility.service';
import { PayoutBalanceService } from '../services/payout-balance.service';
import { PayoutProcessingService } from '../services/payout-processing.service';
import { PayoutRetryService } from '../services/payout-retry.service';
import {
  initiatePayoutSchema,
  getPayoutByIdSchema,
  listPayoutsSchema,
  retryPayoutSchema,
  getMyPayoutsSchema,
  getPendingBalanceSchema,
  batchPayoutSchema,
} from '../schemas/payout.schema';
import {
  PayoutEligibilityError,
  PayoutBalanceError,
  StripeTransferError,
  PayoutNotFoundError,
} from '../errors';
import { PayoutStatus } from '@prisma/client';

// Initialize services
const auditService = new AuditService(prisma);
const eligibilityService = new PayoutEligibilityService(prisma);
const balanceService = new PayoutBalanceService(prisma);
const processingService = new PayoutProcessingService(prisma, redis);
const retryService = new PayoutRetryService(prisma, redis);

/**
 * Helper to map errors to TRPC errors
 */
function mapErrorToTRPC(error: unknown): TRPCError {
  if (error instanceof PayoutEligibilityError) {
    return new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof PayoutBalanceError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof StripeTransferError) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof PayoutNotFoundError) {
    return new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof TRPCError) {
    return error;
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    cause: error,
  });
}

/**
 * Payouts Router
 */
export const payoutsRouter = createTRPCRouter({
  // ==================== POST /payouts/transfer (Initiate Payout) ====================

  /**
   * Initiate a new payout transfer
   * Admin: Can initiate for any creator
   * Creator: Can only initiate for themselves
   */
  transfer: protectedProcedure
    .input(initiatePayoutSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        // Determine the creator ID
        let creatorId = input.creatorId;

        if (userRole === 'CREATOR') {
          // Creators can only create payouts for themselves
          const creator = await prisma.creator.findUnique({
            where: { userId, deletedAt: null },
            select: { id: true },
          });

          if (!creator) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Creator profile not found',
            });
          }

          // Override any provided creatorId with their own
          creatorId = creator.id;
        } else if (userRole === 'ADMIN') {
          // Admins must provide a creatorId
          if (!creatorId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'creatorId is required for admin-initiated payouts',
            });
          }
        } else {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only creators and admins can initiate payouts',
          });
        }

        // Check eligibility
        const eligibility = await eligibilityService.checkEligibility(creatorId);
        if (!eligibility.eligible) {
          throw new PayoutEligibilityError(
            'Creator is not eligible for payout',
            eligibility.reasons
          );
        }

        // Calculate balance if amount not specified
        let amountCents = input.amountCents;
        if (!amountCents) {
          const balance = await balanceService.calculateBalance(creatorId);
          amountCents = balance.availableBalanceCents;

          if (amountCents <= 0 || !balance.meetsMinimum) {
            throw new PayoutBalanceError(
              `Insufficient balance. Minimum required: $${balance.minimumRequired / 100}`,
              balance.availableBalanceCents
            );
          }
        }

        // Validate amount against available balance
        const balance = await balanceService.calculateBalance(creatorId);
        if (amountCents > balance.availableBalanceCents) {
          throw new PayoutBalanceError(
            `Requested amount exceeds available balance of $${balance.availableBalanceCents / 100}`,
            balance.availableBalanceCents
          );
        }

        // Generate idempotency key
        const idempotencyKey = `payout_${creatorId}_${Date.now()}`;

        // Process payout
        const result = await processingService.processPayout({
          creatorId,
          amountCents,
          royaltyStatementIds: input.royaltyStatementIds,
          idempotencyKey,
        });

        if (!result.success) {
          throw new StripeTransferError(
            result.error || 'Failed to process payout',
            undefined,
            result.retryable
          );
        }

        // Audit log
        await auditService.log({
          userId,
          action: 'payout.initiated',
          entityType: 'payout',
          entityId: result.payoutId!,
          after: {
            creatorId,
            amountCents: result.amountCents,
            stripeTransferId: result.stripeTransferId,
            initiatedBy: userRole,
          },
        });

        return {
          success: true,
          data: {
            id: result.payoutId,
            amountCents: result.amountCents,
            stripeTransferId: result.stripeTransferId,
            status: PayoutStatus.PENDING,
            estimatedArrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
          },
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== GET /payouts/:id (Payout Details) ====================

  /**
   * Get detailed information about a specific payout
   * Creators can only view their own payouts
   * Admins can view any payout
   */
  getById: protectedProcedure
    .input(getPayoutByIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        // Apply security filter
        const securityFilter = ctx.securityFilters.apply('payout', {
          id: input.id,
        });

        const payout: any = await prisma.payout.findFirst({
          where: securityFilter,
          include: {
            creator: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            royaltyStatement: true,
          },
        });

        if (!payout) {
          throw new PayoutNotFoundError(input.id);
        }

        // Audit log (read access)
        await auditService.log({
          userId,
          action: 'payout.viewed',
          entityType: 'payout',
          entityId: payout.id,
          after: {
            viewedBy: userRole,
          },
        });

        return {
          data: {
            id: payout.id,
            creatorId: payout.creatorId,
            creatorName: payout.creator.user.name,
            creatorEmail: payout.creator.user.email,
            amountCents: payout.amountCents,
            status: payout.status,
            stripeTransferId: payout.stripeTransferId,
            processedAt: payout.processedAt,
            failedReason: payout.failedReason,
            retryCount: payout.retryCount,
            lastRetryAt: payout.lastRetryAt,
            createdAt: payout.createdAt,
            updatedAt: payout.updatedAt,
            royaltyStatement: payout.royaltyStatement,
          },
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== GET /payouts (List Payouts) ====================

  /**
   * List all payouts with filtering (Admin only)
   */
  list: adminProcedure
    .input(listPayoutsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        // Build where clause
        const where: any = {};

        if (input.creatorId) {
          where.creatorId = input.creatorId;
        }

        if (input.status) {
          where.status = input.status;
        }

        if (input.startDate || input.endDate) {
          where.createdAt = {};
          if (input.startDate) {
            where.createdAt.gte = input.startDate;
          }
          if (input.endDate) {
            where.createdAt.lte = input.endDate;
          }
        }

        if (input.minAmount || input.maxAmount) {
          where.amountCents = {};
          if (input.minAmount) {
            where.amountCents.gte = input.minAmount;
          }
          if (input.maxAmount) {
            where.amountCents.lte = input.maxAmount;
          }
        }

        // Calculate pagination
        const skip = (input.page - 1) * input.limit;

        // Get total count
        const totalCount = await prisma.payout.count({ where });

        // Get paginated results
        const payouts = await prisma.payout.findMany({
          where,
          include: {
            creator: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            [input.sortBy]: input.sortOrder,
          },
          skip,
          take: input.limit,
        });

        // Calculate stats
        const aggregations = await prisma.payout.aggregate({
          where,
          _sum: { amountCents: true },
          _count: true,
        });

        // Audit log
        await auditService.log({
          userId,
          action: 'payout.list_viewed',
          entityType: 'payout',
          entityId: 'list',
          after: {
            filters: input,
            resultCount: payouts.length,
          },
        });

        return {
          data: payouts.map((payout) => {
            const creator = payout.creator as any;
            return {
              id: payout.id,
              creatorId: payout.creatorId,
              creatorName: creator?.user?.name || 'Unknown',
              creatorEmail: creator?.user?.email || 'Unknown',
              amountCents: payout.amountCents,
              status: payout.status,
              stripeTransferId: payout.stripeTransferId,
              processedAt: payout.processedAt,
              failedReason: payout.failedReason,
              retryCount: payout.retryCount,
              createdAt: payout.createdAt,
            };
          }),
          meta: {
            page: input.page,
            limit: input.limit,
            totalCount,
            totalPages: Math.ceil(totalCount / input.limit),
            totalAmountCents: aggregations._sum.amountCents || 0,
          },
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== POST /payouts/:id/retry (Retry Failed Payout) ====================

  /**
   * Retry a failed payout
   * Creators can retry their own payouts
   * Admins can retry any payout
   */
  retry: protectedProcedure
    .input(retryPayoutSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        // Apply security filter
        const securityFilter = ctx.securityFilters.apply('payout', {
          id: input.id,
        });

        const payout = await prisma.payout.findFirst({
          where: securityFilter,
        });

        if (!payout) {
          throw new PayoutNotFoundError(input.id);
        }

        // Validate payout can be retried
        if (payout.status !== PayoutStatus.FAILED) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot retry payout with status: ${payout.status}`,
          });
        }

        // Attempt retry
        const result = await retryService.retryPayout(input.id);

        // Audit log
        await auditService.log({
          userId,
          action: 'payout.retry_attempted',
          entityType: 'payout',
          entityId: input.id,
          after: {
            success: result.success,
            shouldRetry: result.shouldRetry,
            nextRetryAt: result.nextRetryAt,
            error: result.error,
            retriedBy: userRole,
          },
        });

        return {
          success: result.success,
          data: {
            id: input.id,
            canRetry: result.shouldRetry,
            nextRetryAt: result.nextRetryAt,
            error: result.error,
          },
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== GET /me/payouts (Creator's Payout History) ====================

  /**
   * Get the authenticated creator's payout history
   */
  getMyPayouts: protectedProcedure
    .input(getMyPayoutsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        // Get creator profile
        const creator = await prisma.creator.findUnique({
          where: { userId, deletedAt: null },
          select: { id: true },
        });

        if (!creator) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator profile not found',
          });
        }

        // Build where clause
        const where: any = {
          creatorId: creator.id,
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.startDate || input.endDate) {
          where.createdAt = {};
          if (input.startDate) {
            where.createdAt.gte = input.startDate;
          }
          if (input.endDate) {
            where.createdAt.lte = input.endDate;
          }
        }

        // Calculate pagination
        const skip = (input.page - 1) * input.limit;

        // Get total count
        const totalCount = await prisma.payout.count({ where });

        // Get paginated results
        const payouts: any = await prisma.payout.findMany({
          where,
          include: {
            royaltyStatement: true,
          },
          orderBy: {
            [input.sortBy]: input.sortOrder,
          },
          skip,
          take: input.limit,
        });

        // Calculate summary stats
        const completedPayouts = await prisma.payout.aggregate({
          where: {
            creatorId: creator.id,
            status: PayoutStatus.COMPLETED,
          },
          _sum: { amountCents: true },
          _count: true,
        });

        const lastPayout = await prisma.payout.findFirst({
          where: {
            creatorId: creator.id,
            status: PayoutStatus.COMPLETED,
          },
          orderBy: { processedAt: 'desc' },
          select: {
            amountCents: true,
            processedAt: true,
          },
        });

        return {
          data: payouts.map((payout: any) => ({
            id: payout.id,
            amountCents: payout.amountCents,
            status: payout.status,
            stripeTransferId: payout.stripeTransferId,
            processedAt: payout.processedAt,
            failedReason: payout.failedReason,
            retryCount: payout.retryCount,
            createdAt: payout.createdAt,
            royaltyStatement: payout.royaltyStatement || null,
          })),
          meta: {
            page: input.page,
            limit: input.limit,
            totalCount,
            totalPages: Math.ceil(totalCount / input.limit),
          },
          summary: {
            totalPayoutsCents: completedPayouts._sum.amountCents || 0,
            totalPayoutsCount: completedPayouts._count || 0,
            lastPayoutAmount: lastPayout?.amountCents,
            lastPayoutDate: lastPayout?.processedAt,
          },
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== GET /me/payouts/pending (Creator's Pending Balance) ====================

  /**
   * Get the authenticated creator's pending balance
   */
  getPendingBalance: protectedProcedure
    .input(getPendingBalanceSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;

        // Get creator profile
        const creator = await prisma.creator.findUnique({
          where: { userId, deletedAt: null },
          select: { id: true },
        });

        if (!creator) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator profile not found',
          });
        }

        // Calculate balance
        const balance = await balanceService.calculateBalance(creator.id);

        // Get last payout info
        const lastPayout = await prisma.payout.findFirst({
          where: {
            creatorId: creator.id,
            status: PayoutStatus.COMPLETED,
          },
          orderBy: { processedAt: 'desc' },
          select: {
            amountCents: true,
            processedAt: true,
          },
        });

        // Get pending payouts
        const pendingPayouts = await prisma.payout.findMany({
          where: {
            creatorId: creator.id,
            status: {
              in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
            },
          },
          select: {
            id: true,
            amountCents: true,
            status: true,
            createdAt: true,
          },
        });

        const response: any = {
          pendingBalanceCents: balance.availableBalanceCents,
          currency: 'USD',
          meetsMinimum: balance.meetsMinimum,
          minimumRequiredCents: balance.minimumRequired,
          canInitiatePayout: balance.meetsMinimum && balance.availableBalanceCents > 0,
          lastPayout: lastPayout
            ? {
                amountCents: lastPayout.amountCents,
                processedAt: lastPayout.processedAt,
              }
            : null,
          pendingPayouts: pendingPayouts.map((p) => ({
            id: p.id,
            amountCents: p.amountCents,
            status: p.status,
            createdAt: p.createdAt,
          })),
        };

        if (input.includeBreakdown) {
          response.breakdown = {
            totalBalanceCents: balance.totalBalanceCents,
            resolvedUnpaidCents: balance.breakdown.resolvedUnpaidCents,
            pendingPayoutsCents: balance.breakdown.pendingPayoutsCents,
            disputedCents: balance.breakdown.disputedCents,
            reservedBalanceCents: balance.reservedBalanceCents,
          };
        }

        return { data: response };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ==================== Admin Batch Operations ====================

  /**
   * Initiate batch payouts (Admin only)
   */
  batchInitiate: adminProcedure
    .input(batchPayoutSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const results: any = {
          totalCreators: 0,
          successfulPayouts: 0,
          failedPayouts: 0,
          skippedCreators: 0,
          payoutIds: [] as string[],
          errors: [] as Array<{ creatorId: string; error: string }>,
        };

        // Determine creator list
        let creatorIds: string[] = [];

        if (input.autoSelectEligible) {
          // Get all eligible creators
          const creators = await prisma.creator.findMany({
            where: {
              deletedAt: null,
              onboardingStatus: 'completed',
            },
            select: { id: true },
          });

          for (const creator of creators) {
            const eligibility = await eligibilityService.checkEligibility(creator.id);
            const balance = await balanceService.calculateBalance(creator.id);

            const meetsMinimum = input.minAmountCents
              ? balance.availableBalanceCents >= input.minAmountCents
              : balance.meetsMinimum;

            if (eligibility.eligible && meetsMinimum) {
              creatorIds.push(creator.id);
            }
          }
        } else if (input.creatorIds && input.creatorIds.length > 0) {
          creatorIds = input.creatorIds;
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Either provide creatorIds or set autoSelectEligible to true',
          });
        }

        results.totalCreators = creatorIds.length;

        // Process each creator
        for (const creatorId of creatorIds) {
          try {
            // Check eligibility
            const eligibility = await eligibilityService.checkEligibility(creatorId);
            if (!eligibility.eligible) {
              results.skippedCreators++;
              results.errors.push({
                creatorId,
                error: `Not eligible: ${eligibility.reasons.join(', ')}`,
              });
              continue;
            }

            // Calculate balance
            const balance = await balanceService.calculateBalance(creatorId);
            const amountCents = balance.availableBalanceCents;

            const meetsMinimum = input.minAmountCents
              ? amountCents >= input.minAmountCents
              : balance.meetsMinimum;

            if (!meetsMinimum) {
              results.skippedCreators++;
              results.errors.push({
                creatorId,
                error: `Insufficient balance: $${amountCents / 100}`,
              });
              continue;
            }

            // Process payout
            const idempotencyKey = `batch_payout_${creatorId}_${Date.now()}`;
            const result = await processingService.processPayout({
              creatorId,
              amountCents,
              idempotencyKey,
            });

            if (result.success) {
              results.successfulPayouts++;
              results.payoutIds.push(result.payoutId!);
            } else {
              results.failedPayouts++;
              results.errors.push({
                creatorId,
                error: result.error || 'Unknown error',
              });
            }
          } catch (error: any) {
            results.failedPayouts++;
            results.errors.push({
              creatorId,
              error: error.message || 'Unknown error',
            });
          }
        }

        // Audit log
        await auditService.log({
          userId,
          action: 'payout.batch_initiated',
          entityType: 'payout',
          entityId: 'batch',
          after: {
            ...results,
            input,
          },
        });

        return {
          success: true,
          data: results,
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),
});

export default payoutsRouter;
