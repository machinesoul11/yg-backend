/**
 * Tax & Compliance Validation Schemas
 * Zod schemas for tax reporting and compliance functionality
 */

import { z } from 'zod';
import { TaxDocumentType, TaxFilingStatus, TaxWithholdingType } from '../types';

// ============================================================================
// Base Schemas
// ============================================================================

export const taxYearSchema = z.number().int().min(2020).max(2050);
export const currencyAmountSchema = z.number().int().min(0);
export const percentageSchema = z.number().min(0).max(1);
export const countryCodeSchema = z.string().length(2).regex(/^[A-Z]{2}$/);
export const stateProvinceSchema = z.string().max(10).optional();

// ============================================================================
// Tax Document Schemas
// ============================================================================

export const taxDocumentTypeSchema = z.nativeEnum(TaxDocumentType);
export const taxFilingStatusSchema = z.nativeEnum(TaxFilingStatus);

export const createTaxDocumentSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  documentType: taxDocumentTypeSchema,
  totalAmountCents: currencyAmountSchema,
  withholdingCents: currencyAmountSchema.default(0),
  metadata: z.record(z.any()).default({}),
});

export const updateTaxDocumentSchema = z.object({
  id: z.string().cuid(),
  totalAmountCents: currencyAmountSchema.optional(),
  withholdingCents: currencyAmountSchema.optional(),
  filingStatus: taxFilingStatusSchema.optional(),
  pdfStorageKey: z.string().optional(),
  pdfGeneratedAt: z.date().optional(),
  filedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export const getTaxDocumentsSchema = z.object({
  creatorId: z.string().cuid().optional(),
  taxYear: taxYearSchema.optional(),
  documentType: taxDocumentTypeSchema.optional(),
  filingStatus: taxFilingStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'taxYear', 'totalAmountCents', 'filingStatus']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const generateTaxDocumentSchema = z.object({
  documentId: z.string().cuid(),
  forceRegenerate: z.boolean().default(false),
});

// ============================================================================
// Form 1099 Specific Schemas
// ============================================================================

export const form1099DataSchema = z.object({
  // Payer Information (Platform)
  payerName: z.string().min(1).max(100),
  payerAddress: z.string().min(1).max(500),
  payerTIN: z.string().regex(/^\d{2}-\d{7}$|^\d{9}$/), // EIN format
  
  // Recipient Information (Creator)
  recipientName: z.string().min(1).max(100),
  recipientAddress: z.string().min(1).max(500),
  recipientTIN: z.string().regex(/^\d{3}-\d{2}-\d{4}$|^\d{2}-\d{7}$|^\d{9}$/), // SSN or EIN format
  recipientAccountNumber: z.string().max(32).optional(),
  
  // Payment Information
  taxYear: taxYearSchema,
  totalAmountCents: currencyAmountSchema,
  federalTaxWithheldCents: currencyAmountSchema.default(0),
  
  // Form 1099-NEC Specific
  nonEmployeeCompensationCents: currencyAmountSchema,
  
  // Form 1099-MISC Specific (if needed)
  miscellaneousIncomeCents: currencyAmountSchema.optional(),
  
  // Additional Details
  stateTaxWithheldCents: currencyAmountSchema.default(0),
  statePayerTIN: z.string().optional(),
  stateIncomeCents: currencyAmountSchema.optional(),
});

// ============================================================================
// Payment Threshold Schemas
// ============================================================================

export const createPaymentThresholdSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  jurisdiction: z.string().max(10).default('US'),
  thresholdAmountCents: currencyAmountSchema,
});

export const updatePaymentThresholdSchema = z.object({
  id: z.string().cuid(),
  totalPaymentsCents: currencyAmountSchema.optional(),
  thresholdMet: z.boolean().optional(),
  thresholdMetAt: z.date().optional(),
});

export const getPaymentThresholdsSchema = z.object({
  creatorId: z.string().cuid().optional(),
  taxYear: taxYearSchema.optional(),
  jurisdiction: z.string().max(10).optional(),
  thresholdMet: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const checkThresholdStatusSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  jurisdiction: z.string().max(10).default('US'),
});

// ============================================================================
// Tax Withholding Schemas
// ============================================================================

export const taxWithholdingTypeSchema = z.nativeEnum(TaxWithholdingType);

export const createTaxWithholdingSchema = z.object({
  creatorId: z.string().cuid(),
  withholdingType: taxWithholdingTypeSchema,
  percentageRate: percentageSchema,
  effectiveStartDate: z.date(),
  effectiveEndDate: z.date().optional(),
  supportingDocumentKey: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});

export const updateTaxWithholdingSchema = z.object({
  id: z.string().cuid(),
  percentageRate: percentageSchema.optional(),
  effectiveEndDate: z.date().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  metadata: z.record(z.any()).optional(),
});

export const getTaxWithholdingsSchema = z.object({
  creatorId: z.string().cuid().optional(),
  withholdingType: taxWithholdingTypeSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  effectiveDate: z.date().optional(), // Check which withholdings are effective on this date
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Tax Jurisdiction Schemas
// ============================================================================

export const createTaxJurisdictionSchema = z.object({
  creatorId: z.string().cuid(),
  countryCode: countryCodeSchema,
  stateProvince: stateProvinceSchema,
  taxTreatyStatus: z.enum(['NO_TREATY', 'REDUCED_RATE', 'EXEMPT']).optional(),
  applicableRate: percentageSchema.optional(),
  reportingRequirements: z.record(z.any()).default({}),
  documentationType: z.enum(['W9', 'W8BEN', 'W8BEN_E', 'OTHER']).optional(),
  documentationExpiry: z.date().optional(),
  isPrimary: z.boolean().default(true),
});

export const updateTaxJurisdictionSchema = z.object({
  id: z.string().cuid(),
  taxTreatyStatus: z.enum(['NO_TREATY', 'REDUCED_RATE', 'EXEMPT']).optional(),
  applicableRate: percentageSchema.optional(),
  reportingRequirements: z.record(z.any()).optional(),
  documentationType: z.enum(['W9', 'W8BEN', 'W8BEN_E', 'OTHER']).optional(),
  documentationExpiry: z.date().optional(),
  isPrimary: z.boolean().optional(),
});

export const getTaxJurisdictionsSchema = z.object({
  creatorId: z.string().cuid().optional(),
  countryCode: countryCodeSchema.optional(),
  isPrimary: z.boolean().optional(),
  documentationExpiring: z.boolean().optional(), // Check for expiring documentation
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Annual Tax Summary Schemas
// ============================================================================

export const createAnnualTaxSummarySchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  totalGrossPaymentsCents: currencyAmountSchema,
  totalWithheldCents: currencyAmountSchema.default(0),
  paymentCount: z.number().int().min(0),
  formsRequired: z.array(z.string()),
});

export const updateAnnualTaxSummarySchema = z.object({
  id: z.string().cuid(),
  totalGrossPaymentsCents: currencyAmountSchema.optional(),
  totalWithheldCents: currencyAmountSchema.optional(),
  paymentCount: z.number().int().min(0).optional(),
  formsRequired: z.array(z.string()).optional(),
  formsGenerated: z.array(z.string()).optional(),
  summaryPdfKey: z.string().optional(),
  generatedAt: z.date().optional(),
});

export const getAnnualTaxSummariesSchema = z.object({
  creatorId: z.string().cuid().optional(),
  taxYear: taxYearSchema.optional(),
  hasBeenGenerated: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const generateAnnualTaxSummarySchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  forceRegenerate: z.boolean().default(false),
});

// ============================================================================
// Tax Form Job Schemas
// ============================================================================

export const createTaxFormJobSchema = z.object({
  taxYear: taxYearSchema,
  jobType: z.enum(['YEAR_END_GENERATION', 'THRESHOLD_CHECK', 'RENEWAL_REMINDER', 'CORRECTION_BATCH']),
  totalCreators: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).default({}),
});

export const updateTaxFormJobSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  processedCreators: z.number().int().min(0).optional(),
  failedCreators: z.number().int().min(0).optional(),
  errorDetails: z.array(z.object({
    creatorId: z.string().cuid(),
    error: z.string(),
    timestamp: z.date(),
  })).optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});

