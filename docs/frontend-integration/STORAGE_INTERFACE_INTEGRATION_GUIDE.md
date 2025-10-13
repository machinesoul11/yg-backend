# Storage Interface - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Storage Infrastructure  
**Last Updated:** October 12, 2025  
**Backend Status:** ✅ COMPLETE

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
11. [Pagination & Filtering](#pagination--filtering)
12. [Frontend Implementation Checklist](#frontend-implementation-checklist)
13. [Testing Scenarios](#testing-scenarios)

---

## Overview

The Storage Interface provides a unified abstraction layer for file operations across multiple cloud storage providers (currently Cloudflare R2). It handles:

- ✅ Direct browser-to-storage uploads (no backend routing)
- ✅ Signed URL generation for secure access
- ✅ Multipart uploads for large files (>100MB)
- ✅ File metadata retrieval and management
- ✅ Batch operations (delete, copy, move)
- ✅ Progress tracking for uploads
- ✅ Automatic retry logic with exponential backoff

**Key Features:**
- **Security:** Server-side encryption (AES-256), signed URLs with expiry
- **Performance:** Direct uploads, CDN integration, chunked transfers
- **Reliability:** Automatic retries, circuit breaker pattern
- **Monitoring:** Built-in analytics and error tracking

---

## API Endpoints

### 1. Generate Upload URL (Signed PUT)

**Endpoint:** `trpc.ipAssets.initiateUpload`  
**Method:** Mutation  
**Auth:** Protected (JWT required)  
**Purpose:** Generate a signed URL for direct file upload to storage

**Use Cases:**
- 🌐 Creator uploads IP asset (image, video, document)
- 🌐 Brand uploads brand guidelines
- 🌐 User uploads profile picture or verification documents

---

### 2. Generate Presigned POST

**Endpoint:** Not directly exposed via tRPC (use storage provider directly in API routes)  
**Method:** POST  
**Auth:** Protected  
**Purpose:** Generate presigned POST for browser form uploads

**Use Cases:**
- Large file uploads requiring progress tracking
- Uploads from legacy browsers
- Form-based file submissions

---

### 3. Confirm Upload

**Endpoint:** `trpc.ipAssets.confirmUpload`  
**Method:** Mutation  
**Auth:** Protected  
**Purpose:** Finalize upload and trigger processing jobs

---

### 4. Get Download URL

**Endpoint:** `trpc.ipAssets.getDownloadUrl`  
**Method:** Query  
**Auth:** Protected  
**Purpose:** Generate temporary download URL for a file

---

### 5. Delete Asset

**Endpoint:** `trpc.ipAssets.delete`  
**Method:** Mutation  
**Auth:** Protected  
**Purpose:** Soft delete an asset (moves to trash)

---

### 6. List Assets

**Endpoint:** `trpc.ipAssets.list`  
**Method:** Query  
**Auth:** Protected  
**Purpose:** Retrieve paginated list of assets with filters

---

### 7. Get Asset Metadata

**Endpoint:** `trpc.ipAssets.getMetadata`  
**Method:** Query  
**Auth:** Protected  
**Purpose:** Retrieve extracted metadata (EXIF, dimensions, etc.)

---

### 8. Admin: Bulk Delete (Execute)

**Endpoint:** `POST /api/admin/storage/bulk-delete/execute`  
**Method:** REST POST  
**Auth:** Admin only  
**Purpose:** Permanently delete multiple files

---

### 9. Admin: Storage Metrics

**Endpoint:** `GET /api/admin/storage/metrics`  
**Method:** REST GET  
**Auth:** Admin only  
**Purpose:** Retrieve storage usage analytics

---

## Request/Response Examples

### Example 1: Initiate Upload

**Request:**
```typescript
const result = await trpc.ipAssets.initiateUpload.mutate({
  fileName: "portrait.jpg",
  fileSize: 2048576, // bytes
  mimeType: "image/jpeg",
  projectId: "project_abc123" // optional
});
```

**Response:**
```typescript
{
  uploadUrl: "https://yesgoddess-assets.r2.cloudflarestorage.com/...",
  assetId: "1728739200000-a1b2c3d4e5f6",
  storageKey: "user_xyz/1728739200000-a1b2c3d4e5f6/portrait.jpg"
}
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.initiateUpload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "portrait.jpg",
    "fileSize": 2048576,
    "mimeType": "image/jpeg"
  }'
```

---

### Example 2: Upload File to Signed URL

**Frontend Code:**
```typescript
// After getting uploadUrl from initiateUpload
const uploadResponse = await fetch(uploadUrl, {
  method: "PUT",
  body: fileBlob,
  headers: {
    "Content-Type": "image/jpeg"
  }
});

if (!uploadResponse.ok) {
  throw new Error("Upload failed");
}
```

**cURL Example:**
```bash
curl -X PUT "SIGNED_UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @portrait.jpg
```

---

### Example 3: Confirm Upload

**Request:**
```typescript
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId: "1728739200000-a1b2c3d4e5f6",
  title: "Professional Headshot",
  description: "Portrait for brand campaign",
  metadata: {
    camera: "Canon EOS R5",
    location: "Studio A"
  }
});
```

**Response:**
```typescript
{
  id: "1728739200000-a1b2c3d4e5f6",
  title: "Professional Headshot",
  type: "IMAGE",
  status: "PROCESSING",
  scanStatus: "PENDING",
  fileSize: "2048576",
  mimeType: "image/jpeg",
  storageKey: "user_xyz/1728739200000-a1b2c3d4e5f6/portrait.jpg",
  createdAt: "2025-10-12T10:30:00.000Z",
  updatedAt: "2025-10-12T10:30:15.000Z",
  creator: {
    id: "user_xyz",
    name: "Jane Doe",
    email: "jane@example.com"
  }
}
```

---

### Example 4: Get Download URL

**Request:**
```typescript
const download = await trpc.ipAssets.getDownloadUrl.query({
  id: "1728739200000-a1b2c3d4e5f6",
  expiresIn: 3600, // 1 hour (optional)
  filename: "professional-headshot.jpg" // optional
});
```

**Response:**
```typescript
{
  url: "https://yesgoddess-assets.r2.cloudflarestorage.com/...",
  expiresAt: "2025-10-12T11:30:00.000Z"
}
```

**Browser Usage:**
```typescript
// Trigger download
window.location.href = download.url;

// Or use in img tag
<img src={download.url} alt="Asset" />
```

---

### Example 5: List Assets with Filters

**Request:**
```typescript
const assetList = await trpc.ipAssets.list.query({
  filters: {
    type: "IMAGE",
    status: "ACTIVE",
    projectId: "project_abc123"
  },
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc"
});
```

**Response:**
```typescript
{
  assets: [
    {
      id: "asset_1",
      title: "Portrait 1",
      type: "IMAGE",
      status: "ACTIVE",
      fileSize: "2048576",
      thumbnailUrl: "https://...",
      createdAt: "2025-10-12T10:00:00.000Z"
    }
    // ... more assets
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 45,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: false
  }
}
```

---

### Example 6: Error Response

**Validation Error:**
```typescript
{
  error: {
    code: "BAD_REQUEST",
    message: "File size exceeds maximum allowed (50MB)",
    data: {
      code: "FILE_TOO_LARGE",
      details: {
        fileSize: 104857600,
        maxSize: 52428800
      }
    }
  }
}
```

**Authentication Error:**
```typescript
{
  error: {
    code: "UNAUTHORIZED",
    message: "You must be logged in to perform this action"
  }
}
```

---

## TypeScript Type Definitions

### Core Interfaces

```typescript
/**
 * Storage Provider Interface
 * Core methods for file operations
 */
export interface IStorageProvider {
  // Upload operations
  upload(params: {
    key: string;
    file: Buffer | ReadableStream;
    contentType: string;
    metadata?: Record<string, string>;
    progressCallback?: ProgressCallback;
  }): Promise<{ key: string; url: string; size: number }>;

  // Generate signed URL for direct upload (PUT)
  getUploadUrl(params: {
    key: string;
    contentType: string;
    expiresIn?: number; // seconds, default 900 (15 min)
    maxSizeBytes?: number;
  }): Promise<{ uploadUrl: string; key: string }>;

  // Generate presigned POST for form uploads
  getPresignedPost(params: {
    key: string;
    contentType: string;
    expiresIn?: number; // seconds, default 900 (15 min)
    maxSizeBytes?: number;
    conditions?: Array<any>;
  }): Promise<{
    url: string;
    fields: Record<string, string>;
  }>;

  // Generate signed URL for download
  getDownloadUrl(params: {
    key: string;
    expiresIn?: number; // seconds, default 900 (15 min)
    filename?: string; // suggested download filename
  }): Promise<{ url: string; expiresAt: Date }>;

  // Delete operations
  delete(key: string): Promise<void>;
  deleteBatch(keys: string[]): Promise<{ 
    deleted: string[]; 
    failed: string[] 
  }>;

  // Metadata operations
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<{
    size: number;
    contentType: string;
    lastModified: Date;
    etag: string;
  }>;

  // List/browse operations
  list(params: {
    prefix?: string;
    maxResults?: number;
    continuationToken?: string;
  }): Promise<{
    items: Array<{ 
      key: string; 
      size: number; 
      lastModified: Date 
    }>;
    continuationToken?: string;
  }>;

  // Copy/move operations
  copy(params: {
    sourceKey: string;
    destinationKey: string;
  }): Promise<{ key: string }>;

  move(params: {
    sourceKey: string;
    destinationKey: string;
  }): Promise<{ key: string }>;
}
```

---

### Upload Types

```typescript
/**
 * Initiate upload request
 */
export interface InitiateUploadInput {
  fileName: string;
  fileSize: number; // bytes
  mimeType: string;
  projectId?: string; // optional project association
}

/**
 * Upload initiation response
 */
export interface UploadInitiationResponse {
  uploadUrl: string; // Signed PUT URL
  assetId: string; // Generated asset ID
  storageKey: string; // Storage path
}

/**
 * Confirm upload request
 */
export interface ConfirmUploadInput {
  assetId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Progress callback for tracking uploads
 */
export interface ProgressCallback {
  (progress: ProgressEvent): void;
}

export interface ProgressEvent {
  bytesTransferred: number;
  totalBytes: number;
  percentComplete: number;
  estimatedTimeRemainingMs?: number;
  transferSpeedBps?: number;
  operation: 'upload' | 'download' | 'copy' | 'move';
}
```

---

### Asset Types

```typescript
/**
 * Asset response from API
 */
export interface IpAssetResponse {
  id: string;
  title: string;
  description?: string;
  type: AssetType; // IMAGE | VIDEO | DOCUMENT | AUDIO | OTHER
  status: AssetStatus; // DRAFT | PROCESSING | ACTIVE | ARCHIVED
  scanStatus: ScanStatus; // PENDING | CLEAN | INFECTED | FAILED
  fileSize: string; // BigInt as string
  mimeType: string;
  storageKey: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  metadata?: Record<string, any>;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Asset list response
 */
export interface AssetListResponse {
  assets: IpAssetResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Asset filters for list queries
 */
export interface ListAssetsInput {
  filters?: {
    projectId?: string;
    type?: AssetType;
    status?: AssetStatus;
    scanStatus?: ScanStatus;
    createdBy?: string;
    search?: string; // Search in title/description
  };
  page?: number; // default: 1
  pageSize?: number; // default: 20, max: 100
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}
```

---

### Enums

```typescript
export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
  OTHER = 'OTHER'
}

export enum AssetStatus {
  DRAFT = 'DRAFT',         // Initial state, upload not confirmed
  PROCESSING = 'PROCESSING', // Upload confirmed, processing jobs queued
  ACTIVE = 'ACTIVE',       // Processing complete, ready for use
  ARCHIVED = 'ARCHIVED',   // Soft deleted, retained for 30 days
  DELETED = 'DELETED'      // Permanently deleted
}

export enum ScanStatus {
  PENDING = 'PENDING',     // Awaiting virus scan
  CLEAN = 'CLEAN',         // Passed virus scan
  INFECTED = 'INFECTED',   // Failed virus scan, quarantined
  FAILED = 'FAILED'        // Scan job failed
}

export enum StorageErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  DELETE_FAILED = 'DELETE_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  INSUFFICIENT_STORAGE = 'INSUFFICIENT_STORAGE',
  INVALID_KEY = 'INVALID_KEY',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN'
}
```

---

### Storage Configuration

```typescript
export interface StorageConfig {
  provider: 'r2' | 'azure';
  maxFileSize: number; // bytes
  allowedTypes: string[]; // MIME types
  uploadUrlExpiry: number; // seconds
  downloadUrlExpiry: number; // seconds
}

// Current configuration
export const STORAGE_CONFIG = {
  maxFileSize: 52428800, // 50MB
  allowedTypes: [
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
    'audio/wav'
  ],
  uploadUrlExpiry: 900, // 15 minutes
  downloadUrlExpiry: 3600 // 1 hour
};
```

---

## Business Logic & Validation Rules

### File Upload Constraints

| Constraint | Value | Enforced By |
|------------|-------|-------------|
| **Max File Size** | 50MB (52,428,800 bytes) | Backend + Frontend |
| **Max File Size (Multipart)** | 5GB (automatic chunking) | Backend |
| **Upload URL Expiry** | 15 minutes (900 seconds) | Backend |
| **Download URL Expiry** | 1 hour (3600 seconds) | Backend |
| **Chunk Size (Large Files)** | 10MB | Backend |
| **Concurrent Uploads** | 5 parts max | Backend |

### Allowed File Types

**Images:**
- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

**Videos:**
- `video/mp4`
- `video/quicktime` (MOV)

**Documents:**
- `application/pdf`
- `application/msword` (DOC)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)

**Audio:**
- `audio/mpeg` (MP3)
- `audio/wav`

### Filename Sanitization

**Rules:**
- Remove path traversal sequences (`../`, `..\\`)
- Replace spaces with underscores
- Convert to lowercase
- Remove special characters except: `_`, `-`, `.`
- Max length: 255 characters
- Preserve file extension

**Example:**
```typescript
"My Photo (2024).JPG" → "my_photo_2024.jpg"
"../../etc/passwd" → "etc_passwd"
```

### Asset Type Detection

```typescript
const MIME_TO_ASSET_TYPE = {
  'image/*': AssetType.IMAGE,
  'video/*': AssetType.VIDEO,
  'audio/*': AssetType.AUDIO,
  'application/pdf': AssetType.DOCUMENT,
  'application/msword': AssetType.DOCUMENT,
  'application/vnd.*': AssetType.DOCUMENT
};
```

### Status Transitions

**Valid Transitions:**
```
DRAFT → PROCESSING → ACTIVE
       ↓
       ARCHIVED → DELETED
```

**Invalid Transitions:**
- ACTIVE → DRAFT (cannot revert to draft)
- DELETED → any status (permanent deletion)
- INFECTED → ACTIVE (infected files cannot be activated)

### Project Ownership Validation

**Rule:** If `projectId` is provided, the user must own the project.

**Check:**
```typescript
const project = await prisma.project.findFirst({
  where: {
    id: projectId,
    brand: { userId: currentUserId },
    deletedAt: null
  }
});

if (!project) {
  throw new Error("Project not found or access denied");
}
```

---

## Error Handling

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    code: string;           // TRPC error code
    message: string;        // User-friendly message
    data?: {
      code: string;         // Specific error code
      details?: any;        // Additional context
    }
  }
}
```

---

### Storage Error Codes

| Error Code | HTTP Status | Description | User Message | Retryable |
|------------|-------------|-------------|--------------|-----------|
| `VALIDATION_FAILED` | 400 | Input validation failed | "Please check your input and try again" | No |
| `INVALID_KEY` | 400 | Storage key format invalid | "Invalid file path" | No |
| `FILE_TOO_LARGE` | 400 | File exceeds size limit | "File size must be under 50MB" | No |
| `INVALID_FILE_TYPE` | 400 | File type not allowed | "This file type is not supported" | No |
| `UPLOAD_FAILED` | 500 | Upload operation failed | "Upload failed. Please try again" | Yes |
| `DOWNLOAD_FAILED` | 500 | Download operation failed | "Failed to generate download link" | Yes |
| `DELETE_FAILED` | 500 | Delete operation failed | "Failed to delete file" | Yes |
| `NOT_FOUND` | 404 | File/asset not found | "File not found" | No |
| `AUTHENTICATION_FAILED` | 401 | Auth credentials invalid | "Authentication failed" | No |
| `NETWORK_ERROR` | 503 | Network connectivity issue | "Network error. Please try again" | Yes |
| `TIMEOUT` | 504 | Operation timed out | "Request timed out. Please try again" | Yes |
| `RATE_LIMITED` | 429 | Rate limit exceeded | "Too many requests. Please wait" | Yes (after delay) |
| `CIRCUIT_BREAKER_OPEN` | 503 | Service temporarily unavailable | "Service temporarily unavailable" | Yes (after cooldown) |

---

### Asset-Specific Errors

```typescript
export const AssetErrors = {
  notFound: (id: string) => ({
    code: 'ASSET_NOT_FOUND',
    message: `Asset ${id} not found`,
    httpStatus: 404
  }),

  accessDenied: (id: string) => ({
    code: 'ACCESS_DENIED',
    message: `You don't have permission to access asset ${id}`,
    httpStatus: 403
  }),

  invalidFileType: (mimeType: string) => ({
    code: 'INVALID_FILE_TYPE',
    message: `File type ${mimeType} is not allowed`,
    httpStatus: 400
  }),

  fileSizeTooLarge: (size: number, maxSize: number) => ({
    code: 'FILE_TOO_LARGE',
    message: `File size (${size} bytes) exceeds maximum (${maxSize} bytes)`,
    httpStatus: 400
  }),

  uploadFailed: (reason: string) => ({
    code: 'UPLOAD_FAILED',
    message: `Upload failed: ${reason}`,
    httpStatus: 500
  }),

  invalidTransition: (from: string, to: string) => ({
    code: 'INVALID_STATUS_TRANSITION',
    message: `Cannot transition from ${from} to ${to}`,
    httpStatus: 400
  })
};
```

---

### Error Handling Best Practices

**1. Display User-Friendly Messages**

```typescript
try {
  await uploadFile();
} catch (error: any) {
  const userMessage = ERROR_MESSAGES[error.code] || "An error occurred";
  toast.error(userMessage);
}
```

**2. Retry Transient Errors**

```typescript
async function uploadWithRetry(file: File, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFile(file);
    } catch (error: any) {
      const isRetryable = [
        'UPLOAD_FAILED',
        'NETWORK_ERROR',
        'TIMEOUT'
      ].includes(error.code);

      if (!isRetryable || i === maxRetries - 1) {
        throw error;
      }

      await delay(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

**3. Handle Rate Limiting**

```typescript
if (error.code === 'RATE_LIMITED') {
  const retryAfter = error.data?.retryAfter || 60;
  toast.warning(`Too many requests. Please wait ${retryAfter} seconds.`);
  // Disable upload button for retryAfter seconds
}
```

**4. Log Errors for Debugging**

```typescript
if (process.env.NODE_ENV === 'development') {
  console.error('Upload Error:', {
    code: error.code,
    message: error.message,
    details: error.data
  });
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Endpoint | Creator | Brand | Admin |
|----------|---------|-------|-------|
| `initiateUpload` | ✅ Own assets | ✅ Own assets | ✅ All assets |
| `confirmUpload` | ✅ Own assets | ✅ Own assets | ✅ All assets |
| `getDownloadUrl` | ✅ Own assets | ✅ Licensed assets | ✅ All assets |
| `list` | ✅ Own assets | ✅ Licensed assets | ✅ All assets |
| `update` | ✅ Own assets | ❌ | ✅ All assets |
| `delete` | ✅ Own assets | ❌ | ✅ All assets |
| `bulkDelete` | ❌ | ❌ | ✅ |
| `storageMetrics` | ❌ | ❌ | ✅ |

### Row-Level Security

**Creators:**
- Can only see/modify their own assets
- Cannot access other creators' assets
- Can see assets they've licensed to brands

**Brands:**
- Can see assets in projects they own
- Can see assets they've licensed
- Cannot modify creator-owned assets

**Admins:**
- Full access to all assets
- Can perform bulk operations
- Can access storage metrics

### JWT Claims Required

```typescript
{
  user: {
    id: string;        // User ID
    role: UserRole;    // CREATOR | BRAND | ADMIN
    email: string;
  },
  iat: number;
  exp: number;
}
```

### Permission Checks in Frontend

```typescript
function canUploadAsset(user: User): boolean {
  return ['CREATOR', 'BRAND', 'ADMIN'].includes(user.role);
}

function canDeleteAsset(user: User, asset: Asset): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CREATOR' && asset.createdBy === user.id) return true;
  return false;
}

function canViewStorageMetrics(user: User): boolean {
  return user.role === 'ADMIN';
}
```

---

## Rate Limiting & Quotas

### Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `initiateUpload` | 100 requests | 1 hour | Per user |
| `confirmUpload` | 100 requests | 1 hour | Per user |
| `getDownloadUrl` | 500 requests | 1 hour | Per user |
| `list` | 200 requests | 1 hour | Per user |
| Admin endpoints | 1000 requests | 1 hour | Per admin |

### Response Headers

When rate limited, check these headers:

```typescript
{
  "X-RateLimit-Limit": "100",
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Reset": "1728743400", // Unix timestamp
  "Retry-After": "60" // seconds
}
```

### Storage Quotas

| User Role | Upload Quota | Total Storage |
|-----------|--------------|---------------|
| **Creator (Free)** | 10 uploads/day | 1GB |
| **Creator (Pro)** | 100 uploads/day | 50GB |
| **Brand** | 500 uploads/day | 500GB |
| **Admin** | Unlimited | Unlimited |

### Frontend Handling

```typescript
// Check rate limit from response
if (error.code === 'RATE_LIMITED') {
  const resetTime = new Date(error.data.resetAt);
  const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);
  
  setErrorMessage(`Rate limit exceeded. Try again in ${secondsUntilReset} seconds.`);
  
  // Disable upload button temporarily
  setTimeout(() => {
    setRateLimited(false);
  }, secondsUntilReset * 1000);
}
```

---

## File Upload Flow

### Complete Upload Workflow

```
┌─────────────┐
│   User      │
│  Selects    │
│   File      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Frontend: Validate File              │
│    - Check file size (< 50MB)           │
│    - Check file type (allowed MIME)     │
│    - Check user quota                   │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 2. Call: initiateUpload()               │
│    - Backend validates permissions      │
│    - Creates DRAFT asset record         │
│    - Generates signed upload URL        │
│    - Returns: { uploadUrl, assetId }    │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. Direct Upload to Storage (PUT)       │
│    - Browser uploads to signed URL      │
│    - No backend routing                 │
│    - Track upload progress              │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 4. Call: confirmUpload()                │
│    - Provide asset metadata             │
│    - Backend verifies file exists       │
│    - Status: DRAFT → PROCESSING         │
│    - Queues virus scan job              │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 5. Background Processing                │
│    - Virus scan (high priority)         │
│    - Thumbnail generation               │
│    - Metadata extraction                │
│    - Status: PROCESSING → ACTIVE        │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 6. Asset Ready for Use                  │
│    - Status: ACTIVE                     │
│    - Scan Status: CLEAN                 │
│    - Available for licensing            │
└─────────────────────────────────────────┘
```

---

### Implementation: React Upload Component

```typescript
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'react-hot-toast';

