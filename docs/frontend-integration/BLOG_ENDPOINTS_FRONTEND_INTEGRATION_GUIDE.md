# Core Blog Endpoints - Frontend Integration Guide 📝

> **Classification: 🌐 SHARED** - Used by both public-facing website and admin backend

This guide provides comprehensive documentation for integrating the Core Blog Endpoints module into the frontend. The backend provides both **tRPC** and **REST** endpoints for maximum flexibility.

---

## 1. API Endpoints Overview

### tRPC Endpoints (Recommended for Admin/Protected Areas)
All tRPC endpoints are accessible at `/api/trpc/blog.*`:

| Endpoint | Method | Access Level | Description |
|----------|--------|--------------|-------------|
| `blog.posts.create` | Mutation | 🔒 Protected | Create new blog post |
| `blog.posts.update` | Mutation | 🔒 Protected | Update existing post |
| `blog.posts.getBySlug` | Query | 🌐 Public | Get post by slug |
| `blog.posts.list` | Query | 🌐 Public | List posts with filters |
| `blog.posts.publish` | Mutation | 🔒 Protected | Publish draft post |
| `blog.posts.schedule` | Mutation | 🔒 Protected | Schedule post publication |
| `blog.posts.delete` | Mutation | 🔒 Protected | Soft delete post |
| `blog.revisions.list` | Query | 🔒 Protected | Get revision history |

### REST Endpoints (Optimized for Public Access)
Public-facing REST APIs with optimized caching:

| Endpoint | Method | Access Level | Description |
|----------|--------|--------------|-------------|
| `GET /api/blog/posts` | GET | 🌐 Public | Paginated blog posts listing |
| `GET /api/blog/posts/[slug]` | GET | 🌐 Public | Individual blog post |
| `GET /api/blog/sitemap.xml` | GET | 🌐 Public | Blog sitemap for SEO |
| `GET /api/blog/rss.xml` | GET | 🌐 Public | RSS feed |

---

## 2. TypeScript Type Definitions

### Core Types

```typescript
// Post Status Enum
export type PostStatus = 
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'SCHEDULED'
  | 'ARCHIVED';

// Main Post Interface
export interface Post {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  authorId: string;
  assignedToId: string | null;
  categoryId: string | null;
  featuredImageUrl: string | null;
  status: PostStatus;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  readTimeMinutes: number;
  viewCount: number;
  isFeatured: boolean;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  
  // Relations
  author?: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  } | null;
  category?: Category | null;
  revisions?: PostRevision[];
  revisionCount?: number;
}

// Category Interface
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentCategoryId: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  parentCategory?: Category | null;
  childCategories?: Category[];
  posts?: Post[];
  postCount?: number;
}

// Post Revision Interface
export interface PostRevision {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  revisionNote: string | null;
  createdAt: Date;
  
  // Relations
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
}
```

### Request/Response Schemas

