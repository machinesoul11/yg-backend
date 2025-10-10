/**
 * Storage Utility Functions
 * 
 * Helper functions for storage operations
 */

import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21)

/**
 * Generate unique asset storage key
 * Format: assets/{assetId}/{sanitizedFilename}
 */
export function generateAssetKey(assetId: string, filename: string): string {
  const sanitized = sanitizeFilename(filename)
  return `assets/${assetId}/${sanitized}`
}

/**
 * Generate thumbnail storage key
 */
export function generateThumbnailKey(
  assetId: string,
  variant: 'small' | 'medium' | 'large'
): string {
  return `assets/${assetId}/thumbnail_${variant}.jpg`
}

/**
 * Generate preview storage key
 */
export function generatePreviewKey(assetId: string, extension: string): string {
  return `assets/${assetId}/preview.${extension}`
}

/**
 * Generate temporary upload key
 */
export function generateTempKey(filename: string): string {
  const sanitized = sanitizeFilename(filename)
  const tempId = nanoid()
  return `temp/${tempId}_${sanitized}`
}

/**
 * Sanitize filename for storage
 * - Remove special characters
 * - Replace spaces with underscores
 * - Convert to lowercase
 * - Preserve extension
 */
export function sanitizeFilename(filename: string): string {
  // Extract extension
  const lastDotIndex = filename.lastIndexOf('.')
  const name = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename
  const ext = lastDotIndex > 0 ? filename.slice(lastDotIndex) : ''

  // Sanitize name
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100) // Limit length

  return sanitized + ext
}

/**
 * Parse storage key to extract components
 */
export function parseStorageKey(key: string): {
  prefix: string
  assetId?: string
  filename?: string
  variant?: string
} {
  const parts = key.split('/')

  if (parts.length < 2) {
    return { prefix: parts[0] }
  }

  const [prefix, assetId, filename] = parts

  // Check if it's a variant (thumbnail, preview)
  const variant = filename?.includes('thumbnail_')
    ? filename.split('_')[1].split('.')[0]
    : filename?.includes('preview')
      ? 'preview'
      : undefined

  return {
    prefix,
    assetId,
    filename,
    variant,
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * Validate file size
 */
export function validateFileSize(
  sizeBytes: number,
  maxSizeBytes: number
): boolean {
  return sizeBytes > 0 && sizeBytes <= maxSizeBytes
}

/**
 * Validate content type
 */
export function validateContentType(
  contentType: string,
  allowedTypes: string[]
): boolean {
  return allowedTypes.includes(contentType)
}

/**
 * Get asset type from content type
 */
export function getAssetTypeFromContentType(
  contentType: string
): 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO' {
  if (contentType.startsWith('image/')) return 'IMAGE'
  if (contentType.startsWith('video/')) return 'VIDEO'
  if (contentType.startsWith('audio/')) return 'AUDIO'
  return 'DOCUMENT'
}

/**
 * Get allowed content types for asset type
 */
export function getAllowedContentTypesForAssetType(
  assetType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO'
): string[] {
  const typeMap: Record<string, string[]> = {
    IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    VIDEO: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    DOCUMENT: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  }

  return typeMap[assetType] || []
}

/**
 * Generate CUID for asset IDs
 */
export function generateCuid(): string {
  return nanoid()
}
