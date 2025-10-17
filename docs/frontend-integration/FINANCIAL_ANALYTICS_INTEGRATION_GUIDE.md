# Financial Analytics Reports - Frontend Integration Guide

> **Classification: 🔒 ADMIN ONLY** - Internal operations and admin interface only

This document provides comprehensive integration guidance for the Financial Analytics Reports module in the YesGoddess platform. The frontend team can use this to implement the UI without requiring backend clarification.

## 🚀 Quick Start Overview

The Financial Analytics module provides 7 comprehensive report types:
- **Monthly Revenue Reports** - Revenue aggregation and analysis
- **Quarterly Financial Summaries** - 3-month performance analysis
- **Annual Financial Statements** - Full-year comprehensive reporting
- **Cash Flow Analysis** - Inflow/outflow analysis with projections
- **Accounts Receivable Aging** - Outstanding invoice tracking
- **Accounts Payable Reports** - Pending payment obligations
- **Commission Tracking** - Platform fee calculation and tracking

## 📋 Table of Contents

1. [API Endpoints](#api-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Authentication & Authorization](#authentication--authorization)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Rate Limiting & Performance](#rate-limiting--performance)
7. [Implementation Examples](#implementation-examples)

---

## 1. API Endpoints

All endpoints are accessed via tRPC and follow the pattern: `trpc.reports.[endpoint].useQuery()` or `trpc.reports.[endpoint].useMutation()`

### Core Report Generation

#### `generateFinancialAnalyticsReport`
```typescript
// POST /api/trpc/reports.generateFinancialAnalyticsReport
trpc.reports.generateFinancialAnalyticsReport.useMutation()
```

**Input Schema:**
```typescript
interface GenerateReportInput {
  reportType: 'monthly_revenue' | 'quarterly_summary' | 'annual_statement' | 'cash_flow' | 'accounts_receivable' | 'accounts_payable' | 'commission_tracking';
  config: {
    startDate: Date;
    endDate: Date;
    includeComparisons?: boolean; // Default: false
    includeForecast?: boolean;    // Default: false
    format?: 'pdf' | 'csv' | 'json'; // Default: 'pdf'
    filters?: {
      brandIds?: string[];        // Optional brand filtering
      creatorIds?: string[];      // Optional creator filtering
      regions?: string[];         // Optional region filtering
    };
  };
  generatedBy: string;             // Current user ID
  deliveryOptions?: {
    email?: string[];             // Optional email delivery
    storage?: boolean;            // Default: true
  };
}
```

**Response Schema:**
```typescript
interface FinancialReportResult {
  id: string;                     // Unique report identifier
  reportType: string;             // Report type that was generated
  generatedAt: Date;              // Generation timestamp
  storageUrl?: string;            // Cloud storage URL (if applicable)
  downloadUrl?: string;           // Secure download URL
  metadata: {
    recordCount: number;          // Number of records processed
    period: {
      startDate: Date;
      endDate: Date;
    };
    generatedBy: string;          // User who generated the report
  };
}
```

#### `generateDashboardReport`
```typescript
// POST /api/trpc/reports.generateDashboardReport
trpc.reports.generateDashboardReport.useMutation()
```

**Input Schema:**
```typescript
interface DashboardReportInput {
  period: {
    startDate: Date;
    endDate: Date;
  };
  generatedBy: string;
}
```

**Response:** Same as `FinancialReportResult` but includes comprehensive data from all report types.

### Report Management

#### `getReportHistory`
```typescript
// GET /api/trpc/reports.getReportHistory
trpc.reports.getReportHistory.useQuery()
```

**Input Schema:**
```typescript
interface ReportHistoryInput {
  limit?: number;                 // 1-100, default: 20
  offset?: number;                // Default: 0
  reportType?: string;            // Optional filter by report type
  startDate?: Date;               // Optional date range filter
  endDate?: Date;
}
```

**Response Schema:**
```typescript
interface ReportHistoryResponse {
  reports: Array<{
    id: string;
    reportType: string;
    generatedAt: Date;
    generatedBy: string;
    status: 'GENERATING' | 'COMPLETED' | 'FAILED';
    downloadUrl?: string;
    metadata: {
      recordCount: number;
      period: DateRange;
    };
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

#### `downloadReport`
```typescript
// GET /api/trpc/reports.downloadReport
trpc.reports.downloadReport.useQuery()
```

**Input Schema:**
```typescript
interface DownloadReportInput {
  reportId: string;               // Report ID to download
}
```

**Response:** Binary PDF file or structured JSON data depending on report format.

## 2. TypeScript Type Definitions

Create these interfaces in your frontend codebase:

```typescript
// Core Configuration Types
interface FinancialAnalyticsConfig {
  startDate: Date;
  endDate: Date;
  includeComparisons?: boolean;
  includeForecast?: boolean;
  format?: 'pdf' | 'csv' | 'json';
  filters?: {
    brandIds?: string[];
    creatorIds?: string[];
    regions?: string[];
  };
}

interface GenerateReportParams {
  reportType: ReportType;
  config: FinancialAnalyticsConfig;
  generatedBy: string;
  deliveryOptions?: {
    email?: string[];
    storage?: boolean;
  };
}

// Report Types Enum
type ReportType = 
  | 'monthly_revenue' 
  | 'quarterly_summary' 
  | 'annual_statement' 
  | 'cash_flow' 
  | 'accounts_receivable' 
  | 'accounts_payable' 
  | 'commission_tracking';

// Report Results
interface FinancialReportResult {
  id: string;
  reportType: string;
  generatedAt: Date;
  storageUrl?: string;
  downloadUrl?: string;
  metadata: {
    recordCount: number;
    period: {
      startDate: Date;
      endDate: Date;
    };
    generatedBy: string;
  };
}

// Report Status
type ReportStatus = 'GENERATING' | 'COMPLETED' | 'FAILED';

// Error Types
interface ReportError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

// Validation Schemas (for frontend form validation)
const reportConfigSchema = z.object({
  reportType: z.enum(['monthly_revenue', 'quarterly_summary', 'annual_statement', 'cash_flow', 'accounts_receivable', 'accounts_payable', 'commission_tracking']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  includeComparisons: z.boolean().optional(),
  includeForecast: z.boolean().optional(),
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    creatorIds: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date' }
).refine(
  (data) => {
    const daysDiff = Math.abs(data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 365; // Max 1 year range
  },
  { message: 'Date range cannot exceed 1 year' }
);
```

## 3. Authentication & Authorization

### Required Authentication
- All endpoints require JWT authentication via `protectedProcedure`
- User must be logged in with valid session

### Role-Based Access Control
```typescript
// Access Rules
interface AccessRules {
  // All report endpoints: ADMIN ONLY
  generateReport: ['ADMIN'];
  downloadReport: ['ADMIN'] | 'OWNER'; // Admin or report creator
  getReportHistory: ['ADMIN'];
  
  // Additional checks
  ownershipCheck: boolean; // User can only access reports they generated (unless ADMIN)
}
```

### Permission Validation
```typescript
// Frontend permission check helper
function canAccessReports(user: User): boolean {
  return user.role === 'ADMIN';
}

function canDownloadReport(user: User, report: ReportItem): boolean {
  return user.role === 'ADMIN' || report.generatedBy === user.id;
}

// Usage in components
const { data: reports } = trpc.reports.getReportHistory.useQuery(
  { limit: 20, offset: 0 },
  { enabled: canAccessReports(user) }
);
```

## 4. Business Logic & Validation Rules

### Date Range Validation
```typescript
interface DateRangeRules {
  maxRangeDays: 365;        // Maximum 1 year date range
  minRangeDays: 1;          // Minimum 1 day
  futureDate: false;        // End date cannot be in the future
  startBeforeEnd: true;     // Start date must be before end date
}

// Frontend validation helper
function validateDateRange(startDate: Date, endDate: Date): ValidationResult {
  const now = new Date();
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (startDate >= endDate) {
    return { valid: false, error: 'Start date must be before end date' };
  }
  
  if (endDate > now) {
    return { valid: false, error: 'End date cannot be in the future' };
  }
  
  if (daysDiff > 365) {
    return { valid: false, error: 'Date range cannot exceed 1 year' };
  }
  
  if (daysDiff < 1) {
    return { valid: false, error: 'Date range must be at least 1 day' };
  }
  
  return { valid: true };
}
```

### Report Type Specific Rules
```typescript
interface ReportTypeRules {
  monthly_revenue: {
    recommendedMaxRange: 90; // days
    includeComparisons: boolean; // Available
    includeForecast: boolean;    // Available
  };
  quarterly_summary: {
    recommendedMaxRange: 365;    // days
    includeComparisons: boolean; // Available
    includeForecast: boolean;    // Available
  };
  annual_statement: {
    recommendedMaxRange: 365;    // days
    includeComparisons: boolean; // Limited
    includeForecast: boolean;    // Available
  };
  cash_flow: {
    recommendedMaxRange: 180;    // days
    includeComparisons: boolean; // Available
    includeForecast: boolean;    // Recommended
  };
  accounts_receivable: {
    recommendedMaxRange: 180;    // days
    includeComparisons: boolean; // Limited
    includeForecast: boolean;    // Not available
  };
  accounts_payable: {
    recommendedMaxRange: 90;     // days
    includeComparisons: boolean; // Limited
    includeForecast: boolean;    // Limited
  };
  commission_tracking: {
    recommendedMaxRange: 365;    // days
    includeComparisons: boolean; // Available
    includeForecast: boolean;    // Limited
  };
}
```

### Field-Level Validation
```typescript
// Filter validation
interface FilterValidation {
  brandIds: {
    maxCount: 50;        // Maximum number of brands
    validation: 'cuid';  // Must be valid CUID format
  };
  creatorIds: {
    maxCount: 100;       // Maximum number of creators
    validation: 'cuid';  // Must be valid CUID format
  };
  regions: {
    maxCount: 20;        // Maximum number of regions
    allowedValues: string[]; // Predefined region codes
  };
}

// Frontend filter validation
function validateFilters(filters: ReportFilters): ValidationResult {
  if (filters.brandIds && filters.brandIds.length > 50) {
    return { valid: false, error: 'Cannot select more than 50 brands' };
  }
  
  if (filters.creatorIds && filters.creatorIds.length > 100) {
    return { valid: false, error: 'Cannot select more than 100 creators' };
  }
  
  return { valid: true };
}
```

Continued in [Financial Analytics Integration Guide - Part 2](./FINANCIAL_ANALYTICS_INTEGRATION_GUIDE_PART2.md)...
