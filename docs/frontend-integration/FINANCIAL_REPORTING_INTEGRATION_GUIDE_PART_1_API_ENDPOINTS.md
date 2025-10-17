# 🔒 Financial Reporting API - Frontend Integration Guide (Part 1: API Endpoints)

**Classification: 🔒 ADMIN ONLY**

## Overview

The Financial Reporting API provides comprehensive financial analytics and reporting capabilities for YesGoddess platform administrators. This module generates revenue reports, payout summaries, tax document management, Stripe reconciliation, and custom financial reports.

**Base Path:** `https://ops.yesgoddess.agency/api/trpc/reports.*`  
**Authentication:** All endpoints require admin authentication via JWT token  
**Access Control:** Admin role required for all operations

---

## 1. API Endpoints

All endpoints are accessed via tRPC at the base URL with the following structure:
```typescript
const API_BASE = 'https://ops.yesgoddess.agency/api/trpc/reports';
```

### 1.1 GET Revenue Report (`reports.getRevenue`)

**tRPC Procedure:** `reports.getRevenue`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Generate comprehensive platform revenue analysis with time-series data, breakdowns by category, and growth metrics.

#### Input Schema
```typescript
interface RevenueReportInput {
  startDate: Date;                          // Report period start
  endDate: Date;                           // Report period end (max 2 years from start)
  granularity?: 'daily' | 'weekly' | 'monthly';  // Auto-calculated based on date range
  filters?: {
    brandIds?: string[];                   // Filter by specific brands
    licenseTypes?: string[];               // Filter by license types
    regions?: string[];                    // Filter by geographic regions
  };
}
```

#### Response Schema
```typescript
interface RevenueReportResponse {
  summary: {
    totalRevenueCents: number;             // Total revenue in cents
    averageRevenuePerPeriod: number;       // Average per time period
    transactionCount: number;              // Total transaction count
    growthRatePercent: number;             // Growth vs previous period
    period: {
      startDate: Date;
      endDate: Date;
      granularity: 'daily' | 'weekly' | 'monthly';
    };
  };
  timeSeries: Array<{
    period: string;                        // "2025-01" or "2025-01-15"
    revenueCents: number;
    transactionCount: number;
    uniqueBrands: number;
    averageTransactionCents: number;
  }>;
  breakdown: {
    byMonth: Array<{
      month: string;                       // "2025-01"
      revenueCents: number;
      growth: number;                      // Percentage growth
    }>;
    byLicenseType: Array<{
      type: string;                        // "COMMERCIAL", "EDITORIAL"
      revenueCents: number;
      percentage: number;                  // Percentage of total
    }>;
    byAssetType: Array<{
      type: string;                        // "PHOTO", "VIDEO", "AUDIO"
      revenueCents: number;
      percentage: number;
    }>;
    byRegion: Array<{
      region: string;                      // "US", "EU", "APAC"
      revenueCents: number;
      percentage: number;
    }>;
  };
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    filters?: RevenueReportFilters;
  };
}
```

#### Usage Example
```typescript
const revenueReport = await trpc.reports.getRevenue.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  granularity: 'daily',
  filters: {
    brandIds: ['brand_123'],
    licenseTypes: ['COMMERCIAL']
  }
});
```

---

### 1.2 GET Payout Summary (`reports.getPayouts`)

**tRPC Procedure:** `reports.getPayouts`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Generate comprehensive payout tracking with creator details, status analysis, and payment metrics.

#### Input Schema
```typescript
interface PayoutSummaryInput {
  startDate: Date;                         // Report period start
  endDate: Date;                          // Report period end
  status?: 'all' | 'pending' | 'completed' | 'failed';  // Filter by status
  creatorId?: string;                     // Filter by specific creator
  limit?: number;                         // Default: 20, Max: 100
  offset?: number;                        // Default: 0
}
```

#### Response Schema
```typescript
interface PayoutSummaryResponse {
  summary: {
    totalPayoutsCents: number;             // Total payouts processed
    payoutCount: number;                   // Number of payouts
    averagePayoutCents: number;            // Average payout amount
    pendingPayoutsCents: number;           // Amount still pending
  };
  statusBreakdown: Array<{
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING';
    count: number;                         // Number of payouts
    totalCents: number;                    // Total amount
  }>;
  payouts: Array<{
    id: string;
    amountCents: number;
    status: PayoutStatus;
    createdAt: Date;
    processedAt?: Date;
    failedReason?: string;
    retryCount: number;
    stripeTransferId?: string;
    creator: {
      id: string;
      name: string;
      email: string;
    };
    royaltyPeriod?: {
      start: Date;
      end: Date;
    };
  }>;
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    filters: {
      status: string;
      creatorId?: string;
    };
  };
}
```

#### Usage Example
```typescript
const payoutSummary = await trpc.reports.getPayouts.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  status: 'completed',
  limit: 50
});
```

---

### 1.3 GET Tax Documents (`reports.getTaxDocuments`)

