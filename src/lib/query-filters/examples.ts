/**
 * Query Filtering System - Integration Examples
 * 
 * Demonstrates how to use the query filtering system in your application.
 * These examples can be adapted for use in tRPC routers, services, and API handlers.
 */

import { prisma } from '@/lib/db';
import type { QueryContext } from '@/lib/query-filters';
import {
  createTenantScopedQuery,
  getRoleBasedFilter,
  composeFilters,
  getIpAssetOwnershipFilter,
  getAllowedSelectFields,
  filterSelectFields,
  redactSensitiveFieldsArray,
  createSecureAggregation,
  calculateCreatorEarnings,
  calculateBrandSpend,
} from '@/lib/query-filters';

/**
 * Example 1: Basic role-based filtering in a list query
 */
export async function listAssetsExample(userId: string, role: string, creatorId?: string) {
  const context: QueryContext = {
    userId,
    role: role as any,
    creatorId,
  };

  // Get security filter based on user's role
  const securityFilter = getRoleBasedFilter(context, 'ipAsset');

  // Add your business logic filters
  const businessFilter = {
    status: 'PUBLISHED',
    deletedAt: null,
  };

  // Compose filters together
  const where = composeFilters(securityFilter, businessFilter);

  // Execute query
  const assets = await prisma.ipAsset.findMany({
    where,
    include: {
      ownerships: {
        where: {
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
        include: {
          creator: {
            select: {
              id: true,
              stageName: true,
            },
          },
        },
      },
    },
  });

  return assets;
}

/**
 * Example 2: Using tenant-scoped queries
 */
export async function listProjectsWithScoping(userId: string, role: string, brandId?: string) {
  const context: QueryContext = {
    userId,
    role: role as any,
    brandId,
  };

  const scopedQuery = createTenantScopedQuery(prisma, context);

  // Automatic security filtering + business logic
  const projects = await scopedQuery.findManyWithScope('project', {
    where: {
      status: 'ACTIVE',
    },
    include: {
      brand: {
        select: {
          id: true,
          companyName: true,
          logo: true,
        },
      },
      licenses: true,
    },
  });

  return projects;
}

/**
 * Example 3: Paginated queries with security
 */
export async function listCreatorsWithPagination(
  page: number,
  pageSize: number,
  userId: string,
  role: string
) {
  const context: QueryContext = {
    userId,
    role: role as any,
  };

  const scopedQuery = createTenantScopedQuery(prisma, context);

  const result = await scopedQuery.findManyPaginated(
    'creator',
    {
      page,
      pageSize,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    {
      where: {
        verificationStatus: 'approved',
      },
      select: {
        id: true,
        stageName: true,
        bio: true,
        portfolioUrl: true,
        specialties: true,
      },
    }
  );

  return result;
}

/**
 * Example 4: Ownership-based filtering
 */
export async function listOwnedAssetsWithOwnership(
  userId: string,
  creatorId: string,
  ownershipType?: 'PRIMARY' | 'CONTRIBUTOR'
) {
  const context: QueryContext = {
    userId,
    role: 'CREATOR',
    creatorId,
  };

  const ownershipFilter = getIpAssetOwnershipFilter(context, {
    ownershipTypes: ownershipType ? [ownershipType as any] : undefined,
  });

  const assets = await prisma.ipAsset.findMany({
    where: ownershipFilter,
    include: {
      ownerships: {
        where: {
          creatorId,
        },
        select: {
          ownershipType: true,
          shareBps: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  return assets;
}

/**
 * Example 5: Permission-based field filtering
 */
export async function getCreatorProfileWithFieldFiltering(
  profileCreatorId: string,
  viewerUserId: string,
  viewerRole: string,
  viewerCreatorId?: string
) {
  const context: QueryContext = {
    userId: viewerUserId,
    role: viewerRole as any,
    creatorId: viewerCreatorId,
  };

  // Fetch the full creator profile
  const creator = await prisma.creator.findUnique({
    where: { id: profileCreatorId },
  });

  if (!creator) {
    return null;
  }

  // Get allowed fields based on viewer's permissions
  const isOwner = creator.userId === viewerUserId;
  const allowedSelect = getAllowedSelectFields(
    context,
    'creator',
    isOwner ? creator.userId : undefined
  );

  // Fetch again with only allowed fields
  const filteredCreator = await prisma.creator.findUnique({
    where: { id: profileCreatorId },
    select: allowedSelect,
  });

  return filteredCreator;
}

/**
 * Example 6: Secure aggregations - Creator earnings
 */
export async function getMyEarnings(userId: string, creatorId: string) {
  const context: QueryContext = {
    userId,
    role: 'CREATOR',
    creatorId,
  };

  const earnings = await calculateCreatorEarnings(
    prisma,
    context,
    new Date('2025-01-01'), // Period start
    new Date('2025-12-31')  // Period end
  );

  return earnings;
}

/**
 * Example 7: Secure aggregations - Brand spend
 */
export async function getBrandSpendSummary(userId: string, brandId: string) {
  const context: QueryContext = {
    userId,
    role: 'BRAND',
    brandId,
  };

  const spend = await calculateBrandSpend(prisma, context);

  return spend;
}

/**
 * Example 8: Custom aggregations with security
 */
export async function getAssetStatistics(userId: string, role: string, creatorId?: string) {
  const context: QueryContext = {
    userId,
    role: role as any,
    creatorId,
  };

  const aggregator = createSecureAggregation(prisma, context);

  const [totalAssets, publishedAssets, avgLicenses] = await Promise.all([
    aggregator.secureCount('ipAsset', {
      deletedAt: null,
    }),
    aggregator.secureCount('ipAsset', {
      status: 'PUBLISHED',
      deletedAt: null,
    }),
    aggregator.secureAverage('ipAsset', 'id', {}, {
      nullOnSmallDataset: true,
      minDatasetSize: 5,
    }),
  ]);

  return {
    totalAssets,
    publishedAssets,
    avgLicenses,
  };
}

/**
 * Example 9: Combining multiple security layers
 */
export async function complexQueryExample(userId: string, role: string, creatorId?: string) {
  const context: QueryContext = {
    userId,
    role: role as any,
    creatorId,
  };

  const scopedQuery = createTenantScopedQuery(prisma, context);

  // 1. Get assets with automatic tenant scoping
  const assets = await scopedQuery.findManyWithScope('ipAsset', {
    where: {
      status: 'PUBLISHED',
    },
  });

  // 2. Apply field-level permissions
  const sanitizedAssets = assets.map(asset => {
    const allowedFields = getAllowedSelectFields(
      context,
      'ipAsset',
      asset.createdBy
    );

    // Manually filter fields (in practice, use select in the query)
    const filtered: any = {};
    for (const key of Object.keys(asset)) {
      if (allowedFields[key]) {
        filtered[key] = (asset as any)[key];
      }
    }
    return filtered;
  });

  return sanitizedAssets;
}

/**
 * Example 10: tRPC integration example
 */
export const exampleTRPCRouter = {
  // In a real tRPC router:
  listMyAssets: async (ctx: any) => {
    if (!ctx.securityContext) {
      throw new Error('Unauthorized');
    }

    const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext);

    return scopedQuery.findManyPaginated(
      'ipAsset',
      {
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }
    );
  },

  getMyEarnings: async (ctx: any) => {
    if (!ctx.securityContext) {
      throw new Error('Unauthorized');
    }

    return calculateCreatorEarnings(prisma, ctx.securityContext);
  },

  listProjects: async (ctx: any, filters: any) => {
    if (!ctx.securityContext) {
      throw new Error('Unauthorized');
    }

    const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext);

    return scopedQuery.findManyWithScope('project', {
      where: filters,
    });
  },
};
