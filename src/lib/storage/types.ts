/**
 * Storage Provider Interface
 * 
 * Abstract interface for storage operations to support multiple providers (R2, Azure Blob)
 */

import type { ProgressCallback } from './base'

export interface IStorageProvider {
  // Upload operations
  upload(params: {
    key: string
    file: Buffer | ReadableStream
    contentType: string
    metadata?: Record<string, string>
    progressCallback?: ProgressCallback
  }): Promise<{ key: string; url: string; size: number }>

  // Generate signed URL for direct frontend upload
  getUploadUrl(params: {
    key: string
    contentType: string
    expiresIn?: number // seconds, default 900 (15 min)
    maxSizeBytes?: number
  }): Promise<{ uploadUrl: string; key: string }>

  // Generate presigned POST for direct browser upload
  getPresignedPost(params: {
    key: string
    contentType: string
    expiresIn?: number // seconds, default 900 (15 min)
    maxSizeBytes?: number
    conditions?: Array<any>
  }): Promise<{
    url: string
    fields: Record<string, string>
  }>

  // Generate signed URL for download
  getDownloadUrl(params: {
    key: string
    expiresIn?: number // seconds, default 900 (15 min)
    filename?: string // suggested download filename
  }): Promise<{ url: string; expiresAt: Date }>

  // Delete operations
  delete(key: string): Promise<void>
  deleteBatch(keys: string[]): Promise<{ deleted: string[]; failed: string[] }>

  // Metadata operations
  exists(key: string): Promise<boolean>
  getMetadata(key: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
  }>

  // List/browse operations
  list(params: {
    prefix?: string
    maxResults?: number
    continuationToken?: string
  }): Promise<{
    items: Array<{ key: string; size: number; lastModified: Date }>
    continuationToken?: string
  }>

  // Copy/move operations
  copy(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }>

  move(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }>
}

/**
 * Storage Error Class
 * Re-exported from base.ts for compatibility
 */
export { StorageError, StorageErrorCode } from './base'

/**
 * Asset Metadata Interfaces
 */
export interface AssetMetadata {
  // Image metadata
  width?: number
  height?: number
  format?: string
  colorSpace?: string
  hasAlpha?: boolean
  exif?: Record<string, any>

  // Video metadata
  duration?: number
  codec?: string
  fps?: number
  bitrate?: number
  resolution?: string

  // Document metadata
  pageCount?: number
  author?: string
  title?: string

  // Audio metadata
  sampleRate?: number
  channels?: number

  // Processing metadata
  uploadedAt: string
  processedAt?: string
  virusScanResult?: 'clean' | 'infected' | 'pending'
  thumbnailGenerated?: boolean
  previewGenerated?: boolean
}

/**
 * Storage Configuration Types
 */
export interface StorageConfig {
  provider: 'r2' | 'azure'
  r2?: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
    publicUrl?: string
  }
  azure?: {
    accountName: string
    accountKey: string
    containerName: string
  }
  maxFileSize: number
  allowedTypes: string[]
  uploadUrlExpiry: number
  downloadUrlExpiry: number
}
