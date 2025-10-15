/**
 * SEO Validation Service
 * Comprehensive SEO analysis and validation for blog content
 */

interface SEOValidationConfig {
  titleMinLength: number;
  titleMaxLength: number;
  descriptionMinLength: number;
  descriptionMaxLength: number;
  keywordsDensityMax: number;
  requireFeaturedImage: boolean;
  siteTitle?: string;
  siteDomain?: string;
}

interface SEOValidationResult {
  isValid: boolean;
  score: number; // 0-100 SEO score
  errors: SEOValidationError[];
  warnings: SEOValidationWarning[];
  recommendations: SEOValidationRecommendation[];
  optimizations: SEOOptimization[];
}

interface SEOValidationError {
  type: 'TITLE' | 'DESCRIPTION' | 'KEYWORDS' | 'CONTENT' | 'IMAGES' | 'LINKS';
  message: string;
  field?: string;
  currentValue?: string;
  suggestedValue?: string;
  severity: 'error' | 'warning' | 'info';
}

interface SEOValidationWarning extends SEOValidationError {
  severity: 'warning';
}

interface SEOValidationRecommendation extends SEOValidationError {
  severity: 'info';
}

interface SEOOptimization {
  type: 'IMPROVEMENT' | 'ENHANCEMENT';
  category: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'moderate' | 'difficult';
}

interface SEOContent {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  featuredImageUrl?: string;
  tags?: string[];
}

export class SEOValidationService {
  private static readonly DEFAULT_CONFIG: SEOValidationConfig = {
    titleMinLength: 30,
    titleMaxLength: 60,
    descriptionMinLength: 120,
    descriptionMaxLength: 155,
    keywordsDensityMax: 3, // 3% max keyword density
    requireFeaturedImage: true,
    siteTitle: 'YesGoddess',
    siteDomain: 'yesgoddess.com'
  };

  /**
   * Comprehensive SEO validation for blog content
   */
  static validateSEO(
    content: SEOContent,
    config: Partial<SEOValidationConfig> = {}
  ): SEOValidationResult {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const result: SEOValidationResult = {
      isValid: true,
      score: 0,
      errors: [],
      warnings: [],
      recommendations: [],
      optimizations: []
    };

    let scorePoints = 0;
    const maxPoints = 100;

    // 1. Title Validation (25 points)
    scorePoints += this.validateTitle(content, finalConfig, result);

    // 2. Meta Description Validation (20 points)
    scorePoints += this.validateMetaDescription(content, finalConfig, result);

    // 3. Content SEO Validation (25 points)
    scorePoints += this.validateContentSEO(content, finalConfig, result);

    // 4. Keywords and Keyword Density (15 points)
    scorePoints += this.validateKeywords(content, finalConfig, result);

    // 5. Technical SEO (10 points)
    scorePoints += this.validateTechnicalSEO(content, finalConfig, result);

    // 6. Image SEO (5 points)
    scorePoints += this.validateImageSEO(content, finalConfig, result);

    result.score = Math.min(Math.round((scorePoints / maxPoints) * 100), 100);
    result.isValid = result.errors.length === 0;

    // Add optimization suggestions based on score
    this.generateOptimizations(result);

    return result;
  }

