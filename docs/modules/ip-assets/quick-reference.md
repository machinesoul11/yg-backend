# IP Assets Module - Quick Reference

## 🚀 Quick Start

### Import the Module
```typescript
import { ipAssetsRouter } from '@/modules/ip';
```

### Add to Main Router
```typescript
export const appRouter = createTRPCRouter({
  // ...other routers
  ipAssets: ipAssetsRouter,
});
```

## 📦 Database Schema

### IpAsset Model
```prisma
model IpAsset {
  id            String      @id @default(cuid())
  projectId     String?
  title         String
  description   String?
  type          AssetType   // IMAGE, VIDEO, AUDIO, DOCUMENT, THREE_D, OTHER
  storageKey    String      @unique
  fileSize      BigInt
  mimeType      String
  thumbnailUrl  String?
  previewUrl    String?
  version       Int         @default(1)
  parentAssetId String?
  metadata      Json?
  status        AssetStatus // DRAFT, PROCESSING, REVIEW, APPROVED, PUBLISHED, REJECTED, ARCHIVED
  scanStatus    ScanStatus  // PENDING, SCANNING, CLEAN, INFECTED, ERROR
  scanResult    Json?
  createdBy     String
  updatedBy     String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  deletedAt     DateTime?
}
```

## 🔌 API Endpoints (tRPC)

### 1. Initiate Upload
```typescript
const { uploadUrl, assetId, storageKey } = await trpc.ipAssets.initiateUpload.mutate({
  fileName: 'photo.jpg',
  fileSize: 1024000,
  mimeType: 'image/jpeg',
  projectId?: 'project_123', // Optional
});
```

### 2. Confirm Upload
```typescript
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId: 'asset_123',
  title: 'Beautiful Landscape',
  description: 'Sunset over mountains',
  metadata: { width: 1920, height: 1080 },
});
```

### 3. List Assets
```typescript
const { data, meta } = await trpc.ipAssets.list.useQuery({
  filters: {
    projectId?: 'project_123',
    type?: 'IMAGE',
    status?: 'APPROVED',
    createdBy?: 'user_123',
    search?: 'landscape',
    fromDate?: '2025-01-01T00:00:00Z',
    toDate?: '2025-12-31T23:59:59Z',
  },
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt', // 'createdAt' | 'updatedAt' | 'title'
  sortOrder: 'desc', // 'asc' | 'desc'
});
```

### 4. Get Asset by ID
```typescript
const asset = await trpc.ipAssets.getById.useQuery({
  id: 'asset_123',
});
```

### 5. Update Asset
```typescript
const updated = await trpc.ipAssets.update.mutate({
  id: 'asset_123',
  title: 'New Title',
  description: 'Updated description',
  metadata: { tags: ['nature', 'landscape'] },
});
```

### 6. Update Status
```typescript
const updated = await trpc.ipAssets.updateStatus.mutate({
  id: 'asset_123',
  status: 'APPROVED',
  notes: 'Looks great!',
});
```

### 7. Delete Asset
```typescript
const { success } = await trpc.ipAssets.delete.mutate({
  id: 'asset_123',
});
```

### 8. Get Download URL
```typescript
const { url, expiresAt } = await trpc.ipAssets.getDownloadUrl.useQuery({
  id: 'asset_123',
});
// URL expires in 15 minutes
```

### 9. Get Derivatives
```typescript
const derivatives = await trpc.ipAssets.getDerivatives.useQuery({
  parentAssetId: 'asset_123',
});
```

### 10. Bulk Update Status (Admin Only)
```typescript
const { updated, errors } = await trpc.ipAssets.bulkUpdateStatus.mutate({
  assetIds: ['asset_1', 'asset_2', 'asset_3'],
  status: 'APPROVED',
});
```

## 🎯 Status Workflow

### Valid Transitions
```
DRAFT → REVIEW, ARCHIVED
PROCESSING → DRAFT, REVIEW
REVIEW → APPROVED, REJECTED, DRAFT
APPROVED → PUBLISHED, ARCHIVED
PUBLISHED → ARCHIVED
REJECTED → DRAFT
ARCHIVED → (none)
```

### Example Status Flow
```typescript
// Creator uploads
DRAFT (initial) → PROCESSING (upload confirmed)
  ↓ (virus scan + thumbnail generation complete)
REVIEW (ready for admin approval)
  ↓ (admin approves)
APPROVED
  ↓ (brand licenses)
PUBLISHED
```

## 📂 File Upload Flow

### Complete Upload Sequence
```typescript
// 1. Initiate upload (get signed URL)
const { uploadUrl, assetId } = await trpc.ipAssets.initiateUpload.mutate({
  fileName: file.name,
  fileSize: file.size,
  mimeType: file.type,
});

// 2. Upload file directly to storage (browser-side)
const response = await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
  },
});

if (!response.ok) {
  throw new Error('Upload failed');
}

// 3. Confirm upload (triggers background processing)
const asset = await trpc.ipAssets.confirmUpload.mutate({
  assetId,
  title: 'My Asset',
  description: 'Asset description',
});

// 4. Poll for processing completion
const checkStatus = async () => {
  const { scanStatus, status } = await trpc.ipAssets.getById.useQuery({
    id: assetId,
  });
  
  if (scanStatus === 'CLEAN' && status === 'REVIEW') {
    // Asset ready!
  }
};
```

## 🔒 Security & Permissions

