# 🌐 Category Management - Frontend Integration Guide

> **Classification**: 🌐 SHARED - Used by both public-facing website and admin backend

## Table of Contents
1. [API Endpoints](#api-endpoints)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [Business Logic & Validation Rules](#business-logic--validation-rules)
4. [Error Handling](#error-handling)
5. [Authorization & Permissions](#authorization--permissions)
6. [Rate Limiting & Quotas](#rate-limiting--quotas)
7. [Pagination & Filtering](#pagination--filtering)
8. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## API Endpoints

### Base URLs
- **Backend (Admin)**: `https://ops.yesgoddess.agency`
- **tRPC Base**: `/api/trpc/blog.categories`
- **REST Base**: `/api/blog` (public endpoints only)

### 🔒 ADMIN ONLY Endpoints

#### Create Category
```typescript
// tRPC Procedure
blog.categories.create

// Method: Mutation
// Endpoint: POST /api/trpc/blog.categories.create
// Auth Required: Admin only
```

**Request Schema:**
```typescript
interface CreateCategoryRequest {
  name: string;                    // Required, 1-100 chars, trimmed
  slug?: string;                   // Optional, auto-generated if not provided
  description?: string;            // Optional, max 5000 chars
  parentCategoryId?: string;       // Optional, must be valid category ID
  displayOrder?: number;           // Optional, 0-9999, default: 0
  isActive?: boolean;              // Optional, default: true
}
```

**Response:**
```typescript
interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentCategoryId: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  parentCategory?: Category | null;
  postCount?: number;
}
```

#### Update Category
```typescript
// tRPC Procedure
blog.categories.update

// Method: Mutation
// Endpoint: POST /api/trpc/blog.categories.update
// Auth Required: Admin only
```

**Request Schema:**
```typescript
interface UpdateCategoryRequest {
  id: string;                      // Required CUID
  data: {
    name?: string;                 // 1-100 chars, trimmed
    slug?: string;                 // Auto-generated from name if not provided
    description?: string;          // Max 5000 chars
    parentCategoryId?: string;     // Must be valid category ID
    displayOrder?: number;         // 0-9999
    isActive?: boolean;
  };
}
```

#### Delete Category
```typescript
// tRPC Procedure
blog.categories.delete

// Method: Mutation
// Endpoint: POST /api/trpc/blog.categories.delete
// Auth Required: Admin only
```

**Request Schema:**
```typescript
interface DeleteCategoryRequest {
  id: string;                      // Required CUID
  reassignPostsTo?: string;        // Optional CUID - where to move posts
}
```

**Response:**
```typescript
{ success: true }
```

### 🌐 SHARED (Public + Admin) Endpoints

#### Get Category by ID
```typescript
// tRPC Procedure
blog.categories.getById

// Method: Query
// Endpoint: GET /api/trpc/blog.categories.getById
// Auth Required: None
```

**Request Schema:**
```typescript
interface GetCategoryRequest {
  id: string;                      // Required CUID
  includeChildren?: boolean;       // Default: false
  includePostCount?: boolean;      // Default: false
}
```

#### List Categories
```typescript
// tRPC Procedure
blog.categories.list

// Method: Query
// Endpoint: GET /api/trpc/blog.categories.list
// Auth Required: None
```

**Request Schema:**
```typescript
interface ListCategoriesRequest {
  parentCategoryId?: string | null; // Filter by parent, null for top-level
  includeChildren?: boolean;        // Include child categories
  includePostCount?: boolean;       // Include post counts
  filters?: {
    isActive?: boolean;             // Filter by active status
    search?: string;                // Search in name, 1-100 chars
  };
  sortBy?: 'name' | 'displayOrder' | 'createdAt'; // Default: 'displayOrder'
  sortOrder?: 'asc' | 'desc';      // Default: 'asc'
}
```

#### Get All Categories (Hierarchical)
```typescript
// tRPC Procedure
blog.allCategories

// Method: Query
// Endpoint: GET /api/trpc/blog.allCategories
// Auth Required: None
```

**Request Schema:**
```typescript
interface AllCategoriesRequest {
  includeEmpty?: boolean;          // Include categories with 0 posts, default: false
  activeOnly?: boolean;            // Only active categories, default: true
  flat?: boolean;                  // Return flat array vs hierarchical, default: false
}
```

**Response (Hierarchical):**
```typescript
interface CategoryTree extends Category {
  children: CategoryTree[];        // Nested child categories
}
```

### 🌐 Public REST Endpoints

#### Get Posts by Category
```http
GET /api/blog/posts?category={slug}
```

**Query Parameters:**
```typescript
interface PublicPostsQuery {
  category?: string;               // Category slug
  page?: number;                   // Default: 1
  limit?: number;                  // Default: 10, max: 50
  tag?: string;                    // Filter by tag
  search?: string;                 // Full-text search
  sort?: 'newest' | 'oldest' | 'popular' | 'featured'; // Default: 'newest'
}
```

---

## TypeScript Type Definitions

### Core Interfaces

```typescript
// Core category interface
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
  
  // Relations (optional, included based on query params)
  parentCategory?: Category | null;
  childCategories?: Category[];
  posts?: Post[];
  postCount?: number; // Virtual field - count of published posts
}

// Hierarchical category tree structure
export interface CategoryTree extends Category {
  children: CategoryTree[];
}

// Request/Response types
export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface CategoryFilters {
  isActive?: boolean;
  search?: string;
}

export interface CategoriesQueryOptions {
  parentCategoryId?: string | null;
  includeChildren?: boolean;
  includePostCount?: boolean;
  filters?: CategoryFilters;
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CategoriesResponse {
  categories: Category[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

// Constants
export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 5000;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Slug validation
export const slugSchema = z.string()
  .min(1, 'Slug cannot be empty')
  .max(150, 'Slug must not exceed 150 characters')
  .regex(SLUG_REGEX, 'Slug can only contain lowercase letters, numbers, and hyphens');

// Category creation schema
export const createCategorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .max(MAX_CATEGORY_NAME_LENGTH, `Category name must not exceed ${MAX_CATEGORY_NAME_LENGTH} characters`)
    .trim(),
  slug: slugSchema.optional(),
  description: z.string()
    .max(MAX_CATEGORY_DESCRIPTION_LENGTH, `Description must not exceed ${MAX_CATEGORY_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  parentCategoryId: z.string().cuid('Invalid parent category ID').optional(),
  displayOrder: z.number()
    .int('Display order must be an integer')
    .min(0, 'Display order cannot be negative')
    .max(9999, 'Display order cannot exceed 9999')
    .default(0),
  isActive: z.boolean().default(true),
});

// Category update schema (all fields optional)
export const updateCategorySchema = createCategorySchema.partial();

// Category filters
export const categoryFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().min(1).max(100).trim().optional(),
});
```

### Enums and Constants

```typescript
// Sort options
export type CategorySortBy = 'name' | 'displayOrder' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

// Validation constants
export const CATEGORY_VALIDATION = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 5000,
  SLUG_MAX_LENGTH: 150,
  DISPLAY_ORDER_MIN: 0,
  DISPLAY_ORDER_MAX: 9999,
  SEARCH_MIN_LENGTH: 1,
  SEARCH_MAX_LENGTH: 100,
} as const;
```

---

## Business Logic & Validation Rules

### Field Validation Requirements

#### Category Name
- **Required**: Yes (for creation)
- **Length**: 1-100 characters
- **Trimming**: Automatic whitespace trimming
- **Uniqueness**: Not enforced (slugs must be unique instead)
- **Special Characters**: Allowed

#### Category Slug
- **Required**: No (auto-generated from name if not provided)
- **Format**: Lowercase letters, numbers, and hyphens only
- **Pattern**: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- **Length**: 1-150 characters
- **Uniqueness**: Must be unique across all categories
- **Auto-generation**: Uses title-case conversion and conflict resolution

#### Description
- **Required**: No
- **Length**: 0-5000 characters
- **HTML**: Not allowed (plain text only)
- **Markdown**: Not supported

#### Parent Category
- **Required**: No (null = top-level category)
- **Validation**: Must be valid existing category ID
- **Circular Reference**: Prevented - cannot set parent that would create a loop
- **Self-Reference**: Prevented - cannot be its own parent

#### Display Order
- **Required**: No (defaults to 0)
- **Range**: 0-9999
- **Type**: Integer only
- **Purpose**: Manual sorting within the same hierarchy level

#### Active Status
- **Required**: No (defaults to true)
- **Type**: Boolean
- **Effect**: Inactive categories are hidden from public API responses

### Business Rules

#### Hierarchy Management
1. **Maximum Depth**: No hard limit, but UI should consider reasonable nesting
2. **Circular Prevention**: Backend validates against circular references
3. **Parent Validation**: Parent must exist and be active
4. **Child Handling**: When deleting, can reassign children to another category

#### Category Deletion
1. **With Posts**: Cannot delete if category has assigned posts unless reassigning
2. **Reassignment**: Can specify another category to move posts to
3. **Child Categories**: Are reassigned to deleted category's parent (or become top-level)
4. **Soft Delete**: Categories are not hard-deleted, just marked as inactive

#### Slug Generation
1. **Auto-generation**: From category name using kebab-case conversion
2. **Conflict Resolution**: Appends numbers for duplicates (e.g., "tech", "tech-2", "tech-3")
3. **Manual Override**: Can provide custom slug if it meets validation rules
4. **Update Behavior**: Changing name doesn't auto-update existing slug

#### Post Count Calculation
1. **Published Only**: Only counts posts with status 'PUBLISHED'
2. **Future Posts**: Excludes scheduled posts not yet published
3. **Deleted Posts**: Excludes soft-deleted posts
4. **Real-time**: Counts are calculated on-demand, not cached

---

## Error Handling

### Error Categories

#### Validation Errors (400)
```typescript
interface ValidationError {
  code: 'BLOG_VALIDATION_ERROR';
  message: string;
  statusCode: 400;
  errors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}
```

**Common validation errors:**
- `Category name is required`
- `Category name must not exceed 100 characters`
- `Slug can only contain lowercase letters, numbers, and hyphens`
- `Description must not exceed 5000 characters`
- `Display order must be an integer`
- `Display order cannot be negative`
- `Invalid parent category ID`

#### Not Found Errors (404)
```typescript
interface NotFoundError {
  code: 'CATEGORY_NOT_FOUND';
  message: string;
  statusCode: 404;
  details: {
    identifier: string;
    type: 'id' | 'slug';
  };
}
```

**Error messages:**
- `Category with id "{id}" not found`
- `Category with slug "{slug}" not found`

#### Conflict Errors (409)
```typescript
interface ConflictError {
  code: 'DUPLICATE_SLUG' | 'CATEGORY_IN_USE' | 'CIRCULAR_CATEGORY_REFERENCE';
  message: string;
  statusCode: 409;
  details: Record<string, any>;
}
```

**Specific conflict errors:**

1. **Duplicate Slug**
```typescript
{
  code: 'DUPLICATE_SLUG',
  message: 'Category with slug "tech" already exists',
  details: {
    slug: 'tech',
    type: 'category',
    existingId: 'clxx1234567890'
  }
}
```

2. **Category In Use**
```typescript
{
  code: 'CATEGORY_IN_USE',
  message: 'Cannot delete category: 15 posts are still assigned to this category',
  details: {
    categoryId: 'clxx1234567890',
    postCount: 15
  }
}
```

3. **Circular Reference**
```typescript
{
  code: 'CIRCULAR_CATEGORY_REFERENCE',
  message: 'Setting parent would create circular reference',
  details: {
    categoryId: 'clxx1234567890',
    parentCategoryId: 'clxx0987654321'
  }
}
```

#### Permission Errors (403)
```typescript
interface PermissionError {
  code: 'INSUFFICIENT_PERMISSIONS';
  message: string;
  statusCode: 403;
  details: {
    action: string;
    requiredRole: string;
    userRole: string;
  };
}
```

#### Database Errors (500)
```typescript
interface DatabaseError {
  code: 'BLOG_DATABASE_ERROR';
  message: string;
  statusCode: 500;
  details: {
    operation: string;
  };
}
```

### Error Handling Strategy

#### User-Friendly Messages
```typescript
// Map backend error codes to user-friendly messages
const ERROR_MESSAGES = {
  CATEGORY_NOT_FOUND: 'The category you\'re looking for doesn\'t exist.',
  DUPLICATE_SLUG: 'A category with this URL already exists. Please choose a different name.',
  CATEGORY_IN_USE: 'This category cannot be deleted because it contains posts. Please move the posts first.',
  CIRCULAR_CATEGORY_REFERENCE: 'Invalid parent selection - this would create a circular reference.',
  INSUFFICIENT_PERMISSIONS: 'You don\'t have permission to perform this action.',
  BLOG_VALIDATION_ERROR: 'Please check your input and try again.',
  BLOG_DATABASE_ERROR: 'Something went wrong. Please try again later.',
} as const;
```

#### Error Display Guidelines
1. **Field-level errors**: Show validation errors directly under the relevant input
2. **Form-level errors**: Show general errors at the top of the form
3. **Toast notifications**: Use for successful operations and critical errors
4. **Inline errors**: For real-time validation feedback
5. **Retry mechanisms**: Provide retry buttons for network/database errors

---

## Authorization & Permissions

### Role-Based Access Control

#### Admin (ADMIN role)
- ✅ Create categories
- ✅ Update any category
- ✅ Delete categories (with post reassignment)
- ✅ View all categories (including inactive)
- ✅ Manage hierarchy and relationships

#### Creator (CREATOR role)
- ❌ Cannot manage categories
- ✅ Can view active categories for post assignment
- ✅ Can view category hierarchy for content organization

#### Public/Unauthenticated
- ✅ View active categories only
- ✅ Browse category hierarchy
- ✅ View posts by category
- ❌ Cannot access admin endpoints

### Endpoint-Level Permissions

| Endpoint | Public | Creator | Admin |
|----------|--------|---------|-------|
| `categories.create` | ❌ | ❌ | ✅ |
| `categories.update` | ❌ | ❌ | ✅ |
| `categories.delete` | ❌ | ❌ | ✅ |
| `categories.getById` | ✅ | ✅ | ✅ |
| `categories.list` | ✅ | ✅ | ✅ |
| `allCategories` | ✅ | ✅ | ✅ |

### Field-Level Permissions
- **isActive**: Only admin can modify
- **All fields**: Admin has full access
- **Read-only**: Public/creators see only active categories

### Resource Ownership Rules
- Categories are system-wide resources
- No user-level ownership model
- All categories are managed centrally by admins

---

## Rate Limiting & Quotas

### Rate Limits by Endpoint Type

#### Admin Endpoints (Authenticated)
- **Mutations**: 60 requests per minute per user
- **Queries**: 300 requests per minute per user
- **Headers**: 
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

#### Public Endpoints (Unauthenticated)
- **Queries**: 100 requests per minute per IP
- **Bulk operations**: 10 requests per minute per IP

### Quota Limits

#### Category Management
- **Maximum categories**: No hard limit
- **Maximum hierarchy depth**: No hard limit (but UI should be reasonable)
- **Bulk operations**: Max 100 categories per operation

#### Content Limits
- **Categories per post**: 1 (single category assignment)
- **Posts per category**: Unlimited

### Rate Limit Handling
```typescript
// Check rate limit headers in responses
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  retryAfter?: number; // Seconds until reset
}

