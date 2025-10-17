# ⚡ Tax & Compliance Reports - Frontend Integration Guide (Part 3: Implementation & Business Logic)

**Classification:** ⚡ HYBRID - Core functionality used by both public website and admin backend with different access levels

---

## 1. Business Logic & Validation Rules

### 1.1 Payment Threshold Rules

#### US Tax Thresholds (Default)
- **Form 1099-NEC:** $600 minimum (60,000 cents)
- **Form 1099-MISC:** $600 minimum (60,000 cents)
- **Backup Withholding:** 24% rate when applicable
- **Automatic Tracking:** Updates with each royalty payment
- **Year-End Processing:** January 31st deadline for form generation

#### Threshold Calculation Logic
```typescript
const thresholdLogic = {
  // Real-time threshold checking
  checkThreshold: (currentAmountCents: number, thresholdCents: number = 60000) => {
    const percentageReached = (currentAmountCents / thresholdCents) * 100;
    const remainingCents = Math.max(0, thresholdCents - currentAmountCents);
    
    return {
      thresholdMet: currentAmountCents >= thresholdCents,
      percentageReached: Math.min(100, percentageReached),
      remainingCents,
      projectionNeeded: percentageReached >= 75 && percentageReached < 100
    };
  },
  
  // Calculate projected year-end total
  projectYearEnd: (currentAmountCents: number, taxYear: number) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    if (taxYear !== currentYear) return null;
    
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear, 11, 31);
    const daysElapsed = Math.floor((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysElapsed <= 0) return currentAmountCents;
    
    const dailyAverage = currentAmountCents / daysElapsed;
    return Math.round(dailyAverage * totalDays);
  }
};
```

### 1.2 Tax Document Generation Rules

#### Document State Machine
```typescript
const documentStates = {
  PENDING: {
    canTransitionTo: ['GENERATED', 'VOIDED'],
    allowedActions: ['generatePDF', 'void'],
    userVisible: false
  },
  GENERATED: {
    canTransitionTo: ['DELIVERED', 'FILED', 'CORRECTED', 'VOIDED'],
    allowedActions: ['deliver', 'file', 'correct', 'void', 'regeneratePDF'],
    userVisible: true
  },
  DELIVERED: {
    canTransitionTo: ['FILED', 'CORRECTED'],
    allowedActions: ['file', 'correct'],
    userVisible: true
  },
  FILED: {
    canTransitionTo: ['CORRECTED'],
    allowedActions: ['correct'],
    userVisible: true,
    finalState: true
  },
  CORRECTED: {
    canTransitionTo: [],
    allowedActions: [],
    userVisible: true,
    finalState: true
  },
  VOIDED: {
    canTransitionTo: [],
    allowedActions: [],
    userVisible: false,
    finalState: true
  }
};
```

#### Form Generation Validation
```typescript
const validationRules = {
  // Check if creator meets 1099 threshold
  requiresForm1099: (paymentsCents: number, jurisdiction: string = 'US') => {
    const thresholds = {
      US: 60000, // $600
      CA: 50000, // $500 CAD (example)
      UK: 60000  // £600 (example)
    };
    
    return paymentsCents >= (thresholds[jurisdiction] || 60000);
  },
  
  // Validate tax year for document generation
  canGenerateForYear: (taxYear: number) => {
    const currentYear = new Date().getFullYear();
    const minYear = 2020;
    const maxYear = currentYear + 1; // Allow next year preparation
    
    return taxYear >= minYear && taxYear <= maxYear;
  },
  
  // Check required creator information
  hasRequiredCreatorData: (creator: any) => {
    const required = ['stageName', 'user.email'];
    const missing = required.filter(field => {
      const value = field.split('.').reduce((obj, key) => obj?.[key], creator);
      return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    return {
      isValid: missing.length === 0,
      missingFields: missing,
      errors: missing.map(field => `Missing required field: ${field}`)
    };
  }
};
```

### 1.3 International Tax Rules

