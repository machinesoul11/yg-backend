# Asset Processing - Frontend Integration Guide
## Part 1: API Endpoints & Request/Response Examples

**Classification:** ⚡ HYBRID  
**Module:** Asset Processing  
**Last Updated:** October 13, 2025  
**Version:** 2.0

> **Architecture:** Creators upload assets via public website, admins manage/review assets via admin interface. Both use the same backend API with different permission levels.

---

## Table of Contents

1. [Overview](#overview)
2. [Processing Pipeline](#processing-pipeline)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [TypeScript Type Definitions](#typescript-type-definitions)

---

## Overview

The Asset Processing module handles the complete lifecycle of media assets including:

- ✅ **Virus Scanning** - Malware detection using ClamAV (pluggable provider)
- ✅ **Thumbnail Generation** - Small (200×200), Medium (400×400), Large (800×800)
- ✅ **Preview Generation** - Video clips (10s), Audio clips (30s)
- ✅ **Metadata Extraction** - EXIF, ID3, video codec, dimensions, duration
- ✅ **Format Conversion** - WebP for images, multiple quality levels for video/audio
- ✅ **Quality Validation** - Brand-aligned quality checks (resolution, sharpness, contrast)
- ✅ **Derivative Assets** - Lineage tracking for edited/cropped versions
- ✅ **Watermarking** - Text, logo, and forensic watermarks (on-demand)

### Supported File Types

```typescript
// Images
'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/tiff'

// Videos
'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'

// Audio
'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac'

// Documents
'application/pdf', 'application/msword', 
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// 3D Models
'model/gltf+json', 'model/gltf-binary'
```

### File Size Limits

- **Maximum:** 100MB per file
- **Recommended:** < 50MB for optimal processing speed

---

## Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend: Initiate Upload (get signed URL)                  │
│    → Returns: uploadUrl, assetId, storageKey                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Frontend: Upload file directly to Cloudflare R2             │
│    → PUT request to signed URL                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Frontend: Confirm Upload                                     │
│    → Triggers background processing pipeline                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Background Jobs (automatic, sequential):                     │
│                                                                 │
│    a) Virus Scan (Priority: Critical, ~5-30 seconds)           │
│       - ClamAV malware detection                                │
│       - If infected → quarantine, stop processing               │
│       - If clean → proceed to next step                         │
│                                                                 │
│    b) Thumbnail Generation (Priority: High, ~2-10 seconds)     │
│       - IMAGE: 3 sizes using Sharp                              │
│       - VIDEO: Frame extraction at 10% using FFmpeg             │
│       - AUDIO: Waveform visualization                           │
│       - DOCUMENT: First page preview                            │
│                                                                 │
│    c) Metadata Extraction (Priority: High, ~1-5 seconds)       │
│       - IMAGE: EXIF, dimensions, color space                    │
│       - VIDEO: Duration, codec, resolution, bitrate, FPS        │
│       - AUDIO: ID3 tags, duration, bitrate                      │
│       - DOCUMENT: Page count, author, text content              │
│                                                                 │
│    d) Quality Validation (Priority: High, ~2-8 seconds)        │
│       - Resolution checks (min 2000px for images)               │
│       - Brand guideline compliance (contrast, sharpness)        │
│       - Auto-approve or flag for review                         │
│                                                                 │
│    e) Preview Generation (Priority: Medium, ~10-60 seconds)    │
│       - VIDEO: 10-second clip at 720p                           │
│       - AUDIO: 30-second clip at 128kbps                        │
│       - Optional, can be disabled                               │
│                                                                 │
│    f) Format Conversion (Priority: Low, ~30-120 seconds)       │
│       - IMAGE: Generate WebP, AVIF, responsive sizes            │
│       - VIDEO: Generate 720p, 480p variants (optional)          │
│       - AUDIO: Generate 320k, 192k, 128k bitrates               │
│                                                                 │
│    g) Watermarking (On-demand only)                            │
│       - Text watermarks                                         │
│       - Logo overlays                                           │
│       - Forensic watermarks (invisible)                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Asset Ready (status: DRAFT → REVIEW → APPROVED → PUBLISHED) │
└─────────────────────────────────────────────────────────────────┘
```

**Total Processing Time:**
- **Images:** 10-30 seconds
- **Videos:** 30-120 seconds (depending on length)
- **Audio:** 20-60 seconds
- **Documents:** 10-30 seconds

---

## API Endpoints

All endpoints use **tRPC** over HTTP/HTTPS. Base URL depends on environment:

- **Production:** `https://ops.yesgoddess.agency/api/trpc`
- **Development:** `http://localhost:3000/api/trpc`

