# File Viewer/Preview Service - Quick Reference

## 🔌 New API Endpoints

### 1. Get Preview URL
```typescript
const preview = await trpc.ipAssets.getPreview.useQuery({
  id: 'asset_123',
  size: 'medium', // 'small' | 'medium' | 'large' | 'original'
});
// Returns: { url, size, width, height, expiresAt }
```

### 2. Get Metadata
```typescript
const metadata = await trpc.ipAssets.getMetadata.useQuery({
  id: 'asset_123',
  fields: ['technical', 'descriptive'], // Optional filtering
});
// Returns: { type, technical, descriptive, extracted, processing }
```

### 3. Get Variants
```typescript
const variants = await trpc.ipAssets.getVariants.useQuery({
  id: 'asset_123',
  type: 'all', // 'thumbnail' | 'preview' | 'all'
});
// Returns: { thumbnails: {small, medium, large}, previews: {...}, waveform: {...} }
```

### 4. Regenerate Preview
```typescript
const job = await trpc.ipAssets.regeneratePreview.mutate({
  id: 'asset_123',
  types: ['thumbnail', 'preview'], // Or ['all']
});
// Returns: { jobId, status, types }
```

---

## 📊 Preview Sizes

| Size | Dimensions | Use Case |
|------|-----------|----------|
| **Small** | 200x200 | List views, grid thumbnails |
| **Medium** | 400x400 | Card previews, quick view |
| **Large** | 800x800 | Detail view, lightbox |
| **Original** | Native size | Download, full quality |

---

## 🎨 Supported File Types

### Images ✅
- Formats: JPEG, PNG, GIF, WebP, TIFF, SVG
- Thumbnails: 3 sizes (small, medium, large)
- Metadata: EXIF, dimensions, color space

### Videos ✅
- Formats: MP4, MOV, AVI, MKV, WebM
- Thumbnails: Extracted from 10% into video
- Metadata: Duration, codec, resolution, FPS, bitrate
- Preview: 10-second clip (queued separately)

### Audio ✅
- Formats: MP3, WAV, OGG, AAC, FLAC
- Waveform: Visual representation as PNG
- Metadata: ID3 tags, duration, bitrate, sample rate
- Preview: 30-second clip (queued separately)

### Documents ✅
- Formats: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX
- Thumbnails: Placeholder with page count
- Metadata: Page count, author, creation date, text content
- Preview: First page rendering (placeholder currently)

---

## 🔐 Security & Access Control

### Authentication
```typescript
// All endpoints require authentication
// Uses protectedProcedure - must be logged in
```

### Authorization
- **Creators**: Can access their own assets only
- **Admins**: Can access all assets
- **Future**: Licensees can access licensed assets

### Signed URLs
- All preview URLs expire after **15 minutes**
- URLs are signed and cannot be reused after expiry
- Use the `expiresAt` field to know when to refresh

---

## ⚡ Performance Tips

### Caching
```typescript
// Queries are cached automatically by tRPC
// Preview URLs: 15 minutes (matches expiry)
// Metadata: 1 hour
// Variants list: 15 minutes

// Force refresh if needed:
const { data, refetch } = trpc.ipAssets.getPreview.useQuery({
  id: assetId,
});
await refetch();
```

### Loading States
```typescript
const { data: preview, isLoading, isError } = trpc.ipAssets.getPreview.useQuery({
  id: assetId,
});

if (isLoading) return <Spinner />;
if (isError) return <ErrorMessage />;
if (!preview) return <NoPreview />;
```

### Responsive Images
```typescript
// Use variants for responsive images
const { data: variants } = trpc.ipAssets.getVariants.useQuery({ id: assetId });

<picture>
  <source media="(max-width: 400px)" srcSet={variants.thumbnails.small?.url} />
  <source media="(max-width: 800px)" srcSet={variants.thumbnails.medium?.url} />
  <img src={variants.thumbnails.large?.url} loading="lazy" />
</picture>
```

