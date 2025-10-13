# File Viewer & Metadata Extraction - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Date:** October 12, 2025  
**Backend:** ops.yesgoddess.agency  
**Frontend:** yesgoddess-web (Next.js 15)  
**Status:** ✅ Production Ready

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
9. [Real-time Updates](#real-time-updates)
10. [Pagination & Filtering](#pagination--filtering)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The File Viewer & Metadata Extraction system provides comprehensive preview generation and metadata extraction for all asset types uploaded to YES GODDESS. This allows users to view thumbnails, previews, and detailed metadata without downloading the full original file.

### Purpose

- **Metadata Extraction:** Automatically extract technical and descriptive metadata from uploaded assets
- **File Previews:** Generate thumbnails and preview clips for all asset types
- **Variant Access:** Provide multiple size variants optimized for different display contexts
- **Regeneration:** Allow on-demand regeneration of previews and metadata

### Architecture Overview

```
Frontend Upload → Storage → Background Processing Pipeline
                                ↓
                    ┌───────────────────────┐
                    │  Metadata Extraction  │
                    │  - EXIF (images)      │
                    │  - FFmpeg (video/audio)│
                    │  - PDF Parse (docs)   │
                    └───────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │ Thumbnail Generation  │
                    │  - 3 sizes (S/M/L)    │
                    │  - Sharp/FFmpeg       │
                    └───────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │   Preview Generation  │
                    │  - Video clips        │
                    │  - Audio waveforms    │
                    └───────────────────────┘
                                ↓
                    Metadata stored in JSONB
                    Files in Cloudflare R2
```

### Supported Asset Types

| Asset Type | Metadata | Thumbnails | Preview | Special Features |
|------------|----------|------------|---------|------------------|
| **IMAGE** | ✅ EXIF, dimensions, color space | ✅ 3 sizes | N/A | Color space analysis |
| **VIDEO** | ✅ Duration, codec, resolution, FPS | ✅ 3 sizes | ✅ 10s clip | Frame at 10% position |
| **AUDIO** | ✅ ID3 tags, duration, bitrate | N/A | ✅ 30s clip | Waveform PNG (1800×280) |
| **DOCUMENT** | ✅ Page count, author, text | ✅ SVG placeholder | N/A | Text extraction for search |

### Processing Timeline

- **Metadata Extraction:** 50ms - 2s (runs immediately after upload)
- **Thumbnail Generation:** 5-15 seconds (background job)
- **Preview Generation:** 30-60 seconds (background job, VIDEO/AUDIO only)
- **Signed URL Expiry:** 15 minutes

---

## API Endpoints

All endpoints use **tRPC** and require **JWT authentication**. Base URL: `https://ops.yesgoddess.agency/api/trpc`

### 1. Get Preview URL

**Endpoint:** `ipAssets.getPreview`  
**Type:** Query  
**Authentication:** Required (JWT)

Retrieves a signed URL for a preview with specified size variant.

**Input Schema:**
```typescript
{
  id: string;        // Asset ID (CUID format)
  size?: 'small' | 'medium' | 'large' | 'original';  // Default: 'medium'
}
```

**Response Schema:**
```typescript
{
  url: string;           // Signed URL (expires in 15 minutes)
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;        // Preview width in pixels
  height?: number;       // Preview height in pixels
  expiresAt: string;     // ISO 8601 timestamp
}
```

**Size Specifications:**
- **small:** 200×200 px
- **medium:** 400×400 px
- **large:** 800×800 px
- **original:** Full resolution (returns original file URL)

**Behavior:**
- Falls back to original file if preview not yet generated
- Returns closest available size if exact size not available
- Thumbnails are generated for IMAGE, VIDEO, and DOCUMENT types
- AUDIO assets do not have thumbnails

**Authorization:**
- Creator can access own assets
- Admin can access all assets
- Licensees can access licensed assets (when licenses module is implemented)

---

### 2. Get Asset Metadata

**Endpoint:** `ipAssets.getMetadata`  
**Type:** Query  
**Authentication:** Required (JWT)

Retrieves comprehensive metadata for an asset with optional field filtering.

**Input Schema:**
```typescript
{
  id: string;        // Asset ID (CUID format)
  fields?: Array<'technical' | 'descriptive' | 'extracted' | 'processing' | 'all'>;
  // Default: ['all']
}
```

**Response Schema:**
```typescript
{
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  technical?: {
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
  descriptive?: {
    title?: string;
    artist?: string;         // Audio
    album?: string;          // Audio
    author?: string;         // Document
    creator?: string;        // Document
    subject?: string;
    keywords?: string;
    genre?: string;
  };
  extracted?: {
    exif?: Record<string, any>;
    creationDate?: string;   // ISO 8601
    modificationDate?: string;
  };
  processing?: {
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;    // ISO 8601
    previewGenerated?: boolean;
    previewGeneratedAt?: string;
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;
  };
}
```

**Field Filtering:**
Use the `fields` parameter to request only specific metadata categories, reducing payload size:

```typescript
// Get only technical metadata
{ fields: ['technical'] }

// Get technical and processing status
{ fields: ['technical', 'processing'] }

// Get everything (default)
{ fields: ['all'] }
```

**Authorization:**
- Creator can access own assets
- Admin can access all assets

---

### 3. Get Asset Variants

**Endpoint:** `ipAssets.getVariants`  
**Type:** Query  
**Authentication:** Required (JWT)

Lists all available size variants and processed versions of an asset.

**Input Schema:**
```typescript
{
  id: string;        // Asset ID (CUID format)
  type?: 'thumbnail' | 'preview' | 'all';  // Default: 'all'
}
```

**Response Schema:**
```typescript
{
  thumbnails: {
    small?: {
      url: string;           // Signed URL
      size: 'small';
      width: number;         // 200
      height: number;        // 200
      expiresAt: string;     // ISO 8601
    };
    medium?: {
      url: string;
      size: 'medium';
      width: number;         // 400
      height: number;        // 400
      expiresAt: string;
    };
    large?: {
      url: string;
      size: 'large';
      width: number;         // 800
      height: number;        // 800
      expiresAt: string;
    };
  };
  previews: {
    url?: string;            // Signed URL for preview clip/image
    expiresAt?: string;      // ISO 8601
    duration?: number;       // For video/audio (seconds)
  };
  waveform?: {               // Audio only
    url?: string;            // Signed URL for waveform PNG
    expiresAt?: string;      // ISO 8601
  };
}
```

**Behavior:**
- Returns only available variants (not all sizes may exist)
- All URLs are signed with 15-minute expiration
- `waveform` only present for AUDIO assets
- `previews.url` only present for VIDEO/AUDIO assets

**Authorization:**
- Creator can access own assets
- Admin can access all assets

---

### 4. Regenerate Preview

**Endpoint:** `ipAssets.regeneratePreview`  
**Type:** Mutation  
**Authentication:** Required (JWT)

Triggers background jobs to regenerate thumbnails, previews, or metadata.

**Input Schema:**
```typescript
{
  id: string;        // Asset ID (CUID format)
  types?: Array<'thumbnail' | 'preview' | 'metadata' | 'all'>;  // Default: ['all']
}
```

**Response Schema:**
```typescript
{
  jobId: string;           // Background job identifier
  status: 'queued' | 'processing';
  types: string[];         // List of regeneration types queued
}
```

**Regeneration Types:**
- **thumbnail:** Regenerate all thumbnail sizes (S/M/L)
- **preview:** Regenerate preview clip (VIDEO/AUDIO only)
- **metadata:** Re-extract metadata from original file
- **all:** Regenerate everything

**Processing Priority:**
- Regeneration jobs run with higher priority than initial processing
- Typical completion time: 5-60 seconds depending on type
- Jobs have 3 retry attempts on failure

**Authorization:**
- Creator can regenerate own assets
- Admin can regenerate all assets

**Notes:**
- Jobs run asynchronously with high priority
- Thumbnails typically complete in 5-15 seconds
- Video previews may take 30-60 seconds
- Poll `getMetadata` with `fields: ['processing']` to check completion

---

## Request/Response Examples

### Example 1: Get Medium-Sized Preview

**React Query:**
```typescript
function AssetPreview({ assetId }: { assetId: string }) {
  const { data, isLoading, error } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <img 
      src={data.url} 
      alt="Asset preview"
      width={data.width}
      height={data.height}
    />
  );
}
```

**cURL:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/ipAssets.getPreview' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "json": {
      "id": "cm1abc123xyz",
      "size": "medium"
    }
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/thumbnail_medium.jpg?X-Amz-Algorithm=...",
        "size": "medium",
        "width": 400,
        "height": 400,
        "expiresAt": "2025-10-12T15:30:00.000Z"
      }
    }
  }
}
```

---

### Example 2: Get Video Metadata

**React Query:**
```typescript
function VideoMetadata({ assetId }: { assetId: string }) {
  const { data } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'processing'],
  });

  if (!data) return null;

  return (
    <div>
      <h3>Video Details</h3>
      {data.technical && (
        <>
          <p>Duration: {formatDuration(data.technical.duration)}</p>
          <p>Resolution: {data.technical.resolution}</p>
          <p>Codec: {data.technical.codec}</p>
          <p>FPS: {data.technical.fps}</p>
          <p>Bitrate: {formatBitrate(data.technical.bitrate)}</p>
        </>
      )}
      {data.processing && (
        <p>
          Thumbnail: {data.processing.thumbnailGenerated ? '✅' : '⏳'}
          {data.processing.thumbnailGeneratedAt && 
            ` (${formatDate(data.processing.thumbnailGeneratedAt)})`
          }
        </p>
      )}
    </div>
  );
}
```

**cURL:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/ipAssets.getMetadata' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "json": {
      "id": "cm1video789xyz",
      "fields": ["technical", "processing"]
    }
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "type": "VIDEO",
        "technical": {
          "width": 1920,
          "height": 1080,
          "duration": 125.5,
          "codec": "h264",
          "fps": 30,
          "bitrate": 5000000,
          "resolution": "1920x1080",
          "format": "mp4"
        },
        "processing": {
          "thumbnailGenerated": true,
          "thumbnailGeneratedAt": "2025-10-12T14:15:30.000Z",
          "previewGenerated": true,
          "previewGeneratedAt": "2025-10-12T14:16:45.000Z",
          "metadataExtracted": true,
          "metadataExtractedAt": "2025-10-12T14:15:25.000Z"
        }
      }
    }
  }
}
```

