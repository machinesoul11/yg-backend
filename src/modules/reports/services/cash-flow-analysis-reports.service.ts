/**
 * Cash Flow Analysis Reports Service
 * 
 * Tracks actual movement of money into and out of the platform, focusing on liquidity 
 * and operational cash management with forecasting and aging analysis.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfDay, endOfDay, subDays, addDays, format, differenceInDays } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface CashFlowAnalysisData {
  period: {
    startDate: Date;
    endDate: Date;
  };
  cashFlowSummary: {
    totalInflowCents: number;
    totalOutflowCents: number;
    netCashFlowCents: number;
    cashFlowPositive: boolean;
  };
  operatingCashFlow: {
    brandPaymentsCents: number;
    subscriptionFeesCents: number;
    otherRevenueCents: number;
    creatorPayoutsCents: number;
    operationalExpensesCents: number;
    netOperatingCashFlowCents: number;
  };
  investingCashFlow: {
    technologyInvestmentsCents: number;
    assetAcquisitionsCents: number;
    netInvestingCashFlowCents: number;
  };
  financingCashFlow: {
    capitalRaisesCents: number;
    debtPaymentsCents: number;
    netFinancingCashFlowCents: number;
  };
  cashPositionAnalysis: {
    currentCashBalanceCents: number;
    projectedCashNeedsCents: number;
    cashReservesCents: number;
    burnRateCents: number;
    runwayDays: number;
  };
  paymentVelocityMetrics: {
    averagePaymentToPayoutDays: number;
    fastestPaymentToPayoutDays: number;
    slowestPaymentToPayoutDays: number;
    paymentProcessingBottlenecks: string[];
  };
  cashConversionCycle: {
    daysToCollectPayments: number;
    daysToPayCreators: number;
    netCashCycleDays: number;
    efficiencyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  };
  liquidity: {
    currentLiquidityCents: number;
    upcomingObligationsCents: number;
    liquidityRatio: number;
    liquidityStatus: 'HEALTHY' | 'ADEQUATE' | 'CONCERNING' | 'CRITICAL';
  };
  forecasting: {
    next30DaysInflowCents: number;
    next30DaysOutflowCents: number;
    next30DaysNetCashFlowCents: number;
    next90DaysProjectionCents: number;
    seasonalAdjustments: Array<{
      period: string;
      adjustmentFactor: number;
      projectedCashFlowCents: number;
    }>;
  };
  scenarios: {
    bestCase: {
      projectedInflowCents: number;
      projectedOutflowCents: number;
      netCashFlowCents: number;
    };
    worstCase: {
      projectedInflowCents: number;
      projectedOutflowCents: number;
      netCashFlowCents: number;
    };
    mostLikely: {
      projectedInflowCents: number;
      projectedOutflowCents: number;
      netCashFlowCents: number;
    };
  };
  dailyBreakdown: Array<{
    date: string;
    inflowCents: number;
    outflowCents: number;
    netFlowCents: number;
    cumulativeCashCents: number;
  }>;
}

export class CashFlowAnalysisReportsService {
  private readonly cacheKeyPrefix = 'cash_flow_analysis';
  private readonly cacheTTL = 1800; // 30 minutes cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive cash flow analysis report
   */
  async generateCashFlowAnalysisReport(
    startDate: Date,
    endDate: Date
  ): Promise<CashFlowAnalysisData> {
    const cacheKey = `${this.cacheKeyPrefix}:${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [
      cashFlowSummary,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      cashPositionAnalysis,
      paymentVelocityMetrics,
      cashConversionCycle,
      liquidity,
      forecasting,
      scenarios,
      dailyBreakdown
    ] = await Promise.all([
      this.getCashFlowSummary(startDate, endDate),
      this.getOperatingCashFlow(startDate, endDate),
      this.getInvestingCashFlow(startDate, endDate),
      this.getFinancingCashFlow(startDate, endDate),
      this.getCashPositionAnalysis(endDate),
      this.getPaymentVelocityMetrics(startDate, endDate),
      this.getCashConversionCycle(startDate, endDate),
      this.getLiquidityAnalysis(endDate),
      this.getCashFlowForecasting(endDate),
      this.getScenarioAnalysis(endDate),
      this.getDailyBreakdown(startDate, endDate)
    ]);

    const report: CashFlowAnalysisData = {
      period: { startDate, endDate },
      cashFlowSummary,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      cashPositionAnalysis,
      paymentVelocityMetrics,
      cashConversionCycle,
      liquidity,
      forecasting,
      scenarios,
      dailyBreakdown
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(report));

    return report;
  }

  /**
   * Get overall cash flow summary
   */
  private async getCashFlowSummary(startDate: Date, endDate: Date) {
    // Calculate total inflows (brand payments received)
    const totalInflows = await this.prisma.payment.aggregate({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    // Calculate total outflows (creator payouts sent)
    const totalOutflows = await this.prisma.payout.aggregate({
      where: {
        processedAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    const totalInflowCents = Number(totalInflows._sum.amount || 0);
    const totalOutflowCents = totalOutflows._sum.amountCents || 0;
    const netCashFlowCents = totalInflowCents - totalOutflowCents;

    return {
      totalInflowCents,
      totalOutflowCents,
      netCashFlowCents,
      cashFlowPositive: netCashFlowCents > 0
    };
  }

  /**
   * Get operating cash flow breakdown
   */
  private async getOperatingCashFlow(startDate: Date, endDate: Date) {
    // Brand payments by type
    const brandPayments = await this.prisma.payment.aggregate({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
        paymentMethod: { not: 'subscription' } // Regular payments
      },
      _sum: { amount: true }
    });

    const subscriptionFees = await this.prisma.payment.aggregate({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
        paymentMethod: 'subscription'
      },
      _sum: { amount: true }
    });

    // Creator payouts
    const creatorPayouts = await this.prisma.payout.aggregate({
      where: {
        processedAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    const brandPaymentsCents = Number(brandPayments._sum.amount || 0);
    const subscriptionFeesCents = Number(subscriptionFees._sum.amount || 0);
    const otherRevenueCents = 0; // TODO: Add other revenue sources
    const creatorPayoutsCents = creatorPayouts._sum.amountCents || 0;
    
    // Estimated operational expenses (would come from accounting system in production)
    const totalRevenue = brandPaymentsCents + subscriptionFeesCents + otherRevenueCents;
    const operationalExpensesCents = Math.round(totalRevenue * 0.15); // 15% estimated

    const netOperatingCashFlowCents = totalRevenue - creatorPayoutsCents - operationalExpensesCents;

    return {
      brandPaymentsCents,
      subscriptionFeesCents,
      otherRevenueCents,
      creatorPayoutsCents,
      operationalExpensesCents,
      netOperatingCashFlowCents
    };
  }

  /**
   * Get investing cash flow
   */
  private async getInvestingCashFlow(startDate: Date, endDate: Date) {
    // Estimated technology investments and asset acquisitions
    const operatingCashFlow = await this.getOperatingCashFlow(startDate, endDate);
    const totalRevenue = operatingCashFlow.brandPaymentsCents + 
                        operatingCashFlow.subscriptionFeesCents + 
                        operatingCashFlow.otherRevenueCents;

    const technologyInvestmentsCents = Math.round(totalRevenue * 0.12); // 12% reinvestment
    const assetAcquisitionsCents = Math.round(totalRevenue * 0.03);     // 3% for assets

    return {
      technologyInvestmentsCents: -technologyInvestmentsCents,
      assetAcquisitionsCents: -assetAcquisitionsCents,
      netInvestingCashFlowCents: -(technologyInvestmentsCents + assetAcquisitionsCents)
    };
  }

  /**
   * Get financing cash flow
   */
  private async getFinancingCashFlow(startDate: Date, endDate: Date) {
    // In this simple implementation, assume no major financing activities
    // In production, this would track actual capital raises, debt, etc.
    return {
      capitalRaisesCents: 0,
      debtPaymentsCents: 0,
      netFinancingCashFlowCents: 0
    };
  }

  /**
   * Get current cash position analysis
   */
  private async getCashPositionAnalysis(asOfDate: Date) {
    // Get completed inflows and outflows to estimate current cash
    const totalInflows = await this.prisma.payment.aggregate({
      where: {
        paidAt: { lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    const totalOutflows = await this.prisma.payout.aggregate({
      where: {
        processedAt: { lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    // Estimated current cash (in production, this would come from bank APIs)
    const estimatedCashCents = Number(totalInflows._sum.amount || 0) - (totalOutflows._sum.amountCents || 0);
    const currentCashBalanceCents = Math.max(estimatedCashCents * 0.1, 1000000); // Keep 10% as cash, min $10k

    // Calculate projected cash needs (upcoming payouts)
    const upcomingPayouts = await this.prisma.royaltyStatement.aggregate({
      where: {
        status: { in: ['REVIEWED'] }, // Approved but not yet paid
        paidAt: null
      },
      _sum: { totalEarningsCents: true }
    });

    const projectedCashNeedsCents = upcomingPayouts._sum.totalEarningsCents || 0;
    const cashReservesCents = currentCashBalanceCents - projectedCashNeedsCents;

    // Calculate burn rate (last 30 days outflows)
    const thirtyDaysAgo = subDays(asOfDate, 30);
    const recentOutflows = await this.prisma.payout.aggregate({
      where: {
        processedAt: { gte: thirtyDaysAgo, lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    const burnRateCents = (recentOutflows._sum.amountCents || 0) / 30; // Daily burn rate
    const runwayDays = burnRateCents > 0 ? Math.floor(currentCashBalanceCents / burnRateCents) : 999;

    return {
      currentCashBalanceCents,
      projectedCashNeedsCents,
      cashReservesCents,
      burnRateCents,
      runwayDays
    };
  }

  /**
   * Get payment velocity metrics
   */
  private async getPaymentVelocityMetrics(startDate: Date, endDate: Date) {
    // Get payments that were completed and had corresponding payouts
    const paymentsWithPayouts = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      },
      include: {
        brand: {
          include: {
            licenses: {
              include: {
                royaltyLines: {
                  include: {
                    royaltyStatement: {
                      include: {
                        payouts: {
                          where: { status: 'COMPLETED' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const velocityData = [];
    
    for (const payment of paymentsWithPayouts) {
      for (const license of payment.brand.licenses) {
        for (const royaltyLine of license.royaltyLines) {
          for (const payout of royaltyLine.royaltyStatement.payouts) {
            if (payment.paidAt && payout.processedAt) {
              const daysDifference = differenceInDays(payout.processedAt, payment.paidAt);
              velocityData.push(daysDifference);
            }
          }
        }
      }
    }

    if (velocityData.length === 0) {
      return {
        averagePaymentToPayoutDays: 0,
        fastestPaymentToPayoutDays: 0,
        slowestPaymentToPayoutDays: 0,
        paymentProcessingBottlenecks: ['Insufficient data to analyze']
      };
    }

    const averagePaymentToPayoutDays = velocityData.reduce((sum, days) => sum + days, 0) / velocityData.length;
    const fastestPaymentToPayoutDays = Math.min(...velocityData);
    const slowestPaymentToPayoutDays = Math.max(...velocityData);

    // Identify bottlenecks
    const bottlenecks = [];
    if (averagePaymentToPayoutDays > 30) {
      bottlenecks.push('Average payment-to-payout time exceeds 30 days');
    }
    if (slowestPaymentToPayoutDays > 60) {
      bottlenecks.push('Some payouts taking over 60 days');
    }

    return {
      averagePaymentToPayoutDays: Math.round(averagePaymentToPayoutDays * 100) / 100,
      fastestPaymentToPayoutDays,
      slowestPaymentToPayoutDays,
      paymentProcessingBottlenecks: bottlenecks.length > 0 ? bottlenecks : ['No significant bottlenecks detected']
    };
  }

  /**
   * Get cash conversion cycle analysis
   */
  private async getCashConversionCycle(startDate: Date, endDate: Date) {
    // Calculate average days to collect payments
    const paymentsData = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        paidAt: { not: null },
        status: 'COMPLETED'
      },
      select: {
        createdAt: true,
        paidAt: true
      }
    });

    const daysToCollectPayments = paymentsData.length > 0
      ? paymentsData.reduce((sum, payment) => {
          return sum + (payment.paidAt ? differenceInDays(payment.paidAt, payment.createdAt) : 0);
        }, 0) / paymentsData.length
      : 0;

    // Calculate average days to pay creators
    const payoutsData = await this.prisma.payout.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        processedAt: { not: null },
        status: 'COMPLETED'
      },
      select: {
        createdAt: true,
        processedAt: true
      }
    });

    const daysToPayCreators = payoutsData.length > 0
      ? payoutsData.reduce((sum, payout) => {
          return sum + (payout.processedAt ? differenceInDays(payout.processedAt, payout.createdAt) : 0);
        }, 0) / payoutsData.length
      : 0;

    const netCashCycleDays = daysToCollectPayments + daysToPayCreators;

    // Determine efficiency rating
    let efficiencyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (netCashCycleDays <= 15) {
      efficiencyRating = 'EXCELLENT';
    } else if (netCashCycleDays <= 30) {
      efficiencyRating = 'GOOD';
    } else if (netCashCycleDays <= 45) {
      efficiencyRating = 'FAIR';
    } else {
      efficiencyRating = 'POOR';
    }

    return {
      daysToCollectPayments: Math.round(daysToCollectPayments * 100) / 100,
      daysToPayCreators: Math.round(daysToPayCreators * 100) / 100,
      netCashCycleDays: Math.round(netCashCycleDays * 100) / 100,
      efficiencyRating
    };
  }

  /**
   * Get liquidity analysis
   */
  private async getLiquidityAnalysis(asOfDate: Date) {
    const cashPosition = await this.getCashPositionAnalysis(asOfDate);
    
    // Get immediate obligations (next 30 days)
    const next30Days = addDays(asOfDate, 30);
    const upcomingObligations = await this.prisma.royaltyStatement.aggregate({
      where: {
        status: 'REVIEWED',
        createdAt: { lte: next30Days },
        paidAt: null
      },
      _sum: { totalEarningsCents: true }
    });

    const currentLiquidityCents = cashPosition.currentCashBalanceCents;
    const upcomingObligationsCents = upcomingObligations._sum.totalEarningsCents || 0;
    const liquidityRatio = upcomingObligationsCents > 0 
      ? currentLiquidityCents / upcomingObligationsCents 
      : 999;

    // Determine liquidity status
    let liquidityStatus: 'HEALTHY' | 'ADEQUATE' | 'CONCERNING' | 'CRITICAL';
    if (liquidityRatio >= 3) {
      liquidityStatus = 'HEALTHY';
    } else if (liquidityRatio >= 2) {
      liquidityStatus = 'ADEQUATE';
    } else if (liquidityRatio >= 1) {
      liquidityStatus = 'CONCERNING';
    } else {
      liquidityStatus = 'CRITICAL';
    }

    return {
      currentLiquidityCents,
      upcomingObligationsCents,
      liquidityRatio: Math.round(liquidityRatio * 100) / 100,
      liquidityStatus
    };
  }

  /**
   * Get cash flow forecasting
   */
  private async getCashFlowForecasting(asOfDate: Date) {
    // Calculate historical averages for forecasting
    const last90Days = subDays(asOfDate, 90);
    
    const historicalInflows = await this.prisma.payment.aggregate({
      where: {
        paidAt: { gte: last90Days, lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    const historicalOutflows = await this.prisma.payout.aggregate({
      where: {
        processedAt: { gte: last90Days, lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amountCents: true }
    });

    // Calculate daily averages
    const dailyInflowAverage = Number(historicalInflows._sum.amount || 0) / 90;
    const dailyOutflowAverage = (historicalOutflows._sum.amountCents || 0) / 90;

    // Project next 30 and 90 days
    const next30DaysInflowCents = Math.round(dailyInflowAverage * 30);
    const next30DaysOutflowCents = Math.round(dailyOutflowAverage * 30);
    const next30DaysNetCashFlowCents = next30DaysInflowCents - next30DaysOutflowCents;
    const next90DaysProjectionCents = Math.round((dailyInflowAverage - dailyOutflowAverage) * 90);

    // Seasonal adjustments (simplified)
    const seasonalAdjustments = [
      {
        period: 'Q1',
        adjustmentFactor: 0.9,
        projectedCashFlowCents: Math.round(next90DaysProjectionCents * 0.9)
      },
      {
        period: 'Q2',
        adjustmentFactor: 1.0,
        projectedCashFlowCents: next90DaysProjectionCents
      },
      {
        period: 'Q3',
        adjustmentFactor: 1.1,
        projectedCashFlowCents: Math.round(next90DaysProjectionCents * 1.1)
      },
      {
        period: 'Q4',
        adjustmentFactor: 1.2,
        projectedCashFlowCents: Math.round(next90DaysProjectionCents * 1.2)
      }
    ];

    return {
      next30DaysInflowCents,
      next30DaysOutflowCents,
      next30DaysNetCashFlowCents,
      next90DaysProjectionCents,
      seasonalAdjustments
    };
  }

  /**
   * Get scenario analysis
   */
  private async getScenarioAnalysis(asOfDate: Date) {
    const forecasting = await this.getCashFlowForecasting(asOfDate);
    
    // Create scenarios based on forecasting with variance
    return {
      bestCase: {
        projectedInflowCents: Math.round(forecasting.next30DaysInflowCents * 1.3),
        projectedOutflowCents: Math.round(forecasting.next30DaysOutflowCents * 0.8),
        netCashFlowCents: Math.round(forecasting.next30DaysInflowCents * 1.3) - Math.round(forecasting.next30DaysOutflowCents * 0.8)
      },
      worstCase: {
        projectedInflowCents: Math.round(forecasting.next30DaysInflowCents * 0.7),
        projectedOutflowCents: Math.round(forecasting.next30DaysOutflowCents * 1.2),
        netCashFlowCents: Math.round(forecasting.next30DaysInflowCents * 0.7) - Math.round(forecasting.next30DaysOutflowCents * 1.2)
      },
      mostLikely: {
        projectedInflowCents: forecasting.next30DaysInflowCents,
        projectedOutflowCents: forecasting.next30DaysOutflowCents,
        netCashFlowCents: forecasting.next30DaysNetCashFlowCents
      }
    };
  }

  /**
   * Get daily cash flow breakdown
   */
  private async getDailyBreakdown(startDate: Date, endDate: Date) {
    const breakdown = [];
    let cumulativeCash = 0;
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dayStart = startOfDay(currentDate);
      const dayEnd = endOfDay(currentDate);

      const [dailyInflows, dailyOutflows] = await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            paidAt: { gte: dayStart, lte: dayEnd },
            status: 'COMPLETED'
          },
          _sum: { amount: true }
        }),
        this.prisma.payout.aggregate({
          where: {
            processedAt: { gte: dayStart, lte: dayEnd },
            status: 'COMPLETED'
          },
          _sum: { amountCents: true }
        })
      ]);

      const inflowCents = Number(dailyInflows._sum.amount || 0);
      const outflowCents = dailyOutflows._sum.amountCents || 0;
      const netFlowCents = inflowCents - outflowCents;
      cumulativeCash += netFlowCents;

      breakdown.push({
        date: format(currentDate, 'yyyy-MM-dd'),
        inflowCents,
        outflowCents,
        netFlowCents,
        cumulativeCashCents: cumulativeCash
      });

      currentDate = addDays(currentDate, 1);
    }

    return breakdown;
  }

  /**
   * Get cash flow health score
   */
  async getCashFlowHealthScore(asOfDate: Date): Promise<{
    score: number;
    rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    factors: Array<{
      factor: string;
      score: number;
      weight: number;
      impact: string;
    }>;
  }> {
    const [liquidity, cashPosition, velocity] = await Promise.all([
      this.getLiquidityAnalysis(asOfDate),
      this.getCashPositionAnalysis(asOfDate),
      this.getPaymentVelocityMetrics(subDays(asOfDate, 30), asOfDate)
    ]);

    const factors = [
      {
        factor: 'Liquidity Ratio',
        score: Math.min(liquidity.liquidityRatio * 25, 100),
        weight: 0.3,
        impact: liquidity.liquidityStatus
      },
      {
        factor: 'Cash Runway',
        score: Math.min(cashPosition.runwayDays / 365 * 100, 100),
        weight: 0.25,
        impact: cashPosition.runwayDays > 180 ? 'POSITIVE' : 'CONCERNING'
      },
      {
        factor: 'Payment Velocity',
        score: Math.max(100 - velocity.averagePaymentToPayoutDays * 2, 0),
        weight: 0.25,
        impact: velocity.averagePaymentToPayoutDays < 15 ? 'EXCELLENT' : 'NEEDS_IMPROVEMENT'
      },
      {
        factor: 'Cash Flow Trend',
        score: cashPosition.currentCashBalanceCents > 0 ? 75 : 25,
        weight: 0.2,
        impact: cashPosition.currentCashBalanceCents > 0 ? 'POSITIVE' : 'NEGATIVE'
      }
    ];

    const score = factors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
    
    let rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (score >= 80) rating = 'EXCELLENT';
    else if (score >= 65) rating = 'GOOD';
    else if (score >= 50) rating = 'FAIR';
    else rating = 'POOR';

    return { score: Math.round(score), rating, factors };
  }
}
