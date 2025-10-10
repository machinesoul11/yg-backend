# Database Configuration - YesGoddess Backend

This directory contains all database configuration, utilities, and monitoring tools for the YesGoddess platform.

## 📁 Structure

```
src/lib/db/
├── index.ts              # Main database client with read/write routing
├── connection-pool.ts    # PgBouncer connection pool configuration
├── monitoring.ts         # Database metrics and monitoring utilities
└── backup.ts            # Backup verification and reporting

src/scripts/
├── db-health-check.ts   # Health check CLI tool
└── verify-backup.ts     # Backup verification CLI tool

src/app/api/
├── health/database/     # Health check API endpoint
└── admin/database/      # Admin database metrics API
```

## 🚀 Quick Start

### 1. Initial Setup

```bash
# Copy environment template
cp .env.example .env.local

# Configure your Supabase credentials in .env.local
# Then run the setup script
./scripts/setup-database.sh
```

### 2. Required Environment Variables

```bash
# Primary database (direct connection for migrations)
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Pooled connection (for application)
DATABASE_URL_POOLED="postgresql://user:pass@host:6543/db?pgbouncer=true"

# Read replica (optional, Pro+ plans)
DATABASE_REPLICA_URL="postgresql://user:pass@replica-host:5432/db"
```

## 📚 Features

### Connection Management

- **Automatic Read/Write Routing**: Queries automatically route to primary or replica
- **Connection Pooling**: PgBouncer integration with configurable pool size
- **Health Monitoring**: Real-time connection health and latency tracking
- **Graceful Shutdown**: Proper cleanup of connections on process exit

### Usage Examples

```typescript
import { prisma, prismaRead, executeQuery } from '@/lib/db';

// Direct usage
const user = await prisma.user.create({ data: { ... } }); // Write to primary
const users = await prismaRead.user.findMany();            // Read from replica

// Automatic routing
const data = await executeQuery('read', (client) => 
  client.user.findMany()
); // Routes to replica

const newUser = await executeQuery('write', (client) => 
  client.user.create({ data: { ... } })
); // Routes to primary
```

### Database Monitoring

Real-time metrics tracking:
- Query performance (avg, P95, P99)
- Connection pool usage
- Slow query detection
- Database size and growth
- Index usage statistics

```bash
# CLI health check
npm run db:health

# API endpoint
curl http://localhost:3000/api/health/database

# Admin metrics (requires auth)
curl http://localhost:3000/api/admin/database/metrics
```

### Backup & Recovery

Automated backup verification:

```bash
# Verify backup configuration
npm run db:backup:verify
```

Features:
- Supabase automated backup integration
- Snapshot metadata collection
- Restore readiness testing
- Comprehensive reporting

## 🔧 Configuration

### Connection Pool Settings

Configure based on your Supabase plan:

**Free Tier** (15 connections max):
```bash
DB_MAX_CONNECTIONS=10
DB_MIN_CONNECTIONS=2
```

**Pro Tier** (50 connections max):
```bash
DB_MAX_CONNECTIONS=30
DB_MIN_CONNECTIONS=5
```

**Team/Enterprise** (200+ connections):
```bash
DB_MAX_CONNECTIONS=50
DB_MIN_CONNECTIONS=10
```

### Performance Tuning

```bash
DB_POOL_MODE=transaction          # session | transaction | statement
DB_CONNECTION_TIMEOUT=20          # Connection timeout (seconds)
DB_IDLE_TIMEOUT=30                # Idle connection timeout (seconds)
DB_STATEMENT_TIMEOUT=60000        # Query timeout (milliseconds)
```

## 📊 Available Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create and apply migration |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:migrate:status` | Check migration status |
| `npm run db:push` | Push schema changes (dev only) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:health` | Run health check |
| `npm run db:backup:verify` | Verify backup config |

## 🔍 Monitoring & Alerts

### Health Check Metrics

The health check provides:
- ✅ Connection status (primary & replica)
- ⏱️ Latency measurements
- 📊 Query performance metrics
- 🔌 Connection pool usage
- 💾 Database size information
- 📈 Index usage statistics

### Performance Benchmarks

Target metrics for production:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Avg Query Time | < 50ms | > 100ms |
| P95 Query Time | < 100ms | > 500ms |
| P99 Query Time | < 500ms | > 1000ms |
| Connection Usage | < 80% | > 90% |
| Database Uptime | > 99.9% | < 99.5% |

### Alert Configuration

Configure alerts in Supabase Dashboard > Settings > Notifications:

1. **Critical** (Immediate)
   - Database unreachable
   - Connection pool exhausted
   - Backup failure

2. **Warning** (15 min delay)
   - High CPU/Memory usage
   - Slow queries detected
   - Connection pool > 80%

3. **Info** (Dashboard only)
   - Daily backup completed
   - Migration applied

## 🛡️ Security

### Best Practices

1. **Never commit credentials**
   - `.env.local` is gitignored
   - Use separate credentials per environment

2. **Rotate passwords regularly**
   - Quarterly rotation recommended
   - Update connection strings in all environments

3. **Use connection limits**
   - Prevent connection exhaustion
   - Configure per-instance limits

4. **Monitor access patterns**
   - Review audit logs weekly
   - Alert on suspicious activity

5. **Enable SSL/TLS**
   - Enabled by default in Supabase
   - Verify in connection string

## 🚨 Troubleshooting

### Common Issues

**Problem**: "Too many connections"
```bash
# Solution: Increase pool size or reduce connections
DB_MAX_CONNECTIONS=20  # Increase if plan allows
```

**Problem**: "Connection timeout"
```bash
# Solution: Increase timeout or check network
DB_CONNECTION_TIMEOUT=30
```

**Problem**: "Slow queries detected"
```bash
# Solution: Check query performance
npm run db:health
# Add indexes where needed
```

**Problem**: "Migration failed"
```bash
# Solution: Check migration status
npm run db:migrate:status
# Resolve conflicts
npm run db:migrate:resolve
```

### Debug Mode

Enable detailed logging:
```bash
# .env.local
LOG_LEVEL=debug
NODE_ENV=development
```

## 📖 Additional Resources

- [Complete Database Setup Guide](../docs/database-setup.md)
- [Migration Workflow](../prisma/migrations/README.md)
- [Database Checklist](../DATABASE_CHECKLIST.md)
- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)

## 🤝 Support

For database-related issues:
1. Check health status: `npm run db:health`
2. Review Supabase dashboard
3. Check internal docs
4. Contact #engineering-database on Slack
