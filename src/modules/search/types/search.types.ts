/**
 * Search Service Types
 * Type definitions for unified search across multiple entities
 */

// ============================================================================
// ENUMS
// ============================================================================

export type SearchableEntity = 'assets' | 'creators' | 'projects' | 'licenses';

export type SearchSortBy = 
  | 'relevance' 
  | 'created_at' 
  | 'updated_at' 
  | 'title' 
  | 'name'
  | 'verified_at'
  | 'total_collaborations'
  | 'total_revenue'
  | 'average_rating';

export type SearchSortOrder = 'asc' | 'desc';

// ============================================================================
// SEARCH REQUEST
// ============================================================================

export interface SearchQuery {
  query: string;
  entities?: SearchableEntity[];
  filters?: SearchFilters;
  pagination?: SearchPagination;
  sortBy?: SearchSortBy;
  sortOrder?: SearchSortOrder;
}

export interface SearchFilters {
  // Asset filters
  assetType?: string[];
  assetStatus?: string[];
  projectId?: string; // Filter by specific project
  creatorId?: string; // Filter by creator (via ownership)
  
  // Creator filters
  verificationStatus?: string[];
  specialties?: string[];
  industry?: string[];
  category?: string[];
  country?: string;
  region?: string;
  city?: string;
  availabilityStatus?: 'available' | 'limited' | 'unavailable';
  
  // Project filters
  projectType?: string[];
  projectStatus?: string[];
  brandId?: string;
  
  // License filters
  licenseType?: string[];
  licenseStatus?: string[];
  
  // Common filters
  dateFrom?: Date;
  dateTo?: Date;
  createdBy?: string;
  tags?: string[];
}

export interface SearchPagination {
  page: number;
  limit: number;
}

// ============================================================================
// SEARCH RESPONSE
// ============================================================================

export interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  facets: SearchFacets;
  query: string;
  executionTimeMs: number;
}

export interface SearchResult {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  relevanceScore: number;
  scoreBreakdown: ScoreBreakdown;
  highlights: SearchHighlights;
  metadata: EntityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoreBreakdown {
  textualRelevance: number;
  recencyScore: number;
  popularityScore: number;
  qualityScore: number;
  finalScore: number;
}

export interface SearchHighlights {
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
}

export type EntityMetadata = 
  | AssetMetadata 
  | CreatorMetadata 
  | ProjectMetadata 
  | LicenseMetadata;

export interface AssetMetadata {
  type: 'asset';
  assetType: string;
  status: string;
  fileSize: bigint;
  mimeType: string;
  thumbnailUrl?: string | null;
  createdBy: string;
  tags?: string[];
}

export interface CreatorMetadata {
  type: 'creator';
  stageName: string;
  verificationStatus: string;
  specialties: string[];
  avatar?: string | null;
  portfolioUrl?: string | null;
  availability?: {
    status: 'available' | 'limited' | 'unavailable';
    nextAvailable?: string;
  } | null;
  performanceMetrics?: {
    totalCollaborations?: number;
    totalRevenue?: number;
    averageRating?: number;
    recentActivityScore?: number;
  } | null;
}

export interface ProjectMetadata {
  type: 'project';
  projectType: string;
  status: string;
  brandName: string;
  budgetCents: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface LicenseMetadata {
  type: 'license';
  licenseType: string;
  status: string;
  feeCents: number;
  startDate: Date;
  endDate: Date;
  assetTitle: string;
  brandName: string;
}

export interface SearchFacets {
  entityCounts: Record<SearchableEntity, number>;
  assetTypes?: Record<string, number>;
  projectTypes?: Record<string, number>;
  licenseTypes?: Record<string, number>;
  statuses?: Record<string, number>;
  verificationStatus?: Record<string, number>;
  specialties?: Array<{ value: string; count: number }>;
  brands?: Array<{ id: string; name: string; count: number }>;
  dateRanges?: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
    older: number;
  };
}

// ============================================================================
// SPELL CORRECTION & SUGGESTIONS
// ============================================================================

export interface SpellingSuggestion {
  originalQuery: string;
  suggestedQuery: string;
  confidence: number; // 0-1, how confident we are in the suggestion
  expectedResultCount: number; // How many results the suggestion would return
  distance: number; // Levenshtein distance or similar metric
}

export interface DidYouMeanResponse {
  hasAlternative: boolean;
  suggestion?: SpellingSuggestion;
  alternatives?: SpellingSuggestion[]; // Multiple suggestions if available
}

// ============================================================================
// RELATED CONTENT
// ============================================================================

export interface RelatedContent {
  id: string;
  entityType: SearchableEntity;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  relevanceScore: number;
  relationshipType: RelationshipType;
  relationshipReason: string;
  metadata: EntityMetadata;
}

export type RelationshipType = 
  | 'similar_content' 
  | 'same_category' 
  | 'same_creator' 
  | 'same_project'
  | 'collaborative_filtering'
  | 'frequently_viewed_together';

export interface RelatedContentOptions {
  limit?: number;
  includeTypes?: RelationshipType[];
  excludeIds?: string[];
  minRelevanceScore?: number;
}

// ============================================================================
// ENHANCED FACETED SEARCH
// ============================================================================

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  isSelected?: boolean;
}

