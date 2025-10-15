/**
 * SEO Utilities
 * Helper functions and utilities for SEO metadata generation
 */

import { SEOContent, RobotsDirectives } from '../services/seo-metadata.service';

// ============================================================================
// Text Processing Utilities
// ============================================================================

export class SEOTextUtils {
  /**
   * Generate SEO-friendly slug from text
   */
  static generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      // Replace spaces and special characters with hyphens
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Extract excerpt from HTML content
   */
  static extractExcerpt(html: string, maxLength: number = 160): string {
    // Remove HTML tags
    const text = html.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    // Find the last complete sentence within the limit
    const truncated = cleaned.slice(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSentence > maxLength * 0.7) {
      return cleaned.slice(0, lastSentence + 1);
    }
    
    if (lastSpace > maxLength * 0.8) {
      return cleaned.slice(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Calculate reading time in minutes
   */
  static calculateReadingTime(text: string, wordsPerMinute: number = 200): number {
    const words = this.countWords(text);
    return Math.ceil(words / wordsPerMinute);
  }

  /**
   * Count words in text
   */
  static countWords(text: string): number {
    const plainText = text.replace(/<[^>]*>/g, ' ');
    const words = plainText.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Generate meta keywords from content
   */
  static extractKeywords(
    text: string, 
    maxKeywords: number = 10,
    minWordLength: number = 3
  ): string[] {
    const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
    
    // Common stop words to exclude
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
      'can', 'may', 'might', 'must', 'shall', 'this', 'that', 'these', 'those'
    ]);
    
    // Extract words
    const words = plainText
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, ''))
      .filter(word => 
        word.length >= minWordLength && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word) // Exclude pure numbers
      );
    
    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
    
    // Sort by frequency and return top keywords
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Validate and clean meta description
   */
  static cleanMetaDescription(description: string): string {
    return description
      .replace(/\s+/g, ' ')
      .replace(/[""'']/g, '"')
      .trim();
  }

  /**
   * Generate title variations for A/B testing
   */
  static generateTitleVariations(baseTitle: string): string[] {
    const variations: string[] = [baseTitle];
    
    // Add question format if applicable
    if (!baseTitle.includes('?') && !baseTitle.toLowerCase().startsWith('how')) {
      variations.push(`How to ${baseTitle.toLowerCase()}`);
    }
    
    // Add number format
    if (!/^\d/.test(baseTitle)) {
      variations.push(`5 ${baseTitle}`);
      variations.push(`10 ${baseTitle}`);
    }
    
    // Add year format
    const currentYear = new Date().getFullYear();
    if (!baseTitle.includes(currentYear.toString())) {
      variations.push(`${baseTitle} (${currentYear})`);
    }
    
    // Add definitive format
    if (!baseTitle.toLowerCase().includes('complete') && !baseTitle.toLowerCase().includes('ultimate')) {
      variations.push(`The Complete Guide to ${baseTitle}`);
      variations.push(`The Ultimate ${baseTitle} Guide`);
    }
    
    return variations.filter((title, index, array) => array.indexOf(title) === index);
  }
}

// ============================================================================
// Image Optimization Utilities
// ============================================================================

export class SEOImageUtils {
  /**
   * Generate optimized image URLs for different sizes
   */
  static generateImageVariants(baseUrl: string, sizes: number[] = [400, 800, 1200]): Record<string, string> {
    const variants: Record<string, string> = {};
    
    sizes.forEach(size => {
      variants[`${size}w`] = this.addImageParameters(baseUrl, { width: size });
    });
    
    return variants;
  }

  /**
   * Add image optimization parameters to URL
   */
  static addImageParameters(
    url: string, 
    params: { width?: number; height?: number; quality?: number; format?: string }
  ): string {
    try {
      const urlObj = new URL(url);
      
      if (params.width) urlObj.searchParams.set('w', params.width.toString());
      if (params.height) urlObj.searchParams.set('h', params.height.toString());
      if (params.quality) urlObj.searchParams.set('q', params.quality.toString());
      if (params.format) urlObj.searchParams.set('f', params.format);
      
      return urlObj.toString();
    } catch {
      // If URL parsing fails, return original URL
      return url;
    }
  }

  /**
   * Generate alt text for images based on context
   */
  static generateAltText(
    filename: string, 
    context?: { title?: string; description?: string }
  ): string {
    // Clean filename
    const cleanName = filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    
    if (context?.title) {
      return `${cleanName} - ${context.title}`;
    }
    
    return cleanName;
  }

