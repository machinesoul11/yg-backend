# 🌐 Content Optimization Module - Frontend Integration Guide (Part 3)

## 🎯 11. Edge Cases & Advanced Usage

### 11.1 Content Edge Cases

#### Empty or Minimal Content
```typescript
function ContentAnalyzer() {
  const [content, setContent] = useState('');
  
  const { data: analysis, error } = trpc.contentOptimization.analyzeContent.useQuery(
    { content },
    {
      enabled: content.length > 100, // Only analyze substantial content
      retry: false
    }
  );

  // Handle minimal content scenario
  if (content.length > 0 && content.length <= 100) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-4">
        <p className="text-amber-800">
          Content too short for analysis. Write at least 100 characters.
        </p>
        <p className="text-sm text-amber-600 mt-1">
          Current: {content.length} characters
        </p>
      </div>
    );
  }

  return (
    <div>
      {analysis ? (
        <AnalysisResults results={analysis} />
      ) : (
        <EmptyState message="Start writing to see content analysis..." />
      )}
    </div>
  );
}
```

#### Malformed HTML Content
```typescript
function SafeContentAnalyzer() {
  const analyzeMutation = trpc.contentOptimization.analyzeContent.useMutation({
    onError: (error) => {
      if (error.message.includes('parsing')) {
        toast.error('Content contains invalid HTML. Please check your formatting.');
      }
    }
  });

  const handleAnalyze = async (content: string) => {
    try {
      // Basic HTML validation before sending
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      
      // Check for unclosed tags or other obvious issues
      if (content.includes('<') && !isValidHTML(content)) {
        toast.warning('HTML formatting issues detected. Analysis may be incomplete.');
      }

      await analyzeMutation.mutateAsync({ content });
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  };

  return (
    <button onClick={() => handleAnalyze(editorContent)}>
      Analyze Content
    </button>
  );
}

function isValidHTML(content: string): boolean {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    return !doc.querySelector('parsererror');
  } catch {
    return false;
  }
}
```

#### Very Large Content
```typescript
function LargeContentHandler() {
  const MAX_CONTENT_SIZE = 50000; // 50KB limit
  
  const handleLargeContent = (content: string) => {
    if (content.length > MAX_CONTENT_SIZE) {
      toast.warning(
        `Content is very large (${Math.round(content.length / 1000)}KB). Analysis may take longer.`
      );
      
      // Optional: Truncate for live analysis but keep full content for comprehensive analysis
      const truncatedContent = content.substring(0, MAX_CONTENT_SIZE);
      return { content: truncatedContent, wasTruncated: true };
    }
    
    return { content, wasTruncated: false };
  };

  return { handleLargeContent };
}
```

### 11.2 Analysis Failure Recovery

#### Partial Analysis Results
```typescript
interface PartialAnalysisHandler {
  analysis: Partial<ContentOptimizationResult>;
  failedComponents: string[];
}

function PartialAnalysisDisplay({ analysis, failedComponents }: PartialAnalysisHandler) {
  return (
    <div className="space-y-4">
      {/* Show available results */}
      {analysis.readability && (
        <ReadabilityCard readability={analysis.readability} />
      )}
      
      {analysis.keywordAnalysis && (
        <KeywordAnalysisCard keywords={analysis.keywordAnalysis} />
      )}
      
      {/* Show failed components */}
      {failedComponents.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <h4 className="font-medium text-yellow-800">Partial Analysis</h4>
          <p className="text-sm text-yellow-700 mt-1">
            Some analysis components failed: {failedComponents.join(', ')}
          </p>
          <button className="btn-secondary mt-2" onClick={() => retryAnalysis()}>
            Retry Failed Components
          </button>
        </div>
      )}
    </div>
  );
}
```

