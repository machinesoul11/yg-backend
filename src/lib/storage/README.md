# Storage Layer

The storage layer provides a unified interface for file storage operations across multiple providers (currently R2, with Azure Blob Storage support planned).

## Architecture

```
BaseStorageProvider (abstract)
├── Common validation logic
├── Error handling patterns  
├── Retry logic with circuit breaker
├── Progress tracking
└── Logging and metrics

R2StorageProvider (extends BaseStorageProvider)
├── S3-compatible API implementation
└── Provider-specific optimizations

MockStorageProvider (extends BaseStorageProvider)
├── In-memory testing implementation
└── Failure simulation capabilities
```

## Key Features

- **Unified Interface**: Single API for all storage operations
- **Validation**: Comprehensive input validation with detailed error messages
- **Error Handling**: Structured error classes with retry logic
- **Circuit Breaker**: Automatic failure detection and recovery
- **Progress Tracking**: Real-time upload/download progress callbacks
- **Monitoring**: Built-in metrics and logging integration
- **Testing**: Complete test utilities and mock provider

## Usage

### Basic File Operations

```typescript
import { storageProvider } from '@/lib/storage'

// Upload a file
const result = await storageProvider.upload({
  key: 'uploads/user-123/profile.jpg',
  file: fileBuffer,
  contentType: 'image/jpeg',
  metadata: {
    'user-id': '123',
    'upload-source': 'profile-update'
  }
})

// Get download URL
const { url } = await storageProvider.getDownloadUrl({
  key: 'uploads/user-123/profile.jpg',
  expiresIn: 3600, // 1 hour
  filename: 'profile-picture.jpg'
})

// Check if file exists
const exists = await storageProvider.exists('uploads/user-123/profile.jpg')

// Delete file
await storageProvider.delete('uploads/user-123/profile.jpg')
```

### Direct Browser Uploads

The storage layer supports presigned POST for direct browser uploads, avoiding the need to route files through your server:

```typescript
// Generate presigned POST for direct upload from browser
const { url, fields } = await storageProvider.getPresignedPost({
  key: 'uploads/user-123/document.pdf',
  contentType: 'application/pdf',
  expiresIn: 900, // 15 minutes
  maxSizeBytes: 10 * 1024 * 1024, // 10MB max
  conditions: [
    ['starts-with', '$key', 'uploads/user-123/']
  ]
})

// Send to browser client to use with FormData
const formData = new FormData()
Object.entries(fields).forEach(([key, value]) => {
  formData.append(key, value)
})
formData.append('file', fileBlob)

// Browser uploads directly to R2
await fetch(url, {
  method: 'POST',
  body: formData
})
```

### Large File Uploads with Multipart

For files larger than 100MB, the R2 provider automatically uses multipart uploads:

```typescript
// Large file (>100MB) will use multipart upload automatically
const result = await storageProvider.upload({
  key: 'uploads/large-video.mp4',
  file: largeFileBuffer, // > 100MB
  contentType: 'video/mp4',
  progressCallback: (progress) => {
    // Progress updates for each chunk (10MB per part)
    console.log(`Upload progress: ${progress.percentComplete.toFixed(1)}%`)
  }
})

// Multipart uploads provide:
// - Automatic chunking (10MB per part)
// - Better reliability for large files
// - Progress tracking per chunk
// - Automatic retry on failed parts
// - Automatic cleanup on abort
```

### Progress Tracking

```typescript
const result = await storageProvider.upload({
  key: 'uploads/large-file.zip',
  file: largeFileBuffer,
  contentType: 'application/zip',
  progressCallback: (progress) => {
    console.log(`Upload progress: ${progress.percentComplete.toFixed(1)}%`)
    console.log(`Speed: ${(progress.transferSpeedBps / 1024 / 1024).toFixed(2)} MB/s`)
    console.log(`ETA: ${progress.estimatedTimeRemainingMs}ms`)
  }
})
```

### Batch Operations

```typescript
// List files with prefix
const { items, continuationToken } = await storageProvider.list({
  prefix: 'uploads/user-123/',
  maxResults: 100
})

// Batch delete
const { deleted, failed } = await storageProvider.deleteBatch([
  'uploads/temp-1.jpg',
  'uploads/temp-2.jpg',
  'uploads/temp-3.jpg'
])

console.log(`Deleted: ${deleted.length}, Failed: ${failed.length}`)
```

### Error Handling

