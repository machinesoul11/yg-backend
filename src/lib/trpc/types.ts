/**
 * Centralized tRPC Type Definitions
 * This file exports all shared types used across the frontend and backend
 * to ensure type safety and consistency between client and server
 */

// ============================================================================
// Missing Types - Frontend Integration
// ============================================================================

/**
 * Report Generation Types
 */
export interface GenerateReportRequest {
  reportType: 'revenue' | 'payouts' | 'tax' | 'reconciliation' | 'custom';
  parameters: Record<string, any>;
  format?: 'pdf' | 'csv' | 'excel' | 'json';
  name?: string;
  emailDelivery?: {
    recipients: string[];
    subject?: string;
    message?: string;
  };
}

export interface ArchivedReportItem {
  id: string;
  name: string;
  reportType: string;
  format: string;
  generatedAt: string; // ISO string for consistent date handling
  size: number;
  downloadUrl: string;
  status: 'completed' | 'failed' | 'expired';
  retentionPeriod: number; // days
  expiresAt: string; // ISO string
}

/**
 * Date Filter Types
 */
export interface DateRangeFilter {
  startDate: string; // ISO string
  endDate: string; // ISO string
  period?: '7d' | '30d' | '90d' | '1y' | 'custom';
}

/**
 * Content Optimization Types (Fixed Structure)
 */
export interface ContentOptimizationResult {
  overallScore: number; // 0-100
  keywordAnalysis: {
    singleWords: KeywordDensityResult[];
    twoWordPhrases: KeywordDensityResult[];
    threeWordPhrases: KeywordDensityResult[];
    totalWords: number;
    uniqueWords: number;
    averageWordsPerSentence: number;
    topKeywords: KeywordDensityResult[];
  };
  headingStructure: {
    isValid: boolean;
    headings: Array<{
      text: string;
      level: number;
      position: number;
    }>;
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      heading: string;
      level: number;
      position: number;
      message: string;
      suggestion: string;
    }>;
    outline: Array<{
      text: string;
      level: number;
      children: any[];
    }>;
    recommendations: string[];
  };
  readability: {
    metrics: {
      fleschReadingEase: number;
      fleschKincaidGradeLevel: number;
      averageWordsPerSentence: number;
      averageSyllablesPerWord: number;
      totalSentences: number;
      totalWords: number;
      totalSyllables: number;
      passiveVoicePercentage: number;
      complexWordsPercentage: number;
    };
    score: number; // 0-100 (higher = more readable)
    grade: string; // Changed from classification to grade
    interpretation: string;
    classification: 'very-easy' | 'easy' | 'fairly-easy' | 'standard' | 'fairly-difficult' | 'difficult' | 'very-difficult';
    issues: string[]; // Changed from recommendations to issues for consistency
    recommendations: string[];
  };
  imageValidation: {
    totalImages: number;
    validImages: number;
    invalidImages: number; // Calculated field: totalImages - validImages
    issues: Array<{
      src: string;
      issue: 'missing-alt' | 'empty-alt' | 'generic-alt' | 'too-long' | 'too-short' | 'filename-alt';
      currentAlt?: string;
      suggestion: string;
      severity: 'error' | 'warning' | 'info';
    }>;
    complianceScore: number; // 0-100
    recommendations: string[];
  };
  contentLength: {
    currentWordCount: number;
    currentCharacterCount: number;
    recommendedRange: { min: number; max: number };
    contentType: string;
    status: 'too-short' | 'optimal' | 'too-long' | 'within-range';
    competitorAnalysis?: {
      averageLength: number;
      topPerformingLength: number;
      rangeUsed: { min: number; max: number };
    };
    recommendations: string[];
  };
  internalLinking: {
    currentInternalLinks: number;
    recommendedCount: number;
    linkDensity: number; // links per 1000 words
    status: 'under-linked' | 'optimal' | 'over-linked';
    suggestions: Array<{
      anchor: string;
      targetPost: string;
      relevanceScore: number;
      context: string;
    }>;
    recommendations: string[];
  };
  summary: {
    strengths: string[];
    issues: string[];
    priority_fixes: string[];
    quick_wins: string[];
  };
  processingTime: number;
}

