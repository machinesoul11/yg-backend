# Media Management - Frontend Integration Guide 🌐 SHARED

> **Classification:** 🌐 **SHARED** - Used by both public-facing website and admin backend

## Overview

The Media Management module provides comprehensive file upload, storage, optimization, and organization capabilities for the YesGoddess platform. This module handles images, videos, audio files, and documents with automatic variant generation, CDN integration, and intelligent caching.

### Key Features
- ✅ Multi-format file upload (images, videos, audio, documents)
- ✅ Automatic image optimization (WebP, AVIF, multiple sizes)
- ✅ CDN integration with Cloudflare R2
- ✅ Thumbnail generation for all asset types
- ✅ Collection-based organization
- ✅ Advanced search and filtering
- ✅ Role-based access control
- ✅ Usage analytics and tracking

---

## 1. API Endpoints

All media endpoints use **tRPC** with the base path `/api/trpc/media`.

### Upload Operations

#### `media.uploadMedia`
**Method:** `POST` (mutation)  
**Auth:** Protected (requires login)  
**Purpose:** Upload a new media file

```typescript
// Request
{
  filename: string;
  mimeType: string;
  file: Buffer | string; // Buffer or base64 string
  title?: string;
  description?: string;
  tags?: string[];
  collectionId?: string;
  generateVariants?: boolean; // default: true
}

// Response
{
  success: boolean;
  mediaItem: {
    id: string;
    filename: string;
    originalName: string;
    storageKey: string;
    mimeType: string;
    fileSize: string; // BigInt as string
    width?: number;
    height?: number;
    type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
    title?: string;
    altText?: string;
    description?: string;
    tags: string[];
    cdnUrl?: string;
    thumbnailUrl?: string;
    previewUrl?: string;
    colorPalette?: Record<string, any>;
    averageColor?: string; // hex color
    dominantColor?: string; // hex color
    accessLevel: 'PUBLIC' | 'INTERNAL' | 'ADMIN_ONLY' | 'RESTRICTED';
    createdAt: string;
    updatedAt: string;
    uploader: {
      id: string;
      name: string;
      email: string;
    };
    variants: MediaVariant[];
    collections: Collection[];
  };
}
```

### Retrieval Operations

#### `media.getMediaItems`
**Method:** `GET` (query)  
**Auth:** Protected  
**Purpose:** Get paginated list of media items

```typescript
// Request
{
  page?: number; // default: 1
  limit?: number; // default: 50, max: 100
  search?: string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';
  tags?: string[];
}

// Response
{
  data: MediaItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}
```

#### `media.getMediaItem`
**Method:** `GET` (query)  
**Auth:** Protected  
**Purpose:** Get single media item by ID

```typescript
// Request
{ id: string; }

// Response - Single MediaItem object
```

#### `media.getMediaStats`
**Method:** `GET` (query)  
**Auth:** Protected  
**Purpose:** Get user's media statistics

```typescript
// Response
{
  totalItems: number;
  totalSize: string; // BigInt as string (bytes)
  typeBreakdown: Array<{
    type: MediaType;
    count: number;
    size: string; // BigInt as string (bytes)
  }>;
}
```

### Management Operations

#### `media.updateMediaItem`
**Method:** `PATCH` (mutation)  
**Auth:** Protected (owner or admin)  
**Purpose:** Update media metadata

```typescript
// Request
{
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
}

// Response
{
  success: boolean;
  mediaItem: MediaItem;
}
```

#### `media.deleteMediaItem`
**Method:** `DELETE` (mutation)  
**Auth:** Protected (owner or admin)  
**Purpose:** Soft delete media item

```typescript
// Request
{ id: string; }

// Response
{ success: boolean; }
```

### Collection Operations

#### `media.getCollections`
**Method:** `GET` (query)  
**Auth:** Protected  
**Purpose:** Get paginated collections

```typescript
// Request
{
  page?: number; // default: 1
  limit?: number; // default: 20, max: 100
}

// Response
{
  collections: Array<{
    id: string;
    name: string;
    description?: string;
    slug: string;
    itemCount: number;
    totalSize: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    creator: {
      id: string;
      name: string;
      email: string;
    };
    items: MediaItem[]; // First 5 items for preview
  }>;
  pagination: PaginationMeta;
}
```

