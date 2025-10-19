# Background Jobs Scaling - Implementation Complete

**Status:** ✅ COMPLETE  
**Date:** October 19, 2025

## Implementation Summary

Complete implementation of background jobs scaling infrastructure for the YesGoddess backend, including worker concurrency configuration, priority queues, rate limiting, memory management, timeout handling, horizontal scaling strategies, and comprehensive monitoring.

---

## Features Implemented

### ✅ 1. Worker Concurrency Configuration

**Files:**
- `src/lib/queue/config.ts` - Central configuration
- `src/lib/queue/lazy-queue.ts` - Lazy-loading queue wrapper (existing)

**Features:**
- **Environment-based configuration** - All concurrency settings configurable via environment variables
- **Priority-based defaults** - Different concurrency levels for critical, high, normal, low, and background jobs
- **Per-job-type configuration** - Specific concurrency settings for each job type:
  - Critical: 5-10 workers (notifications, payments, password resets)
  - High priority: 8-20 workers (emails, search indexing)
  - Normal: 3-10 workers (tax documents, analytics, asset processing)
  - Low: 2-5 workers (cache maintenance, metrics rollup)
  - Background: 1-2 workers (cleanup tasks, reindexing)

**Configuration:**
```typescript
export const WORKER_CONCURRENCY = {
  NOTIFICATION_DELIVERY: 10,
  EMAIL_DELIVERY: 15,
  SEARCH_INDEX_UPDATE: 20,
  ASSET_PROCESSING: 8,
  // ... more configurations
};
```

**Environment Variables:**
```bash
WORKER_CONCURRENCY_NOTIFICATION=10
WORKER_CONCURRENCY_EMAIL=15
WORKER_CONCURRENCY_SEARCH=20
# ... etc
```

---

### ✅ 2. Job Priority Queues

**File:** `src/lib/queue/config.ts`

**Features:**
- **Five priority levels:**
  - `CRITICAL (1)` - User-facing operations (password reset, payments, notifications)
  - `HIGH (3)` - Time-sensitive (emails, search indexing, tax documents)
  - `NORMAL (5)` - Regular operations (campaigns, analytics, asset processing)
  - `LOW (7)` - Can be delayed (cache maintenance, metrics rollup)
  - `BACKGROUND (10)` - Maintenance tasks (cleanup, full reindex)

- **Queue classification** - All existing queues mapped to appropriate priorities
- **Priority-based worker allocation** - Higher priority queues get more resources
- **Weighted processing** - Workers prioritize critical queues

**Usage:**
```typescript
import { JobPriority, QUEUE_PRIORITIES } from '@/lib/queue/config';

// Get priority for a queue
const priority = QUEUE_PRIORITIES['notification-delivery']; // JobPriority.CRITICAL
```

---

### ✅ 3. Job Rate Limiting

**File:** `src/lib/queue/rate-limiter.ts`

**Features:**
- **Multiple rate limit algorithms:**
  - Sliding window rate limiting (precise)
  - Token bucket rate limiting (burst-friendly)
  - Fixed window rate limiting (simple)

- **Distributed rate limiting** - Uses Redis for coordination across workers
- **Pre-configured limiters** for common services:
  - Email sending (per minute/hour/day)
  - Email campaigns (per minute/hour)
  - Stripe API (per second/hour)
  - Resend API (per second)
  - Search indexing (per second/minute)
  - Asset processing (per minute/hour)
  - Tax generation (per minute/hour)

- **Automatic backoff** - Jobs that hit rate limits are rescheduled with appropriate delays
- **Rate limit statistics** - Track current consumption and trends

**Usage:**
```typescript
import { emailSendingLimiter, RateLimitResult } from '@/lib/queue/rate-limiter';

// Check rate limit before sending email
const result: RateLimitResult = await emailSendingLimiter.perMinute();

if (!result.allowed) {
  // Rate limit exceeded, retry after delay
  await job.moveToDelayed(result.retryAfterMs);
  return;
}

// Proceed with sending email
await sendEmail(emailData);
```