// Handle rate limit exceeded (429 status)
interface RateLimitError {
  code: 'RATE_LIMIT_EXCEEDED';
  message: 'Too many requests';
  statusCode: 429;
  retryAfter: number; // Seconds
}
```

---

## Pagination & Filtering

### Pagination Format
The API uses **offset-based pagination** for list endpoints:

```typescript
interface PaginationParams {
  page?: number;        // Page number (1-based), default: 1
  limit?: number;       // Items per page, default: 20, max: 100
}

interface PaginationResponse {
  page: number;
  limit: number;
  total: number;        // Total items available
  totalPages: number;   // Total pages available
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Available Filters

#### Categories List
```typescript
interface CategoryFilters {
  // Status filter
  isActive?: boolean;           // Show only active/inactive categories
  
  // Search filter
  search?: string;              // Search in category name (1-100 chars)
  
  // Hierarchy filters
  parentCategoryId?: string | null; // null = top-level only
  includeChildren?: boolean;    // Include nested children
  includePostCount?: boolean;   // Include post counts
}
```

#### Sorting Options
```typescript
interface SortOptions {
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
```

**Default sorting**: `displayOrder ASC, name ASC`

### Example Query Implementation
```typescript
// React Query example
const { data, isLoading, error } = useQuery({
  queryKey: ['categories', { filters, sortBy, sortOrder, page }],
  queryFn: () => trpc.blog.categories.list.query({
    filters: {
      isActive: true,
      search: searchTerm,
    },
    sortBy: 'displayOrder',
    sortOrder: 'asc',
    includePostCount: true,
  }),
});
```

---

## Frontend Implementation Checklist

### 🎯 Core Implementation Tasks

#### Data Fetching & State Management
- [ ] Set up React Query/TanStack Query for category data
- [ ] Implement tRPC client configuration
- [ ] Create category hooks for common operations:
  - [ ] `useCategories()` - List categories with filters
  - [ ] `useCategory(id)` - Get single category
  - [ ] `useCategoryTree()` - Get hierarchical structure
  - [ ] `useCreateCategory()` - Create category mutation
  - [ ] `useUpdateCategory()` - Update category mutation
  - [ ] `useDeleteCategory()` - Delete category mutation

#### UI Components
- [ ] **CategoryList** - Display categories with filtering/sorting
- [ ] **CategoryTree** - Hierarchical category browser
- [ ] **CategoryForm** - Create/edit category form
- [ ] **CategorySelector** - Dropdown for selecting categories
- [ ] **CategoryBreadcrumbs** - Show category path navigation
- [ ] **CategoryCard** - Individual category display
- [ ] **CategoryStats** - Show post counts and metrics

#### Forms & Validation
- [ ] Implement client-side validation using Zod schemas
- [ ] Real-time slug generation from category name
- [ ] Parent category selection with hierarchy validation
- [ ] Form state management with error handling
- [ ] Success/error toast notifications

#### Admin Interface
- [ ] Category management dashboard
- [ ] Bulk operations interface
- [ ] Category hierarchy drag-and-drop reordering
- [ ] Advanced filtering and search
- [ ] Category deletion with post reassignment flow

#### Public Interface
- [ ] Category browsing for content discovery
- [ ] Category-based post listing pages
- [ ] Category navigation menus
- [ ] SEO-optimized category pages

### 🔧 Technical Implementation

#### API Client Setup
```typescript
// tRPC client configuration
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from 'path-to-backend-types';

export const trpc = createTRPCReact<AppRouter>();

// Category hooks
export const useCategories = (options?: CategoriesQueryOptions) => {
  return trpc.blog.categories.list.useQuery(options);
};

export const useCategoryTree = () => {
  return trpc.blog.allCategories.useQuery({
    includeEmpty: false,
    activeOnly: true,
    flat: false,
  });
};
```

#### Form Implementation Example
```typescript
// Category form with validation
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCategorySchema } from './validation';

export const CategoryForm = ({ category, onSubmit }: CategoryFormProps) => {
  const form = useForm({
    resolver: zodResolver(createCategorySchema),
    defaultValues: category || {
      name: '',
      description: '',
      parentCategoryId: null,
      displayOrder: 0,
      isActive: true,
    },
  });

  // Auto-generate slug from name
  const watchedName = form.watch('name');
  useEffect(() => {
    if (watchedName && !form.getValues('slug')) {
      const slug = generateSlug(watchedName);
      form.setValue('slug', slug);
    }
  }, [watchedName]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  );
};
```

### 🎨 UX Considerations

#### Loading States
- [ ] Skeleton loaders for category lists
- [ ] Loading spinners for mutations
- [ ] Optimistic updates for better UX
- [ ] Progressive loading for large category trees

#### Error Handling
- [ ] Graceful error boundaries
- [ ] Retry mechanisms for failed requests
- [ ] Clear error messaging
- [ ] Fallback UI for missing categories

#### Performance Optimizations
- [ ] Virtual scrolling for large category lists
- [ ] Debounced search inputs
- [ ] Lazy loading of category children
- [ ] Memoized category tree calculations

### 🔍 Edge Cases to Handle

#### Data Consistency
- [ ] Handle deleted categories gracefully
- [ ] Update UI when categories become inactive
- [ ] Refresh post counts after bulk operations
- [ ] Handle concurrent modifications

#### Hierarchy Edge Cases
- [ ] Prevent circular reference creation in UI
- [ ] Handle orphaned categories
- [ ] Deep nesting UI considerations
- [ ] Category moving between parents

#### User Experience
- [ ] Confirm destructive operations
- [ ] Show post reassignment options clearly
- [ ] Provide clear hierarchy navigation
- [ ] Handle slow network conditions

### ✅ Testing Requirements
- [ ] Unit tests for category utilities
- [ ] Integration tests for API calls
- [ ] E2E tests for critical user flows
- [ ] Accessibility testing for forms
- [ ] Performance testing for large datasets

---

**Next Steps**: Review this document with your team and implement components incrementally, starting with data fetching and basic CRUD operations, then building up to the full admin interface.
