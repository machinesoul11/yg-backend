# File Viewer/Preview Service - Implementation Complete ✅

## Overview

The File Viewer/Preview Service provides comprehensive preview generation and retrieval functionality for all asset types in the YES GODDESS platform. This service enables users to view thumbnails, previews, and metadata for images, videos, audio files, and documents without downloading the full original file.

## Features Implemented

### 1. Preview Generation ✅

All preview generation is handled automatically through background jobs when assets are uploaded:

- **Image Previews**: Multiple sizes (small: 200x200, medium: 400x400, large: 800x800)
- **Video Thumbnails**: Extracted from 10% into video + multiple size variants
- **PDF Previews**: First page rendered as image with multiple sizes
- **Audio Waveforms**: Visual representation generated as PNG
- **Document Placeholders**: SVG-based placeholders for documents

### 2. Metadata Extraction ✅

Comprehensive metadata extraction for all file types:

- **Images**: EXIF data, dimensions, color space, format
- **Videos**: Duration, codec, resolution, bitrate, FPS
- **Audio**: ID3 tags, duration, bitrate, sample rate
- **Documents**: Page count, author, creation date, text content

### 3. API Endpoints ✅

All endpoints are available via tRPC under `ipAssets.*`:

#### GET `/files/:id/preview`
Get preview URL with size variant selection.

**Parameters:**
- `id` (string, required): Asset ID
- `size` (enum, optional): 'small' | 'medium' | 'large' | 'original' (default: 'medium')

**Response:**
```typescript
{
  url: string;           // Signed URL (expires in 15 minutes)
  size: string;          // Requested size
  width?: number;        // Preview width in pixels
  height?: number;       // Preview height in pixels
  expiresAt: string;     // ISO 8601 timestamp
}
```

**Usage:**
```typescript
const preview = await trpc.ipAssets.getPreview.useQuery({
  id: 'asset_123',
  size: 'medium',
});
```

---

#### GET `/files/:id/metadata`
Get extracted metadata for an asset with optional field filtering.

**Parameters:**
- `id` (string, required): Asset ID
- `fields` (array, optional): ['technical' | 'descriptive' | 'extracted' | 'processing' | 'all'] (default: ['all'])

**Response:**
```typescript
{
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
    thumbnailGenerated: boolean;
    thumbnailGeneratedAt?: string;
    previewGenerated: boolean;
    previewGeneratedAt?: string;
    metadataExtracted: boolean;
    metadataExtractedAt?: string;
  };
}
```

**Usage:**
```typescript
// Get all metadata
const metadata = await trpc.ipAssets.getMetadata.useQuery({
  id: 'asset_123',
});

// Get only technical metadata
const technical = await trpc.ipAssets.getMetadata.useQuery({
  id: 'asset_123',
  fields: ['technical'],
});
```

---

#### GET `/files/:id/variants`
List all available size variants and processed versions of a file.

**Parameters:**
- `id` (string, required): Asset ID
- `type` (enum, optional): 'thumbnail' | 'preview' | 'all' (default: 'all')

**Response:**
```typescript
{
  thumbnails: {
    small?: {
      url: string;
      size: 'small';
      width: number;
      height: number;
      expiresAt: string;
    };
    medium?: { /* same structure */ };
    large?: { /* same structure */ };
  };
  previews: {
    url?: string;
    expiresAt?: string;
    duration?: number;  // For video/audio previews
  };
  waveform?: {
    url?: string;
    expiresAt?: string;
  };
}
```

**Usage:**
```typescript
// Get all variants
const variants = await trpc.ipAssets.getVariants.useQuery({
  id: 'asset_123',
});

// Get only thumbnails
const thumbnails = await trpc.ipAssets.getVariants.useQuery({
  id: 'asset_123',
  type: 'thumbnail',
});
```

---

#### POST `/files/:id/regenerate-preview`
Trigger preview regeneration for an asset.

**Parameters:**
- `id` (string, required): Asset ID
- `types` (array, optional): ['thumbnail' | 'preview' | 'metadata' | 'all'] (default: ['all'])

**Response:**
```typescript
{
  jobId: string;
  status: 'queued' | 'processing';
  types: string[];
}
```

**Usage:**
```typescript
// Regenerate all previews
const job = await trpc.ipAssets.regeneratePreview.mutate({
  id: 'asset_123',
});

// Regenerate only thumbnails
const job = await trpc.ipAssets.regeneratePreview.mutate({
  id: 'asset_123',
  types: ['thumbnail'],
});
```

---

## Architecture

### Background Jobs

All preview generation is handled asynchronously through BullMQ jobs:

1. **Upload Confirmation** → Triggers job pipeline
2. **Metadata Extraction** (Priority: High) → Runs first
3. **Thumbnail Generation** (Priority: High) → Runs in parallel
4. **Preview Generation** (Priority: Medium) → Runs after thumbnails
5. **Database Update** → Updates `metadata` JSONB field

### Storage Structure

```
assets/{assetId}/
├── original.{ext}              # Original file
├── thumbnail_small.jpg         # 200x200 thumbnail
├── thumbnail_medium.jpg        # 400x400 thumbnail
├── thumbnail_large.jpg         # 800x800 thumbnail
├── preview.{ext}               # Preview (video clip, audio clip, or image)
└── waveform.png               # Audio waveform (audio only)
```

### Metadata Storage

