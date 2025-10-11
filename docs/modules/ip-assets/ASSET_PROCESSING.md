# Asset Processing System - Complete Implementation

## Overview

The YesGoddess asset processing system provides comprehensive file processing capabilities for all uploaded assets including images, videos, audio, and documents. The system is designed as a pipeline of background jobs that run asynchronously to avoid blocking API responses.

## Architecture

### Processing Pipeline

```
Upload Confirmation
       ↓
1. Virus Scan (Priority: Critical)
       ↓
2. Thumbnail Generation (Priority: High)
       ↓
3. Metadata Extraction (Priority: High)
       ↓
4. Preview Generation (Priority: Medium) [Optional]
       ↓
5. Format Conversion (Priority: Low) [Optional]
       ↓
6. Watermarking (Priority: Low) [On-Demand]
```

### Technology Stack

- **Image Processing**: Sharp (thumbnails, format conversion, watermarking)
- **Video Processing**: FFmpeg via fluent-ffmpeg (thumbnails, previews, metadata, conversion)
- **Audio Processing**: FFmpeg + music-metadata (waveforms, metadata, conversion)
- **Document Processing**: pdf-parse (metadata, text extraction)
- **Job Queue**: BullMQ with Redis
- **Storage**: Cloudflare R2 via storage adapter

## Services

### Video Processor (`video-processor.service.ts`)

**Capabilities:**
- Extract video thumbnails at specific timestamps
- Generate multiple thumbnail sizes
- Create preview clips (10-second samples)
- Extract comprehensive metadata (codec, duration, resolution, bitrate, FPS)
- Convert videos to web-optimized formats (MP4, WebM)
- Generate adaptive bitrate variants

**Example:**
```typescript
import { processVideo, extractVideoMetadata } from '@/lib/services/asset-processing';

// Full video processing
const result = await processVideo(videoBuffer, {
  generateThumbnails: true,
  generatePreview: true,
  extractMetadata: true,
});

// Metadata only
const metadata = await extractVideoMetadata('/path/to/video.mp4');
```

### Audio Processor (`audio-processor.service.ts`)

**Capabilities:**
- Generate waveform visualizations
- Extract ID3 tags (artist, album, title, genre)
- Extract technical metadata (duration, bitrate, sample rate, codec)
- Generate preview clips (30-second samples)
- Convert audio formats (MP3, AAC, OGG)
- Generate multiple quality variants

**Example:**
```typescript
import { processAudio, extractAudioMetadata } from '@/lib/services/asset-processing';

// Full audio processing
const result = await processAudio(audioBuffer, {
  extractMetadata: true,
  generateWaveform: true,
  generatePreview: false,
});

// Waveform only
const waveform = await generateWaveform(audioBuffer, {
  width: 1800,
  height: 280,
});
```

### Document Processor (`document-processor.service.ts`)

**Capabilities:**
- Extract PDF metadata (page count, author, title, dates)
- Extract text content for search indexing
- Generate document thumbnails/previews
- Validate PDF structure

**Example:**
```typescript
import { processDocument, extractDocumentText } from '@/lib/services/asset-processing';

// Full document processing
const result = await processDocument(pdfBuffer, {
  extractText: true,
  generateThumbnails: true,
  extractMetadata: true,
  maxTextLength: 100000,
});

// Text extraction only
const text = await extractDocumentText(pdfBuffer);
```

### Watermarking Service (`watermark.service.ts`)

**Capabilities:**
- Apply text watermarks to images and videos
- Apply logo watermarks with configurable positioning
- Tiled watermarks for comprehensive coverage
- Invisible watermarks (EXIF metadata embedding)
- Forensic watermarks (user/session tracking)
- Dynamic video watermarks (moving position)

**Example:**
```typescript
import { applyAssetWatermark, generateForensicWatermark } from '@/lib/services/asset-processing';

// Apply watermark
const watermarked = await applyAssetWatermark(imageBuffer, 'image', {
  enabled: true,
  type: 'both',
  text: '© YesGoddess',
  logoBuffer: logoImage,
  position: 'bottom-right',
  opacity: 0.7,
  userId: 'user_123',
  sessionId: 'session_456',
});
```

