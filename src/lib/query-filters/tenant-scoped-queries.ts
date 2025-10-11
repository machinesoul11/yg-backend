/**
 * Tenant-Scoped Query Helpers
 * 
 * Provides safe, tenant-aware query wrappers that automatically
 * apply security filters based on user context.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type { QueryContext, PaginationOptions, PaginatedResponse, QueryFilterOptions } from './types';
import { getRoleBasedFilter, composeFilters } from './role-filters';

/**
 * Tenant-scoped query builder
 * Automatically applies security filters to all queries
 */
export class TenantScopedQueryBuilder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly context: QueryContext
  ) {}

  /**
   * Find many records with automatic tenant scoping
   */
  async findManyWithScope<T extends keyof EntityModelMap>(
    entityType: T,
    args?: FindManyArgs<T>,
    options: QueryFilterOptions = {}
  ): Promise<Array<ModelType<T>>> {
    const securityFilter = getRoleBasedFilter(this.context, entityType, options);
    const where = composeFilters(securityFilter, args?.where);

    const model = this.getModel(entityType);
    return model.findMany({
      ...args,
      where,
    } as any) as Promise<Array<ModelType<T>>>;
  }

  /**
   * Find first record with automatic tenant scoping
   */
  async findFirstWithScope<T extends keyof EntityModelMap>(
    entityType: T,
    args?: FindFirstArgs<T>,
    options: QueryFilterOptions = {}
  ): Promise<ModelType<T> | null> {
    const securityFilter = getRoleBasedFilter(this.context, entityType, options);
    const where = composeFilters(securityFilter, args?.where);

    const model = this.getModel(entityType);
    return model.findFirst({
      ...args,
      where,
    } as any) as Promise<ModelType<T> | null>;
  }

  /**
   * Find unique record with automatic tenant scoping
   * Note: This validates that the found record passes security filters
   */
  async findUniqueWithScope<T extends keyof EntityModelMap>(
    entityType: T,
    args: FindUniqueArgs<T>,
    options: QueryFilterOptions = {}
  ): Promise<ModelType<T> | null> {
    const model = this.getModel(entityType);
    const record = await model.findUnique(args as any) as ModelType<T> | null;

    if (!record) {
      return null;
    }

    // Verify record passes security filter
    const securityFilter = getRoleBasedFilter(this.context, entityType, options);
    const verification = await model.findFirst({
      where: composeFilters(securityFilter, { id: (record as any).id }),
    } as any);

    return verification ? record : null;
  }

  /**
   * Count records with automatic tenant scoping
   */
  async countWithScope<T extends keyof EntityModelMap>(
    entityType: T,
    args?: CountArgs<T>,
    options: QueryFilterOptions = {}
  ): Promise<number> {
    const securityFilter = getRoleBasedFilter(this.context, entityType, options);
    const where = composeFilters(securityFilter, args?.where);

    const model = this.getModel(entityType);
    return model.count({
      ...args,
      where,
    } as any);
  }

  /**
   * Paginated query with automatic tenant scoping
   */
  async findManyPaginated<T extends keyof EntityModelMap>(
    entityType: T,
    pagination: PaginationOptions,
    args?: FindManyArgs<T>,
    options: QueryFilterOptions = {}
  ): Promise<PaginatedResponse<ModelType<T>>> {
    const { page, pageSize, sortBy, sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const securityFilter = getRoleBasedFilter(this.context, entityType, options);
    const where = composeFilters(securityFilter, args?.where);

    const model = this.getModel(entityType);

    const [data, total] = await Promise.all([
      model.findMany({
        ...args,
        where,
        skip,
        take: pageSize,
        orderBy: sortBy ? { [sortBy]: sortOrder } : undefined,
      } as any) as Promise<Array<ModelType<T>>>,
      model.count({ where } as any),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get Prisma model for entity type
   */
  private getModel<T extends keyof EntityModelMap>(entityType: T): any {
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
 * Create a tenant-scoped query builder
 */
export function createTenantScopedQuery(
  prisma: PrismaClient,
  context: QueryContext
): TenantScopedQueryBuilder {
  return new TenantScopedQueryBuilder(prisma, context);
}

/**
 * Entity model map for type safety
 */
type EntityModelMap = {
  ipAsset: 'ipAsset';
  project: 'project';
  license: 'license';
  royaltyStatement: 'royaltyStatement';
  payout: 'payout';
  brand: 'brand';
  creator: 'creator';
};

/**
 * Extract model type from entity name
 */
type ModelType<T extends keyof EntityModelMap> = 
  T extends 'ipAsset' ? Prisma.IpAssetGetPayload<{}> :
  T extends 'project' ? Prisma.ProjectGetPayload<{}> :
  T extends 'license' ? Prisma.LicenseGetPayload<{}> :
  T extends 'royaltyStatement' ? Prisma.RoyaltyStatementGetPayload<{}> :
  T extends 'payout' ? Prisma.PayoutGetPayload<{}> :
  T extends 'brand' ? Prisma.BrandGetPayload<{}> :
  T extends 'creator' ? Prisma.CreatorGetPayload<{}> :
  never;

/**
 * FindMany args type
 */
type FindManyArgs<T extends keyof EntityModelMap> = 
  T extends 'ipAsset' ? Omit<Prisma.IpAssetFindManyArgs, 'where'> & { where?: Prisma.IpAssetWhereInput } :
  T extends 'project' ? Omit<Prisma.ProjectFindManyArgs, 'where'> & { where?: Prisma.ProjectWhereInput } :
  T extends 'license' ? Omit<Prisma.LicenseFindManyArgs, 'where'> & { where?: Prisma.LicenseWhereInput } :
  T extends 'royaltyStatement' ? Omit<Prisma.RoyaltyStatementFindManyArgs, 'where'> & { where?: Prisma.RoyaltyStatementWhereInput } :
  T extends 'payout' ? Omit<Prisma.PayoutFindManyArgs, 'where'> & { where?: Prisma.PayoutWhereInput } :
  T extends 'brand' ? Omit<Prisma.BrandFindManyArgs, 'where'> & { where?: Prisma.BrandWhereInput } :
  T extends 'creator' ? Omit<Prisma.CreatorFindManyArgs, 'where'> & { where?: Prisma.CreatorWhereInput } :
  never;

/**
 * FindFirst args type
 */
type FindFirstArgs<T extends keyof EntityModelMap> = 
  T extends 'ipAsset' ? Omit<Prisma.IpAssetFindFirstArgs, 'where'> & { where?: Prisma.IpAssetWhereInput } :
  T extends 'project' ? Omit<Prisma.ProjectFindFirstArgs, 'where'> & { where?: Prisma.ProjectWhereInput } :
  T extends 'license' ? Omit<Prisma.LicenseFindFirstArgs, 'where'> & { where?: Prisma.LicenseWhereInput } :
  T extends 'royaltyStatement' ? Omit<Prisma.RoyaltyStatementFindFirstArgs, 'where'> & { where?: Prisma.RoyaltyStatementWhereInput } :
  T extends 'payout' ? Omit<Prisma.PayoutFindFirstArgs, 'where'> & { where?: Prisma.PayoutWhereInput } :
  T extends 'brand' ? Omit<Prisma.BrandFindFirstArgs, 'where'> & { where?: Prisma.BrandWhereInput } :
  T extends 'creator' ? Omit<Prisma.CreatorFindFirstArgs, 'where'> & { where?: Prisma.CreatorWhereInput } :
  never;

/**
 * FindUnique args type
 */
type FindUniqueArgs<T extends keyof EntityModelMap> = 
  T extends 'ipAsset' ? Prisma.IpAssetFindUniqueArgs :
  T extends 'project' ? Prisma.ProjectFindUniqueArgs :
  T extends 'license' ? Prisma.LicenseFindUniqueArgs :
  T extends 'royaltyStatement' ? Prisma.RoyaltyStatementFindUniqueArgs :
  T extends 'payout' ? Prisma.PayoutFindUniqueArgs :
  T extends 'brand' ? Prisma.BrandFindUniqueArgs :
  T extends 'creator' ? Prisma.CreatorFindUniqueArgs :
  never;

/**
 * Count args type
 */
type CountArgs<T extends keyof EntityModelMap> = 
  T extends 'ipAsset' ? Omit<Prisma.IpAssetCountArgs, 'where'> & { where?: Prisma.IpAssetWhereInput } :
  T extends 'project' ? Omit<Prisma.ProjectCountArgs, 'where'> & { where?: Prisma.ProjectWhereInput } :
  T extends 'license' ? Omit<Prisma.LicenseCountArgs, 'where'> & { where?: Prisma.LicenseWhereInput } :
  T extends 'royaltyStatement' ? Omit<Prisma.RoyaltyStatementCountArgs, 'where'> & { where?: Prisma.RoyaltyStatementWhereInput } :
  T extends 'payout' ? Omit<Prisma.PayoutCountArgs, 'where'> & { where?: Prisma.PayoutWhereInput } :
  T extends 'brand' ? Omit<Prisma.BrandCountArgs, 'where'> & { where?: Prisma.BrandWhereInput } :
  T extends 'creator' ? Omit<Prisma.CreatorCountArgs, 'where'> & { where?: Prisma.CreatorWhereInput } :
  never;
