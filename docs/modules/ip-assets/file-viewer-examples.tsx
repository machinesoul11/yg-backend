/**
 * File Viewer/Preview Service - Usage Examples
 * 
 * Complete examples showing how to use the new preview endpoints
 */

import { trpc } from '@/lib/trpc';

// ============================================================================
// Example 1: Basic Preview Display
// ============================================================================

export function BasicPreviewExample({ assetId }: { assetId: string }) {
  const { data: preview, isLoading } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });

  if (isLoading) return <div>Loading preview...</div>;
  if (!preview) return <div>No preview available</div>;

  return <img src={preview.url} alt="Asset preview" />;
}

// ============================================================================
// Example 2: Responsive Image with Multiple Sizes
// ============================================================================

export function ResponsivePreviewExample({ assetId }: { assetId: string }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'thumbnail',
  });

  if (!variants?.thumbnails) return null;

  return (
    <picture>
      {variants.thumbnails.small && (
        <source 
          media="(max-width: 400px)" 
          srcSet={variants.thumbnails.small.url} 
        />
      )}
      {variants.thumbnails.medium && (
        <source 
          media="(max-width: 800px)" 
          srcSet={variants.thumbnails.medium.url} 
        />
      )}
      {variants.thumbnails.large && (
        <img 
          src={variants.thumbnails.large.url} 
          alt="Asset"
          loading="lazy"
          className="w-full h-auto"
        />
      )}
    </picture>
  );
}

// ============================================================================
// Example 3: Metadata Display Component
// ============================================================================