### Authentication

All endpoints require JWT authentication via Authorization header:

```http
Authorization: Bearer <jwt_token>
```

---

### 1. Initiate Upload

**Endpoint:** `ipAssets.initiateUpload`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Get a signed upload URL for direct browser-to-storage upload. This avoids sending large files through the backend server.

**Input Schema:**
```typescript
{
  fileName: string;      // Original filename (max 255 chars)
  fileSize: number;      // Size in bytes (max 100MB = 104857600)
  mimeType: string;      // MIME type (must be in allowed list)
  projectId?: string;    // Optional CUID - associate with project
}
```

**Response Schema:**
```typescript
{
  uploadUrl: string;     // Pre-signed URL (expires in 15 minutes)
  assetId: string;       // Pre-generated CUID for asset
  storageKey: string;    // Storage path (for reference)
}
```

**Validation Rules:**
- `fileName`: Required, 1-255 chars, alphanumeric + `-_.` and spaces only
- `fileSize`: Required, positive integer, max 104857600 (100MB)
- `mimeType`: Required, must be in `ALLOWED_MIME_TYPES` list
- `projectId`: Optional, must be valid CUID if provided

**Rate Limits:** None (per-user storage quotas apply)

**Errors:**
- `BAD_REQUEST` (400): Invalid input validation
- `FORBIDDEN` (403): User doesn't have access to project
- `INTERNAL_SERVER_ERROR` (500): Storage provider error

---

### 2. Confirm Upload

**Endpoint:** `ipAssets.confirmUpload`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Confirm that the frontend successfully uploaded the file to storage. This triggers the background processing pipeline.

**Input Schema:**
```typescript
{
  assetId: string;           // CUID from initiateUpload
  title: string;             // Display name (max 255 chars)
  description?: string;      // Optional description (max 2000 chars)
  metadata?: Record<string, any>;  // Optional custom metadata
}
```

**Response Schema:**
```typescript
{
  id: string;                // Asset CUID
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;           // IMAGE | VIDEO | AUDIO | DOCUMENT | THREE_D | OTHER
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  version: number;           // Always 1 for new assets
  parentAssetId: string | null;
  metadata: Record<string, any> | null;
  status: AssetStatus;       // Initially 'DRAFT'
  scanStatus: ScanStatus;    // Initially 'PENDING'
  createdBy: string;
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
  canEdit: boolean;          // Permission flag
  canDelete: boolean;        // Permission flag
}
```

**Validation Rules:**
- `assetId`: Required, valid CUID, must exist with status 'PENDING'
- `title`: Required, 1-255 chars
- `description`: Optional, max 2000 chars
- `metadata`: Optional JSON object

**Processing Triggered:**
1. Asset status: `PENDING` → `PROCESSING`
2. Background jobs enqueued (virus scan → thumbnails → metadata → etc.)

**Errors:**
- `BAD_REQUEST` (400): Invalid input or asset not found
- `CONFLICT` (409): Asset already confirmed
- `INTERNAL_SERVER_ERROR` (500): Job queue error

---

### 3. List Assets

**Endpoint:** `ipAssets.list`  
**Type:** Query  
**Auth:** Required

**Purpose:** Retrieve paginated, filtered list of assets.

**Input Schema:**
```typescript
{
  filters?: {
    projectId?: string;      // Filter by project (CUID)
    type?: AssetType;        // Filter by type
    status?: AssetStatus;    // Filter by status
    createdBy?: string;      // Filter by creator (user CUID)
    search?: string;         // Search in title/description (max 100 chars)
    fromDate?: string;       // ISO 8601 datetime
    toDate?: string;         // ISO 8601 datetime
  };
  page?: number;             // Page number (default: 1)
  pageSize?: number;         // Items per page (default: 20, max: 100)
  sortBy?: 'createdAt' | 'updatedAt' | 'title';  // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc';  // Default: 'desc'
}
```

