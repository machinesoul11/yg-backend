# Statement Generation Module - Frontend Integration Guide (Part 3)

**Classification:** ⚡ HYBRID - Implementation Checklist & UX Guidelines

---

## 11. Frontend Implementation Checklist

### Phase 1: Basic Statement Viewing (Creator Portal)

#### ✅ Core API Integration
- [ ] Set up API client with proper authentication
- [ ] Implement `GET /api/me/royalties/statements` for creator statement list
- [ ] Implement `GET /api/royalties/statements/:id` for statement details
- [ ] Implement `GET /api/royalties/statements/:id/lines` for line items
- [ ] Add proper error handling for all endpoints
- [ ] Implement TypeScript types for all API responses

#### ✅ Statement List Page
- [ ] Display statements in a table/card layout
- [ ] Show period, amount, status, and action buttons
- [ ] Implement pagination (page-based)
- [ ] Add status filtering (dropdown)
- [ ] Add date range filtering
- [ ] Add sorting by date/amount
- [ ] Show summary statistics (total earnings, paid, pending)
- [ ] Add loading states and skeleton screens
- [ ] Handle empty states (no statements)

#### ✅ Statement Detail Page
- [ ] Display complete statement information
- [ ] Show royalty run details
- [ ] Display creator information
- [ ] Show financial breakdown (gross/fees/net)
- [ ] Add line items table with pagination
- [ ] Show correction history if applicable
- [ ] Add breadcrumb navigation
- [ ] Implement PDF download button (when available)

#### ✅ Responsive Design
- [ ] Mobile-friendly layout (<768px)
- [ ] Tablet optimization (768px-1024px)
- [ ] Desktop layout (>1024px)
- [ ] Touch-friendly buttons and spacing
- [ ] Proper text sizing and contrast

### Phase 2: Dispute Management

#### ✅ Dispute Submission
- [ ] Implement `POST /api/royalties/statements/:id/dispute` 
- [ ] Create dispute form with validation
- [ ] Add character counter for reason field (10-2000 chars)
- [ ] Optional description field
- [ ] File upload for evidence (optional)
- [ ] Form validation and error display
- [ ] Success confirmation with next steps
- [ ] Disable dispute button for ineligible statements

#### ✅ Dispute Status Display
- [ ] Show dispute status in statement list
- [ ] Display dispute reason in detail view
- [ ] Show dispute timeline/history
- [ ] Display resolution when completed
- [ ] Add visual indicators for disputed statements

#### ✅ Business Rule Enforcement
- [ ] Prevent dispute on already disputed statements
- [ ] Check 90-day window for paid statements
- [ ] Show appropriate error messages
- [ ] Disable actions when rules prevent them

### Phase 3: Admin Interface

#### ✅ Admin Statement Management
- [ ] Implement admin version of statement list
- [ ] Add creator filtering for admins
- [ ] Show all statements across creators
- [ ] Add bulk actions (future enhancement)
- [ ] Higher pagination limits for admins

#### ✅ Enhanced Filtering (Admin)
- [ ] Creator search/selection
- [ ] Royalty run filtering
- [ ] Amount range filtering
- [ ] Advanced date filters
- [ ] Status filtering with counts
- [ ] Export functionality (future enhancement)

### Phase 4: Advanced Features

#### ✅ Real-time Updates
- [ ] Implement polling service for status changes
- [ ] Show notifications for important updates
- [ ] Handle background/foreground polling rates
- [ ] Graceful degradation when polling fails

#### ✅ Performance Optimization
- [ ] Implement caching strategy with React Query
- [ ] Add prefetching for commonly accessed data
- [ ] Optimize bundle size
- [ ] Add service worker for offline support (optional)

#### ✅ Accessibility
- [ ] WCAG 2.1 AA compliance
- [ ] Screen reader support
- [ ] Keyboard navigation
- [ ] High contrast mode support
- [ ] Focus management

---

## 12. UX Guidelines & Best Practices

### Visual Design Patterns

