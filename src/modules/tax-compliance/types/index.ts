/**
 * Tax & Compliance Types
 * Type definitions for tax reporting and compliance functionality
 */

// ============================================================================
// Enums (matching Prisma schema)
// ============================================================================

export enum TaxDocumentType {
  FORM_1099_NEC = 'FORM_1099_NEC',
  FORM_1099_MISC = 'FORM_1099_MISC',
  W8_BEN = 'W8_BEN',
  W8_BEN_E = 'W8_BEN_E',
  W9 = 'W9',
  FORM_1042_S = 'FORM_1042_S',
  VAT_SUMMARY = 'VAT_SUMMARY',
  GST_SUMMARY = 'GST_SUMMARY'
}

export enum TaxFilingStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  DELIVERED = 'DELIVERED',
  FILED = 'FILED',
  CORRECTED = 'CORRECTED',
  VOIDED = 'VOIDED'
}

export enum TaxWithholdingType {
  BACKUP_WITHHOLDING = 'BACKUP_WITHHOLDING',
  INTERNATIONAL_TREATY = 'INTERNATIONAL_TREATY',
  STATE_TAX = 'STATE_TAX',
  LOCAL_TAX = 'LOCAL_TAX'
}

// ============================================================================
// Core Tax Document Types
// ============================================================================

export interface TaxDocumentData {
  id: string;
  creatorId: string;
  taxYear: number;
  documentType: TaxDocumentType;
  totalAmountCents: number;
  withholdingCents: number;
  filingStatus: TaxFilingStatus;
  pdfStorageKey?: string;
  pdfGeneratedAt?: Date;
  filedAt?: Date;
  correctionOf?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxDocumentInput {
  creatorId: string;
  taxYear: number;
  documentType: TaxDocumentType;
  totalAmountCents: number;
  withholdingCents?: number;
  metadata?: Record<string, any>;
}

export interface UpdateTaxDocumentInput {
  id: string;
  totalAmountCents?: number;
  withholdingCents?: number;
  filingStatus?: TaxFilingStatus;
  pdfStorageKey?: string;
  pdfGeneratedAt?: Date;
  filedAt?: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Form 1099 Specific Types
// ============================================================================

export interface Form1099Data {
  // Payer Information (Platform)
  payerName: string;
  payerAddress: string;
  payerTIN: string; // Tax Identification Number
  
  // Recipient Information (Creator)
  recipientName: string;
  recipientAddress: string;
  recipientTIN: string;
  recipientAccountNumber?: string;
  
  // Payment Information
  taxYear: number;
  totalAmountCents: number;
  federalTaxWithheldCents: number;
  
  // Form 1099-NEC Specific
  nonEmployeeCompensationCents: number;
  
  // Form 1099-MISC Specific (if needed)
  miscellaneousIncomeCents?: number;
  
