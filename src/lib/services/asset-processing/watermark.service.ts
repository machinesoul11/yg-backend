/**
 * Watermarking Service
 * 
 * Handles applying watermarks to assets including:
 * - Image watermarking (text and logo overlays)
 * - Video watermarking
 * - Configurable watermark positioning and styling
 * - Invisible watermarking (metadata embedding)
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'tiled';

export interface TextWatermarkOptions {
  text: string;
  position?: WatermarkPosition;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number; // 0-1
  padding?: number; // Pixels from edge
}

export interface LogoWatermarkOptions {
  logoBuffer: Buffer;
  position?: WatermarkPosition;
  scale?: number; // 0-1, relative to image size
  opacity?: number; // 0-1
  padding?: number; // Pixels from edge
  tileSpacing?: number; // For tiled watermarks
}

export interface VideoWatermarkOptions {
  type: 'text' | 'logo';
  text?: string;
  logoPath?: string;
  position?: WatermarkPosition;
  opacity?: number;
  scale?: number;
  dynamic?: boolean; // Move watermark position over time
}

export interface WatermarkMetadata {
  watermarked: boolean;
  watermarkType: 'text' | 'logo' | 'invisible';
  appliedAt: string;
  position?: WatermarkPosition;
  userId?: string; // For forensic watermarking
  sessionId?: string; // For forensic watermarking
}

/**
 * Apply text watermark to image
 */
export async function applyTextWatermarkToImage(
  imageBuffer: Buffer,
  options: TextWatermarkOptions
): Promise<Buffer> {
  const {
    text,
    position = 'bottom-right',
    fontSize = 24,
    fontFamily = 'Arial',
    color = 'white',
    opacity = 0.7,
    padding = 20,
  } = options;

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Calculate watermark position
  const { x, y, gravity } = calculatePosition(position, width, height, padding, {
    width: fontSize * text.length * 0.6,
    height: fontSize * 1.5,
  });

  // Create text SVG with shadow for better visibility
  const textSvg = `
    <svg width="${width}" height="${height}">
      <defs>
        <filter id="shadow">
          <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.5"/>
        </filter>
      </defs>
      <text
        x="${x}"
        y="${y}"
        font-family="${fontFamily}"
        font-size="${fontSize}"
        fill="${color}"
        fill-opacity="${opacity}"
        filter="url(#shadow)"
      >${escapeXml(text)}</text>
    </svg>
  `;

  return image
    .composite([
      {
        input: Buffer.from(textSvg),
        gravity: gravity as any,
      },
    ])
    .toBuffer();
}

/**
 * Apply logo watermark to image
 */
