# Audit & Reconciliation Module - Frontend Integration Guide (Part 2)
**Classification:** 🔒 ADMIN ONLY - Internal operations and admin interface only

## Advanced Audit Features

### 4. Transaction Audit Trail

#### Service Access Pattern
```typescript
// Backend service instantiation
const services = createAuditReconciliationServices(
  prismaClient,
  auditService,
  process.env.STRIPE_SECRET_KEY
);

// Generate audit trail report
const auditReport = await services.transactionAuditTrail.generateAuditTrailReport({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  requestedBy: 'admin@yesgoddess.com',
  filters: {
    entityTypes: ['payment', 'payout', 'license'],
    userIds: ['user_123'],
    transactionTypes: ['PAYMENT_CREATED', 'PAYOUT_COMPLETED']
  }
});
```

**Audit Trail Configuration:**
```typescript
export interface TransactionAuditTrailConfig extends BaseAuditConfig {
  filters?: AuditFilters;
  includeSystemEvents?: boolean;
  riskLevelFilter?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  groupByEntity?: boolean;
}

export interface AuditFilters {
  entityTypes?: string[];
  entityIds?: string[];
  userIds?: string[];
  transactionTypes?: string[];
  statuses?: string[];
  amounts?: {
    min?: number;
    max?: number;
  };
  severityLevels?: DiscrepancySeverity[];
}
```

**Response Structure:**
```typescript
export interface TransactionAuditTrailReport {
  id: string;
  type: 'TRANSACTION_AUDIT_TRAIL';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Core audit data
  auditEntries: TransactionAuditEntry[];
  totalEntries: number;
  
  // Summary metrics
  transactionCount: number;
  totalAmountCents: number;
  uniqueUsers: number;
  entitiesModified: number;
  
  // Breakdown by type
  actionBreakdown: Array<{
    action: string;
    count: number;
    percentage: number;
  }>;
  
  // Entity breakdown
  entityBreakdown: Array<{
    entityType: string;
    count: number;
    percentage: number;
  }>;
}

export interface TransactionAuditEntry {
  id: string;
  timestamp: Date;
  
  // Actor information
  userId?: string;
  userEmail?: string;
  userRole?: string;
  
  // Transaction information
  entityType: string;
  entityId: string;
  action: string;
  
  // Change tracking
  beforeState?: any;
  afterState?: any;
  changes: FieldChange[];
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  
  // Financial impact
  amountImpact?: {
    previousCents: number;
    newCents: number;
    deltaCents: number;
  };
  
  // Risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: string[];
}
```

### 5. Discrepancy Detection

#### Configuration & Rules
```typescript
export interface DiscrepancyDetectionConfig extends BaseAuditConfig {
  ruleIds?: string[]; // Specific rules to run
  skipResolved?: boolean; // Skip already resolved discrepancies
  autoAssign?: boolean; // Auto-assign to investigators
  minSeverity?: DiscrepancySeverity;
}

// Generate discrepancy report
const discrepancyReport = await services.discrepancyDetection.generateDiscrepancyReport({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  requestedBy: 'admin@yesgoddess.com',
  minSeverity: 'MEDIUM',
  skipResolved: true
});
```

**Built-in Detection Rules:**
```typescript
const DETECTION_RULES = {
  ORPHANED_TRANSACTIONS: {
    id: 'orphaned_transactions',
    name: 'Orphaned Transaction Detection',
    description: 'Finds transactions without proper parent-child relationships',
    severity: 'HIGH',
    enabled: true
  },
  IMPOSSIBLE_STATES: {
    id: 'impossible_states',
    name: 'Impossible State Detection',
    description: 'Detects logically impossible transaction states',
    severity: 'CRITICAL',
    enabled: true
  },
  AMOUNT_MISMATCHES: {
    id: 'amount_mismatches',
    name: 'Amount Mismatch Detection',
    description: 'Finds discrepancies in related transaction amounts',
    severity: 'HIGH',
    enabled: true
  },
  DUPLICATE_TRANSACTIONS: {
    id: 'duplicate_transactions',
    name: 'Duplicate Transaction Detection',
    description: 'Identifies potentially duplicate transactions',
    severity: 'MEDIUM',
    enabled: true
  },
  TEMPORAL_INCONSISTENCIES: {
    id: 'temporal_inconsistencies',
    name: 'Temporal Inconsistency Detection',
    description: 'Finds transactions with impossible timestamps',
    severity: 'MEDIUM',
    enabled: true
  },
  THRESHOLD_VIOLATIONS: {
    id: 'threshold_violations',
    name: 'Threshold Violation Detection',
    description: 'Detects transactions exceeding business thresholds',
    severity: 'HIGH',
    enabled: true
  }
} as const;
```

