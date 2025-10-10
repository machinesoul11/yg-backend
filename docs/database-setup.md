# Database Setup Guide

Complete guide for setting up and configuring the YesGoddess backend database.

## Prerequisites

- Supabase account (https://supabase.com)
- Node.js 18+ installed
- Database credentials from Supabase project

## Setup Steps

### 1. Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Configure:
   - **Name**: yesgoddess-backend-[environment]
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your users
   - **Plan**: Pro or higher for production (Free for development)

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Get database connection strings from Supabase:
   - Go to Project Settings > Database
   - Copy the connection strings:

   **Direct Connection** (for migrations):
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

   **Pooled Connection** (for application):
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:6543/postgres
   ```

3. Update `.env.local`:
   ```bash
   DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres"
   DATABASE_URL_POOLED="postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:6543/postgres?pgbouncer=true&connection_limit=10"
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Connection Pooling

Update connection pool settings in `.env.local` based on your Supabase plan:

**Free Tier** (up to 15 connections):
```bash
DB_MAX_CONNECTIONS="10"
DB_MIN_CONNECTIONS="2"
```

**Pro Tier** (up to 50 connections):
```bash
DB_MAX_CONNECTIONS="30"
DB_MIN_CONNECTIONS="5"
```

**Team/Enterprise** (50-200+ connections):
```bash
DB_MAX_CONNECTIONS="50"
DB_MIN_CONNECTIONS="10"
```

### 5. Set Up Read Replica (Optional, Pro+ plans)

If your Supabase plan includes read replicas:

1. Enable read replica in Supabase dashboard
2. Get replica connection string
3. Add to `.env.local`:
   ```bash
   DATABASE_REPLICA_URL="postgresql://postgres:PASSWORD@replica.YOUR-PROJECT.supabase.co:5432/postgres"
   ```

### 6. Generate Prisma Client

```bash
npm run db:generate
```

### 7. Run Initial Migration

```bash
npm run db:migrate
```

This will:
- Create all database tables
- Set up indexes
- Configure foreign key constraints
- Initialize enums

### 8. Verify Database Health

```bash
npm run db:health
```

This checks:
- Database connectivity
- Connection pool configuration
- Table access
- Index usage
- Performance metrics

### 9. Configure Automated Backups

1. Go to Supabase Dashboard > Settings > Database
2. Verify backup settings:
   - **Automatic Backups**: Enabled
   - **Backup Frequency**: Daily
   - **Retention Period**: 7 days (Free/Pro), 30+ days (Team/Enterprise)

3. Run backup verification:
   ```bash
   npm run db:backup:verify
   ```

### 10. Set Up Monitoring

1. Enable Supabase monitoring:
   - Go to Dashboard > Reports
   - Enable query performance tracking
   - Set up alert emails

2. Configure Sentry (optional):
   ```bash
   SENTRY_DSN="your-sentry-dsn"
   SENTRY_ENVIRONMENT="production"
   ```

## Database Architecture

### Connection Pooling

The application uses PgBouncer for connection pooling:

- **Application Queries**: Use pooled connection (port 6543)
- **Migrations**: Use direct connection (port 5432)
- **Pool Mode**: Transaction mode (recommended for Supabase)

### Read Replica Strategy

When read replica is configured:

- **Write Operations**: Route to primary database
- **Read Operations**: Route to read replica
- **Fallback**: Use primary if replica unavailable

The application automatically handles routing via `executeQuery()` helper:

```typescript
import { executeQuery } from '@/lib/db';

// Read operation - uses replica
const users = await executeQuery('read', (client) => 
  client.user.findMany()
);

// Write operation - uses primary
const user = await executeQuery('write', (client) => 
  client.user.create({ data: { ... } })
);
```

## Migration Workflow

### Development

1. Modify `prisma/schema.prisma`
2. Create migration:
   ```bash
   npm run db:migrate
   ```
3. Review generated SQL in `prisma/migrations/`
4. Test migration
5. Commit migration files

### Production

**IMPORTANT: Always backup before migrating production!**

1. Verify backup exists:
   ```bash
   npm run db:backup:verify
   ```

2. Deploy migration:
   ```bash
   npm run db:migrate:deploy
   ```

3. Verify migration status:
   ```bash
   npm run db:migrate:status
   ```

4. Monitor application for errors

See `prisma/migrations/README.md` for detailed migration best practices.

## Performance Tuning

### Indexes

Critical indexes are automatically created via migrations. Monitor index usage:

```bash
npm run db:health
```

Look for unused indexes (0 scans) and missing indexes (slow queries).

### Connection Pool Tuning

Adjust based on your application load:

1. Monitor active connections in Supabase dashboard
2. If connections frequently maxed out:
   - Increase `DB_MAX_CONNECTIONS` (within plan limits)
   - Add more application instances
   - Implement query optimization

3. If connections mostly idle:
   - Decrease `DB_MAX_CONNECTIONS` (reduce resource usage)
   - Decrease `DB_IDLE_TIMEOUT` (reclaim idle connections faster)

### Query Optimization

1. Enable query logging in development:
   ```bash
   LOG_LEVEL="debug"
   ```

2. Monitor slow queries:
   ```bash
   npm run db:health
   ```

3. Optimize slow queries:
   - Add indexes where needed
   - Use `select` to limit returned fields
   - Implement pagination for large result sets
   - Use database-level aggregations

## Backup & Recovery

### Automated Backups

Supabase handles automated backups:

- **Free/Pro**: Daily backups, 7-day retention
- **Team/Enterprise**: Daily backups, 30+ day retention, PITR available

### Manual Backups

To create a manual backup:

1. Go to Supabase Dashboard > Database > Backups
2. Click "Create backup"
3. Wait for completion (may take several minutes)
4. Download backup file (optional)

### Restore from Backup

**WARNING: This will overwrite your current database!**

1. Go to Supabase Dashboard > Database > Backups
2. Select backup to restore
3. Click "Restore"
4. Confirm restoration
5. Wait for completion
6. Verify data integrity:
   ```bash
   npm run db:health
   npm run db:backup:verify
   ```

### Point-in-Time Recovery (PITR)

Available on Team/Enterprise plans:

1. Go to Supabase Dashboard > Database > PITR
2. Select timestamp to restore to
3. Create new project from PITR snapshot
4. Verify data
5. Switch DNS to new project if needed

## Monitoring & Alerts

### Health Checks

Run regular health checks in production:

```bash
# Add to cron or monitoring system
*/5 * * * * npm run db:health
```

### Performance Monitoring

Monitor these metrics:

- **Query Latency**: P95 should be < 100ms
- **Connection Pool Usage**: Should stay below 80%
- **Slow Query Count**: Should be near 0
- **Error Rate**: Should be < 0.1%
- **Database Size**: Monitor growth trends

### Alerts

Set up alerts in Supabase dashboard:

1. Go to Project Settings > Notifications
2. Configure alerts for:
   - Database CPU > 80%
   - Database memory > 90%
   - Connection pool > 80%
   - Query latency P95 > 500ms
   - Backup failures

## Troubleshooting

### Connection Errors

**Error**: "Too many connections"
- **Cause**: Connection pool exhausted
- **Solution**: Increase `DB_MAX_CONNECTIONS` or add more instances

**Error**: "Connection timeout"
- **Cause**: Database unreachable or overloaded
- **Solution**: Check Supabase status, increase `DB_CONNECTION_TIMEOUT`

### Migration Errors

**Error**: "Migration already applied"
- **Cause**: Migration state mismatch
- **Solution**: 
  ```bash
  npm run db:migrate:resolve -- --applied [migration_name]
  ```

**Error**: "Migration failed"
- **Cause**: SQL syntax error or constraint violation
- **Solution**: Review migration SQL, fix errors, create new migration

### Performance Issues

**Issue**: Slow queries
- **Check**: Run `npm run db:health` to identify slow queries
- **Solution**: Add indexes, optimize query structure

**Issue**: High connection count
- **Check**: Monitor active connections in Supabase dashboard
- **Solution**: Reduce connection pool size, fix connection leaks

## Security Best Practices

1. **Never commit `.env.local`** - Contains sensitive credentials
2. **Rotate database passwords** regularly (quarterly)
3. **Use read-only replicas** for analytics/reporting
4. **Enable Row Level Security** for multi-tenant tables
5. **Monitor audit logs** for suspicious activity
6. **Limit connection strings** to trusted IPs only
7. **Use SSL/TLS** for all database connections (enabled by default)

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **Internal Wiki**: See #engineering-database on Slack

## Appendix

### Useful SQL Queries

**Check table sizes**:
```sql
SELECT 
  schemaname || '.' || tablename as table,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

**Check connection count**:
```sql
SELECT 
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) as total
FROM pg_stat_activity
WHERE datname = current_database();
```

**Check slow queries**:
```sql
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```
