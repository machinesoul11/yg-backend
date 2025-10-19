# Query Optimization Guide

This guide provides best practices, patterns, and techniques for optimizing database queries in the YesGoddess backend.

## Table of Contents

1. [General Principles](#general-principles)
2. [Common Anti-Patterns](#common-anti-patterns)
3. [Prisma-Specific Optimizations](#prisma-specific-optimizations)
4. [Query Analysis Tools](#query-analysis-tools)
5. [Performance Patterns](#performance-patterns)
6. [Monitoring & Debugging](#monitoring--debugging)

---

## General Principles

### 1. Index-Aware Queries

**Always consider indexes when writing WHERE clauses:**

```typescript
// ✅ Good: Uses indexed column
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' } // email has @@index([email])
});

// ❌ Bad: Function on indexed column prevents index usage
const user = await prisma.user.findFirst({
  where: {
    email: {
      equals: 'USER@EXAMPLE.COM'.toLowerCase() // Forces full table scan
    }
  }
});

// ✅ Better: Store lowercase email in database or use case-insensitive collation
```

### 2. Selective Field Loading

**Load only the fields you need:**

```typescript
// ❌ Bad: Loads all fields including large JSONB columns
const projects = await prisma.project.findMany();

// ✅ Good: Load only required fields
const projects = await prisma.project.findMany({
  select: {
    id: true,
    name: true,
    status: true,
    createdAt: true,
    // Exclude large metadata, scope_json, etc.
  }
});
```

### 3. Pagination

**Always paginate large result sets:**

```typescript
// ❌ Bad: Loads all records into memory
const allAssets = await prisma.ipAsset.findMany();

// ✅ Good: Cursor-based pagination
const assets = await prisma.ipAsset.findMany({
  take: 20,
  skip: 1,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' }
});

// ✅ Also Good: Offset-based for small datasets
const assets = await prisma.ipAsset.findMany({
  take: 20,
  skip: page * 20,
  orderBy: { createdAt: 'desc' }
});
```

### 4. Query Timeouts

**Set appropriate timeouts for different operations:**

```typescript
// User-facing API (aggressive timeout)
import { executeQuery } from '@/lib/db';

const data = await executeQuery('read', async (client) => {
  return await client.user.findMany({ take: 10 });
}, 5000); // 5 second timeout

// Analytics query (longer timeout)
const report = await executeQuery('read', async (client) => {
  return await client.$queryRaw`
    SELECT /* complex analytics query */
  `;
}, 60000); // 60 second timeout
```

---

## Common Anti-Patterns

### 1. N+1 Query Problem

**The Problem:**
```typescript
// ❌ Bad: N+1 queries (1 query for projects + N queries for assets)
const projects = await prisma.project.findMany();

for (const project of projects) {
  const assets = await prisma.ipAsset.findMany({
    where: { projectId: project.id }
  }); // Separate query for each project!
  
  console.log(`${project.name}: ${assets.length} assets`);
}
```

**The Solution:**
```typescript
// ✅ Good: Single query with eager loading
const projects = await prisma.project.findMany({
  include: {
    ipAssets: true
  }
});

for (const project of projects) {
  console.log(`${project.name}: ${project.ipAssets.length} assets`);
}

// ✅ Even Better: Load only counts if that's all you need
const projects = await prisma.project.findMany({
  include: {
    _count: {
      select: { ipAssets: true }
    }
  }
});
```

### 2. Query in Loop

**The Problem:**
```typescript
// ❌ Bad: Multiple separate queries
const userIds = ['id1', 'id2', 'id3', ...];

for (const userId of userIds) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  // Process user
}
```

**The Solution:**
```typescript
// ✅ Good: Single batch query
const userIds = ['id1', 'id2', 'id3', ...];

const users = await prisma.user.findMany({
  where: {
    id: { in: userIds }
  }
});

// Create lookup map for efficient access
const userMap = new Map(users.map(u => [u.id, u]));
for (const userId of userIds) {
  const user = userMap.get(userId);
  // Process user
}
```

### 3. Loading Large Collections

**The Problem:**
```typescript
// ❌ Bad: Loading thousands of records at once
const creator = await prisma.creator.findUnique({
  where: { id: creatorId },
  include: {
    ipOwnerships: true, // Could be hundreds/thousands
    royaltyStatements: true // Same issue
  }
});
```

**The Solution:**
```typescript
// ✅ Good: Use separate paginated queries or counts
const creator = await prisma.creator.findUnique({
  where: { id: creatorId },
  include: {
    _count: {
      select: { 
        ipOwnerships: true,
        royaltyStatements: true 
      }
    }
  }
});

// Load collections separately when needed
if (needsOwnership) {
  const ownerships = await prisma.ipOwnership.findMany({
    where: { creatorId },
    take: 20,
    orderBy: { createdAt: 'desc' }
  });
}
```

### 4. Inefficient Counting

**The Problem:**
```typescript
// ❌ Bad: Loading all records just to count
const projects = await prisma.project.findMany({
  where: { brandId }
});
const count = projects.length;
```

**The Solution:**
```typescript
// ✅ Good: Use database count
const count = await prisma.project.count({
  where: { brandId }
});

// ✅ Even Better: Combine count with data fetch
const [projects, count] = await Promise.all([
  prisma.project.findMany({
    where: { brandId },
    take: 20,
    skip: page * 20
  }),
  prisma.project.count({
    where: { brandId }
  })
]);
```

---

## Prisma-Specific Optimizations

### 1. Relation Loading Strategies

```typescript
// Option 1: include (joins)
const project = await prisma.project.findUnique({
  where: { id },
  include: {
    brand: true,      // LEFT JOIN
    ipAssets: true    // LEFT JOIN
  }
});

// Option 2: select (explicit field selection with joins)
const project = await prisma.project.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    brand: {
      select: {
        id: true,
        companyName: true
      }
    }
  }
});

// Option 3: Separate queries (when data is large or rarely needed)
const project = await prisma.project.findUnique({ where: { id } });
if (needsBrand) {
  const brand = await prisma.brand.findUnique({
    where: { id: project.brandId }
  });
}
```

### 2. Transaction Optimization

```typescript
// ❌ Bad: Multiple separate transactions
await prisma.ipAsset.create({ data: assetData });
await prisma.ipOwnership.create({ data: ownershipData });
await prisma.auditEvent.create({ data: auditData });

// ✅ Good: Single transaction
await prisma.$transaction(async (tx) => {
  const asset = await tx.ipAsset.create({ data: assetData });
  await tx.ipOwnership.create({ 
    data: { ...ownershipData, ipAssetId: asset.id } 
  });
  await tx.auditEvent.create({ data: auditData });
});

// ✅ Best: Use batch operations when possible
await prisma.$transaction([
  prisma.ipAsset.create({ data: assetData }),
  prisma.ipOwnership.create({ data: ownershipData }),
  prisma.auditEvent.create({ data: auditData })
]);
```

### 3. Batch Operations

```typescript
// ❌ Bad: Multiple individual inserts
for (const asset of assets) {
  await prisma.ipAsset.create({ data: asset });
}

// ✅ Good: Batch insert
await prisma.ipAsset.createMany({
  data: assets,
  skipDuplicates: true // Optional
});

// ✅ Good: Batch update
await prisma.ipAsset.updateMany({
  where: { projectId, status: 'draft' },
  data: { status: 'review' }
});
```

### 4. Aggregations

```typescript
// ❌ Bad: Load all data to aggregate in application
const statements = await prisma.royaltyStatement.findMany({
  where: { creatorId }
});
const total = statements.reduce((sum, s) => sum + s.totalEarningsCents, 0);

// ✅ Good: Database-level aggregation
const result = await prisma.royaltyStatement.aggregate({
  where: { creatorId },
  _sum: {
    totalEarningsCents: true
  }
});
const total = result._sum.totalEarningsCents || 0;

// ✅ Advanced: Group by with aggregation
const byStatus = await prisma.royaltyStatement.groupBy({
  by: ['status'],
  where: { creatorId },
  _sum: {
    totalEarningsCents: true
  },
  _count: true
});
```

---

## Query Analysis Tools

### 1. EXPLAIN ANALYZE

Use PostgreSQL's EXPLAIN ANALYZE to understand query execution:

```typescript
// Enable query logging in development
// Set in .env: LOG_LEVEL=debug

// Run problematic query with EXPLAIN
const result = await prisma.$queryRaw`
  EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  SELECT * FROM projects 
  WHERE brand_id = ${brandId} 
  AND status = 'active'
`;

console.log(JSON.stringify(result, null, 2));
```

**Key metrics to look for:**
- **Seq Scan**: Full table scan (bad for large tables)
- **Index Scan**: Using an index (good)
- **Execution Time**: Total query time
- **Planning Time**: Time to plan query
- **Rows**: Estimated vs actual row counts

### 2. Prisma Query Events

```typescript
// In src/lib/db/monitoring.ts
this.prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Params: ' + e.params);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### 3. Database Statistics

```sql
-- Check slow queries
SELECT 
  query,
  calls,
  total_time / 1000 as total_seconds,
  mean_time / 1000 as mean_seconds,
  max_time / 1000 as max_seconds
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_time DESC
LIMIT 20;

-- Check table statistics
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;
```

---

## Performance Patterns

### 1. Caching Strategy

```typescript
import { redis } from '@/lib/redis';

async function getProjectWithCache(projectId: string) {
  const cacheKey = `project:${projectId}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Cache miss - query database
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      brand: {
        select: {
          id: true,
          companyName: true
        }
      }
    }
  });
  
  // Cache for 15 minutes
  await redis.setex(cacheKey, 900, JSON.stringify(project));
  
  return project;
}

// Invalidate cache on update
async function updateProject(projectId: string, data: any) {
  const updated = await prisma.project.update({
    where: { id: projectId },
    data
  });
  
  // Invalidate cache
  await redis.del(`project:${projectId}`);
  
  return updated;
}
```

### 2. Read Replica Routing

```typescript
import { executeQuery } from '@/lib/db';

// Analytics/reporting queries - use replica
export async function getCreatorAnalytics(creatorId: string) {
  return executeQuery('read', async (client) => {
    return await client.$queryRaw`
      SELECT 
        DATE_TRUNC('month', r.period_start) as month,
        SUM(r.total_earnings_cents) as earnings
      FROM royalty_statements r
      WHERE r.creator_id = ${creatorId}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `;
  });
}

// Write operations - always use primary
export async function createProject(data: any) {
  return executeQuery('write', async (client) => {
    return await client.project.create({ data });
  });
}

// Recent data requiring consistency - use primary
export async function getRecentOrders(userId: string) {
  return executeQuery('write', async (client) => {
    // Use primary to avoid replication lag
    return await client.order.findMany({
      where: { 
        userId,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        }
      }
    });
  });
}
```

### 3. Pagination Patterns

```typescript
// Cursor-based pagination (preferred for large datasets)
export async function getAssetsCursor(
  take: number = 20,
  cursor?: string
) {
  const assets = await prisma.ipAsset.findMany({
    take: take + 1, // Fetch one extra to check if there's a next page
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor }
    }),
    orderBy: { createdAt: 'desc' }
  });
  
  const hasMore = assets.length > take;
  const items = hasMore ? assets.slice(0, -1) : assets;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  
  return {
    items,
    nextCursor,
    hasMore
  };
}

// Offset-based pagination (simpler, good for small datasets)
export async function getAssetsOffset(
  page: number = 0,
  pageSize: number = 20
) {
  const [items, total] = await Promise.all([
    prisma.ipAsset.findMany({
      take: pageSize,
      skip: page * pageSize,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.ipAsset.count()
  ]);
  
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}
```

### 4. Search Optimization

```typescript
// Full-text search with indexes
export async function searchCreators(query: string) {
  // Uses GIN index: idx_creators_fulltext
  return await prisma.$queryRaw`
    SELECT 
      id,
      "stageName",
      bio,
      ts_rank(
        to_tsvector('english', COALESCE("stageName", '') || ' ' || COALESCE(bio, '')),
        plainto_tsquery('english', ${query})
      ) as rank
    FROM creators
    WHERE to_tsvector('english', COALESCE("stageName", '') || ' ' || COALESCE(bio, ''))
      @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT 20
  `;
}

// Fuzzy search with trigram indexes
export async function searchCreatorsFuzzy(query: string) {
  // Uses GIN trigram index: idx_creators_stagename_trgm
  return await prisma.$queryRaw`
    SELECT 
      id,
      "stageName",
      similarity("stageName", ${query}) as similarity
    FROM creators
    WHERE "stageName" % ${query}  -- Trigram similarity operator
    ORDER BY similarity DESC
    LIMIT 20
  `;
}
```

---

## Monitoring & Debugging

### 1. Slow Query Detection

```typescript
// Automatically logged via monitoring.ts
// Check with:
npm run db:health

// Look for "Slow queries detected" section
```

### 2. Index Usage Analysis

```bash
# Check which indexes are being used
npm run db:analyze:indexes

# Look for:
# - Unused indexes (0 scans)
# - Low-use indexes (few scans, large size)
# - Missing index suggestions
```

### 3. Query Profiling

```typescript
// Add timing wrapper
async function profileQuery<T>(
  name: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`Slow query: ${name} took ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`Query error: ${name} failed after ${duration}ms`, error);
    throw error;
  }
}

// Usage
const projects = await profileQuery(
  'getActiveProjects',
  () => prisma.project.findMany({
    where: { status: 'active' }
  })
);
```

### 4. Performance Testing

```typescript
import { performance } from 'perf_hooks';

async function benchmarkQuery() {
  const iterations = 100;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    await prisma.project.findMany({
      where: { status: 'active' },
      take: 20
    });
    
    times.push(performance.now() - start);
  }
  
  times.sort((a, b) => a - b);
  
  console.log({
    iterations,
    avg: times.reduce((a, b) => a + b) / times.length,
    min: times[0],
    max: times[times.length - 1],
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
  });
}
```

---

## Quick Reference

### Performance Checklist

- [ ] Use indexed columns in WHERE clauses
- [ ] Load only required fields (use `select`)
- [ ] Avoid N+1 queries (use `include` or batch loading)
- [ ] Implement pagination for large result sets
- [ ] Use database aggregations instead of application-level
- [ ] Set appropriate query timeouts
- [ ] Route analytics queries to read replica
- [ ] Cache frequently accessed data
- [ ] Use batch operations for bulk updates
- [ ] Monitor slow queries regularly

### Common Commands

```bash
# Health check
npm run db:health

# Index analysis
npm run db:analyze:indexes

# Vacuum analysis
npm run db:analyze:vacuum

# Check query plans
EXPLAIN (ANALYZE) <query>;
```

### Target Metrics

- **Average query time:** < 50ms
- **P95 query time:** < 100ms
- **P99 query time:** < 500ms
- **Slow query threshold:** 1000ms
- **Index hit ratio:** > 99%

---

## Additional Resources

- [Prisma Performance Guide](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL Query Performance](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Database Optimization Guide](./optimization-guide.md)
- [Index Analysis Guide](./index-analysis-guide.md)
