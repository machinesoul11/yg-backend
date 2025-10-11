/**
 * Remember Me Service
 * Manages long-lived authentication tokens for "remember me" functionality
 */

import { PrismaClient } from '@prisma/client';
import { generateSecureToken, hashToken } from './password';

const REMEMBER_ME_EXPIRY_DAYS = 30; // Tokens valid for 30 days
const REMEMBER_ME_INACTIVITY_DAYS = 7; // Auto-expire after 7 days of no use
const MAX_TOKENS_PER_USER = 5; // Limit number of active sessions per user

export interface CreateRememberMeTokenOptions {
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RememberMeTokenInfo {
  id: string;
  deviceInfo: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export class RememberMeService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new remember-me token
   * Returns the plain token (to be set in cookie) and token info
   */
  async createToken(options: CreateRememberMeTokenOptions): Promise<{
    token: string;
    tokenId: string;
    expiresAt: Date;
  }> {
    const { userId, deviceInfo, ipAddress, userAgent } = options;

    // Generate secure random token
    const plainToken = generateSecureToken(32); // 64 hex characters
    const tokenHash = hashToken(plainToken);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REMEMBER_ME_EXPIRY_DAYS);

    // Create token record
    const tokenRecord = await this.prisma.rememberMeToken.create({
      data: {
        userId,
        tokenHash,
        deviceInfo,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    // Enforce token limit per user
    await this.enforceTokenLimit(userId);

    return {
      token: plainToken,
      tokenId: tokenRecord.id,
      expiresAt,
    };
  }

  /**
   * Verify and use a remember-me token
   * Updates last used timestamp and checks expiry/inactivity
   */
  async verifyAndUseToken(plainToken: string): Promise<{
    valid: boolean;
    userId?: string;
    shouldRotate?: boolean;
  }> {
    const tokenHash = hashToken(plainToken);

    // Find token
    const tokenRecord = await this.prisma.rememberMeToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      return { valid: false };
    }

    const now = new Date();

    // Check if token is expired
    if (tokenRecord.expiresAt < now) {
      // Delete expired token
      await this.prisma.rememberMeToken.delete({
        where: { id: tokenRecord.id },
      });
      return { valid: false };
    }

    // Check if user account is active
    if (!tokenRecord.user.isActive || tokenRecord.user.deleted_at) {
      await this.prisma.rememberMeToken.delete({
        where: { id: tokenRecord.id },
      });
      return { valid: false };
    }

    // Check inactivity timeout
    if (tokenRecord.lastUsedAt) {
      const daysSinceLastUse =
        (now.getTime() - tokenRecord.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastUse > REMEMBER_ME_INACTIVITY_DAYS) {
        // Delete inactive token
        await this.prisma.rememberMeToken.delete({
          where: { id: tokenRecord.id },
        });
        return { valid: false };
      }
    }

    // Update last used timestamp
    await this.prisma.rememberMeToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: now },
    });

    // Suggest rotation if token is more than 7 days old
    const daysOld = (now.getTime() - tokenRecord.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const shouldRotate = daysOld > 7;

    return {
      valid: true,
      userId: tokenRecord.userId,
      shouldRotate,
    };
  }

  /**
   * Rotate a remember-me token (create new, delete old)
   * Used for enhanced security
   */
  async rotateToken(
    oldPlainToken: string,
    options: Omit<CreateRememberMeTokenOptions, 'userId'>
  ): Promise<{
    token: string;
    tokenId: string;
    expiresAt: Date;
  } | null> {
    const oldTokenHash = hashToken(oldPlainToken);

    const oldToken = await this.prisma.rememberMeToken.findUnique({
      where: { tokenHash: oldTokenHash },
    });

    if (!oldToken) {
      return null;
    }

    const userId = oldToken.userId;

    // Create new token
    const newToken = await this.createToken({
      userId,
      ...options,
    });

    // Delete old token
    await this.prisma.rememberMeToken.delete({
      where: { id: oldToken.id },
    });

    return newToken;
  }

  /**
   * Revoke a specific remember-me token
   */
  async revokeToken(tokenId: string): Promise<void> {
    await this.prisma.rememberMeToken.delete({
      where: { id: tokenId },
    });
  }

  /**
   * Revoke all remember-me tokens for a user
   * Called on password change, account security events, etc.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.rememberMeToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get all active remember-me sessions for a user
   */
  async getUserTokens(userId: string, currentTokenId?: string): Promise<RememberMeTokenInfo[]> {
    const tokens = await this.prisma.rememberMeToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return tokens.map((token) => ({
      id: token.id,
      deviceInfo: token.deviceInfo,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      isCurrent: token.id === currentTokenId,
    }));
  }

  /**
   * Enforce maximum tokens per user (delete oldest if limit exceeded)
   */
  private async enforceTokenLimit(userId: string): Promise<void> {
    const tokens = await this.prisma.rememberMeToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (tokens.length > MAX_TOKENS_PER_USER) {
      const tokensToDelete = tokens.slice(MAX_TOKENS_PER_USER);
      await this.prisma.rememberMeToken.deleteMany({
        where: {
          id: {
            in: tokensToDelete.map((t) => t.id),
          },
        },
      });
    }
  }

  /**
   * Clean up expired and inactive tokens
   * Should be run periodically as a background job
   */
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    const inactivityCutoff = new Date();
    inactivityCutoff.setDate(inactivityCutoff.getDate() - REMEMBER_ME_INACTIVITY_DAYS);

    const result = await this.prisma.rememberMeToken.deleteMany({
      where: {
        OR: [
          // Expired tokens
          { expiresAt: { lt: now } },
          // Inactive tokens
          {
            lastUsedAt: { lt: inactivityCutoff },
          },
        ],
      },
    });

    return result.count;
  }
}