#### W8-BEN Form Requirements
```typescript
const w8BenRules = {
  // Check if W8-BEN is required
  requiresW8BEN: (creator: any) => {
    const userCountry = creator.user?.country || creator.taxJurisdictions?.[0]?.countryCode;
    return userCountry && userCountry !== 'US';
  },
  
  // Validate W8-BEN data completeness
  validateW8BEN: (data: W8BENData) => {
    const errors: string[] = [];
    
    if (!data.individualName?.trim()) {
      errors.push('Individual name is required');
    }
    
    if (!data.countryOfTaxResidence?.trim()) {
      errors.push('Country of tax residence is required');
    }
    
    if (!data.permanentResidenceAddress?.trim()) {
      errors.push('Permanent residence address is required');
    }
    
    // Treaty benefits validation
    if (data.claimTreatyBenefits) {
      if (!data.treatyCountry) {
        errors.push('Treaty country required when claiming treaty benefits');
      }
      if (!data.treatyArticle) {
        errors.push('Treaty article required when claiming treaty benefits');
      }
    }
    
    // Check document expiry (W8-BEN valid for 3 years)
    const certDate = new Date(data.certificationDate);
    const expiryDate = new Date(certDate);
    expiryDate.setFullYear(certDate.getFullYear() + 3);
    
    return {
      isValid: errors.length === 0,
      errors,
      expiryDate,
      isExpired: new Date() > expiryDate,
      daysUntilExpiry: Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    };
  }
};
```

---

## 2. Error Handling

### 2.1 Error Codes & HTTP Status Mapping

```typescript
export const TAX_COMPLIANCE_ERRORS = {
  // Validation Errors (400 Bad Request)
  INVALID_TAX_YEAR: {
    code: 'INVALID_TAX_YEAR',
    message: 'Tax year must be between 2020 and 2050',
    httpStatus: 400
  },
  THRESHOLD_NOT_MET: {
    code: 'THRESHOLD_NOT_MET', 
    message: 'Creator has not met the minimum tax reporting threshold',
    httpStatus: 400
  },
  INSUFFICIENT_PAYMENT_DATA: {
    code: 'INSUFFICIENT_PAYMENT_DATA',
    message: 'Not enough payment data to generate tax document',
    httpStatus: 400
  },
  INVALID_DOCUMENT_STATE: {
    code: 'INVALID_DOCUMENT_STATE',
    message: 'Document state does not allow this operation',
    httpStatus: 400
  },
  
  // Authorization Errors (403 Forbidden)
  ACCESS_DENIED: {
    code: 'ACCESS_DENIED',
    message: 'You do not have permission to access this tax document',
    httpStatus: 403
  },
  CREATOR_MISMATCH: {
    code: 'CREATOR_MISMATCH',
    message: 'Document does not belong to authenticated creator',
    httpStatus: 403
  },
  
  // Not Found Errors (404)
  DOCUMENT_NOT_FOUND: {
    code: 'DOCUMENT_NOT_FOUND',
    message: 'Tax document not found',
    httpStatus: 404
  },
  THRESHOLD_NOT_FOUND: {
    code: 'THRESHOLD_NOT_FOUND',
    message: 'Payment threshold record not found',
    httpStatus: 404
  },
  JOB_NOT_FOUND: {
    code: 'JOB_NOT_FOUND',
    message: 'Tax form job not found',
    httpStatus: 404
  },
  
  // Conflict Errors (409)
  DOCUMENT_ALREADY_GENERATED: {
    code: 'DOCUMENT_ALREADY_GENERATED',
    message: 'Tax document has already been generated for this creator and year',
    httpStatus: 409
  },
  JOB_ALREADY_RUNNING: {
    code: 'JOB_ALREADY_RUNNING',
    message: 'A tax form generation job is already running for this year',
    httpStatus: 409
  },
  
  // Rate Limiting (429)
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    message: 'Too many tax compliance requests. Please try again later.',
    httpStatus: 429
  },
  
  // Server Errors (500)
  PDF_GENERATION_FAILED: {
    code: 'PDF_GENERATION_FAILED',
    message: 'Failed to generate PDF document',
    httpStatus: 500
  },
  PAYMENT_DATA_ERROR: {
    code: 'PAYMENT_DATA_ERROR',
    message: 'Error retrieving payment data for tax calculations',
    httpStatus: 500
  },
  STORAGE_ERROR: {
    code: 'STORAGE_ERROR',
    message: 'Error storing tax document',
    httpStatus: 500
  }
} as const;
```

