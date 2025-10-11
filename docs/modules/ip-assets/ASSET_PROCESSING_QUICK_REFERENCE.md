# Asset Processing - Quick Reference

## Quick Start

### Basic Usage

```typescript
import { enqueueAssetProcessing, getDefaultProcessingConfig } from '@/jobs/asset-processing-pipeline';

// After file upload confirmation
const config = getDefaultProcessingConfig(assetType);
await enqueueAssetProcessing(assetId, storageKey, assetType, mimeType, config);
```

### Configuration by Asset Type

**Images:**
```typescript
{
  enableThumbnailGeneration: true,   // ✓
  enableMetadataExtraction: true,     // ✓
  enableFormatConversion: true,       // ✓ WebP + responsive sizes
  enableWatermarking: false,          // On-demand only
}
```

**Videos:**
```typescript
{
  enableThumbnailGeneration: true,   // ✓ Frame extraction
  enableMetadataExtraction: true,     // ✓ Full video metadata
  enablePreviewGeneration: true,      // ✓ 10-second clip
  enableFormatConversion: false,      // Optional (expensive)
}
```

**Audio:**
```typescript
{
  enableThumbnailGeneration: false,  // N/A
  enableMetadataExtraction: true,     // ✓ ID3 tags + waveform
  enablePreviewGeneration: true,      // ✓ 30-second clip
  enableFormatConversion: true,       // ✓ Multiple quality levels
}
```

**Documents:**
```typescript
{
  enableThumbnailGeneration: true,   // ✓ Placeholder
  enableMetadataExtraction: true,     // ✓ Metadata + text extraction
  enableFormatConversion: false,      // N/A
}
```

## Direct Service Usage

### Video Processing

```typescript
import {
  processVideo,
  extractVideoMetadata,
  extractVideoThumbnail,
  generateVideoPreview,
} from '@/lib/services/asset-processing';

// Complete processing
const result = await processVideo(buffer, {
  generateThumbnails: true,
  generatePreview: true,
  extractMetadata: true,
});

// Thumbnail only
const thumbnail = await extractVideoThumbnail(buffer, '10%');

// Preview clip
const preview = await generateVideoPreview(buffer, {
  duration: 10,
  resolution: '1280x720',
});
```

### Audio Processing

```typescript
import {
  processAudio,
  extractAudioMetadata,
  generateWaveform,
} from '@/lib/services/asset-processing';

// Complete processing
const result = await processAudio(buffer, {
  extractMetadata: true,
  generateWaveform: true,
  generatePreview: false,
});

// Waveform only
const waveform = await generateWaveform(buffer, {
  width: 1800,
  height: 280,
});
```

### Document Processing

```typescript
import {
  processDocument,
  extractDocumentMetadata,
  extractDocumentText,
} from '@/lib/services/asset-processing';

// Complete processing
const result = await processDocument(buffer, {
  extractText: true,
  generateThumbnails: true,
  extractMetadata: true,
});

// Text extraction only
const text = await extractDocumentText(buffer, {
  maxLength: 100000,
});
```

### Watermarking

```typescript
import {
  applyAssetWatermark,
  applyTextWatermarkToImage,
  applyLogoWatermarkToImage,
} from '@/lib/services/asset-processing';

// Complete watermark application
const watermarked = await applyAssetWatermark(buffer, 'image', {
  enabled: true,
  type: 'both',
  text: '© YesGoddess',
  logoBuffer,
  position: 'bottom-right',
  opacity: 0.7,
});

// Text watermark only
const withText = await applyTextWatermarkToImage(buffer, {
  text: '© 2025 YesGoddess',
  position: 'bottom-right',
  opacity: 0.7,
});
```

### Format Conversion

```typescript
import {
  convertImage,
  generateResponsiveImageVariants,
  convertVideo,
  convertAudio,
} from '@/lib/services/asset-processing';

// Image to WebP
const webp = await convertImage(buffer, {
  format: 'webp',
  quality: 85,
});

// Responsive variants
const variants = await generateResponsiveImageVariants(buffer, [400, 800, 1200]);

// Video optimization
const optimized = await convertVideo(buffer, {
  format: 'mp4',
  bitrate: '2000k',
  preset: 'fast',
});
```

## Job Enqueuing

### Manual Job Enqueuing

```typescript
import { assetProcessingQueues } from '@/jobs/asset-processing-pipeline';

// Thumbnail job
await assetProcessingQueues.thumbnail.add('thumb-123', {
  assetId: 'asset_123',
  storageKey: 'path/to/file.jpg',
  type: 'IMAGE',
  mimeType: 'image/jpeg',
}, { priority: 2 });

// Watermark job (on-demand)
await assetProcessingQueues.watermarking.add('watermark-123', {
  assetId: 'asset_123',
  storageKey: 'path/to/file.jpg',
  type: 'IMAGE',
  mimeType: 'image/jpeg',
  watermarkConfig: {
    enabled: true,
    type: 'logo',
    logoStorageKey: 'logos/brand.png',
    position: 'bottom-right',
    opacity: 0.7,
  },
});
```

## Metadata Structure

### Database Storage

