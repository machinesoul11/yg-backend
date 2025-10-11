/**
 * OAuth Profile Synchronization Service
 * Handles syncing user profile data from OAuth providers
 */

import { PrismaClient } from '@prisma/client';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { storageProvider } from '../storage';
import crypto from 'crypto';

interface OAuthProfile {
  provider: 'google' | 'github' | 'linkedin';
  name?: string | null;
  email?: string;
  image?: string | null;
  // Provider-specific fields
  locale?: string;
  bio?: string;
  company?: string;
  location?: string;
}

interface ProfileSyncOptions {
  syncAvatar?: boolean;
  syncName?: boolean;
  overrideManualChanges?: boolean;
}

export class OAuthProfileSyncService {
  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Sync user profile from OAuth provider data
   */
  async syncProfile(
    userId: string,
    profile: OAuthProfile,
    options: ProfileSyncOptions = {}
  ): Promise<void> {
    const {
      syncAvatar = true,
      syncName = true,
      overrideManualChanges = false,
    } = options;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updates: { name?: string; avatar?: string } = {};
    const beforeData: { name?: string | null; avatar?: string | null } = {
      name: user.name,
      avatar: user.avatar,
    };

    // Determine if this is a new user (created in last 5 minutes)
    const isNewUser = 
      Date.now() - user.createdAt.getTime() < 5 * 60 * 1000;

    // Determine if user has made manual changes
    const hasManualChanges = 
      user.updatedAt.getTime() > user.createdAt.getTime() + 60 * 1000;

    // Sync name if allowed
    if (syncName && profile.name) {
      // Always sync for new users
      if (isNewUser) {
        updates.name = profile.name;
      } 
      // Sync if no manual changes or override is enabled
      else if (!hasManualChanges || overrideManualChanges) {
        // Only update if current name is empty
        if (!user.name) {
          updates.name = profile.name;
        }
      }
    }

    // Sync avatar if allowed
    if (syncAvatar && profile.image) {
      try {
        // Always sync for new users
        if (isNewUser) {
          const avatarUrl = await this.downloadAndStoreAvatar(
            userId,
            profile.image,
            profile.provider
          );
          if (avatarUrl) {
            updates.avatar = avatarUrl;
          }
        }
        // Sync if no manual changes or override is enabled
        else if (!hasManualChanges || overrideManualChanges) {
          // Only update if current avatar is empty or is an OAuth avatar
          const isOAuthAvatar = user.avatar?.includes('googleusercontent.com') ||
                               user.avatar?.includes('githubusercontent.com') ||
                               user.avatar?.includes('licdn.com');
          
          if (!user.avatar || isOAuthAvatar) {
            const avatarUrl = await this.downloadAndStoreAvatar(
              userId,
              profile.image,
              profile.provider
            );
            if (avatarUrl) {
              updates.avatar = avatarUrl;
            }
          }
        }
      } catch (error) {
        // Log error but don't fail the sync
        console.error('Failed to sync avatar:', error);
        await this.auditService.log({
          action: AUDIT_ACTIONS.PROFILE_UPDATED,
          entityType: 'user',
          entityId: userId,
          userId,
          email: user.email,
          after: {
            error: 'Failed to sync avatar from OAuth provider',
            provider: profile.provider,
          },
        });
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updates,
      });

      // Log the sync
      await this.auditService.log({
        action: AUDIT_ACTIONS.PROFILE_UPDATED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        before: beforeData,
        after: {
          ...updates,
          syncedFromProvider: profile.provider,
          isNewUser,
        },
      });
    }
  }

  /**
   * Download avatar from OAuth provider and store in R2
   */
  private async downloadAndStoreAvatar(
    userId: string,
    imageUrl: string,
    provider: string
  ): Promise<string | null> {
    try {
      // Download image from OAuth provider
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download avatar: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      // Validate file size (max 5MB)
      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Avatar image too large (max 5MB)');
      }

      // Validate content type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(contentType)) {
        throw new Error(`Invalid image type: ${contentType}`);
      }

      // Generate unique filename
      const extension = contentType.split('/')[1] || 'jpg';
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const key = `avatars/${userId}/${provider}-${hash}.${extension}`;

      // Upload to storage
      const result = await storageProvider.upload({
        key,
        file: buffer,
        contentType,
        metadata: {
          userId,
          provider,
          syncedAt: new Date().toISOString(),
        },
      });

      return result.url;
    } catch (error) {
      console.error('Error downloading/storing OAuth avatar:', error);
      return null;
    }
  }

  /**
   * Check if profile sync is allowed for user
   */
  async canSyncProfile(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return false;
    }

    // Allow sync if user is new (created in last 5 minutes)
    const isNewUser = Date.now() - user.createdAt.getTime() < 5 * 60 * 1000;
    if (isNewUser) {
      return true;
    }

    // Allow sync if no manual changes have been made
    const hasManualChanges = 
      user.updatedAt.getTime() > user.createdAt.getTime() + 60 * 1000;
    
    return !hasManualChanges;
  }

  /**
   * Get OAuth accounts linked to user
   */
  async getLinkedAccounts(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: {
        provider: true,
        providerAccountId: true,
        type: true,
      },
    });

    return accounts;
  }

  /**
   * Unlink OAuth provider from user account
   */
  async unlinkProvider(
    userId: string,
    provider: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    // Check if user has password set
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password_hash: true,
        accounts: {
          where: {
            provider: { not: provider },
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Prevent unlinking if it's the only auth method
    if (!user.password_hash && user.accounts.length === 0) {
      throw new Error(
        'Cannot disconnect the only authentication method. Please set a password first.'
      );
    }

    // Delete the OAuth account
    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        provider,
      },
    });

    if (!account) {
      throw new Error('OAuth provider not linked to this account');
    }

    await this.prisma.account.delete({
      where: {
        id: account.id,
      },
    });

    // Log the action
    await this.auditService.log({
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        provider,
        action: 'oauth_disconnected',
      },
    });
  }
}
