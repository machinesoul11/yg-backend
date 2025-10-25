/**
 * Event Ingestion tRPC Router
 * Type-safe API endpoints for event tracking
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { trackEventSchema } from '@/lib/schemas/analytics.schema';
import { EventIngestionService } from '../services/event-ingestion.service';
import { enrichEventQueue } from '@/jobs/analytics-jobs';
import { redis } from '@/lib/redis';
import type { RequestContext } from '../types';

/**
 * Get ingestion service with proper prisma instance
 */
function getIngestionService(db: any): EventIngestionService {
  if (!ingestionServiceInstance) {
    ingestionServiceInstance = new EventIngestionService(
      db,
      redis,
      enrichEventQueue,
      {
        batchSize: 100,
        batchTimeoutMs: 10000,
        enableDeduplication: true,
        enableEnrichment: true,
        deduplicationTtlSeconds: 60,
      }
    );
  }
  return ingestionServiceInstance;
}

// Global ingestion service instance (reused across requests for batching)
let ingestionServiceInstance: EventIngestionService | null = null;

export const eventIngestionRouter = createTRPCRouter({
  /**
   * Track a single event
   * Public endpoint - can be called without authentication for anonymous tracking
   */
  track: publicProcedure
    .input(trackEventSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Ensure Redis connection is ready before proceeding
        if (redis.status !== 'ready' && redis.status !== 'connecting') {
          console.log('[EventIngestion] Redis not ready, attempting connection...');
          try {
            await redis.connect();
          } catch (connError) {
            console.error('[EventIngestion] Redis connection failed:', connError);
            // Silently fail - don't block the request
            return {
              id: `offline-${Date.now()}`,
              eventType: input.eventType,
              status: 'queued' as const,
            };
          }
        } else if (redis.status === 'connecting') {
          // If already connecting, wait a bit then check again
          console.log('[EventIngestion] Redis already connecting, waiting...');
          // Don't wait - just return success to avoid blocking
          return {
            id: `connecting-${Date.now()}`,
            eventType: input.eventType,
            status: 'queued' as const,
          };
        }

        const ingestionService = getIngestionService(ctx.db);

        // Build request context from session and headers
        const requestContext: RequestContext = {
          session: ctx.session
            ? {
                userId: ctx.session.user.id,
                role: ctx.session.user.role,
                email: ctx.session.user.email,
              }
            : undefined,
          userAgent: ctx.req?.headers?.get('user-agent') || undefined,
          ipAddress: ctx.req?.headers?.get('x-forwarded-for') || ctx.req?.headers?.get('x-real-ip') || undefined,
        };

        return await ingestionService.ingest(input, requestContext);
      } catch (error) {
        // Log error but return success to prevent client-side errors
        console.error('[EventIngestion] Track error:', error instanceof Error ? error.message : 'Unknown error');
        
        // Return a minimal success response even if ingestion fails
        // This prevents the client from retrying endlessly
        return {
          id: `error-${Date.now()}`,
          eventType: input.eventType,
          status: 'queued' as const,
        };
      }
    }),

  /**
   * Track multiple events in a batch
   * Useful for offline clients that queue events
   */
  trackBatch: publicProcedure
    .input(
      z.object({
        events: z.array(trackEventSchema).min(1).max(50), // Max 50 events per batch
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Ensure Redis connection is ready before proceeding
        if (redis.status !== 'ready' && redis.status !== 'connecting') {
          console.log('[EventIngestion] Redis not ready for batch, attempting connection...');
          try {
            await redis.connect();
          } catch (connError) {
            console.error('[EventIngestion] Redis connection failed for batch:', connError);
            // Return degraded response - silently fail
            return {
              total: input.events.length,
              successful: input.events.length, // Pretend success to avoid client retries
              failed: 0,
              results: input.events.map((_, i) => ({
                index: i,
                status: 'fulfilled' as const,
                data: {
                  id: `offline-batch-${Date.now()}-${i}`,
                  eventType: input.events[i].eventType,
                  status: 'queued' as const,
                },
                error: null,
              })),
            };
          }
        } else if (redis.status === 'connecting') {
          // If already connecting, return success immediately
          console.log('[EventIngestion] Redis connecting for batch, returning success...');
          return {
            total: input.events.length,
            successful: input.events.length,
            failed: 0,
            results: input.events.map((_, i) => ({
              index: i,
              status: 'fulfilled' as const,
              data: {
                id: `connecting-batch-${Date.now()}-${i}`,
                eventType: input.events[i].eventType,
                status: 'queued' as const,
              },
              error: null,
            })),
          };
        }

        const ingestionService = getIngestionService(ctx.db);

        // Build request context
        const requestContext: RequestContext = {
          session: ctx.session
            ? {
                userId: ctx.session.user.id,
                role: ctx.session.user.role,
                email: ctx.session.user.email,
              }
            : undefined,
          userAgent: ctx.req?.headers?.get('user-agent') || undefined,
          ipAddress: ctx.req?.headers?.get('x-forwarded-for') || ctx.req?.headers?.get('x-real-ip') || undefined,
        };

        // Process all events
        const results = await Promise.allSettled(
          input.events.map((event) => ingestionService.ingest(event, requestContext))
        );

        // Count successes and failures
        const successful = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        return {
          total: input.events.length,
          successful,
          failed,
          results: results.map((r, i) => ({
            index: i,
            status: r.status,
            data: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? r.reason?.message : null,
          })),
        };
      } catch (error) {
        // Log error but return partial success response
        console.error('[EventIngestion] TrackBatch error:', error instanceof Error ? error.message : 'Unknown error');
        
        // Return a degraded response
        return {
          total: input.events.length,
          successful: 0,
          failed: input.events.length,
          results: input.events.map((_, i) => ({
            index: i,
            status: 'rejected' as const,
            data: null,
            error: 'Service temporarily unavailable',
          })),
        };
      }
    }),

  /**
   * Get ingestion buffer stats (admin only)
   */
  getStats: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      // Only allow admins to view stats
      if (ctx.session.user.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can view ingestion stats',
        });
      }

      if (!ingestionServiceInstance) {
        return {
          bufferSize: 0,
          isProcessing: false,
          config: null,
        };
      }

      return ingestionServiceInstance.getStats();
    }),

  /**
   * Force flush event buffer (admin only)
   * Useful for testing or ensuring events are written immediately
   */
  forceFlush: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      // Only allow admins to force flush
      if (ctx.session.user.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can force flush',
        });
      }

      if (!ingestionServiceInstance) {
        return { flushed: false, message: 'No ingestion service instance' };
      }

      // Access private flushBatch method via reflection
      // @ts-ignore
      await ingestionServiceInstance.flushBatch();

      return { flushed: true, message: 'Buffer flushed successfully' };
    }),
});
