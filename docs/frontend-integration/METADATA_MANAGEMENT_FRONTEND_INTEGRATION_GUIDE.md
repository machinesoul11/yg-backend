# Metadata Management Module - Frontend Integration Guide

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

## Overview

The Metadata Management module provides comprehensive SEO metadata generation and management for the YesGoddess platform. It handles SEO metadata, Open Graph tags, Twitter Cards, JSON-LD structured data, canonical URL management, and robots meta tag control for all content types including blog posts, category pages, author profiles, and generic pages.

## 1. API Endpoints

### Base URL
- **Admin Backend:** `https://ops.yesgoddess.agency/api/trpc/seo`
- **Frontend:** Uses the same backend endpoints

### Authentication
All endpoints require authentication via JWT session token or Bearer token.

### Available Endpoints

#### 1.1 Content Metadata Generation

| Endpoint | Method | Auth Level | Description |
|----------|--------|------------|-------------|
| `seo.generateMetadata` | QUERY | 🔒 Protected | Generate SEO metadata for any content |
| `seo.generateBlogPostMetadata` | QUERY | 🔒 Protected | Blog post-specific metadata with database lookup |
| `seo.generateCategoryMetadata` | QUERY | 🔒 Protected | Category page metadata with post count |
| `seo.generateAuthorMetadata` | QUERY | 🔒 Protected | Author profile metadata with bio info |

#### 1.2 SEO Analysis & Validation

| Endpoint | Method | Auth Level | Description |
|----------|--------|------------|-------------|
| `seo.analyzeSEO` | QUERY | 🔒 Protected | Analyze content for SEO best practices |
| `seo.validateUrl` | QUERY | 🔒 Protected | Validate URL format and SEO compliance |

#### 1.3 Utility Functions

| Endpoint | Method | Auth Level | Description |
|----------|--------|------------|-------------|
| `seo.generateBreadcrumbs` | QUERY | 🔒 Protected | Generate breadcrumb structured data |
| `seo.generateFAQStructuredData` | QUERY | 🔒 Protected | Generate FAQ schema markup |
| `seo.generateSlug` | QUERY | 🔒 Protected | Generate unique SEO-friendly slugs |
| `seo.extractKeywords` | QUERY | 🔒 Protected | Extract keywords from content |
| `seo.generateTitleVariations` | QUERY | 🔒 Protected | Generate A/B testing title variations |
| `seo.calculateReadingTime` | QUERY | 🔒 Protected | Calculate content reading time |

#### 1.4 Configuration Management

| Endpoint | Method | Auth Level | Description |
|----------|--------|------------|-------------|
| `seo.getConfig` | QUERY | 🔒 Admin Only | Get SEO configuration settings |
| `seo.updateConfig` | MUTATION | 🔒 Admin Only | Update SEO configuration |

---

## 2. TypeScript Type Definitions

### 2.1 Core Interfaces

```typescript
/**
 * SEO Content Input
 */
export interface SEOContent {
  id?: string;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  featuredImageUrl?: string;
  tags?: string[];
  publishedAt?: Date;
  updatedAt?: Date;
  author?: {
    id: string;
    name: string;
    slug?: string;
    avatar?: string;
    bio?: string;
    socialLinks?: Record<string, string>;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  type?: 'article' | 'website' | 'profile' | 'product';
}

/**
 * SEO Configuration
 */
export interface SEOConfig {
  siteTitle: string;
  siteDomain: string;
  siteUrl: string;
  defaultDescription: string;
  defaultImage: string;
  twitterHandle?: string;
  facebookAppId?: string;
  organizationName: string;
  organizationLogo: string;
  organizationUrl: string;
  locale: string;
  alternateLocales?: string[];
}

/**
 * Generated SEO Metadata
 */
export interface SEOMetadata {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  openGraph: OpenGraphTags;
  twitterCard: TwitterCardTags;
  structuredData: StructuredData[];
  alternateUrls?: Array<{
    hreflang: string;
    href: string;
  }>;
}

/**
 * Complete Page Metadata (Extended)
 */
export interface PageMetadata extends SEOMetadata {
  charset: string;
  viewport: string;
  generator: string;
  themeColor: string;
  appleTouchIcon: string;
  manifest: string;
  alternateUrls?: Array<{
    hreflang: string;
    href: string;
  }>;
}
```

### 2.2 Open Graph & Twitter Cards