---

### Example 3: Get All Variants

**React Query:**
```typescript
function AssetGallery({ assetId }: { assetId: string }) {
  const { data } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });

  if (!data) return null;

  return (
    <div>
      {/* Responsive image with srcset */}
      <picture>
        {data.thumbnails.small && (
          <source 
            media="(max-width: 400px)" 
            srcSet={data.thumbnails.small.url}
          />
        )}
        {data.thumbnails.medium && (
          <source 
            media="(max-width: 800px)" 
            srcSet={data.thumbnails.medium.url}
          />
        )}
        {data.thumbnails.large && (
          <img src={data.thumbnails.large.url} alt="Asset" />
        )}
      </picture>

      {/* Preview clip for video */}
      {data.previews.url && (
        <video src={data.previews.url} controls />
      )}

      {/* Waveform for audio */}
      {data.waveform?.url && (
        <img src={data.waveform.url} alt="Audio waveform" />
      )}
    </div>
  );
}
```

**cURL:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/ipAssets.getVariants' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "json": {
      "id": "cm1abc123xyz",
      "type": "all"
    }
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "thumbnails": {
          "small": {
            "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/thumbnail_small.jpg?...",
            "size": "small",
            "width": 200,
            "height": 200,
            "expiresAt": "2025-10-12T15:30:00.000Z"
          },
          "medium": {
            "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/thumbnail_medium.jpg?...",
            "size": "medium",
            "width": 400,
            "height": 400,
            "expiresAt": "2025-10-12T15:30:00.000Z"
          },
          "large": {
            "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/thumbnail_large.jpg?...",
            "size": "large",
            "width": 800,
            "height": 800,
            "expiresAt": "2025-10-12T15:30:00.000Z"
          }
        },
        "previews": {
          "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/preview.mp4?...",
          "expiresAt": "2025-10-12T15:30:00.000Z",
          "duration": 10
        }
      }
    }
  }
}
```

---

### Example 4: Regenerate Preview

**React Query:**
```typescript
function RegenerateButton({ assetId }: { assetId: string }) {
  const utils = trpc.useContext();
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: () => {
      // Invalidate queries to refetch updated data
      utils.ipAssets.getMetadata.invalidate({ id: assetId });
      utils.ipAssets.getVariants.invalidate({ id: assetId });
    },
  });

  const handleRegenerate = () => {
    regenerate.mutate({
      id: assetId,
      types: ['thumbnail', 'preview'],
    });
  };

  return (
    <button 
      onClick={handleRegenerate}
      disabled={regenerate.isLoading}
    >
      {regenerate.isLoading ? 'Regenerating...' : 'Regenerate Preview'}
    </button>
  );
}
```

**cURL:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/ipAssets.regeneratePreview' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "json": {
      "id": "cm1abc123xyz",
      "types": ["thumbnail", "preview"]
    }
  }'
```

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "jobId": "regenerate-cm1abc123xyz-1728745200000",
        "status": "queued",
        "types": ["thumbnail", "preview"]
      }
    }
  }
}
```

---

### Example 5: Audio Waveform Display

**React Query:**
```typescript
function AudioPlayer({ assetId }: { assetId: string }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });
  
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'descriptive'],
  });

  if (!variants) return null;

  return (
    <div className="audio-player">
      {/* Waveform visualization */}
      {variants.waveform?.url && (
        <img 
          src={variants.waveform.url} 
          alt="Audio waveform"
          className="waveform"
        />
      )}

      {/* Audio player */}
      {variants.previews.url && (
        <audio controls src={variants.previews.url}>
          Your browser does not support audio playback.
        </audio>
      )}

      {/* Metadata display */}
      {metadata?.descriptive && (
        <div className="metadata">
          <p><strong>{metadata.descriptive.title}</strong></p>
          <p>{metadata.descriptive.artist}</p>
          <p>{metadata.descriptive.album}</p>
        </div>
      )}

      {metadata?.technical && (
        <div className="technical">
          <span>Duration: {formatDuration(metadata.technical.duration)}</span>
          <span>Bitrate: {formatBitrate(metadata.technical.bitrate)}</span>
        </div>
      )}
    </div>
  );
}
```

---

### Example 6: Image EXIF Display

**React Query:**
```typescript
function ImageExif({ assetId }: { assetId: string }) {
  const { data } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'extracted'],
  });

  if (!data?.extracted?.exif) return null;

  const exif = data.extracted.exif;

  return (
    <div className="exif-data">
      <h4>Camera Info</h4>
      {exif.Make && <p>Camera: {exif.Make} {exif.Model}</p>}
      {exif.LensModel && <p>Lens: {exif.LensModel}</p>}
      
      <h4>Settings</h4>
      {exif.ExposureTime && <p>Shutter: {exif.ExposureTime}s</p>}
      {exif.FNumber && <p>Aperture: f/{exif.FNumber}</p>}
      {exif.ISO && <p>ISO: {exif.ISO}</p>}
      {exif.FocalLength && <p>Focal Length: {exif.FocalLength}mm</p>}
      
      {data.extracted.creationDate && (
        <p>Captured: {formatDate(data.extracted.creationDate)}</p>
      )}
    </div>
  );
}
```

---

### Error Response Examples

**Asset Not Found (404):**
```json
{
  "error": {
    "message": "Asset not found",
    "code": "NOT_FOUND",
    "data": {
      "code": "ASSET_NOT_FOUND",
      "httpStatus": 404,
      "path": "ipAssets.getPreview"
    }
  }
}
```

**Unauthorized Access (403):**
```json
{
  "error": {
    "message": "You do not have permission to access this asset",
    "code": "FORBIDDEN",
    "data": {
      "code": "ASSET_ACCESS_DENIED",
      "httpStatus": 403,
      "path": "ipAssets.getMetadata"
    }
  }
}
```

**Invalid Input (400):**
```json
{
  "error": {
    "message": "Invalid input: id is required",
    "code": "BAD_REQUEST",
    "data": {
      "zodError": {
        "issues": [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["id"],
            "message": "Required"
          }
        ]
      }
    }
  }
}
```

**Processing Not Complete:**
```json
{
  "result": {
    "data": {
      "json": {
        "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/original.jpg?...",
        "size": "medium",
        "expiresAt": "2025-10-12T15:30:00.000Z"
      }
    }
  }
}
```
*Note: When thumbnails are not yet generated, the API returns the original file URL as a fallback.*

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase (`@/types/assets.ts`):

```typescript
// ============================================================================
// API Input Types
// ============================================================================