**tRPC Procedure:** `reports.getTaxDocuments`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Retrieve and analyze tax document generation status, compliance tracking, and filing statistics.

#### Input Schema
```typescript
interface TaxDocumentsInput {
  taxYear?: number;                        // Filter by tax year
  documentType?: '1099' | '1099-misc' | 'vat' | 'all';  // Default: 'all'
  limit?: number;                         // Default: 20, Max: 100
  offset?: number;                        // Default: 0
}
```

#### Response Schema
```typescript
interface TaxDocumentsResponse {
  summary: {
    totalDocuments: number;
    yearBreakdown: Record<string, {        // Year as key
      count: number;
      totalEarningsCents: number;
      types: Record<string, {              // Document type as key
        count: number;
        totalEarningsCents: number;
      }>;
    }>;
  };
  documents: Array<{
    id: string;
    documentType: 'FORM_1099_NEC' | 'FORM_1099_MISC' | 'W8_BEN' | 'W8_BEN_E';
    taxYear: number;
    totalEarningsCents: number;
    status: 'PENDING' | 'GENERATED' | 'FILED' | 'AMENDED';
    generatedAt?: Date;
    filedAt?: Date;
    storageKey: 'available' | 'not_generated';
    creator: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    availableYears: number[];              // Available tax years
  };
}
```

#### Usage Example
```typescript
const taxDocuments = await trpc.reports.getTaxDocuments.query({
  taxYear: 2024,
  documentType: '1099',
  limit: 50
});
```

---

### 1.4 GET Stripe Reconciliation (`reports.getReconciliation`)

**tRPC Procedure:** `reports.getReconciliation`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Generate comprehensive Stripe payment reconciliation with discrepancy detection and transaction matching.

#### Input Schema
```typescript
interface ReconciliationInput {
  startDate: Date;                         // Report period start
  endDate: Date;                          // Report period end
}
```

#### Response Schema
```typescript
interface ReconciliationResponse {
  summary: {
    periodStart: Date;
    periodEnd: Date;
    totalInternalCents: number;            // Internal system total
    totalStripeCents: number;              // Stripe reported total
    discrepancyCents: number;              // Difference amount
    reconciliationRate: number;           // Percentage matched (0-100)
    matchedCount: number;                  // Matched transactions
    unmatchedInternalCount: number;        // Unmatched internal
    unmatchedStripeCount: number;          // Unmatched Stripe
    discrepancyCount: number;              // Discrepancies found
  };
  reconciliation: {
    matchedTransactions: Array<{
      internalId: string;
      stripeId: string;
      amountCents: number;
      matchConfidence: number;             // 0-100
      matchedAt: Date;
    }>;
    unmatchedInternal: Array<{
      id: string;
      amountCents: number;
      type: string;
      createdAt: Date;
      reason: string;                      // Why it couldn't be matched
    }>;
    unmatchedStripe: Array<{
      id: string;
      amountCents: number;
      type: string;
      createdAt: Date;
      reason: string;
    }>;
    discrepancies: Array<{
      internalId: string;
      stripeId: string;
      internalAmountCents: number;
      stripeAmountCents: number;
      discrepancyCents: number;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      explanation: string;
    }>;
  };
  metadata: {
    reportId: string;
    generatedAt: Date;
    generatedBy: string;
  };
}
```

#### Usage Example
```typescript
const reconciliation = await trpc.reports.getReconciliation.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});
```

---

### 1.5 POST Generate Custom Report (`reports.generate`)

**tRPC Procedure:** `reports.generate`  
**Type:** Mutation  
**Auth Required:** Yes (Admin only)

#### Purpose
Queue generation of custom financial reports with background processing and PDF/CSV export.

#### Input Schema
```typescript
interface GenerateReportInput {
  reportType: 'revenue' | 'payouts' | 'tax' | 'reconciliation' | 'custom';
  parameters: Record<string, any>;        // Report-specific parameters
  format?: 'pdf' | 'csv' | 'excel' | 'json';  // Default: 'pdf'
  name?: string;                          // Custom report name
}
```

#### Response Schema
```typescript
interface GenerateReportResponse {
  reportId: string;                       // Unique report identifier
  status: 'GENERATING';                   // Initial status
  estimatedCompletionTime: Date;          // Estimated completion
  message: string;                        // Status message
}
```

#### Usage Example
```typescript
const reportJob = await trpc.reports.generate.mutate({
  reportType: 'revenue',
  parameters: {
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    includeBreakdowns: true
  },
  format: 'pdf',
  name: 'Q1 2025 Revenue Analysis'
});
```

---

### 1.6 GET Download Report (`reports.download`)

**tRPC Procedure:** `reports.download`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Generate secure download URLs for completed reports with expiration and audit tracking.

#### Input Schema
```typescript
interface DownloadReportInput {
  reportId: string;                       // Report to download
}
```

#### Response Schema
```typescript
interface DownloadReportResponse {
  downloadUrl: string;                    // Secure download URL
  filename: string;                       // Suggested filename
  expiresAt: Date;                       // URL expiration time
  reportInfo: {
    id: string;
    type: string;
    generatedAt: Date;
    size: string;                         // File size
  };
}
```

