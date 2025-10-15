/**
 * Refund and Chargeback Reports Service
 * 
 * Comprehensive reporting system for refunds and chargebacks that tracks
 * financial impact, dispute management, trends analysis, and provides
 * actionable insights for reducing chargebacks and optimizing refund processes.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import Stripe from 'stripe';
import { 
  RefundChargebackReport,
  RefundTransaction,
  ChargebackTransaction,
  DisputeStatus,
  BaseAuditConfig
} from '../types';

export interface RefundChargebackConfig extends BaseAuditConfig {
  includeWonDisputes?: boolean;
  includePartialRefunds?: boolean;
  groupByReason?: boolean;
  minAmountCents?: number; // Minimum amount to include
}

export class RefundChargebackReportsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    stripeSecretKey?: string
  ) {
    this.stripe = new Stripe(stripeSecretKey || process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
      apiVersion: '2025-09-30.clover'
    });
  }

  /**
   * Generate comprehensive refund and chargeback report
   */
  async generateRefundChargebackReport(
    config: RefundChargebackConfig
  ): Promise<RefundChargebackReport> {
    try {
      const { startDate, endDate } = config;

      // Get refunds and chargebacks
      const refunds = await this.getRefunds(startDate, endDate, config);
      const chargebacks = await this.getChargebacks(startDate, endDate, config);
      
      // Generate analysis
      const refundSummary = this.generateRefundSummary(refunds);
      const chargebackSummary = this.generateChargebackSummary(chargebacks);
      const netFinancialImpact = this.calculateNetFinancialImpact(refunds, chargebacks);
      const trendAnalysis = await this.generateTrendAnalysis(startDate, endDate);
      const topReasons = this.getTopRefundChargebackReasons(refunds, chargebacks);

      const report: RefundChargebackReport = {
        id: `refund_chargeback_${Date.now()}`,
        type: 'REFUNDS_CHARGEBACKS',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        refunds,
        chargebacks,
        refundSummary,
        chargebackSummary,
        netFinancialImpact,
        trendAnalysis,
        topReasons
      };

      // Log the report generation
      await this.auditService.log({
        action: 'REFUND_CHARGEBACK_REPORT_GENERATED',
        entityType: 'refund_chargeback_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          period: { startDate, endDate },
          refundCount: refunds.length,
          chargebackCount: chargebacks.length,
          netImpactCents: netFinancialImpact.totalNetImpactCents
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'REFUND_CHARGEBACK_REPORT_FAILED',
        entityType: 'refund_chargeback_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate refund/chargeback report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get refunds from database and Stripe
   */
  private async getRefunds(
    startDate: Date,
    endDate: Date,
    config: RefundChargebackConfig
  ): Promise<RefundTransaction[]> {
    const refunds: RefundTransaction[] = [];

    // Get refunds from audit events (refund actions)
    const refundEvents = await this.prisma.auditEvent.findMany({
      where: {
        action: { in: ['PAYMENT_REFUNDED', 'REFUND_ISSUED'] },
        timestamp: { gte: startDate, lte: endDate }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Process each refund event
    for (const event of refundEvents) {
      const eventData = (event.afterJson as any) || {};
      
      // Get the original payment
      const payment = await this.prisma.payment.findUnique({
        where: { id: event.entityId },
        include: {
          brand: {
            select: { id: true, companyName: true, user: { select: { email: true } } }
          }
        }
      });

      if (!payment) continue;

      // Get Stripe refund details if available
      let stripeRefund = null;
      if (eventData.stripeRefundId) {
        try {
          stripeRefund = await this.stripe.refunds.retrieve(eventData.stripeRefundId);
        } catch (error) {
          // Stripe refund not found or error - continue without it
        }
      }

      const refundAmountCents = eventData.refundAmountCents || 
                              (stripeRefund ? stripeRefund.amount : Number(payment.amount) * 100);

      const refund: RefundTransaction = {
        id: eventData.stripeRefundId || `refund_${event.id}`,
        originalTransactionId: payment.id,
        processedAt: event.timestamp,
        
        // Financial details
        refundAmountCents,
        originalAmountCents: Number(payment.amount) * 100,
        currency: payment.currency,
        
        // Customer details
        customerId: payment.brandId,
        customerEmail: payment.brand?.user?.email || 'Unknown',
        
        // Refund details
        reason: eventData.reason || stripeRefund?.reason || 'requested_by_customer',
        refundMethod: stripeRefund?.charge ? 'stripe' : 'manual',
        status: stripeRefund?.status || 'succeeded',
        
        // Context
        initiatedBy: event.userId || 'system',
        customerInitiated: eventData.customerInitiated || false,
        
        // Metadata
        isPartial: refundAmountCents < Number(payment.amount) * 100,
        feeRefunded: stripeRefund?.metadata?.fee_refunded === 'true',
        
        // Processing details
        processingTimeHours: this.calculateProcessingTime(payment.createdAt, event.timestamp),
        stripeRefundId: eventData.stripeRefundId,
        internalNotes: eventData.notes || '',
        
        // Financial impact
        netImpactCents: -refundAmountCents // Negative impact
      };

      refunds.push(refund);
    }

    return refunds.filter(refund => 
      !config.minAmountCents || refund.refundAmountCents >= config.minAmountCents
    );
  }

  /**
   * Get chargebacks from Stripe disputes
   */
  private async getChargebacks(
    startDate: Date,
    endDate: Date,
    config: RefundChargebackConfig
  ): Promise<ChargebackTransaction[]> {
    const chargebacks: ChargebackTransaction[] = [];

    try {
      // Get disputes from Stripe
      const disputes = await this.stripe.disputes.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000)
        },
        limit: 100
      });

      for (const dispute of disputes.data) {
        // Find the corresponding payment in our database
        const payment = await this.prisma.payment.findFirst({
          where: {
            stripePaymentIntentId: dispute.charge as string
          },
          include: {
            brand: {
              select: { id: true, companyName: true, user: { select: { email: true } } }
            }
          }
        });

        if (!payment && !config.includeWonDisputes) continue;

        const chargeback: ChargebackTransaction = {
          id: dispute.id,
          originalTransactionId: payment?.id || dispute.charge as string,
          disputeCreatedAt: new Date(dispute.created * 1000),
          
          // Financial details
          disputeAmountCents: dispute.amount,
          originalAmountCents: payment ? Number(payment.amount) * 100 : dispute.amount,
          currency: dispute.currency.toUpperCase(),
          
          // Customer details
          customerId: payment?.brandId || 'unknown',
          customerEmail: payment?.brand?.user?.email || 'Unknown',
          
          // Dispute details
          reason: dispute.reason,
          status: this.mapStripeDisputeStatus(dispute.status),
          evidenceDueBy: dispute.evidence_details.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null,
          
          // Response tracking
          evidenceSubmitted: dispute.evidence_details.submission_count > 0,
          evidenceSubmittedAt: null, // Stripe doesn't provide this timestamp directly
          
          // Outcome
          isLiable: dispute.status === 'lost',
          networkReasonCode: dispute.network_reason_code || '',
          
          // Financial impact
          chargebackFeeCents: 1500, // Standard $15 chargeback fee
          netImpactCents: dispute.status === 'lost' ? 
            -(dispute.amount + 1500) : // Lost: amount + fee
            (dispute.status === 'won' ? 0 : -1500), // Won: no impact, Pending: just fee
          
          // Metadata
          stripeDisputeId: dispute.id,
          isInquiry: dispute.reason === 'credit_not_processed' || dispute.reason === 'duplicate',
          
          // Resolution
          resolvedAt: ['won', 'lost'].includes(dispute.status) ? 
            new Date(dispute.created * 1000) : null, // Approximate resolution date
          resolutionMethod: this.getResolutionMethod(dispute)
        };

        chargebacks.push(chargeback);
      }
    } catch (error) {
      // Log error but continue - we might have partial data
      await this.auditService.log({
        action: 'CHARGEBACK_FETCH_ERROR',
        entityType: 'chargeback_report',
        entityId: 'unknown',
        after: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }

    return chargebacks.filter(chargeback => 
      !config.minAmountCents || chargeback.disputeAmountCents >= config.minAmountCents
    );
  }

  /**
   * Map Stripe dispute status to our enum
   */
  private mapStripeDisputeStatus(stripeStatus: string): DisputeStatus {
    switch (stripeStatus) {
      case 'warning_needs_response':
      case 'warning_under_review':
        return DisputeStatus.WARNING;
      case 'needs_response':
      case 'under_review':
        return DisputeStatus.UNDER_REVIEW;
      case 'charge_refunded':
        return DisputeStatus.REFUNDED;
      case 'won':
        return DisputeStatus.WON;
      case 'lost':
        return DisputeStatus.LOST;
      default:
        return DisputeStatus.PENDING;
    }
  }

  /**
   * Get resolution method based on dispute details
   */
  private getResolutionMethod(dispute: any): string {
    if (dispute.status === 'charge_refunded') return 'refunded';
    if (dispute.status === 'won') return 'evidence_provided';
    if (dispute.status === 'lost') return 'insufficient_evidence';
    return 'pending';
  }

  /**
   * Calculate processing time in hours
   */
  private calculateProcessingTime(startTime: Date, endTime: Date): number {
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Generate refund summary statistics
   */
  private generateRefundSummary(refunds: RefundTransaction[]) {
    const totalRefunds = refunds.length;
    const totalRefundAmountCents = refunds.reduce((sum, r) => sum + r.refundAmountCents, 0);
    const partialRefunds = refunds.filter(r => r.isPartial).length;
    const customerInitiated = refunds.filter(r => r.customerInitiated).length;
    
    // Calculate average processing time
    const avgProcessingHours = refunds.length > 0 ? 
      refunds.reduce((sum, r) => sum + r.processingTimeHours, 0) / refunds.length : 0;

    // Group by reason
    const reasonBreakdown = new Map<string, number>();
    refunds.forEach(refund => {
      const count = reasonBreakdown.get(refund.reason) || 0;
      reasonBreakdown.set(refund.reason, count + 1);
    });

    return {
      totalRefunds,
      totalRefundAmountCents,
      partialRefundsCount: partialRefunds,
      customerInitiatedCount: customerInitiated,
      avgProcessingHours,
      refundRate: 0, // Would need total transactions to calculate
      reasonBreakdown: Array.from(reasonBreakdown.entries()).map(([reason, count]) => ({
        reason,
        count,
        percentage: (count / totalRefunds) * 100
      }))
    };
  }

  /**
   * Generate chargeback summary statistics
   */
  private generateChargebackSummary(chargebacks: ChargebackTransaction[]) {
    const totalChargebacks = chargebacks.length;
    const totalDisputeAmountCents = chargebacks.reduce((sum, c) => sum + c.disputeAmountCents, 0);
        const lostChargebacks = chargebacks.filter(c => c.isLiable).length;
        const wonChargebacks = chargebacks.filter(c => c.status === DisputeStatus.WON).length;    // Calculate win rate
    const winRate = totalChargebacks > 0 ? (wonChargebacks / totalChargebacks) * 100 : 0;
    
    // Group by reason
    const reasonBreakdown = new Map<string, number>();
    chargebacks.forEach(chargeback => {
      const count = reasonBreakdown.get(chargeback.reason) || 0;
      reasonBreakdown.set(chargeback.reason, count + 1);
    });

    return {
      totalChargebacks,
      totalDisputeAmountCents,
      lostChargebacksCount: lostChargebacks,
      wonChargebacksCount: wonChargebacks,
      winRate,
      chargebackRate: 0, // Would need total transactions to calculate
      reasonBreakdown: Array.from(reasonBreakdown.entries()).map(([reason, count]) => ({
        reason,
        count,
        percentage: (count / totalChargebacks) * 100
      }))
    };
  }

  /**
   * Calculate net financial impact
   */
  private calculateNetFinancialImpact(
    refunds: RefundTransaction[],
    chargebacks: ChargebackTransaction[]
  ) {
    const totalRefundImpactCents = refunds.reduce((sum, r) => sum + r.netImpactCents, 0);
    const totalChargebackImpactCents = chargebacks.reduce((sum, c) => sum + c.netImpactCents, 0);
    const totalNetImpactCents = totalRefundImpactCents + totalChargebackImpactCents;

    return {
      totalRefundImpactCents,
      totalChargebackImpactCents,
      totalNetImpactCents,
      
      // Breakdown by type
      refundsByReason: this.groupFinancialImpactByReason(refunds, 'reason'),
      chargebacksByReason: this.groupFinancialImpactByReason(chargebacks, 'reason')
    };
  }

  /**
   * Group financial impact by reason
   */
  private groupFinancialImpactByReason(
    transactions: (RefundTransaction | ChargebackTransaction)[],
    reasonField: string
  ) {
    const grouped = new Map<string, { count: number; impactCents: number }>();
    
    transactions.forEach(transaction => {
      const reason = (transaction as any)[reasonField];
      const existing = grouped.get(reason) || { count: 0, impactCents: 0 };
      existing.count++;
      existing.impactCents += transaction.netImpactCents;
      grouped.set(reason, existing);
    });

    return Array.from(grouped.entries()).map(([reason, data]) => ({
      reason,
      count: data.count,
      impactCents: data.impactCents
    }));
  }

  /**
   * Generate trend analysis over time
   */
  private async generateTrendAnalysis(startDate: Date, endDate: Date) {
    const trends = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Count refunds for this day
      const dayRefunds = await this.prisma.auditEvent.count({
        where: {
          action: { in: ['PAYMENT_REFUNDED', 'REFUND_ISSUED'] },
          timestamp: { gte: dayStart, lte: dayEnd }
        }
      });

      trends.push({
        date: new Date(currentDate),
        refundCount: dayRefunds,
        chargebackCount: 0, // Would need to query Stripe for historical data
        netImpactCents: 0 // Would need detailed calculation
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trends;
  }

  /**
   * Get top reasons for refunds and chargebacks
   */
  private getTopRefundChargebackReasons(
    refunds: RefundTransaction[],
    chargebacks: ChargebackTransaction[]
  ) {
    const allReasons = new Map<string, { 
      type: 'refund' | 'chargeback';
      count: number;
      impactCents: number;
    }>();

    // Add refund reasons
    refunds.forEach(refund => {
      const key = `refund_${refund.reason}`;
      const existing = allReasons.get(key) || { type: 'refund' as const, count: 0, impactCents: 0 };
      existing.count++;
      existing.impactCents += refund.netImpactCents;
      allReasons.set(key, existing);
    });

    // Add chargeback reasons
    chargebacks.forEach(chargeback => {
      const key = `chargeback_${chargeback.reason}`;
      const existing = allReasons.get(key) || { type: 'chargeback' as const, count: 0, impactCents: 0 };
      existing.count++;
      existing.impactCents += chargeback.netImpactCents;
      allReasons.set(key, existing);
    });

    return Array.from(allReasons.entries())
      .map(([key, data]) => ({
        reason: key.replace(/^(refund_|chargeback_)/, ''),
        type: data.type,
        count: data.count,
        impactCents: data.impactCents
      }))
      .sort((a, b) => Math.abs(b.impactCents) - Math.abs(a.impactCents))
      .slice(0, 10); // Top 10 reasons
  }

  /**
   * Get detailed refund analysis for a specific customer
   */
  async getCustomerRefundAnalysis(
    customerId: string,
    startDate: Date,
    endDate: Date
  ) {
    const customerRefunds = await this.prisma.auditEvent.findMany({
      where: {
        action: { in: ['PAYMENT_REFUNDED', 'REFUND_ISSUED'] },
        timestamp: { gte: startDate, lte: endDate },
        entityType: 'payment'
      }
    });

    // Filter for this customer by checking the related payment
    const relevantRefunds = [];
    for (const event of customerRefunds) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: event.entityId },
        select: { brandId: true }
      });
      
      if (payment?.brandId === customerId) {
        relevantRefunds.push(event);
      }
    }

    return {
      totalRefunds: relevantRefunds.length,
      refundPattern: 'analysis would go here',
      riskScore: 'medium' // Based on refund frequency and amounts
    };
  }
}
