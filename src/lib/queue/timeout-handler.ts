/**
 * Job Timeout Handler
 * 
 * Comprehensive timeout management for background jobs with soft/hard timeouts,
 * adaptive timeout strategies, and timeout-aware retry logic.
 */

import { Job } from 'bullmq';
import { JOB_TIMEOUTS } from './config';

export interface TimeoutConfig {
  jobName: string;
  hardTimeout: number; // Maximum execution time (ms)
  softTimeout?: number; // Warning threshold (ms)
  onSoftTimeout?: (elapsedMs: number) => void;
  onHardTimeout?: () => void;
}

export interface TimeoutResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  timedOut: boolean;
  executionTime: number;
  exceededSoftTimeout: boolean;
}

export class JobTimeoutHandler {
  private activeTimeouts = new Map<string, NodeJS.Timeout>();
  private executionHistory = new Map<string, number[]>();
  
  /**
   * Execute a job with timeout handling
   */
  async executeWithTimeout<T>(
    config: TimeoutConfig,
    executor: () => Promise<T>
  ): Promise<TimeoutResult<T>> {
    const startTime = Date.now();
    const timeoutId = `${config.jobName}-${Date.now()}`;
    
    let softTimeoutReached = false;
    let hardTimeoutReached = false;
    
    // Calculate soft timeout (default to 80% of hard timeout)
    const softTimeout = config.softTimeout || Math.floor(config.hardTimeout * 0.8);
    
    // Set up soft timeout warning
    const softTimeoutHandle = setTimeout(() => {
      softTimeoutReached = true;
      const elapsed = Date.now() - startTime;
      console.warn(
        `[TimeoutHandler] Soft timeout reached for ${config.jobName}: ${elapsed}ms / ${config.hardTimeout}ms`
      );
      if (config.onSoftTimeout) {
        config.onSoftTimeout(elapsed);
      }
    }, softTimeout);
    
    // Set up hard timeout
    const hardTimeoutPromise = new Promise<never>((_, reject) => {
      const handle = setTimeout(() => {
        hardTimeoutReached = true;
        if (config.onHardTimeout) {
          config.onHardTimeout();
        }
        reject(new Error(`Job ${config.jobName} exceeded hard timeout of ${config.hardTimeout}ms`));
      }, config.hardTimeout);
      
      this.activeTimeouts.set(timeoutId, handle);
    });
    
    try {
      // Race between job execution and timeout
      const result = await Promise.race([
        executor(),
        hardTimeoutPromise,
      ]);
      
      clearTimeout(softTimeoutHandle);
      const handle = this.activeTimeouts.get(timeoutId);
      if (handle) {
        clearTimeout(handle);
        this.activeTimeouts.delete(timeoutId);
      }
      
      const executionTime = Date.now() - startTime;
      this.recordExecutionTime(config.jobName, executionTime);
      
      return {
        success: true,
        result,
        timedOut: false,
        executionTime,
        exceededSoftTimeout: softTimeoutReached,
      };
    } catch (error) {
      clearTimeout(softTimeoutHandle);
      const handle = this.activeTimeouts.get(timeoutId);
      if (handle) {
        clearTimeout(handle);
        this.activeTimeouts.delete(timeoutId);
      }
      
      const executionTime = Date.now() - startTime;
      this.recordExecutionTime(config.jobName, executionTime);
      
      return {
        success: false,
        error: error as Error,
        timedOut: hardTimeoutReached,
        executionTime,
        exceededSoftTimeout: softTimeoutReached,
      };
    }
  }
  
  /**
   * Get timeout configuration for a job type
   */
  getTimeoutConfig(jobType: string): number {
    const timeoutMap: Record<string, number> = {
      'notification-delivery': JOB_TIMEOUTS.NOTIFICATION_DELIVERY,
      'password-reset': JOB_TIMEOUTS.PASSWORD_RESET,
      'payment-processing': JOB_TIMEOUTS.PAYMENT_PROCESSING,
      'email-sending': JOB_TIMEOUTS.EMAIL_SENDING,
      'search-index-update': JOB_TIMEOUTS.SEARCH_INDEX_UPDATE,
      'asset-thumbnail': JOB_TIMEOUTS.ASSET_THUMBNAIL,
      'tax-document-generation': JOB_TIMEOUTS.TAX_DOCUMENT_GENERATION,
      'asset-preview-generation': JOB_TIMEOUTS.ASSET_PREVIEW_GENERATION,
      'pdf-generation': JOB_TIMEOUTS.PDF_GENERATION,
      'email-campaign': JOB_TIMEOUTS.EMAIL_CAMPAIGN,
      'bulk-search-index': JOB_TIMEOUTS.BULK_SEARCH_INDEX,
      'full-reindex': JOB_TIMEOUTS.FULL_REINDEX,
      'metrics-aggregation': JOB_TIMEOUTS.METRICS_AGGREGATION,
      'analytics-rollup': JOB_TIMEOUTS.ANALYTICS_ROLLUP,
    };
    
    return timeoutMap[jobType] || 120000; // Default 2 minutes
  }
  