**Response Schema:**
```typescript
{
  items: IpAssetResponse[];  // Array of assets
  pagination: {
    page: number;            // Current page
    pageSize: number;        // Items per page
    total: number;           // Total items matching filters
    totalPages: number;      // Total pages
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

**Permission Rules:**
- **ADMIN:** Can see all assets
- **CREATOR/BRAND:** Can only see own assets

**Default Behavior:**
- Returns assets sorted by `createdAt` descending
- Excludes soft-deleted assets

---

### 4. Get Asset by ID

**Endpoint:** `ipAssets.getById`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get full details of a single asset.

**Input Schema:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response Schema:**
```typescript
IpAssetResponse  // Same as confirmUpload response
```

**Permission Rules:**
- **ADMIN:** Can access any asset
- **Creator:** Can only access own assets

**Errors:**
- `NOT_FOUND` (404): Asset doesn't exist or is deleted
- `FORBIDDEN` (403): User doesn't have access

---

### 5. Update Asset

**Endpoint:** `ipAssets.update`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Update asset metadata (title, description, custom metadata).

**Input Schema:**
```typescript
{
  id: string;                      // Asset CUID
  title?: string;                  // Optional (1-255 chars)
  description?: string | null;     // Optional (max 2000 chars)
  metadata?: Record<string, any>;  // Optional custom metadata
}
```

**Response Schema:**
```typescript
IpAssetResponse  // Updated asset
```

**Permission Rules:**
- **ADMIN:** Can update any asset
- **Creator:** Can only update own assets

**Business Rules:**
- Cannot update assets with status `PUBLISHED` or `ARCHIVED` (admin override available)
- At least one field must be provided

---

### 6. Update Asset Status

**Endpoint:** `ipAssets.updateStatus`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Change asset status (workflow transitions).

**Input Schema:**
```typescript
{
  id: string;         // Asset CUID
  status: AssetStatus;
  notes?: string;     // Optional transition notes (max 1000 chars)
}
```

**Valid Status Transitions:**
```typescript
DRAFT      → [REVIEW, ARCHIVED]
PROCESSING → [DRAFT, REVIEW]
REVIEW     → [APPROVED, REJECTED, DRAFT]
APPROVED   → [PUBLISHED, ARCHIVED]
PUBLISHED  → [ARCHIVED]
REJECTED   → [DRAFT]
ARCHIVED   → []  // Terminal state
```

**Response Schema:**
```typescript
IpAssetResponse  // Updated asset
```

**Permission Rules:**
- **ADMIN:** Can perform any transition
- **Creator:** Can only move own assets: DRAFT ↔ REVIEW

**Errors:**
- `BAD_REQUEST` (400): Invalid status transition
- `FORBIDDEN` (403): User doesn't have permission

---

### 7. Delete Asset

**Endpoint:** `ipAssets.delete`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Soft delete an asset (sets `deletedAt` timestamp).

**Input Schema:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Permission Rules:**
- **ADMIN:** Can delete any asset
- **Creator:** Can only delete own assets with no active licenses

**Business Rules:**
- Soft delete only (permanent deletion after 30 days via cleanup job)
- Cannot delete assets with active licenses
- Sets `deletedAt` timestamp

**Errors:**
- `CONFLICT` (409): Asset has active licenses
- `FORBIDDEN` (403): User doesn't have permission

---

### 8. Get Download URL

**Endpoint:** `ipAssets.getDownloadUrl`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get a signed URL to download the original asset file.

**Input Schema:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response Schema:**
```typescript
{
  url: string;       // Signed download URL
  expiresAt: string; // ISO 8601 (15 minutes from now)
}
```

**Permission Rules:**
- **ADMIN:** Can download any asset
- **Creator:** Can download own assets
- **Brand:** Can download licensed assets only

**URL Expiry:** 15 minutes

---

### 9. Get Preview URL

**Endpoint:** `ipAssets.getPreview`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get signed URL for thumbnail/preview with specific size.

**Input Schema:**
```typescript
{
  id: string;                                    // Asset CUID
  size?: 'small' | 'medium' | 'large' | 'original';  // Default: 'medium'
}
```

**Response Schema:**
```typescript
{
  url: string;       // Signed preview URL
  size: string;      // Requested size
  width?: number;    // Thumbnail width (if available)
  height?: number;   // Thumbnail height (if available)
  expiresAt: string; // ISO 8601 (15 minutes from now)
}
```

**Size Dimensions:**
- `small`: 200×200
- `medium`: 400×400
- `large`: 800×800
- `original`: Full resolution preview clip (videos/audio only)

**Permission Rules:** Same as download

**Note:** Returns `null` if thumbnails haven't been generated yet

---

### 10. Get Asset Metadata

**Endpoint:** `ipAssets.getMetadata`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get detailed technical metadata extracted from the asset.

**Input Schema:**
```typescript
{
  id: string;                                          // Asset CUID
  fields?: ('technical' | 'descriptive' | 'extracted' | 'processing' | 'all')[];
  // Default: ['all']
}
```

**Response Schema:**
```typescript
{
  type: AssetType;
  technical?: {              // Technical specifications
    // Image/Video
    width?: number;
    height?: number;
    format?: string;
    colorSpace?: string;
    
    // Video specific
    duration?: number;       // seconds
    codec?: string;
    fps?: number;
    bitrate?: number;        // bits per second
    resolution?: string;     // e.g., "1920x1080"
    
    // Audio specific
    sampleRate?: number;     // Hz
    channels?: number;
    
    // Document specific
    pageCount?: number;
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
    thumbnailGeneratedAt?: string;  // ISO 8601
    previewGenerated?: boolean;
    previewGeneratedAt?: string;    // ISO 8601
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;   // ISO 8601
  };
}
```

**Field Filtering:**
- `technical`: Only technical specs
- `descriptive`: Only descriptive metadata
- `extracted`: Only raw extracted data
- `processing`: Only processing status
- `all`: All fields (default)

---

### 11. Get Asset Variants

**Endpoint:** `ipAssets.getVariants`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get all available thumbnails, previews, and variants.

**Input Schema:**
```typescript
{
  id: string;                              // Asset CUID
  type?: 'thumbnail' | 'preview' | 'all';  // Default: 'all'
}
```

**Response Schema:**
```typescript
{
  thumbnails: {
    small?: {
      url: string;
      size: 'small';
      width: number;
      height: number;
      expiresAt: string;  // ISO 8601
    };
    medium?: { /* same structure */ };
    large?: { /* same structure */ };
  };
  previews: {
    url?: string;         // Preview clip URL
    expiresAt?: string;   // ISO 8601
    duration?: number;    // seconds (for video/audio)
  };
  waveform?: {            // Audio assets only
    url?: string;
    expiresAt?: string;
  };
}
```

**Availability:**
- Thumbnails: Generated within 10-30 seconds after upload
- Previews: Generated within 30-120 seconds (video/audio only)
- Waveforms: Generated with metadata extraction (audio only)

---

### 12. Regenerate Preview

**Endpoint:** `ipAssets.regeneratePreview`  
**Type:** Mutation  
**Auth:** Required

**Purpose:** Trigger regeneration of thumbnails, previews, or metadata.

**Input Schema:**
```typescript
{
  id: string;                                       // Asset CUID
  types?: ('thumbnail' | 'preview' | 'metadata' | 'all')[];
  // Default: ['all']
}
```

**Response Schema:**
```typescript
{
  jobId: string;             // Background job identifier
  status: 'queued' | 'processing';
  types: string[];           // List of types queued for regeneration
}
```

**Use Cases:**
- Thumbnail corruption
- Failed initial processing
- Updated watermark settings
- Manual quality adjustments

**Permission Rules:**
- **ADMIN:** Can regenerate any asset
- **Creator:** Can regenerate own assets

**Priority:** Higher than initial generation (priority: 5)

---

### 13. Get Derivatives

**Endpoint:** `ipAssets.getDerivatives`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get list of derivative assets (edited versions, crops, etc.).

**Input Schema:**
```typescript
{
  parentAssetId: string;  // CUID of parent asset
}
```

**Response Schema:**
```typescript
{
  items: IpAssetResponse[];  // Array of derivative assets
}
```

**Business Logic:**
- Derivatives inherit ownership from parent
- Track lineage for licensing
- Used for edited/cropped/watermarked versions

---

### 14. Bulk Update Status (Admin Only)

**Endpoint:** `ipAssets.bulkUpdateStatus`  
**Type:** Mutation  
**Auth:** Required (Admin only)

**Purpose:** Update status for multiple assets at once.

**Input Schema:**
```typescript
{
  assetIds: string[];      // Array of CUIDs (min: 1, max: 100)
  status: AssetStatus;     // Target status
}
```

**Response Schema:**
```typescript
{
  updated: number;         // Count of successfully updated assets
  failed: number;          // Count of failed updates
  errors: Array<{
    assetId: string;
    error: string;
  }>;
}
```

**Permission Rules:** Admin only

**Business Rules:**
- Max 100 assets per request
- Skips invalid status transitions
- Returns partial success

---

### 15. Get Asset Owners

**Endpoint:** `ipAssets.getOwners`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get ownership information for an asset.

**Input Schema:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response Schema:**
```typescript
{
  owners: Array<{
    id: string;            // Ownership record CUID
    creatorId: string;     // Creator user CUID
    creatorName: string;   // Display name
    shareBps: number;      // Share in basis points (10000 = 100%)
    ownershipType: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
    createdAt: string;     // ISO 8601
  }>;
  totalShareBps: number;   // Should equal 10000 (100%)
}
```

---

### 16. Add Asset Owner

**Endpoint:** `ipAssets.addOwner`  
**Type:** Mutation  
**Auth:** Required (Admin only)

**Purpose:** Add co-owner to an asset.

**Input Schema:**
```typescript
{
  id: string;              // Asset CUID
  creatorId: string;       // Creator user CUID
  shareBps: number;        // Share in basis points (1-10000)
  ownershipType?: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
  contractReference?: string;
  legalDocUrl?: string;
  notes?: Record<string, any>;
}
```

**Response Schema:**
```typescript
{
  id: string;              // Ownership record CUID
  assetId: string;
  creatorId: string;
  shareBps: number;
  ownershipType: string;
  createdAt: string;
}
```

**Validation:**
- Total ownership shares must not exceed 10000 basis points (100%)

---

### 17. Get Asset Licenses

**Endpoint:** `ipAssets.getLicenses`  
**Type:** Query  
**Auth:** Required

**Purpose:** Get all licenses associated with an asset.

**Input Schema:**
```typescript
{
  id: string;                                      // Asset CUID
  status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'ALL';  // Default: 'ALL'
}
```

**Response Schema:**
```typescript
{
  licenses: Array<{
    id: string;
    projectId: string;
    brandId: string;
    status: string;
    startDate: string;   // ISO 8601
    endDate: string;     // ISO 8601
    terms: Record<string, any>;
    createdAt: string;
  }>;
}
```

---

## Request/Response Examples

### Example 1: Complete Upload Flow

```typescript
// Step 1: Initiate upload
const uploadData = await trpc.ipAssets.initiateUpload.mutate({
  fileName: 'hero-image.jpg',
  fileSize: 2456789,
  mimeType: 'image/jpeg',
  projectId: 'cm1abc123def456', // Optional
});