```typescript
// Create Post Request
export interface CreatePostRequest {
  title: string;
  slug?: string; // Auto-generated if not provided
  content: string;
  excerpt?: string; // Auto-generated if not provided
  assignedToId?: string;
  categoryId?: string;
  featuredImageUrl?: string;
  status?: PostStatus; // Default: 'DRAFT'
  publishedAt?: string; // ISO datetime string
  scheduledFor?: string; // ISO datetime string
  isFeatured?: boolean; // Default: false
  tags?: string[]; // Default: []
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
}

// Update Post Request
export interface UpdatePostRequest extends Partial<CreatePostRequest> {
  revisionNote?: string; // Track reason for changes
}

// Posts List Query Parameters
export interface PostsQueryParams {
  // Pagination
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  
  // Filtering
  status?: PostStatus;
  authorId?: string;
  categoryId?: string;
  published?: boolean;
  tags?: string[];
  search?: string; // Full-text search
  
  // Date Range
  dateRange?: {
    start: string; // ISO datetime
    end: string; // ISO datetime
  };
  
  // Sorting
  sortBy?: 'title' | 'publishedAt' | 'createdAt' | 'updatedAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  
  // Include Relations
  includeRevisions?: boolean;
}

// Posts Response
export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Public REST API Response (Optimized)
export interface PublicPostResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string | null;
    featured_image_url: string | null;
    published_at: string; // ISO string
    read_time_minutes: number;
    view_count: number;
    is_featured: boolean;
    tags: string[];
    author: {
      id: string;
      name: string;
      avatar: string | null;
    } | null;
    category: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    } | null;
    seo: {
      title: string;
      description: string;
      keywords: string | null;
    };
    related_posts: PublicPostSummary[];
  };
}

export interface PublicPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  published_at: string;
  read_time_minutes: number;
  view_count: number;
  is_featured: boolean;
  tags: string[];
  author: {
    name: string;
    avatar: string | null;
  };
  category: {
    name: string;
    slug: string;
  } | null;
}
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

// Constants
export const MAX_TITLE_LENGTH = 500;
export const MAX_EXCERPT_LENGTH = 1000;
export const MAX_CONTENT_LENGTH = 100000;
export const MAX_SEO_TITLE_LENGTH = 70;
export const MAX_SEO_DESCRIPTION_LENGTH = 160;
export const MAX_TAGS_COUNT = 20;
export const MAX_TAG_LENGTH = 50;

export const postStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']);

export const createPostSchema = z.object({
  title: z.string()
    .min(1, 'Post title is required')
    .max(MAX_TITLE_LENGTH, `Title must not exceed ${MAX_TITLE_LENGTH} characters`)
    .trim(),
  slug: z.string().optional(),
  content: z.string()
    .min(1, 'Post content is required')
    .max(MAX_CONTENT_LENGTH, `Content must not exceed ${MAX_CONTENT_LENGTH} characters`),
  excerpt: z.string()
    .max(MAX_EXCERPT_LENGTH, `Excerpt must not exceed ${MAX_EXCERPT_LENGTH} characters`)
    .trim()
    .optional(),
  categoryId: z.string().cuid('Invalid category ID').optional(),
  featuredImageUrl: z.string().url('Invalid featured image URL').optional(),
  status: postStatusSchema.default('DRAFT'),
  publishedAt: z.string().datetime('Invalid published date').optional(),
  scheduledFor: z.string().datetime('Invalid scheduled date').optional(),
  isFeatured: z.boolean().default(false),
  tags: z.array(
    z.string()
      .min(1, 'Tag cannot be empty')
      .max(MAX_TAG_LENGTH, `Tag must not exceed ${MAX_TAG_LENGTH} characters`)
      .trim()
  ).max(MAX_TAGS_COUNT, `Maximum ${MAX_TAGS_COUNT} tags allowed`).default([]),
  seoTitle: z.string()
    .max(MAX_SEO_TITLE_LENGTH, `SEO title must not exceed ${MAX_SEO_TITLE_LENGTH} characters`)
    .trim()
    .optional(),
  seoDescription: z.string()
    .max(MAX_SEO_DESCRIPTION_LENGTH, `SEO description must not exceed ${MAX_SEO_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  seoKeywords: z.string()
    .max(500, 'SEO keywords must not exceed 500 characters')
    .trim()
    .optional(),
});

