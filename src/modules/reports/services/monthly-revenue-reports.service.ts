/**
 * Monthly Revenue Reports Service
 * 
 * Generates comprehensive monthly revenue reports aggregating platform-wide revenue data
 * by month, breaking down income streams by source, user type, and transaction category.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfMonth, endOfMonth, subMonths, format, differenceInDays } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface MonthlyRevenueReportData {
  reportMonth: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: {
    grossRevenueCents: number;
    netRevenueCents: number;
    refundsChargebacksCents: number;
    platformFeesCents: number;
    processingFeesCents: number;
    monthOverMonthGrowthPercent: number;
  };
  revenueBySource: {
    licenseFees: number;
    revenuShare: number;
    subscriptions: number;
    other: number;
  };
  revenueByUserType: {
    verifiedCreators: number;
    unverifiedCreators: number;
    enterpriseBrands: number;
    standardBrands: number;
  };
  revenueByCategory: {
    image: number;
    video: number;
    audio: number;
    document: number;
    other: number;
  };
  geographicBreakdown: Array<{
    country: string;
    revenueCents: number;
    percentage: number;
  }>;
  paymentMethods: Array<{
    method: string;
    transactionCount: number;
    revenueCents: number;
  }>;
  topBrands: Array<{
    brandId: string;
    brandName: string;
    revenueCents: number;
    transactionCount: number;
  }>;
  topCreators: Array<{
    creatorId: string;
    creatorName: string;
    earnedCents: number;
    licensesCount: number;
  }>;
  metrics: {
    averageTransactionValue: number;
    transactionCount: number;
    uniqueBrands: number;
    uniqueCreators: number;
    conversionRate: number;
  };
}

export class MonthlyRevenueReportsService {
  private readonly cacheKeyPrefix = 'monthly_revenue_report';
  private readonly cacheTTL = 3600; // 1 hour cache for current month, longer for historical

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive monthly revenue report
   */
  async generateMonthlyRevenueReport(
    year: number,
    month: number // 1-12
  ): Promise<MonthlyRevenueReportData> {
    const reportDate = new Date(year, month - 1, 1);
    const periodStart = startOfMonth(reportDate);
    const periodEnd = endOfMonth(reportDate);
    const isCurrentMonth = format(reportDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM');
    
    // Check cache for historical months (they don't change)
    if (!isCurrentMonth) {
      const cacheKey = `${this.cacheKeyPrefix}:${year}-${month}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const [
      revenueData,
      previousMonthData,
      geographicData,
      userTypeData,
      categoryData,
      topPerformers,
      paymentMethodData
    ] = await Promise.all([
      this.getBaseRevenueData(periodStart, periodEnd),
      this.getPreviousMonthRevenue(year, month),
      this.getGeographicBreakdown(periodStart, periodEnd),
      this.getRevenueByUserType(periodStart, periodEnd),
      this.getRevenueByCategoryType(periodStart, periodEnd),
      this.getTopPerformers(periodStart, periodEnd),
      this.getPaymentMethodBreakdown(periodStart, periodEnd)
    ]);

    const monthOverMonthGrowth = previousMonthData > 0 
      ? ((revenueData.grossRevenueCents - previousMonthData) / previousMonthData) * 100
      : 0;

    const report: MonthlyRevenueReportData = {
      reportMonth: format(reportDate, 'MMMM yyyy'),
      period: {
        startDate: periodStart,
        endDate: periodEnd,
      },
      summary: {
        grossRevenueCents: revenueData.grossRevenueCents,
        netRevenueCents: revenueData.netRevenueCents,
        refundsChargebacksCents: revenueData.refundsChargebacksCents,
        platformFeesCents: revenueData.platformFeesCents,
        processingFeesCents: revenueData.processingFeesCents,
        monthOverMonthGrowthPercent: Math.round(monthOverMonthGrowth * 100) / 100,
      },
      revenueBySource: revenueData.bySource,
      revenueByUserType: userTypeData,
      revenueByCategory: categoryData,
      geographicBreakdown: geographicData,
      paymentMethods: paymentMethodData,
      topBrands: topPerformers.brands,
      topCreators: topPerformers.creators,
      metrics: {
        averageTransactionValue: revenueData.transactionCount > 0 
          ? Math.round(revenueData.grossRevenueCents / revenueData.transactionCount)
          : 0,
        transactionCount: revenueData.transactionCount,
        uniqueBrands: revenueData.uniqueBrands,
        uniqueCreators: revenueData.uniqueCreators,
        conversionRate: 0 // TODO: Calculate based on license creation to payment completion
      }
    };

    // Cache historical months permanently, current month for 1 hour
    const cacheTTL = isCurrentMonth ? this.cacheTTL : 86400 * 30; // 30 days for historical
    const cacheKey = `${this.cacheKeyPrefix}:${year}-${month}`;
    await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(report));

    return report;
  }

  /**
   * Get base revenue aggregations for the period
   */
  private async getBaseRevenueData(startDate: Date, endDate: Date) {
    // License fees revenue
    const licenseRevenue = await this.prisma.license.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] },
        feeCents: { gt: 0 }
      },
      _sum: { feeCents: true },
      _count: { id: true }
    });

    // Payment data for completed transactions
    const paymentsData = await this.prisma.payment.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    // Refunds and chargebacks
    const refundsData = await this.prisma.payment.aggregate({
      where: {
        refundedAt: { gte: startDate, lte: endDate },
        status: 'REFUNDED'
      },
      _sum: { amount: true }
    });

    // Revenue share from royalty statements
    const royaltyRevenue = await this.prisma.royaltyStatement.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      _sum: { 
        totalEarningsCents: true,
        platformFeeCents: true 
      }
    });

    // Get unique brands and creators for metrics
    const uniqueBrandsResult = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      select: { brandId: true },
      distinct: ['brandId']
    });

    const uniqueCreatorsResult = await this.prisma.royaltyStatement.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      select: { creatorId: true },
      distinct: ['creatorId']
    });

    const grossRevenueCents = (licenseRevenue._sum.feeCents || 0) + (paymentsData._sum.amount || 0);
    const refundsChargebacksCents = refundsData._sum.amount || 0;
    const platformFeesCents = royaltyRevenue._sum.platformFeeCents || 0;
    const processingFeesCents = Math.round(grossRevenueCents * 0.029); // Estimated 2.9% processing fee

    return {
      grossRevenueCents,
      netRevenueCents: grossRevenueCents - refundsChargebacksCents - processingFeesCents,
      refundsChargebacksCents,
      platformFeesCents,
      processingFeesCents,
      transactionCount: (licenseRevenue._count.id || 0) + (paymentsData._count.id || 0),
      uniqueBrands: uniqueBrandsResult.length,
      uniqueCreators: uniqueCreatorsResult.length,
      bySource: {
        licenseFees: licenseRevenue._sum.feeCents || 0,
        revenuShare: royaltyRevenue._sum.totalEarningsCents || 0,
        subscriptions: 0, // TODO: Implement if subscriptions are added
        other: (paymentsData._sum.amount || 0) - (licenseRevenue._sum.feeCents || 0)
      }
    };
  }

  /**
   * Get previous month revenue for comparison
   */
  private async getPreviousMonthRevenue(year: number, month: number): Promise<number> {
    const prevMonthDate = subMonths(new Date(year, month - 1, 1), 1);
    const prevStart = startOfMonth(prevMonthDate);
    const prevEnd = endOfMonth(prevMonthDate);

    const prevData = await this.getBaseRevenueData(prevStart, prevEnd);
    return prevData.grossRevenueCents;
  }

  /**
   * Get geographic revenue breakdown
   */
  private async getGeographicBreakdown(startDate: Date, endDate: Date) {
    // This would require IP geolocation data or user location data
    // For now, return placeholder implementation
    // TODO: Implement based on available geographic data in user profiles or IP tracking
    
    return [
      { country: 'United States', revenueCents: 0, percentage: 0 },
      { country: 'Canada', revenueCents: 0, percentage: 0 },
      { country: 'United Kingdom', revenueCents: 0, percentage: 0 },
      { country: 'Other', revenueCents: 0, percentage: 0 }
    ];
  }

  /**
   * Get revenue breakdown by user verification type
   */
  private async getRevenueByUserType(startDate: Date, endDate: Date) {
    // Revenue from verified vs unverified creators
    const creatorRevenue = await this.prisma.royaltyStatement.groupBy({
      by: ['creatorId'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      _sum: { totalEarningsCents: true }
    });

    const creatorIds = creatorRevenue.map(r => r.creatorId);
    const creatorVerificationStatus = await this.prisma.creator.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, verificationStatus: true }
    });

    let verifiedCreators = 0;
    let unverifiedCreators = 0;

    creatorRevenue.forEach(revenue => {
      const creator = creatorVerificationStatus.find(c => c.id === revenue.creatorId);
      const amount = revenue._sum.totalEarningsCents || 0;
      
      if (creator?.verificationStatus === 'approved') {
        verifiedCreators += amount;
      } else {
        unverifiedCreators += amount;
      }
    });

    // Brand revenue by type (TODO: Add brand tier/type classification)
    const brandRevenue = await this.prisma.payment.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    return {
      verifiedCreators,
      unverifiedCreators,
      enterpriseBrands: Math.round((brandRevenue._sum.amount || 0) * 0.7), // Estimated 70%
      standardBrands: Math.round((brandRevenue._sum.amount || 0) * 0.3)    // Estimated 30%
    };
  }

  /**
   * Get revenue breakdown by asset category
   */
  private async getRevenueByCategoryType(startDate: Date, endDate: Date) {
    const licensesByAssetType = await this.prisma.license.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] },
        feeCents: { gt: 0 }
      },
      include: {
        ipAssets: {
          select: { type: true }
        }
      }
    });

    const breakdown = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      other: 0
    };

    licensesByAssetType.forEach(license => {
      const assetType = license.ipAssets[0]?.type?.toLowerCase() || 'other';
      const amount = license.feeCents || 0;
      
      if (breakdown.hasOwnProperty(assetType)) {
        breakdown[assetType as keyof typeof breakdown] += amount;
      } else {
        breakdown.other += amount;
      }
    });

    return breakdown;
  }

  /**
   * Get top performing brands and creators
   */
  private async getTopPerformers(startDate: Date, endDate: Date) {
    // Top brands by spending
    const topBrandsData = await this.prisma.payment.groupBy({
      by: ['brandId'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10
    });

    const brandIds = topBrandsData.map(b => b.brandId);
    const brandDetails = await this.prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, companyName: true }
    });

    const topBrands = topBrandsData.map(brand => {
      const brandInfo = brandDetails.find(b => b.id === brand.brandId);
      return {
        brandId: brand.brandId,
        brandName: brandInfo?.companyName || 'Unknown',
        revenueCents: brand._sum.amount || 0,
        transactionCount: brand._count.id
      };
    });

    // Top creators by earnings
    const topCreatorsData = await this.prisma.royaltyStatement.groupBy({
      by: ['creatorId'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      _sum: { totalEarningsCents: true },
      _count: { id: true },
      orderBy: { _sum: { totalEarningsCents: 'desc' } },
      take: 10
    });

    const creatorIds = topCreatorsData.map(c => c.creatorId);
    const creatorDetails = await this.prisma.creator.findMany({
      where: { id: { in: creatorIds } },
      include: { user: { select: { name: true } } }
    });

    const topCreators = topCreatorsData.map(creator => {
      const creatorInfo = creatorDetails.find(c => c.id === creator.creatorId);
      return {
        creatorId: creator.creatorId,
        creatorName: creatorInfo?.user.name || creatorInfo?.stageName || 'Unknown',
        earnedCents: creator._sum.totalEarningsCents || 0,
        licensesCount: creator._count.id
      };
    });

    return { brands: topBrands, creators: topCreators };
  }

  /**
   * Get payment method breakdown
   */
  private async getPaymentMethodBreakdown(startDate: Date, endDate: Date) {
    const paymentMethodsData = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    return paymentMethodsData.map(method => ({
      method: method.paymentMethod || 'Unknown',
      transactionCount: method._count.id,
      revenueCents: method._sum.amount || 0
    }));
  }

  /**
   * Get multiple months for trend analysis
   */
  async getMonthlyTrends(startYear: number, startMonth: number, months: number) {
    const reports = [];
    let currentYear = startYear;
    let currentMonth = startMonth;

    for (let i = 0; i < months; i++) {
      const report = await this.generateMonthlyRevenueReport(currentYear, currentMonth);
      reports.push(report);

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return reports;
  }
}
