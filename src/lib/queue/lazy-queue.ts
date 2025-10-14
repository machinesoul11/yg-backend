/**
 * Lazy Queue Wrapper for Serverless Environments
 * 
 * BullMQ queues try to connect to Redis immediately when created.
 * In serverless environments (Vercel), this causes connection errors
 * because queues are created on module import, even if never used.
 * 
 * This wrapper creates queues only when first accessed.
 */

import { Queue, Worker, type QueueOptions, type WorkerOptions, type Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';

/**
 * Create a lazy-loading queue that only connects when first used
 */
export function createLazyQueue<T = any>(
  name: string,
  options?: Omit<QueueOptions, 'connection'>
): Queue<T> {
  let queue: Queue<T> | null = null;

  return new Proxy({} as Queue<T>, {
    get(target, prop) {
      if (!queue) {
        queue = new Queue<T>(name, {
          ...options,
          connection: redisConnection,
        });
      }
      return (queue as any)[prop];
    },
  });
}

/**
 * Create a lazy-loading worker that only connects when first used
 */
export function createLazyWorker<T = any>(
  name: string,
  processor: (job: Job<T>) => Promise<any>,
  options?: Omit<WorkerOptions, 'connection'>
): Worker<T> {
  let worker: Worker<T> | null = null;

  return new Proxy({} as Worker<T>, {
    get(target, prop) {
      if (!worker) {
        worker = new Worker<T>(name, processor, {
          ...options,
          connection: redisConnection,
        });
      }
      return (worker as any)[prop];
    },
  });
}

/**
 * Check if we're in a serverless environment
 * In serverless, we should avoid creating workers
 */
export function isServerlessEnvironment(): boolean {
  return process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

/**
 * Conditionally create a worker only in non-serverless environments
 */
export function createWorkerIfNotServerless<T = any>(
  name: string,
  processor: (job: Job<T>) => Promise<any>,
  options?: Omit<WorkerOptions, 'connection'>
): Worker<T> | null {
  if (isServerlessEnvironment()) {
    console.log(`[LazyQueue] Skipping worker creation for "${name}" in serverless environment`);
    return null;
  }

  return new Worker<T>(name, processor, {
    ...options,
    connection: redisConnection,
  });
}