### 2.2 User-Friendly Error Messages

```typescript
export const getUserFriendlyErrorMessage = (errorCode: string): string => {
  const messages: Record<string, string> = {
    INVALID_TAX_YEAR: 'Please select a valid tax year (2020-2050).',
    THRESHOLD_NOT_MET: 'You have not reached the minimum earnings threshold for tax reporting this year.',
    INSUFFICIENT_PAYMENT_DATA: 'We need more payment information to generate your tax document. Please contact support.',
    ACCESS_DENIED: 'You do not have permission to view this tax information.',
    DOCUMENT_NOT_FOUND: 'Tax document not found. It may have been removed or never generated.',
    DOCUMENT_ALREADY_GENERATED: 'A tax document has already been created for this year.',
    PDF_GENERATION_FAILED: 'Unable to generate your tax document right now. Please try again or contact support.',
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
    JOB_ALREADY_RUNNING: 'Tax documents are currently being generated. Please check back in a few minutes.',
    STORAGE_ERROR: 'Unable to save your tax document. Please try again.',
    
    // Default fallback
    DEFAULT: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
  };
  
  return messages[errorCode] || messages.DEFAULT;
};
```

### 2.3 Error Context & Recovery Actions

```typescript
export const getErrorRecoveryActions = (errorCode: string, context?: any) => {
  const actions: Record<string, Array<{ label: string; action: string }>> = {
    THRESHOLD_NOT_MET: [
      { label: 'View Current Earnings', action: 'VIEW_THRESHOLD_STATUS' },
      { label: 'Learn About Tax Thresholds', action: 'OPEN_TAX_HELP' }
    ],
    
    DOCUMENT_NOT_FOUND: [
      { label: 'View All Tax Documents', action: 'NAVIGATE_TO_TAX_DOCUMENTS' },
      { label: 'Check Earnings Status', action: 'VIEW_THRESHOLD_STATUS' }
    ],
    
    ACCESS_DENIED: [
      { label: 'Return to Dashboard', action: 'NAVIGATE_TO_DASHBOARD' },
      { label: 'Contact Support', action: 'OPEN_SUPPORT' }
    ],
    
    PDF_GENERATION_FAILED: [
      { label: 'Try Again', action: 'RETRY_GENERATION' },
      { label: 'Download Previous Version', action: 'DOWNLOAD_EXISTING' },
      { label: 'Contact Support', action: 'OPEN_SUPPORT' }
    ],
    
    RATE_LIMITED: [
      { label: 'Wait and Retry', action: 'WAIT_AND_RETRY' }
    ]
  };
  
  return actions[errorCode] || [
    { label: 'Try Again', action: 'RETRY' },
    { label: 'Contact Support', action: 'OPEN_SUPPORT' }
  ];
};
```

---

## 3. Authorization & Permissions

### 3.1 Role-Based Access Control

```typescript
export const TAX_PERMISSIONS = {
  // Creator Permissions (🌐 SHARED)
  CREATOR: {
    canView: (document: TaxDocumentData, userId: string, creatorId?: string) => {
      return document.creatorId === creatorId;
    },
    
    canGenerate: (document: TaxDocumentData, userId: string, creatorId?: string) => {
      return document.creatorId === creatorId && 
             ['PENDING', 'GENERATED'].includes(document.filingStatus);
    },
    
    canDownload: (document: TaxDocumentData, userId: string, creatorId?: string) => {
      return document.creatorId === creatorId && 
             document.pdfStorageKey &&
             !document.voidedAt;
    },
    
    // Creators cannot delete, void, or access admin functions
    canDelete: () => false,
    canVoid: () => false,
    canViewAllCreators: () => false,
    canRunBatchJobs: () => false
  },
  
  // Admin Permissions (🔒 ADMIN ONLY)
  ADMIN: {
    canView: () => true,
    canGenerate: () => true,
    canDownload: () => true,
    canDelete: () => true,
    canVoid: () => true,
    canViewAllCreators: () => true,
    canRunBatchJobs: () => true,
    
    canCreateCorrection: (document: TaxDocumentData) => {
      return ['GENERATED', 'DELIVERED', 'FILED'].includes(document.filingStatus) &&
             !document.voidedAt;
    },
    
    canVoidDocument: (document: TaxDocumentData) => {
      return document.filingStatus !== 'FILED' && !document.voidedAt;
    }
  }
} as const;
```

