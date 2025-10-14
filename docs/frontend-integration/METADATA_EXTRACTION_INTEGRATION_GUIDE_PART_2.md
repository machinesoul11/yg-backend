# Metadata Extraction & File Viewer - Frontend Integration Guide (Part 2)

**Classification:** 🌐 SHARED  
**Last Updated:** October 13, 2025  
**Part 1:** [API Reference & Core Documentation](./METADATA_EXTRACTION_INTEGRATION_GUIDE_PART_1.md)

---

## Table of Contents

- [Authorization & Permissions](#authorization--permissions)
- [Rate Limiting & Quotas](#rate-limiting--quotas)
- [Real-time Updates](#real-time-updates)
- [Pagination & Filtering](#pagination--filtering)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)
- [React Component Examples](#react-component-examples)
- [API Client Setup](#api-client-setup)
- [Testing Guide](#testing-guide)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

---

## Authorization & Permissions

### Permission Model

The metadata extraction and file viewer system uses a **hierarchical permission model**:

```
┌─────────────────────────────────────────────────────────┐
│                        ADMIN                            │
│  - Full access to all assets                           │
│  - Can regenerate any preview                          │
│  - Can view all metadata                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                       CREATOR                           │
│  - Full access to own assets                           │
│  - Can regenerate own previews                         │
│  - Can view own metadata                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                      LICENSEE                           │
│  - Read-only access to licensed assets                 │
│  - Can view previews of licensed assets                │
│  - Can view metadata of licensed assets                │
│  - Cannot regenerate previews                          │
└─────────────────────────────────────────────────────────┘
```

### Role-Based Access Control

| Endpoint                    | Creator (Own) | Creator (Other) | Admin | Licensee | Public |
| --------------------------- | ------------- | --------------- | ----- | -------- | ------ |
| `getPreview`                | ✅ Read       | ❌ Denied       | ✅ Read | ✅ Read  | ❌     |
| `getMetadata`               | ✅ Read       | ❌ Denied       | ✅ Read | ✅ Read  | ❌     |
| `getVariants`               | ✅ Read       | ❌ Denied       | ✅ Read | ✅ Read  | ❌     |
| `regeneratePreview`         | ✅ Write      | ❌ Denied       | ✅ Write| ❌ Denied| ❌     |

### Field-Level Permissions

Currently, **no field-level restrictions** exist—all authenticated users with asset access can view all metadata fields. Future enhancements may restrict sensitive EXIF data (GPS coordinates, personal info).

### Resource Ownership Rules

```typescript
// Ownership is determined by:
// 1. Asset creator (ip_assets.created_by)
// 2. User role (ADMIN has access to all)
// 3. License relationships (future: licensees can access licensed assets)

async function checkAssetAccess(
  userId: string,
  userRole: string,
  assetId: string
): Promise<boolean> {
  const asset = await prisma.ipAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) return false;

  // Admin has full access
  if (userRole === 'ADMIN') return true;

  // Creator has access to own assets
  if (asset.createdBy === userId) return true;

  // TODO: Check license relationships
  // const hasLicense = await checkLicenseAccess(userId, assetId);
  // if (hasLicense) return true;

  return false;
}
```

### Frontend Permission Checks

```typescript
import { useSession } from 'next-auth/react';

function AssetActions({ asset }: { asset: Asset }) {
  const { data: session } = useSession();
  
  const canRegenerate = 
    session?.user.role === 'ADMIN' || 
    session?.user.id === asset.createdBy;

  return (
    <div>
      {canRegenerate && (
        <Button onClick={handleRegenerate}>
          Regenerate Preview
        </Button>
      )}
    </div>
  );
}
```

---

## Rate Limiting & Quotas

### Rate Limits

| Endpoint              | Rate Limit          | Window  | Burst Allowance |
| --------------------- | ------------------- | ------- | --------------- |
| `getPreview`          | 100 req/min/user    | 1 min   | 120 req         |
| `getMetadata`         | 100 req/min/user    | 1 min   | 120 req         |
| `getVariants`         | 50 req/min/user     | 1 min   | 60 req          |
| `regeneratePreview`   | 10 req/hour/user    | 1 hour  | 15 req          |

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1728835800
```

### Handling Rate Limit Errors

**Error Response (429 Too Many Requests):**
```json
{
  "error": {
    "json": {
      "message": "Too many requests",
      "code": "TOO_MANY_REQUESTS",
      "data": {
        "retryAfter": 60,
        "limit": 100,
        "window": "1 minute"
      }
    }
  }
}
```

**Frontend Handling:**
```typescript
function useAssetPreview(assetId: string) {
  const { data, error } = trpc.ipAssets.getPreview.useQuery(
    { id: assetId, size: 'medium' },
    {
      retry: (failureCount, error) => {
        // Don't retry on rate limit errors
        if (error.data?.httpStatus === 429) {
          return false;
        }
        return failureCount < 3;
      },
    }
  );

  if (error?.data?.httpStatus === 429) {
    const retryAfter = error.data.retryAfter || 60;
    toast.error(`Too many requests. Please wait ${retryAfter} seconds.`);
  }

  return { data, error };
}
```

### Displaying Rate Limits to Users

```typescript
function RegenerateButton({ assetId }: { assetId: string }) {
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    remaining: number;
    reset: number;
  } | null>(null);

  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: (data, variables, context: any) => {
      // Extract rate limit headers from response
      const headers = context?.response?.headers;
      setRateLimitInfo({
        remaining: parseInt(headers?.get('X-RateLimit-Remaining') || '0'),
        reset: parseInt(headers?.get('X-RateLimit-Reset') || '0'),
      });
    },
  });

  return (
    <div>
      <Button 
        onClick={() => regenerate.mutate({ id: assetId })}
        disabled={rateLimitInfo?.remaining === 0}
      >
        Regenerate Preview
      </Button>
      {rateLimitInfo && (
        <p className="text-sm text-muted-foreground">
          {rateLimitInfo.remaining} regenerations remaining
        </p>
      )}
    </div>
  );
}
```

### Best Practices

1. **Batch Requests:** Use `getVariants` instead of multiple `getPreview` calls
2. **Cache Aggressively:** Cache preview URLs for 14 minutes (expiry is 15 min)
3. **Debounce Regeneration:** Prevent users from spamming regenerate button
4. **Show Feedback:** Display remaining quota to users

```typescript
// Debounced regenerate button
import { useDebouncedCallback } from 'use-debounce';

function RegenerateButton({ assetId }: { assetId: string }) {
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation();

  const debouncedRegenerate = useDebouncedCallback(
    () => {
      regenerate.mutate({ id: assetId });
    },
    2000, // 2 second debounce
    { leading: true, trailing: false }
  );

  return (
    <Button onClick={debouncedRegenerate}>
      Regenerate Preview
    </Button>
  );
}
```

---

## Real-time Updates

### Processing Status Updates

The backend uses **background job queues** for asset processing. There are **no WebSocket/SSE endpoints** currently implemented. Use **polling** to check processing status.

### Polling Strategy

```typescript
function useAssetProcessingStatus(assetId: string) {
  const { data, isLoading } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      // Poll every 5 seconds while processing
      refetchInterval: (data) => {
        const processing = data?.processing;
        
        // Stop polling if all complete
        if (
          processing?.thumbnailGenerated &&
          processing?.previewGenerated &&
          processing?.metadataExtracted
        ) {
          return false;
        }
        
        // Poll every 5 seconds
        return 5000;
      },
      // Don't refetch on window focus during processing
      refetchOnWindowFocus: false,
    }
  );

  const isComplete = 
    data?.processing?.thumbnailGenerated &&
    data?.processing?.previewGenerated &&
    data?.processing?.metadataExtracted;

  return {
    data,
    isLoading,
    isComplete,
    isProcessing: !isComplete,
  };
}
```

### Progressive Enhancement

Show previews as they become available:

```typescript
function AssetPreview({ assetId }: { assetId: string }) {
  const { data: metadata } = useAssetProcessingStatus(assetId);
  const { data: preview } = trpc.ipAssets.getPreview.useQuery(
    { id: assetId, size: 'medium' },
    {
      // Only fetch preview if thumbnail is generated
      enabled: metadata?.processing?.thumbnailGenerated || false,
    }
  );

  if (!metadata?.processing?.thumbnailGenerated) {
    return (
      <div className="flex items-center gap-2">
        <Spinner />
        <p>Generating thumbnail...</p>
      </div>
    );
  }

  return <img src={preview?.url} alt="Preview" />;
}
```

### Webhook Events (Future)

**Note:** Webhooks are not yet implemented, but planned for future releases.

**Proposed Events:**
- `asset.thumbnail.generated` - Thumbnail generation complete
- `asset.preview.generated` - Preview clip generation complete
- `asset.metadata.extracted` - Metadata extraction complete
- `asset.processing.failed` - Processing job failed

**Proposed Payload:**
```typescript
{
  event: 'asset.thumbnail.generated',
  assetId: 'cm1abc123xyz',
  timestamp: '2025-10-13T14:15:30.000Z',
  data: {
    sizes: ['small', 'medium', 'large'],
    processingTime: 8.5, // seconds
  }
}
```

---

## Pagination & Filtering

### Note on Pagination

The **metadata extraction and file viewer endpoints do not use pagination** as they operate on individual assets. For listing multiple assets, use the main `ipAssets.list` endpoint (documented separately).

### Filtering Metadata Fields

Use the `fields` parameter to reduce response size:

```typescript
// Get only technical metadata (optimized for metadata display)
const { data } = trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['technical'],
});

