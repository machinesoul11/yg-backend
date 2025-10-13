# Asset Processing - Frontend Integration Guide (Part 2: Implementation)

**Classification:** 🌐 SHARED  
**Module:** Asset Processing  
**Last Updated:** October 12, 2025  
**Version:** 1.0

> **Prerequisite:** Read [Part 1: API Reference](./ASSET_PROCESSING_API_GUIDE.md) first.

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Rate Limiting & Quotas](#rate-limiting--quotas)
3. [File Upload Flow](#file-upload-flow)
4. [Real-time Updates](#real-time-updates)
5. [Pagination & Filtering](#pagination--filtering)
6. [Frontend Implementation Checklist](#frontend-implementation-checklist)
7. [React Query Integration](#react-query-integration)
8. [UI/UX Considerations](#uiux-considerations)

---

## Business Logic & Validation Rules

### File Validation (Client-Side)

Validate files **before** calling `initiateUpload` to provide instant feedback:

```typescript
interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAssetFile(file: File): FileValidationResult {
  const errors: string[] = [];

  // 1. File size validation
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (file.size > MAX_SIZE) {
    errors.push(`File size ${formatBytes(file.size)} exceeds maximum of 100MB`);
  }

  if (file.size === 0) {
    errors.push('File is empty');
  }

  // 2. MIME type validation
  const ALLOWED_TYPES = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/tiff',
    // Videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // 3D Models
    'model/gltf+json',
    'model/gltf-binary',
  ];

  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push(`File type "${file.type}" is not supported`);
  }

  // 3. File name validation
  if (file.name.length > 255) {
    errors.push('File name is too long (max 255 characters)');
  }

  const invalidChars = /[<>:"|?*\x00-\x1F]/;
  if (invalidChars.test(file.name)) {
    errors.push('File name contains invalid characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
```

### Title & Description Validation

```typescript
export function validateAssetMetadata(data: {
  title: string;
  description?: string;
}): FileValidationResult {
  const errors: string[] = [];

  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (data.title.length > 255) {
    errors.push('Title must be 255 characters or less');
  }

  // Description validation
  if (data.description && data.description.length > 2000) {
    errors.push('Description must be 2000 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Status Transitions

Frontend should enforce valid status transitions:

```typescript
const STATUS_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  PROCESSING: ['DRAFT', 'REVIEW'],
  REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  REJECTED: ['DRAFT'],
  ARCHIVED: [],
};

export function getValidStatusTransitions(currentStatus: AssetStatus): AssetStatus[] {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

export function canTransitionStatus(
  currentStatus: AssetStatus,
  newStatus: AssetStatus
): boolean {
  return STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
}
```

### Asset Type Detection

Detect asset type from MIME type for UI rendering:

```typescript
export function getAssetTypeFromMime(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('model/')) return 'MODEL_3D';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'DOCUMENT';
  return 'OTHER';
}

export function getAssetIcon(type: AssetType): string {
  const icons: Record<AssetType, string> = {
    IMAGE: '🖼️',
    VIDEO: '🎥',
    AUDIO: '🎵',
    DOCUMENT: '📄',
    MODEL_3D: '🧊',
    OTHER: '📎',
  };
  return icons[type];
}
```

---

## Rate Limiting & Quotas

### Upload Rate Limits

**Per-User Limits:**
- **Concurrent Uploads:** 3 simultaneous uploads
- **Upload Frequency:** No specific limit, but storage quotas apply
- **Storage Quota:** Varies by plan (check user account)

### API Rate Limits

The backend uses general API rate limiting (not asset-specific):

**General Limits:**
- 100 requests per minute per user
- 1000 requests per hour per user

**No specific asset endpoint limits**, but consider:
- Batch operations where possible
- Cache signed URLs (valid for 15 minutes)
- Debounce search/filter requests

### Headers to Check

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Max requests per window
  'X-RateLimit-Remaining': string;  // Remaining requests
  'X-RateLimit-Reset': string;      // Timestamp when limit resets
}

// Parse rate limit headers
function parseRateLimitHeaders(headers: Headers): {
  limit: number;
  remaining: number;
  resetAt: Date;
} | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');

  if (!limit || !remaining || !reset) return null;

  return {
    limit: parseInt(limit),
    remaining: parseInt(remaining),
    resetAt: new Date(parseInt(reset) * 1000),
  };
}
```

### Display Limits to Users

```typescript
// Show upload quota in UI
async function getUploadQuota(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> {
  // This would be a separate API call
  // For now, hardcode or calculate from assets
  const assets = await trpc.ipAssets.list.query({
    filters: { createdBy: userId },
    page: 1,
    pageSize: 1,
  });

  // Assume 10GB limit per user
  const LIMIT = 10 * 1024 * 1024 * 1024;
  const used = calculateTotalSize(assets.data);

  return {
    used,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - used),
  };
}
```

---

## File Upload Flow

### Complete Implementation

```typescript
interface UploadProgress {
  stage: 'validating' | 'initiating' | 'uploading' | 'confirming' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export async function uploadAsset(
  file: File,
  metadata: {
    title: string;
    description?: string;
    projectId?: string;
    customMetadata?: Record<string, any>;
  },
  onProgress: (progress: UploadProgress) => void
): Promise<IpAssetResponse> {
  
  // Stage 1: Validate file
  onProgress({
    stage: 'validating',
    progress: 5,
    message: 'Validating file...',
  });

  const validation = validateAssetFile(file);
  if (!validation.valid) {
    onProgress({
      stage: 'error',
      progress: 0,
      message: 'Validation failed',
      error: validation.errors.join(', '),
    });
    throw new Error(validation.errors.join(', '));
  }

  // Stage 2: Initiate upload (get signed URL)
  onProgress({
    stage: 'initiating',
    progress: 10,
    message: 'Preparing upload...',
  });

  const initResult = await trpc.ipAssets.initiateUpload.mutate({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    projectId: metadata.projectId,
  });

  // Stage 3: Upload to storage
  onProgress({
    stage: 'uploading',
    progress: 15,
    message: 'Uploading file...',
  });

  await uploadToStorage(file, initResult.uploadUrl, (uploadProgress) => {
    onProgress({
      stage: 'uploading',
      progress: 15 + (uploadProgress * 0.6), // 15-75%
      message: `Uploading... ${Math.round(uploadProgress)}%`,
    });
  });

  // Stage 4: Confirm upload
  onProgress({
    stage: 'confirming',
    progress: 80,
    message: 'Confirming upload...',
  });

  const asset = await trpc.ipAssets.confirmUpload.mutate({
    assetId: initResult.assetId,
    title: metadata.title,
    description: metadata.description,
    metadata: metadata.customMetadata,
  });

  // Stage 5: Wait for processing (optional)
  onProgress({
    stage: 'processing',
    progress: 85,
    message: 'Processing asset...',
  });

  // Poll for processing completion (optional)
  const processedAsset = await waitForProcessing(asset.id, (processingProgress) => {
    onProgress({
      stage: 'processing',
      progress: 85 + (processingProgress * 0.15), // 85-100%
      message: 'Processing asset...',
    });
  });

  onProgress({
    stage: 'complete',
    progress: 100,
    message: 'Upload complete!',
  });

  return processedAsset;
}

// Upload file to signed URL with progress tracking
async function uploadToStorage(
  file: File,
  signedUrl: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was cancelled'));
    });

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

// Wait for processing with progress updates
async function waitForProcessing(
  assetId: string,
  onProgress: (progress: number) => void
): Promise<IpAssetResponse> {
  const MAX_ATTEMPTS = 30;
  const POLL_INTERVAL = 2000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const asset = await trpc.ipAssets.getById.query({ id: assetId });

    // Update progress
    onProgress((i / MAX_ATTEMPTS) * 100);

    // Check if processing is complete
    if (asset.scanStatus === 'INFECTED') {
      throw new Error('Asset failed virus scan');
    }

    if (asset.status !== 'PROCESSING') {
      const metadata = asset.metadata as any;
      if (metadata?.thumbnailGenerated) {
        return asset;
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  // Return asset even if processing didn't complete
  return await trpc.ipAssets.getById.query({ id: assetId });
}
```

### Direct Upload (Signed URL) Flow Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. initiateUpload()
       ├──────────────────────────────┐
       │                              │
┌──────▼──────┐                ┌─────▼─────┐
│   Backend   │                │  Storage  │
│   (tRPC)    │                │    (R2)   │
└──────┬──────┘                └─────┬─────┘
       │ 2. Returns signed URL        │
       │    & asset ID                │
┌──────▼──────┐                       │
│   Browser   │                       │
│             │ 3. PUT file           │
│             ├──────────────────────►│
│             │                       │
│             │◄──────────────────────┤
│             │ 4. 200 OK             │
└──────┬──────┘                       │
       │ 5. confirmUpload()           │
       ├──────────────────────────────┘
┌──────▼──────┐
│   Backend   │
│  Triggers:  │
│  - Virus    │
│  - Thumbs   │
│  - Metadata │
└─────────────┘
```

---

## Real-time Updates

### Polling for Processing Status

Since the backend doesn't have WebSockets/SSE for asset processing, use polling:

```typescript
export function useAssetProcessing(assetId: string) {
  const [status, setStatus] = useState<{
    isProcessing: boolean;
    progress: number;
    thumbnailReady: boolean;
    previewReady: boolean;
    metadataReady: boolean;
  }>({
    isProcessing: true,
    progress: 0,
    thumbnailReady: false,
    previewReady: false,
    metadataReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;
    const MAX_POLLS = 30;

    async function poll() {
      if (cancelled || pollCount >= MAX_POLLS) return;

      try {
        const asset = await trpc.ipAssets.getById.query({ id: assetId });
        const metadata = asset.metadata as any;

        const newStatus = {
          isProcessing: asset.status === 'PROCESSING',
          progress: calculateProgress(asset, metadata),
          thumbnailReady: metadata?.thumbnailGenerated || false,
          previewReady: metadata?.previewGenerated || false,
          metadataReady: metadata?.metadataExtracted || false,
        };

        setStatus(newStatus);

        // Continue polling if still processing
        if (newStatus.isProcessing && newStatus.progress < 100) {
          pollCount++;
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (pollCount < MAX_POLLS) {
          pollCount++;
          setTimeout(poll, 5000); // Retry with longer delay
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return status;
}

function calculateProgress(asset: IpAssetResponse, metadata: any): number {
  if (asset.status !== 'PROCESSING') return 100;

  let progress = 0;
  
  // Scan complete: 30%
  if (asset.scanStatus === 'CLEAN') progress += 30;
  
  // Thumbnail generated: 30%
  if (metadata?.thumbnailGenerated) progress += 30;
  
  // Metadata extracted: 30%
  if (metadata?.metadataExtracted) progress += 30;
  
  // Preview generated: 10% (optional)
  if (metadata?.previewGenerated) progress += 10;

  return Math.min(progress, 100);
}
```

### Optimistic Updates

For instant UI feedback:

```typescript
export function useOptimisticAssetUpdate() {
  const utils = trpc.useContext();

  const updateAsset = trpc.ipAssets.update.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await utils.ipAssets.getById.cancel({ id: variables.id });

      // Snapshot previous value
      const previous = utils.ipAssets.getById.getData({ id: variables.id });

      // Optimistically update cache
      utils.ipAssets.getById.setData(
        { id: variables.id },
        (old) => old ? { ...old, ...variables } : undefined
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.ipAssets.getById.setData(
          { id: variables.id },
          context.previous
        );
      }
    },
    onSettled: (data, error, variables) => {
      // Refetch to ensure consistency
      utils.ipAssets.getById.invalidate({ id: variables.id });
    },
  });

  return updateAsset;
}
```

---

## Pagination & Filtering

### Cursor-Based Pagination (Recommended)

For infinite scroll:

```typescript
export function useInfiniteAssets(filters: ListAssetsRequest['filters']) {
  return trpc.ipAssets.list.useInfiniteQuery(
    {
      filters,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    {
      getNextPageParam: (lastPage) => {
        if (lastPage.meta.hasMore) {
          return lastPage.meta.page + 1;
        }
        return undefined;
      },
    }
  );
}

// Usage in component
function AssetGallery() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteAssets({ status: 'PUBLISHED' });

  return (
    <div>
      {data?.pages.map((page) =>
        page.data.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))
      )}
      
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

### Page-Based Pagination

For traditional pagination UI:

```typescript
export function usePagedAssets(
  filters: ListAssetsRequest['filters'],
  page: number,
  pageSize: number = 20
) {
  return trpc.ipAssets.list.useQuery({
    filters,
    page,
    pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}

// Usage in component
function AssetList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePagedAssets({}, page);

  if (!data) return <div>Loading...</div>;

  const totalPages = Math.ceil(data.meta.total / data.meta.pageSize);

  return (
    <div>
      {data.data.map((asset) => (
        <AssetListItem key={asset.id} asset={asset} />
      ))}

      <Pagination
        current={page}
        total={totalPages}
        onChange={setPage}
      />
    </div>
  );
}
```

### Advanced Filtering

```typescript
export function useAssetFilters() {
  const [filters, setFilters] = useState<ListAssetsRequest['filters']>({});

  const updateFilter = useCallback((
    key: keyof ListAssetsRequest['filters'],
    value: any
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return { filters, updateFilter, clearFilters };
}

// Usage in component
function AssetFilterPanel() {
  const { filters, updateFilter, clearFilters } = useAssetFilters();
  const { data } = usePagedAssets(filters, 1);

  return (
    <div>
      <select
        value={filters.type || ''}
        onChange={(e) => updateFilter('type', e.target.value || undefined)}
      >
        <option value="">All Types</option>
        <option value="IMAGE">Images</option>
        <option value="VIDEO">Videos</option>
        <option value="AUDIO">Audio</option>
        <option value="DOCUMENT">Documents</option>
      </select>

      <select
        value={filters.status || ''}
        onChange={(e) => updateFilter('status', e.target.value || undefined)}
      >
        <option value="">All Statuses</option>
        <option value="PUBLISHED">Published</option>
        <option value="APPROVED">Approved</option>
        <option value="REVIEW">In Review</option>
      </select>

      <input
        type="search"
        placeholder="Search assets..."
        value={filters.search || ''}
        onChange={(e) => updateFilter('search', e.target.value || undefined)}
      />

      <button onClick={clearFilters}>Clear Filters</button>

      <div>
        Found {data?.meta.total || 0} assets
      </div>
    </div>
  );
}
```

### Debounced Search

```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export function useAssetSearch(searchTerm: string, delay: number = 500) {
  const debouncedSearch = useDebouncedValue(searchTerm, delay);

  return trpc.ipAssets.list.useQuery({
    filters: { search: debouncedSearch },
    page: 1,
    pageSize: 20,
  }, {
    enabled: debouncedSearch.length >= 2, // Only search if 2+ characters
  });
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Upload (MVP)

- [ ] **File Input Component**
  - [ ] Drag-and-drop support
  - [ ] Multiple file selection
  - [ ] File preview before upload
  - [ ] Client-side validation (size, type)

- [ ] **Upload Flow**
  - [ ] Call `initiateUpload` mutation
  - [ ] Upload to signed URL with progress tracking
  - [ ] Call `confirmUpload` mutation
  - [ ] Handle upload errors gracefully

- [ ] **Upload Progress UI**
  - [ ] Show upload progress bar (0-100%)
  - [ ] Show current stage (validating, uploading, processing)
  - [ ] Cancellable uploads
  - [ ] Error messages

### Phase 2: Asset Management

- [ ] **Asset List View**
  - [ ] Grid/list toggle
  - [ ] Thumbnail display
  - [ ] Pagination (page-based or infinite scroll)
  - [ ] Loading states

- [ ] **Asset Detail View**
  - [ ] Display all asset metadata
  - [ ] Show processing status
  - [ ] Download button
  - [ ] Edit metadata button

- [ ] **Filtering & Search**
  - [ ] Type filter (IMAGE, VIDEO, etc.)
  - [ ] Status filter
  - [ ] Date range filter
  - [ ] Full-text search with debouncing

- [ ] **Asset Actions**
  - [ ] Edit title/description
  - [ ] Change status (with validation)
  - [ ] Delete asset (with confirmation)
  - [ ] Regenerate previews

### Phase 3: Advanced Features

- [ ] **Preview Variants**
  - [ ] Display appropriate thumbnail size based on context
  - [ ] Lazy loading for images
  - [ ] Video player for video assets
  - [ ] Audio player with waveform
  - [ ] PDF viewer for documents

- [ ] **Processing Status**
  - [ ] Real-time polling during processing
  - [ ] Visual indicators for processing stages
  - [ ] Retry failed processing

- [ ] **Bulk Operations**
  - [ ] Multi-select assets
  - [ ] Bulk status update
  - [ ] Bulk delete

- [ ] **Upload Queue**
  - [ ] Queue multiple uploads
  - [ ] Pause/resume uploads
  - [ ] Retry failed uploads
  - [ ] Show queue progress

### Phase 4: Polish

- [ ] **Error Handling**
  - [ ] User-friendly error messages
  - [ ] Retry mechanisms
  - [ ] Fallback thumbnails for failed processing

- [ ] **Performance**
  - [ ] Image lazy loading
  - [ ] Virtual scrolling for large lists
  - [ ] Caching signed URLs
  - [ ] Optimistic updates

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] ARIA labels
  - [ ] Screen reader support
  - [ ] Focus management

- [ ] **Mobile Optimization**
  - [ ] Responsive design
  - [ ] Touch-friendly interactions
  - [ ] Mobile-optimized file picker

---

## React Query Integration

### tRPC + React Query Setup

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

### Provider Setup

```typescript
// pages/_app.tsx
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          headers() {
            const token = localStorage.getItem('authToken');
            return {
              authorization: token ? `Bearer ${token}` : '',
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Custom Hooks

```typescript
// hooks/useAsset.ts
export function useAsset(assetId: string) {
  return trpc.ipAssets.getById.useQuery(
    { id: assetId },
    {
      enabled: !!assetId,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}

// hooks/useAssetUpload.ts
export function useAssetUpload() {
  const utils = trpc.useContext();

  const initiate = trpc.ipAssets.initiateUpload.useMutation();
  const confirm = trpc.ipAssets.confirmUpload.useMutation({
    onSuccess: () => {
      // Invalidate asset list
      utils.ipAssets.list.invalidate();
    },
  });

  return { initiate, confirm };
}

// hooks/useAssetUpdate.ts
export function useAssetUpdate() {
  const utils = trpc.useContext();

  return trpc.ipAssets.update.useMutation({
    onSuccess: (data) => {
      // Update cache
      utils.ipAssets.getById.setData({ id: data.id }, data);
      // Invalidate list
      utils.ipAssets.list.invalidate();
    },
  });
}
```

---

## UI/UX Considerations

### Loading States

```typescript
function AssetCard({ assetId }: { assetId: string }) {
  const { data: asset, isLoading } = useAsset(assetId);
  const { data: variants } = trpc.ipAssets.getVariants.useQuery(
    { id: assetId },
    { enabled: !!asset }
  );

  if (isLoading) {
    return <AssetCardSkeleton />;
  }

  if (!asset) {
    return <AssetCardError message="Asset not found" />;
  }

  return (
    <div className="asset-card">
      <img
        src={variants?.thumbnails.medium?.url || '/placeholder.png'}
        alt={asset.title}
        loading="lazy"
      />
      <h3>{asset.title}</h3>
      <AssetStatusBadge status={asset.status} />
    </div>
  );
}
```

### Error States

```typescript
function AssetUploadError({ error }: { error: unknown }) {
  const message = handleAssetError(error);
  const errorCode = (error as any)?.data?.code;

  return (
    <div className="error-banner">
      <AlertIcon />
      <div>
        <h4>Upload Failed</h4>
        <p>{message}</p>
        
        {errorCode === 'ASSET_FILE_TOO_LARGE' && (
          <button onClick={() => {/* Show file compression help */}}>
            How to reduce file size
          </button>
        )}
        
        {errorCode === 'ASSET_VIRUS_DETECTED' && (
          <p className="warning">
            This file has been flagged by our security scan and cannot be uploaded.
          </p>
        )}
      </div>
    </div>
  );
}
```

### Processing Status

```typescript
function AssetProcessingStatus({ asset }: { asset: IpAssetResponse }) {
  const metadata = asset.metadata as any;
  const isProcessing = asset.status === 'PROCESSING';

  if (!isProcessing && metadata?.thumbnailGenerated) {
    return <Badge color="green">Ready</Badge>;
  }

  if (asset.scanStatus === 'PENDING') {
    return (
      <Badge color="yellow">
        <Spinner size="sm" /> Scanning for viruses...
      </Badge>
    );
  }

  if (asset.scanStatus === 'INFECTED') {
    return (
      <Badge color="red">
        <AlertIcon /> Virus detected
      </Badge>
    );
  }

  if (isProcessing) {
    const steps = [
      { name: 'Virus scan', complete: asset.scanStatus === 'CLEAN' },
      { name: 'Thumbnail', complete: metadata?.thumbnailGenerated },
      { name: 'Metadata', complete: metadata?.metadataExtracted },
    ];

    const completed = steps.filter(s => s.complete).length;
    const progress = (completed / steps.length) * 100;

    return (
      <div>
        <Progress value={progress} />
        <span>{Math.round(progress)}% complete</span>
      </div>
    );
  }

  return null;
}
```

### Thumbnail Fallbacks

```typescript
function AssetThumbnail({ asset }: { asset: IpAssetResponse }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: asset.id,
  });

  const [imageError, setImageError] = useState(false);

  // Fallback order: thumbnail → placeholder by type
  const thumbnailUrl = variants?.thumbnails.medium?.url;

  if (imageError || !thumbnailUrl) {
    return <AssetTypePlaceholder type={asset.type} />;
  }

  return (
    <img
      src={thumbnailUrl}
      alt={asset.title}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}

function AssetTypePlaceholder({ type }: { type: AssetType }) {
  const placeholders = {
    IMAGE: '🖼️',
    VIDEO: '🎥',
    AUDIO: '🎵',
    DOCUMENT: '📄',
    MODEL_3D: '🧊',
    OTHER: '📎',
  };

  return (
    <div className="asset-placeholder">
      <span className="asset-icon">{placeholders[type]}</span>
    </div>
  );
}
```

### Mobile Upload Experience

```typescript
function MobileUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="mobile-upload-button"
      >
        <UploadIcon />
        Upload Asset
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf"
        multiple
        capture="environment" // Use camera on mobile
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  );
}
```

---

## Edge Cases to Handle

### 1. Slow Processing

Some assets (large videos) may take 5+ minutes to process:

```typescript
// Show a "processing in background" message after 30 seconds
if (processingTime > 30000) {
  return (
    <Notice>
      This asset is still processing in the background.
      You can continue working and check back later.
    </Notice>
  );
}
```

### 2. Expired Signed URLs

Signed URLs expire after 15 minutes:

```typescript
// Check expiry before using URL
function isUrlExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// Re-fetch if expired
if (isUrlExpired(preview.expiresAt)) {
  const freshPreview = await trpc.ipAssets.getPreview.query({
    id: assetId,
    size: 'medium',
  });
  // Use freshPreview.url
}
```

### 3. Processing Failures

```typescript
// If thumbnail generation fails, show retry option
if (asset.status === 'PUBLISHED' && !metadata?.thumbnailGenerated) {
  return (
    <button onClick={() => regeneratePreview.mutate({ id: asset.id })}>
      Regenerate Thumbnail
    </button>
  );
}
```

### 4. Network Interruptions During Upload

```typescript
// Implement retry logic
async function uploadWithRetry(file: File, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadAsset(file, metadata, onProgress);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

---

## Testing Recommendations

### Unit Tests

```typescript
describe('validateAssetFile', () => {
  it('should reject files over 100MB', () => {
    const largeFile = new File(['x'], 'large.jpg', {
      type: 'image/jpeg',
      size: 101 * 1024 * 1024,
    });
    
    const result = validateAssetFile(largeFile);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('100MB');
  });

  it('should reject unsupported MIME types', () => {
    const invalidFile = new File(['x'], 'test.xyz', {
      type: 'application/xyz',
    });
    
    const result = validateAssetFile(invalidFile);
    expect(result.valid).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Asset Upload Flow', () => {
  it('should complete full upload flow', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    // Mock API responses
    mockTRPC.ipAssets.initiateUpload.mockResolvedValue({
      uploadUrl: 'https://storage.example.com/upload',
      assetId: 'test-id',
      storageKey: 'test/key',
    });

    mockTRPC.ipAssets.confirmUpload.mockResolvedValue({
      id: 'test-id',
      status: 'PROCESSING',
      // ... other fields
    });

    const result = await uploadAsset(file, {
      title: 'Test Asset',
    }, jest.fn());

    expect(result.id).toBe('test-id');
  });
});
```

---

## Summary

This implementation guide provides:

✅ Complete validation logic  
✅ Full upload flow with progress tracking  
✅ Polling strategy for processing status  
✅ Pagination and filtering patterns  
✅ React Query/tRPC integration examples  
✅ Error handling patterns  
✅ UI/UX best practices  
✅ Mobile optimization tips  
✅ Edge case handling  

### Next Steps

1. Start with Phase 1 (Basic Upload)
2. Test thoroughly with various file types
3. Add error handling and retry logic
4. Implement asset management UI
5. Add advanced features (bulk operations, etc.)
6. Optimize performance (lazy loading, caching)
7. Test on mobile devices

### Questions?

If you need clarification on any endpoint or feature, refer to:
- [Part 1: API Reference](./ASSET_PROCESSING_API_GUIDE.md)
- Backend docs: `/docs/modules/ip-assets/`
- Schema definition: `/prisma/schema.prisma`

---

**Last Updated:** October 12, 2025  
**Maintained by:** Backend Team  
**For Frontend Team:** yesgoddess-web repository
