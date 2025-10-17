# Technical SEO Frontend Integration Guide (Part 2)
## TypeScript Definitions & Business Logic

🌐 **SHARED** - Used by both public-facing website and admin backend  
🔒 **ADMIN ONLY** - Internal operations and admin interface only  
⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 📝 TypeScript Type Definitions

### Core SEO Types

```typescript
// ============================================================================
// SEO Content Types
// ============================================================================

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

// ============================================================================
// Metadata Types
// ============================================================================

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

export interface TwitterCardTags {
  'twitter:card': 'summary' | 'summary_large_image' | 'app' | 'player';
  'twitter:site'?: string;
  'twitter:creator'?: string;
  'twitter:title': string;
  'twitter:description': string;
  'twitter:image': string;
  'twitter:image:alt'?: string;
}

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

export interface StructuredData {
  '@context': string;
  '@type': string;
  [key: string]: any;
}

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

// ============================================================================
// Pagination SEO Types
// ============================================================================

export interface PaginationMetadata {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationSEOTags {
  canonical: string;
  relNext?: string;
  relPrev?: string;
  metaRobots?: string;
  title: string;
  description: string;
}

export interface PaginationConfig {
  baseUrl: string;
  basePath: string;
  pageParam?: string; // Default: 'page'
  noIndexThreshold?: number; // Default: 10
  titleTemplate?: string; // Default: '{baseTitle} - Page {page}'
  descriptionTemplate?: string;
}

// ============================================================================
// Redirect Types
// ============================================================================

export interface BlogRedirect {
  id: string;
  sourcePath: string;
  destinationPath: string;
  redirectType: number; // Usually 301 or 302
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  hitCount: number;
  lastAccessedAt?: Date;
}

export interface CreateRedirectOptions {
  sourcePath: string;
  destinationPath: string;
  redirectType?: number; // Default: 301
  expiresAt?: Date;
  createdBy: string;
}

export interface RedirectLookupResult {
  found: boolean;
  destinationPath?: string;
  redirectType?: number;
  shouldTrackHit?: boolean;
  redirectId?: string;
}

// ============================================================================
// Robots Configuration Types
// ============================================================================

export interface RobotsConfig {
  id: string;
  userAgent: string; // Default: '*'
  directiveType: 'allow' | 'disallow' | 'crawl-delay' | 'sitemap' | 'host';
  path?: string;
  value?: string;
  priority: number; // Default: 0
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SEO Analysis Types
// ============================================================================

export interface SEOAnalysisResult {
  score: number; // 0-100
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    field?: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
  recommendations: Array<{
    message: string;
    type: string;
    field?: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  }>;
  metrics: {
    titleLength: number;
    descriptionLength: number;
    contentLength: number;
    keywordDensity: number;
    readabilityScore: number;
    imageCount: number;
    imagesWithAlt: number;
    internalLinks: number;
    externalLinks: number;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SEOStatsResponse {
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
}

// ============================================================================
// Search Engine Submission Types
// ============================================================================

export interface SearchEngineSubmission {
  engine: 'google' | 'bing';
  status: 'pending' | 'success' | 'failed';
  submittedAt: Date;
  response?: string;
  error?: string;
}
```

---

## 🏗️ Zod Validation Schemas

### Input Validation Schemas

