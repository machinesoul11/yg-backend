# Audit & Reconciliation Module - Frontend Integration Guide (Part 1)
**Classification:** 🔒 ADMIN ONLY - Internal operations and admin interface only

## Overview
This guide covers the complete Audit & Reconciliation module, which provides comprehensive financial auditing, transaction reconciliation, and discrepancy detection capabilities. This is the first part covering core reconciliation features.

## Module Architecture
The module consists of 7 core services:
- **Transaction Audit Trail**: Complete transaction lifecycle tracking 
- **Stripe Reconciliation**: Automated Stripe vs internal transaction matching
- **Bank Statement Reconciliation**: Multi-format bank statement processing
- **Discrepancy Detection**: Rule-based anomaly detection
- **Failed Transaction Reports**: Payment failure analysis
- **Refund & Chargeback Reports**: Dispute and refund tracking
- **Financial Audit Logs**: Enhanced compliance logging

---

## API Endpoints

### 1. Stripe Reconciliation

#### GET `/api/reports/financial/reconciliation`
Generates comprehensive Stripe reconciliation reports with discrepancy detection.

**Authentication:** Required - Admin only  
**Rate Limit:** 10 requests/hour per admin user

```typescript
// Request
interface ReconciliationRequest {
  startDate: Date;
  endDate: Date;
}

// Response
interface ReconciliationResponse {
  summary: {
    periodStart: Date;
    periodEnd: Date;
    totalInternalCents: number;
    totalStripeCents: number;
    discrepancyCents: number;
    reconciliationRate: number; // 0-1 percentage
    matchedCount: number;
    unmatchedInternalCount: number;
    unmatchedStripeCount: number;
    discrepancyCount: number;
  };
  reconciliation: {
    matchedTransactions: ReconciledTransaction[];
    unmatchedInternal: UnmatchedTransaction[];
    unmatchedStripe: UnmatchedTransaction[];
    discrepancies: ReconciliationDiscrepancy[];
  };
  metadata: {
    reportId: string;
    generatedAt: Date;
    generatedBy: string;
  };
}
```

**cURL Example:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/reports/financial/reconciliation" \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  }'
```

### 2. Custom Report Generation

#### POST `/api/reports/financial/generate`
Generates custom audit reports with background processing.

**Authentication:** Required - Admin only  
**Rate Limit:** 5 requests/hour per admin user

```typescript
interface GenerateReportRequest {
  reportType: 'revenue' | 'payouts' | 'reconciliation' | 'custom';
  parameters: Record<string, any>;
  format: 'pdf' | 'csv' | 'excel' | 'json';
  name?: string;
  emailDelivery?: {
    recipients: string[];
    subject?: string;
    message?: string;
  };
}

interface GenerateReportResponse {
  reportId: string;
  jobId: string;
  status: 'GENERATING';
  estimatedCompletionTime: Date;
  message: string;
}
```

### 3. Report Download

#### GET `/api/reports/financial/:id/download`
Secure PDF/CSV download with expiring URLs.

**Authentication:** Required - Admin only  
**Rate Limit:** 20 requests/hour per admin user

```typescript
interface DownloadRequest {
  reportId: string;
}

interface DownloadResponse {
  downloadUrl: string;
  expiresAt: Date;
  fileSize: number;
  filename: string;
}
```

---

## TypeScript Type Definitions

```typescript
/**
 * Core Reconciliation Types
 */
export interface ReconciledTransaction {
  internalTransactionId: string;
  stripeTransactionId: string;
  matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
  matchConfidence: number; // 0-1
  internalAmount: number;
  stripeAmount: number;
  amountMatch: boolean;
  timestampDiff: number; // milliseconds
  metadata: {
    internalData: any;
    stripeData: any;
  };
}

export interface UnmatchedTransaction {
  id: string;
  source: 'INTERNAL' | 'STRIPE';
  amount: number;
  timestamp: Date;
  description: string;
  metadata: any;
  possibleMatches: Array<{
    id: string;
    confidence: number;
    reasons: string[];
  }>;
}

