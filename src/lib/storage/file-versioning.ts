/**
 * File Versioning System
 * 
 * Tracks and manages file versions over time, maintaining complete history
 * while understanding relationships between versions.
 */

import { PrismaClient, AssetStatus } from '@prisma/client';
import { IStorageProvider } from './types';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21);

export interface CreateVersionOptions {
  parentAssetId: string;
  file: Buffer | ReadableStream;
  filename: string;
  contentType: string;
  metadata?: Record<string, any>;
  userId: string;
  reason?: string;
}

export interface VersionInfo {
  id: string;
  version: number;
  storageKey: string;
  fileSize: bigint;
  mimeType: string;
  isCurrent: boolean;
  createdAt: Date;
  createdBy: string;
  metadata?: any;
}

export interface VersionHistoryOptions {
  parentAssetId: string;
  includeDeleted?: boolean;
  orderBy?: 'asc' | 'desc';
}

export interface RestoreVersionOptions {
  versionId: string;
  userId: string;
  reason?: string;
}

/**
 * File Versioning Service
 * 
 * Handles creation, retrieval, and management of asset versions
 */
export class FileVersioningService {
  constructor(
    private prisma: PrismaClient,
    private storageProvider: IStorageProvider
  ) {}

  /**
   * Create a new version of an existing asset
   */
  async createVersion(options: CreateVersionOptions): Promise<VersionInfo> {
    const {
      parentAssetId,
      file,
      filename,
      contentType,
      metadata = {},
      userId,
      reason,
    } = options;

    // Verify parent asset exists
    const parentAsset = await this.prisma.ipAsset.findUnique({
      where: { id: parentAssetId, deletedAt: null },
      include: {
        derivatives: {
          where: { deletedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!parentAsset) {
      throw new Error(`Parent asset ${parentAssetId} not found`);
    }

    // Calculate next version number
    const latestVersion = parentAsset.derivatives[0]?.version || parentAsset.version;
    const nextVersion = latestVersion + 1;

    // Generate storage key for new version
    const storageKey = this.generateVersionStorageKey(parentAssetId, nextVersion, filename);

    // Upload file to storage
    const uploadResult = await this.storageProvider.upload({
      key: storageKey,
      file,
      contentType,
      metadata: {
        ...metadata,
        parentAssetId,
        version: nextVersion.toString(),
        versionReason: reason || 'Version update',
      },
    });

    // Create new version record in database
    const newVersion = await this.prisma.ipAsset.create({
      data: {
        title: `${parentAsset.title} (v${nextVersion})`,
        description: parentAsset.description,
        type: parentAsset.type,
        storageKey,
        fileSize: BigInt(uploadResult.size),
        mimeType: contentType,
        version: nextVersion,
        parentAssetId,
        metadata: {
          ...metadata,
          versionReason: reason,
          versionCreatedAt: new Date().toISOString(),
        },
        status: AssetStatus.DRAFT,
        createdBy: userId,
        projectId: parentAsset.projectId,
      },
    });

    return {
      id: newVersion.id,
      version: newVersion.version,
      storageKey: newVersion.storageKey,
      fileSize: newVersion.fileSize,
      mimeType: newVersion.mimeType,
      isCurrent: false,
      createdAt: newVersion.createdAt,
      createdBy: newVersion.createdBy,
      metadata: newVersion.metadata,
    };
  }

  /**
   * Get all versions of an asset
   */
  async getVersionHistory(options: VersionHistoryOptions): Promise<VersionInfo[]> {
    const { parentAssetId, includeDeleted = false, orderBy = 'desc' } = options;

    // Get parent asset and all its versions
    const parent = await this.prisma.ipAsset.findUnique({
      where: { id: parentAssetId },
    });

    if (!parent) {
      throw new Error(`Asset ${parentAssetId} not found`);
    }

    // Find all versions (including parent as version 1)
    const allVersions = await this.prisma.ipAsset.findMany({
      where: {
        OR: [
          { id: parentAssetId },
          { parentAssetId },
        ],
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { version: orderBy },
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

    return allVersions.map((v) => ({
      id: v.id,
      version: v.version,
      storageKey: v.storageKey,
      fileSize: v.fileSize,
      mimeType: v.mimeType,
      isCurrent: v.id === parentAssetId && !v.parentAssetId,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      metadata: v.metadata,
    }));
  }

  /**
   * Get current version of an asset
   */
  async getCurrentVersion(assetId: string): Promise<VersionInfo | null> {
    const asset = await this.prisma.ipAsset.findUnique({
      where: { id: assetId, deletedAt: null },
      include: {
        derivatives: {
          where: { deletedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!asset) {
      return null;
    }

    // If there are derivatives, the latest one is current
    const current = asset.derivatives[0] || asset;

    return {
      id: current.id,
      version: current.version,
      storageKey: current.storageKey,
      fileSize: current.fileSize,
      mimeType: current.mimeType,
      isCurrent: true,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      metadata: current.metadata,
    };
  }

  /**
   * Restore a previous version as the current version
   */
  async restoreVersion(options: RestoreVersionOptions): Promise<VersionInfo> {
    const { versionId, userId, reason } = options;

    // Get the version to restore
    const versionToRestore = await this.prisma.ipAsset.findUnique({
      where: { id: versionId, deletedAt: null },
    });

    if (!versionToRestore) {
      throw new Error(`Version ${versionId} not found`);
    }

    if (!versionToRestore.parentAssetId) {
      throw new Error('Cannot restore root asset');
    }

    // Copy the file in storage
    const parentAssetId = versionToRestore.parentAssetId;
    const parent = await this.prisma.ipAsset.findUnique({
      where: { id: parentAssetId },
      include: {
        derivatives: {
          where: { deletedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!parent) {
      throw new Error(`Parent asset ${parentAssetId} not found`);
    }

    const latestVersion = parent.derivatives[0]?.version || parent.version;
    const nextVersion = latestVersion + 1;

    // Copy storage file
    const newStorageKey = this.generateVersionStorageKey(
      parentAssetId,
      nextVersion,
      this.extractFilenameFromKey(versionToRestore.storageKey)
    );

    await this.storageProvider.copy({
      sourceKey: versionToRestore.storageKey,
      destinationKey: newStorageKey,
    });

    // Create new version record
    const restoredVersion = await this.prisma.ipAsset.create({
      data: {
        title: versionToRestore.title,
        description: versionToRestore.description,
        type: versionToRestore.type,
        storageKey: newStorageKey,
        fileSize: versionToRestore.fileSize,
        mimeType: versionToRestore.mimeType,
        version: nextVersion,
        parentAssetId,
        metadata: {
          ...(versionToRestore.metadata ? (versionToRestore.metadata as any) : {}),
          restoredFrom: versionToRestore.id,
          restoredFromVersion: versionToRestore.version,
          restoreReason: reason || 'Version restored',
          restoredAt: new Date().toISOString(),
        },
        status: AssetStatus.DRAFT,
        createdBy: userId,
        projectId: versionToRestore.projectId,
      },
    });

    return {
      id: restoredVersion.id,
      version: restoredVersion.version,
      storageKey: restoredVersion.storageKey,
      fileSize: restoredVersion.fileSize,
      mimeType: restoredVersion.mimeType,
      isCurrent: true,
      createdAt: restoredVersion.createdAt,
      createdBy: restoredVersion.createdBy,
      metadata: restoredVersion.metadata,
    };
  }

  /**
   * Delete a specific version (soft delete)
   */
  async deleteVersion(versionId: string, userId: string): Promise<void> {
    const version = await this.prisma.ipAsset.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    // Prevent deleting the root version if it has derivatives
    if (!version.parentAssetId) {
      const derivatives = await this.prisma.ipAsset.count({
        where: { parentAssetId: versionId, deletedAt: null },
      });

      if (derivatives > 0) {
        throw new Error('Cannot delete root version with active derivatives');
      }
    }

    // Soft delete
    await this.prisma.ipAsset.update({
      where: { id: versionId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });
  }

  /**
   * Compare two versions
   */
  async compareVersions(versionId1: string, versionId2: string): Promise<{
    version1: VersionInfo;
    version2: VersionInfo;
    differences: {
      fileSize: { v1: bigint; v2: bigint; changed: boolean };
      mimeType: { v1: string; v2: string; changed: boolean };
      metadata: { changed: boolean; details?: any };
    };
  }> {
    const [v1, v2] = await Promise.all([
      this.prisma.ipAsset.findUnique({ where: { id: versionId1 } }),
      this.prisma.ipAsset.findUnique({ where: { id: versionId2 } }),
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return {
      version1: {
        id: v1.id,
        version: v1.version,
        storageKey: v1.storageKey,
        fileSize: v1.fileSize,
        mimeType: v1.mimeType,
        isCurrent: false,
        createdAt: v1.createdAt,
        createdBy: v1.createdBy,
        metadata: v1.metadata,
      },
      version2: {
        id: v2.id,
        version: v2.version,
        storageKey: v2.storageKey,
        fileSize: v2.fileSize,
        mimeType: v2.mimeType,
        isCurrent: false,
        createdAt: v2.createdAt,
        createdBy: v2.createdBy,
        metadata: v2.metadata,
      },
      differences: {
        fileSize: {
          v1: v1.fileSize,
          v2: v2.fileSize,
          changed: v1.fileSize !== v2.fileSize,
        },
        mimeType: {
          v1: v1.mimeType,
          v2: v2.mimeType,
          changed: v1.mimeType !== v2.mimeType,
        },
        metadata: {
          changed: JSON.stringify(v1.metadata) !== JSON.stringify(v2.metadata),
          details: {
            v1: v1.metadata,
            v2: v2.metadata,
          },
        },
      },
    };
  }

  /**
   * Cleanup old versions based on retention policy
   */
  async cleanupOldVersions(options: {
    assetId: string;
    keepLastN: number;
    userId: string;
  }): Promise<number> {
    const { assetId, keepLastN, userId } = options;

    const versions = await this.prisma.ipAsset.findMany({
      where: {
        OR: [{ id: assetId }, { parentAssetId: assetId }],
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    if (versions.length <= keepLastN) {
      return 0;
    }

    const versionsToDelete = versions.slice(keepLastN);
    
    // Soft delete old versions
    await Promise.all(
      versionsToDelete.map((v) =>
        this.prisma.ipAsset.update({
          where: { id: v.id },
          data: {
            deletedAt: new Date(),
            updatedBy: userId,
            metadata: {
              ...(v.metadata as any),
              deletionReason: 'Retention policy cleanup',
            },
          },
        })
      )
    );

    return versionsToDelete.length;
  }

  /**
   * Generate storage key for a version
   */
  private generateVersionStorageKey(
    parentAssetId: string,
    version: number,
    filename: string
  ): string {
    const sanitized = filename.replace(/[^a-z0-9._-]/gi, '_');
    return `assets/${parentAssetId}/v${version}_${sanitized}`;
  }

  /**
   * Extract filename from storage key
   */
  private extractFilenameFromKey(storageKey: string): string {
    const parts = storageKey.split('/');
    const filename = parts[parts.length - 1];
    // Remove version prefix if present
    return filename.replace(/^v\d+_/, '');
  }
}