export const updatePostSchema = createPostSchema.partial().extend({
  revisionNote: z.string()
    .max(500, 'Revision note must not exceed 500 characters')
    .trim()
    .optional(),
});
```

---

## 3. Business Logic & Validation Rules

### Field Validation Requirements

| Field | Required | Max Length | Validation Rules |
|-------|----------|------------|------------------|
| `title` | ✅ | 500 chars | Non-empty, trimmed |
| `content` | ✅ | 100,000 chars | Non-empty, HTML allowed |
| `excerpt` | ❌ | 1,000 chars | Auto-generated if empty |
| `slug` | ❌ | 150 chars | Auto-generated, lowercase, hyphens only |
| `tags` | ❌ | 20 tags max | 50 chars per tag, trimmed |
| `seoTitle` | ❌ | 70 chars | SEO optimization |
| `seoDescription` | ❌ | 160 chars | SEO optimization |
| `seoKeywords` | ❌ | 500 chars | Comma-separated |

### Business Rules

#### Status Transitions
```typescript
// Valid status transitions
const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  'DRAFT': ['PENDING_REVIEW', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'],
  'PENDING_REVIEW': ['DRAFT', 'APPROVED', 'REJECTED'],
  'APPROVED': ['PUBLISHED', 'SCHEDULED', 'DRAFT'],
  'REJECTED': ['DRAFT'],
  'PUBLISHED': ['ARCHIVED', 'DRAFT'], // Can unpublish
  'SCHEDULED': ['DRAFT', 'PUBLISHED'], // Can unschedule or publish immediately
  'ARCHIVED': ['DRAFT', 'PUBLISHED'], // Can restore
};
```

#### Automatic Content Processing
- **Slug Generation**: Auto-generated from title if not provided
- **Excerpt Generation**: Auto-generated from content (first 160 characters) if not provided
- **Read Time Calculation**: Calculated at 200 words per minute
- **SEO Title**: Defaults to post title if not provided
- **SEO Description**: Defaults to excerpt if not provided

#### Publishing Rules
- **Immediate Publishing**: Set `status: 'PUBLISHED'` and optionally `publishedAt`
- **Scheduled Publishing**: Set `status: 'SCHEDULED'` and `scheduledFor` (must be future date)
- **Draft Saving**: Set `status: 'DRAFT'` (default)

### Derived Values
```typescript
// These are calculated automatically by the backend
interface DerivedFields {
  slug: string; // Generated from title
  excerpt: string; // Generated from content if not provided
  readTimeMinutes: number; // Calculated from content length
  seoTitle: string; // Defaults to title
  seoDescription: string; // Defaults to excerpt
}
```

---

## 4. Error Handling

### HTTP Status Codes

| Status | Code | Description | When It Occurs |
|--------|------|-------------|----------------|
| ✅ Success | 200 | OK | Successful requests |
| ✅ Created | 201 | Created | Successful post creation |
| ❌ Bad Request | 400 | Validation Error | Invalid input data |
| ❌ Unauthorized | 401 | Authentication Required | Missing/invalid JWT token |
| ❌ Forbidden | 403 | Access Denied | Insufficient permissions |
| ❌ Not Found | 404 | Resource Not Found | Post/category doesn't exist |
| ❌ Conflict | 409 | Duplicate/Conflict | Duplicate slug, category in use |
| ❌ Internal Error | 500 | Server Error | Unexpected backend error |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string; // Human-readable error message
  code?: string; // Machine-readable error code
  details?: any; // Additional error context
}

// Validation Error Details
interface ValidationErrorResponse extends ErrorResponse {
  details: {
    field: string;
    message: string;
    value?: any;
  }[];
}
```

### Specific Error Codes

```typescript
// Blog-specific error codes
export const BLOG_ERROR_CODES = {
  // Validation
  'BLOG_VALIDATION_ERROR': 'One or more fields contain invalid data',
  
  // Not Found
  'POST_NOT_FOUND': 'The requested blog post could not be found',
  'CATEGORY_NOT_FOUND': 'The specified category does not exist',
  'POST_REVISION_NOT_FOUND': 'The post revision could not be found',
  
  // Conflicts
  'DUPLICATE_SLUG': 'A post with this URL slug already exists',
  'CATEGORY_IN_USE': 'Cannot delete category - posts are still assigned to it',
  'CIRCULAR_CATEGORY_REFERENCE': 'Cannot create circular category hierarchy',
  
  // Permissions
  'INSUFFICIENT_PERMISSIONS': 'You do not have permission to perform this action',
  'POST_NOT_PUBLISHED': 'This post is not available for public viewing',
  
  // Business Logic
  'INVALID_STATUS_TRANSITION': 'Cannot change post status from current state',
  'SCHEDULED_DATE_IN_PAST': 'Scheduled publication date must be in the future',
  'POST_ALREADY_PUBLISHED': 'This post is already published',
  'POST_CONTENT_TOO_LONG': 'Post content exceeds maximum length',
  'TOO_MANY_TAGS': 'Too many tags - maximum allowed is 20',
  
  // External Services
  'SLUG_GENERATION_ERROR': 'Could not generate URL slug from title',
  'IMAGE_UPLOAD_ERROR': 'Failed to upload featured image',
  'CONTENT_VALIDATION_ERROR': 'Post content contains invalid HTML or formatting',
  
  // Database
  'BLOG_DATABASE_ERROR': 'A database error occurred while processing your request',
} as const;
```

### Error Handling Examples

