# Background Jobs Scaling - Quick Reference

Quick examples and common patterns for using the background jobs scaling system.

---

## Quick Start

### Initialize the System

```typescript
import { initializeQueueSystem } from '@/lib/queue';

// In your app startup
await initializeQueueSystem({
  enableAutoScaling: true,
  enableMonitoring: true,
});
```

---

## Rate Limiting

### Check Email Rate Limit

```typescript
import { emailSendingLimiter } from '@/lib/queue/rate-limiter';

async function sendEmailJob(job: Job) {
  // Check rate limit
  const limit = await emailSendingLimiter.perMinute();
  
  if (!limit.allowed) {
    // Rate limited - reschedule
    await job.moveToDelayed(limit.retryAfterMs!);
    return { rescheduled: true };
  }
  
  // Send email
  await sendEmail(job.data);
  return { sent: true };
}
```

### Check Stripe API Rate Limit

```typescript
import { stripeApiLimiter } from '@/lib/queue/rate-limiter';

async function processPaymentJob(job: Job) {
  const limit = await stripeApiLimiter.perSecond();
  
  if (!limit.allowed) {
    throw new Error('Stripe API rate limit exceeded');
  }
  
  const payment = await stripe.payments.create(job.data);
  return payment;
}
```

### Create Custom Rate Limit

```typescript
import { JobRateLimiter } from '@/lib/queue/rate-limiter';

const limiter = new JobRateLimiter();

const result = await limiter.checkSlidingWindowLimit({
  name: 'custom-api-limit',
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  blockDurationMs: 5000, // Wait 5s before retry
});
```

---

## Timeout Handling

### Wrap Job with Timeout

```typescript
import { withTimeout } from '@/lib/queue/timeout-handler';

const processor = withTimeout(
  'pdf-generation',
  async (job: Job) => {
    const pdf = await generatePDF(job.data);
    return { url: pdf.url };
  },
  {
    timeout: 300000, // 5 minutes
    adaptive: true, // Use adaptive timeout
    onSoftTimeout: (job, elapsed) => {
      job.log(`Warning: ${elapsed}ms elapsed, approaching timeout`);
    },
  }
);

export const pdfWorker = new Worker('pdf-generation', processor, options);
```

### Get Execution Statistics

```typescript
import { timeoutHandler } from '@/lib/queue/timeout-handler';

const stats = timeoutHandler.getExecutionStats('pdf-generation');
console.log(`Average: ${stats.avg}ms`);
console.log(`P95: ${stats.p95}ms`);
console.log(`P99: ${stats.p99}ms`);
```

---

## Memory Monitoring

### Execute with Memory Check

```typescript
import { executeWithMemoryCheck } from '@/lib/queue/memory-monitor';

async function processLargeFileJob(job: Job) {
  return executeWithMemoryCheck(
    'large-file-processing',
    2048, // Expected 2GB memory usage
    async () => {
      const result = await processFile(job.data.fileUrl);
      return result;
    }
  );
}
```

### Monitor Worker Memory

```typescript
import { createMonitoredWorker } from '@/lib/queue/memory-monitor';

const worker = new Worker('asset-processing', processor, options);

createMonitoredWorker('asset-processing', worker, {
  workerId: 'asset-worker-1',
  onRecycleNeeded: async (reason) => {
    console.log(`Recycling worker: ${reason}`);
    await worker.close();
    // Let orchestrator restart
  },
});
```

### Check Current Memory

```typescript
import { memoryMonitor } from '@/lib/queue/memory-monitor';

const stats = memoryMonitor.getCurrentMemoryStats();
console.log(`Heap used: ${stats.heapUsed}MB (${stats.percentage}%)`);

const check = memoryMonitor.checkMemoryLimits();
if (check.exceedsCritical) {
  console.error('Critical memory usage!');
}
```

---

## Scaling Management

### Register Queue for Auto-Scaling

```typescript
import { scalingManager } from '@/lib/queue/scaling-manager';

scalingManager.registerQueue('email-campaigns', {
  minWorkers: 2,
  maxWorkers: 20,
  scaleUpThreshold: {
    queueDepth: 100,
    queueLatencyMs: 30000,
  },
  scaleDownThreshold: {
    queueDepth: 10,
    queueLatencyMs: 5000,
  },
});
```

### Make Scaling Decision

```typescript
import { scalingManager } from '@/lib/queue/scaling-manager';

const decision = await scalingManager.makeScalingDecision('email-campaigns');

if (decision.action === 'scale_up') {
  console.log(`Scale up: ${decision.currentWorkers} -> ${decision.targetWorkers}`);
  console.log(`Reason: ${decision.reason}`);
  // Trigger actual scaling via K8s/ECS
}
```

### Get Scaling History

```typescript
import { scalingManager } from '@/lib/queue/scaling-manager';

const history = scalingManager.getScalingHistory('email-campaigns', 20);
history.forEach(decision => {
  console.log(`${decision.timestamp}: ${decision.action} - ${decision.reason}`);
});
```

---

## Monitoring

### Start Monitoring

```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

// Start collecting metrics every 60 seconds
queueMonitor.startMonitoring(60000);
```

### Get Dashboard Summary

```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

const summary = await queueMonitor.getDashboardSummary();
console.log(`Total queues: ${summary.totalQueues}`);
console.log(`Healthy: ${summary.healthyQueues}`);
console.log(`Warning: ${summary.warningQueues}`);
console.log(`Critical: ${summary.criticalQueues}`);
console.log(`Active alerts: ${summary.activeAlerts}`);
console.log(`Jobs per minute: ${summary.avgJobsPerMinute}`);
console.log(`Error rate: ${summary.avgErrorRate}%`);
```

### Get Queue Health

