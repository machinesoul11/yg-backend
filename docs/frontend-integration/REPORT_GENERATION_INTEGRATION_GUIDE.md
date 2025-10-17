# Report Generation Service - Frontend Integration Guide

## 🔒 Classification: ADMIN ONLY
*This module is designed exclusively for admin staff and high-level backend operations*

---

## Overview

The Report Generation Service provides comprehensive financial and operational reporting capabilities for the YesGoddess platform. It generates various types of reports including financial statements, revenue reconciliation, transaction ledgers, platform fee calculations, creator earnings summaries, and brand spend analysis.

---

## 1. API Endpoints

### Base URL
All endpoints are accessible under the `reportsRouter` in the tRPC router at `/api/trpc/reports.*`

### Core Endpoints

#### 🌐 GET `/api/trpc/reports.getRevenue`
**Purpose:** Retrieve platform revenue reporting with time-series data and breakdowns  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface RevenueReportRequest {
  startDate: Date;
  endDate: Date;
  granularity?: 'daily' | 'weekly' | 'monthly'; // default: 'daily'
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
      granularity: string;
    };
  };
  timeSeries: Array<{
    period: string;
    revenueCents: number;
    transactionCount: number;
    date: Date;
  }>;
  metadata: {
    generatedAt: Date;
    requestedBy: string;
    filters?: object;
  };
}
```

#### 🌐 GET `/api/trpc/reports.getPayouts`
**Purpose:** Get payout summary with creator details and status tracking  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface PayoutSummaryRequest {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed'; // default: 'all'
  creatorId?: string;
  limit?: number; // default: 20, max: 100
  offset?: number; // default: 0
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
    status: string;
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
    filters: object;
  };
}
```

#### 🌐 GET `/api/trpc/reports.getReconciliation`
**Purpose:** Stripe reconciliation reporting with discrepancy detection  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

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
    reconciliationRate: number;
    matchedCount: number;
    unmatchedInternalCount: number;
    unmatchedStripeCount: number;
    discrepancyCount: number;
  };
  reconciliation: {
    matchedTransactions: Array<object>;
    unmatchedInternal: Array<object>;
    unmatchedStripe: Array<object>;
    discrepancies: Array<object>;
  };
  metadata: {
    reportId: string;
    generatedAt: Date;
    generatedBy: string;
  };
}
```

#### 🌐 POST `/api/trpc/reports.generate`
**Purpose:** Custom report generation with background processing  
**Method:** `mutation`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface GenerateReportRequest {
  reportType: 'revenue' | 'payouts' | 'reconciliation' | 'custom';
  parameters: Record<string, any>;
  format?: 'pdf' | 'csv' | 'excel' | 'json'; // default: 'pdf'
  name?: string;
  emailDelivery?: {
    recipients: string[]; // email addresses
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
  estimatedCompletionTime: Date;
  message: string;
}
```

#### 🌐 GET `/api/trpc/reports.download`
**Purpose:** Secure report download with expiring URLs  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface DownloadReportRequest {
  reportId: string;
}
```

**Response Schema:**
```typescript
interface DownloadReportResponse {
  downloadUrl: string;
  filename: string;
  expiresAt: Date;
  reportInfo: {
    id: string;
    type: string;
    generatedAt: Date;
    size: string;
  };
}
```

#### 🌐 GET `/api/trpc/reports.getScheduled`
**Purpose:** Manage scheduled reports  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface ScheduledReportsRequest {
  isActive?: boolean;
  reportType?: string;
  limit?: number; // default: 20, max: 100
  offset?: number; // default: 0
}
```

#### 🌐 GET `/api/trpc/reports.getReportStatus`
**Purpose:** Get report generation status  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

**Request Schema:**
```typescript
interface ReportStatusRequest {
  reportId: string;
}
```

#### 🌐 GET `/api/trpc/reports.getReportTypes`
**Purpose:** Get available report types and capabilities  
**Method:** `query`  
**Authentication:** Required (`protectedProcedure`)

---

## 2. TypeScript Type Definitions

### Core Types

