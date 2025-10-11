/**
 * Format Conversion Service
 * 
 * Handles format conversion for various asset types:
 * - Image format conversion (JPEG, PNG, WebP, AVIF)
 * - Video format conversion (MP4, WebM)
 * - Audio format conversion (MP3, AAC, OGG)
 * - Quality/compression optimization
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff';
export type VideoFormat = 'mp4' | 'webm';
export type AudioFormat = 'mp3' | 'aac' | 'ogg';

export interface ImageConversionOptions {
  format: ImageFormat;
  quality?: number; // 1-100
  compression?: number; // 0-9 for PNG
  effort?: number; // 0-9 for WebP/AVIF (higher = slower but smaller)
  lossless?: boolean; // For WebP
  progressive?: boolean; // For JPEG
  withMetadata?: boolean; // Preserve metadata
}

export interface VideoConversionOptions {
  format: VideoFormat;
  resolution?: string; // e.g., '1920x1080', '1280x720'
  bitrate?: string; // e.g., '2000k'
  fps?: number;
  codec?: string; // e.g., 'libx264', 'libvpx-vp9'
  audioCodec?: string; // e.g., 'aac', 'libopus'
  audioBitrate?: string; // e.g., '128k'
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
}

export interface AudioConversionOptions {
  format: AudioFormat;
  bitrate?: string; // e.g., '320k', '192k', '128k'
  sampleRate?: number; // e.g., 44100, 48000
  channels?: number; // 1 (mono), 2 (stereo)
  quality?: number; // VBR quality (for MP3: 0-9, lower is better)
}

export interface ConversionResult {
  buffer: Buffer;
  format: string;
  size: number;
  compressionRatio: number; // Original size / New size
}

/**
 * Convert image to different format
 */
export async function convertImage(
  inputBuffer: Buffer,
  options: ImageConversionOptions
): Promise<ConversionResult> {
  const {
    format,
    quality = 85,
    compression = 6,
    effort = 4,
    lossless = false,
    progressive = true,
    withMetadata = false,
  } = options;

  let pipeline = sharp(inputBuffer);

  // Preserve or strip metadata
  if (withMetadata) {
    pipeline = pipeline.withMetadata();
  }

  // Apply format-specific conversion
  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality,
        progressive,
        mozjpeg: true,
        chromaSubsampling: '4:2:0',
      });
      break;

    case 'png':
      pipeline = pipeline.png({
        quality,
        compressionLevel: compression,
        adaptiveFiltering: true,
        palette: quality < 100,
      });
      break;

    case 'webp':
      pipeline = pipeline.webp({
        quality,
        effort,
        lossless,
        nearLossless: !lossless,
      });
      break;

    case 'avif':
      pipeline = pipeline.avif({
        quality,
        effort,
        lossless,
        chromaSubsampling: '4:2:0',
      });
      break;

    case 'tiff':
      pipeline = pipeline.tiff({
        quality,
        compression: 'lzw',
      });
      break;

    default:
      throw new Error(`Unsupported image format: ${format}`);
  }

  const outputBuffer = await pipeline.toBuffer();

  return {
    buffer: outputBuffer,
    format,
    size: outputBuffer.length,
    compressionRatio: inputBuffer.length / outputBuffer.length,
  };
}

/**
 * Convert image to multiple formats
 */
export async function convertImageToMultipleFormats(
  inputBuffer: Buffer,
  formats: ImageFormat[]
): Promise<Record<ImageFormat, ConversionResult>> {
  const results: Partial<Record<ImageFormat, ConversionResult>> = {};

  await Promise.all(
    formats.map(async (format) => {
      try {
        results[format] = await convertImage(inputBuffer, { format });
      } catch (error) {
        console.error(`Failed to convert to ${format}:`, error);
      }
    })
  );

  return results as Record<ImageFormat, ConversionResult>;
}

/**
 * Generate responsive image variants
 */
