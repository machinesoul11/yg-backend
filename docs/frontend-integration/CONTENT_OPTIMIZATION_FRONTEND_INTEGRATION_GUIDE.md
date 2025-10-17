# 🌐 Content Optimization Module - Frontend Integration Guide

## Classification Key
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only  
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 📋 Overview

The Content Optimization module provides comprehensive analysis and recommendations for blog post content. This includes keyword density analysis, heading structure validation, readability scoring, image alt text validation, content length optimization, and internal linking suggestions.

**Module Classification:** 🔒 **ADMIN ONLY**

---

## 🔌 1. API Endpoints

All endpoints are accessed via tRPC at `/api/trpc/contentOptimization.*`

### 1.1 Core Analysis Endpoints

#### `analyzeContent` - Comprehensive Analysis
```typescript
// POST /api/trpc/contentOptimization.analyzeContent
input: {
  content: string;                    // Required: HTML content to analyze
  title?: string;                     // Optional: Post title for analysis context
  contentType?: 'tutorial' | 'guide' | 'news' | 'opinion' | 'review' | 'default';
  targetKeywords?: string[];          // Optional: Keywords to focus analysis on
  excludePostId?: string;             // Optional: Post ID to exclude from internal linking
}
```

#### `analyzeKeywordDensity` - Keyword Focus Analysis
```typescript
// POST /api/trpc/contentOptimization.analyzeKeywordDensity
input: {
  content: string;                    // Required: Content to analyze
  targetKeywords?: string[];          // Optional: Specific keywords to analyze
  includeNGrams?: {                   // Optional: N-gram analysis settings
    twoWord: boolean;                 // Default: true
    threeWord: boolean;               // Default: true
  };
}
```

#### `validateHeadingStructure` - Heading Hierarchy Analysis
```typescript
// POST /api/trpc/contentOptimization.validateHeadingStructure
input: {
  content: string;                    // Required: HTML content
  config?: {
    requireH1: boolean;               // Default: true
    maxSkippedLevels: number;         // Default: 0 (0-2)
    maxDepth: number;                 // Default: 6 (3-6)
  };
}
```

#### `calculateReadability` - Readability Score Analysis
```typescript
// POST /api/trpc/contentOptimization.calculateReadability
input: {
  content: string;                    // Required: Content to analyze
  targetAudience?: 'general' | 'technical' | 'academic' | 'children';
  includeAdvancedMetrics?: boolean;   // Default: false
}
```

#### `validateImageAltText` - Image Accessibility Analysis
```typescript
// POST /api/trpc/contentOptimization.validateImageAltText
input: {
  content: string;                    // Required: HTML content with images
  config?: {
    requireAltText: boolean;          // Default: true
    maxAltTextLength: number;         // Default: 125 (50-200)
    minAltTextLength: number;         // Default: 10 (5-50)
    allowEmptyAltForDecorative: boolean; // Default: true
  };
}
```

#### `analyzeContentLength` - Length Optimization Analysis
```typescript
// POST /api/trpc/contentOptimization.analyzeContentLength
input: {
  content: string;                    // Required: Content to analyze
  contentType?: 'tutorial' | 'guide' | 'news' | 'opinion' | 'review' | 'default';
  customTargets?: {
    min: number;                      // Minimum words (100+)
    max: number;                      // Maximum words (200+)
  };
}
```

#### `analyzeInternalLinking` - Internal Link Analysis
```typescript
// POST /api/trpc/contentOptimization.analyzeInternalLinking
input: {
  content: string;                    // Required: Content to analyze
  excludePostId?: string;             // Optional: Current post ID
  maxSuggestions?: number;            // Default: 5 (1-10)
  minRelevanceScore?: number;         // Default: 30 (0-100)
}
```

### 1.2 Bulk Operations

#### `bulkOptimizationAnalysis` - Multiple Post Analysis
```typescript
// POST /api/trpc/contentOptimization.bulkOptimizationAnalysis
input: {
  postIds: string[];                  // Required: Array of post IDs (1-50)
  analysisTypes: Array<              // Required: Types of analysis to run
    'keyword-density' | 'heading-structure' | 'readability' | 
    'image-validation' | 'content-length' | 'internal-linking'
  >;
  includeRecommendations?: boolean;   // Default: true
}
```

