# 🌐 Content Optimization Module - Frontend Integration Guide (Part 2)

## 📁 7. File Uploads
**Not Applicable** - Content Optimization module does not handle file uploads. All analysis is performed on text/HTML content passed directly in the request body.

---

## 🔄 8. Real-time Updates

### 8.1 Live Content Analysis

The module supports real-time analysis for content editors:

```typescript
// Real-time analysis hook
function useLiveContentAnalysis(content: string, debounceMs: number = 1000) {
  const [debouncedContent, setDebouncedContent] = useState(content);
  
  // Debounce content changes to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(content);
    }, debounceMs);
    
    return () => clearTimeout(timer);
  }, [content, debounceMs]);

  const { data, isLoading, error } = trpc.contentOptimization.liveContentAnalysis.useQuery(
    { 
      content: debouncedContent,
      analysisType: 'quick' 
    },
    {
      enabled: debouncedContent.length > 100, // Only analyze substantial content
      staleTime: 30000, // Cache results for 30 seconds
      retry: false // Don't retry live analysis to avoid spam
    }
  );

  return {
    analysis: data,
    isAnalyzing: isLoading,
    error
  };
}

// Usage in content editor
function ContentEditor() {
  const [content, setContent] = useState('');
  const { analysis, isAnalyzing } = useLiveContentAnalysis(content);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Editor */}
      <div className="lg:col-span-2">
        <RichTextEditor 
          value={content}
          onChange={setContent}
          placeholder="Start writing your content..."
        />
      </div>

      {/* Live Analysis Sidebar */}
      <div className="space-y-4">
        <LiveAnalysisSidebar 
          analysis={analysis}
          isLoading={isAnalyzing}
        />
      </div>
    </div>
  );
}
```

### 8.2 No WebSocket/SSE Implementation

The Content Optimization module uses polling-based updates rather than real-time push notifications. This is appropriate given the nature of content analysis.

**Polling Recommendations:**
- **Live Analysis:** Debounced queries (1-2 second delay)
- **Bulk Operations:** Check status every 5-10 seconds
- **Report Updates:** Refetch on user action or page focus

---

## 📄 9. Pagination & Filtering

### 9.1 Bulk Analysis Pagination

Bulk operations are limited to prevent timeout and memory issues:

```typescript
// Bulk analysis with pagination
function usePaginatedBulkAnalysis() {
  const [currentBatch, setCurrentBatch] = useState(0);
  const BATCH_SIZE = 25; // Process 25 posts at a time
  
  const bulkAnalyze = async (allPostIds: string[]) => {
    const results: PostAnalysisResult[] = [];
    const batches = chunk(allPostIds, BATCH_SIZE);
    
    for (let i = 0; i < batches.length; i++) {
      setCurrentBatch(i + 1);
      
      try {
        const batchResult = await trpc.contentOptimization.bulkOptimizationAnalysis.mutate({
          postIds: batches[i],
          analysisTypes: ['keyword-density', 'readability', 'heading-structure'],
          includeRecommendations: true
        });
        
        results.push(...batchResult.results);
        
        // Brief pause between batches to prevent rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Batch ${i + 1} failed:`, error);
        // Continue with next batch on error
      }
    }
    
    return results;
  };

  return {
    bulkAnalyze,
    currentBatch,
    totalBatches: (allPostIds: string[]) => Math.ceil(allPostIds.length / BATCH_SIZE)
  };
}
```

### 9.2 Report Filtering

The `generateOptimizationReport` endpoint supports filtering:

```typescript
interface ReportFilters {
  dateRange?: {
    from: Date;
    to: Date;
  };
  categoryId?: string;
  authorId?: string;
  includeUnpublished?: boolean;
}

// Report with dynamic filters
function OptimizationDashboard() {
  const [filters, setFilters] = useState<ReportFilters>({
    includeUnpublished: false
  });

  const { data: report, isLoading } = trpc.contentOptimization.generateOptimizationReport.useQuery(
    filters,
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchOnWindowFocus: false
    }
  );

  const updateDateRange = (from: Date, to: Date) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { from, to }
    }));
  };

  const updateCategory = (categoryId: string | undefined) => {
    setFilters(prev => ({
      ...prev,
      categoryId
    }));
  };

  return (
    <div>
      <ReportFilters 
        filters={filters}
        onUpdateDateRange={updateDateRange}
        onUpdateCategory={updateCategory}
      />
      
      {isLoading ? (
        <ReportSkeleton />
      ) : (
        <ReportContent report={report} />
      )}
    </div>
  );
}
```

### 9.3 No Traditional Pagination

Most Content Optimization endpoints return complete results rather than paginated data:

- **Individual Analysis:** Complete analysis in single response
- **Bulk Operations:** Limited to 50 posts maximum
- **Reports:** Limited to 50 posts, filtered by date/category
- **Configuration:** Single configuration object

---

## ✅ 10. Frontend Implementation Checklist

### 10.1 Setup Tasks

#### Initial Setup
- [ ] Install tRPC client and React Query
- [ ] Configure tRPC client with authentication headers
- [ ] Set up error boundary for content optimization components
- [ ] Create base types file with all Content Optimization interfaces
- [ ] Set up toast notifications for user feedback

#### Authentication & Authorization
- [ ] Verify user has required permissions (ADMIN/CREATOR roles)
- [ ] Implement access control checks in components
- [ ] Handle unauthorized access gracefully
- [ ] Test with different user roles

#### API Client Configuration
```typescript
// lib/trpc-client.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers() {
        return {
          authorization: `Bearer ${getAuthToken()}`,
        };
      },
    }),
  ],
});
```

### 10.2 Core Components

#### Analysis Result Display Components
- [ ] `ContentScoreCard` - Overall optimization score with breakdown
- [ ] `KeywordDensityTable` - Keyword analysis results table
- [ ] `ReadabilityMeter` - Visual readability score display
- [ ] `HeadingStructureTree` - Hierarchical heading outline
- [ ] `ImageValidationList` - Image accessibility issues
- [ ] `ContentLengthIndicator` - Length status and recommendations
- [ ] `InternalLinkingSuggestions` - Link opportunity cards

```typescript
// Example: ContentScoreCard component
interface ContentScoreCardProps {
  result: ContentOptimizationResult;
}

