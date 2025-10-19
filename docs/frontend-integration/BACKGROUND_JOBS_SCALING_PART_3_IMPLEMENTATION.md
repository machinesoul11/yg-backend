# Background Jobs Scaling System - Frontend Integration Guide (Part 3: Types & Implementation)

**Module:** Background Jobs Scaling & Monitoring  
**Classification:** 🔒 ADMIN ONLY  
**Last Updated:** October 19, 2025  
**Status:** ✅ Complete

---

## Overview

This document provides all TypeScript type definitions, implementation patterns, and a step-by-step checklist for integrating the Background Jobs Scaling System into the frontend admin dashboard.

---

## 1. Complete TypeScript Type Definitions

### 1.1 Core Types

```typescript
// ============================================================================
// Enums
// ============================================================================

export enum JobPriority {
  CRITICAL = 1,
  HIGH = 3,
  NORMAL = 5,
  LOW = 7,
  BACKGROUND = 10,
}

export type QueueStatus = 'healthy' | 'warning' | 'critical';
export type AlertSeverity = 'warning' | 'critical';
export type AlertType = 'queue_depth' | 'error_rate' | 'timeout_rate' | 'processing_time' | 'memory_usage';
export type ScalingAction = 'scale_up' | 'scale_down' | 'maintain';
export type JobStatus = 'completed' | 'failed' | 'delayed' | 'waiting' | 'active';

// ============================================================================
// Health & Metrics
// ============================================================================

export interface QueueSystemHealthResponse {
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
  memory: MemoryStats;
}

export interface DashboardSummaryResponse {
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

export interface QueueHealthStatus {
  queueName: string;
  healthy: boolean;
  status: QueueStatus;
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

export interface QueueMetricsResponse {
  current: QueueMetrics;
  history?: QueueMetrics[];
}

// ============================================================================
// Alerts
// ============================================================================

export interface Alert {
  id: string;
  severity: AlertSeverity;
  queueName: string;
  type: AlertType;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface AcknowledgeAlertResponse {
  success: boolean;
  alert: Alert;
}

// ============================================================================
// Memory Management
// ============================================================================

export interface MemoryStats {
  heapUsed: number; // MB
  heapTotal: number; // MB
  external: number; // MB
  rss: number; // MB
  arrayBuffers: number; // MB
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

export interface WorkerMemorySummary {
  totalWorkers: number;
  totalJobsProcessed: number;
  averageMemoryUsage: number;
  workersNeedingRecycle: number;
  workers: WorkerMemoryState[];
}

export interface CurrentMemoryResponse {
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

// ============================================================================
// Scaling
// ============================================================================

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

export interface UpdateScalingPolicyRequest {
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

export interface UpdateScalingPolicyResponse {
  success: boolean;
  policy: ScalingPolicy;
}

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
  action: ScalingAction;
  targetWorkers: number;
  currentWorkers: number;
  reason: string;
  metrics: ScalingMetrics;
}

export interface ScalingHistoryResponse {
  queueName: string;
  history: Array<ScalingDecision & { executedAt: Date }>;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfiguration {
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

export interface RateLimitStatusResponse {
  limiterName: string;
  windows: {
    perSecond?: RateLimitWindow;
    perMinute?: RateLimitWindow;
    perHour?: RateLimitWindow;
    perDay?: RateLimitWindow;
  };
}

export interface RateLimitWindow {
  current: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

// ============================================================================
// Timeouts
// ============================================================================

export interface TimeoutConfiguration {
  [queueName: string]: {
    timeout: number; // milliseconds
    adaptiveEnabled: boolean;
    softTimeoutPercentage: number;
  };
}

export interface UpdateTimeoutRequest {
  timeout?: number;
  adaptiveEnabled?: boolean;
}

export interface UpdateTimeoutResponse {
  success: boolean;
  config: {
    queueName: string;
    timeout: number;
    adaptiveEnabled: boolean;
    softTimeoutPercentage: number;
  };
}

export interface ExecutionStatsResponse {
  queueName: string;
  sampleCount: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  recentExecutions: number[];
}

// ============================================================================
// Memory Configuration
// ============================================================================

export interface MemoryConfiguration {
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

// ============================================================================
// Queue Operations
// ============================================================================

export interface QueueControlResponse {
  success: boolean;
  queueName: string;
  status: 'paused' | 'active';
}

export interface CleanQueueRequest {
  status: JobStatus;
  grace?: number; // milliseconds
  limit?: number;
}

export interface CleanQueueResponse {
  success: boolean;
  queueName: string;
  status: string;
  removed: number;
}

export interface RetryFailedJobsResponse {
  success: boolean;
  queueName: string;
  total: number;
  retried: number;
  failed: number;
  errors?: string[];
}

export interface RecycleWorkerRequest {
  reason: string;
  graceful?: boolean;
}

export interface RecycleWorkerResponse {
  success: boolean;
  workerId: string;
  queueName: string;
  status: 'recycling' | 'failed';
  message: string;
}

// ============================================================================
// Error Responses
// ============================================================================

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export type ApiResponse<T> = T | ErrorResponse;

export function isErrorResponse(response: any): response is ErrorResponse {
  return response.success === false;
}
```