#### `media.createCollection`
**Method:** `POST` (mutation)  
**Auth:** Protected  
**Purpose:** Create new media collection

```typescript
// Request
{
  name: string; // 1-100 chars
  description?: string; // max 500 chars
  mediaIds?: string[]; // optional initial media items
}

// Response
{
  success: boolean;
  collection: Collection;
}
```

#### `media.addToCollection`
**Method:** `POST` (mutation)  
**Auth:** Protected  
**Purpose:** Add media item to collection

```typescript
// Request
{
  mediaItemId: string;
  collectionId: string;
}

// Response
{ success: boolean; }
```

---

## 2. TypeScript Type Definitions

```typescript
// Core Types
export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';

export type MediaStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type MediaAccessLevel = 'PUBLIC' | 'INTERNAL' | 'ADMIN_ONLY' | 'RESTRICTED';

// Main Interfaces
export interface MediaItem {
  id: string;
  filename: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  fileSize: string; // BigInt serialized as string
  width?: number;
  height?: number;
  type: MediaType;
  status: MediaStatus;
  uploadedBy: string;
  title?: string;
  altText?: string;
  description?: string;
  tags: string[];
  metadata: Record<string, any>;
  cdnUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  exifData?: Record<string, any>;
  colorPalette?: {
    vibrant?: string;
    darkVibrant?: string;
    lightVibrant?: string;
    muted?: string;
    darkMuted?: string;
    lightMuted?: string;
  };
  averageColor?: string; // hex format
  dominantColor?: string; // hex format
  isPublic: boolean;
  accessLevel: MediaAccessLevel;
  usageRights?: string;
  licenseInfo?: string;
  copyrightInfo?: string;
  lastAccessedAt?: string;
  accessCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // Relations
  uploader: UserBasic;
  variants: MediaVariant[];
  collections: CollectionBasic[];
}

export interface MediaVariant {
  id: string;
  originalMediaId: string;
  variantType: 'THUMBNAIL' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'WEBP' | 'AVIF';
  filename: string;
  storageKey: string;
  mimeType: string;
  fileSize: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
  cdnUrl?: string;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  slug: string;
  itemCount: number;
  totalSize: string;
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creator: UserBasic;
  items?: MediaItem[];
}

export interface UserBasic {
  id: string;
  name: string | null;
  email: string;
}

// Request/Response Types
export interface MediaUploadRequest {
  filename: string;
  mimeType: string;
  file: Buffer | string;
  title?: string;
  description?: string;
  tags?: string[];
  collectionId?: string;
  generateVariants?: boolean;
}

export interface MediaListRequest {
  page?: number;
  limit?: number;
  search?: string;
  type?: MediaType;
  tags?: string[];
}

export interface MediaListResponse {
  data: MediaItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

// Constants
export const MEDIA_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 50,
  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 1000,
  SUPPORTED_MIME_TYPES: [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'audio/mpeg', 'audio/wav'
  ] as const,
} as const;
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

export const MediaUploadSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .regex(/^[a-zA-Z0-9._\-\s]+$/, 'Invalid filename characters'),
  mimeType: z.string()
    .refine(mime => MEDIA_CONSTANTS.SUPPORTED_MIME_TYPES.includes(mime as any)),
  file: z.union([z.string(), z.instanceof(Buffer)]),
  title: z.string().max(500).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  collectionId: z.string().cuid().optional(),
  generateVariants: z.boolean().optional()
});

export const MediaListSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(1).optional(),
  type: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER']).optional(),
  tags: z.array(z.string()).optional()
});
```

---

## 3. Business Logic & Validation Rules

### File Upload Rules

#### File Size Limits
- **Maximum size:** 100MB per file
- **Images:** Recommended max 20MB for optimal processing
- **Videos:** 100MB limit (larger files should use direct upload)
- **Documents:** 50MB recommended

#### Supported File Types
```typescript
const SUPPORTED_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  videos: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav'],
  documents: ['application/pdf']
};
```

#### Filename Validation
- Only alphanumeric, dots, hyphens, underscores, and spaces
- Maximum 255 characters
- Must have valid file extension

#### Metadata Rules
- **Title:** Required, 1-500 characters
- **Description:** Optional, max 1000 characters
- **Tags:** Max 10 tags, each max 50 characters
- **Alt text:** Optional for images, max 500 characters

