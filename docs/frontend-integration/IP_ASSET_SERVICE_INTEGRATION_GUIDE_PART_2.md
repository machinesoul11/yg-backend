# IP Asset Service - Frontend Integration Guide (Part 2: Implementation)

**Classification:** ⚡ HYBRID  
**Module:** IP Assets  
**Last Updated:** October 13, 2025  
**Version:** 1.0.0

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Error Handling](#error-handling)
3. [Authorization & Permissions](#authorization--permissions)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [Real-time Updates](#real-time-updates)
6. [Frontend Implementation Guide](#frontend-implementation-guide)
7. [React Query Integration](#react-query-integration)
8. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Business Logic & Validation Rules

### File Upload Validation

**Frontend must validate BEFORE calling `initiateUpload`:**

```typescript
interface UploadValidationResult {
  valid: boolean;
  errors: string[];
}

function validateFileUpload(file: File): UploadValidationResult {
  const errors: string[] = [];
  
  // 1. File size check
  if (file.size === 0) {
    errors.push('File is empty');
  }
  if (file.size > 104_857_600) {
    errors.push('File size exceeds 100MB limit');
  }
  
  // 2. MIME type check
  if (!ASSET_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.type)) {
    errors.push(`File type ${file.type} is not supported`);
  }
  
  // 3. File name validation
  const fileNameRegex = /^[a-zA-Z0-9\-_\. ]+$/;
  if (!fileNameRegex.test(file.name)) {
    errors.push('File name contains invalid characters');
  }
  if (file.name.length > 255) {
    errors.push('File name is too long (max 255 characters)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

**Usage:**
```typescript
const validation = validateFileUpload(selectedFile);
if (!validation.valid) {
  // Show errors to user
  validation.errors.forEach(error => toast.error(error));
  return;
}

// Proceed with upload
```

---

### Title & Description Validation

```typescript
interface TextValidationResult {
  valid: boolean;
  error?: string;
}

function validateTitle(title: string): TextValidationResult {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: 'Title is required' };
  }
  if (title.length > 255) {
    return { valid: false, error: 'Title must be 255 characters or less' };
  }
  return { valid: true };
}

function validateDescription(description?: string): TextValidationResult {
  if (description && description.length > 2000) {
    return { valid: false, error: 'Description must be 2000 characters or less' };
  }
  return { valid: true };
}
```

---

### Status Transition Validation

**Before calling `updateStatus`, check if transition is valid:**

```typescript
function canTransitionStatus(
  currentStatus: AssetStatus,
  targetStatus: AssetStatus
): { allowed: boolean; reason?: string } {
  const allowedTransitions = ASSET_CONSTANTS.STATUS_TRANSITIONS[currentStatus];
  
  if (!allowedTransitions) {
    return { 
      allowed: false, 
      reason: `Unknown status: ${currentStatus}` 
    };
  }
  
  if (!allowedTransitions.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition from ${currentStatus} to ${targetStatus}`,
    };
  }
  
  return { allowed: true };
}

// Usage in UI:
const transition = canTransitionStatus(asset.status, 'PUBLISHED');
if (!transition.allowed) {
  // Disable button or show tooltip with reason
  <Button disabled title={transition.reason}>Publish</Button>
}
```

---

### Ownership Split Validation

**When adding owners, validate total doesn't exceed 100%:**

```typescript
function validateOwnershipSplit(
  existingOwners: AssetOwnerResponse[],
  newShareBps: number
): { valid: boolean; error?: string; currentTotal: number } {
  const currentTotal = existingOwners.reduce(
    (sum, owner) => sum + owner.shareBps, 
    0
  );
  
  if (newShareBps < 1) {
    return { 
      valid: false, 
      error: 'Share must be at least 0.01% (1 basis point)',
      currentTotal 
    };
  }
  
  if (newShareBps > 10000) {
    return { 
      valid: false, 
      error: 'Share cannot exceed 100% (10000 basis points)',
      currentTotal 
    };
  }
  
  const newTotal = currentTotal + newShareBps;
  if (newTotal > 10000) {
    const available = 10000 - currentTotal;
    return {
      valid: false,
      error: `Adding ${newShareBps} bps would exceed 100%. Available: ${available} bps (${available/100}%)`,
      currentTotal,
    };
  }
  
  return { valid: true, currentTotal };
}

// Helper: Convert percentage to basis points
function percentageToBps(percentage: number): number {
  return Math.round(percentage * 100);
}

// Helper: Convert basis points to percentage
function bpsToPercentage(bps: number): number {
  return bps / 100;
}
```

---

### Metadata Validation

**When submitting custom metadata:**

```typescript
function validateMetadata(metadata: Record<string, any>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Type checks for technical fields
  if ('width' in metadata && typeof metadata.width !== 'number') {
    errors.push('width must be a number');
  }
  if ('height' in metadata && typeof metadata.height !== 'number') {
    errors.push('height must be a number');
  }
  if ('duration' in metadata && typeof metadata.duration !== 'number') {
    errors.push('duration must be a number');
  }
  
  // Positive value checks
  if (metadata.width !== undefined && metadata.width <= 0) {
    errors.push('width must be positive');
  }
  if (metadata.height !== undefined && metadata.height <= 0) {
    errors.push('height must be positive');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

## Error Handling

### Error Code Mapping

```typescript
export const ERROR_MESSAGES: Record<string, string> = {
  // Asset Not Found
  ASSET_NOT_FOUND: 'The asset you are looking for does not exist or has been deleted.',
  
  // Upload Errors
  ASSET_UPLOAD_FAILED: 'Upload failed. Please try again.',
  ASSET_FILE_TOO_LARGE: 'File size exceeds the 100MB limit.',
  ASSET_INVALID_FILE_TYPE: 'This file type is not supported.',
  
  // Status Errors
  ASSET_INVALID_STATUS_TRANSITION: 'This status change is not allowed.',
  
  // Access Errors
  ASSET_ACCESS_DENIED: 'You do not have permission to access this asset.',
  
  // Business Logic Errors
  ASSET_HAS_ACTIVE_LICENSES: 'Cannot delete an asset with active licenses.',
  ASSET_VIRUS_DETECTED: 'This file failed the security scan and cannot be uploaded.',
  ASSET_ALREADY_DELETED: 'This asset has already been deleted.',
  
  // Processing Errors
  ASSET_STORAGE_ERROR: 'Storage operation failed. Please try again.',
  ASSET_PROCESSING_FAILED: 'Asset processing failed. You can retry generating previews.',
  ASSET_INVALID_METADATA: 'The metadata format is invalid.',
};

// User-friendly error handler
export function handleAssetError(error: any): string {
  // Check for tRPC error structure
  if (error.cause?.code && error.cause.code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[error.cause.code as keyof typeof ERROR_MESSAGES];
  }
  
  // Fallback to error message
  if (error.message) {
    return error.message;
  }
  
  // Generic fallback
  return 'An unexpected error occurred. Please try again.';
}
```

---

### HTTP Status Code Mapping

| HTTP Status | tRPC Code | Meaning | Frontend Action |
|-------------|-----------|---------|-----------------|
| 400 | `BAD_REQUEST` | Invalid input, validation failed | Show validation errors to user |
| 403 | `FORBIDDEN` | Access denied | Show "You don't have permission" message |
| 404 | `NOT_FOUND` | Asset doesn't exist | Redirect to asset list or show "Not found" page |
| 409 | `CONFLICT` | Business rule violation (e.g., has active licenses) | Show specific conflict message |
| 410 | `NOT_FOUND` | Asset already deleted | Show "Asset no longer exists" |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | Show generic error, offer retry |

---

### Error Handling Patterns

**Pattern 1: Form Submission**
```typescript
async function handleSubmit(data: UpdateAssetInput) {
  setIsSubmitting(true);
  setError(null);
  
  try {
    await trpc.ipAssets.update.mutate(data);
    toast.success('Asset updated successfully');
    router.push(`/assets/${data.id}`);
  } catch (error) {
    const message = handleAssetError(error);
    setError(message);
    toast.error(message);
  } finally {
    setIsSubmitting(false);
  }
}
```

**Pattern 2: Status Transition with Validation**
```typescript
async function handleStatusChange(assetId: string, newStatus: AssetStatus) {
  // Pre-validate transition
  const canTransition = canTransitionStatus(asset.status, newStatus);
  if (!canTransition.allowed) {
    toast.error(canTransition.reason);
    return;
  }
  
  try {
    await trpc.ipAssets.updateStatus.mutate({
      id: assetId,
      status: newStatus,
    });
    toast.success(`Status changed to ${newStatus}`);
  } catch (error) {
    if (error.cause?.code === 'ASSET_INVALID_STATUS_TRANSITION') {
      // Show helpful message with next steps
      toast.error(
        'Invalid status transition. Please submit for review first.',
        { duration: 5000 }
      );
    } else {
      toast.error(handleAssetError(error));
    }
  }
}
```

**Pattern 3: Upload with Progress**
```typescript
async function handleUpload(file: File, projectId?: string) {
  // Validate first
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    validation.errors.forEach(err => toast.error(err));
    return;
  }
  
  setUploadProgress(0);
  setUploadError(null);
  
  try {
    // Step 1: Initiate
    const { uploadUrl, assetId } = await trpc.ipAssets.initiateUpload.mutate({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      projectId,
    });
    
    // Step 2: Upload to storage with progress
    await uploadToStorage(uploadUrl, file, (progress) => {
      setUploadProgress(progress);
    });
    
    // Step 3: Confirm
    const asset = await trpc.ipAssets.confirmUpload.mutate({
      assetId,
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      description: '',
    });
    
    toast.success('Upload complete! Processing...');
    router.push(`/assets/${asset.id}`);
    
  } catch (error) {
    const message = handleAssetError(error);
    setUploadError(message);
    toast.error(message);
  }
}

// Upload helper with progress
async function uploadToStorage(
  url: string, 
  file: File, 
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
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });
    
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

---

## Authorization & Permissions

### User Roles

| Role | Permissions |
|------|-------------|
| **VIEWER** | Cannot access IP Assets module |
| **CREATOR** | Upload assets, view own assets, edit own assets, delete own assets |
| **BRAND** | View licensed assets (when licenses module complete) |
| **ADMIN** | Full access to all assets, approve/reject, bulk operations |

---

### Endpoint-Level Permissions

| Endpoint | CREATOR | BRAND | ADMIN |
|----------|---------|-------|-------|
| `initiateUpload` | ✅ | ❌ | ✅ |
| `confirmUpload` | ✅ (own) | ❌ | ✅ |
| `list` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `getById` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `update` | ✅ (own) | ❌ | ✅ (all) |
| `updateStatus` | ✅ (own) | ❌ | ✅ (all) |
| `delete` | ✅ (own) | ❌ | ✅ (all) |
| `getDownloadUrl` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `getPreview` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `getMetadata` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `getVariants` | ✅ (own) | ✅ (licensed) | ✅ (all) |
| `regeneratePreview` | ✅ (own) | ❌ | ✅ (all) |
| `getDerivatives` | ✅ (own) | ❌ | ✅ (all) |
| `bulkUpdateStatus` | ❌ | ❌ | ✅ |
| `getAssetOwners` | ✅ (own) | ❌ | ✅ (all) |
| `addAssetOwner` | ✅ (own) | ❌ | ✅ (all) |
| `getAssetLicenses` | ✅ (own) | ❌ | ✅ (all) |

---

### Field-Level Permissions

**Computed fields on `IpAssetResponse`:**

```typescript
interface IpAssetResponse {
  // ...other fields
  canEdit: boolean;      // true if creator OR admin
  canDelete: boolean;    // true if creator OR admin
}
```

**Use these in UI:**
```typescript
function AssetActions({ asset }: { asset: IpAssetResponse }) {
  return (
    <>
      {asset.canEdit && (
        <Button onClick={() => router.push(`/assets/${asset.id}/edit`)}>
          Edit
        </Button>
      )}
      {asset.canDelete && (
        <Button variant="destructive" onClick={() => handleDelete(asset.id)}>
          Delete
        </Button>
      )}
    </>
  );
}
```

---

### Role-Based UI Rendering

```typescript
// Hook to get current user role
function useUserRole() {
  const { data: session } = useSession();
  return session?.user?.role as UserRole | undefined;
}

// Component with role-based features
function AssetListPage() {
  const role = useUserRole();
  const isAdmin = role === 'ADMIN';
  
  return (
    <>
      {isAdmin && (
        <div className="admin-tools">
          <BulkActionsToolbar />
          <FilterByCreator />
        </div>
      )}
      
      <AssetList />
    </>
  );
}
```

---

### Resource Ownership Rules

**Row-Level Security (RLS) Implementation:**

1. **Non-Admin Users:**
   - `list` returns only assets where `createdBy = userId`
   - `getById` fails if not creator (403 Forbidden)
   - Cannot see other creators' assets

2. **Admin Users:**
   - See all assets regardless of creator
   - Can edit/delete any asset
   - Can perform bulk operations

**Frontend should respect RLS:**
```typescript
// Don't make these requests if not admin
if (role !== 'ADMIN') {
  // Don't show "View All Assets" link
  // Don't allow filtering by other users
  // Don't show bulk operations
}
```

---

## Rate Limiting & Quotas

### Current Status

**No rate limiting is currently implemented on the IP Asset Service endpoints.**

The backend does not enforce rate limits on asset operations. However, you should still implement client-side throttling/debouncing for optimal UX.

---

### Future Rate Limiting

If rate limiting is added in the future, expect:

```typescript
// Rate limit headers (standard pattern)
'X-RateLimit-Limit': '100'        // Requests per window
'X-RateLimit-Remaining': '95'     // Remaining requests
'X-RateLimit-Reset': '1697234400' // Unix timestamp

// Rate limit error response
{
  code: 'TOO_MANY_REQUESTS',
  message: 'Rate limit exceeded. Try again in 15 minutes.',
  retryAfter: 900  // seconds
}
```

---

### Client-Side Best Practices

**Even without server-side rate limiting, implement client-side throttling:**

```typescript
import { debounce } from 'lodash';

// Debounce search queries
const debouncedSearch = debounce(async (query: string) => {
  const results = await trpc.ipAssets.list.query({
    filters: { search: query },
  });
  setSearchResults(results);
}, 500); // 500ms delay

// Throttle metadata refresh
const throttledRefresh = throttle(async (assetId: string) => {
  await trpc.ipAssets.regeneratePreview.mutate({
    id: assetId,
    types: ['metadata'],
  });
}, 5000); // Max once per 5 seconds
```

---

### Upload Quotas

**Per-file limits:**
- Max file size: 100MB (enforced)
- No limit on number of files per user
- No limit on total storage per user

**Signed URL expiry:**
- Upload URLs expire after 15 minutes
- If upload takes longer, request new URL via `initiateUpload`

---

## Real-time Updates

### Background Job Completion

The backend uses BullMQ for background jobs but **does not currently emit real-time events to the frontend**.

**Current Polling Approach:**

```typescript
function useAssetProcessingStatus(assetId: string) {
  const { data: asset, refetch } = trpc.ipAssets.getById.useQuery({ id: assetId });
  
  useEffect(() => {
    if (!asset) return;
    
    // Poll while processing
    const isProcessing = 
      asset.scanStatus === 'PENDING' ||
      asset.scanStatus === 'SCANNING' ||
      asset.status === 'PROCESSING';
    
    if (isProcessing) {
      const interval = setInterval(() => {
        refetch();
      }, 3000); // Poll every 3 seconds
      
      return () => clearInterval(interval);
    }
  }, [asset, refetch]);
  
  return {
    isProcessing: asset?.scanStatus === 'SCANNING' || asset?.status === 'PROCESSING',
    isComplete: asset?.scanStatus === 'CLEAN' && asset?.status !== 'PROCESSING',
    hasFailed: asset?.scanStatus === 'INFECTED' || asset?.scanStatus === 'ERROR',
  };
}

// Usage in component
function AssetDetailPage({ assetId }: { assetId: string }) {
  const { data: asset } = trpc.ipAssets.getById.useQuery({ id: assetId });
  const { isProcessing, isComplete, hasFailed } = useAssetProcessingStatus(assetId);
  
  return (
    <div>
      {isProcessing && (
        <Alert>
          <Loader className="animate-spin" />
          Processing asset... Thumbnails and metadata will be available shortly.
        </Alert>
      )}
      
      {isComplete && <AssetDisplay asset={asset} />}
      
      {hasFailed && (
        <Alert variant="destructive">
          Asset processing failed. Please contact support.
        </Alert>
      )}
    </div>
  );
}
```

---

### Future WebSocket Support

The backend has infrastructure for WebSockets but they are not yet implemented for asset events.

**When implemented, expect events like:**
```typescript
// Subscribe to asset updates
socket.on('asset:updated', (data: { assetId: string; changes: Partial<IpAssetResponse> }) => {
  // Update UI optimistically
  queryClient.setQueryData(['asset', data.assetId], (old) => ({
    ...old,
    ...data.changes,
  }));
});

socket.on('asset:processing:complete', (data: { assetId: string; type: string }) => {
  // Refetch asset to get new thumbnails/metadata
  queryClient.invalidateQueries(['asset', data.assetId]);
});
```

---

### Notification System Integration

When asset status changes (APPROVED/REJECTED), the backend sends notifications via the notification system.

**Frontend should display these:**
```typescript
// Poll for unread notifications
const { data: notifications } = trpc.notifications.getUnread.useQuery();

notifications?.forEach(notification => {
  if (notification.type === 'PROJECT' && notification.metadata?.assetId) {
    // Show toast or notification UI
    toast.info(notification.message, {
      action: {
        label: 'View Asset',
        onClick: () => router.push(`/assets/${notification.metadata.assetId}`),
      },
    });
  }
});
```

---

## Frontend Implementation Guide

### Step-by-Step Setup

#### 1. Install Dependencies

```bash
npm install @trpc/client @trpc/react-query @tanstack/react-query
npm install react-dropzone # For file upload UI
npm install date-fns # For date formatting
```

---

#### 2. Create API Client

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

---

#### 3. Setup tRPC Provider

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: 'https://ops.yesgoddess.agency/api/trpc',
          credentials: 'include', // Include cookies for auth
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

---

#### 4. Create Upload Component

```typescript
// components/AssetUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { trpc } from '@/lib/trpc';
import { validateFileUpload } from '@/lib/validation';
import { toast } from 'sonner';

interface AssetUploadProps {
  projectId?: string;
  onSuccess?: (assetId: string) => void;
}

export function AssetUpload({ projectId, onSuccess }: AssetUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const initiateUpload = trpc.ipAssets.initiateUpload.useMutation();
  const confirmUpload = trpc.ipAssets.confirmUpload.useMutation();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Validate
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      validation.errors.forEach(err => toast.error(err));
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Initiate
      const { uploadUrl, assetId } = await initiateUpload.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        projectId,
      });

      // Step 2: Upload to storage
      await uploadToStorage(uploadUrl, file, setProgress);

      // Step 3: Confirm
      await confirmUpload.mutateAsync({
        assetId,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
      });

      toast.success('Upload complete!');
      onSuccess?.(assetId);
    } catch (error) {
      toast.error(handleAssetError(error));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [projectId, initiateUpload, confirmUpload, onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 104_857_600, // 100MB
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      'audio/*': ['.mp3', '.wav', '.ogg', '.aac'],
      'application/pdf': ['.pdf'],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />
      
      {uploading ? (
        <div className="space-y-2">
          <p>Uploading... {Math.round(progress)}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-lg font-medium">
            {isDragActive ? 'Drop file here' : 'Drag & drop file here'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            or click to select file (max 100MB)
          </p>
        </div>
      )}
    </div>
  );
}
```

---

#### 5. Create Asset List Component

```typescript
// components/AssetList.tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AssetType, AssetStatus } from '@/lib/types';
import { formatFileSize } from '@/lib/utils';

export function AssetList() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: undefined as AssetType | undefined,
    status: undefined as AssetStatus | undefined,
    search: '',
  });

  const { data, isLoading } = trpc.ipAssets.list.useQuery({
    page,
    pageSize: 20,
    filters,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search assets..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        
        <select
          value={filters.type || ''}
          onChange={(e) => setFilters({ 
            ...filters, 
            type: e.target.value as AssetType || undefined 
          })}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
          <option value="AUDIO">Audio</option>
          <option value="DOCUMENT">Documents</option>
        </select>
        
        <select
          value={filters.status || ''}
          onChange={(e) => setFilters({ 
            ...filters, 
            status: e.target.value as AssetStatus || undefined 
          })}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="REVIEW">In Review</option>
          <option value="APPROVED">Approved</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </div>

      {/* Asset Grid */}
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.data.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>

          {/* Pagination */}
          {data && data.meta.hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => setPage(page + 1)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssetCard({ asset }: { asset: IpAssetResponse }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      {asset.thumbnailUrl && (
        <img
          src={asset.thumbnailUrl}
          alt={asset.title}
          className="w-full h-48 object-cover rounded"
        />
      )}
      
      <h3 className="font-semibold truncate">{asset.title}</h3>
      
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{asset.type}</span>
        <span>{formatFileSize(asset.fileSize)}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <StatusBadge status={asset.status} />
        {asset.scanStatus === 'SCANNING' && (
          <span className="text-xs text-blue-600">Processing...</span>
        )}
      </div>
      
      {asset.canEdit && (
        <button className="w-full px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
          Edit
        </button>
      )}
    </div>
  );
}
```

---

#### 6. Create Asset Detail Component

```typescript
// components/AssetDetail.tsx
'use client';

import { trpc } from '@/lib/trpc';
import { useAssetProcessingStatus } from '@/hooks/useAssetProcessingStatus';

export function AssetDetail({ assetId }: { assetId: string }) {
  const { data: asset } = trpc.ipAssets.getById.useQuery({ id: assetId });
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'processing'],
  });
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });
  
  const { isProcessing } = useAssetProcessingStatus(assetId);

  if (!asset) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{asset.title}</h1>
        <p className="text-gray-600 mt-2">{asset.description}</p>
      </div>

      {/* Processing Alert */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">
            ⏳ Processing asset... Thumbnails and metadata will be ready soon.
          </p>
        </div>
      )}

      {/* Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {variants?.thumbnails.large && (
            <img
              src={variants.thumbnails.large.url}
              alt={asset.title}
              className="w-full rounded-lg shadow"
            />
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">File Info</h3>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Type:</dt>
                <dd>{asset.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Size:</dt>
                <dd>{formatFileSize(asset.fileSize)}</dd>
              </div>
              {metadata?.technical?.width && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Dimensions:</dt>
                  <dd>{metadata.technical.width} × {metadata.technical.height}</dd>
                </div>
              )}
            </dl>
          </div>

          <div>
            <h3 className="font-semibold">Status</h3>
            <StatusBadge status={asset.status} />
          </div>

          {asset.canEdit && (
            <AssetActions asset={asset} />
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## React Query Integration

### Query Hook Patterns

```typescript
// hooks/useAsset.ts
import { trpc } from '@/lib/trpc';

export function useAsset(assetId: string) {
  return trpc.ipAssets.getById.useQuery(
    { id: assetId },
    {
      enabled: !!assetId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    }
  );
}

export function useAssetList(filters?: ListAssetsInput['filters']) {
  return trpc.ipAssets.list.useQuery(
    { filters, page: 1, pageSize: 20 },
    {
      keepPreviousData: true, // Smooth pagination
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );
}

export function useAssetMetadata(assetId: string) {
  return trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['all'] },
    {
      enabled: !!assetId,
      staleTime: 10 * 60 * 1000, // 10 minutes (metadata rarely changes)
    }
  );
}
```

---

### Mutation Hook Patterns

```typescript
// hooks/useAssetMutations.ts
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  
  return trpc.ipAssets.update.useMutation({
    onSuccess: (data) => {
      // Invalidate and refetch asset
      queryClient.invalidateQueries(['ipAssets', 'getById', { id: data.id }]);
      queryClient.invalidateQueries(['ipAssets', 'list']);
      toast.success('Asset updated successfully');
    },
    onError: (error) => {
      toast.error(handleAssetError(error));
    },
  });
}

