/**
 * Financial Reporting Service
 * 
 * Generates comprehensive financial statements aggregating platform-wide revenue,
 * expenses, and financial performance metrics with period comparisons and forecasting.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { 
  FinancialStatementReport, 
  FinancialSummary, 
  RevenueBreakdown,
  ExpenseBreakdown,
  NetIncomeAnalysis,
  CashFlowSummary,
  BalanceSheetSummary,
  BaseReportConfig 
} from '../types';
import { FinancialStatementReportConfig } from '../schemas/report.schema';
import { ReportDataSourceError, ReportGenerationError } from '../errors/report.errors';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export class FinancialReportingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive financial statement report
   */
  async generateFinancialStatement(config: FinancialStatementReportConfig): Promise<FinancialStatementReport> {
    try {
      const [
        summary,
        revenueBreakdown,
        expenseBreakdown,
        netIncome,
        cashFlow,
        balanceSheet
      ] = await Promise.all([
        this.generateFinancialSummary(config.startDate, config.endDate, config.filters),
        this.generateRevenueBreakdown(config.startDate, config.endDate, config.filters),
        this.generateExpenseBreakdown(config.startDate, config.endDate, config.filters),
        this.generateNetIncomeAnalysis(config.startDate, config.endDate, config.filters),
        this.generateCashFlowSummary(config.startDate, config.endDate, config.filters),
        this.generateBalanceSheetSummary(config.endDate, config.filters)
      ]);

      return {
        ...config,
        type: 'financial_statement',
        generatedAt: new Date(),
        data: {
          summary,
          revenueBreakdown,
          expenseBreakdown,
          netIncome,
          cashFlow,
          balanceSheet
        }
      };
    } catch (error) {
      throw new ReportGenerationError(
        'Failed to generate financial statement',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Generate financial summary metrics
   */
  private async generateFinancialSummary(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<FinancialSummary> {
    try {
      const whereClause = this.buildWhereClause(startDate, endDate, filters);

      // Aggregate license revenue
      const licenseRevenue = await this.prisma.license.aggregate({
        where: {
          ...whereClause,
          status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] }
        },
        _sum: { feeCents: true },
        _count: { id: true }
      });

      // Aggregate royalty payments
      const royaltyData = await this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['PENDING', 'REVIEWED', 'PAID'] }
        },
        _sum: { 
          totalEarningsCents: true
        }
      });

      // Count unique active users
      const [activeCreators, activeBrands] = await Promise.all([
        this.prisma.creator.count({
          where: {
            royaltyStatements: {
              some: {
                createdAt: { gte: startDate, lte: endDate }
              }
            }
          }
        }),
        this.prisma.brand.count({
          where: {
            licenses: {
              some: {
                createdAt: { gte: startDate, lte: endDate }
              }
            }
          }
        })
      ]);

      const totalRevenueCents = (licenseRevenue._sum.feeCents || 0);
      const totalPayoutsCents = (royaltyData._sum?.totalEarningsCents || 0);
      const totalPlatformFeesCents = 0; // Calculate separately from payouts
      const netRevenueCents = totalRevenueCents - totalPayoutsCents;
      const transactionCount = licenseRevenue._count.id || 0;

      return {
        totalRevenueCents,
        totalPayoutsCents,
        totalPlatformFeesCents,
        netRevenueCents,
        grossMarginPercent: totalRevenueCents > 0 ? (netRevenueCents / totalRevenueCents) * 100 : 0,
        transactionCount,
        activeCreators,
        activeBrands,
        averageTransactionCents: transactionCount > 0 ? totalRevenueCents / transactionCount : 0
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'financial_summary',
        `Failed to generate financial summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate revenue breakdown analysis
   */
  private async generateRevenueBreakdown(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<RevenueBreakdown> {
    try {
      // Monthly revenue breakdown
      const monthlyRevenue = await this.getMonthlyRevenue(startDate, endDate, filters);

      // Revenue by license type
      const licenseTypeRevenue = await this.prisma.license.groupBy({
        by: ['licenseType'],
        where: this.buildWhereClause(startDate, endDate, filters),
        _sum: { feeCents: true },
        orderBy: { _sum: { feeCents: 'desc' } }
      });

      // Revenue by asset type (using licenseType)
      const assetTypeRevenue = await this.prisma.license.groupBy({
        by: ['licenseType'],
        where: this.buildWhereClause(startDate, endDate, filters),
        _sum: { feeCents: true }
      });

      const totalRevenue = licenseTypeRevenue.reduce((sum, item) => sum + (item._sum.feeCents || 0), 0);

      return {
        byMonth: monthlyRevenue,
        byLicenseType: licenseTypeRevenue.map(item => ({
          type: item.licenseType,
          revenueCents: item._sum.feeCents || 0,
          percentage: totalRevenue > 0 ? ((item._sum.feeCents || 0) / totalRevenue) * 100 : 0
        })),
        byAssetType: await this.aggregateAssetTypeRevenue(assetTypeRevenue, totalRevenue),
        byRegion: [] // Placeholder - would need geo data
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'revenue_breakdown',
        `Failed to generate revenue breakdown: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate expense breakdown
   */
  private async generateExpenseBreakdown(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<ExpenseBreakdown> {
    try {
      const payouts = await this.prisma.payout.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        _sum: { amountCents: true }
      });

      // Platform fees calculation
      const royaltyFees = await this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate }
        },
        _sum: { totalEarningsCents: true }
      });

      const payoutsCents = payouts._sum.amountCents || 0;
      const processingFeesCents = (royaltyFees._sum?.totalEarningsCents || 0) * 0.1; // Estimate platform fee as 10%
      const operatingExpensesCents = 0; // Would be pulled from accounting system
      const totalExpensesCents = payoutsCents + processingFeesCents + operatingExpensesCents;

      return {
        payoutsCents,
        processingFeesCents,
        operatingExpensesCents,
        totalExpensesCents
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'expense_breakdown',
        `Failed to generate expense breakdown: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate net income analysis
   */
  private async generateNetIncomeAnalysis(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<NetIncomeAnalysis> {
    try {
      const [summary, expenses] = await Promise.all([
        this.generateFinancialSummary(startDate, endDate, filters),
        this.generateExpenseBreakdown(startDate, endDate, filters)
      ]);

      const grossIncomeCents = summary.totalRevenueCents;
      const totalExpensesCents = expenses.totalExpensesCents;
      const netIncomeCents = grossIncomeCents - totalExpensesCents;
      const marginPercent = grossIncomeCents > 0 ? (netIncomeCents / grossIncomeCents) * 100 : 0;

      // Calculate year-over-year growth
      const yearAgo = new Date(startDate);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const yearAgoEnd = new Date(endDate);
      yearAgoEnd.setFullYear(yearAgoEnd.getFullYear() - 1);

      const previousYearSummary = await this.generateFinancialSummary(yearAgo, yearAgoEnd, filters);
      const previousYearExpenses = await this.generateExpenseBreakdown(yearAgo, yearAgoEnd, filters);
      const previousNetIncome = previousYearSummary.totalRevenueCents - previousYearExpenses.totalExpensesCents;

      const yearOverYearGrowth = previousNetIncome > 0 
        ? ((netIncomeCents - previousNetIncome) / previousNetIncome) * 100 
        : 0;

      return {
        grossIncomeCents,
        totalExpensesCents,
        netIncomeCents,
        marginPercent,
        yearOverYearGrowth
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'net_income_analysis',
        `Failed to generate net income analysis: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate cash flow summary
   */
  private async generateCashFlowSummary(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<CashFlowSummary> {
    try {
      // Operating cash flow (revenue - payouts)
      const [revenue, payouts] = await Promise.all([
        this.prisma.license.aggregate({
          where: this.buildWhereClause(startDate, endDate, filters),
          _sum: { feeCents: true }
        }),
        this.prisma.payout.aggregate({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: 'COMPLETED'
          },
          _sum: { amountCents: true }
        })
      ]);

      const operatingCashFlowCents = (revenue._sum.feeCents || 0) - (payouts._sum.amountCents || 0);
      const investingCashFlowCents = 0; // Platform investments
      const financingCashFlowCents = 0; // Financing activities
      const netCashFlowCents = operatingCashFlowCents + investingCashFlowCents + financingCashFlowCents;

      // Simplified cash positions
      const cashBeginningCents = 0; // Would track actual cash balances
      const cashEndingCents = cashBeginningCents + netCashFlowCents;

      return {
        operatingCashFlowCents,
        investingCashFlowCents,
        financingCashFlowCents,
        netCashFlowCents,
        cashBeginningCents,
        cashEndingCents
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'cash_flow_summary',
        `Failed to generate cash flow summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate balance sheet summary
   */
  private async generateBalanceSheetSummary(
    endDate: Date,
    filters?: any
  ): Promise<BalanceSheetSummary> {
    try {
      // Pending payouts (liability) - using totalEarningsCents as approximation
      const pendingPayouts = await this.prisma.royaltyStatement.aggregate({
        where: {
          status: { in: ['PENDING', 'REVIEWED'] },
          createdAt: { lte: endDate }
        },
        _sum: { totalEarningsCents: true }
      });

      const pendingPayoutsCents = (pendingPayouts._sum?.totalEarningsCents || 0) * 0.9; // Estimate net payable as 90% of total

      // Simplified balance sheet structure
      const currentAssetsCents = 0; // Cash, receivables
      const totalAssetsCents = currentAssetsCents;
      const currentLiabilitiesCents = pendingPayoutsCents;
      const totalLiabilitiesCents = currentLiabilitiesCents;
      const equityCents = totalAssetsCents - totalLiabilitiesCents;

      return {
        currentAssetsCents,
        totalAssetsCents,
        currentLiabilitiesCents,
        totalLiabilitiesCents,
        equityCents,
        pendingPayoutsCents
      };
    } catch (error) {
      throw new ReportDataSourceError(
        'balance_sheet_summary',
        `Failed to generate balance sheet summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Build where clause for database queries
   */
  private buildWhereClause(startDate: Date, endDate: Date, filters?: any) {
    const where: any = {
      createdAt: { gte: startDate, lte: endDate }
    };

    if (filters?.brandIds?.length) {
      where.brandId = { in: filters.brandIds };
    }

    if (filters?.licenseTypes?.length) {
      where.licenseType = { in: filters.licenseTypes };
    }

    return where;
  }

  /**
   * Get monthly revenue breakdown
   */
  private async getMonthlyRevenue(startDate: Date, endDate: Date, filters?: any) {
    const monthlyData = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      const revenue = await this.prisma.license.aggregate({
        where: this.buildWhereClause(monthStart, monthEnd, filters),
        _sum: { feeCents: true }
      });

      const previousMonth = new Date(monthStart);
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      const previousMonthEnd = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
      
      const previousRevenue = await this.prisma.license.aggregate({
        where: this.buildWhereClause(previousMonth, previousMonthEnd, filters),
        _sum: { feeCents: true }
      });

      const currentRevenue = revenue._sum.feeCents || 0;
      const prevRevenue = previousRevenue._sum.feeCents || 0;
      const growth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      monthlyData.push({
        month: monthStart.toISOString().substring(0, 7), // YYYY-MM format
        revenueCents: currentRevenue,
        growth
      });

      current.setMonth(current.getMonth() + 1);
    }

    return monthlyData;
  }

  /**
   * Aggregate asset type revenue
   */
  private async aggregateAssetTypeRevenue(assetTypeData: any[], totalRevenue: number) {
    // Group by asset type from IP assets
    const assetTypes = new Map<string, number>();
    
    for (const item of assetTypeData) {
      if (item.ipAsset?.type) {
        const current = assetTypes.get(item.ipAsset.type) || 0;
        assetTypes.set(item.ipAsset.type, current + (item._sum.feeCents || 0));
      }
    }

    return Array.from(assetTypes.entries()).map(([type, revenueCents]) => ({
      type,
      revenueCents,
      percentage: totalRevenue > 0 ? (revenueCents / totalRevenue) * 100 : 0
    }));
  }

  /**
   * Get revenue time series data with intelligent granularity
   */
  async getRevenueTimeSeries(
    startDate: Date,
    endDate: Date,
    granularity: 'daily' | 'weekly' | 'monthly',
    filters?: any
  ) {
    const timeSeries = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      let periodStart: Date;
      let periodEnd: Date;

      switch (granularity) {
        case 'daily':
          periodStart = new Date(current);
          periodEnd = new Date(current);
          periodEnd.setDate(periodEnd.getDate() + 1);
          break;
        case 'weekly':
          periodStart = new Date(current);
          periodStart.setDate(periodStart.getDate() - periodStart.getDay());
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + 7);
          break;
        case 'monthly':
          periodStart = new Date(current.getFullYear(), current.getMonth(), 1);
          periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
          break;
      }

      // Get revenue and transaction count for period
      const [revenue, transactions] = await Promise.all([
        this.prisma.license.aggregate({
          where: {
            ...this.buildWhereClause(periodStart, periodEnd, filters),
            status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] }
          },
          _sum: { feeCents: true }
        }),
        this.prisma.license.count({
          where: {
            ...this.buildWhereClause(periodStart, periodEnd, filters),
            status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] }
          }
        })
      ]);

      timeSeries.push({
        period: periodStart.toISOString().split('T')[0],
        periodStart,
        periodEnd: new Date(periodEnd.getTime() - 1), // Adjust to not overlap
        revenueCents: revenue._sum.feeCents || 0,
        transactionCount: transactions
      });

      // Advance to next period
      switch (granularity) {
        case 'daily':
          current.setDate(current.getDate() + 1);
          break;
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    return timeSeries;
  }

  /**
   * Get total revenue for a period
   */
  async getTotalRevenue(startDate: Date, endDate: Date, filters?: any): Promise<number> {
    const result = await this.prisma.license.aggregate({
      where: {
        ...this.buildWhereClause(startDate, endDate, filters),
        status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] }
      },
      _sum: { feeCents: true }
    });

    return result._sum.feeCents || 0;
  }
}
