/**
 * Transaction Audit Trail Service
 * 
 * Builds comprehensive transaction audit trail reports that capture every significant 
 * event in the lifecycle of a transaction. This audit trail records transaction creation,
 * state changes, modifications, refunds, chargebacks, and administrative actions.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { 
  TransactionAuditTrailReport, 
  TransactionAuditEntry,
  FieldChange,
  BaseAuditConfig,
  AuditFilters
} from '../types';

export interface TransactionAuditTrailConfig extends BaseAuditConfig {
  includePayments?: boolean;
  includePayouts?: boolean;
  includeLicenses?: boolean;
  includeRoyalties?: boolean;
  includeRefunds?: boolean;
  riskLevelFilter?: string[];
}

export class TransactionAuditTrailService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  /**
   * Generate comprehensive transaction audit trail report
   */
  async generateAuditTrailReport(
    config: TransactionAuditTrailConfig
  ): Promise<TransactionAuditTrailReport> {
    try {
      const { startDate, endDate, filters = {} } = config;

      // Get all audit events for financial transactions
      const auditEvents = await this.getFinancialAuditEvents(startDate, endDate, filters);
      
      // Process audit events into structured audit entries
      const auditEntries = await this.processAuditEvents(auditEvents, config);
      
      // Generate summary metrics
      const summaryMetrics = this.calculateSummaryMetrics(auditEntries);
      
      // Generate breakdowns
      const actionBreakdown = this.generateActionBreakdown(auditEntries);
      const entityBreakdown = this.generateEntityBreakdown(auditEntries);

      const report: TransactionAuditTrailReport = {
        id: `audit_trail_${Date.now()}`,
        type: 'TRANSACTION_AUDIT_TRAIL',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        auditEntries,
        totalEntries: auditEntries.length,
        
        ...summaryMetrics,
        actionBreakdown,
        entityBreakdown
      };

      // Log the report generation
      await this.auditService.log({
        action: 'AUDIT_TRAIL_REPORT_GENERATED',
        entityType: 'audit_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          reportType: 'TRANSACTION_AUDIT_TRAIL',
          period: { startDate, endDate },
          entriesCount: auditEntries.length,
          summaryMetrics
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'AUDIT_TRAIL_REPORT_FAILED',
        entityType: 'audit_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate transaction audit trail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get financial audit events from the database
   */
  private async getFinancialAuditEvents(
    startDate: Date,
    endDate: Date,
    filters: AuditFilters
  ) {
    const financialEntityTypes = [
      'payment', 'payout', 'license', 'royalty_statement', 
      'royalty_run', 'refund', 'chargeback', 'adjustment'
    ];

    const financialActions = [
      'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED',
      'PAYOUT_CREATED', 'PAYOUT_PROCESSING', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED',
      'LICENSE_CREATED', 'LICENSE_UPDATED', 'LICENSE_ACTIVATED', 'LICENSE_TERMINATED',
      'ROYALTY_RUN_STARTED', 'ROYALTY_RUN_COMPLETED', 'ROYALTY_STATEMENT_GENERATED',
      'REFUND_PROCESSED', 'CHARGEBACK_RECEIVED', 'ADJUSTMENT_APPLIED'
    ];

    return await this.prisma.auditEvent.findMany({
      where: {
        timestamp: { gte: startDate, lte: endDate },
        AND: [
          // Filter by entity types if specified, otherwise use financial entity types
          filters.entityTypes?.length 
            ? { entityType: { in: filters.entityTypes } }
            : { entityType: { in: financialEntityTypes } },
          
          // Filter by actions if specified, otherwise use financial actions
          filters.transactionTypes?.length
            ? { action: { in: filters.transactionTypes } }
            : { action: { in: financialActions } },
          
          // User filter
          ...(filters.userIds?.length ? [{ userId: { in: filters.userIds } }] : []),
          
          // Entity ID filter
          ...(filters.entityIds?.length ? [{ entityId: { in: filters.entityIds } }] : [])
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            name: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });
  }

  /**
   * Process raw audit events into structured audit entries
   */
  private async processAuditEvents(
    auditEvents: any[],
    config: TransactionAuditTrailConfig
  ): Promise<TransactionAuditEntry[]> {
    const entries: TransactionAuditEntry[] = [];

    for (const event of auditEvents) {
      // Calculate field changes
      const changes = this.calculateFieldChanges(event.beforeJson, event.afterJson);
      
      // Calculate financial impact
      const amountImpact = this.calculateAmountImpact(event.beforeJson, event.afterJson);
      
      // Assess risk level
      const riskLevel = this.assessRiskLevel(event, changes, amountImpact);
      
      // Generate flags
      const flags = this.generateFlags(event, changes, amountImpact);

      const entry: TransactionAuditEntry = {
        id: event.id,
        timestamp: event.timestamp,
        
        // Actor information
        userId: event.userId,
        userEmail: event.user?.email,
        userRole: event.user?.role,
        
        // Transaction information
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        
        // Change tracking
        beforeState: event.beforeJson,
        afterState: event.afterJson,
        changes,
        
        // Context
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        requestId: event.requestId,
        
        // Financial impact
        amountImpact,
        
        // Risk assessment
        riskLevel,
        flags
      };

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Calculate field changes between before and after states
   */
  private calculateFieldChanges(beforeState: any, afterState: any): FieldChange[] {
    const changes: FieldChange[] = [];

    if (!beforeState && afterState) {
      // Creation - all fields are new
      Object.keys(afterState).forEach(key => {
        if (afterState[key] !== null && afterState[key] !== undefined) {
          changes.push({
            field: key,
            previousValue: null,
            newValue: afterState[key],
            type: 'CREATED'
          });
        }
      });
    } else if (beforeState && afterState) {
      // Update - compare fields
      const allKeys = new Set([...Object.keys(beforeState || {}), ...Object.keys(afterState || {})]);
      
      allKeys.forEach(key => {
        const oldValue = beforeState?.[key];
        const newValue = afterState?.[key];
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            field: key,
            previousValue: oldValue,
            newValue: newValue,
            type: 'UPDATED'
          });
        }
      });
    } else if (beforeState && !afterState) {
      // Deletion - all fields removed
      Object.keys(beforeState).forEach(key => {
        changes.push({
          field: key,
          previousValue: beforeState[key],
          newValue: null,
          type: 'DELETED'
        });
      });
    }

    return changes;
  }

  /**
   * Calculate financial amount impact
   */
  private calculateAmountImpact(beforeState: any, afterState: any) {
    // Look for amount fields in both states
    const amountFields = ['amountCents', 'feeCents', 'totalEarningsCents', 'netPayableCents', 'amount'];
    
    for (const field of amountFields) {
      const previousCents = beforeState?.[field] || 0;
      const newCents = afterState?.[field] || 0;
      
      if (previousCents !== newCents) {
        return {
          previousCents,
          newCents,
          deltaCents: newCents - previousCents
        };
      }
    }

    return undefined;
  }

  /**
   * Assess risk level based on the audit event
   */
  private assessRiskLevel(
    event: any,
    changes: FieldChange[],
    amountImpact?: any
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Critical risk indicators
    if (event.action.includes('FAILED') || event.action.includes('ERROR')) {
      return 'CRITICAL';
    }
    
    if (amountImpact && Math.abs(amountImpact.deltaCents) > 100000) { // $1000+
      return 'CRITICAL';
    }
    
    // High risk indicators
    if (event.action.includes('TERMINATED') || event.action.includes('DELETED')) {
      return 'HIGH';
    }
    
    if (amountImpact && Math.abs(amountImpact.deltaCents) > 10000) { // $100+
      return 'HIGH';
    }
    
    if (changes.some(c => c.field.includes('status') && c.newValue === 'FAILED')) {
      return 'HIGH';
    }
    
    // Medium risk indicators
    if (event.action.includes('UPDATED') && amountImpact) {
      return 'MEDIUM';
    }
    
    if (changes.length > 5) {
      return 'MEDIUM';
    }
    
    // Default to low risk
    return 'LOW';
  }

  /**
   * Generate flags for the audit entry
   */
  private generateFlags(
    event: any,
    changes: FieldChange[],
    amountImpact?: any
  ): string[] {
    const flags: string[] = [];

    // Financial flags
    if (amountImpact) {
      flags.push('FINANCIAL_IMPACT');
      if (Math.abs(amountImpact.deltaCents) > 50000) { // $500+
        flags.push('LARGE_AMOUNT');
      }
    }

    // Status change flags
    if (changes.some(c => c.field === 'status')) {
      flags.push('STATUS_CHANGE');
    }

    // Failure flags
    if (event.action.includes('FAILED') || event.action.includes('ERROR')) {
      flags.push('FAILURE');
    }

    // Administrative action flags
    if (event.action.includes('ADMIN') || event.user?.role === 'ADMIN') {
      flags.push('ADMIN_ACTION');
    }

    // Bulk operation flags
    if (changes.length > 10) {
      flags.push('BULK_OPERATION');
    }

    // Time-sensitive flags
    const eventTime = new Date(event.timestamp);
    const hour = eventTime.getHours();
    if (hour < 6 || hour > 22) { // Outside business hours
      flags.push('OFF_HOURS');
    }

    return flags;
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummaryMetrics(auditEntries: TransactionAuditEntry[]) {
    const uniqueUsers = new Set(auditEntries.map(e => e.userId).filter(Boolean)).size;
    const entitiesModified = new Set(auditEntries.map(e => `${e.entityType}:${e.entityId}`)).size;
    
    const totalAmountCents = auditEntries
      .filter(e => e.amountImpact)
      .reduce((sum, e) => sum + Math.abs(e.amountImpact!.deltaCents), 0);

    return {
      transactionCount: auditEntries.length,
      totalAmountCents,
      uniqueUsers,
      entitiesModified
    };
  }

  /**
   * Generate action breakdown
   */
  private generateActionBreakdown(auditEntries: TransactionAuditEntry[]) {
    const actionCounts = new Map<string, number>();
    
    auditEntries.forEach(entry => {
      const count = actionCounts.get(entry.action) || 0;
      actionCounts.set(entry.action, count + 1);
    });

    const total = auditEntries.length;
    
    return Array.from(actionCounts.entries())
      .map(([action, count]) => ({
        action,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate entity breakdown
   */
  private generateEntityBreakdown(auditEntries: TransactionAuditEntry[]) {
    const entityCounts = new Map<string, number>();
    
    auditEntries.forEach(entry => {
      const count = entityCounts.get(entry.entityType) || 0;
      entityCounts.set(entry.entityType, count + 1);
    });

    const total = auditEntries.length;
    
    return Array.from(entityCounts.entries())
      .map(([entityType, count]) => ({
        entityType,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get audit trail for a specific transaction
   */
  async getTransactionAuditTrail(
    entityType: string,
    entityId: string
  ): Promise<TransactionAuditEntry[]> {
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: {
        entityType,
        entityId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    return this.processAuditEvents(auditEvents, {
      startDate: new Date(0),
      endDate: new Date(),
      includeDetails: true
    });
  }
}
