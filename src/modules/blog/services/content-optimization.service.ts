/**
 * Content Optimization Service
 * Comprehensive content analysis and optimization features for blog posts
 * Includes keyword density, heading structure, readability, content length, and image validation
 */

import { PrismaClient } from '@prisma/client';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ContentOptimizationConfig {
  keywordDensity: {
    optimalMin: number; // 1%
    optimalMax: number; // 3%
    warningThreshold: number; // 5%
  };
  headingStructure: {
    requireH1: boolean;
    maxSkippedLevels: number;
    maxDepth: number;
  };
  readability: {
    targetGradeLevel: number; // 8-10 for general audience
    preferredReadingEase: { min: number; max: number }; // 60-70
  };
  contentLength: {
    defaultTargets: {
      tutorial: { min: number; max: number };
      guide: { min: number; max: number };
      news: { min: number; max: number };
      opinion: { min: number; max: number };
      review: { min: number; max: number };
      default: { min: number; max: number };
    };
  };
  imageValidation: {
    maxAltTextLength: number;
    minAltTextLength: number;
    requireAltText: boolean;
  };
}

interface KeywordDensityResult {
  keyword: string;
  frequency: number;
  density: number; // percentage
  classification: 'optimal' | 'low' | 'high' | 'excessive';
  recommendations: string[];
}

interface KeywordAnalysis {
  singleWords: KeywordDensityResult[];
  twoWordPhrases: KeywordDensityResult[];
  threeWordPhrases: KeywordDensityResult[];
  totalWords: number;
  uniqueWords: number;
  averageWordsPerSentence: number;
  topKeywords: KeywordDensityResult[];
}

interface HeadingStructureIssue {
  type: 'error' | 'warning' | 'info';
  heading: string;
  level: number;
  position: number;
  message: string;
  suggestion: string;
}

interface HeadingStructureResult {
  isValid: boolean;
  headings: Array<{
    text: string;
    level: number;
    position: number;
  }>;
  issues: HeadingStructureIssue[];
  outline: Array<{
    text: string;
    level: number;
    children: any[];
  }>;
  recommendations: string[];
}

interface ReadabilityMetrics {
  fleschReadingEase: number;
  fleschKincaidGradeLevel: number;
  averageWordsPerSentence: number;
  averageSyllablesPerWord: number;
  totalSentences: number;
  totalWords: number;
  totalSyllables: number;
  passiveVoicePercentage: number;
  complexWordsPercentage: number;
}

interface ReadabilityResult {
  metrics: ReadabilityMetrics;
  score: number; // 0-100 (higher = more readable)
  grade: string; // Fixed: changed from gradeLevel to grade for frontend compatibility
  interpretation: string;
  classification: 'very-easy' | 'easy' | 'fairly-easy' | 'standard' | 'fairly-difficult' | 'difficult' | 'very-difficult';
  issues: string[]; // Added: issues field for frontend compatibility
  recommendations: string[];
}

interface ImageValidationIssue {
  src: string;
  issue: 'missing-alt' | 'empty-alt' | 'generic-alt' | 'too-long' | 'too-short' | 'filename-alt';
  currentAlt?: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'info';
}

interface ImageValidationResult {
  totalImages: number;
  validImages: number;
  invalidImages: number; // Added: calculated field for frontend compatibility
  issues: ImageValidationIssue[];
  complianceScore: number; // 0-100
  recommendations: string[];
}

interface ContentLengthAnalysis {
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
}

interface InternalLinkingAnalysis {
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
}

interface ContentOptimizationResult {
  overallScore: number; // 0-100
  keywordAnalysis: KeywordAnalysis;
  headingStructure: HeadingStructureResult;
  readability: ReadabilityResult;
  imageValidation: ImageValidationResult;
  contentLength: ContentLengthAnalysis;
  internalLinking: InternalLinkingAnalysis;
  summary: {
    strengths: string[];
    issues: string[];
    priority_fixes: string[];
    quick_wins: string[];
  };
  processingTime: number;
}

// ============================================================================
// Content Optimization Service
// ============================================================================

