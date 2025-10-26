/**
 * Admin Session Security Service
 * Enhanced session security specifically for administrative users
 * 
 * Features:
 * - Shorter session timeouts for admins (30 minutes vs standard timeouts)
 * - Re-authentication requirement for sensitive operations
 * - 2FA enforcement for all admin actions
 * - Password confirmation for critical actions
 * - Session activity tracking
 */

import { PrismaClient } from '@prisma/client';
import { getRedisClient } from '../redis/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export type SensitiveOperationType =
  | 'role_change'
  | 'permission_grant'
  | 'user_deletion'
  | 'data_export'
  | 'system_config'
  | 'security_settings';

export interface ElevatedSessionToken {
  token: string;
  userId: string;
  operationType: SensitiveOperationType;
  expiresAt: Date;
  createdAt: Date;
}

export interface AdminSessionStatus {
  isActive: boolean;
  lastActivityAt: Date;
  expiresAt: Date;
  timeUntilTimeout: number; // milliseconds
  requiresReauth: boolean;
}

export interface ReauthenticationResult {
  success: boolean;
  elevatedToken?: string;
  expiresAt?: Date;
  error?: string;
}

// Admin session configuration
const ADMIN_SESSION_TIMEOUT_MINUTES = 30;
const ELEVATED_SESSION_TIMEOUT_MINUTES = 5;
const ACTIVITY_UPDATE_THRESHOLD_SECONDS = 60; // Only update activity if older than 1 minute

export class AdminSessionSecurityService {
  private redis = getRedisClient();

  constructor(private prisma: PrismaClient) {}

  /**
   * Check if admin session is still valid (30 minute timeout)
   * 
   * @param userId - Admin user ID
   * @param sessionToken - Current session token
   * @returns Session status including timeout information
   */
  async checkAdminSession(userId: string, sessionToken: string): Promise<AdminSessionStatus> {
    try {
      // Get session from database
      const session = await this.prisma.session.findUnique({
        where: { sessionToken },
        select: {
          userId: true,
          lastActivityAt: true,
          expires: true,
          revokedAt: true,
        },
      });

      if (!session || session.revokedAt) {
        return {
          isActive: false,
          lastActivityAt: new Date(),
          expiresAt: new Date(),
          timeUntilTimeout: 0,
          requiresReauth: true,
        };
      }

      // Verify session belongs to the user
      if (session.userId !== userId) {
        return {
          isActive: false,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expires,
          timeUntilTimeout: 0,
          requiresReauth: true,
        };
      }

      // Calculate time since last activity
      const now = new Date();
      const lastActivity = session.lastActivityAt;
      const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / 1000 / 60;

      // Check if admin session has timed out (30 minutes)
      const isTimedOut = minutesSinceActivity >= ADMIN_SESSION_TIMEOUT_MINUTES;

      if (isTimedOut) {
        // Revoke the session
        await this.revokeAdminSession(sessionToken, 'admin_timeout');

        return {
          isActive: false,
          lastActivityAt: lastActivity,
          expiresAt: session.expires,
          timeUntilTimeout: 0,
          requiresReauth: true,
        };
      }

      // Calculate time until timeout
      const timeUntilTimeout = (ADMIN_SESSION_TIMEOUT_MINUTES * 60 * 1000) - 
        (now.getTime() - lastActivity.getTime());

      return {
        isActive: true,
        lastActivityAt: lastActivity,
        expiresAt: session.expires,
        timeUntilTimeout: Math.max(0, timeUntilTimeout),
        requiresReauth: false,
      };
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to check admin session:', error);
      throw error;
    }
  }

