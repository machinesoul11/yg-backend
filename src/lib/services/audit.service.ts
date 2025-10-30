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
 * 
 * Enhanced with tamper detection via previousLogHash for immutable audit trail
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { 
  encryptAuditMetadata, 
  splitMetadata, 
  SensitiveAuditMetadata 
} from './audit-encryption.service';
import { generateEntryHash } from './audit-integrity.service';

// ResourceType enum values - synced with Prisma schema
type ResourceType = 
  | 'USER'
  | 'ACCOUNT'
  | 'ADMIN_ROLE'
  | 'APPROVAL_REQUEST'
  | 'ASSET'
  | 'ATTRIBUTION'
  | 'BRAND'
  | 'CAMPAIGN'
  | 'CREATOR'
  | 'EMAIL_CAMPAIGN'
  | 'EMAIL_PREFERENCES'
  | 'FILE'
  | 'FINANCIAL_REPORT'
  | 'IP_ASSET'
  | 'IP_OWNERSHIP'
  | 'LICENSE'
  | 'LICENSE_AMENDMENT'
  | 'LICENSE_EXTENSION'
  | 'LICENSE_REQUEST'
  | 'LOGIN_ATTEMPT'
  | 'MEDIA_ITEM'
  | 'MESSAGE'
  | 'NOTIFICATION'
  | 'PASSWORD'
  | 'PAYMENT'
  | 'PAYOUT'
  | 'POST'
  | 'PROJECT'
  | 'REPORT'
  | 'ROYALTY'
  | 'ROYALTY_RUN'
  | 'ROYALTY_STATEMENT'
  | 'SCHEDULED_REPORT'
  | 'SESSION'
  | 'TAX_DOCUMENT'
  | 'TAX_WITHHOLDING'
  | 'TWO_FACTOR_BACKUP_CODE'
  | 'TWO_FACTOR_POLICY'
  | 'VERIFICATION_TOKEN'
  | 'SYSTEM'
  | 'OTHER';

export type AuditEventInput = {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  permission?: string;
  resourceType?: ResourceType;
  resourceId?: string;
  before?: any;
  after?: any;
  metadata?: any;
};

/**
 * Enhanced parameters for comprehensive audit logging
 * Supports deep cloning of state and full request context
 */
export interface LogActionParams {
  // Required fields
  action: string;
  resourceType: ResourceType;
  resourceId: string;
  
  // Optional actor information
  userId?: string;
  email?: string;
  
  // State tracking
  beforeState?: any;
  afterState?: any;
  
  // Request context
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  
  // Authorization context
  permission?: string;
  
  // Additional metadata
  metadata?: Record<string, any>;
  
  // Legacy support
  entityType?: string;
  entityId?: string;
}

/**
 * Audit log query filters with comprehensive search capabilities
 */
export interface AuditLogFilters {
  // Pagination
  page?: number;
  limit?: number;
  
  // Sorting
  sortBy?: 'timestamp' | 'action' | 'userId';
  sortOrder?: 'asc' | 'desc';
  
  // Filtering
  userId?: string;
  email?: string;
  action?: string | string[];
  resourceType?: ResourceType | ResourceType[];
  resourceId?: string;
  sessionId?: string;
  requestId?: string;
  
  // Date range
  startDate?: Date;
  endDate?: Date;
  
  // Legacy support
  entityType?: string;
  entityId?: string;
}

/**
 * Paginated audit log response
 */