```typescript
// Base configuration for all reports
interface BaseReportConfig {
  id?: string;
  name?: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  requestedBy?: string;
  generatedAt?: Date;
  format?: 'pdf' | 'csv' | 'excel' | 'json';
  filters?: ReportFilters;
}

// Universal filter interface
interface ReportFilters {
  brandIds?: string[];
  creatorIds?: string[];
  projectIds?: string[];
  assetTypes?: string[];
  licenseTypes?: string[];
  paymentStatuses?: string[];
  regions?: string[];
  currencies?: string[];
}

// Report status enumeration
type ReportStatus = 
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

// Transaction types
type TransactionType = 
  | 'LICENSE_REVENUE'
  | 'ROYALTY_PAYMENT'
  | 'PAYOUT_TRANSFER'
  | 'PLATFORM_FEE'
  | 'REFUND'
  | 'ADJUSTMENT';

// Entity types for ledger entries
type EntityType = 
  | 'LICENSE'
  | 'ROYALTY_STATEMENT'
  | 'PAYOUT'
  | 'BRAND'
  | 'CREATOR'
  | 'IP_ASSET'
  | 'PROJECT';

// Financial summary interface
interface FinancialSummary {
  totalRevenueCents: number;
  totalPayoutsCents: number;
  totalPlatformFeesCents: number;
  netRevenueCents: number;
  grossMarginPercent: number;
  transactionCount: number;
  activeCreators: number;
  activeBrands: number;
  averageTransactionCents: number;
}

// Creator earnings breakdown
interface CreatorEarningsBreakdown {
  creatorId: string;
  creatorName: string;
  grossEarningsCents: number;
  platformFeesCents: number;
  netEarningsCents: number;
  pendingCents: number;
  paidCents: number;
  licensesCount: number;
  assetsCount: number;
  byAsset: Array<{
    assetId: string;
    assetTitle: string;
    earningsCents: number;
    licensesCount: number;
  }>;
  byLicense: Array<{
    licenseId: string;
    brandName: string;
    earningsCents: number;
    startDate: Date;
    endDate: Date;
  }>;
}

// Transaction ledger entry
interface TransactionEntry {
  id: string;
  type: TransactionType;
  entityType: EntityType;
  entityId: string;
  description: string;
  amountCents: number;
  direction: 'DEBIT' | 'CREDIT';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: Date;
  processedAt?: Date;
  metadata: Record<string, any>;
  relatedEntities: Array<{
    type: EntityType;
    id: string;
    name: string;
  }>;
}

// Platform fee breakdown
interface PlatformFeeBreakdown {
  byLicenseType: Array<{
    type: string;
    totalFeesCents: number;
    averagePercent: number;
    transactionCount: number;
  }>;
  byAssetType: Array<{
    type: string;
    totalFeesCents: number;
    averagePercent: number;
    transactionCount: number;
  }>;
  byCreator: Array<{
    creatorId: string;
    creatorName: string;
    totalFeesCents: number;
    transactionCount: number;
  }>;
  byBrand: Array<{
    brandId: string;
    brandName: string;
    totalFeesCents: number;
    transactionCount: number;
  }>;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

// Base report configuration schema
export const baseReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  generatedBy: z.string().cuid(),
  generatedAt: z.coerce.date().optional(),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  filters: z.object({
    brandIds: z.array(z.string().cuid()).optional(),
    creatorIds: z.array(z.string().cuid()).optional(),
    projectIds: z.array(z.string().cuid()).optional(),
    assetTypes: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    paymentStatuses: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    currencies: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

// Revenue report request schema
export const revenueReportRequestSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional()
  }).optional()
});

// Report generation request schema
export const generateReportRequestSchema = z.object({
  reportType: z.enum(['revenue', 'payouts', 'reconciliation', 'custom']),
  parameters: z.record(z.string(), z.any()),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  name: z.string().optional(),
  emailDelivery: z.object({
    recipients: z.array(z.string().email()),
    subject: z.string().optional(),
    message: z.string().optional()
  }).optional()
});
```

---

## 3. Business Logic & Validation Rules

### Date Range Validation
- **Maximum Range:** 2 years (730 days)
- **Minimum Range:** 1 day
- **Rule:** `endDate` must be greater than or equal to `startDate`
- **Auto-adjustment:** Granularity automatically adjusted based on date range:
  - ≤ 31 days: `daily`
  - ≤ 92 days: `weekly`
  - > 92 days: `monthly`

### Financial Calculations
- **Currency:** All amounts stored and returned in cents (integer)
- **Platform Fee:** Typically 10% of creator earnings
- **Growth Rate:** Calculated as `((current - previous) / previous) * 100`
- **Reconciliation Rate:** `(matched_transactions / total_transactions) * 100`

### Pagination Rules
- **Default Limit:** 20 items
- **Maximum Limit:** 100 items per request
- **Offset-based:** Use `offset` and `limit` parameters
- **Sorting:** Most recent items first by default

