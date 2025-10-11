/**
 * Creator Assets Service
 * Handles file uploads for creator profiles (images, verification docs)
 */

import { PrismaClient } from '@prisma/client';
import { StorageService } from '@/lib/storage/storage.service';
import type { StorageUploadUrlResponse } from '../types/creator.types';
import {
  CreatorNotFoundError,
  StorageUploadFailedError,
} from '../errors/creator.errors';

export class CreatorAssetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageService: StorageService
  ) {}

  /**
   * Generate signed upload URL for profile image
   */
  async getProfileImageUploadUrl(creatorId: string): Promise<StorageUploadUrlResponse> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      const key = `creators/${creatorId}/profile-image-${Date.now()}.jpg`;
      const uploadUrl = await this.storageService.getSignedUploadUrl({
        key,
        contentType: 'image/jpeg',
        maxSizeBytes: 5 * 1024 * 1024, // 5MB
        expiresIn: 3600, // 1 hour
      });

      return {
        uploadUrl,
        key,
        expiresAt: Date.now() + 3600 * 1000,
      };
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  /**
   * Confirm profile image upload and update creator record
   */
  async confirmProfileImageUpload(creatorId: string, storageKey: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      // Verify file exists in storage
      const exists = await this.storageService.fileExists(storageKey);
      if (!exists) {
        throw new StorageUploadFailedError('File not found in storage');
      }

      // Get public URL
      const publicUrl = await this.storageService.getPublicUrl(storageKey);

      // Update creator with avatar URL
      // Note: This assumes User model has an avatar field
      await this.prisma.user.update({
        where: { id: creator.userId },
        data: { avatar: publicUrl },
      });

      // Delete old profile image if exists
      if (creator.user?.avatar) {
        const oldKey = this.extractKeyFromUrl(creator.user.avatar);
        if (oldKey) {
          await this.storageService.deleteFile(oldKey).catch(() => {
            // Ignore errors when deleting old file
          });
        }
      }
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to confirm upload'
      );
    }
  }

  /**
   * Generate signed upload URL for verification document
   */
  async getVerificationDocUploadUrl(
    creatorId: string,
    documentType: 'identity' | 'portfolio' | 'other'
  ): Promise<StorageUploadUrlResponse> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      const key = `creators/${creatorId}/verification/${documentType}-${Date.now()}.pdf`;
      const uploadUrl = await this.storageService.getSignedUploadUrl({
        key,
        contentType: 'application/pdf',
        maxSizeBytes: 10 * 1024 * 1024, // 10MB
        expiresIn: 3600, // 1 hour
      });

      return {
        uploadUrl,
        key,
        expiresAt: Date.now() + 3600 * 1000,
      };
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  /**
   * Get signed download URL for verification document (admin only)
   */
  async getVerificationDocDownloadUrl(
    creatorId: string,
    documentKey: string
  ): Promise<string> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      // Verify document belongs to this creator
      if (!documentKey.startsWith(`creators/${creatorId}/verification/`)) {
        throw new StorageUploadFailedError('Document does not belong to this creator');
      }

      const downloadUrl = await this.storageService.getSignedDownloadUrl(documentKey, 3600);
      return downloadUrl;
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to generate download URL'
      );
    }
  }

  /**
   * List all verification documents for a creator (admin only)
   */
  async listVerificationDocuments(creatorId: string): Promise<string[]> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      const prefix = `creators/${creatorId}/verification/`;
      const files = await this.storageService.listFiles(prefix);
      return files;
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to list documents'
      );
    }
  }

  /**
   * Delete verification document
   */
  async deleteVerificationDocument(creatorId: string, documentKey: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      // Verify document belongs to this creator
      if (!documentKey.startsWith(`creators/${creatorId}/verification/`)) {
        throw new StorageUploadFailedError('Document does not belong to this creator');
      }

      await this.storageService.deleteFile(documentKey);
    } catch (error) {
      throw new StorageUploadFailedError(
        error instanceof Error ? error.message : 'Failed to delete document'
      );
    }
  }

  /**
   * Extract storage key from public URL
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Remove leading slash
      return pathname.startsWith('/') ? pathname.slice(1) : pathname;
    } catch {
      return null;
    }
  }
}
