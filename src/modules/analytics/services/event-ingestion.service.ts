/**
 * Event Ingestion Service
 * Handles high-throughput event ingestion with batching, validation, and deduplication
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { TRPCError } from '@trpc/server';
import type { TrackEventInput } from '@/lib/schemas/analytics.schema';
import type { RequestContext, EventCreated } from '../types/index';
import { EVENT_TYPES, EVENT_SOURCES, ACTOR_TYPES } from '@/lib/constants/event-types';
import { createHash } from 'crypto';

/**
 * Event data prepared for batch insertion
 */
interface BatchedEvent {
  occurredAt: Date;
  source: string;
  eventType: string;
  actorType: string | null;
  actorId: string | null;
  projectId: string | null;
  ipAssetId: string | null;
  licenseId: string | null;
  postId: string | null;
  userId: string | null;
  brandId: string | null;
  creatorId: string | null;
  propsJson: any;
  sessionId: string | null;
}

/**
 * Validation error details
 */
interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Configuration for event ingestion
 */
export interface EventIngestionConfig {
  batchSize: number;
  batchTimeoutMs: number;
  enableDeduplication: boolean;
  enableEnrichment: boolean;
  deduplicationTtlSeconds: number;
}

export class EventIngestionService {
  private eventBuffer: BatchedEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private shutdownRequested = false;
  
  // Circuit breaker for Redis failures
  private redisFailureCount = 0;
  private redisCircuitOpen = false;
  private lastRedisFailure = 0;
  private readonly REDIS_CIRCUIT_THRESHOLD = 5;
  private readonly REDIS_CIRCUIT_RESET_MS = 30000; // 30 seconds

