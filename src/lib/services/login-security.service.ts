/**
 * Login Security Service
 * Implements comprehensive login security features including:
 * - Progressive delays on failed attempts
 * - CAPTCHA requirements after threshold
 * - Comprehensive login attempt logging
 * - Anomaly detection for locations and devices
 * - Device fingerprinting integration
 */

import { PrismaClient } from '@prisma/client';
import { EmailService } from './email/email.service';

// Configuration constants
const PROGRESSIVE_DELAY_BASE_MS = 1000; // 1 second base delay
const CAPTCHA_THRESHOLD = 3; // Require CAPTCHA after 3 failed attempts
const ACCOUNT_LOCKOUT_THRESHOLD = 10; // Lock account after 10 failed attempts
const ACCOUNT_LOCKOUT_DURATION_MINUTES = 30; // Lock for 30 minutes
const FAILED_ATTEMPT_WINDOW_MINUTES = 15; // Reset counter after 15 minutes of inactivity
const MAX_PROGRESSIVE_DELAY_MS = 16000; // Maximum delay of 16 seconds (2^4 * 1000)

export interface LoginAttemptContext {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface LoginSecurityCheck {
  isAllowed: boolean;
  requiresCaptcha: boolean;
  requiredDelay: number; // milliseconds
  isLocked: boolean;
  lockedUntil?: Date;
  failedAttempts: number;
  reason?: string;
}

export interface LoginAttemptResult {
  id: string;
  timestamp: Date;
  isAnomalous: boolean;
  anomalyReasons: string[];
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  reasons: string[];
  confidence: number; // 0-1
}

export class LoginSecurityService {
  constructor(
    private prisma: PrismaClient,
    private emailService?: EmailService
  ) {}

