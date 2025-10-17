# Content Operations Module - Frontend Integration Guide

**Module:** Content Operations  
**Classification:** 🔒 ADMIN ONLY (Blog post creation and management)  
**Backend Deployment:** https://ops.yesgoddess.agency  
**Last Updated:** October 16, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Content Operations module provides comprehensive content creation and validation tools for the YesGoddess blog system. It includes rich text validation, SEO optimization, automatic excerpt generation, read time calculation, slug conflict resolution, and internal link suggestions.

### Key Features
- ✅ Rich text editor content validation with HTML sanitization
- ✅ Comprehensive SEO analysis and scoring  
- ✅ Multiple excerpt generation strategies
- ✅ Enhanced read time calculation
- ✅ Intelligent slug conflict resolution
- ✅ Automatic internal link suggestions

---

## API Endpoints

All endpoints use **tRPC** with the following base structure:

```typescript
// Base URL
POST https://ops.yesgoddess.agency/api/trpc/blog.contentOperations.<procedureName>

// Authentication Header Required
Authorization: Bearer <JWT_TOKEN>
```

### Core Endpoints

| Endpoint | Method | Access Level | Purpose |
|----------|--------|--------------|---------|
| `validateContent` | Mutation | 🔒 Protected | Rich text content validation |
| `validateSEO` | Mutation | 🔒 Protected | SEO analysis and scoring |
| `generateExcerpt` | Mutation | 🔒 Protected | Single excerpt generation |
| `generateExcerptOptions` | Mutation | 🔒 Protected | Multiple excerpt options |
| `generateLinkSuggestions` | Mutation | 🔒 Protected | Internal link suggestions |
| `generateBulkLinkSuggestions` | Mutation | 🔒 Protected | Bulk link suggestions |
| `generateSlug` | Mutation | 🔒 Protected | Enhanced slug generation |
| `calculateReadTime` | Query | 🔒 Protected | Read time calculation |
| `analyzeContent` | Mutation | 🔒 Protected | Comprehensive content analysis |
| `validateBeforeSave` | Mutation | 🔒 Protected | Pre-save validation |

---

## TypeScript Type Definitions

