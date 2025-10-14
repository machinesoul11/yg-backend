# Metadata Extraction & File Viewer - Frontend Integration Guide (Part 1)

**Classification:** 🌐 SHARED  
**Last Updated:** October 13, 2025  
**Backend Repo:** yg-backend (ops.yesgoddess.agency)  
**Frontend Repo:** yesgoddess-web  
**Architecture:** tRPC API with JWT authentication

---

## Table of Contents

- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [Request/Response Examples](#requestresponse-examples)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Business Logic & Validation Rules](#business-logic--validation-rules)
- [Error Handling](#error-handling)

---

## Overview

### Purpose

This module provides comprehensive metadata extraction and file preview capabilities for all uploaded assets:

- **Automatic Metadata Extraction:** Extract EXIF, ID3, codec, and document metadata during upload
- **File Previews:** Generate thumbnails and preview clips optimized for web display
- **Multiple Size Variants:** Provide 3 thumbnail sizes (small, medium, large) for responsive UIs
- **On-Demand Regeneration:** Re-process assets if previews fail or need updating

### Architecture Overview

```
Frontend Upload → R2 Storage → Background Job Pipeline
                                      ↓
                      ┌────────────────────────────┐
                      │   Metadata Extraction      │
                      │  - EXIF (Sharp)            │
                      │  - FFmpeg (video/audio)    │
                      │  - pdf-parse (documents)   │
                      │  - music-metadata (audio)  │
                      └────────────────────────────┘
                                      ↓
                      ┌────────────────────────────┐
                      │  Thumbnail Generation      │
                      │  - Small: 200×200          │
                      │  - Medium: 400×400         │
                      │  - Large: 800×800          │
                      │  - Sharp/FFmpeg            │
                      └────────────────────────────┘
                                      ↓
                      ┌────────────────────────────┐
                      │   Preview Generation       │
                      │  - 10s video clips (720p)  │
                      │  - 30s audio clips         │
                      │  - Waveform PNG (audio)    │
                      └────────────────────────────┘
                                      ↓
                      Metadata stored in JSONB field
                      (ip_assets.metadata)
```

### Supported Asset Types

| Asset Type   | Metadata Extracted                          | Thumbnails        | Preview Clips      | Special Features                 |
| ------------ | ------------------------------------------- | ----------------- | ------------------ | -------------------------------- |
| **IMAGE**    | EXIF, dimensions, color space, format       | ✅ 3 sizes        | N/A                | Camera settings, GPS data        |
| **VIDEO**    | Duration, codec, resolution, FPS, bitrate   | ✅ 3 sizes        | ✅ 10s clip (720p) | Frame at 10% position            |
| **AUDIO**    | ID3 tags, duration, bitrate, sample rate    | ❌                | ✅ 30s clip        | Waveform PNG (1800×280)          |
| **DOCUMENT** | Page count, author, text content, metadata  | ✅ SVG placeholder| N/A                | Text extraction for search       |

### Processing Timeline

| Stage              | Timing          | Priority | Notes                                    |
| ------------------ | --------------- | -------- | ---------------------------------------- |
| Upload Confirmation| Immediate       | -        | Returns 200, queues background jobs      |
| Virus Scan         | 1-5 seconds     | High     | Blocks further processing                |
| Metadata Extraction| 5-30 seconds    | Normal   | Runs in parallel with thumbnail gen      |
| Thumbnail Gen      | 5-60 seconds    | Normal   | Images: 5-10s, Videos: 20-60s            |
| Preview Gen        | 10-90 seconds   | Normal   | Video: 30-60s, Audio: 10-30s             |

---

## API Endpoints

All endpoints use **tRPC** and require **JWT authentication**.  
**Base URL:** `https://ops.yesgoddess.agency/api/trpc`

### 1. Get Preview URL

**Endpoint:** `ipAssets.getPreview`  
**Type:** Query  
**Authentication:** Required (JWT)

Retrieves a signed URL for a thumbnail/preview with specified size variant.

#### Input Schema

```typescript
{
  id: string;        // Asset ID (CUID format)
  size?: 'small' | 'medium' | 'large' | 'original';  // Default: 'medium'
}
```

#### Response Schema

```typescript
{
  url: string;           // Signed URL (expires in 15 minutes)
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;        // Preview width in pixels
  height?: number;       // Preview height in pixels
  expiresAt: string;     // ISO 8601 timestamp
}
```

#### Size Specifications

- **small:** 200×200 px (optimized for thumbnails, lists)
- **medium:** 400×400 px (default, gallery views)
- **large:** 800×800 px (detailed preview, lightbox)
- **original:** Full resolution (returns original file URL)

#### Behavior

- Falls back to original file if thumbnail not yet generated
- Returns closest available size if exact size doesn't exist
- Thumbnails generated for IMAGE, VIDEO, and DOCUMENT types
- AUDIO assets do not have thumbnails (use waveform instead)
- All URLs are signed with 15-minute expiration

#### Authorization

- **Creator:** Can access own assets
- **Admin:** Can access all assets
- **Licensees:** Can access licensed assets (when licensing module implemented)

---

### 2. Get Asset Metadata

**Endpoint:** `ipAssets.getMetadata`  
**Type:** Query  
**Authentication:** Required (JWT)

Retrieves comprehensive metadata for an asset with optional field filtering.

#### Input Schema

```typescript
{
  id: string;        // Asset ID (CUID format)
  fields?: Array<'technical' | 'descriptive' | 'extracted' | 'processing' | 'all'>;
  // Default: ['all']
}
```

#### Response Schema

```typescript
{
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  technical?: {
    // Image/Video
    width?: number;
    height?: number;
    format?: string;           // 'jpeg', 'png', 'mp4', etc.
    colorSpace?: string;       // 'sRGB', 'CMYK', etc.
    
    // Video specific
    duration?: number;         // seconds (float)
    codec?: string;            // 'h264', 'hevc', 'vp9', etc.
    fps?: number;              // frames per second
    bitrate?: number;          // bits per second
    resolution?: string;       // '1920x1080', '3840x2160', etc.
    
    // Audio specific
    sampleRate?: number;       // Hz (e.g., 44100, 48000)
    channels?: number;         // 1 = mono, 2 = stereo
    
    // Document specific
    pageCount?: number;
  };
  descriptive?: {
    title?: string;            // From file metadata
    artist?: string;           // Audio: ID3 tag
    album?: string;            // Audio: ID3 tag
    author?: string;           // Document: PDF metadata
    creator?: string;          // Document: creator app
    subject?: string;          // Document: subject field
    keywords?: string;         // Comma-separated keywords
    genre?: string;            // Audio: ID3 genre
  };
  extracted?: {
    exif?: Record<string, any>;        // Raw EXIF data (images)
    creationDate?: string;             // ISO 8601
    modificationDate?: string;         // ISO 8601
  };
  processing?: {
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;     // ISO 8601
    previewGenerated?: boolean;
    previewGeneratedAt?: string;       // ISO 8601
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;      // ISO 8601
  };
}
```

#### Field Filtering

Use the `fields` parameter to optimize response size:

- **technical:** Only technical metadata (dimensions, codec, bitrate)
- **descriptive:** Only descriptive metadata (title, artist, author)
- **extracted:** Only raw extracted data (EXIF, creation dates)
- **processing:** Only processing status (timestamps, completion flags)
- **all:** Returns all available metadata (default)

#### Authorization

- **Creator:** Can access own assets
- **Admin:** Can access all assets

---

### 3. Get Asset Variants

**Endpoint:** `ipAssets.getVariants`  
**Type:** Query  
**Authentication:** Required (JWT)

Lists all available size variants and processed versions of a file.

#### Input Schema

```typescript
{
  id: string;        // Asset ID (CUID format)
  type?: 'thumbnail' | 'preview' | 'all';  // Default: 'all'
}
```

#### Response Schema

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
    url?: string;            // Signed URL for preview clip/video
    expiresAt?: string;      // ISO 8601
    duration?: number;       // For video/audio previews (seconds)
  };
  waveform?: {               // AUDIO assets only
    url?: string;            // Signed URL for waveform PNG
    expiresAt?: string;      // ISO 8601
  };
}
```

#### Behavior

- Returns only available variants (not all sizes may exist yet)
- All URLs are signed with 15-minute expiration
- `waveform` field only present for AUDIO assets
- `previews.url` only present for VIDEO/AUDIO assets
- Empty objects returned for unavailable variants

#### Authorization

- **Creator:** Can access own assets
- **Admin:** Can access all assets

---

### 4. Regenerate Preview

**Endpoint:** `ipAssets.regeneratePreview`  
**Type:** Mutation  
**Authentication:** Required (JWT)

Triggers background jobs to regenerate thumbnails, previews, or metadata.

#### Input Schema

```typescript
{
  id: string;        // Asset ID (CUID format)
  types?: Array<'thumbnail' | 'preview' | 'metadata' | 'all'>;  // Default: ['all']
}
```

#### Response Schema

```typescript
{
  jobId: string;           // Background job identifier
  status: 'queued' | 'processing';
  types: string[];         // List of regeneration types queued
}
```

#### Regeneration Types

- **thumbnail:** Regenerate all thumbnail sizes (small, medium, large)
- **preview:** Regenerate preview clip (VIDEO/AUDIO only, no-op for IMAGE/DOCUMENT)
- **metadata:** Re-extract metadata from original file
- **all:** Regenerate everything (default)

#### Processing Priority

- Regeneration jobs run with **higher priority** than initial processing
- Typical completion time: **5-60 seconds** depending on asset type
- Jobs have **3 retry attempts** on failure

#### Use Cases

- Thumbnail generation failed initially
- Preview clip is corrupted or missing
- User wants to update metadata after file modification
- Admin needs to reprocess assets after bug fix

#### Authorization

- **Creator:** Can regenerate own assets
- **Admin:** Can regenerate all assets

#### Notes

- Jobs run asynchronously; poll `getMetadata` with `fields: ['processing']` to check completion
- Thumbnails typically complete in **5-15 seconds**
- Video previews may take **30-60 seconds**
- Multiple regeneration requests for the same asset will be deduplicated

---

## Request/Response Examples

### Example 1: Get Medium-Sized Preview (IMAGE)

**tRPC Query:**
```typescript
const { data, isLoading, error } = trpc.ipAssets.getPreview.useQuery({
  id: 'cm1abc123xyz',
  size: 'medium',
});
```

**cURL:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/ipAssets.getPreview?input=%7B%22json%22%3A%7B%22id%22%3A%22cm1abc123xyz%22%2C%22size%22%3A%22medium%22%7D%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "url": "https://r2.yesgoddess.agency/assets/cm1abc123xyz/thumbnail_medium.jpg?X-Amz-Signature=...",
        "size": "medium",
        "width": 400,
        "height": 400,
        "expiresAt": "2025-10-13T15:30:00.000Z"
      }
    }
  }
}
```

