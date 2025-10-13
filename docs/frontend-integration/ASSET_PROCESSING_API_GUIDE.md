# Asset Processing - Frontend Integration Guide (Part 1: API Reference)

**Classification:** 🌐 SHARED  
**Module:** Asset Processing  
**Last Updated:** October 12, 2025  
**Version:** 1.0

> **Note:** Creators upload assets via public website, admins manage/review assets via admin interface. Storage infrastructure is shared, permissions differ.

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)

---

## Overview

The Asset Processing module handles the complete lifecycle of media assets (images, videos, audio, documents) including:

- **Upload Management**: Signed URL generation and confirmation
- **Automatic Processing**: Thumbnails, metadata extraction, previews, format conversion
- **Quality Validation**: File validation, virus scanning
- **Watermarking**: On-demand watermark application
- **Variant Generation**: Multiple sizes and formats

### Processing Pipeline

```
1. Initiate Upload (get signed URL)
   ↓
2. Frontend uploads directly to storage (Cloudflare R2)
   ↓
3. Confirm upload (triggers processing)
   ↓
4. Background Jobs (automatic):
   - Virus Scan (priority: critical)
   - Thumbnail Generation (priority: high)
   - Metadata Extraction (priority: high)
   - Preview Generation (optional, medium priority)
   - Format Conversion (optional, low priority)
   - Watermarking (on-demand only)
   ↓
5. Asset ready for use
```

---

## API Endpoints

All endpoints use **tRPC** over HTTP. Base URL: `https://ops.yesgoddess.agency/api/trpc`

### Asset Upload

#### 1. Initiate Upload
**Endpoint:** `ipAssets.initiateUpload`  
**Method:** `mutation`  
**Auth:** Required (JWT)

**Purpose:** Get a signed upload URL for direct browser-to-storage upload.

**Request:**
```typescript
{
  fileName: string;      // Original filename (max 255 chars)
  fileSize: number;      // Size in bytes (max 100MB)
  mimeType: string;      // MIME type (must be in allowed list)
  projectId?: string;    // Optional project association
}
```

**Response:**
```typescript
{
  uploadUrl: string;     // Signed URL (expires in 15 minutes)
  assetId: string;       // Pre-generated asset ID
  storageKey: string;    // Storage path for the file
}
```

**Rate Limit:** None (per-user file size quotas apply)

---

#### 2. Confirm Upload
**Endpoint:** `ipAssets.confirmUpload`  
**Method:** `mutation`  
**Auth:** Required (JWT)

**Purpose:** Confirm successful upload and trigger background processing.

**Request:**
```typescript
{
  assetId: string;           // From initiateUpload response
  title: string;             // User-friendly title (max 255 chars)
  description?: string;      // Optional description (max 2000 chars)
  metadata?: Record<string, any>;  // Optional custom metadata
}
```

**Response:**
```typescript
{
  id: string;
  title: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'MODEL_3D' | 'OTHER';
  status: 'PROCESSING';      // Always PROCESSING after confirmation
  scanStatus: 'PENDING';     // Virus scan status
  fileSize: number;
  mimeType: string;
  createdAt: string;         // ISO 8601
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  // ... other fields
}
```

**Background Jobs Triggered:**
- Virus scan (immediate)
- Thumbnail generation (after scan)
- Metadata extraction (after scan)
- Optional: Preview generation, format conversion

---

### Asset Retrieval

#### 3. List Assets
**Endpoint:** `ipAssets.list`  
**Method:** `query`  
**Auth:** Required (JWT)

**Request:**
```typescript
{
  filters?: {
    projectId?: string;
    type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'MODEL_3D' | 'OTHER';
    status?: 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
    createdBy?: string;      // User ID
    search?: string;         // Full-text search (title, description)
    fromDate?: string;       // ISO 8601
    toDate?: string;         // ISO 8601
  };
  page?: number;             // Default: 1
  pageSize?: number;         // Default: 20, max: 100
  sortBy?: 'createdAt' | 'updatedAt' | 'title';  // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc';  // Default: 'desc'
}
```

**Response:**
```typescript
{
  data: IpAssetResponse[];   // Array of assets
  meta: {
    total: number;           // Total matching records
    page: number;            // Current page
    pageSize: number;        // Items per page
    hasMore: boolean;        // More pages available
  };
}
```

