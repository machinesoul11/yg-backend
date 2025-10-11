# Storage Structure and Naming Conventions

## Directory Structure

### Production Buckets

```
yesgoddess-assets-production/
├── assets/
│   ├── {asset_id}/                    # Unique asset folder
│   │   ├── original.{ext}             # Original uploaded file
│   │   ├── thumbnail_small.jpg        # 200x200 thumbnail
│   │   ├── thumbnail_medium.jpg       # 400x400 thumbnail
│   │   ├── thumbnail_large.jpg        # 800x800 thumbnail
│   │   ├── preview.jpg                # 1200px max dimension preview
│   │   └── metadata.json              # Extracted metadata (optional)
│   └── ...
├── temp/
│   └── {nanoid}_{filename}            # Temporary uploads (24hr TTL)
├── public/
│   └── thumbnails/
│       └── {asset_id}_thumb.jpg       # Public CDN thumbnails
└── documents/
    └── licenses/
        └── {license_id}.pdf           # Generated license documents

yesgoddess-previews-production/
├── images/
│   └── {asset_id}/
│       ├── preview_1200.jpg           # Large preview
│       ├── preview_800.jpg            # Medium preview
│       └── preview_400.jpg            # Small preview
├── videos/
│   └── {asset_id}/
│       ├── preview.mp4                # Preview clip (30s)
│       └── thumbnail.jpg              # Video thumbnail
└── documents/
    └── {asset_id}/
        └── page_1.jpg                 # First page preview

yesgoddess-documents-production/
├── licenses/
│   └── {license_id}.pdf               # Generated license agreements
├── invoices/
│   └── {invoice_id}.pdf               # Payment invoices
├── statements/
│   └── {statement_id}.pdf             # Royalty statements
└── contracts/
    └── {contract_id}.pdf              # Legal contracts

yesgoddess-temp-production/
└── {nanoid}_{filename}                # All temp files (auto-deleted 24h)
```

---

## Naming Conventions

### Asset Storage Keys

**Format:** `assets/{assetId}/{sanitizedFilename}`

**Rules:**
- Asset IDs: 21-character nanoid (URL-safe: `0-9a-z`)
- Filenames: Lowercase, alphanumeric + underscore only
- Max filename length: 100 characters (before extension)
- Extension: Preserved from original upload

**Examples:**
```
assets/cm1abc123xyz/portrait_photo.jpeg
assets/kx9def456uvw/wedding_video.mp4
assets/qr2ghi789rst/brand_guidelines.pdf
```

**Generation Code:**
```typescript
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21)

function generateAssetKey(filename: string): string {
  const assetId = nanoid()
  const sanitized = sanitizeFilename(filename)
  return `assets/${assetId}/${sanitized}`
}

function sanitizeFilename(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.')
  const name = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename
  const ext = lastDotIndex > 0 ? filename.slice(lastDotIndex) : ''

  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100)

  return sanitized + ext
}
```

---

### Thumbnail Keys

**Format:** `assets/{assetId}/thumbnail_{variant}.jpg`

**Variants:**
- `small`: 200x200 (square crop)
- `medium`: 400x400 (square crop)
- `large`: 800x800 (square crop)

**Examples:**
```
assets/cm1abc123xyz/thumbnail_small.jpg
assets/cm1abc123xyz/thumbnail_medium.jpg
assets/cm1abc123xyz/thumbnail_large.jpg
```

---

### Preview Keys

**Format:** `assets/{assetId}/preview.{ext}`

**Extensions:**
- Images: `.jpg` (1200px max dimension, maintain aspect ratio)
- Videos: `.mp4` (720p, 30s clip)
- Documents: `.jpg` (first page, 1200px width)
- Audio: `.png` (waveform visualization)

**Examples:**
```
assets/cm1abc123xyz/preview.jpg
assets/kx9def456uvw/preview.mp4
assets/qr2ghi789rst/preview.jpg
```

---

### Temporary Keys

**Format:** `temp/{nanoid}_{sanitizedFilename}`

**Purpose:**
- Incomplete uploads
- Processing files
- User-initiated uploads not yet confirmed

**Auto-deletion:**
- Lifecycle rule deletes after 24 hours
- Manual cleanup via admin API

