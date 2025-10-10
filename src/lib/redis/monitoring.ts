import { getRedisClient } from './client';

export interface RedisMetrics {
  memory: {
    used: string;
    peak: string;
    fragmentation: string;
    rss: string;
  };
  stats: {
    totalConnections: number;
    totalCommands: number;
    opsPerSec: number;
    keyspaceHits: number;
    keyspaceMisses: number;
    hitRate: number;
  };
  keyspace: {
    totalKeys: number;
    expires: number;
  };
  replication: {
    role: string;
    connectedSlaves: number;
  };
  cpu: {
    usedCpuSys: string;
    usedCpuUser: string;
  };
  server: {
    version: string;
    uptime: number;
    uptimeDays: number;
  };
}

export interface RedisHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  memoryUsagePercent?: number;
  hitRate?: number;
  details: {
    memory: string;
    connections: number;
    keyspace: number;
  };
  issues: string[];
}

export class RedisMonitor {
  private redis = getRedisClient();

  /**
   * Get comprehensive Redis metrics
   */
  async getMetrics(): Promise<RedisMetrics> {
    try {
      const [memory, stats, keyspace, replication, cpu, server] = await Promise.all([
        this.redis.info('memory'),
        this.redis.info('stats'),
        this.redis.info('keyspace'),
        this.redis.info('replication'),
        this.redis.info('cpu'),
        this.redis.info('server'),
      ]);

      const memoryParsed = this.parseInfoSection(memory);
      const statsParsed = this.parseInfoSection(stats);
      const keyspaceParsed = this.parseInfoSection(keyspace);
      const replicationParsed = this.parseInfoSection(replication);
      const cpuParsed = this.parseInfoSection(cpu);
      const serverParsed = this.parseInfoSection(server);

      // Calculate hit rate
      const hits = parseInt(statsParsed.keyspace_hits || '0');
      const misses = parseInt(statsParsed.keyspace_misses || '0');
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      // Parse keyspace
      const dbsize = await this.redis.dbsize();
      const db0 = keyspaceParsed.db0 || '';
      const expiresMatch = db0.match(/expires=(\d+)/);
      const expires = expiresMatch ? parseInt(expiresMatch[1]) : 0;

      return {
        memory: {
          used: memoryParsed.used_memory_human || 'unknown',
          peak: memoryParsed.used_memory_peak_human || 'unknown',
          fragmentation: memoryParsed.mem_fragmentation_ratio || 'unknown',
          rss: memoryParsed.used_memory_rss_human || 'unknown',
        },
        stats: {
          totalConnections: parseInt(statsParsed.total_connections_received || '0'),
          totalCommands: parseInt(statsParsed.total_commands_processed || '0'),
          opsPerSec: parseInt(statsParsed.instantaneous_ops_per_sec || '0'),
          keyspaceHits: hits,
          keyspaceMisses: misses,
          hitRate: Math.round(hitRate * 100) / 100,
        },
        keyspace: {
          totalKeys: dbsize,
          expires,
        },
        replication: {
          role: replicationParsed.role || 'unknown',
          connectedSlaves: parseInt(replicationParsed.connected_slaves || '0'),
        },
        cpu: {
          usedCpuSys: cpuParsed.used_cpu_sys || 'unknown',
          usedCpuUser: cpuParsed.used_cpu_user || 'unknown',
        },
        server: {
          version: serverParsed.redis_version || 'unknown',
          uptime: parseInt(serverParsed.uptime_in_seconds || '0'),
          uptimeDays: parseInt(serverParsed.uptime_in_days || '0'),
        },
      };
    } catch (error) {
      console.error('[RedisMonitor] Error getting metrics:', error);
      throw error;
    }
  }