```typescript
/**
 * Open Graph Tags
 */
export interface OpenGraphTags {
  'og:title': string;
  'og:description': string;
  'og:url': string;
  'og:type': string;
  'og:image': string;
  'og:image:width'?: string;
  'og:image:height'?: string;
  'og:image:alt'?: string;
  'og:site_name': string;
  'og:locale': string;
  'og:locale:alternate'?: string[];
  'article:published_time'?: string;
  'article:modified_time'?: string;
  'article:author'?: string;
  'article:section'?: string;
  'article:tag'?: string[];
}

/**
 * Twitter Card Tags
 */
export interface TwitterCardTags {
  'twitter:card': 'summary' | 'summary_large_image' | 'app' | 'player';
  'twitter:site'?: string;
  'twitter:creator'?: string;
  'twitter:title': string;
  'twitter:description': string;
  'twitter:image': string;
  'twitter:image:alt'?: string;
}
```

### 2.3 Structured Data & Robots

```typescript
/**
 * JSON-LD Structured Data
 */
export interface StructuredData {
  '@context': string;
  '@type': string;
  [key: string]: any;
}

/**
 * Robots Directives
 */
export interface RobotsDirectives {
  index?: boolean;
  follow?: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
  noimageindex?: boolean;
  'max-snippet'?: number;
  'max-image-preview'?: 'none' | 'standard' | 'large';
  'max-video-preview'?: number;
  'unavailable_after'?: string;
}

/**
 * Breadcrumb Item
 */
export interface BreadcrumbItem {
  name: string;
  url: string;
  position: number;
}

/**
 * FAQ Item
 */
export interface FAQItem {
  question: string;
  answer: string;
}
```

### 2.4 Response Types

```typescript
/**
 * Standard API Response
 */
export interface MetadataResponse<T = any> {
  success: boolean;
  metadata?: T;
  data?: T;
  message?: string;
}

/**
 * SEO Analysis Response
 */
export interface SEOAnalysisResponse {
  success: boolean;
  analysis: {
    score: number;
    recommendations: string[];
    commonIssues: string[];
    readingTime?: number;
    wordCount?: number;
  };
}

/**
 * Slug Generation Response
 */
export interface SlugGenerationResponse {
  success: boolean;
  slug: string;
  isUnique: boolean;
}

/**
 * Keywords Extraction Response
 */
export interface KeywordsResponse {
  success: boolean;
  keywords: string[];
}
```

---

## 3. Zod Validation Schemas

### 3.1 Input Validation

```typescript
import { z } from 'zod';

/**
 * SEO Content Schema
 */
export const seoContentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().max(200, 'SEO description too long').optional(),
  seoKeywords: z.string().optional(),
  featuredImageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  type: z.enum(['article', 'website', 'profile', 'product']).optional(),
  author: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().optional(),
    avatar: z.string().url().optional(),
    bio: z.string().optional(),
    socialLinks: z.record(z.string(), z.string()).optional(),
  }).optional(),
  category: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }).optional(),
});

/**
 * SEO Config Schema
 */
export const seoConfigSchema = z.object({
  siteTitle: z.string().optional(),
  siteDomain: z.string().optional(),
  siteUrl: z.string().url().optional(),
  defaultDescription: z.string().optional(),
  defaultImage: z.string().url().optional(),
  twitterHandle: z.string().optional(),
  facebookAppId: z.string().optional(),
  organizationName: z.string().optional(),
  organizationLogo: z.string().url().optional(),
  organizationUrl: z.string().url().optional(),
  locale: z.string().optional(),
  alternateLocales: z.array(z.string()).optional(),
});

/**
 * Generate Metadata Schema
 */
export const generateMetadataSchema = z.object({
  content: seoContentSchema,
  path: z.string(),
  config: seoConfigSchema.optional(),
});

/**
 * Blog Post Metadata Schema
 */
export const blogPostMetadataSchema = z.object({
  postId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});

/**
 * Category Metadata Schema
 */
export const categoryMetadataSchema = z.object({
  categoryId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});

/**
 * Author Metadata Schema
 */
export const authorMetadataSchema = z.object({
  authorId: z.string().cuid(),
  config: seoConfigSchema.optional(),
});
```

### 3.2 Utility Schemas

