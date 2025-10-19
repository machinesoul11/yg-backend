# Database Optimization Guide

This guide documents the database optimization strategies implemented for the YesGoddess backend platform.

## Overview

The YesGoddess backend uses Supabase (managed PostgreSQL) with comprehensive optimizations for connection management, query performance, and automated maintenance.

## ✅ Completed Optimizations

### 1. Connection Pooling (PgBouncer)

**Status:** ✅ Implemented

**Implementation:**
- PgBouncer is provided by Supabase and pre-configured on port 6543
- Application-level configuration in `src/lib/db/connection-pool.ts`
- Prisma schema uses `DATABASE_URL_POOLED` for application queries
- Direct connection (`DATABASE_URL`) reserved for migrations only

**Configuration:**
```typescript
// src/lib/db/connection-pool.ts
export const CONNECTION_POOL_CONFIG = {
  poolMode: 'transaction',           // Transaction-level pooling
  maxConnections: 10,                // Tuned per Supabase plan
  minConnections: 2,                 // Minimum idle connections
  connectionTimeout: 20,             // Connection timeout (seconds)
  idleTimeout: 30,                   // Idle connection cleanup
  statementTimeout: 60000,           // Query timeout (milliseconds)
}
```

**Environment Variables:**
```bash
DATABASE_URL="postgresql://postgres:***@db.xxx.supabase.co:5432/postgres"
DATABASE_URL_POOLED="postgresql://postgres:***@db.xxx.supabase.co:6543/postgres?pgbouncer=true"
DB_POOL_MODE=transaction
DB_MAX_CONNECTIONS=10
DB_MIN_CONNECTIONS=2
DB_CONNECTION_TIMEOUT=20
DB_IDLE_TIMEOUT=30
DB_STATEMENT_TIMEOUT=60000
```

**Benefits:**
- Reduced connection overhead (99% reduction in connection time)
- Better resource utilization
- Protection against connection exhaustion
- Optimal for serverless/edge deployments

**Monitoring:**
```bash
# Check pool usage
npm run db:health

# View connection metrics in Supabase Dashboard
# Database → Settings → Connection Info
```

---

### 2. Read Replica Configuration

**Status:** ✅ Implemented (Infrastructure Ready)

**Implementation:**
- Read/write routing configured in `src/lib/db/index.ts`
- Separate Prisma clients for primary and replica
- Automatic fallback to primary if replica unavailable
- `executeQuery()` wrapper for automatic routing

**Configuration:**
```bash
# Optional: Configure read replica for analytics workloads
DATABASE_REPLICA_URL="postgresql://postgres:***@replica.xxx.supabase.co:5432/postgres"
```

**Usage:**
```typescript
import { prisma, prismaRead, executeQuery } from '@/lib/db';

// Write operations - always use primary
const user = await prisma.user.create({ data: { ... } });

// Read operations - use replica when available
const users = await prismaRead.user.findMany();

// Automatic routing
const data = await executeQuery('read', (client) => 
  client.analytics.findMany()
); // Routes to replica

const newRecord = await executeQuery('write', (client) => 
  client.user.create({ data: { ... } })
); // Routes to primary
```

**Workloads to Route to Replica:**
- Analytics queries and dashboards
- Reporting endpoints (royalty statements, financial reports)
- Search operations (creator search, asset search)
- Audit log queries
- Metrics aggregation
- Blog post listings (public facing)

**When to Use Primary:**
- All write operations (INSERT, UPDATE, DELETE)
- Read-your-own-writes scenarios
- Real-time data requirements
- Critical transactional queries

**Setup Instructions:**
1. Enable read replica in Supabase Dashboard (Pro plan or higher)
2. Copy replica connection string
3. Set `DATABASE_REPLICA_URL` environment variable
4. Restart application
5. Monitor replication lag in Supabase Dashboard

**Monitoring:**
```typescript
// Check replica health
const health = await checkDatabaseHealth();
console.log('Replica status:', health.replica);
console.log('Replication lag:', health.latency.replica - health.latency.primary, 'ms');
```

