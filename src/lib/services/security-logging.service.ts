/**
 * Security Logging Service
 * Dedicated service for logging security-sensitive events
 * Extends the existing audit logging with 2FA-specific tracking
 * 
 * Features:
 * - Comprehensive 2FA event logging
 * - Device and location tracking
 * - User security timeline
 * - Admin security dashboard metrics
 * - Anomaly detection integration
 * - Backup code tracking
 * - Phone number change tracking
 */

import { PrismaClient } from '@prisma/client';
import { auditService, AuditService, AUDIT_ACTIONS } from './audit.service';

export enum SecurityEventType {
  // 2FA Setup Events
  TWO_FACTOR_SETUP_INITIATED = 'TWO_FACTOR_SETUP_INITIATED',
  TWO_FACTOR_SETUP_COMPLETED = 'TWO_FACTOR_SETUP_COMPLETED',
  TWO_FACTOR_SETUP_FAILED = 'TWO_FACTOR_SETUP_FAILED',
  
  // 2FA Disable Events
  TWO_FACTOR_DISABLE_INITIATED = 'TWO_FACTOR_DISABLE_INITIATED',
  TWO_FACTOR_DISABLE_COMPLETED = 'TWO_FACTOR_DISABLE_COMPLETED',
  TWO_FACTOR_DISABLE_FAILED = 'TWO_FACTOR_DISABLE_FAILED',
  
  // 2FA Verification Events
  TWO_FACTOR_VERIFICATION_SUCCESS = 'TWO_FACTOR_VERIFICATION_SUCCESS',
  TWO_FACTOR_VERIFICATION_FAILED = 'TWO_FACTOR_VERIFICATION_FAILED',
  
  // Method-Specific Events
  TOTP_SETUP_INITIATED = 'TOTP_SETUP_INITIATED',
  TOTP_SETUP_COMPLETED = 'TOTP_SETUP_COMPLETED',
  TOTP_VERIFICATION_SUCCESS = 'TOTP_VERIFICATION_SUCCESS',
  TOTP_VERIFICATION_FAILED = 'TOTP_VERIFICATION_FAILED',
  TOTP_DISABLED = 'TOTP_DISABLED',
  
  SMS_SETUP_INITIATED = 'SMS_SETUP_INITIATED',
  SMS_SETUP_COMPLETED = 'SMS_SETUP_COMPLETED',
  SMS_VERIFICATION_SUCCESS = 'SMS_VERIFICATION_SUCCESS',
  SMS_VERIFICATION_FAILED = 'SMS_VERIFICATION_FAILED',
  SMS_DISABLED = 'SMS_DISABLED',
  SMS_CODE_SENT = 'SMS_CODE_SENT',
  SMS_CODE_DELIVERY_FAILED = 'SMS_CODE_DELIVERY_FAILED',
  
  // Backup Code Events
  BACKUP_CODES_GENERATED = 'BACKUP_CODES_GENERATED',
  BACKUP_CODES_REGENERATED = 'BACKUP_CODES_REGENERATED',
  BACKUP_CODE_USED = 'BACKUP_CODE_USED',
  BACKUP_CODE_VERIFICATION_FAILED = 'BACKUP_CODE_VERIFICATION_FAILED',
  BACKUP_CODE_LOW_WARNING = 'BACKUP_CODE_LOW_WARNING',
  BACKUP_CODE_DEPLETED = 'BACKUP_CODE_DEPLETED',
  
  // Phone Number Events
  PHONE_NUMBER_ADDED = 'PHONE_NUMBER_ADDED',
  PHONE_NUMBER_CHANGED = 'PHONE_NUMBER_CHANGED',
  PHONE_NUMBER_REMOVED = 'PHONE_NUMBER_REMOVED',
  PHONE_NUMBER_VERIFIED = 'PHONE_NUMBER_VERIFIED',
  PHONE_NUMBER_VERIFICATION_FAILED = 'PHONE_NUMBER_VERIFICATION_FAILED',
  
