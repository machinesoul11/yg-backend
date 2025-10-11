/**
 * Audio Processing Service
 * 
 * Handles comprehensive audio processing including:
 * - Waveform visualization generation
 * - Metadata extraction (ID3 tags, duration, bitrate)
 * - Audio format conversion
 * - Preview clip generation
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import { parseFile } from 'music-metadata';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface AudioMetadata {
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  codec: string;
  format: string;
  fileSize: number;
  // ID3 tags
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string[];
  trackNumber?: string;
  albumArtist?: string;
  composer?: string;
  comment?: string[];
}

export interface WaveformOptions {
  width?: number; // Width in pixels (default: 1800)
  height?: number; // Height in pixels (default: 280)
  colors?: {
    background?: string;
    waveform?: string;
    progress?: string;
  };
  samples?: number; // Number of samples (default: 1800)
}

export interface AudioPreviewOptions {
  duration?: number; // Duration in seconds (default: 30)
  startTime?: number; // Start time in seconds (default: 0)
  bitrate?: string; // Target bitrate like '128k'
  format?: 'mp3' | 'aac' | 'ogg';
}

export interface ProcessedAudioResult {
  waveform?: Buffer;
  metadata: AudioMetadata;
  previewClip?: Buffer;
}

/**
 * Extract audio metadata using music-metadata and ffprobe
 */