#### Analysis Timeout Handling
```typescript
function useAnalysisWithTimeout(timeoutMs: number = 30000) {
  const [isTimeout, setIsTimeout] = useState(false);
  
  const analyzeMutation = trpc.contentOptimization.analyzeContent.useMutation({
    onSuccess: () => setIsTimeout(false),
    onError: (error) => {
      if (error.message.includes('timeout')) {
        setIsTimeout(true);
      }
    }
  });

  const analyzeWithTimeout = async (input: any) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Analysis timeout')), timeoutMs);
    });

    try {
      await Promise.race([
        analyzeMutation.mutateAsync(input),
        timeoutPromise
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Analysis timeout') {
        setIsTimeout(true);
        toast.error('Analysis is taking too long. Try with shorter content.');
      }
      throw error;
    }
  };

  return {
    analyze: analyzeWithTimeout,
    isTimeout,
    ...analyzeMutation
  };
}
```

### 11.3 Performance Optimization

#### Progressive Analysis Loading
```typescript
function ProgressiveAnalysis({ content }: { content: string }) {
  const [loadedComponents, setLoadedComponents] = useState<Set<string>>(new Set());
  
  // Load analysis components progressively
  const { data: quickAnalysis } = trpc.contentOptimization.liveContentAnalysis.useQuery(
    { content, analysisType: 'quick' },
    { enabled: content.length > 100 }
  );
  
  const { data: fullAnalysis } = trpc.contentOptimization.analyzeContent.useQuery(
    { content },
    { 
      enabled: content.length > 500 && !quickAnalysis?.isAnalyzing,
      staleTime: 5 * 60 * 1000 // Cache for 5 minutes
    }
  );

  useEffect(() => {
    if (quickAnalysis) {
      setLoadedComponents(prev => new Set([...prev, 'quick']));
    }
    if (fullAnalysis) {
      setLoadedComponents(prev => new Set([...prev, 'full']));
    }
  }, [quickAnalysis, fullAnalysis]);

  return (
    <div className="space-y-4">
      {/* Quick analysis results load first */}
      {loadedComponents.has('quick') && (
        <QuickAnalysisCard analysis={quickAnalysis} />
      )}
      
      {/* Full analysis loads after */}
      {loadedComponents.has('full') ? (
        <FullAnalysisResults analysis={fullAnalysis} />
      ) : (
        <AnalysisPlaceholder message="Loading detailed analysis..." />
      )}
    </div>
  );
}
```

#### Cached Analysis Results
```typescript
function useCachedAnalysis(content: string) {
  const contentHash = useMemo(() => {
    // Simple hash function for content
    return btoa(content).slice(0, 16);
  }, [content]);

  const { data: analysis } = trpc.contentOptimization.analyzeContent.useQuery(
    { content },
    {
      enabled: content.length > 100,
      staleTime: 10 * 60 * 1000, // 10 minutes cache
      cacheTime: 30 * 60 * 1000, // 30 minutes in memory
      queryKey: ['contentOptimization.analyzeContent', contentHash], // Include hash in key
    }
  );

  return analysis;
}
```

### 11.4 User Experience Optimizations

#### Smart Recommendations Prioritization
```typescript
function SmartRecommendations({ analysis }: { analysis: ContentOptimizationResult }) {
  const prioritizedRecommendations = useMemo(() => {
    const recommendations = [];
    
    // Critical issues first (score impact > 10 points)
    if (analysis.readability.score < 50) {
      recommendations.push({
        type: 'critical',
        title: 'Improve Readability',
        impact: 'High',
        effort: 'Medium',
        description: 'Simplify sentences and use common words',
        actions: analysis.readability.recommendations
      });
    }
    
    // Missing H1 is critical for SEO
    if (!analysis.headingStructure.headings.some(h => h.level === 1)) {
      recommendations.push({
        type: 'critical',
        title: 'Add H1 Heading',
        impact: 'High',
        effort: 'Low',
        description: 'Every post needs exactly one H1 heading',
        actions: ['Add a main heading that summarizes your content']
      });
    }
    
    // Quick wins (low effort, good impact)
    if (analysis.imageValidation.issues.length > 0) {
      recommendations.push({
        type: 'quick-win',
        title: 'Fix Image Alt Text',
        impact: 'Medium',
        effort: 'Low',
        description: 'Improve accessibility and SEO',
        actions: analysis.imageValidation.issues.slice(0, 3).map(issue => issue.suggestion)
      });
    }
    
    return recommendations.sort((a, b) => {
      const priority = { 'critical': 3, 'important': 2, 'quick-win': 1 };
      return (priority[b.type] || 0) - (priority[a.type] || 0);
    });
  }, [analysis]);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Recommended Actions</h3>
      {prioritizedRecommendations.map((rec, index) => (
        <RecommendationCard key={index} recommendation={rec} />
      ))}
    </div>
  );
}
```

