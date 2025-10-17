# ⚡ Tax & Compliance Reports - Frontend Integration Guide (Part 2: TypeScript Types & Schemas)

**Classification:** ⚡ HYBRID - Core functionality used by both public website and admin backend with different access levels

## TypeScript Type Definitions

Export these types to your frontend codebase for full type safety.

---

## 1. Core Enums

```typescript
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
  FEDERAL_TAX = 'FEDERAL_TAX',
  STATE_TAX = 'STATE_TAX',
  FOREIGN_TAX = 'FOREIGN_TAX',
  INTERNATIONAL_TREATY = 'INTERNATIONAL_TREATY',
  LOCAL_TAX = 'LOCAL_TAX'
}
```

---

## 2. Tax Document Types

### 2.1 Core Tax Document Interface
```typescript
export interface TaxDocumentData {
  id: string;
  creatorId: string;
  taxYear: number;
  documentType: TaxDocumentType;
  filingStatus: TaxFilingStatus;
  totalAmountCents: number;
  withholdingCents: number;
  pdfStorageKey?: string;
  pdfGeneratedAt?: Date;
  deliveredAt?: Date;
  filedAt?: Date;
  correctionOfId?: string;
  voidedAt?: Date;
  voidReason?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  
  // Computed fields
  totalAmountFormatted: string;     // "$1,234.56"
  withholdingFormatted: string;     // "$123.45"
  isVoided: boolean;
  isCorrected: boolean;
  canGeneratePDF: boolean;
}
```

### 2.2 Create Tax Document Input
```typescript
export interface CreateTaxDocumentInput {
  creatorId: string;
  taxYear: number;                  // 2020-2050
  documentType: TaxDocumentType;
  totalAmountCents: number;         // Amount in cents (min: 0)
  withholdingCents?: number;        // Default: 0
  metadata?: Record<string, any>;
}
```

### 2.3 Update Tax Document Input  
```typescript
export interface UpdateTaxDocumentInput {
  id: string;
  filingStatus?: TaxFilingStatus;
  pdfStorageKey?: string;
  pdfGeneratedAt?: Date;
  deliveredAt?: Date;
  filedAt?: Date;
  voidedAt?: Date;
  voidReason?: string;
  metadata?: Record<string, any>;
}
```

### 2.4 Form 1099 Specific Data
```typescript
export interface Form1099Data {
  // Payer Information (Platform)
  payerName: string;
  payerAddress: string;
  payerTIN: string;                 // Tax Identification Number
  
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
  
  // Form 1099-MISC Specific (optional)
  miscellaneousIncomeCents?: number;
  
  // Additional Details
  stateTaxWithheldCents?: number;
  statePayerTIN?: string;
  stateIncomeCents?: number;
}
```

---

## 3. Payment Threshold Types

### 3.1 Payment Threshold Data
```typescript
export interface PaymentThresholdData {
  id: string;
  creatorId: string;
  taxYear: number;
  jurisdiction: string;             // 'US', 'CA', 'UK', etc.
  totalPaymentsCents: number;
  thresholdAmountCents: number;     // Default: 60000 ($600 for US 1099)
  thresholdMet: boolean;
  thresholdMetAt?: Date;
  lastUpdated: Date;
  metadata: Record<string, any>;
  
  // Computed fields
  totalPaymentsFormatted: string;   // "$1,234.56"
  thresholdAmountFormatted: string; // "$600.00"
  percentageReached: number;        // 0-100
  remainingAmount: string;          // "$365.44"
}
```

### 3.2 Threshold Status (Extended View)
```typescript
export interface ThresholdStatus {
  creatorId: string;
  taxYear: number;
  jurisdiction: string;
  currentAmountCents: number;
  thresholdAmountCents: number;
  remainingCents: number;
  percentageReached: number;        // 0-100
  thresholdMet: boolean;
  daysUntilYearEnd: number;
  projectedTotal?: number;          // Based on current rate (optional)
  
  // Display helpers
  currentAmountFormatted: string;   // "$423.45"
  remainingFormatted: string;       // "$176.55"
  projectedTotalFormatted?: string; // "$750.00" 
  statusMessage: string;            // "67% of threshold reached"
}
```