**Configuration:**
```typescript
export const RATE_LIMITS = {
  EMAIL_SENDING: {
    perMinute: 300,
    perHour: 10000,
    perDay: 100000,
  },
  STRIPE_API: {
    perSecond: 100,
    perHour: 100000,
  },
  // ... more limits
};
```

---

### ✅ 4. Memory Limit Configuration

**File:** `src/lib/queue/memory-monitor.ts`

**Features:**
- **Per-worker memory limits:**
  - Soft limit (512MB default) - Warning threshold
  - Hard limit (1024MB default) - Termination threshold

- **Job-specific memory limits:**
  - Asset processing: 2048MB
  - PDF generation: 1024MB
  - Bulk operations: 1024MB
  - Search reindex: 2048MB

- **Automatic worker recycling:**
  - After processing N jobs (configurable, default 1000)
  - After running for N hours (configurable, default 4)
  - When memory exceeds limits

- **Real-time memory monitoring:**
  - Track heap usage, RSS, external memory
  - Memory percentage calculations
  - Per-worker statistics

- **Memory-aware job execution** - Pre-checks available memory before starting jobs

**Usage:**
```typescript
import { memoryMonitor, executeWithMemoryCheck } from '@/lib/queue/memory-monitor';

// Execute job with memory monitoring
const result = await executeWithMemoryCheck(
  'pdf-generation',
  1024, // Expected memory usage in MB
  async () => {
    return await generatePDF(documentData);
  }
);

// Check if worker should be recycled
const recycleCheck = memoryMonitor.shouldRecycleWorker(workerId);
if (recycleCheck.shouldRecycle) {
  console.log(`Recycling worker: ${recycleCheck.reason}`);
  await gracefulShutdown();
}
```

**Configuration:**
```bash
WORKER_MEMORY_SOFT_LIMIT=512
WORKER_MEMORY_HARD_LIMIT=1024
MEMORY_LIMIT_ASSET_PROCESSING=2048
MEMORY_WARNING_THRESHOLD=75
WORKER_RECYCLE_AFTER_JOBS=1000
WORKER_RECYCLE_AFTER_HOURS=4
```

---

### ✅ 5. Job Timeout Handling

**File:** `src/lib/queue/timeout-handler.ts`

**Features:**
- **Multi-tiered timeouts:**
  - Soft timeout (80% of hard timeout) - Warning only
  - Hard timeout - Terminates job execution

- **Job-specific timeouts:**
  - Critical jobs: 30s - 2min
  - Standard jobs: 1min - 5min
  - Long-running jobs: 10min - 30min
  - Very long jobs: 1hr - 2hr

- **Adaptive timeout strategies:**
  - Learns from execution history
  - Automatically adjusts timeouts based on P95 execution time
  - Prevents false timeouts during high load

- **Timeout-aware retry logic:**
  - Longer backoff for timeout failures
  - Different retry strategies for timeouts vs errors

- **Execution statistics:**
  - Track min, max, avg, P50, P95, P99 execution times
  - Per-job-type performance metrics

**Usage:**
```typescript
import { withTimeout, timeoutHandler } from '@/lib/queue/timeout-handler';

// Wrap job processor with timeout handling
const processor = withTimeout(
  'tax-document-generation',
  async (job) => {
    return await generateTaxDocument(job.data);
  },
  {
    timeout: 300000, // 5 minutes
    adaptive: true, // Use adaptive timeout based on history
    onSoftTimeout: (job, elapsed) => {
      job.log(`Warning: Approaching timeout at ${elapsed}ms`);
    },
  }
);

// Get execution statistics
const stats = timeoutHandler.getExecutionStats('tax-document-generation');
console.log(`P95 execution time: ${stats.p95}ms`);
```