```typescript
import { z } from 'zod';

// ============================================================================
// Content Validation
// ============================================================================

export const seoContentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  slug: z.string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  seoTitle: z.string().max(60, 'SEO title should be under 60 characters').optional(),
  seoDescription: z.string()
    .max(200, 'SEO description too long')
    .min(120, 'SEO description should be at least 120 characters')
    .optional(),
  seoKeywords: z.string().optional(),
  featuredImageUrl: z.string().url('Invalid image URL').optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  type: z.enum(['article', 'website', 'profile', 'product']).optional(),
});

// ============================================================================
// Configuration Validation
// ============================================================================

export const seoConfigSchema = z.object({
  siteTitle: z.string().min(1).max(60).optional(),
  siteDomain: z.string().min(1).optional(),
  siteUrl: z.string().url('Invalid site URL').optional(),
  defaultDescription: z.string().max(200).optional(),
  defaultImage: z.string().url('Invalid default image URL').optional(),
  twitterHandle: z.string()
    .regex(/^@?[A-Za-z0-9_]{1,15}$/, 'Invalid Twitter handle')
    .optional(),
  facebookAppId: z.string().optional(),
  organizationName: z.string().optional(),
  organizationLogo: z.string().url('Invalid logo URL').optional(),
  organizationUrl: z.string().url('Invalid organization URL').optional(),
  locale: z.string()
    .regex(/^[a-z]{2}_[A-Z]{2}$/, 'Invalid locale format')
    .optional(),
  alternateLocales: z.array(z.string()).optional(),
});

// ============================================================================
// Pagination Validation
// ============================================================================

export const paginationConfigSchema = z.object({
  baseUrl: z.string().url('Invalid base URL'),
  basePath: z.string().min(1, 'Base path required'),
  pageParam: z.string().min(1).optional().default('page'),
  noIndexThreshold: z.number().int().min(1).optional().default(10),
  titleTemplate: z.string().optional(),
  descriptionTemplate: z.string().optional(),
});

export const paginationMetadataSchema = z.object({
  currentPage: z.number().int().min(1, 'Current page must be at least 1'),
  totalPages: z.number().int().min(1, 'Total pages must be at least 1'),
  totalItems: z.number().int().min(0, 'Total items cannot be negative'),
  itemsPerPage: z.number().int().min(1, 'Items per page must be at least 1'),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

// ============================================================================
// Redirect Validation
// ============================================================================

export const createRedirectSchema = z.object({
  sourcePath: z.string()
    .min(1, 'Source path required')
    .max(600, 'Source path too long')
    .regex(/^\//, 'Source path must start with /'),
  destinationPath: z.string()
    .min(1, 'Destination path required')
    .max(600, 'Destination path too long')
    .regex(/^\//, 'Destination path must start with /'),
  redirectType: z.number().int().min(300).max(399).optional().default(301),
  expiresAt: z.string().datetime().optional(),
});

// ============================================================================
// Robots Configuration Validation
// ============================================================================

export const robotsConfigSchema = z.object({
  userAgent: z.string().min(1).max(100).optional().default('*'),
  directiveType: z.enum(['allow', 'disallow', 'crawl-delay', 'sitemap', 'host']),
  path: z.string().max(500).optional(),
  value: z.string().max(500).optional(),
  priority: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});
```

---

## 🧠 Business Logic & Validation Rules

### SEO Content Validation

#### Title Optimization
```typescript
// Business Rules for Titles
const titleRules = {
  minLength: 30,      // Minimum for SEO
  maxLength: 60,      // Maximum for SERP display
  optimalLength: 55,  // Sweet spot
  requiresKeyword: true, // Should contain primary keyword
};

// Validation Function
function validateTitle(title: string, keyword?: string): ValidationResult {
  const issues = [];
  
  if (title.length < titleRules.minLength) {
    issues.push({
      severity: 'warning',
      message: `Title too short (${title.length} chars). Aim for ${titleRules.minLength}+ characters.`
    });
  }
  
  if (title.length > titleRules.maxLength) {
    issues.push({
      severity: 'error',
      message: `Title too long (${title.length} chars). Keep under ${titleRules.maxLength} characters.`
    });
  }
  
  if (keyword && !title.toLowerCase().includes(keyword.toLowerCase())) {
    issues.push({
      severity: 'warning',
      message: 'Title should include the primary keyword.'
    });
  }
  
  return { isValid: issues.filter(i => i.severity === 'error').length === 0, issues };
}
```

#### Meta Description Rules
```typescript
const descriptionRules = {
  minLength: 120,     // Minimum for SEO value
  maxLength: 200,     // Maximum for SERP display
  optimalLength: 160, // Sweet spot
  requiresCallToAction: true,
};

function validateDescription(description: string): ValidationResult {
  const issues = [];
  
  if (description.length < descriptionRules.minLength) {
    issues.push({
      severity: 'warning',
      message: `Description too short. Aim for ${descriptionRules.minLength}+ characters.`
    });
  }
  
  if (description.length > descriptionRules.maxLength) {
    issues.push({
      severity: 'error',
      message: `Description too long. Keep under ${descriptionRules.maxLength} characters.`
    });
  }
  
  // Check for call-to-action words
  const ctaWords = ['learn', 'discover', 'find', 'get', 'read', 'explore', 'see', 'check'];
  const hasCallToAction = ctaWords.some(word => 
    description.toLowerCase().includes(word.toLowerCase())
  );
  
  if (!hasCallToAction) {
    issues.push({
      severity: 'info',
      message: 'Consider adding a call-to-action word to improve click-through rates.'
    });
  }
  
  return { isValid: issues.filter(i => i.severity === 'error').length === 0, issues };
}
```

#### Slug Validation
```typescript
const slugRules = {
  maxLength: 100,
  allowedChars: /^[a-z0-9-]+$/,
  noConsecutiveHyphens: true,
  noTrailingHyphens: true,
};

function validateSlug(slug: string): ValidationResult {
  const issues = [];
  
  if (!slugRules.allowedChars.test(slug)) {
    issues.push({
      severity: 'error',
      message: 'Slug can only contain lowercase letters, numbers, and hyphens.'
    });
  }
  
  if (slug.includes('--')) {
    issues.push({
      severity: 'warning',
      message: 'Avoid consecutive hyphens in slugs.'
    });
  }
  
  if (slug.startsWith('-') || slug.endsWith('-')) {
    issues.push({
      severity: 'error',
      message: 'Slug cannot start or end with a hyphen.'
    });
  }
  
  if (slug.length > slugRules.maxLength) {
    issues.push({
      severity: 'warning',
      message: `Slug too long (${slug.length} chars). Keep under ${slugRules.maxLength}.`
    });
  }
  
  return { isValid: issues.filter(i => i.severity === 'error').length === 0, issues };
}
```

