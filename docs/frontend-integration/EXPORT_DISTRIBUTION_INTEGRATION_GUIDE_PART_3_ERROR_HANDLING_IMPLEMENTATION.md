# Export & Distribution Module - Frontend Integration Guide (Part 3: Error Handling & Implementation)

> **Classification: 🔒 ADMIN ONLY** - Export & Distribution functionality is exclusively for admin staff operations

## Table of Contents

1. [Error Handling & Status Codes](#error-handling--status-codes)
2. [Real-time Updates & Polling](#real-time-updates--polling)
3. [Frontend Implementation Checklist](#frontend-implementation-checklist)
4. [React Query Integration Examples](#react-query-integration-examples)
5. [UI/UX Considerations](#uiux-considerations)
6. [Testing & Debugging](#testing--debugging)

---

## Error Handling & Status Codes

### HTTP Status Codes

```typescript
interface HTTPStatusCodes {
  // Success responses
  200: 'OK - Request successful';
  201: 'Created - Report generation job created';
  202: 'Accepted - Report generation in progress';
  
  // Client error responses
  400: 'Bad Request - Invalid parameters or filters';
  401: 'Unauthorized - Invalid or missing authentication';
  403: 'Forbidden - Insufficient permissions for operation';
  404: 'Not Found - Report or resource not found';
  409: 'Conflict - Report generation limit exceeded';
  413: 'Payload Too Large - Data range too large for export';
  422: 'Unprocessable Entity - Validation errors';
  429: 'Too Many Requests - Rate limit exceeded';
  
  // Server error responses
  500: 'Internal Server Error - Report generation failed';
  502: 'Bad Gateway - Storage service unavailable';
  503: 'Service Unavailable - Report service temporarily down';
  504: 'Gateway Timeout - Report generation timed out';
}
```

### Error Response Structure

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string; // Machine-readable error code
    message: string; // Human-readable error message
    details?: any; // Additional error details
    field?: string; // Field that caused validation error
    timestamp: string; // ISO date string
    requestId: string; // Unique request identifier for debugging
  };
  retryable: boolean; // Whether the error is retryable
  retryAfter?: number; // Seconds to wait before retry (for rate limiting)
}

// Specific error types
interface ValidationError extends ErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: {
      field: string;
      value: any;
      constraint: string;
      allowedValues?: any[];
    }[];
  };
}

interface RateLimitError extends ErrorResponse {
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: 'Rate limit exceeded';
    details: {
      limit: number;
      remaining: 0;
      resetTime: string; // ISO date string
      retryAfter: number; // seconds
    };
  };
  retryAfter: number;
}

interface AuthorizationError extends ErrorResponse {
  error: {
    code: 'INSUFFICIENT_PERMISSIONS';
    message: 'User does not have permission for this operation';
    details: {
      requiredRole: string;
      userRole: string;
      operation: string;
    };
  };
}
```

### Error Codes Reference

```typescript
enum ReportErrorCodes {
  // Validation errors
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  DATE_RANGE_TOO_LARGE = 'DATE_RANGE_TOO_LARGE',
  FUTURE_DATE_NOT_ALLOWED = 'FUTURE_DATE_NOT_ALLOWED',
  INVALID_REPORT_TYPE = 'INVALID_REPORT_TYPE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_FILTERS = 'INVALID_FILTERS',
  
  // Authorization errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED',
  DAILY_QUOTA_EXCEEDED = 'DAILY_QUOTA_EXCEEDED',
  
  // Generation errors
  REPORT_GENERATION_FAILED = 'REPORT_GENERATION_FAILED',
  DATA_RETRIEVAL_FAILED = 'DATA_RETRIEVAL_FAILED',
  FILE_GENERATION_FAILED = 'FILE_GENERATION_FAILED',
  STORAGE_UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  
  // Download errors
  REPORT_NOT_FOUND = 'REPORT_NOT_FOUND',
  DOWNLOAD_EXPIRED = 'DOWNLOAD_EXPIRED',
  DOWNLOAD_LIMIT_EXCEEDED = 'DOWNLOAD_LIMIT_EXCEEDED',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  
  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  EMAIL_SERVICE_ERROR = 'EMAIL_SERVICE_ERROR',
  
  // Scheduled report errors
  SCHEDULE_VALIDATION_FAILED = 'SCHEDULE_VALIDATION_FAILED',
  RECIPIENT_LIST_INVALID = 'RECIPIENT_LIST_INVALID',
  SCHEDULE_CONFLICT = 'SCHEDULE_CONFLICT',
  MAX_SCHEDULED_REPORTS_EXCEEDED = 'MAX_SCHEDULED_REPORTS_EXCEEDED'
}
```

### Error Handling Strategies

```typescript
interface ErrorHandlingStrategies {
  // User-facing error messages
  userFriendlyMessages: {
    [key in ReportErrorCodes]: {
      title: string;
      message: string;
      action?: string;
      severity: 'error' | 'warning' | 'info';
    };
  };
  
  // Retry strategies
  retryStrategies: {
    [key in ReportErrorCodes]: {
      retryable: boolean;
      maxRetries: number;
      backoffMultiplier: number;
      initialDelay: number; // milliseconds
    };
  };
  
  // Recovery actions
  recoveryActions: {
    [key in ReportErrorCodes]: {
      autoRecover: boolean;
      suggestedAction: string;
      escalationRequired: boolean;
    };
  };
}

// Example user-friendly messages
const userFriendlyMessages: Partial<ErrorHandlingStrategies['userFriendlyMessages']> = {
  [ReportErrorCodes.DATE_RANGE_TOO_LARGE]: {
    title: 'Date Range Too Large',
    message: 'The selected date range is too large. Please select a smaller time period.',
    action: 'Reduce the date range and try again.',
    severity: 'warning'
  },
  
  [ReportErrorCodes.RATE_LIMIT_EXCEEDED]: {
    title: 'Too Many Requests',
    message: 'You have exceeded the rate limit for report generation.',
    action: 'Please wait a few minutes before generating another report.',
    severity: 'warning'
  },
  
  [ReportErrorCodes.REPORT_GENERATION_FAILED]: {
    title: 'Report Generation Failed',
    message: 'An error occurred while generating your report.',
    action: 'Please try again or contact support if the problem persists.',
    severity: 'error'
  },
  
  [ReportErrorCodes.INSUFFICIENT_PERMISSIONS]: {
    title: 'Access Denied',
    message: 'You do not have permission to perform this action.',
    action: 'Contact your administrator to request access.',
    severity: 'error'
  }
};
```

---

## Real-time Updates & Polling

### Report Generation Status Polling

```typescript
interface ReportStatusPolling {
  // Polling configuration
  config: {
    initialDelay: 2000; // 2 seconds
    maxDelay: 30000; // 30 seconds maximum
    backoffMultiplier: 1.5; // Increase delay by 50% each iteration
    maxAttempts: 60; // Stop after 60 attempts (30 minutes max)
    jitterRange: 0.1; // Add ±10% jitter to prevent thundering herd
  };
  
  // Status endpoint
  endpoint: '/api/trpc/reports.getGenerationStatus';
  
  // Request/response
  request: {
    reportId: string;
  };
  
  response: {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number; // 0-100
    estimatedCompletion?: string; // ISO date string
    error?: string;
    downloadUrl?: string; // Available when status is COMPLETED
  };
}

// Polling implementation with exponential backoff
class ReportStatusPoller {
  private reportId: string;
  private attempts = 0;
  private currentDelay = 2000;
  private maxAttempts = 60;
  private abortController = new AbortController();
  
  constructor(reportId: string) {
    this.reportId = reportId;
  }
  
  async startPolling(onUpdate: (status: ReportStatus) => void): Promise<ReportStatus> {
    while (this.attempts < this.maxAttempts) {
      try {
        // Add jitter to prevent thundering herd
        const jitter = (Math.random() - 0.5) * 0.2 * this.currentDelay;
        await this.delay(this.currentDelay + jitter);
        
        const status = await this.checkStatus();
        onUpdate(status);
        
        // Terminal states
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          return status;
        }
        
        // Increase delay for next attempt
        this.currentDelay = Math.min(
          this.currentDelay * 1.5,
          30000 // Max 30 seconds
        );
        this.attempts++;
        
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Polling cancelled');
        }
        
        // On error, wait and retry
        await this.delay(5000);
        this.attempts++;
      }
    }
    
    throw new Error('Polling timeout: Report generation took too long');
  }
  
  private async checkStatus(): Promise<ReportStatus> {
    const response = await fetch(`/api/trpc/reports.getGenerationStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ reportId: this.reportId }),
      signal: this.abortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      this.abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Polling cancelled'));
      });
    });
  }
  
  cancel(): void {
    this.abortController.abort();
  }
}
```

### WebSocket Integration (Optional)

```typescript
interface WebSocketIntegration {
  // WebSocket configuration
  config: {
    endpoint: 'wss://ops.yesgoddess.agency/ws/reports';
    protocols: ['report-updates'];
    heartbeatInterval: 30000; // 30 seconds
    reconnectAttempts: 5;
    reconnectDelay: 5000; // 5 seconds
  };
  
  // Message types
  messageTypes: {
    // Subscribe to report updates
    subscribe: {
      type: 'subscribe';
      reportId: string;
      clientId: string;
    };
    
    // Report status update
    statusUpdate: {
      type: 'status_update';
      reportId: string;
      status: ReportStatus;
      timestamp: string;
    };
    
    // Report completed
    completed: {
      type: 'completed';
      reportId: string;
      downloadUrl: string;
      fileSize: number;
      timestamp: string;
    };
    
    // Error occurred
    error: {
      type: 'error';
      reportId: string;
      error: string;
      code: string;
      timestamp: string;
    };
  };
}

// WebSocket client implementation
class ReportWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(
        'wss://ops.yesgoddess.agency/ws/reports',
        ['report-updates'],
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        }
      );
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stopHeartbeat();
        this.attemptReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }
  
  subscribeToReport(reportId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        reportId,
        clientId: this.generateClientId()
      }));
    }
  }
  
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'status_update':
        this.emit('statusUpdate', message);
        break;
      case 'completed':
        this.emit('completed', message);
        break;
      case 'error':
        this.emit('error', message);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }
  
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect().catch(console.error);
      }, 5000);
    }
  }
  
  // Event emitter functionality
  private events: { [key: string]: Function[] } = {};
  
  on(event: string, callback: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  
  private emit(event: string, data: any): void {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }
  
  private generateClientId(): string {
    return `client_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Report Generation

```typescript
interface Phase1Checklist {
  // API client setup
  apiClient: {
    [ ] configureBaseURL: boolean; // Set base URL for API calls
    [ ] setupAuthentication: boolean; // Configure JWT token handling
    [ ] implementErrorHandling: boolean; // Global error handling
    [ ] addRequestInterceptors: boolean; // Add auth headers automatically
    [ ] addResponseInterceptors: boolean; // Handle token refresh
  };
  
  // Basic UI components
  uiComponents: {
    [ ] reportTypeSelector: boolean; // Dropdown for report types
    [ ] dateRangePicker: boolean; // Date range selection component
    [ ] formatSelector: boolean; // Export format selection (PDF, CSV, Excel)
    [ ] filterConfiguration: boolean; // Brand/creator/license filters
    [ ] generateButton: boolean; // Report generation trigger
    [ ] progressIndicator: boolean; // Loading/progress display
    [ ] errorDisplay: boolean; // Error message display
    [ ] successNotification: boolean; // Success feedback
  };
  
  // Core functionality
  coreFunctionality: {
    [ ] validateInputs: boolean; // Client-side validation
    [ ] generateReport: boolean; // Call generation API
    [ ] pollForStatus: boolean; // Poll for completion status
    [ ] downloadReport: boolean; // Handle secure download
    [ ] errorRecovery: boolean; // Retry failed operations
  };
}
```

### Phase 2: Advanced Features

```typescript
interface Phase2Checklist {
  // Scheduled reports
  scheduledReports: {
    [ ] createSchedule: boolean; // Create new scheduled reports
    [ ] editSchedule: boolean; // Modify existing schedules
    [ ] deleteSchedule: boolean; // Remove scheduled reports
    [ ] listSchedules: boolean; // View all scheduled reports
    [ ] manualTrigger: boolean; // Manually trigger scheduled report
    [ ] recipientManagement: boolean; // Manage email recipients
  };
  
  // Report archive
  reportArchive: {
    [ ] listReports: boolean; // Browse historical reports
    [ ] searchReports: boolean; // Search with filters
    [ ] downloadHistorical: boolean; // Download old reports
    [ ] bulkDownload: boolean; // Download multiple reports as ZIP
    [ ] reportDetails: boolean; // View report metadata
    [ ] deleteReports: boolean; // Remove old reports (admin only)
  };
  
  // Advanced UI features
  advancedUI: {
    [ ] reportPreview: boolean; // Preview report before generation
    [ ] favoriteFilters: boolean; // Save commonly used filter sets
    [ ] exportTemplates: boolean; // Custom export templates
    [ ] batchOperations: boolean; // Bulk actions on multiple reports
    [ ] reportSharing: boolean; // Share reports with other users
    [ ] reportComments: boolean; // Add notes to reports
  };
}
```

### Phase 3: Enterprise Features

```typescript
interface Phase3Checklist {
  // Performance optimization
  performance: {
    [ ] lazyLoading: boolean; // Lazy load large datasets
    [ ] virtualScrolling: boolean; // Virtual scrolling for large lists
    [ ] dataStreaming: boolean; // Stream large reports
    [ ] backgroundSync: boolean; // Background data synchronization
    [ ] cacheManagement: boolean; // Intelligent caching strategy
  };
  
  // Security enhancements
  security: {
    [ ] dataEncryption: boolean; // Client-side data encryption
    [ ] auditLogging: boolean; // Log all user actions
    [ ] sessionManagement: boolean; // Secure session handling
    [ ] permissionValidation: boolean; // Validate permissions client-side
    [ ] dataRedaction: boolean; // Redact sensitive data in UI
  };
  
  // Analytics and monitoring
  analytics: {
    [ ] usageTracking: boolean; // Track feature usage
    [ ] performanceMonitoring: boolean; // Monitor performance metrics
    [ ] errorReporting: boolean; // Automatic error reporting
    [ ] userFeedback: boolean; // Collect user feedback
    [ ] abTesting: boolean; // A/B test new features
  };
}
```

---

## React Query Integration Examples

### Report Generation Hook

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReportStatusPoller } from './polling';

// Report generation mutation
export const useGenerateReport = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: GenerateReportRequest) => {
      const response = await fetch('/api/trpc/reports.generateReport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Report generation failed');
      }
      
      return response.json();
    },
    
    onSuccess: (data) => {
      // Start polling for status updates
      if (data.data.reportId) {
        queryClient.setQueryData(
          ['reportStatus', data.data.reportId],
          { status: 'PENDING', progress: 0 }
        );
      }
    },
    
    onError: (error) => {
      console.error('Report generation failed:', error);
      // Show user-friendly error message
    }
  });
};

