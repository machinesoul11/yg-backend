# Report Generation Module - Frontend Integration Guide
## Part 1: API Endpoints & Request/Response Schemas

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

**Last Updated:** October 17, 2025  
**Module:** Report Generation Service  
**Backend Repo:** yg-backend  
**Frontend Repo:** yesgoddess-web

---

## Table of Contents

1. [Overview](#overview)
2. [Base Configuration](#base-configuration)
3. [Core API Endpoints](#core-api-endpoints)
4. [Query Endpoints](#query-endpoints)
5. [Mutation Endpoints](#mutation-endpoints)
6. [Request/Response Schemas](#requestresponse-schemas)

---

## Overview

The Report Generation module provides comprehensive financial reporting capabilities including:

- **PDF/CSV/Excel Report Generation** - Generate professional reports in multiple formats
- **Custom Report Builder** - Ad-hoc report creation with intelligent defaults
- **Scheduled Reports** - Automated report generation and delivery
- **Report Templates** - Pre-configured reports (monthly, quarterly, annual)
- **Secure Downloads** - Time-limited, authenticated download URLs
- **Email Delivery** - Automated report distribution to recipients

**Architecture:** tRPC-based API with background job processing (BullMQ)

---

## Base Configuration

### API Base URL

```typescript
// Development
const API_URL = 'http://localhost:3000/api/trpc';

// Production
const API_URL = 'https://ops.yesgoddess.agency/api/trpc';
```

### Authentication

All endpoints require JWT authentication via session cookie or Bearer token.

```typescript
// Headers required for all requests
{
  'Authorization': 'Bearer <JWT_TOKEN>', // If using token auth
  'Content-Type': 'application/json'
}

// Or use cookie-based auth (recommended)
// Session cookie: next-auth.session-token
```

### tRPC Router Path

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { ReportsRouter } from '@/server/routers/reports';

const client = createTRPCProxyClient<ReportsRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/reports`,
      headers: () => ({
        Authorization: `Bearer ${getToken()}`,
      }),
    }),
  ],
});
```

---

## Core API Endpoints

### 1. Revenue Reporting

#### `GET /api/trpc/reports.getRevenue`
Platform revenue reporting with time-series data and breakdowns.

**Request Schema:**
```typescript
interface RevenueReportRequest {
  startDate: Date;
  endDate: Date;
  granularity?: 'daily' | 'weekly' | 'monthly'; // Default: 'daily'
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
  }>;
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    filters?: Record<string, any>;
  };
}
```

**Validation Rules:**
- `startDate` must be before `endDate`
- Maximum date range: 2 years (730 days)
- Granularity auto-adjusts based on range:
  - ≤ 31 days → daily
  - ≤ 92 days → weekly
  - > 92 days → monthly

**Example Request:**
```typescript
const revenueReport = await client.reports.getRevenue.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-03-31'),
  granularity: 'monthly',
  filters: {
    brandIds: ['brand_123', 'brand_456'],
    licenseTypes: ['EXCLUSIVE', 'NON_EXCLUSIVE']
  }
});
```

---

### 2. Payout Summary

#### `GET /api/trpc/reports.getPayouts`
Creator payout tracking with status breakdowns.

**Request Schema:**
```typescript
interface PayoutSummaryRequest {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed'; // Default: 'all'
  creatorId?: string;
  limit?: number; // Min: 1, Max: 100, Default: 20
  offset?: number; // Min: 0, Default: 0
}
```

**Response Schema:**
```typescript
interface PayoutSummaryResponse {
  summary: {
    totalPayoutsCents: number;
    payoutCount: number;
    averagePayoutCents: number;
    pendingPayoutsCents: number;
  };
  statusBreakdown: Array<{
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    count: number;
    totalCents: number;
  }>;
  payouts: Array<{
    id: string;
    amountCents: number;
    status: string;
    createdAt: Date;
    processedAt: Date | null;
    failedReason: string | null;
    retryCount: number;
    stripeTransferId: string | null;
    creator: {
      id: string;
      name: string;
      email: string;
    };
    royaltyPeriod: {
      start: Date;
      end: Date;
    } | null;
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

**Example Request:**
```typescript
const payouts = await client.reports.getPayouts.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  status: 'completed',
  limit: 50,
  offset: 0
});
```

---

### 3. Stripe Reconciliation

#### `GET /api/trpc/reports.getReconciliation`
Financial reconciliation with Stripe payment records.

**Request Schema:**
```typescript
interface ReconciliationRequest {
  startDate: Date;
  endDate: Date;
}
```

**Response Schema:**
```typescript
interface ReconciliationResponse {
  summary: {
    periodStart: Date;
    periodEnd: Date;
    totalInternalCents: number;
    totalStripeCents: number;
    discrepancyCents: number;
    reconciliationRate: number; // 0-100 percentage
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
      matchConfidence: number;
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
      internalId: string;
      stripeId: string;
      internalAmountCents: number;
      stripeAmountCents: number;
      differenceCents: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  };
  metadata: {
    reportId: string;
    generatedAt: Date;
    generatedBy: string;
  };
}
```

**Example Request:**
```typescript
const reconciliation = await client.reports.getReconciliation.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});
```

---

### 4. Generate Custom Report

#### `POST /api/trpc/reports.generate`
Queue custom report generation with background processing.

**Request Schema:**
```typescript
interface GenerateReportRequest {
  reportType: 'revenue' | 'payouts' | 'reconciliation' | 'custom';
  parameters: Record<string, any>; // Report-specific parameters
  format?: 'pdf' | 'csv' | 'excel' | 'json'; // Default: 'pdf'
  name?: string; // Optional custom name
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
  estimatedCompletionTime: Date; // ~5 minutes from now
  message: string;
}
```

**Example Request:**
```typescript
const report = await client.reports.generate.mutate({
  reportType: 'revenue',
  parameters: {
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-03-31'),
    granularity: 'monthly',
    filters: {
      brandIds: ['brand_123']
    }
  },
  format: 'pdf',
  name: 'Q1 2025 Revenue Report',
  emailDelivery: {
    recipients: ['admin@yesgoddess.agency', 'finance@yesgoddess.agency'],
    subject: 'Q1 2025 Revenue Report Ready',
    message: 'Please find attached the Q1 revenue report.'
  }
});

// Poll for completion
const checkStatus = async () => {
  const status = await client.reports.getReportStatus.query({
    reportId: report.reportId
  });
  
  if (status.status === 'COMPLETED') {
    // Report is ready for download
    const download = await client.reports.download.query({
      reportId: report.reportId
    });
    window.location.href = download.downloadUrl;
  }
};
```

---

### 5. Download Report

#### `GET /api/trpc/reports.download`
Generate secure, time-limited download URL for completed reports.

**Request Schema:**
```typescript
interface DownloadReportRequest {
  reportId: string;
}
```

**Response Schema:**
```typescript
interface DownloadReportResponse {
  downloadUrl: string; // Time-limited URL (1 hour expiry)
  filename: string;
  expiresAt: Date;
  reportInfo: {
    id: string;
    type: string;
    generatedAt: Date;
    size: string; // e.g., "2.4 MB" or "Unknown"
  };
}
```

**Access Control:**
- User must be report creator OR have ADMIN role
- Report must be in `COMPLETED` status
- Report must not be expired (30-day retention)

**Error Cases:**
- `NOT_FOUND` (404): Report doesn't exist
- `FORBIDDEN` (403): User lacks access
- `BAD_REQUEST` (400): Report not ready or expired

**Example Request:**
```typescript
const download = await client.reports.download.query({
  reportId: 'report_abc123'
});

// Trigger browser download
window.location.href = download.downloadUrl;

// Or fetch and display
const response = await fetch(download.downloadUrl);
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
```

---

### 6. Report Status

#### `GET /api/trpc/reports.getReportStatus`
Check generation status of a report.

**Request Schema:**
```typescript
interface ReportStatusRequest {
  reportId: string;
}
```

**Response Schema:**
```typescript
interface ReportStatusResponse {
  id: string;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
  reportType: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    format: string;
    name: string;
    requestedAt: string;
    parameters: Record<string, any>;
    error?: string; // Present if status is FAILED
  };
  generatedBy: {
    name: string;
    email: string;
  };
}
```

**Example Request:**
```typescript
const status = await client.reports.getReportStatus.query({
  reportId: 'report_abc123'
});

if (status.status === 'FAILED') {
  console.error('Report generation failed:', status.metadata.error);
}
```

---

### 7. Scheduled Reports Management

#### `GET /api/trpc/reports.getScheduled`
List and manage scheduled reports.

**Request Schema:**
```typescript
interface ScheduledReportsRequest {
  isActive?: boolean; // Filter by active status
  reportType?: string; // Filter by report type
  limit?: number; // Min: 1, Max: 100, Default: 20
  offset?: number; // Min: 0, Default: 0
}
```

**Response Schema:**
```typescript
interface ScheduledReportsResponse {
  summary: {
    totalScheduled: number;
    activeCount: number;
    nextExecution: Date | null;
  };
  scheduledReports: Array<{
    id: string;
    name: string;
    reportType: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
    cronExpression: string;
    recipients: string[]; // Email addresses
    isActive: boolean;
    lastGeneratedAt: Date | null;
    nextScheduledAt: Date | null;
    parameters: {
      filters: Record<string, any>;
      formats: ('CSV' | 'EXCEL' | 'PDF')[];
      deliveryOptions: {
        emailDelivery: boolean;
        secureDownload: boolean;
        attachToEmail: boolean;
        downloadExpiration: number; // Hours
      };
      schedule: {
        dayOfWeek?: number; // 0-6 (Sunday-Saturday)
        dayOfMonth?: number; // 1-31
        hour: number; // 0-23
        minute: number; // 0-59
        timezone: string; // e.g., 'America/New_York'
      };
    };
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    recentReports: Array<{
      id: string;
      status: string;
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

**Example Request:**
```typescript
const scheduled = await client.reports.getScheduled.query({
  isActive: true,
  limit: 10,
  offset: 0
});
```

---

### 8. Report Templates

#### `GET /api/trpc/reports.getTemplates`
Get available pre-configured report templates.

**Request Schema:**
```typescript
// No parameters required
```

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
    sections: Array<{
      id: string;
      title: string;
      description: string;
      type: 'summary' | 'timeseries' | 'breakdown' | 'comparison' | 'table' | 'chart';
      required: boolean;
    }>;
    dataRequirements: string[];
    estimatedGenerationTime: string;
    supportedFormats: ('pdf' | 'csv' | 'excel')[];
    accessLevel: ('ADMIN' | 'CREATOR' | 'BRAND')[];
  }>;
  total: number;
}
```

**Example Request:**
```typescript
const templates = await client.reports.getTemplates.query();

// Filter for admin-only templates
const adminTemplates = templates.templates.filter(t => 
  t.accessLevel.includes('ADMIN')
);
```

---

### 9. Generate from Template

#### `POST /api/trpc/reports.generateFromTemplate`
Generate a report using a pre-configured template.

**Request Schema:**
```typescript
interface GenerateFromTemplateRequest {
  templateId: string;
  parameters: {
    period?: {
      startDate?: Date;
      endDate?: Date;
      month?: number; // 0-11
      quarter?: number; // 1-4
      year?: number;
    };
    userId?: string; // For user-specific reports
    filters?: Record<string, any>;
    format?: 'pdf' | 'csv' | 'excel'; // Default: 'pdf'
  };
}
```

**Response Schema:**
```typescript
interface GenerateFromTemplateResponse {
  reportId: string;
  status: 'queued';
  message: string;
}
```

**Example Request:**
```typescript
// Generate monthly operational report for January 2025
const report = await client.reports.generateFromTemplate.mutate({
  templateId: 'monthly_operational',
  parameters: {
    period: {
      month: 0, // January
      year: 2025
    },
    format: 'pdf'
  }
});
```

---

### 10. Custom Report Builder - Get Fields

#### `GET /api/trpc/reports.getCustomBuilderFields`
Get available fields for custom report builder based on data source.

**Request Schema:**
```typescript
interface CustomBuilderFieldsRequest {
  dataSource: 'transactions' | 'royalties' | 'licenses' | 'assets' | 'creators' | 'brands';
}
```

**Response Schema:**
```typescript
interface CustomBuilderFieldsResponse {
  dataSource: string;
  fields: Array<{
    field: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    category: string;
    aggregatable: boolean; // Can use SUM, AVG, etc.
    groupable: boolean; // Can use in GROUP BY
    filterable: boolean; // Can use in WHERE
    description?: string;
  }>;
  total: number;
}
```

**Example Request:**
```typescript
const fields = await client.reports.getCustomBuilderFields.query({
  dataSource: 'transactions'
});

// Filter aggregatable fields for metrics
const metrics = fields.fields.filter(f => f.aggregatable);
```

---

### 11. Custom Report Builder - Get Defaults

#### `GET /api/trpc/reports.getCustomBuilderDefaults`
Get intelligent defaults for a report category.

**Request Schema:**
```typescript
interface CustomBuilderDefaultsRequest {
  category: 'financial' | 'operational' | 'creator_performance' | 'brand_campaign' | 'asset_portfolio' | 'license_analytics';
}
```

**Response Schema:**
```typescript
interface CustomBuilderDefaultsResponse {
  category: string;
  defaults: {
    dataSource: {
      primaryEntity: string;
      dateRange: {
        startDate: Date;
        endDate: Date;
      };
    };
    metrics: Array<{
      field: string;
      aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count';
      label: string;
      format: 'currency' | 'number' | 'percentage';
    }>;
    groupBy?: Array<{
      field: string;
      granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
      label: string;
    }>;
    sorting?: {
      field: string;
      direction: 'asc' | 'desc';
    };
  };
}
```

**Example Request:**
```typescript
const defaults = await client.reports.getCustomBuilderDefaults.query({
  category: 'financial'
});

// Use defaults as starting point for custom report
const config = {
  ...defaults.defaults,
  name: 'Custom Financial Report',
  // Customize as needed
};
```

---

### 12. Validate Custom Report

#### `POST /api/trpc/reports.validateCustomReport`
Validate custom report configuration before generation.

**Request Schema:**
```typescript
interface ValidateCustomReportRequest {
  config: CustomReportConfig; // See Part 2 for full schema
}
```

**Response Schema:**
```typescript
interface ValidateCustomReportResponse {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
  suggestions?: Array<{
    field: string;
    message: string;
    suggestion: any;
  }>;
}
```

**Example Request:**
```typescript
const validation = await client.reports.validateCustomReport.mutate({
  config: customReportConfig
});

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  // Display errors to user
}
```

---

### 13. Generate Custom Report

#### `POST /api/trpc/reports.generateCustomReport`
Generate a custom report with validated configuration.

**Request Schema:**
```typescript
interface GenerateCustomReportRequest {
  config: CustomReportConfig; // See Part 2 for full schema
}
```

**Response Schema:**
```typescript
interface GenerateCustomReportResponse {
  reportId: string;
  status: 'queued';
  message: string;
}
```

**Example Request:**
```typescript
// First validate
const validation = await client.reports.validateCustomReport.mutate({
  config: myConfig
});

if (validation.valid) {
  // Then generate
  const report = await client.reports.generateCustomReport.mutate({
    config: myConfig
  });
  
  // Poll for completion
  pollReportStatus(report.reportId);
}
```

---

### 14. Save Custom Report Configuration

#### `POST /api/trpc/reports.saveCustomReportConfig`
Save custom report configuration for reuse.

**Request Schema:**
```typescript
interface SaveCustomReportConfigRequest {
  config: CustomReportConfig;
  isPublic?: boolean; // Default: false (private to user)
  tags?: string[];
}
```

**Response Schema:**
```typescript
interface SaveCustomReportConfigResponse {
  success: boolean;
  savedConfig: {
    id: string;
    userId: string;
    name: string;
    description?: string;
    config: CustomReportConfig;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    tags: string[];
  };
}
```

**Example Request:**
```typescript
const saved = await client.reports.saveCustomReportConfig.mutate({
  config: myConfig,
  isPublic: false,
  tags: ['financial', 'monthly', 'executive']
});
```

---

### 15. List Saved Configurations

#### `GET /api/trpc/reports.getSavedConfigs`
Retrieve user's saved report configurations.

**Request Schema:**
```typescript
// No parameters required
```

**Response Schema:**
```typescript
interface SavedConfigsResponse {
  configs: Array<{
    id: string;
    userId: string;
    name: string;
    description?: string;
    config: CustomReportConfig;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt?: Date;
    usageCount: number;
    tags: string[];
  }>;
  total: number;
}
```

**Example Request:**
```typescript
const savedConfigs = await client.reports.getSavedConfigs.query();

// Use a saved config
const report = await client.reports.generateCustomReport.mutate({
  config: savedConfigs.configs[0].config
});
```

---

### 16. Get Report Types

#### `GET /api/trpc/reports.getReportTypes`
Get available report types and their capabilities.

**Request Schema:**
```typescript
// No parameters required
```

**Response Schema:**
```typescript
interface ReportTypesResponse {
  reportTypes: Array<{
    type: string;
    name: string;
    description: string;
    supportedFormats: ('pdf' | 'csv' | 'excel' | 'json')[];
    estimatedGenerationTime: string;
    availableFilters: string[];
  }>;
  capabilities: {
    maxDateRange: string; // e.g., "2 years"
    supportedFormats: ('pdf' | 'csv' | 'excel' | 'json')[];
    schedulingAvailable: boolean;
    realTimeGeneration: boolean;
    backgroundProcessing: boolean;
    auditTrail: boolean;
    downloadExpiration: string; // e.g., "30 days"
  };
}
```

**Example Request:**
```typescript
const reportTypes = await client.reports.getReportTypes.query();

// Display available report types in UI
reportTypes.reportTypes.forEach(type => {
  console.log(`${type.name}: ${type.description}`);
  console.log(`Formats: ${type.supportedFormats.join(', ')}`);
});
```

---

## Query Parameters & Pagination

### Standard Pagination

All paginated endpoints support these parameters:

```typescript
interface PaginationParams {
  limit?: number; // Min: 1, Max: 100, Default: 20
  offset?: number; // Min: 0, Default: 0
}

interface PaginationResponse {
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}
```

### Date Range Filtering

```typescript
interface DateRangeParams {
  startDate: Date;
  endDate: Date;
}

// Validation
// - startDate < endDate
// - Maximum range varies by endpoint (typically 2 years)
```

### Status Filtering

```typescript
type ReportStatus = 'GENERATING' | 'COMPLETED' | 'FAILED';
type PayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
type ScheduledStatus = boolean; // isActive
```

---

## Authentication Requirements

### Required for All Endpoints

- Valid JWT token in `Authorization` header OR
- Valid session cookie (`next-auth.session-token`)

### Role-Based Access

| Endpoint | Required Role | Notes |
|----------|--------------|-------|
| `getRevenue` | ADMIN | Platform-wide revenue data |
| `getPayouts` | ADMIN | Creator payout information |
| `getReconciliation` | ADMIN | Financial reconciliation |
| `generate` | ADMIN | Custom report generation |
| `download` | ADMIN or OWNER | Must be report creator or admin |
| `getReportStatus` | ADMIN or OWNER | Must be report creator or admin |
| `getScheduled` | ADMIN | Scheduled report management |
| `getTemplates` | ADMIN, CREATOR, BRAND | Filtered by role |
| `generateFromTemplate` | ADMIN, CREATOR, BRAND | Template-specific access |
| `getCustomBuilderFields` | ADMIN | Custom report builder |
| `getCustomBuilderDefaults` | ADMIN | Custom report builder |
| `validateCustomReport` | ADMIN | Custom report builder |
| `generateCustomReport` | ADMIN | Custom report builder |
| `saveCustomReportConfig` | ADMIN | Custom report builder |
| `getSavedConfigs` | ADMIN | Custom report builder |
| `getReportTypes` | ADMIN | Report capabilities |

---

## Response Status Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid parameters, validation failed |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Report/resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## Rate Limiting

**Current Limits:**
- Report Generation: 10 requests per minute per user
- Query Endpoints: 60 requests per minute per user
- Download Endpoints: 30 requests per minute per user

**Headers:**
```typescript
// Response headers
{
  'X-RateLimit-Limit': '10',
  'X-RateLimit-Remaining': '7',
  'X-RateLimit-Reset': '1634567890' // Unix timestamp
}
```

**Handling Rate Limits:**
```typescript
const generateReport = async () => {
  try {
    return await client.reports.generate.mutate(params);
  } catch (error) {
    if (error.code === 'TOO_MANY_REQUESTS') {
      const resetTime = error.headers['X-RateLimit-Reset'];
      const waitMs = (resetTime * 1000) - Date.now();
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return generateReport();
    }
    throw error;
  }
};
```

---

## Next Steps

Continue to:
- **[Part 2: TypeScript Types, Business Logic & Error Handling →](./REPORT_GENERATION_INTEGRATION_PART_2_TYPES_AND_LOGIC.md)**
- **[Part 3: Implementation Guide & Best Practices →](./REPORT_GENERATION_INTEGRATION_PART_3_IMPLEMENTATION.md)**

---

## Support

For questions or issues:
- Backend Developer: Review this documentation
- API Issues: Check backend logs and error responses
- Integration Help: Refer to tRPC documentation and React Query guides
