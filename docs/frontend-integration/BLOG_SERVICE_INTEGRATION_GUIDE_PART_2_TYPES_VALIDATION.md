# 🌐 Blog Service - Frontend Integration Guide (Part 2: TypeScript Types & Validation)

**Classification Key:**
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only  
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## Overview

This part covers complete TypeScript type definitions, Zod validation schemas, and validation rules for the Blog Service. Use these types for type-safe frontend development and form validation.

---

## 1. Core Type Definitions

### 1.1 Enums and Status Types

```typescript
// Post Status Enum
export type PostStatus = 
  | 'DRAFT'           // Initial state, not published
  | 'PENDING_REVIEW'  // Submitted for review
  | 'APPROVED'        // Approved but not published
  | 'REJECTED'        // Rejected, needs revision
  | 'PUBLISHED'       // Live and public
  | 'SCHEDULED'       // Scheduled for future publication
  | 'ARCHIVED';       // Archived/hidden

// Valid status transitions for UI state management
export const POST_STATUS_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  DRAFT: ['PUBLISHED', 'SCHEDULED', 'ARCHIVED', 'PENDING_REVIEW'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'SCHEDULED', 'DRAFT'],
  REJECTED: ['DRAFT'],
  PUBLISHED: ['ARCHIVED'],
  SCHEDULED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT', 'PUBLISHED', 'SCHEDULED']
};

// Media access levels for featured images
export type MediaAccessLevel = 
  | 'PUBLIC'       // Publicly accessible
  | 'INTERNAL'     // Internal use only
  | 'ADMIN_ONLY'   // Admin access only
  | 'RESTRICTED';  // Restricted access

// Sort options for posts
export type PostSortBy = 
  | 'title' 
  | 'publishedAt' 
  | 'createdAt' 
  | 'updatedAt' 
  | 'viewCount';

// Sort options for categories
export type CategorySortBy = 
  | 'name' 
  | 'displayOrder' 
  | 'createdAt';

export type SortOrder = 'asc' | 'desc';
```

### 1.2 Core Entity Types

```typescript
// Category Interface
export interface Category {
  id: string;                      // CUID format: cluabc123xyz
  name: string;                    // Max 100 characters
  slug: string;                    // URL-friendly, unique
  description: string | null;      // Max 5,000 characters
  parentCategoryId: string | null; // CUID or null for root categories
  displayOrder: number;            // 0-9999, for sorting
  isActive: boolean;               // Whether category is active
  createdAt: Date;
  updatedAt: Date;
  
  // Computed/Relation Fields (optional)
  parentCategory?: Category | null;
  childCategories?: Category[];
  posts?: Post[];
  postCount?: number;              // Virtual field for stats
}

// Post Interface
export interface Post {
  id: string;                      // CUID format: clpost123xyz
  title: string;                   // Max 500 characters
  slug: string;                    // URL-friendly, unique
  content: string;                 // Rich text content, max 100,000 chars
  excerpt: string | null;          // Max 1,000 characters
  authorId: string;                // CUID of the author
  assignedToId: string | null;     // CUID of assigned user (workflow)
  categoryId: string | null;       // CUID of category
  featuredImageUrl: string | null; // Public URL of featured image
  status: PostStatus;
  publishedAt: Date | null;        // When post was published
  scheduledFor: Date | null;       // When post is scheduled to publish
  readTimeMinutes: number;         // Auto-calculated reading time
  viewCount: number;               // Total view count
  isFeatured: boolean;             // Whether post is featured
  tags: string[];                  // Array of tag strings, max 20 tags
  seoTitle: string | null;         // SEO title, max 70 characters
  seoDescription: string | null;   // SEO description, max 160 characters
  seoKeywords: string | null;      // SEO keywords, max 500 characters
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;          // Soft delete timestamp
  
  // Computed/Relation Fields (optional)
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
  workflowHistory?: PostWorkflowHistory[];
  revisionCount?: number;          // Virtual field for stats
}

// Post Revision Interface
export interface PostRevision {
  id: string;                      // CUID format
  postId: string;                  // CUID of parent post
  content: string;                 // Content at time of revision
  authorId: string;                // CUID of user who made revision
  revisionNote: string | null;     // Optional note about changes
  createdAt: Date;
  
  // Relations (optional)
  post?: Post;
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
}

// Workflow History Interface
export interface PostWorkflowHistory {
  id: string;
  postId: string;
  fromStatus: PostStatus;
  toStatus: PostStatus;
  userId: string;
  comments: string | null;
  reason: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  
  // Relations (optional)
  post?: Post;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
}
```

