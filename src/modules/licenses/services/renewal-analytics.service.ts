/**
 * Renewal Analytics Service
 * Tracks and reports on renewal system performance and metrics
 */

import { prisma } from '@/lib/db';
import { subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns';

export interface RenewalMetrics {
  period: {
    start: Date;
    end: Date;
  };
  renewalRate: number; // Percentage of expiring licenses that renewed
  totalLicensesExpiring: number;
  totalRenewalsSuccessful: number;
  totalRenewalsFailed: number;
  averageTimeToRenewal: number; // Days from offer to acceptance
  revenueRetentionRate: number; // Percentage of revenue retained
  totalRenewalRevenueCents: number;
  byPricingStrategy: {
    strategy: string;
    count: number;
    averageFeeCents: number;
    acceptanceRate: number;
  }[];
  byNotificationStage: {
    stage: string;
    sent: number;
    opened: number;
    clicked: number;
    converted: number;
  }[];
  topPerformingAssets: {
    ipAssetId: string;
    ipAssetTitle: string;
    renewalCount: number;
    totalRevenueCents: number;
  }[];
  atRiskLicenses: {
    licenseId: string;
    brandName: string;
    ipAssetTitle: string;
    daysUntilExpiration: number;
    reason: string;
  }[];
}

export interface RenewalPipelineSnapshot {
  timestamp: Date;
  stages: {
    eligible: number;
    offerGenerated: number;
    underReview: number;
    approved: number;
    inNegotiation: number;
    rejected: number;
  };
  forecastedRevenueCents: number;
  atRiskRevenueCents: number;
}

export interface BrandRenewalPerformance {
  brandId: string;
  brandName: string;
  totalLicenses: number;
  renewalRate: number;
  averageRenewalFeeCents: number;
  lifetimeValueCents: number;
  relationshipMonths: number;
  atRiskLicenses: number;
  recommendedActions: string[];
}

export class RenewalAnalyticsService {
  /**
   * Calculate comprehensive renewal metrics for a period
   */
  async calculateRenewalMetrics(
    startDate: Date = subDays(new Date(), 30),
    endDate: Date = new Date()
  ): Promise<RenewalMetrics> {
    // Find all licenses that expired during this period
    const expiringLicenses = await prisma.license.findMany({
      where: {
        endDate: {
          gte: startDate,
          lte: endDate,
        },
        deletedAt: null,
      },
      include: {
        renewals: {
          where: {
            status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'PENDING_SIGNATURE'] as any },
          },
        },
        brand: true,
        ipAsset: true,
      },
    });

    const totalLicensesExpiring = expiringLicenses.length;
    const renewedLicenses = expiringLicenses.filter((l) => l.renewals.length > 0);
    const totalRenewalsSuccessful = renewedLicenses.length;
    const totalRenewalsFailed = totalLicensesExpiring - totalRenewalsSuccessful;

    const renewalRate =
      totalLicensesExpiring > 0 ? (totalRenewalsSuccessful / totalLicensesExpiring) * 100 : 0;

    // Calculate average time to renewal
    let totalDaysToRenewal = 0;
    let renewalCount = 0;

    for (const license of renewedLicenses) {
      for (const renewal of license.renewals) {
        const offeredDate =
          (license.metadata as any)?.renewalNotifications?.initial_offer?.sentAt;
        if (offeredDate) {
          const days = differenceInDays(renewal.createdAt, new Date(offeredDate));
          totalDaysToRenewal += days;
          renewalCount++;
        }
      }
    }

    const averageTimeToRenewal = renewalCount > 0 ? totalDaysToRenewal / renewalCount : 0;

    // Calculate revenue retention
    const originalRevenue = expiringLicenses.reduce((sum, l) => sum + l.feeCents, 0);
    const renewalRevenue = renewedLicenses.reduce((sum, l) => {
      const totalRenewalFee = l.renewals.reduce((s, r) => s + r.feeCents, 0);
      return sum + totalRenewalFee;
    }, 0);

    const revenueRetentionRate = originalRevenue > 0 ? (renewalRevenue / originalRevenue) * 100 : 0;

    // Get pricing strategy breakdown
    const pricingStrategies = await this.analyzePricingStrategies(startDate, endDate);

    // Get notification stage breakdown
    const notificationStages = await this.analyzeNotificationEffectiveness(startDate, endDate);

    // Get top performing assets
    const topPerformingAssets = await this.getTopRenewingAssets(startDate, endDate);

    // Get at-risk licenses
    const atRiskLicenses = await this.getAtRiskLicenses();

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      renewalRate,
      totalLicensesExpiring,
      totalRenewalsSuccessful,
      totalRenewalsFailed,
      averageTimeToRenewal,
      revenueRetentionRate,
      totalRenewalRevenueCents: renewalRevenue,
      byPricingStrategy: pricingStrategies,
      byNotificationStage: notificationStages,
      topPerformingAssets,
      atRiskLicenses,
    };
  }

  /**
   * Get current renewal pipeline snapshot
   */
  async getRenewalPipelineSnapshot(): Promise<RenewalPipelineSnapshot> {
    const today = new Date();
    const ninetyDaysOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Count licenses in each stage
    const eligibleLicenses = await prisma.license.count({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: today,
          lte: ninetyDaysOut,
        },
        deletedAt: null,
      },
    });

    const licensesWithOffers = await prisma.license.count({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: today,
          lte: ninetyDaysOut,
        },
        deletedAt: null,
        renewalNotifiedAt: { not: null },
      },
    });

    // Get forecasted revenue from licenses in pipeline
    const pipelineLicenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: today,
          lte: ninetyDaysOut,
        },
        deletedAt: null,
      },
      select: {
        feeCents: true,
        metadata: true,
      },
    });

    let forecastedRevenueCents = 0;
    let atRiskRevenueCents = 0;

    for (const license of pipelineLicenses) {
      const renewalOffer = (license.metadata as any)?.renewalOffer;
      const feeCents = renewalOffer?.terms?.feeCents || license.feeCents;

      forecastedRevenueCents += feeCents;

      // Mark as at-risk if no notification sent yet and close to expiration
      if (!(license.metadata as any)?.renewalNotifications?.initial_offer) {
        atRiskRevenueCents += feeCents;
      }
    }

    return {
      timestamp: today,
      stages: {
        eligible: eligibleLicenses,
        offerGenerated: licensesWithOffers,
        underReview: 0, // Would need workflow state tracking
        approved: 0,
        inNegotiation: 0,
        rejected: 0,
      },
      forecastedRevenueCents,
      atRiskRevenueCents,
    };
  }

  /**
   * Analyze brand renewal performance
   */
  async analyzeBrandRenewalPerformance(brandId: string): Promise<BrandRenewalPerformance> {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        licenses: {
          include: {
            renewals: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!brand) {
      throw new Error('Brand not found');
    }

    const totalLicenses = brand.licenses.length;
    const expiredLicenses = brand.licenses.filter((l) => l.status === 'EXPIRED');
    const renewedLicenses = expiredLicenses.filter((l) => l.renewals.length > 0);

    const renewalRate = expiredLicenses.length > 0 ? (renewedLicenses.length / expiredLicenses.length) * 100 : 0;

    const totalRenewalFees = renewedLicenses.reduce((sum, l) => {
      return sum + l.renewals.reduce((s, r) => s + r.feeCents, 0);
    }, 0);

    const averageRenewalFeeCents =
      renewedLicenses.length > 0 ? totalRenewalFees / renewedLicenses.length : 0;

    const lifetimeValueCents = brand.licenses.reduce((sum, l) => sum + l.feeCents, 0);

    const firstLicense = brand.licenses[0];
    const relationshipMonths = firstLicense
      ? Math.floor(differenceInDays(new Date(), firstLicense.createdAt) / 30)
      : 0;

    const atRiskLicenses = brand.licenses.filter((l) => {
      const daysUntilExpiration = differenceInDays(l.endDate, new Date());
      return (
        l.status === 'ACTIVE' &&
        daysUntilExpiration <= 90 &&
        daysUntilExpiration > 0 &&
        !l.renewalNotifiedAt
      );
    }).length;

    // Generate recommendations
    const recommendedActions: string[] = [];
    if (renewalRate < 50) {
      recommendedActions.push('Low renewal rate - consider offering loyalty discounts');
    }
    if (atRiskLicenses > 0) {
      recommendedActions.push(
        `${atRiskLicenses} license(s) expiring soon without renewal offers`
      );
    }
    if (renewalRate > 80) {
      recommendedActions.push('High renewal rate - consider premium tier offerings');
    }

    return {
      brandId,
      brandName: brand.companyName,
      totalLicenses,
      renewalRate,
      averageRenewalFeeCents,
      lifetimeValueCents,
      relationshipMonths,
      atRiskLicenses,
      recommendedActions,
    };
  }

  /**
   * Store renewal metrics to database
   */
  async storeMetrics(date: Date, metrics: RenewalMetrics): Promise<void> {
    // Store in daily_metrics table with renewal-specific metadata
    // Note: DailyMetric requires all keys to be strings, so we skip the unique constraint
    // and just create a new entry
    await prisma.dailyMetric.create({
      data: {
        date: startOfDay(date),
        metadata: {
          renewalMetrics: {
            renewalRate: metrics.renewalRate,
            totalRenewalsSuccessful: metrics.totalRenewalsSuccessful,
            totalRenewalsFailed: metrics.totalRenewalsFailed,
            averageTimeToRenewal: metrics.averageTimeToRenewal,
            revenueRetentionRate: metrics.revenueRetentionRate,
            totalRenewalRevenueCents: metrics.totalRenewalRevenueCents,
          },
        },
      },
    });
  }

  /**
   * Analyze pricing strategies effectiveness
   */
  private async analyzePricingStrategies(
    startDate: Date,
    endDate: Date
  ): Promise<RenewalMetrics['byPricingStrategy']> {
    // This would analyze metadata from renewal offers to see which strategies performed best
    // Placeholder implementation
    return [
      {
        strategy: 'AUTOMATIC',
        count: 0,
        averageFeeCents: 0,
        acceptanceRate: 0,
      },
    ];
  }

  /**
   * Analyze notification effectiveness
   */
  private async analyzeNotificationEffectiveness(
    startDate: Date,
    endDate: Date
  ): Promise<RenewalMetrics['byNotificationStage']> {
    // This would analyze email events to track opens, clicks, and conversions by stage
    // Placeholder implementation
    return [
      {
        stage: 'initial_offer',
        sent: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
      },
    ];
  }

  /**
   * Get top renewing assets
   */
  private async getTopRenewingAssets(
    startDate: Date,
    endDate: Date
  ): Promise<RenewalMetrics['topPerformingAssets']> {
    const renewals = await prisma.license.groupBy({
      by: ['ipAssetId'],
      where: {
        parentLicenseId: { not: null },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
      _sum: {
        feeCents: true,
      },
      orderBy: {
        _count: {
          ipAssetId: 'desc',
        },
      },
      take: 10,
    });

    const topAssets = await Promise.all(
      renewals.map(async (r) => {
        const asset = await prisma.ipAsset.findUnique({
          where: { id: r.ipAssetId },
          select: { title: true },
        });

        return {
          ipAssetId: r.ipAssetId,
          ipAssetTitle: asset?.title || 'Unknown',
          renewalCount: r._count,
          totalRevenueCents: r._sum.feeCents || 0,
        };
      })
    );

    return topAssets;
  }

  /**
   * Get licenses at risk of not renewing
   */
  private async getAtRiskLicenses(): Promise<RenewalMetrics['atRiskLicenses']> {
    const atRiskLicenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        endDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
        },
        renewalNotifiedAt: null,
        deletedAt: null,
      },
      include: {
        brand: true,
        ipAsset: true,
      },
      take: 20,
    });

    return atRiskLicenses.map((l) => ({
      licenseId: l.id,
      brandName: l.brand.companyName,
      ipAssetTitle: l.ipAsset.title,
      daysUntilExpiration: differenceInDays(l.endDate, new Date()),
      reason: 'No renewal offer sent yet',
    }));
  }
}

export const renewalAnalyticsService = new RenewalAnalyticsService();