### Report Generation Rules
- **Background Processing:** Reports with estimated generation time > 30 seconds
- **Status Tracking:** Real-time status updates via `getReportStatus` endpoint
- **Retention:** Generated reports expire after 30 days
- **Naming:** Auto-generated names follow pattern: `{type}_report_{YYYY-MM-DD}`

---

## 4. Error Handling

### HTTP Status Codes

| Status | Code | Description |
|--------|------|-------------|
| 200 | OK | Successful request |
| 400 | BAD_REQUEST | Invalid parameters or date range |
| 401 | UNAUTHORIZED | Authentication required |
| 403 | FORBIDDEN | Access denied to resource |
| 404 | NOT_FOUND | Report or resource not found |
| 429 | TOO_MANY_REQUESTS | Rate limit exceeded |
| 500 | INTERNAL_SERVER_ERROR | Server error during processing |

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    data?: {
      zodError?: ZodError; // For validation errors
      cause?: string;
    };
  };
}
```

### Common Error Codes

```typescript
// Report-specific errors
const REPORT_ERRORS = {
  REPORT_NOT_FOUND: 'Report with specified ID not found',
  REPORT_GENERATION_FAILED: 'Report generation failed due to data processing error',
  REPORT_EXPORT_FAILED: 'Report export to specified format failed',
  REPORT_ACCESS_DENIED: 'User does not have access to this report',
  REPORT_EXPIRED: 'Report has expired and is no longer available',
  INVALID_DATE_RANGE: 'Date range too large or invalid',
  INVALID_FILTERS: 'One or more filter parameters are invalid',
  GENERATION_TIMEOUT: 'Report generation exceeded maximum time limit',
  STORAGE_ERROR: 'Error storing or retrieving report file'
} as const;
```

### User-Friendly Error Messages

```typescript
const ERROR_MESSAGES = {
  'INVALID_DATE_RANGE': 'Please select a date range within 2 years.',
  'REPORT_NOT_FOUND': 'The requested report could not be found.',
  'REPORT_EXPIRED': 'This report has expired. Please generate a new one.',
  'ACCESS_DENIED': 'You don\'t have permission to access this report.',
  'GENERATION_FAILED': 'Report generation failed. Please try again.',
  'TOO_MANY_REQUESTS': 'Too many requests. Please wait before generating another report.'
};
```

---

## 5. Authorization & Permissions

### User Roles
- **ADMIN:** Full access to all reports and operations
- **STAFF:** Limited access to specific report types
- **CREATOR:** Access only to own earnings and payout data
- **BRAND:** Access only to own spending and license data

### Endpoint Permissions

| Endpoint | ADMIN | STAFF | CREATOR | BRAND |
|----------|-------|-------|---------|-------|
| `getRevenue` | ✅ | ✅ | ❌ | ❌ |
| `getPayouts` | ✅ | ✅ | Own only | ❌ |
| `getReconciliation` | ✅ | ❌ | ❌ | ❌ |
| `generate` | ✅ | Limited | Own only | Own only |
| `download` | ✅ | Own only | Own only | Own only |
| `getScheduled` | ✅ | Own only | ❌ | ❌ |

### Resource Ownership Rules
- Users can only access reports they generated or are explicitly shared with them
- Admin users can access all reports
- Report sharing requires explicit permission grants
- Expired reports are automatically inaccessible

### Permission Validation

```typescript
// Check report access
function canAccessReport(user: User, report: Report): boolean {
  if (user.role === 'ADMIN') return true;
  if (report.generatedBy === user.id) return true;
  return report.sharedWith?.includes(user.id) ?? false;
}