### 1.3 Request/Response Types

```typescript
// Category Request Types
export interface CreateCategoryRequest {
  name: string;                    // Required, 1-100 chars
  slug?: string;                   // Optional, auto-generated
  description?: string;            // Optional, max 5,000 chars
  parentCategoryId?: string;       // Optional, CUID format
  displayOrder?: number;           // Optional, 0-9999, default: 0
  isActive?: boolean;              // Optional, default: true
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string;       // Can be null to make root category
  displayOrder?: number;
  isActive?: boolean;
}

// Post Request Types
export interface CreatePostRequest {
  title: string;                   // Required, 1-500 chars
  slug?: string;                   // Optional, auto-generated
  content: string;                 // Required, 1-100,000 chars
  excerpt?: string;                // Optional, max 1,000 chars
  assignedToId?: string;           // Optional, CUID format
  categoryId?: string;             // Optional, CUID format
  featuredImageUrl?: string;       // Optional, valid URL
  status?: PostStatus;             // Optional, default: 'DRAFT'
  publishedAt?: Date;              // Optional, for backdating
  scheduledFor?: Date;             // Optional, future date required
  isFeatured?: boolean;            // Optional, default: false
  tags?: string[];                 // Optional, max 20 tags, 50 chars each
  seoTitle?: string;               // Optional, max 70 chars
  seoDescription?: string;         // Optional, max 160 chars
  seoKeywords?: string;            // Optional, max 500 chars
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
  revisionNote?: string;           // Max 500 chars, tracks changes
}

// File Upload Types
export interface ImageFileUpload {
  buffer: Buffer;                  // File buffer
  mimetype: string;                // MIME type (image/jpeg, image/png, image/webp, image/gif)
  originalname: string;            // Original filename
  size: number;                    // File size in bytes (max: 5MB)
}

export interface UploadFeaturedImageRequest {
  postId: string;                  // CUID of the post
  imageFile: ImageFileUpload;
}

export interface UploadFeaturedImageResponse {
  imageUrl: string;                // Public URL of uploaded image
  storageKey: string;              // Storage provider key
}

// Query Parameter Types
export interface PostFilters {
  status?: PostStatus;
  authorId?: string;               // CUID format
  assignedToId?: string;           // CUID format
  categoryId?: string;             // CUID format
  published?: boolean;             // Filter for published posts
  tags?: string[];                 // Array of tag names
  search?: string;                 // Search title/content, max 200 chars
  dateRange?: {
    start: Date | string;          // ISO datetime string
    end: Date | string;            // ISO datetime string
  };
}

export interface CategoryFilters {
  parentCategoryId?: string | null; // CUID or null for root categories
  isActive?: boolean;              // Filter by active status
  search?: string;                 // Search by name, max 100 chars
}

// Pagination and Query Options
export interface PostsQueryOptions {
  filters?: PostFilters;
  sortBy?: PostSortBy;             // Default: 'createdAt'
  sortOrder?: SortOrder;           // Default: 'desc'
  page?: number;                   // Default: 1, min: 1
  limit?: number;                  // Default: 20, min: 1, max: 100
  includeRevisions?: boolean;      // Default: false
}

export interface CategoriesQueryOptions {
  parentCategoryId?: string | null;
  includeChildren?: boolean;       // Default: false
  includePostCount?: boolean;      // Default: false
  filters?: CategoryFilters;
  sortBy?: CategorySortBy;         // Default: 'displayOrder'
  sortOrder?: SortOrder;           // Default: 'asc'
}

// Response Types
export interface PostsResponse {
  posts: Post[];
  total: number;                   // Total number of posts matching filters
  page: number;                    // Current page number
  limit: number;                   // Posts per page
  totalPages: number;              // Total number of pages
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;                   // Total number of categories
}

export interface RevisionsResponse {
  revisions: PostRevision[];
  total: number;
  page: number;
  limit: number;
}
```

