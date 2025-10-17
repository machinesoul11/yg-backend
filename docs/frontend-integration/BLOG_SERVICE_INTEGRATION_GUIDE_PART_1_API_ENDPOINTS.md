# Blog Service - Frontend Integration Guide (Part 1: API Endpoints & Types)

## Classification Key
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## Overview

The Blog Service provides comprehensive content management functionality including post management, categorization, scheduling, featured images, and revision tracking. All endpoints are accessed via tRPC at `/api/trpc/blog.*`.

---

## 1. API Endpoints

### Categories (🔒 ADMIN ONLY)

#### Create Category
```typescript
trpc.blog.categories.create.mutate(data)
```
- **Access**: Admin only
- **Input**: `CreateCategoryRequest`
- **Output**: `Category`

#### Update Category
```typescript
trpc.blog.categories.update.mutate({ id, data })
```
- **Access**: Admin only
- **Input**: `{ id: string, data: UpdateCategoryRequest }`
- **Output**: `Category`

#### Get Categories
```typescript
trpc.blog.categories.list.query(options)
```
- **Access**: Public/Admin (filtered by status)
- **Input**: `CategoriesQueryOptions`
- **Output**: `CategoriesResponse`

#### Delete Category
```typescript
trpc.blog.categories.delete.mutate({ id, reassignPostsTo? })
```
- **Access**: Admin only
- **Input**: `{ id: string, reassignPostsTo?: string }`
- **Output**: `{ success: boolean }`

---

### Posts (⚡ HYBRID)

#### Create Post
```typescript
trpc.blog.posts.create.mutate(data)
```
- **Access**: Protected (authenticated users)
- **Input**: `CreatePostRequest`
- **Output**: `Post`

#### Update Post
```typescript
trpc.blog.posts.update.mutate({ id, data })
```
- **Access**: Protected (author or admin)
- **Input**: `{ id: string, data: UpdatePostRequest }`
- **Output**: `Post`

#### Get Posts (List with Filters)
```typescript
trpc.blog.posts.list.query(options)
```
- **Access**: 🌐 **SHARED** (public posts) / 🔒 **ADMIN** (all posts)
- **Input**: `PostsQueryOptions`
- **Output**: `PostsResponse`

#### Get Post by ID
```typescript
trpc.blog.posts.getById.query({ id, includeRevisions?, incrementViews? })
```
- **Access**: 🌐 **SHARED** (published) / 🔒 **ADMIN** (all)
- **Input**: `{ id: string, includeRevisions?: boolean, incrementViews?: boolean }`
- **Output**: `Post`

#### Get Post by Slug
```typescript
trpc.blog.posts.getBySlug.query({ slug, includeRevisions?, incrementViews? })
```
- **Access**: 🌐 **SHARED** (published) / 🔒 **ADMIN** (all)
- **Input**: `{ slug: string, includeRevisions?: boolean, incrementViews?: boolean }`
- **Output**: `Post`

#### Publish Post
```typescript
trpc.blog.posts.publish.mutate({ id, publishedAt? })
```
- **Access**: Protected (author or admin)
- **Input**: `{ id: string, publishedAt?: string }`
- **Output**: `Post`

#### Schedule Post
```typescript
trpc.blog.posts.schedule.mutate({ id, scheduledFor })
```
- **Access**: Protected (author or admin)
- **Input**: `{ id: string, scheduledFor: string }`
- **Output**: `Post`

#### Delete Post (Soft Delete)
```typescript
trpc.blog.posts.delete.mutate({ id })
```
- **Access**: Protected (author or admin)
- **Input**: `{ id: string }`
- **Output**: `{ success: boolean }`

#### Restore Post
```typescript
trpc.blog.posts.restore.mutate({ id })
```
- **Access**: Protected (author or admin)
- **Input**: `{ id: string }`
- **Output**: `Post`

#### Duplicate Post
```typescript
trpc.blog.posts.duplicate.mutate({ id, overrides? })
```
- **Access**: Protected (authenticated users)
- **Input**: `{ id: string, overrides?: Partial<CreatePostRequest> }`
- **Output**: `Post`

---