```typescript
// tRPC Error Handling
try {
  const post = await trpc.blog.posts.create.mutate({
    title: "My Blog Post",
    content: "Post content...",
  });
} catch (error) {
  if (error.data?.code === 'DUPLICATE_SLUG') {
    // Handle duplicate slug - suggest alternative
  } else if (error.data?.code === 'BLOG_VALIDATION_ERROR') {
    // Handle validation errors - show field-specific messages
  } else {
    // Handle unexpected errors
  }
}

// REST API Error Handling
const response = await fetch('/api/blog/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(postData),
});

if (!response.ok) {
  const error = await response.json();
  
  switch (response.status) {
    case 400:
      // Validation error - show specific field errors
      break;
    case 401:
      // Redirect to login
      break;
    case 403:
      // Show insufficient permissions message
      break;
    case 409:
      // Handle conflicts (duplicate slug, etc.)
      break;
    default:
      // Show generic error message
  }
}
```

---

## 5. Authorization & Permissions

### User Roles

| Role | Level | Description |
|------|-------|-------------|
| **ADMIN** | 🔒 Highest | Full access to all blog operations |
| **CREATOR** | 🔒 High | Can create, edit, and manage own posts |
| **BRAND** | 🔒 Medium | Can view and comment on posts |
| **VIEWER** | 🌐 Public | Can view published posts only |

### Endpoint Permissions

| Endpoint | ADMIN | CREATOR | BRAND | VIEWER | Anonymous |
|----------|-------|---------|-------|--------|-----------|
| Create Post | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Own Post | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Any Post | ✅ | ❌ | ❌ | ❌ | ❌ |
| Publish Post | ✅ | ✅* | ❌ | ❌ | ❌ |
| Delete Post | ✅ | ✅* | ❌ | ❌ | ❌ |
| View Published | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Drafts | ✅ | ✅* | ❌ | ❌ | ❌ |
| Manage Categories | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Revisions | ✅ | ✅* | ❌ | ❌ | ❌ |

*\* Only for own posts*

### Resource Ownership Rules

```typescript
// Post ownership validation
interface PostOwnership {
  authorId: string; // Post creator
  assignedToId?: string; // Assigned editor
  
  // Permission checks
  canEdit: (userId: string, userRole: string) => boolean;
  canDelete: (userId: string, userRole: string) => boolean;
  canPublish: (userId: string, userRole: string) => boolean;
}

// Implementation example
const checkPostPermissions = (post: Post, user: User): PostPermissions => {
  const isOwner = post.authorId === user.id;
  const isAssigned = post.assignedToId === user.id;
  const isAdmin = user.role === 'ADMIN';
  
  return {
    canView: isPublished || isOwner || isAssigned || isAdmin,
    canEdit: isOwner || isAssigned || isAdmin,
    canDelete: isOwner || isAdmin,
    canPublish: isOwner || isAssigned || isAdmin,
  };
};
```

### Field-Level Permissions

```typescript
// Some fields require higher permissions
interface FieldPermissions {
  // Admin-only fields
  assignedToId: 'ADMIN';
  
  // Creator+ fields
  status: 'CREATOR' | 'ADMIN';
  publishedAt: 'CREATOR' | 'ADMIN';
  scheduledFor: 'CREATOR' | 'ADMIN';
  isFeatured: 'CREATOR' | 'ADMIN';
  
  // All authenticated users
  title: 'CREATOR' | 'BRAND' | 'ADMIN';
  content: 'CREATOR' | 'BRAND' | 'ADMIN';
  tags: 'CREATOR' | 'BRAND' | 'ADMIN';
}
```

---

## 6. Rate Limiting & Quotas

### Rate Limits per Endpoint

| Endpoint Type | Rate Limit | Window | Applies To |
|---------------|------------|--------|------------|
| **Public Read** (GET /api/blog/posts) | 100 req/min | 1 minute | Per IP |
| **Public Post** (GET /api/blog/posts/[slug]) | 200 req/min | 1 minute | Per IP |
| **tRPC Create** (blog.posts.create) | 10 req/min | 1 minute | Per User |
| **tRPC Update** (blog.posts.update) | 30 req/min | 1 minute | Per User |
| **tRPC Delete** (blog.posts.delete) | 5 req/min | 1 minute | Per User |
| **Image Upload** | 5 req/min | 1 minute | Per User |

