/**
 * Enhanced Excerpt Generation Service
 * Advanced excerpt generation with multiple strategies and quality optimization
 */

interface ExcerptGenerationOptions {
  maxLength: number;
  strategy: 'first-paragraph' | 'content-summary' | 'keyword-focused' | 'auto-best';
  preserveSentences: boolean;
  includeKeywords: boolean;
  targetKeywords?: string[];
  fallbackToTitle: boolean;
  minLength?: number;
}

interface ExcerptGenerationResult {
  excerpt: string;
  strategy: string;
  confidence: number; // 0-100, how confident we are in the quality
  wordCount: number;
  characterCount: number;
  warnings: string[];
  recommendations: string[];
}

export class EnhancedExcerptGenerator {
  private static readonly DEFAULT_OPTIONS: ExcerptGenerationOptions = {
    maxLength: 160,
    strategy: 'auto-best',
    preserveSentences: true,
    includeKeywords: true,
    fallbackToTitle: true,
    minLength: 50
  };

  /**
   * Generate an optimized excerpt from content
   */
  static generateExcerpt(
    content: string,
    options: Partial<ExcerptGenerationOptions> = {}
  ): ExcerptGenerationResult {
    const finalOptions = { ...this.DEFAULT_OPTIONS, ...options };
    
    // Clean content first
    const cleanContent = this.cleanContent(content);
    
    if (!cleanContent.trim()) {
      return {
        excerpt: '',
        strategy: 'empty',
        confidence: 0,
        wordCount: 0,
        characterCount: 0,
        warnings: ['Content is empty or contains no text'],
        recommendations: ['Provide meaningful content to generate an excerpt']
      };
    }

    let result: ExcerptGenerationResult;

    // Apply strategy
    switch (finalOptions.strategy) {
      case 'first-paragraph':
        result = this.generateFromFirstParagraph(cleanContent, finalOptions);
        break;
      case 'content-summary':
        result = this.generateContentSummary(cleanContent, finalOptions);
        break;
      case 'keyword-focused':
        result = this.generateKeywordFocused(cleanContent, finalOptions);
        break;
      case 'auto-best':
      default:
        result = this.generateBestExcerpt(cleanContent, finalOptions);
        break;
    }

    // Post-processing optimization
    result = this.optimizeExcerpt(result, finalOptions);
    
    return result;
  }

