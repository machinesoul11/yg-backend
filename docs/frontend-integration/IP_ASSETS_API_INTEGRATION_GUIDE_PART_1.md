# IP Assets API - Frontend Integration Guide (Part 1: API Reference)

**Classification:** ⚡ HYBRID  
**Module:** IP Assets Management  
**Backend Deployment:** ops.yesgoddess.agency  
**Last Updated:** October 13, 2025

---

## Overview

This guide provides complete API documentation for the IP Assets module. The IP Assets system manages the complete lifecycle of intellectual property content including uploads, metadata, processing, ownership, and licensing.

**Key Features:**
- Direct-to-storage file uploads with presigned URLs
- Automatic virus scanning and content processing
- Asset versioning and derivatives tracking
- Ownership management with basis points (10000 = 100%)
- License tracking and revenue attribution
- Full-text search and advanced filtering

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (yesgoddess-web)                │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ React Query │  │ tRPC Client  │  │  API Types   │     │
│  └─────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS + JWT
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (ops.yesgoddess.agency)                │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ tRPC Router  │→ │   Service    │→ │   Prisma     │     │
│  │ ipAssets.*   │  │    Layer     │  │   (Postgres) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                               │
│         │                  ▼                               │
│         │          ┌──────────────┐                        │
│         │          │  BullMQ Jobs │                        │
│         │          │  • Virus Scan│                        │
│         │          │  • Thumbnails│                        │
│         │          │  • Metadata  │                        │
│         │          └──────────────┘                        │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │   Storage    │ (Cloudflare R2 / Azure Blob)            │
│  │   Provider   │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## API Base URL

All endpoints use **tRPC** with the following structure:

```typescript
// Base URL
https://ops.yesgoddess.agency/api/trpc

// Endpoint format
POST https://ops.yesgoddess.agency/api/trpc/ipAssets.<procedureName>
```

---

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```typescript
headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json',
}
```

**Session Context:**
```typescript
interface SessionContext {
  user: {
    id: string;        // User CUID
    email: string;
    name: string;
    role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'USER';
  };
}
```

---

## API Endpoints

### 1. Initiate Upload

**Endpoint:** `ipAssets.initiateUpload`  
**Method:** Mutation  
**Auth:** Required  
**Purpose:** Generate presigned upload URL and create draft asset record

**Request:**
```typescript
{
  fileName: string;      // Max 255 chars, alphanumeric + .-_
  fileSize: number;      // In bytes, max 100MB (104857600)
  mimeType: string;      // Must be in allowed types
  projectId?: string;    // Optional CUID, if asset belongs to project
}
```

**Response:**
```typescript
{
  uploadUrl: string;     // Presigned URL for direct upload (15min expiry)
  assetId: string;       // CUID of created draft asset
  storageKey: string;    // Internal storage path
}
```

**Allowed MIME Types:**
```typescript
// Images
'image/jpeg', 'image/png', 'image/gif', 'image/webp', 
'image/svg+xml', 'image/tiff'

// Videos
'video/mp4', 'video/quicktime', 'video/x-msvideo', 
'video/x-matroska', 'video/webm'

// Audio
'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac'

// Documents
'application/pdf', 
'application/msword',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.ms-powerpoint',
'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// 3D Models
'model/gltf+json', 'model/gltf-binary', 'model/obj'
```

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.initiateUpload \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "artwork_final.png",
    "fileSize": 2048576,
    "mimeType": "image/png",
    "projectId": "clx123456789"
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Invalid file type or size exceeds limit
- `401 UNAUTHORIZED` - Missing or invalid JWT
- `404 NOT_FOUND` - Project not found (if projectId provided)

---

### 2. Confirm Upload

**Endpoint:** `ipAssets.confirmUpload`  
**Method:** Mutation  
**Auth:** Required  
**Purpose:** Finalize upload after file transfer and trigger background processing

**Request:**
```typescript
{
  assetId: string;              // CUID from initiateUpload
  title: string;                // 1-255 chars
  description?: string;         // Max 2000 chars
  metadata?: Record<string, any>; // Custom key-value pairs
}
```

