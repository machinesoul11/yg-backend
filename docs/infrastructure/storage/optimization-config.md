# R2 Storage Optimization Configuration

## Environment Variables

Add these environment variables to your `.env` file to configure R2 storage optimizations:

### Retry Configuration

```bash
# Maximum number of retry attempts for failed operations (default: 3)
STORAGE_MAX_RETRIES=3

# Initial delay between retries in milliseconds (default: 1000ms)
STORAGE_RETRY_DELAY_MS=1000

# Maximum delay between retries in milliseconds (default: 30000ms)
STORAGE_MAX_RETRY_DELAY_MS=30000

# Exponential backoff multiplier (default: 2)
STORAGE_RETRY_MULTIPLIER=2

# Random jitter added to retry delay in milliseconds (default: 100ms)
STORAGE_RETRY_JITTER_MS=100

# Operation timeout in milliseconds (default: 60000ms)
STORAGE_TIMEOUT_MS=60000
```

### Multipart Upload Configuration

```bash
# Chunk size for multipart uploads in bytes (default: 10485760 = 10MB)
# Must be at least 5MB (5242880) for R2 compatibility
R2_MULTIPART_CHUNK_SIZE=10485760

# Maximum concurrent part uploads (default: 3)
# Increase for faster uploads with good network, decrease to reduce resource usage
R2_MAX_CONCURRENT_PARTS=3
```

### Progress Tracking Configuration

```bash
# Minimum time between progress callback invocations in milliseconds (default: 200ms)
# Increase to reduce callback frequency, decrease for more granular progress updates
STORAGE_PROGRESS_THROTTLE_MS=200

# Same setting specifically for R2 operations (overrides STORAGE_PROGRESS_THROTTLE_MS)
R2_PROGRESS_THROTTLE_MS=200
```

### CDN Cache Management

```bash
# Cloudflare API token with cache purge permissions (optional)
CLOUDFLARE_API_TOKEN=your_api_token_here

# Cloudflare Zone ID for your domain (optional)
CLOUDFLARE_ZONE_ID=your_zone_id_here

# Public URL for R2 bucket (used for cache warming and purging)
R2_PUBLIC_URL=https://assets.yesgoddess.com
```

## Configuration Examples

### Development Environment
Optimized for debugging with more verbose progress updates:

```bash
STORAGE_MAX_RETRIES=2
STORAGE_RETRY_DELAY_MS=500
STORAGE_TIMEOUT_MS=30000
R2_MAX_CONCURRENT_PARTS=2
STORAGE_PROGRESS_THROTTLE_MS=100
```

### Production Environment
Optimized for performance with aggressive retries:

```bash
STORAGE_MAX_RETRIES=5
STORAGE_RETRY_DELAY_MS=1000
STORAGE_MAX_RETRY_DELAY_MS=30000
STORAGE_TIMEOUT_MS=120000
R2_MAX_CONCURRENT_PARTS=5
STORAGE_PROGRESS_THROTTLE_MS=500
```

### High-Throughput Environment
For environments with excellent network and resources:

```bash
STORAGE_MAX_RETRIES=3
STORAGE_RETRY_DELAY_MS=500
STORAGE_TIMEOUT_MS=180000
R2_MULTIPART_CHUNK_SIZE=52428800  # 50MB chunks
R2_MAX_CONCURRENT_PARTS=10
STORAGE_PROGRESS_THROTTLE_MS=1000
```

### Resource-Constrained Environment
For smaller instances or shared hosting:

```bash
STORAGE_MAX_RETRIES=3
STORAGE_RETRY_DELAY_MS=2000
STORAGE_TIMEOUT_MS=60000
R2_MULTIPART_CHUNK_SIZE=5242880  # 5MB chunks (minimum)
R2_MAX_CONCURRENT_PARTS=1  # Sequential uploads
STORAGE_PROGRESS_THROTTLE_MS=500
```

## Performance Tuning Guidelines

### Chunk Size Selection

- **5-10MB chunks**: Good for most use cases, efficient for files up to 500MB
- **10-50MB chunks**: Better for large files (500MB-5GB), requires more memory
- **50-100MB chunks**: Optimal for very large files (5GB+), needs robust network