---

## 2. API Client Implementation

### 2.1 Base API Client

```typescript
// lib/api/queue-system-client.ts

import { getSession } from 'next-auth/react';

export class QueueSystemApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/admin/queue-system') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const session = await getSession();
    
    if (!session) {
      throw new Error('Not authenticated');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Health & Metrics
  async getSystemHealth(): Promise<QueueSystemHealthResponse> {
    return this.request('/health');
  }

  async getDashboardSummary(): Promise<DashboardSummaryResponse> {
    return this.request('/dashboard');
  }

  async getQueuesHealth(): Promise<QueueHealthStatus[]> {
    return this.request('/queues/health');
  }

  async getQueueMetrics(
    queueName: string,
    options?: { history?: boolean; historyLimit?: number }
  ): Promise<QueueMetricsResponse> {
    const params = new URLSearchParams();
    if (options?.history) params.set('history', 'true');
    if (options?.historyLimit) params.set('historyLimit', String(options.historyLimit));
    
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/queues/${queueName}/metrics${query}`);
  }

  // Alerts
  async getActiveAlerts(filters?: {
    severity?: AlertSeverity;
    queueName?: string;
    acknowledged?: boolean;
  }): Promise<Alert[]> {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.queueName) params.set('queueName', filters.queueName);
    if (filters?.acknowledged !== undefined) params.set('acknowledged', String(filters.acknowledged));
    
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/alerts${query}`);
  }

  async acknowledgeAlert(alertId: string): Promise<AcknowledgeAlertResponse> {
    return this.request(`/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    });
  }

  // Memory
  async getWorkerMemory(): Promise<WorkerMemorySummary> {
    return this.request('/workers/memory');
  }

  async getCurrentMemory(): Promise<CurrentMemoryResponse> {
    return this.request('/memory/current');
  }

  async getMemoryConfig(): Promise<MemoryConfiguration> {
    return this.request('/memory/config');
  }

  // Scaling
  async getScalingPolicies(): Promise<ScalingPolicy[]> {
    return this.request('/scaling/policies');
  }

  async updateScalingPolicy(
    queueName: string,
    update: UpdateScalingPolicyRequest
  ): Promise<UpdateScalingPolicyResponse> {
    return this.request(`/scaling/policies/${queueName}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  async getScalingDecision(queueName: string): Promise<ScalingDecision> {
    return this.request(`/scaling/decision/${queueName}`);
  }

  async getScalingHistory(
    queueName: string,
    options?: { limit?: number; since?: string }
  ): Promise<ScalingHistoryResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.since) params.set('since', options.since);
    
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/scaling/history/${queueName}${query}`);
  }

  // Rate Limits
  async getRateLimitConfig(): Promise<RateLimitConfiguration> {
    return this.request('/rate-limits');
  }

  async getRateLimitStatus(limiterName: string): Promise<RateLimitStatusResponse> {
    return this.request(`/rate-limits/${limiterName}/status`);
  }

  // Timeouts
  async getTimeoutConfig(): Promise<TimeoutConfiguration> {
    return this.request('/timeouts');
  }

  async updateTimeout(
    queueName: string,
    update: UpdateTimeoutRequest
  ): Promise<UpdateTimeoutResponse> {
    return this.request(`/timeouts/${queueName}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  async getExecutionStats(queueName: string): Promise<ExecutionStatsResponse> {
    return this.request(`/queues/${queueName}/execution-stats`);
  }

  // Queue Operations
  async pauseQueue(queueName: string): Promise<QueueControlResponse> {
    return this.request(`/queues/${queueName}/pause`, {
      method: 'POST',
    });
  }

  async resumeQueue(queueName: string): Promise<QueueControlResponse> {
    return this.request(`/queues/${queueName}/resume`, {
      method: 'POST',
    });
  }

  async cleanQueue(
    queueName: string,
    request: CleanQueueRequest
  ): Promise<CleanQueueResponse> {
    return this.request(`/queues/${queueName}/clean`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async retryFailedJobs(
    queueName: string,
    limit?: number
  ): Promise<RetryFailedJobsResponse> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request(`/queues/${queueName}/retry-failed${query}`, {
      method: 'POST',
    });
  }

  async recycleWorker(
    workerId: string,
    request: RecycleWorkerRequest
  ): Promise<RecycleWorkerResponse> {
    return this.request(`/workers/${workerId}/recycle`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
}

// Export singleton instance
export const queueSystemApi = new QueueSystemApiClient();
```

---

## 3. React Query Hooks

### 3.1 Health & Metrics Hooks

```typescript
// hooks/use-queue-system.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueSystemApi } from '@/lib/api/queue-system-client';
import { toast } from 'sonner';

// Dashboard summary
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['queue-system', 'dashboard'],
    queryFn: () => queueSystemApi.getDashboardSummary(),
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 2000,
  });
}

// System health
export function useSystemHealth() {
  return useQuery({
    queryKey: ['queue-system', 'health'],
    queryFn: () => queueSystemApi.getSystemHealth(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

// All queues health
export function useQueuesHealth() {
  return useQuery({
    queryKey: ['queue-system', 'queues', 'health'],
    queryFn: () => queueSystemApi.getQueuesHealth(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

// Single queue metrics
export function useQueueMetrics(
  queueName: string,
  options?: { history?: boolean; historyLimit?: number }
) {
  return useQuery({
    queryKey: ['queue-system', 'queues', queueName, 'metrics', options],
    queryFn: () => queueSystemApi.getQueueMetrics(queueName, options),
    refetchInterval: 10000,
    enabled: !!queueName,
  });
}

// Active alerts
export function useActiveAlerts(filters?: {
  severity?: AlertSeverity;
  queueName?: string;
  acknowledged?: boolean;
}) {
  return useQuery({
    queryKey: ['queue-system', 'alerts', filters],
    queryFn: () => queueSystemApi.getActiveAlerts(filters),
    refetchInterval: 3000, // Poll frequently for alerts
    staleTime: 1000,
  });
}

// Acknowledge alert mutation
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (alertId: string) => queueSystemApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'alerts'] });
      toast.success('Alert acknowledged');
    },
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge alert: ${error.message}`);
    },
  });
}