#### `generateOptimizationReport` - Admin Dashboard Report
```typescript
// GET /api/trpc/contentOptimization.generateOptimizationReport
input: {
  dateRange?: {
    from: Date;
    to: Date;
  };
  categoryId?: string;
  authorId?: string;
  includeUnpublished?: boolean;       // Default: false
}
```

### 1.3 Configuration & Real-time

#### `getOptimizationConfig` - Current Settings
```typescript
// GET /api/trpc/contentOptimization.getOptimizationConfig
// No input required - returns current optimization configuration
```

#### `liveContentAnalysis` - Real-time Editor Feedback
```typescript
// POST /api/trpc/contentOptimization.liveContentAnalysis
input: {
  content: string;                    // Required: Current editor content
  analysisType?: 'quick' | 'comprehensive'; // Default: 'quick'
}
```

#### `getPostOptimization` - Existing Post Analysis
```typescript
// GET /api/trpc/contentOptimization.getPostOptimization
input: {
  postId: string;                     // Required: Post ID to analyze
  analysisTypes?: string[];           // Optional: Specific analysis types
}
```

---

## 🏷️ 2. TypeScript Type Definitions

```typescript
// ============================================================================
// Core Analysis Results
// ============================================================================

interface ContentOptimizationResult {
  overallScore: number;               // 0-100 weighted score
  keywordAnalysis: KeywordAnalysis;
  headingStructure: HeadingStructureResult;
  readability: ReadabilityResult;
  imageValidation: ImageValidationResult;
  contentLength: ContentLengthAnalysis;
  internalLinking: InternalLinkingAnalysis;
  summary: OptimizationSummary;
  processingTime: number;             // Analysis time in milliseconds
}

interface OptimizationSummary {
  strengths: string[];                // What's working well
  issues: string[];                   // Problems identified
  priority_fixes: string[];           // Critical improvements needed
  quick_wins: string[];               // Easy improvements with high impact
}

// ============================================================================
// Keyword Analysis
// ============================================================================

interface KeywordAnalysis {
  singleWords: KeywordDensityResult[];
  twoWordPhrases: KeywordDensityResult[];
  threeWordPhrases: KeywordDensityResult[];
  totalWords: number;
  uniqueWords: number;
  averageWordsPerSentence: number;
  topKeywords: KeywordDensityResult[]; // Best performing keywords
}

interface KeywordDensityResult {
  keyword: string;
  frequency: number;                  // Number of occurrences
  density: number;                    // Percentage of total words
  classification: 'optimal' | 'low' | 'high' | 'excessive';
  recommendations: string[];
}

// ============================================================================
// Heading Structure
// ============================================================================

interface HeadingStructureResult {
  isValid: boolean;                   // Overall structure validity
  headings: HeadingInfo[];
  issues: HeadingStructureIssue[];
  outline: OutlineNode[];             // Hierarchical structure
  recommendations: string[];
}

interface HeadingInfo {
  text: string;
  level: number;                      // 1-6 (H1-H6)
  position: number;                   // Character position in content
}

interface HeadingStructureIssue {
  type: 'error' | 'warning' | 'info';
  heading: string;
  level: number;
  position: number;
  message: string;
  suggestion: string;
}

interface OutlineNode {
  text: string;
  level: number;
  children: OutlineNode[];
}

// ============================================================================
// Readability Analysis
// ============================================================================

interface ReadabilityResult {
  metrics: ReadabilityMetrics;
  score: number;                      // 0-100 (higher = more readable)
  gradeLevel: string;                 // "Grade X" equivalent
  interpretation: string;             // Human-readable description
  classification: 'very-easy' | 'easy' | 'fairly-easy' | 'standard' | 
                 'fairly-difficult' | 'difficult' | 'very-difficult';
  recommendations: string[];
}

interface ReadabilityMetrics {
  fleschReadingEase: number;          // 0-100 Flesch score
  fleschKincaidGradeLevel: number;    // Grade level equivalent
  averageWordsPerSentence: number;
  averageSyllablesPerWord: number;
  totalSentences: number;
  totalWords: number;
  totalSyllables: number;
  passiveVoicePercentage: number;
  complexWordsPercentage: number;
}

// ============================================================================
// Image Validation
// ============================================================================

interface ImageValidationResult {
  totalImages: number;
  validImages: number;
  issues: ImageValidationIssue[];
  complianceScore: number;            // 0-100 accessibility score
  recommendations: string[];
}

interface ImageValidationIssue {
  src: string;                        // Image source URL
  issue: 'missing-alt' | 'empty-alt' | 'generic-alt' | 'too-long' | 'too-short' | 'filename-alt';
  currentAlt?: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'info';
}

// ============================================================================
// Content Length Analysis
// ============================================================================

interface ContentLengthAnalysis {
  currentWordCount: number;
  currentCharacterCount: number;
  recommendedRange: { min: number; max: number };
  contentType: string;
  status: 'too-short' | 'optimal' | 'too-long' | 'within-range';
  competitorAnalysis?: {              // Future feature
    averageLength: number;
    topPerformingLength: number;
    rangeUsed: { min: number; max: number };
  };
  recommendations: string[];
}

// ============================================================================
// Internal Linking Analysis
// ============================================================================

interface InternalLinkingAnalysis {
  currentInternalLinks: number;
  recommendedCount: number;
  linkDensity: number;                // Links per 1000 words
  status: 'under-linked' | 'optimal' | 'over-linked';
  suggestions: InternalLinkSuggestion[];
  recommendations: string[];
}

interface InternalLinkSuggestion {
  anchor: string;                     // Suggested anchor text
  targetPost: string;                 // Post title to link to
  relevanceScore: number;             // 0-100 relevance
  context: string;                    // Context where link should be placed
}

// ============================================================================
// Configuration Types
// ============================================================================

interface ContentOptimizationConfig {
  keywordDensity: {
    optimalMin: number;               // Default: 1
    optimalMax: number;               // Default: 3
    warningThreshold: number;         // Default: 5
  };
  headingStructure: {
    requireH1: boolean;               // Default: true
    maxSkippedLevels: number;         // Default: 0
    maxDepth: number;                 // Default: 6
  };
  readability: {
    targetGradeLevel: number;         // Default: 9
    preferredReadingEase: { min: number; max: number }; // Default: 60-70
  };
  contentLength: {
    defaultTargets: {
      tutorial: { min: number; max: number };    // 1500-3000
      guide: { min: number; max: number };       // 2000-4000
      news: { min: number; max: number };        // 300-800
      opinion: { min: number; max: number };     // 600-1200
      review: { min: number; max: number };      // 800-1500
      default: { min: number; max: number };     // 800-2000
    };
  };
  imageValidation: {
    maxAltTextLength: number;         // Default: 125
    minAltTextLength: number;         // Default: 10
    requireAltText: boolean;          // Default: true
  };
}

// ============================================================================
// Bulk Analysis Types
// ============================================================================

interface BulkAnalysisResult {
  results: PostAnalysisResult[];
  summary: {
    totalPosts: number;
    successfulAnalyses: number;
    failedAnalyses: number;
    averageScores: {
      overall: number;
      readability: number;
      imageCompliance: number;
    } | null;
  };
}

interface PostAnalysisResult {
  postId: string;
  title: string;
  slug: string;
  status: string;
  category?: string;
  author: string;
  analysis?: ContentOptimizationResult;
  success: boolean;
  error?: string;
}

// ============================================================================
// Live Analysis Types
// ============================================================================

interface LiveAnalysisResult {
  wordCount: number;
  readabilityScore: number;
  headingStructureValid: boolean;
  imageIssues: number;
  overallScore: number;
  quickRecommendations: string[];     // Top 3 quick wins
}

// ============================================================================
// Report Types
// ============================================================================

interface OptimizationReportResult {
  insights: {
    totalPosts: number;
    averageOverallScore: number;
    averageReadabilityScore: number;
    averageImageCompliance: number;
    commonIssues: CommonIssue[];
    topRecommendations: TopRecommendation[];
  };
  postCount: number;
  analyzedCount: number;
  dateRange?: { from: Date; to: Date };
  filters: {
    categoryId?: string;
    authorId?: string;
    includeUnpublished: boolean;
  };
}

interface CommonIssue {
  issue: string;
  count: number;
  percentage: number;
}

interface TopRecommendation {
  recommendation: string;
  count: number;
  percentage: number;
}
```

