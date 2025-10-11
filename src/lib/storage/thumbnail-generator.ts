/**
 * Thumbnail Generation Service
 * 
 * Generates thumbnails for images using Sharp with optimized settings
 * for the YES GODDESS platform
 */

import sharp from 'sharp'
import type { AssetType } from '@prisma/client'

/**
 * Thumbnail size configurations
 */
export const THUMBNAIL_SIZES = {
  small: { width: 200, height: 200 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
} as const

export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES

/**
 * Preview size configurations (for higher quality previews)
 */
export const PREVIEW_SIZES = {
  small: { width: 400, height: 400 },
  medium: { width: 800, height: 800 },
  large: { width: 1600, height: 1600 },
} as const

export interface ThumbnailResult {
  buffer: Buffer
  width: number
  height: number
  format: string
  size: number
}

export interface ThumbnailGenerationOptions {
  size: ThumbnailSize
  quality?: number // 1-100, default 85
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside' // default 'inside'
  format?: 'jpeg' | 'webp' | 'png' // default 'jpeg'
  background?: string // default 'white' for padding
}

/**
 * Generate thumbnail from image buffer
 */
export async function generateThumbnail(
  sourceBuffer: Buffer,
  options: ThumbnailGenerationOptions
): Promise<ThumbnailResult> {
  const sizeConfig = THUMBNAIL_SIZES[options.size]
  const quality = options.quality || 85
  const fit = options.fit || 'inside'
  const format = options.format || 'jpeg'
  const background = options.background || { r: 255, g: 255, b: 255, alpha: 1 }

  try {
    // Create sharp instance
    let pipeline = sharp(sourceBuffer)
      .resize(sizeConfig.width, sizeConfig.height, {
        fit,
        withoutEnlargement: true,
        background,
      })

    // Apply format-specific optimizations
    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({
          quality,
          progressive: true,
          mozjpeg: true,
        })
        break
      case 'webp':
        pipeline = pipeline.webp({
          quality,
          effort: 4,
        })
        break
      case 'png':
        pipeline = pipeline.png({
          quality,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        break
    }

    // Generate thumbnail
    const buffer = await pipeline.toBuffer({ resolveWithObject: false })
    const metadata = await sharp(buffer).metadata()

    return {
      buffer,
      width: metadata.width || sizeConfig.width,
      height: metadata.height || sizeConfig.height,
      format: metadata.format || format,
      size: buffer.length,
    }
  } catch (error) {
    throw new Error(
      `Failed to generate thumbnail: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Generate multiple thumbnail sizes
 */
export async function generateThumbnailVariants(
  sourceBuffer: Buffer,
  sizes: ThumbnailSize[] = ['small', 'medium', 'large']
): Promise<Record<ThumbnailSize, ThumbnailResult>> {
  const results: Partial<Record<ThumbnailSize, ThumbnailResult>> = {}

  await Promise.all(
    sizes.map(async (size) => {
      results[size] = await generateThumbnail(sourceBuffer, { size })
    })
  )

  return results as Record<ThumbnailSize, ThumbnailResult>
}

/**
 * Generate preview variants (higher quality than thumbnails)
 */
export async function generatePreviewVariants(
  sourceBuffer: Buffer,
  sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large']
): Promise<Record<string, ThumbnailResult>> {
  const results: Record<string, ThumbnailResult> = {}

  await Promise.all(
    sizes.map(async (size) => {
      const sizeConfig = PREVIEW_SIZES[size];
      
      const pipeline = sharp(sourceBuffer)
        .resize(sizeConfig.width, sizeConfig.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 90, // Higher quality for previews
          progressive: true,
          mozjpeg: true,
        });

      const buffer = await pipeline.toBuffer({ resolveWithObject: false });
      const metadata = await sharp(buffer).metadata();

      results[size] = {
        buffer,
        width: metadata.width || sizeConfig.width,
        height: metadata.height || sizeConfig.height,
        format: 'jpeg',
        size: buffer.length,
      };
    })
  );

  return results;
}

/**
 * Extract metadata from image
 */
export async function extractImageMetadata(buffer: Buffer): Promise<{
  width: number
  height: number
  format: string
  space: string
  channels: number
  hasAlpha: boolean
  exif?: Record<string, any>
}> {
  const metadata = await sharp(buffer).metadata()

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    space: metadata.space || 'unknown',
    channels: metadata.channels || 0,
    hasAlpha: metadata.hasAlpha || false,
    exif: metadata.exif,
  }
}

/**
 * Validate image can be processed
 */
export async function validateImage(buffer: Buffer): Promise<{
  isValid: boolean
  error?: string
  metadata?: sharp.Metadata
}> {
  try {
    const metadata = await sharp(buffer).metadata()

    // Check if image has valid dimensions
    if (!metadata.width || !metadata.height) {
      return {
        isValid: false,
        error: 'Image has no dimensions',
      }
    }

    // Check minimum dimensions (e.g., 10x10)
    if (metadata.width < 10 || metadata.height < 10) {
      return {
        isValid: false,
        error: 'Image dimensions too small',
      }
    }

    // Check maximum dimensions (e.g., 50000x50000)
    if (metadata.width > 50000 || metadata.height > 50000) {
      return {
        isValid: false,
        error: 'Image dimensions too large',
      }
    }

    return {
      isValid: true,
      metadata,
    }
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid image: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Check if asset type supports thumbnail generation
 */
export function supportsThumbnailGeneration(assetType: AssetType): boolean {
  return assetType === 'IMAGE'
}

/**
 * Get content type for thumbnail format
 */
export function getThumbnailContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    png: 'image/png',
  }
  return contentTypes[format.toLowerCase()] || 'image/jpeg'
}