```typescript
import { StorageError, StorageErrorCode } from '@/lib/storage'

try {
  await storageProvider.upload({
    key: 'invalid..key',
    file: Buffer.from('test'),
    contentType: 'text/plain'
  })
} catch (error) {
  if (error instanceof StorageError) {
    switch (error.code) {
      case StorageErrorCode.INVALID_KEY:
        console.log('Fix the key format:', error.message)
        break
      case StorageErrorCode.FILE_TOO_LARGE:
        console.log('File exceeds size limit:', error.message)
        break
      case StorageErrorCode.NETWORK_ERROR:
        console.log('Network issue, will retry:', error.message)
        break
      default:
        console.log('Storage error:', error.message)
    }
  }
}
```

## Creating a Custom Provider

To implement a new storage provider (e.g., Azure Blob Storage):

```typescript
import { BaseStorageProvider, StorageError, StorageErrorCode } from '@/lib/storage'

export class AzureBlobStorageProvider extends BaseStorageProvider {
  constructor(config: AzureConfig) {
    super('azure-blob', {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 60000
    })
    // Initialize Azure client...
  }

  async upload(params: UploadParams): Promise<UploadResult> {
    return this.executeWithRetry(
      async () => {
        // Validate inputs using base class methods
        const keyValidation = this.validateKey(params.key)
        if (!keyValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_KEY,
            keyValidation.errors.join(', ')
          )
        }

        // Implement Azure-specific upload logic
        // Progress tracking with this.updateProgress()
        // Return result
      },
      {
        operationType: 'upload',
        key: params.key,
        startTime: Date.now(),
      }
    )
  }

  // Implement other abstract methods...
}
```

## Testing

### Using Mock Provider

```typescript
import { MockStorageProvider, StorageTestHarness } from '@/lib/storage'

// Basic mock usage
const mockProvider = new MockStorageProvider()

// Simulate network failures
mockProvider.setFailureMode('network', 2) // Fail next 2 operations
await mockProvider.upload(...) // Will fail
await mockProvider.upload(...) // Will fail  
await mockProvider.upload(...) // Will succeed

// Add latency simulation
mockProvider.setLatency(1000) // 1 second delay

// Run comprehensive test suite
const harness = new StorageTestHarness(mockProvider)
const results = await harness.runTestSuite()
console.log(`Tests: ${results.passed} passed, ${results.failed} failed`)
```

### Generating Test Data

```typescript
import { StorageTestDataGenerator } from '@/lib/storage'

// Generate test files
const smallFile = StorageTestDataGenerator.generateTestFile(1024, 'text')
const binaryFile = StorageTestDataGenerator.generateTestFile(5 * 1024 * 1024, 'binary')
const mockImage = StorageTestDataGenerator.generateTestImage(1920, 1080)

// Get test keys (valid and invalid)
const { valid, invalid } = StorageTestDataGenerator.generateTestKeys()

// Generate metadata
const metadata = StorageTestDataGenerator.generateTestMetadata()
```

## Configuration

Storage providers are configured via environment variables:

```bash
# Storage Provider Selection
STORAGE_PROVIDER=r2

# R2 Configuration
R2_ACCOUNT_ID=your-account-id
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key
STORAGE_BUCKET_ASSETS=your-bucket-name
R2_PUBLIC_URL=https://your-domain.com

# Validation Settings
STORAGE_MAX_FILE_SIZE=52428800        # 50MB in bytes
STORAGE_ALLOWED_TYPES=image/jpeg,image/png,image/webp,video/mp4,application/pdf
STORAGE_UPLOAD_URL_EXPIRY=900         # 15 minutes
STORAGE_DOWNLOAD_URL_EXPIRY=3600      # 1 hour
```

## R2-Specific Features

The Cloudflare R2 provider includes several optimizations for large-scale file operations:

### Automatic Multipart Upload

Files larger than 100MB automatically use multipart upload for better reliability:

- **Chunk Size**: 10MB per part
- **Concurrent Processing**: Parts uploaded sequentially with progress tracking
- **Automatic Retry**: Failed parts are retried with exponential backoff
- **Automatic Cleanup**: Incomplete uploads are aborted on failure

Configuration:
```typescript
// Threshold and chunk size are configured in R2StorageProvider
private static readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024 // 100MB
private static readonly MULTIPART_CHUNK_SIZE = 10 * 1024 * 1024  // 10MB
```

### Presigned POST for Browser Uploads

Direct browser-to-R2 uploads bypass your server entirely:

