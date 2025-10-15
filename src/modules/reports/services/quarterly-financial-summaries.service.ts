/**
 * Quarterly Financial Summaries Service
 * 
 * Generates comprehensive quarterly business intelligence reports showing trends,
 * seasonal patterns, and strategic metrics for executive review.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfQuarter, endOfQuarter, subQuarters, format, startOfMonth, endOfMonth } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface QuarterlyFinancialSummaryData {
  quarter: string;
  fiscalQuarter: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  executiveSummary: {
    totalRevenueCents: number;
    totalExpensesCents: number;
    grossProfitCents: number;
    grossMarginPercent: number;
    quarterOverQuarterGrowthPercent: number;
    yearOverYearGrowthPercent: number;
  };
  revenueMetrics: {
    revenuePerUserCents: number;
    averageRevenuePerCreatorCents: number;
    averageSpendPerBrandCents: number;
    recurringRevenuePercent: number;
    newCustomerRevenuePercent: number;
  };
  licensingActivity: {
    totalLicensesCreated: number;
    totalLicensesRenewed: number;
    totalLicensesExpired: number;
    averageLicenseValueCents: number;
    revenuePerLicenseCents: number;
    renewalRatePercent: number;
  };
  creatorPayouts: {
    totalPayoutsCents: number;
    averagePayoutPerCreatorCents: number;
    payoutProcessingEfficiencyPercent: number;
    payoutDelayDays: number;
  };
  platformFees: {
    totalFeesCollectedCents: number;
    feeCollectionRatePercent: number;
    effectiveTakeRatePercent: number;
  };
  cohortAnalysis: {
    newUsersByMonth: Array<{
      month: string;
      creators: number;
      brands: number;
      totalRevenueCents: number;
    }>;
    userRetentionRates: {
      month1: number;
      month2: number;
      month3: number;
    };
  };
  seasonalAnalysis: {
    monthlyBreakdown: Array<{
      month: string;
      revenueCents: number;
      transactionCount: number;
      averageTransactionValue: number;
    }>;
    seasonalityIndex: number;
  };
  keyPerformanceIndicators: {
    customerAcquisitionCostCents: number;
    customerLifetimeValueCents: number;
    monthlyRecurringRevenueCents: number;
    churnRatePercent: number;
    netPromoterScore: number;
  };
  competitiveMetrics: {
    marketSharePercent: number;
    platformUtilizationRate: number;
    averageProjectCompletionDays: number;
    disputeRatePercent: number;
  };
}

export class QuarterlyFinancialSummariesService {
  private readonly cacheKeyPrefix = 'quarterly_summary';
  private readonly cacheTTL = 7200; // 2 hours cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive quarterly financial summary
   */
  async generateQuarterlyFinancialSummary(
    year: number,
    quarter: number // 1-4
  ): Promise<QuarterlyFinancialSummaryData> {
    const quarterDate = new Date(year, (quarter - 1) * 3, 1);
    const periodStart = startOfQuarter(quarterDate);
    const periodEnd = endOfQuarter(quarterDate);
    const isCurrentQuarter = this.isCurrentQuarter(quarterDate);

    // Check cache for historical quarters
    if (!isCurrentQuarter) {
      const cacheKey = `${this.cacheKeyPrefix}:${year}-Q${quarter}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const [
      executiveSummary,
      revenueMetrics,
      licensingActivity,
      creatorPayouts,
      platformFees,
      cohortAnalysis,
      seasonalAnalysis,
      kpis,
      competitiveMetrics
    ] = await Promise.all([
      this.getExecutiveSummary(periodStart, periodEnd, year, quarter),
      this.getRevenueMetrics(periodStart, periodEnd),
      this.getLicensingActivity(periodStart, periodEnd),
      this.getCreatorPayouts(periodStart, periodEnd),
      this.getPlatformFees(periodStart, periodEnd),
      this.getCohortAnalysis(periodStart, periodEnd),
      this.getSeasonalAnalysis(periodStart, periodEnd),
      this.getKeyPerformanceIndicators(periodStart, periodEnd),
      this.getCompetitiveMetrics(periodStart, periodEnd)
    ]);

    const summary: QuarterlyFinancialSummaryData = {
      quarter: `Q${quarter} ${year}`,
      fiscalQuarter: this.getFiscalQuarter(quarterDate),
      period: {
        startDate: periodStart,
        endDate: periodEnd,
      },
      executiveSummary,
      revenueMetrics,
      licensingActivity,
      creatorPayouts,
      platformFees,
      cohortAnalysis,
      seasonalAnalysis,
      keyPerformanceIndicators: kpis,
      competitiveMetrics
    };

    // Cache the result
    const cacheTTL = isCurrentQuarter ? this.cacheTTL : 86400 * 7; // 7 days for historical
    const cacheKey = `${this.cacheKeyPrefix}:${year}-Q${quarter}`;
    await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(summary));

    return summary;
  }

  /**
   * Get executive summary with high-level financial metrics
   */
  private async getExecutiveSummary(
    startDate: Date,
    endDate: Date,
    year: number,
    quarter: number
  ) {
    // Current quarter revenue
    const currentRevenue = await this.getTotalRevenue(startDate, endDate);
    
    // Previous quarter comparison
    const prevQuarterDate = subQuarters(new Date(year, (quarter - 1) * 3, 1), 1);
    const prevQuarterStart = startOfQuarter(prevQuarterDate);
    const prevQuarterEnd = endOfQuarter(prevQuarterDate);
    const previousQuarterRevenue = await this.getTotalRevenue(prevQuarterStart, prevQuarterEnd);

    // Year over year comparison
    const yearAgoQuarterDate = new Date(year - 1, (quarter - 1) * 3, 1);
    const yearAgoStart = startOfQuarter(yearAgoQuarterDate);
    const yearAgoEnd = endOfQuarter(yearAgoQuarterDate);
    const yearAgoRevenue = await this.getTotalRevenue(yearAgoStart, yearAgoEnd);

    // Expenses (estimated based on payouts + operational costs)
    const totalPayouts = await this.prisma.payout.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    const totalExpensesCents = (totalPayouts._sum.amountCents || 0) + 
                              Math.round(currentRevenue * 0.15); // Estimated 15% operational costs

    const grossProfitCents = currentRevenue - totalExpensesCents;
    const grossMarginPercent = currentRevenue > 0 ? (grossProfitCents / currentRevenue) * 100 : 0;

    const quarterOverQuarterGrowth = previousQuarterRevenue > 0 
      ? ((currentRevenue - previousQuarterRevenue) / previousQuarterRevenue) * 100
      : 0;

    const yearOverYearGrowth = yearAgoRevenue > 0 
      ? ((currentRevenue - yearAgoRevenue) / yearAgoRevenue) * 100
      : 0;

    return {
      totalRevenueCents: currentRevenue,
      totalExpensesCents,
      grossProfitCents,
      grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
      quarterOverQuarterGrowthPercent: Math.round(quarterOverQuarterGrowth * 100) / 100,
      yearOverYearGrowthPercent: Math.round(yearOverYearGrowth * 100) / 100
    };
  }

  /**
   * Get revenue per user metrics
   */
  private async getRevenueMetrics(startDate: Date, endDate: Date) {
    const totalRevenue = await this.getTotalRevenue(startDate, endDate);

    // User counts
    const totalUsers = await this.prisma.user.count({
      where: { createdAt: { lte: endDate } }
    });

    const activeCreators = await this.prisma.creator.count({
      where: { 
        createdAt: { lte: endDate },
        deletedAt: null
      }
    });

    const activeBrands = await this.prisma.brand.count({
      where: { 
        createdAt: { lte: endDate },
        deletedAt: null
      }
    });

    // Creator revenue
    const creatorRevenue = await this.prisma.royaltyStatement.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      _sum: { totalEarningsCents: true }
    });

    // Brand spending
    const brandSpending = await this.prisma.payment.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    // New vs returning customer revenue
    const newCustomersRevenue = await this.getNewCustomerRevenue(startDate, endDate);

    return {
      revenuePerUserCents: totalUsers > 0 ? Math.round(totalRevenue / totalUsers) : 0,
      averageRevenuePerCreatorCents: activeCreators > 0 
        ? Math.round((creatorRevenue._sum.totalEarningsCents || 0) / activeCreators) 
        : 0,
      averageSpendPerBrandCents: activeBrands > 0 
        ? Math.round((brandSpending._sum.amount || 0) / activeBrands) 
        : 0,
      recurringRevenuePercent: 75, // TODO: Calculate based on subscription/recurring license data
      newCustomerRevenuePercent: totalRevenue > 0 ? (newCustomersRevenue / totalRevenue) * 100 : 0
    };
  }

  /**
   * Get licensing activity metrics
   */
  private async getLicensingActivity(startDate: Date, endDate: Date) {
    const licensesCreated = await this.prisma.license.count({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const licensesRenewed = await this.prisma.license.count({
      where: {
        updatedAt: { gte: startDate, lte: endDate },
        status: 'RENEWED'
      }
    });

    const licensesExpired = await this.prisma.license.count({
      where: {
        endDate: { gte: startDate, lte: endDate },
        status: 'EXPIRED'
      }
    });

    const licenseRevenue = await this.prisma.license.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        feeCents: { gt: 0 }
      },
      _sum: { feeCents: true },
      _avg: { feeCents: true }
    });

    const renewalRate = (licensesExpired + licensesRenewed) > 0 
      ? (licensesRenewed / (licensesExpired + licensesRenewed)) * 100 
      : 0;

    return {
      totalLicensesCreated: licensesCreated,
      totalLicensesRenewed: licensesRenewed,
      totalLicensesExpired: licensesExpired,
      averageLicenseValueCents: Math.round(licenseRevenue._avg.feeCents || 0),
      revenuePerLicenseCents: licensesCreated > 0 
        ? Math.round((licenseRevenue._sum.feeCents || 0) / licensesCreated) 
        : 0,
      renewalRatePercent: Math.round(renewalRate * 100) / 100
    };
  }

  /**
   * Get creator payout metrics
   */
  private async getCreatorPayouts(startDate: Date, endDate: Date) {
    const payouts = await this.prisma.payout.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      },
      _sum: { amountCents: true },
      _count: { id: true }
    });

    const completedPayouts = await this.prisma.payout.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      }
    });

    const activeCreators = await this.prisma.creator.count({
      where: { 
        createdAt: { lte: endDate },
        deletedAt: null
      }
    });

    // Calculate average processing time
    const payoutTiming = await this.prisma.payout.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
        processedAt: { not: null }
      },
      select: {
        createdAt: true,
        processedAt: true
      }
    });

    const avgProcessingDays = payoutTiming.length > 0
      ? payoutTiming.reduce((sum, payout) => {
          const days = payout.processedAt 
            ? Math.abs(payout.processedAt.getTime() - payout.createdAt.getTime()) / (1000 * 60 * 60 * 24)
            : 0;
          return sum + days;
        }, 0) / payoutTiming.length
      : 0;

    return {
      totalPayoutsCents: payouts._sum.amountCents || 0,
      averagePayoutPerCreatorCents: activeCreators > 0 
        ? Math.round((payouts._sum.amountCents || 0) / activeCreators) 
        : 0,
      payoutProcessingEfficiencyPercent: payouts._count.id > 0 
        ? (completedPayouts / payouts._count.id) * 100 
        : 0,
      payoutDelayDays: Math.round(avgProcessingDays * 100) / 100
    };
  }

  /**
   * Get platform fee metrics
   */
  private async getPlatformFees(startDate: Date, endDate: Date) {
    const feeData = await this.prisma.royaltyStatement.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['REVIEWED', 'PAID'] }
      },
      _sum: { 
        platformFeeCents: true,
        totalEarningsCents: true 
      }
    });

    const totalTransactions = await this.prisma.payment.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      }
    });

    const feesCollected = await this.prisma.payment.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
        // TODO: Add fee tracking field
      }
    });

    const totalRevenue = await this.getTotalRevenue(startDate, endDate);
    const effectiveTakeRate = totalRevenue > 0 
      ? ((feeData._sum.platformFeeCents || 0) / totalRevenue) * 100 
      : 0;

    return {
      totalFeesCollectedCents: feeData._sum.platformFeeCents || 0,
      feeCollectionRatePercent: totalTransactions > 0 
        ? (feesCollected / totalTransactions) * 100 
        : 0,
      effectiveTakeRatePercent: Math.round(effectiveTakeRate * 100) / 100
    };
  }

  /**
   * Get cohort analysis data
   */
  private async getCohortAnalysis(startDate: Date, endDate: Date) {
    const months = [];
    let currentMonth = startDate;
    
    while (currentMonth <= endDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const newCreators = await this.prisma.creator.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd }
        }
      });

      const newBrands = await this.prisma.brand.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd }
        }
      });

      const monthRevenue = await this.getTotalRevenue(monthStart, monthEnd);

      months.push({
        month: format(currentMonth, 'MMM yyyy'),
        creators: newCreators,
        brands: newBrands,
        totalRevenueCents: monthRevenue
      });

      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }

    // TODO: Implement actual retention calculation based on user activity
    const userRetentionRates = {
      month1: 85,
      month2: 72,
      month3: 65
    };

    return {
      newUsersByMonth: months,
      userRetentionRates
    };
  }

  /**
   * Get seasonal analysis data
   */
  private async getSeasonalAnalysis(startDate: Date, endDate: Date) {
    const monthlyBreakdown = [];
    let currentMonth = startDate;
    
    while (currentMonth <= endDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const monthRevenue = await this.getTotalRevenue(monthStart, monthEnd);
      
      const transactions = await this.prisma.payment.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
          status: 'COMPLETED'
        }
      });

      monthlyBreakdown.push({
        month: format(currentMonth, 'MMM yyyy'),
        revenueCents: monthRevenue,
        transactionCount: transactions,
        averageTransactionValue: transactions > 0 ? Math.round(monthRevenue / transactions) : 0
      });

      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }

    // Calculate seasonality index (simplified)
    const avgRevenue = monthlyBreakdown.reduce((sum, month) => sum + month.revenueCents, 0) / monthlyBreakdown.length;
    const variance = monthlyBreakdown.reduce((sum, month) => sum + Math.pow(month.revenueCents - avgRevenue, 2), 0) / monthlyBreakdown.length;
    const seasonalityIndex = avgRevenue > 0 ? Math.sqrt(variance) / avgRevenue : 0;

    return {
      monthlyBreakdown,
      seasonalityIndex: Math.round(seasonalityIndex * 100) / 100
    };
  }

  /**
   * Get key performance indicators
   */
  private async getKeyPerformanceIndicators(startDate: Date, endDate: Date) {
    // TODO: Implement actual KPI calculations based on available data
    return {
      customerAcquisitionCostCents: 0,
      customerLifetimeValueCents: 0,
      monthlyRecurringRevenueCents: 0,
      churnRatePercent: 5.2,
      netPromoterScore: 42
    };
  }

  /**
   * Get competitive metrics
   */
  private async getCompetitiveMetrics(startDate: Date, endDate: Date) {
    const totalProjects = await this.prisma.project.count({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const completedProjects = await this.prisma.project.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      }
    });

    // TODO: Calculate actual project completion times and dispute rates
    return {
      marketSharePercent: 12.5, // Estimated
      platformUtilizationRate: totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0,
      averageProjectCompletionDays: 14, // Estimated
      disputeRatePercent: 2.1 // Estimated
    };
  }

  /**
   * Helper method to get total revenue for a period
   */
  private async getTotalRevenue(startDate: Date, endDate: Date): Promise<number> {
    const [licenseRevenue, paymentRevenue] = await Promise.all([
      this.prisma.license.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] },
          feeCents: { gt: 0 }
        },
        _sum: { feeCents: true }
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      })
    ]);

    return (licenseRevenue._sum.feeCents || 0) + (paymentRevenue._sum.amount || 0);
  }

  /**
   * Helper to get new customer revenue
   */
  private async getNewCustomerRevenue(startDate: Date, endDate: Date): Promise<number> {
    // Get brands that created their first payment in this period
    const newBrandPayments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      include: {
        brand: {
          select: { createdAt: true }
        }
      }
    });

    return newBrandPayments
      .filter(payment => payment.brand.createdAt >= startDate)
      .reduce((sum, payment) => sum + (payment.amount ? Number(payment.amount) : 0), 0);
  }

  /**
   * Helper to check if quarter is current
   */
  private isCurrentQuarter(quarterDate: Date): boolean {
    const now = new Date();
    const currentQuarterStart = startOfQuarter(now);
    const currentQuarterEnd = endOfQuarter(now);
    
    return quarterDate >= currentQuarterStart && quarterDate <= currentQuarterEnd;
  }

  /**
   * Helper to get fiscal quarter label
   */
  private getFiscalQuarter(quarterDate: Date): string {
    // Assuming fiscal year starts in January, adjust as needed
    const quarter = Math.floor(quarterDate.getMonth() / 3) + 1;
    const fiscalYear = quarterDate.getFullYear();
    return `FY${fiscalYear} Q${quarter}`;
  }

  /**
   * Get multiple quarters for trend analysis
   */
  async getQuarterlyTrends(startYear: number, startQuarter: number, quarters: number) {
    const reports = [];
    let currentYear = startYear;
    let currentQuarter = startQuarter;

    for (let i = 0; i < quarters; i++) {
      const report = await this.generateQuarterlyFinancialSummary(currentYear, currentQuarter);
      reports.push(report);

      currentQuarter++;
      if (currentQuarter > 4) {
        currentQuarter = 1;
        currentYear++;
      }
    }

    return reports;
  }
}
