# IP Asset Service - Frontend Integration Guide (Part 1: API Reference)

**Classification:** ⚡ HYBRID  
**Module:** IP Assets  
**Last Updated:** October 13, 2025  
**Version:** 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Constants & Configuration](#constants--configuration)

---

## Overview

The IP Asset Service manages the complete lifecycle of intellectual property assets including:
- ✅ Asset upload processing (direct-to-storage with signed URLs)
- ✅ Metadata extraction (EXIF, ID3, video codecs, document properties)
- ✅ Thumbnail and preview generation
- ✅ Asset versioning and derivatives
- ✅ Asset relationship management
- ✅ Status workflow (Draft → Review → Approved → Published)
- ✅ Search and filtering
- ✅ Usage tracking and analytics

### Architecture

```
Frontend → tRPC (ipAssets.*) → IpAssetService → Database/Storage/Jobs
```

**Base URL:** `https://ops.yesgoddess.agency/api/trpc`  
**Protocol:** tRPC over HTTP  
**Authentication:** JWT via session cookie (required for all endpoints)

---

## API Endpoints

All endpoints are available via tRPC under the `ipAssets.*` namespace.

### Upload Flow

#### 1. Initiate Upload
**Endpoint:** `ipAssets.initiateUpload`  
**Type:** Mutation  
**Auth:** Required (JWT)

Generates a signed upload URL and creates a draft asset record.

**Input Schema:**
```typescript
{
  fileName: string;        // 1-255 chars, alphanumeric + -_. space
  fileSize: number;        // Bytes, max 104,857,600 (100MB)
  mimeType: string;        // Must be in ALLOWED_MIME_TYPES
  projectId?: string;      // Optional CUID
}
```

**Response Schema:**
```typescript
{
  uploadUrl: string;       // Signed URL (expires in 15 minutes)
  assetId: string;         // CUID of created draft asset
  storageKey: string;      // Storage bucket key
}
```

**Validation Rules:**
- File name: 1-255 characters, regex: `^[a-zA-Z0-9\-_\. ]+$`
- File size: 1 byte to 100MB (104,857,600 bytes)
- MIME type: Must be in allowed list (see [Constants](#constants--configuration))
- Project ID: Must exist if provided

**Errors:**
- `BAD_REQUEST`: Invalid file name, size exceeds limit, unsupported MIME type
- `NOT_FOUND`: Project not found (if projectId provided)

---

#### 2. Confirm Upload
**Endpoint:** `ipAssets.confirmUpload`  
**Type:** Mutation  
**Auth:** Required (JWT)

Confirms file was uploaded successfully and triggers background processing.

**Input Schema:**
```typescript
{
  assetId: string;         // CUID from initiateUpload
  title: string;           // 1-255 chars
  description?: string;    // Max 2000 chars
  metadata?: Record<string, any>;  // Optional custom metadata
}
```

**Response Schema:**
```typescript
IpAssetResponse  // See Type Definitions
```

**Background Jobs Triggered:**
1. **Virus Scan** (immediate) - Updates `scanStatus` field
2. **Thumbnail Generation** (immediate) - Creates small/medium/large thumbnails
3. **Preview Generation** (for video/audio) - Creates preview clips
4. **Metadata Extraction** (immediate) - Extracts EXIF, ID3, etc.

**Errors:**
- `NOT_FOUND`: Asset not found
- `BAD_REQUEST`: Title too long, description too long
- `FORBIDDEN`: Not the asset creator

---

### Asset Retrieval

#### 3. List Assets
**Endpoint:** `ipAssets.list`  
**Type:** Query  
**Auth:** Required (JWT)

Retrieves paginated, filtered list of assets with full-text search.

**Input Schema:**
```typescript
{
  filters?: {
    projectId?: string;      // Filter by project
    type?: AssetType;        // IMAGE | VIDEO | AUDIO | DOCUMENT
    status?: AssetStatus;    // DRAFT | PROCESSING | REVIEW | APPROVED | REJECTED | PUBLISHED | ARCHIVED
    createdBy?: string;      // Filter by creator user ID
    search?: string;         // Full-text search (title, description) - max 100 chars
    fromDate?: string;       // ISO 8601 date
    toDate?: string;         // ISO 8601 date
  };
  page?: number;             // Default: 1, min: 1
  pageSize?: number;         // Default: 20, max: 100
  sortBy?: 'createdAt' | 'updatedAt' | 'title';  // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc';  // Default: 'desc'
}
```

**Response Schema:**
```typescript
{
  data: IpAssetResponse[];   // Array of assets
  meta: {
    total: number;           // Total matching assets
    page: number;            // Current page
    pageSize: number;        // Items per page
    hasMore: boolean;        // More pages available
  };
}
```

**Row-Level Security:**
- **Non-Admin Users:** See only their own assets (`createdBy = userId`)
- **Admin Users:** See all assets

**Search Behavior:**
- Case-insensitive
- Searches in `title` and `description` fields
- Uses PostgreSQL `ILIKE` (partial match)

---

#### 4. Get Asset by ID
**Endpoint:** `ipAssets.getById`  
**Type:** Query  
**Auth:** Required (JWT)

**Request:**
```typescript
{
  id: string;  // Asset ID (CUID)
}
```

**Response:**
```typescript
IpAssetResponse  // Includes creator info, project details, metadata
```

**Includes:**
- Creator information (id, name, email)
- Project information (id, name) if linked
- Full metadata object
- Computed fields: `canEdit`, `canDelete`

**Access Control:**
- Creator can always access
- Admins can access any asset
- Future: Licensees can access licensed assets

---

### Asset Management

#### 5. Update Asset
**Endpoint:** `ipAssets.update`  
**Type:** Mutation  
**Auth:** Required (JWT)

Updates asset metadata (title, description, custom metadata).

**Input Schema:**
```typescript
{
  id: string;                  // Asset ID
  title?: string;              // 1-255 chars
  description?: string | null; // Max 2000 chars
  metadata?: Record<string, any>;  // Custom metadata
}
```

**Response:**
```typescript
IpAssetResponse
```

**Notes:**
- Only provided fields are updated (partial update)
- `description` can be set to `null` to clear it
- `metadata` is merged with existing metadata

**Access Control:**
- Creator or admin only

---

#### 6. Update Status
**Endpoint:** `ipAssets.updateStatus`  
**Type:** Mutation  
**Auth:** Required (JWT)

Changes asset status with workflow validation.

**Input Schema:**
```typescript
{
  id: string;
  status: AssetStatus;  // Target status
  notes?: string;       // Optional notes (max 1000 chars)
}
```

**Response:**
```typescript
IpAssetResponse
```

**Status Workflow Transitions:**

| Current Status | Allowed Transitions |
|----------------|---------------------|
| DRAFT          | REVIEW, ARCHIVED    |
| PROCESSING     | DRAFT, REVIEW       |
| REVIEW         | APPROVED, REJECTED, DRAFT |
| APPROVED       | PUBLISHED, ARCHIVED |
| REJECTED       | DRAFT, ARCHIVED     |
| PUBLISHED      | ARCHIVED            |
| ARCHIVED       | DRAFT               |

**Notifications:**
- `APPROVED` → Sends notification to creator
- `REJECTED` → Sends notification to creator with notes

**Validation:**
- Invalid transitions throw `ASSET_INVALID_STATUS_TRANSITION` error
- Only creator or admin can update status

---

#### 7. Delete Asset
**Endpoint:** `ipAssets.delete`  
**Type:** Mutation  
**Auth:** Required (JWT)

Soft deletes an asset (sets `deletedAt` timestamp).

**Input Schema:**
```typescript
{
  id: string;  // Asset ID
}
```

**Response:**
```typescript
{
  success: true;
}
```

**Business Rules:**
- Cannot delete assets with active licenses (throws `ASSET_HAS_ACTIVE_LICENSES`)
- Soft delete only (file remains in storage for 30 days)
- Only creator or admin can delete

---

### Asset Variants & Metadata

#### 8. Get Download URL
**Endpoint:** `ipAssets.getDownloadUrl`  
**Type:** Query  
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

#### 9. Get Preview URL
**Endpoint:** `ipAssets.getPreview`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Get signed URL for preview with size variant.

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
  width?: number;            // Preview width in pixels
  height?: number;           // Preview height in pixels
  expiresAt: string;         // ISO 8601
}
```

**Size Specifications:**
- **small:** 200×200 px
- **medium:** 400×400 px (default)
- **large:** 800×800 px
- **original:** Full resolution

**Behavior:**
- Falls back to original if thumbnail not generated
- Returns preview clip URL for video/audio assets

---

#### 10. Get Asset Metadata
**Endpoint:** `ipAssets.getMetadata`  
**Type:** Query  
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
    genre?: string[];
  };
  extracted?: {              // Raw extracted data
    exif?: Record<string, any>;
    creationDate?: string;
    modificationDate?: string;
  };
  processing?: {             // Processing status
    thumbnailGenerated: boolean;
    thumbnailGeneratedAt?: string;
    previewGenerated: boolean;
    previewGeneratedAt?: string;
    metadataExtracted: boolean;
    metadataExtractedAt?: string;
  };
}
```

**Field Filtering:**
- Request only needed fields to reduce payload size
- Example: `fields: ['technical', 'processing']`

---

#### 11. Get Asset Variants
**Endpoint:** `ipAssets.getVariants`  
**Type:** Query  
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
  waveform?: {               // Audio assets only
    url?: string;            // Waveform image
    expiresAt?: string;
  };
}
```

---

#### 12. Regenerate Preview
**Endpoint:** `ipAssets.regeneratePreview`  
**Type:** Mutation  
**Auth:** Required (JWT)

**Purpose:** Trigger preview/thumbnail regeneration for an asset.

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
  jobId: string;             // Background job ID
  status: 'queued' | 'processing';
  types: string[];           // Jobs queued
}
```

**Use Cases:**
- Preview generation failed initially
- Need higher quality thumbnails
- Metadata extraction incomplete
- User manually requests regeneration

---

### Asset Relationships

#### 13. Get Derivatives
**Endpoint:** `ipAssets.getDerivatives`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** List all derivative versions of an asset.

**Request:**
```typescript
{
  parentAssetId: string;
}
```

**Response:**
```typescript
IpAssetResponse[]  // Array of derivative assets, sorted by version
```

**Use Cases:**
- View asset version history
- Track edited/modified versions
- Display derivative works

**Notes:**
- Results sorted by `version` ascending
- Each derivative has `parentAssetId` pointing to parent
- Creator or admin access only

---

#### 14. Bulk Update Status
**Endpoint:** `ipAssets.bulkUpdateStatus`  
**Type:** Mutation  
**Auth:** Required (ADMIN only)

**Purpose:** Update status for multiple assets at once.

**Request:**
```typescript
{
  assetIds: string[];      // 1-100 asset IDs
  status: AssetStatus;
}
```

**Response:**
```typescript
{
  updated: number;         // Count of successfully updated assets
  errors: Array<{
    id: string;
    error: string;
  }>;
}
```

**Notes:**
- Admin-only operation
- Max 100 assets per request
- Partial success possible (some succeed, some fail)

---

### Ownership & Licensing

#### 15. Get Asset Owners
**Endpoint:** `ipAssets.getAssetOwners`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Get current ownership breakdown for an asset.

**Request:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
Array<{
  id: string;                // Ownership record ID
  creatorId: string;
  creatorName: string;
  shareBps: number;          // Basis points (1-10000)
  percentage: number;        // Decimal (0.01-100.00)
  ownershipType: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
  startDate: string;         // ISO 8601
  endDate: string | null;    // ISO 8601 or null if ongoing
}>
```

**Notes:**
- Returns only current/active ownership records
- Sorted by `shareBps` descending (largest owner first)
- Total shares should sum to 10000 basis points (100%)

---

#### 16. Add Asset Owner
**Endpoint:** `ipAssets.addAssetOwner`  
**Type:** Mutation  
**Auth:** Required (JWT)

**Purpose:** Add a co-owner to an asset.

**Request:**
```typescript
{
  id: string;                    // Asset ID
  creatorId: string;             // Creator to add
  shareBps: number;              // 1-10000 (basis points)
  ownershipType?: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';  // Default: SECONDARY
  contractReference?: string;    // Max 255 chars
  legalDocUrl?: string;          // Valid URL
  notes?: Record<string, any>;
}
```

**Response:**
```typescript
{
  id: string;
  creatorId: string;
  shareBps: number;
  ownershipType: string;
}
```

**Validation:**
- Creator must exist
- Total ownership cannot exceed 10000 bps (100%)
- Only asset creator or admin can add owners
- Share must be 1-10000 basis points

---

#### 17. Get Asset Licenses
**Endpoint:** `ipAssets.getAssetLicenses`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** List all licenses for an asset.

**Request:**
```typescript
{
  id: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'ALL';  // Default: 'ALL'
}
```

**Response:**
```typescript
Array<{
  id: string;
  brandId: string;
  brandName: string;
  status: string;
  startDate: string;         // ISO 8601
  endDate: string | null;    // ISO 8601 or null
  terms: string | null;
  revenueCents: number;
}>
```

**Notes:**
- Sorted by `createdAt` descending (newest first)
- Filter by status to get only active licenses
- Creator or admin access only

---

## Request/Response Examples

### Example 1: Complete Upload Flow

```typescript
// Step 1: Initiate upload
const initResponse = await trpc.ipAssets.initiateUpload.mutate({
  fileName: 'brand-logo.png',
  fileSize: 2048576, // 2MB
  mimeType: 'image/png',
  projectId: 'clx1234567890',
});

// Response:
// {
//   uploadUrl: "https://storage.r2.../uploads/abc123?signature=...",
//   assetId: "clx9876543210",
//   storageKey: "uploads/abc123.png"
// }

// Step 2: Upload file directly to storage (browser)
const file = document.getElementById('fileInput').files[0];
await fetch(initResponse.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
  },
});

