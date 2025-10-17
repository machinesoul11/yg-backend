# Technical SEO Frontend Integration Guide (Part 3)
## Implementation Guide & Advanced Features

🌐 **SHARED** - Used by both public-facing website and admin backend  
🔒 **ADMIN ONLY** - Internal operations and admin interface only  
⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 🛡️ Authorization & Permissions

### Role-Based Access Control

```typescript
enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER'
}

interface PermissionMatrix {
  [endpoint: string]: {
    allowedRoles: UserRole[];
    requiresOwnership?: boolean;
    rateLimits?: RateLimitConfig;
  };
}

const seoPermissions: PermissionMatrix = {
  // Public endpoints - no authentication required
  'GET /api/blog/sitemap.xml': {
    allowedRoles: [], // Public access
  },
  'GET /api/robots.txt': {
    allowedRoles: [], // Public access
  },
  
  // Admin-only endpoints
  'POST /api/admin/seo': {
    allowedRoles: [UserRole.ADMIN],
  },
  'GET /api/admin/seo/stats': {
    allowedRoles: [UserRole.ADMIN],
  },
  'POST /api/admin/seo/cleanup-redirects': {
    allowedRoles: [UserRole.ADMIN],
  },
  
  // tRPC endpoints - authenticated users
  'tRPC generateMetadata': {
    allowedRoles: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
  },
  'tRPC generateBlogPostMetadata': {
    allowedRoles: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
    requiresOwnership: true, // Can only access own posts
  },
  'tRPC analyzeSEO': {
    allowedRoles: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
  },
  'tRPC getConfig': {
    allowedRoles: [UserRole.ADMIN],
  },
  'tRPC updateConfig': {
    allowedRoles: [UserRole.ADMIN],
  },
};
```

### Field-Level Permissions

```typescript
interface SEOFieldPermissions {
  [field: string]: {
    read: UserRole[];
    write: UserRole[];
  };
}

const seoFieldPermissions: SEOFieldPermissions = {
  // Basic metadata - all authenticated users can read/write
  title: {
    read: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
    write: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
  },
  description: {
    read: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
    write: [UserRole.ADMIN, UserRole.CREATOR, UserRole.BRAND],
  },
  
  // Advanced SEO fields - admin and creators only
  seoTitle: {
    read: [UserRole.ADMIN, UserRole.CREATOR],
    write: [UserRole.ADMIN, UserRole.CREATOR],
  },
  seoDescription: {
    read: [UserRole.ADMIN, UserRole.CREATOR],
    write: [UserRole.ADMIN, UserRole.CREATOR],
  },
  seoKeywords: {
    read: [UserRole.ADMIN, UserRole.CREATOR],
    write: [UserRole.ADMIN, UserRole.CREATOR],
  },
  
  // System configuration - admin only
  robotsConfig: {
    read: [UserRole.ADMIN],
    write: [UserRole.ADMIN],
  },
  redirectManagement: {
    read: [UserRole.ADMIN],
    write: [UserRole.ADMIN],
  },
};
```

### Resource Ownership Rules

```typescript
interface OwnershipRule {
  resource: string;
  checkOwnership: (userId: string, resourceId: string) => Promise<boolean>;
}

const ownershipRules: OwnershipRule[] = [
  {
    resource: 'blogPost',
    checkOwnership: async (userId, postId) => {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true }
      });
      return post?.authorId === userId;
    }
  },
  {
    resource: 'category',
    checkOwnership: async (userId, categoryId) => {
      // Categories are managed by admins only
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });
      return user?.role === 'ADMIN';
    }
  }
];
```

---

## ⚡ Rate Limiting & Quotas

### Rate Limit Configuration