export async function applyLogoWatermarkToImage(
  imageBuffer: Buffer,
  options: LogoWatermarkOptions
): Promise<Buffer> {
  const {
    logoBuffer,
    position = 'bottom-right',
    scale = 0.1,
    opacity = 0.7,
    padding = 20,
    tileSpacing = 200,
  } = options;

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Resize logo
  const logoMetadata = await sharp(logoBuffer).metadata();
  const targetWidth = Math.floor(width * scale);
  const targetHeight = Math.floor(
    (logoMetadata.height || 0) * (targetWidth / (logoMetadata.width || 1))
  );

  const resizedLogo = await sharp(logoBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside' })
    .ensureAlpha()
    .toBuffer();

  if (position === 'tiled') {
    // Create tiled watermark
    const composites = [];
    for (let y = 0; y < height; y += tileSpacing) {
      for (let x = 0; x < width; x += tileSpacing) {
        composites.push({
          input: await sharp(resizedLogo)
            .modulate({ brightness: 1.2 })
            .composite([
              {
                input: Buffer.from(
                  `<svg><rect width="${targetWidth}" height="${targetHeight}" fill="white" opacity="${opacity * 0.5}"/></svg>`
                ),
                blend: 'multiply',
              },
            ])
            .toBuffer(),
          top: y,
          left: x,
        });
      }
    }
    return image.composite(composites).toBuffer();
  } else {
    // Single position watermark
    const { x, y, gravity } = calculatePosition(position, width, height, padding, {
      width: targetWidth,
      height: targetHeight,
    });

    const watermarkedLogo = await sharp(resizedLogo)
      .composite([
        {
          input: Buffer.from(
            `<svg><rect width="${targetWidth}" height="${targetHeight}" fill="white" opacity="${1 - opacity}"/></svg>`
          ),
          blend: 'dest-out',
        },
      ])
      .toBuffer();

    return image
      .composite([
        {
          input: watermarkedLogo,
          gravity: gravity as any,
          top: gravity === 'center' ? undefined : y,
          left: gravity === 'center' ? undefined : x,
        },
      ])
      .toBuffer();
  }
}

/**
 * Apply watermark to video
 */
export async function applyWatermarkToVideo(
  videoBuffer: Buffer,
  options: VideoWatermarkOptions
): Promise<Buffer> {
  const { type, text, logoPath, position = 'bottom-right', opacity = 0.7, scale = 0.1, dynamic = false } = options;

  const tmpInputPath = `/tmp/video-watermark-in-${Date.now()}.tmp`;
  const tmpOutputPath = `/tmp/video-watermark-out-${Date.now()}.mp4`;

  return new Promise((resolve, reject) => {
    try {
      require('fs').writeFileSync(tmpInputPath, videoBuffer);

      let filterComplex = '';

      if (type === 'text' && text) {
        // Text watermark
        const positionMap: Record<string, string> = {
          'top-left': 'x=10:y=10',
          'top-right': 'x=w-tw-10:y=10',
          'bottom-left': 'x=10:y=h-th-10',
          'bottom-right': 'x=w-tw-10:y=h-th-10',
          'center': 'x=(w-tw)/2:y=(h-th)/2',
        };

        const pos = dynamic
          ? 'x=if(lt(mod(t\\,10)\\,5)\\,10\\,w-tw-10):y=h-th-10' // Move every 5 seconds
          : positionMap[position] || positionMap['bottom-right'];

        filterComplex = `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=24:fontcolor=white@${opacity}:${pos}:shadowcolor=black@0.5:shadowx=2:shadowy=2`;
      } else if (type === 'logo' && logoPath) {
        // Logo watermark
        const positionMap: Record<string, string> = {
          'top-left': 'x=10:y=10',
          'top-right': 'x=W-w-10:y=10',
          'bottom-left': 'x=10:y=H-h-10',
          'bottom-right': 'x=W-w-10:y=H-h-10',
          'center': 'x=(W-w)/2:y=(H-h)/2',
        };

        const pos = positionMap[position] || positionMap['bottom-right'];
        filterComplex = `movie=${logoPath},scale=iw*${scale}:ih*${scale}[wm];[in][wm]overlay=${pos}:format=auto,colorchannelmixer=aa=${opacity}[out]`;
      }

      const command = ffmpeg(tmpInputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset fast', '-movflags +faststart'])
        .output(tmpOutputPath);

      if (filterComplex) {
        command.videoFilters(filterComplex);
      }

      command
        .on('end', () => {
          try {
            const watermarked = require('fs').readFileSync(tmpOutputPath);
            require('fs').unlinkSync(tmpInputPath);
            require('fs').unlinkSync(tmpOutputPath);
            resolve(watermarked);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          try {
            require('fs').unlinkSync(tmpInputPath);
            require('fs').existsSync(tmpOutputPath) && require('fs').unlinkSync(tmpOutputPath);
          } catch {}
          reject(new Error(`Failed to watermark video: ${err.message}`));
        })
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Embed invisible watermark metadata in image EXIF
 */
export async function embedInvisibleWatermark(
  imageBuffer: Buffer,
  metadata: WatermarkMetadata
): Promise<Buffer> {
  // Embed watermark data in EXIF metadata
  const watermarkData = JSON.stringify(metadata);

  return sharp(imageBuffer)
    .withMetadata({
      exif: {
        IFD0: {
          Copyright: watermarkData,
          Artist: metadata.userId || 'YesGoddess Platform',
        },
      },
    })
    .toBuffer();
}

/**
 * Extract invisible watermark from image
 */
export async function extractInvisibleWatermark(
  imageBuffer: Buffer
): Promise<WatermarkMetadata | null> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const copyright = (metadata.exif as any)?.Copyright;

    if (copyright) {
      const parsed = JSON.parse(copyright);
      return parsed as WatermarkMetadata;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate watermark position
 */
function calculatePosition(
  position: WatermarkPosition,
  imageWidth: number,
  imageHeight: number,
  padding: number,
  watermarkSize: { width: number; height: number }
): { x: number; y: number; gravity: string } {
  const { width: wmWidth, height: wmHeight } = watermarkSize;

  switch (position) {
    case 'top-left':
      return { x: padding, y: padding, gravity: 'northwest' };
    case 'top-right':
      return { x: imageWidth - wmWidth - padding, y: padding, gravity: 'northeast' };
    case 'bottom-left':
      return { x: padding, y: imageHeight - wmHeight - padding, gravity: 'southwest' };
    case 'bottom-right':
      return {
        x: imageWidth - wmWidth - padding,
        y: imageHeight - wmHeight - padding,
        gravity: 'southeast',
      };
    case 'center':
      return {
        x: (imageWidth - wmWidth) / 2,
        y: (imageHeight - wmHeight) / 2,
        gravity: 'center',
      };
    default:
      return {
        x: imageWidth - wmWidth - padding,
        y: imageHeight - wmHeight - padding,
        gravity: 'southeast',
      };
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate forensic watermark (unique per user/session)
 */
export function generateForensicWatermark(
  userId: string,
  sessionId: string,
  timestamp: Date = new Date()
): string {
  // Create a subtle identifier that can be embedded
  const hash = Buffer.from(`${userId}-${sessionId}-${timestamp.getTime()}`)
    .toString('base64')
    .substring(0, 16);
  return `© YG ${hash}`;
}

/**
 * Apply comprehensive watermarking based on asset configuration
 */
export async function applyAssetWatermark(
  buffer: Buffer,
  assetType: 'image' | 'video',
  config: {
    enabled: boolean;
    type: 'text' | 'logo' | 'both' | 'invisible';
    text?: string;
    logoBuffer?: Buffer;
    position?: WatermarkPosition;
    opacity?: number;
    userId?: string;
    sessionId?: string;
  }
): Promise<Buffer> {
  if (!config.enabled) {
    return buffer;
  }

  let result = buffer;

  if (assetType === 'image') {
    // Apply visible watermarks
    if (config.type === 'text' || config.type === 'both') {
      result = await applyTextWatermarkToImage(result, {
        text: config.text || '© YesGoddess',
        position: config.position,
        opacity: config.opacity,
      });
    }

    if (config.type === 'logo' || config.type === 'both') {
      if (config.logoBuffer) {
        result = await applyLogoWatermarkToImage(result, {
          logoBuffer: config.logoBuffer,
          position: config.position,
          opacity: config.opacity,
        });
      }
    }

    // Always apply invisible watermark for tracking
    if (config.userId || config.sessionId) {
      result = await embedInvisibleWatermark(result, {
        watermarked: true,
        watermarkType: config.type as any,
        appliedAt: new Date().toISOString(),
        position: config.position,
        userId: config.userId,
        sessionId: config.sessionId,
      });
    }
  } else if (assetType === 'video') {
    // Video watermarking
    if (config.type === 'text' && config.text) {
      result = await applyWatermarkToVideo(result, {
        type: 'text',
        text: config.text,
        position: config.position,
        opacity: config.opacity,
      });
    }
  }

  return result;
}
