# 🔒 Financial Reporting API - Frontend Integration Guide (Part 2: TypeScript Types & Business Logic)

**Classification: 🔒 ADMIN ONLY**

## TypeScript Type Definitions

### Core Interfaces

```typescript
// ============================================================================
// Base Types & Enums
// ============================================================================

export type ReportType = 
  | 'revenue' 
  | 'payouts' 
  | 'tax' 
  | 'reconciliation' 
  | 'custom';

export type ReportFormat = 'pdf' | 'csv' | 'excel' | 'json';

export type ReportStatus = 'GENERATING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type PayoutStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCELLED';

export type TaxDocumentType = 
  | 'FORM_1099_NEC'
  | 'FORM_1099_MISC' 
  | 'W8_BEN'
  | 'W8_BEN_E'
  | 'VAT_DOCUMENT'
  | 'GST_DOCUMENT';

export type TaxFilingStatus = 
  | 'PENDING'
  | 'GENERATED'
  | 'FILED'
  | 'AMENDED'
  | 'VOIDED';

export type ReconciliationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type GranularityType = 'daily' | 'weekly' | 'monthly';

// ============================================================================
// Request Schemas
// ============================================================================

export interface RevenueReportInput {
  startDate: Date;
  endDate: Date;
  granularity?: GranularityType;
  filters?: ReportFilters;
}

export interface PayoutSummaryInput {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed';
  creatorId?: string;
  limit?: number;
  offset?: number;
}

export interface TaxDocumentsInput {
  taxYear?: number;
  documentType?: '1099' | '1099-misc' | 'vat' | 'all';
  limit?: number;
  offset?: number;
}

export interface ReconciliationInput {
  startDate: Date;
  endDate: Date;
}

export interface GenerateReportInput {
  reportType: ReportType;
  parameters: Record<string, any>;
  format?: ReportFormat;
  name?: string;
}

export interface DownloadReportInput {
  reportId: string;
}

export interface ScheduledReportsInput {
  isActive?: boolean;
  reportType?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface ReportFilters {
  brandIds?: string[];
  creatorIds?: string[];
  licenseTypes?: string[];
  regions?: string[];
  assetTypes?: string[];
  paymentStatuses?: string[];
  currencies?: string[];
}

// ============================================================================
// Response Schemas
// ============================================================================

export interface RevenueReportResponse {
  summary: RevenueSummary;
  timeSeries: RevenueTimeSeries[];
  breakdown: RevenueBreakdown;
  metadata: ReportMetadata;
}

export interface RevenueSummary {
  totalRevenueCents: number;
  averageRevenuePerPeriod: number;
  transactionCount: number;
  growthRatePercent: number;
  period: {
    startDate: Date;
    endDate: Date;
    granularity: GranularityType;
  };
}

export interface RevenueTimeSeries {
  period: string;                          // "2025-01" or "2025-01-15"
  revenueCents: number;
  transactionCount: number;
  uniqueBrands: number;
  averageTransactionCents: number;
}

export interface RevenueBreakdown {
  byMonth: MonthlyRevenue[];
  byLicenseType: CategoryRevenue[];
  byAssetType: CategoryRevenue[];
  byRegion: CategoryRevenue[];
}

export interface MonthlyRevenue {
  month: string;                           // "2025-01"
  revenueCents: number;
  growth: number;                          // Percentage growth
}

export interface CategoryRevenue {
  type: string;                            // Category name
  revenueCents: number;
  percentage: number;                      // Percentage of total
}

// ============================================================================
// Payout Types
// ============================================================================

export interface PayoutSummaryResponse {
  summary: PayoutSummary;
  statusBreakdown: PayoutStatusBreakdown[];
  payouts: PayoutDetail[];
  pagination: PaginationMeta;
  metadata: ReportMetadata;
}

export interface PayoutSummary {
  totalPayoutsCents: number;
  payoutCount: number;
  averagePayoutCents: number;
  pendingPayoutsCents: number;
}

export interface PayoutStatusBreakdown {
  status: PayoutStatus;
  count: number;
  totalCents: number;
}

export interface PayoutDetail {
  id: string;
  amountCents: number;
  status: PayoutStatus;
  createdAt: Date;
  processedAt?: Date;
  failedReason?: string;
  retryCount: number;
  stripeTransferId?: string;
  creator: CreatorInfo;
  royaltyPeriod?: RoyaltyPeriod;
}

export interface CreatorInfo {
  id: string;
  name: string;
  email: string;
}

export interface RoyaltyPeriod {
  start: Date;
  end: Date;
}

// ============================================================================
// Tax Document Types
// ============================================================================

export interface TaxDocumentsResponse {
  summary: TaxDocumentSummary;
  documents: TaxDocumentDetail[];
  pagination: PaginationMeta;
  metadata: TaxDocumentMetadata;
}

export interface TaxDocumentSummary {
  totalDocuments: number;
  yearBreakdown: Record<string, YearBreakdown>;
}

export interface YearBreakdown {
  count: number;
  totalEarningsCents: number;
  types: Record<string, TypeBreakdown>;
}

export interface TypeBreakdown {
  count: number;
  totalEarningsCents: number;
}

export interface TaxDocumentDetail {
  id: string;
  documentType: TaxDocumentType;
  taxYear: number;
  totalEarningsCents: number;
  status: TaxFilingStatus;
  generatedAt?: Date;
  filedAt?: Date;
  storageKey: 'available' | 'not_generated';
  creator: CreatorInfo;
}

export interface TaxDocumentMetadata extends ReportMetadata {
  availableYears: number[];
}

// ============================================================================
// Reconciliation Types
// ============================================================================

export interface ReconciliationResponse {
  summary: ReconciliationSummary;
  reconciliation: ReconciliationData;
  metadata: ReconciliationMetadata;
}

export interface ReconciliationSummary {
  periodStart: Date;
  periodEnd: Date;
  totalInternalCents: number;
  totalStripeCents: number;
  discrepancyCents: number;
  reconciliationRate: number;               // 0-100
  matchedCount: number;
  unmatchedInternalCount: number;
  unmatchedStripeCount: number;
  discrepancyCount: number;
}

export interface ReconciliationData {
  matchedTransactions: MatchedTransaction[];
  unmatchedInternal: UnmatchedTransaction[];
  unmatchedStripe: UnmatchedTransaction[];
  discrepancies: ReconciliationDiscrepancy[];
}

export interface MatchedTransaction {
  internalId: string;
  stripeId: string;
  amountCents: number;
  matchConfidence: number;                  // 0-100
  matchedAt: Date;
}

export interface UnmatchedTransaction {
  id: string;
  amountCents: number;
  type: string;
  createdAt: Date;
  reason: string;
}

export interface ReconciliationDiscrepancy {
  internalId: string;
  stripeId: string;
  internalAmountCents: number;
  stripeAmountCents: number;
  discrepancyCents: number;
  severity: ReconciliationSeverity;
  explanation: string;
}

export interface ReconciliationMetadata {
  reportId: string;
  generatedAt: Date;
  generatedBy: string;
}

// ============================================================================
// Report Generation Types
// ============================================================================

export interface GenerateReportResponse {
  reportId: string;
  status: 'GENERATING';
  estimatedCompletionTime: Date;
  message: string;
}

export interface DownloadReportResponse {
  downloadUrl: string;
  filename: string;
  expiresAt: Date;
  reportInfo: ReportInfo;
}

export interface ReportInfo {
  id: string;
  type: string;
  generatedAt: Date;
  size: string;
}

// ============================================================================
// Scheduled Reports Types
// ============================================================================

export interface ScheduledReportsResponse {
  summary: ScheduledReportSummary;
  scheduledReports: ScheduledReportDetail[];
  pagination: PaginationMeta;
  metadata: ReportMetadata;
}

export interface ScheduledReportSummary {
  totalScheduled: number;
  activeCount: number;
  nextExecution?: Date;
}

export interface ScheduledReportDetail {
  id: string;
  name: string;
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  cronExpression: string;
  recipients: string[];
  isActive: boolean;
  lastGeneratedAt?: Date;
  nextScheduledAt?: Date;
  parameters: Record<string, any>;
  createdBy: UserInfo;
  recentReports: RecentReport[];
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface RecentReport {
  id: string;
  status: ReportStatus;
  generatedAt: Date;
}

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ReportMetadata {
  generatedAt: Date;
  requestedBy: string;
  filters?: ReportFilters;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ReportError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

export class ReportGenerationError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, any>;
  
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ReportGenerationError';
    this.code = 'REPORT_GENERATION_FAILED';
    this.statusCode = 500;
    this.details = details;
  }
}

export class ReportValidationError extends Error {
  code: string;
  statusCode: number;
  fieldErrors?: Record<string, string[]>;
  
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ReportValidationError';
    this.code = 'REPORT_VALIDATION_FAILED';
    this.statusCode = 400;
    this.fieldErrors = fieldErrors;
  }
}

export class ReportAccessDeniedError extends Error {
  code: string;
  statusCode: number;
  
  constructor(message: string) {
    super(message);
    this.name = 'ReportAccessDeniedError';
    this.code = 'REPORT_ACCESS_DENIED';
    this.statusCode = 403;
  }
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

import { z } from 'zod';

export const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

export const revenueReportInputSchema = dateRangeSchema.extend({
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional(),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional()
  }).optional()
});

export const payoutSummaryInputSchema = dateRangeSchema.extend({
  status: z.enum(['all', 'pending', 'completed', 'failed']).default('all'),
  creatorId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export const taxDocumentsInputSchema = z.object({
  taxYear: z.number().int().min(2020).max(2050).optional(),
  documentType: z.enum(['1099', '1099-misc', 'vat', 'all']).default('all'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export const generateReportInputSchema = z.object({
  reportType: z.enum(['revenue', 'payouts', 'tax', 'reconciliation', 'custom']),
  parameters: z.record(z.any()),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  name: z.string().optional()
});

// ============================================================================
// Type Guards
// ============================================================================

export function isPayoutStatus(value: string): value is PayoutStatus {
  return ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(value);
}

export function isTaxDocumentType(value: string): value is TaxDocumentType {
  return ['FORM_1099_NEC', 'FORM_1099_MISC', 'W8_BEN', 'W8_BEN_E', 'VAT_DOCUMENT', 'GST_DOCUMENT'].includes(value);
}

export function isReportFormat(value: string): value is ReportFormat {
  return ['pdf', 'csv', 'excel', 'json'].includes(value);
}

export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 730; // Max 2 years
}

// ============================================================================
// Utility Types
// ============================================================================

export type RevenueReportKeys = keyof RevenueReportResponse;
export type PayoutSummaryKeys = keyof PayoutSummaryResponse;
export type TaxDocumentKeys = keyof TaxDocumentsResponse;
export type ReconciliationKeys = keyof ReconciliationResponse;

// For form handling
export type RevenueReportFormData = Omit<RevenueReportInput, 'startDate' | 'endDate'> & {
  startDate: string;
  endDate: string;
};

export type PayoutSummaryFormData = Omit<PayoutSummaryInput, 'startDate' | 'endDate'> & {
  startDate: string;
  endDate: string;
};

// For table columns
export type PayoutTableColumn = {
  key: keyof PayoutDetail;
  label: string;
  sortable?: boolean;
  format?: 'currency' | 'date' | 'status';
};

export type TaxDocumentTableColumn = {
  key: keyof TaxDocumentDetail;
  label: string;
  sortable?: boolean;
  format?: 'currency' | 'date' | 'status';
};

// ============================================================================
// API Client Types
// ============================================================================

export interface ReportsApiClient {
  getRevenue(input: RevenueReportInput): Promise<RevenueReportResponse>;
  getPayouts(input: PayoutSummaryInput): Promise<PayoutSummaryResponse>;
  getTaxDocuments(input: TaxDocumentsInput): Promise<TaxDocumentsResponse>;
  getReconciliation(input: ReconciliationInput): Promise<ReconciliationResponse>;
  generate(input: GenerateReportInput): Promise<GenerateReportResponse>;
  download(input: DownloadReportInput): Promise<DownloadReportResponse>;
  getScheduled(input: ScheduledReportsInput): Promise<ScheduledReportsResponse>;
}

// ============================================================================
// React Hook Types
// ============================================================================

export interface UseRevenueReportResult {
  data?: RevenueReportResponse;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
}

export interface UsePayoutSummaryResult {
  data?: PayoutSummaryResponse;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
}

export interface UseReportGenerationResult {
  generateReport: (input: GenerateReportInput) => Promise<void>;
  isGenerating: boolean;
  reportId?: string;
  error?: Error;
}

// ============================================================================
// Constants
// ============================================================================

export const REPORT_FORMATS = {
  PDF: 'pdf',
  CSV: 'csv', 
  EXCEL: 'excel',
  JSON: 'json'
} as const;

export const PAYOUT_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING', 
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export const TAX_DOCUMENT_TYPES = {
  FORM_1099_NEC: 'FORM_1099_NEC',
  FORM_1099_MISC: 'FORM_1099_MISC',
  W8_BEN: 'W8_BEN',
  W8_BEN_E: 'W8_BEN_E',
  VAT_DOCUMENT: 'VAT_DOCUMENT',
  GST_DOCUMENT: 'GST_DOCUMENT'
} as const;

export const RECONCILIATION_SEVERITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM', 
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;

export const GRANULARITY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
] as const;

export const MAX_DATE_RANGE_DAYS = 730; // 2 years
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// Export All Types
// ============================================================================

export type {
  ReportType,
  ReportFormat,
  ReportStatus,
  PayoutStatus,
  TaxDocumentType,
  TaxFilingStatus,
  ReconciliationSeverity,
  GranularityType
};
```