### Format Conversion Service (`format-conversion.service.ts`)

**Capabilities:**
- Convert images to JPEG, PNG, WebP, AVIF, TIFF
- Generate responsive image variants (multiple sizes)
- Convert videos to MP4, WebM
- Generate adaptive bitrate video variants
- Convert audio to MP3, AAC, OGG
- Generate multiple audio quality levels
- Web optimization for all formats

**Example:**
```typescript
import { convertImage, generateResponsiveImageVariants } from '@/lib/services/asset-processing';

// Convert to WebP
const webp = await convertImage(imageBuffer, {
  format: 'webp',
  quality: 85,
  effort: 4,
});

// Generate responsive sizes
const variants = await generateResponsiveImageVariants(imageBuffer, [400, 800, 1200, 1920]);
```

## Background Jobs

### 1. Thumbnail Generation (`asset-thumbnail-generation.job.ts`)

**Priority**: High  
**Runs**: After virus scan  
**Supported Types**: IMAGE, VIDEO, DOCUMENT  

Generates small (200x200), medium (400x400), and large (800x800) thumbnail variants.

- **Images**: Uses Sharp for fast resizing
- **Videos**: Extracts frame at 10% position using FFmpeg
- **Documents**: Generates placeholder with document info

### 2. Metadata Extraction (`asset-metadata-extraction.job.ts`)

**Priority**: High  
**Runs**: After virus scan  
**Supported Types**: All  

Extracts comprehensive metadata:
- **Images**: EXIF data, dimensions, color space
- **Videos**: Duration, codec, resolution, bitrate, FPS
- **Audio**: ID3 tags, duration, bitrate, generates waveform
- **Documents**: Page count, author, text content

### 3. Preview Generation (`asset-preview-generation.job.ts`)

**Priority**: Medium  
**Runs**: After thumbnail generation (optional)  
**Supported Types**: VIDEO, AUDIO  

Generates preview clips:
- **Videos**: 10-second clip at 720p
- **Audio**: 30-second clip at 128kbps MP3

### 4. Format Conversion (`asset-format-conversion.job.ts`)

**Priority**: Low  
**Runs**: After main processing (optional)  
**Supported Types**: IMAGE, VIDEO, AUDIO  

Generates optimized variants:
- **Images**: WebP, AVIF, responsive sizes
- **Videos**: Multiple quality levels (720p, 480p)
- **Audio**: Multiple bitrate variants (320k, 192k, 128k)

### 5. Watermarking (`asset-watermarking.job.ts`)

**Priority**: Low  
**Runs**: On-demand only  
**Supported Types**: IMAGE, VIDEO  

Applies watermarks based on configuration:
- Text watermarks with shadow effects
- Logo watermarks with positioning
- Invisible forensic watermarks

## Job Orchestration

### Asset Processing Pipeline (`asset-processing-pipeline.ts`)

Central orchestrator that manages the complete processing workflow:

```typescript
import { enqueueAssetProcessing, getDefaultProcessingConfig } from '@/jobs/asset-processing-pipeline';

// Enqueue with default config
const config = getDefaultProcessingConfig('IMAGE');
const result = await enqueueAssetProcessing(assetId, storageKey, 'IMAGE', mimeType, config);

// Custom config
const customResult = await enqueueAssetProcessing(assetId, storageKey, 'VIDEO', mimeType, {
  enableThumbnailGeneration: true,
  enableMetadataExtraction: true,
  enablePreviewGeneration: true,
  enableFormatConversion: false,
  enableWatermarking: false,
});
```

## Queue Configuration

### Priority Levels

1. **Critical (1)**: Virus scanning
2. **High (2)**: Thumbnails, metadata
3. **Medium (5)**: Previews
4. **Low (8)**: Format conversion
5. **Lowest (9)**: Watermarking

