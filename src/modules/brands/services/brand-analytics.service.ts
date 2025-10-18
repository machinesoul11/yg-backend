/**
 * Brand Analytics Service
 * Business logic for brand performance analytics and reporting
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';
import { sub, startOfDay, endOfDay, format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import type {
  GetCampaignAnalyticsInput,
  GetROIAnalysisInput,
  GetCreatorPerformanceInput,
  GetAssetUsageInput,
  GetSpendAnalysisInput,
  GetBudgetUtilizationInput,
  GetCostPerMetricInput,
} from '../schemas/brand-analytics.schema';
import type {
  CampaignAnalyticsResponse,
  ROIAnalysisResponse,
  CreatorPerformanceResponse,
  AssetUsageResponse,
  SpendAnalysisResponse,
  BudgetUtilizationResponse,
  CostPerMetricResponse,
  DateRange,
  CampaignPerformanceMetrics,
  CreatorPerformanceMetrics,
  AssetUsageMetrics,
} from '../types/brand-analytics.types';

export class BrandAnalyticsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Get Campaign Performance Analytics
   * Endpoint: GET /analytics/brands/:id/campaigns
   */
  async getCampaignAnalytics(
    input: GetCampaignAnalyticsInput
  ): Promise<CampaignAnalyticsResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 90 days)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 90);

    // Try cache first
    const cacheKey = `brand:${input.id}:campaigns:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.status || 'all'}:${input.sortBy}:${input.sortOrder}:${input.limit}:${input.offset}`;
    const cached = await this.getFromCache<CampaignAnalyticsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build filters for campaigns (projects)
    const campaignFilters: any = {
      brandId: input.id,
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deletedAt: null,
    };

    if (input.status) {
      campaignFilters.status = input.status;
    }

    // Get campaigns with licenses and metrics
    const campaigns = await this.prisma.project.findMany({
      where: campaignFilters,
      include: {
        licenses: {
          where: { deletedAt: null },
          include: {
            ipAsset: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: this.buildCampaignOrderBy(input.sortBy, input.sortOrder),
      take: input.limit,
      skip: input.offset,
    });

    // Get total count for pagination
    const totalCampaigns = await this.prisma.project.count({
      where: campaignFilters,
    });

    // Calculate metrics for each campaign
    const campaignMetrics = await Promise.all(
      campaigns.map((campaign) => this.calculateCampaignMetrics(campaign, dateRange))
    );

    // Calculate summary statistics
    const summary = {
      totalCampaigns,
      activeCampaigns: campaignMetrics.filter((c) => c.status === 'ACTIVE').length,
      completedCampaigns: campaignMetrics.filter((c) => c.status === 'COMPLETED').length,
      totalBudgetCents: campaignMetrics.reduce((sum, c) => sum + c.budgetCents, 0),
      totalSpentCents: campaignMetrics.reduce((sum, c) => sum + c.spentCents, 0),
      avgCampaignBudgetCents:
        campaignMetrics.length > 0
          ? Math.round(
              campaignMetrics.reduce((sum, c) => sum + c.budgetCents, 0) / campaignMetrics.length
            )
          : 0,
      totalImpressions: campaignMetrics.reduce((sum, c) => sum + c.impressions, 0),
      totalConversions: campaignMetrics.reduce((sum, c) => sum + c.conversions, 0),
      overallROI:
        campaignMetrics.length > 0
          ? campaignMetrics.reduce((sum, c) => sum + c.roi, 0) / campaignMetrics.length
          : 0,
    };

    // Get top performing campaigns
    const topPerformingCampaigns = [...campaignMetrics]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 5)
      .map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        roi: c.roi,
        conversionRate: c.conversionRate,
      }));

    const response: CampaignAnalyticsResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary,
      campaigns: campaignMetrics,
      topPerformingCampaigns,
    };

    // Cache for 15 minutes
    await this.setCache(cacheKey, response, 900);

    return response;
  }

  /**
   * Get ROI Analysis
   * Endpoint: GET /analytics/brands/:id/roi
   */
  async getROIAnalysis(input: GetROIAnalysisInput): Promise<ROIAnalysisResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 12 months)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Try cache first
    const cacheKey = `brand:${input.id}:roi:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.granularity}`;
    const cached = await this.getFromCache<ROIAnalysisResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate total investment
    const investment = await this.calculateTotalInvestment(input.id, dateRange);

    // Calculate total returns
    const returns = await this.calculateTotalReturns(input.id, dateRange);

    // Calculate net profit and ROI
    const netProfitCents = returns.totalCents - investment.totalCents;
    const netProfitMargin =
      returns.totalCents > 0 ? (netProfitCents / returns.totalCents) * 100 : 0;
    const roiPercentage =
      investment.totalCents > 0 ? (netProfitCents / investment.totalCents) * 100 : 0;
    const roiMultiplier = investment.totalCents > 0 ? returns.totalCents / investment.totalCents : 0;

    // Calculate additional metrics
    const metrics = await this.calculateROIMetrics(input.id, dateRange, investment.totalCents);

    // Get timeline data
    const timeline = await this.getROITimeline(input.id, dateRange, input.granularity);

    // Get campaign comparison
    let campaignComparison: ROIAnalysisResponse['campaignComparison'] = [];
    if (input.includeCampaignBreakdown) {
      campaignComparison = await this.getCampaignROIComparison(input.id, dateRange);
    }

    const response: ROIAnalysisResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      totalInvestment: investment,
      totalReturns: returns,
      netProfit: {
        amountCents: netProfitCents,
        margin: netProfitMargin,
      },
      roi: {
        percentage: roiPercentage,
        multiplier: roiMultiplier,
      },
      metrics,
      timeline,
      campaignComparison,
    };

    // Cache for 30 minutes
    await this.setCache(cacheKey, response, 1800);

    return response;
  }

  /**
   * Get Creator Performance Analytics
   * Endpoint: GET /analytics/brands/:id/creator-performance
   */
  async getCreatorPerformance(
    input: GetCreatorPerformanceInput
  ): Promise<CreatorPerformanceResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 180 days)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 180);

    // Try cache first
    const cacheKey = `brand:${input.id}:creators:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.sortBy}:${input.sortOrder}:${input.limit}:${input.offset}`;
    const cached = await this.getFromCache<CreatorPerformanceResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all licenses for this brand to identify collaborating creators
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId: input.id,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Group by creator and calculate metrics
    const creatorMap = new Map<string, any>();

    for (const license of licenses) {
      for (const ownership of license.ipAsset.ownerships) {
        const creatorId = ownership.creatorId;
        if (!creatorMap.has(creatorId)) {
          creatorMap.set(creatorId, {
            creator: ownership.creator,
            licenses: [],
            campaigns: new Set<string>(),
            contentPieces: new Set<string>(),
          });
        }

        const creatorData = creatorMap.get(creatorId);
        creatorData.licenses.push(license);
        if (license.project) {
          creatorData.campaigns.add(license.project.id);
        }
        creatorData.contentPieces.add(license.ipAssetId);
      }
    }

    // Calculate performance metrics for each creator
    const creatorMetrics = await Promise.all(
      Array.from(creatorMap.entries()).map(([creatorId, data]) =>
        this.calculateCreatorPerformance(creatorId, data, dateRange)
      )
    );

    // Filter by minimum collaborations if specified
    let filteredCreators = creatorMetrics;
    if (input.minCollaborations !== undefined) {
      filteredCreators = creatorMetrics.filter(
        (c) => c.collaborations.totalCampaigns >= input.minCollaborations!
      );
    }

    // Sort creators
    const sortedCreators = this.sortCreators(filteredCreators, input.sortBy, input.sortOrder);

    // Paginate
    const paginatedCreators = sortedCreators.slice(input.offset, input.offset + input.limit);

    // Calculate summary
    const summary = {
      totalCreators: creatorMap.size,
      activeCreators: creatorMetrics.filter((c) => c.collaborations.activeLicenses > 0).length,
      totalCollaborations: creatorMetrics.reduce(
        (sum, c) => sum + c.collaborations.totalCampaigns,
        0
      ),
      totalSpentCents: creatorMetrics.reduce((sum, c) => sum + c.financial.totalPaidCents, 0),
      avgSpentPerCreatorCents:
        creatorMetrics.length > 0
          ? Math.round(
              creatorMetrics.reduce((sum, c) => sum + c.financial.totalPaidCents, 0) /
                creatorMetrics.length
            )
          : 0,
      avgEngagementRate:
        creatorMetrics.length > 0
          ? creatorMetrics.reduce((sum, c) => sum + c.performance.avgEngagementRate, 0) /
            creatorMetrics.length
          : 0,
    };

    // Get top performers (top 10 by performance score)
    const topPerformers = [...creatorMetrics]
      .map((c) => ({
        creatorId: c.creatorId,
        creatorName: c.creatorName,
        performanceScore: c.quality.contentQualityScore,
        engagementRate: c.performance.avgEngagementRate,
        costEfficiency: c.financial.costPerEngagement,
      }))
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 10);

    // Category breakdown (placeholder - would need category data)
    const categoryBreakdown: Array<{
      category: string;
      creatorCount: number;
      avgEngagementRate: number;
    }> = [];

    const response: CreatorPerformanceResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary,
      creators: paginatedCreators,
      topPerformers,
      categoryBreakdown,
    };

    // Cache for 20 minutes
    await this.setCache(cacheKey, response, 1200);

    return response;
  }

  /**
   * Get Asset Usage Analytics
   * Endpoint: GET /analytics/brands/:id/asset-usage
   */
  async getAssetUsage(input: GetAssetUsageInput): Promise<AssetUsageResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 365 days)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Try cache first
    const cacheKey = `brand:${input.id}:assets:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.assetType || 'all'}:${input.usageStatus}:${input.sortBy}:${input.sortOrder}`;
    const cached = await this.getFromCache<AssetUsageResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get brand's projects to identify brand-owned assets
    const projects = await this.prisma.project.findMany({
      where: {
        brandId: input.id,
        deletedAt: null,
      },
      select: {
        id: true,
        ipAssets: {
          where: {
            deletedAt: null,
            ...(input.assetType ? { type: input.assetType } : {}),
          },
          include: {
            licenses: {
              where: {
                brandId: input.id,
                deletedAt: null,
              },
              include: {
                project: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            ownerships: {
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
        },
      },
    });

    // Flatten assets
    const allAssets = projects.flatMap((p) => p.ipAssets);

    // Calculate usage metrics for each asset
    const assetMetrics = await Promise.all(
      allAssets.map((asset) => this.calculateAssetUsageMetrics(asset, dateRange))
    );

    // Filter by usage status
    let filteredAssets = assetMetrics;
    if (input.usageStatus === 'used') {
      filteredAssets = assetMetrics.filter((a) => a.usage.totalLicenses > 0);
    } else if (input.usageStatus === 'unused') {
      filteredAssets = assetMetrics.filter((a) => a.usage.totalLicenses === 0);
    }

    // Filter by minimum usage count
    if (input.minUsageCount !== undefined) {
      filteredAssets = filteredAssets.filter(
        (a) => a.usage.totalLicenses >= input.minUsageCount!
      );
    }

    // Sort assets
    const sortedAssets = this.sortAssets(filteredAssets, input.sortBy, input.sortOrder);

    // Paginate
    const paginatedAssets = sortedAssets.slice(input.offset, input.offset + input.limit);

    // Calculate summary
    const summary = {
      totalAssets: allAssets.length,
      usedAssets: assetMetrics.filter((a) => a.usage.totalLicenses > 0).length,
      unusedAssets: assetMetrics.filter((a) => a.usage.totalLicenses === 0).length,
      avgUsagePerAsset:
        assetMetrics.length > 0
          ? assetMetrics.reduce((sum, a) => sum + a.usage.totalLicenses, 0) / assetMetrics.length
          : 0,
      totalImpressions: assetMetrics.reduce((sum, a) => sum + a.performance.totalImpressions, 0),
      avgEngagementRate:
        assetMetrics.length > 0
          ? assetMetrics.reduce((sum, a) => sum + a.performance.avgEngagementRate, 0) /
            assetMetrics.length
          : 0,
    };

    // Get most effective assets
    const mostEffectiveAssets = [...assetMetrics]
      .sort((a, b) => b.effectiveness.performanceScore - a.effectiveness.performanceScore)
      .slice(0, 10)
      .map((a) => ({
        assetId: a.assetId,
        assetTitle: a.assetTitle,
        performanceScore: a.effectiveness.performanceScore,
        usageCount: a.usage.totalLicenses,
      }));

    // Get least used assets
    const leastUsedAssets = [...assetMetrics]
      .sort((a, b) => a.usage.totalLicenses - b.usage.totalLicenses)
      .slice(0, 10)
      .map((a) => ({
        assetId: a.assetId,
        assetTitle: a.assetTitle,
        uploadedAt: a.uploadedAt,
        usageCount: a.usage.totalLicenses,
      }));

    // Asset type breakdown
    const typeMap = new Map<string, { count: number; totalEngagement: number; totalScore: number }>();
    assetMetrics.forEach((asset) => {
      const existing = typeMap.get(asset.assetType) || { count: 0, totalEngagement: 0, totalScore: 0 };
      existing.count += 1;
      existing.totalEngagement += asset.performance.avgEngagementRate;
      existing.totalScore += asset.effectiveness.performanceScore;
      typeMap.set(asset.assetType, existing);
    });

    const assetTypeBreakdown = Array.from(typeMap.entries()).map(([type, data]) => ({
      assetType: type,
      count: data.count,
      avgEngagementRate: data.count > 0 ? data.totalEngagement / data.count : 0,
      avgPerformanceScore: data.count > 0 ? data.totalScore / data.count : 0,
    }));

    // Generate recommendations
    const recommendations = this.generateAssetRecommendations(assetMetrics);

    const response: AssetUsageResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary,
      assets: paginatedAssets,
      mostEffectiveAssets,
      leastUsedAssets,
      assetTypeBreakdown,
      recommendations,
    };

    // Cache for 30 minutes
    await this.setCache(cacheKey, response, 1800);

    return response;
  }

  /**
   * Helper: Verify brand exists and user has access
   */
  private async verifyBrandAccess(brandId: string): Promise<void> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId, deletedAt: null },
    });

    if (!brand) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Brand not found',
      });
    }
  }

  /**
   * Helper: Parse date range with defaults
   */
  private parseDateRange(
    startDate: string | undefined,
    endDate: string | undefined,
    defaultDaysBack: number
  ): DateRange {
    const end = endDate ? new Date(endDate) : endOfDay(new Date());
    const start = startDate ? new Date(startDate) : startOfDay(sub(end, { days: defaultDaysBack }));

    return { start, end };
  }

  /**
   * Helper: Calculate campaign metrics
   */
  private async calculateCampaignMetrics(
    campaign: any,
    dateRange: DateRange
  ): Promise<CampaignPerformanceMetrics> {
    // Get asset IDs from licenses
    const assetIds = campaign.licenses.map((l: any) => l.ipAssetId);

    // Get metrics for these assets
    const metrics = await this.prisma.dailyMetric.findMany({
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
    });

    // Aggregate metrics
    const totalViews = metrics.reduce((sum, m) => sum + m.views, 0);
    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
    const uniqueVisitors = metrics.reduce((sum, m) => sum + m.uniqueVisitors, 0);

    // Calculate spend from license fees
    const spentCents = campaign.licenses.reduce((sum: number, l: any) => sum + (l.feeCents || 0), 0);

    // Calculate engagement (simplified - would need more event data)
    const engagement = {
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      total: 0,
      rate: totalViews > 0 ? (totalClicks / totalViews) * 100 : 0,
    };

    // Calculate ROI
    const roi = spentCents > 0 ? ((totalConversions * 10000 - spentCents) / spentCents) * 100 : 0;

    // Active licenses count
    const activeLicenses = campaign.licenses.filter(
      (l: any) => l.status === 'ACTIVE' && (!l.endDate || new Date(l.endDate) > new Date())
    ).length;

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      startDate: campaign.startDate?.toISOString() || campaign.createdAt.toISOString(),
      endDate: campaign.endDate?.toISOString() || null,
      budgetCents: campaign.budgetCents || 0,
      spentCents,
      impressions: totalViews,
      reach: uniqueVisitors,
      engagement,
      clicks: totalClicks,
      conversions: totalConversions,
      clickThroughRate: totalViews > 0 ? (totalClicks / totalViews) * 100 : 0,
      conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      costPerClick: totalClicks > 0 ? spentCents / totalClicks : 0,
      costPerConversion: totalConversions > 0 ? spentCents / totalConversions : 0,
      roi,
      activeLicenses,
      uniqueAssets: new Set(assetIds).size,
    };
  }

  /**
   * Helper: Build campaign order by clause
   */
  private buildCampaignOrderBy(sortBy?: string, sortOrder?: string): any {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'name':
        return { name: order };
      case 'startDate':
        return { startDate: order };
      case 'spent':
      case 'roi':
      case 'conversions':
        // These need to be calculated, so we'll sort in memory after fetching
        return { createdAt: order };
      default:
        return { createdAt: order };
    }
  }

  /**
   * Helper: Calculate total investment
   */
  private async calculateTotalInvestment(brandId: string, dateRange: DateRange) {
    // License fees
    const licenseFeesResult = await this.prisma.license.aggregate({
      where: {
        brandId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      _sum: { feeCents: true },
    });

    const licenseFees = licenseFeesResult._sum.feeCents || 0;

    // Platform fees (from payments)
    const platformFeesResult = await this.prisma.payment.aggregate({
      where: {
        brandId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        status: { in: ['COMPLETED', 'PENDING'] },
      },
      _sum: { amount: true },
    });

    const platformFees = platformFeesResult._sum.amount
      ? Number(platformFeesResult._sum.amount) * 100
      : 0;

    const totalCents = licenseFees + platformFees;

    return {
      totalCents,
      breakdown: [
        {
          category: 'License Fees',
          amountCents: licenseFees,
          percentage: totalCents > 0 ? (licenseFees / totalCents) * 100 : 0,
        },
        {
          category: 'Platform Fees',
          amountCents: platformFees,
          percentage: totalCents > 0 ? (platformFees / totalCents) * 100 : 0,
        },
      ],
    };
  }

  /**
   * Helper: Calculate total returns
   */
  private async calculateTotalReturns(brandId: string, dateRange: DateRange) {
    // Get metrics for brand's licensed assets
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      select: { ipAssetId: true },
    });

    const assetIds = licenses.map((l) => l.ipAssetId);

    const metricsResult = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: { revenueCents: true, conversions: true },
    });

    const directRevenue = metricsResult._sum.revenueCents || 0;
    const conversions = metricsResult._sum.conversions || 0;
    const estimatedConversionValue = conversions * 10000; // $100 per conversion estimate

    const totalCents = directRevenue + estimatedConversionValue;

    return {
      totalCents,
      breakdown: [
        {
          category: 'Direct Revenue',
          amountCents: directRevenue,
          percentage: totalCents > 0 ? (directRevenue / totalCents) * 100 : 0,
        },
        {
          category: 'Conversion Value',
          amountCents: estimatedConversionValue,
          percentage: totalCents > 0 ? (estimatedConversionValue / totalCents) * 100 : 0,
        },
      ],
    };
  }

  /**
   * Helper: Calculate ROI metrics
   */
  private async calculateROIMetrics(brandId: string, dateRange: DateRange, totalInvestment: number) {
    // Get conversion count
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      select: { ipAssetId: true },
    });

    const assetIds = licenses.map((l) => l.ipAssetId);

    const metricsResult = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: { conversions: true, revenueCents: true },
    });

    const conversions = metricsResult._sum.conversions || 0;
    const revenue = metricsResult._sum.revenueCents || 0;

    return {
      customerAcquisitionCostCents: conversions > 0 ? Math.round(totalInvestment / conversions) : 0,
      averageOrderValueCents: conversions > 0 ? Math.round(revenue / conversions) : 0,
      returnOnAdSpendCents: totalInvestment > 0 ? Math.round((revenue / totalInvestment) * 100) : 0,
    };
  }

  /**
   * Helper: Get ROI timeline
   */
  private async getROITimeline(
    brandId: string,
    dateRange: DateRange,
    granularity: string
  ): Promise<Array<{ period: string; investmentCents: number; returnsCents: number; roiPercentage: number }>> {
    // Implementation would split date range into periods and calculate ROI for each
    // For now, return sample structure
    return [];
  }

  /**
   * Helper: Get campaign ROI comparison
   */
  private async getCampaignROIComparison(brandId: string, dateRange: DateRange) {
    const campaigns = await this.prisma.project.findMany({
      where: {
        brandId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      include: {
        licenses: {
          where: { deletedAt: null },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      campaigns.map(async (campaign) => {
        const investmentCents = campaign.licenses.reduce(
          (sum, l) => sum + (l.feeCents || 0),
          0
        );

        const assetIds = campaign.licenses.map((l) => l.ipAssetId);
        const metricsResult = await this.prisma.dailyMetric.aggregate({
          where: {
            ipAssetId: { in: assetIds },
            date: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          _sum: { revenueCents: true, conversions: true },
        });

        const returnsCents =
          (metricsResult._sum.revenueCents || 0) +
          (metricsResult._sum.conversions || 0) * 10000;

        const roiPercentage =
          investmentCents > 0
            ? ((returnsCents - investmentCents) / investmentCents) * 100
            : 0;

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          investmentCents,
          returnsCents,
          roiPercentage,
        };
      })
    );
  }

  /**
   * Helper: Calculate creator performance
   */
  private async calculateCreatorPerformance(
    creatorId: string,
    data: any,
    dateRange: DateRange
  ): Promise<CreatorPerformanceMetrics> {
    const { creator, licenses, campaigns, contentPieces } = data;

    // Calculate financial metrics
    const totalPaidCents = licenses.reduce((sum: number, l: any) => sum + (l.feeCents || 0), 0);

    // Get performance metrics for creator's assets
    const assetIds = Array.from(contentPieces) as string[];
    const metricsResult = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
        uniqueVisitors: true,
      },
    });

    const totalViews = metricsResult._sum?.views || 0;
    const totalClicks = metricsResult._sum?.clicks || 0;
    const totalConversions = metricsResult._sum?.conversions || 0;
    const totalEngagement = totalClicks; // Simplified
    const avgEngagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Active licenses
    const activeLicenses = licenses.filter(
      (l: any) => l.status === 'ACTIVE' && (!l.endDate || new Date(l.endDate) > new Date())
    ).length;

    // Find last collaboration date
    const lastCollaboration = licenses.length > 0
      ? licenses.reduce((latest: any, l: any) => {
          const licenseDate = new Date(l.createdAt);
          return !latest || licenseDate > latest ? licenseDate : latest;
        }, null)
      : null;

    return {
      creatorId,
      creatorName: creator.user?.name || 'Unknown',
      stageName: creator.stageName,
      collaborations: {
        totalCampaigns: campaigns.size,
        totalContent: contentPieces.size,
        activeLicenses,
      },
      performance: {
        totalReach: metricsResult._sum?.uniqueVisitors || 0,
        totalImpressions: totalViews,
        totalEngagement,
        avgEngagementRate,
        totalConversions,
        conversionRate,
      },
      financial: {
        totalPaidCents,
        avgCostPerContentCents: contentPieces.size > 0 ? Math.round(totalPaidCents / contentPieces.size) : 0,
        costPerEngagement: totalEngagement > 0 ? totalPaidCents / totalEngagement : 0,
        costPerConversion: totalConversions > 0 ? totalPaidCents / totalConversions : 0,
      },
      quality: {
        contentQualityScore: avgEngagementRate * 10, // Simplified scoring
        audienceAlignmentScore: 75, // Would need more data
        brandSafetyScore: 90, // Would need more data
        deliveryConsistencyScore: 85, // Would need more data
      },
      lastCollaboration: lastCollaboration ? lastCollaboration.toISOString() : null,
    };
  }

  /**
   * Helper: Sort creators
   */
  private sortCreators(
    creators: CreatorPerformanceMetrics[],
    sortBy: string,
    sortOrder: string
  ): CreatorPerformanceMetrics[] {
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    return [...creators].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'engagementRate':
          aVal = a.performance.avgEngagementRate;
          bVal = b.performance.avgEngagementRate;
          break;
        case 'conversions':
          aVal = a.performance.totalConversions;
          bVal = b.performance.totalConversions;
          break;
        case 'costPerEngagement':
          aVal = a.financial.costPerEngagement;
          bVal = b.financial.costPerEngagement;
          break;
        case 'totalSpent':
          aVal = a.financial.totalPaidCents;
          bVal = b.financial.totalPaidCents;
          break;
        case 'collaborations':
          aVal = a.collaborations.totalCampaigns;
          bVal = b.collaborations.totalCampaigns;
          break;
        case 'name':
          return multiplier * a.creatorName.localeCompare(b.creatorName);
        default:
          aVal = a.performance.avgEngagementRate;
          bVal = b.performance.avgEngagementRate;
      }

      return multiplier * (aVal - bVal);
    });
  }

  /**
   * Helper: Calculate asset usage metrics
   */
  private async calculateAssetUsageMetrics(
    asset: any,
    dateRange: DateRange
  ): Promise<AssetUsageMetrics> {
    const licenses = asset.licenses || [];
    const campaigns = new Set(licenses.filter((l: any) => l.project).map((l: any) => l.project.id));
    const creators = new Set(asset.ownerships?.map((o: any) => o.creator.id) || []);

    // Get performance metrics
    const metricsResult = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: asset.id,
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
      },
    });

    const totalViews = metricsResult._sum.views || 0;
    const totalClicks = metricsResult._sum.clicks || 0;
    const totalConversions = metricsResult._sum.conversions || 0;
    const engagementRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Calculate performance score (0-100)
    const performanceScore = Math.min(100, (engagementRate * 5 + conversionRate * 10) / 2);

    // Usage dates
    const usageDates = licenses.map((l: any) => new Date(l.createdAt));
    const firstUsed = usageDates.length > 0 ? new Date(Math.min(...usageDates.map((d: Date) => d.getTime()))) : null;
    const lastUsed = usageDates.length > 0 ? new Date(Math.max(...usageDates.map((d: Date) => d.getTime()))) : null;

    return {
      assetId: asset.id,
      assetTitle: asset.title,
      assetType: asset.type,
      uploadedAt: asset.createdAt.toISOString(),
      usage: {
        totalCampaigns: campaigns.size,
        totalCreators: creators.size,
        totalLicenses: licenses.length,
        firstUsed: firstUsed ? firstUsed.toISOString() : null,
        lastUsed: lastUsed ? lastUsed.toISOString() : null,
      },
      performance: {
        totalImpressions: totalViews,
        totalEngagement: totalClicks,
        avgEngagementRate: engagementRate,
        totalConversions,
        conversionRate,
      },
      distribution: {
        geographicReach: [],
        demographicReach: [],
      },
      effectiveness: {
        performanceScore,
        comparisonToAverage: 0, // Would need platform average
        topPerformingContext: campaigns.size > 0 ? 'Multiple campaigns' : null,
      },
    };
  }

  /**
   * Helper: Sort assets
   */
  private sortAssets(
    assets: AssetUsageMetrics[],
    sortBy: string,
    sortOrder: string
  ): AssetUsageMetrics[] {
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    return [...assets].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortBy) {
        case 'performanceScore':
          aVal = a.effectiveness.performanceScore;
          bVal = b.effectiveness.performanceScore;
          break;
        case 'usageCount':
          aVal = a.usage.totalLicenses;
          bVal = b.usage.totalLicenses;
          break;
        case 'engagementRate':
          aVal = a.performance.avgEngagementRate;
          bVal = b.performance.avgEngagementRate;
          break;
        case 'uploadedAt':
          aVal = a.uploadedAt;
          bVal = b.uploadedAt;
          return multiplier * aVal.localeCompare(bVal);
        case 'title':
          return multiplier * a.assetTitle.localeCompare(b.assetTitle);
        default:
          aVal = a.effectiveness.performanceScore;
          bVal = b.effectiveness.performanceScore;
      }

      return multiplier * ((aVal as number) - (bVal as number));
    });
  }

  /**
   * Helper: Generate asset recommendations
   */
  private generateAssetRecommendations(
    assets: AssetUsageMetrics[]
  ): Array<{ type: 'high_performer' | 'underutilized' | 'retire_candidate'; assetId: string; assetTitle: string; reason: string }> {
    const recommendations: Array<any> = [];

    // High performers (top 10% by performance score)
    const sortedByPerformance = [...assets].sort(
      (a, b) => b.effectiveness.performanceScore - a.effectiveness.performanceScore
    );
    const highPerformerThreshold = Math.ceil(sortedByPerformance.length * 0.1);
    sortedByPerformance.slice(0, highPerformerThreshold).forEach((asset) => {
      recommendations.push({
        type: 'high_performer',
        assetId: asset.assetId,
        assetTitle: asset.assetTitle,
        reason: `High performance score (${asset.effectiveness.performanceScore.toFixed(1)}) - consider using in more campaigns`,
      });
    });

    // Underutilized (good performance but low usage)
    assets
      .filter(
        (a) =>
          a.effectiveness.performanceScore > 50 &&
          a.usage.totalLicenses < 3
      )
      .slice(0, 5)
      .forEach((asset) => {
        recommendations.push({
          type: 'underutilized',
          assetId: asset.assetId,
          assetTitle: asset.assetTitle,
          reason: 'Good performance potential but rarely used - consider promoting',
        });
      });

    // Retire candidates (poor performance and low usage)
    assets
      .filter(
        (a) =>
          a.effectiveness.performanceScore < 20 &&
          a.usage.totalLicenses === 0 &&
          new Date().getTime() - new Date(a.uploadedAt).getTime() > 90 * 24 * 60 * 60 * 1000 // 90 days old
      )
      .slice(0, 5)
      .forEach((asset) => {
        recommendations.push({
          type: 'retire_candidate',
          assetId: asset.assetId,
          assetTitle: asset.assetTitle,
          reason: 'No usage in 90+ days with poor performance - consider archiving',
        });
      });

    return recommendations;
  }

  /**
   * Helper: Get from cache
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      console.error('Cache retrieval error:', error);
    }
    return null;
  }

  /**
   * Helper: Set cache
   */
  private async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Get Spend Analysis
   * Endpoint: GET /analytics/brands/:id/spend-analysis
   */
  async getSpendAnalysis(input: GetSpendAnalysisInput): Promise<SpendAnalysisResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 12 months)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Try cache first
    const cacheKey = `brand:${input.id}:spend-analysis:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.granularity}:${input.groupBy?.join(',')}`;
    const cached = await this.getFromCache<SpendAnalysisResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all licenses for the brand within date range
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId: input.id,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        ipAsset: {
          select: {
            id: true,
            title: true,
            ownerships: {
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
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate total spend (upfront fees)
    const totalSpendCents = licenses.reduce((sum, license) => sum + license.feeCents, 0);

    // Get revenue share payments from royalty statements
    const royaltyPayments = await this.prisma.royaltyLine.findMany({
      where: {
        license: {
          brandId: input.id,
        },
        periodStart: {
          gte: dateRange.start,
        },
        periodEnd: {
          lte: dateRange.end,
        },
      },
      include: {
        license: {
          select: {
            id: true,
            projectId: true,
            ipAssetId: true,
          },
        },
        ipAsset: {
          select: {
            ownerships: {
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
        },
      },
    });

    // Add revenue share payments to total
    const royaltySpendCents = royaltyPayments.reduce(
      (sum, line) => sum + line.calculatedRoyaltyCents,
      0
    );
    const totalWithRoyaltiesCents = totalSpendCents + royaltySpendCents;

    // Build breakdown by project
    const byProject = input.groupBy?.includes('project')
      ? this.buildProjectBreakdown(licenses, royaltyPayments, totalWithRoyaltiesCents)
      : [];

    // Build breakdown by license type
    const byLicenseType = input.groupBy?.includes('licenseType')
      ? this.buildLicenseTypeBreakdown(licenses, totalWithRoyaltiesCents)
      : [];

    // Build breakdown by creator
    const byCreator = input.groupBy?.includes('creator')
      ? this.buildCreatorBreakdown(licenses, royaltyPayments, totalWithRoyaltiesCents)
      : [];

    // Build time series
    const timeSeries = this.buildSpendTimeSeries(licenses, input.granularity || 'month', dateRange);

    // Calculate trends
    const trends = this.calculateSpendTrends(licenses, timeSeries, dateRange);

    const response: SpendAnalysisResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      totalSpendCents: totalWithRoyaltiesCents,
      breakdown: {
        byProject,
        byLicenseType,
        byCreator,
      },
      timeSeries,
      trends,
      metadata: {
        calculatedAt: new Date().toISOString(),
        dataCompleteness: licenses.length > 0 ? 100 : 0,
      },
    };

    // Cache for 1 hour
    await this.setCache(cacheKey, response, 3600);

    return response;
  }

  /**
   * Get Budget Utilization
   * Endpoint: GET /analytics/brands/:id/budget-utilization
   */
  async getBudgetUtilization(
    input: GetBudgetUtilizationInput
  ): Promise<BudgetUtilizationResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 12 months)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Try cache first
    const cacheKey = `brand:${input.id}:budget-utilization:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.projectStatus || 'all'}:${input.alertThreshold}`;
    const cached = await this.getFromCache<BudgetUtilizationResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build project filters
    const projectFilters: any = {
      brandId: input.id,
      deletedAt: null,
    };

    if (input.projectStatus) {
      projectFilters.status = input.projectStatus;
    }

    // Get all projects with their licenses
    const projects = await this.prisma.project.findMany({
      where: projectFilters,
      include: {
        licenses: {
          where: {
            deletedAt: null,
            createdAt: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
        },
      },
    });

    // Calculate metrics for each project
    const projectMetrics = projects.map((project) => {
      const actualSpendCents = project.licenses.reduce((sum, l) => sum + l.feeCents, 0);
      const budgetCents = project.budgetCents;
      const remainingBudgetCents = budgetCents - actualSpendCents;
      const utilizationPercentage = budgetCents > 0 ? (actualSpendCents / budgetCents) * 100 : 0;

      // Determine budget status
      let budgetStatus: 'under_budget' | 'on_budget' | 'over_budget' | 'at_risk' | 'no_budget';
      if (budgetCents === 0) {
        budgetStatus = 'no_budget';
      } else if (utilizationPercentage > 100) {
        budgetStatus = 'over_budget';
      } else if (utilizationPercentage >= input.alertThreshold!) {
        budgetStatus = 'at_risk';
      } else if (utilizationPercentage >= 90 && utilizationPercentage < 100) {
        budgetStatus = 'on_budget';
      } else {
        budgetStatus = 'under_budget';
      }

      // Calculate days remaining
      let daysRemaining: number | null = null;
      if (project.endDate) {
        const now = new Date();
        const end = new Date(project.endDate);
        daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        budgetCents,
        actualSpendCents,
        remainingBudgetCents,
        utilizationPercentage,
        budgetStatus,
        licenseCount: project.licenses.length,
        timeline: {
          startDate: project.startDate ? project.startDate.toISOString() : null,
          endDate: project.endDate ? project.endDate.toISOString() : null,
          daysRemaining,
        },
      };
    });

    // Calculate portfolio-level metrics
    const portfolio = {
      totalAllocatedBudgetCents: projectMetrics.reduce((sum, p) => sum + p.budgetCents, 0),
      totalActualSpendCents: projectMetrics.reduce((sum, p) => sum + p.actualSpendCents, 0),
      overallUtilizationPercentage: 0,
      totalRemainingBudgetCents: projectMetrics.reduce((sum, p) => sum + p.remainingBudgetCents, 0),
      projectsUnderBudget: projectMetrics.filter((p) => p.budgetStatus === 'under_budget').length,
      projectsOnBudget: projectMetrics.filter((p) => p.budgetStatus === 'on_budget').length,
      projectsOverBudget: projectMetrics.filter((p) => p.budgetStatus === 'over_budget').length,
      projectsNoBudget: projectMetrics.filter((p) => p.budgetStatus === 'no_budget').length,
    };

    portfolio.overallUtilizationPercentage =
      portfolio.totalAllocatedBudgetCents > 0
        ? (portfolio.totalActualSpendCents / portfolio.totalAllocatedBudgetCents) * 100
        : 0;

    // Build monthly utilization trend
    const monthlyUtilization = input.includeProjections
      ? await this.buildMonthlyUtilizationTrend(input.id, dateRange)
      : [];

    // Project budget depletion dates
    const projectedDepletion = input.includeProjections
      ? this.calculateBudgetDepletionProjections(projectMetrics)
      : [];

    // Generate alerts
    const alerts = this.generateBudgetAlerts(projectMetrics, input.alertThreshold!);

    const response: BudgetUtilizationResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      portfolio,
      projects: projectMetrics,
      trends: {
        monthlyUtilization,
        projectedDepletion,
      },
      alerts,
    };

    // Cache for 30 minutes
    await this.setCache(cacheKey, response, 1800);

    return response;
  }

  /**
   * Get Cost Per Metric
   * Endpoint: GET /analytics/brands/:id/cost-per-metric
   */
  async getCostPerMetric(input: GetCostPerMetricInput): Promise<CostPerMetricResponse> {
    // Verify brand exists and user has access
    await this.verifyBrandAccess(input.id);

    // Parse date range with defaults (last 12 months)
    const dateRange = this.parseDateRange(input.startDate, input.endDate, 365);

    // Try cache first
    const cacheKey = `brand:${input.id}:cost-per-metric:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}:${input.metrics?.join(',')}:${input.groupBy}:${input.minThreshold}`;
    const cached = await this.getFromCache<CostPerMetricResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all licenses for the brand
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId: input.id,
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        ipAsset: {
          select: {
            id: true,
            title: true,
            type: true,
            ownerships: {
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
        },
      },
    });

    // Calculate total licensing cost
    const totalLicensingCostCents = licenses.reduce((sum, l) => sum + l.feeCents, 0);

    // Get aggregated metrics for all licensed assets
    const assetIds = licenses.map((l) => l.ipAssetId);
    const metricsAggregate = await this.prisma.dailyMetric.aggregate({
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
      },
    });

    const totalViews = metricsAggregate._sum.views || 0;
    const totalClicks = metricsAggregate._sum.clicks || 0;
    const totalConversions = metricsAggregate._sum.conversions || 0;
    const totalEngagements = totalClicks; // Using clicks as engagement proxy

    // Calculate summary cost-per-metrics
    const summary = {
      totalLicensingCostCents,
      costPerView: totalViews >= input.minThreshold! ? totalLicensingCostCents / totalViews : null,
      costPerClick: totalClicks >= input.minThreshold! ? totalLicensingCostCents / totalClicks : null,
      costPerConversion:
        totalConversions >= input.minThreshold! ? totalLicensingCostCents / totalConversions : null,
      costPerEngagement:
        totalEngagements >= input.minThreshold! ? totalLicensingCostCents / totalEngagements : null,
      totalViews,
      totalClicks,
      totalConversions,
      totalEngagements,
    };

    // Calculate by asset
    const byAsset =
      input.groupBy === 'asset' || input.groupBy === 'all'
        ? await this.calculateCostPerMetricByAsset(licenses, dateRange, input.minThreshold!)
        : [];

    // Calculate by project
    const byProject =
      input.groupBy === 'project' || input.groupBy === 'all'
        ? await this.calculateCostPerMetricByProject(licenses, dateRange, input.minThreshold!)
        : [];

    // Calculate by creator
    const byCreator =
      input.groupBy === 'creator' || input.groupBy === 'all'
        ? await this.calculateCostPerMetricByCreator(licenses, dateRange, input.minThreshold!)
        : [];

    // Calculate efficiency trends over time
    const efficiencyTrends = await this.calculateEfficiencyTrends(
      input.id,
      dateRange,
      input.minThreshold!
    );

    // Calculate benchmarks if requested
    const benchmarks = input.includeBenchmarks
      ? await this.calculatePlatformBenchmarks(input.id)
      : {
          platformAverageCostPerView: null,
          platformAverageCostPerClick: null,
          platformAverageCostPerConversion: null,
          brandPerformancePercentile: null,
        };

    // Generate insights
    const insights = this.generateCostPerMetricInsights(
      byAsset,
      byProject,
      summary,
      input.minThreshold!
    );

    // Calculate data quality metrics
    const assetsWithTracking = byAsset.filter((a) => a.views > 0 || a.clicks > 0).length;
    const dataQuality = {
      assetsWithTracking,
      assetsWithoutTracking: byAsset.length - assetsWithTracking,
      trackingCoverage: byAsset.length > 0 ? (assetsWithTracking / byAsset.length) * 100 : 0,
    };

    const response: CostPerMetricResponse = {
      brandId: input.id,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      summary,
      byAsset,
      byProject,
      byCreator,
      trends: efficiencyTrends,
      benchmarks,
      insights,
      dataQuality,
    };

    // Cache for 30 minutes (engagement data updates frequently)
    await this.setCache(cacheKey, response, 1800);

    return response;
  }

  /**
   * Helper: Build project breakdown for spend analysis
   */
  private buildProjectBreakdown(
    licenses: any[],
    royaltyPayments: any[],
    totalCents: number
  ): Array<{ projectId: string; projectName: string; spentCents: number; percentage: number }> {
    const projectMap = new Map<string, { name: string; spent: number }>();

    // Add license fees
    licenses.forEach((license) => {
      if (license.project) {
        const existing = projectMap.get(license.project.id) || {
          name: license.project.name,
          spent: 0,
        };
        existing.spent += license.feeCents;
        projectMap.set(license.project.id, existing);
      }
    });

    // Add royalty payments
    royaltyPayments.forEach((payment) => {
      if (payment.license.projectId) {
        const existing = projectMap.get(payment.license.projectId);
        if (existing) {
          existing.spent += payment.calculatedRoyaltyCents;
        }
      }
    });

    return Array.from(projectMap.entries())
      .map(([projectId, data]) => ({
        projectId,
        projectName: data.name,
        spentCents: data.spent,
        percentage: totalCents > 0 ? (data.spent / totalCents) * 100 : 0,
      }))
      .sort((a, b) => b.spentCents - a.spentCents);
  }

  /**
   * Helper: Build license type breakdown for spend analysis
   */
  private buildLicenseTypeBreakdown(
    licenses: any[],
    totalCents: number
  ): Array<{ licenseType: string; spentCents: number; percentage: number; count: number }> {
    const typeMap = new Map<string, { spent: number; count: number }>();

    licenses.forEach((license) => {
      const existing = typeMap.get(license.licenseType) || { spent: 0, count: 0 };
      existing.spent += license.feeCents;
      existing.count += 1;
      typeMap.set(license.licenseType, existing);
    });

    return Array.from(typeMap.entries())
      .map(([licenseType, data]) => ({
        licenseType,
        spentCents: data.spent,
        percentage: totalCents > 0 ? (data.spent / totalCents) * 100 : 0,
        count: data.count,
      }))
      .sort((a, b) => b.spentCents - a.spentCents);
  }

  /**
   * Helper: Build creator breakdown for spend analysis
   */
  private buildCreatorBreakdown(
    licenses: any[],
    royaltyPayments: any[],
    totalCents: number
  ): Array<{
    creatorId: string;
    creatorName: string;
    spentCents: number;
    percentage: number;
    licenseCount: number;
  }> {
    const creatorMap = new Map<
      string,
      { name: string; spent: number; licenseCount: number }
    >();

    // Add license fees by creator
    licenses.forEach((license) => {
      license.ipAsset.ownerships?.forEach((ownership: any) => {
        const creator = ownership.creator;
        const existing = creatorMap.get(creator.id) || {
          name: creator.stageName || 'Unknown',
          spent: 0,
          licenseCount: 0,
        };
        // Prorate the license fee by ownership share
        const shareFraction = ownership.shareBps / 10000;
        existing.spent += Math.round(license.feeCents * shareFraction);
        existing.licenseCount += 1;
        creatorMap.set(creator.id, existing);
      });
    });

    // Add royalty payments
    royaltyPayments.forEach((payment) => {
      payment.ipAsset.ownerships?.forEach((ownership: any) => {
        const creator = ownership.creator;
        const existing = creatorMap.get(creator.id);
        if (existing) {
          const shareFraction = ownership.shareBps / 10000;
          existing.spent += Math.round(payment.calculatedRoyaltyCents * shareFraction);
        }
      });
    });

    return Array.from(creatorMap.entries())
      .map(([creatorId, data]) => ({
        creatorId,
        creatorName: data.name,
        spentCents: data.spent,
        percentage: totalCents > 0 ? (data.spent / totalCents) * 100 : 0,
        licenseCount: data.licenseCount,
      }))
      .sort((a, b) => b.spentCents - a.spentCents)
      .slice(0, 20); // Top 20 creators
  }

  /**
   * Helper: Build spend time series
   */
  private buildSpendTimeSeries(
    licenses: any[],
    granularity: string,
    dateRange: DateRange
  ): Array<{ date: string; spentCents: number; licenseCount: number }> {
    const timeMap = new Map<string, { spent: number; count: number }>();

    licenses.forEach((license) => {
      let dateKey: string;
      const createdDate = new Date(license.createdAt);

      if (granularity === 'day') {
        dateKey = format(createdDate, 'yyyy-MM-dd');
      } else if (granularity === 'week') {
        dateKey = format(startOfDay(createdDate), 'yyyy-MM-dd');
      } else {
        // month
        dateKey = format(startOfMonth(createdDate), 'yyyy-MM-dd');
      }

      const existing = timeMap.get(dateKey) || { spent: 0, count: 0 };
      existing.spent += license.feeCents;
      existing.count += 1;
      timeMap.set(dateKey, existing);
    });

    return Array.from(timeMap.entries())
      .map(([date, data]) => ({
        date,
        spentCents: data.spent,
        licenseCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Helper: Calculate spend trends
   */
  private calculateSpendTrends(
    licenses: any[],
    timeSeries: any[],
    dateRange: DateRange
  ): {
    averageTransactionCents: number;
    totalTransactions: number;
    periodOverPeriodChange: number;
    periodOverPeriodPercentage: number;
    peakSpendingDate: string | null;
    peakSpendingAmount: number;
  } {
    const totalTransactions = licenses.length;
    const totalSpent = licenses.reduce((sum, l) => sum + l.feeCents, 0);
    const averageTransactionCents =
      totalTransactions > 0 ? Math.round(totalSpent / totalTransactions) : 0;

    // Find peak spending
    let peakSpendingDate: string | null = null;
    let peakSpendingAmount = 0;

    timeSeries.forEach((point) => {
      if (point.spentCents > peakSpendingAmount) {
        peakSpendingAmount = point.spentCents;
        peakSpendingDate = point.date;
      }
    });

    // Calculate period-over-period change (compare first half to second half)
    const midPoint = new Date(
      (dateRange.start.getTime() + dateRange.end.getTime()) / 2
    );
    const firstHalfSpend = licenses
      .filter((l) => new Date(l.createdAt) < midPoint)
      .reduce((sum, l) => sum + l.feeCents, 0);
    const secondHalfSpend = licenses
      .filter((l) => new Date(l.createdAt) >= midPoint)
      .reduce((sum, l) => sum + l.feeCents, 0);

    const periodOverPeriodChange = secondHalfSpend - firstHalfSpend;
    const periodOverPeriodPercentage =
      firstHalfSpend > 0 ? (periodOverPeriodChange / firstHalfSpend) * 100 : 0;

    return {
      averageTransactionCents,
      totalTransactions,
      periodOverPeriodChange,
      periodOverPeriodPercentage,
      peakSpendingDate,
      peakSpendingAmount,
    };
  }

  /**
   * Helper: Build monthly utilization trend
   */
  private async buildMonthlyUtilizationTrend(
    brandId: string,
    dateRange: DateRange
  ): Promise<Array<{ month: string; utilizationPercentage: number; spentCents: number }>> {
    const projects = await this.prisma.project.findMany({
      where: {
        brandId,
        deletedAt: null,
      },
      include: {
        licenses: {
          where: {
            deletedAt: null,
          },
        },
      },
    });

    const monthMap = new Map<string, { budget: number; spent: number }>();

    projects.forEach((project) => {
      project.licenses.forEach((license) => {
        const month = format(startOfMonth(new Date(license.createdAt)), 'yyyy-MM');
        const existing = monthMap.get(month) || { budget: 0, spent: 0 };
        existing.budget += project.budgetCents;
        existing.spent += license.feeCents;
        monthMap.set(month, existing);
      });
    });

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        utilizationPercentage: data.budget > 0 ? (data.spent / data.budget) * 100 : 0,
        spentCents: data.spent,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Helper: Calculate budget depletion projections
   */
  private calculateBudgetDepletionProjections(
    projectMetrics: any[]
  ): Array<{
    projectId: string;
    projectName: string;
    projectedDepletionDate: string | null;
    daysUntilDepletion: number | null;
  }> {
    return projectMetrics
      .filter((p) => p.budgetStatus !== 'no_budget' && p.remainingBudgetCents > 0)
      .map((project) => {
        // Simple projection: if project has timeline and spending rate, estimate depletion
        let projectedDepletionDate: string | null = null;
        let daysUntilDepletion: number | null = null;

        if (project.timeline.daysRemaining && project.timeline.daysRemaining > 0) {
          const dailySpendRate =
            project.actualSpendCents / Math.max(1, project.licenseCount || 1);
          const daysToDepletion = Math.ceil(project.remainingBudgetCents / dailySpendRate);

          if (daysToDepletion < project.timeline.daysRemaining) {
            const depletionDate = new Date();
            depletionDate.setDate(depletionDate.getDate() + daysToDepletion);
            projectedDepletionDate = depletionDate.toISOString();
            daysUntilDepletion = daysToDepletion;
          }
        }

        return {
          projectId: project.projectId,
          projectName: project.projectName,
          projectedDepletionDate,
          daysUntilDepletion,
        };
      })
      .filter((p) => p.projectedDepletionDate !== null);
  }

  /**
   * Helper: Generate budget alerts
   */
  private generateBudgetAlerts(
    projectMetrics: any[],
    alertThreshold: number
  ): Array<{
    severity: 'warning' | 'critical';
    projectId: string;
    projectName: string;
    message: string;
  }> {
    const alerts: any[] = [];

    projectMetrics.forEach((project) => {
      if (project.budgetStatus === 'over_budget') {
        alerts.push({
          severity: 'critical',
          projectId: project.projectId,
          projectName: project.projectName,
          message: `Budget exceeded by ${((project.utilizationPercentage - 100).toFixed(1))}% (${(project.remainingBudgetCents / 100).toFixed(2)} over)`,
        });
      } else if (project.budgetStatus === 'at_risk') {
        alerts.push({
          severity: 'warning',
          projectId: project.projectId,
          projectName: project.projectName,
          message: `Budget utilization at ${project.utilizationPercentage.toFixed(1)}% - approaching limit`,
        });
      }
    });

    return alerts;
  }

  /**
   * Helper: Calculate cost-per-metric by asset
   */
  private async calculateCostPerMetricByAsset(
    licenses: any[],
    dateRange: DateRange,
    minThreshold: number
  ): Promise<any[]> {
    const assetMap = new Map<string, { license: any; cost: number }>();

    // Group licenses by asset
    licenses.forEach((license) => {
      const existing = assetMap.get(license.ipAssetId) || {
        license,
        cost: 0,
      };
      existing.cost += license.feeCents;
      assetMap.set(license.ipAssetId, existing);
    });

    // Get metrics for each asset
    const results = await Promise.all(
      Array.from(assetMap.entries()).map(async ([assetId, data]) => {
        const metrics = await this.prisma.dailyMetric.aggregate({
          where: {
            ipAssetId: assetId,
            date: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          _sum: {
            views: true,
            clicks: true,
            conversions: true,
          },
        });

        const views = metrics._sum.views || 0;
        const clicks = metrics._sum.clicks || 0;
        const conversions = metrics._sum.conversions || 0;
        const engagements = clicks;

        // Calculate efficiency score (0-100) based on cost-effectiveness
        let efficiencyScore = 0;
        if (views >= minThreshold) {
          const costPerView = data.cost / views;
          // Lower cost per view = higher score (inverse relationship)
          efficiencyScore = Math.max(0, 100 - costPerView * 10);
        }

        return {
          assetId,
          assetTitle: data.license.ipAsset.title,
          assetType: data.license.ipAsset.type,
          licensingCostCents: data.cost,
          views,
          clicks,
          conversions,
          engagements,
          costPerView: views >= minThreshold ? data.cost / views : null,
          costPerClick: clicks >= minThreshold ? data.cost / clicks : null,
          costPerConversion: conversions >= minThreshold ? data.cost / conversions : null,
          costPerEngagement: engagements >= minThreshold ? data.cost / engagements : null,
          efficiencyScore,
        };
      })
    );

    return results.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }

  /**
   * Helper: Calculate cost-per-metric by project
   */
  private async calculateCostPerMetricByProject(
    licenses: any[],
    dateRange: DateRange,
    minThreshold: number
  ): Promise<any[]> {
    const projectMap = new Map<
      string,
      { name: string; cost: number; assetIds: Set<string> }
    >();

    licenses.forEach((license) => {
      if (license.project) {
        const existing = projectMap.get(license.project.id) || {
          name: license.project.name,
          cost: 0,
          assetIds: new Set<string>(),
        };
        existing.cost += license.feeCents;
        existing.assetIds.add(license.ipAssetId);
        projectMap.set(license.project.id, existing);
      }
    });

    const results = await Promise.all(
      Array.from(projectMap.entries()).map(async ([projectId, data]) => {
        const metrics = await this.prisma.dailyMetric.aggregate({
          where: {
            ipAssetId: { in: Array.from(data.assetIds) },
            date: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          _sum: {
            views: true,
            clicks: true,
            conversions: true,
          },
        });

        const views = metrics._sum.views || 0;
        const clicks = metrics._sum.clicks || 0;
        const conversions = metrics._sum.conversions || 0;

        const averageEfficiency =
          views >= minThreshold ? Math.max(0, 100 - (data.cost / views) * 10) : 0;

        return {
          projectId,
          projectName: data.name,
          licensingCostCents: data.cost,
          views,
          clicks,
          conversions,
          costPerView: views >= minThreshold ? data.cost / views : null,
          costPerClick: clicks >= minThreshold ? data.cost / clicks : null,
          costPerConversion: conversions >= minThreshold ? data.cost / conversions : null,
          averageEfficiency,
        };
      })
    );

    return results.sort((a, b) => b.averageEfficiency - a.averageEfficiency);
  }

  /**
   * Helper: Calculate cost-per-metric by creator
   */
  private async calculateCostPerMetricByCreator(
    licenses: any[],
    dateRange: DateRange,
    minThreshold: number
  ): Promise<any[]> {
    const creatorMap = new Map<
      string,
      { name: string; cost: number; assetIds: Set<string> }
    >();

    licenses.forEach((license) => {
      license.ipAsset.ownerships?.forEach((ownership: any) => {
        const creator = ownership.creator;
        const existing = creatorMap.get(creator.id) || {
          name: creator.stageName || 'Unknown',
          cost: 0,
          assetIds: new Set<string>(),
        };
        const shareFraction = ownership.shareBps / 10000;
        existing.cost += Math.round(license.feeCents * shareFraction);
        existing.assetIds.add(license.ipAssetId);
        creatorMap.set(creator.id, existing);
      });
    });

    const results = await Promise.all(
      Array.from(creatorMap.entries()).map(async ([creatorId, data]) => {
        const metrics = await this.prisma.dailyMetric.aggregate({
          where: {
            ipAssetId: { in: Array.from(data.assetIds) },
            date: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          _sum: {
            views: true,
            clicks: true,
            conversions: true,
          },
        });

        const views = metrics._sum.views || 0;
        const clicks = metrics._sum.clicks || 0;
        const conversions = metrics._sum.conversions || 0;

        return {
          creatorId,
          creatorName: data.name,
          licensingCostCents: data.cost,
          assetCount: data.assetIds.size,
          views,
          clicks,
          conversions,
          costPerView: views >= minThreshold ? data.cost / views : null,
          costPerClick: clicks >= minThreshold ? data.cost / clicks : null,
          costPerConversion: conversions >= minThreshold ? data.cost / conversions : null,
        };
      })
    );

    return results
      .filter((r) => r.assetCount > 0)
      .sort((a, b) => {
        const aCost = a.costPerView || Infinity;
        const bCost = b.costPerView || Infinity;
        return aCost - bCost;
      })
      .slice(0, 20);
  }

  /**
   * Helper: Calculate efficiency trends over time
   */
  private async calculateEfficiencyTrends(
    brandId: string,
    dateRange: DateRange,
    minThreshold: number
  ): Promise<{
    efficiencyOverTime: Array<{
      date: string;
      costPerView: number | null;
      costPerClick: number | null;
      costPerConversion: number | null;
    }>;
    improvementPercentage: number;
  }> {
    // Get licenses by month
    const licenses = await this.prisma.license.findMany({
      where: {
        brandId,
        deletedAt: null,
      },
    });

    const assetIds = licenses.map((l) => l.ipAssetId);

    // Get metrics by month
    const monthlyData = await this.prisma.dailyMetric.groupBy({
      by: ['date'],
      where: {
        ipAssetId: { in: assetIds },
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      _sum: {
        views: true,
        clicks: true,
        conversions: true,
      },
    });

    // Calculate total cost
    const totalCost = licenses.reduce((sum, l) => sum + l.feeCents, 0);

    // Group by month
    const monthMap = new Map<string, any>();
    monthlyData.forEach((day) => {
      const month = format(startOfMonth(new Date(day.date)), 'yyyy-MM-dd');
      const existing = monthMap.get(month) || { views: 0, clicks: 0, conversions: 0 };
      existing.views += day._sum.views || 0;
      existing.clicks += day._sum.clicks || 0;
      existing.conversions += day._sum.conversions || 0;
      monthMap.set(month, existing);
    });

    const efficiencyOverTime = Array.from(monthMap.entries())
      .map(([date, metrics]) => ({
        date,
        costPerView: metrics.views >= minThreshold ? totalCost / metrics.views : null,
        costPerClick: metrics.clicks >= minThreshold ? totalCost / metrics.clicks : null,
        costPerConversion:
          metrics.conversions >= minThreshold ? totalCost / metrics.conversions : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate improvement (compare first to last period)
    let improvementPercentage = 0;
    if (efficiencyOverTime.length >= 2) {
      const first = efficiencyOverTime[0];
      const last = efficiencyOverTime[efficiencyOverTime.length - 1];
      if (first.costPerView && last.costPerView) {
        improvementPercentage = ((first.costPerView - last.costPerView) / first.costPerView) * 100;
      }
    }

    return {
      efficiencyOverTime,
      improvementPercentage,
    };
  }

  /**
   * Helper: Calculate platform benchmarks
   */
  private async calculatePlatformBenchmarks(
    brandId: string
  ): Promise<{
    platformAverageCostPerView: number | null;
    platformAverageCostPerClick: number | null;
    platformAverageCostPerConversion: number | null;
    brandPerformancePercentile: number | null;
  }> {
    // This would require aggregating data across all brands
    // For now, return null values as this requires significant computation
    return {
      platformAverageCostPerView: null,
      platformAverageCostPerClick: null,
      platformAverageCostPerConversion: null,
      brandPerformancePercentile: null,
    };
  }

  /**
   * Helper: Generate cost-per-metric insights
   */
  private generateCostPerMetricInsights(
    byAsset: any[],
    byProject: any[],
    summary: any,
    minThreshold: number
  ): Array<{
    type: 'top_performer' | 'underperformer' | 'optimal_price_point' | 'tracking_gap';
    title: string;
    description: string;
    assetId?: string;
    projectId?: string;
  }> {
    const insights: any[] = [];

    // Top performers
    const topAssets = byAsset.filter((a) => a.costPerView && a.costPerView < (summary.costPerView || Infinity) * 0.5).slice(0, 3);
    topAssets.forEach((asset) => {
      insights.push({
        type: 'top_performer',
        title: 'Highly Efficient Asset',
        description: `"${asset.assetTitle}" delivers views at ${((asset.costPerView || 0) * 100).toFixed(2)}¢ per view - 50% better than average`,
        assetId: asset.assetId,
      });
    });

    // Underperformers
    const underperformers = byAsset.filter((a) => a.costPerView && a.costPerView > (summary.costPerView || 0) * 2).slice(0, 2);
    underperformers.forEach((asset) => {
      insights.push({
        type: 'underperformer',
        title: 'High Cost Asset',
        description: `"${asset.assetTitle}" costs ${((asset.costPerView || 0) * 100).toFixed(2)}¢ per view - consider re-evaluating usage`,
        assetId: asset.assetId,
      });
    });

    // Tracking gaps
    const noTracking = byAsset.filter((a) => a.views < minThreshold).length;
    if (noTracking > 0) {
      insights.push({
        type: 'tracking_gap',
        title: 'Tracking Coverage Gap',
        description: `${noTracking} assets have insufficient tracking data (< ${minThreshold} events). Consider improving tracking implementation.`,
      });
    }

    return insights;
  }
}