// Check report generation permission
function canGenerateReportType(user: User, reportType: string): boolean {
  const adminOnlyTypes = ['reconciliation', 'platform_revenue'];
  if (adminOnlyTypes.includes(reportType)) {
    return user.role === 'ADMIN';
  }
  return true;
}
```

---

## 6. Rate Limiting & Quotas

### Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `getRevenue` | 100 requests | 1 hour | Per user |
| `getPayouts` | 100 requests | 1 hour | Per user |
| `getReconciliation` | 20 requests | 1 hour | Per user |
| `generate` | 10 requests | 1 hour | Per user |
| `download` | 50 requests | 1 hour | Per user |

### Headers to Check

```typescript
// Rate limit headers returned in responses
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;     // e.g., '100'
  'X-RateLimit-Remaining': string; // e.g., '85'
  'X-RateLimit-Reset': string;     // Unix timestamp
  'X-RateLimit-Used': string;      // e.g., '15'
}
```

### Quota Management

```typescript
// Check rate limit status
async function checkRateLimit(userId: string, endpoint: string): Promise<RateLimitStatus> {
  const key = `ratelimit:${endpoint}:${userId}`;
  const current = await redis.get(key);
  const limit = RATE_LIMITS[endpoint];
  
  return {
    limit,
    used: parseInt(current || '0'),
    remaining: limit - parseInt(current || '0'),
    resetTime: Date.now() + (60 * 60 * 1000) // 1 hour
  };
}
```

---

## 7. Real-time Updates

### Report Status Polling

```typescript
// Poll report status during generation
function pollReportStatus(reportId: string): Observable<ReportStatus> {
  return interval(2000).pipe(
    switchMap(() => trpc.reports.getReportStatus.query({ reportId })),
    takeUntil(
      timer(5 * 60 * 1000) // Stop after 5 minutes
    ),
    distinctUntilChanged((prev, curr) => prev.status === curr.status)
  );
}
```

### WebSocket Events (Future Enhancement)
*Note: WebSocket support is planned but not yet implemented*

```typescript
// Future WebSocket event interface
interface ReportWebSocketEvent {
  type: 'REPORT_STATUS_CHANGE' | 'REPORT_COMPLETED' | 'REPORT_FAILED';
  reportId: string;
  status: ReportStatus;
  progress?: number; // 0-100
  metadata?: object;
}
```

### Email Notifications

Reports can be configured to send email notifications upon completion:

```typescript
interface EmailDeliveryConfig {
  recipients: string[];
  subject?: string;
  message?: string;
  attachReport?: boolean; // Include PDF attachment
  includeDownloadLink?: boolean; // Include secure download link
}
```

---

## 8. Pagination & Filtering

### Pagination Format

**Offset-based pagination** is used throughout the API:

```typescript
interface PaginationRequest {
  limit?: number;  // default: 20, max: 100
  offset?: number; // default: 0
}