export interface GetPreviewInput {
  id: string;
  size?: 'small' | 'medium' | 'large' | 'original';
}

export interface GetMetadataInput {
  id: string;
  fields?: Array<'technical' | 'descriptive' | 'extracted' | 'processing' | 'all'>;
}

export interface GetVariantsInput {
  id: string;
  type?: 'thumbnail' | 'preview' | 'all';
}

export interface RegeneratePreviewInput {
  id: string;
  types?: Array<'thumbnail' | 'preview' | 'metadata' | 'all'>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PreviewUrlResponse {
  url: string;
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;
  height?: number;
  expiresAt: string; // ISO 8601
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
  resolution?: string;
  
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

export interface RegeneratePreviewResponse {
  jobId: string;
  status: 'queued' | 'processing';
  types: string[];
}

// ============================================================================
// Enums
// ============================================================================

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

export enum PreviewSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ORIGINAL = 'original',
}

// ============================================================================
// Utility Types
// ============================================================================

export type MetadataField = 'technical' | 'descriptive' | 'extracted' | 'processing' | 'all';
export type VariantType = 'thumbnail' | 'preview' | 'all';
export type RegenerationType = 'thumbnail' | 'preview' | 'metadata' | 'all';
```

---

## Business Logic & Validation Rules

### Field Validation

#### Asset ID
- **Format:** CUID (26 characters, alphanumeric)
- **Pattern:** `^c[a-z0-9]{24}$`
- **Example:** `cm1abc123xyz456789012345`
- **Validation:** Automatically handled by Zod schema

#### Preview Size
- **Allowed Values:** `'small'`, `'medium'`, `'large'`, `'original'`
- **Default:** `'medium'`
- **Behavior:** Falls back to closest available size if exact size not found

#### Metadata Fields
- **Allowed Values:** `'technical'`, `'descriptive'`, `'extracted'`, `'processing'`, `'all'`
- **Default:** `['all']`
- **Behavior:** Array of fields to include in response
- **Optimization:** Request only needed fields to reduce payload size

#### Regeneration Types
- **Allowed Values:** `'thumbnail'`, `'preview'`, `'metadata'`, `'all'`
- **Default:** `['all']`
- **Constraints:**
  - Preview regeneration only applicable for VIDEO and AUDIO assets
  - Multiple types can be specified in array

### Business Rules

#### 1. Signed URL Expiration
- **Duration:** 15 minutes from generation
- **Behavior:** URLs become invalid after expiry
- **Frontend Action:** Request new URL if expired
- **Cache Strategy:** Can cache URLs for up to 14 minutes

#### 2. Thumbnail Availability
- **IMAGE:** Always available after processing
- **VIDEO:** Available after frame extraction (5-15s)
- **AUDIO:** Not available (no visual representation)
- **DOCUMENT:** SVG placeholder available immediately

#### 3. Preview Clip Availability
- **IMAGE:** Not applicable
- **VIDEO:** 10-second clip, generated after upload (30-60s)
- **AUDIO:** 30-second clip, generated after upload (20-40s)
- **DOCUMENT:** Not applicable

#### 4. Metadata Extraction Timing
- **Immediate:** During upload confirmation
- **Fast:** 50ms - 2s for most files
- **Slow:** Up to 5s for very large files or complex metadata

#### 5. Fallback Behavior
When previews are not yet generated:
- `getPreview` returns original file URL
- `getVariants` returns empty objects for missing variants
- `processing.thumbnailGenerated` is `false`

#### 6. Asset Type Specific Rules

**IMAGE:**
- Thumbnails: Always available after processing
- Metadata: EXIF data, dimensions, color space
- No preview clips

**VIDEO:**
- Thumbnails: Extracted from 10% position (avoids black frames)
- Preview: 10-second clip starting at 10% position
- Metadata: Duration, codec, resolution, FPS, bitrate

**AUDIO:**
- No thumbnails
- Waveform: PNG visualization (1800×280)
- Preview: 30-second clip from 20% position
- Metadata: ID3 tags, duration, bitrate, sample rate

**DOCUMENT:**
- Thumbnails: SVG placeholder with metadata
- No preview clips
- Metadata: Page count, author, creation date
- Text extraction available for search

### State Machine

```
Upload Confirmed
      ↓
[QUEUED] → Metadata Extraction Job
      ↓
[EXTRACTING] → Extract EXIF/FFprobe/PDF data
      ↓
[METADATA_COMPLETE] ← metadata.processedAt set
      ↓
[QUEUED] → Thumbnail Generation Job
      ↓
[GENERATING_THUMBNAILS] → Create 3 sizes
      ↓
[THUMBNAILS_COMPLETE] ← metadata.thumbnailGenerated = true
      ↓
[QUEUED] → Preview Generation Job (VIDEO/AUDIO only)
      ↓
[GENERATING_PREVIEW] → Create clip/waveform
      ↓
[COMPLETE] ← metadata.previewGenerated = true
```

### Derived Values

#### Format Duration Display
```typescript
function formatDuration(seconds?: number): string {
  if (!seconds) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

#### Format Bitrate Display
```typescript
function formatBitrate(bps?: number): string {
  if (!bps) return 'Unknown';
  const kbps = bps / 1000;
  const mbps = kbps / 1000;
  return mbps >= 1 
    ? `${mbps.toFixed(1)} Mbps` 
    : `${kbps.toFixed(0)} Kbps`;
}
```

#### Calculate Aspect Ratio
```typescript
function getAspectRatio(width?: number, height?: number): string {
  if (!width || !height) return 'Unknown';
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description | User-Friendly Message | Retry? |
|------|-------------|-------------|----------------------|--------|
| `ASSET_NOT_FOUND` | 404 | Asset ID doesn't exist or was deleted | "This asset could not be found" | No |
| `ASSET_ACCESS_DENIED` | 403 | User lacks permission to view asset | "You don't have permission to view this asset" | No |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token | "Please log in to continue" | No |
| `BAD_REQUEST` | 400 | Invalid input (Zod validation failed) | "Invalid request. Please check your input" | No |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | "Something went wrong. Please try again later" | Yes |
| `STORAGE_ERROR` | 500 | Failed to generate signed URL | "Failed to access file. Please try again" | Yes |

### Error Response Structure

All errors follow the tRPC error format:

```typescript
{
  error: {
    message: string;           // Human-readable error message
    code: string;              // tRPC error code
    data: {
      code?: string;           // Custom error code
      httpStatus?: number;     // HTTP status code
      path?: string;           // tRPC procedure path
      zodError?: {             // Zod validation errors (if applicable)
        issues: Array<{
          code: string;
          path: string[];
          message: string;
        }>;
      };
    };
  };
}
```

### Frontend Error Handling Pattern

```typescript
function useAssetPreview(assetId: string) {
  const { data, error, isLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  // Error categorization
  if (error) {
    const errorCode = error.data?.code;
    
    if (errorCode === 'ASSET_NOT_FOUND') {
      return { error: 'Asset not found', shouldRetry: false };
    }
    
    if (errorCode === 'ASSET_ACCESS_DENIED') {
      return { error: 'Access denied', shouldRetry: false };
    }
    
    if (error.data?.httpStatus === 500) {
      return { error: 'Server error', shouldRetry: true };
    }
    
    return { error: 'Unknown error', shouldRetry: true };
  }

  return { data, isLoading };
}
```

### When to Show Errors

| Scenario | Show Error | Fallback Behavior |
|----------|------------|-------------------|
| Asset not found | ✅ Display error message | Redirect to asset list |
| Access denied | ✅ Display error message | Show upgrade prompt |
| Processing incomplete | ❌ Don't show error | Show loading state + original |
| Network timeout | ✅ Display retry button | Cache last successful response |
| Invalid input | ✅ Display validation errors | Highlight invalid fields |

### Retry Logic

```typescript
function useAssetPreviewWithRetry(assetId: string) {
  return trpc.ipAssets.getPreview.useQuery(
    { id: assetId, size: 'medium' },
    {
      retry: (failureCount, error) => {
        // Don't retry on client errors
        if (error.data?.httpStatus && error.data.httpStatus < 500) {
          return false;
        }
        // Retry up to 3 times on server errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Role | Get Preview | Get Metadata | Get Variants | Regenerate | Notes |
|------|------------|--------------|--------------|------------|-------|
| **Creator** | ✅ Own assets | ✅ Own assets | ✅ Own assets | ✅ Own assets | Can only access assets they uploaded |
| **Admin** | ✅ All assets | ✅ All assets | ✅ All assets | ✅ All assets | Full access to all assets |
| **Brand** | ✅ Licensed assets | ✅ Licensed assets | ✅ Licensed assets | ❌ None | Can view licensed assets (future) |
| **Viewer** | ❌ None | ❌ None | ❌ None | ❌ None | No direct asset access |

### Field-Level Permissions

All metadata fields are accessible to users with asset access. No field-level restrictions.

### Resource Ownership Rules

**Asset Access Logic:**
```typescript
// User can access asset if:
// 1. User is the creator (createdBy === userId)
// 2. User is an admin (userRole === 'ADMIN')
// 3. User has active license for the asset (future implementation)

function canAccessAsset(asset: Asset, userId: string, userRole: string): boolean {
  if (userRole === 'ADMIN') return true;
  if (asset.createdBy === userId) return true;
  // TODO: Check licenses when implemented
  // if (hasActiveLicense(userId, asset.id)) return true;
  return false;
}
```

### JWT Token Requirements

**Required Claims:**
```typescript
{
  sub: string;              // User ID
  role: string;             // User role (CREATOR, ADMIN, BRAND, VIEWER)
  email: string;            // User email
  iat: number;              // Issued at timestamp
  exp: number;              // Expiration timestamp
}
```

**Token Inclusion:**
```typescript
// In HTTP headers
Authorization: Bearer <JWT_TOKEN>

// tRPC automatically includes token from cookies or headers
// No manual token handling required
```

### Access Denied Scenarios

1. **Not Authenticated:** No JWT token provided → 401 Unauthorized
2. **Token Expired:** JWT exp claim in past → 401 Unauthorized
3. **Not Owner:** User ID doesn't match asset creator → 403 Forbidden
4. **Asset Deleted:** Asset has deletedAt timestamp → 404 Not Found

---

## Rate Limiting & Quotas

### Current Implementation Status

⚠️ **Rate limiting is not yet enforced** but infrastructure is in place for future implementation.

### Planned Rate Limits (Future)

| Endpoint | Limit | Window | Headers |
|----------|-------|--------|---------|
| `getPreview` | 1000 requests | 1 hour | `X-RateLimit-*` |
| `getMetadata` | 1000 requests | 1 hour | `X-RateLimit-*` |
| `getVariants` | 500 requests | 1 hour | `X-RateLimit-*` |
| `regeneratePreview` | 50 requests | 1 hour | `X-RateLimit-*` |

### Rate Limit Headers (Future)

When rate limiting is implemented, responses will include:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1728748800
```

### Frontend Handling (Future)

```typescript
function useAssetPreviewWithRateLimit(assetId: string) {
  const { data, error } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  // Check for rate limit error
  if (error?.data?.httpStatus === 429) {
    const resetTime = error.data?.rateLimit?.reset;
    return {
      error: 'Rate limit exceeded',
      retryAfter: resetTime,
    };
  }

  return { data };
}
```

### Quota Limits

No per-user quotas are currently enforced. All authenticated users have unlimited access to their own assets.

---

## Real-time Updates

### Webhook Events

The system does **not** currently emit webhooks for preview generation events. Monitoring processing status should be done via polling.

### WebSocket/SSE

No WebSocket or Server-Sent Events endpoints are currently available for real-time updates.

### Polling Recommendations

**For Processing Status:**

Poll the `getMetadata` endpoint with `fields: ['processing']` to check if thumbnails/previews have been generated:

```typescript
function useProcessingStatus(assetId: string) {
  const { data } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: (data) => {
        // Stop polling if all processing is complete
        if (data?.processing?.thumbnailGenerated && 
            data?.processing?.previewGenerated) {
          return false;
        }
        // Poll every 5 seconds while processing
        return 5000;
      },
    }
  );

  return data?.processing;
}
```

**Best Practices:**
- Poll every 5 seconds during active processing
- Stop polling once `thumbnailGenerated` and `previewGenerated` are both `true`
- Use exponential backoff if processing takes longer than expected
- Show loading indicators while polling

**Example with Progress Indicator:**

```typescript
function AssetUploadProgress({ assetId }: { assetId: string }) {
  const { data } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    { refetchInterval: 5000 }
  );

  const processing = data?.processing;
  const steps = [
    { label: 'Metadata extracted', complete: processing?.metadataExtracted },
    { label: 'Thumbnail generated', complete: processing?.thumbnailGenerated },
    { label: 'Preview generated', complete: processing?.previewGenerated },
  ];

  const completeCount = steps.filter(s => s.complete).length;
  const progress = (completeCount / steps.length) * 100;

  return (
    <div>
      <div className="progress-bar">
        <div style={{ width: `${progress}%` }} />
      </div>
      {steps.map((step, i) => (
        <div key={i}>
          {step.complete ? '✅' : '⏳'} {step.label}
        </div>
      ))}
    </div>
  );
}
```

---

## Pagination & Filtering

The file viewer endpoints **do not support pagination** as they operate on individual assets, not collections.

For paginated asset lists, use the `ipAssets.list` endpoint (see Asset Management Integration Guide).

### No Filtering on File Viewer Endpoints

The following endpoints are single-resource queries and don't support filtering:
- `getPreview` - Returns preview for specific asset
- `getMetadata` - Returns metadata for specific asset
- `getVariants` - Returns variants for specific asset
- `regeneratePreview` - Triggers regeneration for specific asset

### Field Selection (Metadata Only)

The `getMetadata` endpoint supports **field selection** (not filtering):

```typescript
// Get only technical metadata (reduces payload size)
const metadata = await trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['technical'],
});

// Get technical + processing status
const metadata = await trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['technical', 'processing'],
});
```

**Available Fields:**
- `technical` - Dimensions, codec, bitrate, etc.
- `descriptive` - Title, artist, author, etc.
- `extracted` - EXIF, creation date, etc.
- `processing` - Generation status and timestamps
- `all` - All fields (default)

---

## Frontend Implementation Checklist

### Phase 1: Basic Preview Display

- [ ] **Install tRPC client** (if not already installed)
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  ```