**Examples:**
```
temp/x7k2m9p4q1r5s8t0/profile_upload.jpg
temp/a3b6c9d2e5f8g1h4/video_draft.mp4
```

---

### Public CDN Keys

**Format:** `public/thumbnails/{assetId}_thumb.jpg`

**Purpose:**
- Publicly accessible thumbnails
- CDN-optimized delivery
- No authentication required

**Examples:**
```
public/thumbnails/cm1abc123xyz_thumb.jpg
```

---

### Document Keys

**Format:** `documents/{category}/{id}.pdf`

**Categories:**
- `licenses`: License agreements
- `invoices`: Payment invoices
- `statements`: Royalty statements
- `contracts`: Legal contracts

**Examples:**
```
documents/licenses/lic_789xyz123abc.pdf
documents/invoices/inv_456def789ghi.pdf
documents/statements/stmt_123abc456def.pdf
```

---

## File Naming Security

### Path Traversal Prevention

**Blocked patterns:**
```
../etc/passwd
..\..\windows\system32
./../../secrets.txt
```

**Validation:**
```typescript
function validateKey(key: string): void {
  if (key.includes('..')) {
    throw new StorageError('Storage key cannot contain path traversal')
  }
  if (key.length > 1024) {
    throw new StorageError('Storage key too long (max 1024 characters)')
  }
}
```

### Character Whitelist

**Allowed characters:**
- Lowercase letters: `a-z`
- Numbers: `0-9`
- Separators: `_` (underscore), `/` (path separator), `.` (extension)

**Blocked characters:**
- Spaces (replaced with `_`)
- Special chars: `!@#$%^&*()+=[]{}|;:'",<>?`
- Unicode/emoji (replaced with `_`)

---

## Metadata Storage

### Database Fields

**IPAsset table:**
```typescript
interface IPAsset {
  storage_key: string        // Primary storage key
  file_size: number          // Bytes
  mime_type: string          // e.g., "image/jpeg"
  thumbnail_url: string | null
  preview_url: string | null
  metadata: Json             // See structure below
}
```

### Metadata JSONB Structure

**Images:**
```json
{
  "width": 3000,
  "height": 2000,
  "format": "JPEG",
  "colorSpace": "sRGB",
  "hasAlpha": false,
  "exif": {
    "Make": "Canon",
    "Model": "EOS 5D Mark IV",
    "DateTimeOriginal": "2025-01-15T10:30:00Z",
    "ISO": 400,
    "FocalLength": 50,
    "Aperture": 2.8,
    "ShutterSpeed": "1/500"
  },
  "uploadedAt": "2025-01-15T12:00:00Z",
  "processedAt": "2025-01-15T12:01:30Z",
  "virusScanResult": "clean",
  "thumbnailGenerated": true,
  "previewGenerated": true
}
```

**Videos:**
```json
{
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "codec": "H.264",
  "fps": 30,
  "bitrate": 5000000,
  "resolution": "1080p",
  "uploadedAt": "2025-01-15T12:00:00Z",
  "processedAt": "2025-01-15T12:05:00Z",
  "virusScanResult": "clean",
  "thumbnailGenerated": true,
  "previewGenerated": true
}
```

**Documents:**
```json
{
  "pageCount": 10,
  "author": "Jane Doe",
  "title": "Brand Guidelines",
  "creationDate": "2025-01-10T09:00:00Z",
  "uploadedAt": "2025-01-15T12:00:00Z",
  "processedAt": "2025-01-15T12:00:45Z",
  "virusScanResult": "clean",
  "thumbnailGenerated": true,
  "previewGenerated": false
}
```

**Audio:**
```json
{
  "duration": 180.0,
  "bitrate": 320000,
  "sampleRate": 44100,
  "channels": 2,
  "codec": "MP3",
  "uploadedAt": "2025-01-15T12:00:00Z",
  "processedAt": "2025-01-15T12:01:00Z",
  "virusScanResult": "clean",
  "thumbnailGenerated": false,
  "previewGenerated": true
}
```

---

## Storage Key Parsing

