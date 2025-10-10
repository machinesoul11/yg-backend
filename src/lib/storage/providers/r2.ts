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
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { IStorageProvider } from '../types'
import { StorageError } from '../types'

export class R2StorageProvider implements IStorageProvider {
  private client: S3Client
  private bucketName: string

  constructor(config: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
  }) {
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
  }): Promise<{ key: string; url: string; size: number }> {
    // Validate key format
    this.validateKey(params.key)

    // Create upload command
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.key,
      Body: params.file,
      ContentType: params.contentType,
      Metadata: params.metadata,
      // Enable server-side encryption
      ServerSideEncryption: 'AES256',
    })

    try {
      await this.client.send(command)

      // Get file size from response or calculate
      const size =
        params.file instanceof Buffer
          ? params.file.length
          : await this.getMetadata(params.key).then((m) => m.size)

      // Generate download URL (15 min expiry)
      const { url } = await this.getDownloadUrl({
        key: params.key,
        expiresIn: 900,
      })

      return {
        key: params.key,
        url,
        size,
      }
    } catch (error) {
      throw new StorageError('Upload failed', {
        key: params.key,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  async getUploadUrl(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
  }): Promise<{ uploadUrl: string; key: string }> {
    this.validateKey(params.key)

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
  }

  async getDownloadUrl(params: {
    key: string
    expiresIn?: number
    filename?: string
  }): Promise<{ url: string; expiresAt: Date }> {
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
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })

    await this.client.send(command)
  }

  async deleteBatch(
    keys: string[]
  ): Promise<{ deleted: string[]; failed: string[] }> {
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
          ...(response.Deleted?.map((d: any) => d.Key!) || [])
        )
        failed.push(...(response.Errors?.map((e: any) => e.Key!) || []))
      } catch (error) {
        failed.push(...chunk)
      }
    }

    return { deleted, failed }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getMetadata(key)
      return true
    } catch (error) {
      return false
    }
  }

  async getMetadata(key: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
  }> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })

    const response = await this.client.send(command)

    return {
      size: response.ContentLength!,
      contentType: response.ContentType!,
      lastModified: response.LastModified!,
      etag: response.ETag!.replace(/"/g, ''),
    }
  }

  async list(params: {
    prefix?: string
    maxResults?: number
    continuationToken?: string
  }): Promise<{
    items: Array<{ key: string; size: number; lastModified: Date }>
    continuationToken?: string
  }> {
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
  }

  async copy(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${params.sourceKey}`,
      Key: params.destinationKey,
    })

    await this.client.send(command)

    return { key: params.destinationKey }
  }

  async move(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    // Copy then delete source
    await this.copy(params)
    await this.delete(params.sourceKey)

    return { key: params.destinationKey }
  }

  // Helper methods
  private validateKey(key: string): void {
    if (!key || key.length === 0) {
      throw new StorageError('Storage key cannot be empty')
    }
    if (key.includes('..')) {
      throw new StorageError('Storage key cannot contain path traversal')
    }
    if (key.length > 1024) {
      throw new StorageError('Storage key too long (max 1024 characters)')
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
