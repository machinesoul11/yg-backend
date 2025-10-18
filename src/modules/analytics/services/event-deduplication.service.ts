/**
 * Event Deduplication Service
 * Prevents duplicate events from entering the analytics system
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { createHash } from 'crypto';

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  totalChecks: number;
  duplicatesFound: number;
  deduplicationRate: number;
}

export class EventDeduplicationService {
  private stats = {
    totalChecks: 0,
    duplicatesFound: 0,
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Check if event is a duplicate using fingerprint
   */
  async checkDuplicate(fingerprint: string, ttlSeconds: number = 60): Promise<boolean> {
    this.stats.totalChecks++;

    try {
      const key = `event:fingerprint:${fingerprint}`;
      const exists = await this.redis.exists(key);

      if (exists === 1) {
        this.stats.duplicatesFound++;
        console.log(`[Deduplication] Duplicate detected: ${fingerprint}`);
        return true;
      }

      // Store fingerprint to prevent future duplicates
      await this.redis.setex(key, ttlSeconds, '1');
      return false;
    } catch (error) {
      console.error('[Deduplication] Error checking duplicate:', error);
      // Fail open - don't block event processing
      return false;
    }
  }

  /**
   * Generate fingerprint from event data
   */
  generateFingerprint(
    eventType: string,
    actorId: string | null,
    sessionId: string | null,
    entityId: string | null,
    occurredAt: Date
  ): string {
    // Round timestamp to nearest second for deduplication
    const roundedTimestamp = Math.floor(occurredAt.getTime() / 1000);

    const components = [
      eventType,
      actorId || 'anonymous',
      sessionId || '',
      entityId || '',
      roundedTimestamp.toString(),
    ];

    return createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Run database-level deduplication cleanup
   * Identifies and soft-deletes duplicate events based on multiple criteria
   */
  async runDatabaseDeduplication(
    lookbackHours: number = 24
  ): Promise<{ duplicatesFound: number; duplicatesRemoved: number }> {
    try {
      const lookbackDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

      console.log(`[Deduplication] Running database cleanup for events since ${lookbackDate}`);

      // Find duplicate events
      // Events are considered duplicates if they have:
      // - Same event_type
      // - Same actor_id
      // - Same session_id
      // - occurred_at within 1 second of each other
      // - Same entity references (projectId, ipAssetId, licenseId, postId)

      const duplicates: any[] = await this.prisma.$queryRaw`
        WITH ranked_events AS (
          SELECT 
            id,
            event_type,
            actor_id,
            session_id,
            occurred_at,
            project_id,
            ip_asset_id,
            license_id,
            post_id,
            ROW_NUMBER() OVER (
              PARTITION BY 
                event_type,
                actor_id,
                session_id,
                project_id,
                ip_asset_id,
                license_id,
                post_id,
                DATE_TRUNC('second', occurred_at)
              ORDER BY created_at ASC
            ) as rn
          FROM events
          WHERE occurred_at >= ${lookbackDate}
            AND deleted_at IS NULL
        )
        SELECT id
        FROM ranked_events
        WHERE rn > 1
      `;

      if (duplicates.length === 0) {
        console.log('[Deduplication] No duplicates found in database');
        return { duplicatesFound: 0, duplicatesRemoved: 0 };
      }

      // Soft-delete duplicates by updating propsJson
      const duplicateIds = duplicates.map((d) => d.id);
      
      // Mark events as duplicates in props_json rather than deleting
      await this.prisma.$executeRaw`
        UPDATE events
        SET props_json = jsonb_set(
          props_json::jsonb,
          '{_duplicate}',
          'true'::jsonb,
          true
        )
        WHERE id = ANY(${duplicateIds}::text[])
      `;

      console.log(
        `[Deduplication] Marked ${duplicates.length} duplicate events in database`
      );

      return {
        duplicatesFound: duplicates.length,
        duplicatesRemoved: duplicates.length,
      };
    } catch (error) {
      console.error('[Deduplication] Error running database deduplication:', error);
      throw error;
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return {
      totalChecks: this.stats.totalChecks,
      duplicatesFound: this.stats.duplicatesFound,
      deduplicationRate:
        this.stats.totalChecks > 0
          ? (this.stats.duplicatesFound / this.stats.totalChecks) * 100
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChecks: 0,
      duplicatesFound: 0,
    };
  }

  /**
   * Clean up expired fingerprints from Redis
   * (This happens automatically via TTL, but this method can be used for monitoring)
   */
  async getActiveFingerprintCount(): Promise<number> {
    try {
      const keys = await this.redis.keys('event:fingerprint:*');
      return keys.length;
    } catch (error) {
      console.error('[Deduplication] Error getting fingerprint count:', error);
      return 0;
    }
  }

  /**
   * Monitor deduplication rates and alert if anomalies detected
   */
  async monitorDeduplicationRates(): Promise<{
    isHealthy: boolean;
    metrics: DeduplicationStats;
    alerts: string[];
  }> {
    const stats = this.getStats();
    const alerts: string[] = [];
    let isHealthy = true;

    // Alert if deduplication rate exceeds 10%
    if (stats.deduplicationRate > 10) {
      alerts.push(
        `High deduplication rate: ${stats.deduplicationRate.toFixed(2)}% (threshold: 10%)`
      );
      isHealthy = false;
    }

    // Alert if deduplication rate exceeds 25% (critical)
    if (stats.deduplicationRate > 25) {
      alerts.push(
        `CRITICAL: Excessive deduplication rate: ${stats.deduplicationRate.toFixed(2)}% - possible client bug or attack`
      );
    }

    return {
      isHealthy,
      metrics: stats,
      alerts,
    };
  }
}