// Worker memory
export function useWorkerMemory() {
  return useQuery({
    queryKey: ['queue-system', 'workers', 'memory'],
    queryFn: () => queueSystemApi.getWorkerMemory(),
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

// Current system memory
export function useCurrentMemory() {
  return useQuery({
    queryKey: ['queue-system', 'memory', 'current'],
    queryFn: () => queueSystemApi.getCurrentMemory(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}
```

### 3.2 Scaling & Configuration Hooks

```typescript
// Scaling policies
export function useScalingPolicies() {
  return useQuery({
    queryKey: ['queue-system', 'scaling', 'policies'],
    queryFn: () => queueSystemApi.getScalingPolicies(),
    staleTime: 60000, // Configuration changes less frequently
  });
}

// Update scaling policy
export function useUpdateScalingPolicy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({
      queueName,
      update,
    }: {
      queueName: string;
      update: UpdateScalingPolicyRequest;
    }) => queueSystemApi.updateScalingPolicy(queueName, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'scaling'] });
      toast.success('Scaling policy updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update policy: ${error.message}`);
    },
  });
}

// Scaling decision
export function useScalingDecision(queueName: string) {
  return useQuery({
    queryKey: ['queue-system', 'scaling', 'decision', queueName],
    queryFn: () => queueSystemApi.getScalingDecision(queueName),
    enabled: !!queueName,
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

// Scaling history
export function useScalingHistory(
  queueName: string,
  options?: { limit?: number; since?: string }
) {
  return useQuery({
    queryKey: ['queue-system', 'scaling', 'history', queueName, options],
    queryFn: () => queueSystemApi.getScalingHistory(queueName, options),
    enabled: !!queueName,
  });
}

// Rate limit configuration
export function useRateLimitConfig() {
  return useQuery({
    queryKey: ['queue-system', 'rate-limits'],
    queryFn: () => queueSystemApi.getRateLimitConfig(),
    staleTime: 300000, // 5 minutes
  });
}

// Rate limit status
export function useRateLimitStatus(limiterName: string) {
  return useQuery({
    queryKey: ['queue-system', 'rate-limits', limiterName, 'status'],
    queryFn: () => queueSystemApi.getRateLimitStatus(limiterName),
    enabled: !!limiterName,
    refetchInterval: 10000,
  });
}

// Execution stats
export function useExecutionStats(queueName: string) {
  return useQuery({
    queryKey: ['queue-system', 'queues', queueName, 'execution-stats'],
    queryFn: () => queueSystemApi.getExecutionStats(queueName),
    enabled: !!queueName,
    staleTime: 60000,
  });
}
```

### 3.3 Queue Operations Hooks

```typescript
// Pause queue
export function usePauseQueue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (queueName: string) => queueSystemApi.pauseQueue(queueName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'queues'] });
      toast.success(`Queue ${data.queueName} paused`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause queue: ${error.message}`);
    },
  });
}

// Resume queue
export function useResumeQueue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (queueName: string) => queueSystemApi.resumeQueue(queueName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'queues'] });
      toast.success(`Queue ${data.queueName} resumed`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to resume queue: ${error.message}`);
    },
  });
}

