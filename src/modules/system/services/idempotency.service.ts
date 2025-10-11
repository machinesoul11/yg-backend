/**
 * Idempotency Service
 * 
 * Prevents duplicate operations by storing and retrieving results
 */

import { PrismaClient } from '@prisma/client';
import {
  IdempotencyError,
} from '../errors';
import type {
  IdempotencyResult,
  StartProcessingParams,
  CompleteProcessingParams,
} from '../types';

export class IdempotencyService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if operation was already performed
   * Returns stored response if exists and processed
   */
  async check(key: string): Promise<IdempotencyResult | null> {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (!record) return null;

    // Check if expired
    if (record.expiresAt < new Date()) {
      await this.prisma.idempotencyKey.delete({ where: { id: record.id } });
      return null;
    }

    // Check if stuck (processing > 5 minutes)
    if (record.processingAt && !record.processed) {
      const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
      if (record.processingAt < stuckThreshold) {
        // Reset for retry
        await this.prisma.idempotencyKey.update({
          where: { id: record.id },
          data: { processingAt: null },
        });
        return null;
      }
      // Still processing, return 409 Conflict
      throw new IdempotencyError('PROCESSING', 'Operation still in progress');
    }

    if (record.processed) {
      return {
        processed: true,
        responseStatus: record.responseStatus!,
        responseBody: record.responseBody as any,
        entityType: record.entityType,
        entityId: record.entityId,
      };
    }

    return null;
  }

  /**
   * Create idempotency record and mark as processing
   */
  async startProcessing(params: StartProcessingParams): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.idempotencyKey.create({
      data: {
        key: params.key,
        entityType: params.entityType,
        requestHash: params.requestHash,
        processingAt: new Date(),
        expiresAt,
      },
    });
  }

  /**
   * Store successful result
   */
  async completeProcessing(params: CompleteProcessingParams): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key: params.key },
      data: {
        processed: true,
        processingAt: null,
        entityId: params.entityId,
        responseStatus: params.responseStatus,
        responseBody: params.responseBody as any,
      },
    });
  }

  /**
   * Cleanup expired keys (background job)
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}
