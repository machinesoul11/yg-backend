# Statement Generation Module - Frontend Integration Guide

**Classification:** ⚡ HYBRID
- PDF Generation - 🔒 ADMIN ONLY (admins trigger PDF generation) 
- Statement Viewing - 🌐 SHARED (creators view on website, admins manage)
- Dispute Handling - 🌐 SHARED (creators dispute via website, admins resolve)
- Statement Downloads - 🌐 SHARED (creators download PDFs via website)

---

## 1. API Endpoints

### Creator Endpoints (🌐 SHARED - Website Access)

#### `GET /api/me/royalties/statements`
**Get authenticated creator's royalty statements**

```typescript
// Query Parameters
interface CreatorStatementsQuery {
  page?: string;           // Default: '1'
  limit?: string;          // Default: '20', max 100
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
  date_from?: string;      // ISO date string
  date_to?: string;        // ISO date string
}

// Response
interface CreatorStatementsResponse {
  success: true;
  data: CreatorStatementSummary[];
  summary: {
    totalEarnings: number;     // cents, lifetime total
    totalPaid: number;         // cents, total paid out
    totalPending: number;      // cents, pending payment
    statementCount: number;    // total statements
  };
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface CreatorStatementSummary {
  id: string;
  period: {
    start: string;           // ISO datetime
    end: string;             // ISO datetime
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  lineItemCount: number;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfAvailable: boolean;     // True if PDF exists
  createdAt: string;
  updatedAt: string;
}
```

#### `POST /api/royalties/statements/:id/dispute`
**Submit a dispute for a statement (Creator Only)**

```typescript
// Request Body
interface DisputeStatementRequest {
  reason: string;                    // 10-2000 chars, main dispute reason
  description?: string;              // Optional detailed explanation
  evidenceUrls?: string[];           // URLs to supporting documents
}

// Response  
interface DisputeStatementResponse {
  success: true;
  data: {
    id: string;
    status: 'DISPUTED';
    disputedAt: string;              // ISO datetime
    disputeReason: string;
    message: 'Dispute submitted successfully';
  };
  meta: {
    nextSteps: string[];             // What happens next
    supportContact: string;          // Email for support
  };
}
```

### Admin & Creator Shared Endpoints (⚡ HYBRID)

#### `GET /api/royalties/statements`
**List statements with admin filtering**

```typescript
// Query Parameters (Admin has extra filters)
interface ListStatementsQuery {
  page?: string;           // Default: '1'
  limit?: string;          // Default: '20', max 100
  creatorId?: string;      // 🔒 Admin only - filter by creator
  runId?: string;          // Filter by royalty run
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc';
}

// Response (same structure for both roles)
interface ListStatementsResponse {
  success: true;
  data: RoyaltyStatementSummary[];
  pagination: PaginationMeta;
}

interface RoyaltyStatementSummary {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string;     // ISO datetime
    periodEnd: string;       // ISO datetime
    status: RoyaltyRunStatus;
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
  lineItemCount: number;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### `GET /api/royalties/statements/:id`
**Get detailed statement information**

```typescript
// Response
interface StatementDetailsResponse {
  success: true;
  data: RoyaltyStatementDetails;
}

interface RoyaltyStatementDetails {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    lockedAt: string | null;
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
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfStorageKey?: string;      // Internal use
  pdfGeneratedAt: string | null;
  metadata?: Record<string, any>; // Correction history, etc.
  createdAt: string;
  updatedAt: string;
  summary: {
    totalLineItems: number;
    totalRevenueCents: number;
    lineItemsByAsset: Array<{
      ipAsset: {
        id: string;
        title: string;
        type: string;
      };
      totalRevenueCents: number;
      totalRoyaltyCents: number;
      lineCount: number;
    }>;
  };
}
```

#### `GET /api/royalties/statements/:id/lines`
**Get line items for a statement**

```typescript
// Query Parameters
interface StatementLinesQuery {
  page?: string;           // Default: '1'
  limit?: string;          // Default: '50', max 500
  sortBy?: 'createdAt' | 'calculatedRoyaltyCents' | 'revenueCents';
  sortOrder?: 'asc' | 'desc';
}

// Response
interface StatementLinesResponse {
  success: true;
  data: RoyaltyLineDetails[];
  pagination: PaginationMeta;
}

interface RoyaltyLineDetails {
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
  revenueCents: number;        // Gross revenue from this license
  shareBps: number;            // Creator's ownership share (basis points)
  calculatedRoyaltyCents: number; // Final royalty amount
  periodStart: string;         // ISO datetime
  periodEnd: string;           // ISO datetime
  metadata?: Record<string, any>;
  createdAt: string;
}
```

---

## 2. Authentication & Authorization

### Request Authentication
All endpoints require JWT authentication via cookies or Authorization header:

```typescript
// Cookie-based (recommended for web)
fetch('/api/royalties/statements', {
  credentials: 'include'
});