**Configuration:**
```bash
TIMEOUT_NOTIFICATION=30000
TIMEOUT_EMAIL=60000
TIMEOUT_PDF_GENERATION=600000
TIMEOUT_FULL_REINDEX=3600000
TIMEOUT_SOFT_PERCENTAGE=80
```

---

### ✅ 6. Horizontal Scaling Strategy

**File:** `src/lib/queue/scaling-manager.ts`

**Features:**
- **Auto-scaling triggers:**
  - Queue depth thresholds
  - Queue latency thresholds
  - CPU utilization thresholds
  - Memory utilization thresholds

- **Scaling policies:**
  - Per-queue min/max workers
  - Priority-based resource allocation
  - Cooldown periods (prevent thrashing)
  - Aggressive scale-up, conservative scale-down

- **Scaling decisions:**
  - Real-time metrics analysis
  - Intelligent worker increment calculation
  - Severity-based scaling (1-3 workers at a time)

- **Scaling history tracking:**
  - Record all scaling decisions
  - Analyze scaling patterns
  - Optimize policies based on history

**Usage:**
```typescript
import { scalingManager, initializeScaling } from '@/lib/queue/scaling-manager';

// Initialize scaling for all queues
initializeScaling();

// Make scaling decision for a queue
const decision = await scalingManager.makeScalingDecision('email-campaigns');

if (decision.action === 'scale_up') {
  console.log(`Scale up: ${decision.currentWorkers} -> ${decision.targetWorkers}`);
  console.log(`Reason: ${decision.reason}`);
  // Trigger actual scaling via K8s/ECS/etc
}

// Start automatic scaling
scalingManager.startAutoScaling(30000); // Check every 30s
```

**Configuration:**
```bash
# Scale-up thresholds
SCALE_UP_QUEUE_DEPTH=100
SCALE_UP_QUEUE_LATENCY=30000
SCALE_UP_CPU_THRESHOLD=75
SCALE_UP_MEMORY_THRESHOLD=80

# Scale-down thresholds
SCALE_DOWN_QUEUE_DEPTH=10
SCALE_DOWN_QUEUE_LATENCY=5000
SCALE_DOWN_CPU_THRESHOLD=30
SCALE_DOWN_MEMORY_THRESHOLD=40

# Worker limits
MIN_WORKERS=1
MAX_WORKERS=10
CRITICAL_MIN_WORKERS=2
CRITICAL_MAX_WORKERS=20
BACKGROUND_MIN_WORKERS=1
BACKGROUND_MAX_WORKERS=5

# Cooldown periods
SCALE_UP_COOLDOWN=60
SCALE_DOWN_COOLDOWN=300

# Health checks
HEALTH_CHECK_INTERVAL=30000
SHUTDOWN_TIMEOUT=30000
```

---

### ✅ 7. Job Queue Monitoring

**File:** `src/lib/queue/monitoring.ts`

**Features:**
- **Comprehensive metrics collection:**
  - Queue depths (waiting, active, delayed, failed, completed)
  - Job rates (jobs per minute)
  - Error rates (percentage of failed jobs)
  - Timeout rates
  - Processing times (avg, P50, P95, P99)
  - Memory usage
  - Worker counts

- **Health status tracking:**
  - Per-queue health status
  - Overall system health
  - Issue detection and categorization

- **Alerting system:**
  - Configurable alert thresholds
  - Multiple severity levels (warning, critical)
  - Alert types: queue depth, error rate, timeout rate, processing time, memory usage
  - Alert acknowledgment
  - Alert callbacks for integration

- **Dashboard-ready data:**
  - Real-time metrics
  - Historical data
  - Summary statistics
  - Trend analysis

- **Metrics retention:**
  - Configurable retention period (default 7 days)
  - Automatic cleanup of old metrics
  - Efficient storage

