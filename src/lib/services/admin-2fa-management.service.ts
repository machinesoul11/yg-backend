/**
 * Admin 2FA Management Service
 * Handles administrative operations for two-factor authentication
 * 
 * Features:
 * - View user 2FA status across the platform
 * - Force 2FA enable/disable for specific users
 * - Reset user 2FA (with admin approval/reason)
 * - Generate emergency access codes for locked users
 * - View and export 2FA security audit logs
 * - Manage 2FA policies (optional vs mandatory by role)
 * - Security alerts and notifications
 */

import { PrismaClient, UserRole, TwoFactorMethod, TwoFactorEnforcementType } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AuditService } from './audit.service';
import { EmailService } from './email/email.service';
import { TotpService } from '@/lib/auth/totp.service';

const EMERGENCY_CODE_LENGTH = 8;
const EMERGENCY_CODE_COUNT = 5;
const EMERGENCY_CODE_EXPIRY_HOURS = 48;
const BCRYPT_ROUNDS = 12;

export interface User2FAStatus {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  two_factor_enabled: boolean;
  two_factor_verified_at: Date | null;
  two_factor_required: boolean;
  two_factor_grace_period_ends: Date | null;
  preferred_2fa_method: TwoFactorMethod | null;
  phone_verified: boolean;
  backupCodesRemaining: number;
  lastLoginAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
}

export interface User2FADetails extends User2FAStatus {
  two_factor_last_reset_at: Date | null;
  two_factor_last_reset_by: string | null;
  emergencyCodesActive: number;
  recentSecurityEvents: Array<{
    eventType: string;
    action: string;
    success: boolean;
    createdAt: Date;
    ipAddress: string | null;
  }>;
  loginAttempts: Array<{
    success: boolean;
    ipAddress: string | null;
    timestamp: Date;
    failureReason: string | null;
  }>;
}

export interface TwoFactorPolicyConfig {
  role: UserRole;
  enforcementType: TwoFactorEnforcementType;
  gracePeriodDays: number;
  enforcementStartDate?: Date;
  allowedMethods?: TwoFactorMethod[];
}

export interface EmergencyCodeResult {
  codes: string[];
  expiresAt: Date;
  userId: string;
  generatedBy: string;
}

export interface SecurityLogExportOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  eventType?: string;
  adminId?: string;
  format: 'csv' | 'json';
}

export class Admin2FAManagementService {
  private emailService: EmailService;

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {
    this.emailService = new EmailService();
  }