// Clean queue
export function useCleanQueue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({
      queueName,
      request,
    }: {
      queueName: string;
      request: CleanQueueRequest;
    }) => queueSystemApi.cleanQueue(queueName, request),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'queues'] });
      toast.success(`Removed ${data.removed} jobs from ${data.queueName}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to clean queue: ${error.message}`);
    },
  });
}

// Retry failed jobs
export function useRetryFailedJobs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({
      queueName,
      limit,
    }: {
      queueName: string;
      limit?: number;
    }) => queueSystemApi.retryFailedJobs(queueName, limit),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'queues'] });
      toast.success(`Retried ${data.retried} jobs from ${data.queueName}`);
      if (data.failed > 0) {
        toast.warning(`${data.failed} jobs could not be retried`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to retry jobs: ${error.message}`);
    },
  });
}

// Recycle worker
export function useRecycleWorker() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({
      workerId,
      request,
    }: {
      workerId: string;
      request: RecycleWorkerRequest;
    }) => queueSystemApi.recycleWorker(workerId, request),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-system', 'workers'] });
      toast.success(`Worker ${data.workerId} recycling initiated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to recycle worker: ${error.message}`);
    },
  });
}
```

---

## 4. Component Examples

### 4.1 Dashboard Overview Component

```typescript
// components/queue-system/DashboardOverview.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useDashboardSummary } from '@/hooks/use-queue-system';

export function DashboardOverview() {
  const { data, isLoading } = useDashboardSummary();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!data) {
    return <div>No data available</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Queues</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.totalQueues}</div>
          <p className="text-xs text-muted-foreground">
            {data.healthyQueues} healthy, {data.warningQueues} warning
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.totalActive}</div>
          <p className="text-xs text-muted-foreground">
            {data.totalWaiting} waiting
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.activeAlerts}</div>
          <Badge variant={data.activeAlerts > 0 ? 'destructive' : 'secondary'}>
            {data.activeAlerts > 0 ? 'Attention Required' : 'All Clear'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Jobs/Minute</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {Math.round(data.avgJobsPerMinute)}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.avgErrorRate.toFixed(1)}% error rate
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4.2 Alerts List Component

```typescript
// components/queue-system/AlertsList.tsx

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useActiveAlerts, useAcknowledgeAlert } from '@/hooks/use-queue-system';
import type { Alert } from '@/types/queue-system';

export function AlertsList() {
  const { data: alerts, isLoading } = useActiveAlerts({ acknowledged: false });
  const acknowledgeMutation = useAcknowledgeAlert();

  if (isLoading) return <div>Loading alerts...</div>;
  if (!alerts || alerts.length === 0) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <p className="mt-2 text-lg font-medium">No Active Alerts</p>
        <p className="text-sm text-muted-foreground">All systems operating normally</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onAcknowledge={() => acknowledgeMutation.mutate(alert.id)}
        />
      ))}
    </div>
  );
}