---

#### 4. Get Asset by ID
**Endpoint:** `ipAssets.getById`  
**Method:** `query`  
**Auth:** Required (JWT)

**Request:**
```typescript
{
  id: string;  // Asset ID
}
```

**Response:**
```typescript
{
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;
  fileSize: number;          // Bytes
  mimeType: string;
  thumbnailUrl: string | null;  // Primary thumbnail (medium size)
  previewUrl: string | null;    // Preview clip URL (video/audio)
  version: number;
  parentAssetId: string | null; // For derivative assets
  metadata: Record<string, any> | null;  // Extracted metadata
  status: AssetStatus;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';
  createdBy: string;
  createdAt: string;         // ISO 8601
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}
```

---

### Asset Variants & Metadata

#### 5. Get Preview URL
**Endpoint:** `ipAssets.getPreview`  
**Method:** `query`  
**Auth:** Required (JWT)

**Purpose:** Get signed URL for a specific thumbnail size.

**Request:**
```typescript
{
  id: string;
  size?: 'small' | 'medium' | 'large' | 'original';  // Default: 'medium'
}
```

**Response:**
```typescript
{
  url: string;               // Signed URL (expires in 15 minutes)
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;            // Pixel width
  height?: number;           // Pixel height
  expiresAt: string;         // ISO 8601
}
```

**Thumbnail Sizes:**
- `small`: 200×200px
- `medium`: 400×400px
- `large`: 800×800px
- `original`: Full resolution

---

#### 6. Get Asset Variants
**Endpoint:** `ipAssets.getVariants`  
**Method:** `query`  
**Auth:** Required (JWT)

**Purpose:** Get all available variants (thumbnails, previews, waveforms).

**Request:**
```typescript
{
  id: string;
  type?: 'thumbnail' | 'preview' | 'all';  // Default: 'all'
}
```

**Response:**
```typescript
{
  thumbnails: {
    small?: {
      url: string;           // Signed URL
      size: 'small';
      width: 200;
      height: 200;
      expiresAt: string;
    };
    medium?: { /* ... */ };
    large?: { /* ... */ };
  };
  previews: {
    url?: string;            // Video/audio preview clip
    expiresAt?: string;
    duration?: number;       // Seconds
  };
  waveform?: {               // Audio only
    url?: string;
    expiresAt?: string;
  };
}
```

---

#### 7. Get Asset Metadata
**Endpoint:** `ipAssets.getMetadata`  
**Method:** `query`  
**Auth:** Required (JWT)

**Purpose:** Get detailed extracted metadata with field filtering.

**Request:**
```typescript
{
  id: string;
  fields?: ('technical' | 'descriptive' | 'extracted' | 'processing' | 'all')[];
  // Default: ['all']
}
```

**Response:**
```typescript
{
  type: AssetType;
  technical?: {              // Technical specifications
    width?: number;
    height?: number;
    duration?: number;       // Seconds
    bitrate?: number;        // bps
    codec?: string;
    fps?: number;
    sampleRate?: number;
    channels?: number;
    format?: string;
    resolution?: string;     // e.g., "1920x1080"
    colorSpace?: string;
    pageCount?: number;      // Documents
  };
  descriptive?: {            // Content metadata
    title?: string;
    artist?: string;
    album?: string;
    author?: string;
    creator?: string;
    subject?: string;
    keywords?: string;
    genre?: string;
  };
  extracted?: {              // Raw extracted data
    exif?: Record<string, any>;  // EXIF data for images
    creationDate?: string;
    modificationDate?: string;
  };
  processing?: {             // Processing status
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;
    previewGenerated?: boolean;
    previewGeneratedAt?: string;
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;
  };
}
```

---

#### 8. Regenerate Preview
**Endpoint:** `ipAssets.regeneratePreview`  
**Method:** `mutation`  
**Auth:** Required (JWT)

**Purpose:** Re-process thumbnails, previews, or metadata.

**Request:**
```typescript
{
  id: string;
  types?: ('thumbnail' | 'preview' | 'metadata' | 'all')[];
  // Default: ['all']
}
```