```typescript
// ============================================================================
// Content Validation Types
// ============================================================================

interface ContentValidationConfig {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  maxLength: number;
  minLength: number;
  requireHeadings: boolean;
  maxImageCount: number;
  validateLinks: boolean;
}

interface ContentValidationResult {
  isValid: boolean;
  sanitizedContent: string;
  errors: ContentValidationError[];
  warnings: ContentValidationWarning[];
  recommendations: ContentValidationRecommendation[];
}

interface ContentValidationError {
  type: 'SECURITY' | 'STRUCTURE' | 'CONTENT' | 'LENGTH';
  message: string;
  location?: string;
  severity: 'error' | 'warning' | 'info';
}

interface ContentValidationWarning extends ContentValidationError {
  severity: 'warning';
}

interface ContentValidationRecommendation extends ContentValidationError {
  severity: 'info';
}

// ============================================================================
// SEO Validation Types
// ============================================================================

interface SEOValidationResult {
  score: number; // 0-100
  isValid: boolean;
  errors: SEOValidationError[];
  warnings: SEOValidationError[];
  recommendations: SEOValidationRecommendation[];
}

interface SEOValidationError {
  type: 'TITLE' | 'DESCRIPTION' | 'KEYWORDS' | 'CONTENT' | 'STRUCTURE';
  message: string;
  severity: 'error' | 'warning' | 'info';
  currentValue?: string;
  suggestedValue?: string;
}

interface SEOContent {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  featuredImageUrl?: string;
  tags?: string[];
}

// ============================================================================
// Excerpt Generation Types
// ============================================================================

interface ExcerptGenerationResult {
  excerpt: string;
  confidence: number; // 0-100
  strategy: 'first-paragraph' | 'content-summary' | 'keyword-focused' | 'auto-best';
  wordCount: number;
  recommendations: ExcerptRecommendation[];
}

interface ExcerptGenerationOptions {
  maxLength?: number; // Default: 160
  strategy?: 'first-paragraph' | 'content-summary' | 'keyword-focused' | 'auto-best';
  targetKeywords?: string[];
  preserveSentences?: boolean;
  includeKeywords?: boolean;
  minLength?: number;
}

interface ExcerptRecommendation {
  type: 'LENGTH' | 'KEYWORDS' | 'READABILITY';
  message: string;
  severity: 'info' | 'warning';
}

// ============================================================================
// Internal Link Suggestions Types
// ============================================================================

interface InternalLinkSuggestion {
  url: string;
  title: string;
  excerpt: string;
  relevanceScore: number; // 0-100
  suggestedAnchorText: string;
  position: {
    paragraph: number;
    sentence: number;
  };
  reason: string;
}

interface InternalLinkSuggestionsResult {
  suggestions: InternalLinkSuggestion[];
  totalFound: number;
  processingTime: number;
  recommendations: LinkRecommendation[];
}

interface LinkSuggestionsOptions {
  maxSuggestions?: number; // Default: 10, Max: 20
  minRelevanceScore?: number; // Default: 60, Min: 0, Max: 100
  excludeUrls?: string[];
  preferRecent?: boolean;
  includeCategories?: boolean;
}

interface LinkRecommendation {
  type: 'DENSITY' | 'RELEVANCE' | 'DISTRIBUTION';
  message: string;
  severity: 'info' | 'warning';
}

// ============================================================================
// Slug Generation Types
// ============================================================================

interface SlugGenerationResult {
  slug: string;
  isUnique: boolean;
  conflicts: string[];
  suggestions: string[];
  conflictCount: number;
}

interface SlugGenerationOptions {
  title: string;
  excludeId?: string;
  maxLength?: number; // Default: 150, Min: 10, Max: 150
}

// ============================================================================
// Read Time Calculation Types
// ============================================================================

interface ReadTimeResult {
  readTimeMinutes: number;
  wordCount: number;
  characterCount: number;
}

interface ReadTimeOptions {
  content: string;
  wordsPerMinute?: number; // Default: 250, Min: 50, Max: 1000
}

// ============================================================================
// Comprehensive Analysis Types
// ============================================================================

interface ContentAnalysisResult {
  contentValidation: ContentValidationResult;
  seoValidation: SEOValidationResult;
  excerptGeneration: ExcerptGenerationResult;
  linkSuggestions: InternalLinkSuggestionsResult;
  readTimeData: ReadTimeResult;
  overallScore: number; // 0-100
  recommendations: AnalysisRecommendation[];
}

interface AnalysisRecommendation {
  type: 'CONTENT' | 'SEO' | 'STRUCTURE' | 'LINKS';
  message: string;
  severity: 'error' | 'warning' | 'info';
  priority: number; // 1-10, 10 being highest
}

// ============================================================================
// API Response Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================================================
// Validation Before Save Types
// ============================================================================

interface BeforeSaveValidationResult {
  isValid: boolean;
  contentValidation: ContentValidationResult;
  seoValidation: SEOValidationResult;
  warnings: ContentValidationError[];
  errors: ContentValidationError[];
  canSave: boolean;
  sanitizedContent?: string;
}

interface BeforeSaveValidationRequest {
  title: string;
  content: string;
  slug?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  requireValidation?: boolean; // Default: true
}
```

---

## Request/Response Examples

### Content Validation

```typescript
// Request
const validateContentRequest = {
  content: "<h1>My Blog Post</h1><p>This is some content...</p>",
  config: {
    requireHeadings: true,
    validateLinks: true,
    minLength: 100,
    maxLength: 50000
  }
};

// Response
const validateContentResponse: ApiResponse<ContentValidationResult> = {
  success: true,
  data: {
    isValid: true,
    sanitizedContent: "<h1>My Blog Post</h1><p>This is some content...</p>",
    errors: [],
    warnings: [
      {
        type: "CONTENT",
        message: "Consider adding alt text to images for better accessibility",
        severity: "warning"
      }
    ],
    recommendations: [
      {
        type: "STRUCTURE",
        message: "Consider adding more subheadings for better readability",
        severity: "info"
      }
    ]
  }
};
```

