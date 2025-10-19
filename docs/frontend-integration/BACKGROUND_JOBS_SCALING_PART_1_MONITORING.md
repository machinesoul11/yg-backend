# Background Jobs Scaling System - Frontend Integration Guide (Part 1: Monitoring & Health)

**Module:** Background Jobs Scaling & Monitoring  
**Classification:** 🔒 ADMIN ONLY  
**Last Updated:** October 19, 2025  
**Status:** ✅ Complete

---

## Overview

The Background Jobs Scaling System provides comprehensive infrastructure for managing background job workers at scale. This includes:

- **Worker Concurrency Management** - Dynamic worker allocation based on job priority
- **Priority Queue System** - Five-tier priority classification (Critical → Background)
- **Rate Limiting** - Distributed rate limiting for external APIs and internal operations
- **Memory Management** - Automatic worker recycling and memory limit enforcement
- **Timeout Handling** - Adaptive timeouts with soft/hard limits and execution statistics
- **Horizontal Scaling** - Auto-scaling decisions based on queue depth, latency, and resource usage
- **Comprehensive Monitoring** - Real-time metrics, alerting, and health tracking

This is an **admin-only** system for monitoring and managing backend infrastructure. No public-facing components.

---

## 1. Queue System Health API

### 1.1 Get Overall System Health

**Endpoint:** `GET /api/admin/queue-system/health`  
**Auth:** Required (Admin only)  
**Purpose:** Get comprehensive health status of the entire queue system

> ⚠️ **Note:** This endpoint is not yet implemented. You'll need to create it using the existing `getQueueSystemHealth()` function from `@/lib/queue/index.ts`.

**Response Schema:**

```typescript
interface QueueSystemHealthResponse {
  timestamp: Date;
  healthy: boolean;
  queues: {
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
  };
  workers: {
    totalWorkers: number;
    totalJobsProcessed: number;
    averageMemoryUsage: number;
    workersNeedingRecycle: number;
  };
  memory: {
    heapUsed: number; // MB
    heapTotal: number; // MB
    external: number; // MB
    rss: number; // MB
    arrayBuffers: number; // MB
    percentage: number;
    timestamp: Date;
  };
}
```

**Example Response:**