```typescript
interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

const seoRateLimits: Record<string, RateLimitConfig> = {
  // Public endpoints - generous limits
  'sitemap': {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 60,        // 60 requests per minute
  },
  'robots': {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 120,       // 120 requests per minute
  },
  
  // Admin endpoints - moderate limits
  'adminSEO': {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 30,        // 30 requests per minute
  },
  
  // tRPC endpoints - per-user limits
  'seoGeneration': {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 100,       // 100 requests per minute per user
    keyGenerator: (req) => `user:${req.user?.id}`,
  },
  
  // Heavy operations - strict limits
  'seoAnalysis': {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 10,        // 10 analysis requests per minute
    keyGenerator: (req) => `user:${req.user?.id}`,
  }
};
```

### Rate Limit Headers

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Total requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining in window
  'X-RateLimit-Reset': string;      // Window reset time (Unix timestamp)
  'X-RateLimit-Policy': string;     // Rate limit policy identifier
}

// Example response headers
const rateLimitHeaders: RateLimitHeaders = {
  'X-RateLimit-Limit': '100',
  'X-RateLimit-Remaining': '95',
  'X-RateLimit-Reset': '1640995200',
  'X-RateLimit-Policy': '100;w=60'
};
```

### Rate Limit Error Responses

```typescript
interface RateLimitError {
  success: false;
  error: 'RATE_LIMIT_EXCEEDED';
  message: string;
  retryAfter: number; // Seconds until next request allowed
  limit: number;
  windowMs: number;
}

// Example rate limit error
const rateLimitError: RateLimitError = {
  success: false,
  error: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests. Please try again later.',
  retryAfter: 45,
  limit: 100,
  windowMs: 60000
};
```

---

## 📁 File Upload Handling

### SEO Image Upload Flow

**Note**: The Technical SEO module doesn't directly handle file uploads but integrates with the existing media management system.

```typescript
interface SEOImageUploadFlow {
  // Step 1: Generate signed URL for direct upload
  generateSignedUrl: (params: {
    fileName: string;
    fileType: string;
    purpose: 'og-image' | 'featured-image' | 'logo';
  }) => Promise<{
    signedUrl: string;
    publicUrl: string;
    uploadId: string;
  }>;
  
  // Step 2: Frontend uploads directly to storage
  // (Using fetch or axios to upload to signed URL)
  
  // Step 3: Confirm upload completion
  confirmUpload: (uploadId: string) => Promise<{
    success: boolean;
    publicUrl: string;
    optimizedVariants?: string[];
  }>;
}
```

### Image Optimization for SEO

```typescript
interface SEOImageRequirements {
  openGraph: {
    minWidth: 1200;
    minHeight: 630;
    aspectRatio: '1.91:1';
    maxFileSize: 5 * 1024 * 1024; // 5MB
    formats: ['jpg', 'png', 'webp'];
  };
  twitter: {
    minWidth: 1200;
    minHeight: 600;
    aspectRatio: '2:1';
    maxFileSize: 5 * 1024 * 1024; // 5MB
    formats: ['jpg', 'png', 'webp'];
  };
  favicon: {
    sizes: [16, 32, 48, 64, 96, 128, 192, 256, 512];
    format: 'ico' | 'png';
    maxFileSize: 1 * 1024 * 1024; // 1MB
  };
}
```

---

## 🔄 Real-time Updates

### Webhook Events

```typescript
enum SEOWebhookEvent {
  // Content events
  POST_PUBLISHED = 'seo.post.published',
  POST_UPDATED = 'seo.post.updated',
  POST_SLUG_CHANGED = 'seo.post.slug_changed',
  
  // Sitemap events
  SITEMAP_GENERATED = 'seo.sitemap.generated',
  SITEMAP_SUBMITTED = 'seo.sitemap.submitted',
  
  // Redirect events
  REDIRECT_CREATED = 'seo.redirect.created',
  REDIRECT_HIT = 'seo.redirect.hit',
  
  // Robots events
  ROBOTS_UPDATED = 'seo.robots.updated',
}