### Access Control Rules

#### User Role Permissions

| Role | Upload | View Own | View All | Edit Own | Edit All | Delete Own | Delete All |
|------|--------|----------|----------|----------|----------|------------|------------|
| **VIEWER** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CREATOR** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **BRAND** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### Access Level Rules

| Access Level | Public Website | Admin Interface | API Access | CDN Cache |
|-------------|---------------|-----------------|-------------|-----------|
| **PUBLIC** | ✅ | ✅ | ✅ | Long-term |
| **INTERNAL** | ❌ | ✅ | ✅ Auth | Medium-term |
| **ADMIN_ONLY** | ❌ | ✅ Admin | ✅ Admin | Short-term |
| **RESTRICTED** | ❌ | ✅ Owner | ✅ Owner | No cache |

### Processing Rules

#### Automatic Variant Generation
- **Thumbnails:** Small (200x200), Medium (400x400), Large (800x800)
- **Modern formats:** WebP variants for supported browsers
- **Quality optimization:** Progressive JPEG, optimized WebP
- **Processing time:** 2-10 seconds depending on file size

#### Color Extraction (Images Only)
- **Average color:** Single dominant hex color
- **Color palette:** 6-color palette (vibrant, muted variants)
- **Dominant color:** Primary color for theming

---

## 4. Error Handling

### Error Codes and HTTP Status Codes

| Error Code | HTTP Status | Description | User Message |
|------------|-------------|-------------|--------------|
| `MEDIA_NOT_FOUND` | 404 | Media item doesn't exist | "File not found" |
| `MEDIA_ACCESS_DENIED` | 403 | Insufficient permissions | "Access denied to this file" |
| `MEDIA_UPLOAD_FAILED` | 400 | Upload process failed | "Upload failed. Please try again." |
| `MEDIA_FILE_TOO_LARGE` | 413 | File exceeds size limit | "File too large. Max size: 100MB" |
| `MEDIA_INVALID_FILE_TYPE` | 415 | Unsupported file format | "Unsupported file type" |
| `MEDIA_DUPLICATE` | 409 | Filename already exists | "A file with this name already exists" |
| `MEDIA_PROCESSING_ERROR` | 500 | Processing pipeline failed | "File processing failed" |
| `MEDIA_IN_USE` | 409 | File is referenced elsewhere | "Cannot delete: file is in use" |
| `COLLECTION_NOT_FOUND` | 404 | Collection doesn't exist | "Collection not found" |

### Error Response Format

```typescript
interface MediaErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, any>;
  };
}

// Example responses
{
  "success": false,
  "error": {
    "code": "MEDIA_FILE_TOO_LARGE",
    "message": "File size 105MB exceeds maximum allowed size of 100MB",
    "statusCode": 413,
    "details": {
      "fileSize": 110100480,
      "maxSize": 104857600
    }
  }
}
```

### Client Error Handling Strategy

```typescript
// React Query error handling example
const uploadMutation = useMutation({
  mutationFn: (data: MediaUploadRequest) => mediaApi.uploadMedia(data),
  onError: (error: TRPCError) => {
    switch (error.data?.code) {
      case 'MEDIA_FILE_TOO_LARGE':
        showError('File is too large. Please choose a smaller file.');
        break;
      case 'MEDIA_INVALID_FILE_TYPE':
        showError('This file type is not supported.');
        break;
      case 'MEDIA_ACCESS_DENIED':
        showError('You don\'t have permission to upload files.');
        break;
      default:
        showError('Upload failed. Please try again.');
    }
  }
});
```

---

## 5. Authorization & Permissions

### Authentication Requirements
- **All endpoints require authentication** via NextAuth session
- **JWT tokens** must be valid and non-expired
- **User must be active** (`isActive: true`)

### Resource Ownership Rules

#### Media Items
- **Creators can:** Upload, view own files, edit own files, delete own files
- **Brands can:** Same as creators + view other brands' internal files
- **Admins can:** Full access to all media items
- **Viewers can:** Only view files they've uploaded (if any)

#### Collections
- **Owner-based access:** Creator can modify their collections
- **Shared collections:** Multiple users can contribute (future feature)
- **Admin override:** Admins can modify any collection

### Field-Level Permissions