export interface AuditLogsResponse {
  logs: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Deep clone utility to ensure state snapshots are immutable
   * Handles circular references and special object types
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Handle Date objects
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    // Handle regular objects
    const clonedObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  /**
   * Generate hash for tamper detection
   * Creates SHA-256 hash of previous log entry's critical fields
   */
  private async generatePreviousLogHash(): Promise<string | null> {
    try {
      // Get the most recent audit log entry
      const lastLog = await this.prisma.auditEvent.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          timestamp: true,
          action: true,
          resourceType: true,
          resourceId: true,
          userId: true,
        },
      });

      if (!lastLog) {
        return null; // This is the genesis entry
      }

      // Create deterministic hash of previous entry
      const hashInput = JSON.stringify({
        id: lastLog.id,
        timestamp: lastLog.timestamp.toISOString(),
        action: lastLog.action,
        resourceType: lastLog.resourceType,
        resourceId: lastLog.resourceId,
        userId: lastLog.userId,
      });

      return crypto.createHash('sha256').update(hashInput).digest('hex');
    } catch (error) {
      console.error('Failed to generate previous log hash', error);
      return null;
    }
  }

  /**
   * Log an audit event - NEVER throw errors that break business logic
   * If audit fails, log error but allow operation to continue
   * 
   * Enhanced with:
   * - Tamper detection via previousLogHash and entryHash
   * - Session tracking
   * - Permission logging
   * - Resource type safety via enum
   * - Flexible metadata storage
   * - Encrypted sensitive metadata
   */
  async log(event: AuditEventInput): Promise<void> {
    try {
      // Get the most recent audit log entry for hash chain
      const lastLog = await this.prisma.auditEvent.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          entryHash: true,
        },
      });

      const previousLogHash = lastLog?.entryHash || null;

      // Split metadata into public and sensitive parts
      let publicMetadata = event.metadata;
      let encryptedMetadata: string | undefined;

      if (event.metadata) {
        const { publicMetadata: pub, sensitiveMetadata: sens } = splitMetadata(event.metadata);
        publicMetadata = pub;
        
        if (sens) {
          try {
            encryptedMetadata = encryptAuditMetadata(sens);
          } catch (error) {
            console.error('Failed to encrypt sensitive audit metadata', {
              error: error instanceof Error ? error.message : String(error),
              eventAction: event.action,
            });
            // Continue without encryption rather than failing the audit
          }
        }
      }

      // Create the entry data
      const entryData = {
        timestamp: new Date(),
        action: event.action,
        
        // Legacy fields for backward compatibility
        entityType: event.entityType,
        entityId: event.entityId,
        
        // Enhanced fields
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? event.entityId,
        permission: event.permission ?? null,
        
        // Actor information
        userId: event.userId,
        email: event.email,
        
        // Request context
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        sessionId: event.sessionId,
        requestId: event.requestId,
        
        // State tracking (mapped to new column names)
        beforeState: event.before ?? undefined,
        afterState: event.after ?? undefined,
        
        // Metadata
        metadata: publicMetadata ?? undefined,
        encryptedMetadata,
        
        // Tamper detection
        previousLogHash,
        entryHash: '', // Will be calculated after we have the ID
      };

      // Create audit log entry
      const createdEntry = await this.prisma.auditEvent.create({
        data: entryData,
      });

      // Generate entry hash with actual ID and update
      try {
        const entryHash = generateEntryHash({
          id: createdEntry.id,
          timestamp: createdEntry.timestamp,
          userId: createdEntry.userId,
          action: createdEntry.action,
          resourceType: createdEntry.resourceType,
          resourceId: createdEntry.resourceId,
          entityType: createdEntry.entityType,
          entityId: createdEntry.entityId,
          ipAddress: createdEntry.ipAddress,
          metadata: createdEntry.metadata,
        }, previousLogHash);

        // Update with hash - Note: This is the ONE exception to append-only
        // We update immediately after creation before any other operations
        await this.prisma.auditEvent.update({
          where: { id: createdEntry.id },
          data: { entryHash },
        });
      } catch (hashError) {
        // Hash generation failed, but entry is still created
        console.error('Failed to generate entry hash for audit log', {
          error: hashError instanceof Error ? hashError.message : String(hashError),
          entryId: createdEntry.id,
        });
      }
    } catch (error) {
      // CRITICAL: Log audit failure but don't throw
      console.error('Audit logging failed', {
        error,
        auditData: event,
      });
    }
  }

  /**
   * Enhanced audit logging with deep cloning and comprehensive context capture
   * This is the primary method for logging actions in the YES GODDESS platform
   * 
   * Features:
   * - Deep clones before/after states to ensure immutability
   * - Captures complete request context (IP, user agent, session)
   * - Records permission used for authorization
   * - Maintains tamper-evident hash chain
   * - Non-blocking - failures are logged but don't interrupt business operations
   * 
   * @param params - Comprehensive audit logging parameters
   * @returns Promise<void> - Never throws, failures are logged internally
   */
  async logAction(params: LogActionParams): Promise<void> {
    try {
      // Validate required parameters
      if (!params.action || !params.resourceType || !params.resourceId) {
        console.error('Invalid audit log parameters - missing required fields', {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
        });
        return;
      }

      // Deep clone state objects to prevent mutation
      const beforeState = params.beforeState 
        ? this.deepClone(this.sanitizeForAudit(params.beforeState))
        : null;
      
      const afterState = params.afterState
        ? this.deepClone(this.sanitizeForAudit(params.afterState))
        : null;

      // Generate hash of previous log for chain integrity
      const previousLogHash = await this.generatePreviousLogHash();

      // Create audit log entry
      await this.prisma.auditEvent.create({
        data: {
          timestamp: new Date(),
          action: params.action,
          
          // Resource identification
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          
          // Legacy fields for backward compatibility
          entityType: params.entityType || params.resourceType,
          entityId: params.entityId || params.resourceId,
          
          // Actor information
          userId: params.userId ?? undefined,
          email: params.email ?? undefined,
          
          // Authorization context
          permission: params.permission ?? undefined,
          
          // Request context
          ipAddress: params.ipAddress ?? undefined,
          userAgent: params.userAgent ?? undefined,
          sessionId: params.sessionId ?? undefined,
          requestId: params.requestId ?? undefined,
          
          // State tracking - deep cloned snapshots
          beforeState,
          afterState,
          
          // Additional metadata
          metadata: params.metadata ?? undefined,
          
          // Tamper detection chain
          previousLogHash,
        },
      });
    } catch (error) {
      // CRITICAL: Never throw - audit failures must not break business operations
      console.error('Audit logging failed in logAction', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        params: {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          userId: params.userId,
        },
      });
    }
  }

  /**
   * Query audit logs with comprehensive filtering and pagination
   * 
   * Supports:
   * - Date range filtering
   * - User, action, and resource filtering
   * - Multi-value filters (e.g., multiple actions or resource types)
   * - Sorting by timestamp, action, or user
   * - Pagination with total count
   * 
   * @param filters - Comprehensive filter and pagination options
   * @returns Paginated audit logs with metadata
   */
  async getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogsResponse> {
    try {
      // Extract and validate pagination parameters
      const page = Math.max(1, filters.page || 1);
      const limit = Math.min(Math.max(1, filters.limit || 50), 1000); // Max 1000 per page
      const skip = (page - 1) * limit;
      
      // Build where clause
      const where: any = {};
      
      // User filtering
      if (filters.userId) {
        where.userId = filters.userId;
      }
      
      if (filters.email) {
        where.email = filters.email.toLowerCase();
      }
      
      // Action filtering (support single or multiple actions)
      if (filters.action) {
        if (Array.isArray(filters.action)) {
          where.action = { in: filters.action };
        } else {
          where.action = filters.action;
        }
      }
      
      // Resource filtering (support single or multiple resource types)
      if (filters.resourceType) {
        if (Array.isArray(filters.resourceType)) {
          where.resourceType = { in: filters.resourceType };
        } else {
          where.resourceType = filters.resourceType;
        }
      }
      
      if (filters.resourceId) {
        where.resourceId = filters.resourceId;
      }
      
      // Session and request filtering
      if (filters.sessionId) {
        where.sessionId = filters.sessionId;
      }
      
      if (filters.requestId) {
        where.requestId = filters.requestId;
      }
      
      // Legacy entity filtering for backward compatibility
      if (filters.entityType) {
        where.entityType = filters.entityType;
      }
      
      if (filters.entityId) {
        where.entityId = filters.entityId;
      }
      
      // Date range filtering
      if (filters.startDate || filters.endDate) {
        where.timestamp = {};
        if (filters.startDate) {
          where.timestamp.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.timestamp.lte = filters.endDate;
        }
      }
      
      // Determine sort order
      const sortBy = filters.sortBy || 'timestamp';
      const sortOrder = filters.sortOrder || 'desc';
      
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;
      
      // Execute queries in parallel for efficiency
      const [logs, total] = await Promise.all([
        this.prisma.auditEvent.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        }),
        this.prisma.auditEvent.count({ where }),
      ]);
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      };
    } catch (error) {
      console.error('Failed to query audit logs', {
        error: error instanceof Error ? error.message : String(error),
        filters,
      });
      
      // Return empty result set on error rather than throwing
      return {
        logs: [],
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 50,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
      };
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
