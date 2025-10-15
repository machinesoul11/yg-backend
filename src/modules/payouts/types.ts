/**
 * Payout Module Types
 */

import { PayoutStatus } from '@prisma/client';

export interface CreatePayoutInput {
  creatorId: string;
  royaltyStatementIds?: string[];
  amountCents?: number;
}

export interface PayoutDetails {
  id: string;
  creatorId: string;
  amountCents: number;
  status: PayoutStatus;
  stripeTransferId?: string;
  processedAt?: Date;
  failedReason?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayoutListFilter {
  creatorId?: string;
  status?: PayoutStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface PayoutStats {
  totalPayouts: number;
  totalAmountCents: number;
  successfulPayouts: number;
  failedPayouts: number;
  pendingPayouts: number;
  averageAmountCents: number;
}

export interface RoyaltyStatementJobData {
  statementId: string;
  creatorId: string;
}

export interface PayoutEligibilityDetails {
  eligible: boolean;
  reasons: string[];
  availableBalanceCents: number;
  minimumRequiredCents: number;
}

export interface BatchPayoutInput {
  creatorIds?: string[];
  autoSelectEligible?: boolean;
  minAmountCents?: number;
}

export interface BatchPayoutResult {
  totalCreators: number;
  successfulPayouts: number;
  failedPayouts: number;
  skippedCreators: number;
  payoutIds: string[];
  errors: Array<{
    creatorId: string;
    error: string;
  }>;
}