- [ ] **Copy type definitions** to `@/types/assets.ts`

- [ ] **Create preview component** for images
  ```tsx
  function ImagePreview({ assetId }: { assetId: string }) {
    const { data } = trpc.ipAssets.getPreview.useQuery({
      id: assetId,
      size: 'medium',
    });
    return data ? <img src={data.url} /> : <Spinner />;
  }
  ```

- [ ] **Handle loading states** with skeleton loaders

- [ ] **Handle error states** with user-friendly messages

- [ ] **Test with various asset types** (IMAGE, VIDEO, AUDIO, DOCUMENT)

### Phase 2: Responsive Images

- [ ] **Implement responsive images** using `getVariants`
  ```tsx
  <picture>
    <source media="(max-width: 400px)" srcSet={small} />
    <source media="(max-width: 800px)" srcSet={medium} />
    <img src={large} />
  </picture>
  ```

- [ ] **Add loading="lazy"** for better performance

- [ ] **Implement srcset** for retina displays

- [ ] **Test on mobile devices** with slow connections

### Phase 3: Metadata Display

- [ ] **Create metadata display components**
  - [ ] Technical metadata (resolution, duration, bitrate)
  - [ ] Descriptive metadata (title, artist, author)
  - [ ] EXIF data for images
  - [ ] ID3 tags for audio

