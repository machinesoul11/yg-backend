# 🌐 File Management - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** File Management System  
**Version:** 1.0.0  
**Last Updated:** October 12, 2025

> **Note:** This module is SHARED between the public-facing website (creators uploading assets) and the admin interface (staff managing files). Access levels and permissions differ based on user role.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [File Upload Flow](#file-upload-flow)
10. [Pagination & Filtering](#pagination--filtering)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The File Management System provides comprehensive capabilities for organizing, versioning, tracking relationships, and managing assets across the YesGoddess platform. This guide covers all endpoints and integration patterns needed by the frontend.

### Key Features

- **File Organization** - Hierarchical storage with scalable paths
- **Versioning** - Complete version history with restore capability
- **Relationships** - Track dependencies between assets (thumbnails, derivatives, cutdowns)
- **Bulk Operations** - Safe bulk deletion with safeguards
- **Archive System** - Reversible archival for inactive assets
- **Storage Reporting** - Usage analytics and quota monitoring

### Architecture

```
Frontend (yesgoddess-web)
    ↓
Backend API (ops.yesgoddess.agency)
    ↓
PostgreSQL Database + Cloudflare R2 Storage
```

---

## API Endpoints

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### 🔒 Admin-Only Endpoints

#### 1. Bulk Delete Preview

```http
POST /api/admin/storage/bulk-delete/preview
```

Preview what would be deleted before executing.

**Access:** Admin only  
**Rate Limit:** 30 requests/minute

#### 2. Bulk Delete Execute

```http
POST /api/admin/storage/bulk-delete/execute
```

Execute bulk deletion operation.

**Access:** Admin only  
**Rate Limit:** 10 requests/minute

#### 3. Archive Assets

```http
POST /api/admin/storage/archive
```

Archive one or more assets.

**Access:** Admin only  
**Rate Limit:** 30 requests/minute

#### 4. Unarchive Assets

```http
POST /api/admin/storage/unarchive
```

Restore archived assets.

**Access:** Admin only  
**Rate Limit:** 30 requests/minute

#### 5. Get Archived Assets

```http
GET /api/admin/storage/archive
```

List archived assets with filtering.

**Access:** Admin only  
**Rate Limit:** 60 requests/minute

#### 6. Storage Reports

```http
GET /api/admin/storage/reports
```

Get comprehensive storage usage reports.

**Access:** Admin only  
**Rate Limit:** 20 requests/minute

### 🌐 Shared Endpoints (Implementation in Other Modules)

File uploads, downloads, and basic asset management are handled via the IP Assets module. See `ASSET_PROCESSING_INTEGRATION_GUIDE.md` for details.

---

## TypeScript Type Definitions

Copy these interfaces into your frontend codebase (e.g., `src/types/file-management.ts`):

```typescript
/**
 * File Management Types
 * @module types/file-management
 */

// ============================================
// Enums
// ============================================

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  THREE_D = 'THREE_D',
  OTHER = 'OTHER',
}

export enum AssetStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

export enum FileRelationshipType {
  DERIVED_FROM = 'derived_from',
  CUTDOWN_OF = 'cutdown_of',
  REPLACEMENT_FOR = 'replacement_for',
  VARIATION_OF = 'variation_of',
  COMPONENT_OF = 'component_of',
  REFERENCES = 'references',
  TRANSCODED_FROM = 'transcoded_from',
  PREVIEW_OF = 'preview_of',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

// ============================================
// Bulk Delete
// ============================================

export interface BulkDeletePreviewRequest {
  assetIds?: string[];
  filterCriteria?: {
    projectId?: string;
    status?: AssetStatus;
    type?: AssetType;
    createdBefore?: string; // ISO 8601 date
    olderThanDays?: number;
  };
}

export interface BulkDeleteAssetInfo {
  id: string;
  title: string;
  type: string;
  fileSize: string; // Serialized as string (BigInt)
  hasRelationships: boolean;
  hasActiveLicenses: boolean;
  warnings: string[];
}

export interface BulkDeletePreviewResponse {
  success: boolean;
  data: {
    totalAssets: number;
    totalSizeBytes: string; // Serialized as string (BigInt)
    assetsToDelete: BulkDeleteAssetInfo[];
    blockers: string[];
    warnings: string[];
    canProceed: boolean;
  };
}

export interface BulkDeleteExecuteRequest {
  assetIds?: string[];
  filterCriteria?: BulkDeletePreviewRequest['filterCriteria'];
  skipConfirmation?: boolean;
}

export interface BulkDeleteExecuteResponse {
  success: boolean;
  data: {
    jobId: string;
    totalAssets: number;
    status: 'queued' | 'processing' | 'completed' | 'failed';
  };
}

// ============================================
// Archive
// ============================================

export interface ArchiveAssetsRequest {
  assetId?: string; // Single asset
  assetIds?: string[]; // Multiple assets
  reason: string; // Required - why archiving
  metadata?: Record<string, any>;
}

export interface ArchiveResult {
  archived: number;
  failed: number;
  errors: Array<{
    assetId: string;
    error: string;
  }>;
}

export interface ArchiveAssetsResponse {
  success: boolean;
  data: ArchiveResult;
}

export interface UnarchiveAssetsRequest {
  assetId?: string;
  assetIds?: string[];
}

export interface GetArchivedAssetsQuery {
  userId?: string;
  projectId?: string;
  limit?: number; // Default 50
  offset?: number; // Default 0
}

export interface ArchivedAsset {
  id: string;
  title: string;
  type: AssetType;
  fileSize: string; // Serialized BigInt
  updatedAt: string; // ISO 8601
  metadata?: {
    archiveReason?: string;
    archivedAt?: string;
    archivedBy?: string;
    [key: string]: any;
  };
}

export interface GetArchivedAssetsResponse {
  success: boolean;
  data: {
    assets: ArchivedAsset[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================
// Storage Reports
// ============================================

export interface StorageReportQuery {
  startDate?: string; // ISO 8601 date
  endDate?: string; // ISO 8601 date
}

export interface StorageBreakdownByType {
  bytes: string;
  count: number;
  percentage: number;
}

export interface StorageEntityUsage {
  id: string;
  name: string;
  bytes: string;
}

export interface StorageTrend {
  current: string;
  previous: string;
  growthRate: number; // Percentage
  growthBytes: string;
}

export interface StorageReportResponse {
  success: boolean;
  data: {
    summary: {
      totalBytes: string;
      totalFiles: number;
      averageFileSize: string;
      largestFile: {
        id: string;
        size: string;
        title: string;
      } | null;
    };
    breakdown: {
      byType: Record<string, StorageBreakdownByType>;
      byUser: StorageEntityUsage[];
      byProject: StorageEntityUsage[];
    };
    trends: {
      daily: StorageTrend;
      weekly: StorageTrend;
      monthly: StorageTrend;
    };
    topConsumers: {
      users: StorageEntityUsage[];
      projects: StorageEntityUsage[];
    };
  };
}

// ============================================
// File Organization
// ============================================

export interface PathComponents {
  environment?: string;
  brandId?: string;
  projectId?: string;
  assetType?: string;
  year?: string;
  month?: string;
  assetId?: string;
  filename?: string;
  variant?: string;
}

// ============================================
// Versioning (Part of IP Assets Module)
// ============================================

export interface VersionInfo {
  id: string;
  version: number;
  storageKey: string;
  fileSize: string; // Serialized BigInt
  mimeType: string;
  isCurrent: boolean;
  createdAt: string; // ISO 8601
  createdBy: string;
  metadata?: {
    versionReason?: string;
    [key: string]: any;
  };
}

// ============================================
// Error Types
// ============================================

export interface FileManagementError {
  error: string;
  details?: string;
  code?: string;
}
```

---

## Request/Response Examples

### 1. Bulk Delete Preview

Preview assets that would be deleted:

**Request:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/admin/storage/bulk-delete/preview \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filterCriteria": {
      "projectId": "cm2abc123",
      "status": "DRAFT",
      "olderThanDays": 90
    }
  }'
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "totalAssets": 15,
    "totalSizeBytes": "157286400",
    "assetsToDelete": [
      {
        "id": "cm2asset001",
        "title": "Draft Image 1",
        "type": "IMAGE",
        "fileSize": "10485760",
        "hasRelationships": false,
        "hasActiveLicenses": false,
        "warnings": []
      },
      {
        "id": "cm2asset002",
        "title": "Draft Video",
        "type": "VIDEO",
        "fileSize": "52428800",
        "hasRelationships": true,
        "hasActiveLicenses": false,
        "warnings": ["Has 2 dependent thumbnails"]
      }
    ],
    "blockers": [],
    "warnings": ["2 assets have relationships that will be affected"],
    "canProceed": true
  }
}
```

**Response (Blocked):**

```json
{
  "success": true,
  "data": {
    "totalAssets": 5,
    "totalSizeBytes": "104857600",
    "assetsToDelete": [],
    "blockers": [
      "Asset cm2asset003 has active licenses and cannot be deleted",
      "Asset cm2asset004 is referenced by 3 published assets"
    ],
    "warnings": [],
    "canProceed": false
  }
}
```

### 2. Bulk Delete Execute

Execute the bulk deletion:

**Request:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/admin/storage/bulk-delete/execute \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["cm2asset001", "cm2asset002"],
    "skipConfirmation": false
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "jobId": "bulk_delete_1697123456789_admin_123",
    "totalAssets": 2,
    "status": "processing"
  }
}
```