### 3.2 Resource Ownership Validation

```typescript
export const validateResourceOwnership = (
  resourceType: 'document' | 'threshold' | 'job',
  resourceData: any,
  userRole: string,
  userId: string,
  creatorId?: string
): { allowed: boolean; reason?: string } => {
  
  if (userRole === 'ADMIN') {
    return { allowed: true };
  }
  
  switch (resourceType) {
    case 'document':
      if (!creatorId) {
        return { allowed: false, reason: 'Creator ID required for document access' };
      }
      if (resourceData.creatorId !== creatorId) {
        return { allowed: false, reason: 'Document belongs to different creator' };
      }
      break;
      
    case 'threshold':
      if (!creatorId) {
        return { allowed: false, reason: 'Creator ID required for threshold access' };
      }
      if (resourceData.creatorId !== creatorId) {
        return { allowed: false, reason: 'Threshold belongs to different creator' };
      }
      break;
      
    case 'job':
      // Jobs are admin-only resources
      return { allowed: false, reason: 'Tax form jobs require admin access' };
      
    default:
      return { allowed: false, reason: 'Unknown resource type' };
  }
  
  return { allowed: true };
};
```

### 3.3 Field-Level Permissions

```typescript
export interface FieldPermissions {
  readable: string[];
  writable: string[];
  hidden: string[];
}

export const getFieldPermissions = (
  userRole: string, 
  resourceType: 'document' | 'threshold' | 'job'
): FieldPermissions => {
  
  const basePermissions: FieldPermissions = {
    readable: [],
    writable: [],
    hidden: []
  };
  
  if (resourceType === 'document') {
    if (userRole === 'ADMIN') {
      return {
        readable: ['*'], // All fields
        writable: ['filingStatus', 'deliveredAt', 'filedAt', 'voidedAt', 'voidReason', 'metadata'],
        hidden: []
      };
    } else {
      // Creators have limited access
      return {
        readable: [
          'id', 'taxYear', 'documentType', 'filingStatus', 
          'totalAmountCents', 'withholdingCents', 'pdfStorageKey', 
          'pdfGeneratedAt', 'createdAt'
        ],
        writable: [], // Creators cannot modify documents
        hidden: ['metadata', 'correctionOfId', 'voidReason']
      };
    }
  }
  
  // Similar logic for threshold and job resources...
  return basePermissions;
};
```

---

## 4. Rate Limiting & Quotas

### 4.1 Rate Limit Configuration

**API Rate Limits (per authenticated user):**
- **General Operations:** 100 requests per hour
- **Document Generation:** 20 generations per hour  
- **PDF Downloads:** 50 downloads per hour
- **Admin Bulk Operations:** 10 operations per hour

**Rate Limit Headers (via tRPC error data):**
```typescript
interface RateLimitInfo {
  limit: number;          // Maximum requests allowed
  remaining: number;      // Requests remaining in window
  resetAt: number;        // Unix timestamp when limit resets
  retryAfter: number;     // Seconds to wait before retry
}
```

### 4.2 Rate Limit Detection & Handling