  /**
   * Validate image for social media sharing
   */
  static validateSocialImage(
    imageUrl: string,
    platform: 'facebook' | 'twitter' | 'linkedin' = 'facebook'
  ): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check if URL is absolute
    if (!imageUrl.startsWith('http')) {
      issues.push('Image URL must be absolute (include http/https)');
    }
    
    // Platform-specific validations would go here
    // This is a simplified version - in practice, you'd validate dimensions, file size, etc.
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// ============================================================================
// URL and Path Utilities
// ============================================================================

export class SEOUrlUtils {
  /**
   * Generate canonical URL with proper handling of parameters
   */
  static generateCanonicalUrl(
    baseUrl: string,
    path: string,
    preserveParams: string[] = []
  ): string {
    try {
      const url = new URL(path, baseUrl);
      
      // Remove all parameters except preserved ones
      const paramsToKeep = new URLSearchParams();
      preserveParams.forEach(param => {
        const value = url.searchParams.get(param);
        if (value) {
          paramsToKeep.set(param, value);
        }
      });
      
      url.search = paramsToKeep.toString();
      
      // Remove trailing slash except for root
      let pathname = url.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      
      return `${url.origin}${pathname}${url.search ? '?' + url.search : ''}`;
    } catch {
      // Fallback for invalid URLs
      return `${baseUrl}${path}`;
    }
  }

  /**
   * Generate breadcrumb URLs
   */
  static generateBreadcrumbUrls(path: string, baseUrl: string): Array<{ name: string; url: string }> {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs: Array<{ name: string; url: string }> = [];
    
    // Add home
    breadcrumbs.push({ name: 'Home', url: baseUrl });
    
    // Add each segment
    let currentPath = '';
    segments.forEach(segment => {
      currentPath += `/${segment}`;
      const name = segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      breadcrumbs.push({
        name,
        url: `${baseUrl}${currentPath}`
      });
    });
    
    return breadcrumbs;
  }

  /**
   * Validate URL format
   */
  static validateUrl(url: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        errors.push('URL must use HTTP or HTTPS protocol');
      }
      
      // Check for common issues
      if (urlObj.pathname.includes('//')) {
        errors.push('URL contains double slashes in path');
      }
      
      if (urlObj.hash) {
        errors.push('Canonical URLs should not contain fragments (#)');
      }
      
    } catch {
      errors.push('Invalid URL format');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// ============================================================================
// Content Analysis Utilities
// ============================================================================

export class SEOContentAnalyzer {
  /**
   * Analyze content for SEO best practices
   */
  static analyzeContent(content: SEOContent): {
    score: number;
    issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }>;
    suggestions: string[];
  } {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }> = [];
    const suggestions: string[] = [];
    let score = 100;

    // Title analysis
    if (!content.title) {
      issues.push({ type: 'error', message: 'Title is required' });
      score -= 20;
    } else {
      if (content.title.length < 30) {
        issues.push({ type: 'warning', message: 'Title is too short (< 30 characters)' });
        score -= 5;
      }
      if (content.title.length > 60) {
        issues.push({ type: 'warning', message: 'Title is too long (> 60 characters)' });
        score -= 5;
      }
    }

    // Description analysis
    if (!content.seoDescription && !content.excerpt) {
      issues.push({ type: 'error', message: 'Meta description is required' });
      score -= 15;
    } else {
      const description = content.seoDescription || content.excerpt || '';
      if (description.length < 120) {
        issues.push({ type: 'warning', message: 'Meta description is too short (< 120 characters)' });
        score -= 5;
      }
      if (description.length > 160) {
        issues.push({ type: 'warning', message: 'Meta description is too long (> 160 characters)' });
        score -= 5;
      }
    }

    // Image analysis
    if (!content.featuredImageUrl) {
      issues.push({ type: 'info', message: 'No featured image provided' });
      suggestions.push('Add a featured image for better social media sharing');
      score -= 5;
    }

    // Content analysis
    if (content.content) {
      const wordCount = SEOTextUtils.countWords(content.content);
      if (wordCount < 300) {
        issues.push({ type: 'warning', message: 'Content is quite short (< 300 words)' });
        suggestions.push('Consider expanding the content for better SEO value');
        score -= 10;
      }
    }

    // Keywords analysis
    if (!content.seoKeywords && (!content.tags || content.tags.length === 0)) {
      issues.push({ type: 'info', message: 'No keywords or tags provided' });
      suggestions.push('Add relevant keywords or tags');
      score -= 5;
    }

    // Slug analysis
    if (!content.slug) {
      issues.push({ type: 'error', message: 'Slug is required' });
      score -= 10;
    } else if (!/^[a-z0-9-]+$/.test(content.slug)) {
      issues.push({ type: 'error', message: 'Slug contains invalid characters' });
      score -= 5;
    }

    return {
      score: Math.max(0, score),
      issues,
      suggestions
    };
  }