### 3. Archive Assets

Archive assets with reason:

**Request:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/admin/storage/archive \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["cm2asset001", "cm2asset002"],
    "reason": "Campaign completed - retaining for legal compliance",
    "metadata": {
      "retentionUntil": "2026-10-12",
      "category": "completed_campaigns"
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "archived": 2,
    "failed": 0,
    "errors": []
  }
}
```

**Error Response:**

```json
{
  "success": true,
  "data": {
    "archived": 1,
    "failed": 1,
    "errors": [
      {
        "assetId": "cm2asset002",
        "error": "Already archived"
      }
    ]
  }
}
```

### 4. Unarchive Assets

Restore archived assets:

**Request:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/admin/storage/unarchive \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["cm2asset001"]
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "archived": 1,
    "failed": 0,
    "errors": []
  }
}
```

### 5. Get Archived Assets

List archived assets with filtering:

**Request:**

```bash
curl -X GET "https://ops.yesgoddess.agency/api/admin/storage/archive?projectId=cm2proj123&limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "assets": [
      {
        "id": "cm2asset001",
        "title": "Archived Campaign Asset",
        "type": "IMAGE",
        "fileSize": "10485760",
        "updatedAt": "2025-10-01T12:00:00Z",
        "metadata": {
          "archiveReason": "Campaign completed",
          "archivedAt": "2025-10-01T12:00:00Z",
          "archivedBy": "admin_123",
          "retentionUntil": "2026-10-12"
        }
      }
    ],
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### 6. Storage Reports

Get comprehensive storage analytics:

**Request:**

```bash
curl -X GET "https://ops.yesgoddess.agency/api/admin/storage/reports?startDate=2025-09-01&endDate=2025-10-12" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBytes": "10737418240",
      "totalFiles": 1542,
      "averageFileSize": "6963456",
      "largestFile": {
        "id": "cm2asset999",
        "size": "524288000",
        "title": "4K Video Campaign"
      }
    },
    "breakdown": {
      "byType": {
        "IMAGE": {
          "bytes": "4294967296",
          "count": 1200,
          "percentage": 40
        },
        "VIDEO": {
          "bytes": "5368709120",
          "count": 285,
          "percentage": 50
        },
        "DOCUMENT": {
          "bytes": "1073741824",
          "count": 57,
          "percentage": 10
        }
      },
      "byUser": [
        {
          "id": "user_123",
          "name": "Jane Doe",
          "bytes": "2147483648"
        }
      ],
      "byProject": [
        {
          "id": "proj_456",
          "name": "Fall Campaign 2025",
          "bytes": "3221225472"
        }
      ]
    },
    "trends": {
      "daily": {
        "current": "10737418240",
        "previous": "10485760000",
        "growthRate": 2.4,
        "growthBytes": "251658240"
      },
      "weekly": {
        "current": "10737418240",
        "previous": "9663676416",
        "growthRate": 11.1,
        "growthBytes": "1073741824"
      },
      "monthly": {
        "current": "10737418240",
        "previous": "8589934592",
        "growthRate": 25.0,
        "growthBytes": "2147483648"
      }
    },
    "topConsumers": {
      "users": [
        {
          "id": "user_123",
          "name": "Jane Doe",
          "bytes": "2147483648"
        }
      ],
      "projects": [
        {
          "id": "proj_456",
          "name": "Fall Campaign 2025",
          "bytes": "3221225472"
        }
      ]
    }
  }
}
```

---

## Business Logic & Validation Rules

### File Organization

**Storage Path Pattern:**
```
{environment}/{brand-id}/{project-id}/{asset-type}/{year}/{month}/{assetId}_{filename}
```

**Example:**
```
prod/brand_cm2abc/proj_xyz123/image/2025/10/asset_def456_photo.jpg
```

**Rules:**
- Environment: `dev`, `staging`, or `prod`
- Asset ID: 21-character nanoid (URL-safe, lowercase alphanumeric)
- Filename: Sanitized (special chars → underscores, max 100 chars)
- Path validation: No `..`, max 1024 chars, no leading/trailing `/`

### File Size Limits

| File Type | Maximum Size | Multipart Threshold |
|-----------|-------------|---------------------|
| Images | 50MB | N/A (single upload) |
| Videos | 500MB | 100MB (switches to multipart) |
| Documents | 50MB | N/A |
| Audio | 50MB | N/A |
| 3D Models | 200MB | 100MB |

**Global Default:** 50MB (`STORAGE_MAX_FILE_SIZE=52428800`)

### Allowed File Types

```typescript
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // Videos
  'video/mp4',
  'video/quicktime',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Audio
  'audio/mpeg',
  'audio/wav',
];
```

### Versioning Rules

- **Version Numbering:** Auto-incremented integers starting from 1
- **Parent-Child Relationship:** Tracked via `parentAssetId`
- **Version Limit:** Configurable per asset (default: keep last 10 versions)
- **Deletion:** Cannot delete root version if derivatives exist
- **Restoration:** Creates new version with restored content (increments version number)

### Archive Rules

- **Status Change:** `status` field changes to `ARCHIVED`
- **Reason Required:** Must provide reason for archiving
- **Metadata Preserved:** Archive date, user, reason stored in `metadata` JSON
- **Reversible:** Unarchive restores to `DRAFT` status
- **Query Isolation:** Archived assets excluded from normal queries unless explicitly requested

### Bulk Delete Safeguards

**Blockers (Prevent Deletion):**
- Assets with active licenses
- Root assets with undeleted derivatives
- Assets referenced by published content

**Warnings (Allow But Notify):**
- Assets with file relationships
- Assets with archived licenses
- Large storage impact (> 1GB)

**Process:**
1. Always preview before executing
2. Validate permissions per asset
3. Check for blockers
4. Batch process in groups of 50
5. Soft delete (set `deletedAt` timestamp)
6. Log audit event for each asset

### Storage Quota Rules

- **Per-User Quota:** Configurable (default: 10GB)
- **Per-Project Quota:** Configurable (default: 100GB)
- **Platform-Wide:** Monitored but not enforced
- **Enforcement:** Check before upload, reject if quota exceeded

---

## Error Handling

### Error Response Format

All errors follow this structure:

```typescript
interface ErrorResponse {
  error: string; // User-friendly message
  details?: string; // Technical details (dev mode only)
  code?: string; // Machine-readable error code
}
```

### HTTP Status Codes

| Status | Meaning | When to Use |
|--------|---------|-------------|
| 200 | Success | Successful operation |
| 400 | Bad Request | Invalid input, validation failure |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Asset/resource doesn't exist |
| 409 | Conflict | Operation conflicts with current state |
| 413 | Payload Too Large | File exceeds size limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Storage service temporarily down |

### Error Codes

#### File Management Errors

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `VALIDATION_FAILED` | 400 | Input validation failed | "Please check your input and try again." |
| `INVALID_KEY` | 400 | Storage key format invalid | "Invalid file path format." |
| `FILE_TOO_LARGE` | 413 | File exceeds size limit | "File size exceeds the {limit}MB limit." |
| `INVALID_FILE_TYPE` | 400 | File type not allowed | "This file type is not supported. Allowed types: {types}" |
| `NOT_FOUND` | 404 | Asset not found | "The requested asset could not be found." |
| `ALREADY_ARCHIVED` | 409 | Asset already archived | "This asset is already archived." |
| `ACTIVE_LICENSES` | 409 | Cannot delete licensed asset | "This asset has active licenses and cannot be deleted." |
| `HAS_DERIVATIVES` | 409 | Cannot delete with derivatives | "This asset has dependent files. Delete those first." |
| `QUOTA_EXCEEDED` | 403 | Storage quota exceeded | "Storage quota exceeded. Please delete some files or contact support." |
| `UNAUTHORIZED` | 403 | Admin access required | "This action requires administrator privileges." |

#### Storage Provider Errors

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `UPLOAD_FAILED` | 500 | Upload operation failed | "Upload failed. Please try again." |
| `DOWNLOAD_FAILED` | 500 | Download operation failed | "Could not retrieve file. Please try again." |
| `DELETE_FAILED` | 500 | Delete operation failed | "Deletion failed. Please contact support." |
| `NETWORK_ERROR` | 503 | Network connectivity issue | "Connection issue. Please check your internet." |
| `TIMEOUT` | 504 | Operation timed out | "Operation timed out. Please try again." |
| `RATE_LIMITED` | 429 | Rate limit exceeded | "Too many requests. Please wait and try again." |

### Error Handling Best Practices

**Frontend Implementation:**

```typescript
import { toast } from 'react-hot-toast';

