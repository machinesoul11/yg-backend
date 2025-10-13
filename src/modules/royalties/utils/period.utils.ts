/**
 * Royalty Period Management Utilities
 * Handles period validation, generation, and overlap detection
 */

import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, addMonths, addQuarters, isWithinInterval, isBefore, isAfter } from 'date-fns';
import { RoyaltyRunOverlappingError } from '../errors/royalty.errors';

/**
 * Royalty Period Type
 */
export type RoyaltyPeriodType = 'MONTHLY' | 'QUARTERLY' | 'CUSTOM';

/**
 * Royalty Period Interface
 */
export interface RoyaltyPeriod {
  periodStart: Date;
  periodEnd: Date;
  periodType: RoyaltyPeriodType;
}

/**
 * Validate that period dates are valid and end is after start
 */
export function validatePeriodDates(periodStart: Date, periodEnd: Date): void {
  if (isBefore(periodEnd, periodStart)) {
    throw new Error('Period end date must be after start date');
  }

  if (periodStart.getTime() === periodEnd.getTime()) {
    throw new Error('Period start and end dates cannot be the same');
  }
}

/**
 * Check if two periods overlap
 */
export function periodsOverlap(
  period1Start: Date,
  period1End: Date,
  period2Start: Date,
  period2End: Date
): boolean {
  // Period 1 starts during period 2
  const period1StartsInPeriod2 = isWithinInterval(period1Start, {
    start: period2Start,
    end: period2End,
  });

  // Period 1 ends during period 2
  const period1EndsInPeriod2 = isWithinInterval(period1End, {
    start: period2Start,
    end: period2End,
  });

  // Period 2 starts during period 1
  const period2StartsInPeriod1 = isWithinInterval(period2Start, {
    start: period1Start,
    end: period1End,
  });

  // Period 2 ends during period 1
  const period2EndsInPeriod1 = isWithinInterval(period2End, {
    start: period1Start,
    end: period1End,
  });

  return (
    period1StartsInPeriod2 ||
    period1EndsInPeriod2 ||
    period2StartsInPeriod1 ||
    period2EndsInPeriod1
  );
}

/**
 * Check if periods are adjacent (one ends exactly when the other starts)
 */
export function periodsAreAdjacent(
  period1Start: Date,
  period1End: Date,
  period2Start: Date,
  period2End: Date
): boolean {
  // Period 1 ends exactly when period 2 starts
  const period1BeforePeriod2 =
    period1End.getTime() === period2Start.getTime();

  // Period 2 ends exactly when period 1 starts
  const period2BeforePeriod1 =
    period2End.getTime() === period1Start.getTime();

  return period1BeforePeriod2 || period2BeforePeriod1;
}

/**
 * Check for overlapping royalty runs in the database
 */
export async function checkForOverlappingRuns(
  prisma: PrismaClient,
  periodStart: Date,
  periodEnd: Date,
  excludeRunId?: string
): Promise<void> {
  const overlappingRuns = await prisma.royaltyRun.findMany({
    where: {
      id: excludeRunId ? { not: excludeRunId } : undefined,
      OR: [
        // New period starts during existing period
        {
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodStart },
        },
        // New period ends during existing period
        {
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodEnd },
        },
        // Existing period is contained within new period
        {
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
        },
      ],
    },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  if (overlappingRuns.length > 0) {
    throw new RoyaltyRunOverlappingError(periodStart, periodEnd);
  }
}

/**
 * Generate monthly periods for a given year
 */
export function generateMonthlyPeriods(year: number): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    periods.push({
      periodStart: startOfMonth(date),
      periodEnd: endOfMonth(date),
      periodType: 'MONTHLY',
    });
  }

  return periods;
}

/**
 * Generate quarterly periods for a given year
 */
export function generateQuarterlyPeriods(year: number): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];

  for (let quarter = 0; quarter < 4; quarter++) {
    const date = new Date(year, quarter * 3, 1);
    periods.push({
      periodStart: startOfQuarter(date),
      periodEnd: endOfQuarter(date),
      periodType: 'QUARTERLY',
    });
  }

  return periods;
}

/**
 * Generate fiscal year periods based on a custom fiscal start month
 * @param year - The fiscal year
 * @param fiscalStartMonth - The starting month of the fiscal year (0-11, where 0 is January)
 * @param periodType - MONTHLY or QUARTERLY
 */
export function generateFiscalYearPeriods(
  year: number,
  fiscalStartMonth: number = 0,
  periodType: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY'
): RoyaltyPeriod[] {
  const periods: RoyaltyPeriod[] = [];
  const fiscalYearStart = new Date(year, fiscalStartMonth, 1);

  if (periodType === 'MONTHLY') {
    for (let i = 0; i < 12; i++) {
      const date = addMonths(fiscalYearStart, i);
      periods.push({
        periodStart: startOfMonth(date),
        periodEnd: endOfMonth(date),
        periodType: 'MONTHLY',
      });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const date = addQuarters(fiscalYearStart, i);
      periods.push({
        periodStart: startOfQuarter(date),
        periodEnd: endOfQuarter(date),
        periodType: 'QUARTERLY',
      });
    }
  }

  return periods;
}

/**
 * Determine the period type based on date range
 */
export function detectPeriodType(periodStart: Date, periodEnd: Date): RoyaltyPeriodType {
  const monthStart = startOfMonth(periodStart);
  const monthEnd = endOfMonth(periodStart);
  const quarterStart = startOfQuarter(periodStart);
  const quarterEnd = endOfQuarter(periodStart);

  // Check if it matches a monthly period
  if (
    periodStart.getTime() === monthStart.getTime() &&
    periodEnd.getTime() === monthEnd.getTime()
  ) {
    return 'MONTHLY';
  }

  // Check if it matches a quarterly period
  if (
    periodStart.getTime() === quarterStart.getTime() &&
    periodEnd.getTime() === quarterEnd.getTime()
  ) {
    return 'QUARTERLY';
  }

  return 'CUSTOM';
}

/**
 * Get the display name for a period
 */
export function getPeriodDisplayName(periodStart: Date, periodEnd: Date): string {
  const periodType = detectPeriodType(periodStart, periodEnd);

  switch (periodType) {
    case 'MONTHLY':
      return periodStart.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    case 'QUARTERLY':
      const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
      return `Q${quarter} ${periodStart.getFullYear()}`;
    case 'CUSTOM':
      return `${periodStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} - ${periodEnd.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
  }
}

/**
 * Calculate the number of days in a period
 */
export function getPeriodDays(periodStart: Date, periodEnd: Date): number {
  const milliseconds = periodEnd.getTime() - periodStart.getTime();
  return Math.ceil(milliseconds / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
}

/**
 * Calculate the overlap days between a license period and a royalty period
 */
export function calculateOverlapDays(
  licenseStart: Date,
  licenseEnd: Date,
  periodStart: Date,
  periodEnd: Date
): number {
  // Determine the effective start and end dates
  const effectiveStart = isAfter(licenseStart, periodStart) ? licenseStart : periodStart;
  const effectiveEnd = isBefore(licenseEnd, periodEnd) ? licenseEnd : periodEnd;

  // If there's no overlap, return 0
  if (isAfter(effectiveStart, effectiveEnd)) {
    return 0;
  }

  return getPeriodDays(effectiveStart, effectiveEnd);
}