export async function generateResponsiveImageVariants(
  inputBuffer: Buffer,
  sizes: number[] = [400, 800, 1200, 1920],
  format: ImageFormat = 'jpeg'
): Promise<Record<number, Buffer>> {
  const variants: Record<number, Buffer> = {};

  await Promise.all(
    sizes.map(async (width) => {
      const resized = await sharp(inputBuffer)
        .resize(width, null, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(format, { quality: 85 })
        .toBuffer();

      variants[width] = resized;
    })
  );

  return variants;
}

/**
 * Convert video to different format
 */
export async function convertVideo(
  inputBuffer: Buffer,
  options: VideoConversionOptions
): Promise<ConversionResult> {
  const {
    format,
    resolution,
    bitrate = '2000k',
    fps = 30,
    codec,
    audioCodec,
    audioBitrate = '128k',
    preset = 'medium',
  } = options;

  const tmpInputPath = `/tmp/video-convert-in-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/video-convert-out-${Date.now()}.${format}`;

  return new Promise((resolve, reject) => {
    try {
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      const command = ffmpeg(tmpInputPath)
        .output(tmpOutputPath)
        .videoBitrate(bitrate)
        .fps(fps)
        .audioBitrate(audioBitrate);

      // Set resolution if specified
      if (resolution) {
        command.size(resolution);
      }

      // Format-specific settings
      if (format === 'mp4') {
        command
          .videoCodec(codec || 'libx264')
          .audioCodec(audioCodec || 'aac')
          .outputOptions([
            `-preset ${preset}`,
            '-movflags +faststart',
            '-profile:v high',
            '-level 4.0',
          ]);
      } else if (format === 'webm') {
        command
          .videoCodec(codec || 'libvpx-vp9')
          .audioCodec(audioCodec || 'libopus')
          .outputOptions([
            '-crf 30',
            '-b:v 0', // Use CRF instead of bitrate for VP9
            '-row-mt 1', // Enable row-based multithreading
          ]);
      }

      command
        .on('end', () => {
          try {
            const outputBuffer = require('fs').readFileSync(tmpOutputPath);
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);

            resolve({
              buffer: outputBuffer,
              format,
              size: outputBuffer.length,
              compressionRatio: inputBuffer.length / outputBuffer.length,
            });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          try {
            require('fs').unlinkSync(tmpInputPath);
            require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
          } catch {}
          reject(new Error(`Failed to convert video: ${err.message}`));
        })
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate adaptive bitrate video variants (HLS/DASH)
 */
export async function generateAdaptiveBitrateVariants(
  inputBuffer: Buffer,
  qualities: Array<{ resolution: string; bitrate: string }>
): Promise<Record<string, Buffer>> {
  const variants: Record<string, Buffer> = {};

  for (const quality of qualities) {
    const variant = await convertVideo(inputBuffer, {
      format: 'mp4',
      resolution: quality.resolution,
      bitrate: quality.bitrate,
    });

    variants[`${quality.resolution}-${quality.bitrate}`] = variant.buffer;
  }

  return variants;
}

/**
 * Convert audio to different format
 */
export async function convertAudio(
  inputBuffer: Buffer,
  options: AudioConversionOptions
): Promise<ConversionResult> {
  const {
    format,
    bitrate = '192k',
    sampleRate = 44100,
    channels = 2,
    quality = 2,
  } = options;

  const tmpInputPath = `/tmp/audio-convert-in-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/audio-convert-out-${Date.now()}.${format}`;

  return new Promise((resolve, reject) => {
    try {
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      const command = ffmpeg(tmpInputPath)
        .output(tmpOutputPath)
        .audioBitrate(bitrate)
        .audioChannels(channels)
        .audioFrequency(sampleRate);

      // Format-specific settings
      if (format === 'mp3') {
        command.audioCodec('libmp3lame').outputOptions([`-q:a ${quality}`]);
      } else if (format === 'aac') {
        command.audioCodec('aac');
      } else if (format === 'ogg') {
        command.audioCodec('libvorbis').outputOptions([`-q:a ${quality}`]);
      }

      command
        .on('end', () => {
          try {
            const outputBuffer = require('fs').readFileSync(tmpOutputPath);
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);

            resolve({
              buffer: outputBuffer,
              format,
              size: outputBuffer.length,
              compressionRatio: inputBuffer.length / outputBuffer.length,
            });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          try {
            require('fs').unlinkSync(tmpInputPath);
            require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
          } catch {}
          reject(new Error(`Failed to convert audio: ${err.message}`));
        })
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate multiple audio quality variants
 */
export async function generateAudioQualityVariants(
  inputBuffer: Buffer,
  format: AudioFormat = 'mp3'
): Promise<Record<string, Buffer>> {
  const qualities = [
    { name: 'high', bitrate: '320k' },
    { name: 'medium', bitrate: '192k' },
    { name: 'low', bitrate: '128k' },
  ];

  const variants: Record<string, Buffer> = {};

  for (const quality of qualities) {
    const variant = await convertAudio(inputBuffer, {
      format,
      bitrate: quality.bitrate,
    });

    variants[quality.name] = variant.buffer;
  }

  return variants;
}

/**
 * Optimize image for web (reduce file size while maintaining quality)
 */
export async function optimizeImageForWeb(
  inputBuffer: Buffer,
  targetFormat: ImageFormat = 'jpeg'
): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || 0;

  // Don't enlarge small images
  const maxWidth = Math.min(width, 2048);

  const optimized = await sharp(inputBuffer)
    .resize(maxWidth, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(targetFormat, {
      quality: 85,
      progressive: true,
      effort: 4,
    })
    .toBuffer();

  return optimized;
}

/**
 * Convert and optimize asset based on type
 */
export async function convertAndOptimizeAsset(
  inputBuffer: Buffer,
  assetType: 'image' | 'video' | 'audio',
  options: {
    generateVariants?: boolean;
    webOptimized?: boolean;
  } = {}
): Promise<{
  original: Buffer;
  optimized: Buffer;
  variants?: Record<string, Buffer>;
}> {
  const { generateVariants = false, webOptimized = true } = options;

  const result: {
    original: Buffer;
    optimized: Buffer;
    variants?: Record<string, Buffer>;
  } = {
    original: inputBuffer,
    optimized: inputBuffer,
  };

  if (assetType === 'image') {
    if (webOptimized) {
      result.optimized = await optimizeImageForWeb(inputBuffer);
    }

    if (generateVariants) {
      result.variants = await generateResponsiveImageVariants(inputBuffer);
    }
  } else if (assetType === 'video' && webOptimized) {
    result.optimized = (
      await convertVideo(inputBuffer, {
        format: 'mp4',
        preset: 'fast',
        bitrate: '2000k',
      })
    ).buffer;
  } else if (assetType === 'audio' && webOptimized) {
    result.optimized = (
      await convertAudio(inputBuffer, {
        format: 'mp3',
        bitrate: '192k',
      })
    ).buffer;
  }

  return result;
}