  /**
   * Get all users with their 2FA status
   * Supports pagination and filtering
   */
  async getAllUsers2FAStatus(options: {
    page?: number;
    limit?: number;
    role?: UserRole;
    twoFactorEnabled?: boolean;
    twoFactorRequired?: boolean;
    search?: string;
  }): Promise<{ users: User2FAStatus[]; total: number; page: number; limit: number }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      deleted_at: null,
    };

    if (options.role) {
      where.role = options.role;
    }

    if (options.twoFactorEnabled !== undefined) {
      where.two_factor_enabled = options.twoFactorEnabled;
    }

    if (options.twoFactorRequired !== undefined) {
      where.two_factor_required = options.twoFactorRequired;
    }

    if (options.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { name: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          two_factor_enabled: true,
          two_factor_verified_at: true,
          two_factor_required: true,
          two_factor_grace_period_ends: true,
          preferred_2fa_method: true,
          phone_verified: true,
          lastLoginAt: true,
          locked_until: true,
          createdAt: true,
          twoFactorBackupCodes: {
            where: { used: false },
            select: { id: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const usersStatus: User2FAStatus[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      two_factor_enabled: user.two_factor_enabled,
      two_factor_verified_at: user.two_factor_verified_at,
      two_factor_required: user.two_factor_required,
      two_factor_grace_period_ends: user.two_factor_grace_period_ends,
      preferred_2fa_method: user.preferred_2fa_method,
      phone_verified: user.phone_verified,
      backupCodesRemaining: user.twoFactorBackupCodes.length,
      lastLoginAt: user.lastLoginAt,
      isLocked: user.locked_until ? user.locked_until > new Date() : false,
      createdAt: user.createdAt,
    }));

    return {
      users: usersStatus,
      total,
      page,
      limit,
    };
  }

  /**
   * Get detailed 2FA information for a specific user
   */
  async getUser2FADetails(userId: string): Promise<User2FADetails> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        twoFactorBackupCodes: {
          where: { used: false },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get emergency codes count
    const emergencyCodesCount = await this.prisma.adminEmergencyCode.count({
      where: {
        userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    // Get recent security events
    const securityEvents = await this.prisma.twoFactorSecurityLog.findMany({
      where: { userId },
      select: {
        eventType: true,
        action: true,
        success: true,
        createdAt: true,
        ipAddress: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get recent login attempts
    const loginAttempts = await this.prisma.loginAttempt.findMany({
      where: { userId },
      select: {
        success: true,
        ipAddress: true,
        timestamp: true,
        failureReason: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      two_factor_enabled: user.two_factor_enabled,
      two_factor_verified_at: user.two_factor_verified_at,
      two_factor_required: user.two_factor_required,
      two_factor_grace_period_ends: user.two_factor_grace_period_ends,
      two_factor_last_reset_at: user.two_factor_last_reset_at,
      two_factor_last_reset_by: user.two_factor_last_reset_by,
      preferred_2fa_method: user.preferred_2fa_method,
      phone_verified: user.phone_verified,
      backupCodesRemaining: user.twoFactorBackupCodes.length,
      emergencyCodesActive: emergencyCodesCount,
      lastLoginAt: user.lastLoginAt,
      isLocked: user.locked_until ? user.locked_until > new Date() : false,
      createdAt: user.createdAt,
      recentSecurityEvents: securityEvents,
      loginAttempts: loginAttempts.map((la) => ({
        ...la,
        timestamp: la.timestamp,
      })),
    };
  }

  /**
   * Force reset user 2FA (admin action)
   * Requires admin reason
   */
  async resetUser2FA(
    userId: string,
    adminId: string,
    reason: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, two_factor_enabled: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Prevent admins from resetting their own 2FA
    if (userId === adminId) {
      throw new Error('Admins cannot reset their own 2FA. Please contact another administrator.');
    }

    const beforeState = {
      two_factor_enabled: user.two_factor_enabled,
    };

    // Reset 2FA in a transaction
    await this.prisma.$transaction([
      // Clear 2FA settings
      this.prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_verified_at: null,
          preferred_2fa_method: null,
          phone_number: null,
          phone_verified: false,
          two_factor_last_reset_by: adminId,
          two_factor_last_reset_at: new Date(),
        },
      }),
      // Delete all backup codes
      this.prisma.twoFactorBackupCode.deleteMany({
        where: { userId },
      }),
      // Delete all emergency codes
      this.prisma.adminEmergencyCode.deleteMany({
        where: { userId },
      }),
      // Delete SMS verification codes
      this.prisma.smsVerificationCode.deleteMany({
        where: { userId },
      }),
    ]);

    // Log the security event
    await this.prisma.twoFactorSecurityLog.create({
      data: {
        userId,
        adminId,
        eventType: 'ADMIN_2FA_RESET',
        action: 'FORCE_RESET',
        success: true,
        metadata: {
          reason,
          resetBy: adminId,
          previousState: beforeState,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    // Log audit event
    await this.auditService.log({
      action: 'ADMIN_2FA_RESET',
      entityType: 'user',
      entityId: userId,
      userId: adminId,
      before: beforeState,
      after: { two_factor_enabled: false, reset_reason: reason },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    // Send notification email to user
    try {
      await this.emailService.sendTransactional({
        email: user.email,
        subject: 'Your Two-Factor Authentication Has Been Reset',
        template: '2fa-admin-reset',
        variables: {
          userName: user.name || 'User',
          resetReason: reason,
          resetDate: new Date().toLocaleString('en-US', {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
          setupUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/security/2fa`,
        },
        tags: {
          type: '2fa-admin-reset',
          category: 'security',
        },
      });
    } catch (error) {
      console.error('[Admin2FA] Failed to send reset notification email:', error);
    }
  }

  /**
   * Generate emergency access codes for a locked-out user
   * Returns codes once, they are hashed before storage
   */
  async generateEmergencyCodes(
    userId: string,
    adminId: string,
    reason: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<EmergencyCodeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, two_factor_enabled: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.two_factor_enabled) {
      throw new Error('User does not have 2FA enabled');
    }

    // Generate emergency codes
    const codes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < EMERGENCY_CODE_COUNT; i++) {
      const code = crypto.randomBytes(EMERGENCY_CODE_LENGTH).toString('hex').toUpperCase();
      codes.push(code);
      const hashed = await bcrypt.hash(code, BCRYPT_ROUNDS);
      hashedCodes.push(hashed);
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EMERGENCY_CODE_EXPIRY_HOURS);

    // Store hashed codes
    await this.prisma.$transaction(
      hashedCodes.map((hashedCode) =>
        this.prisma.adminEmergencyCode.create({
          data: {
            userId,
            codeHash: hashedCode,
            generatedBy: adminId,
            reason,
            expiresAt,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
          },
        })
      )
    );

    // Log the security event
    await this.prisma.twoFactorSecurityLog.create({
      data: {
        userId,
        adminId,
        eventType: 'EMERGENCY_CODES_GENERATED',
        action: 'GENERATE_EMERGENCY_CODES',
        success: true,
        metadata: {
          reason,
          codesCount: codes.length,
          expiresAt: expiresAt.toISOString(),
          generatedBy: adminId,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    // Log audit event
    await this.auditService.log({
      action: 'EMERGENCY_CODES_GENERATED',
      entityType: 'user',
      entityId: userId,
      userId: adminId,
      after: {
        codesCount: codes.length,
        expiresAt,
        reason,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      codes,
      expiresAt,
      userId,
      generatedBy: adminId,
    };
  }

  /**
   * Verify and use an emergency code
   * Called during login when user is locked out
   */
  async verifyEmergencyCode(userId: string, code: string): Promise<boolean> {
    const emergencyCodes = await this.prisma.adminEmergencyCode.findMany({
      where: {
        userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    for (const emergencyCode of emergencyCodes) {
      const isValid = await bcrypt.compare(code, emergencyCode.codeHash);

      if (isValid) {
        // Mark code as used
        await this.prisma.adminEmergencyCode.update({
          where: { id: emergencyCode.id },
          data: {
            used: true,
            usedAt: new Date(),
          },
        });

        // Log usage
        await this.prisma.twoFactorSecurityLog.create({
          data: {
            userId,
            eventType: 'EMERGENCY_CODE_USED',
            action: 'USE_EMERGENCY_CODE',
            success: true,
            metadata: {
              codeId: emergencyCode.id,
              generatedBy: emergencyCode.generatedBy,
            },
          },
        });

        return true;
      }
    }

    // Log failed attempt
    await this.prisma.twoFactorSecurityLog.create({
      data: {
        userId,
        eventType: 'EMERGENCY_CODE_FAILED',
        action: 'USE_EMERGENCY_CODE',
        success: false,
        failureReason: 'Invalid or expired emergency code',
      },
    });

    return false;
  }

  /**
   * Get 2FA security logs with filtering
   */
  async getSecurityLogs(options: {
    page?: number;
    limit?: number;
    userId?: string;
    adminId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 100;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.adminId) {
      where.adminId = options.adminId;
    }

    if (options.eventType) {
      where.eventType = options.eventType;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.twoFactorSecurityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.twoFactorSecurityLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
    };
  }

  /**
   * Export security logs to CSV
   */
  async exportSecurityLogs(options: SecurityLogExportOptions): Promise<string> {
    const where: any = {};

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.adminId) {
      where.adminId = options.adminId;
    }

    if (options.eventType) {
      where.eventType = options.eventType;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const logs = await this.prisma.twoFactorSecurityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit for large exports
    });

    if (options.format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      'ID',
      'User ID',
      'Admin ID',
      'Event Type',
      'Action',
      'Success',
      'Failure Reason',
      'IP Address',
      'Location',
      'Created At',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.userId,
      log.adminId || '',
      log.eventType,
      log.action,
      log.success ? 'Yes' : 'No',
      log.failureReason || '',
      log.ipAddress || '',
      log.locationCity ? `${log.locationCity}, ${log.locationCountry}` : '',
      log.createdAt.toISOString(),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return csvContent;
  }

  /**
   * Set or update 2FA policy for a role
   */
  async set2FAPolicy(
    config: TwoFactorPolicyConfig,
    adminId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const existingPolicy = await this.prisma.twoFactorPolicy.findUnique({
      where: { role: config.role },
    });

    const policy = await this.prisma.twoFactorPolicy.upsert({
      where: { role: config.role },
      create: {
        role: config.role,
        enforcementType: config.enforcementType,
        gracePeriodDays: config.gracePeriodDays,
        enforcementStartDate: config.enforcementStartDate,
        allowedMethods: config.allowedMethods || [],
        createdBy: adminId,
      },
      update: {
        enforcementType: config.enforcementType,
        gracePeriodDays: config.gracePeriodDays,
        enforcementStartDate: config.enforcementStartDate,
        allowedMethods: config.allowedMethods,
        updatedBy: adminId,
      },
    });

    // Log audit event
    await this.auditService.log({
      action: existingPolicy ? 'UPDATE_2FA_POLICY' : 'CREATE_2FA_POLICY',
      entityType: '2fa_policy',
      entityId: policy.id,
      userId: adminId,
      before: existingPolicy || undefined,
      after: policy,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    // If policy is now mandatory, update affected users
    if (config.enforcementType === 'MANDATORY') {
      await this.applyPolicyToUsers(config.role, config.gracePeriodDays);
    }
  }

  /**
   * Get 2FA policy for a role
   */
  async get2FAPolicy(role: UserRole): Promise<TwoFactorPolicyConfig | null> {
    const policy = await this.prisma.twoFactorPolicy.findUnique({
      where: { role },
    });

    if (!policy) {
      return null;
    }

    return {
      role: policy.role,
      enforcementType: policy.enforcementType,
      gracePeriodDays: policy.gracePeriodDays,
      enforcementStartDate: policy.enforcementStartDate || undefined,
      allowedMethods: policy.allowedMethods as TwoFactorMethod[],
    };
  }

  /**
   * Get all 2FA policies
   */
  async getAll2FAPolicies(): Promise<TwoFactorPolicyConfig[]> {
    const policies = await this.prisma.twoFactorPolicy.findMany({
      orderBy: { role: 'asc' },
    });

    return policies.map((policy) => ({
      role: policy.role,
      enforcementType: policy.enforcementType,
      gracePeriodDays: policy.gracePeriodDays,
      enforcementStartDate: policy.enforcementStartDate || undefined,
      allowedMethods: policy.allowedMethods as TwoFactorMethod[],
    }));
  }

  /**
   * Apply 2FA policy to users of a specific role
   * Sets required flag and grace period
   */
  private async applyPolicyToUsers(role: UserRole, gracePeriodDays: number): Promise<void> {
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() + gracePeriodDays);

    await this.prisma.user.updateMany({
      where: {
        role,
        two_factor_enabled: false,
        deleted_at: null,
      },
      data: {
        two_factor_required: true,
        two_factor_grace_period_ends: gracePeriodEnds,
      },
    });
  }

  /**
   * Check if user needs to enable 2FA based on policy
   */
  async checkUserPolicyCompliance(userId: string): Promise<{
    compliant: boolean;
    required: boolean;
    gracePeriodEnds: Date | null;
    daysRemaining: number | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        two_factor_enabled: true,
        two_factor_required: true,
        two_factor_grace_period_ends: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has 2FA enabled
    if (user.two_factor_enabled) {
      return {
        compliant: true,
        required: user.two_factor_required,
        gracePeriodEnds: null,
        daysRemaining: null,
      };
    }

    // Check policy for user's role
    const policy = await this.get2FAPolicy(user.role);

    if (!policy || policy.enforcementType === 'OPTIONAL') {
      return {
        compliant: true,
        required: false,
        gracePeriodEnds: null,
        daysRemaining: null,
      };
    }

    // User needs 2FA but hasn't enabled it
    let daysRemaining: number | null = null;
    if (user.two_factor_grace_period_ends) {
      const now = new Date();
      const diffTime = user.two_factor_grace_period_ends.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      compliant: false,
      required: true,
      gracePeriodEnds: user.two_factor_grace_period_ends,
      daysRemaining: daysRemaining && daysRemaining > 0 ? daysRemaining : 0,
    };
  }

  /**
   * Get users who are non-compliant with 2FA policy
   */
  async getNonCompliantUsers(role?: UserRole): Promise<
    Array<{
      id: string;
      email: string;
      name: string | null;
      role: UserRole;
      gracePeriodEnds: Date | null;
      daysRemaining: number;
    }>
  > {
    const where: any = {
      two_factor_required: true,
      two_factor_enabled: false,
      deleted_at: null,
    };

    if (role) {
      where.role = role;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        two_factor_grace_period_ends: true,
      },
    });

    const now = new Date();

    return users.map((user) => {
      let daysRemaining = 0;
      if (user.two_factor_grace_period_ends) {
        const diffTime = user.two_factor_grace_period_ends.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        gracePeriodEnds: user.two_factor_grace_period_ends,
        daysRemaining: Math.max(0, daysRemaining),
      };
    });
  }
}