  /**
   * Clean HTML content and extract meaningful text
   */
  private static cleanContent(content: string): string {
    if (!content) return '';

    try {
      // Simple HTML tag removal without JSDOM dependency
      return content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
    } catch (error) {
      // Fallback: simple HTML tag removal
      return content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  /**
   * Extract paragraphs from content
   */
  private static extractParagraphs(content: string): string[] {
    // Extract paragraphs using regex pattern matching
    const paragraphMatches = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    
    if (paragraphMatches && paragraphMatches.length > 0) {
      const paragraphs = paragraphMatches
        .map(p => p.replace(/<[^>]*>/g, '').trim())
        .filter(p => p.length > 20); // Filter out very short paragraphs
      
      if (paragraphs.length > 0) {
        return paragraphs;
      }
    }
    
    // Fallback: split by double newlines or periods
    return this.cleanContent(content)
      .split(/\.\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 20);
  }

  /**
   * Generate excerpt from first paragraph
   */
  private static generateFromFirstParagraph(
    content: string,
    options: ExcerptGenerationOptions
  ): ExcerptGenerationResult {
    const paragraphs = this.extractParagraphs(content);
    
    if (paragraphs.length === 0) {
      return {
        excerpt: this.truncateText(content, options.maxLength, options.preserveSentences),
        strategy: 'first-paragraph-fallback',
        confidence: 30,
        wordCount: 0,
        characterCount: 0,
        warnings: ['No clear paragraphs found, used truncated content'],
        recommendations: ['Structure content with proper paragraphs']
      };
    }

    const firstParagraph = paragraphs[0];
    const excerpt = this.truncateText(firstParagraph, options.maxLength, options.preserveSentences);
    
    return {
      excerpt,
      strategy: 'first-paragraph',
      confidence: this.calculateConfidence(excerpt, options),
      wordCount: excerpt.split(/\s+/).length,
      characterCount: excerpt.length,
      warnings: [],
      recommendations: []
    };
  }

  /**
   * Generate content summary using key sentences
   */
  private static generateContentSummary(
    content: string,
    options: ExcerptGenerationOptions
  ): ExcerptGenerationResult {
    const sentences = this.extractSentences(content);
    
    if (sentences.length === 0) {
      return this.generateFromFirstParagraph(content, options);
    }

    // Score sentences based on various factors
    const scoredSentences = sentences.map(sentence => ({
      text: sentence,
      score: this.scoreSentence(sentence, content, options.targetKeywords)
    }));

    // Sort by score and select best sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let excerpt = '';
    let currentLength = 0;
    
    for (const sentence of scoredSentences) {
      const newLength = currentLength + sentence.text.length + (excerpt ? 2 : 0); // +2 for ". "
      
      if (newLength <= options.maxLength) {
        excerpt += (excerpt ? '. ' : '') + sentence.text;
        currentLength = newLength;
      } else {
        break;
      }
    }

    if (!excerpt) {
      excerpt = this.truncateText(scoredSentences[0].text, options.maxLength, true);
    }

    return {
      excerpt,
      strategy: 'content-summary',
      confidence: this.calculateConfidence(excerpt, options),
      wordCount: excerpt.split(/\s+/).length,
      characterCount: excerpt.length,
      warnings: [],
      recommendations: []
    };
  }

  /**
   * Generate keyword-focused excerpt
   */
  private static generateKeywordFocused(
    content: string,
    options: ExcerptGenerationOptions
  ): ExcerptGenerationResult {
    if (!options.targetKeywords || options.targetKeywords.length === 0) {
      // Auto-extract keywords
      options.targetKeywords = this.extractKeywords(content);
    }

    const sentences = this.extractSentences(content);
    const keywordSentences = sentences.filter(sentence => 
      options.targetKeywords!.some(keyword => 
        sentence.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    if (keywordSentences.length === 0) {
      return this.generateContentSummary(content, options);
    }

    // Find the best keyword-containing sentence
    const bestSentence = keywordSentences.reduce((best, current) => {
      const bestScore = this.scoreSentence(best, content, options.targetKeywords);
      const currentScore = this.scoreSentence(current, content, options.targetKeywords);
      return currentScore > bestScore ? current : best;
    });

    const excerpt = this.truncateText(bestSentence, options.maxLength, options.preserveSentences);

    return {
      excerpt,
      strategy: 'keyword-focused',
      confidence: this.calculateConfidence(excerpt, options),
      wordCount: excerpt.split(/\s+/).length,
      characterCount: excerpt.length,
      warnings: options.targetKeywords.length === 0 ? ['No keywords provided, auto-extracted'] : [],
      recommendations: []
    };
  }

  /**
   * Use the best strategy automatically
   */
  private static generateBestExcerpt(
    content: string,
    options: ExcerptGenerationOptions
  ): ExcerptGenerationResult {
    // Try different strategies and pick the best one
    const strategies: Array<ExcerptGenerationOptions['strategy']> = [
      'first-paragraph',
      'content-summary',
      'keyword-focused'
    ];

    const results = strategies.map(strategy => {
      const strategyOptions = { ...options, strategy };
      switch (strategy) {
        case 'first-paragraph':
          return this.generateFromFirstParagraph(content, strategyOptions);
        case 'content-summary':
          return this.generateContentSummary(content, strategyOptions);
        case 'keyword-focused':
          return this.generateKeywordFocused(content, strategyOptions);
        default:
          return this.generateFromFirstParagraph(content, strategyOptions);
      }
    });

    // Find the result with highest confidence
    const bestResult = results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    bestResult.strategy = 'auto-best';
    return bestResult;
  }

  /**
   * Extract sentences from content
   */
  private static extractSentences(content: string): string[] {
    const cleanContent = this.cleanContent(content);
    
    // Split by sentence endings, but be smart about abbreviations
    const sentences = cleanContent
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && !this.isAbbreviation(s));

    return sentences;
  }

  /**
   * Check if a sentence fragment is likely an abbreviation
   */
  private static isAbbreviation(text: string): boolean {
    const abbreviationPatterns = [
      /^[A-Z]{1,5}\.$/,  // Single abbreviations like "U.S."
      /\b[A-Z]\./,       // Single letters followed by period
      /^(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Corp)\.$/i
    ];
    
    return abbreviationPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Score a sentence based on relevance and quality
   */
  private static scoreSentence(
    sentence: string,
    fullContent: string,
    keywords?: string[]
  ): number {
    let score = 0;
    
    // Base score from length (prefer medium-length sentences)
    const idealLength = 100;
    const lengthScore = Math.max(0, 100 - Math.abs(sentence.length - idealLength));
    score += lengthScore * 0.3;

    // Position score (earlier sentences score higher)
    const position = fullContent.indexOf(sentence);
    const positionScore = Math.max(0, 100 - (position / fullContent.length) * 100);
    score += positionScore * 0.2;

    // Keyword score
    if (keywords && keywords.length > 0) {
      const keywordCount = keywords.filter(keyword => 
        sentence.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      score += (keywordCount / keywords.length) * 50;
    }

    // Quality indicators
    if (this.hasGoodSentenceStart(sentence)) {
      score += 10;
    }
    
    if (this.isCompleteSentence(sentence)) {
      score += 15;
    }

    // Penalize common weak starts
    if (this.hasWeakStart(sentence)) {
      score -= 20;
    }

    return score;
  }

  /**
   * Check if sentence has a good starting word
   */
  private static hasGoodSentenceStart(sentence: string): boolean {
    const goodStarts = [
      'discover', 'learn', 'explore', 'understand', 'find', 'get', 'create',
      'build', 'develop', 'improve', 'optimize', 'enhance', 'master'
    ];
    
    const firstWord = sentence.split(/\s+/)[0]?.toLowerCase();
    return goodStarts.includes(firstWord || '');
  }

  /**
   * Check if it's a complete sentence
   */
  private static isCompleteSentence(sentence: string): boolean {
    return /[.!?]$/.test(sentence.trim()) && 
           sentence.split(/\s+/).length >= 5 &&
           /^[A-Z]/.test(sentence.trim());
  }

  /**
   * Check for weak sentence starts
   */
  private static hasWeakStart(sentence: string): boolean {
    const weakStarts = [
      'the', 'this', 'that', 'these', 'those', 'it', 'there', 'here',
      'also', 'additionally', 'furthermore', 'moreover', 'however'
    ];
    
    const firstWord = sentence.split(/\s+/)[0]?.toLowerCase();
    return weakStarts.includes(firstWord || '');
  }

  /**
   * Extract key words/phrases from content
   */
  private static extractKeywords(content: string, maxKeywords: number = 5): string[] {
    const text = this.cleanContent(content).toLowerCase();
    const words = text.split(/\s+/);
    
    // Filter out stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'this', 'that', 'these',
      'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can'
    ]);

    // Count word frequency
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });

    // Return top keywords
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Truncate text intelligently
   */
  private static truncateText(
    text: string,
    maxLength: number,
    preserveSentences: boolean = true
  ): string {
    if (text.length <= maxLength) {
      return text;
    }

    if (preserveSentences) {
      // Find the last complete sentence within the limit
      const truncated = text.substring(0, maxLength);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );

      if (lastSentenceEnd > maxLength * 0.6) {
        return truncated.substring(0, lastSentenceEnd + 1).trim();
      }
    }

    // Find the last complete word
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.6) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Hard truncation as last resort
    return text.substring(0, maxLength - 3).trim() + '...';
  }