**Discrepancy Response:**
```typescript
export interface DiscrepancyDetectionReport {
  id: string;
  type: 'DISCREPANCY_DETECTION';
  generatedAt: Date;
  generatedBy: string;
  
  // Detected discrepancies
  discrepancies: DetectedDiscrepancy[];
  
  // Summary by type
  discrepancyBreakdown: Array<{
    type: string;
    count: number;
    severity: DiscrepancySeverity;
    totalImpactCents: number;
  }>;
  
  // Risk assessment
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedActions: string[];
}

export interface DetectedDiscrepancy {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  title: string;
  description: string;
  
  // Affected entities
  entityType: string;
  entityId: string;
  relatedEntities: Array<{
    type: string;
    id: string;
  }>;
  
  // Financial impact
  impactCents?: number;
  potentialLossCents?: number;
  
  // Detection metadata
  detectedAt: Date;
  ruleId?: string;
  confidence: number; // 0-1
  evidence: any[];
  
  // Investigation
  status: 'NEW' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  assignedTo?: string;
  investigationNotes?: string;
  resolvedAt?: Date;
  resolution?: string;
}
```

### 6. Failed Transaction Reports

#### Configuration
```typescript
export interface FailedTransactionConfig extends BaseAuditConfig {
  includeRetries?: boolean;
  includeFraudBlocked?: boolean;
  groupByCustomer?: boolean;
  minFailureThreshold?: number; // Minimum failures to include in repeat offenders
}

// Generate failed transaction report
const failedReport = await services.failedTransactionReports.generateFailedTransactionReport({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  requestedBy: 'admin@yesgoddess.com',
  includeRetries: true,
  minFailureThreshold: 3
});
```

**Failed Transaction Structure:**
```typescript
export interface FailedTransactionReport {
  id: string;
  type: 'FAILED_TRANSACTIONS';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Failed transactions
  failedTransactions: FailedTransaction[];
  
  // Analysis
  failureBreakdown: Array<{
    category: string;
    count: number;
    percentage: number;
    totalAmountCents: number;
    avgAmountCents: number;
  }>;
  
  // Trends
  dailyFailureRates: Array<{
    date: Date;
    totalAttempts: number;
    failures: number;
    failureRate: number;
  }>;
  
  // Customer impact
  affectedCustomers: number;
  repeatOffenders: Array<{
    customerId: string;
    failureCount: number;
    totalAmountCents: number;
  }>;
}

export interface FailedTransaction {
  id: string;
  attemptedAt: Date;
  failedAt: Date;
  
  // Transaction details
  amountCents: number;
  currency: string;
  customerId?: string;
  customerEmail?: string;
  
  // Failure details
  errorCode: string;
  errorMessage: string;
  errorCategory: FailureCategory;
  failureReason: string;
  
  // Context
  paymentMethod: string;
  ipAddress?: string;
  userAgent?: string;
  retryCount: number;
  
  // Resolution
  retryable: boolean;
  suggestedAction?: string;
  customerNotified: boolean;
}

export type FailureCategory = 
  | 'PAYMENT_DECLINED'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_CARD'
  | 'PROCESSOR_ERROR'
  | 'NETWORK_ERROR'
  | 'SYSTEM_ERROR'
  | 'FRAUD_DETECTED'
  | 'BUSINESS_RULE'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN';
```

