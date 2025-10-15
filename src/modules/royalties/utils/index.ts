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

// Advanced period generation utilities
export {
  generateMonthlyPeriodsForYear,
  generateQuarterlyPeriodsForYear,
  generateFiscalYearMonthlyPeriods,
  generateFiscalYearQuarterlyPeriods,
  generatePeriodsForDateRange,
  generateTrailingPeriods,
  generateYearToDatePeriods,
  getCurrentPeriod,
  getPreviousPeriod,
  getNextPeriod,
  getPeriodIdentifier,
  parsePeriodIdentifier,
  batchCreatePeriodsForYear,
  getReadablePeriodName,
  isDateInPeriod,
  findPeriodForDate,
  sortPeriods,
  type FiscalYearConfig,
  type PeriodGenerationOptions,
} from './period-generator.utils';

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

// License scope utilities
export {
  parseLicenseScope,
  validateScopeCompliance,
  calculateExclusivityPremium,
  allocateRevenueByScopeCategory,
  isScopeExpired,
  isScopeActive,
  getScopeDisplaySummary,
  mergeScopes,
  type LicenseScope,
  type ReportedUsage,
  type ScopeValidationResult,
  type ScopeViolation,
  type ScopeWarning,
  type ScopeRevenueAllocation,
} from './scope.utils';

// Derivative work utilities
export {
  calculateDerivativeRoyaltySplit,
  calculateMultiLevelDerivativeRoyalty,
  validateDerivativeChain,
  getDerivativeWorkMetadata,
  type DerivativeWorkInfo,
  type DerivativeRoyaltySplit,
} from './derivative.utils';
