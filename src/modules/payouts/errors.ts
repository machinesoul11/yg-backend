/**
 * Payout Module Errors
 */

export class PayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoutError';
  }
}

export class PayoutEligibilityError extends PayoutError {
  constructor(message: string, public reasons: string[]) {
    super(message);
    this.name = 'PayoutEligibilityError';
  }
}

export class PayoutBalanceError extends PayoutError {
  constructor(message: string, public availableBalanceCents: number) {
    super(message);
    this.name = 'PayoutBalanceError';
  }
}

export class StripeTransferError extends PayoutError {
  constructor(
    message: string,
    public stripeErrorCode?: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'StripeTransferError';
  }
}

export class PayoutNotFoundError extends PayoutError {
  constructor(payoutId: string) {
    super(`Payout not found: ${payoutId}`);
    this.name = 'PayoutNotFoundError';
  }
}

export class DuplicatePayoutError extends PayoutError {
  constructor(message: string, public existingPayoutId: string) {
    super(message);
    this.name = 'DuplicatePayoutError';
  }
}

export class PayoutRetryExhaustedError extends PayoutError {
  constructor(payoutId: string, maxRetries: number) {
    super(`Payout ${payoutId} failed after ${maxRetries} retries`);
    this.name = 'PayoutRetryExhaustedError';
  }
}