---

## 🔄 Background Processing

### Job Flow
```
Upload Confirmed
    ↓
├─ Metadata Extraction (Priority: High)
├─ Thumbnail Generation (Priority: High)
└─ Preview Generation (Priority: Medium)
    ↓
Database Updated
```

### Checking Status
```typescript
const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['processing'],
});

if (!metadata.processing.thumbnailGenerated) {
  // Still generating...
  return <ProcessingBadge />;
}
```

### Manual Regeneration
```typescript
// When previews fail or need updating
const regenerate = trpc.ipAssets.regeneratePreview.useMutation();

await regenerate.mutateAsync({
  id: assetId,
  types: ['thumbnail'], // Or ['all'] for everything
});
```

---

## 🐛 Error Handling

```typescript
const { data, error } = trpc.ipAssets.getPreview.useQuery({
  id: assetId,
});

if (error) {
  if (error.data?.code === 'NOT_FOUND') {
    // Asset doesn't exist
  } else if (error.data?.code === 'FORBIDDEN') {
    // No permission to access
  } else if (error.data?.code === 'INTERNAL_SERVER_ERROR') {
    // Processing error
  }
}
```

---

## 📦 Complete Example Component

```typescript
import { trpc } from '@/lib/trpc';

export function AssetPreviewCard({ assetId }: { assetId: string }) {
  // Get asset details
  const { data: asset } = trpc.ipAssets.getById.useQuery({ id: assetId });
  
  // Get preview
  const { data: preview, isLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });
  
  // Get metadata
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'processing'],
  });

  // Regenerate mutation
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation();

  const handleRegenerate = async () => {
    await regenerate.mutateAsync({
      id: assetId,
      types: ['thumbnail', 'preview'],
    });
  };

  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 h-64 w-full rounded" />;
  }

  const isProcessing = !metadata?.processing?.thumbnailGenerated;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Preview Image */}
      {preview && !isProcessing && (
        <img 
          src={preview.url} 
          alt={asset?.title}
          className="w-full h-64 object-cover"
        />
      )}
      
      {/* Processing State */}
      {isProcessing && (
        <div className="h-64 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <Spinner />
            <p className="mt-2 text-sm text-gray-600">Generating preview...</p>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold">{asset?.title}</h3>
        
        {metadata?.technical && (
          <p className="text-sm text-gray-600">
            {metadata.technical.width} × {metadata.technical.height}
            {metadata.technical.duration && ` • ${formatDuration(metadata.technical.duration)}`}
          </p>
        )}

        {/* Regenerate Button (for failed previews) */}
        {metadata?.processing?.thumbnailGenerated === false && (
          <button 
            onClick={handleRegenerate}
            disabled={regenerate.isLoading}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {regenerate.isLoading ? 'Regenerating...' : 'Regenerate Preview'}
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 🔗 Related Endpoints

### Existing IP Assets Endpoints
- `ipAssets.initiateUpload` - Start file upload
- `ipAssets.confirmUpload` - Complete upload (triggers preview generation)
- `ipAssets.list` - List assets
- `ipAssets.getById` - Get asset details
- `ipAssets.getDownloadUrl` - Get original file URL
- `ipAssets.update` - Update asset metadata
- `ipAssets.delete` - Delete asset

### New Preview Endpoints (Added)
- ✅ `ipAssets.getPreview` - Get preview with size selection
- ✅ `ipAssets.getMetadata` - Get extracted metadata
- ✅ `ipAssets.getVariants` - List all variants
- ✅ `ipAssets.regeneratePreview` - Trigger regeneration

---

## 📚 Further Reading

- [Full Documentation](./file-viewer-service.md)
- [IP Assets Module](./overview.md)
- [Storage Infrastructure](../../infrastructure/storage/implementation.md)
- [Background Jobs](../../jobs/README.md)