  /**
   * Calculate confidence score for excerpt quality
   */
  private static calculateConfidence(
    excerpt: string,
    options: ExcerptGenerationOptions
  ): number {
    let confidence = 50; // Base confidence

    // Length appropriateness
    const lengthRatio = excerpt.length / options.maxLength;
    if (lengthRatio >= 0.7 && lengthRatio <= 1.0) {
      confidence += 20;
    } else if (lengthRatio >= 0.5) {
      confidence += 10;
    }

    // Minimum length check
    if (options.minLength && excerpt.length >= options.minLength) {
      confidence += 15;
    }

    // Complete sentences
    if (this.isCompleteSentence(excerpt)) {
      confidence += 15;
    }

    // Keyword presence
    if (options.targetKeywords && options.targetKeywords.length > 0) {
      const keywordCount = options.targetKeywords.filter(keyword =>
        excerpt.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      confidence += (keywordCount / options.targetKeywords.length) * 20;
    }

    // Quality indicators
    if (!this.hasWeakStart(excerpt)) {
      confidence += 10;
    }

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Optimize excerpt post-generation
   */
  private static optimizeExcerpt(
    result: ExcerptGenerationResult,
    options: ExcerptGenerationOptions
  ): ExcerptGenerationResult {
    let optimizedExcerpt = result.excerpt;

    // Remove trailing incomplete words
    if (!optimizedExcerpt.endsWith('.') && !optimizedExcerpt.endsWith('...')) {
      const words = optimizedExcerpt.split(' ');
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        if (lastWord.length < 3 || !lastWord.match(/[.!?]$/)) {
          optimizedExcerpt = words.slice(0, -1).join(' ') + '...';
        }
      }
    }

    // Ensure proper capitalization
    optimizedExcerpt = optimizedExcerpt.charAt(0).toUpperCase() + optimizedExcerpt.slice(1);

    // Update word and character counts
    result.excerpt = optimizedExcerpt;
    result.wordCount = optimizedExcerpt.split(/\s+/).filter(word => word.length > 0).length;
    result.characterCount = optimizedExcerpt.length;

    // Recalculate confidence
    result.confidence = this.calculateConfidence(optimizedExcerpt, options);

    // Add quality recommendations
    if (result.confidence < 70) {
      result.recommendations.push('Consider manually crafting an excerpt for better quality');
    }
    
    if (result.characterCount < options.minLength!) {
      result.warnings.push(`Excerpt is shorter than recommended minimum (${options.minLength} chars)`);
    }

    return result;
  }

  /**
   * Generate multiple excerpt options
   */
  static generateExcerptOptions(
    content: string,
    baseOptions: Partial<ExcerptGenerationOptions> = {}
  ): ExcerptGenerationResult[] {
    const strategies: Array<ExcerptGenerationOptions['strategy']> = [
      'first-paragraph',
      'content-summary',
      'keyword-focused'
    ];

    const options = { ...this.DEFAULT_OPTIONS, ...baseOptions };
    
    return strategies.map(strategy => {
      const strategyOptions = { ...options, strategy };
      return this.generateExcerpt(content, strategyOptions);
    }).sort((a, b) => b.confidence - a.confidence);
  }
}
