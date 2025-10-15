/**
 * Payout Balance Service
 * Validates minimum balance and calculates available funds for payout
 */

import { PrismaClient, RoyaltyStatementStatus, PayoutStatus } from '@prisma/client';

export interface BalanceCalculation {
  totalBalanceCents: number;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  reservedBalanceCents: number;
  meetsMinimum: boolean;
  minimumRequired: number;
  breakdown: {
    resolvedUnpaidCents: number;
    pendingPayoutsCents: number;
    disputedCents: number;
  };
}

export class PayoutBalanceService {
  private readonly MINIMUM_PAYOUT_CENTS: number;
  private readonly RESERVE_PERCENTAGE: number;

  constructor(
    private readonly prisma: PrismaClient
  ) {
    this.MINIMUM_PAYOUT_CENTS = parseInt(process.env.MINIMUM_PAYOUT_CENTS || '5000'); // $50 default
    this.RESERVE_PERCENTAGE = parseFloat(process.env.PAYOUT_RESERVE_PERCENTAGE || '0'); // 0% default
  }

  /**
   * Calculate available balance for creator
   */
  async calculateBalance(creatorId: string): Promise<BalanceCalculation> {
    // Get all resolved unpaid statements
    const resolvedStatements = await this.prisma.royaltyStatement.findMany({
      where: {
        creatorId,
        status: RoyaltyStatementStatus.RESOLVED,
        paidAt: null,
      },
    });

    const resolvedUnpaidCents = resolvedStatements.reduce(
      (sum, stmt) => sum + (stmt as any).netPayableCents,
      0
    );

    // Get pending payouts
    const pendingPayouts = await this.prisma.payout.findMany({
      where: {
        creatorId,
        status: {
          in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
        },
      },
    });

    const pendingPayoutsCents = pendingPayouts.reduce(
      (sum, payout) => sum + (payout as any).amountCents,
      0
    );

    // Get disputed amounts
    const disputedStatements = await this.prisma.royaltyStatement.findMany({
      where: {
        creatorId,
        status: RoyaltyStatementStatus.DISPUTED,
      },
    });

    const disputedCents = disputedStatements.reduce(
      (sum, stmt) => sum + (stmt as any).netPayableCents,
      0
    );

    // Calculate balances
    const totalBalanceCents = resolvedUnpaidCents;
    const reservedBalanceCents = Math.floor(totalBalanceCents * this.RESERVE_PERCENTAGE);
    const availableBalanceCents = Math.max(0, totalBalanceCents - reservedBalanceCents - pendingPayoutsCents);
    const pendingBalanceCents = pendingPayoutsCents;

    return {
      totalBalanceCents,
      availableBalanceCents,
      pendingBalanceCents,
      reservedBalanceCents,
      meetsMinimum: availableBalanceCents >= this.MINIMUM_PAYOUT_CENTS,
      minimumRequired: this.MINIMUM_PAYOUT_CENTS,
      breakdown: {
        resolvedUnpaidCents,
        pendingPayoutsCents,
        disputedCents,
      },
    };
  }

  /**
   * Validate if creator has sufficient balance for payout
   */
  async validateMinimumBalance(
    creatorId: string,
    requestedAmountCents?: number
  ): Promise<{ valid: boolean; reason?: string; availableBalanceCents: number }> {
    const balance = await this.calculateBalance(creatorId);

    if (balance.availableBalanceCents < this.MINIMUM_PAYOUT_CENTS) {
      return {
        valid: false,
        reason: `Available balance ($${(balance.availableBalanceCents / 100).toFixed(2)}) is below minimum payout threshold ($${(this.MINIMUM_PAYOUT_CENTS / 100).toFixed(2)})`,
        availableBalanceCents: balance.availableBalanceCents,
      };
    }

    if (requestedAmountCents && requestedAmountCents > balance.availableBalanceCents) {
      return {
        valid: false,
        reason: `Requested amount ($${(requestedAmountCents / 100).toFixed(2)}) exceeds available balance ($${(balance.availableBalanceCents / 100).toFixed(2)})`,
        availableBalanceCents: balance.availableBalanceCents,
      };
    }

    if (requestedAmountCents && requestedAmountCents < this.MINIMUM_PAYOUT_CENTS) {
      return {
        valid: false,
        reason: `Requested amount ($${(requestedAmountCents / 100).toFixed(2)}) is below minimum payout threshold ($${(this.MINIMUM_PAYOUT_CENTS / 100).toFixed(2)})`,
        availableBalanceCents: balance.availableBalanceCents,
      };
    }

    return {
      valid: true,
      availableBalanceCents: balance.availableBalanceCents,
    };
  }

  /**
   * Get unpaid royalty statements for creator
   */
  async getUnpaidStatements(creatorId: string) {
    return this.prisma.royaltyStatement.findMany({
      where: {
        creatorId,
        status: RoyaltyStatementStatus.RESOLVED,
        paidAt: null,
      },
      include: {
        royaltyRun: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Calculate payout amount from unpaid statements
   */
  async calculatePayoutAmount(statementIds: string[]): Promise<number> {
    const statements = await this.prisma.royaltyStatement.findMany({
      where: {
        id: { in: statementIds },
        status: RoyaltyStatementStatus.RESOLVED,
        paidAt: null,
      },
    });

    return statements.reduce((sum, stmt) => sum + (stmt as any).netPayableCents, 0);
  }
}
