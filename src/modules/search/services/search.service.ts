/**
 * Search Service - Core Implementation
 * Unified search service for assets, creators, projects, and licenses
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type {
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchableEntity,
  AssetSearchResult,
  CreatorSearchResult,
  ProjectSearchResult,
  LicenseSearchResult,
  ScoreBreakdown,
  SearchFacets,
  SearchConfig,
  EntityMetadata,
  SearchHighlights,
  SearchFilters,
  EnhancedSearchFacets,
  FacetGroup,
  FacetOption,
} from '../types/search.types';
import { DEFAULT_SEARCH_CONFIG } from '../types/search.types';
import { SpellCorrectionService } from './spell-correction.service';
import { RecommendationsService } from './recommendations.service';

/**
 * Unified Search Service
 * Handles multi-entity search with relevance scoring and ranking
 */
export class SearchService {
  private config: SearchConfig;
  private spellCorrection: SpellCorrectionService;
  private recommendations: RecommendationsService;

  constructor(
    private prisma: PrismaClient,
    config?: Partial<SearchConfig>
  ) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
    this.spellCorrection = new SpellCorrectionService(prisma);
    this.recommendations = new RecommendationsService(prisma);
  }

  /**
   * Main search method - coordinates searches across all specified entities
   */
  async search(query: SearchQuery, userId?: string): Promise<SearchResponse> {
    const startTime = Date.now();

    // Validate and parse query
    const parsedQuery = this.parseQuery(query.query);
    if (!parsedQuery) {
      return this.emptyResponse(query.query, 0);
    }

    // Default to all entities if none specified
    const entities = query.entities && query.entities.length > 0 
      ? query.entities 
      : ['assets', 'creators', 'projects', 'licenses'] as SearchableEntity[];

    // Execute searches in parallel
    const searchPromises = entities.map(entity => 
      this.searchEntity(entity, parsedQuery, query, userId)
    );

    const entityResults = await Promise.all(searchPromises);

    // Combine and rank results
    const allResults = entityResults.flat();
    const rankedResults = this.rankResults(allResults);

    // Apply pagination
    const page = query.pagination?.page || 1;
    const limit = Math.min(
      query.pagination?.limit || this.config.limits.defaultPageSize,
      this.config.limits.maxPageSize
    );
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = rankedResults.slice(startIndex, endIndex);

    // Generate facets
    const facets = this.generateFacets(allResults, entityResults);

    const executionTimeMs = Date.now() - startTime;

    // Track analytics (async, don't await)
    this.trackSearchAnalytics(query, allResults.length, executionTimeMs, userId).catch(err => {
      console.error('Failed to track search analytics:', err);
    });

    return {
      results: paginatedResults,
      pagination: {
        page,
        limit,
        total: rankedResults.length,
        totalPages: Math.ceil(rankedResults.length / limit),
        hasNextPage: endIndex < rankedResults.length,
        hasPreviousPage: page > 1,
      },
      facets,
      query: query.query,
      executionTimeMs,
    };
  }

  /**
   * Parse and clean search query
   */
  private parseQuery(query: string): string | null {
    const trimmed = query.trim();
    
    if (trimmed.length < this.config.parsing.minQueryLength) {
      return null;
    }
    
    if (trimmed.length > this.config.parsing.maxQueryLength) {
      return trimmed.substring(0, this.config.parsing.maxQueryLength);
    }

    // Remove special characters that might break SQL queries
    const sanitized = trimmed.replace(/[<>&'"\\]/g, '');
    
    return sanitized;
  }

  /**
   * Search a specific entity type
   */
  private async searchEntity(
    entityType: SearchableEntity,
    query: string,
    searchQuery: SearchQuery,
    userId?: string
  ): Promise<SearchResult[]> {
    switch (entityType) {
      case 'assets':
        return this.searchAssets(query, searchQuery, userId);
      case 'creators':
        return this.searchCreators(query, searchQuery, userId);
      case 'projects':
        return this.searchProjects(query, searchQuery, userId);
      case 'licenses':
        return this.searchLicenses(query, searchQuery, userId);
      default:
        return [];
    }
  }

  /**
   * Search IP Assets with permission filtering
   */
  private async searchAssets(
    query: string,
    searchQuery: SearchQuery,
    userId?: string
  ): Promise<SearchResult[]> {
    const filters = searchQuery.filters || {};
    
    // Build where clause with permission filtering
    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    // Apply permission filtering if userId provided
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          creator: true,
          brand: true,
        },
      });

      if (user) {
        if (user.role === 'CREATOR' && user.creator) {
          // Creators can only see assets they own
          where.ownerships = {
            some: {
              creatorId: user.creator.id,
              endDate: null, // Active ownership
            },
          };
        } else if (user.role === 'BRAND' && user.brand) {
          // Brands can only see assets in their licensed projects
          where.OR = [
            // Assets in projects they own
            {
              projectId: {
                in: await this.prisma.project
                  .findMany({
                    where: { brandId: user.brand.id, deletedAt: null },
                    select: { id: true },
                  })
                  .then(projects => projects.map(p => p.id)),
              },
            },
            // Assets they have active licenses for
            {
              licenses: {
                some: {
                  brandId: user.brand.id,
                  status: 'ACTIVE',
                  endDate: { gte: new Date() },
                },
              },
            },
          ];
          // Re-add text search to OR clause
          where.AND = [
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            },
          ];
          delete where.OR;
        }
        // ADMIN and VIEWER roles see all assets (no additional filtering)
      }
    }

    // Apply asset type filter
    if (filters.assetType && filters.assetType.length > 0) {
      where.type = { in: filters.assetType };
    }
    
    // Apply status filter
    if (filters.assetStatus && filters.assetStatus.length > 0) {
      where.status = { in: filters.assetStatus };
    }
    
    // Apply project filter
    if (filters.projectId) {
      where.projectId = filters.projectId;
    }
    
    // Apply creator filter (via ownership)
    if (filters.creatorId) {
      where.ownerships = {
        some: {
          creatorId: filters.creatorId,
          endDate: null,
        },
      };
    }
    
    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    // Apply tags filter (from metadata JSONB)
    if (filters.tags && filters.tags.length > 0) {
      where.metadata = {
        path: ['tags'],
        array_contains: filters.tags,
      };
    }

    // Apply createdBy filter
    if (filters.createdBy) {
      where.createdBy = filters.createdBy;
    }

    const assets = await this.prisma.ipAsset.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        storageKey: true,
        fileSize: true,
        mimeType: true,
        thumbnailUrl: true,
        previewUrl: true,
        metadata: true,
        createdBy: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: this.config.limits.maxResultsPerEntity,
    });

    return assets.map(asset => this.mapAssetToSearchResult(asset, query));
  }

  /**
   * Search Creators
   */
  private async searchCreators(
    query: string,
    searchQuery: SearchQuery,
    userId?: string
  ): Promise<SearchResult[]> {
    const filters = searchQuery.filters || {};
    
    const where: any = {
      deletedAt: null,
      OR: [
        { stageName: { contains: query, mode: 'insensitive' } },
        { bio: { contains: query, mode: 'insensitive' } },
      ],
    };

    // Apply verification status filter
    if (filters.verificationStatus && filters.verificationStatus.length > 0) {
      where.verificationStatus = { in: filters.verificationStatus };
    }

    // Apply specialties filter (JSONB array contains)
    if (filters.specialties && filters.specialties.length > 0) {
      where.specialties = {
        path: '$',
        array_contains: filters.specialties,
      };
    }

    // Apply industry/category filter (JSONB specialties)
    if (filters.industry && filters.industry.length > 0) {
      where.specialties = {
        path: '$',
        array_contains: filters.industry,
      };
    }

    if (filters.category && filters.category.length > 0) {
      where.specialties = {
        path: '$',
        array_contains: filters.category,
      };
    }

    // Apply availability status filter (JSONB)
    if (filters.availabilityStatus) {
      where.availability = {
        path: ['status'],
        equals: filters.availabilityStatus,
      };
    }

    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    const creators = await this.prisma.creator.findMany({
      where,
      select: {
        id: true,
        userId: true,
        stageName: true,
        bio: true,
        specialties: true,
        verificationStatus: true,
        portfolioUrl: true,
        availability: true,
        performanceMetrics: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            avatar: true,
          },
        },
      },
      take: this.config.limits.maxResultsPerEntity,
    });

    // Apply custom sort if performance metrics sorting is requested
    let sortedCreators = creators;
    if (searchQuery.sortBy && ['verified_at', 'total_collaborations', 'total_revenue', 'average_rating'].includes(searchQuery.sortBy)) {
      sortedCreators = this.sortCreatorsByMetrics(creators, searchQuery.sortBy, searchQuery.sortOrder || 'desc');
    }

    return sortedCreators.map(creator => this.mapCreatorToSearchResult(creator, query));
  }

  /**
   * Search Projects
   */
  private async searchProjects(
    query: string,
    searchQuery: SearchQuery,
    userId?: string
  ): Promise<SearchResult[]> {
    const filters = searchQuery.filters || {};
    
    const where: any = {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (filters.projectType && filters.projectType.length > 0) {
      where.projectType = { in: filters.projectType };
    }

    if (filters.projectStatus && filters.projectStatus.length > 0) {
      where.status = { in: filters.projectStatus };
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    const projects = await this.prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        projectType: true,
        budgetCents: true,
        brandId: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        brand: {
          select: {
            companyName: true,
          },
        },
      },
      take: this.config.limits.maxResultsPerEntity,
    });

    return projects.map(project => this.mapProjectToSearchResult(project, query));
  }

  /**
   * Search Licenses
   */
  private async searchLicenses(
    query: string,
    searchQuery: SearchQuery,
    userId?: string
  ): Promise<SearchResult[]> {
    const filters = searchQuery.filters || {};
    
    const where: any = {
      deletedAt: null,
      OR: [
        { ipAsset: { title: { contains: query, mode: 'insensitive' } } },
        { brand: { companyName: { contains: query, mode: 'insensitive' } } },
      ],
    };

    if (filters.licenseType && filters.licenseType.length > 0) {
      where.licenseType = { in: filters.licenseType };
    }

    if (filters.licenseStatus && filters.licenseStatus.length > 0) {
      where.status = { in: filters.licenseStatus };
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    const licenses = await this.prisma.license.findMany({
      where,
      select: {
        id: true,
        licenseType: true,
        status: true,
        feeCents: true,
        startDate: true,
        endDate: true,
        ipAssetId: true,
        brandId: true,
        createdAt: true,
        updatedAt: true,
        ipAsset: {
          select: {
            title: true,
          },
        },
        brand: {
          select: {
            companyName: true,
          },
        },
      },
      take: this.config.limits.maxResultsPerEntity,
    });

    return licenses.map(license => this.mapLicenseToSearchResult(license, query));
  }

  /**
   * Sort creators by performance metrics
   */
  private sortCreatorsByMetrics(
    creators: any[],
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): any[] {
    const sorted = [...creators].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortBy === 'verified_at') {
        aValue = a.verifiedAt ? new Date(a.verifiedAt).getTime() : 0;
        bValue = b.verifiedAt ? new Date(b.verifiedAt).getTime() : 0;
      } else {
        const aMetrics = (a.performanceMetrics as any) || {};
        const bMetrics = (b.performanceMetrics as any) || {};

        switch (sortBy) {
          case 'total_collaborations':
            aValue = aMetrics.totalCollaborations || 0;
            bValue = bMetrics.totalCollaborations || 0;
            break;
          case 'total_revenue':
            aValue = aMetrics.totalRevenue || 0;
            bValue = bMetrics.totalRevenue || 0;
            break;
          case 'average_rating':
            aValue = aMetrics.averageRating || 0;
            bValue = bMetrics.averageRating || 0;
            break;
          default:
            aValue = 0;
            bValue = 0;
        }
      }

      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    return sorted;
  }

  /**
   * Map asset to search result
   */
  private mapAssetToSearchResult(asset: any, query: string): SearchResult {
    const textualRelevance = this.calculateTextRelevance(query, asset.title, asset.description);
    const recencyScore = this.calculateRecencyScore(asset.createdAt);
    const popularityScore = 0.5; // Would come from metrics
    const qualityScore = 0.7; // Would come from asset quality metrics

    const scoreBreakdown = this.calculateFinalScore(
      textualRelevance,
      recencyScore,
      popularityScore,
      qualityScore
    );

    const metadata: EntityMetadata = {
      type: 'asset',
      assetType: asset.type,
      status: asset.status,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      thumbnailUrl: asset.thumbnailUrl,
      createdBy: asset.createdBy,
      tags: this.extractTags(asset.metadata),
    };

    return {
      id: asset.id,
      entityType: 'assets',
      title: asset.title,
      description: asset.description,
      relevanceScore: scoreBreakdown.finalScore,
      scoreBreakdown,
      highlights: this.generateHighlights(query, asset.title, asset.description),
      metadata,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  /**
   * Map creator to search result
   */
  private mapCreatorToSearchResult(creator: any, query: string): SearchResult {
    const textualRelevance = this.calculateTextRelevance(query, creator.stageName, creator.bio);
    const recencyScore = this.calculateRecencyScore(creator.createdAt);
    
    // Calculate popularity score based on performance metrics
    const performanceMetrics = creator.performanceMetrics as any;
    let popularityScore = 0.6;
    if (performanceMetrics) {
      const collaborations = performanceMetrics.totalCollaborations || 0;
      const revenue = performanceMetrics.totalRevenue || 0;
      const rating = performanceMetrics.averageRating || 0;
      
      // Normalize and combine metrics
      const collabScore = Math.min(collaborations / 50, 1.0) * 0.4;
      const revenueScore = Math.min(revenue / 100000, 1.0) * 0.3;
      const ratingScore = (rating / 5.0) * 0.3;
      
      popularityScore = collabScore + revenueScore + ratingScore;
    }
    
    // Quality score based on verification status
    let qualityScore = 0.5;
    if (creator.verificationStatus === 'approved') {
      qualityScore = 1.0;
    } else if (creator.verificationStatus === 'pending') {
      qualityScore = 0.7;
    }

    const scoreBreakdown = this.calculateFinalScore(
      textualRelevance,
      recencyScore,
      popularityScore,
      qualityScore
    );

    // Extract availability from JSONB
    const availability = creator.availability as any;
    const availabilityData = availability ? {
      status: availability.status,
      nextAvailable: availability.nextAvailable,
    } : null;

    // Extract performance metrics
    const metricsData = performanceMetrics ? {
      totalCollaborations: performanceMetrics.totalCollaborations,
      totalRevenue: performanceMetrics.totalRevenue,
      averageRating: performanceMetrics.averageRating,
      recentActivityScore: performanceMetrics.recentActivityScore,
    } : null;

    const metadata: EntityMetadata = {
      type: 'creator',
      stageName: creator.stageName,
      verificationStatus: creator.verificationStatus,
      specialties: creator.specialties || [],
      avatar: creator.user?.avatar,
      portfolioUrl: creator.portfolioUrl,
      availability: availabilityData,
      performanceMetrics: metricsData,
    };

    return {
      id: creator.id,
      entityType: 'creators',
      title: creator.stageName,
      description: creator.bio,
      relevanceScore: scoreBreakdown.finalScore,
      scoreBreakdown,
      highlights: this.generateHighlights(query, creator.stageName, creator.bio),
      metadata,
      createdAt: creator.createdAt,
      updatedAt: creator.updatedAt,
    };
  }

  /**
   * Map project to search result
   */
  private mapProjectToSearchResult(project: any, query: string): SearchResult {
    const textualRelevance = this.calculateTextRelevance(query, project.name, project.description);
    const recencyScore = this.calculateRecencyScore(project.createdAt);
    const popularityScore = 0.5;
    const qualityScore = 0.6;

    const scoreBreakdown = this.calculateFinalScore(
      textualRelevance,
      recencyScore,
      popularityScore,
      qualityScore
    );

    const metadata: EntityMetadata = {
      type: 'project',
      projectType: project.projectType,
      status: project.status,
      brandName: project.brand.companyName,
      budgetCents: project.budgetCents,
      startDate: project.startDate,
      endDate: project.endDate,
    };

    return {
      id: project.id,
      entityType: 'projects',
      title: project.name,
      description: project.description,
      relevanceScore: scoreBreakdown.finalScore,
      scoreBreakdown,
      highlights: this.generateHighlights(query, project.name, project.description),
      metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  /**
   * Map license to search result
   */
  private mapLicenseToSearchResult(license: any, query: string): SearchResult {
    const title = `${license.licenseType} License - ${license.ipAsset.title}`;
    const description = `License for ${license.brand.companyName}`;
    
    const textualRelevance = this.calculateTextRelevance(query, title, description);
    const recencyScore = this.calculateRecencyScore(license.createdAt);
    const popularityScore = 0.4;
    const qualityScore = license.status === 'ACTIVE' ? 1.0 : 0.5;

    const scoreBreakdown = this.calculateFinalScore(
      textualRelevance,
      recencyScore,
      popularityScore,
      qualityScore
    );

    const metadata: EntityMetadata = {
      type: 'license',
      licenseType: license.licenseType,
      status: license.status,
      feeCents: license.feeCents,
      startDate: license.startDate,
      endDate: license.endDate,
      assetTitle: license.ipAsset.title,
      brandName: license.brand.companyName,
    };

    return {
      id: license.id,
      entityType: 'licenses',
      title,
      description,
      relevanceScore: scoreBreakdown.finalScore,
      scoreBreakdown,
      highlights: this.generateHighlights(query, title, description),
      metadata,
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
    };
  }

  /**
   * Calculate textual relevance score
   */
  private calculateTextRelevance(query: string, title: string, description?: string | null): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const descLower = (description || '').toLowerCase();

    let score = 0;

    // Exact match in title (highest weight)
    if (titleLower === queryLower) {
      score += 1.0;
    }
    // Title contains query
    else if (titleLower.includes(queryLower)) {
      score += 0.7;
    }
    // Title contains query words
    else {
      const queryWords = queryLower.split(/\s+/);
      const titleWords = titleLower.split(/\s+/);
      const matchedWords = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw)));
      score += (matchedWords.length / queryWords.length) * 0.5;
    }

    // Description contains query
    if (descLower.includes(queryLower)) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate recency score using exponential decay
   */
  private calculateRecencyScore(createdAt: Date): number {
    const now = new Date();
    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    if (ageInDays > this.config.recency.maxAgeDays) {
      return 0;
    }

    // Exponential decay: score = e^(-λ * age)
    // where λ = ln(2) / halfLife
    const lambda = Math.log(2) / this.config.recency.halfLifeDays;
    const score = Math.exp(-lambda * ageInDays);
    
    return score;
  }

  /**
   * Calculate final composite score
   */
  private calculateFinalScore(
    textualRelevance: number,
    recencyScore: number,
    popularityScore: number,
    qualityScore: number
  ): ScoreBreakdown {
    const weights = this.config.weights;
    
    const finalScore = 
      textualRelevance * weights.textualRelevance +
      recencyScore * weights.recency +
      popularityScore * weights.popularity +
      qualityScore * weights.quality;

    return {
      textualRelevance,
      recencyScore,
      popularityScore,
      qualityScore,
      finalScore,
    };
  }

  /**
   * Rank search results by relevance score
   */
  private rankResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Generate search highlights
   */
  private generateHighlights(query: string, title: string, description?: string | null): SearchHighlights {
    const queryLower = query.toLowerCase();
    const highlights: SearchHighlights = {};

    // Highlight title
    if (title.toLowerCase().includes(queryLower)) {
      highlights.title = this.highlightText(title, query);
    }

    // Highlight description
    if (description && description.toLowerCase().includes(queryLower)) {
      highlights.description = this.highlightText(description, query);
    }

    return highlights;
  }

  /**
   * Highlight matching text
   */
  private highlightText(text: string, query: string): string {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Generate facets for filtering
   */
  private generateFacets(allResults: SearchResult[], entityResults: SearchResult[][]): SearchFacets {
    const entityCounts: Record<SearchableEntity, number> = {
      assets: 0,
      creators: 0,
      projects: 0,
      licenses: 0,
    };

    allResults.forEach(result => {
      entityCounts[result.entityType]++;
    });

    return {
      entityCounts,
    };
  }

  /**
   * Extract tags from metadata
   */
  private extractTags(metadata: any): string[] {
    if (!metadata || typeof metadata !== 'object') {
      return [];
    }
    return metadata.tags || [];
  }

  /**
   * Track search analytics
   */
  private async trackSearchAnalytics(
    query: SearchQuery,
    resultsCount: number,
    executionTimeMs: number,
    userId?: string
  ): Promise<void> {
    try {
      await this.prisma.searchAnalyticsEvent.create({
        data: {
          query: query.query,
          entities: query.entities || ['assets', 'creators', 'projects', 'licenses'],
          filters: query.filters || {},
          resultsCount,
          executionTimeMs,
          userId: userId || null,
        },
      });
    } catch (error) {
      // Log but don't throw - analytics tracking shouldn't break search
      console.error('Failed to track search analytics:', error);
    }
  }

  /**
   * Return empty search response
   */
  private emptyResponse(query: string, executionTimeMs: number): SearchResponse {
    return {
      results: [],
      pagination: {
        page: 1,
        limit: this.config.limits.defaultPageSize,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      facets: {
        entityCounts: {
          assets: 0,
          creators: 0,
          projects: 0,
          licenses: 0,
        },
      },
      query,
      executionTimeMs,
    };
  }

  /**
   * Get autocomplete suggestions for asset titles
   * Fast, optimized query for typeahead functionality
   */
  async getAssetSuggestions(
    query: string,
    userId?: string,
    limit: number = 10
  ): Promise<Array<{ id: string; title: string; type: string; status: string; thumbnailUrl?: string | null }>> {
    const trimmed = query.trim();
    
    if (trimmed.length < 2) {
      return [];
    }

    const where: any = {
      deletedAt: null,
      title: { contains: trimmed, mode: 'insensitive' },
    };

    // Apply permission filtering
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { creator: true, brand: true },
      });

      if (user?.role === 'CREATOR' && user.creator) {
        where.ownerships = {
          some: {
            creatorId: user.creator.id,
            endDate: null,
          },
        };
      } else if (user?.role === 'BRAND' && user.brand) {
        where.OR = [
          {
            projectId: {
              in: await this.prisma.project
                .findMany({
                  where: { brandId: user.brand.id, deletedAt: null },
                  select: { id: true },
                })
                .then(projects => projects.map(p => p.id)),
            },
          },
          {
            licenses: {
              some: {
                brandId: user.brand.id,
                status: 'ACTIVE',
                endDate: { gte: new Date() },
              },
            },
          },
        ];
      }
    }

    const suggestions = await this.prisma.ipAsset.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        thumbnailUrl: true,
      },
      take: limit,
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    return suggestions;
  }

  /**
   * Get faceted search results with counts
   * Returns available filter options with result counts
   */
  async getAssetFacets(
    query: string,
    userId?: string,
    existingFilters?: SearchFilters
  ): Promise<{
    types: Record<string, number>;
    statuses: Record<string, number>;
    projects: Array<{ id: string; name: string; count: number }>;
    creators: Array<{ id: string; name: string; count: number }>;
  }> {
    const baseWhere: any = {
      deletedAt: null,
    };

    // Add text search if query provided
    if (query && query.trim().length >= 2) {
      baseWhere.OR = [
        { title: { contains: query.trim(), mode: 'insensitive' } },
        { description: { contains: query.trim(), mode: 'insensitive' } },
      ];
    }

    // Apply permission filtering
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { creator: true, brand: true },
      });

      if (user?.role === 'CREATOR' && user.creator) {
        baseWhere.ownerships = {
          some: {
            creatorId: user.creator.id,
            endDate: null,
          },
        };
      } else if (user?.role === 'BRAND' && user.brand) {
        baseWhere.OR = [
          {
            projectId: {
              in: await this.prisma.project
                .findMany({
                  where: { brandId: user.brand.id, deletedAt: null },
                  select: { id: true },
                })
                .then(projects => projects.map(p => p.id)),
            },
          },
          {
            licenses: {
              some: {
                brandId: user.brand.id,
                status: 'ACTIVE',
                endDate: { gte: new Date() },
              },
            },
          },
        ];
      }
    }

    // Apply existing filters
    if (existingFilters?.projectId) {
      baseWhere.projectId = existingFilters.projectId;
    }
    if (existingFilters?.creatorId) {
      baseWhere.ownerships = {
        some: { creatorId: existingFilters.creatorId, endDate: null },
      };
    }
    if (existingFilters?.tags && existingFilters.tags.length > 0) {
      baseWhere.metadata = {
        path: ['tags'],
        array_contains: existingFilters.tags,
      };
    }

    // Get all matching assets for facet calculation
    const assets = await this.prisma.ipAsset.findMany({
      where: baseWhere,
      select: {
        type: true,
        status: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        ownerships: {
          where: { endDate: null },
          select: {
            creator: {
              select: {
                id: true,
                stageName: true,
              },
            },
          },
        },
      },
    });

    // Calculate facet counts
    const types: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    const projectMap = new Map<string, { name: string; count: number }>();
    const creatorMap = new Map<string, { name: string; count: number }>();

    assets.forEach(asset => {
      // Count types
      types[asset.type] = (types[asset.type] || 0) + 1;

      // Count statuses
      statuses[asset.status] = (statuses[asset.status] || 0) + 1;

      // Count projects
      if (asset.project) {
        const existing = projectMap.get(asset.project.id);
        if (existing) {
          existing.count++;
        } else {
          projectMap.set(asset.project.id, {
            name: asset.project.name,
            count: 1,
          });
        }
      }

      // Count creators
      asset.ownerships.forEach(ownership => {
        const creator = ownership.creator;
        const existing = creatorMap.get(creator.id);
        if (existing) {
          existing.count++;
        } else {
          creatorMap.set(creator.id, {
            name: creator.stageName,
            count: 1,
          });
        }
      });
    });

    return {
      types,
      statuses,
      projects: Array.from(projectMap.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      creators: Array.from(creatorMap.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    };
  }

  /**
   * Get user's recent searches
   */
  async getRecentSearches(userId: string, limit: number = 10): Promise<Array<{
    query: string;
    entities: string[];
    createdAt: Date;
  }>> {
    const recentSearches = await this.prisma.searchAnalyticsEvent.findMany({
      where: { userId },
      select: {
        query: true,
        entities: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      distinct: ['query'],
    });

    return recentSearches.map((search: any) => ({
      query: search.query,
      entities: (search.entities as any) || [],
      createdAt: search.createdAt,
    }));
  }

  /**
   * Get unified autocomplete suggestions across multiple entities
   * Returns suggestions from assets, creators, projects, and licenses based on query
   */
  async getSuggestions(
    query: string,
    userId?: string,
    entities?: SearchableEntity[],
    limit: number = 10
  ): Promise<Array<{
    id: string;
    title: string;
    type: 'asset' | 'creator' | 'project' | 'license';
    subtitle?: string;
    thumbnailUrl?: string | null;
  }>> {
    const trimmed = query.trim();
    
    if (trimmed.length < 2) {
      return [];
    }

    // Default to all entities if none specified
    const searchEntities = entities && entities.length > 0 
      ? entities 
      : ['assets', 'creators', 'projects', 'licenses'] as SearchableEntity[];

    const suggestions: Array<{
      id: string;
      title: string;
      type: 'asset' | 'creator' | 'project' | 'license';
      subtitle?: string;
      thumbnailUrl?: string | null;
    }> = [];

    const limitPerEntity = Math.ceil(limit / searchEntities.length);

    // Get asset suggestions
    if (searchEntities.includes('assets')) {
      const assetWhere: any = {
        deletedAt: null,
        title: { contains: trimmed, mode: 'insensitive' },
      };

      // Apply permission filtering for assets
      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { creator: true, brand: true },
        });

        if (user?.role === 'CREATOR' && user.creator) {
          assetWhere.ownerships = {
            some: {
              creatorId: user.creator.id,
              endDate: null,
            },
          };
        } else if (user?.role === 'BRAND' && user.brand) {
          assetWhere.OR = [
            {
              projectId: {
                in: await this.prisma.project
                  .findMany({
                    where: { brandId: user.brand.id, deletedAt: null },
                    select: { id: true },
                  })
                  .then(projects => projects.map(p => p.id)),
              },
            },
            {
              licenses: {
                some: {
                  brandId: user.brand.id,
                  status: 'ACTIVE',
                  endDate: { gte: new Date() },
                },
              },
            },
          ];
        }
      }

      const assets = await this.prisma.ipAsset.findMany({
        where: assetWhere,
        select: {
          id: true,
          title: true,
          type: true,
          thumbnailUrl: true,
        },
        take: limitPerEntity,
        orderBy: { createdAt: 'desc' },
      });

      suggestions.push(...assets.map(asset => ({
        id: asset.id,
        title: asset.title,
        type: 'asset' as const,
        subtitle: asset.type,
        thumbnailUrl: asset.thumbnailUrl,
      })));
    }

    // Get creator suggestions
    if (searchEntities.includes('creators')) {
      const creatorWhere: any = {
        deletedAt: null,
        OR: [
          { stageName: { contains: trimmed, mode: 'insensitive' } },
          { bio: { contains: trimmed, mode: 'insensitive' } },
        ],
      };

      const creators = await this.prisma.creator.findMany({
        where: creatorWhere,
        select: {
          id: true,
          stageName: true,
          verificationStatus: true,
        },
        take: limitPerEntity,
        orderBy: { createdAt: 'desc' },
      });

      suggestions.push(...creators.map(creator => ({
        id: creator.id,
        title: creator.stageName,
        type: 'creator' as const,
        subtitle: creator.verificationStatus || 'Creator',
        thumbnailUrl: null,
      })));
    }

    // Get project suggestions
    if (searchEntities.includes('projects')) {
      const projectWhere: any = {
        deletedAt: null,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { description: { contains: trimmed, mode: 'insensitive' } },
        ],
      };

      // Apply permission filtering for projects
      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { creator: true, brand: true },
        });

        if (user?.role === 'BRAND' && user.brand) {
          projectWhere.brandId = user.brand.id;
        }
      }

      const projects = await this.prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true,
          name: true,
          status: true,
        },
        take: limitPerEntity,
        orderBy: { createdAt: 'desc' },
      });

      suggestions.push(...projects.map(project => ({
        id: project.id,
        title: project.name,
        type: 'project' as const,
        subtitle: project.status || 'Project',
        thumbnailUrl: null,
      })));
    }

    // Get license suggestions
    if (searchEntities.includes('licenses')) {
      const licenseWhere: any = {
        deletedAt: null,
        OR: [
          { ipAsset: { title: { contains: trimmed, mode: 'insensitive' } } },
          { brand: { name: { contains: trimmed, mode: 'insensitive' } } },
        ],
      };

      // Apply permission filtering for licenses
      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { creator: true, brand: true },
        });

        if (user?.role === 'BRAND' && user.brand) {
          licenseWhere.brandId = user.brand.id;
        } else if (user?.role === 'CREATOR' && user.creator) {
          licenseWhere.ipAsset = {
            ownerships: {
              some: {
                creatorId: user.creator.id,
                endDate: null,
              },
            },
          };
        }
      }

      const licenses = await this.prisma.license.findMany({
        where: licenseWhere,
        select: {
          id: true,
          licenseType: true,
          ipAsset: {
            select: {
              title: true,
            },
          },
        },
        take: limitPerEntity,
        orderBy: { createdAt: 'desc' },
      });

      suggestions.push(...licenses.map(license => ({
        id: license.id,
        title: license.ipAsset.title,
        type: 'license' as const,
        subtitle: license.licenseType || 'License',
        thumbnailUrl: null,
      })));
    }

    // Sort by relevance (title match quality) and limit to total requested
    return suggestions
      .sort((a, b) => {
        const aExactMatch = a.title.toLowerCase() === trimmed.toLowerCase();
        const bExactMatch = b.title.toLowerCase() === trimmed.toLowerCase();
        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;
        
        const aStartsWith = a.title.toLowerCase().startsWith(trimmed.toLowerCase());
        const bStartsWith = b.title.toLowerCase().startsWith(trimmed.toLowerCase());
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        return 0;
      })
      .slice(0, limit);
  }

  /**
   * Get "did you mean" spell correction suggestion
   */
  async getSpellingSuggestion(query: string, currentResultCount: number) {
    return await this.spellCorrection.getDidYouMean(query, currentResultCount);
  }

  /**
   * Get related content recommendations
   */
  async getRelatedContent(
    entityType: SearchableEntity,
    entityId: string,
    userId?: string,
    options?: any
  ) {
    return await this.recommendations.getRelatedContent(
      entityType,
      entityId,
      userId,
      options
    );
  }

  /**
   * Get enhanced faceted search with counts for all filter options
   */
  async getEnhancedFacets(
    query: string,
    entities: SearchableEntity[],
    filters: SearchFilters = {},
    userId?: string
  ): Promise<EnhancedSearchFacets> {
    const facetGroups: FacetGroup[] = [];
    
    // Get base query for counting
    const baseQuery = query.trim();
    const hasQuery = baseQuery.length >= 2;

    // Build where clause based on current filters
    const buildBaseWhere = (entityType: SearchableEntity) => {
      const where: any = { deletedAt: null };
      
      if (hasQuery) {
        // Add text search based on entity type
        switch (entityType) {
          case 'assets':
            where.OR = [
              { title: { contains: baseQuery, mode: 'insensitive' } },
              { description: { contains: baseQuery, mode: 'insensitive' } },
            ];
            break;
          case 'creators':
            where.OR = [
              { stageName: { contains: baseQuery, mode: 'insensitive' } },
              { bio: { contains: baseQuery, mode: 'insensitive' } },
            ];
            break;
          case 'projects':
            where.OR = [
              { name: { contains: baseQuery, mode: 'insensitive' } },
              { description: { contains: baseQuery, mode: 'insensitive' } },
            ];
            break;
          case 'licenses':
            where.OR = [
              { ipAsset: { title: { contains: baseQuery, mode: 'insensitive' } } },
              { brand: { companyName: { contains: baseQuery, mode: 'insensitive' } } },
            ];
            break;
        }
      }
      
      return where;
    };

    // Asset Type Facet
    if (entities.includes('assets')) {
      const assetTypeWhere = buildBaseWhere('assets');
      
      // Apply other filters except assetType
      if (filters.assetStatus?.length) {
        assetTypeWhere.status = { in: filters.assetStatus };
      }
      if (filters.projectId) {
        assetTypeWhere.projectId = filters.projectId;
      }
      
      const assetTypes = await this.prisma.ipAsset.groupBy({
        by: ['type'],
        where: assetTypeWhere,
        _count: true,
      });

      const assetTypeOptions: FacetOption[] = assetTypes.map(item => ({
        value: item.type,
        label: item.type,
        count: item._count,
        isSelected: filters.assetType?.includes(item.type) || false,
      }));

      if (assetTypeOptions.length > 0) {
        facetGroups.push({
          field: 'assetType',
          label: 'Asset Type',
          type: 'checkbox',
          options: assetTypeOptions,
        });
      }
    }

    // Asset Status Facet
    if (entities.includes('assets')) {
      const assetStatusWhere = buildBaseWhere('assets');
      
      if (filters.assetType?.length) {
        assetStatusWhere.type = { in: filters.assetType };
      }
      if (filters.projectId) {
        assetStatusWhere.projectId = filters.projectId;
      }
      
      const assetStatuses = await this.prisma.ipAsset.groupBy({
        by: ['status'],
        where: assetStatusWhere,
        _count: true,
      });

      const statusOptions: FacetOption[] = assetStatuses.map(item => ({
        value: item.status,
        label: item.status,
        count: item._count,
        isSelected: filters.assetStatus?.includes(item.status) || false,
      }));

      if (statusOptions.length > 0) {
        facetGroups.push({
          field: 'assetStatus',
          label: 'Status',
          type: 'checkbox',
          options: statusOptions,
        });
      }
    }

    // Creator Verification Status Facet
    if (entities.includes('creators')) {
      const creatorVerificationWhere = buildBaseWhere('creators');
      
      if (filters.specialties?.length) {
        creatorVerificationWhere.specialties = {
          path: '$',
          array_contains: filters.specialties,
        };
      }
      
      const verificationStatuses = await this.prisma.creator.groupBy({
        by: ['verificationStatus'],
        where: creatorVerificationWhere,
        _count: true,
      });

      const verificationOptions: FacetOption[] = verificationStatuses.map(item => ({
        value: item.verificationStatus,
        label: item.verificationStatus,
        count: item._count,
        isSelected: filters.verificationStatus?.includes(item.verificationStatus) || false,
      }));

      if (verificationOptions.length > 0) {
        facetGroups.push({
          field: 'verificationStatus',
          label: 'Verification Status',
          type: 'checkbox',
          options: verificationOptions,
        });
      }
    }

    // Project Type Facet
    if (entities.includes('projects')) {
      const projectTypeWhere = buildBaseWhere('projects');
      
      if (filters.projectStatus?.length) {
        projectTypeWhere.status = { in: filters.projectStatus };
      }
      if (filters.brandId) {
        projectTypeWhere.brandId = filters.brandId;
      }
      
      const projectTypes = await this.prisma.project.groupBy({
        by: ['projectType'],
        where: projectTypeWhere,
        _count: true,
      });

      const projectTypeOptions: FacetOption[] = projectTypes.map(item => ({
        value: item.projectType,
        label: item.projectType,
        count: item._count,
        isSelected: filters.projectType?.includes(item.projectType) || false,
      }));

      if (projectTypeOptions.length > 0) {
        facetGroups.push({
          field: 'projectType',
          label: 'Project Type',
          type: 'checkbox',
          options: projectTypeOptions,
        });
      }
    }

    // License Type Facet
    if (entities.includes('licenses')) {
      const licenseTypeWhere = buildBaseWhere('licenses');
      
      if (filters.licenseStatus?.length) {
        licenseTypeWhere.status = { in: filters.licenseStatus };
      }
      if (filters.brandId) {
        licenseTypeWhere.brandId = filters.brandId;
      }
      
      const licenseTypes = await this.prisma.license.groupBy({
        by: ['licenseType'],
        where: licenseTypeWhere,
        _count: true,
      });

      const licenseTypeOptions: FacetOption[] = licenseTypes.map(item => ({
        value: item.licenseType,
        label: item.licenseType,
        count: item._count,
        isSelected: filters.licenseType?.includes(item.licenseType) || false,
      }));

      if (licenseTypeOptions.length > 0) {
        facetGroups.push({
          field: 'licenseType',
          label: 'License Type',
          type: 'checkbox',
          options: licenseTypeOptions,
        });
      }
    }

    // Calculate total results
    const totalResults = await this.countTotalResults(
      baseQuery,
      entities,
      {},
      userId
    );
    
    const filteredResults = await this.countTotalResults(
      baseQuery,
      entities,
      filters,
      userId
    );

    return {
      groups: facetGroups,
      appliedFilters: this.extractAppliedFilters(filters),
      totalResults,
      filteredResults,
    };
  }

  /**
   * Count total results across entities
   */
  private async countTotalResults(
    query: string,
    entities: SearchableEntity[],
    filters: SearchFilters,
    userId?: string
  ): Promise<number> {
    let total = 0;

    const hasQuery = query.trim().length >= 2;

    for (const entityType of entities) {
      const where: any = { deletedAt: null };

      // Apply text search
      if (hasQuery) {
        switch (entityType) {
          case 'assets':
            where.OR = [
              { title: { contains: query.trim(), mode: 'insensitive' } },
              { description: { contains: query.trim(), mode: 'insensitive' } },
            ];
            break;
          case 'creators':
            where.OR = [
              { stageName: { contains: query.trim(), mode: 'insensitive' } },
              { bio: { contains: query.trim(), mode: 'insensitive' } },
            ];
            break;
          case 'projects':
            where.OR = [
              { name: { contains: query.trim(), mode: 'insensitive' } },
              { description: { contains: query.trim(), mode: 'insensitive' } },
            ];
            break;
          case 'licenses':
            where.OR = [
              { ipAsset: { title: { contains: query.trim(), mode: 'insensitive' } } },
              { brand: { companyName: { contains: query.trim(), mode: 'insensitive' } } },
            ];
            break;
        }
      }

      // Apply filters
      this.applyFiltersToWhere(where, filters, entityType);

      // Count
      switch (entityType) {
        case 'assets':
          total += await this.prisma.ipAsset.count({ where });
          break;
        case 'creators':
          total += await this.prisma.creator.count({ where });
          break;
        case 'projects':
          total += await this.prisma.project.count({ where });
          break;
        case 'licenses':
          total += await this.prisma.license.count({ where });
          break;
      }
    }

    return total;
  }

  /**
   * Apply filters to where clause
   */
  private applyFiltersToWhere(
    where: any,
    filters: SearchFilters,
    entityType: SearchableEntity
  ): void {
    if (entityType === 'assets') {
      if (filters.assetType?.length) {
        where.type = { in: filters.assetType };
      }
      if (filters.assetStatus?.length) {
        where.status = { in: filters.assetStatus };
      }
      if (filters.projectId) {
        where.projectId = filters.projectId;
      }
    } else if (entityType === 'creators') {
      if (filters.verificationStatus?.length) {
        where.verificationStatus = { in: filters.verificationStatus };
      }
      if (filters.specialties?.length) {
        where.specialties = {
          path: '$',
          array_contains: filters.specialties,
        };
      }
    } else if (entityType === 'projects') {
      if (filters.projectType?.length) {
        where.projectType = { in: filters.projectType };
      }
      if (filters.projectStatus?.length) {
        where.status = { in: filters.projectStatus };
      }
      if (filters.brandId) {
        where.brandId = filters.brandId;
      }
    } else if (entityType === 'licenses') {
      if (filters.licenseType?.length) {
        where.licenseType = { in: filters.licenseType };
      }
      if (filters.licenseStatus?.length) {
        where.status = { in: filters.licenseStatus };
      }
      if (filters.brandId) {
        where.brandId = filters.brandId;
      }
    }

    // Common filters
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }
  }

  /**
   * Extract applied filters for display
   */
  private extractAppliedFilters(filters: SearchFilters): Record<string, string[]> {
    const applied: Record<string, string[]> = {};

    if (filters.assetType?.length) {
      applied.assetType = filters.assetType;
    }
    if (filters.assetStatus?.length) {
      applied.assetStatus = filters.assetStatus;
    }
    if (filters.verificationStatus?.length) {
      applied.verificationStatus = filters.verificationStatus;
    }
    if (filters.projectType?.length) {
      applied.projectType = filters.projectType;
    }
    if (filters.projectStatus?.length) {
      applied.projectStatus = filters.projectStatus;
    }
    if (filters.licenseType?.length) {
      applied.licenseType = filters.licenseType;
    }
    if (filters.licenseStatus?.length) {
      applied.licenseStatus = filters.licenseStatus;
    }

    return applied;
  }
}
