/**
 * License Scope Utilities
 * Parsing, validation, and scope-based revenue allocation logic
 */

import type { License } from '@prisma/client';

/**
 * License scope structure
 */
export interface LicenseScope {
  mediaTypes?: string[];
  geographies?: string[];
  channels?: string[];
  exclusivity?: {
    exclusive: boolean;
    scope?: string;
    premium?: number; // Premium rate in basis points
  };
  cutdowns?: {
    permitted: boolean;
    maxVersions?: number;
    restrictions?: string[];
  };
  timeRestrictions?: {
    startTime?: string;
    endTime?: string;
    timezone?: string;
  };
  usageRestrictions?: {
    maxImpressions?: number;
    maxViews?: number;
    maxDownloads?: number;
  };
  derivativeRights?: {
    permitted: boolean;
    originalCreatorShareBps?: number;
  };
}

/**
 * Reported usage structure
 */
export interface ReportedUsage {
  mediaTypes?: string[];
  geographies?: string[];
  channels?: string[];
  impressions?: number;
  views?: number;
  downloads?: number;
  cutdownVersions?: number;
}

/**
 * Scope validation result
 */
export interface ScopeValidationResult {
  isValid: boolean;
  violations: ScopeViolation[];
  warnings: ScopeWarning[];
}

/**
 * Scope violation
 */
export interface ScopeViolation {
  type: 'MEDIA_TYPE' | 'GEOGRAPHY' | 'CHANNEL' | 'USAGE_LIMIT' | 'CUTDOWN' | 'TIME_RESTRICTION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  details: any;
}

/**
 * Scope warning (non-blocking)
 */
export interface ScopeWarning {
  type: 'APPROACHING_LIMIT' | 'UNUSUAL_PATTERN' | 'MISSING_DATA';
  message: string;
  details: any;
}

/**
 * Revenue allocation by scope category
 */
export interface ScopeRevenueAllocation {
  totalRevenueCents: number;
  allocations: {
    category: string;
    revenueCents: number;
    percentage: number;
    metadata?: any;
  }[];
}

/**
 * Parse license scope JSON into structured format
 */
export function parseLicenseScope(scopeJson: any): LicenseScope {
  if (!scopeJson) {
    return {};
  }

  // Handle if scopeJson is already an object
  const scope = typeof scopeJson === 'string' ? JSON.parse(scopeJson) : scopeJson;

  return {
    mediaTypes: scope.mediaTypes || scope.media_types || scope.media || undefined,
    geographies: scope.geographies || scope.regions || scope.territories || undefined,
    channels: scope.channels || scope.platforms || undefined,
    exclusivity: scope.exclusivity ? {
      exclusive: scope.exclusivity.exclusive || false,
      scope: scope.exclusivity.scope,
      premium: scope.exclusivity.premium || scope.exclusivity.premiumBps || 0,
    } : undefined,
    cutdowns: scope.cutdowns || scope.edits ? {
      permitted: scope.cutdowns?.permitted || scope.edits?.permitted || false,
      maxVersions: scope.cutdowns?.maxVersions || scope.edits?.maxVersions,
      restrictions: scope.cutdowns?.restrictions || scope.edits?.restrictions || [],
    } : undefined,
    timeRestrictions: scope.timeRestrictions || scope.time_restrictions ? {
      startTime: scope.timeRestrictions?.startTime || scope.time_restrictions?.start_time,
      endTime: scope.timeRestrictions?.endTime || scope.time_restrictions?.end_time,
      timezone: scope.timeRestrictions?.timezone || scope.time_restrictions?.timezone || 'UTC',
    } : undefined,
    usageRestrictions: scope.usageRestrictions || scope.usage_restrictions ? {
      maxImpressions: scope.usageRestrictions?.maxImpressions || scope.usage_restrictions?.max_impressions,
      maxViews: scope.usageRestrictions?.maxViews || scope.usage_restrictions?.max_views,
      maxDownloads: scope.usageRestrictions?.maxDownloads || scope.usage_restrictions?.max_downloads,
    } : undefined,
    derivativeRights: scope.derivativeRights || scope.derivative_rights ? {
      permitted: scope.derivativeRights?.permitted || scope.derivative_rights?.permitted || false,
      originalCreatorShareBps: scope.derivativeRights?.originalCreatorShareBps || 
        scope.derivative_rights?.original_creator_share_bps,
    } : undefined,
  };
}

/**
 * Validate reported usage against license scope
 */