// Response:
// {
//   uploadUrl: "https://r2.cloudflarestorage.com/...",
//   assetId: "cm2xyz789ghi012",
//   storageKey: "assets/cm2xyz789ghi012/hero-image.jpg"
// }

// Step 2: Upload file to storage (native fetch)
const file = document.getElementById('fileInput').files[0];
const uploadResponse = await fetch(uploadData.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
  },
});

if (!uploadResponse.ok) {
  throw new Error('Upload to storage failed');
}

// Step 3: Confirm upload
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId: uploadData.assetId,
  title: 'Hero Image for Homepage',
  description: 'High-contrast black and white architectural photo',
});

// Response:
// {
//   id: "cm2xyz789ghi012",
//   projectId: "cm1abc123def456",
//   title: "Hero Image for Homepage",
//   description: "High-contrast black and white architectural photo",
//   type: "IMAGE",
//   fileSize: 2456789,
//   mimeType: "image/jpeg",
//   thumbnailUrl: null,  // Not generated yet
//   previewUrl: null,
//   version: 1,
//   parentAssetId: null,
//   metadata: {},
//   status: "PROCESSING",
//   scanStatus: "PENDING",
//   createdBy: "cm0user123abc",
//   createdAt: "2025-10-13T10:30:00Z",
//   updatedAt: "2025-10-13T10:30:00Z",
//   canEdit: true,
//   canDelete: true
// }
```

---

### Example 2: Poll for Processing Completion

```typescript
// React Query hook to poll until processing is done
function useAssetProcessingStatus(assetId: string) {
  return trpc.ipAssets.getMetadata.useQuery(
    { 
      id: assetId,
      fields: ['processing']
    },
    {
      refetchInterval: (data) => {
        // Poll every 3 seconds until all processing complete
        const isDone = 
          data?.processing?.thumbnailGenerated &&
          data?.processing?.metadataExtracted;
        return isDone ? false : 3000;
      },
      enabled: !!assetId,
    }
  );
}

