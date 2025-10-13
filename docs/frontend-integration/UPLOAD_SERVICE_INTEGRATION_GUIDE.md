# Upload Service - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Upload Service / IP Assets  
**Last Updated:** October 12, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [File Upload Flow](#file-upload-flow)
10. [Real-time Updates](#real-time-updates)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)
12. [Testing Scenarios](#testing-scenarios)

---

## Overview

The Upload Service handles the complete lifecycle of asset uploads:
- **Signed URL generation** for direct-to-storage uploads
- **File validation** (type, size, naming)
- **Virus scanning** via background jobs
- **Upload confirmation** and metadata extraction
- **Upload analytics** and tracking
- **Failed upload cleanup**

### Key Features

✅ **Direct-to-R2 Upload**: Client uploads directly to Cloudflare R2 (no backend bottleneck)  
✅ **Virus Scanning**: All files automatically scanned (ClamAV/VirusTotal)  
✅ **Background Processing**: Thumbnail generation, metadata extraction  
✅ **Analytics Tracking**: Upload success rates, file sizes, processing times  
✅ **Automatic Cleanup**: Abandoned/failed uploads cleaned after 24h/7d  

### Architecture

```
┌─────────────┐    1. Request Upload URL     ┌──────────────┐
│  Frontend   │──────────────────────────────▶│   Backend    │
│             │◀──────────────────────────────│   (tRPC)     │
└─────────────┘    2. Return Signed URL      └──────────────┘
       │                                              │
       │ 3. Upload directly                          │
       │    (PUT to signed URL)                      │
       ▼                                              │
┌─────────────┐                                      │
│ Cloudflare  │                                      │
│     R2      │                                      │
└─────────────┘                                      │
       │                                              │
       │ 4. Confirm Upload                           │
       └─────────────────────────────────────────────▶
                                                      │
                                    5. Queue Jobs    │
                                    - Virus Scan     │
                                    - Thumbnail Gen  │
                                    - Metadata       │
```

---

## API Endpoints

All endpoints use **tRPC** with the router prefix: `ipAssets.*`

### 1. Initiate Upload

**Endpoint:** `ipAssets.initiateUpload` (Mutation)  
**Authentication:** Required (JWT)  
**Purpose:** Generate signed URL and create draft asset record

**Input:**
```typescript
{
  fileName: string;        // 1-255 chars, alphanumeric + spaces/dashes
  fileSize: number;        // In bytes, max 104,857,600 (100MB)
  mimeType: string;        // Must be in allowed list
  projectId?: string;      // Optional project association
}
```

**Output:**
```typescript
{
  uploadUrl: string;       // Signed PUT URL (15 min expiry)
  assetId: string;         // CUID of created asset
  storageKey: string;      // Storage path (for reference)
}
```

**Allowed MIME Types:**
- Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Videos: `video/mp4`, `video/quicktime`
- Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Audio: `audio/mpeg`, `audio/wav`

**Max File Size:** 104,857,600 bytes (100MB)

---

### 2. Confirm Upload

**Endpoint:** `ipAssets.confirmUpload` (Mutation)  
**Authentication:** Required (JWT)  
**Purpose:** Confirm file was uploaded successfully and trigger processing

**Input:**
```typescript
{
  assetId: string;               // CUID from initiateUpload
  title: string;                 // 1-255 chars
  description?: string;          // Optional, max 2000 chars
  metadata?: Record<string, any>; // Optional custom metadata
}
```

**Output:**
```typescript
{
  id: string;                    // Asset CUID
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;               // IMAGE | VIDEO | DOCUMENT | AUDIO
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;   // Not available immediately
  previewUrl: string | null;     // Not available immediately
  version: number;               // Always 1 for new uploads
  parentAssetId: string | null;  // null for original uploads
  metadata: Record<string, any> | null;
  status: AssetStatus;           // PROCESSING (immediately after confirm)
  scanStatus: ScanStatus;        // SCANNING (immediately after confirm)
  createdBy: string;             // User ID
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  canEdit: boolean;              // Based on ownership
  canDelete: boolean;            // Based on ownership and licenses
}
```

**Side Effects:**
- Asset status changes: `DRAFT` → `PROCESSING`
- Virus scan job queued (high priority, 3 retries)
- Upload analytics event tracked
- Notification queued (optional)

---

### 3. List Assets

**Endpoint:** `ipAssets.list` (Query)  
**Authentication:** Required (JWT)  
**Purpose:** Paginated list of user's assets with filtering

**Input:**
```typescript
{
  filters?: {
    projectId?: string;          // Filter by project
    type?: AssetType;            // IMAGE | VIDEO | DOCUMENT | AUDIO
    status?: AssetStatus;        // DRAFT | PROCESSING | CLEAN | INFECTED | FAILED | ARCHIVED
    createdBy?: string;          // User ID (admin only)
    search?: string;             // Text search in title/description (max 100 chars)
    fromDate?: string;           // ISO 8601 datetime
    toDate?: string;             // ISO 8601 datetime
  };
  page?: number;                 // Default: 1
  pageSize?: number;             // Default: 20, max: 100
  sortBy?: 'createdAt' | 'updatedAt' | 'title'; // Default: createdAt
  sortOrder?: 'asc' | 'desc';    // Default: desc
}
```

**Output:**
```typescript
{
  data: IpAssetResponse[];       // Array of assets
  meta: {
    total: number;               // Total matching records
    page: number;                // Current page
    pageSize: number;            // Items per page
    hasMore: boolean;            // More pages available
  };
}
```

---

### 4. Get Asset by ID

**Endpoint:** `ipAssets.getById` (Query)  
**Authentication:** Required (JWT)  
**Purpose:** Get single asset with full details

**Input:**
```typescript
{
  id: string; // Asset CUID
}
```

**Output:** `IpAssetResponse` (same as confirmUpload)

---

### 5. Get Download URL

**Endpoint:** `ipAssets.getDownloadUrl` (Query)  
**Authentication:** Required (JWT)  
**Purpose:** Generate time-limited download URL

**Input:**
```typescript
{
  id: string; // Asset CUID
}
```

**Output:**
```typescript
{
  url: string;        // Signed download URL
  expiresAt: string;  // ISO 8601 (15 minutes from now)
}
```

---

### 6. Get Preview URL

**Endpoint:** `ipAssets.getPreview` (Query)  
**Authentication:** Required (JWT)  
**Purpose:** Get thumbnail/preview variant

**Input:**
```typescript
{
  id: string;                                    // Asset CUID
  size?: 'small' | 'medium' | 'large' | 'original'; // Default: medium
}
```

**Output:**
```typescript
{
  url: string;        // Signed preview URL
  size: string;       // Size variant
  width?: number;     // Pixel width (if image)
  height?: number;    // Pixel height (if image)
  expiresAt: string;  // ISO 8601
}
```

**Preview Sizes:**
- `small`: 200x200px thumbnail
- `medium`: 400x400px thumbnail
- `large`: 800x800px thumbnail
- `original`: Full-size preview (max 1200px)

---

### 7. Update Asset

**Endpoint:** `ipAssets.update` (Mutation)  
**Authentication:** Required (JWT)  
**Purpose:** Update asset metadata

**Input:**
```typescript
{
  id: string;
  title?: string;                  // 1-255 chars
  description?: string | null;     // Max 2000 chars
  metadata?: Record<string, any>;
}
```

**Output:** `IpAssetResponse`

---

### 8. Delete Asset

**Endpoint:** `ipAssets.delete` (Mutation)  
**Authentication:** Required (JWT)  
**Purpose:** Soft delete asset (cannot be restored)

**Input:**
```typescript
{
  id: string; // Asset CUID
}
```

**Output:**
```typescript
{
  success: true;
  deletedAt: string; // ISO 8601
}
```

**Restrictions:**
- Cannot delete assets with **ACTIVE** licenses
- Creator or admin only
- Soft delete (sets `deletedAt` timestamp)

---

## Request/Response Examples

### Example 1: Complete Upload Flow (Success)

#### Step 1: Initiate Upload

```bash
# cURL example (for testing)
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.initiateUpload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "fileName": "portrait_photo.jpg",
    "fileSize": 2048576,
    "mimeType": "image/jpeg",
    "projectId": "cm1abc123xyz"
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "uploadUrl": "https://ACCOUNT_ID.r2.cloudflarestorage.com/yesgoddess-assets-production/assets/cm2def456uvw/portrait_photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "assetId": "cm2def456uvw",
      "storageKey": "assets/cm2def456uvw/portrait_photo.jpg"
    }
  }
}
```

#### Step 2: Upload to R2

```typescript
// Frontend code (React)
const response = await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'image/jpeg',
  },
});

if (!response.ok) {
  throw new Error('Upload to R2 failed');
}
```

#### Step 3: Confirm Upload

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.confirmUpload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "assetId": "cm2def456uvw",
    "title": "Professional Portrait Photo",
    "description": "Studio headshot for portfolio",
    "metadata": {
      "camera": "Canon EOS R5",
      "lens": "RF 50mm f/1.2",
      "location": "Studio A"
    }
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "id": "cm2def456uvw",
      "projectId": "cm1abc123xyz",
      "title": "Professional Portrait Photo",
      "description": "Studio headshot for portfolio",
      "type": "IMAGE",
      "fileSize": 2048576,
      "mimeType": "image/jpeg",
      "thumbnailUrl": null,
      "previewUrl": null,
      "version": 1,
      "parentAssetId": null,
      "metadata": {
        "camera": "Canon EOS R5",
        "lens": "RF 50mm f/1.2",
        "location": "Studio A"
      },
      "status": "PROCESSING",
      "scanStatus": "SCANNING",
      "createdBy": "user123",
      "createdAt": "2025-10-12T10:30:00.000Z",
      "updatedAt": "2025-10-12T10:30:05.000Z",
      "canEdit": true,
      "canDelete": true
    }
  }
}
```

---

### Example 2: Failed Upload (File Too Large)

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.initiateUpload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "fileName": "large_video.mp4",
    "fileSize": 200000000,
    "mimeType": "video/mp4"
  }'
```