// Header-based (for API clients)
fetch('/api/royalties/statements', {
  headers: {
    'Authorization': 'Bearer <jwt_token>'
  }
});
```

### Access Control Rules

| Endpoint | Admin Access | Creator Access |
|----------|-------------|----------------|
| `GET /api/me/royalties/statements` | ❌ No | ✅ Own statements only |
| `GET /api/royalties/statements` | ✅ All statements | ✅ Own statements only |
| `GET /api/royalties/statements/:id` | ✅ Any statement | ✅ Own statements only |
| `GET /api/royalties/statements/:id/lines` | ✅ Any statement | ✅ Own statements only |
| `POST /api/royalties/statements/:id/dispute` | ❌ No | ✅ Own statements only |

### Row-Level Security
- Creators automatically filtered to their own statements
- Admins can access all statements
- 403 Forbidden returned for unauthorized access attempts

---

## 3. TypeScript Type Definitions

### Core Enums

```typescript
export enum RoyaltyStatementStatus {
  PENDING = 'PENDING',     // Created, awaiting creator review
  REVIEWED = 'REVIEWED',   // Creator has reviewed (accepted)
  DISPUTED = 'DISPUTED',   // Creator has disputed
  RESOLVED = 'RESOLVED',   // Dispute resolved by admin
  PAID = 'PAID'           // Payment has been processed
}

export enum RoyaltyRunStatus {
  DRAFT = 'DRAFT',         // Being created
  CALCULATED = 'CALCULATED', // Calculation complete
  LOCKED = 'LOCKED',       // Finalized, no changes
  PROCESSING = 'PROCESSING', // Background processing
  COMPLETED = 'COMPLETED', // All done
  FAILED = 'FAILED'       // Processing failed
}

export enum IPAssetType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO', 
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
  DESIGN = 'DESIGN',
  OTHER = 'OTHER'
}

export enum LicenseType {
  COMMERCIAL = 'COMMERCIAL',
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  ROYALTY_FREE = 'ROYALTY_FREE'
}
```

### Request/Response Interfaces

```typescript
export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

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

export interface CreatorStatementSummary {
  id: string;
  period: {
    start: string;
    end: string;
  };
  totalEarningsCents: number;
  platformFeeCents: number;
  netPayableCents: number;
  status: RoyaltyStatementStatus;
  lineItemCount: number;
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoyaltyStatementDetails {
  id: string;
  royaltyRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    lockedAt: string | null;
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
  reviewedAt: string | null;
  disputedAt: string | null;
  disputeReason?: string;
  paidAt: string | null;
  paymentReference?: string;
  pdfStorageKey?: string;
  pdfGeneratedAt: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalLineItems: number;
    totalRevenueCents: number;
    lineItemsByAsset: Array<{
      ipAsset: {
        id: string;
        title: string;
        type: string;
      };
      totalRevenueCents: number;
      totalRoyaltyCents: number;
      lineCount: number;
    }>;
  };
}

