/**
 * Advanced Period Generation Utilities
 * Automated period creation and management for royalty runs
 */

import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, addMonths, addQuarters, addYears, startOfYear, endOfYear, subMonths, subQuarters, format, parseISO } from 'date-fns';
import type { RoyaltyPeriod } from './period.utils';

/**
 * Fiscal year configuration
 */
export interface FiscalYearConfig {
  startMonth: number; // 0-11 (0 = January)
  startDay: number; // 1-31
}

/**
 * Period generation options
 */
export interface PeriodGenerationOptions {
  fiscalYearConfig?: FiscalYearConfig;
  includePartialPeriods?: boolean; // Include periods that extend beyond the requested range
  excludeCurrentPeriod?: boolean; // Exclude the current period (useful for historical runs)
}

/**
 * Generate all monthly periods for a specific year
 */
export function generateMonthlyPeriodsForYear(
  year: number,
  options?: PeriodGenerationOptions
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  const currentDate = new Date();

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    const periodStart = startOfMonth(date);
    const periodEnd = endOfMonth(date);

    // Skip current period if requested
    if (options?.excludeCurrentPeriod) {
      const isCurrentMonth = 
        periodStart.getMonth() === currentDate.getMonth() &&
        periodStart.getFullYear() === currentDate.getFullYear();
      
      if (isCurrentMonth) {
        continue;
      }
    }

    periods.push({
      periodStart,
      periodEnd,
      periodType: 'MONTHLY',
    });
  }

  return periods;
}

/**
 * Generate all quarterly periods for a specific year
 */
export function generateQuarterlyPeriodsForYear(
  year: number,
  options?: PeriodGenerationOptions
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  const currentDate = new Date();

  for (let quarter = 0; quarter < 4; quarter++) {
    const date = new Date(year, quarter * 3, 1);
    const periodStart = startOfQuarter(date);
    const periodEnd = endOfQuarter(date);

    // Skip current quarter if requested
    if (options?.excludeCurrentPeriod) {
      const currentQuarter = Math.floor(currentDate.getMonth() / 3);
      const isCurrentQuarter = 
        quarter === currentQuarter &&
        periodStart.getFullYear() === currentDate.getFullYear();
      
      if (isCurrentQuarter) {
        continue;
      }
    }

    periods.push({
      periodStart,
      periodEnd,
      periodType: 'QUARTERLY',
    });
  }

  return periods;
}

/**
 * Generate fiscal year monthly periods
 */
export function generateFiscalYearMonthlyPeriods(
  fiscalYear: number,
  fiscalYearConfig: FiscalYearConfig
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  
  // Fiscal year starts on the configured month/day
  const fiscalYearStart = new Date(
    fiscalYear - 1,
    fiscalYearConfig.startMonth,
    fiscalYearConfig.startDay
  );

  for (let i = 0; i < 12; i++) {
    const monthStart = addMonths(fiscalYearStart, i);
    const periodStart = startOfMonth(monthStart);
    const periodEnd = endOfMonth(monthStart);

    periods.push({
      periodStart,
      periodEnd,
      periodType: 'MONTHLY',
    });
  }

  return periods;
}

/**
 * Generate fiscal year quarterly periods
 */
export function generateFiscalYearQuarterlyPeriods(
  fiscalYear: number,
  fiscalYearConfig: FiscalYearConfig
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  
  const fiscalYearStart = new Date(
    fiscalYear - 1,
    fiscalYearConfig.startMonth,
    fiscalYearConfig.startDay
  );

  for (let i = 0; i < 4; i++) {
    const quarterStart = addQuarters(fiscalYearStart, i);
    const periodStart = startOfQuarter(quarterStart);
    const periodEnd = endOfQuarter(quarterStart);

    periods.push({
      periodStart,
      periodEnd,
      periodType: 'QUARTERLY',
    });
  }

  return periods;
}

/**
 * Generate periods for a date range with specified frequency
 */
export function generatePeriodsForDateRange(
  startDate: Date,
  endDate: Date,
  frequency: 'MONTHLY' | 'QUARTERLY'
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  let currentDate = frequency === 'MONTHLY' 
    ? startOfMonth(startDate) 
    : startOfQuarter(startDate);

  while (currentDate <= endDate) {
    const periodStart = currentDate;
    const periodEnd = frequency === 'MONTHLY' 
      ? endOfMonth(currentDate)
      : endOfQuarter(currentDate);

    periods.push({
      periodStart,
      periodEnd,
      periodType: frequency,
    });

    currentDate = frequency === 'MONTHLY'
      ? addMonths(currentDate, 1)
      : addQuarters(currentDate, 1);
  }

  return periods;
}

/**
 * Generate trailing periods (last N months or quarters)
 */
export function generateTrailingPeriods(
  count: number,
  frequency: 'MONTHLY' | 'QUARTERLY',
  endDate: Date = new Date()
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  
  for (let i = count - 1; i >= 0; i--) {
    const date = frequency === 'MONTHLY'
      ? subMonths(endDate, i)
      : subQuarters(endDate, i);

    const periodStart = frequency === 'MONTHLY'
      ? startOfMonth(date)
      : startOfQuarter(date);

    const periodEnd = frequency === 'MONTHLY'
      ? endOfMonth(date)
      : endOfQuarter(date);

    periods.push({
      periodStart,
      periodEnd,
      periodType: frequency,
    });
  }

  return periods;
}

/**
 * Generate year-to-date periods
 */
