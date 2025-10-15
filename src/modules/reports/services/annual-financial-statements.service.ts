/**
 * Annual Financial Statements Service
 * 
 * Generates comprehensive annual financial statements representing the platform's
 * yearly financial performance with proper year-end closing procedures.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfYear, endOfYear, subYears, format, startOfMonth, endOfMonth } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface AnnualFinancialStatementData {
  fiscalYear: number;
  period: {
    startDate: Date;
    endDate: Date;
  };
  profitAndLoss: {
    totalRevenueCents: number;
    revenueByCategory: {
      licenseFees: number;
      revenueShare: number;
      subscriptions: number;
      other: number;
    };
    totalExpensesCents: number;
    expensesByCategory: {
      creatorPayouts: number;
      operationalExpenses: number;
      marketingExpenses: number;
      technologyExpenses: number;
      administrativeExpenses: number;
    };
    grossProfitCents: number;
    netIncomeCents: number;
    ebitdaCents: number;
  };
  balanceSheet: {
    assets: {
      cashAndEquivalentsCents: number;
      accountsReceivableCents: number;
      prepaidExpensesCents: number;
      technologyAssetsCents: number;
      totalAssetsCents: number;
    };
    liabilities: {
      accountsPayableCents: number;
      accruedExpensesCents: number;
      deferredRevenueCents: number;
      totalLiabilitiesCents: number;
    };
    equity: {
      retainedEarningsCents: number;
      currentYearEarningsCents: number;
      totalEquityCents: number;
    };
  };
  cashFlowStatement: {
    operatingActivities: {
      netIncomeCents: number;
      accountsReceivableChangeCents: number;
      accountsPayableChangeCents: number;
      netCashFromOperationsCents: number;
    };
    investingActivities: {
      technologyInvestmentsCents: number;
      netCashFromInvestingCents: number;
    };
    financingActivities: {
      capitalContributionsCents: number;
      netCashFromFinancingCents: number;
    };
    netCashChangeCents: number;
  };
  keyPerformanceIndicators: {
    annualRecurringRevenueCents: number;
    customerLifetimeValueCents: number;
    customerAcquisitionCostCents: number;
    churnRatePercent: number;
    retentionRatePercent: number;
    grossMarginPercent: number;
    netMarginPercent: number;
    revenueGrowthRatePercent: number;
  };
  yearOverYearComparison: {
    revenueGrowthPercent: number;
    expenseGrowthPercent: number;
    profitGrowthPercent: number;
    userGrowthPercent: number;
    transactionGrowthPercent: number;
  };
  monthlyBreakdown: Array<{
    month: string;
    revenueCents: number;
    expensesCents: number;
    netIncomeCents: number;
    transactionCount: number;
    newUsers: number;
  }>;
  revenueBySegment: {
    creatorTier: Array<{
      tier: string;
      revenueCents: number;
      userCount: number;
      averageRevenuePerUserCents: number;
    }>;
    brandIndustry: Array<{
      industry: string;
      revenueCents: number;
      brandCount: number;
      averageSpendCents: number;
    }>;
    geographic: Array<{
      region: string;
      revenueCents: number;
      percentage: number;
    }>;
  };
  seasonalityAnalysis: {
    quarterlyTrends: Array<{
      quarter: string;
      revenueCents: number;
      seasonalityIndex: number;
    }>;
    peakSeasons: string[];
    lowSeasons: string[];
  };
  auditTrail: {
    dataValidationChecks: Array<{
      check: string;
      status: 'PASS' | 'FAIL' | 'WARNING';
      details?: string;
    }>;
    reconciliationSummary: {
      monthlyTotalsCents: number;
      annualTotalCents: number;
      varianceCents: number;
      variancePercentage: number;
    };
  };
}

export class AnnualFinancialStatementsService {
  private readonly cacheKeyPrefix = 'annual_statement';
  private readonly cacheTTL = 86400; // 24 hours cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive annual financial statement
   */
  async generateAnnualFinancialStatement(
    fiscalYear: number
  ): Promise<AnnualFinancialStatementData> {
    const yearStart = startOfYear(new Date(fiscalYear, 0, 1));
    const yearEnd = endOfYear(new Date(fiscalYear, 11, 31));
    const isCurrentYear = fiscalYear === new Date().getFullYear();

    // Check cache for completed years
    if (!isCurrentYear) {
      const cacheKey = `${this.cacheKeyPrefix}:${fiscalYear}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const [
      profitAndLoss,
      balanceSheet,
      cashFlowStatement,
      kpis,
      yearOverYearComparison,
      monthlyBreakdown,
      revenueBySegment,
      seasonalityAnalysis,
      auditTrail
    ] = await Promise.all([
      this.generateProfitAndLoss(yearStart, yearEnd),
      this.generateBalanceSheet(yearEnd, fiscalYear),
      this.generateCashFlowStatement(yearStart, yearEnd, fiscalYear),
      this.calculateKeyPerformanceIndicators(yearStart, yearEnd, fiscalYear),
      this.generateYearOverYearComparison(fiscalYear),
      this.generateMonthlyBreakdown(yearStart, yearEnd),
      this.generateRevenueBySegment(yearStart, yearEnd),
      this.generateSeasonalityAnalysis(yearStart, yearEnd),
      this.generateAuditTrail(yearStart, yearEnd)
    ]);

    const statement: AnnualFinancialStatementData = {
      fiscalYear,
      period: {
        startDate: yearStart,
        endDate: yearEnd,
      },
      profitAndLoss,
      balanceSheet,
      cashFlowStatement,
      keyPerformanceIndicators: kpis,
      yearOverYearComparison,
      monthlyBreakdown,
      revenueBySegment,
      seasonalityAnalysis,
      auditTrail
    };

    // Cache completed years permanently, current year for 24 hours
    const cacheTTL = isCurrentYear ? this.cacheTTL : 86400 * 365; // 1 year for historical
    const cacheKey = `${this.cacheKeyPrefix}:${fiscalYear}`;
    await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(statement));

    return statement;
  }

  /**
   * Generate profit and loss statement
   */
  private async generateProfitAndLoss(startDate: Date, endDate: Date) {
    // Revenue calculations
    const [licenseRevenue, paymentRevenue, royaltyData] = await Promise.all([
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
      }),
      this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['REVIEWED', 'PAID'] }
        },
        _sum: { 
          totalEarningsCents: true
        }
      })
    ]);

    const totalRevenueCents = (licenseRevenue._sum.feeCents || 0) + 
                             Number(paymentRevenue._sum.amount || 0);

    const revenueByCategory = {
      licenseFees: licenseRevenue._sum.feeCents || 0,
      revenueShare: royaltyData._sum?.totalEarningsCents || 0,
      subscriptions: 0, // TODO: Implement when subscriptions are added
      other: Number(paymentRevenue._sum.amount || 0) - (licenseRevenue._sum.feeCents || 0)
    };

    // Expense calculations
    const creatorPayouts = await this.prisma.payout.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    const creatorPayoutsCents = creatorPayouts._sum.amountCents || 0;
    
    // Estimated operational expenses (in a real implementation, these would come from an accounting system)
    const operationalExpensesCents = Math.round(totalRevenueCents * 0.15); // 15% estimated
    const marketingExpensesCents = Math.round(totalRevenueCents * 0.08);   // 8% estimated
    const technologyExpensesCents = Math.round(totalRevenueCents * 0.12);  // 12% estimated
    const administrativeExpensesCents = Math.round(totalRevenueCents * 0.05); // 5% estimated

    const totalExpensesCents = creatorPayoutsCents + operationalExpensesCents + 
                              marketingExpensesCents + technologyExpensesCents + 
                              administrativeExpensesCents;

    const grossProfitCents = totalRevenueCents - creatorPayoutsCents;
    const netIncomeCents = totalRevenueCents - totalExpensesCents;
    
    // EBITDA (earnings before interest, taxes, depreciation, and amortization)
    const ebitdaCents = netIncomeCents; // Simplified calculation

    return {
      totalRevenueCents,
      revenueByCategory,
      totalExpensesCents,
      expensesByCategory: {
        creatorPayouts: creatorPayoutsCents,
        operationalExpenses: operationalExpensesCents,
        marketingExpenses: marketingExpensesCents,
        technologyExpenses: technologyExpensesCents,
        administrativeExpenses: administrativeExpensesCents
      },
      grossProfitCents,
      netIncomeCents,
      ebitdaCents
    };
  }

  /**
   * Generate balance sheet
   */
  private async generateBalanceSheet(endDate: Date, fiscalYear: number) {
    // Assets
    const accountsReceivable = await this.prisma.payment.aggregate({
      where: {
        createdAt: { lte: endDate },
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      _sum: { amount: true }
    });

    // Liabilities
    const accountsPayable = await this.prisma.payout.aggregate({
      where: {
        createdAt: { lte: endDate },
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      _sum: { amountCents: true }
    });

    // Estimated values (in a real implementation, these would come from accounting systems)
    const cashAndEquivalentsCents = 5000000; // $50,000 estimated
    const prepaidExpensesCents = 1000000;    // $10,000 estimated
    const technologyAssetsCents = 15000000;  // $150,000 estimated

    const accountsReceivableCents = Number(accountsReceivable._sum.amount || 0);
    const totalAssetsCents = cashAndEquivalentsCents + accountsReceivableCents + 
                            prepaidExpensesCents + technologyAssetsCents;

    const accountsPayableCents = accountsPayable._sum?.amountCents || 0;
    const accruedExpensesCents = Math.round(totalAssetsCents * 0.05); // 5% estimated
    const deferredRevenueCents = Math.round(totalAssetsCents * 0.03); // 3% estimated
    const totalLiabilitiesCents = accountsPayableCents + accruedExpensesCents + deferredRevenueCents;

    // Get previous year retained earnings and current year income
    const currentYearPL = await this.generateProfitAndLoss(
      startOfYear(new Date(fiscalYear, 0, 1)),
      endDate
    );

    const retainedEarningsCents = totalAssetsCents - totalLiabilitiesCents - currentYearPL.netIncomeCents;
    const totalEquityCents = retainedEarningsCents + currentYearPL.netIncomeCents;

    return {
      assets: {
        cashAndEquivalentsCents,
        accountsReceivableCents,
        prepaidExpensesCents,
        technologyAssetsCents,
        totalAssetsCents
      },
      liabilities: {
        accountsPayableCents,
        accruedExpensesCents,
        deferredRevenueCents,
        totalLiabilitiesCents
      },
      equity: {
        retainedEarningsCents,
        currentYearEarningsCents: currentYearPL.netIncomeCents,
        totalEquityCents
      }
    };
  }

  /**
   * Generate cash flow statement
   */
  private async generateCashFlowStatement(startDate: Date, endDate: Date, fiscalYear: number) {
    const profitLoss = await this.generateProfitAndLoss(startDate, endDate);
    
    // Operating activities
    const previousYearEnd = endOfYear(new Date(fiscalYear - 1, 11, 31));
    
    const currentAR = await this.getAccountsReceivable(endDate);
    const previousAR = await this.getAccountsReceivable(previousYearEnd);
    const arChangeCents = currentAR - previousAR;

    const currentAP = await this.getAccountsPayable(endDate);
    const previousAP = await this.getAccountsPayable(previousYearEnd);
    const apChangeCents = currentAP - previousAP;

    const netCashFromOperationsCents = profitLoss.netIncomeCents - arChangeCents + apChangeCents;

    // Investing activities (estimated)
    const technologyInvestmentsCents = Math.round(profitLoss.totalRevenueCents * 0.12); // 12% reinvestment
    const netCashFromInvestingCents = -technologyInvestmentsCents;

    // Financing activities (estimated)
    const capitalContributionsCents = 0; // No additional capital assumed
    const netCashFromFinancingCents = capitalContributionsCents;

    const netCashChangeCents = netCashFromOperationsCents + netCashFromInvestingCents + netCashFromFinancingCents;

    return {
      operatingActivities: {
        netIncomeCents: profitLoss.netIncomeCents,
        accountsReceivableChangeCents: -arChangeCents,
        accountsPayableChangeCents: apChangeCents,
        netCashFromOperationsCents
      },
      investingActivities: {
        technologyInvestmentsCents: -technologyInvestmentsCents,
        netCashFromInvestingCents
      },
      financingActivities: {
        capitalContributionsCents,
        netCashFromFinancingCents
      },
      netCashChangeCents
    };
  }

  /**
   * Calculate key performance indicators
   */
  private async calculateKeyPerformanceIndicators(startDate: Date, endDate: Date, fiscalYear: number) {
    const profitLoss = await this.generateProfitAndLoss(startDate, endDate);
    
    // Annual Recurring Revenue (based on active licenses)
    const activeLicenses = await this.prisma.license.count({
      where: {
        status: 'ACTIVE',
        endDate: { gte: endDate }
      }
    });

    const avgLicenseValue = activeLicenses > 0 
      ? profitLoss.revenueByCategory.licenseFees / activeLicenses 
      : 0;
    const annualRecurringRevenueCents = avgLicenseValue * activeLicenses;

    // User metrics
    const totalUsers = await this.prisma.user.count({
      where: { createdAt: { lte: endDate } }
    });

    const newUsers = await this.prisma.user.count({
      where: { createdAt: { gte: startDate, lte: endDate } }
    });

    const customerAcquisitionCostCents = newUsers > 0 
      ? Math.round(profitLoss.expensesByCategory.marketingExpenses / newUsers)
      : 0;

    const customerLifetimeValueCents = totalUsers > 0 
      ? Math.round(profitLoss.totalRevenueCents / totalUsers * 3) // 3-year LTV estimate
      : 0;

    // Calculate margins
    const grossMarginPercent = profitLoss.totalRevenueCents > 0 
      ? (profitLoss.grossProfitCents / profitLoss.totalRevenueCents) * 100 
      : 0;

    const netMarginPercent = profitLoss.totalRevenueCents > 0 
      ? (profitLoss.netIncomeCents / profitLoss.totalRevenueCents) * 100 
      : 0;

    // Year-over-year growth
    const previousYearRevenue = await this.getTotalRevenue(
      startOfYear(new Date(fiscalYear - 1, 0, 1)),
      endOfYear(new Date(fiscalYear - 1, 11, 31))
    );

    const revenueGrowthRatePercent = previousYearRevenue > 0 
      ? ((profitLoss.totalRevenueCents - previousYearRevenue) / previousYearRevenue) * 100 
      : 0;

    return {
      annualRecurringRevenueCents,
      customerLifetimeValueCents,
      customerAcquisitionCostCents,
      churnRatePercent: 8.5, // TODO: Calculate based on user activity
      retentionRatePercent: 91.5,
      grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
      netMarginPercent: Math.round(netMarginPercent * 100) / 100,
      revenueGrowthRatePercent: Math.round(revenueGrowthRatePercent * 100) / 100
    };
  }

  /**
   * Generate year-over-year comparison
   */
  private async generateYearOverYearComparison(fiscalYear: number) {
    const currentYear = await this.generateProfitAndLoss(
      startOfYear(new Date(fiscalYear, 0, 1)),
      endOfYear(new Date(fiscalYear, 11, 31))
    );

    const previousYear = await this.generateProfitAndLoss(
      startOfYear(new Date(fiscalYear - 1, 0, 1)),
      endOfYear(new Date(fiscalYear - 1, 11, 31))
    );

    const calculateGrowth = (current: number, previous: number) => {
      return previous > 0 ? ((current - previous) / previous) * 100 : 0;
    };

    const currentYearUsers = await this.prisma.user.count({
      where: { createdAt: { lte: endOfYear(new Date(fiscalYear, 11, 31)) } }
    });

    const previousYearUsers = await this.prisma.user.count({
      where: { createdAt: { lte: endOfYear(new Date(fiscalYear - 1, 11, 31)) } }
    });

    const currentTransactions = await this.prisma.payment.count({
      where: {
        createdAt: { 
          gte: startOfYear(new Date(fiscalYear, 0, 1)),
          lte: endOfYear(new Date(fiscalYear, 11, 31))
        },
        status: 'COMPLETED'
      }
    });

    const previousTransactions = await this.prisma.payment.count({
      where: {
        createdAt: { 
          gte: startOfYear(new Date(fiscalYear - 1, 0, 1)),
          lte: endOfYear(new Date(fiscalYear - 1, 11, 31))
        },
        status: 'COMPLETED'
      }
    });

    return {
      revenueGrowthPercent: Math.round(calculateGrowth(currentYear.totalRevenueCents, previousYear.totalRevenueCents) * 100) / 100,
      expenseGrowthPercent: Math.round(calculateGrowth(currentYear.totalExpensesCents, previousYear.totalExpensesCents) * 100) / 100,
      profitGrowthPercent: Math.round(calculateGrowth(currentYear.netIncomeCents, previousYear.netIncomeCents) * 100) / 100,
      userGrowthPercent: Math.round(calculateGrowth(currentYearUsers, previousYearUsers) * 100) / 100,
      transactionGrowthPercent: Math.round(calculateGrowth(currentTransactions, previousTransactions) * 100) / 100
    };
  }

  /**
   * Generate monthly breakdown
   */
  private async generateMonthlyBreakdown(startDate: Date, endDate: Date) {
    const breakdown = [];
    let currentMonth = startDate;

    while (currentMonth <= endDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const [monthlyPL, transactions, newUsers] = await Promise.all([
        this.generateProfitAndLoss(monthStart, monthEnd),
        this.prisma.payment.count({
          where: {
            createdAt: { gte: monthStart, lte: monthEnd },
            status: 'COMPLETED'
          }
        }),
        this.prisma.user.count({
          where: {
            createdAt: { gte: monthStart, lte: monthEnd }
          }
        })
      ]);

      breakdown.push({
        month: format(currentMonth, 'MMM yyyy'),
        revenueCents: monthlyPL.totalRevenueCents,
        expensesCents: monthlyPL.totalExpensesCents,
        netIncomeCents: monthlyPL.netIncomeCents,
        transactionCount: transactions,
        newUsers
      });

      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }

    return breakdown;
  }

  /**
   * Generate revenue by segment analysis
   */
  private async generateRevenueBySegment(startDate: Date, endDate: Date) {
    // Creator tier analysis (simplified)
    const creatorTiers = [
      { tier: 'Top Performers (Top 10%)', revenueCents: 0, userCount: 0, averageRevenuePerUserCents: 0 },
      { tier: 'Regular Creators (Middle 80%)', revenueCents: 0, userCount: 0, averageRevenuePerUserCents: 0 },
      { tier: 'New Creators (Bottom 10%)', revenueCents: 0, userCount: 0, averageRevenuePerUserCents: 0 }
    ];

    // Brand industry analysis (would require industry classification)
    const brandIndustries = [
      { industry: 'Technology', revenueCents: 0, brandCount: 0, averageSpendCents: 0 },
      { industry: 'Fashion', revenueCents: 0, brandCount: 0, averageSpendCents: 0 },
      { industry: 'Entertainment', revenueCents: 0, brandCount: 0, averageSpendCents: 0 },
      { industry: 'Other', revenueCents: 0, brandCount: 0, averageSpendCents: 0 }
    ];

    // Geographic analysis (would require location data)
    const geographic = [
      { region: 'North America', revenueCents: 0, percentage: 0 },
      { region: 'Europe', revenueCents: 0, percentage: 0 },
      { region: 'Asia Pacific', revenueCents: 0, percentage: 0 },
      { region: 'Other', revenueCents: 0, percentage: 0 }
    ];

    return {
      creatorTier: creatorTiers,
      brandIndustry: brandIndustries,
      geographic
    };
  }

  /**
   * Generate seasonality analysis
   */
  private async generateSeasonalityAnalysis(startDate: Date, endDate: Date) {
    const quarterlyTrends = [];
    
    for (let q = 1; q <= 4; q++) {
      const quarterStart = new Date(startDate.getFullYear(), (q - 1) * 3, 1);
      const quarterEnd = endOfMonth(new Date(startDate.getFullYear(), q * 3 - 1, 1));
      
      if (quarterStart >= startDate && quarterEnd <= endDate) {
        const quarterRevenue = await this.getTotalRevenue(quarterStart, quarterEnd);
        
        quarterlyTrends.push({
          quarter: `Q${q} ${startDate.getFullYear()}`,
          revenueCents: quarterRevenue,
          seasonalityIndex: 1.0 // TODO: Calculate actual seasonality index
        });
      }
    }

    return {
      quarterlyTrends,
      peakSeasons: ['Q4'], // TODO: Calculate based on data
      lowSeasons: ['Q1']   // TODO: Calculate based on data
    };
  }

  /**
   * Generate audit trail and data validation
   */
  private async generateAuditTrail(startDate: Date, endDate: Date) {
    const checks = [];

    // Validate monthly totals vs annual total
    const monthlyBreakdown = await this.generateMonthlyBreakdown(startDate, endDate);
    const monthlyTotalsCents = monthlyBreakdown.reduce((sum, month) => sum + month.revenueCents, 0);
    const annualTotal = await this.getTotalRevenue(startDate, endDate);
    const varianceCents = Math.abs(monthlyTotalsCents - annualTotal);
    const variancePercentage = annualTotal > 0 ? (varianceCents / annualTotal) * 100 : 0;

    checks.push({
      check: 'Monthly totals reconciliation',
      status: variancePercentage < 1 ? 'PASS' : 'WARNING' as const,
      details: variancePercentage >= 1 ? `Variance: ${variancePercentage.toFixed(2)}%` : undefined
    });

    // Check for negative balances
    const negativePayouts = await this.prisma.payout.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        amountCents: { lt: 0 }
      }
    });

    checks.push({
      check: 'Negative payout amounts',
      status: negativePayouts === 0 ? 'PASS' : 'FAIL' as const,
      details: negativePayouts > 0 ? `Found ${negativePayouts} negative payouts` : undefined
    });

    // Check for incomplete transactions
    const incompleteTransactions = await this.prisma.payment.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['PENDING', 'PROCESSING'] }
      }
    });

    checks.push({
      check: 'Incomplete transactions',
      status: incompleteTransactions === 0 ? 'PASS' : 'WARNING' as const,
      details: incompleteTransactions > 0 ? `${incompleteTransactions} transactions still pending` : undefined
    });

    return {
      dataValidationChecks: checks,
      reconciliationSummary: {
        monthlyTotalsCents,
        annualTotalCents: annualTotal,
        varianceCents,
        variancePercentage: Math.round(variancePercentage * 100) / 100
      }
    };
  }

  // Helper methods
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

    return (licenseRevenue._sum.feeCents || 0) + Number(paymentRevenue._sum.amount || 0);
  }

  private async getAccountsReceivable(asOfDate: Date): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: {
        createdAt: { lte: asOfDate },
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      _sum: { amount: true }
    });
    return Number(result._sum.amount || 0);
  }

  private async getAccountsPayable(asOfDate: Date): Promise<number> {
    const result = await this.prisma.payout.aggregate({
      where: {
        createdAt: { lte: asOfDate },
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      _sum: { amountCents: true }
    });
    return result._sum?.amountCents || 0;
  }

  /**
   * Generate multi-year comparison
   */
  async getMultiYearComparison(startYear: number, years: number) {
    const statements = [];
    
    for (let i = 0; i < years; i++) {
      const year = startYear + i;
      const statement = await this.generateAnnualFinancialStatement(year);
      statements.push(statement);
    }

    return statements;
  }
}