### SEO Validation

```typescript
// Request
const validateSEORequest: SEOContent = {
  title: "Ultimate Guide to React Hooks",
  slug: "ultimate-guide-react-hooks",
  content: "<h1>Ultimate Guide to React Hooks</h1><p>React hooks are...</p>",
  seoTitle: "React Hooks Guide | YesGoddess",
  seoDescription: "Learn React Hooks with practical examples and best practices. Complete guide for developers.",
  seoKeywords: "react, hooks, javascript, frontend"
};

// Response
const validateSEOResponse: ApiResponse<SEOValidationResult> = {
  success: true,
  data: {
    score: 85,
    isValid: true,
    errors: [],
    warnings: [
      {
        type: "TITLE",
        message: "Title could be more specific to improve SEO",
        severity: "warning",
        currentValue: "Ultimate Guide to React Hooks",
        suggestedValue: "Ultimate Guide to React Hooks in 2024"
      }
    ],
    recommendations: [
      {
        type: "KEYWORDS",
        message: "Consider adding more long-tail keywords",
        severity: "info"
      }
    ]
  }
};
```

### Excerpt Generation

```typescript
// Request
const generateExcerptRequest = {
  content: "<h1>Introduction</h1><p>This is a comprehensive guide...</p>",
  options: {
    maxLength: 160,
    strategy: "auto-best",
    targetKeywords: ["react", "hooks"],
    preserveSentences: true
  }
};

// Response
const generateExcerptResponse: ApiResponse<ExcerptGenerationResult> = {
  success: true,
  data: {
    excerpt: "This is a comprehensive guide to React hooks that will help you understand modern React development patterns and best practices.",
    confidence: 92,
    strategy: "content-summary",
    wordCount: 22,
    recommendations: [
      {
        type: "LENGTH",
        message: "Excerpt length is optimal for SEO",
        severity: "info"
      }
    ]
  }
};
```

### Internal Link Suggestions

```typescript
// Request
const generateLinkSuggestionsRequest = {
  content: "React hooks are a powerful feature...",
  currentPostId: "cm4post123",
  options: {
    maxSuggestions: 5,
    minRelevanceScore: 70,
    preferRecent: true
  }
};

// Response
const generateLinkSuggestionsResponse: ApiResponse<InternalLinkSuggestionsResult> = {
  success: true,
  data: {
    suggestions: [
      {
        url: "/blog/useState-hook-guide",
        title: "Complete useState Hook Guide",
        excerpt: "Learn everything about useState hook...",
        relevanceScore: 95,
        suggestedAnchorText: "useState hook",
        position: {
          paragraph: 2,
          sentence: 1
        },
        reason: "High relevance to React hooks topic"
      }
    ],
    totalFound: 1,
    processingTime: 145,
    recommendations: [
      {
        type: "DENSITY",
        message: "Good internal linking density",
        severity: "info"
      }
    ]
  }
};
```

### Comprehensive Content Analysis

```typescript
// Request
const analyzeContentRequest = {
  title: "Ultimate Guide to React Hooks",
  content: "<h1>Ultimate Guide to React Hooks</h1><p>React hooks are...</p>",
  slug: "ultimate-guide-react-hooks",
  seoTitle: "React Hooks Guide | YesGoddess",
  seoDescription: "Learn React Hooks with practical examples",
  currentPostId: "cm4post123"
};

// Response
const analyzeContentResponse: ApiResponse<ContentAnalysisResult> = {
  success: true,
  data: {
    contentValidation: {
      isValid: true,
      sanitizedContent: "...",
      errors: [],
      warnings: [],
      recommendations: []
    },
    seoValidation: {
      score: 85,
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    },
    excerptGeneration: {
      excerpt: "Learn React Hooks with practical examples...",
      confidence: 88,
      strategy: "auto-best",
      wordCount: 18,
      recommendations: []
    },
    linkSuggestions: {
      suggestions: [],
      totalFound: 0,
      processingTime: 120,
      recommendations: []
    },
    readTimeData: {
      readTimeMinutes: 5,
      wordCount: 1250,
      characterCount: 7800
    },
    overallScore: 82,
    recommendations: [
      {
        type: "CONTENT",
        message: "Consider adding more subheadings for better structure",
        severity: "info",
        priority: 7
      }
    ]
  }
};
```

