/**
 * Secure Data Aggregation Queries
 * 
 * Provides safe aggregation methods that prevent information leakage
 * through aggregate statistics while respecting role-based access control.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type { QueryContext, AggregationSecurityOptions } from './types';
import { getRoleBasedFilter } from './role-filters';
import { composeFilters } from './role-filters';

/**
 * Default minimum dataset size to prevent inference attacks
 */
const DEFAULT_MIN_DATASET_SIZE = 5;

/**
 * Secure aggregation base class
 */
export class SecureAggregation {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly context: QueryContext
  ) {}

  /**
   * Count records with security filtering
   */
  async secureCount<T extends keyof EntityAggregationMap>(
    entityType: T,
    where?: WhereInputMap[T],
    options: AggregationSecurityOptions = {}
  ): Promise<number> {
    const securityFilter = getRoleBasedFilter(this.context, entityType);
    const composedWhere = composeFilters(
      securityFilter,
      where,
      options.additionalFilters
    );

    const model = this.getModel(entityType);
    return model.count({ where: composedWhere } as any);
  }

  /**
   * Sum numeric field with security filtering
   */
  async secureSum<T extends keyof EntityAggregationMap>(
    entityType: T,
    field: string,
    where?: WhereInputMap[T],
    options: AggregationSecurityOptions = {}
  ): Promise<number | null> {
    const securityFilter = getRoleBasedFilter(this.context, entityType);
    const composedWhere = composeFilters(
      securityFilter,
      where,
      options.additionalFilters
    );

    // Check dataset size if required
    if (options.nullOnSmallDataset) {
      const count = await this.secureCount(entityType, composedWhere as any);
      const minSize = options.minDatasetSize || DEFAULT_MIN_DATASET_SIZE;
      
      if (count < minSize) {
        return null;
      }
    }

    const model = this.getModel(entityType);
    const result = await model.aggregate({
      where: composedWhere,
      _sum: { [field]: true },
    } as any);

    return result._sum[field] || 0;
  }

  /**
   * Average numeric field with security filtering
   */
  async secureAverage<T extends keyof EntityAggregationMap>(
    entityType: T,
    field: string,
    where?: WhereInputMap[T],
    options: AggregationSecurityOptions = {}
  ): Promise<number | null> {
    const securityFilter = getRoleBasedFilter(this.context, entityType);
    const composedWhere = composeFilters(
      securityFilter,
      where,
      options.additionalFilters
    );

    // Check dataset size
    const count = await this.secureCount(entityType, composedWhere as any);
    const minSize = options.minDatasetSize || DEFAULT_MIN_DATASET_SIZE;
    
    if (count < minSize) {
      return options.nullOnSmallDataset ? null : 0;
    }

    const model = this.getModel(entityType);
    const result = await model.aggregate({
      where: composedWhere,
      _avg: { [field]: true },
    } as any);

    return result._avg[field] || 0;
  }

  /**
   * Get min/max values with security filtering
   */
  async secureMinMax<T extends keyof EntityAggregationMap>(
    entityType: T,
    field: string,
    where?: WhereInputMap[T],
    options: AggregationSecurityOptions = {}
  ): Promise<{ min: number | null; max: number | null }> {
    const securityFilter = getRoleBasedFilter(this.context, entityType);
    const composedWhere = composeFilters(
      securityFilter,
      where,
      options.additionalFilters
    );

    // Check dataset size
    const count = await this.secureCount(entityType, composedWhere as any);
    const minSize = options.minDatasetSize || DEFAULT_MIN_DATASET_SIZE;
    
    if (count < minSize && options.nullOnSmallDataset) {
      return { min: null, max: null };
    }

    const model = this.getModel(entityType);
    const result = await model.aggregate({
      where: composedWhere,
      _min: { [field]: true },
      _max: { [field]: true },
    } as any);

    return {
      min: result._min[field] || null,
      max: result._max[field] || null,
    };
  }

  /**
   * Group by aggregation with security filtering
   */
  async secureGroupBy<T extends keyof EntityAggregationMap>(
    entityType: T,
    groupBy: string[],
    aggregations: {
      _count?: boolean;
      _sum?: string[];
      _avg?: string[];
    },
    where?: WhereInputMap[T],
    options: AggregationSecurityOptions = {}
  ): Promise<any[]> {
    const securityFilter = getRoleBasedFilter(this.context, entityType);
    const composedWhere = composeFilters(
      securityFilter,
      where,
      options.additionalFilters
    );

    const model = this.getModel(entityType);
    
    const groupByArgs: any = {
      by: groupBy,
      where: composedWhere,
    };

    if (aggregations._count) {
      groupByArgs._count = true;
    }
    if (aggregations._sum) {
      groupByArgs._sum = {};
      aggregations._sum.forEach(field => {
        groupByArgs._sum[field] = true;
      });
    }
    if (aggregations._avg) {
      groupByArgs._avg = {};
      aggregations._avg.forEach(field => {
        groupByArgs._avg[field] = true;
      });
    }

    const results = await model.groupBy(groupByArgs);

    // Filter out groups with small counts if required
    if (options.nullOnSmallDataset) {
      const minSize = options.minDatasetSize || DEFAULT_MIN_DATASET_SIZE;
      return results.filter((group: any) => {
        const count = group._count?._all || group._count || 0;
        return count >= minSize;
      });
    }

    return results;
  }

  /**
   * Get Prisma model for entity type
   */
  private getModel<T extends keyof EntityAggregationMap>(entityType: T): any {
    const modelMap: Record<string, any> = {
      ipAsset: this.prisma.ipAsset,
      project: this.prisma.project,
      license: this.prisma.license,
      royaltyStatement: this.prisma.royaltyStatement,
      payout: this.prisma.payout,
      brand: this.prisma.brand,
      creator: this.prisma.creator,
    };

    const model = modelMap[entityType];
    if (!model) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }
    return model;
  }
}

