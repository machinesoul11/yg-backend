# Database Migrations

This directory contains SQL migration files for the YesGoddess backend database.

## Migration Files

### Blog & Content Management
- `add_blog_system_tables.sql` - Blog posts, categories, and content management
- `add_blog_redirects_table.sql` - URL redirect management
- `add_content_workflow_features.sql` - Content workflow and assignment
- `add_featured_posts_field.sql` - Featured posts functionality
- `add_featured_posts_functionality.sql` - Extended featured posts features
- `add_robots_config_table.sql` - Robots.txt configuration
- `add_performance_metrics.sql` - Performance tracking
- `add_media_management_tables.sql` - Media library and collections

### Financial & Compliance
- `add_tax_compliance_tables.sql` - Tax reporting and compliance

### IP & Ownership
- `add_ownership_dispute_fields.sql` - Ownership dispute tracking

### Notifications
- `add_message_notification_type.sql` - Message notification types

### Search Infrastructure (NEW - 2025-10-17)
- `add_search_infrastructure_indexes.sql` - Comprehensive search indexes
- `rollback_search_infrastructure_indexes.sql` - Rollback script for search indexes

## Search Infrastructure Migration

### Overview
The search infrastructure migration adds 28 specialized indexes to enable:
- Full-text search on IP assets and creator profiles
- Fuzzy matching for typo-tolerant searches
- Efficient JSONB field queries
- Optimized composite indexes for common filter patterns

### Details
- **IP Assets**: 14 indexes (full-text, trigram, composite, JSONB, covering)
- **Creators**: 14 indexes (specialties, social links, verification status, etc.)
- **Extensions**: Enables `pg_trgm` and `unaccent`
- **Deployment**: All indexes created with `CONCURRENTLY` for zero-downtime

### Documentation
- 📖 [Full Implementation Guide](../docs/infrastructure/database/SEARCH_INFRASTRUCTURE_INDEXES_IMPLEMENTATION.md)
- 📖 [Quick Reference](../docs/infrastructure/database/SEARCH_INDEXES_QUICK_REFERENCE.md)
- 📖 [Database Functions & Search](../docs/infrastructure/database/functions-and-search.md)

### Applying the Migration

```bash
# Connect to database
psql $DATABASE_URL

# Apply search indexes
\i migrations/add_search_infrastructure_indexes.sql

# Verify indexes created
\di+ idx_ip_assets_*
\di+ idx_creators_*
```

### Rollback

```bash
# Rollback search indexes if needed
psql $DATABASE_URL -f migrations/rollback_search_infrastructure_indexes.sql
```

## Migration Guidelines

### Best Practices
1. **Use CONCURRENTLY**: Always create indexes with `CONCURRENTLY` to avoid table locks
2. **Test First**: Test migrations on staging before production
3. **Backup**: Always backup before applying migrations
4. **Monitor**: Check index usage after deployment
5. **Rollback Plan**: Have a rollback script ready

### Index Maintenance
```sql
-- Update statistics
ANALYZE ip_assets;
ANALYZE creators;

-- Reindex to prevent bloat
REINDEX TABLE CONCURRENTLY ip_assets;
REINDEX TABLE CONCURRENTLY creators;

-- Check index usage
SELECT 
  tablename, indexname, idx_scan, 
  pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## Migration Order

Migrations should be applied in chronological order based on dependencies:

1. Core schema (Prisma)
2. Constraints and functions
3. Blog and content tables
4. Financial and compliance
5. Search infrastructure (latest)

## Troubleshooting

### Index Creation Fails
```bash
# Check for existing index
psql $DATABASE_URL -c "\di idx_name"

# Drop if exists
psql $DATABASE_URL -c "DROP INDEX CONCURRENTLY IF EXISTS idx_name;"

# Retry creation
```

### Out of Memory
```sql
-- Increase memory for index creation
SET maintenance_work_mem = '1GB';
```

### Slow Creation
```sql
-- Check progress
SELECT * FROM pg_stat_progress_create_index;
```

## Related Documentation

- [Database Schema](../prisma/schema.prisma)
- [Query Filtering System](../src/lib/query-filters/README.md)
- [Infrastructure Documentation](../docs/infrastructure/database/)