```typescript
interface DesignTokens {
  // Status colors
  statusColors: {
    PENDING: '#F59E0B';      // Amber - requires attention
    REVIEWED: '#10B981';     // Green - positive action
    DISPUTED: '#EF4444';     // Red - issue/problem
    RESOLVED: '#8B5CF6';     // Purple - resolution
    PAID: '#059669';         // Dark green - completed
  };
  
  // Amount display
  amounts: {
    primary: '#111827';      // Dark gray for main amounts
    secondary: '#6B7280';    // Gray for fees/breakdowns
    positive: '#059669';     // Green for earnings
    negative: '#DC2626';     // Red for deductions
  };
  
  // Interactive elements
  actions: {
    primary: '#2563EB';      // Blue for primary actions
    secondary: '#6B7280';    // Gray for secondary actions
    danger: '#DC2626';       // Red for destructive actions
    disabled: '#D1D5DB';     // Light gray for disabled
  };
}
```

### Statement List UX Patterns

```typescript
interface StatementListUX {
  // Card vs Table layout
  layout: {
    mobile: 'card';          // Cards for mobile (easier touch targets)
    tablet: 'card';          // Cards for tablet
    desktop: 'table';        // Table for desktop (more data density)
  };
  
  // Loading states
  loadingStates: {
    initial: 'skeleton';     // Skeleton cards/rows
    pagination: 'spinner';   // Small spinner on page change
    refresh: 'pull-to-refresh'; // Mobile pull-to-refresh
  };
  
  // Empty states
  emptyStates: {
    noStatements: {
      icon: 'DocumentChartBarIcon';
      title: 'No statements yet';
      subtitle: 'Your royalty statements will appear here once we process your first earnings.';
      action: null;
    };
    noFilterResults: {
      icon: 'MagnifyingGlassIcon';
      title: 'No matching statements';
      subtitle: 'Try adjusting your filters or date range.';
      action: 'Clear filters';
    };
  };
}

// Status badge component
export const StatusBadge = ({ status }: { status: RoyaltyStatementStatus }) => {
  const configs = {
    PENDING: { label: 'Pending Review', color: 'amber', icon: ClockIcon },
    REVIEWED: { label: 'Reviewed', color: 'green', icon: CheckCircleIcon },
    DISPUTED: { label: 'Disputed', color: 'red', icon: ExclamationTriangleIcon },
    RESOLVED: { label: 'Resolved', color: 'purple', icon: CheckBadgeIcon },
    PAID: { label: 'Paid', color: 'emerald', icon: CurrencyDollarIcon },
  };
  
  const config = configs[status];
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
      <config.icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};
```

### Statement Detail UX Patterns

```typescript
interface StatementDetailUX {
  // Information hierarchy
  sections: [
    'summary',           // Key info: period, total, status
    'actions',          // Primary actions: download, dispute, review
    'financialBreakdown', // Amounts: gross, fees, net
    'lineItems',        // Detailed breakdown
    'history',          // Corrections, disputes, timeline
  ];
  
  // Action button states
  actionStates: {
    download: {
      available: { label: 'Download PDF', icon: 'ArrowDownTrayIcon', variant: 'primary' };
      generating: { label: 'Generating...', icon: 'ArrowPathIcon', variant: 'disabled' };
      unavailable: { label: 'PDF Not Available', icon: null, variant: 'disabled' };
    };
    
    dispute: {
      available: { label: 'Dispute Statement', icon: 'ExclamationTriangleIcon', variant: 'outline' };
      alreadyDisputed: { label: 'Already Disputed', icon: 'ExclamationTriangleIcon', variant: 'disabled' };
      windowClosed: { label: 'Dispute Window Closed', icon: null, variant: 'disabled' };
    };
    
    review: {
      available: { label: 'Mark as Reviewed', icon: 'CheckIcon', variant: 'secondary' };
      alreadyReviewed: { label: 'Reviewed', icon: 'CheckCircleIcon', variant: 'disabled' };
    };
  };
}

// Financial breakdown component
export const FinancialBreakdown = ({ statement }: { statement: RoyaltyStatementDetails }) => {
  const breakdownItems = [
    {
      label: 'Gross Earnings',
      amount: statement.totalEarningsCents,
      type: 'positive' as const,
      description: `From ${statement.summary.totalLineItems} line items`
    },
    {
      label: 'Platform Fee',
      amount: -statement.platformFeeCents,
      type: 'negative' as const,
      description: 'YesGoddess service fee'
    },
    {
      label: 'Net Payable',
      amount: statement.netPayableCents,
      type: 'primary' as const,
      description: 'Amount to be paid out',
      isTotal: true
    }
  ];
  
  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      {breakdownItems.map((item) => (
        <div key={item.label} className={`flex justify-between items-center ${item.isTotal ? 'border-t pt-3 font-semibold' : ''}`}>
          <div>
            <div className="text-sm font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-500">{item.description}</div>
          </div>
          <div className={`text-lg font-mono ${getAmountColor(item.type)}`}>
            {CurrencyUtils.formatCurrency(Math.abs(item.amount))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

### Dispute Form UX Patterns

```typescript
interface DisputeFormUX {
  // Form validation states
  validation: {
    reason: {
      minLength: 10;
      maxLength: 2000;
      showCounter: true;
      counterColor: (length: number) => length < 10 ? 'red' : length > 1900 ? 'amber' : 'gray';
    };
    
    evidence: {
      maxFiles: 5;
      allowedTypes: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
      maxFileSize: '10MB';
      showProgress: true;
    };
  };
  