  // Trusted Device Events
  TRUSTED_DEVICE_ADDED = 'TRUSTED_DEVICE_ADDED',
  TRUSTED_DEVICE_REMOVED = 'TRUSTED_DEVICE_REMOVED',
  TRUSTED_DEVICE_USED = 'TRUSTED_DEVICE_USED',
  ALL_TRUSTED_DEVICES_REVOKED = 'ALL_TRUSTED_DEVICES_REVOKED',
  
  // Security Alerts
  SUSPICIOUS_LOGIN_DETECTED = 'SUSPICIOUS_LOGIN_DETECTED',
  BRUTE_FORCE_DETECTED = 'BRUTE_FORCE_DETECTED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  UNUSUAL_DEVICE_DETECTED = 'UNUSUAL_DEVICE_DETECTED',
  UNUSUAL_LOCATION_DETECTED = 'UNUSUAL_LOCATION_DETECTED',
  
  // Preference Changes
  PREFERRED_2FA_METHOD_CHANGED = 'PREFERRED_2FA_METHOD_CHANGED',
}

export interface SecurityEventContext {
  userId: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  deviceName?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

export interface SecurityEventMetadata {
  method?: '2FA' | 'TOTP' | 'SMS' | 'BACKUP_CODE';
  success?: boolean;
  failureReason?: string;
  remainingBackupCodes?: number;
  phoneNumber?: string; // Should be masked (e.g., ***8901)
  previousPhoneNumber?: string; // Should be masked
  previousMethod?: string;
  newMethod?: string;
  attemptNumber?: number;
  isAnomalous?: boolean;
  anomalyReasons?: string[];
  initiatedBy?: 'USER' | 'ADMIN' | 'SYSTEM';
  verificationDuration?: number; // milliseconds
  [key: string]: any;
}

export interface SecurityTimelineEvent {
  id: string;
  timestamp: Date;
  eventType: SecurityEventType;
  description: string;
  metadata: SecurityEventMetadata;
  ipAddress?: string;
  location?: string;
  device?: string;
  success?: boolean;
}

export interface SecurityDashboardMetrics {
  twoFactorAdoption: {
    total: number;
    enabled: number;
    percentage: number;
    byMethod: {
      totp: number;
      sms: number;
      both: number;
    };
  };
  verificationMetrics: {
    last24Hours: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
    last7Days: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
    last30Days: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
  };
  backupCodeUsage: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  securityAlerts: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    byType: {
      suspiciousLogin: number;
      bruteForce: number;
      accountLocked: number;
      unusualDevice: number;
      unusualLocation: number;
    };
  };
  phoneNumberChanges: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  recentActivity: {
    setupEvents: number;
    disableEvents: number;
    verificationAttempts: number;
  };
}

export class SecurityLoggingService {
  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Log 2FA setup initiation
   */
  async logTwoFactorSetupInitiated(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    const eventType = metadata.method === 'TOTP' 
      ? SecurityEventType.TOTP_SETUP_INITIATED 
      : SecurityEventType.SMS_SETUP_INITIATED;

    await this.logSecurityEvent(eventType, context, metadata);
  }

  /**
   * Log 2FA setup completion
   */
  async logTwoFactorSetupCompleted(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    const eventType = metadata.method === 'TOTP' 
      ? SecurityEventType.TOTP_SETUP_COMPLETED 
      : SecurityEventType.SMS_SETUP_COMPLETED;

    await this.logSecurityEvent(eventType, context, {
      ...metadata,
      success: true,
    });
  }