**Utility function:**
```typescript
interface ParsedKey {
  prefix: string          // "assets", "temp", "public", "documents"
  assetId?: string        // Unique asset identifier
  filename?: string       // Sanitized filename
  variant?: string        // "small", "medium", "large", "preview"
}

function parseStorageKey(key: string): ParsedKey {
  const parts = key.split('/')

  if (parts.length < 2) {
    return { prefix: parts[0] }
  }

  const [prefix, assetId, filename] = parts

  const variant = filename?.includes('thumbnail_')
    ? filename.split('_')[1].split('.')[0]
    : filename?.includes('preview')
      ? 'preview'
      : undefined

  return {
    prefix,
    assetId,
    filename,
    variant,
  }
}
```

**Usage:**
```typescript
const key = "assets/cm1abc123xyz/thumbnail_small.jpg"
const parsed = parseStorageKey(key)

console.log(parsed)
// {
//   prefix: "assets",
//   assetId: "cm1abc123xyz",
//   filename: "thumbnail_small.jpg",
//   variant: "small"
// }
```

---

## File Size Guidelines

### Upload Limits

**By Asset Type:**
- Images: 50 MB
- Videos: 500 MB (2 GB for premium users)
- Documents: 25 MB
- Audio: 100 MB

**Configuration:**
```bash
# .env
STORAGE_MAX_FILE_SIZE=52428800           # 50MB default
STORAGE_MAX_FILE_SIZE_VIDEO=524288000    # 500MB for videos
STORAGE_MAX_FILE_SIZE_PREMIUM=2147483648 # 2GB for premium
```

### Storage Estimates

**Per 10,000 Assets:**
- Original files: ~200 GB (avg 20 MB each)
- Thumbnails: ~5 GB (3 sizes × 50 KB each)
- Previews: ~15 GB (1.5 MB each)
- **Total:** ~220 GB

**Monthly Growth (1,000 new assets):**
- ~22 GB per month
- ~264 GB per year

---

## Best Practices

### Naming

1. ✅ Use descriptive filenames: `brand_logo_2025.png`
2. ✅ Include dates when relevant: `campaign_video_jan2025.mp4`
3. ✅ Avoid generic names: `image1.jpg`, `video.mp4`
4. ✅ Use underscores not spaces: `my_photo.jpg` not `my photo.jpg`

### Organization

1. ✅ Keep temp files under 24 hours
2. ✅ Delete old versions after 90 days
3. ✅ Use public CDN for frequently accessed thumbnails
4. ✅ Store documents separately from assets

### Performance

1. ✅ Generate thumbnails immediately after upload
2. ✅ Use lazy loading for preview generation
3. ✅ Cache signed URLs for 1 hour
4. ✅ Batch delete operations (1000 at a time)

### Security

1. ✅ Validate file types before upload
2. ✅ Scan all uploads for viruses
3. ✅ Use signed URLs with short expiry
4. ✅ Audit all file access operations
5. ✅ Encrypt files at rest (AES-256)

---

## Migration Guidelines

### From Local Storage to R2

```bash
# Sync local uploads to R2
aws s3 sync ./uploads s3://yesgoddess-assets-production/assets/ \
  --endpoint-url https://[account-id].r2.cloudflarestorage.com

# Update database storage_key fields
UPDATE ip_assets 
SET storage_key = CONCAT('assets/', id, '/', filename)
WHERE storage_key LIKE '/uploads/%';
```

### Between R2 Buckets

```bash
# Copy from staging to production
aws s3 sync \
  s3://yesgoddess-assets-staging \
  s3://yesgoddess-assets-production \
  --endpoint-url https://[account-id].r2.cloudflarestorage.com
```

---

## Troubleshooting

### Invalid Key Errors

**Symptom:** `StorageError: Storage key cannot contain path traversal`
**Cause:** Filename contains `..` or other invalid characters
**Fix:** Use `sanitizeFilename()` before generating key

### Key Too Long

**Symptom:** `StorageError: Storage key too long`
**Cause:** Filename exceeds 1024 characters
**Fix:** Truncate filename to 100 chars before extension

### Duplicate Keys

**Symptom:** File overwrites existing asset
**Cause:** Asset ID collision (extremely rare with nanoid)
**Fix:** Regenerate asset ID if conflict detected

---

**Last Updated:** January 2025  
**Maintained By:** YesGoddess Backend Team