interface PaginationResponse {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
```

### Available Filters

#### Revenue Reports
- `brandIds: string[]` - Filter by specific brands
- `licenseTypes: string[]` - Filter by license types
- `regions: string[]` - Filter by geographic regions

#### Payout Reports
- `status: 'all' | 'pending' | 'completed' | 'failed'` - Filter by payout status
- `creatorId: string` - Filter by specific creator
- `paymentMethod: string[]` - Filter by payment method

#### Transaction Ledger
- `transactionTypes: TransactionType[]` - Filter by transaction types
- `entityTypes: EntityType[]` - Filter by entity types
- `statuses: TransactionStatus[]` - Filter by transaction status
- `amountRange: { minCents?: number; maxCents?: number }` - Filter by amount range

### Sorting Options

```typescript
interface SortingOptions {
  sortBy?: 'createdAt' | 'amountCents' | 'status' | 'name';
  sortOrder?: 'asc' | 'desc'; // default: 'desc'
}
```

---

## 9. File Uploads

*Note: Direct file uploads are not currently supported for this module. All reports are generated server-side and downloaded via secure URLs.*

### Future File Upload Support
When implemented, the following pattern will be used:

```typescript
// Generate signed upload URL
interface SignedUploadRequest {
  filename: string;
  contentType: string;
  reportId: string;
}

interface SignedUploadResponse {
  uploadUrl: string;
  fileKey: string;
  expiresAt: Date;
}
```

---

## 10. Frontend Implementation Checklist

### Initial Setup
- [ ] Install required dependencies (`@tanstack/react-query`, `@trpc/client`)
- [ ] Set up tRPC client with proper base URL
- [ ] Configure authentication headers
- [ ] Implement error boundary for report-related errors

### API Client Layer
- [ ] Create typed API client using tRPC
- [ ] Implement request/response interceptors for error handling
- [ ] Add rate limiting detection and retry logic
- [ ] Configure timeout handling (5+ minutes for report generation)

### Data Fetching
- [ ] Implement React Query hooks for each endpoint
- [ ] Add proper caching strategies (5-10 minutes for static data)
- [ ] Handle background refetching for status polling
- [ ] Implement optimistic updates where appropriate

### Form Validation
- [ ] Create Zod schemas for all request types
- [ ] Implement client-side date range validation
- [ ] Add filter validation and sanitization
- [ ] Handle form state management with proper typing

### Error Handling
- [ ] Create error mapping for user-friendly messages
- [ ] Implement retry mechanisms for transient failures
- [ ] Add error logging and monitoring
- [ ] Handle network connectivity issues

### UI Components
- [ ] Build report generation forms with date pickers
- [ ] Create report status indicators and progress bars
- [ ] Implement data tables with sorting and filtering
- [ ] Add download buttons with expiration warnings
- [ ] Build pagination controls

### Real-time Features
- [ ] Implement report status polling during generation
- [ ] Add notification system for completion alerts
- [ ] Create WebSocket integration (when available)
- [ ] Handle connection state management

### Performance Optimization
- [ ] Implement virtual scrolling for large data sets
- [ ] Add data memoization for expensive calculations
- [ ] Use React.lazy for code splitting
- [ ] Optimize bundle size with selective imports

### Testing
- [ ] Write unit tests for API client functions
- [ ] Add integration tests for complete workflows
- [ ] Test error scenarios and edge cases
- [ ] Validate TypeScript types match API responses

### Security
- [ ] Validate all user inputs on client side
- [ ] Implement proper session handling
- [ ] Add CSRF protection
- [ ] Ensure secure download URL handling

---

## Sample Implementation

### React Query Hooks

```typescript
// hooks/useReports.ts
import { trpc } from '../utils/trpc';
import type { 
  RevenueReportRequest, 
  PayoutSummaryRequest 
} from '../types/reports';

export function useRevenueReport(params: RevenueReportRequest) {
  return trpc.reports.getRevenue.useQuery(params, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function usePayoutSummary(params: PayoutSummaryRequest) {
  return trpc.reports.getPayouts.useQuery(params, {
    keepPreviousData: true, // For pagination
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useGenerateReport() {
  const utils = trpc.useContext();
  
  return trpc.reports.generate.useMutation({
    onSuccess: () => {
      utils.reports.getReportStatus.invalidate();
    },
    onError: (error) => {
      console.error('Report generation failed:', error);
    },
  });
}

export function useReportStatus(reportId: string | null) {
  return trpc.reports.getReportStatus.useQuery(
    { reportId: reportId! },
    {
      enabled: !!reportId,
      refetchInterval: (data) => {
        // Poll every 2 seconds if generating, stop if complete/failed
        return data?.status === 'GENERATING' ? 2000 : false;
      },
    }
  );
}
```

### API Client Setup

```typescript
// utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { ReportsRouter } from '../../../yg-backend/src/modules/reports/router';

export const trpc = createTRPCReact<ReportsRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/trpc`,
      headers() {
        // Include authentication token
        const token = localStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
```

### Error Handling Component

```typescript
// components/ReportErrorBoundary.tsx
import React from 'react';
import { TRPCError } from '@trpc/client';

interface Props {
  error: TRPCError | Error | null;
  retry?: () => void;
}

export function ReportErrorBoundary({ error, retry }: Props) {
  if (!error) return null;

  const getErrorMessage = (error: TRPCError | Error) => {
    if ('data' in error && error.data?.code) {
      const errorCode = error.data.code;
      const userMessages = {
        'INVALID_DATE_RANGE': 'Please select a date range within 2 years.',
        'REPORT_NOT_FOUND': 'The requested report could not be found.',
        'REPORT_EXPIRED': 'This report has expired. Please generate a new one.',
        'FORBIDDEN': 'You don\'t have permission to access this report.',
        'TOO_MANY_REQUESTS': 'Too many requests. Please wait before trying again.',
      };
      return userMessages[errorCode as keyof typeof userMessages] || error.message;
    }
    return 'An unexpected error occurred. Please try again.';
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">
            Report Error
          </h3>
          <div className="mt-2 text-sm text-red-700">
            {getErrorMessage(error)}
          </div>
          {retry && (
            <div className="mt-4">
              <button
                onClick={retry}
                className="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-2 rounded text-sm"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Next Steps

1. **Set up tRPC client** with proper authentication
2. **Implement report generation forms** with date pickers and filters
3. **Create status monitoring** for background report generation
4. **Build download management** with expiration handling
5. **Add comprehensive error handling** with user-friendly messages
6. **Implement caching strategy** for frequently accessed data
7. **Create reusable components** for charts and data visualization
8. **Add unit and integration tests** for critical workflows

---

## Support & Resources

- **Backend Developer:** Available for API clarifications
- **tRPC Documentation:** https://trpc.io/docs
- **React Query Documentation:** https://tanstack.com/query/latest
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/

---

*This integration guide covers all implemented functionality as of the current backend state. Future enhancements like WebSocket support and advanced filtering will require updates to this documentation.*
