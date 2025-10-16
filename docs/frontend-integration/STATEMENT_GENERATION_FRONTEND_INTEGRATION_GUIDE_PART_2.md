# Statement Generation Module - Frontend Integration Guide (Part 2)

**Classification:** ⚡ HYBRID - Advanced Features & Implementation Details

---

## 6. File Downloads & PDF Generation

### PDF Download Flow

The backend automatically generates PDFs for statements and stores them securely. Frontend needs to handle the download flow:

```typescript
interface PDFDownloadFlow {
  // Step 1: Check if PDF is available
  checkPDFAvailability: (statement: RoyaltyStatementDetails) => boolean;
  
  // Step 2: Request download URL from backend service (not exposed as API endpoint)
  // This would typically be handled through a separate service method
  
  // Step 3: Handle download initiation
  downloadPDF: (statementId: string) => Promise<void>;
}

// Implementation example
export const PDFHandler = {
  canDownload: (statement: RoyaltyStatementDetails): boolean => {
    return !!(statement.pdfStorageKey && statement.pdfGeneratedAt);
  },
  
  getDownloadStatus: (statement: RoyaltyStatementDetails): 'available' | 'generating' | 'unavailable' => {
    if (!statement.pdfStorageKey && !statement.pdfGeneratedAt) {
      return 'unavailable';
    }
    
    if (!statement.pdfStorageKey && statement.pdfGeneratedAt) {
      return 'generating';
    }
    
    return 'available';
  },
  
  // Generate download filename
  getDownloadFilename: (statement: RoyaltyStatementDetails): string => {
    const period = new Date(statement.royaltyRun.periodStart).toISOString().slice(0, 7); // YYYY-MM
    const creatorName = statement.creator.stageName || statement.creator.name;
    const sanitizedName = creatorName.replace(/[^a-zA-Z0-9]/g, '_');
    return `YG_Statement_${sanitizedName}_${period}.pdf`;
  }
};
```

### PDF Storage Details

```typescript
interface PDFStorageInfo {
  // Backend storage structure (for reference)
  storagePath: string;     // "documents/statements/{year}/{month}/{statementId}.pdf"
  contentType: string;     // "application/pdf"
  
  // Download URLs expire after 1 hour for security
  urlExpiry: number;       // 3600 seconds (1 hour)
  
  // Typical file sizes
  averageSize: string;     // "150KB - 2MB depending on line item count"
  maxSize: string;         // "5MB (statements with 100+ line items)"
}

// File size estimation for UI
export const PDFSizeEstimator = {
  estimateFileSize: (lineItemCount: number): string => {
    if (lineItemCount <= 10) return "~150KB";
    if (lineItemCount <= 50) return "~500KB";
    if (lineItemCount <= 100) return "~1MB";
    return "~2MB";
  }
};
```

---

## 7. Rate Limiting & Quotas

### Rate Limit Configuration

```typescript
interface RateLimits {
  // Per endpoint rate limits (per user per minute)
  endpoints: {
    'GET /api/me/royalties/statements': 30;           // List statements
    'GET /api/royalties/statements': 60;              // Admin list (higher limit)
    'GET /api/royalties/statements/:id': 100;         // Statement details
    'GET /api/royalties/statements/:id/lines': 50;    // Line items
    'POST /api/royalties/statements/:id/dispute': 5;  // Dispute submission (low limit)
  };
  
  // Global limits per user per hour
  globalLimits: {
    creator: 500;        // Regular creators
    admin: 2000;         // Admin users
  };
}
```

### Rate Limit Headers

The backend returns rate limiting information in response headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // "30" (requests per window)
  'X-RateLimit-Remaining': string;  // "25" (remaining in window)
  'X-RateLimit-Reset': string;      // "1698765432" (Unix timestamp)
  'X-RateLimit-Window': string;     // "60" (window size in seconds)
}

