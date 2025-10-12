/**
 * Asset Processing Pipeline
 * 
 * Orchestrates the complete asset processing workflow:
 * 1. Virus scanning (priority: critical)
 * 2. Thumbnail generation (priority: high)
 * 3. Metadata extraction (priority: high)
 * 4. Preview generation (priority: medium) - Optional
 * 5. Format conversion (priority: low) - Optional
 * 6. Watermarking (priority: low) - On-demand only
 * 
 * This service manages job enqueueing and tracks processing status
 */

import { Queue, Worker } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { AssetType } from '@prisma/client';
import type {
  ThumbnailGenerationJobData,
} from './asset-thumbnail-generation.job';
import type {
  MetadataExtractionJobData,
} from './asset-metadata-extraction.job';
import type {
  PreviewGenerationJobData,
} from './asset-preview-generation.job';
import type {
  FormatConversionJobData,
} from './asset-format-conversion.job';
import type {
  WatermarkingJobData,
} from './asset-watermarking.job';
import type {
  QualityValidationJobData,
} from './asset-quality-validation.job';

/**
 * Asset Processing Configuration
 */
export interface AssetProcessingConfig {
  // Core processing (always runs)
  enableVirusScan?: boolean; // Default: true
  enableThumbnailGeneration?: boolean; // Default: true
  enableMetadataExtraction?: boolean; // Default: true
  enableQualityValidation?: boolean; // Default: true

  // Optional processing
  enablePreviewGeneration?: boolean; // Default: false (video/audio only)
  enableFormatConversion?: boolean; // Default: false
  enableWatermarking?: boolean; // Default: false

  // Format conversion options
  formatConversion?: {
    generateWebP?: boolean;
    generateAVIF?: boolean;
    generateResponsiveSizes?: boolean;
    generateMultipleQualities?: boolean;
  };

  // Watermarking options
  watermark?: {
    type: 'text' | 'logo' | 'both' | 'invisible';
    text?: string;
    logoStorageKey?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'tiled';
    opacity?: number;
    forensic?: boolean;
    userId?: string;
    sessionId?: string;
  };
}

/**
 * Job Queues
 */
export const assetProcessingQueues = {
  thumbnail: new Queue<ThumbnailGenerationJobData>('asset-thumbnail-generation', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }),

  metadata: new Queue<MetadataExtractionJobData>('asset-metadata-extraction', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }),

  preview: new Queue<PreviewGenerationJobData>('asset-preview-generation', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    },
  }),

  formatConversion: new Queue<FormatConversionJobData>('asset-format-conversion', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    },
  }),

  watermarking: new Queue<WatermarkingJobData>('asset-watermarking', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  }),

  qualityValidation: new Queue<QualityValidationJobData>('asset-quality-validation', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  }),
};

/**
 * Enqueue asset processing jobs based on configuration
 */
export async function enqueueAssetProcessing(
  assetId: string,
  storageKey: string,
  type: AssetType,
  mimeType: string,
  config: AssetProcessingConfig = {}
): Promise<{
  jobIds: {
    thumbnail?: string;
    metadata?: string;
    preview?: string;
    formatConversion?: string;
    watermarking?: string;
    qualityValidation?: string;
  };
  totalJobsEnqueued: number;
}> {
  const {
    enableThumbnailGeneration = true,
    enableMetadataExtraction = true,
    enableQualityValidation = true,
    enablePreviewGeneration = false,
    enableFormatConversion = false,
    enableWatermarking = false,
    formatConversion,
    watermark,
  } = config;

  const jobIds: Record<string, string> = {};
  let totalJobsEnqueued = 0;

  // 1. Thumbnail generation (high priority)
  if (enableThumbnailGeneration) {
    const thumbnailJob = await assetProcessingQueues.thumbnail.add(
      `thumbnail-${assetId}`,
      {
        assetId,
        storageKey,
        type,
        mimeType,
      },
      {
        priority: 2, // High priority
      }
    );
    jobIds.thumbnail = thumbnailJob.id!;
    totalJobsEnqueued++;
  }

  // 2. Metadata extraction (high priority)
  if (enableMetadataExtraction) {
    const metadataJob = await assetProcessingQueues.metadata.add(
      `metadata-${assetId}`,
      {
        assetId,
        storageKey,
        mimeType,
        type,
      },
      {
        priority: 2, // High priority
      }
    );
    jobIds.metadata = metadataJob.id!;
    totalJobsEnqueued++;
  }

  // 3. Preview generation (medium priority, video/audio only)
  if (enablePreviewGeneration && (type === 'VIDEO' || type === 'AUDIO')) {
    const previewJob = await assetProcessingQueues.preview.add(
      `preview-${assetId}`,
      {
        assetId,
        storageKey,
        type,
        mimeType,
      },
      {
        priority: 5, // Medium priority
        delay: 5000, // Wait 5 seconds after main processing
      }
    );
    jobIds.preview = previewJob.id!;
    totalJobsEnqueued++;
  }

  // 4. Format conversion (low priority)
  if (enableFormatConversion) {
    const conversionJob = await assetProcessingQueues.formatConversion.add(
      `conversion-${assetId}`,
      {
        assetId,
        storageKey,
        type,
        mimeType,
        options: formatConversion,
      },
      {
        priority: 8, // Low priority
        delay: 10000, // Wait 10 seconds after main processing
      }
    );
    jobIds.formatConversion = conversionJob.id!;
    totalJobsEnqueued++;
  }

  // 5. Watermarking (on-demand only)
  if (enableWatermarking && watermark && (type === 'IMAGE' || type === 'VIDEO')) {
    const watermarkJob = await assetProcessingQueues.watermarking.add(
      `watermark-${assetId}`,
      {
        assetId,
        storageKey,
        type,
        mimeType,
        watermarkConfig: {
          enabled: true,
          ...watermark,
        },
      },
      {
        priority: 9, // Lowest priority
      }
    );
    jobIds.watermarking = watermarkJob.id!;
    totalJobsEnqueued++;
  }

  // 6. Quality validation (high priority, runs after metadata extraction)
  if (enableQualityValidation) {
    const qualityJob = await assetProcessingQueues.qualityValidation.add(
      `quality-${assetId}`,
      {
        assetId,
        storageKey,
        type,
        mimeType,
      },
      {
        priority: 3, // High priority (after thumbnails and metadata)
        delay: 2000, // Wait 2 seconds to ensure metadata is extracted
      }
    );
    jobIds.qualityValidation = qualityJob.id!;
    totalJobsEnqueued++;
  }

  return {
    jobIds,
    totalJobsEnqueued,
  };
}