| Field | All Users | Owner | Admin |
|-------|-----------|-------|-------|
| `title` | Read | Read/Write | Read/Write |
| `description` | Read | Read/Write | Read/Write |
| `tags` | Read | Read/Write | Read/Write |
| `accessLevel` | - | - | Read/Write |
| `usageRights` | - | - | Read/Write |
| `isPublic` | - | - | Read/Write |

---

## 6. Rate Limiting & Quotas

### Rate Limits

| Operation | Rate Limit | Window | Status Code |
|-----------|------------|--------|-------------|
| File Upload | 50 uploads | 1 hour | 429 |
| Metadata Updates | 100 requests | 15 minutes | 429 |
| List Operations | 300 requests | 15 minutes | 429 |
| Collection Operations | 50 requests | 15 minutes | 429 |

### Rate Limit Headers

```http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 23
X-RateLimit-Reset: 1645123456
X-RateLimit-RetryAfter: 3600
```

### Storage Quotas (Future Implementation)

| User Role | Storage Quota | File Count Limit |
|-----------|---------------|------------------|
| **VIEWER** | 1GB | 100 files |
| **CREATOR** | 10GB | 1,000 files |
| **BRAND** | 50GB | 5,000 files |
| **ADMIN** | Unlimited | Unlimited |

---

## 7. File Uploads

### Direct Upload Flow

The media system supports direct file uploads to tRPC endpoints:

```typescript
// 1. Prepare file data
const fileBuffer = await file.arrayBuffer();
const uploadData = {
  filename: file.name,
  mimeType: file.type,
  file: Buffer.from(fileBuffer),
  title: 'My Image',
  tags: ['marketing', 'social-media']
};

// 2. Upload via tRPC
const result = await trpc.media.uploadMedia.mutate(uploadData);

// 3. Handle response
if (result.success) {
  console.log('Upload successful:', result.mediaItem);
  // File is now processing in background
}
```

### Base64 Upload Alternative

```typescript
// Convert file to base64
const base64File = await new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(file);
});

const uploadData = {
  filename: file.name,
  mimeType: file.type,
  file: base64File, // Base64 string with data: prefix
  title: 'My Document'
};
```

### File Type Validation

```typescript
const SUPPORTED_TYPES = {
  'image/jpeg': { maxSize: 20 * 1024 * 1024, hasVariants: true },
  'image/png': { maxSize: 20 * 1024 * 1024, hasVariants: true },
  'image/webp': { maxSize: 20 * 1024 * 1024, hasVariants: true },
  'video/mp4': { maxSize: 100 * 1024 * 1024, hasVariants: false },
  'application/pdf': { maxSize: 50 * 1024 * 1024, hasVariants: false }
};

function validateFile(file: File): ValidationResult {
  const typeConfig = SUPPORTED_TYPES[file.type];
  
  if (!typeConfig) {
    return { valid: false, error: 'Unsupported file type' };
  }
  
  if (file.size > typeConfig.maxSize) {
    return { valid: false, error: 'File too large' };
  }
  
  return { valid: true };
}
```

### Upload Progress Tracking

```typescript
// Note: Direct tRPC uploads don't support progress callbacks
// For large files, consider chunked upload implementation

const uploadWithProgress = async (file: File, onProgress?: (progress: number) => void) => {
  // Convert to buffer with progress simulation
  const buffer = Buffer.from(await file.arrayBuffer());
  
  // Simulate progress for UX
  if (onProgress) {
    onProgress(25); // File reading complete
  }
  
  const result = await trpc.media.uploadMedia.mutate({
    filename: file.name,
    mimeType: file.type,
    file: buffer
  });
  
  if (onProgress) {
    onProgress(100); // Upload complete
  }
  
  return result;
};
```

---

## 8. Real-time Updates

### WebSocket Events (Future Feature)

The media system will support real-time updates via WebSocket events:

```typescript
// Event types that will be emitted
interface MediaWebSocketEvents {
  'media:upload:started': { mediaId: string; filename: string };
  'media:upload:completed': { mediaId: string; status: MediaStatus };
  'media:processing:started': { mediaId: string; stage: string };
  'media:processing:completed': { mediaId: string; variants: string[] };
  'media:processing:failed': { mediaId: string; error: string };
}

// Client subscription example
const socket = io('/media');

socket.on('media:processing:completed', (data) => {
  // Update UI with generated variants
  queryClient.invalidateQueries(['media', data.mediaId]);
});
```