// Frontend rate limit handler
export const RateLimitHandler = {
  parseHeaders: (headers: Headers): RateLimitInfo => {
    return {
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      resetTime: parseInt(headers.get('X-RateLimit-Reset') || '0'),
      windowSeconds: parseInt(headers.get('X-RateLimit-Window') || '60'),
    };
  },
  
  getResetTimeMessage: (resetTimestamp: number): string => {
    const resetTime = new Date(resetTimestamp * 1000);
    const now = new Date();
    const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
    return `Rate limit resets in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}`;
  },
  
  shouldShowWarning: (remaining: number, limit: number): boolean => {
    return remaining <= Math.max(5, limit * 0.1); // Show warning at 10% remaining or 5 requests
  }
};

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  windowSeconds: number;
}
```

### Rate Limit Error Handling

```typescript
// When rate limit is exceeded (429 status)
interface RateLimitExceededResponse {
  success: false;
  error: 'Too Many Requests';
  message: 'Rate limit exceeded. Please try again later.';
  retryAfter: number;     // Seconds until retry is allowed
}

export const RateLimitUI = {
  showRateLimitError: (retryAfter: number): void => {
    const minutes = Math.ceil(retryAfter / 60);
    const message = retryAfter < 60 
      ? `Please wait ${retryAfter} seconds before trying again`
      : `Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again`;
    
    // Show user-friendly error message
    showNotification({
      type: 'warning',
      title: 'Rate Limit Reached',
      message,
      duration: 10000 // Show for 10 seconds
    });
  },
  
  // Disable buttons when near rate limit
  getButtonState: (rateLimitInfo: RateLimitInfo) => {
    if (rateLimitInfo.remaining === 0) {
      return { disabled: true, tooltip: 'Rate limit reached. Please wait.' };
    }
    
    if (RateLimitHandler.shouldShowWarning(rateLimitInfo.remaining, rateLimitInfo.limit)) {
      return { 
        disabled: false, 
        tooltip: `${rateLimitInfo.remaining} requests remaining` 
      };
    }
    
    return { disabled: false, tooltip: null };
  }
};
```

---

## 8. Real-time Updates & Polling

### Statement Status Updates

Statements can change status due to admin actions (dispute resolution) or system processes (payment completion). The frontend should handle real-time updates:

```typescript
interface RealtimeUpdateStrategy {
  // Option 1: Polling for statement status changes
  polling: {
    interval: 30000;        // 30 seconds for active viewing
    backgroundInterval: 300000; // 5 minutes when tab inactive
    endpoints: [
      '/api/me/royalties/statements', // For creators
      '/api/royalties/statements'     // For admins
    ];
  };
  
  // Option 2: WebSocket events (if implemented)
  websocket: {
    events: [
      'statement.status_changed',
      'statement.dispute_resolved', 
      'statement.payment_processed'
    ];
  };
  
  // Option 3: Server-sent events (recommended)
  sse: {
    endpoint: '/api/events/stream';
    eventTypes: [
      'royalty_statement_updated',
      'dispute_resolved',
      'payment_completed'
    ];
  };
}
```

### Polling Implementation

```typescript
export class StatementPollingService {
  private intervalId: number | null = null;
  private isActiveTab = true;
  
  constructor(
    private onUpdate: (statements: CreatorStatementSummary[]) => void,
    private getCurrentStatements: () => CreatorStatementSummary[]
  ) {
    // Listen for tab visibility changes
    document.addEventListener('visibilitychange', () => {
      this.isActiveTab = !document.hidden;
      this.adjustPollingInterval();
    });
  }
  
  startPolling(): void {
    this.stopPolling(); // Clear any existing interval
    this.poll();
    
    const interval = this.isActiveTab ? 30000 : 300000; // 30s active, 5min background
    this.intervalId = window.setInterval(() => this.poll(), interval);
  }
  
  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  private async poll(): Promise<void> {
    try {
      const response = await fetch('/api/me/royalties/statements?page=1&limit=20', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const { data } = await response.json();
        const currentStatements = this.getCurrentStatements();
        
        if (this.hasChanges(currentStatements, data)) {
          this.onUpdate(data);
          
          // Show notification for important changes
          this.checkForImportantUpdates(currentStatements, data);
        }
      }
    } catch (error) {
      console.error('Polling failed:', error);
      // Don't show error to user for background polling
    }
  }
  
  private hasChanges(current: CreatorStatementSummary[], updated: CreatorStatementSummary[]): boolean {
    if (current.length !== updated.length) return true;
    
    return current.some((stmt, index) => {
      const updatedStmt = updated[index];
      return stmt.status !== updatedStmt.status || 
             stmt.updatedAt !== updatedStmt.updatedAt;
    });
  }
  
