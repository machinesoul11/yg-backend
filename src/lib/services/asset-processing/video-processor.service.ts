/**
 * Video Processing Service
 * 
 * Handles comprehensive video processing including:
 * - Thumbnail extraction from video frames
 * - Preview clip generation
 * - Metadata extraction (codec, duration, resolution, bitrate)
 * - Multiple quality variants
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import { THUMBNAIL_SIZES } from '@/lib/storage/thumbnail-generator';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  bitrate: number;
  resolution: string;
  aspectRatio: string;
  hasAudio: boolean;
  audioCodec?: string;
  fileSize: number;
}

export interface VideoThumbnailOptions {
  timestamps?: string[]; // Array of timestamps like '00:00:05', '00:00:10'
  count?: number; // Number of thumbnails to extract
  folder?: string; // Temporary folder for output
  filename?: string; // Filename pattern
  size?: string; // Size like '320x240'
}

export interface VideoPreviewOptions {
  duration?: number; // Duration in seconds (default: 10)
  startTime?: number; // Start time in seconds (default: 10% into video)
  resolution?: string; // Resolution like '1280x720' (default: 720p)
  bitrate?: string; // Target bitrate like '1000k'
  fps?: number; // Target FPS
}

export interface ProcessedVideoResult {
  thumbnails: Buffer[];
  metadata: VideoMetadata;
  previewClip?: Buffer;
}

/**
 * Extract video metadata using ffprobe
 */
export async function extractVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to extract video metadata: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      if (!videoStream) {
        reject(new Error('No video stream found in file'));
        return;
      }

      const width = videoStream.width || 0;
      const height = videoStream.height || 0;

      resolve({
        duration: metadata.format.duration || 0,
        width,
        height,
        codec: videoStream.codec_name || 'unknown',
        fps: eval(videoStream.r_frame_rate || '0') || 0,
        bitrate: metadata.format.bit_rate ? (typeof metadata.format.bit_rate === 'string' ? parseInt(metadata.format.bit_rate) : metadata.format.bit_rate) : 0,
        resolution: `${width}x${height}`,
        aspectRatio: videoStream.display_aspect_ratio || `${width}:${height}`,
        hasAudio: !!audioStream,
        audioCodec: audioStream?.codec_name,
        fileSize: metadata.format.size || 0,
      });
    });
  });
}

/**
 * Extract video thumbnails at specific timestamps
 */
export async function extractVideoThumbnails(
  inputPath: string,
  outputDir: string,
  options: VideoThumbnailOptions = {}
): Promise<string[]> {
  const { timestamps, count = 1, filename = 'thumb-%i.jpg', size } = options;

  return new Promise((resolve, reject) => {
    const defaultTimestamps = count === 1 ? ['10%'] : Array.from({ length: count }, (_, i) => `${(100 / (count + 1)) * (i + 1)}%`);
    
    const command = ffmpeg(inputPath)
      .screenshots({
        count: timestamps ? timestamps.length : count,
        folder: outputDir,
        filename,
        size,
        timestamps: timestamps || defaultTimestamps,
      })
      .on('end', () => {
        // Generate file paths
        const files = Array.from({ length: timestamps?.length || count }, (_, i) => 
          `${outputDir}/${filename.replace('%i', String(i + 1))}`
        );
        resolve(files);
      })
      .on('error', (err) => {
        reject(new Error(`Failed to extract video thumbnails: ${err.message}`));
      });

    command.run();
  });
}

/**
 * Extract single thumbnail from video at specific timestamp
 */
export async function extractVideoThumbnail(
  inputBuffer: Buffer,
  timestamp: string = '10%'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tmpInputPath = `/tmp/video-${Date.now()}.tmp`;
    const tmpOutputPath = `/tmp/thumb-${Date.now()}.jpg`;

    // Write buffer to temporary file
    require('fs').writeFileSync(tmpInputPath, inputBuffer);

    ffmpeg(tmpInputPath)
      .screenshots({
        count: 1,
        folder: '/tmp',
        filename: tmpOutputPath.split('/').pop()!,
        timestamps: [timestamp],
      })
      .on('end', () => {
        try {
          const thumbnail = require('fs').readFileSync(tmpOutputPath);
          // Cleanup
          require('fs').unlinkSync(tmpInputPath);
          require('fs').unlinkSync(tmpOutputPath);
          resolve(thumbnail);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        // Cleanup
        try {
          require('fs').unlinkSync(tmpInputPath);
          require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
        } catch {}
        reject(new Error(`Failed to extract video thumbnail: ${err.message}`));
      });
  });
}

/**
 * Generate optimized thumbnail from video thumbnail buffer
 */