---

## Business Logic & Validation Rules

### Content Validation Rules

**HTML Sanitization:**
- Uses DOMPurify to remove dangerous scripts and malicious content
- Allowed tags: `p`, `br`, `strong`, `em`, `u`, `strike`, `del`, `ins`, `h1-h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `a`, `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`
- Allowed attributes vary by tag (href for links, src/alt for images, etc.)

**Length Constraints:**
- Minimum content length: 50 characters (configurable)
- Maximum content length: 100,000 characters
- Title length: 1-500 characters
- SEO title: max 70 characters
- SEO description: max 160 characters

**Structure Requirements:**
- Proper heading hierarchy (H1 → H2 → H3, no skipping levels)
- Maximum of 1 H1 tag per content
- Alt text required for all images
- Descriptive link text (no "click here", "read more")

**Link Validation:**
- External links should include `rel="noopener noreferrer"`
- No javascript: or data: protocols allowed
- Links must have descriptive text

### SEO Validation Rules

**Title Optimization:**
- Length: 10-60 characters optimal
- Should include target keywords
- Avoid keyword stuffing
- Should be unique and descriptive

**Description Optimization:**
- Length: 120-160 characters optimal
- Should include target keywords naturally
- Call-to-action recommended
- Should summarize content effectively

**Content SEO:**
- Keyword density: 1-3% optimal
- H1 should contain primary keyword
- Use of subheadings (H2, H3) recommended
- Internal linking encouraged

### Excerpt Generation Rules

**Strategy Selection:**
- `first-paragraph`: Uses first paragraph, trimmed to length
- `content-summary`: AI-powered content summarization
- `keyword-focused`: Prioritizes sentences with target keywords
- `auto-best`: Automatically selects best strategy based on content

**Quality Constraints:**
- Sentence preservation when possible
- Keyword inclusion when specified
- Length targets respected
- Grammar and readability maintained

### Internal Link Suggestions Rules

**Relevance Scoring:**
- Content similarity analysis
- Keyword matching
- Category relevance
- Recency boost (if enabled)

**Suggestion Limits:**
- Maximum 20 suggestions per request
- Minimum relevance score: 60% (configurable)
- Exclude current post and specified URLs
- Position-aware suggestions

### Slug Generation Rules

**Format Requirements:**
- Lowercase letters, numbers, and hyphens only
- No consecutive hyphens
- No leading/trailing hyphens
- Maximum 150 characters

**Conflict Resolution:**
- Check existing slugs in database
- Generate numbered variants (slug-1, slug-2, etc.)
- Provide alternative suggestions
- Exclude specified post ID from conflict check

---

## Error Handling

### HTTP Status Codes

| Status Code | tRPC Code | When It Occurs |
|-------------|-----------|----------------|
| 200 | OK | Successful operation |
| 400 | BAD_REQUEST | Invalid input, validation error |
| 401 | UNAUTHORIZED | Missing or invalid JWT token |
| 403 | FORBIDDEN | User lacks permission (not authenticated) |
| 500 | INTERNAL_SERVER_ERROR | Server-side processing error |

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR';
    message: string; // Human-readable error message
    data?: {
      httpStatus: number;
      path: string;
      zodError?: any; // If validation error
    };
  }
}
```

### Common Error Scenarios

**Content Validation Errors:**
```typescript
// Content too short
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Content is too short. Minimum 50 characters required.',
  }
}

// Invalid HTML content
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Content validation failed: Removed disallowed tag: script',
  }
}
```

