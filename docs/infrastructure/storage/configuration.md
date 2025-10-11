# Cloudflare R2 Storage Configuration

## Overview

YesGoddess backend uses Cloudflare R2 as the primary storage provider for IP assets, thumbnails, previews, and documents. R2 is S3-compatible with zero egress fees and global CDN distribution.

---

## R2 Bucket Setup

### 1. Bucket Creation

**Bucket Names:**
- `yesgoddess-assets-production` - Main asset storage
- `yesgoddess-previews-production` - Generated previews and thumbnails
- `yesgoddess-documents-production` - License documents and PDFs
- `yesgoddess-temp-production` - Temporary uploads (24hr TTL)

**Configuration:**
- **Region:** Auto (Cloudflare handles distribution)
- **Access:** Private by default
- **Encryption:** AES-256 server-side encryption enabled
- **Versioning:** Disabled (managed at application level)

### 2. CORS Configuration

**Policy Applied:**
```json
[
  {
    "AllowedOrigins": [
      "https://yesgoddess.com",
      "https://app.yesgoddess.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Implementation:**
- Configured in Cloudflare R2 dashboard → Bucket Settings → CORS Policy
- Allows direct frontend uploads via signed URLs
- Restricts origins to authorized domains only

### 3. Lifecycle Rules

**Rule 1: Delete Incomplete Multipart Uploads**
```json
{
  "ID": "delete-incomplete-uploads",
  "Status": "Enabled",
  "Filter": {},
  "AbortIncompleteMultipartUpload": {
    "DaysAfterInitiation": 7
  }
}
```

**Rule 2: Auto-delete Temporary Files**
```json
{
  "ID": "delete-temp-files",
  "Status": "Enabled",
  "Filter": {
    "Prefix": "temp/"
  },
  "Expiration": {
    "Days": 1
  }
}
```

**Rule 3: Transition Old Versions (Future)**
```json
{
  "ID": "transition-old-versions",
  "Status": "Enabled",
  "Filter": {},
  "Transitions": [
    {
      "Days": 90,
      "StorageClass": "INFREQUENT_ACCESS"
    }
  ]
}
```

### 4. Public Access Policies

**Default Policy:** All objects are private

**Public CDN Assets (Optional):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::yesgoddess-assets-production/public/*"
    }
  ]
}
```

**Access Strategy:**
- Private assets: Signed URLs (15 min - 1 hour expiry)
- Public thumbnails: CDN via `/public` prefix
- Admin access: Full IAM credentials
- Creator access: Time-limited signed URLs

### 5. Storage Monitoring

**Metrics Tracked:**
- Total storage usage (GB)
- Request count (GET, PUT, DELETE)
- Bandwidth usage (egress)
- Error rates (4xx, 5xx)
- Average request latency
- Failed upload attempts

**Monitoring Implementation:**
- Cloudflare Analytics Dashboard for R2 metrics
- Custom application metrics stored in `storage_metrics` table
- Daily aggregation job for historical trends
- Real-time alerts via notification system

**Alert Thresholds:**
- Storage usage > 80%: Warning
- Error rate > 5%: Critical
- P95 latency > 10s: Warning
- Failed scans detected: Critical

### 6. Storage Structure & Naming

**Directory Structure:**
```
yesgoddess-assets-production/
├── assets/
│   ├── {asset_id}/
│   │   ├── original.{ext}           # Original uploaded file
│   │   ├── thumbnail_small.jpg      # 200x200 thumbnail
│   │   ├── thumbnail_medium.jpg     # 400x400 thumbnail
│   │   ├── preview.jpg              # 1200px max dimension
│   │   └── metadata.json            # Extracted metadata
│   └── ...
├── temp/
│   └── {upload_id}.{ext}            # Temporary uploads (24hr TTL)
├── public/
│   └── thumbnails/
│       └── {asset_id}_thumb.jpg     # Public CDN thumbnails
└── documents/
    └── licenses/
        └── {license_id}.pdf         # Generated license documents
```

**Naming Conventions:**

**Asset Keys:**
- Format: `assets/{assetId}/{sanitizedFilename}`
- Example: `assets/cm1abc123xyz/profile_photo.jpeg`
- Asset IDs: 21-character nanoid (URL-safe)
- Filenames: Lowercase, alphanumeric + underscore only

**Thumbnail Keys:**
- Format: `assets/{assetId}/thumbnail_{variant}.jpg`
- Variants: `small` (200x200), `medium` (400x400), `large` (800x800)