**Response:**
```typescript
{
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;              // IMAGE | VIDEO | AUDIO | DOCUMENT | THREE_D | OTHER
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;  // Available after processing
  previewUrl: string | null;
  version: number;              // Auto-incremented
  parentAssetId: string | null;
  metadata: Record<string, any> | null;
  status: AssetStatus;          // PROCESSING initially
  scanStatus: ScanStatus;       // PENDING initially
  createdBy: string;            // User CUID
  createdAt: string;            // ISO 8601
  updatedAt: string;
  canEdit: boolean;             // Based on role + ownership
  canDelete: boolean;
}
```

**Background Jobs Triggered:**
1. **Virus Scan** - Scans file for malware
2. **Thumbnail Generation** - Creates image thumbnails (small/medium/large)
3. **Metadata Extraction** - Extracts EXIF, video duration, etc.

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.confirmUpload \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "clx987654321",
    "title": "Sunset Landscape Photography",
    "description": "High-resolution sunset over mountains",
    "metadata": {
      "tags": ["nature", "landscape", "sunset"],
      "location": "Rocky Mountains"
    }
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Invalid assetId or validation failure
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't own the asset

---

### 3. List Assets

**Endpoint:** `ipAssets.list`  
**Method:** Query  
**Auth:** Required  
**Purpose:** Retrieve paginated, filtered list of assets

**Request:**
```typescript
{
  filters?: {
    projectId?: string;           // CUID
    type?: AssetType;             // IMAGE | VIDEO | AUDIO | DOCUMENT | THREE_D | OTHER
    status?: AssetStatus;         // DRAFT | PROCESSING | REVIEW | APPROVED | PUBLISHED | REJECTED | ARCHIVED
    createdBy?: string;           // User CUID
    search?: string;              // Full-text search on title/description (max 100 chars)
    fromDate?: string;            // ISO 8601 date
    toDate?: string;              // ISO 8601 date
  };
  page?: number;                  // Default: 1, min: 1
  pageSize?: number;              // Default: 20, max: 100
  sortBy?: 'createdAt' | 'updatedAt' | 'title';  // Default: createdAt
  sortOrder?: 'asc' | 'desc';     // Default: desc
}
```

**Response:**
```typescript
{
  data: IpAssetResponse[];        // Array of assets (see confirmUpload response)
  meta: {
    total: number;                // Total matching records
    page: number;                 // Current page
    pageSize: number;             // Items per page
    hasMore: boolean;             // True if more pages available
  };
}
```

