/**
 * Internal Link Suggestions Service
 * Analyzes content and suggests relevant internal links to improve SEO and user experience
 */

import { PrismaClient } from '@prisma/client';

interface LinkSuggestion {
  id: string;
  title: string;
  slug: string;
  url: string;
  anchor: string; // The text that should be linked
  context: string; // Surrounding text for context
  relevanceScore: number; // 0-100
  position: number; // Character position in content
  reason: string; // Why this link is suggested
  category?: string;
  tags?: string[];
}

interface LinkSuggestionOptions {
  maxSuggestions: number;
  minRelevanceScore: number;
  excludeUrls: string[];
  preferRecent: boolean;
  includeCategories: boolean;
  contextWindow: number; // Characters before/after for context
}

interface ContentAnalysis {
  keywords: string[];
  entities: string[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  readingLevel: number;
}

interface InternalLinkSuggestionResult {
  suggestions: LinkSuggestion[];
  totalAnalyzed: number;
  processingTime: number;
  contentAnalysis: ContentAnalysis;
  warnings: string[];
  recommendations: string[];
}

export class InternalLinkSuggestionsService {
  private static readonly DEFAULT_OPTIONS: LinkSuggestionOptions = {
    maxSuggestions: 7,
    minRelevanceScore: 30,
    excludeUrls: [],
    preferRecent: true,
    includeCategories: true,
    contextWindow: 50
  };

  constructor(private prisma: PrismaClient) {}

  /**
   * Generate internal link suggestions for content
   */
  async generateLinkSuggestions(
    content: string,
    currentPostId?: string,
    options: Partial<LinkSuggestionOptions> = {}
  ): Promise<InternalLinkSuggestionResult> {
    const startTime = Date.now();
    const finalOptions = { ...InternalLinkSuggestionsService.DEFAULT_OPTIONS, ...options };
    
    const result: InternalLinkSuggestionResult = {
      suggestions: [],
      totalAnalyzed: 0,
      processingTime: 0,
      contentAnalysis: await this.analyzeContent(content),
      warnings: [],
      recommendations: []
    };

    try {
      // Get all published posts for analysis
      const posts = await this.getAnalyzablePosts(currentPostId);
      result.totalAnalyzed = posts.length;

      if (posts.length === 0) {
        result.warnings.push('No published posts found for link suggestions');
        return result;
      }

      // Analyze content and extract potential link targets
      const linkOpportunities = this.findLinkOpportunities(content, result.contentAnalysis);
      
      // Match opportunities with existing posts
      const suggestions = await this.matchOpportunitiesWithPosts(
        linkOpportunities,
        posts,
        finalOptions
      );

      // Rank and filter suggestions
      result.suggestions = this.rankAndFilterSuggestions(suggestions, finalOptions);

      // Add quality recommendations
      this.addQualityRecommendations(result, finalOptions);

      result.processingTime = Date.now() - startTime;
      
    } catch (error) {
      result.warnings.push(`Error generating link suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Analyze content to extract keywords, entities, and topics
   */
  private async analyzeContent(content: string): Promise<ContentAnalysis> {
    const cleanContent = this.cleanHtmlContent(content);
    
    return {
      keywords: this.extractKeywords(cleanContent),
      entities: this.extractEntities(cleanContent),
      topics: this.extractTopics(cleanContent),
      sentiment: this.analyzeSentiment(cleanContent),
      readingLevel: this.calculateReadingLevel(cleanContent)
    };
  }

  /**
   * Get posts that can be linked to
   */
  private async getAnalyzablePosts(excludeId?: string) {
    const whereClause: any = {
      status: 'PUBLISHED',
      deletedAt: null
    };

    if (excludeId) {
      whereClause.id = { not: excludeId };
    }

    return this.prisma.post.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        excerpt: true,
        seoKeywords: true,
        tags: true,
        categoryId: true,
        publishedAt: true,
        viewCount: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: [
        { publishedAt: 'desc' },
        { viewCount: 'desc' }
      ]
    });
  }

  /**
   * Find opportunities for links in the content
   */
  private findLinkOpportunities(content: string, analysis: ContentAnalysis): Array<{
    text: string;
    position: number;
    context: string;
    type: 'keyword' | 'entity' | 'topic';
    confidence: number;
  }> {
    const opportunities: Array<{
      text: string;
      position: number;
      context: string;
      type: 'keyword' | 'entity' | 'topic';
      confidence: number;
    }> = [];

    const cleanContent = this.cleanHtmlContent(content);

    // Find keyword opportunities
    analysis.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(cleanContent)) !== null) {
        // Skip if already within an existing link
        if (this.isWithinExistingLink(content, match.index)) {
          continue;
        }

        opportunities.push({
          text: match[0],
          position: match.index,
          context: this.extractContext(cleanContent, match.index, 50),
          type: 'keyword',
          confidence: 80
        });
      }
    });

    // Find entity opportunities
    analysis.entities.forEach(entity => {
      const regex = new RegExp(`\\b${this.escapeRegex(entity)}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(cleanContent)) !== null) {
        if (this.isWithinExistingLink(content, match.index)) {
          continue;
        }

        opportunities.push({
          text: match[0],
          position: match.index,
          context: this.extractContext(cleanContent, match.index, 50),
          type: 'entity',
          confidence: 70
        });
      }
    });