async function deleteAssets(assetIds: string[]) {
  try {
    const response = await fetch('/api/admin/storage/bulk-delete/execute', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assetIds }),
    });

    if (!response.ok) {
      const error = await response.json();
      
      // Handle specific errors
      if (response.status === 403) {
        toast.error('You do not have permission to delete assets.');
        return;
      }
      
      if (response.status === 409) {
        toast.error(error.details || 'Some assets cannot be deleted.');
        return;
      }
      
      if (response.status === 429) {
        toast.error('Too many requests. Please wait a moment.');
        return;
      }
      
      // Generic error
      toast.error(error.error || 'Failed to delete assets.');
      return;
    }

    const result = await response.json();
    toast.success(`Deletion started. Job ID: ${result.data.jobId}`);
    
  } catch (error) {
    // Network or parsing error
    console.error('Delete failed:', error);
    toast.error('Connection error. Please check your internet.');
  }
}
```

**When to Show Specific vs Generic Errors:**

- **Specific:** Show when user can take action (e.g., "File too large")
- **Generic:** Show for unexpected errors (e.g., 500 errors)
- **Never expose:** Internal system details, stack traces, database errors

---

## Authorization & Permissions

### Role-Based Access Control

| Endpoint | Admin | Creator | Brand | Viewer |
|----------|-------|---------|-------|--------|
| Bulk Delete Preview | ✅ | ❌ | ❌ | ❌ |
| Bulk Delete Execute | ✅ | ❌ | ❌ | ❌ |
| Archive Assets | ✅ | ❌ | ❌ | ❌ |
| Unarchive Assets | ✅ | ❌ | ❌ | ❌ |
| Get Archived Assets | ✅ | ❌ | ❌ | ❌ |
| Storage Reports | ✅ | ❌ | ❌ | ❌ |

### JWT Token Structure

Expected JWT payload:

```typescript
interface JWTPayload {
  sub: string; // User ID
  email: string;
  role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  iat: number; // Issued at
  exp: number; // Expiration
}
```

### Permission Checks

**Server-Side Validation:**
```typescript
// Middleware validates role
if (session.user.role !== UserRole.ADMIN) {
  return NextResponse.json(
    { error: 'Unauthorized - Admin access required' },
    { status: 403 }
  );
}
```

**Frontend Should:**
- Hide admin-only UI for non-admin users
- Still handle 403 responses gracefully
- Validate token expiration before requests

### Resource Ownership

For shared endpoints (future implementation):
- Creators can only manage their own assets
- Brands can manage assets in their projects
- Admins can manage all assets

---

## Rate Limiting & Quotas

### Rate Limits

Rate limits are enforced per endpoint and per user.

| Endpoint | Limit | Window |
|----------|-------|--------|
| Bulk Delete Preview | 30 req/min | 1 minute |
| Bulk Delete Execute | 10 req/min | 1 minute |
| Archive Assets | 30 req/min | 1 minute |
| Unarchive Assets | 30 req/min | 1 minute |
| Get Archived Assets | 60 req/min | 1 minute |
| Storage Reports | 20 req/min | 1 minute |

### Rate Limit Headers

Check these response headers:

```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1697123456 (Unix timestamp)
```

### Rate Limit Response

```json
{
  "error": "Too many requests",
  "details": "Rate limit exceeded. Resets at 2025-10-12T14:30:56Z",
  "code": "RATE_LIMITED"
}
```

### Frontend Implementation

```typescript
const rateLimiter = {
  limits: new Map<string, { remaining: number; reset: number }>(),
  
  updateFromHeaders(endpoint: string, headers: Headers) {
    this.limits.set(endpoint, {
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      reset: parseInt(headers.get('X-RateLimit-Reset') || '0'),
    });
  },
  
  canMakeRequest(endpoint: string): boolean {
    const limit = this.limits.get(endpoint);
    if (!limit) return true;
    
    // Check if reset time passed
    if (Date.now() / 1000 > limit.reset) {
      this.limits.delete(endpoint);
      return true;
    }
    
    return limit.remaining > 0;
  },
  
  getTimeUntilReset(endpoint: string): number {
    const limit = this.limits.get(endpoint);
    if (!limit) return 0;
    return Math.max(0, limit.reset - Date.now() / 1000);
  }
};
```

### Storage Quotas

**Default Quotas:**
- **Per User:** 10GB
- **Per Project:** 100GB
- **Platform-wide:** Monitored but not enforced

**Check Quota Before Upload:**

```typescript
// Quota info included in storage reports
const report = await fetch('/api/admin/storage/reports');
const { data } = await report.json();