### Row-Level Security
```typescript
// Non-admin users see only their own assets
const assets = await trpc.ipAssets.list.useQuery({});
// Automatically filtered by createdBy: currentUserId

// Admin users see all assets
const allAssets = await trpc.ipAssets.list.useQuery({});
// No createdBy filter applied
```

### Permission Checks
| Action | Creator | Admin | Notes |
|--------|---------|-------|-------|
| Upload | ✅ | ✅ | Anyone can upload |
| View own | ✅ | ✅ | Always allowed |
| View others | ❌ | ✅ | Admin only |
| Update metadata | ✅ (own) | ✅ | Creator or admin |
| Change status | ✅ (limited) | ✅ | Some transitions admin-only |
| Delete | ✅ (own) | ✅ | Cannot delete if licensed |
| Bulk operations | ❌ | ✅ | Admin only |

## 📊 Response Types

### IpAssetResponse
```typescript
{
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  version: number;
  parentAssetId: string | null;
  metadata: Record<string, any> | null;
  status: AssetStatus;
  scanStatus: ScanStatus;
  createdBy: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  canEdit: boolean;
  canDelete: boolean;
  downloadUrl?: string; // Only in getById response
}
```

### AssetListResponse
```typescript
{
  data: IpAssetResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}
```

## ⚠️ Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ASSET_NOT_FOUND` | 404 | Asset doesn't exist |
| `ASSET_ACCESS_DENIED` | 403 | No permission to access |
| `ASSET_UPLOAD_FAILED` | 500 | Upload operation failed |
| `ASSET_INVALID_STATUS_TRANSITION` | 400 | Invalid status change |
| `ASSET_HAS_ACTIVE_LICENSES` | 409 | Cannot delete licensed asset |
| `ASSET_VIRUS_DETECTED` | 400 | File failed virus scan |
| `ASSET_INVALID_FILE_TYPE` | 400 | MIME type not allowed |
| `ASSET_FILE_TOO_LARGE` | 400 | Exceeds 100MB limit |
| `ASSET_STORAGE_ERROR` | 500 | Storage operation failed |
| `ASSET_PROCESSING_FAILED` | 500 | Background job failed |

## 🛠️ Service Layer (Direct Usage)

```typescript
import { IpAssetService } from '@/modules/ip';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';

const service = new IpAssetService(prisma, storageProvider);

// All methods require context
const ctx = {
  userId: 'user_123',
  userRole: 'CREATOR', // or 'ADMIN'
};

// Initiate upload
const result = await service.initiateUpload(ctx, {
  fileName: 'photo.jpg',
  fileSize: 1024000,
  mimeType: 'image/jpeg',
});

// List assets
const assets = await service.listAssets(ctx, {
  filters: { type: 'IMAGE' },
  page: 1,
  pageSize: 20,
});

// Update status
await service.updateStatus(ctx, {
  id: 'asset_123',
  status: 'APPROVED',
});
```

## 🔧 Configuration

### File Constraints
```typescript
MAX_FILE_SIZE: 100 * 1024 * 1024 // 100MB
SIGNED_URL_EXPIRY: 900 // 15 minutes
```

### Allowed MIME Types
- **Images**: jpeg, png, gif, webp, svg, tiff
- **Videos**: mp4, quicktime, avi, mkv, webm
- **Audio**: mpeg, wav, ogg, aac
- **Documents**: pdf, doc, docx, xls, xlsx, ppt, pptx
- **3D**: gltf, obj

### Cache TTL (when Redis is integrated)
```typescript
ASSET_LIST: 300      // 5 minutes
ASSET_DETAILS: 600   // 10 minutes
DOWNLOAD_URL: 900    // 15 minutes
METADATA: 3600       // 1 hour
```

## 📝 Metadata Schema Examples

### Image Metadata
```typescript
{
  width: 1920,
  height: 1080,
  format: 'jpeg',
  colorSpace: 'sRGB',
  hasAlpha: false,
  exif: {
    camera: 'Canon EOS R5',
    dateTaken: '2025-01-15T14:30:00Z',
    focalLength: 50,
    iso: 100,
    location: { lat: 37.7749, lng: -122.4194 }
  }
}
```

### Video Metadata
```typescript
{
  duration: 120.5,
  codec: 'h264',
  fps: 30,
  bitrate: 5000000,
  resolution: '1920x1080',
  width: 1920,
  height: 1080
}
```

### Audio Metadata
```typescript
{
  duration: 245.7,
  bitrate: 320000,
  artist: 'Artist Name',
  album: 'Album Name',
  title: 'Track Title'
}
```

### Document Metadata
```typescript
{
  pageCount: 24,
  author: 'John Doe',
  title: 'Project Proposal',
  creator: 'Microsoft Word',
  creationDate: '2025-01-15T10:00:00Z'
}
```

## 🎨 Frontend Component Example

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function AssetUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const initiate = trpc.ipAssets.initiateUpload.useMutation();
  const confirm = trpc.ipAssets.confirmUpload.useMutation();
  
  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    try {
      // 1. Initiate
      const { uploadUrl, assetId } = await initiate.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      
      // 2. Upload to storage
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      
      // 3. Confirm
      await confirm.mutateAsync({
        assetId,
        title: file.name,
        description: 'Uploaded via web',
      });
      
      alert('Upload successful!');
    } catch (error) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  );
}
```

---

**Module**: IP Assets  
**Status**: ✅ Ready for integration  
**Version**: 1.0.0
