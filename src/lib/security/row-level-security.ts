/**
 * Row-Level Security (RLS) Utilities
 * 
 * Provides centralized security filtering logic for data access control.
 * Implements role-based data isolation ensuring:
 * - Creators can only view their own assets and royalty statements
 * - Brands can only view their own projects and licenses
 * - Admins have full access to all data
 * - Shared resource access rules for collaborations
 */

import type { Prisma, UserRole } from '@prisma/client';

/**
 * User context for security filtering
 */
export interface SecurityContext {
  userId: string;
  role: UserRole;
  creatorId?: string;
  brandId?: string;
}

/**
 * Get security filter for IP Assets
 * 
 * @param context - User security context
 * @returns Prisma where clause for IP assets
 */
export function getIpAssetSecurityFilter(
  context: SecurityContext
): Prisma.IpAssetWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Creators can view:
  // 1. Assets they created
  // 2. Assets they own (via IpOwnership)
  // 3. Assets in projects they collaborate on (future enhancement)
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      OR: [
        // Assets created by this user
        { createdBy: context.userId },
        // Assets owned by this creator
        {
          ownerships: {
            some: {
              creatorId: context.creatorId,
              OR: [
                { endDate: null },
                { endDate: { gte: new Date() } },
              ],
            },
          },
        },
      ],
    };
  }

  // Brands can view:
  // 1. Assets in their projects
  // 2. Assets they've licensed
  if (context.role === 'BRAND' && context.brandId) {
    return {
      OR: [
        // Assets in brand's projects
        {
          project: {
            brandId: context.brandId,
          },
        },
        // Assets the brand has licensed
        {
          licenses: {
            some: {
              brandId: context.brandId,
            },
          },
        },
      ],
    };
  }

  // Viewers and other roles have no access
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Get security filter for Projects
 * 
 * @param context - User security context
 * @returns Prisma where clause for projects
 */
export function getProjectSecurityFilter(
  context: SecurityContext
): Prisma.ProjectWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Brands can only view their own projects
  if (context.role === 'BRAND' && context.brandId) {
    return {
      brandId: context.brandId,
    };
  }

  // Creators can view:
  // 1. Projects they've been assigned to
  // 2. Projects containing assets they own (via licenses)
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      OR: [
        // Projects with assets owned by this creator
        {
          ipAssets: {
            some: {
              ownerships: {
                some: {
                  creatorId: context.creatorId,
                  OR: [
                    { endDate: null },
                    { endDate: { gte: new Date() } },
                  ],
                },
              },
            },
          },
        },
        // Projects with licenses to creator's assets
        {
          licenses: {
            some: {
              ipAsset: {
                ownerships: {
                  some: {
                    creatorId: context.creatorId,
                    OR: [
                      { endDate: null },
                      { endDate: { gte: new Date() } },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  // No access for other roles
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Get security filter for Licenses
 * 
 * @param context - User security context
 * @returns Prisma where clause for licenses
 */
export function getLicenseSecurityFilter(
  context: SecurityContext
): Prisma.LicenseWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Brands can view their own licenses
  if (context.role === 'BRAND' && context.brandId) {
    return {
      brandId: context.brandId,
    };
  }

  // Creators can view licenses for their assets
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      ipAsset: {
        ownerships: {
          some: {
            creatorId: context.creatorId,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } },
            ],
          },
        },
      },
    };
  }

  // No access for other roles
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Get security filter for Royalty Statements
 * 
 * @param context - User security context
 * @returns Prisma where clause for royalty statements
 */
export function getRoyaltyStatementSecurityFilter(
  context: SecurityContext
): Prisma.RoyaltyStatementWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Only creators can view their own royalty statements
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      creatorId: context.creatorId,
    };
  }

  // Brands and other roles have no access to royalty statements
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Get security filter for Payouts
 * 
 * @param context - User security context
 * @returns Prisma where clause for payouts
 */
export function getPayoutSecurityFilter(
  context: SecurityContext
): Prisma.PayoutWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Only creators can view their own payouts
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      creatorId: context.creatorId,
    };
  }

  // Brands and other roles have no access to payouts
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Get security filter for Brands
 * 
 * @param context - User security context
 * @returns Prisma where clause for brands
 */