function AlertItem({
  alert,
  onAcknowledge,
}: {
  alert: Alert;
  onAcknowledge: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`h-5 w-5 ${
              alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                {alert.severity}
              </Badge>
              <Badge variant="outline">{alert.queueName}</Badge>
              <Badge variant="secondary">{alert.type}</Badge>
            </div>
            <p className="mt-1 font-medium">{alert.message}</p>
            <p className="text-sm text-muted-foreground">
              Value: {alert.value} / Threshold: {alert.threshold}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onAcknowledge}>
          Acknowledge
        </Button>
      </div>
    </Card>
  );
}
```

### 4.3 Queue Health Status Component

```typescript
// components/queue-system/QueueHealthStatus.tsx

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { useQueuesHealth } from '@/hooks/use-queue-system';
import type { QueueHealthStatus, QueueStatus } from '@/types/queue-system';

export function QueueHealthStatus() {
  const { data: queues, isLoading } = useQueuesHealth();

  if (isLoading) return <div>Loading queue status...</div>;
  if (!queues) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Health Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {queues.map((queue) => (
            <QueueStatusRow key={queue.queueName} queue={queue} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QueueStatusRow({ queue }: { queue: QueueHealthStatus }) {
  const getStatusIcon = (status: QueueStatus) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: QueueStatus) => {
    const variant = {
      healthy: 'default' as const,
      warning: 'default' as const,
      critical: 'destructive' as const,
    };
    return <Badge variant={variant[status]}>{status}</Badge>;
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {getStatusIcon(queue.status)}
        <div>
          <p className="font-medium">{queue.queueName}</p>
          {queue.issues.length > 0 && (
            <p className="text-sm text-muted-foreground">{queue.issues.join(', ')}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <p className="text-muted-foreground">Waiting</p>
          <p className="font-medium">{queue.metrics.waiting}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Active</p>
          <p className="font-medium">{queue.metrics.active}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Failed</p>
          <p className="font-medium">{queue.metrics.failed}</p>
        </div>
        {getStatusBadge(queue.status)}
      </div>
    </div>
  );
}
```

---

## 5. Frontend Implementation Checklist

### Phase 1: Setup & Basic Monitoring (Week 1)

- [ ] **Setup API client**
  - [ ] Create `QueueSystemApiClient` class
  - [ ] Add error handling and retry logic
  - [ ] Test authentication flow

- [ ] **Create React Query hooks**
  - [ ] Dashboard summary hook
  - [ ] System health hook
  - [ ] Queues health hook
  - [ ] Alerts hooks

- [ ] **Build dashboard overview page**
  - [ ] Create main dashboard layout
  - [ ] Add dashboard overview cards
  - [ ] Implement queue health status list
  - [ ] Add alerts panel

### Phase 2: Detailed Monitoring (Week 2)

- [ ] **Queue details page**
  - [ ] Create queue detail view with metrics
  - [ ] Add execution time charts (P50, P95, P99)
  - [ ] Show historical metrics graphs
  - [ ] Display queue operations controls

- [ ] **Alerts management**
  - [ ] Build alerts list view
  - [ ] Add alert acknowledgment functionality
  - [ ] Implement alert filtering
  - [ ] Add alert history view

- [ ] **Memory monitoring**
  - [ ] Worker memory status table
  - [ ] Current system memory display
  - [ ] Memory usage charts
  - [ ] Worker recycle controls

### Phase 3: Configuration & Management (Week 3)

- [ ] **Scaling configuration**
  - [ ] Scaling policies list view
  - [ ] Policy editor form with validation
  - [ ] Scaling decision preview
  - [ ] Scaling history timeline

- [ ] **Rate limit monitoring**
  - [ ] Rate limit configuration display
  - [ ] Current usage visualizations
  - [ ] Rate limit status by service
  - [ ] Historical rate limit charts

- [ ] **Queue operations**
  - [ ] Pause/resume queue controls
  - [ ] Clean queue modal with confirmation
  - [ ] Retry failed jobs interface
  - [ ] Bulk operations support

### Phase 4: Advanced Features (Week 4)

- [ ] **Real-time updates**
  - [ ] Optimize polling intervals
  - [ ] Add connection status indicator
  - [ ] Implement auto-pause when inactive
  - [ ] Add manual refresh button

- [ ] **Data visualization**
  - [ ] Create reusable chart components
  - [ ] Add time range selectors
  - [ ] Implement metric comparisons
  - [ ] Add export functionality

- [ ] **User experience**
  - [ ] Add loading skeletons
  - [ ] Implement error boundaries
  - [ ] Add empty states
  - [ ] Create responsive layouts

---

## 6. Testing Checklist

### Unit Tests

- [ ] API client methods
- [ ] React Query hooks
- [ ] Validation functions
- [ ] Utility functions

### Integration Tests

- [ ] Dashboard data flow
- [ ] Alert acknowledgment flow
- [ ] Queue operation flows
- [ ] Configuration update flows

### E2E Tests

- [ ] Complete monitoring workflow
- [ ] Alert management workflow
- [ ] Scaling configuration workflow
- [ ] Queue operations workflow

---

## 7. Edge Cases to Handle

### Data Loading States
- Show skeleton loaders during initial load
- Show stale data indicator when refetching
- Handle missing data gracefully

### Error States
- Network errors (retry with exponential backoff)
- Authentication errors (redirect to login)
- Permission errors (show appropriate message)
- Validation errors (show field-level errors)

### Empty States
- No queues registered
- No active alerts
- No workers running
- No historical data

### Stale Data
- Show last updated timestamp
- Add manual refresh button
- Pause polling when tab inactive
- Resume polling when tab active

### Long-Running Operations
- Show progress indicators
- Allow cancellation if possible
- Provide feedback on completion
- Handle timeouts gracefully

---

## 8. Performance Considerations

### Polling Optimization

```typescript
// Pause polling when document hidden
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      queryClient.cancelQueries();
    } else {
      queryClient.invalidateQueries();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [queryClient]);
```

### Data Pagination

```typescript
// For large datasets, implement pagination
export function useScalingHistory(queueName: string) {
  return useInfiniteQuery({
    queryKey: ['queue-system', 'scaling', 'history', queueName],
    queryFn: ({ pageParam = 0 }) =>
      queueSystemApi.getScalingHistory(queueName, {
        limit: 50,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.history.length < 50) return undefined;
      return pages.length * 50;
    },
  });
}
```

### Memoization

```typescript
// Memoize expensive calculations
const processedMetrics = useMemo(() => {
  if (!metrics) return null;
  return calculateDerivedMetrics(metrics);
}, [metrics]);
```

---

## 9. Security Considerations

### Authentication
- Always check authentication before API calls
- Redirect to login on 401 errors
- Handle session expiration gracefully

### Authorization
- Verify admin role on every request
- Don't expose sensitive data in error messages
- Log unauthorized access attempts

### Input Validation
- Validate all user inputs on frontend
- Sanitize data before sending to API
- Use TypeScript for type safety

### Rate Limiting
- Implement client-side rate limiting
- Show warning when approaching limits
- Queue requests during rate limit

---

## 10. Accessibility Guidelines

- Use semantic HTML elements
- Add ARIA labels to interactive elements
- Ensure keyboard navigation works
- Maintain sufficient color contrast
- Provide text alternatives for charts
- Support screen readers

---

## Questions?

For implementation support:
- Backend documentation: [BACKGROUND_JOBS_SCALING_COMPLETE.md](../BACKGROUND_JOBS_SCALING_COMPLETE.md)
- Quick reference: [BACKGROUND_JOBS_SCALING_QUICK_REFERENCE.md](../BACKGROUND_JOBS_SCALING_QUICK_REFERENCE.md)
- Part 1: [Monitoring & Health APIs](./BACKGROUND_JOBS_SCALING_PART_1_MONITORING.md)
- Part 2: [Configuration & Management APIs](./BACKGROUND_JOBS_SCALING_PART_2_CONFIGURATION.md)

Contact the backend team for clarification or additional requirements.
