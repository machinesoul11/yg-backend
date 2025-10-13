# Preview Generation - Frontend Integration Guide (Part 2)

**Classification:** 🌐 SHARED  
**Module:** IP Assets - Preview Generation  
**Last Updated:** October 12, 2025  
**Backend Deployment:** ops.yesgoddess.agency  
**Frontend Repo:** yesgoddess-web

---

## Table of Contents - Part 2

6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Real-time Updates](#real-time-updates)
10. [Pagination & Filtering](#pagination--filtering)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Error Handling

### Error Codes Reference

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `ASSET_NOT_FOUND` | 404 | Asset ID does not exist or has been deleted | Show "Asset not found" message |
| `ASSET_ACCESS_DENIED` | 403 | User lacks permission to access asset | Show "Access denied" message |
| `ASSET_ALREADY_DELETED` | 410 | Asset was previously deleted | Redirect to asset list |
| `ASSET_PROCESSING_FAILED` | 500 | Preview generation failed | Show retry option |
| `ASSET_STORAGE_ERROR` | 500 | Storage service unavailable | Show "Try again later" |
| `UNAUTHORIZED` | 401 | Authentication token invalid/expired | Redirect to login |
| `BAD_REQUEST` | 400 | Invalid input parameters | Show validation errors |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | Show generic error, log for debugging |

### Error Response Structure

All errors follow this structure:

```typescript
interface TRPCError {
  error: {
    json: {
      message: string;        // Human-readable error message
      code: string;           // tRPC error code
      data: {
        code: string;         // Same as above
        httpStatus: number;   // HTTP status code
        path: string;         // API endpoint path
        cause?: {
          code: string;       // Internal error code
          details?: any;      // Additional error details
        };
        zodError?: {          // Only for validation errors
          fieldErrors: Record<string, string[]>;
        };
      };
    };
  };
}
```

### Error Handling Strategy

#### 1. Generic Error Handler

```typescript
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';

function handleAssetError(error: unknown): {
  title: string;
  message: string;
  action?: 'retry' | 'login' | 'contact_support' | 'go_back';
} {
  // Type guard for tRPC errors
  if (error instanceof TRPCClientError<AppRouter>) {
    const errorCode = error.data?.cause?.code;
    
    switch (errorCode) {
      case 'ASSET_NOT_FOUND':
        return {
          title: 'Asset Not Found',
          message: 'This asset could not be found. It may have been deleted.',
          action: 'go_back',
        };
        
      case 'ASSET_ACCESS_DENIED':
        return {
          title: 'Access Denied',
          message: 'You do not have permission to view this asset.',
          action: 'go_back',
        };
        
      case 'ASSET_ALREADY_DELETED':
        return {
          title: 'Asset Deleted',
          message: 'This asset has been deleted.',
          action: 'go_back',
        };
        
      case 'ASSET_PROCESSING_FAILED':
        return {
          title: 'Processing Failed',
          message: 'Preview generation failed. You can try regenerating it.',
          action: 'retry',
        };
        
      case 'ASSET_STORAGE_ERROR':
        return {
          title: 'Storage Error',
          message: 'Unable to access storage. Please try again later.',
          action: 'retry',
        };
        
      default:
        break;
    }
    
    // Handle tRPC error codes
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        return {
          title: 'Session Expired',
          message: 'Please log in again to continue.',
          action: 'login',
        };
        
      case 'BAD_REQUEST':
        return {
          title: 'Invalid Request',
          message: error.message,
        };
        
      default:
        break;
    }
  }
  
  // Fallback for unknown errors
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or contact support.',
    action: 'contact_support',
  };
}
```

#### 2. Component-Level Error Handling

```typescript
function AssetPreviewWithErrors({ assetId }: { assetId: string }) {
  const { data, error, isLoading, refetch } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (error) {
    const errorInfo = handleAssetError(error);
    
    return (
      <ErrorCard
        title={errorInfo.title}
        message={errorInfo.message}
        action={
          errorInfo.action === 'retry' ? (
            <Button onClick={() => refetch()}>Try Again</Button>
          ) : errorInfo.action === 'login' ? (
            <Button onClick={() => router.push('/login')}>Log In</Button>
          ) : errorInfo.action === 'go_back' ? (
            <Button onClick={() => router.back()}>Go Back</Button>
          ) : null
        }
      />
    );
  }

  if (!data) return null;

  return <img src={data.url} alt="Preview" />;
}
```

#### 3. Validation Error Handling

```typescript
function RegenerateForm({ assetId }: { assetId: string }) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['all']);
  
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onError: (error) => {
      if (error.data?.zodError) {
        // Handle validation errors
        const fieldErrors = error.data.zodError.fieldErrors;
        
        Object.entries(fieldErrors).forEach(([field, errors]) => {
          toast.error(`${field}: ${errors.join(', ')}`);
        });
      } else {
        const errorInfo = handleAssetError(error);
        toast.error(errorInfo.message);
      }
    },
    onSuccess: (data) => {
      toast.success(`Regeneration queued: ${data.types.join(', ')}`);
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      regenerate.mutate({ id: assetId, types: selectedTypes });
    }}>
      {/* Form fields */}
    </form>
  );
}
```

#### 4. Expired URL Handling

```typescript
function PreviewImage({ assetId, size }: { assetId: string; size: PreviewSize }) {
  const [imageError, setImageError] = useState(false);
  const { data, refetch } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size,
  });

  const handleImageError = async () => {
    if (!imageError) {
      setImageError(true);
      // URL might be expired, refetch
      await refetch();
      setImageError(false);
    }
  };

  if (!data) return null;

  return (
    <img
      src={data.url}
      alt="Preview"
      onError={handleImageError}
      className="preview-image"
    />
  );
}
```

### When to Show Specific vs Generic Errors

**Show Specific Errors:**
- User action required (login, permission request)
- Validation errors (incorrect input)
- Known recoverable errors (regenerate preview)

**Show Generic Errors:**
- Server errors (500 series)
- Network errors
- Unexpected error codes
- Production environment (detailed errors in dev only)

**Error Logging:**
```typescript
import * as Sentry from '@sentry/nextjs';

function logError(error: unknown, context?: Record<string, any>) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Asset Error:', error, context);
  }
  
  // Send to error tracking service in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      tags: { module: 'preview-generation' },
      extra: context,
    });
  }
}
```

---

## Authorization & Permissions

### Permission Model

The Preview Generation module uses **role-based access control (RBAC)** with **resource ownership** checks.

#### User Roles

| Role | Description | Preview Access |
|------|-------------|----------------|
| `ADMIN` | Platform administrators | All assets |
| `CREATOR` | Content creators | Own assets only |
| `BRAND` | Brand users | Own assets only |
| `VIEWER` | Read-only users | No access (future) |

#### Permission Rules

| Operation | Admin | Creator (Owner) | Creator (Non-Owner) | Brand (Owner) | Brand (Non-Owner) |
|-----------|-------|-----------------|---------------------|---------------|-------------------|
| View Preview | ✅ | ✅ | ❌ | ✅ | ❌ |
| View Metadata | ✅ | ✅ | ❌ | ✅ | ❌ |
| View Variants | ✅ | ✅ | ❌ | ✅ | ❌ |
| Regenerate Preview | ✅ | ✅ | ❌ | ✅ | ❌ |

### Authorization Flow

```typescript
// Backend checks (automatic via tRPC context)
1. Verify JWT token is valid
2. Extract user ID and role from session
3. Check if user is ADMIN OR asset.createdBy === userId
4. If fails, throw ASSET_ACCESS_DENIED error
```

### Frontend Authorization Checks

While the backend enforces all authorization, the frontend should:

#### 1. Hide Unauthorized Actions

```typescript
import { useSession } from 'next-auth/react';

function AssetActions({ asset }: { asset: Asset }) {
  const { data: session } = useSession();
  
  const canEdit = 
    session?.user.role === 'ADMIN' || 
    asset.createdBy === session?.user.id;

  return (
    <div>
      {canEdit && (
        <Button onClick={handleRegenerate}>
          Regenerate Preview
        </Button>
      )}
    </div>
  );
}
```

#### 2. Show Permission State

```typescript
function AssetPreview({ asset }: { asset: Asset }) {
  const { data: session } = useSession();
  
  const hasAccess = 
    session?.user.role === 'ADMIN' || 
    asset.createdBy === session?.user.id;

  if (!hasAccess) {
    return (
      <Card>
        <Lock className="w-12 h-12 text-gray-400" />
        <p>You don't have permission to view this asset</p>
      </Card>
    );
  }

  return <PreviewComponent asset={asset} />;
}
```

#### 3. Handle Permission Errors

```typescript
const { data, error } = trpc.ipAssets.getPreview.useQuery(
  { id: assetId, size: 'medium' },
  {
    retry: (failureCount, error) => {
      // Don't retry permission errors
      if (error.data?.code === 'FORBIDDEN') {
        return false;
      }
      return failureCount < 3;
    },
  }
);
```

### Field-Level Permissions

All metadata fields are accessible to authorized users. No field-level restrictions exist currently.

**Future Consideration:** If implementing field-level permissions:
- Sensitive EXIF data (GPS coordinates) - Creator/Admin only
- Financial metadata - Admin only
- Processing logs - Admin only

### Resource Ownership Rules

**Ownership Determination:**
- Asset `createdBy` field contains user ID of uploader
- Ownership cannot be changed via preview endpoints
- Use separate ownership transfer API for transfers

**Shared Assets:**
Currently, preview access is binary (owner + admin only). For shared assets:
- Use project-level permissions (if asset belongs to project)
- Check collaboration status for multi-creator assets
- Future: Implement share links with token-based access

---

## Rate Limiting & Quotas

### Current Rate Limits

**Preview Generation module does NOT currently implement rate limiting** on read operations. However, the following recommendations apply for frontend implementation:

### Recommended Client-Side Throttling

#### 1. Query Deduplication

React Query automatically deduplicates requests, but ensure proper configuration:

```typescript
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Deduplicate identical requests within 5 seconds
      staleTime: 5000,
      // Cache results for 10 minutes
      cacheTime: 10 * 60 * 1000,
      // Don't refetch on window focus for previews
      refetchOnWindowFocus: false,
    },
  },
});
```

#### 2. Regeneration Throttling

Prevent users from spamming regeneration:

```typescript
function RegenerateButton({ assetId }: { assetId: string }) {
  const [lastRegenerate, setLastRegenerate] = useState<Date | null>(null);
  
  const canRegenerate = !lastRegenerate || 
    (Date.now() - lastRegenerate.getTime()) > 60000; // 1 minute cooldown

  const regenerate = trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: () => {
      setLastRegenerate(new Date());
    },
  });

  return (
    <Button
      onClick={() => regenerate.mutate({ id: assetId, types: ['all'] })}
      disabled={!canRegenerate || regenerate.isLoading}
    >
      {canRegenerate 
        ? 'Regenerate Preview' 
        : `Wait ${Math.ceil((60000 - (Date.now() - lastRegenerate!.getTime())) / 1000)}s`
      }
    </Button>
  );
}
```

#### 3. Batch Preview Loading

When displaying multiple assets, batch requests and implement pagination:

```typescript
function AssetGrid({ assetIds }: { assetIds: string[] }) {
  // Load previews in batches of 20
  const [visibleAssets, setVisibleAssets] = useState(assetIds.slice(0, 20));

  useEffect(() => {
    const handleScroll = () => {
      // Load more as user scrolls
      if (isNearBottom()) {
        setVisibleAssets(prev => [
          ...prev,
          ...assetIds.slice(prev.length, prev.length + 20),
        ]);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [assetIds]);

  return (
    <div className="grid grid-cols-4 gap-4">
      {visibleAssets.map(id => (
        <AssetPreview key={id} assetId={id} />
      ))}
    </div>
  );
}
```

### Headers to Monitor

Currently, no rate limit headers are returned. When implemented, check:

```typescript
// Future implementation
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Total requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining
  'X-RateLimit-Reset': string;      // Unix timestamp of reset
}
```

### Displaying Limits to Users

If rate limiting is added:

```typescript
function RateLimitIndicator() {
  const [rateLimitInfo, setRateLimitInfo] = useState({
    remaining: 100,
    total: 100,
    resetAt: new Date(),
  });

  // Extract from response headers
  useEffect(() => {
    // Implementation depends on HTTP client
  }, []);

  if (rateLimitInfo.remaining < 10) {
    return (
      <Banner type="warning">
        You have {rateLimitInfo.remaining} preview requests remaining.
        Resets at {formatTime(rateLimitInfo.resetAt)}.
      </Banner>
    );
  }

  return null;
}
```

### Best Practices

1. **Implement Lazy Loading**: Only load previews when they enter viewport
2. **Use Appropriate Sizes**: Don't load `large` previews for grid views
3. **Cache Aggressively**: Preview URLs are stable for 15 minutes
4. **Debounce Regeneration**: Add confirmation dialog for regenerate actions
5. **Monitor Performance**: Track preview load times and error rates

---

## Real-time Updates

### Webhook Events

The Preview Generation module triggers these webhook events:

| Event | Trigger | Payload |
|-------|---------|---------|
| `asset.thumbnail.generated` | Thumbnail generation complete | `{ assetId, thumbnailUrls, generatedAt }` |
| `asset.preview.generated` | Preview clip generation complete | `{ assetId, previewUrl, duration, generatedAt }` |
| `asset.metadata.extracted` | Metadata extraction complete | `{ assetId, metadata, extractedAt }` |
| `asset.processing.failed` | Processing job failed | `{ assetId, operation, error, failedAt }` |

**Note:** Webhooks are currently not implemented for frontend clients. Use polling instead.

### Polling Strategy

Since real-time updates via WebSocket/SSE are not implemented, use polling for processing status:

#### 1. Simple Polling

```typescript
function AssetWithPolling({ assetId }: { assetId: string }) {
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      // Poll every 5 seconds until thumbnail is ready
      refetchInterval: (data) => {
        if (!data?.processing?.thumbnailGenerated) {
          return 5000; // 5 seconds
        }
        return false; // Stop polling
      },
    }
  );

  return (
    <div>
      {metadata?.processing?.thumbnailGenerated ? (
        <AssetPreview assetId={assetId} />
      ) : (
        <ProcessingIndicator />
      )}
    </div>
  );
}
```

#### 2. Exponential Backoff Polling

```typescript
function useAssetProcessingStatus(assetId: string) {
  const [pollInterval, setPollInterval] = useState(2000);

  const { data } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: (data) => {
        if (!data?.processing?.thumbnailGenerated) {
          // Exponential backoff: 2s → 4s → 8s → 15s → 30s (max)
          setPollInterval(prev => Math.min(prev * 2, 30000));
          return pollInterval;
        }
        return false;
      },
      onSuccess: (data) => {
        if (data.processing?.thumbnailGenerated) {
          // Reset for next use
          setPollInterval(2000);
        }
      },
    }
  );

  return data?.processing;
}
```

#### 3. Smart Polling with Estimated Completion

```typescript
function ProcessingStatus({ assetId, assetType }: Props) {
  const startTime = useRef(Date.now());
  
  // Estimated processing times
  const estimatedTime = {
    IMAGE: 5,      // 5 seconds
    VIDEO: 45,     // 45 seconds
    AUDIO: 30,     // 30 seconds
    DOCUMENT: 10,  // 10 seconds
  }[assetType];

  const { data } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: 5000,
    }
  );

  const elapsed = (Date.now() - startTime.current) / 1000;
  const progress = Math.min((elapsed / estimatedTime) * 100, 95);

  if (data?.processing?.thumbnailGenerated) {
    return <Badge color="green">Ready</Badge>;
  }

  return (
    <div>
      <ProgressBar value={progress} />
      <p className="text-sm text-gray-600">
        Processing... (est. {estimatedTime}s)
      </p>
    </div>
  );
}
```

### WebSocket/SSE (Future Implementation)

When real-time updates are added, the implementation would look like:

```typescript
// Future implementation
import { useEffect } from 'react';

function useAssetUpdates(assetId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(`wss://ops.yesgoddess.agency/ws/assets/${assetId}`);

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      switch (update.type) {
        case 'thumbnail.generated':
          // Invalidate preview queries
          queryClient.invalidateQueries(['ipAssets', 'getPreview', assetId]);
          queryClient.invalidateQueries(['ipAssets', 'getVariants', assetId]);
          break;
          
        case 'metadata.extracted':
          // Invalidate metadata queries
          queryClient.invalidateQueries(['ipAssets', 'getMetadata', assetId]);
          break;
          
        case 'processing.failed':
          // Show error notification
          toast.error(`Processing failed: ${update.error}`);
          break;
      }
    };

    return () => ws.close();
  }, [assetId, queryClient]);
}
```

### Polling Recommendations

1. **Start Fast, Slow Down**: Begin with 2-5 second intervals, increase to 15-30 seconds
2. **Stop When Complete**: Disable polling once `thumbnailGenerated: true`
3. **Timeout**: Stop polling after 5 minutes, show error
4. **User Feedback**: Show progress indicator during polling
5. **Background Tabs**: Pause polling when tab is not visible

```typescript
function useVisibilityAwarePolling(enabled: boolean) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return enabled && isVisible;
}
```

---

## Pagination & Filtering

### Overview

The Preview Generation endpoints **do not include pagination** as they operate on single assets. However, when displaying multiple asset previews (e.g., in a gallery), use the main asset listing endpoint with pagination:

### Asset List Endpoint (For Preview Context)

```typescript
const { data } = trpc.ipAssets.list.useQuery({
  filters: {
    type: 'IMAGE',           // Filter by asset type
    status: 'PUBLISHED',     // Filter by status
    search: 'landscape',     // Full-text search
    projectId: 'cm1xyz...',  // Filter by project
  },
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
});
```

**Response:**
```typescript
{
  data: IpAssetResponse[];  // Array of assets
  meta: {
    total: number;          // Total matching assets
    page: number;           // Current page
    pageSize: number;       // Items per page
    hasMore: boolean;       // More pages available
  };
}
```

### Implementing Gallery with Previews

#### 1. Cursor-Based Pagination

```typescript
function AssetGallery() {
  const [page, setPage] = useState(1);
  
  const { data, isLoading } = trpc.ipAssets.list.useQuery({
    filters: { type: 'IMAGE' },
    page,
    pageSize: 24,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        {data?.data.map(asset => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
      
      <Pagination
        currentPage={page}
        totalPages={Math.ceil((data?.meta.total || 0) / 24)}
        onPageChange={setPage}
      />
    </div>
  );
}
```

#### 2. Infinite Scroll

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function InfiniteAssetGallery() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['assets', 'infinite'],
    queryFn: ({ pageParam = 1 }) =>
      trpcClient.ipAssets.list.query({
        page: pageParam,
        pageSize: 24,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
  });

  // Infinite scroll observer
  const observerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        {data?.pages.flatMap(page => page.data).map(asset => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
      
      <div ref={observerRef} className="h-10">
        {isFetchingNextPage && <Spinner />}
      </div>
    </div>
  );
}
```

### Filtering Options

Available filters for asset lists:

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `type` | Enum | Asset type | `'IMAGE'`, `'VIDEO'`, `'AUDIO'`, `'DOCUMENT'` |
| `status` | Enum | Asset status | `'DRAFT'`, `'PUBLISHED'`, `'ARCHIVED'` |
| `projectId` | String (CUID) | Filter by project | `'cm1abc123xyz'` |
| `createdBy` | String (CUID) | Filter by creator | `'cm1def456uvw'` |
| `search` | String | Full-text search | `'summer landscape'` |
| `fromDate` | ISO 8601 | Created after date | `'2025-01-01T00:00:00Z'` |
| `toDate` | ISO 8601 | Created before date | `'2025-12-31T23:59:59Z'` |

### Sorting Options

| Sort By | Order | Use Case |
|---------|-------|----------|
| `createdAt` | `desc` | Most recent first (default) |
| `createdAt` | `asc` | Oldest first |
| `updatedAt` | `desc` | Recently modified |
| `title` | `asc` | Alphabetical |
| `title` | `desc` | Reverse alphabetical |

### Example: Filtered Gallery

```typescript
function FilteredGallery() {
  const [filters, setFilters] = useState({
    type: undefined as AssetType | undefined,
    search: '',
    fromDate: undefined as string | undefined,
  });

  const { data } = trpc.ipAssets.list.useQuery({
    filters: {
      ...(filters.type && { type: filters.type }),
      ...(filters.search && { search: filters.search }),
      ...(filters.fromDate && { fromDate: filters.fromDate }),
    },
    page: 1,
    pageSize: 24,
  });

  return (
    <div>
      <Filters>
        <Select
          value={filters.type}
          onChange={(type) => setFilters(f => ({ ...f, type }))}
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
          <option value="AUDIO">Audio</option>
          <option value="DOCUMENT">Documents</option>
        </Select>
        
        <Input
          placeholder="Search assets..."
          value={filters.search}
          onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
        />
      </Filters>

      <AssetGrid assets={data?.data || []} />
    </div>
  );
}
```

### Performance Optimization

1. **Prefetch Next Page**: Load next page in background
   ```typescript
   const queryClient = useQueryClient();
   
   useEffect(() => {
     if (hasNextPage) {
       queryClient.prefetchQuery({
         queryKey: ['assets', page + 1],
         queryFn: () => trpcClient.ipAssets.list.query({ page: page + 1 }),
       });
     }
   }, [page, hasNextPage]);
   ```

2. **Virtual Scrolling**: Use `react-virtual` for large lists
   ```typescript
   import { useVirtual } from 'react-virtual';
   
   const parentRef = useRef<HTMLDivElement>(null);
   
   const rowVirtualizer = useVirtual({
     size: assets.length,
     parentRef,
     estimateSize: useCallback(() => 250, []),
   });
   ```

3. **Thumbnail Preloading**: Preload thumbnails for upcoming items
   ```typescript
   useEffect(() => {
     // Preload next 10 thumbnails
     const upcomingAssets = assets.slice(currentIndex, currentIndex + 10);
     upcomingAssets.forEach(asset => {
       const img = new Image();
       img.src = asset.thumbnailUrl;
     });
   }, [currentIndex, assets]);
   ```

---

## Frontend Implementation Checklist

### Phase 1: Core Preview Display

- [ ] **Install Dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  ```

- [ ] **Setup tRPC Client**
  - [ ] Create `lib/trpc.ts` with tRPC client configuration
  - [ ] Add tRPC provider to app layout
  - [ ] Configure React Query defaults (staleTime, cacheTime)

- [ ] **Type Definitions**
  - [ ] Copy TypeScript interfaces from Part 1
  - [ ] Create `types/preview.ts` file
  - [ ] Export all types for use in components

- [ ] **Basic Preview Component**
  - [ ] Create `AssetPreview` component with size prop
  - [ ] Handle loading state with skeleton
  - [ ] Display preview image/video/audio
  - [ ] Show fallback for missing previews

### Phase 2: Metadata Display

- [ ] **Metadata Components**
  - [ ] Create `AssetMetadata` component
  - [ ] Format duration for video/audio
  - [ ] Format file size and bitrate
  - [ ] Display technical specs (resolution, codec, etc.)
  - [ ] Show descriptive metadata (title, artist, etc.)

- [ ] **Processing Status**
  - [ ] Create `ProcessingStatus` component
  - [ ] Implement polling for status updates
  - [ ] Show progress indicator
  - [ ] Display estimated completion time
  - [ ] Handle processing failures

### Phase 3: Variants & Responsive Images

- [ ] **Variant Display**
  - [ ] Create `ResponsivePreview` component using `<picture>`
  - [ ] Implement size selection (small/medium/large)
  - [ ] Add lazy loading with Intersection Observer
  - [ ] Handle variant availability gracefully

- [ ] **Audio Waveform**
  - [ ] Create `AudioWaveform` component
  - [ ] Display waveform PNG
  - [ ] Add audio player controls
  - [ ] Show audio metadata alongside waveform

- [ ] **Video Preview**
  - [ ] Create `VideoPreview` component
  - [ ] Display thumbnail with play overlay
  - [ ] Load preview clip on user interaction
  - [ ] Add video player with controls

### Phase 4: Error Handling

- [ ] **Error Handler**
  - [ ] Create `handleAssetError` utility function
  - [ ] Map error codes to user messages
  - [ ] Create `ErrorCard` component
  - [ ] Implement retry logic for recoverable errors

- [ ] **Edge Cases**
  - [ ] Handle expired URLs (refetch on 403/410)
  - [ ] Handle missing previews (show placeholder)
  - [ ] Handle slow processing (timeout after 5 min)
  - [ ] Handle permission errors (show access denied)

### Phase 5: Advanced Features

- [ ] **Regeneration**
  - [ ] Create `RegeneratePreview` button component
  - [ ] Add confirmation dialog
  - [ ] Implement cooldown timer (1 minute)
  - [ ] Show regeneration progress
  - [ ] Invalidate queries on success

- [ ] **Gallery View**
  - [ ] Create `AssetGallery` component with grid layout
  - [ ] Implement pagination or infinite scroll
  - [ ] Add filtering UI (type, status, search)
  - [ ] Implement sorting options
  - [ ] Add thumbnail preloading

### Phase 6: Optimization

- [ ] **Performance**
  - [ ] Implement virtual scrolling for large lists
  - [ ] Add image lazy loading
  - [ ] Prefetch next page of assets
  - [ ] Use appropriate preview sizes per context
  - [ ] Cache preview URLs with React Query

- [ ] **UX Improvements**
  - [ ] Add skeleton loaders
  - [ ] Implement smooth transitions
  - [ ] Add keyboard navigation
  - [ ] Show download progress for previews
  - [ ] Add "No results" state

### Phase 7: Testing & Polish

- [ ] **Component Testing**
  - [ ] Test AssetPreview with all asset types
  - [ ] Test error states (not found, access denied)
  - [ ] Test loading and processing states
  - [ ] Test regeneration flow

- [ ] **Integration Testing**
  - [ ] Test full upload → preview flow
  - [ ] Test filtering and pagination
  - [ ] Test URL expiration handling
  - [ ] Test permission enforcement

- [ ] **Accessibility**
  - [ ] Add alt text to images
  - [ ] Ensure keyboard navigation
  - [ ] Add ARIA labels
  - [ ] Test screen reader compatibility

- [ ] **Documentation**
  - [ ] Document component props
  - [ ] Add Storybook stories
  - [ ] Create usage examples
  - [ ] Document error scenarios

---

## Edge Cases to Handle

### 1. Processing Delays
**Scenario:** Thumbnails take longer than expected  
**Solution:** Show processing indicator, implement timeout after 5 minutes

### 2. Large Files
**Scenario:** 100MB video file takes 2+ minutes to process  
**Solution:** Set realistic expectations, show estimated time, allow background processing

### 3. Failed Processing
**Scenario:** Video codec not supported, processing fails  
**Solution:** Show error message with regenerate option, log error for debugging

### 4. Expired URLs
**Scenario:** User leaves page open >15 minutes, URLs expire  
**Solution:** Detect image load errors, automatically refetch URLs

### 5. Partial Processing
**Scenario:** Thumbnails generated but preview failed  
**Solution:** Show thumbnails, indicate preview unavailable, offer regeneration

### 6. Concurrent Updates
**Scenario:** User triggers regeneration while processing is ongoing  
**Solution:** Disable regenerate button during processing, queue new job after completion

### 7. Network Interruptions
**Scenario:** Upload completes but client disconnects  
**Solution:** Poll for processing status on reconnection, show recovery UI

### 8. Permission Changes
**Scenario:** User loses access to asset while viewing  
**Solution:** Handle 403 errors gracefully, redirect to asset list with message

---

## UX Considerations

### Loading States
- **Skeleton Loaders**: Show placeholder for image/video dimensions
- **Progress Bars**: For processing status with estimated time
- **Spinners**: For quick actions like regeneration

### Empty States
- **No Previews Available**: Show placeholder with file icon
- **Processing**: Show progress indicator with "Generating preview..."
- **Failed Processing**: Show error icon with retry button

### Feedback
- **Success Messages**: "Preview regenerated successfully"
- **Error Messages**: Specific, actionable error text
- **Status Indicators**: Badge showing "Ready", "Processing", "Failed"

### Responsive Design
- **Mobile**: Use small thumbnails, stack metadata
- **Tablet**: Use medium thumbnails, side-by-side layout
- **Desktop**: Use large previews, detailed metadata panel

### Accessibility
- **Alt Text**: Descriptive text for all images
- **Keyboard Nav**: Tab through previews, Enter to view
- **Screen Readers**: Announce processing status changes
- **Focus Indicators**: Clear visual focus states

---

## Complete Example Implementation

### Full Asset Preview Component

```typescript
import { trpc } from '@/lib/trpc';
import { useState, useEffect } from 'react';
import { formatDuration, formatFileSize } from '@/lib/utils';

interface AssetPreviewProps {
  assetId: string;
  size?: 'small' | 'medium' | 'large';
  showMetadata?: boolean;
}

export function AssetPreview({ 
  assetId, 
  size = 'medium',
  showMetadata = false,
}: AssetPreviewProps) {
  const [imageError, setImageError] = useState(false);

  // Fetch preview URL
  const { 
    data: preview, 
    error: previewError,
    refetch: refetchPreview,
  } = trpc.ipAssets.getPreview.useQuery({ id: assetId, size });

  // Fetch metadata if needed
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['technical', 'processing'] },
    { enabled: showMetadata }
  );

  // Poll for processing completion
  const isProcessing = !metadata?.processing?.thumbnailGenerated;
  
  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        refetchPreview();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [isProcessing, refetchPreview]);

  // Handle image load errors (expired URLs)
  const handleImageError = async () => {
    if (!imageError) {
      setImageError(true);
      await refetchPreview();
      setImageError(false);
    }
  };

  // Loading state
  if (!preview && !previewError) {
    return <PreviewSkeleton size={size} />;
  }

  // Error state
  if (previewError) {
    const errorInfo = handleAssetError(previewError);
    return (
      <ErrorCard
        title={errorInfo.title}
        message={errorInfo.message}
        onRetry={() => refetchPreview()}
      />
    );
  }

  // Processing state
  if (isProcessing) {
    return (
      <div className="preview-processing">
        <Spinner />
        <p>Generating preview...</p>
      </div>
    );
  }

  return (
    <div className="asset-preview">
      <img
        src={preview.url}
        alt="Asset preview"
        width={preview.width}
        height={preview.height}
        onError={handleImageError}
        loading="lazy"
      />
      
      {showMetadata && metadata?.technical && (
        <div className="metadata">
          {metadata.technical.duration && (
            <span>{formatDuration(metadata.technical.duration)}</span>
          )}
          {metadata.technical.resolution && (
            <span>{metadata.technical.resolution}</span>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Additional Resources

- **Backend Documentation**: `/docs/IMPLEMENTATION_FILE_VIEWER.md`
- **Asset Processing Guide**: `/docs/modules/ip-assets/ASSET_PROCESSING.md`
- **Storage Structure**: `/docs/infrastructure/storage/structure.md`
- **Permission System**: `/docs/infrastructure/permissions/rbac.md`

---

## Support & Troubleshooting

### Common Issues

**Q: Preview URLs return 403 Forbidden**  
A: URLs expire after 15 minutes. Refetch the preview URL.

**Q: Thumbnails not generating for PDF**  
A: PDF rendering requires additional setup. Currently using SVG placeholders.

**Q: Video preview takes too long**  
A: Large videos (>50MB) may take 60+ seconds. Show estimated time to users.

**Q: Audio waveform shows placeholder**  
A: FFmpeg-based waveform generation may fail for some codecs. Fallback SVG is shown.

**Q: How to invalidate cached preview URLs?**  
A: Use `queryClient.invalidateQueries(['ipAssets', 'getPreview', assetId])`

---

**End of Frontend Integration Guide**

For questions or clarification, contact the backend team or refer to the complete backend documentation in `/docs`.