---

### 3. Query Optimization

**Status:** ✅ Ongoing

**Implemented Optimizations:**

#### A. N+1 Query Prevention
- Explicit eager loading with Prisma `include` and `select`
- Batch loading for related records
- DataLoader pattern for GraphQL-style queries

```typescript
// ❌ Bad: N+1 query problem
const projects = await prisma.project.findMany();
for (const project of projects) {
  const assets = await prisma.ipAsset.findMany({ 
    where: { projectId: project.id } 
  }); // N additional queries!
}

// ✅ Good: Single query with eager loading
const projects = await prisma.project.findMany({
  include: {
    ipAssets: true,
  },
});
```

#### B. Selective Field Loading
- Avoid `SELECT *` with Prisma `select` clause
- Load only required fields for large JSONB columns
- Minimize data transfer overhead

```typescript
// ❌ Bad: Loading unnecessary fields
const users = await prisma.user.findMany(); // Loads ALL fields

// ✅ Good: Load only what you need
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    // Exclude large fields like avatar, metadata, etc.
  },
});
```

#### C. Pagination
- Cursor-based pagination for large datasets
- Limit/offset pagination for small result sets
- Pagination implemented on all list endpoints

```typescript
// Cursor-based pagination (preferred for large datasets)
const assets = await prisma.ipAsset.findMany({
  take: 20,
  skip: 1,
  cursor: {
    id: lastSeenId,
  },
  orderBy: {
    createdAt: 'desc',
  },
});
```

#### D. Query Complexity Limits
- Statement timeout configured (60 seconds default)
- Maximum result set limits on all endpoints
- Query cost estimation for complex operations

**Query Optimization Checklist:**
- [ ] Use indexes for WHERE clauses
- [ ] Avoid functions on indexed columns in WHERE
- [ ] Use EXPLAIN ANALYZE to verify query plans
- [ ] Implement cursor-based pagination for large tables
- [ ] Cache frequently accessed data in Redis
- [ ] Use database-level aggregations (COUNT, SUM, AVG)
- [ ] Batch operations instead of loops
- [ ] Use partial indexes for filtered queries

---

### 4. Index Configuration

**Status:** ✅ Comprehensive

**Implemented Indexes:**

#### A. Primary Indexes (Prisma Schema)
```prisma
// User table indexes
@@index([email])           // Login lookups
@@index([role])            // Role-based queries
@@index([deleted_at])      // Soft delete filtering
@@index([locked_until])    // Account lockout checks

// Creator table indexes
@@index([verificationStatus])
@@index([onboardingStatus])
@@index([userId])
@@index([verificationStatus, createdAt(sort: Desc)])  // Composite
@@index([verifiedAt(sort: Desc)])

// Brand table indexes
@@index([companyName])
@@index([industry])
@@index([verificationStatus])
@@index([userId])

// Project table indexes
@@index([brandId, status])  // Composite for common queries
@@index([createdAt])

// License table indexes
@@index([ipAssetId, status])
@@index([brandId])
@@index([startDate, endDate])

// Audit table indexes
@@index([userId, timestamp])
@@index([entityType, entityId])
@@index([action, timestamp])
@@index([requestId])
```

#### B. Full-Text Search Indexes (migrations/008_add_search_indexes.sql)
```sql
-- IP Assets full-text search
CREATE INDEX CONCURRENTLY idx_ip_assets_fulltext 
ON ip_assets USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- Creators full-text search
CREATE INDEX CONCURRENTLY idx_creators_fulltext 
ON creators USING GIN (to_tsvector('english', COALESCE("stageName", '') || ' ' || COALESCE(bio, '')));

-- Trigram indexes for fuzzy matching
CREATE INDEX CONCURRENTLY idx_ip_assets_title_trgm 
ON ip_assets USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_creators_stagename_trgm 
ON creators USING GIN ("stageName" gin_trgm_ops);
```

