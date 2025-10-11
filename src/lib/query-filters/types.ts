/**
 * Query Filter Types and Interfaces
 */

import type { Prisma, UserRole } from '@prisma/client';
import type { SecurityContext } from '@/lib/security/row-level-security';

/**
 * Extended query context with additional filtering capabilities
 */
export interface QueryContext extends SecurityContext {
  userId: string;
  role: UserRole;
  creatorId?: string;
  brandId?: string;
}

/**
 * Query filter options
 */
export interface QueryFilterOptions {
  /** Include soft-deleted records */
  includeSoftDeleted?: boolean;
  /** Additional custom filters */
  customFilters?: Record<string, any>;
  /** Bypass tenant scoping (admin only) */
  bypassTenantScope?: boolean;
}

/**
 * Ownership types for IP assets
 */
export enum OwnershipType {
  PRIMARY = 'PRIMARY',
  CONTRIBUTOR = 'CONTRIBUTOR',
  DERIVATIVE = 'DERIVATIVE',
}

/**
 * Ownership filter configuration
 */
export interface OwnershipFilterConfig {
  /** Filter by specific ownership types */
  ownershipTypes?: OwnershipType[];
  /** Include expired ownerships */
  includeExpired?: boolean;
  /** Minimum ownership share (in basis points) */
  minShareBps?: number;
}

/**
 * Permission level for field visibility
 */
export enum PermissionLevel {
  /** Public fields visible to all */
  PUBLIC = 'PUBLIC',
  /** Fields visible to authenticated users */
  AUTHENTICATED = 'AUTHENTICATED',
  /** Fields visible to the owner */
  OWNER = 'OWNER',
  /** Fields visible to collaborators */
  COLLABORATOR = 'COLLABORATOR',
  /** Fields visible to admins only */
  ADMIN = 'ADMIN',
}

/**
 * Field permission mapping
 */
export type FieldPermissions<T> = {
  [K in keyof T]?: PermissionLevel;
};

/**
 * Aggregation security options
 */
export interface AggregationSecurityOptions {
  /** Minimum dataset size before returning results */
  minDatasetSize?: number;
  /** Whether to return null for small datasets */
  nullOnSmallDataset?: boolean;
  /** Additional filters to apply */
  additionalFilters?: Record<string, any>;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