// Get only processing status (optimized for polling)
const { data } = trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['processing'],
});

// Get multiple field groups
const { data } = trpc.ipAssets.getMetadata.useQuery({
  id: assetId,
  fields: ['technical', 'descriptive'],
});
```

### Filtering Variants

Use the `type` parameter to reduce response size:

```typescript
// Get only thumbnails
const { data } = trpc.ipAssets.getVariants.useQuery({
  id: assetId,
  type: 'thumbnail',
});

// Get only preview clips
const { data } = trpc.ipAssets.getVariants.useQuery({
  id: assetId,
  type: 'preview',
});

// Get everything (default)
const { data } = trpc.ipAssets.getVariants.useQuery({
  id: assetId,
  type: 'all',
});
```

---

## Frontend Implementation Checklist

### Phase 1: Core API Integration (Week 1)

#### Setup & Configuration
- [ ] Install/update tRPC client in frontend repo
- [ ] Configure tRPC client with JWT authentication
- [ ] Add type definitions from Part 1 to `@/types/assets.ts`
- [ ] Set up environment variables for API base URL

#### Basic Preview Display
- [ ] Create `useAssetPreview` hook for fetching preview URLs
- [ ] Implement basic `<AssetPreview>` component with loading states
- [ ] Add error handling for 404/403 errors
- [ ] Implement URL expiration detection and refetch logic

#### Metadata Display
- [ ] Create `useAssetMetadata` hook with field filtering
- [ ] Implement `<AssetMetadata>` component for technical metadata
- [ ] Add EXIF data display component for images
- [ ] Format duration, bitrate, and file size values

---

### Phase 2: Advanced Features (Week 2)

#### Multiple Size Variants
- [ ] Implement responsive image loading with `getVariants`
- [ ] Create `<ResponsiveAssetImage>` component with srcset
- [ ] Add size selection UI (small/medium/large toggle)
- [ ] Implement lazy loading for gallery views

#### Processing Status Indicators
- [ ] Create `useAssetProcessingStatus` hook with polling
- [ ] Implement progress indicators during processing
- [ ] Add "Processing..." overlays on thumbnails
- [ ] Show estimated completion time based on asset type

#### Regeneration UI
- [ ] Implement regenerate button with permission checks
- [ ] Add confirmation dialog for regeneration
- [ ] Show regeneration progress with polling
- [ ] Display rate limit information to users

---

### Phase 3: Optimization & Polish (Week 3)

#### Performance Optimization
- [ ] Implement aggressive caching for preview URLs (14 min TTL)
- [ ] Add request deduplication for parallel component renders
- [ ] Prefetch variants on hover for quick navigation
- [ ] Implement virtual scrolling for large asset galleries

#### Error Handling
- [ ] Create fallback placeholders for missing previews
- [ ] Implement retry logic with exponential backoff
- [ ] Add user-friendly error messages for all scenarios
- [ ] Log errors to monitoring service

#### UX Enhancements
- [ ] Add skeleton loaders during initial load
- [ ] Implement smooth transitions between loading states
- [ ] Add download button for high-res originals
- [ ] Create lightbox/modal for full-size preview viewing

---

### Phase 4: Testing & Documentation (Week 4)

#### Testing
- [ ] Unit tests for all hooks and components
- [ ] Integration tests for API error scenarios
- [ ] E2E tests for complete upload → preview flow
- [ ] Performance testing with large asset sets

#### Documentation
- [ ] Create frontend developer guide
- [ ] Document all custom hooks with JSDoc
- [ ] Add Storybook stories for all components
- [ ] Create troubleshooting guide

---

### Edge Cases to Handle

#### 1. Preview Not Yet Generated
```typescript
if (!metadata?.processing?.thumbnailGenerated) {
  return <ProcessingIndicator type={asset.type} />;
}
```

#### 2. Preview Generation Failed
```typescript
if (metadata?.processing?.thumbnailGenerated === false && 
    metadata?.processing?.metadataExtractedAt) {
  return <RegenerateButton assetId={asset.id} />;
}
```

#### 3. AUDIO Assets (No Thumbnails)
```typescript
if (asset.type === 'AUDIO') {
  // Show waveform instead of thumbnail
  return <AudioWaveform assetId={asset.id} />;
}
```

#### 4. Very Large Files (Slow Processing)
```typescript
if (fileSize > 50_000_000) { // 50MB
  return (
    <div>
      <Spinner />
      <p>Large file detected. Processing may take several minutes...</p>
    </div>
  );
}
```

#### 5. Expired Preview URLs
```typescript
useEffect(() => {
  const checkExpiry = setInterval(() => {
    if (data?.expiresAt && new Date(data.expiresAt) < new Date()) {
      refetch();
    }
  }, 60000); // Check every minute

  return () => clearInterval(checkExpiry);
}, [data, refetch]);
```

---

### UX Considerations

#### 1. Loading States

Show appropriate loading indicators:
- **Skeleton loaders** for initial load
- **Spinners** for regeneration
- **Progress bars** for uploads

#### 2. Error States

Provide actionable error messages:
- **404:** "Asset not found" → Back to gallery
- **403:** "Access denied" → Explain licensing
- **Processing:** "Still processing" → Show ETA

#### 3. Responsive Design

Optimize for all screen sizes:
- **Mobile:** Show medium thumbnails in lists
- **Tablet:** Show large thumbnails in grids
- **Desktop:** Show large thumbnails with hover zoom

#### 4. Accessibility

- Add proper `alt` text to all preview images
- Provide keyboard navigation for galleries
- Announce processing status updates to screen readers
- Ensure sufficient color contrast for status indicators

---

## React Component Examples

### Example 1: Basic Asset Preview with Loading State

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';

interface AssetPreviewProps {
  assetId: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function AssetPreview({ 
  assetId, 
  size = 'medium',
  className 
}: AssetPreviewProps) {
  const { data, isLoading, error } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size,
  });

  if (isLoading) {
    return <Skeleton className={`aspect-square ${className}`} />;
  }

  if (error?.data?.code === 'NOT_FOUND') {
    return (
      <div className={`aspect-square bg-muted flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground">Asset not found</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`aspect-square bg-destructive/10 flex items-center justify-center ${className}`}>
        <p className="text-destructive text-sm">Failed to load preview</p>
      </div>
    );
  }

  return (
    <img
      src={data.url}
      alt="Asset preview"
      className={`object-cover ${className}`}
      width={data.width}
      height={data.height}
    />
  );
}
```

---

### Example 2: Responsive Asset Image with Multiple Sizes

```typescript
'use client';

