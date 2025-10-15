/**
 * Accounts Receivable Aging Service
 * 
 * Tracks money owed to the platform that has not yet been collected, critical for 
 * managing credit risk and cash flow forecasting with aging bucket analysis.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfDay, endOfDay, differenceInDays, format, subDays } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface AccountsReceivableAgingData {
  asOfDate: Date;
  summary: {
    totalOutstandingCents: number;
    totalInvoicesCount: number;
    averageInvoiceAgeDays: number;
    totalAtRiskCents: number;
    collectionEfficiencyPercent: number;
  };
  agingBuckets: {
    current: {
      amountCents: number;
      invoiceCount: number;
      percentage: number;
      averageDaysOutstanding: number;
    };
    days31To60: {
      amountCents: number;
      invoiceCount: number;
      percentage: number;
      averageDaysOutstanding: number;
    };
    days61To90: {
      amountCents: number;
      invoiceCount: number;
      percentage: number;
      averageDaysOutstanding: number;
    };
    over90Days: {
      amountCents: number;
      invoiceCount: number;
      percentage: number;
      averageDaysOutstanding: number;
    };
  };
  riskAnalysis: {
    lowRisk: {
      amountCents: number;
      customerCount: number;
    };
    mediumRisk: {
      amountCents: number;
      customerCount: number;
    };
    highRisk: {
      amountCents: number;
      customerCount: number;
    };
    criticalRisk: {
      amountCents: number;
      customerCount: number;
    };
  };
  customerBreakdown: Array<{
    brandId: string;
    brandName: string;
    totalOutstandingCents: number;
    oldestInvoiceDays: number;
    invoiceCount: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    creditScore: number;
    recommendedAction: string;
  }>;
  badDebtAnalysis: {
    estimatedBadDebtCents: number;
    badDebtReservePercent: number;
    historicalWriteOffRate: number;
    projectedWriteOffsCents: number;
  };
  collectionMetrics: {
    daysOutstandingTrend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
    collectionRatePercent: number;
    averageCollectionDays: number;
    collectionEfforts: Array<{
      agingBucket: string;
      recommendedAction: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    }>;
  };
  workflowRecommendations: Array<{
    type: 'REMINDER' | 'ESCALATION' | 'LEGAL' | 'WRITEOFF';
    brandIds: string[];
    description: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedImpactCents: number;
  }>;
  historicalTrends: Array<{
    month: string;
    totalOutstandingCents: number;
    daysOutstanding: number;
    collectionRate: number;
  }>;
}

type AgingBucket = 'CURRENT' | 'DAYS_31_60' | 'DAYS_61_90' | 'OVER_90';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface ReceivableRecord {
  entityType: string;
  entityId: string;
  brandId: string | null;
  brandName: string;
  originalAmountCents: number;
  outstandingAmountCents: number;
  invoiceDate: Date;
  dueDate: Date;
  daysOutstanding: number;
  agingBucket: AgingBucket;
  riskLevel: RiskLevel;
}

export class AccountsReceivableAgingService {
  private readonly cacheKeyPrefix = 'ar_aging';
  private readonly cacheTTL = 3600; // 1 hour cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive accounts receivable aging report
   */
  async generateAccountsReceivableAgingReport(
    asOfDate: Date = new Date()
  ): Promise<AccountsReceivableAgingData> {
    const cacheKey = `${this.cacheKeyPrefix}:${format(asOfDate, 'yyyy-MM-dd')}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all outstanding receivables
    const receivables = await this.getOutstandingReceivables(asOfDate);
    
    const [
      summary,
      agingBuckets,
      riskAnalysis,
      customerBreakdown,
      badDebtAnalysis,
      collectionMetrics,
      workflowRecommendations,
      historicalTrends
    ] = await Promise.all([
      this.calculateSummary(receivables, asOfDate),
      this.calculateAgingBuckets(receivables),
      this.calculateRiskAnalysis(receivables),
      this.calculateCustomerBreakdown(receivables),
      this.calculateBadDebtAnalysis(receivables, asOfDate),
      this.calculateCollectionMetrics(receivables, asOfDate),
      this.generateWorkflowRecommendations(receivables),
      this.getHistoricalTrends(asOfDate)
    ]);

    const report: AccountsReceivableAgingData = {
      asOfDate,
      summary,
      agingBuckets,
      riskAnalysis,
      customerBreakdown,
      badDebtAnalysis,
      collectionMetrics,
      workflowRecommendations,
      historicalTrends
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(report));

    return report;
  }

  /**
   * Get all outstanding receivables as of date
   */
  private async getOutstandingReceivables(asOfDate: Date): Promise<ReceivableRecord[]> {
    // Get pending payments (invoices not yet paid)
    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        createdAt: { lte: asOfDate },
        status: { in: ['PENDING', 'PROCESSING'] },
        paidAt: null
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

    // Get license fees that are due but not paid
    const overdueLicenses = await this.prisma.license.findMany({
      where: {
        createdAt: { lte: asOfDate },
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
        feeCents: { gt: 0 }
        // TODO: Add payment due date tracking
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

    const receivables: ReceivableRecord[] = [];

    // Process pending payments
    for (const payment of pendingPayments) {
      const daysOutstanding = differenceInDays(asOfDate, payment.createdAt);
      const agingBucket = this.determineAgingBucket(daysOutstanding);
      const riskLevel = this.determineRiskLevel(daysOutstanding, Number(payment.amount || 0));

      receivables.push({
        entityType: 'payment',
        entityId: payment.id,
        brandId: payment.brandId,
        brandName: payment.brand?.companyName || 'Unknown',
        originalAmountCents: Number(payment.amount || 0),
        outstandingAmountCents: Number(payment.amount || 0),
        invoiceDate: payment.createdAt,
        dueDate: new Date(payment.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        daysOutstanding,
        agingBucket,
        riskLevel
      });
    }

    // Process overdue licenses (simplified logic)
    for (const license of overdueLicenses) {
      const daysOutstanding = differenceInDays(asOfDate, license.createdAt);
      
      // Only include if past due date (simplified: 30 days after creation)
      if (daysOutstanding > 30) {
        const agingBucket = this.determineAgingBucket(daysOutstanding);
        const riskLevel = this.determineRiskLevel(daysOutstanding, license.feeCents || 0);

        receivables.push({
          entityType: 'license',
          entityId: license.id,
          brandId: license.brandId,
          brandName: license.brand?.companyName || 'Unknown',
          originalAmountCents: license.feeCents || 0,
          outstandingAmountCents: license.feeCents || 0,
          invoiceDate: license.createdAt,
          dueDate: new Date(license.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          daysOutstanding,
          agingBucket,
          riskLevel
        });
      }
    }

    return receivables;
  }

  /**
   * Calculate summary metrics
   */
  private async calculateSummary(receivables: ReceivableRecord[], asOfDate: Date) {
    const totalOutstandingCents = receivables.reduce((sum, r) => sum + r.outstandingAmountCents, 0);
    const totalInvoicesCount = receivables.length;
    const averageInvoiceAgeDays = receivables.length > 0
      ? receivables.reduce((sum, r) => sum + r.daysOutstanding, 0) / receivables.length
      : 0;
    
    const totalAtRiskCents = receivables
      .filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL')
      .reduce((sum, r) => sum + r.outstandingAmountCents, 0);

    // Calculate collection efficiency (last 90 days)
    const last90Days = subDays(asOfDate, 90);
    const collectionsLast90Days = await this.prisma.payment.aggregate({
      where: {
        paidAt: { gte: last90Days, lte: asOfDate },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    const invoicesLast90Days = await this.prisma.payment.aggregate({
      where: {
        createdAt: { gte: last90Days, lte: asOfDate }
      },
      _sum: { amount: true }
    });

    const collectionEfficiencyPercent = Number(invoicesLast90Days._sum.amount || 0) > 0
      ? (Number(collectionsLast90Days._sum.amount || 0) / Number(invoicesLast90Days._sum.amount || 0)) * 100
      : 0;

    return {
      totalOutstandingCents,
      totalInvoicesCount,
      averageInvoiceAgeDays: Math.round(averageInvoiceAgeDays * 100) / 100,
      totalAtRiskCents,
      collectionEfficiencyPercent: Math.round(collectionEfficiencyPercent * 100) / 100
    };
  }

  /**
   * Calculate aging buckets breakdown
   */
  private calculateAgingBuckets(receivables: ReceivableRecord[]) {
    const buckets = {
      current: { amountCents: 0, invoiceCount: 0, totalDays: 0 },
      days31To60: { amountCents: 0, invoiceCount: 0, totalDays: 0 },
      days61To90: { amountCents: 0, invoiceCount: 0, totalDays: 0 },
      over90Days: { amountCents: 0, invoiceCount: 0, totalDays: 0 }
    };

    const totalOutstanding = receivables.reduce((sum, r) => sum + r.outstandingAmountCents, 0);

    for (const receivable of receivables) {
      let bucket: keyof typeof buckets;
      
      switch (receivable.agingBucket) {
        case 'CURRENT':
          bucket = 'current';
          break;
        case 'DAYS_31_60':
          bucket = 'days31To60';
          break;
        case 'DAYS_61_90':
          bucket = 'days61To90';
          break;
        case 'OVER_90':
          bucket = 'over90Days';
          break;
      }

      buckets[bucket].amountCents += receivable.outstandingAmountCents;
      buckets[bucket].invoiceCount += 1;
      buckets[bucket].totalDays += receivable.daysOutstanding;
    }

    return {
      current: {
        amountCents: buckets.current.amountCents,
        invoiceCount: buckets.current.invoiceCount,
        percentage: totalOutstanding > 0 ? (buckets.current.amountCents / totalOutstanding) * 100 : 0,
        averageDaysOutstanding: buckets.current.invoiceCount > 0 
          ? Math.round(buckets.current.totalDays / buckets.current.invoiceCount * 100) / 100 
          : 0
      },
      days31To60: {
        amountCents: buckets.days31To60.amountCents,
        invoiceCount: buckets.days31To60.invoiceCount,
        percentage: totalOutstanding > 0 ? (buckets.days31To60.amountCents / totalOutstanding) * 100 : 0,
        averageDaysOutstanding: buckets.days31To60.invoiceCount > 0 
          ? Math.round(buckets.days31To60.totalDays / buckets.days31To60.invoiceCount * 100) / 100 
          : 0
      },
      days61To90: {
        amountCents: buckets.days61To90.amountCents,
        invoiceCount: buckets.days61To90.invoiceCount,
        percentage: totalOutstanding > 0 ? (buckets.days61To90.amountCents / totalOutstanding) * 100 : 0,
        averageDaysOutstanding: buckets.days61To90.invoiceCount > 0 
          ? Math.round(buckets.days61To90.totalDays / buckets.days61To90.invoiceCount * 100) / 100 
          : 0
      },
      over90Days: {
        amountCents: buckets.over90Days.amountCents,
        invoiceCount: buckets.over90Days.invoiceCount,
        percentage: totalOutstanding > 0 ? (buckets.over90Days.amountCents / totalOutstanding) * 100 : 0,
        averageDaysOutstanding: buckets.over90Days.invoiceCount > 0 
          ? Math.round(buckets.over90Days.totalDays / buckets.over90Days.invoiceCount * 100) / 100 
          : 0
      }
    };
  }

  /**
   * Calculate risk analysis
   */
  private calculateRiskAnalysis(receivables: ReceivableRecord[]) {
    const riskCategories = {
      lowRisk: { amountCents: 0, customers: new Set<string>() },
      mediumRisk: { amountCents: 0, customers: new Set<string>() },
      highRisk: { amountCents: 0, customers: new Set<string>() },
      criticalRisk: { amountCents: 0, customers: new Set<string>() }
    };

    for (const receivable of receivables) {
      const brandId = receivable.brandId || 'unknown';
      
      switch (receivable.riskLevel) {
        case 'LOW':
          riskCategories.lowRisk.amountCents += receivable.outstandingAmountCents;
          riskCategories.lowRisk.customers.add(brandId);
          break;
        case 'MEDIUM':
          riskCategories.mediumRisk.amountCents += receivable.outstandingAmountCents;
          riskCategories.mediumRisk.customers.add(brandId);
          break;
        case 'HIGH':
          riskCategories.highRisk.amountCents += receivable.outstandingAmountCents;
          riskCategories.highRisk.customers.add(brandId);
          break;
        case 'CRITICAL':
          riskCategories.criticalRisk.amountCents += receivable.outstandingAmountCents;
          riskCategories.criticalRisk.customers.add(brandId);
          break;
      }
    }

    return {
      lowRisk: {
        amountCents: riskCategories.lowRisk.amountCents,
        customerCount: riskCategories.lowRisk.customers.size
      },
      mediumRisk: {
        amountCents: riskCategories.mediumRisk.amountCents,
        customerCount: riskCategories.mediumRisk.customers.size
      },
      highRisk: {
        amountCents: riskCategories.highRisk.amountCents,
        customerCount: riskCategories.highRisk.customers.size
      },
      criticalRisk: {
        amountCents: riskCategories.criticalRisk.amountCents,
        customerCount: riskCategories.criticalRisk.customers.size
      }
    };
  }

  /**
   * Calculate customer breakdown
   */
  private calculateCustomerBreakdown(receivables: ReceivableRecord[]) {
    const customerMap = new Map<string, {
      brandId: string;
      brandName: string;
      totalOutstanding: number;
      invoices: ReceivableRecord[];
    }>();

    // Group by customer
    for (const receivable of receivables) {
      const brandId = receivable.brandId || 'unknown';
      
      if (!customerMap.has(brandId)) {
        customerMap.set(brandId, {
          brandId,
          brandName: receivable.brandName,
          totalOutstanding: 0,
          invoices: []
        });
      }

      const customer = customerMap.get(brandId)!;
      customer.totalOutstanding += receivable.outstandingAmountCents;
      customer.invoices.push(receivable);
    }

    // Convert to array and calculate metrics
    const breakdown = Array.from(customerMap.values()).map(customer => {
      const oldestInvoiceDays = Math.max(...customer.invoices.map(inv => inv.daysOutstanding));
      const highestRisk = customer.invoices.reduce((maxRisk, inv) => {
        const riskOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        return riskOrder[inv.riskLevel] > riskOrder[maxRisk] ? inv.riskLevel : maxRisk;
      }, 'LOW' as RiskLevel);

      // Calculate simple credit score based on payment history and amount
      const creditScore = this.calculateCreditScore(customer.totalOutstanding, oldestInvoiceDays);
      
      return {
        brandId: customer.brandId,
        brandName: customer.brandName,
        totalOutstandingCents: customer.totalOutstanding,
        oldestInvoiceDays,
        invoiceCount: customer.invoices.length,
        riskLevel: highestRisk,
        creditScore,
        recommendedAction: this.getRecommendedAction(highestRisk, oldestInvoiceDays)
      };
    });

    // Sort by total outstanding (highest first)
    return breakdown.sort((a, b) => b.totalOutstandingCents - a.totalOutstandingCents);
  }

  /**
   * Calculate bad debt analysis
   */
  private async calculateBadDebtAnalysis(receivables: ReceivableRecord[], asOfDate: Date) {
    // Get historical write-off data (if available)
    // In a real implementation, this would query actual write-off records
    const historicalWriteOffRate = 0.025; // 2.5% estimated write-off rate

    const totalOutstanding = receivables.reduce((sum, r) => sum + r.outstandingAmountCents, 0);
    const over90DaysAmount = receivables
      .filter(r => r.agingBucket === 'OVER_90')
      .reduce((sum, r) => sum + r.outstandingAmountCents, 0);

    // Estimate bad debt based on aging
    const estimatedBadDebtCents = Math.round(
      over90DaysAmount * 0.5 + // 50% of 90+ days
      receivables.filter(r => r.agingBucket === 'DAYS_61_90').reduce((sum, r) => sum + r.outstandingAmountCents, 0) * 0.15 + // 15% of 61-90 days
      receivables.filter(r => r.agingBucket === 'DAYS_31_60').reduce((sum, r) => sum + r.outstandingAmountCents, 0) * 0.05 // 5% of 31-60 days
    );

    const badDebtReservePercent = totalOutstanding > 0 ? (estimatedBadDebtCents / totalOutstanding) * 100 : 0;
    const projectedWriteOffsCents = Math.round(totalOutstanding * historicalWriteOffRate);

    return {
      estimatedBadDebtCents,
      badDebtReservePercent: Math.round(badDebtReservePercent * 100) / 100,
      historicalWriteOffRate: historicalWriteOffRate * 100,
      projectedWriteOffsCents
    };
  }

  /**
   * Calculate collection metrics
   */
  private async calculateCollectionMetrics(receivables: ReceivableRecord[], asOfDate: Date) {
    // Calculate trend (simplified - compare to previous month)
    const lastMonth = subDays(asOfDate, 30);
    const previousReceivables = await this.getOutstandingReceivables(lastMonth);
    
    const currentAvgDays = receivables.length > 0
      ? receivables.reduce((sum, r) => sum + r.daysOutstanding, 0) / receivables.length
      : 0;
    
    const previousAvgDays = previousReceivables.length > 0
      ? previousReceivables.reduce((sum, r) => sum + r.daysOutstanding, 0) / previousReceivables.length
      : 0;

    let daysOutstandingTrend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
    if (currentAvgDays < previousAvgDays * 0.95) {
      daysOutstandingTrend = 'IMPROVING';
    } else if (currentAvgDays > previousAvgDays * 1.05) {
      daysOutstandingTrend = 'DETERIORATING';
    } else {
      daysOutstandingTrend = 'STABLE';
    }

    // Calculate collection rate (payments collected vs invoiced in last 30 days)
    const last30Days = subDays(asOfDate, 30);
    const [collectionsLast30Days, invoicesLast30Days] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          paidAt: { gte: last30Days, lte: asOfDate },
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: last30Days, lte: asOfDate }
        },
        _sum: { amount: true }
      })
    ]);

    const collectionRatePercent = Number(invoicesLast30Days._sum.amount || 0) > 0
      ? (Number(collectionsLast30Days._sum.amount || 0) / Number(invoicesLast30Days._sum.amount || 0)) * 100
      : 0;

    // Calculate average collection days
    const averageCollectionDays = currentAvgDays;

    // Generate collection efforts recommendations
    const collectionEfforts = [
      {
        agingBucket: 'CURRENT (0-30 days)',
        recommendedAction: 'Send friendly payment reminder',
        priority: 'LOW' as const
      },
      {
        agingBucket: 'DAYS_31_60',
        recommendedAction: 'Send formal payment notice',
        priority: 'MEDIUM' as const
      },
      {
        agingBucket: 'DAYS_61_90',
        recommendedAction: 'Phone call and payment plan discussion',
        priority: 'HIGH' as const
      },
      {
        agingBucket: 'OVER_90',
        recommendedAction: 'Final notice and potential legal action',
        priority: 'URGENT' as const
      }
    ];

    return {
      daysOutstandingTrend,
      collectionRatePercent: Math.round(collectionRatePercent * 100) / 100,
      averageCollectionDays: Math.round(averageCollectionDays * 100) / 100,
      collectionEfforts
    };
  }

  /**
   * Generate workflow recommendations
   */
  private generateWorkflowRecommendations(receivables: ReceivableRecord[]) {
    const recommendations = [];

    // Group receivables by action needed
    const needsReminder = receivables.filter(r => r.daysOutstanding >= 30 && r.daysOutstanding < 60);
    const needsEscalation = receivables.filter(r => r.daysOutstanding >= 60 && r.daysOutstanding < 90);
    const needsLegal = receivables.filter(r => r.daysOutstanding >= 90 && r.riskLevel === 'HIGH');
    const needsWriteOff = receivables.filter(r => r.daysOutstanding > 180 && r.riskLevel === 'CRITICAL');

    if (needsReminder.length > 0) {
      recommendations.push({
        type: 'REMINDER' as const,
        brandIds: [...new Set(needsReminder.map(r => r.brandId).filter((id): id is string => id !== null))],
        description: `Send payment reminders to ${needsReminder.length} overdue invoices`,
        urgency: 'MEDIUM' as const,
        estimatedImpactCents: needsReminder.reduce((sum, r) => sum + r.outstandingAmountCents, 0)
      });
    }

    if (needsEscalation.length > 0) {
      recommendations.push({
        type: 'ESCALATION' as const,
        brandIds: [...new Set(needsEscalation.map(r => r.brandId).filter((id): id is string => id !== null))],
        description: `Escalate collection efforts for ${needsEscalation.length} severely overdue invoices`,
        urgency: 'HIGH' as const,
        estimatedImpactCents: needsEscalation.reduce((sum, r) => sum + r.outstandingAmountCents, 0)
      });
    }

    if (needsLegal.length > 0) {
      recommendations.push({
        type: 'LEGAL' as const,
        brandIds: [...new Set(needsLegal.map(r => r.brandId).filter((id): id is string => id !== null))],
        description: `Consider legal action for ${needsLegal.length} long-overdue high-value invoices`,
        urgency: 'CRITICAL' as const,
        estimatedImpactCents: needsLegal.reduce((sum, r) => sum + r.outstandingAmountCents, 0)
      });
    }

    if (needsWriteOff.length > 0) {
      recommendations.push({
        type: 'WRITEOFF' as const,
        brandIds: [...new Set(needsWriteOff.map(r => r.brandId).filter((id): id is string => id !== null))],
        description: `Consider writing off ${needsWriteOff.length} uncollectible invoices`,
        urgency: 'MEDIUM' as const,
        estimatedImpactCents: needsWriteOff.reduce((sum, r) => sum + r.outstandingAmountCents, 0)
      });
    }

    return recommendations;
  }

  /**
   * Get historical trends
   */
  private async getHistoricalTrends(asOfDate: Date) {
    const trends = [];
    
    // Get last 12 months of data
    for (let i = 11; i >= 0; i--) {
      const monthDate = subDays(asOfDate, i * 30);
      const monthReceivables = await this.getOutstandingReceivables(monthDate);
      
      const totalOutstandingCents = monthReceivables.reduce((sum, r) => sum + r.outstandingAmountCents, 0);
      const daysOutstanding = monthReceivables.length > 0
        ? monthReceivables.reduce((sum, r) => sum + r.daysOutstanding, 0) / monthReceivables.length
        : 0;

      // Calculate collection rate for that month
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      
      const [monthCollections, monthInvoices] = await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            paidAt: { gte: monthStart, lte: monthEnd },
            status: 'COMPLETED'
          },
          _sum: { amount: true }
        }),
        this.prisma.payment.aggregate({
          where: {
            createdAt: { gte: monthStart, lte: monthEnd }
          },
          _sum: { amount: true }
        })
      ]);

      const collectionRate = Number(monthInvoices._sum.amount || 0) > 0
        ? (Number(monthCollections._sum.amount || 0) / Number(monthInvoices._sum.amount || 0)) * 100
        : 0;

      trends.push({
        month: format(monthDate, 'MMM yyyy'),
        totalOutstandingCents,
        daysOutstanding: Math.round(daysOutstanding * 100) / 100,
        collectionRate: Math.round(collectionRate * 100) / 100
      });
    }

    return trends;
  }

  // Helper methods
  private determineAgingBucket(daysOutstanding: number): AgingBucket {
    if (daysOutstanding <= 30) return 'CURRENT';
    if (daysOutstanding <= 60) return 'DAYS_31_60';
    if (daysOutstanding <= 90) return 'DAYS_61_90';
    return 'OVER_90';
  }

  private determineRiskLevel(daysOutstanding: number, amountCents: number): RiskLevel {
    if (daysOutstanding <= 30) return 'LOW';
    if (daysOutstanding <= 60) return 'MEDIUM';
    if (daysOutstanding <= 90 || amountCents < 10000) return 'HIGH'; // $100 threshold
    return 'CRITICAL';
  }

  private calculateCreditScore(totalOutstanding: number, oldestInvoiceDays: number): number {
    // Simple credit scoring algorithm
    let score = 100;
    
    // Deduct points for amount outstanding
    if (totalOutstanding > 100000) score -= 30; // $1000+
    else if (totalOutstanding > 50000) score -= 20; // $500+
    else if (totalOutstanding > 10000) score -= 10; // $100+
    
    // Deduct points for age
    if (oldestInvoiceDays > 90) score -= 40;
    else if (oldestInvoiceDays > 60) score -= 25;
    else if (oldestInvoiceDays > 30) score -= 10;
    
    return Math.max(score, 0);
  }

  private getRecommendedAction(riskLevel: RiskLevel, oldestInvoiceDays: number): string {
    if (riskLevel === 'CRITICAL' || oldestInvoiceDays > 90) {
      return 'Immediate escalation required - consider legal action';
    } else if (riskLevel === 'HIGH' || oldestInvoiceDays > 60) {
      return 'Direct contact required - payment plan discussion';
    } else if (riskLevel === 'MEDIUM' || oldestInvoiceDays > 30) {
      return 'Send formal payment notice';
    } else {
      return 'Send friendly payment reminder';
    }
  }
}