  /**
   * Log 2FA setup failure
   */
  async logTwoFactorSetupFailed(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.TWO_FACTOR_SETUP_FAILED,
      context,
      {
        ...metadata,
        success: false,
      }
    );
  }

  /**
   * Log 2FA disable initiation
   */
  async logTwoFactorDisableInitiated(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.TWO_FACTOR_DISABLE_INITIATED,
      context,
      metadata
    );
  }

  /**
   * Log 2FA disable completion
   */
  async logTwoFactorDisableCompleted(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.TWO_FACTOR_DISABLE_COMPLETED,
      context,
      {
        ...metadata,
        success: true,
      }
    );
  }

  /**
   * Log successful 2FA verification
   */
  async logTwoFactorVerificationSuccess(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    let eventType: SecurityEventType;
    
    if (metadata.method === 'TOTP') {
      eventType = SecurityEventType.TOTP_VERIFICATION_SUCCESS;
    } else if (metadata.method === 'SMS') {
      eventType = SecurityEventType.SMS_VERIFICATION_SUCCESS;
    } else if (metadata.method === 'BACKUP_CODE') {
      eventType = SecurityEventType.BACKUP_CODE_USED;
    } else {
      eventType = SecurityEventType.TWO_FACTOR_VERIFICATION_SUCCESS;
    }

    await this.logSecurityEvent(eventType, context, {
      ...metadata,
      success: true,
    });
  }

  /**
   * Log failed 2FA verification
   */
  async logTwoFactorVerificationFailed(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    let eventType: SecurityEventType;
    
    if (metadata.method === 'TOTP') {
      eventType = SecurityEventType.TOTP_VERIFICATION_FAILED;
    } else if (metadata.method === 'SMS') {
      eventType = SecurityEventType.SMS_VERIFICATION_FAILED;
    } else if (metadata.method === 'BACKUP_CODE') {
      eventType = SecurityEventType.BACKUP_CODE_VERIFICATION_FAILED;
    } else {
      eventType = SecurityEventType.TWO_FACTOR_VERIFICATION_FAILED;
    }

    await this.logSecurityEvent(eventType, context, {
      ...metadata,
      success: false,
    });
  }

  /**
   * Log backup code usage
   */
  async logBackupCodeUsed(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.BACKUP_CODE_USED,
      context,
      {
        ...metadata,
        success: true,
      }
    );

    // Check if backup codes are running low and log warning
    if (metadata.remainingBackupCodes !== undefined && metadata.remainingBackupCodes < 3) {
      await this.logSecurityEvent(
        SecurityEventType.BACKUP_CODE_LOW_WARNING,
        context,
        {
          remainingBackupCodes: metadata.remainingBackupCodes,
        }
      );
    }

    // Log if all backup codes are depleted
    if (metadata.remainingBackupCodes === 0) {
      await this.logSecurityEvent(
        SecurityEventType.BACKUP_CODE_DEPLETED,
        context,
        {
          remainingBackupCodes: 0,
        }
      );
    }
  }

  /**
   * Log backup codes generation/regeneration
   */
  async logBackupCodesGenerated(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata & { isRegeneration: boolean; count: number }
  ): Promise<void> {
    const eventType = metadata.isRegeneration
      ? SecurityEventType.BACKUP_CODES_REGENERATED
      : SecurityEventType.BACKUP_CODES_GENERATED;

    await this.logSecurityEvent(eventType, context, metadata);
  }

  /**
   * Log phone number addition
   */
  async logPhoneNumberAdded(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata & { phoneNumber: string }
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PHONE_NUMBER_ADDED,
      context,
      metadata
    );
  }

  /**
   * Log phone number change
   */
  async logPhoneNumberChanged(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata & { 
      previousPhoneNumber: string;
      phoneNumber: string;
    }
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PHONE_NUMBER_CHANGED,
      context,
      metadata
    );
  }

  /**
   * Log phone number removal
   */
  async logPhoneNumberRemoved(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata & { phoneNumber: string }
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PHONE_NUMBER_REMOVED,
      context,
      metadata
    );
  }

  /**
   * Log phone number verification
   */
  async logPhoneNumberVerified(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PHONE_NUMBER_VERIFIED,
      context,
      {
        ...metadata,
        success: true,
      }
    );
  }

  /**
   * Log trusted device addition
   */
  async logTrustedDeviceAdded(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.TRUSTED_DEVICE_ADDED,
      context,
      metadata
    );
  }

  /**
   * Log trusted device removal
   */
  async logTrustedDeviceRemoved(
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.TRUSTED_DEVICE_REMOVED,
      context,
      metadata
    );
  }

  /**
   * Log security alert
   */
  async logSecurityAlert(
    eventType: SecurityEventType,
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    await this.logSecurityEvent(eventType, context, {
      ...metadata,
      isSecurityAlert: true,
    });
  }

  /**
   * Core security event logging method
   * Uses existing AuditEvent model with enhanced metadata
   */
  private async logSecurityEvent(
    eventType: SecurityEventType,
    context: SecurityEventContext,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    try {
      // Map to existing audit action if available, otherwise use the event type
      const auditAction = this.mapEventTypeToAuditAction(eventType);

      // Format location string
      const locationString = context.location
        ? `${context.location.city || 'Unknown'}, ${context.location.region || ''}, ${context.location.country || ''}`
        : undefined;

      // Create comprehensive metadata
      const eventMetadata = {
        ...metadata,
        eventType,
        deviceName: context.deviceName,
        deviceFingerprint: context.deviceFingerprint,
        location: locationString,
        timestamp: new Date().toISOString(),
      };

      // Log to audit service
      await this.auditService.log({
        action: auditAction,
        entityType: 'user_security',
        entityId: context.userId,
        userId: context.userId,
        email: context.email,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        after: eventMetadata,
      });
    } catch (error) {
      // CRITICAL: Never throw errors that break security operations
      console.error('Security logging failed', {
        error,
        eventType,
        userId: context.userId,
      });
    }
  }

  /**
   * Map security event types to existing audit actions
   */
  private mapEventTypeToAuditAction(eventType: SecurityEventType): string {
    const mapping: Record<string, string> = {
      [SecurityEventType.TOTP_SETUP_INITIATED]: AUDIT_ACTIONS.TOTP_SETUP_INITIATED,
      [SecurityEventType.TOTP_SETUP_COMPLETED]: AUDIT_ACTIONS.TOTP_ENABLED,
      [SecurityEventType.TOTP_VERIFICATION_SUCCESS]: AUDIT_ACTIONS.TOTP_VERIFICATION_SUCCESS,
      [SecurityEventType.TOTP_VERIFICATION_FAILED]: AUDIT_ACTIONS.TOTP_VERIFICATION_FAILED,
      [SecurityEventType.TOTP_DISABLED]: AUDIT_ACTIONS.TOTP_DISABLED,
      [SecurityEventType.BACKUP_CODE_USED]: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_SUCCESS,
      [SecurityEventType.BACKUP_CODE_VERIFICATION_FAILED]: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_FAILED,
      [SecurityEventType.BACKUP_CODES_GENERATED]: AUDIT_ACTIONS.BACKUP_CODES_REGENERATED,
      [SecurityEventType.BACKUP_CODES_REGENERATED]: AUDIT_ACTIONS.BACKUP_CODES_REGENERATED,
      [SecurityEventType.BACKUP_CODE_LOW_WARNING]: AUDIT_ACTIONS.BACKUP_CODE_LOW_ALERT_SENT,
      [SecurityEventType.TRUSTED_DEVICE_ADDED]: AUDIT_ACTIONS.TRUSTED_DEVICE_CREATED,
      [SecurityEventType.TRUSTED_DEVICE_REMOVED]: AUDIT_ACTIONS.TRUSTED_DEVICE_REVOKED,
      [SecurityEventType.ALL_TRUSTED_DEVICES_REVOKED]: AUDIT_ACTIONS.ALL_TRUSTED_DEVICES_REVOKED,
      [SecurityEventType.ACCOUNT_LOCKED]: AUDIT_ACTIONS.ACCOUNT_LOCKED,
    };

    return mapping[eventType] || eventType;
  }

  /**
   * Get user's security timeline
   */
  async getUserSecurityTimeline(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      eventTypes?: SecurityEventType[];
    }
  ): Promise<SecurityTimelineEvent[]> {
    const { limit = 50, offset = 0, startDate, endDate, eventTypes } = options || {};

    const events = await this.prisma.auditEvent.findMany({
      where: {
        userId,
        entityType: 'user_security',
        timestamp: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
        ...(eventTypes && eventTypes.length > 0 && {
          action: { in: eventTypes },
        }),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    return events.map(event => this.formatSecurityTimelineEvent(event));
  }

  /**
   * Get admin security dashboard metrics
   */
  async getSecurityDashboardMetrics(): Promise<SecurityDashboardMetrics> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get 2FA adoption metrics
    const [totalUsers, enabledUsers, totpUsers, smsUsers] = await Promise.all([
      this.prisma.user.count({ where: { deleted_at: null } }),
      this.prisma.user.count({ where: { two_factor_enabled: true, deleted_at: null } }),
      this.prisma.user.count({ 
        where: { 
          two_factor_enabled: true,
          preferred_2fa_method: 'AUTHENTICATOR',
          deleted_at: null 
        } 
      }),
      this.prisma.user.count({ 
        where: { 
          two_factor_enabled: true,
          preferred_2fa_method: 'SMS',
          deleted_at: null 
        } 
      }),
    ]);

    const bothUsers = await this.prisma.user.count({
      where: {
        two_factor_enabled: true,
        preferred_2fa_method: 'BOTH',
        deleted_at: null,
      },
    });

    // Get verification metrics for different time periods
    const verificationMetrics = await this.getVerificationMetrics(
      oneDayAgo,
      sevenDaysAgo,
      thirtyDaysAgo
    );

    // Get backup code usage
    const backupCodeUsage = await this.getBackupCodeUsage(
      oneDayAgo,
      sevenDaysAgo,
      thirtyDaysAgo
    );

    // Get security alerts
    const securityAlerts = await this.getSecurityAlerts(
      oneDayAgo,
      sevenDaysAgo,
      thirtyDaysAgo
    );

    // Get phone number changes
    const phoneNumberChanges = await this.getPhoneNumberChanges(
      oneDayAgo,
      sevenDaysAgo,
      thirtyDaysAgo
    );

    // Get recent activity
    const recentActivity = await this.getRecentActivity(oneDayAgo);

    return {
      twoFactorAdoption: {
        total: totalUsers,
        enabled: enabledUsers,
        percentage: totalUsers > 0 ? (enabledUsers / totalUsers) * 100 : 0,
        byMethod: {
          totp: totpUsers,
          sms: smsUsers,
          both: bothUsers,
        },
      },
      verificationMetrics,
      backupCodeUsage,
      securityAlerts,
      phoneNumberChanges,
      recentActivity,
    };
  }

  /**
   * Search security events with advanced filters
   */
  async searchSecurityEvents(params: {
    userId?: string;
    email?: string;
    eventTypes?: SecurityEventType[];
    startDate?: Date;
    endDate?: Date;
    ipAddress?: string;
    isAnomalous?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<SecurityTimelineEvent[]> {
    const {
      userId,
      email,
      eventTypes,
      startDate,
      endDate,
      ipAddress,
      limit = 100,
      offset = 0,
    } = params;

    const events = await this.prisma.auditEvent.findMany({
      where: {
        entityType: 'user_security',
        ...(userId && { userId }),
        ...(email && { email: email.toLowerCase() }),
        ...(eventTypes && eventTypes.length > 0 && {
          action: { in: eventTypes },
        }),
        timestamp: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
        ...(ipAddress && { ipAddress }),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return events.map(event => this.formatSecurityTimelineEvent(event));
  }

  /**
   * Get verification metrics for time periods
   */
  private async getVerificationMetrics(
    oneDayAgo: Date,
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date
  ) {
    const verificationActions = [
      SecurityEventType.TOTP_VERIFICATION_SUCCESS,
      SecurityEventType.TOTP_VERIFICATION_FAILED,
      SecurityEventType.SMS_VERIFICATION_SUCCESS,
      SecurityEventType.SMS_VERIFICATION_FAILED,
      SecurityEventType.BACKUP_CODE_USED,
      SecurityEventType.BACKUP_CODE_VERIFICATION_FAILED,
    ];

    const [day, week, month] = await Promise.all([
      this.getVerificationStatsForPeriod(oneDayAgo, verificationActions),
      this.getVerificationStatsForPeriod(sevenDaysAgo, verificationActions),
      this.getVerificationStatsForPeriod(thirtyDaysAgo, verificationActions),
    ]);

    return {
      last24Hours: day,
      last7Days: week,
      last30Days: month,
    };
  }

  /**
   * Get verification stats for a specific period
   */
  private async getVerificationStatsForPeriod(
    since: Date,
    verificationActions: SecurityEventType[]
  ) {
    const successActions = [
      SecurityEventType.TOTP_VERIFICATION_SUCCESS,
      SecurityEventType.SMS_VERIFICATION_SUCCESS,
      SecurityEventType.BACKUP_CODE_USED,
    ];

    const failedActions = [
      SecurityEventType.TOTP_VERIFICATION_FAILED,
      SecurityEventType.SMS_VERIFICATION_FAILED,
      SecurityEventType.BACKUP_CODE_VERIFICATION_FAILED,
    ];

    const [total, successful, failed] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: verificationActions },
          timestamp: { gte: since },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: successActions },
          timestamp: { gte: since },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: failedActions },
          timestamp: { gte: since },
        },
      }),
    ]);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  /**
   * Get backup code usage stats
   */
  private async getBackupCodeUsage(
    oneDayAgo: Date,
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date
  ) {
    const [last24Hours, last7Days, last30Days] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.BACKUP_CODE_USED,
          timestamp: { gte: oneDayAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.BACKUP_CODE_USED,
          timestamp: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.BACKUP_CODE_USED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return { last24Hours, last7Days, last30Days };
  }

  /**
   * Get security alerts stats
   */
  private async getSecurityAlerts(
    oneDayAgo: Date,
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date
  ) {
    const alertTypes = [
      SecurityEventType.SUSPICIOUS_LOGIN_DETECTED,
      SecurityEventType.BRUTE_FORCE_DETECTED,
      SecurityEventType.ACCOUNT_LOCKED,
      SecurityEventType.UNUSUAL_DEVICE_DETECTED,
      SecurityEventType.UNUSUAL_LOCATION_DETECTED,
    ];

    const [last24Hours, last7Days, last30Days] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: alertTypes },
          timestamp: { gte: oneDayAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: alertTypes },
          timestamp: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: alertTypes },
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Get breakdown by type for last 30 days
    const byType = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.SUSPICIOUS_LOGIN_DETECTED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.BRUTE_FORCE_DETECTED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.ACCOUNT_LOCKED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.UNUSUAL_DEVICE_DETECTED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: SecurityEventType.UNUSUAL_LOCATION_DETECTED,
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return {
      last24Hours,
      last7Days,
      last30Days,
      byType: {
        suspiciousLogin: byType[0],
        bruteForce: byType[1],
        accountLocked: byType[2],
        unusualDevice: byType[3],
        unusualLocation: byType[4],
      },
    };
  }

  /**
   * Get phone number changes stats
   */
  private async getPhoneNumberChanges(
    oneDayAgo: Date,
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date
  ) {
    const phoneActions = [
      SecurityEventType.PHONE_NUMBER_ADDED,
      SecurityEventType.PHONE_NUMBER_CHANGED,
      SecurityEventType.PHONE_NUMBER_REMOVED,
    ];

    const [last24Hours, last7Days, last30Days] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: phoneActions },
          timestamp: { gte: oneDayAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: phoneActions },
          timestamp: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: { in: phoneActions },
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return { last24Hours, last7Days, last30Days };
  }

  /**
   * Get recent activity stats
   */
  private async getRecentActivity(oneDayAgo: Date) {
    const [setupEvents, disableEvents, verificationAttempts] = await Promise.all([
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: {
            in: [
              SecurityEventType.TOTP_SETUP_COMPLETED,
              SecurityEventType.SMS_SETUP_COMPLETED,
            ],
          },
          timestamp: { gte: oneDayAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: {
            in: [
              SecurityEventType.TOTP_DISABLED,
              SecurityEventType.SMS_DISABLED,
              SecurityEventType.TWO_FACTOR_DISABLE_COMPLETED,
            ],
          },
          timestamp: { gte: oneDayAgo },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          entityType: 'user_security',
          action: {
            in: [
              SecurityEventType.TOTP_VERIFICATION_SUCCESS,
              SecurityEventType.TOTP_VERIFICATION_FAILED,
              SecurityEventType.SMS_VERIFICATION_SUCCESS,
              SecurityEventType.SMS_VERIFICATION_FAILED,
            ],
          },
          timestamp: { gte: oneDayAgo },
        },
      }),
    ]);

    return {
      setupEvents,
      disableEvents,
      verificationAttempts,
    };
  }

  /**
   * Format audit event as security timeline event
   */
  private formatSecurityTimelineEvent(event: any): SecurityTimelineEvent {
    const metadata = (event.afterJson as SecurityEventMetadata) || {};
    
    return {
      id: event.id,
      timestamp: event.timestamp,
      eventType: metadata.eventType || event.action,
      description: this.formatEventDescription(event.action, metadata),
      metadata,
      ipAddress: event.ipAddress || undefined,
      location: metadata.location,
      device: metadata.deviceName || event.userAgent || undefined,
      success: metadata.success,
    };
  }

  /**
   * Format human-readable event description
   */
  private formatEventDescription(
    action: string,
    metadata: SecurityEventMetadata
  ): string {
    const descriptions: Record<string, string> = {
      [SecurityEventType.TOTP_SETUP_INITIATED]: 'Authenticator app setup initiated',
      [SecurityEventType.TOTP_SETUP_COMPLETED]: 'Authenticator app 2FA enabled',
      [SecurityEventType.SMS_SETUP_INITIATED]: 'SMS 2FA setup initiated',
      [SecurityEventType.SMS_SETUP_COMPLETED]: 'SMS 2FA enabled',
      [SecurityEventType.TOTP_VERIFICATION_SUCCESS]: 'Successfully verified with authenticator app',
      [SecurityEventType.TOTP_VERIFICATION_FAILED]: 'Failed to verify with authenticator app',
      [SecurityEventType.SMS_VERIFICATION_SUCCESS]: 'Successfully verified with SMS code',
      [SecurityEventType.SMS_VERIFICATION_FAILED]: 'Failed to verify with SMS code',
      [SecurityEventType.BACKUP_CODE_USED]: `Backup code used (${metadata.remainingBackupCodes || 0} remaining)`,
      [SecurityEventType.BACKUP_CODES_GENERATED]: 'Backup codes generated',
      [SecurityEventType.BACKUP_CODES_REGENERATED]: 'Backup codes regenerated',
      [SecurityEventType.BACKUP_CODE_LOW_WARNING]: `Low backup codes warning (${metadata.remainingBackupCodes || 0} remaining)`,
      [SecurityEventType.PHONE_NUMBER_ADDED]: `Phone number added (${metadata.phoneNumber})`,
      [SecurityEventType.PHONE_NUMBER_CHANGED]: `Phone number changed from ${metadata.previousPhoneNumber} to ${metadata.phoneNumber}`,
      [SecurityEventType.PHONE_NUMBER_REMOVED]: `Phone number removed (${metadata.phoneNumber})`,
      [SecurityEventType.TOTP_DISABLED]: 'Authenticator app 2FA disabled',
      [SecurityEventType.SMS_DISABLED]: 'SMS 2FA disabled',
      [SecurityEventType.TWO_FACTOR_DISABLE_COMPLETED]: 'Two-factor authentication disabled',
      [SecurityEventType.TRUSTED_DEVICE_ADDED]: 'Trusted device added',
      [SecurityEventType.TRUSTED_DEVICE_REMOVED]: 'Trusted device removed',
      [SecurityEventType.SUSPICIOUS_LOGIN_DETECTED]: 'Suspicious login detected',
      [SecurityEventType.ACCOUNT_LOCKED]: 'Account locked due to suspicious activity',
      [SecurityEventType.UNUSUAL_DEVICE_DETECTED]: 'Login from unusual device detected',
      [SecurityEventType.UNUSUAL_LOCATION_DETECTED]: 'Login from unusual location detected',
    };

    return descriptions[action] || action.replace(/_/g, ' ').toLowerCase();
  }

  /**
   * Mask phone number for privacy (show only last 4 digits)
   */
  static maskPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return '****';
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 4) return '****';
    return `***${cleaned.slice(-4)}`;
  }
}

/**
 * Singleton instance for easy importing
 */
import { prisma } from '@/lib/db';
export const securityLoggingService = new SecurityLoggingService(prisma, auditService);
