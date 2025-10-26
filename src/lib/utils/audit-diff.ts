/**
 * Audit Log Diff Formatting Utilities
 * Generates human-readable diffs for before/after state changes
 */

export interface DiffChange {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'removed' | 'modified';
}

export interface FormattedDiff {
  added: Record<string, any>;
  removed: Record<string, any>;
  modified: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  unchanged: Record<string, any>;
}

/**
 * Compare two objects and generate a structured diff
 * @param before - Previous state
 * @param after - New state
 * @returns Formatted diff object
 */
export function generateDiff(before: any, after: any): FormattedDiff {
  const diff: FormattedDiff = {
    added: {},
    removed: {},
    modified: [],
    unchanged: {},
  };

  // Handle null/undefined cases
  if (!before && !after) {
    return diff;
  }

  if (!before) {
    return {
      ...diff,
      added: after || {},
    };
  }

  if (!after) {
    return {
      ...diff,
      removed: before || {},
    };
  }

  // Get all unique keys from both objects
  const allKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);

  for (const key of allKeys) {
    const beforeValue = before[key];
    const afterValue = after[key];

    // Field was added
    if (!(key in before) && key in after) {
      diff.added[key] = afterValue;
      continue;
    }

    // Field was removed
    if (key in before && !(key in after)) {
      diff.removed[key] = beforeValue;
      continue;
    }

    // Field was modified
    if (!deepEqual(beforeValue, afterValue)) {
      diff.modified.push({
        field: key,
        oldValue: beforeValue,
        newValue: afterValue,
      });
      continue;
    }

    // Field unchanged
    diff.unchanged[key] = beforeValue;
  }

  return diff;
}

/**
 * Deep equality check for values
 * @param a - First value
 * @param b - Second value
 * @returns True if values are deeply equal
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  if (typeof a !== typeof b) return false;

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Format a diff for display with human-readable changes
 * @param before - Previous state
 * @param after - New state
 * @returns Array of human-readable change descriptions
 */
export function formatDiffForDisplay(before: any, after: any): string[] {
  const diff = generateDiff(before, after);
  const changes: string[] = [];

  // Added fields
  for (const [field, value] of Object.entries(diff.added)) {
    changes.push(`Added ${field}: ${formatValue(value)}`);
  }

  // Removed fields
  for (const [field, value] of Object.entries(diff.removed)) {
    changes.push(`Removed ${field}: ${formatValue(value)}`);
  }

  // Modified fields
  for (const change of diff.modified) {
    changes.push(
      `Changed ${change.field}: ${formatValue(change.oldValue)} → ${formatValue(change.newValue)}`
    );
  }

  return changes;
}

/**
 * Format a value for human-readable display
 * @param value - Value to format
 * @returns Formatted string
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{${Object.keys(value).length} fields}`;
  return String(value);
}

/**
 * Get a summary of changes count
 * @param diff - Formatted diff object
 * @returns Change summary
 */
export function getDiffSummary(diff: FormattedDiff): {
  totalChanges: number;
  added: number;
  removed: number;
  modified: number;
} {
  return {
    totalChanges:
      Object.keys(diff.added).length +
      Object.keys(diff.removed).length +
      diff.modified.length,
    added: Object.keys(diff.added).length,
    removed: Object.keys(diff.removed).length,
    modified: diff.modified.length,
  };
}