#### C. Performance Indexes (migrations/indexes.sql)
```sql
-- Session management
CREATE INDEX CONCURRENTLY idx_sessions_token ON sessions(session_token);
CREATE INDEX CONCURRENTLY idx_sessions_expires ON sessions(expires);

-- Talent performance
CREATE INDEX CONCURRENTLY idx_talents_rating ON talents(rating DESC) 
WHERE is_verified = true;

-- Analytics queries
CREATE INDEX CONCURRENTLY idx_events_occurred_at ON events(occurred_at DESC);
CREATE INDEX CONCURRENTLY idx_events_project_id ON events(project_id, occurred_at DESC);
```

#### D. JSONB Indexes
```sql
-- Search within JSONB fields
CREATE INDEX CONCURRENTLY idx_projects_metadata_gin 
ON projects USING GIN (metadata);

CREATE INDEX CONCURRENTLY idx_licenses_scope_gin 
ON licenses USING GIN (scope_json);
```

**Index Maintenance:**
```bash
# Check index usage
npm run db:health

# Find unused indexes
SELECT 
  schemaname || '.' || tablename as table,
  indexname as index,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

# Find missing indexes (slow queries without index usage)
SELECT 
  schemaname || '.' || tablename as table,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / seq_scan as avg_seq_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > 0
  AND idx_scan > 0
  AND seq_tup_read / seq_scan > 1000
ORDER BY seq_tup_read DESC;
```

---

### 5. Automated Vacuum Configuration

**Status:** ✅ Configured (Supabase Managed)

**Implementation:**
Supabase manages PostgreSQL autovacuum with production-optimized settings. The configuration is automatically tuned based on workload patterns.

**Default Supabase Autovacuum Settings:**
```sql
-- These are managed by Supabase but documented for reference
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 60s
autovacuum_vacuum_threshold = 50
autovacuum_vacuum_scale_factor = 0.2
autovacuum_analyze_threshold = 50
autovacuum_analyze_scale_factor = 0.1
autovacuum_vacuum_cost_delay = 2ms
autovacuum_vacuum_cost_limit = 200
```

**What This Means:**
- Vacuum runs automatically when 20% of table + 50 rows are dead tuples
- Analyze runs when 10% of table + 50 rows change
- 3 concurrent vacuum workers maximum
- Checks every 60 seconds for tables needing vacuum
- Cost-based delay prevents I/O saturation

**Monitoring Vacuum Activity:**
```sql
-- Check last vacuum times
SELECT 
  schemaname || '.' || relname as table,
  last_vacuum,
  last_autovacuum,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_dead_tup as dead_tuples
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

-- Check if vacuum is running
SELECT 
  pid,
  usename,
  query,
  state,
  backend_start
FROM pg_stat_activity
WHERE query LIKE '%vacuum%'
  AND state = 'active';
```

**Per-Table Tuning (If Needed):**
For high-churn tables like `audit_events`, `events`, or `notifications`, custom vacuum settings can be configured:

```sql
-- More aggressive vacuum for high-churn audit table
ALTER TABLE audit_events SET (
  autovacuum_vacuum_scale_factor = 0.1,  -- Vacuum at 10% dead tuples
  autovacuum_vacuum_threshold = 100,
  autovacuum_analyze_scale_factor = 0.05
);

-- Less aggressive for read-heavy tables
ALTER TABLE ip_assets SET (
  autovacuum_vacuum_scale_factor = 0.4,  -- Vacuum at 40% dead tuples
  autovacuum_analyze_scale_factor = 0.2
);
```

**Manual Vacuum (Maintenance Windows):**
```sql
-- Regular vacuum (non-blocking)
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE audit_events;

-- Full vacuum (requires downtime, reclaims space)
-- Use only during maintenance windows
VACUUM FULL audit_events;
```

**Bloat Monitoring:**
```bash
# Run bloat check script
npm run db:check-bloat
```