**Row-Level Security:**
- **ADMIN**: Sees all assets
- **CREATOR/BRAND/USER**: Sees only their own assets

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.list \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"filters":{"type":"IMAGE","status":"APPROVED"},"page":1,"pageSize":20}'
```

**Errors:**
- `400 BAD_REQUEST` - Invalid filter parameters
- `401 UNAUTHORIZED` - Missing or invalid JWT

---

### 4. Get Asset by ID

**Endpoint:** `ipAssets.getById`  
**Method:** Query  
**Auth:** Required  
**Purpose:** Retrieve single asset with full details

**Request:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response:**
```typescript
// Same as confirmUpload response (IpAssetResponse)
{
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
```

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getById \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found or deleted
- `403 FORBIDDEN` - User doesn't have access (creator or admin only)

---

### 5. Update Asset

**Endpoint:** `ipAssets.update`  
**Method:** Mutation  
**Auth:** Required (Creator or Admin)  
**Purpose:** Update asset metadata

**Request:**
```typescript
{
  id: string;                     // Asset CUID
  title?: string;                 // 1-255 chars
  description?: string | null;    // Max 2000 chars (null to clear)
  metadata?: Record<string, any>; // Merges with existing metadata
}
```

**Response:**
```typescript
// Full asset object (IpAssetResponse)
```

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.update \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "clx987654321",
    "title": "Updated Title",
    "metadata": {
      "tags": ["updated", "new-tag"]
    }
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Validation failure
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't own asset (unless admin)

---

### 6. Update Asset Status

**Endpoint:** `ipAssets.updateStatus`  
**Method:** Mutation  
**Auth:** Required (Creator or Admin)  
**Purpose:** Change asset workflow status

**Request:**
```typescript
{
  id: string;           // Asset CUID
  status: AssetStatus;  // Target status
  notes?: string;       // Optional status change reason (max 1000 chars)
}
```

**Asset Status Flow:**
```
DRAFT ──────────────────────┐
  ↓                         ↓
PROCESSING                ARCHIVED
  ↓
REVIEW ─────┐
  ↓         ↓
APPROVED  REJECTED
  ↓         ↓
PUBLISHED  DRAFT (retry)
  ↓
ARCHIVED
```

**Allowed Transitions:**
```typescript
const STATUS_TRANSITIONS = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  PROCESSING: ['DRAFT', 'REVIEW'],
  REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  REJECTED: ['DRAFT'],
  ARCHIVED: [],  // Terminal state
};
```

**Response:**
```typescript
// Full asset object with updated status
```

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.updateStatus \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "clx987654321",
    "status": "APPROVED",
    "notes": "Quality check passed"
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Invalid status transition
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have permission

---

### 7. Delete Asset

**Endpoint:** `ipAssets.delete`  
**Method:** Mutation  
**Auth:** Required (Creator or Admin)  
**Purpose:** Soft delete asset (sets deletedAt timestamp)

**Request:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response:**
```typescript
{
  success: true;
}
```

**Notes:**
- Soft delete only (asset marked as deleted, not physically removed)
- Future: Will fail if asset has active licenses (when licenses module is complete)
- Future: Physical deletion scheduled after 30-day grace period

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.delete \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"id": "clx987654321"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't own asset
- `409 CONFLICT` - Asset has active licenses (future)

---

### 8. Get Download URL

**Endpoint:** `ipAssets.getDownloadUrl`  
**Method:** Query  
**Auth:** Required  
**Purpose:** Generate time-limited presigned download URL

**Request:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response:**
```typescript
{
  url: string;      // Presigned download URL
  expiresAt: string; // ISO 8601 timestamp (15 minutes from now)
}
```

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getDownloadUrl \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 9. Get Preview URL

**Endpoint:** `ipAssets.getPreview`  
**Method:** Query  
**Auth:** Required  
**Purpose:** Get preview/thumbnail URL with size variant selection

**Request:**
```typescript
{
  id: string;                                    // Asset CUID
  size?: 'small' | 'medium' | 'large' | 'original';  // Default: medium
}
```

**Response:**
```typescript
{
  url: string;          // Presigned preview URL
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;       // Pixel width (if available)
  height?: number;      // Pixel height (if available)
  expiresAt: string;    // ISO 8601 timestamp (15 minutes)
}
```

**Size Guidelines:**
- **small**: 150px max dimension (thumbnails)
- **medium**: 500px max dimension (previews)
- **large**: 1200px max dimension (lightbox)
- **original**: Full resolution

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getPreview \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321","size":"medium"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset or preview not found
- `403 FORBIDDEN` - User doesn't have access

---

### 10. Get Asset Metadata

**Endpoint:** `ipAssets.getMetadata`  
**Method:** Query  
**Auth:** Required  
**Purpose:** Retrieve extracted technical and descriptive metadata

**Request:**
```typescript
{
  id: string;  // Asset CUID
  fields?: Array<'technical' | 'descriptive' | 'extracted' | 'processing' | 'all'>;
  // Default: ['all']
}
```

**Response:**
```typescript
{
  type: AssetType;
  technical?: {
    // Images
    width?: number;
    height?: number;
    format?: string;
    colorSpace?: string;
    hasAlpha?: boolean;
    
    // Videos
    duration?: number;      // Seconds
    codec?: string;
    fps?: number;
    bitrate?: number;
    resolution?: string;
    
    // Audio
    duration?: number;
    bitrate?: number;
    sampleRate?: number;
  };
  descriptive?: {
    // Documents
    pageCount?: number;
    author?: string;
    creator?: string;
    
    // Audio
    artist?: string;
    album?: string;
    title?: string;
  };
  extracted?: {
    exif?: Record<string, any>;  // EXIF data for images
    // Additional extracted metadata
  };
  processing?: {
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;  // ISO 8601
    previewGenerated?: boolean;
    previewGeneratedAt?: string;
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;
  };
}
```

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getMetadata \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321","fields":["technical","extracted"]}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 11. Get Asset Variants

**Endpoint:** `ipAssets.getVariants`  
**Method:** Query  
**Auth:** Required  
**Purpose:** List all available thumbnails and preview variants

**Request:**
```typescript
{
  id: string;                           // Asset CUID
  type?: 'thumbnail' | 'preview' | 'all';  // Default: all
}
```

**Response:**
```typescript
{
  thumbnails: {
    small?: {
      url: string;
      size: 'small';
      width?: number;
      height?: number;
      expiresAt: string;
    };
    medium?: { /* same structure */ };
    large?: { /* same structure */ };
  };
  previews: {
    url?: string;
    expiresAt?: string;
    duration?: number;  // For video/audio previews (seconds)
  };
  waveform?: {  // Audio only
    url?: string;
    expiresAt?: string;
  };
}
```

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getVariants \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321","type":"all"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 12. Regenerate Preview

**Endpoint:** `ipAssets.regeneratePreview`  
**Method:** Mutation  
**Auth:** Required  
**Purpose:** Trigger regeneration of thumbnails, previews, or metadata

**Request:**
```typescript
{
  id: string;  // Asset CUID
  types?: Array<'thumbnail' | 'preview' | 'metadata' | 'all'>;  // Default: ['all']
}
```

**Response:**
```typescript
{
  jobId: string;              // BullMQ job ID for tracking
  status: 'queued' | 'processing';
  types: string[];            // Types being regenerated
}
```

**Use Cases:**
- Original processing failed
- New processing features added
- Manual quality improvement

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.regeneratePreview \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "clx987654321",
    "types": ["thumbnail", "preview"]
  }'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't own asset

---

### 13. Get Derivatives

**Endpoint:** `ipAssets.getDerivatives`  
**Method:** Query  
**Auth:** Required  
**Purpose:** List all derivative assets created from a parent asset

**Request:**
```typescript
{
  parentAssetId: string;  // Parent asset CUID
}
```

**Response:**
```typescript
IpAssetResponse[]  // Array of derivative assets
```

**Use Cases:**
- Version history
- Edited/remixed content
- Derivative works tracking

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getDerivatives \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"parentAssetId":"clx987654321"}'
```