export async function extractAudioMetadata(inputPath: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, async (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to extract audio metadata: ${err.message}`));
        return;
      }

      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      if (!audioStream) {
        reject(new Error('No audio stream found in file'));
        return;
      }

      const baseMetadata: AudioMetadata = {
        duration: metadata.format.duration || 0,
        bitrate: metadata.format.bit_rate ? (typeof metadata.format.bit_rate === 'string' ? parseInt(metadata.format.bit_rate) : metadata.format.bit_rate) : 0,
        sampleRate: audioStream.sample_rate || 0,
        channels: audioStream.channels || 0,
        codec: audioStream.codec_name || 'unknown',
        format: metadata.format.format_name || 'unknown',
        fileSize: metadata.format.size || 0,
      };

      // Extract ID3 tags using music-metadata
      try {
        const musicMetadata = await parseFile(inputPath);
        const common = musicMetadata.common;

        baseMetadata.title = common.title;
        baseMetadata.artist = common.artist;
        baseMetadata.album = common.album;
        baseMetadata.year = common.year?.toString();
        baseMetadata.genre = common.genre;
        baseMetadata.trackNumber = common.track?.no?.toString();
        baseMetadata.albumArtist = common.albumartist;
        baseMetadata.composer = common.composer?.[0];
        baseMetadata.comment = common.comment?.map(c => typeof c === 'string' ? c : c.text).filter((c): c is string => !!c);
      } catch (error) {
        // ID3 tags not available or failed to parse
        console.warn('Failed to extract ID3 tags:', error);
      }

      resolve(baseMetadata);
    });
  });
}

/**
 * Generate waveform visualization from audio file
 * Note: This is a simplified implementation. For production, consider using
 * specialized libraries like wavesurfer.js (client-side) or audiowaveform
 */
export async function generateWaveform(
  inputBuffer: Buffer,
  options: WaveformOptions = {}
): Promise<Buffer> {
  const {
    width = 1800,
    height = 280,
    colors = {
      background: '#f3f4f6',
      waveform: '#6366f1',
      progress: '#4f46e5',
    },
    samples = 1800,
  } = options;

  // Write buffer to temporary file
  const tmpInputPath = `/tmp/audio-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/waveform-${Date.now()}.png`;

  try {
    require('fs').writeFileSync(tmpInputPath, inputBuffer);

    // Use ffmpeg to generate waveform
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpInputPath)
        .complexFilter([
          `[0:a]aformat=channel_layouts=mono,compand=gain=-6,showwavespic=s=${width}x${height}:colors=${colors.waveform}[fg]`,
          `color=s=${width}x${height}:color=${colors.background}[bg]`,
          `[bg][fg]overlay=format=auto,drawbox=x=(iw-w)/2:y=(ih-h)/2:w=iw:h=1:color=${colors.waveform}:t=1`,
        ])
        .outputOptions(['-frames:v 1'])
        .output(tmpOutputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const waveform = require('fs').readFileSync(tmpOutputPath);

    // Cleanup
    require('fs').unlinkSync(tmpInputPath);
    require('fs').unlinkSync(tmpOutputPath);

    return waveform;
  } catch (error) {
    // Cleanup on error
    try {
      require('fs').unlinkSync(tmpInputPath);
      require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
    } catch {}

    throw new Error(
      `Failed to generate waveform: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate simplified waveform using canvas (fallback)
 */
export async function generateSimpleWaveform(
  metadata: AudioMetadata,
  options: WaveformOptions = {}
): Promise<Buffer> {
  const { width = 1800, height = 280, colors = { background: '#f3f4f6', waveform: '#6366f1' } } = options;

  // Create SVG waveform visualization
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${colors.background}"/>
      <text x="${width / 2}" y="${height / 2 - 20}" font-family="Arial" font-size="24" fill="#6b7280" text-anchor="middle">
        🎵 Audio File
      </text>
      <text x="${width / 2}" y="${height / 2 + 20}" font-family="Arial" font-size="16" fill="#6b7280" text-anchor="middle">
        ${formatDuration(metadata.duration)} • ${Math.round(metadata.bitrate / 1000)}kbps
      </text>
      <line x1="50" y1="${height / 2}" x2="${width - 50}" y2="${height / 2}" stroke="${colors.waveform}" stroke-width="2"/>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

/**
 * Generate audio preview clip
 */
export async function generateAudioPreview(
  inputBuffer: Buffer,
  options: AudioPreviewOptions = {}
): Promise<Buffer> {
  const {
    duration = 30,
    startTime = 0,
    bitrate = '128k',
    format = 'mp3',
  } = options;

  const tmpInputPath = `/tmp/audio-preview-in-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/audio-preview-out-${Date.now()}.${format}`;

  return new Promise((resolve, reject) => {
    try {
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      const command = ffmpeg(tmpInputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioBitrate(bitrate)
        .output(tmpOutputPath);

      if (format === 'mp3') {
        command.audioCodec('libmp3lame');
      } else if (format === 'aac') {
        command.audioCodec('aac');
      } else if (format === 'ogg') {
        command.audioCodec('libvorbis');
      }

      command
        .on('end', () => {
          try {
            const preview = require('fs').readFileSync(tmpOutputPath);
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);
            resolve(preview);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          try {
            require('fs').unlinkSync(tmpInputPath);
            require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
          } catch {}
          reject(new Error(`Failed to generate audio preview: ${err.message}`));
        })
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Convert audio to web-optimized format
 */
export async function convertAudioToWebFormat(
  inputBuffer: Buffer,
  targetFormat: 'mp3' | 'aac' | 'ogg' = 'mp3',
  bitrate: string = '128k'
): Promise<Buffer> {
  const tmpInputPath = `/tmp/audio-convert-in-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/audio-convert-out-${Date.now()}.${targetFormat}`;

  return new Promise((resolve, reject) => {
    try {
      require('fs').writeFileSync(tmpInputPath, inputBuffer);

      const command = ffmpeg(tmpInputPath)
        .audioBitrate(bitrate)
        .output(tmpOutputPath);

      if (targetFormat === 'mp3') {
        command.audioCodec('libmp3lame').outputOptions(['-q:a 2']); // VBR quality 2
      } else if (targetFormat === 'aac') {
        command.audioCodec('aac');
      } else if (targetFormat === 'ogg') {
        command.audioCodec('libvorbis');
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
          reject(new Error(`Failed to convert audio: ${err.message}`));
        })
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Process audio file completely
 */
export async function processAudio(
  inputBuffer: Buffer,
  options: {
    extractMetadata?: boolean;
    generateWaveform?: boolean;
    generatePreview?: boolean;
  } = {}
): Promise<ProcessedAudioResult> {
  const {
    extractMetadata = true,
    generateWaveform: shouldGenerateWaveform = true,
    generatePreview = false,
  } = options;

  const result: ProcessedAudioResult = {
    metadata: {} as AudioMetadata,
  };

  const tmpPath = `/tmp/audio-process-${Date.now()}.tmp`;

  try {
    require('fs').writeFileSync(tmpPath, inputBuffer);

    // Extract metadata
    if (extractMetadata) {
      result.metadata = await extractAudioMetadata(tmpPath);
    }

    // Generate waveform
    if (shouldGenerateWaveform) {
      try {
        result.waveform = await generateWaveform(inputBuffer);
      } catch (error) {
        // Fallback to simple waveform
        console.warn('Failed to generate complex waveform, using fallback:', error);
        result.waveform = await generateSimpleWaveform(result.metadata);
      }
    }

    // Generate preview clip
    if (generatePreview) {
      result.previewClip = await generateAudioPreview(inputBuffer, {
        duration: 30,
        startTime: result.metadata.duration > 60 ? result.metadata.duration * 0.2 : 0,
      });
    }

    // Cleanup
    require('fs').unlinkSync(tmpPath);

    return result;
  } catch (error) {
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}
    throw error;
  }
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate audio file
 */
export async function validateAudio(inputBuffer: Buffer): Promise<{
  isValid: boolean;
  error?: string;
  metadata?: AudioMetadata;
}> {
  const tmpPath = `/tmp/audio-validate-${Date.now()}.tmp`;

  try {
    require('fs').writeFileSync(tmpPath, inputBuffer);
    const metadata = await extractAudioMetadata(tmpPath);
    require('fs').unlinkSync(tmpPath);

    if (metadata.duration === 0) {
      return {
        isValid: false,
        error: 'Audio file has no duration',
      };
    }

    if (metadata.duration > 3600) {
      return {
        isValid: false,
        error: 'Audio file exceeds maximum duration (1 hour)',
      };
    }

    return {
      isValid: true,
      metadata,
    };
  } catch (error) {
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}
    return {
      isValid: false,
      error: `Invalid audio file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
