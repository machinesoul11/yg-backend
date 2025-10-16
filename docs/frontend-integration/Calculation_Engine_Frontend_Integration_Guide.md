# Calculation Engine Module - Frontend Integration Guide

**Classification: ⚡ HYBRID** - Core functionality used by both admin backend and public-facing website

## Table of Contents
- [1. Overview](#1-overview)
- [2. API Endpoints](#2-api-endpoints)
- [3. TypeScript Type Definitions](#3-typescript-type-definitions)
- [4. Business Logic & Validation Rules](#4-business-logic--validation-rules)
- [5. Error Handling](#5-error-handling)
- [6. Authorization & Permissions](#6-authorization--permissions)
- [7. Rate Limiting & Quotas](#7-rate-limiting--quotas)
- [8. Pagination & Filtering](#8-pagination--filtering)
- [9. Frontend Implementation Checklist](#9-frontend-implementation-checklist)

---

## 1. Overview

The **Calculation Engine** is the core module responsible for calculating creator royalties from license revenue. It implements sophisticated financial calculations including revenue aggregation, ownership splits, pro-rating, minimum thresholds, and precise rounding with audit trails.

### Key Features Implemented
- **Royalty Period Management**: Monthly, quarterly, and custom period calculations
- **Revenue Aggregation**: License flat fees + usage-based revenue with pro-rating
- **Ownership Split Calculation**: Accurate distribution using basis points (10000 = 100%)
- **License Scope Consideration**: Validation against license terms and usage reports
- **Adjustment Handling**: Manual credits, debits, bonuses, corrections, and refunds
- **Banker's Rounding**: Precision financial calculations with reconciliation
- **Minimum Payout Thresholds**: Configurable thresholds with carryover accumulation

### Architecture
- **Admin Operations**: Royalty run creation, calculation execution, validation, locking
- **Creator Access**: View earnings, statements, forecasts, and payment history
- **Real-time Processing**: Background calculation with status updates
- **Audit Trail**: Complete calculation history and adjustment tracking

---

## 2. API Endpoints

### Admin Endpoints (🔒 ADMIN ONLY)

#### Royalty Runs Management

##### `GET /api/royalties/runs`
**List all royalty calculation runs**

```typescript
// Request
interface ListRunsRequest {
  page?: string; // default: "1"
  limit?: string; // default: "20", max: "100"
  status?: 'DRAFT' | 'PROCESSING' | 'CALCULATED' | 'LOCKED' | 'FAILED';
  sortBy?: 'periodStart' | 'periodEnd' | 'createdAt' | 'status'; // default: 'createdAt'
  sortOrder?: 'asc' | 'desc'; // default: 'desc'
}

// Response
interface ListRunsResponse {
  success: true;
  data: RoyaltyRunSummary[];
  pagination: PaginationMetadata;
}
```

##### `POST /api/royalties/run`
**Create and optionally calculate a new royalty run**

```typescript
// Request
interface CreateRunRequest {
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime  
  notes?: string; // max 500 chars
  autoCalculate?: boolean; // default: true
}

// Response
interface CreateRunResponse {
  success: true;
  data: RoyaltyRunSummary;
  message: string;
}
```

##### `GET /api/royalties/runs/:id`
**Get detailed run information**

```typescript
// Response
interface GetRunResponse {
  success: true;
  data: RoyaltyRunDetails;
}
```

##### `POST /api/royalties/runs/:id/lock`
**Lock a calculated run to prevent modifications**

```typescript
// Response
interface LockRunResponse {
  success: true;
  data: RoyaltyRunSummary;
  message: string;
}
```

#### Statement Management

##### `GET /api/royalties/statements`
**List statements with admin filtering**

```typescript
// Request  
interface ListStatementsRequest {
  page?: string;
  limit?: string;
  creatorId?: string; // Admin can filter by creator
  runId?: string;
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
}
```

##### `GET /api/royalties/statements/:id`
**Get detailed statement with line items**

```typescript
// Response
interface GetStatementResponse {
  success: true;
  data: RoyaltyStatementDetails;
}
```

##### `POST /api/royalties/statements/:id/dispute`
**Handle statement disputes**

```typescript
// Request
interface DisputeStatementRequest {
  reason: string; // min 20, max 1000 chars
  disputeType: 'CALCULATION_ERROR' | 'MISSING_REVENUE' | 'OWNERSHIP_DISPUTE' | 'OTHER';
}
```

### Creator Endpoints (🌐 SHARED)

#### Earnings & Analytics

##### `GET /api/me/royalties/earnings`
**Get authenticated creator's earnings analytics**

```typescript
// Request
interface GetEarningsRequest {
  date_from?: string; // ISO date
  date_to?: string; // ISO date  
  group_by?: 'day' | 'week' | 'month' | 'year'; // default: 'month'
}

// Response
interface GetEarningsResponse {
  success: true;
  data: CreatorEarningsSummary;
}
```

##### `GET /api/me/royalties/statements`
**Get creator's royalty statements**

```typescript
// Request  
interface GetCreatorStatementsRequest {
  page?: string;
  limit?: string;
  status?: RoyaltyStatementStatus;
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
}
```

##### `GET /api/me/royalties/history`
**Get detailed payment history**

```typescript
// Response
interface GetHistoryResponse {
  success: true;
  data: {
    statements: CreatorStatementHistory[];
    summary: {
      totalEarningsCents: number;
      totalPaidCents: number;
      totalPendingCents: number;
      averageMonthlyEarningsCents: number;
    };
  };
  pagination: PaginationMetadata;
}
```

##### `GET /api/me/royalties/forecast` 
**Get earnings projections**

```typescript
// Response
interface GetForecastResponse {
  success: true;
  data: CreatorEarningsForecast;
}
```

---

## 3. TypeScript Type Definitions

### Core Types

```typescript
/**
 * Royalty Run Status Enum
 */
export type RoyaltyRunStatus = 
  | 'DRAFT'       // Initial state, can be edited
  | 'PROCESSING'  // Calculation in progress  
  | 'CALCULATED'  // Calculation complete, can be reviewed
  | 'LOCKED'      // Finalized, no changes allowed
  | 'FAILED';     // Calculation failed

/**
 * Royalty Statement Status Enum  
 */
export type RoyaltyStatementStatus = 
  | 'PENDING'   // Awaiting creator review
  | 'REVIEWED'  // Creator has reviewed (accepted)
  | 'DISPUTED'  // Creator has disputed  
  | 'RESOLVED'  // Dispute resolved
  | 'PAID';     // Payment processed

/**
 * Adjustment Type Enum
 */
export type AdjustmentType = 
  | 'CREDIT'      // Add money to statement
  | 'DEBIT'       // Subtract money from statement  
  | 'BONUS'       // One-time bonus payment
  | 'CORRECTION'  // Fix calculation error
  | 'REFUND';     // Refund previous payment

/**
 * Royalty Run Summary
 */
export interface RoyaltyRunSummary {
  id: string;
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime
  status: RoyaltyRunStatus;
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  statementCount: number;
  processedAt: string | null; // ISO datetime
  lockedAt: string | null; // ISO datetime
  notes?: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/**
 * Royalty Run Details (Admin View)
 */
export interface RoyaltyRunDetails extends RoyaltyRunSummary {
  summary: {
    totalCreators: number;
    totalLineItems: number;
    statementsByStatus: Record<RoyaltyStatementStatus, number>;
    averageEarningsPerCreator: number; // cents
  };
  statements: RoyaltyStatementSummary[];
}

/**
 * Royalty Statement Summary
 */
export interface RoyaltyStatementSummary {
  id: string;
  creator: {
    id: string;
    userId: string;
    name: string;
    email: string;
    stageName?: string;
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  lineItemCount: number;
  reviewedAt: string | null; // ISO datetime
  disputedAt: string | null; // ISO datetime  
  paidAt: string | null; // ISO datetime
  createdAt: string; // ISO datetime
}

/**
 * Royalty Statement Details
 */
export interface RoyaltyStatementDetails {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string; // ISO datetime
    periodEnd: string; // ISO datetime
  };
  creator: {
    id: string;
    name: string;
    email: string;
    stageName?: string;
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  lines: RoyaltyLineDetails[];
  pdfUrl?: string;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  createdAt: string; // ISO datetime
}

/**
 * Royalty Line Item Details
 */
export interface RoyaltyLineDetails {
  id: string;
  ipAsset: {
    id: string;
    title: string;
    type: string;
  };
  license: {
    id: string;
    brandName: string;
    licenseType: string;
  } | null; // null for carryover/adjustment lines
  revenueCents: number;
  shareBps: number; // basis points (0-10000)
  calculatedRoyaltyCents: number;
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime
  metadata?: {
    type?: 'standard' | 'carryover' | 'adjustment' | 'threshold_note';
    description?: string;
    prorated?: boolean;
    daysActive?: number;
    totalDays?: number;
    flatFeeCents?: number;
    usageRevenueCents?: number;
    adjustmentType?: AdjustmentType;
    minimumThreshold?: number;
  };
}

/**
 * Creator Earnings Summary
 */
export interface CreatorEarningsSummary {
  totalEarningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  earningsByPeriod: MonthlyEarnings[];
  topAssets: TopEarningAsset[];
  recentStatements: CreatorStatementHistory[];
}

/**
 * Monthly Earnings Breakdown
 */
export interface MonthlyEarnings {
  period: string; // "YYYY-MM" format
  startDate: string; // ISO date
  endDate: string; // ISO date  
  earningsCents: number;
  paidCents: number;
  pendingCents: number;
  licenseCount: number;
}

/**
 * Top Earning Asset
 */
export interface TopEarningAsset {
  ipAssetId: string;
  title: string;
  type: string;
  totalEarningsCents: number;
  licensesCount: number;
  averageEarningsPerLicense: number; // cents
}

/**
 * Creator Statement History
 */
export interface CreatorStatementHistory {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
  };
  totalEarningsCents: number;
  status: RoyaltyStatementStatus;
  lineItemCount: number;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
}

/**
 * Earnings Forecast
 */
export interface CreatorEarningsForecast {
  currentMonthProjectedCents: number;
  nextMonthProjectedCents: number;
  activeLicensesCount: number;
  averageMonthlyEarningsCents: number;
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
  confidenceScore: number; // 0-100
}

/**
 * Pagination Metadata
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

/**
 * Create Royalty Run Schema
 */
export const createRoyaltyRunSchema = z
  .object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    notes: z.string().max(500).optional(),
    autoCalculate: z.boolean().default(true).optional(),
  })
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: 'Period end must be after period start',
    path: ['periodEnd'],
  });

/**
 * Apply Adjustment Schema
 */
export const applyAdjustmentSchema = z.object({
  statementId: z.string().cuid(),
  adjustmentCents: z.number().int().min(-1000000).max(1000000), // -$10k to +$10k
  adjustmentType: z.enum(['CREDIT', 'DEBIT', 'BONUS', 'CORRECTION', 'REFUND']),
  reason: z.string().min(20).max(1000),
});

/**
 * Dispute Statement Schema
 */
export const disputeStatementSchema = z.object({
  reason: z.string().min(20).max(1000),
  disputeType: z.enum([
    'CALCULATION_ERROR',
    'MISSING_REVENUE', 
    'OWNERSHIP_DISPUTE',
    'OTHER'
  ]),
});

/**
 * List Runs Query Schema
 */
export const listRunsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: z.enum(['DRAFT', 'PROCESSING', 'CALCULATED', 'LOCKED', 'FAILED']).optional(),
  sortBy: z.enum(['periodStart', 'periodEnd', 'createdAt', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
```

---

## 4. Business Logic & Validation Rules

### Royalty Calculation Rules

#### Revenue Aggregation
- **Flat Fee Licenses**: One-time payment, pro-rated if active for partial period
- **Usage-Based Licenses**: Calculated from reported usage events × revenue share %
- **Hybrid Licenses**: Combination of flat fee + usage revenue
- **Pro-rating Formula**: `(revenue × days_active) / total_days_in_period`

#### Ownership Split Calculation
- **Basis Points**: 10,000 basis points = 100% (precise to 0.01%)
- **Validation**: All ownership shares must sum to exactly 10,000 basis points
- **Rounding**: Uses banker's rounding (round-half-to-even) to minimize bias
- **Reconciliation**: Tracks and redistributes rounding differences

#### Minimum Payout Thresholds
- **Default Threshold**: $20.00 (configurable per environment)
- **VIP Creators**: $0.00 threshold (no minimum)
- **Carryover Logic**: Unpaid amounts accumulate until threshold is met
- **Grace Period**: 12 months - bypass threshold for long-unpaid balances

#### Period Management
- **Monthly Periods**: 1st to last day of calendar month
- **Quarterly Periods**: Standard business quarters (Q1: Jan-Mar, etc.)
- **Custom Periods**: Any date range, validated for overlaps
- **No Future Dates**: Period end cannot be in the future

### Validation Rules

#### Run Creation
```typescript
// Business rules to enforce
const validationRules = {
  // Date validation
  periodStart: {
    required: true,
    type: 'datetime',
    maxPastMonths: 24, // Cannot create runs older than 2 years
  },
  periodEnd: {
    required: true, 
    type: 'datetime',
    mustBeAfter: 'periodStart',
    cannotBeFuture: true,
  },
  
  // Overlap validation
  overlaps: {
    check: true,
    errorMessage: 'A royalty run already exists for this period',
  },
  
  // Notes validation  
  notes: {
    maxLength: 500,
    sanitize: true, // Strip HTML/scripts
  },
};
```

#### Statement Disputes
```typescript
const disputeValidation = {
  reason: {
    minLength: 20,
    maxLength: 1000,
    required: true,
  },
  disputeType: {
    required: true,
    allowedValues: ['CALCULATION_ERROR', 'MISSING_REVENUE', 'OWNERSHIP_DISPUTE', 'OTHER'],
  },
  
  // Business rules
  canDispute: {
    status: ['PENDING', 'REVIEWED'], // Cannot dispute paid/resolved statements
    timeLimit: 30, // days after statement creation
  },
};
```

### State Machine Transitions

#### Royalty Run States
```typescript
const allowedTransitions: Record<RoyaltyRunStatus, RoyaltyRunStatus[]> = {
  'DRAFT': ['PROCESSING', 'FAILED'],
  'PROCESSING': ['CALCULATED', 'FAILED'],
  'CALCULATED': ['LOCKED', 'PROCESSING'], // Can recalculate
  'LOCKED': [], // Terminal state - no changes allowed
  'FAILED': ['DRAFT'], // Can be reset to draft for fixes
};
```

#### Statement States
```typescript
const statementTransitions: Record<RoyaltyStatementStatus, RoyaltyStatementStatus[]> = {
  'PENDING': ['REVIEWED', 'DISPUTED'],
  'REVIEWED': ['DISPUTED', 'PAID'],
  'DISPUTED': ['RESOLVED'],
  'RESOLVED': ['PAID'],
  'PAID': [], // Terminal state
};
```

---

## 5. Error Handling

### HTTP Status Codes

| Status | Use Case | Example |
|--------|----------|---------|
| 200 | Success | Data retrieved successfully |
| 201 | Created | Run created successfully |
| 400 | Bad Request | Invalid date range, validation errors |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Creator trying to access admin endpoint |
| 404 | Not Found | Run/statement doesn't exist |
| 409 | Conflict | Overlapping periods, already locked |
| 422 | Unprocessable Entity | Business rule violations |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Calculation engine failure |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string; // Error category
  message: string; // Human-readable message
  details?: ValidationError[]; // For validation errors
  code?: string; // Internal error code
  timestamp?: string; // ISO datetime
}

interface ValidationError {
  field: string; // Field path (e.g., "periodEnd")
  message: string; // Field-specific error message
  code?: string; // Validation rule that failed
}
```

### Specific Error Types

#### Validation Errors (400)
```typescript
// Period validation
{
  "success": false,
  "error": "Validation error",
  "message": "Period end must be after period start",
  "details": [
    {
      "field": "periodEnd",
      "message": "Period end must be after period start",
      "code": "INVALID_DATE_RANGE"
    }
  ]
}
```

#### Business Logic Errors (422)
```typescript
// Overlapping periods
{
  "success": false,
  "error": "Business rule violation",
  "message": "A royalty run already exists for the period 2024-01-01 to 2024-01-31",
  "code": "OVERLAPPING_PERIOD"
}

// Invalid state transition
{
  "success": false,
  "error": "Invalid state",
  "message": "Run must be in CALCULATED status to lock. Current status: DRAFT",
  "code": "INVALID_STATUS_TRANSITION"
}
```

#### Calculation Errors (500)
```typescript
// Engine failure
{
  "success": false,
  "error": "Calculation failed",
  "message": "Ownership splits for asset AST123 do not sum to 10000 bps",
  "code": "OWNERSHIP_VALIDATION_ERROR",
  "details": {
    "assetId": "AST123",
    "actualSum": 9500,
    "expectedSum": 10000
  }
}
```

### Frontend Error Handling Strategy

```typescript
// API client error handler
class RoyaltyAPIError extends Error {
  constructor(
    public status: number,
    public code: string,
    public userMessage: string,
    public details?: any
  ) {
    super(userMessage);
  }
}

// Error categorization for UI
const getErrorSeverity = (status: number): 'info' | 'warning' | 'error' => {
  if (status >= 400 && status < 500) return 'warning'; // User errors
  if (status >= 500) return 'error'; // Server errors  
  return 'info';
};

// User-friendly messages
const errorMessages: Record<string, string> = {
  'OVERLAPPING_PERIOD': 'A royalty run already exists for this time period. Please select different dates.',
  'INVALID_STATUS_TRANSITION': 'This action cannot be performed in the current run status.',
  'MINIMUM_THRESHOLD_NOT_MET': 'Earnings are below the minimum payout threshold and will carry forward to the next period.',
  'CALCULATION_TIMEOUT': 'The calculation is taking longer than expected. Please try again in a few minutes.',
};
```

---

## 6. Authorization & Permissions

### Role-Based Access Control

#### Admin Users (role: 'ADMIN')
- ✅ **Full Access**: All royalty endpoints
- ✅ **Create Runs**: Initiate new calculation periods
- ✅ **Execute Calculations**: Trigger calculation engine
- ✅ **Lock Runs**: Finalize calculations  
- ✅ **View All Data**: Access any creator's statements
- ✅ **Apply Adjustments**: Credit/debit statements
- ✅ **Resolve Disputes**: Handle creator disputes
- ✅ **Export Reports**: Download financial reports

#### Creator Users (role: 'CREATOR')
- ✅ **Own Data Only**: View personal earnings and statements
- ✅ **Dispute Statements**: Challenge calculation errors
- ✅ **Download PDFs**: Access statement documents
- ❌ **No Admin Operations**: Cannot create/calculate runs
- ❌ **No Other Creators**: Cannot view others' data

#### Brand Users (role: 'BRAND')
- ❌ **No Royalty Access**: Royalties are creator/admin only

### Endpoint Access Matrix

| Endpoint | Admin | Creator | Brand |
|----------|-------|---------|--------|
| `GET /api/royalties/runs` | ✅ | ❌ | ❌ |
| `POST /api/royalties/run` | ✅ | ❌ | ❌ |
| `GET /api/royalties/runs/:id` | ✅ | ❌ | ❌ |
| `POST /api/royalties/runs/:id/lock` | ✅ | ❌ | ❌ |
| `GET /api/royalties/statements` | ✅ | ❌ | ❌ |
| `GET /api/royalties/statements/:id` | ✅ | ✅* | ❌ |
| `POST /api/royalties/statements/:id/dispute` | ✅ | ✅* | ❌ |
| `GET /api/me/royalties/earnings` | ❌ | ✅ | ❌ |
| `GET /api/me/royalties/statements` | ❌ | ✅ | ❌ |
| `GET /api/me/royalties/history` | ❌ | ✅ | ❌ |
| `GET /api/me/royalties/forecast` | ❌ | ✅ | ❌ |

*\* Creator can only access their own statements*

### JWT Token Requirements

```typescript
// Required JWT claims
interface JWTPayload {
  sub: string; // User ID
  email: string;
  role: 'ADMIN' | 'CREATOR' | 'BRAND';
  exp: number; // Token expiration
  iat: number; // Issued at
  
  // Optional creator-specific claims
  creatorId?: string; // Links to creator profile
  creatorVerified?: boolean; // KYC verification status
}

// Authorization middleware checks
const authChecks = {
  // Admin-only endpoints
  requireAdmin: (token: JWTPayload) => token.role === 'ADMIN',
  
  // Creator-only endpoints  
  requireCreator: (token: JWTPayload) => token.role === 'CREATOR' && token.creatorId,
  
  // Statement ownership check
  canAccessStatement: async (token: JWTPayload, statementId: string) => {
    if (token.role === 'ADMIN') return true;
    
    const statement = await getStatement(statementId);
    return statement.creatorId === token.creatorId;
  },
};
```

### Field-Level Permissions

#### Statement Details Access
```typescript
// Admin view - full details
interface AdminStatementView extends RoyaltyStatementDetails {
  platformFeeCents: number; // Admin can see platform fees
  internalNotes?: string; // Admin-only notes
  calculationMetadata: any; // Full calculation details
}

// Creator view - limited details  
interface CreatorStatementView extends RoyaltyStatementDetails {
  // platformFeeCents: excluded from creator view
  // internalNotes: excluded from creator view
  // calculationMetadata: sanitized version only
}
```

---

## 7. Rate Limiting & Quotas

### Rate Limits by Endpoint Category

#### Admin Endpoints
- **List Operations**: 100 requests/minute per admin
- **Create/Update Operations**: 20 requests/minute per admin  
- **Calculation Triggers**: 5 requests/minute per admin
- **Bulk Operations**: 2 requests/minute per admin

#### Creator Endpoints  
- **View Operations**: 200 requests/minute per creator
- **Dispute Operations**: 10 requests/minute per creator

### Rate Limit Headers

All API responses include rate limiting headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string; // Max requests per window
  'X-RateLimit-Remaining': string; // Requests left in window
  'X-RateLimit-Reset': string; // Unix timestamp when window resets
  'X-RateLimit-Resource': string; // Resource identifier
}

// Example response headers
{
  'X-RateLimit-Limit': '100',
  'X-RateLimit-Remaining': '87', 
  'X-RateLimit-Reset': '1698765600',
  'X-RateLimit-Resource': 'royalty-admin-list'
}
```

### Rate Limit Exceeded Response (429)

```typescript
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 60 seconds.",
  "retryAfter": 60, // seconds
  "limit": 100,
  "resetTime": "2024-10-31T15:00:00Z"
}
```

### Quotas & Usage Limits

#### Calculation Engine Limits
- **Max Concurrent Runs**: 3 per tenant
- **Max Period Range**: 12 months per run
- **Max Statements per Run**: 10,000 creators
- **Calculation Timeout**: 5 minutes

#### Export Limits
- **PDF Generation**: 50 statements/hour per user
- **Report Downloads**: 10 reports/hour per admin
- **Data Export**: 1 full export/day per admin

---

## 8. Pagination & Filtering

### Pagination Format

Uses **offset-based pagination** for consistent ordering:

```typescript
interface PaginationRequest {
  page?: number; // 1-based page number, default: 1
  limit?: number; // Items per page, default: 20, max: 100
}

interface PaginationResponse {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Example API call
GET /api/royalties/runs?page=2&limit=50

// Response pagination
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50, 
    "totalCount": 347,
    "totalPages": 7,
    "hasNextPage": true,
    "hasPreviousPage": true
  }
}
```

### Available Filters

#### Royalty Runs Filtering
```typescript
interface RunFilters {
  status?: RoyaltyRunStatus; // Filter by run status
  sortBy?: 'periodStart' | 'periodEnd' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

#### Statements Filtering  
```typescript
interface StatementFilters {
  creatorId?: string; // Admin only - filter by creator
  runId?: string; // Filter by specific run
  status?: RoyaltyStatementStatus; // Filter by statement status
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
}
```

#### Creator Earnings Filtering
```typescript
interface EarningsFilters {
  date_from?: string; // ISO date, default: 12 months ago
  date_to?: string; // ISO date, default: today
  group_by?: 'day' | 'week' | 'month' | 'year'; // Aggregation level
}
```

### Sorting Options

#### Default Sort Orders
- **Runs**: Most recent first (`createdAt DESC`)
- **Statements**: Most recent first (`createdAt DESC`)  
- **Earnings**: Chronological (`periodStart ASC`)

#### Custom Sorting
```typescript
// Sort by earnings amount (highest first)
GET /api/royalties/statements?sortBy=totalEarningsCents&sortOrder=desc

// Sort by run period (oldest first)  
GET /api/royalties/runs?sortBy=periodStart&sortOrder=asc
```

---

## 9. Frontend Implementation Checklist

### 🔧 Initial Setup

- [ ] **Install Dependencies**
  ```bash
  npm install @tanstack/react-query zod date-fns
  npm install -D @types/react
  ```

- [ ] **API Client Setup**
  - [ ] Create base API client with authentication
  - [ ] Implement retry logic for rate limiting (429 errors)
  - [ ] Add request/response interceptors for error handling
  - [ ] Set up React Query with proper cache invalidation

- [ ] **Type Definitions**
  - [ ] Copy all TypeScript interfaces to shared types file
  - [ ] Create Zod schemas for form validation
  - [ ] Set up proper import/export structure

### 📊 Admin Dashboard Implementation

#### Royalty Runs Management
- [ ] **Runs List Page**
  - [ ] Data table with pagination
  - [ ] Status filtering (DRAFT, CALCULATED, LOCKED, etc.)
  - [ ] Date range filtering
  - [ ] Sort by period, status, created date
  - [ ] Batch actions (future: bulk operations)

- [ ] **Create Run Form**
  - [ ] Date picker for period start/end
  - [ ] Validation: end > start, no future dates
  - [ ] Overlap detection with existing runs
  - [ ] Notes field (optional, 500 char max)
  - [ ] Auto-calculate toggle

- [ ] **Run Details Page**
  - [ ] Run summary card (period, totals, status)
  - [ ] Statements table with creator info
  - [ ] Status breakdown charts
  - [ ] Validation report section
  - [ ] Lock run button (with confirmation)
  - [ ] Recalculate button (if applicable)

- [ ] **Statement Management**
  - [ ] Statement details modal/page
  - [ ] Line items table with asset info
  - [ ] Dispute management interface
  - [ ] Adjustment forms (credit/debit)
  - [ ] PDF generation and download
  - [ ] Status change tracking

#### Error Handling
- [ ] **Loading States**
  - [ ] Skeleton loaders for data tables
  - [ ] Progress indicators for calculations
  - [ ] Background job status polling

- [ ] **Error Display**  
  - [ ] Toast notifications for actions
  - [ ] Inline validation errors on forms
  - [ ] Error boundary for calculation failures
  - [ ] Retry mechanisms for failed operations

### 👤 Creator Portal Implementation

#### Earnings Dashboard
- [ ] **Overview Cards**
  - [ ] Total earnings (all time)
  - [ ] Current month projected
  - [ ] Pending payments
  - [ ] Last payment date

- [ ] **Earnings Chart**
  - [ ] Time series chart (monthly view)
  - [ ] Toggle between earnings/payments
  - [ ] Hover tooltips with details
  - [ ] Date range selector

- [ ] **Top Assets Table**
  - [ ] Asset title, type, total earnings
  - [ ] License count per asset
  - [ ] Average earnings per license
  - [ ] Link to asset details

#### Statements & History
- [ ] **Statements List**
  - [ ] Statement cards with period info
  - [ ] Status badges (PENDING, PAID, etc.)
  - [ ] Earnings amount and payment date
  - [ ] View details and download PDF links

- [ ] **Statement Details**
  - [ ] Period and run information
  - [ ] Line items table with asset breakdown
  - [ ] Dispute form (if status allows)
  - [ ] Payment status and reference
  - [ ] PDF download button

- [ ] **Payment History**
  - [ ] Chronological list of payments
  - [ ] Payment method and reference
  - [ ] Search and date filtering
  - [ ] Export to CSV functionality

### 🎨 UI/UX Considerations

#### Design System
- [ ] **Status Indicators**
  ```tsx
  // Status badge component
  const StatusBadge = ({ status }: { status: RoyaltyRunStatus }) => {
    const variants = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PROCESSING: 'bg-blue-100 text-blue-800', 
      CALCULATED: 'bg-green-100 text-green-800',
      LOCKED: 'bg-purple-100 text-purple-800',
      FAILED: 'bg-red-100 text-red-800',
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${variants[status]}`}>
        {status}
      </span>
    );
  };
  ```

- [ ] **Currency Formatting**
  ```tsx
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };
  ```

- [ ] **Date Formatting**
  ```tsx
  import { format, parseISO } from 'date-fns';
  
  const formatDate = (isoString: string) => {
    return format(parseISO(isoString), 'MMM dd, yyyy');
  };
  ```

#### Responsive Design
- [ ] Mobile-first approach for creator portal
- [ ] Desktop-optimized admin interface
- [ ] Accessible keyboard navigation
- [ ] Screen reader compatibility

### 🔧 Performance Optimizations

#### Data Fetching
- [ ] **React Query Setup**
  ```tsx
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        cacheTime: 10 * 60 * 1000, // 10 minutes
        retry: (failureCount, error: any) => {
          if (error?.status === 404) return false;
          return failureCount < 3;
        },
      },
    },
  });
  ```

- [ ] **Cache Invalidation Strategy**
  - [ ] Invalidate runs list on create/update
  - [ ] Invalidate statements on status changes
  - [ ] Refetch earnings on new payments

#### Loading & Caching
- [ ] Implement optimistic updates for non-critical actions
- [ ] Cache static data (asset info, creator names)
- [ ] Lazy load large data tables
- [ ] Implement virtual scrolling for large lists

### 🧪 Testing Strategy

#### Unit Tests
- [ ] API client functions
- [ ] Currency and date formatting utilities
- [ ] Form validation logic
- [ ] State management (if using Redux/Zustand)

#### Integration Tests  
- [ ] Complete user flows (create run → calculate → lock)
- [ ] Error handling scenarios
- [ ] Permission boundary testing
- [ ] Form submission and validation

#### E2E Tests
- [ ] Admin: Full royalty run lifecycle
- [ ] Creator: View earnings and dispute statement
- [ ] Authentication and authorization flows
- [ ] Cross-browser compatibility

### 📚 Documentation

- [ ] **API Integration Guide**
  - [ ] Authentication setup
  - [ ] Error handling patterns
  - [ ] Rate limiting considerations

- [ ] **Component Library**
  - [ ] Reusable components (tables, forms, modals)
  - [ ] Storybook stories for UI components
  - [ ] Usage examples and best practices

- [ ] **Deployment**
  - [ ] Environment configuration
  - [ ] Feature flags for gradual rollout
  - [ ] Monitoring and analytics setup

### 🚨 Edge Cases to Handle

#### Calculation Edge Cases
- [ ] Zero revenue periods (show empty state)
- [ ] Rounding differences (display reconciliation info)
- [ ] Failed calculations (show retry options)
- [ ] Long-running calculations (polling for status)

#### User Experience Edge Cases  
- [ ] No earnings history (onboarding flow)
- [ ] Disputed statements (clear dispute process)
- [ ] Network failures (offline indicators)
- [ ] Session expiration (automatic refresh)

#### Data Edge Cases
- [ ] Missing asset information (fallback display)
- [ ] Deleted creators (historical data handling)
- [ ] Currency precision (consistent decimal handling)
- [ ] Time zone handling (UTC vs local times)

---

## 🎯 Success Criteria

### Admin Success Metrics
- [ ] Can create and execute royalty runs in < 2 minutes
- [ ] 99.9% calculation accuracy with audit trail
- [ ] Sub-5-second page load times for data tables
- [ ] Zero data loss during calculations
- [ ] Clear error messages with actionable next steps

### Creator Success Metrics  
- [ ] Earnings dashboard loads in < 1 second
- [ ] Intuitive dispute process with 90%+ resolution rate
- [ ] Mobile-responsive design with 4.5+ star rating
- [ ] PDF statements accessible on all devices
- [ ] Clear payment timeline and status communication

This comprehensive integration guide should enable the frontend team to implement the Calculation Engine module without requiring clarification questions. The module handles complex financial calculations with precision while providing both administrative control and creator transparency.