**Errors:**
- `404 NOT_FOUND` - Parent asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 14. Get Asset Owners

**Endpoint:** `ipAssets.getOwners`  
**Method:** Query  
**Auth:** Required  
**Purpose:** List current ownership split for an asset

**Request:**
```typescript
{
  id: string;  // Asset CUID
}
```

**Response:**
```typescript
Array<{
  id: string;              // Ownership record CUID
  creatorId: string;       // Creator CUID
  creatorName: string;
  shareBps: number;        // Basis points (10000 = 100%)
  percentage: number;      // Decimal percentage (50.0 = 50%)
  ownershipType: string;   // PRIMARY | SECONDARY | DERIVATIVE
  startDate: string;       // ISO 8601
  endDate: string | null;  // ISO 8601 or null if active
}>
```

**Ownership Basis Points:**
- 1 basis point = 0.01%
- 10000 basis points = 100%
- Total ownership must equal 10000 across all owners

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getOwners \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 15. Add Asset Owner

**Endpoint:** `ipAssets.addOwner`  
**Method:** Mutation  
**Auth:** Required (Creator or Admin)  
**Purpose:** Add an ownership record to an asset

**Request:**
```typescript
{
  id: string;                   // Asset CUID
  creatorId: string;            // Creator CUID to add as owner
  shareBps: number;             // Basis points (1-10000)
  ownershipType?: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';  // Default: SECONDARY
  contractReference?: string;   // Optional contract ID (max 255 chars)
  legalDocUrl?: string;         // Optional legal document URL
  notes?: Record<string, any>;  // Optional metadata
}
```