/**
 * Domain-specific aggregation helpers
 * These encode business logic about what aggregations make sense
 */

/**
 * Calculate creator's total earnings
 */
export async function calculateCreatorEarnings(
  prisma: PrismaClient,
  context: QueryContext,
  periodStart?: Date,
  periodEnd?: Date
): Promise<{
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  statementCount: number;
} | null> {
  if (context.role !== 'ADMIN' && context.role !== 'CREATOR') {
    throw new Error('Unauthorized: Only admins and creators can view earnings');
  }

  if (context.role === 'CREATOR' && !context.creatorId) {
    throw new Error('Creator ID required');
  }

  const aggregator = new SecureAggregation(prisma, context);

  const where: any = {
    status: 'LOCKED',
  };

  // Creators can only see their own earnings
  if (context.role === 'CREATOR') {
    where.creatorId = context.creatorId;
  }

  if (periodStart) {
    where.periodStart = { gte: periodStart };
  }
  if (periodEnd) {
    where.periodEnd = { lte: periodEnd };
  }

  const [totalEarnings, platformFees, netPayable, count] = await Promise.all([
    aggregator.secureSum('royaltyStatement', 'totalEarningsCents', where),
    aggregator.secureSum('royaltyStatement', 'platformFeeCents', where),
    aggregator.secureSum('royaltyStatement', 'netPayableCents', where),
    aggregator.secureCount('royaltyStatement', where),
  ]);

  if (count === 0) {
    return null;
  }

  return {
    totalEarningsCents: totalEarnings || 0,
    platformFeeCents: platformFees || 0,
    netPayableCents: netPayable || 0,
    statementCount: count,
  };
}

/**
 * Calculate brand's total spend
 */