export interface ReconciliationDiscrepancy {
  id: string;
  type: 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH' | 'TIMING_MISMATCH' | 'METADATA_MISMATCH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  internalTransactionId: string;
  stripeTransactionId: string;
  description: string;
  details: {
    internal: any;
    stripe: any;
    differences: any;
  };
  suggestedAction?: string;
  investigationNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * Bank Reconciliation Types
 */
export interface BankReconciliationReport {
  id: string;
  type: 'BANK_RECONCILIATION';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Bank statement info
  bankStatementId: string;
  bankName: string;
  accountNumber: string; // masked
  statementPeriod: {
    start: Date;
    end: Date;
  };
  
  // Reconciliation results
  matchedTransactions: BankReconciledTransaction[];
  unmatchedBank: BankTransaction[];
  unmatchedInternal: BankTransaction[];
  
  // Summary
  bankBalanceCents: number;
  calculatedBalanceCents: number;
  reconciliationDifferenceCents: number;
  reconciled: boolean;
}

export interface BankReconciledTransaction {
  bankTransactionId: string;
  internalTransactionId: string;
  bankAmount: number;
  internalAmount: number;
  bankDate: Date;
  internalDate: Date;
  description: string;
  matchType: 'AUTO' | 'MANUAL' | 'FUZZY';
  confidence: number;
}

export interface BankTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category?: string;
  reference?: string;
  balance?: number;
  metadata?: any;
}

/**
 * Request/Response Schemas for tRPC
 */