interface SEOWebhookPayload {
  event: SEOWebhookEvent;
  timestamp: string;
  data: {
    postId?: string;
    redirectId?: string;
    oldSlug?: string;
    newSlug?: string;
    sitemapUrl?: string;
    userAgent?: string;
    [key: string]: any;
  };
}

// Webhook endpoint configuration
interface WebhookConfig {
  url: string;
  events: SEOWebhookEvent[];
  headers?: Record<string, string>;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
}
```

### Server-Sent Events (SSE)

```typescript
// SSE endpoint for real-time SEO updates
// GET /api/seo/events

interface SEOSSEEvent {
  type: 'seo-analysis' | 'sitemap-update' | 'redirect-created';
  data: {
    postId?: string;
    score?: number;
    issues?: string[];
    recommendations?: string[];
    sitemapUrl?: string;
    redirectCount?: number;
  };
}

// Frontend SSE connection
const seoEventSource = new EventSource('/api/seo/events');

seoEventSource.addEventListener('seo-analysis', (event) => {
  const data = JSON.parse(event.data) as SEOSSEEvent['data'];
  updateSEODashboard(data);
});
```

### Polling Recommendations

```typescript
interface PollingStrategy {
  endpoint: string;
  intervalMs: number;
  condition: string;
  maxPolls?: number;
}

const pollingStrategies: PollingStrategy[] = [
  {
    endpoint: '/api/admin/seo/stats',
    intervalMs: 30 * 1000, // 30 seconds
    condition: 'user is on admin SEO dashboard',
    maxPolls: 120, // Stop after 1 hour
  },
  {
    endpoint: '/api/trpc/seo.analyzeSEO',
    intervalMs: 5 * 1000, // 5 seconds
    condition: 'SEO analysis is in progress',
    maxPolls: 60, // Stop after 5 minutes
  },
  {
    endpoint: '/api/admin/seo/stats',
    intervalMs: 60 * 1000, // 1 minute
    condition: 'sitemap submission in progress',
    maxPolls: 30, // Stop after 30 minutes
  }
];
```

---

## 📄 Pagination & Filtering

### Pagination Format

The Technical SEO module uses **cursor-based pagination** for optimal performance:

```typescript
interface CursorPaginationRequest {
  cursor?: string;    // Base64 encoded cursor
  limit: number;      // Max 100
  direction: 'forward' | 'backward';
}

interface CursorPaginationResponse<T> {
  data: T[];
  pagination: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextCursor?: string;
    previousCursor?: string;
    totalCount?: number; // Only for first page
  };
}

// Example: Get redirects with pagination
interface GetRedirectsRequest extends CursorPaginationRequest {
  filters?: {
    isActive?: boolean;
    redirectType?: number;
    createdAfter?: string;
    createdBefore?: string;
    sourcePath?: string;
  };
  orderBy?: {
    field: 'createdAt' | 'hitCount' | 'lastAccessedAt';
    direction: 'asc' | 'desc';
  };
}
```

### Available Filters

#### Blog Post SEO Filters
```typescript
interface BlogPostSEOFilters {
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  seoScore?: {
    min?: number; // 0-100
    max?: number;
  };
  hasIssues?: boolean;
  authorId?: string;
  categoryId?: string;
  tags?: string[];
  publishedAfter?: string;
  publishedBefore?: string;
  lastOptimizedAfter?: string;
  lastOptimizedBefore?: string;
}
```

#### Redirect Filters
```typescript
interface RedirectFilters {
  isActive?: boolean;
  redirectType?: 301 | 302 | 303 | 307 | 308;
  hasExpiry?: boolean;
  hitCountMin?: number;
  hitCountMax?: number;
  createdBy?: string;
  sourcePath?: string; // Partial match
  destinationPath?: string; // Partial match
  createdAfter?: string;
  createdBefore?: string;
  lastAccessedAfter?: string;
  lastAccessedBefore?: string;
}
```

#### Robots Configuration Filters
```typescript
interface RobotsConfigFilters {
  userAgent?: string;
  directiveType?: 'allow' | 'disallow' | 'crawl-delay' | 'sitemap' | 'host';
  isActive?: boolean;
  createdBy?: string;
  path?: string; // Partial match
  createdAfter?: string;
  createdBefore?: string;
}
```

### Sorting Options

```typescript
interface SortingOptions {
  // Blog posts
  blogPosts: {
    createdAt: 'asc' | 'desc';
    updatedAt: 'asc' | 'desc';
    publishedAt: 'asc' | 'desc';
    seoScore: 'asc' | 'desc';
    title: 'asc' | 'desc';
    hitCount: 'asc' | 'desc'; // For redirect analytics
  };
  