---

## 2. Zod Validation Schemas

### 2.1 Validation Constants

```typescript
// Validation Constants
export const VALIDATION_LIMITS = {
  // Slug validation
  SLUG_REGEX: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  
  // Length limits
  MAX_TITLE_LENGTH: 500,
  MAX_EXCERPT_LENGTH: 1000,
  MAX_CONTENT_LENGTH: 100000,      // 100K characters
  MAX_CATEGORY_NAME_LENGTH: 100,
  MAX_CATEGORY_DESCRIPTION_LENGTH: 5000,
  MAX_SEO_TITLE_LENGTH: 70,
  MAX_SEO_DESCRIPTION_LENGTH: 160,
  MAX_SEO_KEYWORDS_LENGTH: 500,
  MAX_REVISION_NOTE_LENGTH: 500,
  MAX_TAGS_COUNT: 20,
  MAX_TAG_LENGTH: 50,
  MAX_SEARCH_LENGTH: 200,
  
  // File upload limits
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  
  // Numeric limits
  MAX_DISPLAY_ORDER: 9999,
  MIN_PAGE_NUMBER: 1,
  MAX_PAGE_LIMIT: 100,
} as const;
```

### 2.2 Base Validation Schemas

```typescript
import { z } from 'zod';

// Utility Schemas
export const slugSchema = z.string()
  .min(1, 'Slug cannot be empty')
  .max(150, 'Slug must not exceed 150 characters')
  .regex(VALIDATION_LIMITS.SLUG_REGEX, 'Slug can only contain lowercase letters, numbers, and hyphens');

export const cuidSchema = z.string()
  .cuid('Invalid ID format');

export const postStatusSchema = z.enum([
  'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 
  'PUBLISHED', 'SCHEDULED', 'ARCHIVED'
]);

export const tagsSchema = z.array(
  z.string()
    .min(1, 'Tag cannot be empty')
    .max(VALIDATION_LIMITS.MAX_TAG_LENGTH, `Tag must not exceed ${VALIDATION_LIMITS.MAX_TAG_LENGTH} characters`)
    .trim()
).max(VALIDATION_LIMITS.MAX_TAGS_COUNT, `Maximum ${VALIDATION_LIMITS.MAX_TAGS_COUNT} tags allowed`);

export const dateRangeSchema = z.object({
  start: z.string().datetime('Invalid start date'),
  end: z.string().datetime('Invalid end date'),
});

export const paginationSchema = z.object({
  page: z.number().int().min(VALIDATION_LIMITS.MIN_PAGE_NUMBER).default(1),
  limit: z.number().int().min(1).max(VALIDATION_LIMITS.MAX_PAGE_LIMIT).default(20),
});
```

### 2.3 Category Validation Schemas

