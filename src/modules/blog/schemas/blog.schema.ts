/**
 * Blog Validation Schemas (Zod)
 * Input validation for all blog operations
 */

import { z } from 'zod';

// Constants for validation
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TITLE_LENGTH = 500;
export const MAX_EXCERPT_LENGTH = 1000;
export const MAX_CONTENT_LENGTH = 100000; // 100K characters
export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 5000;
export const MAX_SEO_TITLE_LENGTH = 70;
export const MAX_SEO_DESCRIPTION_LENGTH = 160;
export const MAX_TAGS_COUNT = 20;
export const MAX_TAG_LENGTH = 50;

// Utility Schemas
export const slugSchema = z.string()
  .min(1, 'Slug cannot be empty')
  .max(150, 'Slug must not exceed 150 characters')
  .regex(SLUG_REGEX, 'Slug can only contain lowercase letters, numbers, and hyphens');

export const postStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']);

export const tagsSchema = z.array(
  z.string()
    .min(1, 'Tag cannot be empty')
    .max(MAX_TAG_LENGTH, `Tag must not exceed ${MAX_TAG_LENGTH} characters`)
    .trim()
).max(MAX_TAGS_COUNT, `Maximum ${MAX_TAGS_COUNT} tags allowed`);

// Category Schemas
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

export const updateCategorySchema = createCategorySchema.partial();

export const getCategorySchema = z.object({
  id: z.string().cuid('Invalid category ID'),
});

export const getCategoriesSchema = z.object({
  parentCategoryId: z.string().cuid('Invalid parent category ID').optional(),
  includeChildren: z.boolean().default(false),
  includePostCount: z.boolean().default(false),
  isActive: z.boolean().optional(),
  search: z.string().min(1).max(100).trim().optional(),
  sortBy: z.enum(['name', 'displayOrder', 'createdAt']).default('displayOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const deleteCategorySchema = z.object({
  id: z.string().cuid('Invalid category ID'),
  reassignPostsTo: z.string().cuid('Invalid reassignment category ID').optional(),
});

// Post Schemas
export const createPostSchema = z.object({
  title: z.string()
    .min(1, 'Post title is required')
    .max(MAX_TITLE_LENGTH, `Title must not exceed ${MAX_TITLE_LENGTH} characters`)
    .trim(),
  slug: slugSchema.optional(),
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
  tags: tagsSchema.default([]),
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
  // If status is PUBLISHED, publishedAt should be provided or will default to now
  if (data.status === 'PUBLISHED' && data.scheduledFor) {
    // Cannot have both published and scheduled dates
    return false;
  }
  return true;
}, {
  message: 'Cannot set both published date and scheduled date',
  path: ['publishedAt'],
});

export const updatePostSchema = createPostSchema.partial().extend({
  revisionNote: z.string()
    .max(500, 'Revision note must not exceed 500 characters')
    .trim()
    .optional(),
});

export const getPostSchema = z.object({
  id: z.string().cuid('Invalid post ID'),
  includeRevisions: z.boolean().default(false),
  includeAuthor: z.boolean().default(true),
  includeCategory: z.boolean().default(true),
});

export const getPostBySlugSchema = z.object({
  slug: slugSchema,
  includeRevisions: z.boolean().default(false),
  includeAuthor: z.boolean().default(true),
  includeCategory: z.boolean().default(true),
});

export const getPostsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.union([
    postStatusSchema,
    z.array(postStatusSchema)
  ]).optional(),
  authorId: z.string().cuid('Invalid author ID').optional(),
  categoryId: z.string().cuid('Invalid category ID').optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).optional(),
  publishedBefore: z.string().datetime('Invalid date').optional(),
  publishedAfter: z.string().datetime('Invalid date').optional(),
  search: z.string().min(1).max(200).trim().optional(),
  includeDeleted: z.boolean().default(false),
  sortBy: z.enum(['createdAt', 'updatedAt', 'publishedAt', 'title', 'viewCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  includeAuthor: z.boolean().default(true),
  includeCategory: z.boolean().default(true),
  includeRevisionCount: z.boolean().default(false),
});

export const deletePostSchema = z.object({
  id: z.string().cuid('Invalid post ID'),
  permanent: z.boolean().default(false), // Soft delete by default
});

export const restorePostSchema = z.object({
  id: z.string().cuid('Invalid post ID'),
});

// Post Revision Schemas
export const createPostRevisionSchema = z.object({
  postId: z.string().cuid('Invalid post ID'),
  content: z.string()
    .min(1, 'Revision content is required')
    .max(MAX_CONTENT_LENGTH, `Content must not exceed ${MAX_CONTENT_LENGTH} characters`),
  revisionNote: z.string()
    .max(500, 'Revision note must not exceed 500 characters')
    .trim()
    .optional(),
});

