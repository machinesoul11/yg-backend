/**
 * Session Management Service
 * Handles session tracking, device limits, and session lifecycle
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface SessionInfo {
  id: string;
  sessionToken: string;
  deviceName: string | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  expires: Date;
  isCurrent: boolean;
}

export interface SessionWarning {
  warningType: 'approaching_timeout' | 'session_limit_reached';
  message: string;
  expiresAt?: Date;
}

export class SessionManagementService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(
    userId: string,
    currentSessionToken?: string
  ): Promise<SessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expires: { gt: new Date() },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      sessionToken: session.sessionToken,
      deviceName: session.deviceName,
      deviceFingerprint: session.deviceFingerprint,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
      expires: session.expires,
      isCurrent: session.sessionToken === currentSessionToken,
    }));
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionToken: string): Promise<void> {
    await this.prisma.session.update({
      where: { sessionToken },
      data: { lastActivityAt: new Date() },
    });
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    reason: string
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId, // Ensure user owns this session
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Revoke all sessions for a user except optionally the current one
   */
  async revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionToken?: string
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionToken ? { sessionToken: { not: exceptSessionToken } } : {}),
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return result.count;
  }

  /**
   * Revoke all sessions on password change
   */
  async revokeSessionsOnPasswordChange(
    userId: string,
    keepCurrentSession: boolean,
    currentSessionToken?: string
  ): Promise<number> {
    const reason = 'password_change';

    if (keepCurrentSession && currentSessionToken) {
      return this.revokeAllUserSessions(userId, reason, currentSessionToken);
    } else {
      return this.revokeAllUserSessions(userId, reason);
    }
  }

  /**
   * Check if session limit is reached for a user
   */
  async checkSessionLimit(userId: string): Promise<{
    atLimit: boolean;
    activeCount: number;
    maxAllowed: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { maxConcurrentSessions: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const activeCount = await this.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expires: { gt: new Date() },
      },
    });

    return {
      atLimit: activeCount >= user.maxConcurrentSessions,
      activeCount,
      maxAllowed: user.maxConcurrentSessions,
    };
  }

  /**
   * Cleanup inactive sessions for a specific user
   */
  async cleanupInactiveSessions(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoLogoutAfterHours: true },
    });

    if (!user) {
      return 0;
    }

    const inactiveThreshold = new Date();
    inactiveThreshold.setHours(
      inactiveThreshold.getHours() - user.autoLogoutAfterHours
    );

    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        lastActivityAt: { lt: inactiveThreshold },
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'inactivity_timeout',
      },
    });

    return result.count;
  }

  /**
   * Cleanup all inactive sessions (for background job)
   */
  async cleanupAllInactiveSessions(): Promise<number> {
    // Get all users with their timeout settings
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        autoLogoutAfterHours: true,
      },
    });

    let totalRevoked = 0;

    for (const user of users) {
      const count = await this.cleanupInactiveSessions(user.id);
      totalRevoked += count;
    }

    return totalRevoked;
  }

  /**
   * Get session warnings for a user
   */
  async getSessionWarnings(
    userId: string,
    currentSessionToken: string
  ): Promise<SessionWarning[]> {
    const warnings: SessionWarning[] = [];

    // Check if approaching session limit
    const { atLimit, activeCount, maxAllowed } = await this.checkSessionLimit(
      userId
    );

    if (atLimit) {
      warnings.push({
        warningType: 'session_limit_reached',
        message: `You have reached your maximum of ${maxAllowed} concurrent sessions. New logins will revoke the oldest session.`,
      });
    }

    // Check if current session is approaching timeout
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: currentSessionToken },
      include: {
        user: {
          select: { autoLogoutAfterHours: true },
        },
      },
    });

    if (session) {
      const hoursSinceActivity =
        (Date.now() - session.lastActivityAt.getTime()) / (1000 * 60 * 60);
      const hoursRemaining = session.user.autoLogoutAfterHours - hoursSinceActivity;

      // Warn if less than 1 hour remaining
      if (hoursRemaining < 1 && hoursRemaining > 0) {
        const expiresAt = new Date(
          session.lastActivityAt.getTime() +
            session.user.autoLogoutAfterHours * 60 * 60 * 1000
        );

        warnings.push({
          warningType: 'approaching_timeout',
          message: `Your session will expire soon due to inactivity. Any activity will extend your session.`,
          expiresAt,
        });
      }
    }

    return warnings;
  }

  /**
   * Track session metadata when creating a new session
   */
  async enrichSessionMetadata(
    sessionToken: string,
    metadata: SessionMetadata
  ): Promise<void> {
    const deviceName = this.extractDeviceName(metadata.userAgent);

    await this.prisma.session.updateMany({
      where: { sessionToken },
      data: {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceFingerprint: metadata.deviceFingerprint,
        deviceName,
      },
    });
  }

  /**
   * Extract device name from user agent
   */
  private extractDeviceName(userAgent?: string): string | null {
    if (!userAgent) return null;

    const ua = userAgent.toLowerCase();

    // Mobile devices
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android') && ua.includes('mobile')) return 'Android Phone';
    if (ua.includes('android')) return 'Android Tablet';

    // Desktop browsers
    if (ua.includes('mac os x')) return 'Mac';
    if (ua.includes('windows')) return 'Windows PC';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('chrome os')) return 'Chromebook';

    // Browsers
    if (ua.includes('edge')) return 'Edge Browser';
    if (ua.includes('chrome')) return 'Chrome Browser';
    if (ua.includes('firefox')) return 'Firefox Browser';
    if (ua.includes('safari')) return 'Safari Browser';

    return 'Unknown Device';
  }

  /**
   * Get session count by device type
   */
  async getSessionsByDevice(userId: string): Promise<{
    deviceName: string;
    count: number;
  }[]> {
    const sessions = await this.prisma.session.groupBy({
      by: ['deviceName'],
      where: {
        userId,
        revokedAt: null,
        expires: { gt: new Date() },
      },
      _count: true,
    });

    return sessions.map((s) => ({
      deviceName: s.deviceName || 'Unknown',
      count: s._count,
    }));
  }

  /**
   * Validate session is still active and not revoked
   */
  async validateSession(sessionToken: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
    });

    if (!session) return false;
    if (session.revokedAt) return false;
    if (session.expires < new Date()) return false;

    return true;
  }

  /**
   * Get session details
   */
  async getSessionDetails(sessionToken: string): Promise<SessionInfo | null> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
    });

    if (!session) return null;

    return {
      id: session.id,
      sessionToken: session.sessionToken,
      deviceName: session.deviceName,
      deviceFingerprint: session.deviceFingerprint,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
      expires: session.expires,
      isCurrent: true,
    };
  }
}