### Polling Recommendations

Until WebSocket support is implemented, use polling for processing status:

```typescript
const useMediaProcessingStatus = (mediaId: string) => {
  return useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => trpc.media.getMediaItem.query({ id: mediaId }),
    refetchInterval: (data) => {
      // Poll every 2 seconds while processing
      return data?.status === 'PROCESSING' ? 2000 : false;
    },
    enabled: !!mediaId
  });
};
```

---

## 9. Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
interface PaginationRequest {
  page: number;     // 1-based page number
  limit: number;    // Items per page (1-100)
}

interface PaginationResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
```

### Available Filters

```typescript
interface MediaFilters {
  search?: string;           // Full-text search in title, description, tags
  type?: MediaType;         // Filter by media type
  tags?: string[];          // Must have ALL specified tags
  accessLevel?: MediaAccessLevel; // Admin-only filter
  status?: MediaStatus;     // Processing status filter
  uploadedBy?: string;      // Admin-only: filter by uploader
  createdAfter?: Date;      // Files created after date
  createdBefore?: Date;     // Files created before date
}
```

### Sorting Options

```typescript
interface MediaSorting {
  sortBy: 'createdAt' | 'updatedAt' | 'title' | 'downloadCount' | 'fileSize' | 'accessCount';
  sortOrder: 'asc' | 'desc';
}

// Default sort: createdAt desc (newest first)
```

### Search Implementation

```typescript
const useMediaSearch = () => {
  const [filters, setFilters] = useState<MediaFilters>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });

  const { data, isLoading } = useQuery({
    queryKey: ['media', 'list', filters, pagination],
    queryFn: () => trpc.media.getMediaItems.query({
      ...pagination,
      ...filters
    })
  });

  const search = (newFilters: Partial<MediaFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  return { data, isLoading, search, filters };
};
```

---

## 10. Frontend Implementation Checklist

### 🔧 Setup Tasks

- [ ] **Install Dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  ```

