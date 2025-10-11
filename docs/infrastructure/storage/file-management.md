# File Management System Documentation

## Overview

The file management system provides comprehensive capabilities for organizing, versioning, tracking relationships, and managing file assets at scale. This documentation covers all implemented features.

## Features Implemented

### 1. File Organization Structure

**Location:** `src/lib/storage/file-organization.ts`

Provides a hierarchical storage structure that organizes files logically:

**Path Pattern:**
```
{environment}/{brand-id}/{project-id}/{asset-type}/{year}/{month}/{assetId}_{filename}
```

**Example:**
```
prod/brand_abc123/proj_xyz789/image/2025/10/asset_def456_photo.jpg
```

**Functions:**
- `constructStoragePath()` - Generate organized storage paths
- `decomposeStoragePath()` - Extract components from storage keys
- `validateStoragePath()` - Security validation
- `generateAssetStoragePath()` - Complete path generation with UUID
- `generateVariantPaths()` - Generate thumbnail/preview paths

**Benefits:**
- Easy asset location and discovery
- Time-based organization for lifecycle management
- Multi-tenant separation
- Scalable hierarchy

---

### 2. UUID-Based Naming Conventions

**Location:** `src/lib/utils/storage.ts`

Uses nanoid (21 characters, URL-safe) for collision-resistant identifiers.

**Naming Pattern:**
- Original files: `{assetId}_{sanitized-filename}.{ext}`
- Thumbnails: `{assetId}_thumb_{size}.jpg`
- Previews: `{assetId}_preview.{ext}`
- Versions: `{assetId}/v{version}_{filename}`

**Functions:**
- `generateCuid()` - Generate unique asset IDs
- `sanitizeFilename()` - Clean and normalize filenames
- `generateAssetKey()` - Construct complete storage keys
- `generateThumbnailKey()` - Create thumbnail paths
- `generatePreviewKey()` - Create preview paths

---

### 3. File Versioning System

**Location:** `src/lib/storage/file-versioning.ts`

Tracks evolution of files over time with complete history.

**Schema:**
- Uses `version` field (integer) on `ip_assets` table
- Uses `parent_asset_id` for version lineage
- Maintains complete version chain

**Key Functions:**
```typescript
// Create new version
await versioningService.createVersion({
  parentAssetId: 'asset_123',
  file: fileBuffer,
  filename: 'updated_photo.jpg',
  contentType: 'image/jpeg',
  userId: 'user_456',
  reason: 'Updated image quality',
});

// Get version history
const history = await versioningService.getVersionHistory({
  parentAssetId: 'asset_123',
  orderBy: 'desc',
});

// Restore previous version
await versioningService.restoreVersion({
  versionId: 'version_789',
  userId: 'user_456',
  reason: 'Reverting to previous approved version',
});

// Compare versions
const comparison = await versioningService.compareVersions(
  'version_1',
  'version_2'
);

// Cleanup old versions (retention policy)
await versioningService.cleanupOldVersions({
  assetId: 'asset_123',
  keepLastN: 10,
  userId: 'admin_123',
});
```

**Features:**
- Automatic version numbering
- Version metadata tracking
- Restore previous versions
- Version comparison
- Retention policies

---

### 4. File Relationship Tracking

**Location:** `src/lib/storage/file-relationships.ts`

Creates graph-like connections between related assets.

**Database:**
- Table: `file_relationships`
- Indexes: source_asset_id, target_asset_id, relationship_type
- Migration: `015_file_relationships_table.sql`

**Relationship Types:**
- `DERIVED_FROM` - Asset created from another (e.g., thumbnail)
- `CUTDOWN_OF` - Shortened version
- `REPLACEMENT_FOR` - New asset supersedes old
- `VARIATION_OF` - Different version of same concept
- `COMPONENT_OF` - Part of larger composition
- `REFERENCES` - Includes or depends on another
- `TRANSCODED_FROM` - Different format/encoding
- `PREVIEW_OF` - Preview representation

