# Royalty Run Service - Frontend Integration Guide

**Classification:** ⚡ HYBRID  
- Royalty Calculation: 🔒 ADMIN ONLY (admins trigger royalty runs)
- Royalty Statements: 🌐 SHARED (creators view on website, admins manage)

## Overview

The Royalty Run Service calculates and distributes creator royalties from license revenue. This guide provides comprehensive integration details for both admin and creator interfaces.

---

## 1. API Endpoints

### 1.1 Royalty Run Management (Admin Only)

#### Create Royalty Run
- **URL:** `POST /api/royalties/run`
- **Auth:** Admin required
- **Purpose:** Initialize new royalty calculation run

**Request Schema:**
```typescript
interface CreateRoyaltyRunRequest {
  periodStart: string; // ISO 8601 datetime
  periodEnd: string;   // ISO 8601 datetime
  notes?: string;      // Optional description (max 500 chars)
  autoCalculate?: boolean; // Default: true
}
```

**Response Schema:**
```typescript
interface CreateRoyaltyRunResponse {
  success: boolean;
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

#### List Royalty Runs
- **URL:** `GET /api/royalties/runs`
- **Auth:** Admin required
- **Purpose:** List all runs with pagination and filtering

**Query Parameters:**
```typescript
interface ListRunsQuery {
  page?: string;        // Default: '1'
  limit?: string;       // Default: '20', max: 100
  status?: 'DRAFT' | 'PROCESSING' | 'CALCULATED' | 'LOCKED' | 'FAILED';
  sortBy?: 'periodStart' | 'periodEnd' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
}
```

**Response Schema:**
```typescript
interface ListRunsResponse {
  success: boolean;
  data: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    statementCount: number;
    processedAt: string | null;
    lockedAt: string | null;
    notes?: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
```

#### Get Run Details
- **URL:** `GET /api/royalties/runs/{id}`
- **Auth:** Admin required
- **Purpose:** Get detailed run information

**Response Schema:**
```typescript
interface RunDetailsResponse {
  success: boolean;
  data: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    processedAt: string | null;
    lockedAt: string | null;
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
    statements: Array<{
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
      reviewedAt: string | null;
      disputedAt: string | null;
      paidAt: string | null;
      createdAt: string;
    }>;
  };
}
```

#### Lock Run (Admin Only)
- **URL:** `POST /api/royalties/runs/{id}/lock`
- **Auth:** Admin required
- **Purpose:** Lock run to prevent modifications before payout

**Request Schema:**
```typescript
interface LockRunRequest {
  // No body parameters
}
```

**Response Schema:**
```typescript
interface LockRunResponse {
  success: boolean;
  data: {
    id: string;
    status: 'LOCKED';
    lockedAt: string;
  };
  message: string;
}
```

---

## 2. TypeScript Type Definitions

### 2.1 Core Types

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

export type AdjustmentType = 
  | 'CREDIT' 
  | 'DEBIT' 
  | 'BONUS' 
  | 'CORRECTION' 
  | 'REFUND';

// Main interfaces
export interface RoyaltyRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: RoyaltyRunStatus;
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  notes?: string;
  processedAt: string | null;
  lockedAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RoyaltyStatement {
  id: string;
  royaltyRunId: string;
  creatorId: string;
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  createdAt: string;
}

export interface RoyaltyLine {
  id: string;
  royaltyStatementId: string;
  licenseId: string;
  ipAssetId: string;
  revenueCents: number;
  shareBps: number;
  calculatedRoyaltyCents: number;
  periodStart: string;
  periodEnd: string;
  metadata?: Record<string, any>;
}
```

### 2.2 Validation Schemas (Zod)

```typescript
import { z } from 'zod';

// Create run validation
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

// List runs validation
export const listRunsSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: z.enum(['DRAFT', 'PROCESSING', 'CALCULATED', 'LOCKED', 'FAILED']).optional(),
  sortBy: z.enum(['periodStart', 'periodEnd', 'createdAt', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Export for frontend use
export type CreateRoyaltyRunInput = z.infer<typeof createRoyaltyRunSchema>;
export type ListRunsInput = z.infer<typeof listRunsSchema>;
```