**Response:**
```typescript
{
  jobId: string;             // Job identifier
  status: 'queued' | 'processing';
  types: string[];           // Types queued for regeneration
}
```

**Use Cases:**
- Thumbnail corruption
- Updated watermark settings
- Failed initial processing
- Metadata updates needed

---

#### 9. Get Download URL
**Endpoint:** `ipAssets.getDownloadUrl`  
**Method:** `query`  
**Auth:** Required (JWT)

**Purpose:** Get signed URL for downloading original file.

**Request:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  url: string;               // Signed URL (expires in 15 minutes)
  expiresAt: string;         // ISO 8601
}
```

---

### Asset Management

#### 10. Update Asset
**Endpoint:** `ipAssets.update`  
**Method:** `mutation`  
**Auth:** Required (JWT + ownership)

**Request:**
```typescript
{
  id: string;
  title?: string;            // Max 255 chars
  description?: string | null;  // Max 2000 chars
  metadata?: Record<string, any>;  // Custom metadata
}
```

**Response:** Full asset object (same as `getById`)

---

#### 11. Update Asset Status
**Endpoint:** `ipAssets.updateStatus`  
**Method:** `mutation`  
**Auth:** Required (JWT + ownership or ADMIN)

**Request:**
```typescript
{
  id: string;
  status: AssetStatus;       // See status transitions below
  notes?: string;            // Optional notes (max 1000 chars)
}
```

**Response:** Full asset object

**Valid Status Transitions:**
```typescript
DRAFT       → REVIEW, ARCHIVED
PROCESSING  → DRAFT, REVIEW
REVIEW      → APPROVED, REJECTED, DRAFT
APPROVED    → PUBLISHED, ARCHIVED
PUBLISHED   → ARCHIVED
REJECTED    → DRAFT
ARCHIVED    → (none)
```

---

#### 12. Delete Asset
**Endpoint:** `ipAssets.delete`  
**Method:** `mutation`  
**Auth:** Required (JWT + ownership or ADMIN)

**Request:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  success: true;
}
```

**Notes:**
- Soft delete (30-day grace period)
- Fails if asset has active licenses
- Original file deleted after 30 days

---

#### 13. Get Derivatives
**Endpoint:** `ipAssets.getDerivatives`  
**Method:** `query`  
**Auth:** Required (JWT)

**Purpose:** Get all derivative assets created from a parent asset.

**Request:**
```typescript
{
  parentAssetId: string;
}
```

**Response:** Array of asset objects

---

#### 14. Bulk Update Status (Admin Only)
**Endpoint:** `ipAssets.bulkUpdateStatus`  
**Method:** `mutation`  
**Auth:** Required (JWT + ADMIN role)

**Request:**
```typescript
{
  assetIds: string[];        // Max 100 assets
  status: AssetStatus;
}
```

**Response:**
```typescript
{
  updated: number;           // Successfully updated count
  errors: Array<{
    id: string;
    error: string;
  }>;
}
```

---

## Request/Response Examples

### Example 1: Complete Upload Flow

```typescript
// Step 1: Initiate Upload
const initiateResult = await trpc.ipAssets.initiateUpload.mutate({
  fileName: 'my-logo.png',
  fileSize: 1024000, // 1MB
  mimeType: 'image/png',
  projectId: 'cm2x1y2z3',
});

// Response:
// {
//   uploadUrl: "https://yesgoddess-assets.r2.cloudflarestorage.com/...",
//   assetId: "cm2xyz123",
//   storageKey: "user123/cm2xyz123/my-logo.png"
// }

// Step 2: Upload file to signed URL
const file = document.getElementById('fileInput').files[0];
const uploadResponse = await fetch(initiateResult.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
  },
});

if (!uploadResponse.ok) {
  throw new Error('Upload failed');
}

// Step 3: Confirm upload
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId: initiateResult.assetId,
  title: 'Company Logo - Primary',
  description: 'Primary brand logo for marketing materials',
  metadata: {
    category: 'branding',
    tags: ['logo', 'primary', 'approved'],
  },
});

// Response:
// {
//   id: "cm2xyz123",
//   title: "Company Logo - Primary",
//   type: "IMAGE",
//   status: "PROCESSING",
//   scanStatus: "PENDING",
//   ...
// }
```