#### Contextual Help & Tooltips
```typescript
function AnalysisWithHelp({ analysis }: { analysis: ContentOptimizationResult }) {
  return (
    <div className="space-y-6">
      {/* Readability with contextual help */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-medium">Readability Score</span>
          <Tooltip content="Based on Flesch Reading Ease. Higher scores are easier to read.">
            <QuestionMarkCircleIcon className="h-4 w-4 text-gray-400" />
          </Tooltip>
        </div>
        <ReadabilityBadge score={analysis.readability.score} />
      </div>

      {/* Keyword density with guidance */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className="font-medium">Keyword Density</span>
          <Tooltip content="Optimal keyword density is 1-3%. Higher densities may be seen as spam.">
            <QuestionMarkCircleIcon className="h-4 w-4 text-gray-400" />
          </Tooltip>
        </div>
        <KeywordDensityChart keywords={analysis.keywordAnalysis.topKeywords} />
      </div>

      {/* Content length with benchmarks */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className="font-medium">Content Length</span>
          <Tooltip content={`Recommended length for ${analysis.contentLength.contentType} content: ${analysis.contentLength.recommendedRange.min}-${analysis.contentLength.recommendedRange.max} words`}>
            <QuestionMarkCircleIcon className="h-4 w-4 text-gray-400" />
          </Tooltip>
        </div>
        <ContentLengthIndicator analysis={analysis.contentLength} />
      </div>
    </div>
  );
}
```

### 11.5 Advanced Integration Patterns

#### Content Editor Integration
```typescript
// Integration with rich text editor (TinyMCE, Quill, etc.)
function ContentEditorWithAnalysis() {
  const [content, setContent] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const editorRef = useRef<any>(null);

  const { analysis, isAnalyzing } = useLiveContentAnalysis(content, 2000);

  // Highlight issues directly in editor
  const highlightIssues = useCallback((analysis: ContentOptimizationResult) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    
    // Clear previous highlights
    editor.dom.removeClass(editor.dom.select('*'), 'content-issue');
    
    // Highlight heading structure issues
    analysis.headingStructure.issues.forEach(issue => {
      const heading = editor.dom.select(`h${issue.level}`).find(h => 
        h.textContent?.includes(issue.heading)
      );
      if (heading) {
        editor.dom.addClass(heading, 'heading-issue');
      }
    });
    
    // Highlight images with alt text issues
    analysis.imageValidation.issues.forEach(issue => {
      const img = editor.dom.select(`img[src="${issue.src}"]`)[0];
      if (img) {
        editor.dom.addClass(img, 'image-issue');
      }
    });
  }, []);

  useEffect(() => {
    if (analysis) {
      highlightIssues(analysis);
    }
  }, [analysis, highlightIssues]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      {/* Editor takes most space */}
      <div className={`${showAnalysis ? 'xl:col-span-3' : 'xl:col-span-4'}`}>
        <TinyMCEEditor
          ref={editorRef}
          value={content}
          onEditorChange={setContent}
          init={{
            plugins: 'link image code',
            toolbar: 'undo redo | bold italic | link image | code | analysis',
            setup: (editor) => {
              editor.ui.registry.addButton('analysis', {
                text: 'Analysis',
                onAction: () => setShowAnalysis(!showAnalysis)
              });
            }
          }}
        />
      </div>

      {/* Collapsible analysis panel */}
      {showAnalysis && (
        <div className="xl:col-span-1">
          <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} />
        </div>
      )}
    </div>
  );
}
```