**Response:**
```json
{
  "error": {
    "message": "File size 200000000 bytes exceeds maximum 104857600 bytes",
    "code": -32600,
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "ipAssets.initiateUpload",
      "cause": {
        "code": "ASSET_FILE_TOO_LARGE",
        "details": {
          "size": 200000000,
          "maxSize": 104857600
        }
      }
    }
  }
}
```

---

### Example 3: Invalid File Type

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.initiateUpload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "fileName": "document.exe",
    "fileSize": 1024000,
    "mimeType": "application/x-msdownload"
  }'
```

**Response:**
```json
{
  "error": {
    "message": "File type application/x-msdownload is not supported",
    "code": -32600,
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "ipAssets.initiateUpload",
      "cause": {
        "code": "ASSET_INVALID_FILE_TYPE",
        "details": {
          "mimeType": "application/x-msdownload"
        }
      }
    }
  }
}
```

---

### Example 4: Virus Detected (Infected File)

After confirmation, virus scan detects a threat:

```json
{
  "id": "cm2def456uvw",
  "status": "INFECTED",
  "scanStatus": "INFECTED",
  "metadata": {
    "scanResult": {
      "status": "infected",
      "threatsDetected": 1,
      "threats": ["Win.Trojan.Generic"],
      "scanEngine": "clamav",
      "scanEngineVersion": "1.0.4",
      "scannedAt": "2025-10-12T10:31:45.000Z"
    }
  }
}
```

**User Notification:**
> ⚠️ **Security Alert**: Your file "portrait_photo.jpg" was flagged during our security scan and has been quarantined. Please contact support if you believe this is an error.

---

## TypeScript Type Definitions

Copy these types into your frontend codebase:

```typescript
// ============================================================================
// ENUMS
// ============================================================================

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
}