// Calculate remaining quota
const userQuota = 10 * 1024 * 1024 * 1024; // 10GB
const used = BigInt(data.breakdown.byUser[0].bytes);
const remaining = userQuota - Number(used);

if (remaining < fileSize) {
  toast.error('Storage quota exceeded');
}
```

---

## File Upload Flow

File uploads use a **signed URL** pattern for direct-to-storage uploads (not covered in File Management module - see IP Assets module).

However, understanding the **file organization** is crucial:

### Storage Path Generation

**Frontend:**
```typescript
// When preparing upload
const fileInfo = {
  brandId: 'brand_cm2abc',
  projectId: 'proj_xyz123',
  assetType: 'IMAGE',
  filename: 'my photo.jpg',
};

// Backend generates storage path:
// prod/brand_cm2abc/proj_xyz123/image/2025/10/asset_def456_my_photo.jpg
```

**Path Components:**
- `prod` - Environment
- `brand_cm2abc` - Brand ID
- `proj_xyz123` - Project ID
- `image` - Asset type (lowercase)
- `2025/10` - Date (year/month)
- `asset_def456` - Generated asset ID (21 chars)
- `my_photo.jpg` - Sanitized filename

### Upload Process

1. **Request Signed URL** (IP Assets module)
   ```typescript
   POST /api/assets/upload/init
   ```

2. **Upload Directly to R2**
   ```typescript
   PUT {signedUrl}
   ```

3. **Confirm Upload**
   ```typescript
   POST /api/assets/upload/confirm
   ```

### Variant Paths

Thumbnails and previews follow predictable patterns:

```
Original:  prod/.../asset_abc123_photo.jpg
Thumbnail: prod/.../asset_abc123_thumb_small_photo.jpg
Preview:   prod/.../asset_abc123_preview_photo.jpg
```

---

## Pagination & Filtering

### Archived Assets Pagination

**Query Parameters:**

```typescript
interface GetArchivedAssetsQuery {
  userId?: string;      // Filter by creator
  projectId?: string;   // Filter by project
  limit?: number;       // Items per page (default: 50)
  offset?: number;      // Page offset (default: 0)
}
```

**Example:**

```typescript
// Page 1
GET /api/admin/storage/archive?limit=20&offset=0

