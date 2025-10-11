import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { extractImageMetadata } from '@/lib/storage/thumbnail-generator';
import { validateFile } from '@/lib/storage/file-validator';
import { storageConfig } from '@/lib/config/storage';
import {
  extractVideoMetadata,
} from '@/lib/services/asset-processing/video-processor.service';
import {
  extractAudioMetadata,
  generateSimpleWaveform,
} from '@/lib/services/asset-processing/audio-processor.service';
import {
  extractDocumentMetadata,
  extractDocumentText,
} from '@/lib/services/asset-processing/document-processor.service';
import { AssetType } from '@prisma/client';

/**
 * Metadata Extraction Job
 * 
 * Extracts comprehensive metadata from uploaded assets
 * - Images: EXIF, dimensions, color space (Sharp)
 * - Videos: Duration, codec, resolution, bitrate (FFmpeg)
 * - Audio: ID3 tags, duration, bitrate (music-metadata + FFmpeg)
 * - Documents: Page count, author, text content (pdf-parse)
 */

export interface MetadataExtractionJobData {
  assetId: string;
  storageKey: string;
  mimeType: string;
  type: AssetType;
}

export async function metadataExtractionJob(
  job: Job<MetadataExtractionJobData>
) {
  const { assetId, storageKey, mimeType, type } = job.data;

  try {
    job.log(`Extracting metadata for asset ${assetId} (${type})`);

    // Download file from storage
    const { url: downloadUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900,
    });

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    // Extract filename from storage key
    const filename = storageKey.split('/').pop() || 'unknown';

    // Perform comprehensive file validation with magic number check
    job.log('Validating file type with magic number verification');
    const validationResult = await validateFile({
      buffer: fileBuffer,
      filename,
      declaredMimeType: mimeType,
      allowedTypes: storageConfig.allowedTypes,
    });

    let metadata: Record<string, any> = {
      fileSize: fileBuffer.length,
      declaredMimeType: mimeType,
      detectedMimeType: validationResult.detectedMimeType,
      validationPassed: validationResult.isValid,
      validationWarnings: validationResult.warnings,
      uploadedAt: new Date().toISOString(),
    };

    if (!validationResult.isValid) {
      job.log(`File validation failed: ${validationResult.errors.join(', ')}`);
      metadata.validationErrors = validationResult.errors;
    }

    // Extract type-specific metadata
    if (type === 'IMAGE') {
      job.log('Extracting image metadata with Sharp');
      try {
        const imageMetadata = await extractImageMetadata(fileBuffer);
        metadata = {
          ...metadata,
          width: imageMetadata.width,
          height: imageMetadata.height,
          format: imageMetadata.format,
          colorSpace: imageMetadata.space,
          channels: imageMetadata.channels,
          hasAlpha: imageMetadata.hasAlpha,
          exif: imageMetadata.exif,
        };
      } catch (error) {
        job.log(`Failed to extract image metadata: ${error}`);
        metadata.metadataError = error instanceof Error ? error.message : String(error);
      }
    } else if (type === 'VIDEO') {
      job.log('Extracting video metadata with FFmpeg');
      try {
        // Write to temporary file for ffprobe
        const tmpPath = `/tmp/video-metadata-${Date.now()}.tmp`;
        require('fs').writeFileSync(tmpPath, fileBuffer);
        
        const videoMetadata = await extractVideoMetadata(tmpPath);
        
        // Cleanup temp file
        require('fs').unlinkSync(tmpPath);
        
        metadata = {
          ...metadata,
          duration: videoMetadata.duration,
          width: videoMetadata.width,
          height: videoMetadata.height,
          codec: videoMetadata.codec,
          fps: videoMetadata.fps,
          bitrate: videoMetadata.bitrate,
          resolution: videoMetadata.resolution,
          aspectRatio: videoMetadata.aspectRatio,
          hasAudio: videoMetadata.hasAudio,
          audioCodec: videoMetadata.audioCodec,
        };
      } catch (error) {
        job.log(`Failed to extract video metadata: ${error}`);
        metadata.metadataError = error instanceof Error ? error.message : String(error);
      }
    } else if (type === 'AUDIO') {
      job.log('Extracting audio metadata with music-metadata and FFmpeg');
      try {
        // Write to temporary file
        const tmpPath = `/tmp/audio-metadata-${Date.now()}.tmp`;
        require('fs').writeFileSync(tmpPath, fileBuffer);
        
        const audioMetadata = await extractAudioMetadata(tmpPath);
        
        // Generate simple waveform preview
        const waveform = await generateSimpleWaveform(audioMetadata);
        
        // Upload waveform to storage
        const waveformKey = `${storageKey.replace(/\.[^/.]+$/, '')}_waveform.png`;
        const { url: waveformUrl } = await storageProvider.upload({
          key: waveformKey,
          file: waveform,
          contentType: 'image/png',
          metadata: {
            assetId,
            type: 'waveform',
          },
        });
        
        // Cleanup temp file
        require('fs').unlinkSync(tmpPath);
        
        metadata = {
          ...metadata,
          duration: audioMetadata.duration,
          bitrate: audioMetadata.bitrate,
          sampleRate: audioMetadata.sampleRate,
          channels: audioMetadata.channels,
          codec: audioMetadata.codec,
          format: audioMetadata.format,
          title: audioMetadata.title,
          artist: audioMetadata.artist,
          album: audioMetadata.album,
          year: audioMetadata.year,
          genre: audioMetadata.genre,
          trackNumber: audioMetadata.trackNumber,
          waveformUrl,
        };
      } catch (error) {
        job.log(`Failed to extract audio metadata: ${error}`);
        metadata.metadataError = error instanceof Error ? error.message : String(error);
      }
    } else if (type === 'DOCUMENT') {
      job.log('Extracting document metadata with pdf-parse');
      try {
        const documentMetadata = await extractDocumentMetadata(fileBuffer);
        
        // Extract text content for search indexing
        const textContent = await extractDocumentText(fileBuffer, {
          maxLength: 100000, // 100KB of text
        });
        
        metadata = {
          ...metadata,
          pageCount: documentMetadata.pageCount,
          title: documentMetadata.title,
          author: documentMetadata.author,
          subject: documentMetadata.subject,
          creator: documentMetadata.creator,
          producer: documentMetadata.producer,
          keywords: documentMetadata.keywords,
          version: documentMetadata.version,
          creationDate: documentMetadata.creationDate,
          modificationDate: documentMetadata.modificationDate,
          textContent, // Store for search indexing
          textLength: textContent.length,
        };
      } catch (error) {
        job.log(`Failed to extract document metadata: ${error}`);
        metadata.metadataError = error instanceof Error ? error.message : String(error);
      }
    }

    metadata.processedAt = new Date().toISOString();

    // Update asset with metadata
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata,
      },
    });

    job.log(`Metadata extraction completed for asset ${assetId}`);

    return { success: true, metadata };
  } catch (error) {
    job.log(`Metadata extraction failed for asset ${assetId}: ${error}`);
    
    // Don't throw - metadata extraction is not critical
    // Just log the error and continue
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          extractionFailed: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    return { success: false, error };
  }
}