**Usage:**
```typescript
// Create relationship
await relationshipService.createRelationship({
  sourceAssetId: 'thumbnail_123',
  targetAssetId: 'original_456',
  relationshipType: FileRelationshipType.DERIVED_FROM,
  userId: 'user_789',
  metadata: {
    notes: 'Auto-generated thumbnail',
    confidence: 100,
  },
});

// Query relationships
const relationships = await relationshipService.queryRelationships({
  assetId: 'asset_123',
  direction: 'both', // 'outgoing', 'incoming', 'both'
  relationshipTypes: [FileRelationshipType.DERIVED_FROM],
});

// Find affected assets (impact analysis)
const affected = await relationshipService.findAffectedAssets('asset_123');
// Returns: { directDependents: [...], allAffected: [...] }

// Build visualization graph
const graph = await relationshipService.buildRelationshipGraph(
  'asset_123',
  { maxDepth: 3 }
);
// Returns: { nodes: [...], edges: [...] }

// Validate before deletion
const validation = await relationshipService.validateDeletion('asset_123');
// Returns: { canDelete: boolean, blockers: [...], warnings: [...] }
```

**Features:**
- Circular dependency prevention
- Bidirectional queries
- Graph traversal
- Impact analysis
- Deletion validation

---

### 5. Bulk Delete Operations

**Location:** `src/lib/storage/file-management.ts`

Safe bulk deletion with comprehensive safeguards.

**API Endpoints:**
- `POST /api/admin/storage/bulk-delete/preview` - Preview operation
- `POST /api/admin/storage/bulk-delete/execute` - Execute deletion

**Usage:**
```typescript
// Preview what would be deleted
const preview = await fileManagementService.previewBulkDelete({
  assetIds: ['asset_1', 'asset_2', 'asset_3'],
  // OR use filter criteria
  filterCriteria: {
    projectId: 'project_123',
    status: 'DRAFT',
    olderThanDays: 90,
  },
  userId: 'admin_123',
  userRole: UserRole.ADMIN,
});
// Returns: { totalAssets, totalSizeBytes, assetsToDelete, blockers, warnings, canProceed }

// Execute bulk delete
const result = await fileManagementService.executeBulkDelete({
  assetIds: ['asset_1', 'asset_2'],
  userId: 'admin_123',
  userRole: UserRole.ADMIN,
});
// Returns: { jobId, totalAssets, status }
```

**Safety Features:**
- Preview mode shows exactly what will be deleted
- Permission validation per asset
- Active license checking
- Relationship impact analysis
- Batch size limits (max 1000 per operation)
- Transaction boundaries
- Comprehensive audit logging
- Soft delete with recovery grace period

**Validation Checks:**
- User has permission for each asset
- No active licenses on asset
- Relationship warnings
- Derivative warnings

---

### 6. Archive Functionality

**Location:** `src/lib/storage/file-management.ts`

Remove files from active use without permanent deletion.

**API Endpoints:**
- `POST /api/admin/storage/archive` - Archive assets
- `POST /api/admin/storage/unarchive` - Restore assets
- `GET /api/admin/storage/archive` - List archived assets

**Usage:**
```typescript
// Archive assets
const result = await fileManagementService.archiveAssets({
  assetIds: ['asset_1', 'asset_2'],
  reason: 'Project completed',
  userId: 'admin_123',
  metadata: {
    category: 'completed_projects',
    retentionUntil: '2026-01-01',
  },
});
// Returns: { archived: 2, failed: 0, errors: [] }

// Unarchive assets
const restoreResult = await fileManagementService.unarchiveAssets({
  assetId: 'asset_123',
  userId: 'admin_123',
});

// Get archived assets
const archived = await fileManagementService.getArchivedAssets({
  projectId: 'project_123',
  limit: 50,
  offset: 0,
});
// Returns: { assets, total, hasMore }
```

**Features:**
- Reversible archival
- Archive reason tracking
- Metadata capture
- Status-based filtering
- Archive date tracking
- Separate from active queries

**Archive Tiers:**
- Temporary archive (might reactivate soon)
- Compliance archive (legal retention)
- Cold storage (rarely accessed)
- Pending deletion (scheduled removal)

---