// Page 2
GET /api/admin/storage/archive?limit=20&offset=20

// Filter by project
GET /api/admin/storage/archive?projectId=cm2proj123&limit=20&offset=0
```

**Response:**

```typescript
{
  assets: ArchivedAsset[];
  total: number;        // Total matching assets
  limit: number;        // Items per page
  offset: number;       // Current offset
  hasMore: boolean;     // Are there more pages?
}
```

### React Query Implementation

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function useArchivedAssets(projectId?: string) {
  return useInfiniteQuery({
    queryKey: ['archived-assets', projectId],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: '20',
        offset: pageParam.toString(),
        ...(projectId && { projectId }),
      });
      
      const response = await fetch(
        `/api/admin/storage/archive?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch');
      
      const result = await response.json();
      return result.data;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.offset + lastPage.limit;
    },
  });
}

// Usage in component
function ArchivedAssetsTable() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useArchivedAssets();

  return (
    <div>
      {data?.pages.map((page) =>
        page.assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} />
        ))
      )}
      
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>
          Load More
        </button>
      )}
    </div>
  );
}
```

### Bulk Delete Filter Criteria

```typescript
interface BulkDeleteFilterCriteria {
  projectId?: string;           // Filter by project
  status?: AssetStatus;         // Filter by status
  type?: AssetType;             // Filter by type
  createdBefore?: string;       // ISO 8601 date
  olderThanDays?: number;       // Relative date filter
}
```

**Example Filters:**

```typescript
// Delete all drafts in a project older than 90 days
{
  projectId: 'cm2proj123',
  status: 'DRAFT',
  olderThanDays: 90
}