---

### Example 2: Polling for Processing Completion

```typescript
async function waitForProcessing(assetId: string): Promise<IpAssetResponse> {
  const maxAttempts = 30;
  const pollInterval = 2000; // 2 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const asset = await trpc.ipAssets.getById.query({ id: assetId });

    // Check if processing is complete
    if (asset.status !== 'PROCESSING') {
      // Check scan status
      if (asset.scanStatus === 'INFECTED') {
        throw new Error('Asset failed virus scan');
      }

      // Check if thumbnails are generated
      const metadata = asset.metadata as any;
      if (metadata?.thumbnailGenerated) {
        return asset;
      }
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Processing timeout');
}

// Usage:
const processedAsset = await waitForProcessing(assetId);
```

---

### Example 3: Display Asset with Thumbnails

```typescript
async function displayAsset(assetId: string) {
  // Get asset details
  const asset = await trpc.ipAssets.getById.query({ id: assetId });

  // Get all variants
  const variants = await trpc.ipAssets.getVariants.query({
    id: assetId,
    type: 'all',
  });

  return {
    title: asset.title,
    description: asset.description,
    thumbnail: variants.thumbnails.medium?.url,
    thumbnailSmall: variants.thumbnails.small?.url,
    thumbnailLarge: variants.thumbnails.large?.url,
    preview: variants.previews.url, // For video/audio
    waveform: variants.waveform?.url, // For audio
  };
}
```

---

### Example 4: Get Detailed Metadata

```typescript
const metadata = await trpc.ipAssets.getMetadata.query({
  id: assetId,
  fields: ['technical', 'processing'],
});

// Response for video:
// {
//   type: "VIDEO",
//   technical: {
//     width: 1920,
//     height: 1080,
//     duration: 120.5,
//     codec: "h264",
//     bitrate: 5000000,
//     fps: 30,
//     resolution: "1920x1080"
//   },
//   processing: {
//     thumbnailGenerated: true,
//     thumbnailGeneratedAt: "2025-10-12T10:30:00Z",
//     previewGenerated: true,
//     previewGeneratedAt: "2025-10-12T10:31:00Z",
//     metadataExtracted: true,
//     metadataExtractedAt: "2025-10-12T10:30:15Z"
//   }
// }
```

---

### Example 5: Handle Upload Errors

