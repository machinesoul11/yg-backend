# Preview Generation - Frontend Integration Guide (Part 1)

**Classification:** 🌐 SHARED  
**Module:** IP Assets - Preview Generation  
**Last Updated:** October 12, 2025  
**Backend Deployment:** ops.yesgoddess.agency  
**Frontend Repo:** yesgoddess-web

---

## Table of Contents - Part 1

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)

---

## Overview

The Preview Generation module provides comprehensive preview and thumbnail generation for all asset types uploaded to the YesGoddess platform. This module handles:

- **Image Previews**: Multiple size variants (small, medium, large)
- **Video Thumbnails**: Frame extraction with intelligent positioning
- **Video Previews**: 10-second preview clips
- **Audio Waveforms**: Visual representation as PNG
- **Audio Previews**: 30-second preview clips
- **Document Thumbnails**: SVG-based placeholders with metadata

All preview generation happens **asynchronously** via background jobs after file upload confirmation. Previews are stored in Cloudflare R2 and served via signed URLs with 15-minute expiration.

### Key Features

✅ Automatic background processing  
✅ Multiple size variants for optimization  
✅ Signed URLs with expiration  
✅ Regeneration on-demand  
✅ Comprehensive metadata extraction  
✅ Support for all asset types  

### Supported Asset Types

| Asset Type | Thumbnail Sizes | Preview Type | Special Features |
|------------|----------------|--------------|------------------|
| **IMAGE** | Small (200×200), Medium (400×400), Large (800×800) | N/A | EXIF extraction, color space analysis |
| **VIDEO** | Small (200×200), Medium (400×400), Large (800×800) | 10-second clip (720p) | Frame extraction at 10% position |
| **AUDIO** | N/A | 30-second clip (128kbps) | Waveform visualization PNG |
| **DOCUMENT** | Small (200×200), Medium (400×400), Large (800×800) | N/A | SVG placeholder with metadata |

---

## API Endpoints

All endpoints use tRPC and require authentication. Base URL: `https://ops.yesgoddess.agency/api/trpc`

### 1. Get Preview URL

**Endpoint:** `ipAssets.getPreview`  
**Type:** Query  
**Authentication:** Required (JWT)

Retrieves a signed URL for a specific preview size variant.

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
  url: string;           // Signed download URL
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;        // Pixel width (if available)
  height?: number;       // Pixel height (if available)
  expiresAt: string;     // ISO 8601 timestamp
}
```

**Authorization:**
- Creator can access own assets
- Admin can access all assets

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

**React Query (Recommended):**
```typescript
import { trpc } from '@/lib/trpc';

