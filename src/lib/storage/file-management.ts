/**
 * File Management Service
 * 
 * Provides comprehensive file management capabilities including:
 * - Bulk delete operations with safeguards
 * - Archive functionality
 * - File organization
 * - Versioning integration
 * - Relationship validation
 */

import { PrismaClient, AssetStatus, UserRole } from '@prisma/client';
import { IStorageProvider } from './types';
import { FileRelationshipService } from './file-relationships';
import { auditService } from '../services/audit.service';

export interface BulkDeleteInput {
  assetIds?: string[];
  filterCriteria?: {
    projectId?: string;
    status?: AssetStatus;
    type?: string;
    createdBefore?: Date;
    olderThanDays?: number;
  };
  userId: string;
  userRole: UserRole;
  skipConfirmation?: boolean;
}

export interface BulkDeletePreview {
  totalAssets: number;
  totalSizeBytes: bigint;
  assetsToDelete: Array<{
    id: string;
    title: string;
    type: string;
    fileSize: bigint;
    hasRelationships: boolean;
    hasActiveLicenses: boolean;
    warnings: string[];
  }>;
  blockers: string[];
  warnings: string[];
  canProceed: boolean;
}

export interface BulkDeleteResult {
  jobId: string;
  totalAssets: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export interface ArchiveOptions {
  assetId?: string;
  assetIds?: string[];
  reason: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface ArchiveResult {
  archived: number;
  failed: number;
  errors: Array<{ assetId: string; error: string }>;
}

export interface UnarchiveOptions {
  assetId?: string;
  assetIds?: string[];
  userId: string;
}

/**
 * File Management Service
 */
export class FileManagementService {
  private relationshipService: FileRelationshipService;

  constructor(
    private prisma: PrismaClient,
    private storageProvider: IStorageProvider
  ) {
    this.relationshipService = new FileRelationshipService(prisma);
  }

  /**
   * Preview what would be deleted in a bulk delete operation
   */
  async previewBulkDelete(input: BulkDeleteInput): Promise<BulkDeletePreview> {
    const { assetIds, filterCriteria, userId, userRole } = input;

    // Build query to find assets
    const assets = await this.findAssetsForBulkOperation(assetIds, filterCriteria);

    const preview: BulkDeletePreview = {
      totalAssets: assets.length,
      totalSizeBytes: BigInt(0),
      assetsToDelete: [],
      blockers: [],
      warnings: [],
      canProceed: true,
    };

    // Analyze each asset
    for (const asset of assets) {
      preview.totalSizeBytes += asset.fileSize;

      const warnings: string[] = [];
      let hasRelationships = false;
      let hasActiveLicenses = false;

      // Check permissions
      if (userRole !== UserRole.ADMIN && asset.createdBy !== userId) {
        preview.blockers.push(`No permission to delete asset ${asset.id}`);
        preview.canProceed = false;
        continue;
      }

      // Check for active licenses
      const activeLicenses = await this.prisma.license.count({
        where: {
          ipAssetId: asset.id,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (activeLicenses > 0) {
        hasActiveLicenses = true;
        warnings.push(`Has ${activeLicenses} active license(s)`);
        preview.blockers.push(`Asset ${asset.id} has active licenses`);
        preview.canProceed = false;
      }

      // Check for relationships
      const relationships = await this.relationshipService.queryRelationships({
        assetId: asset.id,
        direction: 'both',
      });

      if (relationships.length > 0) {
        hasRelationships = true;
        warnings.push(`Has ${relationships.length} relationship(s)`);
      }

      // Check if it's a parent with derivatives
      const derivatives = await this.prisma.ipAsset.count({
        where: { parentAssetId: asset.id, deletedAt: null },
      });

      if (derivatives > 0) {
        warnings.push(`Has ${derivatives} version derivative(s)`);
      }

      preview.assetsToDelete.push({
        id: asset.id,
        title: asset.title,
        type: asset.type,
        fileSize: asset.fileSize,
        hasRelationships,
        hasActiveLicenses,
        warnings,
      });
    }

    // Add general warnings
    if (preview.totalAssets > 100) {
      preview.warnings.push(
        `Large bulk delete operation (${preview.totalAssets} assets)`
      );
    }

    if (preview.totalSizeBytes > BigInt(10 * 1024 * 1024 * 1024)) {
      // 10GB
      preview.warnings.push(
        `Large storage deletion (${this.formatBytes(preview.totalSizeBytes)})`
      );
    }

    return preview;
  }

  /**
   * Execute bulk delete operation
   */
  async executeBulkDelete(input: BulkDeleteInput): Promise<BulkDeleteResult> {
    const { assetIds, filterCriteria, userId, skipConfirmation = false } = input;

    // First, get preview to validate
    const preview = await this.previewBulkDelete(input);

    if (!preview.canProceed && !skipConfirmation) {
      throw new Error(
        `Cannot proceed with bulk delete: ${preview.blockers.join(', ')}`
      );
    }

    // Create bulk delete job
    const jobId = `bulk_delete_${Date.now()}_${userId}`;

    // Process deletions in batches (background job simulation)
    await this.processBulkDelete(jobId, preview.assetsToDelete, userId);

    return {
      jobId,
      totalAssets: preview.totalAssets,
      status: 'processing',
    };
  }

  /**
   * Process bulk delete in batches
   */
  private async processBulkDelete(
    jobId: string,
    assets: Array<{ id: string; title: string }>,
    userId: string
  ): Promise<void> {
    const batchSize = 50;
    const batches = this.chunkArray(assets, batchSize);

    for (const batch of batches) {
      await this.deleteBatch(
        batch.map((a) => a.id),
        userId
      );

      // Log progress
      await auditService.log({
        userId,
        action: 'bulk_delete_progress',
        entityType: 'storage',
        entityId: jobId,
        after: {
          processed: batch.length,
          total: assets.length,
        },
      });
    }
  }

  /**
   * Delete a batch of assets (with transaction)
   */
  private async deleteBatch(assetIds: string[], userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const assetId of assetIds) {
        const asset = await tx.ipAsset.findUnique({
          where: { id: assetId },
        });

        if (!asset) {
          continue;
        }

        // Soft delete the database record
        await tx.ipAsset.update({
          where: { id: assetId },
          data: {
            deletedAt: new Date(),
            updatedBy: userId,
          },
        });

        // Delete from storage (non-blocking)
        try {
          await this.storageProvider.delete(asset.storageKey);

          // Delete thumbnails and previews
          if (asset.thumbnailUrl) {
            const thumbKey = this.extractKeyFromUrl(asset.thumbnailUrl);
            if (thumbKey) await this.storageProvider.delete(thumbKey);
          }
          if (asset.previewUrl) {
            const previewKey = this.extractKeyFromUrl(asset.previewUrl);
            if (previewKey) await this.storageProvider.delete(previewKey);
          }
        } catch (error) {
          console.error(`Failed to delete storage for asset ${assetId}:`, error);
          // Continue with other deletions
        }

        // Log audit event
        await auditService.log({
          userId,
          action: 'delete',
          entityType: 'ip_asset',
          entityId: assetId,
          before: asset,
        });
      }
    });
  }

  /**
   * Archive assets
   */
  async archiveAssets(options: ArchiveOptions): Promise<ArchiveResult> {
    const { assetId, assetIds, reason, userId, metadata = {} } = options;

    const ids = assetId ? [assetId] : assetIds || [];
    const result: ArchiveResult = {
      archived: 0,
      failed: 0,
      errors: [],
    };

    for (const id of ids) {
      try {
        const asset = await this.prisma.ipAsset.findUnique({
          where: { id, deletedAt: null },
        });

        if (!asset) {
          result.failed++;
          result.errors.push({ assetId: id, error: 'Asset not found' });
          continue;
        }

        // Check if already archived
        if (asset.status === AssetStatus.ARCHIVED) {
          result.failed++;
          result.errors.push({ assetId: id, error: 'Already archived' });
          continue;
        }

        // Update to archived status
        await this.prisma.ipAsset.update({
          where: { id },
          data: {
            status: AssetStatus.ARCHIVED,
            updatedBy: userId,
            metadata: {
              ...(asset.metadata as any),
              archivedAt: new Date().toISOString(),
              archivedBy: userId,
              archiveReason: reason,
              archiveMetadata: metadata,
            },
          },
        });

        // Log audit event
        await auditService.log({
          userId,
          action: 'archive',
          entityType: 'ip_asset',
          entityId: id,
          after: { reason, metadata },
        });

        result.archived++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          assetId: id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Unarchive assets
   */
  async unarchiveAssets(options: UnarchiveOptions): Promise<ArchiveResult> {
    const { assetId, assetIds, userId } = options;

    const ids = assetId ? [assetId] : assetIds || [];
    const result: ArchiveResult = {
      archived: 0,
      failed: 0,
      errors: [],
    };

    for (const id of ids) {
      try {
        const asset = await this.prisma.ipAsset.findUnique({
          where: { id, deletedAt: null },
        });

        if (!asset) {
          result.failed++;
          result.errors.push({ assetId: id, error: 'Asset not found' });
          continue;
        }

        if (asset.status !== AssetStatus.ARCHIVED) {
          result.failed++;
          result.errors.push({ assetId: id, error: 'Not archived' });
          continue;
        }

        // Update to draft status (requires review)
        await this.prisma.ipAsset.update({
          where: { id },
          data: {
            status: AssetStatus.DRAFT,
            updatedBy: userId,
            metadata: {
              ...(asset.metadata as any),
              unarchivedAt: new Date().toISOString(),
              unarchivedBy: userId,
            },
          },
        });

        // Log audit event
        await auditService.log({
          userId,
          action: 'unarchive',
          entityType: 'ip_asset',
          entityId: id,
        });

        result.archived++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          assetId: id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Get archived assets
   */
  async getArchivedAssets(options: {
    userId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { userId, projectId, limit = 50, offset = 0 } = options;

    const where: any = {
      status: AssetStatus.ARCHIVED,
      deletedAt: null,
    };

    if (userId) {
      where.createdBy = userId;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    const [assets, total] = await Promise.all([
      this.prisma.ipAsset.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          type: true,
          fileSize: true,
          updatedAt: true,
          metadata: true,
        },
      }),
      this.prisma.ipAsset.count({ where }),
    ]);

    return {
      assets,
      total,
      limit,
      offset,
      hasMore: offset + assets.length < total,
    };
  }

  /**
   * Find assets for bulk operations
   */
  private async findAssetsForBulkOperation(
    assetIds?: string[],
    filterCriteria?: BulkDeleteInput['filterCriteria']
  ) {
    const where: any = { deletedAt: null };

    if (assetIds && assetIds.length > 0) {
      where.id = { in: assetIds };
    }

    if (filterCriteria) {
      if (filterCriteria.projectId) {
        where.projectId = filterCriteria.projectId;
      }
      if (filterCriteria.status) {
        where.status = filterCriteria.status;
      }
      if (filterCriteria.type) {
        where.type = filterCriteria.type;
      }
      if (filterCriteria.createdBefore) {
        where.createdAt = { lte: filterCriteria.createdBefore };
      }
      if (filterCriteria.olderThanDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filterCriteria.olderThanDays);
        where.createdAt = { lte: cutoffDate };
      }
    }

    return this.prisma.ipAsset.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        fileSize: true,
        storageKey: true,
        thumbnailUrl: true,
        previewUrl: true,
        createdBy: true,
        parentAssetId: true,
      },
    });
  }

  /**
   * Utility: Extract storage key from URL
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      return null;
    }
  }

  /**
   * Utility: Format bytes for display
   */
  private formatBytes(bytes: bigint): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = Number(bytes);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Utility: Chunk array into batches
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