- [ ] **Format values** (duration, bitrate, file size)

- [ ] **Handle missing metadata** gracefully

### Phase 4: Video & Audio Players

- [ ] **Implement video player** with preview clip
  ```tsx
  {variants.previews.url && (
    <video controls src={variants.previews.url} />
  )}
  ```

- [ ] **Implement audio player** with waveform
  ```tsx
  {variants.waveform?.url && (
    <img src={variants.waveform.url} alt="Waveform" />
  )}
  ```

- [ ] **Add playback controls**

- [ ] **Show duration** and current time

### Phase 5: Processing Status

- [ ] **Create processing indicator** component
  ```tsx
  function ProcessingStatus({ assetId }) {
    const { data } = trpc.ipAssets.getMetadata.useQuery(
      { id: assetId, fields: ['processing'] },
      { refetchInterval: 5000 }
    );
    return <ProgressBar processing={data?.processing} />;
  }
  ```

- [ ] **Implement polling** with `refetchInterval`

- [ ] **Show progress steps** (metadata → thumbnail → preview)

- [ ] **Stop polling** when complete

### Phase 6: Regeneration

- [ ] **Add regenerate button** for failed previews
  ```tsx
  {!thumbnailGenerated && (
    <button onClick={() => regenerate.mutate({ id: assetId })}>
      Regenerate
    </button>
  )}
  ```