### 3.3 Threshold Statistics (Admin View)
```typescript
export interface ThresholdStatisticsData {
  totalCreators: number;
  thresholdMet: number;
  totalPaymentsCents: number;
  averagePaymentsCents: number;
  byJurisdiction: Record<string, {
    creators: number;
    thresholdMet: number;
    totalPaymentsCents: number;
  }>;
  
  // Display helpers
  thresholdMetPercentage: number;   // 42.5
  totalPaymentsFormatted: string;   // "$2,345,678.90"
  averagePaymentsFormatted: string; // "$1,234.56"
}
```

---

## 4. Tax Form Job Types

### 4.1 Tax Form Job Data
```typescript
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
  
  // Computed fields
  progressPercentage: number;       // 0-100
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  duration?: string;                // "2m 35s" or "1h 15m"
  estimatedTimeRemaining?: string;  // "5m 20s"
}
```

### 4.2 Create Tax Form Job Input
```typescript
export interface CreateTaxFormJobInput {
  taxYear: number;                  // 2020-2050
  jobType: 'YEAR_END_GENERATION' | 'THRESHOLD_CHECK' | 'RENEWAL_REMINDER' | 'CORRECTION_BATCH';
  totalCreators?: number;
  metadata?: Record<string, any>;
}
```

---

## 5. Validation & Compliance Types

### 5.1 Tax Validation Result
```typescript
export interface TaxValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiredDocuments: string[];      // Array of TaxDocumentType values
  recommendedActions: string[];
  
  // Detailed validation info
  thresholdCompliance: {
    meetsThreshold: boolean;
    hasRequiredDocuments: boolean;
    documentsGenerated: number;
    documentsRequired: number;
  };
  
  // Display helpers
  validationScore: number;          // 0-100
  complianceLevel: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
}
```

### 5.2 Filing Statistics (Admin)
```typescript
export interface FilingStatisticsData {
  taxYear: number;
  totalCreators: number;
  creatorsRequiring1099: number;
  documentsGenerated: number;
  documentsDelivered: number;
  documentsFiled: number;
  pendingDocuments: number;
  
  // Breakdown by document type
  byDocumentType: Record<TaxDocumentType, {
    generated: number;
    delivered: number;
    filed: number;
    pending: number;
  }>;
  
  // Progress metrics
  generationProgress: number;       // 0-100
  deliveryProgress: number;         // 0-100
  filingProgress: number;           // 0-100
}
```

---

## 6. International Tax Types

### 6.1 W8-BEN Individual Foreign Person
```typescript
export interface W8BENData {
  individualName: string;
  countryOfTaxResidence: string;
  permanentResidenceAddress: string;
  mailingAddress?: string;
  foreignTIN?: string;
  foreignTINCountry?: string;
  claimTreatyBenefits: boolean;
  treatyCountry?: string;
  treatyArticle?: string;
  treatyRate?: number;              // Percentage (0-100)
  certificationDate: Date;
  capacityActing?: string;
  
  // Validation flags
  isTINRequired: boolean;
  isTreatyEligible: boolean;
  documentExpiry?: Date;
}
```

### 6.2 W8-BEN-E Entity Foreign Person  
```typescript
export interface W8BENEData {
  organizationName: string;
  countryOfIncorporation: string;
  businessAddress: string;
  mailingAddress?: string;
  entityType: string;
  claimTreatyBenefits: boolean;
  treatyCountry?: string;
  treatyProvisions?: string;
  certificationDate: Date;
  
  // Entity classification
  entityClassification: 'CORPORATION' | 'PARTNERSHIP' | 'TRUST' | 'ESTATE' | 'OTHER';
  chapterStatus: string;
  
  // Validation
  requiresEIN: boolean;
  documentExpiry?: Date;
}
```

