import { PrismaClient } from '@prisma/client';
import { 
  TransactionLedgerReport, 
  TransactionLedgerConfig,
  TransactionEntry,
  LedgerSummary
} from '../types';
import { 
  ReportGenerationError,
  ReportDataSourceError 
} from '../errors/report.errors';

/**
 * Service for generating transaction ledger reports
 * Provides comprehensive transaction history and audit trails
 */
export class TransactionLedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate comprehensive transaction ledger report
   */
  async generateLedgerReport(
    config: TransactionLedgerConfig
  ): Promise<TransactionLedgerReport> {
    try {
      const { startDate, endDate, filters, sortBy = 'createdAt', sortOrder = 'desc' } = config;

      // Generate core ledger data
      const [
        transactions,
        summary,
        balanceSnapshot
      ] = await Promise.all([
        this.getTransactionEntries(startDate, endDate, filters, sortBy, sortOrder),
        this.generateLedgerSummary(startDate, endDate, filters),
        this.generateBalanceSnapshot(endDate)
      ]);

      const report: TransactionLedgerReport = {
        id: `ledger_${Date.now()}`,
        type: 'TRANSACTION_LEDGER',
        config,
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        // Core ledger data
        transactions,
        summary,
        balanceSnapshot,
        
        // Metadata
        totalTransactions: transactions.length,
        dateRange: {
          start: startDate,
          end: endDate
        }
      };

      return report;
    } catch (error) {
      throw new ReportGenerationError(
        'transaction_ledger',
        `Failed to generate transaction ledger report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get transaction entries for the specified period
   */
  private async getTransactionEntries(
    startDate: Date,
    endDate: Date,
    filters?: any,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<TransactionEntry[]> {
    try {
      const transactions: TransactionEntry[] = [];

      // License transactions (revenue)
      const licenses = await this.prisma.license.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'ACTIVE',
          feeCents: { gt: 0 },
          ...(filters?.brandIds?.length && { brandId: { in: filters.brandIds } }),
          ...(filters?.licenseTypes?.length && { licenseType: { in: filters.licenseTypes } })
        },
        include: {
          brand: { select: { id: true, name: true } },
          ipAsset: { select: { id: true, title: true } },
          project: { select: { id: true, name: true } }
        },
        orderBy: { [sortBy]: sortOrder }
      });

      licenses.forEach(license => {
        transactions.push({
          id: `license_${license.id}`,
          type: 'LICENSE_REVENUE',
          entityType: 'LICENSE',
          entityId: license.id,
          description: `License revenue from ${license.brand.name} for ${license.ipAsset.title}`,
          amountCents: license.feeCents,
          direction: 'CREDIT',
          status: 'COMPLETED',
          createdAt: license.createdAt,
          metadata: {
            licenseId: license.id,
            brandId: license.brandId,
            brandName: license.brand.name,
            ipAssetId: license.ipAssetId,
            ipAssetTitle: license.ipAsset.title,
            projectId: license.projectId,
            projectName: license.project?.name,
            licenseType: license.licenseType,
            revShareBps: license.revShareBps
          },
          relatedEntities: [
            { type: 'BRAND', id: license.brandId, name: license.brand.name },
            { type: 'IP_ASSET', id: license.ipAssetId, name: license.ipAsset.title }
          ]
        });
      });

      // Royalty statement transactions (expenses)
      const royaltyStatements = await this.prisma.royaltyStatement.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filters?.creatorIds?.length && { creatorId: { in: filters.creatorIds } }),
          ...(filters?.statuses?.length && { status: { in: filters.statuses } })
        },
        include: {
          creator: { select: { id: true, name: true } },
          lines: {
            include: {
              license: {
                include: {
                  brand: { select: { id: true, name: true } },
                  ipAsset: { select: { id: true, title: true } }
                }
              }
            }
          }
        },
        orderBy: { [sortBy]: sortOrder }
      });

      royaltyStatements.forEach(statement => {
        transactions.push({
          id: `royalty_${statement.id}`,
          type: 'ROYALTY_PAYMENT',
          entityType: 'ROYALTY_STATEMENT',
          entityId: statement.id,
          description: `Royalty statement for ${statement.creator.name}`,
          amountCents: statement.totalEarningsCents,
          direction: 'DEBIT',
          status: this.mapRoyaltyStatus(statement.status),
          createdAt: statement.createdAt,
          processedAt: statement.paidAt,
          metadata: {
            royaltyStatementId: statement.id,
            creatorId: statement.creatorId,
            creatorName: statement.creator.name,
            royaltyRunId: statement.royaltyRunId,
            statementStatus: statement.status,
            lineItemsCount: statement.lines.length
          },
          relatedEntities: [
            { type: 'CREATOR', id: statement.creatorId, name: statement.creator.name },
            ...statement.lines.map(line => ({
              type: 'LICENSE' as const,
              id: line.licenseId,
              name: `${line.license.brand.name} - ${line.license.ipAsset.title}`
            }))
          ]
        });
      });

      // Payout transactions
      const payouts = await this.prisma.payout.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filters?.creatorIds?.length && { 
            royaltyStatement: { creatorId: { in: filters.creatorIds } } 
          })
        },
        include: {
          royaltyStatement: {
            include: {
              creator: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { [sortBy]: sortOrder }
      });

      payouts.forEach(payout => {
        transactions.push({
          id: `payout_${payout.id}`,
          type: 'PAYOUT_TRANSFER',
          entityType: 'PAYOUT',
          entityId: payout.id,
          description: `Payout to ${payout.royaltyStatement.creator.name}`,
          amountCents: payout.amountCents,
          direction: 'DEBIT',
          status: this.mapPayoutStatus(payout.status),
          createdAt: payout.createdAt,
          processedAt: payout.paidAt,
          metadata: {
            payoutId: payout.id,
            royaltyStatementId: payout.royaltyStatementId,
            creatorId: payout.royaltyStatement.creatorId,
            creatorName: payout.royaltyStatement.creator.name,
            payoutStatus: payout.status,
            paymentMethod: payout.paymentMethod,
            externalReference: payout.externalReference
          },
          relatedEntities: [
            { 
              type: 'CREATOR', 
              id: payout.royaltyStatement.creatorId, 
              name: payout.royaltyStatement.creator.name 
            },
            { 
              type: 'ROYALTY_STATEMENT', 
              id: payout.royaltyStatementId, 
              name: `Statement ${payout.royaltyStatementId}` 
            }
          ]
        });
      });

      // Sort all transactions
      return transactions.sort((a, b) => {
        const aValue = a[sortBy as keyof TransactionEntry];
        const bValue = b[sortBy as keyof TransactionEntry];
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

    } catch (error) {
      throw new ReportDataSourceError(
        'transaction_entries',
        `Failed to fetch transaction entries: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate ledger summary
   */
  private async generateLedgerSummary(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<LedgerSummary> {
    try {
      // License revenue summary
      const licenseRevenue = await this.prisma.license.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'ACTIVE',
          ...(filters?.brandIds?.length && { brandId: { in: filters.brandIds } })
        },
        _sum: { feeCents: true },
        _count: { id: true }
      });

      // Royalty payments summary
      const royaltyPayments = await this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filters?.creatorIds?.length && { creatorId: { in: filters.creatorIds } })
        },
        _sum: { totalEarningsCents: true },
        _count: { id: true }
      });

      // Actual payouts summary
      const actualPayouts = await this.prisma.payout.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        _sum: { amountCents: true },
        _count: { id: true }
      });

      const totalCreditsCents = licenseRevenue._sum.feeCents || 0;
      const totalDebitsCents = (royaltyPayments._sum.totalEarningsCents || 0) + (actualPayouts._sum.amountCents || 0);
      const netBalanceCents = totalCreditsCents - totalDebitsCents;

      return {
        totalCreditsCents,
        totalDebitsCents,
        netBalanceCents,
        transactionCounts: {
          total: (licenseRevenue._count.id || 0) + (royaltyPayments._count.id || 0) + (actualPayouts._count.id || 0),
          credits: licenseRevenue._count.id || 0,
          debits: (royaltyPayments._count.id || 0) + (actualPayouts._count.id || 0)
        },
        periodSummary: {
          startDate,
          endDate,
          daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        }
      };

    } catch (error) {
      throw new ReportDataSourceError(
        'ledger_summary',
        `Failed to generate ledger summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate balance snapshot at a specific date
   */
  private async generateBalanceSnapshot(endDate: Date) {
    try {
      // Total revenue to date
      const totalRevenue = await this.prisma.license.aggregate({
        where: {
          createdAt: { lte: endDate },
          status: 'ACTIVE'
        },
        _sum: { feeCents: true }
      });

      // Total royalty obligations to date
      const totalRoyaltyObligations = await this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { lte: endDate }
        },
        _sum: { totalEarningsCents: true }
      });

      // Total actual payouts to date
      const totalPayouts = await this.prisma.payout.aggregate({
        where: {
          createdAt: { lte: endDate },
          status: 'COMPLETED'
        },
        _sum: { amountCents: true }
      });

      // Pending payouts
      const pendingPayouts = await this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { lte: endDate },
          status: { in: ['PENDING', 'REVIEWED'] }
        },
        _sum: { totalEarningsCents: true }
      });

      const totalRevenueCents = totalRevenue._sum.feeCents || 0;
      const totalRoyaltyObligationsCents = totalRoyaltyObligations._sum.totalEarningsCents || 0;
      const totalPayoutsCents = totalPayouts._sum.amountCents || 0;
      const pendingPayoutsCents = pendingPayouts._sum.totalEarningsCents || 0;

      return {
        asOfDate: endDate,
        totalRevenueCents,
        totalRoyaltyObligationsCents,
        totalPayoutsCents,
        pendingPayoutsCents,
        netPositionCents: totalRevenueCents - totalRoyaltyObligationsCents,
        availableCashCents: totalRevenueCents - totalPayoutsCents,
        outstandingLiabilitiesCents: pendingPayoutsCents
      };

    } catch (error) {
      throw new ReportDataSourceError(
        'balance_snapshot',
        `Failed to generate balance snapshot: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Map royalty statement status to transaction status
   */
  private mapRoyaltyStatus(status: string): 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    switch (status) {
      case 'PENDING':
      case 'REVIEWED':
        return 'PENDING';
      case 'PAID':
        return 'COMPLETED';
      case 'DISPUTED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Map payout status to transaction status
   */
  private mapPayoutStatus(status: string): 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    switch (status) {
      case 'PENDING':
      case 'PROCESSING':
        return 'PENDING';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }
}