  // Progressive disclosure
  steps: [
    {
      title: 'Dispute Reason';
      description: 'Tell us why you believe this statement is incorrect';
      fields: ['reason'];
      required: true;
    },
    {
      title: 'Additional Details';
      description: 'Provide more context (optional)';
      fields: ['description', 'evidenceUrls'];
      required: false;
    },
    {
      title: 'Review & Submit';
      description: 'Review your dispute before submitting';
      fields: [];
      required: false;
    }
  ];
}

// Dispute form component structure
export const DisputeForm = ({ statementId, onSuccess }: DisputeFormProps) => {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<DisputeStatementRequest>({
    reason: '',
    description: '',
    evidenceUrls: []
  });
  
  const steps = [
    <ReasonStep data={formData} onChange={setFormData} />,
    <DetailsStep data={formData} onChange={setFormData} />,
    <ReviewStep data={formData} onSubmit={handleSubmit} />
  ];
  
  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator currentStep={step} totalSteps={3} />
      <div className="mt-8">
        {steps[step]}
      </div>
      <FormNavigation 
        step={step} 
        onPrevious={() => setStep(step - 1)}
        onNext={() => setStep(step + 1)}
        canProceed={validateStep(step, formData)}
      />
    </div>
  );
};
```

---

## 13. Error Handling & Edge Cases

### Network & Connectivity Issues

```typescript
interface NetworkErrorHandling {
  // Connection patterns
  scenarios: {
    offline: {
      detection: 'navigator.onLine';
      fallback: 'Show cached data with offline indicator';
      actions: 'Disable form submissions, show retry when online';
    };
    
    slowConnection: {
      detection: 'Request timeout > 10 seconds';
      fallback: 'Show loading state with timeout message';
      actions: 'Allow cancel, suggest trying again';
    };
    
    intermittent: {
      detection: 'Failed requests with network errors';
      fallback: 'Exponential backoff retry';
      actions: 'Auto-retry up to 3 times, then manual retry';
    };
  };
}

// Network status hook
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionQuality, setConnectionQuality] = useState<'fast' | 'slow' | 'offline'>('fast');
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionQuality('fast');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionQuality('offline');
    };
    
    // Detect slow connections
    const detectSlowConnection = () => {
      const startTime = Date.now();
      fetch('/api/health', { method: 'HEAD' })
        .then(() => {
          const duration = Date.now() - startTime;
          setConnectionQuality(duration > 3000 ? 'slow' : 'fast');
        })
        .catch(() => setConnectionQuality('offline'));
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check connection quality every 30 seconds
    const interval = setInterval(detectSlowConnection, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);
  
  return { isOnline, connectionQuality };
};

// Retry mechanism
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  backoffMs = 1000
): Promise<T> => {
  let attempt = 1;
  
  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      // Don't retry on 4xx errors (client errors)
      if (error?.status >= 400 && error?.status < 500) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, backoffMs * Math.pow(2, attempt - 1)));
      attempt++;
    }
  }
  
  throw new Error('Max retry attempts exceeded');
};
```

### Data Consistency Issues

```typescript
interface DataConsistencyHandling {
  // Common inconsistency scenarios
  scenarios: {
    staleData: {
      description: 'User sees old statement status';
      detection: 'Compare updatedAt timestamps';
      resolution: 'Refresh data and show notification';
    };
    
    conflictingActions: {
      description: 'User tries to dispute already disputed statement';
      detection: 'API returns 409 Conflict';
      resolution: 'Refresh statement data, show current status';
    };
    
    deletedStatement: {
      description: 'Statement no longer exists (admin deleted)';
      detection: 'API returns 404 Not Found';
      resolution: 'Redirect to list with explanation';
    };
  };
}