// Report status polling hook
export const useReportStatus = (reportId: string | null) => {
  return useQuery({
    queryKey: ['reportStatus', reportId],
    queryFn: async () => {
      if (!reportId) return null;
      
      const response = await fetch('/api/trpc/reports.getGenerationStatus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ reportId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch report status');
      }
      
      const result = await response.json();
      return result.data;
    },
    
    enabled: !!reportId,
    refetchInterval: (data) => {
      // Stop polling when report is complete or failed
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED') {
        return false;
      }
      
      // Use exponential backoff
      const attempt = data?.attempt || 0;
      return Math.min(2000 * Math.pow(1.5, attempt), 30000);
    },
    
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Stop retrying after 3 failures or if it's a permanent error
      return failureCount < 3 && !isPermanentError(error);
    }
  });
};

// Scheduled reports query
export const useScheduledReports = (filters?: ScheduledReportsQuery) => {
  return useQuery({
    queryKey: ['scheduledReports', filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters?.isActive !== undefined) {
        searchParams.append('isActive', filters.isActive.toString());
      }
      if (filters?.reportType) {
        searchParams.append('reportType', filters.reportType);
      }
      if (filters?.limit) {
        searchParams.append('limit', filters.limit.toString());
      }
      if (filters?.offset) {
        searchParams.append('offset', filters.offset.toString());
      }
      
      const response = await fetch(`/api/trpc/reports.getScheduled?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch scheduled reports');
      }
      
      return response.json();
    },
    
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Report archive query with infinite loading
export const useReportArchive = (filters: ArchiveSearchParams) => {
  return useInfiniteQuery({
    queryKey: ['reportArchive', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const searchParams = new URLSearchParams({
        ...filters,
        offset: pageParam.toString(),
        limit: (filters.limit || 20).toString()
      });
      
      const response = await fetch(`/api/trpc/reports.getArchive?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch report archive');
      }
      
      return response.json();
    },
    
    getNextPageParam: (lastPage, pages) => {
      const totalLoaded = pages.length * (filters.limit || 20);
      return totalLoaded < lastPage.data.pagination.total ? totalLoaded : undefined;
    },
    
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

### Custom Hooks for Complex Operations

```typescript
// Complete report generation workflow hook
export const useReportWorkflow = () => {
  const generateMutation = useGenerateReport();
  const queryClient = useQueryClient();
  
  const generateAndPoll = async (params: GenerateReportRequest) => {
    try {
      // Start generation
      const generateResult = await generateMutation.mutateAsync(params);
      const reportId = generateResult.data.reportId;
      
      // Poll for completion
      const poller = new ReportStatusPoller(reportId);
      
      return new Promise<ReportStatus>((resolve, reject) => {
        poller.startPolling((status) => {
          // Update React Query cache with status
          queryClient.setQueryData(['reportStatus', reportId], status);
          
          if (status.status === 'COMPLETED') {
            resolve(status);
          } else if (status.status === 'FAILED') {
            reject(new Error(status.error || 'Report generation failed'));
          }
        }).catch(reject);
      });
      
    } catch (error) {
      console.error('Report workflow failed:', error);
      throw error;
    }
  };
  
  return {
    generateAndPoll,
    isGenerating: generateMutation.isPending,
    error: generateMutation.error
  };
};

// Bulk download hook
export const useBulkDownload = () => {
  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      const response = await fetch('/api/trpc/reports.bulkDownload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ reportIds })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Bulk download failed');
      }
      
      const result = await response.json();
      
      // Automatically trigger download
      const link = document.createElement('a');
      link.href = result.data.downloadUrl;
      link.download = result.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return result;
    },
    
    onSuccess: (data) => {
      console.log(`Bulk download initiated: ${data.data.fileCount} files, ${formatFileSize(data.data.totalSize)}`);
    }
  });
};

// Error recovery hook
export const useErrorRecovery = () => {
  const queryClient = useQueryClient();
  
  const retryOperation = async (operationType: string, params: any) => {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        switch (operationType) {
          case 'generate':
            return await queryClient.fetchQuery({
              queryKey: ['generateReport', params],
              queryFn: () => generateReport(params)
            });
          
          case 'download':
            return await downloadReport(params.reportId);
          
          default:
            throw new Error(`Unknown operation type: ${operationType}`);
        }
      } catch (error) {
        attempt++;
        
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };
  
  return { retryOperation };
};
```

---

## UI/UX Considerations

### Loading States

```typescript
interface LoadingStates {
  // Report generation states
  generation: {
    idle: 'Ready to generate report';
    validating: 'Validating parameters...';
    submitting: 'Starting report generation...';
    queued: 'Report queued for processing';
    processing: 'Generating report... {progress}%';
    finalizing: 'Finalizing report...';
    completed: 'Report ready for download';
    failed: 'Report generation failed';
  };
  
  // Download states
  download: {
    preparing: 'Preparing download...';
    downloading: 'Downloading... {progress}%';
    completed: 'Download complete';
    failed: 'Download failed';
  };
  
  // Archive loading
  archive: {
    loading: 'Loading reports...';
    searching: 'Searching reports...';
    loadingMore: 'Loading more results...';
    empty: 'No reports found';
  };
}

// Progress indicator component
interface ProgressIndicatorProps {
  status: ReportStatus;
  showDetails?: boolean;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ 
  status, 
  showDetails = false 
}) => {
  const getStatusMessage = (status: ReportStatus): string => {
    switch (status.status) {
      case 'PENDING':
        return 'Report queued for processing...';
      case 'PROCESSING':
        return `Generating report... ${status.progress}%`;
      case 'COMPLETED':
        return 'Report ready for download';
      case 'FAILED':
        return 'Report generation failed';
      default:
        return 'Unknown status';
    }
  };
  
  const getProgressPercentage = (status: ReportStatus): number => {
    if (status.status === 'COMPLETED') return 100;
    if (status.status === 'FAILED') return 0;
    return status.progress || 0;
  };
  
  return (
    <div className="progress-indicator">
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${getProgressPercentage(status)}%` }}
        />
      </div>
      
      <div className="status-message">
        {getStatusMessage(status)}
      </div>
      
      {showDetails && status.estimatedCompletion && (
        <div className="estimated-completion">
          Estimated completion: {formatRelativeTime(status.estimatedCompletion)}
        </div>
      )}
      
      {status.status === 'FAILED' && status.error && (
        <div className="error-details">
          {status.error}
        </div>
      )}
    </div>
  );
};
```

### Error Messaging

```typescript
interface ErrorMessageComponents {
  // Inline error for form fields
  FieldError: React.FC<{
    error?: string;
    field?: string;
  }>;
  
