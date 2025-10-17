# Technical SEO Frontend Integration Guide (Part 1)
## API Endpoints & Core Functionality

🌐 **SHARED** - Used by both public-facing website and admin backend  
🔒 **ADMIN ONLY** - Internal operations and admin interface only  
⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 📋 Module Overview

The Technical SEO module provides comprehensive search engine optimization functionality including:
- **XML Sitemap Generation** - Dynamic sitemaps for search engines
- **Robots.txt Management** - Configurable crawling directives
- **301 Redirects** - Automatic redirect handling for slug changes
- **Canonical URLs** - Proper URL canonicalization
- **Pagination SEO** - SEO-optimized paginated content
- **Search Engine Submission** - Automatic sitemap submission

---

## 🚀 API Endpoints

### 1. Public SEO Endpoints

#### GET /api/blog/sitemap.xml 🌐
**Purpose**: Generate XML sitemap for published blog content

```typescript
// No request body - GET endpoint
interface SitemapResponse {
  // Returns XML content directly
  // Content-Type: application/xml
}
```

**Response Headers**:
```typescript
{
  'Content-Type': 'application/xml',
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=172800',
  'X-Robots-Tag': 'noindex'
}
```

**XML Structure**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://domain.com/blog</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <!-- Additional URLs... -->
</urlset>
```

---

#### GET /api/robots.txt 🌐
**Purpose**: Generate dynamic robots.txt from database configuration

```typescript
// No request body - GET endpoint
interface RobotsResponse {
  // Returns plain text content
  // Content-Type: text/plain
}
```

**Response Headers**:
```typescript
{
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200'
}
```

**Example Response**:
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /portal/
Disallow: /api/

Sitemap: https://domain.com/api/blog/sitemap.xml
```

---

### 2. Admin SEO Management Endpoints 🔒

#### POST /api/admin/seo
**Purpose**: Manual sitemap submission and SEO statistics

**Request Body**: None

**Response**:
```typescript
interface SEOSubmissionResponse {
  success: boolean;
  message: string;
  sitemapUrl: string;
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "Sitemap submitted successfully to search engines",
  "sitemapUrl": "https://domain.com/api/blog/sitemap.xml"
}
```

---

#### GET /api/admin/seo/stats 🔒
**Purpose**: Get comprehensive SEO statistics

**Response**:
```typescript
interface SEOStatsResponse {
  success: boolean;
  data: {
    sitemap: {
      url: string;
      publishedPosts: number;
    };
    redirects: {
      totalActive: number;
      totalHits: number;
      topPerformingRedirects: Array<{
        sourcePath: string;
        destinationPath: string;
        hitCount: number;
      }>;
    };
    robotsConfig: {
      activeRules: number;
    };
  };
}
```

---

#### POST /api/admin/seo/cleanup-redirects 🔒
**Purpose**: Clean up old or unused redirects

**Request Body**:
```typescript
interface RedirectCleanupRequest {
  olderThanDays?: number; // Default: 365
  maxHitCount?: number;   // Default: 0 (unused redirects)
  dryRun?: boolean;       // Default: false
}
```

**Response**:
```typescript
interface RedirectCleanupResponse {
  success: boolean;
  message: string;
  parameters: {
    olderThanDays: number;
    maxHitCount: number;
    dryRun: boolean;
  };
}
```

---

### 3. tRPC SEO Router Endpoints ⚡

Base URL: `/api/trpc/seo`

#### generateMetadata
**Purpose**: Generate comprehensive SEO metadata for content

**Input Schema**:
```typescript
interface GenerateMetadataInput {
  content: {
    title: string;
    slug: string;
    content?: string;
    excerpt?: string;
    seoTitle?: string;
    seoDescription?: string; // Max 200 chars
    seoKeywords?: string;
    featuredImageUrl?: string;
    tags?: string[];
    publishedAt?: string; // ISO datetime
    updatedAt?: string;   // ISO datetime
    type?: 'article' | 'website' | 'profile' | 'product';
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
  };
  path: string;
  config?: SEOConfig; // Optional override
}
```

**Response**:
```typescript
interface MetadataResponse {
  success: boolean;
  metadata: {
    title: string;
    description: string;
    canonical: string;
    robots: string;
    openGraph: {
      'og:title': string;
      'og:description': string;
      'og:url': string;
      'og:type': string;
      'og:image': string;
      'og:site_name': string;
      'og:locale': string;
      // Article-specific tags when type is 'article'
      'article:published_time'?: string;
      'article:modified_time'?: string;
      'article:author'?: string;
      'article:section'?: string;
      'article:tag'?: string[];
    };
    twitterCard: {
      'twitter:card': 'summary' | 'summary_large_image';
      'twitter:site'?: string;
      'twitter:creator'?: string;
      'twitter:title': string;
      'twitter:description': string;
      'twitter:image': string;
    };
    structuredData: Array<{
      '@context': string;
      '@type': string;
      [key: string]: any;
    }>;
  };
}
```