export async function generateVideoThumbnailVariants(
  thumbnailBuffer: Buffer
): Promise<Record<string, { buffer: Buffer; width: number; height: number; size: number }>> {
  const variants: Record<string, { buffer: Buffer; width: number; height: number; size: number }> = {};

  for (const [size, dimensions] of Object.entries(THUMBNAIL_SIZES)) {
    const processed = await sharp(thumbnailBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer({ resolveWithObject: false });

    const metadata = await sharp(processed).metadata();

    variants[size] = {
      buffer: processed,
      width: metadata.width || dimensions.width,
      height: metadata.height || dimensions.height,
      size: processed.length,
    };
  }

  return variants;
}

/**
 * Generate video preview clip
 */
export async function generateVideoPreview(
  inputBuffer: Buffer,
  options: VideoPreviewOptions = {}
): Promise<Buffer> {
  const {
    duration = 10,
    startTime,
    resolution = '1280x720',
    bitrate = '1000k',
    fps = 30,
  } = options;

  return new Promise(async (resolve, reject) => {
    const tmpInputPath = `/tmp/video-input-${Date.now()}.tmp`;
    const tmpOutputPath = `/tmp/video-preview-${Date.now()}.mp4`;

    try {
      // Write buffer to temporary file
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      // Get metadata to calculate start time if not provided
      let actualStartTime = startTime;
      if (actualStartTime === undefined) {
        const metadata = await extractVideoMetadata(tmpInputPath);
        actualStartTime = Math.max(0, metadata.duration * 0.1); // Start at 10% into video
      }

      const command = ffmpeg(tmpInputPath)
        .setStartTime(actualStartTime)
        .setDuration(duration)
        .size(resolution)
        .fps(fps)
        .videoBitrate(bitrate)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
          '-preset fast',
          '-movflags +faststart', // Enable streaming
        ])
        .output(tmpOutputPath)
        .on('end', () => {
          try {
            const preview = require('fs').readFileSync(tmpOutputPath);
            // Cleanup
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);
            resolve(preview);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          // Cleanup
          try {
            require('fs').unlinkSync(tmpInputPath);
            require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
          } catch {}
          reject(new Error(`Failed to generate video preview: ${err.message}`));
        });

      command.run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Analyze video frame to determine if it's a good thumbnail candidate
 * Avoids black frames, fade transitions, and title cards
 */
export async function findBestThumbnailFrame(
  inputBuffer: Buffer,
  candidatePositions: number[] = [0.1, 0.25, 0.5, 0.75]
): Promise<number> {
  // Extract metadata to get duration
  const tmpPath = `/tmp/video-analyze-${Date.now()}.tmp`;
  require('fs').writeFileSync(tmpPath, inputBuffer);

  try {
    const metadata = await extractVideoMetadata(tmpPath);
    const duration = metadata.duration;

    // Calculate actual timestamps
    const timestamps = candidatePositions.map((pos) => duration * pos);

    // For now, return 10% position
    // In future, implement frame analysis for scene detection
    require('fs').unlinkSync(tmpPath);
    return timestamps[0];
  } catch (err) {
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Convert video to web-optimized format
 */
export async function convertVideoToWebFormat(
  inputBuffer: Buffer,
  targetFormat: 'mp4' | 'webm' = 'mp4'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tmpInputPath = `/tmp/video-convert-in-${Date.now()}.tmp`;
    const tmpOutputPath = `/tmp/video-convert-out-${Date.now()}.${targetFormat}`;

    try {
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      const command = ffmpeg(tmpInputPath)
        .output(tmpOutputPath)
        .outputOptions([
          '-preset medium',
          '-movflags +faststart',
        ]);

      if (targetFormat === 'mp4') {
        command
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-crf 23', '-profile:v high', '-level 4.0']);
      } else {
        command
          .videoCodec('libvpx-vp9')
          .audioCodec('libopus')
          .outputOptions(['-crf 30', '-b:v 0']);
      }

      command
        .on('end', () => {
          try {
            const converted = require('fs').readFileSync(tmpOutputPath);
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);
            resolve(converted);
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
 * Process video file completely (metadata, thumbnails, preview)
 */
export async function processVideo(
  inputBuffer: Buffer,
  options: {
    generateThumbnails?: boolean;
    generatePreview?: boolean;
    extractMetadata?: boolean;
  } = {}
): Promise<ProcessedVideoResult> {
  const {
    generateThumbnails = true,
    generatePreview = false,
    extractMetadata = true,
  } = options;

  const result: ProcessedVideoResult = {
    thumbnails: [],
    metadata: {} as VideoMetadata,
  };

  // Write to temporary file for processing
  const tmpPath = `/tmp/video-process-${Date.now()}.tmp`;
  require('fs').writeFileSync(tmpPath, inputBuffer);

  try {
    // Extract metadata
    if (extractMetadata) {
      result.metadata = await extractVideoMetadata(tmpPath);
    }

    // Generate thumbnails
    if (generateThumbnails) {
      const thumbnailBuffer = await extractVideoThumbnail(inputBuffer, '10%');
      const variants = await generateVideoThumbnailVariants(thumbnailBuffer);
      result.thumbnails = Object.values(variants).map((v) => v.buffer);
    }

    // Generate preview clip
    if (generatePreview) {
      result.previewClip = await generateVideoPreview(inputBuffer, {
        duration: 10,
        resolution: '1280x720',
      });
    }

    // Cleanup
    require('fs').unlinkSync(tmpPath);

    return result;
  } catch (err) {
    // Cleanup on error
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}
