# Export & Distribution Module - Frontend Integration Guide (Part 1: API Endpoints)

> **Classification: 🔒 ADMIN ONLY** - Export & Distribution functionality is exclusively for admin staff operations

## Overview

The Export & Distribution module provides comprehensive financial data export capabilities with multiple formats (CSV, Excel, PDF), automated email delivery, scheduled report generation, and secure download management. This module handles sensitive financial data and requires admin-level authentication.

## Table of Contents

1. [Core API Endpoints](#core-api-endpoints)
2. [TypeScript Interface Definitions](#typescript-interface-definitions)
3. [Request/Response Schemas](#requestresponse-schemas)
4. [Authentication & Authorization](#authentication--authorization)
5. [Query Parameters & Filtering](#query-parameters--filtering)

---

## Core API Endpoints

### 1. Report Generation

#### `POST /api/trpc/reports.generateReport`
Generate financial reports in multiple formats with optional email delivery.

**Request Schema:**
```typescript
interface GenerateReportRequest {
  reportType: 'revenue' | 'payouts' | 'reconciliation' | 'custom';
  parameters: {
    startDate: Date;
    endDate: Date;
    filters?: {
      brandIds?: string[];
      creatorIds?: string[];
      licenseTypes?: string[];
      regions?: string[];
    };
  };
  format: 'pdf' | 'csv' | 'excel' | 'json';
  name?: string;
  emailDelivery?: {
    recipients: string[];
    subject?: string;
    message?: string;
  };
}
```

**Response Schema:**
```typescript
interface GenerateReportResponse {
  success: boolean;
  data: {
    reportId: string;
    status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
    estimatedCompletion?: string; // ISO date string
    downloadUrl?: string; // Available when status is COMPLETED
    jobId?: string; // For tracking background job
  };
  message: string;
}
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/reports.generateReport \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "reportType": "revenue",
    "parameters": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.999Z",
      "filters": {
        "brandIds": ["brand_123", "brand_456"]
      }
    },
    "format": "excel",
    "emailDelivery": {
      "recipients": ["admin@yesgoddess.com"],
      "subject": "2024 Revenue Report"
    }
  }'
```

### 2. Secure Download Management

#### `POST /api/trpc/reports.getDownloadLink`
Generate secure, time-limited download URLs for completed reports.

**Request Schema:**
```typescript
interface DownloadLinkRequest {
  reportId: string;
}
```

**Response Schema:**
```typescript
interface DownloadLinkResponse {
  success: boolean;
  data: {
    downloadUrl: string;
    filename: string;
    expiresAt: string; // ISO date string
    reportInfo: {
      id: string;
      type: string;
      generatedAt: string; // ISO date string
      size: string; // Human readable (e.g., "2.4 MB")
    };
  };
}
```

#### `GET /api/reports/download/{reportId}`
Direct download endpoint with token-based authentication.

**Query Parameters:**
- `token` (required): Secure download token
- `sig` (required): Cryptographic signature for validation

**Response:** File stream with appropriate Content-Type headers

### 3. Scheduled Reports Management

#### `POST /api/trpc/reports.createScheduledReport`
Create automated report generation schedules.

**Request Schema:**
```typescript
interface CreateScheduledReportRequest {
  name: string;
  reportType: 'royalty_statements' | 'transaction_ledger' | 'creator_earnings' | 'platform_revenue' | 'payout_summary';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  recipients: string[];
  formats: ('CSV' | 'EXCEL' | 'PDF')[];
  filters?: {
    creatorIds?: string[];
    brandIds?: string[];
    assetTypes?: string[];
    licenseTypes?: string[];
  };
  deliveryOptions: {
    emailDelivery: boolean;
    secureDownload: boolean;
    attachToEmail: boolean;
    downloadExpiration: number; // hours
  };
  schedule: {
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    hour: number; // 0-23
    minute: number; // 0-59
    timezone: string;
  };
}
```

**Response Schema:**
```typescript
interface CreateScheduledReportResponse {
  success: boolean;
  data: {
    scheduledReportId: string;
    nextExecutionAt: string; // ISO date string
  };
  message: string;
}
```

#### `GET /api/trpc/reports.getScheduled`
Retrieve scheduled reports with filtering and pagination.

**Query Parameters:**
```typescript
interface ScheduledReportsQuery {
  isActive?: boolean;
  reportType?: string;
  limit?: number; // 1-100, default 20
  offset?: number; // default 0
}
```

**Response Schema:**
```typescript
interface ScheduledReportsResponse {
  data: {
    items: ScheduledReportItem[];
    pagination: {
      total: number;
      page: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

interface ScheduledReportItem {
  id: string;
  name: string;
  reportType: string;
  frequency: string;
  recipients: string[];
  isActive: boolean;
  lastGeneratedAt?: string; // ISO date string
  nextScheduledAt?: string; // ISO date string
  formats: string[];
  createdAt: string; // ISO date string
}
```

### 4. Report Archive & History

#### `GET /api/trpc/reports.getArchive`
Retrieve historical reports with advanced filtering.

**Query Parameters:**
```typescript
interface ArchiveSearchParams {
  reportTypes?: string[];
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  generatedBy?: string[];
  formats?: string[];
  page?: number;
  limit?: number;
  sortBy?: 'generatedAt' | 'reportType' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}
```

**Response Schema:**
```typescript
interface ArchiveResponse {
  data: {
    reports: ArchivedReportItem[];
    pagination: PaginationInfo;
    facets: {
      reportTypes: { type: string; count: number }[];
      formats: { format: string; count: number }[];
      dateRanges: { period: string; count: number }[];
    };
  };
}

interface ArchivedReportItem {
  id: string;
  reportType: string;
  title: string;
  period: {
    startDate: string; // ISO date string
    endDate: string; // ISO date string
  };
  generatedAt: string; // ISO date string
  generatedBy: {
    id: string;
    name: string;
    email: string;
  };
  fileInfo: {
    fileSize: number;
    format: string;
    downloadCount: number;
    lastAccessedAt?: string; // ISO date string
  };
  status: 'COMPLETED' | 'ARCHIVED' | 'EXPIRED';
  tags: string[];
}
```

#### `POST /api/trpc/reports.bulkDownload`
Generate ZIP archives for multiple reports.

**Request Schema:**
```typescript
interface BulkDownloadRequest {
  reportIds: string[];
  name?: string; // Custom archive name
}
```

**Response Schema:**
```typescript
interface BulkDownloadResponse {
  success: boolean;
  data: {
    downloadUrl: string;
    expiresAt: string; // ISO date string
    fileCount: number;
    totalSize: number; // bytes
    filename: string;
  };
}
```

---

## TypeScript Interface Definitions

### Core Data Types

```typescript
// Export configuration
export interface ExportConfig {
  format: 'CSV' | 'EXCEL' | 'PDF' | 'JSON';
  compression?: boolean;
  password?: string;
  metadata?: Record<string, any>;
  template?: string;
}

// Report generation job
export interface ReportGenerationJob {
  id: string;
  reportId: string;
  reportType: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number; // 0-100
  startedAt: string; // ISO date string
  completedAt?: string; // ISO date string
  errorMessage?: string;
  estimatedDuration?: number; // seconds
}

// Secure download token
export interface SecureDownloadToken {
  token: string;
  reportId: string;
  expiresAt: string; // ISO date string
  maxDownloads: number;
  downloadCount: number;
  ipRestrictions?: string[];
  isRevoked: boolean;
}

// Email delivery configuration
export interface EmailDeliveryConfig {
  recipients: string[];
  subject?: string;
  message?: string;
  attachFiles: boolean;
  maxAttachmentSize: number; // bytes
  secureLinksOnly: boolean;
}

// Report filtering options
export interface ReportFilters {
  brandIds?: string[];
  creatorIds?: string[];
  projectIds?: string[];
  assetTypes?: string[];
  licenseTypes?: string[];
  paymentStatuses?: string[];
  regions?: string[];
  currencies?: string[];
  tags?: string[];
}

// Pagination utilities
export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  offset: number;
}

// Audit trail for downloads
export interface DownloadAuditEntry {
  downloadId: string;
  reportId: string;
  userId: string;
  timestamp: string; // ISO date string
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  downloadDuration?: number; // milliseconds
}
```

### Report-Specific Types

```typescript
// CSV Export configuration
export interface CSVExportConfig {
  reportType: 'royalty_statements' | 'transaction_ledger' | 'creator_earnings' | 'platform_revenue' | 'payout_summary';
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  filters?: ReportFilters;
  columns?: string[];
  includeTotals?: boolean;
  delimiter?: ',' | ';' | '\t';
  encoding?: 'utf8' | 'utf16';
}

// Excel Export configuration
export interface ExcelExportConfig {
  reportType: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  filters?: ReportFilters;
  includeCharts?: boolean;
  includeSummary?: boolean;
  worksheets?: string[];
  styling?: {
    theme: string;
    brandColors: boolean;
    autoWidth: boolean;
  };
}

// PDF generation configuration
export interface PDFExportConfig {
  reportType: string;
  title: string;
  subtitle?: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  generatedBy: string;
  includeCharts: boolean;
  includeSummary: boolean;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  branding?: {
    logo: boolean;
    colors: boolean;
    footer: boolean;
  };
}
```

---

## Request/Response Schemas

### Zod Validation Schemas

```typescript
import { z } from 'zod';

// Base report configuration
export const reportConfigSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  format: z.enum(['pdf', 'csv', 'excel', 'json']),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    creatorIds: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

// Report export configuration
export const exportConfigSchema = z.object({
  format: z.enum(['CSV', 'EXCEL', 'PDF', 'JSON']),
  compression: z.boolean().default(false),
  password: z.string().min(8).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Scheduled report configuration
export const scheduledReportConfigSchema = z.object({
  name: z.string().min(1).max(200),
  reportType: z.enum(['royalty_statements', 'transaction_ledger', 'creator_earnings', 'platform_revenue', 'payout_summary']),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
  recipients: z.array(z.string().email()).min(1),
  formats: z.array(z.enum(['CSV', 'EXCEL', 'PDF'])).min(1),
  deliveryOptions: z.object({
    emailDelivery: z.boolean(),
    secureDownload: z.boolean(),
    attachToEmail: z.boolean(),
    downloadExpiration: z.number().min(1).max(168), // 1 hour to 1 week
  }),
  schedule: z.object({
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    hour: z.number().min(0).max(23),
    minute: z.number().min(0).max(59),
    timezone: z.string().min(1),
  }),
});

// Archive search parameters
export const archiveSearchSchema = z.object({
  reportTypes: z.array(z.string()).optional(),
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).optional(),
  generatedBy: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['generatedAt', 'reportType', 'fileSize']).default('generatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

---

## Authentication & Authorization

### Required Headers

All API endpoints require admin-level authentication:

```typescript
const headers = {
  'Authorization': `Bearer ${jwtToken}`,
  'Content-Type': 'application/json',
  'X-Admin-Key': process.env.ADMIN_API_KEY, // Additional security for sensitive operations
};
```

### User Role Requirements

```typescript
interface UserPermissions {
  SUPER_ADMIN: {
    canGenerate: boolean; // true
    canSchedule: boolean; // true
    canDelete: boolean; // true
    canBulkDownload: boolean; // true
    canViewAll: boolean; // true
  };
  FINANCE_MANAGER: {
    canGenerate: boolean; // true
    canSchedule: boolean; // true
    canDelete: boolean; // false
    canBulkDownload: boolean; // true
    canViewAll: boolean; // true
  };
  ADMIN: {
    canGenerate: boolean; // true
    canSchedule: boolean; // false
    canDelete: boolean; // false
    canBulkDownload: boolean; // false
    canViewAll: boolean; // false (own reports only)
  };
}
```

---

## Query Parameters & Filtering

### Date Range Filtering

```typescript
interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
  timezone?: string; // Defaults to UTC
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

// Usage examples
const filters = {
  // Last 30 days
  last30Days: {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date()
  },
  
  // Current month
  currentMonth: {
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  },
  
  // Last quarter
  lastQuarter: {
    startDate: new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3 - 3, 1),
    endDate: new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 0)
  }
};
```

### Advanced Filtering Options

```typescript
interface AdvancedFilters {
  // Entity-based filters
  entityFilters: {
    brandIds?: string[];
    creatorIds?: string[];
    projectIds?: string[];
  };
  
  // Type-based filters
  typeFilters: {
    assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
    licenseTypes?: ('standard' | 'extended' | 'exclusive')[];
    paymentStatuses?: ('pending' | 'completed' | 'failed' | 'refunded')[];
  };
  
  // Geographic filters
  geoFilters: {
    regions?: string[];
    countries?: string[];
    currencies?: string[];
  };
  
  // Value-based filters
  valueFilters: {
    minAmount?: number; // in cents
    maxAmount?: number; // in cents
    minEarnings?: number; // in cents
    maxEarnings?: number; // in cents
  };
  
  // Status filters
  statusFilters: {
    reportStatuses?: ('COMPLETED' | 'ARCHIVED' | 'EXPIRED')[];
    payoutStatuses?: ('PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED')[];
  };
}
```

### Pagination Parameters

```typescript
interface PaginationParams {
  page?: number; // 1-based, default 1
  limit?: number; // 1-100, default 20
  offset?: number; // alternative to page-based
  sortBy?: string; // field name
  sortOrder?: 'asc' | 'desc'; // default 'desc'
  cursor?: string; // for cursor-based pagination (large datasets)
}

// Helper function for generating pagination
export const createPaginationParams = (
  page: number = 1,
  limit: number = 20,
  sortBy: string = 'generatedAt',
  sortOrder: 'asc' | 'desc' = 'desc'
): PaginationParams => ({
  page,
  limit,
  offset: (page - 1) * limit,
  sortBy,
  sortOrder
});
```

---

## Rate Limiting & Quotas

### API Rate Limits

```typescript
interface RateLimits {
  reportGeneration: {
    perHour: 10; // Max 10 report generations per hour
    perDay: 50; // Max 50 report generations per day
    concurrent: 3; // Max 3 concurrent generation jobs
  };
  
  downloadRequests: {
    perMinute: 20; // Max 20 download requests per minute
    perHour: 200; // Max 200 download requests per hour
  };
  
  scheduledReports: {
    maxActive: 25; // Max 25 active scheduled reports
    perUser: 10; // Max 10 scheduled reports per user
  };
  
  archiveQueries: {
    perMinute: 30; // Max 30 archive queries per minute
    maxResults: 1000; // Max 1000 results per query
  };
}
```

### Rate Limit Headers

The API returns rate limiting information in response headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string; // Maximum requests allowed
  'X-RateLimit-Remaining': string; // Remaining requests in window
  'X-RateLimit-Reset': string; // Unix timestamp when limit resets
  'X-RateLimit-Retry-After'?: string; // Seconds to wait if rate limited
}
```

---

## Next Steps

Continue to [Part 2: Export Formats & Business Logic](./EXPORT_DISTRIBUTION_INTEGRATION_GUIDE_PART_2_FORMATS_BUSINESS_LOGIC.md) for detailed information about export formats, validation rules, and business logic implementation.

For questions or clarification, contact the backend team or refer to the [complete API documentation](../api/).