#### Bulk Operations Dashboard
```typescript
function BulkOptimizationDashboard() {
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BulkAnalysisResult | null>(null);

  const { data: posts } = trpc.blog.posts.list.useQuery({
    filters: { status: 'PUBLISHED' },
    page: 1,
    limit: 100
  });

  const bulkAnalyzeMutation = trpc.contentOptimization.bulkOptimizationAnalysis.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setIsProcessing(false);
    },
    onError: (error) => {
      toast.error('Bulk analysis failed');
      setIsProcessing(false);
    }
  });

  const handleBulkAnalysis = async () => {
    if (selectedPosts.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      // Process in batches of 25
      const batches = chunk(selectedPosts, 25);
      const allResults: PostAnalysisResult[] = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batchResult = await bulkAnalyzeMutation.mutateAsync({
          postIds: batches[i],
          analysisTypes: ['readability', 'heading-structure', 'keyword-density'],
          includeRecommendations: true
        });
        
        allResults.push(...batchResult.results);
        
        // Update progress
        toast.info(`Processed batch ${i + 1}/${batches.length}`);
        
        // Brief pause between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      setResults({
        results: allResults,
        summary: calculateSummaryStats(allResults)
      });
      
    } catch (error) {
      toast.error('Bulk analysis failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bulk Content Analysis</h2>
        <button
          onClick={handleBulkAnalysis}
          disabled={selectedPosts.length === 0 || isProcessing}
          className="btn-primary"
        >
          {isProcessing ? 'Processing...' : `Analyze ${selectedPosts.length} Posts`}
        </button>
      </div>

      {/* Post selection */}
      <PostSelectionTable
        posts={posts?.posts || []}
        selectedPosts={selectedPosts}
        onSelectionChange={setSelectedPosts}
      />

      {/* Processing indicator */}
      {isProcessing && (
        <BulkProcessingIndicator />
      )}

      {/* Results */}
      {results && (
        <BulkAnalysisResults results={results} />
      )}
    </div>
  );
}
```

### 11.6 Testing Scenarios

#### Unit Test Examples
```typescript
// utils/optimization-helpers.test.ts
describe('Optimization Helpers', () => {
  describe('getScoreColor', () => {
    it('returns green for high scores', () => {
      expect(getScoreColor(85)).toBe('text-green-600');
      expect(getScoreColor(95)).toBe('text-green-600');
    });

    it('returns yellow for medium scores', () => {
      expect(getScoreColor(65)).toBe('text-yellow-600');
      expect(getScoreColor(75)).toBe('text-yellow-600');
    });

    it('returns red for low scores', () => {
      expect(getScoreColor(45)).toBe('text-red-600');
      expect(getScoreColor(25)).toBe('text-red-600');
    });
  });

  describe('prioritizeRecommendations', () => {
    it('correctly categorizes recommendations', () => {
      const mockResult: ContentOptimizationResult = {
        overallScore: 75,
        summary: {
          priority_fixes: ['Fix heading structure'],
          issues: ['Improve readability'],
          quick_wins: ['Add alt text to images'],
          strengths: ['Good keyword density']
        },
        // ... other properties
      };

      const result = prioritizeRecommendations(mockResult);
      
      expect(result.critical).toEqual(['Fix heading structure']);
      expect(result.important).toEqual(['Improve readability']);
      expect(result.suggested).toEqual(['Add alt text to images']);
    });
  });
});
```

