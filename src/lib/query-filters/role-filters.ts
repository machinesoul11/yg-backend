/**
 * Role-Based Query Filtering
 * 
 * Automatic query filtering based on user role.
 * Builds upon the existing RLS implementation to provide
 * composable, reusable filter functions.
 */

import type { Prisma } from '@prisma/client';
import type { QueryContext, QueryFilterOptions } from './types';
import {
  getIpAssetSecurityFilter,
  getProjectSecurityFilter,
  getLicenseSecurityFilter,
  getRoyaltyStatementSecurityFilter,
  getPayoutSecurityFilter,
  getBrandSecurityFilter,
  getCreatorSecurityFilter,
} from '@/lib/security/row-level-security';

/**
 * Get role-based filter for any entity type
 */
export function getRoleBasedFilter<T extends keyof FilterTypeMap>(
  context: QueryContext,
  entityType: T,
  options: QueryFilterOptions = {}
): FilterTypeMap[T] {
  const filters = FILTER_REGISTRY[entityType];
  if (!filters) {
    throw new Error(`No filter registered for entity type: ${entityType}`);
  }

  const baseFilter = filters(context);
  
  // Apply soft delete filter unless explicitly included
  let filter: any = baseFilter;
  if (!options.includeSoftDeleted) {
    filter = {
      ...filter,
      deletedAt: null,
    };
  }

  // Merge custom filters if provided
  if (options.customFilters) {
    filter = {
      AND: [
        filter,
        options.customFilters,
      ],
    };
  }

  return filter as FilterTypeMap[T];
}

/**
 * Filter registry mapping entity types to filter functions
 */
const FILTER_REGISTRY = {
  ipAsset: getIpAssetSecurityFilter,
  project: getProjectSecurityFilter,
  license: getLicenseSecurityFilter,
  royaltyStatement: getRoyaltyStatementSecurityFilter,
  payout: getPayoutSecurityFilter,
  brand: getBrandSecurityFilter,
  creator: getCreatorSecurityFilter,
} as const;

/**
 * Type map for entity filters
 */
type FilterTypeMap = {
  ipAsset: Prisma.IpAssetWhereInput;
  project: Prisma.ProjectWhereInput;
  license: Prisma.LicenseWhereInput;
  royaltyStatement: Prisma.RoyaltyStatementWhereInput;
  payout: Prisma.PayoutWhereInput;
  brand: Prisma.BrandWhereInput;
  creator: Prisma.CreatorWhereInput;
};

/**
 * Compose multiple filters with AND logic
 */
export function composeFilters<T extends Record<string, any>>(
  ...filters: (T | undefined)[]
): T {
  const validFilters = filters.filter(Boolean) as T[];
  
  if (validFilters.length === 0) {
    return {} as T;
  }
  
  if (validFilters.length === 1) {
    return validFilters[0];
  }
  
  return {
    AND: validFilters,
  } as unknown as T;
}

/**
 * Compose filters with OR logic
 */
export function composeFiltersOr<T extends Record<string, any>>(
  ...filters: (T | undefined)[]
): T {
  const validFilters = filters.filter(Boolean) as T[];
  
  if (validFilters.length === 0) {
    return {} as T;
  }
  
  if (validFilters.length === 1) {
    return validFilters[0];
  }
  
  return {
    OR: validFilters,
  } as unknown as T;
}

/**
 * Check if user has admin role
 */
export function isAdmin(context: QueryContext): boolean {
  return context.role === 'ADMIN';
}

/**
 * Check if user has creator role
 */
export function isCreator(context: QueryContext): boolean {
  return context.role === 'CREATOR';
}

/**
 * Check if user has brand role
 */
export function isBrand(context: QueryContext): boolean {
  return context.role === 'BRAND';
}

/**
 * Get filter for user's own resources
 * Useful for resources that have a direct userId relationship
 */
export function getOwnerFilter(
  context: QueryContext,
  field: string = 'userId'
): Record<string, string> {
  return {
    [field]: context.userId,
  };
}

/**
 * Get filter that allows admin or owner access
 */
export function getAdminOrOwnerFilter<T extends Record<string, any>>(
  context: QueryContext,
  ownerFilter: T
): T | Record<string, never> {
  if (isAdmin(context)) {
    return {} as Record<string, never>;
  }
  return ownerFilter;
}
