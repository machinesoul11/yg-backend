/**
 * Queue System Index
 * 
 * Central export point for the background jobs scaling and monitoring system.
 */

// Configuration
export * from './config';

// Rate Limiting
export * from './rate-limiter';

// Memory Management
export * from './memory-monitor';

// Timeout Handling
export * from './timeout-handler';

// Scaling Management
export * from './scaling-manager';

// Monitoring
export * from './monitoring';

// Lazy Queue (existing)
export * from './lazy-queue';

// Initialization
import { scalingManager, initializeScaling } from './scaling-manager';
import { queueMonitor } from './monitoring';
import { memoryMonitor } from './memory-monitor';
import { timeoutHandler } from './timeout-handler';

/**
 * Initialize the complete queue scaling and monitoring system
 */
export async function initializeQueueSystem(options?: {
  enableAutoScaling?: boolean;
  enableMonitoring?: boolean;
  autoScalingIntervalMs?: number;
  monitoringIntervalMs?: number;
}): Promise<void> {
  const {
    enableAutoScaling = true,
    enableMonitoring = true,
    autoScalingIntervalMs = 30000,
    monitoringIntervalMs = 60000,
  } = options || {};
  
  console.log('[QueueSystem] Initializing background jobs scaling and monitoring...');
  
  try {
    // Initialize scaling policies for all queues
    initializeScaling();
    
    // Start auto-scaling if enabled and not in serverless
    if (enableAutoScaling && process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      scalingManager.startAutoScaling(autoScalingIntervalMs);
      console.log('[QueueSystem] ✓ Auto-scaling enabled');
    } else if (process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      console.log('[QueueSystem] ⚠ Auto-scaling disabled (serverless environment)');
    }
    
    // Start monitoring if enabled
    if (enableMonitoring) {
      queueMonitor.startMonitoring(monitoringIntervalMs);
      console.log('[QueueSystem] ✓ Monitoring enabled');
    }
    
    // Set up graceful shutdown
    const shutdownHandler = async () => {
      console.log('[QueueSystem] Shutting down queue system...');
      scalingManager.stopAutoScaling();
      queueMonitor.stopMonitoring();
      memoryMonitor.cleanup();
      timeoutHandler.cancelAllTimeouts();
      console.log('[QueueSystem] Queue system shut down successfully');
    };
    
    process.once('SIGTERM', shutdownHandler);
    process.once('SIGINT', shutdownHandler);
    
    console.log('[QueueSystem] ✓ Queue system initialized successfully');
  } catch (error) {
    console.error('[QueueSystem] Failed to initialize queue system:', error);
    throw error;
  }
}

/**
 * Get health status of the entire queue system
 */
export async function getQueueSystemHealth() {
  const [dashboardSummary, workersSummary, memoryStats] = await Promise.all([
    queueMonitor.getDashboardSummary(),
    memoryMonitor.getSummary(),
    Promise.resolve(memoryMonitor.getCurrentMemoryStats()),
  ]);
  
  return {
    timestamp: new Date(),
    queues: dashboardSummary,
    workers: workersSummary,
    memory: memoryStats,
    healthy: dashboardSummary.criticalQueues === 0 && dashboardSummary.activeAlerts === 0,
  };
}