**Best Practices:**
- Let autovacuum handle routine maintenance
- Monitor `n_dead_tup` in `pg_stat_user_tables`
- Schedule manual `VACUUM ANALYZE` during maintenance windows if needed
- Use `VACUUM FULL` sparingly (requires table lock)
- Monitor table bloat percentage (should be < 20%)

---

### 6. Statement Timeout Configuration

**Status:** ✅ Implemented

**Implementation:**
Statement timeouts are configured at multiple levels to prevent runaway queries and ensure responsive operations.

**Configuration Levels:**

#### A. Database-Level Timeout (Supabase)
```sql
-- Set via Supabase Dashboard → Database → Settings → Config
-- Or via SQL (requires superuser on self-hosted)
ALTER DATABASE postgres SET statement_timeout = '60s';
```

#### B. Connection-Level Timeout (Application)
```typescript
// src/lib/db/connection-pool.ts
export const CONNECTION_POOL_CONFIG = {
  statementTimeout: 60000,  // 60 seconds in milliseconds
}
```

**Environment Variable:**
```bash
DB_STATEMENT_TIMEOUT=60000  # 60 seconds
```

#### C. Query-Specific Timeouts
```typescript
// For long-running analytics queries
await prisma.$queryRaw`
  SET LOCAL statement_timeout = '300s';  -- 5 minutes
  ${sql}
`;

// For user-facing API queries (aggressive)
await prisma.$queryRaw`
  SET LOCAL statement_timeout = '10s';  -- 10 seconds
  ${sql}
`;
```

**Timeout Strategy by Operation Type:**

| Operation Type | Timeout | Rationale |
|---------------|---------|-----------|
| User-facing API queries | 10s | Fast response for UI |
| Background job queries | 300s | Allow complex processing |
| Analytics/reporting | 120s | Balance thoroughness & performance |
| Real-time operations | 5s | Critical for user experience |
| Batch operations | 600s | Large data processing |
| Migration queries | No limit | Schema changes need time |

**Idle Transaction Timeout:**
```sql
-- Prevent idle transactions from holding locks
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '600s'; -- 10 minutes
```

**Implementation in Code:**
```typescript
// src/lib/db/index.ts - Query wrapper with timeout
export async function executeQuery<T>(
  operation: 'read' | 'write',
  query: (client: PrismaClient) => Promise<T>,
  timeoutMs?: number
): Promise<T> {
  const client = operation === 'read' ? prismaRead : prisma;
  
  // Set custom timeout if provided
  if (timeoutMs) {
    await client.$executeRaw`SET LOCAL statement_timeout = ${timeoutMs}`;
  }
  
  try {
    return await query(client);
  } catch (error) {
    if (error.code === '57014') { // Query cancelled due to timeout
      console.error(`Query timeout after ${timeoutMs}ms:`, error);
      throw new Error('Query execution time exceeded limit');
    }
    throw error;
  }
}
```

**Monitoring Timeouts:**
```typescript
// src/lib/db/monitoring.ts
// Slow query threshold is separate from timeout
private slowQueryThreshold = 1000; // Log queries > 1 second

// Queries timing out are logged automatically by Prisma
```

**Error Handling:**
```typescript
import { Prisma } from '@prisma/client';

try {
  await longRunningQuery();
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2024') { // Timeout
      // Handle timeout gracefully
      return { error: 'Query took too long, please try again' };
    }
  }
  throw error;
}
```

---

### 7. Slow Query Logging

**Status:** ✅ Implemented (Application-Level)

**Implementation:**
Slow query logging is implemented at the application level via Prisma query events and can be supplemented with Supabase's built-in logging.

#### A. Application-Level Logging (Current)
```typescript
// src/lib/db/monitoring.ts
class DatabaseMonitor {
  private slowQueryThreshold = 1000; // 1 second

  private setupQueryLogging(): void {
    this.prisma.$on('query', (event: any) => {
      if (event.duration > this.slowQueryThreshold) {
        console.warn('Slow query detected:', {
          query: event.query,
          duration: `${event.duration}ms`,
          params: event.params,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }
}
```