#### Usage Example
```typescript
const downloadInfo = await trpc.reports.download.query({
  reportId: 'report_abc123'
});

// Use the downloadUrl to initiate download
window.open(downloadInfo.downloadUrl, '_blank');
```

---

### 1.7 GET Scheduled Reports (`reports.getScheduled`)

**tRPC Procedure:** `reports.getScheduled`  
**Type:** Query  
**Auth Required:** Yes (Admin only)

#### Purpose
Manage and view scheduled recurring financial reports with execution history.

#### Input Schema
```typescript
interface ScheduledReportsInput {
  isActive?: boolean;                     // Filter by active status
  reportType?: string;                    // Filter by report type
  limit?: number;                         // Default: 20, Max: 100
  offset?: number;                        // Default: 0
}
```

#### Response Schema
```typescript
interface ScheduledReportsResponse {
  summary: {
    totalScheduled: number;
    activeCount: number;
    nextExecution?: Date;                  // Next scheduled execution
  };
  scheduledReports: Array<{
    id: string;
    name: string;
    reportType: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    cronExpression: string;
    recipients: string[];                  // Email recipients
    isActive: boolean;
    lastGeneratedAt?: Date;
    nextScheduledAt?: Date;
    parameters: Record<string, any>;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    recentReports: Array<{
      id: string;
      status: 'COMPLETED' | 'FAILED' | 'GENERATING';
      generatedAt: Date;
    }>;
  }>;
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  metadata: {
    generatedAt: Date;
    requestedBy: string;
  };
}
```

#### Usage Example
```typescript
const scheduledReports = await trpc.reports.getScheduled.query({
  isActive: true,
  limit: 20
});
```

---

## 2. Query Parameters & Filters

### 2.1 Date Range Validation
- **Maximum Range:** 2 years between startDate and endDate
- **Format:** ISO 8601 date strings or Date objects
- **Validation:** endDate must be >= startDate

### 2.2 Pagination
- **Standard Pattern:** limit (max 100) and offset parameters
- **Response:** Includes hasMore flag and total count

### 2.3 Status Filters
```typescript
type PayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING';
type ReportStatus = 'GENERATING' | 'COMPLETED' | 'FAILED';
type TaxDocumentStatus = 'PENDING' | 'GENERATED' | 'FILED' | 'AMENDED';
```

---

## 3. Authentication & Headers

### 3.1 Required Headers
```typescript
{
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

### 3.2 Session Requirements
- Valid admin session with role: 'ADMIN'
- Active JWT token with appropriate permissions
- Rate limiting applies per user

---

## 4. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|---------|
| `getRevenue` | 10 requests | 1 minute |
| `getPayouts` | 20 requests | 1 minute |
| `getTaxDocuments` | 15 requests | 1 minute |
| `getReconciliation` | 5 requests | 1 minute |
| `generate` | 3 requests | 5 minutes |
| `download` | 50 requests | 1 minute |
| `getScheduled` | 10 requests | 1 minute |

### Rate Limit Headers
```typescript
'X-RateLimit-Limit': '10'
'X-RateLimit-Remaining': '7'
'X-RateLimit-Reset': '1640995200'
```

---

## 5. Background Processing

### 5.1 Report Generation Flow
1. Submit generation request → Immediate response with reportId
2. Report queued for background processing
3. Poll status or wait for completion notification
4. Download completed report using reportId

### 5.2 Job Status Tracking
```typescript
type JobStatus = 'GENERATING' | 'COMPLETED' | 'FAILED';

// Check status (not implemented yet - future feature)
const status = await trpc.reports.getJobStatus.query({ reportId });
```

---

## 6. File Downloads

### 6.1 Supported Formats
- **PDF:** Formatted reports with charts and branding
- **CSV:** Raw data export for analysis
- **Excel:** Structured spreadsheet with multiple sheets
- **JSON:** Raw data for programmatic processing

### 6.2 Download Security
- Signed URLs with 1-hour expiration
- Audit trail for all downloads
- User access verification

### 6.3 File Retention
- Reports retained for 30 days after generation
- Automatic cleanup of expired reports
- Storage in secure cloud infrastructure

---

## 7. Implementation Checklist

- [ ] Set up tRPC client configuration
- [ ] Implement authentication middleware
- [ ] Create TypeScript interfaces
- [ ] Build revenue report dashboard
- [ ] Implement payout tracking interface
- [ ] Add tax document management
- [ ] Create reconciliation viewer
- [ ] Build report generation queue
- [ ] Implement download management
- [ ] Add scheduled reports interface
- [ ] Set up error handling
- [ ] Implement rate limit handling
- [ ] Add loading states for background jobs
- [ ] Create report preview functionality
- [ ] Implement export functionality

---

## Next Steps

Continue to **Part 2: TypeScript Types & Business Logic** for complete type definitions, validation schemas, and business rule implementation details.
