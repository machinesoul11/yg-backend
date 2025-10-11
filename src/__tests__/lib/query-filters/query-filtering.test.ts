/**
 * Query Filtering Tests
 * 
 * Comprehensive test suite verifying data isolation between users
 * and testing all query filtering, tenant scoping, ownership, and aggregation features.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import type { QueryContext } from '../types';
import {
  createTenantScopedQuery,
  getRoleBasedFilter,
  composeFilters,
  getIpAssetOwnershipFilter,
  getPrimaryOwnershipFilter,
  verifyOwnership,
  getAllowedSelectFields,
  filterSelectFields,
  redactSensitiveFields,
  createSecureAggregation,
  calculateCreatorEarnings,
  calculateBrandSpend,
} from '../index';

const prisma = new PrismaClient();

// Test data IDs
let adminUserId: string;
let creator1UserId: string;
let creator1Id: string;
let creator2UserId: string;
let creator2Id: string;
let brand1UserId: string;
let brand1Id: string;
let brand2UserId: string;
let brand2Id: string;
let asset1Id: string;
let asset2Id: string;
let asset3Id: string;
let project1Id: string;
let project2Id: string;
let license1Id: string;
let statement1Id: string;

describe('Query Filtering - Data Isolation Tests', () => {
  beforeAll(async () => {
    // Create test users
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'ADMIN',
      },
    });
    adminUserId = adminUser.id;

    const creator1User = await prisma.user.create({
      data: {
        email: 'creator1@test.com',
        name: 'Creator One',
        role: 'CREATOR',
        creator: {
          create: {
            stageName: 'Creator One',
            bio: 'Test creator 1',
            verificationStatus: 'approved',
            onboardingStatus: 'completed',
          },
        },
      },
      include: { creator: true },
    });
    creator1UserId = creator1User.id;
    creator1Id = creator1User.creator!.id;

    const creator2User = await prisma.user.create({
      data: {
        email: 'creator2@test.com',
        name: 'Creator Two',
        role: 'CREATOR',
        creator: {
          create: {
            stageName: 'Creator Two',
            bio: 'Test creator 2',
            verificationStatus: 'approved',
            onboardingStatus: 'completed',
          },
        },
      },
      include: { creator: true },
    });
    creator2UserId = creator2User.id;
    creator2Id = creator2User.creator!.id;

    const brand1User = await prisma.user.create({
      data: {
        email: 'brand1@test.com',
        name: 'Brand One',
        role: 'BRAND',
        brand: {
          create: {
            companyName: 'Brand One Inc',
            industry: 'Fashion',
            verificationStatus: 'verified',
          },
        },
      },
      include: { brand: true },
    });
    brand1UserId = brand1User.id;
    brand1Id = brand1User.brand!.id;

    const brand2User = await prisma.user.create({
      data: {
        email: 'brand2@test.com',
        name: 'Brand Two',
        role: 'BRAND',
        brand: {
          create: {
            companyName: 'Brand Two Ltd',
            industry: 'Technology',
            verificationStatus: 'verified',
          },
        },
      },
      include: { brand: true },
    });
    brand2UserId = brand2User.id;
    brand2Id = brand2User.brand!.id;

    // Create test IP assets
    const asset1 = await prisma.ipAsset.create({
      data: {
        title: 'Asset 1',
        description: 'Creator 1 asset',
        type: 'IMAGE',
        status: 'PUBLISHED',
        createdBy: creator1UserId,
        ownerships: {
          create: {
            creatorId: creator1Id,
            ownershipType: 'PRIMARY',
            shareBps: 10000,
            startDate: new Date(),
            createdBy: creator1UserId,
            updatedBy: creator1UserId,
          },
        },
      },
    });
    asset1Id = asset1.id;

    const asset2 = await prisma.ipAsset.create({
      data: {
        title: 'Asset 2',
        description: 'Creator 2 asset',
        type: 'VIDEO',
        status: 'PUBLISHED',
        createdBy: creator2UserId,
        ownerships: {
          create: {
            creatorId: creator2Id,
            ownershipType: 'PRIMARY',
            shareBps: 10000,
            startDate: new Date(),
            createdBy: creator2UserId,
            updatedBy: creator2UserId,
          },
        },
      },
    });
    asset2Id = asset2.id;

    const asset3 = await prisma.ipAsset.create({
      data: {
        title: 'Asset 3',
        description: 'Collaborative asset',
        type: 'AUDIO',
        status: 'PUBLISHED',
        createdBy: creator1UserId,
        ownerships: {
          createMany: {
            data: [
              {
                creatorId: creator1Id,
                ownershipType: 'PRIMARY',
                shareBps: 6000,
                startDate: new Date(),
                createdBy: creator1UserId,
                updatedBy: creator1UserId,
              },
              {
                creatorId: creator2Id,
                ownershipType: 'CONTRIBUTOR',
                shareBps: 4000,
                startDate: new Date(),
                createdBy: creator1UserId,
                updatedBy: creator1UserId,
              },
            ],
          },
        },
      },
    });
    asset3Id = asset3.id;

    // Create projects
    const project1 = await prisma.project.create({
      data: {
        name: 'Brand 1 Project',
        description: 'Test project',
        status: 'ACTIVE',
        projectType: 'CAMPAIGN',
        brandId: brand1Id,
        createdBy: brand1UserId,
        updatedBy: brand1UserId,
      },
    });
    project1Id = project1.id;

    const project2 = await prisma.project.create({
      data: {
        name: 'Brand 2 Project',
        description: 'Test project 2',
        status: 'ACTIVE',
        projectType: 'PRODUCTION',
        brandId: brand2Id,
        createdBy: brand2UserId,
        updatedBy: brand2UserId,
      },
    });
    project2Id = project2.id;

    // Create licenses
    const license1 = await prisma.license.create({
      data: {
        ipAssetId: asset1Id,
        brandId: brand1Id,
        projectId: project1Id,
        licenseType: 'EXCLUSIVE',
        status: 'ACTIVE',
        feeCents: 100000,
        revShareBps: 2500,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    license1Id = license1.id;

    // Create royalty statement
    const statement1 = await prisma.royaltyStatement.create({
      data: {
        creatorId: creator1Id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        totalEarningsCents: 50000,
        platformFeeCents: 5000,
        netPayableCents: 45000,
        status: 'LOCKED',
        royaltyRunId: (await prisma.royaltyRun.create({
          data: {
            periodStart: new Date('2025-01-01'),
            periodEnd: new Date('2025-01-31'),
            status: 'COMPLETED',
            createdBy: adminUserId,
          },
        })).id,
      },
    });
    statement1Id = statement1.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.royaltyStatement.deleteMany({});
    await prisma.royaltyRun.deleteMany({});
    await prisma.license.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.ipOwnership.deleteMany({});
    await prisma.ipAsset.deleteMany({});
    await prisma.creator.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Role-Based Filtering', () => {
    it('should allow admins to see all assets', async () => {
      const context: QueryContext = {
        userId: adminUserId,
        role: 'ADMIN',
      };

      const filter = getRoleBasedFilter(context, 'ipAsset');
      const assets = await prisma.ipAsset.findMany({ where: filter });

      expect(assets.length).toBeGreaterThanOrEqual(3);
    });

    it('should allow creators to see only their own assets', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const filter = getRoleBasedFilter(context, 'ipAsset');
      const assets = await prisma.ipAsset.findMany({ where: filter });

      // Should see asset1 and asset3 (owned)
      expect(assets.length).toBe(2);
      expect(assets.every(a => 
        a.createdBy === creator1UserId || a.id === asset3Id
      )).toBe(true);
    });

    it('should prevent creator from seeing another creator\'s assets', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const filter = getRoleBasedFilter(context, 'ipAsset');
      const assets = await prisma.ipAsset.findMany({ where: filter });

      // Should NOT see asset2 (owned by creator2 exclusively)
      expect(assets.find(a => a.id === asset2Id)).toBeUndefined();
    });

    it('should allow brands to see only their own projects', async () => {
      const context: QueryContext = {
        userId: brand1UserId,
        role: 'BRAND',
        brandId: brand1Id,
      };

      const filter = getRoleBasedFilter(context, 'project');
      const projects = await prisma.project.findMany({ where: filter });

      expect(projects.length).toBe(1);
      expect(projects[0].id).toBe(project1Id);
    });

    it('should prevent brands from seeing other brands\' projects', async () => {
      const context: QueryContext = {
        userId: brand1UserId,
        role: 'BRAND',
        brandId: brand1Id,
      };

      const filter = getRoleBasedFilter(context, 'project');
      const projects = await prisma.ipAsset.findMany({ where: filter });

      expect(projects.find(p => p.id === project2Id)).toBeUndefined();
    });
  });

  describe('Tenant-Scoped Queries', () => {
    it('should scope findMany queries automatically', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const scopedQuery = createTenantScopedQuery(prisma, context);
      const assets = await scopedQuery.findManyWithScope('ipAsset');

      expect(assets.length).toBe(2); // asset1 and asset3
    });

    it('should combine scoping with additional filters', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const scopedQuery = createTenantScopedQuery(prisma, context);
      const assets = await scopedQuery.findManyWithScope('ipAsset', {
        where: { type: 'IMAGE' },
      });

      expect(assets.length).toBe(1);
      expect(assets[0].id).toBe(asset1Id);
    });

    it('should validate unique queries with scoping', async () => {
      const context: QueryContext = {
        userId: creator2UserId,
        role: 'CREATOR',
        creatorId: creator2Id,
      };

      const scopedQuery = createTenantScopedQuery(prisma, context);
      
      // Creator2 trying to access Creator1's exclusive asset
      const asset = await scopedQuery.findUniqueWithScope('ipAsset', {
        where: { id: asset1Id },
      });

      expect(asset).toBeNull();
    });

    it('should support paginated queries with scoping', async () => {
      const context: QueryContext = {
        userId: adminUserId,
        role: 'ADMIN',
      };

      const scopedQuery = createTenantScopedQuery(prisma, context);
      const result = await scopedQuery.findManyPaginated('ipAsset', {
        page: 1,
        pageSize: 2,
      });

      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(2);
      expect(result.meta.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Ownership-Based Filtering', () => {
    it('should filter by primary ownership', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const filter = getPrimaryOwnershipFilter(context);
      const assets = await prisma.ipAsset.findMany({ where: filter });

      // Should include asset1 and asset3 (primary owner)
      expect(assets.length).toBeGreaterThanOrEqual(2);
      expect(assets.some(a => a.id === asset1Id)).toBe(true);
      expect(assets.some(a => a.id === asset3Id)).toBe(true);
    });

    it('should verify ownership correctly', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      // Should pass for owned asset
      await expect(
        verifyOwnership(prisma, context, asset1Id)
      ).resolves.not.toThrow();

      // Should fail for non-owned asset
      await expect(
        verifyOwnership(prisma, context, asset2Id)
      ).rejects.toThrow();
    });

    it('should handle collaborative assets correctly', async () => {
      const context: QueryContext = {
        userId: creator2UserId,
        role: 'CREATOR',
        creatorId: creator2Id,
      };

      const filter = getIpAssetOwnershipFilter(context);
      const assets = await prisma.ipAsset.findMany({ where: filter });

      // Should see asset2 (primary) and asset3 (contributor)
      expect(assets.length).toBeGreaterThanOrEqual(2);
      expect(assets.some(a => a.id === asset2Id)).toBe(true);
      expect(assets.some(a => a.id === asset3Id)).toBe(true);
    });
  });

  describe('Permission-Based Select Filtering', () => {
    it('should return only public fields for creator profiles', () => {
      const viewerContext: QueryContext = {
        userId: 'viewer-id',
        role: 'VIEWER',
      };

      const allowedFields = getAllowedSelectFields(viewerContext, 'creator');

      expect(allowedFields.stageName).toBe(true);
      expect(allowedFields.bio).toBe(true);
      expect(allowedFields.email).toBeUndefined();
      expect(allowedFields.stripeAccountId).toBeUndefined();
    });

    it('should return owner fields for own profile', () => {
      const creatorContext: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const allowedFields = getAllowedSelectFields(
        creatorContext,
        'creator',
        creator1UserId
      );

      expect(allowedFields.email).toBe(true);
      expect(allowedFields.stripeAccountId).toBe(true);
      expect(allowedFields.performanceMetrics).toBe(true);
    });

    it('should redact sensitive fields from results', () => {
      const viewerContext: QueryContext = {
        userId: 'viewer-id',
        role: 'VIEWER',
      };

      const creatorData = {
        id: creator1Id,
        stageName: 'Creator One',
        bio: 'Test bio',
        email: 'creator1@test.com',
        stripeAccountId: 'acct_123',
        performanceMetrics: { views: 1000 },
      };

      const redacted = redactSensitiveFields(
        viewerContext,
        'creator',
        creatorData
      );

      expect(redacted.stageName).toBe('Creator One');
      expect(redacted.email).toBeUndefined();
      expect(redacted.stripeAccountId).toBeUndefined();
    });
  });

  describe('Secure Aggregations', () => {
    it('should calculate creator earnings securely', async () => {
      const context: QueryContext = {
        userId: creator1UserId,
        role: 'CREATOR',
        creatorId: creator1Id,
      };

      const earnings = await calculateCreatorEarnings(prisma, context);

      expect(earnings).not.toBeNull();
      expect(earnings!.totalEarningsCents).toBe(50000);
      expect(earnings!.platformFeeCents).toBe(5000);
      expect(earnings!.netPayableCents).toBe(45000);
      expect(earnings!.statementCount).toBe(1);
    });

    it('should prevent creators from viewing other creators\' earnings', async () => {
      const context: QueryContext = {
        userId: creator2UserId,
        role: 'CREATOR',
        creatorId: creator2Id,
      };

      const earnings = await calculateCreatorEarnings(prisma, context);

      // Creator2 has no statements yet
      expect(earnings).toBeNull();
    });

    it('should calculate brand spend securely', async () => {
      const context: QueryContext = {
        userId: brand1UserId,
        role: 'BRAND',
        brandId: brand1Id,
      };

      const spend = await calculateBrandSpend(prisma, context);

      expect(spend).not.toBeNull();
      expect(spend!.totalFeeCents).toBe(100000);
      expect(spend!.licenseCount).toBe(1);
    });

    it('should prevent small dataset aggregations', async () => {
      const context: QueryContext = {
        userId: adminUserId,
        role: 'ADMIN',
      };

      const aggregator = createSecureAggregation(prisma, context);
      
      // With only 1 statement, average should return null with protection
      const avgEarnings = await aggregator.secureAverage(
        'royaltyStatement',
        'totalEarningsCents',
        {},
        { nullOnSmallDataset: true, minDatasetSize: 5 }
      );

      expect(avgEarnings).toBeNull();
    });
  });

  describe('Data Isolation - Cross-Tenant Tests', () => {
    it('should prevent cross-tenant license access', async () => {
      const creator2Context: QueryContext = {
        userId: creator2UserId,
        role: 'CREATOR',
        creatorId: creator2Id,
      };

      const filter = getRoleBasedFilter(creator2Context, 'license');
      const licenses = await prisma.license.findMany({ where: filter });

      // Creator2 should not see license1 (for creator1's asset)
      expect(licenses.find(l => l.id === license1Id)).toBeUndefined();
    });

    it('should prevent cross-tenant royalty statement access', async () => {
      const creator2Context: QueryContext = {
        userId: creator2UserId,
        role: 'CREATOR',
        creatorId: creator2Id,
      };

      const filter = getRoleBasedFilter(creator2Context, 'royaltyStatement');
      const statements = await prisma.royaltyStatement.findMany({ where: filter });

      // Creator2 should not see creator1's statements
      expect(statements.length).toBe(0);
    });

    it('should ensure complete data isolation for financial data', async () => {
      const brand1Context: QueryContext = {
        userId: brand1UserId,
        role: 'BRAND',
        brandId: brand1Id,
      };

      // Brands should not be able to query royalty statements at all
      const filter = getRoleBasedFilter(brand1Context, 'royaltyStatement');
      const statements = await prisma.royaltyStatement.findMany({ where: filter });

      expect(statements.length).toBe(0);
    });
  });
});

describe('Query Filtering - Performance Tests', () => {
  it('should apply filters efficiently', async () => {
    const context: QueryContext = {
      userId: creator1UserId,
      role: 'CREATOR',
      creatorId: creator1Id,
    };

    const startTime = Date.now();
    const filter = getRoleBasedFilter(context, 'ipAsset');
    const assets = await prisma.ipAsset.findMany({ where: filter });
    const endTime = Date.now();

    // Query should complete quickly (< 100ms for small dataset)
    expect(endTime - startTime).toBeLessThan(100);
  });

  it('should handle filter composition efficiently', async () => {
    const context: QueryContext = {
      userId: creator1UserId,
      role: 'CREATOR',
      creatorId: creator1Id,
    };

    const filter1 = getRoleBasedFilter(context, 'ipAsset');
    const filter2 = { type: 'IMAGE' };
    const filter3 = { status: 'PUBLISHED' };

    const composed = composeFilters(filter1, filter2, filter3);

    expect(composed.AND).toBeDefined();
    expect(Array.isArray(composed.AND)).toBe(true);
  });
});
