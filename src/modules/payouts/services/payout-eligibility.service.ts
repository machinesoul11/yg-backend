/**
 * Payout Eligibility Service
 * Validates whether a creator is eligible to receive a payout
 */

import { PrismaClient, RoyaltyStatementStatus } from '@prisma/client';

export interface EligibilityCheckResult {
  eligible: boolean;
  reasons: string[];
  details: {
    hasStripeAccount: boolean;
    stripeOnboardingComplete: boolean;
    payoutsEnabled: boolean;
    accountInGoodStanding: boolean;
    noActiveDDisputes: boolean;
    meetsMinimumBalance: boolean;
    termsAccepted: boolean;
  };
}

export class PayoutEligibilityService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Check if creator is eligible for payout
   */
  async checkEligibility(creatorId: string): Promise<EligibilityCheckResult> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: {
        user: {
          select: {
            isActive: true,
            locked_until: true,
          },
        },
        royaltyStatements: {
          where: {
            status: RoyaltyStatementStatus.RESOLVED,
            paidAt: null,
          },
          select: {
            netPayableCents: true,
          },
        },
      },
    });

    if (!creator) {
      return {
        eligible: false,
        reasons: ['Creator not found'],
        details: {
          hasStripeAccount: false,
          stripeOnboardingComplete: false,
          payoutsEnabled: false,
          accountInGoodStanding: false,
          noActiveDDisputes: false,
          meetsMinimumBalance: false,
          termsAccepted: false,
        },
      };
    }

    const reasons: string[] = [];
    const details = {
      hasStripeAccount: false,
      stripeOnboardingComplete: false,
      payoutsEnabled: false,
      accountInGoodStanding: false,
      noActiveDDisputes: false,
      meetsMinimumBalance: false,
      termsAccepted: false,
    };

    // Check Stripe account exists
    if (!creator.stripeAccountId) {
      reasons.push('No Stripe account connected');
    } else {
      details.hasStripeAccount = true;
    }

    // Check onboarding completed
    if (creator.onboardingStatus !== 'completed') {
      reasons.push('Stripe onboarding not completed');
    } else {
      details.stripeOnboardingComplete = true;
    }

    // Check transfers capability enabled
    const transfersCapability = await this.prisma.stripeAccountCapability.findFirst({
      where: {
        creatorId,
        capability: 'transfers',
        status: 'active',
      },
    });

    if (!transfersCapability) {
      reasons.push('Stripe transfers capability not enabled');
    } else {
      details.payoutsEnabled = true;
    }

    // Check account status
    if (!creator.user.isActive || creator.user.locked_until) {
      reasons.push('Account is suspended or locked');
    } else {
      details.accountInGoodStanding = true;
    }

    // Check for active disputes
    const activeDisputes = await this.prisma.royaltyStatement.count({
      where: {
        creatorId,
        status: RoyaltyStatementStatus.DISPUTED,
        disputedAt: { not: null },
      },
    });

    if (activeDisputes > 0) {
      reasons.push('Active royalty statement disputes exist');
    } else {
      details.noActiveDDisputes = true;
    }

    // Check minimum balance (calculated from resolved unpaid statements)
    const totalUnpaid = creator.royaltyStatements.reduce(
      (sum: number, statement) => sum + statement.netPayableCents,
      0
    );

    const MINIMUM_PAYOUT_CENTS = parseInt(process.env.MINIMUM_PAYOUT_CENTS || '5000'); // Default $50

    if (totalUnpaid < MINIMUM_PAYOUT_CENTS) {
      reasons.push(`Available balance below minimum threshold of $${MINIMUM_PAYOUT_CENTS / 100}`);
    } else {
      details.meetsMinimumBalance = true;
    }

    // Terms acceptance (assuming verified creators have accepted terms)
    if (creator.verificationStatus !== 'verified') {
      reasons.push('Creator verification not completed');
    } else {
      details.termsAccepted = true;
    }

    const eligible = reasons.length === 0;

    return {
      eligible,
      reasons,
      details,
    };
  }

  /**
   * Batch check eligibility for multiple creators
   */
  async checkBatchEligibility(
    creatorIds: string[]
  ): Promise<Map<string, EligibilityCheckResult>> {
    const results = new Map<string, EligibilityCheckResult>();

    for (const creatorId of creatorIds) {
      const result = await this.checkEligibility(creatorId);
      results.set(creatorId, result);
    }

    return results;
  }

  /**
   * Get list of creators eligible for payout
   */
  async getEligibleCreators(): Promise<string[]> {
    const MINIMUM_PAYOUT_CENTS = parseInt(process.env.MINIMUM_PAYOUT_CENTS || '5000');

    // Get creators with resolved unpaid statements
    const creators = await this.prisma.creator.findMany({
      where: {
        deletedAt: null,
        onboardingStatus: 'completed',
        verificationStatus: 'verified',
        user: {
          isActive: true,
          locked_until: null,
        },
        royaltyStatements: {
          some: {
            status: RoyaltyStatementStatus.RESOLVED,
            paidAt: null,
          },
        },
      },
      include: {
        royaltyStatements: {
          where: {
            status: RoyaltyStatementStatus.RESOLVED,
            paidAt: null,
          },
          select: {
            netPayableCents: true,
          },
        },
      },
    });

    // Filter by minimum balance and no disputes
    const eligible: string[] = [];

    for (const creator of creators) {
      const totalUnpaid = creator.royaltyStatements.reduce(
        (sum: number, statement) => sum + statement.netPayableCents,
        0
      );

      if (totalUnpaid >= MINIMUM_PAYOUT_CENTS) {
        // Check for disputes
        const disputes = await this.prisma.royaltyStatement.count({
          where: {
            creatorId: creator.id,
            status: RoyaltyStatementStatus.DISPUTED,
          },
        });

        if (disputes === 0) {
          eligible.push(creator.id);
        }
      }
    }

    return eligible;
  }
}