  // Redirects
  redirects: {
    createdAt: 'asc' | 'desc';
    hitCount: 'asc' | 'desc';
    lastAccessedAt: 'asc' | 'desc';
    sourcePath: 'asc' | 'desc';
    destinationPath: 'asc' | 'desc';
  };
  
  // Robots config
  robotsConfig: {
    priority: 'asc' | 'desc';
    createdAt: 'asc' | 'desc';
    userAgent: 'asc' | 'desc';
    directiveType: 'asc' | 'desc';
  };
}
```

---

## 🔧 Frontend Implementation Checklist

### Phase 1: Core Integration ✅

**Essential API Client Setup**
- [ ] Create TypeScript API client with proper error handling
- [ ] Implement JWT token management and refresh logic
- [ ] Set up rate limiting awareness in client
- [ ] Add request/response logging for debugging

**Basic SEO Functionality**
- [ ] Implement metadata generation for blog posts
- [ ] Add SEO preview component (Google SERP preview)
- [ ] Create basic SEO score display
- [ ] Implement slug validation and generation

**Public Endpoints**
- [ ] Integrate sitemap.xml endpoint (ensure proper caching)
- [ ] Verify robots.txt endpoint functionality
- [ ] Add error fallbacks for public endpoints

### Phase 2: Admin Interface 🔒

**SEO Dashboard**
- [ ] Create admin SEO statistics dashboard
- [ ] Implement redirect management interface
- [ ] Add robots.txt configuration UI
- [ ] Build sitemap submission controls

**Content Management**
- [ ] Add SEO optimization sidebar to post editor
- [ ] Implement real-time SEO analysis display
- [ ] Create bulk SEO operations interface
- [ ] Add SEO recommendations panel

**Analytics Integration**
- [ ] Display redirect hit analytics
- [ ] Show SEO score trends
- [ ] Implement performance metrics display
- [ ] Add export functionality for SEO data

### Phase 3: Advanced Features ⚡

**Pagination SEO**
- [ ] Implement pagination SEO tag generation
- [ ] Add canonical URL management for paginated content
- [ ] Create rel="next/prev" link handling
- [ ] Implement deep page indexing controls

**Real-time Features**
- [ ] Set up Server-Sent Events for live updates
- [ ] Implement webhook handling for external integrations
- [ ] Add polling strategies for long-running operations
- [ ] Create notification system for SEO alerts

**Performance Optimization**
- [ ] Implement proper caching strategies
- [ ] Add optimistic updates for better UX
- [ ] Create background processing indicators
- [ ] Optimize bundle size for SEO components

### Phase 4: User Experience 🎨

**SEO Guidance**
- [ ] Add contextual help and tooltips
- [ ] Create SEO best practices guide
- [ ] Implement progressive disclosure for advanced features
- [ ] Add onboarding flow for SEO features

**Validation & Feedback**
- [ ] Implement real-time validation feedback
- [ ] Add progress indicators for SEO optimization
- [ ] Create clear error messages and recovery paths
- [ ] Implement success states and confirmations

**Accessibility**
- [ ] Ensure keyboard navigation for all SEO controls
- [ ] Add proper ARIA labels and descriptions
- [ ] Implement screen reader friendly SEO summaries
- [ ] Test with accessibility tools

---

## 🚨 Edge Cases & Error Recovery

### Common Edge Cases

#### Redirect Loops
```typescript
// Detection and prevention
interface RedirectLoop {
  detected: boolean;
  chain: string[];
  breakPoint?: string;
}