---

## ⚖️ 3. Business Logic & Validation Rules

### 3.1 Content Analysis Rules

**Keyword Density Validation:**
- **Optimal Range:** 1-3% of total word count
- **Warning Threshold:** 5% (flagged as excessive)
- **Minimum Frequency:** 2 occurrences to be considered
- **Stop Words:** Filtered out during analysis
- **N-gram Analysis:** Supports 1, 2, and 3-word phrases

**Heading Structure Validation:**
- **H1 Requirement:** Must have exactly one H1 tag (configurable)
- **Hierarchy Rules:** No skipping levels (H1→H3 without H2 is invalid)
- **Maximum Depth:** Up to H6 supported (configurable 3-6)
- **Duplicate Headings:** Flagged as warnings
- **Empty Headings:** Flagged as errors

**Readability Score Calculation:**
- **Flesch Reading Ease:** 0-100 scale (higher = more readable)
- **Grade Level:** Based on Flesch-Kincaid formula
- **Target Audience:** General (Grade 8-9), Technical (Grade 10-12)
- **Sentence Length:** Average words per sentence tracked
- **Syllable Complexity:** Average syllables per word calculated

**Image Validation Rules:**
- **Alt Text Required:** All content images must have alt attributes
- **Length Limits:** 10-125 characters for alt text
- **Generic Detection:** Flags generic alt text like "image", "photo"
- **Filename Detection:** Flags alt text that matches filename
- **Decorative Exception:** Empty alt="" allowed for decorative images