export enum AssetStatus {
  DRAFT = 'DRAFT',           // Upload initiated, not confirmed
  PROCESSING = 'PROCESSING', // Confirmed, being scanned/processed
  CLEAN = 'CLEAN',           // Scan passed, ready to use
  INFECTED = 'INFECTED',     // Virus detected, quarantined
  FAILED = 'FAILED',         // Processing failed
  ARCHIVED = 'ARCHIVED',     // Archived by user/admin
}

export enum ScanStatus {
  PENDING = 'PENDING',   // Not yet scanned
  SCANNING = 'SCANNING', // Scan in progress
  CLEAN = 'CLEAN',       // No threats detected
  INFECTED = 'INFECTED', // Threats found
  FAILED = 'FAILED',     // Scan failed (error)
  SKIPPED = 'SKIPPED',   // Scan skipped (dev mode)
}

// ============================================================================
// API REQUEST TYPES
// ============================================================================

export interface InitiateUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  projectId?: string;
}

export interface ConfirmUploadInput {
  assetId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdateAssetInput {
  id: string;
  title?: string;
  description?: string | null;
  metadata?: Record<string, any>;
}

export interface ListAssetsInput {
  filters?: {
    projectId?: string;
    type?: AssetType;
    status?: AssetStatus;
    createdBy?: string;
    search?: string;
    fromDate?: string; // ISO 8601
    toDate?: string;   // ISO 8601
  };
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface UploadInitiationResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
}

export interface IpAssetResponse {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  version: number;
  parentAssetId: string | null;
  metadata: Record<string, any> | null;
  status: AssetStatus;
  scanStatus: ScanStatus;
  createdBy: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  canEdit: boolean;
  canDelete: boolean;
}

export interface AssetListResponse {
  data: IpAssetResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string; // ISO 8601
}

export interface PreviewUrlResponse {
  url: string;
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;
  height?: number;
  expiresAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const UPLOAD_CONSTANTS = {
  MAX_FILE_SIZE: 104_857_600, // 100MB
  SIGNED_URL_EXPIRY: 900,     // 15 minutes
  
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg',
    'audio/wav',
  ],
  
