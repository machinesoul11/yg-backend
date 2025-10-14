# Asset Processing - Frontend Integration Guide
## Part 2: Error Handling, Business Logic & Authorization

**Classification:** ⚡ HYBRID  
**Module:** Asset Processing  
**Last Updated:** October 13, 2025  
**Version:** 2.0

> **Prerequisite:** Read [Part 1: API Endpoints](./ASSET_PROCESSING_GUIDE_PART_1_API_ENDPOINTS.md) first.

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Business Logic & Validation Rules](#business-logic--validation-rules)
3. [Authorization & Permissions](#authorization--permissions)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [File Upload Flow](#file-upload-flow)
6. [Real-time Updates](#real-time-updates)

---

## Error Handling

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    message: string;         // Human-readable error message
    code: string;            // Error code for programmatic handling
    data?: {                 // Optional error details
      code?: string;         // Backend error code (e.g., 'ASSET_NOT_FOUND')
      details?: any;         // Additional context
    };
  };
}
```

### HTTP Status Codes

| Status | tRPC Code | Meaning | When to Show User |
|--------|-----------|---------|-------------------|
| 400 | `BAD_REQUEST` | Invalid input, validation failed | Show specific field errors |
| 403 | `FORBIDDEN` | User lacks permission | "You don't have access to this resource" |
| 404 | `NOT_FOUND` | Resource doesn't exist | "Asset not found" |
| 409 | `CONFLICT` | Business rule violation | Show specific conflict message |
| 410 | `NOT_FOUND` | Resource was deleted | "This asset has been deleted" |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | "Something went wrong, please try again" |

---

### Error Codes Reference

#### Asset Not Found
```typescript
{
  code: 'NOT_FOUND',
  data: {
    code: 'ASSET_NOT_FOUND',
    details: { assetId: 'cm2xyz...' }
  }
}
```
**User Message:** "Asset not found. It may have been deleted."

---

#### Upload Failed
```typescript
{
  code: 'INTERNAL_SERVER_ERROR',
  data: {
    code: 'ASSET_UPLOAD_FAILED',
    details: { reason: 'Storage provider timeout' }
  }
}
```
**User Message:** "Upload failed. Please try again."

---

#### Invalid Status Transition
```typescript
{
  code: 'BAD_REQUEST',
  data: {
    code: 'ASSET_INVALID_STATUS_TRANSITION',
    details: { current: 'PUBLISHED', attempted: 'DRAFT' }
  }
}
```
**User Message:** "Cannot move asset from Published back to Draft."

---

#### Has Active Licenses
```typescript
{
  code: 'CONFLICT',
  data: {
    code: 'ASSET_HAS_ACTIVE_LICENSES',
    details: { assetId: 'cm2xyz...' }
  }
}
```
**User Message:** "Cannot delete asset with active licenses. Terminate licenses first."

---

#### Virus Detected
```typescript
{
  code: 'BAD_REQUEST',
  data: {
    code: 'ASSET_VIRUS_DETECTED',
    details: { assetId: 'cm2xyz...' }
  }
}
```
**User Message:** "File failed security scan. Please contact support."

---

#### Access Denied
```typescript
{
  code: 'FORBIDDEN',
  data: {
    code: 'ASSET_ACCESS_DENIED',
    details: { assetId: 'cm2xyz...' }
  }
}
```
**User Message:** "You don't have permission to access this asset."

---

#### Invalid File Type
```typescript
{
  code: 'BAD_REQUEST',
  data: {
    code: 'ASSET_INVALID_FILE_TYPE',
    details: { mimeType: 'application/exe' }
  }
}
```
**User Message:** "File type not supported. Please upload an image, video, audio, or document."

---

#### File Too Large
```typescript
{
  code: 'BAD_REQUEST',
  data: {
    code: 'ASSET_FILE_TOO_LARGE',
    details: { size: 150000000, maxSize: 104857600 }
  }
}
```
**User Message:** "File size exceeds 100MB limit."

---

#### Storage Error
```typescript
{
  code: 'INTERNAL_SERVER_ERROR',
  data: {
    code: 'ASSET_STORAGE_ERROR',
    details: { operation: 'upload', details: {...} }
  }
}
```
**User Message:** "Storage error. Please try again later."

---

#### Processing Failed
```typescript
{
  code: 'INTERNAL_SERVER_ERROR',
  data: {
    code: 'ASSET_PROCESSING_FAILED',
    details: { operation: 'thumbnail', reason: 'Corrupt image data' }
  }
}
```
**User Message:** "Asset processing failed. The file may be corrupt."

---

### Error Handling Implementation

```typescript
// utils/error-handler.ts

import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';

export function getErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const errorData = error.data as any;
    
    // Check for specific error codes
    switch (errorData?.code) {
      case 'ASSET_NOT_FOUND':
        return 'Asset not found. It may have been deleted.';
      
      case 'ASSET_ACCESS_DENIED':
        return "You don't have permission to access this asset.";
      
      case 'ASSET_INVALID_STATUS_TRANSITION':
        return `Cannot change status from ${errorData.details?.current} to ${errorData.details?.attempted}.`;
      
      case 'ASSET_HAS_ACTIVE_LICENSES':
        return 'Cannot delete asset with active licenses.';
      
      case 'ASSET_VIRUS_DETECTED':
        return 'File failed security scan. Please contact support.';
      
      case 'ASSET_INVALID_FILE_TYPE':
        return `File type "${errorData.details?.mimeType}" is not supported.`;
      
      case 'ASSET_FILE_TOO_LARGE':
        const sizeMB = (errorData.details?.size / (1024 * 1024)).toFixed(1);
        return `File size (${sizeMB}MB) exceeds 100MB limit.`;
      
      case 'ASSET_UPLOAD_FAILED':
        return 'Upload failed. Please try again.';
      
      case 'ASSET_PROCESSING_FAILED':
        return 'Asset processing failed. The file may be corrupt.';
      
      case 'ASSET_STORAGE_ERROR':
        return 'Storage error. Please try again later.';
      
      default:
        return error.message || 'An error occurred';
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

export function shouldRetry(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const errorData = error.data as any;
    
    // Don't retry client errors (4xx)
    const noRetryErrors = [
      'ASSET_NOT_FOUND',
      'ASSET_ACCESS_DENIED',
      'ASSET_INVALID_STATUS_TRANSITION',
      'ASSET_HAS_ACTIVE_LICENSES',
      'ASSET_VIRUS_DETECTED',
      'ASSET_INVALID_FILE_TYPE',
      'ASSET_FILE_TOO_LARGE',
    ];
    
    if (noRetryErrors.includes(errorData?.code)) {
      return false;
    }
    
    // Retry server errors (5xx)
    return error.data?.code === 'INTERNAL_SERVER_ERROR';
  }
  
  return false;
}

export function getErrorSeverity(error: unknown): 'error' | 'warning' | 'info' {
  if (error instanceof TRPCClientError) {
    const errorData = error.data as any;
    
    // Critical errors
    if (['ASSET_VIRUS_DETECTED', 'ASSET_STORAGE_ERROR'].includes(errorData?.code)) {
      return 'error';
    }
    
    // Warnings
    if (['ASSET_INVALID_STATUS_TRANSITION', 'ASSET_HAS_ACTIVE_LICENSES'].includes(errorData?.code)) {
      return 'warning';
    }
    
    // Info
    if (['ASSET_NOT_FOUND'].includes(errorData?.code)) {
      return 'info';
    }
  }
  
  return 'error';
}
```

### React Query Error Handling

```typescript
// hooks/use-upload-asset.ts

import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/error-handler';

export function useUploadAsset() {
  const uploadMutation = trpc.ipAssets.confirmUpload.useMutation({
    onError: (error) => {
      const message = getErrorMessage(error);
      toast.error(message);
    },
    onSuccess: (asset) => {
      toast.success('Asset uploaded successfully');
    },
  });

  return uploadMutation;
}
```

---

## Business Logic & Validation Rules

### Client-Side Validation

**Always validate on the client before API calls** to provide instant feedback.

#### File Validation

```typescript
// utils/validators.ts

export interface FileValidationResult {
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
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/tiff',
    // Videos
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
    // Documents
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // 3D Models
    'model/gltf+json', 'model/gltf-binary',
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
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
```

---

#### Title & Description Validation

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

---

### Status Transitions

Only allow valid status transitions in the UI:

```typescript
export const STATUS_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  PROCESSING: ['DRAFT', 'REVIEW'],
  REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  REJECTED: ['DRAFT'],
  ARCHIVED: [],
};

export function getValidStatusTransitions(
  currentStatus: AssetStatus
): AssetStatus[] {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

export function canTransitionStatus(
  currentStatus: AssetStatus,
  newStatus: AssetStatus
): boolean {
  return STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
}

// Usage in component
function StatusDropdown({ asset }: { asset: IpAssetResponse }) {
  const validStatuses = getValidStatusTransitions(asset.status);
  
  return (
    <select>
      <option value={asset.status}>{asset.status}</option>
      {validStatuses.map(status => (
        <option key={status} value={status}>{status}</option>
      ))}
    </select>
  );
}
```

---

### Asset Type Detection

```typescript
export function getAssetTypeFromMime(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('model/')) return 'THREE_D';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('excel')
  ) return 'DOCUMENT';
  return 'OTHER';
}

