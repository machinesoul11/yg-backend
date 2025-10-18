# 🔒 Report Generation Module - Frontend Integration Guide (Part 1: API Endpoints)

**Module:** Report Generation Service  
**Classification:** 🔒 ADMIN ONLY (with limited creator/brand access for own data)  
**Last Updated:** October 17, 2025  
**Backend Deployment:** ops.yesgoddess.agency  
**Frontend Integration:** yesgoddess-web (Next.js 15 + App Router)

---

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Request/Response Schemas](#requestresponse-schemas)
- [Pagination & Filtering](#pagination--filtering)
- [Rate Limiting](#rate-limiting)

---

## Overview

The Report Generation module provides comprehensive business intelligence and reporting capabilities with:

- **PDF, CSV, Excel, and JSON exports**
- **Pre-defined report templates** (monthly, quarterly, annual, tax compliance)
- **Custom report builder** with drag-and-drop field selection
- **Scheduled recurring reports** with email delivery
- **Background job processing** for large reports
- **Secure time-limited download URLs**
- **Audit trail tracking** for compliance

### Key Features

✅ Generate financial, operational, and compliance reports  
✅ Template-based reports with intelligent defaults  
✅ Ad-hoc custom reports without developer intervention  
✅ Scheduled reports with cron-like scheduling  
✅ Multi-format export (PDF, CSV, Excel, JSON)  
✅ Email delivery with secure download links  
✅ Row-level security (users only see their own data)  
✅ Background processing for large datasets  

---

## Authentication

### Required Headers

All endpoints require JWT authentication via tRPC:

```typescript
// Automatically handled by tRPC client
// Session-based authentication via NextAuth.js
```

### Session Requirements

```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  };
}
```

### Authorization Matrix

| Endpoint | ADMIN | CREATOR | BRAND | VIEWER |
|----------|-------|---------|-------|--------|
| `getRevenue` | ✅ Full | ✅ Filtered | ✅ Filtered | ❌ |
| `getPayouts` | ✅ Full | ✅ Own data | ❌ | ❌ |
| `getReconciliation` | ✅ | ❌ | ❌ | ❌ |
| `generate` | ✅ Full | ✅ Own reports | ✅ Own reports | ❌ |
| `download` | ✅ Full | ✅ Own reports | ✅ Own reports | ❌ |
| `getTemplates` | ✅ All | ✅ Creator templates | ✅ Brand templates | ❌ |
| `scheduleReport` | ✅ | ✅ Own reports | ✅ Own reports | ❌ |
| `getScheduled` | ✅ Full | ✅ Own reports | ✅ Own reports | ❌ |
| `updateScheduledReport` | ✅ | ✅ Own reports | ✅ Own reports | ❌ |
| `deleteScheduledReport` | ✅ | ✅ Own reports | ✅ Own reports | ❌ |
| `customBuilder/*` | ✅ Full | ✅ Filtered | ✅ Filtered | ❌ |

---

## API Endpoints

### Base URL
```
Production: https://ops.yesgoddess.agency/api/trpc
Development: http://localhost:3000/api/trpc
```

All endpoints use **tRPC** protocol, not REST. Use the tRPC client for type-safe calls.

---

## 1. Revenue Report

### `reports.getRevenue` (query)

Generate platform revenue reports with time-series data and breakdowns.

**Input Schema:**

```typescript
interface RevenueReportInput {
  startDate: Date;
  endDate: Date;
  granularity?: 'daily' | 'weekly' | 'monthly'; // Default: auto-calculated
  filters?: {
    brandIds?: string[];
    licenseTypes?: string[];
    regions?: string[];
  };
}
```

**Response Schema:**

```typescript
interface RevenueReportResponse {
  summary: {
    totalRevenueCents: number;
    averageRevenuePerPeriod: number;
    transactionCount: number;
    growthRatePercent: number;
    period: {
      startDate: Date;
      endDate: Date;
      granularity: 'daily' | 'weekly' | 'monthly';
    };
  };
  timeSeries: Array<{
    date: Date;
    revenueCents: number;
    transactionCount: number;
    averageTransactionCents: number;
    growth?: number;
  }>;
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    filters?: RevenueFilters;
  };
}
```

**Example Usage:**

```typescript
const revenueReport = await trpc.reports.getRevenue.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  granularity: 'daily',
  filters: {
    brandIds: ['brand_123'],
    licenseTypes: ['exclusive', 'non-exclusive']
  }
});

console.log(`Total Revenue: $${revenueReport.summary.totalRevenueCents / 100}`);
```

**Validation Rules:**
- `startDate` must be before `endDate`
- Maximum date range: 2 years (730 days)
- If date range ≤ 31 days → forced to `daily`
- If date range ≤ 92 days → forced to `weekly`
- If date range > 92 days → forced to `monthly`

**Error Codes:**
- `400 BAD_REQUEST`: Invalid date range or parameters
- `401 UNAUTHORIZED`: Not authenticated
- `403 FORBIDDEN`: Insufficient permissions
- `500 INTERNAL_SERVER_ERROR`: Report generation failed

---

## 2. Payout Summary

### `reports.getPayouts` (query)

Get payout summary with creator details and status tracking.

**Input Schema:**

```typescript
interface PayoutSummaryInput {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed'; // Default: 'all'
  creatorId?: string; // Filter by specific creator
  limit?: number; // Default: 20, Max: 100
  offset?: number; // Default: 0
}
```

**Response Schema:**

```typescript
interface PayoutSummaryResponse {
  payouts: Array<{
    id: string;
    amountCents: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    createdAt: Date;
    processedAt?: Date;
    failureReason?: string;
    creator: {
      id: string;
      stageName: string;
      email: string;
      verificationStatus: string;
    };
    royaltyStatementId?: string;
    metadata: Record<string, any>;
  }>;
  summary: {
    totalPayoutsCents: number;
    completedPayoutsCents: number;
    pendingPayoutsCents: number;
    failedPayoutsCents: number;
    payoutCount: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
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

**Example Usage:**

```typescript
const payouts = await trpc.reports.getPayouts.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  status: 'completed',
  limit: 50,
  offset: 0
});

console.log(`Total Completed: $${payouts.summary.completedPayoutsCents / 100}`);
```

**Authorization Notes:**
- **ADMIN**: Can view all payouts
- **CREATOR**: Auto-filtered to `creatorId = currentUser.creator.id`
- **BRAND**: Access denied (403)

---

## 3. Reconciliation Report

### `reports.getReconciliation` (query)

Generate Stripe reconciliation report with discrepancy detection.

**🔒 ADMIN ONLY**

**Input Schema:**

```typescript
interface ReconciliationInput {
  startDate: Date;
  endDate: Date;
}
```

**Response Schema:**

```typescript
interface ReconciliationReportResponse {
  summary: {
    periodStart: Date;
    periodEnd: Date;
    totalInternalCents: number;
    totalStripeCents: number;
    discrepancyCents: number;
    reconciliationRate: number; // Percentage (0-100)
    matchedCount: number;
    unmatchedInternalCount: number;
    unmatchedStripeCount: number;
    discrepancyCount: number;
  };
  reconciliation: {
    matchedTransactions: Array<{
      internalId: string;
      stripeId: string;
      amountCents: number;
      matchedAt: Date;
    }>;
    unmatchedInternal: Array<{
      id: string;
      amountCents: number;
      createdAt: Date;
      reason: string;
    }>;
    unmatchedStripe: Array<{
      id: string;
      amountCents: number;
      createdAt: Date;
      reason: string;
    }>;
    discrepancies: Array<{
      id: string;
      type: 'amount_mismatch' | 'missing_internal' | 'missing_stripe';
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      expectedCents: number;
      actualCents: number;
      differenceCents: number;
      affectedTransactions: string[];
      suggestedActions: string[];
    }>;
  };
  metadata: {
    reportId: string;
    generatedAt: Date;
    generatedBy: string;
  };
}
```

**Example Usage:**

```typescript
const reconciliation = await trpc.reports.getReconciliation.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

if (reconciliation.summary.reconciliationRate < 95) {
  console.warn('⚠️ Reconciliation rate below 95%');
}
```

---

## 4. Generate Custom Report

### `reports.generate` (mutation)

Queue custom report generation with background processing.

**Input Schema:**

```typescript
interface GenerateReportInput {
  reportType: 'revenue' | 'payouts' | 'reconciliation' | 'custom';
  parameters: Record<string, any>; // Report-specific parameters
  format?: 'pdf' | 'csv' | 'excel' | 'json'; // Default: 'pdf'
  name?: string; // Custom report name
  emailDelivery?: {
    recipients: string[]; // Email addresses
    subject?: string;
    message?: string;
  };
}
```

**Response Schema:**

```typescript
interface GenerateReportResponse {
  reportId: string;
  jobId: string;
  status: 'GENERATING';
  estimatedCompletionTime: Date; // Usually +5 minutes
  message: string;
}
```

**Example Usage:**

```typescript
const report = await trpc.reports.generate.mutate({
  reportType: 'revenue',
  parameters: {
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    filters: {
      brandIds: ['brand_123']
    }
  },
  format: 'pdf',
  name: '2025 Annual Revenue Report',
  emailDelivery: {
    recipients: ['finance@example.com'],
    subject: 'Your 2025 Annual Revenue Report is Ready'
  }
});

// Poll for completion
const checkStatus = async () => {
  const download = await trpc.reports.download.query({ 
    reportId: report.reportId 
  });
  // Will throw if not ready yet
};
```

**Background Processing:**
- Reports are queued via **BullMQ**
- Concurrency: 2 simultaneous reports
- Retry logic: 3 attempts with exponential backoff
- Email notification sent on completion
- Files stored in **Cloudflare R2**

---

## 5. Download Report

### `reports.download` (query)

Generate secure, time-limited download URL for completed report.

**Input Schema:**

```typescript
interface DownloadReportInput {
  reportId: string;
}
```

**Response Schema:**

```typescript
interface DownloadReportResponse {
  downloadUrl: string; // Time-limited signed URL
  filename: string;
  expiresAt: Date; // Usually +1 hour
  reportInfo: {
    id: string;
    type: string;
    generatedAt: Date;
    size: string; // Human-readable (e.g., "2.4 MB")
  };
}
```

**Example Usage:**

```typescript
try {
  const download = await trpc.reports.download.query({ 
    reportId: 'report_xyz789' 
  });
  
  // Open in new tab or trigger download
  window.open(download.downloadUrl, '_blank');
  
  console.log(`Download expires at: ${download.expiresAt}`);
} catch (error) {
  if (error.code === 'BAD_REQUEST') {
    console.error('Report not ready yet');
  } else if (error.code === 'NOT_FOUND') {
    console.error('Report not found');
  } else if (error.code === 'FORBIDDEN') {
    console.error('Access denied');
  }
}
```

**Security Features:**
- Row-level access control (user must own report or be ADMIN)
- Validates report status is `COMPLETED`
- Checks report expiration (30-day retention)
- Creates audit trail via `ReportDownload` records
- Generates time-limited signed URLs (1 hour expiry)
- Tracks download activity (IP, user agent, timestamp)

**Error Codes:**
- `400 BAD_REQUEST`: Report not ready (still generating)
- `403 FORBIDDEN`: Access denied to this report
- `404 NOT_FOUND`: Report not found
- `410 GONE`: Report expired (>30 days old)

---

## 6. Get Report Templates

### `reports.getTemplates` (query)

Retrieve available report templates filtered by user role.

**Input:** None required

**Response Schema:**

```typescript
interface ReportTemplatesResponse {
  templates: Array<{
    id: string;
    name: string;
    description: string;
    category: 'temporal' | 'financial' | 'operational' | 'compliance';
    scope: 'platform' | 'creator' | 'brand';
    frequency: 'monthly' | 'quarterly' | 'annual' | 'on-demand';
    estimatedGenerationTime: string; // e.g., "30-60 seconds"
    supportedFormats: ('pdf' | 'csv' | 'excel')[];
    accessLevel: ('ADMIN' | 'CREATOR' | 'BRAND')[];
    dataRequirements: string[];
    sections: Array<{
      id: string;
      title: string;
      description: string;
      type: 'summary' | 'timeseries' | 'breakdown' | 'comparison' | 'table' | 'chart';
      required: boolean;
    }>;
  }>;
  total: number;
}
```

**Available Templates:**

| Template ID | Name | Access Level | Formats | Est. Time |
|-------------|------|--------------|---------|-----------|
| `monthly_operational` | Monthly Operational Report | ADMIN | PDF, Excel | 30-60s |
| `quarterly_strategic` | Quarterly Strategic Report | ADMIN | PDF, Excel | 2-5min |
| `annual_comprehensive` | Annual Comprehensive Report | ADMIN | PDF | 5-10min |
| `creator_earnings` | Creator Earnings Statement | ADMIN, CREATOR | PDF, CSV | 10-30s |
| `brand_campaign` | Brand Campaign Performance | ADMIN, BRAND | PDF, Excel | 20-40s |
| `tax_compliance` | Tax Compliance Report | ADMIN | PDF, CSV | 2-3min |
| `asset_portfolio` | Asset Portfolio Analysis | ADMIN, CREATOR | PDF, Excel | 30-60s |

**Example Usage:**

```typescript
const templates = await trpc.reports.getTemplates.query();

// Filter by category
const financialTemplates = templates.templates.filter(
  t => t.category === 'financial'
);

// Check user access
const userTemplates = templates.templates.filter(
  t => t.accessLevel.includes(currentUser.role)
);
```

---

## 7. Generate from Template

### `reports.generateFromTemplate` (mutation)

Generate report using pre-defined template with parameters.

**Input Schema:**

```typescript
interface GenerateFromTemplateInput {
  templateId: string;
  parameters: {
    // For monthly reports
    period?: {
      month: number; // 0-11 (JavaScript Date month)
      year: number;
    };
    // For quarterly reports
    quarter?: {
      quarter: number; // 1-4
      year: number;
    };
    // For annual reports
    year?: number;
    // Common parameters
    format?: 'pdf' | 'csv' | 'excel';
    filters?: {
      creatorIds?: string[];
      brandIds?: string[];
      assetTypes?: string[];
    };
  };
  emailDelivery?: {
    recipients: string[];
    subject?: string;
    message?: string;
  };
}
```

**Response Schema:**

```typescript
interface GenerateFromTemplateResponse {
  reportId: string;
  jobId: string;
  status: 'GENERATING';
  estimatedCompletionTime: Date;
  template: {
    id: string;
    name: string;
  };
  message: string;
}
```

**Example Usage:**

```typescript
// Generate monthly report for October 2025
const monthlyReport = await trpc.reports.generateFromTemplate.mutate({
  templateId: 'monthly_operational',
  parameters: {
    period: {
      month: 9, // October (0-indexed)
      year: 2025
    },
    format: 'pdf'
  },
  emailDelivery: {
    recipients: ['cfo@example.com']
  }
});

// Generate creator earnings statement
const earningsReport = await trpc.reports.generateFromTemplate.mutate({
  templateId: 'creator_earnings',
  parameters: {
    period: {
      month: 8,
      year: 2025
    },
    format: 'csv',
    filters: {
      creatorIds: ['creator_abc123']
    }
  }
});
```

---

## 8. Schedule Recurring Report

### `reports.scheduleReport` (mutation)

Create recurring scheduled report with automated generation and delivery.

**Input Schema:**

```typescript
interface ScheduleReportInput {
  name: string; // 1-255 chars
  description?: string;
  reportType: 'royalty_statements' | 'transaction_ledger' | 'creator_earnings' | 
               'platform_revenue' | 'payout_summary';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  recipients: string[]; // Email addresses (min 1)
  formats?: ('CSV' | 'EXCEL' | 'PDF')[]; // Default: ['PDF']
  filters?: {
    creatorIds?: string[];
    brandIds?: string[];
    assetTypes?: string[];
    licenseTypes?: string[];
    statuses?: string[];
  };
  deliveryOptions?: {
    emailDelivery?: boolean; // Default: true
    secureDownload?: boolean; // Default: true
    attachToEmail?: boolean; // Default: false
    downloadExpiration?: number; // Hours (1-720), Default: 168 (1 week)
  };
  schedule: {
    dayOfWeek?: number; // 0-6 (required for WEEKLY)
    dayOfMonth?: number; // 1-31 (required for MONTHLY+)
    monthOfQuarter?: number; // 1-3 (required for QUARTERLY)
    monthOfYear?: number; // 1-12 (required for ANNUALLY)
    hour?: number; // 0-23, Default: 9
    minute?: number; // 0-59, Default: 0
    timezone?: string; // Default: 'America/New_York'
  };
}
```

**Response Schema:**

```typescript
interface ScheduleReportResponse {
  success: boolean;
  scheduledReport: {
    id: string;
    name: string;
    reportType: string;
    frequency: string;
    cronExpression: string; // Generated cron expression
    recipients: string[];
    isActive: boolean;
    nextScheduledAt: Date;
    parameters: object;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
  };
  message: string;
}
```

**Validation Rules:**

| Frequency | Required Schedule Fields |
|-----------|-------------------------|
| `DAILY` | `hour`, `minute` |
| `WEEKLY` | `dayOfWeek`, `hour`, `minute` |
| `MONTHLY` | `dayOfMonth`, `hour`, `minute` |
| `QUARTERLY` | `monthOfQuarter`, `dayOfMonth`, `hour`, `minute` |
| `ANNUALLY` | `monthOfYear`, `dayOfMonth`, `hour`, `minute` |

**Example Usage:**

```typescript
// Monthly report on 1st day at 9 AM
const scheduled = await trpc.reports.scheduleReport.mutate({
  name: 'Monthly Creator Earnings Report',
  reportType: 'creator_earnings',
  frequency: 'MONTHLY',
  recipients: ['finance@example.com', 'admin@example.com'],
  formats: ['PDF', 'CSV'],
  schedule: {
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    timezone: 'America/New_York'
  },
  deliveryOptions: {
    emailDelivery: true,
    secureDownload: true,
    attachToEmail: false,
    downloadExpiration: 168 // 1 week
  }
});

console.log(`Next run: ${scheduled.scheduledReport.nextScheduledAt}`);
console.log(`Cron: ${scheduled.scheduledReport.cronExpression}`);
```

**Authorization:**
- Requires `ADMIN`, `CREATOR`, or `BRAND` role
- Non-admins can only schedule reports for their own data
- Returns `403 FORBIDDEN` for insufficient permissions

---

## 9. Get Scheduled Reports

### `reports.getScheduled` (query)

List all scheduled reports with filtering.

**Input Schema:**

```typescript
interface GetScheduledReportsInput {
  isActive?: boolean;
  reportType?: string;
  limit?: number; // Default: 20, Max: 100
  offset?: number; // Default: 0
}
```

**Response Schema:**

```typescript
interface GetScheduledReportsResponse {
  scheduledReports: Array<{
    id: string;
    name: string;
    description?: string;
    reportType: string;
    frequency: string;
    cronExpression: string;
    recipients: string[];
    formats: string[];
    isActive: boolean;
    nextScheduledAt: Date;
    lastRunAt?: Date;
    lastRunStatus?: 'success' | 'failed';
    createdAt: Date;
    createdBy: {
      id: string;
      name: string;
    };
    parameters: object;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

**Example Usage:**

```typescript
const scheduled = await trpc.reports.getScheduled.query({
  isActive: true,
  limit: 50,
  offset: 0
});

scheduled.scheduledReports.forEach(report => {
  console.log(`${report.name}: Next run at ${report.nextScheduledAt}`);
});
```

---

## 10. Update Scheduled Report

### `reports.updateScheduledReport` (mutation)

Update existing scheduled report configuration.

**Input Schema:**

```typescript
interface UpdateScheduledReportInput {
  id: string;
  name?: string;
  description?: string;
  recipients?: string[];
  formats?: ('CSV' | 'EXCEL' | 'PDF')[];
  isActive?: boolean; // Pause/resume
  schedule?: {
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour?: number;
    minute?: number;
    timezone?: string;
  };
  filters?: object;
  deliveryOptions?: object;
}
```

**Response Schema:**

```typescript
interface UpdateScheduledReportResponse {
  success: boolean;
  scheduledReport: {
    id: string;
    name: string;
    // ... full scheduled report object
  };
  message: string;
}
```

**Authorization:**
- User must own report or be ADMIN
- Returns `403 FORBIDDEN` if not authorized

---

## 11. Delete Scheduled Report

### `reports.deleteScheduledReport` (mutation)

Delete/deactivate scheduled report.

**Input Schema:**

```typescript
interface DeleteScheduledReportInput {
  id: string;
}
```

**Response Schema:**

```typescript
interface DeleteScheduledReportResponse {
  success: boolean;
  message: string;
}
```

**Example Usage:**

```typescript
const result = await trpc.reports.deleteScheduledReport.mutate({
  id: 'scheduled_report_xyz'
});

if (result.success) {
  console.log('Report deleted successfully');
}
```

---

## Pagination & Filtering

### Pagination Pattern

All list endpoints use **offset-based pagination**:

```typescript
interface PaginationParams {
  limit?: number; // Default: 20, Max: 100
  offset?: number; // Default: 0
}

interface PaginationResponse {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

### Available Filters

**Revenue Reports:**
- `brandIds`: Filter by brand IDs
- `licenseTypes`: Filter by license types
- `regions`: Filter by geographic regions

**Payout Reports:**
- `status`: Filter by payout status
- `creatorId`: Filter by creator ID

**Scheduled Reports:**
- `isActive`: Filter by active status
- `reportType`: Filter by report type

---

## Rate Limiting

### Current Implementation

**Per-User Quotas:**
- Custom report generation: **10 reports per hour**
- Template report generation: **20 reports per hour**
- Scheduled reports: **50 active schedules per user**
- Download requests: **100 per hour**

### Rate Limit Headers

Not currently implemented in tRPC, but recommended for production:

```typescript
// Future implementation
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1697558400
```

### Rate Limit Errors

```typescript
{
  code: 'TOO_MANY_REQUESTS',
  message: 'Report generation rate limit exceeded',
  data: {
    retryAfter: 3600, // seconds
    limit: 10,
    resetAt: new Date('2025-10-17T12:00:00Z')
  }
}
```

**Frontend Recommendations:**
- Implement retry logic with exponential backoff
- Display countdown timer for rate limit reset
- Cache report results to minimize API calls
- Use polling (not continuous requests) for report status

---

## Next Steps

Continue to:
- **[Part 2: TypeScript Types & Validation](./REPORT_GENERATION_FRONTEND_PART_2_TYPES.md)** - Complete type definitions and Zod schemas
- **[Part 3: Business Logic & Implementation Guide](./REPORT_GENERATION_FRONTEND_PART_3_IMPLEMENTATION.md)** - Business rules, error handling, and implementation checklist

---

**Questions or Issues?**  
Contact the backend team or reference the backend documentation at `/docs/REPORT_GENERATION_IMPLEMENTATION_COMPLETE.md`