**Usage:**
```typescript
import { queueMonitor } from '@/lib/queue/monitoring';

// Start monitoring
queueMonitor.startMonitoring(60000); // Collect metrics every 60s

// Get dashboard summary
const summary = await queueMonitor.getDashboardSummary();
console.log(`Total queues: ${summary.totalQueues}`);
console.log(`Healthy queues: ${summary.healthyQueues}`);
console.log(`Active alerts: ${summary.activeAlerts}`);

// Get health status for all queues
const healthStatuses = await queueMonitor.getHealthStatus();
for (const status of healthStatuses) {
  console.log(`${status.queueName}: ${status.status}`);
  if (status.issues.length > 0) {
    console.log(`Issues: ${status.issues.join(', ')}`);
  }
}

// Register alert callback
queueMonitor.onAlert((alert) => {
  console.log(`🚨 ${alert.severity}: ${alert.message}`);
  // Send to Slack, PagerDuty, etc.
});

// Get metrics history
const history = queueMonitor.getMetricsHistory('email-campaigns', 100);
```

**Alert Thresholds:**
```bash
# Queue depth alerts
ALERT_QUEUE_DEPTH_CRITICAL=500
ALERT_QUEUE_DEPTH_WARNING=200

# Error rate alerts
ALERT_ERROR_RATE_CRITICAL=10
ALERT_ERROR_RATE_WARNING=5

# Timeout rate alerts
ALERT_TIMEOUT_RATE_CRITICAL=5
ALERT_TIMEOUT_RATE_WARNING=2

# Processing time alerts
ALERT_PROCESSING_TIME_P99=300000
ALERT_PROCESSING_TIME_P95=120000

# Metrics configuration
METRICS_INTERVAL=60000
METRICS_RETENTION_HOURS=168
DASHBOARD_REFRESH_INTERVAL=5000
```

---

## Integration with Existing System

### Updated Files

**`src/jobs/workers.ts`**
- Integrated queue system initialization
- Added queue system health to worker health checks
- Graceful shutdown includes queue system cleanup

**`src/lib/queue/index.ts`**
- Central export point for all queue scaling features
- Initialization function for complete setup
- Health check aggregation

---

## Usage Examples

### Example 1: Creating a Rate-Limited Job

```typescript
import { Job } from 'bullmq';
import { emailSendingLimiter } from '@/lib/queue/rate-limiter';
import { withTimeout } from '@/lib/queue/timeout-handler';

const processor = withTimeout(
  'send-email',
  async (job: Job) => {
    // Check rate limit
    const rateLimit = await emailSendingLimiter.perMinute();
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Retry in ${rateLimit.retryAfterMs}ms`);
    }
    
    // Send email
    await sendEmail(job.data);
    
    return { success: true };
  },
  { timeout: 60000, adaptive: true }
);
```

### Example 2: Memory-Aware PDF Generation

```typescript
import { executeWithMemoryCheck } from '@/lib/queue/memory-monitor';

async function generatePDFJob(job: Job) {
  return executeWithMemoryCheck(
    'pdf-generation',
    1024, // Expected 1GB memory usage
    async () => {
      const pdf = await generatePDF(job.data);
      return { pdfUrl: pdf.url, size: pdf.size };
    }
  );
}
```

### Example 3: Monitored Worker

```typescript
import { createMonitoredWorker } from '@/lib/queue/memory-monitor';
import { Worker } from 'bullmq';

const worker = new Worker('asset-processing', processor, {
  connection: redis,
  concurrency: 8,
});

// Add memory monitoring
createMonitoredWorker('asset-processing', worker, {
  workerId: 'asset-worker-1',
  onRecycleNeeded: async (reason) => {
    console.log(`Worker needs recycling: ${reason}`);
    await worker.close();
    // Restart worker or let orchestrator handle it
  },
});
```

---

## Environment Variables

Add these to your `.env` file:

```bash
# Worker Concurrency
WORKER_CONCURRENCY_NOTIFICATION=10
WORKER_CONCURRENCY_EMAIL=15
WORKER_CONCURRENCY_SEARCH=20
WORKER_CONCURRENCY_ASSET=8