### 3.2 Content Length Guidelines

**Type-Specific Targets:**
```typescript
const contentLengthTargets = {
  tutorial: { min: 1500, max: 3000 },    // How-to guides
  guide: { min: 2000, max: 4000 },       // Comprehensive guides
  news: { min: 300, max: 800 },          // News articles
  opinion: { min: 600, max: 1200 },      // Opinion pieces
  review: { min: 800, max: 1500 },       // Product reviews
  default: { min: 800, max: 2000 }       // General content
};
```

### 3.3 Internal Linking Rules

**Density Calculation:**
- **Optimal Ratio:** 1-2 internal links per 300 words
- **Link Density:** Calculated as links per 1000 words
- **Relevance Scoring:** Based on content similarity and keywords
- **Exclusion Rules:** Excludes self-references and external links

### 3.4 Overall Scoring Weights

```typescript
const scoringWeights = {
  readability: 25,        // 25% - Reading ease and grade level
  headingStructure: 20,   // 20% - Proper HTML structure
  contentLength: 15,      // 15% - Appropriate length for type
  keywordDensity: 15,     // 15% - Optimal keyword usage
  imageValidation: 15,    // 15% - Accessibility compliance
  internalLinking: 10     // 10% - Link density and quality
};
```

---

## 🚨 4. Error Handling

### 4.1 HTTP Status Codes

| Status Code | Description | When It Occurs |
|-------------|-------------|----------------|
| `200` | Success | Analysis completed successfully |
| `400` | Bad Request | Invalid input data or missing required fields |
| `401` | Unauthorized | User not authenticated |
| `403` | Forbidden | User lacks required permissions (Admin only) |
| `404` | Not Found | Post ID not found (for existing post analysis) |
| `422` | Unprocessable Entity | Content validation failed |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Analysis service failure |

### 4.2 Error Response Format

```typescript
interface OptimizationError {
  message: string;
  code: string;
  details?: {
    field?: string;
    value?: any;
    constraint?: string;
  };
}

// Example error responses
{
  "message": "Content is required and cannot be empty",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "content",
    "constraint": "min_length_1"
  }
}

{
  "message": "Post not found or access denied",
  "code": "POST_NOT_FOUND",
  "details": {
    "postId": "cm123456789"
  }
}

{
  "message": "Content analysis failed due to parsing error",
  "code": "ANALYSIS_FAILED",
  "details": {
    "stage": "heading_validation"
  }
}
```

### 4.3 Client-Side Error Handling