### Rate Limit Headers

```typescript
// Response headers to check
interface RateLimitHeaders {
  'X-RateLimit-Limit': string; // Maximum requests allowed
  'X-RateLimit-Remaining': string; // Requests remaining in window
  'X-RateLimit-Reset': string; // Unix timestamp when window resets
  'X-RateLimit-Retry-After': string; // Seconds to wait (if rate limited)
}

// Example: Check rate limit status
const checkRateLimit = (response: Response) => {
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
  const reset = parseInt(response.headers.get('X-RateLimit-Reset') || '0');
  
  if (remaining <= 5) {
    // Warn user they're approaching rate limit
    showRateLimitWarning(remaining, reset);
  }
};
```

### Usage Quotas

```typescript
// Per-user quotas (daily limits)
interface UserQuotas {
  CREATOR: {
    postsPerDay: 10;
    imageUploadsPerDay: 50;
    revisionsPerPost: 100;
  };
  ADMIN: {
    postsPerDay: -1; // Unlimited
    imageUploadsPerDay: -1; // Unlimited
    revisionsPerPost: -1; // Unlimited
  };
}
```

---

## 7. File Uploads

### Featured Image Upload Flow

```typescript
// 1. Upload featured image
const uploadFeaturedImage = async (postId: string, file: File) => {
  const formData = new FormData();
  formData.append('image', file);
  
  const uploadResult = await trpc.blog.posts.uploadFeaturedImage.mutate({
    postId,
    imageFile: {
      buffer: await file.arrayBuffer(),
      mimetype: file.type,
      originalname: file.name,
      size: file.size,
    },
  });
  
  return uploadResult.url;
};

// 2. Remove featured image
const removeFeaturedImage = async (postId: string) => {
  await trpc.blog.posts.removeFeaturedImage.mutate({ postId });
};
```

### File Restrictions

| Property | Limit | Notes |
|----------|-------|-------|
| **File Size** | 5 MB max | Recommended: 1 MB or less |
| **File Types** | JPG, PNG, WebP, GIF | WebP preferred for performance |
| **Dimensions** | No strict limit | Recommended: 1200x630 for social sharing |
| **Filename** | 255 chars max | Special characters will be sanitized |

### Upload Error Handling

```typescript
const UPLOAD_ERROR_CODES = {
  'FILE_TOO_LARGE': 'Image file is too large (max 5MB)',
  'INVALID_FILE_TYPE': 'Invalid file type. Use JPG, PNG, WebP, or GIF',
  'UPLOAD_FAILED': 'Failed to upload image. Please try again',
  'STORAGE_ERROR': 'Storage service is temporarily unavailable',
  'POST_NOT_FOUND': 'Cannot upload image - post not found',
  'INSUFFICIENT_PERMISSIONS': 'You do not have permission to upload images for this post',
} as const;
```

---

## 8. Real-time Updates

### Webhook Events

The blog system triggers webhook events for real-time updates:

```typescript
// Webhook event types
interface BlogWebhookEvents {
  'blog.post.created': {
    postId: string;
    title: string;
    authorId: string;
    status: PostStatus;
  };
  
  'blog.post.published': {
    postId: string;
    title: string;
    slug: string;
    publishedAt: string;
    authorId: string;
  };
  
  'blog.post.updated': {
    postId: string;
    title: string;
    changes: string[]; // Array of changed fields
    authorId: string;
  };
  
  'blog.post.deleted': {
    postId: string;
    title: string;
    authorId: string;
  };
  
  'blog.post.status_changed': {
    postId: string;
    fromStatus: PostStatus;
    toStatus: PostStatus;
    authorId: string;
  };
}
```

### WebSocket Integration (Optional)

For real-time admin dashboard updates:

```typescript
// Subscribe to post changes
const subscribeToPostUpdates = (postId: string) => {
  const ws = new WebSocket(`wss://ops.yesgoddess.agency/ws/blog/posts/${postId}`);
  
  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    
    switch (update.type) {
      case 'STATUS_CHANGED':
        updatePostStatus(update.data);
        break;
      case 'CONTENT_UPDATED':
        refreshPostContent(update.data);
        break;
      case 'REVISION_CREATED':
        refreshRevisionList(update.data);
        break;
    }
  };
};
```

### Polling Recommendations

For simpler implementations without WebSockets:

```typescript
// Poll for updates (recommended intervals)
const POLLING_INTERVALS = {
  postList: 30000, // 30 seconds
  postDetail: 10000, // 10 seconds
  revisionList: 60000, // 1 minute
  analytics: 300000, // 5 minutes
};

