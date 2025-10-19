# Background Jobs Scaling System - Frontend Integration Guide (Part 2: Configuration & Management)

**Module:** Background Jobs Scaling & Monitoring  
**Classification:** 🔒 ADMIN ONLY  
**Last Updated:** October 19, 2025  
**Status:** ✅ Complete

---

## Overview

This document covers the configuration and management APIs for the Background Jobs Scaling System. These endpoints allow admins to control scaling behavior, adjust rate limits, manage timeouts, and trigger manual operations.

---

## 1. Scaling Management APIs

### 1.1 Get Scaling Policies

**Endpoint:** `GET /api/admin/queue-system/scaling/policies`  
**Auth:** Required (Admin only)  
**Purpose:** Get scaling policies for all registered queues

> ⚠️ **Note:** This endpoint is not yet implemented. Use `scalingManager.getScalingPolicies()` from `@/lib/queue/scaling-manager.ts`.

**Response Schema:**

```typescript
interface ScalingPolicy {
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

type ScalingPoliciesResponse = ScalingPolicy[];
```

**Example Response:**

```json
[
  {
    "queueName": "notification-delivery",
    "minWorkers": 2,
    "maxWorkers": 20,
    "scaleUpThreshold": {
      "queueDepth": 100,
      "queueLatencyMs": 30000,
      "memoryPercent": 80
    },
    "scaleDownThreshold": {
      "queueDepth": 10,
      "queueLatencyMs": 5000,
      "memoryPercent": 40
    },
    "cooldownSeconds": {
      "scaleUp": 60,
      "scaleDown": 300
    }
  },
  {
    "queueName": "email-campaigns",
    "minWorkers": 1,
    "maxWorkers": 10,
    "scaleUpThreshold": {
      "queueDepth": 50,
      "queueLatencyMs": 60000,
      "memoryPercent": 75
    },
    "scaleDownThreshold": {
      "queueDepth": 5,
      "queueLatencyMs": 10000,
      "memoryPercent": 30
    },
    "cooldownSeconds": {
      "scaleUp": 60,
      "scaleDown": 300
    }
  }
]
```

---

### 1.2 Update Scaling Policy

**Endpoint:** `PATCH /api/admin/queue-system/scaling/policies/:queueName`  
**Auth:** Required (Admin only)  
**Purpose:** Update scaling policy for a specific queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use `scalingManager.updatePolicy()`.

**Request Body:**

```typescript
interface UpdateScalingPolicyRequest {
  minWorkers?: number;
  maxWorkers?: number;
  scaleUpThreshold?: {
    queueDepth?: number;
    queueLatencyMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
  };
  scaleDownThreshold?: {
    queueDepth?: number;
    queueLatencyMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
  };
  cooldownSeconds?: {
    scaleUp?: number;
    scaleDown?: number;
  };
}
```

**Example Request:**

```json
{
  "maxWorkers": 15,
  "scaleUpThreshold": {
    "queueDepth": 75
  }
}
```

**Response Schema:**

```typescript
interface UpdateScalingPolicyResponse {
  success: boolean;
  policy: ScalingPolicy;
}
```

**Validation Rules:**
- `minWorkers` must be ≥ 1
- `maxWorkers` must be > `minWorkers`
- `maxWorkers` cannot exceed 50 (system limit)
- `queueDepth` thresholds must be positive
- `queueLatencyMs` must be ≥ 1000 (1 second)
- `cooldownSeconds` must be ≥ 10

---

### 1.3 Get Scaling Decision

**Endpoint:** `GET /api/admin/queue-system/scaling/decision/:queueName`  
**Auth:** Required (Admin only)  
**Purpose:** Get current scaling decision for a queue (without executing it)

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use `scalingManager.makeScalingDecision()`.

**Response Schema:**

```typescript
interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  targetWorkers: number;
  currentWorkers: number;
  reason: string;
  metrics: ScalingMetrics;
}

interface ScalingMetrics {
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
```

**Example Response:**