### Pagination SEO Logic

#### Page Indexing Rules
```typescript
function generatePaginationRobots(
  currentPage: number, 
  totalPages: number, 
  noIndexThreshold = 10
): string {
  // First page: Allow normal indexing
  if (currentPage === 1) {
    return 'index,follow';
  }
  
  // Pages 2-10: No index but follow links
  if (currentPage <= noIndexThreshold) {
    return 'noindex,follow';
  }
  
  // Deep pages: No index, no follow
  return 'noindex,nofollow';
}
```

#### Canonical URL Logic
```typescript
function generatePaginationCanonical(
  baseUrl: string,
  basePath: string,
  currentPage: number,
  pageParam = 'page'
): string {
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  
  // First page canonical should not include page parameter
  if (currentPage === 1) {
    return `${cleanBaseUrl}${cleanPath}`;
  }
  
  // Subsequent pages include page parameter
  const separator = cleanPath.includes('?') ? '&' : '?';
  return `${cleanBaseUrl}${cleanPath}${separator}${pageParam}=${currentPage}`;
}
```

### Redirect Management Logic

#### Redirect Chain Resolution
```typescript
async function resolveRedirectChain(
  sourcePath: string,
  maxDepth = 5
): Promise<{ finalPath: string; chainLength: number; hasLoop: boolean }> {
  const visited = new Set<string>();
  let currentPath = sourcePath;
  let depth = 0;
  
  while (depth < maxDepth) {
    if (visited.has(currentPath)) {
      return { finalPath: currentPath, chainLength: depth, hasLoop: true };
    }
    
    visited.add(currentPath);
    
    const redirect = await findRedirect(currentPath);
    if (!redirect) {
      return { finalPath: currentPath, chainLength: depth, hasLoop: false };
    }
    
    currentPath = redirect.destinationPath;
    depth++;
  }
  
  return { finalPath: currentPath, chainLength: depth, hasLoop: false };
}
```

#### Automatic Redirect Creation on Slug Changes
```typescript
async function handleSlugChange(
  oldSlug: string,
  newSlug: string,
  userId: string
): Promise<void> {
  const oldPath = `/blog/${oldSlug}`;
  const newPath = `/blog/${newSlug}`;
  
  // Don't create redirect if slugs are the same
  if (oldSlug === newSlug) return;
  
  // Create 301 redirect
  await createRedirect({
    sourcePath: oldPath,
    destinationPath: newPath,
    redirectType: 301,
    createdBy: userId,
  });
  
  // Update any existing redirects that point to the old path
  await updateRedirectChains(oldPath, newPath);
}
```

---

## 🔄 State Machine Transitions

### Blog Post SEO States

```typescript
enum SEOState {
  DRAFT = 'draft',
  OPTIMIZING = 'optimizing',
  READY = 'ready',
  PUBLISHED = 'published',
  NEEDS_UPDATE = 'needs_update'
}

interface SEOTransition {
  from: SEOState;
  to: SEOState;
  trigger: string;
  conditions?: () => boolean;
}

const seoTransitions: SEOTransition[] = [
  {
    from: SEOState.DRAFT,
    to: SEOState.OPTIMIZING,
    trigger: 'start_optimization'
  },
  {
    from: SEOState.OPTIMIZING,
    to: SEOState.READY,
    trigger: 'optimization_complete',
    conditions: () => {
      // Must have title, description, and pass SEO score threshold
      return hasValidTitle() && hasValidDescription() && getSEOScore() >= 70;
    }
  },
  {
    from: SEOState.READY,
    to: SEOState.PUBLISHED,
    trigger: 'publish'
  },
  {
    from: SEOState.PUBLISHED,
    to: SEOState.NEEDS_UPDATE,
    trigger: 'content_changed'
  }
];
```

### Robots Configuration States

```typescript
enum RobotsRuleState {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SCHEDULED = 'scheduled',
  EXPIRED = 'expired'
}

function updateRobotsRuleState(rule: RobotsConfig): RobotsRuleState {
  if (!rule.isActive) return RobotsRuleState.INACTIVE;
  
  const now = new Date();
  if (rule.expiresAt && rule.expiresAt <= now) {
    return RobotsRuleState.EXPIRED;
  }
  
  return RobotsRuleState.ACTIVE;
}
```

---

Continue to [**Part 3: Implementation Guide & Error Handling**](./TECHNICAL_SEO_FRONTEND_INTEGRATION_GUIDE_PART3.md) →
