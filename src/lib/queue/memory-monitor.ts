/**
 * Job Memory Monitor
 * 
 * Monitors and manages memory usage for background job workers,
 * including automatic worker recycling and memory limit enforcement.
 */

import { Worker } from 'bullmq';
import { MEMORY_LIMITS } from './config';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  percentage: number;
  timestamp: Date;
}

export interface WorkerMemoryState {
  workerId: string;
  queueName: string;
  jobsProcessed: number;
  startTime: Date;
  lastMemoryCheck: MemoryStats;
  shouldRecycle: boolean;
  recycleReason?: string;
}

export class JobMemoryMonitor {
  private workerStates = new Map<string, WorkerMemoryState>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryCheckCallbacks: Array<(stats: MemoryStats) => void> = [];
  
  /**
   * Start monitoring a worker
   */
  startMonitoring(
    workerId: string,
    queueName: string,
    worker: Worker
  ): void {
    const state: WorkerMemoryState = {
      workerId,
      queueName,
      jobsProcessed: 0,
      startTime: new Date(),
      lastMemoryCheck: this.getCurrentMemoryStats(),
      shouldRecycle: false,
    };
    
    this.workerStates.set(workerId, state);
    
    // Track job completions
    worker.on('completed', () => {
      const workerState = this.workerStates.get(workerId);
      if (workerState) {
        workerState.jobsProcessed++;
        this.checkRecycleConditions(workerId);
      }
    });
    
    // Start periodic memory checks if not already running
    if (!this.monitoringInterval) {
      this.monitoringInterval = setInterval(() => {
        this.checkAllWorkers();
      }, 30000); // Check every 30 seconds
    }
  }
  
  /**
   * Stop monitoring a worker
   */
  stopMonitoring(workerId: string): void {
    this.workerStates.delete(workerId);
    
    // Stop monitoring interval if no workers
    if (this.workerStates.size === 0 && this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
  
  /**
   * Get current memory statistics
   */
  getCurrentMemoryStats(): MemoryStats {
    const usage = process.memoryUsage();
    const heapPercentage = (usage.heapUsed / usage.heapTotal) * 100;
    
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024), // MB
      percentage: Math.round(heapPercentage),
      timestamp: new Date(),
    };
  }
  
  /**
   * Check if current memory usage exceeds limits
   */
  checkMemoryLimits(): {
    withinLimits: boolean;
    exceedsWarning: boolean;
    exceedsCritical: boolean;
    stats: MemoryStats;
  } {
    const stats = this.getCurrentMemoryStats();
    const softLimitMB = MEMORY_LIMITS.WORKER_SOFT_LIMIT;
    const hardLimitMB = MEMORY_LIMITS.WORKER_HARD_LIMIT;
    
    const exceedsWarning = stats.heapUsed > softLimitMB;
    const exceedsCritical = stats.heapUsed > hardLimitMB;
    
    return {
      withinLimits: !exceedsCritical,
      exceedsWarning,
      exceedsCritical,
      stats,
    };
  }
  
  /**
   * Check if a worker should be recycled
   */
  private checkRecycleConditions(workerId: string): void {
    const state = this.workerStates.get(workerId);
    if (!state) return;
    
    const memoryCheck = this.checkMemoryLimits();
    state.lastMemoryCheck = memoryCheck.stats;
    
    // Check memory limits
    if (memoryCheck.exceedsCritical) {
      state.shouldRecycle = true;
      state.recycleReason = `Critical memory limit exceeded: ${memoryCheck.stats.heapUsed}MB > ${MEMORY_LIMITS.WORKER_HARD_LIMIT}MB`;
      console.warn(`[MemoryMonitor] ${state.recycleReason} for worker ${workerId}`);
      return;
    }
    
    if (memoryCheck.exceedsWarning) {
      console.warn(
        `[MemoryMonitor] Warning: Worker ${workerId} memory usage: ${memoryCheck.stats.heapUsed}MB > ${MEMORY_LIMITS.WORKER_SOFT_LIMIT}MB (soft limit)`
      );
    }
    
    // Check job count
    if (state.jobsProcessed >= MEMORY_LIMITS.RECYCLE_AFTER_JOBS) {
      state.shouldRecycle = true;
      state.recycleReason = `Processed ${state.jobsProcessed} jobs, exceeds limit of ${MEMORY_LIMITS.RECYCLE_AFTER_JOBS}`;
      console.log(`[MemoryMonitor] ${state.recycleReason} for worker ${workerId}`);
      return;
    }
    
    // Check runtime
    const uptimeHours = (Date.now() - state.startTime.getTime()) / 1000 / 60 / 60;
    if (uptimeHours >= MEMORY_LIMITS.RECYCLE_AFTER_HOURS) {
      state.shouldRecycle = true;
      state.recycleReason = `Uptime ${uptimeHours.toFixed(1)}h exceeds limit of ${MEMORY_LIMITS.RECYCLE_AFTER_HOURS}h`;
      console.log(`[MemoryMonitor] ${state.recycleReason} for worker ${workerId}`);
      return;
    }
  }
  
  /**
   * Check all monitored workers
   */
  private checkAllWorkers(): void {
    for (const workerId of this.workerStates.keys()) {
      this.checkRecycleConditions(workerId);
    }
    
    // Trigger callbacks with current memory stats
    const stats = this.getCurrentMemoryStats();
    for (const callback of this.memoryCheckCallbacks) {
      try {
        callback(stats);
      } catch (error) {
        console.error('[MemoryMonitor] Error in memory check callback:', error);
      }
    }
  }
  
