# ⚡ Tax & Compliance Reports - Frontend Integration Guide (Part 4: Implementation Checklist)

**Classification:** ⚡ HYBRID - Core functionality used by both public website and admin backend with different access levels

---

## Frontend Implementation Checklist

### Step 1: Setup API Client & Types

- [ ] **Install tRPC Client Dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  npm install @trpc/server  # For type imports only
  ```

- [ ] **Create tRPC Client Configuration**
  ```typescript
  // lib/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import { httpBatchLink } from '@trpc/client';
  import type { AppRouter } from '@yg-backend/server/routers/_app';

  export const trpc = createTRPCReact<AppRouter>();

  export const trpcClient = trpc.createClient({
    links: [
      httpBatchLink({
        url: 'https://ops.yesgoddess.agency/api/trpc',
        headers() {
          // Add authentication headers
          const token = getAuthToken(); // Your auth logic
          return {
            authorization: token ? `Bearer ${token}` : '',
          };
        },
      }),
    ],
  });
  ```

- [ ] **Copy TypeScript Types** (from Part 2)
  ```typescript
  // types/tax-compliance.ts
  // Copy all interfaces and enums from Part 2 of this guide
  export * from './tax-compliance-types';
  ```

- [ ] **Setup React Query Provider**
  ```typescript
  // app/providers.tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { trpc, trpcClient } from '@/lib/trpc';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  });

  export function TRPCProvider({ children }: { children: React.ReactNode }) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  ```

---

### Step 2: Core Components Implementation

#### 2.1 Tax Document List Component

- [ ] **Create TaxDocumentsList Component**
  ```typescript
  // components/tax-compliance/TaxDocumentsList.tsx
  import { trpc } from '@/lib/trpc';
  import type { TaxDocumentData, GetTaxDocumentsInput } from '@/types/tax-compliance';

  interface Props {
    creatorId?: string;
    taxYear?: number;
    initialFilters?: Partial<GetTaxDocumentsInput>;
  }

  export function TaxDocumentsList({ creatorId, taxYear, initialFilters }: Props) {
    const [filters, setFilters] = useState<GetTaxDocumentsInput>({
      creatorId,
      taxYear,
      limit: 25,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...initialFilters
    });

    const { data, isLoading, error } = trpc.taxCompliance.getTaxDocuments.useQuery(filters);

    const handlePageChange = (page: number) => {
      setFilters(prev => ({ ...prev, offset: (page - 1) * (prev.limit || 25) }));
    };

    const handleFilterChange = (newFilters: Partial<GetTaxDocumentsInput>) => {
      setFilters(prev => ({ ...prev, ...newFilters, offset: 0 }));
    };

    if (isLoading) return <DocumentsListSkeleton />;
    if (error) return <ErrorDisplay error={error} />;
    if (!data?.documents.length) return <EmptyDocumentsState />;

    return (
      <div className="tax-documents-list">
        <DocumentFilters 
          filters={filters} 
          onFiltersChange={handleFilterChange} 
        />
        
        <div className="documents-grid">
          {data.documents.map(document => (
            <TaxDocumentCard 
              key={document.id} 
              document={document}
              onUpdate={() => {/* refetch */}}
            />
          ))}
        </div>
        
        <Pagination
          currentPage={Math.floor(filters.offset / filters.limit) + 1}
          totalPages={Math.ceil(data.total / filters.limit)}
          onPageChange={handlePageChange}
        />
      </div>
    );
  }
  ```

#### 2.2 Tax Document Card Component

- [ ] **Create TaxDocumentCard Component**
  ```typescript
  // components/tax-compliance/TaxDocumentCard.tsx
  interface Props {
    document: TaxDocumentData;
    onUpdate: () => void;
  }

  export function TaxDocumentCard({ document, onUpdate }: Props) {
    const { mutate: generatePDF, isPending: isGenerating } = 
      trpc.taxCompliance.generateTaxDocument.useMutation({
        onSuccess: onUpdate,
        onError: (error) => toast.error(getUserFriendlyErrorMessage(error.data?.code))
      });

    const canGenerate = document.filingStatus === 'PENDING' && !document.pdfStorageKey;
    const canDownload = document.pdfStorageKey && !document.voidedAt;

    return (
      <div className="tax-document-card">
        <div className="card-header">
          <div className="document-type">
            <DocumentTypeIcon type={document.documentType} />
            <span>{formatDocumentType(document.documentType)}</span>
          </div>
          <FilingStatusBadge status={document.filingStatus} />
        </div>

        <div className="card-body">
          <div className="document-details">
            <p><strong>Tax Year:</strong> {document.taxYear}</p>
            <p><strong>Amount:</strong> {document.totalAmountFormatted}</p>
            {document.withholdingCents > 0 && (
              <p><strong>Withholding:</strong> {document.withholdingFormatted}</p>
            )}
            <p><strong>Created:</strong> {formatDate(document.createdAt)}</p>
          </div>

          <div className="card-actions">
            {canGenerate && (
              <Button
                onClick={() => generatePDF({ documentId: document.id })}
                disabled={isGenerating}
                loading={isGenerating}
              >
                Generate PDF
              </Button>
            )}
            
            {canDownload && (
              <DownloadButton 
                storageKey={document.pdfStorageKey!}
                filename={`${document.documentType}-${document.taxYear}.pdf`}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

#### 2.3 Payment Threshold Status Component

- [ ] **Create ThresholdStatusCard Component**
  ```typescript
  // components/tax-compliance/ThresholdStatusCard.tsx
  interface Props {
    creatorId: string;
    taxYear: number;
    jurisdiction?: string;
  }

  export function ThresholdStatusCard({ creatorId, taxYear, jurisdiction = 'US' }: Props) {
    const { data: thresholdStatus, isLoading } = 
      trpc.taxCompliance.checkThresholdStatus.useQuery({
        creatorId,
        taxYear,
        jurisdiction
      });

    if (isLoading) return <ThresholdStatusSkeleton />;
    if (!thresholdStatus) return null;

    const progressPercentage = Math.min(100, thresholdStatus.percentageReached);
    const isNearThreshold = progressPercentage >= 75;
    const hasMetThreshold = thresholdStatus.thresholdMet;

    return (
      <div className={cn("threshold-status-card", {
        "near-threshold": isNearThreshold && !hasMetThreshold,
        "threshold-met": hasMetThreshold
      })}>
        <div className="card-header">
          <h3>Tax Reporting Status - {taxYear}</h3>
          {hasMetThreshold && (
            <Badge variant="success">Threshold Met</Badge>
          )}
        </div>

        <div className="progress-section">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="progress-text">
            {thresholdStatus.currentAmountFormatted} of {thresholdStatus.thresholdAmountFormatted}
            ({progressPercentage.toFixed(1)}%)
          </div>
        </div>

        <div className="threshold-details">
          {!hasMetThreshold ? (
            <>
              <p><strong>Remaining:</strong> {thresholdStatus.remainingFormatted}</p>
              {thresholdStatus.projectedTotalFormatted && (
                <p><strong>Projected Year-End:</strong> {thresholdStatus.projectedTotalFormatted}</p>
              )}
              {thresholdStatus.daysUntilYearEnd > 0 && (
                <p><strong>Days Remaining:</strong> {thresholdStatus.daysUntilYearEnd}</p>
              )}
            </>
          ) : (
            <div className="threshold-met-info">
              <p>✅ You have reached the tax reporting threshold for {taxYear}</p>
              <p>Tax documents will be generated automatically at year-end</p>
            </div>
          )}
        </div>

        {isNearThreshold && !hasMetThreshold && (
          <div className="threshold-warning">
            <AlertTriangle className="icon" />
            <p>You are approaching the tax reporting threshold. 
               Ensure your tax information is up to date.</p>
          </div>
        )}
      </div>
    );
  }
  ```

---

### Step 3: Admin Dashboard Components

#### 3.1 Tax Form Jobs Management

- [ ] **Create TaxFormJobsList Component (Admin Only)**
  ```typescript
  // components/admin/TaxFormJobsList.tsx
  export function TaxFormJobsList() {
    const [filters, setFilters] = useState({
      limit: 20,
      offset: 0,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const
    });

    const { data: jobs } = trpc.taxCompliance.getTaxFormJobs.useQuery(filters);
    
    const { mutate: createYearEndJob } = trpc.taxCompliance.processYearEndGeneration.useMutation({
      onSuccess: () => {
        toast.success('Year-end tax form generation started');
        // Refetch jobs list
      }
    });

    return (
      <div className="tax-jobs-management">
        <div className="jobs-header">
          <h2>Tax Form Generation Jobs</h2>
          <div className="actions">
            <Button onClick={() => createYearEndJob({ taxYear: 2024 })}>
              Generate 2024 Forms
            </Button>
            <Button variant="outline" onClick={() => /* threshold check */}>
              Run Threshold Check
            </Button>
          </div>
        </div>

        <div className="jobs-list">
          {jobs?.jobs.map(job => (
            <TaxFormJobCard key={job.id} job={job} />
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **Create TaxFormJobCard Component**
  ```typescript
  // components/admin/TaxFormJobCard.tsx
  interface Props {
    job: TaxFormJobData;
  }

  export function TaxFormJobCard({ job }: Props) {
    // Poll job status if running
    const { data: currentJob } = trpc.taxCompliance.getTaxFormJobStatus.useQuery(
      { jobId: job.id },
      {
        enabled: job.isRunning,
        refetchInterval: job.isRunning ? 2000 : false,
      }
    );

    const activeJob = currentJob || job;

    return (
      <div className="tax-job-card">
        <div className="job-header">
          <div>
            <h4>{formatJobType(activeJob.jobType)} - {activeJob.taxYear}</h4>
            <p className="job-meta">
              Created {formatDistanceToNow(activeJob.createdAt)} ago
            </p>
          </div>
          <JobStatusBadge status={activeJob.status} />
        </div>

        {activeJob.isRunning && (
          <div className="job-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${activeJob.progressPercentage}%` }}
              />
            </div>
            <p className="progress-text">
              {activeJob.processedCreators} / {activeJob.totalCreators} processed
              ({activeJob.progressPercentage.toFixed(1)}%)
            </p>
            {activeJob.estimatedTimeRemaining && (
              <p className="time-remaining">
                Estimated time remaining: {activeJob.estimatedTimeRemaining}
              </p>
            )}
          </div>
        )}

        <div className="job-stats">
          <div className="stat">
            <span className="label">Total:</span>
            <span className="value">{activeJob.totalCreators}</span>
          </div>
          <div className="stat">
            <span className="label">Processed:</span>
            <span className="value">{activeJob.processedCreators}</span>
          </div>
          {activeJob.failedCreators > 0 && (
            <div className="stat error">
              <span className="label">Failed:</span>
              <span className="value">{activeJob.failedCreators}</span>
            </div>
          )}
        </div>

        {activeJob.errorDetails?.length > 0 && (
          <div className="error-details">
            <details>
              <summary>View Errors ({activeJob.errorDetails.length})</summary>
              <ul className="error-list">
                {activeJob.errorDetails.map((error, index) => (
                  <li key={index}>
                    <strong>Creator {error.creatorId}:</strong> {error.error}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    );
  }
  ```

#### 3.2 Threshold Statistics Dashboard

- [ ] **Create ThresholdStatisticsDashboard Component (Admin Only)**
  ```typescript
  // components/admin/ThresholdStatisticsDashboard.tsx
  export function ThresholdStatisticsDashboard() {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    const { data: stats } = trpc.taxCompliance.getThresholdStatistics.useQuery({
      taxYear: selectedYear
    });

    const { data: approachingThreshold } = trpc.taxCompliance.getCreatorsApproachingThreshold.useQuery({
      taxYear: selectedYear,
      percentageThreshold: 90
    });

    if (!stats) return <StatsDashboardSkeleton />;

    return (
      <div className="threshold-stats-dashboard">
        <div className="dashboard-header">
          <h2>Tax Compliance Statistics</h2>
          <YearSelector 
            selectedYear={selectedYear} 
            onYearChange={setSelectedYear} 
          />
        </div>

        <div className="stats-overview">
          <StatCard 
            title="Total Creators"
            value={stats.totalCreators}
            icon={<Users />}
          />
          <StatCard 
            title="Met Threshold"
            value={stats.thresholdMet}
            percentage={stats.thresholdMetPercentage}
            icon={<CheckCircle />}
            variant="success"
          />
          <StatCard 
            title="Total Payments"
            value={stats.totalPaymentsFormatted}
            icon={<DollarSign />}
          />
          <StatCard 
            title="Average per Creator"
            value={stats.averagePaymentsFormatted}
            icon={<TrendingUp />}
          />
        </div>

        <div className="stats-breakdown">
          <div className="jurisdiction-breakdown">
            <h3>By Jurisdiction</h3>
            <div className="jurisdiction-stats">
              {Object.entries(stats.byJurisdiction).map(([jurisdiction, data]) => (
                <div key={jurisdiction} className="jurisdiction-card">
                  <h4>{jurisdiction}</h4>
                  <p>{data.creators} creators</p>
                  <p>{data.thresholdMet} met threshold</p>
                  <p>{formatCurrency(data.totalPaymentsCents)} total</p>
                </div>
              ))}
            </div>
          </div>

          {approachingThreshold && approachingThreshold.length > 0 && (
            <div className="approaching-threshold">
              <h3>Creators Approaching Threshold</h3>
              <div className="creator-list">
                {approachingThreshold.map(creator => (
                  <div key={creator.creatorId} className="creator-threshold-card">
                    <p><strong>Creator:</strong> {creator.creatorId}</p>
                    <p><strong>Progress:</strong> {creator.percentageReached.toFixed(1)}%</p>
                    <p><strong>Current:</strong> {creator.currentAmountFormatted}</p>
                    <p><strong>Remaining:</strong> {creator.remainingFormatted}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

---

### Step 4: Error Handling & User Experience

#### 4.1 Error Display Components

- [ ] **Create TaxComplianceErrorBoundary**
  ```typescript
  // components/tax-compliance/TaxComplianceErrorBoundary.tsx
  interface Props {
    children: React.ReactNode;
    fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
  }

  export function TaxComplianceErrorBoundary({ children, fallback: Fallback }: Props) {
    return (
      <ErrorBoundary
        FallbackComponent={Fallback || TaxComplianceErrorFallback}
        onError={(error, errorInfo) => {
          // Log error to monitoring service
          console.error('Tax Compliance Error:', error, errorInfo);
        }}
      >
        {children}
      </ErrorBoundary>
    );
  }

  function TaxComplianceErrorFallback({ error, resetErrorBoundary }: any) {
    return (
      <div className="tax-compliance-error">
        <div className="error-content">
          <AlertCircle className="error-icon" />
          <h3>Tax Compliance Error</h3>
          <p>We encountered an issue with the tax compliance system.</p>
          <div className="error-actions">
            <Button onClick={resetErrorBoundary}>Try Again</Button>
            <Button variant="outline" onClick={() => window.location.href = '/support'}>
              Contact Support
            </Button>
          </div>
        </div>
      </div>
    );
  }
  ```

#### 4.2 Loading States & Skeletons

- [ ] **Create Loading Components**
  ```typescript
  // components/tax-compliance/LoadingStates.tsx
  export function DocumentsListSkeleton() {
    return (
      <div className="documents-skeleton">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="document-card-skeleton">
            <Skeleton height={20} width="60%" />
            <Skeleton height={16} width="40%" />
            <Skeleton height={16} width="80%" />
            <div className="actions-skeleton">
              <Skeleton height={32} width={100} />
              <Skeleton height={32} width={120} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  export function ThresholdStatusSkeleton() {
    return (
      <div className="threshold-skeleton">
        <Skeleton height={24} width="50%" />
        <Skeleton height={8} width="100%" className="progress-skeleton" />
        <Skeleton height={16} width="70%" />
        <Skeleton height={16} width="60%" />
      </div>
    );
  }
  ```

#### 4.3 Rate Limiting Handler

- [ ] **Create Rate Limiting Hook**
  ```typescript
  // hooks/useRateLimitHandler.ts
  export function useRateLimitHandler() {
    const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

    const handleError = useCallback((error: any) => {
      const rateLimit = handleRateLimit(error);
      if (rateLimit) {
        setRateLimitInfo(rateLimit);
        
        // Show user-friendly message
        toast.error(formatRateLimitMessage(rateLimit), {
          duration: 10000, // 10 seconds
          id: 'rate-limit-error' // Prevent duplicate toasts
        });
        
        // Clear rate limit info after reset time
        setTimeout(() => {
          setRateLimitInfo(null);
        }, rateLimit.retryAfter * 1000);
      }
    }, []);

    const isRateLimited = rateLimitInfo !== null;
    const canRetry = rateLimitInfo ? Date.now() >= rateLimitInfo.resetAt : true;

    return {
      rateLimitInfo,
      isRateLimited,
      canRetry,
      handleError
    };
  }
  ```

---

### Step 5: Utilities & Helpers

#### 5.1 Formatting Utilities

- [ ] **Create Formatting Helpers**
  ```typescript
  // utils/tax-compliance-formatters.ts
  export const formatters = {
    currency: (cents: number): string => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(cents / 100);
    },

    documentType: (type: TaxDocumentType): string => {
      const labels: Record<TaxDocumentType, string> = {
        FORM_1099_NEC: 'Form 1099-NEC',
        FORM_1099_MISC: 'Form 1099-MISC',
        W8_BEN: 'Form W8-BEN',
        W8_BEN_E: 'Form W8-BEN-E',
        W9: 'Form W-9',
        FORM_1042_S: 'Form 1042-S',
        VAT_SUMMARY: 'VAT Summary',
        GST_SUMMARY: 'GST Summary'
      };
      return labels[type] || type;
    },

    filingStatus: (status: TaxFilingStatus): string => {
      const labels: Record<TaxFilingStatus, string> = {
        PENDING: 'Pending',
        GENERATED: 'Generated',
        DELIVERED: 'Delivered',
        FILED: 'Filed',
        CORRECTED: 'Corrected',
        VOIDED: 'Voided'
      };
      return labels[status] || status;
    },

    jobType: (type: string): string => {
      const labels: Record<string, string> = {
        YEAR_END_GENERATION: 'Year-End Generation',
        THRESHOLD_CHECK: 'Threshold Check',
        RENEWAL_REMINDER: 'Renewal Reminders',
        CORRECTION_BATCH: 'Correction Batch'
      };
      return labels[type] || type;
    },

    percentage: (value: number): string => {
      return `${value.toFixed(1)}%`;
    },

    duration: (startDate?: Date, endDate?: Date): string => {
      if (!startDate || !endDate) return '';
      
      const diff = endDate.getTime() - startDate.getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      }
      return `${seconds}s`;
    }
  };
  ```

#### 5.2 Validation Helpers

- [ ] **Create Validation Utilities**
  ```typescript
  // utils/tax-compliance-validation.ts
  export const validators = {
    taxYear: (year: number): boolean => {
      return year >= 2020 && year <= 2050;
    },

    thresholdAmount: (cents: number): boolean => {
      return cents >= 0 && cents <= 999999999; // Max $9,999,999.99
    },

    creatorId: (id: string): boolean => {
      // CUID validation pattern
      return /^c[a-z0-9]{24}$/.test(id);
    },

    jurisdiction: (code: string): boolean => {
      const validCodes = ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'JP'];
      return validCodes.includes(code.toUpperCase());
    },

    documentCanBeGenerated: (document: TaxDocumentData): boolean => {
      return ['PENDING', 'GENERATED'].includes(document.filingStatus) && 
             !document.voidedAt;
    },

    documentCanBeDownloaded: (document: TaxDocumentData): boolean => {
      return document.pdfStorageKey !== null && 
             !document.voidedAt &&
             document.filingStatus !== 'PENDING';
    }
  };
  ```

---

### Step 6: Testing Setup

#### 6.1 Mock Data & Test Utilities

- [ ] **Create Test Data Factory**
  ```typescript
  // __tests__/factories/tax-compliance-factory.ts
  export const taxDocumentFactory = (overrides?: Partial<TaxDocumentData>): TaxDocumentData => ({
    id: 'doc_' + Math.random().toString(36).substr(2, 9),
    creatorId: 'creator_123',
    taxYear: 2024,
    documentType: 'FORM_1099_NEC',
    filingStatus: 'GENERATED',
    totalAmountCents: 150000, // $1,500
    withholdingCents: 0,
    pdfStorageKey: 'tax-docs/2024/1099-nec-abc123.pdf',
    pdfGeneratedAt: new Date(),
    deliveredAt: null,
    filedAt: null,
    correctionOfId: null,
    voidedAt: null,
    voidReason: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    totalAmountFormatted: '$1,500.00',
    withholdingFormatted: '$0.00',
    isVoided: false,
    isCorrected: false,
    canGeneratePDF: true,
    ...overrides
  });

  export const thresholdStatusFactory = (overrides?: Partial<ThresholdStatus>): ThresholdStatus => ({
    creatorId: 'creator_123',
    taxYear: 2024,
    jurisdiction: 'US',
    currentAmountCents: 45000, // $450
    thresholdAmountCents: 60000, // $600
    remainingCents: 15000, // $150
    percentageReached: 75,
    thresholdMet: false,
    daysUntilYearEnd: 45,
    projectedTotal: 65000, // $650
    currentAmountFormatted: '$450.00',
    remainingFormatted: '$150.00',
    projectedTotalFormatted: '$650.00',
    statusMessage: '75% of threshold reached',
    ...overrides
  });
  ```

#### 6.2 Component Tests

- [ ] **Test Tax Document Components**
  ```typescript
  // __tests__/components/TaxDocumentCard.test.tsx
  describe('TaxDocumentCard', () => {
    it('shows generate button for pending documents', () => {
      const document = taxDocumentFactory({
        filingStatus: 'PENDING',
        pdfStorageKey: null
      });

      render(<TaxDocumentCard document={document} onUpdate={jest.fn()} />);
      
      expect(screen.getByText('Generate PDF')).toBeInTheDocument();
      expect(screen.queryByText('Download')).not.toBeInTheDocument();
    });

    it('shows download button for generated documents', () => {
      const document = taxDocumentFactory({
        filingStatus: 'GENERATED',
        pdfStorageKey: 'tax-docs/2024/doc.pdf'
      });

      render(<TaxDocumentCard document={document} onUpdate={jest.fn()} />);
      
      expect(screen.queryByText('Generate PDF')).not.toBeInTheDocument();
      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    it('handles generation errors gracefully', async () => {
      // Test error handling
    });
  });
  ```

---

### Step 7: Edge Cases & UX Considerations

#### 7.1 Edge Cases to Handle

- [ ] **No Tax Documents State**
  ```typescript
  function EmptyTaxDocumentsState({ taxYear }: { taxYear: number }) {
    return (
      <div className="empty-tax-documents">
        <FileText className="empty-icon" />
        <h3>No Tax Documents</h3>
        <p>
          You don't have any tax documents for {taxYear}. 
          {taxYear === new Date().getFullYear() 
            ? " Documents will be generated automatically when you reach the reporting threshold."
            : " This may be because you didn't meet the minimum threshold that year."
          }
        </p>
        <Button variant="outline" onClick={() => /* navigate to threshold status */}>
          Check Earnings Status
        </Button>
      </div>
    );
  }
  ```

- [ ] **Threshold Not Met State**
- [ ] **Document Generation in Progress State**
- [ ] **PDF Generation Failed State**  
- [ ] **Rate Limited State**

#### 7.2 UX Considerations

- [ ] **Progressive Disclosure:** Show basic info first, detailed breakdown on expand
- [ ] **Status Indicators:** Clear visual indication of document/threshold status
- [ ] **Loading States:** Skeleton loaders during API calls
- [ ] **Error Recovery:** Clear error messages with actionable next steps  
- [ ] **Real-time Updates:** Poll job status, auto-refresh threshold progress
- [ ] **Accessibility:** Screen reader support, keyboard navigation
- [ ] **Mobile Responsive:** Touch-friendly interfaces, readable on small screens

#### 7.3 Performance Optimizations

- [ ] **Query Optimization:**
  ```typescript
  // Prefetch likely-needed data
  const queryClient = useQueryClient();
  
  const prefetchThresholdStatus = (creatorId: string, taxYear: number) => {
    queryClient.prefetchQuery({
      queryKey: ['taxCompliance', 'checkThresholdStatus', { creatorId, taxYear }],
      queryFn: () => trpc.taxCompliance.checkThresholdStatus.query({ creatorId, taxYear }),
      staleTime: 5 * 60 * 1000 // 5 minutes
    });
  };
  ```

- [ ] **Pagination & Virtual Scrolling:** For large document lists
- [ ] **Image Optimization:** Lazy load document previews  
- [ ] **Bundle Splitting:** Code-split admin components from creator components

---

## Final Deployment Checklist

### Pre-Deployment

- [ ] All TypeScript types imported and validated
- [ ] Error handling tested with various error scenarios
- [ ] Rate limiting behavior tested
- [ ] Loading states implemented for all async operations
- [ ] Responsive design tested on mobile devices
- [ ] Accessibility tested with screen readers
- [ ] Cross-browser compatibility verified

### Post-Deployment

- [ ] Monitor error rates in production
- [ ] Verify API rate limits are appropriate
- [ ] Check document generation performance
- [ ] Validate tax calculations in test environment
- [ ] Ensure PDF downloads work correctly
- [ ] Test admin bulk operations with production data volume

### Security Considerations

- [ ] Verify document access is properly restricted by user role
- [ ] Ensure sensitive tax data is not exposed in client-side logs
- [ ] Validate that PDF URLs are properly signed and time-limited
- [ ] Test for unauthorized access to admin functionality
- [ ] Confirm rate limiting prevents abuse

---

**🎉 Implementation Complete!** 

Your frontend should now have full integration with the Tax & Compliance Reports module, supporting both creator and admin workflows with proper error handling, loading states, and user experience considerations.