**Response:**
```typescript
{
  id: string;              // Ownership record CUID
  creatorId: string;
  shareBps: number;
  ownershipType: string;
}
```

**Validation:**
- Total ownership cannot exceed 10000 basis points
- Creator must exist and have CREATOR role
- Cannot add duplicate active ownership

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.addOwner \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "clx987654321",
    "creatorId": "clx456789012",
    "shareBps": 2500,
    "ownershipType": "CONTRIBUTOR",
    "contractReference": "CONTRACT-2025-001"
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Invalid share amount or would exceed 100%
- `404 NOT_FOUND` - Asset or creator not found
- `403 FORBIDDEN` - User doesn't have permission

---

### 16. Get Asset Licenses

**Endpoint:** `ipAssets.getLicenses`  
**Method:** Query  
**Auth:** Required  
**Purpose:** List all licenses for an asset

**Request:**
```typescript
{
  id: string;                                      // Asset CUID
  status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'ALL';  // Default: ALL
}
```

**Response:**
```typescript
Array<{
  id: string;              // License CUID
  brandId: string;         // Brand CUID
  brandName: string;
  status: string;          // ACTIVE | EXPIRED | TERMINATED
  startDate: string;       // ISO 8601
  endDate: string | null;  // ISO 8601 or null for perpetual
  terms: string | null;    // License terms/notes
  revenueCents: number;    // Total revenue in cents
}>
```

**Example (cURL):**
```bash
curl -G https://ops.yesgoddess.agency/api/trpc/ipAssets.getLicenses \
  -H "Authorization: Bearer <token>" \
  --data-urlencode 'input={"id":"clx987654321","status":"ACTIVE"}'
```

**Errors:**
- `404 NOT_FOUND` - Asset not found
- `403 FORBIDDEN` - User doesn't have access

---

### 17. Bulk Update Status (Admin Only)

**Endpoint:** `ipAssets.bulkUpdateStatus`  
**Method:** Mutation  
**Auth:** Required (Admin)  
**Purpose:** Update status for multiple assets at once

**Request:**
```typescript
{
  assetIds: string[];    // Array of asset CUIDs (1-100)
  status: AssetStatus;   // Target status
}
```

**Response:**
```typescript
{
  updated: number;       // Count of successfully updated assets
  errors: Array<{
    id: string;          // Asset CUID
    error: string;       // Error message
  }>;
}
```

**Example (cURL):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/ipAssets.bulkUpdateStatus \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["clx111", "clx222", "clx333"],
    "status": "APPROVED"
  }'
```

**Errors:**
- `400 BAD_REQUEST` - Too many assets (max 100)
- `403 FORBIDDEN` - User is not admin

---

## TypeScript Type Definitions

### Core Types

```typescript
// Enums
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

export enum OwnershipType {
  PRIMARY = 'PRIMARY',
  CONTRIBUTOR = 'CONTRIBUTOR',
  DERIVATIVE = 'DERIVATIVE',
  TRANSFERRED = 'TRANSFERRED',
}

// Response Interfaces
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

export interface AssetListResponse {
  data: IpAssetResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
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
  technical?: Record<string, any>;
  descriptive?: Record<string, any>;
  extracted?: Record<string, any>;
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

export interface AssetOwnershipResponse {
  id: string;
  creatorId: string;
  creatorName: string;
  shareBps: number;
  percentage: number;
  ownershipType: string;
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

// Input Interfaces
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
```

---

## Constants

```typescript
export const ASSET_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  SIGNED_URL_EXPIRY: 900, // 15 minutes
  
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/svg+xml', 'image/tiff',
    // Videos
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'video/x-matroska', 'video/webm',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // 3D
    'model/gltf+json', 'model/gltf-binary', 'model/obj',
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
};
```

---

**Continue to Part 2 for:**
- Request/Response Examples
- Error Handling
- Authorization & Permissions
- Implementation Guide
- React Query Integration
- UX Best Practices

---

**Document Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Maintained By:** Backend Team (ops.yesgoddess.agency)