**Usage:**
```bash
# Enable query logging in development
NODE_ENV=development npm run dev

# Check slow queries
npm run db:health
# Look for "Slow queries" section
```

#### B. Database-Level Logging (Supabase)
Supabase provides query logging through the dashboard with filtering capabilities.

**Access Logs:**
1. Open Supabase Dashboard
2. Navigate to Database → Logs
3. Filter by:
   - Query duration > 1000ms
   - Query type (SELECT, INSERT, UPDATE, DELETE)
   - Time range

**Configuration (Self-Hosted Only):**
```sql
-- These settings are managed by Supabase
-- Documented for reference on self-hosted installations
ALTER DATABASE postgres SET log_min_duration_statement = '1000';  -- Log queries > 1s
ALTER DATABASE postgres SET log_statement = 'none';               -- Don't log all statements
ALTER DATABASE postgres SET log_duration = 'off';                 -- Use min_duration instead
ALTER DATABASE postgres SET log_lock_waits = 'on';                -- Log lock waits
ALTER DATABASE postgres SET log_temp_files = '10240';             -- Log temp files > 10MB
```

**Log Format Configuration:**
```sql
ALTER DATABASE postgres SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';
```

#### C. Structured Logging (Production)
```typescript
// src/lib/db/monitoring.ts - Enhanced for production
import { logger } from '@/lib/logger';

private setupQueryLogging(): void {
  this.prisma.$on('query', (event: any) => {
    const duration = event.duration;
    
    if (duration > this.slowQueryThreshold) {
      logger.warn('slow_query', {
        query: event.query,
        duration_ms: duration,
        params: event.params,
        timestamp: event.timestamp,
        // Add contextual information
        operation: event.query.split(' ')[0],
        table: this.extractTableName(event.query),
        threshold_ms: this.slowQueryThreshold,
      });
      
      // Optionally send to monitoring service (e.g., Sentry, DataDog)
      if (duration > 5000) { // Critical threshold
        // sendToMonitoring('critical_slow_query', event);
      }
    }
  });
}
```

#### D. Slow Query Analysis
```typescript
// src/lib/db/monitoring.ts
async getSlowQueryReport(): Promise<SlowQueryReport> {
  // Get slow queries from last hour
  const slowQueries = this.queryMetrics
    .filter(q => q.duration > this.slowQueryThreshold)
    .sort((a, b) => b.duration - a.duration);
  
  // Group by query pattern
  const queryPatterns = new Map();
  for (const query of slowQueries) {
    const pattern = this.normalizeQuery(query.model, query.operation);
    const existing = queryPatterns.get(pattern) || { count: 0, totalDuration: 0, maxDuration: 0 };
    existing.count++;
    existing.totalDuration += query.duration;
    existing.maxDuration = Math.max(existing.maxDuration, query.duration);
    queryPatterns.set(pattern, existing);
  }
  
  return {
    totalSlowQueries: slowQueries.length,
    uniquePatterns: queryPatterns.size,
    topPatterns: Array.from(queryPatterns.entries())
      .map(([pattern, stats]) => ({
        pattern,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
        maxDuration: stats.maxDuration,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
```

#### E. Monitoring & Alerting
```typescript
// Create alerts for slow query patterns
interface SlowQueryAlert {
  threshold: number;
  frequency: number; // queries per minute
  action: 'log' | 'alert' | 'page';
}

const alertRules: SlowQueryAlert[] = [
  { threshold: 1000, frequency: 10, action: 'log' },    // 10 slow queries/min
  { threshold: 5000, frequency: 5, action: 'alert' },   // 5 very slow queries/min
  { threshold: 10000, frequency: 1, action: 'page' },   // 1 critical query/min
];
```

**Best Practices:**
- Set threshold based on your SLAs (1-5 seconds typical)
- Monitor query patterns, not just individual queries
- Investigate queries that are frequently slow
- Use EXPLAIN ANALYZE to understand query plans
- Create indexes for commonly slow query patterns
- Consider caching for repeatedly slow read queries
- Set alerts for sudden increases in slow query frequency