export const getTaxFormJobsSchema = z.object({
  taxYear: taxYearSchema.optional(),
  jobType: z.enum(['YEAR_END_GENERATION', 'THRESHOLD_CHECK', 'RENEWAL_REMINDER', 'CORRECTION_BATCH']).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'startedAt', 'completedAt', 'taxYear']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// VAT/GST Reporting Schemas
// ============================================================================

export const generateVATReportSchema = z.object({
  taxYear: taxYearSchema,
  quarter: z.number().int().min(1).max(4).optional(),
  jurisdiction: z.string().min(2).max(10),
  includeCreatorBreakdown: z.boolean().default(true),
});

export const generateGSTReportSchema = z.object({
  taxYear: taxYearSchema,
  quarter: z.number().int().min(1).max(4).optional(),
  jurisdiction: z.string().min(2).max(10),
  includeTransactionBreakdown: z.boolean().default(true),
});

// ============================================================================
// International Tax Documentation Schemas
// ============================================================================

export const w8BENDataSchema = z.object({
  individualName: z.string().min(1).max(100),
  countryOfTaxResidence: countryCodeSchema,
  permanentResidenceAddress: z.string().min(1).max(500),
  mailingAddress: z.string().max(500).optional(),
  foreignTIN: z.string().max(50).optional(),
  foreignTINCountry: countryCodeSchema.optional(),
  claimTreatyBenefits: z.boolean(),
  treatyCountry: countryCodeSchema.optional(),
  treatyArticle: z.string().max(20).optional(),
  treatyRate: percentageSchema.optional(),
  certificationDate: z.date(),
  capacityActing: z.string().max(100).optional(),
});

export const w8BENEDataSchema = z.object({
  organizationName: z.string().min(1).max(100),
  countryOfIncorporation: countryCodeSchema,
  businessAddress: z.string().min(1).max(500),
  mailingAddress: z.string().max(500).optional(),
  entityType: z.string().min(1).max(100),
  claimTreatyBenefits: z.boolean(),
  treatyCountry: countryCodeSchema.optional(),
  treatyProvisions: z.string().max(500).optional(),
  certificationDate: z.date(),
});

// ============================================================================
// Tax Compliance Validation Schemas
// ============================================================================

export const validateCreatorTaxComplianceSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema.optional().default(new Date().getFullYear()),
  includeRecommendations: z.boolean().default(true),
});

export const getCreatorTaxComplianceStatusSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema.optional().default(new Date().getFullYear()),
});

// ============================================================================
// Export and Reporting Schemas
// ============================================================================

export const taxReportExportSchema = z.object({
  format: z.enum(['PDF', 'CSV', 'EXCEL', 'XML']),
  includeMetadata: z.boolean().default(true),
  includeSummary: z.boolean().default(true),
  dateRange: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }).optional(),
  filters: z.object({
    jurisdictions: z.array(z.string()).optional(),
    documentTypes: z.array(taxDocumentTypeSchema).optional(),
    creators: z.array(z.string().cuid()).optional(),
  }).optional(),
});

export const generateTaxReportSchema = z.object({
  reportType: z.enum(['ANNUAL_SUMMARY', 'THRESHOLD_STATUS', 'COMPLIANCE_STATUS', 'WITHHOLDING_SUMMARY']),
  taxYear: taxYearSchema,
  filters: z.object({
    creatorIds: z.array(z.string().cuid()).optional(),
    jurisdictions: z.array(z.string()).optional(),
    documentTypes: z.array(taxDocumentTypeSchema).optional(),
  }).optional(),
  exportOptions: taxReportExportSchema.optional(),
});