**Memory Usage**: Each concurrent chunk is loaded into memory, so:
```
Memory ≈ R2_MULTIPART_CHUNK_SIZE × R2_MAX_CONCURRENT_PARTS
```

Example: 10MB chunks × 5 concurrent = ~50MB memory during upload

### Concurrency Tuning

Start with default (3) and adjust based on:

**Increase concurrency if:**
- You have high bandwidth (>100Mbps)
- Server has ample RAM (>4GB available)
- Uploads are consistently slow
- Network latency is low (<50ms to R2)

**Decrease concurrency if:**
- Running out of memory during uploads
- Other services on the same server are impacted
- Network connection is unstable
- You see rate limiting errors

### Retry Configuration

**Aggressive retries** (for production reliability):
```bash
STORAGE_MAX_RETRIES=5
STORAGE_RETRY_DELAY_MS=1000
STORAGE_MAX_RETRY_DELAY_MS=30000
STORAGE_RETRY_MULTIPLIER=2
STORAGE_RETRY_JITTER_MS=200
```

**Conservative retries** (for development/testing):
```bash
STORAGE_MAX_RETRIES=2
STORAGE_RETRY_DELAY_MS=500
STORAGE_MAX_RETRY_DELAY_MS=10000
```

### Progress Throttling

**Real-time progress UI**: 100-200ms throttle
**Background uploads**: 500-1000ms throttle
**Batch operations**: 1000-5000ms throttle

## Monitoring Recommendations

Monitor these metrics to optimize configuration:

1. **Upload success rate**: Should be >99%
2. **Average retry count**: Should be <0.5 per operation
3. **Memory usage during uploads**: Should not spike above available RAM
4. **Upload throughput**: Should approach network bandwidth limits
5. **Progress callback overhead**: Should be <1% of total operation time

## CDN Cache Configuration

### Cache Control Headers (Automatic)

The R2 provider automatically sets appropriate cache headers:

- **Original assets**: `public, max-age=31536000, immutable` (1 year)
- **Thumbnails/previews**: `public, max-age=2592000, immutable` (30 days)
- **Documents**: `public, max-age=86400` (1 day)
- **Temp files**: `no-store, no-cache, must-revalidate`

### Cache Purging

To enable cache purging after asset updates:

1. Create Cloudflare API token with "Cache Purge" permission
2. Set `CLOUDFLARE_API_TOKEN` in environment
3. Set `CLOUDFLARE_ZONE_ID` (find in Cloudflare dashboard)
4. Use `purgeCDNCache()` or `purgeAssetCache()` utilities

Example usage:
```typescript
import { purgeAssetCache } from '@/lib/storage/cdn-cache'

// After updating an asset
await purgeAssetCache(assetId)
```

### Cache Warming

Warm CDN cache after thumbnail generation to ensure first user request is fast:

```typescript
import { warmAssetCache } from '@/lib/storage/cdn-cache'

// After generating thumbnails
await warmAssetCache(assetId)
```

## Troubleshooting

### Uploads failing with timeout errors
- Increase `STORAGE_TIMEOUT_MS`
- Decrease `R2_MULTIPART_CHUNK_SIZE`
- Check network connectivity to R2

### High memory usage during uploads
- Decrease `R2_MAX_CONCURRENT_PARTS`
- Decrease `R2_MULTIPART_CHUNK_SIZE`
- Ensure old buffers are being garbage collected

### Slow upload performance
- Increase `R2_MAX_CONCURRENT_PARTS`
- Check if retry logic is triggering frequently
- Verify network bandwidth to R2

### Progress callbacks causing performance issues
- Increase `STORAGE_PROGRESS_THROTTLE_MS`
- Optimize callback handler code
- Consider disabling progress tracking for batch operations

## Testing Configuration

Test your configuration with various file sizes:

```bash
# Small files (<10MB): Should use single upload
# Medium files (10-100MB): Should use multipart
# Large files (>100MB): Should use multipart with concurrency

# Monitor logs for:
# - Retry attempts and reasons
# - Multipart upload behavior
# - Progress callback frequency
# - Overall upload duration
```
