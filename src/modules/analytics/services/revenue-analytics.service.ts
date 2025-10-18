/**
 * Revenue Analytics Service
 * Provides platform-wide revenue analytics for admin users including MRR, ARR,
 * transaction analytics, and customer lifetime value calculations
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';
import { startOfDay, endOfDay, subDays, subMonths, startOfMonth, endOfMonth, differenceInDays, differenceInMonths } from 'date-fns';

/**
 * Date Range Interface
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Period Type for grouping
 */
export type GroupByPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Transaction Status Filter
 */
export type TransactionStatusFilter = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';

/**
 * Revenue Metrics Response
 */
export interface RevenueMetrics {
  period: {
    start: string;
    end: string;
  };
  mrr: {
    current: number; // Monthly Recurring Revenue in cents
    previous: number;
    growth: number; // Percentage
    growthAbsolute: number; // Absolute change in cents
  };
  arr: {
    current: number; // Annual Recurring Revenue in cents
    previous: number;
    growth: number; // Percentage
    growthAbsolute: number; // Absolute change in cents
  };
  breakdown: {
    newMrr: number; // New subscriptions
    expansionMrr: number; // Upgrades
    contractionMrr: number; // Downgrades
    churnedMrr: number; // Cancellations
  };
  historicalData: Array<{
    date: string;
    mrr: number;
    arr: number;
    newCustomers: number;
    churnedCustomers: number;
  }>;
}

/**
 * Transaction Analytics Response
 */
export interface TransactionAnalytics {
  period: {
    start: string;
    end: string;
  };
  volume: {
    total: number;
    successful: number;
    failed: number;
    refunded: number;
    pending: number;
    successRate: number; // Percentage
    failureRate: number; // Percentage
    refundRate: number; // Percentage
  };
  value: {
    totalCents: number;
    averageCents: number;
    medianCents: number;
    successfulCents: number;
    refundedCents: number;
    currency: string;
  };
  byPaymentMethod: Array<{
    method: string;
    count: number;
    totalCents: number;
    averageCents: number;
    successRate: number;
  }>;
  timeline: Array<{
    date: string;
    count: number;
    totalCents: number;
    averageCents: number;
    successfulCount: number;
    failedCount: number;
  }>;
}

/**
 * Lifetime Value Analytics Response
 */
export interface LTVAnalytics {
  period: {
    start: string;
    end: string;
  };
  overall: {
    averageLTVCents: number;
    medianLTVCents: number;
    totalCustomers: number;
    totalRevenueCents: number;
  };
  byCohort: Array<{
    cohortPeriod: string; // YYYY-MM format
    cohortSize: number;
    averageLTVCents: number;
    medianLTVCents: number;
    totalRevenueCents: number;
    averageLifespanDays: number;
  }>;
  distribution: {
    percentile25: number;
    percentile50: number;
    percentile75: number;
    percentile90: number;
    percentile95: number;
  };
  bySegment: Array<{
    segment: string;
    averageLTVCents: number;
    customerCount: number;
    totalRevenueCents: number;
  }>;
}