export class ContentOptimizationService {
  private static readonly DEFAULT_CONFIG: ContentOptimizationConfig = {
    keywordDensity: {
      optimalMin: 1,
      optimalMax: 3,
      warningThreshold: 5
    },
    headingStructure: {
      requireH1: true,
      maxSkippedLevels: 0,
      maxDepth: 6
    },
    readability: {
      targetGradeLevel: 9,
      preferredReadingEase: { min: 60, max: 70 }
    },
    contentLength: {
      defaultTargets: {
        tutorial: { min: 1500, max: 3000 },
        guide: { min: 2000, max: 4000 },
        news: { min: 300, max: 800 },
        opinion: { min: 600, max: 1200 },
        review: { min: 800, max: 1500 },
        default: { min: 800, max: 2000 }
      }
    },
    imageValidation: {
      maxAltTextLength: 125,
      minAltTextLength: 10,
      requireAltText: true
    }
  };

  constructor(private prisma: PrismaClient) {}

  /**
   * Comprehensive content optimization analysis
   */
  async analyzeContent(
    content: string,
    options: {
      title?: string;
      contentType?: string;
      targetKeywords?: string[];
      excludePostId?: string;
    } = {}
  ): Promise<ContentOptimizationResult> {
    const startTime = Date.now();
    const config = ContentOptimizationService.DEFAULT_CONFIG;

    try {
      // Run all analyses in parallel for better performance
      const [
        keywordAnalysis,
        headingStructure,
        readability,
        imageValidation,
        contentLength,
        internalLinking
      ] = await Promise.all([
        this.analyzeKeywordDensity(content, options.targetKeywords),
        this.validateHeadingStructure(content),
        this.calculateReadabilityScore(content),
        this.validateImageAltText(content),
        this.analyzeContentLength(content, options.contentType),
        this.analyzeInternalLinking(content, options.excludePostId)
      ]);

      // Calculate overall score based on component scores
      const overallScore = this.calculateOverallScore({
        keywordAnalysis,
        headingStructure,
        readability,
        imageValidation,
        contentLength,
        internalLinking
      });

      // Generate summary and recommendations
      const summary = this.generateOptimizationSummary({
        keywordAnalysis,
        headingStructure,
        readability,
        imageValidation,
        contentLength,
        internalLinking
      });

      return {
        overallScore,
        keywordAnalysis,
        headingStructure,
        readability,
        imageValidation,
        contentLength,
        internalLinking,
        summary,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      throw new Error(`Content optimization analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze keyword density for single words and phrases
   */
  private async analyzeKeywordDensity(
    content: string,
    targetKeywords: string[] = []
  ): Promise<KeywordAnalysis> {
    const cleanText = this.stripHtmlAndNormalize(content);
    const words = this.tokenizeText(cleanText);
    const totalWords = words.length;
    const uniqueWords = new Set(words).size;

    // Count word frequencies
    const wordFrequency = new Map<string, number>();
    words.forEach(word => {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    });

    // Analyze single words
    const singleWords = this.analyzeWordDensity(wordFrequency, totalWords, 1);

    // Analyze two-word phrases
    const twoWordPhrases = this.analyzePhrases(words, totalWords, 2);

    // Analyze three-word phrases
    const threeWordPhrases = this.analyzePhrases(words, totalWords, 3);

    // Calculate average words per sentence
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const averageWordsPerSentence = totalWords / sentences.length;

    // Get top keywords overall
    const allKeywords = [...singleWords, ...twoWordPhrases, ...threeWordPhrases];
    const topKeywords = allKeywords
      .sort((a, b) => b.density - a.density)
      .slice(0, 10);

    return {
      singleWords,
      twoWordPhrases,
      threeWordPhrases,
      totalWords,
      uniqueWords,
      averageWordsPerSentence,
      topKeywords
    };
  }

  /**
   * Validate heading structure and hierarchy
   */
  private async validateHeadingStructure(content: string): Promise<HeadingStructureResult> {
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    const headings: Array<{ text: string; level: number; position: number }> = [];
    const issues: HeadingStructureIssue[] = [];
    const recommendations: string[] = [];

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = parseInt(match[1]);
      const text = this.stripHtmlAndNormalize(match[2]);
      const position = match.index;

      headings.push({ text, level, position });
    }

    let isValid = true;

    // Check for H1 requirement
    const h1Count = headings.filter(h => h.level === 1).length;
    if (h1Count === 0) {
      issues.push({
        type: 'error',
        heading: '',
        level: 1,
        position: 0,
        message: 'Missing H1 heading',
        suggestion: 'Add an H1 heading as the main title of your content'
      });
      isValid = false;
    } else if (h1Count > 1) {
      issues.push({
        type: 'warning',
        heading: '',
        level: 1,
        position: 0,
        message: `Multiple H1 headings found (${h1Count})`,
        suggestion: 'Use only one H1 heading per page. Convert additional H1s to H2 or H3'
      });
    }

    // Check heading hierarchy
    for (let i = 1; i < headings.length; i++) {
      const current = headings[i];
      const previous = headings[i - 1];

      if (current.level > previous.level + 1) {
        issues.push({
          type: 'error',
          heading: current.text,
          level: current.level,
          position: current.position,
          message: `Heading level skipped from H${previous.level} to H${current.level}`,
          suggestion: `Change to H${previous.level + 1} or add intermediate heading levels`
        });
        isValid = false;
      }
    }

    // Generate outline
    const outline = this.generateHeadingOutline(headings);

    // Add recommendations
    if (headings.length === 0) {
      recommendations.push('Add headings to improve content structure and readability');
    } else if (headings.length < 3) {
      recommendations.push('Consider adding more headings to break up long sections of text');
    }

    return {
      isValid,
      headings,
      issues,
      outline,
      recommendations
    };
  }

  /**
   * Calculate readability score using multiple metrics
   */
  private async calculateReadabilityScore(content: string): Promise<ReadabilityResult> {
    const cleanText = this.stripHtmlAndNormalize(content);
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = this.tokenizeText(cleanText);
    const syllables = this.countTotalSyllables(words);

    const totalSentences = sentences.length;
    const totalWords = words.length;
    const totalSyllables = syllables;

    // Calculate metrics
    const averageWordsPerSentence = totalWords / totalSentences;
    const averageSyllablesPerWord = totalSyllables / totalWords;

    // Flesch Reading Ease Score
    const fleschReadingEase = 206.835 - (1.015 * averageWordsPerSentence) - (84.6 * averageSyllablesPerWord);

    // Flesch-Kincaid Grade Level
    const fleschKincaidGradeLevel = (0.39 * averageWordsPerSentence) + (11.8 * averageSyllablesPerWord) - 15.59;

    // Additional metrics
    const passiveVoicePercentage = this.calculatePassiveVoicePercentage(cleanText);
    const complexWordsPercentage = this.calculateComplexWordsPercentage(words);

    const metrics: ReadabilityMetrics = {
      fleschReadingEase,
      fleschKincaidGradeLevel,
      averageWordsPerSentence,
      averageSyllablesPerWord,
      totalSentences,
      totalWords,
      totalSyllables,
      passiveVoicePercentage,
      complexWordsPercentage
    };

    // Generate interpretation and recommendations
    const { interpretation, classification, recommendations } = this.interpretReadabilityScore(metrics);

    const score = Math.max(0, Math.min(100, fleschReadingEase));
    const gradeLevel = `Grade ${Math.round(fleschKincaidGradeLevel)}`;

    // Generate readability issues based on analysis
    const issues: string[] = [];
    if (score < 30) {
      issues.push('Content is very difficult to read');
    } else if (score < 50) {
      issues.push('Content readability could be improved');
    }
    if (averageWordsPerSentence > 20) {
      issues.push('Sentences are too long - consider breaking them up');
    }
    if (passiveVoicePercentage > 25) {
      issues.push('High passive voice usage detected');
    }

    return {
      metrics,
      score,
      grade: gradeLevel, // Fixed: changed from gradeLevel to grade for frontend compatibility
      interpretation,
      classification,
      issues, // Populated based on readability analysis
      recommendations
    };
  }

  /**
   * Validate image alt text
   */
  private async validateImageAltText(content: string): Promise<ImageValidationResult> {
    const imageRegex = /<img[^>]*>/gi;
    const issues: ImageValidationIssue[] = [];
    const images: string[] = [];

    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      images.push(match[0]);
    }

    const totalImages = images.length;
    let validImages = 0;

    for (const imgTag of images) {
      const srcMatch = imgTag.match(/src=['"](.*?)['"]/i);
      const altMatch = imgTag.match(/alt=['"](.*?)['"]/i);
      
      const src = srcMatch ? srcMatch[1] : 'unknown';
      const alt = altMatch ? altMatch[1] : null;

      if (!alt) {
        issues.push({
          src,
          issue: 'missing-alt',
          suggestion: 'Add descriptive alt text for accessibility and SEO',
          severity: 'error'
        });
      } else if (alt.trim() === '') {
        issues.push({
          src,
          issue: 'empty-alt',
          currentAlt: alt,
          suggestion: 'Add meaningful alt text or use alt="" for decorative images',
          severity: 'error'
        });
      } else if (alt.length < ContentOptimizationService.DEFAULT_CONFIG.imageValidation.minAltTextLength) {
        issues.push({
          src,
          issue: 'too-short',
          currentAlt: alt,
          suggestion: 'Alt text should be more descriptive (at least 10 characters)',
          severity: 'warning'
        });
      } else if (alt.length > ContentOptimizationService.DEFAULT_CONFIG.imageValidation.maxAltTextLength) {
        issues.push({
          src,
          issue: 'too-long',
          currentAlt: alt,
          suggestion: 'Alt text should be concise (under 125 characters)',
          severity: 'warning'
        });
      } else if (this.isGenericAltText(alt)) {
        issues.push({
          src,
          issue: 'generic-alt',
          currentAlt: alt,
          suggestion: 'Make alt text more specific and descriptive',
          severity: 'info'
        });
      } else if (this.appearsToBeFilename(alt)) {
        issues.push({
          src,
          issue: 'filename-alt',
          currentAlt: alt,
          suggestion: 'Replace filename with descriptive alt text',
          severity: 'warning'
        });
      } else {
        validImages++;
      }
    }

    const complianceScore = totalImages > 0 ? Math.round((validImages / totalImages) * 100) : 100;

    const recommendations: string[] = [];
    if (totalImages === 0) {
      recommendations.push('Consider adding relevant images to enhance content engagement');
    } else if (complianceScore < 70) {
      recommendations.push('Improve alt text quality for better accessibility and SEO');
    }

    return {
      totalImages,
      validImages,
      invalidImages: totalImages - validImages, // Added: calculated field for frontend compatibility
      issues,
      complianceScore,
      recommendations
    };
  }

  /**
   * Analyze content length and provide recommendations
   */
  private async analyzeContentLength(
    content: string,
    contentType: string = 'default'
  ): Promise<ContentLengthAnalysis> {
    const cleanText = this.stripHtmlAndNormalize(content);
    const words = this.tokenizeText(cleanText);
    const currentWordCount = words.length;
    const currentCharacterCount = cleanText.length;

    const targets = ContentOptimizationService.DEFAULT_CONFIG.contentLength.defaultTargets;
    const recommendedRange = targets[contentType as keyof typeof targets] || targets.default;

    let status: 'too-short' | 'optimal' | 'too-long' | 'within-range';
    if (currentWordCount < recommendedRange.min) {
      status = 'too-short';
    } else if (currentWordCount > recommendedRange.max) {
      status = 'too-long';
    } else {
      status = 'optimal';
    }

    const recommendations: string[] = [];
    if (status === 'too-short') {
      recommendations.push(`Consider expanding your content. Current: ${currentWordCount} words, recommended: ${recommendedRange.min}-${recommendedRange.max} words`);
      recommendations.push('Add more details, examples, or explanations to provide more value');
    } else if (status === 'too-long') {
      recommendations.push(`Content may be too lengthy. Current: ${currentWordCount} words, recommended: ${recommendedRange.min}-${recommendedRange.max} words`);
      recommendations.push('Consider breaking into multiple posts or sections');
    } else {
      recommendations.push('Content length is within optimal range for this content type');
    }

    return {
      currentWordCount,
      currentCharacterCount,
      recommendedRange,
      contentType,
      status,
      recommendations
    };
  }

  /**
   * Analyze internal linking opportunities
   */
  private async analyzeInternalLinking(
    content: string,
    excludePostId?: string
  ): Promise<InternalLinkingAnalysis> {
    // Count current internal links
    const internalLinkRegex = /<a[^>]*href=['"](\/[^'"]*|(?!https?:\/\/)[^'"]*)['"]/gi;
    const currentInternalLinks = (content.match(internalLinkRegex) || []).length;

    const cleanText = this.stripHtmlAndNormalize(content);
    const words = this.tokenizeText(cleanText);
    const wordCount = words.length;

    // Recommended internal links (1-2 per 300 words)
    const recommendedCount = Math.ceil(wordCount / 300);
    const linkDensity = (currentInternalLinks / wordCount) * 1000; // per 1000 words

    let status: 'under-linked' | 'optimal' | 'over-linked';
    if (currentInternalLinks < Math.max(1, recommendedCount - 1)) {
      status = 'under-linked';
    } else if (currentInternalLinks > recommendedCount + 2) {
      status = 'over-linked';
    } else {
      status = 'optimal';
    }

    const recommendations: string[] = [];
    if (status === 'under-linked') {
      recommendations.push(`Add more internal links. Current: ${currentInternalLinks}, recommended: ${recommendedCount}`);
      recommendations.push('Link to related posts, categories, or relevant pages');
    } else if (status === 'over-linked') {
      recommendations.push(`Consider reducing internal links. Current: ${currentInternalLinks}, recommended: ${recommendedCount}`);
      recommendations.push('Focus on the most relevant and valuable links');
    } else {
      recommendations.push('Internal linking frequency is optimal');
    }

    return {
      currentInternalLinks,
      recommendedCount,
      linkDensity,
      status,
      suggestions: [], // This would be populated by the existing internal link suggestions service
      recommendations
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private stripHtmlAndNormalize(content: string): string {
    return content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0 && word.length > 2);
  }

  private analyzeWordDensity(
    wordFrequency: Map<string, number>,
    totalWords: number,
    minFrequency: number = 2
  ): KeywordDensityResult[] {
    const results: KeywordDensityResult[] = [];
    const config = ContentOptimizationService.DEFAULT_CONFIG.keywordDensity;

    wordFrequency.forEach((frequency, word) => {
      if (frequency >= minFrequency) {
        const density = (frequency / totalWords) * 100;
        let classification: 'optimal' | 'low' | 'high' | 'excessive';
        const recommendations: string[] = [];

        if (density < config.optimalMin) {
          classification = 'low';
          recommendations.push('Consider using this keyword more frequently for better SEO');
        } else if (density <= config.optimalMax) {
          classification = 'optimal';
          recommendations.push('Keyword density is in the optimal range');
        } else if (density <= config.warningThreshold) {
          classification = 'high';
          recommendations.push('Consider reducing keyword frequency to avoid over-optimization');
        } else {
          classification = 'excessive';
          recommendations.push('Keyword density is too high - reduce frequency to avoid penalties');
        }

        results.push({
          keyword: word,
          frequency,
          density,
          classification,
          recommendations
        });
      }
    });

    return results.sort((a, b) => b.density - a.density);
  }

  private analyzePhrases(
    words: string[],
    totalWords: number,
    phraseLength: number,
    minFrequency: number = 2
  ): KeywordDensityResult[] {
    const phraseFrequency = new Map<string, number>();

    for (let i = 0; i <= words.length - phraseLength; i++) {
      const phrase = words.slice(i, i + phraseLength).join(' ');
      phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
    }

    const totalPhrases = words.length - phraseLength + 1;
    return this.analyzeWordDensity(phraseFrequency, totalPhrases, minFrequency);
  }

  private countTotalSyllables(words: string[]): number {
    return words.reduce((total, word) => total + this.countSyllables(word), 0);
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private calculatePassiveVoicePercentage(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let passiveCount = 0;

    const passiveIndicators = [
      /\b(?:am|is|are|was|were|be|being|been)\s+\w*(?:ed|en)\b/gi,
      /\bby\s+(?:the\s+)?\w+(?:\s+\w+)?\s*$/gi
    ];

    sentences.forEach(sentence => {
      const hasPassive = passiveIndicators.some(pattern => pattern.test(sentence));
      if (hasPassive) passiveCount++;
    });

    return sentences.length > 0 ? (passiveCount / sentences.length) * 100 : 0;
  }

  private calculateComplexWordsPercentage(words: string[]): number {
    const complexWords = words.filter(word => this.countSyllables(word) >= 3);
    return words.length > 0 ? (complexWords.length / words.length) * 100 : 0;
  }

  private interpretReadabilityScore(metrics: ReadabilityMetrics): {
    interpretation: string;
    classification: ReadabilityResult['classification'];
    recommendations: string[];
  } {
    const { fleschReadingEase, fleschKincaidGradeLevel, averageWordsPerSentence } = metrics;
    const recommendations: string[] = [];

    let classification: ReadabilityResult['classification'];
    let interpretation: string;

    if (fleschReadingEase >= 90) {
      classification = 'very-easy';
      interpretation = 'Very easy to read. Easily understood by an average 11-year-old student.';
    } else if (fleschReadingEase >= 80) {
      classification = 'easy';
      interpretation = 'Easy to read. Conversational English for consumers.';
    } else if (fleschReadingEase >= 70) {
      classification = 'fairly-easy';
      interpretation = 'Fairly easy to read. Appropriate for most adult readers.';
    } else if (fleschReadingEase >= 60) {
      classification = 'standard';
      interpretation = 'Standard readability. Easily understood by 13- to 15-year-old students.';
    } else if (fleschReadingEase >= 50) {
      classification = 'fairly-difficult';
      interpretation = 'Fairly difficult to read. Appropriate for college-level readers.';
    } else if (fleschReadingEase >= 30) {
      classification = 'difficult';
      interpretation = 'Difficult to read. Best understood by university graduates.';
    } else {
      classification = 'very-difficult';
      interpretation = 'Very difficult to read. Best understood by university graduates with advanced degrees.';
    }

    // Generate recommendations
    if (fleschReadingEase < 60) {
      recommendations.push('Consider simplifying sentence structure and using shorter words');
    }
    if (averageWordsPerSentence > 20) {
      recommendations.push('Break up long sentences to improve readability');
    }
    if (fleschKincaidGradeLevel > 12) {
      recommendations.push('Content may be too complex for general audience - consider simplifying');
    }
    if (metrics.passiveVoicePercentage > 25) {
      recommendations.push('Reduce passive voice usage for clearer, more direct writing');
    }

    return { interpretation, classification, recommendations };
  }

  private isGenericAltText(alt: string): boolean {
    const genericTerms = ['image', 'photo', 'picture', 'graphic', 'illustration', 'img'];
    const normalizedAlt = alt.toLowerCase().trim();
    return genericTerms.some(term => normalizedAlt === term || normalizedAlt.includes(term) && normalizedAlt.length < 20);
  }

  private appearsToBeFilename(alt: string): boolean {
    return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(alt) ||
           /^IMG_\d+|DSC_\d+|PHOTO_\d+/i.test(alt);
  }

  private generateHeadingOutline(headings: Array<{ text: string; level: number; position: number }>): any[] {
    // Simple outline generation - can be enhanced with proper nesting
    return headings.map(h => ({
      text: h.text,
      level: h.level,
      children: []
    }));
  }

  private calculateOverallScore(components: {
    keywordAnalysis: KeywordAnalysis;
    headingStructure: HeadingStructureResult;
    readability: ReadabilityResult;
    imageValidation: ImageValidationResult;
    contentLength: ContentLengthAnalysis;
    internalLinking: InternalLinkingAnalysis;
  }): number {
    // Weight different components
    const weights = {
      readability: 25,      // 25%
      headingStructure: 20, // 20%
      contentLength: 15,    // 15%
      keywordDensity: 15,   // 15%
      imageValidation: 15,  // 15%
      internalLinking: 10   // 10%
    };

    let totalScore = 0;

    // Readability score (0-100)
    totalScore += (components.readability.score / 100) * weights.readability;

    // Heading structure score
    const headingScore = components.headingStructure.isValid ? 100 : 
      Math.max(0, 100 - (components.headingStructure.issues.filter(i => i.type === 'error').length * 25));
    totalScore += (headingScore / 100) * weights.headingStructure;

    // Content length score
    const lengthScore = components.contentLength.status === 'optimal' ? 100 :
      components.contentLength.status === 'within-range' ? 85 : 50;
    totalScore += (lengthScore / 100) * weights.contentLength;

    // Keyword density score (based on optimal keyword distribution)
    const optimalKeywords = components.keywordAnalysis.topKeywords.filter(k => k.classification === 'optimal').length;
    const keywordScore = Math.min(100, (optimalKeywords / Math.max(1, components.keywordAnalysis.topKeywords.length)) * 100);
    totalScore += (keywordScore / 100) * weights.keywordDensity;

    // Image validation score
    totalScore += (components.imageValidation.complianceScore / 100) * weights.imageValidation;

    // Internal linking score
    const linkingScore = components.internalLinking.status === 'optimal' ? 100 : 75;
    totalScore += (linkingScore / 100) * weights.internalLinking;

    return Math.round(totalScore);
  }

  private generateOptimizationSummary(components: {
    keywordAnalysis: KeywordAnalysis;
    headingStructure: HeadingStructureResult;
    readability: ReadabilityResult;
    imageValidation: ImageValidationResult;
    contentLength: ContentLengthAnalysis;
    internalLinking: InternalLinkingAnalysis;
  }): ContentOptimizationResult['summary'] {
    const strengths: string[] = [];
    const issues: string[] = [];
    const priority_fixes: string[] = [];
    const quick_wins: string[] = [];

    // Analyze each component for strengths and issues
    if (components.readability.score >= 70) {
      strengths.push('Good readability for target audience');
    } else {
      issues.push('Content readability could be improved');
      if (components.readability.score < 50) {
        priority_fixes.push('Simplify sentence structure and vocabulary');
      }
    }

    if (components.headingStructure.isValid) {
      strengths.push('Proper heading structure and hierarchy');
    } else {
      issues.push('Heading structure needs improvement');
      const errorCount = components.headingStructure.issues.filter(i => i.type === 'error').length;
      if (errorCount > 0) {
        priority_fixes.push('Fix heading hierarchy issues');
      }
    }

    if (components.contentLength.status === 'optimal') {
      strengths.push('Content length is optimal for content type');
    } else {
      issues.push(`Content is ${components.contentLength.status.replace('-', ' ')}`);
      if (components.contentLength.status === 'too-short') {
        quick_wins.push('Expand content with more details and examples');
      }
    }

    if (components.imageValidation.complianceScore >= 80) {
      strengths.push('Good image accessibility compliance');
    } else {
      issues.push('Image alt text needs improvement');
      quick_wins.push('Add or improve alt text for images');
    }

    const optimalKeywords = components.keywordAnalysis.topKeywords.filter(k => k.classification === 'optimal');
    if (optimalKeywords.length >= 3) {
      strengths.push('Good keyword density distribution');
    } else {
      issues.push('Keyword optimization could be improved');
      quick_wins.push('Optimize keyword density for target terms');
    }

    if (components.internalLinking.status === 'optimal') {
      strengths.push('Appropriate internal linking frequency');
    } else {
      issues.push(`Content is ${components.internalLinking.status.replace('-', ' ')}`);
      quick_wins.push('Adjust internal linking frequency');
    }

    return {
      strengths,
      issues,
      priority_fixes,
      quick_wins
    };
  }
}

// ============================================================================
// Export Types for Frontend Integration
// ============================================================================

export type {
  ContentOptimizationConfig,
  KeywordDensityResult,
  KeywordAnalysis,
  HeadingStructureIssue,
  HeadingStructureResult,
  ReadabilityMetrics,
  ReadabilityResult,
  ImageValidationIssue,
  ImageValidationResult,
  ContentLengthAnalysis,
  InternalLinkingAnalysis,
  ContentOptimizationResult,
};
