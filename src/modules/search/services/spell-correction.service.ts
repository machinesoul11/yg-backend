/**
 * Spell Correction Service
 * Provides "did you mean" suggestions using Levenshtein distance and corpus analysis
 */

import { PrismaClient } from '@prisma/client';
import type { SpellingSuggestion, DidYouMeanResponse } from '../types/search.types';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score (0-1) based on Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

/**
 * Extract words from text, handling special characters
 */
function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

export class SpellCorrectionService {
  private wordFrequency: Map<string, number> = new Map();
  private lastCorpusUpdate: Date | null = null;
  private corpusUpdateInterval = 3600000; // 1 hour

  constructor(private prisma: PrismaClient) {}

  /**
   * Get "did you mean" suggestion for a search query
   */
  async getDidYouMean(
    query: string,
    currentResultCount: number
  ): Promise<DidYouMeanResponse> {
    // Only suggest corrections if we have few or no results
    if (currentResultCount > 5) {
      return { hasAlternative: false };
    }

    // Ensure corpus is up to date
    await this.updateCorpusIfNeeded();

    const queryWords = extractWords(query);
    const suggestions: SpellingSuggestion[] = [];

    // Check each word for potential corrections
    for (const word of queryWords) {
      const wordSuggestions = this.findSimilarWords(word);
      
      for (const suggestion of wordSuggestions) {
        const correctedQuery = query.replace(
          new RegExp(`\\b${word}\\b`, 'gi'),
          suggestion.word
        );

        // Estimate result count for suggested query
        const estimatedCount = await this.estimateResultCount(correctedQuery);

        // Only suggest if it would significantly improve results
        if (estimatedCount > currentResultCount * 2) {
          suggestions.push({
            originalQuery: query,
            suggestedQuery: correctedQuery,
            confidence: suggestion.similarity,
            expectedResultCount: estimatedCount,
            distance: levenshteinDistance(query, correctedQuery),
          });
        }
      }
    }

    // Sort by confidence and expected results
    suggestions.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + (a.expectedResultCount / 100) * 0.4;
      const scoreB = b.confidence * 0.6 + (b.expectedResultCount / 100) * 0.4;
      return scoreB - scoreA;
    });

    if (suggestions.length === 0) {
      return { hasAlternative: false };
    }

    return {
      hasAlternative: true,
      suggestion: suggestions[0],
      alternatives: suggestions.slice(1, 3),
    };
  }

  /**
   * Find similar words in the corpus
   */
  private findSimilarWords(word: string, maxResults: number = 5): Array<{
    word: string;
    similarity: number;
    frequency: number;
  }> {
    const candidates: Array<{
      word: string;
      similarity: number;
      frequency: number;
    }> = [];

    // Only check words within reasonable edit distance
    const maxDistance = Math.max(1, Math.floor(word.length / 4));

    for (const [corpusWord, frequency] of this.wordFrequency.entries()) {
      // Quick length check to avoid unnecessary distance calculations
      const lengthDiff = Math.abs(corpusWord.length - word.length);
      if (lengthDiff > maxDistance) {
        continue;
      }

      const similarity = calculateSimilarity(word, corpusWord);
      
      // Only consider words that are similar enough
      if (similarity > 0.7 && corpusWord !== word) {
        candidates.push({
          word: corpusWord,
          similarity,
          frequency,
        });
      }
    }

    // Sort by similarity first, then frequency
    candidates.sort((a, b) => {
      const scoreA = a.similarity * 0.7 + Math.min(a.frequency / 100, 1) * 0.3;
      const scoreB = b.similarity * 0.7 + Math.min(b.frequency / 100, 1) * 0.3;
      return scoreB - scoreA;
    });

    return candidates.slice(0, maxResults);
  }

  /**
   * Estimate how many results a query would return
   */
  private async estimateResultCount(query: string): Promise<number> {
    const trimmed = query.trim();
    
    try {
      // Quick parallel count across entities
      const [assetCount, creatorCount, projectCount, licenseCount] = await Promise.all([
        this.prisma.ipAsset.count({
          where: {
            deletedAt: null,
            OR: [
              { title: { contains: trimmed, mode: 'insensitive' } },
              { description: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
        }),
        this.prisma.creator.count({
          where: {
            deletedAt: null,
            OR: [
              { stageName: { contains: trimmed, mode: 'insensitive' } },
              { bio: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
        }),
        this.prisma.project.count({
          where: {
            deletedAt: null,
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { description: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
        }),
        this.prisma.license.count({
          where: {
            deletedAt: null,
            OR: [
              { ipAsset: { title: { contains: trimmed, mode: 'insensitive' } } },
              { brand: { companyName: { contains: trimmed, mode: 'insensitive' } } },
            ],
          },
        }),
      ]);

      return assetCount + creatorCount + projectCount + licenseCount;
    } catch (error) {
      console.error('Error estimating result count:', error);
      return 0;
    }
  }

  /**
   * Update word frequency corpus from database
   */
  private async updateCorpusIfNeeded(): Promise<void> {
    const now = new Date();
    
    // Check if we need to update
    if (
      this.lastCorpusUpdate &&
      now.getTime() - this.lastCorpusUpdate.getTime() < this.corpusUpdateInterval
    ) {
      return;
    }

    try {
      await this.updateCorpus();
      this.lastCorpusUpdate = now;
    } catch (error) {
      console.error('Failed to update spelling corpus:', error);
    }
  }

  /**
   * Build word frequency map from searchable content
   */
  private async updateCorpus(): Promise<void> {
    this.wordFrequency.clear();

    // Get asset titles
    const assets = await this.prisma.ipAsset.findMany({
      where: { deletedAt: null },
      select: { title: true, description: true },
      take: 5000, // Limit to prevent memory issues
    });

    assets.forEach(asset => {
      this.addWordsToCorpus(asset.title);
      if (asset.description) {
        this.addWordsToCorpus(asset.description);
      }
    });

    // Get creator names
    const creators = await this.prisma.creator.findMany({
      where: { deletedAt: null },
      select: { stageName: true, bio: true },
      take: 2000,
    });

    creators.forEach(creator => {
      this.addWordsToCorpus(creator.stageName);
      if (creator.bio) {
        this.addWordsToCorpus(creator.bio);
      }
    });

    // Get project names
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      select: { name: true, description: true },
      take: 2000,
    });

    projects.forEach(project => {
      this.addWordsToCorpus(project.name);
      if (project.description) {
        this.addWordsToCorpus(project.description);
      }
    });

    // Get successful search queries
    const searchQueries = await this.prisma.searchAnalyticsEvent.findMany({
      where: {
        resultsCount: { gt: 0 },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      select: { query: true },
      distinct: ['query'],
      take: 1000,
    });

    searchQueries.forEach((event: { query: string }) => {
      this.addWordsToCorpus(event.query, 2); // Weight successful queries higher
    });

    console.log(`Spell correction corpus updated with ${this.wordFrequency.size} unique words`);
  }

  /**
   * Add words from text to frequency map
   */
  private addWordsToCorpus(text: string, weight: number = 1): void {
    const words = extractWords(text);
    
    words.forEach(word => {
      const current = this.wordFrequency.get(word) || 0;
      this.wordFrequency.set(word, current + weight);
    });
  }

  /**
   * Manually trigger corpus update (useful for testing or forced refresh)
   */
  async forceCorpusUpdate(): Promise<void> {
    await this.updateCorpus();
    this.lastCorpusUpdate = new Date();
  }
}
