/**
 * Blog Error Classes
 * Custom error types for blog module operations
 */

// Base blog error class
export class BlogError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'BlogError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Validation Errors
export class BlogValidationError extends BlogError {
  public errors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(errors: Array<{ field: string; message: string; value?: any }>) {
    const message = `Validation failed: ${errors.map(e => e.message).join(', ')}`;
    super(message, 'BLOG_VALIDATION_ERROR', 400);
    this.name = 'BlogValidationError';
    this.errors = errors;
  }
}

// Not Found Errors
export class PostNotFoundError extends BlogError {
  constructor(identifier: string, type: 'id' | 'slug' = 'id') {
    super(
      `Post with ${type} "${identifier}" not found`,
      'POST_NOT_FOUND',
      404,
      { identifier, type }
    );
    this.name = 'PostNotFoundError';
  }
}

export class CategoryNotFoundError extends BlogError {
  constructor(identifier: string, type: 'id' | 'slug' = 'id') {
    super(
      `Category with ${type} "${identifier}" not found`,
      'CATEGORY_NOT_FOUND',
      404,
      { identifier, type }
    );
    this.name = 'CategoryNotFoundError';
  }
}

export class PostRevisionNotFoundError extends BlogError {
  constructor(revisionId: string) {
    super(
      `Post revision with ID "${revisionId}" not found`,
      'POST_REVISION_NOT_FOUND',
      404,
      { revisionId }
    );
    this.name = 'PostRevisionNotFoundError';
  }
}

// Duplicate/Conflict Errors
export class DuplicateSlugError extends BlogError {
  constructor(slug: string, type: 'post' | 'category', existingId?: string) {
    super(
      `${type === 'post' ? 'Post' : 'Category'} with slug "${slug}" already exists`,
      'DUPLICATE_SLUG',
      409,
      { slug, type, existingId }
    );
    this.name = 'DuplicateSlugError';
  }
}

export class CategoryInUseError extends BlogError {
  constructor(categoryId: string, postCount: number) {
    super(
      `Cannot delete category: ${postCount} posts are still assigned to this category`,
      'CATEGORY_IN_USE',
      409,
      { categoryId, postCount }
    );
    this.name = 'CategoryInUseError';
  }
}

export class CircularCategoryReferenceError extends BlogError {
  constructor(categoryId: string, parentCategoryId: string) {
    super(
      'Cannot set category as its own parent or create circular reference',
      'CIRCULAR_CATEGORY_REFERENCE',
      400,
      { categoryId, parentCategoryId }
    );
    this.name = 'CircularCategoryReferenceError';
  }
}

// Permission Errors
export class InsufficientPermissionsError extends BlogError {
  constructor(operation: string, resourceType: 'post' | 'category' | 'revision', resourceId?: string) {
    super(
      `Insufficient permissions to ${operation} ${resourceType}${resourceId ? ` "${resourceId}"` : ''}`,
      'INSUFFICIENT_PERMISSIONS',
      403,
      { operation, resourceType, resourceId }
    );
    this.name = 'InsufficientPermissionsError';
  }
}

export class PostNotPublishedError extends BlogError {
  constructor(postId: string, currentStatus: string) {
    super(
      `Post "${postId}" is not published (current status: ${currentStatus})`,
      'POST_NOT_PUBLISHED',
      403,
      { postId, currentStatus }
    );
    this.name = 'PostNotPublishedError';
  }
}

// Business Logic Errors
export class InvalidStatusTransitionError extends BlogError {
  constructor(fromStatus: string, toStatus: string, postId: string) {
    super(
      `Invalid status transition from "${fromStatus}" to "${toStatus}" for post "${postId}"`,
      'INVALID_STATUS_TRANSITION',
      400,
      { fromStatus, toStatus, postId }
    );
    this.name = 'InvalidStatusTransitionError';
  }
}

export class ScheduledDateInPastError extends BlogError {
  constructor(scheduledFor: Date) {
    super(
      'Scheduled date cannot be in the past',
      'SCHEDULED_DATE_IN_PAST',
      400,
      { scheduledFor: scheduledFor.toISOString() }
    );
    this.name = 'ScheduledDateInPastError';
  }
}