# Rate Limits
RATE_LIMIT_EMAIL_PER_MINUTE=300
RATE_LIMIT_EMAIL_PER_HOUR=10000
RATE_LIMIT_STRIPE_PER_SECOND=100

# Memory Limits
WORKER_MEMORY_SOFT_LIMIT=512
WORKER_MEMORY_HARD_LIMIT=1024
WORKER_RECYCLE_AFTER_JOBS=1000
WORKER_RECYCLE_AFTER_HOURS=4

# Timeouts
TIMEOUT_EMAIL=60000
TIMEOUT_PDF_GENERATION=600000
TIMEOUT_FULL_REINDEX=3600000

# Scaling
SCALE_UP_QUEUE_DEPTH=100
SCALE_DOWN_QUEUE_DEPTH=10
MIN_WORKERS=1
MAX_WORKERS=10
ENABLE_AUTO_SCALING=true

# Monitoring
ENABLE_QUEUE_MONITORING=true
METRICS_INTERVAL=60000
ALERT_QUEUE_DEPTH_CRITICAL=500
ALERT_ERROR_RATE_WARNING=5
```

---

## Monitoring Dashboard Data

The system provides comprehensive data for building monitoring dashboards:

```typescript
// Get complete system health
const health = await getQueueSystemHealth();
console.log(health);
// {
//   timestamp: Date,
//   queues: {
//     totalQueues: 15,
//     healthyQueues: 13,
//     warningQueues: 2,
//     criticalQueues: 0,
//     totalWaiting: 42,
//     totalActive: 8,
//     totalFailed: 3,
//     activeAlerts: 1,
//     avgJobsPerMinute: 150,
//     avgErrorRate: 2.1
//   },
//   workers: {
//     totalWorkers: 5,
//     totalJobsProcessed: 12453,
//     averageMemoryUsage: 456,
//     workersNeedingRecycle: 1
//   },
//   memory: { ... },
//   healthy: true
// }
```

---

## Production Deployment Checklist

- [ ] Review and adjust concurrency settings for your workload
- [ ] Configure rate limits based on external API quotas
- [ ] Set memory limits based on available resources
- [ ] Configure timeout values for your specific jobs
- [ ] Set up scaling thresholds for your infrastructure
- [ ] Configure monitoring intervals
- [ ] Set up alert notifications (Slack, PagerDuty, etc.)
- [ ] Test graceful shutdown procedures
- [ ] Review retention policies for logs and metrics
- [ ] Set up dashboards for visualization
- [ ] Configure auto-scaling integration with your orchestrator (K8s, ECS, etc.)
- [ ] Test worker recycling procedures
- [ ] Verify rate limiting doesn't cause job starvation
- [ ] Load test with realistic workloads

---

## Architecture Benefits

1. **Scalability** - Automatic horizontal scaling based on load
2. **Reliability** - Timeout handling, memory management, graceful degradation
3. **Observability** - Comprehensive metrics and alerting
4. **Resource Efficiency** - Rate limiting prevents resource exhaustion
5. **Performance** - Priority queues ensure critical jobs complete quickly
6. **Maintainability** - Centralized configuration, clean separation of concerns
7. **Production-Ready** - Graceful shutdown, health checks, error handling

---

## Future Enhancements

Potential improvements that could be added:

- Integration with Kubernetes HPA (Horizontal Pod Autoscaler)
- Integration with AWS ECS/Fargate auto-scaling
- Custom metrics exporters for Prometheus/Grafana
- Advanced anomaly detection using ML
- Cost optimization based on job characteristics
- Dynamic priority adjustment based on SLAs
- Circuit breaker patterns for external dependencies
- Chaos engineering tools for testing resilience