export function getBrandSecurityFilter(
  context: SecurityContext
): Prisma.BrandWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Brands can only view their own profile
  if (context.role === 'BRAND' && context.brandId) {
    return {
      id: context.brandId,
    };
  }

  // Creators can view verified brands (for browsing purposes)
  if (context.role === 'CREATOR') {
    return {
      verificationStatus: 'verified',
      deletedAt: null,
    };
  }

  // Other roles can view verified brands
  return {
    verificationStatus: 'verified',
    deletedAt: null,
  };
}

/**
 * Get security filter for Creators
 * 
 * @param context - User security context
 * @returns Prisma where clause for creators
 */
export function getCreatorSecurityFilter(
  context: SecurityContext
): Prisma.CreatorWhereInput {
  // Admins have full access
  if (context.role === 'ADMIN') {
    return {};
  }

  // Creators can only view their own profile
  if (context.role === 'CREATOR' && context.creatorId) {
    return {
      id: context.creatorId,
    };
  }

  // Brands can view approved creators (for discovery)
  if (context.role === 'BRAND') {
    return {
      verificationStatus: 'approved',
      deletedAt: null,
    };
  }

  // Other roles can view approved creators
  return {
    verificationStatus: 'approved',
    deletedAt: null,
  };
}

/**
 * Get security filter for Royalty Runs (admin-only)
 * 
 * @param context - User security context
 * @returns Prisma where clause for royalty runs
 */
export function getRoyaltyRunSecurityFilter(
  context: SecurityContext
): Prisma.RoyaltyRunWhereInput {
  // Only admins can view royalty runs
  if (context.role === 'ADMIN') {
    return {};
  }

  // No access for non-admins
  return {
    id: 'impossible-id-no-access',
  };
}

/**
 * Check if user can access a specific resource
 * 
 * @param context - User security context
 * @param resourceType - Type of resource
 * @param resourceOwnerId - ID of the resource owner
 * @returns Whether user has access
 */
export function canAccessResource(
  context: SecurityContext,
  resourceType: 'creator' | 'brand',
  resourceOwnerId: string
): boolean {
  // Admins can access anything
  if (context.role === 'ADMIN') {
    return true;
  }

  // Check ownership based on resource type
  if (resourceType === 'creator' && context.creatorId) {
    return context.creatorId === resourceOwnerId;
  }

  if (resourceType === 'brand' && context.brandId) {
    return context.brandId === resourceOwnerId;
  }

  return false;
}

/**
 * Apply security filter to existing where clause
 * 
 * @param context - User security context
 * @param filterType - Type of filter to apply
 * @param existingWhere - Existing where clause
 * @returns Combined where clause with security filter
 */
export function applySecurityFilter<T extends Record<string, any>>(
  context: SecurityContext,
  filterType: 'ipAsset' | 'project' | 'license' | 'royaltyStatement' | 'payout' | 'brand' | 'creator' | 'royaltyRun',
  existingWhere?: T
): T {
  let securityFilter: any;

  switch (filterType) {
    case 'ipAsset':
      securityFilter = getIpAssetSecurityFilter(context);
      break;
    case 'project':
      securityFilter = getProjectSecurityFilter(context);
      break;
    case 'license':
      securityFilter = getLicenseSecurityFilter(context);
      break;
    case 'royaltyStatement':
      securityFilter = getRoyaltyStatementSecurityFilter(context);
      break;
    case 'payout':
      securityFilter = getPayoutSecurityFilter(context);
      break;
    case 'brand':
      securityFilter = getBrandSecurityFilter(context);
      break;
    case 'creator':
      securityFilter = getCreatorSecurityFilter(context);
      break;
    case 'royaltyRun':
      securityFilter = getRoyaltyRunSecurityFilter(context);
      break;
    default:
      securityFilter = {};
  }

  // Combine security filter with existing where clause
  if (!existingWhere || Object.keys(existingWhere).length === 0) {
    return securityFilter as T;
  }

  return {
    AND: [securityFilter, existingWhere],
  } as unknown as T;
}
