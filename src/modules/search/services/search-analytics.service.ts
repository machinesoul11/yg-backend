/**
 * Search Analytics Service
 * Tracks and analyzes search behavior for continuous improvement
 */

import { PrismaClient } from '@prisma/client';
import type { SearchAnalytics, SearchAnalyticsEvent } from '../types/search.types';

export class SearchAnalyticsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get search analytics for a time period
   */
  async getSearchAnalytics(startDate: Date, endDate: Date): Promise<SearchAnalytics> {
    const events = await this.prisma.searchAnalyticsEvent.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (events.length === 0) {
      return this.emptyAnalytics();
    }

    const totalSearches = events.length;
    const totalExecutionTime = events.reduce((sum, e) => sum + e.executionTimeMs, 0);
    const averageExecutionTimeMs = totalExecutionTime / totalSearches;
    
    const totalResults = events.reduce((sum, e) => sum + e.resultsCount, 0);
    const averageResultsCount = totalResults / totalSearches;
    
    const zeroResultsCount = events.filter(e => e.resultsCount === 0).length;
    const zeroResultsRate = zeroResultsCount / totalSearches;
    
    const clickedCount = events.filter(e => e.clickedResultId !== null).length;
    const clickThroughRate = clickedCount / totalSearches;

    // Top queries
    const queryMap = new Map<string, { count: number; totalResults: number }>();
    events.forEach(e => {
      const existing = queryMap.get(e.query) || { count: 0, totalResults: 0 };
      queryMap.set(e.query, {
        count: existing.count + 1,
        totalResults: existing.totalResults + e.resultsCount,
      });
    });

    const topQueries = Array.from(queryMap.entries())
      .map(([query, data]) => ({
        query,
        count: data.count,
        averageResultsCount: data.totalResults / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Top entities
    const entityMap = new Map<string, number>();
    events.forEach(e => {
      const entities = Array.isArray(e.entities) ? e.entities : [];
      entities.forEach(entity => {
        entityMap.set(entity, (entityMap.get(entity) || 0) + 1);
      });
    });

    const topEntities = Array.from(entityMap.entries())
      .map(([entity, count]) => ({
        entity: entity as any,
        searchCount: count,
      }))
      .sort((a, b) => b.searchCount - a.searchCount);

    // Zero result queries
    const zeroResultQueries = events
      .filter(e => e.resultsCount === 0)
      .reduce((map, e) => {
        map.set(e.query, (map.get(e.query) || 0) + 1);
        return map;
      }, new Map<string, number>());

    const zeroResultQueriesArray = Array.from(zeroResultQueries.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      totalSearches,
      averageExecutionTimeMs,
      averageResultsCount,
      zeroResultsRate,
      clickThroughRate,
      topQueries,
      topEntities,
      zeroResultQueries: zeroResultQueriesArray,
    };
  }

  /**
   * Track search result click
   */
  async trackResultClick(
    eventId: string,
    resultId: string,
    resultPosition: number,
    resultEntityType: string
  ): Promise<void> {
    await this.prisma.searchAnalyticsEvent.update({
      where: { id: eventId },
      data: {
        clickedResultId: resultId,
        clickedResultPosition: resultPosition,
        clickedResultEntityType: resultEntityType,
      },
    });
  }

  /**
   * Get most common zero-result queries
   */
  async getZeroResultQueries(
    startDate: Date,
    endDate: Date,
    limit: number = 20
  ): Promise<Array<{ query: string; count: number }>> {
    const events = await this.prisma.searchAnalyticsEvent.findMany({
      where: {
        resultsCount: 0,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        query: true,
      },
    });

    const queryMap = new Map<string, number>();
    events.forEach(e => {
      queryMap.set(e.query, (queryMap.get(e.query) || 0) + 1);
    });

    return Array.from(queryMap.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get search performance metrics
   */
  async getPerformanceMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    averageExecutionTime: number;
    p50ExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
    slowestQueries: Array<{ query: string; executionTimeMs: number }>;
  }> {
    const events = await this.prisma.searchAnalyticsEvent.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        query: true,
        executionTimeMs: true,
      },
      orderBy: {
        executionTimeMs: 'asc',
      },
    });

    if (events.length === 0) {
      return {
        averageExecutionTime: 0,
        p50ExecutionTime: 0,
        p95ExecutionTime: 0,
        p99ExecutionTime: 0,
        slowestQueries: [],
      };
    }

    const totalTime = events.reduce((sum, e) => sum + e.executionTimeMs, 0);
    const averageExecutionTime = totalTime / events.length;

    const p50Index = Math.floor(events.length * 0.5);
    const p95Index = Math.floor(events.length * 0.95);
    const p99Index = Math.floor(events.length * 0.99);

    const p50ExecutionTime = events[p50Index]?.executionTimeMs || 0;
    const p95ExecutionTime = events[p95Index]?.executionTimeMs || 0;
    const p99ExecutionTime = events[p99Index]?.executionTimeMs || 0;

    const slowestQueries = events
      .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
      .slice(0, 10)
      .map(e => ({
        query: e.query,
        executionTimeMs: e.executionTimeMs,
      }));

    return {
      averageExecutionTime,
      p50ExecutionTime,
      p95ExecutionTime,
      p99ExecutionTime,
      slowestQueries,
    };
  }

  /**
   * Get trending searches
   */
  async getTrendingSearches(
    hours: number = 24,
    limit: number = 10
  ): Promise<Array<{ query: string; count: number; growth: number }>> {
    const now = new Date();
    const recentStart = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const previousStart = new Date(recentStart.getTime() - hours * 60 * 60 * 1000);

    const [recentEvents, previousEvents] = await Promise.all([
      this.prisma.searchAnalyticsEvent.findMany({
        where: {
          createdAt: {
            gte: recentStart,
            lte: now,
          },
        },
        select: { query: true },
      }),
      this.prisma.searchAnalyticsEvent.findMany({
        where: {
          createdAt: {
            gte: previousStart,
            lt: recentStart,
          },
        },
        select: { query: true },
      }),
    ]);

    const recentMap = new Map<string, number>();
    recentEvents.forEach(e => {
      recentMap.set(e.query, (recentMap.get(e.query) || 0) + 1);
    });

    const previousMap = new Map<string, number>();
    previousEvents.forEach(e => {
      previousMap.set(e.query, (previousMap.get(e.query) || 0) + 1);
    });

    const trending = Array.from(recentMap.entries())
      .map(([query, recentCount]) => {
        const previousCount = previousMap.get(query) || 0;
        const growth = previousCount > 0 
          ? ((recentCount - previousCount) / previousCount) * 100 
          : 100;
        
        return {
          query,
          count: recentCount,
          growth,
        };
      })
      .filter(item => item.count >= 3) // Minimum threshold
      .sort((a, b) => b.growth - a.growth)
      .slice(0, limit);

    return trending;
  }

  /**
   * Clean up old analytics events
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.searchAnalyticsEvent.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Return empty analytics
   */
  private emptyAnalytics(): SearchAnalytics {
    return {
      totalSearches: 0,
      averageExecutionTimeMs: 0,
      averageResultsCount: 0,
      zeroResultsRate: 0,
      clickThroughRate: 0,
      topQueries: [],
      topEntities: [],
      zeroResultQueries: [],
    };
  }
}