export async function calculateBrandSpend(
  prisma: PrismaClient,
  context: QueryContext,
  periodStart?: Date,
  periodEnd?: Date
): Promise<{
  totalFeeCents: number;
  totalRevShareCents: number;
  licenseCount: number;
} | null> {
  if (context.role !== 'ADMIN' && context.role !== 'BRAND') {
    throw new Error('Unauthorized: Only admins and brands can view spend');
  }

  if (context.role === 'BRAND' && !context.brandId) {
    throw new Error('Brand ID required');
  }

  const aggregator = new SecureAggregation(prisma, context);

  const where: any = {
    status: { in: ['ACTIVE', 'EXPIRED'] },
  };

  // Brands can only see their own spend
  if (context.role === 'BRAND') {
    where.brandId = context.brandId;
  }

  if (periodStart) {
    where.startDate = { gte: periodStart };
  }
  if (periodEnd) {
    where.endDate = { lte: periodEnd };
  }

  const [totalFees, count] = await Promise.all([
    aggregator.secureSum('license', 'feeCents', where),
    aggregator.secureCount('license', where),
  ]);

  if (count === 0) {
    return null;
  }

  return {
    totalFeeCents: totalFees || 0,
    totalRevShareCents: 0, // Would need to calculate from royalties
    licenseCount: count,
  };
}

/**
 * Get asset licensing statistics
 */
export async function getAssetLicensingStats(
  prisma: PrismaClient,
  context: QueryContext,
  assetId?: string
): Promise<{
  totalLicenses: number;
  activeLicenses: number;
  averageFeeCents: number | null;
  totalRevenueCents: number;
} | null> {
  if (context.role !== 'ADMIN' && context.role !== 'CREATOR') {
    throw new Error('Unauthorized: Only admins and creators can view licensing stats');
  }

  const aggregator = new SecureAggregation(prisma, context);

  const where: any = assetId ? { ipAssetId: assetId } : {};

  const [total, active, avgFee, revenue] = await Promise.all([
    aggregator.secureCount('license', where),
    aggregator.secureCount('license', { ...where, status: 'ACTIVE' }),
    aggregator.secureAverage('license', 'feeCents', where, {
      nullOnSmallDataset: true,
      minDatasetSize: 3,
    }),
    aggregator.secureSum('license', 'feeCents', where),
  ]);

  if (total === 0) {
    return null;
  }

  return {
    totalLicenses: total,
    activeLicenses: active,
    averageFeeCents: avgFee,
    totalRevenueCents: revenue || 0,
  };
}

/**
 * Get platform-wide statistics (admin only)
 */
export async function getPlatformStats(
  prisma: PrismaClient,
  context: QueryContext
): Promise<{
  totalCreators: number;
  totalBrands: number;
  totalAssets: number;
  totalLicenses: number;
  totalRevenueCents: number;
} | null> {
  if (context.role !== 'ADMIN') {
    throw new Error('Unauthorized: Only admins can view platform statistics');
  }

  const aggregator = new SecureAggregation(prisma, context);

  const [creators, brands, assets, licenses, revenue] = await Promise.all([
    aggregator.secureCount('creator', { deletedAt: null }),
    aggregator.secureCount('brand', { deletedAt: null }),
    aggregator.secureCount('ipAsset', { deletedAt: null }),
    aggregator.secureCount('license', {}),
    aggregator.secureSum('license', 'feeCents', {}),
  ]);

  return {
    totalCreators: creators,
    totalBrands: brands,
    totalAssets: assets,
    totalLicenses: licenses,
    totalRevenueCents: revenue || 0,
  };
}

/**
 * Type map for aggregation entities
 */
type EntityAggregationMap = {
  ipAsset: 'ipAsset';
  project: 'project';
  license: 'license';
  royaltyStatement: 'royaltyStatement';
  payout: 'payout';
  brand: 'brand';
  creator: 'creator';
};

/**
 * Where input type map
 */
type WhereInputMap = {
  ipAsset: Prisma.IpAssetWhereInput;
  project: Prisma.ProjectWhereInput;
  license: Prisma.LicenseWhereInput;
  royaltyStatement: Prisma.RoyaltyStatementWhereInput;
  payout: Prisma.PayoutWhereInput;
  brand: Prisma.BrandWhereInput;
  creator: Prisma.CreatorWhereInput;
};

/**
 * Create a secure aggregation instance
 */
export function createSecureAggregation(
  prisma: PrismaClient,
  context: QueryContext
): SecureAggregation {
  return new SecureAggregation(prisma, context);
}