### 7. Storage Usage Reporting

**Location:** `src/lib/storage/storage-reporting.ts`

Detailed insights into storage consumption and trends.

**Database:**
- Table: `storage_metrics`
- Migration: `016_storage_metrics_table.sql`
- Stores time-series snapshots

**API Endpoints:**
- `GET /api/admin/storage/reports` - Comprehensive storage report
- `GET /api/admin/storage/metrics` - Time-series metrics

**Usage:**
```typescript
// Capture storage snapshot (run daily via job)
await storageReportingService.captureStorageSnapshot();

// Get current usage
const usage = await storageReportingService.getCurrentUsage(
  'user',
  'user_123'
);
// Returns: { totalBytes, fileCount, averageFileSize, breakdownByType }

// Get storage trends
const trends = await storageReportingService.getStorageTrends(
  'platform',
  undefined,
  'week' // 'day', 'week', 'month'
);
// Returns: { current, previous, growthRate, growthBytes }

// Generate comprehensive report
const report = await storageReportingService.generateStorageReport({
  startDate: new Date('2025-09-01'),
  endDate: new Date('2025-10-11'),
});
// Returns: { summary, breakdown, trends, topConsumers }

// Check quota
const quota = await storageReportingService.checkQuota(
  'user',
  'user_123',
  BigInt(10 * 1024 * 1024 * 1024) // 10GB
);
// Returns: { quotaBytes, usedBytes, remainingBytes, percentUsed, isExceeded }

// Get optimization insights
const analytics = await storageReportingService.getStorageAnalytics();
// Returns: { dormantFiles, potentialDuplicates, optimizationOpportunities }
```

**Metrics Tracked:**
- Total bytes by entity (user/project/brand/platform)
- File counts
- Average file sizes
- Largest files
- Growth rates (basis points)
- Breakdown by asset type
- Historical trends

**Scheduled Job:**
- Job: `storage-metrics-calculation.job.ts`
- Schedule: Daily at 2 AM
- Captures: Platform, user, project, and brand metrics

---

## API Reference

### Bulk Delete Preview
```http
POST /api/admin/storage/bulk-delete/preview
Authorization: Admin only
Content-Type: application/json

{
  "assetIds": ["asset_1", "asset_2"],
  "filterCriteria": {
    "projectId": "project_123",
    "status": "DRAFT",
    "olderThanDays": 90
  }
}
```

### Bulk Delete Execute
```http
POST /api/admin/storage/bulk-delete/execute
Authorization: Admin only
Content-Type: application/json

{
  "assetIds": ["asset_1", "asset_2"],
  "skipConfirmation": false
}
```

### Archive Assets
```http
POST /api/admin/storage/archive
Authorization: Admin only
Content-Type: application/json

{
  "assetIds": ["asset_1", "asset_2"],
  "reason": "Project completed",
  "metadata": {
    "retentionUntil": "2026-01-01"
  }
}
```

### Unarchive Assets
```http
POST /api/admin/storage/unarchive
Authorization: Admin only
Content-Type: application/json

{
  "assetIds": ["asset_1", "asset_2"]
}
```

### Get Archived Assets
```http
GET /api/admin/storage/archive?userId=user_123&limit=50&offset=0
Authorization: Admin only
```

### Storage Reports
```http
GET /api/admin/storage/reports?startDate=2025-09-01&endDate=2025-10-11
Authorization: Admin only
```

---

## Database Schema Changes

### File Relationships Table
```sql
CREATE TABLE file_relationships (
  id TEXT PRIMARY KEY,
  source_asset_id TEXT NOT NULL REFERENCES ip_assets(id) ON DELETE CASCADE,
  target_asset_id TEXT NOT NULL REFERENCES ip_assets(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT no_self_reference CHECK (source_asset_id != target_asset_id)
);
```

