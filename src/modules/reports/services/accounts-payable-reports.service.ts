/**
 * Accounts Payable Reports Service
 * 
 * Tracks platform obligations to creators and vendors, essential for cash flow 
 * management and ensuring timely payments to maintain relationships.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { startOfDay, endOfDay, differenceInDays, format, subDays, addDays } from 'date-fns';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface AccountsPayableData {
  asOfDate: Date;
  summary: {
    totalPayableCents: number;
    totalVendorCount: number;
    averagePaymentTermsDays: number;
    overdueAmountCents: number;
    upcomingPaymentsCents: number;
  };
  paymentStatus: {
    current: {
      amountCents: number;
      paymentCount: number;
      percentage: number;
    };
    overdue: {
      amountCents: number;
      paymentCount: number;
      percentage: number;
      averageDaysOverdue: number;
    };
    upcoming7Days: {
      amountCents: number;
      paymentCount: number;
      percentage: number;
    };
    upcoming30Days: {
      amountCents: number;
      paymentCount: number;
      percentage: number;
    };
  };
  vendorBreakdown: Array<{
    vendorId: string;
    vendorName: string;
    vendorType: 'CREATOR' | 'SERVICE_PROVIDER' | 'PLATFORM_FEE' | 'OTHER';
    totalPayableCents: number;
    overdueAmountCents: number;
    nextPaymentDate: Date | null;
    paymentCount: number;
    averagePaymentDays: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    preferredPaymentMethod: string;
  }>;
  categoryBreakdown: {
    royaltyPayments: {
      amountCents: number;
      creatorCount: number;
      percentage: number;
    };
    platformFees: {
      amountCents: number;
      vendorCount: number;
      percentage: number;
    };
    operationalExpenses: {
      amountCents: number;
      vendorCount: number;
      percentage: number;
    };
    professionalServices: {
      amountCents: number;
      vendorCount: number;
      percentage: number;
    };
  };
  cashFlowImpact: {
    next7DaysOutflow: number;
    next30DaysOutflow: number;
    next90DaysOutflow: number;
    projectedMonthlyBurn: number;
    workingCapitalDays: number;
  };
  paymentPrioritization: Array<{
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    totalAmountCents: number;
    vendorCount: number;
    recommendedPaymentDate: Date;
    riskOfDelayAssessment: string;
  }>;
  complianceTracking: {
    taxWithholdings: {
      federalCents: number;
      stateCents: number;
      internationalCents: number;
    };
    requiredDocumentation: Array<{
      vendorId: string;
      vendorName: string;
      missingDocuments: string[];
      amountAtRiskCents: number;
    }>;
    paymentTermsCompliance: {
      onTimePercentage: number;
      averageDelayDays: number;
      contractViolations: number;
    };
  };
  historicalTrends: Array<{
    month: string;
    totalPayableCents: number;
    averagePaymentDays: number;
    onTimePaymentRate: number;
    vendorSatisfactionScore: number;
  }>;
}

interface PayableRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorType: 'CREATOR' | 'SERVICE_PROVIDER' | 'PLATFORM_FEE' | 'OTHER';
  amountCents: number;
  dueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
  daysOverdue: number;
  category: string;
  paymentTerms: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class AccountsPayableReportsService {
  private readonly cacheKeyPrefix = 'ap_reports';
  private readonly cacheTTL = 3600; // 1 hour cache

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Generate comprehensive accounts payable report
   */
  async generateAccountsPayableReport(
    asOfDate: Date = new Date()
  ): Promise<AccountsPayableData> {
    const cacheKey = `${this.cacheKeyPrefix}:${format(asOfDate, 'yyyy-MM-dd')}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all outstanding payables
    const payables = await this.getOutstandingPayables(asOfDate);
    
    const [
      summary,
      paymentStatus,
      vendorBreakdown,
      categoryBreakdown,
      cashFlowImpact,
      paymentPrioritization,
      complianceTracking,
      historicalTrends
    ] = await Promise.all([
      this.calculateSummary(payables),
      this.calculatePaymentStatus(payables, asOfDate),
      this.calculateVendorBreakdown(payables),
      this.calculateCategoryBreakdown(payables),
      this.calculateCashFlowImpact(payables, asOfDate),
      this.calculatePaymentPrioritization(payables, asOfDate),
      this.calculateComplianceTracking(payables, asOfDate),
      this.getHistoricalTrends(asOfDate)
    ]);

    const report: AccountsPayableData = {
      asOfDate,
      summary,
      paymentStatus,
      vendorBreakdown,
      categoryBreakdown,
      cashFlowImpact,
      paymentPrioritization,
      complianceTracking,
      historicalTrends
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(report));

    return report;
  }

  /**
   * Get all outstanding payables as of date
   */
  private async getOutstandingPayables(asOfDate: Date): Promise<PayableRecord[]> {
    // Get pending royalty payouts to creators
    const pendingRoyaltyPayouts = await this.prisma.payout.findMany({
      where: {
        createdAt: { lte: asOfDate },
        status: { in: ['PENDING', 'PROCESSING'] },
        processedAt: null
      },
      include: {
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
    });

    // Get platform fees and other obligations
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

    const payables: PayableRecord[] = [];

    // Process royalty payouts
    for (const payout of pendingRoyaltyPayouts) {
      const dueDate = addDays(payout.createdAt, 14); // 14-day payment terms for royalties
      const daysUntilDue = differenceInDays(dueDate, asOfDate);
      const isOverdue = daysUntilDue < 0;
      const daysOverdue = isOverdue ? Math.abs(daysUntilDue) : 0;

      payables.push({
        id: payout.id,
        vendorId: payout.creatorId,
        vendorName: payout.creator?.user?.name || 'Unknown Creator',
        vendorType: 'CREATOR',
        amountCents: Number(payout.amountCents || 0),
        dueDate,
        daysUntilDue,
        isOverdue,
        daysOverdue,
        category: 'Royalty Payments',
        paymentTerms: 14,
        riskLevel: this.determineRiskLevel(daysOverdue, Number(payout.amountCents || 0))
      });
    }

    // Process platform fees and other payments
    for (const payment of pendingPayments) {
      const dueDate = addDays(payment.createdAt, 30); // 30-day payment terms for fees
      const daysUntilDue = differenceInDays(dueDate, asOfDate);
      const isOverdue = daysUntilDue < 0;
      const daysOverdue = isOverdue ? Math.abs(daysUntilDue) : 0;

      payables.push({
        id: payment.id,
        vendorId: payment.brandId || 'platform',
        vendorName: payment.brand?.companyName || 'Platform Services',
        vendorType: 'PLATFORM_FEE',
        amountCents: Number(payment.amount || 0),
        dueDate,
        daysUntilDue,
        isOverdue,
        daysOverdue,
        category: 'Platform Fees', // Simplified since payment type field doesn't exist
        paymentTerms: 30,
        riskLevel: this.determineRiskLevel(daysOverdue, Number(payment.amount || 0))
      });
    }

    return payables;
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummary(payables: PayableRecord[]) {
    const totalPayableCents = payables.reduce((sum, p) => sum + p.amountCents, 0);
    const uniqueVendors = new Set(payables.map(p => p.vendorId));
    const totalVendorCount = uniqueVendors.size;
    
    const averagePaymentTermsDays = payables.length > 0
      ? payables.reduce((sum, p) => sum + p.paymentTerms, 0) / payables.length
      : 0;
    
    const overdueAmountCents = payables
      .filter(p => p.isOverdue)
      .reduce((sum, p) => sum + p.amountCents, 0);
    
    const upcomingPaymentsCents = payables
      .filter(p => !p.isOverdue && p.daysUntilDue <= 7)
      .reduce((sum, p) => sum + p.amountCents, 0);

    return {
      totalPayableCents,
      totalVendorCount,
      averagePaymentTermsDays: Math.round(averagePaymentTermsDays * 100) / 100,
      overdueAmountCents,
      upcomingPaymentsCents
    };
  }

  /**
   * Calculate payment status breakdown
   */
  private calculatePaymentStatus(payables: PayableRecord[], asOfDate: Date) {
    const totalAmount = payables.reduce((sum, p) => sum + p.amountCents, 0);

    const current = payables.filter(p => !p.isOverdue && p.daysUntilDue > 7);
    const overdue = payables.filter(p => p.isOverdue);
    const upcoming7Days = payables.filter(p => !p.isOverdue && p.daysUntilDue <= 7 && p.daysUntilDue >= 0);
    const upcoming30Days = payables.filter(p => !p.isOverdue && p.daysUntilDue <= 30 && p.daysUntilDue > 7);

    const currentAmount = current.reduce((sum, p) => sum + p.amountCents, 0);
    const overdueAmount = overdue.reduce((sum, p) => sum + p.amountCents, 0);
    const upcoming7DaysAmount = upcoming7Days.reduce((sum, p) => sum + p.amountCents, 0);
    const upcoming30DaysAmount = upcoming30Days.reduce((sum, p) => sum + p.amountCents, 0);

    const averageDaysOverdue = overdue.length > 0
      ? overdue.reduce((sum, p) => sum + p.daysOverdue, 0) / overdue.length
      : 0;

    return {
      current: {
        amountCents: currentAmount,
        paymentCount: current.length,
        percentage: totalAmount > 0 ? (currentAmount / totalAmount) * 100 : 0
      },
      overdue: {
        amountCents: overdueAmount,
        paymentCount: overdue.length,
        percentage: totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0,
        averageDaysOverdue: Math.round(averageDaysOverdue * 100) / 100
      },
      upcoming7Days: {
        amountCents: upcoming7DaysAmount,
        paymentCount: upcoming7Days.length,
        percentage: totalAmount > 0 ? (upcoming7DaysAmount / totalAmount) * 100 : 0
      },
      upcoming30Days: {
        amountCents: upcoming30DaysAmount,
        paymentCount: upcoming30Days.length,
        percentage: totalAmount > 0 ? (upcoming30DaysAmount / totalAmount) * 100 : 0
      }
    };
  }

  /**
   * Calculate vendor breakdown
   */
  private calculateVendorBreakdown(payables: PayableRecord[]) {
    const vendorMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      vendorType: 'CREATOR' | 'SERVICE_PROVIDER' | 'PLATFORM_FEE' | 'OTHER';
      totalPayable: number;
      overdueAmount: number;
      payments: PayableRecord[];
    }>();

    // Group by vendor
    for (const payable of payables) {
      if (!vendorMap.has(payable.vendorId)) {
        vendorMap.set(payable.vendorId, {
          vendorId: payable.vendorId,
          vendorName: payable.vendorName,
          vendorType: payable.vendorType,
          totalPayable: 0,
          overdueAmount: 0,
          payments: []
        });
      }

      const vendor = vendorMap.get(payable.vendorId)!;
      vendor.totalPayable += payable.amountCents;
      if (payable.isOverdue) {
        vendor.overdueAmount += payable.amountCents;
      }
      vendor.payments.push(payable);
    }

    // Convert to array and calculate metrics
    const breakdown = Array.from(vendorMap.values()).map(vendor => {
      const nextPaymentDate = vendor.payments
        .filter(p => !p.isOverdue)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]?.dueDate || null;

      const averagePaymentDays = vendor.payments.length > 0
        ? vendor.payments.reduce((sum, p) => sum + p.paymentTerms, 0) / vendor.payments.length
        : 0;

      const highestRisk = vendor.payments.reduce((maxRisk, payment) => {
        const riskOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 };
        return riskOrder[payment.riskLevel] > riskOrder[maxRisk] ? payment.riskLevel : maxRisk;
      }, 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH');

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorType: vendor.vendorType,
        totalPayableCents: vendor.totalPayable,
        overdueAmountCents: vendor.overdueAmount,
        nextPaymentDate,
        paymentCount: vendor.payments.length,
        averagePaymentDays: Math.round(averagePaymentDays * 100) / 100,
        riskLevel: highestRisk,
        preferredPaymentMethod: this.getPreferredPaymentMethod(vendor.vendorType)
      };
    });

    // Sort by total payable (highest first)
    return breakdown.sort((a, b) => b.totalPayableCents - a.totalPayableCents);
  }

  /**
   * Calculate category breakdown
   */
  private calculateCategoryBreakdown(payables: PayableRecord[]) {
    const totalAmount = payables.reduce((sum, p) => sum + p.amountCents, 0);

    const royaltyPayments = payables.filter(p => p.vendorType === 'CREATOR');
    const platformFees = payables.filter(p => p.vendorType === 'PLATFORM_FEE');
    const operationalExpenses = payables.filter(p => p.category.includes('Operational'));
    const professionalServices = payables.filter(p => p.vendorType === 'SERVICE_PROVIDER');

    const royaltyAmount = royaltyPayments.reduce((sum, p) => sum + p.amountCents, 0);
    const platformFeesAmount = platformFees.reduce((sum, p) => sum + p.amountCents, 0);
    const operationalAmount = operationalExpenses.reduce((sum, p) => sum + p.amountCents, 0);
    const professionalAmount = professionalServices.reduce((sum, p) => sum + p.amountCents, 0);

    return {
      royaltyPayments: {
        amountCents: royaltyAmount,
        creatorCount: new Set(royaltyPayments.map(p => p.vendorId)).size,
        percentage: totalAmount > 0 ? (royaltyAmount / totalAmount) * 100 : 0
      },
      platformFees: {
        amountCents: platformFeesAmount,
        vendorCount: new Set(platformFees.map(p => p.vendorId)).size,
        percentage: totalAmount > 0 ? (platformFeesAmount / totalAmount) * 100 : 0
      },
      operationalExpenses: {
        amountCents: operationalAmount,
        vendorCount: new Set(operationalExpenses.map(p => p.vendorId)).size,
        percentage: totalAmount > 0 ? (operationalAmount / totalAmount) * 100 : 0
      },
      professionalServices: {
        amountCents: professionalAmount,
        vendorCount: new Set(professionalServices.map(p => p.vendorId)).size,
        percentage: totalAmount > 0 ? (professionalAmount / totalAmount) * 100 : 0
      }
    };
  }

  /**
   * Calculate cash flow impact
   */
  private calculateCashFlowImpact(payables: PayableRecord[], asOfDate: Date) {
    const next7Days = payables.filter(p => p.daysUntilDue <= 7 && p.daysUntilDue >= 0);
    const next30Days = payables.filter(p => p.daysUntilDue <= 30 && p.daysUntilDue >= 0);
    const next90Days = payables.filter(p => p.daysUntilDue <= 90 && p.daysUntilDue >= 0);

    const next7DaysOutflow = next7Days.reduce((sum, p) => sum + p.amountCents, 0);
    const next30DaysOutflow = next30Days.reduce((sum, p) => sum + p.amountCents, 0);
    const next90DaysOutflow = next90Days.reduce((sum, p) => sum + p.amountCents, 0);

    // Estimate monthly burn rate
    const projectedMonthlyBurn = next30DaysOutflow;

    // Calculate working capital days (simplified)
    const totalPayables = payables.reduce((sum, p) => sum + p.amountCents, 0);
    const dailyBurn = projectedMonthlyBurn / 30;
    const workingCapitalDays = dailyBurn > 0 ? totalPayables / dailyBurn : 0;

    return {
      next7DaysOutflow: next7DaysOutflow,
      next30DaysOutflow: next30DaysOutflow,
      next90DaysOutflow: next90DaysOutflow,
      projectedMonthlyBurn,
      workingCapitalDays: Math.round(workingCapitalDays * 100) / 100
    };
  }

  /**
   * Calculate payment prioritization
   */
  private calculatePaymentPrioritization(payables: PayableRecord[], asOfDate: Date) {
    const critical = payables.filter(p => p.isOverdue && p.daysOverdue > 30);
    const high = payables.filter(p => (p.isOverdue && p.daysOverdue <= 30) || (p.daysUntilDue <= 3 && p.daysUntilDue >= 0));
    const medium = payables.filter(p => p.daysUntilDue <= 7 && p.daysUntilDue > 3);
    const low = payables.filter(p => p.daysUntilDue > 7);

    return [
      {
        priority: 'CRITICAL' as const,
        description: 'Severely overdue payments requiring immediate attention',
        totalAmountCents: critical.reduce((sum, p) => sum + p.amountCents, 0),
        vendorCount: new Set(critical.map(p => p.vendorId)).size,
        recommendedPaymentDate: asOfDate,
        riskOfDelayAssessment: 'High risk of legal action and relationship damage'
      },
      {
        priority: 'HIGH' as const,
        description: 'Overdue or due within 3 days',
        totalAmountCents: high.reduce((sum, p) => sum + p.amountCents, 0),
        vendorCount: new Set(high.map(p => p.vendorId)).size,
        recommendedPaymentDate: addDays(asOfDate, 1),
        riskOfDelayAssessment: 'Medium risk of vendor dissatisfaction'
      },
      {
        priority: 'MEDIUM' as const,
        description: 'Due within the next week',
        totalAmountCents: medium.reduce((sum, p) => sum + p.amountCents, 0),
        vendorCount: new Set(medium.map(p => p.vendorId)).size,
        recommendedPaymentDate: addDays(asOfDate, 5),
        riskOfDelayAssessment: 'Low risk if paid within terms'
      },
      {
        priority: 'LOW' as const,
        description: 'Future payments beyond next week',
        totalAmountCents: low.reduce((sum, p) => sum + p.amountCents, 0),
        vendorCount: new Set(low.map(p => p.vendorId)).size,
        recommendedPaymentDate: addDays(asOfDate, 14),
        riskOfDelayAssessment: 'No immediate risk'
      }
    ];
  }

  /**
   * Calculate compliance tracking
   */
  private async calculateComplianceTracking(payables: PayableRecord[], asOfDate: Date) {
    // Simplified tax withholding calculation
    const creatorPayables = payables.filter(p => p.vendorType === 'CREATOR');
    const totalCreatorAmount = creatorPayables.reduce((sum, p) => sum + p.amountCents, 0);
    
    // Estimate withholdings (simplified rates)
    const federalCents = Math.round(totalCreatorAmount * 0.24); // 24% federal
    const stateCents = Math.round(totalCreatorAmount * 0.05); // 5% average state
    const internationalCents = Math.round(totalCreatorAmount * 0.30); // 30% international

    // Check for missing documentation (simplified)
    const requiredDocumentation = creatorPayables
      .filter(p => p.amountCents > 60000) // $600+ requires documentation
      .map(p => ({
        vendorId: p.vendorId,
        vendorName: p.vendorName,
        missingDocuments: ['W-9 Form', 'Tax ID Verification'], // Simplified
        amountAtRiskCents: p.amountCents
      }));

    // Calculate payment terms compliance
    const last30Days = subDays(asOfDate, 30);
    const recentPayments = await this.prisma.payout.findMany({
      where: {
        processedAt: { gte: last30Days, lte: asOfDate },
        status: 'COMPLETED'
      }
    });

    const onTimePayments = recentPayments.filter(p => {
      const dueDate = addDays(p.createdAt, 14); // 14-day terms
      return p.processedAt && p.processedAt <= dueDate;
    });

    const onTimePercentage = recentPayments.length > 0
      ? (onTimePayments.length / recentPayments.length) * 100
      : 100;

    const delayedPayments = recentPayments.filter(p => {
      const dueDate = addDays(p.createdAt, 14);
      return p.processedAt && p.processedAt > dueDate;
    });

    const averageDelayDays = delayedPayments.length > 0
      ? delayedPayments.reduce((sum, p) => {
          const dueDate = addDays(p.createdAt, 14);
          return sum + (p.processedAt ? differenceInDays(p.processedAt, dueDate) : 0);
        }, 0) / delayedPayments.length
      : 0;

    return {
      taxWithholdings: {
        federalCents,
        stateCents,
        internationalCents
      },
      requiredDocumentation,
      paymentTermsCompliance: {
        onTimePercentage: Math.round(onTimePercentage * 100) / 100,
        averageDelayDays: Math.round(averageDelayDays * 100) / 100,
        contractViolations: delayedPayments.filter(p => {
          const dueDate = addDays(p.createdAt, 14);
          return p.processedAt && differenceInDays(p.processedAt, dueDate) > 7; // 7+ days late
        }).length
      }
    };
  }

  /**
   * Get historical trends
   */
  private async getHistoricalTrends(asOfDate: Date) {
    const trends = [];
    
    // Get last 12 months of data
    for (let i = 11; i >= 0; i--) {
      const monthDate = subDays(asOfDate, i * 30);
      const monthPayables = await this.getOutstandingPayables(monthDate);
      
      const totalPayableCents = monthPayables.reduce((sum, p) => sum + p.amountCents, 0);
      const averagePaymentDays = monthPayables.length > 0
        ? monthPayables.reduce((sum, p) => sum + p.paymentTerms, 0) / monthPayables.length
        : 0;

      // Calculate on-time payment rate for that month
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      
      const monthPayments = await this.prisma.payout.findMany({
        where: {
          processedAt: { gte: monthStart, lte: monthEnd },
          status: 'COMPLETED'
        }
      });

      const onTimePayments = monthPayments.filter(p => {
        const dueDate = addDays(p.createdAt, 14);
        return p.processedAt && p.processedAt <= dueDate;
      });

      const onTimePaymentRate = monthPayments.length > 0
        ? (onTimePayments.length / monthPayments.length) * 100
        : 100;

      // Simplified vendor satisfaction score
      const vendorSatisfactionScore = Math.max(0, 100 - (averagePaymentDays * 2));

      trends.push({
        month: format(monthDate, 'MMM yyyy'),
        totalPayableCents,
        averagePaymentDays: Math.round(averagePaymentDays * 100) / 100,
        onTimePaymentRate: Math.round(onTimePaymentRate * 100) / 100,
        vendorSatisfactionScore: Math.round(vendorSatisfactionScore * 100) / 100
      });
    }

    return trends;
  }

  // Helper methods
  private determineRiskLevel(daysOverdue: number, amountCents: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (daysOverdue > 30 || amountCents > 500000) return 'HIGH'; // $5000+
    if (daysOverdue > 14 || amountCents > 100000) return 'MEDIUM'; // $1000+
    return 'LOW';
  }

  private categorizePayment(type: string): string {
    switch (type) {
      case 'PLATFORM_FEE':
        return 'Platform Fees';
      case 'SERVICE_FEE':
        return 'Service Fees';
      case 'TRANSACTION_FEE':
        return 'Transaction Fees';
      default:
        return 'Other Expenses';
    }
  }

  private getPreferredPaymentMethod(vendorType: 'CREATOR' | 'SERVICE_PROVIDER' | 'PLATFORM_FEE' | 'OTHER'): string {
    switch (vendorType) {
      case 'CREATOR':
        return 'Direct Deposit';
      case 'SERVICE_PROVIDER':
        return 'ACH Transfer';
      case 'PLATFORM_FEE':
        return 'Wire Transfer';
      default:
        return 'Check';
    }
  }
}