```json
{
  "timestamp": "2025-10-19T12:00:00.000Z",
  "healthy": true,
  "queues": {
    "totalQueues": 28,
    "healthyQueues": 26,
    "warningQueues": 2,
    "criticalQueues": 0,
    "totalWaiting": 145,
    "totalActive": 23,
    "totalFailed": 3,
    "activeAlerts": 1,
    "avgJobsPerMinute": 287,
    "avgErrorRate": 1.2
  },
  "workers": {
    "totalWorkers": 8,
    "totalJobsProcessed": 45678,
    "averageMemoryUsage": 512,
    "workersNeedingRecycle": 1
  },
  "memory": {
    "heapUsed": 487,
    "heapTotal": 1024,
    "external": 23,
    "rss": 623,
    "arrayBuffers": 12,
    "percentage": 47,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (not admin)
- `500` - Internal server error

---

### 1.2 Get Dashboard Summary

**Endpoint:** `GET /api/admin/queue-system/dashboard`  
**Auth:** Required (Admin only)  
**Purpose:** Get high-level metrics for admin dashboard

> ⚠️ **Note:** This endpoint is not yet implemented. Use `queueMonitor.getDashboardSummary()` from `@/lib/queue/monitoring.ts`.

**Response Schema:**

```typescript
interface DashboardSummaryResponse {
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
  timestamp: Date;
}
```

**Example Response:**

```json
{
  "totalQueues": 28,
  "healthyQueues": 26,
  "warningQueues": 2,
  "criticalQueues": 0,
  "totalWaiting": 145,
  "totalActive": 23,
  "totalFailed": 3,
  "activeAlerts": 1,
  "avgJobsPerMinute": 287,
  "avgErrorRate": 1.2,
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

---

## 2. Queue Health & Metrics APIs

### 2.1 Get Health Status for All Queues

**Endpoint:** `GET /api/admin/queue-system/queues/health`  
**Auth:** Required (Admin only)  
**Purpose:** Get detailed health status for every queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use `queueMonitor.getHealthStatus()` from `@/lib/queue/monitoring.ts`.

**Response Schema:**

```typescript
interface QueueHealthStatus {
  queueName: string;
  healthy: boolean;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: QueueMetrics;
  timestamp: Date;
}

interface QueueMetrics {
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

type QueuesHealthResponse = QueueHealthStatus[];
```

**Example Response:**

```json
[
  {
    "queueName": "notification-delivery",
    "healthy": true,
    "status": "healthy",
    "issues": [],
    "metrics": {
      "queueName": "notification-delivery",
      "waiting": 5,
      "active": 3,
      "delayed": 0,
      "failed": 1,
      "completed": 12453,
      "jobsPerMinute": 45,
      "errorRate": 0.8,
      "timeoutRate": 0.1,
      "avgProcessingTimeMs": 234,
      "p50ProcessingTimeMs": 210,
      "p95ProcessingTimeMs": 450,
      "p99ProcessingTimeMs": 890,
      "oldestWaitingMs": 3400,
      "memoryUsageMB": 128,
      "memoryPercentage": 12,
      "timestamp": "2025-10-19T12:00:00.000Z"
    },
    "timestamp": "2025-10-19T12:00:00.000Z"
  },
  {
    "queueName": "email-campaigns",
    "healthy": false,
    "status": "warning",
    "issues": ["Queue depth above warning threshold (215 > 200)"],
    "metrics": {
      "queueName": "email-campaigns",
      "waiting": 215,
      "active": 10,
      "delayed": 50,
      "failed": 5,
      "completed": 8921,
      "jobsPerMinute": 28,
      "errorRate": 2.3,
      "timeoutRate": 0.5,
      "avgProcessingTimeMs": 1850,
      "p50ProcessingTimeMs": 1650,
      "p95ProcessingTimeMs": 3200,
      "p99ProcessingTimeMs": 5600,
      "oldestWaitingMs": 45000,
      "memoryUsageMB": 256,
      "memoryPercentage": 25,
      "timestamp": "2025-10-19T12:00:00.000Z"
    },
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
]
```

---

### 2.2 Get Metrics for Specific Queue

**Endpoint:** `GET /api/admin/queue-system/queues/:queueName/metrics`  
**Auth:** Required (Admin only)  
**Purpose:** Get detailed metrics for a single queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

**Query Parameters:**
- `history` (boolean, optional) - Include historical metrics (default: false)
- `historyLimit` (number, optional) - Number of historical data points (default: 100, max: 1000)

> ⚠️ **Note:** This endpoint is not yet implemented. Use `queueMonitor.collectQueueMetrics()` and `queueMonitor.getMetricsHistory()`.

**Response Schema:**

```typescript
interface QueueMetricsResponse {
  current: QueueMetrics;
  history?: QueueMetrics[]; // If history=true
}
```

**Example Request:**

```
GET /api/admin/queue-system/queues/email-campaigns/metrics?history=true&historyLimit=50
```

**Example Response:**

```json
{
  "current": {
    "queueName": "email-campaigns",
    "waiting": 215,
    "active": 10,
    "delayed": 50,
    "failed": 5,
    "completed": 8921,
    "jobsPerMinute": 28,
    "errorRate": 2.3,
    "timeoutRate": 0.5,
    "avgProcessingTimeMs": 1850,
    "p50ProcessingTimeMs": 1650,
    "p95ProcessingTimeMs": 3200,
    "p99ProcessingTimeMs": 5600,
    "oldestWaitingMs": 45000,
    "memoryUsageMB": 256,
    "memoryPercentage": 25,
    "timestamp": "2025-10-19T12:00:00.000Z"
  },
  "history": [
    {
      "queueName": "email-campaigns",
      "waiting": 198,
      "active": 8,
      "jobsPerMinute": 32,
      "errorRate": 1.8,
      "timestamp": "2025-10-19T11:59:00.000Z"
    }
    // ... 49 more historical data points
  ]
}
```

---

## 3. Alerting APIs

### 3.1 Get Active Alerts

**Endpoint:** `GET /api/admin/queue-system/alerts`  
**Auth:** Required (Admin only)  
**Purpose:** Get all active alerts across the queue system

**Query Parameters:**
- `severity` (string, optional) - Filter by severity: `warning` or `critical`
- `queueName` (string, optional) - Filter by specific queue
- `acknowledged` (boolean, optional) - Filter by acknowledgment status (default: false, only unacknowledged)

> ⚠️ **Note:** This endpoint is not yet implemented. Use `queueMonitor.getActiveAlerts()` from `@/lib/queue/monitoring.ts`.

**Response Schema:**

```typescript
interface Alert {
  id: string;
  severity: 'warning' | 'critical';
  queueName: string;
  type: 'queue_depth' | 'error_rate' | 'timeout_rate' | 'processing_time' | 'memory_usage';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

type AlertsResponse = Alert[];
```

**Example Response:**

```json
[
  {
    "id": "alert-1729342800-email-campaigns-queue_depth",
    "severity": "warning",
    "queueName": "email-campaigns",
    "type": "queue_depth",
    "message": "Queue depth above warning threshold",
    "value": 215,
    "threshold": 200,
    "timestamp": "2025-10-19T11:55:00.000Z",
    "acknowledged": false
  },
  {
    "id": "alert-1729342920-asset-processing-memory_usage",
    "severity": "critical",
    "queueName": "asset-processing",
    "type": "memory_usage",
    "message": "Worker memory usage critical",
    "value": 1850,
    "threshold": 1024,
    "timestamp": "2025-10-19T11:57:00.000Z",
    "acknowledged": false
  }
]
```

---

### 3.2 Acknowledge Alert

**Endpoint:** `POST /api/admin/queue-system/alerts/:alertId/acknowledge`  
**Auth:** Required (Admin only)  
**Purpose:** Mark an alert as acknowledged

**URL Parameters:**
- `alertId` (string, required) - ID of the alert

> ⚠️ **Note:** This endpoint is not yet implemented. Use `queueMonitor.acknowledgeAlert()`.

**Response Schema:**

```typescript
interface AcknowledgeAlertResponse {
  success: boolean;
  alert: Alert;
}
```

**Example Response:**

```json
{
  "success": true,
  "alert": {
    "id": "alert-1729342800-email-campaigns-queue_depth",
    "severity": "warning",
    "queueName": "email-campaigns",
    "type": "queue_depth",
    "message": "Queue depth above warning threshold",
    "value": 215,
    "threshold": 200,
    "timestamp": "2025-10-19T11:55:00.000Z",
    "acknowledged": true,
    "acknowledgedBy": "admin@yesgoddess.com",
    "acknowledgedAt": "2025-10-19T12:05:00.000Z"
  }
}
```

---

## 4. Memory Monitoring APIs

### 4.1 Get Worker Memory Status

**Endpoint:** `GET /api/admin/queue-system/workers/memory`  
**Auth:** Required (Admin only)  
**Purpose:** Get memory usage for all workers

> ⚠️ **Note:** This endpoint is not yet implemented. Use `memoryMonitor.getSummary()` from `@/lib/queue/memory-monitor.ts`.

**Response Schema:**

```typescript
interface WorkerMemorySummary {
  totalWorkers: number;
  totalJobsProcessed: number;
  averageMemoryUsage: number;
  workersNeedingRecycle: number;
  workers: WorkerMemoryState[];
}

interface WorkerMemoryState {
  workerId: string;
  queueName: string;
  jobsProcessed: number;
  startTime: Date;
  lastMemoryCheck: MemoryStats;
  shouldRecycle: boolean;
  recycleReason?: string;
}

interface MemoryStats {
  heapUsed: number; // MB
  heapTotal: number; // MB
  external: number; // MB
  rss: number; // MB
  arrayBuffers: number; // MB
  percentage: number;
  timestamp: Date;
}
```

**Example Response:**

```json
{
  "totalWorkers": 8,
  "totalJobsProcessed": 45678,
  "averageMemoryUsage": 512,
  "workersNeedingRecycle": 1,
  "workers": [
    {
      "workerId": "worker-email-1",
      "queueName": "email-campaigns",
      "jobsProcessed": 8234,
      "startTime": "2025-10-19T06:00:00.000Z",
      "lastMemoryCheck": {
        "heapUsed": 456,
        "heapTotal": 1024,
        "external": 23,
        "rss": 578,
        "arrayBuffers": 12,
        "percentage": 44,
        "timestamp": "2025-10-19T12:00:00.000Z"
      },
      "shouldRecycle": false
    },
    {
      "workerId": "worker-asset-2",
      "queueName": "asset-processing",
      "jobsProcessed": 1243,
      "startTime": "2025-10-19T08:00:00.000Z",
      "lastMemoryCheck": {
        "heapUsed": 1850,
        "heapTotal": 2048,
        "external": 156,
        "rss": 2100,
        "arrayBuffers": 89,
        "percentage": 90,
        "timestamp": "2025-10-19T12:00:00.000Z"
      },
      "shouldRecycle": true,
      "recycleReason": "Critical memory limit exceeded: 1850MB > 1024MB"
    }
  ]
}
```

---

### 4.2 Get Current System Memory

**Endpoint:** `GET /api/admin/queue-system/memory/current`  
**Auth:** Required (Admin only)  
**Purpose:** Get current system memory usage

> ⚠️ **Note:** This endpoint is not yet implemented. Use `memoryMonitor.getCurrentMemoryStats()`.

**Response Schema:**

```typescript
interface CurrentMemoryResponse {
  stats: MemoryStats;
  limits: {
    softLimitMB: number;
    hardLimitMB: number;
    warningThresholdPercent: number;
  };
  status: {
    withinLimits: boolean;
    exceedsWarning: boolean;
    exceedsCritical: boolean;
  };
}
```

**Example Response:**

```json
{
  "stats": {
    "heapUsed": 487,
    "heapTotal": 1024,
    "external": 23,
    "rss": 623,
    "arrayBuffers": 12,
    "percentage": 47,
    "timestamp": "2025-10-19T12:00:00.000Z"
  },
  "limits": {
    "softLimitMB": 512,
    "hardLimitMB": 1024,
    "warningThresholdPercent": 75
  },
  "status": {
    "withinLimits": true,
    "exceedsWarning": false,
    "exceedsCritical": false
  }
}
```

---

## 5. Execution Statistics APIs

### 5.1 Get Execution Stats for Queue

**Endpoint:** `GET /api/admin/queue-system/queues/:queueName/execution-stats`  
**Auth:** Required (Admin only)  
**Purpose:** Get detailed execution time statistics for a queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use `timeoutHandler.getExecutionStats()` from `@/lib/queue/timeout-handler.ts`.

**Response Schema:**

```typescript
interface ExecutionStatsResponse {
  queueName: string;
  sampleCount: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  recentExecutions: number[]; // Last 100 execution times
}
```

**Example Response:**

```json
{
  "queueName": "email-campaigns",
  "sampleCount": 8921,
  "min": 234,
  "max": 12450,
  "avg": 1850,
  "p50": 1650,
  "p95": 3200,
  "p99": 5600,
  "recentExecutions": [1650, 1780, 1590, 2100, ...]
}
```

---

## 6. Real-time Updates

### 6.1 Polling Recommendations

Since this is an admin monitoring dashboard, **polling** is the recommended approach:

**Recommended Polling Intervals:**

```typescript
// Dashboard overview - less frequent
const DASHBOARD_POLL_INTERVAL = 5000; // 5 seconds

// Queue health status - moderate
const QUEUE_HEALTH_POLL_INTERVAL = 10000; // 10 seconds

// Active alerts - frequent for critical monitoring
const ALERTS_POLL_INTERVAL = 3000; // 3 seconds

// Memory status - moderate
const MEMORY_POLL_INTERVAL = 15000; // 15 seconds
```

**Implementation Pattern:**

```typescript
import { useQuery } from '@tanstack/react-query';

function useDashboardSummary() {
  return useQuery({
    queryKey: ['queue-system', 'dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/admin/queue-system/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard');
      return res.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 2000, // Consider data stale after 2 seconds
  });
}

function useActiveAlerts() {
  return useQuery({
    queryKey: ['queue-system', 'alerts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/queue-system/alerts?acknowledged=false');
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds for alerts
  });
}
```

### 6.2 WebSocket Support (Future)

WebSocket support is **not currently implemented** but could be added in the future for real-time push updates:

```typescript
// Future WebSocket events (not implemented)
interface QueueSystemWebSocketEvents {
  'alert:created': Alert;
  'alert:acknowledged': Alert;
  'queue:health-changed': QueueHealthStatus;
  'worker:recycled': { workerId: string; queueName: string };
  'memory:warning': MemoryStats;
  'memory:critical': MemoryStats;
}
```

---

## 7. Error Handling

### Standard Error Response

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}
```

### Error Codes

| HTTP Status | Code | Meaning | User Message |
|-------------|------|---------|--------------|
| 400 | `INVALID_QUEUE_NAME` | Queue name not found | "Queue not found" |
| 400 | `INVALID_PARAMETERS` | Invalid query parameters | "Invalid request parameters" |
| 401 | `UNAUTHORIZED` | Not authenticated | "Please log in to continue" |
| 403 | `FORBIDDEN` | Not admin | "Admin access required" |
| 404 | `ALERT_NOT_FOUND` | Alert ID doesn't exist | "Alert not found" |
| 500 | `REDIS_ERROR` | Redis connection error | "Monitoring system temporarily unavailable" |
| 500 | `INTERNAL_ERROR` | Unexpected error | "An error occurred. Please try again." |

### Error Handling Example

```typescript
async function fetchQueueHealth(queueName: string) {
  try {
    const res = await fetch(`/api/admin/queue-system/queues/${queueName}/metrics`);
    
    if (!res.ok) {
      const error = await res.json();
      
      switch (res.status) {
        case 401:
          // Redirect to login
          window.location.href = '/login';
          break;
        case 403:
          // Show permission error
          toast.error('Admin access required');
          break;
        case 404:
          toast.error('Queue not found');
          break;
        default:
          toast.error('Failed to load queue metrics');
      }
      
      throw new Error(error.error);
    }
    
    return res.json();
  } catch (error) {
    console.error('Error fetching queue health:', error);
    throw error;
  }
}
```

---

## 8. Authorization & Permissions

### Role Requirements

**All endpoints require:**
- ✅ Authenticated session
- ✅ Admin role (`role: 'ADMIN'`)

**Role Check:**

```typescript
// Backend middleware pattern (example)
async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 403 }
    );
  }
  
  return session;
}
```

---

## 9. Rate Limiting

### API Rate Limits

All monitoring APIs share the same rate limit:

- **Limit:** 300 requests per minute per admin user
- **Scope:** Per user (not global)
- **Headers:** Standard rate limit headers included

**Rate Limit Headers:**

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 2025-10-19T12:01:00.000Z
```