import { trpc } from '@/lib/trpc';

interface ResponsiveAssetImageProps {
  assetId: string;
  alt: string;
  className?: string;
}

export function ResponsiveAssetImage({ 
  assetId, 
  alt,
  className 
}: ResponsiveAssetImageProps) {
  const { data, isLoading } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'thumbnail',
  });

  if (isLoading) {
    return <Skeleton className="w-full aspect-square" />;
  }

  if (!data?.thumbnails) {
    return null;
  }

  // Build srcset from available variants
  const srcset = [
    data.thumbnails.small && `${data.thumbnails.small.url} 200w`,
    data.thumbnails.medium && `${data.thumbnails.medium.url} 400w`,
    data.thumbnails.large && `${data.thumbnails.large.url} 800w`,
  ]
    .filter(Boolean)
    .join(', ');

  // Fallback to medium or first available
  const src = 
    data.thumbnails.medium?.url || 
    data.thumbnails.large?.url || 
    data.thumbnails.small?.url;

  return (
    <img
      src={src}
      srcSet={srcset}
      sizes="(max-width: 640px) 200px, (max-width: 1024px) 400px, 800px"
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}
```

---

### Example 3: Asset Metadata Display

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { formatBytes, formatDuration } from '@/lib/utils';

interface AssetMetadataProps {
  assetId: string;
}

export function AssetMetadata({ assetId }: AssetMetadataProps) {
  const { data, isLoading } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'descriptive'],
  });

  if (isLoading) {
    return <div>Loading metadata...</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Technical Details</h3>
        <dl className="grid grid-cols-2 gap-2 mt-2">
          {data.technical?.width && (
            <>
              <dt className="text-muted-foreground">Dimensions:</dt>
              <dd>{data.technical.width} × {data.technical.height} px</dd>
            </>
          )}
          {data.technical?.duration && (
            <>
              <dt className="text-muted-foreground">Duration:</dt>
              <dd>{formatDuration(data.technical.duration)}</dd>
            </>
          )}
          {data.technical?.codec && (
            <>
              <dt className="text-muted-foreground">Codec:</dt>
              <dd>{data.technical.codec.toUpperCase()}</dd>
            </>
          )}
          {data.technical?.bitrate && (
            <>
              <dt className="text-muted-foreground">Bitrate:</dt>
              <dd>{formatBytes(data.technical.bitrate / 8)}/s</dd>
            </>
          )}
        </dl>
      </div>

      {data.descriptive && (
        <div>
          <h3 className="font-semibold text-lg">Descriptive Metadata</h3>
          <dl className="grid grid-cols-2 gap-2 mt-2">
            {data.descriptive.title && (
              <>
                <dt className="text-muted-foreground">Title:</dt>
                <dd>{data.descriptive.title}</dd>
              </>
            )}
            {data.descriptive.artist && (
              <>
                <dt className="text-muted-foreground">Artist:</dt>
                <dd>{data.descriptive.artist}</dd>
              </>
            )}
            {data.descriptive.author && (
              <>
                <dt className="text-muted-foreground">Author:</dt>
                <dd>{data.descriptive.author}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
```