  /**
   * Generate SEO recommendations based on content analysis
   */
  static generateRecommendations(content: SEOContent): string[] {
    const recommendations: string[] = [];
    
    const analysis = this.analyzeContent(content);
    
    if (analysis.score < 80) {
      recommendations.push('Address the identified SEO issues to improve search visibility');
    }
    
    if (content.content && SEOTextUtils.countWords(content.content) < 500) {
      recommendations.push('Consider expanding the content to at least 500 words for better SEO');
    }
    
    if (!content.featuredImageUrl) {
      recommendations.push('Add a high-quality featured image (1200x630px recommended)');
    }
    
    if (!content.seoKeywords) {
      const extractedKeywords = SEOTextUtils.extractKeywords(content.content || content.title);
      if (extractedKeywords.length > 0) {
        recommendations.push(`Consider using these keywords: ${extractedKeywords.slice(0, 5).join(', ')}`);
      }
    }
    
    return recommendations;
  }

  /**
   * Check for common SEO issues
   */
  static checkCommonIssues(content: SEOContent): Array<{ issue: string; severity: 'high' | 'medium' | 'low' }> {
    const issues: Array<{ issue: string; severity: 'high' | 'medium' | 'low' }> = [];
    
    // Duplicate title and description
    if (content.title === content.seoDescription) {
      issues.push({
        issue: 'Title and meta description are identical',
        severity: 'medium'
      });
    }
    
    // Very short content
    if (content.content && SEOTextUtils.countWords(content.content) < 100) {
      issues.push({
        issue: 'Content is very short (thin content)',
        severity: 'high'
      });
    }
    
    // Missing alt text would be checked if we had image data
    
    // Too many tags
    if (content.tags && content.tags.length > 10) {
      issues.push({
        issue: 'Too many tags (keyword stuffing risk)',
        severity: 'medium'
      });
    }
    
    return issues;
  }
}

// ============================================================================
// Robots and Technical SEO Utilities
// ============================================================================

export class SEORobotsUtils {
  /**
   * Generate robots.txt content
   */
  static generateRobotsTxt(
    siteUrl: string,
    disallowedPaths: string[] = [],
    customRules: string[] = []
  ): string {
    const lines: string[] = [];
    
    lines.push('User-agent: *');
    
    // Add disallowed paths
    disallowedPaths.forEach(path => {
      lines.push(`Disallow: ${path}`);
    });
    
    // Add custom rules
    customRules.forEach(rule => {
      lines.push(rule);
    });
    
    // Add sitemap
    lines.push('');
    lines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
    
    return lines.join('\n');
  }

  /**
   * Generate meta robots based on content state
   */
  static generateMetaRobots(options: {
    isPublished: boolean;
    isDraft: boolean;
    isPrivate: boolean;
    allowArchiving?: boolean;
    allowSnippets?: boolean;
    maxSnippetLength?: number;
  }): RobotsDirectives {
    const directives: RobotsDirectives = {};
    
    // Index control
    if (options.isPrivate || options.isDraft || !options.isPublished) {
      directives.index = false;
    } else {
      directives.index = true;
    }
    
    // Follow control
    directives.follow = true; // Generally allow following links
    
    // Archive control
    if (options.allowArchiving === false) {
      directives.noarchive = true;
    }
    
    // Snippet control
    if (options.allowSnippets === false) {
      directives.nosnippet = true;
    } else if (options.maxSnippetLength) {
      directives['max-snippet'] = options.maxSnippetLength;
    }
    
    // Image preview
    directives['max-image-preview'] = 'large';
    
    return directives;
  }

  /**
   * Check if robots directives are appropriate for content type
   */
  static validateRobotsDirectives(
    directives: RobotsDirectives,
    contentType: string
  ): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check for conflicting directives
    if (directives.index === false && contentType === 'article') {
      warnings.push('Articles are typically indexed - consider if noindex is necessary');
    }
    
    if (directives.follow === false && contentType === 'homepage') {
      warnings.push('Homepage should typically allow following links');
    }
    
    if (directives.nosnippet && contentType === 'article') {
      warnings.push('Disabling snippets may reduce click-through rates for articles');
    }
    
    return {
      isValid: warnings.length === 0,
      warnings
    };
  }
}

// ============================================================================
// Export all utilities
// ============================================================================

export const seoUtils = {
  text: SEOTextUtils,
  image: SEOImageUtils,
  url: SEOUrlUtils,
  content: SEOContentAnalyzer,
  robots: SEORobotsUtils,
};