  /**
   * Check if login is allowed and calculate required security measures
   * Implements progressive delays and CAPTCHA requirements
   */
  async checkLoginSecurity(
    email: string,
    context: LoginAttemptContext
  ): Promise<LoginSecurityCheck> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        locked_until: true,
        failed_login_count: true,
        last_failed_login: true,
        captcha_required_at: true,
      },
    });

    // If user doesn't exist, return minimal info (don't leak user existence)
    if (!user) {
      return {
        isAllowed: true,
        requiresCaptcha: false,
        requiredDelay: 0,
        isLocked: false,
        failedAttempts: 0,
      };
    }

    const now = new Date();

    // Check if account is locked
    if (user.locked_until && user.locked_until > now) {
      return {
        isAllowed: false,
        requiresCaptcha: false,
        requiredDelay: 0,
        isLocked: true,
        lockedUntil: user.locked_until,
        failedAttempts: user.failed_login_count,
        reason: 'ACCOUNT_LOCKED',
      };
    }

    // Calculate if failed attempts are within the window
    const windowCutoff = new Date(now.getTime() - FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    const failedAttemptsInWindow = 
      user.last_failed_login && user.last_failed_login > windowCutoff
        ? user.failed_login_count
        : 0;

    // Calculate progressive delay (exponential backoff)
    const requiredDelay = this.calculateProgressiveDelay(failedAttemptsInWindow);

    // Check if CAPTCHA is required (after 3 failed attempts)
    const requiresCaptcha = failedAttemptsInWindow >= CAPTCHA_THRESHOLD;

    return {
      isAllowed: true,
      requiresCaptcha,
      requiredDelay,
      isLocked: false,
      failedAttempts: failedAttemptsInWindow,
    };
  }

  /**
   * Calculate progressive delay based on failed attempt count
   * Formula: delay = min(1000 * 2^(attempts-1), MAX_DELAY)
   * Examples: 1st = 1s, 2nd = 2s, 3rd = 4s, 4th = 8s, 5th = 16s (capped)
   */
  private calculateProgressiveDelay(failedAttempts: number): number {
    if (failedAttempts === 0) return 0;
    
    const delay = PROGRESSIVE_DELAY_BASE_MS * Math.pow(2, failedAttempts - 1);
    return Math.min(delay, MAX_PROGRESSIVE_DELAY_MS);
  }

  /**
   * Apply progressive delay before processing login
   */
  async applyProgressiveDelay(delayMs: number): Promise<void> {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Record a failed login attempt with comprehensive logging
   */
  async recordFailedAttempt(
    email: string,
    failureReason: string,
    context: LoginAttemptContext,
    requiresCaptcha: boolean = false,
    captchaVerified: boolean = false
  ): Promise<LoginAttemptResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        failed_login_count: true,
        last_failed_login: true,
        total_failed_attempts: true,
        known_locations: true,
        known_devices: true,
      },
    });

    const now = new Date();
    const location = await this.resolveIPLocation(context.ipAddress);

    // Detect anomalies
    let anomalyDetection: AnomalyDetectionResult = { isAnomalous: false, reasons: [], confidence: 0 };
    if (user) {
      anomalyDetection = await this.detectAnomalies(user.id, context, location);
    }

    // Create login attempt record
    const loginAttempt = await this.prisma.loginAttempt.create({
      data: {
        userId: user?.id || null,
        email: email.toLowerCase(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceFingerprint: context.deviceFingerprint,
        success: false,
        failureReason,
        requiresCaptcha,
        captchaVerified: captchaVerified || null,
        locationCountry: location.country,
        locationRegion: location.region,
        locationCity: location.city,
        isAnomalous: anomalyDetection.isAnomalous,
        anomalyReasons: anomalyDetection.reasons,
        timestamp: now,
      },
    });

    // Update user's failed attempt counters if user exists
    if (user) {
      const windowCutoff = new Date(now.getTime() - FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
      let newFailedCount = user.failed_login_count + 1;
      
      // Reset counter if outside window
      if (user.last_failed_login && user.last_failed_login < windowCutoff) {
        newFailedCount = 1;
      }

      // Update user record
      const updateData: any = {
        failed_login_count: newFailedCount,
        last_failed_login: now,
        total_failed_attempts: user.total_failed_attempts + 1,
      };

      // Set CAPTCHA requirement flag if threshold reached
      if (newFailedCount >= CAPTCHA_THRESHOLD && !user.captcha_required_at) {
        updateData.captcha_required_at = now;
      }

      // Lock account if threshold reached
      if (newFailedCount >= ACCOUNT_LOCKOUT_THRESHOLD) {
        const lockedUntil = new Date(now.getTime() + ACCOUNT_LOCKOUT_DURATION_MINUTES * 60 * 1000);
        updateData.locked_until = lockedUntil;
        updateData.isActive = false;

        // Send lockout notification email
        if (this.emailService) {
          try {
            await this.emailService.sendTransactional({
              email: user.email,
              subject: 'Account Security Alert - Account Locked',
              template: 'account-locked',
              variables: {
                userName: user.name || 'User',
                lockedUntil: lockedUntil.toISOString(),
                lockoutMinutes: ACCOUNT_LOCKOUT_DURATION_MINUTES,
                ipAddress: context.ipAddress || 'Unknown',
                failedAttempts: newFailedCount,
                unlockTime: lockedUntil.toLocaleString(),
              },
            });
          } catch (error) {
            console.error('Failed to send account lockout email:', error);
          }
        }
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    return {
      id: loginAttempt.id,
      timestamp: loginAttempt.timestamp,
      isAnomalous: anomalyDetection.isAnomalous,
      anomalyReasons: anomalyDetection.reasons,
    };
  }

  /**
   * Record a successful login attempt with comprehensive logging
   */
  async recordSuccessfulAttempt(
    userId: string,
    email: string,
    context: LoginAttemptContext
  ): Promise<LoginAttemptResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        known_locations: true,
        known_devices: true,
        last_login_ip: true,
        last_login_location: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const location = await this.resolveIPLocation(context.ipAddress);

    // Detect anomalies even on successful logins
    const anomalyDetection = await this.detectAnomalies(userId, context, location);

    // Create login attempt record
    const loginAttempt = await this.prisma.loginAttempt.create({
      data: {
        userId,
        email: email.toLowerCase(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceFingerprint: context.deviceFingerprint,
        success: true,
        failureReason: null,
        requiresCaptcha: false,
        captchaVerified: null,
        locationCountry: location.country,
        locationRegion: location.region,
        locationCity: location.city,
        isAnomalous: anomalyDetection.isAnomalous,
        anomalyReasons: anomalyDetection.reasons,
        timestamp: now,
      },
    });

    // Update user's login metadata and reset failed attempts
    const locationString = this.formatLocationString(location);
    const updateData: any = {
      failed_login_count: 0,
      last_failed_login: null,
      captcha_required_at: null,
      lastLoginAt: now,
      last_login_ip: context.ipAddress,
      last_login_location: locationString,
      locked_until: null,
      isActive: true,
    };

    // Add location to known locations if not already present
    if (locationString && !user.known_locations?.includes(locationString)) {
      updateData.known_locations = {
        push: locationString,
      };
    }

    // Add device to known devices if not already present
    if (context.deviceFingerprint && !user.known_devices?.includes(context.deviceFingerprint)) {
      updateData.known_devices = {
        push: context.deviceFingerprint,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Send security alert if login was anomalous
    if (anomalyDetection.isAnomalous && this.emailService) {
      try {
        const userWithEmail = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        if (userWithEmail) {
          await this.emailService.sendTransactional({
            email: userWithEmail.email,
            subject: 'New Sign-In from Unusual Location or Device',
            template: 'unusual-login-alert',
            variables: {
              userName: userWithEmail.name || 'User',
              ipAddress: context.ipAddress || 'Unknown',
              location: locationString || 'Unknown',
              device: context.userAgent || 'Unknown',
              timestamp: now.toLocaleString(),
              anomalyReasons: anomalyDetection.reasons.join(', '),
            },
          });
        }
      } catch (error) {
        console.error('Failed to send unusual login alert email:', error);
      }
    }

    return {
      id: loginAttempt.id,
      timestamp: loginAttempt.timestamp,
      isAnomalous: anomalyDetection.isAnomalous,
      anomalyReasons: anomalyDetection.reasons,
    };
  }

  /**
   * Detect anomalies in login attempt based on location and device
   */
  private async detectAnomalies(
    userId: string,
    context: LoginAttemptContext,
    location: { country?: string; region?: string; city?: string }
  ): Promise<AnomalyDetectionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        known_locations: true,
        known_devices: true,
        last_login_ip: true,
        lastLoginAt: true,
        loginAttempts: {
          where: {
            success: true,
            timestamp: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 20,
        },
      },
    });

    if (!user || user.loginAttempts.length === 0) {
      // New user or no history - not anomalous
      return { isAnomalous: false, reasons: [], confidence: 0 };
    }

    const reasons: string[] = [];
    let confidence = 0;

    // Check for new location
    const locationString = this.formatLocationString(location);
    const isNewLocation = locationString && !user.known_locations?.includes(locationString);
    
    if (isNewLocation) {
      // Check if it's a completely new country
      const knownCountries = user.known_locations
        ?.map(loc => loc.split(':')[0])
        .filter(Boolean) || [];
      
      if (location.country && !knownCountries.includes(location.country)) {
        reasons.push('NEW_COUNTRY');
        confidence += 0.4;
      } else {
        reasons.push('NEW_LOCATION');
        confidence += 0.2;
      }
    }

    // Check for new device
    if (context.deviceFingerprint && !user.known_devices?.includes(context.deviceFingerprint)) {
      reasons.push('NEW_DEVICE');
      confidence += 0.3;
    }

    // Check for impossible travel (login from very different location in short time)
    if (user.lastLoginAt && user.last_login_ip && context.ipAddress) {
      const timeSinceLastLogin = Date.now() - user.lastLoginAt.getTime();
      const hoursSinceLastLogin = timeSinceLastLogin / (1000 * 60 * 60);

      // If last login was recent and from different country, flag as suspicious
      if (hoursSinceLastLogin < 2) {
        const lastLocation = user.known_locations?.[user.known_locations.length - 1];
        const lastCountry = lastLocation?.split(':')[0];
        
        if (location.country && lastCountry && location.country !== lastCountry) {
          reasons.push('IMPOSSIBLE_TRAVEL');
          confidence += 0.5;
        }
      }
    }

    // Check for suspicious user agent patterns
    if (context.userAgent) {
      const suspiciousPatterns = [
        /bot/i, /crawler/i, /spider/i, /scraper/i,
        /curl/i, /wget/i, /python/i, /java/i,
      ];
      
      if (suspiciousPatterns.some(pattern => pattern.test(context.userAgent || ''))) {
        reasons.push('SUSPICIOUS_USER_AGENT');
        confidence += 0.3;
      }
    }

    const isAnomalous = confidence >= 0.3; // Threshold for flagging as anomalous

    return {
      isAnomalous,
      reasons,
      confidence: Math.min(confidence, 1.0),
    };
  }

  /**
   * Resolve IP address to geographic location
   * Note: This is a placeholder. In production, integrate with MaxMind, IP2Location, or similar service
   */
  private async resolveIPLocation(ipAddress?: string): Promise<{
    country?: string;
    region?: string;
    city?: string;
  }> {
    if (!ipAddress) {
      return {};
    }

    // TODO: Integrate with IP geolocation service (MaxMind GeoIP2, IP2Location, IPStack, etc.)
    // For now, return empty to avoid errors
    // Example integration:
    // const response = await fetch(`https://api.ipstack.com/${ipAddress}?access_key=${process.env.IPSTACK_API_KEY}`);
    // const data = await response.json();
    // return {
    //   country: data.country_name,
    //   region: data.region_name,
    //   city: data.city,
    // };

    return {};
  }

  /**
   * Format location as a string for storage
   */
  private formatLocationString(location: { country?: string; region?: string; city?: string }): string | null {
    const parts = [location.country, location.region, location.city].filter(Boolean);
    return parts.length > 0 ? parts.join(':') : null;
  }

  /**
   * Get login attempt history for a user
   */
  async getLoginAttemptHistory(
    userId: string,
    options: {
      limit?: number;
      includeSuccessful?: boolean;
      includeAnomalous?: boolean;
    } = {}
  ) {
    const { limit = 50, includeSuccessful = true, includeAnomalous = false } = options;

    const where: any = { userId };
    
    if (!includeSuccessful) {
      where.success = false;
    }
    
    if (includeAnomalous) {
      where.isAnomalous = true;
    }

    return this.prisma.loginAttempt.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get security statistics for monitoring
   */
  async getSecurityStats(timeWindow: 'hour' | 'day' | 'week' = 'day') {
    const now = new Date();
    const windowMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[timeWindow];

    const since = new Date(now.getTime() - windowMs);

    const [
      totalAttempts,
      failedAttempts,
      successfulAttempts,
      anomalousAttempts,
      lockedAccounts,
      captchaRequiredAccounts,
    ] = await Promise.all([
      this.prisma.loginAttempt.count({
        where: { timestamp: { gte: since } },
      }),
      this.prisma.loginAttempt.count({
        where: {
          timestamp: { gte: since },
          success: false,
        },
      }),
      this.prisma.loginAttempt.count({
        where: {
          timestamp: { gte: since },
          success: true,
        },
      }),
      this.prisma.loginAttempt.count({
        where: {
          timestamp: { gte: since },
          isAnomalous: true,
        },
      }),
      this.prisma.user.count({
        where: {
          locked_until: { gt: now },
        },
      }),
      this.prisma.user.count({
        where: {
          captcha_required_at: { not: null },
        },
      }),
    ]);

    return {
      timeWindow,
      since,
      totalAttempts,
      failedAttempts,
      successfulAttempts,
      anomalousAttempts,
      lockedAccounts,
      captchaRequiredAccounts,
      failureRate: totalAttempts > 0 ? failedAttempts / totalAttempts : 0,
      anomalyRate: totalAttempts > 0 ? anomalousAttempts / totalAttempts : 0,
    };
  }

  /**
   * Manually unlock a user account (admin action)
   */
  async unlockAccount(userId: string, adminId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locked_until: null,
        failed_login_count: 0,
        last_failed_login: null,
        captcha_required_at: null,
        isActive: true,
      },
    });

    // Log the admin action
    await this.prisma.auditEvent.create({
      data: {
        userId: adminId,
        entityType: 'user',
        entityId: userId,
        action: 'ACCOUNT_MANUALLY_UNLOCKED',
        afterJson: { unlockedBy: adminId },
      },
    });
  }

  /**
   * Get devices associated with a user
   */
  async getUserDevices(userId: string) {
    const loginAttempts = await this.prisma.loginAttempt.findMany({
      where: {
        userId,
        deviceFingerprint: { not: null },
        success: true,
      },
      orderBy: { timestamp: 'desc' },
      distinct: ['deviceFingerprint'],
      take: 10,
    });

    return loginAttempts.map(attempt => ({
      fingerprint: attempt.deviceFingerprint,
      lastUsed: attempt.timestamp,
      userAgent: attempt.userAgent,
      location: [attempt.locationCountry, attempt.locationRegion, attempt.locationCity]
        .filter(Boolean)
        .join(', '),
    }));
  }
}
