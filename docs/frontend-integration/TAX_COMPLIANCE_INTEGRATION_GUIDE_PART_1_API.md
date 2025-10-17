# ⚡ Tax & Compliance Reports - Frontend Integration Guide (Part 1: API Reference)

**Classification:** ⚡ HYBRID - Core functionality used by both public website and admin backend with different access levels

## Overview

The Tax & Compliance Reports module provides comprehensive functionality for managing tax documents, payment thresholds, international tax compliance, and automated form generation. This guide covers the complete API surface and integration requirements for the frontend team.

---

## 1. API Endpoints

### Base URL & Authentication
- **Backend:** `https://ops.yesgoddess.agency/api/trpc`
- **Authentication:** JWT via HTTP-only cookies (Next-Auth session)
- **Router Prefix:** `taxCompliance.*`

All endpoints require authentication. Role-based access control applies:
- 🔒 **Admin Only:** Full access to all data and operations
- 🌐 **Creator Access:** Restricted to own tax documents and threshold status

---

## 2. Core Endpoint Categories

### 2.1 Tax Document Management (🌐 SHARED)

#### `taxCompliance.createTaxDocument` 
```typescript
input: CreateTaxDocumentInput
output: TaxDocumentData
access: PROTECTED (creators for own data, admins for all)
```

#### `taxCompliance.getTaxDocuments`
```typescript
input: GetTaxDocumentsInput
output: { documents: TaxDocumentData[]; total: number }
access: PROTECTED (filtered by user role)
```

#### `taxCompliance.getTaxDocumentById`
```typescript
input: { id: string }
output: TaxDocumentData | null
access: PROTECTED (ownership verification)
```

#### `taxCompliance.generateTaxDocument`
```typescript
input: { documentId: string; forceRegenerate?: boolean }
output: { document: TaxDocumentData; pdfInfo: { storageKey: string; fileSize: number } }
access: PROTECTED (ownership verification)
```

#### `taxCompliance.updateTaxDocument`
```typescript
input: UpdateTaxDocumentInput
output: TaxDocumentData
access: PROTECTED (ownership verification)
```

#### `taxCompliance.deleteTaxDocument`
```typescript
input: { id: string }
output: { success: boolean }
access: ADMIN_ONLY
```

### 2.2 Payment Threshold Tracking (⚡ HYBRID)

#### `taxCompliance.getPaymentThresholds`
```typescript
input: GetPaymentThresholdsInput
output: { thresholds: PaymentThresholdData[]; total: number }
access: PROTECTED (filtered by user role)
```

#### `taxCompliance.checkThresholdStatus`
```typescript
input: { creatorId: string; taxYear: number; jurisdiction?: string }
output: ThresholdStatus
access: PROTECTED (ownership verification)
```

#### `taxCompliance.createPaymentThreshold` 
```typescript
input: CreatePaymentThresholdInput
output: PaymentThresholdData
access: ADMIN_ONLY
```

#### `taxCompliance.getThresholdStatistics`
```typescript
input: { taxYear: number }
output: ThresholdStatisticsData
access: ADMIN_ONLY
```

#### `taxCompliance.getCreatorsApproachingThreshold`
```typescript
input: { taxYear: number; percentageThreshold?: number }
output: ThresholdStatus[]
access: ADMIN_ONLY
```

### 2.3 Tax Form Job Management (🔒 ADMIN ONLY)

#### `taxCompliance.createTaxFormJob`
```typescript
input: CreateTaxFormJobInput
output: TaxFormJobData
access: ADMIN_ONLY
```

#### `taxCompliance.getTaxFormJobs`
```typescript
input: GetTaxFormJobsInput
output: { jobs: TaxFormJobData[]; total: number }
access: ADMIN_ONLY
```

#### `taxCompliance.getTaxFormJobStatus`
```typescript
input: { jobId: string }
output: TaxFormJobData
access: ADMIN_ONLY
```

#### `taxCompliance.cancelTaxFormJob`
```typescript
input: { jobId: string }
output: { success: boolean }
access: ADMIN_ONLY
```

### 2.4 Tax Compliance Validation (🌐 SHARED)

#### `taxCompliance.validateCreatorTaxCompliance`
```typescript
input: { creatorId: string; taxYear: number }
output: TaxValidationResult
access: PROTECTED (ownership verification)
```

#### `taxCompliance.getFilingStatistics`
```typescript
input: { taxYear: number }
output: FilingStatisticsData
access: ADMIN_ONLY
```

### 2.5 Administrative Operations (🔒 ADMIN ONLY)

#### `taxCompliance.processYearEndGeneration`
```typescript
input: { taxYear: number; forceRegenerate?: boolean }
output: { job: TaxFormJobData }
access: ADMIN_ONLY
```

#### `taxCompliance.runThresholdCheck`
```typescript
input: { taxYear: number }
output: { job: TaxFormJobData }
access: ADMIN_ONLY
```

#### `taxCompliance.sendRenewalReminders`
```typescript
input: { taxYear: number }
output: { job: TaxFormJobData }
access: ADMIN_ONLY
```

#### `taxCompliance.createCorrectionDocument`
```typescript
input: { originalDocumentId: string; correctionData: Partial<CreateTaxDocumentInput> }
output: TaxDocumentData
access: ADMIN_ONLY
```

---

## 3. Query Parameters & Filtering