**429 Response:**

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 15
}
```

---

## Next Steps

Continue to:
- **[Part 2: Configuration & Management APIs](./BACKGROUND_JOBS_SCALING_PART_2_CONFIGURATION.md)** - Scaling controls, rate limiter configuration, timeout management
- **[Part 3: TypeScript Types & Implementation](./BACKGROUND_JOBS_SCALING_PART_3_IMPLEMENTATION.md)** - Complete type definitions, implementation checklist, code examples

---

## Quick Reference: Key Concepts

| Concept | Description |
|---------|-------------|
| **Queue Priority** | 5 levels: Critical (1) → High (3) → Normal (5) → Low (7) → Background (10) |
| **Queue Status** | `healthy`, `warning`, `critical` |
| **Alert Severity** | `warning`, `critical` |
| **Alert Types** | `queue_depth`, `error_rate`, `timeout_rate`, `processing_time`, `memory_usage` |
| **Memory Limits** | Soft: 512MB, Hard: 1024MB (configurable per job type) |
| **Worker Recycling** | After 1000 jobs or 4 hours uptime (prevents memory leaks) |
| **Metrics Retention** | 7 days (configurable) |
| **Polling Intervals** | Dashboard: 5s, Alerts: 3s, Memory: 15s |

---

**Questions?** Contact the backend team or refer to:
- [Background Jobs Scaling Complete Documentation](../BACKGROUND_JOBS_SCALING_COMPLETE.md)
- [Background Jobs Scaling Quick Reference](../BACKGROUND_JOBS_SCALING_QUICK_REFERENCE.md)