- [ ] **Show loading state** during regeneration

- [ ] **Invalidate queries** after successful regeneration

- [ ] **Handle regeneration errors**

### Phase 7: URL Expiry Handling

- [ ] **Detect expired URLs** (403 errors)

- [ ] **Automatically refetch** new signed URLs

- [ ] **Implement URL cache** with expiry tracking
  ```tsx
  const cacheTime = 14 * 60 * 1000; // 14 minutes
  { staleTime: cacheTime, cacheTime }
  ```

### Phase 8: Edge Cases

- [ ] **Handle deleted assets** (404 errors)

- [ ] **Handle access denied** (403 errors)

- [ ] **Handle processing failures** (show regenerate button)

- [ ] **Handle very large files** (show warning)

- [ ] **Handle missing thumbnails** (fallback to original)

- [ ] **Handle AUDIO assets** (no thumbnails available)

### Phase 9: Performance Optimization

- [ ] **Implement lazy loading** for images

- [ ] **Use field selection** to reduce payload size
  ```tsx
  fields: ['technical', 'processing'] // Don't fetch 'extracted' if not needed
  ```

- [ ] **Cache responses** in React Query

- [ ] **Prefetch variants** when hovering over thumbnails

- [ ] **Use smaller sizes** for grid views

### Phase 10: Testing

