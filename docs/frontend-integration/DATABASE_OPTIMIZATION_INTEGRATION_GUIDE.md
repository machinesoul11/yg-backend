# Database Optimization - Frontend Integration Guide

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and monitoring interface

**Version:** 1.0.0  
**Last Updated:** October 19, 2025  
**Module Status:** ✅ Completed

---

## Table of Contents
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting](#rate-limiting)
8. [Real-time Updates](#real-time-updates)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Monitoring Dashboard Design](#monitoring-dashboard-design)

---

## Overview

The Database Optimization module provides infrastructure-level monitoring and health check capabilities for the YesGoddess platform. This module enables administrators to monitor database performance, connection pooling, query optimization, and overall database health in real-time.

### Key Features
- **Connection Pool Monitoring**: Track active, idle, and total database connections
- **Query Performance Metrics**: Monitor average, P95, and P99 query execution times
- **Slow Query Detection**: Identify and track queries exceeding performance thresholds
- **Index Usage Analysis**: Understand which indexes are being utilized
- **Database Size Tracking**: Monitor storage usage and largest tables
- **Read Replica Support**: Separate read/write operations for optimal performance
- **Health Check Endpoints**: Public and admin-facing health check APIs

### Architecture
- **Primary Database**: Write operations and critical reads
- **Read Replica**: Read-only operations for analytics and reporting
- **Connection Pooling**: PgBouncer-compatible pooling configuration
- **Query Monitoring**: Real-time tracking with configurable thresholds

---

## API Endpoints

### 1. Public Health Check

**Endpoint:** `GET /api/health/database`

**Purpose:** Basic database connectivity check for external monitoring systems (Vercel, uptime monitors, etc.)

**Authentication:** Optional Bearer token (configure `HEALTH_CHECK_TOKEN` for security)

**Request Headers:**
```typescript
{
  'Authorization': 'Bearer <HEALTH_CHECK_TOKEN>' // Optional, recommended for production
}
```

**Response (200 OK - Healthy):**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string; // ISO 8601 datetime
  database: {
    primary: {
      connected: boolean;
      latency: number; // milliseconds
    };
    replica: {
      connected: boolean;
      latency: number; // milliseconds
    };
  };
  metrics: {
    queries: {
      total: number;
      slow: number;
      failed: number;
    };
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    performance: {
      avgQueryTime: number; // milliseconds
      p95QueryTime: number; // milliseconds
      p99QueryTime: number; // milliseconds
    };
  };
}
```

**Response (503 Service Unavailable - Unhealthy):**
```typescript
{
  status: 'unhealthy';
  timestamp: string;
  error: string;
}
```

**Response (401 Unauthorized):**
```typescript
{
  error: 'Unauthorized';
}
```

---

### 2. Admin Database Metrics

**Endpoint:** `GET /api/admin/database/metrics`

**Purpose:** Detailed database performance metrics for admin dashboard

**Authentication:** Required (Admin role)

**Authorization:** `ADMIN` role only

**Response (200 OK):**
```typescript
{
  timestamp: string; // ISO 8601 datetime
  metrics: {
    queries: {
      total: number;         // Total queries in last 60 seconds
      slow: number;          // Slow queries (>1000ms)
      failed: number;        // Failed queries
    };
    connections: {
      active: number;        // Currently executing queries
      idle: number;          // Idle connections in pool
      total: number;         // Total connections
    };
    performance: {
      avgQueryTime: number;  // Average query time (ms)
      p95QueryTime: number;  // 95th percentile (ms)
      p99QueryTime: number;  // 99th percentile (ms)
    };
  };
  size: {
    databaseSize: string;    // e.g., "1.2 GB"
    tableCount: number;      // Total number of tables
    largestTables: Array<{
      table: string;         // e.g., "public.licenses"
      size: string;          // e.g., "450 MB"
    }>;
  };
  slowQueries: Array<{
    model: string;           // Prisma model name
    operation: string;       // SQL operation (SELECT, UPDATE, etc.)
    duration: number;        // Query duration in milliseconds
    timestamp: Date;         // When the query was executed
  }>;
  indexUsage: Array<{
    table: string;           // Table name (e.g., "public.users")
    index: string;           // Index name
    scans: number;           // Number of index scans
    tuples: number;          // Number of tuples read
  }>;
}
```

**Response (500 Internal Server Error):**
```typescript
{
  error: 'Failed to fetch database metrics';
  message: string;
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Database health status
 */
export enum DatabaseStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Database connection types
 */
export enum ConnectionType {
  PRIMARY = 'primary',
  REPLICA = 'replica'
}

/**
 * Public health check response
 */
export interface DatabaseHealthResponse {
  status: DatabaseStatus;
  timestamp: string;
  database: {
    primary: ConnectionHealth;
    replica: ConnectionHealth;
  };
  metrics: DatabaseMetricsSummary;
}

/**
 * Connection health details
 */
export interface ConnectionHealth {
  connected: boolean;
  latency: number; // milliseconds
}

/**
 * Database metrics summary
 */
export interface DatabaseMetricsSummary {
  queries: QueryMetrics;
  connections: ConnectionMetrics;
  performance: PerformanceMetrics;
}

/**
 * Query execution metrics
 */
export interface QueryMetrics {
  total: number;
  slow: number;
  failed: number;
}

/**
 * Connection pool metrics
 */
export interface ConnectionMetrics {
  active: number;
  idle: number;
  total: number;
}

/**
 * Query performance metrics
 */
export interface PerformanceMetrics {
  avgQueryTime: number;
  p95QueryTime: number;
  p99QueryTime: number;
}

/**
 * Detailed admin metrics response
 */
export interface DatabaseMetricsResponse {
  timestamp: string;
  metrics: DatabaseMetricsSummary;
  size: DatabaseSizeInfo;
  slowQueries: SlowQuery[];
  indexUsage: IndexUsageInfo[];
}

/**
 * Database size information
 */
export interface DatabaseSizeInfo {
  databaseSize: string;
  tableCount: number;
  largestTables: TableSizeInfo[];
}

/**
 * Individual table size
 */
export interface TableSizeInfo {
  table: string;
  size: string;
}

/**
 * Slow query details
 */
export interface SlowQuery {
  model: string;
  operation: string;
  duration: number;
  timestamp: Date;
}

/**
 * Index usage statistics
 */
export interface IndexUsageInfo {
  table: string;
  index: string;
  scans: number;
  tuples: number;
}

/**
 * Connection pool configuration (for display/monitoring)
 */
export interface ConnectionPoolConfig {
  poolMode: 'session' | 'transaction' | 'statement';
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number; // seconds
  idleTimeout: number; // seconds
  statementTimeout: number; // milliseconds
}

/**
 * Health check error response
 */
export interface DatabaseHealthError {
  status: 'unhealthy';
  timestamp: string;
  error: string;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

/**
 * Health check response schema
 */
export const DatabaseHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  database: z.object({
    primary: z.object({
      connected: z.boolean(),
      latency: z.number().nonnegative(),
    }),
    replica: z.object({
      connected: z.boolean(),
      latency: z.number().nonnegative(),
    }),
  }),
  metrics: z.object({
    queries: z.object({
      total: z.number().int().nonnegative(),
      slow: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    connections: z.object({
      active: z.number().int().nonnegative(),
      idle: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    performance: z.object({
      avgQueryTime: z.number().nonnegative(),
      p95QueryTime: z.number().nonnegative(),
      p99QueryTime: z.number().nonnegative(),
    }),
  }),
});

/**
 * Admin metrics response schema
 */
export const DatabaseMetricsSchema = z.object({
  timestamp: z.string().datetime(),
  metrics: z.object({
    queries: z.object({
      total: z.number().int().nonnegative(),
      slow: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    connections: z.object({
      active: z.number().int().nonnegative(),
      idle: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    performance: z.object({
      avgQueryTime: z.number().nonnegative(),
      p95QueryTime: z.number().nonnegative(),
      p99QueryTime: z.number().nonnegative(),
    }),
  }),
  size: z.object({
    databaseSize: z.string(),
    tableCount: z.number().int().nonnegative(),
    largestTables: z.array(z.object({
      table: z.string(),
      size: z.string(),
    })),
  }),
  slowQueries: z.array(z.object({
    model: z.string(),
    operation: z.string(),
    duration: z.number().nonnegative(),
    timestamp: z.coerce.date(),
  })),
  indexUsage: z.array(z.object({
    table: z.string(),
    index: z.string(),
    scans: z.number().int().nonnegative(),
    tuples: z.number().int().nonnegative(),
  })),
});
```

---

## Business Logic & Validation Rules

### Health Status Determination

The health status is calculated based on database connectivity:

```typescript
/**
 * Calculate overall database health status
 */
function calculateHealthStatus(
  primaryConnected: boolean,
  replicaConnected: boolean
): DatabaseStatus {
  if (primaryConnected && replicaConnected) {
    return DatabaseStatus.HEALTHY;
  }
  
  if (primaryConnected && !replicaConnected) {
    // Replica down but primary operational = degraded
    return DatabaseStatus.DEGRADED;
  }
  
  // Primary database down = unhealthy
  return DatabaseStatus.UNHEALTHY;
}
```

### Performance Thresholds

These thresholds are used to categorize query performance:

| Metric | Threshold | Severity |
|--------|-----------|----------|
| Slow Query | > 1000ms | Warning |
| P95 Query Time | > 500ms | Warning |
| P99 Query Time | > 2000ms | Critical |
| Connection Pool Usage | > 80% | Warning |
| Connection Pool Usage | > 95% | Critical |
| Failed Queries | > 10 in 60s | Critical |

### Metrics Window

All metrics are calculated over a **60-second rolling window**. This means:
- Metrics refresh every second
- Only queries from the last 60 seconds are included
- Old metrics are automatically purged

### Connection Pool Capacity Calculation

```typescript
/**
 * Calculate connection pool usage percentage
 */
function calculatePoolUsage(metrics: ConnectionMetrics): number {
  // Note: maxConnections comes from environment configuration
  const maxConnections = 10; // Default from CONNECTION_POOL_CONFIG
  return (metrics.total / maxConnections) * 100;
}

/**
 * Determine pool health status
 */
function getPoolHealthStatus(usagePercent: number): 'healthy' | 'warning' | 'critical' {
  if (usagePercent >= 95) return 'critical';
  if (usagePercent >= 80) return 'warning';
  return 'healthy';
}
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| `200` | OK | Health check successful, metrics retrieved |
| `401` | Unauthorized | Missing or invalid health check token |
| `403` | Forbidden | User lacks admin permissions for metrics endpoint |
| `500` | Internal Server Error | Metrics collection failed |
| `503` | Service Unavailable | Database is unhealthy |

### Error Response Format

All error responses follow this structure:

```typescript
interface ErrorResponse {
  error: string;        // Short error identifier
  message?: string;     // Detailed error message (optional)
  timestamp?: string;   // ISO timestamp (for health checks)
}
```

### Frontend Error Handling

```typescript
/**
 * Fetch database health with error handling
 */
async function fetchDatabaseHealth(): Promise<DatabaseHealthResponse> {
  try {
    const response = await fetch('/api/health/database', {
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_HEALTH_CHECK_TOKEN || ''}`
      }
    });

    if (!response.ok) {
      if (response.status === 503) {
        // Database is unhealthy but API is responding
        const error: DatabaseHealthError = await response.json();
        throw new DatabaseUnhealthyError(error);
      }
      
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DatabaseUnhealthyError) {
      // Show specific "database down" UI
      throw error;
    }
    
    // Network error or API completely down
    throw new Error('Unable to reach database health check endpoint');
  }
}

/**
 * Custom error for unhealthy database
 */
class DatabaseUnhealthyError extends Error {
  constructor(public details: DatabaseHealthError) {
    super('Database is unhealthy');
    this.name = 'DatabaseUnhealthyError';
  }
}
```

### User-Friendly Error Messages

Map technical errors to user-friendly messages:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  'Unauthorized': 'You do not have permission to view database metrics.',
  'Failed to fetch database metrics': 'Unable to load database metrics. Please try again.',
  'Database is unhealthy': 'Database connection issues detected. Our team has been notified.',
  'Unable to reach health check endpoint': 'Connection error. Please check your network.',
};

function getUserFriendlyError(error: Error): string {
  return ERROR_MESSAGES[error.message] || 'An unexpected error occurred. Please try again.';
}
```

---

## Authorization & Permissions

### Endpoint Access Control

| Endpoint | Roles Allowed | Notes |
|----------|---------------|-------|
| `GET /api/health/database` | **Public** (with optional token) | External monitoring systems |
| `GET /api/admin/database/metrics` | **ADMIN** only | Sensitive performance data |

### User Roles

```typescript
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER'
}
```

### Authorization Implementation

```typescript
/**
 * Check if user can access database metrics
 */
function canAccessDatabaseMetrics(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

/**
 * React Query hook with authorization
 */
function useDatabaseMetrics() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['database', 'metrics'],
    queryFn: fetchDatabaseMetrics,
    enabled: user?.role === UserRole.ADMIN,
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}
```

### Token-Based Authentication (Health Check)

The public health check endpoint supports optional Bearer token authentication:

**Environment Variables:**
- Backend: `HEALTH_CHECK_TOKEN` - Server-side token for validation
- Frontend: `NEXT_PUBLIC_HEALTH_CHECK_TOKEN` - Client-side token (optional, for external monitoring)

**Security Recommendations:**
- ✅ Enable token auth for production deployments
- ✅ Use long, randomly generated tokens
- ✅ Rotate tokens periodically
- ❌ Don't expose sensitive metrics on public endpoint
- ❌ Don't use health check token for admin endpoints

---

## Rate Limiting

### Public Health Check Endpoint

| Limit Type | Threshold | Window |
|------------|-----------|--------|
| Per IP | 60 requests | 1 minute |
| Per Token | 300 requests | 5 minutes |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1634567890
```

### Admin Metrics Endpoint

| Limit Type | Threshold | Window |
|------------|-----------|--------|
| Per User | 120 requests | 1 minute |

**Recommendations:**
- Use React Query with `refetchInterval` of 5-10 seconds
- Implement exponential backoff on errors
- Cache results client-side
- Don't poll more frequently than needed

### Frontend Rate Limit Handling

```typescript
/**
 * React Query configuration with rate limit handling
 */
function useDatabaseMetricsWithRateLimit() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['database', 'metrics'],
    queryFn: fetchDatabaseMetrics,
    enabled: user?.role === UserRole.ADMIN,
    refetchInterval: 10000, // 10 seconds = safe rate
    retry: (failureCount, error) => {
      // Don't retry on rate limit errors
      if (error.response?.status === 429) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff: 1s, 2s, 4s
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
  });
}
```

---

## Real-time Updates

### Polling Strategy

Since this module doesn't use WebSockets, implement polling for real-time metrics:

**Recommended Polling Intervals:**

| Use Case | Interval | Reason |
|----------|----------|--------|
| Admin Dashboard (active) | 5 seconds | Near real-time monitoring |
| Admin Dashboard (background) | 30 seconds | Reduced load when tab inactive |
| Status Page Widget | 60 seconds | Less critical, reduce server load |

### React Query Polling Implementation

```typescript
import { useQuery } from '@tanstack/react-query';
import { usePageVisibility } from '@/hooks/usePageVisibility';

/**
 * Smart polling based on page visibility
 */
function useDatabaseMetricsPolling() {
  const isVisible = usePageVisibility();
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['database', 'metrics'],
    queryFn: fetchDatabaseMetrics,
    enabled: user?.role === UserRole.ADMIN,
    
    // Adaptive polling based on visibility
    refetchInterval: isVisible ? 5000 : 30000,
    
    // Refetch on window focus
    refetchOnWindowFocus: true,
    
    // Keep data fresh
    staleTime: 4000, // Consider stale after 4s
  });
}

