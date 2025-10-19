/**
 * 2FA Security Events Service
 * 
 * Tracks and logs all security-related events for two-factor authentication.
 * Provides real-time event tracking and anomaly detection.
 * 
 * Features:
 * - Log authentication attempts (success/failure)
 * - Track configuration changes (setup, disable, reset)
 * - Monitor security events (lockouts, suspicious activities)
 * - Anomaly detection and scoring
 * - Event querying and filtering
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface SecurityEventInput {
  userId: string;
  eventType: 
    | 'setup' 
    | 'disable' 
    | 'failed_attempt' 
    | 'successful_auth' 
    | 'lockout' 
    | 'backup_code_usage'
    | 'backup_code_regeneration'
    | 'admin_reset'
    | 'emergency_code_generated'
    | 'suspicious_activity';
  eventCategory: 'authentication' | 'configuration' | 'security';
  success: boolean;
  failureReason?: string;
  method?: 'totp' | 'sms' | 'backup_code';
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  locationCountry?: string;
  locationRegion?: string;
  locationCity?: string;
  adminId?: string;
  adminAction?: string;
  adminReason?: string;
  metadata?: any;
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  score: number;
  reasons: string[];
}

export class TwoFactorSecurityEventsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Log a security event
   */
  async logEvent(input: SecurityEventInput): Promise<void> {
    try {
      // Perform anomaly detection
      const anomalyResult = await this.detectAnomaly(input);

      await this.prisma.twoFactorSecurityEvent.create({
        data: {
          userId: input.userId,
          eventType: input.eventType,
          eventCategory: input.eventCategory,
          success: input.success,
          failureReason: input.failureReason,
          method: input.method,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          deviceFingerprint: input.deviceFingerprint,
          locationCountry: input.locationCountry,
          locationRegion: input.locationRegion,
          locationCity: input.locationCity,
          isAnomalous: anomalyResult.isAnomalous,
          anomalyScore: anomalyResult.score > 0 ? new Decimal(anomalyResult.score) : null,
          anomalyReasons: anomalyResult.reasons,
          adminId: input.adminId,
          adminAction: input.adminAction,
          adminReason: input.adminReason,
          metadata: input.metadata || null,
        },
      });

      // If highly anomalous, trigger alert
      if (anomalyResult.isAnomalous && anomalyResult.score >= 70) {
        console.warn('[SecurityEvents] High anomaly detected:', {
          userId: input.userId,
          eventType: input.eventType,
          score: anomalyResult.score,
          reasons: anomalyResult.reasons,
        });
      }
    } catch (error) {
      // Don't throw - log error but don't break authentication flow
      console.error('[SecurityEvents] Failed to log event:', error);
    }
  }

  /**
   * Detect anomalies in security events
   */
  private async detectAnomaly(input: SecurityEventInput): Promise<AnomalyDetectionResult> {
    const reasons: string[] = [];
    let score = 0;

    // Check for suspicious patterns based on event type
    if (input.eventType === 'failed_attempt') {
      // Check recent failure rate for this user
      const recentFailures = await this.getRecentFailureCount(input.userId, 15); // 15 minutes
      if (recentFailures >= 3) {
        reasons.push('Multiple failed attempts in short period');
        score += 30;
      }
      if (recentFailures >= 5) {
        reasons.push('Excessive failed attempts - possible brute force');
        score += 40;
      }
    }

    // Check for geographic anomalies
    if (input.locationCountry && input.ipAddress) {
      const hasUnusualLocation = await this.checkUnusualLocation(
        input.userId,
        input.locationCountry
      );
      if (hasUnusualLocation) {
        reasons.push('Login from unusual geographic location');
        score += 25;
      }
    }

    // Check for unusual time of activity
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 5) {
      // Activity during unusual hours (2 AM - 5 AM)
      const userHistory = await this.getUserActivityPattern(input.userId);
      if (!userHistory.activeInLateHours) {
        reasons.push('Activity during unusual hours');
        score += 15;
      }
    }

    // Check for rapid authentication attempts across multiple accounts
    if (input.ipAddress) {
      const rapidAttempts = await this.checkRapidAttemptsFromIP(input.ipAddress, 5); // 5 minutes
      if (rapidAttempts >= 5) {
        reasons.push('Rapid attempts from same IP across multiple accounts');
        score += 50;
      }
    }

    // Check device fingerprint changes
    if (input.deviceFingerprint && input.eventType === 'successful_auth') {
      const isNewDevice = await this.checkNewDevice(input.userId, input.deviceFingerprint);
      if (isNewDevice) {
        reasons.push('Login from new device');
        score += 10;
      }
    }

    return {
      isAnomalous: score >= 25, // Threshold for anomaly flag
      score: Math.min(score, 100),
      reasons,
    };
  }

  /**
   * Get recent failure count for a user
   */
  private async getRecentFailureCount(userId: string, minutesAgo: number): Promise<number> {
    const since = new Date(Date.now() - minutesAgo * 60 * 1000);
    
    return this.prisma.twoFactorSecurityEvent.count({
      where: {
        userId,
        eventType: 'failed_attempt',
        timestamp: { gte: since },
      },
    });
  }

  /**
   * Check if location is unusual for user
   */
  private async checkUnusualLocation(userId: string, country: string): Promise<boolean> {
    const recentEvents = await this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        userId,
        locationCountry: { not: null },
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      select: {
        locationCountry: true,
      },
      take: 50,
    });

    const knownCountries = new Set(recentEvents.map(e => e.locationCountry).filter(Boolean));
    return knownCountries.size > 0 && !knownCountries.has(country);
  }

  /**
   * Get user activity pattern
   */
  private async getUserActivityPattern(userId: string): Promise<{ activeInLateHours: boolean }> {
    const recentEvents = await this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        userId,
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        timestamp: true,
      },
    });

    // Check if user has history of activity between 2 AM - 5 AM
    const lateHourActivity = recentEvents.filter(e => {
      const hour = e.timestamp.getHours();
      return hour >= 2 && hour <= 5;
    });

    return {
      activeInLateHours: lateHourActivity.length > 3,
    };
  }

  /**
   * Check for rapid attempts from an IP address
   */
  private async checkRapidAttemptsFromIP(ipAddress: string, minutesAgo: number): Promise<number> {
    const since = new Date(Date.now() - minutesAgo * 60 * 1000);

    return this.prisma.twoFactorSecurityEvent.count({
      where: {
        ipAddress,
        timestamp: { gte: since },
        eventCategory: 'authentication',
      },
    });
  }

  /**
   * Check if device is new for user
   */
  private async checkNewDevice(userId: string, deviceFingerprint: string): Promise<boolean> {
    const existingDevice = await this.prisma.twoFactorSecurityEvent.findFirst({
      where: {
        userId,
        deviceFingerprint,
        timestamp: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
      },
    });

    return !existingDevice;
  }

  /**
   * Get recent events for a user
   */
  async getUserEvents(
    userId: string,
    options?: {
      limit?: number;
      eventType?: string;
      eventCategory?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const { limit = 50, eventType, eventCategory, startDate, endDate } = options || {};

    return this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        userId,
        ...(eventType && { eventType }),
        ...(eventCategory && { eventCategory }),
        ...(startDate || endDate ? {
          timestamp: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Get anomalous events
   */
  async getAnomalousEvents(
    options?: {
      limit?: number;
      minScore?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const { limit = 100, minScore = 50, startDate, endDate } = options || {};

    return this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        isAnomalous: true,
        anomalyScore: { gte: new Decimal(minScore) },
        ...(startDate || endDate ? {
          timestamp: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      orderBy: [
        { anomalyScore: 'desc' },
        { timestamp: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Get failed attempts summary
   */
  async getFailedAttemptsSummary(startDate: Date, endDate: Date) {
    const events = await this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        eventType: 'failed_attempt',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        userId: true,
        ipAddress: true,
        locationCountry: true,
        failureReason: true,
        timestamp: true,
      },
    });

    // Aggregate by failure reason
    const byReason: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byIP: Record<string, number> = {};

    events.forEach(event => {
      if (event.failureReason) {
        byReason[event.failureReason] = (byReason[event.failureReason] || 0) + 1;
      }
      if (event.locationCountry) {
        byCountry[event.locationCountry] = (byCountry[event.locationCountry] || 0) + 1;
      }
      if (event.userId) {
        byUser[event.userId] = (byUser[event.userId] || 0) + 1;
      }
      if (event.ipAddress) {
        byIP[event.ipAddress] = (byIP[event.ipAddress] || 0) + 1;
      }
    });

    return {
      total: events.length,
      byReason,
      byCountry,
      topUsers: Object.entries(byUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
      topIPs: Object.entries(byIP)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ipAddress, count]) => ({ ipAddress, count })),
    };
  }
}