```typescript
// Category Schemas
export const createCategorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .max(VALIDATION_LIMITS.MAX_CATEGORY_NAME_LENGTH, 
         `Category name must not exceed ${VALIDATION_LIMITS.MAX_CATEGORY_NAME_LENGTH} characters`)
    .trim(),
  slug: slugSchema.optional(),
  description: z.string()
    .max(VALIDATION_LIMITS.MAX_CATEGORY_DESCRIPTION_LENGTH, 
         `Description must not exceed ${VALIDATION_LIMITS.MAX_CATEGORY_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  parentCategoryId: cuidSchema.optional(),
  displayOrder: z.number()
    .int('Display order must be an integer')
    .min(0, 'Display order cannot be negative')
    .max(VALIDATION_LIMITS.MAX_DISPLAY_ORDER, `Display order cannot exceed ${VALIDATION_LIMITS.MAX_DISPLAY_ORDER}`)
    .default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const getCategorySchema = z.object({
  id: cuidSchema,
  includeChildren: z.boolean().default(false),
  includePostCount: z.boolean().default(false),
});

export const getCategoriesSchema = z.object({
  parentCategoryId: cuidSchema.optional(),
  includeChildren: z.boolean().default(false),
  includePostCount: z.boolean().default(false),
  isActive: z.boolean().optional(),
  search: z.string().min(1).max(100).trim().optional(),
  sortBy: z.enum(['name', 'displayOrder', 'createdAt']).default('displayOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const deleteCategorySchema = z.object({
  id: cuidSchema,
  reassignPostsTo: cuidSchema.optional(),
});
```

### 2.4 Post Validation Schemas

```typescript
// Post Schemas
export const createPostSchema = z.object({
  title: z.string()
    .min(1, 'Post title is required')
    .max(VALIDATION_LIMITS.MAX_TITLE_LENGTH, 
         `Title must not exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`)
    .trim(),
  slug: slugSchema.optional(),
  content: z.string()
    .min(1, 'Post content is required')
    .max(VALIDATION_LIMITS.MAX_CONTENT_LENGTH, 
         `Content must not exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`),
  excerpt: z.string()
    .max(VALIDATION_LIMITS.MAX_EXCERPT_LENGTH, 
         `Excerpt must not exceed ${VALIDATION_LIMITS.MAX_EXCERPT_LENGTH} characters`)
    .trim()
    .optional(),
  categoryId: cuidSchema.optional(),
  featuredImageUrl: z.string().url('Invalid featured image URL').optional(),
  status: postStatusSchema.default('DRAFT'),
  publishedAt: z.string().datetime('Invalid published date').optional(),
  scheduledFor: z.string().datetime('Invalid scheduled date').optional(),
  isFeatured: z.boolean().default(false),
  tags: tagsSchema.default([]),
  seoTitle: z.string()
    .max(VALIDATION_LIMITS.MAX_SEO_TITLE_LENGTH, 
         `SEO title must not exceed ${VALIDATION_LIMITS.MAX_SEO_TITLE_LENGTH} characters`)
    .trim()
    .optional(),
  seoDescription: z.string()
    .max(VALIDATION_LIMITS.MAX_SEO_DESCRIPTION_LENGTH, 
         `SEO description must not exceed ${VALIDATION_LIMITS.MAX_SEO_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  seoKeywords: z.string()
    .max(VALIDATION_LIMITS.MAX_SEO_KEYWORDS_LENGTH, 
         `SEO keywords must not exceed ${VALIDATION_LIMITS.MAX_SEO_KEYWORDS_LENGTH} characters`)
    .trim()
    .optional(),
}).refine((data) => {
  // If status is SCHEDULED, scheduledFor must be provided
  if (data.status === 'SCHEDULED') {
    return !!data.scheduledFor;
  }
  return true;
}, {
  message: 'Scheduled date is required when status is SCHEDULED',
  path: ['scheduledFor'],
}).refine((data) => {
  // Cannot have both published and scheduled dates
  if (data.status === 'PUBLISHED' && data.scheduledFor) {
    return false;
  }
  return true;
}, {
  message: 'Cannot set both published date and scheduled date',
  path: ['publishedAt'],
}).refine((data) => {
  // Scheduled date must be in the future
  if (data.scheduledFor) {
    const scheduledDate = new Date(data.scheduledFor);
    return scheduledDate > new Date();
  }
  return true;
}, {
  message: 'Scheduled date must be in the future',
  path: ['scheduledFor'],
});

export const updatePostSchema = createPostSchema.partial().extend({
  revisionNote: z.string()
    .max(VALIDATION_LIMITS.MAX_REVISION_NOTE_LENGTH, 
         `Revision note must not exceed ${VALIDATION_LIMITS.MAX_REVISION_NOTE_LENGTH} characters`)
    .trim()
    .optional(),
});

export const getPostSchema = z.object({
  id: cuidSchema,
  includeRevisions: z.boolean().default(false),
  incrementViews: z.boolean().default(false),
});

export const getPostBySlugSchema = z.object({
  slug: slugSchema,
  includeRevisions: z.boolean().default(false),
  incrementViews: z.boolean().default(false),
});

export const getPostsSchema = z.object({
  filters: z.object({
    status: z.union([postStatusSchema, z.array(postStatusSchema)]).optional(),
    authorId: cuidSchema.optional(),
    assignedToId: cuidSchema.optional(),
    categoryId: cuidSchema.optional(),
    published: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(VALIDATION_LIMITS.MAX_TAG_LENGTH)).optional(),
    search: z.string().min(1).max(VALIDATION_LIMITS.MAX_SEARCH_LENGTH).trim().optional(),
    dateRange: dateRangeSchema.optional(),
  }).optional(),
  sortBy: z.enum(['title', 'publishedAt', 'createdAt', 'updatedAt', 'viewCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(VALIDATION_LIMITS.MAX_PAGE_LIMIT).default(20),
  includeRevisions: z.boolean().default(false),
});

export const deletePostSchema = z.object({
  id: cuidSchema,
});

export const duplicatePostSchema = z.object({
  id: cuidSchema,
  overrides: createPostSchema.partial().optional(),
});
```

### 2.5 File Upload Validation Schemas

```typescript
// File Upload Schemas
export const imageFileSchema = z.object({
  buffer: z.instanceof(Buffer),
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const, {
    errorMap: () => ({ message: 'Invalid image format. Only JPEG, PNG, WebP, and GIF are allowed.' })
  }),
  originalname: z.string().min(1, 'Filename is required'),
  size: z.number()
    .positive('File size must be positive')
    .max(VALIDATION_LIMITS.MAX_IMAGE_SIZE, 'Image file size must be less than 5MB'),
});

export const uploadFeaturedImageSchema = z.object({
  postId: cuidSchema,
  imageFile: imageFileSchema,
});

export const removeFeaturedImageSchema = z.object({
  postId: cuidSchema,
});
```

### 2.6 Revision Validation Schemas

```typescript
// Post Revision Schemas
export const createPostRevisionSchema = z.object({
  postId: cuidSchema,
  content: z.string()
    .min(1, 'Revision content is required')
    .max(VALIDATION_LIMITS.MAX_CONTENT_LENGTH, 
         `Content must not exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`),
  revisionNote: z.string()
    .max(VALIDATION_LIMITS.MAX_REVISION_NOTE_LENGTH, 
         `Revision note must not exceed ${VALIDATION_LIMITS.MAX_REVISION_NOTE_LENGTH} characters`)
    .trim()
    .optional(),
});

export const getPostRevisionsSchema = z.object({
  postId: cuidSchema,
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export const getPostRevisionSchema = z.object({
  id: cuidSchema,
});
```

---

## 3. Frontend Validation Helpers

### 3.1 Form Validation Functions

```typescript
// Form validation helper functions
export const validatePostForm = (data: Partial<CreatePostRequest>) => {
  try {
    createPostSchema.parse(data);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: err.code
        }))
      };
    }
    return { isValid: false, errors: [{ field: 'general', message: 'Validation failed' }] };
  }
};

export const validateCategoryForm = (data: Partial<CreateCategoryRequest>) => {
  try {
    createCategorySchema.parse(data);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: err.code
        }))
      };
    }
    return { isValid: false, errors: [{ field: 'general', message: 'Validation failed' }] };
  }
};

// File validation helper
export const validateImageFile = (file: File) => {
  const errors: string[] = [];
  
  // Check file type
  if (!VALIDATION_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    errors.push('Invalid image format. Only JPEG, PNG, WebP, and GIF are allowed.');
  }
  
  // Check file size
  if (file.size > VALIDATION_LIMITS.MAX_IMAGE_SIZE) {
    errors.push('Image file size must be less than 5MB.');
  }
  
  // Check filename
  if (!file.name || file.name.trim().length === 0) {
    errors.push('Filename is required.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### 3.2 Status Transition Helpers

```typescript
// Status transition validation
export const canTransitionStatus = (currentStatus: PostStatus, newStatus: PostStatus): boolean => {
  return POST_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
};

export const getAvailableStatusTransitions = (currentStatus: PostStatus): PostStatus[] => {
  return POST_STATUS_TRANSITIONS[currentStatus] ?? [];
};

// Status display helpers
export const getStatusDisplayName = (status: PostStatus): string => {
  const statusNames: Record<PostStatus, string> = {
    DRAFT: 'Draft',
    PENDING_REVIEW: 'Pending Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PUBLISHED: 'Published',
    SCHEDULED: 'Scheduled',
    ARCHIVED: 'Archived'
  };
  return statusNames[status];
};

export const getStatusColor = (status: PostStatus): string => {
  const statusColors: Record<PostStatus, string> = {
    DRAFT: 'gray',
    PENDING_REVIEW: 'yellow',
    APPROVED: 'green',
    REJECTED: 'red',
    PUBLISHED: 'blue',
    SCHEDULED: 'purple',
    ARCHIVED: 'slate'
  };
  return statusColors[status];
};
```

### 3.3 Date Validation Helpers

```typescript
// Date validation helpers
export const isValidScheduleDate = (date: Date | string): boolean => {
  const scheduleDate = typeof date === 'string' ? new Date(date) : date;
  return scheduleDate > new Date();
};

export const formatScheduleDate = (date: Date | string): string => {
  const scheduleDate = typeof date === 'string' ? new Date(date) : date;
  return scheduleDate.toISOString();
};

export const isValidDateRange = (start: Date | string, end: Date | string): boolean => {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  return startDate < endDate;
};
```

---

## 4. Export Collections

### 4.1 Schema Collections

```typescript
// Export all schemas for easy import
export const blogSchemas = {
  // Categories
  createCategory: createCategorySchema,
  updateCategory: updateCategorySchema,
  getCategory: getCategorySchema,
  getCategories: getCategoriesSchema,
  deleteCategory: deleteCategorySchema,
  
  // Posts
  createPost: createPostSchema,
  updatePost: updatePostSchema,
  getPost: getPostSchema,
  getPostBySlug: getPostBySlugSchema,
  getPosts: getPostsSchema,
  deletePost: deletePostSchema,
  duplicatePost: duplicatePostSchema,
  
  // File uploads
  uploadFeaturedImage: uploadFeaturedImageSchema,
  removeFeaturedImage: removeFeaturedImageSchema,
  
  // Revisions
  createPostRevision: createPostRevisionSchema,
  getPostRevisions: getPostRevisionsSchema,
  getPostRevision: getPostRevisionSchema,
  
  // Utilities
  imageFile: imageFileSchema,
  tags: tagsSchema,
  pagination: paginationSchema,
  dateRange: dateRangeSchema,
} as const;
```

### 4.2 Type Collections

```typescript
// Export all types for easy import
export type {
  // Enums
  PostStatus,
  MediaAccessLevel,
  PostSortBy,
  CategorySortBy,
  SortOrder,
  
  // Core entities
  Category,
  Post,
  PostRevision,
  PostWorkflowHistory,
  
  // Request types
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreatePostRequest,
  UpdatePostRequest,
  ImageFileUpload,
  UploadFeaturedImageRequest,
  
  // Response types
  UploadFeaturedImageResponse,
  PostsResponse,
  CategoriesResponse,
  RevisionsResponse,
  
  // Query types
  PostFilters,
  CategoryFilters,
  PostsQueryOptions,
  CategoriesQueryOptions,
};
```

---

## Usage Examples

### Example: React Hook Form with Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPostSchema, type CreatePostRequest } from './blog-types';

const CreatePostForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue
  } = useForm<CreatePostRequest>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      status: 'DRAFT',
      isFeatured: false,
      tags: []
    }
  });

  const createPost = trpc.blog.posts.create.useMutation();

  const onSubmit = async (data: CreatePostRequest) => {
    try {
      const post = await createPost.mutateAsync(data);
      console.log('Post created:', post);
    } catch (error) {
      console.error('Failed to create post:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register('title')}
        placeholder="Post title"
        className={errors.title ? 'border-red-500' : ''}
      />
      {errors.title && (
        <span className="text-red-500">{errors.title.message}</span>
      )}
      
      <textarea
        {...register('content')}
        placeholder="Post content"
        className={errors.content ? 'border-red-500' : ''}
      />
      {errors.content && (
        <span className="text-red-500">{errors.content.message}</span>
      )}
      
      <button type="submit" disabled={!isValid}>
        Create Post
      </button>
    </form>
  );
};
```

---

## Next Parts

This concludes Part 2 covering TypeScript types and validation. Continue with:

- **Part 3: Error Handling & Business Logic** - Error codes, business rules, and state management
- **Part 4: Implementation Examples** - Complete React components and integration patterns

---

**Integration Status**: ✅ Types and validation documented  
**Next**: [Part 3 - Error Handling & Business Logic](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_3_ERROR_HANDLING_IMPLEMENTATION.md)  
**Last Updated**: October 16, 2025
