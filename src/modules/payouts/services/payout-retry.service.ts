/**
 * Payout Retry Service
 * Handles retry logic for failed payouts with exponential backoff
 */

import { PrismaClient, PayoutStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { PayoutProcessingService } from './payout-processing.service';
import { auditService } from '@/lib/services/audit.service';

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export class PayoutRetryService {
  private readonly retryConfig: RetryConfig;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.retryConfig = {
      maxRetries: parseInt(process.env.PAYOUT_MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.PAYOUT_RETRY_BASE_DELAY_MS || '60000'), // 1 minute
      maxDelayMs: parseInt(process.env.PAYOUT_RETRY_MAX_DELAY_MS || '3600000'), // 1 hour
      backoffMultiplier: parseFloat(process.env.PAYOUT_RETRY_BACKOFF_MULTIPLIER || '2'),
    };
  }

  /**
   * Calculate next retry delay using exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, retryCount),
      this.retryConfig.maxDelayMs
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Retry failed payout
   */
  async retryPayout(payoutId: string): Promise<{
    success: boolean;
    shouldRetry: boolean;
    nextRetryAt?: Date;
    error?: string;
  }> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: true,
        royaltyStatement: true,
      },
    });

    if (!payout) {
      return {
        success: false,
        shouldRetry: false,
        error: 'Payout not found',
      };
    }

    // Check if already succeeded
    if (payout.status === PayoutStatus.COMPLETED) {
      return {
        success: true,
        shouldRetry: false,
      };
    }

    // Check max retries
    if ((payout as any).retryCount >= this.retryConfig.maxRetries) {
      await this.markPayoutFailed(payoutId, 'Max retries exceeded');
      return {
        success: false,
        shouldRetry: false,
        error: 'Maximum retry attempts exceeded',
      };
    }

    // Check if Stripe transfer actually succeeded (reconciliation)
    if (payout.stripeTransferId) {
      const reconciled = await this.reconcileStripeTransfer(payout.stripeTransferId);
      if (reconciled.succeeded) {
        await this.markPayoutCompleted(payoutId, payout.stripeTransferId);
        return {
          success: true,
          shouldRetry: false,
        };
      }
    }

    // Increment retry count
    const updatedPayout = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        retryCount: (payout as any).retryCount + 1,
        lastRetryAt: new Date(),
        status: PayoutStatus.PENDING,
      },
    });

    // Calculate next retry delay
    const retryDelayMs = this.calculateRetryDelay((updatedPayout as any).retryCount);
    const nextRetryAt = new Date(Date.now() + retryDelayMs);

    // Schedule retry via Redis
    await this.scheduleRetry(payoutId, retryDelayMs);

    // Audit log
    await auditService.log({
      userId: payout.creatorId,
      action: 'payout.retry_scheduled',
      entityType: 'payout',
      entityId: payoutId,
      metadata: {
        retryCount: (updatedPayout as any).retryCount,
        nextRetryAt: nextRetryAt.toISOString(),
        previousError: payout.failedReason,
      },
    });

    // Attempt retry immediately
    const processingService = new PayoutProcessingService(this.prisma, this.redis);
    const result = await processingService.processPayout({
      creatorId: payout.creatorId,
      amountCents: (payout as any).amountCents,
      royaltyStatementIds: payout.royaltyStatementId ? [payout.royaltyStatementId] : undefined,
      idempotencyKey: `retry_${payoutId}_${(updatedPayout as any).retryCount}`,
    });

    if (result.success) {
      return {
        success: true,
        shouldRetry: false,
      };
    }

    return {
      success: false,
      shouldRetry: result.retryable && (updatedPayout as any).retryCount < this.retryConfig.maxRetries,
      nextRetryAt,
      error: result.error,
    };
  }

  /**
   * Schedule retry in Redis
   */
  private async scheduleRetry(payoutId: string, delayMs: number): Promise<void> {
    const key = `payout:retry:${payoutId}`;
    await this.redis.setex(key, Math.ceil(delayMs / 1000), JSON.stringify({
      payoutId,
      scheduledAt: new Date().toISOString(),
      retryAt: new Date(Date.now() + delayMs).toISOString(),
    }));
  }

  /**
   * Reconcile Stripe transfer status
   */
  private async reconcileStripeTransfer(
    transferId: string
  ): Promise<{ succeeded: boolean; status?: string }> {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-09-30.clover',
      });

      const transfer = await stripe.transfers.retrieve(transferId);

      return {
        succeeded: transfer.amount > 0 && !transfer.reversed,
        status: transfer.reversed ? 'reversed' : 'succeeded',
      };
    } catch (error) {
      console.error('[Reconcile] Error retrieving transfer:', error);
      return { succeeded: false };
    }
  }

  /**
   * Mark payout as failed
   */
  private async markPayoutFailed(payoutId: string, reason: string): Promise<void> {
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.FAILED,
        failedReason: reason,
      },
    });

    // Restore funds to creator balance by unmarking statements as paid
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { royaltyStatement: true },
    });

    if (payout?.royaltyStatement) {
      await this.prisma.royaltyStatement.update({
        where: { id: payout.royaltyStatement.id },
        data: {
          status: 'RESOLVED',
          paidAt: null,
          paymentReference: null,
        },
      });
    }
  }

  /**
   * Mark payout as completed
   */
  private async markPayoutCompleted(payoutId: string, transferId: string): Promise<void> {
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.COMPLETED,
        stripeTransferId: transferId,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Process stuck payouts (for scheduled job)
   */
  async processStuckPayouts(): Promise<void> {
    // Find payouts that are stuck in PENDING or PROCESSING for too long
    const stuckPayouts = await this.prisma.payout.findMany({
      where: {
        status: {
          in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
        },
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
        },
      },
    });

    for (const payout of stuckPayouts) {
      try {
        await this.retryPayout(payout.id);
      } catch (error) {
        console.error(`[StuckPayouts] Error retrying payout ${payout.id}:`, error);
      }
    }
  }
}