export function useUpdateAssetStatus() {
  const queryClient = useQueryClient();
  
  return trpc.ipAssets.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries(['ipAssets', 'getById', { id }]);
      
      const previous = queryClient.getQueryData(['ipAssets', 'getById', { id }]);
      
      queryClient.setQueryData(['ipAssets', 'getById', { id }], (old: any) => ({
        ...old,
        status,
      }));
      
      return { previous };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(
          ['ipAssets', 'getById', { id: variables.id }],
          context.previous
        );
      }
      toast.error(handleAssetError(error));
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['ipAssets', 'list']);
      toast.success(`Status changed to ${data.status}`);
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  const router = useRouter();
  
  return trpc.ipAssets.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries(['ipAssets', 'list']);
      toast.success('Asset deleted');
      router.push('/assets');
    },
    onError: (error) => {
      toast.error(handleAssetError(error));
    },
  });
}
```

---

### Prefetching for Better UX

```typescript
// Prefetch on hover
function AssetListItem({ asset }: { asset: IpAssetResponse }) {
  const trpcContext = trpc.useContext();
  
  const prefetchAsset = () => {
    trpcContext.ipAssets.getById.prefetch({ id: asset.id });
  };
  
  return (
    <Link
      href={`/assets/${asset.id}`}
      onMouseEnter={prefetchAsset}
      className="block p-4 hover:bg-gray-50"
    >
      {asset.title}
    </Link>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Upload & List (Week 1)

- [ ] **Setup tRPC client and provider**
  - [ ] Install dependencies
  - [ ] Configure API client with auth
  - [ ] Wrap app with providers

- [ ] **File Upload Component**
  - [ ] Drag-and-drop UI (react-dropzone)
  - [ ] File validation (size, type, name)
  - [ ] Progress indicator
  - [ ] Upload to signed URL
  - [ ] Confirm upload with title/description
  - [ ] Error handling with user-friendly messages

- [ ] **Asset List Page**
  - [ ] Grid/list view of assets
  - [ ] Thumbnail previews
  - [ ] Basic filters (type, status)
  - [ ] Search functionality
  - [ ] Pagination (infinite scroll or pages)
  - [ ] Loading states
  - [ ] Empty states

---

### Phase 2: Asset Detail & Management (Week 2)

- [ ] **Asset Detail Page**
  - [ ] Full asset information display
  - [ ] Large preview image/video player
  - [ ] Technical metadata display
  - [ ] Status badge
  - [ ] Processing status indicator
  - [ ] Download button (signed URL)
  - [ ] Poll for completion while processing

- [ ] **Edit Asset Form**
  - [ ] Title/description editor
  - [ ] Custom metadata fields
  - [ ] Form validation
  - [ ] Save with optimistic updates
  - [ ] Permission checks (canEdit)

- [ ] **Status Management**
  - [ ] Status change dropdown/buttons
  - [ ] Workflow validation (allowed transitions)
  - [ ] Admin approval flow
  - [ ] Notes field for rejection
  - [ ] Status history timeline (if API added)

- [ ] **Delete Functionality**
  - [ ] Delete button with confirmation modal
  - [ ] Check for active licenses warning
  - [ ] Permission checks (canDelete)
  - [ ] Redirect after delete

---

### Phase 3: Advanced Features (Week 3)

- [ ] **Asset Variants & Previews**
  - [ ] Size selector for thumbnails (small/medium/large)
  - [ ] Video/audio player with preview clips
  - [ ] Waveform display for audio
  - [ ] Regenerate preview button
  - [ ] Processing status for each variant type

- [ ] **Ownership Management**
  - [ ] Display ownership breakdown (pie chart)
  - [ ] Add co-owner form
  - [ ] Ownership validation (100% limit)
  - [ ] Basis points ↔ percentage converter
  - [ ] Contract reference upload

- [ ] **Licensing View**
  - [ ] List of licenses for asset
  - [ ] Filter by license status
  - [ ] Revenue display
  - [ ] License detail modal/page

- [ ] **Derivatives & Versioning**
  - [ ] Version history list
  - [ ] Compare versions side-by-side
  - [ ] Create derivative button
  - [ ] Parent asset breadcrumb

---

### Phase 4: Polish & Optimization (Week 4)

- [ ] **Performance**
  - [ ] Implement prefetching on hover
  - [ ] Optimize list rendering (virtualization)
  - [ ] Image lazy loading
  - [ ] Debounce search input
  - [ ] Cache management strategy

- [ ] **Error Handling**
  - [ ] Global error boundary
  - [ ] Retry failed requests
  - [ ] Offline detection
  - [ ] User-friendly error messages
  - [ ] Error logging/tracking

- [ ] **UX Enhancements**
  - [ ] Skeleton loaders
  - [ ] Toast notifications for all actions
  - [ ] Keyboard shortcuts
  - [ ] Responsive design (mobile-first)
  - [ ] Accessibility (ARIA labels, keyboard nav)

- [ ] **Admin Features**
  - [ ] Bulk actions (status update, delete)
  - [ ] Filter by creator
  - [ ] Advanced search
  - [ ] Export asset list (CSV)
  - [ ] Admin dashboard metrics

---

### Edge Cases to Handle

1. **Upload interrupted:** Show resume option or restart
2. **Processing timeout:** Allow manual retry via regeneratePreview
3. **Virus detected:** Clear error message, offer to contact support
4. **Deleted asset:** Show "Not found" page, offer to go back
5. **Invalid status transition:** Explain workflow, show next valid steps
6. **Ownership exceeds 100%:** Show current total, calculate available
7. **Active licenses prevent delete:** List active licenses, suggest archive instead
8. **Large file upload:** Show accurate progress, allow cancel
9. **Signed URL expired:** Automatically request new URL
10. **Concurrent edits:** Detect conflicts, offer to reload

---

### Testing Recommendations

1. **Unit Tests**
   - Validation functions (file, title, status, ownership)
   - Helper functions (formatFileSize, bpsToPercentage)
   - Error message mapping

2. **Integration Tests**
   - Complete upload flow
   - Status workflow transitions
   - Search and filtering
   - Permission-based UI rendering

3. **E2E Tests (Playwright/Cypress)**
   - Upload asset → confirm → view detail
   - Edit asset metadata → save
   - Change status → approve → publish
   - Delete asset → confirm deletion
   - Add co-owner → validate percentage

4. **Manual Testing Scenarios**
   - Upload different file types (image, video, audio, PDF)
   - Test with 99MB file (near limit)
   - Test with 101MB file (exceeds limit)
   - Upload while offline → show error
   - Interrupt upload → restart
   - Wait for processing → verify thumbnails appear

---

## Summary

This guide provides everything needed to integrate with the IP Asset Service:

✅ **Complete API reference** with all 17 endpoints  
✅ **TypeScript types** ready to copy into frontend  
✅ **Validation rules** for client-side checks  
✅ **Error handling** patterns with user-friendly messages  
✅ **Permission model** for role-based UI  
✅ **React components** for common use cases  
✅ **React Query patterns** for optimal data fetching  
✅ **Implementation checklist** with 4-week timeline  

**Next Steps:**
1. Copy TypeScript types into your codebase
2. Setup tRPC client with authentication
3. Implement upload component (Phase 1)
4. Build asset list and detail pages (Phase 2)
5. Add advanced features (Phase 3-4)

**Questions?**
- Check existing documentation in `docs/modules/ip-assets/`
- Review `src/modules/ip/types.ts` for latest type definitions
- Test against `https://ops.yesgoddess.agency/api/trpc`

---

**Document Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Module Status:** ✅ Production Ready
