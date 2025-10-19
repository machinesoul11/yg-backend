/**
 * Audit Service
 * Handles comprehensive audit logging for all platform operations
 * 
 * Critical Operations (MUST audit):
 * - Financial transactions (licenses, payouts, royalty calculations)
 * - IP ownership changes
 * - User role changes
 * - License creation/modification/termination
 * - Royalty run execution
 * - Payout processing
 * - Creator/brand verification status changes
 * - System configuration changes
 * 
 * Key Principle: NEVER throw errors that break business logic
 * If audit fails, log error but allow operation to continue
 */

import { PrismaClient } from '@prisma/client';

export type AuditEventInput = {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  before?: any;
  after?: any;
};

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Log an audit event - NEVER throw errors that break business logic
   * If audit fails, log error but allow operation to continue
   */
  async log(event: AuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          timestamp: new Date(),
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          email: event.email,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          requestId: event.requestId,
          beforeJson: event.before ?? undefined,
          afterJson: event.after ?? undefined,
        },
      });
    } catch (error) {
      // CRITICAL: Log audit failure but don't throw
      console.error('Audit logging failed', {
        error,
        auditData: event,
      });
    }
  }

  /**
   * Get audit events for a user
   */
  async getUserAuditEvents(userId: string, limit = 50) {
    return this.prisma.auditEvent.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get audit history for specific entity
   */
  async getHistory(entityType: string, entityId: string) {
    return this.prisma.auditEvent.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  /**
   * Query user activity timeline
   */
  async getUserActivity(userId: string, limit = 50) {
    return this.prisma.auditEvent.findMany({
      where: { userId },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Get all changes to a specific record between dates
   */
  async getChanges(
    entityType: string,
    entityId: string,
    startDate: Date,
    endDate: Date
  ) {
    return this.prisma.auditEvent.findMany({
      where: {
        entityType,
        entityId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });
  }

  /**
   * Get failed login attempts for an email
   */
  async getFailedLoginAttempts(email: string, since: Date) {
    return this.prisma.auditEvent.count({
      where: {
        email: email.toLowerCase(),
        action: 'LOGIN_FAILED',
        timestamp: { gte: since },
      },
    });
  }

  /**
   * Search audit events with flexible filters
   */
  async searchEvents(params: {
    userId?: string;
    email?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const {
      userId,
      email,
      action,
      entityType,
      entityId,
      requestId,
      startDate,
      endDate,
      limit = 100,
    } = params;

    return this.prisma.auditEvent.findMany({
      where: {
        userId,
        email: email?.toLowerCase(),
        action,
        entityType,
        entityId,
        requestId,
        timestamp: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Helper function to sanitize sensitive data before logging
   */
  sanitizeForAudit(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password_hash',
      'password',
      'stripe_secret_key',
      'api_keys',
      'secret',
      'token',
      'accessToken',
      'refreshToken',
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
      }
    }

    return sanitized;
  }
}

/**
 * Audit Action Constants
 */
export const AUDIT_ACTIONS = {
  // Registration & Authentication
  REGISTER_SUCCESS: 'REGISTER_SUCCESS',
  REGISTER_FAILED: 'REGISTER_FAILED',
  EMAIL_VERIFICATION_SENT: 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  EMAIL_VERIFICATION_FAILED: 'EMAIL_VERIFICATION_FAILED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',

  // Account Management
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  ACCOUNT_PERMANENTLY_DELETED: 'ACCOUNT_PERMANENTLY_DELETED',
  ROLE_CHANGED: 'ROLE_CHANGED',

  // Two-Factor Authentication
  TOTP_SETUP_INITIATED: 'TOTP_SETUP_INITIATED',
  TOTP_ENABLED: 'TOTP_ENABLED',
  TOTP_DISABLED: 'TOTP_DISABLED',
  TOTP_DISABLE_FAILED: 'TOTP_DISABLE_FAILED',
  TOTP_VERIFICATION_SUCCESS: 'TOTP_VERIFICATION_SUCCESS',
  TOTP_VERIFICATION_FAILED: 'TOTP_VERIFICATION_FAILED',
  BACKUP_CODE_VERIFICATION_SUCCESS: 'BACKUP_CODE_VERIFICATION_SUCCESS',
  BACKUP_CODE_VERIFICATION_FAILED: 'BACKUP_CODE_VERIFICATION_FAILED',
  BACKUP_CODES_REGENERATED: 'BACKUP_CODES_REGENERATED',
  BACKUP_CODES_REGENERATION_FAILED: 'BACKUP_CODES_REGENERATION_FAILED',
  BACKUP_CODE_LOW_ALERT_SENT: 'BACKUP_CODE_LOW_ALERT_SENT',

  // Trusted Devices
  TRUSTED_DEVICE_CREATED: 'TRUSTED_DEVICE_CREATED',
  TRUSTED_DEVICE_REVOKED: 'TRUSTED_DEVICE_REVOKED',
  ALL_TRUSTED_DEVICES_REVOKED: 'ALL_TRUSTED_DEVICES_REVOKED',
  TRUSTED_DEVICE_LOGIN: 'TRUSTED_DEVICE_LOGIN',

  // IP Assets & Ownership
  ASSET_CREATED: 'ASSET_CREATED',
  ASSET_UPDATED: 'ASSET_UPDATED',
  ASSET_DELETED: 'ASSET_DELETED',
  ASSET_VIEWED: 'ASSET_VIEWED',
  OWNERSHIP_CREATED: 'OWNERSHIP_CREATED',
  OWNERSHIP_UPDATED: 'OWNERSHIP_UPDATED',
  OWNERSHIP_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',
  OWNERSHIP_DELETED: 'OWNERSHIP_DELETED',

  // Licensing
  LICENSE_CREATED: 'LICENSE_CREATED',
  LICENSE_UPDATED: 'LICENSE_UPDATED',
  LICENSE_ACTIVATED: 'LICENSE_ACTIVATED',
  LICENSE_SUSPENDED: 'LICENSE_SUSPENDED',
  LICENSE_TERMINATED: 'LICENSE_TERMINATED',
  LICENSE_VIEWED: 'LICENSE_VIEWED',

  // Royalties & Payouts
  ROYALTY_RUN_STARTED: 'ROYALTY_RUN_STARTED',
  ROYALTY_RUN_COMPLETED: 'ROYALTY_RUN_COMPLETED',
  ROYALTY_RUN_FAILED: 'ROYALTY_RUN_FAILED',
  ROYALTY_STATEMENT_GENERATED: 'ROYALTY_STATEMENT_GENERATED',
  PAYOUT_CREATED: 'PAYOUT_CREATED',
  PAYOUT_PROCESSING: 'PAYOUT_PROCESSING',
  PAYOUT_COMPLETED: 'PAYOUT_COMPLETED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',

  // Projects
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',

  // Creators & Brands
  CREATOR_VERIFIED: 'CREATOR_VERIFIED',
  CREATOR_UNVERIFIED: 'CREATOR_UNVERIFIED',
  BRAND_VERIFIED: 'BRAND_VERIFIED',
  BRAND_UNVERIFIED: 'BRAND_UNVERIFIED',

  // System
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  FEATURE_FLAG_CHANGED: 'FEATURE_FLAG_CHANGED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Singleton instance for easy importing
 * Usage: import { auditService } from '@/lib/services/audit.service';
 */
import { prisma } from '@/lib/db';
export const auditService = new AuditService(prisma);
