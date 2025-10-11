/**
 * Asset Preview Generation Job
 * 
 * Generates preview clips and optimized previews for assets:
 * - Video: 10-second preview clips
 * - Audio: 30-second preview clips
 * - Document: Multiple page previews (for short docs)
 * 
 * Runs as lower-priority background job after thumbnail generation
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { AssetType } from '@prisma/client';
import {
  generateVideoPreview,
} from '@/lib/services/asset-processing/video-processor.service';
import {
  generateAudioPreview,
} from '@/lib/services/asset-processing/audio-processor.service';

export interface PreviewGenerationJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
}

export async function previewGenerationJob(
  job: Job<PreviewGenerationJobData>
) {
  const { assetId, storageKey, type, mimeType } = job.data;

  try {
    job.log(`Generating preview for asset ${assetId} (${type})`);

    // Only video and audio need preview generation
    if (type !== 'VIDEO' && type !== 'AUDIO') {
      job.log(`Asset type ${type} does not require preview generation`);
      return { success: true, skipped: true };
    }

    // Download original file from storage
    job.log(`Downloading original file: ${storageKey}`);
    const { url: downloadUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900, // 15 minutes
    });

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const sourceBuffer = Buffer.from(await response.arrayBuffer());

    let previewBuffer: Buffer;
    let previewFormat: string;

    if (type === 'VIDEO') {
      // Generate 10-second video preview clip
      job.log('Generating 10-second video preview clip');
      previewBuffer = await generateVideoPreview(sourceBuffer, {
        duration: 10,
        resolution: '1280x720',
        bitrate: '1000k',
        fps: 30,
      });
      previewFormat = 'video/mp4';
    } else if (type === 'AUDIO') {
      // Generate 30-second audio preview clip
      job.log('Generating 30-second audio preview clip');
      previewBuffer = await generateAudioPreview(sourceBuffer, {
        duration: 30,
        bitrate: '128k',
        format: 'mp3',
      });
      previewFormat = 'audio/mpeg';
    } else {
      throw new Error('Unsupported preview type');
    }

    // Upload preview to storage
    const previewKey = `${storageKey.replace(/\.[^/.]+$/, '')}_preview.${type === 'VIDEO' ? 'mp4' : 'mp3'}`;
    
    job.log(`Uploading preview (${Math.round(previewBuffer.length / 1024)}KB)`);
    
    const { url: previewUrl } = await storageProvider.upload({
      key: previewKey,
      file: previewBuffer,
      contentType: previewFormat,
      metadata: {
        assetId,
        variant: 'preview',
        originalKey: storageKey,
      },
    });

    // Update asset with preview URL
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        previewUrl,
        metadata: {
          previewGenerated: true,
          previewGeneratedAt: new Date().toISOString(),
          previewSize: previewBuffer.length,
          previewDuration: type === 'VIDEO' ? 10 : 30,
        },
      },
    });

    job.log(`Preview generation completed for asset ${assetId}`);

    return {
      success: true,
      previewUrl,
      previewSize: previewBuffer.length,
    };
  } catch (error) {
    job.log(`Preview generation failed for asset ${assetId}: ${error}`);

    // Update asset to mark failure
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          previewGenerated: false,
          previewError: error instanceof Error ? error.message : String(error),
          previewLastAttempt: new Date().toISOString(),
        },
      },
    }).catch(() => {
      // Ignore if metadata update fails
    });

    throw error;
  }
}
