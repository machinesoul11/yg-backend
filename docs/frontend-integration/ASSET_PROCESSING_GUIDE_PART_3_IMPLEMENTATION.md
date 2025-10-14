# Asset Processing - Frontend Integration Guide
## Part 3: Implementation Checklist & React Components

**Classification:** ⚡ HYBRID  
**Module:** Asset Processing  
**Last Updated:** October 13, 2025  
**Version:** 2.0

> **Prerequisite:** Read [Part 1: API Endpoints](./ASSET_PROCESSING_GUIDE_PART_1_API_ENDPOINTS.md) and [Part 2: Business Logic](./ASSET_PROCESSING_GUIDE_PART_2_BUSINESS_LOGIC.md) first.

---

## Table of Contents

1. [Frontend Implementation Checklist](#frontend-implementation-checklist)
2. [Pagination & Filtering](#pagination--filtering)
3. [React Query Integration](#react-query-integration)
4. [Complete Component Examples](#complete-component-examples)
5. [UI/UX Considerations](#uiux-considerations)
6. [Edge Cases to Handle](#edge-cases-to-handle)
7. [Testing Recommendations](#testing-recommendations)

---

## Frontend Implementation Checklist

### Phase 1: Core Infrastructure ✅

- [ ] **Setup tRPC Client**
  - [ ] Install `@trpc/client` and `@trpc/react-query`
  - [ ] Configure tRPC provider with backend URL
  - [ ] Add JWT authentication to tRPC context

- [ ] **Type Definitions**
  - [ ] Copy type definitions from Part 1 to `@/types/assets.ts`
  - [ ] Export all enums, interfaces, and constants

- [ ] **Utilities**
  - [ ] Create `utils/validators.ts` with client-side validation
  - [ ] Create `utils/error-handler.ts` with error parsing
  - [ ] Create `utils/permissions.ts` with RBAC helpers
  - [ ] Create `utils/formatters.ts` for file sizes, dates, etc.

---

### Phase 2: Asset Upload 🚀

- [ ] **File Selection Component**
  - [ ] File input with drag-and-drop
  - [ ] Client-side validation (size, type, name)
  - [ ] File preview before upload
  - [ ] Multiple file support (optional)

- [ ] **Upload Flow**
  - [ ] Initiate upload (get signed URL)
  - [ ] Direct upload to Cloudflare R2 with progress tracking
  - [ ] Confirm upload with metadata
  - [ ] Error handling and retry logic

- [ ] **Upload UI**
  - [ ] Progress bar with percentage
  - [ ] Cancel upload button
  - [ ] Upload queue for multiple files
  - [ ] Success/error notifications

---

### Phase 3: Asset Display 🖼️

- [ ] **Asset List View**
  - [ ] Grid/list toggle
  - [ ] Thumbnail display with loading states
  - [ ] Filter controls (type, status, project)
  - [ ] Search functionality
  - [ ] Pagination controls
  - [ ] Sort options

- [ ] **Asset Card Component**
  - [ ] Thumbnail with fallback
  - [ ] Title and description
  - [ ] Status badge
  - [ ] Processing indicator
  - [ ] Action menu (edit, delete, download)
  - [ ] File size and type indicators

- [ ] **Asset Detail Page**
  - [ ] Full-size preview
  - [ ] Complete metadata display
  - [ ] Technical details (resolution, duration, etc.)
  - [ ] Processing status timeline
  - [ ] Edit metadata form
  - [ ] Download original button
  - [ ] Regenerate preview option

---

### Phase 4: Asset Management 🔧

- [ ] **Status Management**
  - [ ] Status dropdown with valid transitions only
  - [ ] Transition confirmation dialogs
  - [ ] Admin-only status changes
  - [ ] Status change history (optional)

- [ ] **Metadata Editing**
  - [ ] Edit title and description inline
  - [ ] Custom metadata editor (JSON)
  - [ ] Save and cancel buttons
  - [ ] Validation before save
  - [ ] Optimistic updates

- [ ] **Asset Deletion**
  - [ ] Delete confirmation dialog
  - [ ] Warning about active licenses
  - [ ] Admin override for force delete
  - [ ] Soft delete indicator

---

### Phase 5: Advanced Features 🎨

- [ ] **Preview Generation**
  - [ ] Display video/audio previews
  - [ ] Waveform visualization for audio
  - [ ] Multiple thumbnail sizes
  - [ ] Regenerate preview button

- [ ] **Variants Display**
  - [ ] Show all available thumbnails
  - [ ] Format conversion results
  - [ ] Responsive image sizes

- [ ] **Derivatives Management**
  - [ ] List derivative assets
  - [ ] Create derivative (crop, edit)
  - [ ] Show lineage tree
  - [ ] Ownership inheritance

- [ ] **Ownership Management**
  - [ ] Display ownership shares
  - [ ] Add co-owner form
  - [ ] Validate total shares = 100%
  - [ ] Visual ownership pie chart

- [ ] **Licensing Integration**
  - [ ] Display active licenses
  - [ ] Filter by license status
  - [ ] Warning when deleting licensed assets

---

### Phase 6: Polish & Optimization 💎

- [ ] **Performance**
  - [ ] Lazy load images
  - [ ] Virtual scrolling for long lists
  - [ ] Debounce search inputs
  - [ ] Cache preview URLs
  - [ ] Prefetch next page

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] ARIA labels
  - [ ] Focus management
  - [ ] Screen reader support

- [ ] **Error Handling**
  - [ ] Retry failed uploads
  - [ ] Graceful degradation for missing thumbnails
  - [ ] Network error handling
  - [ ] Rate limit warnings

---

## Pagination & Filtering

### Pagination Component

```typescript
// components/Pagination.tsx

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  
  // Show max 7 page numbers
  const visiblePages = pages.filter(page => {
    if (totalPages <= 7) return true;
    if (page === 1 || page === totalPages) return true;
    if (Math.abs(page - currentPage) <= 2) return true;
    return false;
  });

  return (
    <nav className="flex items-center justify-between border-t px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Previous
        </button>
        
        {visiblePages.map((page, i) => {
          const prevPage = visiblePages[i - 1];
          const showEllipsis = prevPage && page - prevPage > 1;
          
          return (
            <div key={page} className="flex items-center">
              {showEllipsis && <span className="px-2">...</span>}
              <button
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 border rounded ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            </div>
          );
        })}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
      
      <div className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </div>
    </nav>
  );
}
```

---

### Filtering Component

```typescript
// components/AssetFilters.tsx

interface AssetFiltersProps {
  filters: ListAssetsInput['filters'];
  onFilterChange: (filters: ListAssetsInput['filters']) => void;
}

export function AssetFilters({ filters, onFilterChange }: AssetFiltersProps) {
  const updateFilter = (key: string, value: any) => {
    onFilterChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
      {/* Search */}
      <div>
        <label className="block text-sm font-medium mb-1">Search</label>
        <input
          type="text"
          value={filters?.search || ''}
          onChange={(e) => updateFilter('search', e.target.value)}
          placeholder="Search assets..."
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      {/* Type Filter */}
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={filters?.type || ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="">All Types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
          <option value="AUDIO">Audio</option>
          <option value="DOCUMENT">Documents</option>
          <option value="THREE_D">3D Models</option>
        </select>
      </div>

      {/* Status Filter */}
      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select
          value={filters?.status || ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="REVIEW">In Review</option>
          <option value="APPROVED">Approved</option>
          <option value="PUBLISHED">Published</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Date Range */}
      <div>
        <label className="block text-sm font-medium mb-1">From Date</label>
        <input
          type="date"
          value={filters?.fromDate?.split('T')[0] || ''}
          onChange={(e) => updateFilter('fromDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      {/* Clear Filters */}
      {Object.keys(filters || {}).length > 0 && (
        <div className="flex items-end">
          <button
            onClick={() => onFilterChange({})}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## React Query Integration

### Custom Hooks

```typescript
// hooks/use-assets.ts

import { trpc } from '@/utils/trpc';
import { useState } from 'react';
import type { ListAssetsInput } from '@/types/assets';

export function useAssetList(initialFilters?: ListAssetsInput['filters']) {
  const [filters, setFilters] = useState(initialFilters || {});
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy, setSortBy] = useState<'createdAt' | 'updatedAt' | 'title'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = trpc.ipAssets.list.useQuery({
    filters,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });

  return {
    ...query,
    filters,
    setFilters,
    page,
    setPage,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
  };
}

export function useAssetById(id: string) {
  return trpc.ipAssets.getById.useQuery(
    { id },
    { enabled: !!id }
  );
}

export function useAssetMetadata(id: string, fields?: MetadataField[]) {
  return trpc.ipAssets.getMetadata.useQuery(
    { id, fields },
    { enabled: !!id }
  );
}

export function useAssetPreview(id: string, size?: 'small' | 'medium' | 'large') {
  return trpc.ipAssets.getPreview.useQuery(
    { id, size },
    { enabled: !!id }
  );
}

export function useAssetVariants(id: string, type?: VariantType) {
  return trpc.ipAssets.getVariants.useQuery(
    { id, type },
    { enabled: !!id }
  );
}
```

---

### Mutation Hooks

```typescript
// hooks/use-asset-mutations.ts

import { trpc } from '@/utils/trpc';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/error-handler';

export function useUpdateAsset() {
  const utils = trpc.useContext();

  return trpc.ipAssets.update.useMutation({
    onSuccess: (data) => {
      toast.success('Asset updated successfully');
      utils.ipAssets.getById.invalidate({ id: data.id });
      utils.ipAssets.list.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useUpdateAssetStatus() {
  const utils = trpc.useContext();

  return trpc.ipAssets.updateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Status changed to ${data.status}`);
      utils.ipAssets.getById.invalidate({ id: data.id });
      utils.ipAssets.list.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useDeleteAsset() {
  const utils = trpc.useContext();

  return trpc.ipAssets.delete.useMutation({
    onSuccess: () => {
      toast.success('Asset deleted successfully');
      utils.ipAssets.list.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useRegeneratePreview() {
  const utils = trpc.useContext();

  return trpc.ipAssets.regeneratePreview.useMutation({
    onSuccess: (data, variables) => {
      toast.success('Regeneration queued');
      // Start polling metadata
      utils.ipAssets.getMetadata.invalidate({ id: variables.id });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}
```

---

## Complete Component Examples

### Asset List Page

```typescript
// pages/assets/index.tsx

import { useState } from 'react';
import { useAssetList } from '@/hooks/use-assets';
import { AssetFilters } from '@/components/AssetFilters';
import { AssetCard } from '@/components/AssetCard';
import { Pagination } from '@/components/Pagination';
import { AssetUploader } from '@/components/AssetUploader';

export default function AssetsPage() {
  const [showUploader, setShowUploader] = useState(false);
  const {
    data,
    isLoading,
    filters,
    setFilters,
    page,
    setPage,
  } = useAssetList();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Assets</h1>
        <button
          onClick={() => setShowUploader(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Upload Asset
        </button>
      </div>

      {/* Uploader Modal */}
      {showUploader && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Upload Asset</h2>
              <button
                onClick={() => setShowUploader(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <AssetUploader onSuccess={() => setShowUploader(false)} />
          </div>
        </div>
      )}

      {/* Filters */}
      <AssetFilters filters={filters} onFilterChange={setFilters} />

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && data?.items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">No assets found</p>
          <button
            onClick={() => setShowUploader(true)}
            className="text-blue-600 hover:underline"
          >
            Upload your first asset
          </button>
        </div>
      )}

      {/* Asset Grid */}
      {!isLoading && data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            {data.items.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
```

---

### Asset Card Component

```typescript
// components/AssetCard.tsx

import Link from 'next/link';
import { useState } from 'react';
import { useAssetPreview } from '@/hooks/use-assets';
import { useDeleteAsset } from '@/hooks/use-asset-mutations';
import { getAssetIcon, getAssetColor } from '@/utils/validators';
import { canDeleteAsset } from '@/utils/permissions';
import { useSession } from 'next-auth/react';

interface AssetCardProps {
  asset: IpAssetResponse;
}

export function AssetCard({ asset }: AssetCardProps) {
  const { data: session } = useSession();
  const { data: preview } = useAssetPreview(asset.id, 'medium');
  const deleteMutation = useDeleteAsset();
  const [showMenu, setShowMenu] = useState(false);

  const canDelete = session?.user && canDeleteAsset(
    asset,
    session.user.id,
    session.user.role
  );

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this asset?')) {
      deleteMutation.mutate({ id: asset.id });
    }
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden hover:shadow-lg transition group">
      {/* Thumbnail */}
      <Link href={`/assets/${asset.id}`}>
        <div className="aspect-square bg-gray-100 relative">
          {preview?.url ? (
            <img
              src={preview.url}
              alt={asset.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-6xl">
              {getAssetIcon(asset.type)}
            </div>
          )}
          
          {/* Processing Indicator */}
          {asset.scanStatus === 'PENDING' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-white text-sm">Processing...</div>
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link href={`/assets/${asset.id}`}>
            <h3 className="font-medium line-clamp-1 hover:text-blue-600">
              {asset.title}
            </h3>
          </Link>
          
          {/* Action Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              ⋮
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 bg-white border rounded shadow-lg z-10">
                <Link
                  href={`/assets/${asset.id}/edit`}
                  className="block px-4 py-2 hover:bg-gray-100"
                >
                  Edit
                </Link>
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className={`px-2 py-1 rounded text-xs bg-${getAssetColor(asset.type)}-100`}>
            {asset.type}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            asset.status === 'PUBLISHED' ? 'bg-green-100' :
            asset.status === 'REJECTED' ? 'bg-red-100' :
            'bg-gray-100'
          }`}>
            {asset.status}
          </span>
        </div>

        {/* Description */}
        {asset.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mt-2">
            {asset.description}
          </p>
        )}
      </div>
    </div>
  );
}
```

---

### Asset Detail Page

```typescript
// pages/assets/[id].tsx

import { useRouter } from 'next/router';
import { useAssetById, useAssetMetadata, useAssetVariants } from '@/hooks/use-assets';
import { useUpdateAssetStatus, useRegeneratePreview } from '@/hooks/use-asset-mutations';
import { getValidStatusTransitions } from '@/utils/validators';
import { formatBytes } from '@/utils/formatters';

export default function AssetDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const { data: asset, isLoading } = useAssetById(id);
  const { data: metadata } = useAssetMetadata(id, ['technical', 'processing']);
  const { data: variants } = useAssetVariants(id);
  
  const updateStatusMutation = useUpdateAssetStatus();
  const regenerateMutation = useRegeneratePreview();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!asset) {
    return <div>Asset not found</div>;
  }

  const validStatuses = getValidStatusTransitions(asset.status);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{asset.title}</h1>
        <select
          value={asset.status}
          onChange={(e) => updateStatusMutation.mutate({
            id: asset.id,
            status: e.target.value as AssetStatus,
          })}
          className="px-3 py-2 border rounded"
        >
          <option value={asset.status}>{asset.status}</option>
          {validStatuses.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Preview */}
        <div>
          <div className="bg-gray-100 rounded-lg aspect-square flex items-center justify-center">
            {variants?.thumbnails.large?.url ? (
              <img
                src={variants.thumbnails.large.url}
                alt={asset.title}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-6xl">{getAssetIcon(asset.type)}</div>
            )}
          </div>

          {/* Variants */}
          {variants && (
            <div className="mt-4 space-y-2">
              <h3 className="font-medium">Available Sizes</h3>
              <div className="flex gap-2">
                {variants.thumbnails.small && (
                  <a
                    href={variants.thumbnails.small.url}
                    target="_blank"
                    className="px-3 py-1 bg-gray-100 rounded text-sm"
                  >
                    Small (200px)
                  </a>
                )}
                {variants.thumbnails.medium && (
                  <a
                    href={variants.thumbnails.medium.url}
                    target="_blank"
                    className="px-3 py-1 bg-gray-100 rounded text-sm"
                  >
                    Medium (400px)
                  </a>
                )}
                {variants.thumbnails.large && (
                  <a
                    href={variants.thumbnails.large.url}
                    target="_blank"
                    className="px-3 py-1 bg-gray-100 rounded text-sm"
                  >
                    Large (800px)
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 space-x-2">
            <button
              onClick={() => regenerateMutation.mutate({ id: asset.id })}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              Regenerate Preview
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-xl font-bold mb-4">Details</h2>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-gray-600">Type:</dt>
                <dd className="font-medium">{asset.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Size:</dt>
                <dd className="font-medium">{formatBytes(asset.fileSize)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Format:</dt>
                <dd className="font-medium">{asset.mimeType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Version:</dt>
                <dd className="font-medium">{asset.version}</dd>
              </div>
            </dl>
          </div>

          {/* Technical Metadata */}
          {metadata?.technical && (
            <div>
              <h2 className="text-xl font-bold mb-4">Technical Details</h2>
              <dl className="space-y-2">
                {metadata.technical.width && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Dimensions:</dt>
                    <dd className="font-medium">
                      {metadata.technical.width} × {metadata.technical.height}
                    </dd>
                  </div>
                )}
                {metadata.technical.duration && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Duration:</dt>
                    <dd className="font-medium">
                      {Math.floor(metadata.technical.duration / 60)}:
                      {String(Math.floor(metadata.technical.duration % 60)).padStart(2, '0')}
                    </dd>
                  </div>
                )}
                {metadata.technical.codec && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Codec:</dt>
                    <dd className="font-medium">{metadata.technical.codec}</dd>
                  </div>
                )}
                {metadata.technical.fps && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">FPS:</dt>
                    <dd className="font-medium">{metadata.technical.fps}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Processing Status */}
          {metadata?.processing && (
            <div>
              <h2 className="text-xl font-bold mb-4">Processing Status</h2>
              <div className="space-y-2">
                <ProcessingStep
                  label="Thumbnail"
                  completed={metadata.processing.thumbnailGenerated}
                  timestamp={metadata.processing.thumbnailGeneratedAt}
                />
                <ProcessingStep
                  label="Metadata"
                  completed={metadata.processing.metadataExtracted}
                  timestamp={metadata.processing.metadataExtractedAt}
                />
                <ProcessingStep
                  label="Preview"
                  completed={metadata.processing.previewGenerated}
                  timestamp={metadata.processing.previewGeneratedAt}
                />
              </div>
            </div>
          )}

          {/* Description */}
          {asset.description && (
            <div>
              <h2 className="text-xl font-bold mb-4">Description</h2>
              <p className="text-gray-700">{asset.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessingStep({ label, completed, timestamp }: {
  label: string;
  completed?: boolean;
  timestamp?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}:</span>
      <span className="flex items-center gap-2">
        {completed ? (
          <>
            <span className="text-green-600">✓</span>
            {timestamp && (
              <span className="text-xs text-gray-500">
                {new Date(timestamp).toLocaleString()}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400">Pending...</span>
        )}
      </span>
    </div>
  );
}
```

---

## UI/UX Considerations

### Loading States

```typescript
// Progressive loading states for better UX

// 1. Skeleton loaders
function AssetCardSkeleton() {
  return (
    <div className="bg-white border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

// 2. Progressive image loading
function ProgressiveImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div className="relative">
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
```

---

### Empty States

```typescript
function EmptyState({ type }: { type: 'no-results' | 'no-assets' }) {
  if (type === 'no-results') {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="text-lg font-medium mb-2">No assets found</h3>
        <p className="text-gray-600">Try adjusting your filters</p>
      </div>
    );
  }
  
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">📁</div>
      <h3 className="text-lg font-medium mb-2">No assets yet</h3>
      <p className="text-gray-600 mb-4">Upload your first asset to get started</p>
      <button className="px-4 py-2 bg-blue-600 text-white rounded">
        Upload Asset
      </button>
    </div>
  );
}
```

---

### Toast Notifications

```typescript
// Using sonner for toast notifications

import { toast } from 'sonner';

// Success
toast.success('Asset uploaded successfully', {
  description: 'Processing will complete in a few moments',
  duration: 5000,
});

// Error
toast.error('Upload failed', {
  description: error.message,
  action: {
    label: 'Retry',
    onClick: () => retryUpload(),
  },
});

// Loading
const toastId = toast.loading('Uploading asset...', {
  description: 'Please wait',
});

// Update toast
toast.success('Upload complete!', { id: toastId });
```

---

## Edge Cases to Handle

### 1. Expired Preview URLs

```typescript
// Preview URLs expire after 15 minutes
// Refresh when needed

function AssetPreview({ assetId }: { assetId: string }) {
  const { data: preview, refetch } = useAssetPreview(assetId);
  
  const handleImageError = () => {
    // URL might be expired, refetch
    refetch();
  };
  
  return (
    <img
      src={preview?.url}
      onError={handleImageError}
      alt="Preview"
    />
  );
}
```

---

### 2. Processing Timeout

```typescript
// Stop polling after reasonable time

function useAssetProcessingStatus(assetId: string, maxPolls = 60) {
  const [pollCount, setPollCount] = useState(0);
  
  return trpc.ipAssets.getMetadata.useQuery(
    { id: assetId, fields: ['processing'] },
    {
      refetchInterval: (data) => {
        setPollCount(prev => prev + 1);
        
        // Stop if processing complete or timeout
        if (
          data?.processing?.thumbnailGenerated ||
          pollCount >= maxPolls
        ) {
          if (pollCount >= maxPolls) {
            toast.error('Processing is taking longer than expected');
          }
          return false;
        }
        
        return 3000;
      },
    }
  );
}
```

---

### 3. Network Errors

```typescript
// Retry logic with exponential backoff

const query = trpc.ipAssets.list.useQuery(input, {
  retry: (failureCount, error) => {
    // Don't retry on 4xx errors
    if (error.data?.httpStatus && error.data.httpStatus < 500) {
      return false;
    }
    // Max 3 retries
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => {
    // Exponential backoff: 1s, 2s, 4s
    return Math.min(1000 * 2 ** attemptIndex, 30000);
  },
});
```

---

### 4. Large File Uploads

```typescript
// Chunk large files and show detailed progress

async function uploadLargeFile(file: File) {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    await uploadChunk(chunk, i, totalChunks);
    
    const progress = ((i + 1) / totalChunks) * 100;
    setUploadProgress(progress);
  }
}
```

---

### 5. Duplicate File Detection

```typescript
// Warn users about potential duplicates

function useDuplicateDetection(file: File) {
  const { data: assets } = trpc.ipAssets.list.useQuery({
    filters: { search: file.name },
  });
  
  const hasDuplicate = assets?.items.some(
    asset => asset.title === file.name && asset.fileSize === file.size
  );
  
  return hasDuplicate;
}
```

---

## Testing Recommendations

### Unit Tests

```typescript
// Test validators
describe('validateAssetFile', () => {
  it('should accept valid files', () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = validateAssetFile(file);
    expect(result.valid).toBe(true);
  });
  
  it('should reject files over 100MB', () => {
    const largeFile = new File([new ArrayBuffer(101 * 1024 * 1024)], 'large.jpg');
    const result = validateAssetFile(largeFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('exceeds maximum of 100MB');
  });
});
```

---

### Integration Tests

```typescript
// Test upload flow
describe('Asset Upload', () => {
  it('should complete full upload flow', async () => {
    const file = createTestFile();
    
    // Step 1: Initiate
    const { uploadUrl, assetId } = await initiateUpload(file);
    expect(uploadUrl).toBeDefined();
    
    // Step 2: Upload to storage
    await uploadToStorage(uploadUrl, file);
    
    // Step 3: Confirm
    const asset = await confirmUpload(assetId, 'Test Asset');
    expect(asset.status).toBe('PROCESSING');
  });
});
```

---

### E2E Tests (Playwright/Cypress)

```typescript
// Test complete user flow
test('user can upload and view asset', async ({ page }) => {
  // Navigate to assets page
  await page.goto('/assets');
  
  // Click upload button
  await page.click('text=Upload Asset');
  
  // Upload file
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-image.jpg');
  
  // Fill metadata
  await page.fill('input[name="title"]', 'Test Image');
  
  // Submit
  await page.click('button:has-text("Upload")');
  
  // Wait for success message
  await page.waitForSelector('text=Asset uploaded successfully');
  
  // Verify asset appears in list
  await expect(page.locator('text=Test Image')).toBeVisible();
});
```

---

## Summary

You now have everything needed to implement the Asset Processing module in your frontend:

✅ **Complete API endpoint documentation**  
✅ **TypeScript type definitions**  
✅ **Error handling patterns**  
✅ **Business logic and validation**  
✅ **Authorization rules**  
✅ **React Query integration**  
✅ **Complete component examples**  
✅ **UX best practices**  
✅ **Edge case handling**  
✅ **Testing recommendations**

### Next Steps

1. Copy type definitions to your frontend
2. Implement tRPC client setup
3. Build core upload component
4. Add asset list and detail pages
5. Implement filters and pagination
6. Add status management
7. Polish with loading states and error handling
8. Write tests
9. Deploy and monitor

### Support

If you have questions or need clarification:
- Check the backend implementation in `src/modules/ip/`
- Review existing documentation in `docs/frontend-integration/`
- Test endpoints using the tRPC panel at `/api/trpc`

---

**End of Asset Processing Frontend Integration Guide**