  private checkForImportantUpdates(current: CreatorStatementSummary[], updated: CreatorStatementSummary[]): void {
    updated.forEach(updatedStmt => {
      const currentStmt = current.find(s => s.id === updatedStmt.id);
      
      if (!currentStmt) {
        // New statement
        showNotification({
          type: 'info',
          title: 'New Royalty Statement',
          message: 'You have a new royalty statement available for review'
        });
      } else if (currentStmt.status !== updatedStmt.status) {
        // Status changed
        const statusMessages = {
          'RESOLVED': 'Your dispute has been resolved',
          'PAID': 'Your payment has been processed',
          'DISPUTED': 'Statement dispute submitted successfully'
        };
        
        if (statusMessages[updatedStmt.status]) {
          showNotification({
            type: 'success',
            title: 'Statement Updated',
            message: statusMessages[updatedStmt.status]
          });
        }
      }
    });
  }
  
  private adjustPollingInterval(): void {
    if (this.intervalId) {
      this.stopPolling();
      this.startPolling();
    }
  }
}
```

### WebSocket Events (Future Enhancement)

```typescript
interface WebSocketEvents {
  // Event payloads for real-time updates
  'statement.status_changed': {
    statementId: string;
    oldStatus: RoyaltyStatementStatus;
    newStatus: RoyaltyStatementStatus;
    updatedAt: string;
    userId: string;        // User who should receive this event
  };
  
  'statement.dispute_resolved': {
    statementId: string;
    resolution: string;
    adjustmentCents?: number;
    resolvedAt: string;
    userId: string;
  };
  
  'statement.payment_processed': {
    statementId: string;
    amountCents: number;
    paymentReference: string;
    processedAt: string;
    userId: string;
  };
}

// WebSocket client implementation (if needed in future)
export class StatementWebSocketClient {
  private ws: WebSocket | null = null;
  
  connect(userId: string): void {
    this.ws = new WebSocket(`ws://localhost:3000/ws/statements?userId=${userId}`);
    
    this.ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      this.handleEvent(type, data);
    };
  }
  
  private handleEvent(type: string, data: any): void {
    switch (type) {
      case 'statement.status_changed':
        this.handleStatusChange(data);
        break;
      case 'statement.dispute_resolved':
        this.handleDisputeResolved(data);
        break;
      case 'statement.payment_processed':
        this.handlePaymentProcessed(data);
        break;
    }
  }
  
  private handleStatusChange(data: WebSocketEvents['statement.status_changed']): void {
    // Update UI state and show notification
    updateStatementInStore(data.statementId, { status: data.newStatus });
    showNotification({
      type: 'info',
      title: 'Statement Updated',
      message: `Statement status changed to ${data.newStatus}`
    });
  }
  
  // ... other event handlers
}
```

---

## 9. Pagination & Filtering

### Advanced Pagination Patterns

```typescript
interface PaginationStrategy {
  // Option 1: Page-based pagination (current implementation)
  pageBased: {
    pros: ['Simple to implement', 'Good for small datasets', 'User-friendly URLs'];
    cons: ['Inconsistent results if data changes', 'Poor performance for large offsets'];
    useCase: 'Creator statement lists (typically <100 statements)';
  };
  
  // Option 2: Cursor-based pagination (future enhancement)
  cursorBased: {
    pros: ['Consistent results', 'Better performance', 'Real-time safe'];
    cons: ['More complex', 'No random page access'];
    useCase: 'Admin statement lists (potentially 1000s of statements)';
  };
}

// Enhanced pagination component
export const PaginationComponent = {
  calculateVisiblePages: (currentPage: number, totalPages: number, maxVisible = 7): number[] => {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  },
  
  getPageInfo: (page: number, limit: number, totalCount: number) => ({
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit),
    startItem: (page - 1) * limit + 1,
    endItem: Math.min(page * limit, totalCount),
    totalCount,
    hasNextPage: page < Math.ceil(totalCount / limit),
    hasPreviousPage: page > 1,
  })
};
```

### Filtering & Search

```typescript
interface FilterOptions {
  // Status filter
  status: {
    options: RoyaltyStatementStatus[];
    defaultValue: 'all';
    multiSelect: false;
  };
  
