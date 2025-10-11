/**
 * Ownership-Based Filtering
 * 
 * Advanced filtering based on ownership relationships
 * and asset contribution types.
 */

import type { Prisma } from '@prisma/client';
import type { QueryContext, OwnershipFilterConfig, OwnershipType } from './types';

/**
 * Get IP asset ownership filter
 * Filters assets based on ownership type and share percentage
 */
export function getIpAssetOwnershipFilter(
  context: QueryContext,
  config: OwnershipFilterConfig = {}
): Prisma.IpAssetWhereInput {
  // Admin can see all assets
  if (context.role === 'ADMIN') {
    return {};
  }

  // Creator must have creatorId
  if (!context.creatorId) {
    return { id: 'impossible-id-no-access' };
  }

  const ownershipFilter: Prisma.IpOwnershipWhereInput = {
    creatorId: context.creatorId,
  };

  // Filter by ownership types if specified
  if (config.ownershipTypes && config.ownershipTypes.length > 0) {
    ownershipFilter.ownershipType = {
      in: config.ownershipTypes,
    };
  }

  // Filter by minimum share if specified
  if (config.minShareBps !== undefined) {
    ownershipFilter.shareBps = {
      gte: config.minShareBps,
    };
  }

  // Filter by active ownership unless expired ones are included
  if (!config.includeExpired) {
    ownershipFilter.OR = [
      { endDate: null },
      { endDate: { gte: new Date() } },
    ];
  }

  return {
    ownerships: {
      some: ownershipFilter,
    },
  };
}

/**
 * Get filter for primary-owned assets only
 */
export function getPrimaryOwnershipFilter(
  context: QueryContext
): Prisma.IpAssetWhereInput {
  return getIpAssetOwnershipFilter(context, {
    ownershipTypes: ['PRIMARY' as OwnershipType],
  });
}

/**
 * Get filter for contributed assets (contributor or derivative)
 */
export function getContributorOwnershipFilter(
  context: QueryContext
): Prisma.IpAssetWhereInput {
  return getIpAssetOwnershipFilter(context, {
    ownershipTypes: ['CONTRIBUTOR' as OwnershipType, 'DERIVATIVE' as OwnershipType],
  });
}

/**
 * Get filter for assets with significant ownership (>= 50%)
 */
export function getSignificantOwnershipFilter(
  context: QueryContext
): Prisma.IpAssetWhereInput {
  return getIpAssetOwnershipFilter(context, {
    minShareBps: 5000, // 50%
  });
}

/**
 * Check if user owns an asset (any ownership type)
 */
export async function userOwnsAsset(
  prisma: any,
  context: QueryContext,
  assetId: string
): Promise<boolean> {
  if (context.role === 'ADMIN') {
    return true;
  }

  if (!context.creatorId) {
    return false;
  }

  const ownership = await prisma.ipOwnership.findFirst({
    where: {
      ipAssetId: assetId,
      creatorId: context.creatorId,
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ],
    },
  });

  return ownership !== null;
}

/**
 * Get ownership details for an asset
 */
export async function getAssetOwnership(
  prisma: any,
  context: QueryContext,
  assetId: string
): Promise<{
  isPrimaryOwner: boolean;
  isContributor: boolean;
  shareBps: number;
  ownershipType: string | null;
} | null> {
  if (!context.creatorId) {
    return null;
  }

  const ownership = await prisma.ipOwnership.findFirst({
    where: {
      ipAssetId: assetId,
      creatorId: context.creatorId,
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ],
    },
    orderBy: {
      shareBps: 'desc',
    },
  });

  if (!ownership) {
    return null;
  }

  return {
    isPrimaryOwner: ownership.ownershipType === 'PRIMARY',
    isContributor: ['CONTRIBUTOR', 'DERIVATIVE'].includes(ownership.ownershipType),
    shareBps: ownership.shareBps,
    ownershipType: ownership.ownershipType,
  };
}

/**
 * Get filter for projects with licensed assets
 * Returns projects where the user's assets are licensed
 */
export function getProjectsWithLicensedAssetsFilter(
  context: QueryContext
): Prisma.ProjectWhereInput {
  if (context.role === 'ADMIN') {
    return {};
  }

  if (!context.creatorId) {
    return { id: 'impossible-id-no-access' };
  }

  return {
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
  };
}

/**
 * Get filter for licenses by ownership stake
 * Useful for filtering licenses where creator has significant stake
 */
export function getLicensesByOwnershipFilter(
  context: QueryContext,
  minShareBps?: number
): Prisma.LicenseWhereInput {
  if (context.role === 'ADMIN') {
    return {};
  }

  if (!context.creatorId) {
    return { id: 'impossible-id-no-access' };
  }

  const ownershipFilter: Prisma.IpOwnershipWhereInput = {
    creatorId: context.creatorId,
    OR: [
      { endDate: null },
      { endDate: { gte: new Date() } },
    ],
  };

  if (minShareBps !== undefined) {
    ownershipFilter.shareBps = { gte: minShareBps };
  }

  return {
    ipAsset: {
      ownerships: {
        some: ownershipFilter,
      },
    },
  };
}

/**
 * Verify ownership before mutation operations
 * Throws error if user doesn't have ownership
 */
export async function verifyOwnership(
  prisma: any,
  context: QueryContext,
  assetId: string,
  requiredOwnershipType?: OwnershipType
): Promise<void> {
  if (context.role === 'ADMIN') {
    return; // Admins bypass ownership checks
  }

  if (!context.creatorId) {
    throw new Error('Creator ID required for ownership verification');
  }

  const whereClause: any = {
    ipAssetId: assetId,
    creatorId: context.creatorId,
    OR: [
      { endDate: null },
      { endDate: { gte: new Date() } },
    ],
  };

  if (requiredOwnershipType) {
    whereClause.ownershipType = requiredOwnershipType;
  }

  const ownership = await prisma.ipOwnership.findFirst({
    where: whereClause,
  });

  if (!ownership) {
    throw new Error(
      requiredOwnershipType
        ? `User does not have ${requiredOwnershipType} ownership of this asset`
        : 'User does not have ownership of this asset'
    );
  }
}

/**
 * Get collaborative assets filter
 * Returns assets with multiple owners
 */
export function getCollaborativeAssetsFilter(
  context: QueryContext
): Prisma.IpAssetWhereInput {
  if (context.role === 'ADMIN') {
    return {
      ownerships: {
        // Assets with more than one ownership record
        some: {},
      },
    };
  }

  if (!context.creatorId) {
    return { id: 'impossible-id-no-access' };
  }

  return {
    AND: [
      // User must have ownership
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
      // And there must be other owners
      {
        ownerships: {
          some: {
            creatorId: { not: context.creatorId },
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