  /**
   * Validate title (both main title and SEO title)
   */
  private static validateTitle(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;
    const title = content.seoTitle || content.title;
    
    // Check title length (10 points)
    if (title.length < config.titleMinLength) {
      result.errors.push({
        type: 'TITLE',
        message: `Title is too short (${title.length} chars). Recommended: ${config.titleMinLength}-${config.titleMaxLength} characters.`,
        field: 'title',
        currentValue: title,
        severity: 'error'
      });
    } else if (title.length > config.titleMaxLength) {
      result.warnings.push({
        type: 'TITLE',
        message: `Title may be truncated in search results (${title.length} chars). Keep under ${config.titleMaxLength} characters.`,
        field: 'title',
        currentValue: title,
        severity: 'warning'
      });
      points += 5; // Partial points
    } else {
      points += 10; // Full points for good length
    }

    // Check for title uniqueness and descriptiveness (5 points)
    if (this.isTitleDescriptive(title)) {
      points += 5;
    } else {
      result.warnings.push({
        type: 'TITLE',
        message: 'Title could be more descriptive and specific.',
        field: 'title',
        severity: 'warning'
      });
    }

    // Check if title includes primary keyword (5 points)
    const primaryKeyword = this.extractPrimaryKeyword(content);
    if (primaryKeyword && title.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      points += 5;
    } else {
      result.recommendations.push({
        type: 'TITLE',
        message: 'Consider including the primary keyword in the title.',
        field: 'title',
        severity: 'info'
      });
    }

    // Check for title optimization patterns (5 points)
    if (this.hasTitleOptimizationPatterns(title)) {
      points += 5;
    } else {
      result.recommendations.push({
        type: 'TITLE',
        message: 'Consider using power words or numbers in the title for better engagement.',
        field: 'title',
        severity: 'info'
      });
    }

    // Check for site title branding
    if (config.siteTitle && !title.includes(config.siteTitle)) {
      result.recommendations.push({
        type: 'TITLE',
        message: `Consider adding "${config.siteTitle}" to improve brand recognition.`,
        field: 'seoTitle',
        suggestedValue: `${title} | ${config.siteTitle}`,
        severity: 'info'
      });
    }

    return points;
  }

  /**
   * Validate meta description
   */
  private static validateMetaDescription(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;
    const description = content.seoDescription || content.excerpt || '';

    if (!description) {
      result.errors.push({
        type: 'DESCRIPTION',
        message: 'Meta description is missing. This is crucial for search results.',
        field: 'seoDescription',
        severity: 'error'
      });
      return 0;
    }

    // Check description length (10 points)
    if (description.length < config.descriptionMinLength) {
      result.warnings.push({
        type: 'DESCRIPTION',
        message: `Meta description is too short (${description.length} chars). Recommended: ${config.descriptionMinLength}-${config.descriptionMaxLength} characters.`,
        field: 'seoDescription',
        currentValue: description,
        severity: 'warning'
      });
      points += 5; // Partial points
    } else if (description.length > config.descriptionMaxLength) {
      result.warnings.push({
        type: 'DESCRIPTION',
        message: `Meta description may be truncated (${description.length} chars). Keep under ${config.descriptionMaxLength} characters.`,
        field: 'seoDescription',
        currentValue: description,
        severity: 'warning'
      });
      points += 7; // Partial points
    } else {
      points += 10; // Full points for good length
    }

    // Check if description includes primary keyword (5 points)
    const primaryKeyword = this.extractPrimaryKeyword(content);
    if (primaryKeyword && description.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      points += 5;
    } else {
      result.recommendations.push({
        type: 'DESCRIPTION',
        message: 'Consider including the primary keyword in the meta description.',
        field: 'seoDescription',
        severity: 'info'
      });
    }

    // Check for call-to-action in description (3 points)
    if (this.hasCallToAction(description)) {
      points += 3;
    } else {
      result.recommendations.push({
        type: 'DESCRIPTION',
        message: 'Consider adding a call-to-action to improve click-through rates.',
        field: 'seoDescription',
        severity: 'info'
      });
    }

    // Check description uniqueness (2 points)
    if (this.isDescriptionUnique(description, content.title)) {
      points += 2;
    } else {
      result.warnings.push({
        type: 'DESCRIPTION',
        message: 'Meta description is too similar to the title. Make it more unique.',
        field: 'seoDescription',
        severity: 'warning'
      });
    }

    return points;
  }