// Delete all rejected images
{
  status: 'REJECTED',
  type: 'IMAGE'
}

// Delete everything before a specific date
{
  createdBefore: '2025-01-01T00:00:00Z'
}
```

---

## Frontend Implementation Checklist

### 🔧 Setup & Configuration

- [ ] Copy TypeScript types to `src/types/file-management.ts`
- [ ] Create API client wrapper for File Management endpoints
- [ ] Set up React Query hooks for each endpoint
- [ ] Configure toast notifications for success/error states
- [ ] Add rate limit tracking to API client

### 🎨 UI Components

#### Admin Dashboard
- [ ] Storage overview widget (total usage, trends)
- [ ] Recent activity feed (archives, deletions)
- [ ] Quick action buttons (archive, delete, view reports)

#### Archived Assets Page
- [ ] Searchable/filterable table of archived assets
- [ ] Bulk select functionality
- [ ] Unarchive button (with confirmation modal)
- [ ] Pagination controls
- [ ] Sort by date archived, size, type

#### Bulk Delete Interface
- [ ] Preview step with impact analysis
- [ ] Warning/blocker display
- [ ] Confirmation modal with checklist
- [ ] Progress indicator during execution
- [ ] Results summary after completion

#### Storage Reports Page
- [ ] Summary cards (total storage, file count, average size)
- [ ] Breakdown charts (by type, by user, by project)
- [ ] Trend graphs (daily, weekly, monthly)
- [ ] Top consumers list
- [ ] Date range selector
- [ ] Export to CSV button

### 🔐 Security

- [ ] JWT token management (storage, refresh)
- [ ] Role-based UI rendering
- [ ] Handle 403 Forbidden gracefully
- [ ] Sanitize user inputs before sending to API
- [ ] Validate file sizes on frontend before upload

### 📊 Data Management

- [ ] Implement BigInt serialization/deserialization
- [ ] Format bytes to human-readable (KB, MB, GB)
- [ ] Handle date formatting (ISO 8601 → user-friendly)
- [ ] Cache storage reports (5-minute TTL)
- [ ] Optimistic updates for archive/unarchive

### ⚠️ Error Handling

- [ ] Display user-friendly error messages
- [ ] Log errors to monitoring service (Sentry/LogRocket)
- [ ] Retry failed requests (with exponential backoff)
- [ ] Handle rate limit errors (show countdown timer)
- [ ] Network offline detection

### 🧪 Testing

- [ ] Unit tests for API client functions
- [ ] Integration tests for bulk delete flow
- [ ] E2E tests for archive/unarchive workflow
- [ ] Test error scenarios (403, 409, 429, 500)
- [ ] Test pagination and infinite scroll

### 📈 Analytics

- [ ] Track bulk delete usage (how often, how many assets)
- [ ] Track archive/unarchive frequency
- [ ] Monitor storage report views
- [ ] Track quota warnings
- [ ] Log error types and frequency

### ♿ Accessibility

- [ ] Keyboard navigation for tables
- [ ] ARIA labels for action buttons
- [ ] Screen reader announcements for status changes
- [ ] Focus management in modals
- [ ] Color contrast for warnings/errors

### 🚀 Performance

- [ ] Lazy load archived assets table
- [ ] Virtual scrolling for large lists
- [ ] Debounce search inputs
- [ ] Prefetch next page of pagination
- [ ] Compress storage reports data

---

## Support & Resources

### Related Documentation

- **IP Assets Integration:** `/docs/frontend-integration/ASSET_PROCESSING_INTEGRATION_GUIDE.md`
- **Storage Configuration:** `/docs/infrastructure/storage/configuration.md`
- **File Management Backend:** `/docs/infrastructure/storage/file-management.md`
- **Authentication Guide:** `/docs/AUTH_IMPLEMENTATION.md`

### Code Examples

**Backend Implementation:**
- File Organization: `src/lib/storage/file-organization.ts`
- File Management: `src/lib/storage/file-management.ts`
- API Routes: `src/app/api/admin/storage/**`

**Database Schema:**
- IP Assets: `prisma/schema.prisma` (model IpAsset)
- File Relationships: `prisma/schema.prisma` (model FileRelationship)
- Storage Metrics: `prisma/schema.prisma` (model StorageMetrics)

### Contact

For questions or issues:
- **Backend Team:** backend@yesgoddess.agency
- **Slack Channel:** #yg-backend
- **Documentation Issues:** Create PR in yg-backend repo

---

**Document Status:** ✅ Complete  
**Version:** 1.0.0  
**Last Reviewed:** October 12, 2025  
**Next Review:** January 12, 2026
