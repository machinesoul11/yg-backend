/**
 * Audit Log Background Job
 * 
 * Handles asynchronous audit log creation for non-critical events.
 * Critical events (auth failures, financial transactions, etc.) should still use
 * synchronous logging, but view events, search events, etc. can be async.
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);

// Queue configuration
const AUDIT_LOG_QUEUE_NAME = 'audit-log-async';

export interface AuditLogJobData {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  permission?: string;
  resourceType?: string;
  resourceId?: string;
  before?: any;
  after?: any;
  metadata?: any;
  priority?: number; // 1-10, higher = more important
}

/**
 * Get or create audit log queue
 */
export function getAuditLogQueue(): Queue<AuditLogJobData> {
  return new Queue<AuditLogJobData>(AUDIT_LOG_QUEUE_NAME, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 3, // Retry failed audit logs up to 3 times
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 second delay
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        count: 5000, // Keep last 5000 failed jobs for analysis
      },
    },
  });
}

/**
 * Create audit log worker
 */
export function createAuditLogWorker(): Worker<AuditLogJobData> {
  const worker = new Worker<AuditLogJobData>(
    AUDIT_LOG_QUEUE_NAME,
    async (job: Job<AuditLogJobData>) => {
      const data = job.data;
      
      // Log using the audit service
      await auditService.log({
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        userId: data.userId,
        email: data.email,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        sessionId: data.sessionId,
        requestId: data.requestId,
        permission: data.permission,
        resourceType: data.resourceType as any,
        resourceId: data.resourceId,
        before: data.before,
        after: data.after,
        metadata: data.metadata,
      });
      
      return { success: true, auditId: job.id };
    },
    {
      connection: getBullMQRedisClient(),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY_AUDIT_LOG || '10'),
      limiter: {
        max: 100, // Process max 100 jobs
        duration: 1000, // Per second
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AuditLogWorker] Completed audit log job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AuditLogWorker] Failed audit log job ${job?.id}:`, err);
  });

  worker.on('error', (err) => {
    console.error('[AuditLogWorker] Worker error:', err);
  });

  return worker;
}

/**
 * Queue an audit log entry for asynchronous processing
 * Use this for non-critical events like views, searches, pagination, etc.
 */
export async function queueAuditLog(data: AuditLogJobData): Promise<void> {
  try {
    const queue = getAuditLogQueue();
    const priority = data.priority || 5; // Default to normal priority

    await queue.add('audit-log', data, {
      priority,
      attempts: 3,
    });
  } catch (error) {
    console.error('[AuditLog] Failed to queue audit log:', error);
    // Fallback to synchronous logging if queue fails
    await auditService.log({
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      userId: data.userId,
      email: data.email,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      sessionId: data.sessionId,
      requestId: data.requestId,
      permission: data.permission,
      resourceType: data.resourceType as any,
      resourceId: data.resourceId,
      before: data.before,
      after: data.after,
      metadata: data.metadata,
    });
  }
}

/**
 * Batch queue multiple audit logs at once
 * More efficient than individual queueing
 */
export async function queueAuditLogBatch(logs: AuditLogJobData[]): Promise<void> {
  if (logs.length === 0) return;

  try {
    const queue = getAuditLogQueue();
    const jobs = logs.map((data, index) => ({
      name: `audit-log-batch-${index}`,
      data,
      opts: {
        priority: data.priority || 5,
        attempts: 3,
      },
    }));

    await queue.addBulk(jobs);
  } catch (error) {
    console.error('[AuditLog] Failed to batch queue audit logs:', error);
    // Fallback to synchronous logging
    for (const data of logs) {
      await auditService.log({
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        userId: data.userId,
        email: data.email,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        sessionId: data.sessionId,
        requestId: data.requestId,
        permission: data.permission,
        resourceType: data.resourceType as any,
        resourceId: data.resourceId,
        before: data.before,
        after: data.after,
        metadata: data.metadata,
      });
    }
  }
}

// Singleton worker instance
let auditLogWorker: Worker<AuditLogJobData> | null = null;

/**
 * Initialize the audit log worker
 */
export function initializeAuditLogWorker(): void {
  if (auditLogWorker) {
    console.log('[AuditLogWorker] Worker already initialized');
    return;
  }

  console.log('[AuditLogWorker] Initializing audit log background worker...');
  auditLogWorker = createAuditLogWorker();
  console.log('[AuditLogWorker] ✓ Audit log worker initialized');
}

/**
 * Shutdown the audit log worker gracefully
 */
export async function shutdownAuditLogWorker(): Promise<void> {
  if (!auditLogWorker) {
    return;
  }

  console.log('[AuditLogWorker] Shutting down audit log worker...');
  await auditLogWorker.close();
  auditLogWorker = null;
  console.log('[AuditLogWorker] ✓ Audit log worker shut down');
}

/**
 * Get queue metrics
 */
export async function getAuditLogQueueMetrics() {
  const queue = getAuditLogQueue();
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}
