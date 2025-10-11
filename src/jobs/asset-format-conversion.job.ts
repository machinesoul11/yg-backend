/**
 * Asset Format Conversion Job
 * 
 * Converts assets to web-optimized formats and generates variants:
 * - Images: JPEG, WebP, AVIF + responsive sizes
 * - Videos: MP4, WebM + multiple quality levels
 * - Audio: MP3, AAC, OGG + multiple bitrates
 * 
 * Runs as low-priority background job for optimal delivery
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { AssetType } from '@prisma/client';
import {
  convertImage,
  generateResponsiveImageVariants,
  convertVideo,
  convertAudio,
  generateAudioQualityVariants,
} from '@/lib/services/asset-processing/format-conversion.service';

export interface FormatConversionJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
  options?: {
    generateWebP?: boolean;
    generateAVIF?: boolean;
    generateResponsiveSizes?: boolean;
    generateMultipleQualities?: boolean;
  };
}

export async function formatConversionJob(
  job: Job<FormatConversionJobData>
) {
  const { assetId, storageKey, type, mimeType, options = {} } = job.data;

  const {
    generateWebP = true,
    generateAVIF = false, // AVIF is slower, optional
    generateResponsiveSizes = true,
    generateMultipleQualities = true,
  } = options;

  try {
    job.log(`Converting asset ${assetId} (${type}) to optimized formats`);

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

    const variantUrls: Record<string, string> = {};
    let totalVariantsGenerated = 0;

    if (type === 'IMAGE') {
      // Convert to WebP
      if (generateWebP) {
        job.log('Converting to WebP format');
        const webpResult = await convertImage(sourceBuffer, {
          format: 'webp',
          quality: 85,
        });

        const webpKey = storageKey.replace(/\.[^/.]+$/, '.webp');
        const { url: webpUrl } = await storageProvider.upload({
          key: webpKey,
          file: webpResult.buffer,
          contentType: 'image/webp',
          metadata: { assetId, variant: 'webp' },
        });

        variantUrls.webp = webpUrl;
        totalVariantsGenerated++;
        job.log(`WebP variant: ${Math.round(webpResult.size / 1024)}KB (${Math.round(webpResult.compressionRatio * 100)}% of original)`);
      }

      // Convert to AVIF (optional, slower)
      if (generateAVIF) {
        job.log('Converting to AVIF format');
        const avifResult = await convertImage(sourceBuffer, {
          format: 'avif',
          quality: 85,
          effort: 4,
        });

        const avifKey = storageKey.replace(/\.[^/.]+$/, '.avif');
        const { url: avifUrl } = await storageProvider.upload({
          key: avifKey,
          file: avifResult.buffer,
          contentType: 'image/avif',
          metadata: { assetId, variant: 'avif' },
        });

        variantUrls.avif = avifUrl;
        totalVariantsGenerated++;
        job.log(`AVIF variant: ${Math.round(avifResult.size / 1024)}KB (${Math.round(avifResult.compressionRatio * 100)}% of original)`);
      }

      // Generate responsive sizes
      if (generateResponsiveSizes) {
        job.log('Generating responsive image variants');
        const sizes = [400, 800, 1200, 1920];
        const responsiveVariants = await generateResponsiveImageVariants(sourceBuffer, sizes);

        for (const [size, buffer] of Object.entries(responsiveVariants)) {
          const sizeKey = storageKey.replace(/(\.[^/.]+)$/, `_${size}w$1`);
          const { url: sizeUrl } = await storageProvider.upload({
            key: sizeKey,
            file: buffer,
            contentType: mimeType,
            metadata: { assetId, variant: `responsive_${size}w` },
          });

          variantUrls[`size_${size}w`] = sizeUrl;
          totalVariantsGenerated++;
        }

        job.log(`Generated ${sizes.length} responsive variants`);
      }
    } else if (type === 'VIDEO') {
      // Convert to web-optimized MP4
      job.log('Converting to web-optimized MP4');
      const mp4Result = await convertVideo(sourceBuffer, {
        format: 'mp4',
        preset: 'fast',
        bitrate: '2000k',
      });

      const mp4Key = storageKey.replace(/\.[^/.]+$/, '_optimized.mp4');
      const { url: mp4Url } = await storageProvider.upload({
        key: mp4Key,
        file: mp4Result.buffer,
        contentType: 'video/mp4',
        metadata: { assetId, variant: 'optimized_mp4' },
      });

      variantUrls.optimized_mp4 = mp4Url;
      totalVariantsGenerated++;
      job.log(`Optimized MP4: ${Math.round(mp4Result.size / (1024 * 1024))}MB`);

      // Generate multiple quality levels (optional)
      if (generateMultipleQualities) {
        job.log('Generating multiple quality variants (720p, 480p)');
        
        const qualities = [
          { resolution: '1280x720', bitrate: '1500k', name: '720p' },
          { resolution: '854x480', bitrate: '800k', name: '480p' },
        ];

        for (const quality of qualities) {
          const qualityResult = await convertVideo(sourceBuffer, {
            format: 'mp4',
            resolution: quality.resolution,
            bitrate: quality.bitrate,
            preset: 'fast',
          });

          const qualityKey = storageKey.replace(/\.[^/.]+$/, `_${quality.name}.mp4`);
          const { url: qualityUrl } = await storageProvider.upload({
            key: qualityKey,
            file: qualityResult.buffer,
            contentType: 'video/mp4',
            metadata: { assetId, variant: quality.name },
          });

          variantUrls[quality.name] = qualityUrl;
          totalVariantsGenerated++;
        }
      }
    } else if (type === 'AUDIO') {
      // Generate multiple quality variants
      if (generateMultipleQualities) {
        job.log('Generating multiple audio quality variants');
        const qualityVariants = await generateAudioQualityVariants(sourceBuffer, 'mp3');

        for (const [qualityName, buffer] of Object.entries(qualityVariants)) {
          const qualityKey = storageKey.replace(/\.[^/.]+$/, `_${qualityName}.mp3`);
          const { url: qualityUrl } = await storageProvider.upload({
            key: qualityKey,
            file: buffer,
            contentType: 'audio/mpeg',
            metadata: { assetId, variant: `quality_${qualityName}` },
          });

          variantUrls[`quality_${qualityName}`] = qualityUrl;
          totalVariantsGenerated++;
        }

        job.log(`Generated ${Object.keys(qualityVariants).length} quality variants`);
      }

      // Convert to AAC (optional)
      job.log('Converting to AAC format');
      const aacResult = await convertAudio(sourceBuffer, {
        format: 'aac',
        bitrate: '192k',
      });

      const aacKey = storageKey.replace(/\.[^/.]+$/, '.aac');
      const { url: aacUrl } = await storageProvider.upload({
        key: aacKey,
        file: aacResult.buffer,
        contentType: 'audio/aac',
        metadata: { assetId, variant: 'aac' },
      });

      variantUrls.aac = aacUrl;
      totalVariantsGenerated++;
    }

    // Update asset with variant URLs
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          formatConversion: {
            completed: true,
            completedAt: new Date().toISOString(),
            variantsGenerated: totalVariantsGenerated,
            variants: variantUrls,
          },
        },
      },
    });

    job.log(`Format conversion completed for asset ${assetId}: ${totalVariantsGenerated} variants generated`);

    return {
      success: true,
      variantsGenerated: totalVariantsGenerated,
      variantUrls,
    };
  } catch (error) {
    job.log(`Format conversion failed for asset ${assetId}: ${error}`);

    // Update asset to mark failure (non-critical, don't block)
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          formatConversion: {
            completed: false,
            error: error instanceof Error ? error.message : String(error),
            lastAttempt: new Date().toISOString(),
          },
        },
      },
    }).catch(() => {
      // Ignore if metadata update fails
    });

    // Don't throw - format conversion is optional
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