function ContentScoreCard({ result }: ContentScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircleIcon className="h-5 w-5" />;
    if (score >= 60) return <ExclamationTriangleIcon className="h-5 w-5" />;
    return <XCircleIcon className="h-5 w-5" />;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Content Optimization Score</h3>
        <div className={`flex items-center ${getScoreColor(result.overallScore)}`}>
          {getScoreIcon(result.overallScore)}
          <span className="ml-2 text-2xl font-bold">
            {result.overallScore}/100
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <ScoreBreakdown
          label="Readability"
          score={result.readability.score}
          details={result.readability.classification}
        />
        <ScoreBreakdown
          label="Headings"
          score={result.headingStructure.isValid ? 100 : 50}
          details={`${result.headingStructure.headings.length} headings`}
        />
        <ScoreBreakdown
          label="Images"
          score={result.imageValidation.complianceScore}
          details={`${result.imageValidation.validImages}/${result.imageValidation.totalImages} valid`}
        />
        <ScoreBreakdown
          label="Length"
          score={result.contentLength.status === 'optimal' ? 100 : 75}
          details={`${result.contentLength.currentWordCount} words`}
        />
        <ScoreBreakdown
          label="Keywords"
          score={Math.min(100, result.keywordAnalysis.topKeywords.filter(k => k.classification === 'optimal').length * 25)}
          details={`${result.keywordAnalysis.topKeywords.length} analyzed`}
        />
        <ScoreBreakdown
          label="Links"
          score={result.internalLinking.status === 'optimal' ? 100 : 75}
          details={`${result.internalLinking.currentInternalLinks} links`}
        />
      </div>

      <OptimizationSummary summary={result.summary} />
    </div>
  );
}
```

#### Real-time Analysis Components
- [ ] `LiveAnalysisSidebar` - Real-time content feedback
- [ ] `AnalysisProgressIndicator` - Shows analysis in progress
- [ ] `QuickWinsPanel` - Immediate actionable recommendations

#### Bulk Operations Components
- [ ] `BulkAnalysisModal` - Post selection and analysis initiation
- [ ] `AnalysisProgressTracker` - Batch processing status
- [ ] `BulkResultsTable` - Tabular view of multiple analysis results

### 10.3 Utility Functions

#### Analysis Helpers
```typescript
// utils/optimization-helpers.ts

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

export function formatReadabilityGrade(level: number): string {
  if (level <= 6) return 'Elementary';
  if (level <= 9) return 'Middle School';
  if (level <= 12) return 'High School';
  return 'College';
}

export function formatKeywordDensity(density: number): string {
  return `${density.toFixed(1)}%`;
}

export function getContentLengthStatus(analysis: ContentLengthAnalysis): {
  status: string;
  color: string;
  message: string;
} {
  switch (analysis.status) {
    case 'optimal':
      return {
        status: 'Optimal',
        color: 'text-green-600',
        message: 'Content length is perfect for this type'
      };
    case 'too-short':
      return {
        status: 'Too Short',
        color: 'text-red-600',
        message: `Add ${analysis.recommendedRange.min - analysis.currentWordCount} more words`
      };
    case 'too-long':
      return {
        status: 'Too Long',
        color: 'text-yellow-600',
        message: `Consider reducing by ${analysis.currentWordCount - analysis.recommendedRange.max} words`
      };
    default:
      return {
        status: 'Within Range',
        color: 'text-blue-600',
        message: 'Length is acceptable'
      };
  }
}

export function prioritizeRecommendations(result: ContentOptimizationResult): {
  critical: string[];
  important: string[];
  suggested: string[];
} {
  return {
    critical: result.summary.priority_fixes,
    important: result.summary.issues,
    suggested: result.summary.quick_wins
  };
}
```

#### Error Handling Utilities
```typescript
// utils/error-handlers.ts