  // Date range filter
  dateRange: {
    presets: [
      { label: 'Last 30 days', value: 'last_30_days' },
      { label: 'Last 90 days', value: 'last_90_days' },
      { label: 'This year', value: 'this_year' },
      { label: 'Custom range', value: 'custom' }
    ];
    defaultValue: 'last_90_days';
  };
  
  // Amount range filter (for admins)
  amountRange: {
    min: number;
    max: number;
    step: 100; // $1.00 increments
  };
}

// Filter state management
export class StatementFilters {
  private filters: Map<string, any> = new Map();
  
  setFilter(key: string, value: any): void {
    if (value === null || value === undefined || value === '') {
      this.filters.delete(key);
    } else {
      this.filters.set(key, value);
    }
  }
  
  getFilter(key: string): any {
    return this.filters.get(key);
  }
  
  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    
    for (const [key, value] of this.filters) {
      if (Array.isArray(value)) {
        params[key] = value.join(',');
      } else if (value instanceof Date) {
        params[key] = value.toISOString();
      } else {
        params[key] = String(value);
      }
    }
    
    return params;
  }
  
  fromQueryParams(params: URLSearchParams): void {
    this.filters.clear();
    
    for (const [key, value] of params) {
      if (key === 'status' && value !== 'all') {
        this.filters.set(key, value);
      } else if (key.includes('date') && value) {
        this.filters.set(key, new Date(value).toISOString());
      } else if (value && value !== 'all') {
        this.filters.set(key, value);
      }
    }
  }
  
  clear(): void {
    this.filters.clear();
  }
  
  getActiveCount(): number {
    return this.filters.size;
  }
}

// Date range helper
export const DateRangeHelper = {
  getPresetRange: (preset: string): { from: Date; to: Date } | null => {
    const now = new Date();
    const ranges: Record<string, { from: Date; to: Date }> = {
      'last_30_days': {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: now
      },
      'last_90_days': {
        from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        to: now
      },
      'this_year': {
        from: new Date(now.getFullYear(), 0, 1),
        to: now
      }
    };
    
    return ranges[preset] || null;
  }
};
```

---

## 10. Caching Strategy

### Client-Side Caching

```typescript
interface CacheStrategy {
  // Cache keys
  keys: {
    statementList: (filters: string) => `statements:list:${filters}`;
    statementDetail: (id: string) => `statement:detail:${id}`;
    statementLines: (id: string, page: number) => `statement:lines:${id}:${page}`;
  };
  
  // Cache TTL (Time To Live)
  ttl: {
    statementList: 300000;    // 5 minutes
    statementDetail: 600000;  // 10 minutes 
    statementLines: 3600000;  // 1 hour (line items rarely change)
  };
  
  // Cache invalidation rules
  invalidation: {
    onStatusChange: ['statementList', 'statementDetail'];
    onDispute: ['statementList', 'statementDetail'];
    onNewStatement: ['statementList'];
  };
}

// Cache implementation with React Query
export const useStatementCache = () => {
  const queryClient = useQueryClient();
  
  const invalidateStatementCache = (statementId?: string) => {
    if (statementId) {
      // Invalidate specific statement
      queryClient.invalidateQueries(['statement', 'detail', statementId]);
      queryClient.invalidateQueries(['statement', 'lines', statementId]);
    }
    
    // Always invalidate lists
    queryClient.invalidateQueries(['statements', 'list']);
  };
  
  const prefetchStatementDetail = (statementId: string) => {
    queryClient.prefetchQuery(
      ['statement', 'detail', statementId],
      () => fetchStatementDetail(statementId),
      { staleTime: 10 * 60 * 1000 } // 10 minutes
    );
  };
  
  return {
    invalidateStatementCache,
    prefetchStatementDetail
  };
};

// Cache-aware data fetching
export const useStatements = (filters: CreatorStatementsQuery) => {
  const filterKey = JSON.stringify(filters);
  
  return useQuery(
    ['statements', 'list', filterKey],
    () => fetchStatements(filters),
    {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      cacheTime: 30 * 60 * 1000,       // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 3;
      }
    }
  );
};
```

---

This completes Part 2 of the Statement Generation Frontend Integration Guide. The document covers PDF downloads, rate limiting, real-time updates, pagination, filtering, and caching strategies.

**Final Document Needed:**
- Part 3: Frontend Implementation Checklist, UX Guidelines & Edge Cases

Would you like me to create Part 3?
