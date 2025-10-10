# Database Configuration Checklist

Complete checklist for YesGoddess backend database setup and configuration.

## ✅ Initial Setup

### Environment Configuration
- [ ] Copy `.env.example` to `.env.local`
- [ ] Update `DATABASE_URL` with Supabase credentials
- [ ] Update `DATABASE_URL_POOLED` with pooled connection string
- [ ] Configure `DATABASE_REPLICA_URL` (if using read replica)
- [ ] Set connection pool parameters based on Supabase plan
- [ ] Configure backup settings
- [ ] Set health check token (optional)

### Supabase Project Setup
- [ ] Create Supabase project
- [ ] Copy connection strings from project settings
- [ ] Enable automated backups
- [ ] Configure backup retention period
- [ ] Set up read replica (Pro+ plans only)
- [ ] Enable query performance tracking
- [ ] Configure alert notifications

### Initial Database Setup
- [ ] Run `npm install` to install dependencies
- [ ] Run `npm run db:generate` to generate Prisma Client
- [ ] Run `npm run db:migrate` to apply initial migrations
- [ ] Run `npm run db:health` to verify connectivity
- [ ] Run `npm run db:backup:verify` to verify backup config
- [ ] Run `npm run db:seed` to add sample data (optional, dev only)

## ✅ Production Configuration

### Security
- [ ] Rotate default database password
- [ ] Configure IP allowlist (if required)
- [ ] Enable SSL/TLS (enabled by default in Supabase)
- [ ] Set up Row-Level Security policies
- [ ] Configure audit logging
- [ ] Review and apply RLS policies (`prisma/migrations/rls-policies.sql`)

### Performance
- [ ] Apply performance indexes (`prisma/migrations/indexes.sql`)
- [ ] Configure connection pool size for production load
- [ ] Enable query performance monitoring
- [ ] Set up slow query alerts
- [ ] Verify index usage with `npm run db:health`
- [ ] Configure read replica routing

### Monitoring & Alerts
- [ ] Set up health check monitoring endpoint
- [ ] Configure Supabase alerts:
  - [ ] CPU usage > 80%
  - [ ] Memory usage > 90%
  - [ ] Connection pool > 80%
  - [ ] Slow queries detected
  - [ ] Backup failures
- [ ] Set up external monitoring (e.g., Datadog, New Relic)
- [ ] Configure alert destinations (email, Slack, PagerDuty)

### Backup & Recovery
- [ ] Verify automated backups are running
- [ ] Test manual backup creation
- [ ] Document restore procedure
- [ ] Test database restore (on staging)
- [ ] Configure Point-in-Time Recovery (Enterprise plans)
- [ ] Set up backup monitoring

## ✅ Development Workflow

### Migration Management
- [ ] Review migration workflow documentation
- [ ] Test migration process on staging
- [ ] Set up migration approval process
- [ ] Document rollback procedures
- [ ] Configure CI/CD for automated migrations

### Code Integration
- [ ] Import database client in application code
- [ ] Implement read/write routing
- [ ] Add error handling for database operations
- [ ] Configure connection retry logic
- [ ] Implement query optimization patterns

### Testing
- [ ] Set up test database
- [ ] Configure test environment variables
- [ ] Write database integration tests
- [ ] Test migration rollback procedures
- [ ] Verify RLS policies work correctly

## ✅ Operational Readiness

### Documentation
- [ ] Review complete setup guide (`docs/database-setup.md`)
- [ ] Share quick reference with team (`DATABASE_QUICK_REFERENCE.md`)
- [ ] Document custom queries and procedures
- [ ] Create runbook for common issues
- [ ] Document incident response procedures

### Team Training
- [ ] Train team on database client usage
- [ ] Share migration workflow best practices
- [ ] Review security policies and RLS
- [ ] Demonstrate monitoring dashboards
- [ ] Conduct backup/restore drills

### Monitoring Setup
- [ ] Configure health check cron job
- [ ] Set up metrics dashboard
- [ ] Enable query performance tracking
- [ ] Configure log aggregation
- [ ] Set up database cost monitoring

## ✅ Performance Tuning

### Query Optimization
- [ ] Review slow query reports
- [ ] Add missing indexes
- [ ] Optimize N+1 query patterns
- [ ] Implement query result caching
- [ ] Use select projections for large objects

### Connection Management
- [ ] Monitor connection pool usage
- [ ] Tune pool size based on load
- [ ] Configure connection timeouts
- [ ] Implement connection retry logic
- [ ] Monitor connection errors

### Scaling Preparation
- [ ] Plan for database scaling strategy
- [ ] Configure read replica for read-heavy operations
- [ ] Implement database sharding (if needed)
- [ ] Set up connection pooling monitoring
- [ ] Plan for vertical/horizontal scaling

## ✅ Maintenance Procedures

### Regular Tasks
- [ ] Weekly: Review slow query reports
- [ ] Weekly: Check database size growth
- [ ] Monthly: Review and optimize indexes
- [ ] Monthly: Analyze query patterns
- [ ] Quarterly: Rotate database passwords
- [ ] Quarterly: Test backup restore procedure

### Monitoring Checklist
- [ ] Daily: Check database health status
- [ ] Daily: Review error logs
- [ ] Weekly: Analyze performance metrics
- [ ] Weekly: Review backup success rate
- [ ] Monthly: Check compliance with SLAs

## 📊 Target Metrics

### Performance Benchmarks
- [ ] Average query time: < 50ms
- [ ] P95 query time: < 100ms
- [ ] P99 query time: < 500ms
- [ ] Connection pool usage: < 80%
- [ ] Database uptime: > 99.9%

### Capacity Planning
- [ ] Monitor database size growth rate
- [ ] Track connection count trends
- [ ] Monitor query volume trends
- [ ] Plan for storage scaling
- [ ] Review cost projections

## 🔗 Quick Commands Reference

### Health & Status
```bash
npm run db:health           # Full health check
npm run db:backup:verify    # Verify backup config
npm run db:migrate:status   # Check migrations
```

### Development
```bash
npm run db:generate         # Generate Prisma Client
npm run db:migrate          # Create migration
npm run db:studio          # Open database GUI
npm run db:seed            # Seed sample data
```

### Production
```bash
npm run db:migrate:deploy   # Apply migrations
npm run db:backup:verify    # Verify backups
```

## 📚 Resources

- **Setup Guide**: `docs/database-setup.md`
- **Quick Reference**: `DATABASE_QUICK_REFERENCE.md`
- **Implementation Summary**: `DATABASE_SETUP_SUMMARY.md`
- **File Index**: `DATABASE_FILES_INDEX.md`
- **Migration Guide**: `prisma/migrations/README.md`
- **Database README**: `src/lib/db/README.md`

---

**Last Updated**: October 10, 2025  
**Status**: Database Configuration Complete