### 7. Refund & Chargeback Reports

#### Configuration
```typescript
export interface RefundChargebackConfig extends BaseAuditConfig {
  includeWonDisputes?: boolean;
  includePartialRefunds?: boolean;
  groupByReason?: boolean;
  minAmountCents?: number; // Minimum amount to include
}

// Generate refund/chargeback report
const refundReport = await services.refundChargebackReports.generateRefundChargebackReport({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  requestedBy: 'admin@yesgoddess.com',
  includeWonDisputes: true,
  minAmountCents: 1000 // $10+
});
```

**Refund & Chargeback Types:**
```typescript
export interface RefundChargebackReport {
  id: string;
  type: 'REFUNDS_CHARGEBACKS';
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
  
  refunds: RefundTransaction[];
  chargebacks: ChargebackTransaction[];
  refundSummary: RefundSummary;
  chargebackSummary: ChargebackSummary;
  netFinancialImpact: NetFinancialImpact;
  trendAnalysis: TrendAnalysis;
  topReasons: TopReason[];
}

export interface RefundTransaction {
  id: string;
  originalTransactionId: string;
  refundedAt: Date;
  amountCents: number;
  reason: string;
  reasonCategory: RefundCategory;
  requestedBy: 'CUSTOMER' | 'MERCHANT' | 'SYSTEM';
  
  // Processing
  processingTimeDays: number;
  processingStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  
  // Cost analysis
  refundFeeCents: number;
  processingFeeCents: number;
  totalCostCents: number;
  
  // Customer info
  customerId?: string;
  customerTier?: string;
  isRepeatCustomer: boolean;
}

export interface ChargebackTransaction {
  id: string;
  originalTransactionId: string;
  chargebackDate: Date;
  amountCents: number;
  reasonCode: string;
  reasonDescription: string;
  
  // Dispute process
  status: ChargebackStatus;
  disputeDeadline?: Date;
  evidenceSubmitted: boolean;
  evidenceSubmittedAt?: Date;
  resolution?: ChargebackResolution;
  resolvedAt?: Date;
  
  // Financial impact
  chargebackFeeCents: number;
  liabilityShiftCents: number;
  totalCostCents: number;
  
  // Evidence and defense
  evidenceDocuments: string[];
  defenseStrategy?: string;
  winProbability?: number;
}
```

---

## File Upload Handling

### Bank Statement Upload

#### Supported Formats
- **CSV**: Comma-separated values with auto-column detection
- **OFX**: Open Financial Exchange format
- **QFX**: Quicken Financial Exchange format

#### Upload Flow
```typescript
// 1. Request signed upload URL
interface BankStatementUploadRequest {
  fileName: string;
  fileSize: number;
  format: 'CSV' | 'OFX' | 'QFX';
  bankName: string;
  accountNumber: string; // will be masked
}

// 2. Upload file directly to storage
interface SignedUploadResponse {
  uploadUrl: string;
  fileId: string;
  expiresIn: number;
}

// 3. Confirmation callback
interface UploadConfirmation {
  fileId: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}
```

#### File Processing Pipeline
```typescript
const BANK_STATEMENT_PROCESSING = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_FORMATS: ['CSV', 'OFX', 'QFX'],
  PROCESSING_TIMEOUT: 300, // 5 minutes
  
  VALIDATION_RULES: {
    MIN_TRANSACTIONS: 1,
    MAX_TRANSACTIONS: 10000,
    REQUIRED_COLUMNS: ['date', 'amount', 'description'],
    DATE_FORMATS: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY']
  }
} as const;
```