---

### Example 2: Get Video Metadata

**tRPC Query:**
```typescript
const { data } = trpc.ipAssets.getMetadata.useQuery({
  id: 'cm1video789',
  fields: ['technical', 'processing'],
});
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "type": "VIDEO",
        "technical": {
          "width": 1920,
          "height": 1080,
          "duration": 120.5,
          "codec": "h264",
          "fps": 30,
          "bitrate": 5000000,
          "resolution": "1920x1080",
          "format": "mp4"
        },
        "processing": {
          "thumbnailGenerated": true,
          "thumbnailGeneratedAt": "2025-10-13T14:15:30.000Z",
          "previewGenerated": true,
          "previewGeneratedAt": "2025-10-13T14:16:45.000Z",
          "metadataExtracted": true,
          "metadataExtractedAt": "2025-10-13T14:15:25.000Z"
        }
      }
    }
  }
}
```

---

### Example 3: Get All Variants (VIDEO)

**tRPC Query:**
```typescript
const { data } = trpc.ipAssets.getVariants.useQuery({
  id: 'cm1video789',
  type: 'all',
});
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "thumbnails": {
          "small": {
            "url": "https://r2.yesgoddess.agency/assets/cm1video789/thumbnail_small.jpg?...",
            "size": "small",
            "width": 200,
            "height": 200,
            "expiresAt": "2025-10-13T15:30:00.000Z"
          },
          "medium": {
            "url": "https://r2.yesgoddess.agency/assets/cm1video789/thumbnail_medium.jpg?...",
            "size": "medium",
            "width": 400,
            "height": 400,
            "expiresAt": "2025-10-13T15:30:00.000Z"
          },
          "large": {
            "url": "https://r2.yesgoddess.agency/assets/cm1video789/thumbnail_large.jpg?...",
            "size": "large",
            "width": 800,
            "height": 800,
            "expiresAt": "2025-10-13T15:30:00.000Z"
          }
        },
        "previews": {
          "url": "https://r2.yesgoddess.agency/assets/cm1video789/preview.mp4?...",
          "expiresAt": "2025-10-13T15:30:00.000Z",
          "duration": 10
        }
      }
    }
  }
}
```