// Step 3: Confirm upload
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId: initResponse.assetId,
  title: 'Brand Logo - Primary',
  description: 'Main logo for website and marketing materials',
  metadata: {
    purpose: 'branding',
    approvedBy: 'design-team',
  },
});

// Response: Full IpAssetResponse object
// Background jobs now processing...
```

---

### Example 2: Search and Filter Assets

```typescript
const results = await trpc.ipAssets.list.query({
  filters: {
    type: 'IMAGE',
    status: 'APPROVED',
    search: 'logo',
    fromDate: '2025-01-01T00:00:00Z',
  },
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

// Response:
// {
//   data: [
//     { id: '...', title: 'Logo Design', ... },
//     { id: '...', title: 'Logo Variant', ... }
//   ],
//   meta: {
//     total: 45,
//     page: 1,
//     pageSize: 20,
//     hasMore: true
//   }
// }
```

---

### Example 3: Get Asset with All Metadata

```typescript
// Get asset details
const asset = await trpc.ipAssets.getById.query({ 
  id: 'clx9876543210' 
});

// Get detailed metadata
const metadata = await trpc.ipAssets.getMetadata.query({
  id: 'clx9876543210',
  fields: ['technical', 'descriptive', 'processing'],
});

// Get all variants
const variants = await trpc.ipAssets.getVariants.query({
  id: 'clx9876543210',
  type: 'all',
});

// Display in UI:
// - Asset title: asset.title
// - Dimensions: metadata.technical.width × metadata.technical.height
// - Thumbnail: variants.thumbnails.medium.url
// - Processing status: metadata.processing.thumbnailGenerated
```

---

### Example 4: Update Asset Status Workflow

```typescript
// Creator submits for review
await trpc.ipAssets.updateStatus.mutate({
  id: 'clx9876543210',
  status: 'REVIEW',
  notes: 'Ready for approval',
});

// Admin approves
await trpc.ipAssets.updateStatus.mutate({
  id: 'clx9876543210',
  status: 'APPROVED',
  notes: 'Meets quality standards',
});
// → Creator receives notification

// Admin publishes
await trpc.ipAssets.updateStatus.mutate({
  id: 'clx9876543210',
  status: 'PUBLISHED',
});
```

---

### Example 5: Error Handling

```typescript
try {
  await trpc.ipAssets.initiateUpload.mutate({
    fileName: 'video.mp4',
    fileSize: 200_000_000, // 200MB (exceeds 100MB limit)
    mimeType: 'video/mp4',
  });
} catch (error) {
  if (error.code === 'BAD_REQUEST') {
    // Show: "File size exceeds 100MB limit"
    console.error(error.message);
  }
}

try {
  await trpc.ipAssets.updateStatus.mutate({
    id: 'clx9876543210',
    status: 'PUBLISHED',
  });
} catch (error) {
  if (error.code === 'BAD_REQUEST' && 
      error.cause?.code === 'ASSET_INVALID_STATUS_TRANSITION') {
    // Show: "Cannot transition from DRAFT to PUBLISHED"
    // Guide user: "Please submit for review first"
  }
}
```

---

## TypeScript Type Definitions

Copy these into your frontend codebase:

```typescript
// ============================================================================
// ENUMS
// ============================================================================

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

export enum AssetStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  ERROR = 'ERROR',
}

export enum OwnershipType {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  DERIVATIVE = 'DERIVATIVE',
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface IpAssetResponse {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;
  fileSize: number;              // Bytes
  mimeType: string;
  thumbnailUrl: string | null;   // Primary thumbnail (medium size)
  previewUrl: string | null;     // Preview clip URL (video/audio)
  version: number;
  parentAssetId: string | null;  // For derivative assets
  metadata: Record<string, any> | null;  // Extracted metadata
  status: AssetStatus;
  scanStatus: ScanStatus;
  createdBy: string;             // User ID
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  canEdit: boolean;              // Computed permission
  canDelete: boolean;            // Computed permission
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
  expiresAt: string;
}

export interface PreviewUrlResponse {
  url: string;
  size: 'small' | 'medium' | 'large' | 'original';
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
    genre?: string[];
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

export interface UploadInitiationResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
}

export interface AssetOwnerResponse {
  id: string;
  creatorId: string;
  creatorName: string;
  shareBps: number;
  percentage: number;
  ownershipType: OwnershipType;
  startDate: string;
  endDate: string | null;
}

export interface AssetLicenseResponse {
  id: string;
  brandId: string;
  brandName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  terms: string | null;
  revenueCents: number;
}

// ============================================================================
// INPUT TYPES
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

export interface UpdateStatusInput {
  id: string;
  status: AssetStatus;
  notes?: string;
}

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

export interface AddAssetOwnerInput {
  id: string;
  creatorId: string;
  shareBps: number;
  ownershipType?: OwnershipType;
  contractReference?: string;
  legalDocUrl?: string;
  notes?: Record<string, any>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface AssetError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

export const ASSET_ERROR_CODES = {
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_UPLOAD_FAILED: 'ASSET_UPLOAD_FAILED',
  ASSET_INVALID_STATUS_TRANSITION: 'ASSET_INVALID_STATUS_TRANSITION',
  ASSET_HAS_ACTIVE_LICENSES: 'ASSET_HAS_ACTIVE_LICENSES',
  ASSET_VIRUS_DETECTED: 'ASSET_VIRUS_DETECTED',
  ASSET_ACCESS_DENIED: 'ASSET_ACCESS_DENIED',
  ASSET_ALREADY_DELETED: 'ASSET_ALREADY_DELETED',
  ASSET_INVALID_FILE_TYPE: 'ASSET_INVALID_FILE_TYPE',
  ASSET_FILE_TOO_LARGE: 'ASSET_FILE_TOO_LARGE',
  ASSET_STORAGE_ERROR: 'ASSET_STORAGE_ERROR',
  ASSET_PROCESSING_FAILED: 'ASSET_PROCESSING_FAILED',
  ASSET_INVALID_METADATA: 'ASSET_INVALID_METADATA',
} as const;
```

---

## Constants & Configuration

```typescript
export const ASSET_CONSTANTS = {
  // File Upload Limits
  MAX_FILE_SIZE: 104_857_600,      // 100MB in bytes
  SIGNED_URL_EXPIRY: 900,          // 15 minutes in seconds
  
  // Thumbnail Sizes
  THUMBNAIL_SIZES: {
    SMALL: { width: 200, height: 200 },
    MEDIUM: { width: 400, height: 400 },
    LARGE: { width: 800, height: 800 },
  },
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // Allowed MIME Types
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
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // 3D Models
    'model/gltf+json',
    'model/gltf-binary',
    'model/obj',
  ],
  
  // Status Workflow
  STATUS_TRANSITIONS: {
    DRAFT: ['REVIEW', 'ARCHIVED'],
    PROCESSING: ['DRAFT', 'REVIEW'],
    REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['PUBLISHED', 'ARCHIVED'],
    REJECTED: ['DRAFT', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED'],
    ARCHIVED: ['DRAFT'],
  } as const,
} as const;

// Helper function to get file extension from MIME type
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    // Add more as needed
  };
  return mimeMap[mimeType] || '';
}

// Helper function to check if transition is valid
export function isValidStatusTransition(
  current: AssetStatus,
  target: AssetStatus
): boolean {
  return ASSET_CONSTANTS.STATUS_TRANSITIONS[current]?.includes(target) ?? false;
}

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
```

---

**Continue to Part 2** for:
- Business Logic & Validation Rules
- Error Handling & User Messages
- Authorization & Permissions
- Frontend Implementation Guide
- React Query Integration Examples
- Edge Cases & Best Practices