```typescript
/**
 * Analyze SEO Schema
 */
export const analyzeSEOSchema = z.object({
  content: seoContentSchema,
});

/**
 * Generate Breadcrumbs Schema
 */
export const generateBreadcrumbsSchema = z.object({
  path: z.string(),
  baseUrl: z.string().url(),
});

/**
 * FAQ Schema
 */
export const generateFAQSchema = z.object({
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

/**
 * URL Validation Schema
 */
export const validateUrlSchema = z.object({
  url: z.string().url(),
});

/**
 * Slug Generation Schema
 */
export const generateSlugSchema = z.object({
  text: z.string(),
});

/**
 * Keywords Extraction Schema
 */
export const extractKeywordsSchema = z.object({
  text: z.string(),
  maxKeywords: z.number().int().min(1).max(20).optional(),
});

/**
 * Reading Time Schema
 */
export const calculateReadingTimeSchema = z.object({
  content: z.string(),
  wordsPerMinute: z.number().int().min(100).max(300).optional().default(200),
});
```

---

## 4. Business Logic & Validation Rules

### 4.1 SEO Metadata Rules

#### Title Optimization
- **Length:** 50-60 characters optimal, max 100 characters
- **Format:** `{Page Title} - {Site Title}` for non-homepage
- **Fallback:** Uses `seoTitle` → `title` → default pattern

#### Meta Description
- **Length:** 150-160 characters optimal, max 200 characters
- **Priority:** `seoDescription` → `excerpt` → auto-generated from content
- **Auto-generation:** First 160 chars of clean text if no description provided

#### Canonical URLs
- **Format:** Always absolute URLs with protocol
- **Parameters:** Query parameters and fragments removed
- **Trailing Slash:** Removed except for root path
- **Uniqueness:** Each page must have unique canonical URL

### 4.2 Image Optimization

#### Featured Images
- **Open Graph:** 1200x630px recommended
- **Twitter:** Summary Large Image for images, Summary for text-only
- **Alt Text:** Auto-generated from title if not provided
- **Fallback:** Uses site default image if none provided

#### Image Validation
- **URL Format:** Must be absolute URLs
- **Dimensions:** Validates against platform requirements
- **File Types:** Supports common web formats (jpg, png, webp)

### 4.3 Structured Data Rules

#### Article Schema
- **Required:** headline, description, author, datePublished
- **Optional:** image, category, tags, dateModified
- **Publisher:** Always includes organization info

#### Organization Schema
- **Required:** name, url, logo
- **Consistent:** Same across all pages
- **Social Links:** Twitter, LinkedIn profiles included

#### Breadcrumb Schema
- **Auto-generated:** From URL path structure
- **Position:** Sequential numbering starting from 1
- **Home Link:** Always included as position 1

### 4.4 Robots Meta Tag Logic

```typescript
// Robots directive generation logic
function generateRobots(content: SEOContent): string {
  const directives: string[] = [];
  
  // Index/noindex based on publication status
  const shouldIndex = content.publishedAt && content.publishedAt <= new Date();
  directives.push(shouldIndex ? 'index' : 'noindex');
  
  // Always allow following unless restricted
  directives.push('follow');
  
  // Content-specific directives
  if (content.type === 'article') {
    directives.push('max-snippet:200');
    directives.push('max-image-preview:large');
  }
  
  return directives.join(', ');
}
```

---

## 5. Error Handling

### 5.1 HTTP Status Codes

| Status Code | tRPC Code | Description |
|-------------|-----------|-------------|
| 200 | OK | Successful metadata generation |
| 400 | BAD_REQUEST | Invalid input, validation failed |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Admin-only endpoint accessed by non-admin |
| 404 | NOT_FOUND | Blog post, category, or author not found |
| 500 | INTERNAL_SERVER_ERROR | Unexpected server error |

### 5.2 Error Response Format

```typescript
interface TRPCError {
  error: {
    message: string;           // Human-readable error message
    code: string;              // tRPC error code
    data: {
      code: string;            // Same as above
      httpStatus: number;      // HTTP status code
      path: string;            // tRPC procedure path
      zodError?: {             // Validation errors (if applicable)
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}
```

### 5.3 Common Error Scenarios

#### Validation Errors (400)
```json
{
  "error": {
    "message": "Validation failed",
    "code": "BAD_REQUEST",
    "data": {
      "zodError": {
        "fieldErrors": {
          "title": ["Title is required"],
          "slug": ["Invalid slug format"],
          "seoDescription": ["SEO description too long"]
        }
      }
    }
  }
}
```

#### Not Found Errors (404)
```json
{
  "error": {
    "message": "Blog post not found",
    "code": "NOT_FOUND",
    "data": {
      "httpStatus": 404,
      "path": "seo.generateBlogPostMetadata"
    }
  }
}
```

