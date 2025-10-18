/**
 * Search Module Index
 * Exports all search-related services, routers, and types
 */

// Services
export { SearchService } from './services/search.service';
export { SearchAnalyticsService } from './services/search-analytics.service';
export { SpellCorrectionService } from './services/spell-correction.service';
export { RecommendationsService } from './services/recommendations.service';

// Router
export { searchRouter } from './router';

// Types
export type {
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchableEntity,
  SearchFilters,
  SearchPagination,
  ScoreBreakdown,
  SearchHighlights,
  EntityMetadata,
  AssetMetadata,
  CreatorMetadata,
  ProjectMetadata,
  LicenseMetadata,
  SearchFacets,
  AssetSearchResult,
  CreatorSearchResult,
  ProjectSearchResult,
  LicenseSearchResult,
  SearchAnalyticsEvent,
  SearchAnalytics,
  SearchConfig,
  EnhancedSearchFacets,
  FacetGroup,
  FacetOption,
  SpellingSuggestion,
  DidYouMeanResponse,
  RelatedContent,
  RelatedContentOptions,
  RelationshipType,
} from './types/search.types';

// Validation
export {
  searchQuerySchema,
  searchFiltersSchema,
  searchAnalyticsQuerySchema,
  zeroResultQueriesSchema,
  performanceMetricsSchema,
  trendingSearchesSchema,
  trackClickSchema,
  enhancedFacetsSchema,
  spellCorrectionSchema,
  relatedContentSchema,
  updateSavedSearchSchema,
} from './validation/search.validation';

export type {
  SearchQueryInput,
  SearchFiltersInput,
  SearchAnalyticsQueryInput,
  ZeroResultQueriesInput,
  PerformanceMetricsInput,
  TrendingSearchesInput,
  TrackClickInput,
  EnhancedFacetsInput,
  SpellCorrectionInput,
  RelatedContentInput,
  UpdateSavedSearchInput,
} from './validation/search.validation';