### Retry Strategies

- **Thumbnails/Metadata**: 3 attempts, 5s exponential backoff
- **Previews**: 2 attempts, 10s exponential backoff
- **Conversion**: 2 attempts, 30s exponential backoff
- **Watermarking**: 2 attempts, 10s exponential backoff

### Job Retention

- **Completed**: Keep last 50-100 jobs for monitoring
- **Failed**: Keep last 200-500 jobs for debugging

## Error Handling

All processing jobs implement comprehensive error handling:

1. **Capture errors** with full context (assetId, stage, message)
2. **Update database** with error information in metadata field
3. **Log to job queue** for monitoring and alerting
4. **Graceful degradation**: Non-critical failures don't block asset approval

Example error metadata structure:
```json
{
  "thumbnailGenerated": false,
  "thumbnailError": "Failed to extract video frame: Invalid codec",
  "thumbnailLastAttempt": "2025-10-11T10:30:00Z"
}
```

## Monitoring

### Key Metrics

- Processing success rate per job type
- Average processing time per asset type
- Queue depth and wait times
- Failure types and frequencies
- Storage usage for variants

### Health Checks

- Worker availability and health
- Queue connectivity
- FFmpeg/Sharp availability
- Storage adapter connectivity

## Usage Examples

### Complete Asset Upload Flow

```typescript
// 1. User uploads file → gets signed URL
const { uploadUrl, assetId } = await trpc.ipAssets.initiateUpload.mutate({
  fileName: 'video.mp4',
  fileSize: 50000000,
  mimeType: 'video/mp4',
});

// 2. Frontend uploads to storage
await fetch(uploadUrl, { method: 'PUT', body: file });

// 3. Confirm upload → triggers processing
await trpc.ipAssets.confirmUpload.mutate({ assetId, title: 'My Video' });

// Behind the scenes:
// - Virus scan runs
// - If clean, processing pipeline starts:
//   - Thumbnail generation (frame extraction)
//   - Metadata extraction (duration, codec, resolution)
//   - Preview generation (10-second clip)
//   - Format conversion (optional)
```

### Custom Processing Configuration

```typescript
// High-quality image with all features
const imageConfig = {
  enableThumbnailGeneration: true,
  enableMetadataExtraction: true,
  enableFormatConversion: true,
  formatConversion: {
    generateWebP: true,
    generateAVIF: true,
    generateResponsiveSizes: true,
  },
  enableWatermarking: true,
  watermark: {
    type: 'logo',
    logoStorageKey: 'logos/brand-watermark.png',
    position: 'bottom-right',
    opacity: 0.6,
  },
};

await enqueueAssetProcessing(assetId, storageKey, 'IMAGE', mimeType, imageConfig);
```

### Monitoring Processing Status

```typescript
import { getAssetProcessingStatus } from '@/jobs/asset-processing-pipeline';

const status = await getAssetProcessingStatus(assetId);
// Returns:
// {
//   thumbnail: 'completed',
//   metadata: 'completed',
//   preview: 'processing',
//   formatConversion: 'pending',
//   watermarking: 'not-enabled',
//   overall: 'processing'
// }
```

## Storage Structure

Processed assets are stored with organized keys:

```
{env}/{brand}/{project}/{type}/{year}/{month}/
  └─ {assetId}_original.mp4           # Original file
  └─ {assetId}_thumb_small.jpg        # 200x200 thumbnail
  └─ {assetId}_thumb_medium.jpg       # 400x400 thumbnail
  └─ {assetId}_thumb_large.jpg        # 800x800 thumbnail
  └─ {assetId}_preview.mp4            # 10s preview clip
  └─ {assetId}_waveform.png           # Audio waveform
  └─ {assetId}_watermarked.mp4        # Watermarked version
  └─ {assetId}_400w.jpg               # Responsive variant
  └─ {assetId}_800w.jpg               # Responsive variant
  └─ {assetId}.webp                   # WebP format
  └─ {assetId}_720p.mp4               # 720p video variant
  └─ {assetId}_high.mp3               # High quality audio
```