### Featured Images (⚡ HYBRID)

#### Upload Featured Image
```typescript
trpc.blog.posts.uploadFeaturedImage.mutate({ postId, imageFile })
```
- **Access**: Protected (author or admin)
- **Input**: `{ postId: string, imageFile: ImageFileData }`
- **Output**: `{ imageUrl: string, storageKey: string }`

#### Remove Featured Image
```typescript
trpc.blog.posts.removeFeaturedImage.mutate({ postId })
```
- **Access**: Protected (author or admin)
- **Input**: `{ postId: string }`
- **Output**: `{ success: boolean }`

---

### Post Revisions (🔒 ADMIN ONLY)

#### Create Revision
```typescript
trpc.blog.revisions.create.mutate(data)
```
- **Access**: Protected
- **Input**: `CreatePostRevisionRequest`
- **Output**: `PostRevision`

#### Get Post Revisions
```typescript
trpc.blog.revisions.list.query({ postId, page?, limit? })
```
- **Access**: Protected
- **Input**: `{ postId: string, page?: number, limit?: number }`
- **Output**: `{ revisions: PostRevision[], total: number, page: number, limit: number }`

#### Get Specific Revision
```typescript
trpc.blog.revisions.getById.query({ id })
```
- **Access**: Protected
- **Input**: `{ id: string }`
- **Output**: `PostRevision`

---

### Content Calendar (🔒 ADMIN ONLY)

#### Schedule Post for Publication
```typescript
trpc.blog.calendar.schedulePost.mutate({ postId, scheduledFor, reason? })
```
- **Access**: Protected
- **Input**: `{ postId: string, scheduledFor: string, reason?: string }`
- **Output**: `Post`

#### Cancel Scheduled Publication
```typescript
trpc.blog.calendar.cancelScheduled.mutate({ postId, reason? })
```
- **Access**: Protected
- **Input**: `{ postId: string, reason?: string }`
- **Output**: `Post`

#### Reschedule Post
```typescript
trpc.blog.calendar.reschedule.mutate({ postId, newScheduledFor, reason? })
```
- **Access**: Protected
- **Input**: `{ postId: string, newScheduledFor: string, reason?: string }`
- **Output**: `Post`

#### Get Calendar View
```typescript
trpc.blog.calendar.getView.query({ startDate, endDate, filters? })
```
- **Access**: Protected
- **Input**: `{ startDate: string, endDate: string, filters?: CalendarFilters }`
- **Output**: `CalendarView`

---

### Admin Operations (🔒 ADMIN ONLY)

#### Trigger Scheduled Publishing
```typescript
trpc.blog.triggerScheduledPublishing.mutate({ postId? })
```
- **Access**: Admin only
- **Input**: `{ postId?: string }`
- **Output**: `{ success: boolean, message: string }`

#### Get Blog Statistics
```typescript
trpc.blog.stats.query()
```
- **Access**: Admin only
- **Input**: None
- **Output**: `BlogStats`

---

## 2. TypeScript Type Definitions

### Core Types

```typescript
export type PostStatus = 
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'SCHEDULED'
  | 'ARCHIVED';

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
  
  // Relations (when included)
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
  
  // Relations (when included)
  parentCategory?: Category | null;
  childCategories?: Category[];
  posts?: Post[];
  postCount?: number;
}

export interface PostRevision {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  revisionNote: string | null;
  createdAt: Date;
  
  // Relations (when included)
  post?: Post;
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
}
```

### Request Types

