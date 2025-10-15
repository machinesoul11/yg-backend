/**
 * Blog Utility Service
 * Common utility functions for blog operations
 */

import { SLUG_REGEX } from '../schemas/blog.schema';
import type { SlugGenerationOptions, ReadTimeCalculationOptions } from '../types/blog.types';
import { RichTextContentValidator } from './rich-text-validator.service';
import { SEOValidationService } from './seo-validation.service';
import { EnhancedExcerptGenerator } from './enhanced-excerpt-generator.service';
import { ContentOptimizationService } from './content-optimization.service';

export class BlogUtilityService {
  /**
   * Generate a URL-friendly slug from a title
   */
  static generateSlug(title: string, options: Partial<SlugGenerationOptions> = {}): string {
    const { existingSlugs = [], maxLength = 150 } = options;
    
    // Convert to lowercase and replace spaces/special chars with hyphens
    let slug = title
      .toLowerCase()
      .trim()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    // Truncate if too long
    if (slug.length > maxLength) {
      const lastHyphen = slug.lastIndexOf('-', maxLength);
      slug = lastHyphen > maxLength / 2 ? slug.substring(0, lastHyphen) : slug.substring(0, maxLength);
    }
    
    // Ensure it's not empty
    if (!slug) {
      slug = 'untitled';
    }
    
    // Handle duplicates by appending numbers
    let finalSlug = slug;
    let counter = 1;
    
    while (existingSlugs.includes(finalSlug)) {
      const suffix = `-${counter}`;
      const baseLength = maxLength - suffix.length;
      const baseSlug = slug.length > baseLength ? slug.substring(0, baseLength) : slug;
      finalSlug = `${baseSlug}${suffix}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 1000) {
        break;
      }
    }
    
    // Validate final slug
    if (!SLUG_REGEX.test(finalSlug)) {
      throw new Error(`Generated slug "${finalSlug}" is invalid`);
    }
    
    return finalSlug;
  }

  /**
   * Calculate estimated reading time for content
   */
  static calculateReadTime(content: string, options: Partial<ReadTimeCalculationOptions> = {}): number {
    const { wordsPerMinute = 200 } = options;
    
    // Strip HTML tags and normalize whitespace
    const plainText = content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Count words (split by whitespace and filter empty)
    const wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;
    
    // Calculate reading time in minutes (minimum 1 minute)
    const readTimeMinutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
    
    return readTimeMinutes;
  }

  /**
   * Validate slug format
   */
  static isValidSlug(slug: string): boolean {
    return SLUG_REGEX.test(slug);
  }

  /**
   * Enhanced content validation with rich text support
   */
  static validateRichTextContent(content: string) {
    return RichTextContentValidator.validateContent(content, {
      requireHeadings: true,
      validateLinks: true,
      minLength: 100
    });
  }

  /**
   * Comprehensive SEO validation
   */
  static validateSEO(content: {
    title: string;
    slug: string;
    content: string;
    excerpt?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string;
    featuredImageUrl?: string;
    tags?: string[];
  }) {
    return SEOValidationService.validateSEO(content);
  }

  /**
   * Generate enhanced excerpt with multiple strategies
   */
  static generateEnhancedExcerpt(content: string, options?: {
    maxLength?: number;
    strategy?: 'first-paragraph' | 'content-summary' | 'keyword-focused' | 'auto-best';
    targetKeywords?: string[];
  }) {
    return EnhancedExcerptGenerator.generateExcerpt(content, options);
  }

  /**
   * Generate multiple excerpt options for selection
   */
  static generateExcerptOptions(content: string, options?: {
    maxLength?: number;
    targetKeywords?: string[];
  }) {
    return EnhancedExcerptGenerator.generateExcerptOptions(content, options);
  }

  /**
   * Extract excerpt from content if not provided (legacy method for backward compatibility)
   */
  static generateExcerpt(content: string, maxLength: number = 160): string {
    // Strip HTML tags
    const plainText = content
      .replace(/<[^>]*>/g, ' ') // Replace HTML tags with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    
    // Find the last complete sentence within the limit
    const truncated = plainText.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxLength / 2) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }
    
    // Find the last complete word
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength / 2) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }
    
    // Fallback to hard truncation
    return truncated.trim() + '...';
  }

  /**
   * Sanitize and normalize tags
   */
  static normalizeTags(tags: string[]): string[] {
    return tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
      .sort(); // Sort alphabetically
  }

  /**
   * Generate SEO-friendly title
   */
  static generateSEOTitle(title: string, siteTitle?: string): string {
    const maxLength = 60; // Google's recommended max
    let seoTitle = title.trim();
    
    if (siteTitle && (seoTitle.length + siteTitle.length + 3) <= maxLength) {
      seoTitle = `${seoTitle} | ${siteTitle}`;
    }
    
    if (seoTitle.length > maxLength) {
      const truncated = seoTitle.substring(0, maxLength - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      seoTitle = lastSpace > maxLength / 2 
        ? truncated.substring(0, lastSpace) + '...'
        : truncated + '...';
    }
    
    return seoTitle;
  }

  /**
   * Generate SEO meta description
   */
  static generateSEODescription(content: string, excerpt?: string): string {
    const maxLength = 155; // Google's recommended max
    
    // Use excerpt if available, otherwise generate from content
    const source = excerpt || this.generateExcerpt(content, maxLength);
    
    if (source.length <= maxLength) {
      return source;
    }
    
    const truncated = source.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > maxLength / 2 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  /**
   * Parse and extract keywords from content
   */
  static extractKeywords(content: string, title: string, maxKeywords: number = 10): string[] {
    // Combine title and content for keyword extraction
    const text = `${title} ${content}`
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ') // Remove HTML
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those', 'i',
      'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
      'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
      'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
      'what', 'which', 'who', 'whom', 'this', 'that', 'am', 'is', 'are', 'was', 'were',
      'being', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'can', 'may', 'might', 'must', 'shall', 'not', 'no', 'nor',
      'if', 'then', 'else', 'when', 'where', 'how', 'why', 'again', 'further', 'then',
      'once'
    ]);
    
    // Split into words and count frequency
    const words = text.split(/\s+/);
    const wordCount = new Map<string, number>();
    
    words.forEach(word => {
      if (word.length >= 3 && !stopWords.has(word) && !/^\d+$/.test(word)) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });
    
    // Sort by frequency and return top keywords
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Validate post status transition
   */
  static isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['PUBLISHED', 'SCHEDULED', 'ARCHIVED'],
      PUBLISHED: ['ARCHIVED'],
      SCHEDULED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      ARCHIVED: ['DRAFT', 'PUBLISHED', 'SCHEDULED'],
    };
    
    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /**
   * Check if date is in the future
   */
  static isFutureDate(date: Date): boolean {
    return date.getTime() > Date.now();
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      ...options,
    };
    
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  }

  /**
   * Validate category hierarchy (prevent circular references)
   */
  static validateCategoryHierarchy(
    categoryId: string, 
    parentCategoryId: string | null,
    existingCategories: Array<{ id: string; parentCategoryId: string | null }>
  ): boolean {
    if (!parentCategoryId || parentCategoryId === categoryId) {
      return parentCategoryId !== categoryId; // Can't be its own parent
    }
    
    // Build parent chain to check for circles
    const visited = new Set<string>();
    let currentParentId: string | null = parentCategoryId;
    
    while (currentParentId && !visited.has(currentParentId)) {
      if (currentParentId === categoryId) {
        return false; // Circular reference detected
      }
      
      visited.add(currentParentId);
      const parent = existingCategories.find(cat => cat.id === currentParentId);
      currentParentId = parent?.parentCategoryId || null;
    }
    
    return true; // No circular reference
  }

  /**
   * Get comprehensive content optimization recommendations
   */
  static async getContentOptimizationRecommendations(
    content: string,
    title: string,
    contentOptimizationService: ContentOptimizationService
  ): Promise<{
    quickWins: string[];
    priorityFixes: string[];
    overallScore: number;
    readabilityScore: number;
    seoRecommendations: string[];
  }> {
    try {
      const optimization = await contentOptimizationService.analyzeContent(content, {
        title,
        contentType: 'default'
      });

      return {
        quickWins: optimization.summary.quick_wins,
        priorityFixes: optimization.summary.priority_fixes,
        overallScore: optimization.overallScore,
        readabilityScore: optimization.readability.score,
        seoRecommendations: [
          ...optimization.headingStructure.recommendations,
          ...optimization.imageValidation.recommendations,
          ...optimization.contentLength.recommendations
        ].slice(0, 5)
      };
    } catch (error) {
      // Return fallback recommendations if optimization fails
      return {
        quickWins: ['Review content structure and headings', 'Add alt text to images'],
        priorityFixes: ['Improve content readability'],
        overallScore: 50,
        readabilityScore: 50,
        seoRecommendations: ['Optimize title and meta description', 'Improve heading structure']
      };
    }
  }

  /**
   * Validate content meets minimum quality standards
   */
  static async validateContentQuality(
    content: string,
    title: string,
    contentOptimizationService: ContentOptimizationService
  ): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    score: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!title || title.length < 10) {
      errors.push('Title must be at least 10 characters long');
    }

    if (!content || content.length < 100) {
      errors.push('Content must be at least 100 characters long');
    }

    // Run rich text validation
    const richTextValidation = this.validateRichTextContent(content);
    if (!richTextValidation.isValid) {
      errors.push(...richTextValidation.errors.map(e => e.message));
    }

    // Run content optimization if available
    let score = 70; // Default score
    try {
      const optimization = await contentOptimizationService.analyzeContent(content, { title });
      score = optimization.overallScore;

      if (score < 50) {
        errors.push('Content quality score is below minimum threshold (50)');
      } else if (score < 70) {
        warnings.push('Content quality could be improved');
      }

      // Add specific quality warnings
      if (optimization.readability.score < 50) {
        warnings.push('Content readability needs improvement');
      }

      if (!optimization.headingStructure.isValid) {
        warnings.push('Heading structure needs to be fixed');
      }

      if (optimization.imageValidation.complianceScore < 80) {
        warnings.push('Image accessibility could be improved');
      }

    } catch (optimizationError) {
      warnings.push('Unable to run full content optimization analysis');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score
    };
  }

  /**
   * Build category breadcrumb path
   */
  static buildCategoryPath(
    categoryId: string,
    categories: Array<{ id: string; name: string; parentCategoryId: string | null }>
  ): Array<{ id: string; name: string }> {
    const path: Array<{ id: string; name: string }> = [];
    const visited = new Set<string>();
    let currentId: string | null = categoryId;
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = categories.find(cat => cat.id === currentId);
      if (!category) break;
      
      path.unshift({ id: category.id, name: category.name });
      currentId = category.parentCategoryId;
    }
    
    return path;
  }
}