- [ ] **Configure tRPC Client**
  ```typescript
  // utils/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '../../../backend/src/app';
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **Setup React Query Provider**
  ```typescript
  // app/layout.tsx or pages/_app.tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { trpc } from '../utils/trpc';
  
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({
    links: [
      httpBatchLink({ url: '/api/trpc' })
    ]
  });
  
  export default function App({ Component, pageProps }) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Component {...pageProps} />
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  ```

### 📤 File Upload Implementation

- [ ] **Create File Upload Hook**
  ```typescript
  const useFileUpload = () => {
    const uploadMutation = trpc.media.uploadMedia.useMutation();
    
    const uploadFile = async (file: File, metadata?: Partial<MediaUploadRequest>) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      return uploadMutation.mutateAsync({
        filename: file.name,
        mimeType: file.type,
        file: buffer,
        ...metadata
      });
    };
    
    return { uploadFile, isUploading: uploadMutation.isLoading };
  };
  ```

- [ ] **Build File Drop Zone Component**
  ```typescript
  const FileUploadZone = ({ onUpload }: { onUpload: (files: File[]) => void }) => {
    const [dragActive, setDragActive] = useState(false);
    
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      onUpload(files);
    };
    
    return (
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          onChange={(e) => e.target.files && onUpload(Array.from(e.target.files))}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          Drop files here or click to browse
        </label>
      </div>
    );
  };
  ```

- [ ] **Implement File Validation**
  ```typescript
  const validateFiles = (files: File[]): ValidationResult[] => {
    return files.map(file => {
      if (file.size > MEDIA_CONSTANTS.MAX_FILE_SIZE) {
        return { valid: false, error: 'File too large', file };
      }
      
      if (!MEDIA_CONSTANTS.SUPPORTED_MIME_TYPES.includes(file.type as any)) {
        return { valid: false, error: 'Unsupported file type', file };
      }
      
      return { valid: true, file };
    });
  };
  ```

### 📋 Media Library Implementation

- [ ] **Create Media Grid Component**
  ```typescript
  const MediaGrid = () => {
    const [filters, setFilters] = useState<MediaFilters>({});
    const { data, isLoading } = trpc.media.getMediaItems.useQuery(filters);
    
    if (isLoading) return <LoadingSpinner />;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {data?.data.map(item => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>
    );
  };
  ```

- [ ] **Build Media Card Component**
  ```typescript
  const MediaCard = ({ item }: { item: MediaItem }) => {
    const deleteMutation = trpc.media.deleteMediaItem.useMutation();
    
    return (
      <div className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
        <div className="aspect-square bg-gray-200 relative">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={item.altText || item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <FileIcon className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-medium truncate">{item.title || item.filename}</h3>
          <p className="text-sm text-gray-500">{formatFileSize(item.fileSize)}</p>
          <div className="flex gap-1 mt-2">
            {item.tags.map(tag => (
              <span key={tag} className="px-2 py-1 bg-gray-100 text-xs rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };
  ```

- [ ] **Implement Search & Filtering**
  ```typescript
  const MediaFilters = ({ onFilter }: { onFilter: (filters: MediaFilters) => void }) => {
    const [search, setSearch] = useState('');
    const [type, setType] = useState<MediaType | undefined>();
    
    useEffect(() => {
      const timeoutId = setTimeout(() => {
        onFilter({ search: search || undefined, type });
      }, 300); // Debounce search
      
      return () => clearTimeout(timeoutId);
    }, [search, type, onFilter]);
    
    return (
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search media..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg"
        />
        <select
          value={type || ''}
          onChange={(e) => setType(e.target.value as MediaType || undefined)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
          <option value="DOCUMENT">Documents</option>
          <option value="AUDIO">Audio</option>
        </select>
      </div>
    );
  };
  ```

### 🎯 Error Handling

- [ ] **Global Error Handler**
  ```typescript
  const MediaErrorBoundary = ({ children }: { children: React.ReactNode }) => {
    return (
      <ErrorBoundary
        fallback={<div>Something went wrong with media operations</div>}
        onError={(error) => console.error('Media Error:', error)}
      >
        {children}
      </ErrorBoundary>
    );
  };
  ```

- [ ] **Upload Error States**
  ```typescript
  const UploadStatus = ({ uploadState }: { uploadState: UploadState }) => {
    switch (uploadState.status) {
      case 'uploading':
        return <ProgressBar progress={uploadState.progress} />;
      case 'processing':
        return <Spinner>Processing file...</Spinner>;
      case 'error':
        return <ErrorAlert>{uploadState.error}</ErrorAlert>;
      case 'success':
        return <SuccessAlert>Upload completed!</SuccessAlert>;
    }
  };
  ```

### 🔍 Edge Cases to Handle

- [ ] **Large File Handling**
  - Show progress indicators
  - Prevent navigation during upload
  - Handle network interruptions

- [ ] **Offline Support**
  - Queue uploads when offline
  - Retry failed uploads automatically

- [ ] **Mobile Considerations**
  - Camera/gallery access
  - Touch-friendly file selection
  - Responsive image grid

- [ ] **Performance Optimization**
  - Image lazy loading
  - Virtual scrolling for large lists
  - Thumbnail preloading

- [ ] **Accessibility**
  - Keyboard navigation
  - Screen reader support
  - Alt text management
  - Color contrast compliance

### 🎨 UX Considerations

- [ ] **Loading States**
  - Skeleton loading for media grids
  - Upload progress indicators
  - Processing status feedback

- [ ] **Empty States**
  - No media uploaded yet
  - No search results
  - Collection is empty

- [ ] **Bulk Operations**
  - Multi-select media items
  - Bulk delete/move to collection
  - Batch tag editing

- [ ] **Preview & Lightbox**
  - Full-screen image preview
  - Image zoom functionality
  - Navigation between items

---

## 🚨 Important Notes

### Security Considerations
- **Never expose storage keys** in client-side code
- **Validate file types** on both client and server
- **Sanitize filenames** to prevent path traversal
- **Use signed URLs** for temporary access

### Performance Tips
- **Optimize images** before upload when possible
- **Use lazy loading** for media grids
- **Implement virtual scrolling** for large collections
- **Cache API responses** appropriately

### Monitoring & Analytics
- **Track upload success/failure rates**
- **Monitor processing times**
- **Measure user engagement with media**
- **Alert on storage quota approaching limits**

---

This integration guide provides everything needed to implement the Media Management module in your frontend. The module is production-ready and follows YesGoddess platform conventions for authentication, error handling, and API design.
