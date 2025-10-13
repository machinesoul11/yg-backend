/**
 * Financial Calculation Utilities
 * Precision handling, rounding, and monetary operations for royalty calculations
 */

/**
 * Banker's rounding (round-half-to-even)
 * Reduces systematic bias in rounding over many calculations
 */
export function bankersRound(value: number): number {
  const rounded = Math.round(value);
  const decimal = value - Math.floor(value);

  // If exactly 0.5, round to nearest even number
  if (decimal === 0.5) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }

  // If exactly -0.5, round to nearest even number
  if (decimal === -0.5) {
    return rounded % 2 === 0 ? rounded : rounded + 1;
  }

  // Otherwise use standard rounding
  return rounded;
}

/**
 * Calculate royalty share in cents from revenue and basis points
 * Formula: (revenueCents * basisPoints) / 10000
 */
export function calculateRoyaltyShare(
  revenueCents: number,
  basisPoints: number
): number {
  if (basisPoints < 0 || basisPoints > 10000) {
    throw new Error('Basis points must be between 0 and 10000');
  }

  // Use floating point for precision during calculation
  const rawShare = (revenueCents * basisPoints) / 10000;

  // Apply banker's rounding for the final result
  return bankersRound(rawShare);
}

/**
 * Pro-rate revenue based on days active in period
 */
export function prorateRevenue(
  totalRevenueCents: number,
  daysActive: number,
  totalDaysInPeriod: number
): number {
  if (daysActive <= 0 || totalDaysInPeriod <= 0) {
    return 0;
  }

  if (daysActive >= totalDaysInPeriod) {
    return totalRevenueCents;
  }

  const rawProrated = (totalRevenueCents * daysActive) / totalDaysInPeriod;
  return bankersRound(rawProrated);
}

/**
 * Calculate percentage with precision
 */
export function calculatePercentage(
  part: number,
  whole: number,
  decimals: number = 2
): number {
  if (whole === 0) return 0;
  return Number(((part / whole) * 100).toFixed(decimals));
}

/**
 * Convert basis points to percentage
 */
export function bpsToPercentage(basisPoints: number, decimals: number = 2): number {
  return Number((basisPoints / 100).toFixed(decimals));
}

/**
 * Convert percentage to basis points
 */
export function percentageToBps(percentage: number): number {
  return Math.round(percentage * 100);
}

/**
 * Format cents to dollar string
 */
export function formatCentsToDollars(cents: number, includeSymbol: boolean = true): string {
  const dollars = (cents / 100).toFixed(2);
  return includeSymbol ? `$${dollars}` : dollars;
}

/**
 * Format basis points to readable percentage
 */
export function formatBpsToPercentage(bps: number): string {
  return `${bpsToPercentage(bps)}%`;
}

/**
 * Validate that ownership splits sum to exactly 10000 basis points
 */
export function validateOwnershipSplit(shareBps: number[]): boolean {
  const total = shareBps.reduce((sum, share) => sum + share, 0);
  return total === 10000;
}

/**
 * Calculate the total from an array of values in cents
 */
export function sumCents(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Rounding reconciliation - track cumulative rounding differences
 */
export interface RoundingReconciliation {
  preRoundedTotal: number;
  postRoundedTotal: number;
  roundingDifference: number;
  itemCount: number;
  averageRoundingError: number;
}

/**
 * Calculate rounding reconciliation for a set of calculations
 */
export function calculateRoundingReconciliation(
  preRoundedValues: number[],
  postRoundedValues: number[]
): RoundingReconciliation {
  if (preRoundedValues.length !== postRoundedValues.length) {
    throw new Error('Pre-rounded and post-rounded arrays must have the same length');
  }

  const preRoundedTotal = preRoundedValues.reduce((sum, val) => sum + val, 0);
  const postRoundedTotal = postRoundedValues.reduce((sum, val) => sum + val, 0);
  const roundingDifference = Math.abs(postRoundedTotal - preRoundedTotal);
  const itemCount = preRoundedValues.length;
  const averageRoundingError = itemCount > 0 ? roundingDifference / itemCount : 0;

  return {
    preRoundedTotal,
    postRoundedTotal,
    roundingDifference,
    itemCount,
    averageRoundingError,
  };
}

/**
 * Check if rounding reconciliation is within acceptable tolerance
 * Default tolerance: 1 cent per 100 items
 */
export function isRoundingWithinTolerance(
  reconciliation: RoundingReconciliation,
  maxDifferenceCents: number = Math.max(1, Math.ceil(reconciliation.itemCount / 100))
): boolean {
  return reconciliation.roundingDifference <= maxDifferenceCents;
}

/**
 * Apply minimum threshold to a value
 * Returns 0 if value is below threshold, otherwise returns the value
 */
export function applyMinimumThreshold(
  valueCents: number,
  thresholdCents: number
): number {
  return valueCents >= thresholdCents ? valueCents : 0;
}

/**
 * Calculate accumulated balance considering minimum threshold
 */
export function calculateAccumulatedBalance(
  currentBalanceCents: number,
  newEarningsCents: number,
  minimumPayoutThresholdCents: number
): {
  totalAccumulatedCents: number;
  shouldPayout: boolean;
  carryoverCents: number;
} {
  const totalAccumulatedCents = currentBalanceCents + newEarningsCents;
  const shouldPayout = totalAccumulatedCents >= minimumPayoutThresholdCents;
  const carryoverCents = shouldPayout ? 0 : totalAccumulatedCents;

  return {
    totalAccumulatedCents,
    shouldPayout,
    carryoverCents,
  };
}

/**
 * Split an amount across multiple parties with guaranteed accuracy
 * Uses largest remainder method to ensure split amounts sum to original
 */
export function splitAmountAccurately(
  totalCents: number,
  splits: { id: string; basisPoints: number }[]
): { id: string; amountCents: number }[] {
  // Validate splits sum to 10000 bps
  const totalBps = splits.reduce((sum, split) => sum + split.basisPoints, 0);
  if (totalBps !== 10000) {
    throw new Error(`Split basis points must sum to 10000, got ${totalBps}`);
  }

  // Calculate raw shares (with decimals)
  const rawShares = splits.map((split) => ({
    id: split.id,
    rawAmount: (totalCents * split.basisPoints) / 10000,
  }));

  // Calculate rounded shares and remainders
  const roundedShares = rawShares.map((share) => ({
    id: share.id,
    amountCents: Math.floor(share.rawAmount),
    remainder: share.rawAmount - Math.floor(share.rawAmount),
  }));

  // Calculate total after rounding
  let roundedTotal = roundedShares.reduce((sum, share) => sum + share.amountCents, 0);

  // Distribute remaining cents using largest remainder method
  const remainingCents = totalCents - roundedTotal;

  if (remainingCents > 0) {
    // Sort by remainder descending
    const sortedByRemainder = [...roundedShares].sort(
      (a, b) => b.remainder - a.remainder
    );

    // Add 1 cent to the top N shares
    for (let i = 0; i < remainingCents; i++) {
      sortedByRemainder[i].amountCents += 1;
    }
  }

  return roundedShares.map((share) => ({
    id: share.id,
    amountCents: share.amountCents,
  }));
}
