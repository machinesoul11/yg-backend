# IP Assets API - Frontend Integration Guide (Part 2: Implementation)

**Classification:** ⚡ HYBRID  
**Module:** IP Assets Management  
**Backend Deployment:** ops.yesgoddess.agency  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Authorization & Permissions](#authorization--permissions)
3. [Rate Limiting](#rate-limiting)
4. [Complete Upload Flow](#complete-upload-flow)
5. [React Query Integration](#react-query-integration)
6. [tRPC Client Setup](#trpc-client-setup)
7. [Business Logic & Validation](#business-logic--validation)
8. [Real-time Updates](#real-time-updates)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [UX Considerations](#ux-considerations)
11. [Example Implementations](#example-implementations)

---

## Error Handling

### Error Response Format

All errors follow the tRPC error structure:

```typescript
{
  error: {
    message: string;           // Human-readable error message
    code: string;              // tRPC error code
    data: {
      code: string;            // Application error code
      httpStatus: number;      // HTTP status code
      path: string;            // API path
      details?: any;           // Additional error context
    };
  };
}
```

### Error Codes Reference

| HTTP Status | tRPC Code | Application Code | Description | User Message |
|-------------|-----------|------------------|-------------|--------------|
| 400 | BAD_REQUEST | ASSET_INVALID_FILE_TYPE | File type not supported | "This file type is not supported. Please use PNG, JPG, PDF, or other allowed formats." |
| 400 | BAD_REQUEST | ASSET_FILE_TOO_LARGE | File exceeds 100MB limit | "File is too large. Maximum size is 100MB." |
| 400 | BAD_REQUEST | ASSET_INVALID_STATUS_TRANSITION | Invalid status change | "Cannot change status from {current} to {target}." |
| 400 | BAD_REQUEST | ASSET_INVALID_METADATA | Invalid metadata field | "Invalid metadata: {field}" |
| 401 | UNAUTHORIZED | UNAUTHORIZED | Missing/invalid JWT | "Please log in to continue." |
| 403 | FORBIDDEN | ASSET_ACCESS_DENIED | No permission to access | "You don't have permission to access this asset." |
| 404 | NOT_FOUND | ASSET_NOT_FOUND | Asset doesn't exist | "Asset not found." |
| 409 | CONFLICT | ASSET_HAS_ACTIVE_LICENSES | Cannot delete with licenses | "Cannot delete asset with active licenses." |
| 410 | GONE | ASSET_ALREADY_DELETED | Asset was deleted | "This asset has been deleted." |
| 500 | INTERNAL_SERVER_ERROR | ASSET_STORAGE_ERROR | Storage operation failed | "File upload failed. Please try again." |
| 500 | INTERNAL_SERVER_ERROR | ASSET_PROCESSING_FAILED | Processing job failed | "Asset processing failed. Please try again." |
| 500 | INTERNAL_SERVER_ERROR | ASSET_VIRUS_DETECTED | Virus scan detected malware | "This file failed security screening." |

### Error Handling Pattern

```typescript
import { TRPCClientError } from '@trpc/client';

async function handleAssetOperation() {
  try {
    const result = await trpc.ipAssets.create.mutate(data);
    return result;
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const appErrorCode = error.data?.code;
      const message = error.message;
      
      switch (appErrorCode) {
        case 'ASSET_INVALID_FILE_TYPE':
          toast.error('This file type is not supported. Please use PNG, JPG, MP4, or PDF.');
          break;
        case 'ASSET_FILE_TOO_LARGE':
          toast.error('File is too large. Maximum size is 100MB.');
          break;
        case 'ASSET_ACCESS_DENIED':
          toast.error('You don\'t have permission to access this asset.');
          break;
        case 'ASSET_NOT_FOUND':
          toast.error('Asset not found.');
          router.push('/assets');
          break;
        default:
          // Generic fallback
          toast.error(message || 'Something went wrong. Please try again.');
      }
    } else {
      // Network or unexpected error
      console.error('Unexpected error:', error);
      toast.error('Network error. Please check your connection.');
    }
  }
}
```

### Retry Strategy

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

// Query with retry
const { data, error, isLoading } = useQuery({
  queryKey: ['asset', assetId],
  queryFn: () => trpc.ipAssets.getById.query({ id: assetId }),
  retry: (failureCount, error) => {
    // Don't retry on client errors (4xx)
    if (error instanceof TRPCClientError) {
      const status = error.data?.httpStatus;
      if (status && status >= 400 && status < 500) {
        return false;
      }
    }
    // Retry up to 3 times for 5xx errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});

// Mutation with error handling
const uploadMutation = useMutation({
  mutationFn: (data: ConfirmUploadInput) => 
    trpc.ipAssets.confirmUpload.mutate(data),
  onError: (error) => {
    if (error instanceof TRPCClientError) {
      handleUploadError(error);
    }
  },
  onSuccess: (asset) => {
    toast.success('Asset uploaded successfully!');
    router.push(`/assets/${asset.id}`);
  },
});
```

---

## Authorization & Permissions

### Role-Based Access Control

| Endpoint | CREATOR | BRAND | ADMIN | Notes |
|----------|---------|-------|-------|-------|
| `initiateUpload` | ✅ Own | ❌ | ✅ All | Creators upload their content |
| `confirmUpload` | ✅ Own | ❌ | ✅ All | Only asset owner can confirm |
| `list` | ✅ Own | ❌ | ✅ All | Row-level security applied |
| `getById` | ✅ Own | ❌ | ✅ All | Creator or admin only |
| `update` | ✅ Own | ❌ | ✅ All | Update own assets |
| `updateStatus` | ✅ Own* | ❌ | ✅ All | *Some transitions admin-only |
| `delete` | ✅ Own | ❌ | ✅ All | Cannot delete with active licenses |
| `getDownloadUrl` | ✅ Own | ✅ Licensed | ✅ All | Brands with license can download |
| `getPreview` | ✅ Own | ✅ Licensed | ✅ All | Same as download |
| `getMetadata` | ✅ Own | ✅ Licensed | ✅ All | Metadata access |
| `getVariants` | ✅ Own | ✅ Licensed | ✅ All | Preview variants |
| `regeneratePreview` | ✅ Own | ❌ | ✅ All | Creator or admin |
| `getDerivatives` | ✅ Own | ❌ | ✅ All | Version history |
| `getOwners` | ✅ Own | ❌ | ✅ All | Ownership info |
| `addOwner` | ✅ Own | ❌ | ✅ All | Manage ownership |
| `getLicenses` | ✅ Own | ✅ Own Licenses | ✅ All | Financial data |
| `bulkUpdateStatus` | ❌ | ❌ | ✅ | Admin only |

### Permission Checking

```typescript
// Frontend helper to check permissions
export function canEditAsset(asset: IpAssetResponse, user: User): boolean {
  if (user.role === 'ADMIN') return true;
  if (asset.createdBy === user.id) return true;
  return false;
}

export function canDeleteAsset(asset: IpAssetResponse, user: User): boolean {
  if (user.role === 'ADMIN') return true;
  if (asset.createdBy === user.id) {
    // Additional check: no active licenses (when implemented)
    return true;
  }
  return false;
}

export function canChangeStatus(
  asset: IpAssetResponse, 
  user: User, 
  newStatus: AssetStatus
): boolean {
  if (user.role === 'ADMIN') return true;
  
  // Some status transitions require admin
  const adminOnlyTransitions = [
    { from: 'REVIEW', to: 'APPROVED' },
    { from: 'REVIEW', to: 'REJECTED' },
    { from: 'APPROVED', to: 'PUBLISHED' },
  ];
  
  const isAdminOnly = adminOnlyTransitions.some(
    t => t.from === asset.status && t.to === newStatus
  );
  
  if (isAdminOnly) return false;
  
  // Creator can make other transitions
  return asset.createdBy === user.id;
}

// Usage in component
function AssetActions({ asset }: { asset: IpAssetResponse }) {
  const { user } = useAuth();
  
  return (
    <div>
      {canEditAsset(asset, user) && (
        <Button onClick={handleEdit}>Edit</Button>
      )}
      {canDeleteAsset(asset, user) && (
        <Button onClick={handleDelete} variant="danger">Delete</Button>
      )}
      {canChangeStatus(asset, user, 'PUBLISHED') && (
        <Button onClick={handlePublish}>Publish</Button>
      )}
    </div>
  );
}
```

### Field-Level Permissions

```typescript
// Some metadata fields may be sensitive
export function canViewMetadata(asset: IpAssetResponse, user: User): boolean {
  if (user.role === 'ADMIN') return true;
  if (asset.createdBy === user.id) return true;
  
  // Brands with license can view technical metadata only
  if (user.role === 'BRAND' && hasActiveLicense(user.id, asset.id)) {
    return true; // But filter sensitive fields
  }
  
  return false;
}

// Filter metadata for brands
export function filterMetadataForBrand(metadata: AssetMetadataResponse) {
  return {
    type: metadata.type,
    technical: metadata.technical, // OK to share
    // Omit descriptive, extracted, processing for brands
  };
}
```

---

## Rate Limiting

### Current Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `initiateUpload` | 50 requests | 1 hour | Per user |
| `confirmUpload` | 50 requests | 1 hour | Per user |
| `list` | 300 requests | 15 minutes | Per user |
| `update` | 100 requests | 15 minutes | Per user |
| `delete` | 20 requests | 15 minutes | Per user |
| All endpoints | 1000 requests | 15 minutes | Per user |

### Rate Limit Headers

Check these response headers to implement client-side throttling:

```typescript
X-RateLimit-Limit: 50          // Total requests allowed
X-RateLimit-Remaining: 42      // Requests remaining
X-RateLimit-Reset: 1697212800  // Unix timestamp when limit resets
```

### Rate Limit Handling

```typescript
import { useState, useEffect } from 'react';

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export function useRateLimitWarning() {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  
  // Axios interceptor or fetch wrapper
  const interceptResponse = (response: Response) => {
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    
    if (limit && remaining && reset) {
      setRateLimitInfo({
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        resetAt: new Date(parseInt(reset) * 1000),
      });
    }
  };
  
  // Show warning when approaching limit
  useEffect(() => {
    if (rateLimitInfo && rateLimitInfo.remaining < 10) {
      toast.warning(
        `You're approaching the rate limit. ${rateLimitInfo.remaining} requests remaining.`
      );
    }
  }, [rateLimitInfo]);
  
  return rateLimitInfo;
}

// Handle 429 rate limit errors
function handleRateLimitError(error: TRPCClientError) {
  const resetAt = error.data?.resetAt;
  const resetTime = resetAt ? new Date(resetAt) : null;
  const minutesUntilReset = resetTime 
    ? Math.ceil((resetTime.getTime() - Date.now()) / 60000)
    : 15;
  
  toast.error(
    `Rate limit exceeded. Please try again in ${minutesUntilReset} minutes.`
  );
}
```

---

## Complete Upload Flow

### Upload Process Overview

```
1. User selects file
     ↓
2. Frontend: Validate file (type, size)
     ↓
3. Frontend: Call initiateUpload
     ↓
4. Backend: Generate presigned URL, create draft asset
     ↓
5. Frontend: Upload file directly to storage (R2/Azure)
     ↓
6. Frontend: Call confirmUpload with metadata
     ↓
7. Backend: Update asset status to PROCESSING
     ↓
8. Backend: Queue background jobs
     - Virus scan
     - Thumbnail generation
     - Metadata extraction
     ↓
9. Frontend: Poll or listen for processing completion
     ↓
10. Display asset with thumbnails
```

### Step-by-Step Implementation

#### Step 1: File Selection & Validation

```typescript
import { ASSET_CONSTANTS } from '@/lib/constants';

interface FileValidation {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidation {
  // Check file size
  if (file.size > ASSET_CONSTANTS.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${ASSET_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }
  
  // Check MIME type
  if (!ASSET_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported`,
    };
  }
  
  return { valid: true };
}

// Usage in component
function FileUploadInput() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error!);
      setSelectedFile(null);
      return;
    }
    
    setError('');
    setSelectedFile(file);
  };
  
  return (
    <div>
      <input
        type="file"
        onChange={handleFileSelect}
        accept={ASSET_CONSTANTS.ALLOWED_MIME_TYPES.join(',')}
      />
      {error && <p className="text-red-600">{error}</p>}
      {selectedFile && (
        <AssetUploadForm file={selectedFile} />
      )}
    </div>
  );
}
```

#### Step 2: Initiate Upload

```typescript
function AssetUploadForm({ file }: { file: File }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const initiateUploadMutation = useMutation({
    mutationFn: (data: InitiateUploadInput) =>
      trpc.ipAssets.initiateUpload.mutate(data),
  });
  
  const handleUpload = async () => {
    try {
      setUploading(true);
      
      // Step 1: Initiate upload
      const initData = await initiateUploadMutation.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        projectId: selectedProjectId, // Optional
      });
      
      // Step 2: Upload to storage
      await uploadToStorage(file, initData.uploadUrl, (progress) => {
        setProgress(progress);
      });
      
      // Step 3: Confirm upload
      await confirmUpload(initData.assetId, file);
      
      toast.success('Upload complete!');
    } catch (error) {
      handleUploadError(error);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <Button onClick={handleUpload} disabled={uploading}>
        {uploading ? `Uploading... ${progress}%` : 'Upload'}
      </Button>
    </div>
  );
}
```

#### Step 3: Upload to Storage

```typescript
async function uploadToStorage(
  file: File,
  presignedUrl: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        onProgress(percentComplete);
      }
    });
    
    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });
    
    // Perform upload
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

#### Step 4: Confirm Upload

```typescript
const confirmUploadMutation = useMutation({
  mutationFn: (data: ConfirmUploadInput) =>
    trpc.ipAssets.confirmUpload.mutate(data),
  onSuccess: (asset) => {
    // Redirect to asset page
    router.push(`/assets/${asset.id}`);
    
    // Or show processing status
    pollAssetProcessing(asset.id);
  },
});

async function confirmUpload(assetId: string, file: File) {
  // Extract preview metadata from file
  const metadata = await extractClientMetadata(file);
  
  await confirmUploadMutation.mutateAsync({
    assetId,
    title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
    description: '', // User can add later
    metadata,
  });
}

// Extract basic metadata on client side
async function extractClientMetadata(file: File): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {};
  
  if (file.type.startsWith('image/')) {
    // Get image dimensions
    const dimensions = await getImageDimensions(file);
    metadata.clientWidth = dimensions.width;
    metadata.clientHeight = dimensions.height;
  }
  
  // Add more client-side extraction as needed
  return metadata;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

#### Step 5: Monitor Processing

```typescript
function useAssetProcessing(assetId: string) {
  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => trpc.ipAssets.getById.query({ id: assetId }),
    refetchInterval: (data) => {
      // Poll every 2 seconds while processing
      if (data?.status === 'PROCESSING' || data?.scanStatus === 'SCANNING') {
        return 2000;
      }
      // Stop polling when complete
      return false;
    },
  });
  
  const isProcessing = asset?.status === 'PROCESSING' || 
                       asset?.scanStatus === 'SCANNING' ||
                       asset?.scanStatus === 'PENDING';
  
  const isFailed = asset?.scanStatus === 'ERROR' || 
                   asset?.scanStatus === 'INFECTED';
  
  return { asset, isProcessing, isFailed };
}

function AssetProcessingStatus({ assetId }: { assetId: string }) {
  const { asset, isProcessing, isFailed } = useAssetProcessing(assetId);
  
  if (!asset) return <Spinner />;
  
  if (isFailed) {
    return (
      <Alert variant="error">
        {asset.scanStatus === 'INFECTED' 
          ? 'This file failed security screening.'
          : 'Processing failed. Please try re-uploading.'}
      </Alert>
    );
  }
  
  if (isProcessing) {
    return (
      <div>
        <Spinner />
        <p>Processing your asset... This may take a few moments.</p>
        <p className="text-sm text-gray-500">
          Scan status: {asset.scanStatus} • 
          Asset status: {asset.status}
        </p>
      </div>
    );
  }
  
  return <AssetDetailsView asset={asset} />;
}
```

---

## React Query Integration

### Setup React Query Client

```typescript
// lib/react-query.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// app/providers.tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
```

### Query Hooks

```typescript
// hooks/useAssets.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';

export function useAssets(filters?: ListAssetsInput['filters']) {
  return useQuery({
    queryKey: ['assets', filters],
    queryFn: () => trpc.ipAssets.list.query({ filters }),
    keepPreviousData: true, // For pagination
  });
}

export function useAsset(assetId: string) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => trpc.ipAssets.getById.query({ id: assetId }),
    enabled: !!assetId,
  });
}

export function useAssetOwners(assetId: string) {
  return useQuery({
    queryKey: ['asset-owners', assetId],
    queryFn: () => trpc.ipAssets.getOwners.query({ id: assetId }),
    enabled: !!assetId,
  });
}

export function useAssetLicenses(assetId: string, status?: string) {
  return useQuery({
    queryKey: ['asset-licenses', assetId, status],
    queryFn: () => trpc.ipAssets.getLicenses.query({ id: assetId, status }),
    enabled: !!assetId,
  });
}

export function useAssetDownloadUrl(assetId: string) {
  return useQuery({
    queryKey: ['asset-download', assetId],
    queryFn: () => trpc.ipAssets.getDownloadUrl.query({ id: assetId }),
    enabled: !!assetId,
    staleTime: 10 * 60 * 1000, // 10 minutes (URL expires in 15)
  });
}
```

### Mutation Hooks

```typescript
// hooks/useAssetMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UpdateAssetInput) =>
      trpc.ipAssets.update.mutate(data),
    onSuccess: (updatedAsset) => {
      // Invalidate related queries
      queryClient.invalidateQueries(['asset', updatedAsset.id]);
      queryClient.invalidateQueries(['assets']);
      
      toast.success('Asset updated successfully');
    },
    onError: handleAssetError,
  });
}

export function useUpdateAssetStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UpdateStatusInput) =>
      trpc.ipAssets.updateStatus.mutate(data),
    onSuccess: (updatedAsset) => {
      queryClient.invalidateQueries(['asset', updatedAsset.id]);
      queryClient.invalidateQueries(['assets']);
      
      toast.success(`Status changed to ${updatedAsset.status}`);
    },
    onError: handleAssetError,
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  const router = useRouter();
  
  return useMutation({
    mutationFn: (assetId: string) =>
      trpc.ipAssets.delete.mutate({ id: assetId }),
    onSuccess: (_, assetId) => {
      // Remove from cache
      queryClient.removeQueries(['asset', assetId]);
      queryClient.invalidateQueries(['assets']);
      
      toast.success('Asset deleted successfully');
      router.push('/assets');
    },
    onError: handleAssetError,
  });
}

export function useAddAssetOwner() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AddAssetOwnerInput) =>
      trpc.ipAssets.addOwner.mutate(data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(['asset-owners', id]);
      queryClient.invalidateQueries(['asset', id]);
      
      toast.success('Owner added successfully');
    },
    onError: handleAssetError,
  });
}
```

### Pagination Hook

```typescript
export function useAssetsPaginated(initialFilters?: ListAssetsInput['filters']) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters || {});
  const pageSize = 20;
  
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['assets', filters, page, pageSize],
    queryFn: () => trpc.ipAssets.list.query({
      filters,
      page,
      pageSize,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    keepPreviousData: true,
  });
  
  const hasNextPage = data?.meta.hasMore ?? false;
  const hasPrevPage = page > 1;
  
  const nextPage = () => {
    if (hasNextPage) setPage((p) => p + 1);
  };
  
  const prevPage = () => {
    if (hasPrevPage) setPage((p) => p - 1);
  };
  
  const goToPage = (newPage: number) => {
    setPage(newPage);
  };
  
  const updateFilters = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page
  };
  
  return {
    assets: data?.data ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    page,
    nextPage,
    prevPage,
    goToPage,
    hasNextPage,
    hasPrevPage,
    filters,
    updateFilters,
  };
}

// Usage
function AssetsList() {
  const {
    assets,
    meta,
    isLoading,
    page,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
    updateFilters,
  } = useAssetsPaginated();
  
  if (isLoading) return <Spinner />;
  
  return (
    <div>
      <AssetFilters onChange={updateFilters} />
      
      <div className="grid grid-cols-3 gap-4">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
      
      <Pagination
        current={page}
        total={meta?.total ?? 0}
        pageSize={20}
        onNext={nextPage}
        onPrev={prevPage}
        hasNext={hasNextPage}
        hasPrev={hasPrevPage}
      />
    </div>
  );
}
```

---

## tRPC Client Setup

### Install Dependencies

```bash
npm install @trpc/client @trpc/server @trpc/react-query
npm install @tanstack/react-query zod
```

### Create tRPC Client

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app'; // Backend type

export const trpc = createTRPCReact<AppRouter>();

// Get auth token from storage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      
      // Add auth headers
      headers() {
        const token = getAuthToken();
        return {
          authorization: token ? `Bearer ${token}` : '',
        };
      },
      
      // Batch requests for efficiency
      maxURLLength: 2083,
    }),
  ],
});
```

### Wrap App with Provider

```typescript
// app/layout.tsx
import { trpc, trpcClient } from '@/lib/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  
  return (
    <html>
      <body>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </trpc.Provider>
      </body>
    </html>
  );
}
```

### Usage in Components

```typescript
// components/AssetDetails.tsx
import { trpc } from '@/lib/trpc';

export function AssetDetails({ assetId }: { assetId: string }) {
  // Query
  const { data: asset, isLoading } = trpc.ipAssets.getById.useQuery(
    { id: assetId },
    { enabled: !!assetId }
  );
  
  // Mutations
  const updateMutation = trpc.ipAssets.update.useMutation();
  const deleteMutation = trpc.ipAssets.delete.useMutation();
  
  if (isLoading) return <Spinner />;
  if (!asset) return <NotFound />;
  
  return (
    <div>
      <h1>{asset.title}</h1>
      <p>{asset.description}</p>
      
      <button
        onClick={() => {
          updateMutation.mutate({
            id: assetId,
            title: 'New Title',
          });
        }}
      >
        Update
      </button>
      
      <button
        onClick={() => {
          if (confirm('Delete this asset?')) {
            deleteMutation.mutate({ id: assetId });
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}
```

---

## Business Logic & Validation

### Client-Side Validation

```typescript
// lib/validation/assets.ts
import { z } from 'zod';
import { ASSET_CONSTANTS } from '@/lib/constants';

export const assetTitleSchema = z.string()
  .min(1, 'Title is required')
  .max(255, 'Title must be 255 characters or less');

export const assetDescriptionSchema = z.string()
  .max(2000, 'Description must be 2000 characters or less')
  .optional();

export const assetMetadataSchema = z.record(z.string(), z.any()).optional();

export const updateAssetFormSchema = z.object({
  title: assetTitleSchema.optional(),
  description: assetDescriptionSchema,
  metadata: assetMetadataSchema,
});

// Usage with react-hook-form
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function EditAssetForm({ asset }: { asset: IpAssetResponse }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(updateAssetFormSchema),
    defaultValues: {
      title: asset.title,
      description: asset.description || '',
      metadata: asset.metadata || {},
    },
  });
  
  const updateMutation = useUpdateAsset();
  
  const onSubmit = (data: z.infer<typeof updateAssetFormSchema>) => {
    updateMutation.mutate({
      id: asset.id,
      ...data,
    });
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('title')} />
      {errors.title && <span>{errors.title.message}</span>}
      
      <textarea {...register('description')} />
      {errors.description && <span>{errors.description.message}</span>}
      
      <button type="submit">Save</button>
    </form>
  );
}
```

### Ownership Split Validation

```typescript
// Validate ownership split totals 100%
export function validateOwnershipSplit(
  owners: Array<{ shareBps: number }>
): { valid: boolean; error?: string } {
  const total = owners.reduce((sum, o) => sum + o.shareBps, 0);
  
  if (total !== 10000) {
    return {
      valid: false,
      error: `Total ownership must equal 100% (10000 basis points). Current: ${total / 100}%`,
    };
  }
  
  return { valid: true };
}

// Usage in ownership form
function AddOwnerForm({ assetId, existingOwners }: Props) {
  const [shareBps, setShareBps] = useState(0);
  const addOwnerMutation = useAddAssetOwner();
  
  const existingTotal = existingOwners.reduce((sum, o) => sum + o.shareBps, 0);
  const remaining = 10000 - existingTotal;
  
  const handleSubmit = () => {
    if (shareBps > remaining) {
      toast.error(`Maximum available ownership is ${remaining / 100}%`);
      return;
    }
    
    addOwnerMutation.mutate({
      id: assetId,
      creatorId: selectedCreatorId,
      shareBps,
      ownershipType: 'CONTRIBUTOR',
    });
  };
  
  return (
    <form>
      <p>Available ownership: {remaining / 100}%</p>
      <input
        type="number"
        min={0}
        max={remaining}
        step={100}
        value={shareBps}
        onChange={(e) => setShareBps(Number(e.target.value))}
      />
      <button onClick={handleSubmit}>Add Owner</button>
    </form>
  );
}
```

### Status Transition Validation

```typescript
export function isValidStatusTransition(
  currentStatus: AssetStatus,
  newStatus: AssetStatus
): boolean {
  const allowedTransitions = ASSET_CONSTANTS.STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions?.includes(newStatus) ?? false;
}

// Usage in status dropdown
function StatusSelector({ asset }: { asset: IpAssetResponse }) {
  const updateStatusMutation = useUpdateAssetStatus();
  
  const handleStatusChange = (newStatus: AssetStatus) => {
    if (!isValidStatusTransition(asset.status, newStatus)) {
      toast.error(`Cannot change status from ${asset.status} to ${newStatus}`);
      return;
    }
    
    updateStatusMutation.mutate({
      id: asset.id,
      status: newStatus,
    });
  };
  
  const availableStatuses = ASSET_CONSTANTS.STATUS_TRANSITIONS[asset.status];
  
  return (
    <select
      value={asset.status}
      onChange={(e) => handleStatusChange(e.target.value as AssetStatus)}
    >
      <option value={asset.status}>{asset.status}</option>
      {availableStatuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
```

---

## Real-time Updates

### Polling Strategy

```typescript
// Poll for asset updates during processing
export function useAssetPolling(assetId: string) {
  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => trpc.ipAssets.getById.query({ id: assetId }),
    refetchInterval: (data) => {
      // Poll every 2 seconds while processing
      if (
        data?.status === 'PROCESSING' ||
        data?.scanStatus === 'PENDING' ||
        data?.scanStatus === 'SCANNING'
      ) {
        return 2000;
      }
      
      // Stop polling when complete
      return false;
    },
    refetchOnWindowFocus: true,
  });
  
  return asset;
}
```

### WebSocket Updates (Future)

```typescript
// When WebSocket support is added
import { useEffect } from 'react';

export function useAssetWebSocket(assetId: string) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const ws = new WebSocket('wss://ops.yesgoddess.agency/ws');
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `asset:${assetId}`,
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'asset:updated') {
        // Invalidate cache to trigger refetch
        queryClient.invalidateQueries(['asset', assetId]);
      }
      
      if (data.type === 'asset:processing:complete') {
        toast.success('Asset processing complete!');
        queryClient.invalidateQueries(['asset', assetId]);
      }
    };
    
    return () => {
      ws.close();
    };
  }, [assetId, queryClient]);
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Asset Management ✅

- [ ] **Setup & Configuration**
  - [ ] Install tRPC client and React Query
  - [ ] Configure API client with authentication
  - [ ] Set up TypeScript types from backend
  - [ ] Create constants file with ASSET_CONSTANTS

- [ ] **File Upload Flow**
  - [ ] Build file selection component with drag-and-drop
  - [ ] Implement client-side validation (size, type)
  - [ ] Create upload progress indicator
  - [ ] Implement initiate → upload → confirm flow
  - [ ] Add error handling for each step
  - [ ] Show processing status after upload

- [ ] **Asset List View**
  - [ ] Build asset grid/list component
  - [ ] Implement pagination
  - [ ] Add filtering UI (type, status, search)
  - [ ] Create asset card component with thumbnail
  - [ ] Add sorting options
  - [ ] Implement loading and empty states

- [ ] **Asset Detail View**
  - [ ] Create asset details page
  - [ ] Display metadata and technical info
  - [ ] Show ownership information
  - [ ] Add preview/download functionality
  - [ ] Implement edit metadata form
  - [ ] Add delete confirmation modal

### Phase 2: Advanced Features 🚀

- [ ] **Status Management**
  - [ ] Build status change dropdown
  - [ ] Validate status transitions
  - [ ] Show status history (future)
  - [ ] Add status change notes field

- [ ] **Ownership Management**
  - [ ] Display ownership split chart
  - [ ] Build add owner form
  - [ ] Validate basis points totals
  - [ ] Show ownership history

- [ ] **License Tracking**
  - [ ] List licenses for asset
  - [ ] Filter by license status
  - [ ] Show revenue attribution
  - [ ] Link to license details

- [ ] **Preview & Variants**
  - [ ] Implement image lightbox
  - [ ] Add video player
  - [ ] Show thumbnail size options
  - [ ] Build regenerate preview UI

- [ ] **Bulk Operations (Admin)**
  - [ ] Add multi-select to asset list
  - [ ] Implement bulk status updates
  - [ ] Add bulk delete (future)

### Phase 3: UX Enhancements ✨

- [ ] **Performance**
  - [ ] Implement infinite scroll
  - [ ] Add optimistic updates
  - [ ] Preload next page
  - [ ] Cache downloaded URLs

- [ ] **Search & Filter**
  - [ ] Full-text search with debounce
  - [ ] Advanced filter panel
  - [ ] Save filter presets
  - [ ] Clear all filters button

- [ ] **Notifications**
  - [ ] Processing complete notifications
  - [ ] Upload success/failure toasts
  - [ ] Status change notifications
  - [ ] Error notifications

---

## UX Considerations

### Loading States

```typescript
function AssetCard({ asset }: { asset: IpAssetResponse }) {
  const { data: thumbnail } = useQuery({
    queryKey: ['thumbnail', asset.id],
    queryFn: () => trpc.ipAssets.getPreview.query({
      id: asset.id,
      size: 'small',
    }),
    enabled: !!asset.thumbnailUrl,
  });
  
  return (
    <div className="card">
      {asset.thumbnailUrl ? (
        thumbnail ? (
          <img src={thumbnail.url} alt={asset.title} />
        ) : (
          <Skeleton className="w-full h-48" />
        )
      ) : (
        <div className="placeholder">
          <FileIcon type={asset.type} />
        </div>
      )}
      
      <h3>{asset.title}</h3>
      
      {asset.status === 'PROCESSING' && (
        <Badge>Processing...</Badge>
      )}
    </div>
  );
}
```

### Empty States

```typescript
function AssetsList() {
  const { assets, isLoading } = useAssets();
  
  if (isLoading) return <LoadingGrid />;
  
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon />}
        title="No assets yet"
        description="Upload your first IP asset to get started"
        action={
          <Button onClick={() => router.push('/assets/upload')}>
            Upload Asset
          </Button>
        }
      />
    );
  }
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
```

### Error States

```typescript
function AssetDetails({ assetId }: { assetId: string }) {
  const { data: asset, error, isLoading } = useAsset(assetId);
  
  if (isLoading) return <LoadingState />;
  
  if (error) {
    if (error.data?.code === 'ASSET_NOT_FOUND') {
      return (
        <ErrorState
          icon={<AlertIcon />}
          title="Asset not found"
          description="This asset may have been deleted or you don't have access."
          action={
            <Button onClick={() => router.push('/assets')}>
              Back to Assets
            </Button>
          }
        />
      );
    }
    
    return (
      <ErrorState
        icon={<ErrorIcon />}
        title="Something went wrong"
        description={error.message}
        action={
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        }
      />
    );
  }
  
  return <AssetDetailsView asset={asset} />;
}
```

### Success Feedback

```typescript
function DeleteAssetButton({ assetId }: { assetId: string }) {
  const deleteMutation = useDeleteAsset();
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <Button
        variant="danger"
        onClick={() => setShowConfirm(true)}
      >
        Delete Asset
      </Button>
      
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Delete Asset"
        description="This action cannot be undone. The asset will be permanently deleted after 30 days."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          deleteMutation.mutate(assetId);
          setShowConfirm(false);
        }}
        isLoading={deleteMutation.isLoading}
      />
    </>
  );
}
```

### Optimistic Updates

```typescript
export function useUpdateAssetOptimistic() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UpdateAssetInput) =>
      trpc.ipAssets.update.mutate(data),
    
    // Optimistically update the UI
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['asset', newData.id]);
      
      // Snapshot previous value
      const previousAsset = queryClient.getQueryData(['asset', newData.id]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['asset', newData.id], (old: any) => ({
        ...old,
        ...newData,
        updatedAt: new Date().toISOString(),
      }));
      
      return { previousAsset };
    },
    
    // Rollback on error
    onError: (err, newData, context) => {
      queryClient.setQueryData(
        ['asset', newData.id],
        context?.previousAsset
      );
      toast.error('Failed to update asset');
    },
    
    // Refetch after success
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['asset', variables.id]);
      toast.success('Asset updated successfully');
    },
  });
}
```

---

## Example Implementations

### Complete Upload Component

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { validateFile, uploadToStorage } from '@/lib/upload';
import { toast } from 'sonner';

export function AssetUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
  };
  
  const handleUpload = async () => {
    if (!file) return;
    
    try {
      setUploading(true);
      
      // Step 1: Initiate upload
      const initData = await trpc.ipAssets.initiateUpload.mutate({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      
      // Step 2: Upload to storage
      await uploadToStorage(file, initData.uploadUrl, setProgress);
      
      // Step 3: Confirm upload
      const asset = await trpc.ipAssets.confirmUpload.mutate({
        assetId: initData.assetId,
        title,
        description,
      });
      
      toast.success('Upload complete!');
      router.push(`/assets/${asset.id}`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Upload Asset</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Select File
          </label>
          <input
            type="file"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full"
          />
        </div>
        
        {file && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 border rounded"
                rows={4}
              />
            </div>
            
            <button
              onClick={handleUpload}
              disabled={uploading || !title}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {uploading ? `Uploading... ${progress}%` : 'Upload'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

### Complete Assets List Component

```typescript
'use client';

import { useState } from 'react';
import { useAssetsPaginated } from '@/hooks/useAssets';
import { AssetCard } from '@/components/AssetCard';
import { AssetFilters } from '@/components/AssetFilters';
import { Pagination } from '@/components/Pagination';

export function AssetsList() {
  const {
    assets,
    meta,
    isLoading,
    page,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
    updateFilters,
  } = useAssetsPaginated();
  
  if (isLoading) {
    return <LoadingGrid />;
  }
  
  if (assets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No assets found</p>
        <button className="btn-primary">Upload Your First Asset</button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <AssetFilters onChange={updateFilters} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
      
      {meta && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(meta.total / meta.pageSize)}
          onNext={nextPage}
          onPrev={prevPage}
          hasNext={hasNextPage}
          hasPrev={hasPrevPage}
        />
      )}
    </div>
  );
}
```

---

## Testing Recommendations

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { validateFile } from '@/lib/upload';
import { ASSET_CONSTANTS } from '@/lib/constants';

describe('validateFile', () => {
  it('should accept valid image file', () => {
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });
  
  it('should reject file that is too large', () => {
    const file = new File(
      [new ArrayBuffer(ASSET_CONSTANTS.MAX_FILE_SIZE + 1)],
      'large.png',
      { type: 'image/png' }
    );
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });
  
  it('should reject unsupported file type', () => {
    const file = new File(['content'], 'test.exe', { type: 'application/exe' });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });
});
```

### Integration Tests

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { AssetsList } from '@/components/AssetsList';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc');

describe('AssetsList', () => {
  it('should display assets', async () => {
    const mockAssets = [
      { id: '1', title: 'Asset 1', type: 'IMAGE', /* ... */ },
      { id: '2', title: 'Asset 2', type: 'VIDEO', /* ... */ },
    ];
    
    vi.mocked(trpc.ipAssets.list.useQuery).mockReturnValue({
      data: { data: mockAssets, meta: { total: 2, page: 1 } },
      isLoading: false,
    } as any);
    
    render(<AssetsList />);
    
    await waitFor(() => {
      expect(screen.getByText('Asset 1')).toBeInTheDocument();
      expect(screen.getByText('Asset 2')).toBeInTheDocument();
    });
  });
});
```

---

## Summary

This guide provides everything needed to integrate the IP Assets API into your frontend application. Key takeaways:

1. **Authentication**: All endpoints require JWT in `Authorization` header
2. **Upload Flow**: Three-step process (initiate → upload to storage → confirm)
3. **Error Handling**: Use application error codes for user-friendly messages
4. **Permissions**: Role-based access with row-level security
5. **Real-time Updates**: Poll during processing, WebSocket support coming
6. **Best Practices**: Use React Query for caching, optimistic updates, and error handling

For questions or issues, contact the backend team or refer to Part 1 for detailed API documentation.

---

**Document Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Maintained By:** Backend Team (ops.yesgoddess.agency)