// Usage in component
const { data: processingStatus } = useAssetProcessingStatus(assetId);

if (!processingStatus?.processing?.thumbnailGenerated) {
  return <Spinner>Generating thumbnails...</Spinner>;
}
```

---

### Example 3: Display Asset with Thumbnail

```typescript
function AssetThumbnail({ assetId }: { assetId: string }) {
  const { data: preview } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (!preview?.url) {
    return <ImagePlaceholder />;
  }

  return (
    <img 
      src={preview.url}
      alt="Asset preview"
      width={400}
      height={400}
      className="object-cover rounded-lg"
    />
  );
}
```

---

### Example 4: List Assets with Filters

```typescript
const { data: assetList } = trpc.ipAssets.list.useQuery({
  filters: {
    projectId: 'cm1abc123def456',
    type: 'IMAGE',
    status: 'APPROVED',
  },
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

// Response:
// {
//   items: [ /* array of 20 IpAssetResponse objects */ ],
//   pagination: {
//     page: 1,
//     pageSize: 20,
//     total: 156,
//     totalPages: 8,
//     hasNext: true,
//     hasPrev: false
//   }
// }
```

---

### Example 5: Update Asset Status

```typescript
// Move asset from REVIEW to APPROVED
const updatedAsset = await trpc.ipAssets.updateStatus.mutate({
  id: assetId,
  status: 'APPROVED',
  notes: 'Quality check passed, approved for publication',
});
```

---

### Example 6: Get Detailed Metadata

```typescript
const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['technical', 'processing'],
});