  /**
   * Check if a specific worker should be recycled
   */
  shouldRecycleWorker(workerId: string): {
    shouldRecycle: boolean;
    reason?: string;
  } {
    const state = this.workerStates.get(workerId);
    if (!state) {
      return { shouldRecycle: false };
    }
    
    return {
      shouldRecycle: state.shouldRecycle,
      reason: state.recycleReason,
    };
  }
  
  /**
   * Get memory statistics for a worker
   */
  getWorkerStats(workerId: string): WorkerMemoryState | null {
    return this.workerStates.get(workerId) || null;
  }
  
  /**
   * Get memory statistics for all workers
   */
  getAllWorkerStats(): WorkerMemoryState[] {
    return Array.from(this.workerStates.values());
  }
  
  /**
   * Register a callback for memory checks
   */
  onMemoryCheck(callback: (stats: MemoryStats) => void): void {
    this.memoryCheckCallbacks.push(callback);
  }
  
  /**
   * Force garbage collection (if --expose-gc flag is set)
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      console.log('[MemoryMonitor] Running garbage collection...');
      const beforeStats = this.getCurrentMemoryStats();
      global.gc();
      const afterStats = this.getCurrentMemoryStats();
      const freed = beforeStats.heapUsed - afterStats.heapUsed;
      console.log(`[MemoryMonitor] GC freed ${freed}MB`);
      return true;
    } else {
      console.warn('[MemoryMonitor] GC not exposed. Start Node with --expose-gc flag to enable manual GC.');
      return false;
    }
  }
  
  /**
   * Get memory usage summary
   */
  getSummary(): {
    totalWorkers: number;
    totalJobsProcessed: number;
    averageMemoryUsage: number;
    workersNeedingRecycle: number;
    currentMemory: MemoryStats;
  } {
    const workers = Array.from(this.workerStates.values());
    const totalJobsProcessed = workers.reduce((sum, w) => sum + w.jobsProcessed, 0);
    const averageMemoryUsage = workers.length > 0
      ? Math.round(workers.reduce((sum, w) => sum + w.lastMemoryCheck.heapUsed, 0) / workers.length)
      : 0;
    const workersNeedingRecycle = workers.filter(w => w.shouldRecycle).length;
    
    return {
      totalWorkers: workers.length,
      totalJobsProcessed,
      averageMemoryUsage,
      workersNeedingRecycle,
      currentMemory: this.getCurrentMemoryStats(),
    };
  }
  
  /**
   * Clean up monitoring resources
   */
  cleanup(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.workerStates.clear();
    this.memoryCheckCallbacks = [];
  }
}

// Singleton instance
export const memoryMonitor = new JobMemoryMonitor();

/**
 * Helper to wrap worker creation with memory monitoring
 */
export function createMonitoredWorker<T = any>(
  queueName: string,
  worker: Worker<T>,
  options?: {
    workerId?: string;
    onRecycleNeeded?: (reason: string) => Promise<void>;
  }
): Worker<T> {
  const workerId = options?.workerId || `${queueName}-${Date.now()}`;
  
  // Start monitoring
  memoryMonitor.startMonitoring(workerId, queueName, worker);
  
  // Check for recycle needs after each job
  worker.on('completed', async () => {
    const recycleCheck = memoryMonitor.shouldRecycleWorker(workerId);
    if (recycleCheck.shouldRecycle && options?.onRecycleNeeded) {
      try {
        await options.onRecycleNeeded(recycleCheck.reason || 'Unknown reason');
      } catch (error) {
        console.error(`[MemoryMonitor] Error in recycle callback for ${workerId}:`, error);
      }
    }
  });
  
  // Stop monitoring on worker close
  worker.on('closed', () => {
    memoryMonitor.stopMonitoring(workerId);
  });
  
  return worker;
}

/**
 * Memory-aware job execution wrapper
 */
export async function executeWithMemoryCheck<T>(
  jobName: string,
  memoryLimitMB: number,
  executor: () => Promise<T>
): Promise<T> {
  const beforeStats = memoryMonitor.getCurrentMemoryStats();
  
  // Check if we have enough memory before starting
  if (beforeStats.heapUsed + memoryLimitMB > MEMORY_LIMITS.WORKER_HARD_LIMIT) {
    throw new Error(
      `Insufficient memory to execute ${jobName}. ` +
      `Current: ${beforeStats.heapUsed}MB, Required: ${memoryLimitMB}MB, ` +
      `Hard limit: ${MEMORY_LIMITS.WORKER_HARD_LIMIT}MB`
    );
  }
  
  try {
    const result = await executor();
    const afterStats = memoryMonitor.getCurrentMemoryStats();
    const memoryUsed = afterStats.heapUsed - beforeStats.heapUsed;
    
    if (memoryUsed > memoryLimitMB * 1.5) {
      console.warn(
        `[MemoryMonitor] Job ${jobName} used ${memoryUsed}MB, ` +
        `exceeds expected ${memoryLimitMB}MB by 50%`
      );
    }
    
    return result;
  } catch (error) {
    const afterStats = memoryMonitor.getCurrentMemoryStats();
    console.error(
      `[MemoryMonitor] Job ${jobName} failed. Memory: ${beforeStats.heapUsed}MB -> ${afterStats.heapUsed}MB`,
      error
    );
    throw error;
  }
}