---

### Example 4: Regenerate Preview

**tRPC Mutation:**
```typescript
const regenerate = trpc.ipAssets.regeneratePreview.useMutation();

await regenerate.mutateAsync({
  id: 'cm1abc123xyz',
  types: ['thumbnail', 'metadata'],
});
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "jobId": "regenerate-cm1abc123xyz-1728835600000",
        "status": "queued",
        "types": ["thumbnail", "metadata"]
      }
    }
  }
}
```

---

### Example 5: Get Audio Waveform

**tRPC Query:**
```typescript
const { data } = trpc.ipAssets.getVariants.useQuery({
  id: 'cm1audio456',
  type: 'all',
});

// Use waveform URL
if (data?.waveform?.url) {
  return <img src={data.waveform.url} alt="Audio waveform" />;
}
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "thumbnails": {},
        "previews": {
          "url": "https://r2.yesgoddess.agency/assets/cm1audio456/preview.mp3?...",
          "expiresAt": "2025-10-13T15:30:00.000Z",
          "duration": 30
        },
        "waveform": {
          "url": "https://r2.yesgoddess.agency/assets/cm1audio456/waveform.png?...",
          "expiresAt": "2025-10-13T15:30:00.000Z"
        }
      }
    }
  }
}
```

---

### Example 6: Get Image EXIF Data

