/**
 * Audit & Reconciliation Module Services
 * 
 * Centralized exports for all audit and reconciliation services
 */

// Service exports
export { TransactionAuditTrailService } from './services/transaction-audit-trail.service';
export { StripeReconciliationService } from './services/stripe-reconciliation.service';
export { BankStatementReconciliationService } from './services/bank-reconciliation.service';
export { DiscrepancyDetectionService } from './services/discrepancy-detection.service';
export { FailedTransactionReportsService } from './services/failed-transaction-reports.service';
export { RefundChargebackReportsService } from './services/refund-chargeback-reports.service';
export { FinancialAuditLogsService } from './services/financial-audit-logs.service';

// Type exports
export * from './types';

// Service configurations
export interface AuditReconciliationServices {
  transactionAuditTrail: TransactionAuditTrailService;
  stripeReconciliation: StripeReconciliationService;
  bankReconciliation: BankStatementReconciliationService;
  discrepancyDetection: DiscrepancyDetectionService;
  failedTransactionReports: FailedTransactionReportsService;
  refundChargebackReports: RefundChargebackReportsService;
  financialAuditLogs: FinancialAuditLogsService;
}

/**
 * Factory function to create all audit & reconciliation services
 */
export function createAuditReconciliationServices(
  prismaClient: any,
  auditService: any,
  stripeSecretKey?: string
): AuditReconciliationServices {
  return {
    transactionAuditTrail: new TransactionAuditTrailService(prismaClient, auditService),
    stripeReconciliation: new StripeReconciliationService(prismaClient, auditService, stripeSecretKey || ''),
    bankReconciliation: new BankStatementReconciliationService(prismaClient, auditService),
    discrepancyDetection: new DiscrepancyDetectionService(prismaClient, auditService),
    failedTransactionReports: new FailedTransactionReportsService(prismaClient, auditService),
    refundChargebackReports: new RefundChargebackReportsService(prismaClient, auditService, stripeSecretKey || ''),
    financialAuditLogs: new FinancialAuditLogsService(prismaClient, auditService)
  };
}

// Re-export service classes for direct import
import { TransactionAuditTrailService } from './services/transaction-audit-trail.service';
import { StripeReconciliationService } from './services/stripe-reconciliation.service';
import { BankStatementReconciliationService } from './services/bank-reconciliation.service';
import { DiscrepancyDetectionService } from './services/discrepancy-detection.service';
import { FailedTransactionReportsService } from './services/failed-transaction-reports.service';
import { RefundChargebackReportsService } from './services/refund-chargeback-reports.service';
import { FinancialAuditLogsService } from './services/financial-audit-logs.service';
