# Audit & Reconciliation Module - Frontend Integration Guide (Part 3)
**Classification:** 🔒 ADMIN ONLY - Internal operations and admin interface only

## Frontend Implementation Checklist

### Phase 1: Core Infrastructure (Week 1)

#### ✅ Authentication & Authorization
- [ ] Implement admin-only route guards
- [ ] Add role-based permission checks
- [ ] Set up JWT token validation middleware
- [ ] Create audit activity logging for admin actions

```typescript
// Route guard example
const AuditRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  
  if (!user?.permissions?.canViewReconciliation) {
    return <UnauthorizedPage />;
  }
  
  return <>{children}</>;
};
```

#### ✅ API Client Setup
- [ ] Create tRPC client with audit endpoints
- [ ] Set up React Query with appropriate cache settings
- [ ] Implement retry logic for failed requests
- [ ] Add request/response interceptors for logging

```typescript
// API client setup
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../backend/src/router';

export const trpc = createTRPCReact<AppRouter>();

// React Query configuration for audit data
export const auditQueryConfig = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000, // 10 minutes
  retry: (failureCount: number, error: any) => {
    if (error?.data?.code === 'UNAUTHORIZED') return false;
    return failureCount < 3;
  }
};
```

#### ✅ Error Handling System
- [ ] Create error boundary components
- [ ] Implement user-friendly error messages
- [ ] Set up error reporting to monitoring system
- [ ] Add fallback UI for failed states

```typescript
// Error boundary for audit pages
export class AuditErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Audit module error:', error, errorInfo);
    // Report to monitoring service
  }

  render() {
    if (this.state.hasError) {
      return <AuditErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
```

### Phase 2: Core UI Components (Week 2)

#### ✅ Data Display Components
- [ ] **ReconciliationSummaryCard**: High-level metrics display
- [ ] **TransactionMatchTable**: Reconciled transaction list
- [ ] **DiscrepancyAlertCard**: Critical discrepancy alerts
- [ ] **AuditTrailTable**: Paginated audit entries
- [ ] **FailureAnalysisChart**: Visual failure breakdown

```typescript
// Example component structure
interface ReconciliationSummaryCardProps {
  data: {
    reconciliationRate: number;
    totalInternalCents: number;
    totalStripeCents: number;
    discrepancyCents: number;
    matchedCount: number;
    unmatchedCount: number;
  };
  isLoading?: boolean;
  period: { start: Date; end: Date };
}

export const ReconciliationSummaryCard: React.FC<ReconciliationSummaryCardProps> = ({
  data,
  isLoading,
  period
}) => {
  const reconciliationStatus = useMemo(() => {
    if (data.reconciliationRate >= 0.95) return 'good';
    if (data.reconciliationRate >= 0.85) return 'warning';
    return 'critical';
  }, [data.reconciliationRate]);

  return (
    <Card className={`border-l-4 ${getStatusBorderColor(reconciliationStatus)}`}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Reconciliation Summary</CardTitle>
            <CardDescription>
              {formatDateRange(period.start, period.end)}
            </CardDescription>
          </div>
          <Badge variant={reconciliationStatus}>
            {(data.reconciliationRate * 100).toFixed(1)}% Matched
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SkeletonLoader />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Internal Total"
              value={formatCurrency(data.totalInternalCents)}
              trend={undefined}
            />
            <MetricCard
              label="Stripe Total"
              value={formatCurrency(data.totalStripeCents)}
              trend={undefined}
            />
            <MetricCard
              label="Discrepancy"
              value={formatCurrency(Math.abs(data.discrepancyCents))}
              variant={data.discrepancyCents === 0 ? 'success' : 'warning'}
            />
            <MetricCard
              label="Unmatched"
              value={data.unmatchedCount.toString()}
              variant={data.unmatchedCount === 0 ? 'success' : 'warning'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

#### ✅ Filter & Search Components
- [ ] **DateRangePicker**: Period selection with presets
- [ ] **AuditFiltersPanel**: Advanced filtering options
- [ ] **EntityTypeFilter**: Filter by transaction types
- [ ] **SeverityFilter**: Filter by risk/severity levels
- [ ] **SearchBar**: Real-time search with debouncing

```typescript
// Advanced filters component
interface AuditFiltersProps {
  filters: AuditFilters;
  onFiltersChange: (filters: AuditFilters) => void;
  availableEntityTypes: string[];
  availableUsers: { id: string; email: string }[];
}