**tRPC Query:**
```typescript
const { data } = trpc.ipAssets.getMetadata.useQuery({
  id: 'cm1image123',
  fields: ['technical', 'extracted'],
});

// Access EXIF data
const exif = data?.extracted?.exif;
console.log(`Camera: ${exif?.Make} ${exif?.Model}`);
console.log(`ISO: ${exif?.ISO}`);
console.log(`Aperture: f/${exif?.FNumber}`);
```

**Response (200 OK):**
```json
{
  "result": {
    "data": {
      "json": {
        "type": "IMAGE",
        "technical": {
          "width": 4000,
          "height": 3000,
          "format": "jpeg",
          "colorSpace": "sRGB"
        },
        "extracted": {
          "exif": {
            "Make": "Canon",
            "Model": "EOS R5",
            "LensModel": "RF 24-70mm F2.8 L IS USM",
            "ISO": 400,
            "FNumber": 2.8,
            "ExposureTime": "1/250",
            "FocalLength": "50mm",
            "DateTimeOriginal": "2025:10:13 12:30:45",
            "GPSLatitude": 37.7749,
            "GPSLongitude": -122.4194
          },
          "creationDate": "2025-10-13T19:30:45.000Z"
        }
      }
    }
  }
}
```

---

### Error Response Examples

#### Error: Asset Not Found (404)

```json
{
  "error": {
    "json": {
      "message": "Asset not found",
      "code": "NOT_FOUND",
      "data": {
        "code": "NOT_FOUND",
        "details": {
          "assetId": "cm1nonexistent"
        },
        "httpStatus": 404,
        "path": "ipAssets.getPreview"
      }
    }
  }
}
```

#### Error: Unauthorized Access (403)

```json
{
  "error": {
    "json": {
      "message": "You do not have permission to access this asset",
      "code": "FORBIDDEN",
      "data": {
        "code": "ACCESS_DENIED",
        "details": {
          "assetId": "cm1abc123xyz",
          "userId": "usr_456"
        },
        "httpStatus": 403,
        "path": "ipAssets.getMetadata"
      }
    }
  }
}
```

