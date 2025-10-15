/**
 * Tax Compliance Module
 * Main entry point for tax compliance functionality
 */

// Export main router
export { taxComplianceRouter } from './router';

// Export services
export { TaxDocumentService } from './services/tax-document.service';
export { PaymentThresholdService } from './services/payment-threshold.service';
export { TaxFormPDFGenerator } from './services/tax-form-pdf-generator.service';
export { TaxFormJobService } from './services/tax-form-job.service';

// Export background workers
export {
  taxFormWorker,
  taxDocumentGenerationWorker,
  thresholdNotificationWorker,
  workers,
  queueTaxFormJob,
  queueTaxDocumentGeneration,
  queueThresholdNotification,
  setupScheduledTaxJobs,
  shutdownTaxWorkers,
} from './workers';

// Export types
export type {
  TaxDocumentType,
  TaxFilingStatus,
  TaxWithholdingType,
  Form1099Data,
  PayerInfo,
  RecipientInfo,
  Form1099NECData,
  Form1099MISCData,
  W8BENData,
  W8BENEData,
  ThresholdStatus,
  TaxJurisdictionData,
  VATReportData,
  GSTReportData,
  AnnualTaxSummaryData,
  TaxComplianceValidation,
} from './types';

// Export validation schemas
export {
  createTaxDocumentSchema,
  updateTaxDocumentSchema,
  getTaxDocumentsSchema,
  generateTaxDocumentSchema,
  createPaymentThresholdSchema,
  updatePaymentThresholdSchema,
  getPaymentThresholdsSchema,
  checkThresholdStatusSchema,
  createTaxFormJobSchema,
  updateTaxFormJobSchema,
  getTaxFormJobsSchema,
  generateVATReportSchema,
  generateGSTReportSchema,
  validateCreatorTaxComplianceSchema,
  getCreatorTaxComplianceStatusSchema,
  generateTaxReportSchema,
} from './schemas';
