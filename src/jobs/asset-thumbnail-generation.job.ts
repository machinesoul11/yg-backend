import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import {
  generateThumbnailVariants,
  getThumbnailContentType,
  type ThumbnailSize,
} from '@/lib/storage/thumbnail-generator';
import {
  extractVideoThumbnail,
  generateVideoThumbnailVariants,
} from '@/lib/services/asset-processing/video-processor.service';
import {
  processDocument,
} from '@/lib/services/asset-processing/document-processor.service';
import {
  generateThumbnailKey,
} from '@/lib/utils/storage';
import { AssetType } from '@prisma/client';

/**
 * Thumbnail Generation Job
 * 
 * Generates thumbnail images for uploaded assets
 * Supports: Images (Sharp), Videos (FFmpeg), Documents (PDF), Audio (waveform placeholder)
 * Creates small, medium, and large variants
 */

export interface ThumbnailGenerationJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
}

export async function thumbnailGenerationJob(
  job: Job<ThumbnailGenerationJobData>
) {
  const { assetId, storageKey, type, mimeType } = job.data;

  try {
    job.log(`Generating thumbnails for asset ${assetId} (${type})`);

    // Download original file from storage
    job.log(`Downloading original file: ${storageKey}`);
    const { url: downloadUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900, // 15 minutes
    });

    // Fetch file buffer
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const sourceBuffer = Buffer.from(await response.arrayBuffer());

    // Generate thumbnails based on asset type
    let variants: Record<ThumbnailSize, { buffer: Buffer; width: number; height: number; size: number }>;

    if (type === 'IMAGE') {
      // Image thumbnails using Sharp
      job.log('Generating image thumbnail variants (small, medium, large)');
      variants = await generateThumbnailVariants(sourceBuffer, [
        'small',
        'medium',
        'large',
      ]);
    } else if (type === 'VIDEO') {
      // Video thumbnails using FFmpeg
      job.log('Extracting video thumbnail frame');
      const thumbnailBuffer = await extractVideoThumbnail(sourceBuffer, '10%');
      variants = await generateVideoThumbnailVariants(thumbnailBuffer);
    } else if (type === 'DOCUMENT') {
      // Document thumbnails (PDF preview)
      job.log('Generating document thumbnail');
      const documentResult = await processDocument(sourceBuffer, {
        generateThumbnails: true,
        extractText: false,
        extractMetadata: false,
      });
      
      // Use the first thumbnail (small size)
      variants = {
        small: {
          buffer: documentResult.thumbnails[0],
          width: 200,
          height: 200,
          size: documentResult.thumbnails[0].length,
        },
        medium: {
          buffer: documentResult.thumbnails[1],
          width: 400,
          height: 400,
          size: documentResult.thumbnails[1].length,
        },
        large: {
          buffer: documentResult.thumbnails[2],
          width: 800,
          height: 800,
          size: documentResult.thumbnails[2].length,
        },
      };
    } else if (type === 'AUDIO') {
      // Audio doesn't have thumbnails, use waveform in metadata extraction
      job.log('Audio assets do not have thumbnails (waveform generated in metadata extraction)');
      return { success: true, skipped: true, reason: 'Audio assets use waveform instead of thumbnails' };
    } else {
      job.log(`Asset type ${type} does not support thumbnail generation`);
      return { success: true, skipped: true };
    }

    // Upload thumbnails to storage
    const thumbnailUrls: Record<string, string> = {};
    
    for (const [size, thumbnail] of Object.entries(variants)) {
      const thumbnailKey = generateThumbnailKey(assetId, size as ThumbnailSize);
      const contentType = 'image/jpeg'; // All thumbnails are JPEG

      job.log(
        `Uploading ${size} thumbnail (${thumbnail.width}x${thumbnail.height}, ${Math.round(thumbnail.size / 1024)}KB)`
      );

      const { url } = await storageProvider.upload({
        key: thumbnailKey,
        file: thumbnail.buffer,
        contentType,
        metadata: {
          assetId,
          variant: size,
          originalKey: storageKey,
        },
      });

      thumbnailUrls[size] = url;
    }

    // Update asset with thumbnail URLs in metadata
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        thumbnailUrl: thumbnailUrls.small, // Primary thumbnail
        metadata: {
          thumbnails: thumbnailUrls,
          thumbnailGenerated: true,
          thumbnailGeneratedAt: new Date().toISOString(),
        },
      },
    });

    job.log(`Thumbnail generation completed for asset ${assetId}`);

    return { 
      success: true, 
      thumbnailUrls,
      sizes: Object.keys(variants),
    };
  } catch (error) {
    job.log(`Thumbnail generation failed for asset ${assetId}: ${error}`);
    
    // Update asset to mark failure
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          thumbnailGenerated: false,
          thumbnailError: error instanceof Error ? error.message : String(error),
          thumbnailLastAttempt: new Date().toISOString(),
        },
      },
    }).catch(() => {
      // Ignore if metadata update fails
    });

    throw error;
  }
}
