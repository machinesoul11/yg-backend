# Database Connection Fix for Serverless

## Issue
Prisma was failing with error: `prepared statement "s0" already exists`

This occurs when using Prisma with PgBouncer in transaction mode because:
- Prisma tries to use prepared statements for performance
- PgBouncer in transaction mode doesn't support prepared statements properly
- Each serverless function invocation tries to create the same prepared statement

## Solution
Add `pgbouncer=true` parameter to `DATABASE_URL_POOLED` connection string.

This tells Prisma to disable prepared statements when connecting through PgBouncer.

## Required Environment Variable Update in Vercel

Update `DATABASE_URL_POOLED` to:
```
postgresql://postgres.ivndiftujdjwyqaidiea:q0XT3mVa7e4puKOf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connect_timeout=10
```

**Key addition:** `?pgbouncer=true&connect_timeout=10`

## References
- [Prisma + PgBouncer Guide](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-pg-bouncer)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