export function getAssetIcon(type: AssetType): string {
  const icons: Record<AssetType, string> = {
    IMAGE: '🖼️',
    VIDEO: '🎥',
    AUDIO: '🎵',
    DOCUMENT: '📄',
    THREE_D: '🧊',
    OTHER: '📎',
  };
  return icons[type];
}

export function getAssetColor(type: AssetType): string {
  const colors: Record<AssetType, string> = {
    IMAGE: 'blue',
    VIDEO: 'purple',
    AUDIO: 'green',
    DOCUMENT: 'orange',
    THREE_D: 'pink',
    OTHER: 'gray',
  };
  return colors[type];
}
```

---

### Processing Status Checks

```typescript
export function isAssetProcessing(asset: IpAssetResponse): boolean {
  return asset.scanStatus === 'SCANNING' || asset.scanStatus === 'PENDING';
}

export function isAssetReady(asset: IpAssetResponse): boolean {
  return asset.scanStatus === 'CLEAN' && asset.thumbnailUrl !== null;
}

export function getProcessingStep(metadata?: AssetMetadataResponse): string {
  if (!metadata?.processing) return 'Uploading...';
  
  if (!metadata.processing.thumbnailGenerated) {
    return 'Generating thumbnails...';
  }
  
  if (!metadata.processing.metadataExtracted) {
    return 'Extracting metadata...';
  }
  
  if (!metadata.processing.previewGenerated && 
      (metadata.type === 'VIDEO' || metadata.type === 'AUDIO')) {
    return 'Generating preview...';
  }
  
  return 'Processing complete';
}
```

---

### Ownership Share Validation

```typescript
export function validateOwnershipShares(
  owners: AssetOwner[],
  newShare: number
): { valid: boolean; error?: string } {
  const totalShares = owners.reduce((sum, owner) => sum + owner.shareBps, 0);
  
  if (totalShares + newShare > 10000) {
    return {
      valid: false,
      error: `Total ownership cannot exceed 100%. Current: ${totalShares / 100}%, Adding: ${newShare / 100}%`,
    };
  }
  
  if (newShare < 1 || newShare > 10000) {
    return {
      valid: false,
      error: 'Share must be between 0.01% and 100%',
    };
  }
  
  return { valid: true };
}