export const AuditFiltersPanel: React.FC<AuditFiltersProps> = ({
  filters,
  onFiltersChange,
  availableEntityTypes,
  availableUsers
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MultiSelect
              label="Entity Types"
              options={availableEntityTypes.map(type => ({ 
                value: type, 
                label: formatEntityType(type) 
              }))}
              value={filters.entityTypes || []}
              onChange={(entityTypes) => 
                onFiltersChange({ ...filters, entityTypes })
              }
            />
            
            <MultiSelect
              label="Risk Levels"
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' }
              ]}
              value={filters.riskLevels || []}
              onChange={(riskLevels) => 
                onFiltersChange({ ...filters, riskLevels })
              }
            />

            <AmountRangeInput
              label="Amount Range"
              value={filters.amountRange}
              onChange={(amountRange) => 
                onFiltersChange({ ...filters, amountRange })
              }
            />
          </div>
          
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => onFiltersChange({})}
            >
              Clear All
            </Button>
            <div className="text-sm text-muted-foreground">
              {getActiveFilterCount(filters)} active filters
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
```

### Phase 3: Report Generation UI (Week 3)

#### ✅ Report Management
- [ ] **ReportGenerationWizard**: Step-by-step report creation
- [ ] **ReportStatusTracker**: Background job progress monitoring
- [ ] **ReportDownloadManager**: Secure download handling
- [ ] **ScheduledReportsPanel**: Recurring report management

```typescript
// Report generation wizard
export const ReportGenerationWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [reportConfig, setReportConfig] = useState<ReportConfig>({});
  
  const generateReportMutation = trpc.reports.financial.generate.useMutation({
    onSuccess: (data) => {
      // Navigate to status tracking page
      router.push(`/admin/audit/reports/${data.reportId}`);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const steps = [
    {
      title: 'Report Type',
      component: <ReportTypeSelection 
        value={reportConfig.reportType} 
        onChange={(reportType) => setReportConfig({ ...reportConfig, reportType })}
      />
    },
    {
      title: 'Parameters',
      component: <ReportParametersForm 
        reportType={reportConfig.reportType}
        value={reportConfig.parameters} 
        onChange={(parameters) => setReportConfig({ ...reportConfig, parameters })}
      />
    },
    {
      title: 'Output Options',
      component: <ReportOutputOptions 
        value={reportConfig} 
        onChange={setReportConfig}
      />
    },
    {
      title: 'Review & Generate',
      component: <ReportReview 
        config={reportConfig}
        onGenerate={() => generateReportMutation.mutate(reportConfig)}
        isGenerating={generateReportMutation.isLoading}
      />
    }
  ];

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Generate Audit Report</CardTitle>
        <StepIndicator currentStep={currentStep} totalSteps={steps.length} />
      </CardHeader>
      <CardContent>
        {steps[currentStep].component}
        
        <div className="flex justify-between mt-6">
          <Button 
            variant="outline" 
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            Previous
          </Button>
          
          {currentStep < steps.length - 1 ? (
            <Button 
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!isStepValid(currentStep, reportConfig)}
            >
              Next
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
```

### Phase 4: Advanced Features (Week 4)

#### ✅ Real-time Monitoring
- [ ] **DiscrepancyAlertPanel**: Live discrepancy notifications
- [ ] **ReconciliationStatusIndicator**: Current system status
- [ ] **AuditActivityFeed**: Recent audit events
- [ ] **PerformanceMetricsDashboard**: System health metrics

```typescript
// Real-time discrepancy monitoring
export const DiscrepancyAlertPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<DiscrepancyAlert[]>([]);
  
  // Subscribe to real-time updates
  useEffect(() => {
    const eventSource = new EventSource('/api/audit/stream');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'discrepancy.detected') {
        setAlerts(prev => [data.payload, ...prev.slice(0, 9)]);
        
        // Show notification for critical alerts
        if (data.payload.severity === 'CRITICAL') {
          toast.error(`Critical discrepancy detected: ${data.payload.title}`);
        }
      }
    };
    
    return () => eventSource.close();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Live Discrepancy Alerts</CardTitle>
          <Badge variant="outline">
            {alerts.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {alerts.map((alert) => (
            <DiscrepancyAlertItem 
              key={alert.id} 
              alert={alert}
              onDismiss={() => dismissAlert(alert.id)}
              onInvestigate={() => router.push(`/admin/audit/discrepancy/${alert.id}`)}
            />
          ))}
          
          {alerts.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No active alerts
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

#### ✅ Bank Statement Upload
- [ ] **FileUploadZone**: Drag-and-drop bank statement upload
- [ ] **FormatDetector**: Automatic file format detection
- [ ] **ProcessingProgress**: Upload and parsing progress
- [ ] **ReconciliationPreview**: Preview before final processing

```typescript
// Bank statement upload component
export const BankStatementUpload: React.FC = () => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [parsedData, setParsedData] = useState<ParsedBankStatement | null>(null);
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', detectFileFormat(file.name));
      
      return fetch('/api/audit/bank-statements/upload', {
        method: 'POST',
        body: formData
      }).then(res => res.json());
    },
    onSuccess: (data) => {
      setParsedData(data.parsedStatement);
      setUploadState('parsed');
    },
    onError: (error) => {
      toast.error('Failed to upload bank statement');
      setUploadState('error');
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadState('uploading');
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/x-ofx': ['.ofx'],
      'application/x-qfx': ['.qfx']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Bank Statement</CardTitle>
          <CardDescription>
            Supported formats: CSV, OFX, QFX (max 50MB)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              uploadState === 'uploading' && "pointer-events-none opacity-50"
            )}
          >
            <input {...getInputProps()} />
            
            {uploadState === 'uploading' ? (
              <UploadProgress />
            ) : (
              <div className="space-y-2">
                <FileIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm">
                  Drag and drop your bank statement here, or click to select
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {parsedData && (
        <BankStatementPreview 
          data={parsedData}
          onConfirm={() => processBankStatement(parsedData)}
          onCancel={() => setParsedData(null)}
        />
      )}
    </div>
  );
};
```

---

## Testing Strategies

### Unit Testing

#### Component Testing
```typescript
// Example test for ReconciliationSummaryCard
import { render, screen } from '@testing-library/react';
import { ReconciliationSummaryCard } from '../ReconciliationSummaryCard';

describe('ReconciliationSummaryCard', () => {
  const mockData = {
    reconciliationRate: 0.95,
    totalInternalCents: 100000,
    totalStripeCents: 98000,
    discrepancyCents: 2000,
    matchedCount: 95,
    unmatchedCount: 5
  };

  it('displays reconciliation rate with correct status', () => {
    render(
      <ReconciliationSummaryCard 
        data={mockData}
        period={{ start: new Date('2024-01-01'), end: new Date('2024-01-31') }}
      />
    );

    expect(screen.getByText('95.0% Matched')).toBeInTheDocument();
    expect(screen.getByText('95.0% Matched')).toHaveClass('bg-green-100'); // Good status
  });

  it('shows warning status for low reconciliation rate', () => {
    const lowRateData = { ...mockData, reconciliationRate: 0.8 };
    
    render(
      <ReconciliationSummaryCard 
        data={lowRateData}
        period={{ start: new Date('2024-01-01'), end: new Date('2024-01-31') }}
      />
    );

    expect(screen.getByText('80.0% Matched')).toHaveClass('bg-yellow-100'); // Warning status
  });
});
```

#### API Integration Testing
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../test-utils';
import { trpc } from '../api/trpc';

describe('Audit API Integration', () => {
  it('fetches reconciliation report successfully', async () => {
    const { result } = renderHook(
      () => trpc.reports.financial.getReconciliation.useQuery({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      summary: expect.objectContaining({
        reconciliationRate: expect.any(Number),
        totalInternalCents: expect.any(Number)
      })
    });
  });

  it('handles API errors gracefully', async () => {
    // Mock API error
    server.use(
      rest.get('/api/reports/financial/reconciliation', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ message: 'Internal server error' }));
      })
    );

    const { result } = renderHook(
      () => trpc.reports.financial.getReconciliation.useQuery({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('server error');
  });
});
```

### Integration Testing

#### End-to-End Testing with Playwright
```typescript
import { test, expect } from '@playwright/test';

test.describe('Audit & Reconciliation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/admin/login');
    await page.fill('[data-testid=email]', 'admin@yesgoddess.com');
    await page.fill('[data-testid=password]', 'test-password');
    await page.click('[data-testid=login-button]');
    
    await expect(page.locator('[data-testid=admin-dashboard]')).toBeVisible();
  });

  test('generates reconciliation report', async ({ page }) => {
    await page.goto('/admin/audit/reconciliation');
    
    // Set date range
    await page.fill('[data-testid=start-date]', '2024-01-01');
    await page.fill('[data-testid=end-date]', '2024-01-31');
    
    // Generate report
    await page.click('[data-testid=generate-report]');
    
    // Wait for report to load
    await expect(page.locator('[data-testid=reconciliation-summary]')).toBeVisible();
    
    // Verify summary data is displayed
    await expect(page.locator('[data-testid=reconciliation-rate]')).toContainText('%');
    await expect(page.locator('[data-testid=matched-count]')).toBeVisible();
  });

  test('handles file upload for bank statements', async ({ page }) => {
    await page.goto('/admin/audit/bank-reconciliation');
    
    // Upload test CSV file
    const fileInput = page.locator('[data-testid=file-upload]');
    await fileInput.setInputFiles('./test-fixtures/bank-statement.csv');
    
    // Wait for parsing to complete
    await expect(page.locator('[data-testid=parsing-complete]')).toBeVisible();
    
    // Verify preview data
    await expect(page.locator('[data-testid=transaction-count]')).toContainText('transactions');
    
    // Process the statement
    await page.click('[data-testid=process-statement]');
    
    // Verify reconciliation results
    await expect(page.locator('[data-testid=reconciliation-results]')).toBeVisible();
  });
});
```

### Performance Testing

#### Load Testing Critical Endpoints
```typescript
import { check } from 'k6';
import http from 'k6/http';

export let options = {
  vus: 10, // 10 virtual users
  duration: '30s',
};

export default function() {
  // Test reconciliation endpoint under load
  let response = http.get('https://ops.yesgoddess.agency/api/reports/financial/reconciliation?startDate=2024-01-01&endDate=2024-01-31', {
    headers: {
      'Authorization': 'Bearer ' + __ENV.TEST_JWT_TOKEN,
    },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
    'has reconciliation data': (r) => r.json('summary.reconciliationRate') !== undefined,
  });
}
```

---

## UX Considerations

### Progressive Disclosure
- Start with summary/overview cards
- Allow drilling down into detailed data
- Use expandable sections for advanced options
- Provide contextual help and tooltips

### Performance Feedback
```typescript
const LOADING_STATES = {
  QUICK: {
    threshold: 500,
    indicator: 'spinner'
  },
  MEDIUM: {
    threshold: 2000,
    indicator: 'progress-bar'
  },
  LONG: {
    threshold: 10000,
    indicator: 'background-job'
  }
} as const;

// Smart loading component
export const SmartLoader: React.FC<{ 
  duration: number;
  estimatedTime?: number;
  children: React.ReactNode;
}> = ({ duration, estimatedTime, children }) => {
  if (duration < LOADING_STATES.QUICK.threshold) {
    return <Spinner />;
  }
  
  if (duration < LOADING_STATES.MEDIUM.threshold) {
    return <ProgressBar />;
  }
  
  return (
    <BackgroundJobIndicator 
      estimatedTime={estimatedTime}
      onComplete={() => window.location.reload()}
    >
      {children}
    </BackgroundJobIndicator>
  );
};
```

### Error Recovery
- Provide clear error messages with action steps
- Allow users to retry failed operations
- Offer alternative paths when primary flow fails
- Save partial progress in forms/wizards

### Accessibility
- Ensure keyboard navigation for all interactive elements
- Provide ARIA labels for complex data tables
- Use semantic HTML structure
- Support screen readers with descriptive text

---

## Security Considerations

### Data Protection
```typescript
// Sanitize sensitive data before display
export const sanitizeAuditData = (data: AuditEntry) => ({
  ...data,
  // Mask sensitive fields
  userEmail: maskEmail(data.userEmail),
  ipAddress: maskIpAddress(data.ipAddress),
  // Remove sensitive metadata
  metadata: removeSenatitiveFields(data.metadata, SENSITIVE_FIELD_PATTERNS)
});

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /ssn/i,
  /social/i
];
```

### Audit Trail Integrity
- Display cryptographic hashes for audit entries
- Show chain of custody for modified records
- Provide verification tools for data integrity
- Log all user interactions with audit data

### Download Security
- Use time-limited signed URLs for downloads
- Encrypt sensitive reports at rest
- Log all download activities
- Implement download quotas and rate limiting

## Deployment Considerations

### Environment Configuration
```typescript
// Environment-specific settings
const AUDIT_CONFIG = {
  development: {
    enableDebugMode: true,
    cacheReports: false,
    mockStripeData: true,
    logLevel: 'debug'
  },
  staging: {
    enableDebugMode: false,
    cacheReports: true,
    mockStripeData: false,
    logLevel: 'info'
  },
  production: {
    enableDebugMode: false,
    cacheReports: true,
    mockStripeData: false,
    logLevel: 'warn'
  }
} as const;
```

### Feature Flags
```typescript
const AUDIT_FEATURE_FLAGS = {
  REAL_TIME_DISCREPANCY_ALERTS: true,
  BANK_STATEMENT_AUTO_PROCESSING: false,
  ADVANCED_RECONCILIATION_RULES: true,
  AUDIT_DATA_EXPORT: true,
  SCHEDULED_REPORT_GENERATION: false
} as const;
```

### Monitoring & Alerting
```typescript
// Key metrics to monitor
const AUDIT_METRICS = {
  reconciliation_success_rate: 'gauge',
  discrepancy_detection_count: 'counter',
  report_generation_duration: 'histogram',
  failed_transaction_rate: 'gauge',
  audit_query_performance: 'histogram'
} as const;

// Alert thresholds
const ALERT_THRESHOLDS = {
  reconciliation_rate_below: 0.85,
  critical_discrepancy_count: 10,
  report_generation_timeout: 300, // 5 minutes
  audit_query_slow: 2000 // 2 seconds
} as const;
```

## Support & Maintenance

### Troubleshooting Guide
1. **Reconciliation Rate Drops**: Check Stripe API connectivity, verify data consistency
2. **Report Generation Fails**: Monitor background job queue, check database connections
3. **File Upload Issues**: Verify file format, check file size limits, validate permissions
4. **Performance Degradation**: Review query performance, check cache hit rates

### Maintenance Tasks
- Weekly: Archive old audit logs, cleanup temporary report files
- Monthly: Optimize database indexes, review and update reconciliation rules
- Quarterly: Security audit of access logs, performance optimization review

This completes the comprehensive frontend integration guide for the Audit & Reconciliation module. The frontend team now has all the information needed to implement a robust, secure, and user-friendly admin interface for financial auditing and reconciliation operations.