  // Additional Details
  stateTaxWithheldCents?: number;
  statePayerTIN?: string;
  stateIncomeCents?: number;
}

// ============================================================================
// Payment Threshold Types
// ============================================================================

export interface PaymentThresholdData {
  id: string;
  creatorId: string;
  taxYear: number;
  jurisdiction: string;
  totalPaymentsCents: number;
  thresholdAmountCents: number;
  thresholdMet: boolean;
  thresholdMetAt?: Date;
  lastUpdated: Date;
  metadata: Record<string, any>;
}

export interface CreatePaymentThresholdInput {
  creatorId: string;
  taxYear: number;
  jurisdiction?: string;
  thresholdAmountCents: number;
}

export interface UpdatePaymentThresholdInput {
  id: string;
  totalPaymentsCents?: number;
  thresholdMet?: boolean;
  thresholdMetAt?: Date;
}

export interface ThresholdStatus {
  creatorId: string;
  taxYear: number;
  jurisdiction: string;
  currentAmountCents: number;
  thresholdAmountCents: number;
  remainingCents: number;
  percentageReached: number;
  thresholdMet: boolean;
  daysUntilYearEnd: number;
  projectedTotal?: number;
}

// ============================================================================
// Tax Withholding Types
// ============================================================================

export interface TaxWithholdingData {
  id: string;
  creatorId: string;
  withholdingType: TaxWithholdingType;
  percentageRate: number; // Decimal representation (e.g., 0.24 for 24%)
  effectiveStartDate: Date;
  effectiveEndDate?: Date;
  supportingDocumentKey?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  createdBy: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxWithholdingInput {
  creatorId: string;
  withholdingType: TaxWithholdingType;
  percentageRate: number;
  effectiveStartDate: Date;
  effectiveEndDate?: Date;
  supportingDocumentKey?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTaxWithholdingInput {
  id: string;
  percentageRate?: number;
  effectiveEndDate?: Date;
  status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  metadata?: Record<string, any>;
}

// ============================================================================
// Tax Jurisdiction Types
// ============================================================================

export interface TaxJurisdictionData {
  id: string;
  creatorId: string;
  countryCode: string;
  stateProvince?: string;
  taxTreatyStatus?: string;
  applicableRate?: number;
  reportingRequirements: Record<string, any>;
  documentationType?: string;
  documentationExpiry?: Date;
  isPrimary: boolean;
  effectiveDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxJurisdictionInput {
  creatorId: string;
  countryCode: string;
  stateProvince?: string;
  taxTreatyStatus?: string;
  applicableRate?: number;
  reportingRequirements?: Record<string, any>;
  documentationType?: string;
  documentationExpiry?: Date;
  isPrimary?: boolean;
}

export interface UpdateTaxJurisdictionInput {
  id: string;
  taxTreatyStatus?: string;
  applicableRate?: number;
  reportingRequirements?: Record<string, any>;
  documentationType?: string;
  documentationExpiry?: Date;
  isPrimary?: boolean;
}

// ============================================================================
// Annual Tax Summary Types
// ============================================================================

export interface AnnualTaxSummaryData {
  id: string;
  creatorId: string;
  taxYear: number;
  totalGrossPaymentsCents: number;
  totalWithheldCents: number;
  paymentCount: number;
  formsRequired: string[]; // Array of required form types
  formsGenerated: string[]; // Array of generated form types
  summaryPdfKey?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAnnualTaxSummaryInput {
  creatorId: string;
  taxYear: number;
  totalGrossPaymentsCents: number;
  totalWithheldCents?: number;
  paymentCount: number;
  formsRequired: string[];
}

export interface UpdateAnnualTaxSummaryInput {
  id: string;
  totalGrossPaymentsCents?: number;
  totalWithheldCents?: number;
  paymentCount?: number;
  formsRequired?: string[];
  formsGenerated?: string[];
  summaryPdfKey?: string;
  generatedAt?: Date;
}

// ============================================================================
// Tax Form Generation Types
// ============================================================================

export interface TaxFormGenerationResult {
  documentId: string;
  pdfBuffer: Buffer;
  storageKey: string;
  metadata: {
    formType: TaxDocumentType;
    taxYear: number;
    generatedAt: Date;
    fileSize: number;
    recipientInfo: {
      name: string;
      email?: string;
    };
  };
}

export interface TaxFormJobData {
  id: string;
  taxYear: number;
  jobType: 'YEAR_END_GENERATION' | 'THRESHOLD_CHECK' | 'RENEWAL_REMINDER' | 'CORRECTION_BATCH';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalCreators: number;
  processedCreators: number;
  failedCreators: number;
  errorDetails: Array<{
    creatorId: string;
    error: string;
    timestamp: Date;
  }>;
  startedAt?: Date;
  completedAt?: Date;
  createdBy?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxFormJobInput {
  taxYear: number;
  jobType: 'YEAR_END_GENERATION' | 'THRESHOLD_CHECK' | 'RENEWAL_REMINDER' | 'CORRECTION_BATCH';
  totalCreators?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// VAT/GST Reporting Types
// ============================================================================

export interface VATReportData {
  taxYear: number;
  quarter?: number; // For quarterly reports
  jurisdiction: string;
  totalSalesCents: number;
  totalVATCents: number;
  platformVATCents: number;
  creatorVATCents: number;
  exemptSalesCents: number;
  breakdown: Array<{
    creatorId: string;
    salesCents: number;
    vatCents: number;
    vatRate: number;
  }>;
}

export interface GSTReportData {
  taxYear: number;
  quarter?: number;
  jurisdiction: string;
  totalSalesCents: number;
  totalGSTCents: number;
  inputTaxCreditsCents: number;
  netGSTCents: number;
  breakdown: Array<{
    transactionId: string;
    salesCents: number;
    gstCents: number;
    gstRate: number;
  }>;
}

// ============================================================================
// International Tax Documentation Types
// ============================================================================

export interface W8BENData {
  // Individual Foreign Person
  individualName: string;
  countryOfTaxResidence: string;
  permanentResidenceAddress: string;
  mailingAddress?: string;
  foreignTIN?: string;
  foreignTINCountry?: string;
  claimTreatyBenefits: boolean;
  treatyCountry?: string;
  treatyArticle?: string;
  treatyRate?: number;
  certificationDate: Date;
  capacityActing?: string;
}

export interface W8BENEData {
  // Entity Foreign Person
  organizationName: string;
  countryOfIncorporation: string;
  businessAddress: string;
  mailingAddress?: string;
  entityType: string;
  claimTreatyBenefits: boolean;
  treatyCountry?: string;
  treatyProvisions?: string;
  certificationDate: Date;
}

// ============================================================================
// Tax Compliance Validation Types
// ============================================================================

export interface TaxValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiredDocuments: string[];
  recommendedActions: string[];
}

export interface CreatorTaxComplianceStatus {
  creatorId: string;
  currentTaxYear: number;
  jurisdiction: string;
  hasValidDocumentation: boolean;
  documentationExpiry?: Date;
  requiresFormGeneration: boolean;
  requiredForms: TaxDocumentType[];
  totalPaymentsCurrentYear: number;
  thresholdStatus: ThresholdStatus;
  withholdingApplied: boolean;
  complianceScore: number; // 0-100
  lastUpdated: Date;
}

// ============================================================================
// Tax Audit Trail Types
// ============================================================================

export interface TaxAuditEntry {
  id: string;
  action: 'DOCUMENT_GENERATED' | 'DOCUMENT_CORRECTED' | 'THRESHOLD_MET' | 'WITHHOLDING_APPLIED' | 'FORM_FILED';
  entityType: 'TAX_DOCUMENT' | 'PAYMENT_THRESHOLD' | 'WITHHOLDING' | 'JURISDICTION';
  entityId: string;
  performedBy: string;
  timestamp: Date;
  details: Record<string, any>;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

// ============================================================================
// Export Configuration Types
// ============================================================================

export interface TaxReportExportOptions {
  format: 'PDF' | 'CSV' | 'EXCEL' | 'XML';
  includeMetadata: boolean;
  includeSummary: boolean;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  filters?: {
    jurisdictions?: string[];
    documentTypes?: TaxDocumentType[];
    creators?: string[];
  };
}

export interface TaxReportExportResult {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  metadata: {
    totalRecords: number;
    generatedAt: Date;
    exportOptions: TaxReportExportOptions;
  };
}
