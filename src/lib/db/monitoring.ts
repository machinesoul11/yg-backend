/**
 * Database Monitoring and Observability
 * 
 * Provides metrics, logging, and alerting for database operations
 */

import { PrismaClient } from '@prisma/client';

interface QueryMetrics {
  model: string;
  operation: string;
  duration: number;
  timestamp: Date;
}

interface DatabaseMetrics {
  queries: {
    total: number;
    slow: number;
    failed: number;
  };
  connections: {
    active: number;
    idle: number;
    total: number;
  };
  performance: {
    avgQueryTime: number;
    p95QueryTime: number;
    p99QueryTime: number;
  };
}

class DatabaseMonitor {
  private queryMetrics: QueryMetrics[] = [];
  private metricsWindow = 60 * 1000; // 1 minute
  private slowQueryThreshold = 1000; // 1 second

  constructor(private prisma: PrismaClient) {
    this.setupQueryLogging();
  }

  /**
   * Setup Prisma query event logging
   */
  private setupQueryLogging(): void {
    if (process.env.NODE_ENV === 'development') {
      this.prisma.$on('query' as never, (event: any) => {
        this.recordQuery({
          model: event.target || 'unknown',
          operation: event.query?.split(' ')[0] || 'unknown',
          duration: event.duration,
          timestamp: new Date(),
        });

        // Log slow queries
        if (event.duration > this.slowQueryThreshold) {
          console.warn('Slow query detected:', {
            query: event.query,
            duration: `${event.duration}ms`,
            params: event.params,
          });
        }
      });
    }
  }

  /**
   * Record query execution
   */
  private recordQuery(metrics: QueryMetrics): void {
    this.queryMetrics.push(metrics);

    // Keep only recent metrics
    const cutoff = Date.now() - this.metricsWindow;
    this.queryMetrics = this.queryMetrics.filter(
      (m) => m.timestamp.getTime() > cutoff
    );
  }

  /**
   * Get current database metrics
   */
  async getMetrics(): Promise<DatabaseMetrics> {
    const now = Date.now();
    const cutoff = now - this.metricsWindow;
    const recentQueries = this.queryMetrics.filter(
      (m) => m.timestamp.getTime() > cutoff
    );

    // Calculate performance metrics
    const durations = recentQueries.map((q) => q.duration).sort((a, b) => a - b);
    const avgQueryTime = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    // Get connection pool stats (if available)
    let connections = {
      active: 0,
      idle: 0,
      total: 0,
    };

    try {
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT 
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) as total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      if (result[0]) {
        connections = {
          active: parseInt(result[0].active || '0'),
          idle: parseInt(result[0].idle || '0'),
          total: parseInt(result[0].total || '0'),
        };
      }
    } catch (error) {
      console.error('Failed to fetch connection stats:', error);
    }

    return {
      queries: {
        total: recentQueries.length,
        slow: recentQueries.filter((q) => q.duration > this.slowQueryThreshold).length,
        failed: 0, // TODO: Track failed queries
      },
      connections,
      performance: {
        avgQueryTime: Math.round(avgQueryTime),
        p95QueryTime: durations[p95Index] || 0,
        p99QueryTime: durations[p99Index] || 0,
      },
    };
  }

  /**
   * Get slow query report
   */
  getSlowQueries(limit = 10): QueryMetrics[] {
    return this.queryMetrics
      .filter((q) => q.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Check database size and usage
   */
  async getDatabaseSize(): Promise<{
    databaseSize: string;
    tableCount: number;
    largestTables: Array<{ table: string; size: string }>;
  }> {
    try {
      // Get total database size
      const dbSize = await this.prisma.$queryRaw<any[]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;

      // Get table count
      const tableCount = await this.prisma.$queryRaw<any[]>`
        SELECT count(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;

      // Get largest tables
      const largestTables = await this.prisma.$queryRaw<any[]>`
        SELECT 
          schemaname || '.' || tablename as table,
          pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
        LIMIT 10
      `;

      return {
        databaseSize: dbSize[0]?.size || '0',
        tableCount: parseInt(tableCount[0]?.count || '0'),
        largestTables: largestTables.map((t) => ({
          table: t.table,
          size: t.size,
        })),
      };
    } catch (error) {
      console.error('Failed to fetch database size:', error);
      return {
        databaseSize: 'unknown',
        tableCount: 0,
        largestTables: [],
      };
    }
  }

  /**
   * Monitor index usage
   */
  async getIndexUsage(): Promise<Array<{
    table: string;
    index: string;
    scans: number;
    tuples: number;
  }>> {
    try {
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT 
          schemaname || '.' || tablename as table,
          indexname as index,
          idx_scan as scans,
          idx_tup_read as tuples
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 20
      `;

      return result.map((r) => ({
        table: r.table,
        index: r.index,
        scans: parseInt(r.scans || '0'),
        tuples: parseInt(r.tuples || '0'),
      }));
    } catch (error) {
      console.error('Failed to fetch index usage:', error);
      return [];
    }
  }
}

export { DatabaseMonitor };
export type { QueryMetrics, DatabaseMetrics };