  private readonly config: EventIngestionConfig = {
    batchSize: 100,
    batchTimeoutMs: 10000, // 10 seconds
    enableDeduplication: true,
    enableEnrichment: true,
    deduplicationTtlSeconds: 60,
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private enrichmentQueue: Queue,
    config?: Partial<EventIngestionConfig>
  ) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start batch timer
    this.startBatchTimer();

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Ingest a single event (adds to batch buffer)
   */
  async ingest(
    input: TrackEventInput,
    context: RequestContext
  ): Promise<EventCreated> {
    try {
      // Step 1: Schema validation (already done by Zod)
      
      // Step 2: Business logic validation
      const validationErrors = await this.validateEvent(input, context);
      if (validationErrors.length > 0) {
        // Only log validation errors in development
        if (process.env.NODE_ENV === 'development') {
          console.error('[EventIngestion] Validation failed:', validationErrors);
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Event validation failed: ${validationErrors.map(e => e.message).join(', ')}`,
        });
      }

      // Step 3: Deduplication check (with circuit breaker)
      if (this.config.enableDeduplication && !this.redisCircuitOpen) {
        const fingerprint = this.generateFingerprint(input, context);
        const isDuplicate = await this.checkDuplicate(fingerprint);
        if (isDuplicate) {
          // Only log in development to reduce noise
          if (process.env.NODE_ENV === 'development') {
            console.log('[EventIngestion] Duplicate event detected, skipping');
          }
          return { eventId: null, tracked: false };
        }
        // Store fingerprint in Redis (non-blocking)
        this.storeFingerprintAsync(fingerprint).catch(() => {
          // Silently ignore storage failures
        });
      }

      // Step 4: Idempotency key check (if provided)
      if (input.idempotencyKey && !this.redisCircuitOpen) {
        const existingResult = await this.checkIdempotency(input.idempotencyKey);
        if (existingResult) {
          return existingResult;
        }
      }

      // Step 5: Prepare event for batching
      const batchedEvent = this.prepareEventForBatch(input, context);

      // Step 6: Add to buffer
      this.eventBuffer.push(batchedEvent);

      // Step 7: Check if we should flush immediately
      if (this.eventBuffer.length >= this.config.batchSize) {
        this.flushBatch();
      }

      // Return success (actual DB write happens in batch)
      return { eventId: null, tracked: true };
    } catch (error) {
      // Only log unexpected errors, not TRPCErrors which are validation failures
      if (!(error instanceof TRPCError)) {
        console.error('[EventIngestion] Unexpected error ingesting event:', 
          error instanceof Error ? error.message : error);
      }
      
      // Re-throw TRPCErrors so the client gets proper validation feedback
      if (error instanceof TRPCError) {
        throw error;
      }
      
      // For other errors, fail gracefully
      return { eventId: null, tracked: false };
    }
  }

  /**
   * Validate event data with business logic and referential integrity
   */
  private async validateEvent(
    input: TrackEventInput,
    context: RequestContext
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Validate occurred_at (if provided in props)
    const occurredAt = (input.props as any)?.occurred_at;
    if (occurredAt) {
      const timestamp = new Date(occurredAt);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (timestamp > now) {
        errors.push({
          field: 'occurred_at',
          message: 'Event timestamp cannot be in the future',
          value: occurredAt,
        });
      }

      if (timestamp < thirtyDaysAgo) {
        errors.push({
          field: 'occurred_at',
          message: 'Event timestamp is too old (>30 days)',
          value: occurredAt,
        });
      }
    }

    // Validate event_type is recognized
    const validEventTypes = Object.values(EVENT_TYPES);
    if (!validEventTypes.includes(input.eventType as any)) {
      console.warn(`[EventIngestion] Unknown event type: ${input.eventType}`);
    }

    // Validate foreign key references (if provided)
    if (input.entityId && input.entityType) {
      const exists = await this.validateEntityReference(input.entityId, input.entityType);
      if (!exists) {
        errors.push({
          field: 'entityId',
          message: `Referenced ${input.entityType} with ID ${input.entityId} does not exist`,
          value: input.entityId,
        });
      }
    }

    // Validate actor_id from context
    if (context.session?.userId) {
      const userExists = await this.validateUserReference(context.session.userId);
      if (!userExists) {
        errors.push({
          field: 'actorId',
          message: `User with ID ${context.session.userId} does not exist`,
          value: context.session.userId,
        });
      }
    }

    // Validate props_json based on event_type
    const propsValidation = this.validateEventProps(input.eventType, input.props);
    errors.push(...propsValidation);

    return errors;
  }

  /**
   * Validate entity reference exists in database
   */
  private async validateEntityReference(
    entityId: string,
    entityType: string
  ): Promise<boolean> {
    try {
      const entityMap: Record<string, string> = {
        project: 'project',
        asset: 'ipAsset',
        license: 'license',
        post: 'post',
      };

      const modelName = entityMap[entityType];
      if (!modelName) return true; // Skip validation for unknown types

      const result = await (this.prisma as any)[modelName].findUnique({
        where: { id: entityId },
        select: { id: true },
      });

      return result !== null;
    } catch (error) {
      console.error('[EventIngestion] Error validating entity reference:', error);
      return true; // Fail open to avoid blocking events
    }
  }

  /**
   * Validate user reference exists
   */
  private async validateUserReference(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, deleted_at: true },
      });

      return user !== null && user.deleted_at === null;
    } catch (error) {
      console.error('[EventIngestion] Error validating user reference:', error);
      return true; // Fail open
    }
  }

  /**
   * Validate props_json structure based on event_type
   */
  private validateEventProps(
    eventType: string,
    props?: Record<string, any>
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!props) return errors;

    // Define required props for specific event types
    const eventPropsMap: Record<string, string[]> = {
      [EVENT_TYPES.ASSET_VIEWED]: ['view_duration_ms'],
      [EVENT_TYPES.LICENSE_SIGNED]: ['license_id'],
      [EVENT_TYPES.PAYOUT_COMPLETED]: ['amount_cents', 'payment_method'],
      [EVENT_TYPES.POST_VIEWED]: ['post_id'],
      [EVENT_TYPES.POST_CTA_CLICKED]: ['cta_type', 'cta_url'],
    };

    const requiredProps = eventPropsMap[eventType];
    if (requiredProps) {
      for (const prop of requiredProps) {
        if (!(prop in props)) {
          errors.push({
            field: `props.${prop}`,
            message: `Required property '${prop}' missing for event type '${eventType}'`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Generate event fingerprint for deduplication
   */
  private generateFingerprint(
    input: TrackEventInput,
    context: RequestContext
  ): string {
    const components = [
      input.eventType,
      context.session?.userId || 'anonymous',
      input.entityId || '',
      input.sessionId || '',
      // Round timestamp to nearest second for deduplication
      Math.floor(Date.now() / 1000).toString(),
    ];

    return createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Check if event fingerprint exists (is duplicate)
   * With circuit breaker and timeout protection
   */
  private async checkDuplicate(fingerprint: string): Promise<boolean> {
    // Check circuit breaker
    if (this.redisCircuitOpen) {
      const now = Date.now();
      if (now - this.lastRedisFailure > this.REDIS_CIRCUIT_RESET_MS) {
        // Reset circuit breaker after timeout
        this.redisCircuitOpen = false;
        this.redisFailureCount = 0;
      } else {
        // Circuit is open, skip deduplication check
        return false;
      }
    }

    try {
      // Add timeout wrapper to prevent hanging
      const result = await Promise.race([
        this.redis.exists(`event:fingerprint:${fingerprint}`),
        new Promise<number>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 2000)
        )
      ]);
      
      // Reset failure count on success
      this.redisFailureCount = 0;
      return result === 1;
    } catch (error) {
      // Track failure for circuit breaker
      this.redisFailureCount++;
      this.lastRedisFailure = Date.now();
      
      if (this.redisFailureCount >= this.REDIS_CIRCUIT_THRESHOLD) {
        this.redisCircuitOpen = true;
        console.warn('[EventIngestion] Redis circuit breaker opened after multiple failures');
      } else {
        // Only log every 5th error to reduce noise
        if (this.redisFailureCount % 5 === 0) {
          console.error('[EventIngestion] Redis deduplication check failed:', 
            error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      return false; // Fail open - allow event through
    }
  }

  /**
   * Store fingerprint in Redis (async, non-blocking)
   * With timeout protection
   */
  private async storeFingerprintAsync(fingerprint: string): Promise<void> {
    // Skip if circuit breaker is open
    if (this.redisCircuitOpen) {
      return;
    }

    try {
      // Add timeout wrapper
      await Promise.race([
        this.redis.setex(
          `event:fingerprint:${fingerprint}`,
          this.config.deduplicationTtlSeconds,
          '1'
        ),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 2000)
        )
      ]);
      
      // Reset failure count on success
      this.redisFailureCount = 0;
    } catch (error) {
      // Track failure but don't log excessively
      this.redisFailureCount++;
      this.lastRedisFailure = Date.now();
      
      if (this.redisFailureCount >= this.REDIS_CIRCUIT_THRESHOLD) {
        this.redisCircuitOpen = true;
      }
      // Silently fail - fingerprint storage is not critical
    }
  }

  /**
   * Check idempotency key
   * With timeout protection
   */
  private async checkIdempotency(key: string): Promise<EventCreated | null> {
    // Skip if circuit breaker is open
    if (this.redisCircuitOpen) {
      return null;
    }

    try {
      const cached = await Promise.race([
        this.redis.get(`event:idempotency:${key}`),
        new Promise<string | null>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 2000)
        )
      ]);
      
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      this.redisFailureCount++;
      this.lastRedisFailure = Date.now();
      
      if (this.redisFailureCount >= this.REDIS_CIRCUIT_THRESHOLD) {
        this.redisCircuitOpen = true;
      }
      return null;
    }
  }

  /**
   * Store idempotency result
   * With timeout protection
   */
  private async storeIdempotency(
    key: string,
    result: EventCreated
  ): Promise<void> {
    // Skip if circuit breaker is open
    if (this.redisCircuitOpen) {
      return;
    }

    try {
      await Promise.race([
        this.redis.setex(
          `event:idempotency:${key}`,
          3600, // 1 hour
          JSON.stringify(result)
        ),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 2000)
        )
      ]);
      
      this.redisFailureCount = 0;
    } catch (error) {
      this.redisFailureCount++;
      this.lastRedisFailure = Date.now();
      
      if (this.redisFailureCount >= this.REDIS_CIRCUIT_THRESHOLD) {
        this.redisCircuitOpen = true;
      }
      // Silently fail
    }
  }

  /**
   * Prepare event for batch insertion
   */
  private prepareEventForBatch(
    input: TrackEventInput,
    context: RequestContext
  ): BatchedEvent {
    const actorId = context.session?.userId || null;
    const actorType = context.session?.role || null;

    // Map entityType to foreign key fields
    const entityRefs = this.mapEntityToRefs(input.entityId, input.entityType);

    // Merge context data into props
    const enrichedProps = {
      ...(input.props || {}),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    };

    return {
      occurredAt: new Date(),
      source: input.source,
      eventType: input.eventType,
      actorType,
      actorId,
      sessionId: input.sessionId || null,
      propsJson: enrichedProps,
      projectId: entityRefs.projectId || null,
      ipAssetId: entityRefs.ipAssetId || null,
      licenseId: entityRefs.licenseId || null,
      postId: entityRefs.postId || null,
      userId: entityRefs.userId || null,
      brandId: entityRefs.brandId || null,
      creatorId: entityRefs.creatorId || null,
    };
  }

  /**
   * Map entityType to Prisma foreign key fields
   */
  private mapEntityToRefs(entityId?: string, entityType?: string): Partial<BatchedEvent> {
    if (!entityId || !entityType) return {};

    const refs: Partial<BatchedEvent> = {
      projectId: null,
      ipAssetId: null,
      licenseId: null,
      postId: null,
      userId: null,
      brandId: null,
      creatorId: null,
    };

    switch (entityType) {
      case 'project':
        refs.projectId = entityId;
        break;
      case 'asset':
        refs.ipAssetId = entityId;
        break;
      case 'license':
        refs.licenseId = entityId;
        break;
      case 'post':
        refs.postId = entityId;
        break;
      case 'user':
        refs.userId = entityId;
        break;
      case 'brand':
        refs.brandId = entityId;
        break;
      case 'creator':
        refs.creatorId = entityId;
        break;
    }

    return refs;
  }

  /**
   * Flush event batch to database
   */
  private async flushBatch(): Promise<void> {
    if (this.isProcessing || this.eventBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Take current buffer and clear it
    const eventsToProcess = [...this.eventBuffer];
    this.eventBuffer = [];

    console.log(`[EventIngestion] Flushing batch of ${eventsToProcess.length} events`);

    try {
      // Batch insert events
      const createdEvents = await this.prisma.event.createManyAndReturn({
        data: eventsToProcess,
      });

      console.log(`[EventIngestion] Successfully wrote ${createdEvents.length} events to database`);

      // Queue enrichment jobs if enabled
      if (this.config.enableEnrichment) {
        await this.queueEnrichmentJobs(createdEvents);
      }
    } catch (error) {
      console.error('[EventIngestion] Error flushing batch:', error);

      // Retry logic: put events back in buffer for next attempt
      if (!this.shutdownRequested) {
        console.log('[EventIngestion] Re-queueing failed batch for retry');
        this.eventBuffer.unshift(...eventsToProcess);
      } else {
        // On shutdown, log lost events
        console.error(`[EventIngestion] Lost ${eventsToProcess.length} events during shutdown`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Queue enrichment jobs for newly created events
   */
  private async queueEnrichmentJobs(events: any[]): Promise<void> {
    try {
      const jobs = events.map((event) => ({
        name: 'enrichEvent',
        data: { eventId: event.id },
      }));

      await this.enrichmentQueue.addBulk(jobs);
      console.log(`[EventIngestion] Queued ${jobs.length} enrichment jobs`);
    } catch (error) {
      console.error('[EventIngestion] Error queueing enrichment jobs:', error);
    }
  }

  /**
   * Start batch timer
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      if (this.eventBuffer.length > 0 && !this.isProcessing) {
        console.log('[EventIngestion] Batch timeout reached, flushing buffer');
        this.flushBatch();
      }
    }, this.config.batchTimeoutMs);
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      this.shutdownRequested = true;
      console.log('[EventIngestion] Shutdown signal received, flushing remaining events...');

      // Clear timer
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = null;
      }

      // Flush remaining events
      if (this.eventBuffer.length > 0) {
        await this.flushBatch();
      }

      console.log('[EventIngestion] Graceful shutdown complete');
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  /**
   * Get current buffer stats (for monitoring)
   */
  getStats() {
    return {
      bufferSize: this.eventBuffer.length,
      isProcessing: this.isProcessing,
      config: this.config,
      circuitBreaker: {
        open: this.redisCircuitOpen,
        failureCount: this.redisFailureCount,
        lastFailure: this.lastRedisFailure ? new Date(this.lastRedisFailure).toISOString() : null,
      },
    };
  }
}