// Response for video asset:
// {
//   type: "VIDEO",
//   technical: {
//     width: 1920,
//     height: 1080,
//     duration: 125.5,
//     codec: "h264",
//     bitrate: 5000000,
//     fps: 30,
//     resolution: "1920x1080"
//   },
//   processing: {
//     thumbnailGenerated: true,
//     thumbnailGeneratedAt: "2025-10-13T10:30:15Z",
//     previewGenerated: true,
//     previewGeneratedAt: "2025-10-13T10:31:42Z",
//     metadataExtracted: true,
//     metadataExtractedAt: "2025-10-13T10:30:12Z"
//   }
// }
```

---

### Example 7: Regenerate Thumbnails

```typescript
// Regenerate thumbnails (e.g., after corruption or quality issues)
const { data: job } = await trpc.ipAssets.regeneratePreview.mutate({
  id: assetId,
  types: ['thumbnail'],
});

// Response:
// {
//   jobId: "regenerate-cm2xyz789ghi012-1697192400000",
//   status: "queued",
//   types: ["thumbnail"]
// }

// Poll metadata to check when regeneration completes
```

---

## TypeScript Type Definitions

Copy these into your frontend codebase (`@/types/assets.ts`):

```typescript
// ============================================================================
// Enums
// ============================================================================

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

export enum ScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  ERROR = 'ERROR',
}

// ============================================================================
// Core Asset Type
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
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  canEdit: boolean;
  canDelete: boolean;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface InitiateUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  projectId?: string;
}

export interface InitiateUploadResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
}

export interface ConfirmUploadInput {
  assetId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// List & Filter Types
// ============================================================================

export interface ListAssetsInput {
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

export interface AssetListResponse {
  items: IpAssetResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// Update Types
// ============================================================================

export interface UpdateAssetInput {
  id: string;
  title?: string;
  description?: string | null;
  metadata?: Record<string, any>;
}

export interface UpdateStatusInput {
  id: string;
  status: AssetStatus;
  notes?: string;
}

export interface BulkUpdateStatusInput {
  assetIds: string[];
  status: AssetStatus;
}

export interface BulkUpdateStatusResponse {
  updated: number;
  failed: number;
  errors: Array<{
    assetId: string;
    error: string;
  }>;
}

// ============================================================================
// Preview & Variant Types
// ============================================================================

export interface GetPreviewInput {
  id: string;
  size?: 'small' | 'medium' | 'large' | 'original';
}

export interface PreviewUrlResponse {
  url: string;
  size: string;
  width?: number;
  height?: number;
  expiresAt: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

export type MetadataField = 'technical' | 'descriptive' | 'extracted' | 'processing' | 'all';

export interface GetMetadataInput {
  id: string;
  fields?: MetadataField[];
}

export interface AssetMetadataResponse {
  type: AssetType;
  technical?: TechnicalMetadata;
  descriptive?: DescriptiveMetadata;
  extracted?: ExtractedMetadata;
  processing?: ProcessingMetadata;
}

export interface TechnicalMetadata {
  // Image/Video
  width?: number;
  height?: number;
  format?: string;
  colorSpace?: string;
  