// Helper to convert basis points to percentage
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + '%';
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Role | Can Upload | Can View Own | Can View All | Can Edit Own | Can Edit All | Can Delete Own | Can Delete All | Can Approve |
|------|------------|--------------|--------------|--------------|--------------|----------------|----------------|-------------|
| **CREATOR** | ✅ | ✅ | ❌ | ✅ | ❌ | ✅* | ❌ | ❌ |
| **BRAND** | ✅ | ✅ | ❌ | ✅ | ❌ | ✅* | ❌ | ❌ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

*Cannot delete assets with active licenses

---

### Permission Helpers

```typescript
// utils/permissions.ts

export function canEditAsset(
  asset: IpAssetResponse,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'ADMIN') return true;
  if (asset.createdBy === userId) return true;
  return false;
}

export function canDeleteAsset(
  asset: IpAssetResponse,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'ADMIN') return true;
  if (asset.createdBy === userId && asset.canDelete) return true;
  return false;
}

export function canApproveAsset(userRole: string): boolean {
  return userRole === 'ADMIN';
}

export function canViewAsset(
  asset: IpAssetResponse,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'ADMIN') return true;
  if (asset.createdBy === userId) return true;
  // Add license check here if needed
  return false;
}

// Usage in component
function AssetActions({ asset, user }: Props) {
  const canEdit = canEditAsset(asset, user.id, user.role);
  const canDelete = canDeleteAsset(asset, user.id, user.role);
  
  return (
    <div>
      {canEdit && <EditButton assetId={asset.id} />}
      {canDelete && <DeleteButton assetId={asset.id} />}
    </div>
  );
}
```

