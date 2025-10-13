/**
 * Royalty Utilities Index
 * Central export point for all royalty calculation utilities
 */

// Period utilities
export {
  validatePeriodDates,
  periodsOverlap,
  periodsAreAdjacent,
  checkForOverlappingRuns,
  generateMonthlyPeriods,
  generateQuarterlyPeriods,
  generateFiscalYearPeriods,
  detectPeriodType,
  getPeriodDisplayName,
  getPeriodDays,
  calculateOverlapDays,
  type RoyaltyPeriodType,
  type RoyaltyPeriod,
} from './period.utils';

// Financial utilities
export {
  bankersRound,
  calculateRoyaltyShare,
  prorateRevenue,
  calculatePercentage,
  bpsToPercentage,
  percentageToBps,
  formatCentsToDollars,
  formatBpsToPercentage,
  validateOwnershipSplit,
  sumCents,
  calculateRoundingReconciliation,
  isRoundingWithinTolerance,
  applyMinimumThreshold,
  calculateAccumulatedBalance,
  splitAmountAccurately,
  type RoundingReconciliation,
} from './financial.utils';