/**
 * Page visibility hook
 */
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  
  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  
  return isVisible;
}
```

### Manual Refresh

Provide a manual refresh button for users who want immediate updates:

```typescript
function DatabaseMetricsDashboard() {
  const { data, isLoading, refetch } = useDatabaseMetricsPolling();
  
  return (
    <div>
      <button onClick={() => refetch()} disabled={isLoading}>
        {isLoading ? 'Refreshing...' : 'Refresh Now'}
      </button>
      
      {data && <MetricsDisplay data={data} />}
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Health Monitoring

- [ ] **Create API client functions**
  - [ ] `fetchDatabaseHealth()` for public health check
  - [ ] `fetchDatabaseMetrics()` for admin metrics
  - [ ] Add proper TypeScript types from this guide
  - [ ] Implement error handling and retries

- [ ] **Set up React Query hooks**
  - [ ] `useDatabaseHealth()` hook with polling
  - [ ] `useDatabaseMetrics()` hook with authorization
  - [ ] Configure appropriate polling intervals
  - [ ] Implement page visibility detection

- [ ] **Create health status indicator component**
  - [ ] Color-coded badge (green/yellow/red)
  - [ ] Show connection latency
  - [ ] Primary/replica status
  - [ ] Last updated timestamp

### Phase 2: Admin Dashboard

- [ ] **Create database metrics dashboard page** (`/admin/database`)
  - [ ] Protect route with admin-only middleware
  - [ ] Header with refresh button and last update time
  - [ ] Layout with metric cards/sections

- [ ] **Query performance section**
  - [ ] Total queries counter
  - [ ] Slow queries counter with warning indicator
  - [ ] Failed queries counter
  - [ ] Chart/graph for query time trends (avg, P95, P99)

- [ ] **Connection pool monitoring**
  - [ ] Active connections gauge
  - [ ] Idle connections display
  - [ ] Total connections vs. max capacity
  - [ ] Usage percentage with color coding
  - [ ] Warning indicators at 80% and 95%

- [ ] **Database size information**
  - [ ] Total database size display
  - [ ] Table count
  - [ ] Largest tables list with sizes
  - [ ] Storage usage trend (future enhancement)

- [ ] **Slow queries table**
  - [ ] List of recent slow queries
  - [ ] Sortable by duration
  - [ ] Show model, operation, duration, timestamp
  - [ ] "No slow queries" empty state
  - [ ] Export to CSV option (optional)

- [ ] **Index usage analysis**
  - [ ] Table of indexes with usage statistics
  - [ ] Sort by scans/tuples
  - [ ] Highlight unused indexes (0 scans)
  - [ ] Recommendation badges

### Phase 3: Monitoring & Alerts

- [ ] **Status indicators in global navigation**
  - [ ] Small database health indicator in admin nav
  - [ ] Show warning/error badge when degraded/unhealthy
  - [ ] Click to view full dashboard

- [ ] **Alert system**
  - [ ] Toast notifications for critical issues
  - [ ] Browser notifications (with permission)
  - [ ] Alert when database becomes unhealthy
  - [ ] Alert when connection pool usage exceeds 95%
  - [ ] Alert for excessive slow queries

- [ ] **Error boundary for database issues**
  - [ ] Catch errors from database failures
  - [ ] Show user-friendly error page
  - [ ] Provide admin contact information
  - [ ] Include retry button

### Phase 4: Developer Experience

- [ ] **Loading states**
  - [ ] Skeleton loaders for metrics cards
  - [ ] Shimmer effect during refresh
  - [ ] Progress indicators

- [ ] **Empty states**
  - [ ] "No slow queries detected" message
  - [ ] "Index usage data unavailable" fallback
  - [ ] Helpful illustrations

- [ ] **Accessibility**
  - [ ] ARIA labels for status indicators
  - [ ] Keyboard navigation for dashboard
  - [ ] Screen reader announcements for alerts
  - [ ] High contrast mode support

- [ ] **Responsive design**
  - [ ] Mobile-friendly layout
  - [ ] Collapsible sections on small screens
  - [ ] Touch-friendly controls
  - [ ] Horizontal scroll for tables

### Phase 5: Advanced Features (Optional)

- [ ] **Historical metrics (requires backend changes)**
  - [ ] Store metrics snapshots over time
  - [ ] Charts showing trends
  - [ ] Date range selector
  - [ ] Export historical data

- [ ] **Custom alerts**
  - [ ] User-configurable alert thresholds
  - [ ] Email/Slack notifications
  - [ ] Alert preferences page

- [ ] **Query optimizer recommendations**
  - [ ] Analyze slow queries
  - [ ] Suggest index additions
  - [ ] Identify N+1 query issues

---

## Monitoring Dashboard Design

### Recommended Layout

```
┌─────────────────────────────────────────────────────────┐
│  Database Monitoring                    [Refresh] 🔄     │
│  Last updated: 2 seconds ago                             │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Status      │  │  Latency     │  │  Connections │  │
│  │  ● HEALTHY   │  │  12ms / 15ms │  │  8 / 10      │  │
│  │  Primary ✓   │  │  Pri / Rep   │  │  80% Used    │  │
│  │  Replica ✓   │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  Query Performance (Last 60 seconds)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Total Queries: 1,234                            │   │
│  │  Slow Queries: 3 ⚠️                              │   │
│  │  Failed Queries: 0                               │   │
│  │                                                   │   │
│  │  Avg: 45ms    P95: 120ms    P99: 350ms          │   │
│  │  ▁▂▃▅▃▂▁ Query time trend                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  Connection Pool                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Active: 5    Idle: 3    Total: 8 / 10          │   │
│  │  ████████░░ 80%                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  Database Size                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Total: 1.2 GB    Tables: 45                     │   │
│  │                                                   │   │
│  │  Largest Tables:                                 │   │
│  │  1. licenses       450 MB                        │   │
│  │  2. royalties      380 MB                        │   │
│  │  3. users          120 MB                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  Slow Queries (Top 10)                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Model      Operation  Duration    Time           │   │
│  │ ───────────────────────────────────────────────  │   │
│  │ License    SELECT     1,245ms     2s ago         │   │
│  │ Royalty    UPDATE     1,100ms     5s ago         │   │
│  │ User       SELECT     1,050ms     12s ago        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Color Scheme

**Status Indicators:**
- 🟢 Green: Healthy, < 80% usage, < 500ms P95
- 🟡 Yellow: Warning, 80-95% usage, 500-2000ms P95
- 🔴 Red: Critical, > 95% usage, > 2000ms P95

**Performance Metrics:**
- Average < 100ms: Green
- Average 100-500ms: Yellow
- Average > 500ms: Red

### Component Structure

```typescript
// Admin Dashboard Page
function DatabaseMonitoringPage() {
  return (
    <AdminLayout>
      <PageHeader title="Database Monitoring" />
      <MetricsGrid />
      <QueryPerformanceSection />
      <ConnectionPoolSection />
      <DatabaseSizeSection />
      <SlowQueriesSection />
      <IndexUsageSection />
    </AdminLayout>
  );
}

// Reusable metric card
function MetricCard({ 
  title, 
  value, 
  status, 
  icon 
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader>
        <Icon>{icon}</Icon>
        <Title>{title}</Title>
      </CardHeader>
      <CardBody>
        <Value status={status}>{value}</Value>
      </CardBody>
    </Card>
  );
}
```

### Sample React Component

```typescript
import { useDatabaseMetrics } from '@/hooks/useDatabaseMetrics';
import { formatDistanceToNow } from 'date-fns';

export function DatabaseMonitoringDashboard() {
  const { data, isLoading, error, refetch } = useDatabaseMetrics();
  
  if (isLoading) {
    return <DashboardSkeleton />;
  }
  
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  
  if (!data) {
    return <EmptyState />;
  }
  
  const poolUsage = (data.metrics.connections.total / 10) * 100;
  const poolStatus = getPoolHealthStatus(poolUsage);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Database Monitoring</h1>
          <p className="text-sm text-gray-500">
            Last updated: {formatDistanceToNow(new Date(data.timestamp), { addSuffix: true })}
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          className="btn btn-primary"
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>
      
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Query Performance"
          value={`${data.metrics.performance.avgQueryTime}ms avg`}
          status={data.metrics.performance.avgQueryTime > 500 ? 'warning' : 'success'}
          icon="⚡"
        />
        
        <MetricCard
          title="Connection Pool"
          value={`${data.metrics.connections.total} / 10`}
          status={poolStatus}
          icon="🔌"
        />
        
        <MetricCard
          title="Slow Queries"
          value={data.metrics.queries.slow}
          status={data.metrics.queries.slow > 0 ? 'warning' : 'success'}
          icon="🐌"
        />
      </div>
      
      {/* Detailed Sections */}
      <ConnectionPoolSection data={data.metrics.connections} />
      <SlowQueriesTable queries={data.slowQueries} />
      <DatabaseSizeInfo size={data.size} />
      <IndexUsageTable indexes={data.indexUsage} />
    </div>
  );
}
```

---

## Testing Guidelines

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DatabaseMonitoringDashboard } from './DatabaseMonitoringDashboard';

describe('DatabaseMonitoringDashboard', () => {
  it('shows loading state initially', () => {
    render(<DatabaseMonitoringDashboard />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
  
  it('displays metrics when loaded', async () => {
    const mockData = {
      timestamp: new Date().toISOString(),
      metrics: {
        queries: { total: 100, slow: 2, failed: 0 },
        connections: { active: 5, idle: 3, total: 8 },
        performance: { avgQueryTime: 45, p95QueryTime: 120, p99QueryTime: 350 }
      },
      // ... more mock data
    };
    
    vi.mocked(useDatabaseMetrics).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    });
    
    render(<DatabaseMonitoringDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('45ms avg')).toBeInTheDocument();
      expect(screen.getByText('8 / 10')).toBeInTheDocument();
    });
  });
  
  it('handles error state', async () => {
    vi.mocked(useDatabaseMetrics).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Connection failed'),
    });
    
    render(<DatabaseMonitoringDashboard />);
    
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
import { test, expect } from '@playwright/test';

test('admin can view database metrics', async ({ page }) => {
  // Login as admin
  await page.goto('/login');
  await page.fill('[name="email"]', 'admin@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Navigate to database monitoring
  await page.goto('/admin/database');
  
  // Check that metrics are displayed
  await expect(page.locator('text=Database Monitoring')).toBeVisible();
  await expect(page.locator('text=Query Performance')).toBeVisible();
  await expect(page.locator('text=Connection Pool')).toBeVisible();
  
  // Test refresh button
  await page.click('button:has-text("Refresh")');
  await expect(page.locator('text=Last updated:')).toBeVisible();
});

test('non-admin cannot access database metrics', async ({ page }) => {
  // Login as brand user
  await page.goto('/login');
  await page.fill('[name="email"]', 'brand@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Attempt to access database monitoring
  await page.goto('/admin/database');
  
  // Should be redirected or show error
  await expect(page).toHaveURL(/\/(login|unauthorized|dashboard)/);
});
```

---

## Performance Considerations

### Caching Strategy

```typescript
/**
 * React Query configuration for database metrics
 */
export const databaseMetricsQueryConfig = {
  queryKey: ['database', 'metrics'],
  staleTime: 4000,           // 4 seconds
  cacheTime: 60000,          // 1 minute
  refetchInterval: 5000,     // 5 seconds
  refetchOnWindowFocus: true,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};
```

### Data Size Optimization

- **Slow queries**: Limit to top 10 (already implemented in backend)
- **Index usage**: Limit to top 20 (already implemented in backend)
- **Largest tables**: Limit to top 10 (already implemented in backend)

### Pagination (Future Enhancement)

If historical data is added, implement pagination:

```typescript
function useHistoricalMetrics(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: ['database', 'metrics', 'history', page],
    queryFn: () => fetchHistoricalMetrics(page, limit),
    keepPreviousData: true,
  });
}
```

---

## Security Considerations

### Sensitive Data

The database metrics endpoint exposes:
- ✅ **Safe**: Connection counts, query counts, performance metrics
- ⚠️ **Sensitive**: Table names, database size
- ❌ **Never expose**: Actual query text, connection strings, credentials

### Best Practices

1. **Authentication**: Always require admin authentication for `/api/admin/database/metrics`
2. **Authorization**: Verify user role on every request (don't trust client)
3. **Rate Limiting**: Prevent abuse of monitoring endpoints
4. **Audit Logging**: Log access to sensitive metrics
5. **Health Check Token**: Use strong, randomly generated tokens for public health checks

### Example Middleware

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Admin routes
  if (request.nextUrl.pathname.startsWith('/admin/database')) {
    const session = await getSession(request);
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
```

---

## Environment Variables

### Backend Configuration

```bash
# Database Connections (required)
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DATABASE_URL_POOLED="postgresql://user:pass@host:6543/dbname?pgbouncer=true"
DATABASE_REPLICA_URL="postgresql://user:pass@replica-host:5432/dbname" # Optional

# Connection Pool Configuration
DB_POOL_MODE="transaction"          # session | transaction | statement
DB_MAX_CONNECTIONS="10"              # Maximum connections in pool
DB_MIN_CONNECTIONS="2"               # Minimum connections to maintain
DB_CONNECTION_TIMEOUT="20"           # Connection timeout (seconds)
DB_IDLE_TIMEOUT="30"                 # Idle connection timeout (seconds)
DB_STATEMENT_TIMEOUT="60000"         # Query timeout (milliseconds)

# Health Check Authentication (recommended for production)
HEALTH_CHECK_TOKEN="your-secret-token-here"
```

### Frontend Configuration

```bash
# Optional: For external monitoring tools calling from client-side
NEXT_PUBLIC_HEALTH_CHECK_TOKEN="your-public-health-token"
```

---

## Troubleshooting Guide

### Common Issues

#### 1. "Replica database health check failed"

**Cause**: Read replica is unavailable or misconfigured

**Solution**:
- Check `DATABASE_REPLICA_URL` environment variable
- Verify replica database is running
- Test connection manually: `psql $DATABASE_REPLICA_URL`
- If no replica needed, remove `DATABASE_REPLICA_URL` (falls back to primary)

#### 2. High connection pool usage (> 95%)

**Cause**: Too many concurrent requests or connection leaks

**Solution**:
- Increase `DB_MAX_CONNECTIONS` (but check database plan limits)
- Investigate long-running queries
- Check for connection leaks in application code
- Review `DB_IDLE_TIMEOUT` setting

#### 3. Slow queries detected

**Cause**: Unoptimized queries or missing indexes

**Solution**:
- Review slow query details in admin dashboard
- Run `npm run db:analyze:indexes` to check index usage
- Add indexes for frequently queried columns
- Use read replica for heavy analytical queries

#### 4. "Failed to fetch database metrics" error

**Cause**: Backend API error or authentication issue

**Solution**:
- Check browser console for detailed error
- Verify user has `ADMIN` role
- Check backend logs for error details
- Test endpoint directly: `curl -H "Authorization: Bearer <token>" https://ops.yesgoddess.agency/api/admin/database/metrics`

---

## Migration Notes

### From Existing Implementation

If migrating from an older monitoring system:

1. **No database migrations required** - this module uses existing Prisma client
2. **Environment variables** - ensure all `DB_*` variables are set
3. **Frontend routes** - add `/admin/database` to your admin router
4. **Authentication** - integrate with existing auth system
5. **Styling** - adapt dashboard components to your design system

### Backward Compatibility

This module is **non-breaking**:
- Existing database connections continue to work
- No schema changes required
- Optional features (read replica, health check token) are backward compatible

---

## Additional Resources

### Backend Files

Key files to reference:
- `/src/lib/db/index.ts` - Database client configuration
- `/src/lib/db/connection-pool.ts` - Connection pool settings
- `/src/lib/db/monitoring.ts` - Monitoring class implementation
- `/src/app/api/health/database/route.ts` - Public health check endpoint
- `/src/app/api/admin/database/metrics/route.ts` - Admin metrics endpoint
- `/src/scripts/db-health-check.ts` - CLI health check script

### NPM Scripts

```bash
# Run health check from CLI
npm run db:health

# Analyze index usage
npm run db:analyze:indexes

# Check database bloat
npm run db:check-bloat
```

### Related Documentation

- **Database Schema**: See `/prisma/schema.prisma` for table structure and indexes
- **Connection Pooling**: Refer to connection-pool.ts for PgBouncer configuration
- **Prisma Metrics**: See [Prisma Metrics Documentation](https://www.prisma.io/docs/concepts/components/prisma-client/metrics)

---

## Support & Feedback

### Questions?

If you need clarification on any part of this guide:
1. Check the troubleshooting section above
2. Review backend implementation files
3. Test endpoints using provided curl examples
4. Contact backend team for database-specific questions

### Feedback

This is a living document. If you find:
- Missing information
- Unclear explanations
- Implementation challenges
- Bugs or inconsistencies

Please provide feedback to improve this guide for future developers.

---

**Document Version:** 1.0.0  
**Last Updated:** October 19, 2025  
**Author:** Backend Team  
**Classification:** 🔒 ADMIN ONLY

