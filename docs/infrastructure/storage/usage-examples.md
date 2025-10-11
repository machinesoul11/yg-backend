# R2 Storage Optimization - Usage Examples

## Table of Contents
1. [File Upload with Progress](#file-upload-with-progress)
2. [File Validation](#file-validation)
3. [Thumbnail Generation](#thumbnail-generation)
4. [CDN Cache Management](#cdn-cache-management)
5. [Error Handling](#error-handling)

---

## File Upload with Progress

### Basic Upload with Progress Callback

```typescript
import { storageProvider } from '@/lib/storage'
import { generateAssetKey } from '@/lib/utils/storage'

async function uploadAssetWithProgress(
  assetId: string,
  file: Buffer,
  filename: string,
  contentType: string,
  onProgress?: (progress: number) => void
) {
  const storageKey = generateAssetKey(assetId, filename)

  const result = await storageProvider.upload({
    key: storageKey,
    file,
    contentType,
    metadata: {
      assetId,
      originalFilename: filename,
    },
    progressCallback: (progress) => {
      console.log(`Upload progress: ${progress.percentComplete.toFixed(1)}%`)
      if (onProgress) {
        onProgress(progress.percentComplete)
      }
    },
  })

  return result
}
```

### Upload Large File with Automatic Multipart

Large files (>100MB) automatically use multipart uploads with concurrent processing:

```typescript
const largeFile = Buffer.from(/* large file data */)

const result = await storageProvider.upload({
  key: 'assets/large-video.mp4',
  file: largeFile,
  contentType: 'video/mp4',
  progressCallback: (progress) => {
    const {
      bytesTransferred,
      totalBytes,
      percentComplete,
    } = progress
    
    console.log(`Uploaded: ${bytesTransferred} / ${totalBytes} bytes`)
    console.log(`Progress: ${percentComplete.toFixed(2)}%`)
  },
})

console.log('Upload complete:', result.url)
```

---

## File Validation

### Validate Before Upload

```typescript
import { validateFile } from '@/lib/storage/file-validator'
import { storageConfig } from '@/lib/config/storage'

async function validateAndUpload(
  file: Buffer,
  filename: string,
  declaredMimeType: string
) {
  // Validate file
  const validation = await validateFile({
    buffer: file,
    filename,
    declaredMimeType,
    allowedTypes: storageConfig.allowedTypes,
  })

  if (!validation.isValid) {
    throw new Error(`File validation failed: ${validation.errors.join(', ')}`)
  }

  // Show warnings if any
  if (validation.warnings && validation.warnings.length > 0) {
    console.warn('Validation warnings:', validation.warnings)
  }

  // Use detected MIME type if different from declared
  const mimeType = validation.detectedMimeType || declaredMimeType

  // Proceed with upload
  const result = await storageProvider.upload({
    key: generateAssetKey(assetId, filename),
    file,
    contentType: mimeType,
  })

  return result
}
```

### Validate File Type Only

```typescript
import { validateFile } from '@/lib/storage/file-validator'

const validation = await validateFile({
  buffer: fileBuffer,
  filename: 'image.jpg',
  declaredMimeType: 'image/jpeg',
  allowedTypes: ['image/jpeg', 'image/png'],
})

if (!validation.isValid) {
  console.error('Validation errors:', validation.errors)
} else {
  console.log('File is valid')
  console.log('Detected type:', validation.detectedMimeType)
}
```

---

## Thumbnail Generation

### Generate Single Thumbnail

```typescript
import { generateThumbnail } from '@/lib/storage/thumbnail-generator'

const thumbnail = await generateThumbnail(imageBuffer, {
  size: 'medium', // 'small' | 'medium' | 'large'
  quality: 85,
  fit: 'inside',
  format: 'jpeg',
})

console.log(`Thumbnail: ${thumbnail.width}x${thumbnail.height}`)
console.log(`Size: ${(thumbnail.size / 1024).toFixed(2)}KB`)
```

### Generate All Thumbnail Variants

```typescript
import {
  generateThumbnailVariants,
  getThumbnailContentType,
} from '@/lib/storage/thumbnail-generator'
import { generateThumbnailKey } from '@/lib/utils/storage'

async function generateAndUploadThumbnails(
  assetId: string,
  sourceBuffer: Buffer
) {
  // Generate all variants
  const variants = await generateThumbnailVariants(sourceBuffer)

  const thumbnailUrls: Record<string, string> = {}

  // Upload each variant
  for (const [size, thumbnail] of Object.entries(variants)) {
    const key = generateThumbnailKey(assetId, size)
    const contentType = getThumbnailContentType(thumbnail.format)

    const { url } = await storageProvider.upload({
      key,
      file: thumbnail.buffer,
      contentType,
      metadata: { assetId, variant: size },
    })

    thumbnailUrls[size] = url
  }

  return thumbnailUrls
}
```

### Extract Image Metadata

```typescript
import { extractImageMetadata } from '@/lib/storage/thumbnail-generator'

const metadata = await extractImageMetadata(imageBuffer)

console.log(`Dimensions: ${metadata.width}x${metadata.height}`)
console.log(`Format: ${metadata.format}`)
console.log(`Color space: ${metadata.space}`)
console.log(`Has alpha: ${metadata.hasAlpha}`)

if (metadata.exif) {
  console.log('EXIF data:', metadata.exif)
}
```

---

## CDN Cache Management

### Purge Asset Cache After Update

```typescript
import { purgeAssetCache } from '@/lib/storage/cdn-cache'

async function updateAssetAndPurgeCache(assetId: string) {
  // Update asset...
  
  // Purge CDN cache for all variants
  const result = await purgeAssetCache(assetId)
  
  if (result.success) {
    console.log(`Purged ${result.purged} cache entries`)
  } else {
    console.error('Cache purge failed:', result.errors)
  }
}
```

### Warm Cache After Thumbnail Generation

```typescript
import { warmAssetCache } from '@/lib/storage/cdn-cache'

async function generateThumbnailsAndWarmCache(assetId: string) {
  // Generate thumbnails...
  
  // Warm CDN cache
  const result = await warmAssetCache(assetId)
  
  console.log(`Warmed ${result.warmed} URLs`)
  if (result.failed > 0) {
    console.warn(`Failed to warm ${result.failed} URLs`)
  }
}
```

### Check Cache Status

```typescript
import { getCacheStatus } from '@/lib/storage/cdn-cache'

const status = await getCacheStatus(
  'https://assets.yesgoddess.com/assets/123/thumbnail_small.jpg'
)

console.log('Cached:', status.cached)
console.log('CF Cache Status:', status.cfCacheStatus) // HIT, MISS, EXPIRED, etc.
if (status.age) {
  console.log(`Cache age: ${status.age} seconds`)
}
```

### Purge Specific Files

```typescript
import { purgeCDNCache } from '@/lib/storage/cdn-cache'

const result = await purgeCDNCache({
  files: [
    'https://assets.yesgoddess.com/assets/123/original.jpg',
    'https://assets.yesgoddess.com/assets/123/thumbnail_medium.jpg',
  ],
})

if (result.success) {
  console.log('Cache purged successfully')
}
```

---

## Error Handling

### Handling Upload Errors with Retry

The retry logic is automatic, but you can catch final errors:

```typescript
import { StorageError, StorageErrorCode } from '@/lib/storage'

try {
  const result = await storageProvider.upload({
    key: 'assets/image.jpg',
    file: buffer,
    contentType: 'image/jpeg',
  })
} catch (error) {
  if (error instanceof StorageError) {
    switch (error.code) {
      case StorageErrorCode.FILE_TOO_LARGE:
        console.error('File exceeds maximum size')
        break
      case StorageErrorCode.INVALID_FILE_TYPE:
        console.error('File type not allowed')
        break
      case StorageErrorCode.NETWORK_ERROR:
        console.error('Network error, will retry automatically')
        break
      case StorageErrorCode.TIMEOUT:
        console.error('Upload timed out')
        break
      case StorageErrorCode.RATE_LIMITED:
        console.error('Rate limited, will retry with backoff')
        break
      default:
        console.error('Upload failed:', error.message)
    }
  }
}
```

### Handling Validation Errors

```typescript
import { validateFile } from '@/lib/storage/file-validator'

const validation = await validateFile({
  buffer: file,
  filename: 'document.pdf',
  declaredMimeType: 'application/pdf',
  allowedTypes: storageConfig.allowedTypes,
})

if (!validation.isValid) {
  // Handle validation errors
  for (const error of validation.errors) {
    console.error('Validation error:', error)
  }
  
  // Possible errors:
  // - "File type application/pdf is not allowed"
  // - "File signature mismatch: declared X but detected Y"
  // - "Files with executable content are not allowed"
  // - "SVG files with embedded scripts are not allowed"
  
  throw new Error('File validation failed')
}

// Handle warnings (non-fatal)
if (validation.warnings && validation.warnings.length > 0) {
  for (const warning of validation.warnings) {
    console.warn('Validation warning:', warning)
  }
}
```

### Handling Thumbnail Generation Errors

```typescript
import {
  generateThumbnail,
  validateImage,
} from '@/lib/storage/thumbnail-generator'

// Validate image first
const imageValidation = await validateImage(buffer)

if (!imageValidation.isValid) {
  console.error('Invalid image:', imageValidation.error)
  return
}

// Generate thumbnail with error handling
try {
  const thumbnail = await generateThumbnail(buffer, {
    size: 'large',
    quality: 90,
  })
} catch (error) {
  console.error('Thumbnail generation failed:', error)
  // Possible errors:
  // - "Invalid image"
  // - "Image dimensions too small"
  // - "Image dimensions too large"
  // - "Failed to generate thumbnail: [Sharp error]"
}
```

---

## Advanced Usage

### Custom Retry Configuration

```typescript
import { R2StorageProvider } from '@/lib/storage/providers/r2'

// Create provider with custom retry config
const provider = new R2StorageProvider({
  accountId: process.env.R2_ACCOUNT_ID!,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  bucketName: process.env.STORAGE_BUCKET_ASSETS!,
})

// Upload will use custom retry configuration from environment variables
const result = await provider.upload({
  key: 'assets/file.jpg',
  file: buffer,
  contentType: 'image/jpeg',
})
```

### Monitor Upload Performance

```typescript
async function uploadWithMetrics(file: Buffer, key: string) {
  const startTime = Date.now()
  let progressUpdates = 0
  
  const result = await storageProvider.upload({
    key,
    file,
    contentType: 'image/jpeg',
    progressCallback: (progress) => {
      progressUpdates++
      console.log({
        percent: progress.percentComplete.toFixed(2),
        bytes: progress.bytesTransferred,
        total: progress.totalBytes,
      })
    },
  })
  
  const duration = Date.now() - startTime
  const throughput = (file.length / duration) * 1000 // bytes per second
  
  console.log({
    duration: `${duration}ms`,
    throughput: `${(throughput / 1024 / 1024).toFixed(2)} MB/s`,
    progressUpdates,
    fileSize: `${(file.length / 1024 / 1024).toFixed(2)} MB`,
  })
  
  return result
}
```

---

## Configuration Tips

### Optimize for Your Use Case

**High-quality images (photography)**:
```typescript
const thumbnail = await generateThumbnail(buffer, {
  size: 'large',
  quality: 92,
  format: 'jpeg',
})
```

**Web thumbnails (fast loading)**:
```typescript
const thumbnail = await generateThumbnail(buffer, {
  size: 'small',
  quality: 80,
  format: 'webp',
})
```

**Preserve transparency**:
```typescript
const thumbnail = await generateThumbnail(buffer, {
  size: 'medium',
  quality: 85,
  format: 'png',
})
```

---

**Last Updated**: December 2024  
**Maintained By**: YES GODDESS Backend Team