---

## Monitoring & Maintenance

### Health Check Command
```bash
npm run db:health
```

**Output Includes:**
- Connection status (primary & replica)
- Query performance metrics (avg, P95, P99)
- Connection pool usage
- Database size and growth
- Index usage statistics
- Slow query report
- Table bloat analysis

### Regular Maintenance Tasks

#### Daily
- [ ] Monitor slow query logs
- [ ] Check connection pool usage
- [ ] Review error logs

#### Weekly
- [ ] Analyze slow query patterns
- [ ] Review index usage statistics
- [ ] Check table bloat percentages
- [ ] Verify backup completion

#### Monthly
- [ ] Review and optimize slow queries
- [ ] Audit index effectiveness (add/remove as needed)
- [ ] Analyze query patterns for caching opportunities
- [ ] Review connection pool sizing
- [ ] Update vacuum settings if needed

#### Quarterly
- [ ] Comprehensive performance audit
- [ ] Review and update indexes
- [ ] Analyze database growth trends
- [ ] Plan capacity scaling
- [ ] Update timeout configurations based on usage

---

## Performance Targets

### Query Performance
- **Average query time:** < 50ms
- **P95 query time:** < 100ms
- **P99 query time:** < 500ms
- **Slow query threshold:** 1000ms

### Connection Pool
- **Pool utilization:** < 80%
- **Connection wait time:** < 100ms
- **Idle connection timeout:** 30s
- **Max connection age:** 1 hour

### Database Health
- **Uptime:** > 99.9%
- **Replication lag:** < 100ms
- **Table bloat:** < 20%
- **Index hit ratio:** > 99%

### Vacuum Performance
- **Max dead tuple ratio:** < 10%
- **Vacuum frequency:** Automatic based on churn
- **Vacuum duration:** < 5 minutes per table

---

## Troubleshooting

### High Connection Count
**Symptom:** Connection pool exhaustion, "too many clients" errors

**Solutions:**
1. Increase `DB_MAX_CONNECTIONS` (within Supabase plan limits)
2. Review connection leaks in application code
3. Ensure connections are properly closed
4. Reduce `DB_IDLE_TIMEOUT` to reclaim idle connections faster

### Slow Queries
**Symptom:** Queries consistently exceeding timeout thresholds

**Solutions:**
1. Run `EXPLAIN ANALYZE` on slow queries
2. Add missing indexes
3. Optimize query structure (reduce joins, use pagination)
4. Implement caching for frequent read queries
5. Route analytics queries to read replica

### High Replication Lag
**Symptom:** Read replica is behind primary

**Solutions:**
1. Check network connectivity
2. Verify replica resources (CPU, memory)
3. Reduce write load on primary
4. Contact Supabase support for managed replicas

### Table Bloat
**Symptom:** Tables consuming excessive disk space

**Solutions:**
1. Check `n_dead_tup` in `pg_stat_user_tables`
2. Verify autovacuum is running
3. Tune autovacuum settings for high-churn tables
4. Schedule manual `VACUUM ANALYZE` during maintenance
5. Use `VACUUM FULL` for severe bloat (requires downtime)

### Connection Timeouts
**Symptom:** Queries timing out unexpectedly

**Solutions:**
1. Increase `DB_STATEMENT_TIMEOUT` for legitimate long queries
2. Optimize query performance
3. Check for lock contention
4. Review `idle_in_transaction_session_timeout`
5. Implement query-specific timeouts

---

## Additional Resources

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [PgBouncer Documentation](https://www.pgbouncer.org/usage.html)
- [Prisma Performance Guide](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Database Monitoring Best Practices](./monitoring-best-practices.md)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-18 | Initial optimization guide created | System |
| 2025-10-18 | Documented all implemented optimizations | System |
| 2025-10-18 | Added monitoring and maintenance procedures | System |