```typescript
try {
  const result = await trpc.ipAssets.initiateUpload.mutate({
    fileName: 'large-video.mp4',
    fileSize: 200 * 1024 * 1024, // 200MB
    mimeType: 'video/mp4',
  });
} catch (error) {
  if (error.data?.code === 'ASSET_FILE_TOO_LARGE') {
    console.error('File exceeds 100MB limit');
    // Show user-friendly message
  } else if (error.data?.code === 'ASSET_INVALID_FILE_TYPE') {
    console.error('File type not supported');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

### Example 6: Filter and Search Assets

```typescript
const { data, meta } = await trpc.ipAssets.list.query({
  filters: {
    type: 'IMAGE',
    status: 'PUBLISHED',
    search: 'logo',
    fromDate: '2025-01-01T00:00:00Z',
  },
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

console.log(`Found ${meta.total} assets`);
console.log(`Showing page ${meta.page} of ${Math.ceil(meta.total / meta.pageSize)}`);
```

---

## TypeScript Type Definitions

Copy these into your frontend codebase:

```typescript
// ============================================================================
// Asset Types
// ============================================================================

export type AssetType = 
  | 'IMAGE' 
  | 'VIDEO' 
  | 'AUDIO' 
  | 'DOCUMENT' 
  | 'MODEL_3D' 
  | 'OTHER';

export type AssetStatus = 
  | 'DRAFT'           // Initial state, not yet confirmed
  | 'PROCESSING'      // Upload confirmed, background jobs running
  | 'REVIEW'          // Ready for manual review
  | 'APPROVED'        // Approved for use
  | 'PUBLISHED'       // Publicly available
  | 'REJECTED'        // Rejected during review
  | 'ARCHIVED';       // No longer active

export type ScanStatus = 
  | 'PENDING'         // Scan not started
  | 'CLEAN'           // No threats detected
  | 'INFECTED'        // Malware detected
  | 'FAILED';         // Scan failed

export type ThumbnailSize = 'small' | 'medium' | 'large' | 'original';

// ============================================================================
// Request Types
// ============================================================================

export interface InitiateUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  projectId?: string;
}

export interface ConfirmUploadRequest {
  assetId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdateAssetRequest {
  id: string;
  title?: string;
  description?: string | null;
  metadata?: Record<string, any>;
}

export interface UpdateStatusRequest {
  id: string;
  status: AssetStatus;
  notes?: string;
}

export interface ListAssetsRequest {
  filters?: {
    projectId?: string;
    type?: AssetType;
    status?: AssetStatus;
    createdBy?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  };
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface GetPreviewRequest {
  id: string;
  size?: ThumbnailSize;
}

export interface GetMetadataRequest {
  id: string;
  fields?: ('technical' | 'descriptive' | 'extracted' | 'processing' | 'all')[];
}

export interface GetVariantsRequest {
  id: string;
  type?: 'thumbnail' | 'preview' | 'all';
}

export interface RegeneratePreviewRequest {
  id: string;
  types?: ('thumbnail' | 'preview' | 'metadata' | 'all')[];
}

// ============================================================================
// Response Types
// ============================================================================

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
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface UploadInitiationResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export interface PreviewUrlResponse {
  url: string;
  size: ThumbnailSize;
  width?: number;
  height?: number;
  expiresAt: string;
}

export interface AssetVariantsResponse {
  thumbnails: {
    small?: PreviewUrlResponse;
    medium?: PreviewUrlResponse;
    large?: PreviewUrlResponse;
  };
  previews: {
    url?: string;
    expiresAt?: string;
    duration?: number;
  };
  waveform?: {
    url?: string;
    expiresAt?: string;
  };
}

export interface AssetMetadataResponse {
  type: AssetType;
  technical?: {
    width?: number;
    height?: number;
    duration?: number;
    bitrate?: number;
    codec?: string;
    fps?: number;
    sampleRate?: number;
    channels?: number;
    format?: string;
    resolution?: string;
    colorSpace?: string;
    pageCount?: number;
  };
  descriptive?: {
    title?: string;
    artist?: string;
    album?: string;
    author?: string;
    creator?: string;
    subject?: string;
    keywords?: string;
    genre?: string;
  };
  extracted?: {
    exif?: Record<string, any>;
    creationDate?: string;
    modificationDate?: string;
  };
  processing?: {
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;
    previewGenerated?: boolean;
    previewGeneratedAt?: string;
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;
  };
}

export interface RegeneratePreviewResponse {
  jobId: string;
  status: 'queued' | 'processing';
  types: string[];
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

export interface BulkUpdateStatusResponse {
  updated: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}
```

---

## Error Handling

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    message: string;        // Human-readable error message
    code: string;           // tRPC error code
    data: {
      code: string;         // Application-specific error code
      httpStatus: number;   // HTTP status code
      details?: any;        // Additional error context
    };
  };
}
```

### Error Codes

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `ASSET_NOT_FOUND` | 404 | Asset doesn't exist or was deleted | Show "Asset not found" message |
| `ASSET_UPLOAD_FAILED` | 500 | Upload to storage failed | Retry upload |
| `ASSET_INVALID_STATUS_TRANSITION` | 400 | Invalid status change | Show current valid transitions |
| `ASSET_HAS_ACTIVE_LICENSES` | 409 | Cannot delete asset with active licenses | Inform user to terminate licenses first |
| `ASSET_VIRUS_DETECTED` | 400 | File failed virus scan | Reject file, do not allow re-upload |
| `ASSET_ACCESS_DENIED` | 403 | User lacks permission | Show "Access denied" message |
| `ASSET_ALREADY_DELETED` | 410 | Asset was already deleted | Remove from UI |
| `ASSET_INVALID_FILE_TYPE` | 400 | MIME type not supported | Show list of allowed types |
| `ASSET_FILE_TOO_LARGE` | 400 | File exceeds 100MB limit | Show size limit message |
| `ASSET_STORAGE_ERROR` | 500 | Storage operation failed | Retry or contact support |
| `ASSET_PROCESSING_FAILED` | 500 | Background job failed | Offer regeneration option |
| `ASSET_INVALID_METADATA` | 400 | Metadata validation failed | Check field requirements |

### Error Handling Examples

```typescript
// Generic error handler
async function handleAssetError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'An unexpected error occurred';
  }

  const appError = (error as any).data;
  
  switch (appError?.code) {
    case 'ASSET_NOT_FOUND':
      return 'This asset could not be found. It may have been deleted.';
      
    case 'ASSET_FILE_TOO_LARGE':
      const maxMB = Math.round(appError.details.maxSize / (1024 * 1024));
      return `File is too large. Maximum size is ${maxMB}MB.`;
      
    case 'ASSET_INVALID_FILE_TYPE':
      return `File type "${appError.details.mimeType}" is not supported. Please use images, videos, audio, or documents.`;
      
    case 'ASSET_ACCESS_DENIED':
      return 'You do not have permission to access this asset.';
      
    case 'ASSET_VIRUS_DETECTED':
      return 'This file failed our security scan and cannot be uploaded.';
      
    case 'ASSET_INVALID_STATUS_TRANSITION':
      return `Cannot change status from ${appError.details.current} to ${appError.details.attempted}.`;
      
    case 'ASSET_HAS_ACTIVE_LICENSES':
      return 'This asset has active licenses and cannot be deleted.';
      
    default:
      return 'An error occurred while processing your request.';
  }
}

// Usage in component
try {
  await trpc.ipAssets.initiateUpload.mutate(params);
} catch (error) {
  const message = await handleAssetError(error);
  toast.error(message);
}
```

### When to Show Specific vs Generic Errors

**Show Specific Errors:**
- File validation errors (size, type)
- Permission errors
- Status transition errors
- Virus scan failures

**Show Generic Errors:**
- Internal server errors (500)
- Storage errors
- Network failures
- Unknown errors

**Log But Don't Show:**
- Processing pipeline errors (automatically retry)
- Rate limit info (handled transparently)

---

## Authorization & Permissions

### Authentication

All endpoints require a valid JWT token in the Authorization header:

```typescript
headers: {
  'Authorization': `Bearer ${jwtToken}`
}
```

### Permission Matrix

| Endpoint | Creator | Brand | Admin | Notes |
|----------|---------|-------|-------|-------|
| `initiateUpload` | ✅ | ✅ | ✅ | All authenticated users |
| `confirmUpload` | ✅ Owner | ✅ Owner | ✅ | Must own the asset |
| `list` | ✅ Own only | ✅ Own only | ✅ All | Admins see all assets |
| `getById` | ✅ Owner | ✅ Owner/Licensee | ✅ | Licensees can view |
| `update` | ✅ Owner | ✅ Owner | ✅ | Must own the asset |
| `updateStatus` | ✅ Owner | ✅ Owner | ✅ | Admins can override |
| `delete` | ✅ Owner | ✅ Owner | ✅ | Cannot delete if licensed |
| `getDownloadUrl` | ✅ Owner | ✅ Owner/Licensee | ✅ | Download tracking applies |
| `getPreview` | ✅ Owner | ✅ Owner/Licensee | ✅ | Previews are public-ish |
| `getMetadata` | ✅ Owner | ✅ Owner/Licensee | ✅ | Some fields may be restricted |
| `getVariants` | ✅ Owner | ✅ Owner/Licensee | ✅ | |
| `regeneratePreview` | ✅ Owner | ✅ Owner | ✅ | Admin can force regenerate |
| `getDerivatives` | ✅ Owner | ✅ Owner | ✅ | |
| `bulkUpdateStatus` | ❌ | ❌ | ✅ | Admin only |

### Resource Ownership Rules

1. **Creators** can only see/edit their own assets
2. **Brands** can see/edit their own assets + assets they've licensed
3. **Admins** can see/edit all assets

### Field-Level Permissions

Some metadata fields may be restricted based on user role:

```typescript
// EXIF data that may contain GPS coordinates
if (userRole !== 'ADMIN' && metadata.exif?.GPS) {
  delete metadata.exif.GPS;  // Strip location data for non-admins
}
```

---

**Continue to [Part 2: Implementation Guide](./ASSET_PROCESSING_IMPLEMENTATION_GUIDE.md)**
