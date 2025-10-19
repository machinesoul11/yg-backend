/**
 * Queue Monitoring Service
 * 
 * Comprehensive monitoring and observability for background job processing system.
 * Collects metrics, tracks performance, and provides alerting capabilities.
 */

import { Queue, QueueEvents, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { MONITORING_CONFIG, QUEUE_PRIORITIES } from './config';
import { memoryMonitor } from './memory-monitor';
import { timeoutHandler } from './timeout-handler';

export interface QueueHealthStatus {
  queueName: string;
  healthy: boolean;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: QueueMetrics;
  timestamp: Date;
}

export interface QueueMetrics {
  queueName: string;
  // Queue depths
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  
  // Rates
  jobsPerMinute: number;
  errorRate: number; // percentage
  timeoutRate: number; // percentage
  
  // Timing
  avgProcessingTimeMs: number;
  p50ProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  p99ProcessingTimeMs: number;
  oldestWaitingMs: number;
  
  // Resources
  memoryUsageMB: number;
  memoryPercentage: number;
  
  timestamp: Date;
}

export interface Alert {
  id: string;
  severity: 'warning' | 'critical';
  queueName: string;
  type: 'queue_depth' | 'error_rate' | 'timeout_rate' | 'processing_time' | 'memory_usage';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
}

export class QueueMonitoringService {
  private redis = getBullMQRedisClient();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsHistory = new Map<string, QueueMetrics[]>();
  private activeAlerts = new Map<string, Alert>();
  private alertCallbacks: Array<(alert: Alert) => void> = [];
  
  /**
   * Start monitoring all queues
   */
  startMonitoring(intervalMs?: number): void {
    const interval = intervalMs || MONITORING_CONFIG.METRICS_COLLECTION_INTERVAL_MS;
    
    if (this.monitoringInterval) {
      console.warn('[QueueMonitor] Monitoring already started');
      return;
    }
    
    console.log(`[QueueMonitor] Starting monitoring (interval: ${interval}ms)`);
    
    this.monitoringInterval = setInterval(async () => {
      await this.collectAllMetrics();
    }, interval);
    
    // Initial collection
    this.collectAllMetrics().catch(error => {
      console.error('[QueueMonitor] Error in initial metrics collection:', error);
    });
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[QueueMonitor] Stopped monitoring');
    }
  }
  
  /**
   * Collect metrics for all queues
   */
  async collectAllMetrics(): Promise<void> {
    const queueNames = Object.keys(QUEUE_PRIORITIES);
    
    await Promise.allSettled(
      queueNames.map(queueName => this.collectQueueMetrics(queueName))
    );
  }
  
  /**
   * Collect metrics for a specific queue
   */
  async collectQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = new Queue(queueName, { connection: this.redis });
    
    try {
      // Get queue counts
      const [waiting, active, delayed, failed, completed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
        queue.getCompletedCount(),
      ]);
      
      // Get oldest waiting job
      const waitingJobs = await queue.getJobs(['waiting'], 0, 0, true);
      const oldestWaitingMs = waitingJobs.length > 0
        ? Date.now() - waitingJobs[0].timestamp
        : 0;
      
      // Get jobs per minute (from last minute's history)
      const jobsPerMinute = await this.calculateJobsPerMinute(queueName);
      
      // Get error rate (from last hour)
      const errorRate = await this.calculateErrorRate(queueName);
      
      // Get timeout rate (from last hour)
      const timeoutRate = await this.calculateTimeoutRate(queueName);
      
      // Get processing time statistics
      const timeStats = timeoutHandler.getExecutionStats(queueName);
      
      // Get memory stats
      const memoryStats = memoryMonitor.getCurrentMemoryStats();
      
      const metrics: QueueMetrics = {
        queueName,
        waiting,
        active,
        delayed,
        failed,
        completed,
        jobsPerMinute,
        errorRate,
        timeoutRate,
        avgProcessingTimeMs: timeStats?.avg || 0,
        p50ProcessingTimeMs: timeStats?.p50 || 0,
        p95ProcessingTimeMs: timeStats?.p95 || 0,
        p99ProcessingTimeMs: timeStats?.p99 || 0,
        oldestWaitingMs,
        memoryUsageMB: memoryStats.heapUsed,
        memoryPercentage: memoryStats.percentage,
        timestamp: new Date(),
      };
      
      // Store metrics history
      this.storeMetrics(queueName, metrics);
      
      // Check for alerts
      await this.checkAlerts(metrics);
      
      return metrics;
    } finally {
      await queue.close();
    }
  }
  
  /**
   * Store metrics in history
   */
  private storeMetrics(queueName: string, metrics: QueueMetrics): void {
    if (!this.metricsHistory.has(queueName)) {
      this.metricsHistory.set(queueName, []);
    }
    
    const history = this.metricsHistory.get(queueName)!;
    history.push(metrics);
    
    // Keep metrics for configured retention period
    const retentionMs = MONITORING_CONFIG.METRICS_RETENTION_HOURS * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    
    const filtered = history.filter(m => m.timestamp.getTime() > cutoff);
    this.metricsHistory.set(queueName, filtered);
  }
  
  /**
   * Check metrics against alert thresholds
   */
  private async checkAlerts(metrics: QueueMetrics): Promise<void> {
    const alerts: Alert[] = [];
    
    // Check queue depth
    if (metrics.waiting >= MONITORING_CONFIG.ALERT_QUEUE_DEPTH_CRITICAL) {
      alerts.push({
        id: `${metrics.queueName}-queue-depth-${Date.now()}`,
        severity: 'critical',
        queueName: metrics.queueName,
        type: 'queue_depth',
        message: `Critical queue depth: ${metrics.waiting} jobs waiting`,
        value: metrics.waiting,
        threshold: MONITORING_CONFIG.ALERT_QUEUE_DEPTH_CRITICAL,
        timestamp: new Date(),
        acknowledged: false,
      });
    } else if (metrics.waiting >= MONITORING_CONFIG.ALERT_QUEUE_DEPTH_WARNING) {
      alerts.push({
        id: `${metrics.queueName}-queue-depth-${Date.now()}`,
        severity: 'warning',
        queueName: metrics.queueName,
        type: 'queue_depth',
        message: `High queue depth: ${metrics.waiting} jobs waiting`,
        value: metrics.waiting,
        threshold: MONITORING_CONFIG.ALERT_QUEUE_DEPTH_WARNING,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
    
    // Check error rate
    if (metrics.errorRate >= MONITORING_CONFIG.ALERT_ERROR_RATE_CRITICAL) {
      alerts.push({
        id: `${metrics.queueName}-error-rate-${Date.now()}`,
        severity: 'critical',
        queueName: metrics.queueName,
        type: 'error_rate',
        message: `Critical error rate: ${metrics.errorRate.toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: MONITORING_CONFIG.ALERT_ERROR_RATE_CRITICAL,
        timestamp: new Date(),
        acknowledged: false,
      });
    } else if (metrics.errorRate >= MONITORING_CONFIG.ALERT_ERROR_RATE_WARNING) {
      alerts.push({
        id: `${metrics.queueName}-error-rate-${Date.now()}`,
        severity: 'warning',
        queueName: metrics.queueName,
        type: 'error_rate',
        message: `High error rate: ${metrics.errorRate.toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: MONITORING_CONFIG.ALERT_ERROR_RATE_WARNING,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
    
    // Check timeout rate
    if (metrics.timeoutRate >= MONITORING_CONFIG.ALERT_TIMEOUT_RATE_CRITICAL) {
      alerts.push({
        id: `${metrics.queueName}-timeout-rate-${Date.now()}`,
        severity: 'critical',
        queueName: metrics.queueName,
        type: 'timeout_rate',
        message: `Critical timeout rate: ${metrics.timeoutRate.toFixed(1)}%`,
        value: metrics.timeoutRate,
        threshold: MONITORING_CONFIG.ALERT_TIMEOUT_RATE_CRITICAL,
        timestamp: new Date(),
        acknowledged: false,
      });
    } else if (metrics.timeoutRate >= MONITORING_CONFIG.ALERT_TIMEOUT_RATE_WARNING) {
      alerts.push({
        id: `${metrics.queueName}-timeout-rate-${Date.now()}`,
        severity: 'warning',
        queueName: metrics.queueName,
        type: 'timeout_rate',
        message: `High timeout rate: ${metrics.timeoutRate.toFixed(1)}%`,
        value: metrics.timeoutRate,
        threshold: MONITORING_CONFIG.ALERT_TIMEOUT_RATE_WARNING,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
    
    // Check P99 processing time
    if (metrics.p99ProcessingTimeMs >= MONITORING_CONFIG.ALERT_PROCESSING_TIME_P99_MS) {
      alerts.push({
        id: `${metrics.queueName}-processing-time-p99-${Date.now()}`,
        severity: 'warning',
        queueName: metrics.queueName,
        type: 'processing_time',
        message: `High P99 processing time: ${metrics.p99ProcessingTimeMs}ms`,
        value: metrics.p99ProcessingTimeMs,
        threshold: MONITORING_CONFIG.ALERT_PROCESSING_TIME_P99_MS,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
    
    // Trigger alerts
    for (const alert of alerts) {
      this.triggerAlert(alert);
    }
  }
  
  /**
   * Trigger an alert
   */
  private triggerAlert(alert: Alert): void {
    this.activeAlerts.set(alert.id, alert);
    
    console.log(
      `[QueueMonitor] 🚨 ${alert.severity.toUpperCase()} ALERT: ${alert.queueName} - ${alert.message}`
    );
    
    // Call alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('[QueueMonitor] Error in alert callback:', error);
      }
    }
  }
  
  /**
   * Get health status for all queues
   */
  async getHealthStatus(): Promise<QueueHealthStatus[]> {
    const queueNames = Object.keys(QUEUE_PRIORITIES);
    const results = await Promise.allSettled(
      queueNames.map(name => this.getQueueHealth(name))
    );
    
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<QueueHealthStatus>).value);
  }
  
  /**
   * Get health status for a specific queue
   */
  async getQueueHealth(queueName: string): Promise<QueueHealthStatus> {
    const metrics = await this.collectQueueMetrics(queueName);
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    // Check queue depth
    if (metrics.waiting >= MONITORING_CONFIG.ALERT_QUEUE_DEPTH_CRITICAL) {
      status = 'critical';
      issues.push(`Critical queue backlog: ${metrics.waiting} jobs`);
    } else if (metrics.waiting >= MONITORING_CONFIG.ALERT_QUEUE_DEPTH_WARNING) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push(`High queue depth: ${metrics.waiting} jobs`);
    }
    
    // Check error rate
    if (metrics.errorRate >= MONITORING_CONFIG.ALERT_ERROR_RATE_CRITICAL) {
      status = 'critical';
      issues.push(`Critical error rate: ${metrics.errorRate.toFixed(1)}%`);
    } else if (metrics.errorRate >= MONITORING_CONFIG.ALERT_ERROR_RATE_WARNING) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
    }
    
    // Check processing time
    if (metrics.p99ProcessingTimeMs >= MONITORING_CONFIG.ALERT_PROCESSING_TIME_P99_MS) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push(`Slow P99 processing: ${metrics.p99ProcessingTimeMs}ms`);
    }
    
    return {
      queueName,
      healthy: status === 'healthy',
      status,
      issues,
      metrics,
      timestamp: new Date(),
    };
  }
  
  /**
   * Get metrics history for a queue
   */
  getMetricsHistory(queueName: string, limit?: number): QueueMetrics[] {
    const history = this.metricsHistory.get(queueName) || [];
    return limit ? history.slice(-limit) : history;
  }
  
  /**
   * Get current metrics for a queue
   */
  getCurrentMetrics(queueName: string): QueueMetrics | null {
    const history = this.metricsHistory.get(queueName);
    return history && history.length > 0 ? history[history.length - 1] : null;
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(queueName?: string): Alert[] {
    const alerts = Array.from(this.activeAlerts.values());
    return queueName
      ? alerts.filter(a => a.queueName === queueName && !a.acknowledged)
      : alerts.filter(a => !a.acknowledged);
  }
  
  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }
  
  /**
   * Register alert callback
   */
  onAlert(callback: (alert: Alert) => void): void {
    this.alertCallbacks.push(callback);
  }
  
  /**
   * Calculate jobs per minute
   */
  private async calculateJobsPerMinute(queueName: string): Promise<number> {
    const history = this.metricsHistory.get(queueName);
    if (!history || history.length < 2) return 0;
    
    const recent = history.slice(-2);
    const timeDiffMs = recent[1].timestamp.getTime() - recent[0].timestamp.getTime();
    const timeDiffMin = timeDiffMs / 1000 / 60;
    
    if (timeDiffMin === 0) return 0;
    
    const jobsDiff = recent[1].completed - recent[0].completed;
    return Math.round(jobsDiff / timeDiffMin);
  }
  
  /**
   * Calculate error rate from history
   */
  private async calculateErrorRate(queueName: string): Promise<number> {
    const history = this.metricsHistory.get(queueName);
    if (!history || history.length < 2) return 0;
    
    // Get metrics from last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentMetrics = history.filter(m => m.timestamp.getTime() > oneHourAgo);
    
    if (recentMetrics.length < 2) return 0;
    
    const oldest = recentMetrics[0];
    const newest = recentMetrics[recentMetrics.length - 1];
    
    const completedDiff = newest.completed - oldest.completed;
    const failedDiff = newest.failed - oldest.failed;
    const total = completedDiff + failedDiff;
    
    return total > 0 ? (failedDiff / total) * 100 : 0;
  }
  
  /**
   * Calculate timeout rate
   */
  private async calculateTimeoutRate(queueName: string): Promise<number> {
    // This would need to be tracked separately in production
    // For now, return 0
    return 0;
  }
  
  /**
   * Get dashboard summary
   */
  async getDashboardSummary(): Promise<{
    totalQueues: number;
    healthyQueues: number;
    warningQueues: number;
    criticalQueues: number;
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
    activeAlerts: number;
    avgJobsPerMinute: number;
    avgErrorRate: number;
  }> {
    const healthStatuses = await this.getHealthStatus();
    
    const summary = {
      totalQueues: healthStatuses.length,
      healthyQueues: healthStatuses.filter(h => h.status === 'healthy').length,
      warningQueues: healthStatuses.filter(h => h.status === 'warning').length,
      criticalQueues: healthStatuses.filter(h => h.status === 'critical').length,
      totalWaiting: healthStatuses.reduce((sum, h) => sum + h.metrics.waiting, 0),
      totalActive: healthStatuses.reduce((sum, h) => sum + h.metrics.active, 0),
      totalFailed: healthStatuses.reduce((sum, h) => sum + h.metrics.failed, 0),
      activeAlerts: this.getActiveAlerts().length,
      avgJobsPerMinute: Math.round(
        healthStatuses.reduce((sum, h) => sum + h.metrics.jobsPerMinute, 0) / healthStatuses.length
      ),
      avgErrorRate: parseFloat(
        (healthStatuses.reduce((sum, h) => sum + h.metrics.errorRate, 0) / healthStatuses.length).toFixed(2)
      ),
    };
    
    return summary;
  }
  
  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopMonitoring();
    this.metricsHistory.clear();
    this.activeAlerts.clear();
    this.alertCallbacks = [];
  }
}

// Singleton instance
export const queueMonitor = new QueueMonitoringService();