export class PostAlreadyPublishedError extends BlogError {
  constructor(postId: string, publishedAt: Date) {
    super(
      `Post "${postId}" is already published`,
      'POST_ALREADY_PUBLISHED',
      400,
      { postId, publishedAt: publishedAt.toISOString() }
    );
    this.name = 'PostAlreadyPublishedError';
  }
}

export class PostContentTooLongError extends BlogError {
  constructor(currentLength: number, maxLength: number) {
    super(
      `Post content is too long: ${currentLength} characters (max: ${maxLength})`,
      'POST_CONTENT_TOO_LONG',
      400,
      { currentLength, maxLength }
    );
    this.name = 'PostContentTooLongError';
  }
}

export class TooManyTagsError extends BlogError {
  constructor(tagCount: number, maxTags: number) {
    super(
      `Too many tags: ${tagCount} (max: ${maxTags})`,
      'TOO_MANY_TAGS',
      400,
      { tagCount, maxTags }
    );
    this.name = 'TooManyTagsError';
  }
}

// External Service Errors
export class SlugGenerationError extends BlogError {
  constructor(title: string, reason?: string) {
    super(
      `Failed to generate slug for title "${title}"${reason ? `: ${reason}` : ''}`,
      'SLUG_GENERATION_ERROR',
      500,
      { title, reason }
    );
    this.name = 'SlugGenerationError';
  }
}

export class SearchIndexError extends BlogError {
  constructor(operation: 'index' | 'search' | 'delete', reason?: string) {
    super(
      `Search index ${operation} failed${reason ? `: ${reason}` : ''}`,
      'SEARCH_INDEX_ERROR',
      500,
      { operation, reason }
    );
    this.name = 'SearchIndexError';
  }
}

// Rate Limiting Errors
export class TooManyRevisionsError extends BlogError {
  constructor(postId: string, currentCount: number, maxAllowed: number) {
    super(
      `Too many revisions for post "${postId}": ${currentCount} (max: ${maxAllowed})`,
      'TOO_MANY_REVISIONS',
      429,
      { postId, currentCount, maxAllowed }
    );
    this.name = 'TooManyRevisionsError';
  }
}

export class BulkOperationLimitError extends BlogError {
  constructor(operation: string, requestedCount: number, maxAllowed: number) {
    super(
      `Bulk ${operation} limit exceeded: ${requestedCount} items (max: ${maxAllowed})`,
      'BULK_OPERATION_LIMIT_EXCEEDED',
      429,
      { operation, requestedCount, maxAllowed }
    );
    this.name = 'BulkOperationLimitError';
  }
}

// Database/System Errors
export class BlogDatabaseError extends BlogError {
  constructor(operation: string, originalError?: Error) {
    super(
      `Database error during ${operation}`,
      'BLOG_DATABASE_ERROR',
      500,
      { operation, originalError: originalError?.message }
    );
    this.name = 'BlogDatabaseError';
  }
}

export class BlogCacheError extends BlogError {
  constructor(operation: 'get' | 'set' | 'delete', key: string, originalError?: Error) {
    super(
      `Cache ${operation} failed for key "${key}"`,
      'BLOG_CACHE_ERROR',
      500,
      { operation, key, originalError: originalError?.message }
    );
    this.name = 'BlogCacheError';
  }
}

// Export all error types
export const BlogErrors = {
  BlogError,
  BlogValidationError,
  PostNotFoundError,
  CategoryNotFoundError,
  PostRevisionNotFoundError,
  DuplicateSlugError,
  CategoryInUseError,
  CircularCategoryReferenceError,
  InsufficientPermissionsError,
  PostNotPublishedError,
  InvalidStatusTransitionError,
  ScheduledDateInPastError,
  PostAlreadyPublishedError,
  PostContentTooLongError,
  TooManyTagsError,
  SlugGenerationError,
  SearchIndexError,
  TooManyRevisionsError,
  BulkOperationLimitError,
  BlogDatabaseError,
  BlogCacheError,
} as const;

// Type helper for error handling
export type BlogErrorType = keyof typeof BlogErrors;