---

## 7. VAT/GST Reporting Types

### 7.1 VAT Report Data
```typescript
export interface VATReportData {
  taxYear: number;
  quarter?: number;                 // 1-4 for quarterly reports
  jurisdiction: string;             // 'UK', 'EU', etc.
  totalSalesCents: number;
  totalVATCents: number;
  platformVATCents: number;
  creatorVATCents: number;
  exemptSalesCents: number;
  breakdown: Array<{
    creatorId: string;
    salesCents: number;
    vatCents: number;
    vatRate: number;                // Percentage
  }>;
  
  // Display helpers
  totalSalesFormatted: string;
  totalVATFormatted: string;
  effectiveVATRate: number;
}
```

### 7.2 GST Report Data
```typescript
export interface GSTReportData {
  taxYear: number;
  quarter?: number;
  jurisdiction: string;             // 'AU', 'CA', 'IN', etc.
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
  
  // Display helpers
  totalSalesFormatted: string;
  netGSTFormatted: string;
  effectiveGSTRate: number;
}
```

---

## 8. Input Validation Schemas

### 8.1 Create Payment Threshold Input
```typescript
export interface CreatePaymentThresholdInput {
  creatorId: string;                // CUID format
  taxYear: number;                  // 2020-2050
  jurisdiction?: string;            // Default: 'US', max 10 chars
  thresholdAmountCents: number;     // Min: 0, typically 60000 for US
}
```

### 8.2 Validation Schema Examples (Zod)
```typescript
// For frontend form validation
export const taxYearSchema = z.number().int().min(2020).max(2050);
export const currencyAmountSchema = z.number().int().min(0).max(999999999); // $9,999,999.99 max
export const countryCodeSchema = z.string().min(2).max(3); // 'US', 'CA', 'UK'
export const jurisdictionSchema = z.string().max(10).default('US');

// Create tax document validation
export const createTaxDocumentSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  documentType: z.nativeEnum(TaxDocumentType),
  totalAmountCents: currencyAmountSchema,
  withholdingCents: currencyAmountSchema.default(0),
  metadata: z.record(z.any()).default({})
});

// Threshold check validation  
export const checkThresholdStatusSchema = z.object({
  creatorId: z.string().cuid(),
  taxYear: taxYearSchema,
  jurisdiction: jurisdictionSchema.optional()
});
```

---

## 9. API Response Wrappers

### 9.1 List Response Format
```typescript
export interface TaxDocumentListResponse {
  documents: TaxDocumentData[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaymentThresholdListResponse {
  thresholds: PaymentThresholdData[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface TaxFormJobListResponse {
  jobs: TaxFormJobData[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

### 9.2 Action Result Types
```typescript
export interface DocumentGenerationResult {
  document: TaxDocumentData;
  pdfInfo: {
    storageKey: string;
    fileSize: number;
    mimeType: string;
    filename: string;
  };
}

export interface JobCreationResult {
  job: TaxFormJobData;
  estimatedDuration: string;        // "10-15 minutes"
  queuePosition?: number;
}

export interface ValidationResponse {
  result: TaxValidationResult;
  recommendations: string[];
  nextActions: Array<{
    action: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    dueDate?: Date;
  }>;
}
```

---

## 10. Error Types

```typescript
export interface TaxComplianceError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, any>;
}

// Common error codes
export const TAX_ERROR_CODES = {
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  THRESHOLD_NOT_MET: 'THRESHOLD_NOT_MET',
  INVALID_TAX_YEAR: 'INVALID_TAX_YEAR',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  INVALID_JURISDICTION: 'INVALID_JURISDICTION'
} as const;
```

---

**Continue to [Part 3: Implementation & Business Logic](./TAX_COMPLIANCE_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)**