### CSV Column Detection
```typescript
interface CSVColumnMapping {
  date: number;        // Column index for transaction date
  amount: number;      // Column index for amount
  description: number; // Column index for description
  balance?: number;    // Optional balance column
  reference?: number;  // Optional reference/check number
}

// Auto-detection patterns
const CSV_COLUMN_PATTERNS = {
  DATE: /date|time|trans.*date|post.*date/i,
  AMOUNT: /amount|sum|total|debit|credit/i,
  DESCRIPTION: /desc|memo|detail|transaction|payee/i,
  BALANCE: /balance|bal|remaining/i,
  REFERENCE: /ref|check|number|id/i
};
```

---

## Real-time Updates

### Webhook Events
The audit system triggers webhooks for significant events:

```typescript
interface AuditWebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
}

const WEBHOOK_EVENTS = {
  'audit.reconciliation.completed': {
    description: 'Stripe reconciliation completed',
    payload: 'StripeReconciliationReport'
  },
  'audit.discrepancy.detected': {
    description: 'New discrepancy detected',
    payload: 'DetectedDiscrepancy'
  },
  'audit.critical.alert': {
    description: 'Critical audit alert',
    payload: 'CriticalAuditAlert'
  },
  'audit.report.generated': {
    description: 'Background report generation completed',
    payload: 'ReportGenerationResult'
  }
} as const;
```

### Polling Recommendations
For real-time updates without webhooks:

```typescript
const POLLING_INTERVALS = {
  RECONCILIATION_STATUS: 30000,   // 30 seconds
  DISCREPANCY_ALERTS: 60000,      // 1 minute
  REPORT_GENERATION: 10000,       // 10 seconds
  BACKGROUND_JOBS: 5000           // 5 seconds
} as const;
```

---

## Pagination & Filtering

### Pagination Format
```typescript
interface PaginationRequest {
  limit: number;    // Max 100, default 20
  offset: number;   // Default 0
  cursor?: string;  // For cursor-based pagination
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}
```

### Available Filters
```typescript
interface AuditFilters {
  // Time filters
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  // Entity filters
  entityTypes?: string[];
  entityIds?: string[];
  
  // User filters
  userIds?: string[];
  userRoles?: string[];
  
  // Transaction filters
  transactionTypes?: string[];
  statuses?: string[];
  
  // Amount filters
  amountRange?: {
    minCents: number;
    maxCents: number;
  };
  
  // Risk filters
  riskLevels?: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[];
  severityLevels?: DiscrepancySeverity[];
  
  // Search
  searchQuery?: string;
  
  // Status filters
  includeResolved?: boolean;
  includeFalsePositives?: boolean;
}
```

### Sorting Options
```typescript
interface SortOptions {
  field: 'timestamp' | 'amount' | 'severity' | 'confidence' | 'riskLevel';
  direction: 'asc' | 'desc';
}

const SUPPORTED_SORT_FIELDS = {
  timestamp: 'Transaction timestamp',
  amount: 'Transaction amount',
  severity: 'Discrepancy severity',
  confidence: 'Match confidence',
  riskLevel: 'Risk assessment level'
} as const;
```

---

## Performance Considerations

### Caching Strategy
```typescript
const CACHE_DURATIONS = {
  RECONCILIATION_REPORTS: 3600,      // 1 hour
  DISCREPANCY_RULES: 1800,           // 30 minutes
  FAILED_TRANSACTION_STATS: 900,     // 15 minutes
  AUDIT_SUMMARIES: 300               // 5 minutes
} as const;
```

### Background Processing
```typescript
interface BackgroundJobStatus {
  id: string;
  type: 'RECONCILIATION' | 'AUDIT_REPORT' | 'DISCREPANCY_SCAN';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number; // 0-100
  estimatedCompletion?: Date;
  result?: any;
  error?: string;
}
```

### Database Query Optimization
- Audit entries are partitioned by month
- Indexes on timestamp, entityType, userId
- Background aggregation for summary statistics
- Read replicas for heavy reporting queries

> **Continue to [Part 3](./AUDIT_RECONCILIATION_INTEGRATION_GUIDE_PART_3.md)** for frontend implementation checklist, testing strategies, and deployment considerations.