```typescript
export interface CreatePostRequest {
  title: string;                    // Required, max 500 chars
  slug?: string;                    // Auto-generated if not provided
  content: string;                  // Required, max 100K chars
  excerpt?: string;                 // Auto-generated if not provided, max 1K chars
  assignedToId?: string;            // CUID
  categoryId?: string;              // CUID
  featuredImageUrl?: string;        // Valid URL
  status?: PostStatus;              // Default: 'DRAFT'
  publishedAt?: Date;               // ISO string
  scheduledFor?: Date;              // ISO string, must be future date
  isFeatured?: boolean;             // Default: false
  tags?: string[];                  // Max 20 tags, 50 chars each
  seoTitle?: string;                // Max 70 chars
  seoDescription?: string;          // Max 160 chars
  seoKeywords?: string;             // Max 500 chars
}

export interface UpdatePostRequest {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  assignedToId?: string;
  categoryId?: string;
  featuredImageUrl?: string;
  status?: PostStatus;
  publishedAt?: Date;
  scheduledFor?: Date;
  isFeatured?: boolean;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  revisionNote?: string;            // For tracking changes
}

export interface CreateCategoryRequest {
  name: string;                     // Required, max 100 chars
  slug?: string;                    // Auto-generated if not provided
  description?: string;             // Max 5000 chars
  parentCategoryId?: string;        // CUID
  displayOrder?: number;            // Default: 0, max 9999
  isActive?: boolean;               // Default: true
}

export interface ImageFileData {
  buffer: Buffer;                   // File content
  mimetype: string;                 // Must be image/jpeg, image/png, image/webp, or image/gif
  originalname: string;             // Original filename
  size: number;                     // File size in bytes (max 5MB)
}
```

### Query Types

```typescript
export interface PostsQueryOptions {
  filters?: {
    status?: PostStatus | PostStatus[];
    authorId?: string;
    assignedToId?: string;
    categoryId?: string;
    published?: boolean;
    tags?: string[];
    search?: string;                // Searches title, content, excerpt
    dateRange?: {
      start: Date | string;
      end: Date | string;
    };
  };
  sortBy?: 'title' | 'publishedAt' | 'createdAt' | 'updatedAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  page?: number;                    // Default: 1
  limit?: number;                   // Default: 20, max 100
  includeRevisions?: boolean;       // Default: false
}

export interface CategoriesQueryOptions {
  parentCategoryId?: string | null;
  includeChildren?: boolean;        // Default: false
  includePostCount?: boolean;       // Default: false
  filters?: {
    isActive?: boolean;
    search?: string;
  };
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
```

### Response Types

```typescript
export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
}

export interface BlogStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  scheduledPosts: number;
  totalCategories: number;
  activeCategories: number;
  totalRevisions: number;
  totalViews: number;
}
```

---

## 3. Query Parameters & Pagination

### Standard Pagination
All list endpoints support cursor-based pagination:

```typescript
// Example: Get posts with pagination
const result = await trpc.blog.posts.list.query({
  page: 1,
  limit: 20,
  sortBy: 'publishedAt',
  sortOrder: 'desc'
});

// Result includes pagination metadata
console.log(`Page ${result.page} of ${result.totalPages}`);
console.log(`Showing ${result.posts.length} of ${result.total} posts`);
```

### Advanced Filtering
```typescript
// Filter posts by multiple criteria
const filteredPosts = await trpc.blog.posts.list.query({
  filters: {
    status: ['PUBLISHED', 'SCHEDULED'],
    categoryId: 'cat_123',
    tags: ['tutorial', 'beginner'],
    dateRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z'
    },
    search: 'licensing guide'
  },
  sortBy: 'viewCount',
  sortOrder: 'desc',
  limit: 10
});
```

### Search Functionality
The search parameter supports full-text search across:
- Post title
- Post content
- Post excerpt
- SEO title and description

---

## 4. Authentication Requirements

### Access Levels

| Endpoint | Public | Authenticated | Admin |
|----------|--------|---------------|-------|
| Get published posts | ✅ | ✅ | ✅ |
| Get draft/scheduled posts | ❌ | Owner only | ✅ |
| Create post | ❌ | ✅ | ✅ |
| Update post | ❌ | Owner only | ✅ |
| Delete post | ❌ | Owner only | ✅ |
| Manage categories | ❌ | ❌ | ✅ |
| Publishing operations | ❌ | Owner only | ✅ |
| Admin statistics | ❌ | ❌ | ✅ |

### JWT Token Requirements
```typescript
// Include JWT token in tRPC headers
const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    }),
  ],
});
```

---

Continue to [Part 2: Business Logic & Validation](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_2_BUSINESS_LOGIC.md) for validation rules, business logic constraints, and frontend implementation guidelines.
