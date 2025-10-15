/**
 * Reports Module - Central Export Point
 * 
 * Comprehensive reporting system for YesGoddess platform
 */

// Core Services (implemented)
export { FinancialReportingService } from './services/financial-reporting.service';

// Additional Services (to be implemented)
// export { RevenueReconciliationService } from './services/revenue-reconciliation.service';
// export { TransactionLedgerService } from './services/transaction-ledger.service';
// export { PlatformFeeReportingService } from './services/platform-fee-reporting.service';
// export { CreatorEarningsReportingService } from './services/creator-earnings-reporting.service';
// export { BrandSpendAnalysisService } from './services/brand-spend-analysis.service';
// export { ComparisonReportingService } from './services/comparison-reporting.service';

// Infrastructure Services (to be implemented)
// export { ReportExportService } from './services/report-export.service';
// export { ReportTemplateService } from './services/report-template.service';
// export { ScheduledReportsService } from './services/scheduled-reports.service';

// API Layer
export { reportsRouter } from './router';

// Type Definitions
// export type * from './types';

// Error Classes
export * from './errors/report.errors';

// Validation Schemas
export * from './schemas/report.schema';

// Utilities (to be implemented)
// export * from './utils/report.utils';
// export * from './utils/export.utils';
// export * from './utils/financial.utils';