export function validateScopeCompliance(
  scope: LicenseScope,
  reportedUsage: ReportedUsage
): ScopeValidationResult {
  const violations: ScopeViolation[] = [];
  const warnings: ScopeWarning[] = [];

  // Validate media types
  if (scope.mediaTypes && reportedUsage.mediaTypes) {
    const allowedMedia = new Set(scope.mediaTypes.map(m => m.toLowerCase()));
    const unauthorizedMedia = reportedUsage.mediaTypes.filter(
      m => !allowedMedia.has(m.toLowerCase())
    );
    
    if (unauthorizedMedia.length > 0) {
      violations.push({
        type: 'MEDIA_TYPE',
        severity: 'CRITICAL',
        message: `Usage reported in unauthorized media types: ${unauthorizedMedia.join(', ')}`,
        details: {
          authorized: scope.mediaTypes,
          reported: reportedUsage.mediaTypes,
          unauthorized: unauthorizedMedia,
        },
      });
    }
  }

  // Validate geographies
  if (scope.geographies && reportedUsage.geographies) {
    const allowedGeo = new Set(scope.geographies.map(g => g.toLowerCase()));
    const unauthorizedGeo = reportedUsage.geographies.filter(
      g => !allowedGeo.has(g.toLowerCase())
    );
    
    if (unauthorizedGeo.length > 0) {
      violations.push({
        type: 'GEOGRAPHY',
        severity: 'CRITICAL',
        message: `Usage reported in unauthorized geographies: ${unauthorizedGeo.join(', ')}`,
        details: {
          authorized: scope.geographies,
          reported: reportedUsage.geographies,
          unauthorized: unauthorizedGeo,
        },
      });
    }
  }

  // Validate channels
  if (scope.channels && reportedUsage.channels) {
    const allowedChannels = new Set(scope.channels.map(c => c.toLowerCase()));
    const unauthorizedChannels = reportedUsage.channels.filter(
      c => !allowedChannels.has(c.toLowerCase())
    );
    
    if (unauthorizedChannels.length > 0) {
      violations.push({
        type: 'CHANNEL',
        severity: 'CRITICAL',
        message: `Usage reported in unauthorized channels: ${unauthorizedChannels.join(', ')}`,
        details: {
          authorized: scope.channels,
          reported: reportedUsage.channels,
          unauthorized: unauthorizedChannels,
        },
      });
    }
  }

  // Validate usage restrictions - impressions
  if (scope.usageRestrictions?.maxImpressions && reportedUsage.impressions) {
    const maxImpressions = scope.usageRestrictions.maxImpressions;
    const actualImpressions = reportedUsage.impressions;
    
    if (actualImpressions > maxImpressions) {
      violations.push({
        type: 'USAGE_LIMIT',
        severity: 'HIGH',
        message: `Impression limit exceeded: ${actualImpressions.toLocaleString()} / ${maxImpressions.toLocaleString()}`,
        details: {
          limit: maxImpressions,
          actual: actualImpressions,
          overage: actualImpressions - maxImpressions,
        },
      });
    } else if (actualImpressions > maxImpressions * 0.9) {
      warnings.push({
        type: 'APPROACHING_LIMIT',
        message: `Approaching impression limit: ${actualImpressions.toLocaleString()} / ${maxImpressions.toLocaleString()} (${Math.round((actualImpressions / maxImpressions) * 100)}%)`,
        details: {
          limit: maxImpressions,
          actual: actualImpressions,
          remaining: maxImpressions - actualImpressions,
        },
      });
    }
  }

  // Validate usage restrictions - views
  if (scope.usageRestrictions?.maxViews && reportedUsage.views) {
    const maxViews = scope.usageRestrictions.maxViews;
    const actualViews = reportedUsage.views;
    
    if (actualViews > maxViews) {
      violations.push({
        type: 'USAGE_LIMIT',
        severity: 'HIGH',
        message: `View limit exceeded: ${actualViews.toLocaleString()} / ${maxViews.toLocaleString()}`,
        details: {
          limit: maxViews,
          actual: actualViews,
          overage: actualViews - maxViews,
        },
      });
    } else if (actualViews > maxViews * 0.9) {
      warnings.push({
        type: 'APPROACHING_LIMIT',
        message: `Approaching view limit: ${actualViews.toLocaleString()} / ${maxViews.toLocaleString()} (${Math.round((actualViews / maxViews) * 100)}%)`,
        details: {
          limit: maxViews,
          actual: actualViews,
          remaining: maxViews - actualViews,
        },
      });
    }
  }

  // Validate cutdowns
  if (scope.cutdowns && !scope.cutdowns.permitted && reportedUsage.cutdownVersions) {
    if (reportedUsage.cutdownVersions > 0) {
      violations.push({
        type: 'CUTDOWN',
        severity: 'HIGH',
        message: `Cutdown versions created without permission: ${reportedUsage.cutdownVersions} versions reported`,
        details: {
          permitted: false,
          versionsCreated: reportedUsage.cutdownVersions,
        },
      });
    }
  } else if (scope.cutdowns?.permitted && scope.cutdowns.maxVersions && reportedUsage.cutdownVersions) {
    if (reportedUsage.cutdownVersions > scope.cutdowns.maxVersions) {
      violations.push({
        type: 'CUTDOWN',
        severity: 'MEDIUM',
        message: `Maximum cutdown versions exceeded: ${reportedUsage.cutdownVersions} / ${scope.cutdowns.maxVersions}`,
        details: {
          maxVersions: scope.cutdowns.maxVersions,
          actualVersions: reportedUsage.cutdownVersions,
          overage: reportedUsage.cutdownVersions - scope.cutdowns.maxVersions,
        },
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Calculate exclusivity premium to be applied to royalty
 */
export function calculateExclusivityPremium(
  baseRoyaltyCents: number,
  scope: LicenseScope
): number {
  if (!scope.exclusivity?.exclusive || !scope.exclusivity.premium) {
    return 0;
  }

  // Calculate premium based on basis points
  const premiumBps = scope.exclusivity.premium;
  const premiumCents = Math.round((baseRoyaltyCents * premiumBps) / 10000);

  return premiumCents;
}

/**
 * Allocate revenue across multiple scope categories
 * Used when a license permits multiple media types or geographies with different rates
 */
export function allocateRevenueByScopeCategory(
  totalRevenueCents: number,
  allocations: Array<{
    category: string;
    percentage: number; // 0-100
    metadata?: any;
  }>
): ScopeRevenueAllocation {
  // Validate percentages sum to 100
  const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Allocation percentages must sum to 100, got ${totalPercentage}`);
  }

  // Calculate allocation amounts using largest remainder method
  const rawAllocations = allocations.map(a => ({
    category: a.category,
    rawAmount: (totalRevenueCents * a.percentage) / 100,
    percentage: a.percentage,
    metadata: a.metadata,
  }));

  // Round down and track remainders
  const roundedAllocations = rawAllocations.map(a => ({
    category: a.category,
    revenueCents: Math.floor(a.rawAmount),
    remainder: a.rawAmount - Math.floor(a.rawAmount),
    percentage: a.percentage,
    metadata: a.metadata,
  }));

  // Calculate remaining cents to distribute
  const allocatedTotal = roundedAllocations.reduce((sum, a) => sum + a.revenueCents, 0);
  const remainingCents = totalRevenueCents - allocatedTotal;

  // Distribute remaining cents using largest remainder method
  if (remainingCents > 0) {
    const sortedByRemainder = [...roundedAllocations].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remainingCents; i++) {
      sortedByRemainder[i].revenueCents += 1;
    }
  }

  return {
    totalRevenueCents,
    allocations: roundedAllocations.map(a => ({
      category: a.category,
      revenueCents: a.revenueCents,
      percentage: a.percentage,
      metadata: a.metadata,
    })),
  };
}

/**
 * Check if license scope has expired based on time restrictions
 */
export function isScopeExpired(scope: LicenseScope, currentDate: Date = new Date()): boolean {
  if (!scope.timeRestrictions?.endTime) {
    return false;
  }

  try {
    const endTime = new Date(scope.timeRestrictions.endTime);
    return currentDate > endTime;
  } catch {
    return false;
  }
}

/**
 * Check if license scope is active based on time restrictions
 */
export function isScopeActive(scope: LicenseScope, currentDate: Date = new Date()): boolean {
  if (!scope.timeRestrictions) {
    return true;
  }

  const { startTime, endTime } = scope.timeRestrictions;

  try {
    if (startTime) {
      const start = new Date(startTime);
      if (currentDate < start) {
        return false;
      }
    }

    if (endTime) {
      const end = new Date(endTime);
      if (currentDate > end) {
        return false;
      }
    }

    return true;
  } catch {
    // If dates are invalid, assume scope is active
    return true;
  }
}

/**
 * Get scope display summary for reporting
 */
export function getScopeDisplaySummary(scope: LicenseScope): string {
  const parts: string[] = [];

  if (scope.mediaTypes && scope.mediaTypes.length > 0) {
    parts.push(`Media: ${scope.mediaTypes.join(', ')}`);
  }

  if (scope.geographies && scope.geographies.length > 0) {
    parts.push(`Regions: ${scope.geographies.join(', ')}`);
  }

  if (scope.channels && scope.channels.length > 0) {
    parts.push(`Channels: ${scope.channels.join(', ')}`);
  }

  if (scope.exclusivity?.exclusive) {
    parts.push(`Exclusive${scope.exclusivity.scope ? ` (${scope.exclusivity.scope})` : ''}`);
  }

  if (scope.cutdowns?.permitted) {
    parts.push(`Cutdowns permitted${scope.cutdowns.maxVersions ? ` (max ${scope.cutdowns.maxVersions})` : ''}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Standard license';
}

/**
 * Merge multiple scope objects (for license extensions or amendments)
 */
export function mergeScopes(baseScope: LicenseScope, extensionScope: LicenseScope): LicenseScope {
  return {
    mediaTypes: extensionScope.mediaTypes || baseScope.mediaTypes,
    geographies: extensionScope.geographies || baseScope.geographies,
    channels: extensionScope.channels || baseScope.channels,
    exclusivity: extensionScope.exclusivity || baseScope.exclusivity,
    cutdowns: extensionScope.cutdowns || baseScope.cutdowns,
    timeRestrictions: extensionScope.timeRestrictions || baseScope.timeRestrictions,
    usageRestrictions: extensionScope.usageRestrictions || baseScope.usageRestrictions,
    derivativeRights: extensionScope.derivativeRights || baseScope.derivativeRights,
  };
}
