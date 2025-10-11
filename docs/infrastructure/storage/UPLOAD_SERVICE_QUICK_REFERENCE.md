# Upload Service - Quick Reference

## Jobs

### Virus Scan Job
**Queue:** `asset-virus-scan`
**Trigger:** On upload confirmation
**Priority:** High (1)
**Retries:** 3 with exponential backoff

```typescript
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';

const queue = new Queue('asset-virus-scan', { connection: redis });
await queue.add('scan', { assetId, storageKey });
```

### Upload Cleanup Job
**Queue:** `upload-cleanup`
**Schedule:** Every hour (`0 * * * *`)
**Purpose:** Clean abandoned/failed/infected uploads

```typescript
import { scheduleUploadCleanup } from '@/jobs/upload-cleanup.job';
await scheduleUploadCleanup();
```

## Analytics

### Track Upload Event

```typescript
import { uploadAnalyticsService } from '@/lib/services/upload-analytics.service';

await uploadAnalyticsService.trackEvent({
  userId: 'user-123',
  assetId: 'asset-456',
  eventType: 'confirmed', // initiated | confirmed | failed | scanned | cleaned
  fileSize: 2048576,
  mimeType: 'image/jpeg',
  timestamp: new Date(),
});
```

### Get Metrics

```typescript
// Today's metrics (cached 5min)
const metrics = await uploadAnalyticsService.getRealTimeMetrics();

// Date range
const metrics = await uploadAnalyticsService.getMetrics(
  new Date('2025-01-01'),
  new Date('2025-01-31')
);

// Queue depth
const queue = await uploadAnalyticsService.getQueueDepth();
// { pending: 5, scanning: 2, processing: 3 }

// Top uploaders
const topUsers = await uploadAnalyticsService.getTopUploaders(10);
```

## Virus Scanner

### Configure Scanner

```bash
# Environment variables
SCANNER_PROVIDER=mock              # mock | virustotal | clamav
VIRUSTOTAL_API_KEY=your-key        # For VirusTotal
CLAMAV_HOST=localhost              # For ClamAV
CLAMAV_PORT=3310
```

### Use Scanner

```typescript
import { virusScanner } from '@/lib/services/virus-scanner';

// Submit scan
const scanId = await virusScanner.submitScan(fileUrl, metadata);

// Check if complete
const isComplete = await virusScanner.isScanComplete(scanId);

// Get results
const result = await virusScanner.getScanResult(scanId);
// result.status: 'clean' | 'infected' | 'error'
// result.threats: [...] if infected
```

## Upload Flow

```typescript
import { IpAssetService } from '@/modules/ip/service';

const service = new IpAssetService(prisma, storageProvider);

// 1. Initiate upload
const { uploadUrl, assetId } = await service.initiateUpload(
  { userId },
  { fileName, fileSize, mimeType, projectId }
);

// 2. Client uploads to uploadUrl

// 3. Confirm upload
const asset = await service.confirmUpload(
  { userId },
  { assetId, title, description, metadata }
);

// 4. Virus scan runs automatically
// 5. Analytics tracked automatically
```

## Cleanup Thresholds

```typescript
ABANDONED_TIMEOUT_HOURS = 24        // Clean uploads pending > 24h
FAILED_RETENTION_DAYS = 7           // Delete failed uploads after 7 days
INFECTED_RETENTION_DAYS = 30        // Delete infected files after 30 days
```

## Redis Keys

```
upload:event:{assetId}:{eventType}   # Event tracking (24h TTL)
upload:daily:{date}                  # Daily counters (hash)
upload:mimeTypes:{date}              # Mime type stats (hash)
upload:metrics:{date}                # Metrics cache (5min TTL)
```

## Monitoring

### Key Metrics
- Upload success rate (target: >95%)
- Average scan time (target: <2min)
- Scan failure rate (target: <5%)
- Queue depth (alert: >100)
- Storage freed by cleanup

### BullMQ Dashboard

```bash
# View queues
redis-cli KEYS "*bull*"

# Queue stats
redis-cli HGETALL bull:asset-virus-scan:meta
redis-cli HGETALL bull:upload-cleanup:meta
```

## Common Operations

### Manual Cleanup

```typescript
import { uploadCleanupQueue } from '@/jobs/upload-cleanup.job';

// Run cleanup now
await uploadCleanupQueue.add('cleanup', {});

// Dry run (no deletion)
await uploadCleanupQueue.add('cleanup', { dryRun: true });
```

### Reprocess Failed Scan

```typescript
const queue = new Queue('asset-virus-scan', { connection: redis });
await queue.add('scan', {
  assetId: 'failed-asset-id',
  storageKey: 'path/to/file',
  retryCount: 0,
});
```

### Clear Analytics Cache

```typescript
await uploadAnalyticsService.clearCache(); // Today
await uploadAnalyticsService.clearCache(new Date('2025-01-15')); // Specific date
```

## Error Codes

```typescript
// Scanner errors
SCAN_NOT_FOUND: 404       # Scan ID not found
SCAN_TIMEOUT: 408         # Scan took too long
SCAN_FAILED: 500          # Scanner service error

// Upload errors
FILE_TOO_LARGE: 400       # Exceeds size limit
INVALID_MIME_TYPE: 400    # Not in whitelist
STORAGE_ERROR: 500        # Storage operation failed
SCAN_ERROR: 500           # Virus scan failed
```

## Security

### Quarantine System
- Infected files moved to `quarantine/{storageKey}`
- Automatic deletion after 30 days
- Security events logged
- Admin notifications sent

### File Validation
- Mime type whitelist
- Size limits enforced
- Filename sanitization
- Path traversal prevention

## Testing

### Test Files

```typescript
// Clean file (mock scanner always returns clean)
const result = await virusScanner.submitScanFromBuffer(
  Buffer.from('test content'),
  'test.txt'
);
```

### Test Upload Flow

```typescript
// 1. Initiate
const init = await service.initiateUpload(ctx, {
  fileName: 'test.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
});

// 2. Simulate upload (file must exist in storage)
await storageProvider.upload({
  key: init.storageKey,
  file: Buffer.from('test'),
  contentType: 'image/jpeg',
});

// 3. Confirm
const asset = await service.confirmUpload(ctx, {
  assetId: init.assetId,
  title: 'Test Asset',
});

// 4. Wait for scan
await new Promise(r => setTimeout(r, 5000));

// 5. Check result
const updated = await prisma.ipAsset.findUnique({
  where: { id: asset.id },
});
expect(updated.scanStatus).toBe('CLEAN');
```

---

**Quick Links:**
- [Full Documentation](./UPLOAD_SERVICE_COMPLETE.md)
- [Storage Configuration](./configuration.md)
- [IP Assets Module](../../modules/ip-assets/)
