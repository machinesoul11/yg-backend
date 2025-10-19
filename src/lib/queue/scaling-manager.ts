/**
 * Queue Scaling Manager
 * 
 * Implements horizontal scaling strategies for background job workers
 * with auto-scaling based on queue metrics and resource utilization.
 */

import { Queue, QueueEvents } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { SCALING_CONFIG, QUEUE_PRIORITIES, JobPriority } from './config';
import { memoryMonitor } from './memory-monitor';

export interface ScalingMetrics {
  queueName: string;
  queueDepth: number;
  queueLatencyMs: number;
  activeJobs: number;
  completedRate: number; // jobs per minute
  errorRate: number; // percentage
  currentWorkers: number;
  cpuUsage?: number;
  memoryUsage?: number;
  timestamp: Date;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  targetWorkers: number;
  currentWorkers: number;
  reason: string;
  metrics: ScalingMetrics;
}

export interface ScalingPolicy {
  queueName: string;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: {
    queueDepth?: number;
    queueLatencyMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
  };
  scaleDownThreshold: {
    queueDepth?: number;
    queueLatencyMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
  };
  cooldownSeconds: {
    scaleUp: number;
    scaleDown: number;
  };
}

export class QueueScalingManager {
  private redis = getBullMQRedisClient();
  private scalingPolicies = new Map<string, ScalingPolicy>();
  private lastScalingAction = new Map<string, Date>();
  private scalingHistory = new Map<string, ScalingDecision[]>();
  private metricsInterval: NodeJS.Timeout | null = null;
  
  /**
   * Register a queue for auto-scaling
   */
  registerQueue(queueName: string, policy?: Partial<ScalingPolicy>): void {
    const priority = QUEUE_PRIORITIES[queueName as keyof typeof QUEUE_PRIORITIES] || JobPriority.NORMAL;
    
    // Determine default min/max based on priority
    let defaultMin = SCALING_CONFIG.MIN_WORKERS;
    let defaultMax = SCALING_CONFIG.MAX_WORKERS;
    
    if (priority === JobPriority.CRITICAL) {
      defaultMin = SCALING_CONFIG.CRITICAL_MIN_WORKERS;
      defaultMax = SCALING_CONFIG.CRITICAL_MAX_WORKERS;
    } else if (priority === JobPriority.BACKGROUND) {
      defaultMin = SCALING_CONFIG.BACKGROUND_MIN_WORKERS;
      defaultMax = SCALING_CONFIG.BACKGROUND_MAX_WORKERS;
    }
    
    const scalingPolicy: ScalingPolicy = {
      queueName,
      minWorkers: policy?.minWorkers || defaultMin,
      maxWorkers: policy?.maxWorkers || defaultMax,
      scaleUpThreshold: {
        queueDepth: policy?.scaleUpThreshold?.queueDepth || SCALING_CONFIG.SCALE_UP_QUEUE_DEPTH,
        queueLatencyMs: policy?.scaleUpThreshold?.queueLatencyMs || SCALING_CONFIG.SCALE_UP_QUEUE_LATENCY_MS,
        cpuPercent: policy?.scaleUpThreshold?.cpuPercent || SCALING_CONFIG.SCALE_UP_CPU_THRESHOLD,
        memoryPercent: policy?.scaleUpThreshold?.memoryPercent || SCALING_CONFIG.SCALE_UP_MEMORY_THRESHOLD,
      },
      scaleDownThreshold: {
        queueDepth: policy?.scaleDownThreshold?.queueDepth || SCALING_CONFIG.SCALE_DOWN_QUEUE_DEPTH,
        queueLatencyMs: policy?.scaleDownThreshold?.queueLatencyMs || SCALING_CONFIG.SCALE_DOWN_QUEUE_LATENCY_MS,
        cpuPercent: policy?.scaleDownThreshold?.cpuPercent || SCALING_CONFIG.SCALE_DOWN_CPU_THRESHOLD,
        memoryPercent: policy?.scaleDownThreshold?.memoryPercent || SCALING_CONFIG.SCALE_DOWN_MEMORY_THRESHOLD,
      },
      cooldownSeconds: {
        scaleUp: policy?.cooldownSeconds?.scaleUp || SCALING_CONFIG.SCALE_UP_COOLDOWN_SECONDS,
        scaleDown: policy?.cooldownSeconds?.scaleDown || SCALING_CONFIG.SCALE_DOWN_COOLDOWN_SECONDS,
      },
    };
    
    this.scalingPolicies.set(queueName, scalingPolicy);
    console.log(`[ScalingManager] Registered queue: ${queueName} (min: ${scalingPolicy.minWorkers}, max: ${scalingPolicy.maxWorkers})`);
  }
  
