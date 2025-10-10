import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

/**
 * Format a date to a readable string
 */
export function formatDate(
  date: Date | string,
  formatString: string = 'MMM dd, yyyy',
): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return 'Invalid date';
  return format(dateObj, formatString);
}

/**
 * Format a date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return 'Invalid date';
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

/**
 * Format a date for API responses (ISO string)
 */
export function formatApiDate(date: Date): string {
  return date.toISOString();
}

/**
 * Get the start of the current month
 */
export function getMonthStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the end of the current month
 */
export function getMonthEnd(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Check if a date is in the past
 */
export function isPastDate(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return dateObj < new Date();
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return dateObj > new Date();
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Calculate the difference in days between two dates
 */
export function daysDifference(date1: Date, date2: Date): number {
  const timeDifference = Math.abs(date1.getTime() - date2.getTime());
  return Math.ceil(timeDifference / (1000 * 3600 * 24));
}
