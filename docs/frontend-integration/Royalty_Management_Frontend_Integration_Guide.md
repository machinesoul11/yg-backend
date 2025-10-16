# Royalty Management Module - Frontend Integration Guide

⚡ **HYBRID Module** - Core functionality used by both admin staff and creators with different access levels

## Table of Contents
1. [API Endpoints](#api-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Business Logic & Validation Rules](#business-logic--validation-rules)
4. [Error Handling](#error-handling)
5. [Authorization & Permissions](#authorization--permissions)
6. [Rate Limiting & Quotas](#rate-limiting--quotas)
7. [Pagination & Filtering](#pagination--filtering)
8. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## 1. API Endpoints

### Admin Endpoints (🔒 ADMIN ONLY)

#### Royalty Run Management

##### `POST /api/royalties/run`
**Create and optionally calculate a new royalty run**

```typescript
// Request
interface CreateRunRequest {
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime  
  notes?: string; // max 500 chars, optional
  autoCalculate?: boolean; // default: true
}

// Response
interface CreateRunResponse {
  success: true;
  data: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: 'DRAFT' | 'PROCESSING';
    notes?: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    createdAt: string;
  };
  message: string;
}
```

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

##### `GET /api/royalties/runs/:id`
**Get detailed run information**

```typescript
// Response
interface GetRunResponse {
  success: true;
  data: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    processedAt?: string;
    lockedAt?: string;
    notes?: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    createdAt: string;
    updatedAt: string;
    summary: {
      totalCreators: number;
      totalLineItems: number;
      statementsByStatus: Record<string, number>;
      averageEarningsPerCreator: number;
    };
    statements: RoyaltyStatementSummary[];
  };
}
```

##### `POST /api/royalties/runs/:id/lock`
**Finalize and lock a royalty run**

```typescript
// No request body required

// Response
interface LockRunResponse {
  success: true;
  data: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: 'LOCKED';
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    statementCount: number;
    processedAt?: string;
    lockedAt: string;
    lockedBy: {
      id: string;
      name: string;
      email: string;
    };
    createdAt: string;
    updatedAt: string;
  };
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

// Response
interface ListStatementsResponse {
  success: true;
  data: RoyaltyStatementSummary[];
  pagination: PaginationMetadata;
}
```

##### `GET /api/royalties/statements/:id`
**Get detailed statement with metadata**

```typescript
// Response
interface GetStatementResponse {
  success: true;
  data: {
    id: string;
    royaltyRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: string;
      lockedAt?: string;
      createdBy: {
        id: string;
        name: string;
        email: string;
      };
    };
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
    reviewedAt?: string;
    disputedAt?: string;
    disputeReason?: string;
    paidAt?: string;
    paymentReference?: string;
    pdfStorageKey?: string;
    pdfGeneratedAt?: string;
    metadata?: any;
    createdAt: string;
    updatedAt: string;
    summary: {
      totalLineItems: number;
      totalRevenueCents: number;
      lineItemsByAsset: Array<{
        assetId: string;
        assetTitle: string;
        totalRevenueCents: number;
        totalRoyaltyCents: number;
        lineCount: number;
      }>;
    };
  };
}
```

##### `GET /api/royalties/statements/:id/lines`
**Get statement line items with pagination**

```typescript
// Request
interface GetStatementLinesRequest {
  page?: string; // default: "1"
  limit?: string; // default: "50", max: "500"
  sortBy?: 'createdAt' | 'calculatedRoyaltyCents' | 'revenueCents';
  sortOrder?: 'asc' | 'desc';
}

// Response
interface GetStatementLinesResponse {
  success: true;
  data: RoyaltyLineItem[];
  pagination: PaginationMetadata;
  summary: {
    totalRevenueCents: number;
    totalRoyaltyCents: number;
  };
}
```

### Creator Endpoints (🌐 SHARED)

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
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
}

// Response
interface GetCreatorStatementsResponse {
  success: true;
  data: RoyaltyStatementSummary[];
  summary: {
    totalEarnings: number;
    totalPaid: number;
    totalPending: number;
    statementCount: number;
  };
  pagination: PaginationMetadata;
}
```

##### `GET /api/me/royalties/earnings`
**Get creator's earnings analytics**

```typescript
// Request
interface GetEarningsRequest {
  date_from?: string; // ISO date, default: 12 months ago
  date_to?: string; // ISO date, default: now
  group_by?: 'day' | 'week' | 'month' | 'year'; // default: 'month'
}

// Response
interface GetEarningsResponse {
  success: true;
  data: {
    timeSeriesData: Array<{
      period: string;
      earningsCents: number;
      paidCents: number;
      statementCount: number;
    }>;
    summary: {
      totalEarningsCents: number;
      avgEarningsPerPeriodCents: number;
      highestEarningPeriod: {
        period: string;
        earningsCents: number;
      };
      lowestEarningPeriod: {
        period: string;
        earningsCents: number;
      };
    };
  };
}
```

##### `GET /api/me/royalties/history`
**Get creator's earnings history with trends**

```typescript
// Request
interface GetEarningsHistoryRequest {
  granularity?: 'monthly' | 'quarterly' | 'yearly';
  startDate?: string;
  endDate?: string;
}

// Response  
interface GetEarningsHistoryResponse {
  success: true;
  data: {
    timeSeriesData: Array<{
      period: string;
      earningsCents: number;
      statementCount: number;
    }>;
    analytics: {
      totalEarnings: number;
      averageEarningsPerPeriod: number;
      highestPeriod: { period: string; earnings: number };
      lowestPeriod: { period: string; earnings: number };
      trendDirection: 'UP' | 'DOWN' | 'STABLE';
      growthRate: number;
    };
  };
}
```

---

## 2. TypeScript Type Definitions

### Core Interfaces

```typescript
// Enums
export type RoyaltyRunStatus = 
  | 'DRAFT' 
  | 'PROCESSING' 
  | 'CALCULATED' 
  | 'LOCKED' 
  | 'FAILED';

export type RoyaltyStatementStatus = 
  | 'PENDING' 
  | 'REVIEWED' 
  | 'DISPUTED' 
  | 'RESOLVED' 
  | 'PAID';

// Core Data Types
export interface RoyaltyRunSummary {
  id: string;
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime
  status: RoyaltyRunStatus;
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  statementsCount: number;
  processedAt?: string; // ISO datetime
  lockedAt?: string; // ISO datetime
  notes?: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface RoyaltyStatementSummary {
  id: string;
  period: {
    start: string; // ISO datetime
    end: string; // ISO datetime
  };
  creator?: {
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
  reviewedAt?: string; // ISO datetime
  disputedAt?: string; // ISO datetime
  disputeReason?: string;
  paidAt?: string; // ISO datetime
  paymentReference?: string;
  pdfAvailable: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface RoyaltyLineItem {
  id: string;
  ipAsset: {
    id: string;
    title: string;
    type: string;
    description?: string;
  };
  license: {
    id: string;
    licenseType: string;
    status: string;
    brand: {
      id: string;
      companyName: string;
    };
  };
  revenueCents: number;
  shareBps: number; // Basis points (8000 = 80%)
  calculatedRoyaltyCents: number;
  periodStart: string; // ISO datetime
  periodEnd: string; // ISO datetime
  metadata?: any;
  createdAt: string; // ISO datetime
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Standard API Response Wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

// Export these schemas for frontend form validation
export const royaltyRunStatusSchema = z.enum([
  'DRAFT',
  'CALCULATED', 
  'LOCKED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const royaltyStatementStatusSchema = z.enum([
  'PENDING',
  'REVIEWED', 
  'DISPUTED',
  'RESOLVED',
  'PAID',
]);

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

export const listStatementsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: royaltyStatementStatusSchema.optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});
```

---

## 3. Business Logic & Validation Rules

### Royalty Run Rules

1. **Period Validation**
   - `periodStart` must be before `periodEnd`
   - `periodEnd` cannot be in the future
   - Cannot create overlapping periods

2. **Status Transitions**
   - `DRAFT` → `PROCESSING` (when calculation starts)
   - `PROCESSING` → `CALCULATED` (when calculation completes)
   - `PROCESSING` → `FAILED` (if calculation fails)
   - `CALCULATED` → `LOCKED` (admin action, irreversible)

3. **Locking Rules**
   - Can only lock runs in `CALCULATED` status
   - Cannot lock if any statements are in `DISPUTED` status
   - Once locked, no modifications are allowed

### Statement Rules

1. **Status Workflow**
   - New statements start as `PENDING`
   - Creators can review: `PENDING` → `REVIEWED`
   - Creators can dispute: `PENDING` → `DISPUTED`
   - Admin resolves: `DISPUTED` → `RESOLVED`
   - Payouts change: `REVIEWED`/`RESOLVED` → `PAID`

2. **Currency Rules**
   - All amounts stored as cents (integers)
   - Display: divide by 100 for dollars
   - Minimum payout: typically $50.00 (5000 cents)

3. **Calculations**
   - `netPayableCents = totalEarningsCents - platformFeeCents`
   - Platform fee typically 10-15% of earnings
   - Royalty percentage stored as basis points (8000 = 80%)

### Access Control Rules

1. **Admin Access**
   - Can view all runs and statements
   - Can create, calculate, and lock runs
   - Can resolve disputes
   - Can filter by any creator

2. **Creator Access**
   - Can only view their own statements
   - Can review and dispute their statements
   - Cannot see other creators' data
   - Cannot perform admin actions

---

## 4. Error Handling

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200  | OK | Successful GET requests |
| 201  | Created | Successful POST requests |
| 400  | Bad Request | Validation errors, invalid state |
| 401  | Unauthorized | Missing or invalid authentication |
| 403  | Forbidden | Insufficient permissions |
| 404  | Not Found | Resource doesn't exist |
| 409  | Conflict | Business rule violation |
| 500  | Internal Server Error | Unexpected errors |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string; // Error type identifier
  message: string; // Human-readable message
  details?: Array<{ // Validation error details
    field: string;
    message: string;
  }>;
}
```

### Common Error Scenarios

#### Validation Errors (400)
```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "field": "periodEnd",
      "message": "Period end must be after period start"
    }
  ]
}
```

#### Authorization Errors (401)
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

#### Permission Errors (403)
```json
{
  "success": false,
  "error": "Forbidden", 
  "message": "Admin access required"
}
```

#### Business Logic Errors (400)
```json
{
  "success": false,
  "error": "Invalid state",
  "message": "Run must be in CALCULATED status to lock. Current status: DRAFT"
}
```

#### Not Found Errors (404)
```json
{
  "success": false,
  "error": "Not found",
  "message": "Royalty run with ID abc123 not found"
}
```

### Frontend Error Handling Strategy

```typescript
// Error handling utility
export const handleApiError = (error: any) => {
  if (error.response?.data?.success === false) {
    const apiError = error.response.data;
    
    // Validation errors - show field-specific messages
    if (apiError.details) {
      return {
        type: 'validation',
        errors: apiError.details.reduce((acc, detail) => ({
          ...acc,
          [detail.field]: detail.message
        }), {})
      };
    }
    
    // Business logic errors - show user-friendly message
    if (apiError.error === 'Invalid state') {
      return {
        type: 'business',
        message: apiError.message
      };
    }
    
    // Auth errors - redirect to login
    if (apiError.error === 'Unauthorized') {
      return {
        type: 'auth',
        message: 'Please log in to continue'
      };
    }
  }
  
  // Generic error
  return {
    type: 'generic',
    message: 'An unexpected error occurred. Please try again.'
  };
};
```

---

## 5. Authorization & Permissions

### Role-Based Access Matrix

| Endpoint | Admin | Creator | Notes |
|----------|-------|---------|-------|
| `POST /royalties/run` | ✅ | ❌ | Admin only - financial operations |
| `GET /royalties/runs` | ✅ | ❌ | Admin only - sensitive data |
| `GET /royalties/runs/:id` | ✅ | ❌ | Admin only - complete run details |
| `POST /royalties/runs/:id/lock` | ✅ | ❌ | Admin only - finalizes payments |
| `GET /royalties/statements` | ✅ | ✅ | Creators see own statements only |
| `GET /royalties/statements/:id` | ✅ | ✅* | *Creators: own statements only |
| `GET /royalties/statements/:id/lines` | ✅ | ✅* | *Creators: own statements only |
| `GET /me/royalties/statements` | ❌ | ✅ | Creator-specific endpoint |
| `GET /me/royalties/earnings` | ❌ | ✅ | Creator-specific endpoint |
| `GET /me/royalties/history` | ❌ | ✅ | Creator-specific endpoint |

### Permission Implementation

```typescript
// Check user permissions before API calls
export const checkRoyaltyPermissions = (
  userRole: string, 
  endpoint: string, 
  resourceOwner?: string,
  currentUserId?: string
) => {
  const isAdmin = userRole === 'ADMIN';
  const isCreator = userRole === 'CREATOR';
  
  // Admin endpoints
  if (endpoint.includes('/royalties/run')) return isAdmin;
  if (endpoint.includes('/royalties/runs')) return isAdmin;
  
  // Shared endpoints with ownership check
  if (endpoint.includes('/royalties/statements')) {
    if (isAdmin) return true;
    if (isCreator && resourceOwner === currentUserId) return true;
    return false;
  }
  
  // Creator-only endpoints  
  if (endpoint.includes('/me/royalties')) return isCreator;
  
  return false;
};
```

### Authentication Headers

```typescript
// Include in all requests
const headers = {
  'Authorization': `Bearer ${accessToken}`, // JWT token
  'Content-Type': 'application/json',
  // Or use cookies for session-based auth
};
```

---

## 6. Rate Limiting & Quotas

### Rate Limits by Endpoint

| Endpoint Category | Limit | Window | Headers |
|------------------|-------|---------|---------|
| Admin Run Operations | 10 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| Statement Queries | 100 requests | 1 hour | `X-RateLimit-Reset` |
| Creator Analytics | 50 requests | 1 hour | Rate limit status |

### Rate Limit Headers

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string; // Maximum requests allowed
  'X-RateLimit-Remaining': string; // Requests left in window  
  'X-RateLimit-Reset': string; // Unix timestamp when limit resets
}
```

### Handling Rate Limits

```typescript
// Check rate limit headers in response
export const checkRateLimit = (headers: Headers) => {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '0');
  const reset = parseInt(headers.get('X-RateLimit-Reset') || '0');
  
  if (remaining < 5) {
    const resetDate = new Date(reset * 1000);
    console.warn(`Rate limit approaching. Resets at ${resetDate}`);
  }
  
  return {
    remaining,
    resetAt: new Date(reset * 1000)
  };
};

// Handle 429 responses
export const handleRateLimit = async (error: any) => {
  if (error.response?.status === 429) {
    const resetHeader = error.response.headers['x-ratelimit-reset'];
    const resetTime = resetHeader ? parseInt(resetHeader) * 1000 : Date.now() + 60000;
    const waitTime = resetTime - Date.now();
    
    throw new Error(`Rate limited. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
  }
};
```

---

## 7. Pagination & Filtering

### Pagination Format

All paginated endpoints use **offset-based pagination**:

```typescript
interface PaginationParams {
  page?: number; // 1-based page number (default: 1)
  limit?: number; // Items per page (default: 20, max varies by endpoint)
}

interface PaginationResponse {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Filtering Options

#### Runs Filtering
```typescript
interface RunsFilters {
  status?: RoyaltyRunStatus;
  sortBy?: 'periodStart' | 'periodEnd' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

#### Statements Filtering
```typescript
interface StatementsFilters {
  status?: RoyaltyStatementStatus;
  creatorId?: string; // Admin only
  runId?: string;
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
}
```

### Pagination Implementation

```typescript
// React Query example with pagination
export const useRoyaltyStatements = (filters: StatementsFilters = {}) => {
  return useQuery({
    queryKey: ['royalty-statements', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '20',
        ...filters,
      });
      
      const response = await fetch(`/api/royalties/statements?${params}`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to fetch statements');
      return response.json();
    },
  });
};

// Pagination component helper
export const usePaginationHelpers = (pagination: PaginationResponse) => {
  const getPageRange = () => {
    const delta = 2; // Show 2 pages before/after current
    const start = Math.max(1, pagination.page - delta);
    const end = Math.min(pagination.totalPages, pagination.page + delta);
    
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  
  return {
    pageRange: getPageRange(),
    showPrevious: pagination.hasPreviousPage,
    showNext: pagination.hasNextPage,
    isFirstPage: pagination.page === 1,
    isLastPage: pagination.page === pagination.totalPages,
  };
};
```

---

## 8. Frontend Implementation Checklist

### 1. Authentication Setup
- [ ] Implement JWT token storage and refresh
- [ ] Add authentication interceptors to API client
- [ ] Handle 401 responses with redirect to login
- [ ] Store user role for permission checks

### 2. API Client Layer
- [ ] Create typed API client using fetch or axios
- [ ] Implement request/response interceptors
- [ ] Add retry logic for transient failures
- [ ] Handle rate limiting (429 responses)

```typescript
// Example API client structure
class RoyaltyApiClient {
  async createRun(data: CreateRunRequest): Promise<CreateRunResponse> { }
  async listRuns(params: ListRunsRequest): Promise<ListRunsResponse> { }
  async getRun(id: string): Promise<GetRunResponse> { }
  async lockRun(id: string): Promise<LockRunResponse> { }
  async listStatements(params: ListStatementsRequest): Promise<ListStatementsResponse> { }
  async getStatement(id: string): Promise<GetStatementResponse> { }
  async getStatementLines(id: string, params: GetStatementLinesRequest): Promise<GetStatementLinesResponse> { }
}
```

### 3. State Management
- [ ] Set up React Query for server state
- [ ] Implement optimistic updates for non-critical actions
- [ ] Cache strategies for different data types
- [ ] Background refetching for real-time data

```typescript
// React Query setup example
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Key factories for consistent cache management
export const royaltyKeys = {
  all: ['royalties'] as const,
  runs: () => [...royaltyKeys.all, 'runs'] as const,
  run: (id: string) => [...royaltyKeys.runs(), id] as const,
  statements: () => [...royaltyKeys.all, 'statements'] as const,
  statement: (id: string) => [...royaltyKeys.statements(), id] as const,
  creatorStatements: (filters: any) => [...royaltyKeys.statements(), 'creator', filters] as const,
};
```

### 4. Form Validation
- [ ] Implement Zod schemas for client-side validation
- [ ] Add real-time validation feedback
- [ ] Handle server-side validation errors
- [ ] Provide clear error messages

```typescript
// Form validation example using react-hook-form + Zod
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const CreateRunForm = () => {
  const form = useForm<CreateRunRequest>({
    resolver: zodResolver(createRoyaltyRunSchema),
    defaultValues: {
      autoCalculate: true,
    },
  });
  
  // Handle form submission with proper error handling
};
```

### 5. Permission-Based UI
- [ ] Implement role-based component rendering
- [ ] Hide admin features from creators
- [ ] Show appropriate error messages for unauthorized actions
- [ ] Gracefully handle permission changes

```typescript
// Permission wrapper component
const PermissionGate = ({ 
  roles, 
  fallback, 
  children 
}: { 
  roles: string[]; 
  fallback?: React.ReactNode; 
  children: React.ReactNode; 
}) => {
  const { user } = useAuth();
  
  if (!roles.includes(user.role)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
};

// Usage
<PermissionGate roles={['ADMIN']} fallback={<div>Access denied</div>}>
  <CreateRunButton />
</PermissionGate>
```

### 6. Data Display Components
- [ ] Currency formatting helpers
- [ ] Date/time formatting with timezone handling
- [ ] Status badges with appropriate styling
- [ ] Percentage calculations for royalty shares
- [ ] Pagination controls

```typescript
// Utility functions
export const formatCurrency = (cents: number) => 
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);

export const formatBasisPoints = (bps: number) => 
  `${(bps / 100).toFixed(1)}%`;

export const formatDate = (isoString: string) =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString));
```

### 7. Error Handling
- [ ] Global error boundary for unhandled errors
- [ ] Toast notifications for user actions
- [ ] Retry mechanisms for failed requests
- [ ] Offline state handling

### 8. Performance Optimization
- [ ] Implement virtual scrolling for large lists
- [ ] Lazy load statement details
- [ ] Debounce search and filter inputs
- [ ] Optimize re-renders with React.memo

### 9. Testing Strategy
- [ ] Unit tests for API client functions
- [ ] Integration tests for key user flows
- [ ] Mock API responses for development
- [ ] Test error scenarios and edge cases

### 10. Accessibility
- [ ] Keyboard navigation support
- [ ] Screen reader compatibility
- [ ] Color contrast compliance
- [ ] Focus management in modals/overlays

---

## Additional Notes

### Currency Handling
- All monetary values are stored and transmitted as **cents (integers)**
- Always divide by 100 when displaying to users
- Use `Intl.NumberFormat` for proper currency formatting
- Be careful with floating-point arithmetic

### Date Handling
- All dates are in **ISO 8601 format** with timezone information
- Use `Date.toISOString()` when sending to API
- Consider user timezone for display purposes
- Period calculations are inclusive of start date, exclusive of end date

### Performance Considerations
- Statement line items can be numerous (500+ per statement)
- Implement pagination and virtual scrolling
- Cache frequently accessed data (run summaries, creator info)
- Consider implementing search functionality server-side

### Security
- Never expose sensitive data in error messages
- Validate all inputs client-side and server-side
- Implement proper CSRF protection
- Log security events for audit purposes

This completes the comprehensive frontend integration guide for the Royalty Management module. The frontend team should now have all the information needed to implement the UI without additional backend clarification.