export const reconciliationInputSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const generateReportInputSchema = z.object({
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

## Business Logic & Validation Rules

### Reconciliation Rate Calculations
- **Good:** 95%+ reconciliation rate
- **Warning:** 85-94% reconciliation rate  
- **Critical:** <85% reconciliation rate

### Amount Tolerance Settings
```typescript
const RECONCILIATION_TOLERANCES = {
  EXACT_MATCH: 0, // Perfect match
  FUZZY_MATCH: 100, // Within $1.00
  TIMING_TOLERANCE_DAYS: 7, // Within 1 week
  AUTO_MATCH_THRESHOLD: 0.8 // 80% confidence
} as const;
```

### Discrepancy Severity Rules
```typescript
const SEVERITY_RULES = {
  CRITICAL: {
    amountThreshold: 100000, // $1,000+
    conditions: ['FRAUD_INDICATOR', 'COMPLIANCE_VIOLATION']
  },
  HIGH: {
    amountThreshold: 50000, // $500+
    conditions: ['AMOUNT_MISMATCH', 'DUPLICATE_TRANSACTION']
  },
  MEDIUM: {
    amountThreshold: 10000, // $100+
    conditions: ['STATUS_MISMATCH', 'TIMING_MISMATCH']
  },
  LOW: {
    amountThreshold: 0,
    conditions: ['METADATA_MISMATCH']
  }
} as const;
```

### Data Validation Requirements
1. **Date Range Validation**
   - Maximum range: 90 days
   - Start date cannot be in the future
   - End date must be after start date

2. **Amount Validation**
   - All amounts in cents (integers)
   - Must be positive for charges, negative for refunds
   - Maximum single transaction: $50,000

3. **Status Validation**
   - Payment statuses: `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`
   - Payout statuses: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

---

## Error Handling

### HTTP Status Codes
| Code | Description | When Used |
|------|-------------|-----------|
| 200 | Success | Successful reconciliation report |
| 400 | Bad Request | Invalid date range, malformed request |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Non-admin user accessing admin endpoint |
| 404 | Not Found | Report ID not found for download |
| 422 | Unprocessable Entity | Valid format but business rules violated |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Stripe API failure, database error |
| 503 | Service Unavailable | Background job queue full |

### Error Response Format
```typescript
interface ErrorResponse {
  code: string;
  message: string;
  details?: {
    field?: string;
    value?: any;
    constraint?: string;
  };
  timestamp: string;
  requestId: string;
}
```

### Common Error Codes
```typescript
const ERROR_CODES = {
  // Validation Errors
  INVALID_DATE_RANGE: 'Date range cannot exceed 90 days',
  FUTURE_DATE_NOT_ALLOWED: 'Start date cannot be in the future',
  
  // Business Logic Errors
  RECONCILIATION_IN_PROGRESS: 'Another reconciliation is already running',
  STRIPE_API_UNAVAILABLE: 'Stripe API is currently unavailable',
  BANK_STATEMENT_PARSE_ERROR: 'Unable to parse bank statement format',
  
  // System Errors
  REPORT_GENERATION_FAILED: 'Report generation failed due to system error',
  DATABASE_CONNECTION_ERROR: 'Database connection temporarily unavailable',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'Too many requests. Try again in 1 hour'
} as const;
```

### User-Friendly Error Messages
```typescript
const USER_FRIENDLY_MESSAGES = {
  INVALID_DATE_RANGE: 'Please select a date range of 90 days or less.',
  STRIPE_API_UNAVAILABLE: 'Payment system is temporarily unavailable. Please try again in a few minutes.',
  RATE_LIMIT_EXCEEDED: 'You\'ve reached the maximum number of reports for this hour. Please wait before generating another report.',
  REPORT_GENERATION_FAILED: 'We encountered an issue generating your report. Our team has been notified.'
} as const;
```

---

## Authorization & Permissions

### Role-Based Access Control
```typescript
interface UserPermissions {
  canViewReconciliation: boolean;
  canGenerateReports: boolean;
  canDownloadReports: boolean;
  canResolveDiscrepancies: boolean;
  canAccessFinancialLogs: boolean;
}

const ROLE_PERMISSIONS: Record<string, UserPermissions> = {
  SUPER_ADMIN: {
    canViewReconciliation: true,
    canGenerateReports: true,
    canDownloadReports: true,
    canResolveDiscrepancies: true,
    canAccessFinancialLogs: true
  },
  FINANCE_ADMIN: {
    canViewReconciliation: true,
    canGenerateReports: true,
    canDownloadReports: true,
    canResolveDiscrepancies: true,
    canAccessFinancialLogs: false
  },
  OPERATIONS_ADMIN: {
    canViewReconciliation: true,
    canGenerateReports: false,
    canDownloadReports: false,
    canResolveDiscrepancies: false,
    canAccessFinancialLogs: false
  }
};
```

### Authentication Requirements
- All endpoints require valid JWT token
- Token must include `adminAccess: true`
- Session must not be expired
- User must have appropriate role permissions

### Resource Ownership Rules
- Admins can access all reconciliation reports
- Reports are not user-scoped (system-wide data)
- Download links are time-limited (expires in 24 hours)

---

## Rate Limiting & Quotas

### Rate Limits by Endpoint
```typescript
const RATE_LIMITS = {
  '/api/reports/financial/reconciliation': {
    requests: 10,
    window: 3600, // 1 hour
    burstAllowed: 2
  },
  '/api/reports/financial/generate': {
    requests: 5,
    window: 3600, // 1 hour
    burstAllowed: 1
  },
  '/api/reports/financial/:id/download': {
    requests: 20,
    window: 3600, // 1 hour
    burstAllowed: 5
  }
} as const;
```

### Rate Limit Headers
```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Total requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining
  'X-RateLimit-Reset': string;      // Reset timestamp
  'X-RateLimit-Window': string;     // Window duration in seconds
}
```

### Quota Management
- Maximum 50 report generations per day per admin
- Maximum 100MB total download per day per admin
- Background job processing limited to 5 concurrent reports

> **Continue to [Part 2](./AUDIT_RECONCILIATION_INTEGRATION_GUIDE_PART_2.md)** for advanced features including Discrepancy Detection, Failed Transaction Reports, and File Upload handling.