  /**
   * Validate content SEO factors
   */
  private static validateContentSEO(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;
    const plainTextContent = content.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainTextContent.split(' ').length;

    // Check content length (8 points)
    if (wordCount < 300) {
      result.warnings.push({
        type: 'CONTENT',
        message: `Content is quite short (${wordCount} words). Consider expanding to at least 300 words.`,
        severity: 'warning'
      });
      points += 3;
    } else if (wordCount >= 300 && wordCount < 1000) {
      points += 6;
    } else if (wordCount >= 1000) {
      points += 8;
    }

    // Check heading structure (5 points)
    const headingStructure = this.analyzeHeadingStructure(content.content);
    if (headingStructure.hasH1 && headingStructure.hasSubheadings) {
      points += 5;
    } else if (headingStructure.hasH1) {
      points += 3;
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Add subheadings (H2, H3) to improve content structure.',
        severity: 'info'
      });
    } else {
      result.warnings.push({
        type: 'CONTENT',
        message: 'Content should have a clear heading structure (H1, H2, H3).',
        severity: 'warning'
      });
    }

    // Check keyword placement in headings (4 points)
    const primaryKeyword = this.extractPrimaryKeyword(content);
    if (primaryKeyword && this.isKeywordInHeadings(content.content, primaryKeyword)) {
      points += 4;
    } else {
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Consider including the primary keyword in at least one heading.',
        severity: 'info'
      });
    }

    // Check content readability (4 points)
    const readabilityScore = this.calculateReadabilityScore(plainTextContent);
    if (readabilityScore >= 70) {
      points += 4;
    } else if (readabilityScore >= 50) {
      points += 2;
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Consider simplifying language for better readability.',
        severity: 'info'
      });
    } else {
      result.warnings.push({
        type: 'CONTENT',
        message: 'Content readability could be improved. Use shorter sentences and simpler words.',
        severity: 'warning'
      });
    }

    // Check internal linking opportunities (4 points)
    const internalLinks = this.countInternalLinks(content.content, config.siteDomain || '');
    if (internalLinks >= 3) {
      points += 4;
    } else if (internalLinks >= 1) {
      points += 2;
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Consider adding more internal links to related content.',
        severity: 'info'
      });
    } else {
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Add internal links to related articles on your site.',
        severity: 'info'
      });
    }

    return points;
  }

  /**
   * Validate keywords and keyword density
   */
  private static validateKeywords(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;
    const plainTextContent = content.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryKeyword = this.extractPrimaryKeyword(content);

    if (!primaryKeyword) {
      result.warnings.push({
        type: 'KEYWORDS',
        message: 'No clear primary keyword identified. Consider optimizing for a specific keyword.',
        severity: 'warning'
      });
      return 0;
    }

    // Check keyword density (5 points)
    const keywordDensity = this.calculateKeywordDensity(plainTextContent, primaryKeyword);
    if (keywordDensity >= 0.5 && keywordDensity <= config.keywordsDensityMax) {
      points += 5;
    } else if (keywordDensity < 0.5) {
      result.recommendations.push({
        type: 'KEYWORDS',
        message: `Keyword "${primaryKeyword}" appears infrequently (${keywordDensity.toFixed(1)}%). Consider using it more naturally.`,
        severity: 'info'
      });
      points += 2;
    } else {
      result.warnings.push({
        type: 'KEYWORDS',
        message: `Keyword "${primaryKeyword}" density is too high (${keywordDensity.toFixed(1)}%). Risk of keyword stuffing.`,
        severity: 'warning'
      });
    }

    // Check keyword in first paragraph (3 points)
    const firstParagraph = this.extractFirstParagraph(content.content);
    if (firstParagraph.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      points += 3;
    } else {
      result.recommendations.push({
        type: 'KEYWORDS',
        message: `Include the primary keyword "${primaryKeyword}" in the first paragraph.`,
        severity: 'info'
      });
    }

    // Check for LSI keywords (4 points)
    const lsiKeywords = this.findLSIKeywords(content);
    if (lsiKeywords.length >= 3) {
      points += 4;
    } else {
      result.recommendations.push({
        type: 'KEYWORDS',
        message: 'Consider including related keywords and synonyms to improve topical relevance.',
        severity: 'info'
      });
      points += lsiKeywords.length;
    }

    // Check keyword in URL/slug (3 points)
    if (content.slug.toLowerCase().includes(primaryKeyword.toLowerCase().replace(/\s+/g, '-'))) {
      points += 3;
    } else {
      result.recommendations.push({
        type: 'KEYWORDS',
        message: `Consider including the primary keyword "${primaryKeyword}" in the URL slug.`,
        severity: 'info'
      });
    }

    return points;
  }

  /**
   * Validate technical SEO factors
   */
  private static validateTechnicalSEO(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;

    // Check slug optimization (3 points)
    if (this.isSlugOptimized(content.slug)) {
      points += 3;
    } else {
      result.recommendations.push({
        type: 'TITLE',
        message: 'URL slug could be more SEO-friendly. Use hyphens and avoid stop words.',
        field: 'slug',
        severity: 'info'
      });
    }

    // Check for proper HTML structure (3 points)
    if (this.hasProperHTMLStructure(content.content)) {
      points += 3;
    } else {
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Ensure proper HTML structure with semantic elements.',
        severity: 'info'
      });
    }

    // Check for schema markup opportunities (2 points)
    if (this.hasSchemaMarkupOpportunities(content)) {
      result.recommendations.push({
        type: 'CONTENT',
        message: 'Consider adding structured data (Schema.org) for better rich snippets.',
        severity: 'info'
      });
    } else {
      points += 2;
    }

    // Check content freshness (2 points)
    points += 2; // Assume content is fresh (new post)

    return points;
  }

  /**
   * Validate image SEO
   */
  private static validateImageSEO(
    content: SEOContent,
    config: SEOValidationConfig,
    result: SEOValidationResult
  ): number {
    let points = 0;

    // Check for featured image (2 points)
    if (content.featuredImageUrl) {
      points += 2;
    } else if (config.requireFeaturedImage) {
      result.warnings.push({
        type: 'IMAGES',
        message: 'Featured image is missing. This improves social sharing and SEO.',
        field: 'featuredImageUrl',
        severity: 'warning'
      });
    }

    // Check image alt text optimization (3 points)
    const imageAltScore = this.validateImageAltTexts(content.content);
    points += imageAltScore;

    if (imageAltScore < 3) {
      result.recommendations.push({
        type: 'IMAGES',
        message: 'Ensure all images have descriptive alt text including relevant keywords.',
        severity: 'info'
      });
    }

    return points;
  }

  /**
   * Helper methods for SEO validation
   */

  private static isTitleDescriptive(title: string): boolean {
    // Check for specific patterns that indicate descriptive titles
    const descriptivePatterns = [
      /\b(how|what|why|when|where|guide|tips|best|top|ultimate|complete)\b/i,
      /\d+/,  // Contains numbers
      /\b(vs|versus|compared|comparison)\b/i
    ];
    return descriptivePatterns.some(pattern => pattern.test(title));
  }

  private static extractPrimaryKeyword(content: SEOContent): string | null {
    // Extract from SEO keywords or analyze content
    if (content.seoKeywords) {
      return content.seoKeywords.split(',')[0].trim();
    }
    
    // Simple keyword extraction from title and content
    const titleWords = content.title.toLowerCase().split(/\s+/);
    const contentWords = content.content.toLowerCase().replace(/<[^>]*>/g, ' ').split(/\s+/);
    
    // Find most frequent meaningful words
    const wordFreq = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    [...titleWords, ...contentWords.slice(0, 100)].forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
    
    const sortedWords = Array.from(wordFreq.entries()).sort((a, b) => b[1] - a[1]);
    return sortedWords.length > 0 ? sortedWords[0][0] : null;
  }

  private static hasTitleOptimizationPatterns(title: string): boolean {
    const powerWords = ['ultimate', 'complete', 'essential', 'proven', 'effective', 'amazing', 'incredible'];
    const hasNumbers = /\d+/.test(title);
    const hasPowerWords = powerWords.some(word => title.toLowerCase().includes(word));
    
    return hasNumbers || hasPowerWords;
  }

  private static hasCallToAction(description: string): boolean {
    const ctaPatterns = [
      /\b(learn|discover|find out|explore|get|start|try|see|read|check)\b/i,
      /\b(click|visit|download|subscribe|join|sign up)\b/i
    ];
    return ctaPatterns.some(pattern => pattern.test(description));
  }

  private static isDescriptionUnique(description: string, title: string): boolean {
    const descWords = new Set(description.toLowerCase().split(/\s+/));
    const titleWords = new Set(title.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...descWords].filter(word => titleWords.has(word)));
    const similarity = intersection.size / Math.min(descWords.size, titleWords.size);
    
    return similarity < 0.7; // Less than 70% similarity
  }

  private static analyzeHeadingStructure(content: string): { hasH1: boolean; hasSubheadings: boolean; hierarchyValid: boolean } {
    const h1Match = /<h1[^>]*>/i.test(content);
    const subheadingMatch = /<h[2-6][^>]*>/i.test(content);
    
    return {
      hasH1: h1Match,
      hasSubheadings: subheadingMatch,
      hierarchyValid: true // Simplified for now
    };
  }

  private static isKeywordInHeadings(content: string, keyword: string): boolean {
    const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    const headings = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[1].toLowerCase());
    }
    
    return headings.some(heading => heading.includes(keyword.toLowerCase()));
  }

  private static calculateKeywordDensity(content: string, keyword: string): number {
    const words = content.toLowerCase().split(/\s+/);
    const keywordCount = words.filter(word => word.includes(keyword.toLowerCase())).length;
    return (keywordCount / words.length) * 100;
  }

  private static extractFirstParagraph(content: string): string {
    const match = content.match(/<p[^>]*>(.*?)<\/p>/i);
    return match ? match[1].replace(/<[^>]*>/g, '') : '';
  }

  private static findLSIKeywords(content: SEOContent): string[] {
    // Simplified LSI keyword detection
    // In a real implementation, this would use more sophisticated NLP
    const commonLSI = {
      'blog': ['article', 'post', 'content', 'writing'],
      'seo': ['optimization', 'search', 'ranking', 'keywords'],
      'marketing': ['promotion', 'advertising', 'brand', 'campaign']
    };
    
    const primaryKeyword = this.extractPrimaryKeyword(content);
    if (!primaryKeyword) return [];
    
    const lsiWords = commonLSI[primaryKeyword.toLowerCase() as keyof typeof commonLSI] || [];
    const contentLower = content.content.toLowerCase();
    
    return lsiWords.filter(word => contentLower.includes(word));
  }

  private static isSlugOptimized(slug: string): boolean {
    // Check for SEO-friendly slug patterns
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && 
           slug.length >= 3 && 
           slug.length <= 60;
  }

  private static hasProperHTMLStructure(content: string): boolean {
    // Basic check for semantic HTML
    const hasSemanticElements = /<(article|section|header|main|aside|nav|footer)/.test(content);
    const hasProperHeadings = /<h[1-6]/.test(content);
    
    return hasSemanticElements || hasProperHeadings;
  }

  private static hasSchemaMarkupOpportunities(content: SEOContent): boolean {
    // Check if content could benefit from schema markup
    const articleIndicators = ['how to', 'guide', 'tutorial', 'review'];
    const titleLower = content.title.toLowerCase();
    
    return articleIndicators.some(indicator => titleLower.includes(indicator));
  }

  private static calculateReadabilityScore(content: string): number {
    // Simplified Flesch Reading Ease score
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = content.split(/[aeiouAEIOU]/).length - 1;
    
    if (sentences === 0 || words === 0) return 0;
    
    const avgSentenceLength = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
    return Math.max(0, Math.min(100, score));
  }

  private static countInternalLinks(content: string, siteDomain: string): number {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let internalLinkCount = 0;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[1];
      if (url.includes(siteDomain) || url.startsWith('/')) {
        internalLinkCount++;
      }
    }
    
    return internalLinkCount;
  }

  private static validateImageAltTexts(content: string): number {
    const imgRegex = /<img[^>]*alt=["']([^"']*)["'][^>]*>/gi;
    const images = [];
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      images.push(match[1]);
    }
    
    if (images.length === 0) return 3; // No images, full points
    
    const optimizedAlts = images.filter(alt => 
      alt.length > 5 && alt.length < 125 && !alt.toLowerCase().includes('image')
    );
    
    return Math.round((optimizedAlts.length / images.length) * 3);
  }

  private static generateOptimizations(result: SEOValidationResult): void {
    if (result.score < 50) {
      result.optimizations.push({
        type: 'IMPROVEMENT',
        category: 'Critical SEO Issues',
        description: 'Address title, meta description, and content structure issues first.',
        impact: 'high',
        effort: 'easy'
      });
    }
    
    if (result.score >= 50 && result.score < 80) {
      result.optimizations.push({
        type: 'ENHANCEMENT',
        category: 'Content Optimization',
        description: 'Focus on keyword optimization and internal linking.',
        impact: 'medium',
        effort: 'moderate'
      });
    }
    
    if (result.score >= 80) {
      result.optimizations.push({
        type: 'ENHANCEMENT',
        category: 'Advanced SEO',
        description: 'Consider schema markup and advanced content optimization.',
        impact: 'low',
        effort: 'difficult'
      });
    }
  }
}