**Preview Keys:**
- Format: `assets/{assetId}/preview.{ext}`
- Extensions: `.jpg` (images), `.mp4` (videos), `.jpg` (documents)

**Temporary Keys:**
- Format: `temp/{nanoid}_{sanitizedFilename}`
- Auto-deleted after 24 hours via lifecycle rule

---

## Storage Provider Architecture

### Adapter Pattern

The storage layer uses an adapter pattern to support multiple providers:

```typescript
IStorageProvider (interface)
├── R2StorageProvider (Cloudflare R2)
└── AzureBlobStorageProvider (Future)
```

**Benefits:**
- Provider-agnostic service layer
- Easy switching between R2 and Azure
- Consistent API across providers
- Simplified testing with mock providers

### File Structure

```
src/lib/storage/
├── types.ts              # Interfaces and types
├── providers/
│   ├── r2.ts            # Cloudflare R2 implementation
│   └── azure.ts         # Azure Blob (future)
├── index.ts             # Provider factory
├── monitoring.ts        # Metrics and health checks
└── client.ts            # Singleton export
```

---

## Security Model

### 1. Access Control

**Signed URL Security:**
- Upload URLs: 15-minute expiry
- Download URLs: 1-hour expiry
- One-time use for uploads (validated via asset_id)
- HMAC signature prevents tampering

**User Permissions:**
- **Creators:** Access only their own assets
- **Brands:** Access licensed assets only
- **Admins:** Full access with audit logging
- **Public:** No direct access (signed URLs only)

### 2. File Validation

**Upload Validation:**
- MIME type whitelist enforcement
- File size limits (50MB default, configurable)
- Filename sanitization (prevent path traversal)
- Content type verification

**Post-Upload Processing:**
- Virus scanning (ClamAV integration)
- Metadata extraction and validation
- Preview generation with safety checks
- Audit logging for all operations

### 3. Data Protection

**Encryption:**
- At-rest: AES-256 server-side encryption
- In-transit: TLS 1.3 for all connections
- Signed URLs: HMAC-SHA256 signatures

**Privacy:**
- Soft deletes (recoverable for 30 days)
- Audit trail for all file access
- GDPR compliance (data export/deletion)
- Secure credential rotation

### 4. Rate Limiting

**Per-User Limits:**
- Upload URL generation: 10/minute
- Downloads: 100/hour
- Deletes: 50/hour

**Global Protection:**
- Cloudflare DDoS protection
- R2 automatic rate limiting
- Application-level throttling

---

## Environment Variables

**Required Variables:**
```bash
# Storage Provider
STORAGE_PROVIDER=r2

# R2 Credentials
R2_ACCOUNT_ID=cdf0bbde73a8dfb7ae78dab28ac51a21
STORAGE_ACCESS_KEY_ID=875bc59f0e1577c503a034ebd6413f00
STORAGE_SECRET_ACCESS_KEY=0d7b2480a681cf5e849d91559435800fdcb0da0520b3e82ce918eeaf6c9aeabe

# Bucket Names
STORAGE_BUCKET_ASSETS=yesgoddess-assets-production
STORAGE_BUCKET_PREVIEWS=yesgoddess-previews-production
STORAGE_BUCKET_DOCUMENTS=yesgoddess-documents-production
STORAGE_BUCKET_TEMP=yesgoddess-temp-production

# Configuration
R2_PUBLIC_URL=https://assets.yesgoddess.com
STORAGE_MAX_FILE_SIZE=52428800
STORAGE_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf
STORAGE_UPLOAD_URL_EXPIRY=900
STORAGE_DOWNLOAD_URL_EXPIRY=3600
```

**Validation:**
- Configuration validated at startup via Zod schema
- Missing required variables cause startup failure
- Type-safe access throughout application

---

## Upload Flow

### Frontend-to-R2 Direct Upload

**Step 1: Request Upload URL**
```typescript
const { assetId, uploadUrl, expiresAt } = await trpc.storage.generateUploadUrl.mutate({
  projectId: 'project123',
  filename: 'portrait.jpg',
  contentType: 'image/jpeg',
  fileSize: 2048576,
  assetType: 'IMAGE'
})
```

**Backend Actions:**
- Validates file type and size
- Creates database record (status: DRAFT)
- Generates signed PUT URL
- Returns asset ID and URL