```typescript
// Error handling with tRPC
const analyzeMutation = trpc.contentOptimization.analyzeContent.useMutation({
  onError: (error) => {
    switch (error.data?.code) {
      case 'VALIDATION_ERROR':
        toast.error(`Validation failed: ${error.message}`);
        break;
      case 'POST_NOT_FOUND':
        toast.error('Post not found. It may have been deleted.');
        break;
      case 'ANALYSIS_FAILED':
        toast.error('Analysis failed. Please try again.');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        const retryAfter = error.data?.retryAfter || 60;
        toast.error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
        break;
      default:
        toast.error('An unexpected error occurred.');
    }
  }
});

// Retry logic for transient errors
const analyzeWithRetry = async (content: string, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await analyzeMutation.mutateAsync({ content });
    } catch (error) {
      if (attempt === retries || error.data?.code === 'VALIDATION_ERROR') {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

---

## 🔐 5. Authorization & Permissions

### 5.1 Access Control

**Module Classification:** 🔒 **ADMIN ONLY**

All Content Optimization endpoints require:
- Valid authentication session
- User role of `ADMIN`, `CREATOR`, or authorized content manager
- Access to blog management functionality

```typescript
// tRPC procedure protection
export const contentOptimizationRouter = createTRPCRouter({
  analyzeContent: protectedProcedure  // Requires authentication
    .input(analyzeContentSchema)
    .mutation(async ({ ctx, input }) => {
      // Additional role checks can be added here if needed
      // Currently accessible to all authenticated users
    }),
});
```

### 5.2 Permission Matrix

| Endpoint | ADMIN | CREATOR | BRAND | PUBLIC |
|----------|-------|---------|-------|--------|
| `analyzeContent` | ✅ | ✅ | ❌ | ❌ |
| `bulkOptimizationAnalysis` | ✅ | ✅ | ❌ | ❌ |
| `generateOptimizationReport` | ✅ | ✅ | ❌ | ❌ |
| `getOptimizationConfig` | ✅ | ✅ | ❌ | ❌ |
| `liveContentAnalysis` | ✅ | ✅ | ❌ | ❌ |

### 5.3 Resource Ownership Rules

- **Post Analysis:** Users can analyze any published content
- **Bulk Operations:** Limited to posts the user has access to
- **Configuration Access:** Read-only for most users, write access for admins
- **Report Generation:** Respects post visibility and user permissions

---

## ⏱️ 6. Rate Limiting & Quotas

### 6.1 Rate Limits per Endpoint

| Endpoint Category | Limit | Window | Burst Limit |
|------------------|-------|--------|-------------|
| Individual Analysis | 50 requests | 1 hour | 10/minute |
| Live Analysis | 100 requests | 1 hour | 20/minute |
| Bulk Operations | 5 requests | 1 hour | 2/minute |
| Report Generation | 10 requests | 1 hour | 3/minute |
| Configuration Access | 30 requests | 1 hour | 10/minute |

### 6.2 Rate Limit Implementation

Content Optimization uses the same Redis-based rate limiting as other modules:

```typescript
// Rate limiting is handled at the tRPC middleware level
// Individual endpoints may have additional throttling for resource-intensive operations

// Example: Bulk operations are limited to prevent server overload
if (input.postIds.length > 50) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Maximum 50 posts allowed per bulk analysis request'
  });
}
```

### 6.3 Rate Limit Headers

Rate limit information is not exposed in headers for tRPC endpoints, but errors include retry information:

```typescript
// Rate limit exceeded error
{
  "code": "TOO_MANY_REQUESTS",
  "message": "Rate limit exceeded for content analysis",
  "data": {
    "retryAfter": 3600,  // Seconds until reset
    "limit": 50,         // Requests per window
    "window": 3600       // Window duration in seconds
  }
}
```

### 6.4 Frontend Rate Limit Handling

```typescript
function useRateLimitedAnalysis() {
  const [isLimited, setIsLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const analyzeMutation = trpc.contentOptimization.analyzeContent.useMutation({
    onError: (error) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        const retrySeconds = error.data.retryAfter || 3600;
        setIsLimited(true);
        setRetryAfter(retrySeconds);
        
        // Auto-reset when limit expires
        setTimeout(() => {
          setIsLimited(false);
          setRetryAfter(null);
        }, retrySeconds * 1000);
      }
    }
  });

  return {
    analyze: analyzeMutation.mutate,
    isLoading: analyzeMutation.isLoading,
    isLimited,
    retryAfter,
    error: analyzeMutation.error
  };
}

// Usage in component
function ContentAnalyzer() {
  const { analyze, isLimited, retryAfter } = useRateLimitedAnalysis();

  if (isLimited) {
    return (
      <div className="text-amber-600">
        Rate limit exceeded. Try again in {Math.ceil((retryAfter || 0) / 60)} minutes.
      </div>
    );
  }

  return (
    <button onClick={() => analyze({ content: editorContent })}>
      Analyze Content
    </button>
  );
}
```

---

Continue to [Part 2: Implementation & UI Examples →](./CONTENT_OPTIMIZATION_FRONTEND_INTEGRATION_GUIDE_PART_2.md)