function AssetPreview({ assetId }: { assetId: string }) {
  const { data, isLoading, error } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

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
      {data.technical && (
        <>
          <p>Duration: {formatDuration(data.technical.duration)}</p>
          <p>Resolution: {data.technical.resolution}</p>
          <p>Codec: {data.technical.codec}</p>
          <p>FPS: {data.technical.fps}</p>
        </>
      )}
      {!data.processing?.thumbnailGenerated && (
        <Badge>Generating preview...</Badge>
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
      "id": "cm1abc123xyz",
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
function ResponsiveImage({ assetId }: { assetId: string }) {
  const { data } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'thumbnail',
  });

  if (!data?.thumbnails) return null;

  return (
    <picture>
      {data.thumbnails.large && (
        <source media="(min-width: 1024px)" srcSet={data.thumbnails.large.url} />
      )}
      {data.thumbnails.medium && (
        <source media="(min-width: 640px)" srcSet={data.thumbnails.medium.url} />
      )}
      {data.thumbnails.small && (
        <img src={data.thumbnails.small.url} alt="Preview" />
      )}
    </picture>
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
function AudioWaveform({ assetId }: { assetId: string }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });

  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'descriptive'],
  });

  if (!variants?.waveform?.url) {
    return <div>Generating waveform...</div>;
  }

  return (
    <div className="audio-player">
      <img 
        src={variants.waveform.url} 
        alt="Audio waveform"
        className="w-full h-auto"
      />
      <div className="metadata">
        {metadata?.descriptive?.artist && (
          <p>Artist: {metadata.descriptive.artist}</p>
        )}
        {metadata?.technical?.duration && (
          <p>Duration: {formatDuration(metadata.technical.duration)}</p>
        )}
      </div>
    </div>
  );
}
```

---

### Error Response Examples

#### 1. Asset Not Found (404)
```json
{
  "error": {
    "json": {
      "message": "Asset with ID cm1abc123xyz not found",
      "code": "NOT_FOUND",
      "data": {
        "code": "NOT_FOUND",
        "httpStatus": 404,
        "path": "ipAssets.getPreview",
        "cause": {
          "code": "ASSET_NOT_FOUND",
          "details": null
        }
      }
    }
  }
}
```

#### 2. Access Denied (403)
```json
{
  "error": {
    "json": {
      "message": "You do not have permission to access asset cm1abc123xyz",
      "code": "FORBIDDEN",
      "data": {
        "code": "FORBIDDEN",
        "httpStatus": 403,
        "path": "ipAssets.getPreview",
        "cause": {
          "code": "ASSET_ACCESS_DENIED",
          "details": null
        }
      }
    }
  }
}
```

#### 3. Invalid Input (400)
```json
{
  "error": {
    "json": {
      "message": "Validation error",
      "code": "BAD_REQUEST",
      "data": {
        "code": "BAD_REQUEST",
        "httpStatus": 400,
        "zodError": {
          "fieldErrors": {
            "id": ["Invalid cuid"]
          }
        }
      }
    }
  }
}
```

#### 4. Unauthorized (401)
```json
{
  "error": {
    "json": {
      "message": "Unauthorized",
      "code": "UNAUTHORIZED",
      "data": {
        "code": "UNAUTHORIZED",
        "httpStatus": 401
      }
    }
  }
}
```

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase:

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
- **Format:** CUID (Collision-resistant Unique Identifier)
- **Pattern:** `/^c[a-z0-9]{24}$/`
- **Example:** `cm1abc123xyzdef456uvwqrs`
- **Validation:** Use Zod schema `z.string().cuid()`

#### Preview Size
- **Allowed Values:** `'small'`, `'medium'`, `'large'`, `'original'`
- **Default:** `'medium'`
- **Dimensions:**
  - Small: 200×200px
  - Medium: 400×400px
  - Large: 800×800px
  - Original: Full resolution

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

#### 1. Preview Availability

**Thumbnails:**
- Generated for: IMAGE, VIDEO, DOCUMENT
- Not generated for: AUDIO (uses waveform instead)
- Processing time: 5-15 seconds typical
- Format: JPEG with progressive encoding

**Previews:**
- Video: 10-second clip at 720p, 30fps, 1000k bitrate
- Audio: 30-second clip at 128kbps MP3
- Not applicable for: IMAGE, DOCUMENT
- Processing time: 30-60 seconds typical

**Waveforms:**
- Generated only for: AUDIO
- Dimensions: 1800×280px PNG
- Fallback: SVG placeholder if generation fails

#### 2. URL Expiration

- All signed URLs expire after **15 minutes** (900 seconds)
- Frontend should:
  - Cache URLs for <15 minutes
  - Regenerate URLs when displaying after >10 minutes
  - Handle expired URL errors gracefully
  
**URL Refresh Strategy:**
```typescript
const isUrlExpiringSoon = (expiresAt: string) => {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const minutesUntilExpiry = (expiry.getTime() - now.getTime()) / 1000 / 60;
  return minutesUntilExpiry < 5; // Refresh if <5 minutes remaining
};
```

#### 3. Processing Status

Assets go through this processing pipeline:

```
Upload Confirmed → Virus Scan → Metadata Extraction → Thumbnail Generation → Preview Generation
```

**Status Checks:**
- `processing.thumbnailGenerated`: Thumbnail available
- `processing.previewGenerated`: Preview clip available
- `processing.metadataExtracted`: Technical metadata extracted

**Polling Strategy:**
```typescript
// Poll every 5 seconds until thumbnails are ready
const { data } = trpc.ipAssets.getMetadata.useQuery(
  { id: assetId, fields: ['processing'] },
  {
    refetchInterval: (data) => 
      data?.processing?.thumbnailGenerated ? false : 5000,
  }
);
```

#### 4. Fallback Behavior

**When previews are not available:**
- Show placeholder with processing status
- Display file type icon
- Show estimated completion time

**When URLs expire:**
- Catch 403/410 errors
- Automatically refetch preview URL
- Show temporary loading state

**When regeneration fails:**
- Display error message
- Provide retry button
- Log failure for support

#### 5. Performance Optimization

**Best Practices:**
- Use appropriate size for context:
  - Grid view: `small`
  - List view: `medium`
  - Detail view: `large`
  - Download/full view: `original`
  
- Implement lazy loading for thumbnails
- Use `<picture>` element for responsive images
- Cache variant URLs in React Query with stale time

**Example Responsive Loading:**
```typescript
const { data } = trpc.ipAssets.getVariants.useQuery(
  { id: assetId, type: 'thumbnail' },
  {
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
  }
);
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
- Waveform: PNG visualization (1800×280)
- Preview: 30-second clip from 20% position
- Metadata: ID3 tags, duration, bitrate, sample rate

**DOCUMENT:**
- Thumbnails: SVG placeholder with metadata
- No preview clips
- Metadata: Page count, author, creation date
- Text extraction available for search

### Derived Values & Calculations

#### Duration Formatting
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

#### File Size Formatting
```typescript
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
```

#### Bitrate Formatting
```typescript
function formatBitrate(bitsPerSecond: number): string {
  const kbps = bitsPerSecond / 1000;
  const mbps = kbps / 1000;
  
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}
```

---

**Continue to [Part 2](./PREVIEW_GENERATION_INTEGRATION_GUIDE_PART_2.md)** for:
- Error Handling
- Authorization & Permissions
- Rate Limiting & Quotas
- Real-time Updates
- Pagination & Filtering
- Frontend Implementation Checklist
