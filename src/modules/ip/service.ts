import { PrismaClient, AssetStatus, AssetType, ScanStatus } from '@prisma/client';
import { IStorageProvider } from '@/lib/storage/types';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { uploadAnalyticsService } from '@/lib/services/upload-analytics.service';
import type { VirusScanJobData } from '@/jobs/asset-virus-scan.job';
import {
  IpAssetResponse,
  AssetListResponse,
  DownloadUrlResponse,
  PreviewUrlResponse,
  AssetMetadataResponse,
  AssetVariantsResponse,
  RegeneratePreviewResponse,
  UploadInitiationResponse,
  InitiateUploadInput,
  ConfirmUploadInput,
  UpdateAssetInput,
  UpdateStatusInput,
  ListAssetsInput,
  AssetServiceContext,
  ASSET_CONSTANTS,
} from './types';
import { AssetErrors } from './errors';
import {
  sanitizeFileName,
  getAssetTypeFromMime,
  validateStatusTransition,
} from './validation';

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * IP Asset Service
 * 
 * Core business logic for asset lifecycle management
 */
export class IpAssetService {
  constructor(
    private prisma: PrismaClient,
    private storageAdapter: IStorageProvider
  ) {}

  /**
   * Initiate upload: Generate signed URL and create draft asset record
   */
  async initiateUpload(
    ctx: AssetServiceContext,
    params: InitiateUploadInput
  ): Promise<UploadInitiationResponse> {
    const { userId } = ctx;
    const { fileName, fileSize, mimeType, projectId } = params;

    // Validate file constraints
    if (!ASSET_CONSTANTS.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw AssetErrors.invalidFileType(mimeType);
    }

    if (fileSize > ASSET_CONSTANTS.MAX_FILE_SIZE) {
      throw AssetErrors.fileSizeTooLarge(fileSize, ASSET_CONSTANTS.MAX_FILE_SIZE);
    }

    // Verify project ownership if projectId provided
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          brand: {
            userId,
          },
          deletedAt: null,
        },
      });

      if (!project) {
        throw AssetErrors.accessDenied(projectId);
      }
    }

    // Generate asset ID and storage key
    const assetId = generateId();
    const sanitized = sanitizeFileName(fileName);
    const storageKey = `${userId}/${assetId}/${sanitized}`;

    // Determine asset type from MIME
    const assetType = getAssetTypeFromMime(mimeType);

    // Create draft asset record
    await this.prisma.ipAsset.create({
      data: {
        id: assetId,
        projectId: projectId || null,
        title: fileName, // Will be updated on confirmation
        type: assetType,
        storageKey,
        fileSize: BigInt(fileSize),
        mimeType,
        status: AssetStatus.DRAFT,
        scanStatus: ScanStatus.PENDING,
        createdBy: userId,
      },
    });

    // Generate signed upload URL
    const { uploadUrl } = await this.storageAdapter.getUploadUrl({
      key: storageKey,
      contentType: mimeType,
      expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
      maxSizeBytes: fileSize,
    });

    // Track upload initiation
    await uploadAnalyticsService.trackEvent({
      userId,
      assetId,
      eventType: 'initiated',
      fileSize,
      mimeType,
      timestamp: new Date(),
    });

    return {
      uploadUrl,
      assetId,
      storageKey,
    };
  }

  /**
   * Confirm upload: Update asset metadata and trigger processing jobs
   */
  async confirmUpload(
    ctx: AssetServiceContext,
    params: ConfirmUploadInput
  ): Promise<IpAssetResponse> {
    const { userId } = ctx;
    const { assetId, title, description, metadata } = params;

    // Verify asset exists and belongs to user
    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        createdBy: userId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify file exists in storage (optional verification)
    const exists = await this.storageAdapter.exists(asset.storageKey);
    if (!exists) {
      throw AssetErrors.uploadFailed('File not found in storage');
    }

    // Update asset with confirmation details
    const updatedAsset = await this.prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        title,
        description: description || null,
        metadata: (metadata || null) as any,
        status: AssetStatus.PROCESSING,
        updatedBy: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Queue virus scan job
    const virusScanQueue = new Queue<VirusScanJobData>('asset-virus-scan', {
      connection: redis,
    });
    
    await virusScanQueue.add('scan', {
      assetId,
      storageKey: asset.storageKey,
    }, {
      priority: 1, // High priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    // Track upload confirmation
    await uploadAnalyticsService.trackEvent({
      userId,
      assetId,
      eventType: 'confirmed',
      fileSize: Number(asset.fileSize),
      mimeType: asset.mimeType,
      timestamp: new Date(),
    });

    return this.formatAssetResponse(updatedAsset, ctx);
  }

  /**
   * List assets with filters and pagination
   */
  async listAssets(
    ctx: AssetServiceContext,
    params: ListAssetsInput
  ): Promise<AssetListResponse> {
    const { userId, userRole } = ctx;
    const {
      filters = {},
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    // Build where clause
    const where: any = {
      deletedAt: null,
    };

    // Row-level security: non-admins see only their assets
    if (userRole !== 'ADMIN') {
      where.createdBy = userId;
    }

    // Apply filters
    if (filters.projectId) {
      where.projectId = filters.projectId;
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.createdBy) {
      where.createdBy = filters.createdBy;
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.createdAt.lte = new Date(filters.toDate);
      }
    }

    // Full-text search
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Execute queries
    const [assets, total] = await Promise.all([
      this.prisma.ipAsset.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ipAsset.count({ where }),
    ]);

    // Format responses
    const data = await Promise.all(
      assets.map((asset) => this.formatAssetResponse(asset, ctx))
    );

    // TODO: Track event
    // eventTracker.track({
    //   event: 'asset.list.viewed',
    //   userId,
    //   metadata: { filters, total },
    // });

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
    };
  }

  /**
   * Get single asset with expanded relations
   */
  async getAssetById(
    ctx: AssetServiceContext,
    assetId: string
  ): Promise<IpAssetResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      // TODO: Check if user is licensee when licenses module is implemented
      throw AssetErrors.accessDenied(assetId);
    }

    // TODO: Track event
    // eventTracker.track({
    //   event: 'asset.viewed',
    //   userId,
    //   metadata: { assetId },
    // });

    return this.formatAssetResponse(asset, ctx);
  }

  /**
   * Update asset metadata
   */
  async updateAsset(
    ctx: AssetServiceContext,
    params: UpdateAssetInput
  ): Promise<IpAssetResponse> {
    const { userId, userRole } = ctx;
    const { id, title, description, metadata } = params;

    // Verify asset exists and user has permission
    const existing = await this.prisma.ipAsset.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw AssetErrors.notFound(id);
    }

    if (userRole !== 'ADMIN' && existing.createdBy !== userId) {
      throw AssetErrors.accessDenied(id);
    }

    // Update asset
    const updated = await this.prisma.ipAsset.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(metadata && { metadata }),
        updatedBy: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // TODO: Track event and create audit log
    // eventTracker.track({
    //   event: 'asset.updated',
    //   userId,
    //   metadata: { assetId: id, changes: { title, description, metadata } },
    // });

    return this.formatAssetResponse(updated, ctx);
  }

  /**
   * Change asset status (workflow state machine)
   */
  async updateStatus(
    ctx: AssetServiceContext,
    params: UpdateStatusInput
  ): Promise<IpAssetResponse> {
    const { userId, userRole } = ctx;
    const { id, status: newStatus, notes } = params;

    // Verify asset exists and user has permission
    const existing = await this.prisma.ipAsset.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw AssetErrors.notFound(id);
    }

    // Permission check
    const isCreator = existing.createdBy === userId;
    const canUpdate = userRole === 'ADMIN' || isCreator;
    
    if (!canUpdate) {
      throw AssetErrors.accessDenied(id);
    }

    // Validate status transition
    if (!validateStatusTransition(existing.status, newStatus)) {
      throw AssetErrors.invalidStatus(existing.status, newStatus);
    }

    // Update status
    const updated = await this.prisma.ipAsset.update({
      where: { id },
      data: {
        status: newStatus,
        updatedBy: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // TODO: Send notification if approved/rejected
    // if (newStatus === AssetStatus.APPROVED || newStatus === AssetStatus.REJECTED) {
    //   await notificationService.sendAssetStatusUpdate({
    //     userId: existing.createdBy,
    //     assetId: id,
    //     status: newStatus,
    //     notes,
    //   });
    // }

    // TODO: Track event and create audit log
    // eventTracker.track({
    //   event: 'asset.status.changed',
    //   userId,
    //   metadata: {
    //     assetId: id,
    //     oldStatus: existing.status,
    //     newStatus,
    //     notes,
    //   },
    // });

    return this.formatAssetResponse(updated, ctx);
  }

  /**
   * Soft delete asset
   */
  async deleteAsset(
    ctx: AssetServiceContext,
    assetId: string
  ): Promise<{ success: true }> {
    const { userId, userRole } = ctx;

    // Verify asset exists and user has permission
    const existing = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw AssetErrors.notFound(assetId);
    }

    if (userRole !== 'ADMIN' && existing.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    // TODO: Check for active licenses when licenses module is implemented
    // const hasActiveLicenses = await this.prisma.license.count({
    //   where: {
    //     assetId,
    //     status: 'ACTIVE',
    //   },
    // });
    // if (hasActiveLicenses > 0) {
    //   throw AssetErrors.hasActiveLicenses(assetId);
    // }

    // Soft delete
    await this.prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    // TODO: Queue cleanup job (delete file after 30 days)
    // await jobQueue.add(
    //   'asset:cleanup',
    //   { assetId, storageKey: existing.storageKey },
    //   { delay: 30 * 24 * 60 * 60 * 1000 } // 30 days
    // );

    // TODO: Track event and create audit log
    // eventTracker.track({
    //   event: 'asset.deleted',
    //   userId,
    //   metadata: { assetId },
    // });

    return { success: true };
  }

  /**
   * Generate time-limited download URL
   */
  async getDownloadUrl(
    ctx: AssetServiceContext,
    assetId: string
  ): Promise<DownloadUrlResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      // TODO: Check if user is licensee when licenses module is implemented
      throw AssetErrors.accessDenied(assetId);
    }

    // TODO: Check Redis cache for existing signed URL
    // const cacheKey = `asset:download:${assetId}:${userId}`;
    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    // Generate signed URL
    const { url, expiresAt } = await this.storageAdapter.getDownloadUrl({
      key: asset.storageKey,
      expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
      filename: asset.title,
    });

    const response: DownloadUrlResponse = {
      url,
      expiresAt: expiresAt.toISOString(),
    };

    // TODO: Cache URL in Redis
    // await redis.set(
    //   cacheKey,
    //   JSON.stringify(response),
    //   'EX',
    //   ASSET_CONSTANTS.SIGNED_URL_EXPIRY
    // );

    // TODO: Track event
    // eventTracker.track({
    //   event: 'asset.download.requested',
    //   userId,
    //   metadata: { assetId },
    // });

    return response;
  }

  /**
   * Get preview URL with size variant
   */
  async getPreviewUrl(
    ctx: AssetServiceContext,
    assetId: string,
    size: 'small' | 'medium' | 'large' | 'original' = 'medium'
  ): Promise<PreviewUrlResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    let storageKey: string;
    let width: number | undefined;
    let height: number | undefined;

    // Determine which preview to use based on size
    if (size === 'original' || !asset.metadata) {
      storageKey = asset.storageKey;
    } else {
      const metadata = asset.metadata as any;
      const thumbnails = metadata?.thumbnails || {};

      // Try to get the specific size thumbnail
      if (size === 'small' && thumbnails.small) {
        storageKey = this.extractKeyFromUrl(thumbnails.small);
        width = 200;
        height = 200;
      } else if (size === 'medium' && thumbnails.medium) {
        storageKey = this.extractKeyFromUrl(thumbnails.medium);
        width = 400;
        height = 400;
      } else if (size === 'large' && thumbnails.large) {
        storageKey = this.extractKeyFromUrl(thumbnails.large);
        width = 800;
        height = 800;
      } else {
        // Fallback to primary thumbnail or original
        storageKey = asset.thumbnailUrl 
          ? this.extractKeyFromUrl(asset.thumbnailUrl)
          : asset.storageKey;
      }
    }

    // Generate signed URL
    const { url, expiresAt } = await this.storageAdapter.getDownloadUrl({
      key: storageKey,
      expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
    });

    return {
      url,
      size,
      width,
      height,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get asset metadata with optional field filtering
   */
  async getAssetMetadata(
    ctx: AssetServiceContext,
    assetId: string,
    fields: string[] = ['all']
  ): Promise<AssetMetadataResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    const metadata = (asset.metadata as any) || {};
    const includeAll = fields.includes('all');

    const response: AssetMetadataResponse = {
      type: asset.type,
    };

    // Technical metadata (dimensions, codec, bitrate, etc.)
    if (includeAll || fields.includes('technical')) {
      response.technical = {
        ...(metadata.width && { width: metadata.width }),
        ...(metadata.height && { height: metadata.height }),
        ...(metadata.duration && { duration: metadata.duration }),
        ...(metadata.bitrate && { bitrate: metadata.bitrate }),
        ...(metadata.codec && { codec: metadata.codec }),
        ...(metadata.fps && { fps: metadata.fps }),
        ...(metadata.sampleRate && { sampleRate: metadata.sampleRate }),
        ...(metadata.channels && { channels: metadata.channels }),
        ...(metadata.format && { format: metadata.format }),
        ...(metadata.resolution && { resolution: metadata.resolution }),
        ...(metadata.colorSpace && { colorSpace: metadata.colorSpace }),
        ...(metadata.pageCount && { pageCount: metadata.pageCount }),
      };
    }

    // Descriptive metadata (title, artist, author, etc.)
    if (includeAll || fields.includes('descriptive')) {
      response.descriptive = {
        ...(metadata.title && { title: metadata.title }),
        ...(metadata.artist && { artist: metadata.artist }),
        ...(metadata.album && { album: metadata.album }),
        ...(metadata.author && { author: metadata.author }),
        ...(metadata.creator && { creator: metadata.creator }),
        ...(metadata.subject && { subject: metadata.subject }),
        ...(metadata.keywords && { keywords: metadata.keywords }),
        ...(metadata.genre && { genre: metadata.genre }),
      };
    }

    // Extracted metadata (EXIF, ID3 tags, etc.)
    if (includeAll || fields.includes('extracted')) {
      response.extracted = {
        ...(metadata.exif && { exif: metadata.exif }),
        ...(metadata.creationDate && { creationDate: metadata.creationDate }),
        ...(metadata.modificationDate && { modificationDate: metadata.modificationDate }),
      };
    }

    // Processing metadata (status, timestamps)
    if (includeAll || fields.includes('processing')) {
      response.processing = {
        thumbnailGenerated: metadata.thumbnailGenerated || false,
        thumbnailGeneratedAt: metadata.thumbnailGeneratedAt,
        previewGenerated: metadata.previewGenerated || false,
        previewGeneratedAt: metadata.previewGeneratedAt,
        metadataExtracted: !!metadata.processedAt,
        metadataExtractedAt: metadata.processedAt,
      };
    }

    return response;
  }

  /**
   * Get all available variants (thumbnails, previews, etc.)
   */
  async getAssetVariants(
    ctx: AssetServiceContext,
    assetId: string,
    type: 'thumbnail' | 'preview' | 'all' = 'all'
  ): Promise<AssetVariantsResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    const metadata = (asset.metadata as any) || {};
    const response: AssetVariantsResponse = {
      thumbnails: {},
      previews: {},
    };

    // Get thumbnail variants
    if (type === 'thumbnail' || type === 'all') {
      const thumbnails = metadata.thumbnails || {};
      
      for (const size of ['small', 'medium', 'large'] as const) {
        if (thumbnails[size]) {
          const key = this.extractKeyFromUrl(thumbnails[size]);
          const { url, expiresAt } = await this.storageAdapter.getDownloadUrl({
            key,
            expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
          });

          response.thumbnails[size] = {
            url,
            size,
            width: size === 'small' ? 200 : size === 'medium' ? 400 : 800,
            height: size === 'small' ? 200 : size === 'medium' ? 400 : 800,
            expiresAt: expiresAt.toISOString(),
          };
        }
      }
    }

    // Get preview variants
    if (type === 'preview' || type === 'all') {
      if (asset.previewUrl) {
        const key = this.extractKeyFromUrl(asset.previewUrl);
        const { url, expiresAt } = await this.storageAdapter.getDownloadUrl({
          key,
          expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
        });

        response.previews.url = url;
        response.previews.expiresAt = expiresAt.toISOString();
        
        if (metadata.previewDuration) {
          response.previews.duration = metadata.previewDuration;
        }
      }

      // Get waveform for audio assets
      if (asset.type === 'AUDIO' && metadata.waveformUrl) {
        const key = this.extractKeyFromUrl(metadata.waveformUrl);
        const { url, expiresAt } = await this.storageAdapter.getDownloadUrl({
          key,
          expiresIn: ASSET_CONSTANTS.SIGNED_URL_EXPIRY,
        });

        response.waveform = {
          url,
          expiresAt: expiresAt.toISOString(),
        };
      }
    }

    return response;
  }

  /**
   * Regenerate previews for an asset
   */
  async regeneratePreview(
    ctx: AssetServiceContext,
    assetId: string,
    types: string[] = ['all']
  ): Promise<RegeneratePreviewResponse> {
    const { userId, userRole } = ctx;

    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Verify access: creator or admin only
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    const includeAll = types.includes('all');
    const jobTypes: string[] = [];

    // Import job queues
    const { assetProcessingQueues } = await import('@/jobs/asset-processing-pipeline');

    // Queue thumbnail regeneration
    if (includeAll || types.includes('thumbnail')) {
      await assetProcessingQueues.thumbnail.add(
        `regenerate-thumbnail-${assetId}`,
        {
          assetId: asset.id,
          storageKey: asset.storageKey,
          type: asset.type,
          mimeType: asset.mimeType,
        },
        {
          priority: 5, // Higher priority for regeneration
          attempts: 3,
        }
      );
      jobTypes.push('thumbnail');
    }

    // Queue preview regeneration
    if ((includeAll || types.includes('preview')) && (asset.type === 'VIDEO' || asset.type === 'AUDIO')) {
      await assetProcessingQueues.preview.add(
        `regenerate-preview-${assetId}`,
        {
          assetId: asset.id,
          storageKey: asset.storageKey,
          type: asset.type,
          mimeType: asset.mimeType,
        },
        {
          priority: 5,
          attempts: 3,
        }
      );
      jobTypes.push('preview');
    }

    // Queue metadata extraction
    if (includeAll || types.includes('metadata')) {
      await assetProcessingQueues.metadata.add(
        `regenerate-metadata-${assetId}`,
        {
          assetId: asset.id,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          type: asset.type,
        },
        {
          priority: 5,
          attempts: 3,
        }
      );
      jobTypes.push('metadata');
    }

    return {
      jobId: `regenerate-${assetId}-${Date.now()}`,
      status: 'queued',
      types: jobTypes,
    };
  }

  /**
   * List derivatives of an asset
   */
  async getDerivatives(
    ctx: AssetServiceContext,
    parentAssetId: string
  ): Promise<IpAssetResponse[]> {
    const { userId, userRole } = ctx;

    // Verify parent asset exists and user has access
    const parent = await this.prisma.ipAsset.findFirst({
      where: {
        id: parentAssetId,
        deletedAt: null,
      },
    });

    if (!parent) {
      throw AssetErrors.notFound(parentAssetId);
    }

    if (userRole !== 'ADMIN' && parent.createdBy !== userId) {
      throw AssetErrors.accessDenied(parentAssetId);
    }

    // Get derivatives
    const derivatives = await this.prisma.ipAsset.findMany({
      where: {
        parentAssetId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        version: 'asc',
      },
    });

    return Promise.all(
      derivatives.map((asset) => this.formatAssetResponse(asset, ctx))
    );
  }

  /**
   * Get asset owners
   */
  async getAssetOwners(
    ctx: AssetServiceContext,
    assetId: string
  ): Promise<Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    shareBps: number;
    percentage: number;
    ownershipType: string;
    startDate: string;
    endDate: string | null;
  }>> {
    const { userId, userRole } = ctx;

    // Verify asset exists and user has access
    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    // Get current owners
    const now = new Date();
    const owners = await this.prisma.ipOwnership.findMany({
      where: {
        ipAssetId: assetId,
        startDate: { lte: now },
        OR: [
          { endDate: null },
          { endDate: { gte: now } },
        ],
      },
      include: {
        creator: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        shareBps: 'desc',
      },
    });

    return owners.map((owner) => ({
      id: owner.id,
      creatorId: owner.creatorId,
      creatorName: owner.creator.user.name || owner.creator.user.email,
      shareBps: owner.shareBps,
      percentage: owner.shareBps / 100,
      ownershipType: owner.ownershipType,
      startDate: owner.startDate.toISOString(),
      endDate: owner.endDate?.toISOString() || null,
    }));
  }

  /**
   * Add owner to asset
   */
  async addAssetOwner(
    ctx: AssetServiceContext,
    assetId: string,
    params: {
      creatorId: string;
      shareBps: number;
      ownershipType?: 'PRIMARY' | 'SECONDARY' | 'DERIVATIVE';
      contractReference?: string;
      legalDocUrl?: string;
      notes?: Record<string, any>;
    }
  ): Promise<{
    id: string;
    creatorId: string;
    shareBps: number;
    ownershipType: string;
  }> {
    const { userId, userRole } = ctx;

    // Verify asset exists and user has permission
    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    // Only admins or asset creator can add owners
    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    // Verify creator exists
    const creator = await this.prisma.creator.findUnique({
      where: { id: params.creatorId },
    });

    if (!creator) {
      throw new Error(`Creator ${params.creatorId} not found`);
    }

    // Check if total ownership would exceed 100%
    const currentOwners = await this.prisma.ipOwnership.findMany({
      where: {
        ipAssetId: assetId,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
    });

    const currentTotal = currentOwners.reduce((sum, o) => sum + o.shareBps, 0);
    if (currentTotal + params.shareBps > 10000) {
      throw new Error(
        `Adding ${params.shareBps} bps would exceed 100% (current: ${currentTotal} bps)`
      );
    }

    // Create ownership record
    const ownership = await this.prisma.ipOwnership.create({
      data: {
        ipAssetId: assetId,
        creatorId: params.creatorId,
        shareBps: params.shareBps,
        ownershipType: (params.ownershipType || 'SECONDARY') as any,
        contractReference: params.contractReference,
        legalDocUrl: params.legalDocUrl,
        notes: params.notes as any,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: ownership.id,
      creatorId: ownership.creatorId,
      shareBps: ownership.shareBps,
      ownershipType: ownership.ownershipType,
    };
  }

  /**
   * Get asset licenses
   */
  async getAssetLicenses(
    ctx: AssetServiceContext,
    assetId: string,
    statusFilter?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'ALL'
  ): Promise<Array<{
    id: string;
    brandId: string;
    brandName: string;
    status: string;
    startDate: string;
    endDate: string | null;
    terms: string | null;
    revenueCents: number;
  }>> {
    const { userId, userRole } = ctx;

    // Verify asset exists and user has access
    const asset = await this.prisma.ipAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw AssetErrors.notFound(assetId);
    }

    if (userRole !== 'ADMIN' && asset.createdBy !== userId) {
      throw AssetErrors.accessDenied(assetId);
    }

    // Build where clause for licenses
    const where: any = {
      ipAssetId: assetId,
    };

    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    // Get licenses
    const licenses = await this.prisma.license.findMany({
      where,
      include: {
        brand: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return licenses.map((license) => ({
      id: license.id,
      brandId: license.brandId,
      brandName: license.brand.user.name || license.brand.companyName,
      status: license.status,
      startDate: license.startDate.toISOString(),
      endDate: license.endDate?.toISOString() || null,
      terms: license.paymentTerms || null,
      revenueCents: Number(license.feeCents),
    }));
  }

  /**
   * Bulk status update (admin only)
   */
  async bulkUpdateStatus(
    ctx: AssetServiceContext,
    assetIds: string[],
    status: AssetStatus
  ): Promise<{ updated: number; errors: Array<{ id: string; error: string }> }> {
    const { userId, userRole } = ctx;

    if (userRole !== 'ADMIN') {
      throw AssetErrors.accessDenied('bulk update');
    }

    const errors: Array<{ id: string; error: string }> = [];
    let updated = 0;

    for (const id of assetIds) {
      try {
        await this.updateStatus(ctx, { id, status });
        updated++;
      } catch (error) {
        errors.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { updated, errors };
  }

  /**
   * Format asset for API response
   */
  private async formatAssetResponse(
    asset: any,
    ctx: AssetServiceContext
  ): Promise<IpAssetResponse> {
    const { userId, userRole } = ctx;

    const canEdit = userRole === 'ADMIN' || asset.createdBy === userId;
    const canDelete = canEdit;

    return {
      id: asset.id,
      projectId: asset.projectId,
      title: asset.title,
      description: asset.description,
      type: asset.type,
      fileSize: Number(asset.fileSize),
      mimeType: asset.mimeType,
      thumbnailUrl: asset.thumbnailUrl,
      previewUrl: asset.previewUrl,
      version: asset.version,
      parentAssetId: asset.parentAssetId,
      metadata: asset.metadata as Record<string, any> | null,
      status: asset.status,
      scanStatus: asset.scanStatus,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      canEdit,
      canDelete,
    };
  }

  /**
   * Extract storage key from URL
   */
  private extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Remove leading slash
      return pathname.startsWith('/') ? pathname.slice(1) : pathname;
    } catch {
      // If not a valid URL, assume it's already a key
      return url;
    }
  }
}