```typescript
// ip_assets.metadata JSONB field
{
  // File info
  fileSize: 50000000,
  declaredMimeType: 'video/mp4',
  detectedMimeType: 'video/mp4',
  
  // Processing status
  thumbnailGenerated: true,
  thumbnailGeneratedAt: '2025-10-11T10:00:00Z',
  
  // Thumbnails
  thumbnails: {
    small: 'https://cdn.../thumb_small.jpg',
    medium: 'https://cdn.../thumb_medium.jpg',
    large: 'https://cdn.../thumb_large.jpg',
  },
  
  // Type-specific metadata
  width: 1920,
  height: 1080,
  duration: 120.5,
  codec: 'h264',
  bitrate: 5000000,
  fps: 30,
  
  // Preview
  previewGenerated: true,
  previewUrl: 'https://cdn.../preview.mp4',
  
  // Format conversion
  formatConversion: {
    completed: true,
    variantsGenerated: 5,
    variants: {
      webp: 'https://cdn.../file.webp',
      size_400w: 'https://cdn.../file_400w.jpg',
    },
  },
  
  // Watermark
  watermark: {
    applied: true,
    type: 'logo',
    watermarkedUrl: 'https://cdn.../watermarked.jpg',
  },
}
```

## Monitoring

### Check Processing Status

```typescript
import { getAssetProcessingStatus } from '@/jobs/asset-processing-pipeline';

const status = await getAssetProcessingStatus(assetId);
console.log(status);
// {
//   thumbnail: 'completed',
//   metadata: 'completed',
//   preview: 'processing',
//   formatConversion: 'pending',
//   watermarking: 'not-enabled',
//   overall: 'processing'
// }
```

### Retry Failed Processing

```typescript
import { retryAssetProcessing } from '@/jobs/asset-processing-pipeline';

await retryAssetProcessing(assetId, ['thumbnail', 'metadata']);
```

### Cancel Pending Jobs

```typescript
import { cancelAssetProcessing } from '@/jobs/asset-processing-pipeline';

await cancelAssetProcessing(assetId);
```

## Error Handling

### Job-Level Errors

```typescript
// Jobs automatically update metadata on failure
{
  thumbnailGenerated: false,
  thumbnailError: 'Failed to extract video frame: Unsupported codec',
  thumbnailLastAttempt: '2025-10-11T10:30:00Z',
}
```

### Service-Level Errors

```typescript
try {
  const result = await processVideo(buffer, options);
} catch (error) {
  if (error.message.includes('Invalid codec')) {
    // Handle unsupported format
  } else if (error.message.includes('timeout')) {
    // Handle timeout
  } else {
    // Generic error handling
  }
}
```

## Performance Tips

### Concurrency

```typescript
// Process multiple assets in parallel
await Promise.all([
  processImage(buffer1),
  processImage(buffer2),
  processImage(buffer3),
]);

// But limit video processing
for (const buffer of videoBuffers) {
  await processVideo(buffer); // Sequential
}
```

### Resource Management

```typescript
// For large files, stream instead of loading into memory
const tmpPath = '/tmp/large-video.mp4';
fs.writeFileSync(tmpPath, buffer);
const metadata = await extractVideoMetadata(tmpPath);
fs.unlinkSync(tmpPath);
```

### Optimization

```typescript
// Skip optional processing for faster uploads
const fastConfig = {
  enableThumbnailGeneration: true,
  enableMetadataExtraction: true,
  enablePreviewGeneration: false,  // Skip
  enableFormatConversion: false,   // Skip
  enableWatermarking: false,       // Skip
};
```

## Common Patterns

### Upload Flow Integration

```typescript
// In confirmUpload handler
const asset = await prisma.ipAsset.update({
  where: { id: assetId },
  data: { status: 'PROCESSING' },
});

// Enqueue processing
const config = getDefaultProcessingConfig(asset.type);
await enqueueAssetProcessing(
  asset.id,
  asset.storageKey,
  asset.type,
  asset.mimeType,
  config
);

return asset;
```

### Conditional Watermarking

```typescript
// Only watermark for specific licenses
if (license.requiresWatermark) {
  await assetProcessingQueues.watermarking.add(`wm-${assetId}`, {
    assetId,
    storageKey,
    type,
    mimeType,
    watermarkConfig: {
      enabled: true,
      type: 'logo',
      logoStorageKey: brand.watermarkLogoKey,
      position: 'bottom-right',
      opacity: 0.6,
      forensic: true,
      userId: license.licenseeId,
      sessionId: session.id,
    },
  });
}
```

### Progressive Enhancement

```typescript
// 1. Critical processing (blocks approval)
await enqueueAssetProcessing(assetId, storageKey, type, mimeType, {
  enableThumbnailGeneration: true,
  enableMetadataExtraction: true,
});

// 2. Optional processing (background)
setTimeout(() => {
  enqueueAssetProcessing(assetId, storageKey, type, mimeType, {
    enablePreviewGeneration: true,
    enableFormatConversion: true,
  });
}, 5000);
```

## Troubleshooting

### Debug Logging

```typescript
// Jobs automatically log to BullMQ
job.log('Processing started');
job.log(`Extracted ${thumbnails.length} thumbnails`);
job.log('Processing completed');

// View in Redis
redis-cli
> KEYS bull:asset-thumbnail-generation:*
> HGETALL bull:asset-thumbnail-generation:{job-id}
```

### Common Issues

**Issue**: Thumbnail generation fails  
**Fix**: Check FFmpeg installation, verify codec support

**Issue**: Metadata extraction timeouts  
**Fix**: Increase job timeout, check file size limits

**Issue**: Format conversion produces large files  
**Fix**: Reduce quality/bitrate settings, use faster presets

**Issue**: Watermark not visible  
**Fix**: Increase opacity, check logo file, verify positioning

---

**Quick Links:**
- [Full Documentation](./ASSET_PROCESSING.md)
- [Service Layer](/src/lib/services/asset-processing/)
- [Job Definitions](/src/jobs/)
- [Queue Configuration](/src/jobs/asset-processing-pipeline.ts)
