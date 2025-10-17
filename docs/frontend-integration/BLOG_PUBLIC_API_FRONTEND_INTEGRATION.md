# 🌐 Blog Public API - Frontend Integration Guide

## Overview
This document provides comprehensive integration guidance for the Blog Public API module. This module provides **public access** to published blog content through REST endpoints designed for frontend consumption.

### 🎯 Classification
- **🌐 SHARED** - All endpoints are public and used by both frontend and external consumers
- **No authentication required** for any endpoint in this module

---

## 1. API Endpoints

### 1.1 GET /api/blog/posts
**Purpose**: Retrieve paginated list of published blog posts with filtering and sorting

```typescript
// Request
interface BlogPostsRequest {
  page?: number;           // Page number (default: 1)
  limit?: number;          // Posts per page (default: 10, max: 50)
  category?: string;       // Category slug filter
  tag?: string;           // Tag name filter
  search?: string;        // Search query (title, excerpt, content)
  sort?: 'newest' | 'oldest' | 'popular' | 'featured'; // Sort order
}

// Response
interface BlogPostsResponse {
  data: PublicBlogPost[];
  pagination: PaginationMeta;
  filters: AppliedFilters;
}
```

### 1.2 GET /api/blog/posts/[slug]
**Purpose**: Retrieve single blog post by slug with related content

```typescript
// Request - URL Parameter
interface BlogPostBySlugRequest {
  slug: string; // Post slug from URL path
}

// Response
interface BlogPostResponse {
  success: true;
  data: PublicBlogPostDetailed;
}
```

### 1.3 GET /api/blog/sitemap.xml
**Purpose**: Generate XML sitemap for SEO and search engines

- **Content-Type**: `application/xml`
- **Cache**: Public, 1 hour
- **No parameters required**

### 1.4 GET /api/blog/rss.xml
**Purpose**: Generate RSS 2.0 feed for blog subscriptions

- **Content-Type**: `application/rss+xml`
- **Cache**: Public, 2 hours
- **No parameters required**

---

## 2. TypeScript Type Definitions

```typescript
// ========================================
// Core Types
// ========================================

interface PublicBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  published_at: string; // ISO 8601
  read_time_minutes: number;
  view_count: number;
  is_featured: boolean;
  tags: string[];
  author: PublicAuthor | null;
  category: PublicCategory | null;
}

interface PublicBlogPostDetailed extends PublicBlogPost {
  content: string; // Full HTML content
  seo: SEOMetadata;
  related_posts: RelatedPost[];
}

interface PublicAuthor {
  id: string;
  name: string;
  avatar: string | null;
}

interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description?: string; // Only on detailed view
}

interface SEOMetadata {
  title: string | null;
  description: string | null;
  keywords: string | null;
}

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  published_at: string;
}

// ========================================
// Response Wrappers
// ========================================

interface PaginationMeta {
  current_page: number;
  total_pages: number;
  total_posts: number;
  page_size: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

interface AppliedFilters {
  category: string | null;
  tag: string | null;
  search: string | null;
  sort: string;
}

// ========================================
// Error Types
// ========================================

interface BlogAPIError {
  success: false;
  error: string;
  details?: any;
}

// ========================================
// API Client Types
// ========================================

interface BlogAPIClient {
  getPosts: (params?: BlogPostsRequest) => Promise<BlogPostsResponse>;
  getPost: (slug: string) => Promise<BlogPostResponse>;
  getSitemap: () => Promise<string>;
  getRSSFeed: () => Promise<string>;
}

// ========================================
// Query Parameter Types
// ========================================

type SortOption = 'newest' | 'oldest' | 'popular' | 'featured';
type FilterParams = Pick<BlogPostsRequest, 'category' | 'tag' | 'search'>;
type PaginationParams = Pick<BlogPostsRequest, 'page' | 'limit'>;
```

---

## 3. Business Logic & Validation Rules

### 3.1 Content Visibility Rules
- **Only `PUBLISHED` posts** are returned
- **Published date** must be <= current time (no future posts)
- **Soft-deleted posts** are excluded
- **Draft/Scheduled posts** are never accessible via public API

### 3.2 Pagination Rules
- **Default page size**: 10 posts
- **Maximum page size**: 50 posts
- **Minimum page**: 1
- **Invalid page numbers** return empty results (not 404)

### 3.3 Search & Filtering
- **Search scope**: title, excerpt, content (case-insensitive)
- **Category filtering**: By category slug (exact match)
- **Tag filtering**: By tag name (exact match)
- **Search minimum length**: 1 character
- **Search maximum length**: 200 characters

### 3.4 Sorting Logic
```typescript
const sortingRules = {
  newest: { field: 'published_at', order: 'desc' },
  oldest: { field: 'published_at', order: 'asc' },
  popular: { field: 'view_count', order: 'desc' },
  featured: { 
    // Featured posts first, then by published_at desc
    custom: true,
    logic: 'featured posts appear first, then chronological'
  }
};
```