#### Authorization Errors (403)
```json
{
  "error": {
    "message": "Admin access required",
    "code": "FORBIDDEN",
    "data": {
      "httpStatus": 403,
      "path": "seo.updateConfig"
    }
  }
}
```

### 5.4 Frontend Error Handling

```typescript
// Error handling utility
export function handleMetadataError(error: TRPCClientError<any>): string {
  switch (error.data?.code) {
    case 'NOT_FOUND':
      return 'Content not found. It may have been deleted.';
    case 'BAD_REQUEST':
      if (error.data?.zodError) {
        const fieldErrors = Object.entries(error.data.zodError.fieldErrors)
          .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
          .join('; ');
        return `Validation error: ${fieldErrors}`;
      }
      return 'Invalid request. Please check your input.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'UNAUTHORIZED':
      return 'Please sign in to access this feature.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}
```

---

## 6. Authorization & Permissions

### 6.1 Role-Based Access

| Endpoint | ADMIN | CREATOR | BRAND | Notes |
|----------|-------|---------|-------|-------|
| `generateMetadata` | ✅ | ✅ | ✅ | All authenticated users |
| `generateBlogPostMetadata` | ✅ | ✅ | ✅ | Public content metadata |
| `generateCategoryMetadata` | ✅ | ✅ | ✅ | Public content metadata |
| `generateAuthorMetadata` | ✅ | ✅ | ✅ | Public content metadata |
| `analyzeSEO` | ✅ | ✅ | ✅ | Content analysis tool |
| `generateBreadcrumbs` | ✅ | ✅ | ✅ | Navigation utility |
| `generateFAQStructuredData` | ✅ | ✅ | ✅ | Schema generation |
| `validateUrl` | ✅ | ✅ | ✅ | URL validation tool |
| `generateSlug` | ✅ | ✅ | ✅ | Slug generation utility |
| `extractKeywords` | ✅ | ✅ | ✅ | Content analysis |
| `generateTitleVariations` | ✅ | ✅ | ✅ | A/B testing tool |
| `calculateReadingTime` | ✅ | ✅ | ✅ | Content metrics |
| `getConfig` | ✅ | ❌ | ❌ | Admin-only configuration |
| `updateConfig` | ✅ | ❌ | ❌ | Admin-only configuration |

### 6.2 Authentication Requirements

All endpoints require:
```http
Cookie: next-auth.session-token=<session_token>
# OR
Authorization: Bearer <jwt_token>
```

### 6.3 Permission Validation

```typescript
// Backend permission checks
if (session.user.role !== 'ADMIN') {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Admin access required',
  });
}
```

---

## 7. Rate Limiting & Quotas

### 7.1 Rate Limits

| Operation Type | Limit | Window | Scope |
|---------------|-------|--------|-------|
| Metadata Generation | 100 requests | 15 minutes | Per user |
| SEO Analysis | 50 requests | 15 minutes | Per user |
| Utility Functions | 200 requests | 15 minutes | Per user |
| Admin Operations | 1000 requests | 15 minutes | Per admin |

### 7.2 Rate Limit Headers

All responses include:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699999999
```

### 7.3 Rate Limit Exceeded (429)

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Please try again later.",
    "data": {
      "retryAfter": 120,
      "limit": 100,
      "window": "15 minutes"
    }
  }
}
```

### 7.4 Frontend Rate Limit Handling

```typescript
// Rate limit tracking hook
export function useRateLimit() {
  const [rateLimit, setRateLimit] = useState({
    limit: 0,
    remaining: 0,
    resetAt: 0,
  });

  const updateFromHeaders = (headers: Headers) => {
    setRateLimit({
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      resetAt: parseInt(headers.get('X-RateLimit-Reset') || '0'),
    });
  };

  const isNearLimit = () => {
    return rateLimit.remaining < rateLimit.limit * 0.1; // Less than 10% remaining
  };

  return { rateLimit, updateFromHeaders, isNearLimit };
}
```

---

## 8. File Uploads

**Not Applicable** - This module handles metadata generation only, no file uploads are involved.

---

## 9. Real-time Updates

**Not Applicable** - Metadata generation is synchronous and does not require real-time updates.

---

## 10. Pagination & Filtering

**Not Applicable** - Individual metadata generation requests don't require pagination. Bulk operations would be handled by specific endpoints if implemented.

---