```json
{
  "action": "scale_up",
  "targetWorkers": 12,
  "currentWorkers": 10,
  "reason": "Queue depth: 215 >= 100",
  "metrics": {
    "queueName": "email-campaigns",
    "queueDepth": 215,
    "queueLatencyMs": 45000,
    "activeJobs": 10,
    "completedRate": 28,
    "errorRate": 2.3,
    "currentWorkers": 10,
    "memoryUsage": 65,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### 1.4 Get Scaling History

**Endpoint:** `GET /api/admin/queue-system/scaling/history/:queueName`  
**Auth:** Required (Admin only)  
**Purpose:** Get historical scaling decisions for a queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

**Query Parameters:**
- `limit` (number, optional) - Number of records (default: 100, max: 1000)
- `since` (ISO 8601 date, optional) - Only return decisions after this date

> ⚠️ **Note:** This endpoint is not yet implemented. Use `scalingManager.getScalingHistory()`.

**Response Schema:**

```typescript
interface ScalingHistoryResponse {
  queueName: string;
  history: Array<ScalingDecision & { executedAt: Date }>;
}
```

**Example Response:**

```json
{
  "queueName": "email-campaigns",
  "history": [
    {
      "action": "scale_up",
      "targetWorkers": 12,
      "currentWorkers": 10,
      "reason": "Queue depth: 215 >= 100",
      "metrics": { "queueDepth": 215, "queueLatencyMs": 45000 },
      "executedAt": "2025-10-19T11:45:00.000Z"
    },
    {
      "action": "scale_down",
      "targetWorkers": 8,
      "currentWorkers": 12,
      "reason": "Queue depth: 8 <= 10",
      "metrics": { "queueDepth": 8, "queueLatencyMs": 3200 },
      "executedAt": "2025-10-19T10:20:00.000Z"
    }
  ]
}
```

---

## 2. Rate Limiter Configuration

### 2.1 Get Rate Limit Configuration

**Endpoint:** `GET /api/admin/queue-system/rate-limits`  
**Auth:** Required (Admin only)  
**Purpose:** Get all configured rate limits

> ⚠️ **Note:** This endpoint is not yet implemented. Return values from `RATE_LIMITS` config.

**Response Schema:**

```typescript
interface RateLimitConfiguration {
  emailSending: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  emailCampaign: {
    perMinute: number;
    perHour: number;
  };
  stripeApi: {
    perSecond: number;
    perHour: number;
  };
  resendApi: {
    perSecond: number;
    perHour: number;
  };
  databaseWrites: {
    perSecond: number;
    perMinute: number;
  };
  searchIndexing: {
    perSecond: number;
    perMinute: number;
  };
  assetProcessing: {
    perMinute: number;
    perHour: number;
  };
  taxGeneration: {
    perMinute: number;
    perHour: number;
  };
}
```

**Example Response:**

```json
{
  "emailSending": {
    "perMinute": 300,
    "perHour": 10000,
    "perDay": 100000
  },
  "emailCampaign": {
    "perMinute": 100,
    "perHour": 5000
  },
  "stripeApi": {
    "perSecond": 100,
    "perHour": 100000
  },
  "resendApi": {
    "perSecond": 10,
    "perHour": 3000
  },
  "databaseWrites": {
    "perSecond": 100,
    "perMinute": 5000
  },
  "searchIndexing": {
    "perSecond": 50,
    "perMinute": 2000
  },
  "assetProcessing": {
    "perMinute": 20,
    "perHour": 1000
  },
  "taxGeneration": {
    "perMinute": 10,
    "perHour": 500
  }
}
```

---

### 2.2 Check Rate Limit Status

**Endpoint:** `GET /api/admin/queue-system/rate-limits/:limiterName/status`  
**Auth:** Required (Admin only)  
**Purpose:** Check current status of a rate limiter

**URL Parameters:**
- `limiterName` (string, required) - Name of the rate limiter
  - Valid values: `emailSending`, `emailCampaign`, `stripeApi`, `resendApi`, `databaseWrites`, `searchIndexing`, `assetProcessing`, `taxGeneration`

> ⚠️ **Note:** This endpoint is not yet implemented. Query Redis directly for rate limit keys.

**Response Schema:**

```typescript
interface RateLimitStatusResponse {
  limiterName: string;
  windows: {
    perSecond?: {
      current: number;
      limit: number;
      remaining: number;
      resetAt: Date;
    };
    perMinute?: {
      current: number;
      limit: number;
      remaining: number;
      resetAt: Date;
    };
    perHour?: {
      current: number;
      limit: number;
      remaining: number;
      resetAt: Date;
    };
    perDay?: {
      current: number;
      limit: number;
      remaining: number;
      resetAt: Date;
    };
  };
}
```

**Example Response:**

```json
{
  "limiterName": "emailSending",
  "windows": {
    "perMinute": {
      "current": 145,
      "limit": 300,
      "remaining": 155,
      "resetAt": "2025-10-19T12:01:00.000Z"
    },
    "perHour": {
      "current": 4567,
      "limit": 10000,
      "remaining": 5433,
      "resetAt": "2025-10-19T13:00:00.000Z"
    },
    "perDay": {
      "current": 23451,
      "limit": 100000,
      "remaining": 76549,
      "resetAt": "2025-10-20T00:00:00.000Z"
    }
  }
}
```

---

## 3. Timeout Configuration

### 3.1 Get Timeout Configuration

**Endpoint:** `GET /api/admin/queue-system/timeouts`  
**Auth:** Required (Admin only)  
**Purpose:** Get configured timeouts for all job types

> ⚠️ **Note:** This endpoint is not yet implemented. Return values from `TIMEOUTS` config.

**Response Schema:**

```typescript
interface TimeoutConfiguration {
  [queueName: string]: {
    timeout: number; // milliseconds
    adaptiveEnabled: boolean;
    softTimeoutPercentage: number; // percentage of hard timeout
  };
}
```

**Example Response:**

```json
{
  "notification-delivery": {
    "timeout": 30000,
    "adaptiveEnabled": true,
    "softTimeoutPercentage": 80
  },
  "email-delivery": {
    "timeout": 60000,
    "adaptiveEnabled": true,
    "softTimeoutPercentage": 80
  },
  "pdf-generation": {
    "timeout": 600000,
    "adaptiveEnabled": true,
    "softTimeoutPercentage": 80
  },
  "search-full-reindex": {
    "timeout": 3600000,
    "adaptiveEnabled": false,
    "softTimeoutPercentage": 80
  }
}
```

---

### 3.2 Update Timeout Configuration

**Endpoint:** `PATCH /api/admin/queue-system/timeouts/:queueName`  
**Auth:** Required (Admin only)  
**Purpose:** Update timeout settings for a specific queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Would require modifying environment variables or config file.

**Request Body:**

```typescript
interface UpdateTimeoutRequest {
  timeout?: number; // milliseconds
  adaptiveEnabled?: boolean;
}
```

**Example Request:**

```json
{
  "timeout": 300000,
  "adaptiveEnabled": true
}
```

**Validation Rules:**
- `timeout` must be ≥ 1000 (1 second)
- `timeout` cannot exceed 7200000 (2 hours)
- Cannot disable adaptive timeouts for critical queues

**Response Schema:**

```typescript
interface UpdateTimeoutResponse {
  success: boolean;
  config: {
    queueName: string;
    timeout: number;
    adaptiveEnabled: boolean;
    softTimeoutPercentage: number;
  };
}
```

---

## 4. Memory Management

### 4.1 Get Memory Configuration

**Endpoint:** `GET /api/admin/queue-system/memory/config`  
**Auth:** Required (Admin only)  
**Purpose:** Get memory limit configuration

> ⚠️ **Note:** This endpoint is not yet implemented. Return values from `MEMORY_LIMITS` config.

**Response Schema:**

```typescript
interface MemoryConfiguration {
  worker: {
    softLimit: number; // MB
    hardLimit: number; // MB
    warningThreshold: number; // percentage
  };
  jobSpecific: {
    [queueName: string]: number; // MB
  };
  recycling: {
    afterJobs: number;
    afterHours: number;
  };
}
```

**Example Response:**

```json
{
  "worker": {
    "softLimit": 512,
    "hardLimit": 1024,
    "warningThreshold": 75
  },
  "jobSpecific": {
    "asset-processing": 2048,
    "pdf-generation": 1024,
    "search-full-reindex": 2048,
    "bulk-email-campaign": 1024
  },
  "recycling": {
    "afterJobs": 1000,
    "afterHours": 4
  }
}
```

---

### 4.2 Trigger Worker Recycle

**Endpoint:** `POST /api/admin/queue-system/workers/:workerId/recycle`  
**Auth:** Required (Admin only)  
**Purpose:** Manually trigger a worker to recycle (graceful restart)

**URL Parameters:**
- `workerId` (string, required) - ID of the worker

> ⚠️ **Note:** This endpoint is not yet implemented. Would need orchestration system integration.

**Request Body:**

```typescript
interface RecycleWorkerRequest {
  reason: string; // Required: reason for manual recycle
  graceful?: boolean; // Default: true
}
```

**Example Request:**

```json
{
  "reason": "Manual recycle - suspected memory leak",
  "graceful": true
}
```

**Response Schema:**

```typescript
interface RecycleWorkerResponse {
  success: boolean;
  workerId: string;
  queueName: string;
  status: 'recycling' | 'failed';
  message: string;
}
```

---

## 5. Queue Control Operations

### 5.1 Pause Queue

**Endpoint:** `POST /api/admin/queue-system/queues/:queueName/pause`  
**Auth:** Required (Admin only)  
**Purpose:** Pause job processing for a queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use BullMQ's `queue.pause()`.

**Response Schema:**

```typescript
interface QueueControlResponse {
  success: boolean;
  queueName: string;
  status: 'paused' | 'active';
}
```

**Example Response:**

```json
{
  "success": true,
  "queueName": "email-campaigns",
  "status": "paused"
}
```

---

### 5.2 Resume Queue

**Endpoint:** `POST /api/admin/queue-system/queues/:queueName/resume`  
**Auth:** Required (Admin only)  
**Purpose:** Resume job processing for a paused queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

> ⚠️ **Note:** This endpoint is not yet implemented. Use BullMQ's `queue.resume()`.

**Response Schema:**

```typescript
interface QueueControlResponse {
  success: boolean;
  queueName: string;
  status: 'paused' | 'active';
}
```

---

### 5.3 Clean Queue

**Endpoint:** `POST /api/admin/queue-system/queues/:queueName/clean`  
**Auth:** Required (Admin only)  
**Purpose:** Remove jobs from a queue based on status

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

**Request Body:**

```typescript
interface CleanQueueRequest {
  status: 'completed' | 'failed' | 'delayed' | 'waiting';
  grace?: number; // Grace period in milliseconds (default: 0)
  limit?: number; // Max number of jobs to clean (default: 1000)
}
```

**Example Request:**

```json
{
  "status": "failed",
  "grace": 86400000,
  "limit": 500
}
```

> ⚠️ **Note:** This endpoint is not yet implemented. Use BullMQ's `queue.clean()`.

**Response Schema:**

```typescript
interface CleanQueueResponse {
  success: boolean;
  queueName: string;
  status: string;
  removed: number;
}
```

**Example Response:**

```json
{
  "success": true,
  "queueName": "email-campaigns",
  "status": "failed",
  "removed": 234
}
```

**Caution:**
- Cleaning `waiting` or `delayed` jobs will prevent them from executing
- Always use a grace period for failed jobs to allow for debugging
- Limit the number of jobs cleaned to prevent Redis performance issues

---

### 5.4 Retry Failed Jobs

**Endpoint:** `POST /api/admin/queue-system/queues/:queueName/retry-failed`  
**Auth:** Required (Admin only)  
**Purpose:** Retry all failed jobs in a queue

**URL Parameters:**
- `queueName` (string, required) - Name of the queue

**Query Parameters:**
- `limit` (number, optional) - Max jobs to retry (default: 100)

> ⚠️ **Note:** This endpoint is not yet implemented. Iterate through failed jobs and call `job.retry()`.

**Response Schema:**

```typescript
interface RetryFailedJobsResponse {
  success: boolean;
  queueName: string;
  total: number;
  retried: number;
  failed: number;
  errors?: string[];
}
```

**Example Response:**

```json
{
  "success": true,
  "queueName": "email-campaigns",
  "total": 15,
  "retried": 14,
  "failed": 1,
  "errors": [
    "Job 12345: Already at max attempts"
  ]
}
```

---

## 6. Configuration Best Practices

### 6.1 Scaling Thresholds

**Critical Queues (Notifications, Payments):**
```typescript
{
  minWorkers: 2,
  maxWorkers: 20,
  scaleUpThreshold: {
    queueDepth: 50,      // Scale quickly
    queueLatencyMs: 10000 // 10 second latency
  },
  scaleDownThreshold: {
    queueDepth: 5,
    queueLatencyMs: 2000  // 2 seconds
  }
}
```

**High Priority Queues (Emails, Search):**
```typescript
{
  minWorkers: 1,
  maxWorkers: 10,
  scaleUpThreshold: {
    queueDepth: 100,
    queueLatencyMs: 30000 // 30 seconds
  },
  scaleDownThreshold: {
    queueDepth: 10,
    queueLatencyMs: 5000
  }
}
```

**Background Queues (Cleanup, Maintenance):**
```typescript
{
  minWorkers: 1,
  maxWorkers: 3,
  scaleUpThreshold: {
    queueDepth: 500,      // Allow large queues
    queueLatencyMs: 300000 // 5 minutes OK
  },
  scaleDownThreshold: {
    queueDepth: 50,
    queueLatencyMs: 60000
  }
}
```

---

### 6.2 Rate Limit Guidelines

**External API Limits:**
Always set internal limits **below** the provider's limits to account for:
- Other systems using the same API
- Burst traffic
- API quota tracking delays

```typescript
// Example: Stripe allows 100/second
{
  stripeApi: {
    perSecond: 80,  // 80% of limit
    perHour: 90000  // 90% of hourly limit
  }
}
```

**Database Writes:**
Based on your database capacity and other services:

```typescript
{
  databaseWrites: {
    perSecond: 100,  // Adjust based on DB load testing
    perMinute: 5000
  }
}
```

---

### 6.3 Timeout Guidelines

**User-facing operations:**
- Keep under 30 seconds
- Use adaptive timeouts
- Show progress indicators in UI

**Background processing:**
- Can be longer (5-30 minutes)
- Still use adaptive timeouts
- Monitor P95/P99 metrics

**Maintenance tasks:**
- Can be 1-2 hours
- Consider disabling adaptive timeouts
- Run during low-traffic periods

---

## 7. Business Logic & Rules

### 7.1 Scaling Cooldown

**Rule:** After a scaling action, wait for cooldown period before next action

**Reason:** Prevents thrashing and allows system to stabilize

**Implementation:**
- Scale-up cooldown: 60 seconds (default)
- Scale-down cooldown: 300 seconds (5 minutes, conservative)
- Critical queues may have shorter cooldowns

**Frontend Consideration:**
- Show "cooldown in progress" status
- Display countdown timer
- Disable manual scale buttons during cooldown

---

### 7.2 Worker Recycling Rules

**Automatic Recycling Triggers:**
1. **Memory limit exceeded** - Critical limit (1024MB default)
2. **Job count threshold** - After 1000 jobs processed
3. **Uptime threshold** - After 4 hours
4. **Manual trigger** - Admin-initiated

**Recycling Process:**
1. Stop accepting new jobs
2. Finish current jobs (up to 30 seconds)
3. Terminate worker
4. Orchestrator starts new worker

**Frontend Consideration:**
- Show worker status: `active`, `recycling`, `starting`
- Don't alarm users - recycling is normal
- Show recycling reason in worker details

---

### 7.3 Alert Acknowledgment

**Rule:** Alerts must be acknowledged by an admin

**Behavior:**
- Acknowledged alerts don't trigger notifications
- Acknowledgment expires after 1 hour (auto-revert if issue persists)
- Track who acknowledged and when

**Frontend Consideration:**
- Show acknowledgment status
- Display acknowledger name and time
- Auto-refresh to catch expired acknowledgments

---

## 8. Error Handling

### Configuration Update Errors

```typescript
// Invalid worker count
{
  "success": false,
  "error": "maxWorkers must be greater than minWorkers",
  "code": "INVALID_WORKER_COUNT"
}