---

### Example 4: Processing Status Indicator

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface ProcessingStatusProps {
  assetId: string;
}

export function ProcessingStatus({ assetId }: ProcessingStatusProps) {
  const { data, isLoading } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: (data) => {
        // Stop polling when all complete
        if (
          data?.processing?.thumbnailGenerated &&
          data?.processing?.metadataExtracted
        ) {
          return false;
        }
        return 5000; // Poll every 5 seconds
      },
    }
  );

  if (isLoading) {
    return null;
  }

  const processing = data?.processing;

  return (
    <div className="space-y-2">
      <ProcessingStep
        label="Metadata Extraction"
        completed={processing?.metadataExtracted}
        timestamp={processing?.metadataExtractedAt}
      />
      <ProcessingStep
        label="Thumbnail Generation"
        completed={processing?.thumbnailGenerated}
        timestamp={processing?.thumbnailGeneratedAt}
      />
      <ProcessingStep
        label="Preview Generation"
        completed={processing?.previewGenerated}
        timestamp={processing?.previewGeneratedAt}
      />
    </div>
  );
}

function ProcessingStep({ 
  label, 
  completed, 
  timestamp 
}: { 
  label: string; 
  completed?: boolean; 
  timestamp?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {completed ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      )}
      <span className={completed ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
      </span>
      {timestamp && (
        <span className="text-xs text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
```

---

### Example 5: Regenerate Preview Button

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

interface RegenerateButtonProps {
  assetId: string;
  createdBy: string;
}

export function RegenerateButton({ assetId, createdBy }: RegenerateButtonProps) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: (data) => {
      toast.success(`Regeneration job queued: ${data.jobId}`);
      
      // Invalidate metadata to trigger refetch
      utils.ipAssets.getMetadata.invalidate({ id: assetId });
    },
    onError: (error) => {
      if (error.data?.httpStatus === 429) {
        toast.error('Rate limit exceeded. Please wait before trying again.');
      } else {
        toast.error('Failed to regenerate preview');
      }
    },
  });

  // Check permissions
  const canRegenerate = 
    session?.user.role === 'ADMIN' || 
    session?.user.id === createdBy;

  if (!canRegenerate) {
    return null;
  }

  return (
    <Button
      onClick={() => regenerate.mutate({ id: assetId })}
      disabled={regenerate.isLoading}
      size="sm"
      variant="outline"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${regenerate.isLoading ? 'animate-spin' : ''}`} />
      Regenerate Preview
    </Button>
  );
}
```

---

### Example 6: Audio Waveform Display

```typescript
'use client';

import { trpc } from '@/lib/trpc';

interface AudioWaveformProps {
  assetId: string;
  className?: string;
}

export function AudioWaveform({ assetId, className }: AudioWaveformProps) {
  const { data, isLoading } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-20" />;
  }

  if (!data?.waveform?.url) {
    return (
      <div className="bg-muted h-20 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Waveform not available</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <img
        src={data.waveform.url}
        alt="Audio waveform"
        className="w-full h-auto"
      />
    </div>
  );
}
```

---

## API Client Setup

### tRPC Client Configuration

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@your-backend/server/routers';

export const trpc = createTRPCReact<AppRouter>();
```

### Provider Setup with Authentication

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            cacheTime: 14 * 60 * 1000, // 14 minutes (before URL expiry)
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_API_URL + '/api/trpc',
          headers() {
            return {
              authorization: session?.accessToken 
                ? `Bearer ${session.accessToken}` 
                : '',
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency
```

---

## Testing Guide

### Unit Tests

```typescript
// __tests__/hooks/useAssetPreview.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { useAssetPreview } from '@/hooks/useAssetPreview';

describe('useAssetPreview', () => {
  it('should fetch preview URL', async () => {
    const { result } = renderHook(
      () => useAssetPreview('cm1abc123xyz'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.url).toMatch(/^https:\/\//);
    expect(result.current.data?.size).toBe('medium');
  });

  it('should handle not found error', async () => {
    const { result } = renderHook(
      () => useAssetPreview('nonexistent'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.data?.code).toBe('NOT_FOUND');
  });
});
```

### Integration Tests

```typescript
// __tests__/components/AssetPreview.test.tsx
import { render, screen } from '@testing-library/react';
import { AssetPreview } from '@/components/AssetPreview';
import { createWrapper } from '@/test/utils';

describe('AssetPreview', () => {
  it('should render preview image', async () => {
    render(
      <AssetPreview assetId="cm1abc123xyz" />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(
      <AssetPreview assetId="loading-asset" />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    render(
      <AssetPreview assetId="error-asset" />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/asset-preview.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Asset Preview Flow', () => {
  test('should upload and display preview', async ({ page }) => {
    await page.goto('/assets/upload');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-fixtures/sample-image.jpg');

    // Wait for upload confirmation
    await expect(page.locator('text=Upload successful')).toBeVisible();

    // Navigate to asset detail
    await page.click('text=View Asset');

    // Wait for thumbnail to load
    await expect(page.locator('img[alt="Asset preview"]')).toBeVisible();

    // Check processing status
    await expect(page.locator('text=Metadata Extraction')).toBeVisible();
    await expect(page.locator('text=Thumbnail Generation')).toBeVisible();
  });

  test('should regenerate preview', async ({ page }) => {
    await page.goto('/assets/cm1abc123xyz');

    // Click regenerate button
    await page.click('button:has-text("Regenerate Preview")');

    // Wait for success message
    await expect(page.locator('text=Regeneration job queued')).toBeVisible();

    // Check that processing indicator appears
    await expect(page.locator('.animate-spin')).toBeVisible();
  });
});
```

---

## Performance Optimization

### 1. Caching Strategy

```typescript
// lib/trpc-config.ts
export const trpcConfig = {
  queries: {
    // Cache preview URLs for 14 minutes (expires at 15)
    getPreview: {
      staleTime: 14 * 60 * 1000,
      cacheTime: 14 * 60 * 1000,
    },
    // Cache metadata for 5 minutes
    getMetadata: {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    },
    // Cache variants for 14 minutes
    getVariants: {
      staleTime: 14 * 60 * 1000,
      cacheTime: 14 * 60 * 1000,
    },
  },
};
```

### 2. Request Deduplication

React Query automatically deduplicates identical requests made within a short time window. No additional configuration needed.

### 3. Prefetching

```typescript
// Prefetch on hover for quick navigation
function AssetCard({ assetId }: { assetId: string }) {
  const utils = trpc.useUtils();

  const handleMouseEnter = () => {
    // Prefetch preview
    utils.ipAssets.getPreview.prefetch({
      id: assetId,
      size: 'large',
    });
  };

  return (
    <div onMouseEnter={handleMouseEnter}>
      <AssetPreview assetId={assetId} size="small" />
    </div>
  );
}
```

### 4. Virtual Scrolling for Large Lists

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function AssetGallery({ assetIds }: { assetIds: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: assetIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250, // Estimated row height
    overscan: 5, // Render 5 extra items above/below viewport
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <AssetCard assetId={assetIds[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5. Image Optimization

```typescript
// Use Next.js Image component with Cloudflare R2
import Image from 'next/image';

function OptimizedAssetImage({ url, alt }: { url: string; alt: string }) {
  return (
    <Image
      src={url}
      alt={alt}
      width={400}
      height={400}
      quality={85}
      loading="lazy"
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Low-res placeholder
    />
  );
}
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Preview URL returns 403 after 15 minutes

**Cause:** Signed URL has expired

**Solution:**
```typescript
// Implement automatic refetch
const { data, refetch } = trpc.ipAssets.getPreview.useQuery({
  id: assetId,
  size: 'medium',
});

useEffect(() => {
  const interval = setInterval(() => {
    if (data?.expiresAt && new Date(data.expiresAt) < new Date()) {
      refetch();
    }
  }, 60000); // Check every minute

  return () => clearInterval(interval);
}, [data, refetch]);
```

---

#### Issue 2: Thumbnail not available for AUDIO assets

**Cause:** AUDIO assets do not generate thumbnails

**Solution:**
```typescript
if (asset.type === 'AUDIO') {
  // Use waveform instead
  return <AudioWaveform assetId={asset.id} />;
}
```

---

#### Issue 3: Processing stuck at "metadata extracted" stage

**Cause:** Thumbnail or preview generation job may have failed

**Solution:**
```typescript
// Trigger regeneration
const regenerate = trpc.ipAssets.regeneratePreview.useMutation();

if (
  metadata?.processing?.metadataExtracted &&
  !metadata?.processing?.thumbnailGenerated
) {
  // Show regenerate button
  return (
    <Button onClick={() => regenerate.mutate({ id: assetId, types: ['thumbnail'] })}>
      Regenerate Thumbnail
    </Button>
  );
}
```

---

#### Issue 4: EXIF data missing for some images

**Cause:** Not all images have EXIF data (screenshots, generated images, stripped metadata)

**Solution:**
```typescript
// Handle gracefully in UI
const exif = metadata?.extracted?.exif;

if (!exif || Object.keys(exif).length === 0) {
  return <p className="text-muted-foreground">No camera information available</p>;
}
```

---

### Debug Checklist

When encountering issues, verify:

1. ✅ JWT token is included in request headers
2. ✅ Asset ID is valid CUID format (`c[a-z0-9]{24}`)
3. ✅ User has permission to access the asset
4. ✅ Asset has not been deleted (`deletedAt` is null)
5. ✅ Network request completed successfully (check browser DevTools)
6. ✅ Response structure matches TypeScript types
7. ✅ tRPC client is configured with correct base URL
8. ✅ Background jobs are running (check backend logs)

---

### Logging & Monitoring

```typescript
// lib/logger.ts
export function logAssetError(
  operation: string,
  assetId: string,
  error: any
) {
  console.error('Asset operation failed:', {
    operation,
    assetId,
    errorCode: error?.data?.code,
    errorMessage: error?.message,
    timestamp: new Date().toISOString(),
  });

  // Send to monitoring service (e.g., Sentry)
  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.captureException(error, {
      tags: {
        operation,
        assetId,
      },
    });
  }
}
```

---

## Support & Next Steps

### Getting Help

- **Backend Issues:** Contact backend team or create ticket in yg-backend repo
- **API Questions:** Refer to [Part 1](./METADATA_EXTRACTION_INTEGRATION_GUIDE_PART_1.md) for API reference
- **Frontend Examples:** Check `/docs/modules/ip-assets/file-viewer-examples.tsx`

### Related Documentation

- [File Management Integration Guide](./FILE_MANAGEMENT_INTEGRATION_GUIDE.md)
- [Asset Processing API Guide](./ASSET_PROCESSING_API_GUIDE.md)
- [Preview Generation Integration Guide (Part 1)](./PREVIEW_GENERATION_INTEGRATION_GUIDE_PART_1.md)
- [Preview Generation Integration Guide (Part 2)](./PREVIEW_GENERATION_INTEGRATION_GUIDE_PART_2.md)

### Future Enhancements

- **Webhooks:** Real-time processing status updates
- **License Integration:** Automated access control for licensees
- **Advanced EXIF Filtering:** Privacy controls for sensitive metadata
- **CDN Integration:** Cloudflare Images for automatic optimization
- **Batch Operations:** Regenerate multiple assets simultaneously

---

**Last Updated:** October 13, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