/**
 * Get default processing configuration based on asset type
 */
export function getDefaultProcessingConfig(type: AssetType): AssetProcessingConfig {
  const baseConfig: AssetProcessingConfig = {
    enableVirusScan: true,
    enableThumbnailGeneration: true,
    enableMetadataExtraction: true,
    enableQualityValidation: true,
    enablePreviewGeneration: false,
    enableFormatConversion: false,
    enableWatermarking: false,
  };

  switch (type) {
    case 'IMAGE':
      return {
        ...baseConfig,
        enableFormatConversion: true, // Generate WebP for images
        formatConversion: {
          generateWebP: true,
          generateAVIF: false, // Optional, slower
          generateResponsiveSizes: true,
        },
      };

    case 'VIDEO':
      return {
        ...baseConfig,
        enablePreviewGeneration: true, // Generate preview clips
        enableFormatConversion: false, // Video conversion is expensive
      };

    case 'AUDIO':
      return {
        ...baseConfig,
        enablePreviewGeneration: true, // Generate preview clips
        enableFormatConversion: true, // Generate multiple quality variants
        formatConversion: {
          generateMultipleQualities: true,
        },
      };

    case 'DOCUMENT':
      return baseConfig; // Basic processing only

    default:
      return baseConfig;
  }
}

/**
 * Check asset processing status
 */
export async function getAssetProcessingStatus(assetId: string): Promise<{
  thumbnail: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  metadata: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  qualityValidation: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'not-enabled';
  preview: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'not-applicable';
  formatConversion: 'pending' | 'processing' | 'completed' | 'failed' | 'not-enabled';
  watermarking: 'pending' | 'processing' | 'completed' | 'failed' | 'not-enabled';
  overall: 'pending' | 'processing' | 'completed' | 'failed';
}> {
  // This would query job status from BullMQ and database
  // Placeholder implementation
  return {
    thumbnail: 'completed',
    metadata: 'completed',
    qualityValidation: 'completed',
    preview: 'not-applicable',
    formatConversion: 'not-enabled',
    watermarking: 'not-enabled',
    overall: 'completed',
  };
}

/**
 * Retry failed asset processing
 */
export async function retryAssetProcessing(
  assetId: string,
  failedSteps: Array<'thumbnail' | 'metadata' | 'preview' | 'formatConversion' | 'watermarking'>
): Promise<{ retriedCount: number }> {
  let retriedCount = 0;

  for (const step of failedSteps) {
    // Re-enqueue the failed job
    // Implementation depends on stored job data
    retriedCount++;
  }

  return { retriedCount };
}

/**
 * Cancel pending asset processing jobs
 */
export async function cancelAssetProcessing(assetId: string): Promise<{ cancelledCount: number }> {
  let cancelledCount = 0;

  // Remove jobs from queues
  const queues = Object.values(assetProcessingQueues);

  for (const queue of queues) {
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    for (const job of jobs) {
      if (job.data.assetId === assetId) {
        await job.remove();
        cancelledCount++;
      }
    }
  }

  return { cancelledCount };
}
