/**
 * Failed Transaction Reports Service
 * 
 * Comprehensive reporting system for failed transactions that analyzes failure patterns,
 * categorizes failures, identifies trends, and provides actionable insights for
 * improving payment success rates and customer experience.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { 
  FailedTransactionReport,
  FailedTransaction,
  FailureCategory,
  BaseAuditConfig
} from '../types';

export interface FailedTransactionConfig extends BaseAuditConfig {
  includeRetries?: boolean;
  includeFraudBlocked?: boolean;
  groupByCustomer?: boolean;
  minFailureThreshold?: number; // Minimum failures to include in repeat offenders
}

export class FailedTransactionReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  /**
   * Generate comprehensive failed transaction report
   */
  async generateFailedTransactionReport(
    config: FailedTransactionConfig
  ): Promise<FailedTransactionReport> {
    try {
      const { startDate, endDate } = config;

      // Get failed transactions
      const failedTransactions = await this.getFailedTransactions(startDate, endDate, config);
      
      // Generate analysis
      const failureBreakdown = this.generateFailureBreakdown(failedTransactions);
      const dailyFailureRates = await this.calculateDailyFailureRates(startDate, endDate);
      const affectedCustomers = await this.getAffectedCustomersCount(startDate, endDate);
      const repeatOffenders = await this.getRepeatOffenders(startDate, endDate, config.minFailureThreshold || 3);

      const report: FailedTransactionReport = {
        id: `failed_transactions_${Date.now()}`,
        type: 'FAILED_TRANSACTIONS',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        failedTransactions,
        failureBreakdown,
        dailyFailureRates,
        affectedCustomers,
        repeatOffenders
      };

      // Log the report generation
      await this.auditService.log({
        action: 'FAILED_TRANSACTION_REPORT_GENERATED',
        entityType: 'failed_transaction_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          period: { startDate, endDate },
          failedCount: failedTransactions.length,
          affectedCustomers: affectedCustomers,
          topFailureCategory: failureBreakdown[0]?.category || 'None'
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'FAILED_TRANSACTION_REPORT_FAILED',
        entityType: 'failed_transaction_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate failed transaction report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get failed transactions from database and audit events
   */
  private async getFailedTransactions(
    startDate: Date,
    endDate: Date,
    config: FailedTransactionConfig
  ): Promise<FailedTransaction[]> {
    const failedTransactions: FailedTransaction[] = [];

    // Get failed payments from the database
    const failedPayments = await this.prisma.payment.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        brand: {
          select: { id: true, companyName: true }
        }
      }
    });

    // Convert payments to failed transaction format
    for (const payment of failedPayments) {
      // Get additional failure context from audit events
      const auditEvents = await this.prisma.auditEvent.findMany({
        where: {
          entityType: 'payment',
          entityId: payment.id,
          action: { in: ['PAYMENT_FAILED', 'PAYMENT_ERROR'] }
        },
        orderBy: { timestamp: 'desc' },
        take: 1
      });

      const errorContext = (auditEvents[0]?.afterJson as any) || {};
      
      const failedTransaction: FailedTransaction = {
        id: payment.id,
        attemptedAt: payment.createdAt,
        failedAt: payment.updatedAt,
        
        // Transaction details
        amountCents: Number(payment.amount) * 100,
        currency: payment.currency,
        customerId: payment.brandId,
        customerEmail: payment.brand?.companyName || 'Unknown',
        
        // Failure details
        errorCode: errorContext.errorCode || 'UNKNOWN_ERROR',
        errorMessage: errorContext.errorMessage || 'Payment failed',
        errorCategory: this.categorizeFailure(errorContext),
        failureReason: this.extractFailureReason(errorContext),
        
        // Context
        paymentMethod: payment.paymentMethod,
        ipAddress: errorContext.ipAddress,
        userAgent: errorContext.userAgent,
        retryCount: errorContext.retryCount || 0,
        
        // System context
        systemState: errorContext.systemState || {},
        stackTrace: errorContext.stackTrace,
        
        // Resolution
        retryable: this.isRetryable(errorContext),
        suggestedAction: this.suggestAction(errorContext),
        customerNotified: errorContext.customerNotified || false
      };

      failedTransactions.push(failedTransaction);
    }

    // Get failed payouts if they should be included
    const failedPayouts = await this.prisma.payout.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        creator: {
          select: { id: true, stageName: true, user: { select: { email: true } } }
        }
      }
    });

    // Convert payouts to failed transaction format
    for (const payout of failedPayouts) {
      const auditEvents = await this.prisma.auditEvent.findMany({
        where: {
          entityType: 'payout',
          entityId: payout.id,
          action: { in: ['PAYOUT_FAILED', 'PAYOUT_ERROR'] }
        },
        orderBy: { timestamp: 'desc' },
        take: 1
      });

      const errorContext = (auditEvents[0]?.afterJson as any) || {};
      
      const failedTransaction: FailedTransaction = {
        id: payout.id,
        attemptedAt: payout.createdAt,
        failedAt: payout.updatedAt,
        
        // Transaction details
        amountCents: payout.amountCents,
        currency: 'USD',
        customerId: payout.creatorId,
        customerEmail: payout.creator?.user?.email || 'Unknown',
        
        // Failure details
        errorCode: errorContext.errorCode || 'PAYOUT_FAILED',
        errorMessage: payout.failedReason || 'Payout failed',
        errorCategory: this.categorizePayoutFailure(payout.failedReason || ''),
        failureReason: payout.failedReason || 'Unknown payout failure',
        
        // Context
        paymentMethod: 'stripe_transfer',
        retryCount: payout.retryCount,
        
        // System context
        systemState: errorContext,
        
        // Resolution
        retryable: payout.retryCount < 3, // Allow up to 3 retries
        suggestedAction: this.suggestPayoutAction(payout.failedReason || ''),
        customerNotified: errorContext.customerNotified || false
      };

      failedTransactions.push(failedTransaction);
    }

    return failedTransactions.sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime());
  }

  /**
   * Categorize failure based on error context
   */
  private categorizeFailure(errorContext: any): FailureCategory {
    const errorCode = errorContext.errorCode?.toLowerCase() || '';
    const errorMessage = errorContext.errorMessage?.toLowerCase() || '';

    if (errorCode.includes('declined') || errorMessage.includes('declined')) {
      return 'PAYMENT_DECLINED';
    }
    
    if (errorCode.includes('insufficient') || errorMessage.includes('insufficient')) {
      return 'INSUFFICIENT_FUNDS';
    }
    
    if (errorCode.includes('invalid_card') || errorMessage.includes('invalid card')) {
      return 'INVALID_CARD';
    }
    
    if (errorCode.includes('fraud') || errorMessage.includes('fraud')) {
      return 'FRAUD_DETECTED';
    }
    
    if (errorCode.includes('network') || errorMessage.includes('network')) {
      return 'NETWORK_ERROR';
    }
    
    if (errorCode.includes('stripe') || errorCode.includes('processor')) {
      return 'PROCESSOR_ERROR';
    }
    
    if (errorCode.includes('system') || errorCode.includes('internal')) {
      return 'SYSTEM_ERROR';
    }
    
    if (errorCode.includes('config') || errorMessage.includes('configuration')) {
      return 'CONFIGURATION_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Categorize payout failure
   */
  private categorizePayoutFailure(failureReason: string): FailureCategory {
    const reason = failureReason.toLowerCase();

    if (reason.includes('insufficient') || reason.includes('balance')) {
      return 'INSUFFICIENT_FUNDS';
    }
    
    if (reason.includes('account') || reason.includes('invalid')) {
      return 'INVALID_CARD'; // Reusing for invalid account
    }
    
    if (reason.includes('stripe') || reason.includes('transfer')) {
      return 'PROCESSOR_ERROR';
    }
    
    if (reason.includes('network') || reason.includes('timeout')) {
      return 'NETWORK_ERROR';
    }

    return 'SYSTEM_ERROR';
  }

  /**
   * Extract human-readable failure reason
   */
  private extractFailureReason(errorContext: any): string {
    if (errorContext.failureReason) return errorContext.failureReason;
    if (errorContext.errorMessage) return errorContext.errorMessage;
    if (errorContext.errorCode) return `Error: ${errorContext.errorCode}`;
    return 'Unknown failure reason';
  }

  /**
   * Determine if failure is retryable
   */
  private isRetryable(errorContext: any): boolean {
    const nonRetryableErrors = [
      'invalid_card',
      'fraud_detected',
      'insufficient_funds',
      'business_rule_violation'
    ];

    const errorCode = errorContext.errorCode?.toLowerCase() || '';
    return !nonRetryableErrors.some(error => errorCode.includes(error));
  }

  /**
   * Suggest action for payment failure
   */
  private suggestAction(errorContext: any): string {
    const category = this.categorizeFailure(errorContext);
    
    switch (category) {
      case 'PAYMENT_DECLINED':
        return 'Contact customer to update payment method';
      case 'INSUFFICIENT_FUNDS':
        return 'Notify customer of insufficient funds';
      case 'INVALID_CARD':
        return 'Request customer to provide valid payment method';
      case 'FRAUD_DETECTED':
        return 'Review transaction for fraud indicators';
      case 'PROCESSOR_ERROR':
        return 'Retry transaction with exponential backoff';
      case 'NETWORK_ERROR':
        return 'Retry transaction after network recovery';
      case 'SYSTEM_ERROR':
        return 'Investigate system logs and retry';
      case 'CONFIGURATION_ERROR':
        return 'Review payment processor configuration';
      default:
        return 'Manual investigation required';
    }
  }

  /**
   * Suggest action for payout failure
   */
  private suggestPayoutAction(failureReason: string): string {
    const reason = failureReason.toLowerCase();
    
    if (reason.includes('insufficient')) {
      return 'Check platform account balance';
    }
    
    if (reason.includes('account')) {
      return 'Verify creator Stripe account status';
    }
    
    if (reason.includes('network')) {
      return 'Retry payout after network recovery';
    }
    
    return 'Contact creator to verify account details';
  }

  /**
   * Generate failure breakdown by category
   */
  private generateFailureBreakdown(failedTransactions: FailedTransaction[]) {
    const categoryMap = new Map<FailureCategory, {
      count: number;
      totalAmountCents: number;
      transactions: FailedTransaction[];
    }>();

    failedTransactions.forEach(transaction => {
      if (!categoryMap.has(transaction.errorCategory)) {
        categoryMap.set(transaction.errorCategory, {
          count: 0,
          totalAmountCents: 0,
          transactions: []
        });
      }
      
      const category = categoryMap.get(transaction.errorCategory)!;
      category.count++;
      category.totalAmountCents += transaction.amountCents;
      category.transactions.push(transaction);
    });

    const total = failedTransactions.length;
    const totalAmount = failedTransactions.reduce((sum, t) => sum + t.amountCents, 0);

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        percentage: total > 0 ? (data.count / total) * 100 : 0,
        totalAmountCents: data.totalAmountCents,
        avgAmountCents: data.count > 0 ? data.totalAmountCents / data.count : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Calculate daily failure rates
   */
  private async calculateDailyFailureRates(startDate: Date, endDate: Date) {
    const dailyRates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Count total payment attempts
      const totalAttempts = await this.prisma.payment.count({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd }
        }
      });

      // Count failures
      const failures = await this.prisma.payment.count({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd },
          status: 'FAILED'
        }
      });

      // Count failed payouts too
      const payoutFailures = await this.prisma.payout.count({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd },
          status: 'FAILED'
        }
      });

      const totalFailures = failures + payoutFailures;
      const totalTransactions = totalAttempts + await this.prisma.payout.count({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd }
        }
      });

      dailyRates.push({
        date: new Date(currentDate),
        totalAttempts: totalTransactions,
        failures: totalFailures,
        failureRate: totalTransactions > 0 ? (totalFailures / totalTransactions) * 100 : 0
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyRates;
  }

  /**
   * Get count of affected customers
   */
  private async getAffectedCustomersCount(startDate: Date, endDate: Date): Promise<number> {
    const affectedBrands = await this.prisma.payment.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { brandId: true },
      distinct: ['brandId']
    });

    const affectedCreators = await this.prisma.payout.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { creatorId: true },
      distinct: ['creatorId']
    });

    return affectedBrands.length + affectedCreators.length;
  }

  /**
   * Get repeat offenders (customers with multiple failures)
   */
  private async getRepeatOffenders(
    startDate: Date, 
    endDate: Date, 
    minFailures: number
  ) {
    const repeatOffenders: Array<{
      customerId: string;
      failureCount: number;
      totalAmountCents: number;
    }> = [];

    // Get brands with multiple payment failures using aggregateRaw for groupBy with having
    const brandFailuresResult = await this.prisma.payment.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: {
        brandId: true,
        amount: true
      }
    });

    // Group by brandId and count
    const brandFailureMap = new Map<string, { count: number; totalAmount: number }>();
    brandFailuresResult.forEach(payment => {
      const existing = brandFailureMap.get(payment.brandId) || { count: 0, totalAmount: 0 };
      existing.count++;
      existing.totalAmount += Number(payment.amount);
      brandFailureMap.set(payment.brandId, existing);
    });

    // Filter and add brands with minimum failures
    brandFailureMap.forEach((data, brandId) => {
      if (data.count >= minFailures) {
        repeatOffenders.push({
          customerId: brandId,
          failureCount: data.count,
          totalAmountCents: data.totalAmount * 100
        });
      }
    });

    // Get creators with multiple payout failures
    const creatorFailuresResult = await this.prisma.payout.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: {
        creatorId: true,
        amountCents: true
      }
    });

    // Group by creatorId and count
    const creatorFailureMap = new Map<string, { count: number; totalAmount: number }>();
    creatorFailuresResult.forEach(payout => {
      const existing = creatorFailureMap.get(payout.creatorId) || { count: 0, totalAmount: 0 };
      existing.count++;
      existing.totalAmount += payout.amountCents;
      creatorFailureMap.set(payout.creatorId, existing);
    });

    // Filter and add creators with minimum failures
    creatorFailureMap.forEach((data, creatorId) => {
      if (data.count >= minFailures) {
        repeatOffenders.push({
          customerId: creatorId,
          failureCount: data.count,
          totalAmountCents: data.totalAmount
        });
      }
    });

    return repeatOffenders.sort((a, b) => b.failureCount - a.failureCount);
  }

  /**
   * Get detailed failure analysis for a specific customer
   */
  async getCustomerFailureAnalysis(
    customerId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Get all failed transactions for this customer
    const failedPayments = await this.prisma.payment.findMany({
      where: {
        brandId: customerId,
        status: 'FAILED',
        createdAt: { gte: startDate, lte: endDate }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Analyze failure patterns
    const failurePatterns = {
      mostCommonCategory: '',
      avgTimeBetweenFailures: 0,
      totalFailedAmount: 0,
      retrySuccess: false
    };

    // Implementation would include detailed pattern analysis
    return failurePatterns;
  }
}