All metadata is stored in the `ip_assets.metadata` JSONB column:

```json
{
  "type": "image|video|audio|document",
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "thumbnails": {
    "small": "https://storage.../thumbnail_small.jpg",
    "medium": "https://storage.../thumbnail_medium.jpg",
    "large": "https://storage.../thumbnail_large.jpg"
  },
  "thumbnailGenerated": true,
  "thumbnailGeneratedAt": "2025-10-11T...",
  "previewGenerated": true,
  "previewGeneratedAt": "2025-10-11T...",
  "processedAt": "2025-10-11T..."
}
```

## Security

- ✅ **Authentication Required**: All endpoints require valid session
- ✅ **Authorization**: Users can only access their own assets or assets they have permissions for (admins can access all)
- ✅ **Signed URLs**: All preview URLs are signed with 15-minute expiration
- ✅ **Rate Limiting**: Regeneration endpoint has rate limiting to prevent abuse

## Performance Considerations

### Caching
- Preview URLs are cached in Redis for 15 minutes (matching signed URL expiry)
- Metadata is cached for 1 hour
- Browser caching is enabled for static preview images

### Optimization
- Thumbnails use WebP format for modern browsers with JPEG fallback
- Progressive JPEG encoding for faster perceived load times
- MozJPEG optimization for better compression
- Lazy generation: Previews are only generated when first requested (or during upload)

### Scalability
- Background jobs prevent blocking API requests
- Job priorities ensure critical operations (thumbnails) complete first
- Configurable retry logic handles transient failures
- Job timeouts prevent hanging processes

## Error Handling

All endpoints return appropriate errors:

- `404 NOT_FOUND`: Asset doesn't exist
- `403 FORBIDDEN`: User lacks permission to access asset
- `400 BAD_REQUEST`: Invalid parameters
- `202 ACCEPTED`: Preview still generating (includes status URL)
- `500 INTERNAL_SERVER_ERROR`: Processing failure

## Examples

### React Component Example

```typescript
import { trpc } from '@/lib/trpc';

function AssetPreview({ assetId }: { assetId: string }) {
  // Get preview URL
  const { data: preview, isLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  // Get metadata
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'processing'],
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {preview && <img src={preview.url} alt="Preview" />}
      
      {metadata?.technical && (
        <div>
          <p>Dimensions: {metadata.technical.width} x {metadata.technical.height}</p>
          <p>Format: {metadata.technical.format}</p>
        </div>
      )}

      {!metadata?.processing?.thumbnailGenerated && (
        <p>Preview is being generated...</p>
      )}
    </div>
  );
}
```

### Regenerate Preview Example

```typescript
const regenerateMutation = trpc.ipAssets.regeneratePreview.useMutation();

async function handleRegenerate(assetId: string) {
  try {
    const result = await regenerateMutation.mutateAsync({
      id: assetId,
      types: ['thumbnail', 'preview'],
    });
    
    console.log(`Job ${result.jobId} queued for: ${result.types.join(', ')}`);
  } catch (error) {
    console.error('Failed to regenerate preview:', error);
  }
}
```

### Responsive Image Example

```typescript
function ResponsiveAssetImage({ assetId }: { assetId: string }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'thumbnail',
  });

  if (!variants?.thumbnails) return null;

  return (
    <picture>
      <source 
        media="(max-width: 400px)" 
        srcSet={variants.thumbnails.small?.url} 
      />
      <source 
        media="(max-width: 800px)" 
        srcSet={variants.thumbnails.medium?.url} 
      />
      <img 
        src={variants.thumbnails.large?.url} 
        alt="Asset preview"
        loading="lazy"
      />
    </picture>
  );
}
```

## Testing

### Manual Testing Steps

1. **Upload an asset** through the `initiateUpload` → `confirmUpload` flow
2. **Wait for processing** (check `metadata.thumbnailGenerated`)
3. **Request preview** using `getPreview` endpoint
4. **View metadata** using `getMetadata` endpoint
5. **List variants** using `getVariants` endpoint
6. **Regenerate** using `regeneratePreview` endpoint

### Test Files

Use the following test files for comprehensive testing:
- Images: JPEG, PNG, WebP, HEIC (various sizes and aspect ratios)
- Videos: MP4, MOV (various codecs and resolutions)
- Audio: MP3, WAV, FLAC (with and without ID3 tags)
- Documents: PDF (single/multi-page)

## Future Enhancements

### Planned Features
- [ ] Video preview clips (10-second samples)
- [ ] Document multi-page previews
- [ ] Advanced waveform analysis for audio
- [ ] AI-powered thumbnail selection (best frame)
- [ ] Format conversion on-demand
- [ ] Watermarking for preview images
- [ ] Preview quality presets (low/medium/high)

### Performance Improvements
- [ ] CDN integration for preview serving
- [ ] Image optimization pipeline (AVIF support)
- [ ] Distributed processing for large files
- [ ] Preview pre-warming for popular assets

## Related Documentation

- [IP Assets Module Overview](./overview.md)
- [Storage Infrastructure](../../infrastructure/storage/implementation.md)
- [Background Jobs](../../jobs/README.md)
- [Asset Processing Pipeline](../../../src/jobs/asset-processing-pipeline.ts)

---

**Status**: ✅ Production Ready  
**Last Updated**: October 11, 2025  
**Maintained By**: Backend Team