    // Find topic opportunities
    analysis.topics.forEach(topic => {
      const regex = new RegExp(`\\b${this.escapeRegex(topic)}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(cleanContent)) !== null) {
        if (this.isWithinExistingLink(content, match.index)) {
          continue;
        }

        opportunities.push({
          text: match[0],
          position: match.index,
          context: this.extractContext(cleanContent, match.index, 50),
          type: 'topic',
          confidence: 60
        });
      }
    });

    // Remove duplicates and overlapping opportunities
    return this.deduplicateOpportunities(opportunities);
  }

  /**
   * Match link opportunities with existing posts
   */
  private async matchOpportunitiesWithPosts(
    opportunities: Array<{
      text: string;
      position: number;
      context: string;
      type: 'keyword' | 'entity' | 'topic';
      confidence: number;
    }>,
    posts: any[],
    options: LinkSuggestionOptions
  ): Promise<LinkSuggestion[]> {
    const suggestions: LinkSuggestion[] = [];

    for (const opportunity of opportunities) {
      // Find posts that match this opportunity
      const matchingPosts = posts.filter(post => {
        return this.calculatePostRelevance(opportunity, post) >= options.minRelevanceScore;
      });

      // Sort by relevance
      matchingPosts.sort((a, b) => 
        this.calculatePostRelevance(opportunity, b) - this.calculatePostRelevance(opportunity, a)
      );

      // Take the best match
      if (matchingPosts.length > 0) {
        const bestMatch = matchingPosts[0];
        const relevanceScore = this.calculatePostRelevance(opportunity, bestMatch);

        suggestions.push({
          id: bestMatch.id,
          title: bestMatch.title,
          slug: bestMatch.slug,
          url: `/blog/${bestMatch.slug}`,
          anchor: opportunity.text,
          context: opportunity.context,
          relevanceScore,
          position: opportunity.position,
          reason: this.generateLinkReason(opportunity, bestMatch, relevanceScore),
          category: bestMatch.category?.name,
          tags: Array.isArray(bestMatch.tags) ? bestMatch.tags : []
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate relevance score between opportunity and post
   */
  private calculatePostRelevance(
    opportunity: { text: string; type: string; confidence: number },
    post: any
  ): number {
    let score = 0;

    // Title matching (highest weight)
    if (post.title.toLowerCase().includes(opportunity.text.toLowerCase())) {
      score += 40;
    }

    // Exact keyword match in SEO keywords
    if (post.seoKeywords && 
        post.seoKeywords.toLowerCase().includes(opportunity.text.toLowerCase())) {
      score += 30;
    }

    // Tag matching
    if (Array.isArray(post.tags)) {
      const tagMatch = post.tags.some((tag: string) => 
        tag.toLowerCase().includes(opportunity.text.toLowerCase()) ||
        opportunity.text.toLowerCase().includes(tag.toLowerCase())
      );
      if (tagMatch) {
        score += 25;
      }
    }

    // Content matching (lower weight to avoid over-optimization)
    const contentWords = this.cleanHtmlContent(post.content || '').toLowerCase().split(/\s+/);
    const opportunityWords = opportunity.text.toLowerCase().split(/\s+/);
    
    const matchingWords = opportunityWords.filter(word => 
      contentWords.some(contentWord => 
        contentWord.includes(word) || word.includes(contentWord)
      )
    );
    
    score += (matchingWords.length / opportunityWords.length) * 15;

    // Excerpt matching
    if (post.excerpt && post.excerpt.toLowerCase().includes(opportunity.text.toLowerCase())) {
      score += 20;
    }

    // Category name matching
    if (post.category?.name && 
        post.category.name.toLowerCase().includes(opportunity.text.toLowerCase())) {
      score += 15;
    }

    // Boost score based on opportunity confidence
    score *= (opportunity.confidence / 100);

    // Boost for popular posts (higher view count)
    if (post.viewCount > 100) {
      score *= 1.1;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Rank and filter suggestions based on options
   */
  private rankAndFilterSuggestions(
    suggestions: LinkSuggestion[],
    options: LinkSuggestionOptions
  ): LinkSuggestion[] {
    // Filter by minimum relevance score
    let filtered = suggestions.filter(s => s.relevanceScore >= options.minRelevanceScore);

    // Remove excluded URLs
    if (options.excludeUrls.length > 0) {
      filtered = filtered.filter(s => !options.excludeUrls.includes(s.url));
    }

    // Remove duplicates (same post suggested multiple times)
    const seen = new Set<string>();
    filtered = filtered.filter(s => {
      if (seen.has(s.id)) {
        return false;
      }
      seen.add(s.id);
      return true;
    });

    // Sort by relevance score (and prefer earlier positions for ties)
    filtered.sort((a, b) => {
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.position - b.position;
    });

    // Limit to max suggestions
    return filtered.slice(0, options.maxSuggestions);
  }

  /**
   * Add quality recommendations based on results
   */
  private addQualityRecommendations(
    result: InternalLinkSuggestionResult,
    options: LinkSuggestionOptions
  ): void {
    if (result.suggestions.length === 0) {
      result.recommendations.push('No relevant internal links found. Consider creating more content on related topics.');
    } else if (result.suggestions.length < 3) {
      result.recommendations.push('Limited internal linking opportunities. Consider expanding content breadth.');
    }

    if (result.suggestions.length > 5) {
      result.recommendations.push('Many link opportunities found. Consider using only the most relevant ones to avoid over-linking.');
    }

    const averageRelevance = result.suggestions.length > 0 
      ? result.suggestions.reduce((sum, s) => sum + s.relevanceScore, 0) / result.suggestions.length
      : 0;

    if (averageRelevance < 50) {
      result.recommendations.push('Link relevance scores are low. Consider creating more topically related content.');
    }

    // Check for link distribution
    const firstHalfLinks = result.suggestions.filter(s => s.position < (result.contentAnalysis.keywords.join(' ').length / 2));
    if (firstHalfLinks.length === result.suggestions.length) {
      result.recommendations.push('All suggested links are in the first half of content. Consider spreading links throughout the article.');
    }
  }

  /**
   * Helper methods
   */

  private cleanHtmlContent(content: string): string {
    return content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractKeywords(content: string, maxKeywords: number = 10): string[] {
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'this', 'that', 'these',
      'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may'
    ]);

    const wordCount = new Map<string, number>();
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 3 && !stopWords.has(cleaned)) {
        wordCount.set(cleaned, (wordCount.get(cleaned) || 0) + 1);
      }
    });

    // Also extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      const cleaned = phrase.replace(/[^a-z0-9\s]/g, '').trim();
      if (cleaned.split(' ').every(word => word.length > 2 && !stopWords.has(word))) {
        wordCount.set(cleaned, (wordCount.get(cleaned) || 0) + 1);
      }
    }

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  private extractEntities(content: string): string[] {
    // Simple entity extraction based on capitalization patterns
    const entities: string[] = [];
    const words = content.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z]/g, '');
      
      // Look for capitalized words (potential proper nouns)
      if (word.length > 2 && /^[A-Z][a-z]+$/.test(word)) {
        // Check if next word is also capitalized (multi-word entity)
        let entity = word;
        let j = i + 1;
        
        while (j < words.length && /^[A-Z][a-z]+$/.test(words[j].replace(/[^a-zA-Z]/g, ''))) {
          entity += ` ${words[j].replace(/[^a-zA-Z]/g, '')}`;
          j++;
        }
        
        if (entity.length > 3) {
          entities.push(entity);
        }
      }
    }

    return [...new Set(entities)].slice(0, 10); // Remove duplicates and limit
  }

  private extractTopics(content: string): string[] {
    // Extract topics based on keyword clustering and common patterns
    const keywords = this.extractKeywords(content, 20);
    const topics: string[] = [];

    // Common topic patterns
    const topicPatterns = [
      /\b(guide|tutorial|how\s+to|tips|best\s+practices)\s+(.+?)(?:\s|$)/gi,
      /\b(introduction\s+to|overview\s+of|understanding)\s+(.+?)(?:\s|$)/gi,
      /\b(.+?)\s+(marketing|strategy|development|design|optimization)\b/gi
    ];

    topicPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[2] && match[2].length > 3) {
          topics.push(match[2].trim().toLowerCase());
        }
      }
    });

    // Add high-frequency keywords as topics
    topics.push(...keywords.slice(0, 5));

    return [...new Set(topics)].slice(0, 8);
  }

  private analyzeSentiment(content: string): 'positive' | 'neutral' | 'negative' {
    // Simple sentiment analysis based on word lists
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'best', 'effective', 'successful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'failed', 'problem', 'issue', 'difficult'];
    
    const words = content.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private calculateReadingLevel(content: string): number {
    // Simplified reading level calculation
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = content.split(/[aeiouAEIOU]/).length;

    if (sentences === 0 || words === 0) return 0;

    const avgSentenceLength = words / sentences;
    const avgSyllablesPerWord = syllables / words;

    // Simplified grade level formula
    return Math.max(1, Math.min(20, avgSentenceLength + avgSyllablesPerWord));
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isWithinExistingLink(content: string, position: number): boolean {
    // Check if position is within an existing <a> tag
    const beforePos = content.substring(0, position);
    const afterPos = content.substring(position);
    
    const lastLinkStart = beforePos.lastIndexOf('<a ');
    const lastLinkEnd = beforePos.lastIndexOf('</a>');
    
    // If there's an opening <a> tag after the last closing </a> tag, we're inside a link
    return lastLinkStart > lastLinkEnd && afterPos.indexOf('</a>') > -1;
  }

  private extractContext(content: string, position: number, windowSize: number): string {
    const start = Math.max(0, position - windowSize);
    const end = Math.min(content.length, position + windowSize);
    return content.substring(start, end).trim();
  }

  private deduplicateOpportunities(opportunities: Array<{
    text: string;
    position: number;
    context: string;
    type: 'keyword' | 'entity' | 'topic';
    confidence: number;
  }>): Array<{
    text: string;
    position: number;
    context: string;
    type: 'keyword' | 'entity' | 'topic';
    confidence: number;
  }> {
    // Remove overlapping opportunities (keep the one with higher confidence)
    const sorted = opportunities.sort((a, b) => b.confidence - a.confidence);
    const filtered: typeof opportunities = [];

    for (const opportunity of sorted) {
      const isOverlapping = filtered.some(existing => 
        Math.abs(existing.position - opportunity.position) < opportunity.text.length
      );
      
      if (!isOverlapping) {
        filtered.push(opportunity);
      }
    }

    return filtered.sort((a, b) => a.position - b.position);
  }

  private generateLinkReason(
    opportunity: { text: string; type: string; confidence: number },
    post: any,
    relevanceScore: number
  ): string {
    if (post.title.toLowerCase().includes(opportunity.text.toLowerCase())) {
      return `Direct topic match in article title`;
    }
    
    if (post.seoKeywords && post.seoKeywords.toLowerCase().includes(opportunity.text.toLowerCase())) {
      return `Keyword match in SEO optimization`;
    }
    
    if (Array.isArray(post.tags) && post.tags.some((tag: string) => 
        tag.toLowerCase().includes(opportunity.text.toLowerCase()))) {
      return `Related tag match`;
    }
    
    if (relevanceScore > 70) {
      return `High relevance match (${relevanceScore}% confidence)`;
    }
    
    return `Related content match`;
  }

  /**
   * Bulk generate suggestions for multiple posts
   */
  async generateBulkSuggestions(
    postIds: string[],
    options: Partial<LinkSuggestionOptions> = {}
  ): Promise<Record<string, InternalLinkSuggestionResult>> {
    const results: Record<string, InternalLinkSuggestionResult> = {};

    for (const postId of postIds) {
      try {
        const post = await this.prisma.post.findUnique({
          where: { id: postId },
          select: { content: true }
        });

        if (post) {
          results[postId] = await this.generateLinkSuggestions(
            post.content,
            postId,
            options
          );
        }
      } catch (error) {
        results[postId] = {
          suggestions: [],
          totalAnalyzed: 0,
          processingTime: 0,
          contentAnalysis: {
            keywords: [],
            entities: [],
            topics: [],
            sentiment: 'neutral',
            readingLevel: 0
          },
          warnings: [`Error processing post ${postId}: ${error instanceof Error ? error.message : 'Unknown error'}`],
          recommendations: []
        };
      }
    }

    return results;
  }
}