- [ ] **Unit test** helper functions (formatDuration, formatBitrate)

- [ ] **Integration test** API endpoints with mock data

- [ ] **E2E test** upload → processing → display flow

- [ ] **Test error scenarios** (404, 403, 500)

- [ ] **Test with slow networks** (throttling)

- [ ] **Test URL expiry** after 15 minutes

### UX Considerations

**Loading States:**
- Show skeleton loaders while fetching data
- Display progress bar during processing
- Show spinner for regeneration

**Error States:**
- Display user-friendly error messages
- Provide retry button for transient errors
- Suggest solutions for permanent errors

**Empty States:**
- Show placeholder when no preview available
- Indicate processing in progress
- Explain why preview isn't available

**Fallback Behavior:**
- Use original file if preview not available
- Show file icon for unsupported types
- Display basic metadata even if processing failed

**Accessibility:**
- Add alt text to all images
- Provide keyboard controls for media players
- Use ARIA labels for loading states

---

## Complete Example: Asset Gallery Component

```tsx
import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function AssetGallery({ assetId }: { assetId: string }) {
  const [selectedSize, setSelectedSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Fetch preview
  const { data: preview, isLoading: previewLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: selectedSize,
  });

  // Fetch metadata
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'descriptive', 'processing'],
  });

  // Fetch all variants
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });

  // Regenerate mutation
  const utils = trpc.useContext();
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: () => {
      utils.ipAssets.getMetadata.invalidate({ id: assetId });
      utils.ipAssets.getVariants.invalidate({ id: assetId });
    },
  });

  if (previewLoading) {
    return <div className="skeleton" />;
  }

  const isProcessing = !metadata?.processing?.thumbnailGenerated;

  return (
    <div className="asset-gallery">
      {/* Preview Display */}
      <div className="preview-container">
        {preview && (
          <img 
            src={preview.url} 
            alt="Asset preview"
            width={preview.width}
            height={preview.height}
          />
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="processing-overlay">
            <Spinner />
            <p>Processing preview...</p>
          </div>
        )}
      </div>

      {/* Size Selector */}
      <div className="size-selector">
        {(['small', 'medium', 'large'] as const).map((size) => (
          <button
            key={size}
            onClick={() => setSelectedSize(size)}
            className={selectedSize === size ? 'active' : ''}
          >
            {size.charAt(0).toUpperCase() + size.slice(1)}
          </button>
        ))}
      </div>

      {/* Metadata Display */}
      {metadata?.technical && (
        <div className="metadata">
          <h3>Details</h3>
          {metadata.technical.width && (
            <p>Resolution: {metadata.technical.width} × {metadata.technical.height}</p>
          )}
          {metadata.technical.duration && (
            <p>Duration: {formatDuration(metadata.technical.duration)}</p>
          )}
          {metadata.technical.format && (
            <p>Format: {metadata.technical.format.toUpperCase()}</p>
          )}
        </div>
      )}

      {/* Descriptive Metadata */}
      {metadata?.descriptive && (
        <div className="descriptive">
          {metadata.descriptive.title && <h2>{metadata.descriptive.title}</h2>}
          {metadata.descriptive.artist && <p>By {metadata.descriptive.artist}</p>}
          {metadata.descriptive.album && <p>From {metadata.descriptive.album}</p>}
        </div>
      )}

      {/* Regenerate Button */}
      {metadata?.processing?.thumbnailGenerated === false && (
        <button 
          onClick={() => regenerate.mutate({ id: assetId, types: ['thumbnail'] })}
          disabled={regenerate.isLoading}
        >
          {regenerate.isLoading ? 'Regenerating...' : 'Regenerate Preview'}
        </button>
      )}

      {/* Video/Audio Preview */}
      {variants?.previews.url && metadata?.type === 'VIDEO' && (
        <video 
          controls 
          src={variants.previews.url}
          poster={preview?.url}
        />
      )}

      {/* Audio Waveform */}
      {variants?.waveform?.url && metadata?.type === 'AUDIO' && (
        <div className="audio-player">
          <img src={variants.waveform.url} alt="Waveform" />
          <audio controls src={variants.previews.url} />
        </div>
      )}
    </div>
  );
}

// Helper functions
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

---

## Related Documentation

- **Preview Generation Integration Guide (Part 1):** Detailed guide for preview generation implementation
- **Asset Upload Integration Guide:** How to upload files and trigger processing
- **Asset Management Integration Guide:** List, filter, and manage assets
- **Storage Integration Guide:** Direct interaction with Cloudflare R2

---

## Support & Troubleshooting

### Common Issues

**Issue:** Preview URL returns 403 after 15 minutes  
**Solution:** Refetch preview URL using `getPreview` endpoint

**Issue:** Thumbnail not available for AUDIO assets  
**Solution:** This is expected behavior - use waveform instead

**Issue:** Processing stuck at "metadata extracted" step  
**Solution:** Trigger regeneration with `regeneratePreview` endpoint

**Issue:** EXIF data missing for some images  
**Solution:** Not all images have EXIF data - handle gracefully in UI

### Debug Checklist

1. ✅ JWT token included in request headers
2. ✅ Asset ID is valid CUID format
3. ✅ User has permission to access asset
4. ✅ Asset has not been deleted
5. ✅ Network request completed successfully
6. ✅ Response structure matches TypeScript types

### Backend Logs

Check backend logs for detailed error messages:
```bash
# Filter for asset-related errors
grep "IP Asset" /var/log/yg-backend/error.log

# Filter for specific asset ID
grep "cm1abc123xyz" /var/log/yg-backend/access.log
```

---

**Document Version:** 1.0.0  
**Last Updated:** October 12, 2025  
**Maintained By:** Backend Development Team