---

## 3. Business Logic & Validation Rules

### 3.1 Run Creation Rules

1. **Period Validation:**
   - `periodEnd` must be after `periodStart`
   - `periodEnd` cannot be in the future
   - Maximum period length: 1 year
   - Minimum period length: 1 day

2. **Overlap Prevention:**
   - System automatically checks for overlapping periods
   - Returns `409 Conflict` if overlap detected

3. **Status Transitions:**
   ```
   DRAFT → PROCESSING → CALCULATED → LOCKED
              ↓
            FAILED
   ```

### 3.2 Calculation Engine Rules

1. **Revenue Processing:**
   - Pro-rates flat-fee licenses based on active days in period
   - Aggregates usage-based revenue (future enhancement)
   - Handles currency conversion (all amounts in cents)

2. **Ownership Distribution:**
   - Uses basis points (1/100th of 1%) for precise calculations
   - Banker's rounding for fairness
   - Reconciles rounding differences across creators

3. **Minimum Thresholds:**
   - Default: $25.00 minimum payout
   - Below threshold = balance carried forward
   - VIP creators may have lower thresholds

### 3.3 Statement Generation Rules

1. **Status Assignment:**
   - `PENDING`: Meets payout threshold
   - `REVIEWED`: Below threshold (carried forward)

2. **Line Item Types:**
   - Regular earnings from licenses
   - `CARRYOVER`: Unpaid balance from previous periods
   - `THRESHOLD_NOTE`: Explanation for deferred payment

---

## 4. Error Handling

### 4.1 HTTP Status Codes

| Status | Error Type | When It Occurs |
|--------|------------|----------------|
| `400` | Bad Request | Invalid input data, malformed JSON |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Insufficient permissions (not admin) |
| `404` | Not Found | Run/statement doesn't exist |
| `409` | Conflict | Overlapping periods, already locked |
| `412` | Precondition Failed | Invalid state transition |
| `422` | Unprocessable Entity | Valid JSON but business rule violation |
| `500` | Internal Server Error | Calculation failures, database errors |

### 4.2 Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string;           // Error category
  message: string;         // Human-readable description
  details?: Array<{        // Validation errors (if applicable)
    field: string;
    message: string;
  }>;
  code?: string;          // Specific error code for client handling
}
```

### 4.3 Specific Error Types

#### Validation Errors (400)
```typescript
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

#### Period Overlap (409)
```typescript
{
  "success": false,
  "error": "Conflict",
  "message": "A royalty run already exists for the period 2025-01-01 to 2025-01-31",
  "code": "PERIOD_OVERLAP"
}
```

#### Invalid State Transition (412)
```typescript
{
  "success": false,
  "error": "Precondition Failed",
  "message": "Run must be in CALCULATED status, currently PROCESSING",
  "code": "INVALID_STATE"
}
```

#### Calculation Failure (500)
```typescript
{
  "success": false,
  "error": "Internal server error",
  "message": "Royalty calculation failed: Database connection timeout",
  "code": "CALCULATION_ERROR"
}
```

---

## 5. Authorization & Permissions

### 5.1 Role-Based Access

| Endpoint | Admin | Creator | Notes |
|----------|-------|---------|-------|
| `POST /api/royalties/run` | ✅ | ❌ | Only admins can create runs |
| `GET /api/royalties/runs` | ✅ | ❌ | Admin dashboard view only |
| `GET /api/royalties/runs/{id}` | ✅ | ❌ | Detailed admin view |
| `POST /api/royalties/runs/{id}/lock` | ✅ | ❌ | Finalization step |

### 5.2 Authentication Headers

All requests require:
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### 5.3 Permission Validation

Backend validates:
1. Valid JWT token
2. User exists and is active
3. User has `ADMIN` role for admin endpoints
4. User owns resource for creator endpoints

---

## 6. Rate Limiting & Quotas