---

### Field-Level Permissions

Certain metadata fields should only be editable by admins:

```typescript
const ADMIN_ONLY_FIELDS = [
  'scanStatus',
  'scanResult',
  'version',
  'parentAssetId',
  'createdBy',
  'deletedAt',
];

export function canEditField(
  fieldName: string,
  userRole: string
): boolean {
  if (userRole === 'ADMIN') return true;
  return !ADMIN_ONLY_FIELDS.includes(fieldName);
}
```

---

### Status Transition Permissions

```typescript
export function canTransitionToStatus(
  currentStatus: AssetStatus,
  newStatus: AssetStatus,
  userRole: string
): boolean {
  // Check if transition is valid
  if (!canTransitionStatus(currentStatus, newStatus)) {
    return false;
  }
  
  // Admins can do any valid transition
  if (userRole === 'ADMIN') return true;
  
  // Creators can only: DRAFT → REVIEW, REJECTED → DRAFT
  if (currentStatus === 'DRAFT' && newStatus === 'REVIEW') return true;
  if (currentStatus === 'REJECTED' && newStatus === 'DRAFT') return true;
  
  return false;
}
```

---

## Rate Limiting & Quotas

### Upload Rate Limits

**Per-User Limits:**
- **Concurrent Uploads:** Max 3 simultaneous uploads
- **Daily Uploads:** 100 files per day (Creator), Unlimited (Admin)
- **Storage Quota:** 10GB per Creator, 100GB per Brand

**Implementation:**

```typescript
// Track concurrent uploads client-side
let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 3;

export async function uploadWithRateLimit(file: File): Promise<void> {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    throw new Error('Maximum 3 concurrent uploads. Please wait for one to finish.');
  }
  
  activeUploads++;
  try {
    await performUpload(file);
  } finally {
    activeUploads--;
  }
}
```

---

### API Rate Limits

**Rate limits are enforced by Cloudflare:**
- **Authenticated requests:** 1000 requests per minute per user
- **Download URLs:** 100 requests per minute per user
- **List queries:** 60 requests per minute per user

**Headers to check:**

```typescript
// Check rate limit headers in response
const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
const rateLimitReset = response.headers.get('X-RateLimit-Reset');

if (rateLimitRemaining && parseInt(rateLimitRemaining) < 10) {
  toast.warning('Approaching rate limit. Please slow down.');
}
```

---

### Storage Quota Display

```typescript
function StorageQuotaDisplay({ userId }: { userId: string }) {
  const { data: usage } = trpc.users.getStorageUsage.useQuery({ userId });
  
  if (!usage) return null;
  
  const percentUsed = (usage.used / usage.quota) * 100;
  
  return (
    <div>
      <div className="text-sm text-gray-600">
        Storage: {formatBytes(usage.used)} / {formatBytes(usage.quota)}
      </div>
      <div className="h-2 bg-gray-200 rounded-full">
        <div 
          className={`h-2 rounded-full ${
            percentUsed > 90 ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percentUsed}%` }}
        />
      </div>
    </div>
  );
}
```

---

## File Upload Flow

### Complete Implementation