  // Video specific
  duration?: number;       // seconds
  codec?: string;
  fps?: number;
  bitrate?: number;        // bits per second
  resolution?: string;     // e.g., "1920x1080"
  
  // Audio specific
  sampleRate?: number;     // Hz
  channels?: number;
  
  // Document specific
  pageCount?: number;
}

export interface DescriptiveMetadata {
  title?: string;
  artist?: string;
  album?: string;
  author?: string;
  creator?: string;
  subject?: string;
  keywords?: string;
  genre?: string;
}

export interface ExtractedMetadata {
  exif?: Record<string, any>;
  creationDate?: string;
  modificationDate?: string;
}

export interface ProcessingMetadata {
  thumbnailGenerated?: boolean;
  thumbnailGeneratedAt?: string;
  previewGenerated?: boolean;
  previewGeneratedAt?: string;
  metadataExtracted?: boolean;
  metadataExtractedAt?: string;
}

// ============================================================================
// Variants Types
// ============================================================================

export type VariantType = 'thumbnail' | 'preview' | 'all';

export interface GetVariantsInput {
  id: string;
  type?: VariantType;
}

export interface ThumbnailVariant {
  url: string;
  size: 'small' | 'medium' | 'large';
  width: number;
  height: number;
  expiresAt: string;
}

export interface AssetVariantsResponse {
  thumbnails: {
    small?: ThumbnailVariant;
    medium?: ThumbnailVariant;
    large?: ThumbnailVariant;
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

// ============================================================================
// Regeneration Types
// ============================================================================

export type RegenerationType = 'thumbnail' | 'preview' | 'metadata' | 'all';

export interface RegeneratePreviewInput {
  id: string;
  types?: RegenerationType[];
}

export interface RegeneratePreviewResponse {
  jobId: string;
  status: 'queued' | 'processing';
  types: string[];
}

// ============================================================================
// Ownership Types
// ============================================================================

export interface AssetOwner {
  id: string;
  creatorId: string;
  creatorName: string;
  shareBps: number;
  ownershipType: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
  createdAt: string;
}

export interface GetOwnersResponse {
  owners: AssetOwner[];
  totalShareBps: number;
}

export interface AddOwnerInput {
  id: string;
  creatorId: string;
  shareBps: number;
  ownershipType?: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
  contractReference?: string;
  legalDocUrl?: string;
  notes?: Record<string, any>;
}

// ============================================================================
// License Types
// ============================================================================

export interface AssetLicense {
  id: string;
  projectId: string;
  brandId: string;
  status: string;
  startDate: string;
  endDate: string;
  terms: Record<string, any>;
  createdAt: string;
}

export interface GetLicensesInput {
  id: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'ALL';
}

export interface GetLicensesResponse {
  licenses: AssetLicense[];
}

// ============================================================================
// Constants
// ============================================================================

export const ASSET_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  SIGNED_URL_EXPIRY: 900, // 15 minutes
  THUMBNAIL_SIZES: {
    small: { width: 200, height: 200 },
    medium: { width: 400, height: 400 },
    large: { width: 800, height: 800 },
  },
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/tiff',
    // Videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // 3D Models
    'model/gltf+json',
    'model/gltf-binary',
  ],
  STATUS_TRANSITIONS: {
    DRAFT: ['REVIEW', 'ARCHIVED'],
    PROCESSING: ['DRAFT', 'REVIEW'],
    REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED'],
    REJECTED: ['DRAFT'],
    ARCHIVED: [],
  },
} as const;
```

---

**Continue to [Part 2: Error Handling & Business Logic](./ASSET_PROCESSING_GUIDE_PART_2_BUSINESS_LOGIC.md)**
