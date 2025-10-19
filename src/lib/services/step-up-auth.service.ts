/**
 * Step-Up Authentication Service
 * Handles elevated permission requirements for sensitive actions
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AuditService } from './audit.service';

export type SensitiveActionType =
  | 'password_change'
  | 'email_change'
  | 'admin_action'
  | 'role_change'
  | 'security_settings'
  | 'payment_settings'
  | 'account_deletion';

export interface StepUpVerification {
  userId: string;
  actionType: SensitiveActionType;
  elevatedPermissions: string[];
}

export interface StepUpTokenData {
  token: string;
  expiresAt: Date;
}

export class StepUpAuthService {
  private readonly TOKEN_EXPIRY_MINUTES = 10; // Step-up tokens last 10 minutes
  private readonly STEP_UP_GRACE_PERIOD_MINUTES = 15; // Recent 2FA within 15 min

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Create a step-up authentication token
   */
  async createStepUpToken(
    userId: string,
    actionType: SensitiveActionType,
    elevatedPermissions: string[],
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<StepUpTokenData> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.TOKEN_EXPIRY_MINUTES);

    await this.prisma.stepUpToken.create({
      data: {
        userId,
        tokenHash,
        actionType,
        elevatedPermissions,
        expiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    await this.auditService.log({
      action: 'STEP_UP_TOKEN_CREATED',
      entityType: 'user',
      entityId: userId,
      userId,
      afterJson: {
        actionType,
        elevatedPermissions,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Verify and consume a step-up token
   */
  async verifyStepUpToken(
    token: string,
    expectedActionType: SensitiveActionType
  ): Promise<StepUpVerification> {
    const tokenHash = this.hashToken(token);

    const stepUpToken = await this.prisma.stepUpToken.findUnique({
      where: { tokenHash },
    });

    if (!stepUpToken) {
      throw new Error('STEP_UP_TOKEN_INVALID');
    }

    if (stepUpToken.used) {
      throw new Error('STEP_UP_TOKEN_ALREADY_USED');
    }

    if (stepUpToken.expiresAt < new Date()) {
      throw new Error('STEP_UP_TOKEN_EXPIRED');
    }

    if (stepUpToken.actionType !== expectedActionType) {
      throw new Error('STEP_UP_TOKEN_ACTION_MISMATCH');
    }

    // Mark token as used
    await this.prisma.stepUpToken.update({
      where: { tokenHash },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'STEP_UP_TOKEN_USED',
      entityType: 'user',
      entityId: stepUpToken.userId,
      userId: stepUpToken.userId,
      afterJson: {
        actionType: stepUpToken.actionType,
      },
    });

    return {
      userId: stepUpToken.userId,
      actionType: stepUpToken.actionType as SensitiveActionType,
      elevatedPermissions: stepUpToken.elevatedPermissions,
    };
  }

  /**
   * Check if user has recent 2FA verification (within grace period)
   */
  async hasRecent2FA(userId: string): Promise<boolean> {
    const gracePeriod = new Date();
    gracePeriod.setMinutes(
      gracePeriod.getMinutes() - this.STEP_UP_GRACE_PERIOD_MINUTES
    );

    // Check for recent successful sensitive actions with 2FA
    const recentAction = await this.prisma.sensitiveActionLog.findFirst({
      where: {
        userId,
        success: true,
        required2fa: true,
        createdAt: { gte: gracePeriod },
      },
      orderBy: { createdAt: 'desc' },
    });

    return !!recentAction;
  }

  /**
   * Check if step-up authentication is required for an action
   */
  async requiresStepUp(
    userId: string,
    actionType: SensitiveActionType
  ): Promise<{
    required: boolean;
    reason?: string;
    hasRecent2FA: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { two_factor_enabled: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const hasRecent2FA = await this.hasRecent2FA(userId);

    // Always require step-up for critical actions
    const criticalActions: SensitiveActionType[] = [
      'password_change',
      'email_change',
      'security_settings',
      'account_deletion',
    ];

    if (criticalActions.includes(actionType)) {
      // If user has 2FA enabled and recent verification, they can skip step-up
      if (user.two_factor_enabled && hasRecent2FA) {
        return {
          required: false,
          reason: 'recent_2fa_verification',
          hasRecent2FA: true,
        };
      }

      return {
        required: true,
        reason: 'critical_action',
        hasRecent2FA: false,
      };
    }

    // For admin actions, always require step-up
    if (actionType === 'admin_action' || actionType === 'role_change') {
      return {
        required: true,
        reason: 'admin_action',
        hasRecent2FA,
      };
    }

    return {
      required: false,
      hasRecent2FA,
    };
  }

  /**
   * Log sensitive action attempt
   */
  async logSensitiveAction(params: {
    userId: string;
    actionType: string;
    actionDetails?: any;
    required2fa: boolean;
    requiredStepUp: boolean;
    verificationMethod?: string;
    success: boolean;
    failureReason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.sensitiveActionLog.create({
      data: {
        userId: params.userId,
        actionType: params.actionType,
        actionDetails: params.actionDetails || undefined,
        required2fa: params.required2fa,
        requiredStepUp: params.requiredStepUp,
        verificationMethod: params.verificationMethod,
        success: params.success,
        failureReason: params.failureReason,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  /**
   * Cleanup expired step-up tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.stepUpToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  /**
   * Get active step-up tokens for a user
   */
  async getActiveStepUpTokens(userId: string): Promise<
    Array<{
      actionType: string;
      expiresAt: Date;
      createdAt: Date;
    }>
  > {
    const tokens = await this.prisma.stepUpToken.findMany({
      where: {
        userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        actionType: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tokens;
  }

  /**
   * Revoke all step-up tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.prisma.stepUpToken.updateMany({
      where: {
        userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Generate a cryptographically secure token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
