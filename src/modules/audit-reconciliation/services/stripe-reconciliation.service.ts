/**
 * Stripe Reconciliation Service
 * 
 * Comprehensive Stripe reconciliation system that compares internal transaction 
 * records with Stripe's records to identify discrepancies. Fetches data from 
 * Stripe's API and matches with internal transactions using multiple criteria.
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { AuditService } from '@/lib/services/audit.service';
import { 
  StripeReconciliationReport,
  ReconciledTransaction,
  UnmatchedTransaction,
  ReconciliationDiscrepancy,
  BaseAuditConfig
} from '../types';

export interface StripeReconciliationConfig extends BaseAuditConfig {
  includeCharges?: boolean;
  includeRefunds?: boolean;
  includeTransfers?: boolean;
  includePayouts?: boolean;
  reconciliationType?: 'FULL' | 'INCREMENTAL';
  autoResolveDiscrepancies?: boolean;
}

export class StripeReconciliationService {
  private stripe: Stripe;
  
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    stripeSecretKey: string
  ) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover',
    });
  }

  /**
   * Generate comprehensive Stripe reconciliation report
   */
  async generateReconciliationReport(
    config: StripeReconciliationConfig
  ): Promise<StripeReconciliationReport> {
    try {
      const { startDate, endDate } = config;

      // Fetch data from both systems
      const [internalTransactions, stripeTransactions] = await Promise.all([
        this.getInternalTransactions(startDate, endDate, config),
        this.getStripeTransactions(startDate, endDate, config)
      ]);

      // Perform reconciliation
      const reconciliationResults = await this.performReconciliation(
        internalTransactions,
        stripeTransactions
      );

      // Calculate summary metrics
      const summaryMetrics = this.calculateSummaryMetrics(
        internalTransactions,
        stripeTransactions,
        reconciliationResults
      );

      const report: StripeReconciliationReport = {
        id: `stripe_reconciliation_${Date.now()}`,
        type: 'STRIPE_RECONCILIATION',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        ...reconciliationResults,
        ...summaryMetrics
      };

      // Store reconciliation results for future reference
      await this.storeReconciliationResults(report);

      // Log the reconciliation
      await this.auditService.log({
        action: 'STRIPE_RECONCILIATION_COMPLETED',
        entityType: 'reconciliation_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          period: { startDate, endDate },
          matchedCount: report.matchedCount,
          discrepancyCount: report.discrepancyCount,
          reconciliationRate: report.reconciliationRate
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'STRIPE_RECONCILIATION_FAILED',
        entityType: 'reconciliation_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate Stripe reconciliation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get internal transactions from database
   */
  private async getInternalTransactions(
    startDate: Date,
    endDate: Date,
    config: StripeReconciliationConfig
  ) {
    const transactions = [];

    // Get payments if requested
    if (config.includeCharges !== false) {
      const payments = await this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          stripePaymentIntentId: { not: null }
        },
        include: {
          brand: { select: { id: true, companyName: true } }
        }
      });

      transactions.push(...payments.map(p => ({
        id: p.id,
        type: 'payment',
        stripeId: p.stripePaymentIntentId,
        amount: Number(p.amount) * 100, // Convert to cents
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt,
        metadata: {
          brandId: p.brandId,
          brandName: p.brand.companyName,
          paymentMethod: p.paymentMethod
        }
      })));
    }

    // Get payouts if requested
    if (config.includeTransfers !== false) {
      const payouts = await this.prisma.payout.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          stripeTransferId: { not: null }
        },
        include: {
          creator: { select: { id: true, stageName: true } }
        }
      });

      transactions.push(...payouts.map(p => ({
        id: p.id,
        type: 'payout',
        stripeId: p.stripeTransferId,
        amount: p.amountCents,
        currency: 'USD',
        status: p.status,
        createdAt: p.createdAt,
        metadata: {
          creatorId: p.creatorId,
          creatorName: p.creator.stageName
        }
      })));
    }

    return transactions;
  }

  /**
   * Get Stripe transactions from API
   */
  private async getStripeTransactions(
    startDate: Date,
    endDate: Date,
    config: StripeReconciliationConfig
  ) {
    const transactions = [];

    try {
      // Get charges if requested
      if (config.includeCharges !== false) {
        const charges = await this.getAllStripeCharges(startDate, endDate);
        transactions.push(...charges.map(charge => ({
          id: charge.id,
          type: 'charge',
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          createdAt: new Date(charge.created * 1000),
          metadata: {
            paymentIntent: charge.payment_intent,
            customer: charge.customer,
            description: charge.description,
            stripeMetadata: charge.metadata
          }
        })));
      }

      // Get transfers if requested
      if (config.includeTransfers !== false) {
        const transfers = await this.getAllStripeTransfers(startDate, endDate);
        transactions.push(...transfers.map(transfer => ({
          id: transfer.id,
          type: 'transfer',
          amount: transfer.amount,
          currency: transfer.currency,
          status: 'completed', // Transfers don't have status, assume completed when retrieved
          createdAt: new Date(transfer.created * 1000),
          metadata: {
            destination: transfer.destination,
            description: transfer.description,
            stripeMetadata: transfer.metadata
          }
        })));
      }

      // Get refunds if requested
      if (config.includeRefunds !== false) {
        const refunds = await this.getAllStripeRefunds(startDate, endDate);
        transactions.push(...refunds.map(refund => ({
          id: refund.id,
          type: 'refund',
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          createdAt: new Date(refund.created * 1000),
          metadata: {
            charge: refund.charge,
            reason: refund.reason,
            stripeMetadata: refund.metadata
          }
        })));
      }

      return transactions;
    } catch (error) {
      throw new Error(`Failed to fetch Stripe transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all Stripe charges with pagination
   */
  private async getAllStripeCharges(startDate: Date, endDate: Date) {
    const charges = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const response = await this.stripe.charges.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000)
        },
        limit: 100,
        starting_after: startingAfter
      });

      charges.push(...response.data);
      hasMore = response.has_more;
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return charges;
  }

  /**
   * Get all Stripe transfers with pagination
   */
  private async getAllStripeTransfers(startDate: Date, endDate: Date) {
    const transfers = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const response = await this.stripe.transfers.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000)
        },
        limit: 100,
        starting_after: startingAfter
      });

      transfers.push(...response.data);
      hasMore = response.has_more;
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return transfers;
  }

  /**
   * Get all Stripe refunds with pagination
   */
  private async getAllStripeRefunds(startDate: Date, endDate: Date) {
    const refunds = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const response = await this.stripe.refunds.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000)
        },
        limit: 100,
        starting_after: startingAfter
      });

      refunds.push(...response.data);
      hasMore = response.has_more;
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return refunds;
  }

  /**
   * Perform reconciliation between internal and Stripe transactions
   */
  private async performReconciliation(
    internalTransactions: any[],
    stripeTransactions: any[]
  ) {
    const matchedTransactions: ReconciledTransaction[] = [];
    const unmatchedInternal: UnmatchedTransaction[] = [];
    const unmatchedStripe: UnmatchedTransaction[] = [];
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // Create maps for efficient lookups
    const stripeByInternalId = new Map();
    const stripeById = new Map();
    
    stripeTransactions.forEach(st => {
      stripeById.set(st.id, st);
      // Try to find internal reference in metadata
      if (st.metadata?.internalId) {
        stripeByInternalId.set(st.metadata.internalId, st);
      }
    });

    const internalById = new Map();
    internalTransactions.forEach(it => {
      internalById.set(it.id, it);
    });

    const matchedInternalIds = new Set();
    const matchedStripeIds = new Set();

    // First pass: Exact matches by Stripe ID
    for (const internal of internalTransactions) {
      if (internal.stripeId && stripeById.has(internal.stripeId)) {
        const stripe = stripeById.get(internal.stripeId);
        const match = this.createReconciledTransaction(internal, stripe, 'EXACT');
        matchedTransactions.push(match);
        
        matchedInternalIds.add(internal.id);
        matchedStripeIds.add(stripe.id);

        // Check for discrepancies
        const discrepancy = this.checkForDiscrepancies(internal, stripe);
        if (discrepancy) {
          discrepancies.push(discrepancy);
        }
      }
    }

    // Second pass: Fuzzy matching for unmatched transactions
    const unmatchedInternalList = internalTransactions.filter(t => !matchedInternalIds.has(t.id));
    const unmatchedStripeList = stripeTransactions.filter(t => !matchedStripeIds.has(t.id));

    for (const internal of unmatchedInternalList) {
      let bestMatch = null;
      let bestConfidence = 0;

      for (const stripe of unmatchedStripeList) {
        if (matchedStripeIds.has(stripe.id)) continue;

        const confidence = this.calculateMatchConfidence(internal, stripe);
        if (confidence > bestConfidence && confidence > 0.7) {
          bestMatch = stripe;
          bestConfidence = confidence;
        }
      }

      if (bestMatch) {
        const match = this.createReconciledTransaction(internal, bestMatch, 'FUZZY');
        match.matchConfidence = bestConfidence;
        matchedTransactions.push(match);
        
        matchedInternalIds.add(internal.id);
        matchedStripeIds.add(bestMatch.id);

        // Check for discrepancies
        const discrepancy = this.checkForDiscrepancies(internal, bestMatch);
        if (discrepancy) {
          discrepancies.push(discrepancy);
        }
      }
    }

    // Collect truly unmatched transactions
    internalTransactions
      .filter(t => !matchedInternalIds.has(t.id))
      .forEach(t => {
        unmatchedInternal.push(this.createUnmatchedTransaction(t, 'INTERNAL'));
      });

    stripeTransactions
      .filter(t => !matchedStripeIds.has(t.id))
      .forEach(t => {
        unmatchedStripe.push(this.createUnmatchedTransaction(t, 'STRIPE'));
      });

    return {
      matchedTransactions,
      unmatchedInternal,
      unmatchedStripe,
      discrepancies
    };
  }

  /**
   * Create a reconciled transaction record
   */
  private createReconciledTransaction(
    internal: any,
    stripe: any,
    matchType: 'EXACT' | 'FUZZY' | 'MANUAL'
  ): ReconciledTransaction {
    const timestampDiff = Math.abs(
      internal.createdAt.getTime() - stripe.createdAt.getTime()
    );

    return {
      internalTransactionId: internal.id,
      stripeTransactionId: stripe.id,
      matchType,
      matchConfidence: matchType === 'EXACT' ? 1.0 : 0.8,
      internalAmount: internal.amount,
      stripeAmount: stripe.amount,
      amountMatch: internal.amount === stripe.amount,
      timestampDiff,
      metadata: {
        internalData: internal,
        stripeData: stripe
      }
    };
  }

  /**
   * Create an unmatched transaction record
   */
  private createUnmatchedTransaction(
    transaction: any,
    source: 'INTERNAL' | 'STRIPE'
  ): UnmatchedTransaction {
    return {
      id: transaction.id,
      source,
      amount: transaction.amount,
      timestamp: transaction.createdAt,
      description: transaction.description || transaction.type || 'No description',
      metadata: transaction.metadata || {},
      possibleMatches: [] // TODO: Implement fuzzy match suggestions
    };
  }

  /**
   * Calculate match confidence between internal and Stripe transactions
   */
  private calculateMatchConfidence(internal: any, stripe: any): number {
    let confidence = 0;

    // Amount match (40% weight)
    if (internal.amount === stripe.amount) {
      confidence += 0.4;
    } else if (Math.abs(internal.amount - stripe.amount) <= 100) { // Within $1
      confidence += 0.2;
    }

    // Timestamp match (30% weight)
    const timeDiff = Math.abs(internal.createdAt.getTime() - stripe.createdAt.getTime());
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 1) {
      confidence += 0.3;
    } else if (daysDiff <= 7) {
      confidence += 0.15;
    }

    // Type match (20% weight)
    if (this.typesMatch(internal.type, stripe.type)) {
      confidence += 0.2;
    }

    // Metadata match (10% weight)
    if (this.metadataMatches(internal, stripe)) {
      confidence += 0.1;
    }

    return confidence;
  }

  /**
   * Check if transaction types match
   */
  private typesMatch(internalType: string, stripeType: string): boolean {
    const typeMap: Record<string, string[]> = {
      'payment': ['charge'],
      'payout': ['transfer'],
      'refund': ['refund']
    };

    return typeMap[internalType]?.includes(stripeType) || false;
  }

  /**
   * Check if metadata indicates a match
   */
  private metadataMatches(internal: any, stripe: any): boolean {
    // Check for common identifiers in metadata
    if (stripe.metadata?.internalId === internal.id) return true;
    if (internal.metadata?.stripeId === stripe.id) return true;
    
    // Check for customer/creator matches
    if (internal.metadata?.customerId && stripe.metadata?.customerId) {
      return internal.metadata.customerId === stripe.metadata.customerId;
    }

    return false;
  }

  /**
   * Check for discrepancies between matched transactions
   */
  private checkForDiscrepancies(
    internal: any,
    stripe: any
  ): ReconciliationDiscrepancy | null {
    const discrepancies = [];

    // Amount discrepancy
    if (internal.amount !== stripe.amount) {
      discrepancies.push({
        type: 'AMOUNT_MISMATCH' as const,
        severity: 'HIGH' as const,
        description: `Amount mismatch: Internal ${internal.amount} vs Stripe ${stripe.amount}`,
        details: {
          internal: { amount: internal.amount },
          stripe: { amount: stripe.amount },
          differences: { amountDelta: stripe.amount - internal.amount }
        }
      });
    }

    // Status discrepancy
    if (this.normalizeStatus(internal.status) !== this.normalizeStatus(stripe.status)) {
      discrepancies.push({
        type: 'STATUS_MISMATCH' as const,
        severity: 'MEDIUM' as const,
        description: `Status mismatch: Internal ${internal.status} vs Stripe ${stripe.status}`,
        details: {
          internal: { status: internal.status },
          stripe: { status: stripe.status },
          differences: { statusConflict: true }
        }
      });
    }

    // Timing discrepancy
    const timeDiff = Math.abs(internal.createdAt.getTime() - stripe.createdAt.getTime());
    if (timeDiff > 24 * 60 * 60 * 1000) { // More than 24 hours
      discrepancies.push({
        type: 'TIMING_MISMATCH' as const,
        severity: 'MEDIUM' as const,
        description: `Timing mismatch: ${Math.round(timeDiff / (60 * 60 * 1000))} hours difference`,
        details: {
          internal: { createdAt: internal.createdAt },
          stripe: { createdAt: stripe.createdAt },
          differences: { timeDifferenceMs: timeDiff }
        }
      });
    }

    if (discrepancies.length === 0) return null;

    // Return the most severe discrepancy
    const mostSevere = discrepancies.reduce((prev, curr) => 
      this.getSeverityLevel(curr.severity) > this.getSeverityLevel(prev.severity) ? curr : prev
    );

    return {
      id: `discrepancy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...mostSevere,
      internalTransactionId: internal.id,
      stripeTransactionId: stripe.id
    };
  }

  /**
   * Normalize status for comparison
   */
  private normalizeStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'COMPLETED': 'succeeded',
      'FAILED': 'failed',
      'PENDING': 'pending',
      'PROCESSING': 'pending'
    };

    return statusMap[status?.toUpperCase()] || status?.toLowerCase() || 'unknown';
  }

  /**
   * Get numeric severity level for comparison
   */
  private getSeverityLevel(severity: string): number {
    const levels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    return levels[severity as keyof typeof levels] || 0;
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummaryMetrics(
    internalTransactions: any[],
    stripeTransactions: any[],
    reconciliationResults: any
  ) {
    const totalInternalCents = internalTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalStripeCents = stripeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const discrepancyCents = Math.abs(totalInternalCents - totalStripeCents);
    
    const matchedCount = reconciliationResults.matchedTransactions.length;
    const totalTransactions = Math.max(internalTransactions.length, stripeTransactions.length);
    const reconciliationRate = totalTransactions > 0 ? (matchedCount / totalTransactions) * 100 : 0;

    return {
      totalInternalCents,
      totalStripeCents,
      discrepancyCents,
      reconciliationRate,
      matchedCount,
      unmatchedInternalCount: reconciliationResults.unmatchedInternal.length,
      unmatchedStripeCount: reconciliationResults.unmatchedStripe.length,
      discrepancyCount: reconciliationResults.discrepancies.length
    };
  }

  /**
   * Store reconciliation results for audit and future reference
   */
  private async storeReconciliationResults(report: StripeReconciliationReport) {
    // Store in audit events for permanent record
    await this.auditService.log({
      action: 'STRIPE_RECONCILIATION_STORED',
      entityType: 'reconciliation_report',
      entityId: report.id,
      after: {
        reportId: report.id,
        period: {
          start: report.periodStart,
          end: report.periodEnd
        },
        summary: {
          matchedCount: report.matchedCount,
          discrepancyCount: report.discrepancyCount,
          reconciliationRate: report.reconciliationRate,
          totalInternalCents: report.totalInternalCents,
          totalStripeCents: report.totalStripeCents
        }
      }
    });
  }
}