export interface KeywordDensityResult {
  keyword: string;
  frequency: number;
  density: number; // percentage
  classification: 'optimal' | 'low' | 'high' | 'excessive';
  recommendations: string[];
}

/**
 * SEO Analysis Types (Fixed naming)
 */
export interface SEOAnalysisResponse {
  success: boolean;
  analysis: {
    score: number;
    issues: Array<{ 
      type: 'error' | 'warning' | 'info'; 
      message: string;
      field?: string;
      severity?: 'critical' | 'high' | 'medium' | 'low';
    }>;
    commonIssues: string[]; // Changed from issues to commonIssues
    recommendations: string[];
    metrics?: {
      titleLength: number;
      descriptionLength: number;
      contentLength: number;
      keywordDensity: number;
      readabilityScore: number;
      imageCount: number;
      imagesWithAlt: number;
      internalLinks: number;
      externalLinks: number;
    };
    readingTime?: number;
    wordCount?: number;
  };
}

export interface SEOStatsResponse {
  sitemap: {
    url: string;
    publishedPosts: number;
    lastUpdated: string; // ISO string
  };
  redirects: {
    totalActive: number;
    totalHits: number;
    topPerformingRedirects: Array<{
      sourcePath: string;
      destinationPath: string;
      hitCount: number;
    }>;
  };
  robotsConfig: {
    activeRules: number;
  };
  metadata: {
    totalOptimizedPosts: number;
    averageSEOScore: number;
    postsNeedingAttention: number;
  };
}

/**
 * Media Management Types
 */
export interface GetVariantsInput {
  mediaItemId: string;
  variantTypes?: string[];
}

export interface GetMetadataInput {
  mediaItemId: string;
  includeGeneratedMetadata?: boolean;
}

export interface RegeneratePreviewInput {
  mediaItemId: string;
  forceRegeneration?: boolean;
}

export interface UploadConfirmation {
  mediaItemId: string;
  uploadUrl: string;
  variants: Array<{
    type: string;
    url: string;
    metadata: Record<string, any>;
  }>;
  generatedMetadata: {
    title?: string;
    description?: string;
    tags?: string[];
    dominantColors?: string[];
  };
}

/**
 * Analytics Types
 */
export interface PostAnalyticsOverview {
  totalViews: number;
  totalUniqueViews: number;
  averageViewDuration: number;
  engagementRate: number;
  topPosts: Array<{
    id: string;
    title: string;
    views: number;
    engagementScore: number;
  }>;
  performanceMetrics: {
    viewsGrowth: number;
    engagementGrowth: number;
    averageReadTime: number;
  };
  trafficSources: Array<{
    source: string;
    visits: number;
    percentage: number;
  }>;
}

/**
 * Fixed Date Handling Types
 * All dates should be consistently handled as ISO strings for API responses
 */
export interface OwnershipHistoryEntry {
  id: string;
  assetId: string;
  previousOwnerId?: string;
  newOwnerId: string;
  transferType: 'purchase' | 'gift' | 'inheritance' | 'dispute_resolution';
  transferDate: string; // ISO string
  transferAmount?: number;
  currency?: string;
  legalDocumentUrl?: string;
  notes?: string;
  ownership: {
    percentage: number;
    ownershipType: 'full' | 'partial' | 'shared';
    generatedAt: string; // ISO string - FIXED from Date to string
    validFrom: string; // ISO string
    validTo?: string; // ISO string
  };
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface ReportHistoryItem {
  id: string;
  name: string;
  reportType: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  generatedAt: string; // ISO string - FIXED from Date to string
  completedAt?: string; // ISO string
  downloadUrl?: string;
  fileSize?: number;
  parameters: Record<string, any>;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================================================
// Common Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  meta?: {
    filters?: Record<string, any>;
    sort?: {
      field: string;
      order: 'asc' | 'desc';
    };
  };
}

// ============================================================================
// Re-exports from existing modules for convenience
// ============================================================================

export type { User, License, Brand, Talent } from '@/types';

// Notification types
export type {
  NotificationResponse,
  NotificationListResponse,
  CreateNotificationInput,
  ListNotificationsInput,
} from '@/modules/system/types';