### Storage Metrics Table
```sql
CREATE TABLE storage_metrics (
  id TEXT PRIMARY KEY,
  snapshot_date TIMESTAMPTZ NOT NULL,
  entity_type TEXT NOT NULL, -- 'user', 'project', 'brand', 'platform'
  entity_id TEXT,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  average_file_size BIGINT NOT NULL DEFAULT 0,
  largest_file_size BIGINT NOT NULL DEFAULT 0,
  largest_file_id TEXT,
  storage_trend_bps INTEGER NOT NULL DEFAULT 0,
  breakdown_by_type JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Updated IP Assets Model
Added relations:
- `sourceRelationships` - FileRelationship[]
- `targetRelationships` - FileRelationship[]

---

## Background Jobs

### Storage Metrics Calculation
- **File:** `src/jobs/storage-metrics-calculation.job.ts`
- **Schedule:** Daily at 2 AM (cron: `0 2 * * *`)
- **Purpose:** Calculate and store storage metrics snapshots
- **Duration:** ~5-10 minutes depending on data volume

---

## Integration Guide

### Adding Version Support to Upload Flow
```typescript
// After file upload confirmation
if (isNewVersion) {
  await versioningService.createVersion({
    parentAssetId: existingAssetId,
    file: uploadedFile,
    filename: originalFilename,
    contentType: mimeType,
    userId,
    reason: 'User uploaded new version',
  });
}
```

### Adding Relationship Tracking to Processing
```typescript
// After thumbnail generation
await relationshipService.createRelationship({
  sourceAssetId: thumbnailAssetId,
  targetAssetId: originalAssetId,
  relationshipType: FileRelationshipType.DERIVED_FROM,
  userId: 'system',
  metadata: { generatedBy: 'thumbnail-job' },
});
```

### Checking Storage Quota Before Upload
```typescript
const quota = await storageReportingService.checkQuota(
  'user',
  userId,
  userQuotaBytes
);

if (quota.isExceeded) {
  throw new Error('Storage quota exceeded');
}
```

---

## Performance Considerations

### Indexing
All critical queries are indexed:
- Storage metrics: `(entity_type, entity_id, snapshot_date DESC)`
- File relationships: `(source_asset_id)`, `(target_asset_id)`, `(relationship_type)`
- IP assets: `(created_by, status)`, `(project_id, status)`, `(storage_key)`

### Batch Operations
- Bulk deletes process in batches of 50
- Storage metrics capture uses transactions
- Relationship traversal has depth limits (default: 10)

### Caching
- Storage metrics queries cache for 1 hour
- Relationship graphs cache for 15 minutes
- Quota checks cache for 5 minutes

---

## Security & Safeguards

### Permission Checks
- All operations verify user role (ADMIN required)
- Asset ownership verified for non-admin operations
- Active license checking prevents premature deletion

### Validation
- Path traversal prevention
- Circular dependency detection
- File size validation
- Content type validation

### Audit Logging
- All bulk operations logged
- Archive/unarchive tracked
- Version creation recorded
- Relationship changes logged

---

## Future Enhancements

### Phase 2 (Planned)
- Automated archival policies
- Cold storage tier migration
- Duplicate file detection
- Storage optimization suggestions
- AI-powered relationship detection

### Phase 3 (Planned)
- Advanced quota management with overages
- Cost allocation by project/brand
- Predictive capacity planning
- Storage heatmaps
- Intelligent file cleanup recommendations

---

## Troubleshooting

### Common Issues

**Storage metrics not updating:**
- Check if job is scheduled: `storage-metrics-calculation.job.ts`
- Manually trigger: `await triggerStorageMetricsCalculation()`
- Check job logs for errors

**Bulk delete stuck:**
- Check audit logs for progress
- Review job status in database
- Verify no active transactions blocking

**Relationship cycle detected:**
- Review relationship graph
- Identify circular dependency
- Remove problematic relationship

---

## Maintenance

### Daily Tasks
- Review bulk delete operations
- Check storage growth trends
- Monitor quota usage

### Weekly Tasks
- Analyze storage reports
- Review archived assets
- Check for orphaned relationships

### Monthly Tasks
- Run cleanup policies
- Audit relationship integrity
- Optimize storage metrics table
- Review and update retention policies

---

**Last Updated:** October 2025
**Version:** 1.0.0
**Maintained By:** YesGoddess Backend Team