export function MetadataDisplay({ assetId }: { assetId: string }) {
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical', 'descriptive'],
  });

  if (!metadata) return null;

  return (
    <div className="space-y-4">
      {/* Technical Metadata */}
      {metadata.technical && (
        <div>
          <h3 className="font-semibold text-lg mb-2">Technical Info</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {metadata.technical.width && metadata.technical.height && (
              <>
                <dt className="text-gray-600">Dimensions:</dt>
                <dd>{metadata.technical.width} × {metadata.technical.height}px</dd>
              </>
            )}
            {metadata.technical.duration && (
              <>
                <dt className="text-gray-600">Duration:</dt>
                <dd>{formatDuration(metadata.technical.duration)}</dd>
              </>
            )}
            {metadata.technical.format && (
              <>
                <dt className="text-gray-600">Format:</dt>
                <dd className="uppercase">{metadata.technical.format}</dd>
              </>
            )}
            {metadata.technical.bitrate && (
              <>
                <dt className="text-gray-600">Bitrate:</dt>
                <dd>{Math.round(metadata.technical.bitrate / 1000)} kbps</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Descriptive Metadata */}
      {metadata.descriptive && (
        <div>
          <h3 className="font-semibold text-lg mb-2">Description</h3>
          <dl className="space-y-1 text-sm">
            {metadata.descriptive.title && (
              <div>
                <dt className="text-gray-600 inline">Title: </dt>
                <dd className="inline">{metadata.descriptive.title}</dd>
              </div>
            )}
            {metadata.descriptive.artist && (
              <div>
                <dt className="text-gray-600 inline">Artist: </dt>
                <dd className="inline">{metadata.descriptive.artist}</dd>
              </div>
            )}
            {metadata.descriptive.author && (
              <div>
                <dt className="text-gray-600 inline">Author: </dt>
                <dd className="inline">{metadata.descriptive.author}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 4: Audio Waveform Display
// ============================================================================

export function AudioWaveformExample({ assetId }: { assetId: string }) {
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
    type: 'all',
  });

  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['technical'],
  });

  if (!variants?.waveform) {
    return <div>Generating waveform...</div>;
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <img 
        src={variants.waveform.url} 
        alt="Audio waveform"
        className="w-full h-auto"
      />
      {metadata?.technical?.duration && (
        <p className="text-sm text-gray-600 mt-2">
          Duration: {formatDuration(metadata.technical.duration)}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Example 5: Video Preview with Thumbnail
// ============================================================================

export function VideoPreviewExample({ assetId }: { assetId: string }) {
  const [showVideo, setShowVideo] = React.useState(false);
  
  const { data: variants } = trpc.ipAssets.getVariants.useQuery({
    id: assetId,
  });

  const { data: downloadUrl } = trpc.ipAssets.getDownloadUrl.useQuery(
    { id: assetId },
    { enabled: showVideo } // Only fetch when needed
  );

  if (!variants?.thumbnails.large) {
    return <div>Loading...</div>;
  }

  return (
    <div className="relative">
      {!showVideo ? (
        // Show thumbnail with play button
        <div 
          className="relative cursor-pointer group"
          onClick={() => setShowVideo(true)}
        >
          <img 
            src={variants.thumbnails.large.url}
            alt="Video thumbnail"
            className="w-full h-auto rounded-lg"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black bg-opacity-50 rounded-full p-4 group-hover:bg-opacity-70 transition">
              <PlayIcon className="w-12 h-12 text-white" />
            </div>
          </div>
        </div>
      ) : (
        // Show video player
        <video 
          src={downloadUrl?.url} 
          controls 
          autoPlay
          className="w-full h-auto rounded-lg"
        />
      )}
    </div>
  );
}

// ============================================================================
// Example 6: Processing Status Indicator
// ============================================================================

export function ProcessingStatusExample({ assetId }: { assetId: string }) {
  const { data: metadata, refetch } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['processing'],
  });

  // Poll for updates while processing
  React.useEffect(() => {
    if (!metadata?.processing?.thumbnailGenerated) {
      const interval = setInterval(() => {
        refetch();
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [metadata, refetch]);

  if (!metadata?.processing) return null;

  const { thumbnailGenerated, previewGenerated, metadataExtracted } = metadata.processing;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h4 className="font-semibold text-blue-900 mb-2">Processing Status</h4>
      <ul className="space-y-1 text-sm">
        <ProcessingItem 
          label="Thumbnail Generation" 
          completed={thumbnailGenerated} 
        />
        <ProcessingItem 
          label="Preview Generation" 
          completed={previewGenerated} 
        />
        <ProcessingItem 
          label="Metadata Extraction" 
          completed={metadataExtracted} 
        />
      </ul>
    </div>
  );
}

function ProcessingItem({ label, completed }: { label: string; completed: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {completed ? (
        <CheckCircleIcon className="w-4 h-4 text-green-600" />
      ) : (
        <Spinner className="w-4 h-4 text-blue-600" />
      )}
      <span className={completed ? 'text-gray-700' : 'text-blue-700'}>
        {label}
      </span>
    </li>
  );
}

// ============================================================================
// Example 7: Preview Regeneration
// ============================================================================

export function RegeneratePreviewExample({ assetId }: { assetId: string }) {
  const regenerate = trpc.ipAssets.regeneratePreview.useMutation();
  
  const { data: metadata, refetch } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
    fields: ['processing'],
  });

  const handleRegenerate = async () => {
    try {
      await regenerate.mutateAsync({
        id: assetId,
        types: ['thumbnail', 'preview'],
      });
      
      // Show success message
      alert('Preview regeneration started');
      
      // Start polling for completion
      const interval = setInterval(async () => {
        const result = await refetch();
        if (result.data?.processing?.thumbnailGenerated) {
          clearInterval(interval);
          alert('Preview regeneration complete!');
        }
      }, 5000);
    } catch (error) {
      alert('Failed to regenerate preview: ' + error.message);
    }
  };

  const isFailed = metadata?.processing?.thumbnailGenerated === false;

  if (!isFailed) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <p className="text-sm text-yellow-800 mb-2">
        Preview generation failed or is incomplete.
      </p>
      <button
        onClick={handleRegenerate}
        disabled={regenerate.isLoading}
        className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
      >
        {regenerate.isLoading ? 'Regenerating...' : 'Regenerate Preview'}
      </button>
    </div>
  );
}

// ============================================================================
// Example 8: Complete Asset Card Component
// ============================================================================

export function AssetPreviewCard({ assetId }: { assetId: string }) {
  const { data: asset } = trpc.ipAssets.getById.useQuery({ id: assetId });
  const { data: preview } = trpc.ipAssets.getPreview.useQuery({
    id: assetId,
    size: 'medium',
  });
  const { data: metadata } = trpc.ipAssets.getMetadata.useQuery({
    id: assetId,
  });

  if (!asset) return <div>Loading...</div>;

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition">
      {/* Preview Image */}
      <div className="aspect-square bg-gray-100 relative">
        {preview && metadata?.processing?.thumbnailGenerated ? (
          <img 
            src={preview.url}
            alt={asset.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Spinner className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">Generating preview...</p>
            </div>
          </div>
        )}

        {/* Asset Type Badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-black bg-opacity-50 text-white text-xs rounded">
            {asset.type}
          </span>
        </div>
      </div>

      {/* Asset Info */}
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1 truncate">{asset.title}</h3>
        
        {asset.description && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            {asset.description}
          </p>
        )}

        {/* Technical Info */}
        {metadata?.technical && (
          <div className="flex gap-3 text-xs text-gray-500 mb-3">
            {metadata.technical.width && metadata.technical.height && (
              <span>{metadata.technical.width} × {metadata.technical.height}</span>
            )}
            {metadata.technical.duration && (
              <span>{formatDuration(metadata.technical.duration)}</span>
            )}
            {metadata.technical.format && (
              <span className="uppercase">{metadata.technical.format}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            View Details
          </button>
          <button className="px-3 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50">
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Example 9: Grid View with Lazy Loading
// ============================================================================

export function AssetGridView() {
  const { data: assets } = trpc.ipAssets.list.useQuery({
    filters: { status: 'APPROVED' },
    page: 1,
    pageSize: 20,
  });

  if (!assets?.data) return <div>Loading assets...</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {assets.data.map((asset) => (
        <AssetPreviewCard key={asset.id} assetId={asset.id} />
      ))}
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Example 10: Server-Side Usage (API Routes, Server Components)
// ============================================================================

import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { IpAssetService } from '@/modules/ip';

export async function getAssetPreviewSSR(assetId: string, userId: string, userRole: string) {
  const service = new IpAssetService(prisma, storageProvider);
  
  try {
    // Get preview URL
    const preview = await service.getPreviewUrl(
      { userId, userRole },
      assetId,
      'medium'
    );

    // Get metadata
    const metadata = await service.getAssetMetadata(
      { userId, userRole },
      assetId,
      ['technical', 'processing']
    );

    return { preview, metadata };
  } catch (error) {
    console.error('Failed to get asset preview:', error);
    return null;
  }
}