async function detectRedirectLoop(sourcePath: string): Promise<RedirectLoop> {
  const visited = new Set<string>();
  const chain: string[] = [];
  let current = sourcePath;
  
  while (current) {
    if (visited.has(current)) {
      return {
        detected: true,
        chain,
        breakPoint: current
      };
    }
    
    visited.add(current);
    chain.push(current);
    
    const redirect = await findRedirect(current);
    if (!redirect) break;
    
    current = redirect.destinationPath;
  }
  
  return { detected: false, chain };
}
```

#### Sitemap Generation Failures
```typescript
interface SitemapFallback {
  useCache: boolean;
  generateMinimal: boolean;
  notifyAdmin: boolean;
}

async function generateSitemapWithFallback(): Promise<string> {
  try {
    return await generateFullSitemap();
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    
    // Try cached version first
    const cached = await getCachedSitemap();
    if (cached && isRecentEnough(cached.timestamp)) {
      return cached.content;
    }
    
    // Generate minimal sitemap as last resort
    return generateMinimalSitemap();
  }
}
```

#### Database Connectivity Issues
```typescript
interface DatabaseFallback {
  useMemoryCache: boolean;
  degradedMode: boolean;
  offlineContent: boolean;
}

async function handleDatabaseFailure<T>(
  operation: () => Promise<T>,
  fallback: () => T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isDatabaseError(error)) {
      console.warn('Database unavailable, using fallback:', error.message);
      return fallback();
    }
    throw error;
  }
}
```

### Error Recovery Strategies

```typescript
interface ErrorRecoveryStrategy {
  retryable: boolean;
  maxRetries: number;
  backoffMs: number;
  fallbackAction?: () => Promise<void>;
  userNotification?: string;
}

const errorStrategies: Record<string, ErrorRecoveryStrategy> = {
  'SITEMAP_GENERATION_FAILED': {
    retryable: true,
    maxRetries: 3,
    backoffMs: 5000,
    fallbackAction: async () => {
      await generateMinimalSitemap();
    },
    userNotification: 'Sitemap generation encountered issues but a basic version is available.'
  },
  
  'SEARCH_ENGINE_SUBMISSION_FAILED': {
    retryable: true,
    maxRetries: 5,
    backoffMs: 30000,
    userNotification: 'Search engine submission will be retried automatically.'
  },
  
  'REDIRECT_CHAIN_TOO_LONG': {
    retryable: false,
    maxRetries: 0,
    backoffMs: 0,
    fallbackAction: async () => {
      await breakRedirectChain();
    },
    userNotification: 'Redirect chain has been simplified to prevent loops.'
  }
};
```

---

## 📊 UX Considerations

### Progressive Enhancement
- **Core functionality** works without JavaScript
- **Enhanced features** available with JavaScript enabled
- **Graceful degradation** for older browsers
- **Offline capabilities** where appropriate

### Performance Guidelines
- **Lazy load** SEO analysis components
- **Debounce** real-time validation (500ms)
- **Cache** frequently accessed SEO data
- **Paginate** large datasets (50-100 items per page)

### User Feedback
- **Loading states** for all async operations
- **Progress indicators** for long-running tasks
- **Success/error notifications** with clear actions
- **Contextual help** for complex SEO concepts

---

**🎯 This completes the Technical SEO Frontend Integration Guide. Your frontend team now has everything needed to implement the UI without additional clarification questions.**

← Back to [**Part 1: API Endpoints**](./TECHNICAL_SEO_FRONTEND_INTEGRATION_GUIDE_PART1.md) | [**Part 2: TypeScript Definitions**](./TECHNICAL_SEO_FRONTEND_INTEGRATION_GUIDE_PART2.md)