```typescript
export const handleRateLimit = (error: any): RateLimitInfo | null => {
  if (error.code === 'TOO_MANY_REQUESTS' || error.data?.code === 'RATE_LIMITED') {
    return {
      limit: error.data?.limit || 100,
      remaining: 0,
      resetAt: error.data?.resetAt || Date.now() + 3600000, // Default 1 hour
      retryAfter: error.data?.retryAfter || 3600
    };
  }
  return null;
};

export const formatRateLimitMessage = (rateLimitInfo: RateLimitInfo): string => {
  const resetDate = new Date(rateLimitInfo.resetAt);
  const minutesUntilReset = Math.ceil(rateLimitInfo.retryAfter / 60);
  
  return `Rate limit exceeded. You can try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''} (${resetDate.toLocaleTimeString()}).`;
};

export const shouldShowRateLimitWarning = (rateLimitInfo?: RateLimitInfo): boolean => {
  if (!rateLimitInfo) return false;
  const warningThreshold = rateLimitInfo.limit * 0.1; // Warn at 10% remaining
  return rateLimitInfo.remaining <= warningThreshold;
};
```

---

## 5. State Management Considerations

### 5.1 Document Status State Machine

```typescript
export const documentStateMachine = {
  getValidTransitions: (currentStatus: TaxFilingStatus): TaxFilingStatus[] => {
    const transitions: Record<TaxFilingStatus, TaxFilingStatus[]> = {
      PENDING: ['GENERATED', 'VOIDED'],
      GENERATED: ['DELIVERED', 'FILED', 'CORRECTED', 'VOIDED'],
      DELIVERED: ['FILED', 'CORRECTED'],
      FILED: ['CORRECTED'],
      CORRECTED: [],
      VOIDED: []
    };
    
    return transitions[currentStatus] || [];
  },
  
  canTransition: (from: TaxFilingStatus, to: TaxFilingStatus): boolean => {
    const validTransitions = documentStateMachine.getValidTransitions(from);
    return validTransitions.includes(to);
  },
  
  getAvailableActions: (status: TaxFilingStatus, userRole: string) => {
    const baseActions = {
      PENDING: ['generatePDF'],
      GENERATED: ['downloadPDF', 'markDelivered'],
      DELIVERED: ['downloadPDF', 'markFiled'],
      FILED: ['downloadPDF', 'createCorrection'],
      CORRECTED: ['downloadPDF'],
      VOIDED: []
    };
    
    const adminActions = {
      PENDING: ['generatePDF', 'void'],
      GENERATED: ['downloadPDF', 'markDelivered', 'markFiled', 'void', 'createCorrection'],
      DELIVERED: ['downloadPDF', 'markFiled', 'createCorrection'],
      FILED: ['downloadPDF', 'createCorrection'],
      CORRECTED: ['downloadPDF'],
      VOIDED: []
    };
    
    return userRole === 'ADMIN' ? adminActions[status] || [] : baseActions[status] || [];
  }
};
```

### 5.2 Real-time Updates & Polling

```typescript
export const taxCompliancePolling = {
  // Poll job status for running operations
  shouldPollJobStatus: (jobStatus: string): boolean => {
    return ['PENDING', 'RUNNING'].includes(jobStatus);
  },
  
  // Calculate polling interval based on job progress
  getPollingInterval: (job: TaxFormJobData): number => {
    if (job.status === 'RUNNING') {
      // More frequent polling when job is actively running
      if (job.progressPercentage < 50) return 5000;  // 5 seconds
      if (job.progressPercentage < 90) return 3000;  // 3 seconds  
      return 2000; // 2 seconds near completion
    }
    return 10000; // 10 seconds for pending jobs
  },
  
  // Determine when to stop polling
  shouldStopPolling: (job: TaxFormJobData): boolean => {
    return ['COMPLETED', 'FAILED'].includes(job.status);
  },
  
  // Auto-refresh threshold status during tax season
  shouldAutoRefreshThresholds: (): boolean => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    // Auto-refresh more frequently in Q4 and Q1 (tax season)
    return currentMonth >= 9 || currentMonth <= 2; // Oct-Mar
  }
};
```

---

**Continue to [Part 4: Frontend Implementation Checklist](./TAX_COMPLIANCE_INTEGRATION_GUIDE_PART_4_CHECKLIST.md)**