// Optimistic updates handler
export const useOptimisticUpdates = () => {
  const queryClient = useQueryClient();
  
  const optimisticallyUpdateStatement = (
    statementId: string,
    updates: Partial<RoyaltyStatementDetails>
  ) => {
    // Store rollback data
    const previousData = queryClient.getQueryData(['statement', 'detail', statementId]);
    
    // Apply optimistic update
    queryClient.setQueryData(['statement', 'detail', statementId], (old: any) => ({
      ...old,
      ...updates,
      updatedAt: new Date().toISOString()
    }));
    
    return () => {
      // Rollback function
      queryClient.setQueryData(['statement', 'detail', statementId], previousData);
    };
  };
  
  const handleOptimisticFailure = (rollback: () => void, error: any) => {
    rollback();
    
    // Show appropriate error message
    if (error.status === 409) {
      showNotification({
        type: 'warning',
        title: 'Action No Longer Available',
        message: 'This statement has been updated. Refreshing data...'
      });
      
      // Refresh data
      queryClient.invalidateQueries(['statement']);
    }
  };
  
  return { optimisticallyUpdateStatement, handleOptimisticFailure };
};
```

### Permission & Access Edge Cases

```typescript
interface AccessEdgeCases {
  scenarios: {
    lostAccess: {
      description: 'Creator access revoked while viewing statement';
      response: '403 Forbidden';
      handling: 'Redirect to login with explanation';
    };
    
    roleChanged: {
      description: 'User role changed (creator ↔ admin)';
      response: 'Different data visibility';
      handling: 'Refresh user session, redirect appropriately';
    };
    
    sessionExpired: {
      description: 'JWT token expired during session';
      response: '401 Unauthorized';
      handling: 'Refresh token or redirect to login';
    };
    
    switchedAccounts: {
      description: 'User switched to different account';
      response: 'Different statement visibility';
      handling: 'Clear cache, reload data';
    };
  };
}

// Session management
export const useSessionGuard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const handleAuthError = (error: any) => {
    if (error.status === 401) {
      // Clear cached data
      queryClient.clear();
      
      // Store current location for redirect after login
      sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
      
      showNotification({
        type: 'warning',
        title: 'Session Expired',
        message: 'Please log in again to continue'
      });
      
      navigate('/login');
    } else if (error.status === 403) {
      showNotification({
        type: 'error',
        title: 'Access Denied',
        message: 'You don\'t have permission to access this resource'
      });
      
      navigate('/dashboard');
    }
  };
  
  return { handleAuthError };
};
```

### Performance Edge Cases

```typescript
interface PerformanceEdgeCases {
  scenarios: {
    largeStatements: {
      description: 'Statement with 1000+ line items';
      issues: ['Slow rendering', 'High memory usage', 'Poor scroll performance'];
      solutions: ['Virtual scrolling', 'Pagination', 'Progressive loading'];
    };
    
    slowAPIResponses: {
      description: 'API taking >10 seconds to respond';
      issues: ['User frustration', 'Timeout errors'];
      solutions: ['Timeout handling', 'Skeleton loading', 'Cancel option'];
    };
    
    memoryLeaks: {
      description: 'Long-running pages with polling';
      issues: ['High memory usage', 'Browser slowdown'];
      solutions: ['Cleanup intervals', 'Limit cache size', 'Garbage collection'];
    };
  };
}

