/**
 * Royalty-Specific Error Classes
 * Custom errors for royalty module operations
 */

import { TRPCError } from '@trpc/server';

/**
 * Royalty Run Not Found Error
 */
export class RoyaltyRunNotFoundError extends TRPCError {
  constructor(runId?: string) {
    super({
      code: 'NOT_FOUND',
      message: runId
        ? `Royalty run ${runId} not found`
        : 'Royalty run not found',
    });
  }
}

/**
 * Royalty Run Invalid State Error
 */
export class RoyaltyRunInvalidStateError extends TRPCError {
  constructor(currentStatus: string, expectedStatus: string) {
    super({
      code: 'BAD_REQUEST',
      message: `Run must be in ${expectedStatus} status, currently ${currentStatus}`,
    });
  }
}

/**
 * Royalty Run Overlapping Error
 */
export class RoyaltyRunOverlappingError extends TRPCError {
  constructor(periodStart: Date, periodEnd: Date) {
    super({
      code: 'CONFLICT',
      message: `A royalty run already exists for the period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    });
  }
}

/**
 * Royalty Statement Not Found Error
 */
export class RoyaltyStatementNotFoundError extends TRPCError {
  constructor(statementId?: string) {
    super({
      code: 'NOT_FOUND',
      message: statementId
        ? `Royalty statement ${statementId} not found`
        : 'Royalty statement not found',
    });
  }
}

/**
 * Royalty Statement Dispute Error
 */
export class RoyaltyStatementDisputeError extends TRPCError {
  constructor(message: string) {
    super({
      code: 'BAD_REQUEST',
      message,
    });
  }
}

/**
 * Royalty Statement Already Reviewed Error
 */
export class RoyaltyStatementAlreadyReviewedError extends TRPCError {
  constructor(statementId: string) {
    super({
      code: 'CONFLICT',
      message: `Statement ${statementId} has already been reviewed`,
    });
  }
}

/**
 * Royalty Statement Already Disputed Error
 */
export class RoyaltyStatementAlreadyDisputedError extends TRPCError {
  constructor(statementId: string) {
    super({
      code: 'CONFLICT',
      message: `Statement ${statementId} has already been disputed`,
    });
  }
}

/**
 * Royalty Calculation Error
 */
export class RoyaltyCalculationError extends TRPCError {
  constructor(message: string, details?: any) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Royalty calculation failed: ${message}`,
      cause: details,
    });
  }
}

/**
 * Royalty Run Already Paid Error
 * Prevents rollback of runs that have been paid out
 */
export class RoyaltyRunAlreadyPaidError extends TRPCError {
  constructor(runId: string) {
    super({
      code: 'PRECONDITION_FAILED',
      message: `Cannot rollback run ${runId} because payments have already been processed. Rollback is only allowed before payout.`,
    });
  }
}

/**
 * Royalty Run Rollback Error
 * General error for rollback operations
 */
export class RoyaltyRunRollbackError extends TRPCError {
  constructor(message: string, details?: any) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Rollback failed: ${message}`,
      cause: details,
    });
  }
}

/**
 * Insufficient Rollback Permissions Error
 */
export class InsufficientRollbackPermissionsError extends TRPCError {
  constructor(userId: string) {
    super({
      code: 'FORBIDDEN',
      message: `User ${userId} does not have permission to rollback royalty runs. This operation requires ADMIN role.`,
    });
  }
}

/**
 * Unresolved Disputes Error
 */
export class UnresolvedDisputesError extends TRPCError {
  constructor(disputeCount: number) {
    super({
      code: 'PRECONDITION_FAILED',
      message: `Cannot lock run with ${disputeCount} unresolved dispute(s)`,
    });
  }
}

/**
 * Creator Has No Stripe Account Error
 */
export class CreatorHasNoStripeAccountError extends TRPCError {
  constructor(creatorId: string) {
    super({
      code: 'PRECONDITION_FAILED',
      message: `Creator ${creatorId} has no connected Stripe account. Payouts cannot be processed.`,
    });
  }
}

/**
 * Unauthorized Access to Statement Error
 */
export class UnauthorizedStatementAccessError extends TRPCError {
  constructor(statementId: string) {
    super({
      code: 'FORBIDDEN',
      message: `You do not have permission to access statement ${statementId}`,
    });
  }
}