export function FileUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const initiateUpload = trpc.ipAssets.initiateUpload.useMutation();
  const confirmUpload = trpc.ipAssets.confirmUpload.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file size
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (selectedFile.size > MAX_SIZE) {
      toast.error('File size must be under 50MB');
      return;
    }

    // Validate file type
    const ALLOWED_TYPES = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'application/pdf'
    ];
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      toast.error('File type not supported');
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Get signed upload URL
      const { uploadUrl, assetId } = await initiateUpload.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      });

      // Step 2: Upload to storage with progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Confirm upload
      await confirmUpload.mutateAsync({
        assetId,
        title: file.name,
        description: 'Uploaded via web interface'
      });

      toast.success('Upload complete! Processing...');
      setFile(null);
      setProgress(0);

    } catch (error: any) {
      console.error('Upload error:', error);
      
      if (error.code === 'FILE_TOO_LARGE') {
        toast.error('File is too large');
      } else if (error.code === 'RATE_LIMITED') {
        toast.error('Too many uploads. Please wait.');
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleFileChange}
        accept="image/*,video/*,application/pdf"
        disabled={uploading}
      />

      {file && (
        <div>
          <p>Selected: {file.name} ({formatBytes(file.size)})</p>
          
          {uploading && (
            <div>
              <progress value={progress} max={100} />
              <span>{progress.toFixed(0)}%</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
```

---

### Presigned POST Upload (Alternative)

For form-based uploads or older browsers:

```typescript
// 1. Generate presigned POST (backend API route)
export async function POST(request: Request) {
  const { filename, contentType, userId } = await request.json();
  
  const { url, fields } = await storageProvider.getPresignedPost({
    key: `uploads/${userId}/${filename}`,
    contentType,
    expiresIn: 900,
    maxSizeBytes: 50 * 1024 * 1024
  });
  
  return Response.json({ url, fields });
}

// 2. Frontend upload using FormData
const { url, fields } = await fetch('/api/storage/presigned-post', {
  method: 'POST',
  body: JSON.stringify({ filename, contentType, userId })
}).then(r => r.json());

const formData = new FormData();

// Add presigned fields first
Object.entries(fields).forEach(([key, value]) => {
  formData.append(key, value);
});

// Add file last
formData.append('file', file);

// Upload directly to storage
await fetch(url, {
  method: 'POST',
  body: formData
});
```

---

## Real-time Updates

### Polling for Processing Status

Since uploads trigger asynchronous processing (virus scan, thumbnail generation), poll for status updates:

```typescript
import { useQuery } from '@tanstack/react-query';

function useAssetStatus(assetId: string) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => trpc.ipAssets.getById.query({ id: assetId }),
    refetchInterval: (data) => {
      // Poll every 2 seconds while processing
      if (data?.status === 'PROCESSING') return 2000;
      
      // Stop polling when complete
      return false;
    },
    enabled: !!assetId
  });
}

// Usage
function AssetStatus({ assetId }: { assetId: string }) {
  const { data: asset, isLoading } = useAssetStatus(assetId);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <p>Status: {asset.status}</p>
      <p>Scan: {asset.scanStatus}</p>
      
      {asset.status === 'PROCESSING' && (
        <div>Processing... Please wait</div>
      )}
      
      {asset.status === 'ACTIVE' && asset.scanStatus === 'CLEAN' && (
        <div>✅ Ready to use!</div>
      )}
      
      {asset.scanStatus === 'INFECTED' && (
        <div>⚠️ File failed security scan</div>
      )}
    </div>
  );
}
```

---

### WebSocket Support (Future)

Not currently implemented, but recommended for real-time notifications:

```typescript
// Future implementation
socket.on('asset:processing', (data) => {
  console.log(`Asset ${data.assetId}: ${data.progress}%`);
});

socket.on('asset:ready', (data) => {
  toast.success('Your asset is ready!');
  queryClient.invalidateQueries(['asset', data.assetId]);
});

socket.on('asset:error', (data) => {
  toast.error('Processing failed');
});
```

---

## Pagination & Filtering

### Pagination Strategy

**Type:** Offset-based (page numbers)

**Default:**
- Page: 1
- Page Size: 20
- Max Page Size: 100

---

### Example: Paginated Asset List

```typescript
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

function AssetList() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: undefined,
    status: undefined,
    search: ''
  });

  const { data, isLoading } = trpc.ipAssets.list.useQuery({
    filters: {
      type: filters.type,
      status: filters.status,
      search: filters.search || undefined
    },
    page,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {/* Filters */}
      <div>
        <select
          value={filters.type || ''}
          onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
          <option value="DOCUMENT">Documents</option>
        </select>

        <input
          type="text"
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-4 gap-4">
        {data?.assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage(p => p - 1)}
          disabled={!data?.pagination.hasPreviousPage}
        >
          Previous
        </button>

        <span>
          Page {data?.pagination.page} of {data?.pagination.totalPages}
        </span>

        <button
          onClick={() => setPage(p => p + 1)}
          disabled={!data?.pagination.hasNextPage}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

### Available Filters

| Filter | Type | Description |
|--------|------|-------------|
| `type` | `AssetType` | Filter by asset type (IMAGE, VIDEO, etc.) |
| `status` | `AssetStatus` | Filter by status (ACTIVE, PROCESSING, etc.) |
| `scanStatus` | `ScanStatus` | Filter by scan status (CLEAN, PENDING, etc.) |
| `projectId` | `string` | Filter by project |
| `createdBy` | `string` | Filter by creator (admin only) |
| `search` | `string` | Search in title and description |

---

### Available Sort Options

| Sort By | Description |
|---------|-------------|
| `createdAt` | Upload date (default) |
| `updatedAt` | Last modified date |
| `title` | Alphabetical by title |
| `fileSize` | File size |

---

## Frontend Implementation Checklist

### Phase 1: Core Upload Functionality

- [ ] **File Input Component**
  - [ ] Accept multiple file types
  - [ ] Show file preview (images)
  - [ ] Display file size
  - [ ] Validate file type and size client-side

- [ ] **Upload Flow**
  - [ ] Call `initiateUpload` mutation
  - [ ] Handle signed URL response
  - [ ] Upload file to signed URL with progress tracking
  - [ ] Call `confirmUpload` mutation
  - [ ] Handle upload errors with retry logic

- [ ] **Progress Indicator**
  - [ ] Show upload percentage
  - [ ] Display upload speed
  - [ ] Show estimated time remaining
  - [ ] Allow upload cancellation

---

### Phase 2: Asset Management

- [ ] **Asset List View**
  - [ ] Display paginated grid/list
  - [ ] Show thumbnail previews
  - [ ] Display file type icons
  - [ ] Show processing status badges

- [ ] **Asset Filters**
  - [ ] Filter by type dropdown
  - [ ] Filter by status dropdown
  - [ ] Search by title/description
  - [ ] Clear all filters button

- [ ] **Asset Details**
  - [ ] Display full metadata
  - [ ] Show download button
  - [ ] Show edit metadata form (creators only)
  - [ ] Show delete button (with confirmation)

---

### Phase 3: Download & Sharing

- [ ] **Download Functionality**
  - [ ] Generate download URL
  - [ ] Trigger browser download
  - [ ] Show download progress
  - [ ] Handle download errors

- [ ] **Sharing**
  - [ ] Generate shareable links (future)
  - [ ] Copy link to clipboard
  - [ ] Set link expiry (future)

---

### Phase 4: Error Handling

- [ ] **User-Friendly Error Messages**
  - [ ] Map error codes to messages
  - [ ] Display errors in toast/notification
  - [ ] Show retry button for transient errors

- [ ] **Rate Limiting**
  - [ ] Detect rate limit errors
  - [ ] Display countdown timer
  - [ ] Disable UI during rate limit

- [ ] **Offline Handling**
  - [ ] Detect offline state
  - [ ] Queue uploads for retry
  - [ ] Show offline indicator

---

### Phase 5: Admin Features

- [ ] **Bulk Operations**
  - [ ] Select multiple assets (checkboxes)
  - [ ] Bulk delete with confirmation
  - [ ] Bulk status update

- [ ] **Storage Metrics Dashboard**
  - [ ] Display total storage used
  - [ ] Show upload/download counts
  - [ ] Display error rates
  - [ ] Chart storage usage over time

---

### Phase 6: Performance Optimization

- [ ] **Lazy Loading**
  - [ ] Implement infinite scroll for asset list
  - [ ] Load thumbnails on viewport enter
  - [ ] Prefetch next page of results

- [ ] **Caching**
  - [ ] Cache asset list queries
  - [ ] Cache thumbnail URLs
  - [ ] Invalidate cache on upload/delete

- [ ] **Image Optimization**
  - [ ] Use responsive images
  - [ ] Implement lazy loading for images
  - [ ] Show low-res placeholder while loading

---

## Testing Scenarios

### Unit Tests

**File Validation:**
```typescript
describe('File Validation', () => {
  it('should reject files over 50MB', () => {
    const file = new File([''], 'large.jpg', {
      type: 'image/jpeg',
      size: 51 * 1024 * 1024 // 51MB
    });
    expect(validateFileSize(file)).toBe(false);
  });

  it('should accept valid file types', () => {
    const file = new File([''], 'photo.jpg', {
      type: 'image/jpeg'
    });
    expect(validateFileType(file)).toBe(true);
  });

  it('should reject invalid file types', () => {
    const file = new File([''], 'script.exe', {
      type: 'application/x-executable'
    });
    expect(validateFileType(file)).toBe(false);
  });
});
```

---

### Integration Tests

**Complete Upload Flow:**
```typescript
describe('Asset Upload Flow', () => {
  it('should complete full upload workflow', async () => {
    const file = new File(['test'], 'test.jpg', {
      type: 'image/jpeg'
    });

    // 1. Initiate upload
    const initResponse = await trpc.ipAssets.initiateUpload.mutate({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    });

    expect(initResponse.uploadUrl).toBeDefined();
    expect(initResponse.assetId).toBeDefined();

    // 2. Upload to signed URL
    const uploadResponse = await fetch(initResponse.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    });

    expect(uploadResponse.ok).toBe(true);

    // 3. Confirm upload
    const asset = await trpc.ipAssets.confirmUpload.mutate({
      assetId: initResponse.assetId,
      title: 'Test Asset'
    });

    expect(asset.status).toBe('PROCESSING');
    expect(asset.scanStatus).toBe('PENDING');
  });
});
```

---

### E2E Tests (Playwright)

```typescript
test('Creator can upload and view asset', async ({ page }) => {
  // Login as creator
  await page.goto('/login');
  await page.fill('[name="email"]', 'creator@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to upload page
  await page.goto('/assets/upload');

  // Select file
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-assets/photo.jpg');

  // Wait for validation
  await expect(page.locator('text=photo.jpg')).toBeVisible();

  // Click upload
  await page.click('button:has-text("Upload")');

  // Wait for progress
  await expect(page.locator('progress')).toBeVisible();

  // Wait for completion
  await expect(page.locator('text=Upload complete')).toBeVisible({
    timeout: 30000
  });

  // Navigate to asset list
  await page.goto('/assets');

  // Verify asset appears
  await expect(page.locator('text=photo.jpg')).toBeVisible();
});
```

---

### Edge Cases to Test

1. **Network Failures**
   - Simulate network disconnection during upload
   - Verify retry logic works
   - Ensure UI shows appropriate error

2. **Large Files**
   - Upload 49MB file (just under limit)
   - Verify multipart upload for 100MB+ files
   - Test progress tracking accuracy

3. **Concurrent Uploads**
   - Upload 5 files simultaneously
   - Verify all complete successfully
   - Check for race conditions

4. **Expired URLs**
   - Wait 16 minutes after getting upload URL
   - Attempt to upload
   - Verify error handling

5. **Duplicate Filenames**
   - Upload file twice with same name
   - Verify files are stored separately
   - Check filename sanitization

6. **Invalid Files**
   - Upload .exe file
   - Upload corrupted image
   - Upload 0-byte file

7. **Permission Checks**
   - Try to delete another user's asset
   - Try to download private asset
   - Verify 403 errors

8. **Rate Limiting**
   - Make 101 upload requests in 1 hour
   - Verify rate limit response
   - Check rate limit headers

---

### Performance Testing

**Load Test Scenario:**
```bash
# Artillery load test
artillery run load-test.yml
```

**load-test.yml:**
```yaml
config:
  target: "https://ops.yesgoddess.agency"
  phases:
    - duration: 60
      arrivalRate: 10 # 10 users/sec
scenarios:
  - name: "Upload Asset"
    flow:
      - post:
          url: "/api/trpc/ipAssets.initiateUpload"
          headers:
            Authorization: "Bearer {{token}}"
          json:
            fileName: "test.jpg"
            fileSize: 1048576
            mimeType: "image/jpeg"
```

---

## Additional Resources

### Related Documentation

- [Authentication Integration Guide](./FRONTEND_INTEGRATION_AUTHENTICATION.md)
- [IP Assets Module Overview](../modules/ip-assets/overview.md)
- [Storage Configuration](../infrastructure/storage/configuration.md)
- [Error Handling Guide](../operations/error-handling.md)

### Backend Files Reference

**Storage Provider:**
- `src/lib/storage/types.ts` - Interface definitions
- `src/lib/storage/providers/r2.ts` - R2 implementation
- `src/lib/storage/base.ts` - Base provider with retry logic

**IP Assets Module:**
- `src/modules/ip/router.ts` - tRPC endpoints
- `src/modules/ip/service.ts` - Business logic
- `src/modules/ip/validation.ts` - Zod schemas

**Configuration:**
- `src/lib/config/storage.ts` - Storage configuration
- `.env` - Environment variables

---

## Support & Questions

**Backend Developer Contact:**  
For questions about this integration guide or backend implementation details.

**Common Questions:**

1. **Q: Can I upload files larger than 50MB?**  
   A: Yes, but only via server-side upload. Direct browser uploads are limited to 50MB. Contact admin for large file uploads.

2. **Q: How long are upload URLs valid?**  
   A: 15 minutes (900 seconds). Request a new URL if expired.

3. **Q: Can I resume interrupted uploads?**  
   A: Not currently. Uploads must be retried from the beginning.

4. **Q: What happens to failed uploads?**  
   A: Draft asset records are cleaned up after 24 hours if not confirmed.

5. **Q: Can I upload directly from mobile?**  
   A: Yes, the same flow works on mobile browsers using file input.

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-12 | 1.0.0 | Initial release |

---

**Next Steps:**
1. Review type definitions and copy to your frontend project
2. Implement file upload component
3. Add error handling and retry logic
4. Test with various file types and sizes
5. Implement asset management UI

**Questions?** Contact the backend team for clarification on any endpoints or data structures.