**SEO Validation Errors:**
```typescript
// Title too long
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Title is too long. Maximum 70 characters allowed.',
  }
}

// Missing required field
{
  error: {
    code: 'BAD_REQUEST',
    message: 'Title is required for SEO validation',
  }
}
```

**Authentication Errors:**
```typescript
// Missing token
{
  error: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  }
}

// Invalid token
{
  error: {
    code: 'UNAUTHORIZED',
    message: 'Invalid or expired token',
  }
}
```

### Error Handling Best Practices

1. **Display User-Friendly Messages:** Map technical errors to user-friendly messages
2. **Validation Error Details:** Show specific field errors for validation failures
3. **Retry Logic:** Implement retry for transient errors (network, server errors)
4. **Graceful Degradation:** Provide fallback when non-critical features fail

```typescript
// Example error handler
function handleContentOperationsError(error: any): string {
  if (error.data?.code === 'BAD_REQUEST') {
    // Show specific validation errors
    return error.message;
  }
  
  if (error.data?.code === 'UNAUTHORIZED') {
    return 'Please log in to continue';
  }
  
  if (error.data?.code === 'FORBIDDEN') {
    return 'You do not have permission to perform this action';
  }
  
  // Generic fallback
  return 'An error occurred. Please try again.';
}
```

---

## Authorization & Permissions

### Authentication Requirements

All Content Operations endpoints require JWT authentication:

```typescript
// Required headers
headers: {
  'Authorization': 'Bearer <JWT_TOKEN>',
  'Content-Type': 'application/json',
}
```

### Session Context

All procedures receive authenticated user context:

```typescript
interface SessionContext {
  session: {
    user: {
      id: string;        // User CUID
      email: string;     // User email
      name: string | null; // Display name
      role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'USER'; // User role
    };
  };
}
```

### Access Control

| Endpoint | Access Level | Role Requirements |
|----------|--------------|------------------|
| All Content Operations | 🔒 Protected | Any authenticated user |

> **Note:** While all endpoints are currently `protectedProcedure` (any authenticated user), in practice, content operations are primarily used by ADMIN users for blog management. Consider upgrading to `adminProcedure` for production use.

### Recommended Access Control Upgrade

```typescript
// Current (broad access)
validateContent: protectedProcedure

// Recommended (admin-only)
validateContent: adminProcedure
```

---

## Rate Limiting & Quotas

### Current Implementation

**No explicit rate limiting** is currently implemented at the module level. Rate limiting is handled at the infrastructure level.

### Recommended Rate Limits

| Endpoint | Suggested Limit | Window |
|----------|----------------|---------|
| `validateContent` | 100 requests | 1 hour |
| `validateSEO` | 100 requests | 1 hour |
| `generateExcerpt` | 50 requests | 1 hour |
| `generateLinkSuggestions` | 30 requests | 1 hour |
| `analyzeContent` | 20 requests | 1 hour |

### Quota Considerations

**Content Analysis:** Computationally intensive operations like content analysis and link suggestions should have lower limits to prevent resource exhaustion.

**Bulk Operations:** `generateBulkLinkSuggestions` supports up to 50 posts per request with built-in limits.

---

## Frontend Implementation Checklist

### Phase 1: Basic Integration

- [ ] **Install tRPC Client**
  ```bash
  npm install @trpc/client @trpc/react-query
  ```

- [ ] **Configure API Client**
  ```typescript
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '@/server/api/root';
  
  export const api = createTRPCReact<AppRouter>();
  ```

