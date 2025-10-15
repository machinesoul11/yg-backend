/**
 * SEO Module Index
 * Exports all SEO-related services, routers, and utilities
 */

// Services
export { seoMetadataService, SEOMetadataService } from '@/lib/services/seo-metadata.service';
export { metadataManagementService, MetadataManagementService } from '@/lib/services/metadata-management.service';
export { SearchEngineSubmissionService } from './services/search-engine-submission.service';
export { BlogRedirectService } from './services/blog-redirect.service';
export { paginationSEOService, PaginationSEOService } from './services/pagination-seo.service';
export { SEOIntegrationService, createSEOTrigger } from './services/seo-integration.service';

// Utilities
export { seoUtils } from '@/lib/utils/seo-utils';

// Router
export { seoManagementRouter } from './router';

// Types
export type {
  SEOContent,
  SEOConfig,
  OpenGraphTags,
  TwitterCardTags,
  RobotsDirectives,
  StructuredData,
  SEOMetadata,
} from '@/lib/services/seo-metadata.service';

export type {
  PageMetadata,
  MetadataContext,
  BreadcrumbItem,
  FAQItem,
  ProductInfo,
} from '@/lib/services/metadata-management.service';

export type {
  SitemapSubmissionResult,
  SitemapSubmissionSummary,
} from './services/search-engine-submission.service';

export type {
  CreateRedirectOptions,
  RedirectLookupResult,
  RedirectValidationResult,
} from './services/blog-redirect.service';

export type {
  PaginationMetadata,
  PaginationSEOTags,
  PaginationConfig,
} from './services/pagination-seo.service';

export type {
  SEOUpdateTrigger,
} from './services/seo-integration.service';

export type { SEOManagementRouter } from './router';