## Business Logic & Validation Rules

### Date Range Validation
- **Maximum Range:** 2 years (730 days) between start and end dates
- **Minimum Range:** 1 day
- **Format:** ISO 8601 date strings or Date objects
- **Business Rule:** End date must be >= start date

### Revenue Report Logic
- **Granularity Auto-Detection:**
  - ≤ 31 days: Daily granularity
  - 32-92 days: Weekly granularity  
  - > 92 days: Monthly granularity
- **Growth Calculation:** Compared to equivalent previous period
- **Currency:** All amounts in cents (USD)

### Payout Processing Rules
- **Retry Logic:** Failed payouts can be retried up to 3 times
- **Minimum Amount:** $10.00 (1000 cents) minimum payout
- **Processing Time:** 1-3 business days for Stripe transfers
- **Status Transitions:** PENDING → PROCESSING → COMPLETED/FAILED

### Tax Document Generation
- **1099 Threshold:** $600 minimum earnings per tax year
- **Generation Timing:** Documents generated January 31st following tax year
- **Amendment Window:** 3 years from original filing date
- **International:** W8-BEN forms for non-US creators

### Reconciliation Logic
- **Matching Tolerance:** ±$0.05 for automatic matching
- **Confidence Scoring:** 
  - 100%: Exact amount and timing match
  - 90-99%: Amount match with timing variance
  - 80-89%: Close amount match
  - < 80%: Manual review required

### Report Generation Limits
- **Concurrent Reports:** Maximum 3 reports generating per user
- **File Retention:** 30 days after generation
- **Size Limits:**
  - PDF: 50MB maximum
  - CSV/Excel: 100MB maximum
  - JSON: 10MB maximum

## Next Steps

Continue to **Part 3: Error Handling & Implementation** for complete error management, authentication setup, and frontend implementation patterns.