export interface RoyaltyLineDetails {
  id: string;
  ipAsset: {
    id: string;
    title: string;
    type: IPAssetType;
    description?: string;
  };
  license: {
    id: string;
    licenseType: LicenseType;
    status: string;
    brand: {
      id: string;
      companyName: string;
    };
  };
  revenueCents: number;
  shareBps: number;
  calculatedRoyaltyCents: number;
  periodStart: string;
  periodEnd: string;
  metadata?: Record<string, any>;
  createdAt: string;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

export const royaltyStatementStatusSchema = z.enum([
  'PENDING',
  'REVIEWED', 
  'DISPUTED',
  'RESOLVED',
  'PAID'
]);

export const creatorStatementsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  status: royaltyStatementStatusSchema.optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export const disputeStatementSchema = z.object({
  reason: z.string().min(10).max(2000),
  description: z.string().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export const statementLinesQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50'),
  sortBy: z.enum(['createdAt', 'calculatedRoyaltyCents', 'revenueCents']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

// Type inference
export type CreatorStatementsQuery = z.infer<typeof creatorStatementsQuerySchema>;
export type DisputeStatementRequest = z.infer<typeof disputeStatementSchema>;
export type StatementLinesQuery = z.infer<typeof statementLinesQuerySchema>;
```

---

## 4. Business Logic & Validation Rules

### Statement Status Transitions

```typescript
// Valid status transitions
const STATUS_TRANSITIONS: Record<RoyaltyStatementStatus, RoyaltyStatementStatus[]> = {
  PENDING: ['REVIEWED', 'DISPUTED'],
  REVIEWED: ['DISPUTED', 'PAID'],
  DISPUTED: ['RESOLVED'],
  RESOLVED: ['PAID'],
  PAID: [] // Terminal state
};

// Business rules for frontend validation
export const StatementBusinessRules = {
  // Can creator dispute this statement?
  canDispute: (statement: RoyaltyStatementDetails): boolean => {
    // Cannot dispute if already disputed
    if (statement.status === 'DISPUTED') return false;
    
    // Cannot dispute paid statements older than 90 days
    if (statement.status === 'PAID' && statement.paidAt) {
      const paidDate = new Date(statement.paidAt);
      const daysSincePaid = (Date.now() - paidDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePaid > 90) return false;
    }
    
    return true;
  },
  
  // Can creator review this statement?
  canReview: (statement: RoyaltyStatementDetails): boolean => {
    return statement.status === 'PENDING';
  },
  
  // Is PDF download available?
  canDownloadPDF: (statement: RoyaltyStatementDetails): boolean => {
    return !!statement.pdfStorageKey && !!statement.pdfGeneratedAt;
  }
};
```

### Field Validation Rules

```typescript
export const ValidationRules = {
  disputeReason: {
    minLength: 10,
    maxLength: 2000,
    required: true,
    pattern: /^[a-zA-Z0-9\s.,!?-]+$/,  // Basic text characters
  },
  
  evidenceUrl: {
    maxUrls: 5,
    allowedDomains: [
      'storage.yesgoddess.com',
      's3.amazonaws.com',
      'drive.google.com',
      'dropbox.com'
    ],
    maxFileSize: '10MB', // Per URL
  },
  
  pagination: {
    maxLimit: 100,
    defaultLimit: 20,
    maxPage: 1000,
  }
};
```

### Currency & Money Display

```typescript
export const CurrencyUtils = {
  // Convert cents to dollars for display
  centsToDisplay: (cents: number): string => {
    return (cents / 100).toFixed(2);
  },
  
  // Format for UI display
  formatCurrency: (cents: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  },
  
  // Format basis points as percentage
  formatBasisPoints: (bps: number): string => {
    return `${(bps / 100).toFixed(1)}%`;
  }
};

// Usage examples:
// CurrencyUtils.formatCurrency(150000) => "$1,500.00"
// CurrencyUtils.formatBasisPoints(8000) => "80.0%"
```

---

## 5. Error Handling

### HTTP Status Codes

| Status | Error Type | When It Occurs |
|--------|------------|----------------|
| 400 | Bad Request | Invalid query parameters, malformed request |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User lacks permission for this statement |
| 404 | Not Found | Statement or creator not found |
| 409 | Conflict | Statement already disputed, invalid state |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string;          // Machine-readable error code
  message: string;        // Human-readable message
  details?: Array<{       // Field-level validation errors
    field: string;
    message: string;
  }>;
}

// Example validation error
{
  "success": false,
  "error": "Validation error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "reason",
      "message": "Dispute reason must be at least 10 characters"
    }
  ]
}

// Example business logic error
{
  "success": false,
  "error": "Conflict", 
  "message": "This statement is already disputed"
}
```

### Error Handling Strategy

```typescript
export const ErrorHandler = {
  // Map backend errors to user-friendly messages
  getDisplayMessage: (error: ErrorResponse): string => {
    const errorMessages: Record<string, string> = {
      'Validation error': 'Please check your input and try again',
      'Unauthorized': 'Please log in to continue',
      'Forbidden': 'You don\'t have permission to access this statement',
      'Not found': 'This statement could not be found',
      'Conflict': 'This statement cannot be modified in its current state',
      'Internal server error': 'Something went wrong. Please try again later',
    };
    
    return errorMessages[error.error] || error.message || 'An unexpected error occurred';
  },
  
  // Check if error is retryable
  isRetryable: (status: number): boolean => {
    return [408, 429, 500, 502, 503, 504].includes(status);
  },
  
  // Get retry delay in milliseconds
  getRetryDelay: (attemptNumber: number): number => {
    return Math.min(1000 * Math.pow(2, attemptNumber), 30000); // Exponential backoff, max 30s
  }
};
```

### Common Error Scenarios

```typescript
export const ErrorScenarios = {
  // Statement not found - user bookmarked old URL
  STATEMENT_NOT_FOUND: {
    status: 404,
    action: 'Redirect to statements list',
    message: 'This statement no longer exists'
  },
  
  // User tries to dispute already disputed statement
  ALREADY_DISPUTED: {
    status: 409,
    action: 'Show current dispute status',
    message: 'This statement is already under review'
  },
  
  // Dispute window has closed (90 days after payment)
  DISPUTE_WINDOW_CLOSED: {
    status: 403,
    action: 'Show support contact',
    message: 'The dispute window for this statement has closed. Please contact support for assistance.'
  },
  
  // User tries to access another creator's statement
  UNAUTHORIZED_ACCESS: {
    status: 403,
    action: 'Redirect to own statements',
    message: 'You can only view your own statements'
  }
};
```

---

This completes Part 1 of the Statement Generation Frontend Integration Guide. The document covers API endpoints, authentication, TypeScript definitions, business logic, and error handling.

**Next Documents Needed:**
- Part 2: PDF Downloads, Rate Limiting & Real-time Updates
- Part 3: Frontend Implementation Checklist & UX Guidelines

Would you like me to continue with Part 2?