export class RevenueAnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * GET /analytics/platform/revenue
   * Calculate MRR, ARR, and growth metrics
   */
  async getRevenueMetrics(
    startDate?: Date,
    endDate?: Date,
    groupBy: GroupByPeriod = 'monthly'
  ): Promise<RevenueMetrics> {
    const cacheKey = `analytics:revenue:${startDate?.toISOString() || 'now'}:${endDate?.toISOString() || 'now'}:${groupBy}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const periodEnd = endDate || now;
    const periodStart = startDate || subMonths(periodEnd, 1);

    // Calculate current period MRR
    const currentMRR = await this.calculateMRR(periodStart, periodEnd);
    
    // Calculate previous period MRR for growth comparison
    const previousPeriodDays = differenceInDays(periodEnd, periodStart);
    const previousPeriodEnd = subDays(periodStart, 1);
    const previousPeriodStart = subDays(previousPeriodEnd, previousPeriodDays);
    const previousMRR = await this.calculateMRR(previousPeriodStart, previousPeriodEnd);

    // Calculate growth
    const mrrGrowth = previousMRR > 0 ? ((currentMRR - previousMRR) / previousMRR) * 100 : 0;
    const mrrGrowthAbsolute = currentMRR - previousMRR;

    // Calculate ARR (simply MRR * 12)
    const currentARR = currentMRR * 12;
    const previousARR = previousMRR * 12;
    const arrGrowth = previousARR > 0 ? ((currentARR - previousARR) / previousARR) * 100 : 0;
    const arrGrowthAbsolute = currentARR - previousARR;

    // Calculate MRR breakdown
    const breakdown = await this.calculateMRRBreakdown(periodStart, periodEnd);

    // Get historical data
    const historicalData = await this.getHistoricalRevenueData(periodStart, periodEnd, groupBy);

    const result: RevenueMetrics = {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      mrr: {
        current: Math.round(currentMRR),
        previous: Math.round(previousMRR),
        growth: Number(mrrGrowth.toFixed(2)),
        growthAbsolute: Math.round(mrrGrowthAbsolute),
      },
      arr: {
        current: Math.round(currentARR),
        previous: Math.round(previousARR),
        growth: Number(arrGrowth.toFixed(2)),
        growthAbsolute: Math.round(arrGrowthAbsolute),
      },
      breakdown,
      historicalData,
    };

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  }

  /**
   * GET /analytics/platform/transactions
   * Get transaction volume and value analytics
   */
  async getTransactionAnalytics(
    startDate?: Date,
    endDate?: Date,
    status: TransactionStatusFilter = 'all',
    groupBy: GroupByPeriod = 'daily'
  ): Promise<TransactionAnalytics> {
    const cacheKey = `analytics:transactions:${startDate?.toISOString() || 'now'}:${endDate?.toISOString() || 'now'}:${status}:${groupBy}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const periodEnd = endDate || now;
    const periodStart = startDate || subDays(periodEnd, 30);

    // Build where clause for payment status
    const statusWhere = this.buildStatusFilter(status);

    // Get all transactions in period
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        ...statusWhere,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        paymentMethod: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
        currency: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate volume metrics
    const totalCount = payments.length;
    const successfulCount = payments.filter(p => p.status === 'COMPLETED').length;
    const failedCount = payments.filter(p => p.status === 'FAILED').length;
    const refundedCount = payments.filter(p => p.status === 'REFUNDED').length;
    const pendingCount = payments.filter(p => p.status === 'PENDING').length;

    const successRate = totalCount > 0 ? (successfulCount / totalCount) * 100 : 0;
    const failureRate = totalCount > 0 ? (failedCount / totalCount) * 100 : 0;
    const refundRate = totalCount > 0 ? (refundedCount / totalCount) * 100 : 0;

    // Calculate value metrics
    const amounts = payments.map(p => Number(p.amount) * 100); // Convert to cents
    const successfulAmounts = payments
      .filter(p => p.status === 'COMPLETED')
      .map(p => Number(p.amount) * 100);
    const refundedAmounts = payments
      .filter(p => p.status === 'REFUNDED')
      .map(p => Number(p.amount) * 100);

    const totalCents = amounts.reduce((sum, amt) => sum + amt, 0);
    const successfulCents = successfulAmounts.reduce((sum, amt) => sum + amt, 0);
    const refundedCents = refundedAmounts.reduce((sum, amt) => sum + amt, 0);
    const averageCents = totalCount > 0 ? totalCents / totalCount : 0;
    const medianCents = this.calculateMedian(amounts);

    // Group by payment method
    const byPaymentMethod = await this.groupTransactionsByPaymentMethod(payments);

    // Generate timeline
    const timeline = await this.generateTransactionTimeline(payments, periodStart, periodEnd, groupBy);

    const result: TransactionAnalytics = {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      volume: {
        total: totalCount,
        successful: successfulCount,
        failed: failedCount,
        refunded: refundedCount,
        pending: pendingCount,
        successRate: Number(successRate.toFixed(2)),
        failureRate: Number(failureRate.toFixed(2)),
        refundRate: Number(refundRate.toFixed(2)),
      },
      value: {
        totalCents: Math.round(totalCents),
        averageCents: Math.round(averageCents),
        medianCents: Math.round(medianCents),
        successfulCents: Math.round(successfulCents),
        refundedCents: Math.round(refundedCents),
        currency: 'USD',
      },
      byPaymentMethod,
      timeline,
    };

    // Cache for 30 minutes
    await this.redis.setex(cacheKey, 1800, JSON.stringify(result));

    return result;
  }

  /**
   * GET /analytics/platform/ltv
   * Calculate customer lifetime value metrics
   */
  async getLTVAnalytics(
    startDate?: Date,
    endDate?: Date,
    segmentBy?: 'role' | 'cohort'
  ): Promise<LTVAnalytics> {
    const cacheKey = `analytics:ltv:${startDate?.toISOString() || 'all'}:${endDate?.toISOString() || 'all'}:${segmentBy || 'none'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodEnd = endDate || new Date();
    const periodStart = startDate;

    // Calculate overall LTV for all brands (customers)
    const brandRevenue = await this.prisma.$queryRaw<Array<{
      brand_id: string;
      total_revenue_cents: bigint;
      first_payment_date: Date;
      last_payment_date: Date;
      payment_count: bigint;
      created_at: Date;
    }>>`
      SELECT 
        b.id as brand_id,
        COALESCE(SUM(CAST(p.amount AS NUMERIC) * 100), 0) as total_revenue_cents,
        MIN(p."paidAt") as first_payment_date,
        MAX(p."paidAt") as last_payment_date,
        COUNT(p.id) as payment_count,
        b."createdAt" as created_at
      FROM brands b
      LEFT JOIN payments p ON p."brandId" = b.id AND p.status = 'COMPLETED'
      WHERE b."deletedAt" IS NULL
        ${periodStart ? Prisma.sql`AND b."createdAt" >= ${periodStart}` : Prisma.empty}
        ${periodEnd ? Prisma.sql`AND b."createdAt" <= ${periodEnd}` : Prisma.empty}
      GROUP BY b.id, b."createdAt"
      HAVING COUNT(p.id) > 0
    `;

    const ltvValues = brandRevenue.map(b => Number(b.total_revenue_cents));
    const totalRevenueCents = ltvValues.reduce((sum, ltv) => sum + ltv, 0);
    const averageLTVCents = ltvValues.length > 0 ? totalRevenueCents / ltvValues.length : 0;
    const medianLTVCents = this.calculateMedian(ltvValues);

    // Calculate distribution percentiles
    const sortedLTVs = [...ltvValues].sort((a, b) => a - b);
    const distribution = {
      percentile25: this.getPercentile(sortedLTVs, 25),
      percentile50: this.getPercentile(sortedLTVs, 50),
      percentile75: this.getPercentile(sortedLTVs, 75),
      percentile90: this.getPercentile(sortedLTVs, 90),
      percentile95: this.getPercentile(sortedLTVs, 95),
    };

    // Calculate by cohort (month joined)
    const byCohort = await this.calculateLTVByCohort(brandRevenue);

    // Calculate by segment if requested
    const bySegment = segmentBy === 'role'
      ? await this.calculateLTVByRole()
      : [];

    const result: LTVAnalytics = {
      period: {
        start: periodStart?.toISOString() || 'all',
        end: periodEnd.toISOString(),
      },
      overall: {
        averageLTVCents: Math.round(averageLTVCents),
        medianLTVCents: Math.round(medianLTVCents),
        totalCustomers: brandRevenue.length,
        totalRevenueCents: Math.round(totalRevenueCents),
      },
      byCohort,
      distribution: {
        percentile25: Math.round(distribution.percentile25),
        percentile50: Math.round(distribution.percentile50),
        percentile75: Math.round(distribution.percentile75),
        percentile90: Math.round(distribution.percentile90),
        percentile95: Math.round(distribution.percentile95),
      },
      bySegment,
    };

    // Cache for 2 hours
    await this.redis.setex(cacheKey, 7200, JSON.stringify(result));

    return result;
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   * MRR = Sum of all active recurring revenue normalized to monthly
   */
  private async calculateMRR(startDate: Date, endDate: Date): Promise<number> {
    // Get all active licenses in the period
    const licenses = await this.prisma.license.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        deletedAt: null,
        billingFrequency: { not: null },
      },
      select: {
        feeCents: true,
        billingFrequency: true,
      },
    });

    // Normalize all revenue to monthly
    let totalMRR = 0;
    for (const license of licenses) {
      const feeCents = license.feeCents;
      const monthlyRevenue = this.normalizeToMonthly(feeCents, license.billingFrequency);
      totalMRR += monthlyRevenue;
    }

    return totalMRR;
  }

  /**
   * Normalize revenue to monthly based on billing frequency
   */
  private normalizeToMonthly(amountCents: number, frequency: string | null): number {
    if (!frequency) return 0;

    switch (frequency) {
      case 'MONTHLY':
        return amountCents;
      case 'QUARTERLY':
        return amountCents / 3;
      case 'SEMI_ANNUAL':
        return amountCents / 6;
      case 'ANNUAL':
        return amountCents / 12;
      case 'ONE_TIME':
        return 0; // One-time payments don't count towards MRR
      default:
        return 0;
    }
  }

  /**
   * Calculate MRR breakdown (new, expansion, contraction, churn)
   */
  private async calculateMRRBreakdown(startDate: Date, endDate: Date) {
    // New MRR: Licenses created in this period
    const newLicenses = await this.prisma.license.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'ACTIVE',
        billingFrequency: { not: null },
        parentLicenseId: null, // Exclude renewals
      },
      select: { feeCents: true, billingFrequency: true },
    });

    const newMrr = newLicenses.reduce((sum, l) =>
      sum + this.normalizeToMonthly(l.feeCents, l.billingFrequency), 0
    );

    // Expansion MRR: Licenses that increased in value (renewals with higher fees)
    const expansions = await this.prisma.license.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'ACTIVE',
        parentLicenseId: { not: null },
      },
      select: {
        feeCents: true,
        billingFrequency: true,
        parentLicense: {
          select: {
            feeCents: true,
            billingFrequency: true,
          },
        },
      },
    });

    let expansionMrr = 0;
    let contractionMrr = 0;

    for (const license of expansions) {
      if (!license.parentLicense) continue;
      
      const currentMRR = this.normalizeToMonthly(license.feeCents, license.billingFrequency);
      const previousMRR = this.normalizeToMonthly(
        license.parentLicense.feeCents,
        license.parentLicense.billingFrequency
      );
      
      const diff = currentMRR - previousMRR;
      if (diff > 0) {
        expansionMrr += diff;
      } else if (diff < 0) {
        contractionMrr += Math.abs(diff);
      }
    }

    // Churned MRR: Licenses that expired/cancelled in this period
    const churned = await this.prisma.license.findMany({
      where: {
        OR: [
          { endDate: { gte: startDate, lte: endDate }, status: 'EXPIRED' },
          { status: 'CANCELLED', updatedAt: { gte: startDate, lte: endDate } },
        ],
        billingFrequency: { not: null },
      },
      select: { feeCents: true, billingFrequency: true },
    });

    const churnedMrr = churned.reduce((sum, l) =>
      sum + this.normalizeToMonthly(l.feeCents, l.billingFrequency), 0
    );

    return {
      newMrr: Math.round(newMrr),
      expansionMrr: Math.round(expansionMrr),
      contractionMrr: Math.round(contractionMrr),
      churnedMrr: Math.round(churnedMrr),
    };
  }

  /**
   * Get historical revenue data for charting
   */
  private async getHistoricalRevenueData(
    startDate: Date,
    endDate: Date,
    groupBy: GroupByPeriod
  ): Promise<Array<{ date: string; mrr: number; arr: number; newCustomers: number; churnedCustomers: number }>> {
    // This would ideally use pre-aggregated daily/monthly data
    // For now, return simplified monthly snapshots
    const data: Array<{ date: string; mrr: number; arr: number; newCustomers: number; churnedCustomers: number }> = [];
    
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const periodEnd = endOfMonth(currentDate);
      const periodStart = startOfMonth(currentDate);
      
      const mrr = await this.calculateMRR(periodStart, periodEnd);
      const arr = mrr * 12;
      
      // Count new customers (brands) in this period
      const newCustomers = await this.prisma.brand.count({
        where: {
          createdAt: { gte: periodStart, lte: periodEnd },
          deletedAt: null,
        },
      });
      
      // Count churned customers (no active licenses)
      const churnedCustomers = 0; // Simplified for now
      
      data.push({
        date: currentDate.toISOString().split('T')[0],
        mrr: Math.round(mrr),
        arr: Math.round(arr),
        newCustomers,
        churnedCustomers,
      });
      
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }
    
    return data;
  }

  /**
   * Build status filter for transactions
   */
  private buildStatusFilter(status: TransactionStatusFilter): Prisma.PaymentWhereInput {
    if (status === 'all') return {};
    
    const statusMap: Record<TransactionStatusFilter, string> = {
      all: '',
      completed: 'COMPLETED',
      pending: 'PENDING',
      failed: 'FAILED',
      refunded: 'REFUNDED',
    };
    
    return { status: statusMap[status] as any };
  }

  /**
   * Group transactions by payment method
   */
  private async groupTransactionsByPaymentMethod(
    payments: Array<{
      paymentMethod: string;
      amount: any;
      status: string;
    }>
  ) {
    const grouped = new Map<string, {
      count: number;
      totalCents: number;
      successful: number;
    }>();

    for (const payment of payments) {
      const method = payment.paymentMethod || 'Unknown';
      const existing = grouped.get(method) || { count: 0, totalCents: 0, successful: 0 };
      
      existing.count++;
      existing.totalCents += Number(payment.amount) * 100;
      if (payment.status === 'COMPLETED') {
        existing.successful++;
      }
      
      grouped.set(method, existing);
    }

    return Array.from(grouped.entries()).map(([method, stats]) => ({
      method,
      count: stats.count,
      totalCents: Math.round(stats.totalCents),
      averageCents: Math.round(stats.totalCents / stats.count),
      successRate: Number(((stats.successful / stats.count) * 100).toFixed(2)),
    }));
  }

  /**
   * Generate transaction timeline
   */
  private async generateTransactionTimeline(
    payments: Array<{
      createdAt: Date;
      amount: any;
      status: string;
    }>,
    startDate: Date,
    endDate: Date,
    groupBy: GroupByPeriod
  ) {
    // Group payments by date
    const grouped = new Map<string, {
      count: number;
      totalCents: number;
      successfulCount: number;
      failedCount: number;
    }>();

    for (const payment of payments) {
      const dateKey = payment.createdAt.toISOString().split('T')[0];
      const existing = grouped.get(dateKey) || {
        count: 0,
        totalCents: 0,
        successfulCount: 0,
        failedCount: 0,
      };
      
      existing.count++;
      existing.totalCents += Number(payment.amount) * 100;
      if (payment.status === 'COMPLETED') existing.successfulCount++;
      if (payment.status === 'FAILED') existing.failedCount++;
      
      grouped.set(dateKey, existing);
    }

    return Array.from(grouped.entries()).map(([date, stats]) => ({
      date,
      count: stats.count,
      totalCents: Math.round(stats.totalCents),
      averageCents: Math.round(stats.totalCents / stats.count),
      successfulCount: stats.successfulCount,
      failedCount: stats.failedCount,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Calculate LTV by cohort
   */
  private async calculateLTVByCohort(
    brandRevenue: Array<{
      brand_id: string;
      total_revenue_cents: bigint;
      first_payment_date: Date;
      last_payment_date: Date;
      payment_count: bigint;
      created_at: Date;
    }>
  ) {
    const cohorts = new Map<string, {
      brands: Array<{ ltv: number; lifespanDays: number }>;
    }>();

    for (const brand of brandRevenue) {
      const cohortKey = `${brand.created_at.getFullYear()}-${String(brand.created_at.getMonth() + 1).padStart(2, '0')}`;
      const existing = cohorts.get(cohortKey) || { brands: [] };
      
      const lifespanDays = brand.last_payment_date && brand.first_payment_date
        ? differenceInDays(brand.last_payment_date, brand.first_payment_date)
        : 0;
      
      existing.brands.push({
        ltv: Number(brand.total_revenue_cents),
        lifespanDays,
      });
      
      cohorts.set(cohortKey, existing);
    }

    return Array.from(cohorts.entries()).map(([cohortPeriod, data]) => {
      const ltvs = data.brands.map(b => b.ltv);
      const lifespans = data.brands.map(b => b.lifespanDays);
      const totalRevenue = ltvs.reduce((sum, ltv) => sum + ltv, 0);
      
      return {
        cohortPeriod,
        cohortSize: data.brands.length,
        averageLTVCents: Math.round(totalRevenue / data.brands.length),
        medianLTVCents: Math.round(this.calculateMedian(ltvs)),
        totalRevenueCents: Math.round(totalRevenue),
        averageLifespanDays: Math.round(
          lifespans.reduce((sum, days) => sum + days, 0) / lifespans.length
        ),
      };
    }).sort((a, b) => a.cohortPeriod.localeCompare(b.cohortPeriod));
  }

  /**
   * Calculate LTV by role (placeholder)
   */
  private async calculateLTVByRole() {
    // Simplified - could segment by brand industry, size, etc.
    return [
      {
        segment: 'All Brands',
        averageLTVCents: 0,
        customerCount: 0,
        totalRevenueCents: 0,
      },
    ];
  }

  /**
   * Calculate median from array of numbers
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Get percentile value from sorted array
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Invalidate revenue analytics cache
   */
  async invalidateCache(scope: 'revenue' | 'transactions' | 'ltv' | 'all' = 'all'): Promise<void> {
    const patterns: string[] = [];
    
    if (scope === 'all' || scope === 'revenue') {
      patterns.push('analytics:revenue:*');
    }
    if (scope === 'all' || scope === 'transactions') {
      patterns.push('analytics:transactions:*');
    }
    if (scope === 'all' || scope === 'ltv') {
      patterns.push('analytics:ltv:*');
    }

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
