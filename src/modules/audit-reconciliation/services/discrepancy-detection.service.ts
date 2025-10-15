/**
 * Discrepancy Detection Service
 * 
 * Intelligent discrepancy detection system that continuously monitors for various types
 * of inconsistencies acros          // Check for payments with invalid brand references
        // First, get payments that might have orphaned brand references
        const allPayments = await prisma.payment.findMany({
          include: { brand: true },
          take: 100
        });
        
        const orphanedPayments = allPayments.filter(payment => !payment.brand);onst orphanedPayments = await this.prisma.payment.findMany({
          where: {
            brandId: { equals: null }
          },nancial data. Implements rule-based detection for logical
 * inconsistencies, unusual patterns, and potential data integrity issues.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { 
  DiscrepancyDetectionReport,
  DetectedDiscrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  BaseAuditConfig
} from '../types';

export interface DiscrepancyDetectionConfig extends BaseAuditConfig {
  ruleIds?: string[]; // Specific rules to run
  skipResolved?: boolean; // Skip already resolved discrepancies
  autoAssign?: boolean; // Auto-assign to investigators
  minSeverity?: DiscrepancySeverity;
}

export interface DiscrepancyRule {
  id: string;
  name: string;
  description: string;
  category: DiscrepancyType;
  severity: DiscrepancySeverity;
  enabled: boolean;
  checkFunction: (prisma: PrismaClient) => Promise<DetectedDiscrepancy[]>;
}

export class DiscrepancyDetectionService {
  private rules: Map<string, DiscrepancyRule>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {
    this.rules = new Map();
    this.initializeDetectionRules();
  }

  /**
   * Generate comprehensive discrepancy detection report
   */
  async generateDiscrepancyReport(
    config: DiscrepancyDetectionConfig
  ): Promise<DiscrepancyDetectionReport> {
    try {
      // Get rules to execute
      const rulesToRun = config.ruleIds?.length 
        ? config.ruleIds.map(id => this.rules.get(id)).filter(Boolean) as DiscrepancyRule[]
        : Array.from(this.rules.values()).filter(rule => rule.enabled);

      // Execute detection rules
      const allDiscrepancies: DetectedDiscrepancy[] = [];
      
      for (const rule of rulesToRun) {
        try {
          const ruleDiscrepancies = await rule.checkFunction(this.prisma);
          allDiscrepancies.push(...ruleDiscrepancies);
        } catch (error) {
          console.error(`Error executing rule ${rule.id}:`, error);
          // Continue with other rules
        }
      }

      // Filter by severity if specified
      const filteredDiscrepancies = config.minSeverity 
        ? allDiscrepancies.filter(d => this.getSeverityLevel(d.severity) >= this.getSeverityLevel(config.minSeverity!))
        : allDiscrepancies;

      // Filter out resolved discrepancies if requested
      const finalDiscrepancies = config.skipResolved 
        ? filteredDiscrepancies.filter(d => d.status === 'NEW' || d.status === 'INVESTIGATING')
        : filteredDiscrepancies;

      // Generate breakdown by type
      const discrepancyBreakdown = this.generateDiscrepancyBreakdown(finalDiscrepancies);

      // Assess overall risk
      const overallRiskLevel = this.assessOverallRisk(finalDiscrepancies);

      // Generate recommended actions
      const recommendedActions = this.generateRecommendedActions(finalDiscrepancies);

      const report: DiscrepancyDetectionReport = {
        id: `discrepancy_detection_${Date.now()}`,
        type: 'DISCREPANCY_DETECTION',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        
        discrepancies: finalDiscrepancies,
        discrepancyBreakdown,
        overallRiskLevel,
        recommendedActions
      };

      // Store discrepancies for tracking
      await this.storeDiscrepancies(finalDiscrepancies);

      // Auto-assign if configured
      if (config.autoAssign) {
        await this.autoAssignDiscrepancies(finalDiscrepancies);
      }

      // Log the detection run
      await this.auditService.log({
        action: 'DISCREPANCY_DETECTION_COMPLETED',
        entityType: 'discrepancy_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          rulesExecuted: rulesToRun.length,
          discrepanciesFound: finalDiscrepancies.length,
          overallRiskLevel: report.overallRiskLevel,
          highSeverityCount: finalDiscrepancies.filter(d => d.severity === 'HIGH' || d.severity === 'CRITICAL').length
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'DISCREPANCY_DETECTION_FAILED',
        entityType: 'discrepancy_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate discrepancy detection report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize built-in detection rules
   */
  private initializeDetectionRules() {
    // Orphaned Transactions Rule
    this.rules.set('orphaned_transactions', {
      id: 'orphaned_transactions',
      name: 'Orphaned Transactions',
      description: 'Transactions that reference non-existent customers or orders',
      category: 'ORPHANED_TRANSACTION',
      severity: 'HIGH',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for payments with invalid brand references
        // First, get payments that might have orphaned brand references
        const allPayments = await prisma.payment.findMany({
          include: { brand: true },
          take: 100
        });
        
        const orphanedPayments = allPayments.filter(payment => !payment.brand);

        orphanedPayments.forEach(payment => {
          discrepancies.push({
            id: `orphaned_payment_${payment.id}`,
            type: 'ORPHANED_TRANSACTION',
            severity: 'HIGH',
            title: 'Payment with Invalid Brand Reference',
            description: `Payment ${payment.id} references non-existent brand ${payment.brandId}`,
            entityType: 'payment',
            entityId: payment.id,
            relatedEntities: [{ type: 'brand', id: payment.brandId }],
            impactCents: Number(payment.amount) * 100,
            detectedAt: new Date(),
            confidence: 0.9,
            evidence: [{ type: 'missing_reference', brandId: payment.brandId }],
            status: 'NEW'
          });
        });

        return discrepancies;
      }
    });

    // Impossible State Rule
    this.rules.set('impossible_states', {
      id: 'impossible_states',
      name: 'Impossible Transaction States',
      description: 'Transactions with impossible state combinations',
      category: 'IMPOSSIBLE_STATE',
      severity: 'CRITICAL',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for refunded payments that were never completed
        const impossibleRefunds = await prisma.payment.findMany({
          where: {
            status: 'REFUNDED',
            paidAt: { equals: null }
          },
          take: 100
        });

        impossibleRefunds.forEach(payment => {
          discrepancies.push({
            id: `impossible_refund_${payment.id}`,
            type: 'IMPOSSIBLE_STATE',
            severity: 'CRITICAL',
            title: 'Refunded Payment Never Completed',
            description: `Payment ${payment.id} is marked as refunded but was never completed`,
            entityType: 'payment',
            entityId: payment.id,
            relatedEntities: [],
            impactCents: Number(payment.amount) * 100,
            detectedAt: new Date(),
            confidence: 1.0,
            evidence: [{ status: payment.status, paidAt: payment.paidAt }],
            status: 'NEW'
          });
        });

        return discrepancies;
      }
    });

    // Amount Mismatch Rule
    this.rules.set('amount_mismatches', {
      id: 'amount_mismatches',
      name: 'Amount Mismatches',
      description: 'Transaction amounts that do not match related records',
      category: 'AMOUNT_MISMATCH',
      severity: 'HIGH',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for royalty statements where total earnings don't match sum of lines
        const statements = await prisma.royaltyStatement.findMany({
          include: {
            lines: true
          },
          take: 100
        });

        statements.forEach(statement => {
          const calculatedTotal = statement.lines.reduce((sum, line) => sum + line.calculatedRoyaltyCents, 0);
          
          if (Math.abs(calculatedTotal - statement.totalEarningsCents) > 100) { // More than $1 difference
            discrepancies.push({
              id: `amount_mismatch_${statement.id}`,
              type: 'AMOUNT_MISMATCH',
              severity: 'HIGH',
              title: 'Royalty Statement Amount Mismatch',
              description: `Statement ${statement.id} total (${statement.totalEarningsCents}) doesn't match sum of lines (${calculatedTotal})`,
              entityType: 'royalty_statement',
              entityId: statement.id,
              relatedEntities: statement.lines.map(line => ({ type: 'royalty_line', id: line.id })),
              impactCents: Math.abs(calculatedTotal - statement.totalEarningsCents),
              detectedAt: new Date(),
              confidence: 0.95,
              evidence: [{ 
                statementTotal: statement.totalEarningsCents, 
                calculatedTotal,
                lineCount: statement.lines.length 
              }],
              status: 'NEW'
            });
          }
        });

        return discrepancies;
      }
    });

    // Duplicate Transaction Rule
    this.rules.set('duplicate_transactions', {
      id: 'duplicate_transactions',
      name: 'Duplicate Transactions',
      description: 'Potential duplicate transactions that might indicate double-charging',
      category: 'DUPLICATE_TRANSACTION',
      severity: 'MEDIUM',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for duplicate payments (same brand, amount, within 1 hour)
        const recentPayments = await prisma.payment.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        const paymentGroups = new Map<string, any[]>();
        
        recentPayments.forEach(payment => {
          const key = `${payment.brandId}_${payment.amount}`;
          if (!paymentGroups.has(key)) {
            paymentGroups.set(key, []);
          }
          paymentGroups.get(key)!.push(payment);
        });

        paymentGroups.forEach((payments, key) => {
          if (payments.length > 1) {
            // Check if payments are within 1 hour of each other
            for (let i = 0; i < payments.length - 1; i++) {
              const timeDiff = Math.abs(payments[i].createdAt.getTime() - payments[i + 1].createdAt.getTime());
              if (timeDiff < 60 * 60 * 1000) { // Within 1 hour
                discrepancies.push({
                  id: `duplicate_payment_${payments[i].id}_${payments[i + 1].id}`,
                  type: 'DUPLICATE_TRANSACTION',
                  severity: 'MEDIUM',
                  title: 'Potential Duplicate Payment',
                  description: `Payments ${payments[i].id} and ${payments[i + 1].id} appear to be duplicates`,
                  entityType: 'payment',
                  entityId: payments[i].id,
                  relatedEntities: [{ type: 'payment', id: payments[i + 1].id }],
                  impactCents: Number(payments[i].amount) * 100,
                  detectedAt: new Date(),
                  confidence: 0.7,
                  evidence: [{ 
                    payments: payments.slice(0, 2).map(p => ({ 
                      id: p.id, 
                      amount: p.amount, 
                      createdAt: p.createdAt 
                    }))
                  }],
                  status: 'NEW'
                });
              }
            }
          }
        });

        return discrepancies;
      }
    });

    // Temporal Inconsistency Rule
    this.rules.set('temporal_inconsistencies', {
      id: 'temporal_inconsistencies',
      name: 'Temporal Inconsistencies',
      description: 'Events that occur out of logical sequence',
      category: 'TEMPORAL_INCONSISTENCY',
      severity: 'MEDIUM',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for payouts processed before their royalty statements
        const payouts = await prisma.payout.findMany({
          where: {
            royaltyStatementId: { not: null },
            processedAt: { not: null }
          },
          include: {
            royaltyStatement: true
          },
          take: 100
        });

        payouts.forEach(payout => {
          if (payout.royaltyStatement && payout.processedAt && 
              payout.processedAt < payout.royaltyStatement.createdAt) {
            discrepancies.push({
              id: `temporal_payout_${payout.id}`,
              type: 'TEMPORAL_INCONSISTENCY',
              severity: 'MEDIUM',
              title: 'Payout Processed Before Statement Creation',
              description: `Payout ${payout.id} was processed before its royalty statement was created`,
              entityType: 'payout',
              entityId: payout.id,
              relatedEntities: [{ type: 'royalty_statement', id: payout.royaltyStatement.id }],
              impactCents: payout.amountCents,
              detectedAt: new Date(),
              confidence: 0.8,
              evidence: [{ 
                payoutProcessedAt: payout.processedAt,
                statementCreatedAt: payout.royaltyStatement.createdAt 
              }],
              status: 'NEW'
            });
          }
        });

        return discrepancies;
      }
    });

    // Threshold Violation Rule
    this.rules.set('threshold_violations', {
      id: 'threshold_violations',
      name: 'Threshold Violations',
      description: 'Transactions that violate defined thresholds',
      category: 'THRESHOLD_VIOLATION',
      severity: 'MEDIUM',
      enabled: true,
      checkFunction: async (prisma) => {
        const discrepancies: DetectedDiscrepancy[] = [];
        
        // Check for large payments without proper approval (over $10,000)
        const largePayments = await prisma.payment.findMany({
          where: {
            amount: { gt: 10000 }, // $10,000+
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          take: 50
        });

        largePayments.forEach(payment => {
          // In a real implementation, check for approval records
          // For now, flag all large payments
          discrepancies.push({
            id: `large_payment_${payment.id}`,
            type: 'THRESHOLD_VIOLATION',
            severity: 'MEDIUM',
            title: 'Large Payment Without Approval Record',
            description: `Payment ${payment.id} for ${payment.amount} exceeds approval threshold`,
            entityType: 'payment',
            entityId: payment.id,
            relatedEntities: [],
            impactCents: Number(payment.amount) * 100,
            detectedAt: new Date(),
            confidence: 0.6,
            evidence: [{ amount: payment.amount, threshold: 10000 }],
            status: 'NEW'
          });
        });

        return discrepancies;
      }
    });
  }

  /**
   * Generate discrepancy breakdown by type
   */
  private generateDiscrepancyBreakdown(discrepancies: DetectedDiscrepancy[]) {
    const breakdown = new Map<string, {
      count: number;
      severity: DiscrepancySeverity;
      totalImpactCents: number;
    }>();

    discrepancies.forEach(discrepancy => {
      const key = discrepancy.type;
      if (!breakdown.has(key)) {
        breakdown.set(key, {
          count: 0,
          severity: discrepancy.severity,
          totalImpactCents: 0
        });
      }
      
      const entry = breakdown.get(key)!;
      entry.count++;
      entry.totalImpactCents += discrepancy.impactCents || 0;
      
      // Use highest severity if multiple discrepancies of same type
      if (this.getSeverityLevel(discrepancy.severity) > this.getSeverityLevel(entry.severity)) {
        entry.severity = discrepancy.severity;
      }
    });

    return Array.from(breakdown.entries()).map(([type, data]) => ({
      type,
      ...data
    }));
  }

  /**
   * Assess overall risk level
   */
  private assessOverallRisk(discrepancies: DetectedDiscrepancy[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const criticalCount = discrepancies.filter(d => d.severity === 'CRITICAL').length;
    const highCount = discrepancies.filter(d => d.severity === 'HIGH').length;
    const mediumCount = discrepancies.filter(d => d.severity === 'MEDIUM').length;

    if (criticalCount > 0) return 'CRITICAL';
    if (highCount > 5) return 'CRITICAL';
    if (highCount > 0) return 'HIGH';
    if (mediumCount > 10) return 'HIGH';
    if (mediumCount > 0) return 'MEDIUM';
    
    return 'LOW';
  }

  /**
   * Generate recommended actions
   */
  private generateRecommendedActions(discrepancies: DetectedDiscrepancy[]): string[] {
    const actions: string[] = [];
    
    const criticalCount = discrepancies.filter(d => d.severity === 'CRITICAL').length;
    const highCount = discrepancies.filter(d => d.severity === 'HIGH').length;

    if (criticalCount > 0) {
      actions.push(`Immediate investigation required for ${criticalCount} critical discrepancies`);
    }

    if (highCount > 0) {
      actions.push(`Investigate ${highCount} high-severity discrepancies within 24 hours`);
    }

    const orphanedCount = discrepancies.filter(d => d.type === 'ORPHANED_TRANSACTION').length;
    if (orphanedCount > 0) {
      actions.push(`Review and clean up ${orphanedCount} orphaned transaction references`);
    }

    const duplicateCount = discrepancies.filter(d => d.type === 'DUPLICATE_TRANSACTION').length;
    if (duplicateCount > 0) {
      actions.push(`Investigate ${duplicateCount} potential duplicate transactions for refund processing`);
    }

    if (actions.length === 0) {
      actions.push('No immediate actions required - continue monitoring');
    }

    return actions;
  }

  /**
   * Get numeric severity level for comparison
   */
  private getSeverityLevel(severity: DiscrepancySeverity): number {
    const levels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    return levels[severity] || 0;
  }

  /**
   * Store discrepancies for tracking
   */
  private async storeDiscrepancies(discrepancies: DetectedDiscrepancy[]) {
    // In a real implementation, you might store these in a dedicated discrepancies table
    // For now, log them as audit events
    for (const discrepancy of discrepancies) {
      await this.auditService.log({
        action: 'DISCREPANCY_DETECTED',
        entityType: discrepancy.entityType,
        entityId: discrepancy.entityId,
        after: {
          discrepancyId: discrepancy.id,
          type: discrepancy.type,
          severity: discrepancy.severity,
          title: discrepancy.title,
          description: discrepancy.description,
          impactCents: discrepancy.impactCents,
          confidence: discrepancy.confidence,
          evidence: discrepancy.evidence
        }
      });
    }
  }

  /**
   * Auto-assign discrepancies to investigators
   */
  private async autoAssignDiscrepancies(discrepancies: DetectedDiscrepancy[]) {
    // In a real implementation, implement assignment logic based on:
    // - Discrepancy type
    // - Severity
    // - Current workload
    // - User expertise
    
    // For now, just log the assignment intent
    const criticalDiscrepancies = discrepancies.filter(d => d.severity === 'CRITICAL');
    if (criticalDiscrepancies.length > 0) {
      await this.auditService.log({
        action: 'CRITICAL_DISCREPANCIES_DETECTED',
        entityType: 'discrepancy_alert',
        entityId: `alert_${Date.now()}`,
        after: {
          count: criticalDiscrepancies.length,
          discrepancies: criticalDiscrepancies.map(d => ({
            id: d.id,
            type: d.type,
            entityType: d.entityType,
            entityId: d.entityId
          }))
        }
      });
    }
  }

  /**
   * Add custom detection rule
   */
  addRule(rule: DiscrepancyRule) {
    this.rules.set(rule.id, rule);
  }

  /**
   * Get all available rules
   */
  getRules(): DiscrepancyRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }
}
