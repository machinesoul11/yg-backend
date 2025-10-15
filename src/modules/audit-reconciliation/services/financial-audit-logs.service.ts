/**
 * Financial Audit Logs Service
 * 
 * Enhanced financial audit logging system that extends the existing AuditService
 * with specialized financial compliance tracking, regulatory reporting,
 * and comprehensive audit trail management for financial operations.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { 
  FinancialAuditLogsReport,
  FinancialAuditLog,
  AuditEventType,
  ComplianceLevel,
  RiskLevel,
  BaseAuditConfig
} from '../types';

export interface FinancialAuditConfig extends BaseAuditConfig {
  includeSystemEvents?: boolean;
  includeAPIEvents?: boolean;
  minRiskLevel?: RiskLevel;
  complianceLevelsFilter?: ComplianceLevel[];
  regulatoryOnly?: boolean;
}

export class FinancialAuditLogsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  /**
   * Generate comprehensive financial audit logs report
   */
  async generateFinancialAuditLogsReport(
    config: FinancialAuditConfig
  ): Promise<FinancialAuditLogsReport> {
    try {
      const { startDate, endDate } = config;

      // Get financial audit logs with enhanced analysis
      const auditLogs = await this.getFinancialAuditLogs(startDate, endDate, config);
      
      // Generate analysis
      const eventBreakdown = this.generateEventBreakdown(auditLogs);
      const riskBreakdown = this.generateRiskBreakdown(auditLogs);
      const complianceBreakdown = this.generateComplianceBreakdown(auditLogs);
      const dailyActivity = await this.generateDailyActivity(startDate, endDate);

      // Calculate metrics
      const totalComplianceEvents = auditLogs.filter(log => log.complianceLevel !== 'LOW').length;
      const highRiskEvents = auditLogs.filter(log => ['HIGH', 'CRITICAL'].includes(log.riskLevel)).length;
      const regulatoryFlaggedEvents = auditLogs.filter(log => log.regulatoryFlags.length > 0).length;

      const report: FinancialAuditLogsReport = {
        id: `financial_audit_logs_${Date.now()}`,
        type: 'FINANCIAL_AUDIT_LOGS',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        auditLogs,
        eventBreakdown,
        riskBreakdown,
        complianceBreakdown,
        
        // Compliance metrics
        totalComplianceEvents,
        highRiskEvents,
        regulatoryFlaggedEvents,
        
        // Time-based analysis
        dailyActivity
      };

      // Log the report generation
      await this.auditService.log({
        action: 'FINANCIAL_AUDIT_LOGS_REPORT_GENERATED',
        entityType: 'financial_audit_logs_report',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          period: { startDate, endDate },
          totalLogs: auditLogs.length,
          highRiskEvents,
          complianceEvents: totalComplianceEvents
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'FINANCIAL_AUDIT_LOGS_REPORT_FAILED',
        entityType: 'financial_audit_logs_report',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate financial audit logs report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get financial audit logs with enhanced financial context
   */
  private async getFinancialAuditLogs(
    startDate: Date,
    endDate: Date,
    config: FinancialAuditConfig
  ): Promise<FinancialAuditLog[]> {
    const auditLogs: FinancialAuditLog[] = [];

    // Define financial entity types and actions
    const financialEntityTypes = [
      'payment', 'payout', 'license', 'royalty_statement', 
      'brand', 'creator', 'financial_report'
    ];

    const financialActions = [
      'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED',
      'PAYOUT_CREATED', 'PAYOUT_UPDATED', 'PAYOUT_FAILED', 'PAYOUT_COMPLETED',
      'ROYALTY_CALCULATED', 'ROYALTY_PAID', 'LICENSE_CREATED', 'LICENSE_UPDATED',
      'FINANCIAL_ADJUSTMENT', 'ACCOUNT_BALANCE_UPDATED', 'STRIPE_WEBHOOK_RECEIVED'
    ];

    // Get audit events from the database
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: {
        timestamp: { gte: startDate, lte: endDate },
        OR: [
          { entityType: { in: financialEntityTypes } },
          { action: { in: financialActions } }
        ]
      },
      orderBy: { timestamp: 'desc' },
      take: 10000 // Limit to prevent memory issues
    });

    // Process each audit event into a financial audit log
    for (const event of auditEvents) {
      const beforeState = event.beforeJson ? (event.beforeJson as any) : null;
      const afterState = event.afterJson ? (event.afterJson as any) : null;

      // Determine event type
      const eventType = this.categorizeEventType(event.action, event.entityType);
      
      // Skip if filtered out by config
      if (!this.shouldIncludeEvent(eventType, config)) continue;

      // Extract financial context
      const financialContext = this.extractFinancialContext(event, beforeState, afterState);
      
      // Assess risk and compliance
      const riskAssessment = this.assessRiskLevel(event, beforeState, afterState);
      const complianceAssessment = this.assessComplianceLevel(event, beforeState, afterState);
      const regulatoryFlags = this.identifyRegulatoryFlags(event, beforeState, afterState);

      // Filter by risk level if specified
      if (config.minRiskLevel && !this.meetsMinRiskLevel(riskAssessment.level, config.minRiskLevel)) {
        continue;
      }

      // Filter by compliance levels if specified
      if (config.complianceLevelsFilter && !config.complianceLevelsFilter.includes(complianceAssessment.level)) {
        continue;
      }

      // Filter for regulatory only if specified
      if (config.regulatoryOnly && regulatoryFlags.length === 0) {
        continue;
      }

      const auditLog: FinancialAuditLog = {
        id: event.id,
        timestamp: event.timestamp,
        eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        userId: event.userId || undefined,
        userEmail: '', // Would need to lookup user
        
        // Financial context
        amountCents: financialContext.amountCents,
        currency: financialContext.currency,
        transactionId: financialContext.transactionId,
        
        // Audit details
        action: event.action,
        beforeState,
        afterState,
        
        // Compliance
        complianceLevel: complianceAssessment.level,
        regulatoryFlags,
        
        // Context
        ipAddress: afterState?.ipAddress,
        userAgent: afterState?.userAgent,
        systemContext: afterState || {},
        
        // Impact assessment
        riskLevel: riskAssessment.level,
        impactAssessment: riskAssessment.reasoning
      };

      auditLogs.push(auditLog);
    }

    return auditLogs;
  }

  /**
   * Categorize audit event type
   */
  private categorizeEventType(action: string, entityType: string): AuditEventType {
    // Map actions to event types
    if (action.includes('PAYMENT')) {
      if (action.includes('CREATED')) return 'PAYMENT_CREATED';
      if (action.includes('UPDATED')) return 'PAYMENT_UPDATED';
      if (action.includes('FAILED')) return 'PAYMENT_FAILED';
    }
    
    if (action.includes('REFUND')) return 'REFUND_ISSUED';
    if (action.includes('CHARGEBACK')) return 'CHARGEBACK_RECEIVED';
    
    if (action.includes('PAYOUT')) {
      if (action.includes('CREATED')) return 'PAYOUT_CREATED';
      if (action.includes('FAILED')) return 'PAYOUT_FAILED';
    }
    
    if (action.includes('WEBHOOK')) return 'WEBHOOK_RECEIVED';
    if (action.includes('API')) return 'API_CALL';
    if (action.includes('SYSTEM')) return 'SYSTEM_ACTION';
    
    return 'USER_ACTION';
  }

  /**
   * Check if event should be included based on config
   */
  private shouldIncludeEvent(eventType: AuditEventType, config: FinancialAuditConfig): boolean {
    if (!config.includeSystemEvents && eventType === 'SYSTEM_ACTION') return false;
    if (!config.includeAPIEvents && eventType === 'API_CALL') return false;
    return true;
  }

  /**
   * Extract financial context from audit event
   */
  private extractFinancialContext(event: any, beforeState: any, afterState: any) {
    let amountCents: number | undefined;
    let currency: string | undefined;
    let transactionId: string | undefined;

    // Extract from different entity types
    if (event.entityType === 'payment') {
      amountCents = afterState?.amount ? Number(afterState.amount) * 100 : undefined;
      currency = afterState?.currency;
      transactionId = event.entityId;
    } else if (event.entityType === 'payout') {
      amountCents = afterState?.amountCents;
      currency = 'USD'; // Default for payouts
      transactionId = event.entityId;
    } else if (afterState?.amountCents) {
      amountCents = afterState.amountCents;
      currency = afterState.currency || 'USD';
    }

    return { amountCents, currency, transactionId };
  }

  /**
   * Assess risk level for the audit event
   */
  private assessRiskLevel(event: any, beforeState: any, afterState: any): { level: RiskLevel; reasoning: string } {
    let riskScore = 0;
    const reasons: string[] = [];

    // High-value transactions
    const amount = afterState?.amountCents || (afterState?.amount ? Number(afterState.amount) * 100 : 0);
    if (amount > 100000) { // > $1000
      riskScore += 2;
      reasons.push('High-value transaction');
    }

    // Failed operations
    if (event.action.includes('FAILED')) {
      riskScore += 3;
      reasons.push('Failed operation');
    }

    // Manual overrides or adjustments
    if (event.action.includes('OVERRIDE') || event.action.includes('ADJUSTMENT')) {
      riskScore += 2;
      reasons.push('Manual override/adjustment');
    }

    // System errors
    if (afterState?.error || afterState?.errorCode) {
      riskScore += 2;
      reasons.push('System error present');
    }

    // Multiple retry attempts
    if (afterState?.retryCount && afterState.retryCount > 2) {
      riskScore += 1;
      reasons.push('Multiple retry attempts');
    }

    // Determine risk level
    let level: RiskLevel;
    if (riskScore >= 5) level = 'CRITICAL';
    else if (riskScore >= 3) level = 'HIGH';
    else if (riskScore >= 1) level = 'MEDIUM';
    else level = 'LOW';

    return {
      level,
      reasoning: reasons.length > 0 ? reasons.join(', ') : 'Standard operation'
    };
  }

  /**
   * Assess compliance level for the audit event
   */
  private assessComplianceLevel(event: any, beforeState: any, afterState: any): { level: ComplianceLevel } {
    // High-value transactions require higher compliance
    const amount = afterState?.amountCents || (afterState?.amount ? Number(afterState.amount) * 100 : 0);
    if (amount > 300000) return { level: 'REGULATORY' }; // > $3000

    // Financial adjustments and overrides
    if (event.action.includes('ADJUSTMENT') || event.action.includes('OVERRIDE')) {
      return { level: 'HIGH' };
    }

    // Payment and payout operations
    if (event.entityType === 'payment' || event.entityType === 'payout') {
      return { level: 'MEDIUM' };
    }

    return { level: 'LOW' };
  }

  /**
   * Identify regulatory flags for the audit event
   */
  private identifyRegulatoryFlags(event: any, beforeState: any, afterState: any): string[] {
    const flags: string[] = [];

    // Large transaction reporting
    const amount = afterState?.amountCents || (afterState?.amount ? Number(afterState.amount) * 100 : 0);
    if (amount > 1000000) flags.push('LARGE_TRANSACTION'); // > $10,000

    // Suspicious patterns
    if (afterState?.suspiciousActivity) flags.push('SUSPICIOUS_ACTIVITY');
    if (afterState?.fraudIndicator) flags.push('FRAUD_INDICATOR');

    // International transactions
    if (afterState?.country && afterState.country !== 'US') {
      flags.push('INTERNATIONAL_TRANSACTION');
    }

    // Manual interventions
    if (event.action.includes('MANUAL') || event.action.includes('OVERRIDE')) {
      flags.push('MANUAL_INTERVENTION');
    }

    // Failed anti-fraud checks
    if (afterState?.fraudCheck === 'FAILED' || afterState?.riskScore > 80) {
      flags.push('FRAUD_CHECK_FAILED');
    }

    return flags;
  }

  /**
   * Check if risk level meets minimum threshold
   */
  private meetsMinRiskLevel(currentLevel: RiskLevel, minLevel: RiskLevel): boolean {
    const riskOrder: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const currentIndex = riskOrder.indexOf(currentLevel);
    const minIndex = riskOrder.indexOf(minLevel);
    return currentIndex >= minIndex;
  }

  /**
   * Generate event breakdown by type
   */
  private generateEventBreakdown(auditLogs: FinancialAuditLog[]) {
    const eventMap = new Map<AuditEventType, number>();
    
    auditLogs.forEach(log => {
      const count = eventMap.get(log.eventType) || 0;
      eventMap.set(log.eventType, count + 1);
    });

    const total = auditLogs.length;
    return Array.from(eventMap.entries())
      .map(([eventType, count]) => ({
        eventType,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate risk breakdown
   */
  private generateRiskBreakdown(auditLogs: FinancialAuditLog[]) {
    const riskMap = new Map<RiskLevel, number>();
    
    auditLogs.forEach(log => {
      const count = riskMap.get(log.riskLevel) || 0;
      riskMap.set(log.riskLevel, count + 1);
    });

    const total = auditLogs.length;
    return Array.from(riskMap.entries())
      .map(([riskLevel, count]) => ({
        riskLevel,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate compliance breakdown
   */
  private generateComplianceBreakdown(auditLogs: FinancialAuditLog[]) {
    const complianceMap = new Map<ComplianceLevel, number>();
    
    auditLogs.forEach(log => {
      const count = complianceMap.get(log.complianceLevel) || 0;
      complianceMap.set(log.complianceLevel, count + 1);
    });

    const total = auditLogs.length;
    return Array.from(complianceMap.entries())
      .map(([level, count]) => ({
        level,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate daily activity analysis
   */
  private async generateDailyActivity(startDate: Date, endDate: Date) {
    const dailyActivity = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Count events for this day
      const dayEvents = await this.prisma.auditEvent.count({
        where: {
          timestamp: { gte: dayStart, lte: dayEnd },
          entityType: { in: ['payment', 'payout', 'license', 'royalty_statement'] }
        }
      });

      // Count high-risk events (would need to analyze each event)
      const highRiskCount = await this.prisma.auditEvent.count({
        where: {
          timestamp: { gte: dayStart, lte: dayEnd },
          action: { contains: 'FAILED' }
        }
      });

      // Count compliance events (financial operations)
      const complianceEvents = await this.prisma.auditEvent.count({
        where: {
          timestamp: { gte: dayStart, lte: dayEnd },
          entityType: { in: ['payment', 'payout'] }
        }
      });

      dailyActivity.push({
        date: new Date(currentDate),
        eventCount: dayEvents,
        highRiskCount,
        complianceEvents
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyActivity;
  }

  /**
   * Create a compliance report for regulatory purposes
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    requestedBy: string
  ) {
    const config: FinancialAuditConfig = {
      startDate,
      endDate,
      requestedBy,
      regulatoryOnly: true,
      minRiskLevel: 'MEDIUM',
      complianceLevelsFilter: ['HIGH', 'REGULATORY']
    };

    const report = await this.generateFinancialAuditLogsReport(config);
    
    // Add regulatory-specific summary
    const regulatorySummary = {
      totalEvents: report.auditLogs.length,
      highValueTransactions: report.auditLogs.filter(log => 
        log.amountCents && log.amountCents > 1000000).length,
      suspiciousActivities: report.auditLogs.filter(log => 
        log.regulatoryFlags.includes('SUSPICIOUS_ACTIVITY')).length,
      manualInterventions: report.auditLogs.filter(log => 
        log.regulatoryFlags.includes('MANUAL_INTERVENTION')).length,
      internationalTransactions: report.auditLogs.filter(log => 
        log.regulatoryFlags.includes('INTERNATIONAL_TRANSACTION')).length
    };

    return {
      ...report,
      regulatorySummary
    };
  }

  /**
   * Search audit logs by specific criteria
   */
  async searchAuditLogs(
    criteria: {
      entityId?: string;
      userId?: string;
      action?: string;
      minAmountCents?: number;
      riskLevel?: RiskLevel;
      startDate: Date;
      endDate: Date;
    }
  ) {
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: {
        timestamp: { gte: criteria.startDate, lte: criteria.endDate },
        ...(criteria.entityId && { entityId: criteria.entityId }),
        ...(criteria.userId && { userId: criteria.userId }),
        ...(criteria.action && { action: { contains: criteria.action } })
      },
      orderBy: { timestamp: 'desc' },
      take: 1000
    });

    // Process into financial audit logs and filter
    const config: FinancialAuditConfig = {
      startDate: criteria.startDate,
      endDate: criteria.endDate,
      ...(criteria.riskLevel && { minRiskLevel: criteria.riskLevel })
    };

    const logs = await this.getFinancialAuditLogs(criteria.startDate, criteria.endDate, config);
    
    // Additional filtering
    return logs.filter(log => {
      if (criteria.minAmountCents && (!log.amountCents || log.amountCents < criteria.minAmountCents)) {
        return false;
      }
      return true;
    });
  }
}
