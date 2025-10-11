# File Management - Quick Reference

## ✅ Implementation Checklist

All features have been successfully implemented:

- [x] **File Organization Structure**
  - [x] Hierarchical path construction
  - [x] Path decomposition utilities
  - [x] Path validation
  - [x] Environment-based multi-tenancy
  - [x] Date-based organization

- [x] **UUID-Based Naming Conventions**
  - [x] Nanoid generation (21 chars, URL-safe)
  - [x] Filename sanitization
  - [x] Variant naming (thumbnails, previews)
  - [x] Version naming patterns
  - [x] Storage key utilities

- [x] **File Versioning System**
  - [x] Version creation with lineage tracking
  - [x] Version history retrieval
  - [x] Current version detection
  - [x] Version restoration
  - [x] Version comparison
  - [x] Retention policy cleanup
  - [x] Database schema support (version, parent_asset_id)

- [x] **File Relationship Tracking**
  - [x] Relationship types (8 types defined)
  - [x] Bidirectional relationship queries
  - [x] Circular dependency prevention
  - [x] Graph traversal
  - [x] Impact analysis (affected assets)
  - [x] Visualization graph building
  - [x] Deletion validation
  - [x] Database table + migration (file_relationships)

- [x] **Bulk Delete Operations**
  - [x] Preview mode with detailed analysis
  - [x] Permission validation per asset
  - [x] Active license checking
  - [x] Relationship warnings
  - [x] Batch processing (50 per batch)
  - [x] Transaction boundaries
  - [x] Soft delete implementation
  - [x] Audit logging
  - [x] API endpoints (preview + execute)

- [x] **Archive Functionality**
  - [x] Archive with reason tracking
  - [x] Unarchive capability
  - [x] Archive metadata storage
  - [x] Archived asset retrieval
  - [x] Status-based filtering
  - [x] Reversible archival
  - [x] API endpoints (archive, unarchive, list)

- [x] **Storage Usage Reporting**
  - [x] Time-series metrics capture
  - [x] Per-entity metrics (user/project/brand/platform)
  - [x] Storage trends calculation
  - [x] Comprehensive report generation
  - [x] Quota checking
  - [x] Storage analytics (dormant files, duplicates)
  - [x] Database table + migration (storage_metrics)
  - [x] Scheduled job (daily at 2 AM)
  - [x] API endpoints (reports, metrics)

## 📁 Files Created

### Core Services
- `src/lib/storage/file-organization.ts` - Path construction & organization
- `src/lib/storage/file-versioning.ts` - Version management
- `src/lib/storage/file-relationships.ts` - Relationship tracking
- `src/lib/storage/file-management.ts` - Bulk operations & archiving
- `src/lib/storage/storage-reporting.ts` - Usage metrics & reporting

### Database Migrations
- `prisma/migrations/015_file_relationships_table.sql` - Relationships schema
- `prisma/migrations/016_storage_metrics_table.sql` - Metrics schema
- Updated `prisma/schema.prisma` - Added models:
  - FileRelationship
  - StorageMetrics
  - Relations on IpAsset

### API Endpoints
- `src/app/api/admin/storage/bulk-delete/preview/route.ts`
- `src/app/api/admin/storage/bulk-delete/execute/route.ts`
- `src/app/api/admin/storage/archive/route.ts`
- `src/app/api/admin/storage/unarchive/route.ts`
- `src/app/api/admin/storage/reports/route.ts`

### Background Jobs
- `src/jobs/storage-metrics-calculation.job.ts`

### Documentation
- `docs/infrastructure/storage/file-management.md` - Complete documentation

## 🚀 Quick Start

### 1. Run Database Migrations
```bash
# Apply new tables
psql $DATABASE_URL -f prisma/migrations/015_file_relationships_table.sql
psql $DATABASE_URL -f prisma/migrations/016_storage_metrics_table.sql

# Regenerate Prisma client
npx prisma generate
```

### 2. Schedule Storage Metrics Job
```typescript
import { scheduleStorageMetricsJob } from '@/jobs/storage-metrics-calculation.job';

// Add to job scheduler
const job = scheduleStorageMetricsJob();
jobQueue.add(job.name, {}, {
  repeat: { cron: job.schedule },
  ...job.options,
});
```

