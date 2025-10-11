/**
 * Asset Watermarking Job
 * 
 * Applies watermarks to assets based on configuration:
 * - Images: Text or logo watermarks with configurable positioning
 * - Videos: Overlay watermarks
 * - Invisible watermarking for forensic tracking
 * 
 * Only runs when explicitly configured for the asset
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { AssetType } from '@prisma/client';
import {
  applyAssetWatermark,
  generateForensicWatermark,
  type WatermarkPosition,
} from '@/lib/services/asset-processing/watermark.service';

export interface WatermarkingJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
  watermarkConfig: {
    enabled: boolean;
    type: 'text' | 'logo' | 'both' | 'invisible';
    text?: string;
    logoStorageKey?: string; // Key to logo in storage
    position?: WatermarkPosition;
    opacity?: number;
    forensic?: boolean; // Add user/session tracking
    userId?: string;
    sessionId?: string;
  };
}

export async function watermarkingJob(
  job: Job<WatermarkingJobData>
) {
  const { assetId, storageKey, type, mimeType, watermarkConfig } = job.data;

  try {
    if (!watermarkConfig.enabled) {
      job.log(`Watermarking disabled for asset ${assetId}`);
      return { success: true, skipped: true };
    }

    // Only images and videos support watermarking
    if (type !== 'IMAGE' && type !== 'VIDEO') {
      job.log(`Asset type ${type} does not support watermarking`);
      return { success: true, skipped: true };
    }

    job.log(`Applying watermark to asset ${assetId} (${type})`);

    // Download original file from storage
    job.log(`Downloading original file: ${storageKey}`);
    const { url: downloadUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900,
    });

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const sourceBuffer = Buffer.from(await response.arrayBuffer());

    // Download logo if needed
    let logoBuffer: Buffer | undefined;
    if (watermarkConfig.logoStorageKey && (watermarkConfig.type === 'logo' || watermarkConfig.type === 'both')) {
      job.log('Downloading watermark logo');
      const { url: logoUrl } = await storageProvider.getDownloadUrl({
        key: watermarkConfig.logoStorageKey,
        expiresIn: 900,
      });

      const logoResponse = await fetch(logoUrl);
      if (logoResponse.ok) {
        logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
      }
    }

    // Generate forensic watermark text if enabled
    let watermarkText = watermarkConfig.text || '© YesGoddess';
    if (watermarkConfig.forensic && watermarkConfig.userId && watermarkConfig.sessionId) {
      watermarkText = generateForensicWatermark(
        watermarkConfig.userId,
        watermarkConfig.sessionId
      );
      job.log('Generated forensic watermark for tracking');
    }

    // Apply watermark
    job.log(`Applying ${watermarkConfig.type} watermark`);
    const watermarkedBuffer = await applyAssetWatermark(
      sourceBuffer,
      type === 'IMAGE' ? 'image' : 'video',
      {
        enabled: true,
        type: watermarkConfig.type,
        text: watermarkText,
        logoBuffer,
        position: watermarkConfig.position || 'bottom-right',
        opacity: watermarkConfig.opacity || 0.7,
        userId: watermarkConfig.userId,
        sessionId: watermarkConfig.sessionId,
      }
    );

    // Upload watermarked version
    const watermarkedKey = storageKey.replace(/(\.[^/.]+)$/, '_watermarked$1');
    
    job.log(`Uploading watermarked asset (${Math.round(watermarkedBuffer.length / 1024)}KB)`);
    
    const { url: watermarkedUrl } = await storageProvider.upload({
      key: watermarkedKey,
      file: watermarkedBuffer,
      contentType: mimeType,
      metadata: {
        assetId,
        variant: 'watermarked',
        watermarkType: watermarkConfig.type,
        watermarkPosition: watermarkConfig.position || 'bottom-right',
        forensic: String(watermarkConfig.forensic || false),
        originalKey: storageKey,
      },
    });

    // Update asset with watermarked version info
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          watermark: {
            applied: true,
            appliedAt: new Date().toISOString(),
            type: watermarkConfig.type,
            position: watermarkConfig.position,
            forensic: watermarkConfig.forensic,
            watermarkedUrl,
            watermarkedKey,
          },
        },
      },
    });

    job.log(`Watermarking completed for asset ${assetId}`);

    return {
      success: true,
      watermarkedUrl,
      watermarkedSize: watermarkedBuffer.length,
    };
  } catch (error) {
    job.log(`Watermarking failed for asset ${assetId}: ${error}`);

    // Update asset to mark failure (non-critical)
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          watermark: {
            applied: false,
            error: error instanceof Error ? error.message : String(error),
            lastAttempt: new Date().toISOString(),
          },
        },
      },
    }).catch(() => {
      // Ignore if metadata update fails
    });

    // Don't throw - watermarking failure shouldn't block asset processing
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