export function handleOptimizationError(error: TRPCError): {
  title: string;
  message: string;
  action?: string;
} {
  switch (error.data?.code) {
    case 'VALIDATION_ERROR':
      return {
        title: 'Invalid Content',
        message: 'Please check your content and try again.',
        action: 'Review content format'
      };
    
    case 'POST_NOT_FOUND':
      return {
        title: 'Post Not Found',
        message: 'The post you\'re trying to analyze may have been deleted.'
      };
    
    case 'ANALYSIS_FAILED':
      return {
        title: 'Analysis Failed',
        message: 'Unable to complete content analysis. Please try again.',
        action: 'Retry analysis'
      };
    
    case 'TOO_MANY_REQUESTS':
      const retryAfter = error.data?.retryAfter || 3600;
      return {
        title: 'Rate Limit Exceeded',
        message: `Too many requests. Please wait ${Math.ceil(retryAfter / 60)} minutes before trying again.`
      };
    
    default:
      return {
        title: 'Analysis Error',
        message: 'An unexpected error occurred during content analysis.',
        action: 'Contact support if this persists'
      };
  }
}
```

### 10.4 Data Management

#### React Query Setup
- [ ] Configure query client with appropriate defaults
- [ ] Set up query invalidation strategies
- [ ] Implement optimistic updates where appropriate
- [ ] Configure background refetching behavior

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry validation errors or rate limits
        if (error?.data?.code === 'VALIDATION_ERROR' || 
            error?.data?.code === 'TOO_MANY_REQUESTS') {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false, // Don't retry mutations to avoid duplicate processing
    },
  },
});
```

#### Local State Management
```typescript
// stores/optimization-store.ts (using Zustand)
interface OptimizationStore {
  currentAnalysis: ContentOptimizationResult | null;
  isAnalyzing: boolean;
  lastAnalyzedContent: string;
  preferences: {
    autoAnalyze: boolean;
    showAdvancedMetrics: boolean;
    debounceMs: number;
  };
  
  setCurrentAnalysis: (analysis: ContentOptimizationResult | null) => void;
  setAnalyzing: (isAnalyzing: boolean) => void;
  updatePreferences: (preferences: Partial<OptimizationStore['preferences']>) => void;
}

export const useOptimizationStore = create<OptimizationStore>((set) => ({
  currentAnalysis: null,
  isAnalyzing: false,
  lastAnalyzedContent: '',
  preferences: {
    autoAnalyze: true,
    showAdvancedMetrics: false,
    debounceMs: 1000
  },
  
  setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  updatePreferences: (preferences) => 
    set((state) => ({
      preferences: { ...state.preferences, ...preferences }
    }))
}));
```

### 10.5 Testing Requirements

#### Unit Tests
- [ ] Test utility functions with various input scenarios
- [ ] Test component rendering with different analysis results
- [ ] Test error handling with various error types
- [ ] Test rate limiting behavior

#### Integration Tests
- [ ] Test complete analysis workflow
- [ ] Test bulk operation handling
- [ ] Test real-time analysis updates
- [ ] Test error recovery scenarios

#### E2E Tests
- [ ] Test content editor integration
- [ ] Test report generation workflow
- [ ] Test user permission enforcement
- [ ] Test performance with large content

### 10.6 Performance Optimization

#### Code Splitting
```typescript
// Lazy load optimization components
const OptimizationDashboard = lazy(() => import('./OptimizationDashboard'));
const BulkAnalysisModal = lazy(() => import('./BulkAnalysisModal'));

// Usage with suspense
<Suspense fallback={<AnalysisLoading />}>
  <OptimizationDashboard />
</Suspense>
```

#### Memoization
```typescript
// Memoize expensive calculations
const scoreSummary = useMemo(() => {
  if (!analysisResult) return null;
  
  return {
    totalScore: analysisResult.overallScore,
    breakdown: calculateScoreBreakdown(analysisResult),
    recommendations: prioritizeRecommendations(analysisResult)
  };
}, [analysisResult]);

// Memoize component renders
const KeywordTable = memo(({ keywords }: { keywords: KeywordDensityResult[] }) => {
  return (
    <table>
      {keywords.map(keyword => (
        <KeywordRow key={keyword.keyword} keyword={keyword} />
      ))}
    </table>
  );
});
```

#### Debouncing & Throttling
```typescript
// Debounce live analysis
const debouncedAnalyze = useCallback(
  debounce((content: string) => {
    if (content.length > 100) {
      analyzeMutation.mutate({ content, analysisType: 'quick' });
    }
  }, 1000),
  [analyzeMutation]
);

// Throttle UI updates
const throttledUpdateProgress = useCallback(
  throttle((progress: number) => {
    setProgress(progress);
  }, 100),
  []
);
```

---

Continue to [Part 3: Advanced Usage & Edge Cases →](./CONTENT_OPTIMIZATION_FRONTEND_INTEGRATION_GUIDE_PART_3.md)