### 3. Test API Endpoints
```bash
# Preview bulk delete
curl -X POST http://localhost:3000/api/admin/storage/bulk-delete/preview \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assetIds": ["asset_123"]}'

# Get storage report
curl http://localhost:3000/api/admin/storage/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 📊 Usage Examples

### Create Version
```typescript
import { FileVersioningService } from '@/lib/storage/file-versioning';

const versioningService = new FileVersioningService(prisma, storageProvider);

await versioningService.createVersion({
  parentAssetId: 'asset_123',
  file: fileBuffer,
  filename: 'updated.jpg',
  contentType: 'image/jpeg',
  userId: 'user_456',
  reason: 'Quality improvement',
});
```

### Track Relationship
```typescript
import { FileRelationshipService, FileRelationshipType } from '@/lib/storage/file-relationships';

const relationshipService = new FileRelationshipService(prisma);

await relationshipService.createRelationship({
  sourceAssetId: 'thumbnail_123',
  targetAssetId: 'original_456',
  relationshipType: FileRelationshipType.DERIVED_FROM,
  userId: 'system',
});
```

### Archive Assets
```typescript
import { FileManagementService } from '@/lib/storage/file-management';

const fileManagement = new FileManagementService(prisma, storageProvider);

await fileManagement.archiveAssets({
  assetIds: ['asset_1', 'asset_2'],
  reason: 'Project completed',
  userId: 'admin_123',
});
```

### Check Storage Usage
```typescript
import { StorageReportingService } from '@/lib/storage/storage-reporting';

const reporting = new StorageReportingService(prisma);

const usage = await reporting.getCurrentUsage('user', 'user_123');
console.log(`Used: ${reporting.formatBytes(usage.totalBytes)}`);
```

## 🔑 Key Features

### Safety & Security
- ✅ Admin-only operations
- ✅ Permission validation per asset
- ✅ Active license protection
- ✅ Preview before delete
- ✅ Soft delete with recovery
- ✅ Comprehensive audit logging

### Performance
- ✅ Batch processing (50/batch)
- ✅ Transaction boundaries
- ✅ Indexed queries
- ✅ Depth-limited traversal
- ✅ Efficient aggregations

### Scalability
- ✅ Time-series metrics storage
- ✅ Entity-level tracking
- ✅ Hierarchical organization
- ✅ Graph-based relationships
- ✅ Background job processing

## 📈 Monitoring

### Check Storage Metrics
```sql
-- Latest platform storage
SELECT * FROM storage_metrics 
WHERE entity_type = 'platform' 
ORDER BY snapshot_date DESC 
LIMIT 1;

-- User storage trends
SELECT snapshot_date, total_bytes, file_count 
FROM storage_metrics 
WHERE entity_type = 'user' AND entity_id = 'user_123'
ORDER BY snapshot_date DESC 
LIMIT 30;
```

### Check Relationships
```sql
-- Asset relationship count
SELECT source_asset_id, COUNT(*) as relationship_count
FROM file_relationships
WHERE deleted_at IS NULL
GROUP BY source_asset_id
ORDER BY relationship_count DESC
LIMIT 10;
```

### Check Versions
```sql
-- Assets with most versions
SELECT parent_asset_id, COUNT(*) as version_count
FROM ip_assets
WHERE parent_asset_id IS NOT NULL AND deleted_at IS NULL
GROUP BY parent_asset_id
ORDER BY version_count DESC
LIMIT 10;
```

## 🎯 Next Steps

1. **Apply Migrations**
   - Run SQL migrations
   - Regenerate Prisma client
   - Verify schema changes

2. **Schedule Jobs**
   - Configure storage metrics job
   - Set up job monitoring
   - Test job execution

3. **Test Features**
   - Create test assets
   - Test versioning flow
   - Test bulk operations
   - Verify reports

4. **Configure Policies**
   - Set retention policies
   - Define quota limits
   - Configure archive rules

5. **Monitor & Optimize**
   - Review storage growth
   - Analyze relationships
   - Optimize queries
   - Tune batch sizes

## 📞 Support

For questions or issues:
- Documentation: `docs/infrastructure/storage/file-management.md`
- API Reference: See documentation above
- Code Location: `src/lib/storage/`

---

**Status:** ✅ Complete  
**Date:** October 2025  
**Version:** 1.0.0