## 11. Frontend Implementation Checklist

### 11.1 Setup & Installation

- [ ] **Install tRPC Client**
  ```bash
  npm install @trpc/client @trpc/react-query
  ```

- [ ] **Configure tRPC Client**
  ```typescript
  // lib/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '../server/routers/_app';
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **Setup React Query Provider**
  ```typescript
  // app/layout.tsx or _app.tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { trpc } from '../lib/trpc';
  
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({
    url: 'https://ops.yesgoddess.agency/api/trpc',
  });
  ```

### 11.2 Core Components

- [ ] **Create Metadata Hook**
  ```typescript
  // hooks/useMetadata.ts
  export function useMetadata() {
    const generateMetadata = trpc.seo.generateMetadata.useQuery;
    const analyzeSEO = trpc.seo.analyzeSEO.useQuery;
    
    return {
      generateMetadata,
      analyzeSEO,
      // ... other metadata functions
    };
  }
  ```

- [ ] **Create Next.js Head Component**
  ```typescript
  // components/SEOHead.tsx
  import Head from 'next/head';
  import { PageMetadata } from '../types/metadata';
  
  interface SEOHeadProps {
    metadata: PageMetadata;
  }
  
  export function SEOHead({ metadata }: SEOHeadProps) {
    return (
      <Head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />
        <meta name="robots" content={metadata.robots} />
        <link rel="canonical" href={metadata.canonical} />
        
        {/* Open Graph tags */}
        {Object.entries(metadata.openGraph).map(([property, content]) => (
          <meta key={property} property={property} content={content} />
        ))}
        
        {/* Twitter Card tags */}
        {Object.entries(metadata.twitterCard).map(([name, content]) => (
          <meta key={name} name={name} content={content} />
        ))}
        
        {/* Structured Data */}
        {metadata.structuredData.map((data, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
          />
        ))}
      </Head>
    );
  }
  ```

### 11.3 Page Implementation

- [ ] **Blog Post Metadata**
  ```typescript
  // pages/blog/[slug].tsx
  export function BlogPost({ postId }: { postId: string }) {
    const { data: metadata, isLoading, error } = trpc.seo.generateBlogPostMetadata.useQuery({
      postId,
      config: {
        // Optional custom config
      }
    });
    
    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {handleMetadataError(error)}</div>;
    
    return (
      <>
        {metadata && <SEOHead metadata={metadata.metadata} />}
        {/* Page content */}
      </>
    );
  }
  ```

- [ ] **Category Page Metadata**
  ```typescript
  // pages/blog/category/[slug].tsx
  export function CategoryPage({ categoryId }: { categoryId: string }) {
    const { data: metadata } = trpc.seo.generateCategoryMetadata.useQuery({
      categoryId
    });
    
    return (
      <>
        {metadata && <SEOHead metadata={metadata.metadata} />}
        {/* Category content */}
      </>
    );
  }
  ```

### 11.4 SEO Tools & Utilities

- [ ] **SEO Analysis Component**
  ```typescript
  // components/SEOAnalyzer.tsx
  export function SEOAnalyzer({ content }: { content: SEOContent }) {
    const { data: analysis, isLoading } = trpc.seo.analyzeSEO.useQuery({
      content
    });
    
    if (isLoading) return <div>Analyzing...</div>;
    
    return (
      <div className="seo-analysis">
        <h3>SEO Score: {analysis?.analysis.score}/100</h3>
        
        <div className="recommendations">
          <h4>Recommendations</h4>
          <ul>
            {analysis?.analysis.recommendations.map((rec, index) => (
              <li key={index}>{rec}</li>
            ))}
          </ul>
        </div>
        
        <div className="issues">
          <h4>Issues Found</h4>
          <ul>
            {analysis?.analysis.commonIssues.map((issue, index) => (
              <li key={index} className="text-red-600">{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  ```

- [ ] **Slug Generator**
  ```typescript
  // components/SlugGenerator.tsx
  export function SlugGenerator({ title, onSlugGenerated }: {
    title: string;
    onSlugGenerated: (slug: string) => void;
  }) {
    const generateSlug = trpc.seo.generateSlug.useMutation({
      onSuccess: (data) => {
        onSlugGenerated(data.slug);
      }
    });
    
    return (
      <button
        onClick={() => generateSlug.mutate({ text: title })}
        disabled={generateSlug.isLoading}
      >
        {generateSlug.isLoading ? 'Generating...' : 'Generate Slug'}
      </button>
    );
  }
  ```

### 11.5 Error Handling

- [ ] **Global Error Handler**
  ```typescript
  // lib/errorHandler.ts
  import { TRPCClientError } from '@trpc/client';
  import { toast } from 'react-hot-toast';
  
  export function handleMetadataError(error: TRPCClientError<any>) {
    const message = handleMetadataError(error);
    toast.error(message);
    console.error('Metadata Error:', error);
  }
  ```

- [ ] **Error Boundary**
  ```typescript
  // components/MetadataErrorBoundary.tsx
  export class MetadataErrorBoundary extends React.Component {
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      console.error('Metadata Error Boundary:', error, errorInfo);
    }
    
    render() {
      if (this.state.hasError) {
        return <div>Failed to load metadata. Using defaults.</div>;
      }
      
      return this.props.children;
    }
  }
  ```

### 11.6 Performance Optimization

- [ ] **Enable React Query Caching**
  ```typescript
  // lib/trpc.ts
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        cacheTime: 10 * 60 * 1000, // 10 minutes
      },
    },
  });
  ```

- [ ] **Preload Critical Metadata**
  ```typescript
  // Use prefetchQuery for critical pages
  await queryClient.prefetchQuery(
    ['seo.generateBlogPostMetadata', { postId }],
    () => trpc.seo.generateBlogPostMetadata.fetch({ postId })
  );
  ```

### 11.7 Testing

- [ ] **Unit Tests for Components**
  ```typescript
  // __tests__/SEOHead.test.tsx
  import { render } from '@testing-library/react';
  import { SEOHead } from '../components/SEOHead';
  
  test('renders basic SEO metadata', () => {
    const metadata = {
      title: 'Test Page',
      description: 'Test description',
      canonical: 'https://example.com/test',
      robots: 'index, follow',
      openGraph: { /* ... */ },
      twitterCard: { /* ... */ },
      structuredData: [],
    };
    
    render(<SEOHead metadata={metadata} />);
    
    expect(document.title).toBe('Test Page');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toBe('Test description');
  });
  ```

- [ ] **Integration Tests**
  ```typescript
  // __tests__/metadata-integration.test.tsx
  test('generates blog post metadata', async () => {
    const result = await trpc.seo.generateBlogPostMetadata.fetch({
      postId: 'test-post-id'
    });
    
    expect(result.success).toBe(true);
    expect(result.metadata.title).toBeDefined();
    expect(result.metadata.openGraph['og:type']).toBe('article');
  });
  ```

### 11.8 Edge Cases to Handle

- [ ] **Missing Content Scenarios**
  - No featured image → Use default site image
  - No excerpt → Auto-generate from content
  - No author → Use site default
  - No publication date → Use current date

- [ ] **Error Recovery**
  - API timeout → Use cached metadata
  - Rate limit exceeded → Show warning, retry with backoff
  - Invalid content → Validate client-side before API call

- [ ] **SEO Edge Cases**
  - Very long titles → Truncate intelligently at word boundaries
  - Special characters in slugs → Sanitize and transliterate
  - Duplicate slugs → Auto-append numbers
  - Missing structured data → Provide fallbacks

### 11.9 UX Considerations

- [ ] **Loading States**
  - Show skeleton loaders for metadata
  - Prevent layout shift during metadata loading
  - Cache metadata for faster subsequent loads

- [ ] **User Feedback**
  - SEO score visualization with color coding
  - Real-time feedback as user types content
  - Recommendations displayed in order of importance

- [ ] **Accessibility**
  - Proper heading hierarchy in structured data
  - Alt text for all images
  - Screen reader friendly metadata descriptions

---

## Conclusion

This comprehensive integration guide provides everything needed to implement the Metadata Management module in your frontend application. The module handles all SEO metadata generation, from basic page metadata to complex structured data, ensuring optimal search engine optimization and social media sharing across the YesGoddess platform.

Key benefits:
- ✅ **Complete SEO Coverage:** Open Graph, Twitter Cards, JSON-LD, robots control
- ✅ **Type Safety:** Full TypeScript support with Zod validation
- ✅ **Performance Optimized:** Caching, rate limiting, efficient API design
- ✅ **User Friendly:** Comprehensive error handling and helpful utilities
- ✅ **Flexible Configuration:** Site-wide settings with per-page overrides

The module is production-ready and handles all edge cases, providing a robust foundation for SEO optimization across both the public website and admin backend.
