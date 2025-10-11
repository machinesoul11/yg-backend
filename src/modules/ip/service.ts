import { PrismaClient, AssetStatus, AssetType, ScanStatus } from '@prisma/client';
import { IStorageProvider } from '@/lib/storage/types';
import { cuid } from '@paralleldrive/cuid2';
import {
  IpAssetResponse,
  AssetListResponse,
  DownloadUrlResponse,
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
            userId: userId,
          },
          deletedAt: null,
        },
      });

      if (!project) {
        throw AssetErrors.accessDenied(projectId);
      }
    }

    // Generate asset ID and storage key
    const assetId = cuid();
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

    // TODO: Track event
    // eventTracker.track({
    //   event: 'asset.upload.initiated',
    //   userId,
    //   metadata: { assetId, fileSize, mimeType },
    // });

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
        metadata: metadata || null,
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

    // TODO: Queue background jobs
    // await jobQueue.add('asset:virusScan', {
    //   assetId,
    //   storageKey: asset.storageKey,
    // });
    // await jobQueue.add('asset:generateThumbnail', {
    //   assetId,
    //   storageKey: asset.storageKey,
    //   type: asset.type,
    //   mimeType: asset.mimeType,
    // });
    // await jobQueue.add('asset:extractMetadata', {
    //   assetId,
    //   storageKey: asset.storageKey,
    //   mimeType: asset.mimeType,
    // });

    // TODO: Track event
    // eventTracker.track({
    //   event: 'asset.upload.confirmed',
    //   userId,
    //   metadata: { assetId },
    // });

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
}