// Exceeds system limit
{
  "success": false,
  "error": "maxWorkers cannot exceed 50",
  "code": "EXCEEDS_SYSTEM_LIMIT"
}

// Invalid rate limit
{
  "success": false,
  "error": "Rate limit must be at least 1",
  "code": "INVALID_RATE_LIMIT"
}

// Invalid timeout
{
  "success": false,
  "error": "Timeout must be at least 1000ms",
  "code": "INVALID_TIMEOUT"
}
```

### Queue Operation Errors

```typescript
// Queue not found
{
  "success": false,
  "error": "Queue not found",
  "code": "QUEUE_NOT_FOUND"
}

// Queue already paused
{
  "success": false,
  "error": "Queue is already paused",
  "code": "QUEUE_ALREADY_PAUSED"
}

// Worker not found
{
  "success": false,
  "error": "Worker not found",
  "code": "WORKER_NOT_FOUND"
}
```

---

## 9. Next Steps

Continue to:
- **[Part 3: TypeScript Types & Implementation](./BACKGROUND_JOBS_SCALING_PART_3_IMPLEMENTATION.md)** - Complete type definitions, implementation checklist, code examples

Go back to:
- **[Part 1: Monitoring & Health APIs](./BACKGROUND_JOBS_SCALING_PART_1_MONITORING.md)** - Health checks, metrics, alerts

---

## Quick Reference: Queue Names

All registered queues in the system:

| Queue Name | Priority | Default Concurrency |
|------------|----------|---------------------|
| `password-reset` | CRITICAL (1) | 10 |
| `payment-processing` | CRITICAL (1) | 5 |
| `notification-delivery` | CRITICAL (1) | 10 |
| `scheduled-emails` | HIGH (3) | 15 |
| `email-retry` | HIGH (3) | 8 |
| `search-index-realtime` | HIGH (3) | 20 |
| `notification-digest` | HIGH (3) | 5 |
| `tax-document-generation` | HIGH (3) | 5 |
| `email-campaigns` | NORMAL (5) | 10 |
| `asset-processing` | NORMAL (5) | 8 |
| `analytics-events` | NORMAL (5) | 5 |
| `tax-form-processing` | NORMAL (5) | 3 |
| `message-delivery` | NORMAL (5) | 8 |
| `license-management` | NORMAL (5) | 3 |
| `payout-processing` | NORMAL (5) | 3 |
| `cache-maintenance` | LOW (7) | 2 |
| `search-index-bulk` | LOW (7) | 5 |
| `metrics-rollup` | LOW (7) | 2 |
| `scheduled-blog-publishing` | LOW (7) | 1 |
| `deliverability-monitoring` | LOW (7) | 1 |
| `royalty-calculation` | LOW (7) | 5 |
| `session-cleanup` | BACKGROUND (10) | 1 |
| `token-cleanup` | BACKGROUND (10) | 1 |
| `asset-cleanup` | BACKGROUND (10) | 2 |
| `upload-cleanup` | BACKGROUND (10) | 2 |
| `search-reindex` | BACKGROUND (10) | 1 |
| `event-deduplication` | BACKGROUND (10) | 1 |

---

**Questions?** Contact the backend team or refer to the complete documentation.