**Step 2: Upload to R2**
```typescript
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'image/jpeg' }
})
```

**Direct Upload Benefits:**
- No backend bandwidth usage
- Faster uploads (direct to R2)
- Reduced server load
- Progress tracking in browser

**Step 3: Confirm Upload**
```typescript
await trpc.storage.confirmUpload.mutate({ assetId })
```

**Backend Actions:**
- Verifies file exists in R2
- Updates database (status: REVIEW)
- Enqueues background jobs:
  - Virus scanning (priority: high)
  - Preview generation (priority: medium)
  - Metadata extraction (priority: low)

### Background Processing

**Job 1: Virus Scan (Priority 1)**
- Downloads file from R2
- Scans with ClamAV
- If clean: Updates status to CLEAN
- If infected: Deletes from R2, marks INFECTED

**Job 2: Preview Generation (Priority 2)**
- Generates thumbnails (200x200, 400x400)
- Creates preview image (1200px max)
- Uploads previews to R2
- Updates database with preview URLs

**Job 3: Metadata Extraction (Priority 3)**
- Extracts EXIF data (images)
- Extracts duration/codec (videos)
- Stores in `metadata` JSONB field
- Non-critical (doesn't block approval)

---

## API Endpoints

### Storage Router (tRPC)

**Generate Upload URL:**
```typescript
trpc.storage.generateUploadUrl.mutate({
  projectId?: string
  filename: string
  contentType: string
  fileSize: number
  assetType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO'
})
// Returns: { assetId, uploadUrl, expiresAt }
```

**Confirm Upload:**
```typescript
trpc.storage.confirmUpload.mutate({ assetId: string })
// Returns: { id, status, storageKey }
```

**Get Download URL:**
```typescript
trpc.storage.getDownloadUrl.query({ assetId: string })
// Returns: { url, expiresAt }
```

**Delete Asset:**
```typescript
trpc.storage.deleteAsset.mutate({ assetId: string })
// Returns: { success: true }
```

### Admin Endpoints

**Storage Metrics:**
```
GET /api/admin/storage/metrics?startDate=2025-01-01&endDate=2025-01-31
```

**Health Check:**
```
GET /api/admin/storage/health
```

**Cleanup Temp Files:**
```
POST /api/admin/storage/cleanup-temp
```

---

## Testing Strategy

### Unit Tests

**Storage Provider Tests:**
```typescript
describe('R2StorageProvider', () => {
  it('should generate valid upload URL')
  it('should validate storage keys')
  it('should handle upload errors gracefully')
  it('should delete files successfully')
  it('should batch delete efficiently')
})
```

**Storage Service Tests:**
```typescript
describe('StorageService', () => {
  it('should reject oversized files')
  it('should reject invalid file types')
  it('should validate user permissions')
  it('should log audit events')
})
```

### Integration Tests

**End-to-End Upload Flow:**
```typescript
describe('Asset Upload Flow', () => {
  it('should complete full upload workflow')
  it('should handle upload failures')
  it('should prevent unauthorized access')
  it('should trigger background jobs')
})
```

### Load Tests

**Performance Targets:**
- 100 concurrent uploads: < 5s average
- 1000 downloads/minute: < 1s p95
- Batch delete 1000 files: < 10s

---

## Monitoring & Alerts

### CloudWatch Metrics (via Cloudflare)

- `StorageUsageBytes` - Total bucket size
- `RequestCount` - Operations per minute
- `ErrorRate` - 4xx/5xx percentage
- `Latency` - Request duration (p50, p95, p99)

### Application Metrics

**Database Table: `storage_metrics`**
```sql
CREATE TABLE storage_metrics (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  operation TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  total_size BIGINT NOT NULL,
  error_count INTEGER NOT NULL,
  avg_latency INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, operation)
);
```

**Daily Aggregation Job:**
- Runs at midnight UTC
- Aggregates previous day's operations
- Calculates error rates and averages
- Triggers alerts if thresholds exceeded

### Alert Configuration

**Critical Alerts (Email + Slack):**
- Virus detected in uploaded file
- Error rate > 10%
- Storage usage > 90%
- R2 service degradation

**Warning Alerts (Slack only):**
- Error rate > 5%
- Storage usage > 80%
- Slow upload times (p95 > 10s)
- High temp file accumulation

---

## Backup & Disaster Recovery

### Backup Strategy

**Automated Backups:**
- Cloudflare R2 has 99.999999999% durability
- Multi-region replication built-in
- No manual backup needed for R2

**Database Backups:**
- Asset metadata backed up with Supabase
- Point-in-time recovery for 7 days
- Daily full backups retained for 30 days

### Recovery Procedures

**Accidental Deletion:**
1. Check `deleted_at` timestamp in database
2. Restore from soft delete (< 30 days)
3. Regenerate signed URL for access

**Data Corruption:**
1. Identify corrupted asset IDs
2. Re-upload from original source
3. Trigger preview regeneration job

**Complete Outage:**
1. Verify R2 service status
2. Fallback to Azure Blob (if configured)
3. Update `STORAGE_PROVIDER` env var
4. Redeploy application

---

## Cost Optimization

### R2 Pricing (as of 2025)

- **Storage:** $0.015/GB/month
- **Class A Operations (PUT, LIST):** $4.50/million
- **Class B Operations (GET, HEAD):** $0.36/million
- **Egress:** FREE (major advantage over S3)

### Optimization Strategies

**Storage:**
- Lifecycle rules for temp files (24hr TTL)
- Compress images before upload (client-side)
- Use efficient formats (WebP > JPEG)
- Delete old asset versions (90+ days)

**Operations:**
- Batch deletes (1000 files per request)
- Cache download URLs (1 hour)
- Minimize LIST operations (use database index)
- CDN for public thumbnails

**Bandwidth:**
- Direct uploads (no backend bandwidth)
- CDN caching for previews
- Progressive image loading
- Video streaming optimization

### Estimated Costs (10,000 assets/month)

- Storage (50GB): $0.75/month
- Uploads (10K): $0.05/month
- Downloads (100K): $0.04/month
- **Total:** ~$1/month (vs ~$50/month with AWS S3 egress)

---

## Maintenance Procedures

### Daily Tasks

- Monitor storage health status
- Review error logs for failed uploads
- Check virus scan results
- Verify backup completion

### Weekly Tasks

- Review storage usage trends
- Analyze slow upload reports
- Clean up orphaned temp files
- Rotate access keys (recommended)

### Monthly Tasks

- Audit access logs for security
- Review cost optimization opportunities
- Test disaster recovery procedures
- Update documentation

---

## Troubleshooting Guide

### Upload Failures

**Symptom:** "Upload to storage failed"
**Causes:**
- Expired signed URL (> 15 min)
- CORS configuration issue
- Network timeout
- File size mismatch

**Resolution:**
1. Check signed URL expiry time
2. Verify CORS policy in R2 dashboard
3. Retry with exponential backoff
4. Validate file size before upload

### Access Denied Errors

**Symptom:** "Insufficient permissions"
**Causes:**
- Invalid user role
- Asset not licensed
- Deleted asset
- Expired download URL

**Resolution:**
1. Verify user role and permissions
2. Check license status in database
3. Confirm asset not soft-deleted
4. Generate new download URL

### Slow Upload Times

**Symptom:** Uploads taking > 30s
**Causes:**
- Large file size (> 50MB)
- Slow client connection
- R2 service degradation
- Missing CDN acceleration

**Resolution:**
1. Implement chunked uploads for large files
2. Show progress indicator to user
3. Check Cloudflare status page
4. Enable upload resume capability

---

## Future Enhancements

### Phase 1 (Q2 2025)
- [ ] Implement resumable uploads for large files
- [ ] Add multi-region failover to Azure Blob
- [ ] Optimize preview generation with WebP
- [ ] Implement intelligent caching strategy

### Phase 2 (Q3 2025)
- [ ] Video transcoding pipeline (multiple resolutions)
- [ ] AI-powered content moderation
- [ ] Advanced search indexing (Elasticsearch)
- [ ] CDN integration with Cloudflare Pages

### Phase 3 (Q4 2025)
- [ ] Blockchain-based asset verification
- [ ] Decentralized storage option (IPFS)
- [ ] Real-time collaborative editing
- [ ] Advanced analytics dashboard

---

## References

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS S3 API Compatibility](https://docs.aws.amazon.com/AmazonS3/latest/API/)
- [Storage Security Best Practices](https://owasp.org/www-project-cloud-security/)
- [GDPR Compliance Guide](https://gdpr.eu/)

---

**Last Updated:** January 2025  
**Maintained By:** YesGoddess Backend Team  
**Next Review:** April 2025