  /**
   * Record execution time for adaptive timeout calculations
   */
  private recordExecutionTime(jobName: string, executionTime: number): void {
    if (!this.executionHistory.has(jobName)) {
      this.executionHistory.set(jobName, []);
    }
    
    const history = this.executionHistory.get(jobName)!;
    history.push(executionTime);
    
    // Keep only last 100 executions
    if (history.length > 100) {
      history.shift();
    }
  }
  
  /**
   * Get adaptive timeout based on execution history
   */
  getAdaptiveTimeout(jobName: string, baseTimeout: number): number {
    const history = this.executionHistory.get(jobName);
    if (!history || history.length < 10) {
      return baseTimeout;
    }
    
    // Calculate P95 execution time
    const sorted = [...history].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Time = sorted[p95Index];
    
    // Set timeout to P95 + 50% buffer
    const adaptiveTimeout = Math.ceil(p95Time * 1.5);
    
    // Don't go below base timeout or above 2x base timeout
    return Math.max(baseTimeout, Math.min(adaptiveTimeout, baseTimeout * 2));
  }
  
  /**
   * Get execution statistics for a job type
   */
  getExecutionStats(jobName: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const history = this.executionHistory.get(jobName);
    if (!history || history.length === 0) {
      return null;
    }
    
    const sorted = [...history].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = Math.round(sorted.reduce((sum, t) => sum + t, 0) / count);
    const p50 = sorted[Math.floor(count * 0.5)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    
    return { count, min, max, avg, p50, p95, p99 };
  }
  
  /**
   * Cancel active timeouts (cleanup)
   */
  cancelAllTimeouts(): void {
    for (const [id, handle] of this.activeTimeouts) {
      clearTimeout(handle);
    }
    this.activeTimeouts.clear();
  }
  
  /**
   * Clear execution history
   */
  clearHistory(jobName?: string): void {
    if (jobName) {
      this.executionHistory.delete(jobName);
    } else {
      this.executionHistory.clear();
    }
  }
}

// Singleton instance
export const timeoutHandler = new JobTimeoutHandler();

/**
 * Wrapper for BullMQ job processor with timeout handling
 */
export function withTimeout<T>(
  jobName: string,
  processor: (job: Job) => Promise<T>,
  options?: {
    timeout?: number;
    adaptive?: boolean;
    onSoftTimeout?: (job: Job, elapsedMs: number) => void;
    onHardTimeout?: (job: Job) => void;
  }
): (job: Job) => Promise<T> {
  return async (job: Job) => {
    const baseTimeout = options?.timeout || timeoutHandler.getTimeoutConfig(jobName);
    const timeout = options?.adaptive
      ? timeoutHandler.getAdaptiveTimeout(jobName, baseTimeout)
      : baseTimeout;
    
    await job.log(`Starting with timeout: ${timeout}ms`);
    
    const result = await timeoutHandler.executeWithTimeout<T>(
      {
        jobName,
        hardTimeout: timeout,
        softTimeout: Math.floor(timeout * 0.8),
        onSoftTimeout: options?.onSoftTimeout
          ? (elapsed) => options.onSoftTimeout!(job, elapsed)
          : undefined,
        onHardTimeout: options?.onHardTimeout
          ? () => options.onHardTimeout!(job)
          : undefined,
      },
      () => processor(job)
    );
    
    if (result.timedOut) {
      await job.log(`Job timed out after ${result.executionTime}ms`);
      throw result.error || new Error('Job timed out');
    }
    
    if (result.exceededSoftTimeout) {
      await job.log(`Warning: Job exceeded soft timeout but completed in ${result.executionTime}ms`);
    }
    
    if (!result.success) {
      await job.log(`Job failed after ${result.executionTime}ms`);
      throw result.error || new Error('Job failed');
    }
    
    await job.log(`Completed in ${result.executionTime}ms`);
    return result.result!;
  };
}

/**
 * Timeout-aware retry logic
 */
export function getRetryDelayForTimeout(
  attemptNumber: number,
  wasTimeout: boolean,
  baseDelay: number = 5000
): number {
  if (wasTimeout) {
    // For timeouts, use longer backoff since the job might need more time
    return baseDelay * Math.pow(3, attemptNumber - 1);
  }
  
  // For other errors, use standard exponential backoff
  return baseDelay * Math.pow(2, attemptNumber - 1);
}

/**
 * Helper to check if an error was a timeout
 */
export function isTimeoutError(error: Error): boolean {
  return error.message.includes('timeout') || error.message.includes('timed out');
}

/**
 * Create timeout configuration for job options
 */
export function createTimeoutJobOptions(jobType: string) {
  const timeout = timeoutHandler.getTimeoutConfig(jobType);
  
  return {
    timeout,
    removeOnComplete: {
      age: 24 * 3600, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 days
      count: 5000,
    },
    attempts: 3,
    backoff: {
      type: 'custom' as const,
      delay: 5000,
    },
  };
}