  /**
   * Update admin session activity timestamp
   * Only updates if last activity was more than 1 minute ago to reduce DB writes
   * 
   * @param sessionToken - Session token
   */
  async updateAdminActivity(sessionToken: string): Promise<void> {
    try {
      // Check if we should update (rate limiting updates)
      const updateKey = `session:admin:update:${sessionToken}`;
      const lastUpdate = await this.redis.get(updateKey);

      if (lastUpdate) {
        // Already updated recently, skip
        return;
      }

      // Update session activity
      await this.prisma.session.update({
        where: { sessionToken },
        data: { lastActivityAt: new Date() },
      });

      // Set rate limit flag
      await this.redis.setex(
        updateKey,
        ACTIVITY_UPDATE_THRESHOLD_SECONDS,
        '1'
      );
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to update admin activity:', error);
      // Don't throw - activity updates shouldn't break the application
    }
  }

  /**
   * Revoke admin session with reason
   * 
   * @param sessionToken - Session token to revoke
   * @param reason - Reason for revocation
   */
  async revokeAdminSession(sessionToken: string, reason: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { sessionToken },
        data: {
          revokedAt: new Date(),
          revokedReason: reason,
        },
      });

      // Clean up any elevated tokens for this session
      const session = await this.prisma.session.findUnique({
        where: { sessionToken },
        select: { userId: true },
      });

      if (session?.userId) {
        await this.revokeAllElevatedTokens(session.userId);
      }
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to revoke admin session:', error);
      throw error;
    }
  }

  /**
   * Require re-authentication for sensitive operation
   * User must provide current password to get an elevated session token
   * 
   * @param userId - Admin user ID
   * @param password - Current password for verification
   * @param operationType - Type of sensitive operation
   * @returns Elevated session token if successful
   */
  async requireReauthentication(
    userId: string,
    password: string,
    operationType: SensitiveOperationType
  ): Promise<ReauthenticationResult> {
    try {
      // Get user with password hash
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          password_hash: true,
          two_factor_enabled: true,
        },
      });

      if (!user || !user.password_hash) {
        return {
          success: false,
          error: 'User not found or no password set',
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid password',
        };
      }

      // Create elevated session token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + ELEVATED_SESSION_TIMEOUT_MINUTES * 60 * 1000);

      const elevatedToken: ElevatedSessionToken = {
        token,
        userId,
        operationType,
        expiresAt,
        createdAt: new Date(),
      };

      // Store in Redis
      const tokenKey = `session:admin:elevated:${token}`;
      await this.redis.setex(
        tokenKey,
        ELEVATED_SESSION_TIMEOUT_MINUTES * 60,
        JSON.stringify(elevatedToken)
      );

      return {
        success: true,
        elevatedToken: token,
        expiresAt,
      };
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to reauthenticate:', error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Verify elevated session token for sensitive operation
   * 
   * @param token - Elevated session token
   * @param userId - User ID (for verification)
   * @param operationType - Expected operation type
   * @returns Whether the token is valid
   */
  async verifyElevatedToken(
    token: string,
    userId: string,
    operationType: SensitiveOperationType
  ): Promise<boolean> {
    try {
      const tokenKey = `session:admin:elevated:${token}`;
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return false;
      }

      const elevatedToken = JSON.parse(data) as ElevatedSessionToken;

      // Verify token belongs to user
      if (elevatedToken.userId !== userId) {
        return false;
      }

      // Verify operation type matches
      if (elevatedToken.operationType !== operationType) {
        return false;
      }

      // Verify not expired
      if (new Date(elevatedToken.expiresAt) < new Date()) {
        await this.redis.del(tokenKey);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to verify elevated token:', error);
      return false;
    }
  }

  /**
   * Consume (delete) elevated session token after use
   * Tokens are single-use for security
   * 
   * @param token - Elevated session token
   */
  async consumeElevatedToken(token: string): Promise<void> {
    try {
      const tokenKey = `session:admin:elevated:${token}`;
      await this.redis.del(tokenKey);
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to consume elevated token:', error);
    }
  }

  /**
   * Revoke all elevated tokens for a user
   * Used when user logs out or password changes
   * 
   * @param userId - User ID
   */
  async revokeAllElevatedTokens(userId: string): Promise<number> {
    try {
      const pattern = 'session:admin:elevated:*';
      const keys = await this.redis.keys(pattern);

      let revokedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const token = JSON.parse(data) as ElevatedSessionToken;
          if (token.userId === userId) {
            await this.redis.del(key);
            revokedCount++;
          }
        }
      }

      return revokedCount;
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to revoke elevated tokens:', error);
      return 0;
    }
  }

  /**
   * Check if operation requires 2FA verification
   * All admin actions require 2FA if enabled
   * 
   * @param userId - Admin user ID
   * @returns Whether 2FA is required
   */
  async requires2FA(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          two_factor_enabled: true,
          role: true,
        },
      });

      // All admin users with 2FA enabled must use it
      return user?.two_factor_enabled === true && user?.role === 'ADMIN';
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to check 2FA requirement:', error);
      return false;
    }
  }

  /**
   * Verify recent 2FA for admin action
   * Checks if user has verified 2FA in the last 15 minutes
   * 
   * @param userId - Admin user ID
   * @returns Whether recent 2FA verification exists
   */
  async hasRecent2FAVerification(userId: string): Promise<boolean> {
    try {
      // Check for recent 2FA verification in Redis
      const verificationKey = `session:admin:2fa-verified:${userId}`;
      const verification = await this.redis.get(verificationKey);

      return verification !== null;
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to check recent 2FA:', error);
      return false;
    }
  }

  /**
   * Mark 2FA as verified for admin (15 minute grace period)
   * 
   * @param userId - Admin user ID
   */
  async mark2FAVerified(userId: string): Promise<void> {
    try {
      const verificationKey = `session:admin:2fa-verified:${userId}`;
      // 15 minute grace period for 2FA
      await this.redis.setex(verificationKey, 15 * 60, '1');
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to mark 2FA verified:', error);
    }
  }

  /**
   * Get all active admin sessions
   * 
   * @param userId - Admin user ID
   * @returns List of active sessions
   */
  async getActiveAdminSessions(userId: string): Promise<Array<{
    sessionToken: string;
    lastActivityAt: Date;
    timeUntilTimeout: number;
    deviceInfo?: string;
  }>> {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          userId,
          revokedAt: null,
          expires: { gt: new Date() },
        },
        select: {
          sessionToken: true,
          lastActivityAt: true,
          userAgent: true,
          ipAddress: true,
        },
        orderBy: { lastActivityAt: 'desc' },
      });

      const now = new Date();

      return sessions
        .map(session => {
          const minutesSinceActivity = (now.getTime() - session.lastActivityAt.getTime()) / 1000 / 60;
          const isActive = minutesSinceActivity < ADMIN_SESSION_TIMEOUT_MINUTES;

          if (!isActive) {
            return null;
          }

          const timeUntilTimeout = (ADMIN_SESSION_TIMEOUT_MINUTES * 60 * 1000) -
            (now.getTime() - session.lastActivityAt.getTime());

          return {
            sessionToken: session.sessionToken,
            lastActivityAt: session.lastActivityAt,
            timeUntilTimeout: Math.max(0, timeUntilTimeout),
            deviceInfo: session.userAgent || undefined,
          };
        })
        .filter((session): session is NonNullable<typeof session> => session !== null);
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to get active admin sessions:', error);
      return [];
    }
  }

  /**
   * Cleanup expired admin sessions
   * Should be run periodically (e.g., every 5 minutes)
   */
  async cleanupExpiredAdminSessions(): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - ADMIN_SESSION_TIMEOUT_MINUTES * 60 * 1000);

      // Get admin users
      const adminUsers = await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });

      const adminUserIds = adminUsers.map(u => u.id);

      // Revoke expired admin sessions
      const result = await this.prisma.session.updateMany({
        where: {
          userId: { in: adminUserIds },
          revokedAt: null,
          lastActivityAt: { lt: cutoffTime },
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'admin_timeout',
        },
      });

      return result.count;
    } catch (error) {
      console.error('[AdminSessionSecurity] Failed to cleanup expired sessions:', error);
      return 0;
    }
  }
}