#### Integration Test Examples
```typescript
// components/ContentAnalyzer.test.tsx
describe('ContentAnalyzer', () => {
  it('shows loading state during analysis', async () => {
    const mockAnalyze = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 1000))
    );
    
    render(
      <TRPCProvider>
        <ContentAnalyzer content="Test content for analysis" />
      </TRPCProvider>
    );

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it('displays analysis results correctly', async () => {
    const mockResult: ContentOptimizationResult = {
      overallScore: 85,
      readability: {
        score: 75,
        classification: 'fairly-easy',
        // ... other properties
      },
      // ... other analysis components
    };

    render(
      <TRPCProvider mockData={{ analyzeContent: mockResult }}>
        <ContentAnalyzer content="Test content" />
      </TRPCProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('85/100')).toBeInTheDocument();
      expect(screen.getByText(/fairly-easy/i)).toBeInTheDocument();
    });
  });

  it('handles analysis errors gracefully', async () => {
    const mockError = new TRPCError({
      code: 'VALIDATION_ERROR',
      message: 'Content is required'
    });

    render(
      <TRPCProvider mockError={mockError}>
        <ContentAnalyzer content="" />
      </TRPCProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/invalid content/i)).toBeInTheDocument();
    });
  });
});
```

---

## 📚 12. Additional Resources

### 12.1 Related Documentation
- [Blog System Implementation Guide](../BLOG_SYSTEM_IMPLEMENTATION_COMPLETE.md)
- [SEO Optimization Guide](../SEO_OPTIMIZATION_IMPLEMENTATION_COMPLETE.md)  
- [Content Operations Guide](../CONTENT_OPERATIONS_IMPLEMENTATION_COMPLETE.md)

### 12.2 External Resources
- [Flesch Reading Ease Documentation](https://en.wikipedia.org/wiki/Flesch_reading_ease)
- [WCAG Image Alt Text Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html)
- [SEO Content Length Best Practices](https://moz.com/learn/seo/page-title)

### 12.3 Implementation Examples
- See `/src/modules/blog/services/__tests__/` for backend test examples
- Reference existing optimization components in admin dashboard
- Check tRPC router implementation for API patterns

### 12.4 Performance Benchmarks
- **Individual Analysis:** ~100-300ms response time
- **Bulk Analysis (25 posts):** ~5-15 seconds
- **Live Analysis:** ~50-100ms (quick mode)
- **Memory Usage:** <50MB for typical content

---

## 🔄 13. Migration Notes

### 13.1 From Manual Content Review
If migrating from manual content review processes:

1. **Start with Quick Analysis** - Use `liveContentAnalysis` for immediate feedback
2. **Gradual Rollout** - Implement analysis incrementally across content types
3. **Training Period** - Allow content creators to learn optimization principles
4. **Baseline Establishment** - Run `generateOptimizationReport` to establish current content quality

### 13.2 Integration with Existing Workflows

```typescript
// Gradual integration approach
function EnhancedContentEditor() {
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [content, setContent] = useState('');

  // Feature flag for analysis
  const { data: featureFlags } = trpc.admin.getFeatureFlags.useQuery();
  const showAnalysis = featureFlags?.contentOptimization && analysisEnabled;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>Content Editor</h2>
        {featureFlags?.contentOptimization && (
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={analysisEnabled}
              onChange={(e) => setAnalysisEnabled(e.target.checked)}
            />
            <span className="ml-2">Enable Content Analysis</span>
          </label>
        )}
      </div>

      <ContentEditor value={content} onChange={setContent} />

      {showAnalysis && (
        <ContentAnalysisPanel content={content} />
      )}
    </div>
  );
}
```

---

This completes the comprehensive Frontend Integration Guide for the Content Optimization module. The guide covers all API endpoints, data structures, error handling, implementation patterns, and advanced usage scenarios that frontend developers will need to successfully integrate this powerful content analysis system.