  PREVIEW_SIZES: {
    small: { width: 200, height: 200 },
    medium: { width: 400, height: 400 },
    large: { width: 800, height: 800 },
  },
} as const;

// ============================================================================
// ZOD SCHEMAS (for client-side validation)
// ============================================================================

import { z } from 'zod';

export const initiateUploadSchema = z.object({
  fileName: z.string()
    .min(1, 'File name is required')
    .max(255, 'File name too long')
    .regex(/^[a-zA-Z0-9\-_\. ]+$/, 'Invalid file name characters'),
  fileSize: z.number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(UPLOAD_CONSTANTS.MAX_FILE_SIZE, 'File size exceeds 100MB limit'),
  mimeType: z.string()
    .regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type')
    .refine(
      (type) => UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes(type),
      'File type not supported'
    ),
  projectId: z.string().optional(),
});

export const confirmUploadSchema = z.object({
  assetId: z.string(),
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title too long'),
  description: z.string()
    .max(2000, 'Description too long')
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

---

## Business Logic & Validation Rules

### File Validation

**Frontend (pre-upload):**
```typescript
function validateFile(file: File): string | null {
  // 1. Check file size
  if (file.size > UPLOAD_CONSTANTS.MAX_FILE_SIZE) {
    return `File size ${formatBytes(file.size)} exceeds maximum ${formatBytes(UPLOAD_CONSTANTS.MAX_FILE_SIZE)}`;
  }
  
  // 2. Check MIME type
  if (!UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not supported`;
  }
  
  // 3. Check filename characters
  if (!/^[a-zA-Z0-9\-_\. ]+$/.test(file.name)) {
    return 'Filename contains invalid characters. Use only letters, numbers, dashes, underscores, and spaces.';
  }
  
  // 4. Check filename length
  if (file.name.length > 255) {
    return 'Filename is too long (max 255 characters)';
  }
  
  return null; // Valid
}
```

### Upload State Machine

```
DRAFT ──────────────▶ PROCESSING ──────────────▶ CLEAN
  │                      │                         │
  │                      │                         │
  │                      ├─────────────▶ INFECTED  │
  │                      │                         │
  │                      ├─────────────▶ FAILED    │
  │                      │                         │
  └──────────────────────┴─────────────────────────┴──▶ ARCHIVED
```

**Allowed Transitions:**
- `DRAFT` → `PROCESSING` (on confirmUpload)
- `PROCESSING` → `CLEAN` (scan passed)
- `PROCESSING` → `INFECTED` (virus detected)
- `PROCESSING` → `FAILED` (processing error)
- Any status → `ARCHIVED` (user/admin action)

**Forbidden Transitions:**
- `CLEAN` → `DRAFT` (cannot revert)
- `INFECTED` → `CLEAN` (cannot bypass security)

### Title & Description Rules

```typescript
const TitleRules = {
  minLength: 1,
  maxLength: 255,
  required: true,
  trim: true,
};

const DescriptionRules = {
  maxLength: 2000,
  required: false,
  trim: true,
  allowNull: true,
};
```

### Metadata Rules

- Must be valid JSON object
- Max 10KB serialized size
- No nested depth > 5 levels
- Keys must be alphanumeric strings

---

## Error Handling

### Error Response Format

All errors follow this structure:

```typescript
interface TRPCError {
  error: {
    message: string;      // Human-readable error message
    code: number;         // tRPC error code
    data: {
      code: string;       // HTTP status code as string
      httpStatus: number; // HTTP status code
      path: string;       // API endpoint path
      cause?: {
        code: string;     // Application error code
        details?: any;    // Additional error details
      };
    };
  };
}
```

### Error Codes & Handling

| Error Code | HTTP Status | Meaning | User Message | Action |
|------------|-------------|---------|--------------|--------|
| `ASSET_FILE_TOO_LARGE` | 400 | File exceeds 100MB | "File is too large. Maximum size is 100MB." | Show file size limit, suggest compression |
| `ASSET_INVALID_FILE_TYPE` | 400 | Unsupported MIME type | "This file type is not supported. Please upload an image, video, document, or audio file." | Show list of allowed types |
| `ASSET_INVALID_FILENAME` | 400 | Invalid characters in filename | "Filename contains invalid characters. Use only letters, numbers, and spaces." | Suggest auto-sanitization |
| `ASSET_NOT_FOUND` | 404 | Asset doesn't exist | "This asset could not be found. It may have been deleted." | Redirect to asset list |
| `ASSET_ACCESS_DENIED` | 403 | No permission to access | "You don't have permission to access this asset." | Hide UI element |
| `ASSET_UPLOAD_FAILED` | 500 | Storage error | "Upload failed. Please try again." | Retry button |
| `ASSET_VIRUS_DETECTED` | 400 | Virus/malware found | "Security scan detected a threat in this file. It has been quarantined for your safety." | Contact support link |
| `ASSET_HAS_ACTIVE_LICENSES` | 409 | Cannot delete (in use) | "This asset cannot be deleted because it's used in active licenses." | Show license list |
| `ASSET_PROCESSING_FAILED` | 500 | Background job failed | "Asset processing failed. Our team has been notified." | Retry option |
| `UNAUTHORIZED` | 401 | Not logged in | "Please log in to upload files." | Redirect to login |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | "You're uploading too quickly. Please wait a moment." | Show countdown timer |

### Frontend Error Handling Example

```typescript
import { TRPCClientError } from '@trpc/client';

async function handleUpload(file: File) {
  try {
    // Step 1: Initiate
    const { uploadUrl, assetId } = await trpc.ipAssets.initiateUpload.mutate({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
    
    // Step 2: Upload to R2
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    
    // Step 3: Confirm
    const asset = await trpc.ipAssets.confirmUpload.mutate({
      assetId,
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
    });
    
    return asset;
    
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const errorCode = error.data?.cause?.code;
      
      switch (errorCode) {
        case 'ASSET_FILE_TOO_LARGE':
          toast.error('File is too large. Maximum size is 100MB.');
          break;
          
        case 'ASSET_INVALID_FILE_TYPE':
          toast.error('This file type is not supported.');
          break;
          
        case 'ASSET_UPLOAD_FAILED':
          toast.error('Upload failed. Please try again.');
          // Show retry button
          break;
          
        case 'RATE_LIMIT_EXCEEDED':
          const resetAt = error.data?.cause?.details?.resetAt;
          toast.error(`Too many uploads. Try again in ${formatDuration(resetAt)}.`);
          break;
          
        default:
          toast.error('An unexpected error occurred.');
          console.error('Upload error:', error);
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }
  }
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Endpoint | Creator | Brand | Admin |
|----------|---------|-------|-------|
| `initiateUpload` | ✅ Own assets | ✅ Own assets | ✅ All assets |
| `confirmUpload` | ✅ Own assets | ✅ Own assets | ✅ All assets |
| `list` | ✅ Own assets | ✅ Own assets | ✅ All assets |
| `getById` | ✅ Own assets | ✅ Licensed assets | ✅ All assets |
| `update` | ✅ Own assets | ❌ | ✅ All assets |
| `delete` | ✅ Own assets* | ❌ | ✅ All assets* |
| `getDownloadUrl` | ✅ Own assets | ✅ Licensed assets | ✅ All assets |
| `getPreview` | ✅ Own assets | ✅ Licensed assets | ✅ All assets |

*Cannot delete assets with active licenses

### Permission Checks (Frontend)

```typescript
interface PermissionContext {
  userRole: 'creator' | 'brand' | 'admin';
  userId: string;
  asset: IpAssetResponse;
}

function canEditAsset(ctx: PermissionContext): boolean {
  return ctx.asset.canEdit; // Computed by backend
}

function canDeleteAsset(ctx: PermissionContext): boolean {
  return ctx.asset.canDelete; // Computed by backend
}

function canDownloadAsset(ctx: PermissionContext): boolean {
  // Creators can always download their own assets
  if (ctx.asset.createdBy === ctx.userId) {
    return true;
  }
  
  // Brands can download licensed assets (check licenses)
  // Admins can download anything
  return ctx.userRole === 'admin';
}
```

### Row-Level Security (RLS)

The backend enforces Row-Level Security at the database level:

**Creators:**
```sql
-- Can only see assets they created
WHERE created_by = $userId
```

**Brands:**
```sql
-- Can see assets they've licensed
WHERE id IN (
  SELECT ip_asset_id FROM licenses
  WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id = $userId
  )
)
```

**Admins:**
```sql
-- Can see all assets
-- No WHERE clause restriction
```

---

## Rate Limiting & Quotas

### Upload Rate Limits

| Endpoint | Rate Limit | Window | Notes |
|----------|------------|--------|-------|
| `initiateUpload` | **20 requests** | 15 minutes | Per user |
| `confirmUpload` | **20 requests** | 15 minutes | Per user |
| `list` | **100 requests** | 1 minute | Per user |
| `getById` | **200 requests** | 1 minute | Per user |
| `update` | **50 requests** | 1 minute | Per user |
| `delete` | **10 requests** | 1 minute | Per user |

### Rate Limit Headers

When rate limited, the response includes:

```typescript
{
  error: {
    message: "Too many requests",
    code: -32600,
    data: {
      code: "TOO_MANY_REQUESTS",
      httpStatus: 429,
      cause: {
        remaining: 0,
        resetAt: "2025-10-12T10:45:00.000Z",
        limit: 20
      }
    }
  }
}
```

### Frontend Rate Limit Display

```typescript
function RateLimitWarning({ error }: { error: TRPCClientError }) {
  const resetAt = new Date(error.data?.cause?.details?.resetAt);
  const remaining = error.data?.cause?.details?.remaining || 0;
  const limit = error.data?.cause?.details?.limit || 0;
  
  const secondsUntilReset = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
  
  return (
    <Alert variant="warning">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Upload limit reached</AlertTitle>
      <AlertDescription>
        You've used {limit - remaining} of {limit} uploads.
        Try again in {formatDuration(secondsUntilReset)}.
      </AlertDescription>
    </Alert>
  );
}
```

### Storage Quotas

**Per Creator:**
- **Storage**: 50GB per creator
- **Active Assets**: 1,000 assets
- **Monthly Uploads**: 500 files

**Frontend Display:**
```typescript
function StorageQuotaDisplay({ usage, quota }: { usage: number; quota: number }) {
  const percentUsed = (usage / quota) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Storage Used</span>
        <span>{formatBytes(usage)} / {formatBytes(quota)}</span>
      </div>
      <Progress value={percentUsed} />
      {percentUsed > 90 && (
        <p className="text-sm text-amber-600">
          You're running low on storage. Consider archiving old assets.
        </p>
      )}
    </div>
  );
}
```

---

## File Upload Flow

### Complete Implementation

```typescript
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface UploadProgress {
  phase: 'validating' | 'initiating' | 'uploading' | 'confirming' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

export function useFileUpload() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  
  const uploadFile = async (
    file: File,
    options: {
      title?: string;
      description?: string;
      projectId?: string;
      metadata?: Record<string, any>;
      onProgress?: (progress: UploadProgress) => void;
    } = {}
  ) => {
    try {
      // Phase 1: Validate
      setProgress({
        phase: 'validating',
        progress: 5,
        message: 'Validating file...',
      });
      
      const validationError = validateFile(file);
      if (validationError) {
        throw new Error(validationError);
      }
      
      // Phase 2: Initiate
      setProgress({
        phase: 'initiating',
        progress: 10,
        message: 'Preparing upload...',
      });
      
      const { uploadUrl, assetId, storageKey } = await trpc.ipAssets.initiateUpload.mutate({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        projectId: options.projectId,
      });
      
      // Phase 3: Upload to R2
      setProgress({
        phase: 'uploading',
        progress: 20,
        message: 'Uploading file...',
      });
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Upload to storage failed');
      }
      
      setProgress({
        phase: 'uploading',
        progress: 70,
        message: 'Upload complete',
      });
      
      // Phase 4: Confirm
      setProgress({
        phase: 'confirming',
        progress: 80,
        message: 'Confirming upload...',
      });
      
      const asset = await trpc.ipAssets.confirmUpload.mutate({
        assetId,
        title: options.title || file.name.replace(/\.[^/.]+$/, ''),
        description: options.description,
        metadata: options.metadata,
      });
      
      // Phase 5: Processing (background)
      setProgress({
        phase: 'processing',
        progress: 90,
        message: 'Processing asset...',
      });
      
      // Wait a moment for scan to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Phase 6: Complete
      setProgress({
        phase: 'complete',
        progress: 100,
        message: 'Upload successful!',
      });
      
      toast.success('File uploaded successfully');
      
      return asset;
      
    } catch (error) {
      setProgress({
        phase: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
      
      throw error;
    }
  };
  
  return {
    uploadFile,
    progress,
  };
}

// Helper validation function
function validateFile(file: File): string | null {
  if (file.size > 104_857_600) {
    return 'File is too large (max 100MB)';
  }
  
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'application/pdf',
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return 'File type not supported';
  }
  
  if (!/^[a-zA-Z0-9\-_\. ]+$/.test(file.name)) {
    return 'Filename contains invalid characters';
  }
  
  return null;
}
```

### UI Component Example

```tsx
'use client';

import { useState } from 'react';
import { useFileUpload } from '@/hooks/use-file-upload';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle, XCircle } from 'lucide-react';

export function FileUploadZone({ projectId }: { projectId?: string }) {
  const { uploadFile, progress } = useFileUpload();
  const [isDragging, setIsDragging] = useState(false);
  
  const handleFileSelect = async (file: File) => {
    try {
      await uploadFile(file, { projectId });
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };
  
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {!progress && (
        <>
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-center text-gray-600 mb-4">
            Drag and drop a file here, or click to select
          </p>
          <Button
            variant="outline"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            Select File
          </Button>
          <input
            id="file-input"
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </>
      )}
      
      {progress && progress.phase !== 'complete' && progress.phase !== 'error' && (
        <div className="space-y-4">
          <p className="text-center text-sm text-gray-600">{progress.message}</p>
          <Progress value={progress.progress} />
          <p className="text-center text-xs text-gray-500">
            {progress.progress}% complete
          </p>
        </div>
      )}
      
      {progress?.phase === 'complete' && (
        <div className="text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p className="text-green-600 font-medium">Upload complete!</p>
        </div>
      )}
      
      {progress?.phase === 'error' && (
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium">{progress.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
```

---

## Real-time Updates

### Polling for Asset Status

After confirming an upload, poll for status updates:

```typescript
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

export function useAssetStatus(assetId: string) {
  const [asset, setAsset] = useState<IpAssetResponse | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  
  useEffect(() => {
    if (!isPolling) return;
    
    const interval = setInterval(async () => {
      const updated = await trpc.ipAssets.getById.query({ id: assetId });
      setAsset(updated);
      
      // Stop polling when processing completes
      if (updated.status !== 'PROCESSING') {
        setIsPolling(false);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [assetId, isPolling]);
  
  return { asset, isPolling };
}

// Usage in component
function AssetStatusBadge({ assetId }: { assetId: string }) {
  const { asset, isPolling } = useAssetStatus(assetId);
  
  if (!asset) return <Skeleton className="h-6 w-24" />;
  
  return (
    <Badge variant={getStatusVariant(asset.status)}>
      {isPolling && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {asset.status}
    </Badge>
  );
}

function getStatusVariant(status: AssetStatus) {
  switch (status) {
    case 'CLEAN': return 'success';
    case 'PROCESSING': return 'warning';
    case 'INFECTED': return 'destructive';
    case 'FAILED': return 'destructive';
    default: return 'default';
  }
}
```

### WebSocket Support (Future Enhancement)

*Not currently implemented, but planned:*

```typescript
// Future implementation
const ws = new WebSocket('wss://ops.yesgoddess.agency/ws');

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'asset.status_changed') {
    // Update UI in real-time
    updateAsset(data.assetId, data.status);
  }
  
  if (data.type === 'asset.scan_complete') {
    // Show notification
    toast.success('Virus scan complete');
  }
});
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Upload

- [ ] Create `useFileUpload` hook
- [ ] Implement file validation (client-side)
- [ ] Create upload progress UI
- [ ] Handle `initiateUpload` mutation
- [ ] Implement direct R2 upload with PUT
- [ ] Handle `confirmUpload` mutation
- [ ] Display success/error states
- [ ] Add retry logic for failed uploads

### Phase 2: Asset Management

- [ ] Create asset list view with pagination
- [ ] Implement search and filtering
- [ ] Add status badges (PROCESSING, CLEAN, etc.)
- [ ] Create asset detail view
- [ ] Implement asset editing
- [ ] Add delete confirmation modal
- [ ] Show preview thumbnails

### Phase 3: Error Handling

- [ ] Map all error codes to user messages
- [ ] Implement toast notifications
- [ ] Add retry mechanisms
- [ ] Handle network errors gracefully
- [ ] Show rate limit warnings
- [ ] Display storage quota alerts

### Phase 4: Real-time Updates

- [ ] Implement status polling
- [ ] Show processing indicators
- [ ] Display scan results
- [ ] Auto-refresh asset list
- [ ] Add loading skeletons

### Phase 5: Advanced Features

- [ ] Drag-and-drop upload zone
- [ ] Multi-file upload queue
- [ ] Resume failed uploads
- [ ] Show upload history
- [ ] Export analytics dashboard
- [ ] Bulk operations (delete, archive)

### Phase 6: Optimization

- [ ] Implement upload caching
- [ ] Add image compression (client-side)
- [ ] Lazy load thumbnails
- [ ] Optimize bundle size
- [ ] Add service worker for offline support

---

## Testing Scenarios

### Test Case 1: Happy Path (Image Upload)

**Steps:**
1. Select 2MB JPEG image
2. Client validates file (passes)
3. Call `initiateUpload` → receives signed URL
4. PUT file to R2 → receives 200 OK
5. Call `confirmUpload` with title
6. Poll `getById` until status = `CLEAN`
7. Display thumbnail

**Expected Result:**
- Asset status: `PROCESSING` → `CLEAN`
- Scan status: `SCANNING` → `CLEAN`
- Thumbnail generated within 30 seconds

---

### Test Case 2: File Too Large

**Steps:**
1. Select 150MB video file
2. Client validates file (fails)

**Expected Result:**
- Error shown before upload starts
- Message: "File is too large (max 100MB)"
- Suggestion to compress video

---

### Test Case 3: Invalid File Type

**Steps:**
1. Select `.exe` file
2. Client validates file (fails)

**Expected Result:**
- Error shown immediately
- Message: "File type not supported"
- List of allowed types displayed

---

### Test Case 4: Network Failure During Upload

**Steps:**
1. Start upload
2. Disconnect network during R2 PUT
3. Upload fails with network error

**Expected Result:**
- Error caught gracefully
- Message: "Network error. Check connection."
- Retry button shown
- Upload can resume

---

### Test Case 5: Virus Detected

**Steps:**
1. Upload EICAR test file (virus test file)
2. Confirm upload
3. Virus scan detects threat

**Expected Result:**
- Asset status: `PROCESSING` → `INFECTED`
- User receives notification
- File quarantined (not accessible)
- Admin alerted

---

### Test Case 6: Rate Limit Exceeded

**Steps:**
1. Upload 25 files rapidly
2. 21st upload fails with 429 error

**Expected Result:**
- Error: "Too many uploads"
- Countdown timer shown
- Previous uploads still processing
- Can retry after cooldown

---

### Test Case 7: Concurrent Uploads

**Steps:**
1. Upload 3 files simultaneously
2. All uploads proceed independently

**Expected Result:**
- All 3 assets created with unique IDs
- Progress shown for each
- No interference between uploads
- All complete successfully

---

### Test Case 8: Upload Cancellation

**Steps:**
1. Start upload
2. User clicks cancel during R2 PUT
3. Upload aborted

**Expected Result:**
- Upload stops immediately
- Asset remains in `DRAFT` status
- Cleanup job removes after 24h
- No storage charged

---

### Test Case 9: Expired Signed URL

**Steps:**
1. Get signed URL
2. Wait 20 minutes (URL expires after 15 min)
3. Attempt upload

**Expected Result:**
- R2 returns 403 Forbidden
- Frontend shows: "Upload URL expired"
- User can click "Get New URL"
- New upload starts successfully

---

### Test Case 10: Orphaned Upload (No Confirmation)

**Steps:**
1. Call `initiateUpload`
2. Upload to R2 successfully
3. Never call `confirmUpload`
4. Wait 24 hours

**Expected Result:**
- Asset remains in `DRAFT` status
- Cleanup job deletes file from R2
- Database record soft-deleted
- User notified of abandoned upload

---

## Support & Resources

### Documentation

- **Backend API Docs**: `docs/modules/ip-assets/API_IMPLEMENTATION_COMPLETE.md`
- **Storage Docs**: `docs/infrastructure/storage/UPLOAD_SERVICE_COMPLETE.md`
- **Virus Scanner**: `docs/infrastructure/storage/UPLOAD_SERVICE_QUICK_REFERENCE.md`

### Developer Tools

- **tRPC Playground**: https://ops.yesgoddess.agency/api/trpc-panel
- **Storage Dashboard**: https://dash.cloudflare.com/r2
- **Redis Commander**: http://localhost:8081 (local dev)

### Contact

- **Backend Lead**: backend@yesgoddess.agency
- **DevOps**: devops@yesgoddess.agency
- **Security**: security@yesgoddess.agency

---

## Changelog

### v1.0.0 (October 12, 2025)
- Initial release
- Complete upload service implementation
- Virus scanning integration
- Analytics tracking
- Automatic cleanup jobs

---

**End of Integration Guide**
