/**
 * Blog Module Index
 * Central exports for the blog management system
 */

// Services
export { BlogService } from './services/blog.service';
export { BlogUtilityService } from './services/blog-utility.service';
export { RichTextContentValidator } from './services/rich-text-validator.service';
export { SEOValidationService } from './services/seo-validation.service';
export { EnhancedExcerptGenerator } from './services/enhanced-excerpt-generator.service';
export { InternalLinkSuggestionsService } from './services/internal-link-suggestions.service';
export { blogSEOIntegrationService, BlogSEOIntegrationService } from './services/blog-seo-integration.service';
export { ContentOptimizationService } from './services/content-optimization.service';
export { RevisionComparisonService } from './services/revision-comparison.service';
export { ContentCalendarService } from './services/content-calendar.service';
export { EnhancedBulkOperationsService } from './services/enhanced-bulk-operations.service';

// Types
export type * from './types/blog.types';

// Schemas
export * from './schemas/blog.schema';

// Errors - Export individually to avoid naming conflicts
export {
  PostNotFoundError,
  CategoryNotFoundError,
  PostRevisionNotFoundError,
  DuplicateSlugError,
  CategoryInUseError,
  CircularCategoryReferenceError,
  InsufficientPermissionsError,
  InvalidStatusTransitionError,
  ScheduledDateInPastError,
  PostAlreadyPublishedError,
  BlogDatabaseError,
} from './errors/blog.errors';

// Router
export { blogRouter } from './routers/blog.router';
export type { BlogRouter } from './routers/blog.router';
export { contentOperationsRouter } from './routers/content-operations.router';
export type { ContentOperationsRouter } from './routers/content-operations.router';
export { contentOptimizationRouter } from './routers/content-optimization.router';
export { blogSEORouter } from './routers/blog-seo.router';
export type { BlogSEORouter } from './routers/blog-seo.router';
export { contentWorkflowRouter } from './routers/content-workflow.router';

// Re-export commonly used types
export type {
  Category,
  Post,
  PostRevision,
  CreatePostRequest,
  UpdatePostRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  PostsResponse,
  CategoriesResponse,
} from './types/blog.types';
