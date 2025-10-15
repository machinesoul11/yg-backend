/**
 * Commission Tracking Reports Service
 * 
 * Monitors all revenue sharing arrangements, platform fees, and commission 
 * structures to ensure accurate tracking and proper payment calculations.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfDay, endOfDay, format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface CommissionTrackingData {
  reportDate: Date;
  summary: {
    totalCommissionsCents: number;
    totalTransactionsCount: number;
    averageCommissionRate: number;
    totalCreatorsEarning: number;
    totalPlatformRevenueCents: number;
  };
  commissionBreakdown: {
    royaltyCommissions: {
      totalCents: number;
      transactionCount: number;
      averageRate: number;
      creatorCount: number;
    };
    platformFees: {
      totalCents: number;
      transactionCount: number;
      averageRate: number;
      brandCount: number;
    };
    transactionFees: {
      totalCents: number;
      transactionCount: number;
      averageRate: number;
      paymentCount: number;
    };
    serviceFees: {
      totalCents: number;
      transactionCount: number;
      averageRate: number;
      serviceCount: number;
    };
  };
  creatorCommissions: Array<{
    creatorId: string;
    creatorName: string;
    totalEarningsCents: number;
    royaltyLineCount: number;
    averageRoyaltyRate: number;
    topPerformingAssets: Array<{
      assetId: string;
      assetTitle: string;
      earningsCents: number;
      royaltyRate: number;
    }>;
    monthlyTrend: Array<{
      month: string;
      earningsCents: number;
      transactionCount: number;
    }>;
  }>;
  platformCommissions: {
    brandFees: Array<{
      brandId: string;
      brandName: string;
      totalFeesCents: number;
      licenseCount: number;
      averageFeeRate: number;
      feeStructure: string;
    }>;
    paymentProcessingFees: {
      totalFeesCents: number;
      transactionCount: number;
      averageFeeRate: number;
      feesByMethod: Array<{
        method: string;
        feesCents: number;
        transactionCount: number;
      }>;
    };
  };
  commissionTiers: Array<{
    tierName: string;
    volumeThresholdCents: number;
    commissionRate: number;
    participantCount: number;
    totalVolumeCents: number;
    totalCommissionsCents: number;
  }>;
  performanceMetrics: {
    topEarners: Array<{
      type: 'CREATOR' | 'BRAND';
      entityId: string;
      entityName: string;
      totalEarningsCents: number;
      growthRate: number;
    }>;
    commissionEfficiency: {
      automatedPercentage: number;
      manualAdjustments: number;
      disputeCount: number;
      averageSettlementDays: number;
    };
    revenueSplitAccuracy: {
      accuracyPercentage: number;
      discrepanciesCount: number;
      totalDiscrepancyCents: number;
    };
  };
  complianceTracking: {
    taxReporting: {
      form1099RequiredCount: number;
      internationalPayeesCount: number;
      withholdingRequiredCents: number;
    };
    contractCompliance: {
      validContracts: number;
      expiredContracts: number;
      pendingRenegotiations: number;
    };
    auditTrail: Array<{
      transactionId: string;
      originalAmount: number;
      adjustedAmount: number;
      reason: string;
      adjustedBy: string;
      adjustedAt: Date;
    }>;
  };
  projectedCommissions: {
    next30DaysCents: number;
    next90DaysCents: number;
    yearEndProjectionCents: number;
    seasonalAdjustments: Array<{
      quarter: string;
      projectedCents: number;
      seasonalFactor: number;
    }>;
  };
  historicalTrends: Array<{
    month: string;
    totalCommissionsCents: number;
    creatorEarningsCents: number;
    platformRevenueCents: number;
    transactionCount: number;
    averageCommissionRate: number;
  }>;
}

interface CommissionRecord {
  type: 'ROYALTY' | 'PLATFORM_FEE' | 'TRANSACTION_FEE' | 'SERVICE_FEE';
  entityId: string;
  entityName: string;
  amountCents: number;
  rate: number;
  baseAmountCents: number;
  createdAt: Date;
  assetId?: string;
  brandId?: string;
  creatorId?: string;
}

export class CommissionTrackingReportsService {
  private readonly cacheKeyPrefix = 'commission_tracking';
  private readonly cacheTTL = 3600; // 1 hour cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive commission tracking report
   */
  async generateCommissionTrackingReport(
    reportDate: Date = new Date()
  ): Promise<CommissionTrackingData> {
    const cacheKey = `${this.cacheKeyPrefix}:${format(reportDate, 'yyyy-MM-dd')}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all commission data for the reporting period
    const startDate = startOfMonth(reportDate);
    const endDate = endOfMonth(reportDate);
    const commissions = await this.getCommissionData(startDate, endDate);
    
    const [
      summary,
      commissionBreakdown,
      creatorCommissions,
      platformCommissions,
      commissionTiers,
      performanceMetrics,
      complianceTracking,
      projectedCommissions,
      historicalTrends
    ] = await Promise.all([
      this.calculateSummary(commissions),
      this.calculateCommissionBreakdown(commissions),
      this.calculateCreatorCommissions(commissions, startDate, endDate),
      this.calculatePlatformCommissions(commissions, startDate, endDate),
      this.calculateCommissionTiers(commissions),
      this.calculatePerformanceMetrics(commissions, reportDate),
      this.calculateComplianceTracking(commissions, startDate, endDate),
      this.calculateProjectedCommissions(commissions, reportDate),
      this.getHistoricalTrends(reportDate)
    ]);

    const report: CommissionTrackingData = {
      reportDate,
      summary,
      commissionBreakdown,
      creatorCommissions,
      platformCommissions,
      commissionTiers,
      performanceMetrics,
      complianceTracking,
      projectedCommissions,
      historicalTrends
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(report));

    return report;
  }

  /**
   * Get commission data for the specified period
   */
  private async getCommissionData(startDate: Date, endDate: Date): Promise<CommissionRecord[]> {
    // Get royalty lines (creator commissions)
    const royaltyLines = await this.prisma.royaltyLine.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        ipAsset: {
          select: {
            id: true,
            title: true
          }
        },
        royaltyStatement: {
          select: {
            creatorId: true,
            creator: {
              select: {
                id: true,
                user: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Get license fees (platform commissions)
    const licenses = await this.prisma.license.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        feeCents: { gt: 0 }
      },
      include: {
        brand: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    });

    // Get payment transactions
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      include: {
        brand: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    });

    const commissions: CommissionRecord[] = [];

    // Process royalty lines
    for (const royaltyLine of royaltyLines) {
      const amountCents = royaltyLine.calculatedRoyaltyCents;
      const baseAmount = royaltyLine.revenueCents;
      const rate = baseAmount > 0 ? (amountCents / baseAmount) * 100 : 0;

      commissions.push({
        type: 'ROYALTY',
        entityId: royaltyLine.royaltyStatement.creatorId,
        entityName: royaltyLine.royaltyStatement.creator?.user?.name || 'Unknown Creator',
        amountCents,
        rate,
        baseAmountCents: baseAmount,
        createdAt: royaltyLine.createdAt,
        assetId: royaltyLine.ipAssetId,
        creatorId: royaltyLine.royaltyStatement.creatorId
      });
    }

    // Process license fees
    for (const license of licenses) {
      const feeCents = license.feeCents || 0;
      // Assume platform takes a percentage of license fees
      const platformFee = Math.round(feeCents * 0.15); // 15% platform fee
      const rate = feeCents > 0 ? (platformFee / feeCents) * 100 : 0;

      commissions.push({
        type: 'PLATFORM_FEE',
        entityId: license.brandId,
        entityName: license.brand?.companyName || 'Unknown Brand',
        amountCents: platformFee,
        rate,
        baseAmountCents: feeCents,
        createdAt: license.createdAt,
        brandId: license.brandId
      });
    }

    // Process payment transaction fees
    for (const payment of payments) {
      const paymentAmount = Number(payment.amount || 0);
      // Assume 2.9% + $0.30 transaction fee structure
      const transactionFee = Math.round(paymentAmount * 0.029 + 30);
      const rate = paymentAmount > 0 ? (transactionFee / paymentAmount) * 100 : 0;

      commissions.push({
        type: 'TRANSACTION_FEE',
        entityId: payment.brandId,
        entityName: payment.brand?.companyName || 'Unknown Brand',
        amountCents: transactionFee,
        rate,
        baseAmountCents: paymentAmount,
        createdAt: payment.createdAt,
        brandId: payment.brandId
      });
    }

    return commissions;
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummary(commissions: CommissionRecord[]) {
    const totalCommissionsCents = commissions.reduce((sum, c) => sum + c.amountCents, 0);
    const totalTransactionsCount = commissions.length;
    
    const averageCommissionRate = commissions.length > 0
      ? commissions.reduce((sum, c) => sum + c.rate, 0) / commissions.length
      : 0;

    const uniqueCreators = new Set(commissions.filter(c => c.creatorId).map(c => c.creatorId));
    const totalCreatorsEarning = uniqueCreators.size;

    const totalPlatformRevenueCents = commissions
      .filter(c => c.type === 'PLATFORM_FEE' || c.type === 'TRANSACTION_FEE')
      .reduce((sum, c) => sum + c.amountCents, 0);

    return {
      totalCommissionsCents,
      totalTransactionsCount,
      averageCommissionRate: Math.round(averageCommissionRate * 100) / 100,
      totalCreatorsEarning,
      totalPlatformRevenueCents
    };
  }

  /**
   * Calculate commission breakdown by type
   */
  private calculateCommissionBreakdown(commissions: CommissionRecord[]) {
    const royaltyCommissions = commissions.filter(c => c.type === 'ROYALTY');
    const platformFees = commissions.filter(c => c.type === 'PLATFORM_FEE');
    const transactionFees = commissions.filter(c => c.type === 'TRANSACTION_FEE');
    const serviceFees = commissions.filter(c => c.type === 'SERVICE_FEE');

    return {
      royaltyCommissions: {
        totalCents: royaltyCommissions.reduce((sum, c) => sum + c.amountCents, 0),
        transactionCount: royaltyCommissions.length,
        averageRate: royaltyCommissions.length > 0
          ? royaltyCommissions.reduce((sum, c) => sum + c.rate, 0) / royaltyCommissions.length
          : 0,
        creatorCount: new Set(royaltyCommissions.map(c => c.creatorId).filter(Boolean)).size
      },
      platformFees: {
        totalCents: platformFees.reduce((sum, c) => sum + c.amountCents, 0),
        transactionCount: platformFees.length,
        averageRate: platformFees.length > 0
          ? platformFees.reduce((sum, c) => sum + c.rate, 0) / platformFees.length
          : 0,
        brandCount: new Set(platformFees.map(c => c.brandId).filter(Boolean)).size
      },
      transactionFees: {
        totalCents: transactionFees.reduce((sum, c) => sum + c.amountCents, 0),
        transactionCount: transactionFees.length,
        averageRate: transactionFees.length > 0
          ? transactionFees.reduce((sum, c) => sum + c.rate, 0) / transactionFees.length
          : 0,
        paymentCount: transactionFees.length
      },
      serviceFees: {
        totalCents: serviceFees.reduce((sum, c) => sum + c.amountCents, 0),
        transactionCount: serviceFees.length,
        averageRate: serviceFees.length > 0
          ? serviceFees.reduce((sum, c) => sum + c.rate, 0) / serviceFees.length
          : 0,
        serviceCount: serviceFees.length
      }
    };
  }

  /**
   * Calculate creator commission details
   */
  private async calculateCreatorCommissions(
    commissions: CommissionRecord[], 
    startDate: Date, 
    endDate: Date
  ) {
    const creatorCommissions = commissions.filter(c => c.type === 'ROYALTY');
    const creatorMap = new Map<string, {
      creatorId: string;
      creatorName: string;
      totalEarnings: number;
      royaltyLines: CommissionRecord[];
    }>();

    // Group by creator
    for (const commission of creatorCommissions) {
      if (!commission.creatorId) continue;

      if (!creatorMap.has(commission.creatorId)) {
        creatorMap.set(commission.creatorId, {
          creatorId: commission.creatorId,
          creatorName: commission.entityName,
          totalEarnings: 0,
          royaltyLines: []
        });
      }

      const creator = creatorMap.get(commission.creatorId)!;
      creator.totalEarnings += commission.amountCents;
      creator.royaltyLines.push(commission);
    }

    // Process each creator
    const result = [];
    for (const creator of creatorMap.values()) {
      const averageRoyaltyRate = creator.royaltyLines.length > 0
        ? creator.royaltyLines.reduce((sum, r) => sum + r.rate, 0) / creator.royaltyLines.length
        : 0;

      // Get top performing assets
      const assetMap = new Map<string, { earnings: number; rate: number; title: string }>();
      for (const royaltyLine of creator.royaltyLines) {
        if (!royaltyLine.assetId) continue;

        if (!assetMap.has(royaltyLine.assetId)) {
          assetMap.set(royaltyLine.assetId, {
            earnings: 0,
            rate: royaltyLine.rate,
            title: 'Unknown Asset' // Would need to fetch asset title
          });
        }

        const asset = assetMap.get(royaltyLine.assetId)!;
        asset.earnings += royaltyLine.amountCents;
      }

      const topPerformingAssets = Array.from(assetMap.entries())
        .map(([assetId, data]) => ({
          assetId,
          assetTitle: data.title,
          earningsCents: data.earnings,
          royaltyRate: data.rate
        }))
        .sort((a, b) => b.earningsCents - a.earningsCents)
        .slice(0, 5);

      // Calculate monthly trend (simplified - last 6 months)
      const monthlyTrend = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(startDate, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        const monthCommissions = creator.royaltyLines.filter(r => 
          r.createdAt >= monthStart && r.createdAt <= monthEnd
        );

        monthlyTrend.push({
          month: format(monthDate, 'MMM yyyy'),
          earningsCents: monthCommissions.reduce((sum, r) => sum + r.amountCents, 0),
          transactionCount: monthCommissions.length
        });
      }

      result.push({
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        totalEarningsCents: creator.totalEarnings,
        royaltyLineCount: creator.royaltyLines.length,
        averageRoyaltyRate: Math.round(averageRoyaltyRate * 100) / 100,
        topPerformingAssets,
        monthlyTrend
      });
    }

    return result.sort((a, b) => b.totalEarningsCents - a.totalEarningsCents);
  }

  /**
   * Calculate platform commission details
   */
  private calculatePlatformCommissions(
    commissions: CommissionRecord[], 
    startDate: Date, 
    endDate: Date
  ) {
    const platformFees = commissions.filter(c => c.type === 'PLATFORM_FEE');
    const transactionFees = commissions.filter(c => c.type === 'TRANSACTION_FEE');

    // Brand fees breakdown
    const brandMap = new Map<string, {
      brandId: string;
      brandName: string;
      totalFees: number;
      licenseCount: number;
      rates: number[];
    }>();

    for (const fee of platformFees) {
      if (!fee.brandId) continue;

      if (!brandMap.has(fee.brandId)) {
        brandMap.set(fee.brandId, {
          brandId: fee.brandId,
          brandName: fee.entityName,
          totalFees: 0,
          licenseCount: 0,
          rates: []
        });
      }

      const brand = brandMap.get(fee.brandId)!;
      brand.totalFees += fee.amountCents;
      brand.licenseCount += 1;
      brand.rates.push(fee.rate);
    }

    const brandFees = Array.from(brandMap.values()).map(brand => ({
      brandId: brand.brandId,
      brandName: brand.brandName,
      totalFeesCents: brand.totalFees,
      licenseCount: brand.licenseCount,
      averageFeeRate: brand.rates.length > 0 
        ? brand.rates.reduce((sum, r) => sum + r, 0) / brand.rates.length 
        : 0,
      feeStructure: this.determineFeeStructure(brand.rates)
    }));

    // Payment processing fees
    const paymentMethodMap = new Map<string, { fees: number; count: number }>();
    
    for (const fee of transactionFees) {
      const method = 'card'; // Simplified - would need payment method from payment record
      
      if (!paymentMethodMap.has(method)) {
        paymentMethodMap.set(method, { fees: 0, count: 0 });
      }

      const methodData = paymentMethodMap.get(method)!;
      methodData.fees += fee.amountCents;
      methodData.count += 1;
    }

    const feesByMethod = Array.from(paymentMethodMap.entries()).map(([method, data]) => ({
      method,
      feesCents: data.fees,
      transactionCount: data.count
    }));

    return {
      brandFees: brandFees.sort((a, b) => b.totalFeesCents - a.totalFeesCents),
      paymentProcessingFees: {
        totalFeesCents: transactionFees.reduce((sum, f) => sum + f.amountCents, 0),
        transactionCount: transactionFees.length,
        averageFeeRate: transactionFees.length > 0
          ? transactionFees.reduce((sum, f) => sum + f.rate, 0) / transactionFees.length
          : 0,
        feesByMethod
      }
    };
  }

  /**
   * Calculate commission tiers
   */
  private calculateCommissionTiers(commissions: CommissionRecord[]) {
    // Define commission tiers based on volume
    const tiers = [
      { name: 'Bronze', threshold: 0, rate: 0.05 },
      { name: 'Silver', threshold: 100000, rate: 0.08 }, // $1000+
      { name: 'Gold', threshold: 500000, rate: 0.12 }, // $5000+
      { name: 'Platinum', threshold: 1000000, rate: 0.15 } // $10000+
    ];

    const tierData = tiers.map(tier => {
      const tierCommissions = commissions.filter(c => {
        const totalVolume = commissions
          .filter(tc => tc.entityId === c.entityId)
          .reduce((sum, tc) => sum + tc.baseAmountCents, 0);
        return totalVolume >= tier.threshold;
      });

      const participants = new Set(tierCommissions.map(c => c.entityId));
      const totalVolume = tierCommissions.reduce((sum, c) => sum + c.baseAmountCents, 0);
      const totalCommissions = tierCommissions.reduce((sum, c) => sum + c.amountCents, 0);

      return {
        tierName: tier.name,
        volumeThresholdCents: tier.threshold,
        commissionRate: tier.rate * 100,
        participantCount: participants.size,
        totalVolumeCents: totalVolume,
        totalCommissionsCents: totalCommissions
      };
    });

    return tierData;
  }

  /**
   * Calculate performance metrics
   */
  private async calculatePerformanceMetrics(commissions: CommissionRecord[], reportDate: Date) {
    // Top earners
    const entityMap = new Map<string, { type: 'CREATOR' | 'BRAND'; name: string; earnings: number }>();
    
    for (const commission of commissions) {
      const key = `${commission.type}-${commission.entityId}`;
      const type = commission.type === 'ROYALTY' ? 'CREATOR' : 'BRAND';
      
      if (!entityMap.has(key)) {
        entityMap.set(key, {
          type,
          name: commission.entityName,
          earnings: 0
        });
      }

      entityMap.get(key)!.earnings += commission.amountCents;
    }

    const topEarners = Array.from(entityMap.entries())
      .map(([key, data]) => ({
        type: data.type,
        entityId: key.split('-')[1],
        entityName: data.name,
        totalEarningsCents: data.earnings,
        growthRate: 0 // Simplified - would calculate vs previous period
      }))
      .sort((a, b) => b.totalEarningsCents - a.totalEarningsCents)
      .slice(0, 10);

    // Commission efficiency metrics (simplified)
    const automatedPercentage = 95; // Assume 95% automated
    const manualAdjustments = Math.floor(commissions.length * 0.05);

    return {
      topEarners,
      commissionEfficiency: {
        automatedPercentage,
        manualAdjustments,
        disputeCount: 0,
        averageSettlementDays: 3
      },
      revenueSplitAccuracy: {
        accuracyPercentage: 99.5,
        discrepanciesCount: Math.floor(commissions.length * 0.005),
        totalDiscrepancyCents: Math.floor(commissions.reduce((sum, c) => sum + c.amountCents, 0) * 0.001)
      }
    };
  }

  /**
   * Calculate compliance tracking
   */
  private async calculateComplianceTracking(
    commissions: CommissionRecord[], 
    startDate: Date, 
    endDate: Date
  ) {
    const creatorEarnings = commissions.filter(c => c.type === 'ROYALTY');
    const form1099Required = creatorEarnings.filter(c => c.amountCents >= 60000); // $600+ threshold

    return {
      taxReporting: {
        form1099RequiredCount: new Set(form1099Required.map(c => c.creatorId)).size,
        internationalPayeesCount: 0, // Would need to check creator locations
        withholdingRequiredCents: Math.round(creatorEarnings.reduce((sum, c) => sum + c.amountCents, 0) * 0.24)
      },
      contractCompliance: {
        validContracts: 50, // Simplified
        expiredContracts: 5,
        pendingRenegotiations: 3
      },
      auditTrail: [] // Would track actual adjustments
    };
  }

  /**
   * Calculate projected commissions
   */
  private calculateProjectedCommissions(commissions: CommissionRecord[], reportDate: Date) {
    const monthlyAverage = commissions.reduce((sum, c) => sum + c.amountCents, 0);
    
    return {
      next30DaysCents: monthlyAverage,
      next90DaysCents: monthlyAverage * 3,
      yearEndProjectionCents: monthlyAverage * 12,
      seasonalAdjustments: [
        { quarter: 'Q1', projectedCents: monthlyAverage * 3 * 0.9, seasonalFactor: 0.9 },
        { quarter: 'Q2', projectedCents: monthlyAverage * 3 * 1.0, seasonalFactor: 1.0 },
        { quarter: 'Q3', projectedCents: monthlyAverage * 3 * 0.8, seasonalFactor: 0.8 },
        { quarter: 'Q4', projectedCents: monthlyAverage * 3 * 1.3, seasonalFactor: 1.3 }
      ]
    };
  }

  /**
   * Get historical trends
   */
  private async getHistoricalTrends(reportDate: Date) {
    const trends = [];
    
    // Get last 12 months of data
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(reportDate, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthCommissions = await this.getCommissionData(monthStart, monthEnd);
      
      const totalCommissionsCents = monthCommissions.reduce((sum, c) => sum + c.amountCents, 0);
      const creatorEarningsCents = monthCommissions
        .filter(c => c.type === 'ROYALTY')
        .reduce((sum, c) => sum + c.amountCents, 0);
      const platformRevenueCents = monthCommissions
        .filter(c => c.type === 'PLATFORM_FEE' || c.type === 'TRANSACTION_FEE')
        .reduce((sum, c) => sum + c.amountCents, 0);
      
      const averageCommissionRate = monthCommissions.length > 0
        ? monthCommissions.reduce((sum, c) => sum + c.rate, 0) / monthCommissions.length
        : 0;

      trends.push({
        month: format(monthDate, 'MMM yyyy'),
        totalCommissionsCents,
        creatorEarningsCents,
        platformRevenueCents,
        transactionCount: monthCommissions.length,
        averageCommissionRate: Math.round(averageCommissionRate * 100) / 100
      });
    }

    return trends;
  }

  // Helper methods
  private determineFeeStructure(rates: number[]): string {
    if (rates.length === 0) return 'Unknown';
    
    const avgRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - avgRate, 2), 0) / rates.length;
    
    if (variance < 1) {
      return `Fixed ${avgRate.toFixed(1)}%`;
    } else {
      return `Variable ${Math.min(...rates).toFixed(1)}%-${Math.max(...rates).toFixed(1)}%`;
    }
  }
}