// Optimistic updates
const optimisticUpdate = async (postId: string, updates: Partial<Post>) => {
  // Update UI immediately
  updatePostInState(postId, updates);
  
  try {
    // Send update to server
    const result = await trpc.blog.posts.update.mutate({
      id: postId,
      data: updates,
    });
    
    // Confirm with server response
    updatePostInState(postId, result);
  } catch (error) {
    // Revert optimistic update
    revertPostUpdate(postId);
    throw error;
  }
};
```

---

## 9. Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
// Request format
interface PaginationRequest {
  page: number; // 1-based page number
  limit: number; // Items per page (max: 100)
}

// Response format
interface PaginationResponse<T> {
  data: T[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_posts: number;
    page_size: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}
```

### Available Filters

```typescript
// POST query filters
interface PostFilters {
  // Status filtering
  status?: PostStatus | PostStatus[];
  
  // User filtering
  authorId?: string;
  assignedToId?: string;
  
  // Content filtering
  categoryId?: string;
  tags?: string[]; // AND operation
  search?: string; // Full-text search
  
  // Date filtering
  dateRange?: {
    start: string; // ISO datetime
    end: string; // ISO datetime
  };
  
  // Publication filtering
  published?: boolean; // true = only published posts
  featured?: boolean; // true = only featured posts
}

// REST API specific filters
interface PublicPostFilters {
  category?: string; // Category slug
  tag?: string; // Single tag
  search?: string; // Search query
  sort?: 'newest' | 'oldest' | 'popular' | 'featured';
}
```

### Sorting Options

```typescript
// Available sort fields
type PostSortField = 
  | 'title' // Alphabetical
  | 'publishedAt' // Publication date
  | 'createdAt' // Creation date
  | 'updatedAt' // Last modified
  | 'viewCount'; // Popularity

type SortOrder = 'asc' | 'desc';

// Default sorting
const DEFAULT_SORT = {
  field: 'publishedAt' as PostSortField,
  order: 'desc' as SortOrder,
};
```

### Filtering Examples

```typescript
// tRPC: Complex filtering
const posts = await trpc.blog.posts.list.query({
  filters: {
    status: ['PUBLISHED', 'SCHEDULED'],
    categoryId: 'cat_123',
    tags: ['tutorial', 'javascript'],
    search: 'React hooks',
    dateRange: {
      start: '2025-01-01T00:00:00Z',
      end: '2025-12-31T23:59:59Z',
    },
  },
  sortBy: 'viewCount',
  sortOrder: 'desc',
  page: 1,
  limit: 20,
});

// REST: Simple filtering
const response = await fetch('/api/blog/posts?' + new URLSearchParams({
  page: '1',
  limit: '10',
  category: 'tutorials',
  search: 'React',
  sort: 'popular',
}));
```

---

## 10. Frontend Implementation Checklist

### Phase 1: Basic Integration ✅

- [ ] Set up tRPC client with proper authentication
- [ ] Implement basic CRUD operations (create, read, update, delete)
- [ ] Add form validation using provided Zod schemas
- [ ] Implement error handling for all endpoints
- [ ] Set up proper TypeScript types

### Phase 2: UI Components 🎨

- [ ] **Post List Component**
  - [ ] Pagination controls
  - [ ] Filter controls (status, category, tags, search)
  - [ ] Sort controls
  - [ ] Loading states
  - [ ] Empty states

- [ ] **Post Editor Component**
  - [ ] Rich text editor (recommend TinyMCE or Quill)
  - [ ] Title and slug fields
  - [ ] Category selector
  - [ ] Tag input with autocomplete
  - [ ] Featured image upload
  - [ ] SEO fields section
  - [ ] Status and scheduling controls
  - [ ] Auto-save functionality

