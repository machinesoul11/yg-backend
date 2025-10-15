import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { r2Storage } from '@/lib/storage';
import { generateThumbnail } from '@/lib/storage/thumbnail-generator';

import type {
  MediaItem,
  MediaCollection,
  MediaUploadResponse,
  MediaListResponse,
  MediaCollectionResponse,
  CreateMediaCollectionRequest,
  UpdateMediaItemRequest,
  BulkOperationRequest,
  BulkOperationResponse,
  MediaUsageStats,
  MediaSearchFilters,
  OptimizationOptions
} from '../types';

import {
  MediaNotFoundError,
  MediaUploadError,
  MediaProcessingError,
  MediaAccessDeniedError,
  MediaCollectionNotFoundError,
  MediaBulkOperationError
} from '../errors';

export class MediaService {
  constructor(private prisma: PrismaClient) {}

  // ========================================
  // UPLOAD & PROCESSING
  // ========================================

  async uploadMedia(
    file: Buffer,
    filename: string,
    mimeType: string,
    uploadedBy: string,
    options: {
      title?: string;
      altText?: string;
      description?: string;
      tags?: string[];
      collectionId?: string;
      accessLevel?: 'PUBLIC' | 'INTERNAL' | 'ADMIN_ONLY' | 'RESTRICTED';
      generateVariants?: boolean;
    } = {}
  ): Promise<MediaUploadResponse> {
    const startTime = Date.now();
    logger.info('Starting media upload', { filename, mimeType, uploadedBy });

    try {
      // Generate unique storage key
      const fileExtension = this.extractFileExtension(filename);
      const storageKey = `media/${uuidv4()}${fileExtension}`;
      
      // Determine media type
      const mediaType = this.determineMediaType(mimeType);
      
      // Get file size
      const fileSize = file.length;
      
      // Extract image dimensions if applicable
      let width: number | undefined;
      let height: number | undefined;
      let metadata: any = {};
      let colorPalette: any[] | undefined;
      let averageColor: string | undefined;
      let dominantColor: string | undefined;

      if (mediaType === 'IMAGE') {
        try {
          const sharpImage = sharp(file);
          const imageMetadata = await sharpImage.metadata();
          width = imageMetadata.width;
          height = imageMetadata.height;
          metadata.exif = imageMetadata.exif;
          metadata.format = imageMetadata.format;
          metadata.density = imageMetadata.density;
          metadata.channels = imageMetadata.channels;
          metadata.hasProfile = imageMetadata.hasProfile;
          metadata.hasAlpha = imageMetadata.hasAlpha;

          // Extract color information
          const stats = await sharpImage.stats();
          if (stats.channels && stats.channels.length >= 3) {
            const [r, g, b] = stats.channels;
            averageColor = this.rgbToHex(
              Math.round(r.mean),
              Math.round(g.mean),
              Math.round(b.mean)
            );
            dominantColor = this.rgbToHex(
              Math.round(r.max),
              Math.round(g.max),
              Math.round(b.max)
            );
          }
        } catch (error) {
          logger.warn('Failed to extract image metadata', { error, filename });
        }
      }

      // Upload to storage
      const uploadResult = await r2Storage.uploadFile({
        key: storageKey,
        buffer: file,
        contentType: mimeType,
        metadata: {
          originalName: filename,
          uploadedBy,
          mediaType
        }
      });

      // Generate CDN URL
      const cdnUrl = `${process.env.CDN_DOMAIN}/${storageKey}`;

      // Create database record
      const mediaItem = await this.prisma.mediaItem.create({
        data: {
          filename: this.sanitizeFilename(filename),
          originalName: filename,
          storageKey,
          mimeType,
          fileSize: BigInt(fileSize),
          width,
          height,
          type: mediaType,
          status: 'PROCESSING',
          uploadedBy,
          title: options.title,
          altText: options.altText,
          description: options.description,
          tags: options.tags || [],
          metadata,
          cdnUrl,
          colorPalette,
          averageColor,
          dominantColor,
          accessLevel: options.accessLevel || 'ADMIN_ONLY'
        }
      });

      // Generate variants asynchronously if requested
      if (options.generateVariants !== false && mediaType === 'IMAGE') {
        this.generateImageVariants(mediaItem.id, file, storageKey).catch(error => {
          logger.error('Failed to generate image variants', { error, mediaItemId: mediaItem.id });
        });
      }

      // Generate thumbnail asynchronously
      this.generateThumbnail(mediaItem.id, file, mimeType, storageKey).catch(error => {
        logger.error('Failed to generate thumbnail', { error, mediaItemId: mediaItem.id });
      });

      // Add to collection if specified
      if (options.collectionId) {
        await this.addToCollection(mediaItem.id, options.collectionId, uploadedBy).catch(error => {
          logger.warn('Failed to add to collection during upload', { error, mediaItemId: mediaItem.id });
        });
      }

      // Update status to available
      await this.prisma.mediaItem.update({
        where: { id: mediaItem.id },
        data: { status: 'AVAILABLE' }
      });

      const processingTime = Date.now() - startTime;
      logger.info('Media upload completed', { 
        mediaItemId: mediaItem.id, 
        filename, 
        processingTime,
        fileSize 
      });

      return {
        success: true,
        mediaItem: this.formatMediaItem(mediaItem),
        processingTime
      };

    } catch (error) {
      logger.error('Media upload failed', { error, filename, uploadedBy });
      throw new MediaUploadError(`Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========================================
  // VARIANT GENERATION
  // ========================================

  private async generateImageVariants(
    mediaItemId: string,
    originalBuffer: Buffer,
    originalStorageKey: string
  ): Promise<void> {
    try {
      const variants = [
        { type: 'THUMBNAIL', width: 150, height: 150, quality: 85 },
        { type: 'SMALL', width: 400, quality: 85 },
        { type: 'MEDIUM', width: 800, quality: 90 },
        { type: 'LARGE', width: 1200, quality: 95 },
        { type: 'WEBP', quality: 85, format: 'webp' }
      ] as const;

      const variantPromises = variants.map(async variant => {
        try {
          let sharpImage = sharp(originalBuffer);

          // Apply transformations
          if (variant.width && variant.height) {
            sharpImage = sharpImage.resize(variant.width, variant.height, { 
              fit: 'cover',
              position: 'center'
            });
          } else if (variant.width) {
            sharpImage = sharpImage.resize(variant.width, undefined, { 
              fit: 'inside',
              withoutEnlargement: true
            });
          }

          // Set format and quality
          if (variant.format === 'webp') {
            sharpImage = sharpImage.webp({ quality: variant.quality });
          } else {
            sharpImage = sharpImage.jpeg({ quality: variant.quality || 85 });
          }

          const processedBuffer = await sharpImage.toBuffer();
          const metadata = await sharpImage.metadata();

          // Generate variant storage key
          const extension = variant.format === 'webp' ? '.webp' : '.jpg';
          const variantKey = originalStorageKey.replace(/\.[^.]+$/, `_${variant.type.toLowerCase()}${extension}`);

          // Upload variant
          await r2Storage.uploadFile({
            key: variantKey,
            buffer: processedBuffer,
            contentType: variant.format === 'webp' ? 'image/webp' : 'image/jpeg',
            metadata: {
              mediaItemId,
              variantType: variant.type,
              generated: 'true'
            }
          });

          // Save variant record
          await this.prisma.mediaVariant.create({
            data: {
              originalMediaId: mediaItemId,
              variantType: variant.type,
              filename: `${variant.type.toLowerCase()}${extension}`,
              storageKey: variantKey,
              mimeType: variant.format === 'webp' ? 'image/webp' : 'image/jpeg',
              fileSize: BigInt(processedBuffer.length),
              width: metadata.width,
              height: metadata.height,
              quality: variant.quality,
              format: variant.format || 'jpeg',
              optimizations: ['resize', 'compress'],
              cdnUrl: `${process.env.CDN_DOMAIN}/${variantKey}`
            }
          });

          logger.debug('Generated image variant', { 
            mediaItemId, 
            variantType: variant.type,
            size: processedBuffer.length
          });

        } catch (error) {
          logger.error('Failed to generate variant', { 
            error, 
            mediaItemId, 
            variantType: variant.type 
          });
        }
      });

      await Promise.allSettled(variantPromises);
      logger.info('Completed variant generation', { mediaItemId });

    } catch (error) {
      logger.error('Variant generation failed', { error, mediaItemId });
    }
  }

  private async generateThumbnail(
    mediaItemId: string,
    buffer: Buffer,
    mimeType: string,
    storageKey: string
  ): Promise<void> {
    try {
      const thumbnailResult = await generateThumbnail(buffer, mimeType);
      if (!thumbnailResult) return;

      const thumbnailKey = storageKey.replace(/\.[^.]+$/, '_thumb.jpg');
      
      await r2Storage.uploadFile({
        key: thumbnailKey,
        buffer: thumbnailResult.buffer,
        contentType: 'image/jpeg',
        metadata: {
          mediaItemId,
          type: 'thumbnail'
        }
      });

      const thumbnailUrl = `${process.env.CDN_DOMAIN}/${thumbnailKey}`;

      await this.prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { thumbnailUrl }
      });

      logger.debug('Generated thumbnail', { mediaItemId, thumbnailUrl });

    } catch (error) {
      logger.error('Thumbnail generation failed', { error, mediaItemId });
    }
  }

  // ========================================
  // RETRIEVAL & SEARCH
  // ========================================

  async getMediaItems(
    filters: MediaSearchFilters = {},
    userId: string,
    page = 1,
    limit = 50
  ): Promise<MediaListResponse> {
    try {
      const offset = (page - 1) * limit;
      
      // Build where clause
      const where: any = {
        deletedAt: null
      };

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.accessLevel) {
        where.accessLevel = filters.accessLevel;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = {
          hasEvery: filters.tags
        };
      }

      if (filters.mimeTypes && filters.mimeTypes.length > 0) {
        where.mimeType = {
          in: filters.mimeTypes
        };
      }

      if (filters.dateRange) {
        where.createdAt = {};
        if (filters.dateRange.from) {
          where.createdAt.gte = filters.dateRange.from;
        }
        if (filters.dateRange.to) {
          where.createdAt.lte = filters.dateRange.to;
        }
      }

      if (filters.sizeRange) {
        where.fileSize = {};
        if (filters.sizeRange.min) {
          where.fileSize.gte = BigInt(filters.sizeRange.min);
        }
        if (filters.sizeRange.max) {
          where.fileSize.lte = BigInt(filters.sizeRange.max);
        }
      }

      if (filters.uploadedBy) {
        where.uploadedBy = filters.uploadedBy;
      }

      if (filters.search) {
        where.OR = [
          { filename: { contains: filters.search, mode: 'insensitive' } },
          { originalName: { contains: filters.search, mode: 'insensitive' } },
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { altText: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      // Build order by
      const orderBy: any = {};
      if (filters.sortBy) {
        orderBy[filters.sortBy] = filters.sortOrder || 'desc';
      } else {
        orderBy.createdAt = 'desc';
      }

      // Execute query
      const [items, total] = await Promise.all([
        this.prisma.mediaItem.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            uploader: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            variants: true,
            collections: {
              include: {
                collection: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              }
            }
          }
        }),
        this.prisma.mediaItem.count({ where })
      ]);

      return {
        items: items.map(item => this.formatMediaItem(item)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters: filters
      };

    } catch (error) {
      logger.error('Failed to get media items', { error, filters, userId });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve media items'
      });
    }
  }

  async getMediaItem(id: string, userId: string): Promise<MediaItem> {
    try {
      const item = await this.prisma.mediaItem.findFirst({
        where: {
          id,
          deletedAt: null
        },
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          variants: true,
          collections: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  slug: true
                }
              }
            }
          }
        }
      });

      if (!item) {
        throw new MediaNotFoundError(id);
      }

      // Track access
      await this.trackUsage(id, 'VIEW', userId);

      return this.formatMediaItem(item);

    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw error;
      }
      logger.error('Failed to get media item', { error, id, userId });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve media item'
      });
    }
  }

  // ========================================
  // COLLECTIONS
  // ========================================

  async createCollection(
    data: CreateMediaCollectionRequest,
    userId: string
  ): Promise<MediaCollectionResponse> {
    try {
      const slug = this.generateSlug(data.name);
      
      // Check if slug already exists
      const existingCollection = await this.prisma.mediaCollection.findFirst({
        where: { slug, deletedAt: null }
      });

      if (existingCollection) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A collection with this name already exists'
        });
      }

      const collection = await this.prisma.mediaCollection.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          type: data.type || 'MANUAL',
          visibility: data.visibility || 'PRIVATE',
          rules: data.rules,
          createdBy: userId
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          items: {
            include: {
              mediaItem: true
            }
          }
        }
      });

      logger.info('Created media collection', { 
        collectionId: collection.id, 
        name: data.name, 
        userId 
      });

      return {
        success: true,
        collection: this.formatCollection(collection)
      };

    } catch (error) {
      logger.error('Failed to create collection', { error, data, userId });
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create collection'
      });
    }
  }

  async addToCollection(
    mediaItemId: string,
    collectionId: string,
    userId: string
  ): Promise<void> {
    try {
      // Verify media item exists and is accessible
      const mediaItem = await this.prisma.mediaItem.findFirst({
        where: { id: mediaItemId, deletedAt: null }
      });

      if (!mediaItem) {
        throw new MediaNotFoundError(mediaItemId);
      }

      // Verify collection exists
      const collection = await this.prisma.mediaCollection.findFirst({
        where: { id: collectionId, deletedAt: null }
      });

      if (!collection) {
        throw new MediaCollectionNotFoundError(collectionId);
      }

      // Check if already in collection
      const existing = await this.prisma.mediaCollectionItem.findFirst({
        where: {
          collectionId,
          mediaItemId
        }
      });

      if (existing) {
        return; // Already in collection
      }

      // Get next sort order
      const lastItem = await this.prisma.mediaCollectionItem.findFirst({
        where: { collectionId },
        orderBy: { sortOrder: 'desc' }
      });

      const sortOrder = (lastItem?.sortOrder || 0) + 1;

      // Add to collection
      await this.prisma.mediaCollectionItem.create({
        data: {
          collectionId,
          mediaItemId,
          sortOrder,
          addedBy: userId
        }
      });

      // Update collection stats
      await this.updateCollectionStats(collectionId);

      logger.info('Added media to collection', { 
        mediaItemId, 
        collectionId, 
        userId 
      });

    } catch (error) {
      if (error instanceof MediaNotFoundError || error instanceof MediaCollectionNotFoundError) {
        throw error;
      }
      logger.error('Failed to add to collection', { error, mediaItemId, collectionId, userId });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to add media to collection'
      });
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private determineMediaType(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'OTHER' {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/')) return 'DOCUMENT';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'ARCHIVE';
    return 'OTHER';
  }

  private extractFileExtension(filename: string): string {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  }

  private async trackUsage(
    mediaItemId: string,
    usageType: 'VIEW' | 'DOWNLOAD' | 'PREVIEW' | 'COPY_URL' | 'EMBED',
    userId: string,
    context?: { type: string; id?: string }
  ): Promise<void> {
    try {
      await Promise.all([
        // Create usage tracking record
        this.prisma.mediaUsageTracking.create({
          data: {
            mediaItemId,
            usageType,
            contextType: context?.type || 'direct',
            contextId: context?.id,
            usedBy: userId
          }
        }),
        // Update access counters
        this.prisma.mediaItem.update({
          where: { id: mediaItemId },
          data: {
            lastAccessedAt: new Date(),
            accessCount: { increment: 1 },
            ...(usageType === 'DOWNLOAD' && { downloadCount: { increment: 1 } })
          }
        })
      ]);
    } catch (error) {
      logger.warn('Failed to track media usage', { error, mediaItemId, usageType });
      // Don't throw - usage tracking is not critical
    }
  }

  private async updateCollectionStats(collectionId: string): Promise<void> {
    try {
      const stats = await this.prisma.mediaCollectionItem.aggregate({
        where: { collectionId },
        _count: { id: true }
      });

      const sizeStats = await this.prisma.mediaCollectionItem.aggregate({
        where: { collectionId },
        _sum: {
          mediaItem: {
            fileSize: true
          }
        }
      });

      await this.prisma.mediaCollection.update({
        where: { id: collectionId },
        data: {
          itemCount: stats._count.id,
          totalSize: sizeStats._sum.mediaItem?.fileSize || BigInt(0)
        }
      });
    } catch (error) {
      logger.warn('Failed to update collection stats', { error, collectionId });
    }
  }

  private formatMediaItem(item: any): MediaItem {
    return {
      ...item,
      fileSize: item.fileSize.toString(),
      uploader: item.uploader ? {
        id: item.uploader.id,
        name: item.uploader.name,
        email: item.uploader.email
      } : undefined,
      variants: item.variants?.map((variant: any) => ({
        ...variant,
        fileSize: variant.fileSize.toString()
      })) || [],
      collections: item.collections?.map((col: any) => col.collection) || []
    };
  }

  private formatCollection(collection: any): MediaCollection {
    return {
      ...collection,
      totalSize: collection.totalSize.toString(),
      creator: collection.creator ? {
        id: collection.creator.id,
        name: collection.creator.name,
        email: collection.creator.email
      } : undefined,
      items: collection.items?.map((item: any) => this.formatMediaItem(item.mediaItem)) || []
    };
  }
}