**Backend Setup:**
```typescript
import { storageProvider } from '@/lib/storage'

// Generate presigned POST in your API route
export async function POST(request: Request) {
  const { filename, contentType, userId } = await request.json()
  
  const { url, fields } = await storageProvider.getPresignedPost({
    key: `uploads/${userId}/${filename}`,
    contentType,
    expiresIn: 900, // 15 minutes
    maxSizeBytes: 50 * 1024 * 1024, // 50MB limit
    conditions: [
      ['starts-with', '$key', `uploads/${userId}/`],
      ['eq', '$Content-Type', contentType],
    ]
  })
  
  return Response.json({ url, fields })
}
```

**Frontend Usage:**
```typescript
// Get presigned POST from your API
const response = await fetch('/api/storage/presigned-post', {
  method: 'POST',
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    userId: currentUser.id
  })
})

const { url, fields } = await response.json()

// Upload directly to R2
const formData = new FormData()

// Add all presigned fields first
Object.entries(fields).forEach(([key, value]) => {
  formData.append(key, value)
})

// Add file last
formData.append('file', file)

// Upload directly to R2 (no server overhead)
await fetch(url, {
  method: 'POST',
  body: formData
})
```

### Progress Tracking with Multipart Uploads

Monitor upload progress in real-time, even for large multipart uploads:

```typescript
const result = await storageProvider.upload({
  key: 'videos/large-file.mp4',
  file: largeBuffer, // 500MB file
  contentType: 'video/mp4',
  progressCallback: (progress) => {
    console.log(`Uploaded: ${progress.percentComplete.toFixed(1)}%`)
    console.log(`Part: ${Math.ceil(progress.bytesTransferred / (10 * 1024 * 1024))}`)
    
    // Update UI with progress
    updateProgressBar(progress.percentComplete)
  }
})
```

### Security Features

- **Server-side Encryption**: All uploads use AES-256 encryption
- **Signed URLs**: Short-lived access (15 min - 1 hour)
- **Path Validation**: Automatic prevention of path traversal attacks
- **Content-Type Validation**: Files must match allowed MIME types
- **Size Limits**: Configurable maximum file size per upload

### Performance Optimizations

- **Circuit Breaker**: Automatic failure detection and recovery
- **Exponential Backoff**: Smart retry logic with jitter
- **Batch Operations**: Delete up to 1000 files in one request
- **Connection Pooling**: Efficient HTTP connection reuse
- **Automatic Cleanup**: Failed multipart uploads cleaned up after 7 days (via lifecycle rules)

```
```

## Monitoring and Metrics

The storage layer automatically logs operations for monitoring:

```typescript
// Metrics are automatically collected for:
// - Operation counts (upload, download, delete)
// - File sizes
// - Error rates  
// - Latency
// - Retry attempts

// Access metrics via monitoring service
import { StorageMonitoringService } from '@/lib/storage/monitoring'

const monitoring = new StorageMonitoringService()
// Metrics are automatically logged by BaseStorageProvider
```

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `VALIDATION_FAILED` | Input validation failed | No |
| `INVALID_KEY` | Storage key format invalid | No |
| `FILE_TOO_LARGE` | File exceeds size limit | No |
| `INVALID_FILE_TYPE` | File type not allowed | No |
| `UPLOAD_FAILED` | Upload operation failed | Yes |
| `DOWNLOAD_FAILED` | Download operation failed | Yes |
| `DELETE_FAILED` | Delete operation failed | Yes |
| `NOT_FOUND` | File/object not found | No |
| `AUTHENTICATION_FAILED` | Provider auth failed | No |
| `NETWORK_ERROR` | Network connectivity issue | Yes |
| `TIMEOUT` | Operation timed out | Yes |
| `RATE_LIMITED` | Rate limit exceeded | Yes |
| `CIRCUIT_BREAKER_OPEN` | Circuit breaker protection | No |

## Best Practices

1. **Always validate inputs** before calling storage operations
2. **Handle errors appropriately** - some are retryable, others are not
3. **Use progress callbacks** for large file uploads to provide user feedback
4. **Set appropriate timeouts** for your use case
5. **Monitor metrics** to detect performance issues
6. **Use batch operations** when working with multiple files
7. **Test with mock provider** to simulate various failure scenarios
8. **Choose meaningful storage keys** that reflect your data organization

## Integration with Existing Code

The new base storage class is backward compatible with existing code. The R2 provider now extends `BaseStorageProvider` but maintains the same public interface as `IStorageProvider`.

Existing code will continue to work without changes, but new features like progress tracking and enhanced error handling are now available.