#### Error: Missing Authentication (401)

```json
{
  "error": {
    "json": {
      "message": "UNAUTHORIZED",
      "code": "UNAUTHORIZED",
      "data": {
        "code": "UNAUTHORIZED",
        "httpStatus": 401,
        "path": "ipAssets.getPreview"
      }
    }
  }
}
```

#### Error: Invalid Input (400)

```json
{
  "error": {
    "json": {
      "message": "Validation failed",
      "code": "BAD_REQUEST",
      "data": {
        "code": "BAD_REQUEST",
        "issues": [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["id"],
            "message": "Required"
          }
        ],
        "httpStatus": 400,
        "path": "ipAssets.getPreview"
      }
    }
  }
}
```

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
  expiresAt: string;
}

export interface TechnicalMetadata {
  // Image/Video
  width?: number;
  height?: number;
  format?: string;
  colorSpace?: string;
  
  // Video specific
  duration?: number;
  codec?: string;
  fps?: number;
  bitrate?: number;
  resolution?: string;
  
  // Audio specific
  sampleRate?: number;
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

export interface AssetMetadataResponse {
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  technical?: TechnicalMetadata;
  descriptive?: DescriptiveMetadata;
  extracted?: ExtractedMetadata;
  processing?: ProcessingMetadata;
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

### Validation Rules

#### 1. Asset ID Validation

```typescript
// Asset IDs must be CUID format
const CUID_REGEX = /^c[a-z0-9]{24}$/;

function isValidAssetId(id: string): boolean {
  return CUID_REGEX.test(id);
}
```

#### 2. Size Parameter Validation

```typescript
const VALID_SIZES = ['small', 'medium', 'large', 'original'] as const;

function isValidSize(size: string): boolean {
  return VALID_SIZES.includes(size as any);
}
```

#### 3. Field Filter Validation

```typescript
const VALID_FIELDS = ['technical', 'descriptive', 'extracted', 'processing', 'all'] as const;

function validateFields(fields: string[]): boolean {
  return fields.every(field => VALID_FIELDS.includes(field as any));
}
```

#### 4. URL Expiration Handling

```typescript
function isUrlExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// Refetch preview URL if expired
if (data?.expiresAt && isUrlExpired(data.expiresAt)) {
  refetch();
}
```

---

### Business Rules

#### 1. Thumbnail Availability by Asset Type

| Asset Type   | Thumbnails Available | Fallback Behavior            |
| ------------ | -------------------- | ---------------------------- |
| IMAGE        | ✅ Always            | Returns original if missing  |
| VIDEO        | ✅ Always            | Returns original if missing  |
| AUDIO        | ❌ Never             | Use waveform PNG instead     |
| DOCUMENT     | ✅ SVG Placeholder   | Returns placeholder SVG      |

```typescript
function shouldShowThumbnail(assetType: AssetType): boolean {
  return assetType !== AssetType.AUDIO;
}
```

#### 2. Preview Clip Availability

| Asset Type   | Preview Clips | Duration | Resolution | Format |
| ------------ | ------------- | -------- | ---------- | ------ |
| IMAGE        | ❌ No         | -        | -          | -      |
| VIDEO        | ✅ Yes        | 10s      | 720p       | MP4    |
| AUDIO        | ✅ Yes        | 30s      | -          | MP3    |
| DOCUMENT     | ❌ No         | -        | -          | -      |

```typescript
function hasPreviewClip(assetType: AssetType): boolean {
  return assetType === AssetType.VIDEO || assetType === AssetType.AUDIO;
}
```

#### 3. Metadata Extraction Timing

- **Immediate (< 5s):** Asset type, MIME type, file size
- **Fast (5-30s):** Image EXIF, document metadata
- **Slow (30-60s):** Video codec analysis, audio waveform generation

```typescript
function getExpectedProcessingTime(assetType: AssetType): number {
  switch (assetType) {
    case AssetType.IMAGE: return 10000;  // 10 seconds
    case AssetType.VIDEO: return 60000;  // 60 seconds
    case AssetType.AUDIO: return 30000;  // 30 seconds
    case AssetType.DOCUMENT: return 20000; // 20 seconds
  }
}
```

#### 4. Signed URL Expiration

- All signed URLs expire after **15 minutes**
- Frontend should refetch URLs when:
  - User returns to page after 15+ minutes
  - URL fetch returns 403 Forbidden
  - Before initiating download/playback

```typescript
const URL_EXPIRY_SECONDS = 900; // 15 minutes

function shouldRefetchUrl(fetchedAt: Date): boolean {
  const now = new Date();
  const elapsedSeconds = (now.getTime() - fetchedAt.getTime()) / 1000;
  return elapsedSeconds >= URL_EXPIRY_SECONDS;
}
```

#### 5. Fallback Behavior

```typescript
// Priority order for preview display:
// 1. Requested size thumbnail
// 2. Next larger size thumbnail
// 3. Original file
async function getPreviewWithFallback(
  assetId: string,
  preferredSize: PreviewSize
): Promise<string> {
  try {
    const preview = await trpc.ipAssets.getPreview.query({
      id: assetId,
      size: preferredSize,
    });
    return preview.url;
  } catch (error) {
    // Fallback to original
    const asset = await trpc.ipAssets.getById.query({ id: assetId });
    return asset.originalUrl;
  }
}
```

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
- Waveform: PNG visualization (1800×280 px)
- Preview: 30-second clip from 20% position
- Metadata: ID3 tags, duration, bitrate, sample rate

**DOCUMENT:**
- Thumbnails: SVG placeholder with metadata overlay
- No preview clips
- Metadata: Page count, author, creation date
- Text extraction available for search

---

### Calculations & Derived Values

#### 1. Aspect Ratio Preservation

Thumbnails maintain aspect ratio with max dimensions:

```typescript
function calculateThumbnailDimensions(
  originalWidth: number,
  originalHeight: number,
  maxSize: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  if (originalWidth > originalHeight) {
    return {
      width: maxSize,
      height: Math.round(maxSize / aspectRatio),
    };
  } else {
    return {
      width: Math.round(maxSize * aspectRatio),
      height: maxSize,
    };
  }
}
```

#### 2. File Size Formatting

```typescript
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
```

#### 3. Duration Formatting

```typescript
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
```

---

## Error Handling

### Error Codes

| HTTP Status | Error Code          | Description                              | User Message                                    |
| ----------- | ------------------- | ---------------------------------------- | ----------------------------------------------- |
| 401         | UNAUTHORIZED        | Missing or invalid JWT token             | "Please sign in to view this content"           |
| 403         | FORBIDDEN           | User lacks permission to access asset    | "You don't have permission to view this asset"  |
| 404         | NOT_FOUND           | Asset does not exist or was deleted      | "Asset not found"                               |
| 400         | BAD_REQUEST         | Invalid input parameters                 | "Invalid request parameters"                    |
| 500         | INTERNAL_SERVER_ERROR | Unexpected server error                | "Something went wrong. Please try again"        |
| 503         | SERVICE_UNAVAILABLE | Storage provider unavailable             | "Service temporarily unavailable"               |

### Detailed Error Scenarios

#### 1. Asset Not Found

**Scenario:** Asset ID doesn't exist or was deleted

```typescript
{
  code: 'NOT_FOUND',
  message: 'Asset not found',
  details: {
    assetId: 'cm1abc123xyz'
  }
}
```

**Frontend Handling:**
```typescript
if (error?.data?.code === 'NOT_FOUND') {
  // Redirect to 404 page or show empty state
  router.push('/assets/not-found');
}
```

---

#### 2. Access Denied

**Scenario:** User tries to access another user's asset

```typescript
{
  code: 'ACCESS_DENIED',
  message: 'You do not have permission to access this asset',
  details: {
    assetId: 'cm1abc123xyz',
    userId: 'usr_456'
  }
}
```

**Frontend Handling:**
```typescript
if (error?.data?.code === 'ACCESS_DENIED') {
  toast.error("You don't have permission to view this asset");
  router.push('/assets');
}
```

---

#### 3. Preview Not Ready

**Scenario:** Asset uploaded but thumbnails not yet generated

```typescript
// No error thrown - falls back to original file URL
{
  url: 'https://r2.yesgoddess.agency/assets/cm1abc123xyz/original.jpg',
  size: 'original',
  width: 4000,
  height: 3000,
  expiresAt: '2025-10-13T15:30:00.000Z'
}
```

**Frontend Handling:**
```typescript
// Show loading state while processing
if (!data?.processing?.thumbnailGenerated) {
  return (
    <div className="relative">
      <img src={data.url} alt="Preview" />
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <Spinner />
        <p>Processing preview...</p>
      </div>
    </div>
  );
}
```

---

#### 4. Expired URL

**Scenario:** Signed URL has expired (>15 minutes old)

```typescript
// R2 returns 403 when URL expires
// Frontend should refetch URL
```

**Frontend Handling:**
```typescript
const [fetchedAt, setFetchedAt] = useState(new Date());

useEffect(() => {
  const interval = setInterval(() => {
    const elapsed = (Date.now() - fetchedAt.getTime()) / 1000;
    if (elapsed >= 900) { // 15 minutes
      refetch();
      setFetchedAt(new Date());
    }
  }, 60000); // Check every minute
  
  return () => clearInterval(interval);
}, [fetchedAt, refetch]);
```

---

#### 5. Invalid Input

**Scenario:** Invalid asset ID format or invalid size parameter

```typescript
{
  code: 'BAD_REQUEST',
  message: 'Validation failed',
  issues: [
    {
      code: 'invalid_string',
      validation: 'cuid',
      path: ['id'],
      message: 'Invalid CUID format'
    }
  ]
}
```

**Frontend Handling:**
```typescript
if (error?.data?.code === 'BAD_REQUEST') {
  const issue = error.data.issues?.[0];
  toast.error(issue?.message || 'Invalid input');
}
```

---

### Error Handling Best Practices

#### 1. Graceful Degradation

```typescript
function AssetPreview({ assetId }: { assetId: string }) {
  const { data, error, isLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (isLoading) {
    return <Skeleton className="w-full h-64" />;
  }

  if (error?.data?.code === 'NOT_FOUND') {
    return <AssetNotFoundPlaceholder />;
  }

  if (error?.data?.code === 'ACCESS_DENIED') {
    return <AccessDeniedPlaceholder />;
  }

  if (error) {
    return <GenericErrorPlaceholder />;
  }

  return <img src={data.url} alt="Preview" />;
}
```

#### 2. Retry Logic

```typescript
const { data, error, refetch } = trpc.ipAssets.getPreview.useQuery(
  { id: assetId, size: 'medium' },
  {
    retry: (failureCount, error) => {
      // Don't retry on client errors
      if (error.data?.code === 'NOT_FOUND' || error.data?.code === 'ACCESS_DENIED') {
        return false;
      }
      // Retry up to 3 times for server errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  }
);
```

#### 3. User-Friendly Error Messages

```typescript
function getErrorMessage(error: TRPCClientError<any>): string {
  switch (error.data?.code) {
    case 'NOT_FOUND':
      return 'This asset could not be found. It may have been deleted.';
    case 'ACCESS_DENIED':
      return "You don't have permission to view this asset.";
    case 'UNAUTHORIZED':
      return 'Please sign in to view this content.';
    case 'SERVICE_UNAVAILABLE':
      return 'Service temporarily unavailable. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
```

#### 4. Polling for Processing Completion

```typescript
function useAssetProcessingStatus(assetId: string) {
  const { data, refetch } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: (data) => {
        // Stop polling if all processing complete
        if (
          data?.processing?.thumbnailGenerated &&
          data?.processing?.metadataExtracted
        ) {
          return false;
        }
        // Poll every 5 seconds while processing
        return 5000;
      },
    }
  );

  return {
    isProcessing: !data?.processing?.thumbnailGenerated,
    metadata: data,
    refetch,
  };
}
```

---

**Continue to [Part 2](./METADATA_EXTRACTION_INTEGRATION_GUIDE_PART_2.md) for Authorization, Rate Limiting, Real-time Updates, and Implementation Checklist.**