- [ ] **Set up Authentication Headers**
  ```typescript
  const client = api.createClient({
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

### Phase 2: Core Features

- [ ] **Rich Text Editor Integration**
  - [ ] Real-time content validation
  - [ ] Display validation errors and warnings
  - [ ] Show content sanitization results
  - [ ] Implement auto-save with validation

- [ ] **SEO Optimization Panel**
  - [ ] SEO score display with progress bar
  - [ ] Real-time SEO recommendations
  - [ ] Title and description optimization hints
  - [ ] Keyword density analysis

- [ ] **Excerpt Generation**
  - [ ] Multiple excerpt options display
  - [ ] Strategy selection interface
  - [ ] Preview and edit functionality
  - [ ] Confidence score visualization

- [ ] **Slug Management**
  - [ ] Auto-generate slug from title
  - [ ] Conflict detection and resolution
  - [ ] Manual slug editing with validation
  - [ ] Alternative suggestions display

### Phase 3: Advanced Features

- [ ] **Internal Link Suggestions**
  - [ ] Sidebar or modal with suggestions
  - [ ] One-click link insertion
  - [ ] Relevance score display
  - [ ] Suggestion filtering and preferences

- [ ] **Content Analysis Dashboard**
  - [ ] Overall content score
  - [ ] Comprehensive recommendations
  - [ ] Performance metrics
  - [ ] Historical analysis trends

- [ ] **Bulk Operations**
  - [ ] Batch link suggestion generation
  - [ ] Progress indicators for long operations
  - [ ] Results export and management

### Phase 4: UX Enhancements

- [ ] **Error Handling**
  ```typescript
  const { mutate: validateContent, error, isLoading } = api.blog.contentOperations.validateContent.useMutation({
    onError: (error) => {
      toast.error(handleContentOperationsError(error));
    },
    onSuccess: (data) => {
      if (!data.data.isValid) {
        displayValidationErrors(data.data.errors);
      }
    },
  });
  ```

- [ ] **Loading States**
  - [ ] Skeleton loaders for analysis
  - [ ] Progress bars for long operations
  - [ ] Optimistic updates where appropriate

- [ ] **Caching Strategy**
  ```typescript
  // Cache validation results to avoid re-computation
  const { data: validationResult } = api.blog.contentOperations.validateContent.useQuery(
    { content, config },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: !!content && content.length > 0,
    }
  );
  ```

### Phase 5: Testing & Optimization

- [ ] **Component Testing**
  - [ ] Test validation error display
  - [ ] Test SEO score calculations
  - [ ] Test link suggestion integration
  - [ ] Test form submission flows

- [ ] **Performance Optimization**
  - [ ] Debounce validation calls
  - [ ] Implement virtual scrolling for large lists
  - [ ] Optimize re-renders with React.memo
  - [ ] Bundle size optimization

- [ ] **Error Scenarios Testing**
  - [ ] Network failure handling
  - [ ] Invalid token scenarios
  - [ ] Server error responses
  - [ ] Validation failure flows

### Example Implementation

```typescript
// ContentEditor.tsx
import { useState, useEffect } from 'react';
import { api } from '@/utils/api';
import { debounce } from 'lodash';

export function ContentEditor() {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  
  // Real-time validation
  const { data: validation, isLoading } = api.blog.contentOperations.validateContent.useQuery(
    { content, config: { requireHeadings: true, validateLinks: true } },
    { 
      enabled: content.length > 0,
      staleTime: 30000, // Cache for 30 seconds
    }
  );
  
  // SEO analysis
  const { mutate: analyzeSEO } = api.blog.contentOperations.validateSEO.useMutation({
    onSuccess: (result) => {
      setSeoScore(result.data.score);
    },
  });
  
  // Debounced SEO analysis
  const debouncedSEOAnalysis = useCallback(
    debounce((title: string, content: string) => {
      if (title && content) {
        analyzeSEO({ title, content, slug: generateSlug(title) });
      }
    }, 1000),
    [analyzeSEO]
  );
  
  useEffect(() => {
    debouncedSEOAnalysis(title, content);
  }, [title, content, debouncedSEOAnalysis]);
  
  return (
    <div className="content-editor">
      {/* Editor implementation */}
      {validation && !validation.data.isValid && (
        <ValidationErrors errors={validation.data.errors} />
      )}
    </div>
  );
}
```

This comprehensive integration guide provides all the necessary information for frontend developers to implement Content Operations features without requiring additional clarification from the backend team.