## Database Schema

Asset metadata is stored in the `metadata` JSONB field:

```json
{
  "fileSize": 50000000,
  "width": 1920,
  "height": 1080,
  "duration": 120.5,
  "codec": "h264",
  "bitrate": 5000000,
  "fps": 30,
  "thumbnailGenerated": true,
  "thumbnailGeneratedAt": "2025-10-11T10:00:00Z",
  "thumbnails": {
    "small": "https://...",
    "medium": "https://...",
    "large": "https://..."
  },
  "previewGenerated": true,
  "previewUrl": "https://...",
  "formatConversion": {
    "completed": true,
    "variantsGenerated": 5,
    "variants": {
      "webp": "https://...",
      "size_400w": "https://...",
      "720p": "https://..."
    }
  },
  "watermark": {
    "applied": true,
    "type": "logo",
    "watermarkedUrl": "https://..."
  }
}
```

## Performance Considerations

### Resource Usage

- **Images**: Low CPU, fast processing (< 5s)
- **Videos**: High CPU, slower processing (30s - 5min)
- **Audio**: Medium CPU, moderate processing (10-30s)
- **Documents**: Low CPU, fast processing (< 10s)

### Optimization Strategies

1. **Concurrency Limits**: 
   - Images: 10-20 concurrent jobs
   - Videos: 2-5 concurrent jobs
   - Audio: 5-10 concurrent jobs

2. **Timeouts**:
   - Thumbnails: 30 seconds
   - Metadata: 60 seconds
   - Previews: 5 minutes
   - Conversion: 10 minutes

3. **Lazy Processing**: Format conversion and watermarking only run when explicitly enabled

4. **Progressive Enhancement**: Critical processing (thumbnails, metadata) completes quickly; optional processing runs in background

## Security

### Watermarking

- **Visible watermarks**: Deter unauthorized use
- **Invisible watermarks**: Enable forensic tracking
- **Forensic identifiers**: Link downloads to users/sessions
- **Metadata embedding**: Store watermark info in EXIF

### File Validation

- Magic number verification before processing
- MIME type validation
- File size limits
- Malformed file detection

## Future Enhancements

### Phase 1
- [ ] Scene detection for intelligent video thumbnail selection
- [ ] AI-powered content analysis and auto-tagging
- [ ] Advanced audio fingerprinting for duplicate detection
- [ ] PDF rendering for multi-page previews

### Phase 2
- [ ] Real-time progress tracking via WebSocket
- [ ] Batch processing for multiple assets
- [ ] Priority processing for premium users
- [ ] Machine learning-based quality optimization

### Phase 3
- [ ] Blockchain-based asset verification
- [ ] Decentralized storage integration (IPFS)
- [ ] Advanced video transcoding (HLS/DASH)
- [ ] Real-time collaborative editing

## Troubleshooting

### Common Issues

**Thumbnail generation fails for videos:**
- Check FFmpeg installation and path configuration
- Verify video codec is supported
- Check for corrupted video files

**Metadata extraction fails:**
- Ensure file is not corrupted
- Check file size is within limits
- Verify dependencies (Sharp, FFmpeg, pdf-parse) are installed

**Format conversion timeouts:**
- Increase job timeout configuration
- Reduce target quality/resolution
- Check server resources (CPU, memory)

### Debug Mode

Enable detailed logging:
```typescript
job.log('Debug info: ...'); // Logs appear in BullMQ job logs
```

Monitor job progress in Redis:
```bash
redis-cli
> KEYS bull:asset-thumbnail-generation:*
> HGETALL bull:asset-thumbnail-generation:job-id
```

## Support

For issues or questions:
- Check job logs in BullMQ dashboard
- Review error metadata in database
- Contact platform team for infrastructure issues
- See main documentation in `/docs/modules/ip-assets/`

---

**Status**: ✅ Complete and production-ready  
**Version**: 1.0.0  
**Last Updated**: October 11, 2025