### 6.1 Rate Limits

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `POST /api/royalties/run` | 10 requests | 1 hour | Prevents duplicate runs |
| `GET /api/royalties/runs` | 100 requests | 1 minute | Dashboard listing |
| `GET /api/royalties/runs/{id}` | 200 requests | 1 minute | Detail views |

### 6.2 Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

### 6.3 Rate Limit Exceeded Response

```typescript
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 60 seconds.",
  "retryAfter": 60
}
```

---

## 7. Real-time Updates

### 7.1 WebSocket Events

Subscribe to run status updates:

```typescript
// Connect to WebSocket
const ws = new WebSocket('wss://ops.yesgoddess.agency/ws');

// Subscribe to run updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'royalty.runs',
  runId: 'specific-run-id' // Optional: subscribe to specific run
}));

// Listen for events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'royalty.run.status_changed':
      // Update UI with new status
      updateRunStatus(data.runId, data.status);
      break;
      
    case 'royalty.calculation.progress':
      // Show calculation progress
      updateProgress(data.runId, data.progress);
      break;
      
    case 'royalty.calculation.completed':
      // Refresh run data
      refreshRunDetails(data.runId);
      break;
  }
};
```

### 7.2 Polling Alternative

For clients that can't use WebSockets:

```typescript
// Poll for status updates every 5 seconds during calculation
const pollRunStatus = async (runId: string) => {
  const response = await fetch(`/api/royalties/runs/${runId}`);
  const data = await response.json();
  
  if (data.data.status === 'PROCESSING') {
    // Continue polling
    setTimeout(() => pollRunStatus(runId), 5000);
  } else {
    // Calculation complete or failed
    handleStatusUpdate(data.data);
  }
};
```

---

## 8. Pagination & Filtering

### 8.1 Pagination Format

Uses offset-based pagination:

```typescript
interface PaginationMeta {
  page: number;           // Current page (1-indexed)
  limit: number;          // Items per page
  totalCount: number;     // Total items available
  totalPages: number;     // Total pages available
  hasNextPage: boolean;   // Whether next page exists
  hasPreviousPage: boolean; // Whether previous page exists
}
```

### 8.2 Frontend Pagination Component

```typescript
interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange }) => {
  return (
    <div className="flex items-center justify-between">
      <span>
        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
        {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of{' '}
        {pagination.totalCount} results
      </span>
      
      <div className="flex gap-2">
        <button
          disabled={!pagination.hasPreviousPage}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </button>
        
        <span>Page {pagination.page} of {pagination.totalPages}</span>
        
        <button
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};
```

### 8.3 Filter Parameters

```typescript
interface RunFilters {
  status?: RoyaltyRunStatus;
  dateRange?: {
    start: string;
    end: string;
  };
  createdBy?: string;       // Admin user ID
  sortBy?: 'periodStart' | 'periodEnd' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

---

## 9. Frontend Implementation Checklist

### 9.1 Admin Dashboard Tasks

- [ ] **Run Management Interface**
  - [ ] Create new royalty run form with date pickers
  - [ ] Validate period dates (no future dates, no overlaps)
  - [ ] List all runs with status badges
  - [ ] Filter runs by status and date range
  - [ ] Pagination for large run lists

- [ ] **Run Details View**
  - [ ] Display run summary statistics
  - [ ] Show calculation progress during processing
  - [ ] List all statements with creator info
  - [ ] Handle locked runs (read-only mode)

- [ ] **Status Management**
  - [ ] Real-time status updates via WebSocket
  - [ ] Progress indicators for long calculations
  - [ ] Lock button for calculated runs
  - [ ] Confirmation dialogs for destructive actions

### 9.2 Error Handling Tasks

- [ ] **User-Friendly Messages**
  - [ ] Map error codes to user messages
  - [ ] Show field-specific validation errors
  - [ ] Toast notifications for async operations
  - [ ] Retry mechanisms for failed operations

- [ ] **Edge Cases**
  - [ ] Handle network timeouts gracefully
  - [ ] Show loading states during API calls
  - [ ] Prevent double-submission of forms
  - [ ] Cache data to reduce API calls

### 9.3 UX Considerations

- [ ] **Performance**
  - [ ] Debounce search inputs
  - [ ] Virtualize large lists if needed
  - [ ] Lazy load run details
  - [ ] Optimistic updates where safe

- [ ] **Accessibility**
  - [ ] Keyboard navigation for all controls
  - [ ] Screen reader support for status changes
  - [ ] High contrast mode compatibility
  - [ ] Focus management in modals

---

## 10. Sample Implementation

### 10.1 API Client Setup

```typescript
class RoyaltyRunAPI {
  private baseUrl = '/api/royalties';
  