export const getPostRevisionsSchema = z.object({
  postId: z.string().cuid('Invalid post ID'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
  includeAuthor: z.boolean().default(true),
});

export const getPostRevisionSchema = z.object({
  id: z.string().cuid('Invalid revision ID'),
  includeAuthor: z.boolean().default(true),
  includePost: z.boolean().default(false),
});

export const restorePostRevisionSchema = z.object({
  revisionId: z.string().cuid('Invalid revision ID'),
  revisionNote: z.string()
    .max(500, 'Revision note must not exceed 500 characters')
    .trim()
    .optional(),
});

// Search Schema
export const searchPostsSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(200, 'Search query must not exceed 200 characters')
    .trim(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  categoryId: z.string().cuid('Invalid category ID').optional(),
  authorId: z.string().cuid('Invalid author ID').optional(),
  status: postStatusSchema.default('PUBLISHED'),
  publishedAfter: z.string().datetime('Invalid date').optional(),
  publishedBefore: z.string().datetime('Invalid date').optional(),
});

// Analytics Schemas
export const getPostAnalyticsSchema = z.object({
  postId: z.string().cuid('Invalid post ID'),
  startDate: z.string().datetime('Invalid start date').optional(),
  endDate: z.string().datetime('Invalid end date').optional(),
});

export const getCategoryAnalyticsSchema = z.object({
  categoryId: z.string().cuid('Invalid category ID'),
  includeSubcategories: z.boolean().default(false),
  startDate: z.string().datetime('Invalid start date').optional(),
  endDate: z.string().datetime('Invalid end date').optional(),
});

// Bulk Operations Schemas
export const bulkUpdatePostsSchema = z.object({
  postIds: z.array(z.string().cuid('Invalid post ID'))
    .min(1, 'At least one post ID is required')
    .max(100, 'Cannot update more than 100 posts at once'),
  updates: z.object({
    status: postStatusSchema.optional(),
    categoryId: z.string().cuid('Invalid category ID').optional(),
    tags: tagsSchema.optional(),
  }).refine((data) => {
    // At least one field must be provided for update
    return Object.keys(data).length > 0;
  }, {
    message: 'At least one field must be provided for update',
  }),
  revisionNote: z.string()
    .max(500, 'Revision note must not exceed 500 characters')
    .trim()
    .optional(),
});

export const bulkDeletePostsSchema = z.object({
  postIds: z.array(z.string().cuid('Invalid post ID'))
    .min(1, 'At least one post ID is required')
    .max(100, 'Cannot delete more than 100 posts at once'),
  permanent: z.boolean().default(false),
});

// Utility Schemas
export const generateSlugSchema = z.object({
  title: z.string()
    .min(1, 'Title is required for slug generation')
    .max(MAX_TITLE_LENGTH, `Title must not exceed ${MAX_TITLE_LENGTH} characters`),
  type: z.enum(['post', 'category']).default('post'),
  excludeId: z.string().cuid('Invalid ID').optional(), // Exclude current item when checking uniqueness
});

export const calculateReadTimeSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  wordsPerMinute: z.number().int().min(50).max(1000).default(200),
});

// Export all schemas as a collection
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
  restorePost: restorePostSchema,
  
  // Revisions
  createPostRevision: createPostRevisionSchema,
  getPostRevisions: getPostRevisionsSchema,
  getPostRevision: getPostRevisionSchema,
  restorePostRevision: restorePostRevisionSchema,
  
  // Search
  searchPosts: searchPostsSchema,
  
  // Analytics
  getPostAnalytics: getPostAnalyticsSchema,
  getCategoryAnalytics: getCategoryAnalyticsSchema,
  
  // Bulk Operations
  bulkUpdatePosts: bulkUpdatePostsSchema,
  bulkDeletePosts: bulkDeletePostsSchema,
  
  // Utilities
  generateSlug: generateSlugSchema,
  calculateReadTime: calculateReadTimeSchema,
} as const;

// Filter Schemas
export const postFiltersSchema = z.object({
  status: postStatusSchema.optional(),
  authorId: z.string().cuid('Invalid author ID').optional(),
  categoryId: z.string().cuid('Invalid category ID').optional(),
  published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  dateRange: z.object({
    start: z.string().datetime('Invalid start date'),
    end: z.string().datetime('Invalid end date'),
  }).optional(),
});

export const categoryFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});
