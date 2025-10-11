/**
 * Cloudflare R2 Storage Provider
 * 
 * S3-compatible storage implementation for Cloudflare R2
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { BaseStorageProvider, StorageError, StorageErrorCode, ProgressCallback } from '../base'
import { storageConfig } from '../../config/storage'

export class R2StorageProvider extends BaseStorageProvider {
  private client: S3Client
  private bucketName: string
  // Multipart upload threshold: 100MB
  private static readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024
  // Multipart chunk size: 10MB (configurable via env)
  private static readonly MULTIPART_CHUNK_SIZE = parseInt(
    process.env.R2_MULTIPART_CHUNK_SIZE || '10485760'
  ) // 10MB default
  // Concurrent upload limit
  private static readonly MAX_CONCURRENT_UPLOADS = parseInt(
    process.env.R2_MAX_CONCURRENT_PARTS || '3'
  )
  // Progress callback throttle (ms)
  private static readonly PROGRESS_THROTTLE_MS = parseInt(
    process.env.R2_PROGRESS_THROTTLE_MS || '200'
  )

  constructor(config: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
  }) {
    super('r2')
    
    // R2 endpoint format: https://{accountId}.r2.cloudflarestorage.com
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
    this.bucketName = config.bucketName
  }

  async upload(params: {
    key: string
    file: Buffer | ReadableStream
    contentType: string
    metadata?: Record<string, string>
    progressCallback?: ProgressCallback
  }): Promise<{ key: string; url: string; size: number }> {
    return this.executeWithRetry(
      async () => {
        // Validate inputs using base class validation
        const keyValidation = this.validateKey(params.key)
        if (!keyValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_KEY,
            keyValidation.errors.join(', ')
          )
        }

        const contentTypeValidation = this.validateContentType(
          params.contentType,
          storageConfig.allowedTypes
        )
        if (!contentTypeValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_FILE_TYPE,
            contentTypeValidation.errors.join(', ')
          )
        }

        // Validate file size if it's a Buffer
        let fileSize = 0
        if (params.file instanceof Buffer) {
          fileSize = params.file.length
          const sizeValidation = this.validateFileSize(
            fileSize,
            storageConfig.maxFileSize
          )
          if (!sizeValidation.isValid) {
            throw new StorageError(
              StorageErrorCode.FILE_TOO_LARGE,
              sizeValidation.errors.join(', ')
            )
          }
        }

        // Set up progress tracking
        const operationId = `upload-${params.key}-${Date.now()}`
        if (params.progressCallback) {
          this.trackProgress(operationId, params.progressCallback)
        }

        try {
          let size: number

          // Use multipart upload for large files (Buffer only)
          if (
            params.file instanceof Buffer &&
            fileSize >= R2StorageProvider.MULTIPART_THRESHOLD
          ) {
            size = await this.uploadMultipart(
              params.key,
              params.file,
              params.contentType,
              params.metadata,
              operationId
            )
          } else {
            // Use regular upload for smaller files
            const command = new PutObjectCommand({
              Bucket: this.bucketName,
              Key: params.key,
              Body: params.file,
              ContentType: params.contentType,
              Metadata: params.metadata,
              // Enable server-side encryption
              ServerSideEncryption: 'AES256',
              // CDN caching headers
              CacheControl: this.getCacheControlHeader(params.key),
            })

            await this.client.send(command)

            // Get file size from response or calculate
            size =
              params.file instanceof Buffer
                ? params.file.length
                : await this.getMetadata(params.key).then((m) => m.size)
          }

          // Generate download URL (15 min expiry)
          const { url } = await this.getDownloadUrl({
            key: params.key,
            expiresIn: 900,
          })

          // Update progress to 100% if tracking
          if (params.progressCallback) {
            this.updateProgress(operationId, {
              bytesTransferred: size,
              totalBytes: size,
              operation: 'upload',
            })
            this.finishProgress(operationId)
          }

          return {
            key: params.key,
            url,
            size,
          }
        } catch (error) {
          this.finishProgress(operationId)
          throw StorageError.fromError(error, {
            operation: 'upload',
            key: params.key,
            provider: 'r2',
          })
        }
      },
      {
        operationType: 'upload',
        key: params.key,
        startTime: Date.now(),
        metadata: {
          fileSize: params.file instanceof Buffer ? params.file.length : 0,
          contentType: params.contentType,
        },
      }
    )
  }

  async getUploadUrl(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
  }): Promise<{ uploadUrl: string; key: string }> {
    return this.executeWithRetry(
      async () => {
        const keyValidation = this.validateKey(params.key)
        if (!keyValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_KEY,
            keyValidation.errors.join(', ')
          )
        }

        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: params.key,
          ContentType: params.contentType,
          // Optional: Add content length constraint
          ...(params.maxSizeBytes && {
            ContentLength: params.maxSizeBytes,
          }),
        })

        const uploadUrl = await getSignedUrl(this.client, command, {
          expiresIn: params.expiresIn || 900,
        })

        return { uploadUrl, key: params.key }
      },
      {
        operationType: 'getUploadUrl',
        key: params.key,
        startTime: Date.now(),
      }
    )
  }

  async getDownloadUrl(params: {
    key: string
    expiresIn?: number
    filename?: string
  }): Promise<{ url: string; expiresAt: Date }> {
    return this.executeWithRetry(
      async () => {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: params.key,
          // Suggest download filename
          ...(params.filename && {
            ResponseContentDisposition: `attachment; filename="${params.filename}"`,
          }),
        })

        const expiresIn = params.expiresIn || 900
        const url = await getSignedUrl(this.client, command, { expiresIn })
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        return { url, expiresAt }
      },
      {
        operationType: 'getDownloadUrl',
        key: params.key,
        startTime: Date.now(),
      }
    )
  }

  async delete(key: string): Promise<void> {
    return this.executeWithRetry(
      async () => {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })

        await this.client.send(command)
      },
      {
        operationType: 'delete',
        key,
        startTime: Date.now(),
      }
    )
  }

  async deleteBatch(
    keys: string[]
  ): Promise<{ deleted: string[]; failed: string[] }> {
    return this.executeWithRetry(
      async () => {
        // R2 supports batch delete of up to 1000 objects
        const chunks = this.chunkArray(keys, 1000)
        const deleted: string[] = []
        const failed: string[] = []

        for (const chunk of chunks) {
          const command = new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: chunk.map((key) => ({ Key: key })),
              Quiet: false,
            },
          })

          try {
            const response = await this.client.send(command)
            deleted.push(
              ...(response.Deleted?.map((d) => d.Key ?? '') || []).filter((key) => key !== '')
            )
            failed.push(...(response.Errors?.map((e) => e.Key ?? '') || []).filter((key) => key !== ''))
          } catch {
            failed.push(...chunk)
          }
        }

        return { deleted, failed }
      },
      {
        operationType: 'deleteBatch',
        startTime: Date.now(),
        metadata: { keyCount: keys.length },
      }
    )
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getMetadata(key)
      return true
    } catch (error) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) {
        return false
      }
      throw error
    }
  }

  async getMetadata(key: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
  }> {
    return this.executeWithRetry(
      async () => {
        const command = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })

        try {
          const response = await this.client.send(command)

          return {
            size: response.ContentLength!,
            contentType: response.ContentType!,
            lastModified: response.LastModified!,
            etag: response.ETag!.replace(/"/g, ''),
          }
        } catch (error: any) {
          if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            throw new StorageError(
              StorageErrorCode.NOT_FOUND,
              `Object not found: ${key}`
            )
          }
          throw error
        }
      },
      {
        operationType: 'getMetadata',
        key,
        startTime: Date.now(),
      }
    )
  }

  async list(params: {
    prefix?: string
    maxResults?: number
    continuationToken?: string
  }): Promise<{
    items: Array<{ key: string; size: number; lastModified: Date }>
    continuationToken?: string
  }> {
    return this.executeWithRetry(
      async () => {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: params.prefix,
          MaxKeys: params.maxResults || 1000,
          ContinuationToken: params.continuationToken,
        })

        const response = await this.client.send(command)

        return {
          items:
            response.Contents?.map((item: any) => ({
              key: item.Key!,
              size: item.Size!,
              lastModified: item.LastModified!,
            })) || [],
          continuationToken: response.NextContinuationToken,
        }
      },
      {
        operationType: 'list',
        startTime: Date.now(),
        metadata: { prefix: params.prefix },
      }
    )
  }

  async copy(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    return this.executeWithRetry(
      async () => {
        const keyValidation = this.validateKey(params.destinationKey)
        if (!keyValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_KEY,
            keyValidation.errors.join(', ')
          )
        }

        const command = new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${params.sourceKey}`,
          Key: params.destinationKey,
        })

        await this.client.send(command)

        return { key: params.destinationKey }
      },
      {
        operationType: 'copy',
        key: params.destinationKey,
        startTime: Date.now(),
        metadata: { sourceKey: params.sourceKey },
      }
    )
  }

  async move(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    return this.executeWithRetry(
      async () => {
        // Copy then delete source
        await this.copy(params)
        await this.delete(params.sourceKey)

        return { key: params.destinationKey }
      },
      {
        operationType: 'move',
        key: params.destinationKey,
        startTime: Date.now(),
        metadata: { sourceKey: params.sourceKey },
      }
    )
  }

  /**
   * Get presigned POST for direct browser upload
   * Allows clients to upload files directly to R2 without routing through the server
   */
  async getPresignedPost(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
    conditions?: Array<any>
  }): Promise<{
    url: string
    fields: Record<string, string>
  }> {
    return this.executeWithRetry(
      async () => {
        const keyValidation = this.validateKey(params.key)
        if (!keyValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_KEY,
            keyValidation.errors.join(', ')
          )
        }

        const contentTypeValidation = this.validateContentType(
          params.contentType,
          storageConfig.allowedTypes
        )
        if (!contentTypeValidation.isValid) {
          throw new StorageError(
            StorageErrorCode.INVALID_FILE_TYPE,
            contentTypeValidation.errors.join(', ')
          )
        }

        // Build conditions array
        const conditions: Array<any> = params.conditions || []
        
        // Add content type condition
        conditions.push(['eq', '$Content-Type', params.contentType])
        
        // Add file size limit if specified
        if (params.maxSizeBytes) {
          conditions.push(['content-length-range', 0, params.maxSizeBytes])
        }

        // Add bucket condition
        conditions.push(['eq', '$bucket', this.bucketName])
        
        // Add key condition
        conditions.push(['eq', '$key', params.key])

        const { url, fields } = await createPresignedPost(this.client, {
          Bucket: this.bucketName,
          Key: params.key,
          Conditions: conditions,
          Fields: {
            'Content-Type': params.contentType,
          },
          Expires: params.expiresIn || 900, // 15 minutes default
        })

        return { url, fields }
      },
      {
        operationType: 'getPresignedPost',
        key: params.key,
        startTime: Date.now(),
      }
    )
  }

  /**
   * Multipart upload implementation for large files
   * Splits file into chunks and uploads them in PARALLEL with concurrency control
   */
  private async uploadMultipart(
    key: string,
    file: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
    operationId?: string
  ): Promise<number> {
    let uploadId: string | undefined

    try {
      // Step 1: Initiate multipart upload
      const createCommand = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: 'AES256',
        CacheControl: this.getCacheControlHeader(key),
      })

      const createResponse = await this.client.send(createCommand)
      uploadId = createResponse.UploadId

      if (!uploadId) {
        throw new StorageError(
          StorageErrorCode.UPLOAD_FAILED,
          'Failed to initiate multipart upload'
        )
      }

      // Step 2: Split file into chunks
      const chunks = this.splitIntoChunks(file, R2StorageProvider.MULTIPART_CHUNK_SIZE)
      const totalSize = file.length

      // Step 3: Upload parts with concurrency control
      const uploadedParts: Array<{ PartNumber: number; ETag: string }> = []
      let uploadedBytes = 0
      let lastProgressUpdate = 0

      // Create upload tasks
      const uploadTasks = chunks.map((chunk, index) => ({
        partNumber: index + 1,
        chunk,
      }))

      // Process uploads with concurrency limit
      const results = await this.processWithConcurrency(
        uploadTasks,
        R2StorageProvider.MAX_CONCURRENT_UPLOADS,
        async (task) => {
          const uploadPartCommand = new UploadPartCommand({
            Bucket: this.bucketName,
            Key: key,
            PartNumber: task.partNumber,
            UploadId: uploadId,
            Body: task.chunk,
          })

          const uploadPartResponse = await this.client.send(uploadPartCommand)
          
          if (!uploadPartResponse.ETag) {
            throw new StorageError(
              StorageErrorCode.UPLOAD_FAILED,
              `Failed to upload part ${task.partNumber}`
            )
          }

          // Update progress with throttling
          uploadedBytes += task.chunk.length
          if (operationId) {
            const now = Date.now()
            if (now - lastProgressUpdate >= R2StorageProvider.PROGRESS_THROTTLE_MS) {
              this.updateProgress(operationId, {
                bytesTransferred: uploadedBytes,
                totalBytes: totalSize,
                operation: 'upload',
              })
              lastProgressUpdate = now
            }
          }

          return {
            PartNumber: task.partNumber,
            ETag: uploadPartResponse.ETag,
          }
        }
      )

      // Sort parts by part number (required for completion)
      uploadedParts.push(...results)
      uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber)

      // Final progress update
      if (operationId) {
        this.updateProgress(operationId, {
          bytesTransferred: totalSize,
          totalBytes: totalSize,
          operation: 'upload',
        })
      }

      // Step 4: Complete multipart upload
      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: uploadedParts,
        },
      })

      await this.client.send(completeCommand)

      return totalSize
    } catch (error) {
      // Abort multipart upload on error
      if (uploadId) {
        try {
          const abortCommand = new AbortMultipartUploadCommand({
            Bucket: this.bucketName,
            Key: key,
            UploadId: uploadId,
          })
          await this.client.send(abortCommand)
        } catch (abortError) {
          console.error('Failed to abort multipart upload:', abortError)
        }
      }
      throw error
    }
  }

  /**
   * Process tasks with concurrency limit
   * Generic utility for parallel processing with max concurrent operations
   */
  private async processWithConcurrency<T, R>(
    tasks: T[],
    concurrencyLimit: number,
    processor: (task: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    const executing: Promise<void>[] = []

    for (const task of tasks) {
      const promise = processor(task).then((result) => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= concurrencyLimit) {
        await Promise.race(executing)
        // Remove completed promises
        executing.splice(
          executing.findIndex((p) => p === promise),
          1
        )
      }
    }

    // Wait for remaining tasks
    await Promise.all(executing)

    return results
  }

  /**
   * Get appropriate Cache-Control header based on file key
   * Implements aggressive caching for immutable assets
   */
  private getCacheControlHeader(key: string): string {
    // Original assets are immutable - use maximum cache duration
    if (key.startsWith('assets/') && key.includes('/original')) {
      return 'public, max-age=31536000, immutable' // 1 year
    }

    // Thumbnails and previews can be cached aggressively
    if (
      key.includes('thumbnail') ||
      key.includes('preview') ||
      key.startsWith('public/')
    ) {
      return 'public, max-age=2592000, immutable' // 30 days
    }

    // Temporary files should not be cached
    if (key.startsWith('temp/')) {
      return 'no-store, no-cache, must-revalidate'
    }

    // Documents can be cached with shorter duration
    if (key.startsWith('documents/')) {
      return 'public, max-age=86400' // 1 day
    }

    // Default caching for other assets
    return 'public, max-age=604800' // 7 days
  }

  /**
   * Split buffer into chunks for multipart upload
   */
  private splitIntoChunks(buffer: Buffer, chunkSize: number): Buffer[] {
    const chunks: Buffer[] = []
    let offset = 0

    while (offset < buffer.length) {
      const end = Math.min(offset + chunkSize, buffer.length)
      chunks.push(buffer.slice(offset, end))
      offset = end
    }

    return chunks
  }

  // Helper methods
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