- [ ] **Post Detail Component**
  - [ ] Formatted content display
  - [ ] Author and category information
  - [ ] Social sharing buttons
  - [ ] Related posts section
  - [ ] Reading progress indicator

### Phase 3: Advanced Features ⚡

- [ ] **Revision System**
  - [ ] Revision history viewer
  - [ ] Diff viewer for changes
  - [ ] Restore from revision
  - [ ] Revision notes

- [ ] **Publishing Workflow**
  - [ ] Draft → Published flow
  - [ ] Scheduled publishing
  - [ ] Publishing notifications
  - [ ] Status transition controls

- [ ] **Content Management**
  - [ ] Bulk operations (bulk delete, bulk status change)
  - [ ] Post duplication
  - [ ] Advanced search and filtering
  - [ ] Export functionality

### Phase 4: Performance & UX 🚀

- [ ] **Caching Strategy**
  - [ ] Implement React Query for data caching
  - [ ] Set up proper cache invalidation
  - [ ] Add optimistic updates

- [ ] **Real-time Features**
  - [ ] WebSocket integration for live updates
  - [ ] Collaborative editing indicators
  - [ ] Auto-refresh for published content

- [ ] **SEO & Analytics**
  - [ ] Meta tags management
  - [ ] Analytics integration
  - [ ] Performance monitoring

### API Client Setup Example

```typescript
// api/blog.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

// hooks/useBlogPosts.ts
export const useBlogPosts = (filters?: PostFilters) => {
  return trpc.blog.posts.list.useQuery({
    filters,
    page: 1,
    limit: 20,
  }, {
    keepPreviousData: true,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// hooks/useCreatePost.ts
export const useCreatePost = () => {
  const utils = trpc.useContext();
  
  return trpc.blog.posts.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch posts list
      utils.blog.posts.list.invalidate();
    },
    onError: (error) => {
      // Handle specific error codes
      if (error.data?.code === 'DUPLICATE_SLUG') {
        toast.error('A post with this URL already exists');
      }
    },
  });
};
```

### Error Handling Best Practices

```typescript
// components/ErrorBoundary.tsx
const BlogErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={<BlogErrorFallback />}
      onError={(error) => {
        // Log to monitoring service
        logError('BlogError', error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

// utils/errorHandling.ts
export const handleBlogError = (error: any) => {
  const errorMap = {
    'POST_NOT_FOUND': 'This blog post could not be found.',
    'DUPLICATE_SLUG': 'A post with this URL already exists. Please choose a different title.',
    'INSUFFICIENT_PERMISSIONS': 'You do not have permission to perform this action.',
    'BLOG_VALIDATION_ERROR': 'Please check your input and try again.',
  };
  
  const message = errorMap[error.data?.code as keyof typeof errorMap] || 
                 error.message || 
                 'An unexpected error occurred.';
  
  toast.error(message);
};
```

---

## Edge Cases to Handle

### Publishing Edge Cases
- **Scheduled posts**: Handle timezone differences
- **Past scheduled dates**: Validate against server time
- **Status conflicts**: Handle concurrent edits

### Content Edge Cases
- **Large content**: Handle rich text editor performance
- **Special characters**: Ensure proper encoding
- **Image failures**: Graceful fallbacks for broken images

### Permission Edge Cases
- **Role changes**: Handle permission changes during editing
- **Session expiry**: Graceful authentication renewal
- **Ownership transfers**: Handle post reassignment

### Network Edge Cases
- **Offline editing**: Consider offline-first approach
- **Slow networks**: Implement proper loading states
- **Failed uploads**: Retry mechanisms and progress indicators

---

## UX Considerations

### Loading States
- Skeleton loaders for post lists
- Progressive loading for post content
- Upload progress indicators

### Optimistic Updates
- Immediate UI feedback for common actions
- Rollback mechanisms for failed operations
- Conflict resolution for concurrent edits

### Accessibility
- Proper ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support

### Mobile Experience
- Responsive design for all components
- Touch-friendly controls
- Mobile-optimized editor experience

---

This comprehensive guide provides everything needed to implement the Core Blog Endpoints module in your frontend application. The combination of tRPC for admin functionality and REST APIs for public access gives you flexibility while maintaining performance and security.

For questions or clarification on any aspect of this integration, please refer to the backend documentation or reach out to the backend development team.