  async createRun(data: CreateRoyaltyRunInput): Promise<CreateRoyaltyRunResponse> {
    const response = await fetch(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new APIError(response.status, error);
    }
    
    return response.json();
  }
  
  async listRuns(params: ListRunsInput): Promise<ListRunsResponse> {
    const searchParams = new URLSearchParams(params as any);
    const response = await fetch(`${this.baseUrl}/runs?${searchParams}`);
    
    if (!response.ok) {
      throw new APIError(response.status, await response.json());
    }
    
    return response.json();
  }
  
  async getRunDetails(runId: string): Promise<RunDetailsResponse> {
    const response = await fetch(`${this.baseUrl}/runs/${runId}`);
    
    if (!response.ok) {
      throw new APIError(response.status, await response.json());
    }
    
    return response.json();
  }
  
  private getToken(): string {
    return localStorage.getItem('auth_token') || '';
  }
}

class APIError extends Error {
  constructor(
    public status: number,
    public details: ErrorResponse
  ) {
    super(details.message);
  }
}
```

### 10.2 React Hook for Run Management

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useRoyaltyRuns = (filters: ListRunsInput = {}) => {
  return useQuery({
    queryKey: ['royalty-runs', filters],
    queryFn: () => royaltyAPI.listRuns(filters),
    staleTime: 30000, // Cache for 30 seconds
  });
};

export const useCreateRoyaltyRun = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateRoyaltyRunInput) => royaltyAPI.createRun(data),
    onSuccess: () => {
      // Invalidate runs list to refresh data
      queryClient.invalidateQueries({ queryKey: ['royalty-runs'] });
    },
    onError: (error: APIError) => {
      // Handle error (show toast, etc.)
      console.error('Failed to create run:', error.details);
    },
  });
};

export const useRunDetails = (runId: string) => {
  return useQuery({
    queryKey: ['royalty-run', runId],
    queryFn: () => royaltyAPI.getRunDetails(runId),
    enabled: !!runId,
  });
};
```

### 10.3 Create Run Form Component

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export const CreateRunForm: React.FC = () => {
  const createMutation = useCreateRoyaltyRun();
  
  const form = useForm<CreateRoyaltyRunInput>({
    resolver: zodResolver(createRoyaltyRunSchema),
    defaultValues: {
      autoCalculate: true,
    },
  });
  
  const onSubmit = (data: CreateRoyaltyRunInput) => {
    createMutation.mutate(data);
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label>Period Start</label>
        <input
          type="datetime-local"
          {...form.register('periodStart')}
        />
        {form.formState.errors.periodStart && (
          <span className="text-red-500">
            {form.formState.errors.periodStart.message}
          </span>
        )}
      </div>
      
      <div>
        <label>Period End</label>
        <input
          type="datetime-local"
          {...form.register('periodEnd')}
        />
        {form.formState.errors.periodEnd && (
          <span className="text-red-500">
            {form.formState.errors.periodEnd.message}
          </span>
        )}
      </div>
      
      <div>
        <label>Notes (Optional)</label>
        <textarea
          {...form.register('notes')}
          placeholder="Description of this royalty run..."
          maxLength={500}
        />
      </div>
      
      <div>
        <label>
          <input
            type="checkbox"
            {...form.register('autoCalculate')}
          />
          Start calculation immediately
        </label>
      </div>
      
      <button
        type="submit"
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? 'Creating...' : 'Create Run'}
      </button>
    </form>
  );
};
```

This completes Part 1 of the Royalty Run Service integration guide focusing on the core run management functionality. The next document will cover Statement Management and Creator interfaces.