---

#### generateBlogPostMetadata
**Purpose**: Generate metadata specifically for blog posts

**Input**:
```typescript
interface BlogPostMetadataInput {
  postId: string; // CUID
  config?: SEOConfig;
}
```

**Response**: Same as `generateMetadata`

---

#### generatePaginationSEO
**Purpose**: Generate SEO tags for paginated content

**Input**:
```typescript
interface PaginationSEOInput {
  metadata: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  config: {
    baseUrl: string;
    basePath: string;
    pageParam?: string; // Default: 'page'
    noIndexThreshold?: number; // Default: 10
    titleTemplate?: string; // Default: '{baseTitle} - Page {page}'
    descriptionTemplate?: string;
  };
  baseTitle: string;
  baseDescription: string;
}
```

**Response**:
```typescript
interface PaginationSEOResponse {
  success: boolean;
  tags: {
    canonical: string;
    relNext?: string;
    relPrev?: string;
    metaRobots?: string; // e.g., "noindex,follow" for deep pages
    title: string;
    description: string;
  };
}
```

---

## 🔍 Query Parameters & Filters

### Sitemap Endpoint
- **No query parameters** - Automatically includes all published content
- **Automatic filtering**: Only published posts with `publishedAt <= now()`
- **Ordering**: Posts ordered by `publishedAt DESC`

### Pagination SEO
- **pageParam**: Query parameter name for pagination (default: "page")
- **Page validation**: Automatically sanitizes invalid page numbers
- **Deep page handling**: Pages > `noIndexThreshold` get `noindex,follow`

---

## 🔐 Authentication Requirements

| Endpoint | Authentication | Authorization |
|----------|----------------|---------------|
| `/api/blog/sitemap.xml` | ❌ None | Public access |
| `/api/robots.txt` | ❌ None | Public access |
| `/api/admin/seo` | ✅ JWT Required | Admin role only |
| `/api/admin/seo/stats` | ✅ JWT Required | Admin role only |
| `/api/admin/seo/cleanup-redirects` | ✅ JWT Required | Admin role only |
| `tRPC /seo/*` | ✅ JWT Required | Authenticated users |

### Authentication Headers
```typescript
// For admin endpoints
headers: {
  'Authorization': 'Bearer <JWT_TOKEN>',
  'Content-Type': 'application/json'
}
```

---

## 🚨 Error Handling

### Common HTTP Status Codes

| Code | Description | When It Occurs |
|------|-------------|----------------|
| `200` | Success | Request completed successfully |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | Insufficient permissions (non-admin) |
| `404` | Not Found | Blog post/category/author not found |
| `422` | Validation Error | Invalid input parameters |
| `500` | Internal Error | Database or service errors |

### tRPC Error Codes
```typescript
type TRPCErrorCode = 
  | 'NOT_FOUND'           // Entity doesn't exist
  | 'UNAUTHORIZED'        // Authentication failed
  | 'FORBIDDEN'           // Permission denied
  | 'BAD_REQUEST'         // Invalid input
  | 'INTERNAL_SERVER_ERROR' // System error
  | 'TIMEOUT'             // Request timeout
```

### Error Response Format
```typescript
// REST API Errors
interface ErrorResponse {
  success: false;
  error: string;
  details?: string; // Additional error context
}

// tRPC Errors
interface TRPCError {
  code: TRPCErrorCode;
  message: string;
  cause?: any; // Original error object
}
```

### Error Messages by Context

**Sitemap Generation**:
- `"Failed to generate sitemap"` - Database connection issues
- `"No published posts found"` - No content to include

**Robots.txt**:
- `"Failed to load robots configuration"` - Database error
- Falls back to default robots.txt on errors

**Redirect Management**:
- `"Invalid redirect: <details>"` - Validation failed
- `"Redirect loop detected"` - Circular redirect chain
- `"Source path already exists"` - Duplicate redirect

**Authentication**:
- `"Unauthorized"` - Missing/invalid token
- `"Admin access required"` - Insufficient privileges

---

Continue to [**Part 2: TypeScript Definitions & Business Logic**](./TECHNICAL_SEO_FRONTEND_INTEGRATION_GUIDE_PART2.md) →