// Virtual scrolling for large line item lists
export const VirtualizedLineItems = ({ statementId }: { statementId: string }) => {
  const [items, setItems] = useState<RoyaltyLineDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const page = Math.floor(startIndex / 50) + 1;
      const response = await fetchStatementLines(statementId, { page, limit: 50 });
      
      setItems(prev => [...prev, ...response.data]);
      setHasMore(response.pagination.hasNextPage);
    } catch (error) {
      console.error('Failed to load line items:', error);
    } finally {
      setLoading(false);
    }
  }, [statementId, loading, hasMore]);
  
  return (
    <FixedSizeList
      height={600}
      itemCount={hasMore ? items.length + 1 : items.length}
      itemSize={80}
      itemData={{ items, loadMoreItems, loading }}
    >
      {LineItemRow}
    </FixedSizeList>
  );
};
```

---

## 14. Testing Strategy

### Unit Testing

```typescript
interface UnitTestingScope {
  // Components to test
  components: [
    'StatementList',
    'StatementDetail', 
    'DisputeForm',
    'FinancialBreakdown',
    'StatusBadge',
    'LineItemsTable'
  ];
  
  // Utilities to test
  utilities: [
    'CurrencyUtils',
    'DateRangeHelper',
    'StatementBusinessRules',
    'ErrorHandler',
    'ValidationRules'
  ];
  
  // Hooks to test
  hooks: [
    'useStatements',
    'useStatementDetail',
    'useOptimisticUpdates',
    'useNetworkStatus',
    'useSessionGuard'
  ];
}

// Example component test
describe('StatementList', () => {
  it('should display statements correctly', () => {
    const mockStatements: CreatorStatementSummary[] = [
      {
        id: 'stmt_1',
        period: { start: '2025-01-01T00:00:00.000Z', end: '2025-01-31T23:59:59.999Z' },
        totalEarningsCents: 150000,
        status: 'PENDING',
        // ... other required fields
      }
    ];
    
    render(<StatementList statements={mockStatements} loading={false} />);
    
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
  });
  
  it('should handle empty state', () => {
    render(<StatementList statements={[]} loading={false} />);
    
    expect(screen.getByText('No statements yet')).toBeInTheDocument();
    expect(screen.getByText('Your royalty statements will appear here')).toBeInTheDocument();
  });
  
  it('should disable dispute button when not allowed', () => {
    const disputedStatement = {
      ...mockStatements[0],
      status: 'DISPUTED' as const
    };
    
    render(<StatementDetail statement={disputedStatement} />);
    
    const disputeButton = screen.getByRole('button', { name: /already disputed/i });
    expect(disputeButton).toBeDisabled();
  });
});

// Example utility test
describe('CurrencyUtils', () => {
  describe('formatCurrency', () => {
    it('should format cents to currency correctly', () => {
      expect(CurrencyUtils.formatCurrency(150000)).toBe('$1,500.00');
      expect(CurrencyUtils.formatCurrency(99)).toBe('$0.99');
      expect(CurrencyUtils.formatCurrency(0)).toBe('$0.00');
    });
  });
  
  describe('formatBasisPoints', () => {
    it('should format basis points to percentage', () => {
      expect(CurrencyUtils.formatBasisPoints(8000)).toBe('80.0%');
      expect(CurrencyUtils.formatBasisPoints(2500)).toBe('25.0%');
    });
  });
});
```

### Integration Testing

```typescript
interface IntegrationTestingScope {
  // API integration tests
  apiIntegration: [
    'Fetch statements with different filters',
    'Handle pagination correctly', 
    'Submit dispute and verify response',
    'Handle network errors gracefully',
    'Respect rate limits'
  ];
  
  // User flow tests
  userFlows: [
    'Creator views and filters statements',
    'Creator views statement details and line items',
    'Creator submits dispute successfully',
    'Admin views all statements with filtering',
    'Error handling throughout flows'
  ];
}

// Example integration test
describe('Statement Management Integration', () => {
  beforeEach(() => {
    // Set up mock server
    server.use(
      rest.get('/api/me/royalties/statements', (req, res, ctx) => {
        return res(ctx.json(mockStatementsResponse));
      })
    );
  });
  
  it('should complete full statement viewing flow', async () => {
    render(<StatementListPage />);
    
    // Wait for statements to load
    await waitFor(() => {
      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    });
    
    // Click on statement to view details
    fireEvent.click(screen.getByText('January 2025'));
    
    // Should navigate to detail page
    await waitFor(() => {
      expect(screen.getByText('Statement Details')).toBeInTheDocument();
    });
    
    // Should show line items
    expect(screen.getByText('Line Items')).toBeInTheDocument();
  });
  
  it('should handle dispute submission', async () => {
    render(<DisputeForm statementId="stmt_1" />);
    
    // Fill out form
    fireEvent.change(screen.getByLabelText(/dispute reason/i), {
      target: { value: 'Missing revenue from License ABC' }
    });
    
    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /submit dispute/i }));
    
    // Should show success message
    await waitFor(() => {
      expect(screen.getByText('Dispute submitted successfully')).toBeInTheDocument();
    });
  });
});
```

### End-to-End Testing

```typescript
interface E2ETestingScope {
  // Critical user journeys
  criticalPaths: [
    'Creator login → view statements → dispute statement → receive confirmation',
    'Admin login → view all statements → filter by creator → view details',
    'Creator with no statements → see empty state → understand next steps',
    'Network error → retry mechanism → successful recovery'
  ];
  
