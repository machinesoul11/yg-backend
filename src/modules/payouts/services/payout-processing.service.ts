/**
 * Payout Processing Service
 * Handles Stripe transfer creation and payout processing logic
 */

import Stripe from 'stripe';
import { PrismaClient, PayoutStatus, RoyaltyStatementStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { PayoutEligibilityService } from './payout-eligibility.service';
import { PayoutBalanceService } from './payout-balance.service';
import { auditService } from '@/lib/services/audit.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

export interface ProcessPayoutInput {
  creatorId: string;
  royaltyStatementIds?: string[];
  amountCents?: number; // Optional: if not provided, use all available
  idempotencyKey?: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  stripeTransferId?: string;
  amountCents?: number;
  error?: string;
  retryable?: boolean;
}

export class PayoutProcessingService {
  private eligibilityService: PayoutEligibilityService;
  private balanceService: PayoutBalanceService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.eligibilityService = new PayoutEligibilityService(prisma);
    this.balanceService = new PayoutBalanceService(prisma);
  }

  /**
   * Process payout for creator
   */
  async processPayout(input: ProcessPayoutInput): Promise<PayoutResult> {
    const { creatorId, royaltyStatementIds, amountCents, idempotencyKey } = input;

    try {
      // 1. Check eligibility
      const eligibility = await this.eligibilityService.checkEligibility(creatorId);
      if (!eligibility.eligible) {
        return {
          success: false,
          error: `Creator not eligible for payout: ${eligibility.reasons.join(', ')}`,
          retryable: false,
        };
      }

      // 2. Get creator details
      const creator = await this.prisma.creator.findUnique({
        where: { id: creatorId, deletedAt: null },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!creator || !creator.stripeAccountId) {
        return {
          success: false,
          error: 'Creator or Stripe account not found',
          retryable: false,
        };
      }

      // 3. Determine royalty statements to pay
      let statementsToPay;
      if (royaltyStatementIds && royaltyStatementIds.length > 0) {
        statementsToPay = await this.prisma.royaltyStatement.findMany({
          where: {
            id: { in: royaltyStatementIds },
            creatorId,
            status: RoyaltyStatementStatus.RESOLVED,
            paidAt: null,
          },
        });
      } else {
        statementsToPay = await this.balanceService.getUnpaidStatements(creatorId);
      }

      if (statementsToPay.length === 0) {
        return {
          success: false,
          error: 'No unpaid statements found',
          retryable: false,
        };
      }

      // 4. Calculate payout amount
      const payoutAmountCents = amountCents || statementsToPay.reduce(
        (sum, stmt) => sum + (stmt as any).netPayableCents,
        0
      );

      // 5. Validate balance
      const balanceCheck = await this.balanceService.validateMinimumBalance(
        creatorId,
        payoutAmountCents
      );

      if (!balanceCheck.valid) {
        return {
          success: false,
          error: balanceCheck.reason,
          retryable: false,
        };
      }

      // 6. Generate idempotency key if not provided
      const idempKey = idempotencyKey || `payout_${creatorId}_${Date.now()}`;

      // 7. Check for duplicate payout (race condition prevention)
      const duplicateCheck = await this.checkDuplicatePayout(creatorId, payoutAmountCents);
      if (duplicateCheck) {
        return {
          success: false,
          error: 'Duplicate payout detected',
          payoutId: duplicateCheck,
          retryable: false,
        };
      }

      // 8. Create payout record in database (PENDING status)
      const payout = await this.prisma.payout.create({
        data: {
          creatorId,
          amountCents: payoutAmountCents,
          status: PayoutStatus.PENDING,
          royaltyStatementId: statementsToPay[0]?.id, // Link to first statement
        },
      });

      try {
        // 9. Create Stripe transfer
        const transfer = await this.createStripeTransfer({
          accountId: creator.stripeAccountId,
          amountCents: payoutAmountCents,
          creatorId,
          payoutId: payout.id,
          idempotencyKey: idempKey,
          metadata: {
            creatorName: creator.stageName || creator.user.name || 'Unknown',
            statementIds: statementsToPay.map(s => s.id).join(','),
          },
        });

        // 10. Update payout with Stripe transfer details
        const updatedPayout = await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            stripeTransferId: transfer.id,
            status: PayoutStatus.PROCESSING,
            processedAt: new Date(),
          },
        });

        // 11. Mark statements as paid (in transaction)
        await this.prisma.$transaction(async (tx) => {
          for (const statement of statementsToPay) {
            await tx.royaltyStatement.update({
              where: { id: statement.id },
              data: {
                status: RoyaltyStatementStatus.PAID,
                paidAt: new Date(),
                paymentReference: transfer.id,
              },
            });
          }
        });

        // 12. Audit log
        await auditService.log({
          userId: creatorId,
          action: 'payout.processed',
          resourceType: 'payout',
          resourceId: payout.id,
          metadata: {
            amountCents: payoutAmountCents,
            stripeTransferId: transfer.id,
            statementCount: statementsToPay.length,
          },
        });

        return {
          success: true,
          payoutId: updatedPayout.id,
          stripeTransferId: transfer.id,
          amountCents: payoutAmountCents,
        };
      } catch (error) {
        // Rollback: Update payout to FAILED
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.FAILED,
            failedReason: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw error;
      }
    } catch (error) {
      console.error('[PayoutProcessing] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRetryable = this.isRetryableError(error);

      return {
        success: false,
        error: errorMessage,
        retryable: isRetryable,
      };
    }
  }

  /**
   * Create Stripe transfer
   */
  private async createStripeTransfer(params: {
    accountId: string;
    amountCents: number;
    creatorId: string;
    payoutId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.Transfer> {
    const { accountId, amountCents, creatorId, payoutId, idempotencyKey, metadata } = params;

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: 'usd',
          destination: accountId,
          description: `Royalty payout for creator ${metadata.creatorName}`,
          metadata: {
            creatorId,
            payoutId,
            ...metadata,
          },
        },
        {
          idempotencyKey,
        }
      );

      return transfer;
    } catch (error) {
      console.error('[Stripe Transfer] Error creating transfer:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate payout to prevent race conditions
   */
  private async checkDuplicatePayout(
    creatorId: string,
    amountCents: number
  ): Promise<string | null> {
    const recentPayout = await this.prisma.payout.findFirst({
      where: {
        creatorId,
        amountCents,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
        status: {
          in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING, PayoutStatus.COMPLETED],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return recentPayout?.id || null;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Stripe.errors.StripeError) {
      // Retryable Stripe errors
      if (error.type === 'StripeConnectionError') return true;
      if (error.type === 'StripeAPIError') return true;
      if (error.code === 'rate_limit') return true;

      // Non-retryable Stripe errors
      if (error.type === 'StripeInvalidRequestError') return false;
      if (error.type === 'StripePermissionError') return false;
      if (error.code === 'account_invalid') return false;
      if (error.code === 'balance_insufficient') return false;
    }

    // Default: retryable for unknown errors
    return true;
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(payoutId: string) {
    return this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        royaltyStatement: {
          include: {
            royaltyRun: true,
          },
        },
      },
    });
  }
}