export function generateYearToDatePeriods(
  year: number,
  frequency: 'MONTHLY' | 'QUARTERLY'
): RoyaltyPeriod[] {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const currentDate = new Date();
  
  // Only include periods up to the current date
  const endDate = currentDate.getFullYear() === year 
    ? currentDate 
    : endOfYear(new Date(year, 11, 31));

  return generatePeriodsForDateRange(yearStart, endDate, frequency);
}

/**
 * Get the current period based on frequency
 */
export function getCurrentPeriod(
  frequency: 'MONTHLY' | 'QUARTERLY',
  date: Date = new Date()
): RoyaltyPeriod {
  const periodStart = frequency === 'MONTHLY'
    ? startOfMonth(date)
    : startOfQuarter(date);

  const periodEnd = frequency === 'MONTHLY'
    ? endOfMonth(date)
    : endOfQuarter(date);

  return {
    periodStart,
    periodEnd,
    periodType: frequency,
  };
}

/**
 * Get the previous period based on frequency
 */
export function getPreviousPeriod(
  frequency: 'MONTHLY' | 'QUARTERLY',
  date: Date = new Date()
): RoyaltyPeriod {
  const previousDate = frequency === 'MONTHLY'
    ? subMonths(date, 1)
    : subQuarters(date, 1);

  return getCurrentPeriod(frequency, previousDate);
}

/**
 * Get the next period based on frequency
 */
export function getNextPeriod(
  frequency: 'MONTHLY' | 'QUARTERLY',
  date: Date = new Date()
): RoyaltyPeriod {
  const nextDate = frequency === 'MONTHLY'
    ? addMonths(date, 1)
    : addQuarters(date, 1);

  return getCurrentPeriod(frequency, nextDate);
}

/**
 * Get period identifier string (e.g., "2025-01" for monthly, "2025-Q1" for quarterly)
 */
export function getPeriodIdentifier(period: RoyaltyPeriod): string {
  const { periodStart, periodType } = period;

  if (periodType === 'MONTHLY') {
    return format(periodStart, 'yyyy-MM');
  } else if (periodType === 'QUARTERLY') {
    const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
    return `${periodStart.getFullYear()}-Q${quarter}`;
  } else {
    return `${format(periodStart, 'yyyy-MM-dd')}_to_${format(period.periodEnd, 'yyyy-MM-dd')}`;
  }
}

/**
 * Parse period identifier back to date range
 */
export function parsePeriodIdentifier(identifier: string): RoyaltyPeriod | null {
  // Monthly format: YYYY-MM
  const monthlyMatch = identifier.match(/^(\d{4})-(\d{2})$/);
  if (monthlyMatch) {
    const [, year, month] = monthlyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return {
      periodStart: startOfMonth(date),
      periodEnd: endOfMonth(date),
      periodType: 'MONTHLY',
    };
  }

  // Quarterly format: YYYY-QN
  const quarterlyMatch = identifier.match(/^(\d{4})-Q([1-4])$/);
  if (quarterlyMatch) {
    const [, year, quarter] = quarterlyMatch;
    const month = (parseInt(quarter) - 1) * 3;
    const date = new Date(parseInt(year), month, 1);
    return {
      periodStart: startOfQuarter(date),
      periodEnd: endOfQuarter(date),
      periodType: 'QUARTERLY',
    };
  }

  // Custom format: YYYY-MM-DD_to_YYYY-MM-DD
  const customMatch = identifier.match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})$/);
  if (customMatch) {
    const [, startStr, endStr] = customMatch;
    return {
      periodStart: parseISO(startStr),
      periodEnd: parseISO(endStr),
      periodType: 'CUSTOM',
    };
  }

  return null;
}

/**
 * Batch create period definitions for automated scheduling
 */
export function batchCreatePeriodsForYear(
  year: number,
  frequency: 'MONTHLY' | 'QUARTERLY',
  options?: PeriodGenerationOptions
): Array<{
  identifier: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: string;
  displayName: string;
}> {
  const periods = frequency === 'MONTHLY'
    ? generateMonthlyPeriodsForYear(year, options)
    : generateQuarterlyPeriodsForYear(year, options);

  return periods.map(period => ({
    identifier: getPeriodIdentifier(period),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    periodType: period.periodType,
    displayName: getReadablePeriodName(period),
  }));
}

/**
 * Get human-readable period name
 */
export function getReadablePeriodName(period: RoyaltyPeriod): string {
  const { periodStart, periodType } = period;

  if (periodType === 'MONTHLY') {
    return format(periodStart, 'MMMM yyyy');
  } else if (periodType === 'QUARTERLY') {
    const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
    return `Q${quarter} ${periodStart.getFullYear()}`;
  } else {
    return `${format(periodStart, 'MMM dd, yyyy')} - ${format(period.periodEnd, 'MMM dd, yyyy')}`;
  }
}

/**
 * Check if a date falls within a period
 */
export function isDateInPeriod(date: Date, period: RoyaltyPeriod): boolean {
  return date >= period.periodStart && date <= period.periodEnd;
}

/**
 * Find which period a date belongs to from a list of periods
 */
export function findPeriodForDate(
  date: Date,
  periods: RoyaltyPeriod[]
): RoyaltyPeriod | null {
  return periods.find(period => isDateInPeriod(date, period)) || null;
}

/**
 * Sort periods chronologically
 */
export function sortPeriods(
  periods: RoyaltyPeriod[],
  order: 'ASC' | 'DESC' = 'ASC'
): RoyaltyPeriod[] {
  return [...periods].sort((a, b) => {
    const comparison = a.periodStart.getTime() - b.periodStart.getTime();
    return order === 'ASC' ? comparison : -comparison;
  });
}