  // Browser compatibility
  browsers: ['Chrome', 'Firefox', 'Safari', 'Edge'];
  
  // Device testing
  devices: ['Desktop', 'Tablet', 'Mobile'];
}

// Example E2E test (Playwright)
test('Creator can dispute a statement', async ({ page }) => {
  // Login as creator
  await page.goto('/login');
  await page.fill('[name="email"]', 'creator@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Navigate to statements
  await page.goto('/dashboard/earnings/statements');
  await page.waitForSelector('[data-testid="statement-list"]');
  
  // Click on first statement
  await page.click('[data-testid="statement-item"]:first-child');
  
  // Verify we're on detail page
  await expect(page.locator('h1')).toContainText('Statement Details');
  
  // Click dispute button
  await page.click('button:has-text("Dispute Statement")');
  
  // Fill dispute form
  await page.fill('[name="reason"]', 'Expected higher revenue from License XYZ based on contract terms');
  await page.click('button:has-text("Submit Dispute")');
  
  // Verify success
  await expect(page.locator('[role="alert"]')).toContainText('Dispute submitted successfully');
  
  // Verify statement status updated
  await expect(page.locator('[data-testid="statement-status"]')).toContainText('Disputed');
});
```

---

## 15. Performance Monitoring

### Key Performance Metrics

```typescript
interface PerformanceMetrics {
  // Core Web Vitals
  coreWebVitals: {
    LCP: 'Largest Contentful Paint < 2.5s';      // Statement list/detail load time
    FID: 'First Input Delay < 100ms';            // Button click responsiveness  
    CLS: 'Cumulative Layout Shift < 0.1';        // Visual stability during load
  };
  
  // Custom metrics
  customMetrics: {
    apiResponseTime: 'API calls < 1s median';
    statementListLoad: 'Full statement list < 3s';
    disputeSubmission: 'Form submission < 2s';
    pdfDownloadInit: 'Download initiation < 1s';
  };
  
  // User experience metrics
  uxMetrics: {
    taskCompletionRate: '>95%';                   // Users complete intended actions
    errorRate: '<1%';                             // Unhandled errors
    abandonmentRate: '<10%';                      // Users leave without completing
  };
}

// Performance monitoring setup
export const performanceMonitor = {
  trackPageLoad: (pageName: string) => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      // Send to analytics
      analytics.track('Page Load', {
        page: pageName,
        loadTime,
        url: window.location.pathname
      });
      
      // Log slow pages
      if (loadTime > 3000) {
        console.warn(`Slow page load: ${pageName} took ${loadTime}ms`);
      }
    };
  },
  
  trackAPICall: (endpoint: string, method: string) => {
    const startTime = performance.now();
    
    return (success: boolean, status?: number) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      analytics.track('API Call', {
        endpoint,
        method,
        duration,
        success,
        status
      });
    };
  },
  
  trackUserAction: (action: string, metadata?: Record<string, any>) => {
    analytics.track('User Action', {
      action,
      timestamp: Date.now(),
      ...metadata
    });
  }
};
```

---

This completes the comprehensive Frontend Integration Guide for the Statement Generation module. The three-part documentation covers:

**Part 1:** API endpoints, authentication, TypeScript types, business logic, and error handling
**Part 2:** PDF downloads, rate limiting, real-time updates, pagination, filtering, and caching
**Part 3:** Implementation checklist, UX guidelines, edge cases, testing strategy, and performance monitoring

The frontend team should now have everything needed to implement the Statement Generation UI without requiring clarification questions.