### 3.1 Tax Documents Filtering
```typescript
interface GetTaxDocumentsInput {
  creatorId?: string;           // Filter by creator
  taxYear?: number;             // Filter by tax year (2020-2050)
  documentType?: TaxDocumentType; // Form type filter
  filingStatus?: TaxFilingStatus; // Filing status filter
  limit?: number;               // Page size (1-100, default: 50)
  offset?: number;              // Pagination offset (default: 0)
  sortBy?: 'createdAt' | 'taxYear' | 'totalAmountCents' | 'filingStatus';
  sortOrder?: 'asc' | 'desc';   // Default: 'desc'
}
```

### 3.2 Payment Thresholds Filtering
```typescript
interface GetPaymentThresholdsInput {
  creatorId?: string;           // Filter by creator
  taxYear?: number;             // Filter by tax year
  jurisdiction?: string;        // Filter by tax jurisdiction
  thresholdMet?: boolean;       // Filter by threshold status
  limit?: number;               // Page size (1-100, default: 50)
  offset?: number;              // Pagination offset (default: 0)
}
```

### 3.3 Tax Form Jobs Filtering
```typescript
interface GetTaxFormJobsInput {
  taxYear?: number;             // Filter by tax year
  jobType?: 'YEAR_END_GENERATION' | 'THRESHOLD_CHECK' | 'RENEWAL_REMINDER' | 'CORRECTION_BATCH';
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  limit?: number;               // Page size (1-100, default: 50)
  offset?: number;              // Pagination offset (default: 0)
  sortBy?: 'createdAt' | 'startedAt' | 'completedAt' | 'taxYear';
  sortOrder?: 'asc' | 'desc';   // Default: 'desc'
}
```

---

## 4. Pagination Format

All list endpoints use **offset-based pagination**:

```typescript
// Request
{
  limit: 50,      // Page size (max 100)
  offset: 100     // Skip first 100 records
}

// Response
{
  documents: TaxDocumentData[],  // Current page items
  total: 250                     // Total count for pagination UI
}
```

**Frontend Pagination Helper:**
```typescript
const currentPage = Math.floor(offset / limit) + 1;
const totalPages = Math.ceil(total / limit);
const hasNextPage = offset + limit < total;
const hasPreviousPage = offset > 0;
```

---

## 5. Sorting Options

### 5.1 Tax Documents Sorting
- `createdAt` - Document creation date (default)
- `taxYear` - Tax year  
- `totalAmountCents` - Document amount
- `filingStatus` - Filing status

### 5.2 Tax Form Jobs Sorting  
- `createdAt` - Job creation date (default)
- `startedAt` - Job start time
- `completedAt` - Job completion time
- `taxYear` - Associated tax year

**Example Usage:**
```typescript
// Get recent 1099 forms for current tax year
const { data } = trpc.taxCompliance.getTaxDocuments.useQuery({
  taxYear: 2024,
  documentType: 'FORM_1099_NEC',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  limit: 25
});
```

---

## 6. Real-time Updates

### 6.1 Job Status Polling
Tax form generation jobs run in the background. Poll job status for UI updates:

```typescript
// Poll job status every 2 seconds
const { data: jobStatus } = trpc.taxCompliance.getTaxFormJobStatus.useQuery(
  { jobId: job.id },
  {
    refetchInterval: jobStatus?.status === 'RUNNING' ? 2000 : false,
    refetchIntervalInBackground: false,
  }
);
```

### 6.2 Automatic Threshold Updates
Payment thresholds update automatically when royalty payments are processed. Consider periodic refetching for threshold status:

```typescript
// Refetch threshold status periodically during active periods
const { data: thresholdStatus } = trpc.taxCompliance.checkThresholdStatus.useQuery(
  { creatorId, taxYear: 2024 },
  { 
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true 
  }
);
```

---

## 7. File Download Handling

### 7.1 PDF Document Access
Generated tax documents are stored in S3. Access via storage keys:

```typescript
// After document generation
const { data: result } = await generateDocument.mutateAsync({
  documentId: document.id
});

// PDF info returned
const pdfInfo = result.pdfInfo;
console.log('Storage Key:', pdfInfo.storageKey); // e.g., 'tax-docs/2024/creator-123/1099-nec-abc123.pdf'
console.log('File Size:', pdfInfo.fileSize);     // Bytes
```

### 7.2 Download URL Generation
Use the file management module to generate signed download URLs:

```typescript
// Get download URL for tax document PDF
const downloadUrl = await trpc.fileManagement.getDownloadUrl.mutate({
  key: pdfInfo.storageKey,
  expiresIn: 3600 // 1 hour
});
```

---

## 8. Business Rules Summary

### 8.1 Tax Year Validation
- **Range:** 2020-2050 
- **Current Year Processing:** Documents for current year update in real-time
- **Historical Years:** Read-only access to finalized documents

### 8.2 Form 1099 Thresholds
- **US Threshold:** $600 (60,000 cents) for Form 1099-NEC
- **Automatic Tracking:** Thresholds update with each royalty payment
- **Multiple Jurisdictions:** Separate thresholds per jurisdiction

### 8.3 Document States
- `PENDING` - Document record created, PDF not generated
- `GENERATED` - PDF created and stored
- `DELIVERED` - Sent to creator/recipient  
- `FILED` - Submitted to tax authorities
- `CORRECTED` - Correction issued (original remains)
- `VOIDED` - Document cancelled

### 8.4 Access Control Rules

**Creators can:**
- View their own tax documents
- Check their own threshold status
- Generate PDFs for their own documents
- Validate their own tax compliance

**Admins can:**
- Access all creator tax data
- Run batch tax form generation
- View system-wide statistics
- Manage correction documents
- Execute administrative operations

---

**Continue to [Part 2: TypeScript Types & Schemas](./TAX_COMPLIANCE_INTEGRATION_GUIDE_PART_2_TYPES.md)**