export interface FacetGroup {
  field: string;
  label: string;
  type: 'checkbox' | 'radio' | 'range' | 'date';
  options: FacetOption[];
  min?: number;
  max?: number;
}

export interface EnhancedSearchFacets {
  groups: FacetGroup[];
  appliedFilters: Record<string, string[]>;
  totalResults: number;
  filteredResults: number;
}

// ============================================================================
// ENTITY-SPECIFIC RESULTS
// ============================================================================

export interface AssetSearchResult {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  storageKey: string;
  fileSize: bigint;
  mimeType: string;
  thumbnailUrl?: string | null;
  tags?: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatorSearchResult {
  id: string;
  userId: string;
  stageName: string;
  bio?: string | null;
  specialties: string[];
  verificationStatus: string;
  portfolioUrl?: string | null;
  avatar?: string | null;
  availability?: any;
  performanceMetrics?: any;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date | null;
}

export interface ProjectSearchResult {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  projectType: string;
  budgetCents: number;
  brandId: string;
  brandName: string;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseSearchResult {
  id: string;
  licenseType: string;
  status: string;
  feeCents: number;
  startDate: Date;
  endDate: Date;
  ipAssetId: string;
  assetTitle: string;
  brandId: string;
  brandName: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SEARCH ANALYTICS
// ============================================================================

export interface SearchAnalyticsEvent {
  id: string;
  query: string;
  entities: SearchableEntity[];
  filters?: Record<string, any>;
  resultsCount: number;
  executionTimeMs: number;
  userId?: string | null;
  sessionId?: string | null;
  clickedResultId?: string | null;
  clickedResultPosition?: number | null;
  clickedResultEntityType?: SearchableEntity | null;
  createdAt: Date;
}

export interface SearchAnalytics {
  totalSearches: number;
  averageExecutionTimeMs: number;
  averageResultsCount: number;
  zeroResultsRate: number;
  clickThroughRate: number;
  topQueries: Array<{
    query: string;
    count: number;
    averageResultsCount: number;
  }>;
  topEntities: Array<{
    entity: SearchableEntity;
    searchCount: number;
  }>;
  zeroResultQueries: Array<{
    query: string;
    count: number;
  }>;
}

// ============================================================================
// SEARCH CONFIGURATION
// ============================================================================

export interface SearchConfig {
  // Scoring weights (must sum to 1.0)
  weights: {
    textualRelevance: number;
    recency: number;
    popularity: number;
    quality: number;
  };
  
  // Recency decay settings
  recency: {
    halfLifeDays: number; // How many days until score halves
    maxAgeDays: number;   // Maximum age to consider
  };
  
  // Popularity normalization
  popularity: {
    viewCountWeight: number;
    usageCountWeight: number;
    favoriteCountWeight: number;
  };
  
  // Query parsing
  parsing: {
    minQueryLength: number;
    maxQueryLength: number;
    stopWords: string[];
    enableStemming: boolean;
    enableSynonyms: boolean;
  };
  
  // Result limits
  limits: {
    maxResultsPerEntity: number;
    defaultPageSize: number;
    maxPageSize: number;
  };
}

export const DEFAULT_SEARCH_CONFIG = {
  weights: {
    textualRelevance: 0.5,
    recency: 0.2,
    popularity: 0.2,
    quality: 0.1,
  },
  recency: {
    halfLifeDays: 90,
    maxAgeDays: 730, // 2 years
  },
  popularity: {
    viewCountWeight: 0.5,
    usageCountWeight: 0.3,
    favoriteCountWeight: 0.2,
  },
  parsing: {
    minQueryLength: 2,
    maxQueryLength: 200,
    stopWords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
    enableStemming: false,
    enableSynonyms: false,
  },
  limits: {
    maxResultsPerEntity: 100,
    defaultPageSize: 20,
    maxPageSize: 100,
  },
};
