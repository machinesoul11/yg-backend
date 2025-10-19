/**
 * Multi-Step Authentication Service
 * Handles temporary auth tokens and trusted devices for 2FA login flow
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { hashToken } from '../auth/password';
import { AuthErrors } from '../errors/auth.errors';

const TEMPORARY_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const TRUSTED_DEVICE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface TemporaryAuthTokenData {
  token: string; // Plain text token to return to client
  tokenHash: string; // Hashed token to store in database
  userId: string;
  challengeType: 'TOTP' | 'SMS';
  expiresAt: Date;
}

export interface TrustedDeviceData {
  token: string; // Plain text token to return to client
  tokenHash: string; // Hashed token to store in database
  deviceId: string;
  expiresAt: Date;
}

export interface TrustedDeviceInfo {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

export class MultiStepAuthService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a temporary authentication token
   * Used after password validation, before 2FA verification
   */
  async createTemporaryAuthToken(
    userId: string,
    challengeType: 'TOTP' | 'SMS',
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<TemporaryAuthTokenData> {
    // Generate cryptographically secure token
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TEMPORARY_TOKEN_EXPIRY_MS);

    // Store token in database
    await this.prisma.temporaryAuthToken.create({
      data: {
        userId,
        tokenHash,
        challengeType,
        expiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    return {
      token,
      tokenHash,
      userId,
      challengeType,
      expiresAt,
    };
  }

  /**
   * Verify and consume a temporary authentication token
   * Returns user ID if valid, throws error otherwise
   */
  async verifyTemporaryAuthToken(token: string): Promise<{
    userId: string;
    challengeType: string;
  }> {
    const tokenHash = hashToken(token);

    const tempToken = await this.prisma.temporaryAuthToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // Check if token exists
    if (!tempToken) {
      throw AuthErrors.TEMP_TOKEN_INVALID;
    }

    // Check if token has expired
    if (tempToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.prisma.temporaryAuthToken.delete({
        where: { id: tempToken.id },
      });
      throw AuthErrors.TEMP_TOKEN_EXPIRED;
    }

    // Check if token has been used
    if (tempToken.used) {
      throw AuthErrors.TEMP_TOKEN_ALREADY_USED;
    }

    // Check if user account is still valid
    if (tempToken.user.deleted_at) {
      throw AuthErrors.ACCOUNT_DELETED;
    }

    if (!tempToken.user.isActive) {
      throw AuthErrors.ACCOUNT_LOCKED;
    }

    return {
      userId: tempToken.userId,
      challengeType: tempToken.challengeType,
    };
  }

  /**
   * Mark a temporary auth token as used
   */
  async markTemporaryTokenAsUsed(token: string): Promise<void> {
    const tokenHash = hashToken(token);

    await this.prisma.temporaryAuthToken.updateMany({
      where: {
        tokenHash,
        used: false,
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });
  }

  /**
   * Create a trusted device token
   * Used when user selects "Trust this device" during 2FA
   */
  async createTrustedDevice(
    userId: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
    }
  ): Promise<TrustedDeviceData> {
    // Generate cryptographically secure token
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_EXPIRY_MS);

    // Extract device name from user agent
    const deviceName = this.extractDeviceName(context?.userAgent);

    // Create trusted device entry
    const device = await this.prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash,
        deviceName,
        deviceFingerprint: context?.deviceFingerprint,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    return {
      token,
      tokenHash,
      deviceId: device.id,
      expiresAt,
    };
  }

  /**
   * Verify a trusted device token
   * Returns user ID if valid, null otherwise
   */
  async verifyTrustedDevice(
    userId: string,
    token: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    const tokenHash = hashToken(token);

    const device = await this.prisma.trustedDevice.findFirst({
      where: {
        userId,
        tokenHash,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!device) {
      return false;
    }

    // Update last used timestamp
    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: {
        lastUsedAt: new Date(),
        // Optionally update IP and user agent
        ...(context?.ipAddress && { ipAddress: context.ipAddress }),
        ...(context?.userAgent && { userAgent: context.userAgent }),
      },
    });

    // Optional: Verify device fingerprint if it was stored
    // This adds an extra layer of security
    if (device.deviceFingerprint && context?.userAgent) {
      const currentFingerprint = this.generateDeviceFingerprint(context.userAgent);
      if (device.deviceFingerprint !== currentFingerprint) {
        // Fingerprint mismatch - potential token theft
        // For now, we'll allow it but log it
        // In production, you might want to invalidate the device or require 2FA
        console.warn(`Device fingerprint mismatch for device ${device.id}`);
      }
    }

    return true;
  }

  /**
   * Get all trusted devices for a user
   */
  async getTrustedDevices(userId: string): Promise<TrustedDeviceInfo[]> {
    const devices = await this.prisma.trustedDevice.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });

    return devices.map((device) => ({
      id: device.id,
      deviceName: device.deviceName,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      lastUsedAt: device.lastUsedAt,
      createdAt: device.createdAt,
      expiresAt: device.expiresAt,
    }));
  }

  /**
   * Revoke a specific trusted device
   */
  async revokeTrustedDevice(
    userId: string,
    deviceId: string
  ): Promise<void> {
    const device = await this.prisma.trustedDevice.findFirst({
      where: {
        id: deviceId,
        userId,
      },
    });

    if (!device) {
      throw AuthErrors.DEVICE_NOT_FOUND;
    }

    await this.prisma.trustedDevice.delete({
      where: { id: deviceId },
    });
  }

  /**
   * Revoke all trusted devices for a user
   */
  async revokeAllTrustedDevices(userId: string): Promise<number> {
    const result = await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<{
    tempTokensDeleted: number;
    devicesDeleted: number;
  }> {
    const now = new Date();

    const [tempTokensResult, devicesResult] = await Promise.all([
      this.prisma.temporaryAuthToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(now.getTime() - 60 * 60 * 1000), // Delete tokens expired > 1 hour ago
          },
        },
      }),
      this.prisma.trustedDevice.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      }),
    ]);

    return {
      tempTokensDeleted: tempTokensResult.count,
      devicesDeleted: devicesResult.count,
    };
  }

  /**
   * Extract a human-readable device name from user agent
   */
  private extractDeviceName(userAgent?: string): string {
    if (!userAgent) {
      return 'Unknown Device';
    }

    // Simple device name extraction
    // In production, use a library like ua-parser-js
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Linux')) return 'Linux PC';

    return 'Unknown Device';
  }

  /**
   * Generate a device fingerprint from user agent
   * This is a simple implementation - in production, use a proper fingerprinting library
   */
  private generateDeviceFingerprint(userAgent: string): string {
    return crypto
      .createHash('sha256')
      .update(userAgent)
      .digest('hex')
      .substring(0, 16);
  }
}