  // Toast notification for temporary errors
  ErrorToast: React.FC<{
    error: ErrorResponse;
    onRetry?: () => void;
    onDismiss?: () => void;
  }>;
  
  // Modal for critical errors
  ErrorModal: React.FC<{
    error: ErrorResponse;
    onClose?: () => void;
    onRetry?: () => void;
    onSupport?: () => void;
  }>;
  
  // Banner for service status
  ServiceBanner: React.FC<{
    serviceStatus: 'operational' | 'degraded' | 'outage';
    message?: string;
  }>;
}

// Error toast implementation
const ErrorToast: React.FC<{
  error: ErrorResponse;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ error, onRetry, onDismiss }) => {
  const userMessage = userFriendlyMessages[error.error.code];
  
  return (
    <div className={`error-toast severity-${userMessage?.severity || 'error'}`}>
      <div className="error-icon">
        {userMessage?.severity === 'warning' ? '⚠️' : '❌'}
      </div>
      
      <div className="error-content">
        <div className="error-title">
          {userMessage?.title || 'Error'}
        </div>
        <div className="error-message">
          {userMessage?.message || error.error.message}
        </div>
        {userMessage?.action && (
          <div className="error-action">
            {userMessage.action}
          </div>
        )}
      </div>
      
      <div className="error-actions">
        {error.retryable && onRetry && (
          <button 
            className="retry-button"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        
        {onDismiss && (
          <button 
            className="dismiss-button"
            onClick={onDismiss}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
```

### Accessibility Considerations

```typescript
interface AccessibilityFeatures {
  // ARIA labels and descriptions
  ariaLabels: {
    reportTypeSelector: 'Select report type';
    dateRangePicker: 'Select date range for report';
    formatSelector: 'Choose export format';
    generateButton: 'Generate report with current settings';
    downloadButton: 'Download completed report';
    progressIndicator: 'Report generation progress';
  };
  
  // Keyboard navigation
  keyboardNavigation: {
    tabOrder: string[]; // Define logical tab order
    shortcuts: {
      'Alt+G': 'Generate report';
      'Alt+D': 'Download report';
      'Alt+R': 'Reset filters';
      'Escape': 'Cancel current operation';
    };
  };
  
  // Screen reader support
  screenReader: {
    liveRegions: string[]; // Elements that announce changes
    descriptions: { [key: string]: string }; // Detailed descriptions
    statusUpdates: boolean; // Announce status changes
  };
  
  // High contrast mode
  highContrastMode: {
    enabled: boolean;
    alternativeColors: { [key: string]: string };
    increasedFontSizes: boolean;
  };
}

// Accessible progress indicator
const AccessibleProgressIndicator: React.FC<{
  status: ReportStatus;
}> = ({ status }) => {
  const progressPercentage = getProgressPercentage(status);
  const statusMessage = getStatusMessage(status);
  
  return (
    <div 
      role="progressbar"
      aria-valuenow={progressPercentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Report generation progress"
      aria-describedby="progress-description"
    >
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div 
        id="progress-description"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </div>
    </div>
  );
};
```

---

## Testing & Debugging

### Unit Testing

```typescript
// Test utilities
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGenerateReport, useReportStatus } from './hooks';

// Mock API responses
const mockSuccessResponse = {
  success: true,
  data: {
    reportId: 'rpt_test123',
    status: 'PENDING',
    jobId: 'job_test456'
  }
};

const mockErrorResponse = {
  success: false,
  error: {
    code: 'INVALID_DATE_RANGE',
    message: 'End date must be after start date',
    timestamp: new Date().toISOString(),
    requestId: 'req_test789'
  },
  retryable: false
};

// Test hooks
describe('Report Generation Hooks', () => {
  let queryClient: QueryClient;
  
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
  
  describe('useGenerateReport', () => {
    it('should generate report successfully', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse
      });
      
      const { result } = renderHook(() => useGenerateReport(), { wrapper });
      
      const reportParams = {
        reportType: 'revenue' as const,
        parameters: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31')
        },
        format: 'pdf' as const
      };
      
      result.current.mutate(reportParams);
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockSuccessResponse);
      });
      
      expect(fetch).toHaveBeenCalledWith(
        '/api/trpc/reports.generateReport',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(reportParams)
        })
      );
    });
    
    it('should handle validation errors', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse
      });
      
      const { result } = renderHook(() => useGenerateReport(), { wrapper });
      
      const invalidParams = {
        reportType: 'revenue' as const,
        parameters: {
          startDate: new Date('2024-12-31'),
          endDate: new Date('2024-01-01') // Invalid: end before start
        },
        format: 'pdf' as const
      };
      
      result.current.mutate(invalidParams);
      
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toContain('End date must be after start date');
      });
    });
  });
  
  describe('useReportStatus', () => {
    it('should poll for status updates', async () => {
      const reportId = 'rpt_test123';
      let callCount = 0;
      
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        const status = callCount < 3 ? 'PROCESSING' : 'COMPLETED';
        const progress = callCount < 3 ? callCount * 30 : 100;
        
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { status, progress, reportId }
          })
        });
      });
      
      const { result } = renderHook(
        () => useReportStatus(reportId),
        { wrapper }
      );
      
      await waitFor(() => {
        expect(result.current.data?.status).toBe('COMPLETED');
      });
      
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
});
```

### Integration Testing

```typescript
// Integration test for complete workflow
describe('Report Generation Workflow', () => {
  it('should complete full generation and download workflow', async () => {
    const mockServer = setupMockServer();
    
    // Mock generation endpoint
    mockServer.post('/api/trpc/reports.generateReport', (req, res) => {
      res.json({
        success: true,
        data: {
          reportId: 'rpt_integration_test',
          status: 'PENDING',
          jobId: 'job_integration_test'
        }
      });
    });
    
    // Mock status polling
    let statusCallCount = 0;
    mockServer.post('/api/trpc/reports.getGenerationStatus', (req, res) => {
      statusCallCount++;
      
      if (statusCallCount < 3) {
        res.json({
          data: {
            status: 'PROCESSING',
            progress: statusCallCount * 33,
            reportId: 'rpt_integration_test'
          }
        });
      } else {
        res.json({
          data: {
            status: 'COMPLETED',
            progress: 100,
            reportId: 'rpt_integration_test',
            downloadUrl: 'https://example.com/download/rpt_integration_test'
          }
        });
      }
    });
    
    // Render component
    const { getByRole, getByText } = render(<ReportGenerationPage />);
    
    // Fill form
    fireEvent.change(getByRole('combobox', { name: /report type/i }), {
      target: { value: 'revenue' }
    });
    
    fireEvent.change(getByRole('textbox', { name: /start date/i }), {
      target: { value: '2024-01-01' }
    });
    
    fireEvent.change(getByRole('textbox', { name: /end date/i }), {
      target: { value: '2024-12-31' }
    });
    
    // Generate report
    fireEvent.click(getByRole('button', { name: /generate report/i }));
    
    // Wait for completion
    await waitFor(() => {
      expect(getByText(/report ready for download/i)).toBeInTheDocument();
    });
    
    // Verify download button appears
    expect(getByRole('button', { name: /download report/i })).toBeInTheDocument();
    
    mockServer.close();
  });
});
```

### Error Handling Testing

```typescript
describe('Error Handling', () => {
  it('should handle network errors gracefully', async () => {
    // Simulate network failure
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    const { result } = renderHook(() => useGenerateReport(), { wrapper });
    
    result.current.mutate({
      reportType: 'revenue',
      parameters: { startDate: new Date(), endDate: new Date() },
      format: 'pdf'
    });
    
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toContain('Network error');
    });
  });
  
  it('should retry failed operations', async () => {
    let attempts = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error('Temporary failure'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockSuccessResponse
      });
    });
    
    const { retryOperation } = useErrorRecovery();
    
    const result = await retryOperation('generate', {
      reportType: 'revenue',
      parameters: { startDate: new Date(), endDate: new Date() },
      format: 'pdf'
    });
    
    expect(attempts).toBe(3);
    expect(result).toEqual(mockSuccessResponse);
  });
});
```

### Performance Testing

```typescript
describe('Performance', () => {
  it('should handle large datasets efficiently', async () => {
    const startTime = performance.now();
    
    // Simulate large dataset response
    const largeDataset = Array(10000).fill(null).map((_, i) => ({
      id: `report_${i}`,
      name: `Report ${i}`,
      generatedAt: new Date().toISOString()
    }));
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          reports: largeDataset,
          pagination: { total: 10000, page: 1, totalPages: 500 }
        }
      })
    });
    
    const { result } = renderHook(
      () => useReportArchive({ limit: 20 }),
      { wrapper }
    );
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(1000); // 1 second
  });
  
  it('should implement proper virtual scrolling', () => {
    const items = Array(10000).fill(null).map((_, i) => ({
      id: `item_${i}`,
      name: `Item ${i}`
    }));
    
    const { container } = render(
      <VirtualizedReportList 
        items={items}
        itemHeight={50}
        containerHeight={400}
      />
    );
    
    // Should only render visible items plus buffer
    const renderedItems = container.querySelectorAll('[data-testid="report-item"]');
    expect(renderedItems.length).toBeLessThan(20); // Much less than total
  });
});
```

---

## Summary

This comprehensive guide covers all aspects of integrating with the Export & Distribution module:

1. **Part 1** - Complete API endpoints with TypeScript definitions
2. **Part 2** - Export formats, business logic, and data processing pipelines  
3. **Part 3** - Error handling, real-time updates, implementation checklists, and testing

The frontend team now has everything needed to implement a robust, user-friendly interface for the Export & Distribution functionality without requiring clarification questions from the backend team.

For any implementation questions or issues, refer to the backend team or create a support ticket with the specific error codes and request IDs for faster debugging.