```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

const health = await queueMonitor.getQueueHealth('email-campaigns');
console.log(`Status: ${health.status}`);
console.log(`Healthy: ${health.healthy}`);
if (health.issues.length > 0) {
  console.log(`Issues: ${health.issues.join(', ')}`);
}
```

### Handle Alerts

```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

// Register alert handler
queueMonitor.onAlert((alert) => {
  console.log(`🚨 ${alert.severity.toUpperCase()}: ${alert.message}`);
  
  if (alert.severity === 'critical') {
    // Send to PagerDuty
    sendToPagerDuty(alert);
  } else {
    // Send to Slack
    sendToSlack(alert);
  }
});

// Get active alerts
const alerts = queueMonitor.getActiveAlerts();
alerts.forEach(alert => {
  console.log(`${alert.queueName}: ${alert.message}`);
});

// Acknowledge an alert
queueMonitor.acknowledgeAlert(alertId);
```

### Get Metrics History

```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

// Get last 100 metrics for a queue
const history = queueMonitor.getMetricsHistory('email-campaigns', 100);

// Calculate average processing time
const avgTime = history.reduce((sum, m) => sum + m.avgProcessingTimeMs, 0) / history.length;
console.log(`Average processing time: ${avgTime}ms`);
```

---

## Complete Worker Example

```typescript
import { Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { withTimeout } from '@/lib/queue/timeout-handler';
import { createMonitoredWorker } from '@/lib/queue/memory-monitor';
import { emailSendingLimiter } from '@/lib/queue/rate-limiter';
import { WORKER_CONCURRENCY } from '@/lib/queue/config';

// Define processor with timeout handling
const processor = withTimeout(
  'email-sending',
  async (job: Job) => {
    // Check rate limit
    const limit = await emailSendingLimiter.perMinute();
    if (!limit.allowed) {
      await job.moveToDelayed(limit.retryAfterMs!);
      return { rescheduled: true };
    }
    
    // Send email
    await sendEmail(job.data);
    
    return { sent: true };
  },
  {
    timeout: 60000,
    adaptive: true,
  }
);

// Create worker with concurrency
const worker = new Worker('email-sending', processor, {
  connection: getBullMQRedisClient(),
  concurrency: WORKER_CONCURRENCY.EMAIL_DELIVERY,
});

// Add memory monitoring
createMonitoredWorker('email-sending', worker, {
  workerId: 'email-worker-1',
  onRecycleNeeded: async (reason) => {
    console.log(`Recycling worker: ${reason}`);
    await worker.close();
  },
});

// Event handlers
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});
```

---

## Health Check Endpoint

```typescript
import { getQueueSystemHealth } from '@/lib/queue';

export async function GET(req: Request) {
  const health = await getQueueSystemHealth();
  
  return Response.json({
    healthy: health.healthy,
    timestamp: health.timestamp,
    queues: health.queues,
    workers: health.workers,
    memory: health.memory,
  }, {
    status: health.healthy ? 200 : 503,
  });
}
```

---

## Configuration Examples

### Development Environment

```bash
# Lower concurrency for development
WORKER_CONCURRENCY_EMAIL=2
WORKER_CONCURRENCY_SEARCH=3

# Shorter timeouts
TIMEOUT_EMAIL=30000

# Disable auto-scaling
ENABLE_AUTO_SCALING=false
```

### Production Environment

```bash
# Full concurrency
WORKER_CONCURRENCY_EMAIL=15
WORKER_CONCURRENCY_SEARCH=20

# Standard timeouts
TIMEOUT_EMAIL=60000

# Enable auto-scaling
ENABLE_AUTO_SCALING=true
SCALE_UP_QUEUE_DEPTH=100
MIN_WORKERS=2
MAX_WORKERS=20

# Enable monitoring
ENABLE_QUEUE_MONITORING=true
METRICS_INTERVAL=60000
```

---

## Troubleshooting

### High Queue Depth

```typescript
// Check scaling decision
const decision = await scalingManager.makeScalingDecision('problem-queue');
console.log(decision);

// Check if workers are healthy
const health = await queueMonitor.getQueueHealth('problem-queue');
console.log(health);

// Check for rate limiting
const metrics = queueMonitor.getCurrentMetrics('problem-queue');
console.log(`Error rate: ${metrics.errorRate}%`);
```

### High Error Rate

```typescript
// Get execution statistics
const stats = timeoutHandler.getExecutionStats('problem-queue');
console.log(`P99 time: ${stats.p99}ms`);

// Check memory usage
const memorySummary = memoryMonitor.getSummary();
console.log(memorySummary);

// Get recent alerts
const alerts = queueMonitor.getActiveAlerts('problem-queue');
alerts.forEach(alert => console.log(alert.message));
```

### Memory Issues

```typescript
// Check current memory
const memStats = memoryMonitor.getCurrentMemoryStats();
console.log(`Memory: ${memStats.heapUsed}MB / ${memStats.heapTotal}MB`);

// Check workers needing recycle
const workerStats = memoryMonitor.getAllWorkerStats();
workerStats.filter(w => w.shouldRecycle).forEach(w => {
  console.log(`${w.workerId}: ${w.recycleReason}`);
});

// Force garbage collection
memoryMonitor.forceGarbageCollection();
```

---

## Best Practices

1. **Always use rate limiting** for external API calls
2. **Set appropriate timeouts** based on job characteristics
3. **Monitor memory usage** for memory-intensive jobs
4. **Use adaptive timeouts** for variable-duration jobs
5. **Configure scaling thresholds** based on your infrastructure
6. **Set up alerts** for critical queues
7. **Review metrics regularly** to optimize configuration
8. **Test graceful shutdown** procedures
9. **Use priority queues** appropriately
10. **Document job characteristics** (memory, timeout, rate limits)