  /**
   * Get health status with recommendations
   */
  async getHealthStatus(): Promise<RedisHealthStatus> {
    const issues: string[] = [];

    try {
      // Measure latency
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      // Get metrics
      const metrics = await this.getMetrics();

      // Parse memory usage percentage (if available)
      const memoryInfo = await this.redis.info('memory');
      const memoryParsed = this.parseInfoSection(memoryInfo);
      const usedMemory = parseInt(memoryParsed.used_memory || '0');
      const maxMemory = parseInt(memoryParsed.maxmemory || '0');
      const memoryUsagePercent = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : undefined;

      // Check for issues
      if (latency > 100) {
        issues.push(`High latency: ${latency}ms (threshold: 100ms)`);
      }

      if (metrics.stats.hitRate < 70) {
        issues.push(`Low cache hit rate: ${metrics.stats.hitRate}% (threshold: 70%)`);
      }

      if (memoryUsagePercent && memoryUsagePercent > 85) {
        issues.push(`High memory usage: ${memoryUsagePercent.toFixed(2)}% (threshold: 85%)`);
      }

      const fragmentation = parseFloat(metrics.memory.fragmentation);
      if (fragmentation > 1.5) {
        issues.push(`High memory fragmentation: ${fragmentation} (threshold: 1.5)`);
      }

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (issues.length === 0) {
        status = 'healthy';
      } else if (issues.length <= 2 && latency < 200) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        latency,
        memoryUsagePercent,
        hitRate: metrics.stats.hitRate,
        details: {
          memory: metrics.memory.used,
          connections: metrics.stats.totalConnections,
          keyspace: metrics.keyspace.totalKeys,
        },
        issues,
      };
    } catch (error) {
      console.error('[RedisMonitor] Error getting health status:', error);

      return {
        status: 'unhealthy',
        latency: -1,
        details: {
          memory: 'unknown',
          connections: 0,
          keyspace: 0,
        },
        issues: [`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Get slow log entries
   */
  async getSlowLog(count: number = 10): Promise<any[]> {
    try {
      const result = await this.redis.call('SLOWLOG', 'GET', count) as any[];
      return result || [];
    } catch (error) {
      console.error('[RedisMonitor] Error getting slow log:', error);
      return [];
    }
  }

  /**
   * Get client list
   */
  async getClientList(): Promise<string[]> {
    try {
      const clients = await this.redis.call('CLIENT', 'LIST') as string;
      return clients.split('\n').filter((line: string) => line.trim());
    } catch (error) {
      console.error('[RedisMonitor] Error getting client list:', error);
      return [];
    }
  }

  /**
   * Get memory stats
   */
  async getMemoryStats(): Promise<any> {
    try {
      const stats = await this.redis.call('MEMORY', 'STATS');
      return stats;
    } catch (error) {
      console.error('[RedisMonitor] Error getting memory stats:', error);
      return null;
    }
  }

  /**
   * Check connection pool health
   */
  async checkConnectionPool(): Promise<{
    connected: boolean;
    ready: boolean;
    status: string;
  }> {
    try {
      return {
        connected: this.redis.status === 'connect' || this.redis.status === 'ready',
        ready: this.redis.status === 'ready',
        status: this.redis.status,
      };
    } catch (error) {
      console.error('[RedisMonitor] Error checking connection pool:', error);
      return {
        connected: false,
        ready: false,
        status: 'error',
      };
    }
  }

  /**
   * Parse Redis INFO section into key-value pairs
   */
  private parseInfoSection(info: string): Record<string, string> {
    const result: Record<string, string> = {};

    info.split('\r\n').forEach((line) => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      }
    });

    return result;
  }

  /**
   * Get key distribution by pattern
   */
  async getKeyDistribution(): Promise<Record<string, number>> {
    try {
      const patterns = [
        'cache:*',
        'session:*',
        'jobs:*',
        'ratelimit:*',
        'lock:*',
        'idempotency:*',
        'verification:*',
      ];

      const distribution: Record<string, number> = {};

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        const namespace = pattern.replace(':*', '');
        distribution[namespace] = keys.length;
      }

      return distribution;
    } catch (error) {
      console.error('[RedisMonitor] Error getting key distribution:', error);
      return {};
    }
  }
}

// Export singleton instance
export const redisMonitor = new RedisMonitor();