```typescript
// components/AssetUploader.tsx

import { useState } from 'react';
import { trpc } from '@/utils/trpc';
import { validateAssetFile, validateAssetMetadata } from '@/utils/validators';
import { getErrorMessage } from '@/utils/error-handler';

export function AssetUploader({ projectId }: { projectId?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Step 1: Initiate upload
  const initiateMutation = trpc.ipAssets.initiateUpload.useMutation();
  
  // Step 3: Confirm upload
  const confirmMutation = trpc.ipAssets.confirmUpload.useMutation({
    onSuccess: (asset) => {
      toast.success('Asset uploaded successfully!');
      setFile(null);
      setTitle('');
      setDescription('');
      // Navigate to asset page or trigger refresh
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file
    const validation = validateAssetFile(selectedFile);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, '')); // Remove extension
    setErrors([]);
  };

  const handleUpload = async () => {
    if (!file) return;

    // Validate metadata
    const metadataValidation = validateAssetMetadata({ title, description });
    if (!metadataValidation.valid) {
      setErrors(metadataValidation.errors);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Get signed URL
      setUploadProgress(10);
      const { uploadUrl, assetId } = await initiateMutation.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        projectId,
      });

      // Step 2: Upload to storage
      setUploadProgress(30);
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = 30 + (e.loaded / e.total) * 50; // 30-80%
          setUploadProgress(progress);
        }
      });

      await new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(null);
          } else {
            reject(new Error('Upload to storage failed'));
          }
        });
        xhr.addEventListener('error', reject);
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setUploadProgress(80);

      // Step 3: Confirm upload
      await confirmMutation.mutateAsync({
        assetId,
        title,
        description: description || undefined,
      });

      setUploadProgress(100);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* File Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Select File
        </label>
        <input
          type="file"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="block w-full text-sm"
        />
        {errors.length > 0 && (
          <div className="mt-2 text-sm text-red-600">
            {errors.map((error, i) => (
              <div key={i}>{error}</div>
            ))}
          </div>
        )}
      </div>

      {/* Title Input */}
      {file && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
            disabled={isUploading}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
      )}

      {/* Description Input */}
      {file && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            disabled={isUploading}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
      )}

      {/* Upload Button */}
      {file && (
        <button
          onClick={handleUpload}
          disabled={isUploading || !title}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      )}

      {/* Progress Bar */}
      {isUploading && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="text-sm text-gray-600 text-center">
            {uploadProgress < 30 && 'Preparing upload...'}
            {uploadProgress >= 30 && uploadProgress < 80 && 'Uploading file...'}
            {uploadProgress >= 80 && 'Finalizing...'}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Real-time Updates

### Polling Strategy

Poll for processing status until complete:

```typescript
function useAssetProcessingStatus(assetId: string) {
  return trpc.ipAssets.getMetadata.useQuery(
    {
      id: assetId,
      fields: ['processing'],
    },
    {
      refetchInterval: (data) => {
        // Stop polling if processing complete
        if (
          data?.processing?.thumbnailGenerated &&
          data?.processing?.metadataExtracted
        ) {
          return false;
        }
        // Poll every 3 seconds
        return 3000;
      },
      enabled: !!assetId,
    }
  );
}
```

---

### WebSocket Events (Future Enhancement)

**Not currently implemented**, but planned for real-time updates:

```typescript
// Future implementation
ws.on('asset.processing.thumbnail', (data) => {
  // Update UI when thumbnail is generated
});

ws.on('asset.processing.metadata', (data) => {
  // Update UI when metadata is extracted
});

ws.on('asset.processing.complete', (data) => {
  // Show completion notification
});
```

---

### Optimistic Updates

```typescript
const utils = trpc.useContext();

const updateMutation = trpc.ipAssets.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.ipAssets.getById.cancel({ id: newData.id });

    // Snapshot current value
    const previousAsset = utils.ipAssets.getById.getData({ id: newData.id });

    // Optimistically update cache
    utils.ipAssets.getById.setData(
      { id: newData.id },
      (old) => old ? { ...old, ...newData } : old
    );

    return { previousAsset };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    if (context?.previousAsset) {
      utils.ipAssets.getById.setData(
        { id: newData.id },
        context.previousAsset
      );
    }
  },
  onSettled: (data, error, variables) => {
    // Always refetch after mutation
    utils.ipAssets.getById.invalidate({ id: variables.id });
  },
});
```

---

**Continue to [Part 3: Frontend Implementation Checklist](./ASSET_PROCESSING_GUIDE_PART_3_IMPLEMENTATION.md)**