### 3.5 Content Processing
- **View count increment**: Automatic on individual post access
- **Read time calculation**: Auto-generated (200 WPM average)
- **Excerpt generation**: Auto-generated if not manually set
- **HTML sanitization**: Content is sanitized for security

---

## 4. Error Handling

### 4.1 HTTP Status Codes

| Status | Meaning | When Used |
|--------|---------|-----------|
| 200 | Success | Valid request with results |
| 400 | Bad Request | Invalid query parameters |
| 404 | Not Found | Post slug not found or not published |
| 500 | Server Error | Internal server error |

### 4.2 Error Response Format

```typescript
interface BlogAPIError {
  success: false;
  error: string;
  details?: {
    field?: string;
    code?: string;
    issues?: Array<{
      path: string[];
      message: string;
    }>;
  };
}
```

### 4.3 Common Error Codes

```typescript
const errorCodes = {
  // Validation Errors (400)
  INVALID_QUERY_PARAMS: 'Query parameters validation failed',
  INVALID_PAGE_NUMBER: 'Page number must be a positive integer',
  INVALID_LIMIT: 'Limit must be between 1 and 50',
  INVALID_SORT_OPTION: 'Sort must be one of: newest, oldest, popular, featured',
  
  // Not Found Errors (404)
  POST_NOT_FOUND: 'Post not found or not published',
  CATEGORY_NOT_FOUND: 'Category not found',
  
  // Server Errors (500)
  INTERNAL_SERVER_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database connection error',
  CONTENT_GENERATION_ERROR: 'Failed to generate content'
};
```

### 4.4 Error Handling Best Practices

```typescript
// Example error handling implementation
async function handleBlogAPIError(error: any): Promise<void> {
  if (error.status === 400) {
    // Show validation errors to user
    if (error.data?.details?.issues) {
      showFormValidationErrors(error.data.details.issues);
    } else {
      showToast('Invalid request parameters', 'error');
    }
  } else if (error.status === 404) {
    // Redirect to 404 page or show not found message
    router.push('/blog/not-found');
  } else if (error.status >= 500) {
    // Show generic error message
    showToast('Something went wrong. Please try again later.', 'error');
  }
}
```

---

## 5. Authorization & Permissions

### 5.1 Access Control
- **🌐 PUBLIC ACCESS**: No authentication required for any endpoint
- **CORS enabled**: All origins allowed for public API
- **Rate limiting**: Standard rate limits apply (see section 7)

### 5.2 Content Access Rules
- **Published posts only**: Unpublished content is never accessible
- **Public metadata only**: Sensitive admin fields are excluded
- **Sanitized content**: All content is sanitized for public consumption

---

## 6. Caching Strategy

### 6.1 HTTP Caching Headers

```typescript
const cachingHeaders = {
  // Blog posts list
  '/api/blog/posts': {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5 min
    'Vary': 'Accept-Encoding'
  },
  
  // Individual blog post
  '/api/blog/posts/[slug]': {
    'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600', // 30 min
    'ETag': '"post-updated-timestamp"',
    'Last-Modified': 'post-updated-date'
  },
  
  // Sitemap
  '/api/blog/sitemap.xml': {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200' // 1 hour
  },
  
  // RSS feed
  '/api/blog/rss.xml': {
    'Cache-Control': 'public, max-age=7200, stale-while-revalidate=14400' // 2 hours
  }
};
```

### 6.2 Frontend Caching Strategy

```typescript
// React Query configuration example
const queryConfig = {
  posts: {
    staleTime: 5 * 60 * 1000,        // 5 minutes
    cacheTime: 30 * 60 * 1000,       // 30 minutes
    refetchOnWindowFocus: false,
  },
  post: {
    staleTime: 30 * 60 * 1000,       // 30 minutes
    cacheTime: 60 * 60 * 1000,       // 1 hour
    refetchOnWindowFocus: false,
  }
};
```

---

## 7. Rate Limiting & Quotas

### 7.1 Rate Limits per Endpoint

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `/api/blog/posts` | 60 requests | per minute |
| `/api/blog/posts/[slug]` | 100 requests | per minute |
| `/api/blog/sitemap.xml` | 10 requests | per minute |
| `/api/blog/rss.xml` | 20 requests | per minute |

### 7.2 Rate Limit Headers

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Maximum requests allowed
  'X-RateLimit-Remaining': string;  // Remaining requests
  'X-RateLimit-Reset': string;      // Reset timestamp
  'Retry-After'?: string;           // Seconds to wait (if limited)
}
```

### 7.3 Rate Limit Handling

```typescript
function handleRateLimit(response: Response): void {
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    showToast(`Rate limit exceeded. Try again in ${retryAfter} seconds.`, 'warning');
  } else if (remaining && parseInt(remaining) < 10) {
    // Warn when approaching limit
    console.warn(`Approaching rate limit. ${remaining} requests remaining.`);
  }
}
```

---

## Next: Implementation Details
👉 Continue to [**Part 2: Implementation Guide**](./BLOG_PUBLIC_API_IMPLEMENTATION_GUIDE.md) for detailed implementation examples, API client setup, and React Query integration.