  /**
   * Collect current metrics for a queue
   */
  async collectMetrics(queueName: string): Promise<ScalingMetrics> {
    const queue = new Queue(queueName, { connection: this.redis });
    
    try {
      const [waiting, active, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
      ]);
      
      const queueDepth = waiting + delayed;
      
      // Get oldest waiting job to calculate latency
      const oldestWaiting = await queue.getJobs(['waiting'], 0, 0, true);
      const queueLatencyMs = oldestWaiting.length > 0
        ? Date.now() - oldestWaiting[0].timestamp
        : 0;
      
      // Calculate completed rate (last minute)
      const completedCount = await this.getCompletedCountLastMinute(queueName);
      
      // Calculate error rate (last hour)
      const errorRate = await this.getErrorRateLastHour(queueName);
      
      // Get memory stats
      const memoryStats = memoryMonitor.getCurrentMemoryStats();
      
      return {
        queueName,
        queueDepth,
        queueLatencyMs,
        activeJobs: active,
        completedRate: completedCount,
        errorRate,
        currentWorkers: 1, // This should be updated by orchestration system
        memoryUsage: memoryStats.percentage,
        timestamp: new Date(),
      };
    } finally {
      await queue.close();
    }
  }
  
  /**
   * Make scaling decision based on metrics
   */
  async makeScalingDecision(queueName: string): Promise<ScalingDecision> {
    const policy = this.scalingPolicies.get(queueName);
    if (!policy) {
      throw new Error(`No scaling policy found for queue: ${queueName}`);
    }
    
    const metrics = await this.collectMetrics(queueName);
    const currentWorkers = metrics.currentWorkers;
    
    // Check cooldown period
    const lastAction = this.lastScalingAction.get(queueName);
    if (lastAction) {
      const secondsSinceLastAction = (Date.now() - lastAction.getTime()) / 1000;
      const cooldown = Math.max(
        policy.cooldownSeconds.scaleUp,
        policy.cooldownSeconds.scaleDown
      );
      
      if (secondsSinceLastAction < cooldown) {
        return {
          action: 'maintain',
          targetWorkers: currentWorkers,
          currentWorkers,
          reason: `In cooldown period (${Math.ceil(cooldown - secondsSinceLastAction)}s remaining)`,
          metrics,
        };
      }
    }
    
    // Check scale-up conditions
    const shouldScaleUp =
      (metrics.queueDepth >= (policy.scaleUpThreshold.queueDepth || Infinity)) ||
      (metrics.queueLatencyMs >= (policy.scaleUpThreshold.queueLatencyMs || Infinity)) ||
      ((metrics.memoryUsage || 0) >= (policy.scaleUpThreshold.memoryPercent || Infinity));
    
    if (shouldScaleUp && currentWorkers < policy.maxWorkers) {
      const reasons: string[] = [];
      if (metrics.queueDepth >= (policy.scaleUpThreshold.queueDepth || Infinity)) {
        reasons.push(`Queue depth: ${metrics.queueDepth} >= ${policy.scaleUpThreshold.queueDepth}`);
      }
      if (metrics.queueLatencyMs >= (policy.scaleUpThreshold.queueLatencyMs || Infinity)) {
        reasons.push(`Queue latency: ${metrics.queueLatencyMs}ms >= ${policy.scaleUpThreshold.queueLatencyMs}ms`);
      }
      if ((metrics.memoryUsage || 0) >= (policy.scaleUpThreshold.memoryPercent || Infinity)) {
        reasons.push(`Memory usage: ${metrics.memoryUsage}% >= ${policy.scaleUpThreshold.memoryPercent}%`);
      }
      
      // Calculate target workers (add 1-3 based on severity)
      const severity = metrics.queueDepth / (policy.scaleUpThreshold.queueDepth || 1);
      const increment = Math.min(3, Math.ceil(severity));
      const targetWorkers = Math.min(currentWorkers + increment, policy.maxWorkers);
      
      const decision: ScalingDecision = {
        action: 'scale_up',
        targetWorkers,
        currentWorkers,
        reason: reasons.join('; '),
        metrics,
      };
      
      this.recordDecision(queueName, decision);
      return decision;
    }
    
    // Check scale-down conditions
    const shouldScaleDown =
      metrics.queueDepth <= (policy.scaleDownThreshold.queueDepth || 0) &&
      metrics.queueLatencyMs <= (policy.scaleDownThreshold.queueLatencyMs || 0) &&
      (metrics.memoryUsage || 0) <= (policy.scaleDownThreshold.memoryPercent || 0);
    
    if (shouldScaleDown && currentWorkers > policy.minWorkers) {
      const targetWorkers = Math.max(currentWorkers - 1, policy.minWorkers);
      
      const decision: ScalingDecision = {
        action: 'scale_down',
        targetWorkers,
        currentWorkers,
        reason: `Low load: depth=${metrics.queueDepth}, latency=${metrics.queueLatencyMs}ms`,
        metrics,
      };
      
      this.recordDecision(queueName, decision);
      return decision;
    }
    
    // Maintain current scale
    return {
      action: 'maintain',
      targetWorkers: currentWorkers,
      currentWorkers,
      reason: 'Within optimal range',
      metrics,
    };
  }
  
  /**
   * Record scaling decision
   */
  private recordDecision(queueName: string, decision: ScalingDecision): void {
    if (decision.action !== 'maintain') {
      this.lastScalingAction.set(queueName, new Date());
    }
    
    if (!this.scalingHistory.has(queueName)) {
      this.scalingHistory.set(queueName, []);
    }
    
    const history = this.scalingHistory.get(queueName)!;
    history.push(decision);
    
    // Keep only last 100 decisions
    if (history.length > 100) {
      history.shift();
    }
    
    console.log(
      `[ScalingManager] ${queueName}: ${decision.action} ${decision.currentWorkers} -> ${decision.targetWorkers} (${decision.reason})`
    );
  }
  
  /**
   * Get scaling history for a queue
   */
  getScalingHistory(queueName: string, limit: number = 20): ScalingDecision[] {
    const history = this.scalingHistory.get(queueName) || [];
    return history.slice(-limit);
  }
  
  /**
   * Get all registered queues
   */
  getRegisteredQueues(): string[] {
    return Array.from(this.scalingPolicies.keys());
  }
  
  /**
   * Get scaling policy for a queue
   */
  getScalingPolicy(queueName: string): ScalingPolicy | undefined {
    return this.scalingPolicies.get(queueName);
  }
  
  /**
   * Update scaling policy for a queue
   */
  updateScalingPolicy(queueName: string, updates: Partial<ScalingPolicy>): void {
    const existing = this.scalingPolicies.get(queueName);
    if (!existing) {
      throw new Error(`Queue not registered: ${queueName}`);
    }
    
    this.scalingPolicies.set(queueName, {
      ...existing,
      ...updates,
    });
    
    console.log(`[ScalingManager] Updated policy for ${queueName}`);
  }
  
  /**
   * Get completed count in last minute
   */
  private async getCompletedCountLastMinute(queueName: string): Promise<number> {
    const key = `queue:${queueName}:completed:minute`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }
  
  /**
   * Get error rate in last hour
   */
  private async getErrorRateLastHour(queueName: string): Promise<number> {
    const completedKey = `queue:${queueName}:completed:hour`;
    const failedKey = `queue:${queueName}:failed:hour`;
    
    const [completed, failed] = await Promise.all([
      this.redis.get(completedKey),
      this.redis.get(failedKey),
    ]);
    
    const completedCount = completed ? parseInt(completed, 10) : 0;
    const failedCount = failed ? parseInt(failed, 10) : 0;
    const total = completedCount + failedCount;
    
    return total > 0 ? (failedCount / total) * 100 : 0;
  }
  
  /**
   * Start automatic scaling monitoring
   */
  startAutoScaling(intervalMs: number = 30000): void {
    if (this.metricsInterval) {
      console.warn('[ScalingManager] Auto-scaling already running');
      return;
    }
    
    console.log(`[ScalingManager] Starting auto-scaling (interval: ${intervalMs}ms)`);
    
    this.metricsInterval = setInterval(async () => {
      for (const queueName of this.scalingPolicies.keys()) {
        try {
          const decision = await this.makeScalingDecision(queueName);
          
          if (decision.action !== 'maintain') {
            console.log(
              `[ScalingManager] ${queueName}: Recommended ${decision.action} to ${decision.targetWorkers} workers`
            );
            // In production, this would trigger actual scaling via K8s, ECS, etc.
          }
        } catch (error) {
          console.error(`[ScalingManager] Error making scaling decision for ${queueName}:`, error);
        }
      }
    }, intervalMs);
  }
  
  /**
   * Stop automatic scaling monitoring
   */
  stopAutoScaling(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      console.log('[ScalingManager] Stopped auto-scaling');
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopAutoScaling();
    this.scalingPolicies.clear();
    this.lastScalingAction.clear();
    this.scalingHistory.clear();
  }
}

// Singleton instance
export const scalingManager = new QueueScalingManager();

/**
 * Initialize scaling for all known queues
 */
export function initializeScaling(): void {
  const queues = Object.keys(QUEUE_PRIORITIES);
  
  for (const queueName of queues) {
    scalingManager.registerQueue(queueName);
  }
  
  console.log(`[ScalingManager] Initialized scaling for ${queues.length} queues`);
}
